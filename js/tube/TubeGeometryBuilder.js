import * as THREE from 'three';
import { CurveBuilder } from '../drawing/CurveBuilder.js';

/**
 * Generates tube geometry for different cross-section profiles.
 */
export class TubeGeometryBuilder {
  /**
   * Build tube geometry based on profile type.
   * @param {THREE.CatmullRomCurve3} curve
   * @param {import('./TubeModel.js').TubeModel} tubeModel
   * @returns {THREE.BufferGeometry}
   */
  static build(curve, tubeModel) {
    switch (tubeModel.profile) {
      case 'round':
        return this._buildRound(curve, tubeModel);
      case 'square':
        return this._buildSquare(curve, tubeModel);
      case 'rect':
        return this._buildRect(curve, tubeModel);
      default:
        return this._buildRound(curve, tubeModel);
    }
  }

  /**
   * Build round tube using TubeGeometry.
   */
  static _buildRound(curve, tubeModel) {
    // For uv-mapped mode: at least as many segments as pixels, but never less than
    // the normal smooth count so sharp bends don't break the geometry
    const normalSegments = CurveBuilder.getTubularSegments(curve);
    const pixelCount = Math.max(1, Math.round(CurveBuilder.getLength(curve) * tubeModel.pixelsPerMeter));
    const segments = tubeModel.pixelMode === 'uv-mapped'
      ? Math.max(normalSegments, pixelCount)
      : normalSegments;
    const radialSegments = 24;
    const radius = tubeModel.outerRadius;

    const tubeGeo = new THREE.TubeGeometry(
      curve,
      segments,
      radius,
      radialSegments,
      tubeModel.closed
    );

    // Add end caps if not closed (skip for uv-mapped — caps corrupt UV mapping)
    if (!tubeModel.closed && tubeModel.pixelMode !== 'uv-mapped') {
      const merged = this._buildRoundWithCaps(tubeGeo, curve, radius, radialSegments);
      if (merged) {
        tubeGeo.dispose();
        return merged;
      }
      // If merge failed, return original geometry (don't dispose it)
    }

    return tubeGeo;
  }

  /**
   * Build square tube using ExtrudeGeometry.
   */
  static _buildSquare(curve, tubeModel) {
    const size = tubeModel.outerRadius * 2; // use diameter as side length
    const shape = this._profileShape(size, size, tubeModel.diffuserShape);
    return this._extrudeAlongCurve(shape, curve, tubeModel);
  }

  /**
   * Build rectangular tube using ExtrudeGeometry.
   */
  static _buildRect(curve, tubeModel) {
    const w = tubeModel.widthM;
    const h = tubeModel.heightM;
    const shape = this._profileShape(w, h, tubeModel.diffuserShape);
    return this._extrudeAlongCurve(shape, curve, tubeModel);
  }

  /**
   * Dispatch to the correct cross-section shape based on diffuser type.
   */
  static _profileShape(w, h, diffuserShape) {
    switch (diffuserShape) {
      case 'dome':
        return this._domeShape(w, h);
      case 'square':
        // Square diffuser = same as full rounded rect (split handles the separation)
        return this._roundedRectShape(w, h, Math.min(w, h) * 0.15);
      default:
        return this._roundedRectShape(w, h, Math.min(w, h) * 0.15);
    }
  }

  /**
   * Build split geometry: separate base housing + diffuser.
   * Returns { base: BufferGeometry, diffuser: BufferGeometry } or null if not applicable.
   * Works for all square/rect profiles with any diffuserShape (flat, dome, oval).
   */
  static buildSplit(curve, tubeModel) {
    if (tubeModel.profile !== 'square' && tubeModel.profile !== 'rect') return null;

    const shapes = this._getSplitShapes(tubeModel);
    if (!shapes) return null;

    return {
      base: this._extrudeAlongCurve(shapes.base, curve, tubeModel),
      diffuser: this._extrudeAlongCurve(shapes.diffuser, curve, tubeModel),
    };
  }

  /**
   * Build only the diffuser geometry (for UV-mapped export).
   * Returns BufferGeometry or null if not a split profile.
   */
  static buildDiffuserOnly(curve, tubeModel) {
    if (tubeModel.profile !== 'square' && tubeModel.profile !== 'rect') return null;
    const shapes = this._getSplitShapes(tubeModel);
    if (!shapes) return null;
    return this._extrudeAlongCurve(shapes.diffuser, curve, tubeModel);
  }

