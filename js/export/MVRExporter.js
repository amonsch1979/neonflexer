import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { CurveBuilder } from '../drawing/CurveBuilder.js';
import { TubeGeometryBuilder } from '../tube/TubeGeometryBuilder.js';
import { ZipBuilder } from '../utils/ZipBuilder.js';

/**
 * Helper: extracts a sub-section of a curve using arc-length parameterization.
 * TubeGeometry built on a SubCurve automatically gets UVs going 0→1 for that section.
 */
class SubCurve extends THREE.Curve {
  constructor(originalCurve, tStart, tEnd) {
    super();
    this.original = originalCurve;
    this.tStart = tStart;
    this.tEnd = tEnd;
  }
  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const mapped = this.tStart + t * (this.tEnd - this.tStart);
    return this.original.getPointAt(mapped, optionalTarget);
  }
}

/**
 * Export the design as an MVR (My Virtual Rig) file.
 *
 * Structure:
 *   MVR archive (.mvr = ZIP)
 *   ├── GeneralSceneDescription.xml
 *   ├── GenericLED.gdtf          (embedded GDTF fixture for pixels)
 *   └── models/
 *       └── TubeModel.glb        (all tube bodies in one GLB)
 *
 * Layers:
 *   - "Model"  → tube body meshes as SceneObjects
 *   - "Pixels" → each pixel as a GDTF Fixture (GenericLED, RGB mode)
 */
export class MVRExporter {

  /**
   * Export all tubes as MVR.
   * @param {import('../tube/TubeManager.js').TubeManager} tubeManager
   * @param {import('../tube/ConnectorManager.js').ConnectorManager} [connectorManager]
   * @param {string} filename
   */
  static async export(tubeManager, connectorManager = null, filename = 'NeonFlexDesign') {
    const tubes = tubeManager.tubes.filter(t => t.isValid && t.group);
    if (tubes.length === 0) throw new Error('No tubes to export');

    // 1. Build the GLB for tube bodies + connectors
    const connectors = connectorManager ? connectorManager.connectors : [];
    const glbData = await this._exportBodiesGLB(tubes, connectors);

    // 2. Check if any tube needs discrete pixel fixtures
    const hasDiscretePixels = tubes.some(t => !t.isPlaceholder && t.pixelMode !== 'uv-mapped');

    // 3. Build GDTF fixtures (only if needed)
    const gdtfData = hasDiscretePixels ? this._buildGenericLEDGdtf() : null;

    // Build one placeholder GDTF per unique fixture name
    // Map: placeholderName → gdtf filename
    const placeholderGdtfs = new Map();
    for (const tube of tubes) {
      if (!tube.isPlaceholder) continue;
      const name = tube.placeholderName || 'Generic Placeholder';
      if (!placeholderGdtfs.has(name)) {
        // Sanitize filename: replace non-alphanumeric with underscore
        const safeName = name.replace(/[^a-zA-Z0-9_\- ]/g, '_');
        const gdtfFilename = `${safeName}.gdtf`;
        placeholderGdtfs.set(name, {
          filename: gdtfFilename,
          data: this._buildPlaceholderGdtf(name),
        });
      }
    }

    // 4. Collect all pixel positions per tube
    const tubePixels = this._collectPixelData(tubes);

    // 5. Build GeneralSceneDescription.xml
    const xml = this._buildMVRXml(tubes, tubePixels, placeholderGdtfs);

    // 6. Package into MVR (ZIP)
    const mvr = new ZipBuilder();
    mvr.addFile('GeneralSceneDescription.xml', xml);
    if (gdtfData) mvr.addFile('GenericLED.gdtf', gdtfData);
    for (const { filename, data } of placeholderGdtfs.values()) {
      mvr.addFile(filename, data);
    }
    mvr.addFile('models/TubeModel.glb', new Uint8Array(glbData));

    const mvrData = mvr.build();
    this._download(new Blob([mvrData], { type: 'application/octet-stream' }), `${filename}.mvr`);
  }

  // ─── GLB Export (tube bodies only) ──────────────────────────

