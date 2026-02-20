import * as THREE from 'three';
import { TubeModel } from './TubeModel.js';
import { TubeGeometryBuilder } from './TubeGeometryBuilder.js';
import { TubeMaterialFactory } from './TubeMaterialFactory.js';
import { PixelDistributor } from './PixelDistributor.js';
import { CurveBuilder } from '../drawing/CurveBuilder.js';

/**
 * Manages the collection of tubes: create, update, delete, selection.
 */
export class TubeManager {
  constructor(scene) {
    this.scene = scene;
    this.tubes = [];
    this.selectedTube = null;

    // Root group for all tubes
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'NeonFlexDesign';
    this.scene.add(this.rootGroup);

    // Callbacks
    this.onTubeCreated = null;    // (tubeModel) => {}
    this.onTubeUpdated = null;    // (tubeModel) => {}
    this.onTubeDeleted = null;    // (tubeModel) => {}
    this.onSelectionChanged = null; // (tubeModel|null) => {}
  }

  /**
   * Create a new tube from control points.
   * @param {THREE.Vector3[]} points
   * @param {object} options - override default TubeModel options
   * @returns {TubeModel}
   */
  createTube(points, options = {}) {
    const tube = new TubeModel({ ...options, controlPoints: points });
    this.tubes.push(tube);
    this._buildTubeMesh(tube);
    this.selectTube(tube);
    if (this.onTubeCreated) this.onTubeCreated(tube);
    return tube;
  }

  /**
   * Rebuild a tube's 3D representation after property changes.
   */
  updateTube(tube) {
    this._disposeTubeMesh(tube);
    this._buildTubeMesh(tube);
    if (this.onTubeUpdated) this.onTubeUpdated(tube);
  }

  /**
   * Delete a tube.
   */
  deleteTube(tube) {
    const idx = this.tubes.indexOf(tube);
    if (idx === -1) return;

    if (this.selectedTube === tube) {
      this.selectedTube = null;
    }

    this._disposeTubeMesh(tube);
    this.tubes.splice(idx, 1);

    if (this.onTubeDeleted) this.onTubeDeleted(tube);
    if (this.selectedTube === null && this.tubes.length > 0) {
      this.selectTube(this.tubes[Math.min(idx, this.tubes.length - 1)]);
    } else if (this.tubes.length === 0) {
      if (this.onSelectionChanged) this.onSelectionChanged(null);
    }
  }

  /**
   * Select a tube.
   */
  selectTube(tube) {
    if (this.selectedTube) {
      this.selectedTube.selected = false;
    }
    this.selectedTube = tube;
    if (tube) {
      tube.selected = true;
    }
    if (this.onSelectionChanged) this.onSelectionChanged(tube);
  }

  /**
   * Duplicate an existing tube with a small offset.
   * @param {TubeModel} sourceTube
   * @param {THREE.Vector3} [offset] - optional position offset (default 0.1m on X)
   * @returns {TubeModel}
   */
  duplicateTube(sourceTube, offset) {
    const clone = sourceTube.clone();
    const off = offset || new THREE.Vector3(0.1, 0, 0);
    for (const pt of clone.controlPoints) {
      pt.add(off);
    }
    this.tubes.push(clone);
    this._buildTubeMesh(clone);
    this.selectTube(clone);
    if (this.onTubeCreated) this.onTubeCreated(clone);
    return clone;
  }

  /**
   * Move all control points of a tube by a delta vector, then rebuild.
   * @param {TubeModel} tube
   * @param {THREE.Vector3} delta
   */
  moveTube(tube, delta) {
    for (const pt of tube.controlPoints) {
      pt.add(delta);
    }
    this._disposeTubeMesh(tube);
    this._buildTubeMesh(tube);
    if (this.onTubeUpdated) this.onTubeUpdated(tube);
  }

  /**
   * Get tube by ID.
   */
  getTubeById(id) {
    return this.tubes.find(t => t.id === id) || null;
  }

  /**
   * Find which tube a mesh belongs to.
   */
  getTubeByMesh(mesh) {
    for (const tube of this.tubes) {
      if (!tube.group) continue;
      let found = false;
      tube.group.traverse(child => {
        if (child === mesh) found = true;
      });
      if (found) return tube;
    }
    return null;
  }

  /**
   * Toggle tube visibility.
   */
  toggleVisibility(tube) {
    tube.visible = !tube.visible;
    if (tube.group) {
      tube.group.visible = tube.visible;
    }
  }

