import * as THREE from 'three';

/**
 * Interactive edge selection mode with auto-detection of main structural rails.
 * Automatically finds the longest chains (main tubes of a truss) by detecting
 * the biggest gap in chain lengths. Short cross-braces are hidden by default.
 * User can adjust with [/] keys if needed, then Enter to confirm.
 */
export class EdgePicker {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.active = false;

    this.onConfirm = null; // (selectedChains[]) => {}
    this.onCancel = null;  // () => {}

    this._chains = [];         // { points, closed }[]
    this._lines = [];          // THREE.Line[]
    this._selected = new Set();
    this._hoveredIndex = -1;
    this._previewGroup = null;

    // Length filter state
    this._chainLengths = [];
    this._filterThreshold = 0;

    // Materials
    this._matSelected = new THREE.LineBasicMaterial({
      color: 0x00d4ff, depthTest: false, transparent: true, linewidth: 2,
    });
    this._matDeselected = new THREE.LineBasicMaterial({
      color: 0x333333, depthTest: false, transparent: true, opacity: 0.5, linewidth: 1,
    });
    this._matHover = new THREE.LineBasicMaterial({
      color: 0xffff00, depthTest: false, transparent: true, linewidth: 2,
    });

    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  /**
   * Enter edge-pick mode.
   * @param {{ points: THREE.Vector3[], closed: boolean }[]} chains
   */
  activate(chains) {
    if (this.active) this.deactivate();
    this._chains = chains;
    this.active = true;
    this._hoveredIndex = -1;

    // Compute lengths and auto-detect main rails
    this._chainLengths = chains.map(c => this._computeChainLength(c));
    this._filterThreshold = this._findAutoThreshold();

    // Debug: log chain length distribution so we can see what's happening
    const sortedDebug = [...this._chainLengths].sort((a, b) => a - b);
    console.log('[EdgePicker] Chain lengths (sorted):', sortedDebug.map(l => l.toFixed(4)));
    console.log('[EdgePicker] Auto threshold:', this._filterThreshold.toFixed(4));
    console.log('[EdgePicker] Chains above threshold:', this._chainLengths.filter(l => l >= this._filterThreshold).length);
    console.log('[EdgePicker] Chains below threshold:', this._chainLengths.filter(l => l < this._filterThreshold).length);

    // Auto-select the main rails (everything above threshold)
    this._selected = new Set();
    for (let i = 0; i < chains.length; i++) {
      if (this._chainLengths[i] >= this._filterThreshold) {
        this._selected.add(i);
      }
    }

    this._buildPreviewLines();
    this._applyFilter();

    const canvas = this.sceneManager.canvas;
    canvas.style.cursor = 'crosshair';
    canvas.addEventListener('pointermove', this._onPointerMove, true);
    canvas.addEventListener('pointerdown', this._onPointerDown, true);
    document.addEventListener('keydown', this._onKeyDown, true);

    this._updateStatus();
  }

  deactivate() {
    if (!this.active) return;
    this.active = false;
    this._cleanupPreview();

    const canvas = this.sceneManager.canvas;
    canvas.style.cursor = '';
    canvas.removeEventListener('pointermove', this._onPointerMove, true);
    canvas.removeEventListener('pointerdown', this._onPointerDown, true);
    document.removeEventListener('keydown', this._onKeyDown, true);

    this._chains = [];
    this._lines = [];
    this._selected.clear();
    this._hoveredIndex = -1;
    this._chainLengths = [];
    this._filterThreshold = 0;
  }

  // ── Length computation ──────────────────────────────────

  _computeChainLength(chain) {
    let length = 0;
    const pts = chain.points;
    for (let i = 1; i < pts.length; i++) {
      length += pts[i].distanceTo(pts[i - 1]);
    }
    if (chain.closed && pts.length > 1) {
      length += pts[pts.length - 1].distanceTo(pts[0]);
    }
    return length;
  }

  /**
   * Find the threshold that separates main rails from cross-braces.
   * Main rails are the longest chains — on a truss they're all the same length.
   * Select everything within 10% of the max length, hide the rest.
   */
  _findAutoThreshold() {
    if (this._chainLengths.length <= 1) return 0;

    const maxLen = Math.max(...this._chainLengths);
    if (maxLen === 0) return 0;

    // Threshold = 50% of max length. Generous enough for curved trusses
    // where inner rails can be significantly shorter than outer rails,
    // but still filters out short cross-braces and diagonals.
    return maxLen * 0.5;
  }

  // ── Preview lines ─────────────────────────────────────

  _buildPreviewLines() {
    this._previewGroup = new THREE.Group();
    this._previewGroup.name = '__edgePickerPreview';
    this._previewGroup.renderOrder = 999;
    this._lines = [];

    for (let i = 0; i < this._chains.length; i++) {
      const chain = this._chains[i];
      const pts = chain.closed
        ? [...chain.points, chain.points[0]]
        : chain.points;

      const geometry = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = this._selected.has(i)
        ? this._matSelected.clone()
        : this._matDeselected.clone();
      const line = new THREE.Line(geometry, mat);
      line.renderOrder = 999;
      line.userData.chainIndex = i;
      this._previewGroup.add(line);
      this._lines.push(line);
    }

    this.sceneManager.scene.add(this._previewGroup);
  }

