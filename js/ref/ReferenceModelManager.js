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

    // Root group for all ref models
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'ReferenceModels';
    this.scene.add(this.rootGroup);

    // Loaders
    this._gltfLoader = new GLTFLoader();
    this._objLoader = new OBJLoader();
    this._tdsLoader = new TDSLoader();

    // Callbacks
    this.onModelAdded = null;     // (refModel) => {}
    this.onModelRemoved = null;   // (refModel) => {}
    this.onModelUpdated = null;   // (refModel) => {}
    this.onSelectionChanged = null; // (refModel|null) => {}
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

    // Auto-scale: detect if model is in mm and convert to meters
    this._autoScale(group, ext);

    const refModel = new ReferenceModel({ name });
    refModel.group = group;
    refModel.group.name = `Ref_${refModel.id}_${name}`;
    refModel.needsReimport = false;
    refModel.applyAll();

    this.addModel(refModel);
    return refModel;
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

    refModel.group = group;
    refModel.group.name = `Ref_${refModel.id}_${refModel.name}`;
    refModel.needsReimport = false;
    refModel.applyAll();

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

    this._disposeModel(refModel);
    this.models.splice(idx, 1);

    if (this.onModelRemoved) this.onModelRemoved(refModel);
    if (this.selectedModel === null) {
      if (this.onSelectionChanged) this.onSelectionChanged(null);
    }
  }

  /**
   * Select a model.
   */
  selectModel(refModel) {
    this.selectedModel = refModel;
    if (this.onSelectionChanged) this.onSelectionChanged(refModel);
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
   * Uses closest-point-on-triangle, constrained to the tube's drawing plane
   * so points don't jump to top/bottom faces.
   * @param {object} tube - TubeModel with controlPoints array
   * @param {ReferenceModel} refModel - Target reference model
   * @returns {number} Number of points successfully snapped
   */
  snapTubeToModel(tube, refModel) {
    if (!refModel.group || !tube.controlPoints.length) return 0;

    const meshes = [];
    refModel.group.traverse(child => {
      if (child.isMesh) meshes.push(child);
    });
    if (meshes.length === 0) return 0;

    // Get the model's bounding box to determine its top surface height
    const modelBox = new THREE.Box3().setFromObject(refModel.group);
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

    // Use model's top surface as the lock value instead of the drawing plane
    // This ensures the tube follows the model's actual height
    const modelTopY = modelBox.max[lockAxis];

    // First, elevate all tube points to model's top surface so the snap
    // search starts from the right height — this ensures planar distance
    // calculation matches the model's edge perimeter at the correct level.
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
   * Clear all models.
   */
  clearAll() {
    for (const model of this.models) {
      this._disposeModel(model);
    }
    this.models = [];
    this.selectedModel = null;
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
   * Auto-scale model to meters if it appears to be in millimeters.
   * MVR is handled by XML placement (mm→m built in). 3DS standalone is mm.
   */
  _autoScale(group, ext) {
    // MVR handles its own scaling via XML placement — skip
    if (ext === 'mvr') return;

    // 3DS files are always in millimeters per spec
    if (ext === '3ds') {
      group.scale.multiplyScalar(0.001);
      return;
    }

    // For GLB/OBJ: check bounding box — if larger than 50 units, assume mm
    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);

    if (maxDim > 50) {
      group.scale.multiplyScalar(0.001);
    }
  }

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

      // Clone the model so multiple placements work
      const clone = templateGroup.clone();

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
