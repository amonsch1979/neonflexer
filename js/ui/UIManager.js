import { Toolbar } from './Toolbar.js';
import { PropertiesPanel } from './PropertiesPanel.js';
import { TubeListPanel } from './TubeListPanel.js';
import { MVRExporter } from '../export/MVRExporter.js';

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
    this.toolbar.onDeleteTube = () => this._onDeleteSelected();
    this.toolbar.onDuplicateTube = () => this._onDuplicateSelected();
    this.toolbar.onHelp = () => this.toggleHelp();
    this.toolbar.onGridSizeChange = (size) => this._onGridSizeChange(size);

    // Length overlay element
    this.lengthOverlay = document.getElementById('length-overlay');

    // Properties panel
    this.propertiesPanel = new PropertiesPanel(document.getElementById('properties-panel'));
    this.propertiesPanel.onPropertyChange = (tube, prop) => this._onPropertyChange(tube, prop);

    // Tube list
    this.tubeListPanel = new TubeListPanel(document.getElementById('tube-list'));
    this.tubeListPanel.onSelectTube = (id) => this._onSelectTube(id);
    this.tubeListPanel.onDeleteTube = (id) => this._onDeleteTube(id);
    this.tubeListPanel.onToggleVisible = (id) => this._onToggleVisible(id);

    // Switch back to select mode after completing a drawing
    this.app.drawingManager.onDrawingComplete = () => {
      this.setTool('select');
    };

    // Connect tube manager callbacks
    const tm = this.app.tubeManager;
    tm.onTubeCreated = () => this._refreshAll();
    tm.onTubeUpdated = () => this._refreshAll();
    tm.onTubeDeleted = () => this._refreshAll();
    tm.onSelectionChanged = (tube) => {
      this.propertiesPanel.show(tube);
      this._refreshTubeList();
    };

    // Create help overlay (hidden by default)
    this._createHelpOverlay();
  }

  _onToolChange(tool) {
    this.app.drawingManager.setMode(tool);
    const statusEl = document.getElementById('status-text');
    const messages = {
      'select': 'Select mode — Click tube to select & move, click point to edit',
      'click-place': 'Click Place — Click to add points, double-click/Enter to finish',
      'freehand': 'Freehand — Click and drag to draw, release to finish',
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
      await MVRExporter.export(this.app.tubeManager);
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

  setTool(tool) {
    this.toolbar.setTool(tool);
    this._onToolChange(tool);
  }

  setPlane(plane) {
    this.toolbar.setPlane(plane);
    this._onPlaneChange(plane);
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
