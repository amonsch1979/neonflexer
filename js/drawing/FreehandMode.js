import * as THREE from 'three';
import { CurveBuilder } from './CurveBuilder.js';
import { simplifyPath } from '../utils/SimplifyPath.js';

/**
 * Freehand mouse drawing on the active drawing plane.
 * Hold mouse and draw, simplified on release. Shows live length.
 */
export class FreehandMode {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.active = false;
    this.drawing = false;
    this.rawPoints = [];
    this.previewLine = null;
    this.epsilon = 0.008;
    this.minDistance = 0.003;
    this.snapEnabled = true;
    this.gridSize = 0.01;
    this.maxLengthM = 0; // Set by DrawingManager when preset has maxLength

    this.onComplete = null;

    this._onPointerDown = this._onMouseDown.bind(this);
    this._onPointerMove = this._onMouseMove.bind(this);
    this._onPointerUp = this._onMouseUp.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  activate() {
    this.active = true;
    this.drawing = false;
    this.rawPoints = [];
    const canvas = this.sceneManager.canvas;
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerUp);
    document.addEventListener('keydown', this._onKeyDown);
    canvas.style.cursor = 'crosshair';
  }

  deactivate() {
    this.active = false;
    this.drawing = false;
    this.rawPoints = [];
    this._clearPreview();
    this._hideLengthOverlay();
    const canvas = this.sceneManager.canvas;
    canvas.removeEventListener('pointerdown', this._onPointerDown);
    canvas.removeEventListener('pointermove', this._onPointerMove);
    canvas.removeEventListener('pointerup', this._onPointerUp);
    document.removeEventListener('keydown', this._onKeyDown);
    canvas.style.cursor = '';
  }

  _onMouseDown(e) {
    if (!this.active || e.button !== 0) return;
    this.drawing = true;
    this.rawPoints = [];
    this._clearPreview();

    const point = this._getPlanePoint(e);
    if (point) this.rawPoints.push(point);

    const statusEl = document.getElementById('status-text');
    if (statusEl) statusEl.textContent = 'Drawing... | Length: 0mm — Release to finish';
  }

  _onMouseMove(e) {
    if (!this.active) return;

    const point = this._getPlanePoint(e);
    if (point) {
      const coordsEl = document.getElementById('status-coords');
      if (coordsEl) coordsEl.textContent = this.sceneManager.formatCoords(point);
    }

    if (!this.drawing || !point) return;

    if (this.rawPoints.length > 0) {
      const last = this.rawPoints[this.rawPoints.length - 1];
      if (point.distanceTo(last) < this.minDistance) return;
    }

    this.rawPoints.push(point);
    this._updatePreview();

    const statusEl = document.getElementById('status-text');
    if (statusEl && this.rawPoints.length >= 2) {
      const length = this._getRawLength();
      statusEl.textContent = `Drawing... | Length: ${(length * 1000).toFixed(0)}mm — Release to finish`;
      this._showLengthOverlay(length);
    }
  }

  _onMouseUp(e) {
    if (!this.active || !this.drawing) return;
    this.drawing = false;
    this._hideLengthOverlay();

    if (this.rawPoints.length < 3) {
      this._clearPreview();
      this.rawPoints = [];
      const statusEl = document.getElementById('status-text');
      if (statusEl) statusEl.textContent = 'Too short — draw a longer path';
      return;
    }

    const rawCount = this.rawPoints.length;
    const simplified = simplifyPath(this.rawPoints, this.epsilon);

    let finalPoints = simplified;
    if (this.snapEnabled) {
      finalPoints = simplified.map(p => {
        const snapped = this.sceneManager.snapToGrid(p, this.gridSize);
        this.sceneManager.constrainToPlane(snapped);
        this.sceneManager.clampToGrid(snapped);
        return snapped;
      });
    }

    this._clearPreview();
    this.rawPoints = [];

    if (finalPoints.length >= 2 && this.onComplete) {
      this.onComplete(finalPoints);
    }

    const statusEl = document.getElementById('status-text');
    if (statusEl) {
      statusEl.textContent = `Freehand: ${simplified.length} points from ${rawCount} samples. Draw again or switch tool.`;
    }
  }

  _onKeyDown(e) {
    if (!this.active) return;
    if (e.key === 'Escape') {
      this.drawing = false;
      this.rawPoints = [];
      this._clearPreview();
      this._hideLengthOverlay();
    }
  }

  _getPlanePoint(e) {
    const point = this.sceneManager.raycastDrawingPlane(e.clientX, e.clientY);
    if (!point) return null;
    this.sceneManager.constrainToPlane(point);
    this.sceneManager.clampToGrid(point);
    return point;
  }

  _getRawLength() {
    let len = 0;
    for (let i = 1; i < this.rawPoints.length; i++) {
      len += this.rawPoints[i].distanceTo(this.rawPoints[i - 1]);
    }
    return len;
  }

  _updatePreview() {
    this._clearPreview();
    if (this.rawPoints.length < 2) return;
    const geo = new THREE.BufferGeometry().setFromPoints(this.rawPoints);
    const mat = new THREE.LineBasicMaterial({ color: 0xff44aa, linewidth: 1 });
    this.previewLine = new THREE.Line(geo, mat);
    this.previewLine.name = '__freehand_preview';
    this.sceneManager.scene.add(this.previewLine);
  }

  _showLengthOverlay(lengthMeters) {
    const overlay = document.getElementById('length-overlay');
    if (!overlay) return;
    const lengthMm = (lengthMeters * 1000).toFixed(0);

    if (this.maxLengthM > 0) {
      const maxMm = Math.round(this.maxLengthM * 1000);
      const pct = Math.round((lengthMeters / this.maxLengthM) * 100);
      const segments = Math.ceil(lengthMeters / this.maxLengthM);
      let text = `${lengthMm} / ${maxMm} mm (${pct}%)`;
      if (segments > 1) {
        text += ` → ${segments} segments`;
      }
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

  _clearPreview() {
    if (this.previewLine) {
      this.sceneManager.scene.remove(this.previewLine);
      this.previewLine.geometry.dispose();
      this.previewLine.material.dispose();
      this.previewLine = null;
    }
  }
}
