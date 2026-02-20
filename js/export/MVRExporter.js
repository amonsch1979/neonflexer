import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { CurveBuilder } from '../drawing/CurveBuilder.js';
import { ZipBuilder } from '../utils/ZipBuilder.js';

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
   * @param {string} filename
   */
  static async export(tubeManager, filename = 'NeonFlexDesign') {
    const tubes = tubeManager.tubes.filter(t => t.isValid && t.group);
    if (tubes.length === 0) throw new Error('No tubes to export');

    // 1. Build the GLB for tube bodies (no pixels)
    const glbData = await this._exportBodiesGLB(tubes);

    // 2. Build the generic LED GDTF fixture
    const gdtfData = this._buildGenericLEDGdtf();

    // 3. Collect all pixel positions per tube
    const tubePixels = this._collectPixelData(tubes);

    // 4. Build GeneralSceneDescription.xml
    const xml = this._buildMVRXml(tubes, tubePixels);

    // 5. Package into MVR (ZIP)
    const mvr = new ZipBuilder();
    mvr.addFile('GeneralSceneDescription.xml', xml);
    mvr.addFile('GenericLED.gdtf', gdtfData);
    mvr.addFile('models/TubeModel.glb', new Uint8Array(glbData));

    const mvrData = mvr.build();
    this._download(new Blob([mvrData], { type: 'application/octet-stream' }), `${filename}.mvr`);
  }

  // ─── GLB Export (tube bodies only) ──────────────────────────

  static _exportBodiesGLB(tubes) {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    root.name = 'NeonFlexDesign';
    scene.add(root);

    for (const tube of tubes) {
      if (!tube.bodyMesh) continue;
      const bodyMat = tube.bodyMesh.material.clone();
      bodyMat.name = `${tube.name}_Body_${tube.materialPreset}`;
      const bodyClone = new THREE.Mesh(
        tube.bodyMesh.geometry.clone(),
        bodyMat
      );
      bodyClone.name = `Tube_${tube.id}_Body`;
      root.add(bodyClone);
    }

    const exporter = new GLTFExporter();
    return new Promise((resolve, reject) => {
      exporter.parse(
        scene,
        (result) => {
          // Dispose clones
          scene.traverse(c => {
            if (c.isMesh) { c.geometry?.dispose(); c.material?.dispose(); }
          });
          resolve(result); // ArrayBuffer
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

  // ─── Pixel Data ─────────────────────────────────────────────

  static _collectPixelData(tubes) {
    const result = [];
    for (const tube of tubes) {
      const curve = CurveBuilder.build(tube.controlPoints, tube.tension, tube.closed);
      if (!curve) { result.push([]); continue; }
      const { points } = CurveBuilder.getPixelPoints(curve, tube.pixelsPerMeter);
      result.push(points);
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

      // Build pixel fixtures
      let pixelFixtures = '';
      for (let pi = 0; pi < pixels.length; pi++) {
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
            <Fixture name="${tubeName}_Pixel_${pi}" uuid="${uuid}">
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
    return crypto.randomUUID();
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