  static _exportBodiesGLB(tubes, connectors = []) {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    root.name = 'NeonFlexDesign';
    scene.add(root);

    for (const tube of tubes) {
      if (!tube.bodyMesh) continue;

      if (tube.pixelMode === 'uv-mapped') {
        // Split into parts for Capture's 512-channel texture generator limit
        // Handles both diffuser UV-mapping and housing export internally
        this._addUVMappedParts(root, tube);
      } else {
        // Diffuser mesh (transmissive material with chosen preset)
        const bodyMat = tube.bodyMesh.material.clone();
        bodyMat.name = `${tube.name}_Diffuser_${tube.materialPreset}`;
        // Frosted material — high roughness so Capture shows frost 100%
        bodyMat.roughness = 1.0;
        bodyMat.metalness = 0.0;
        const bodyClone = new THREE.Mesh(
          tube.bodyMesh.geometry.clone(),
          bodyMat
        );
        bodyClone.name = `Tube_${tube.id}_Diffuser`;
        root.add(bodyClone);

        // Housing mesh (opaque black) — present for split-profile tubes
        if (tube.baseMesh) {
          const baseMat = tube.baseMesh.material.clone();
          baseMat.name = `${tube.name}_Housing`;
          const baseClone = new THREE.Mesh(
            tube.baseMesh.geometry.clone(),
            baseMat
          );
          baseClone.name = `Tube_${tube.id}_Housing`;
          root.add(baseClone);
        }
      }
    }

    // Add connector meshes as static geometry — shared material for all connectors
    let sharedConnMat = null;
    for (const conn of connectors) {
      if (!conn.mesh) continue;
      if (!sharedConnMat) {
        sharedConnMat = conn.mesh.material.clone();
        sharedConnMat.name = 'Connector_Body';
        // Frosted material — high roughness so Capture shows frost 100%
        sharedConnMat.roughness = 1.0;
        sharedConnMat.metalness = 0.0;
      }
      const connGeo = conn.mesh.geometry.clone();
      const connClone = new THREE.Mesh(connGeo, sharedConnMat);
      connClone.name = `Connector_${conn.id}`;
      connClone.position.copy(conn.mesh.position);
      connClone.quaternion.copy(conn.mesh.quaternion);
      root.add(connClone);
    }

    const exporter = new GLTFExporter();
    return new Promise((resolve, reject) => {
      exporter.parse(
        scene,
        (result) => {
          scene.traverse(c => {
            if (c.isMesh) { c.geometry?.dispose(); c.material?.dispose(); }
          });
          resolve(result);
        },
        (error) => {
          scene.traverse(c => {
            if (c.isMesh) { c.geometry?.dispose(); c.material?.dispose(); }
          });
          reject(error);
        },
        { binary: true, onlyVisible: true }
      );
    });
  }

