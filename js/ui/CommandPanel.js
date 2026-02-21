/**
 * Floating, draggable, resizable StreamDeck-style command panel.
 * Shows clickable shortcut buttons organized by category.
 */
export class CommandPanel {
  constructor() {
    this.visible = false;
    this._commands = [];
    this._activeFilter = 'all';

    this._createPanel();
    this._setupDrag();
    this._setupResize();
  }

  /**
   * Register a command button.
   * @param {object} cmd - { id, label, shortcut, icon, category, action }
   */
  addCommand(cmd) {
    this._commands.push(cmd);
    if (this.visible) this._renderButtons();
  }

  /**
   * Register multiple commands at once.
   */
  addCommands(cmds) {
    this._commands.push(...cmds);
    if (this.visible) this._renderButtons();
  }

  toggle() {
    this.visible = !this.visible;
    this._panel.style.display = this.visible ? 'flex' : 'none';
    if (this.visible) this._renderButtons();
  }

  show() {
    this.visible = true;
    this._panel.style.display = 'flex';
    this._renderButtons();
  }

  hide() {
    this.visible = false;
    this._panel.style.display = 'none';
  }

  _createPanel() {
    this._panel = document.createElement('div');
    const p = this._panel;
    p.id = 'command-panel';
    Object.assign(p.style, {
      position: 'fixed',
      top: '100px',
      right: '20px',
      width: '320px',
      minWidth: '220px',
      minHeight: '200px',
      maxHeight: '80vh',
      display: 'none',
      flexDirection: 'column',
      background: 'rgba(15, 15, 30, 0.88)',
      border: '1px solid rgba(0, 212, 255, 0.3)',
      borderRadius: '10px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(0, 212, 255, 0.1)',
      backdropFilter: 'blur(12px)',
      zIndex: '500',
      fontFamily: "var(--font-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)",
      overflow: 'hidden',
      userSelect: 'none',
    });

    // Header
    this._header = document.createElement('div');
    Object.assign(this._header.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      background: 'rgba(0, 212, 255, 0.08)',
      borderBottom: '1px solid rgba(0, 212, 255, 0.15)',
      cursor: 'grab',
    });

    const title = document.createElement('span');
    Object.assign(title.style, {
      fontSize: '12px',
      fontWeight: '700',
      color: '#00d4ff',
      letterSpacing: '1px',
      textTransform: 'uppercase',
    });
    title.textContent = 'Command Pad';
    this._header.appendChild(title);

    const closeBtn = document.createElement('button');
    Object.assign(closeBtn.style, {
      background: 'none',
      border: 'none',
      color: '#8899aa',
      fontSize: '18px',
      cursor: 'pointer',
      padding: '0 4px',
      lineHeight: '1',
    });
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', () => this.hide());
    closeBtn.addEventListener('mouseenter', () => closeBtn.style.color = '#fff');
    closeBtn.addEventListener('mouseleave', () => closeBtn.style.color = '#8899aa');
    this._header.appendChild(closeBtn);
    p.appendChild(this._header);

    // Filter tabs
    this._filterBar = document.createElement('div');
    Object.assign(this._filterBar.style, {
      display: 'flex',
      gap: '2px',
      padding: '6px 8px',
      borderBottom: '1px solid rgba(42, 42, 78, 0.6)',
      flexWrap: 'wrap',
    });
    p.appendChild(this._filterBar);

    // Button grid container (scrollable)
    this._grid = document.createElement('div');
    Object.assign(this._grid.style, {
      flex: '1',
      overflowY: 'auto',
      padding: '8px',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
      gap: '6px',
      alignContent: 'start',
      scrollbarWidth: 'thin',
      scrollbarColor: '#2a2a4e transparent',
    });
    p.appendChild(this._grid);

