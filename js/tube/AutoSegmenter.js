import * as THREE from 'three';
import { CurveBuilder } from '../drawing/CurveBuilder.js';

/**
 * Control points per meter of arc length for segment reconstruction.
 * Higher = more accurate arc length but more control points.
 * 10/m gives sub-mm accuracy on typical curves.
 */
const POINTS_PER_METER = 10;

/**
 * Binary search tolerance — 0.5mm precision.
 */
const LENGTH_TOLERANCE_M = 0.0005;

/**
 * Auto-segments a tube path into multiple segments based on a maximum length,
 * inserting connector positions at each junction.
 *
 * Each segment (except possibly the last) will have exactly maxLengthM arc length
 * when rebuilt as a CatmullRom curve. Both segments meet at the connector center —
 * the connector visually covers the joint.
 *
 * @param {THREE.Vector3[]} controlPoints - Original control points
 * @param {number} maxLengthM - Maximum length per segment in meters
 * @param {number} connectorHeightM - Height of connector in meters (visual only, not deducted from segments)
 * @param {number} tension - CatmullRom tension (default 0.5)
 * @returns {{ segments: THREE.Vector3[][], connectors: { position: THREE.Vector3, tangent: THREE.Vector3 }[] }}
 */
export function autoSegment(controlPoints, maxLengthM, connectorHeightM = 0.03, tension = 0.5) {
  if (!controlPoints || controlPoints.length < 2 || !maxLengthM || maxLengthM <= 0) {
    return { segments: [controlPoints], connectors: [] };
  }

  const curve = CurveBuilder.build(controlPoints, tension, false);
  if (!curve) {
    return { segments: [controlPoints], connectors: [] };
  }

  const totalLength = CurveBuilder.getLength(curve);

  // If total length fits in one segment, no splitting needed
  if (totalLength <= maxLengthM) {
    return { segments: [controlPoints], connectors: [] };
  }

  const segments = [];
  const connectors = [];

  let currentT = 0;

  while (currentT < 1.0 - 1e-9) {
    const remainingArc = (1.0 - currentT) * totalLength;

    // Last segment: remaining fits in maxLength
    const isLast = remainingArc <= maxLengthM + LENGTH_TOLERANCE_M;

    let segEndT;
    if (isLast) {
      segEndT = 1.0;
    } else {
      // Binary search for the end T that produces a reconstructed segment
      // of exactly maxLengthM arc length
      segEndT = _findEndTForLength(curve, totalLength, currentT, maxLengthM, tension);
    }

    // Sample control points for this segment
    const segArc = (segEndT - currentT) * totalLength;
    const numPts = Math.max(10, Math.ceil(segArc * POINTS_PER_METER));
    const segPoints = [];
    for (let i = 0; i <= numPts; i++) {
      const t = currentT + (segEndT - currentT) * (i / numPts);
      segPoints.push(curve.getPointAt(Math.min(t, 1.0)));
    }
    segments.push(segPoints);

    // Place connector at junction (except after last segment)
    if (!isLast) {
      const connPos = curve.getPointAt(Math.min(segEndT, 1.0));
      const connTan = curve.getTangentAt(Math.min(segEndT, 1.0));
      connectors.push({ position: connPos, tangent: connTan });

      // Next segment starts at the SAME junction point (connector center).
      // Both tubes meet at the connector — the connector mesh covers the joint.
      currentT = segEndT;
    } else {
      break;
    }
  }

  return { segments, connectors };
}

/**
 * Binary search for endT such that the CatmullRom curve built from sampled
 * points between startT and endT has exactly targetLength arc length.
 */
function _findEndTForLength(curve, totalLength, startT, targetLength, tension) {
  const tSpan = targetLength / totalLength;

  // Search bounds: ±10% around the linear guess
  let lo = startT + tSpan * 0.90;
  let hi = Math.min(startT + tSpan * 1.10, 1.0);

  for (let iter = 0; iter < 20; iter++) {
    const mid = (lo + hi) / 2;
    const len = _measureSegment(curve, totalLength, startT, mid, tension);

    if (Math.abs(len - targetLength) < LENGTH_TOLERANCE_M) return mid;

    if (len < targetLength) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return (lo + hi) / 2;
}

/**
 * Build a CatmullRom from sampled points and measure its arc length.
 * This mirrors exactly how TubeManager builds the tube curve, so the
 * measured length will match what the UI displays.
 */
function _measureSegment(curve, totalLength, startT, endT, tension) {
  const segArc = (endT - startT) * totalLength;
  const numPts = Math.max(10, Math.ceil(segArc * POINTS_PER_METER));
  const points = [];
  for (let i = 0; i <= numPts; i++) {
    const t = startT + (endT - startT) * (i / numPts);
    points.push(curve.getPointAt(Math.min(t, 1.0)));
  }
  const segCurve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', tension);
  // Scale arcLengthDivisions to match CurveBuilder.getLength for consistent measurement
  segCurve.arcLengthDivisions = Math.max(200, points.length * 10);
  return segCurve.getLength();
}
