import * as THREE from 'three';
import { simplifyPath } from '../utils/SimplifyPath.js';

/**
 * Extract sharp edges from a 3D model and assemble them into continuous
 * polyline chains suitable for tube creation.
 */

/**
 * Extract edge segments from all meshes in a group using EdgesGeometry.
 * @param {THREE.Group} group - root group of the model
 * @param {number} angleThresholdDeg - edge angle threshold in degrees (default 30)
 * @param {number} minLengthM - minimum edge segment length in meters (default 0.005)
 * @returns {{ start: THREE.Vector3, end: THREE.Vector3 }[]}
 */
export function extractEdges(group, angleThresholdDeg = 30, minLengthM = 0.005) {
  const segments = [];

  group.updateMatrixWorld(true);

  group.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;

    const edgesGeo = new THREE.EdgesGeometry(child.geometry, angleThresholdDeg);
    const posAttr = edgesGeo.getAttribute('position');

    if (posAttr) {
      const v0 = new THREE.Vector3();
      const v1 = new THREE.Vector3();

      for (let i = 0; i < posAttr.count; i += 2) {
        v0.fromBufferAttribute(posAttr, i).applyMatrix4(child.matrixWorld);
        v1.fromBufferAttribute(posAttr, i + 1).applyMatrix4(child.matrixWorld);

        if (v0.distanceTo(v1) >= minLengthM) {
          segments.push({ start: v0.clone(), end: v1.clone() });
        }
      }
    }

    edgesGeo.dispose();
  });

  return segments;
}

/**
 * Build a vertex graph by merging nearby endpoints with spatial hashing.
 * @param {{ start: THREE.Vector3, end: THREE.Vector3 }[]} segments
 * @param {number} tolerance - merge distance (default 0.001m = 1mm)
 * @returns {{ vertices: THREE.Vector3[], adjacency: Set<number>[] }}
 */
export function buildVertexGraph(segments, tolerance = 0.001) {
  const cellSize = tolerance * 2;
  const vertexMap = new Map(); // hash → vertex index
  const vertices = [];
  const adjacency = [];

  function hashKey(v) {
    const x = Math.round(v.x / cellSize);
    const y = Math.round(v.y / cellSize);
    const z = Math.round(v.z / cellSize);
    return `${x},${y},${z}`;
  }

  function findOrAddVertex(v) {
    // Check the cell and all 26 neighbours
    const cx = Math.round(v.x / cellSize);
    const cy = Math.round(v.y / cellSize);
    const cz = Math.round(v.z / cellSize);

    let bestIdx = -1;
    let bestDist = tolerance;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const key = `${cx + dx},${cy + dy},${cz + dz}`;
          const idx = vertexMap.get(key);
          if (idx !== undefined) {
            const dist = vertices[idx].distanceTo(v);
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = idx;
            }
          }
        }
      }
    }

    if (bestIdx >= 0) return bestIdx;

    // New vertex
    const idx = vertices.length;
    vertices.push(v.clone());
    adjacency.push(new Set());
    vertexMap.set(hashKey(v), idx);
    return idx;
  }

  for (const seg of segments) {
    const a = findOrAddVertex(seg.start);
    const b = findOrAddVertex(seg.end);
    if (a !== b) {
      adjacency[a].add(b);
      adjacency[b].add(a);
    }
  }

  return { vertices, adjacency };
}

/**
 * Walk the vertex graph to extract continuous polyline chains.
 * Starts from degree-1 nodes (endpoints), then picks up remaining closed loops.
 * @param {THREE.Vector3[]} vertices
 * @param {Set<number>[]} adjacency
 * @returns {{ points: THREE.Vector3[], closed: boolean }[]}
 */
