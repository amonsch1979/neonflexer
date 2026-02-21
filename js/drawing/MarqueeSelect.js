import * as THREE from 'three';

/**
 * Rectangle marquee selection for the 3D viewport.
 * Activated with Alt+drag in select mode.
 * Projects ref model bounding box centers to screen and checks if inside rectangle.
 */
export class MarqueeSelect {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.active = false;
    this._dragging = false;
    this._startX = 0;
    this._startY = 0;

    // Callbacks
    this.onSelectionComplete = null; // (selectedModels[]) => {}

    // What to select against
    this.refModelManager = null;

    // Create overlay element
    this._overlay = document.createElement('div');
    this._overlay.className = 'marquee-overlay';

    this._rect = document.createElement('div');
    this._rect.className = 'marquee-rect';
    this._rect.style.display = 'none';
    this._overlay.appendChild(this._rect);

    // Bind handlers
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
  }

  /**
   * Activate marquee — adds the overlay to the viewport container.
   */
  activate() {
    if (this.active) return;
    this.active = true;
    const container = this.sceneManager.canvas.parentElement;
    container.appendChild(this._overlay);
    this._overlay.classList.add('active');
    this._overlay.addEventListener('pointerdown', this._onPointerDown);
  }

  /**
   * Deactivate marquee — removes the overlay.
   */
  deactivate() {
    if (!this.active) return;
    this.active = false;
    this._dragging = false;
    this._rect.style.display = 'none';
    this._overlay.classList.remove('active');
    this._overlay.removeEventListener('pointerdown', this._onPointerDown);
    document.removeEventListener('pointermove', this._onPointerMove);
    document.removeEventListener('pointerup', this._onPointerUp);
    if (this._overlay.parentElement) {
      this._overlay.parentElement.removeChild(this._overlay);
    }
  }

  _onPointerDown(e) {
    if (e.button !== 0) return;
    this._dragging = true;
    const rect = this._overlay.getBoundingClientRect();
    this._startX = e.clientX - rect.left;
    this._startY = e.clientY - rect.top;
    this._rect.style.display = 'block';
    this._rect.style.left = this._startX + 'px';
    this._rect.style.top = this._startY + 'px';
    this._rect.style.width = '0px';
    this._rect.style.height = '0px';

    document.addEventListener('pointermove', this._onPointerMove);
    document.addEventListener('pointerup', this._onPointerUp);
    e.preventDefault();
  }

  _onPointerMove(e) {
    if (!this._dragging) return;
    const rect = this._overlay.getBoundingClientRect();
    const curX = e.clientX - rect.left;
    const curY = e.clientY - rect.top;

    const x = Math.min(this._startX, curX);
    const y = Math.min(this._startY, curY);
    const w = Math.abs(curX - this._startX);
    const h = Math.abs(curY - this._startY);

    this._rect.style.left = x + 'px';
    this._rect.style.top = y + 'px';
    this._rect.style.width = w + 'px';
    this._rect.style.height = h + 'px';
  }

  _onPointerUp(e) {
    if (!this._dragging) return;
    this._dragging = false;
    document.removeEventListener('pointermove', this._onPointerMove);
    document.removeEventListener('pointerup', this._onPointerUp);

    const rect = this._overlay.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    const minX = Math.min(this._startX, endX);
    const maxX = Math.max(this._startX, endX);
    const minY = Math.min(this._startY, endY);
    const maxY = Math.max(this._startY, endY);

    this._rect.style.display = 'none';

    // Minimum drag distance to avoid accidental selection
    if (maxX - minX < 5 && maxY - minY < 5) {
      this.deactivate();
      return;
    }

    // Find ref models whose bounding box center projects inside the rectangle
    const selected = [];
    if (this.refModelManager) {
      const camera = this.sceneManager.camera;
      const canvas = this.sceneManager.canvas;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      for (const model of this.refModelManager.models) {
        if (!model.group || !model.group.visible || model.needsReimport) continue;

        const box = new THREE.Box3().setFromObject(model.group);
        const center = new THREE.Vector3();
        box.getCenter(center);

        // Project to screen coordinates
        const projected = center.clone().project(camera);
        const screenX = (projected.x * 0.5 + 0.5) * w;
        const screenY = (-projected.y * 0.5 + 0.5) * h;

        // Check if behind camera
        if (projected.z > 1) continue;

        if (screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY) {
          selected.push(model);
        }
      }
    }

    this.deactivate();
    if (this.onSelectionComplete) this.onSelectionComplete(selected);
  }
}
