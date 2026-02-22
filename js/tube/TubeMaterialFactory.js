import * as THREE from 'three';

/**
 * PBR material presets for silicone neon flex tubes.
 * Uses MeshPhysicalMaterial with transmission for translucency.
 */
export class TubeMaterialFactory {
  static PRESETS = {
    dark: {
      label: 'Dark Silicone',
      color: 0x1a1a1a,
      transmission: 0.3,
      roughness: 0.6,
      metalness: 0.0,
      ior: 1.45,
      thickness: 0.003,
      opacity: 0.95,
      attenuationColor: new THREE.Color(0x111111),
      attenuationDistance: 0.01,
    },
    clear: {
      label: 'Clear Silicone',
      color: 0xffffff,
      transmission: 0.9,
      roughness: 0.15,
      metalness: 0.0,
      ior: 1.45,
      thickness: 0.002,
      opacity: 1.0,
      attenuationColor: new THREE.Color(0xffffff),
      attenuationDistance: 0.05,
    },
    milky: {
      label: 'Milky White',
      color: 0xf5f0e8,
      transmission: 0.6,
      roughness: 0.4,
      metalness: 0.0,
      ior: 1.45,
      thickness: 0.004,
      opacity: 0.98,
      attenuationColor: new THREE.Color(0xf0e8d8),
      attenuationDistance: 0.008,
    },
    frosted: {
      label: 'Frosted',
      color: 0xe8e8f0,
      transmission: 0.5,
      roughness: 0.7,
      metalness: 0.0,
      ior: 1.45,
      thickness: 0.003,
      opacity: 0.97,
      attenuationColor: new THREE.Color(0xdde0e8),
      attenuationDistance: 0.01,
    },
  };

  /**
   * Create a tube body material from preset name.
   * @param {string} presetName - 'dark' | 'clear' | 'milky' | 'frosted'
   * @returns {THREE.MeshPhysicalMaterial}
   */
  static createTubeMaterial(presetName = 'milky') {
    const preset = this.PRESETS[presetName] || this.PRESETS.milky;
    const mat = new THREE.MeshPhysicalMaterial({
      color: preset.color,
      transmission: preset.transmission,
      roughness: preset.roughness,
      metalness: preset.metalness,
      ior: preset.ior,
      thickness: preset.thickness,
      transparent: true,
      opacity: preset.opacity,
      attenuationColor: preset.attenuationColor.clone(),
      attenuationDistance: preset.attenuationDistance,
      side: THREE.DoubleSide,
      envMapIntensity: 1.0,
    });
    mat.name = `NeonFlex_${preset.label.replace(/\s+/g, '_')}`;
    return mat;
  }

  /**
   * Create opaque black housing material for base channels.
   * @returns {THREE.MeshStandardMaterial}
   */
  static createBaseMaterial() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.7,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    mat.name = 'NeonFlex_Housing';
    return mat;
  }

  /**
   * Create an emissive pixel material.
   * @param {string} hexColor - hex color string like '#ffffff'
   * @returns {THREE.MeshStandardMaterial}
   */
  static createPixelMaterial(hexColor = '#ffffff', emissive = true) {
    const color = new THREE.Color(hexColor);
    if (emissive) {
      const mat = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 2.0,
        roughness: 0.3,
        metalness: 0.0,
      });
      mat.name = 'NeonFlex_Pixel_Emissive';
      return mat;
    } else {
      const mat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.5,
        metalness: 0.0,
      });
      mat.name = 'NeonFlex_Pixel_Flat';
      return mat;
    }
  }

  /** Get list of preset names */
  static getPresetNames() {
    return Object.keys(this.PRESETS);
  }

  /** Get label for a preset */
  static getPresetLabel(name) {
    return this.PRESETS[name]?.label || name;
  }
}