  /**
   * Build only the housing geometry (for UV-mapped export — non-UV-mapped housing).
   * Returns BufferGeometry or null if not a split profile.
   */
  static buildHousingOnly(curve, tubeModel) {
    if (tubeModel.profile !== 'square' && tubeModel.profile !== 'rect') return null;
    const shapes = this._getSplitShapes(tubeModel);
    if (!shapes) return null;
    return this._extrudeAlongCurve(shapes.base, curve, tubeModel);
  }

  /**
   * Get the base (housing) and diffuser shapes for a square/rect profile.
   * @returns {{ base: THREE.Shape, diffuser: THREE.Shape }} or null
   */
  static _getSplitShapes(tubeModel) {
    let w, h;
    if (tubeModel.profile === 'square') {
      const size = tubeModel.outerRadius * 2;
      w = size; h = size;
    } else {
      w = tubeModel.widthM;
      h = tubeModel.heightM;
    }

    const wallT = tubeModel.wallThicknessMm * 0.001;

    switch (tubeModel.diffuserShape) {
      case 'dome':
        return { base: this._domeBaseShape(w, h, wallT), diffuser: this._domeDiffuserShape(w, h) };
      case 'square': {
        // Square diffuser: taller cap (~40% of height), deeper U-channel housing
        const splitH = h * 0.4;
        return { base: this._uBaseShape(w, h, wallT, splitH), diffuser: this._flatDiffuserShape(w, h, splitH) };
      }
      default: // 'flat'
        return { base: this._uBaseShape(w, h, wallT, wallT), diffuser: this._flatDiffuserShape(w, h, wallT) };
    }
  }

  /**
   * Rectangular base with semicircular dome on top.
   * Total height = h (dome is part of it). Dome arc sweeps 0→PI (right to left over top).
   */
  static _domeShape(w, h) {
    const shape = new THREE.Shape();
    const hw = w / 2;
    const hh = h / 2;
    const r = Math.min(hw, hh);
    const baseTopY = hh - r;

    shape.moveTo(-hw, -hh);
    shape.lineTo(hw, -hh);
    shape.lineTo(hw, baseTopY);

    const domeR = r < hw ? r : hw;
    if (r < hw) {
      // Wide tube: bridge from right wall to dome arc start
      shape.lineTo(domeR, baseTopY);
    }

    // Dome arc from right to left (angle 0 → PI)
    const arcSegments = 16;
    for (let i = 0; i <= arcSegments; i++) {
      const angle = (Math.PI * i) / arcSegments;
      shape.lineTo(Math.cos(angle) * domeR, baseTopY + Math.sin(angle) * domeR);
    }

    if (r < hw) {
      // Bridge from dome arc end to left wall
      shape.lineTo(-hw, baseTopY);
    }

    shape.lineTo(-hw, -hh);
    return shape;
  }

  /**
   * Base housing shape for dome profile — open U-channel below the dome.
   */
  static _domeBaseShape(w, h, wallT) {
    const shape = new THREE.Shape();
    const hw = w / 2;
    const hh = h / 2;
    const r = Math.min(hw, hh);
    const topY = hh - r;

    // Outer contour (clockwise)
    shape.moveTo(-hw, -hh);
    shape.lineTo(hw, -hh);
    shape.lineTo(hw, topY);

    // Step inward across right wall top
    shape.lineTo(hw - wallT, topY);

    // Inner contour (counter-clockwise = back down)
    shape.lineTo(hw - wallT, -hh + wallT);
    shape.lineTo(-hw + wallT, -hh + wallT);
    shape.lineTo(-hw + wallT, topY);

    // Step outward across left wall top
    shape.lineTo(-hw, topY);

    // Outer left wall down (closes shape)
    shape.lineTo(-hw, -hh);

    return shape;
  }

