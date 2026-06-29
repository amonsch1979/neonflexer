import * as THREE from 'three';
import { CurveBuilder } from '../drawing/CurveBuilder.js';
import { TubeMaterialFactory } from './TubeMaterialFactory.js';

// Shared sphere geometry for all pixel instances (one allocation)
let _sharedPixelGeo = null;
function getSharedGeo(pixelSize) {
  // Recreate if size changed significantly
  if (!_sharedPixelGeo || Math.abs(_sharedPixelGeo.parameters.radius - pixelSize) > 0.0001) {
    if (_sharedPixelGeo) _sharedPixelGeo.dispose();
    _sharedPixelGeo = new THREE.SphereGeometry(pixelSize, 8, 8);
  }
  return _sharedPixelGeo;
}

const _matrix = new THREE.Matrix4();

/**
 * Places pixel instances along a tube's curve center using InstancedMesh.
 * Single draw call per tube instead of one per pixel.
 */
export class PixelDistributor {
  /**
   * Create an InstancedMesh of pixels distributed along a curve.
   * @param {THREE.CatmullRomCurve3} curve
   * @param {import('./TubeModel.js').TubeModel} tubeModel
   * @returns {THREE.Group} group containing a single InstancedMesh
   */
  static distribute(curve, tubeModel) {
    const group = new THREE.Group();
    group.name = `Tube_${tubeModel.id}_Pixels`;

    if (!curve || tubeModel.pixelsPerMeter <= 0) return group;

    const { points, count } = CurveBuilder.getPixelPoints(curve, tubeModel.pixelsPerMeter);
    if (count === 0) return group;

    // Active pixels in display order. Open tubes skip the first startPixel;
    // closed tubes use ALL pixels (numbering is a rotation, never a skip).
    const order = tubeModel.orderedPixelIndices(count);
    const activeCount = order.length;
    if (activeCount <= 0) return group;

    // Pixel size = 30% of inner radius
    const pixelSize = Math.max(0.001, tubeModel.innerRadius * 0.3);

    // For square/rect profiles: offset pixels to sit on inner floor of housing
    // (half-height minus wall thickness minus pixel radius so sphere stays inside)
    let offsetDist = 0;
    if (tubeModel.profile === 'square') {
      offsetDist = tubeModel.outerRadius - tubeModel.wallThicknessMm * 0.001 - pixelSize;
    } else if (tubeModel.profile === 'rect') {
      offsetDist = tubeModel.heightM / 2 - tubeModel.wallThicknessMm * 0.001 - pixelSize;
    }
    const pixelMaterial = TubeMaterialFactory.createPixelMaterial(tubeModel.pixelColor, tubeModel.pixelEmissive);
    const pixelGeo = new THREE.SphereGeometry(pixelSize, 8, 8);

    // Single InstancedMesh for all pixels — one draw call
    const instancedMesh = new THREE.InstancedMesh(pixelGeo, pixelMaterial, activeCount);
    instancedMesh.name = `Tube_${tubeModel.id}_PixelsInstanced`;

    // Final (offset-adjusted) position of a pixel given its raw index.
    const _refUp = new THREE.Vector3();
    const placedPos = (pi) => {
      const pos = points[pi];
      if (offsetDist > 0) {
        const t = count === 1 ? 0.5 : (pi + 0.5) / count;
        const tClamped = Math.min(Math.max(t, 0.001), 0.999);
        const tangent = curve.getTangentAt(tClamped).normalize();
        _refUp.set(0, 1, 0);
        if (Math.abs(tangent.dot(_refUp)) > 0.99) _refUp.set(1, 0, 0);
        const normal = _refUp.clone().sub(tangent.clone().multiplyScalar(_refUp.dot(tangent))).normalize();
        return new THREE.Vector3(
          pos.x - normal.x * offsetDist,
          pos.y - normal.y * offsetDist,
          pos.z - normal.z * offsetDist
        );
      }
      return pos.clone();
    };

    const firstPos = placedPos(order[0]);
    for (let i = 0; i < activeCount; i++) {
      const p = placedPos(order[i]);
      _matrix.makeTranslation(p.x, p.y, p.z);
      instancedMesh.setMatrixAt(i, _matrix);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
    group.add(instancedMesh);

    // ── Start-pixel markers ──
    // The start pixel + direction is pure numbering (geometry never moves), so
    // without a marker the viewport looks identical after a pick. Mark pixel #1
    // (bright green) and #2 (dimmer) so the chosen start and direction are
    // always visible and verifiable.
    const markerGeo = new THREE.SphereGeometry(pixelSize * 1.9, 12, 12);
    const m1 = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0x33ff66, depthTest: false, transparent: true, opacity: 0.95 }));
    m1.position.copy(firstPos);
    m1.renderOrder = 997;
    m1.name = `Tube_${tubeModel.id}_StartMarker`;
    group.add(m1);
    if (activeCount > 1) {
      const m2 = new THREE.Mesh(new THREE.SphereGeometry(pixelSize * 1.3, 10, 10), new THREE.MeshBasicMaterial({ color: 0x1f9e4a, depthTest: false, transparent: true, opacity: 0.85 }));
      m2.position.copy(placedPos(order[1]));
      m2.renderOrder = 996;
      m2.name = `Tube_${tubeModel.id}_DirMarker`;
      group.add(m2);
    }

    return group;
  }

  /**
   * Update pixel distribution (recreate group).
   * Disposes old group meshes.
   */
  static update(oldGroup, curve, tubeModel) {
    if (oldGroup) {
      this.dispose(oldGroup);
    }
    return this.distribute(curve, tubeModel);
  }

  /**
   * Dispose of pixel group resources.
   */
  static dispose(group) {
    if (!group) return;
    group.traverse(child => {
      if (child.isInstancedMesh || child.isMesh) {
        child.geometry?.dispose();
        child.material?.dispose();
      }
    });
    group.clear();
  }
}
