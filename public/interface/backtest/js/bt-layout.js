// Backtest v2: replay screen layout (window.WwBtLayout). Simple / advanced mode, resizable panels, full-screen mode and the
// keyboard shortcut sheet. Preferences live in localStorage (one key, per browser); the pure helpers are unit tested.
(function (global) {
  'use strict';

  var KEY = 'ww_bt_layout_v1';
  var MODES = ['simple', 'advanced'];
  var SIDE = { min: 280, max: 520, def: 340 };          // right panel width (px)
  var BOTTOM = { min: 120, max: 640, def: 240 };        // bottom tabs height (px)
  var CHART_MIN_W = 360, CHART_MIN_H = 200;            // what the chart keeps when a panel grows

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }

  // Stored preferences, always complete and in range. `mode` stays null until it is decided once (defaultMode).
  function normalize(p) {
    p = p && typeof p === 'object' ? p : {};
    return {
      mode: MODES.indexOf(p.mode) >= 0 ? p.mode : null,
      sideW: Math.round(clamp(num(p.sideW, SIDE.def), SIDE.min, SIDE.max)),
      bottomH: Math.round(clamp(num(p.bottomH, BOTTOM.def), BOTTOM.min, BOTTOM.max)),
      charts: typeof p.charts === 'string' ? p.charts : '1',
      tfs: Array.isArray(p.tfs) ? p.tfs.filter(function (x) { return typeof x === 'string'; }).slice(0, 4) : []
    };
  }
  function load(storage) {
    var raw = null;
    try { raw = storage ? storage.getItem(KEY) : null; } catch (e) { raw = null; }
    var p = null;
    try { p = raw ? JSON.parse(raw) : null; } catch (e) { p = null; }
    return normalize(p);
  }
  function save(storage, p) {
    try { if (storage) storage.setItem(KEY, JSON.stringify(normalize(p))); return true; } catch (e) { return false; }
  }
  // First visit: a new user (no backtest account yet) starts in simple mode; someone who already uses backtest keeps the full screen.
  function defaultMode(accountCount) { return accountCount > 0 ? 'advanced' : 'simple'; }
  // Panel sizes inside the space actually available, so the chart never collapses on a small window.
  function fitSide(w, totalW) { return Math.round(clamp(w, SIDE.min, Math.max(SIDE.min, Math.min(SIDE.max, totalW - CHART_MIN_W)))); }
  function fitBottom(h, totalH) { return Math.round(clamp(h, BOTTOM.min, Math.max(BOTTOM.min, Math.min(BOTTOM.max, totalH - CHART_MIN_H)))); }

  // Keyboard shortcuts shown on screen (the sheet and the hint line). `keys` are display labels, `id` the i18n key suffix.
  var SHORTCUTS = [
    { id: 'play', keys: ['Space'] },
    { id: 'step', keys: ['→'] },
    { id: 'step_1m', keys: ['Shift', '→'] },
    { id: 'buy', keys: ['Shift', 'B'] },
    { id: 'sell', keys: ['Shift', 'S'] },
    { id: 'fullscreen', keys: ['F'] },
    { id: 'center', keys: ['R'] },
    { id: 'exit', keys: ['Esc'] },
    { id: 'tools', keys: ['1', '…', '9'] },
    { id: 'cursor', keys: ['V'] },
    { id: 'magnet', keys: ['M'] },
    { id: 'delete_drawing', keys: ['Del'] },
    { id: 'undo', keys: ['@mod', 'Z'] },
    { id: 'redo', keys: ['@mod', 'Shift', 'Z'] },
    { id: 'draw_shift', keys: ['Shift'] },
    { id: 'draw_settings', keys: ['@dblclick'] },
    { id: 'sheet', keys: ['?'] }
  ];

  // ---------------------------------------------------------------- DOM controller
  // opts: { page (wwPage scope), root (#bt-root), view (#bt-view-replay), t (i18n fn), storage, onChange(prefs, what) }
  function mount(opts) {
    var PAGE = opts.page, root = opts.root, view = opts.view, storage = opts.storage;
    var prefs = load(storage);
    var fs = false, drag = null;

    function persist() { save(storage, prefs); }
    function applySizes() {
      root.style.setProperty('--bt-side-w', prefs.sideW + 'px');
      root.style.setProperty('--bt-bottom-h', prefs.bottomH + 'px');
    }
    function setMode(m, quiet) {
      if (MODES.indexOf(m) < 0) return;
      prefs.mode = m; persist();
      root.setAttribute('data-mode', m);
      var btns = document.querySelectorAll('[data-bt-mode]');
      for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', btns[i].getAttribute('data-bt-mode') === m ? 'true' : 'false');
      if (!quiet && opts.onChange) opts.onChange(prefs, 'mode');
    }
    function decideMode(accountCount) {
      if (!prefs.mode) { prefs.mode = defaultMode(accountCount); persist(); }
      setMode(prefs.mode, true);
    }

    // splitters: pointer drag on [data-bt-split="side"|"bottom"]
    function onDown(e) {
      var h = e.target.closest('[data-bt-split]'); if (!h || e.button > 0 || fs) return;
      var axis = h.getAttribute('data-bt-split'), box = view.getBoundingClientRect();
      drag = { axis: axis, h: h, startX: e.clientX, startY: e.clientY, side: prefs.sideW, bottom: prefs.bottomH, box: box, id: e.pointerId };
      try { h.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      root.classList.add('bt-resizing'); h.classList.add('bt-split-active');
      e.preventDefault();
    }
    function onMove(e) {
      if (!drag) return;
      if (drag.axis === 'side') prefs.sideW = fitSide(drag.side - (e.clientX - drag.startX), drag.box.width);
      else prefs.bottomH = fitBottom(drag.bottom - (e.clientY - drag.startY), drag.box.height - 120);
      applySizes();
    }
    function onUp() {
      if (!drag) return;
      try { drag.h.releasePointerCapture(drag.id); } catch (x) { /* ignore */ }
      drag.h.classList.remove('bt-split-active'); root.classList.remove('bt-resizing');
      drag = null; persist();
      if (opts.onChange) opts.onChange(prefs, 'size');
    }
    // keyboard on a focused splitter: arrows move it by 16 px (Home resets)
    function onSplitKey(e) {
      var h = e.target.closest && e.target.closest('[data-bt-split]'); if (!h) return;
      var axis = h.getAttribute('data-bt-split'), box = view.getBoundingClientRect(), d = e.shiftKey ? 64 : 16, used = true;
      if (axis === 'side' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) prefs.sideW = fitSide(prefs.sideW + (e.key === 'ArrowLeft' ? d : -d), box.width);
      else if (axis === 'bottom' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) prefs.bottomH = fitBottom(prefs.bottomH + (e.key === 'ArrowUp' ? d : -d), box.height - 120);
      else if (e.key === 'Home') { if (axis === 'side') prefs.sideW = SIDE.def; else prefs.bottomH = BOTTOM.def; }
      else used = false;
      if (!used) return;
      e.preventDefault(); e.stopPropagation();
      applySizes(); persist();
      if (opts.onChange) opts.onChange(prefs, 'size');
    }
    PAGE.on(view, 'pointerdown', onDown);
    PAGE.on(view, 'pointermove', onMove);
    PAGE.on(view, 'pointerup', onUp);
    PAGE.on(view, 'pointercancel', onUp);
    PAGE.on(view, 'keydown', onSplitKey);
    // a window that shrinks below the stored sizes: refit (stored values stay, only the applied ones shrink)
    PAGE.on(global, 'resize', function () {
      if (!view.offsetWidth) return;
      var box = view.getBoundingClientRect();
      root.style.setProperty('--bt-side-w', fitSide(prefs.sideW, box.width) + 'px');
      root.style.setProperty('--bt-bottom-h', fitBottom(prefs.bottomH, box.height - 120) + 'px');
    });

    // full screen: the replay view covers the window (CSS .bt-fs), the browser full-screen API when it is available
    function setFullscreen(on) {
      on = !!on;
      if (on === fs) return;
      fs = on;
      root.classList.toggle('bt-fs', on);
      document.documentElement.classList.toggle('bt-fs-lock', on);
      var b = document.querySelectorAll('[data-bt-fs]');
      for (var i = 0; i < b.length; i++) b[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      try {
        if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(function () { /* CSS mode is enough */ });
        if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () { /* ignore */ });
      } catch (e) { /* CSS mode only */ }
      if (opts.onChange) opts.onChange(prefs, 'fullscreen');
    }
    // Esc in browser full screen is taken by the browser: leave our mode with it
    PAGE.on(document, 'fullscreenchange', function () { if (!document.fullscreenElement && fs) setFullscreen(false); });

    // shortcut sheet
    function renderSheet(box) {
      var t = opts.t, list = document.createElement('dl'); list.className = 'bt-keys';
      SHORTCUTS.forEach(function (s) {
        var row = document.createElement('div'); row.className = 'bt-keys-row' + (s.advanced ? ' bt-adv-only' : '');
        var dt = document.createElement('dt');
        s.keys.forEach(function (k) {
          var kb = document.createElement(k === '…' ? 'span' : 'kbd');
          kb.textContent = k === 'Space' ? t('backtest.keys.space', 'Boşluk') : k === '@mod' ? (/Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘' : 'Ctrl')
            : k === '@dblclick' ? t('backtest.keys.dblclick', 'Çift tık / sağ tık') : k;
          dt.appendChild(kb);
        });
        var dd = document.createElement('dd'); dd.textContent = t('backtest.keys.' + s.id, s.id);
        row.appendChild(dt); row.appendChild(dd); list.appendChild(row);
      });
      box.textContent = ''; box.appendChild(list);
    }

    applySizes();
    return {
      prefs: function () { return prefs; },
      decideMode: decideMode,
      setMode: setMode,
      mode: function () { return prefs.mode || 'simple'; },
      toggleMode: function () { setMode(prefs.mode === 'advanced' ? 'simple' : 'advanced'); },
      isFullscreen: function () { return fs; },
      setFullscreen: setFullscreen,
      renderSheet: renderSheet,
      setCharts: function (charts, tfs) { prefs.charts = charts; if (tfs) prefs.tfs = tfs.slice(0, 4); persist(); },
      destroy: function () { if (fs) setFullscreen(false); root.classList.remove('bt-resizing'); }
    };
  }

  global.WwBtLayout = {
    KEY: KEY, MODES: MODES, SIDE: SIDE, BOTTOM: BOTTOM, SHORTCUTS: SHORTCUTS,
    normalize: normalize, load: load, save: save, defaultMode: defaultMode, fitSide: fitSide, fitBottom: fitBottom,
    mount: mount
  };
})(typeof window !== 'undefined' ? window : globalThis);
