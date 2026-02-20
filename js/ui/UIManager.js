import { Toolbar } from './Toolbar.js';
import { PropertiesPanel } from './PropertiesPanel.js';
import { TubeListPanel } from './TubeListPanel.js';
import { MVRExporter } from '../export/MVRExporter.js';
import { ReferenceModelManager } from '../ref/ReferenceModelManager.js';
import { ConnectorManager } from '../tube/ConnectorManager.js';
import { getPresetById } from '../tube/FixturePresets.js';
import { StartPixelPicker } from '../drawing/StartPixelPicker.js';
import { TubeCutter } from '../drawing/TubeCutter.js';
import * as THREE from 'three';

/**
 * Coordinates all UI panels and connects them to the app logic.
 */
export class UIManager {
  constructor(app) {
    this.app = app;
    this.helpVisible = false;

    // Toolbar
    this.toolbar = new Toolbar(document.getElementById('toolbar'));
    this.toolbar.onToolChange = (tool) => this._onToolChange(tool);
    this.toolbar.onSnapToggle = (enabled) => this._onSnapToggle(enabled);
    this.toolbar.onPlaneChange = (plane) => this._onPlaneChange(plane);
    this.toolbar.onExport = () => this._onExport();
    this.toolbar.onSave = () => this._onSave();
    this.toolbar.onLoad = () => this._onLoad();
    this.toolbar.onDeleteTube = () => this._onDeleteSelected();
    this.toolbar.onDuplicateTube = () => this._onDuplicateSelected();
    this.toolbar.onHelp = () => this.toggleHelp();
    this.toolbar.onImportRef = () => this._onImportRef();
    this.toolbar.onGroupTubes = () => this._onGroupTubes();
    this.toolbar.onUngroupTubes = () => this._onUngroupTubes();
    this.toolbar.onGridSizeChange = (size) => this._onGridSizeChange(size);
    this.toolbar.onPresetChange = (presetId) => this._onPresetChange(presetId);

    // Length overlay element
    this.lengthOverlay = document.getElementById('length-overlay');

    // Properties panel
    this.propertiesPanel = new PropertiesPanel(document.getElementById('properties-panel'));
    this.propertiesPanel.onPropertyChange = (tube, prop) => this._onPropertyChange(tube, prop);

    // Tube list
    this.tubeListPanel = new TubeListPanel(document.getElementById('tube-list'));
    this.tubeListPanel.onSelectTube = (id) => this._onSelectTube(id);
    this.tubeListPanel.onMultiSelectTube = (id) => this._onMultiSelectTube(id);
    this.tubeListPanel.onDeleteTube = (id) => this._onDeleteTube(id);
    this.tubeListPanel.onToggleVisible = (id) => this._onToggleVisible(id);

    // Mid-draw segment created (auto-complete at maxLength) — refresh list but stay in drawing mode
    this.app.drawingManager.onSegmentCreated = (tube, segNum) => {
      this._refreshAll();
    };

    // Switch back to select mode after completing a drawing
    this.app.drawingManager.onDrawingComplete = () => {
      // Auto-snap to selected ref model after shape drawing
      const tube = this.app.tubeManager.selectedTube;
      const refModel = this.refModelManager.selectedModel;
      if (tube && refModel && refModel.group && !refModel.needsReimport) {
        const snapped = this.refModelManager.snapTubeToModel(tube, refModel);
        this.app.tubeManager.updateTube(tube);
        if (snapped > 0) {
          const statusEl = document.getElementById('status-text');
          if (statusEl) statusEl.textContent = `Auto-snapped ${snapped} points to "${refModel.name}"`;
        }
      }
      this.setTool('select');
    };

    // Connect tube manager callbacks
    const tm = this.app.tubeManager;
    tm.onTubeCreated = () => this._refreshAll();
    tm.onTubeUpdated = () => this._refreshAll();
    tm.onTubeDeleted = () => this._refreshAll();
    tm.onSelectionChanged = (tube) => {
      if (tube) {
        // Deselect ref model when a tube is selected
        this.refModelManager.selectedModel = null;
      }
      this.propertiesPanel.show(tube);
      this._refreshTubeList();
    };

    // Reference Model Manager
    this.refModelManager = new ReferenceModelManager(app.sceneManager.scene);
    this.refModelManager.onModelAdded = () => this._refreshAll();
    this.refModelManager.onModelRemoved = () => this._refreshAll();
    this.refModelManager.onModelUpdated = () => this._refreshAll();
    this.refModelManager.onSelectionChanged = (refModel) => {
      if (refModel) {
        // Deselect tube when a ref model is selected
        this.app.tubeManager.selectTube(null);
        this.propertiesPanel.show(refModel);
      }
      this._refreshTubeList();
    };

    // Connector Manager
    this.connectorManager = new ConnectorManager(app.sceneManager.scene);

    // Wire group movement → connector movement
    tm.onGroupMoved = (tubeIds, delta) => {
      this.connectorManager.moveConnectorsForTubes(tubeIds, delta);
    };

    // Wire connector manager to drawing manager
    this.app.drawingManager.connectorManager = this.connectorManager;

    // Tube list callbacks for ref models
    this.tubeListPanel.onSelectRefModel = (id) => this._onSelectRefModel(id);
    this.tubeListPanel.onDeleteRefModel = (id) => this._onDeleteRefModel(id);
    this.tubeListPanel.onToggleRefVisible = (id) => this._onToggleRefVisible(id);
    this.tubeListPanel.onReimportRefModel = (id) => this._onReimportRefModel(id);

    // Properties panel callback for ref model changes
    this.propertiesPanel.onRefModelChange = (refModel, prop) => {
      this.refModelManager.updateModel(refModel);
      this._refreshTubeList();
    };
    this.propertiesPanel.onRefModelRemove = (refModel) => {
      this.refModelManager.removeModel(refModel.id);
    };
    this.propertiesPanel.onSnapToRef = (tube) => this._onSnapToRef(tube);
    this.propertiesPanel.onPickStartPixel = (tube) => this._onPickStartPixel(tube);

    // Start Pixel Picker
    this.startPixelPicker = new StartPixelPicker(app.sceneManager);
    this.startPixelPicker.onPick = (tube, pixelIndex) => {
      tube.startPixel = pixelIndex;
      this.app.tubeManager.updateTube(tube);
      this.propertiesPanel.show(tube);
      this.setTool('select'); // restore select mode
      const statusEl = document.getElementById('status-text');
      if (statusEl) statusEl.textContent = `Start pixel set to #${pixelIndex} on "${tube.name}"`;
    };
    this.startPixelPicker.onCancel = () => {
      this.setTool('select'); // restore select mode
      const statusEl = document.getElementById('status-text');
      if (statusEl) statusEl.textContent = 'Start pixel pick cancelled';
    };

    // Tube Cutter
    this.tubeCutter = new TubeCutter(app.sceneManager, app.tubeManager);
    this.tubeCutter.onCut = (tube, t, isClosed) => {
      const statusEl = document.getElementById('status-text');
      if (isClosed) {
        // First cut on closed tube — open it
        this.app.tubeManager.openTubeAt(tube, t);
        if (statusEl) statusEl.textContent = `Opened "${tube.name}" — cut again to split into two pieces`;
      } else {
        // Cut open tube — split into two
        const result = this.app.tubeManager.splitTube(tube, t);
        if (result) {
          const [tubeA, tubeB] = result;
          if (statusEl) statusEl.textContent = `Split into "${tubeA.name}" and "${tubeB.name}" — delete unwanted piece`;
        }
      }
    };
    this.tubeCutter.onCancel = () => {
      this.setTool('select');
      const statusEl = document.getElementById('status-text');
      if (statusEl) statusEl.textContent = 'Cut tool cancelled';
    };

    // Hidden file input for project loading
    this._fileInput = document.createElement('input');
    this._fileInput.type = 'file';
    this._fileInput.accept = '.neon';
    this._fileInput.style.display = 'none';
    document.body.appendChild(this._fileInput);
    this._fileInput.addEventListener('change', (e) => this._onFileSelected(e));

    // Hidden file input for reference model import
    this._refFileInput = document.createElement('input');
    this._refFileInput.type = 'file';
    this._refFileInput.accept = '.glb,.gltf,.obj,.3ds,.mvr';
    this._refFileInput.style.display = 'none';
    document.body.appendChild(this._refFileInput);
    this._refFileInput.addEventListener('change', (e) => this._onRefFileSelected(e));

    // Reimport file input (reused for ghost entries)
    this._reimportFileInput = document.createElement('input');
    this._reimportFileInput.type = 'file';
    this._reimportFileInput.accept = '.glb,.gltf,.obj,.3ds,.mvr';
    this._reimportFileInput.style.display = 'none';
    document.body.appendChild(this._reimportFileInput);

    // Create help overlay (hidden by default)
    this._createHelpOverlay();
  }

