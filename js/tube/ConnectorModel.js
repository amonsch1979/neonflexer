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

    // Three.js mesh reference (set by ConnectorManager)
    this.mesh = null;
  }

  toJSON() {
    return {
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
    });
    if (data.id != null) conn.id = data.id;
    return conn;
  }

  static resetIdCounter(maxId) {
    connectorIdCounter = maxId;
  }
}
