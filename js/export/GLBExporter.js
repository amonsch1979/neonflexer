import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

/**
 * Export the tube design as a GLB file.
 * Creates a clean export scene with only tube bodies and pixels.
 */
export class GLBExporter {
  /**
   * Export all tubes as a GLB binary.
   * @param {import('../tube/TubeManager.js').TubeManager} tubeManager
   * @param {string} filename - export filename (without extension)
   */
  static async export(tubeManager, filename = 'NeonFlexDesign') {
    const exportScene = this._buildExportScene(tubeManager);

    if (exportScene.children.length === 0) {
      throw new Error('No tubes to export');
    }

    const exporter = new GLTFExporter();

    return new Promise((resolve, reject) => {
      exporter.parse(
        exportScene,
        (result) => {
          // result is ArrayBuffer for binary GLB
          const blob = new Blob([result], { type: 'application/octet-stream' });
          this._download(blob, `${filename}.glb`);
          // Cleanup export scene
          this._disposeScene(exportScene);
          resolve();
        },
        (error) => {
          this._disposeScene(exportScene);
          reject(error);
        },
        {
          binary: true,
          onlyVisible: true,
          includeCustomExtensions: false,
        }
      );
    });
  }

  /**
   * Build a clean export scene with only tube bodies + pixels.
   * Skips helpers, grid, lights, ground plane.
   *
   * Structure:
   *   Scene > NeonFlexDesign (Group)
   *     > Tube_1 (Group)
   *       > Tube_1_Body (Mesh)
   *       > Tube_1_Pixels (Group)
   *         > Pixel_1_0 (Mesh)
   *         > ...
   */
  static _buildExportScene(tubeManager) {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    root.name = 'NeonFlexDesign';
    scene.add(root);

    for (const tube of tubeManager.tubes) {
      if (!tube.isValid || !tube.group) continue;

      const tubeGroup = new THREE.Group();
      tubeGroup.name = `Tube_${tube.id}`;

      // Deep clone body mesh (geometry + material)
      if (tube.bodyMesh) {
        const bodyMat = tube.bodyMesh.material.clone();
        bodyMat.name = `${tube.name}_Body_${tube.materialPreset}`;
        const bodyClone = new THREE.Mesh(
          tube.bodyMesh.geometry.clone(),
          bodyMat
        );
        bodyClone.name = `Tube_${tube.id}_Body`;
        tubeGroup.add(bodyClone);
      }

      // Deep clone pixel group (handles both InstancedMesh and legacy Mesh children)
      if (tube.pixelGroup) {
        const pixelGroupClone = new THREE.Group();
        pixelGroupClone.name = `Tube_${tube.id}_Pixels`;

        const firstChild = tube.pixelGroup.children[0];

        if (firstChild && firstChild.isInstancedMesh) {
          // InstancedMesh: extract individual meshes for GLB export
          const pixelMat = firstChild.material.clone();
          pixelMat.name = `${tube.name}_Pixel_Emissive`;
          const mat4 = new THREE.Matrix4();
          const pos = new THREE.Vector3();

          for (let i = 0; i < firstChild.count; i++) {
            firstChild.getMatrixAt(i, mat4);
            pos.setFromMatrixPosition(mat4);
            const pixelClone = new THREE.Mesh(firstChild.geometry.clone(), pixelMat);
            pixelClone.position.copy(pos);
            pixelClone.name = `Pixel_${tube.id}_${i}`;
            pixelGroupClone.add(pixelClone);
          }
        } else {
          // Legacy: individual mesh children
          const pixelMat = firstChild?.material?.clone();
          if (pixelMat) pixelMat.name = `${tube.name}_Pixel_Emissive`;

          tube.pixelGroup.children.forEach((pixel, i) => {
            if (pixel.isMesh) {
              const pixelClone = new THREE.Mesh(
                pixel.geometry.clone(),
                pixelMat || pixel.material.clone()
              );
              pixelClone.position.copy(pixel.position);
              pixelClone.name = `Pixel_${tube.id}_${i}`;
              pixelGroupClone.add(pixelClone);
            }
          });
        }

        tubeGroup.add(pixelGroupClone);
      }

      root.add(tubeGroup);
    }

    return scene;
  }

  /**
   * Trigger browser download of a blob.
   */
  static _download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Dispose of export scene resources.
   */
  static _disposeScene(scene) {
    scene.traverse(child => {
      if (child.isMesh) {
        child.geometry?.dispose();
        child.material?.dispose();
      }
    });
  }
}
