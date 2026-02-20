import { TubeMaterialFactory } from '../tube/TubeMaterialFactory.js';
import { PIXEL_PITCH_PRESETS, TUBE_DIAMETERS_MM, FLAT_TUBE_SIZES_MM } from '../utils/Units.js';
import { CurveBuilder } from '../drawing/CurveBuilder.js';

/**
 * Right-side properties panel for editing selected tube parameters.
 */
export class PropertiesPanel {
  constructor(containerEl) {
    this.container = containerEl;
    this.currentTube = null;
    this.onPropertyChange = null; // (tubeModel, propName) => {}

    this._showEmpty();
  }

  /**
   * Show properties for a tube.
   */
  show(tube) {
    this.currentTube = tube;
    if (!tube) {
      this._showEmpty();
      return;
    }
    this._build();
  }

  _showEmpty() {
    this.container.innerHTML = '<div class="empty-message">Select or create a tube to edit properties</div>';
  }

  _build() {
    const tube = this.currentTube;
    this.container.innerHTML = '';

    // Name
    const nameGroup = this._group('General');
    this._row(nameGroup, 'Name', this._textInput(tube.name, (val) => {
      tube.name = val;
      this._emit('name');
    }));
    this.container.appendChild(nameGroup);

    // Cross Section
    const csGroup = this._group('Cross Section');
    this._row(csGroup, 'Profile', this._select(
      [
        { value: 'round', label: 'Round' },
        { value: 'square', label: 'Square' },
        { value: 'rect', label: 'Rectangular' },
      ],
      tube.profile,
      (val) => {
        tube.profile = val;
        this._emit('profile');
        this._build(); // Rebuild to show/hide fields
      }
    ));

    if (tube.profile === 'round' || tube.profile === 'square') {
      this._row(csGroup, 'Diameter', this._numberInput(tube.diameterMm, 4, 50, 0.5, 'mm', (val) => {
        tube.diameterMm = val;
        this._emit('diameterMm');
      }));

      // Quick diameter buttons
      const quickRow = document.createElement('div');
      quickRow.className = 'prop-row';
      quickRow.style.flexWrap = 'wrap';
      quickRow.style.gap = '3px';
      const ql = document.createElement('span');
      ql.className = 'prop-label';
      ql.textContent = 'Presets';
      quickRow.appendChild(ql);
      for (const d of TUBE_DIAMETERS_MM) {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.style.padding = '2px 6px';
        btn.style.fontSize = '10px';
        btn.textContent = `${d}mm`;
        btn.addEventListener('click', () => {
          tube.diameterMm = d;
          this._emit('diameterMm');
          this._build();
        });
        quickRow.appendChild(btn);
      }
      csGroup.appendChild(quickRow);
    }

    if (tube.profile === 'rect') {
      this._row(csGroup, 'Width', this._numberInput(tube.widthMm, 3, 30, 0.5, 'mm', (val) => {
        tube.widthMm = val;
        this._emit('widthMm');
      }));
      this._row(csGroup, 'Height', this._numberInput(tube.heightMm, 4, 40, 0.5, 'mm', (val) => {
        tube.heightMm = val;
        this._emit('heightMm');
      }));

      // Quick flat tube presets
      const quickRow = document.createElement('div');
      quickRow.className = 'prop-row';
      quickRow.style.flexWrap = 'wrap';
      quickRow.style.gap = '3px';
      const ql = document.createElement('span');
      ql.className = 'prop-label';
      ql.textContent = 'Presets';
      quickRow.appendChild(ql);
      for (const [w, h] of FLAT_TUBE_SIZES_MM) {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.style.padding = '2px 6px';
        btn.style.fontSize = '10px';
        btn.textContent = `${w}x${h}`;
        btn.addEventListener('click', () => {
          tube.widthMm = w;
          tube.heightMm = h;
          this._emit('widthMm');
          this._build();
        });
        quickRow.appendChild(btn);
      }
      csGroup.appendChild(quickRow);
    }

    this._row(csGroup, 'Wall', this._numberInput(tube.wallThicknessMm, 0.5, 5, 0.1, 'mm', (val) => {
      tube.wallThicknessMm = val;
      this._emit('wallThicknessMm');
    }));
    this.container.appendChild(csGroup);

    // Material
    const matGroup = this._group('Material');
    const matOptions = TubeMaterialFactory.getPresetNames().map(n => ({
      value: n,
      label: TubeMaterialFactory.getPresetLabel(n),
    }));
    this._row(matGroup, 'Preset', this._select(matOptions, tube.materialPreset, (val) => {
      tube.materialPreset = val;
      this._emit('materialPreset');
    }));
    this.container.appendChild(matGroup);

    // Pixels
    const pxGroup = this._group('Pixels');
    const pitchOptions = Object.entries(PIXEL_PITCH_PRESETS).map(([key, p]) => ({
      value: String(p.pixelsPerMeter),
      label: p.label,
    }));
    pitchOptions.push({ value: 'custom', label: 'Custom...' });

    const isPreset = pitchOptions.some(o => o.value === String(tube.pixelsPerMeter));
    this._row(pxGroup, 'Pitch', this._select(
      pitchOptions,
      isPreset ? String(tube.pixelsPerMeter) : 'custom',
      (val) => {
        if (val === 'custom') {
          this._build();
        } else {
          tube.pixelsPerMeter = parseInt(val);
          this._emit('pixelsPerMeter');
          this._build();
        }
      }
    ));

    if (!isPreset || String(tube.pixelsPerMeter) === 'custom') {
      this._row(pxGroup, 'px/m', this._numberInput(tube.pixelsPerMeter, 1, 500, 1, '', (val) => {
        tube.pixelsPerMeter = Math.round(val);
        this._emit('pixelsPerMeter');
      }));
    }

    this._row(pxGroup, 'Color', this._colorInput(tube.pixelColor, (val) => {
      tube.pixelColor = val;
      this._emit('pixelColor');
    }));

    // Emissive toggle
    const emissiveRow = document.createElement('div');
    emissiveRow.className = 'toggle-row';
    const emissiveLabel = document.createElement('span');
    emissiveLabel.className = 'prop-label';
    emissiveLabel.textContent = 'Emissive';
    emissiveRow.appendChild(emissiveLabel);
    const emToggle = document.createElement('label');
    emToggle.className = 'toggle-switch';
    const emCheckbox = document.createElement('input');
    emCheckbox.type = 'checkbox';
    emCheckbox.checked = tube.pixelEmissive;
    emCheckbox.addEventListener('change', () => {
      tube.pixelEmissive = emCheckbox.checked;
      this._emit('pixelEmissive');
    });
    const emSlider = document.createElement('span');
    emSlider.className = 'toggle-slider';
    emToggle.appendChild(emCheckbox);
    emToggle.appendChild(emSlider);
    emissiveRow.appendChild(emToggle);
    pxGroup.appendChild(emissiveRow);

    this.container.appendChild(pxGroup);

    // Curve
    const curveGroup = this._group('Curve');
    this._row(curveGroup, 'Tension', this._numberInput(tube.tension, 0, 1, 0.05, '', (val) => {
      tube.tension = val;
      this._emit('tension');
    }));

    const closedRow = document.createElement('div');
    closedRow.className = 'toggle-row';
    const closedLabel = document.createElement('span');
    closedLabel.className = 'prop-label';
    closedLabel.textContent = 'Closed';
    closedRow.appendChild(closedLabel);
    const toggle = document.createElement('label');
    toggle.className = 'toggle-switch';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = tube.closed;
    checkbox.addEventListener('change', () => {
      tube.closed = checkbox.checked;
      this._emit('closed');
    });
    const slider = document.createElement('span');
    slider.className = 'toggle-slider';
    toggle.appendChild(checkbox);
    toggle.appendChild(slider);
    closedRow.appendChild(toggle);
    curveGroup.appendChild(closedRow);

    this.container.appendChild(curveGroup);

    // Info
    if (tube.isValid) {
      const infoGroup = this._group('Info');
      const curve = CurveBuilder.build(tube.controlPoints, tube.tension, tube.closed);
      const lengthMm = curve ? Math.round(CurveBuilder.getLength(curve) * 1000) : 0;

      const lenInfo = document.createElement('div');
      lenInfo.className = 'prop-row';
      lenInfo.innerHTML = `<span class="prop-label">Length</span><span style="font-size:12px; font-family:var(--font-mono)">${lengthMm}mm</span>`;
      infoGroup.appendChild(lenInfo);

      const ptsInfo = document.createElement('div');
      ptsInfo.className = 'prop-row';
      ptsInfo.innerHTML = `<span class="prop-label">Points</span><span style="font-size:12px; font-family:var(--font-mono)">${tube.controlPoints.length}</span>`;
      infoGroup.appendChild(ptsInfo);

      this.container.appendChild(infoGroup);
    }
  }