    // Resize handle
    this._resizeHandle = document.createElement('div');
    Object.assign(this._resizeHandle.style, {
      position: 'absolute',
      bottom: '0',
      right: '0',
      width: '16px',
      height: '16px',
      cursor: 'nwse-resize',
    });
    // Resize grip dots
    this._resizeHandle.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" style="opacity:0.3">
      <circle cx="11" cy="11" r="1.5" fill="#00d4ff"/>
      <circle cx="7" cy="11" r="1.5" fill="#00d4ff"/>
      <circle cx="11" cy="7" r="1.5" fill="#00d4ff"/>
    </svg>`;
    p.appendChild(this._resizeHandle);

    document.body.appendChild(p);
  }

  _renderFilterTabs() {
    this._filterBar.innerHTML = '';
    const categories = ['all', ...new Set(this._commands.map(c => c.category))];

    for (const cat of categories) {
      const tab = document.createElement('button');
      Object.assign(tab.style, {
        padding: '3px 8px',
        fontSize: '10px',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        border: '1px solid',
        borderRadius: '4px',
        cursor: 'pointer',
        transition: 'all 0.15s',
        background: cat === this._activeFilter ? 'rgba(0, 212, 255, 0.2)' : 'transparent',
        color: cat === this._activeFilter ? '#00d4ff' : '#8899aa',
        borderColor: cat === this._activeFilter ? 'rgba(0, 212, 255, 0.4)' : 'rgba(42, 42, 78, 0.6)',
      });
      tab.textContent = cat;
      tab.addEventListener('click', () => {
        this._activeFilter = cat;
        this._renderButtons();
      });
      tab.addEventListener('mouseenter', () => {
        if (cat !== this._activeFilter) tab.style.color = '#ccc';
      });
      tab.addEventListener('mouseleave', () => {
        if (cat !== this._activeFilter) tab.style.color = '#8899aa';
      });
      this._filterBar.appendChild(tab);
    }
  }

  _renderButtons() {
    this._renderFilterTabs();
    this._grid.innerHTML = '';

    const filtered = this._activeFilter === 'all'
      ? this._commands
      : this._commands.filter(c => c.category === this._activeFilter);

    for (const cmd of filtered) {
      const btn = document.createElement('button');
      Object.assign(btn.style, {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '3px',
        padding: '8px 4px',
        minHeight: '64px',
        background: 'rgba(26, 26, 46, 0.7)',
        border: '1px solid rgba(42, 42, 78, 0.8)',
        borderRadius: '8px',
        color: '#e0e0e0',
        cursor: 'pointer',
        transition: 'all 0.15s',
        fontFamily: 'inherit',
      });

      // Icon
      if (cmd.icon) {
        const iconWrap = document.createElement('div');
        Object.assign(iconWrap.style, {
          width: '22px',
          height: '22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        });
        iconWrap.innerHTML = cmd.icon;
        const svg = iconWrap.querySelector('svg');
        if (svg) {
          svg.style.width = '22px';
          svg.style.height = '22px';
          svg.style.fill = 'currentColor';
        }
        btn.appendChild(iconWrap);
      }

      // Label
      const lbl = document.createElement('span');
      Object.assign(lbl.style, {
        fontSize: '9px',
        fontWeight: '600',
        textAlign: 'center',
        lineHeight: '1.2',
        color: '#ccc',
      });
      lbl.textContent = cmd.label;
      btn.appendChild(lbl);

      // Shortcut key badge
      if (cmd.shortcut) {
        const kbd = document.createElement('span');
        Object.assign(kbd.style, {
          fontSize: '9px',
          fontFamily: "'SF Mono', 'Consolas', monospace",
          fontWeight: '700',
          color: '#00d4ff',
          background: 'rgba(0, 212, 255, 0.1)',
          border: '1px solid rgba(0, 212, 255, 0.25)',
          borderRadius: '3px',
          padding: '1px 4px',
          marginTop: '1px',
        });
        kbd.textContent = cmd.shortcut;
        btn.appendChild(kbd);
      }

      // Hover effects
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(0, 212, 255, 0.12)';
        btn.style.borderColor = 'rgba(0, 212, 255, 0.4)';
        btn.style.transform = 'scale(1.04)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(26, 26, 46, 0.7)';
        btn.style.borderColor = 'rgba(42, 42, 78, 0.8)';
        btn.style.transform = 'scale(1)';
      });

      // Click action
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cmd.action) cmd.action();
        // Flash feedback
        btn.style.background = 'rgba(0, 212, 255, 0.3)';
        setTimeout(() => {
          btn.style.background = 'rgba(26, 26, 46, 0.7)';
        }, 150);
      });

      this._grid.appendChild(btn);
    }
  }

  // ── Drag ───────────────────────────────────────────────

  _setupDrag() {
    let dragging = false;
    let startX, startY, startLeft, startTop;

    this._header.addEventListener('pointerdown', (e) => {
      dragging = true;
      this._header.style.cursor = 'grabbing';
      startX = e.clientX;
      startY = e.clientY;
      const rect = this._panel.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      e.preventDefault();
    });

    document.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      this._panel.style.left = (startLeft + dx) + 'px';
      this._panel.style.top = (startTop + dy) + 'px';
      this._panel.style.right = 'auto';
    });

    document.addEventListener('pointerup', () => {
      if (dragging) {
        dragging = false;
        this._header.style.cursor = 'grab';
      }
    });
  }

  // ── Resize ─────────────────────────────────────────────

  _setupResize() {
    let resizing = false;
    let startX, startY, startW, startH;

    this._resizeHandle.addEventListener('pointerdown', (e) => {
      resizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startW = this._panel.offsetWidth;
      startH = this._panel.offsetHeight;
      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener('pointermove', (e) => {
      if (!resizing) return;
      const newW = Math.max(220, startW + (e.clientX - startX));
      const newH = Math.max(200, startH + (e.clientY - startY));
      this._panel.style.width = newW + 'px';
      this._panel.style.maxHeight = 'none';
      this._panel.style.height = newH + 'px';
    });

    document.addEventListener('pointerup', () => {
      resizing = false;
    });
  }
}
