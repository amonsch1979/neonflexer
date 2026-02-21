import { TubeMaterialFactory } from '../tube/TubeMaterialFactory.js';
import { PIXEL_PITCH_PRESETS, TUBE_DIAMETERS_MM, FLAT_TUBE_SIZES_MM } from '../utils/Units.js';

/**
 * Modal dialog for configuring custom fixture properties before drawing.
 * Remembers last confirmed values so reopening shows previous settings.
 */
export class CustomFixtureDialog {
  constructor() {
    this.onConfirm = null; // (presetObj) => {}
    this.onCancel = null;  // () => {}
    this._overlay = null;
    this._lastConfig = {
      profile: 'round',
      diameterMm: 16,
      widthMm: 10,
      heightMm: 20,
      pixelsPerMeter: 60,
      dmxChannelsPerPixel: 3,
      materialPreset: 'milky',
      enableMaxLength: false,
      maxLengthMm: 6000,
      connectorDiameterMm: 30,
      connectorHeightMm: 30,
    };
    this._build();
  }

  show(defaults) {
    const cfg = defaults || this._lastConfig;
    this._populateForm(cfg);
    this._overlay.classList.add('visible');
    // Focus first input after a tick
    requestAnimationFrame(() => {
      const first = this._panel.querySelector('input, select');
      if (first) first.focus();
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
    header.innerHTML = `<span>CUSTOM FIXTURE</span>`;
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
    confirmBtn.textContent = 'Apply & Draw';
    confirmBtn.addEventListener('click', () => this._confirm());
    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    this._panel.appendChild(footer);

    this._overlay.appendChild(this._panel);
    document.body.appendChild(this._overlay);

    // Keyboard
    this._overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._cancel();
      if (e.key === 'Enter' && e.target.tagName !== 'SELECT') this._confirm();
    });
  }

  _populateForm(cfg) {
    this._body.innerHTML = '';

    // ── Cross Section ──
    const csSection = this._section('Cross Section');

    // Profile
    this._formRow(csSection, 'Profile', this._select(
      [
        { value: 'round', label: 'Round' },
        { value: 'square', label: 'Square' },
        { value: 'rect', label: 'Rectangular' },
      ],
      cfg.profile,
      (val) => {
        cfg.profile = val;
        this._populateForm(cfg);
      },
      'cfg-profile'
    ));

    // Diameter / Width+Height
    if (cfg.profile === 'round' || cfg.profile === 'square') {
      this._formRow(csSection, 'Diameter', this._numberWithUnit(cfg.diameterMm, 4, 50, 0.5, 'mm', 'cfg-diameter'));

      // Quick diameter buttons
      const quickRow = document.createElement('div');
      quickRow.className = 'cfd-quick-row';
      for (const d of TUBE_DIAMETERS_MM) {
        const btn = document.createElement('button');
        btn.className = 'btn cfd-quick-btn';
        btn.textContent = `${d}mm`;
        btn.addEventListener('click', () => {
          const input = this._body.querySelector('#cfg-diameter');
          if (input) input.value = d;
        });
        quickRow.appendChild(btn);
      }
      csSection.appendChild(quickRow);
    } else {
      this._formRow(csSection, 'Width', this._numberWithUnit(cfg.widthMm, 3, 30, 0.5, 'mm', 'cfg-width'));
      this._formRow(csSection, 'Height', this._numberWithUnit(cfg.heightMm, 4, 40, 0.5, 'mm', 'cfg-height'));

      // Quick flat tube buttons
      const quickRow = document.createElement('div');
      quickRow.className = 'cfd-quick-row';
      for (const [w, h] of FLAT_TUBE_SIZES_MM) {
        const btn = document.createElement('button');
        btn.className = 'btn cfd-quick-btn';
        btn.textContent = `${w}x${h}`;
        btn.addEventListener('click', () => {
          const wInput = this._body.querySelector('#cfg-width');
          const hInput = this._body.querySelector('#cfg-height');
          if (wInput) wInput.value = w;
          if (hInput) hInput.value = h;
        });
        quickRow.appendChild(btn);
      }
      csSection.appendChild(quickRow);
    }

    this._body.appendChild(csSection);

    // ── Pixels ──
    const pxSection = this._section('Pixels');

    // Pixels/m dropdown with preset pitches
    const pitchOptions = Object.entries(PIXEL_PITCH_PRESETS).map(([, p]) => ({
      value: String(p.pixelsPerMeter),
      label: p.label,
    }));
    const isPreset = pitchOptions.some(o => o.value === String(cfg.pixelsPerMeter));
    pitchOptions.push({ value: 'custom', label: 'Custom...' });

    this._formRow(pxSection, 'Pixels/m', this._select(
      pitchOptions,
      isPreset ? String(cfg.pixelsPerMeter) : 'custom',
      (val) => {
        if (val !== 'custom') {
          cfg.pixelsPerMeter = parseInt(val);
          this._populateForm(cfg);
        } else {
          // Show custom input
          const customWrap = this._body.querySelector('#cfg-ppm-custom');
          if (customWrap) customWrap.style.display = 'flex';
        }
      },
      'cfg-pitch'
    ));

    // Custom px/m input (hidden if preset matches)
    const customPpmWrap = this._numberWithUnit(cfg.pixelsPerMeter, 1, 500, 1, 'px/m', 'cfg-ppm');
    customPpmWrap.id = 'cfg-ppm-custom';
    if (isPreset) customPpmWrap.style.display = 'none';
    this._formRow(pxSection, 'Custom', customPpmWrap);

    // Ch/Pixel
    this._formRow(pxSection, 'Ch/Pixel', this._select(
      [
        { value: '3', label: 'RGB (3ch)' },
        { value: '4', label: 'RGBW (4ch)' },
      ],
      String(cfg.dmxChannelsPerPixel),
      null,
      'cfg-chperpx'
    ));

    this._body.appendChild(pxSection);

    // ── Material ──
    const matSection = this._section('Material');
    const matOptions = TubeMaterialFactory.getPresetNames().map(n => ({
      value: n,
      label: TubeMaterialFactory.getPresetLabel(n),
    }));
    this._formRow(matSection, 'Material', this._select(matOptions, cfg.materialPreset, null, 'cfg-material'));
    this._body.appendChild(matSection);

    // ── Segment Length ──
    const segSection = this._section('Segment Length');

    // Enable checkbox
    const enableRow = document.createElement('div');
    enableRow.className = 'prop-row';
    const enableLabel = document.createElement('span');
    enableLabel.className = 'prop-label';
    enableLabel.textContent = 'Enable';
    enableRow.appendChild(enableLabel);
    const enableCb = document.createElement('input');
    enableCb.type = 'checkbox';
    enableCb.id = 'cfg-enable-maxlen';
    enableCb.checked = cfg.enableMaxLength;
    enableCb.addEventListener('change', () => {
      const segFields = this._body.querySelector('#cfg-seg-fields');
      if (segFields) segFields.style.display = enableCb.checked ? 'block' : 'none';
    });
    enableRow.appendChild(enableCb);
    const enableText = document.createElement('span');
    enableText.style.fontSize = '11px';
    enableText.style.color = 'var(--text-secondary)';
    enableText.textContent = 'Max tube length (auto-segment)';
    enableRow.appendChild(enableText);
    segSection.appendChild(enableRow);

    // Segment fields (conditionally visible)
    const segFields = document.createElement('div');
    segFields.id = 'cfg-seg-fields';
    segFields.style.display = cfg.enableMaxLength ? 'block' : 'none';

    this._formRow(segFields, 'Max Length', this._numberWithUnit(cfg.maxLengthMm, 500, 20000, 100, 'mm', 'cfg-maxlen'));
    this._formRow(segFields, 'Conn. Dia.', this._numberWithUnit(cfg.connectorDiameterMm, 10, 60, 1, 'mm', 'cfg-conndia'));
    this._formRow(segFields, 'Conn. Height', this._numberWithUnit(cfg.connectorHeightMm, 10, 60, 1, 'mm', 'cfg-connht'));
    segSection.appendChild(segFields);

    this._body.appendChild(segSection);
  }

