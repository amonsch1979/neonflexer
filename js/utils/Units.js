/** Convert millimeters to meters */
export function mmToM(mm) {
  return mm * 0.001;
}

/** Convert meters to millimeters */
export function mToMm(m) {
  return m * 1000;
}

/** Format meters value as mm string */
export function formatMm(m, decimals = 1) {
  return (m * 1000).toFixed(decimals);
}

/** Parse mm input string to meters */
export function parseMm(mmStr) {
  const val = parseFloat(mmStr);
  return isNaN(val) ? null : val * 0.001;
}

/** Pixel pitch presets (pixels per meter) */
export const PIXEL_PITCH_PRESETS = {
  '30/m': { pixelsPerMeter: 30, label: '30 px/m (~33mm)' },
  '60/m': { pixelsPerMeter: 60, label: '60 px/m (~17mm)' },
  '96/m': { pixelsPerMeter: 96, label: '96 px/m (~10mm)' },
  '144/m': { pixelsPerMeter: 144, label: '144 px/m (~7mm)' },
};

/** Common tube diameters in mm */
export const TUBE_DIAMETERS_MM = [10, 12, 16, 20, 25];

/** Common flat tube sizes [width, height] in mm */
export const FLAT_TUBE_SIZES_MM = [
  [6, 12],
  [8, 16],
  [10, 20],
  [12, 24],
];