  /**
   * Split a UV-mapped tube into parts that fit Capture's 512-channel limit.
   * Only the diffuser gets UV-mapping; housing is added as a separate non-UV-mapped mesh.
   */
  static _addUVMappedParts(root, tube) {
    const curve = CurveBuilder.build(tube.controlPoints, tube.tension, tube.closed);
    if (!curve) return;

    const length = CurveBuilder.getLength(curve);
    const totalPixels = Math.max(1, Math.round(length * tube.pixelsPerMeter));
    const startPixel = tube.startPixel || 0;
    const activePx = Math.max(1, totalPixels - startPixel);
    const tOffset = startPixel / totalPixels; // curve position where active pixels begin

    const chPerPixel = Number(tube.dmxChannelsPerPixel) || 3;
    const maxPxPerPart = Math.floor(512 / chPerPixel);
    const numParts = Math.ceil(activePx / maxPxPerPart);

    // Check if this tube has split geometry (square/rect with housing + diffuser)
    const hasSplit = tube.baseMesh != null;

    for (let p = 0; p < numParts; p++) {
      const partStartPx = p * maxPxPerPart;
      const partEndPx = Math.min(partStartPx + maxPxPerPart, activePx);
      const partPx = partEndPx - partStartPx;

      const tStart = tOffset + (partStartPx / totalPixels);
      const tEnd = tOffset + (partEndPx / totalPixels);

      // Create sub-curve — geometry on this will have UVs 0→1 for this section
      const subCurve = new SubCurve(curve, tStart, tEnd);

      // For split profiles: UV-map only the diffuser shape, not the full profile
      const partGeo = hasSplit
        ? TubeGeometryBuilder.buildDiffuserOnly(subCurve, tube)
        : TubeGeometryBuilder.build(subCurve, tube);

      if (!partGeo) continue;

      const mat = tube.bodyMesh.material.clone();
      // Frosted material — high roughness so Capture shows frost 100%
      mat.roughness = 1.0;
      mat.metalness = 0.0;
      const partLabel = numParts > 1
        ? `_PT${p + 1}_${partPx}px`
        : `_${activePx}px`;
      mat.name = `${tube.name}_Diffuser_${tube.materialPreset}${partLabel}`;

      const mesh = new THREE.Mesh(partGeo, mat);
      mesh.name = `Tube_${tube.id}_Diffuser${partLabel}`;
      root.add(mesh);
    }

    // Housing mesh for UV-mapped tubes — single non-UV-mapped extrusion along full curve
    if (hasSplit) {
      const housingGeo = TubeGeometryBuilder.buildHousingOnly(curve, tube);
      if (housingGeo) {
        const baseMat = tube.baseMesh.material.clone();
        baseMat.name = `${tube.name}_Housing`;
        const housingMesh = new THREE.Mesh(housingGeo, baseMat);
        housingMesh.name = `Tube_${tube.id}_Housing`;
        root.add(housingMesh);
      }
    }
  }

  // ─── Pixel Data ─────────────────────────────────────────────

  static _collectPixelData(tubes) {
    const result = [];
    for (const tube of tubes) {
      if (tube.isPlaceholder || tube.pixelMode === 'uv-mapped') { result.push([]); continue; }
      const curve = CurveBuilder.build(tube.controlPoints, tube.tension, tube.closed);
      if (!curve) { result.push([]); continue; }
      const { points, count } = CurveBuilder.getPixelPoints(curve, tube.pixelsPerMeter);

      // For square/rect: offset pixels to inner bottom of housing (same as viewport)
      let offsetDist = 0;
      if (tube.profile === 'square') {
        offsetDist = tube.outerRadius - tube.wallThicknessMm * 0.001;
      } else if (tube.profile === 'rect') {
        offsetDist = tube.heightM / 2 - tube.wallThicknessMm * 0.001;
      }

      // Skip startPixel pixels from the beginning
      const startPx = tube.startPixel || 0;
      const pixelData = [];
      for (let i = startPx; i < points.length; i++) {
        // t matches CurveBuilder formula: centered pixels at (i + 0.5) / count
        const t = count === 1 ? 0.5 : (i + 0.5) / count;
        const tClamped = Math.min(Math.max(t, 0.001), 0.999);
        // Compute beam direction: normal of cross-section (toward diffuser = "up")
        const tangent = curve.getTangentAt(tClamped).normalize();
        // Reference up — use world Y unless tangent is nearly parallel
        const refUp = new THREE.Vector3(0, 1, 0);
        if (Math.abs(tangent.dot(refUp)) > 0.99) refUp.set(1, 0, 0);
        // Normal = component of refUp perpendicular to tangent
        const normal = refUp.clone().sub(tangent.clone().multiplyScalar(refUp.dot(tangent))).normalize();

        // Offset position to housing floor (in -normal direction = away from diffuser)
        const pos = points[i].clone();
        if (offsetDist > 0) {
          pos.x -= normal.x * offsetDist;
          pos.y -= normal.y * offsetDist;
          pos.z -= normal.z * offsetDist;
        }

        pixelData.push({ pos, normal, tangent: tangent.clone() });
      }
      result.push(pixelData);
    }
    return result;
  }

  // ─── Generic LED GDTF ──────────────────────────────────────