  _onToolChange(tool) {
    // Deactivate tube cutter when switching away from cut mode
    if (this.tubeCutter.active && tool !== 'cut') {
      this.tubeCutter.deactivate();
    }

    // Auto-elevate drawing plane for shape tools when a ref model is selected
    if ((tool === 'rectangle' || tool === 'circle') && this.refModelManager.selectedModel) {
      const refModel = this.refModelManager.selectedModel;
      if (refModel.group && !refModel.needsReimport) {
        const box = new THREE.Box3().setFromObject(refModel.group);
        const topY = box.max.y;
        // Anchor the drawing plane at the model's top Y
        this.app.sceneManager.anchorPlaneAt(new THREE.Vector3(0, topY, 0));
      }
    }

    this.app.drawingManager.setMode(tool);

    // Activate tube cutter when entering cut mode
    if (tool === 'cut') {
      this.tubeCutter.activate();
    }

    const statusEl = document.getElementById('status-text');
    const messages = {
      'select': 'Select mode — Click tube to select & move, click point to edit',
      'click-place': 'Click Place — Click to add points, double-click/Enter to finish',
      'freehand': 'Freehand — Click and drag to draw, release to finish',
      'rectangle': 'Rectangle — Click first corner, then second corner | Esc cancel',
      'circle': 'Circle — Click center, then edge point | Esc cancel',
      'cut': 'Cut Tool — Hover over a tube and click to split | Esc to exit',
    };
    if (statusEl) statusEl.textContent = messages[tool] || 'Ready';
  }

