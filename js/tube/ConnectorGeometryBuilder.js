import * as THREE from 'three';

/**
 * Builds procedural 3D meshes for connectors.
 * Creates slightly tapered cylinders oriented along the tangent direction.
 */
export class ConnectorGeometryBuilder {
  /**
   * Create a connector mesh from a ConnectorModel.
   * @param {import('./ConnectorModel.js').ConnectorModel} connector
   * @returns {THREE.Mesh}
   */
  static build(connector) {
    const radiusBottom = (connector.diameterMm / 2) * 0.001; // mm to meters
    const radiusTop = radiusBottom * 0.9; // slight taper
    const height = connector.heightMm * 0.001;

    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 24, 1);

    const material = new THREE.MeshPhysicalMaterial({
      color: 0xff2222,
      metalness: 0.2,
      roughness: 0.5,
      clearcoat: 0.3,
      emissive: 0x661111,
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
