import * as THREE from 'three';
import { CurveBuilder } from '../drawing/CurveBuilder.js';

/**
 * Control points per meter of arc length for segment reconstruction.
 * Higher = more accurate rebuild but more control points.
 * 200/m keeps CatmullRom rebuild error well under 0.1mm (~5mm spacing).
 */
const POINTS_PER_METER = 200;

/**
 * Length tolerance — 0.3mm so rounding to integer mm always shows exact value.
 */
const LENGTH_TOLERANCE_M = 0.0003;

/**
 * Max correction iterations to hit exact target length.
 */
const MAX_CORRECTIONS = 24;

/**
 * Auto-segments a tube path into multiple segments based on a maximum length,
 * inserting connector positions at each junction.
 *
 * Each segment (except possibly the last) will have exactly maxLengthM arc length
 * when rebuilt as a CatmullRom curve. Uses direct arc-length parameterization
 * with iterative correction for sub-mm precision.
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
  if (totalLength <= maxLengthM + LENGTH_TOLERANCE_M) {
    return { segments: [controlPoints], connectors: [] };
  }

  // Pre-compute numPts for the target length — used consistently everywhere
  const numPts = Math.max(15, Math.ceil(maxLengthM * POINTS_PER_METER));

  const segments = [];
  const connectors = [];

  let currentT = 0;

  while (currentT < 1.0 - 1e-9) {
    const remainingArc = (1.0 - currentT) * totalLength;

    // Last segment: remaining fits in maxLength
    const isLast = remainingArc <= maxLengthM + LENGTH_TOLERANCE_M;

    let segEndT;
    let segNumPts;
    if (isLast) {
      segEndT = 1.0;
      segNumPts = Math.max(15, Math.ceil(remainingArc * POINTS_PER_METER));
    } else {
      // Find the exact endT that produces a segment of maxLengthM
      segEndT = _findExactEndT(curve, totalLength, currentT, maxLengthM, tension, numPts);
      segNumPts = numPts; // same as used during correction
    }

    // Sample control points for this segment using the SAME numPts as measurement
    const segPoints = [];
    for (let i = 0; i <= segNumPts; i++) {
      const t = currentT + (segEndT - currentT) * (i / segNumPts);
      segPoints.push(curve.getPointAt(Math.min(t, 1.0)));
    }
    segments.push(segPoints);

    // Place connector at junction (except after last segment)
    if (!isLast) {
      const connPos = curve.getPointAt(Math.min(segEndT, 1.0));
      const connTan = curve.getTangentAt(Math.min(segEndT, 1.0));
      connectors.push({ position: connPos, tangent: connTan });

      // Next segment starts at the SAME junction point (connector center).
      currentT = segEndT;
    } else {
      break;
    }
  }

  return { segments, connectors };
}

/**
 * Find endT using proportional correction with bisection safety bounds.
 * Pure proportional correction can oscillate when CatmullRom rebuild
 * introduces consistent length bias. Bisection bounds prevent overshoot
 * and guarantee convergence.
 */
function _findExactEndT(curve, totalLength, startT, targetLength, tension, numPts) {
  // Initial guess from arc-length parameterization
  let endT = startT + targetLength / totalLength;
  endT = Math.min(endT, 1.0);

  // Bisection bounds — narrow on every iteration to prevent oscillation
  let lowT = startT;
  let highT = Math.min(1.0, startT + 2 * targetLength / totalLength);

  for (let iter = 0; iter < MAX_CORRECTIONS; iter++) {
    const measured = _measureSegmentExact(curve, startT, endT, numPts, tension);
    const error = measured - targetLength;

    // Within tolerance — done
    if (Math.abs(error) < LENGTH_TOLERANCE_M) return endT;

    // Tighten bisection bounds
    if (error > 0) {
      highT = endT; // segment too long — upper bound shrinks
    } else {
      lowT = endT;  // segment too short — lower bound grows
    }

    // Proportional correction (fast convergence when it works)
    const tSpan = endT - startT;
    const correctionRatio = targetLength / measured;
    let nextEndT = startT + tSpan * correctionRatio;

    // If proportional step escapes bisection bounds, fall back to bisection midpoint
    if (nextEndT <= lowT || nextEndT >= highT) {
      nextEndT = (lowT + highT) / 2;
    }

    endT = Math.min(nextEndT, 1.0);
  }

  return endT;
}

/**
 * Measure a segment using CurveBuilder — the EXACT same code path as the UI display.
 * This guarantees the measured length here matches what TubeListPanel.getTubeLength() shows.
 */
function _measureSegmentExact(curve, startT, endT, numPts, tension) {
  const points = [];
  for (let i = 0; i <= numPts; i++) {
    const t = startT + (endT - startT) * (i / numPts);
    points.push(curve.getPointAt(Math.min(t, 1.0)));
  }
  const segCurve = CurveBuilder.build(points, tension, false);
  return CurveBuilder.getLength(segCurve);
}