  _onSnapToggle(enabled) {
    this.app.drawingManager.setSnap(enabled);
  }

  _onPlaneChange(plane) {
    const dm = this.app.drawingManager;
    let anchor = null;
    if (dm.currentMode === 'click-place' && dm.clickPlaceMode.points.length > 0) {
      anchor = dm.clickPlaceMode.points[dm.clickPlaceMode.points.length - 1];
    }
    this.app.sceneManager.setDrawingPlane(plane, anchor);
    const names = { XZ: 'Ground (XZ)', XY: 'Front (XY)', YZ: 'Side (YZ)' };
    const statusEl = document.getElementById('status-text');
    if (statusEl) statusEl.textContent = `Plane: ${names[plane] || plane}`;
  }

  async _onExport() {
    const statusEl = document.getElementById('status-text');
    if (this.app.tubeManager.tubes.length === 0) {
      if (statusEl) statusEl.textContent = 'Nothing to export — create some tubes first.';
      return;
    }
    try {
      if (statusEl) statusEl.textContent = 'Exporting MVR...';
      await MVRExporter.export(this.app.tubeManager, this.connectorManager);
      if (statusEl) statusEl.textContent = 'MVR exported successfully! (Model + GDTF Pixels)';
    } catch (err) {
      console.error('Export error:', err);
      if (statusEl) statusEl.textContent = `Export failed: ${err.message}`;
    }
  }

  _onGridSizeChange(sizeM) {
    this.app.sceneManager.setGridSize(sizeM);
    const statusEl = document.getElementById('status-text');
    if (statusEl) statusEl.textContent = `Grid: ${sizeM}x${sizeM}m`;
  }

  showLengthOverlay(lengthMeters) {
    if (!this.lengthOverlay) return;
    const mm = (lengthMeters * 1000).toFixed(0);
    this.lengthOverlay.textContent = `${mm} mm`;
    this.lengthOverlay.classList.add('visible');
  }

  hideLengthOverlay() {
    if (!this.lengthOverlay) return;
    this.lengthOverlay.classList.remove('visible');
    this.lengthOverlay.textContent = '';
  }

  _onDeleteSelected() {
    const tube = this.app.tubeManager.selectedTube;
    if (tube) {
      this.connectorManager.deleteConnectorsForTube(tube.id);
      this.app.tubeManager.deleteTube(tube);
    }
  }

