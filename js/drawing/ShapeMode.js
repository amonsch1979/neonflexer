import * as THREE from 'three';

/**
 * Shape drawing mode — generates closed tubes from 2-click interactions.
 * Supports 'rectangle' (corner-to-corner) and 'circle' (center-to-edge).
 */
export class ShapeMode {
  constructor(sceneManager, shapeType) {
    this.sceneManager = sceneManager;
    this.shapeType = shapeType; // 'rectangle' | 'circle'
    this.active = false;
    this.snapEnabled = true;
    this.gridSize = 0.01;

    this._anchor = null;       // first click point
    this._previewLine = null;
    this._anchorMarker = null;

    this.onComplete = null;    // (points, options) => {}

    this._onPointerMove = this._onMouseMove.bind(this);
    this._onPointerDown = this._onMouseDown.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  activate() {
    this.active = true;
    this._anchor = null;
    this._clearVisuals();
    this.sceneManager.resetPlaneAnchor();
    const canvas = this.sceneManager.canvas;
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerdown', this._onPointerDown);
    document.addEventListener('keydown', this._onKeyDown);
    canvas.style.cursor = 'crosshair';
  }

  deactivate() {
    this.active = false;
    this._anchor = null;
    this._clearVisuals();
    const canvas = this.sceneManager.canvas;
    canvas.removeEventListener('pointermove', this._onPointerMove);
    canvas.removeEventListener('pointerdown', this._onPointerDown);
    document.removeEventListener('keydown', this._onKeyDown);
    canvas.style.cursor = '';
  }

  // ── Mouse handlers ─────────────────────────────────

  _onMouseDown(e) {
    if (!this.active || e.button !== 0) return;
    if (e.detail > 1) return; // ignore double-click

    const point = this._getPlanePoint(e);
    if (!point) return;

    if (!this._anchor) {
      // First click — set anchor
      this._anchor = point.clone();
      this._showAnchorMarker(point);
      this._updateStatus('first');
    } else {
      // Second click — generate shape and complete
      const shapePoints = this._generatePoints(this._anchor, point);
      if (shapePoints.length >= 3) {
        this._clearVisuals();
        this._anchor = null;
        if (this.onComplete) {
          this.onComplete(shapePoints, { closed: true });
        }
      }
    }
  }

  _onMouseMove(e) {
    if (!this.active) return;

    const point = this._getPlanePoint(e);
    if (!point) return;

    // Update coords display
    const coordsEl = document.getElementById('status-coords');
    if (coordsEl) coordsEl.textContent = this.sceneManager.formatCoords(point);

    // Show live preview after first click
    if (this._anchor) {
      const previewPoints = this._generatePoints(this._anchor, point);
      this._updatePreview(previewPoints);
      this._updateStatusSize(this._anchor, point);
    }
  }

  _onKeyDown(e) {
    if (!this.active) return;
    if (e.key === 'Escape') {
      this._cancel();
    }
  }

  // ── Point generation ───────────────────────────────

  _generatePoints(p1, p2) {
    if (this.shapeType === 'rectangle') {
      return this._generateRectangle(p1, p2);
    } else {
      return this._generateCircle(p1, p2);
    }
  }

  /**
   * Rectangle: p1 and p2 are opposite corners on the active plane.
   * Generates 40 evenly-spaced points (10 per edge).
   */
  _generateRectangle(corner1, corner2) {
    const plane = this.sceneManager.currentPlane;
    const points = [];

    // Compute 4 corners from the diagonal
    // corner1 = (a1, b1), corner2 = (a2, b2) on the active plane axes
    const c1 = corner1.clone();
    const c2 = corner2.clone();
    const c3 = corner1.clone(); // same off-plane as c1
    const c4 = corner1.clone();

    switch (plane) {
      case 'XZ':
        // Active axes: x, z | Locked: y
        c3.x = corner2.x; c3.z = corner1.z;
        c4.x = corner1.x; c4.z = corner2.z;
        break;
      case 'XY':
        // Active axes: x, y | Locked: z
        c3.x = corner2.x; c3.y = corner1.y;
        c4.x = corner1.x; c4.y = corner2.y;
        break;
      case 'YZ':
        // Active axes: y, z | Locked: x
        c3.y = corner2.y; c3.z = corner1.z;
        c4.y = corner1.y; c4.z = corner2.z;
        break;
    }

    // Corners in order: c1 → c3 → c2 → c4 (perimeter loop)
    const corners = [c1, c3, c2, c4];
    const pointsPerEdge = 10;

    for (let edge = 0; edge < 4; edge++) {
      const from = corners[edge];
      const to = corners[(edge + 1) % 4];
      for (let i = 0; i < pointsPerEdge; i++) {
        const t = i / pointsPerEdge;
        points.push(new THREE.Vector3().lerpVectors(from, to, t));
      }
    }

    return points; // 40 points total
  }

  /**
   * Circle: p1 = center, p2 = edge point.
   * Generates 36 evenly-spaced points (every 10°).
   */
  _generateCircle(center, edgePoint) {
    const plane = this.sceneManager.currentPlane;
    const points = [];
    const numPoints = 36;

    // Get radius in the active plane
    let dx, dy, radius;
    switch (plane) {
      case 'XZ':
        dx = edgePoint.x - center.x;
        dy = edgePoint.z - center.z;
        break;
      case 'XY':
        dx = edgePoint.x - center.x;
        dy = edgePoint.y - center.y;
        break;
      case 'YZ':
        dx = edgePoint.y - center.y;
        dy = edgePoint.z - center.z;
        break;
    }
    radius = Math.sqrt(dx * dx + dy * dy);
    if (radius < 0.001) return []; // too small

    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const a = Math.cos(angle) * radius;
      const b = Math.sin(angle) * radius;
      const pt = center.clone();

      switch (plane) {
        case 'XZ': pt.x += a; pt.z += b; break;
        case 'XY': pt.x += a; pt.y += b; break;
        case 'YZ': pt.y += a; pt.z += b; break;
      }
      points.push(pt);
    }

    return points;
  }

