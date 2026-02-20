import * as THREE from 'three';
import { CurveBuilder } from './CurveBuilder.js';

/**
 * Interactive mode for picking a start pixel on a tube.
 * Hover over the tube body to highlight nearest pixel; click to set startPixel.
 */
export class StartPixelPicker {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.active = false;
    this.tube = null;
    this.onPick = null;  // (tube, pixelIndex) => {}
    this.onCancel = null; // () => {}

    this._previewGroup = null;
    this._pixelMeshes = [];
    this._allPoints = [];
    this._hoveredIndex = -1;

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
      const mat = i < startPx ? this._matSkipped : this._matActive;
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

        // Position marker ring at the pixel, facing the camera
        this._marker.position.copy(this._allPoints[idx]);
        this._marker.lookAt(this.sceneManager.camera.position);
        this._marker.visible = true;

        // Position label above
        this._updateLabel(`#${idx}`);
        this._labelSprite.position.copy(this._allPoints[idx]);
        this._labelSprite.position.y += this.tube.outerRadius * 3;
        this._labelSprite.visible = true;

        const statusEl = document.getElementById('status-text');
        if (statusEl) statusEl.textContent = `Pick Start Pixel — Pixel #${idx} of ${this._allPoints.length} | Click to set, Esc to cancel`;
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

    if (this._hoveredIndex < 0) return;

    const pickedIndex = this._hoveredIndex;
    const tube = this.tube;

    this.deactivate();

    if (this.onPick) this.onPick(tube, pickedIndex);
  }

  _onKeyDown(e) {
    if (!this.active) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.deactivate();
      if (this.onCancel) this.onCancel();
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