  _updateLineColor(index) {
    const line = this._lines[index];
    if (!line) return;

    if (index === this._hoveredIndex) {
      line.material.color.set(0xffff00);
      line.material.linewidth = 2;
      line.material.opacity = 1;
    } else if (this._selected.has(index)) {
      line.material.color.set(0x00d4ff);
      line.material.linewidth = 2;
      line.material.opacity = 1;
    } else {
      line.material.color.set(0x333333);
      line.material.linewidth = 1;
      line.material.opacity = 0.5;
    }
  }

  _cleanupPreview() {
    if (!this._previewGroup) return;

    for (const line of this._lines) {
      line.geometry.dispose();
      line.material.dispose();
    }
    this._previewGroup.clear();
    this.sceneManager.scene.remove(this._previewGroup);
    this._previewGroup = null;
    this._lines = [];
  }

  // ── Length filter ───────────────────────────────────────

  _applyFilter() {
    for (let i = 0; i < this._lines.length; i++) {
      const line = this._lines[i];
      const len = this._chainLengths[i];

      if (this._filterThreshold > 0 && len < this._filterThreshold) {
        line.visible = false;
        this._selected.delete(i);
      } else {
        line.visible = true;
      }

      this._updateLineColor(i);
    }

    if (this._hoveredIndex >= 0 && !this._lines[this._hoveredIndex].visible) {
      this._hoveredIndex = -1;
    }

    this._updateStatus();
  }

  /**
   * Adjust threshold by a percentage step.
   * @param {number} direction  +1 to hide more (raise threshold), -1 to show more
   */
  _adjustFilter(direction) {
    const sorted = [...this._chainLengths].sort((a, b) => a - b);
    const maxLen = sorted[sorted.length - 1];
    if (maxLen === 0) return;

    // Step by 5% of the max length
    const step = maxLen * 0.05;
    this._filterThreshold = Math.max(0, this._filterThreshold + direction * step);

    this._applyFilter();
  }

  // ── Pointer events ────────────────────────────────────

  _onPointerMove(e) {
    if (!this.active || this._lines.length === 0) return;

    const hit = this._raycastEdge(e.clientX, e.clientY);
    const prevHover = this._hoveredIndex;

    this._hoveredIndex = hit !== null ? hit : -1;

    if (prevHover !== this._hoveredIndex) {
      if (prevHover >= 0) this._updateLineColor(prevHover);
      if (this._hoveredIndex >= 0) this._updateLineColor(this._hoveredIndex);
    }
  }

  _onPointerDown(e) {
    if (!this.active || e.button !== 0) return;

    const hit = this._raycastEdge(e.clientX, e.clientY);
    if (hit === null) return;

    e.stopPropagation();
    e.preventDefault();

    if (this._selected.has(hit)) {
      this._selected.delete(hit);
    } else {
      this._selected.add(hit);
    }

    this._updateLineColor(hit);
    this._updateStatus();
  }

  _onKeyDown(e) {
    if (!this.active) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      const selectedChains = [];
      for (const idx of this._selected) {
        selectedChains.push(this._chains[idx]);
      }
      this.deactivate();
      if (this.onConfirm) this.onConfirm(selectedChains);
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.deactivate();
      if (this.onCancel) this.onCancel();
      return;
    }

    if (e.key === ']') {
      e.preventDefault();
      this._adjustFilter(+1);
      return;
    }

    if (e.key === '[') {
      e.preventDefault();
      this._adjustFilter(-1);
      return;
    }

    if (e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      for (let i = 0; i < this._chains.length; i++) {
        if (this._lines[i].visible) this._selected.add(i);
        this._updateLineColor(i);
      }
      this._updateStatus();
      return;
    }

    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      this._selected.clear();
      for (let i = 0; i < this._chains.length; i++) {
        this._updateLineColor(i);
      }
      this._updateStatus();
      return;
    }
  }

  // ── Raycasting ────────────────────────────────────────

  _raycastEdge(clientX, clientY) {
    const rect = this.sceneManager.canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );

    const raycaster = new THREE.Raycaster();
    raycaster.params.Line.threshold = 0.02;
    raycaster.setFromCamera(mouse, this.sceneManager.camera);

    const visibleLines = this._lines.filter(l => l.visible);
    const intersects = raycaster.intersectObjects(visibleLines, false);
    if (intersects.length > 0) {
      return intersects[0].object.userData.chainIndex;
    }
    return null;
  }

  // ── Status bar ────────────────────────────────────────

  _updateStatus() {
    const statusEl = document.getElementById('status-text');
    if (!statusEl) return;

    const sel = this._selected.size;
    const visibleCount = this._lines.filter(l => l.visible).length;
    const total = this._chains.length;
    const hiddenCount = total - visibleCount;

    let msg = `Edge Pick: ${sel} main tube${sel !== 1 ? 's' : ''} selected`;
    if (hiddenCount > 0) {
      msg += ` (${hiddenCount} cross-braces hidden)`;
    }
    msg += ' — Enter confirm, Esc cancel, Click toggle, [/] adjust filter';

    statusEl.textContent = msg;
  }

  // ── Disposal ──────────────────────────────────────────

  dispose() {
    this.deactivate();
    this._matSelected.dispose();
    this._matDeselected.dispose();
    this._matHover.dispose();
  }
}
