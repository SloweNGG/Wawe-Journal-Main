// Backtest v2: arranging the full-screen chart (window.WwBtFsEdit). In full screen the replay controls, balance, order panel, drawing
// tools and legend float over the chart; open positions, pending orders, history and statistics can be added as floating windows
// (title bar to drag, corner to resize, × to hide). "Arrange" shows a handle over each box (drag, or arrow keys on a focused handle)
// and a list to show or hide every box. Kept in this browser: positions as fractions of the free room (0 = left / top edge, 1 = right
// / bottom edge, so a box keeps its side of the screen when the window changes size), window sizes in px, and what is shown.
// The desk (bt-desk.js) asks shownWin() which extra windows full screen shows. Pure helpers are unit tested; create() needs the DOM.
(function (global) {
  'use strict';

  var KEY = 'ww_bt_fs_pos_v1', M = 8;   // M: px kept free at the screen edge
  // box: an element that floats in full screen anyway (shown by default) · win: a desk window, hidden until added
  // keepSize: the box keeps the width / height it had in place (the drawing bar lays out its buttons from its height)
  // size / at: a window's first size (px) and place (fractions)
  var ITEMS = [
    { id: 'toolbar', sel: '#bt-view-replay .bt-toolbar' },
    { id: 'stats', sel: '#bt-stats' },
    { id: 'order', sel: '#bt-order-form' },
    { id: 'draw', sel: '#bt-draw-bar', keepSize: true },
    { id: 'legend', sel: '#bt-chart-card .bt-chart-top' },
    { id: 'open', win: 'open', size: [560, 220], at: { x: 0.03, y: 0.82 } },
    { id: 'orders', win: 'orders', size: [600, 210], at: { x: 0.5, y: 0.82 } },
    { id: 'history', win: 'history', size: [720, 300], at: { x: 0.3, y: 0.45 } },
    { id: 'statsw', win: 'stats', size: [560, 460], at: { x: 0.55, y: 0.3 } }
  ];
  var MIN_W = 240, MIN_H = 110, MAX_PX = 6000;
  var PROPS = ['left', 'top', 'right', 'bottom', 'transform', 'width', 'height'];

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function room(size, view) { return Math.max(0, view - size - 2 * M); }
  function item(id) { for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].id === id) return ITEMS[i]; return null; }
  // px -> fraction of the free room, and back
  function toRatio(left, top, w, h, vw, vh) {
    var rx = room(w, vw), ry = room(h, vh);
    return { x: rx ? clamp((left - M) / rx, 0, 1) : 0, y: ry ? clamp((top - M) / ry, 0, 1) : 0 };
  }
  function fromRatio(r, w, h, vw, vh) {
    return { left: Math.round(M + clamp(r.x, 0, 1) * room(w, vw)), top: Math.round(M + clamp(r.y, 0, 1) * room(h, vh)) };
  }
  // a window's size on this screen: the stored or first size, at least the minimum, never larger than the screen
  function winSize(it, p, vw, vh) {
    var w = p && p.w ? p.w : it.size[0], h = p && p.h ? p.h : it.size[1];
    return { w: Math.round(clamp(w, Math.min(MIN_W, vw - 2 * M), vw - 2 * M)), h: Math.round(clamp(h, Math.min(MIN_H, vh - 2 * M), vh - 2 * M)) };
  }
  function num(v) { return typeof v === 'number' && isFinite(v); }
  // { pos: { id: { x, y, w?, h? } }, vis: { id: bool } }; known boxes only. The first version stored the positions alone.
  function sanitize(o) {
    var out = { pos: {}, vis: {} };
    if (!o || typeof o !== 'object') return out;
    var pos = o.pos && typeof o.pos === 'object' ? o.pos : (o.vis ? {} : o), vis = o.vis && typeof o.vis === 'object' ? o.vis : {};
    ITEMS.forEach(function (it) {
      var p = pos[it.id];
      if (p && num(p.x) && num(p.y)) {
        var q = { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) };
        if (it.win && num(p.w) && num(p.h) && p.w > 0 && p.h > 0) { q.w = Math.round(Math.min(p.w, MAX_PX)); q.h = Math.round(Math.min(p.h, MAX_PX)); }
        out.pos[it.id] = q;
      }
      if (typeof vis[it.id] === 'boolean') out.vis[it.id] = vis[it.id];
    });
    return out;
  }
  // shown in full screen: the boxes unless hidden, the windows once added
  function isShown(state, id) { var it = item(id); return !!it && (typeof state.vis[id] === 'boolean' ? state.vis[id] : !it.win); }
  function load(storage) { try { return sanitize(JSON.parse((storage && storage.getItem(KEY)) || '{}')); } catch (e) { return sanitize(null); } }
  function save(storage, state) { try { if (storage) storage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage blocked: kept for this visit */ } }

  var X_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

  // opts: { root (#bt-root), host (element the layer and the bar go into), t(key, fallback, vars), storage, isOn() -> full screen?,
  //         onChange(editing), onVisibility() (a window was added or hidden: the desk shows / hides it, then calls apply()) }
  function create(opts) {
    var t = opts.t, state = load(opts.storage), editing = false, layer = null, bar = null, list = null, drag = null, grips = {};
    var ro = global.ResizeObserver ? new global.ResizeObserver(onSized) : null, sizeT = 0, observed = {};

    function el(it) { return document.querySelector(it.win ? '#bt-desk .bt-win[data-win="' + it.win + '"]' : it.sel); }
    function visible(e) { return !!e && e.getClientRects().length > 0 && e.offsetWidth > 0; }
    function clear(e) { PROPS.forEach(function (p) { e.style[p] = ''; }); }
    function name(it) { return t('backtest.fsedit.item_' + it.id, it.id); }
    function persist() { save(opts.storage, state); }
    function floating(e) { return !!e && e.classList.contains('bt-fs-float'); }

    function place(it, e, left, top, size) {
      e.style.left = left + 'px'; e.style.top = top + 'px'; e.style.right = 'auto'; e.style.bottom = 'auto'; e.style.transform = 'none';
      if (size) { e.style.width = size.w + 'px'; e.style.height = size.h + 'px'; }
      e.setAttribute('data-fs-placed', '1');
    }
    // a hide button in the title bar of a floating window (added once)
    function headX(it, e) {
      var head = e.querySelector('.bt-win-head'); if (!head || head.querySelector('.bt-fs-x')) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'bt-fs-x'; b.innerHTML = X_ICON;
      b.addEventListener('click', function () { setVisible(it.id, false); });
      head.appendChild(b);
      labelX(it, b);
    }
    function labelX(it, b) { var l = t('backtest.fsedit.hide', 'Gizle') + ': ' + name(it); b.title = l; b.setAttribute('aria-label', l); }

    // the stored places and what is shown, on the boxes (full screen only). Outside full screen the boxes go back to their own CSS and
    // the windows to the desk (which owns their inline size and place there).
    function apply() {
      var on = opts.isOn(), vw = innerWidth, vh = innerHeight;
      ITEMS.forEach(function (it) {
        var e = el(it); if (!e) return;
        var shown = isShown(state, it.id);
        if (it.win) {
          var fl = on && shown && !e.hidden;
          e.classList.toggle('bt-fs-float', fl);
          if (!fl) { e.removeAttribute('data-fs-placed'); if (ro && observed[it.id]) { ro.unobserve(e); observed[it.id] = false; } return; }
          var s = winSize(it, state.pos[it.id], vw, vh), p = fromRatio(state.pos[it.id] || it.at, s.w, s.h, vw, vh);
          place(it, e, p.left, p.top, s);
          headX(it, e);
          if (ro && !observed[it.id]) { ro.observe(e); observed[it.id] = true; }
          return;
        }
        e.classList.toggle('bt-fs-off', on && !shown);
        if (e.hasAttribute('data-fs-placed')) { clear(e); e.removeAttribute('data-fs-placed'); }
        if (!on || !shown || !state.pos[it.id] || !visible(e)) return;
        var r = e.getBoundingClientRect(), size = { w: Math.round(r.width), h: Math.round(r.height) };
        var q = fromRatio(state.pos[it.id], size.w, size.h, vw, vh);
        place(it, e, q.left, q.top, it.keepSize ? size : null);
      });
      if (editing) { syncGrips(); renderList(); }
    }

    // a floating window resized from its corner: keep the size
    function onSized(entries) {
      if (!opts.isOn()) return;
      clearTimeout(sizeT);
      sizeT = setTimeout(function () {
        entries.forEach(function (en) {
          var e = en.target, it = item(fsId(e)); if (!it || !floating(e)) return;
          var r = e.getBoundingClientRect(), p = state.pos[it.id] || toRatio(r.left, r.top, r.width, r.height, innerWidth, innerHeight);
          p.w = Math.round(r.width); p.h = Math.round(r.height); state.pos[it.id] = p;
        });
        persist(); if (editing) syncGrips();
      }, 200);
    }
    function fsId(e) { var w = e.getAttribute('data-win'); for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].win === w) return ITEMS[i].id; return null; }

    function setVisible(id, on) {
      if (!item(id)) return;
      state.vis[id] = !!on; persist();
      if (opts.onVisibility) opts.onVisibility(); else apply();
    }

    // --- arrange mode: handles over the boxes, the bar with the box list
    function syncGrips() {
      ITEMS.forEach(function (it) {
        var g = grips[it.id], e = el(it); if (!g) return;
        if (!isShown(state, it.id) || !visible(e)) { g.hidden = true; return; }
        var r = e.getBoundingClientRect();
        g.hidden = false;
        g.style.left = r.left + 'px'; g.style.top = r.top + 'px'; g.style.width = r.width + 'px'; g.style.height = r.height + 'px';
      });
    }
    function buildUi() {
      layer = document.createElement('div'); layer.className = 'bt-fs-layer';
      ITEMS.forEach(function (it) {
        var g = document.createElement('div');
        g.className = 'bt-fs-grip'; g.tabIndex = 0; g.setAttribute('role', 'button'); g.setAttribute('data-fs-item', it.id);
        g.innerHTML = '<span class="bt-fs-grip-label"></span><button type="button" class="bt-fs-grip-hide" data-fs-hide="' + it.id + '">' + X_ICON + '</button>';
        layer.appendChild(g); grips[it.id] = g;
      });
      layer.addEventListener('pointerdown', onDown);
      layer.addEventListener('keydown', onKey);
      layer.addEventListener('click', function (e) { var b = e.target.closest('[data-fs-hide]'); if (b) setVisible(b.getAttribute('data-fs-hide'), false); });
      bar = document.createElement('div'); bar.className = 'bt-fs-editbar'; bar.setAttribute('role', 'toolbar');
      bar.innerHTML = '<span class="bt-fs-editbar-hint"></span>' +
        '<span class="bt-fs-listwrap"><button type="button" class="bt-fs-editbar-btn" data-fs-act="list" aria-expanded="false"></button><div class="bt-fs-list" hidden></div></span>' +
        '<button type="button" class="bt-fs-editbar-btn" data-fs-act="reset"></button>' +
        '<button type="button" class="bt-fs-editbar-btn is-main" data-fs-act="done"></button>';
      list = bar.querySelector('.bt-fs-list');
      bar.addEventListener('click', function (e) {
        var b = e.target.closest('[data-fs-act]'); if (!b) return;
        var a = b.getAttribute('data-fs-act');
        if (a === 'list') { list.hidden = !list.hidden; b.setAttribute('aria-expanded', String(!list.hidden)); if (!list.hidden) renderList(); }
        else if (a === 'reset') reset();
        else setEditing(false);
      });
      list.addEventListener('change', function (e) { var id = e.target.getAttribute('data-fs-vis'); if (id) setVisible(id, e.target.checked); });
      opts.host.appendChild(layer); opts.host.appendChild(bar);
    }
    function renderList() {
      if (!list || list.hidden) return;
      list.textContent = '';
      ITEMS.forEach(function (it) {
        var lab = document.createElement('label'); lab.className = 'bt-fs-list-row';
        var c = document.createElement('input'); c.type = 'checkbox'; c.checked = isShown(state, it.id); c.setAttribute('data-fs-vis', it.id);
        lab.appendChild(c); lab.appendChild(document.createTextNode(name(it)));
        list.appendChild(lab);
      });
    }
    function texts() {
      if (bar) {
        bar.querySelector('.bt-fs-editbar-hint').textContent = t('backtest.fsedit.hint', 'Kutuları sürükleyerek istediğin yere taşı.');
        bar.querySelector('[data-fs-act="list"]').textContent = t('backtest.fsedit.items', 'Kutular') + ' ▾';
        bar.querySelector('[data-fs-act="reset"]').textContent = t('backtest.fsedit.reset', 'Sıfırla');
        bar.querySelector('[data-fs-act="done"]').textContent = t('backtest.fsedit.done', 'Bitti');
        renderList();
      }
      ITEMS.forEach(function (it) {
        var g = grips[it.id];
        if (g) {
          g.querySelector('.bt-fs-grip-label').textContent = name(it);
          g.setAttribute('aria-label', t('backtest.fsedit.move', '{name}: sürükle veya ok tuşlarıyla taşı', { name: name(it) }));
          var hb = g.querySelector('.bt-fs-grip-hide'), l = t('backtest.fsedit.hide', 'Gizle') + ': ' + name(it); hb.title = l; hb.setAttribute('aria-label', l);
        }
        var e = it.win && el(it), x = e && e.querySelector('.bt-fs-x'); if (x) labelX(it, x);
      });
    }

    function setEditing(on) {
      on = !!on && opts.isOn();
      if (on === editing) return;
      editing = on;
      if (on && !layer) buildUi();
      opts.root.classList.toggle('bt-fs-editing', on);
      if (layer) { layer.hidden = !on; bar.hidden = !on; if (!on) { list.hidden = true; bar.querySelector('[data-fs-act="list"]').setAttribute('aria-expanded', 'false'); } }
      if (on) { texts(); syncGrips(); var first = layer.querySelector('.bt-fs-grip:not([hidden])'); if (first) first.focus(); }
      else drag = null;
      if (opts.onChange) opts.onChange(on);
    }

    function moveTo(it, e, left, top) {
      var r = e.getBoundingClientRect(), w = r.width, h = r.height;
      left = clamp(left, M, Math.max(M, innerWidth - w - M)); top = clamp(top, M, Math.max(M, innerHeight - h - M));
      place(it, e, Math.round(left), Math.round(top), it.keepSize ? { w: Math.round(w), h: Math.round(h) } : null);
      var p = toRatio(left, top, w, h, innerWidth, innerHeight), old = state.pos[it.id];
      if (it.win) { p.w = Math.round(w); p.h = Math.round(h); } else if (old && old.w) { p.w = old.w; p.h = old.h; }
      state.pos[it.id] = p;
      if (editing) syncGrips();
    }

    // dragging: a handle (arrange mode) or the title bar of a floating window (any time)
    function startDrag(e, it, target, handle) {
      var r = target.getBoundingClientRect();
      drag = { it: it, el: target, h: handle, dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
      try { handle.setPointerCapture(e.pointerId); } catch (x) { /* synthetic event */ }
      handle.classList.add('is-dragging');
      handle.addEventListener('pointermove', onMove); handle.addEventListener('pointerup', onUp); handle.addEventListener('pointercancel', onUp);
    }
    function onDown(e) {
      var g = e.target.closest('.bt-fs-grip'); if (!g || e.button > 0 || e.target.closest('[data-fs-hide]')) return;
      var it = item(g.getAttribute('data-fs-item')), target = it && el(it); if (!target) return;
      e.preventDefault(); g.focus();
      startDrag(e, it, target, g);
    }
    function onHeadDown(e) {
      if (editing || e.button > 0 || !opts.isOn()) return;
      var head = e.target.closest && e.target.closest('.bt-fs-float > .bt-win-head'); if (!head || e.target.closest('button, select, input, a')) return;
      var w = head.parentNode, it = item(fsId(w)); if (!it) return;
      e.preventDefault();
      startDrag(e, it, w, head);
    }
    function onMove(e) { if (drag && e.pointerId === drag.id) moveTo(drag.it, drag.el, e.clientX - drag.dx, e.clientY - drag.dy); }
    function onUp(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var h = drag.h; h.classList.remove('is-dragging');
      h.removeEventListener('pointermove', onMove); h.removeEventListener('pointerup', onUp); h.removeEventListener('pointercancel', onUp);
      drag = null; persist();
    }
    // arrows: 10 px, with Shift 1 px
    function onKey(e) {
      var g = e.target.closest('.bt-fs-grip'); if (!g || e.target !== g) return;
      var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d) return;
      e.preventDefault(); e.stopPropagation();
      var it = item(g.getAttribute('data-fs-item')), target = it && el(it); if (!target) return;
      var r = target.getBoundingClientRect(), step = e.shiftKey ? 1 : 10;
      moveTo(it, target, r.left + d[0] * step, r.top + d[1] * step);
      persist();
    }

    function reset() { state = sanitize(null); persist(); if (opts.onVisibility) opts.onVisibility(); else apply(); }

    var resizeT = 0;
    function onResize() { clearTimeout(resizeT); resizeT = setTimeout(apply, 60); }
    window.addEventListener('resize', onResize);
    document.addEventListener('pointerdown', onHeadDown, true);

    function destroy() {
      setEditing(false);
      window.removeEventListener('resize', onResize); document.removeEventListener('pointerdown', onHeadDown, true);
      clearTimeout(resizeT); clearTimeout(sizeT); if (ro) ro.disconnect();
      ITEMS.forEach(function (it) {
        var e = el(it); if (!e) return;
        e.classList.remove('bt-fs-float', 'bt-fs-off');
        if (!it.win && e.hasAttribute('data-fs-placed')) clear(e);
        e.removeAttribute('data-fs-placed');
        var x = e.querySelector('.bt-fs-x'); if (x) x.remove();
      });
      if (layer) { layer.remove(); bar.remove(); layer = bar = list = null; grips = {}; }
    }

    return {
      apply: apply, setEditing: setEditing, isEditing: function () { return editing; }, reset: reset, destroy: destroy, relabel: texts,
      // the desk: does full screen show this window? (only the windows that can be added)
      shownWin: function (win) { for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].win === win) return isShown(state, ITEMS[i].id); return false; }
    };
  }

  global.WwBtFsEdit = { ITEMS: ITEMS, MARGIN: M, toRatio: toRatio, fromRatio: fromRatio, winSize: winSize, sanitize: sanitize, isShown: isShown, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
