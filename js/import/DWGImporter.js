import { LibreDwg, Dwg_File_Type } from 'libredwg-web';
import * as THREE from 'three';

/**
 * Imports AutoCAD DWG files and converts geometry entities to NeonFlex tube data.
 * Resolves INSERT (block reference) entities recursively to extract actual geometry.
 * Uses libredwg-web (WASM) for parsing.
 */
export class DWGImporter {
  constructor() {
    this._lib = null;
  }

  /**
   * Parse a DWG file buffer and return converted tube data.
   * @param {ArrayBuffer} buffer - Raw DWG file content
   * @param {object} options
   * @param {number} options.scale - Scale factor (default auto-detect)
   * @param {Set<string>|null} options.layers - Layer filter (null = all)
   * @returns {{ tubes: Array, stats: object, layers: Map, entityCounts: object }}
   */
  async parse(buffer, options = {}) {
    const layerFilter = options.layers ?? null;

    // Init WASM library (singleton)
    if (!this._lib) {
      this._lib = await LibreDwg.create();
    }

    // Read DWG data
    const dwgData = this._lib.dwg_read_data(buffer, Dwg_File_Type.DWG);
    if (!dwgData) {
      throw new Error('Failed to parse DWG file — invalid or unsupported format');
    }

    // Convert to DwgDatabase
    const db = this._lib.convert(dwgData);
    this._lib.dwg_free(dwgData);

    const entities = db.entities || [];

    // Build block lookup map from BLOCK_RECORD table
    const blockMap = new Map();
    if (db.tables?.BLOCK_RECORD?.entries) {
      for (const br of db.tables.BLOCK_RECORD.entries) {
        if (br.name && !br.name.startsWith('*')) {
          blockMap.set(br.name, br);
        }
      }
    }

    // Flatten all entities: resolve INSERTs recursively into geometry
    const flatEntities = [];
    for (const ent of entities) {
      this._flattenEntity(ent, blockMap, null, flatEntities, 0);
    }

    // Collect layer info and entity type counts from flattened entities
    const layerSet = new Map();
    const entityCounts = {};
    // Also count raw model-space types for stats
    const rawCounts = {};
    for (const ent of entities) {
      rawCounts[ent.type] = (rawCounts[ent.type] || 0) + 1;
    }

    for (const fe of flatEntities) {
      const layer = fe.layer || '0';
      layerSet.set(layer, (layerSet.get(layer) || 0) + 1);
      entityCounts[fe.type] = (entityCounts[fe.type] || 0) + 1;
    }

    // Auto-detect or use provided scale
    let scale = options.scale;
    if (scale == null) {
      scale = this._autoDetectScale(flatEntities);
    }

    // Convert supported entities to tube point arrays
    const tubes = [];
    let converted = 0;
    let skipped = 0;

    for (const fe of flatEntities) {
      // Layer filter
      if (layerFilter && !layerFilter.has(fe.layer || '0')) {
        skipped++;
        continue;
      }

      const result = this._convertEntity(fe.entity, scale, fe.transform);
      if (result) {
        tubes.push({
          points: result.points,
          closed: result.closed,
          layer: fe.layer || '0',
          name: fe.type,
          sourceBlock: fe.sourceBlock || null,
        });
        converted++;
      } else {
        skipped++;
      }
    }

    return {
      tubes,
      stats: {
        total: flatEntities.length,
        converted,
        skipped,
        rawModelSpace: entities.length,
        rawCounts,
        blocksResolved: flatEntities.length - entities.length,
      },
      layers: layerSet,
      entityCounts,
    };
  }

  /**
   * Recursively resolve an entity. If it's an INSERT, look up the block
   * and flatten its children with the combined transform.
   */
  _flattenEntity(ent, blockMap, parentTransform, output, depth) {
    if (depth > 10) return; // prevent infinite recursion

    if (ent.type === 'INSERT') {
      const blockName = ent.name;
      const block = blockMap.get(blockName);
      if (!block || !block.entities) return;

      // Build INSERT transform matrix
      const insertTransform = this._buildInsertTransform(ent);

      // Combine with parent transform
      const combined = parentTransform
        ? parentTransform.clone().multiply(insertTransform)
        : insertTransform;

      // Recursively flatten block entities
      for (const child of block.entities) {
        this._flattenEntity(child, blockMap, combined, output, depth + 1);
      }
      return;
    }

    // Skip non-geometry types
    const geoTypes = ['LINE', 'LWPOLYLINE', 'POLYLINE2D', 'POLYLINE3D', 'ARC', 'CIRCLE', 'SPLINE'];
    if (!geoTypes.includes(ent.type)) return;

    output.push({
      entity: ent,
      type: ent.type,
      layer: ent.layer || '0',
      transform: parentTransform || null,
      sourceBlock: parentTransform ? 'block' : null,
    });
  }