  _emit(propName) {
    if (this.onPropertyChange && this.currentTube) {
      this.onPropertyChange(this.currentTube, propName);
    }
  }

  _group(title) {
    const div = document.createElement('div');
    div.className = 'prop-group';
    const t = document.createElement('div');
    t.className = 'prop-group-title';
    t.textContent = title;
    div.appendChild(t);
    return div;
  }

  _row(parent, label, input) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const lbl = document.createElement('span');
    lbl.className = 'prop-label';
    lbl.textContent = label;
    row.appendChild(lbl);
    row.appendChild(input);
    parent.appendChild(row);
  }

  _textInput(value, onChange) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'prop-input';
    input.value = value;
    input.addEventListener('change', () => onChange(input.value));
    return input;
  }

  _numberInput(value, min, max, step, suffix, onChange) {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.flex = '1';
    wrap.style.gap = '3px';

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'prop-input';
    input.value = value;
    input.min = min;
    input.max = max;
    input.step = step;
    input.addEventListener('change', () => {
      let v = parseFloat(input.value);
      if (isNaN(v)) v = value;
      v = Math.max(min, Math.min(max, v));
      input.value = v;
      onChange(v);
    });
    wrap.appendChild(input);

    if (suffix) {
      const suf = document.createElement('span');
      suf.style.fontSize = '10px';
      suf.style.color = 'var(--text-muted)';
      suf.textContent = suffix;
      wrap.appendChild(suf);
    }

    return wrap;
  }

  _select(options, currentValue, onChange) {
    const select = document.createElement('select');
    select.className = 'prop-input';
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      o.selected = opt.value === currentValue;
      select.appendChild(o);
    }
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  _colorInput(value, onChange) {
    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'prop-input';
    input.value = value;
    input.addEventListener('input', () => onChange(input.value));
    return input;
  }
}
