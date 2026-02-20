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
    this.onGridSizeChange = null; // (sizeM) => {}

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

    // Grid size group
    const gridGroup = this._createGroup();
    const gridLabel = document.createElement('span');
    gridLabel.className = 'toolbar-label';
    gridLabel.textContent = 'Grid:';
    gridGroup.appendChild(gridLabel);
    const gridSelect = document.createElement('select');
    gridSelect.className = 'prop-input';
    gridSelect.style.width = '80px';
    gridSelect.style.height = '26px';
    gridSelect.style.fontSize = '11px';
    const gridSizes = [
      { value: '2', label: '2x2m' },
      { value: '5', label: '5x5m' },
      { value: '10', label: '10x10m' },
      { value: '20', label: '20x20m' },
      { value: '50', label: '50x50m' },
      { value: 'custom', label: 'Custom...' },
    ];
    for (const gs of gridSizes) {
      const opt = document.createElement('option');
      opt.value = gs.value;
      opt.textContent = gs.label;
      gridSelect.appendChild(opt);
    }
    gridSelect.value = '2';

    // Custom input (hidden by default)
    const customInput = document.createElement('input');
    customInput.type = 'number';
    customInput.className = 'prop-input';
    customInput.style.width = '50px';
    customInput.style.height = '26px';
    customInput.style.fontSize = '11px';
    customInput.style.display = 'none';
    customInput.min = '1';
    customInput.max = '200';
    customInput.placeholder = 'm';

    const customUnit = document.createElement('span');
    customUnit.className = 'toolbar-label';
    customUnit.style.display = 'none';
    customUnit.textContent = 'm';

    const applyCustom = () => {
      const val = parseFloat(customInput.value);
      if (val >= 1 && val <= 200) {
        if (this.onGridSizeChange) this.onGridSizeChange(val);
      }
    };

    gridSelect.addEventListener('change', () => {
      if (gridSelect.value === 'custom') {
        customInput.style.display = '';
        customUnit.style.display = '';
        customInput.value = '';
        customInput.focus();
      } else {
        customInput.style.display = 'none';
        customUnit.style.display = 'none';
        if (this.onGridSizeChange) this.onGridSizeChange(parseInt(gridSelect.value));
      }
    });

    customInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        applyCustom();
        customInput.blur();
      }
    });
    customInput.addEventListener('change', applyCustom);

    gridGroup.appendChild(gridSelect);
    gridGroup.appendChild(customInput);
    gridGroup.appendChild(customUnit);
    this.container.appendChild(gridGroup);

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    this.container.appendChild(spacer);

    // Export group
    const exportGroup = this._createGroup();
    this.exportBtn = this._addButton(exportGroup, 'export', 'Export MVR (Ctrl+E)', this._exportIcon());
    this.exportBtn.classList.remove('active');
    this.container.appendChild(exportGroup);

    // Logo + App name
    const branding = document.createElement('div');
    branding.style.display = 'flex';
    branding.style.alignItems = 'center';
    branding.style.gap = '6px';
    branding.style.marginLeft = '8px';

    const logo = document.createElement('img');
    logo.src = 'byfeignasse_logo_1.png';
    logo.alt = 'BYFEIGNASSE';
    logo.style.height = '28px';
    logo.style.width = '28px';
    logo.style.objectFit = 'contain';
    logo.style.borderRadius = '50%';
    logo.style.filter = 'invert(1)';
    branding.appendChild(logo);

    const label = document.createElement('span');
    label.className = 'toolbar-label';
    label.style.fontSize = '12px';
    label.style.letterSpacing = '1px';
    label.style.fontWeight = '600';
    label.textContent = 'MAGICTOOLBOX NEONFLEXER';
    branding.appendChild(label);

    this.container.appendChild(branding);

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
