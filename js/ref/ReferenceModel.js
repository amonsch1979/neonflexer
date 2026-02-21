import * as THREE from 'three';

let refIdCounter = 0;

/**
 * Data model for a reference 3D model (stage element, truss, etc.)
 * Display-only — not included in MVR export.
 */
export class ReferenceModel {
  constructor(options = {}) {
    this.id = ++refIdCounter;
    this.name = options.name || `Reference ${this.id}`;
    this.visible = options.visible !== undefined ? options.visible : true;
    this.opacity = options.opacity !== undefined ? options.opacity : 0.7;
    this.wireframe = options.wireframe || false;
    this.smoothEdges = options.smoothEdges !== undefined ? options.smoothEdges : false;

    // Transform
    this.position = options.position || new THREE.Vector3();
    this.rotation = options.rotation || new THREE.Euler();
    this.scale = options.scale !== undefined ? options.scale : 1; // uniform scale

    // Three.js group (transient — not serialized)
    this.group = null;

    // Ghost state: loaded from .neon but file not reimported yet
    this.needsReimport = options.needsReimport || false;
  }

  /**
   * Apply current transform values to the Three.js group.
   */
  applyTransform() {
    if (!this.group) return;
    this.group.position.copy(this.position);
    this.group.rotation.copy(this.rotation);
    this.group.scale.setScalar(this.scale);
    this.group.visible = this.visible;
    // Render ref models before tubes so tubes draw on top
    this.group.renderOrder = -1;
  }

  /**
   * Apply opacity and depth settings to all meshes in the group.
   * Uses polygonOffset to push ref models back so tubes render on top.
   */
  applyOpacity() {
    if (!this.group) return;
    this.group.traverse(child => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          mat.transparent = this.opacity < 1;
          mat.opacity = this.opacity;
          // Push ref model geometry back in depth so tubes always win
          mat.polygonOffset = true;
          mat.polygonOffsetFactor = 1;
          mat.polygonOffsetUnits = 1;
          mat.needsUpdate = true;
        }
      }
    });
  }

  /**
   * Apply wireframe mode to all meshes in the group.
   */
  applyWireframe() {
    if (!this.group) return;
    this.group.traverse(child => {
      if (child.isMesh && child.material) {
        child.material.wireframe = this.wireframe;
        child.material.needsUpdate = true;
      }
    });
  }

  /**
   * Apply smooth shading (hides hard edges for a cleaner look).
   * Recomputes smooth vertex normals and disables flat shading.
   */
  applySmooth() {
    if (!this.group) return;
    this.group.traverse(child => {
      if (!child.isMesh) return;

      if (child.geometry) {
        if (this.smoothEdges) {
          // Save original normals if not already saved
          if (!child.geometry._origNormals && child.geometry.attributes.normal) {
            child.geometry._origNormals = child.geometry.attributes.normal.clone();
          }
          child.geometry.computeVertexNormals();
        } else if (child.geometry._origNormals) {
          // Restore original normals
          child.geometry.setAttribute('normal', child.geometry._origNormals);
          delete child.geometry._origNormals;
        }
      }

      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          if ('flatShading' in mat) {
            mat.flatShading = !this.smoothEdges;
            mat.needsUpdate = true;
          }
        }
      }
    });
  }

  /**
   * Apply all visual properties in a single traversal.
   */
  applyAll() {
    this.applyTransform();
    if (!this.group) return;
    // Combined opacity + wireframe + polygonOffset in ONE traversal
    const opacity = this.opacity;
    const transparent = opacity < 1;
    const wireframe = this.wireframe;
    this.group.traverse(child => {
      if (child.isMesh && child.material) {
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
  }

  /**
   * Serialize metadata (no mesh data).
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      visible: this.visible,
      opacity: this.opacity,
      wireframe: this.wireframe,
      smoothEdges: this.smoothEdges,
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      rotation: { x: this.rotation.x, y: this.rotation.y, z: this.rotation.z },
      scale: this.scale,
    };
  }

  /**
   * Restore from JSON — creates ghost entry (no geometry).
   */
  static fromJSON(data) {
    const ref = new ReferenceModel({
      name: data.name,
      visible: data.visible,
      opacity: data.opacity,
      wireframe: data.wireframe,
      smoothEdges: data.smoothEdges || false,
      position: new THREE.Vector3(data.position?.x || 0, data.position?.y || 0, data.position?.z || 0),
      rotation: new THREE.Euler(data.rotation?.x || 0, data.rotation?.y || 0, data.rotation?.z || 0),
      scale: data.scale !== undefined ? data.scale : 1,
      needsReimport: true,
    });
    if (data.id != null) ref.id = data.id;
    return ref;
  }

  static resetIdCounter(maxId) {
    refIdCounter = maxId;
  }
}