  /**
   * Diffuser-only shape for dome profile (dome cap sitting on top of base).
   */
  static _domeDiffuserShape(w, h) {
    const shape = new THREE.Shape();
    const hw = w / 2;
    const hh = h / 2;
    const r = Math.min(hw, hh);
    const baseTopY = hh - r;
    const domeR = r < hw ? r : hw;

    // Bottom edge of diffuser section
    shape.moveTo(-domeR, baseTopY);
    shape.lineTo(domeR, baseTopY);

    // Dome arc from right over top to left (angle 0 → PI)
    const arcSegments = 16;
    for (let i = 0; i <= arcSegments; i++) {
      const angle = (Math.PI * i) / arcSegments;
      shape.lineTo(Math.cos(angle) * domeR, baseTopY + Math.sin(angle) * domeR);
    }

    return shape;
  }

  /**
   * Open U-channel housing: outer walls + bottom, open at the top (diffuser side).
   * @param {number} splitH — height from top of tube to where housing ends
   */
  static _uBaseShape(w, h, wallT, splitH) {
    const shape = new THREE.Shape();
    const hw = w / 2;
    const hh = h / 2;
    const r = Math.min(hw, hh) * 0.15;
    const topY = hh - splitH; // where housing walls end (open above this)

    // Outer contour (clockwise) with rounded bottom corners
    shape.moveTo(-hw + r, -hh);
    shape.lineTo(hw - r, -hh);
    shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
    shape.lineTo(hw, topY);

    // Step inward across right wall top
    shape.lineTo(hw - wallT, topY);

    // Inner contour (counter-clockwise = back down)
    shape.lineTo(hw - wallT, -hh + wallT);
    shape.lineTo(-hw + wallT, -hh + wallT);
    shape.lineTo(-hw + wallT, topY);

    // Step outward across left wall top
    shape.lineTo(-hw, topY);

    // Outer left wall down with rounded corner (closes shape)
    shape.lineTo(-hw, -hh + r);
    shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

    return shape;
  }

  /**
   * Flat profile: diffuser top cap (thin strip with rounded top corners).
   */
  static _flatDiffuserShape(w, h, wallT) {
    const shape = new THREE.Shape();
    const hw = w / 2;
    const hh = h / 2;
    const r = Math.min(hw, hh) * 0.15;
    const splitY = hh - wallT;

    shape.moveTo(-hw, splitY);
    shape.lineTo(hw, splitY);
    shape.lineTo(hw, hh - r);
    shape.quadraticCurveTo(hw, hh, hw - r, hh);
    shape.lineTo(-hw + r, hh);
    shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
    shape.lineTo(-hw, splitY);

    return shape;
  }

  /**
   * Create a rounded rectangle Shape centered at origin.
   */
  static _roundedRectShape(width, height, radius) {
    const shape = new THREE.Shape();
    const hw = width / 2;
    const hh = height / 2;
    const r = Math.min(radius, hw, hh);

    shape.moveTo(-hw + r, -hh);
    shape.lineTo(hw - r, -hh);
    shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
    shape.lineTo(hw, hh - r);
    shape.quadraticCurveTo(hw, hh, hw - r, hh);
    shape.lineTo(-hw + r, hh);
    shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
    shape.lineTo(-hw, -hh + r);
    shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

    return shape;
  }

  /**
   * Rotate a 2D shape 90° counter-clockwise: (x, y) → (-y, x).
   * ExtrudeGeometry maps shape X → curve Frenet normal (which points DOWN for
   * horizontal curves). Our shapes define +Y as "up" (diffuser side).
   * This rotation maps shape +Y → shape -X → -normal → world UP.
   */
  static _rotateShapeCCW90(shape) {
    const pts = shape.extractPoints(16).shape;
    const rotated = new THREE.Shape();
    for (let i = 0; i < pts.length; i++) {
      const rx = -pts[i].y;
      const ry = pts[i].x;
      if (i === 0) rotated.moveTo(rx, ry);
      else rotated.lineTo(rx, ry);
    }
    return rotated;
  }

  /**
   * Extrude a shape along a curve path.
   */
  static _extrudeAlongCurve(shape, curve, tubeModel) {
    // Rotate shape so +Y (diffuser/up) maps to world up
    // Frenet normal points DOWN for horizontal curves, so CCW rotation
    // maps shape +Y → shape -X → -normal → world UP
    const rotated = this._rotateShapeCCW90(shape);

    // For uv-mapped mode: at least as many steps as pixels, keep smooth rendering
    const normalSteps = CurveBuilder.getExtrudeSteps(curve);
    const pixelCount = Math.max(1, Math.round(CurveBuilder.getLength(curve) * tubeModel.pixelsPerMeter));
    const steps = tubeModel.pixelMode === 'uv-mapped'
      ? Math.max(normalSteps, pixelCount)
      : normalSteps;
    const geometry = new THREE.ExtrudeGeometry(rotated, {
      steps: steps,
      bevelEnabled: false,
      extrudePath: curve,
    });
    return geometry;
  }

