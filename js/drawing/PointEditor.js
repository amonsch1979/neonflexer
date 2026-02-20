import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

/**
 * Select and move individual control points on a tube.
 */
export class PointEditor {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.active = false;
    this.tubeManager = null;

    this.selectedHelper = null;
    this.transformControls = null;

    this.onPointMoved = null;    // (tubeModel) => {}
    this.onPointDeleted = null;  // (tubeModel) => {}

    this._onMouseDown = this._onMouseDown.bind(this);
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

    // Track dragging state
    this._isDragging = false;
    this.transformControls.addEventListener('dragging-changed', (e) => {
      this._isDragging = e.value;
      sceneManager.controls.enabled = !e.value;
      // Rebuild on drag end for final update
      if (!e.value && this.selectedHelper) {
        this._onTransformEnd();
      }
    });

    // Throttled live preview during drag (update point position only, defer full rebuild)
    this._dragUpdatePending = false;
    this.transformControls.addEventListener('objectChange', () => {
      this._onTransformChangeLive();
    });
  }

  activate(tubeManager) {
    this.active = true;
    this.tubeManager = tubeManager;
    const canvas = this.sceneManager.canvas;
    canvas.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('keydown', this._onKeyDown);
  }

  deactivate() {
    this.active = false;
    this._deselectPoint();
    const canvas = this.sceneManager.canvas;
    canvas.removeEventListener('mousedown', this._onMouseDown);
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

    // Try to pick tube body for selection
    const bodies = this.tubeManager.getBodyMeshes();
    if (bodies.length > 0) {
      const hits = this.sceneManager.raycastObjects(e.clientX, e.clientY, bodies);
      if (hits.length > 0) {
        const tube = this.tubeManager.getTubeByMesh(hits[0].object);
        if (tube) {
          this.tubeManager.selectTube(tube);
          this._deselectPoint();
        }
        return;
      }
    }

    // Click on nothing: deselect
    this._deselectPoint();
  }

  _selectPoint(helper) {
    this.selectedHelper = helper;
    this.transformControls.attach(helper);
    this.transformControls.visible = true;
    this.transformControls.enabled = true;

    // Constrain to XZ plane by default
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

  _onKeyDown(e) {
    if (!this.active) return;

    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedHelper) {
      e.preventDefault();
      e._handledByPointEditor = true; // flag for App keyboard handler
      const tubeId = this.selectedHelper.userData.tubeId;
      const pointIndex = this.selectedHelper.userData.pointIndex;
      const tube = this.tubeManager.getTubeById(tubeId);
      if (!tube) return;

      // Don't allow deleting below 2 points
      if (tube.controlPoints.length <= 2) return;

      this._deselectPoint();
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
  }

  dispose() {
    this.deactivate();
    this.sceneManager.scene.remove(this.transformControls.getHelper());
    this.transformControls.dispose();
  }
}
