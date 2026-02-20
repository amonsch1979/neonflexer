/**
 * Fixture preset definitions for real-world NeonFlex products.
 * Each preset defines physical and DMX properties that auto-fill when selected.
 */

export const FIXTURE_PRESETS = {
  'custom': {
    label: 'Custom',
    maxLengthM: null,
    profile: null,
    diameterMm: null,
    pixelsPerMeter: null,
    dmxChannelsPerPixel: null,
    materialPreset: null,
    connectorDiameterMm: null,
    connectorHeightMm: null,
  },
  'ledstructures-ls360flex': {
    label: 'LEDStructures LS360FLEX',
    maxLengthM: 6.0,
    profile: 'round',
    diameterMm: 22,
    pixelsPerMeter: 30,
    dmxChannelsPerPixel: 3,
    materialPreset: 'milky',
    connectorDiameterMm: 30,
    connectorHeightMm: 30,
  },
  'generic-60-16': {
    label: 'Generic 60px/m 16mm',
    maxLengthM: null,
    profile: 'round',
    diameterMm: 16,
    pixelsPerMeter: 60,
    dmxChannelsPerPixel: 3,
    materialPreset: 'milky',
    connectorDiameterMm: null,
    connectorHeightMm: null,
  },
  'generic-30-25': {
    label: 'Generic 30px/m 25mm',
    maxLengthM: null,
    profile: 'round',
    diameterMm: 25,
    pixelsPerMeter: 30,
    dmxChannelsPerPixel: 3,
    materialPreset: 'milky',
    connectorDiameterMm: null,
    connectorHeightMm: null,
  },
  'generic-144-12-rgbw': {
    label: 'Generic 144px/m 12mm RGBW',
    maxLengthM: null,
    profile: 'round',
    diameterMm: 12,
    pixelsPerMeter: 144,
    dmxChannelsPerPixel: 4,
    materialPreset: 'milky',
    connectorDiameterMm: null,
    connectorHeightMm: null,
  },
};

/**
 * Get a preset by its ID.
 * @param {string} id
 * @returns {object|null}
 */
export function getPresetById(id) {
  return FIXTURE_PRESETS[id] || null;
}

/**
 * Get all presets as an array of { id, label } for dropdown population.
 * @returns {{ id: string, label: string }[]}
 */
export function getPresetList() {
  return Object.entries(FIXTURE_PRESETS).map(([id, preset]) => ({
    id,
    label: preset.label,
  }));
}