  // ── Helpers ────────────────────────────────────────

  _getPlanePoint(e) {
    let point = this.sceneManager.raycastDrawingPlane(e.clientX, e.clientY);
    if (!point) return null;
    this.sceneManager.constrainToPlane(point);
    if (this.snapEnabled) {
      point = this.sceneManager.snapToGrid(point, this.gridSize);
      this.sceneManager.constrainToPlane(point);
    }
    this.sceneManager.clampToGrid(point);
    return point;
  }

  // ── Visuals ────────────────────────────────────────

  _showAnchorMarker(point) {
    this._clearAnchorMarker();
    this._anchorMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.005, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x00d4ff })
    );
    this._anchorMarker.position.copy(point);
    this._anchorMarker.name = '__shape_anchor';
    this.sceneManager.scene.add(this._anchorMarker);
  }

  _updatePreview(points) {
    this._clearPreviewLine();
    if (points.length < 2) return;

    // Close the loop for preview
    const loopPoints = [...points, points[0]];
    const geo = new THREE.BufferGeometry().setFromPoints(loopPoints);
    const mat = new THREE.LineBasicMaterial({ color: 0x00d4ff, linewidth: 1 });
    this._previewLine = new THREE.Line(geo, mat);
    this._previewLine.name = '__shape_preview';
    this.sceneManager.scene.add(this._previewLine);
  }

  _clearPreviewLine() {
    if (this._previewLine) {
      this.sceneManager.scene.remove(this._previewLine);
      this._previewLine.geometry.dispose();
      this._previewLine.material.dispose();
      this._previewLine = null;
    }
  }

  _clearAnchorMarker() {
    if (this._anchorMarker) {
      this.sceneManager.scene.remove(this._anchorMarker);
      this._anchorMarker.geometry.dispose();
      this._anchorMarker.material.dispose();
      this._anchorMarker = null;
    }
  }

  _clearVisuals() {
    this._clearPreviewLine();
    this._clearAnchorMarker();
  }

  _cancel() {
    this._clearVisuals();
    this._anchor = null;
    const statusEl = document.getElementById('status-text');
    if (statusEl) statusEl.textContent = 'Shape cancelled.';
  }

  _updateStatus(phase) {
    const statusEl = document.getElementById('status-text');
    if (!statusEl) return;
    if (this.shapeType === 'rectangle') {
      statusEl.textContent = 'Rectangle — Click second corner to finish | Esc cancel';
    } else {
      statusEl.textContent = 'Circle — Click edge to set radius | Esc cancel';
    }
  }

  _updateStatusSize(p1, p2) {
    const statusEl = document.getElementById('status-text');
    if (!statusEl) return;
    const plane = this.sceneManager.currentPlane;

    if (this.shapeType === 'rectangle') {
      let w, h;
      switch (plane) {
        case 'XZ': w = Math.abs(p2.x - p1.x); h = Math.abs(p2.z - p1.z); break;
        case 'XY': w = Math.abs(p2.x - p1.x); h = Math.abs(p2.y - p1.y); break;
        case 'YZ': w = Math.abs(p2.y - p1.y); h = Math.abs(p2.z - p1.z); break;
      }
      statusEl.textContent = `Rectangle ${(w * 1000).toFixed(0)}×${(h * 1000).toFixed(0)}mm — Click to finish | Esc cancel`;
    } else {
      let dx, dy;
      switch (plane) {
        case 'XZ': dx = p2.x - p1.x; dy = p2.z - p1.z; break;
        case 'XY': dx = p2.x - p1.x; dy = p2.y - p1.y; break;
        case 'YZ': dx = p2.y - p1.y; dy = p2.z - p1.z; break;
      }
      const radius = Math.sqrt(dx * dx + dy * dy);
      statusEl.textContent = `Circle R=${(radius * 1000).toFixed(0)}mm — Click to finish | Esc cancel`;
    }
  }
}
