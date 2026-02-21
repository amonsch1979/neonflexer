/**
 * Fun animated loading overlay for heavy operations like 3D model import.
 * Shows a neon-themed progress animation with random funny messages.
 * Progress bar never stops moving — uses CSS indeterminate animation when idle.
 */
export class LoadingOverlay {
  constructor() {
    this._overlay = null;
    this._messageEl = null;
    this._subEl = null;
    this._barFill = null;
    this._barIndeterminate = null;
    this._dotCount = 0;
    this._dotTimer = null;
    this._msgTimer = null;
    this._startTime = 0;
    this._realProgress = false; // true when setProgress() has been called
    this._build();
  }

  _build() {
    this._overlay = document.createElement('div');
    const o = this._overlay;
    Object.assign(o.style, {
      position: 'fixed',
      top: '0', left: '0', right: '0', bottom: '0',
      background: 'rgba(10, 10, 25, 0.92)',
      display: 'none',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '2000',
      fontFamily: "var(--font-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)",
      backdropFilter: 'blur(8px)',
    });

    // Neon tube animation (CSS-drawn)
    const tubeWrap = document.createElement('div');
    Object.assign(tubeWrap.style, {
      width: '120px', height: '120px',
      marginBottom: '30px',
      position: 'relative',
    });
    tubeWrap.innerHTML = `
      <svg viewBox="0 0 120 120" style="width:120px;height:120px;animation:loading-spin 2s linear infinite">
        <defs>
          <linearGradient id="neon-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#00d4ff"/>
            <stop offset="50%" stop-color="#ff44aa"/>
            <stop offset="100%" stop-color="#00d4ff"/>
          </linearGradient>
          <filter id="neon-glow">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <circle cx="60" cy="60" r="45" fill="none" stroke="url(#neon-grad)"
                stroke-width="4" stroke-linecap="round" stroke-dasharray="70 200"
                filter="url(#neon-glow)"/>
        <circle cx="60" cy="60" r="30" fill="none" stroke="#00d4ff"
                stroke-width="2" stroke-dasharray="40 150" opacity="0.4"
                style="animation:loading-spin-reverse 3s linear infinite"/>
      </svg>
    `;
    o.appendChild(tubeWrap);

    // Main message
    this._messageEl = document.createElement('div');
    Object.assign(this._messageEl.style, {
      fontSize: '18px',
      fontWeight: '700',
      color: '#00d4ff',
      letterSpacing: '2px',
      textTransform: 'uppercase',
      textAlign: 'center',
      textShadow: '0 0 20px rgba(0, 212, 255, 0.5)',
    });
    this._messageEl.textContent = 'LOADING';
    o.appendChild(this._messageEl);

    // Sub message (funny)
    this._subEl = document.createElement('div');
    Object.assign(this._subEl.style, {
      fontSize: '13px',
      color: '#8899aa',
      marginTop: '12px',
      textAlign: 'center',
      fontStyle: 'italic',
      minHeight: '20px',
      transition: 'opacity 0.3s',
    });
    o.appendChild(this._subEl);

    // Progress bar
    const barWrap = document.createElement('div');
    Object.assign(barWrap.style, {
      width: '300px',
      height: '4px',
      background: 'rgba(42, 42, 78, 0.8)',
      borderRadius: '2px',
      marginTop: '24px',
      overflow: 'hidden',
      position: 'relative',
    });

    // Real progress fill (width-based)
    this._barFill = document.createElement('div');
    Object.assign(this._barFill.style, {
      width: '0%',
      height: '100%',
      background: 'linear-gradient(90deg, #00d4ff, #ff44aa, #00d4ff)',
      backgroundSize: '200% 100%',
      borderRadius: '2px',
      transition: 'width 0.3s ease-out',
      animation: 'loading-bar-shimmer 1.5s linear infinite',
    });
    barWrap.appendChild(this._barFill);

    // Indeterminate overlay — sliding highlight that never stops
    this._barIndeterminate = document.createElement('div');
    Object.assign(this._barIndeterminate.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      borderRadius: '2px',
      animation: 'loading-indeterminate 1.8s ease-in-out infinite',
      background: 'linear-gradient(90deg, transparent 0%, #00d4ff 30%, #ff44aa 50%, #00d4ff 70%, transparent 100%)',
      backgroundSize: '50% 100%',
      backgroundRepeat: 'no-repeat',
      opacity: '1',
    });
    barWrap.appendChild(this._barIndeterminate);

