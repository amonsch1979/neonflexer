/**
 * Modal dialog for creating 3D shapes.
 * Each edge becomes a tube with connectors at corners.
 * Follows the same pattern as CustomFixtureDialog.
 */
export class ShapeWizardDialog {
  constructor() {
    this.onConfirm = null; // (config) => {}
    this.onCancel = null;  // () => {}
    this._overlay = null;
    this._currentCfg = null; // live reference for input change handlers
    this._lastConfig = {
      shape: 'box',
      boxX: 1,
      boxY: 1,
      boxZ: 1,
      linkDimensions: true,
      sideLength: 1,
      starPoints: 5,
      starOuterRadius: 0.5,
      starInnerRatio: 0.5,
      gridX: 2,
      gridY: 2,
      gridZ: 2,
      gridCellSize: 0.5,
      cylSides: 8,
      cylRings: 3,
      cylRadius: 0.5,
      cylHeight: 1,
      sphMeridians: 8,
      sphParallels: 6,
      sphRadius: 0.5,
      coneSides: 8,
      coneRadius: 0.5,
      coneHeight: 1,
      prismSides: 6,
      prismSideLength: 0.5,
      prismHeight: 1,
      torusMajorSeg: 12,
      torusMinorSeg: 6,
      torusMajorR: 0.5,
      torusTubeR: 0.15,
      connectorDiameterMm: 20,
      connectorHeightMm: 20,
      isPlaceholder: false,
      fixtureLengthM: 1,
      fixtureLenX: 1,
      fixtureLenY: 1,
      fixtureLenZ: 1,
      facingDirection: 'outward',
      placeholderName: '',
    };
    this._build();
  }

  show(defaults) {
    const cfg = defaults || this._lastConfig;
    this._populateForm(cfg);
    this._overlay.classList.add('visible');
    requestAnimationFrame(() => {
      const first = this._panel.querySelector('input, select');
      if (first) first.focus();
    });
  }

  hide() {
    this._overlay.classList.remove('visible');
  }

  _build() {
    this._overlay = document.createElement('div');
    this._overlay.className = 'custom-fixture-overlay';
    this._overlay.addEventListener('click', (e) => {
      if (e.target === this._overlay) this._cancel();
    });

    this._panel = document.createElement('div');
    this._panel.className = 'custom-fixture-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'custom-fixture-header';
    header.innerHTML = `<span>SHAPE WIZARD</span>`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'help-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this._cancel());
    header.appendChild(closeBtn);
    this._panel.appendChild(header);

    // Body
    this._body = document.createElement('div');
    this._body.className = 'custom-fixture-body';
    this._panel.appendChild(this._body);

    // Preview canvas
    this._previewCanvas = document.createElement('canvas');
    this._previewCanvas.width = 280;
    this._previewCanvas.height = 180;
    this._previewCanvas.style.width = '100%';
    this._previewCanvas.style.background = 'var(--bg-dark, #111)';
    this._previewCanvas.style.borderRadius = '4px';
    this._previewCanvas.style.marginBottom = '8px';

    // Footer
    const footer = document.createElement('div');
    footer.className = 'custom-fixture-footer';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this._cancel());
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.textContent = 'Create Shape';
    confirmBtn.addEventListener('click', () => this._confirm());
    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    this._panel.appendChild(footer);

    this._overlay.appendChild(this._panel);
    document.body.appendChild(this._overlay);

    // Live preview: redraw on any dimension input change
    this._body.addEventListener('input', () => this._onInputChange());

