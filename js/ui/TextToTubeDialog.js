import { getBundledFontList } from '../text/TextMapper.js';

/**
 * Modal dialog for converting text to tube paths.
 * Follows the same pattern as CustomFixtureDialog.
 */
export class TextToTubeDialog {
  constructor() {
    this.onConfirm = null; // ({ text, fontId, customFontFile, size, letterSpacing, divisions }) => {}
    this.onCancel = null;  // () => {}
    this._overlay = null;
    this._lastConfig = {
      text: 'HELLO',
      fontId: 'helvetiker_bold',
      size: 0.5,
      letterSpacing: 1.0,
      divisions: 12,
    };
    this._build();
  }

  show(defaults) {
    const cfg = defaults || this._lastConfig;
    this._populateForm(cfg);
    this._overlay.classList.add('visible');
    requestAnimationFrame(() => {
      const textInput = this._panel.querySelector('#ttt-text');
      if (textInput) {
        textInput.focus();
        textInput.select();
      }
    });
  }

  hide() {
    this._overlay.classList.remove('visible');
  }

  _build() {
    // Overlay backdrop
    this._overlay = document.createElement('div');
    this._overlay.className = 'custom-fixture-overlay';
    this._overlay.addEventListener('click', (e) => {
      if (e.target === this._overlay) this._cancel();
    });

    // Panel
    this._panel = document.createElement('div');
    this._panel.className = 'custom-fixture-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'custom-fixture-header';
    header.innerHTML = `<span>TEXT TO TUBES</span>`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'help-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this._cancel());
    header.appendChild(closeBtn);
    this._panel.appendChild(header);

    // Body (form)
    this._body = document.createElement('div');
    this._body.className = 'custom-fixture-body';
    this._panel.appendChild(this._body);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'custom-fixture-footer';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this._cancel());
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.textContent = 'Generate';
    confirmBtn.addEventListener('click', () => this._confirm());
    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    this._panel.appendChild(footer);

    this._overlay.appendChild(this._panel);
    document.body.appendChild(this._overlay);