  /**
   * Build a round tube with hemispherical end caps, returning a new merged geometry.
   */
  static _buildRoundWithCaps(tubeGeometry, curve, radius, segments) {
    // Start cap
    const startPoint = curve.getPointAt(0);
    const startTangent = curve.getTangentAt(0).normalize();
    const startCap = new THREE.SphereGeometry(radius, segments, Math.max(6, segments / 2), 0, Math.PI * 2, 0, Math.PI / 2);

    const up = new THREE.Vector3(0, 1, 0);
    // Guard against degenerate case when tangent is parallel to up
    const negTangent = startTangent.clone().negate();
    if (Math.abs(negTangent.dot(up)) > 0.999) {
      // Use a different reference axis
      up.set(1, 0, 0);
    }
    const startQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), negTangent);
    const startMatrix = new THREE.Matrix4().compose(startPoint, startQuat, new THREE.Vector3(1, 1, 1));
    startCap.applyMatrix4(startMatrix);

    // End cap
    const endPoint = curve.getPointAt(1);
    const endTangent = curve.getTangentAt(1).normalize();
    const endCap = new THREE.SphereGeometry(radius, segments, Math.max(6, segments / 2), 0, Math.PI * 2, 0, Math.PI / 2);

    const endQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), endTangent);
    const endMatrix = new THREE.Matrix4().compose(endPoint, endQuat, new THREE.Vector3(1, 1, 1));
    endCap.applyMatrix4(endMatrix);

    // Merge into a single new geometry
    const merged = mergeGeometries([tubeGeometry, startCap, endCap]);

    startCap.dispose();
    endCap.dispose();

    return merged;
  }
}

/**
 * Simple geometry merge (no dependency on BufferGeometryUtils for CDN simplicity).
 */
function mergeGeometries(geometries) {
  if (!geometries || geometries.length === 0) return null;

  // Ensure all geometries are indexed or all non-indexed (convert if needed)
  for (const geo of geometries) {
    if (!geo.getAttribute('position')) return null;
    if (geo.index === null) {
      // Convert non-indexed to indexed
      const pos = geo.getAttribute('position');
      const indices = [];
      for (let i = 0; i < pos.count; i++) indices.push(i);
      geo.setIndex(indices);
    }
  }

  // Collect only attributes common to ALL geometries
  const commonAttrs = Object.keys(geometries[0].attributes).filter(attr => {
    const first = geometries[0].getAttribute(attr);
    return geometries.every(geo => {
      const a = geo.getAttribute(attr);
      return a && a.itemSize === first.itemSize;
    });
  });

  if (!commonAttrs.includes('position')) return null;

  let totalVerts = 0;
  let totalIndices = 0;
  for (const geo of geometries) {
    totalVerts += geo.getAttribute('position').count;
    totalIndices += geo.index.count;
  }

  // Merge common attributes
  const merged = new THREE.BufferGeometry();
  for (const attr of commonAttrs) {
    const itemSize = geometries[0].getAttribute(attr).itemSize;
    const arr = new Float32Array(totalVerts * itemSize);
    let offset = 0;
    for (const geo of geometries) {
      const a = geo.getAttribute(attr);
      arr.set(a.array.subarray(0, a.count * itemSize), offset);
      offset += a.count * itemSize;
    }
    merged.setAttribute(attr, new THREE.BufferAttribute(arr, itemSize));
  }

  // Merge indices with vertex offset
  const indices = new Uint32Array(totalIndices);
  let indexOffset = 0;
  let vertOffset = 0;
  for (const geo of geometries) {
    const idx = geo.index;
    for (let i = 0; i < idx.count; i++) {
      indices[indexOffset + i] = idx.getX(i) + vertOffset;
    }
    indexOffset += idx.count;
    vertOffset += geo.getAttribute('position').count;
  }
  merged.setIndex(new THREE.BufferAttribute(indices, 1));

  return merged;
}
