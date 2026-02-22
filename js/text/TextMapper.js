import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { simplifyPath } from '../utils/SimplifyPath.js';

/**
 * Convert text strings into tube-ready polyline chains using Three.js fonts.
 */

// Font cache to avoid re-fetching
const fontCache = new Map();

// Bundled font URLs (Three.js CDN)
const BUNDLED_FONTS = {
  'helvetiker': 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/fonts/helvetiker_regular.typeface.json',
  'helvetiker_bold': 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/fonts/helvetiker_bold.typeface.json',
  'optimer': 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/fonts/optimer_regular.typeface.json',
  'optimer_bold': 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/fonts/optimer_bold.typeface.json',
  'gentilis': 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/fonts/gentilis_regular.typeface.json',
  'gentilis_bold': 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/fonts/gentilis_bold.typeface.json',
};

/**
 * Get list of available bundled font names for UI display.
 * @returns {{ id: string, label: string }[]}
 */
export function getBundledFontList() {
  return [
    { id: 'helvetiker', label: 'Helvetiker' },
    { id: 'helvetiker_bold', label: 'Helvetiker Bold' },
    { id: 'optimer', label: 'Optimer' },
    { id: 'optimer_bold', label: 'Optimer Bold' },
    { id: 'gentilis', label: 'Gentilis' },
    { id: 'gentilis_bold', label: 'Gentilis Bold' },
  ];
}

/**
 * Load a bundled font by name. Returns cached result if already loaded.
 * @param {string} fontName - key from BUNDLED_FONTS
 * @returns {Promise<THREE.Font>}
 */
export function loadBundledFont(fontName) {
  if (fontCache.has(fontName)) {
    return Promise.resolve(fontCache.get(fontName));
  }

  const url = BUNDLED_FONTS[fontName];
  if (!url) return Promise.reject(new Error(`Unknown font: ${fontName}`));

  return new Promise((resolve, reject) => {
    const loader = new FontLoader();
    loader.load(
      url,
      (font) => {
        fontCache.set(fontName, font);
        resolve(font);
      },
      undefined,
      (err) => reject(err)
    );
  });
}

/**
 * Parse a custom .ttf/.otf font file using opentype.js and convert
 * to a Three.js Font-compatible object.
 * @param {ArrayBuffer} arrayBuffer - file contents
 * @returns {Promise<THREE.Font>}
 */