  _onDuplicateSelected() {
    const tube = this.app.tubeManager.selectedTube;
    if (tube) {
      this.app.tubeManager.duplicateTube(tube);
      const statusEl = document.getElementById('status-text');
      if (statusEl) statusEl.textContent = `Duplicated "${tube.name}"`;
    }
  }

  /**
   * Called when the toolbar preset dropdown changes.
   * Sets the active preset for future drawings.
   */
  _onPresetChange(presetId) {
    const preset = getPresetById(presetId);
    this.app.drawingManager.activePreset = preset;
    this.app.drawingManager.activePresetId = presetId;

    // Update max length on drawing modes
    const maxLengthM = preset && preset.maxLengthM ? preset.maxLengthM : 0;
    this.app.drawingManager.clickPlaceMode.maxLengthM = maxLengthM;
    this.app.drawingManager.freehandMode.maxLengthM = maxLengthM;

    // Also update the selected tube's preset if one is selected
    const tube = this.app.tubeManager.selectedTube;
    if (tube) {
      tube.fixturePreset = presetId;
      if (preset) {
        if (preset.profile != null) tube.profile = preset.profile;
        if (preset.diameterMm != null) tube.diameterMm = preset.diameterMm;
        if (preset.pixelsPerMeter != null) tube.pixelsPerMeter = preset.pixelsPerMeter;
        if (preset.dmxChannelsPerPixel != null) tube.dmxChannelsPerPixel = preset.dmxChannelsPerPixel;
        if (preset.materialPreset != null) tube.materialPreset = preset.materialPreset;
      }
      this.app.tubeManager.updateTube(tube);
      this.propertiesPanel.show(tube);
    }

    const statusEl = document.getElementById('status-text');
    if (statusEl) {
      const label = preset ? preset.label : 'Custom';
      const extra = preset && preset.maxLengthM ? ` — Max ${Math.round(preset.maxLengthM * 1000)}mm (auto-segments)` : '';
      statusEl.textContent = `Fixture preset: ${label}${extra}`;
    }
  }

  _onPropertyChange(tube, prop) {
    // When fixture preset changes from properties panel, sync toolbar
    if (prop === 'fixturePreset') {
      const presetId = tube.fixturePreset || 'custom';
      this.toolbar.setPreset(presetId);
      this._onPresetChange(presetId);
      return; // _onPresetChange already updates the tube
    }
    this.app.tubeManager.updateTube(tube);
    this._refreshTubeList();
  }

  _onSelectTube(id) {
    const tube = this.app.tubeManager.getTubeById(id);
    if (tube) {
      this.app.tubeManager.selectTubeSingle(tube);
    }
  }

  _onMultiSelectTube(id) {
    const tube = this.app.tubeManager.getTubeById(id);
    if (tube) {
      this.app.tubeManager.toggleMultiSelect(tube);
      this._refreshTubeList();
    }
  }

  _onGroupTubes() {
    const tm = this.app.tubeManager;
    const statusEl = document.getElementById('status-text');
    if (tm.selectedTubeIds.size < 2) {
      if (statusEl) statusEl.textContent = 'Select at least 2 tubes (Shift+Click in list) then Ctrl+G to group';
      return;
    }
    const gid = tm.groupSelected();
    if (gid) {
      if (statusEl) statusEl.textContent = `Grouped ${tm.selectedTubeIds.size} tubes (Group ${gid})`;
      this._refreshAll();
    }
  }

  _onUngroupTubes() {
    const tm = this.app.tubeManager;
    const statusEl = document.getElementById('status-text');
    const count = tm.ungroupSelected();
    if (count > 0) {
      if (statusEl) statusEl.textContent = `Ungrouped ${count} tubes`;
      this._refreshAll();
    } else {
      if (statusEl) statusEl.textContent = 'No grouped tubes in selection';
    }
  }

  _onDeleteTube(id) {
    const tube = this.app.tubeManager.getTubeById(id);
    if (tube) {
      this.connectorManager.deleteConnectorsForTube(tube.id);
      this.app.tubeManager.deleteTube(tube);
    }
  }

  _onToggleVisible(id) {
    const tube = this.app.tubeManager.getTubeById(id);
    if (tube) {
      this.app.tubeManager.toggleVisibility(tube);
      this._refreshTubeList();
    }
  }