  /**
   * Build a 4x4 transform matrix from an INSERT entity's position, rotation, and scale.
   * All in DWG Z-up coordinate space (transform applied before coord conversion).
   */
  _buildInsertTransform(ins) {
    const mat = new THREE.Matrix4();

    // Translation
    const tx = ins.insertionPoint?.x || 0;
    const ty = ins.insertionPoint?.y || 0;
    const tz = ins.insertionPoint?.z || 0;

    // Scale
    const sx = ins.xScale ?? 1;
    const sy = ins.yScale ?? 1;
    const sz = ins.zScale ?? 1;

    // Rotation around Z axis (DWG Z-up, rotation is around Z)
    const rot = ins.rotation || 0;

    // Build: T * Rz * S
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);

    mat.set(
      sx * cos, -sy * sin, 0, tx,
      sx * sin,  sy * cos, 0, ty,
      0,         0,        sz, tz,
      0,         0,        0, 1
    );

    return mat;
  }

  /**
   * Convert a single DWG entity to {points: Vector3[], closed: bool} or null.
   * If transform is provided, applies it to raw DWG coords before coordinate conversion.
   */
  _convertEntity(ent, scale, transform) {
    switch (ent.type) {
      case 'LINE':
        return this._convertLine(ent, scale, transform);
      case 'LWPOLYLINE':
        return this._convertLWPolyline(ent, scale, transform);
      case 'POLYLINE2D':
        return this._convertPolyline2D(ent, scale, transform);
      case 'POLYLINE3D':
        return this._convertPolyline3D(ent, scale, transform);
      case 'ARC':
        return this._convertArc(ent, scale, transform);
      case 'CIRCLE':
        return this._convertCircle(ent, scale, transform);
      case 'SPLINE':
        return this._convertSpline(ent, scale, transform);
      default:
        return null;
    }
  }

  /**
   * DWG Z-up → Three.js Y-up coordinate conversion, with optional transform.
   * x_three = x_dwg * scale
   * y_three = z_dwg * scale
   * z_three = -y_dwg * scale
   */
  _toThreeJS(x, y, z, scale, transform) {
    let dx = x, dy = y, dz = z || 0;

    // Apply DWG-space transform (INSERT position/rotation/scale)
    if (transform) {
      const v = new THREE.Vector3(dx, dy, dz);
      v.applyMatrix4(transform);
      dx = v.x;
      dy = v.y;
      dz = v.z;
    }

    // Z-up to Y-up conversion
    return new THREE.Vector3(
      dx * scale,
      dz * scale,
      -dy * scale
    );
  }

  _convertLine(ent, scale, transform) {
    const s = ent.startPoint;
    const e = ent.endPoint;
    if (!s || !e) return null;
    return {
      points: [
        this._toThreeJS(s.x, s.y, s.z, scale, transform),
        this._toThreeJS(e.x, e.y, e.z, scale, transform),
      ],
      closed: false,
    };
  }

  _convertLWPolyline(ent, scale, transform) {
    if (!ent.vertices || ent.vertices.length < 2) return null;
    const elevation = ent.elevation || 0;
    const points = [];

    for (let i = 0; i < ent.vertices.length; i++) {
      const v = ent.vertices[i];
      const bulge = v.bulge || 0;
      points.push(this._toThreeJS(v.x, v.y, elevation, scale, transform));

      if (Math.abs(bulge) > 1e-6) {
        const nextIdx = (i + 1) % ent.vertices.length;
        if (nextIdx === 0 && !(ent.flag & 1)) continue;
        const next = ent.vertices[nextIdx];
        const arcPts = this._bulgeArcPoints(
          v.x, v.y, next.x, next.y, elevation, bulge, scale, transform
        );
        for (let j = 1; j < arcPts.length - 1; j++) {
          points.push(arcPts[j]);
        }
      }
    }

    const closed = !!(ent.flag & 1);
    return { points, closed };
  }

  _convertPolyline2D(ent, scale, transform) {
    if (!ent.vertices || ent.vertices.length < 2) return null;
    const points = [];

    for (let i = 0; i < ent.vertices.length; i++) {
      const v = ent.vertices[i];
      points.push(this._toThreeJS(v.x, v.y, v.z || 0, scale, transform));

      if (v.bulge && Math.abs(v.bulge) > 1e-6) {
        const nextIdx = (i + 1) % ent.vertices.length;
        if (nextIdx === 0 && !(ent.flag & 1)) continue;
        const next = ent.vertices[nextIdx];
        const arcPts = this._bulgeArcPoints(
          v.x, v.y, next.x, next.y, v.z || 0, v.bulge, scale, transform
        );
        for (let j = 1; j < arcPts.length - 1; j++) {
          points.push(arcPts[j]);
        }
      }
    }

    const closed = !!(ent.flag & 1);
    return { points, closed };
  }

  _convertPolyline3D(ent, scale, transform) {
    if (!ent.vertices || ent.vertices.length < 2) return null;
    const points = ent.vertices.map(v =>
      this._toThreeJS(v.x, v.y, v.z || 0, scale, transform)
    );
    const closed = !!(ent.flag & 1);
    return { points, closed };
  }

  _convertArc(ent, scale, transform) {
    if (!ent.center || !ent.radius) return null;
    const cx = ent.center.x;
    const cy = ent.center.y;
    const cz = ent.center.z || 0;
    const r = ent.radius;
    let startAngle = ent.startAngle || 0;
    let endAngle = ent.endAngle || 0;

    let sweep = endAngle - startAngle;
    if (sweep <= 0) sweep += Math.PI * 2;
    const numSegs = Math.max(8, Math.round(sweep / (Math.PI / 18)));
    const points = [];

    for (let i = 0; i <= numSegs; i++) {
      const t = i / numSegs;
      const angle = startAngle + t * sweep;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      points.push(this._toThreeJS(x, y, cz, scale, transform));
    }

    return { points, closed: false };
  }

  _convertCircle(ent, scale, transform) {
    if (!ent.center || !ent.radius) return null;
    const cx = ent.center.x;
    const cy = ent.center.y;
    const cz = ent.center.z || 0;
    const r = ent.radius;
    const numSegs = 36;
    const points = [];

    for (let i = 0; i < numSegs; i++) {
      const angle = (i / numSegs) * Math.PI * 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      points.push(this._toThreeJS(x, y, cz, scale, transform));
    }

    return { points, closed: true };
  }

  _convertSpline(ent, scale, transform) {
    let pts;
    if (ent.fitPoints && ent.fitPoints.length >= 2) {
      pts = ent.fitPoints;
    } else if (ent.controlPoints && ent.controlPoints.length >= 2) {
      pts = ent.controlPoints;
    } else {
      return null;
    }

    const points = pts.map(p =>
      this._toThreeJS(p.x, p.y, p.z || 0, scale, transform)
    );
    const closed = !!(ent.flag & 1);
    return { points, closed };
  }

  /**
   * Compute arc points from DWG bulge factor between two vertices.
   */
  _bulgeArcPoints(x1, y1, x2, y2, z, bulge, scale, transform) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1e-10) return [this._toThreeJS(x1, y1, z, scale, transform)];

    const theta = 4 * Math.atan(Math.abs(bulge));
    const r = dist / (2 * Math.sin(theta / 2));
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const d = Math.sqrt(r * r - (dist / 2) * (dist / 2));
    const px = -dy / dist;
    const py = dx / dist;
    const sign = bulge > 0 ? 1 : -1;
    const cx = mx + sign * d * px;
    const cy = my + sign * d * py;
    const startAngle = Math.atan2(y1 - cy, x1 - cx);

    let sweep = Math.atan2(y2 - cy, x2 - cx) - startAngle;
    if (bulge > 0) { if (sweep < 0) sweep += Math.PI * 2; }
    else { if (sweep > 0) sweep -= Math.PI * 2; }

    const numSegs = Math.max(4, Math.round(Math.abs(sweep) / (Math.PI / 18)));
    const points = [];
    for (let i = 0; i <= numSegs; i++) {
      const t = i / numSegs;
      const angle = startAngle + t * sweep;
      points.push(this._toThreeJS(
        cx + r * Math.cos(angle),
        cy + r * Math.sin(angle),
        z, scale, transform
      ));
    }
    return points;
  }

  /**
   * Auto-detect scale by checking coordinate ranges.
   * If max extent > 100, likely mm → use 0.001.
   * If max extent < 100, likely meters → use 1.
   */
  _autoDetectScale(flatEntities) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const fe of flatEntities) {
      const ent = fe.entity;
      const verts = this._getEntityVertices(ent);
      for (const v of verts) {
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
        const z = v.z || 0;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }

    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    const rangeZ = maxZ - minZ;
    const maxRange = Math.max(rangeX, rangeY, rangeZ);

    if (maxRange > 1000) return 0.001;   // mm
    if (maxRange > 100) return 0.01;     // cm
    return 1;                            // meters
  }

  /** Get raw vertex coordinates from an entity for bounding box analysis */
  _getEntityVertices(ent) {
    switch (ent.type) {
      case 'LINE':
        return [ent.startPoint, ent.endPoint].filter(Boolean);
      case 'LWPOLYLINE':
      case 'POLYLINE2D':
      case 'POLYLINE3D':
        return ent.vertices || [];
      case 'ARC':
      case 'CIRCLE':
        return ent.center ? [ent.center] : [];
      case 'SPLINE':
        return ent.fitPoints || ent.controlPoints || [];
      default:
        return [];
    }
  }
}