  _getValues() {
    const g = (id) => {
      const el = this._body.querySelector(`#${id}`);
      return el ? el.value : null;
    };

    const profile = g('cfg-profile') || this._lastConfig.profile;
    const enableMax = this._body.querySelector('#cfg-enable-maxlen')?.checked || false;

    // Read px/m from either the custom input or fall back to the dropdown
    let pixelsPerMeter = parseInt(g('cfg-ppm')) || this._lastConfig.pixelsPerMeter;
    const ppmSelect = this._body.querySelector('#cfg-pitch');
    if (ppmSelect && ppmSelect.value !== 'custom') {
      pixelsPerMeter = parseInt(ppmSelect.value);
    }

    const result = {
      label: 'Custom',
      profile,
      diameterMm: parseFloat(g('cfg-diameter')) || this._lastConfig.diameterMm,
      widthMm: parseFloat(g('cfg-width')) || this._lastConfig.widthMm,
      heightMm: parseFloat(g('cfg-height')) || this._lastConfig.heightMm,
      pixelsPerMeter,
      dmxChannelsPerPixel: parseInt(g('cfg-chperpx')) || 3,
      materialPreset: g('cfg-material') || 'milky',
      maxLengthM: enableMax ? (parseFloat(g('cfg-maxlen')) || 6000) / 1000 : null,
      connectorDiameterMm: enableMax ? (parseFloat(g('cfg-conndia')) || 30) : null,
      connectorHeightMm: enableMax ? (parseFloat(g('cfg-connht')) || 30) : null,
    };

    // Save for next open
    this._lastConfig = {
      profile: result.profile,
      diameterMm: result.diameterMm,
      widthMm: result.widthMm,
      heightMm: result.heightMm,
      pixelsPerMeter: result.pixelsPerMeter,
      dmxChannelsPerPixel: result.dmxChannelsPerPixel,
      materialPreset: result.materialPreset,
      enableMaxLength: enableMax,
      maxLengthMm: enableMax ? parseFloat(g('cfg-maxlen')) || 6000 : this._lastConfig.maxLengthMm,
      connectorDiameterMm: result.connectorDiameterMm || 30,
      connectorHeightMm: result.connectorHeightMm || 30,
    };

    return result;
  }

  _confirm() {
    const values = this._getValues();
    this.hide();
    if (this.onConfirm) this.onConfirm(values);
  }

  _cancel() {
    this.hide();
    if (this.onCancel) this.onCancel();
  }

  // ── Form Helpers ──

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

  _select(options, currentValue, onChange, id) {
    const select = document.createElement('select');
    select.className = 'prop-input';
    if (id) select.id = id;
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      o.selected = opt.value === currentValue;
      select.appendChild(o);
    }
    if (onChange) {
      select.addEventListener('change', () => onChange(select.value));
    }
    return select;
  }
}
