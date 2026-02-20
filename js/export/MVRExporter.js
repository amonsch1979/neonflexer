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
    const hasDiscretePixels = tubes.some(t => t.pixelMode !== 'uv-mapped');

    // 3. Build the generic LED GDTF fixture (only if needed)
    const gdtfData = hasDiscretePixels ? this._buildGenericLEDGdtf() : null;

    // 4. Collect all pixel positions per tube
    const tubePixels = this._collectPixelData(tubes);

    // 5. Build GeneralSceneDescription.xml
    const xml = this._buildMVRXml(tubes, tubePixels);

    // 6. Package into MVR (ZIP)
    const mvr = new ZipBuilder();
    mvr.addFile('GeneralSceneDescription.xml', xml);
    if (gdtfData) mvr.addFile('GenericLED.gdtf', gdtfData);
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
        this._addUVMappedParts(root, tube);
      } else {
        const bodyMat = tube.bodyMesh.material.clone();
        bodyMat.name = `${tube.name}_Body_${tube.materialPreset}`;
        const bodyClone = new THREE.Mesh(
          tube.bodyMesh.geometry.clone(),
          bodyMat
        );
        bodyClone.name = `Tube_${tube.id}_Body`;
        root.add(bodyClone);
      }
    }

    // Add connector meshes as static geometry
    for (const conn of connectors) {
      if (!conn.mesh) continue;
      const connGeo = conn.mesh.geometry.clone();
      const connMat = conn.mesh.material.clone();
      connMat.name = `Connector_${conn.id}_Body`;
      const connClone = new THREE.Mesh(connGeo, connMat);
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
   * Each part is a separate mesh with its own material name showing pixel count.
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

    for (let p = 0; p < numParts; p++) {
      const partStartPx = p * maxPxPerPart;
      const partEndPx = Math.min(partStartPx + maxPxPerPart, activePx);
      const partPx = partEndPx - partStartPx;

      const tStart = tOffset + (partStartPx / totalPixels);
      const tEnd = tOffset + (partEndPx / totalPixels);

      // Create sub-curve — TubeGeometry on this will have UVs 0→1 for this section
      const subCurve = new SubCurve(curve, tStart, tEnd);

      // Build geometry using the standard builder (handles all profiles, skips caps)
      const partGeo = TubeGeometryBuilder.build(subCurve, tube);

      const mat = tube.bodyMesh.material.clone();
      const partLabel = numParts > 1
        ? `_PT${p + 1}_${partPx}px`
        : `_${activePx}px`;
      mat.name = `${tube.name}_${tube.materialPreset}${partLabel}`;

      const mesh = new THREE.Mesh(partGeo, mat);
      mesh.name = `Tube_${tube.id}${partLabel}`;
      root.add(mesh);
    }
  }

  // ─── Pixel Data ─────────────────────────────────────────────

  static _collectPixelData(tubes) {
    const result = [];
    for (const tube of tubes) {
      if (tube.pixelMode === 'uv-mapped') { result.push([]); continue; }
      const curve = CurveBuilder.build(tube.controlPoints, tube.tension, tube.closed);
      if (!curve) { result.push([]); continue; }
      const { points } = CurveBuilder.getPixelPoints(curve, tube.pixelsPerMeter);
      // Skip startPixel pixels from the beginning
      const startPx = tube.startPixel || 0;
      result.push(startPx > 0 ? points.slice(startPx) : points);
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

  // ─── MVR XML ────────────────────────────────────────────────

  static _buildMVRXml(tubes, tubePixels) {
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

      // Build pixel fixtures (skip for uv-mapped tubes)
      const pixelNameOffset = tube.startPixel || 0;
      let pixelFixtures = '';
      for (let pi = 0; pi < (tube.pixelMode === 'uv-mapped' ? 0 : pixels.length); pi++) {
        const pos = pixels[pi];
        const uuid = this._uuid();
        // Convert Three.js (Y-up) to MVR (Z-up) in millimeters
        const x = (pos.x * 1000).toFixed(1);
        const y = (-pos.z * 1000).toFixed(1);
        const z = (pos.y * 1000).toFixed(1);

        // If this fixture won't fit in current universe, jump to next
        const addrInUni = ((absoluteAddr - 1) % 512) + 1;
        if (addrInUni + chPerPixel - 1 > 512) {
          absoluteAddr = (Math.floor((absoluteAddr - 1) / 512) + 1) * 512 + 1;
        }

        pixelFixtures += `
            <Fixture name="${tubeName}_Pixel_${pi + pixelNameOffset}" uuid="${uuid}">
              <Matrix>{1,0,0}{0,1,0}{0,0,1}{${x},${y},${z}}</Matrix>
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