  _refreshTubeList() {
    const tm = this.app.tubeManager;
    const rm = this.refModelManager;
    this.tubeListPanel.refresh(
      tm.tubes, tm.selectedTube?.id ?? null,
      rm.models, rm.selectedModel?.id ?? null,
      tm.selectedTubeIds
    );
  }

  _refreshAll() {
    this._refreshTubeList();
    // Sync ref model availability for Snap to Ref button
    this.propertiesPanel.hasRefModels = this.refModelManager.models.some(
      rm => rm.group && !rm.needsReimport
    );
    // Show selected ref model props if no tube is selected
    const tube = this.app.tubeManager.selectedTube;
    const refModel = this.refModelManager.selectedModel;
    if (tube) {
      this.propertiesPanel.show(tube);
    } else if (refModel) {
      this.propertiesPanel.show(refModel);
    } else {
      this.propertiesPanel.show(null);
    }
  }

  setTool(tool) {
    this.toolbar.setTool(tool);
    this._onToolChange(tool);
  }

  setPlane(plane) {
    this.toolbar.setPlane(plane);
    this._onPlaneChange(plane);
  }

  // ── Save / Load ─────────────────────────────────────

  _onSave() {
    const statusEl = document.getElementById('status-text');
    const tm = this.app.tubeManager;
    if (tm.tubes.length === 0 && this.refModelManager.models.length === 0) {
      if (statusEl) statusEl.textContent = 'Nothing to save — create some tubes first.';
      return;
    }
    const sceneState = {
      gridSizeM: this.app.sceneManager.gridSizeM,
      currentPlane: this.app.sceneManager.currentPlane,
    };
    const data = tm.saveProject(sceneState);
    // Include ref model metadata
    data.refModels = this.refModelManager.toJSON();
    // Include connectors
    data.connectors = this.connectorManager.toJSON();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const name = (tm.selectedTube ? tm.selectedTube.name : 'project').replace(/[^a-zA-Z0-9_-]/g, '_');
    a.href = url;
    a.download = `${name}.neon`;
    a.click();
    URL.revokeObjectURL(url);
    if (statusEl) statusEl.textContent = `Project saved as ${name}.neon`;
  }

  _onLoad() {
    this._fileInput.value = '';
    this._fileInput.click();
  }

