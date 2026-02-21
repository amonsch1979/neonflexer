import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { TDSLoader } from 'three/addons/loaders/TDSLoader.js';
import { ReferenceModel } from './ReferenceModel.js';

/**
 * Manages reference 3D models (load, add, remove, select).
 * These are display-only guides — not exported with MVR.
 */
export class ReferenceModelManager {
  constructor(scene) {
    this.scene = scene;
    this.models = [];
    this.selectedModel = null;

    // Multi-selection
    this.selectedModelIds = new Set();

    // Root group for all ref models
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'ReferenceModels';
    this.scene.add(this.rootGroup);

    // Loaders
    this._gltfLoader = new GLTFLoader();
    this._objLoader = new OBJLoader();
    this._tdsLoader = new TDSLoader();

    // 3D selection highlight helpers
    this._selectionHelpers = new Map(); // id → Box3Helper

    // Callbacks
    this.onModelAdded = null;     // (refModel) => {}
    this.onModelRemoved = null;   // (refModel) => {}
    this.onModelUpdated = null;   // (refModel) => {}
    this.onSelectionChanged = null; // (refModel|null) => {}
    this.onMultiSelectionChanged = null; // (selectedModelIds: Set) => {}

    // Progress callback for granular loading updates
    this.onProgress = null; // (pct: number, msg: string) => {}
  }

  /**
   * Load a file and add it as a reference model.
   * @param {File} file
   * @returns {Promise<ReferenceModel>}
   */
  async loadFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const name = file.name.replace(/\.[^.]+$/, '');

    console.log(`[RefModel] Loading: ${file.name}`);

    this._emitProgress(5, 'Reading file...');

    let group;

    if (ext === 'glb' || ext === 'gltf') {
      group = await this._loadGLTF(file);
    } else if (ext === 'obj') {
      group = await this._loadOBJ(file);
    } else if (ext === '3ds') {
      group = await this._load3DS(file);
    } else if (ext === 'mvr') {
      group = await this._loadMVR(file);
    } else {
      throw new Error(`Unsupported format: .${ext}`);
    }

    this._emitProgress(30, 'Processing model...');
    await this._yieldToUI();

    // Single-pass: auto-scale + material pooling combined
    this._processLoadedGroup(group, ext);

    this._emitProgress(50, 'Splitting parts...');

    // Check for multi-object models — split into individual ref models
    const parts = this._splitMultiObject(group, name);

    this._emitProgress(60, 'Adding to scene...');

