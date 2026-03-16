/**
 * Floating panel for DWG entity management.
 * Shows imported DWG entities as a list, allows selection & conversion to tubes.
 */
export class DWGImportDialog {
  constructor() {
    this.onConvertSelected = null; // (selectedIndices: number[]) => {}
    this.onConvertAll = null;      // () => {}
    this.onClear = null;           // () => {}
    this.onScaleChange = null;     // (scale: number) => {}
    this.onEntityHover = null;     // (index: number|null) => {}
    this.onEntityToggle = null;    // (index: number) => {}
    this._panel = null;
    this._rows = [];               // DOM elements for each entity row
    this._selectedSet = new Set();
    this._entityCount = 0;
  }

  /**
   * Show the floating panel with entity list.
   * @param {object} info
   * @param {string} info.fileName
   * @param {Array} info.entities - [{ name, layer, closed, pointCount }]
   * @param {object} info.entityCounts - type → count
   */
  show(info) {
    this.hide();
    this._entityCount = info.entities.length;
    this._selectedSet.clear();
    this._rows = [];

    const panel = document.createElement('div');
    panel.style.cssText = `
      position: fixed; top: 80px; right: 12px;
      background: #1e1e1e; color: #ccc; border-radius: 8px;
      padding: 12px; width: 280px; max-height: calc(100vh - 120px);
      box-shadow: 0 4px 20px rgba(0,0,0,0.6); z-index: 9000;
      font-family: sans-serif; font-size: 12px;
      display: flex; flex-direction: column; overflow: hidden;
    `;
    this._panel = panel;

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;';
    const title = document.createElement('div');
    title.textContent = 'DWG Import';
    title.style.cssText = 'font-size: 14px; font-weight: 600; color: #fff;';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '\u00d7';
    closeBtn.style.cssText = 'background: none; border: none; color: #888; font-size: 18px; cursor: pointer; padding: 0 4px;';
    closeBtn.addEventListener('click', () => { if (this.onClear) this.onClear(); });
    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // File name
    const fileLabel = document.createElement('div');
    fileLabel.textContent = info.fileName;
    fileLabel.style.cssText = 'color: #666; margin-bottom: 8px; font-size: 11px;';
    panel.appendChild(fileLabel);

    // Scale selector
    const scaleRow = document.createElement('div');
    scaleRow.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-bottom: 10px;';
    const scaleLabel = document.createElement('span');
    scaleLabel.textContent = 'Scale:';
    scaleLabel.style.color = '#aaa';
    const scaleSelect = document.createElement('select');
    scaleSelect.className = 'prop-input';
    scaleSelect.style.cssText = 'flex: 1; height: 24px; font-size: 11px;';
    for (const [val, label] of [
      ['0.001', 'Millimeters (mm)'],
      ['0.01', 'Centimeters (cm)'],
      ['1', 'Meters (m)'],
      ['0.0254', 'Inches (in)'],
      ['0.3048', 'Feet (ft)'],
    ]) {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = label;
      scaleSelect.appendChild(o);
    }
    scaleSelect.value = '0.001';
    scaleSelect.addEventListener('change', () => {
      if (this.onScaleChange) this.onScaleChange(parseFloat(scaleSelect.value));
    });
    scaleRow.appendChild(scaleLabel);
    scaleRow.appendChild(scaleSelect);
    panel.appendChild(scaleRow);

    // Selection count
    this._countLabel = document.createElement('div');
    this._countLabel.style.cssText = 'color: #888; margin-bottom: 6px; font-size: 11px;';
    this._updateCountLabel();
    panel.appendChild(this._countLabel);

    // Select all / deselect all
    const selRow = document.createElement('div');
    selRow.style.cssText = 'display: flex; gap: 6px; margin-bottom: 8px;';
    const selAllBtn = this._makeSmallBtn('Select All');
    selAllBtn.addEventListener('click', () => {
      for (let i = 0; i < this._entityCount; i++) this._selectedSet.add(i);
      this._refreshAllRows();
      this._updateCountLabel();
    });
    const deselBtn = this._makeSmallBtn('Deselect All');
    deselBtn.addEventListener('click', () => {
      this._selectedSet.clear();
      this._refreshAllRows();
      this._updateCountLabel();
    });
    selRow.appendChild(selAllBtn);
    selRow.appendChild(deselBtn);
    panel.appendChild(selRow);

    // Entity list (scrollable)
    const listContainer = document.createElement('div');
    listContainer.style.cssText = 'flex: 1; overflow-y: auto; margin-bottom: 10px; min-height: 100px;';

    // Group entities by layer
    const byLayer = new Map();
    info.entities.forEach((ent, idx) => {
      const layer = ent.layer || '0';
      if (!byLayer.has(layer)) byLayer.set(layer, []);
      byLayer.get(layer).push({ ...ent, index: idx });
    });

    // Layer colors for visual distinction
    const layerColors = ['#5af', '#fa5', '#5f5', '#f5a', '#af5', '#5ff', '#ff5', '#a5f'];
    let layerIdx = 0;

    for (const [layerName, ents] of byLayer) {
      const color = layerColors[layerIdx++ % layerColors.length];

      // Layer header
      const layerHeader = document.createElement('div');
      layerHeader.style.cssText = `font-weight: 600; color: ${color}; margin: 4px 0 2px 0; font-size: 11px;`;
      layerHeader.textContent = `Layer: ${layerName} (${ents.length})`;
      listContainer.appendChild(layerHeader);

      for (const ent of ents) {
        const row = document.createElement('div');
        row.style.cssText = `
          display: flex; align-items: center; gap: 4px; padding: 3px 6px;
          margin-left: 4px; cursor: pointer; border-radius: 3px;
          border-left: 3px solid ${color};
        `;
        row.dataset.index = ent.index;

        const label = document.createElement('span');
        label.style.cssText = 'flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
        const ptCount = ent.pointCount || 0;
        const closedTag = ent.closed ? ' [closed]' : '';
        label.textContent = `${ent.name}${closedTag} (${ptCount} pts)`;
        row.appendChild(label);

        row.addEventListener('click', (ev) => {
          const idx = parseInt(row.dataset.index);
          if (ev.shiftKey || ev.ctrlKey) {
            // Toggle this one
            if (this._selectedSet.has(idx)) this._selectedSet.delete(idx);
            else this._selectedSet.add(idx);
          } else {
            // Single select
            this._selectedSet.clear();
            this._selectedSet.add(idx);
          }
          this._refreshAllRows();
          this._updateCountLabel();
          if (this.onEntityToggle) this.onEntityToggle(idx);
        });

        row.addEventListener('mouseenter', () => {
          if (this.onEntityHover) this.onEntityHover(ent.index);
        });
        row.addEventListener('mouseleave', () => {
          if (this.onEntityHover) this.onEntityHover(null);
        });

        this._rows[ent.index] = row;
        listContainer.appendChild(row);
      }
    }
    panel.appendChild(listContainer);

    // Action buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 6px; flex-wrap: wrap;';

    const convertSelBtn = document.createElement('button');
    convertSelBtn.textContent = 'Convert Selected';
    convertSelBtn.style.cssText = 'flex: 1; padding: 6px 8px; background: #2a6; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600;';
    convertSelBtn.addEventListener('click', () => {
      if (this._selectedSet.size === 0) return;
      if (this.onConvertSelected) this.onConvertSelected([...this._selectedSet]);
    });

    const convertAllBtn = document.createElement('button');
    convertAllBtn.textContent = 'Convert All';
    convertAllBtn.style.cssText = 'flex: 1; padding: 6px 8px; background: #36a; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600;';
    convertAllBtn.addEventListener('click', () => {
      if (this.onConvertAll) this.onConvertAll();
    });

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear DWG';
    clearBtn.style.cssText = 'flex: 1; padding: 6px 8px; background: #533; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;';
    clearBtn.addEventListener('click', () => {
      if (this.onClear) this.onClear();
    });

    btnRow.appendChild(convertSelBtn);
    btnRow.appendChild(convertAllBtn);
    btnRow.appendChild(clearBtn);
    panel.appendChild(btnRow);

    // Hint
    const hint = document.createElement('div');
    hint.style.cssText = 'color: #555; font-size: 10px; margin-top: 6px;';
    hint.textContent = 'Click lines in viewport or list to select. Shift/Ctrl+click for multi-select.';
    panel.appendChild(hint);

    document.body.appendChild(panel);
  }