  static _buildGenericLEDGdtf() {
    const fixtureTypeId = this._uuid();
    const descriptionXml = `<?xml version="1.0" encoding="UTF-8"?>
<GDTF DataVersion="1.2">
  <FixtureType Name="Generic LED" ShortName="LED" LongName="Generic LED Pixel"
               Manufacturer="MAGICTOOLBOX" Description="Generic RGB LED Pixel for NeonFlex mapping"
               FixtureTypeID="${fixtureTypeId}" RefFT="">
    <AttributeDefinitions>
      <ActivationGroups>
        <ActivationGroup Name="ColorRGB"/>
      </ActivationGroups>
      <FeatureGroups>
        <FeatureGroup Name="Color" Pretty="Color">
          <Feature Name="Color.ColorRGB"/>
        </FeatureGroup>
      </FeatureGroups>
      <Attributes>
        <Attribute Name="ColorAdd_R" Pretty="R" ActivationGroup="ColorRGB" Feature="Color.ColorRGB" PhysicalUnit="ColorComponent"/>
        <Attribute Name="ColorAdd_G" Pretty="G" ActivationGroup="ColorRGB" Feature="Color.ColorRGB" PhysicalUnit="ColorComponent"/>
        <Attribute Name="ColorAdd_B" Pretty="B" ActivationGroup="ColorRGB" Feature="Color.ColorRGB" PhysicalUnit="ColorComponent"/>
        <Attribute Name="ColorAdd_W" Pretty="W" ActivationGroup="ColorRGB" Feature="Color.ColorRGB" PhysicalUnit="ColorComponent"/>
      </Attributes>
    </AttributeDefinitions>
    <Wheels/>
    <PhysicalDescriptions>
      <Emitters>
        <Emitter Name="Red" Color="0.64,0.33,0.03" DiodePart=""/>
        <Emitter Name="Green" Color="0.3,0.6,0.1" DiodePart=""/>
        <Emitter Name="Blue" Color="0.15,0.06,0.79" DiodePart=""/>
        <Emitter Name="White" Color="0.3127,0.3290,0.3583" DiodePart=""/>
      </Emitters>
    </PhysicalDescriptions>
    <Models/>
    <Geometries>
      <Geometry Name="Body" Model="" Position="{1,0,0}{0,1,0}{0,0,1}{0,0,0}">
        <Beam Name="Beam1" Model="" Position="{1,0,0}{0,1,0}{0,0,1}{0,0,0}"
              LampType="LED" BeamType="Wash" BeamAngle="120"/>
      </Geometry>
    </Geometries>
    <DMXModes>
      <DMXMode Name="RGB" Geometry="Body">
        <DMXChannels>
          <DMXChannel DMXBreak="1" Offset="1" Default="0/1" Highlight="255/1" Geometry="Beam1">
            <LogicalChannel Attribute="ColorAdd_R">
              <ChannelFunction Attribute="ColorAdd_R" DMXFrom="0/1" PhysicalFrom="0" PhysicalTo="1" Emitter="Red"/>
            </LogicalChannel>
          </DMXChannel>
          <DMXChannel DMXBreak="1" Offset="2" Default="0/1" Highlight="255/1" Geometry="Beam1">
            <LogicalChannel Attribute="ColorAdd_G">
              <ChannelFunction Attribute="ColorAdd_G" DMXFrom="0/1" PhysicalFrom="0" PhysicalTo="1" Emitter="Green"/>
            </LogicalChannel>
          </DMXChannel>
          <DMXChannel DMXBreak="1" Offset="3" Default="0/1" Highlight="255/1" Geometry="Beam1">
            <LogicalChannel Attribute="ColorAdd_B">
              <ChannelFunction Attribute="ColorAdd_B" DMXFrom="0/1" PhysicalFrom="0" PhysicalTo="1" Emitter="Blue"/>
            </LogicalChannel>
          </DMXChannel>
        </DMXChannels>
      </DMXMode>
      <DMXMode Name="RGBW" Geometry="Body">
        <DMXChannels>
          <DMXChannel DMXBreak="1" Offset="1" Default="0/1" Highlight="255/1" Geometry="Beam1">
            <LogicalChannel Attribute="ColorAdd_R">
              <ChannelFunction Attribute="ColorAdd_R" DMXFrom="0/1" PhysicalFrom="0" PhysicalTo="1" Emitter="Red"/>
            </LogicalChannel>
          </DMXChannel>
          <DMXChannel DMXBreak="1" Offset="2" Default="0/1" Highlight="255/1" Geometry="Beam1">
            <LogicalChannel Attribute="ColorAdd_G">
              <ChannelFunction Attribute="ColorAdd_G" DMXFrom="0/1" PhysicalFrom="0" PhysicalTo="1" Emitter="Green"/>
            </LogicalChannel>
          </DMXChannel>
          <DMXChannel DMXBreak="1" Offset="3" Default="0/1" Highlight="255/1" Geometry="Beam1">
            <LogicalChannel Attribute="ColorAdd_B">
              <ChannelFunction Attribute="ColorAdd_B" DMXFrom="0/1" PhysicalFrom="0" PhysicalTo="1" Emitter="Blue"/>
            </LogicalChannel>
          </DMXChannel>
          <DMXChannel DMXBreak="1" Offset="4" Default="0/1" Highlight="255/1" Geometry="Beam1">
            <LogicalChannel Attribute="ColorAdd_W">
              <ChannelFunction Attribute="ColorAdd_W" DMXFrom="0/1" PhysicalFrom="0" PhysicalTo="1" Emitter="White"/>
            </LogicalChannel>
          </DMXChannel>
        </DMXChannels>
      </DMXMode>
    </DMXModes>
  </FixtureType>
</GDTF>`;

    // GDTF is a ZIP containing description.xml
    const gdtf = new ZipBuilder();
    gdtf.addFile('description.xml', descriptionXml);
    return gdtf.build();
  }

