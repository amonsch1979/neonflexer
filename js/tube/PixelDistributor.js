import * as THREE from 'three';
import { CurveBuilder } from '../drawing/CurveBuilder.js';
import { TubeMaterialFactory } from './TubeMaterialFactory.js';

/**
 * Places individual pixel meshes along a tube's curve center.
 */
export class PixelDistributor {
  /**
   * Create pixel meshes distributed along a curve.
   * @param {THREE.CatmullRomCurve3} curve
   * @param {import('./TubeModel.js').TubeModel} tubeModel
   * @returns {THREE.Group} group of pixel meshes
   */
  static distribute(curve, tubeModel) {
    const group = new THREE.Group();
    group.name = `Tube_${tubeModel.id}_Pixels`;

    if (!curve || tubeModel.pixelsPerMeter <= 0) return group;

    const { points, count } = CurveBuilder.getPixelPoints(curve, tubeModel.pixelsPerMeter);
    if (count === 0) return group;

    // Pixel size = 30% of inner radius
    const pixelSize = Math.max(0.001, tubeModel.innerRadius * 0.3);
    const pixelMaterial = TubeMaterialFactory.createPixelMaterial(tubeModel.pixelColor, tubeModel.pixelEmissive);

    // Use small sphere geometry for each pixel
    const pixelGeo = new THREE.SphereGeometry(pixelSize, 8, 8);

    for (let i = 0; i < points.length; i++) {
      const mesh = new THREE.Mesh(pixelGeo, pixelMaterial);
      mesh.position.copy(points[i]);
      mesh.name = `Pixel_${tubeModel.id}_${i}`;
      group.add(mesh);
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
    // Shared geometry and material - just dispose once
    let disposedGeo = false;
    let disposedMat = false;
    group.traverse(child => {
      if (child.isMesh) {
        if (!disposedGeo && child.geometry) {
          child.geometry.dispose();
          disposedGeo = true;
        }
        if (!disposedMat && child.material) {
          child.material.dispose();
          disposedMat = true;
        }
      }
    });
    group.clear();
  }
}
