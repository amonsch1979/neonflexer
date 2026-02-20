import * as THREE from 'three';

/**
 * Ramer-Douglas-Peucker simplification for 3D points.
 * @param {THREE.Vector3[]} points
 * @param {number} epsilon - tolerance in meters
 * @returns {THREE.Vector3[]}
 */
export function simplifyPath(points, epsilon = 0.005) {
  if (points.length <= 2) return points.slice();

  // Find the point with the maximum distance from the line start->end
  let maxDist = 0;
  let maxIdx = 0;
  const start = points[0];
  const end = points[points.length - 1];
  const line = new THREE.Line3(start, end);

  const closestPoint = new THREE.Vector3();
  for (let i = 1; i < points.length - 1; i++) {
    line.closestPointToPoint(points[i], true, closestPoint);
    const dist = points[i].distanceTo(closestPoint);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPath(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyPath(points.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  } else {
    return [start.clone(), end.clone()];
  }
}
