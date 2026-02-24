import { Toolbar } from './Toolbar.js';
import { PropertiesPanel } from './PropertiesPanel.js';
import { TubeListPanel } from './TubeListPanel.js';
import { MVRExporter } from '../export/MVRExporter.js';
import { ReferenceModelManager } from '../ref/ReferenceModelManager.js';
import { ConnectorManager } from '../tube/ConnectorManager.js';
import { getPresetById } from '../tube/FixturePresets.js';
import { StartPixelPicker } from '../drawing/StartPixelPicker.js';
import { TubeCutter } from '../drawing/TubeCutter.js';
import { MarqueeSelect } from '../drawing/MarqueeSelect.js';
import { CommandPanel } from './CommandPanel.js';
import { LoadingOverlay } from './LoadingOverlay.js';
import { CustomFixtureDialog } from './CustomFixtureDialog.js';
import { UndoManager } from './UndoManager.js';
import { mapEdges } from '../edge/EdgeMapper.js';
import { EdgePicker } from '../edge/EdgePicker.js';
import { textToChains, loadBundledFont, parseCustomFont } from '../text/TextMapper.js';
import { TextToTubeDialog } from './TextToTubeDialog.js';
import { ShapeWizardDialog } from './ShapeWizardDialog.js';
import { ShapeGeometryGenerator } from '../shapes/ShapeGeometryGenerator.js';
import { autoSegment } from '../tube/AutoSegmenter.js';
import { CurveBuilder } from '../drawing/CurveBuilder.js';
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
    this.toolbar.onViewChange = (viewName) => this._onViewChange(viewName);
    this.toolbar.onFocus = () => this.focusSelected();
    this.toolbar.onCommandPanel = () => this.toggleCommandPanel();
    this.toolbar.onIsolate = () => this.toggleIsolation();
    this.toolbar.onTextToTubes = () => this._onTextToTubes();
    this.toolbar.onShapeWizard = () => this._onShapeWizard();

    // Isolation mode state
    this.isolationMode = false;
    this._isolatedModelIds = new Set();
    this._savedOpacities = new Map();
    this._savedVisibility = new Map();
    this._savedTransforms = null;       // Map<id, {position, quaternion, matrixWorld, matrixIso}>
    this._preIsolationTubeIds = null;   // Set<tubeId> for transform on exit
    this._isolationCenterShift = null;  // Vector3

    // Length overlay element
    this.lengthOverlay = document.getElementById('length-overlay');

    // Properties panel
    this.propertiesPanel = new PropertiesPanel(document.getElementById('properties-panel'));
    this.propertiesPanel.onPropertyChange = (tube, prop) => this._onPropertyChange(tube, prop);
    this.propertiesPanel.onBatchPropertyChange = (tubes, prop) => {
      this.undoManager.capture();
      for (const tube of tubes) {
        this.app.tubeManager.updateTube(tube);
      }
      this._refreshTubeList();
      this.app.sceneManager.requestRender();
    };

    // Tube list
    this.tubeListPanel = new TubeListPanel(document.getElementById('tube-list'));
    this.tubeListPanel.onSelectTube = (id) => this._onSelectTube(id);
    this.tubeListPanel.onMultiSelectTube = (id) => this._onMultiSelectTube(id);
    this.tubeListPanel.onDeleteTube = (id) => this._onDeleteTube(id);
    this.tubeListPanel.onToggleVisible = (id) => this._onToggleVisible(id);

    // Undo capture before any tube creation from drawing
    this.app.drawingManager.onBeforeMutate = () => {
      this.undoManager.capture();
    };

    // Mid-draw segment created (auto-complete at maxLength) — refresh list but stay in drawing mode
    this.app.drawingManager.onSegmentCreated = (tube, segNum) => {
      this._refreshAll();
    };

    // Switch back to select mode after completing a drawing
    this.app.drawingManager.onDrawingComplete = () => {
      // Auto-snap to selected/isolated ref model(s) after shape drawing
      const tube = this.app.tubeManager.selectedTube;
      let snapTargets = [];

      if (this.isolationMode && this._isolatedModelIds.size > 0) {
        snapTargets = this.refModelManager.models.filter(
          m => this._isolatedModelIds.has(m.id) && m.group && !m.needsReimport
        );
      } else if (this.refModelManager.selectedModelIds.size > 1) {
        snapTargets = this.refModelManager.getSelectedModels().filter(
          m => m.group && !m.needsReimport
        );
      } else {
        const refModel = this.refModelManager.selectedModel;
        if (refModel && refModel.group && !refModel.needsReimport) {
          snapTargets = [refModel];
        }
      }

      if (tube && snapTargets.length > 0) {
        const snapped = this.refModelManager.snapTubeToModels(tube, snapTargets);
        this.app.tubeManager.updateTube(tube);
        if (snapped > 0) {
          const statusEl = document.getElementById('status-text');
          const label = snapTargets.length > 1
            ? `${snapTargets.length} models`
            : `"${snapTargets[0].name}"`;
          if (statusEl) statusEl.textContent = `Auto-snapped ${snapped} points to ${label}`;
        }
      }
      this.setTool('select');
    };

    // Connect tube manager callbacks
    const tm = this.app.tubeManager;
    const sm = app.sceneManager;
    tm.onTubeCreated = () => { this._refreshAll(); sm.requestRender(); };
    tm.onTubeUpdated = () => { this._refreshAll(); sm.requestRender(); };
    tm.onTubeDeleted = () => { this._refreshAll(); sm.requestRender(); };
    tm.onSelectionChanged = (tube) => {
      if (tube) {
        // Deselect ref models when a tube is selected
        this.refModelManager.deselectAll();
      }
      // Multi-select → batch properties panel
      if (tm.selectedTubeIds.size > 1) {
        const selectedTubes = tm.tubes.filter(t => tm.selectedTubeIds.has(t.id));
        this.propertiesPanel.showMulti(selectedTubes);
      } else {
        this.propertiesPanel.show(tube);
      }
      this._refreshTubeList();
    };

    // Reference Model Manager
    this.refModelManager = new ReferenceModelManager(app.sceneManager.scene);

    this.refModelManager.onModelAdded = () => {
      this._refreshAll();
      app.sceneManager.requestRender();
    };
    this.refModelManager.onModelRemoved = () => { this._refreshAll(); app.sceneManager.requestRender(); };
    this.refModelManager.onModelUpdated = () => { this._refreshAll(); app.sceneManager.requestRender(); };
    this.refModelManager.onSelectionChanged = (refModel) => {
      if (refModel) {
        // Deselect tube when a ref model is selected
        this.app.tubeManager.selectTube(null);
        this.propertiesPanel.show(refModel);
      } else {
        // Ref model deselected — show selected tube if any, otherwise clear
        const selectedTube = this.app.tubeManager.selectedTube;
        if (selectedTube) {
          this.propertiesPanel.show(selectedTube);
        } else {
          this.propertiesPanel.show(null);
        }
      }
      this._refreshTubeList();
      app.sceneManager.requestRender();
    };
    this.refModelManager.onMultiSelectionChanged = () => {
      this._refreshTubeList();
      app.sceneManager.requestRender();
    };
    // Wire granular progress from loader → loading overlay
    this.refModelManager.onProgress = (pct, msg) => {
      this.loadingOverlay.setProgress(pct);
      if (msg) this.loadingOverlay.setStatus(msg);
    };

    // Connector Manager
    this.connectorManager = new ConnectorManager(app.sceneManager.scene);

    // Undo Manager
    this.undoManager = new UndoManager(app.tubeManager, this.connectorManager);

    // Wire group movement → connector movement
    tm.onGroupMoved = (tubeIds, delta) => {
      this.connectorManager.moveConnectorsForTubes(tubeIds, delta);
    };

    // Wire connector manager to drawing manager
    this.app.drawingManager.connectorManager = this.connectorManager;

    // Wire PointEditor for ref model click-to-select + undo
    const pointEditor = this.app.drawingManager.pointEditor;
    if (pointEditor) {
      pointEditor.onBeforeMutate = () => this.undoManager.capture();
      pointEditor.refModelManager = this.refModelManager;
      pointEditor.onRefModelSelected = (refModel) => {
        this.refModelManager.selectModelSingle(refModel);
      };
      pointEditor.onRefModelShiftSelected = (refModel) => {
        this.refModelManager.toggleMultiSelect(refModel);
      };
      pointEditor.onDeselect = () => {
        this.refModelManager.deselectAll();
      };
      pointEditor.onPointInserted = (tube) => {
        this._refreshAll();
        const statusEl = document.getElementById('status-text');
        if (statusEl) statusEl.textContent = `Point inserted on "${tube.name}" — ${tube.controlPoints.length} points`;
      };
      pointEditor.onTubeExtended = (tube) => {
        this._refreshAll();
        const statusEl = document.getElementById('status-text');
        if (statusEl) statusEl.textContent = `Extended "${tube.name}" — ${tube.controlPoints.length} points`;
      };
      pointEditor.onGroupMoveLive = (tubeIds, delta) => {
        this.connectorManager.setVisualOffsetForTubes(tubeIds, delta);
      };
    }

    // Marquee selection
    this.marqueeSelect = new MarqueeSelect(app.sceneManager);
    this.marqueeSelect.refModelManager = this.refModelManager;
    this.marqueeSelect.onSelectionComplete = (models) => {
      if (models.length > 0) {
        // Multi-select all models in the marquee
        this.refModelManager.selectMultiple(models);
        const statusEl = document.getElementById('status-text');
        if (statusEl) statusEl.textContent = `Marquee selected ${models.length} model(s): ${models.map(m => m.name).join(', ')}`;
      }
    };

    // Tube list callbacks for ref models
    this.tubeListPanel.onSelectRefModel = (id) => this._onSelectRefModel(id);
    this.tubeListPanel.onMultiSelectRefModel = (id) => this._onMultiSelectRefModel(id);
    this.tubeListPanel.onDeleteRefModel = (id) => this._onDeleteRefModel(id);
    this.tubeListPanel.onToggleRefVisible = (id) => this._onToggleRefVisible(id);
    this.tubeListPanel.onReimportRefModel = (id) => this._onReimportRefModel(id);

    // Properties panel callback for ref model changes
    this.propertiesPanel.onRefModelChange = (refModel, prop) => {
      this.refModelManager.updateModel(refModel);
      this._refreshTubeList();
    };
    this.propertiesPanel.onRefModelRemove = (refModel) => {
      if (!confirm(`Remove "${refModel.name}"? This cannot be undone.`)) return;
      this.refModelManager.removeModel(refModel.id);
    };
    this.propertiesPanel.onSnapToRef = (tube) => this._onSnapToRef(tube);
    this.propertiesPanel.onPickStartPixel = (tube) => this._onPickStartPixel(tube);
    this.propertiesPanel.onTraceRef = (shapeType) => this._onTraceRef(shapeType);
    this.propertiesPanel.onMapEdges = (angle) => this._onMapEdges(angle);
    this.propertiesPanel.onResize = (tube, targetLengthMm) => this._onResizeTube(tube, targetLengthMm);
    this.propertiesPanel.onReverse = (tube) => this._onReverseTube(tube);
    this.propertiesPanel.onShapeDimensionChange = (tube, shapeType, dims) => this._onShapeDimensionChange(tube, shapeType, dims);

    // Start Pixel Picker
    this.startPixelPicker = new StartPixelPicker(app.sceneManager);
    this.startPixelPicker.onPick = (tube, pixelIndex, reverse) => {
      this.undoManager.capture();
      if (tube.closed) {
        // Closed tube: rotate + fine-tune so picked pixel becomes exactly pixel #1.
        this._rotateClosedTubeStart(tube, pixelIndex, reverse);
      } else {
        tube.startPixel = pixelIndex;
      }
      this.app.tubeManager.updateTube(tube);
      this.propertiesPanel.show(tube);
      this.setTool('select'); // restore select mode
      const statusEl = document.getElementById('status-text');
      if (statusEl) {
        if (tube.closed) {
          const dir = reverse ? 'counter-clockwise' : 'clockwise';
          statusEl.textContent = `Start pixel set ${dir} on "${tube.name}"`;
        } else {
          statusEl.textContent = `Start pixel set to #${pixelIndex + 1} on "${tube.name}"`;
        }
      }
    };
    this.startPixelPicker.onCancel = () => {
      this.setTool('select'); // restore select mode
      const statusEl = document.getElementById('status-text');
      if (statusEl) statusEl.textContent = 'Start pixel pick cancelled';
    };

    // Tube Cutter
    this.tubeCutter = new TubeCutter(app.sceneManager, app.tubeManager);
    this.tubeCutter.onCut = (tube, t, isClosed) => {
      this.undoManager.capture();
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

    // Edge Picker
    this.edgePicker = new EdgePicker(app.sceneManager);

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

    // Loading overlay
    this.loadingOverlay = new LoadingOverlay();

    // Custom fixture dialog
    this.customFixtureDialog = new CustomFixtureDialog();
    this.customFixtureDialog.onConfirm = (preset) => this._onCustomFixtureConfirm(preset);
    this.customFixtureDialog.onCancel = () => this._onCustomFixtureCancel();
    this._previousPresetId = 'custom'; // track for cancel-revert

    // Text to Tubes dialog
    this.textToTubeDialog = new TextToTubeDialog();
    this.textToTubeDialog.onConfirm = (values) => this._onTextToTubesConfirm(values);

    // Shape Wizard dialog
    this.shapeWizardDialog = new ShapeWizardDialog();
    this.shapeWizardDialog.onConfirm = (config) => this._onShapeWizardConfirm(config);

    // Floating command panel (StreamDeck-style)
    this.commandPanel = new CommandPanel();
    this._registerCommands();

    // Create help overlay (hidden by default)
    this._createHelpOverlay();
  }

  _onToolChange(tool) {
    // Deactivate tube cutter when switching away from cut mode
    if (this.tubeCutter.active && tool !== 'cut') {
      this.tubeCutter.deactivate();
    }

    // Auto-elevate drawing plane for shape tools when a ref model is selected
    if ((tool === 'rectangle' || tool === 'circle')) {
      const isolatedModels = this.isolationMode
        ? this.refModelManager.models.filter(m => this._isolatedModelIds.has(m.id) && m.group)
        : [];
      const singleRef = this.refModelManager.selectedModel;

      // Compute bounding box from isolated models or selected model
      const box = new THREE.Box3();
      if (isolatedModels.length > 0) {
        for (const m of isolatedModels) box.expandByObject(m.group);
      } else if (singleRef && singleRef.group && !singleRef.needsReimport) {
        box.setFromObject(singleRef.group);
      }

      if (!box.isEmpty()) {
        const topY = box.max.y;
        this.app.sceneManager.anchorPlaneAt(new THREE.Vector3(0, topY, 0));
      }

      // In isolation mode: auto-generate shape from bounding box, skip manual drawing
      if (isolatedModels.length > 0 && !box.isEmpty()) {
        const points = this._generateShapeFromBox(box, tool);
        if (points && points.length >= 3) {
          this.undoManager.capture();
          // Create the tube directly without entering shape drawing mode
          this.app.drawingManager.setMode('select');
          this.app.tubeManager.createTube(points, { closed: true });
          const sizeMm = new THREE.Vector3();
          box.getSize(sizeMm);
          const statusEl = document.getElementById('status-text');
          if (tool === 'rectangle') {
            if (statusEl) statusEl.textContent = `Auto-fit rectangle ${Math.round(sizeMm.x * 1000)}×${Math.round(sizeMm.z * 1000)}mm on isolated model(s)`;
          } else {
            const r = Math.max(sizeMm.x, sizeMm.z) / 2;
            if (statusEl) statusEl.textContent = `Auto-fit circle R=${Math.round(r * 1000)}mm on isolated model(s)`;
          }
          this.setTool('select');
          return;
        }
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
    // Ask for filename
    const defaultName = this._lastExportName || 'NeonFlexDesign';
    const filename = prompt('Export filename:', defaultName);
    if (!filename) return; // cancelled
    this._lastExportName = filename;
    try {
      if (statusEl) statusEl.textContent = 'Exporting MVR...';
      await MVRExporter.export(this.app.tubeManager, this.connectorManager, filename);
      if (statusEl) statusEl.textContent = `MVR exported: ${filename}.mvr`;
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
      this.undoManager.capture();
      this.connectorManager.deleteConnectorsForTube(tube.id);
      this.app.tubeManager.deleteTube(tube);
    }
  }

  _onDuplicateSelected() {
    const tube = this.app.tubeManager.selectedTube;
    if (tube) {
      this.undoManager.capture();
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
    // Custom preset → show dialog, don't apply yet
    if (presetId === 'custom') {
      this._previousPresetId = this.app.drawingManager.activePresetId || 'custom';
      this.customFixtureDialog.show();
      return;
    }

    const preset = getPresetById(presetId);
    this.app.drawingManager.activePreset = preset;
    this.app.drawingManager.activePresetId = presetId;
    this._previousPresetId = presetId;

    // Update max length on drawing modes
    const maxLengthM = preset && preset.maxLengthM ? preset.maxLengthM : 0;
    this.app.drawingManager.clickPlaceMode.maxLengthM = maxLengthM;
    this.app.drawingManager.freehandMode.maxLengthM = maxLengthM;

    // Also update the selected tube's preset (+ all group members)
    const tube = this.app.tubeManager.selectedTube;
    if (tube) {
      this.undoManager.capture();
      const targets = tube.groupId ? this.app.tubeManager.getGroupMembers(tube) : [tube];
      for (const t of targets) {
        t.fixturePreset = presetId;
        if (preset) {
          if (preset.profile != null) t.profile = preset.profile;
          if (preset.diameterMm != null) t.diameterMm = preset.diameterMm;
          if (preset.pixelsPerMeter != null) t.pixelsPerMeter = preset.pixelsPerMeter;
          if (preset.dmxChannelsPerPixel != null) t.dmxChannelsPerPixel = preset.dmxChannelsPerPixel;
          if (preset.materialPreset != null) t.materialPreset = preset.materialPreset;
        }
        this.app.tubeManager.updateTube(t);
      }
      this.propertiesPanel.show(tube);
    }

    const statusEl = document.getElementById('status-text');
    if (statusEl) {
      const label = preset ? preset.label : 'Custom';
      const extra = preset && preset.maxLengthM ? ` — Max ${Math.round(preset.maxLengthM * 1000)}mm (auto-segments)` : '';
      statusEl.textContent = `Fixture preset: ${label}${extra}`;
    }
  }

  _onCustomFixtureConfirm(presetObj) {
    this.app.drawingManager.activePreset = presetObj;
    this.app.drawingManager.activePresetId = 'custom';
    this._previousPresetId = 'custom';

    // Update max length on drawing modes
    const maxLengthM = presetObj.maxLengthM || 0;
    this.app.drawingManager.clickPlaceMode.maxLengthM = maxLengthM;
    this.app.drawingManager.freehandMode.maxLengthM = maxLengthM;

    // Apply to selected tube if one exists
    const tube = this.app.tubeManager.selectedTube;
    if (tube) {
      this.undoManager.capture();
      tube.fixturePreset = 'custom';
      if (presetObj.profile != null) tube.profile = presetObj.profile;
      if (presetObj.diameterMm != null) tube.diameterMm = presetObj.diameterMm;
      if (presetObj.widthMm != null) tube.widthMm = presetObj.widthMm;
      if (presetObj.heightMm != null) tube.heightMm = presetObj.heightMm;
      if (presetObj.pixelsPerMeter != null) tube.pixelsPerMeter = presetObj.pixelsPerMeter;
      if (presetObj.dmxChannelsPerPixel != null) tube.dmxChannelsPerPixel = presetObj.dmxChannelsPerPixel;
      if (presetObj.materialPreset != null) tube.materialPreset = presetObj.materialPreset;
      if (presetObj.diffuserShape != null) tube.diffuserShape = presetObj.diffuserShape;
      this.app.tubeManager.updateTube(tube);
      this.propertiesPanel.show(tube);
    }

    // Switch to click-place drawing mode immediately
    this.toolbar.setTool('click-place');
    this._onToolChange('click-place');
  }

  _onCustomFixtureCancel() {
    // Revert toolbar dropdown to previous preset
    this.toolbar.setPreset(this._previousPresetId);
  }

  _onPropertyChange(tube, prop) {
    this.undoManager.capture();
    // When fixture preset changes from properties panel, sync toolbar
    if (prop === 'fixturePreset') {
      const presetId = tube.fixturePreset || 'custom';
      this.toolbar.setPreset(presetId);
      this._onPresetChange(presetId);
      return; // _onPresetChange already updates the tube
    }

    // Apply group-wide property changes to all group members
    const groupProps = new Set([
      'diameterMm', 'widthMm', 'heightMm', 'wallThicknessMm', 'profile',
      'diffuserShape',
      'materialPreset', 'pixelsPerMeter', 'dmxChannelsPerPixel', 'pixelMode',
      'pixelColor', 'pixelEmissive', 'tension',
      'isPlaceholder', 'facingDirection', 'placeholderName',
    ]);
    if (tube.groupId && groupProps.has(prop)) {
      const members = this.app.tubeManager.getGroupMembers(tube);
      const newValue = tube[prop];
      for (const m of members) {
        if (m.id !== tube.id) {
          m[prop] = newValue;
          this.app.tubeManager.updateTube(m);
        }
      }
    }

    this.app.tubeManager.updateTube(tube);
    this._refreshTubeList();
  }

  _onSelectTube(id) {
    const tube = this.app.tubeManager.getTubeById(id);
    if (tube) {
      this.app.tubeManager.selectTube(tube);
    }
  }

  _onMultiSelectTube(id) {
    const tube = this.app.tubeManager.getTubeById(id);
    if (tube) {
      this.app.tubeManager.toggleMultiSelect(tube);
      // Update properties panel for multi-select
      const tm = this.app.tubeManager;
      if (tm.selectedTubeIds.size > 1) {
        const selectedTubes = tm.tubes.filter(t => tm.selectedTubeIds.has(t.id));
        this.propertiesPanel.showMulti(selectedTubes);
      } else if (tm.selectedTube) {
        this.propertiesPanel.show(tm.selectedTube);
      }
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
    this.undoManager.capture();
    const gid = tm.groupSelected();
    if (gid) {
      if (statusEl) statusEl.textContent = `Grouped ${tm.selectedTubeIds.size} tubes (Group ${gid})`;
      this._refreshAll();
    }
  }

  _onUngroupTubes() {
    const tm = this.app.tubeManager;
    const statusEl = document.getElementById('status-text');
    this.undoManager.capture();
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
      this.undoManager.capture();
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
      tm.selectedTubeIds,
      rm.selectedModelIds
    );
  }

  _refreshAll() {
    this.app.sceneManager.requestRender();
    this._refreshTubeList();
    // Sync ref model availability for Snap to Ref button
    this.propertiesPanel.hasRefModels = this.refModelManager.models.some(
      rm => rm.group && !rm.needsReimport
    );
    // Show selected ref model props if no tube is selected
    const tm = this.app.tubeManager;
    const tube = tm.selectedTube;
    const refModel = this.refModelManager.selectedModel;
    if (tm.selectedTubeIds.size > 1) {
      const selectedTubes = tm.tubes.filter(t => tm.selectedTubeIds.has(t.id));
      this.propertiesPanel.showMulti(selectedTubes);
    } else if (tube) {
      this.propertiesPanel.show(tube);
    } else if (refModel) {
      this.propertiesPanel.show(refModel);
    } else {
      this.propertiesPanel.show(null);
    }
  }

  undo() {
    if (this.undoManager.undo()) {
      this._afterUndoRedo();
      const statusEl = document.getElementById('status-text');
      if (statusEl) statusEl.textContent = `Undo (${this.undoManager.undoStack.length} steps left)`;
      return true;
    }
    return false;
  }

  redo() {
    if (this.undoManager.redo()) {
      this._afterUndoRedo();
      const statusEl = document.getElementById('status-text');
      if (statusEl) statusEl.textContent = `Redo (${this.undoManager.redoStack.length} steps left)`;
      return true;
    }
    return false;
  }

  _afterUndoRedo() {
    // Detach PointEditor's transform controls (old helpers are gone)
    const pe = this.app.drawingManager.pointEditor;
    if (pe) {
      pe._deselectAll();
    }
    this._refreshAll();
    this.app.sceneManager.requestRender();
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
        this.undoManager.clear();
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
    const countBefore = this.refModelManager.models.length;

    // Always show loading overlay (progress bar never stops moving)
    this.loadingOverlay.show(file.name);
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > 1) {
      this.loadingOverlay.setStatus(`${file.name} (${sizeMB.toFixed(0)} MB)`);
    }

    // Yield to let the overlay render before blocking the main thread
    await new Promise(r => requestAnimationFrame(r));

    try {
      const refModel = await this.refModelManager.loadFile(file);

      this.loadingOverlay.setProgress(90);
      this.loadingOverlay.setStatus('Finalizing...');
      await new Promise(r => requestAnimationFrame(r));

      this._autoResizeGrid(refModel);

      this.loadingOverlay.setProgress(100);
      this.loadingOverlay.hide();

      const countAfter = this.refModelManager.models.length;
      const added = countAfter - countBefore;
      const polyCount = this._countScenePolygons();
      const polyStr = polyCount > 1000 ? `${(polyCount / 1000).toFixed(0)}k` : polyCount;
      if (added > 1) {
        if (statusEl) statusEl.textContent = `Imported "${file.name}" — ${added} parts, ${polyStr} polys`;
      } else {
        if (statusEl) statusEl.textContent = `Imported: ${file.name} (${polyStr} polys)`;
      }
    } catch (err) {
      this.loadingOverlay.hide();
      console.error('Ref model import error:', err);
      if (statusEl) statusEl.textContent = `Import failed: ${err.message}`;
    }
  }

  /**
   * Count total triangles in all ref models.
   */
  _countScenePolygons() {
    let total = 0;
    for (const model of this.refModelManager.models) {
      if (!model.group) continue;
      model.group.traverse(child => {
        if (child.isMesh && child.geometry) {
          const geo = child.geometry;
          total += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
        }
      });
    }
    return Math.round(total);
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
    if (!refModel) return;
    // Toggle off if clicking the already-selected model
    if (this.refModelManager.selectedModel === refModel && this.refModelManager.selectedModelIds.size === 1) {
      this.refModelManager.deselectAll();
    } else {
      this.refModelManager.selectModelSingle(refModel);
    }
  }

  _onMultiSelectRefModel(id) {
    const refModel = this.refModelManager.getModelById(id);
    if (refModel) {
      this.refModelManager.toggleMultiSelect(refModel);
    }
  }

  _onDeleteRefModel(id) {
    const refModel = this.refModelManager.getModelById(id);
    const name = refModel ? `"${refModel.name}"` : 'this reference model';
    if (!confirm(`Remove ${name}? This cannot be undone.`)) return;
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
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > 5) {
        this.loadingOverlay.show(file.name);
      }
      await new Promise(r => setTimeout(r, 50));
      try {
        await this.refModelManager.reimportModel(this._reimportTarget, file);
        this._autoResizeGrid(this._reimportTarget);
        this.loadingOverlay.hide();
        if (statusEl) statusEl.textContent = `Reimported: ${this._reimportTarget.name}`;
        this._reimportTarget = null;
      } catch (err) {
        this.loadingOverlay.hide();
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

  /**
   * Rotate a closed tube's control points so the picked pixel becomes exactly
   * pixel #1. Three-step approach:
   *   1. Coarse rotation: shift CPs by the ideal amount
   *   2. Reverse CPs if direction is backward
   *   3. Fine-tune: iteratively nudge CP #0 until pixel #0 lands exactly
   *      at the picked world position (sub-millimeter precision)
   */
  _rotateClosedTubeStart(tube, pixelIndex, reverse = false) {
    const curve = CurveBuilder.build(tube.controlPoints, tube.tension, tube.closed);
    if (!curve) return;

    const { points, count } = CurveBuilder.getPixelPoints(curve, tube.pixelsPerMeter);
    if (count === 0 || pixelIndex >= count) return;

    const pickedPos = points[pixelIndex].clone();
    const N = tube.controlPoints.length;

    // ── Step 1: Coarse rotation ──
    // Pixel i is at t≈(i+0.5)/count, CP j is at t≈j/N
    const idealShift = Math.round(pixelIndex * N / count) % N;

    // Try ideal ±1 to find which puts pixel #0 closest to picked position
    let bestShift = 0;
    let bestDist = Infinity;

    for (let delta = -1; delta <= 1; delta++) {
      const shift = ((idealShift + delta) % N + N) % N;
      const rotated = [
        ...tube.controlPoints.slice(shift),
        ...tube.controlPoints.slice(0, shift),
      ];
      const testCurve = CurveBuilder.build(rotated, tube.tension, tube.closed);
      if (!testCurve) continue;
      const testPixels = CurveBuilder.getPixelPoints(testCurve, tube.pixelsPerMeter);
      if (testPixels.points.length === 0) continue;

      const d = pickedPos.distanceToSquared(testPixels.points[0]);
      if (d < bestDist) {
        bestDist = d;
        bestShift = shift;
      }
    }

    if (bestShift > 0) {
      tube.controlPoints = [
        ...tube.controlPoints.slice(bestShift),
        ...tube.controlPoints.slice(0, bestShift),
      ];
    }

    // ── Step 2: Reverse direction if needed ──
    if (reverse) {
      tube.controlPoints.reverse();
      const last = tube.controlPoints.pop();
      tube.controlPoints.unshift(last);
    }

    // ── Step 3: Fine-tune CP #0 so pixel #0 lands exactly at picked position ──
    // Iterative correction: nudge CP #0 by the error between pixel #0 and target.
    // CatmullRom passes through CPs, so moving CP #0 approximately moves nearby
    // curve points by the same amount. Converges in 2-3 iterations.
    for (let iter = 0; iter < 4; iter++) {
      const c = CurveBuilder.build(tube.controlPoints, tube.tension, tube.closed);
      if (!c) break;
      const px = CurveBuilder.getPixelPoints(c, tube.pixelsPerMeter);
      if (px.points.length === 0) break;
      const error = pickedPos.clone().sub(px.points[0]);
      if (error.lengthSq() < 1e-10) break; // < 0.01mm — exact enough
      tube.controlPoints[0] = tube.controlPoints[0].clone().add(error);
    }

    tube.startPixel = 0;
  }

  // ── Snap to Ref ────────────────────────────────────────

  _onSnapToRef(tube) {
    const statusEl = document.getElementById('status-text');

    // Collect target models: isolation set → multi-selected → single selected → nearest
    let targetModels = [];

    if (this.isolationMode && this._isolatedModelIds.size > 0) {
      targetModels = this.refModelManager.models.filter(
        m => this._isolatedModelIds.has(m.id) && m.group && !m.needsReimport
      );
    } else if (this.refModelManager.selectedModelIds.size > 1) {
      targetModels = this.refModelManager.getSelectedModels().filter(
        m => m.group && !m.needsReimport
      );
    } else {
      const refModel = this._getSnapTargetModel(tube);
      if (refModel) targetModels = [refModel];
    }

    if (targetModels.length === 0) {
      if (statusEl) statusEl.textContent = 'No reference model loaded to snap to.';
      return;
    }

    this.undoManager.capture();
    const total = tube.controlPoints.length;
    const snapped = this.refModelManager.snapTubeToModels(tube, targetModels);
    this.app.tubeManager.updateTube(tube);
    this.propertiesPanel.show(tube);

    if (targetModels.length > 1) {
      if (statusEl) statusEl.textContent = `Snapped ${snapped}/${total} points across ${targetModels.length} models`;
    } else {
      if (statusEl) statusEl.textContent = `Snapped ${snapped}/${total} points to "${targetModels[0].name}"`;
    }
  }

  /**
   * Trace Ref — one-click tube creation from model outline.
   * Generates a shape (circle or rectangle) from the selected ref models'
   * bounding box, snaps to model surfaces, and creates the tube.
   * @param {'circle'|'rectangle'} shapeType
   */
  _onTraceRef(shapeType) {
    const statusEl = document.getElementById('status-text');

    // Collect target models: multi-selected → single selected
    let targetModels = [];
    if (this.refModelManager.selectedModelIds.size > 1) {
      targetModels = this.refModelManager.getSelectedModels().filter(
        m => m.group && !m.needsReimport
      );
    } else if (this.refModelManager.selectedModel) {
      const rm = this.refModelManager.selectedModel;
      if (rm.group && !rm.needsReimport) targetModels = [rm];
    }

    if (targetModels.length === 0) {
      if (statusEl) statusEl.textContent = 'No reference model selected to trace.';
      return;
    }

    this.undoManager.capture();

    // Use PCA-based OBB for correct plane detection on rotated models
    const groups = targetModels.map(m => m.group).filter(Boolean);
    const obb = this.refModelManager.computeOBB(groups);

    let plane, points;
    let usedOBB = false;

    if (obb) {
      // Determine nearest axis-aligned plane for UI / drawing-plane setting
      const fn = obb.flatNormal;
      const ax = Math.abs(fn.x), ay = Math.abs(fn.y), az = Math.abs(fn.z);
      if (ay >= ax && ay >= az) {
        plane = 'XZ';
      } else if (az >= ax && az >= ay) {
        plane = 'XY';
      } else {
        plane = 'YZ';
      }

      this.setPlane(plane);

      // Generate shape in OBB's own coordinate frame (handles arbitrary rotations)
      points = this._generateShapeFromOBB(obb, shapeType);
      if (points && points.length >= 3) usedOBB = true;
    }

    // Fallback to AABB if OBB failed or produced too few points
    if (!usedOBB) {
      const box = new THREE.Box3();
      for (const m of targetModels) {
        if (m.group) box.expandByObject(m.group);
      }
      if (box.isEmpty()) return;
      const size = new THREE.Vector3();
      box.getSize(size);
      if (size.y <= size.x && size.y <= size.z) {
        plane = 'XZ';
      } else if (size.z <= size.x && size.z <= size.y) {
        plane = 'XY';
      } else {
        plane = 'YZ';
      }
      this.setPlane(plane);
      points = this._generateShapeFromBox(box, shapeType);
    }

    if (!points || points.length < 3) {
      if (statusEl) statusEl.textContent = 'Model too small to trace.';
      return;
    }

    // Anchor plane at OBB top surface along the actual flat normal
    const anchor = obb ? obb.center.clone() : new THREE.Vector3();
    if (obb) {
      // Offset from center to top face along the flat normal direction
      anchor.addScaledVector(obb.flatNormal, obb.maxs[2]);
    } else {
      // AABB fallback anchor
      const box = new THREE.Box3();
      for (const m of targetModels) {
        if (m.group) box.expandByObject(m.group);
      }
      box.getCenter(anchor);
      if (plane === 'XZ') anchor.y = box.max.y;
    }
    this.app.sceneManager.anchorPlaneAt(anchor);

    // Create the tube
    const tube = this.app.tubeManager.createTube(points, { closed: true });

    // Snap to model surfaces — use OBB-directed snap for rotated models
    let snapped;
    if (usedOBB) {
      snapped = this.refModelManager.snapTubeToModelsDirected(tube, targetModels, obb);
    } else {
      snapped = this.refModelManager.snapTubeToModels(tube, targetModels);
    }
    this.app.tubeManager.updateTube(tube);

    // Status
    const label = targetModels.length > 1
      ? `${targetModels.length} models`
      : `"${targetModels[0].name}"`;
    const shapeLabel = shapeType === 'circle' ? 'circle' : 'rectangle';
    if (statusEl) {
      statusEl.textContent = `Traced ${shapeLabel} on ${label} — ${snapped} points snapped`;
    }

    // Focus camera on the result with auto-view (shows model flat)
    const focusTarget = targetModels[0].group || tube.group;
    if (focusTarget) {
      this.app.sceneManager.focusOnObjectWithAutoView(focusTarget);
    }
  }

  /**
   * Map Edges: extract sharp edges from selected ref model(s), let user pick
   * which edges to keep via EdgePicker, then create tubes from the selection.
   */
  _onMapEdges(angleThreshold = 30) {
    const statusEl = document.getElementById('status-text');

    // Collect target models (same pattern as _onTraceRef)
    let targetModels = [];
    if (this.refModelManager.selectedModelIds.size > 1) {
      targetModels = this.refModelManager.getSelectedModels().filter(
        m => m.group && !m.needsReimport
      );
    } else if (this.refModelManager.selectedModel) {
      const rm = this.refModelManager.selectedModel;
      if (rm.group && !rm.needsReimport) targetModels = [rm];
    }

    if (targetModels.length === 0) {
      if (statusEl) statusEl.textContent = 'No reference model selected for edge mapping.';
      return;
    }

    // Count triangles to decide whether to show loading overlay
    let totalTriangles = 0;
    for (const m of targetModels) {
      m.group.traverse((child) => {
        if (child.isMesh && child.geometry) {
          const idx = child.geometry.index;
          totalTriangles += idx ? idx.count / 3 : (child.geometry.getAttribute('position')?.count || 0) / 3;
        }
      });
    }

    const showLoading = totalTriangles > 50000;
    if (showLoading) this.loadingOverlay.show('Detecting edges...');

    // Use setTimeout to allow UI to update before heavy computation
    setTimeout(() => {
      let allChains = [];

      for (const model of targetModels) {
        const result = mapEdges(model.group, { angleThreshold });
        allChains.push(...result.chains);
      }

      if (showLoading) this.loadingOverlay.hide();

      if (allChains.length === 0) {
        if (statusEl) statusEl.textContent = 'No edges detected. Try a lower angle threshold.';
        return;
      }

      // Activate edge picker for visual selection
      this.edgePicker.onConfirm = (selectedChains) => {
        if (selectedChains.length === 0) {
          if (statusEl) statusEl.textContent = 'No edges selected — cancelled.';
          return;
        }
        this.undoManager.capture();
        this._createTubesFromChains(selectedChains, targetModels);
      };
      this.edgePicker.onCancel = () => {
        if (statusEl) statusEl.textContent = 'Edge pick cancelled.';
      };
      this.edgePicker.activate(allChains);
    }, showLoading ? 50 : 0);
  }

  /**
   * Create tubes from a list of edge chains (shared by edge-pick confirm path).
   */
  _createTubesFromChains(chains, targetModels) {
    const statusEl = document.getElementById('status-text');

    // Build tube options from active preset
    const preset = this.app.drawingManager.activePreset;
    const presetId = this.app.drawingManager.activePresetId;
    const presetOptions = {};
    if (preset) {
      if (preset.profile != null) presetOptions.profile = preset.profile;
      if (preset.diameterMm != null) presetOptions.diameterMm = preset.diameterMm;
      if (preset.pixelsPerMeter != null) presetOptions.pixelsPerMeter = preset.pixelsPerMeter;
      if (preset.dmxChannelsPerPixel != null) presetOptions.dmxChannelsPerPixel = preset.dmxChannelsPerPixel;
      if (preset.materialPreset != null) presetOptions.materialPreset = preset.materialPreset;
      presetOptions.fixturePreset = presetId;
    }

    let createdCount = 0;

    for (const chain of chains) {
      const tubeOpts = { ...presetOptions, closed: chain.closed };

      // Handle auto-segmenting if preset has maxLengthM
      if (preset && preset.maxLengthM) {
        const connectorHeightM = preset.connectorHeightMm
          ? preset.connectorHeightMm * 0.001
          : 0.03;
        const tension = 0.5;

        let segmentPoints = chain.points;
        if (chain.closed) {
          const closedCurve = new THREE.CatmullRomCurve3(
            chain.points.map(p => p.clone()), true, 'catmullrom', tension
          );
          const perimeter = closedCurve.getLength();
          if (perimeter <= preset.maxLengthM) {
            this.app.tubeManager.createTube(chain.points, tubeOpts);
            createdCount++;
            continue;
          }
          segmentPoints = [...chain.points, chain.points[0].clone()];
        }

        const result = autoSegment(segmentPoints, preset.maxLengthM, connectorHeightM, tension);

        if (result.segments.length > 1) {
          const segOptions = { ...tubeOpts };
          if (chain.closed) delete segOptions.closed;

          for (let i = 0; i < result.segments.length; i++) {
            const segName = { name: `Edge (seg ${i + 1}/${result.segments.length})` };
            this.app.tubeManager.createTube(result.segments[i], { ...segOptions, ...segName });
            createdCount++;
          }

          if (this.connectorManager) {
            for (let i = 0; i < result.connectors.length; i++) {
              const conn = result.connectors[i];
              this.connectorManager.createConnector({
                position: conn.position,
                tangent: conn.tangent,
                diameterMm: preset.connectorDiameterMm || 30,
                heightMm: preset.connectorHeightMm || 30,
                fixturePreset: presetId,
              });
            }
          }
          continue;
        }
      }

      // Single tube (no segmenting needed)
      this.app.tubeManager.createTube(chain.points, tubeOpts);
      createdCount++;
    }

    const label = targetModels.length > 1
      ? `${targetModels.length} models`
      : `"${targetModels[0].name}"`;
    if (statusEl) {
      statusEl.textContent = `Mapped ${createdCount} edge tube(s) from ${label}`;
    }

    // Focus camera on results
    const focusTarget = targetModels[0].group;
    if (focusTarget) {
      this.app.sceneManager.focusOnObject(focusTarget);
    }
  }

  /**
   * Text to Tubes: show dialog to enter text for tube generation.
   */
  _onTextToTubes() {
    this.textToTubeDialog.show();
  }

  /**
   * Handle text-to-tubes dialog confirmation.
   */
  async _onTextToTubesConfirm(values) {
    const statusEl = document.getElementById('status-text');
    const { text, fontId, customFontFile, size, letterSpacing, divisions } = values;

    this.loadingOverlay.show('Loading font...');

    try {
      // Load font
      let font;
      if (fontId === 'custom' && customFontFile) {
        const arrayBuffer = await customFontFile.arrayBuffer();
        font = await parseCustomFont(arrayBuffer);
      } else {
        font = await loadBundledFont(fontId);
      }

      this.loadingOverlay.setStatus('Generating text outlines...');

      // Get current drawing plane
      const plane = this.toolbar.currentPlane || 'XZ';

      // Generate chains
      const chains = textToChains(font, text, {
        size,
        letterSpacing,
        divisions,
        plane,
      });

      if (chains.length === 0) {
        this.loadingOverlay.hide();
        if (statusEl) statusEl.textContent = 'No outlines generated. Try different text or font.';
        return;
      }

      this.undoManager.capture();
      this.loadingOverlay.setStatus(`Creating ${chains.length} tube(s)...`);

      // Build tube options from active preset
      const preset = this.app.drawingManager.activePreset;
      const presetId = this.app.drawingManager.activePresetId;
      const presetOptions = {};
      if (preset) {
        if (preset.profile != null) presetOptions.profile = preset.profile;
        if (preset.diameterMm != null) presetOptions.diameterMm = preset.diameterMm;
        if (preset.pixelsPerMeter != null) presetOptions.pixelsPerMeter = preset.pixelsPerMeter;
        if (preset.dmxChannelsPerPixel != null) presetOptions.dmxChannelsPerPixel = preset.dmxChannelsPerPixel;
        if (preset.materialPreset != null) presetOptions.materialPreset = preset.materialPreset;
        presetOptions.fixturePreset = presetId;
      }

      let createdCount = 0;

      // Center text at origin (or wherever makes sense on the plane)
      // Compute bounding box of all chains to find offset
      const bbox = new THREE.Box3();
      for (const chain of chains) {
        for (const pt of chain.points) bbox.expandByPoint(pt);
      }
      const center = new THREE.Vector3();
      bbox.getCenter(center);

      // Offset: shift all points so center is at origin
      const offset = center.clone().negate();

      for (const chain of chains) {
        // Apply centering offset
        const offsetPoints = chain.points.map(p => p.clone().add(offset));
        const tubeOpts = { ...presetOptions, closed: true };

        // Handle auto-segmenting
        if (preset && preset.maxLengthM) {
          const connectorHeightM = preset.connectorHeightMm
            ? preset.connectorHeightMm * 0.001
            : 0.03;
          const tension = 0.5;

          const closedCurve = new THREE.CatmullRomCurve3(
            offsetPoints.map(p => p.clone()), true, 'catmullrom', tension
          );
          const perimeter = closedCurve.getLength();

          if (perimeter <= preset.maxLengthM) {
            this.app.tubeManager.createTube(offsetPoints, tubeOpts);
            createdCount++;
            continue;
          }

          const segmentPoints = [...offsetPoints, offsetPoints[0].clone()];
          const result = autoSegment(segmentPoints, preset.maxLengthM, connectorHeightM, tension);

          if (result.segments.length > 1) {
            const segOptions = { ...tubeOpts };
            delete segOptions.closed;

            for (let i = 0; i < result.segments.length; i++) {
              const segName = { name: `Text (seg ${i + 1}/${result.segments.length})` };
              this.app.tubeManager.createTube(result.segments[i], { ...segOptions, ...segName });
              createdCount++;
            }

            if (this.connectorManager) {
              for (let i = 0; i < result.connectors.length; i++) {
                const conn = result.connectors[i];
                this.connectorManager.createConnector({
                  position: conn.position,
                  tangent: conn.tangent,
                  diameterMm: preset.connectorDiameterMm || 30,
                  heightMm: preset.connectorHeightMm || 30,
                  fixturePreset: presetId,
                });
              }
            }
            continue;
          }
        }

        // Single tube (no segmenting)
        this.app.tubeManager.createTube(offsetPoints, tubeOpts);
        createdCount++;
      }

      this.loadingOverlay.hide();

      if (statusEl) {
        statusEl.textContent = `Created ${createdCount} tube(s) from "${text}"`;
      }

      // Focus camera on results
      const focusBox = new THREE.Box3();
      for (const chain of chains) {
        for (const pt of chain.points) focusBox.expandByPoint(pt.clone().add(offset));
      }
      if (!focusBox.isEmpty()) {
        // Focus on the last created tube
        const tubes = this.app.tubeManager.tubes;
        if (tubes.length > 0) {
          const lastTube = tubes[tubes.length - 1];
          if (lastTube.group) {
            this.app.sceneManager.focusOnObject(lastTube.group);
          }
        }
      }
    } catch (err) {
      this.loadingOverlay.hide();
      console.error('Text to Tubes error:', err);
      if (statusEl) statusEl.textContent = `Error: ${err.message}`;
    }
  }

  // ── Shape Wizard ──────────────────────────────────────

  _onShapeWizard() {
    this.shapeWizardDialog.show();
  }

  /**
   * Handle Shape Wizard confirmation — create tubes + connectors for the shape.
   */
  _onShapeWizardConfirm(config) {
    const statusEl = document.getElementById('status-text');
    this.undoManager.capture();

    const plane = this.toolbar.currentPlane || 'XZ';
    let shape;

    if (config.shape === 'box') {
      shape = ShapeGeometryGenerator.generateBoxVertices(config.boxX, config.boxY, config.boxZ);
    } else if (config.shape === 'triangle') {
      shape = ShapeGeometryGenerator.generateTriangleVertices(config.sideLength, plane);
    } else if (config.shape === 'pentagon') {
      shape = ShapeGeometryGenerator.generatePentagonVertices(config.sideLength, plane);
    } else if (config.shape === 'hexagon') {
      shape = ShapeGeometryGenerator.generateHexagonVertices(config.sideLength, plane);
    } else if (config.shape === 'star') {
      shape = ShapeGeometryGenerator.generateStarVertices(
        config.starPoints, config.starOuterRadius, config.starInnerRatio, plane
      );
    } else if (config.shape === 'grid') {
      // Per-axis cell sizes for placeholder mode
      const csX = config.fixtureLenX || config.gridCellSize;
      const csY = config.fixtureLenY || config.gridCellSize;
      const csZ = config.fixtureLenZ || config.gridCellSize;
      shape = ShapeGeometryGenerator.generateGridVertices(
        config.gridX, config.gridY, config.gridZ,
        config.isPlaceholder ? csX : config.gridCellSize,
        config.isPlaceholder ? csY : undefined,
        config.isPlaceholder ? csZ : undefined
      );
    } else if (config.shape === 'cylinder') {
      shape = ShapeGeometryGenerator.generateCylinderVertices(
        config.cylSides, config.cylRings, config.cylRadius, config.cylHeight
      );
    } else if (config.shape === 'sphere') {
      shape = ShapeGeometryGenerator.generateSphereVertices(
        config.sphMeridians, config.sphParallels, config.sphRadius
      );
    } else if (config.shape === 'cone') {
      shape = ShapeGeometryGenerator.generateConeVertices(
        config.coneSides, config.coneRadius, config.coneHeight
      );
    } else if (config.shape === 'prism') {
      shape = ShapeGeometryGenerator.generatePrismVertices(
        config.prismSides, config.prismSideLength, config.prismHeight
      );
    } else if (config.shape === 'torus') {
      shape = ShapeGeometryGenerator.generateTorusVertices(
        config.torusMajorSeg, config.torusMinorSeg, config.torusMajorR, config.torusTubeR
      );
    } else {
      return;
    }

    const { vertices, edges } = shape;

    // Build tube options from active preset
    const preset = this.app.drawingManager.activePreset;
    const presetId = this.app.drawingManager.activePresetId;
    const tubeOptions = { tension: 0, closed: false };
    if (preset) {
      if (preset.profile != null) tubeOptions.profile = preset.profile;
      if (preset.diameterMm != null) tubeOptions.diameterMm = preset.diameterMm;
      if (preset.pixelsPerMeter != null) tubeOptions.pixelsPerMeter = preset.pixelsPerMeter;
      if (preset.dmxChannelsPerPixel != null) tubeOptions.dmxChannelsPerPixel = preset.dmxChannelsPerPixel;
      if (preset.materialPreset != null) tubeOptions.materialPreset = preset.materialPreset;
      tubeOptions.fixturePreset = presetId;
    }

    // Placeholder mode from Shape Wizard
    if (config.isPlaceholder) {
      tubeOptions.isPlaceholder = true;
      tubeOptions.facingDirection = config.facingDirection || 'outward';
      if (config.placeholderName) tubeOptions.placeholderName = config.placeholderName;
    }

    // Create one tube per edge — map edge index to tube
    const createdTubes = [];
    const edgeTubeMap = []; // edgeTubeMap[edgeIndex] = tube
    for (let ei = 0; ei < edges.length; ei++) {
      const [iA, iB] = edges[ei];
      const points = ShapeGeometryGenerator.computeEdgePoints(vertices[iA], vertices[iB], 2);
      const tube = this.app.tubeManager.createTube(points, {
        ...tubeOptions,
        name: `${config.shape} edge`,
      });
      createdTubes.push(tube);
      edgeTubeMap[ei] = tube;
    }

    // Auto-group all created tubes
    if (createdTubes.length >= 2) {
      const tm = this.app.tubeManager;
      tm.selectedTubeIds.clear();
      for (const t of createdTubes) {
        tm.selectedTubeIds.add(t.id);
      }
      tm.groupSelected();
      // Re-select first tube
      tm.selectTubeSingle(createdTubes[0]);
    }

    // Create connectors at each vertex, linked to adjacent tubes
    const is3DShape = ['box', 'grid', 'cylinder', 'sphere', 'cone', 'prism', 'torus'].includes(config.shape);
    const connDiaMm = config.connectorDiameterMm || (preset ? (tubeOptions.diameterMm || 16) + 4 : 20);
    const connHtMm = config.connectorHeightMm || 20;
    let connCount = 0;

    for (let vi = 0; vi < vertices.length; vi++) {
      const connectedEdges = ShapeGeometryGenerator.getVertexEdges(edges, vi);
      if (connectedEdges.length < 2) continue;

      // Link connector to adjacent tubes for group movement
      const adjTubeIds = connectedEdges.map(ei => edgeTubeMap[ei]?.id).filter(Boolean);
      const tubeBeforeId = adjTubeIds[0] || null;
      const tubeAfterId = adjTubeIds[1] || adjTubeIds[0] || null;

      if (is3DShape && connectedEdges.length >= 3) {
        // 3D vertex with 3+ edges → sphere connector
        this.connectorManager.createConnector({
          position: vertices[vi].clone(),
          tangent: new THREE.Vector3(0, 1, 0),
          diameterMm: connDiaMm,
          heightMm: connHtMm,
          type: 'sphere',
          color: '#111111',
          tubeBeforeId,
          tubeAfterId,
        });
        connCount++;
      } else if (connectedEdges.length === 2) {
        // Exactly 2 edges → angle connector
        const eA = connectedEdges[0];
        const eB = connectedEdges[1];
        const angle = ShapeGeometryGenerator.getEdgeAngle(vertices, edges, eA, eB, vi);

        const otherA = edges[eA][0] === vi ? edges[eA][1] : edges[eA][0];
        const otherB = edges[eB][0] === vi ? edges[eB][1] : edges[eB][0];
        const dirA = vertices[otherA].clone().sub(vertices[vi]).normalize();
        const dirB = vertices[otherB].clone().sub(vertices[vi]).normalize();
        const bisector = dirA.clone().add(dirB).normalize();
        const normal = new THREE.Vector3().crossVectors(dirA, dirB).normalize();
        if (normal.lengthSq() < 0.001) normal.set(0, 1, 0);

        this.connectorManager.createConnector({
          position: vertices[vi].clone(),
          tangent: bisector.clone(),
          diameterMm: connDiaMm,
          heightMm: connHtMm,
          type: 'angle',
          angle,
          normal,
          bisector,
          color: '#111111',
          tubeBeforeId,
          tubeAfterId,
        });
        connCount++;
      } else if (connectedEdges.length >= 3) {
        // 2D shape with 3+ edges at vertex (shouldn't normally happen for 2D polygons)
        this.connectorManager.createConnector({
          position: vertices[vi].clone(),
          tangent: new THREE.Vector3(0, 1, 0),
          diameterMm: connDiaMm,
          heightMm: connHtMm,
          type: 'sphere',
          color: '#111111',
          tubeBeforeId,
          tubeAfterId,
        });
        connCount++;
      }
    }

    // Status
    const edgeCount = edges.length;
    if (statusEl) {
      statusEl.textContent = `Created ${config.shape}: ${edgeCount} tubes + ${connCount} connectors (grouped)`;
    }

    this._refreshAll();
    this.app.sceneManager.requestRender();
  }

  // ── Resize / Reverse Tube ──────────────────────────────

  _onResizeTube(tube, targetLengthMm) {
    const curve = CurveBuilder.build(tube.controlPoints, tube.tension, tube.closed);
    if (!curve) return;
    const currentLength = CurveBuilder.getLength(curve) * 1000; // in mm
    if (currentLength < 0.1) return;

    const factor = targetLengthMm / currentLength;
    this.undoManager.capture();
    this.app.tubeManager.scaleTube(tube, factor);
    this.propertiesPanel.show(tube);

    const statusEl = document.getElementById('status-text');
    if (statusEl) statusEl.textContent = `Resized "${tube.name}" to ${Math.round(targetLengthMm)}mm`;
  }

  _onReverseTube(tube) {
    this.undoManager.capture();
    this.app.tubeManager.reverseTube(tube);

    const statusEl = document.getElementById('status-text');
    if (statusEl) statusEl.textContent = `Reversed "${tube.name}" direction`;
  }

  /**
   * Handle shape dimension changes for circles and rectangles.
   * Regenerates control points preserving center and plane.
   */
  _onShapeDimensionChange(tube, shapeType, dims) {
    this.undoManager.capture();
    const statusEl = document.getElementById('status-text');

    // Compute current center
    const center = new THREE.Vector3();
    for (const pt of tube.controlPoints) center.add(pt);
    center.divideScalar(tube.controlPoints.length);

    // Detect plane (from bounding box flatness)
    const pts = tube.controlPoints;
    const rangeX = Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x));
    const rangeY = Math.max(...pts.map(p => p.y)) - Math.min(...pts.map(p => p.y));
    const rangeZ = Math.max(...pts.map(p => p.z)) - Math.min(...pts.map(p => p.z));

    let plane;
    if (rangeY < rangeX * 0.1 && rangeY < rangeZ * 0.1) plane = 'XZ';
    else if (rangeZ < rangeX * 0.1 && rangeZ < rangeY * 0.1) plane = 'XY';
    else plane = 'YZ';

    if (shapeType === 'circle') {
      const radius = dims.diameter / 2;
      const numPoints = tube.controlPoints.length || 36;
      const newPoints = [];
      for (let i = 0; i < numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const a = Math.cos(angle) * radius;
        const b = Math.sin(angle) * radius;
        const pt = center.clone();
        switch (plane) {
          case 'XZ': pt.x += a; pt.z += b; break;
          case 'XY': pt.x += a; pt.y += b; break;
          case 'YZ': pt.y += a; pt.z += b; break;
        }
        newPoints.push(pt);
      }
      tube.controlPoints = newPoints;
      this.app.tubeManager.updateTube(tube);
      if (statusEl) statusEl.textContent = `Circle diameter: ${Math.round(dims.diameter * 1000)}mm`;
    } else if (shapeType === 'rectangle') {
      const hw = dims.width / 2;
      const hh = dims.height / 2;

      // Generate 4 corners
      let c1, c2, c3, c4;
      switch (plane) {
        case 'XZ':
          c1 = center.clone().add(new THREE.Vector3(-hw, 0, -hh));
          c2 = center.clone().add(new THREE.Vector3( hw, 0, -hh));
          c3 = center.clone().add(new THREE.Vector3( hw, 0,  hh));
          c4 = center.clone().add(new THREE.Vector3(-hw, 0,  hh));
          break;
        case 'XY':
          c1 = center.clone().add(new THREE.Vector3(-hw, -hh, 0));
          c2 = center.clone().add(new THREE.Vector3( hw, -hh, 0));
          c3 = center.clone().add(new THREE.Vector3( hw,  hh, 0));
          c4 = center.clone().add(new THREE.Vector3(-hw,  hh, 0));
          break;
        case 'YZ':
          c1 = center.clone().add(new THREE.Vector3(0, -hw, -hh));
          c2 = center.clone().add(new THREE.Vector3(0,  hw, -hh));
          c3 = center.clone().add(new THREE.Vector3(0,  hw,  hh));
          c4 = center.clone().add(new THREE.Vector3(0, -hw,  hh));
          break;
      }

      const corners = [c1, c2, c3, c4];
      const pointsPerEdge = 10;
      const newPoints = [];
      for (let edge = 0; edge < 4; edge++) {
        const from = corners[edge];
        const to = corners[(edge + 1) % 4];
        for (let i = 0; i < pointsPerEdge; i++) {
          const t = i / pointsPerEdge;
          newPoints.push(new THREE.Vector3().lerpVectors(from, to, t));
        }
      }

      tube.controlPoints = newPoints;
      this.app.tubeManager.updateTube(tube);
      if (statusEl) statusEl.textContent = `Rectangle: ${Math.round(dims.width * 1000)}x${Math.round(dims.height * 1000)}mm`;
    }
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

  // ── Camera Views ────────────────────────────────────────

  _onViewChange(viewName) {
    this.app.sceneManager.setCameraView(viewName);
    const statusEl = document.getElementById('status-text');
    const names = {
      top: 'Top', bottom: 'Bottom', front: 'Front', back: 'Back',
      left: 'Left', right: 'Right', perspective: '3D Perspective'
    };
    if (statusEl) statusEl.textContent = `View: ${names[viewName] || viewName}`;
  }

  // ── Focus ──────────────────────────────────────────────

  focusSelected() {
    const tube = this.app.tubeManager.selectedTube;
    const refModel = this.refModelManager.selectedModel;

    if (tube && tube.group) {
      this.app.sceneManager.focusOnObject(tube.group);
    } else if (refModel && refModel.group) {
      this.app.sceneManager.focusOnObject(refModel.group);
    } else {
      this.app.sceneManager.focusAll();
    }
  }

  // ── Isolation Mode ─────────────────────────────────────

  toggleIsolation() {
    if (this.isolationMode) {
      this._exitIsolation();
    } else {
      this._enterIsolation();
    }
  }

  _enterIsolation() {
    const selectedModels = this.refModelManager.getSelectedModels();
    // Need at least one selected ref model to isolate
    if (selectedModels.length === 0) {
      const statusEl = document.getElementById('status-text');
      if (statusEl) statusEl.textContent = 'Select a reference model to isolate';
      return;
    }

    this.isolationMode = true;
    this._isolatedModelIds = new Set(selectedModels.map(m => m.id));
    this._savedOpacities.clear();
    this._savedVisibility = new Map();

    // Completely hide all non-isolated ref models
    for (const model of this.refModelManager.models) {
      if (this._isolatedModelIds.has(model.id)) continue;
      if (!model.group) continue;
      this._savedOpacities.set(model.id, model.opacity);
      this._savedVisibility.set(model.id, model.visible);
      model.visible = false;
      model.applyAll();
    }

    this.toolbar.setIsolateActive(true);
    this._updateIsolationStatus();

    // ── Cheat: reset model transforms to natural orientation at origin ──
    // Save original transforms for each model
    this._savedTransforms = new Map();
    for (const model of selectedModels) {
      if (!model.group) continue;
      model.group.updateMatrixWorld(true);
      this._savedTransforms.set(model.id, {
        position: model.group.position.clone(),
        quaternion: model.group.quaternion.clone(),
        matrixWorld: model.group.matrixWorld.clone(),
      });
      // Reset rotation to identity — shows model in its natural flat orientation
      model.group.quaternion.set(0, 0, 0, 1);
    }

    // Compute bounding box after rotation reset, then center at origin
    const box = new THREE.Box3();
    for (const model of selectedModels) {
      if (model.group) {
        model.group.updateMatrixWorld(true);
        box.expandByObject(model.group);
      }
    }
    if (!box.isEmpty()) {
      const center = new THREE.Vector3();
      box.getCenter(center);
      // Shift all models so the combined center is at world origin
      for (const model of selectedModels) {
        if (model.group) model.group.position.sub(center);
      }
      this._isolationCenterShift = center.clone();
    } else {
      this._isolationCenterShift = new THREE.Vector3();
    }

    // Save the isolation-space matrix for tube transformation on exit
    for (const model of selectedModels) {
      if (!model.group) continue;
      model.group.updateMatrixWorld(true);
      const saved = this._savedTransforms.get(model.id);
      if (saved) saved.matrixIso = model.group.matrixWorld.clone();
    }

    // Track existing tubes and connectors so we can transform new ones on exit
    this._preIsolationTubeIds = new Set(this.app.tubeManager.tubes.map(t => t.id));
    this._preIsolationConnIds = this.connectorManager
      ? new Set(this.connectorManager.connectors.map(c => c.id))
      : new Set();

    // Recompute bounding box (now centered at origin) for camera
    const focusBox = new THREE.Box3();
    for (const model of selectedModels) {
      if (model.group) focusBox.expandByObject(model.group);
    }
    const focusCenter = new THREE.Vector3();
    focusBox.getCenter(focusCenter);
    const focusSize = new THREE.Vector3();
    focusBox.getSize(focusSize);
    const maxDim = Math.max(focusSize.x, focusSize.y, focusSize.z);
    const fov = this.app.sceneManager.camera.fov * (Math.PI / 180);
    const fitDist = (maxDim / 2) / Math.tan(fov / 2) * 1.4;
    const dist = Math.max(fitDist, 0.5);

    // Always use clean top-down view — model is now flat in XZ
    const camPos = new THREE.Vector3(focusCenter.x, focusCenter.y + dist, focusCenter.z + 0.001);
    this.app.sceneManager.animateCameraTo(camPos, focusCenter);

    // Drawing plane: XZ (horizontal) anchored at model top
    this.setPlane('XZ');
    if (!focusBox.isEmpty()) {
      const anchor = focusCenter.clone();
      anchor.y = focusBox.max.y;
      this.app.sceneManager.anchorPlaneAt(anchor);
    }

    // Update selection highlights at new position
    this.refModelManager.updateHighlights();
    this.app.sceneManager.requestRender();

    const statusEl = document.getElementById('status-text');
    const names = selectedModels.map(m => m.name).join(', ');
    const count = selectedModels.length;
    if (statusEl) {
      if (count === 1) {
        statusEl.textContent = `Isolated "${names}" — draw your tube, then Snap to Ref`;
      } else {
        statusEl.textContent = `Isolated ${count} models — draw your tube, then Snap to Ref`;
      }
    }
  }

  /**
   * Generate shape points from a bounding box for auto-fit in isolation mode.
   * Rectangle: matches the bounding box edges on the current plane at the top.
   * Circle: circumscribes the bounding box on the current plane at the top.
   */
  _generateShapeFromBox(box, shapeType) {
    const plane = this.app.sceneManager.currentPlane;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Use top of bounding box for Y
    const topY = box.max.y;

    if (shapeType === 'rectangle') {
      // Generate rectangle from bounding box edges on the active plane
      const pointsPerEdge = 10;
      const points = [];
      let c1, c2, c3, c4;

      switch (plane) {
        case 'XZ':
          c1 = new THREE.Vector3(box.min.x, topY, box.min.z);
          c2 = new THREE.Vector3(box.max.x, topY, box.min.z);
          c3 = new THREE.Vector3(box.max.x, topY, box.max.z);
          c4 = new THREE.Vector3(box.min.x, topY, box.max.z);
          break;
        case 'XY':
          c1 = new THREE.Vector3(box.min.x, box.min.y, center.z);
          c2 = new THREE.Vector3(box.max.x, box.min.y, center.z);
          c3 = new THREE.Vector3(box.max.x, box.max.y, center.z);
          c4 = new THREE.Vector3(box.min.x, box.max.y, center.z);
          break;
        case 'YZ':
          c1 = new THREE.Vector3(center.x, box.min.y, box.min.z);
          c2 = new THREE.Vector3(center.x, box.max.y, box.min.z);
          c3 = new THREE.Vector3(center.x, box.max.y, box.max.z);
          c4 = new THREE.Vector3(center.x, box.min.y, box.max.z);
          break;
      }

      const corners = [c1, c2, c3, c4];
      for (let edge = 0; edge < 4; edge++) {
        const from = corners[edge];
        const to = corners[(edge + 1) % 4];
        for (let i = 0; i < pointsPerEdge; i++) {
          const t = i / pointsPerEdge;
          points.push(new THREE.Vector3().lerpVectors(from, to, t));
        }
      }
      return points;
    } else {
      // Circle: circumscribes the bounding box on the active plane
      const numPoints = 36;
      const points = [];
      let radius;

      switch (plane) {
        case 'XZ':
          radius = Math.sqrt((size.x / 2) ** 2 + (size.z / 2) ** 2);
          for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            points.push(new THREE.Vector3(
              center.x + Math.cos(angle) * radius,
              topY,
              center.z + Math.sin(angle) * radius
            ));
          }
          break;
        case 'XY':
          radius = Math.sqrt((size.x / 2) ** 2 + (size.y / 2) ** 2);
          for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            points.push(new THREE.Vector3(
              center.x + Math.cos(angle) * radius,
              center.y + Math.sin(angle) * radius,
              center.z
            ));
          }
          break;
        case 'YZ':
          radius = Math.sqrt((size.y / 2) ** 2 + (size.z / 2) ** 2);
          for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            points.push(new THREE.Vector3(
              center.x,
              center.y + Math.cos(angle) * radius,
              center.z + Math.sin(angle) * radius
            ));
          }
          break;
      }
      return points;
    }
  }

  /**
   * Generate shape points from an OBB (oriented bounding box).
   * Uses OBB axes directly so shapes follow the model's actual orientation,
   * even when rotated at arbitrary angles (not axis-aligned).
   */
  _generateShapeFromOBB(obb, shapeType) {
    const center = obb.center;
    const a0 = obb.axes[0], a1 = obb.axes[1];
    const faceExt0 = obb.extents[0]; // largest face dimension
    const faceExt1 = obb.extents[1]; // second face dimension

    if (shapeType === 'rectangle') {
      // Corners on the OBB face plane — no axis-aligned flattening
      const faceCorners = [
        center.clone().addScaledVector(a0, obb.mins[0]).addScaledVector(a1, obb.mins[1]),
        center.clone().addScaledVector(a0, obb.maxs[0]).addScaledVector(a1, obb.mins[1]),
        center.clone().addScaledVector(a0, obb.maxs[0]).addScaledVector(a1, obb.maxs[1]),
        center.clone().addScaledVector(a0, obb.mins[0]).addScaledVector(a1, obb.maxs[1]),
      ];
      const pointsPerEdge = 10;
      const points = [];
      for (let edge = 0; edge < 4; edge++) {
        const from = faceCorners[edge];
        const to = faceCorners[(edge + 1) % 4];
        for (let i = 0; i < pointsPerEdge; i++) {
          const t = i / pointsPerEdge;
          points.push(new THREE.Vector3().lerpVectors(from, to, t));
        }
      }
      return points;
    } else {
      // Circle on the OBB face plane using OBB axes as basis vectors
      const numPoints = 36;
      const points = [];
      const radius = Math.max(faceExt0, faceExt1) / 2;

      for (let i = 0; i < numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        points.push(
          center.clone()
            .addScaledVector(a0, Math.cos(angle) * radius)
            .addScaledVector(a1, Math.sin(angle) * radius)
        );
      }
      return points;
    }
  }

  _exitIsolation() {
    if (!this.isolationMode) return;

    // Restore saved visibility and opacities
    for (const [modelId, opacity] of this._savedOpacities) {
      const model = this.refModelManager.getModelById(modelId);
      if (model) {
        model.opacity = opacity;
        const wasVisible = this._savedVisibility.get(modelId);
        model.visible = wasVisible !== undefined ? wasVisible : true;
        model.applyAll();
      }
    }

    // ── Restore model transforms and move tubes back to world space ──
    if (this._savedTransforms && this._savedTransforms.size > 0) {
      // Build isolation→world transform from the first model
      // T = M_world_original * M_iso^(-1)
      const firstSaved = this._savedTransforms.values().next().value;
      let tubeTransform = null;
      if (firstSaved && firstSaved.matrixWorld && firstSaved.matrixIso) {
        tubeTransform = firstSaved.matrixWorld.clone().multiply(
          firstSaved.matrixIso.clone().invert()
        );
      }

      // Restore each model's original position and rotation
      for (const [id, saved] of this._savedTransforms) {
        const model = this.refModelManager.getModelById(id);
        if (model && model.group) {
          model.group.position.copy(saved.position);
          model.group.quaternion.copy(saved.quaternion);
          model.group.updateMatrixWorld(true);
        }
      }

      // Transform tubes created during isolation back to original world space
      if (tubeTransform && this._preIsolationTubeIds) {
        for (const tube of this.app.tubeManager.tubes) {
          if (this._preIsolationTubeIds.has(tube.id)) continue;
          for (const point of tube.controlPoints) {
            point.applyMatrix4(tubeTransform);
          }
          this.app.tubeManager.updateTube(tube);
        }
        // Also transform connectors created during isolation
        if (this.connectorManager && this._preIsolationConnIds) {
          for (const conn of this.connectorManager.connectors) {
            if (this._preIsolationConnIds.has(conn.id)) continue;
            if (conn.position) conn.position.applyMatrix4(tubeTransform);
            if (conn.tangent) conn.tangent.applyMatrix4(
              new THREE.Matrix4().extractRotation(tubeTransform)
            );
          }
        }
      }

      // Update selection highlights at restored position
      this.refModelManager.updateHighlights();

      this._savedTransforms = null;
      this._preIsolationTubeIds = null;
      this._preIsolationConnIds = null;
      this._isolationCenterShift = null;
    }

    this.isolationMode = false;
    this._isolatedModelIds.clear();
    this._savedOpacities.clear();
    this._savedVisibility.clear();
    this.toolbar.setIsolateActive(false);
    this._removeIsolationStatus();

    // Reset drawing plane back to ground level
    this.app.sceneManager.resetPlaneAnchor();

    // Focus on restored scene
    this.app.sceneManager.focusAll();
    this.app.sceneManager.requestRender();

    const statusEl = document.getElementById('status-text');
    if (statusEl) statusEl.textContent = 'Isolation mode exited';
  }

  _updateIsolationStatus() {
    // Add indicator to status bar
    let indicator = document.getElementById('isolation-indicator');
    if (!indicator) {
      indicator = document.createElement('span');
      indicator.id = 'isolation-indicator';
      indicator.className = 'isolation-indicator';
      indicator.textContent = 'ISOLATION';
      const statusBar = document.getElementById('status-bar');
      if (statusBar) statusBar.appendChild(indicator);
    }
  }

  _removeIsolationStatus() {
    const indicator = document.getElementById('isolation-indicator');
    if (indicator) indicator.remove();
  }

  // ── Marquee Selection ──────────────────────────────────

  activateMarquee() {
    this.marqueeSelect.activate();
  }

  // ── Command Panel ────────────────────────────────────

  _registerCommands() {
    const t = this; // shorthand
    const icons = this.toolbar; // for icon methods

    this.commandPanel.addCommands([
      // Drawing tools
      { id: 'select', label: 'Select', shortcut: '1', category: 'draw',
        icon: icons._selectIcon(), action: () => t.setTool('select') },
      { id: 'click-place', label: 'Click Place', shortcut: '2', category: 'draw',
        icon: icons._clickPlaceIcon(), action: () => t.setTool('click-place') },
      { id: 'freehand', label: 'Freehand', shortcut: '3', category: 'draw',
        icon: icons._freehandIcon(), action: () => t.setTool('freehand') },
      { id: 'rectangle', label: 'Rectangle', shortcut: '4', category: 'draw',
        icon: icons._rectangleIcon(), action: () => t.setTool('rectangle') },
      { id: 'circle', label: 'Circle', shortcut: '5', category: 'draw',
        icon: icons._circleIcon(), action: () => t.setTool('circle') },
      { id: 'cut', label: 'Cut Tube', shortcut: 'C', category: 'draw',
        icon: icons._cutIcon(), action: () => t.setTool('cut') },

      // Edit actions
      { id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', category: 'edit',
        icon: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 9h10a5 5 0 015 5v1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
        action: () => t.undo() },
      { id: 'redo', label: 'Redo', shortcut: 'Ctrl+R', category: 'edit',
        icon: '<svg viewBox="0 0 24 24"><path d="M15 14l5-5-5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 9H10a5 5 0 00-5 5v1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
        action: () => t.redo() },
      { id: 'duplicate', label: 'Duplicate', shortcut: 'Ctrl+D', category: 'edit',
        icon: icons._duplicateIcon(), action: () => t._onDuplicateSelected() },
      { id: 'delete', label: 'Delete', shortcut: 'Del', category: 'edit',
        icon: icons._deleteIcon(), action: () => t._onDeleteSelected() },
      { id: 'group', label: 'Group', shortcut: 'Ctrl+G', category: 'edit',
        icon: icons._groupIcon(), action: () => t._onGroupTubes() },
      { id: 'ungroup', label: 'Ungroup', shortcut: 'Ctrl+B', category: 'edit',
        icon: icons._ungroupIcon(), action: () => t._onUngroupTubes() },
      { id: 'snap', label: 'Grid Snap', shortcut: 'G', category: 'edit',
        icon: icons._snapIcon(), action: () => {
          t.toolbar.snapEnabled = !t.toolbar.snapEnabled;
          t.toolbar.snapBtn.classList.toggle('active', t.toolbar.snapEnabled);
          t.app.drawingManager.setSnap(t.toolbar.snapEnabled);
        }},

      // Drawing plane
      { id: 'plane-xz', label: 'Ground XZ', shortcut: 'F1', category: 'plane',
        icon: icons._planeXZIcon(), action: () => t.setPlane('XZ') },
      { id: 'plane-xy', label: 'Front XY', shortcut: 'F2', category: 'plane',
        icon: icons._planeXYIcon(), action: () => t.setPlane('XY') },
      { id: 'plane-yz', label: 'Side YZ', shortcut: 'F3', category: 'plane',
        icon: icons._planeYZIcon(), action: () => t.setPlane('YZ') },

      // Camera views
      { id: 'view-top', label: 'Top', shortcut: 'Num7', category: 'view',
        icon: '<svg viewBox="0 0 24 24"><path d="M3 3h18v18H3z" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="12" y="15" font-size="9" fill="currentColor" text-anchor="middle" font-family="sans-serif">TOP</text></svg>',
        action: () => t.app.sceneManager.setCameraView('top') },
      { id: 'view-bottom', label: 'Bottom', shortcut: '^Num7', category: 'view',
        icon: '<svg viewBox="0 0 24 24"><path d="M3 3h18v18H3z" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="12" y="15" font-size="9" fill="currentColor" text-anchor="middle" font-family="sans-serif">BTM</text></svg>',
        action: () => t.app.sceneManager.setCameraView('bottom') },
      { id: 'view-front', label: 'Front', shortcut: 'Num1', category: 'view',
        icon: '<svg viewBox="0 0 24 24"><path d="M3 3h18v18H3z" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="12" y="15" font-size="9" fill="currentColor" text-anchor="middle" font-family="sans-serif">FRT</text></svg>',
        action: () => t.app.sceneManager.setCameraView('front') },
      { id: 'view-back', label: 'Back', shortcut: '^Num1', category: 'view',
        icon: '<svg viewBox="0 0 24 24"><path d="M3 3h18v18H3z" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="12" y="15" font-size="9" fill="currentColor" text-anchor="middle" font-family="sans-serif">BCK</text></svg>',
        action: () => t.app.sceneManager.setCameraView('back') },
      { id: 'view-right', label: 'Right', shortcut: 'Num3', category: 'view',
        icon: '<svg viewBox="0 0 24 24"><path d="M3 3h18v18H3z" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="12" y="15" font-size="9" fill="currentColor" text-anchor="middle" font-family="sans-serif">RGT</text></svg>',
        action: () => t.app.sceneManager.setCameraView('right') },
      { id: 'view-left', label: 'Left', shortcut: '^Num3', category: 'view',
        icon: '<svg viewBox="0 0 24 24"><path d="M3 3h18v18H3z" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="12" y="15" font-size="9" fill="currentColor" text-anchor="middle" font-family="sans-serif">LFT</text></svg>',
        action: () => t.app.sceneManager.setCameraView('left') },
      { id: 'view-3d', label: '3D View', shortcut: 'Num0', category: 'view',
        icon: '<svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
        action: () => t.app.sceneManager.setCameraView('perspective') },
      { id: 'focus', label: 'Focus', shortcut: 'F', category: 'view',
        icon: icons._focusIcon(), action: () => t.focusSelected() },
      { id: 'isolate', label: 'Isolate', shortcut: 'I', category: 'view',
        icon: icons._isolateIcon(), action: () => t.toggleIsolation() },

      // File operations
      { id: 'save', label: 'Save', shortcut: 'Ctrl+S', category: 'file',
        icon: icons._saveIcon(), action: () => t._onSave() },
      { id: 'load', label: 'Load', shortcut: 'Ctrl+O', category: 'file',
        icon: icons._loadIcon(), action: () => t._onLoad() },
      { id: 'import-ref', label: 'Import Ref', shortcut: 'Ctrl+I', category: 'file',
        icon: icons._importRefIcon(), action: () => t._onImportRef() },
      { id: 'export', label: 'Export MVR', shortcut: 'Ctrl+E', category: 'file',
        icon: icons._exportIcon(), action: () => t._onExport() },

      // Edge / Text tools
      { id: 'map-edges', label: 'Map Edges', shortcut: 'M', category: 'draw',
        icon: '<svg viewBox="0 0 24 24"><path d="M3 3l7 0 4 8-4 8H3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M14 3h7v18h-7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
        action: () => t._onMapEdges(30) },
      { id: 'text-to-tubes', label: 'Text to Tubes', shortcut: 'T', category: 'draw',
        icon: '<svg viewBox="0 0 24 24"><text x="12" y="18" font-size="18" font-weight="bold" fill="currentColor" text-anchor="middle" font-family="sans-serif">T</text></svg>',
        action: () => t._onTextToTubes() },
    ]);
  }

  toggleCommandPanel() {
    this.commandPanel.toggle();
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
            <div class="help-row"><kbd>M</kbd><span>Map Edges (ref model)</span></div>
            <div class="help-row"><kbd>T</kbd><span>Text to Tubes</span></div>
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
            <div class="help-row"><kbd>Ctrl + Z</kbd><span>Undo</span></div>
            <div class="help-row"><kbd>Ctrl + R</kbd><span>Redo</span></div>
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
            <div class="help-row"><kbd>F</kbd><span>Focus / zoom to selected</span></div>
            <div class="help-row"><kbd>I</kbd><span>Toggle isolation mode</span></div>
            <div class="help-row"><kbd>Shift + Click</kbd><span>Multi-select ref models</span></div>
            <div class="help-row"><kbd>Alt + Drag</kbd><span>Marquee select (ref models)</span></div>
          </div>
          <div class="help-section">
            <div class="help-section-title">Camera Views (Numpad)</div>
            <div class="help-row"><kbd>Num 7</kbd><span>Top view</span></div>
            <div class="help-row"><kbd>Ctrl+Num 7</kbd><span>Bottom view</span></div>
            <div class="help-row"><kbd>Num 1</kbd><span>Front view</span></div>
            <div class="help-row"><kbd>Ctrl+Num 1</kbd><span>Back view</span></div>
            <div class="help-row"><kbd>Num 3</kbd><span>Right view</span></div>
            <div class="help-row"><kbd>Ctrl+Num 3</kbd><span>Left view</span></div>
            <div class="help-row"><kbd>Num 0</kbd><span>3D Perspective</span></div>
            <div class="help-row"><kbd>Num .</kbd><span>Focus selected</span></div>
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
        <div style="padding:12px 20px;border-top:1px solid var(--border);text-align:center;">
          <a href="about.html" target="_blank" style="color:var(--accent);font-size:13px;font-weight:600;text-decoration:none;">Release Notes &amp; Info — Beta v1.3.1</a>
          <div style="margin-top:6px;font-size:11px;color:var(--text-muted);">BYFEIGNASSE | MAGICTOOLBOX</div>
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
