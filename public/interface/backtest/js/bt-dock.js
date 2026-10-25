// Backtest v2: movable panels of the replay screen (window.WwBtDock). The chart, the balance card, the order panel, the bottom tabs
// and the detached statistics are panels; each sits in one of five zones (top, left, center, right, bottom) and can be dragged by its
// header to another zone (a preview shows where it lands), hidden and shown again. Zone edges and the line between two flexible
// panels resize. Advanced mode on a wide screen only: simple mode keeps its fixed arrangement, phones stack the panels and never drag.
// Also the multi-chart grid (cell order and track sizes) and the statistics widget arrangement are stored here, in one layout per
// user (localStorage 'ww_bt_dock_v1:<user id>'). The pure model at the top is unit tested; mount() needs the DOM.
(function (global) {
  'use strict';

  var VERSION = 1, KEY = 'ww_bt_dock_v1';
  var PANELS = ['chart', 'balance', 'order', 'tabs', 'stats'];
  var HIDEABLE = ['balance', 'order', 'tabs', 'stats'];
  var FLEX = { chart: true, tabs: true, stats: true };           // share the free space of their zone (the others take their content height)
  var ZONES = ['top', 'left', 'center', 'right', 'bottom'];
  var ROW = { top: true, bottom: true };                        // zones that stack their panels side by side
  var SIZE = { left: { min: 240, max: 720, def: 320 }, right: { min: 260, max: 720, def: 340 }, top: { min: 120, max: 640, def: 220 }, bottom: { min: 120, max: 720, def: 240 } };
  var WEIGHT = { min: 0.2, max: 10 };
  var EDGE = 44;                                                // px from the outer edge of the screen area that mean "dock at that side"
  var MULTI_IDS = ['1', '2h', '2v', '2x2', '1+3'];

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------------------------------------------------------------- model (pure)
  function defaults(old) {
    old = old || {};
    return {
      v: VERSION,
      zones: { top: [], left: [], center: ['chart'], right: ['balance', 'order'], bottom: ['tabs', 'stats'] },
      hidden: [], statsDetached: false,
      size: { left: SIZE.left.def, right: clamp(num(old.sideW, SIZE.right.def), SIZE.right.min, SIZE.right.max),
        top: SIZE.top.def, bottom: clamp(num(old.bottomH, SIZE.bottom.def), SIZE.bottom.min, SIZE.bottom.max) },
      weight: { chart: 3, tabs: 1, stats: 1 },
      multi: {}, widgets: null
    };
  }
  // every panel exactly once, the chart never hidden, sizes and weights in range; `old` = the previous layout preferences
  // (ww_bt_layout_v1: sideW, bottomH) for a first start
  function normalize(p, old) {
    var d = defaults(old);
    if (!p || typeof p !== 'object' || p.v !== VERSION) return d;
    var seen = {}, zones = {};
    ZONES.forEach(function (z) {
      zones[z] = (Array.isArray(p.zones && p.zones[z]) ? p.zones[z] : []).filter(function (id) {
        if (PANELS.indexOf(id) < 0 || seen[id]) return false; seen[id] = true; return true;
      });
    });
    PANELS.forEach(function (id) {                               // a missing panel goes back to its default zone
      if (seen[id]) return;
      ZONES.forEach(function (z) { if (d.zones[z].indexOf(id) >= 0) zones[z].push(id); });
    });
    var out = { v: VERSION, zones: zones, statsDetached: p.statsDetached === true,
      hidden: (Array.isArray(p.hidden) ? p.hidden : []).filter(function (id, i, a) { return HIDEABLE.indexOf(id) >= 0 && a.indexOf(id) === i; }),
      size: {}, weight: {}, multi: {}, widgets: p.widgets && typeof p.widgets === 'object' ? p.widgets : null };
    Object.keys(SIZE).forEach(function (z) { out.size[z] = Math.round(clamp(num(p.size && p.size[z], d.size[z]), SIZE[z].min, SIZE[z].max)); });
    Object.keys(FLEX).forEach(function (id) { out.weight[id] = clamp(num(p.weight && p.weight[id], d.weight[id]), WEIGHT.min, WEIGHT.max); });
    MULTI_IDS.forEach(function (id) { if (p.multi && p.multi[id]) out.multi[id] = normalizeMulti(id, p.multi[id]); });
    return out;
  }
  function zoneOf(p, id) { for (var i = 0; i < ZONES.length; i++) if (p.zones[ZONES[i]].indexOf(id) >= 0) return ZONES[i]; return null; }
  // move a panel to `zone` at `index` (position among that zone's panels, the panel itself not counted)
  function move(p, id, zone, index) {
    if (PANELS.indexOf(id) < 0 || ZONES.indexOf(zone) < 0) return p;
    var n = clone(p);
    ZONES.forEach(function (z) { n.zones[z] = n.zones[z].filter(function (x) { return x !== id; }); });
    var list = n.zones[zone], at = index == null ? list.length : clamp(Math.round(index), 0, list.length);
    list.splice(at, 0, id);
    n.hidden = n.hidden.filter(function (x) { return x !== id; });
    return n;
  }
  function setHidden(p, id, on) {
    if (HIDEABLE.indexOf(id) < 0) return p;
    var n = clone(p); n.hidden = n.hidden.filter(function (x) { return x !== id; });
    if (on) n.hidden.push(id);
    return n;
  }
  // the panels shown per zone. ctx: { mode: 'simple'|'advanced' }. Simple mode: chart in the middle, balance and orders on the right.
  function effective(p, ctx) {
    var out = {};
    ZONES.forEach(function (z) { out[z] = []; });
    if (!ctx || ctx.mode !== 'advanced') { out.center = ['chart']; out.right = ['balance', 'order']; return out; }
    ZONES.forEach(function (z) {
      out[z] = p.zones[z].filter(function (id) { return p.hidden.indexOf(id) < 0 && (id !== 'stats' || p.statsDetached); });
    });
    return out;
  }
  function isFlex(id) { return !!FLEX[id]; }

  // Where a dragged panel lands. box: the dock area; zones: { zone: rect | null } of the zones shown; panels: { zone: [{ id, rect }] }
  // (the dragged panel left out); pt: pointer. Returns { zone, index, rect (preview, in page px) } or null.
  function dropTarget(box, zones, panels, pt, sizes) {
    if (!box || pt.x < box.left || pt.x > box.left + box.width || pt.y < box.top || pt.y > box.top + box.height) return null;
    sizes = sizes || {};
    var right = box.left + box.width, bottom = box.top + box.height;
    function strip(z) {
      var w = Math.min((sizes[z] || SIZE[z].def), box.width * 0.4), h = Math.min((sizes[z] || SIZE[z].def), box.height * 0.4);
      if (z === 'left') return { left: box.left, top: box.top, width: w, height: box.height };
      if (z === 'right') return { left: right - w, top: box.top, width: w, height: box.height };
      if (z === 'top') return { left: box.left, top: box.top, width: box.width, height: h };
      return { left: box.left, top: bottom - h, width: box.width, height: h };
    }
    var edge = pt.x - box.left < EDGE ? 'left' : right - pt.x < EDGE ? 'right' : pt.y - box.top < EDGE ? 'top' : bottom - pt.y < EDGE ? 'bottom' : null;
    if (edge && !(panels[edge] && panels[edge].length)) return { zone: edge, index: 0, rect: strip(edge) };
    var hit = null;
    if (edge) hit = edge;
    else ZONES.forEach(function (z) { var r = zones[z]; if (!hit && r && pt.x >= r.left && pt.x <= r.left + r.width && pt.y >= r.top && pt.y <= r.top + r.height) hit = z; });
    if (!hit) return null;
    var list = panels[hit] || [];
    if (!list.length) return { zone: hit, index: 0, rect: zones[hit] || strip(hit) };
    var row = !!ROW[hit], idx = list.length;
    for (var i = 0; i < list.length; i++) {
      var r = list[i].rect, mid = row ? r.left + r.width / 2 : r.top + r.height / 2;
      if ((row ? pt.x : pt.y) < mid) { idx = i; break; }
    }
    var ref = list[Math.min(idx, list.length - 1)].rect, before = idx < list.length, rect;
    if (row) rect = { left: before ? ref.left : ref.left + ref.width / 2, top: ref.top, width: ref.width / 2, height: ref.height };
    else rect = { left: ref.left, top: before ? ref.top : ref.top + ref.height / 2, width: ref.width, height: ref.height / 2 };
    return { zone: hit, index: idx, rect: rect };
  }

  // ---------------------------------------------------------------- multi-chart grid (pure)
  // slots: grid lines [rowFrom, rowTo, colFrom, colTo] (1-based, end exclusive); slot 0 is the big one in 1+3.
  var GRID = {
    '1': { cols: 1, rows: 1, slots: [[1, 2, 1, 2]], splits: [] },
    '2h': { cols: 2, rows: 1, slots: [[1, 2, 1, 2], [1, 2, 2, 3]], splits: [{ kind: 'col', i: 0, from: 1, to: 2 }] },
    '2v': { cols: 1, rows: 2, slots: [[1, 2, 1, 2], [2, 3, 1, 2]], splits: [{ kind: 'row', i: 0, from: 1, to: 2 }] },
    '2x2': { cols: 2, rows: 2, slots: [[1, 2, 1, 2], [1, 2, 2, 3], [2, 3, 1, 2], [2, 3, 2, 3]],
      splits: [{ kind: 'col', i: 0, from: 1, to: 3 }, { kind: 'row', i: 0, from: 1, to: 3 }] },
    '1+3': { cols: 2, rows: 3, slots: [[1, 4, 1, 2], [1, 2, 2, 3], [2, 3, 2, 3], [3, 4, 2, 3]],
      splits: [{ kind: 'col', i: 0, from: 1, to: 4 }, { kind: 'row', i: 0, from: 2, to: 3 }, { kind: 'row', i: 1, from: 2, to: 3 }] }
  };
  function multiDefault(id) {
    var g = GRID[id] || GRID['1'];
    return { cols: id === '1+3' ? [2, 1] : fill(g.cols), rows: fill(g.rows), order: g.slots.map(function (s, i) { return i; }) };
  }
  function fill(n) { var a = []; for (var i = 0; i < n; i++) a.push(1); return a; }
  // fractions positive (0.15..6), order a permutation of the view indexes 0..slots-1 (0 = the account's main chart)
  function normalizeMulti(id, m) {
    var d = multiDefault(id), g = GRID[id] || GRID['1'];
    function tracks(a, n, def) { return Array.isArray(a) && a.length === n ? a.map(function (x, i) { return clamp(num(x, def[i]), 0.15, 6); }) : def; }
    var order = Array.isArray(m && m.order) && m.order.length === g.slots.length && g.slots.every(function (s, i) { return m.order.indexOf(i) >= 0; }) ? m.order.map(Number) : d.order;
    return { cols: tracks(m && m.cols, g.cols, d.cols), rows: tracks(m && m.rows, g.rows, d.rows), order: order };
  }
  function multiOf(p, id) { return p.multi[id] ? p.multi[id] : multiDefault(id); }
  // swap the slots of two views (view indexes)
  function swapViews(m, a, b) {
    var n = clone(m), ia = n.order.indexOf(a), ib = n.order.indexOf(b);
    if (ia < 0 || ib < 0 || ia === ib) return n;
    n.order[ia] = b; n.order[ib] = a;
    return n;
  }
  // grid placement of a view: 'rowFrom / colFrom / rowTo / colTo'
  function cellArea(id, m, view) {
    var g = GRID[id] || GRID['1'], slot = m.order.indexOf(view), s = g.slots[slot < 0 ? 0 : slot];
    return s[0] + ' / ' + s[2] + ' / ' + s[1] + ' / ' + s[3];
  }
  function template(tr) { return tr.map(function (f) { return 'minmax(0, ' + (Math.round(f * 1000) / 1000) + 'fr)'; }).join(' '); }
  // drag a boundary: `delta` px over a total of `total` px moves size between tracks i and i+1 (each keeps at least 0.15)
  function resizeTracks(tr, i, delta, total) {
    var n = tr.slice(), sum = n.reduce(function (a, b) { return a + b; }, 0), d = delta / Math.max(1, total) * sum;
    var lo = 0.15 - n[i], hi = n[i + 1] - 0.15; d = clamp(d, lo, hi);
    n[i] += d; n[i + 1] -= d;
    return n;
  }

  // ---------------------------------------------------------------- storage
  function storageKey(userId) { return KEY + ':' + (userId || 'anon'); }
  function load(storage, userId) {
    var raw = null, p = null, old = null;
    try { raw = storage ? storage.getItem(storageKey(userId)) : null; } catch (e) { raw = null; }
    try { p = raw ? JSON.parse(raw) : null; } catch (e) { p = null; }
    try { old = JSON.parse((storage && storage.getItem('ww_bt_layout_v1')) || 'null'); } catch (e) { old = null; }
    return normalize(p, old);
  }
  function save(storage, userId, p) { try { if (storage) storage.setItem(storageKey(userId), JSON.stringify(p)); return true; } catch (e) { return false; } }

  // ---------------------------------------------------------------- DOM controller
  // opts: { page (wwPage), dock (#bt-dock), storage, userId, mode() -> 'simple'|'advanced', fullscreen() -> bool, wide() -> bool,
  //         t(key, fb), onChange(layout, what) }   panels: elements [data-panel] inside the dock; grips [data-dock-grip];
  //         hide buttons [data-dock-hide="<id>"]
  function mount(opts) {
    var PAGE = opts.page, dock = opts.dock, t = opts.t;
    var lay = load(opts.storage, opts.userId), drag = null, ghost = null, preview = null, split = null;
    var zoneEl = {}, panelEl = {};
    ZONES.forEach(function (z) { zoneEl[z] = dock.querySelector('[data-zone="' + z + '"]'); });
    PANELS.forEach(function (id) { panelEl[id] = dock.querySelector('[data-panel="' + id + '"]'); });
    preview = dock.querySelector('.bt-dock-preview');

    function persist() { save(opts.storage, opts.userId, lay); }
    function canEdit() { return opts.mode() === 'advanced' && opts.wide() && !opts.fullscreen(); }
    function changed(what) { persist(); apply(); if (opts.onChange) opts.onChange(lay, what); }

    // place the panels and size the zones
    function apply() {
      var eff = effective(lay, { mode: opts.mode() });
      ZONES.forEach(function (z) {
        var el = zoneEl[z]; if (!el) return;
        Array.prototype.slice.call(el.querySelectorAll(':scope > .bt-isplit')).forEach(function (s) { s.remove(); });
        var list = eff[z];
        // a hidden panel stays in its zone (display none), so its place is kept for when it comes back
        var all = opts.mode() === 'advanced' ? lay.zones[z] : list;
        var now = Array.prototype.filter.call(el.children, function (c) { return c.hasAttribute('data-panel'); }).map(function (c) { return c.getAttribute('data-panel'); });
        if (now.join() !== all.join()) all.forEach(function (id) { if (panelEl[id]) el.appendChild(panelEl[id]); });   // only when the order changed
        list.forEach(function (id, i) {
          var p = panelEl[id]; if (!p) return;
          p.style.flexGrow = isFlex(id) ? String(lay.weight[id] || 1) : '';
          if (i > 0 && isFlex(id) && isFlex(list[i - 1])) {
            var s = document.createElement('div'); s.className = 'bt-isplit' + (ROW[z] ? ' bt-isplit-v' : ' bt-isplit-h');
            s.setAttribute('data-isplit', list[i - 1] + '|' + id); s.setAttribute('role', 'separator'); s.tabIndex = 0;
            s.setAttribute('aria-orientation', ROW[z] ? 'vertical' : 'horizontal');
            s.title = t('backtest.dock.resize', 'Boyutlandır (sürükle veya ok tuşları)');
            el.insertBefore(s, p);
          }
        });
        el.hidden = !list.length;
        dock.setAttribute('data-has-' + z, list.length ? '1' : '0');
      });
      // panels not shown at all (simple mode: tabs, stats) and hidden panels
      PANELS.forEach(function (id) {
        var p = panelEl[id]; if (!p) return;
        var shown = eff[zoneOf(lay, id)] && eff[zoneOf(lay, id)].indexOf(id) >= 0;
        if (opts.mode() !== 'advanced') shown = id === 'chart' || id === 'balance' || id === 'order';
        p.hidden = !shown;
        p.setAttribute('data-zone-of', shown ? (opts.mode() === 'advanced' ? zoneOf(lay, id) : (id === 'chart' ? 'center' : 'right')) : '');
      });
      Object.keys(SIZE).forEach(function (z) { dock.style.setProperty('--bt-z-' + z, fitSize(z, lay.size[z]) + 'px'); });
      dock.classList.toggle('bt-dock-edit', canEdit());
    }
    // the applied size never leaves the chart less than 320 x 200 px
    function fitSize(z, v) {
      var box = dock.getBoundingClientRect(); if (!box.width) return v;
      var row = z === 'top' || z === 'bottom', other = row ? (z === 'top' ? 'bottom' : 'top') : (z === 'left' ? 'right' : 'left');
      var otherV = dock.getAttribute('data-has-' + other) === '1' ? lay.size[other] : 0;
      var room = (row ? box.height - 200 : box.width - 320) - otherV;
      return Math.round(clamp(v, SIZE[z].min, Math.max(SIZE[z].min, Math.min(SIZE[z].max, room))));
    }

    // --- panel drag by its header
    function rectOf(el) { var r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; }
    function target(pt) {
      var eff = effective(lay, { mode: 'advanced' }), zr = {}, pr = {};
      ZONES.forEach(function (z) {
        var list = eff[z].filter(function (id) { return id !== drag.id; });
        zr[z] = list.length && zoneEl[z] && !zoneEl[z].hidden ? rectOf(zoneEl[z]) : null;
        pr[z] = list.map(function (id) { return { id: id, rect: rectOf(panelEl[id]) }; });
      });
      if (!zr.center) zr.center = rectOf(zoneEl.center);
      return dropTarget(rectOf(dock), zr, pr, pt, lay.size);
    }
    function onGripDown(e) {
      var g = e.target.closest('[data-dock-grip]'); if (!g || e.button > 0 || !canEdit()) return;
      if (e.target.closest('button:not([data-dock-grip]), select, input, [role="tab"]')) return;
      var id = g.getAttribute('data-dock-grip');
      drag = { id: id, x: e.clientX, y: e.clientY, started: false, pid: e.pointerId, el: g, tgt: null };
      try { g.setPointerCapture(e.pointerId); } catch (x) { /* synthetic event */ }
    }
    function onMove(e) {
      if (split) return onSplitMove(e);
      if (!drag) return;
      if (!drag.started) {
        if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 6) return;
        drag.started = true; dock.classList.add('bt-dock-dragging'); panelEl[drag.id].classList.add('bt-pbox-moving');
        ghost = document.createElement('div'); ghost.className = 'bt-dock-ghost';
        ghost.textContent = t('backtest.dock.panel_' + drag.id, drag.id); document.body.appendChild(ghost);
      }
      e.preventDefault();
      ghost.style.left = (e.clientX + 12) + 'px'; ghost.style.top = (e.clientY + 12) + 'px';
      drag.tgt = target({ x: e.clientX, y: e.clientY });
      if (drag.tgt) {
        var b = dock.getBoundingClientRect(), r = drag.tgt.rect;
        preview.style.left = (r.left - b.left) + 'px'; preview.style.top = (r.top - b.top) + 'px';
        preview.style.width = r.width + 'px'; preview.style.height = r.height + 'px'; preview.hidden = false;
      } else preview.hidden = true;
    }
    function onUp() {
      if (split) return onSplitUp();
      if (!drag) return;
      var d = drag; drag = null;
      try { d.el.releasePointerCapture(d.pid); } catch (x) { /* ignore */ }
      if (ghost) { ghost.remove(); ghost = null; }
      preview.hidden = true; dock.classList.remove('bt-dock-dragging');
      if (panelEl[d.id]) panelEl[d.id].classList.remove('bt-pbox-moving');
      if (d.started && d.tgt) { lay = move(lay, d.id, d.tgt.zone, d.tgt.index); changed('layout'); }
    }
    // keyboard on a grip: Alt+arrow moves the panel to the zone in that direction
    function onGripKey(e) {
      var g = e.target.closest && e.target.closest('[data-dock-grip]'); if (!g || !canEdit() || !e.altKey) return;
      var dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'top', ArrowDown: 'bottom' }[e.key]; if (!dir) return;
      e.preventDefault();
      var id = g.getAttribute('data-dock-grip'), cur = zoneOf(lay, id);
      var to = cur === dir ? cur : (cur === 'center' ? dir : (({ left: 'right', right: 'left', top: 'bottom', bottom: 'top' })[cur] === dir ? 'center' : dir));
      lay = move(lay, id, to, null); changed('layout');
      var ng = dock.querySelector('[data-dock-grip="' + id + '"]'); if (ng) try { ng.focus(); } catch (x) { /* ignore */ }
    }

    // --- zone edges and the line between two flexible panels
    function onSplitDown(e) {
      var z = e.target.closest('[data-zsplit]'), s = e.target.closest('[data-isplit]');
      if ((!z && !s) || e.button > 0 || !canEdit()) return;
      e.preventDefault();
      if (z) split = { kind: 'zone', zone: z.getAttribute('data-zsplit'), x: e.clientX, y: e.clientY, v: fitSize(z.getAttribute('data-zsplit'), lay.size[z.getAttribute('data-zsplit')]), el: z };
      else {
        var ids = s.getAttribute('data-isplit').split('|'), a = panelEl[ids[0]], b = panelEl[ids[1]], row = s.classList.contains('bt-isplit-v');
        var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        split = { kind: 'inner', a: ids[0], b: ids[1], row: row, x: e.clientX, y: e.clientY, sa: row ? ra.width : ra.height, sb: row ? rb.width : rb.height,
          w: lay.weight[ids[0]] + lay.weight[ids[1]], el: s };
      }
      try { split.el.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ }
      dock.classList.add('bt-dock-resizing'); split.el.classList.add('bt-split-active');
    }
    function onSplitMove(e) {
      var s = split;
      if (s.kind === 'zone') {
        var dz = s.zone === 'left' ? e.clientX - s.x : s.zone === 'right' ? s.x - e.clientX : s.zone === 'top' ? e.clientY - s.y : s.y - e.clientY;
        lay.size[s.zone] = Math.round(clamp(s.v + dz, SIZE[s.zone].min, SIZE[s.zone].max));
        dock.style.setProperty('--bt-z-' + s.zone, fitSize(s.zone, lay.size[s.zone]) + 'px');
      } else {
        var d = s.row ? e.clientX - s.x : e.clientY - s.y, tot = s.sa + s.sb, fa = clamp((s.sa + d) / tot, 0.12, 0.88);
        lay.weight[s.a] = Math.round(s.w * fa * 100) / 100; lay.weight[s.b] = Math.round(s.w * (1 - fa) * 100) / 100;
        panelEl[s.a].style.flexGrow = String(lay.weight[s.a]); panelEl[s.b].style.flexGrow = String(lay.weight[s.b]);
      }
    }
    function onSplitUp() {
      var s = split; split = null;
      s.el.classList.remove('bt-split-active'); dock.classList.remove('bt-dock-resizing');
      persist(); if (opts.onChange) opts.onChange(lay, 'size');
    }
    function onSplitKey(e) {
      var z = e.target.closest && e.target.closest('[data-zsplit]'), s = e.target.closest && e.target.closest('[data-isplit]');
      if ((!z && !s) || !canEdit()) return;
      var k = e.key, step = e.shiftKey ? 64 : 16, used = true;
      if (z) {
        var zone = z.getAttribute('data-zsplit'), grow = { left: 'ArrowRight', right: 'ArrowLeft', top: 'ArrowDown', bottom: 'ArrowUp' }[zone],
          shrink = { left: 'ArrowLeft', right: 'ArrowRight', top: 'ArrowUp', bottom: 'ArrowDown' }[zone];
        if (k === grow) lay.size[zone] = clamp(lay.size[zone] + step, SIZE[zone].min, SIZE[zone].max);
        else if (k === shrink) lay.size[zone] = clamp(lay.size[zone] - step, SIZE[zone].min, SIZE[zone].max);
        else if (k === 'Home') lay.size[zone] = SIZE[zone].def;
        else used = false;
      } else {
        var ids = s.getAttribute('data-isplit').split('|'), w = lay.weight[ids[0]] + lay.weight[ids[1]], dd = (e.shiftKey ? 0.25 : 0.08) * w;
        var fwd = s.classList.contains('bt-isplit-v') ? 'ArrowRight' : 'ArrowDown', back = s.classList.contains('bt-isplit-v') ? 'ArrowLeft' : 'ArrowUp';
        if (k === fwd || k === back) {
          var a = clamp(lay.weight[ids[0]] + (k === fwd ? dd : -dd), w * 0.12, w * 0.88);
          lay.weight[ids[0]] = Math.round(a * 100) / 100; lay.weight[ids[1]] = Math.round((w - a) * 100) / 100;
        } else used = false;
      }
      if (!used) return;
      e.preventDefault(); e.stopPropagation();
      persist(); apply(); if (opts.onChange) opts.onChange(lay, 'size');
    }

    // --- hide / show
    function onClick(e) {
      var h = e.target.closest('[data-dock-hide]'); if (!h || !dock.contains(h)) return;
      e.preventDefault();
      setPanel(h.getAttribute('data-dock-hide'), false);
    }
    function setPanel(id, show) {
      if (id === 'stats') { lay = setHidden(lay, 'stats', false); lay.statsDetached = !!show; }
      else lay = setHidden(lay, id, !show);
      changed('visibility');
    }

    PAGE.on(dock, 'pointerdown', function (e) { onSplitDown(e); if (!split) onGripDown(e); });
    PAGE.on(document, 'pointermove', onMove);
    PAGE.on(document, 'pointerup', onUp);
    PAGE.on(document, 'pointercancel', onUp);
    PAGE.on(dock, 'keydown', function (e) { onSplitKey(e); onGripKey(e); });
    PAGE.on(dock, 'click', onClick);
    PAGE.on(global, 'resize', function () { apply(); });
    apply();

    return {
      layout: function () { return lay; },
      apply: apply,
      canEdit: canEdit,
      isShown: function (id) { var p = panelEl[id]; return !!p && !p.hidden; },
      setPanel: setPanel,
      // statistics in their own panel (true) or in the tab (false)
      setStatsDetached: function (on) { lay = setHidden(lay, 'stats', false); lay.statsDetached = !!on; if (on && !zoneOf(lay, 'stats')) lay = move(lay, 'stats', 'bottom', null); changed('stats'); },
      statsDetached: function () { return lay.statsDetached; },
      move: function (id, zone, index) { lay = move(lay, id, zone, index); changed('layout'); },
      multi: function (id) { return multiOf(lay, id); },
      setMulti: function (id, m) { lay.multi[id] = normalizeMulti(id, m); persist(); },
      widgets: function () { return lay.widgets; },
      setWidgets: function (w) { lay.widgets = w; persist(); },
      reset: function () { lay = defaults(); changed('reset'); },
      destroy: function () { if (ghost) ghost.remove(); }
    };
  }

  global.WwBtDock = {
    VERSION: VERSION, KEY: KEY, PANELS: PANELS, HIDEABLE: HIDEABLE, ZONES: ZONES, SIZE: SIZE, EDGE: EDGE, GRID: GRID, MULTI_IDS: MULTI_IDS,
    defaults: defaults, normalize: normalize, zoneOf: zoneOf, move: move, setHidden: setHidden, effective: effective, isFlex: isFlex,
    dropTarget: dropTarget, multiDefault: multiDefault, normalizeMulti: normalizeMulti, multiOf: multiOf, swapViews: swapViews,
    cellArea: cellArea, template: template, resizeTracks: resizeTracks, storageKey: storageKey, load: load, save: save, mount: mount
  };
})(typeof window !== 'undefined' ? window : globalThis);
