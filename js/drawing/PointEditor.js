import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { CurveBuilder } from './CurveBuilder.js';

/**
 * Select and move individual control points or entire tubes.
 *
 * Modes:
 *   - Click a control point helper → move that single point
 *   - Click a tube body           → move the whole tube
 */
export class PointEditor {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.active = false;
    this.tubeManager = null;

    this.selectedHelper = null;
    this.transformControls = null;

    // Whole-tube move state
    this._movingTube = null;       // TubeModel being moved
    this._tubePivot = null;        // invisible Object3D that TransformControls attaches to
    this._tubeMoveStart = null;    // position at drag start

    // Reference model selection
    this.refModelManager = null;   // set by UIManager
    this.onRefModelSelected = null; // (refModel) => {}
    this.onRefModelShiftSelected = null; // (refModel) => {} — Shift+click multi-select
    this.onDeselect = null;        // () => {} — click on empty space

    this.onPointMoved = null;    // (tubeModel) => {}
    this.onPointDeleted = null;  // (tubeModel) => {}
    this.onPointInserted = null; // (tubeModel) => {}
    this.onTubeMoved = null;     // (tubeModel) => {}
    this.onTubeExtended = null;  // (tubeModel) => {}
    this.onGroupMoveLive = null; // (tubeIds, delta) => {} — live preview for connectors
    this.onBeforeMutate = null;  // () => {} — for undo capture before drag/delete

