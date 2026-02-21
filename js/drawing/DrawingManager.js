import * as THREE from 'three';
import { ClickPlaceMode } from './ClickPlaceMode.js';
import { FreehandMode } from './FreehandMode.js';
import { ShapeMode } from './ShapeMode.js';
import { PointEditor } from './PointEditor.js';
import { CurveBuilder } from './CurveBuilder.js';
import { autoSegment } from '../tube/AutoSegmenter.js';

/**
 * Coordinates drawing modes and input.
 */
export class DrawingManager {
  constructor(sceneManager, tubeManager) {
    this.sceneManager = sceneManager;
    this.tubeManager = tubeManager;
    this.currentMode = 'select';

    // Active fixture preset (set by UIManager when preset changes)
    this.activePreset = null;
    this.activePresetId = 'custom';

    // Connector manager reference (set from UIManager)
    this.connectorManager = null;

    this.clickPlaceMode = new ClickPlaceMode(sceneManager);
    this.freehandMode = new FreehandMode(sceneManager);
    this.rectangleMode = new ShapeMode(sceneManager, 'rectangle');
    this.circleMode = new ShapeMode(sceneManager, 'circle');
    this.pointEditor = new PointEditor(sceneManager);

    this.onDrawingComplete = null;   // () => {} — called after final tube is finished
    this.onSegmentCreated = null;    // (tube, segNum) => {} — called when mid-draw segment completes
    this.onBeforeMutate = null;      // () => {} — called before any tube creation (for undo capture)

    this.clickPlaceMode.onComplete = (points) => {
      this._completeDraw(points);
    };

    // Mid-draw segment auto-complete (when maxLength is reached during drawing)
    this.clickPlaceMode.onSegmentComplete = (points, segNum) => {
      this._completeSegment(points, segNum);
    };

    this.freehandMode.onComplete = (points) => {
      this._completeDraw(points);
    };

    this.rectangleMode.onComplete = (points, options) => {
      this._completeDraw(points, options);
    };

    this.circleMode.onComplete = (points, options) => {
      this._completeDraw(points, options);
    };

    this.pointEditor.onPointMoved = () => {};
    this.pointEditor.onPointDeleted = () => {};
  }

  /**
   * Mid-draw segment auto-complete: creates one tube + connector, stays in drawing mode.
   * Called when maxLength is reached during click-place drawing.
   */
  _completeSegment(points, segNum) {
    if (points.length < 2) return;
    if (this.onBeforeMutate) this.onBeforeMutate();

    const preset = this.activePreset;
    const presetId = this.activePresetId;

    const presetOptions = {};
    if (preset) {
      if (preset.profile != null) presetOptions.profile = preset.profile;
      if (preset.diameterMm != null) presetOptions.diameterMm = preset.diameterMm;
      if (preset.pixelsPerMeter != null) presetOptions.pixelsPerMeter = preset.pixelsPerMeter;
      if (preset.dmxChannelsPerPixel != null) presetOptions.dmxChannelsPerPixel = preset.dmxChannelsPerPixel;
      if (preset.materialPreset != null) presetOptions.materialPreset = preset.materialPreset;
      presetOptions.fixturePreset = presetId;
    }

    // Create the segment tube
    const tube = this.tubeManager.createTube(points, {
      ...presetOptions,
      name: `Tube (seg ${segNum})`,
    });

    // Create a connector at the end of this segment
    if (this.connectorManager && preset) {
      const curve = CurveBuilder.build(points, 0.5, false);
      if (curve) {
        const endPos = curve.getPointAt(1.0);
        const endTangent = curve.getTangentAt(1.0);
        this.connectorManager.createConnector({
          position: endPos,
          tangent: endTangent,
          diameterMm: preset.connectorDiameterMm || 30,
          heightMm: preset.connectorHeightMm || 30,
          tubeBeforeId: tube.id,
          tubeAfterId: null, // Will be set when next segment completes
          fixturePreset: presetId,
        });
      }
    }

    // Notify for list refresh etc, but DON'T call onDrawingComplete (stays in drawing mode)
    if (this.onSegmentCreated) this.onSegmentCreated(tube, segNum);
  }

