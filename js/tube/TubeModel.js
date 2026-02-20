import * as THREE from 'three';

let tubeIdCounter = 0;

/**
 * Data model for a single NeonFlex tube.
 */
export class TubeModel {
  constructor(options = {}) {
    this.id = ++tubeIdCounter;
    this.name = options.name || `Tube ${this.id}`;

    // Control points (in meters)
    this.controlPoints = options.controlPoints || [];

    // Cross section
    this.profile = options.profile || 'round'; // 'round' | 'square' | 'rect'
    this.diameterMm = options.diameterMm || 16; // outer diameter for round
    this.widthMm = options.widthMm || 8;  // width for rect
    this.heightMm = options.heightMm || 16; // height for rect
    this.wallThicknessMm = options.wallThicknessMm || 1.5;

    // Material
    this.materialPreset = options.materialPreset || 'milky';

    // Pixel config
    this.pixelsPerMeter = options.pixelsPerMeter || 60;
    this.pixelColor = options.pixelColor || '#ffffff';
    this.pixelEmissive = options.pixelEmissive !== undefined ? options.pixelEmissive : true;

    // DMX / Patch config
    this.fixtureId = options.fixtureId || 1;
    this.dmxUniverse = options.dmxUniverse || 1;
    this.dmxChannelsPerPixel = options.dmxChannelsPerPixel || 3; // RGB=3, RGBW=4
    // Clamp address so fixture fits within 512
    const maxAddr = 512 - this.dmxChannelsPerPixel + 1;
    this.dmxAddress = Math.min(Math.max(1, options.dmxAddress || 1), maxAddr);

    // Curve
    this.tension = options.tension || 0.5;
    this.closed = options.closed || false;

    // Visual state
    this.visible = true;
    this.selected = false;
    this.color = options.color || this._randomColor();

    // Three.js group reference (set by TubeManager)
    this.group = null;
    this.bodyMesh = null;
    this.pixelGroup = null;
    this.controlPointHelpers = [];
  }

  /** Outer radius in meters */
  get outerRadius() {
    return (this.diameterMm / 2) * 0.001;
  }

  /** Inner radius in meters (for pixel sizing) */
  get innerRadius() {
    return Math.max(0.0005, this.outerRadius - this.wallThicknessMm * 0.001);
  }

  /** Rect width in meters */
  get widthM() {
    return this.widthMm * 0.001;
  }

  /** Rect height in meters */
  get heightM() {
    return this.heightMm * 0.001;
  }

  /** Add a control point */
  addPoint(point) {
    this.controlPoints.push(point.clone());
  }

  /** Remove last control point */
  removeLastPoint() {
    return this.controlPoints.pop();
  }

  /** Update a control point at index */
  updatePoint(index, point) {
    if (index >= 0 && index < this.controlPoints.length) {
      this.controlPoints[index].copy(point);
    }
  }

  /** Delete a control point at index */
  deletePoint(index) {
    if (index >= 0 && index < this.controlPoints.length) {
      this.controlPoints.splice(index, 1);
    }
  }

  /** Check if tube has enough points for a curve */
  get isValid() {
    return this.controlPoints.length >= 2;
  }

  /** Clone the model data */
  clone() {
    return new TubeModel({
      name: this.name + ' copy',
      controlPoints: this.controlPoints.map(p => p.clone()),
      profile: this.profile,
      diameterMm: this.diameterMm,
      widthMm: this.widthMm,
      heightMm: this.heightMm,
      wallThicknessMm: this.wallThicknessMm,
      materialPreset: this.materialPreset,
      pixelsPerMeter: this.pixelsPerMeter,
      pixelColor: this.pixelColor,
      pixelEmissive: this.pixelEmissive,
      fixtureId: this.fixtureId,
      dmxUniverse: this.dmxUniverse,
      dmxAddress: this.dmxAddress,
      dmxChannelsPerPixel: this.dmxChannelsPerPixel,
      tension: this.tension,
      closed: this.closed,
    });
  }

  _randomColor() {
    const colors = ['#00d4ff', '#ff44aa', '#44ff88', '#ffaa44', '#aa44ff', '#44aaff'];
    return colors[tubeIdCounter % colors.length];
  }
}