  // ─── Placeholder GDTF ──────────────────────────────────────

  static _buildPlaceholderGdtf(name = 'Generic Placeholder') {
    const fixtureTypeId = this._uuid();
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const descriptionXml = `<?xml version="1.0" encoding="UTF-8"?>
<GDTF DataVersion="1.2">
  <!--Capture Placeholder-->
  <FixtureType Name="${esc(name)}" ShortName="${esc(name.substring(0, 20))}" LongName="${esc(name)}"
               Manufacturer="MAGICTOOLBOX" Description="Placeholder for ${esc(name)} — swap with real fixture in Capture"
               FixtureTypeID="${fixtureTypeId}" RefFT="">
    <AttributeDefinitions>
      <ActivationGroups>
        <ActivationGroup Name="DimmerGroup"/>
      </ActivationGroups>
      <FeatureGroups>
        <FeatureGroup Name="Dimmer" Pretty="Dimmer">
          <Feature Name="Dimmer.Dimmer"/>
        </FeatureGroup>
      </FeatureGroups>
      <Attributes>
        <Attribute Name="Dimmer" Pretty="Dim" ActivationGroup="DimmerGroup" Feature="Dimmer.Dimmer" PhysicalUnit="LuminousIntensity"/>
        <Attribute Name="ColorAdd_R" Pretty="R" ActivationGroup="DimmerGroup" Feature="Dimmer.Dimmer" PhysicalUnit="ColorComponent"/>
        <Attribute Name="ColorAdd_G" Pretty="G" ActivationGroup="DimmerGroup" Feature="Dimmer.Dimmer" PhysicalUnit="ColorComponent"/>
        <Attribute Name="ColorAdd_B" Pretty="B" ActivationGroup="DimmerGroup" Feature="Dimmer.Dimmer" PhysicalUnit="ColorComponent"/>
        <Attribute Name="ColorAdd_W" Pretty="W" ActivationGroup="DimmerGroup" Feature="Dimmer.Dimmer" PhysicalUnit="ColorComponent"/>
      </Attributes>
    </AttributeDefinitions>
    <Wheels/>
    <PhysicalDescriptions/>
    <Models/>
    <Geometries>
      <Geometry Name="Body" Model="" Position="{1,0,0}{0,1,0}{0,0,1}{0,0,0}"/>
    </Geometries>
    <DMXModes>
      <DMXMode Name="RGBW" Geometry="Body">
        <DMXChannels>
          <DMXChannel DMXBreak="1" Offset="1" Default="0/1" Highlight="255/1" Geometry="Body">
            <LogicalChannel Attribute="ColorAdd_R">
              <ChannelFunction Attribute="ColorAdd_R" DMXFrom="0/1" PhysicalFrom="0" PhysicalTo="1"/>
            </LogicalChannel>
          </DMXChannel>
          <DMXChannel DMXBreak="1" Offset="2" Default="0/1" Highlight="255/1" Geometry="Body">
            <LogicalChannel Attribute="ColorAdd_G">
              <ChannelFunction Attribute="ColorAdd_G" DMXFrom="0/1" PhysicalFrom="0" PhysicalTo="1"/>
            </LogicalChannel>
          </DMXChannel>
          <DMXChannel DMXBreak="1" Offset="3" Default="0/1" Highlight="255/1" Geometry="Body">
            <LogicalChannel Attribute="ColorAdd_B">
              <ChannelFunction Attribute="ColorAdd_B" DMXFrom="0/1" PhysicalFrom="0" PhysicalTo="1"/>
            </LogicalChannel>
          </DMXChannel>
          <DMXChannel DMXBreak="1" Offset="4" Default="0/1" Highlight="255/1" Geometry="Body">
            <LogicalChannel Attribute="ColorAdd_W">
              <ChannelFunction Attribute="ColorAdd_W" DMXFrom="0/1" PhysicalFrom="0" PhysicalTo="1"/>
            </LogicalChannel>
          </DMXChannel>
        </DMXChannels>
      </DMXMode>
    </DMXModes>
  </FixtureType>
</GDTF>`;

    const gdtf = new ZipBuilder();
    gdtf.addFile('description.xml', descriptionXml);
    return gdtf.build();
  }

