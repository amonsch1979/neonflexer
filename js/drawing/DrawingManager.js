import * as THREE from 'three';
import { ClickPlaceMode } from './ClickPlaceMode.js';
import { FreehandMode } from './FreehandMode.js';
import { PointEditor } from './PointEditor.js';

/**
 * Coordinates drawing modes and input.
 */
export class DrawingManager {
  constructor(sceneManager, tubeManager) {
    this.sceneManager = sceneManager;
    this.tubeManager = tubeManager;
    this.currentMode = 'select';

    this.clickPlaceMode = new ClickPlaceMode(sceneManager);
    this.freehandMode = new FreehandMode(sceneManager);
    this.pointEditor = new PointEditor(sceneManager);

    this.clickPlaceMode.onComplete = (points) => {
      this.tubeManager.createTube(points);
    };

    this.freehandMode.onComplete = (points) => {
      this.tubeManager.createTube(points);
    };

    this.pointEditor.onPointMoved = () => {};
    this.pointEditor.onPointDeleted = () => {};
  }

  setMode(mode) {
    this._deactivateAll();
    this.currentMode = mode;

    const controls = this.sceneManager.controls;
    switch (mode) {
      case 'select':
        // Restore left-click orbit in select mode
        controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        this.pointEditor.activate(this.tubeManager);
        break;
      case 'click-place':
        // Disable left-click orbit — left is for placing points, middle for orbit
        controls.mouseButtons.LEFT = null;
        this.clickPlaceMode.activate();
        break;
      case 'freehand':
        // Disable left-click orbit — left is for drawing, middle for orbit
        controls.mouseButtons.LEFT = null;
        this.freehandMode.activate();
        break;
    }
  }

  setSnap(enabled) {
    this.clickPlaceMode.snapEnabled = enabled;
    this.freehandMode.snapEnabled = enabled;
  }

  /**
   * Notify the active drawing mode that the plane changed.
   * This anchors the plane at the last point for seamless mid-draw switching.
   */
  onPlaneChanged() {
    if (this.currentMode === 'click-place') {
      this.clickPlaceMode.onPlaneChanged();
    }
    // Freehand doesn't support mid-draw plane switch (mouse is held down)
  }

  _deactivateAll() {
    this.clickPlaceMode.deactivate();
    this.freehandMode.deactivate();
    this.pointEditor.deactivate();
  }

  dispose() {
    this._deactivateAll();
    this.pointEditor.dispose();
  }
}
