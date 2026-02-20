import { CurveBuilder } from '../drawing/CurveBuilder.js';

/**
 * Left-side tube list panel.
 * Shows all tubes with select, visibility toggle, and delete.
 */
export class TubeListPanel {
  constructor(containerEl) {
    this.container = containerEl;
    this.tubes = [];
    this.selectedTubeId = null;

    this.onSelectTube = null;    // (tubeId) => {}
    this.onDeleteTube = null;    // (tubeId) => {}
    this.onToggleVisible = null; // (tubeId) => {}

    this._showEmpty();
  }

  /**
   * Refresh the list with current tubes.
   * @param {import('../tube/TubeModel.js').TubeModel[]} tubes
   * @param {number|null} selectedId
   */
  refresh(tubes, selectedId) {
    this.tubes = tubes;
    this.selectedTubeId = selectedId;

    if (tubes.length === 0) {
      this._showEmpty();
      return;
    }

    this.container.innerHTML = '';

    for (const tube of tubes) {
      const item = document.createElement('div');
      item.className = 'tube-item' + (tube.id === selectedId ? ' selected' : '');
      item.dataset.tubeId = tube.id;

      // Color dot
      const dot = document.createElement('div');
      dot.className = 'tube-color';
      dot.style.backgroundColor = tube.color;
      item.appendChild(dot);

      // Name
      const name = document.createElement('span');
      name.className = 'tube-name';
      name.textContent = tube.name;
      item.appendChild(name);

      // Length
      const lengthMm = this._getTubeLength(tube);
      const info = document.createElement('span');
      info.style.fontSize = '10px';
      info.style.color = 'var(--text-muted)';
      info.style.marginRight = '4px';
      info.style.flexShrink = '0';
      info.textContent = `${lengthMm}mm`;
      item.appendChild(info);

      // Action buttons
      const actions = document.createElement('div');
      actions.className = 'tube-actions';

      // Visibility toggle
      const visBtn = document.createElement('button');
      visBtn.className = 'tube-action-btn';
      visBtn.title = tube.visible ? 'Hide' : 'Show';
      visBtn.innerHTML = tube.visible
        ? `<svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 3C3 3 1 8 1 8s2 5 7 5 7-5 7-5-2-5-7-5zm0 8a3 3 0 110-6 3 3 0 010 6z" fill="currentColor"/></svg>`
        : `<svg viewBox="0 0 16 16" width="14" height="14"><path d="M2 2l12 12M8 3C3 3 1 8 1 8s.8 2 3 3.5m3 1.5c4 0 7-5 7-5s-.8-2-3-3.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
      visBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onToggleVisible) this.onToggleVisible(tube.id);
      });
      actions.appendChild(visBtn);

      // Delete button
      const delBtn = document.createElement('button');
      delBtn.className = 'tube-action-btn delete';
      delBtn.title = 'Delete';
      delBtn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5"/></svg>`;
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onDeleteTube) this.onDeleteTube(tube.id);
      });
      actions.appendChild(delBtn);

      item.appendChild(actions);

      // Click to select
      item.addEventListener('click', () => {
        if (this.onSelectTube) this.onSelectTube(tube.id);
      });

      this.container.appendChild(item);
    }
  }

  _getTubeLength(tube) {
    if (!tube.isValid) return 0;
    const curve = CurveBuilder.build(tube.controlPoints, tube.tension, tube.closed);
    if (!curve) return 0;
    return Math.round(CurveBuilder.getLength(curve) * 1000);
  }

  _showEmpty() {
    this.container.innerHTML = '<div class="empty-message">No tubes yet.<br>Use Click Place tool to draw.</div>';
  }
}