export function parseCustomFont(arrayBuffer) {
  return new Promise((resolve, reject) => {
    if (typeof opentype === 'undefined') {
      reject(new Error('opentype.js not loaded. Cannot parse custom fonts.'));
      return;
    }

    try {
      const otFont = opentype.parse(arrayBuffer);

      // Convert opentype font to Three.js typeface.json format
      const fontData = {
        glyphs: {},
        familyName: otFont.names.fontFamily?.en || 'Custom',
        ascender: otFont.ascender,
        descender: otFont.descender,
        underlinePosition: otFont.tables.post?.underlinePosition || -100,
        underlineThickness: otFont.tables.post?.underlineThickness || 50,
        boundingBox: {
          xMin: otFont.tables.head.xMin,
          xMax: otFont.tables.head.xMax,
          yMin: otFont.tables.head.yMin,
          yMax: otFont.tables.head.yMax,
        },
        resolution: otFont.unitsPerEm || 1000,
        original_font_information: { format: 0, copyright: '', fontFamily: otFont.names.fontFamily?.en || '' },
      };

      // Convert each glyph
      for (let i = 0; i < otFont.glyphs.length; i++) {
        const glyph = otFont.glyphs.get(i);
        if (!glyph.unicode) continue;

        const char = String.fromCharCode(glyph.unicode);
        const glyphData = {
          ha: glyph.advanceWidth,
          x_min: glyph.xMin || 0,
          x_max: glyph.xMax || 0,
          o: '',
        };

        // Convert glyph path commands to Three.js font format
        if (glyph.path && glyph.path.commands) {
          const cmds = [];
          for (const cmd of glyph.path.commands) {
            switch (cmd.type) {
              case 'M':
                cmds.push(`m ${cmd.x} ${cmd.y}`);
                break;
              case 'L':
                cmds.push(`l ${cmd.x} ${cmd.y}`);
                break;
              case 'Q':
                cmds.push(`q ${cmd.x1} ${cmd.y1} ${cmd.x} ${cmd.y}`);
                break;
              case 'C':
                cmds.push(`b ${cmd.x1} ${cmd.y1} ${cmd.x2} ${cmd.y2} ${cmd.x} ${cmd.y}`);
                break;
              case 'Z':
                // Close path — no command needed in Three.js font format
                break;
            }
          }
          glyphData.o = cmds.join(' ');
        }

        fontData.glyphs[char] = glyphData;
      }

      // Create Three.js Font from the converted data
      const loader = new FontLoader();
      const font = loader.parse(fontData);
      fontCache.set('custom_' + Date.now(), font);
      resolve(font);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Convert text into polyline chains ready for tube creation.
 * @param {THREE.Font} font - loaded Three.js font
 * @param {string} text - text to convert
 * @param {object} [options]
 * @param {number} [options.size=0.5] - text size in meters
 * @param {number} [options.letterSpacing=1.0] - letter spacing multiplier (1.0 = normal)
 * @param {number} [options.divisions=12] - curve resolution (points per bezier)
 * @param {string} [options.plane='XZ'] - drawing plane ('XZ', 'XY', 'YZ')
 * @param {number} [options.simplifyEpsilon] - auto-computed if omitted
 * @returns {{ points: THREE.Vector3[], closed: boolean }[]}
 */
export function textToChains(font, text, options = {}) {
  const {
    size = 0.5,
    letterSpacing = 1.0,
    divisions = 12,
    plane = 'XZ',
  } = options;

  // Generate shapes from font
  const shapes = font.generateShapes(text, size);

  if (!shapes || shapes.length === 0) return [];

  // Auto-compute epsilon from text size
  const epsilon = options.simplifyEpsilon != null
    ? options.simplifyEpsilon
    : size * 0.005;

  const chains = [];

  // Apply letter spacing by adjusting the shapes' positions
  // The font already positions glyphs correctly; we just scale the spacing
  if (letterSpacing !== 1.0) {
    // Find center of all shapes to apply spacing from center
    const allPoints = [];
    for (const shape of shapes) {
      const pts = shape.getPoints(divisions);
      allPoints.push(...pts);
    }
    if (allPoints.length > 0) {
      let minX = Infinity, maxX = -Infinity;
      for (const p of allPoints) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
      }
      const centerX = (minX + maxX) / 2;

      // Scale x-coordinates around center
      for (const shape of shapes) {
        if (shape.curves) {
          for (const curve of shape.curves) {
            if (curve.v1) { curve.v1.x = centerX + (curve.v1.x - centerX) * letterSpacing; }
            if (curve.v2) { curve.v2.x = centerX + (curve.v2.x - centerX) * letterSpacing; }
            if (curve.v0) { curve.v0.x = centerX + (curve.v0.x - centerX) * letterSpacing; }
            if (curve.aX !== undefined) { curve.aX = centerX + (curve.aX - centerX) * letterSpacing; }
          }
        }
      }
    }
  }

  for (let si = 0; si < shapes.length; si++) {
    const shape = shapes[si];
    // Outer contour
    const outerPts2D = shape.getPoints(divisions);
    if (outerPts2D.length >= 3) {
      const openPts = stripClosingDuplicate(outerPts2D);
      const points3D = openPts.map(v => toVector3(v, plane));
      const simplified = simplifyClosedPath(points3D, epsilon);
      if (simplified.length >= 3) {
        chains.push({ points: simplified, closed: true });
      }
    }

    // Holes (inner contours — e.g., inside of O, A, D, B)
    if (shape.holes) {
      for (const hole of shape.holes) {
        const holePts2D = hole.getPoints(divisions);
        if (holePts2D.length >= 3) {
          const openPts = stripClosingDuplicate(holePts2D);
          const points3D = openPts.map(v => toVector3(v, plane));
          const simplified = simplifyClosedPath(points3D, epsilon);
          if (simplified.length >= 3) {
            chains.push({ points: simplified, closed: true });
          }
        }
      }
    }
  }

  return chains;
}

/**
 * Remove the closing duplicate point from a contour.
 * shape.getPoints() returns a closed loop where first ≈ last — strip that
 * so simplifyPath doesn't see a degenerate start==end line.
 */
function stripClosingDuplicate(pts) {
  if (pts.length < 2) return pts;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const dx = first.x - last.x;
  const dy = first.y - last.y;
  if (Math.sqrt(dx * dx + dy * dy) < 0.0001) {
    return pts.slice(0, -1);
  }
  return pts;
}

/**
 * Simplify a closed path by splitting it in half, simplifying each half
 * independently, then rejoining. This avoids the degenerate case where
 * simplifyPath collapses a closed contour (start == end) to 2 points.
 */
function simplifyClosedPath(points3D, epsilon) {
  if (points3D.length <= 4) return points3D;

  const mid = Math.floor(points3D.length / 2);

  // First half: [0 .. mid]
  const firstHalf = points3D.slice(0, mid + 1);
  const simplifiedFirst = simplifyPath(firstHalf, epsilon);

  // Second half: [mid .. end]
  const secondHalf = points3D.slice(mid);
  const simplifiedSecond = simplifyPath(secondHalf, epsilon);

  // Join: drop duplicate midpoint from second half
  const combined = simplifiedFirst.concat(simplifiedSecond.slice(1));
  return combined;
}

/**
 * Convert a 2D point to 3D on the specified drawing plane.
 */
function toVector3(v, plane) {
  switch (plane) {
    case 'XZ': return new THREE.Vector3(v.x, 0, -v.y);
    case 'XY': return new THREE.Vector3(v.x, v.y, 0);
    case 'YZ': return new THREE.Vector3(0, v.y, v.x);
    default:   return new THREE.Vector3(v.x, 0, -v.y);
  }
}
