import { SceneManager } from './scene/SceneManager.js';
import { TubeManager } from './tube/TubeManager.js';
import { DrawingManager } from './drawing/DrawingManager.js';
import { UIManager } from './ui/UIManager.js';
import { GLBExporter } from './export/GLBExporter.js';

/**
 * NeonFlex 3D Tube Designer - Main Application
 */
class App {
  constructor() {
    // Scene
    const canvas = document.getElementById('viewport');
    this.sceneManager = new SceneManager(canvas);

    // Tube management
    this.tubeManager = new TubeManager(this.sceneManager.scene);

    // Drawing tools
    this.drawingManager = new DrawingManager(this.sceneManager, this.tubeManager);

    // UI
    this.uiManager = new UIManager(this);

    // Start in select mode
    this.drawingManager.setMode('select');

    // Keyboard shortcuts
    this._setupKeyboardShortcuts();

    // Status
    const statusEl = document.getElementById('status-text');
    if (statusEl) statusEl.textContent = 'Ready — Press 2 or select Click Place tool to start drawing';

    console.log('NeonFlex 3D Tube Designer initialized');
  }

  _setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      // Tool switching: 1, 2, 3
      if (e.key === '1') {
        this.uiManager.setTool('select');
        return;
      }
      if (e.key === '2') {
        this.uiManager.setTool('click-place');
        return;
      }
      if (e.key === '3') {
        this.uiManager.setTool('freehand');
        return;
      }

      // Drawing plane: F1, F2, F3
      if (e.key === 'F1') {
        e.preventDefault();
        this.uiManager.setPlane('XZ');
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        this.uiManager.setPlane('XY');
        return;
      }
      if (e.key === 'F3') {
        e.preventDefault();
        this.uiManager.setPlane('YZ');
        return;
      }

      // Grid snap toggle: G
      if (e.key === 'g' || e.key === 'G') {
        this.uiManager.toolbar.snapEnabled = !this.uiManager.toolbar.snapEnabled;
        this.uiManager.toolbar.snapBtn.classList.toggle('active', this.uiManager.toolbar.snapEnabled);
        this.drawingManager.setSnap(this.uiManager.toolbar.snapEnabled);
        const statusEl = document.getElementById('status-text');
        if (statusEl) statusEl.textContent = `Grid snap: ${this.uiManager.toolbar.snapEnabled ? 'ON' : 'OFF'}`;
        return;
      }

      // Delete selected tube: Delete key (only in select mode)
      if (e.key === 'Delete' && this.drawingManager.currentMode === 'select') {
        // Skip if PointEditor already handled this (deleting a control point)
        if (e._handledByPointEditor) return;
        const tube = this.tubeManager.selectedTube;
        if (tube) {
          this.tubeManager.deleteTube(tube);
        }
        return;
      }

      // Export: Ctrl+E
      if ((e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        this.uiManager._onExport();
        return;
      }

      // Escape: cancel drawing / deselect
      if (e.key === 'Escape') {
        if (this.drawingManager.currentMode !== 'select') {
          this.uiManager.setTool('select');
        }
        return;
      }
    });
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
