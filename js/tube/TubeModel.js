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
    this.diffuserShape = options.diffuserShape || 'flat'; // 'flat' | 'dome' | 'oval'

    // Material
    this.materialPreset = options.materialPreset || 'milky';

    // Pixel config
    this.pixelMode = options.pixelMode || 'discrete'; // 'discrete' | 'uv-mapped'
    this.pixelsPerMeter = options.pixelsPerMeter || 60;
    this.startPixel = options.startPixel || 0; // skip N pixels from start of curve
    this.pixelColor = options.pixelColor || '#ffffff';
    this.pixelEmissive = options.pixelEmissive !== undefined ? options.pixelEmissive : true;

    // DMX / Patch config
    this.fixtureId = options.fixtureId || 1;
    this.dmxUniverse = options.dmxUniverse || 1;
    this.dmxChannelsPerPixel = options.dmxChannelsPerPixel || 3; // RGB=3, RGBW=4
    // Clamp address so fixture fits within 512
    const maxAddr = 512 - this.dmxChannelsPerPixel + 1;
    this.dmxAddress = Math.min(Math.max(1, options.dmxAddress || 1), maxAddr);

    // Fixture preset
    this.fixturePreset = options.fixturePreset || 'custom';

    // Placeholder mode (generic fixture, no pixels)
    this.isPlaceholder = options.isPlaceholder || false;
    this.facingDirection = options.facingDirection || 'up'; // 'up' | 'down' | 'inward' | 'outward'
    this.placeholderName = options.placeholderName || ''; // fixture name shown in Capture (e.g. "LX100")

    // Group
    this.groupId = options.groupId || null;

    // Curve
    this.tension = options.tension != null ? options.tension : 0.5;
    this.closed = options.closed || false;

    // Visual state
    this.visible = true;
    this.selected = false;
    this.color = options.color || this._randomColor();

    // Three.js group reference (set by TubeManager)
    this.group = null;
    this.bodyMesh = null;
    this.baseMesh = null;  // housing base mesh (dome profiles only)
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

  /** Insert a control point at index */
  insertPoint(index, point) {
    this.controlPoints.splice(index, 0, point.clone());
  }

  /** Reverse control point order (flip direction) */
  reversePoints() {
    this.controlPoints.reverse();
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
      diffuserShape: this.diffuserShape,
      materialPreset: this.materialPreset,
      pixelMode: this.pixelMode,
      pixelsPerMeter: this.pixelsPerMeter,
      startPixel: this.startPixel,
      pixelColor: this.pixelColor,
      pixelEmissive: this.pixelEmissive,
      fixtureId: this.fixtureId,
      dmxUniverse: this.dmxUniverse,
      dmxAddress: this.dmxAddress,
      dmxChannelsPerPixel: this.dmxChannelsPerPixel,
      fixturePreset: this.fixturePreset,
      isPlaceholder: this.isPlaceholder,
      facingDirection: this.facingDirection,
      placeholderName: this.placeholderName,
      // groupId deliberately omitted — clone is independent
      tension: this.tension,
      closed: this.closed,
    });
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      controlPoints: this.controlPoints.map(p => ({ x: p.x, y: p.y, z: p.z })),
      tension: this.tension,
      closed: this.closed,
      profile: this.profile,
      diameterMm: this.diameterMm,
      widthMm: this.widthMm,
      heightMm: this.heightMm,
      wallThicknessMm: this.wallThicknessMm,
      diffuserShape: this.diffuserShape,
      materialPreset: this.materialPreset,
      pixelMode: this.pixelMode,
      pixelsPerMeter: this.pixelsPerMeter,
      startPixel: this.startPixel,
      pixelColor: this.pixelColor,
      pixelEmissive: this.pixelEmissive,
      fixtureId: this.fixtureId,
      dmxUniverse: this.dmxUniverse,
      dmxChannelsPerPixel: this.dmxChannelsPerPixel,
      dmxAddress: this.dmxAddress,
      fixturePreset: this.fixturePreset,
      isPlaceholder: this.isPlaceholder,
      facingDirection: this.facingDirection,
      placeholderName: this.placeholderName,
      groupId: this.groupId,
      visible: this.visible,
      color: this.color,
    };
  }

  static fromJSON(data) {
    const tube = new TubeModel({
      name: data.name,
      controlPoints: (data.controlPoints || []).map(p => new THREE.Vector3(p.x, p.y, p.z)),
      tension: data.tension,
      closed: data.closed,
      profile: data.profile,
      diameterMm: data.diameterMm,
      widthMm: data.widthMm,
      heightMm: data.heightMm,
      wallThicknessMm: data.wallThicknessMm,
      diffuserShape: data.diffuserShape || 'flat',
      materialPreset: data.materialPreset,
      pixelMode: data.pixelMode || 'discrete',
      pixelsPerMeter: data.pixelsPerMeter,
      startPixel: data.startPixel || 0,
      pixelColor: data.pixelColor,
      pixelEmissive: data.pixelEmissive,
      fixtureId: data.fixtureId,
      dmxUniverse: data.dmxUniverse,
      dmxChannelsPerPixel: data.dmxChannelsPerPixel,
      dmxAddress: data.dmxAddress,
      fixturePreset: data.fixturePreset || 'custom',
      isPlaceholder: data.isPlaceholder || false,
      facingDirection: data.facingDirection || 'up',
      placeholderName: data.placeholderName || '',
      groupId: data.groupId || null,
      color: data.color,
    });
    if (data.id != null) tube.id = data.id;
    if (data.visible != null) tube.visible = data.visible;
    return tube;
  }

  static resetIdCounter(maxId) {
    tubeIdCounter = maxId;
  }

  _randomColor() {
    const colors = ['#00d4ff', '#ff44aa', '#44ff88', '#ffaa44', '#aa44ff', '#44aaff'];
    return colors[tubeIdCounter % colors.length];
  }
}
