import { CurveBuilder } from '../drawing/CurveBuilder.js';

/**
 * Left-side tube list panel.
 * Shows all tubes with select, visibility toggle, and delete.
 * Also shows reference models section.
 */
export class TubeListPanel {
  constructor(containerEl) {
    this.container = containerEl;
    this.tubes = [];
    this.selectedTubeId = null;
    this.refModels = [];
    this.selectedRefId = null;

    this.onSelectTube = null;    // (tubeId) => {}
    this.onMultiSelectTube = null; // (tubeId) => {}
    this.onDeleteTube = null;    // (tubeId) => {}
    this.onToggleVisible = null; // (tubeId) => {}

    this.onSelectRefModel = null;    // (refId) => {}
    this.onDeleteRefModel = null;    // (refId) => {}
    this.onToggleRefVisible = null;  // (refId) => {}
    this.onReimportRefModel = null;  // (refId) => {}

    this._showEmpty();
  }

  /**
   * Refresh the list with current tubes and ref models.
   * @param {import('../tube/TubeModel.js').TubeModel[]} tubes
   * @param {number|null} selectedId
   * @param {import('../ref/ReferenceModel.js').ReferenceModel[]} [refModels]
   * @param {number|null} [selectedRefId]
   * @param {Set<number>} [selectedIds] - multi-selected tube IDs
   */
  refresh(tubes, selectedId, refModels, selectedRefId, selectedIds) {
    this.tubes = tubes;
    this.selectedTubeId = selectedId;
    this.refModels = refModels || [];
    this.selectedRefId = selectedRefId || null;
    this._selectedIds = selectedIds || new Set();

    if (tubes.length === 0 && this.refModels.length === 0) {
      this._showEmpty();
      return;
    }

    this.container.innerHTML = '';

    // Tubes section
    if (tubes.length > 0) {
      const tubeHeader = document.createElement('div');
      tubeHeader.className = 'list-section-header';
      tubeHeader.textContent = 'Tubes';
      this.container.appendChild(tubeHeader);

      for (const tube of tubes) {
        this.container.appendChild(this._buildTubeItem(tube, selectedId));
      }
    }

    // Reference Models section
    if (this.refModels.length > 0) {
      const refHeader = document.createElement('div');
      refHeader.className = 'list-section-header ref-section-header';
      refHeader.textContent = 'Reference Models';
      this.container.appendChild(refHeader);

      for (const ref of this.refModels) {
        this.container.appendChild(this._buildRefItem(ref, this.selectedRefId));
      }
    }
  }

  _buildTubeItem(tube, selectedId) {
    const isMultiSelected = this._selectedIds && this._selectedIds.has(tube.id);
    const item = document.createElement('div');
    let cls = 'tube-item';
    if (tube.id === selectedId) cls += ' selected';
    if (isMultiSelected) cls += ' multi-selected';
    if (tube.groupId) cls += ' grouped';
    item.className = cls;
    item.dataset.tubeId = tube.id;

    // Group colored left border
    if (tube.groupId) {
      const groupColors = ['#ff44aa', '#44ff88', '#ffaa44', '#aa44ff', '#44aaff', '#ff8844', '#88ff44', '#44ffcc'];
      item.style.borderLeftColor = groupColors[(tube.groupId - 1) % groupColors.length];
    }

    // Color dot
    const dot = document.createElement('div');
    dot.className = 'tube-color';
    dot.style.backgroundColor = tube.color;
    item.appendChild(dot);

    // Group badge
    if (tube.groupId) {
      const badge = document.createElement('span');
      badge.className = 'tube-group-badge';
      badge.title = `Group ${tube.groupId}`;
      badge.innerHTML = `<svg viewBox="0 0 16 16" width="10" height="10"><path d="M8 1.5a2.5 2.5 0 00-2.45 2H4a2 2 0 00-2 2v1a2 2 0 002 2h1.55a2.5 2.5 0 004.9 0H12a2 2 0 002-2v-1a2 2 0 00-2-2h-1.55A2.5 2.5 0 008 1.5z" fill="currentColor"/></svg>`;
      item.appendChild(badge);
    }

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

    // Click to select (Ctrl+click or Shift+click for multi-select)
    item.addEventListener('click', (e) => {
      if ((e.ctrlKey || e.metaKey || e.shiftKey) && this.onMultiSelectTube) {
        this.onMultiSelectTube(tube.id);
      } else if (this.onSelectTube) {
        this.onSelectTube(tube.id);
      }
    });

    return item;
  }

  _buildRefItem(ref, selectedRefId) {
    const item = document.createElement('div');
    const isGhost = ref.needsReimport;
    item.className = 'ref-item' + (ref.id === selectedRefId ? ' selected' : '') + (isGhost ? ' ghost' : '');
    item.dataset.refId = ref.id;

    // Cube icon
    const icon = document.createElement('div');
    icon.className = 'ref-icon';
    icon.innerHTML = `<svg viewBox="0 0 16 16" width="12" height="12"><path d="M14 11V5l-6-3.5L2 5v6l6 3.5L14 11z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M2 5l6 3.5L14 5M8 8.5V14.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>`;
    item.appendChild(icon);

    // Name
    const name = document.createElement('span');
    name.className = 'ref-name';
    name.textContent = ref.name;
    item.appendChild(name);

    // Ghost hint
    if (isGhost) {
      const hint = document.createElement('span');
      hint.className = 'ref-ghost-hint';
      hint.textContent = 'reimport';
      hint.title = 'Click to reimport this model file';
      hint.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onReimportRefModel) this.onReimportRefModel(ref.id);
      });
      item.appendChild(hint);
    }

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'tube-actions';

    // Visibility toggle (only for non-ghost)
    if (!isGhost) {
      const visBtn = document.createElement('button');
      visBtn.className = 'tube-action-btn';
      visBtn.title = ref.visible ? 'Hide' : 'Show';
      visBtn.innerHTML = ref.visible
        ? `<svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 3C3 3 1 8 1 8s2 5 7 5 7-5 7-5-2-5-7-5zm0 8a3 3 0 110-6 3 3 0 010 6z" fill="currentColor"/></svg>`
        : `<svg viewBox="0 0 16 16" width="14" height="14"><path d="M2 2l12 12M8 3C3 3 1 8 1 8s.8 2 3 3.5m3 1.5c4 0 7-5 7-5s-.8-2-3-3.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
      visBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onToggleRefVisible) this.onToggleRefVisible(ref.id);
      });
      actions.appendChild(visBtn);
    }

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'tube-action-btn delete';
    delBtn.title = 'Delete';
    delBtn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5"/></svg>`;
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onDeleteRefModel) this.onDeleteRefModel(ref.id);
    });
    actions.appendChild(delBtn);

    item.appendChild(actions);

    // Click to select (or reimport if ghost)
    item.addEventListener('click', () => {
      if (isGhost) {
        if (this.onReimportRefModel) this.onReimportRefModel(ref.id);
      } else {
        if (this.onSelectRefModel) this.onSelectRefModel(ref.id);
      }
    });

    return item;
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
