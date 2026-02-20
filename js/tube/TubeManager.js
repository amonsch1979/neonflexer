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

    // Multi-select & grouping
    this.selectedTubeIds = new Set();
    this.nextGroupId = 1;

    // Root group for all tubes
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'NeonFlexDesign';
    this.scene.add(this.rootGroup);

    // Callbacks
    this.onTubeCreated = null;    // (tubeModel) => {}
    this.onTubeUpdated = null;    // (tubeModel) => {}
    this.onTubeDeleted = null;    // (tubeModel) => {}
    this.onSelectionChanged = null; // (tubeModel|null) => {}
    this.onGroupMoved = null;     // (tubeIds, delta) => {}
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
    this.selectedTubeIds.delete(tube.id);

    // Remember groupId before removing
    const gid = tube.groupId;

    this._disposeTubeMesh(tube);
    this.tubes.splice(idx, 1);

    // Auto-ungroup if only 1 member left
    if (gid) {
      const remaining = this.tubes.filter(t => t.groupId === gid);
      if (remaining.length <= 1) {
        for (const t of remaining) t.groupId = null;
      }
    }

    if (this.onTubeDeleted) this.onTubeDeleted(tube);
    if (this.selectedTube === null && this.tubes.length > 0) {
      this.selectTube(this.tubes[Math.min(idx, this.tubes.length - 1)]);
    } else if (this.tubes.length === 0) {
      if (this.onSelectionChanged) this.onSelectionChanged(null);
    }
  }

  /**
   * Select a tube (single-select: clears multi-selection).
   */
  selectTube(tube) {
    this.selectTubeSingle(tube);
  }

  /**
   * Single-select: clear multi-select, select one tube.
   */
  selectTubeSingle(tube) {
    if (this.selectedTube) {
      this.selectedTube.selected = false;
    }
    this.selectedTubeIds.clear();
    this.selectedTube = tube;
    if (tube) {
      tube.selected = true;
      this.selectedTubeIds.add(tube.id);
    }
    if (this.onSelectionChanged) this.onSelectionChanged(tube);
  }

  /**
   * Toggle a tube in/out of multi-selection (Shift/Ctrl+click in list).
   * Won't remove the last tube — always keeps at least one selected.
   */
  toggleMultiSelect(tube) {
    if (!tube) return;
    if (this.selectedTubeIds.has(tube.id)) {
      // Only remove if there are 2+ selected (never deselect the last one)
      if (this.selectedTubeIds.size > 1) {
        this.selectedTubeIds.delete(tube.id);
        tube.selected = false;
        // Switch primary to another tube in the set
        const firstId = this.selectedTubeIds.values().next().value;
        this.selectedTube = this.getTubeById(firstId);
        if (this.selectedTube) this.selectedTube.selected = true;
      }
    } else {
      // Add to multi-selection
      this.selectedTubeIds.add(tube.id);
      if (this.selectedTube) this.selectedTube.selected = false;
      this.selectedTube = tube;
      tube.selected = true;
    }
    if (this.onSelectionChanged) this.onSelectionChanged(this.selectedTube);
  }

  /**
   * Assign a new groupId to all multi-selected tubes.
   * Requires >= 2 tubes in multi-selection.
   * @returns {number|null} the new groupId, or null if not enough tubes
   */
  groupSelected() {
    if (this.selectedTubeIds.size < 2) return null;
    const gid = this.nextGroupId++;
    for (const id of this.selectedTubeIds) {
      const tube = this.getTubeById(id);
      if (tube) tube.groupId = gid;
    }
    return gid;
  }

  /**
   * Clear groupId for all tubes in the selected tubes' groups.
   * @returns {number} count of ungrouped tubes
   */
  ungroupSelected() {
    const groupIds = new Set();
    for (const id of this.selectedTubeIds) {
      const tube = this.getTubeById(id);
      if (tube && tube.groupId) groupIds.add(tube.groupId);
    }
    let count = 0;
    for (const tube of this.tubes) {
      if (tube.groupId && groupIds.has(tube.groupId)) {
        tube.groupId = null;
        count++;
      }
    }
    return count;
  }

  /**
   * Get all tubes with the same groupId (or just [tube] if ungrouped).
   */
  getGroupMembers(tube) {
    if (!tube || !tube.groupId) return tube ? [tube] : [];
    return this.tubes.filter(t => t.groupId === tube.groupId);
  }

  /**
   * Move all group members' control points by delta, then rebuild.
   */
  moveGroup(tube, delta) {
    const members = this.getGroupMembers(tube);
    const movedIds = [];
    for (const member of members) {
      for (const pt of member.controlPoints) {
        pt.add(delta);
      }
      this._disposeTubeMesh(member);
      this._buildTubeMesh(member);
      movedIds.push(member.id);
    }
    if (this.onTubeUpdated) this.onTubeUpdated(tube);
    if (this.onGroupMoved && movedIds.length > 1) {
      this.onGroupMoved(movedIds, delta);
    }
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
   * Split an open tube at curve parameter t into two new tubes.
   * Deletes the original and returns [tubeA, tubeB].
   */
  splitTube(tube, t) {
    if (tube.closed) {
      // Should not be called on closed tubes — use openTubeAt first
      return null;
    }

    const curve = CurveBuilder.build(tube.controlPoints, tube.tension, tube.closed);
    if (!curve) return null;

    const cutPoint = curve.getPointAt(t);

    // Find which segment the cut falls between
    const segIndex = this._findSegmentIndex(curve, tube.controlPoints, t);

    // Build control points for two halves
    const cpA = [];
    for (let i = 0; i <= segIndex; i++) {
      cpA.push(tube.controlPoints[i].clone());
    }
    cpA.push(cutPoint.clone());

    const cpB = [cutPoint.clone()];
    for (let i = segIndex + 1; i < tube.controlPoints.length; i++) {
      cpB.push(tube.controlPoints[i].clone());
    }

    // Inherit all properties from original
    const baseOpts = {
      profile: tube.profile,
      diameterMm: tube.diameterMm,
      widthMm: tube.widthMm,
      heightMm: tube.heightMm,
      wallThicknessMm: tube.wallThicknessMm,
      materialPreset: tube.materialPreset,
      pixelMode: tube.pixelMode,
      pixelsPerMeter: tube.pixelsPerMeter,
      startPixel: tube.startPixel,
      pixelColor: tube.pixelColor,
      pixelEmissive: tube.pixelEmissive,
      dmxChannelsPerPixel: tube.dmxChannelsPerPixel,
      tension: tube.tension,
      closed: false,
      color: tube.color,
    };

    const origName = tube.name;
    const origAddr = tube.dmxAddress;
    const origUniverse = tube.dmxUniverse;

    // Delete the original tube
    this.deleteTube(tube);

    // Create the two new tubes
    const tubeA = this.createTube(cpA, {
      ...baseOpts,
      name: origName + ' A',
      dmxAddress: origAddr,
      dmxUniverse: origUniverse,
    });

    const tubeB = this.createTube(cpB, {
      ...baseOpts,
      name: origName + ' B',
      dmxAddress: 1,
      dmxUniverse: 1,
    });

    return [tubeA, tubeB];
  }

  /**
   * Open a closed tube at curve parameter t.
   * Rearranges control points so the cut becomes the new start/end.
   */
  openTubeAt(tube, t) {
    if (!tube.closed) return;

    const curve = CurveBuilder.build(tube.controlPoints, tube.tension, tube.closed);
    if (!curve) return;

    const cutPoint = curve.getPointAt(t);
    const segIndex = this._findSegmentIndex(curve, tube.controlPoints, t);

    // Rearrange: [cutPoint, cp[segIndex+1], ..., cp[n-1], cp[0], ..., cp[segIndex], cutPoint]
    const newCp = [cutPoint.clone()];
    const n = tube.controlPoints.length;
    for (let i = 1; i <= n; i++) {
      newCp.push(tube.controlPoints[(segIndex + i) % n].clone());
    }
    newCp.push(cutPoint.clone());

    tube.controlPoints = newCp;
    tube.closed = false;

    this.updateTube(tube);
  }

  /**
   * Find which control point segment a curve parameter t falls between.
   * Returns the index i such that t is between cp[i] and cp[i+1].
   * For closed curves: N segments (0..N-1), for open: N-1 segments (0..N-2).
   */
  _findSegmentIndex(curve, controlPoints, t) {
    const n = controlPoints.length;
    const totalSegs = curve.closed ? n : n - 1;

    // Simple approach: t maps linearly to segments
    const rawSeg = t * totalSegs;
    let seg = Math.floor(rawSeg);

    // Clamp to valid range
    if (curve.closed) {
      seg = Math.min(seg, n - 1);
    } else {
      seg = Math.min(seg, n - 2);
    }
    return Math.max(0, seg);
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
    this.selectedTubeIds.clear();
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
    let maxGroupId = 0;
    for (const tubeData of (data.tubes || [])) {
      const tube = TubeModel.fromJSON(tubeData);
      if (tube.id > maxId) maxId = tube.id;
      if (tube.groupId && tube.groupId >= maxGroupId) maxGroupId = tube.groupId;
      this.tubes.push(tube);
      this._buildTubeMesh(tube);
      if (this.onTubeCreated) this.onTubeCreated(tube);
    }

    TubeModel.resetIdCounter(maxId);
    this.nextGroupId = maxGroupId + 1;

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