  // ─── Placeholder Matrix ──────────────────────────────────────

  /**
   * Compute MVR rotation matrix for a placeholder fixture.
   * @param {import('../tube/TubeModel.js').TubeModel} tube
   * @param {import('../tube/TubeModel.js').TubeModel[]} groupTubes - all tubes in the group (for inward/outward)
   * @returns {{ matrix: string, position: {x:number,y:number,z:number} }}
   */
  static _computePlaceholderMatrix(tube, groupTubes) {
    const curve = CurveBuilder.build(tube.controlPoints, tube.tension, tube.closed);
    if (!curve) return null;

    // Midpoint and tangent at t=0.5
    const midpoint = curve.getPointAt(0.5);
    const tangent = curve.getTangentAt(0.5).normalize();

    // Compute beam direction from facing
    let beam;
    const facing = tube.facingDirection || 'up';

    if (facing === 'up') {
      beam = new THREE.Vector3(0, 1, 0);
    } else if (facing === 'down') {
      beam = new THREE.Vector3(0, -1, 0);
    } else {
      // inward/outward: compute centroid of group
      const centroid = new THREE.Vector3();
      let count = 0;
      for (const t of groupTubes) {
        for (const pt of t.controlPoints) {
          centroid.add(pt);
          count++;
        }
      }
      if (count > 0) centroid.divideScalar(count);

      const toCenter = centroid.clone().sub(midpoint).normalize();
      // Remove component along tangent (project to perpendicular plane)
      toCenter.sub(tangent.clone().multiplyScalar(toCenter.dot(tangent)));
      if (toCenter.lengthSq() < 0.0001) {
        // Fallback if tube points at centroid
        beam = new THREE.Vector3(0, 1, 0);
      } else {
        toCenter.normalize();
        beam = facing === 'inward' ? toCenter : toCenter.negate();
      }
    }

    // Negate: in GDTF the fixture beam points along -Z of local space,
    // so row3 (fixture +Z) must point opposite to the desired facing direction
    beam.negate();

    // Make beam perpendicular to tangent
    beam.sub(tangent.clone().multiplyScalar(beam.dot(tangent)));
    if (beam.lengthSq() < 0.0001) {
      // Tangent is parallel to beam direction — pick arbitrary perpendicular
      beam = new THREE.Vector3(0, 0, 1);
      beam.sub(tangent.clone().multiplyScalar(beam.dot(tangent))).normalize();
    } else {
      beam.normalize();
    }

    // Build orthonormal basis in Three.js space (Y-up, right-handed):
    //   tangent = fixture local X (strip length direction)
    //   beam    = fixture local Z (facing/beam direction)
    //   cross   = fixture local Y (perpendicular, right-hand rule: Y = Z × X)
    const cross = new THREE.Vector3().crossVectors(beam, tangent).normalize();

    // Convert to MVR coordinate system: Three.js Y-up → MVR Z-up
    // MVR: x=x, y=-z, z=y (for both rotation and translation)
    // Matrix format: {row1}{row2}{row3}{translation}
    //   row1 = fixture local X in world (strip direction)
    //   row2 = fixture local Y in world (perpendicular)
    //   row3 = fixture local Z in world (facing/beam direction)
    const toMVR = (v) => ({ x: v.x, y: -v.z, z: v.y });

    const row1 = toMVR(tangent); // fixture X = strip direction
    const row2 = toMVR(cross);   // fixture Y = perpendicular
    const row3 = toMVR(beam);    // fixture Z = facing direction
    const tx = toMVR(midpoint);

    const f = (n) => n.toFixed(6);
    const matrix = `{${f(row1.x)},${f(row1.y)},${f(row1.z)}}{${f(row2.x)},${f(row2.y)},${f(row2.z)}}{${f(row3.x)},${f(row3.y)},${f(row3.z)}}{${f(tx.x * 1000)},${f(tx.y * 1000)},${f(tx.z * 1000)}}`;

    return { matrix, position: { x: tx.x * 1000, y: tx.y * 1000, z: tx.z * 1000 } };
  }