    if (parts.length > 1) {
      console.log(`[RefModel] Splitting "${name}" into ${parts.length} parts`);
      const models = [];
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const refModel = new ReferenceModel({ name: part.name });
        refModel.group = part.group;
        refModel.group.name = `Ref_${refModel.id}_${part.name}`;
        refModel.needsReimport = false;
        // Combined freeze + apply in single traversal
        this._initRefModel(refModel);
        this.addModel(refModel);
        models.push(refModel);

        // Yield periodically for large splits
        if (i % 20 === 0 && i > 0) {
          const pct = 60 + (i / parts.length) * 25;
          this._emitProgress(pct, `Processing part ${i + 1}/${parts.length}...`);
          await this._yieldToUI();
        }
      }
      this._emitProgress(85, 'Added to scene...');
      // Select the first part
      this.selectModel(models[0]);
      return models[0];
    }

    // Single object
    const refModel = new ReferenceModel({ name });
    refModel.group = group;
    refModel.group.name = `Ref_${refModel.id}_${name}`;
    refModel.needsReimport = false;
    this._initRefModel(refModel);

    this._emitProgress(85, 'Added to scene...');
    this.addModel(refModel);
    return refModel;
  }

  /**
   * Split a loaded group into individual parts if it contains multiple
   * meaningful children (Groups or Meshes). Returns array of {name, group}.
   * If the model is a single object, returns a single-element array.
   */
  _splitMultiObject(group, baseName) {
    // Collect meaningful children (skip lights, cameras, empty groups)
    const meaningful = [];
    for (const child of group.children) {
      if (child.isLight || child.isCamera) continue;
      // True early-exit check for mesh presence
      if (this._hasMesh(child)) meaningful.push(child);
    }

    // If only 0 or 1 meaningful children, don't split
    if (meaningful.length <= 1) return [{ name: baseName, group }];

    // Split: detach each child into its own group, preserving transforms
    const parts = [];
    for (let i = 0; i < meaningful.length; i++) {
      const child = meaningful[i];
      // Use the child's name if it has one, otherwise generate one
      const childName = child.name && child.name.length > 0
        ? child.name
        : `${baseName}_part${i + 1}`;

      // Wrap in a new group so the child keeps its local transform
      const wrapper = new THREE.Group();

      // If the parent group had a scale applied (e.g. auto-scale mm→m),
      // bake it into the wrapper so each part stays correctly sized
      wrapper.scale.copy(group.scale);
      wrapper.position.copy(group.position);
      wrapper.quaternion.copy(group.quaternion);

      // Detach child from original parent — reset parent transforms since
      // we copied them to the wrapper
      wrapper.add(child);

      parts.push({ name: childName, group: wrapper });
    }

    // Clean up the now-empty original group
    group.scale.set(1, 1, 1);

    return parts;
  }

  /**
   * Single-pass processing: auto-scale detection + material pooling combined.
   * Replaces separate _autoScale + _optimizeMaterials with ONE traversal.
   */
  _processLoadedGroup(group, ext) {
    // MVR handles its own scaling via XML placement — just pool materials
    if (ext === 'mvr') {
      this._poolMaterials(group);
      return;
    }

    // 3DS files are always in millimeters per spec
    if (ext === '3ds') {
      group.scale.multiplyScalar(0.001);
      this._poolMaterials(group);
      return;
    }

    // For GLB/OBJ: single traversal to compute bounding box AND pool materials
    const materialPool = new Map();
    const _min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const _max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const _v = new THREE.Vector3();

    // Ensure world matrices are up to date for bbox computation
    group.updateMatrixWorld(true);

    group.traverse(child => {
      if (!child.isMesh) return;

      // --- Material pooling ---
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        const optimized = mats.map(mat => {
          const r = mat.color ? mat.color.getHexString() : '000';
          const rough = mat.roughness !== undefined ? mat.roughness.toFixed(2) : '1';
          const metal = mat.metalness !== undefined ? mat.metalness.toFixed(2) : '0';
          const key = `${mat.type}_${r}_${rough}_${metal}`;

          if (materialPool.has(key)) return materialPool.get(key);

          mat.envMapIntensity = 0.3;
          if (mat.roughness !== undefined) mat.roughness = Math.max(mat.roughness, 0.5);
          mat.needsUpdate = true;
          materialPool.set(key, mat);
          return mat;
        });
        child.material = optimized.length === 1 ? optimized[0] : optimized;
      }
      child.frustumCulled = true;

      // --- Bounding box expansion (replaces Box3.setFromObject) ---
      const geo = child.geometry;
      if (geo) {
        if (!geo.boundingBox) geo.computeBoundingBox();
        const bb = geo.boundingBox;
        // Transform 8 bounding box corners to world space
        for (let i = 0; i < 8; i++) {
          _v.set(
            i & 1 ? bb.max.x : bb.min.x,
            i & 2 ? bb.max.y : bb.min.y,
            i & 4 ? bb.max.z : bb.min.z
          );
          _v.applyMatrix4(child.matrixWorld);
          _min.min(_v);
          _max.max(_v);
        }
      }
    });

    // Auto-scale: if larger than 50 units, assume mm → convert to m
    if (_min.x < Infinity) {
      const maxDim = Math.max(_max.x - _min.x, _max.y - _min.y, _max.z - _min.z);
      if (maxDim > 50) {
        group.scale.multiplyScalar(0.001);
      }
    }

    if (materialPool.size > 0) {
      console.log(`[Perf] Material pool: ${materialPool.size} unique materials`);
    }
  }

  /**
   * Material pooling only (for MVR which handles its own scaling).
   */
  _poolMaterials(group) {
    const materialPool = new Map();
    group.traverse(child => {
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      const optimized = mats.map(mat => {
        const r = mat.color ? mat.color.getHexString() : '000';
        const rough = mat.roughness !== undefined ? mat.roughness.toFixed(2) : '1';
        const metal = mat.metalness !== undefined ? mat.metalness.toFixed(2) : '0';
        const key = `${mat.type}_${r}_${rough}_${metal}`;
        if (materialPool.has(key)) return materialPool.get(key);
        mat.envMapIntensity = 0.3;
        if (mat.roughness !== undefined) mat.roughness = Math.max(mat.roughness, 0.5);
        mat.needsUpdate = true;
        materialPool.set(key, mat);
        return mat;
      });
      child.material = optimized.length === 1 ? optimized[0] : optimized;
      child.frustumCulled = true;
    });
  }

  /**
   * Initialize a ref model for the scene: freeze matrices + apply visual props
   * in a SINGLE traversal. Replaces separate _freezeMatrices + applyAll.
   */
  _initRefModel(refModel) {
    if (!refModel.group) return;

    // Apply transform on group (no traversal needed)
    refModel.applyTransform();

    // Single traversal: freeze + opacity + wireframe + polygonOffset
    const opacity = refModel.opacity;
    const transparent = opacity < 1;
    const wireframe = refModel.wireframe;

    refModel.group.traverse(child => {
      if (!child.isMesh) return;

      // Freeze matrix
      child.matrixAutoUpdate = false;
      child.updateMatrix();

      // Apply material properties
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          mat.transparent = transparent;
          mat.opacity = opacity;
          mat.polygonOffset = true;
          mat.polygonOffsetFactor = 1;
          mat.polygonOffsetUnits = 1;
          mat.wireframe = wireframe;
          mat.needsUpdate = true;
        }
      }
    });

    // Freeze top-level group — compute matrix from current transforms first
    refModel.group.matrixAutoUpdate = false;
    refModel.group.updateMatrix();
    refModel.group.updateMatrixWorld(true);
  }

  /**
   * Reimport a file into an existing ghost model, restoring its saved transforms.
   * @param {ReferenceModel} refModel
   * @param {File} file
   */
  async reimportModel(refModel, file) {
    const ext = file.name.split('.').pop().toLowerCase();

    let group;
    if (ext === 'glb' || ext === 'gltf') {
      group = await this._loadGLTF(file);
    } else if (ext === 'obj') {
      group = await this._loadOBJ(file);
    } else if (ext === '3ds') {
      group = await this._load3DS(file);
    } else if (ext === 'mvr') {
      group = await this._loadMVR(file);
    } else {
      throw new Error(`Unsupported format: .${ext}`);
    }

    this._poolMaterials(group);

    refModel.group = group;
    refModel.group.name = `Ref_${refModel.id}_${refModel.name}`;
    refModel.needsReimport = false;
    this._initRefModel(refModel);

    this.rootGroup.add(refModel.group);
    if (this.onModelUpdated) this.onModelUpdated(refModel);
  }

  /**
   * Add a model to the manager.
   */
  addModel(refModel) {
    this.models.push(refModel);
    if (refModel.group) {
      this.rootGroup.add(refModel.group);
    }
    this.selectModel(refModel);
    if (this.onModelAdded) this.onModelAdded(refModel);
  }

  /**
   * Remove a model.
   */
  removeModel(id) {
    const idx = this.models.findIndex(m => m.id === id);
    if (idx === -1) return;

    const refModel = this.models[idx];

    if (this.selectedModel === refModel) {
      this.selectedModel = null;
    }
    this.selectedModelIds.delete(id);

    this._disposeModel(refModel);
    this.models.splice(idx, 1);

    if (this.onModelRemoved) this.onModelRemoved(refModel);
    if (this.selectedModel === null) {
      if (this.onSelectionChanged) this.onSelectionChanged(null);
    }
  }

  /**
   * Deselect all reference models.
   */
  deselectAll() {
    this.selectedModel = null;
    this.selectedModelIds.clear();
    if (this.onSelectionChanged) this.onSelectionChanged(null);
    if (this.onMultiSelectionChanged) this.onMultiSelectionChanged(this.selectedModelIds);
    this.updateHighlights();
  }

  /**
   * Select a model (single click — also adds to multi-select set).
   */
  selectModel(refModel) {
    this.selectedModel = refModel;
    if (refModel) {
      this.selectedModelIds.add(refModel.id);
    }
    if (this.onSelectionChanged) this.onSelectionChanged(refModel);
    this.updateHighlights();
  }

  /**
   * Single-select: clear multi-select, select only this model.
   */
  selectModelSingle(refModel) {
    this.selectedModelIds.clear();
    this.selectedModel = refModel;
    if (refModel) {
      this.selectedModelIds.add(refModel.id);
    }
    if (this.onSelectionChanged) this.onSelectionChanged(refModel);
    if (this.onMultiSelectionChanged) this.onMultiSelectionChanged(this.selectedModelIds);
    this.updateHighlights();
  }

  /**
   * Toggle a model in multi-select (Shift+click).
   */
  toggleMultiSelect(refModel) {
    if (this.selectedModelIds.has(refModel.id)) {
      this.selectedModelIds.delete(refModel.id);
      // If we removed the primary, pick another or null
      if (this.selectedModel === refModel) {
        const remaining = this.getSelectedModels();
        this.selectedModel = remaining.length > 0 ? remaining[0] : null;
      }
    } else {
      this.selectedModelIds.add(refModel.id);
      this.selectedModel = refModel; // Last clicked becomes primary
    }
    if (this.onSelectionChanged) this.onSelectionChanged(this.selectedModel);
    if (this.onMultiSelectionChanged) this.onMultiSelectionChanged(this.selectedModelIds);
    this.updateHighlights();
  }

  /**
   * Select multiple models at once (marquee select).
   */
  selectMultiple(refModels) {
    this.selectedModelIds.clear();
    for (const m of refModels) {
      this.selectedModelIds.add(m.id);
    }
    this.selectedModel = refModels.length > 0 ? refModels[0] : null;
    if (this.onSelectionChanged) this.onSelectionChanged(this.selectedModel);
    if (this.onMultiSelectionChanged) this.onMultiSelectionChanged(this.selectedModelIds);
    this.updateHighlights();
  }

  /**
   * Get all selected ref model objects.
   * @returns {ReferenceModel[]}
   */
  getSelectedModels() {
    return this.models.filter(m => this.selectedModelIds.has(m.id));
  }

  /**
   * Update 3D selection highlights: show PCA-based oriented bounding box
   * wireframes around all selected models so user can see what's selected.
   * Uses principal component analysis so the box follows the model's
   * natural orientation (flat for flat rings, etc.) instead of axis-aligned.
   */
  updateHighlights() {
    // Remove highlights for models no longer selected
    for (const [id, helper] of this._selectionHelpers) {
      if (!this.selectedModelIds.has(id)) {
        this.scene.remove(helper);
        helper.geometry?.dispose();
        helper.material?.dispose();
        this._selectionHelpers.delete(id);
      }
    }

    // Add/update highlights for selected models
    for (const id of this.selectedModelIds) {
      const model = this.getModelById(id);
      if (!model || !model.group || !model.group.visible) {
        if (this._selectionHelpers.has(id)) {
          const h = this._selectionHelpers.get(id);
          this.scene.remove(h);
          h.geometry?.dispose();
          h.material?.dispose();
          this._selectionHelpers.delete(id);
        }
        continue;
      }

      // Compute OBB via PCA
      const obb = this.computeOBB([model.group]);
      if (!obb) continue;

      const { center, axes, mins, maxs } = obb;
      const a0 = axes[0], a1 = axes[1], a2 = axes[2];

      // Build 8 OBB corners in world space
      const corners = [];
      for (let i = 0; i < 8; i++) {
        const p0 = i & 1 ? maxs[0] : mins[0];
        const p1 = i & 2 ? maxs[1] : mins[1];
        const p2 = i & 4 ? maxs[2] : mins[2];
        corners.push(center.clone()
          .addScaledVector(a0, p0)
          .addScaledVector(a1, p1)
          .addScaledVector(a2, p2));
      }

      // 12 edges of the box (LineSegments: pairs of vertices)
      const edgeIdx = [
        0, 1, 2, 3, 4, 5, 6, 7,
        0, 2, 1, 3, 4, 6, 5, 7,
        0, 4, 1, 5, 2, 6, 3, 7
      ];
      const positions = new Float32Array(edgeIdx.length * 3);
      for (let i = 0; i < edgeIdx.length; i++) {
        const c = corners[edgeIdx[i]];
        positions[i * 3]     = c.x;
        positions[i * 3 + 1] = c.y;
        positions[i * 3 + 2] = c.z;
      }

      // Remove old helper
      if (this._selectionHelpers.has(id)) {
        const old = this._selectionHelpers.get(id);
        this.scene.remove(old);
        old.geometry?.dispose();
        old.material?.dispose();
      }

      // Create OBB wireframe helper
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({
        color: 0x00ffaa,
        transparent: true,
        opacity: 0.8,
        depthTest: false,
      });
      const helper = new THREE.LineSegments(geo, mat);
      helper.name = '__sel_highlight';
      helper.renderOrder = 999;
      this.scene.add(helper);
      this._selectionHelpers.set(id, helper);
    }
  }

  /**
   * Compute an Oriented Bounding Box (OBB) for one or more Three.js groups.
   * Uses PCA to find the model's natural orientation.
   * @param {THREE.Group[]} groups
   * @returns {{ center: THREE.Vector3, axes: THREE.Vector3[], extents: number[],
   *             mins: number[], maxs: number[], flatNormal: THREE.Vector3 } | null}
   *   axes sorted by eigenvalue descending; flatNormal = axes[2] (thinnest direction)
   */
  computeOBB(groups) {
    const _v = new THREE.Vector3();
    let n = 0;
    let sx = 0, sy = 0, sz = 0;
    let sxx = 0, syy = 0, szz = 0;
    let sxy = 0, sxz = 0, syz = 0;

    for (const group of groups) {
      group.updateMatrixWorld(true);
      group.traverse(child => {
        if (!child.isMesh || !child.geometry) return;
        const pos = child.geometry.getAttribute('position');
        if (!pos) return;
        for (let i = 0; i < pos.count; i++) {
          _v.fromBufferAttribute(pos, i).applyMatrix4(child.matrixWorld);
          sx += _v.x; sy += _v.y; sz += _v.z;
          sxx += _v.x * _v.x; syy += _v.y * _v.y; szz += _v.z * _v.z;
          sxy += _v.x * _v.y; sxz += _v.x * _v.z; syz += _v.y * _v.z;
          n++;
        }
      });
    }

    if (n < 3) return null;

    const cx = sx / n, cy = sy / n, cz = sz / n;
    const cov00 = sxx / n - cx * cx;
    const cov01 = sxy / n - cx * cy;
    const cov02 = sxz / n - cx * cz;
    const cov11 = syy / n - cy * cy;
    const cov12 = syz / n - cy * cz;
    const cov22 = szz / n - cz * cz;

    const axes = this._jacobiEigen3(cov00, cov01, cov02, cov11, cov12, cov22);

    let min0 = Infinity, max0 = -Infinity;
    let min1 = Infinity, max1 = -Infinity;
    let min2 = Infinity, max2 = -Infinity;
    const a0 = axes[0], a1 = axes[1], a2 = axes[2];

    for (const group of groups) {
      group.traverse(child => {
        if (!child.isMesh || !child.geometry) return;
        const pos = child.geometry.getAttribute('position');
        if (!pos) return;
        for (let i = 0; i < pos.count; i++) {
          _v.fromBufferAttribute(pos, i).applyMatrix4(child.matrixWorld);
          const dx = _v.x - cx, dy = _v.y - cy, dz = _v.z - cz;
          const p0 = dx * a0.x + dy * a0.y + dz * a0.z;
          const p1 = dx * a1.x + dy * a1.y + dz * a1.z;
          const p2 = dx * a2.x + dy * a2.y + dz * a2.z;
          if (p0 < min0) min0 = p0; if (p0 > max0) max0 = p0;
          if (p1 < min1) min1 = p1; if (p1 > max1) max1 = p1;
          if (p2 < min2) min2 = p2; if (p2 > max2) max2 = p2;
        }
      });
    }

    return {
      center: new THREE.Vector3(cx, cy, cz),
      axes,
      extents: [max0 - min0, max1 - min1, max2 - min2],
      mins: [min0, min1, min2],
      maxs: [max0, max1, max2],
      flatNormal: axes[2],
    };
  }

  /**
   * Jacobi eigendecomposition of a 3×3 symmetric matrix.
   * Returns 3 orthonormal eigenvectors as THREE.Vector3 (sorted by eigenvalue descending).
   * @param {number} c00,c01,c02,c11,c12,c22 - upper triangle of symmetric matrix
   */
  _jacobiEigen3(c00, c01, c02, c11, c12, c22) {
    const a = [[c00, c01, c02], [c01, c11, c12], [c02, c12, c22]];
    const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

    for (let sweep = 0; sweep < 20; sweep++) {
      // Find largest off-diagonal element
      let maxOff = 0, p = 0, q = 1;
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
          const absVal = Math.abs(a[i][j]);
          if (absVal > maxOff) { maxOff = absVal; p = i; q = j; }
        }
      }
      if (maxOff < 1e-12) break;

      // Jacobi rotation angle
      const diff = a[q][q] - a[p][p];
      let t;
      if (Math.abs(diff) < 1e-15) {
        t = 1;
      } else {
        const phi = diff / (2 * a[p][q]);
        t = Math.sign(phi) / (Math.abs(phi) + Math.sqrt(1 + phi * phi));
      }
      const c = 1 / Math.sqrt(1 + t * t);
      const s = t * c;
      const tau = s / (1 + c);

      // Rotate matrix
      const apq = a[p][q];
      a[p][q] = a[q][p] = 0;
      a[p][p] -= t * apq;
      a[q][q] += t * apq;
      for (let r = 0; r < 3; r++) {
        if (r === p || r === q) continue;
        const arp = a[r][p], arq = a[r][q];
        a[r][p] = a[p][r] = arp - s * (arq + tau * arp);
        a[r][q] = a[q][r] = arq + s * (arp - tau * arq);
      }

      // Rotate eigenvectors
      for (let r = 0; r < 3; r++) {
        const vrp = v[r][p], vrq = v[r][q];
        v[r][p] = vrp - s * (vrq + tau * vrp);
        v[r][q] = vrq + s * (vrp - tau * vrq);
      }
    }

    // Sort by eigenvalue descending (largest spread first)
    const eigs = [
      { val: a[0][0], vec: new THREE.Vector3(v[0][0], v[1][0], v[2][0]).normalize() },
      { val: a[1][1], vec: new THREE.Vector3(v[0][1], v[1][1], v[2][1]).normalize() },
      { val: a[2][2], vec: new THREE.Vector3(v[0][2], v[1][2], v[2][2]).normalize() },
    ];
    eigs.sort((a, b) => b.val - a.val);
    return [eigs[0].vec, eigs[1].vec, eigs[2].vec];
  }

  /**
   * Clear all 3D selection highlights.
   */
  clearHighlights() {
    for (const [, helper] of this._selectionHelpers) {
      this.scene.remove(helper);
      helper.geometry?.dispose();
      helper.material?.dispose();
    }
    this._selectionHelpers.clear();
  }

  /**
   * Get model by ID.
   */
  getModelById(id) {
    return this.models.find(m => m.id === id) || null;
  }

  /**
   * Update visual properties of a model and notify.
   */
  updateModel(refModel) {
    refModel.applyAll();
    refModel.applySmooth();
    // Refresh matrices for frozen groups after property changes
    if (refModel.group) {
      refModel.group.updateMatrix();
      refModel.group.updateMatrixWorld(true);
    }
    this.updateHighlights();
    if (this.onModelUpdated) this.onModelUpdated(refModel);
  }

  /**
   * Toggle visibility of a model.
   */
  toggleVisibility(refModel) {
    refModel.visible = !refModel.visible;
    if (refModel.group) {
      refModel.group.visible = refModel.visible;
    }
  }

  /**
   * Snap a tube's control points onto the nearest surface of a reference model.
   * Delegates to snapTubeToModels for the actual work.
   * @param {object} tube - TubeModel with controlPoints array
   * @param {ReferenceModel} refModel - Target reference model
   * @returns {number} Number of points successfully snapped
   */
  snapTubeToModel(tube, refModel) {
    return this.snapTubeToModels(tube, [refModel]);
  }

  /**
   * Snap a tube's control points onto the nearest surfaces of multiple reference models.
   * Uses closest-point-on-triangle, constrained to the tube's drawing plane
   * so points don't jump to top/bottom faces.
   * @param {object} tube - TubeModel with controlPoints array
   * @param {ReferenceModel[]} refModels - Target reference models
   * @returns {number} Number of points successfully snapped
   */
  snapTubeToModels(tube, refModels) {
    if (!tube.controlPoints.length || refModels.length === 0) return 0;

    // Collect meshes and combined bounding box from ALL target models
    const meshes = [];
    const modelBox = new THREE.Box3();
    for (const refModel of refModels) {
      if (!refModel.group) continue;
      refModel.group.traverse(child => {
        if (child.isMesh) meshes.push(child);
      });
      modelBox.expandByObject(refModel.group);
    }
    if (meshes.length === 0) return 0;

    const modelCenter = new THREE.Vector3();
    modelBox.getCenter(modelCenter);

    // Detect the "flat" axis — the one with the least spread across control points.
    // This is the drawing plane's normal axis (e.g. Y for ground-plane XZ drawings).
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const pt of tube.controlPoints) {
      min.min(pt);
      max.max(pt);
    }
    const spread = new THREE.Vector3().subVectors(max, min);
    let lockAxis = 'y';
    if (spread.x <= spread.y && spread.x <= spread.z) lockAxis = 'x';
    else if (spread.z <= spread.x && spread.z <= spread.y) lockAxis = 'z';

    // Use combined model's top surface as the lock value
    const modelTopY = modelBox.max[lockAxis];

    // Elevate all tube points to model's top surface so the snap
    // search starts from the right height
    for (const pt of tube.controlPoints) {
      pt[lockAxis] = modelTopY;
    }

    const triangle = new THREE.Triangle();
    const closestOnTri = new THREE.Vector3();
    const worldClosest = new THREE.Vector3();
    const localPt = new THREE.Vector3();
    const invMatrix = new THREE.Matrix4();
    let snapped = 0;

    for (let i = 0; i < tube.controlPoints.length; i++) {
      const point = tube.controlPoints[i];
      let bestDist = Infinity;
      let bestPoint = null;

      for (const mesh of meshes) {
        mesh.updateWorldMatrix(true, false);
        invMatrix.copy(mesh.matrixWorld).invert();

        localPt.copy(point).applyMatrix4(invMatrix);

        const geo = mesh.geometry;
        const pos = geo.attributes.position;
        const idx = geo.index;
        const triCount = idx ? idx.count / 3 : pos.count / 3;

        for (let t = 0; t < triCount; t++) {
          let i0, i1, i2;
          if (idx) {
            i0 = idx.getX(t * 3);
            i1 = idx.getX(t * 3 + 1);
            i2 = idx.getX(t * 3 + 2);
          } else {
            i0 = t * 3;
            i1 = t * 3 + 1;
            i2 = t * 3 + 2;
          }

          triangle.a.fromBufferAttribute(pos, i0);
          triangle.b.fromBufferAttribute(pos, i1);
          triangle.c.fromBufferAttribute(pos, i2);

          triangle.closestPointToPoint(localPt, closestOnTri);

          // Transform to world space for planar distance check
          worldClosest.copy(closestOnTri).applyMatrix4(mesh.matrixWorld);

          // Measure distance only in the drawing plane (ignore locked axis)
          const dx = point.x - worldClosest.x;
          const dy = point.y - worldClosest.y;
          const dz = point.z - worldClosest.z;
          let dist;
          if (lockAxis === 'y') dist = Math.sqrt(dx * dx + dz * dz);
          else if (lockAxis === 'x') dist = Math.sqrt(dy * dy + dz * dz);
          else dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < bestDist) {
            bestDist = dist;
            bestPoint = worldClosest.clone();
          }
        }
      }

      if (bestPoint) {
        point.copy(bestPoint);
        // Keep the model's top height for the locked axis
        point[lockAxis] = modelTopY;
        snapped++;
      }
    }

    // Post-snap cleanup: remove consecutive near-duplicate points.
    // When two points snap to the same edge they end up on top of each other,
    // which makes the spline curl into a loop.
    const minGap = 0.02; // 20 mm — roughly tube diameter
    const pts = tube.controlPoints;

    // Pass 1: remove consecutive duplicates (walk backwards so splice is safe)
    for (let j = pts.length - 1; j > 0; j--) {
      if (pts[j].distanceTo(pts[j - 1]) < minGap) {
        pts.splice(j, 1);
      }
    }

    // Pass 2: for closed tubes, check if first ≈ last → remove last
    if (tube.closed && pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) < minGap) {
      pts.pop();
    }

    return snapped;
  }

  /**
   * Snap a tube's control points onto model surfaces using OBB-directed projection.
   * Unlike snapTubeToModels (axis-aligned), this works correctly for rotated models
   * by projecting along the OBB's flat normal instead of an axis-aligned lock axis.
   * @param {object} tube - TubeModel with controlPoints array
   * @param {ReferenceModel[]} refModels - Target reference models
   * @param {object} obb - OBB from computeOBB (needs flatNormal, maxs, center)
   * @returns {number} Number of points successfully snapped
   */
  snapTubeToModelsDirected(tube, refModels, obb) {
    if (!tube.controlPoints.length || refModels.length === 0) return 0;

    const meshes = [];
    for (const refModel of refModels) {
      if (!refModel.group) continue;
      refModel.group.traverse(child => {
        if (child.isMesh) meshes.push(child);
      });
    }
    if (meshes.length === 0) return 0;

    const flatNormal = obb.flatNormal;
    // Top surface projection value along flatNormal (relative to world origin)
    const surfaceProj = obb.center.dot(flatNormal) + obb.maxs[2];

    // Offset all tube points to the top surface along flatNormal
    for (const pt of tube.controlPoints) {
      const currentProj = pt.dot(flatNormal);
      pt.addScaledVector(flatNormal, surfaceProj - currentProj);
    }

    const triangle = new THREE.Triangle();
    const closestOnTri = new THREE.Vector3();
    const worldClosest = new THREE.Vector3();
    const localPt = new THREE.Vector3();
    const invMatrix = new THREE.Matrix4();
    const diff = new THREE.Vector3();
    let snapped = 0;

    for (let i = 0; i < tube.controlPoints.length; i++) {
      const point = tube.controlPoints[i];
      let bestDist = Infinity;
      let bestPoint = null;

      for (const mesh of meshes) {
        mesh.updateWorldMatrix(true, false);
        invMatrix.copy(mesh.matrixWorld).invert();
        localPt.copy(point).applyMatrix4(invMatrix);

        const geo = mesh.geometry;
        const pos = geo.attributes.position;
        const idx = geo.index;
        const triCount = idx ? idx.count / 3 : pos.count / 3;

        for (let t = 0; t < triCount; t++) {
          let i0, i1, i2;
          if (idx) {
            i0 = idx.getX(t * 3);
            i1 = idx.getX(t * 3 + 1);
            i2 = idx.getX(t * 3 + 2);
          } else {
            i0 = t * 3;
            i1 = t * 3 + 1;
            i2 = t * 3 + 2;
          }

          triangle.a.fromBufferAttribute(pos, i0);
          triangle.b.fromBufferAttribute(pos, i1);
          triangle.c.fromBufferAttribute(pos, i2);

          triangle.closestPointToPoint(localPt, closestOnTri);
          worldClosest.copy(closestOnTri).applyMatrix4(mesh.matrixWorld);

          // Measure distance in the face plane (perpendicular to flatNormal)
          diff.subVectors(point, worldClosest);
          const alongNormal = diff.dot(flatNormal);
          const inPlaneSq = diff.lengthSq() - alongNormal * alongNormal;
          const dist = Math.sqrt(Math.max(0, inPlaneSq));

          if (dist < bestDist) {
            bestDist = dist;
            bestPoint = worldClosest.clone();
          }
        }
      }

      if (bestPoint) {
        point.copy(bestPoint);
        // Keep the point at the top surface along flatNormal
        const bestProj = point.dot(flatNormal);
        point.addScaledVector(flatNormal, surfaceProj - bestProj);
        snapped++;
      }
    }

    // Post-snap cleanup: remove consecutive near-duplicate points
    const minGap = 0.02;
    const pts = tube.controlPoints;
    for (let j = pts.length - 1; j > 0; j--) {
      if (pts[j].distanceTo(pts[j - 1]) < minGap) {
        pts.splice(j, 1);
      }
    }
    if (tube.closed && pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) < minGap) {
      pts.pop();
    }

    return snapped;
  }

  /**
   * Get all visible ref model meshes (for raycasting).
   * Excludes merged display meshes — returns originals for accurate picking.
   * @returns {THREE.Mesh[]}
   */
  getRefModelMeshes() {
    const meshes = [];
    for (const model of this.models) {
      if (!model.group || !model.group.visible || model.needsReimport) continue;
      model.group.traverse(child => {
        if (child.isMesh) meshes.push(child);
      });
    }
    return meshes;
  }

  /**
   * Find which ReferenceModel owns a given mesh.
   * @param {THREE.Mesh} mesh
   * @returns {ReferenceModel|null}
   */
  getModelByMesh(mesh) {
    // Walk up the parent chain to find the ref model root
    let obj = mesh;
    while (obj) {
      if (obj.parent === this.rootGroup) {
        // Found the root — match to a model
        for (const model of this.models) {
          if (model.group === obj) return model;
        }
      }
      obj = obj.parent;
    }
    // Fallback: traverse
    for (const model of this.models) {
      if (!model.group) continue;
      let found = false;
      model.group.traverse(child => {
        if (child === mesh) found = true;
      });
      if (found) return model;
    }
    return null;
  }

  /**
   * Clear all models.
   */
  clearAll() {
    for (const model of this.models) {
      this._disposeModel(model);
    }
    this.models = [];
    this.selectedModel = null;
    this.selectedModelIds.clear();
    this.clearHighlights();
  }

  /**
   * Serialize all models (metadata only).
   */
  toJSON() {
    return this.models.map(m => m.toJSON());
  }

  /**
   * Load ghost models from JSON array.
   */
  loadFromJSON(dataArray) {
    if (!Array.isArray(dataArray)) return;

    let maxId = 0;
    for (const item of dataArray) {
      const refModel = ReferenceModel.fromJSON(item);
      if (refModel.id > maxId) maxId = refModel.id;
      this.models.push(refModel);
      if (this.onModelAdded) this.onModelAdded(refModel);
    }
    ReferenceModel.resetIdCounter(maxId);
  }

  // ── Progress helpers ────────────────────────────────

  _emitProgress(pct, msg) {
    if (this.onProgress) this.onProgress(pct, msg);
  }

  _yieldToUI() {
    return new Promise(r => requestAnimationFrame(r));
  }

  // ── Private Loaders ─────────────────────────────────

  /**
   * Load GLB/GLTF from File.
   */
  _loadGLTF(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const buffer = ev.target.result;
        this._gltfLoader.parse(buffer, '', (gltf) => {
          resolve(gltf.scene);
        }, (err) => {
          reject(new Error(`GLTF parse error: ${err.message || err}`));
        });
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Load OBJ from File.
   */
  _loadOBJ(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const text = ev.target.result;
          const obj = this._objLoader.parse(text);
          resolve(obj);
        } catch (err) {
          reject(new Error(`OBJ parse error: ${err.message || err}`));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  /**
   * True early-exit check: does this object or any descendant contain a Mesh?
   */
  _hasMesh(obj) {
    if (obj.isMesh) return true;
    for (const c of obj.children) {
      if (this._hasMesh(c)) return true;
    }
    return false;
  }

  // _autoScale is now integrated into _processLoadedGroup (single-pass)

  /**
   * Load 3DS from File.
   */
  _load3DS(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const group = this._tdsLoader.parse(ev.target.result);
          resolve(group);
        } catch (err) {
          reject(new Error(`3DS parse error: ${err.message || err}`));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Load MVR file — extract 3D models and position them using the XML scene description.
   * Handles coordinate conversion (MVR Z-up mm → Three.js Y-up meters).
   */
  async _loadMVR(file) {
    const buffer = await file.arrayBuffer();
    const zipBytes = new Uint8Array(buffer);

    const { modelFiles, xmlText, entries } = await this._extractModelsFromZip(zipBytes);
    console.log(`[RefModel] MVR: ${entries.length} entries, ${modelFiles.length} models, XML: ${!!xmlText}`);

    if (modelFiles.length === 0) {
      throw new Error(`No 3D models found inside MVR. Entries: ${entries.join(', ') || 'none'}`);
    }

    // Parse all model files into a lookup map: filename → THREE.Group
    const modelMap = new Map();
    for (const model of modelFiles) {
      try {
        const group = await this._parseModelData(model.name, model.data);
        if (group) {
          modelMap.set(model.name, group);
          const basename = model.name.split('/').pop();
          modelMap.set(basename, group);
        }
      } catch (err) {
        console.warn(`[RefModel] Failed to parse ${model.name}:`, err);
      }
    }

    if (modelMap.size === 0) {
      throw new Error('MVR contained model files but none could be parsed');
    }

    // Build scene from XML placements or just combine all models
    const rootGroup = new THREE.Group();

    if (xmlText) {
      this._buildSceneFromXml(xmlText, modelMap, rootGroup);
    }

    // If XML parsing didn't place anything, just add all models at origin
    if (rootGroup.children.length === 0) {
      for (const [, group] of modelMap) {
        rootGroup.add(group);
      }
    }

    return rootGroup;
  }

  /**
   * Parse MVR XML and place models according to scene description.
   * Converts MVR Z-up millimeters → Three.js Y-up meters.
   * Uses geometry sharing for clones to reduce memory.
   */
  _buildSceneFromXml(xmlText, modelMap, rootGroup) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');

    // Find all elements with Geometry3D children (SceneObject, Fixture, GroupObject)
    const geom3dEls = doc.querySelectorAll('Geometry3D');

    for (const geomEl of geom3dEls) {
      const fileName = geomEl.getAttribute('fileName') || geomEl.getAttribute('filename') || '';
      if (!fileName) continue;

      // Find the model in our map
      const basename = fileName.split('/').pop();
      const templateGroup = modelMap.get(fileName) || modelMap.get(basename);
      if (!templateGroup) continue;

      // Find the parent element's Matrix
      const parentEl = geomEl.closest('SceneObject, Fixture, GroupObject') || geomEl.parentElement;
      const matrixEl = parentEl?.querySelector(':scope > Matrix');
      const matrixStr = matrixEl?.textContent || '';

      // Clone with geometry sharing — only clone transforms, share buffers
      const clone = this._shallowClone(templateGroup);

      // Wrap in a container: inner group scales mm→m, outer gets the MVR placement
      const wrapper = new THREE.Group();
      clone.scale.setScalar(0.001); // 3DS/GLB data inside MVR is in mm
      wrapper.add(clone);

      if (matrixStr) {
        this._applyMvrMatrix(wrapper, matrixStr);
      }

      rootGroup.add(wrapper);
    }

    console.log(`[RefModel] Placed ${rootGroup.children.length} scene objects from MVR XML`);
  }

  /**
   * Shallow clone a group: share geometry and material references,
   * only clone the Object3D hierarchy and transforms.
   */
  _shallowClone(source) {
    if (source.isMesh) {
      // Share geometry and material — only clone the mesh wrapper
      const clone = new THREE.Mesh(source.geometry, source.material);
      clone.name = source.name;
      clone.position.copy(source.position);
      clone.quaternion.copy(source.quaternion);
      clone.scale.copy(source.scale);
      clone.matrix.copy(source.matrix);
      clone.matrixAutoUpdate = source.matrixAutoUpdate;
      return clone;
    }

    const clone = new THREE.Group();
    clone.name = source.name;
    clone.position.copy(source.position);
    clone.quaternion.copy(source.quaternion);
    clone.scale.copy(source.scale);
    clone.matrix.copy(source.matrix);
    clone.matrixAutoUpdate = source.matrixAutoUpdate;

    for (const child of source.children) {
      clone.add(this._shallowClone(child));
    }

    return clone;
  }

  /**
   * Parse MVR matrix string and apply as Three.js transform.
   * MVR format: "{u1,u2,u3}{v1,v2,v3}{w1,w2,w3}{x,y,z}"
   * Where u/v/w are rotation basis vectors, x/y/z is position in mm.
   * MVR is Z-up → Three.js is Y-up: MVR(x,y,z) → Three(x, z, -y)
   */
  _applyMvrMatrix(object, matrixStr) {
    // Parse "{a,b,c}{d,e,f}{g,h,i}{x,y,z}" format
    const groups = matrixStr.match(/\{([^}]+)\}/g);
    if (!groups || groups.length < 4) return;

    const parse = (s) => s.replace(/[{}]/g, '').split(',').map(Number);
    const u = parse(groups[0]); // right vector
    const v = parse(groups[1]); // forward vector
    const w = parse(groups[2]); // up vector
    const t = parse(groups[3]); // translation in mm

    // Convert MVR basis vectors from Z-up to Three.js Y-up:
    //   MVR(x,y,z) → Three(x, z, -y), translation mm → m
    // Matrix4.set is row-major; basis vectors as columns:
    const m = new THREE.Matrix4();
    m.set(
       u[0],    v[0],    w[0],    t[0] / 1000,
       u[2],    v[2],    w[2],    t[2] / 1000,
      -u[1],   -v[1],   -w[1],   -t[1] / 1000,
       0,       0,       0,       1
    );

    object.applyMatrix4(m);
  }

  /**
   * Parse raw model data by format.
   */
  _parseModelData(fileName, data) {
    const ext = fileName.split('.').pop().toLowerCase();

    if (ext === 'glb' || ext === 'gltf') {
      const cleanBuffer = data.slice().buffer;
      return new Promise((resolve, reject) => {
        this._gltfLoader.parse(cleanBuffer, '', (gltf) => resolve(gltf.scene), reject);
      });
    }

    if (ext === '3ds') {
      try {
        // TDSLoader.parse expects ArrayBuffer
        const cleanBuffer = data.slice().buffer;
        const group = this._tdsLoader.parse(cleanBuffer);
        return Promise.resolve(group);
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return Promise.resolve(null);
  }

  /**
   * Robust ZIP parser — uses central directory for reliable offsets/sizes.
   * Extracts all 3D model files (.glb, .3ds) and the XML scene description.
   * Returns { modelFiles: [{name, data}], xmlText: string|null, entries: string[] }
   */
  async _extractModelsFromZip(zipBytes) {
    const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
    const entries = [];
    const modelFiles = [];
    let xmlText = null;
    const modelExts = ['.glb', '.gltf', '.3ds'];

    // Find End of Central Directory record (scan backwards)
    let eocdOffset = -1;
    for (let i = zipBytes.length - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset === -1) {
      console.error('[RefModel] No EOCD record found in ZIP');
      return { modelFiles, entries };
    }

    const cdEntryCount = view.getUint16(eocdOffset + 10, true);
    let cdOffset = view.getUint32(eocdOffset + 16, true);

    for (let i = 0; i < cdEntryCount; i++) {
      if (cdOffset + 46 > zipBytes.length) break;
      if (view.getUint32(cdOffset, true) !== 0x02014b50) break;

      const method = view.getUint16(cdOffset + 10, true);
      const compressedSize = view.getUint32(cdOffset + 20, true);
      const nameLen = view.getUint16(cdOffset + 28, true);
      const extraLen = view.getUint16(cdOffset + 30, true);
      const commentLen = view.getUint16(cdOffset + 32, true);
      const localHeaderOffset = view.getUint32(cdOffset + 42, true);

      const nameBytes = zipBytes.slice(cdOffset + 46, cdOffset + 46 + nameLen);
      const fileName = new TextDecoder().decode(nameBytes);
      const nameLower = fileName.toLowerCase();

      entries.push(`${fileName} (${compressedSize}b, method=${method})`);

      // Extract file data helper
      const extractData = async () => {
        const localNameLen = view.getUint16(localHeaderOffset + 26, true);
        const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
        const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
        const rawData = zipBytes.slice(dataStart, dataStart + compressedSize);

        if (method === 0) return rawData;
        if (method === 8) return await this._inflateRaw(rawData);
        return null;
      };

      // Check if this is a 3D model file
      const isModel = modelExts.some(ext => nameLower.endsWith(ext));
      if (isModel && compressedSize > 0) {
        const fileData = await extractData();
        if (fileData) {
          modelFiles.push({ name: fileName, data: fileData });
        }
      }

      // Check if this is the scene description XML
      if (nameLower.endsWith('.xml') && !xmlText && compressedSize > 0) {
        const fileData = await extractData();
        if (fileData) {
          xmlText = new TextDecoder().decode(fileData);
        }
      }

      cdOffset += 46 + nameLen + extraLen + commentLen;
    }

    return { modelFiles, xmlText, entries };
  }

  /**
   * Inflate deflate-raw compressed data using browser DecompressionStream API.
   */
  async _inflateRaw(compressedData) {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();

    writer.write(compressedData);
    writer.close();

    const chunks = [];
    let totalLen = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLen += value.byteLength;
    }

    const result = new Uint8Array(totalLen);
    let pos = 0;
    for (const chunk of chunks) {
      result.set(new Uint8Array(chunk.buffer || chunk), pos);
      pos += chunk.byteLength;
    }
    return result;
  }

  /**
   * Dispose of a model's 3D objects.
   */
  _disposeModel(refModel) {
    if (!refModel.group) return;

    refModel.group.traverse(child => {
      if (child.isMesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material?.dispose();
        }
      }
    });

    this.rootGroup.remove(refModel.group);
    refModel.group = null;
  }
}
