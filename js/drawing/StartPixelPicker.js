import * as THREE from 'three';
import { CurveBuilder } from './CurveBuilder.js';

/**
 * Interactive mode for picking a start pixel on a tube.
 * Hover over the tube body to highlight nearest pixel; click to set startPixel.
 * For closed tubes, a direction popup (CW / CCW) appears after picking.
 * Callback: onPick(tube, pixelIndex, reverse)
 *   reverse = true  → counterclockwise (reverse control point order)
 *   reverse = false → clockwise (keep control point order)
 */
export class StartPixelPicker {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.active = false;
    this.tube = null;
    this.onPick = null;  // (tube, pixelIndex, reverse) => {}
    this.onCancel = null; // () => {}

    this._previewGroup = null;
    this._pixelMeshes = [];
    this._allPoints = [];
    this._hoveredIndex = -1;
    this._dirPopup = null; // direction popup element

    // Hover marker — renders on top of everything so it's always visible
    this._markerGeo = new THREE.RingGeometry(0.005, 0.009, 24);
    this._markerMat = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      side: THREE.DoubleSide,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    });
    this._marker = new THREE.Mesh(this._markerGeo, this._markerMat);
    this._marker.renderOrder = 999;
    this._marker.visible = false;

    // Pixel index label sprite
    this._labelSprite = this._createLabel('');
    this._labelSprite.visible = false;

    // Materials for pixel preview dots
    this._matActive = new THREE.MeshBasicMaterial({ color: 0x00d4ff, depthTest: false, transparent: true, opacity: 0.7 });
    this._matSkipped = new THREE.MeshBasicMaterial({ color: 0xff4444, depthTest: false, transparent: true, opacity: 0.3 });

    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  activate(tube) {
    if (this.active) this.deactivate();
    this.tube = tube;
    this.active = true;
    this._hoveredIndex = -1;

    this._buildPreview();

    const canvas = this.sceneManager.canvas;
    canvas.style.cursor = 'crosshair';
    canvas.addEventListener('pointermove', this._onPointerMove, true);
    canvas.addEventListener('pointerdown', this._onPointerDown, true);
    document.addEventListener('keydown', this._onKeyDown, true);
  }

  deactivate() {
    if (!this.active) return;
    this.active = false;
    this._removePreview();
    this._removeDirPopup();

    const canvas = this.sceneManager.canvas;
    canvas.style.cursor = '';
    canvas.removeEventListener('pointermove', this._onPointerMove, true);
    canvas.removeEventListener('pointerdown', this._onPointerDown, true);
    document.removeEventListener('keydown', this._onKeyDown, true);

    this.tube = null;
    this._hoveredIndex = -1;
    this._allPoints = [];
  }

  _buildPreview() {
    const tube = this.tube;
    if (!tube || !tube.isValid) return;

    const curve = CurveBuilder.build(tube.controlPoints, tube.tension, tube.closed);
    if (!curve) return;

    const { points } = CurveBuilder.getPixelPoints(curve, tube.pixelsPerMeter);
    if (points.length === 0) return;

    this._allPoints = points;

    // Hide the tube's normal pixel group during pick mode
    if (tube.pixelGroup) tube.pixelGroup.visible = false;

    const pixelSize = Math.max(0.002, tube.innerRadius * 0.35);
    const geo = new THREE.SphereGeometry(pixelSize, 8, 8);

    this._previewGroup = new THREE.Group();
    this._previewGroup.name = '__startPixelPreview';
    this._previewGroup.renderOrder = 998;
    this._pixelMeshes = [];

    const startPx = tube.startPixel || 0;

    for (let i = 0; i < points.length; i++) {
      // Closed tubes: all pixels are active (rotation, not skipping)
      // Open tubes: pixels before startPx are dimmed (skipped)
      const mat = (!tube.closed && i < startPx) ? this._matSkipped : this._matActive;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(points[i]);
      mesh.renderOrder = 998;
      mesh.userData.pixelIndex = i;
      this._previewGroup.add(mesh);
      this._pixelMeshes.push(mesh);
    }

    // Scale marker ring to match tube size
    const markerSize = Math.max(0.008, tube.outerRadius * 1.8);
    this._marker.scale.setScalar(markerSize / 0.009);
    this._marker.visible = false;

    this._previewGroup.add(this._marker);
    this._previewGroup.add(this._labelSprite);
    this.sceneManager.scene.add(this._previewGroup);
  }

  _removePreview() {
    if (this._previewGroup) {
      // Remove marker/label before clearing (they're reused)
      this._previewGroup.remove(this._marker);
      this._previewGroup.remove(this._labelSprite);
      this._marker.visible = false;
      this._labelSprite.visible = false;

      if (this._pixelMeshes.length > 0 && this._pixelMeshes[0].geometry) {
        this._pixelMeshes[0].geometry.dispose();
      }
      this._previewGroup.clear();
      this.sceneManager.scene.remove(this._previewGroup);
      this._previewGroup = null;
      this._pixelMeshes = [];
    }

    if (this.tube && this.tube.pixelGroup) {
      this.tube.pixelGroup.visible = true;
    }
  }

  _findNearestPixel(worldPoint) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < this._allPoints.length; i++) {
      const d = worldPoint.distanceToSquared(this._allPoints[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  _onPointerMove(e) {
    if (!this.active || this._allPoints.length === 0) return;
    // Don't update hover while direction popup is showing
    if (this._dirPopup) return;

    // Raycast against tube body (large target, easy to hit)
    const targets = [];
    if (this.tube.bodyMesh) targets.push(this.tube.bodyMesh);
    // Also try pixel spheres as fallback
    targets.push(...this._pixelMeshes);

    const hits = this.sceneManager.raycastObjects(e.clientX, e.clientY, targets);

    if (hits.length > 0) {
      const hit = hits[0];
      let idx;

      if (hit.object.userData.pixelIndex !== undefined) {
        idx = hit.object.userData.pixelIndex;
      } else {
        idx = this._findNearestPixel(hit.point);
      }

      if (idx >= 0 && idx < this._allPoints.length) {
        this._hoveredIndex = idx;
        const display = idx + 1; // 1-based for user display

        // Position marker ring at the pixel, facing the camera
        this._marker.position.copy(this._allPoints[idx]);
        this._marker.lookAt(this.sceneManager.camera.position);
        this._marker.visible = true;

        // Position label above
        this._updateLabel(`#${display}`);
        this._labelSprite.position.copy(this._allPoints[idx]);
        this._labelSprite.position.y += this.tube.outerRadius * 3;
        this._labelSprite.visible = true;

        const statusEl = document.getElementById('status-text');
        if (statusEl) {
          if (this.tube.closed) {
            statusEl.textContent = `Pick Start Pixel — Pixel ${display} of ${this._allPoints.length} becomes first pixel | Click to set, Esc to cancel`;
          } else {
            statusEl.textContent = `Pick Start Pixel — Pixel ${display} of ${this._allPoints.length} | Click to set, Esc to cancel`;
          }
        }
      }
    } else {
      this._hoveredIndex = -1;
      this._marker.visible = false;
      this._labelSprite.visible = false;
    }
  }

  _onPointerDown(e) {
    if (!this.active || e.button !== 0) return;

    e.stopPropagation();
    e.preventDefault();

    // If direction popup is open, ignore clicks on the canvas (popup handles itself)
    if (this._dirPopup) return;

    if (this._hoveredIndex < 0) return;

    const pickedIndex = this._hoveredIndex;
    const tube = this.tube;

    if (tube.closed) {
      // Show direction popup for closed tubes
      this._showDirectionPopup(tube, pickedIndex, e.clientX, e.clientY);
    } else {
      // Open tubes: immediate pick, no direction choice
      this.deactivate();
      if (this.onPick) this.onPick(tube, pickedIndex, false);
    }
  }

  _onKeyDown(e) {
    if (!this.active) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (this._dirPopup) {
        // Close direction popup, go back to picking
        this._removeDirPopup();
        return;
      }
      this.deactivate();
      if (this.onCancel) this.onCancel();
    }
  }

  // ── Direction popup (closed tubes) ─────────────────────

  _showDirectionPopup(tube, pickedIndex, mouseX, mouseY) {
    this._removeDirPopup();

    const popup = document.createElement('div');
    popup.style.cssText = `
      position: fixed;
      z-index: 1100;
      background: var(--bg-secondary, #16213e);
      border: 1px solid var(--accent-dim, #0097b2);
      border-radius: 10px;
      padding: 12px 16px;
      box-shadow: 0 6px 30px rgba(0,0,0,0.6), 0 0 20px rgba(0,212,255,0.2);
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 180px;
      font-family: var(--font-ui, sans-serif);
    `;

    const title = document.createElement('div');
    title.style.cssText = `
      color: var(--accent, #00d4ff);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      text-align: center;
      margin-bottom: 2px;
    `;
    title.textContent = 'Pixel Direction';
    popup.appendChild(title);

    const makeBtn = (label, icon, reverse) => {
      const btn = document.createElement('button');
      btn.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 8px 14px;
        background: var(--bg-panel, #0f3460);
        border: 1px solid var(--border, #2a4a7f);
        border-radius: 6px;
        color: #e0e0e0;
        font-size: 13px;
        font-family: var(--font-ui, sans-serif);
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
      `;
      btn.innerHTML = `<span style="font-size:16px">${icon}</span> ${label}`;
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'var(--accent-glow, rgba(0,212,255,0.3))';
        btn.style.borderColor = 'var(--accent, #00d4ff)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'var(--bg-panel, #0f3460)';
        btn.style.borderColor = 'var(--border, #2a4a7f)';
      });
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this._removeDirPopup();
        this.deactivate();
        if (this.onPick) this.onPick(tube, pickedIndex, reverse);
      });
      return btn;
    };

    popup.appendChild(makeBtn('Clockwise', '\u21BB', false));
    popup.appendChild(makeBtn('Counter-clockwise', '\u21BA', true));

    document.body.appendChild(popup);

    // Position near mouse, clamped to viewport
    const rect = popup.getBoundingClientRect();
    let x = mouseX + 12;
    let y = mouseY - rect.height / 2;
    if (x + rect.width > window.innerWidth - 8) x = mouseX - rect.width - 12;
    if (y < 8) y = 8;
    if (y + rect.height > window.innerHeight - 8) y = window.innerHeight - rect.height - 8;
    popup.style.left = x + 'px';
    popup.style.top = y + 'px';

    this._dirPopup = popup;

    const statusEl = document.getElementById('status-text');
    if (statusEl) statusEl.textContent = 'Choose pixel direction — Clockwise or Counter-clockwise | Esc to go back';
  }

  _removeDirPopup() {
    if (this._dirPopup) {
      this._dirPopup.remove();
      this._dirPopup = null;
    }
  }

  // ── Label sprite ──────────────────────────────────────

  _createLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    this._labelCanvas = canvas;
    this._labelCtx = ctx;

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.renderOrder = 1000;
    sprite.scale.set(0.06, 0.03, 1);
    return sprite;
  }

  _updateLabel(text) {
    const ctx = this._labelCtx;
    const canvas = this._labelCanvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 8);
    ctx.fill();

    ctx.fillStyle = '#ffff00';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    this._labelSprite.material.map.needsUpdate = true;
  }

  dispose() {
    this.deactivate();
    this._markerGeo.dispose();
    this._markerMat.dispose();
    this._matActive.dispose();
    this._matSkipped.dispose();
    if (this._labelSprite.material.map) this._labelSprite.material.map.dispose();
    if (this._labelSprite.material) this._labelSprite.material.dispose();
  }
}
