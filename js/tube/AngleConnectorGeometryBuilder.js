import * as THREE from 'three';

/**
 * Builds angle (torus-section) and sphere connector geometries.
 * Used for shape wizard corners where tubes meet at angles.
 */
export class AngleConnectorGeometryBuilder {

  static _blackMaterial() {
    return new THREE.MeshPhysicalMaterial({
      color: 0x111111,
      metalness: 0.1,
      roughness: 0.6,
      clearcoat: 0.2,
    });
  }

  /**
   * Build a torus-section (bent pipe) for a 2D polygon corner.
   * @param {import('./ConnectorModel.js').ConnectorModel} connector
   * @returns {THREE.Mesh}
   */
  static buildAngle(connector) {
    const tubeRadius = (connector.diameterMm / 2) * 0.001;
    // Torus radius — small so the bend is tight
    const torusRadius = tubeRadius * 1.5;
    // Arc angle is the supplement of the edge angle (how much the pipe bends)
    const bendAngle = Math.PI - connector.angle;
    const segments = 16;
    const tubularSegments = 12;

    const geometry = new THREE.TorusGeometry(torusRadius, tubeRadius, tubularSegments, segments, bendAngle);
    const material = this._blackMaterial();
    if (connector.color && connector.color !== '#555555') {
      material.color.set(connector.color);
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `AngleConnector_${connector.id}`;
    mesh.position.copy(connector.position);

    // Orient the torus so it sits at the vertex
    // The torus is generated in XY plane; we need to rotate it to match the connector's plane
    if (connector.normal && connector.bisector) {
      const normal = connector.normal.clone().normalize();
      const bisector = connector.bisector.clone().normalize();
      // Third axis
      const cross = new THREE.Vector3().crossVectors(bisector, normal).normalize();

      // Build rotation matrix: torus X → bisector, torus Y → cross, torus Z → normal
      const m = new THREE.Matrix4();
      m.makeBasis(bisector, cross, normal);
      mesh.quaternion.setFromRotationMatrix(m);

      // Rotate around normal by half the bend angle to center it on the bisector
      const halfBend = bendAngle / 2;
      const rotQ = new THREE.Quaternion().setFromAxisAngle(normal, -halfBend);
      mesh.quaternion.premultiply(rotQ);
    }

    return mesh;
  }

  /**
   * Build a sphere for a 3D corner (e.g., box corner where 3 tubes meet).
   * @param {import('./ConnectorModel.js').ConnectorModel} connector
   * @returns {THREE.Mesh}
   */
  static buildSphere(connector) {
    const radius = (connector.diameterMm / 2) * 0.001 * 1.5;
    const geometry = new THREE.SphereGeometry(radius, 16, 16);
    const material = this._blackMaterial();
    if (connector.color && connector.color !== '#555555') {
      material.color.set(connector.color);
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `SphereConnector_${connector.id}`;
    mesh.position.copy(connector.position);

    return mesh;
  }
}