  /**
   * Build the 3D mesh for a tube.
   */
  _buildTubeMesh(tube) {
    if (!tube.isValid) return;

    const curve = CurveBuilder.build(tube.controlPoints, tube.tension, tube.closed);
    if (!curve) return;

    // Create group
    const group = new THREE.Group();
    group.name = `Tube_${tube.id}`;

    // Body mesh
    const geometry = TubeGeometryBuilder.build(curve, tube);
    const material = TubeMaterialFactory.createTubeMaterial(tube.materialPreset);
    const bodyMesh = new THREE.Mesh(geometry, material);
    bodyMesh.name = `Tube_${tube.id}_Body`;
    group.add(bodyMesh);
    tube.bodyMesh = bodyMesh;

    // Pixel group (skip for uv-mapped mode — no viewport spheres)
    if (tube.pixelMode === 'uv-mapped') {
      tube.pixelGroup = null;
    } else {
      const pixelGroup = PixelDistributor.distribute(curve, tube);
      group.add(pixelGroup);
      tube.pixelGroup = pixelGroup;
    }

    // Control point helpers (small spheres, not exported)
    this._createControlPointHelpers(tube, group);

    group.visible = tube.visible;
    tube.group = group;
    this.rootGroup.add(group);
  }

  /**
   * Create small helper spheres at control points (for editing).
   */
  _createControlPointHelpers(tube, group) {
    tube.controlPointHelpers = [];
    const helperGeo = new THREE.SphereGeometry(0.004, 8, 8);
    const helperMat = new THREE.MeshBasicMaterial({
      color: tube.color,
      transparent: true,
      opacity: 0.7,
    });

    for (let i = 0; i < tube.controlPoints.length; i++) {
      const helper = new THREE.Mesh(helperGeo, helperMat);
      helper.position.copy(tube.controlPoints[i]);
      helper.name = `__cp_helper_${tube.id}_${i}`;
      helper.userData.isControlPoint = true;
      helper.userData.tubeId = tube.id;
      helper.userData.pointIndex = i;
      group.add(helper);
      tube.controlPointHelpers.push(helper);
    }
  }

  /**
   * Dispose of a tube's 3D objects.
   */
  _disposeTubeMesh(tube) {
    if (!tube.group) return;

    tube.group.traverse(child => {
      if (child.isMesh) {
        child.geometry?.dispose();
        child.material?.dispose();
      }
    });

    this.rootGroup.remove(tube.group);
    tube.group = null;
    tube.bodyMesh = null;
    tube.pixelGroup = null;
    tube.controlPointHelpers = [];
  }

  /**
   * Get all body meshes (for raycasting selection).
   */
  getBodyMeshes() {
    return this.tubes
      .filter(t => t.bodyMesh && t.visible)
      .map(t => t.bodyMesh);
  }

  /**
   * Get all control point helpers for all tubes.
   */
  getControlPointHelpers() {
    const helpers = [];
    for (const tube of this.tubes) {
      helpers.push(...tube.controlPointHelpers);
    }
    return helpers;
  }

  /**
   * Remove all tubes from the scene and reset state.
   */
  clearAll() {
    for (const tube of this.tubes) {
      this._disposeTubeMesh(tube);
    }
    this.tubes = [];
    this.selectedTube = null;
    if (this.onSelectionChanged) this.onSelectionChanged(null);
  }

  /**
   * Serialize the current project to a plain object.
   */
  saveProject(sceneState) {
    return {
      format: 'neonflexer',
      version: 1,
      savedAt: new Date().toISOString(),
      scene: sceneState,
      tubes: this.tubes.map(t => t.toJSON()),
    };
  }

  /**
   * Load a project from a plain object, replacing all current tubes.
   * @returns {{ gridSizeM: number, currentPlane: string }} scene state to restore
   */
  loadProject(data) {
    if (!data || data.format !== 'neonflexer') {
      throw new Error('Not a valid .neon project file');
    }

    this.clearAll();

    let maxId = 0;
    for (const tubeData of (data.tubes || [])) {
      const tube = TubeModel.fromJSON(tubeData);
      if (tube.id > maxId) maxId = tube.id;
      this.tubes.push(tube);
      this._buildTubeMesh(tube);
      if (this.onTubeCreated) this.onTubeCreated(tube);
    }

    TubeModel.resetIdCounter(maxId);

    if (this.tubes.length > 0) {
      this.selectTube(this.tubes[0]);
    }

    return data.scene || {};
  }

  /**
   * Dispose of all tubes.
   */
  dispose() {
    for (const tube of this.tubes) {
      this._disposeTubeMesh(tube);
    }
    this.tubes = [];
    this.selectedTube = null;
  }
}
