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

    // Dismiss splash screen — hold for 2.5s then fade out over 1s
    const splash = document.getElementById('splash-screen');
    if (splash) {
      setTimeout(() => {
        splash.classList.add('fade-out');
        setTimeout(() => splash.remove(), 1000);
      }, 2500);
    }
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
      if (e.key === '4') {
        this.uiManager.setTool('rectangle');
        return;
      }
      if (e.key === '5') {
        this.uiManager.setTool('circle');
        return;
      }
      if (e.key === '6') {
        this.uiManager._onShapeWizard();
        return;
      }

      // Cut tool: C
      if (e.key === 'c' || e.key === 'C') {
        if (!e.ctrlKey && !e.metaKey) {
          this.uiManager.setTool('cut');
          return;
        }
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

      // Group tubes: Ctrl+G
      if ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        this.uiManager._onGroupTubes();
        return;
      }

      // Ungroup tubes: Ctrl+B
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        this.uiManager._onUngroupTubes();
        return;
      }

      // Grid snap toggle: G (only without Ctrl)
      if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey) {
        this.uiManager.toolbar.snapEnabled = !this.uiManager.toolbar.snapEnabled;
        this.uiManager.toolbar.snapBtn.classList.toggle('active', this.uiManager.toolbar.snapEnabled);
        this.drawingManager.setSnap(this.uiManager.toolbar.snapEnabled);
        const statusEl = document.getElementById('status-text');
        if (statusEl) statusEl.textContent = `Grid snap: ${this.uiManager.toolbar.snapEnabled ? 'ON' : 'OFF'}`;
        return;
      }

      // Undo: Ctrl+Z (skip global undo when drawing — click-place handles its own point undo)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        if (this.drawingManager.currentMode === 'click-place' && this.drawingManager.clickPlaceMode.points.length > 0) {
          return; // Let ClickPlaceMode's keydown handler undo the last point
        }
        this.uiManager.undo();
        return;
      }

      // Redo: Ctrl+R or Ctrl+Shift+Z
      if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        this.uiManager.redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && e.shiftKey) {
        e.preventDefault();
        this.uiManager.redo();
        return;
      }

      // Delete selected tube: Delete/Backspace key (only in select mode)
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.drawingManager.currentMode === 'select') {
        const tube = this.tubeManager.selectedTube;
        if (tube) {
          this.uiManager.undoManager.capture();
          // Also delete connectors linked to this tube
          if (this.uiManager.connectorManager) {
            this.uiManager.connectorManager.deleteConnectorsForTube(tube.id);
          }
          this.tubeManager.deleteTube(tube);
        }
        return;
      }

      // Duplicate tube: Ctrl+D
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        const tube = this.tubeManager.selectedTube;
        if (tube) {
          this.uiManager.undoManager.capture();
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

      // Import reference model: Ctrl+I
      if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        this.uiManager._onImportRef();
        return;
      }

      // Export: Ctrl+E
      if ((e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        this.uiManager._onExport();
        return;
      }

      // Map Edges: M key (without Ctrl) — when ref model selected
      if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey) {
        this.uiManager._onMapEdges(30);
        return;
      }

      // Text to Tubes: T key (without Ctrl)
      if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey) {
        this.uiManager._onTextToTubes();
        return;
      }

      // Command Pad: P key (without Ctrl)
      if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey) {
        this.uiManager.toggleCommandPanel();
        return;
      }

      // Focus: F key (without Ctrl)
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) {
        this.uiManager.focusSelected();
        return;
      }

      // Isolation: I key (without Ctrl)
      if ((e.key === 'i' || e.key === 'I') && !e.ctrlKey && !e.metaKey) {
        this.uiManager.toggleIsolation();
        return;
      }

      // Numpad camera views (Blender-style)
      if (e.code === 'Numpad7') {
        e.preventDefault();
        this.sceneManager.setCameraView(e.ctrlKey ? 'bottom' : 'top');
        return;
      }
      if (e.code === 'Numpad1') {
        e.preventDefault();
        this.sceneManager.setCameraView(e.ctrlKey ? 'back' : 'front');
        return;
      }
      if (e.code === 'Numpad3') {
        e.preventDefault();
        this.sceneManager.setCameraView(e.ctrlKey ? 'left' : 'right');
        return;
      }
      if (e.code === 'Numpad0') {
        e.preventDefault();
        this.sceneManager.setCameraView('perspective');
        return;
      }
      if (e.code === 'NumpadDecimal') {
        e.preventDefault();
        this.uiManager.focusSelected();
        return;
      }

      // Help: ?
      if (e.key === '?') {
        e.preventDefault();
        this.uiManager.toggleHelp();
        return;
      }

      // Escape: cancel drawing / deselect / close help / exit isolation
      if (e.key === 'Escape') {
        if (this.uiManager.helpVisible) {
          this.uiManager.toggleHelp();
          return;
        }
        if (this.uiManager.isolationMode) {
          this.uiManager.toggleIsolation();
          return;
        }
        if (this.drawingManager.currentMode !== 'select') {
          this.uiManager.setTool('select');
        }
        return;
      }
    });

    // Alt+drag for marquee selection
    const canvas = document.getElementById('viewport');
    canvas.addEventListener('pointerdown', (e) => {
      if (e.altKey && e.button === 0 && this.drawingManager.currentMode === 'select') {
        e.preventDefault();
        this.uiManager.activateMarquee();
        // Re-dispatch the event on the marquee overlay so it starts drawing
        setTimeout(() => {
          const overlay = document.querySelector('.marquee-overlay');
          if (overlay) {
            const newEvent = new PointerEvent('pointerdown', {
              clientX: e.clientX,
              clientY: e.clientY,
              button: 0,
              bubbles: true,
            });
            overlay.dispatchEvent(newEvent);
          }
        }, 0);
      }
    });
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
