import { TubeMaterialFactory } from '../tube/TubeMaterialFactory.js';
import { PIXEL_PITCH_PRESETS, TUBE_DIAMETERS_MM, FLAT_TUBE_SIZES_MM } from '../utils/Units.js';
import { CurveBuilder } from '../drawing/CurveBuilder.js';
import { ReferenceModel } from '../ref/ReferenceModel.js';
import { getPresetById, getPresetList } from '../tube/FixturePresets.js';

/**
 * Right-side properties panel for editing selected tube or ref model parameters.
 */
export class PropertiesPanel {
  constructor(containerEl) {
    this.container = containerEl;
    this.currentTube = null;
    this.currentTubes = [];          // all selected tubes (for batch)
    this.currentRefModel = null;
    this.onPropertyChange = null;    // (tubeModel, propName) => {}
    this.onBatchPropertyChange = null; // (tubes[], propName) => {}
    this.onRefModelChange = null;    // (refModel, propName) => {}
    this.onRefModelRemove = null;    // (refModel) => {}
    this.onSnapToRef = null;         // (tube) => {}
    this.onPickStartPixel = null;    // (tube) => {}
    this.onTraceRef = null;          // (shapeType) => {} — 'circle' | 'rectangle'
    this.onMapEdges = null;          // (angleThreshold) => {}
    this.onResize = null;            // (tube, targetLengthMm) => {}
    this.onReverse = null;           // (tube) => {}
    this.onShapeDimensionChange = null; // (tube, shapeType, dimensions) => {}
    this.hasRefModels = false;       // set by UIManager when ref models exist

    this._showEmpty();
  }

  /**
   * Show properties for a tube or ref model (polymorphic).
   */
  show(item) {
    this.currentTube = null;
    this.currentRefModel = null;

    if (!item) {
      this._showEmpty();
      return;
    }

    if (item instanceof ReferenceModel) {
      this.currentRefModel = item;
      this._buildRefModel();
    } else {
      this.currentTube = item;
      this._build();
    }
  }

