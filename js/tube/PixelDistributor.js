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

    // Skip startPixel pixels from the beginning of the curve
    const startPx = tubeModel.startPixel || 0;
    const activeStartIndex = startPx;
    const activeCount = points.length - startPx;
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

    const _refUp = new THREE.Vector3();
    for (let i = 0; i < activeCount; i++) {
      const pi = activeStartIndex + i;
      const pos = points[pi];

      if (offsetDist > 0) {
        // Compute curve normal (up/diffuser direction) at this pixel
        const t = count === 1 ? 0.5 : (pi + 0.5) / count;
        const tClamped = Math.min(Math.max(t, 0.001), 0.999);
        const tangent = curve.getTangentAt(tClamped).normalize();
        _refUp.set(0, 1, 0);
        if (Math.abs(tangent.dot(_refUp)) > 0.99) _refUp.set(1, 0, 0);
        const normal = _refUp.clone().sub(tangent.clone().multiplyScalar(_refUp.dot(tangent))).normalize();
        // Offset pixel in -normal direction (toward housing bottom)
        _matrix.makeTranslation(
          pos.x - normal.x * offsetDist,
          pos.y - normal.y * offsetDist,
          pos.z - normal.z * offsetDist
        );
      } else {
        _matrix.makeTranslation(pos.x, pos.y, pos.z);
      }

      instancedMesh.setMatrixAt(i, _matrix);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;

    group.add(instancedMesh);
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