export function traceChains(vertices, adjacency) {
  const chains = [];
  const visitedEdges = new Set();

  function edgeKey(a, b) {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
  }

  function walk(startIdx) {
    const points = [vertices[startIdx].clone()];
    let current = startIdx;
    let prev = -1;

    while (true) {
      let next = -1;

      // Collect unvisited, non-backtracking neighbors
      const candidates = [];
      for (const neighbor of adjacency[current]) {
        const ek = edgeKey(current, neighbor);
        if (!visitedEdges.has(ek) && neighbor !== prev) {
          candidates.push(neighbor);
        }
      }

      if (candidates.length === 1) {
        next = candidates[0];
      } else if (candidates.length > 1 && prev >= 0) {
        // At a junction: prefer the neighbor that continues most straight-ahead.
        // This keeps main rails as single continuous chains instead of turning
        // onto cross-braces at attachment points.
        const dirIn = new THREE.Vector3().subVectors(
          vertices[current], vertices[prev]
        ).normalize();
        let bestAngle = Infinity;
        for (const neighbor of candidates) {
          const dirOut = new THREE.Vector3().subVectors(
            vertices[neighbor], vertices[current]
          ).normalize();
          const angle = dirIn.angleTo(dirOut);
          if (angle < bestAngle) {
            bestAngle = angle;
            next = neighbor;
          }
        }
      } else if (candidates.length > 1) {
        // First step (no prev) — pick any
        next = candidates[0];
      }

      if (next === -1) {
        // Try any unvisited edge (even back-tracking)
        for (const neighbor of adjacency[current]) {
          const ek = edgeKey(current, neighbor);
          if (!visitedEdges.has(ek)) {
            next = neighbor;
            break;
          }
        }
      }

      if (next === -1) break;

      visitedEdges.add(edgeKey(current, next));
      prev = current;
      current = next;

      if (current === startIdx) {
        // Closed loop
        return { points, closed: true };
      }

      points.push(vertices[current].clone());
    }

    return { points, closed: false };
  }

  // Phase 1: start from degree-1 nodes (endpoints)
  for (let i = 0; i < vertices.length; i++) {
    if (adjacency[i].size === 1) {
      // Check if the single edge is unvisited
      for (const neighbor of adjacency[i]) {
        if (!visitedEdges.has(edgeKey(i, neighbor))) {
          const chain = walk(i);
          if (chain.points.length >= 2) chains.push(chain);
        }
      }
    }
  }

  // Phase 2: pick up remaining closed loops
  for (let i = 0; i < vertices.length; i++) {
    for (const neighbor of adjacency[i]) {
      const ek = edgeKey(i, neighbor);
      if (!visitedEdges.has(ek)) {
        const chain = walk(i);
        if (chain.points.length >= 2) chains.push(chain);
      }
    }
  }

  return chains;
}

/**
 * Main facade: extract edges from a model group and return assembled chains.
 * @param {THREE.Group} group - the 3D model group
 * @param {object} [options]
 * @param {number} [options.angleThreshold=30] - edge detection angle in degrees
 * @param {number} [options.minEdgeLength=0.005] - minimum edge segment length (m)
 * @param {number} [options.tolerance=0.001] - vertex merge distance (m)
 * @param {number} [options.simplifyEpsilon] - auto-computed if omitted
 * @param {number} [options.minChainLength=0.01] - discard chains shorter than this (m)
 * @returns {{ chains: { points: THREE.Vector3[], closed: boolean }[], stats: object }}
 */
export function mapEdges(group, options = {}) {
  const {
    angleThreshold = 30,
    minEdgeLength = 0.005,
    tolerance = 0.001,
    minChainLength = 0.01,
  } = options;

  // Extract raw edge segments
  const segments = extractEdges(group, angleThreshold, minEdgeLength);

  if (segments.length === 0) {
    return { chains: [], stats: { edges: 0, vertices: 0, chains: 0 } };
  }

  // Build vertex graph
  const { vertices, adjacency } = buildVertexGraph(segments, tolerance);

  // Trace continuous chains
  let chains = traceChains(vertices, adjacency);

  // Auto-compute simplification epsilon from bounding box
  let epsilon = options.simplifyEpsilon;
  if (epsilon == null) {
    const box = new THREE.Box3();
    for (const v of vertices) box.expandByPoint(v);
    const size = new THREE.Vector3();
    box.getSize(size);
    const diagonal = size.length();
    epsilon = diagonal * 0.005; // 0.5% of bounding box diagonal
  }

  // Simplify and filter chains
  chains = chains
    .map((chain) => {
      const simplified = simplifyPath(chain.points, epsilon);
      return { points: simplified, closed: chain.closed };
    })
    .filter((chain) => {
      // Compute total polyline length
      let len = 0;
      for (let i = 1; i < chain.points.length; i++) {
        len += chain.points[i].distanceTo(chain.points[i - 1]);
      }
      if (chain.closed && chain.points.length >= 2) {
        len += chain.points[chain.points.length - 1].distanceTo(chain.points[0]);
      }
      return len >= minChainLength && chain.points.length >= 2;
    });

  return {
    chains,
    stats: {
      edges: segments.length,
      vertices: vertices.length,
      chains: chains.length,
    },
  };
}