    // Keyboard
    this._overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._cancel();
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') this._confirm();
    });
  }

  _populateForm(cfg) {
    this._body.innerHTML = '';

    // Text section
    const textSection = this._section('Text');

    // Text input
    const textRow = document.createElement('div');
    textRow.className = 'prop-row';
    const textLabel = document.createElement('span');
    textLabel.className = 'prop-label';
    textLabel.textContent = 'Text';
    textRow.appendChild(textLabel);
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'prop-input';
    textInput.id = 'ttt-text';
    textInput.value = cfg.text;
    textInput.placeholder = 'Enter text...';
    textInput.style.flex = '1';
    textRow.appendChild(textInput);
    textSection.appendChild(textRow);

    this._body.appendChild(textSection);

    // Font section
    const fontSection = this._section('Font');

    // Font dropdown
    const fontRow = document.createElement('div');
    fontRow.className = 'prop-row';
    const fontLabel = document.createElement('span');
    fontLabel.className = 'prop-label';
    fontLabel.textContent = 'Font';
    fontRow.appendChild(fontLabel);

    const fontSelect = document.createElement('select');
    fontSelect.className = 'prop-input';
    fontSelect.id = 'ttt-font';
    fontSelect.style.flex = '1';

    for (const f of getBundledFontList()) {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.label;
      opt.selected = f.id === cfg.fontId;
      fontSelect.appendChild(opt);
    }

    // Custom font option
    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = 'Load custom font...';
    fontSelect.appendChild(customOpt);

    fontSelect.addEventListener('change', () => {
      const customFileRow = this._body.querySelector('#ttt-custom-font-row');
      if (customFileRow) {
        customFileRow.style.display = fontSelect.value === 'custom' ? 'flex' : 'none';
      }
    });

    fontRow.appendChild(fontSelect);
    fontSection.appendChild(fontRow);

    // Custom font file input (hidden by default)
    const customFileRow = document.createElement('div');
    customFileRow.className = 'prop-row';
    customFileRow.id = 'ttt-custom-font-row';
    customFileRow.style.display = 'none';
    const customFileLabel = document.createElement('span');
    customFileLabel.className = 'prop-label';
    customFileLabel.textContent = 'File';
    customFileRow.appendChild(customFileLabel);
    const customFileInput = document.createElement('input');
    customFileInput.type = 'file';
    customFileInput.id = 'ttt-custom-file';
    customFileInput.accept = '.ttf,.otf,.woff';
    customFileInput.style.flex = '1';
    customFileInput.style.fontSize = '11px';
    customFileRow.appendChild(customFileInput);
    fontSection.appendChild(customFileRow);

    this._body.appendChild(fontSection);

    // Size section
    const sizeSection = this._section('Dimensions');

    // Size
    this._formRow(sizeSection, 'Size', this._numberWithUnit(cfg.size, 0.05, 5.0, 0.05, 'm', 'ttt-size'));

    // Letter spacing
    const spacingRow = document.createElement('div');
    spacingRow.className = 'prop-row';
    const spacingLabel = document.createElement('span');
    spacingLabel.className = 'prop-label';
    spacingLabel.textContent = 'Spacing';
    spacingRow.appendChild(spacingLabel);

    const spacingWrap = document.createElement('div');
    spacingWrap.style.display = 'flex';
    spacingWrap.style.alignItems = 'center';
    spacingWrap.style.flex = '1';
    spacingWrap.style.gap = '6px';
    const spacingSlider = document.createElement('input');
    spacingSlider.type = 'range';
    spacingSlider.className = 'prop-range';
    spacingSlider.id = 'ttt-spacing';
    spacingSlider.min = 0;
    spacingSlider.max = 3;
    spacingSlider.step = 0.1;
    spacingSlider.value = cfg.letterSpacing;
    const spacingDisplay = document.createElement('span');
    spacingDisplay.style.fontSize = '10px';
    spacingDisplay.style.fontFamily = 'var(--font-mono)';
    spacingDisplay.style.color = 'var(--text-secondary)';
    spacingDisplay.style.minWidth = '36px';
    spacingDisplay.style.textAlign = 'right';
    spacingDisplay.textContent = `${Math.round(cfg.letterSpacing * 100)}%`;
    spacingSlider.addEventListener('input', () => {
      spacingDisplay.textContent = `${Math.round(parseFloat(spacingSlider.value) * 100)}%`;
    });
    spacingWrap.appendChild(spacingSlider);
    spacingWrap.appendChild(spacingDisplay);
    spacingRow.appendChild(spacingWrap);
    sizeSection.appendChild(spacingRow);

    // Divisions (curve detail)
    const divRow = document.createElement('div');
    divRow.className = 'prop-row';
    const divLabel = document.createElement('span');
    divLabel.className = 'prop-label';
    divLabel.textContent = 'Detail';
    divRow.appendChild(divLabel);

    const divWrap = document.createElement('div');
    divWrap.style.display = 'flex';
    divWrap.style.alignItems = 'center';
    divWrap.style.flex = '1';
    divWrap.style.gap = '6px';
    const divSlider = document.createElement('input');
    divSlider.type = 'range';
    divSlider.className = 'prop-range';
    divSlider.id = 'ttt-divisions';
    divSlider.min = 4;
    divSlider.max = 32;
    divSlider.step = 1;
    divSlider.value = cfg.divisions;
    const divDisplay = document.createElement('span');
    divDisplay.style.fontSize = '10px';
    divDisplay.style.fontFamily = 'var(--font-mono)';
    divDisplay.style.color = 'var(--text-secondary)';
    divDisplay.style.minWidth = '24px';
    divDisplay.style.textAlign = 'right';
    divDisplay.textContent = String(cfg.divisions);
    divSlider.addEventListener('input', () => {
      divDisplay.textContent = divSlider.value;
    });
    divWrap.appendChild(divSlider);
    divWrap.appendChild(divDisplay);
    divRow.appendChild(divWrap);
    sizeSection.appendChild(divRow);

    this._body.appendChild(sizeSection);
  }

  _getValues() {
    const g = (id) => {
      const el = this._body.querySelector(`#${id}`);
      return el ? el.value : null;
    };

    const text = g('ttt-text') || '';
    const fontId = g('ttt-font') || 'helvetiker_bold';
    const size = parseFloat(g('ttt-size')) || 0.5;
    const letterSpacing = parseFloat(g('ttt-spacing')) || 1.0;
    const divisions = parseInt(g('ttt-divisions')) || 12;

    // Custom font file
    let customFontFile = null;
    if (fontId === 'custom') {
      const fileInput = this._body.querySelector('#ttt-custom-file');
      if (fileInput && fileInput.files.length > 0) {
        customFontFile = fileInput.files[0];
      }
    }

    // Save for next open
    this._lastConfig = { text, fontId, size, letterSpacing, divisions };

    return { text, fontId, customFontFile, size, letterSpacing, divisions };
  }

  _confirm() {
    const values = this._getValues();
    if (!values.text.trim()) {
      // Highlight text input
      const textInput = this._body.querySelector('#ttt-text');
      if (textInput) {
        textInput.style.borderColor = '#ff4444';
        textInput.focus();
        setTimeout(() => { textInput.style.borderColor = ''; }, 1500);
      }
      return;
    }
    if (values.fontId === 'custom' && !values.customFontFile) {
      const fileInput = this._body.querySelector('#ttt-custom-file');
      if (fileInput) {
        fileInput.style.borderColor = '#ff4444';
        setTimeout(() => { fileInput.style.borderColor = ''; }, 1500);
      }
      return;
    }
    this.hide();
    if (this.onConfirm) this.onConfirm(values);
  }

  _cancel() {
    this.hide();
    if (this.onCancel) this.onCancel();
  }

  // Form helpers (same pattern as CustomFixtureDialog)
  _section(title) {
    const div = document.createElement('div');
    div.className = 'prop-group';
    const t = document.createElement('div');
    t.className = 'prop-group-title';
    t.textContent = title;
    div.appendChild(t);
    return div;
  }

  _formRow(parent, label, inputEl) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;
    row.appendChild(lbl);
    row.appendChild(inputEl);
    parent.appendChild(row);
  }

  _numberWithUnit(value, min, max, step, unit, id) {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.flex = '1';
    wrap.style.gap = '3px';
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'prop-input';
    input.id = id;
    input.value = value;
    input.min = min;
    input.max = max;
    input.step = step;
    wrap.appendChild(input);
    if (unit) {
      const suf = document.createElement('span');
      suf.style.fontSize = '10px';
      suf.style.color = 'var(--text-muted)';
      suf.textContent = unit;
      wrap.appendChild(suf);
    }
    return wrap;
  }
}
