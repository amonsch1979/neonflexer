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
    const segments = CurveBuilder.getTubularSegments(curve);
    const radialSegments = 24;
    const radius = tubeModel.outerRadius;

    const tubeGeo = new THREE.TubeGeometry(
      curve,
      segments,
      radius,
      radialSegments,
      tubeModel.closed
    );

    // Add end caps if not closed
    if (!tubeModel.closed) {
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
    const shape = this._roundedRectShape(size, size, size * 0.15);
    return this._extrudeAlongCurve(shape, curve, tubeModel);
  }

  /**
   * Build rectangular tube using ExtrudeGeometry.
   */
  static _buildRect(curve, tubeModel) {
    const w = tubeModel.widthM;
    const h = tubeModel.heightM;
    const cornerR = Math.min(w, h) * 0.15;
    const shape = this._roundedRectShape(w, h, cornerR);
    return this._extrudeAlongCurve(shape, curve, tubeModel);
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
   * Extrude a shape along a curve path.
   */
  static _extrudeAlongCurve(shape, curve, tubeModel) {
    const steps = CurveBuilder.getExtrudeSteps(curve);
    const geometry = new THREE.ExtrudeGeometry(shape, {
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
