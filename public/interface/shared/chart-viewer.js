/* ============================================================
   WAWE JOURNAL - CHART VIEWER (window.WwChartViewer)
   Loaded on every app page by BaseHead, styled by chart-theme.css (.ww-viewer-*).
   Every page opens its charts large through this one viewer, so they all grow to
   the same size: a centered modal (as wide as the screen allows up to 1560px, the
   chart about half the screen tall), previous/next chart (buttons and ← →),
   Esc / × / a click outside to close.

   WwChartViewer.open({
     items:  [{ key, title }],          charts the viewer can step through
     index:  0,                         which one to show first
     render: function (el, item, size) { ... return handle },
             draws item into el (size = {width, height} of el). The handle may be
             { resize(w, h), destroy() }, an ApexCharts instance, or a Lightweight
             Charts chart; the viewer resizes and removes it.
     footer: function (el, item) {}     optional: fills a strip under the chart
     onClose: function () {}            optional
   })
   WwChartViewer.rerender()  redraw the current chart (e.g. after a theme change)
   WwChartViewer.close(), WwChartViewer.isOpen()
   ============================================================ */
(function (global) {
  'use strict';

  var doc = global.document;
  var state = null;   // { opts, index, handle }
  var root = null, titleEl = null, countEl = null, chartEl = null, canvasEl = null, footEl = null;
  var prevBtn = null, nextBtn = null;
  var resizeObs = null, resizeRaf = 0, lastFocus = null;

  function t(key, fallback) {
    try {
      if (global.i18n && typeof global.i18n.t === 'function') {
        var v = global.i18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  var ICON = {
    prev: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    next: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
  };

  function build() {
    if (root && root.isConnected) return;
    root = doc.createElement('div');
    root.className = 'ww-viewer';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.innerHTML =
      '<div class="ww-viewer-box">' +
      '<div class="ww-viewer-head">' +
        '<div class="ww-viewer-titles"><h3 class="ww-viewer-title"></h3><span class="ww-viewer-count"></span></div>' +
        '<div class="ww-viewer-actions">' +
          '<button type="button" class="ww-viewer-btn" data-act="prev" aria-label="' + t('common.previous', 'Önceki') + '">' + ICON.prev + '</button>' +
          '<button type="button" class="ww-viewer-btn" data-act="next" aria-label="' + t('common.next', 'Sonraki') + '">' + ICON.next + '</button>' +
          '<button type="button" class="ww-viewer-btn" data-act="close" aria-label="' + t('common.close', 'Kapat') + '">' + ICON.close + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="ww-viewer-body"><div class="ww-viewer-chart"><div class="ww-viewer-canvas"></div></div></div>' +
      '<div class="ww-viewer-foot"></div>' +
      '</div>';
    doc.body.appendChild(root);

    titleEl = root.querySelector('.ww-viewer-title');
    countEl = root.querySelector('.ww-viewer-count');
    // chartEl is the measured frame; charts draw into canvasEl inside it. ApexCharts writes its
    // height onto its own container as min-height, so measuring that box would make it grow forever.
    chartEl = root.querySelector('.ww-viewer-chart');
    canvasEl = root.querySelector('.ww-viewer-canvas');
    footEl = root.querySelector('.ww-viewer-foot');
    prevBtn = root.querySelector('[data-act="prev"]');
    nextBtn = root.querySelector('[data-act="next"]');

    root.addEventListener('click', function (e) {
      if (e.target === root) { close(); return; }   // click on the dimmed backdrop
      var btn = e.target.closest && e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'prev') step(-1);
      else if (act === 'next') step(1);
      else if (act === 'close') close();
    });

    if (typeof ResizeObserver !== 'undefined') {
      resizeObs = new ResizeObserver(function () {
        cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(resizeCurrent);
      });
      resizeObs.observe(chartEl);
    }
  }

  function onKey(e) {
    if (!state) return;
    var tag = (e.target && e.target.tagName) || '';
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  }

  function sizeOf(el) {
    var r = el.getBoundingClientRect();
    return { width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) };
  }

  function destroyHandle(h) {
    if (!h) return;
    try {
      if (typeof h.destroy === 'function') h.destroy();
      else if (typeof h.remove === 'function') h.remove();
    } catch (e) {}
  }

  function resizeCurrent() {
    if (!state || !state.handle || !chartEl) return;
    var s = sizeOf(chartEl), h = state.handle;
    try {
      if (typeof h.resize === 'function' && !h.updateOptions) h.resize(s.width, s.height);
      else if (typeof h.updateOptions === 'function') h.updateOptions({ chart: { width: s.width, height: s.height } }, false, false);
      else if (typeof h.applyOptions === 'function') h.applyOptions({ width: s.width, height: s.height });
    } catch (e) {}
  }

  function show() {
    var items = state.opts.items, item = items[state.index];
    destroyHandle(state.handle);
    state.handle = null;
    canvasEl.innerHTML = '';
    titleEl.textContent = item.title || '';
    var many = items.length > 1;
    countEl.textContent = many ? (state.index + 1) + ' / ' + items.length : '';
    prevBtn.hidden = nextBtn.hidden = !many;

    if (typeof state.opts.footer === 'function') {
      footEl.hidden = false;
      footEl.innerHTML = '';
      try { state.opts.footer(footEl, item); } catch (e) { footEl.hidden = true; footEl.innerHTML = ''; }
    } else {
      footEl.hidden = true;
      footEl.innerHTML = '';
    }
    root.classList.toggle('has-foot', !footEl.hidden);

    // draw once the layout has settled so the chart gets its real size
    var token = state.token = (state.token || 0) + 1;
    requestAnimationFrame(function () {
      if (!state || state.token !== token) return;
      try { state.handle = state.opts.render(canvasEl, item, sizeOf(chartEl)) || null; }
      catch (e) { if (global.wwLog) global.wwLog.error('chart viewer render:', e); }
    });
  }

  function step(dir) {
    if (!state) return;
    var n = state.opts.items.length;
    if (n < 2) return;
    state.index = (state.index + dir + n) % n;
    show();
  }

  function open(opts) {
    if (!opts || !opts.items || !opts.items.length || typeof opts.render !== 'function') return;
    build();
    if (state) teardown(false);
    lastFocus = doc.activeElement;
    state = { opts: opts, index: Math.max(0, Math.min(opts.items.length - 1, opts.index || 0)), handle: null };
    root.classList.add('active');
    doc.documentElement.classList.add('ww-viewer-open');
    doc.addEventListener('keydown', onKey);
    show();
    var closeBtn = root.querySelector('[data-act="close"]');
    if (closeBtn) { try { closeBtn.focus({ preventScroll: true }); } catch (e) {} }
  }

  function teardown(notify) {
    var s = state;
    state = null;
    if (s) destroyHandle(s.handle);
    if (canvasEl) canvasEl.innerHTML = '';
    if (footEl) footEl.innerHTML = '';
    if (notify && s && typeof s.opts.onClose === 'function') {
      try { s.opts.onClose(); } catch (e) {}
    }
  }

  function close() {
    if (!state) return;
    teardown(true);
    if (root) root.classList.remove('active');
    doc.documentElement.classList.remove('ww-viewer-open');
    doc.removeEventListener('keydown', onKey);
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
    }
    lastFocus = null;
  }

  function rerender() {
    if (state) show();
  }

  function isOpen() {
    return !!state;
  }

  // SPA: leaving the page closes the viewer (pages also call close() from their own cleanup)
  if (global.addEventListener) global.addEventListener('pagehide', close);

  global.WwChartViewer = { open: open, close: close, rerender: rerender, isOpen: isOpen };
})(typeof window !== 'undefined' ? window : this);
