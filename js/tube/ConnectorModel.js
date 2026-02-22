import * as THREE from 'three';

let connectorIdCounter = 0;

/**
 * Data model for a connector piece between two tube segments.
 */
export class ConnectorModel {
  constructor(options = {}) {
    this.id = ++connectorIdCounter;
    this.position = options.position ? options.position.clone() : new THREE.Vector3();
    this.tangent = options.tangent ? options.tangent.clone() : new THREE.Vector3(0, 1, 0);
    this.diameterMm = options.diameterMm || 30;
    this.heightMm = options.heightMm || 30;
    this.tubeBeforeId = options.tubeBeforeId || null;
    this.tubeAfterId = options.tubeAfterId || null;
    this.fixturePreset = options.fixturePreset || 'custom';
    this.color = options.color || '#555555';

    // Connector type: 'inline' (default cylinder), 'angle' (torus-section), 'sphere'
    this.type = options.type || 'inline';
    // Angle in radians (for angle connectors — the bend angle between two tubes)
    this.angle = options.angle || 0;
    // Normal vector (plane of the angle connector)
    this.normal = options.normal ? options.normal.clone() : null;
    // Bisector vector (angle bisector for orientation)
    this.bisector = options.bisector ? options.bisector.clone() : null;

    // Three.js mesh reference (set by ConnectorManager)
    this.mesh = null;
  }

  toJSON() {
    const obj = {
      id: this.id,
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      tangent: { x: this.tangent.x, y: this.tangent.y, z: this.tangent.z },
      diameterMm: this.diameterMm,
      heightMm: this.heightMm,
      tubeBeforeId: this.tubeBeforeId,
      tubeAfterId: this.tubeAfterId,
      fixturePreset: this.fixturePreset,
      color: this.color,
    };
    if (this.type !== 'inline') obj.type = this.type;
    if (this.angle) obj.angle = this.angle;
    if (this.normal) obj.normal = { x: this.normal.x, y: this.normal.y, z: this.normal.z };
    if (this.bisector) obj.bisector = { x: this.bisector.x, y: this.bisector.y, z: this.bisector.z };
    return obj;
  }

  static fromJSON(data) {
    const conn = new ConnectorModel({
      position: new THREE.Vector3(data.position.x, data.position.y, data.position.z),
      tangent: new THREE.Vector3(data.tangent.x, data.tangent.y, data.tangent.z),
      diameterMm: data.diameterMm,
      heightMm: data.heightMm,
      tubeBeforeId: data.tubeBeforeId,
      tubeAfterId: data.tubeAfterId,
      fixturePreset: data.fixturePreset,
      color: data.color,
      type: data.type || 'inline',
      angle: data.angle || 0,
      normal: data.normal ? new THREE.Vector3(data.normal.x, data.normal.y, data.normal.z) : null,
      bisector: data.bisector ? new THREE.Vector3(data.bisector.x, data.bisector.y, data.bisector.z) : null,
    });
    if (data.id != null) conn.id = data.id;
    return conn;
  }

  static resetIdCounter(maxId) {
    connectorIdCounter = maxId;
  }
}
