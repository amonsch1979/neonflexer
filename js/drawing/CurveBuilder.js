import * as THREE from 'three';

export class CurveBuilder {
  /**
   * Build a CatmullRomCurve3 from control points.
   * @param {THREE.Vector3[]} points - at least 2 points
   * @param {number} tension - 0 to 1 (0.5 = natural)
   * @param {boolean} closed - loop the curve
   * @returns {THREE.CatmullRomCurve3|null}
   */
  static build(points, tension = 0.5, closed = false) {
    if (!points || points.length < 2) return null;
    return new THREE.CatmullRomCurve3(
      points.map(p => p.clone()),
      closed,
      'catmullrom',
      tension
    );
  }

  /**
   * Get the total arc length of the curve in meters.
   */
  static getLength(curve) {
    return curve ? curve.getLength() : 0;
  }

  /**
   * Calculate tubular segments for smooth rendering.
   * ~300 segments per meter of curve length.
   */
  static getTubularSegments(curve) {
    if (!curve) return 64;
    const length = curve.getLength();
    return Math.min(2000, Math.max(64, Math.round(length * 300)));
  }

  /**
   * Calculate extrude steps for square/rect profiles.
   * ~300 steps per meter, capped at 2000 to prevent GPU overload on long tubes.
   */
  static getExtrudeSteps(curve) {
    if (!curve) return 64;
    const length = curve.getLength();
    return Math.min(2000, Math.max(64, Math.round(length * 300)));
  }

  /**
   * Get evenly-spaced points along curve using arc-length parameterization.
   * @param {THREE.CatmullRomCurve3} curve
   * @param {number} count - number of points
   * @returns {THREE.Vector3[]}
   */
  static getEvenPoints(curve, count) {
    if (!curve || count < 1) return [];
    const points = [];
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      points.push(curve.getPointAt(t));
    }
    return points;
  }

  /**
   * Get points at a specific pixel pitch (pixels per meter).
   * @param {THREE.CatmullRomCurve3} curve
   * @param {number} pixelsPerMeter
   * @returns {{ points: THREE.Vector3[], count: number }}
   */
  static getPixelPoints(curve, pixelsPerMeter) {
    if (!curve || pixelsPerMeter <= 0) return { points: [], count: 0 };
    const length = curve.getLength();
    const count = Math.max(1, Math.round(length * pixelsPerMeter));
    const points = [];
    for (let i = 0; i < count; i++) {
      // Center pixels: offset by half-spacing from each end
      const t = count === 1 ? 0.5 : (i + 0.5) / count;
      points.push(curve.getPointAt(Math.min(t, 1)));
    }
    return { points, count };
  }

  /**
   * Create a preview line geometry for the curve.
   */
  static createPreviewLine(curve, color = 0x00d4ff) {
    if (!curve) return null;
    const pts = curve.getPoints(200);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, linewidth: 1 });
    const line = new THREE.Line(geo, mat);
    line.name = '__preview_line';
    return line;
  }
}
