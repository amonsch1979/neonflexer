import { Toolbar } from './Toolbar.js';
import { PropertiesPanel } from './PropertiesPanel.js';
import { TubeListPanel } from './TubeListPanel.js';
import { GLBExporter } from '../export/GLBExporter.js';

/**
 * Coordinates all UI panels and connects them to the app logic.
 */
export class UIManager {
  constructor(app) {
    this.app = app;

    // Toolbar
    this.toolbar = new Toolbar(document.getElementById('toolbar'));
    this.toolbar.onToolChange = (tool) => this._onToolChange(tool);
    this.toolbar.onSnapToggle = (enabled) => this._onSnapToggle(enabled);
    this.toolbar.onPlaneChange = (plane) => this._onPlaneChange(plane);
    this.toolbar.onExport = () => this._onExport();
    this.toolbar.onDeleteTube = () => this._onDeleteSelected();

    // Properties panel
    this.propertiesPanel = new PropertiesPanel(document.getElementById('properties-panel'));
    this.propertiesPanel.onPropertyChange = (tube, prop) => this._onPropertyChange(tube, prop);

    // Tube list
    this.tubeListPanel = new TubeListPanel(document.getElementById('tube-list'));
    this.tubeListPanel.onSelectTube = (id) => this._onSelectTube(id);
    this.tubeListPanel.onDeleteTube = (id) => this._onDeleteTube(id);
    this.tubeListPanel.onToggleVisible = (id) => this._onToggleVisible(id);

    // Connect tube manager callbacks
    const tm = this.app.tubeManager;
    tm.onTubeCreated = () => this._refreshAll();
    tm.onTubeUpdated = () => this._refreshAll();
    tm.onTubeDeleted = () => this._refreshAll();
    tm.onSelectionChanged = (tube) => {
      this.propertiesPanel.show(tube);
      this._refreshTubeList();
    };
  }

  _onToolChange(tool) {
    this.app.drawingManager.setMode(tool);
    const statusEl = document.getElementById('status-text');
    const messages = {
      'select': 'Select mode — Click a tube to select',
      'click-place': 'Click Place — Click to add points, double-click/Enter to finish',
      'freehand': 'Freehand — Click and drag to draw, release to finish',
    };
    if (statusEl) statusEl.textContent = messages[tool] || 'Ready';
  }

  _onSnapToggle(enabled) {
    this.app.drawingManager.setSnap(enabled);
  }

  _onPlaneChange(plane) {
    // Get anchor point from active drawing mode (last placed point)
    const dm = this.app.drawingManager;
    let anchor = null;
    if (dm.currentMode === 'click-place' && dm.clickPlaceMode.points.length > 0) {
      anchor = dm.clickPlaceMode.points[dm.clickPlaceMode.points.length - 1];
    }
    // Switch the plane, anchored at the last point
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
      if (statusEl) statusEl.textContent = 'Exporting GLB...';
      await GLBExporter.export(this.app.tubeManager);
      if (statusEl) statusEl.textContent = 'GLB exported successfully!';
    } catch (err) {
      console.error('Export error:', err);
      if (statusEl) statusEl.textContent = `Export failed: ${err.message}`;
    }
  }

  _onDeleteSelected() {
    const tube = this.app.tubeManager.selectedTube;
    if (tube) {
      this.app.tubeManager.deleteTube(tube);
    }
  }

  _onPropertyChange(tube, prop) {
    this.app.tubeManager.updateTube(tube);
    this._refreshTubeList();
  }

  _onSelectTube(id) {
    const tube = this.app.tubeManager.getTubeById(id);
    if (tube) {
      this.app.tubeManager.selectTube(tube);
    }
  }

  _onDeleteTube(id) {
    const tube = this.app.tubeManager.getTubeById(id);
    if (tube) {
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
    this.tubeListPanel.refresh(tm.tubes, tm.selectedTube?.id ?? null);
  }

  _refreshAll() {
    this._refreshTubeList();
    this.propertiesPanel.show(this.app.tubeManager.selectedTube);
  }

  /** Set active tool from keyboard shortcut */
  setTool(tool) {
    this.toolbar.setTool(tool);
    this._onToolChange(tool);
  }

  /** Set drawing plane from keyboard shortcut */
  setPlane(plane) {
    this.toolbar.setPlane(plane);
    this._onPlaneChange(plane);
  }
}
