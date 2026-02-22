import * as THREE from 'three';
import { AngleConnectorGeometryBuilder } from './AngleConnectorGeometryBuilder.js';

/**
 * Builds procedural 3D meshes for connectors.
 * Delegates to AngleConnectorGeometryBuilder for angle/sphere types.
 */
export class ConnectorGeometryBuilder {
  /**
   * Create a connector mesh from a ConnectorModel.
   * @param {import('./ConnectorModel.js').ConnectorModel} connector
   * @returns {THREE.Mesh}
   */
  static build(connector) {
    // Delegate angle and sphere types
    if (connector.type === 'angle') {
      return AngleConnectorGeometryBuilder.buildAngle(connector);
    }
    if (connector.type === 'sphere') {
      return AngleConnectorGeometryBuilder.buildSphere(connector);
    }

    // Default: inline cylinder connector
    const radiusBottom = (connector.diameterMm / 2) * 0.001; // mm to meters
    const radiusTop = radiusBottom * 0.9; // slight taper
    const height = connector.heightMm * 0.001;

    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 24, 1);

    // Use connector color if set, fall back to red
    const colorHex = connector.color && connector.color !== '#555555'
      ? new THREE.Color(connector.color)
      : new THREE.Color(0xff2222);
    const emissiveHex = colorHex.clone().multiplyScalar(0.5);

    const material = new THREE.MeshPhysicalMaterial({
      color: colorHex,
      metalness: 0.2,
      roughness: 0.5,
      clearcoat: 0.3,
      emissive: emissiveHex,
      emissiveIntensity: 0.3,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Connector_${connector.id}`;

    // Position at connector location
    mesh.position.copy(connector.position);

    // Orient along tangent direction
    // CylinderGeometry is Y-up by default, rotate to align with tangent
    const tangent = connector.tangent.clone().normalize();
    const defaultUp = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultUp, tangent);
    mesh.quaternion.copy(quaternion);

    return mesh;
  }
}
