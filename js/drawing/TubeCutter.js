import * as THREE from 'three';
import { CurveBuilder } from './CurveBuilder.js';

/**
 * Interactive cut tool — click on any tube body to split it.
 * Hover shows a red cut marker ring along the tube; click performs the cut.
 */
export class TubeCutter {
  constructor(sceneManager, tubeManager) {
    this.sceneManager = sceneManager;
    this.tubeManager = tubeManager;
    this.active = false;

    this.onCut = null;   // (tube, t, isClosed) => {}
    this.onCancel = null; // () => {}

    this._hoveredTube = null;
    this._hoveredT = -1;

    // Cut marker — red ring rendered on top
    this._markerGeo = new THREE.RingGeometry(0.006, 0.012, 24);
    this._markerMat = new THREE.MeshBasicMaterial({
      color: 0xff2222,
      side: THREE.DoubleSide,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    });
    this._marker = new THREE.Mesh(this._markerGeo, this._markerMat);
    this._marker.renderOrder = 999;
    this._marker.visible = false;

    // Cut line indicator (short line perpendicular to tube)
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -0.025, 0),
      new THREE.Vector3(0, 0.025, 0),
    ]);
    this._lineMat = new THREE.LineBasicMaterial({
      color: 0xff2222,
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    });
    this._cutLine = new THREE.Line(lineGeo, this._lineMat);
    this._cutLine.renderOrder = 999;
    this._cutLine.visible = false;

    // Label sprite
    this._labelSprite = this._createLabel('');
    this._labelSprite.visible = false;

    // Add to scene
    this._group = new THREE.Group();
    this._group.name = '__tubeCutterOverlay';
    this._group.add(this._marker);
    this._group.add(this._cutLine);
    this._group.add(this._labelSprite);

    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  activate() {
    if (this.active) this.deactivate();
    this.active = true;
    this._hoveredTube = null;
    this._hoveredT = -1;

    this.sceneManager.scene.add(this._group);

    const canvas = this.sceneManager.canvas;
    canvas.style.cursor = 'crosshair';
    canvas.addEventListener('pointermove', this._onPointerMove, true);
    canvas.addEventListener('pointerdown', this._onPointerDown, true);
    document.addEventListener('keydown', this._onKeyDown, true);
  }

  deactivate() {
    if (!this.active) return;
    this.active = false;

    this._marker.visible = false;
    this._cutLine.visible = false;
    this._labelSprite.visible = false;
    this.sceneManager.scene.remove(this._group);

    const canvas = this.sceneManager.canvas;
    canvas.style.cursor = '';
    canvas.removeEventListener('pointermove', this._onPointerMove, true);
    canvas.removeEventListener('pointerdown', this._onPointerDown, true);
    document.removeEventListener('keydown', this._onKeyDown, true);

    this._hoveredTube = null;
    this._hoveredT = -1;
  }

  _onPointerMove(e) {
    if (!this.active) return;

    // Raycast against all tube body meshes
    const bodyMeshes = this.tubeManager.getBodyMeshes();
    if (bodyMeshes.length === 0) {
      this._hideMarker();
      return;
    }

    const hits = this.sceneManager.raycastObjects(e.clientX, e.clientY, bodyMeshes);
    if (hits.length === 0) {
      this._hideMarker();
      return;
    }

    const hit = hits[0];
    const tube = this.tubeManager.getTubeByMesh(hit.object);
    if (!tube || !tube.isValid) {
      this._hideMarker();
      return;
    }

    // Build curve and find nearest t
    const curve = CurveBuilder.build(tube.controlPoints, tube.tension, tube.closed);
    if (!curve) {
      this._hideMarker();
      return;
    }

    const t = CurveBuilder.findNearestT(curve, hit.point);
    const curvePoint = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);

    this._hoveredTube = tube;
    this._hoveredT = t;

    // Position marker at curve point
    this._marker.position.copy(curvePoint);
    this._marker.lookAt(this.sceneManager.camera.position);
    this._marker.visible = true;

    // Scale marker to tube size
    const markerSize = Math.max(0.012, tube.outerRadius * 2.5);
    this._marker.scale.setScalar(markerSize / 0.012);

    // Position cut line perpendicular to tangent
    this._cutLine.position.copy(curvePoint);
    // Orient line perpendicular to tangent
    const up = new THREE.Vector3(0, 1, 0);
    const cross = new THREE.Vector3().crossVectors(tangent, up).normalize();
    if (cross.length() < 0.01) {
      cross.set(1, 0, 0);
    }
    const lineLen = Math.max(0.02, tube.outerRadius * 3);
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      cross.clone().multiplyScalar(-lineLen),
      cross.clone().multiplyScalar(lineLen),
    ]);
    this._cutLine.geometry.dispose();
    this._cutLine.geometry = lineGeo;
    this._cutLine.visible = true;

    // Label with piece lengths
    const pct = (t * 100).toFixed(0);
    let label, statusText;
    if (tube.closed) {
      label = `Cut (open) ${pct}%`;
      statusText = `Cut Tool — Click to open the tube at ${pct}% | Esc to exit`;
    } else {
      const totalLength = CurveBuilder.getLength(curve);
      const lengthA = Math.round(totalLength * t * 1000);
      const lengthB = Math.round(totalLength * (1 - t) * 1000);
      label = `Cut ${pct}% — ${lengthA}mm | ${lengthB}mm`;
      statusText = `Cut Tool — Click to split: ${lengthA}mm | ${lengthB}mm (${pct}%) | Esc to exit`;
    }
    this._updateLabel(label);
    this._labelSprite.position.copy(curvePoint);
    this._labelSprite.position.y += tube.outerRadius * 4 + 0.02;
    this._labelSprite.visible = true;

    // Status bar
    const statusEl = document.getElementById('status-text');
    if (statusEl) {
      statusEl.textContent = statusText;
    }
  }

  _onPointerDown(e) {
    if (!this.active || e.button !== 0) return;

    e.stopPropagation();
    e.preventDefault();

    if (!this._hoveredTube || this._hoveredT < 0) return;

    const tube = this._hoveredTube;
    const t = this._hoveredT;
    const isClosed = tube.closed;

    // Reset hover state (tube may be deleted after cut)
    this._hoveredTube = null;
    this._hoveredT = -1;
    this._hideMarker();

    if (this.onCut) this.onCut(tube, t, isClosed);
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

  _hideMarker() {
    this._marker.visible = false;
    this._cutLine.visible = false;
    this._labelSprite.visible = false;
    this._hoveredTube = null;
    this._hoveredT = -1;
  }

  /**
   * Find the nearest curve parameter t for a world point.
   * Two-pass: coarse (200 samples) then refine (40 samples around best).
   */
  _findNearestT(curve, worldPoint) {
    const COARSE = 200;
    let bestT = 0;
    let bestDist = Infinity;

    // Coarse pass
    for (let i = 0; i <= COARSE; i++) {
      const t = i / COARSE;
      const pt = curve.getPointAt(t);
      const d = worldPoint.distanceToSquared(pt);
      if (d < bestDist) {
        bestDist = d;
        bestT = t;
      }
    }

    // Refine pass around best
    const FINE = 40;
    const range = 1 / COARSE;
    const tMin = Math.max(0, bestT - range);
    const tMax = Math.min(1, bestT + range);

    for (let i = 0; i <= FINE; i++) {
      const t = tMin + (tMax - tMin) * (i / FINE);
      const pt = curve.getPointAt(t);
      const d = worldPoint.distanceToSquared(pt);
      if (d < bestDist) {
        bestDist = d;
        bestT = t;
      }
    }

    // Clamp away from exact endpoints to avoid degenerate splits
    return Math.max(0.005, Math.min(0.995, bestT));
  }

  // ── Label sprite ──────────────────────────────────────

  _createLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
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
    sprite.scale.set(0.24, 0.03, 1);
    return sprite;
  }

  _updateLabel(text) {
    const ctx = this._labelCtx;
    const canvas = this._labelCanvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 8);
    ctx.fill();

    ctx.fillStyle = '#ff4444';
    // Scale font to fit longer text
    const fontSize = text.length > 30 ? 20 : text.length > 20 ? 24 : 28;
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    this._labelSprite.material.map.needsUpdate = true;
  }

  dispose() {
    this.deactivate();
    this._markerGeo.dispose();
    this._markerMat.dispose();
    this._lineMat.dispose();
    this._cutLine.geometry.dispose();
    if (this._labelSprite.material.map) this._labelSprite.material.map.dispose();
    if (this._labelSprite.material) this._labelSprite.material.dispose();
  }
}