  /**
   * Show batch properties for multiple selected tubes.
   */
  showMulti(tubes) {
    this.currentTube = null;
    this.currentRefModel = null;
    this.currentTubes = tubes || [];
    if (this.currentTubes.length < 2) {
      this.show(this.currentTubes[0] || null);
      return;
    }
    this._buildMulti();
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

    // Fixture Preset
    const presetGroup = this._group('Fixture Preset');
    const presetOptions = getPresetList().map(p => ({
      value: p.id,
      label: p.label,
    }));
    this._row(presetGroup, 'Preset', this._select(
      presetOptions,
      tube.fixturePreset || 'custom',
      (val) => {
        tube.fixturePreset = val;
        const preset = getPresetById(val);
        if (preset) {
          // Apply all non-null preset values to the tube
          if (preset.profile != null) tube.profile = preset.profile;
          if (preset.diameterMm != null) tube.diameterMm = preset.diameterMm;
          if (preset.pixelsPerMeter != null) tube.pixelsPerMeter = preset.pixelsPerMeter;
          if (preset.dmxChannelsPerPixel != null) tube.dmxChannelsPerPixel = preset.dmxChannelsPerPixel;
          if (preset.materialPreset != null) tube.materialPreset = preset.materialPreset;
        }
        this._emit('fixturePreset');
        this._build(); // Rebuild to reflect new values
      }
    ));

    // Show max length info when preset has one
    const activePreset = getPresetById(tube.fixturePreset);
    if (activePreset && activePreset.maxLengthM) {
      const maxMm = Math.round(activePreset.maxLengthM * 1000);
      const infoRow = document.createElement('div');
      infoRow.className = 'prop-row';
      let infoText = `Max: ${maxMm}mm (auto-segments)`;

      // Show current length vs max
      if (tube.isValid) {
        const curve = CurveBuilder.build(tube.controlPoints, tube.tension, tube.closed);
        if (curve) {
          const lengthMm = Math.round(CurveBuilder.getLength(curve) * 1000);
          const pct = Math.round((lengthMm / maxMm) * 100);
          const colorClass = pct > 100 ? 'length-exceeded' : pct > 90 ? 'length-warning' : '';
          const colorStyle = pct > 100 ? 'color:#ff4444' : pct > 90 ? 'color:#ffaa44' : 'color:var(--accent-dim)';
          infoText = `<span style="${colorStyle}">${lengthMm} / ${maxMm}mm (${pct}%)</span>`;
        }
      }

      infoRow.innerHTML = `<span class="prop-label">Length</span><span style="font-size:11px;font-family:var(--font-mono)">${infoText}</span>`;
      presetGroup.appendChild(infoRow);
    }

    this.container.appendChild(presetGroup);

    // Fixture Mode (Placeholder)
    const modeGroup = this._group('Fixture Mode');

    // Placeholder toggle
    const phRow = document.createElement('div');
    phRow.className = 'toggle-row';
    const phLabel = document.createElement('span');
    phLabel.className = 'prop-label';
    phLabel.textContent = 'Placeholder';
    phLabel.title = 'Generic fixture placeholder — swap with real fixture in Capture';
    phRow.appendChild(phLabel);
    const phToggle = document.createElement('label');
    phToggle.className = 'toggle-switch';
    const phCheckbox = document.createElement('input');
    phCheckbox.type = 'checkbox';
    phCheckbox.checked = tube.isPlaceholder;
    phCheckbox.addEventListener('change', () => {
      tube.isPlaceholder = phCheckbox.checked;
      this._emit('isPlaceholder');
      this._build();
    });
    const phSlider = document.createElement('span');
    phSlider.className = 'toggle-slider';
    phToggle.appendChild(phCheckbox);
    phToggle.appendChild(phSlider);
    phRow.appendChild(phToggle);
    modeGroup.appendChild(phRow);

    // Facing direction + fixture name (only when placeholder ON)
    if (tube.isPlaceholder) {
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'prop-input';
      nameInput.placeholder = 'e.g. LX100, Sceptron 1m';
      nameInput.value = tube.placeholderName || '';
      nameInput.addEventListener('change', () => {
        tube.placeholderName = nameInput.value.trim();
        this._emit('placeholderName');
      });
      this._row(modeGroup, 'Fixture', nameInput);

      this._row(modeGroup, 'Facing', this._select(
        [
          { value: 'up', label: 'Up' },
          { value: 'down', label: 'Down' },
          { value: 'inward', label: 'Inward' },
          { value: 'outward', label: 'Outward' },
        ],
        tube.facingDirection || 'up',
        (val) => {
          tube.facingDirection = val;
          this._emit('facingDirection');
        }
      ));
    }

    this.container.appendChild(modeGroup);

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

    // Pixels (hidden for placeholders — they have no pixel data)
    if (!tube.isPlaceholder) {
    const pxGroup = this._group('Pixels');

    // Pixel mode selector
    this._row(pxGroup, 'Mode', this._select(
      [
        { value: 'discrete', label: 'Discrete Pixels' },
        { value: 'uv-mapped', label: 'UV Mapped' },
      ],
      tube.pixelMode || 'discrete',
      (val) => {
        tube.pixelMode = val;
        this._emit('pixelMode');
        this._build();
      }
    ));

    const isUVMapped = tube.pixelMode === 'uv-mapped';

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
        this._build();
      }));
    }

    // Pixel count — computed from length × px/m, editable to reverse-calculate px/m
    if (tube.isValid) {
      const curve = CurveBuilder.build(tube.controlPoints, tube.tension, tube.closed);
      if (curve) {
        const tubeLength = CurveBuilder.getLength(curve);
        const totalPixels = Math.max(1, Math.round(tubeLength * tube.pixelsPerMeter));

        // Start pixel offset — skip N pixels from beginning of curve
        const startPxWrap = document.createElement('div');
        startPxWrap.style.display = 'flex';
        startPxWrap.style.alignItems = 'center';
        startPxWrap.style.flex = '1';
        startPxWrap.style.gap = '3px';
        const startPxInput = this._numberInput(tube.startPixel, 0, Math.max(0, totalPixels - 1), 1, '', (val) => {
          tube.startPixel = Math.round(val);
          this._emit('startPixel');
          this._build();
        });
        startPxInput.style.flex = '1';
        startPxWrap.appendChild(startPxInput);
        const pickBtn = document.createElement('button');
        pickBtn.className = 'btn';
        pickBtn.style.padding = '2px 6px';
        pickBtn.style.fontSize = '10px';
        pickBtn.style.whiteSpace = 'nowrap';
        pickBtn.textContent = 'Pick';
        pickBtn.title = 'Click a pixel on the tube to set start pixel';
        pickBtn.addEventListener('click', () => {
          if (this.onPickStartPixel) this.onPickStartPixel(tube);
        });
        startPxWrap.appendChild(pickBtn);
        this._row(pxGroup, 'Start Px', startPxWrap);

        const activePx = Math.max(1, totalPixels - (tube.startPixel || 0));

        this._row(pxGroup, 'Count', this._numberInput(totalPixels, 1, 9999, 1, 'px', (val) => {
          const count = Math.max(1, Math.round(val));
          tube.pixelsPerMeter = Math.max(1, Math.round(count / tubeLength));
          this._emit('pixelsPerMeter');
          this._build();
        }));

        // Show active pixel count when startPixel > 0
        if (tube.startPixel > 0) {
          const activeRow = document.createElement('div');
          activeRow.className = 'prop-row';
          activeRow.innerHTML = `<span class="prop-label">Active</span><span style="font-size:11px;font-family:var(--font-mono);color:var(--accent-dim)">${activePx}px (skip ${tube.startPixel})</span>`;
          pxGroup.appendChild(activeRow);
        }

        // UV-mapped: show part split info for Capture's 512-channel limit
        if (isUVMapped) {
          const chPerPx = Number(tube.dmxChannelsPerPixel) || 3;
          const maxPxPerPart = Math.floor(512 / chPerPx);
          const numParts = Math.ceil(activePx / maxPxPerPart);
          let partsText;
          if (numParts <= 1) {
            partsText = `1 part (${activePx}px)`;
          } else {
            const parts = [];
            for (let p = 0; p < numParts; p++) {
              const start = p * maxPxPerPart;
              const end = Math.min(start + maxPxPerPart, activePx);
              parts.push(`${end - start}px`);
            }
            partsText = `${numParts} parts (${parts.join(' + ')})`;
          }
          const partsRow = document.createElement('div');
          partsRow.className = 'prop-row';
          partsRow.innerHTML = `<span class="prop-label">Parts</span><span style="font-size:11px;font-family:var(--font-mono);color:var(--accent-dim)">${partsText}</span>`;
          pxGroup.appendChild(partsRow);
        }
      }
    }

    // Color + Emissive only shown for discrete mode (viewport spheres)
    if (!isUVMapped) {
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
    }

    this.container.appendChild(pxGroup);
    } // end if (!tube.isPlaceholder)

    // DMX / Patch
    const dmxGroup = this._group('DMX Patch');
    const chPerPx = tube.dmxChannelsPerPixel;
    const maxStartAddr = 512 - chPerPx + 1; // 510 for RGB, 509 for RGBW

    this._row(dmxGroup, 'Fixture ID', this._numberInput(tube.fixtureId, 1, 99999, 1, '', (val) => {
      tube.fixtureId = Math.round(val);
      this._emit('fixtureId');
    }));
    this._row(dmxGroup, 'Universe', this._numberInput(tube.dmxUniverse, 1, 999, 1, '', (val) => {
      tube.dmxUniverse = Math.round(val);
      this._emit('dmxUniverse');
      this._build();
    }));
    this._row(dmxGroup, 'Address', this._numberInput(tube.dmxAddress, 1, maxStartAddr, 1, `/ ${maxStartAddr}`, (val) => {
      tube.dmxAddress = Math.min(Math.round(val), maxStartAddr);
      this._emit('dmxAddress');
      this._build();
    }));
    this._row(dmxGroup, 'Ch/Pixel', this._select(
      [
        { value: '3', label: 'RGB (3ch)' },
        { value: '4', label: 'RGBW (4ch)' },
      ],
      String(tube.dmxChannelsPerPixel),
      (val) => {
        tube.dmxChannelsPerPixel = parseInt(val);
        // Clamp address to new max
        const newMax = 512 - tube.dmxChannelsPerPixel + 1;
        if (tube.dmxAddress > newMax) tube.dmxAddress = newMax;
        this._emit('dmxChannelsPerPixel');
        this._build();
      }
    ));

    // Show computed patch summary
    if (tube.isValid) {
      if (tube.isPlaceholder) {
        // Placeholder: single fixture, simple summary
        const startUni = Number(tube.dmxUniverse) || 1;
        const startAddr = Number(tube.dmxAddress) || 1;
        const ch = Number(tube.dmxChannelsPerPixel) || 4;
        const summary = document.createElement('div');
        summary.className = 'prop-row';
        summary.innerHTML = `<span class="prop-label">Range</span><span style="font-size:11px;font-family:var(--font-mono);color:var(--accent-dim)">1 fixture → U${startUni}.${startAddr} (${ch}ch)</span>`;
        dmxGroup.appendChild(summary);
      } else {
        // Pixel-based summary using same absolute math as MVR exporter
        const curve = CurveBuilder.build(tube.controlPoints, tube.tension, tube.closed);
        if (curve) {
          const length = CurveBuilder.getLength(curve);
          const totalPixels = Math.max(1, Math.round(length * tube.pixelsPerMeter));
          const activePx = Math.max(1, totalPixels - (tube.startPixel || 0));
          const ch = Number(tube.dmxChannelsPerPixel) || 3;
          const startUni = Number(tube.dmxUniverse) || 1;
          const startAddr = Number(tube.dmxAddress) || 1;

          let absCh = (startUni - 1) * 512 + (startAddr - 1);
          let lastUni = startUni, lastAddr = startAddr;
          for (let i = 0; i < activePx; i++) {
            const aiu = (absCh % 512) + 1;
            if (aiu + ch - 1 > 512) {
              absCh = (Math.floor(absCh / 512) + 1) * 512;
            }
            lastUni = Math.floor(absCh / 512) + 1;
            lastAddr = (absCh % 512) + 1;
            absCh += ch;
          }
          const lastEnd = lastAddr + ch - 1;
          const totalCh = activePx * ch;
          const universeCount = lastUni - startUni + 1;

          const summary = document.createElement('div');
          summary.className = 'prop-row';
          summary.style.flexWrap = 'wrap';
          const rangeText = universeCount > 1
            ? `${activePx}px → U${startUni}.${startAddr} – U${lastUni}.${lastEnd} (${totalCh}ch, ${universeCount} uni)`
            : `${activePx}px → U${startUni}.${startAddr} – .${lastEnd} (${totalCh}ch)`;
          summary.innerHTML = `<span class="prop-label">Range</span><span style="font-size:11px;font-family:var(--font-mono);color:var(--accent-dim)">${rangeText}</span>`;
          dmxGroup.appendChild(summary);
        }
      }
    }

    this.container.appendChild(dmxGroup);

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

    // Tools
    if (this.hasRefModels) {
      const toolsGroup = this._group('Tools');
      const snapBtn = document.createElement('button');
      snapBtn.className = 'btn btn-block';
      snapBtn.textContent = 'Snap to Ref';
      snapBtn.title = 'Project control points onto nearest reference model surface';
      snapBtn.addEventListener('click', () => {
        if (this.onSnapToRef) this.onSnapToRef(tube);
      });
      toolsGroup.appendChild(snapBtn);
      this.container.appendChild(toolsGroup);
    }

    // Shape Dimensions (for circles and rectangles)
    if (tube.isValid && tube.closed) {
      const shapeInfo = this._detectShape(tube);
      if (shapeInfo) {
        const shapeGroup = this._group('Shape Dimensions');
        if (shapeInfo.type === 'circle') {
          const diamMm = Math.round(shapeInfo.diameter * 1000);
          this._row(shapeGroup, 'Diameter', this._numberInput(diamMm, 10, 99999, 1, 'mm', (val) => {
            if (this.onShapeDimensionChange) {
              this.onShapeDimensionChange(tube, 'circle', { diameter: val / 1000 });
            }
            setTimeout(() => this._build(), 50);
          }));
          const radiusMm = Math.round(shapeInfo.diameter * 500);
          const radiusInfo = document.createElement('div');
          radiusInfo.className = 'prop-row';
          radiusInfo.innerHTML = `<span class="prop-label">Radius</span><span style="font-size:12px; font-family:var(--font-mono)">${radiusMm}mm</span>`;
          shapeGroup.appendChild(radiusInfo);
        } else if (shapeInfo.type === 'rectangle') {
          const wMm = Math.round(shapeInfo.width * 1000);
          const hMm = Math.round(shapeInfo.height * 1000);
          this._row(shapeGroup, 'Width', this._numberInput(wMm, 10, 99999, 1, 'mm', (val) => {
            if (this.onShapeDimensionChange) {
              this.onShapeDimensionChange(tube, 'rectangle', { width: val / 1000, height: shapeInfo.height });
            }
            setTimeout(() => this._build(), 50);
          }));
          this._row(shapeGroup, 'Height', this._numberInput(hMm, 10, 99999, 1, 'mm', (val) => {
            if (this.onShapeDimensionChange) {
              this.onShapeDimensionChange(tube, 'rectangle', { width: shapeInfo.width, height: val / 1000 });
            }
            setTimeout(() => this._build(), 50);
          }));
        }
        this.container.appendChild(shapeGroup);
      }
    }

    // Info + Edit
    if (tube.isValid) {
      const infoGroup = this._group('Info');
      const curve = CurveBuilder.build(tube.controlPoints, tube.tension, tube.closed);
      const lengthMm = curve ? Math.round(CurveBuilder.getLength(curve) * 1000) : 0;

      // Editable length — type a target length to resize
      this._row(infoGroup, 'Length', this._numberInput(lengthMm, 10, 99999, 1, 'mm', (val) => {
        if (this.onResize) this.onResize(tube, val);
        // Rebuild after resize to show updated values
        setTimeout(() => this._build(), 50);
      }));

      const ptsInfo = document.createElement('div');
      ptsInfo.className = 'prop-row';
      ptsInfo.innerHTML = `<span class="prop-label">Points</span><span style="font-size:12px; font-family:var(--font-mono)">${tube.controlPoints.length}</span>`;
      infoGroup.appendChild(ptsInfo);

      // Reverse button
      const reverseBtn = document.createElement('button');
      reverseBtn.className = 'btn btn-block';
      reverseBtn.textContent = 'Reverse Direction';
      reverseBtn.title = 'Flip start/end (affects DMX addressing, pixel order)';
      reverseBtn.addEventListener('click', () => {
        if (this.onReverse) this.onReverse(tube);
        this._build();
      });
      infoGroup.appendChild(reverseBtn);

      this.container.appendChild(infoGroup);
    }
  }

  _emit(propName) {
    if (this.onPropertyChange && this.currentTube) {
      this.onPropertyChange(this.currentTube, propName);
    }
  }

  _emitBatch(propName) {
    if (this.onBatchPropertyChange && this.currentTubes.length > 0) {
      this.onBatchPropertyChange(this.currentTubes, propName);
    }
  }

  /**
   * Get a value across multiple tubes — returns value if all same, null if mixed.
   */
  _getMixedValue(tubes, prop) {
    const vals = new Set(tubes.map(t => t[prop]));
    return vals.size === 1 ? tubes[0][prop] : null;
  }

  /**
   * Build batch-edit properties UI for multiple selected tubes.
   */
  _buildMulti() {
    const tubes = this.currentTubes;
    this.container.innerHTML = '';

    // Header
    const headerGroup = this._group(`${tubes.length} Tubes Selected`);
    const headerInfo = document.createElement('div');
    headerInfo.style.fontSize = '11px';
    headerInfo.style.color = 'var(--text-secondary)';
    headerInfo.style.marginBottom = '4px';
    headerInfo.textContent = 'Changes apply to all selected tubes';
    headerGroup.appendChild(headerInfo);
    this.container.appendChild(headerGroup);

    // Fixture Preset
    const presetGroup = this._group('Fixture Preset');
    const presetOptions = getPresetList().map(p => ({
      value: p.id,
      label: p.label,
    }));
    const mixedPreset = this._getMixedValue(tubes, 'fixturePreset');
    this._row(presetGroup, 'Preset', this._select(
      presetOptions,
      mixedPreset || 'custom',
      (val) => {
        const preset = getPresetById(val);
        for (const tube of tubes) {
          tube.fixturePreset = val;
          if (preset) {
            if (preset.profile != null) tube.profile = preset.profile;
            if (preset.diameterMm != null) tube.diameterMm = preset.diameterMm;
            if (preset.pixelsPerMeter != null) tube.pixelsPerMeter = preset.pixelsPerMeter;
            if (preset.dmxChannelsPerPixel != null) tube.dmxChannelsPerPixel = preset.dmxChannelsPerPixel;
            if (preset.materialPreset != null) tube.materialPreset = preset.materialPreset;
          }
        }
        this._emitBatch('fixturePreset');
        this._buildMulti();
      }
    ));
    this.container.appendChild(presetGroup);

    // Fixture Mode (Placeholder)
    const modeGroup = this._group('Fixture Mode');
    const mixedPh = this._getMixedValue(tubes, 'isPlaceholder');
    const phRow = document.createElement('div');
    phRow.className = 'toggle-row';
    const phLabel = document.createElement('span');
    phLabel.className = 'prop-label';
    phLabel.textContent = 'Placeholder';
    phLabel.title = 'Generic fixture placeholder — swap with real fixture in Capture';
    phRow.appendChild(phLabel);
    const phToggle = document.createElement('label');
    phToggle.className = 'toggle-switch';
    const phCb = document.createElement('input');
    phCb.type = 'checkbox';
    phCb.checked = mixedPh != null ? mixedPh : tubes[0].isPlaceholder;
    phCb.addEventListener('change', () => {
      for (const tube of tubes) tube.isPlaceholder = phCb.checked;
      this._emitBatch('isPlaceholder');
      this._buildMulti();
    });
    const phSlider = document.createElement('span');
    phSlider.className = 'toggle-slider';
    phToggle.appendChild(phCb);
    phToggle.appendChild(phSlider);
    phRow.appendChild(phToggle);
    modeGroup.appendChild(phRow);

    // Fixture name + facing direction
    const anyPlaceholder = tubes.some(t => t.isPlaceholder);
    if (anyPlaceholder) {
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'prop-input';
      nameInput.placeholder = 'e.g. LX100, Sceptron 1m';
      const mixedName = this._getMixedValue(tubes, 'placeholderName');
      nameInput.value = mixedName != null ? mixedName : (tubes[0].placeholderName || '');
      nameInput.addEventListener('change', () => {
        const val = nameInput.value.trim();
        for (const tube of tubes) tube.placeholderName = val;
        this._emitBatch('placeholderName');
      });
      this._row(modeGroup, 'Fixture', nameInput);

      const mixedFacing = this._getMixedValue(tubes, 'facingDirection');
      this._row(modeGroup, 'Facing', this._select(
        [
          { value: 'up', label: 'Up' },
          { value: 'down', label: 'Down' },
          { value: 'inward', label: 'Inward' },
          { value: 'outward', label: 'Outward' },
        ],
        mixedFacing || tubes[0].facingDirection || 'up',
        (val) => {
          for (const tube of tubes) tube.facingDirection = val;
          this._emitBatch('facingDirection');
        }
      ));
    }
    this.container.appendChild(modeGroup);

    // Cross Section
    const csGroup = this._group('Cross Section');
    const mixedProfile = this._getMixedValue(tubes, 'profile');
    this._row(csGroup, 'Profile', this._select(
      [
        { value: 'round', label: 'Round' },
        { value: 'square', label: 'Square' },
        { value: 'rect', label: 'Rectangular' },
      ],
      mixedProfile || 'round',
      (val) => {
        for (const tube of tubes) tube.profile = val;
        this._emitBatch('profile');
        this._buildMulti();
      }
    ));

    const effectiveProfile = mixedProfile || tubes[0].profile;
    if (effectiveProfile === 'round' || effectiveProfile === 'square') {
      const mixedDia = this._getMixedValue(tubes, 'diameterMm');
      this._row(csGroup, 'Diameter', this._numberInput(
        mixedDia != null ? mixedDia : tubes[0].diameterMm,
        4, 50, 0.5, mixedDia == null ? '(mixed)' : 'mm',
        (val) => {
          for (const tube of tubes) tube.diameterMm = val;
          this._emitBatch('diameterMm');
        }
      ));
    } else {
      const mixedW = this._getMixedValue(tubes, 'widthMm');
      this._row(csGroup, 'Width', this._numberInput(
        mixedW != null ? mixedW : tubes[0].widthMm,
        3, 30, 0.5, mixedW == null ? '(mixed)' : 'mm',
        (val) => {
          for (const tube of tubes) tube.widthMm = val;
          this._emitBatch('widthMm');
        }
      ));
      const mixedH = this._getMixedValue(tubes, 'heightMm');
      this._row(csGroup, 'Height', this._numberInput(
        mixedH != null ? mixedH : tubes[0].heightMm,
        4, 40, 0.5, mixedH == null ? '(mixed)' : 'mm',
        (val) => {
          for (const tube of tubes) tube.heightMm = val;
          this._emitBatch('heightMm');
        }
      ));
    }
    this.container.appendChild(csGroup);

    // Material
    const matGroup = this._group('Material');
    const matOptions = TubeMaterialFactory.getPresetNames().map(n => ({
      value: n,
      label: TubeMaterialFactory.getPresetLabel(n),
    }));
    const mixedMat = this._getMixedValue(tubes, 'materialPreset');
    this._row(matGroup, 'Preset', this._select(matOptions, mixedMat || tubes[0].materialPreset, (val) => {
      for (const tube of tubes) tube.materialPreset = val;
      this._emitBatch('materialPreset');
    }));
    this.container.appendChild(matGroup);

    // Pixels (hidden when all placeholders)
    const allPlaceholders = tubes.every(t => t.isPlaceholder);
    if (!allPlaceholders) {
    const pxGroup = this._group('Pixels');

    // Mode (discrete / UV-mapped)
    const mixedMode = this._getMixedValue(tubes, 'pixelMode');
    this._row(pxGroup, 'Mode', this._select(
      [
        { value: 'discrete', label: 'Discrete Pixels' },
        { value: 'uv-mapped', label: 'UV Mapped' },
      ],
      mixedMode || (tubes[0].pixelMode || 'discrete'),
      (val) => {
        for (const tube of tubes) tube.pixelMode = val;
        this._emitBatch('pixelMode');
        this._buildMulti();
      }
    ));

    const mixedPpm = this._getMixedValue(tubes, 'pixelsPerMeter');
    const pitchOptions = Object.entries(PIXEL_PITCH_PRESETS).map(([, p]) => ({
      value: String(p.pixelsPerMeter),
      label: p.label,
    }));
    pitchOptions.push({ value: 'custom', label: 'Custom...' });
    const ppmVal = mixedPpm != null ? String(mixedPpm) : String(tubes[0].pixelsPerMeter);
    const isPpmPreset = pitchOptions.some(o => o.value === ppmVal);

    this._row(pxGroup, 'Pitch', this._select(
      pitchOptions,
      isPpmPreset ? ppmVal : 'custom',
      (val) => {
        if (val !== 'custom') {
          const ppm = parseInt(val);
          for (const tube of tubes) tube.pixelsPerMeter = ppm;
          this._emitBatch('pixelsPerMeter');
          this._buildMulti();
        }
      }
    ));

    if (!isPpmPreset) {
      this._row(pxGroup, 'px/m', this._numberInput(
        mixedPpm != null ? mixedPpm : tubes[0].pixelsPerMeter,
        1, 500, 1, mixedPpm == null ? '(mixed)' : '',
        (val) => {
          const ppm = Math.round(val);
          for (const tube of tubes) tube.pixelsPerMeter = ppm;
          this._emitBatch('pixelsPerMeter');
        }
      ));
    }

    // Ch/Pixel
    const mixedCh = this._getMixedValue(tubes, 'dmxChannelsPerPixel');
    this._row(pxGroup, 'Ch/Pixel', this._select(
      [
        { value: '3', label: 'RGB (3ch)' },
        { value: '4', label: 'RGBW (4ch)' },
      ],
      mixedCh != null ? String(mixedCh) : String(tubes[0].dmxChannelsPerPixel),
      (val) => {
        const ch = parseInt(val);
        for (const tube of tubes) tube.dmxChannelsPerPixel = ch;
        this._emitBatch('dmxChannelsPerPixel');
      }
    ));

    // Pixel color + emissive (discrete mode)
    const isAllDiscrete = mixedMode === 'discrete' || (mixedMode == null && tubes.every(t => (t.pixelMode || 'discrete') === 'discrete'));
    if (isAllDiscrete) {
      const mixedColor = this._getMixedValue(tubes, 'pixelColor');
      this._row(pxGroup, 'Color', this._colorInput(mixedColor || tubes[0].pixelColor, (val) => {
        for (const tube of tubes) tube.pixelColor = val;
        this._emitBatch('pixelColor');
      }));

      const mixedEmissive = this._getMixedValue(tubes, 'pixelEmissive');
      const emRow = document.createElement('div');
      emRow.className = 'toggle-row';
      const emLabel = document.createElement('span');
      emLabel.className = 'prop-label';
      emLabel.textContent = 'Emissive';
      emRow.appendChild(emLabel);
      const emToggle = document.createElement('label');
      emToggle.className = 'toggle-switch';
      const emCb = document.createElement('input');
      emCb.type = 'checkbox';
      emCb.checked = mixedEmissive != null ? mixedEmissive : tubes[0].pixelEmissive;
      emCb.addEventListener('change', () => {
        for (const tube of tubes) tube.pixelEmissive = emCb.checked;
        this._emitBatch('pixelEmissive');
      });
      const emSlider = document.createElement('span');
      emSlider.className = 'toggle-slider';
      emToggle.appendChild(emCb);
      emToggle.appendChild(emSlider);
      emRow.appendChild(emToggle);
      pxGroup.appendChild(emRow);
    }

    this.container.appendChild(pxGroup);
    } // end if (!allPlaceholders)

    // Curve
    const curveGroup = this._group('Curve');
    const mixedTension = this._getMixedValue(tubes, 'tension');
    this._row(curveGroup, 'Tension', this._numberInput(
      mixedTension != null ? mixedTension : tubes[0].tension,
      0, 1, 0.05, mixedTension == null ? '(mixed)' : '',
      (val) => {
        for (const tube of tubes) tube.tension = val;
        this._emitBatch('tension');
      }
    ));
    this.container.appendChild(curveGroup);

    // Tools (snap to ref)
    if (this.hasRefModels) {
      const toolsGroup = this._group('Tools');
      const snapBtn = document.createElement('button');
      snapBtn.className = 'btn btn-block';
      snapBtn.textContent = 'Snap All to Ref';
      snapBtn.title = 'Project all selected tubes onto nearest reference model surface';
      snapBtn.addEventListener('click', () => {
        for (const tube of tubes) {
          if (this.onSnapToRef) this.onSnapToRef(tube);
        }
      });
      toolsGroup.appendChild(snapBtn);
      this.container.appendChild(toolsGroup);
    }
  }

  _emitRef(propName) {
    if (this.onRefModelChange && this.currentRefModel) {
      this.onRefModelChange(this.currentRefModel, propName);
    }
  }

  /**
   * Build ref model properties UI.
   */
  _buildRefModel() {
    const ref = this.currentRefModel;
    this.container.innerHTML = '';

    // Name (read-only)
    const nameGroup = this._group('Reference Model');
    const nameRow = document.createElement('div');
    nameRow.className = 'prop-row';
    const nameLabel = document.createElement('span');
    nameLabel.className = 'prop-label';
    nameLabel.textContent = 'Name';
    nameRow.appendChild(nameLabel);
    const nameVal = document.createElement('span');
    nameVal.style.fontSize = '12px';
    nameVal.style.fontFamily = 'var(--font-mono)';
    nameVal.style.overflow = 'hidden';
    nameVal.style.textOverflow = 'ellipsis';
    nameVal.style.whiteSpace = 'nowrap';
    nameVal.textContent = ref.name;
    nameRow.appendChild(nameVal);
    nameGroup.appendChild(nameRow);

    if (ref.needsReimport) {
      const ghostRow = document.createElement('div');
      ghostRow.className = 'prop-row';
      ghostRow.innerHTML = '<span style="font-size:11px;color:var(--warning);font-style:italic">File not loaded — click "reimport" in the tube list</span>';
      nameGroup.appendChild(ghostRow);
    }

    this.container.appendChild(nameGroup);

    // Visibility & Display
    const displayGroup = this._group('Display');

    // Visible toggle
    const visRow = document.createElement('div');
    visRow.className = 'toggle-row';
    const visLabel = document.createElement('span');
    visLabel.className = 'prop-label';
    visLabel.textContent = 'Visible';
    visRow.appendChild(visLabel);
    const visToggle = document.createElement('label');
    visToggle.className = 'toggle-switch';
    const visCb = document.createElement('input');
    visCb.type = 'checkbox';
    visCb.checked = ref.visible;
    visCb.addEventListener('change', () => {
      ref.visible = visCb.checked;
      this._emitRef('visible');
    });
    const visSlider = document.createElement('span');
    visSlider.className = 'toggle-slider';
    visToggle.appendChild(visCb);
    visToggle.appendChild(visSlider);
    visRow.appendChild(visToggle);
    displayGroup.appendChild(visRow);

    // Opacity slider
    this._row(displayGroup, 'Opacity', this._rangeInput(ref.opacity, 0, 1, 0.01, (val) => {
      ref.opacity = val;
      this._emitRef('opacity');
    }, `${Math.round(ref.opacity * 100)}%`));

    // Wireframe toggle
    const wireRow = document.createElement('div');
    wireRow.className = 'toggle-row';
    const wireLabel = document.createElement('span');
    wireLabel.className = 'prop-label';
    wireLabel.textContent = 'Wireframe';
    wireRow.appendChild(wireLabel);
    const wireToggle = document.createElement('label');
    wireToggle.className = 'toggle-switch';
    const wireCb = document.createElement('input');
    wireCb.type = 'checkbox';
    wireCb.checked = ref.wireframe;
    wireCb.addEventListener('change', () => {
      ref.wireframe = wireCb.checked;
      this._emitRef('wireframe');
    });
    const wireSlider = document.createElement('span');
    wireSlider.className = 'toggle-slider';
    wireToggle.appendChild(wireCb);
    wireToggle.appendChild(wireSlider);
    wireRow.appendChild(wireToggle);
    displayGroup.appendChild(wireRow);

    // Clean Edges toggle (smooth shading — hides hard edges)
    const smoothRow = document.createElement('div');
    smoothRow.className = 'toggle-row';
    const smoothLabel = document.createElement('span');
    smoothLabel.className = 'prop-label';
    smoothLabel.textContent = 'Clean Edges';
    smoothLabel.title = 'Smooth shading to hide hard edges for a cleaner look';
    smoothRow.appendChild(smoothLabel);
    const smoothToggle = document.createElement('label');
    smoothToggle.className = 'toggle-switch';
    const smoothCb = document.createElement('input');
    smoothCb.type = 'checkbox';
    smoothCb.checked = ref.smoothEdges;
    smoothCb.addEventListener('change', () => {
      ref.smoothEdges = smoothCb.checked;
      this._emitRef('smoothEdges');
    });
    const smoothSlider = document.createElement('span');
    smoothSlider.className = 'toggle-slider';
    smoothToggle.appendChild(smoothCb);
    smoothToggle.appendChild(smoothSlider);
    smoothRow.appendChild(smoothToggle);
    displayGroup.appendChild(smoothRow);

    this.container.appendChild(displayGroup);

    // Transform
    const xformGroup = this._group('Transform');

    // Position X/Y/Z
    this._row(xformGroup, 'Pos X', this._numberInput(ref.position.x, -999, 999, 0.01, 'm', (val) => {
      ref.position.x = val;
      this._emitRef('position');
    }));
    this._row(xformGroup, 'Pos Y', this._numberInput(ref.position.y, -999, 999, 0.01, 'm', (val) => {
      ref.position.y = val;
      this._emitRef('position');
    }));
    this._row(xformGroup, 'Pos Z', this._numberInput(ref.position.z, -999, 999, 0.01, 'm', (val) => {
      ref.position.z = val;
      this._emitRef('position');
    }));

    // Rotation X/Y/Z (display in degrees, store in radians)
    const RAD2DEG = 180 / Math.PI;
    const DEG2RAD = Math.PI / 180;
    this._row(xformGroup, 'Rot X', this._numberInput(ref.rotation.x * RAD2DEG, -360, 360, 1, 'deg', (val) => {
      ref.rotation.x = val * DEG2RAD;
      this._emitRef('rotation');
    }));
    this._row(xformGroup, 'Rot Y', this._numberInput(ref.rotation.y * RAD2DEG, -360, 360, 1, 'deg', (val) => {
      ref.rotation.y = val * DEG2RAD;
      this._emitRef('rotation');
    }));
    this._row(xformGroup, 'Rot Z', this._numberInput(ref.rotation.z * RAD2DEG, -360, 360, 1, 'deg', (val) => {
      ref.rotation.z = val * DEG2RAD;
      this._emitRef('rotation');
    }));

    // Uniform scale
    this._row(xformGroup, 'Scale', this._numberInput(ref.scale, 0.01, 10, 0.01, 'x', (val) => {
      ref.scale = val;
      this._emitRef('scale');
    }));

    this.container.appendChild(xformGroup);

    // Trace Ref — one-click tube creation from model outline
    if (ref.group && !ref.needsReimport) {
      const traceGroup = this._group('Trace Edges');
      const traceHint = document.createElement('div');
      traceHint.style.fontSize = '10px';
      traceHint.style.color = 'var(--text-muted)';
      traceHint.style.marginBottom = '6px';
      traceHint.textContent = 'Create a tube following the model outline';
      traceGroup.appendChild(traceHint);

      const traceBtnRow = document.createElement('div');
      traceBtnRow.style.display = 'flex';
      traceBtnRow.style.gap = '6px';

      const traceCircleBtn = document.createElement('button');
      traceCircleBtn.className = 'btn btn-accent btn-block';
      traceCircleBtn.textContent = 'Trace Circle';
      traceCircleBtn.addEventListener('click', () => {
        if (this.onTraceRef) this.onTraceRef('circle');
      });
      traceBtnRow.appendChild(traceCircleBtn);

      const traceRectBtn = document.createElement('button');
      traceRectBtn.className = 'btn btn-accent btn-block';
      traceRectBtn.textContent = 'Trace Rectangle';
      traceRectBtn.addEventListener('click', () => {
        if (this.onTraceRef) this.onTraceRef('rectangle');
      });
      traceBtnRow.appendChild(traceRectBtn);

      traceGroup.appendChild(traceBtnRow);
      this.container.appendChild(traceGroup);

      // Map Edges — auto-detect sharp edges and create tubes along them
      const edgeGroup = this._group('Map Edges');
      const edgeHint = document.createElement('div');
      edgeHint.style.fontSize = '10px';
      edgeHint.style.color = 'var(--text-muted)';
      edgeHint.style.marginBottom = '6px';
      edgeHint.textContent = 'Auto-detect sharp edges and create tubes';
      edgeGroup.appendChild(edgeHint);

      // Angle threshold slider
      const angleRow = document.createElement('div');
      angleRow.className = 'prop-row';
      const angleLabel = document.createElement('span');
      angleLabel.className = 'prop-label';
      angleLabel.textContent = 'Angle';
      angleRow.appendChild(angleLabel);
      this._edgeAngleValue = 30;

      const angleWrap = document.createElement('div');
      angleWrap.style.display = 'flex';
      angleWrap.style.alignItems = 'center';
      angleWrap.style.flex = '1';
      angleWrap.style.gap = '6px';
      const angleSlider = document.createElement('input');
      angleSlider.type = 'range';
      angleSlider.className = 'prop-range';
      angleSlider.min = 1;
      angleSlider.max = 89;
      angleSlider.step = 1;
      angleSlider.value = 30;
      const angleDisplay = document.createElement('span');
      angleDisplay.style.fontSize = '10px';
      angleDisplay.style.fontFamily = 'var(--font-mono)';
      angleDisplay.style.color = 'var(--text-secondary)';
      angleDisplay.style.minWidth = '32px';
      angleDisplay.style.textAlign = 'right';
      angleDisplay.textContent = '30°';
      angleSlider.addEventListener('input', () => {
        const v = parseInt(angleSlider.value);
        angleDisplay.textContent = `${v}°`;
        this._edgeAngleValue = v;
      });
      angleWrap.appendChild(angleSlider);
      angleWrap.appendChild(angleDisplay);
      angleRow.appendChild(angleWrap);
      edgeGroup.appendChild(angleRow);

      const mapEdgesBtn = document.createElement('button');
      mapEdgesBtn.className = 'btn btn-accent btn-block';
      mapEdgesBtn.textContent = 'Map Edges';
      mapEdgesBtn.style.marginTop = '6px';
      mapEdgesBtn.addEventListener('click', () => {
        if (this.onMapEdges) this.onMapEdges(this._edgeAngleValue);
      });
      edgeGroup.appendChild(mapEdgesBtn);
      this.container.appendChild(edgeGroup);
    }

    // Remove button
    const removeGroup = document.createElement('div');
    removeGroup.style.marginTop = '12px';
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-danger btn-block';
    removeBtn.textContent = 'Remove Reference Model';
    removeBtn.addEventListener('click', () => {
      if (this.onRefModelRemove) this.onRefModelRemove(ref);
    });
    removeGroup.appendChild(removeBtn);
    this.container.appendChild(removeGroup);
  }

  /**
   * Range input (slider) with value display.
   */
  _rangeInput(value, min, max, step, onChange, displayText) {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.flex = '1';
    wrap.style.gap = '6px';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'prop-range';
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = value;

    const display = document.createElement('span');
    display.style.fontSize = '10px';
    display.style.fontFamily = 'var(--font-mono)';
    display.style.color = 'var(--text-secondary)';
    display.style.minWidth = '32px';
    display.style.textAlign = 'right';
    display.textContent = displayText || value;

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      display.textContent = `${Math.round(v * 100)}%`;
      onChange(v);
    });

    wrap.appendChild(slider);
    wrap.appendChild(display);
    return wrap;
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

  /**
   * Detect if a closed tube is a circle or rectangle from its control points.
   * Circles have ~36 equispaced points at nearly equal distance from center.
   * Rectangles have ~40 points forming a rectangular outline.
   * @returns {{ type: 'circle'|'rectangle', ... } | null}
   */
  _detectShape(tube) {
    if (!tube.closed || tube.controlPoints.length < 8) return null;

    const pts = tube.controlPoints;
    const n = pts.length;

    // Compute center
    const center = pts[0].clone();
    for (let i = 1; i < n; i++) center.add(pts[i]);
    center.divideScalar(n);

    // Compute distances from center
    const dists = pts.map(p => p.distanceTo(center));
    const avgDist = dists.reduce((a, b) => a + b, 0) / n;
    const maxDeviation = Math.max(...dists.map(d => Math.abs(d - avgDist)));

    // Circle detection: all points approximately same distance from center
    // Allow 5% deviation
    if (maxDeviation / avgDist < 0.05 && n >= 16) {
      return { type: 'circle', center, diameter: avgDist * 2 };
    }

    // Rectangle detection: compute bounding box and check if points lie on edges
    // Determine which plane the shape is on
    const rangeX = Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x));
    const rangeY = Math.max(...pts.map(p => p.y)) - Math.min(...pts.map(p => p.y));
    const rangeZ = Math.max(...pts.map(p => p.z)) - Math.min(...pts.map(p => p.z));

    let width, height, plane;
    if (rangeY < rangeX * 0.01 && rangeY < rangeZ * 0.01) {
      plane = 'XZ'; width = rangeX; height = rangeZ;
    } else if (rangeZ < rangeX * 0.01 && rangeZ < rangeY * 0.01) {
      plane = 'XY'; width = rangeX; height = rangeY;
    } else if (rangeX < rangeY * 0.01 && rangeX < rangeZ * 0.01) {
      plane = 'YZ'; width = rangeY; height = rangeZ;
    } else {
      return null; // Not flat on a plane
    }

    // Check if it's rectangular: most points should be near the edges of the bounding box
    if (n >= 20 && width > 0.01 && height > 0.01) {
      return { type: 'rectangle', center, width, height, plane };
    }

    return null;
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