  hide() {
    if (this._panel) {
      this._panel.remove();
      this._panel = null;
    }
    this._rows = [];
    this._selectedSet.clear();
  }

  get isVisible() {
    return !!this._panel;
  }

  /** Update which entities are selected (called from viewport click) */
  setSelection(selectedSet) {
    this._selectedSet = new Set(selectedSet);
    this._refreshAllRows();
    this._updateCountLabel();
  }

  /** Remove converted entities from the list */
  removeEntities(indices) {
    for (const idx of indices) {
      this._selectedSet.delete(idx);
      if (this._rows[idx]) {
        this._rows[idx].style.display = 'none';
      }
    }
    this._entityCount -= indices.length;
    this._updateCountLabel();
    // If no entities left, close panel
    if (this._entityCount <= 0 && this.onClear) this.onClear();
  }

  _refreshAllRows() {
    for (let i = 0; i < this._rows.length; i++) {
      const row = this._rows[i];
      if (!row || row.style.display === 'none') continue;
      if (this._selectedSet.has(i)) {
        row.style.background = 'rgba(34,170,102,0.25)';
        row.style.color = '#fff';
      } else {
        row.style.background = '';
        row.style.color = '#ccc';
      }
    }
  }

  _updateCountLabel() {
    if (this._countLabel) {
      this._countLabel.textContent = `${this._entityCount} entities \u2022 ${this._selectedSet.size} selected`;
    }
  }

  _makeSmallBtn(text) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = 'padding: 3px 8px; background: #333; color: #aaa; border: 1px solid #555; border-radius: 3px; cursor: pointer; font-size: 10px;';
    return btn;
  }
}