  _onFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    const statusEl = document.getElementById('status-text');
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        // Switch to select mode before loading
        this.setTool('select');
        const sceneState = this.app.tubeManager.loadProject(data);
        // Load ref model ghost entries
        this.refModelManager.clearAll();
        if (data.refModels) {
          this.refModelManager.loadFromJSON(data.refModels);
        }
        // Load connectors
        this.connectorManager.clearAll();
        if (data.connectors) {
          this.connectorManager.loadFromJSON(data.connectors);
        }
        // Restore scene state
        if (sceneState.gridSizeM) {
          this.app.sceneManager.setGridSize(sceneState.gridSizeM);
        }
        if (sceneState.currentPlane) {
          this.setPlane(sceneState.currentPlane);
        }
        this._refreshAll();
        const refCount = this.refModelManager.models.length;
        const refText = refCount > 0 ? `, ${refCount} ref model(s) — reimport needed` : '';
        if (statusEl) statusEl.textContent = `Loaded ${file.name} — ${this.app.tubeManager.tubes.length} tube(s)${refText}`;
      } catch (err) {
        console.error('Load error:', err);
        if (statusEl) statusEl.textContent = `Load failed: ${err.message}`;
      }
    };
    reader.readAsText(file);
  }

  // ── Reference Model Import ────────────────────────────

  _onImportRef() {
    this._refFileInput.value = '';
    this._refFileInput.click();
  }

  async _onRefFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    const statusEl = document.getElementById('status-text');
    try {
      if (statusEl) statusEl.textContent = `Loading reference model: ${file.name}...`;
      const refModel = await this.refModelManager.loadFile(file);
      this._autoResizeGrid(refModel);
      if (statusEl) statusEl.textContent = `Imported reference: ${file.name}`;
    } catch (err) {
      console.error('Ref model import error:', err);
      if (statusEl) statusEl.textContent = `Import failed: ${err.message}`;
    }
  }

  /**
   * Auto-resize the grid so it's at least 1m bigger than the imported model.
   */
  _autoResizeGrid(refModel) {
    if (!refModel.group) return;
    const box = new THREE.Box3().setFromObject(refModel.group);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const needed = Math.ceil(maxDim) + 1;
    if (needed > this.app.sceneManager.gridSizeM) {
      // Pick the smallest standard size that fits, or use needed directly
      const standard = [2, 5, 10, 20, 50];
      const gridSize = standard.find(s => s >= needed) || needed;
      this.app.sceneManager.setGridSize(gridSize);
      this.toolbar.setGridSize(gridSize);
      const statusEl = document.getElementById('status-text');
      if (statusEl) statusEl.textContent = `Grid auto-resized to ${gridSize}×${gridSize}m`;
    }
  }

  _onSelectRefModel(id) {
    const refModel = this.refModelManager.getModelById(id);
    if (refModel) {
      this.refModelManager.selectModel(refModel);
    }
  }

  _onDeleteRefModel(id) {
    this.refModelManager.removeModel(id);
  }

  _onToggleRefVisible(id) {
    const refModel = this.refModelManager.getModelById(id);
    if (refModel) {
      this.refModelManager.toggleVisibility(refModel);
      this._refreshTubeList();
    }
  }

  _onReimportRefModel(id) {
    const refModel = this.refModelManager.getModelById(id);
    if (!refModel) return;

    this._reimportTarget = refModel;
    this._reimportFileInput.value = '';
    this._reimportFileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file || !this._reimportTarget) return;
      const statusEl = document.getElementById('status-text');
      try {
        if (statusEl) statusEl.textContent = `Reimporting: ${file.name}...`;
        await this.refModelManager.reimportModel(this._reimportTarget, file);
        this._autoResizeGrid(this._reimportTarget);
        if (statusEl) statusEl.textContent = `Reimported: ${this._reimportTarget.name}`;
        this._reimportTarget = null;
      } catch (err) {
        console.error('Reimport error:', err);
        if (statusEl) statusEl.textContent = `Reimport failed: ${err.message}`;
        this._reimportTarget = null;
      }
    };
    this._reimportFileInput.click();
  }

  // ── Pick Start Pixel ─────────────────────────────────────

  _onPickStartPixel(tube) {
    if (!tube || !tube.isValid) return;
    // Deactivate current drawing mode to prevent interference
    this.app.drawingManager._deactivateAll();
    const controls = this.app.sceneManager.controls;
    if (controls) controls.mouseButtons.LEFT = null;
    this.startPixelPicker.activate(tube);
    const statusEl = document.getElementById('status-text');
    if (statusEl) statusEl.textContent = 'Pick Start Pixel — Hover over pixels, click to set | Esc to cancel';
  }

  // ── Snap to Ref ────────────────────────────────────────

  _onSnapToRef(tube) {
    const statusEl = document.getElementById('status-text');
    // Prefer the selected ref model; fall back to nearest
    const refModel = this._getSnapTargetModel(tube);
    if (!refModel) {
      if (statusEl) statusEl.textContent = 'No reference model loaded to snap to.';
      return;
    }

    const total = tube.controlPoints.length;
    const snapped = this.refModelManager.snapTubeToModel(tube, refModel);
    this.app.tubeManager.updateTube(tube);
    this.propertiesPanel.show(tube);

    if (statusEl) statusEl.textContent = `Snapped ${snapped}/${total} points to "${refModel.name}"`;
  }

  /**
   * Get the snap target model: prefer selected ref model, fall back to nearest.
   */
  _getSnapTargetModel(tube) {
    // If a ref model is selected and has geometry, use it
    const selected = this.refModelManager.selectedModel;
    if (selected && selected.group && !selected.needsReimport) {
      return selected;
    }

    // Fall back to nearest by centroid distance
    const tubeCentroid = new THREE.Vector3();
    for (const pt of tube.controlPoints) tubeCentroid.add(pt);
    tubeCentroid.divideScalar(tube.controlPoints.length);

    let best = null, bestDist = Infinity;
    for (const rm of this.refModelManager.models) {
      if (!rm.group || rm.needsReimport) continue;
      const box = new THREE.Box3().setFromObject(rm.group);
      const center = new THREE.Vector3();
      box.getCenter(center);
      const dist = tubeCentroid.distanceTo(center);
      if (dist < bestDist) { bestDist = dist; best = rm; }
    }
    return best;
  }

  // ── Help Overlay ──────────────────────────────────────

  _createHelpOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'help-overlay';
    overlay.innerHTML = `
      <div class="help-panel">
        <div class="help-header">
          <span>MAGICTOOLBOX NEONFLEXER — Keyboard Shortcuts</span>
          <button class="help-close">&times;</button>
        </div>
        <div class="help-body">
          <div class="help-section">
            <div class="help-section-title">Tools</div>
            <div class="help-row"><kbd>1</kbd><span>Select / Move mode</span></div>
            <div class="help-row"><kbd>2</kbd><span>Click Place mode</span></div>
            <div class="help-row"><kbd>3</kbd><span>Freehand Draw mode</span></div>
            <div class="help-row"><kbd>4</kbd><span>Rectangle shape tool</span></div>
            <div class="help-row"><kbd>5</kbd><span>Circle shape tool</span></div>
            <div class="help-row"><kbd>C</kbd><span>Cut / Split tube tool</span></div>
          </div>
          <div class="help-section">
            <div class="help-section-title">Drawing</div>
            <div class="help-row"><kbd>Click</kbd><span>Place control point</span></div>
            <div class="help-row"><kbd>Enter</kbd> / <kbd>Dbl-Click</kbd><span>Finish tube</span></div>
            <div class="help-row"><kbd>Backspace</kbd><span>Undo last point</span></div>
            <div class="help-row"><kbd>Shift + Drag</kbd><span>Adjust height off-plane</span></div>
            <div class="help-row"><kbd>Esc</kbd><span>Cancel drawing</span></div>
          </div>
          <div class="help-section">
            <div class="help-section-title">Drawing Plane</div>
            <div class="help-row"><kbd>F1</kbd><span>Ground plane (XZ)</span></div>
            <div class="help-row"><kbd>F2</kbd><span>Front plane (XY)</span></div>
            <div class="help-row"><kbd>F3</kbd><span>Side plane (YZ)</span></div>
          </div>
          <div class="help-section">
            <div class="help-section-title">Editing</div>
            <div class="help-row"><kbd>Click tube</kbd><span>Select & move whole tube</span></div>
            <div class="help-row"><kbd>Click point</kbd><span>Move single control point</span></div>
            <div class="help-row"><kbd>H</kbd><span>Toggle Y-axis on transform gizmo</span></div>
            <div class="help-row"><kbd>Del</kbd> / <kbd>Backspace</kbd><span>Delete selected point or tube</span></div>
            <div class="help-row"><kbd>Ctrl + D</kbd><span>Duplicate selected tube</span></div>
            <div class="help-row"><kbd>Ctrl + Click</kbd><span>Multi-select tubes (list panel)</span></div>
            <div class="help-row"><kbd>Ctrl + G</kbd><span>Group selected tubes</span></div>
            <div class="help-row"><kbd>Ctrl + B</kbd><span>Ungroup selected tubes</span></div>
          </div>
          <div class="help-section">
            <div class="help-section-title">View & Navigation</div>
            <div class="help-row"><kbd>Left Mouse</kbd><span>Orbit (select mode)</span></div>
            <div class="help-row"><kbd>Middle Mouse</kbd><span>Orbit (always)</span></div>
            <div class="help-row"><kbd>Right Mouse</kbd><span>Pan</span></div>
            <div class="help-row"><kbd>Scroll</kbd><span>Zoom</span></div>
            <div class="help-row"><kbd>G</kbd><span>Toggle grid snap</span></div>
          </div>
          <div class="help-section">
            <div class="help-section-title">File</div>
            <div class="help-row"><kbd>Ctrl + S</kbd><span>Save project (.neon)</span></div>
            <div class="help-row"><kbd>Ctrl + O</kbd><span>Load project (.neon)</span></div>
            <div class="help-row"><kbd>Ctrl + I</kbd><span>Import reference model</span></div>
            <div class="help-row"><kbd>Ctrl + E</kbd><span>Export as MVR</span></div>
            <div class="help-row"><kbd>?</kbd><span>Toggle this help</span></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    this._helpOverlay = overlay;

    // Close button
    overlay.querySelector('.help-close').addEventListener('click', () => this.toggleHelp());
    // Click backdrop to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.toggleHelp();
    });
  }

  toggleHelp() {
    this.helpVisible = !this.helpVisible;
    this._helpOverlay.classList.toggle('visible', this.helpVisible);
  }
}
