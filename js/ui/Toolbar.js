/**
 * Drawing tool toolbar with mode buttons.
 */
export class Toolbar {
  constructor(containerEl) {
    this.container = containerEl;
    this.currentTool = 'select';
    this.currentPlane = 'XZ';
    this.snapEnabled = true;
    this.onToolChange = null;     // (toolName) => {}
    this.onSnapToggle = null;     // (enabled) => {}
    this.onPlaneChange = null;    // (plane) => {}
    this.onExport = null;         // () => {}
    this.onDeleteTube = null;     // () => {}

    this._build();
  }

  _build() {
    this.container.innerHTML = '';

    // Drawing tools group
    const drawGroup = this._createGroup();
    this.selectBtn = this._addButton(drawGroup, 'select', 'Select (1)', this._selectIcon());
    this.clickPlaceBtn = this._addButton(drawGroup, 'click-place', 'Click Place (2)', this._clickPlaceIcon());
    this.freehandBtn = this._addButton(drawGroup, 'freehand', 'Freehand (3)', this._freehandIcon());
    this.container.appendChild(drawGroup);

    // Edit group
    const editGroup = this._createGroup();
    this.deleteBtn = this._addButton(editGroup, 'delete-tube', 'Delete Tube (Del)', this._deleteIcon());
    this.deleteBtn.classList.remove('active');
    this.container.appendChild(editGroup);

    // Options group
    const optGroup = this._createGroup();
    this.snapBtn = this._addButton(optGroup, 'snap', 'Grid Snap (G)', this._snapIcon());
    this.snapBtn.classList.toggle('active', this.snapEnabled);
    this.container.appendChild(optGroup);

    // Drawing plane group
    const planeGroup = this._createGroup();
    const planeLabel = document.createElement('span');
    planeLabel.className = 'toolbar-label';
    planeLabel.textContent = 'Plane:';
    planeGroup.appendChild(planeLabel);
    this.xzBtn = this._addButton(planeGroup, 'plane-XZ', 'Ground XZ (F1)', this._planeXZIcon());
    this.xyBtn = this._addButton(planeGroup, 'plane-XY', 'Front XY (F2)', this._planeXYIcon());
    this.yzBtn = this._addButton(planeGroup, 'plane-YZ', 'Side YZ (F3)', this._planeYZIcon());
    this._setPlaneActive('XZ');
    this.container.appendChild(planeGroup);

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    this.container.appendChild(spacer);

    // Export group
    const exportGroup = this._createGroup();
    this.exportBtn = this._addButton(exportGroup, 'export', 'Export GLB (Ctrl+E)', this._exportIcon());
    this.exportBtn.classList.remove('active');
    this.container.appendChild(exportGroup);

    // Label
    const label = document.createElement('span');
    label.className = 'toolbar-label';
    label.textContent = 'NeonFlex Designer';
    this.container.appendChild(label);

    // Set initial active
    this._setActive('select');
  }

  _createGroup() {
    const div = document.createElement('div');
    div.className = 'toolbar-group';
    return div;
  }

  _addButton(group, id, title, svgContent) {
    const btn = document.createElement('button');
    btn.className = 'toolbar-btn';
    btn.dataset.tool = id;
    btn.title = title;
    btn.innerHTML = svgContent;
    btn.addEventListener('click', () => this._onButtonClick(id));
    group.appendChild(btn);
    return btn;
  }

  _onButtonClick(id) {
    if (id === 'export') {
      if (this.onExport) this.onExport();
      return;
    }
    if (id === 'delete-tube') {
      if (this.onDeleteTube) this.onDeleteTube();
      return;
    }
    if (id === 'snap') {
      this.snapEnabled = !this.snapEnabled;
      this.snapBtn.classList.toggle('active', this.snapEnabled);
      if (this.onSnapToggle) this.onSnapToggle(this.snapEnabled);
      return;
    }
    if (id.startsWith('plane-')) {
      const plane = id.replace('plane-', '');
      this.setPlane(plane);
      if (this.onPlaneChange) this.onPlaneChange(plane);
      return;
    }

    this._setActive(id);
    this.currentTool = id;
    if (this.onToolChange) this.onToolChange(id);
  }

  _setActive(id) {
    const toolBtns = ['select', 'click-place', 'freehand'];
    for (const t of toolBtns) {
      const btn = this.container.querySelector(`[data-tool="${t}"]`);
      if (btn) btn.classList.toggle('active', t === id);
    }
  }

  setTool(id) {
    this._setActive(id);
    this.currentTool = id;
  }

  setPlane(plane) {
    this.currentPlane = plane;
    this._setPlaneActive(plane);
  }

  _setPlaneActive(plane) {
    const planes = ['XZ', 'XY', 'YZ'];
    for (const p of planes) {
      const btn = this.container.querySelector(`[data-tool="plane-${p}"]`);
      if (btn) btn.classList.toggle('active', p === plane);
    }
  }

  // SVG Icons (simple inline)
  _selectIcon() {
    return `<svg viewBox="0 0 24 24"><path d="M7 2l10 10-4.5 1 2.5 6-2.5 1-2.5-6L7 17V2z"/></svg>`;
  }
  _clickPlaceIcon() {
    return `<svg viewBox="0 0 24 24"><circle cx="6" cy="18" r="2.5"/><circle cx="12" cy="6" r="2.5"/><circle cx="18" cy="14" r="2.5"/><line x1="6" y1="18" x2="12" y2="6" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="12" y1="6" x2="18" y2="14" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`;
  }
  _freehandIcon() {
    return `<svg viewBox="0 0 24 24"><path d="M3 17c3-4 5 2 9-2s4-8 9-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  }
  _deleteIcon() {
    return `<svg viewBox="0 0 24 24"><path d="M6 7h12l-1 13H7L6 7zm3-3h6v2H9V4zm-4 3h14" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }
  _snapIcon() {
    return `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="3" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="14" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="14" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }
  _exportIcon() {
    return `<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  _planeXZIcon() {
    return `<svg viewBox="0 0 24 24"><text x="3" y="17" font-size="13" font-weight="bold" fill="currentColor" font-family="sans-serif">XZ</text></svg>`;
  }
  _planeXYIcon() {
    return `<svg viewBox="0 0 24 24"><text x="3" y="17" font-size="13" font-weight="bold" fill="currentColor" font-family="sans-serif">XY</text></svg>`;
  }
  _planeYZIcon() {
    return `<svg viewBox="0 0 24 24"><text x="3" y="17" font-size="13" font-weight="bold" fill="currentColor" font-family="sans-serif">YZ</text></svg>`;
  }
}
