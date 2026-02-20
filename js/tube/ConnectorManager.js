import * as THREE from 'three';
import { ConnectorModel } from './ConnectorModel.js';
import { ConnectorGeometryBuilder } from './ConnectorGeometryBuilder.js';

/**
 * Manages the collection of connector pieces between tube segments.
 */
export class ConnectorManager {
  constructor(scene) {
    this.scene = scene;
    this.connectors = [];

    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'NeonFlexConnectors';
    this.scene.add(this.rootGroup);
  }

  /**
   * Create a connector and add it to the scene.
   * @param {object} options - ConnectorModel constructor options
   * @returns {ConnectorModel}
   */
  createConnector(options = {}) {
    const connector = new ConnectorModel(options);
    this.connectors.push(connector);
    this._buildMesh(connector);
    return connector;
  }

  /**
   * Delete a connector by instance or id.
   * @param {ConnectorModel|number} connectorOrId
   */
  deleteConnector(connectorOrId) {
    const connector = typeof connectorOrId === 'number'
      ? this.connectors.find(c => c.id === connectorOrId)
      : connectorOrId;
    if (!connector) return;

    const idx = this.connectors.indexOf(connector);
    if (idx === -1) return;

    this._disposeMesh(connector);
    this.connectors.splice(idx, 1);
  }

  /**
   * Delete all connectors associated with a given tube ID.
   * @param {number} tubeId
   */
  deleteConnectorsForTube(tubeId) {
    const toRemove = this.connectors.filter(
      c => c.tubeBeforeId === tubeId || c.tubeAfterId === tubeId
    );
    for (const connector of toRemove) {
      this.deleteConnector(connector);
    }
  }

  /**
   * Move all connectors linked to any of the given tube IDs by delta.
   * @param {number[]} tubeIds
   * @param {THREE.Vector3} delta
   */
  moveConnectorsForTubes(tubeIds, delta) {
    const idSet = new Set(tubeIds);
    for (const connector of this.connectors) {
      if (idSet.has(connector.tubeBeforeId) || idSet.has(connector.tubeAfterId)) {
        connector.position.add(delta);
        if (connector.mesh) {
          connector.mesh.position.copy(connector.position);
        }
      }
    }
  }

  /**
   * Remove all connectors.
   */
  clearAll() {
    for (const connector of this.connectors) {
      this._disposeMesh(connector);
    }
    this.connectors = [];
  }

  /**
   * Serialize all connectors to JSON.
   */
  toJSON() {
    return this.connectors.map(c => c.toJSON());
  }

  /**
   * Load connectors from JSON array.
   * @param {Array} dataArray
   */
  loadFromJSON(dataArray) {
    if (!Array.isArray(dataArray)) return;
    this.clearAll();
    let maxId = 0;
    for (const data of dataArray) {
      const connector = ConnectorModel.fromJSON(data);
      if (connector.id > maxId) maxId = connector.id;
      this.connectors.push(connector);
      this._buildMesh(connector);
    }
    ConnectorModel.resetIdCounter(maxId);
  }

  _buildMesh(connector) {
    const mesh = ConnectorGeometryBuilder.build(connector);
    connector.mesh = mesh;
    this.rootGroup.add(mesh);
  }

  _disposeMesh(connector) {
    if (connector.mesh) {
      this.rootGroup.remove(connector.mesh);
      connector.mesh.geometry.dispose();
      connector.mesh.material.dispose();
      connector.mesh = null;
    }
  }
}