    o.appendChild(barWrap);

    // Timer display
    this._timerEl = document.createElement('div');
    Object.assign(this._timerEl.style, {
      fontSize: '11px',
      fontFamily: "'SF Mono', 'Consolas', monospace",
      color: '#556677',
      marginTop: '10px',
    });
    o.appendChild(this._timerEl);

    // Inject keyframe animations
    if (!document.getElementById('loading-overlay-styles')) {
      const style = document.createElement('style');
      style.id = 'loading-overlay-styles';
      style.textContent = `
        @keyframes loading-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes loading-spin-reverse {
          to { transform: rotate(-360deg); }
        }
        @keyframes loading-bar-shimmer {
          to { background-position: -200% 0; }
        }
        @keyframes loading-indeterminate {
          0%   { background-position: -50% 0; }
          100% { background-position: 150% 0; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(o);
  }

  /**
   * Show the loading overlay.
   * @param {string} [filename] - name of file being loaded
   */
  show(filename) {
    this._startTime = performance.now();
    this._realProgress = false;
    this._overlay.style.display = 'flex';
    this._messageEl.textContent = 'LOADING';
    this._barFill.style.width = '0%';
    this._barIndeterminate.style.opacity = '1';
    this._subEl.textContent = filename ? `Importing ${filename}...` : 'Preparing...';
    this._timerEl.textContent = '0.0s';

    // Animate dots on the message
    this._dotCount = 0;
    this._dotTimer = setInterval(() => {
      this._dotCount = (this._dotCount + 1) % 4;
      this._messageEl.textContent = 'LOADING' + '.'.repeat(this._dotCount);
      // Update timer
      const elapsed = ((performance.now() - this._startTime) / 1000).toFixed(1);
      this._timerEl.textContent = `${elapsed}s`;
    }, 400);

    // Cycle funny messages
    this._msgIndex = 0;
    this._cycleMessage();
    this._msgTimer = setInterval(() => this._cycleMessage(), 3000);
  }

  /**
   * Update progress (0-100). Use for real progress if available.
   * When called, hides the indeterminate animation and shows real progress.
   */
  setProgress(pct) {
    const clamped = Math.min(pct, 99);
    this._barFill.style.width = clamped + '%';
    if (!this._realProgress && clamped > 0) {
      this._realProgress = true;
      // Fade out indeterminate, show real bar
      this._barIndeterminate.style.opacity = '0.3';
    }
  }

  /**
   * Set a custom status message.
   */
  setStatus(msg) {
    this._subEl.textContent = msg;
  }

  /**
   * Hide the loading overlay with a brief "done" flash.
   */
  hide() {
    clearInterval(this._dotTimer);
    clearInterval(this._msgTimer);

    this._barFill.style.width = '100%';
    this._barIndeterminate.style.opacity = '0';
    this._messageEl.textContent = 'DONE!';
    this._subEl.textContent = '';

    const elapsed = ((performance.now() - this._startTime) / 1000).toFixed(1);
    this._timerEl.textContent = `${elapsed}s`;

    setTimeout(() => {
      this._overlay.style.display = 'none';
    }, 400);
  }

  _cycleMessage() {
    const messages = [
      'Counting polygons...',
      'Untangling vertices...',
      'Polishing surfaces...',
      'Asking the GPU nicely...',
      'Reticulating splines...',
      'Warming up the pixel oven...',
      'Converting caffeine to geometry...',
      'Teaching triangles to behave...',
      'Negotiating with the graphics card...',
      'Almost there (probably)...',
      'Loading loading screen...',
      'Consulting the 3D wizards...',
      'Defragmenting the tesseract...',
      'Waking up the render hamsters...',
      'Calibrating neon flux capacitor...',
      'Assembling atoms...',
      'This model is THICC...',
      'Still faster than Capture...',
      'Making things look pretty...',
      'Flexing those GPU muscles...',
    ];
    this._subEl.style.opacity = '0';
    setTimeout(() => {
      this._subEl.textContent = messages[this._msgIndex % messages.length];
      this._subEl.style.opacity = '1';
      this._msgIndex++;
    }, 300);
  }
}
