import * as THREE from 'three';
import { CurveBuilder } from './CurveBuilder.js';

/**
 * Click-to-place control points on the active drawing plane.
 * - Switch planes mid-draw with F1/F2/F3 — plane auto-anchors to last point
 * - Shift+drag to adjust off-plane height after placing a point
 * - Live curve length shown while drawing
 */
export class ClickPlaceMode {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.active = false;
    this.points = [];
    this.previewLine = null;
    this.pointMarkers = [];
    this.cursorMarker = null;
    this.snapEnabled = true;
    this.gridSize = 0.01;
    this.maxLengthM = 0; // Set by DrawingManager when preset has maxLength
    this.segmentNumber = 1; // Current segment counter (resets on activate)

    // Segment continuation state — drawing pauses between segments
    this._waitingForContinue = false;
    this._continuePoint = null;

    // Shift-drag state
    this._shiftDragging = false;
    this._shiftDragStartY = 0;
    this._shiftDragOriginalValue = 0;
    this._shiftDragPointIndex = -1;
    this._heightLine = null;

    // Callbacks
    this.onPointAdded = null;
    this.onComplete = null;          // (points) => {} — final completion
    this.onSegmentComplete = null;   // (points, segNum) => {} — mid-draw segment auto-complete
    this.onPreviewUpdate = null;

