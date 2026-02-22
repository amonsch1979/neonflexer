import * as THREE from 'three';

/**
 * Pure math generators for 3D shape vertices and edges.
 * Each shape returns { vertices: Vector3[], edges: [indexA, indexB][] }
 */
export class ShapeGeometryGenerator {

  /**
   * Generate a box (rectangular prism) with given dimensions.
   * @param {number} x - width (meters)
   * @param {number} y - height (meters)
   * @param {number} z - depth (meters)
   * @returns {{ vertices: THREE.Vector3[], edges: number[][] }}
   */
  static generateBoxVertices(x, y, z) {
    const hx = x / 2, hy = y / 2, hz = z / 2;
    const vertices = [
      new THREE.Vector3(-hx, -hy, -hz), // 0: bottom-back-left
      new THREE.Vector3( hx, -hy, -hz), // 1: bottom-back-right
      new THREE.Vector3( hx, -hy,  hz), // 2: bottom-front-right
      new THREE.Vector3(-hx, -hy,  hz), // 3: bottom-front-left
      new THREE.Vector3(-hx,  hy, -hz), // 4: top-back-left
      new THREE.Vector3( hx,  hy, -hz), // 5: top-back-right
      new THREE.Vector3( hx,  hy,  hz), // 6: top-front-right
      new THREE.Vector3(-hx,  hy,  hz), // 7: top-front-left
    ];
    const edges = [
      // bottom face
      [0, 1], [1, 2], [2, 3], [3, 0],
      // top face
      [4, 5], [5, 6], [6, 7], [7, 4],
      // vertical edges
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    return { vertices, edges };
  }

  /**
   * Generate a regular polygon on a given plane.
   * @param {number} sides - number of sides (3=triangle, 5=pentagon, 6=hexagon, etc.)
   * @param {number} sideLength - length of each side in meters
   * @param {'XZ'|'XY'|'YZ'} plane - drawing plane
   * @returns {{ vertices: THREE.Vector3[], edges: number[][] }}
   */
  static generateRegularPolygonVertices(sides, sideLength, plane = 'XZ') {
    // Circumradius from side length: R = sideLength / (2 * sin(PI/sides))
    const R = sideLength / (2 * Math.sin(Math.PI / sides));
    const vertices = [];
    const edges = [];

    for (let i = 0; i < sides; i++) {
      // Start from top (negative angle offset so first edge is horizontal for even-sided)
      const angle = (2 * Math.PI * i / sides) - Math.PI / 2;
      const a = Math.cos(angle) * R;
      const b = Math.sin(angle) * R;
      vertices.push(this._planePoint(a, b, plane));
      edges.push([i, (i + 1) % sides]);
    }

    return { vertices, edges };
  }

  /**
   * Generate a triangle (3-sided regular polygon).
   */
  static generateTriangleVertices(sideLength, plane = 'XZ') {
    return this.generateRegularPolygonVertices(3, sideLength, plane);
  }

  /**
   * Generate a pentagon (5-sided regular polygon).
   */
  static generatePentagonVertices(sideLength, plane = 'XZ') {
    return this.generateRegularPolygonVertices(5, sideLength, plane);
  }

  /**
   * Generate a hexagon (6-sided regular polygon).
   */
  static generateHexagonVertices(sideLength, plane = 'XZ') {
    return this.generateRegularPolygonVertices(6, sideLength, plane);
  }

  /**
   * Generate a star shape with alternating outer/inner vertices.
   * @param {number} points - number of star points
   * @param {number} outerRadius - outer radius in meters
   * @param {number} innerRatio - inner radius as fraction of outer (0-1)
   * @param {'XZ'|'XY'|'YZ'} plane
   * @returns {{ vertices: THREE.Vector3[], edges: number[][] }}
   */
  static generateStarVertices(points, outerRadius, innerRatio = 0.5, plane = 'XZ') {
    const innerRadius = outerRadius * innerRatio;
    const totalVerts = points * 2;
    const vertices = [];
    const edges = [];

    for (let i = 0; i < totalVerts; i++) {
      const angle = (2 * Math.PI * i / totalVerts) - Math.PI / 2;
      const r = i % 2 === 0 ? outerRadius : innerRadius;
      const a = Math.cos(angle) * r;
      const b = Math.sin(angle) * r;
      vertices.push(this._planePoint(a, b, plane));
      edges.push([i, (i + 1) % totalVerts]);
    }

    return { vertices, edges };
  }

  /**
   * Compute evenly-spaced intermediate points along a straight edge.
   * @param {THREE.Vector3} v1 - start vertex
   * @param {THREE.Vector3} v2 - end vertex
   * @param {number} numPoints - total points including endpoints (min 2)
   * @returns {THREE.Vector3[]}
   */
  static computeEdgePoints(v1, v2, numPoints = 2) {
    const points = [];
    for (let i = 0; i < numPoints; i++) {
      const t = numPoints === 1 ? 0 : i / (numPoints - 1);
      points.push(v1.clone().lerp(v2.clone(), t));
    }
    return points;
  }

  /**
   * Get which edges connect to a vertex.
   * @param {number[][]} edges - array of [indexA, indexB]
   * @param {number} vertexIndex
   * @returns {number[]} indices into the edges array
   */
  static getVertexEdges(edges, vertexIndex) {
    const result = [];
    for (let i = 0; i < edges.length; i++) {
      if (edges[i][0] === vertexIndex || edges[i][1] === vertexIndex) {
        result.push(i);
      }
    }
    return result;
  }

  /**
   * Get the angle between two edges at a shared vertex.
   * @param {THREE.Vector3[]} vertices
   * @param {number[][]} edges
   * @param {number} edgeA - index into edges array
   * @param {number} edgeB - index into edges array
   * @param {number} sharedVertex - vertex index
   * @returns {number} angle in radians
   */
  static getEdgeAngle(vertices, edges, edgeA, edgeB, sharedVertex) {
    const otherA = edges[edgeA][0] === sharedVertex ? edges[edgeA][1] : edges[edgeA][0];
    const otherB = edges[edgeB][0] === sharedVertex ? edges[edgeB][1] : edges[edgeB][0];

    const dirA = vertices[otherA].clone().sub(vertices[sharedVertex]).normalize();
    const dirB = vertices[otherB].clone().sub(vertices[sharedVertex]).normalize();

    return Math.acos(Math.max(-1, Math.min(1, dirA.dot(dirB))));
  }

  /**
   * Generate a 3D grid with given cell counts and cell size.
   * @param {number} gx - cells along X (1-10)
   * @param {number} gy - cells along Y (1-10)
   * @param {number} gz - cells along Z (1-10)
   * @param {number} cellSize - size of each cell in meters
   * @returns {{ vertices: THREE.Vector3[], edges: number[][] }}
   */
  static generateGridVertices(gx, gy, gz, cellSize, cellSizeY, cellSizeZ) {
    const vertices = [];
    const edges = [];
    const nx = gx + 1, ny = gy + 1, nz = gz + 1;
    const csx = cellSize;
    const csy = cellSizeY || cellSize;
    const csz = cellSizeZ || cellSize;
    const ox = (gx * csx) / 2, oy = (gy * csy) / 2, oz = (gz * csz) / 2;

    // Create vertices — index = iz * ny * nx + iy * nx + ix
    for (let iz = 0; iz < nz; iz++) {
      for (let iy = 0; iy < ny; iy++) {
        for (let ix = 0; ix < nx; ix++) {
          vertices.push(new THREE.Vector3(
            ix * csx - ox,
            iy * csy - oy,
            iz * csz - oz
          ));
        }
      }
    }

    const idx = (ix, iy, iz) => iz * ny * nx + iy * nx + ix;

    // X-axis edges
    for (let iz = 0; iz < nz; iz++)
      for (let iy = 0; iy < ny; iy++)
        for (let ix = 0; ix < gx; ix++)
          edges.push([idx(ix, iy, iz), idx(ix + 1, iy, iz)]);

    // Y-axis edges
    for (let iz = 0; iz < nz; iz++)
      for (let iy = 0; iy < gy; iy++)
        for (let ix = 0; ix < nx; ix++)
          edges.push([idx(ix, iy, iz), idx(ix, iy + 1, iz)]);

    // Z-axis edges
    for (let iz = 0; iz < gz; iz++)
      for (let iy = 0; iy < ny; iy++)
        for (let ix = 0; ix < nx; ix++)
          edges.push([idx(ix, iy, iz), idx(ix, iy, iz + 1)]);

    return { vertices, edges };
  }

  /**
   * Generate a cylinder with given parameters.
   * @param {number} sides - number of sides around circumference (4-32)
   * @param {number} rings - number of ring divisions along height (1-10)
   * @param {number} radius - radius in meters
   * @param {number} height - height in meters
   * @returns {{ vertices: THREE.Vector3[], edges: number[][] }}
   */
  static generateCylinderVertices(sides, rings, radius, height) {
    const vertices = [];
    const edges = [];
    const levels = rings + 1;
    const hy = height / 2;

    // Vertices: level * sides + sideIndex
    for (let li = 0; li < levels; li++) {
      const y = -hy + (li / rings) * height;
      for (let si = 0; si < sides; si++) {
        const angle = (2 * Math.PI * si / sides);
        vertices.push(new THREE.Vector3(
          Math.cos(angle) * radius,
          y,
          Math.sin(angle) * radius
        ));
      }
    }

    // Ring edges (horizontal)
    for (let li = 0; li < levels; li++) {
      const base = li * sides;
      for (let si = 0; si < sides; si++) {
        edges.push([base + si, base + (si + 1) % sides]);
      }
    }

    // Vertical bar edges
    for (let li = 0; li < rings; li++) {
      const base = li * sides;
      for (let si = 0; si < sides; si++) {
        edges.push([base + si, base + sides + si]);
      }
    }

    return { vertices, edges };
  }

  /**
   * Generate a sphere (UV sphere) with poles.
   * @param {number} meridians - longitude segments (4-24)
   * @param {number} parallels - latitude segments (3-16)
   * @param {number} radius - radius in meters
   * @returns {{ vertices: THREE.Vector3[], edges: number[][] }}
   */
  static generateSphereVertices(meridians, parallels, radius) {
    const vertices = [];
    const edges = [];

    // Bottom pole (index 0)
    vertices.push(new THREE.Vector3(0, -radius, 0));

    // Interior rings (parallels - 1 rings between poles)
    const innerRings = parallels - 1;
    for (let pi = 1; pi <= innerRings; pi++) {
      const phi = Math.PI * pi / parallels; // 0=top pole, PI=bottom pole
      const y = -radius * Math.cos(phi);
      const ringR = radius * Math.sin(phi);
      for (let mi = 0; mi < meridians; mi++) {
        const theta = 2 * Math.PI * mi / meridians;
        vertices.push(new THREE.Vector3(
          Math.cos(theta) * ringR,
          y,
          Math.sin(theta) * ringR
        ));
      }
    }

    // Top pole (last index)
    const topPole = vertices.length;
    vertices.push(new THREE.Vector3(0, radius, 0));

    // Latitude ring edges
    for (let pi = 0; pi < innerRings; pi++) {
      const base = 1 + pi * meridians;
      for (let mi = 0; mi < meridians; mi++) {
        edges.push([base + mi, base + (mi + 1) % meridians]);
      }
    }

    // Longitude edges — connect bottom pole to first ring
    for (let mi = 0; mi < meridians; mi++) {
      edges.push([0, 1 + mi]);
    }

    // Longitude edges — between adjacent rings
    for (let pi = 0; pi < innerRings - 1; pi++) {
      const base = 1 + pi * meridians;
      for (let mi = 0; mi < meridians; mi++) {
        edges.push([base + mi, base + meridians + mi]);
      }
    }

    // Longitude edges — last ring to top pole
    const lastRingBase = 1 + (innerRings - 1) * meridians;
    for (let mi = 0; mi < meridians; mi++) {
      edges.push([lastRingBase + mi, topPole]);
    }

    return { vertices, edges };
  }

  /**
   * Generate a cone with a polygon base and apex.
   * @param {number} sides - number of base polygon sides (3-32)
   * @param {number} radius - base radius in meters
   * @param {number} height - height in meters
   * @returns {{ vertices: THREE.Vector3[], edges: number[][] }}
   */
  static generateConeVertices(sides, radius, height) {
    const vertices = [];
    const edges = [];
    const hy = height / 2;

    // Base ring vertices (indices 0..sides-1)
    for (let si = 0; si < sides; si++) {
      const angle = 2 * Math.PI * si / sides;
      vertices.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        -hy,
        Math.sin(angle) * radius
      ));
    }

