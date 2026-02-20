import { SceneManager } from './scene/SceneManager.js';
import { TubeManager } from './tube/TubeManager.js';
import { DrawingManager } from './drawing/DrawingManager.js';
import { UIManager } from './ui/UIManager.js';
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

    console.log('MAGICTOOLBOX NEONFLEXER initialized');
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

      // Delete selected tube: Delete/Backspace key (only in select mode)
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.drawingManager.currentMode === 'select') {
        const tube = this.tubeManager.selectedTube;
        if (tube) {
          this.tubeManager.deleteTube(tube);
        }
        return;
      }

      // Duplicate tube: Ctrl+D
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        const tube = this.tubeManager.selectedTube;
        if (tube) {
          this.tubeManager.duplicateTube(tube);
          const statusEl = document.getElementById('status-text');
          if (statusEl) statusEl.textContent = `Duplicated "${tube.name}"`;
        }
        return;
      }

      // Save project: Ctrl+S
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        this.uiManager._onSave();
        return;
      }

      // Load project: Ctrl+O
      if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        this.uiManager._onLoad();
        return;
      }

      // Export: Ctrl+E
      if ((e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        this.uiManager._onExport();
        return;
      }

      // Help: ? or F12
      if (e.key === '?' || e.key === 'F12') {
        e.preventDefault();
        this.uiManager.toggleHelp();
        return;
      }

      // Escape: cancel drawing / deselect / close help
      if (e.key === 'Escape') {
        if (this.uiManager.helpVisible) {
          this.uiManager.toggleHelp();
          return;
        }
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