    this._overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._cancel();
      if (e.key === 'Enter' && e.target.tagName !== 'SELECT') this._confirm();
    });
  }

  _populateForm(cfg) {
    this._currentCfg = cfg;
    this._body.innerHTML = '';

    // Shape type selection
    const shapeSection = this._section('Shape Type');
    const shapeGrid = document.createElement('div');
    shapeGrid.style.display = 'grid';
    shapeGrid.style.gridTemplateColumns = 'repeat(4, 1fr)';
    shapeGrid.style.gap = '6px';
    shapeGrid.style.marginBottom = '8px';

    const shapes = [
      { id: 'box', label: 'Box', icon: this._boxSvg() },
      { id: 'triangle', label: 'Triangle', icon: this._triSvg() },
      { id: 'pentagon', label: 'Pentagon', icon: this._pentSvg() },
      { id: 'hexagon', label: 'Hexagon', icon: this._hexSvg() },
      { id: 'star', label: 'Star', icon: this._starSvg() },
      { id: 'grid', label: 'Grid', icon: this._gridSvg() },
      { id: 'cylinder', label: 'Cylinder', icon: this._cylinderSvg() },
      { id: 'sphere', label: 'Sphere', icon: this._sphereSvg() },
      { id: 'cone', label: 'Cone', icon: this._coneSvg() },
      { id: 'prism', label: 'Prism', icon: this._prismSvg() },
      { id: 'torus', label: 'Torus', icon: this._torusSvg() },
    ];

    for (const s of shapes) {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.style.display = 'flex';
      btn.style.flexDirection = 'column';
      btn.style.alignItems = 'center';
      btn.style.padding = '8px 4px';
      btn.style.gap = '4px';
      btn.style.fontSize = '10px';
      if (cfg.shape === s.id) {
        btn.style.border = '2px solid var(--accent, #00d4ff)';
        btn.style.background = 'rgba(0, 212, 255, 0.1)';
      }
      btn.innerHTML = s.icon;
      const label = document.createElement('span');
      label.textContent = s.label;
      btn.appendChild(label);
      btn.addEventListener('click', () => {
        cfg.shape = s.id;
        this._populateForm(cfg);
      });
      shapeGrid.appendChild(btn);
    }
    shapeSection.appendChild(shapeGrid);
    this._body.appendChild(shapeSection);

    // Preview canvas
    this._body.appendChild(this._previewCanvas);

    // Placeholder mode controls
    const phSection = this._section('Fixture Mode');

    // Placeholder toggle
    const phRow = document.createElement('div');
    phRow.className = 'toggle-row';
    const phLabel = document.createElement('span');
    phLabel.className = 'prop-label';
    phLabel.textContent = 'Placeholders';
    phLabel.title = 'Each edge becomes a generic fixture placeholder for Capture';
    phRow.appendChild(phLabel);
    const phToggle = document.createElement('label');
    phToggle.className = 'toggle-switch';
    const phCb = document.createElement('input');
    phCb.type = 'checkbox';
    phCb.id = 'sw-placeholder';
    phCb.checked = cfg.isPlaceholder;
    phCb.addEventListener('change', () => {
      cfg.isPlaceholder = phCb.checked;
      this._populateForm(cfg);
    });
    const phSlider = document.createElement('span');
    phSlider.className = 'toggle-slider';
    phToggle.appendChild(phCb);
    phToggle.appendChild(phSlider);
    phRow.appendChild(phToggle);
    phSection.appendChild(phRow);

    // Fixture name, length + facing (only when placeholder ON)
    if (cfg.isPlaceholder) {
      // Fixture name (shown in Capture after MVR import)
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'prop-input';
      nameInput.id = 'sw-ph-name';
      nameInput.placeholder = 'e.g. LX100, Sceptron 1m';
      nameInput.value = cfg.placeholderName || '';
      nameInput.addEventListener('change', () => { cfg.placeholderName = nameInput.value.trim(); });
      this._formRow(phSection, 'Fixture', nameInput);

      const fixtureLenOptions = [
        { value: '0.2', label: '0.2m (LS Strip)' },
        { value: '0.5', label: '0.5m (LS Strip)' },
        { value: '0.6', label: '0.6m (LS Strip)' },
        { value: '1', label: '1m (LS Strip)' },
        { value: '1.5', label: '1.5m' },
        { value: '2', label: '2m (LS Strip)' },
      ];

      const isBoxLike = cfg.shape === 'box' || cfg.shape === 'grid';
      if (isBoxLike) {
        // Per-axis fixture lengths for box/grid
        this._formRow(phSection, 'Length X', this._selectEl(
          fixtureLenOptions, String(cfg.fixtureLenX || cfg.fixtureLengthM),
          (val) => { cfg.fixtureLenX = parseFloat(val); this._populateForm(cfg); },
          'sw-fix-len-x'
        ));
        this._formRow(phSection, 'Height Y', this._selectEl(
          fixtureLenOptions, String(cfg.fixtureLenY || cfg.fixtureLengthM),
          (val) => { cfg.fixtureLenY = parseFloat(val); this._populateForm(cfg); },
          'sw-fix-len-y'
        ));
        this._formRow(phSection, 'Depth Z', this._selectEl(
          fixtureLenOptions, String(cfg.fixtureLenZ || cfg.fixtureLengthM),
          (val) => { cfg.fixtureLenZ = parseFloat(val); this._populateForm(cfg); },
          'sw-fix-len-z'
        ));
      } else {
        // Single fixture length for all edges
        this._formRow(phSection, 'Fixture Len', this._selectEl(
          fixtureLenOptions,
          String(cfg.fixtureLengthM),
          (val) => {
            cfg.fixtureLengthM = parseFloat(val);
            this._populateForm(cfg);
          },
          'sw-fixture-len'
        ));
      }

      this._formRow(phSection, 'Facing', this._selectEl(
        [
          { value: 'up', label: 'Up' },
          { value: 'down', label: 'Down' },
          { value: 'inward', label: 'Inward' },
          { value: 'outward', label: 'Outward' },
        ],
        cfg.facingDirection,
        (val) => { cfg.facingDirection = val; },
        'sw-facing'
      ));
    }

    this._body.appendChild(phSection);

    // Dimension inputs based on shape type
    const dimSection = this._section('Dimensions');

    if (cfg.isPlaceholder) {
      // Placeholder mode: dimensions derived from fixture length
      this._buildPlaceholderDimensions(dimSection, cfg);
    } else if (cfg.shape === 'box') {
      this._formRow(dimSection, 'Length X', this._numberWithUnit(cfg.boxX, 0.05, 50, 0.05, 'm', 'sw-box-x'));
      this._formRow(dimSection, 'Height Y', this._numberWithUnit(cfg.boxY, 0.05, 50, 0.05, 'm', 'sw-box-y'));
      this._formRow(dimSection, 'Depth Z', this._numberWithUnit(cfg.boxZ, 0.05, 50, 0.05, 'm', 'sw-box-z'));

      // Link dimensions checkbox
      const linkRow = document.createElement('div');
      linkRow.className = 'prop-row';
      const linkLabel = document.createElement('span');
      linkLabel.className = 'prop-label';
      linkLabel.textContent = 'Link';
      linkRow.appendChild(linkLabel);
      const linkCb = document.createElement('input');
      linkCb.type = 'checkbox';
      linkCb.id = 'sw-link';
      linkCb.checked = cfg.linkDimensions;
      linkRow.appendChild(linkCb);
      const linkText = document.createElement('span');
      linkText.style.fontSize = '11px';
      linkText.style.color = 'var(--text-secondary)';
      linkText.textContent = 'Uniform dimensions';
      linkRow.appendChild(linkText);
      dimSection.appendChild(linkRow);
    } else if (cfg.shape === 'star') {
      this._formRow(dimSection, 'Points', this._numberWithUnit(cfg.starPoints, 3, 12, 1, '', 'sw-star-points'));
      this._formRow(dimSection, 'Outer R', this._numberWithUnit(cfg.starOuterRadius, 0.05, 50, 0.05, 'm', 'sw-star-outer'));
      this._formRow(dimSection, 'Inner %', this._numberWithUnit(Math.round(cfg.starInnerRatio * 100), 10, 90, 5, '%', 'sw-star-inner'));
    } else if (cfg.shape === 'grid') {
      this._formRow(dimSection, 'Cells X', this._numberWithUnit(cfg.gridX, 1, 10, 1, '', 'sw-grid-x'));
      this._formRow(dimSection, 'Cells Y', this._numberWithUnit(cfg.gridY, 1, 10, 1, '', 'sw-grid-y'));
      this._formRow(dimSection, 'Cells Z', this._numberWithUnit(cfg.gridZ, 1, 10, 1, '', 'sw-grid-z'));
      this._formRow(dimSection, 'Cell Size', this._numberWithUnit(cfg.gridCellSize, 0.05, 10, 0.05, 'm', 'sw-grid-cell'));
    } else if (cfg.shape === 'cylinder') {
      this._formRow(dimSection, 'Sides', this._numberWithUnit(cfg.cylSides, 4, 32, 1, '', 'sw-cyl-sides'));
      this._formRow(dimSection, 'Rings', this._numberWithUnit(cfg.cylRings, 1, 10, 1, '', 'sw-cyl-rings'));
      this._formRow(dimSection, 'Radius', this._numberWithUnit(cfg.cylRadius, 0.05, 50, 0.05, 'm', 'sw-cyl-radius'));
      this._formRow(dimSection, 'Height', this._numberWithUnit(cfg.cylHeight, 0.05, 50, 0.05, 'm', 'sw-cyl-height'));
    } else if (cfg.shape === 'sphere') {
      this._formRow(dimSection, 'Meridians', this._numberWithUnit(cfg.sphMeridians, 4, 24, 1, '', 'sw-sph-mer'));
      this._formRow(dimSection, 'Parallels', this._numberWithUnit(cfg.sphParallels, 3, 16, 1, '', 'sw-sph-par'));
      this._formRow(dimSection, 'Radius', this._numberWithUnit(cfg.sphRadius, 0.05, 50, 0.05, 'm', 'sw-sph-radius'));
    } else if (cfg.shape === 'cone') {
      this._formRow(dimSection, 'Sides', this._numberWithUnit(cfg.coneSides, 3, 32, 1, '', 'sw-cone-sides'));
      this._formRow(dimSection, 'Radius', this._numberWithUnit(cfg.coneRadius, 0.05, 50, 0.05, 'm', 'sw-cone-radius'));
      this._formRow(dimSection, 'Height', this._numberWithUnit(cfg.coneHeight, 0.05, 50, 0.05, 'm', 'sw-cone-height'));
    } else if (cfg.shape === 'prism') {
      this._formRow(dimSection, 'Sides', this._numberWithUnit(cfg.prismSides, 3, 32, 1, '', 'sw-prism-sides'));
      this._formRow(dimSection, 'Side Len', this._numberWithUnit(cfg.prismSideLength, 0.05, 50, 0.05, 'm', 'sw-prism-sidelen'));
      this._formRow(dimSection, 'Height', this._numberWithUnit(cfg.prismHeight, 0.05, 50, 0.05, 'm', 'sw-prism-height'));
    } else if (cfg.shape === 'torus') {
      this._formRow(dimSection, 'Major Seg', this._numberWithUnit(cfg.torusMajorSeg, 4, 32, 1, '', 'sw-tor-majseg'));
      this._formRow(dimSection, 'Minor Seg', this._numberWithUnit(cfg.torusMinorSeg, 3, 16, 1, '', 'sw-tor-minseg'));
      this._formRow(dimSection, 'Major R', this._numberWithUnit(cfg.torusMajorR, 0.05, 50, 0.05, 'm', 'sw-tor-majr'));
      this._formRow(dimSection, 'Tube R', this._numberWithUnit(cfg.torusTubeR, 0.01, 10, 0.01, 'm', 'sw-tor-tuber'));
    } else {
      // Triangle, pentagon, hexagon — just side length
      this._formRow(dimSection, 'Side Length', this._numberWithUnit(cfg.sideLength, 0.05, 50, 0.05, 'm', 'sw-side'));
    }

    this._body.appendChild(dimSection);

    // Connector section
    const connSection = this._section('Connectors');
    this._formRow(connSection, 'Diameter', this._numberWithUnit(cfg.connectorDiameterMm, 5, 60, 1, 'mm', 'sw-conn-dia'));
    this._formRow(connSection, 'Height', this._numberWithUnit(cfg.connectorHeightMm, 5, 60, 1, 'mm', 'sw-conn-ht'));
    this._body.appendChild(connSection);

    // Draw preview
    this._drawPreview(cfg);
  }

  _drawPreview(cfg) {
    const canvas = this._previewCanvas;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2, cy = h / 2;
    const scale = Math.min(w, h) * 0.35;

    // 3D shapes use cabinet projection
    const is3DShape = ['box', 'grid', 'cylinder', 'sphere', 'cone', 'prism', 'torus'].includes(cfg.shape);

    if (is3DShape) {
      this._drawPreview3D(ctx, cfg, w, h, cx, cy, scale);
      return;
    }

    // 2D polygon shapes
    let pts = [];
    if (cfg.shape === 'star') {
      const n = cfg.starPoints || 5;
      const outerR = scale * 0.9;
      const innerR = outerR * (cfg.starInnerRatio || 0.5);
      for (let i = 0; i < n * 2; i++) {
        const angle = (Math.PI * 2 * i / (n * 2)) - Math.PI / 2;
        const r = i % 2 === 0 ? outerR : innerR;
        pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
      }
    } else {
      const sides = { triangle: 3, pentagon: 5, hexagon: 6 }[cfg.shape] || 3;
      let radius = (cfg.sideLength / (2 * Math.sin(Math.PI / sides))) * scale;
      radius = Math.min(radius, scale * 0.9);
      for (let i = 0; i < sides; i++) {
        const angle = (Math.PI * 2 * i / sides) - Math.PI / 2;
        pts.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
      }
    }

    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = '#111111';
    ctx.strokeStyle = '#00d4ff';
    for (const [px, py] of pts) {
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = '#aaa';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    if (cfg.shape === 'star') {
      ctx.fillText(`${cfg.starPoints}-point star`, cx, h - 8);
    } else {
      ctx.fillText(`${(cfg.sideLength * 1000).toFixed(0)}mm sides`, cx, h - 8);
    }
  }

  _drawPreview3D(ctx, cfg, w, h, cx, cy, scale) {
    // Build 3D vertices and edges, then project with cabinet projection
    let verts3D = []; // [x, y, z]
    let allEdges = [];
    let labelText = '';

    if (cfg.shape === 'box') {
      const hx = cfg.boxX / 2, hy = cfg.boxY / 2, hz = cfg.boxZ / 2;
      verts3D = [
        [-hx,-hy,-hz],[hx,-hy,-hz],[hx,-hy,hz],[-hx,-hy,hz],
        [-hx,hy,-hz],[hx,hy,-hz],[hx,hy,hz],[-hx,hy,hz],
      ];
      allEdges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
      labelText = `${(cfg.boxX * 1000).toFixed(0)}mm`;
    } else if (cfg.shape === 'grid') {
      const gx = cfg.gridX, gy = cfg.gridY, gz = cfg.gridZ, cs = cfg.gridCellSize;
      const nx = gx+1, ny = gy+1, nz = gz+1;
      const ox = gx*cs/2, oy = gy*cs/2, oz = gz*cs/2;
      const idx = (ix,iy,iz) => iz*ny*nx + iy*nx + ix;
      for (let iz=0;iz<nz;iz++) for (let iy=0;iy<ny;iy++) for (let ix=0;ix<nx;ix++)
        verts3D.push([ix*cs-ox, iy*cs-oy, iz*cs-oz]);
      for (let iz=0;iz<nz;iz++) for (let iy=0;iy<ny;iy++) for (let ix=0;ix<gx;ix++)
        allEdges.push([idx(ix,iy,iz), idx(ix+1,iy,iz)]);
      for (let iz=0;iz<nz;iz++) for (let iy=0;iy<gy;iy++) for (let ix=0;ix<nx;ix++)
        allEdges.push([idx(ix,iy,iz), idx(ix,iy+1,iz)]);
      for (let iz=0;iz<gz;iz++) for (let iy=0;iy<ny;iy++) for (let ix=0;ix<nx;ix++)
        allEdges.push([idx(ix,iy,iz), idx(ix,iy,iz+1)]);
      labelText = `${gx}x${gy}x${gz} grid`;
    } else if (cfg.shape === 'cylinder') {
      const { cylSides: sides, cylRings: rings, cylRadius: r, cylHeight: ht } = cfg;
      const levels = rings + 1;
      const half = ht / 2;
      for (let li=0; li<levels; li++) {
        const y = -half + (li/rings)*ht;
        for (let si=0; si<sides; si++) {
          const a = 2*Math.PI*si/sides;
          verts3D.push([Math.cos(a)*r, y, Math.sin(a)*r]);
        }
      }
      for (let li=0; li<levels; li++) {
        const base = li*sides;
        for (let si=0; si<sides; si++) allEdges.push([base+si, base+(si+1)%sides]);
      }
      for (let li=0; li<rings; li++) {
        const base = li*sides;
        for (let si=0; si<sides; si++) allEdges.push([base+si, base+sides+si]);
      }
      labelText = `${sides} sides, ${rings} rings`;
    } else if (cfg.shape === 'sphere') {
      const { sphMeridians: mer, sphParallels: par, sphRadius: r } = cfg;
      verts3D.push([0, -r, 0]); // bottom pole
      const inner = par - 1;
      for (let pi=1; pi<=inner; pi++) {
        const phi = Math.PI*pi/par;
        const y = -r*Math.cos(phi), rr = r*Math.sin(phi);
        for (let mi=0; mi<mer; mi++) {
          const th = 2*Math.PI*mi/mer;
          verts3D.push([Math.cos(th)*rr, y, Math.sin(th)*rr]);
        }
      }
      const topI = verts3D.length;
      verts3D.push([0, r, 0]); // top pole
      for (let pi=0; pi<inner; pi++) {
        const base = 1+pi*mer;
        for (let mi=0; mi<mer; mi++) allEdges.push([base+mi, base+(mi+1)%mer]);
      }
      for (let mi=0; mi<mer; mi++) allEdges.push([0, 1+mi]);
      for (let pi=0; pi<inner-1; pi++) {
        const base=1+pi*mer;
        for (let mi=0; mi<mer; mi++) allEdges.push([base+mi, base+mer+mi]);
      }
      const lastBase = 1+(inner-1)*mer;
      for (let mi=0; mi<mer; mi++) allEdges.push([lastBase+mi, topI]);
      labelText = `${mer} meridians`;
    } else if (cfg.shape === 'cone') {
      const { coneSides: sides, coneRadius: r, coneHeight: ht } = cfg;
      const half = ht / 2;
      for (let si=0; si<sides; si++) {
        const a = 2*Math.PI*si/sides;
        verts3D.push([Math.cos(a)*r, -half, Math.sin(a)*r]);
      }
      verts3D.push([0, half, 0]); // apex
      for (let si=0; si<sides; si++) allEdges.push([si, (si+1)%sides]);
      for (let si=0; si<sides; si++) allEdges.push([si, sides]);
      labelText = `${sides} sides`;
    } else if (cfg.shape === 'prism') {
      const { prismSides: sides, prismSideLength: sl, prismHeight: ht } = cfg;
      const R = sl / (2*Math.sin(Math.PI/sides));
      const half = ht / 2;
      for (let si=0; si<sides; si++) {
        const a = 2*Math.PI*si/sides - Math.PI/2;
        verts3D.push([Math.cos(a)*R, -half, Math.sin(a)*R]);
      }
      for (let si=0; si<sides; si++) {
        const a = 2*Math.PI*si/sides - Math.PI/2;
        verts3D.push([Math.cos(a)*R, half, Math.sin(a)*R]);
      }
      for (let si=0; si<sides; si++) allEdges.push([si, (si+1)%sides]);
      for (let si=0; si<sides; si++) allEdges.push([sides+si, sides+(si+1)%sides]);
      for (let si=0; si<sides; si++) allEdges.push([si, sides+si]);
      labelText = `${sides}-sided prism`;
    } else if (cfg.shape === 'torus') {
      const { torusMajorSeg: majS, torusMinorSeg: minS, torusMajorR: majR, torusTubeR: tubeR } = cfg;
      for (let maj=0; maj<majS; maj++) {
        const th = 2*Math.PI*maj/majS;
        for (let min=0; min<minS; min++) {
          const phi = 2*Math.PI*min/minS;
          const r = majR + Math.cos(phi)*tubeR;
          verts3D.push([Math.cos(th)*r, Math.sin(phi)*tubeR, Math.sin(th)*r]);
        }
      }
      for (let maj=0; maj<majS; maj++) {
        const base = maj*minS;
        for (let min=0; min<minS; min++) allEdges.push([base+min, base+(min+1)%minS]);
      }
      for (let maj=0; maj<majS; maj++) {
        const next = (maj+1)%majS;
        for (let min=0; min<minS; min++) allEdges.push([maj*minS+min, next*minS+min]);
      }
      labelText = `${majS}x${minS} torus`;
    }

    // Find bounding extent for auto-scale
    let maxExtent = 0;
    for (const v of verts3D) {
      maxExtent = Math.max(maxExtent, Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]));
    }
    const s = maxExtent > 0 ? scale / maxExtent : scale;

    // Cabinet projection
    const projX = (v) => cx + v[0] * s - v[2] * 0.4 * s;
    const projY = (v) => cy - v[1] * 0.9 * s - v[2] * 0.35 * s;

    // Draw edges
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 1.5;
    for (const [a, b] of allEdges) {
      const va = verts3D[a], vb = verts3D[b];
      ctx.beginPath();
      ctx.moveTo(projX(va), projY(va));
      ctx.lineTo(projX(vb), projY(vb));
      ctx.stroke();
    }

    // Draw vertices (skip if too many)
    if (verts3D.length <= 64) {
      ctx.fillStyle = '#111111';
      ctx.strokeStyle = '#00d4ff';
      for (const v of verts3D) {
        ctx.beginPath();
        ctx.arc(projX(v), projY(v), 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Label
    ctx.fillStyle = '#aaa';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(labelText, cx, h - 8);
  }

  _onInputChange() {
    const cfg = this._currentCfg;
    if (!cfg) return;

    const g = (id) => {
      const el = this._body.querySelector(`#${id}`);
      return el ? parseFloat(el.value) : null;
    };

    // Read all dimension values that exist in the DOM and update cfg
    const map = {
      'sw-box-x': 'boxX', 'sw-box-y': 'boxY', 'sw-box-z': 'boxZ',
      'sw-side': 'sideLength',
      'sw-star-points': 'starPoints', 'sw-star-outer': 'starOuterRadius',
      'sw-grid-x': 'gridX', 'sw-grid-y': 'gridY', 'sw-grid-z': 'gridZ',
      'sw-grid-cell': 'gridCellSize',
      'sw-cyl-sides': 'cylSides', 'sw-cyl-rings': 'cylRings',
      'sw-cyl-radius': 'cylRadius', 'sw-cyl-height': 'cylHeight',
      'sw-sph-mer': 'sphMeridians', 'sw-sph-par': 'sphParallels',
      'sw-sph-radius': 'sphRadius',
      'sw-cone-sides': 'coneSides', 'sw-cone-radius': 'coneRadius',
      'sw-cone-height': 'coneHeight',
      'sw-prism-sides': 'prismSides', 'sw-prism-sidelen': 'prismSideLength',
      'sw-prism-height': 'prismHeight',
      'sw-tor-majseg': 'torusMajorSeg', 'sw-tor-minseg': 'torusMinorSeg',
      'sw-tor-majr': 'torusMajorR', 'sw-tor-tuber': 'torusTubeR',
      'sw-conn-dia': 'connectorDiameterMm', 'sw-conn-ht': 'connectorHeightMm',
    };

    for (const [id, key] of Object.entries(map)) {
      const val = g(id);
      if (val !== null && !isNaN(val)) cfg[key] = val;
    }

    // Star inner ratio is stored as 0-1, input is 0-100
    const inner = g('sw-star-inner');
    if (inner !== null && !isNaN(inner)) cfg.starInnerRatio = inner / 100;

    // Box linked dimensions: changing one updates all three
    if (cfg.shape === 'box' && cfg.linkDimensions) {
      const link = this._body.querySelector('#sw-link');
      if (link && link.checked) {
        const active = document.activeElement;
        if (active && active.id === 'sw-box-x') { cfg.boxY = cfg.boxX; cfg.boxZ = cfg.boxX; }
        else if (active && active.id === 'sw-box-y') { cfg.boxX = cfg.boxY; cfg.boxZ = cfg.boxY; }
        else if (active && active.id === 'sw-box-z') { cfg.boxX = cfg.boxZ; cfg.boxY = cfg.boxZ; }
        // Sync other inputs
        const bx = this._body.querySelector('#sw-box-x');
        const by = this._body.querySelector('#sw-box-y');
        const bz = this._body.querySelector('#sw-box-z');
        if (bx) bx.value = cfg.boxX;
        if (by) by.value = cfg.boxY;
        if (bz) bz.value = cfg.boxZ;
      }
    }

    this._drawPreview(cfg);
  }

  _getValues() {
    const g = (id) => {
      const el = this._body.querySelector(`#${id}`);
      return el ? parseFloat(el.value) : null;
    };

    const shape = this._lastConfig.shape;
    const isPh = this._lastConfig.isPlaceholder;

    const config = {
      shape,
      connectorDiameterMm: g('sw-conn-dia') || 20,
      connectorHeightMm: g('sw-conn-ht') || 20,
      isPlaceholder: isPh,
      fixtureLengthM: this._lastConfig.fixtureLengthM,
      fixtureLenX: this._lastConfig.fixtureLenX,
      fixtureLenY: this._lastConfig.fixtureLenY,
      fixtureLenZ: this._lastConfig.fixtureLenZ,
      facingDirection: this._lastConfig.facingDirection,
      placeholderName: this._lastConfig.placeholderName || '',
    };

    if (isPh) {
      // Placeholder mode: derive dimensions from fixture length
      const fl = config.fixtureLengthM;
      const flx = config.fixtureLenX || fl;
      const fly = config.fixtureLenY || fl;
      const flz = config.fixtureLenZ || fl;

      if (shape === 'box') {
        config.boxX = flx; config.boxY = fly; config.boxZ = flz;
      } else if (['triangle', 'pentagon', 'hexagon'].includes(shape)) {
        config.sideLength = fl;
      } else if (shape === 'star') {
        config.starPoints = Math.round(g('sw-star-points') || 5);
        config.starOuterRadius = fl; // outer edge = fixture length
        config.starInnerRatio = (g('sw-star-inner') || 50) / 100;
      } else if (shape === 'grid') {
        config.gridX = Math.round(g('sw-grid-x') || 2);
        config.gridY = Math.round(g('sw-grid-y') || 2);
        config.gridZ = Math.round(g('sw-grid-z') || 2);
        config.gridCellSize = flx; // per-axis lengths passed via fixtureLenX/Y/Z
      } else if (shape === 'cylinder') {
        config.cylSides = Math.round(g('sw-cyl-sides') || 8);
        const r = g('sw-cyl-radius') || 0.5;
        config.cylRadius = r;
        config.cylHeight = fl;
        config.cylRings = Math.max(1, Math.round(2 * Math.PI * r / fl));
      } else if (shape === 'sphere') {
        const r = g('sw-sph-radius') || 0.5;
        config.sphRadius = r;
        config.sphMeridians = Math.max(4, Math.round(2 * Math.PI * r / fl));
        config.sphParallels = Math.max(3, Math.round(Math.PI * r / fl));
      } else if (shape === 'cone') {
        config.coneSides = Math.round(g('sw-cone-sides') || 8);
        config.coneRadius = g('sw-cone-radius') || 0.5;
        config.coneHeight = fl; // slant ~ fixture length
      } else if (shape === 'prism') {
        config.prismSides = Math.round(g('sw-prism-sides') || 6);
        config.prismSideLength = fl;
        config.prismHeight = fl;
      } else if (shape === 'torus') {
        const majR = g('sw-tor-majr') || 0.5;
        const tubeR = g('sw-tor-tuber') || 0.15;
        config.torusMajorR = majR;
        config.torusTubeR = tubeR;
        config.torusMajorSeg = Math.max(4, Math.round(2 * Math.PI * majR / fl));
        config.torusMinorSeg = Math.max(3, Math.round(2 * Math.PI * tubeR / fl));
      }
    } else {
      // Normal mode: read all inputs
      if (shape === 'box') {
        config.boxX = g('sw-box-x') || 1;
        config.boxY = g('sw-box-y') || 1;
        config.boxZ = g('sw-box-z') || 1;
        config.linkDimensions = this._body.querySelector('#sw-link')?.checked || false;
      } else if (shape === 'star') {
        config.starPoints = Math.round(g('sw-star-points') || 5);
        config.starOuterRadius = g('sw-star-outer') || 0.5;
        config.starInnerRatio = (g('sw-star-inner') || 50) / 100;
      } else if (shape === 'grid') {
        config.gridX = Math.round(g('sw-grid-x') || 2);
        config.gridY = Math.round(g('sw-grid-y') || 2);
        config.gridZ = Math.round(g('sw-grid-z') || 2);
        config.gridCellSize = g('sw-grid-cell') || 0.5;
      } else if (shape === 'cylinder') {
        config.cylSides = Math.round(g('sw-cyl-sides') || 8);
        config.cylRings = Math.round(g('sw-cyl-rings') || 3);
        config.cylRadius = g('sw-cyl-radius') || 0.5;
        config.cylHeight = g('sw-cyl-height') || 1;
      } else if (shape === 'sphere') {
        config.sphMeridians = Math.round(g('sw-sph-mer') || 8);
        config.sphParallels = Math.round(g('sw-sph-par') || 6);
        config.sphRadius = g('sw-sph-radius') || 0.5;
      } else if (shape === 'cone') {
        config.coneSides = Math.round(g('sw-cone-sides') || 8);
        config.coneRadius = g('sw-cone-radius') || 0.5;
        config.coneHeight = g('sw-cone-height') || 1;
      } else if (shape === 'prism') {
        config.prismSides = Math.round(g('sw-prism-sides') || 6);
        config.prismSideLength = g('sw-prism-sidelen') || 0.5;
        config.prismHeight = g('sw-prism-height') || 1;
      } else if (shape === 'torus') {
        config.torusMajorSeg = Math.round(g('sw-tor-majseg') || 12);
        config.torusMinorSeg = Math.round(g('sw-tor-minseg') || 6);
        config.torusMajorR = g('sw-tor-majr') || 0.5;
        config.torusTubeR = g('sw-tor-tuber') || 0.15;
      } else {
        config.sideLength = g('sw-side') || 1;
      }
    }

    // Save for next open
    Object.assign(this._lastConfig, config);

    return config;
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

  /**
   * Build dimension controls for placeholder mode.
   * Dimensions are derived from fixture length — show info text, not editable.
   */
  _buildPlaceholderDimensions(section, cfg) {
    const fl = cfg.fixtureLengthM;
    const shape = cfg.shape;
    const infoStyle = 'font-size:11px;font-family:var(--font-mono);color:var(--accent-dim)';

    const addInfo = (label, text) => {
      const row = document.createElement('div');
      row.className = 'prop-row';
      row.innerHTML = `<span class="prop-label">${label}</span><span style="${infoStyle}">${text}</span>`;
      section.appendChild(row);
    };

    if (shape === 'box') {
      const lx = cfg.fixtureLenX || fl;
      const ly = cfg.fixtureLenY || fl;
      const lz = cfg.fixtureLenZ || fl;
      addInfo('X edges', `${lx * 1000}mm`);
      addInfo('Y edges', `${ly * 1000}mm`);
      addInfo('Z edges', `${lz * 1000}mm`);
    } else if (['triangle', 'pentagon', 'hexagon'].includes(shape)) {
      addInfo('Side', `${fl * 1000}mm`);
    } else if (shape === 'star') {
      this._formRow(section, 'Points', this._numberWithUnit(cfg.starPoints, 3, 12, 1, '', 'sw-star-points'));
      addInfo('Outer Edge', `${fl * 1000}mm`);
      this._formRow(section, 'Inner %', this._numberWithUnit(Math.round(cfg.starInnerRatio * 100), 10, 90, 5, '%', 'sw-star-inner'));
    } else if (shape === 'grid') {
      const lx = cfg.fixtureLenX || fl;
      const ly = cfg.fixtureLenY || fl;
      const lz = cfg.fixtureLenZ || fl;
      this._formRow(section, 'Cells X', this._numberWithUnit(cfg.gridX, 1, 10, 1, '', 'sw-grid-x'));
      this._formRow(section, 'Cells Y', this._numberWithUnit(cfg.gridY, 1, 10, 1, '', 'sw-grid-y'));
      this._formRow(section, 'Cells Z', this._numberWithUnit(cfg.gridZ, 1, 10, 1, '', 'sw-grid-z'));
      addInfo('X edges', `${lx * 1000}mm`);
      addInfo('Y edges', `${ly * 1000}mm`);
      addInfo('Z edges', `${lz * 1000}mm`);
    } else if (shape === 'cylinder') {
      this._formRow(section, 'Sides', this._numberWithUnit(cfg.cylSides, 4, 32, 1, '', 'sw-cyl-sides'));
      this._formRow(section, 'Radius', this._numberWithUnit(cfg.cylRadius, 0.05, 50, 0.05, 'm', 'sw-cyl-radius'));
      const circumference = 2 * Math.PI * cfg.cylRadius;
      const autoRings = Math.max(1, Math.round(circumference / fl));
      addInfo('Vert Bars', `${fl * 1000}mm each`);
      addInfo('Rings', `auto: ${autoRings}`);
    } else if (shape === 'sphere') {
      this._formRow(section, 'Radius', this._numberWithUnit(cfg.sphRadius, 0.05, 50, 0.05, 'm', 'sw-sph-radius'));
      const autoMer = Math.max(4, Math.round(2 * Math.PI * cfg.sphRadius / fl));
      const autoPar = Math.max(3, Math.round(Math.PI * cfg.sphRadius / fl));
      addInfo('Meridians', `auto: ${autoMer}`);
      addInfo('Parallels', `auto: ${autoPar}`);
    } else if (shape === 'cone') {
      this._formRow(section, 'Sides', this._numberWithUnit(cfg.coneSides, 3, 32, 1, '', 'sw-cone-sides'));
      this._formRow(section, 'Radius', this._numberWithUnit(cfg.coneRadius, 0.05, 50, 0.05, 'm', 'sw-cone-radius'));
      addInfo('Slant', `${fl * 1000}mm each`);
    } else if (shape === 'prism') {
      this._formRow(section, 'Sides', this._numberWithUnit(cfg.prismSides, 3, 32, 1, '', 'sw-prism-sides'));
      addInfo('Side Len', `${fl * 1000}mm`);
      addInfo('Height', `${fl * 1000}mm`);
    } else if (shape === 'torus') {
      this._formRow(section, 'Major R', this._numberWithUnit(cfg.torusMajorR, 0.05, 50, 0.05, 'm', 'sw-tor-majr'));
      this._formRow(section, 'Tube R', this._numberWithUnit(cfg.torusTubeR, 0.01, 10, 0.01, 'm', 'sw-tor-tuber'));
      const autoMaj = Math.max(4, Math.round(2 * Math.PI * cfg.torusMajorR / fl));
      const autoMin = Math.max(3, Math.round(2 * Math.PI * cfg.torusTubeR / fl));
      addInfo('Major Seg', `auto: ${autoMaj}`);
      addInfo('Minor Seg', `auto: ${autoMin}`);
    }
  }

  _selectEl(options, currentValue, onChange, id) {
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
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  // ── Shape SVG Icons ──

  _boxSvg() {
    return `<svg width="28" height="28" viewBox="0 0 24 24"><path d="M21 16V8l-9-5L3 8v8l9 5 9-5z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 8l9 5 9-5M12 13v9" fill="none" stroke="currentColor" stroke-width="1"/></svg>`;
  }

  _triSvg() {
    return `<svg width="28" height="28" viewBox="0 0 24 24"><polygon points="12,3 2,21 22,21" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }

  _pentSvg() {
    return `<svg width="28" height="28" viewBox="0 0 24 24"><polygon points="12,2 2.5,9.5 6,20.5 18,20.5 21.5,9.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }

  _hexSvg() {
    return `<svg width="28" height="28" viewBox="0 0 24 24"><polygon points="12,2 3,7 3,17 12,22 21,17 21,7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }

  _starSvg() {
    return `<svg width="28" height="28" viewBox="0 0 24 24"><polygon points="12,2 14.5,9 22,9 16,14 18,21 12,17 6,21 8,14 2,9 9.5,9" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }

  _gridSvg() {
    return `<svg width="28" height="28" viewBox="0 0 24 24"><path d="M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18 M15 3v18" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }

  _cylinderSvg() {
    return `<svg width="28" height="28" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }

  _sphereSvg() {
    return `<svg width="28" height="28" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/><ellipse cx="12" cy="12" rx="9" ry="4" fill="none" stroke="currentColor" stroke-width="0.8"/><ellipse cx="12" cy="12" rx="4" ry="9" fill="none" stroke="currentColor" stroke-width="0.8"/></svg>`;
  }

  _coneSvg() {
    return `<svg width="28" height="28" viewBox="0 0 24 24"><ellipse cx="12" cy="20" rx="8" ry="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4 20L12 3l8 17" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }

  _prismSvg() {
    return `<svg width="28" height="28" viewBox="0 0 24 24"><polygon points="12,2 3,10 3,20 21,20 21,10" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="1"/><line x1="12" y1="2" x2="12" y2="10" stroke="currentColor" stroke-width="0.8" stroke-dasharray="2 2"/></svg>`;
  }

  _torusSvg() {
    return `<svg width="28" height="28" viewBox="0 0 24 24"><ellipse cx="12" cy="14" rx="10" ry="5" fill="none" stroke="currentColor" stroke-width="1.5"/><ellipse cx="12" cy="10" rx="10" ry="5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2 10c0 2.2 1.5 4 3.5 4.6 M22 10c0 2.2-1.5 4-3.5 4.6" fill="none" stroke="currentColor" stroke-width="0.8"/></svg>`;
  }
}