    // Apex (index = sides)
    vertices.push(new THREE.Vector3(0, hy, 0));

    // Base ring edges
    for (let si = 0; si < sides; si++) {
      edges.push([si, (si + 1) % sides]);
    }

    // Apex connection edges
    for (let si = 0; si < sides; si++) {
      edges.push([si, sides]);
    }

    return { vertices, edges };
  }

  /**
   * Generate a prism (extruded regular polygon).
   * @param {number} sides - number of polygon sides (3-32)
   * @param {number} sideLength - length of each polygon side in meters
   * @param {number} height - extrusion height in meters
   * @returns {{ vertices: THREE.Vector3[], edges: number[][] }}
   */
  static generatePrismVertices(sides, sideLength, height) {
    const vertices = [];
    const edges = [];
    const R = sideLength / (2 * Math.sin(Math.PI / sides));
    const hy = height / 2;

    // Bottom ring (indices 0..sides-1)
    for (let si = 0; si < sides; si++) {
      const angle = (2 * Math.PI * si / sides) - Math.PI / 2;
      vertices.push(new THREE.Vector3(
        Math.cos(angle) * R,
        -hy,
        Math.sin(angle) * R
      ));
    }

    // Top ring (indices sides..2*sides-1)
    for (let si = 0; si < sides; si++) {
      const angle = (2 * Math.PI * si / sides) - Math.PI / 2;
      vertices.push(new THREE.Vector3(
        Math.cos(angle) * R,
        hy,
        Math.sin(angle) * R
      ));
    }

    // Bottom ring edges
    for (let si = 0; si < sides; si++) {
      edges.push([si, (si + 1) % sides]);
    }

    // Top ring edges
    for (let si = 0; si < sides; si++) {
      edges.push([sides + si, sides + (si + 1) % sides]);
    }

    // Vertical edges
    for (let si = 0; si < sides; si++) {
      edges.push([si, sides + si]);
    }

    return { vertices, edges };
  }

  /**
   * Generate a torus wireframe.
   * @param {number} majorSeg - segments around the major ring (4-32)
   * @param {number} minorSeg - segments around the tube cross-section (3-16)
   * @param {number} majorR - major radius (center to tube center) in meters
   * @param {number} tubeR - tube radius in meters
   * @returns {{ vertices: THREE.Vector3[], edges: number[][] }}
   */
  static generateTorusVertices(majorSeg, minorSeg, majorR, tubeR) {
    const vertices = [];
    const edges = [];

    // Vertex index: maj * minorSeg + min
    for (let maj = 0; maj < majorSeg; maj++) {
      const theta = 2 * Math.PI * maj / majorSeg;
      const cx = Math.cos(theta) * majorR;
      const cz = Math.sin(theta) * majorR;
      for (let min = 0; min < minorSeg; min++) {
        const phi = 2 * Math.PI * min / minorSeg;
        const r = majorR + Math.cos(phi) * tubeR;
        vertices.push(new THREE.Vector3(
          Math.cos(theta) * r,
          Math.sin(phi) * tubeR,
          Math.sin(theta) * r
        ));
      }
    }

    // Minor ring edges (tube cross-section loops)
    for (let maj = 0; maj < majorSeg; maj++) {
      const base = maj * minorSeg;
      for (let min = 0; min < minorSeg; min++) {
        edges.push([base + min, base + (min + 1) % minorSeg]);
      }
    }

    // Major ring edges (connecting adjacent cross-sections)
    for (let maj = 0; maj < majorSeg; maj++) {
      const nextMaj = (maj + 1) % majorSeg;
      for (let min = 0; min < minorSeg; min++) {
        edges.push([maj * minorSeg + min, nextMaj * minorSeg + min]);
      }
    }

    return { vertices, edges };
  }

  /**
   * Map 2D (a, b) coordinates to a 3D point on the given plane.
   * @private
   */
  static _planePoint(a, b, plane) {
    switch (plane) {
      case 'XY': return new THREE.Vector3(a, b, 0);
      case 'YZ': return new THREE.Vector3(0, b, a);
      case 'XZ':
      default:   return new THREE.Vector3(a, 0, b);
    }
  }
}