    this._onPointerMove = this._onMouseMove.bind(this);
    this._onPointerDown = this._onMouseDown.bind(this);
    this._onPointerUp = this._onMouseUp.bind(this);
    this._onDblClick = this._onDblClick.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);

    // Cursor marker
    this.cursorMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.004, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.8 })
    );
    this.cursorMarker.name = '__cursor';
    this.cursorMarker.visible = false;
    this.sceneManager.scene.add(this.cursorMarker);
  }

  activate() {
    this.active = true;
    this.points = [];
    this.segmentNumber = 1;
    this._clearVisuals();
    this.cursorMarker.visible = true;
    // Reset plane to origin when starting fresh
    this.sceneManager.resetPlaneAnchor();
    const canvas = this.sceneManager.canvas;
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('dblclick', this._onDblClick);
    canvas.addEventListener('contextmenu', this._onContextMenu);
    document.addEventListener('keydown', this._onKeyDown);
    canvas.style.cursor = 'crosshair';
  }

  deactivate() {
    this.active = false;
    this._shiftDragging = false;
    this._waitingForContinue = false;
    this._continuePoint = null;
    this.cursorMarker.visible = false;
    this._clearVisuals();
    this._clearHeightLine();
    this._hideLengthOverlay();
    this.points = [];
    const canvas = this.sceneManager.canvas;
    canvas.removeEventListener('pointermove', this._onPointerMove);
    canvas.removeEventListener('pointerdown', this._onPointerDown);
    canvas.removeEventListener('pointerup', this._onPointerUp);
    canvas.removeEventListener('dblclick', this._onDblClick);
    canvas.removeEventListener('contextmenu', this._onContextMenu);
    document.removeEventListener('keydown', this._onKeyDown);
    canvas.style.cursor = '';
  }

  /**
   * Called when the drawing plane changes mid-draw.
   * Anchors the new plane at the last placed point so drawing continues seamlessly.
   */
  onPlaneChanged() {
    if (this.points.length > 0) {
      const lastPt = this.points[this.points.length - 1];
      this.sceneManager.anchorPlaneAt(lastPt);
    }
  }

  _onMouseMove(e) {
    if (!this.active) return;
    if (this._waitingForContinue) return; // Paused between segments

    if (this._shiftDragging && this.points.length > 0) {
      this._handleShiftDrag(e);
      return;
    }

    let point = this.sceneManager.raycastDrawingPlane(e.clientX, e.clientY);
    if (!point) return;
    this.sceneManager.constrainToPlane(point);
    if (this.snapEnabled) {
      point = this.sceneManager.snapToGrid(point, this.gridSize);
      this.sceneManager.constrainToPlane(point); // re-constrain after snap
    }
    this.sceneManager.clampToGrid(point);
    this.cursorMarker.position.copy(point);

    if (this.points.length > 0) {
      this._updatePreview([...this.points, point]);
    }

    this._updateStatusCoords(point);
    this._updateLengthOverlay([...this.points, point]);
  }

  _onMouseDown(e) {
    if (!this.active) return;

    // If waiting between segments, RIGHT-CLICK continues to next segment
    if (this._waitingForContinue) {
      if (e.button === 2) {
        this._startNextSegment();
      }
      // Left-click ignored while waiting
      return;
    }

    if (e.button !== 0) return; // Only left-click for point placement

    // Shift+click = start height drag on last point
    if (e.shiftKey && this.points.length > 0) {
      this._startShiftDrag(e);
      return;
    }

    if (e.detail > 1) return; // ignore double-click

    let point = this.sceneManager.raycastDrawingPlane(e.clientX, e.clientY);
    if (!point) return;
    this.sceneManager.constrainToPlane(point);
    if (this.snapEnabled) {
      point = this.sceneManager.snapToGrid(point, this.gridSize);
      this.sceneManager.constrainToPlane(point);
    }
    this.sceneManager.clampToGrid(point);

    this.points.push(point);
    this._addPointMarker(point);
    this._updatePreview(this.points);

    if (this.onPointAdded) {
      this.onPointAdded(this.points.slice());
    }

    this._updateStatusText();
    this._updateLengthOverlay(this.points);

    // Auto-segment: if maxLength is set and curve reached it, cap and stop
    if (this.maxLengthM > 0 && this.points.length >= 2) {
      const length = this._getCurveLength(this.points);
      if (length >= this.maxLengthM) {
        this._capAtMaxLength();
        this._autoCompleteSegment();
      }
    }
  }

  /**
   * Prevent browser context menu when right-click is used for segment continue.
   */
  _onContextMenu(e) {
    if (this._waitingForContinue) {
      e.preventDefault();
    }
  }

  _onMouseUp(e) {
    if (this._shiftDragging) {
      this._endShiftDrag();
    }
  }

  // --- Shift-drag height adjustment ---

  _startShiftDrag(e) {
    const idx = this.points.length - 1;
    const point = this.points[idx];
    const plane = this.sceneManager.currentPlane;

    this._shiftDragging = true;
    this._shiftDragStartY = e.clientY;
    this._shiftDragPointIndex = idx;
    // Store the original off-plane value
    this._shiftDragOriginalValue = plane === 'XZ' ? point.y : plane === 'XY' ? point.z : point.x;
    this.sceneManager.controls.enabled = false;
  }

  _handleShiftDrag(e) {
    const idx = this._shiftDragPointIndex;
    if (idx < 0 || idx >= this.points.length) return;

    const plane = this.sceneManager.currentPlane;
    const point = this.points[idx];

    // Pixel delta -> meters (1px = 1mm)
    const pixelDelta = this._shiftDragStartY - e.clientY;
    let newVal = this._shiftDragOriginalValue + pixelDelta * 0.001;

    if (this.snapEnabled) {
      newVal = Math.round(newVal / this.gridSize) * this.gridSize;
    }

    const half = this.sceneManager.gridSizeM / 2;
    newVal = Math.max(-half, Math.min(half, newVal));

    switch (plane) {
      case 'XZ': point.y = newVal; break;
      case 'XY': point.z = newVal; break;
      case 'YZ': point.x = newVal; break;
    }

    if (this.pointMarkers[idx]) {
      this.pointMarkers[idx].position.copy(point);
    }

    this._showHeightLine(point);
    this._updatePreview(this.points);

    // Status
    const axisName = plane === 'XZ' ? 'Y' : plane === 'XY' ? 'Z' : 'X';
    const length = this._getCurveLength(this.points);
    const statusEl = document.getElementById('status-text');
    if (statusEl) {
      statusEl.textContent = `Height ${axisName}: ${(newVal * 1000).toFixed(0)}mm | Length: ${(length * 1000).toFixed(0)}mm — Release to confirm`;
    }
    this._updateLengthOverlay(this.points);
  }

  _endShiftDrag() {
    this._shiftDragging = false;
    this._clearHeightLine();
    this.sceneManager.controls.enabled = true;
    this._updatePreview(this.points);
    this._updateStatusText();
  }

  _showHeightLine(point) {
    this._clearHeightLine();
    const plane = this.sceneManager.currentPlane;
    const anchor = this.sceneManager._planeAnchor;
    const onPlane = point.clone();
    switch (plane) {
      case 'XZ': onPlane.y = anchor.y; break;
      case 'XY': onPlane.z = anchor.z; break;
      case 'YZ': onPlane.x = anchor.x; break;
    }
    const geo = new THREE.BufferGeometry().setFromPoints([onPlane, point]);
    const mat = new THREE.LineDashedMaterial({ color: 0xffaa44, dashSize: 0.005, gapSize: 0.003 });
    this._heightLine = new THREE.Line(geo, mat);
    this._heightLine.computeLineDistances();
    this._heightLine.name = '__height_line';
    this.sceneManager.scene.add(this._heightLine);
  }

  _clearHeightLine() {
    if (this._heightLine) {
      this.sceneManager.scene.remove(this._heightLine);
      this._heightLine.geometry.dispose();
      this._heightLine.material.dispose();
      this._heightLine = null;
    }
  }

  // --- Keyboard ---

  _onDblClick(e) {
    if (!this.active) return;
    // While waiting, dbl-click finishes drawing entirely (no more segments)
    if (this._waitingForContinue) {
      this._finishFromWaiting();
      return;
    }
    if (this.points.length < 2) return;
    this._complete();
  }

  _onKeyDown(e) {
    if (!this.active) return;
    if (this._waitingForContinue) {
      if (e.key === 'Enter') {
        // Enter finishes drawing entirely (no more segments)
        this._finishFromWaiting();
      } else if (e.key === 'Escape') {
        this._cancel();
      }
      return;
    }
    if (e.key === 'Enter' && this.points.length >= 2) {
      this._complete();
    } else if (e.key === 'Escape') {
      this._cancel();
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && !this._shiftDragging) {
      this._undoLastPoint();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
      // Ctrl+Z while drawing = undo last point (not global undo)
      e.preventDefault();
      e.stopImmediatePropagation();
      this._undoLastPoint();
    }
  }

  // --- Complete / Cancel ---

  /**
   * Replace control points with dense samples from the original curve,
   * trimmed to exactly maxLengthM. Dense sampling constrains the rebuilt
   * CatmullRom to closely follow the original curve. A final binary
   * search on the last point guarantees length <= maxLengthM.
   */
  _capAtMaxLength() {
    if (this.points.length < 2) return;

    const curve = CurveBuilder.build(this.points, 0.5, false);
    if (!curve) return;
    const totalLength = CurveBuilder.getLength(curve);
    if (totalLength <= this.maxLengthM) return;

    // Sample the original curve from 0 to maxLengthM with dense points
    const tCut = this.maxLengthM / totalLength;
    const numSamples = 50; // ~120mm spacing for 6m tube — tight enough for CatmullRom fidelity

    // Clear old markers
    for (const marker of this.pointMarkers) {
      this.sceneManager.scene.remove(marker);
      marker.geometry.dispose();
      marker.material.dispose();
    }
    this.pointMarkers = [];

    const newPoints = [];
    for (let i = 0; i <= numSamples; i++) {
      const t = (i / numSamples) * tCut;
      newPoints.push(curve.getPointAt(t));
    }
    this.points = newPoints;

    // Fine-tune: binary search the last sample point to guarantee <= maxLengthM
    const lastIdx = this.points.length - 1;
    const prevPt = this.points[lastIdx - 1];
    const origLast = this.points[lastIdx].clone();
    let lo = 0, hi = 1;

    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      this.points[lastIdx] = new THREE.Vector3().lerpVectors(prevPt, origLast, mid);

      const c = CurveBuilder.build(this.points, 0.5, false);
      if (!c) break;
      const len = CurveBuilder.getLength(c);

      if (len > this.maxLengthM) {
        hi = mid;
      } else {
        lo = mid;
      }
      if (hi - lo < 0.0001) break;
    }
    // lo is guaranteed <= maxLengthM
    this.points[lastIdx] = new THREE.Vector3().lerpVectors(prevPt, origLast, lo);

    // Add markers for first and last
    this._addPointMarker(this.points[0]);
    this._addPointMarker(this.points[lastIdx]);

    this._updatePreview(this.points);
    this._updateLengthOverlay(this.points);
  }

  /**
   * Auto-complete the current segment when maxLength is reached.
   * PAUSES drawing — user must RIGHT-CLICK to continue with the next segment.
   */
  _autoCompleteSegment() {
    const pts = this.points.slice();
    this._clearVisuals();
    this._clearHeightLine();

    // Save continuation point (end of this segment = start of next)
    const lastPoint = pts[pts.length - 1].clone();

    // Complete this segment (DrawingManager creates the tube + connector)
    if (this.onSegmentComplete) {
      this.onSegmentComplete(pts, this.segmentNumber);
    }

    this.segmentNumber++;

    // PAUSE — enter waiting state, user must right-click to continue
    this._waitingForContinue = true;
    this._continuePoint = lastPoint;
    this.points = [];
    this.cursorMarker.visible = false;

    // Show a marker at the continuation point
    this._addPointMarker(lastPoint);

    const maxMm = Math.round(this.maxLengthM * 1000);
    const statusEl = document.getElementById('status-text');
    if (statusEl) {
      statusEl.textContent = `Seg ${this.segmentNumber - 1} complete (${maxMm}mm) — Right-click to continue segment ${this.segmentNumber} | Enter/Dbl-click to finish | Esc cancel`;
    }

    const overlay = document.getElementById('length-overlay');
    if (overlay) {
      overlay.textContent = `Seg ${this.segmentNumber - 1}: ${maxMm}mm — Right-click to continue`;
      overlay.style.color = '#00ff88';
      overlay.classList.add('visible');
    }
  }

  /**
   * User right-clicked to continue after segment pause — start the next segment.
   */
  _startNextSegment() {
    this._waitingForContinue = false;
    const startPt = this._continuePoint;
    this._continuePoint = null;

    // Clear the waiting marker
    this._clearVisuals();

    // Restore cursor
    this.cursorMarker.visible = true;

    // Start new segment from the continuation point
    this.points = [startPt];
    this._addPointMarker(startPt);
    this.sceneManager.anchorPlaneAt(startPt);

    this._updateStatusText();
    this._updateLengthOverlay(this.points);
  }

  /**
   * Finish drawing entirely from the waiting state (Enter or dbl-click).
   * Does not start a new segment — just exits drawing mode.
   */
  _finishFromWaiting() {
    this._waitingForContinue = false;
    this._continuePoint = null;
    this._clearVisuals();
    this._hideLengthOverlay();
    this.points = [];
    this.segmentNumber = 1;
    this.cursorMarker.visible = true;
    this.sceneManager.resetPlaneAnchor();
    // Trigger the final drawing-complete callback (switches back to select mode)
    if (this.onComplete) {
      this.onComplete([]); // empty — tubes were already created per segment
    }
  }

  _complete() {
    const pts = this.points.slice();
    this._clearVisuals();
    this._clearHeightLine();
    this.points = [];
    this.segmentNumber = 1;
    this.cursorMarker.visible = false;
    this._hideLengthOverlay();
    if (this.onComplete) {
      this.onComplete(pts);
    }
    // Ready for next tube
    this.cursorMarker.visible = true;
    this.sceneManager.resetPlaneAnchor();
    const statusEl = document.getElementById('status-text');
    if (statusEl) statusEl.textContent = 'Tube created. Click to start a new one.';
    const coordsEl = document.getElementById('status-coords');
    if (coordsEl) coordsEl.textContent = '';
  }

  _cancel() {
    this._waitingForContinue = false;
    this._continuePoint = null;
    this._clearVisuals();
    this._clearHeightLine();
    this._hideLengthOverlay();
    this.points = [];
    this.sceneManager.resetPlaneAnchor();
    const statusEl = document.getElementById('status-text');
    if (statusEl) statusEl.textContent = 'Drawing cancelled.';
  }

  _undoLastPoint() {
    if (this.points.length === 0) return;
    this.points.pop();
    const marker = this.pointMarkers.pop();
    if (marker) {
      this.sceneManager.scene.remove(marker);
      marker.geometry.dispose();
      marker.material.dispose();
    }
    // Re-anchor plane to new last point
    if (this.points.length > 0) {
      this.sceneManager.anchorPlaneAt(this.points[this.points.length - 1]);
    } else {
      this.sceneManager.resetPlaneAnchor();
    }
    this._updatePreview(this.points);
    this._updateStatusText();
  }

  // --- Visuals ---

  _addPointMarker(point) {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.005, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x00d4ff })
    );
    marker.position.copy(point);
    marker.name = '__point_marker';
    this.sceneManager.scene.add(marker);
    this.pointMarkers.push(marker);
  }

  _updatePreview(points) {
    if (this.previewLine) {
      this.sceneManager.scene.remove(this.previewLine);
      this.previewLine.geometry.dispose();
      this.previewLine.material.dispose();
      this.previewLine = null;
    }
    if (points.length < 2) return;

    const curve = CurveBuilder.build(points);
    if (!curve) return;

    this.previewLine = CurveBuilder.createPreviewLine(curve, 0x00d4ff);
    if (this.previewLine) {
      this.sceneManager.scene.add(this.previewLine);
    }
    if (this.onPreviewUpdate) {
      this.onPreviewUpdate(curve);
    }
  }

  _getCurveLength(points) {
    if (points.length < 2) return 0;
    const curve = CurveBuilder.build(points);
    return curve ? CurveBuilder.getLength(curve) : 0;
  }

  _updateStatusCoords(point) {
    const coordsEl = document.getElementById('status-coords');
    if (coordsEl) {
      let text = this.sceneManager.formatCoords(point);
      if (this.points.length > 0) {
        const length = this._getCurveLength([...this.points, point]);
        text += `  |  L: ${(length * 1000).toFixed(0)}mm`;
      }
      coordsEl.textContent = text;
    }
  }

  _updateStatusText() {
    const statusEl = document.getElementById('status-text');
    if (!statusEl) return;
    if (this.points.length === 0) {
      statusEl.textContent = 'Click to place points | F1/F2/F3 switch plane | Shift+drag height';
    } else {
      const length = this._getCurveLength(this.points);
      let text = '';
      if (this.maxLengthM > 0 && this.segmentNumber > 1) {
        text += `Seg ${this.segmentNumber}: `;
      }
      text += `${this.points.length} pts | ${(length * 1000).toFixed(0)}mm`;
      if (this.maxLengthM > 0) {
        const maxMm = Math.round(this.maxLengthM * 1000);
        const pct = Math.round((length / this.maxLengthM) * 100);
        text += ` / ${maxMm}mm (${pct}%)`;
      }
      text += ' — Dbl-click/Enter finish | Esc cancel';
      statusEl.textContent = text;
    }
  }

  _updateLengthOverlay(points) {
    const overlay = document.getElementById('length-overlay');
    if (!overlay) return;
    if (points.length < 2) {
      if (this.maxLengthM > 0 && this.segmentNumber > 1) {
        // Show segment info even with < 2 points if we're on segment 2+
        overlay.textContent = `Seg ${this.segmentNumber}: 0 / ${Math.round(this.maxLengthM * 1000)} mm`;
        overlay.style.color = '';
        overlay.classList.add('visible');
      } else {
        overlay.classList.remove('visible');
      }
      return;
    }
    const length = this._getCurveLength(points);
    const lengthMm = (length * 1000).toFixed(0);

    if (this.maxLengthM > 0) {
      const maxMm = Math.round(this.maxLengthM * 1000);
      const pct = Math.round((length / this.maxLengthM) * 100);
      let text = '';
      if (this.segmentNumber > 1) {
        text += `Seg ${this.segmentNumber}: `;
      }
      text += `${lengthMm} / ${maxMm} mm (${pct}%)`;
      overlay.textContent = text;
      overlay.style.color = pct > 100 ? '#ff4444' : pct > 90 ? '#ffaa44' : '';
    } else {
      overlay.textContent = `${lengthMm} mm`;
      overlay.style.color = '';
    }
    overlay.classList.add('visible');
  }

  _hideLengthOverlay() {
    const overlay = document.getElementById('length-overlay');
    if (overlay) {
      overlay.classList.remove('visible');
      overlay.textContent = '';
      overlay.style.color = '';
    }
  }

  _clearVisuals() {
    if (this.previewLine) {
      this.sceneManager.scene.remove(this.previewLine);
      this.previewLine.geometry.dispose();
      this.previewLine.material.dispose();
      this.previewLine = null;
    }
    for (const marker of this.pointMarkers) {
      this.sceneManager.scene.remove(marker);
      marker.geometry.dispose();
      marker.material.dispose();
    }
    this.pointMarkers = [];
  }
}