    this._onPointerDown = this._onMouseDown.bind(this);
    this._onDblClick = this._onDblClick.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);

    // Create transform controls
    this.transformControls = new TransformControls(
      sceneManager.camera,
      sceneManager.canvas
    );
    this.transformControls.setMode('translate');
    this.transformControls.setSize(0.5);
    this.transformControls.visible = false;
    this.transformControls.enabled = false;
    sceneManager.scene.add(this.transformControls.getHelper());

    // Invisible pivot for whole-tube moves
    this._tubePivot = new THREE.Object3D();
    this._tubePivot.name = '__tube_pivot';
    sceneManager.scene.add(this._tubePivot);

    // Track dragging state
    this._isDragging = false;
    this.transformControls.addEventListener('dragging-changed', (e) => {
      this._isDragging = e.value;
      sceneManager.controls.enabled = !e.value;
      // Capture undo state on drag start
      if (e.value && this.onBeforeMutate) {
        this.onBeforeMutate();
      }
      // Rebuild on drag end for final update
      if (!e.value) {
        if (this._movingTube) {
          this._onTubeMoveEnd();
        } else if (this.selectedHelper) {
          this._onTransformEnd();
        }
      }
    });

    // Live preview during drag
    this.transformControls.addEventListener('objectChange', () => {
      if (this._movingTube) {
        this._onTubeMoveLive();
      } else {
        this._onTransformChangeLive();
      }
      this.sceneManager.requestRender();
    });
  }

  activate(tubeManager) {
    this.active = true;
    this.tubeManager = tubeManager;
    const canvas = this.sceneManager.canvas;
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('dblclick', this._onDblClick);
    document.addEventListener('keydown', this._onKeyDown);
  }

  deactivate() {
    this.active = false;
    this._deselectAll();
    const canvas = this.sceneManager.canvas;
    canvas.removeEventListener('pointerdown', this._onPointerDown);
    canvas.removeEventListener('dblclick', this._onDblClick);
    document.removeEventListener('keydown', this._onKeyDown);
  }

  _onMouseDown(e) {
    if (!this.active || !this.tubeManager) return;
    if (e.button !== 0) return;
    // Don't interfere while TransformControls is dragging
    if (this._isDragging) return;

    // First try to pick control point helpers
    const helpers = this.tubeManager.getControlPointHelpers();
    if (helpers.length > 0) {
      const hits = this.sceneManager.raycastObjects(e.clientX, e.clientY, helpers);
      if (hits.length > 0) {
        const helper = hits[0].object;
        this._selectPoint(helper);
        return;
      }
    }

    // Try to pick tube body for selection + whole-tube move
    const bodies = this.tubeManager.getBodyMeshes();
    if (bodies.length > 0) {
      const hits = this.sceneManager.raycastObjects(e.clientX, e.clientY, bodies);
      if (hits.length > 0) {
        const tube = this.tubeManager.getTubeByMesh(hits[0].object);
        if (tube) {
          this.tubeManager.selectTube(tube);
          this._selectTubeForMove(tube);
        }
        return;
      }
    }

    // Try to pick reference model
    if (this.refModelManager) {
      const refMeshes = this.refModelManager.getRefModelMeshes();
      if (refMeshes.length > 0) {
        const hits = this.sceneManager.raycastObjects(e.clientX, e.clientY, refMeshes);
        if (hits.length > 0) {
          const refModel = this.refModelManager.getModelByMesh(hits[0].object);
          if (refModel) {
            this._deselectAll(false); // deselect points/tubes but not ref models
            // Shift+click → multi-select, normal click → single select
            if (e.shiftKey && this.onRefModelShiftSelected) {
              this.onRefModelShiftSelected(refModel);
            } else if (this.onRefModelSelected) {
              this.onRefModelSelected(refModel);
            }
            return;
          }
        }
      }
    }

    // Click on nothing: deselect
    this._deselectAll();
  }

  // ── Single control point ──────────────────────────────

  _selectPoint(helper) {
    this._clearTubeMove();
    this.selectedHelper = helper;
    this.transformControls.attach(helper);
    this.transformControls.visible = true;
    this.transformControls.enabled = true;
    this.transformControls.showY = true;
  }

  _deselectPoint() {
    if (this.selectedHelper) {
      this.transformControls.detach();
      this.transformControls.visible = false;
      this.transformControls.enabled = false;
      this.selectedHelper = null;
    }
  }

  /** Live update during drag: only update control point data, defer full rebuild */
  _onTransformChangeLive() {
    if (!this.selectedHelper || !this.tubeManager) return;

    const tubeId = this.selectedHelper.userData.tubeId;
    const pointIndex = this.selectedHelper.userData.pointIndex;
    const tube = this.tubeManager.getTubeById(tubeId);
    if (!tube) return;

    // Just update the data model point (no geometry rebuild during drag)
    tube.controlPoints[pointIndex].copy(this.selectedHelper.position);
  }

  /** Full rebuild when drag ends */
  _onTransformEnd() {
    if (!this.selectedHelper || !this.tubeManager) return;

    const tubeId = this.selectedHelper.userData.tubeId;
    const pointIndex = this.selectedHelper.userData.pointIndex;
    const tube = this.tubeManager.getTubeById(tubeId);
    if (!tube) return;

    // Update point and fully rebuild geometry
    tube.updatePoint(pointIndex, this.selectedHelper.position);
    this.tubeManager.updateTube(tube);

    // Re-find our helper after rebuild (it was disposed and recreated)
    const newHelpers = tube.controlPointHelpers;
    if (newHelpers[pointIndex]) {
      this.selectedHelper = newHelpers[pointIndex];
      this.transformControls.attach(this.selectedHelper);
    }

    if (this.onPointMoved) this.onPointMoved(tube);
  }

  // ── Whole tube move ───────────────────────────────────

  _selectTubeForMove(tube) {
    this._deselectPoint();
    this._movingTube = tube;

    // Place pivot at the tube's centroid
    const center = this._getTubeCentroid(tube);
    this._tubePivot.position.copy(center);
    this._tubeMoveStart = center.clone();

    this.transformControls.attach(this._tubePivot);
    this.transformControls.visible = true;
    this.transformControls.enabled = true;
    this.transformControls.showY = true;
  }

  _getTubeCentroid(tube) {
    const center = new THREE.Vector3();
    for (const pt of tube.controlPoints) {
      center.add(pt);
    }
    center.divideScalar(tube.controlPoints.length);
    return center;
  }

  /** Live preview: move the tube group in the scene (cheap) */
  _onTubeMoveLive() {
    if (!this._movingTube || !this._movingTube.group) return;
    const delta = this._tubePivot.position.clone().sub(this._tubeMoveStart);
    // Move all group members visually
    const members = this.tubeManager.getGroupMembers(this._movingTube);
    for (const member of members) {
      if (member.group) member.group.position.copy(delta);
    }
    // Move connectors visually during drag
    if (this.onGroupMoveLive) {
      const tubeIds = members.map(m => m.id);
      this.onGroupMoveLive(tubeIds, delta);
    }
  }

  /** On drag end: apply the delta to all control points and rebuild */
  _onTubeMoveEnd() {
    const tube = this._movingTube;
    if (!tube) return;

    const delta = this._tubePivot.position.clone().sub(this._tubeMoveStart);

    // Reset group position on all members (the rebuild will place geometry at the new points)
    const members = this.tubeManager.getGroupMembers(tube);
    for (const member of members) {
      if (member.group) member.group.position.set(0, 0, 0);
    }

    if (delta.lengthSq() > 0.000001) {
      this.tubeManager.moveGroup(tube, delta);
    }

    // Re-place pivot at new centroid for further moves
    const newCenter = this._getTubeCentroid(tube);
    this._tubePivot.position.copy(newCenter);
    this._tubeMoveStart = newCenter.clone();

    if (this.onTubeMoved) this.onTubeMoved(tube);
  }

  _clearTubeMove() {
    if (this._movingTube) {
      // Reset any partial group offset on all members
      const members = this.tubeManager ? this.tubeManager.getGroupMembers(this._movingTube) : [this._movingTube];
      for (const member of members) {
        if (member.group) member.group.position.set(0, 0, 0);
      }
      this._movingTube = null;
      this._tubeMoveStart = null;
    }
  }

  // ── Double-click to insert point on tube body ────────

  _onDblClick(e) {
    if (!this.active || !this.tubeManager) return;
    if (e.button !== 0) return;

    const bodies = this.tubeManager.getBodyMeshes();
    if (bodies.length === 0) return;

    const hits = this.sceneManager.raycastObjects(e.clientX, e.clientY, bodies);
    if (hits.length === 0) return;

    const tube = this.tubeManager.getTubeByMesh(hits[0].object);
    if (!tube || !tube.isValid) return;

    const curve = CurveBuilder.build(tube.controlPoints, tube.tension, tube.closed);
    if (!curve) return;

    const t = CurveBuilder.findNearestT(curve, hits[0].point);

    if (this.onBeforeMutate) this.onBeforeMutate();
    const newIndex = this.tubeManager.insertPointOnCurve(tube, t);
    if (newIndex >= 0) {
      // Select the newly inserted point
      const helper = tube.controlPointHelpers[newIndex];
      if (helper) this._selectPoint(helper);
      if (this.onPointInserted) this.onPointInserted(tube);
    }
  }

  // ── Deselect all ──────────────────────────────────────

  _deselectAll(includeRefModels = true) {
    this._deselectPoint();
    this._clearTubeMove();
    this.transformControls.detach();
    this.transformControls.visible = false;
    this.transformControls.enabled = false;
    if (includeRefModels && this.onDeselect) this.onDeselect();
  }

  // ── Keyboard ──────────────────────────────────────────

  _onKeyDown(e) {
    if (!this.active) return;

    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedHelper) {
      e.preventDefault();
      e.stopImmediatePropagation(); // prevent App keyboard handler from also firing
      const tubeId = this.selectedHelper.userData.tubeId;
      const pointIndex = this.selectedHelper.userData.pointIndex;
      const tube = this.tubeManager.getTubeById(tubeId);
      if (!tube) return;

      // Don't allow deleting below 2 points
      if (tube.controlPoints.length <= 2) return;

      if (this.onBeforeMutate) this.onBeforeMutate();
      this._deselectAll();
      tube.deletePoint(pointIndex);
      this.tubeManager.updateTube(tube);

      if (this.onPointDeleted) this.onPointDeleted(tube);
    }

    // Toggle height mode with H key
    if (e.key === 'h' || e.key === 'H') {
      if (this.transformControls.visible) {
        this.transformControls.showY = !this.transformControls.showY;
      }
    }

    // Extend tube with E key (only at first or last control point)
    if ((e.key === 'e' || e.key === 'E') && this.selectedHelper) {
      const tubeId = this.selectedHelper.userData.tubeId;
      const pointIndex = this.selectedHelper.userData.pointIndex;
      const tube = this.tubeManager.getTubeById(tubeId);
      if (!tube || tube.closed) return;

      const isFirst = pointIndex === 0;
      const isLast = pointIndex === tube.controlPoints.length - 1;
      if (!isFirst && !isLast) return;

      e.preventDefault();
      if (this.onBeforeMutate) this.onBeforeMutate();

      const end = isFirst ? 'start' : 'end';
      const newIndex = this.tubeManager.extendTube(tube, end, 0.1);
      if (newIndex >= 0) {
        const helper = tube.controlPointHelpers[newIndex];
        if (helper) this._selectPoint(helper);
        if (this.onTubeExtended) this.onTubeExtended(tube);
      }
    }
  }

  dispose() {
    this.deactivate();
    this.sceneManager.scene.remove(this.transformControls.getHelper());
    this.sceneManager.scene.remove(this._tubePivot);
    this.transformControls.dispose();
  }
}
