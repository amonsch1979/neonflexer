import { getPresetList } from '../tube/FixturePresets.js';

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
    this.onSave = null;           // () => {}
    this.onLoad = null;           // () => {}
    this.onDeleteTube = null;     // () => {}
    this.onDuplicateTube = null;  // () => {}
    this.onHelp = null;           // () => {}
    this.onImportRef = null;       // () => {}
    this.onGridSizeChange = null; // (sizeM) => {}
    this.onPresetChange = null;   // (presetId) => {}
    this.onGroupTubes = null;     // () => {}
    this.onUngroupTubes = null;   // () => {}
    this.onViewChange = null;     // (viewName) => {}
    this.onFocus = null;          // () => {}
    this.onIsolate = null;        // () => {}
    this.onCommandPanel = null;   // () => {}

    this._build();
  }

  _build() {
    this.container.innerHTML = '';

    // ═══ ROW 1: Drawing tools, Fixture preset, Edit tools ═══
    const row1 = document.createElement('div');
    row1.className = 'toolbar-row';

    // Drawing tools group
    const drawGroup = this._createGroup();
    this.selectBtn = this._addButton(drawGroup, 'select', 'Select / Move', this._selectIcon(), '1');
    this.clickPlaceBtn = this._addButton(drawGroup, 'click-place', 'Click Place', this._clickPlaceIcon(), '2');
    this.freehandBtn = this._addButton(drawGroup, 'freehand', 'Freehand Draw', this._freehandIcon(), '3');
    this.rectangleBtn = this._addButton(drawGroup, 'rectangle', 'Rectangle', this._rectangleIcon(), '4');
    this.circleBtn = this._addButton(drawGroup, 'circle', 'Circle', this._circleIcon(), '5');
    this.cutBtn = this._addButton(drawGroup, 'cut', 'Cut Tube', this._cutIcon(), 'C');
    row1.appendChild(drawGroup);

    // Fixture Preset group
    const presetGroup = this._createGroup();
    const presetLabel = document.createElement('span');
    presetLabel.className = 'toolbar-label';
    presetLabel.textContent = 'Fixture:';
    presetGroup.appendChild(presetLabel);
    this._presetSelect = document.createElement('select');
    this._presetSelect.className = 'prop-input';
    this._presetSelect.style.width = '160px';
    this._presetSelect.style.height = '26px';
    this._presetSelect.style.fontSize = '11px';
    // Placeholder option
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— Select Type —';
    placeholder.disabled = true;
    placeholder.selected = true;
    this._presetSelect.appendChild(placeholder);
    for (const p of getPresetList()) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.label;
      this._presetSelect.appendChild(opt);
    }
    this._presetSelect.addEventListener('change', () => {
      if (this.onPresetChange) this.onPresetChange(this._presetSelect.value);
    });
    presetGroup.appendChild(this._presetSelect);
    row1.appendChild(presetGroup);

    // Edit group
    const editGroup = this._createGroup();
    this.duplicateBtn = this._addButton(editGroup, 'duplicate-tube', 'Duplicate Tube', this._duplicateIcon(), '^D');
    this.duplicateBtn.classList.remove('active');
    this.deleteBtn = this._addButton(editGroup, 'delete-tube', 'Delete Tube', this._deleteIcon(), 'Del');
    this.deleteBtn.classList.remove('active');
    this.groupBtn = this._addButton(editGroup, 'group-tubes', 'Group Tubes', this._groupIcon(), '^G');
    this.groupBtn.classList.remove('active');
    this.ungroupBtn = this._addButton(editGroup, 'ungroup-tubes', 'Ungroup Tubes', this._ungroupIcon(), '^B');
    this.ungroupBtn.classList.remove('active');
    row1.appendChild(editGroup);

    // Row 1 spacer
    const spacer1 = document.createElement('div');
    spacer1.style.flex = '1';
    row1.appendChild(spacer1);

    // File group on Row 1 right side (Save / Load / Import Ref / Export)
    const fileGroup = this._createGroup();
    this.saveBtn = this._addButton(fileGroup, 'save', 'Save Project', this._saveIcon(), '^S');
    this.saveBtn.classList.remove('active');
    this.loadBtn = this._addButton(fileGroup, 'load', 'Load Project', this._loadIcon(), '^O');
    this.loadBtn.classList.remove('active');
    this.importRefBtn = this._addButton(fileGroup, 'import-ref', 'Import Reference Model', this._importRefIcon(), '^I');
    this.importRefBtn.classList.remove('active');
    this.exportBtn = this._addButton(fileGroup, 'export', 'Export MVR', this._exportIcon(), '^E');
    this.exportBtn.classList.remove('active');
    row1.appendChild(fileGroup);

    // Help button
    const helpGroup = this._createGroup();
    this.helpBtn = this._addButton(helpGroup, 'help', 'Help & Shortcuts', this._helpIcon(), '?');
    this.helpBtn.classList.remove('active');
    this.cmdPadBtn = this._addButton(helpGroup, 'command-panel', 'Command Pad', this._cmdPadIcon(), 'P');
    this.cmdPadBtn.classList.remove('active');
    row1.appendChild(helpGroup);

    this.container.appendChild(row1);

    // ═══ ROW 2: Snap, Plane, View, Focus, Isolate, Grid, Branding ═══
    const row2 = document.createElement('div');
    row2.className = 'toolbar-row';

    // Options group (snap)
    const optGroup = this._createGroup();
    this.snapBtn = this._addButton(optGroup, 'snap', 'Grid Snap', this._snapIcon(), 'G');
    this.snapBtn.classList.toggle('active', this.snapEnabled);
    row2.appendChild(optGroup);

    // Drawing plane group
    const planeGroup = this._createGroup();
    const planeLabel = document.createElement('span');
    planeLabel.className = 'toolbar-label';
    planeLabel.textContent = 'Plane:';
    planeGroup.appendChild(planeLabel);
    this.xzBtn = this._addButton(planeGroup, 'plane-XZ', 'Ground XZ', this._planeXZIcon(), 'F1');
    this.xyBtn = this._addButton(planeGroup, 'plane-XY', 'Front XY', this._planeXYIcon(), 'F2');
    this.yzBtn = this._addButton(planeGroup, 'plane-YZ', 'Side YZ', this._planeYZIcon(), 'F3');
    this._setPlaneActive('XZ');
    row2.appendChild(planeGroup);

    // View group
    const viewGroup = this._createGroup();
    const viewLabel = document.createElement('span');
    viewLabel.className = 'toolbar-label';
    viewLabel.textContent = 'View:';
    viewGroup.appendChild(viewLabel);
    this._viewSelect = document.createElement('select');
    this._viewSelect.className = 'toolbar-select';
    this._viewSelect.style.width = '100px';
    const viewOptions = [
      { value: '', label: '\u2014 View \u2014' },
      { value: 'top', label: 'Top (7)' },
      { value: 'bottom', label: 'Bottom (^7)' },
      { value: 'front', label: 'Front (1)' },
      { value: 'back', label: 'Back (^1)' },
      { value: 'right', label: 'Right (3)' },
      { value: 'left', label: 'Left (^3)' },
      { value: 'perspective', label: '3D (0)' },
    ];
    for (const v of viewOptions) {
      const opt = document.createElement('option');
      opt.value = v.value;
      opt.textContent = v.label;
      if (v.value === '') opt.disabled = true;
      this._viewSelect.appendChild(opt);
    }
    this._viewSelect.value = '';
    this._viewSelect.addEventListener('change', () => {
      const val = this._viewSelect.value;
      if (val && this.onViewChange) this.onViewChange(val);
      this._viewSelect.value = ''; // reset to placeholder
    });
    viewGroup.appendChild(this._viewSelect);

    // Focus button
    this.focusBtn = this._addButton(viewGroup, 'focus', 'Focus Selected', this._focusIcon(), 'F');
    this.focusBtn.classList.remove('active');

    // Isolate button
    this.isolateBtn = this._addButton(viewGroup, 'isolate', 'Isolation Mode', this._isolateIcon(), 'I');
    this.isolateBtn.classList.remove('active');

    row2.appendChild(viewGroup);

    // Grid size group
    const gridGroup = this._createGroup();
    const gridLabel = document.createElement('span');
    gridLabel.className = 'toolbar-label';
    gridLabel.textContent = 'Grid:';
    gridGroup.appendChild(gridLabel);
    this._gridSelect = document.createElement('select');
    const gridSelect = this._gridSelect;
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
    this._gridCustomInput = document.createElement('input');
    const customInput = this._gridCustomInput;
    customInput.type = 'number';
    customInput.className = 'prop-input';
    customInput.style.width = '50px';
    customInput.style.height = '26px';
    customInput.style.fontSize = '11px';
    customInput.style.display = 'none';
    customInput.min = '1';
    customInput.max = '200';
    customInput.placeholder = 'm';

    this._gridCustomUnit = document.createElement('span');
    const customUnit = this._gridCustomUnit;
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
    row2.appendChild(gridGroup);

    // Row 2 spacer
    const spacer2 = document.createElement('div');
    spacer2.style.flex = '1';
    row2.appendChild(spacer2);

    // Logo + App name (clickable — opens about page)
    const branding = document.createElement('a');
    branding.href = 'about.html';
    branding.target = '_blank';
    branding.style.display = 'flex';
    branding.style.alignItems = 'center';
    branding.style.gap = '6px';
    branding.style.marginLeft = '8px';
    branding.style.textDecoration = 'none';
    branding.style.cursor = 'pointer';
    branding.title = 'Release Notes & Info';

    const logo = document.createElement('img');
    logo.src = 'byfeignasse_logo_1.png';
    logo.alt = 'BYFEIGNASSE';
    logo.style.height = '24px';
    logo.style.width = '24px';
    logo.style.objectFit = 'contain';
    logo.style.borderRadius = '50%';
    logo.style.filter = 'invert(1)';
    branding.appendChild(logo);

    const label = document.createElement('span');
    label.className = 'toolbar-label';
    label.style.fontSize = '11px';
    label.style.letterSpacing = '1px';
    label.style.fontWeight = '600';
    label.textContent = 'NEONFLEXER v1.2.1';
    branding.appendChild(label);

    row2.appendChild(branding);

    this.container.appendChild(row2);

    // Set initial active
    this._setActive('select');
  }

  _createGroup() {
    const div = document.createElement('div');
    div.className = 'toolbar-group';
    return div;
  }

  _addButton(group, id, title, svgContent, shortcutLabel) {
    const btn = document.createElement('button');
    btn.className = 'toolbar-btn';
    btn.dataset.tool = id;
    btn.dataset.tooltip = title;
    btn.innerHTML = svgContent;
    btn.addEventListener('click', () => this._onButtonClick(id));
    group.appendChild(btn);

    // Show shortcut label next to the button
    if (shortcutLabel) {
      const kbd = document.createElement('span');
      kbd.className = 'toolbar-shortcut';
      kbd.textContent = shortcutLabel;
      group.appendChild(kbd);
    }

    return btn;
  }

  _onButtonClick(id) {
    if (id === 'save') {
      if (this.onSave) this.onSave();
      return;
    }
    if (id === 'load') {
      if (this.onLoad) this.onLoad();
      return;
    }
    if (id === 'export') {
      if (this.onExport) this.onExport();
      return;
    }
    if (id === 'delete-tube') {
      if (this.onDeleteTube) this.onDeleteTube();
      return;
    }
    if (id === 'duplicate-tube') {
      if (this.onDuplicateTube) this.onDuplicateTube();
      return;
    }
    if (id === 'group-tubes') {
      if (this.onGroupTubes) this.onGroupTubes();
      return;
    }
    if (id === 'ungroup-tubes') {
      if (this.onUngroupTubes) this.onUngroupTubes();
      return;
    }
    if (id === 'import-ref') {
      if (this.onImportRef) this.onImportRef();
      return;
    }
    if (id === 'help') {
      if (this.onHelp) this.onHelp();
      return;
    }
    if (id === 'command-panel') {
      if (this.onCommandPanel) this.onCommandPanel();
      return;
    }
    if (id === 'focus') {
      if (this.onFocus) this.onFocus();
      return;
    }
    if (id === 'isolate') {
      if (this.onIsolate) this.onIsolate();
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
    const toolBtns = ['select', 'click-place', 'freehand', 'rectangle', 'circle', 'cut'];
    for (const t of toolBtns) {
      const btn = this.container.querySelector(`[data-tool="${t}"]`);
      if (btn) btn.classList.toggle('active', t === id);
    }
  }

  setTool(id) {
    this._setActive(id);
    this.currentTool = id;
  }

  setGridSize(sizeM) {
    const standard = ['2', '5', '10', '20', '50'];
    const strVal = String(sizeM);
    if (standard.includes(strVal)) {
      this._gridSelect.value = strVal;
      this._gridCustomInput.style.display = 'none';
      this._gridCustomUnit.style.display = 'none';
    } else {
      this._gridSelect.value = 'custom';
      this._gridCustomInput.style.display = '';
      this._gridCustomUnit.style.display = '';
      this._gridCustomInput.value = sizeM;
    }
  }

  setPreset(presetId) {
    if (this._presetSelect) {
      this._presetSelect.value = presetId;
    }
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
  _duplicateIcon() {
    return `<svg viewBox="0 0 24 24"><rect x="8" y="2" width="12" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="4" y="8" width="12" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }
  _helpIcon() {
    return `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="12" y="17" font-size="14" font-weight="bold" fill="currentColor" text-anchor="middle" font-family="sans-serif">?</text></svg>`;
  }
  _saveIcon() {
    return `<svg viewBox="0 0 24 24"><path d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 3v5h8V3M7 21v-8h10v8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }
  _loadIcon() {
    return `<svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 11v6m0-6l-3 3m3-3l3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  _importRefIcon() {
    return `<svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  _rectangleIcon() {
    return `<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }
  _circleIcon() {
    return `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }
  _cutIcon() {
    return `<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="8.5" y1="8" x2="20" y2="18" stroke="currentColor" stroke-width="1.5"/><line x1="8.5" y1="16" x2="20" y2="6" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }
  _groupIcon() {
    return `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="14" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 6.5h4M13.5 10v4M6.5 10v4M10 17.5h4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 1.5"/></svg>`;
  }
  _ungroupIcon() {
    return `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="14" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="9" y1="15" x2="15" y2="9" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }
  _cmdPadIcon() {
    return `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="14" y="3" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="3" y="14" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="14" y="14" width="7" height="7" rx="1.5" fill="currentColor"/></svg>`;
  }
  _focusIcon() {
    return `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  }
  _isolateIcon() {
    return `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>`;
  }
  setIsolateActive(active) {
    if (this.isolateBtn) this.isolateBtn.classList.toggle('active', active);
  }
  _aboutIcon() {
    return `<svg viewBox="0 0 24 24" style="fill:none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="12" y1="11" x2="12" y2="17" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="12" cy="7.5" r="1.5" fill="currentColor" stroke="none"/></svg>`;
  }
}