  /**
   * Complete a drawing — optionally auto-segments if active preset has maxLength.
   * @param {THREE.Vector3[]} points
   * @param {object} extraOptions - shape mode options (closed, tension, etc.)
   */
  _completeDraw(points, extraOptions = {}) {
    // Empty points = finishing from segment waiting state (tubes already created)
    if (!points || points.length < 2) {
      if (this.onDrawingComplete) this.onDrawingComplete();
      return;
    }
    if (this.onBeforeMutate) this.onBeforeMutate();

    const preset = this.activePreset;
    const presetId = this.activePresetId;

    // Build base tube options from preset (non-null values only)
    const presetOptions = {};
    if (preset) {
      if (preset.profile != null) presetOptions.profile = preset.profile;
      if (preset.diameterMm != null) presetOptions.diameterMm = preset.diameterMm;
      if (preset.pixelsPerMeter != null) presetOptions.pixelsPerMeter = preset.pixelsPerMeter;
      if (preset.dmxChannelsPerPixel != null) presetOptions.dmxChannelsPerPixel = preset.dmxChannelsPerPixel;
      if (preset.materialPreset != null) presetOptions.materialPreset = preset.materialPreset;
      presetOptions.fixturePreset = presetId;
    }

    const tubeOptions = { ...presetOptions, ...extraOptions };

    // Check if auto-segmenting is needed
    if (preset && preset.maxLengthM) {
      const connectorHeightM = preset.connectorHeightMm
        ? preset.connectorHeightMm * 0.001
        : 0.03;

      const tension = tubeOptions.tension || 0.5;
      const isClosed = !!extraOptions.closed;

      // For closed shapes, measure the perimeter with a closed curve
      // then linearize the loop for segmenting
      let segmentPoints = points;
      if (isClosed) {
        const closedCurve = new THREE.CatmullRomCurve3(
          points.map(p => p.clone()), true, 'catmullrom', tension
        );
        const perimeter = closedCurve.getLength();
        if (perimeter <= preset.maxLengthM) {
          // Fits in one segment — create as single closed tube
          this.tubeManager.createTube(points, tubeOptions);
          if (this.onDrawingComplete) this.onDrawingComplete();
          return;
        }
        // Close the loop by appending the first point at the end
        segmentPoints = [...points, points[0].clone()];
      }

      const result = autoSegment(segmentPoints, preset.maxLengthM, connectorHeightM, tension);

      if (result.segments.length > 1) {
        // Create multiple open tubes + connectors
        const segOptions = { ...tubeOptions };
        if (isClosed) delete segOptions.closed; // segments are open

        const createdTubes = [];
        for (let i = 0; i < result.segments.length; i++) {
          const segName = { name: `Tube (seg ${i + 1}/${result.segments.length})` };
          const tube = this.tubeManager.createTube(result.segments[i], { ...segOptions, ...segName });
          createdTubes.push(tube);
        }

        // Create connectors at junctions
        if (this.connectorManager) {
          for (let i = 0; i < result.connectors.length; i++) {
            const conn = result.connectors[i];
            this.connectorManager.createConnector({
              position: conn.position,
              tangent: conn.tangent,
              diameterMm: preset.connectorDiameterMm || 30,
              heightMm: preset.connectorHeightMm || 30,
              tubeBeforeId: createdTubes[i]?.id || null,
              tubeAfterId: createdTubes[i + 1]?.id || null,
              fixturePreset: presetId,
            });
          }
        }

        const statusEl = document.getElementById('status-text');
        if (statusEl) {
          statusEl.textContent = `Auto-split into ${result.segments.length} segments with ${result.connectors.length} connector(s)`;
        }

        if (this.onDrawingComplete) this.onDrawingComplete();
        return;
      }
    }

    // Single tube (no segmenting needed)
    this.tubeManager.createTube(points, tubeOptions);
    if (this.onDrawingComplete) this.onDrawingComplete();
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
      case 'rectangle':
        controls.mouseButtons.LEFT = null;
        this.rectangleMode.activate();
        break;
      case 'circle':
        controls.mouseButtons.LEFT = null;
        this.circleMode.activate();
        break;
      case 'cut':
        // Disable left-click orbit — cut is handled by TubeCutter in UIManager
        controls.mouseButtons.LEFT = null;
        break;
    }
  }

  setSnap(enabled) {
    this.clickPlaceMode.snapEnabled = enabled;
    this.freehandMode.snapEnabled = enabled;
    this.rectangleMode.snapEnabled = enabled;
    this.circleMode.snapEnabled = enabled;
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
    this.rectangleMode.deactivate();
    this.circleMode.deactivate();
    this.pointEditor.deactivate();
  }

  dispose() {
    this._deactivateAll();
    this.pointEditor.dispose();
  }
}