  // ─── MVR XML ────────────────────────────────────────────────

  static _buildMVRXml(tubes, tubePixels, placeholderGdtfs = new Map()) {
    // One layer per tube, with a GroupObject containing model + pixels together
    let allLayers = '';

    for (let ti = 0; ti < tubes.length; ti++) {
      const tube = tubes[ti];
      const pixels = tubePixels[ti];
      const tubeName = this._esc(tube.name);

      const layerUuid = this._uuid();
      const groupUuid = this._uuid();
      const sceneObjUuid = this._uuid();

      // DMX settings
      const chPerPixel = Number(tube.dmxChannelsPerPixel) || 3;
      const gdtfMode = chPerPixel === 4 ? 'RGBW' : 'RGB';
      const startUniverse = Number(tube.dmxUniverse) || 1;
      const startAddress = Number(tube.dmxAddress) || 1;
      let fixtureId = Number(tube.fixtureId) || 1;

      // Absolute DMX address: Universe 1 Addr 1 = 1, Universe 2 Addr 1 = 513, etc.
      // In MVR, break=0 (fixture DMX input), address = absolute across universes
      let absoluteAddr = (startUniverse - 1) * 512 + startAddress;

      let pixelFixtures = '';

      if (tube.isPlaceholder) {
        // Placeholder: 1 fixture per tube with rotation matrix
        const groupTubes = tube.groupId
          ? tubes.filter(t => t.groupId === tube.groupId)
          : [tube];
        const result = this._computePlaceholderMatrix(tube, groupTubes);
        if (result) {
          const uuid = this._uuid();
          const phDisplayName = tube.placeholderName || tube.name;
          const phKey = tube.placeholderName || 'Generic Placeholder';
          const gdtfFile = placeholderGdtfs.has(phKey)
            ? placeholderGdtfs.get(phKey).filename
            : 'Generic Placeholder.gdtf';
          pixelFixtures = `
            <Fixture name="${this._esc(phDisplayName)}" uuid="${uuid}">
              <Matrix>${result.matrix}</Matrix>
              <GDTFSpec>${this._esc(gdtfFile)}</GDTFSpec>
              <GDTFMode>RGBW</GDTFMode>
              <Addresses>
                <Address break="0">${absoluteAddr}</Address>
              </Addresses>
              <FixtureID>${fixtureId}</FixtureID>
              <CustomId>${ti + 1}</CustomId>
            </Fixture>`;
        }
      } else {
        // Build pixel fixtures (skip for uv-mapped tubes)
        const pixelNameOffset = tube.startPixel || 0;
        for (let pi = 0; pi < (tube.pixelMode === 'uv-mapped' ? 0 : pixels.length); pi++) {
          const px = pixels[pi];
          const pos = px.pos;
          const uuid = this._uuid();

          // Build rotation matrix so GDTF beam (-Z) points toward diffuser
          // Fixture local: X=tangent, Z=opposite of beam, Y=cross product
          // Beam direction = normal (toward diffuser), so fixture Z = -normal
          const T = px.tangent;
          const beam = px.normal; // toward diffuser
          const fZ = beam.clone().negate(); // fixture +Z = opposite of beam direction
          const fY = new THREE.Vector3().crossVectors(fZ, T).normalize();

          // Convert to MVR coordinates: Three.js Y-up → MVR Z-up (x=x, y=-z, z=y)
          const toMVR = (v) => ({ x: v.x, y: -v.z, z: v.y });
          const row1 = toMVR(T);
          const row2 = toMVR(fY);
          const row3 = toMVR(fZ);

          // Position in MVR mm
          const tx = pos.x * 1000;
          const ty = -pos.z * 1000;
          const tz = pos.y * 1000;

          const f = (n) => n.toFixed(6);
          const matrix = `{${f(row1.x)},${f(row1.y)},${f(row1.z)}}{${f(row2.x)},${f(row2.y)},${f(row2.z)}}{${f(row3.x)},${f(row3.y)},${f(row3.z)}}{${tx.toFixed(1)},${ty.toFixed(1)},${tz.toFixed(1)}}`;

          // If this fixture won't fit in current universe, jump to next
          const addrInUni = ((absoluteAddr - 1) % 512) + 1;
          if (addrInUni + chPerPixel - 1 > 512) {
            absoluteAddr = (Math.floor((absoluteAddr - 1) / 512) + 1) * 512 + 1;
          }

          pixelFixtures += `
            <Fixture name="${tubeName}_Pixel_${pi + pixelNameOffset}" uuid="${uuid}">
              <Matrix>${matrix}</Matrix>
              <GDTFSpec>GenericLED.gdtf</GDTFSpec>
              <GDTFMode>${gdtfMode}</GDTFMode>
              <Addresses>
                <Address break="0">${absoluteAddr}</Address>
              </Addresses>
              <FixtureID>${fixtureId}</FixtureID>
              <CustomId>${ti + 1}</CustomId>
            </Fixture>`;

          absoluteAddr += chPerPixel;
          fixtureId++;
        }
      }

      // Layer > GroupObject > (SceneObject + Fixtures)
      allLayers += `
      <Layer name="${tubeName}" uuid="${layerUuid}">
        <ChildList>
          <GroupObject name="${tubeName}" uuid="${groupUuid}">
            <Matrix>{1,0,0}{0,1,0}{0,0,1}{0,0,0}</Matrix>
            <ChildList>
              <SceneObject name="${tubeName}_Model" uuid="${sceneObjUuid}">
                <Matrix>{1,0,0}{0,1,0}{0,0,1}{0,0,0}</Matrix>
                <Geometries>
                  <Geometry3D fileName="models/TubeModel.glb"/>
                </Geometries>
              </SceneObject>${pixelFixtures}
            </ChildList>
          </GroupObject>
        </ChildList>
      </Layer>`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<GeneralSceneDescription verMajor="1" verMinor="6">
  <UserData/>
  <Scene>
    <Layers>${allLayers}
    </Layers>
  </Scene>
</GeneralSceneDescription>`;
  }

  // ─── Helpers ────────────────────────────────────────────────

  static _uuid() {
    // crypto.randomUUID() requires secure context (HTTPS); fallback for HTTP
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback: RFC 4122 v4 UUID via getRandomValues
    const bytes = new Uint8Array(16);
    (typeof crypto !== 'undefined' ? crypto : {}).getRandomValues?.(bytes)
      || bytes.forEach((_, i, a) => { a[i] = Math.random() * 256 | 0; });
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }

  static _esc(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  static _download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
