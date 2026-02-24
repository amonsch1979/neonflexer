import * as THREE from 'three';
import { CurveBuilder } from './CurveBuilder.js';

/**
 * Interactive mode for picking a start pixel on a tube.
 * Hover over the tube body to highlight nearest pixel; click to set startPixel.
 * For closed tubes, after picking: highlights 2 adjacent pixels and lets user
 * click which one comes next to determine direction (replaces CW/CCW popup).
 * Callback: onPick(tube, pixelIndex, reverse)
 *   reverse = true  → backward (reverse control point order)
 *   reverse = false → forward (keep control point order)
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
    this._dirPopup = null; // direction text label element

    // Direction mode state (closed tubes)
    this._directionMode = false;
    this._pickedIndex = -1;
    this._adjIndices = []; // [prevIndex, nextIndex]
    this._savedScales = new Map(); // pixelIndex → original scale

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
    this._matDirection = new THREE.MeshBasicMaterial({ color: 0x44ff88, depthTest: false, transparent: true, opacity: 0.9 });
    this._matDimmed = new THREE.MeshBasicMaterial({ color: 0x444466, depthTest: false, transparent: true, opacity: 0.15 });
    this._matPicked = new THREE.MeshBasicMaterial({ color: 0xffff00, depthTest: false, transparent: true, opacity: 0.95 });

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
    this._directionMode = false;
    this._pickedIndex = -1;
    this._adjIndices = [];
    this._savedScales.clear();
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

    if (this._directionMode) {
      this._onPointerMoveDirection(e);
      return;
    }

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

  _onPointerMoveDirection(e) {
    // Only raycast against the 2 adjacent pixel meshes
    const adjMeshes = this._adjIndices.map(i => this._pixelMeshes[i]);
    const hits = this.sceneManager.raycastObjects(e.clientX, e.clientY, adjMeshes);

    if (hits.length > 0) {
      const idx = hits[0].object.userData.pixelIndex;
      this._hoveredIndex = idx;

      // Show marker ring on hovered adjacent pixel
      this._marker.position.copy(this._allPoints[idx]);
      this._marker.lookAt(this.sceneManager.camera.position);
      this._marker.visible = true;

      // Show label
      const display = idx + 1;
      this._updateLabel(`#${display}`);
      this._labelSprite.position.copy(this._allPoints[idx]);
      this._labelSprite.position.y += this.tube.outerRadius * 3;
      this._labelSprite.visible = true;

      this.sceneManager.canvas.style.cursor = 'pointer';
    } else {
      this._hoveredIndex = -1;
      this._marker.visible = false;
      this._labelSprite.visible = false;
      this.sceneManager.canvas.style.cursor = 'crosshair';
    }
  }

  _onPointerDown(e) {
    if (!this.active || e.button !== 0) return;

    e.stopPropagation();
    e.preventDefault();

    if (this._directionMode) {
      this._onPointerDownDirection(e);
      return;
    }

    if (this._hoveredIndex < 0) return;

    const pickedIndex = this._hoveredIndex;
    const tube = this.tube;

    if (tube.closed) {
      // Enter direction mode: let user click adjacent pixel to set direction
      this._enterDirectionMode(pickedIndex);
    } else {
      // Open tubes: immediate pick, no direction choice
      this.deactivate();
      if (this.onPick) this.onPick(tube, pickedIndex, false);
    }
  }

  _onPointerDownDirection(e) {
    if (this._hoveredIndex < 0) return; // clicked elsewhere, stay in direction mode

    const clickedIdx = this._hoveredIndex;
    const [prevIdx, nextIdx] = this._adjIndices;
    const tube = this.tube;
    const pickedIndex = this._pickedIndex;

    if (clickedIdx === nextIdx) {
      // Clicked forward neighbor → forward direction (reverse = false)
      this._removeDirPopup();
      this.deactivate();
      if (this.onPick) this.onPick(tube, pickedIndex, false);
    } else if (clickedIdx === prevIdx) {
      // Clicked backward neighbor → reverse direction (reverse = true)
      this._removeDirPopup();
      this.deactivate();
      if (this.onPick) this.onPick(tube, pickedIndex, true);
    }
    // else: clicked something else, ignore
  }

  _onKeyDown(e) {
    if (!this.active) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (this._directionMode) {
        // Exit direction mode, go back to pixel picking
        this._exitDirectionMode();
        return;
      }
      this.deactivate();
      if (this.onCancel) this.onCancel();
    }
  }

  // ── Direction mode (closed tubes) ──────────────────────

  _enterDirectionMode(pickedIndex) {
    const N = this._allPoints.length;
    const prevIdx = (pickedIndex - 1 + N) % N;
    const nextIdx = (pickedIndex + 1) % N;

    this._directionMode = true;
    this._pickedIndex = pickedIndex;
    this._adjIndices = [prevIdx, nextIdx];
    this._savedScales.clear();

    // Dim all pixels, then highlight picked + adjacent
    for (let i = 0; i < this._pixelMeshes.length; i++) {
      const mesh = this._pixelMeshes[i];
      this._savedScales.set(i, mesh.scale.x);
      mesh.material = this._matDimmed;
      mesh.scale.setScalar(1);
    }

    // Picked pixel: yellow
    this._pixelMeshes[pickedIndex].material = this._matPicked;
    this._pixelMeshes[pickedIndex].scale.setScalar(1.3);

    // Adjacent pixels: bright green, enlarged
    this._pixelMeshes[prevIdx].material = this._matDirection;
    this._pixelMeshes[prevIdx].scale.setScalar(1.8);
    this._pixelMeshes[nextIdx].material = this._matDirection;
    this._pixelMeshes[nextIdx].scale.setScalar(1.8);

    // Hide the hover marker (will reappear on hover over adjacent)
    this._marker.visible = false;
    this._labelSprite.visible = false;

    // Show "Choose pixel direction" text popup near picked pixel
    this._showDirLabel(pickedIndex);

    const statusEl = document.getElementById('status-text');
    if (statusEl) statusEl.textContent = 'Click the next pixel to set direction | Esc to go back';
  }

  _exitDirectionMode() {
    this._directionMode = false;
    this._pickedIndex = -1;
    this._adjIndices = [];
    this._marker.visible = false;
    this._labelSprite.visible = false;
    this._removeDirPopup();

    // Restore all pixel materials to normal preview state
    const startPx = this.tube.startPixel || 0;
    for (let i = 0; i < this._pixelMeshes.length; i++) {
      const mesh = this._pixelMeshes[i];
      const mat = (!this.tube.closed && i < startPx) ? this._matSkipped : this._matActive;
      mesh.material = mat;
      mesh.scale.setScalar(1);
    }
    this._savedScales.clear();

    const statusEl = document.getElementById('status-text');
    if (statusEl) statusEl.textContent = 'Pick Start Pixel — hover over tube and click a pixel | Esc to cancel';
  }

  _showDirLabel(pickedIndex) {
    this._removeDirPopup();

    // Project picked pixel 3D position to screen
    const pos3 = this._allPoints[pickedIndex].clone();
    pos3.project(this.sceneManager.camera);
    const canvas = this.sceneManager.canvas;
    const screenX = (pos3.x * 0.5 + 0.5) * canvas.clientWidth;
    const screenY = (-pos3.y * 0.5 + 0.5) * canvas.clientHeight;

    // Get canvas position on page
    const canvasRect = canvas.getBoundingClientRect();

    const popup = document.createElement('div');
    popup.style.cssText = `
      position: fixed;
      z-index: 1100;
      background: var(--bg-secondary, #16213e);
      border: 1px solid var(--accent-dim, #0097b2);
      border-radius: 8px;
      padding: 8px 14px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5), 0 0 12px rgba(0,212,255,0.15);
      font-family: var(--font-ui, sans-serif);
      color: var(--accent, #00d4ff);
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      text-align: center;
      pointer-events: none;
      white-space: nowrap;
    `;
    popup.textContent = 'Click next pixel to set direction';
    document.body.appendChild(popup);

    // Position above the picked pixel, clamped to viewport
    const rect = popup.getBoundingClientRect();
    let x = canvasRect.left + screenX - rect.width / 2;
    let y = canvasRect.top + screenY - rect.height - 20;
    if (x < 8) x = 8;
    if (x + rect.width > window.innerWidth - 8) x = window.innerWidth - rect.width - 8;
    if (y < 8) y = canvasRect.top + screenY + 20; // flip below if no room above
    popup.style.left = x + 'px';
    popup.style.top = y + 'px';

    this._dirPopup = popup;
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
    this._matDirection.dispose();
    this._matDimmed.dispose();
    this._matPicked.dispose();
    if (this._labelSprite.material.map) this._labelSprite.material.map.dispose();
    if (this._labelSprite.material) this._labelSprite.material.dispose();
  }
}
