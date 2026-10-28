// Backtest v2: the replay screen as a desktop (window.WwBtDesk). In advanced mode on a wide screen every part is a window: the chart
// (in multi-chart every chart), drawing tools, replay controls, order panel, balance, open positions, pending orders, history and statistics. A window
// moves by its title bar, resizes from its four edges and corners (minimum sizes), minimizes to the taskbar, maximizes (also by a
// double click on the title) and restores, closes (the "Windows" menu opens it again) and comes to the front when clicked. Dragged to
// the left or right edge it takes that half, to the top the whole desk, to a corner a quarter (a preview shows where); near other
// windows and the desk edges it sticks like a magnet. Simple mode keeps a fixed layout without frames; a phone stacks the windows at
// full width and never drags. Layouts: the current one is saved per user, four presets, named layouts (free 1, Premium more), reset.
// Stored per user in localStorage 'ww_bt_desk_v1:<user id>' (with the statistics widgets and the full-screen multi-chart grid).
// Own code, no library: snapping, magnet, taskbar and the chart resizing are specific to this page (see docs/BACKTEST-DURUM.md).
// The pure model at the top is unit tested; mount() needs the DOM.
(function (global) {
  'use strict';

  var VERSION = 1, KEY = 'ww_bt_desk_v1', OLD_KEY = 'ww_bt_dock_v1';
  var WINS = ['replay', 'chart', 'chart2', 'chart3', 'chart4', 'draw', 'balance', 'order', 'open', 'orders', 'history', 'stats'];
  var CHARTS = ['chart', 'chart2', 'chart3', 'chart4'];
  var CLOSABLE = ['replay', 'draw', 'balance', 'order', 'open', 'orders', 'history', 'stats'];   // charts follow the chart layout: minimize only
  // taskbar icons (lucide names); the window's title stays as the tooltip and the accessible name
  var TASK_ICON = { replay: 'circle-play', chart: 'chart-candlestick', chart2: 'chart-candlestick', chart3: 'chart-candlestick', chart4: 'chart-candlestick',
    draw: 'pencil-ruler', balance: 'wallet', order: 'arrow-left-right', open: 'briefcase', orders: 'hourglass', history: 'history', stats: 'chart-pie' };
  // the drawing tools are a window on the free desk only (elsewhere the toolbar sits next to the main chart); it never maximizes or snaps
  var FREE_ONLY = ['draw'], NO_MAX = ['draw'];
  var DRAW_W = 82;                                       // px: two toolbar columns (2 x 34 + 3) with the window's padding and border
  var MIN = { replay: [380, 84], chart: [320, 260], chart2: [240, 150], chart3: [240, 150], chart4: [240, 150], draw: [46, 100], balance: [220, 110],
    order: [250, 220], open: [300, 130], orders: [300, 130], history: [300, 130], stats: [340, 220] };
  var STACK = ['replay', 'chart', 'chart2', 'chart3', 'chart4', 'order', 'balance', 'open', 'orders', 'history', 'stats'];   // phone order
  var SIMPLE = ['replay', 'chart', 'balance', 'order'];
  var PRESET_IDS = ['classic', 'focus', 'analysis', 'multi'];
  // fractions of the desk (x, y, w, h); st: 'min' = in the taskbar; missing = closed
  var PRESETS = {
    classic: { charts: '1', wins: {
      replay: [0, 0, 1, 0.12], chart: [0, 0.12, 0.72, 0.56], balance: [0.72, 0.12, 0.28, 0.24], order: [0.72, 0.36, 0.28, 0.64],
      open: [0, 0.68, 0.36, 0.32], orders: [0.36, 0.68, 0.36, 0.32], history: [0.36, 0.5, 0.36, 0.5, 'min'] } },
    focus: { charts: '1', wins: {
      replay: [0, 0, 1, 0.12], chart: [0, 0.12, 0.74, 0.88], balance: [0.74, 0.12, 0.26, 0.24], order: [0.74, 0.36, 0.26, 0.64] } },
    analysis: { charts: '1', wins: {
      replay: [0, 0, 0.55, 0.17], chart: [0, 0.17, 0.55, 0.45], history: [0, 0.62, 0.55, 0.38], stats: [0.55, 0, 0.45, 1],
      order: [0.55, 0.36, 0.25, 0.64, 'min'], balance: [0.8, 0.17, 0.2, 0.24, 'min'], open: [0, 0.62, 0.55, 0.38, 'min'] } },
    multi: { charts: '2x2', pro: true, wins: {
      replay: [0, 0, 1, 0.12], chart: [0, 0.12, 0.37, 0.44], chart2: [0.37, 0.12, 0.37, 0.44], chart3: [0, 0.56, 0.37, 0.44],
      chart4: [0.37, 0.56, 0.37, 0.44], balance: [0.74, 0.12, 0.26, 0.24], order: [0.74, 0.36, 0.26, 0.64] } }
  };
  // where a window closed in the preset appears when it is opened the first time
  var FIRST_OPEN = { stats: [0.3, 0.04, 0.7, 0.92], history: [0.1, 0.5, 0.62, 0.48], open: [0.05, 0.55, 0.6, 0.43], orders: [0.15, 0.55, 0.6, 0.43],
    balance: [0.7, 0.12, 0.3, 0.24], order: [0.7, 0.12, 0.3, 0.64], replay: [0, 0, 1, 0.12] };
  var GAP = 8, EDGE = 14, CORNER = 72, MAGNET = 10, TASKBAR = 38, MAX_SAVED = 500, MAX_NAME = 40;   // Premium: unlimited in practice (a guard against a runaway store)
  // multi-chart grid (full screen: the charts share one grid); slots [rowFrom, rowTo, colFrom, colTo], slot 0 = the big one in 1+3
  var GRID = {
    '1': { cols: 1, rows: 1, slots: [[1, 2, 1, 2]], splits: [] },
    '2h': { cols: 2, rows: 1, slots: [[1, 2, 1, 2], [1, 2, 2, 3]], splits: [{ kind: 'col', i: 0, from: 1, to: 2 }] },
    '2v': { cols: 1, rows: 2, slots: [[1, 2, 1, 2], [2, 3, 1, 2]], splits: [{ kind: 'row', i: 0, from: 1, to: 2 }] },
    '2x2': { cols: 2, rows: 2, slots: [[1, 2, 1, 2], [1, 2, 2, 3], [2, 3, 1, 2], [2, 3, 2, 3]],
      splits: [{ kind: 'col', i: 0, from: 1, to: 3 }, { kind: 'row', i: 0, from: 1, to: 3 }] },
    '1+3': { cols: 2, rows: 3, slots: [[1, 4, 1, 2], [1, 2, 2, 3], [2, 3, 2, 3], [3, 4, 2, 3]],
      splits: [{ kind: 'col', i: 0, from: 1, to: 4 }, { kind: 'row', i: 0, from: 2, to: 3 }, { kind: 'row', i: 1, from: 2, to: 3 }] }
  };
  var MULTI_IDS = ['1', '2h', '2v', '2x2', '1+3'];

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function r4(v) { return Math.round(v * 10000) / 10000; }

  // ---------------------------------------------------------------- geometry (pure; px rects { x, y, w, h }, desk { w, h })
  function toPx(f, desk) { return { x: Math.round(f.x * desk.w), y: Math.round(f.y * desk.h), w: Math.round(f.w * desk.w), h: Math.round(f.h * desk.h) }; }
  function toFrac(r, desk) { return { x: r4(r.x / desk.w), y: r4(r.y / desk.h), w: r4(r.w / desk.w), h: r4(r.h / desk.h) }; }
  function minOf(id) { return MIN[id] || [200, 120]; }
  // at least the minimum size (or the desk, when it is smaller), inside the desk
  function fit(r, desk, id) {
    var m = minOf(id), w = clamp(Math.round(r.w), Math.min(m[0], desk.w), desk.w), h = clamp(Math.round(r.h), Math.min(m[1], desk.h), desk.h);
    return { x: clamp(Math.round(r.x), 0, desk.w - w), y: clamp(Math.round(r.y), 0, desk.h - h), w: w, h: h };
  }
  // a preset fraction box as px with GAP / 2 inside each side (desk edges get the same small margin)
  function inset(f, desk) {
    var x = f[0] * desk.w, y = f[1] * desk.h, w = f[2] * desk.w, h = f[3] * desk.h, g = GAP / 2;
    return { x: Math.round(x + g), y: Math.round(y + g), w: Math.round(w - GAP), h: Math.round(h - GAP) };
  }
  // where a window dragged by its title lands when the pointer is at a desk edge: 'left' | 'right' | 'top' (maximize) | corners
  function snapZone(pt, desk) {
    var left = pt.x <= EDGE, right = pt.x >= desk.w - EDGE, top = pt.y <= EDGE;
    if (left || right) {
      if (pt.y <= CORNER) return left ? 'tl' : 'tr';
      if (pt.y >= desk.h - CORNER) return left ? 'bl' : 'br';
      return left ? 'left' : 'right';
    }
    return top ? 'top' : null;
  }
  function zoneRect(z, desk) {
    var hw = desk.w / 2, hh = desk.h / 2, f = {
      left: [0, 0, 0.5, 1], right: [0.5, 0, 0.5, 1], top: [0, 0, 1, 1], tl: [0, 0, 0.5, 0.5], tr: [0.5, 0, 0.5, 0.5], bl: [0, 0.5, 0.5, 0.5], br: [0.5, 0.5, 0.5, 0.5]
    }[z];
    void hw; void hh;
    return f ? inset(f, desk) : null;
  }
  // magnet while moving: an edge within MAGNET px of a desk edge or of another window's edge (side by side with GAP, or aligned)
  function magnetMove(r, others, desk) {
    var xs = [{ v: GAP / 2, edge: 'l' }, { v: desk.w - GAP / 2, edge: 'r' }], ys = [{ v: GAP / 2, edge: 't' }, { v: desk.h - GAP / 2, edge: 'b' }];
    others.forEach(function (o) {
      xs.push({ v: o.x + o.w + GAP, edge: 'l' }, { v: o.x, edge: 'l' }, { v: o.x - GAP, edge: 'r' }, { v: o.x + o.w, edge: 'r' });
      ys.push({ v: o.y + o.h + GAP, edge: 't' }, { v: o.y, edge: 't' }, { v: o.y - GAP, edge: 'b' }, { v: o.y + o.h, edge: 'b' });
    });
    function best(list, a, b) {
      var out = null;
      list.forEach(function (c) { var d = c.v - (c.edge === 'l' || c.edge === 't' ? a : b); if (Math.abs(d) <= MAGNET && (!out || Math.abs(d) < Math.abs(out))) out = d; });
      return out || 0;
    }
    return { x: r.x + best(xs, r.x, r.x + r.w), y: r.y + best(ys, r.y, r.y + r.h), w: r.w, h: r.h };
  }
  // magnet while resizing: only the edges being dragged (h: 'n' | 's' | 'e' | 'w' | 'ne' ...)
  function magnetResize(r, h, others, desk) {
    var out = { x: r.x, y: r.y, w: r.w, h: r.h };
    function near(v, cands) { var b = null; cands.forEach(function (c) { if (Math.abs(c - v) <= MAGNET && (b === null || Math.abs(c - v) < Math.abs(b - v))) b = c; }); return b; }
    var xc = [GAP / 2, desk.w - GAP / 2], yc = [GAP / 2, desk.h - GAP / 2];
    others.forEach(function (o) { xc.push(o.x, o.x + o.w, o.x - GAP, o.x + o.w + GAP); yc.push(o.y, o.y + o.h, o.y - GAP, o.y + o.h + GAP); });
    var v;
    if (h.indexOf('e') >= 0 && (v = near(r.x + r.w, xc)) !== null) out.w = v - r.x;
    if (h.indexOf('w') >= 0 && (v = near(r.x, xc)) !== null) { out.w = r.x + r.w - v; out.x = v; }
    if (h.indexOf('s') >= 0 && (v = near(r.y + r.h, yc)) !== null) out.h = v - r.y;
    if (h.indexOf('n') >= 0 && (v = near(r.y, yc)) !== null) { out.h = r.y + r.h - v; out.y = v; }
    return out;
  }
  // resize from an edge or corner by (dx, dy) with the minimum size kept (the opposite edge stays where it is)
  function resizeBy(r, h, dx, dy, min) {
    var x = r.x, y = r.y, w = r.w, hh = r.h;
    if (h.indexOf('e') >= 0) w = Math.max(min[0], r.w + dx);
    if (h.indexOf('s') >= 0) hh = Math.max(min[1], r.h + dy);
    if (h.indexOf('w') >= 0) { w = Math.max(min[0], r.w - dx); x = r.x + r.w - w; }
    if (h.indexOf('n') >= 0) { hh = Math.max(min[1], r.h - dy); y = r.y + r.h - hh; }
    return { x: x, y: y, w: w, h: hh };
  }
  // the chart windows of a multi-chart layout share `area` like the full-screen grid (equal tracks, GAP between)
  function tile(layoutId, area) {
    var g = GRID[layoutId] || GRID['1'], cw = (area.w - (g.cols - 1) * GAP) / g.cols, ch = (area.h - (g.rows - 1) * GAP) / g.rows;
    if (layoutId === '1+3') cw = (area.w - GAP) / 2;
    return g.slots.map(function (s) {
      var x = area.x + (s[2] - 1) * (cw + GAP), y = area.y + (s[0] - 1) * (ch + GAP);
      return { x: Math.round(x), y: Math.round(y), w: Math.round((s[3] - s[2]) * cw + (s[3] - s[2] - 1) * GAP), h: Math.round((s[1] - s[0]) * ch + (s[1] - s[0] - 1) * GAP) };
    });
  }
  // the area the charts of a layout need at least (each tile its minimum size; the main chart, slot 0, carries the legend, the
  // drawing tools and the footer, so its row and column need more), grown from `area` and kept inside the desk
  function tileArea(layoutId, area, desk) {
    var g = GRID[layoutId] || GRID['1'], mm = MIN.chart, me = MIN.chart2, s0 = g.slots[0], need = { w: 0, h: 0 };
    var mainRows = s0[1] - s0[0], mainCols = s0[3] - s0[2];
    need.h = Math.max(g.rows * me[1], mainRows === g.rows ? mm[1] : g.rows * mm[1]) + (g.rows - 1) * GAP;
    need.w = Math.max(g.cols * me[0], mainCols === g.cols ? mm[0] : g.cols * mm[0]) + (g.cols - 1) * GAP;
    var w = Math.min(desk.w - GAP, Math.max(area.w, need.w)), h = Math.min(desk.h - GAP, Math.max(area.h, need.h));
    return { x: clamp(area.x, GAP / 2, desk.w - GAP / 2 - w), y: clamp(area.y, GAP / 2, desk.h - GAP / 2 - h), w: w, h: h };
  }
  // the drawing tools window takes the left edge of the chart block, where the toolbar used to be inside the chart window; the charts
  // of the block (the main chart and the charts right of / under it) shrink in proportion, so a grid keeps equal columns and a layout
  // from before the window looks the same. `ids`: the chart windows the layout places.
  function carveDraw(wins, desk, ids) {
    var c = wins.chart, x0 = c.x, dw = r4(DRAW_W / desk.w), step = r4((DRAW_W + GAP) / desk.w);
    var block = CHARTS.filter(function (id) { return ids.indexOf(id) >= 0 && wins[id].x >= x0 - 0.001; });
    var right = Math.max.apply(null, block.map(function (id) { return wins[id].x + wins[id].w; }).concat([x0 + c.w])), k = (right - x0 - step) / (right - x0);
    if (c.w * k < 3 * step) block = [];                    // a chart too narrow to share: the window goes over its edge
    var y1 = c.y, y2 = c.y + c.h;
    block.forEach(function (id) {
      var w = wins[id];
      if (Math.abs(w.x - x0) < 0.001) { y1 = Math.min(y1, w.y); y2 = Math.max(y2, w.y + w.h); }
      w.x = r4(x0 + step + (w.x - x0) * k); w.w = r4(w.w * k);
    });
    wins.draw = { x: x0, y: y1, w: dw, h: r4(y2 - y1), st: 'normal', closed: false };
  }
  function bbox(rs) {
    var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    rs.forEach(function (r) { x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y); x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h); });
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  // ---------------------------------------------------------------- layout model (pure)
  // { v, wins: { id: { x, y, w, h (fractions), st: 'normal'|'min'|'max', closed, prev (fractions before max/snap) } }, z: [ids, front last],
  //   preset, saved: [{ name, wins, z, charts }], widgets, multi: { layoutId: { cols, rows, order } } }
  function fromPreset(id, desk) {
    var p = PRESETS[id] || PRESETS.classic, wins = {};
    WINS.forEach(function (w) {
      var f = p.wins[w];
      if (w === 'draw') return;
      if (!f) {
        // closed in this preset; a chart window gets a place for when the chart layout asks for it
        var fb = CHARTS.indexOf(w) > 0 ? [0.2 + 0.05 * CHARTS.indexOf(w), 0.2, 0.4, 0.4] : (FIRST_OPEN[w] || [0.25, 0.25, 0.4, 0.4]);
        wins[w] = Object.assign(toFrac(inset(fb, desk), desk), { st: 'normal', closed: CLOSABLE.indexOf(w) >= 0 });
        return;
      }
      wins[w] = Object.assign(toFrac(inset(f, desk), desk), { st: f[4] === 'min' ? 'min' : 'normal', closed: false });
    });
    carveDraw(wins, desk, Object.keys(p.wins));
    return { wins: wins, z: WINS.slice(), charts: p.charts };
  }
  function defaults(desk) {
    var b = fromPreset('classic', desk || { w: 1400, h: 800 });
    return { v: VERSION, wins: b.wins, z: b.z, preset: 'classic', saved: [], widgets: null, multi: {} };
  }
  function cleanWin(w, d) {
    if (!w || typeof w !== 'object') return clone(d);
    var out = { x: clamp(num(w.x, d.x), 0, 0.98), y: clamp(num(w.y, d.y), 0, 0.98), w: clamp(num(w.w, d.w), 0.02, 1), h: clamp(num(w.h, d.h), 0.02, 1),
      st: w.st === 'min' || w.st === 'max' ? w.st : 'normal', closed: w.closed === true };
    if (w.prev && typeof w.prev === 'object') out.prev = { x: clamp(num(w.prev.x, out.x), 0, 0.98), y: clamp(num(w.prev.y, out.y), 0, 0.98), w: clamp(num(w.prev.w, out.w), 0.02, 1), h: clamp(num(w.prev.h, out.h), 0.02, 1) };
    return out;
  }
  // a layout stored before the drawing tools window gets one at the left edge of its chart (see carveDraw)
  function cleanWins(src, d) {
    var out = {};
    WINS.forEach(function (id) { out[id] = cleanWin(src && src[id], d.wins[id]); if (CLOSABLE.indexOf(id) < 0) out[id].closed = false; });
    if (src && src.chart && !src.draw) carveDraw(out, { w: 1400, h: 800 }, CHARTS.filter(function (id) { return src[id]; }));
    return out;
  }
  function cleanZ(z) {
    var seen = {}, out = (Array.isArray(z) ? z : []).filter(function (id) { if (WINS.indexOf(id) < 0 || seen[id]) return false; seen[id] = true; return true; });
    WINS.forEach(function (id) { if (!seen[id]) out.unshift(id); });
    return out;
  }
  function cleanName(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME); }
  function normalize(p) {
    var d = defaults();
    if (!p || typeof p !== 'object' || p.v !== VERSION) return d;
    var out = { v: VERSION, wins: cleanWins(p.wins, d), z: cleanZ(p.z), preset: PRESET_IDS.indexOf(p.preset) >= 0 ? p.preset : null, saved: [],
      widgets: p.widgets && typeof p.widgets === 'object' ? p.widgets : null, multi: {} };
    (Array.isArray(p.saved) ? p.saved : []).slice(0, MAX_SAVED).forEach(function (s) {
      var name = cleanName(s && s.name);
      if (!name || out.saved.some(function (x) { return x.name.toLowerCase() === name.toLowerCase(); })) return;
      out.saved.push({ name: name, wins: cleanWins(s.wins, d), z: cleanZ(s.z), charts: MULTI_IDS.indexOf(s.charts) >= 0 ? s.charts : '1' });
    });
    MULTI_IDS.forEach(function (id) { if (p.multi && p.multi[id]) out.multi[id] = normalizeMulti(id, p.multi[id]); });
    return out;
  }
  function front(lay, id) {
    var n = clone(lay); n.z = n.z.filter(function (x) { return x !== id; }); n.z.push(id); return n;
  }
  function setWin(lay, id, patch) { var n = clone(lay); n.wins[id] = Object.assign(n.wins[id], patch); n.preset = null; return n; }
  // maximize keeps the size before it in `prev`; restore takes it back
  function maximize(lay, id) {
    var w = lay.wins[id]; if (!w || NO_MAX.indexOf(id) >= 0) return lay;
    if (w.st === 'max') return restore(lay, id);
    return front(setWin(lay, id, { st: 'max', prev: w.prev && w.st !== 'normal' ? w.prev : { x: w.x, y: w.y, w: w.w, h: w.h } }), id);
  }
  function restore(lay, id) {
    var w = lay.wins[id]; if (!w) return lay;
    if (w.st === 'max') { var p = w.prev || w; return front(setWin(lay, id, { st: 'normal', x: p.x, y: p.y, w: p.w, h: p.h, prev: undefined }), id); }
    return front(setWin(lay, id, { st: 'normal' }), id);
  }
  function minimize(lay, id) { return setWin(lay, id, { st: 'min' }); }
  function close(lay, id) { return CLOSABLE.indexOf(id) < 0 ? minimize(lay, id) : setWin(lay, id, { closed: true }); }
  function open(lay, id) {
    var w = lay.wins[id]; if (!w) return lay;
    return front(setWin(lay, id, { closed: false, st: w.st === 'min' ? 'normal' : w.st }), id);
  }
  // a window put to a snap zone remembers its free size (dragging it out of the zone gives that size back)
  function snapTo(lay, id, zone, desk) {
    var w = lay.wins[id], r = zoneRect(zone, desk); if (!w || !r) return lay;
    var prev = w.prev || { x: w.x, y: w.y, w: w.w, h: w.h };
    if (zone === 'top') return front(setWin(lay, id, { st: 'max', prev: prev }), id);
    return front(setWin(lay, id, Object.assign(toFrac(r, desk), { st: 'normal', prev: prev })), id);
  }
  function applyPreset(lay, id, desk) {
    var b = fromPreset(id, desk), n = clone(lay);
    n.wins = b.wins; n.z = b.z; n.preset = id;
    return n;
  }
  // named layouts: free 1 (saving under the same name replaces it), Premium unlimited (MAX_SAVED only guards the store)
  function saveNamed(lay, name, charts, pro) {
    name = cleanName(name); if (!name) return { ok: false, error: 'NAME' };
    var n = clone(lay), i = -1;
    n.saved.forEach(function (s, k) { if (s.name.toLowerCase() === name.toLowerCase()) i = k; });
    var limit = pro ? MAX_SAVED : 1;
    if (i < 0 && n.saved.length >= limit) return { ok: false, error: pro ? 'MAX' : 'LIMIT' };
    var rec = { name: name, wins: clone(n.wins), z: n.z.slice(), charts: MULTI_IDS.indexOf(charts) >= 0 ? charts : '1' };
    if (i >= 0) n.saved[i] = rec; else n.saved.push(rec);
    return { ok: true, layout: n };
  }
  function loadNamed(lay, name) {
    var s = null; lay.saved.forEach(function (x) { if (x.name === name) s = x; });
    if (!s) return null;
    var n = clone(lay); n.wins = clone(s.wins); n.z = s.z.slice(); n.preset = null;
    return { layout: n, charts: s.charts };
  }
  function deleteNamed(lay, name) { var n = clone(lay); n.saved = n.saved.filter(function (s) { return s.name !== name; }); return n; }
  // which windows show in the taskbar and in what state
  function visibleWins(lay, present) { return WINS.filter(function (id) { return present(id) && !lay.wins[id].closed; }); }

  // ---------------------------------------------------------------- full-screen multi-chart grid (pure)
  function multiDefault(id) {
    var g = GRID[id] || GRID['1'];
    return { cols: id === '1+3' ? [2, 1] : ones(g.cols), rows: ones(g.rows), order: g.slots.map(function (s, i) { return i; }) };
  }
  function ones(n) { var a = []; for (var i = 0; i < n; i++) a.push(1); return a; }
  function normalizeMulti(id, m) {
    var d = multiDefault(id), g = GRID[id] || GRID['1'];
    function tracks(a, n, def) { return Array.isArray(a) && a.length === n ? a.map(function (x, i) { return clamp(num(x, def[i]), 0.15, 6); }) : def; }
    var order = Array.isArray(m && m.order) && m.order.length === g.slots.length && g.slots.every(function (s, i) { return m.order.indexOf(i) >= 0; }) ? m.order.map(Number) : d.order;
    return { cols: tracks(m && m.cols, g.cols, d.cols), rows: tracks(m && m.rows, g.rows, d.rows), order: order };
  }
  function multiOf(p, id) { return p.multi[id] ? p.multi[id] : multiDefault(id); }
  function swapViews(m, a, b) {
    var n = clone(m), ia = n.order.indexOf(a), ib = n.order.indexOf(b);
    if (ia < 0 || ib < 0 || ia === ib) return n;
    n.order[ia] = b; n.order[ib] = a;
    return n;
  }
  function cellArea(id, m, view) {
    var g = GRID[id] || GRID['1'], slot = m.order.indexOf(view), s = g.slots[slot < 0 ? 0 : slot];
    return s[0] + ' / ' + s[2] + ' / ' + s[1] + ' / ' + s[3];
  }
  function template(tr) { return tr.map(function (f) { return 'minmax(0, ' + (Math.round(f * 1000) / 1000) + 'fr)'; }).join(' '); }
  function resizeTracks(tr, i, delta, total) {
    var n = tr.slice(), sum = n.reduce(function (a, b) { return a + b; }, 0), d = delta / Math.max(1, total) * sum;
    d = clamp(d, 0.15 - n[i], n[i + 1] - 0.15);
    n[i] += d; n[i + 1] -= d;
    return n;
  }

  // ---------------------------------------------------------------- storage (with the statistics widgets and grid of the old panel layout)
  function storageKey(userId) { return KEY + ':' + (userId || 'anon'); }
  function load(storage, userId) {
    var p = null, old = null;
    try { p = JSON.parse((storage && storage.getItem(storageKey(userId))) || 'null'); } catch (e) { p = null; }
    var lay = normalize(p);
    if (!p) {
      try { old = JSON.parse((storage && storage.getItem(OLD_KEY + ':' + (userId || 'anon'))) || 'null'); } catch (e) { old = null; }
      if (old && typeof old === 'object') {
        if (old.widgets && typeof old.widgets === 'object') lay.widgets = old.widgets;
        MULTI_IDS.forEach(function (id) { if (old.multi && old.multi[id]) lay.multi[id] = normalizeMulti(id, old.multi[id]); });
      }
    }
    return lay;
  }
  function save(storage, userId, p) { try { if (storage) storage.setItem(storageKey(userId), JSON.stringify(p)); return true; } catch (e) { return false; } }

  // ---------------------------------------------------------------- DOM controller
  // opts: { page (wwPage), desk (#bt-desk), storage, userId, t(key, fb, params), mode() -> 'simple'|'advanced', wide() -> bool,
  //         fullscreen() -> bool, pro() -> bool, present(id) -> bool (chart2..4 only while the chart layout has them), charts() -> layout id,
  //         setCharts(id) -> bool (false: not allowed), upgrade(), toast(msg, type), onChange(what), icons(), placed(kind) after each apply }
  //   windows: .bt-win[data-win] inside the desk with .bt-win-head (title bar), [data-win-act] buttons, .bt-win-rz[data-rz] handles
  function mount(opts) {
    var PAGE = opts.page, desk = opts.desk, t = opts.t;
    var lay = load(opts.storage, opts.userId), g = null, saveTimer = 0, kind = '';
    var winEl = {}, preview = desk.querySelector('.bt-desk-preview'), bar = desk.querySelector('.bt-taskbar');
    WINS.forEach(function (id) { winEl[id] = desk.querySelector('.bt-win[data-win="' + id + '"]'); });

    function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(function () { save(opts.storage, opts.userId, lay); }, 150); }
    function flush() { clearTimeout(saveTimer); save(opts.storage, opts.userId, lay); }
    function present(id) { return !!winEl[id] && (CHARTS.indexOf(id) <= 0 || opts.present(id)); }
    function free() { return kind === 'free'; }
    function size() { return { w: Math.max(1, desk.clientWidth), h: Math.max(1, desk.clientHeight - TASKBAR) }; }
    function others(id) {
      var d = size();
      return visibleWins(lay, present).filter(function (x) { return x !== id && lay.wins[x].st === 'normal'; }).map(function (x) { return toPx(lay.wins[x], d); });
    }
    function changed(what) { persist(); apply(); if (opts.onChange) opts.onChange(what || 'layout'); }

    // desk kind: free windows (advanced, wide, not full screen) | simple (fixed, no frames) | stack (phone) | fs (full screen chart)
    function apply() {
      kind = opts.fullscreen() ? 'fs' : !opts.wide() ? 'stack' : opts.mode() === 'advanced' ? 'free' : 'simple';
      desk.setAttribute('data-desk', kind);
      var d = size(), shown = visibleWins(lay, present);
      WINS.forEach(function (id) {
        var el = winEl[id]; if (!el) return;
        var w = lay.wins[id], on;
        if (FREE_ONLY.indexOf(id) >= 0 && kind !== 'free') on = false;
        else if (kind === 'simple' || (kind === 'stack' && opts.mode() !== 'advanced')) on = SIMPLE.indexOf(id) >= 0;
        else if (kind === 'fs') on = CHARTS.indexOf(id) >= 0 ? present(id) : SIMPLE.indexOf(id) >= 0;
        else on = shown.indexOf(id) >= 0 && (kind === 'stack' || w.st !== 'min');
        el.hidden = !on;
        el.setAttribute('data-st', kind === 'free' ? w.st : 'normal');
        el.classList.toggle('bt-win-front', kind === 'free' && lay.z[lay.z.length - 1] === id);
        if (kind !== 'free') { el.style.left = el.style.top = el.style.width = el.style.height = el.style.zIndex = ''; return; }
        var r = w.st === 'max' ? { x: GAP / 2, y: GAP / 2, w: d.w - GAP, h: d.h - GAP } : fit(toPx(w, d), d, id);
        el.style.left = r.x + 'px'; el.style.top = r.y + 'px'; el.style.width = r.w + 'px'; el.style.height = r.h + 'px';
        el.style.zIndex = String(10 + lay.z.indexOf(id));
        var mx = el.querySelector('[data-win-act="max"]');
        if (mx) {
          var lab = w.st === 'max' ? t('backtest.win.restore', 'Önceki boyut') : t('backtest.win.maximize', 'Ekranı kapla');
          mx.title = lab; mx.setAttribute('aria-label', lab); mx.setAttribute('data-icon', w.st === 'max' ? 'restore' : 'max');
        }
        var cl = el.querySelector('[data-win-act="close"]'); if (cl) cl.hidden = CLOSABLE.indexOf(id) < 0;
      });
      renderTaskbar();
      if (opts.placed) opts.placed(kind);
    }
    function title(id) { var h = winEl[id] && winEl[id].querySelector('.bt-win-title'); return h ? h.textContent.replace(/\s+/g, ' ').trim() : id; }
    function renderTaskbar() {
      if (!bar) return;
      bar.textContent = ''; bar.setAttribute('aria-label', t('backtest.win.taskbar', 'Görev çubuğu'));
      if (kind !== 'free') return;
      var top = lay.z[lay.z.length - 1];
      visibleWins(lay, present).forEach(function (id) {
        var w = lay.wins[id], b = document.createElement('button');
        b.type = 'button'; b.className = 'bt-task'; b.setAttribute('data-task', id);
        b.setAttribute('aria-pressed', w.st !== 'min' && id === top ? 'true' : 'false');
        if (w.st === 'min') b.classList.add('bt-task-min');
        var lab = title(id), ic = taskIcon(TASK_ICON[id] || 'app-window'); if (ic) b.appendChild(ic);
        var n = CHARTS.indexOf(id); if (n > 0) { var k = document.createElement('span'); k.className = 'bt-task-n'; k.setAttribute('aria-hidden', 'true'); k.textContent = String(n + 1); b.appendChild(k); }
        b.setAttribute('aria-label', lab);
        b.title = w.st === 'min' ? t('backtest.win.task_restore', '{name}: geri getir', { name: lab }) : lab;
        bar.appendChild(b);
      });
    }
    // the svg straight from lucide: createIcons() would redraw every icon on the page, also the one under a pointer about to click
    function taskIcon(name) {
      try {
        var L = window.lucide, node = L && L.icons && L.icons[name.replace(/(^|-)(\w)/g, function (m, d, c) { return c.toUpperCase(); })];
        if (!node) return null;
        var svg = L.createElement(node); svg.setAttribute('class', 'lucide lucide-' + name); svg.setAttribute('aria-hidden', 'true');
        return svg;
      } catch (e) { return null; }
    }

    // --- move by the title bar (snap zones and magnet), resize by the edges
    function local(e) { var b = desk.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; }
    function curRect(id) { var d = size(), w = lay.wins[id]; return w.st === 'max' ? { x: GAP / 2, y: GAP / 2, w: d.w - GAP, h: d.h - GAP } : fit(toPx(w, d), d, id); }
    function place(id, r) { var el = winEl[id]; el.style.left = r.x + 'px'; el.style.top = r.y + 'px'; el.style.width = r.w + 'px'; el.style.height = r.h + 'px'; }
    function showPreview(r) {
      if (!preview) return;
      if (!r) { preview.hidden = true; return; }
      preview.style.left = r.x + 'px'; preview.style.top = r.y + 'px'; preview.style.width = r.w + 'px'; preview.style.height = r.h + 'px'; preview.hidden = false;
    }
    function onDown(e) {
      var w = e.target.closest && e.target.closest('.bt-win'); if (!w || !desk.contains(w)) return;
      var id = w.getAttribute('data-win');
      if (free() && lay.z[lay.z.length - 1] !== id) { lay = front(lay, id); apply(); persist(); }
      if (!free() || e.button > 0) return;
      var rz = e.target.closest('.bt-win-rz'), head = e.target.closest('.bt-win-head');
      if (rz && w.contains(rz)) {
        e.preventDefault();
        g = { kind: 'resize', id: id, h: rz.getAttribute('data-rz'), start: local(e), r0: curRect(id), pid: e.pointerId, el: rz, moved: false };
      } else if (head && !e.target.closest('button, select, input, a, [role="tab"], .bt-win-tools')) {
        e.preventDefault();
        g = { kind: 'move', id: id, start: local(e), r0: curRect(id), pid: e.pointerId, el: head, moved: false, zone: null };
      } else return;
      try { g.el.setPointerCapture(e.pointerId); } catch (x) { /* synthetic event */ }
    }
    function onMove(e) {
      if (!g) return;
      var p = local(e), dx = p.x - g.start.x, dy = p.y - g.start.y, d = size(), id = g.id;
      if (!g.moved) {
        if (Math.abs(dx) + Math.abs(dy) < 4) return;
        g.moved = true; desk.classList.add(g.kind === 'move' ? 'bt-desk-moving' : 'bt-desk-sizing');
        if (g.kind === 'move') {
          var w = lay.wins[id];
          // a maximized or snapped window gets its free size back under the pointer (like Windows)
          if (w.st === 'max' || w.prev) {
            var pv = toPx(w.prev || w, d), fx = (g.start.x - g.r0.x) / Math.max(1, g.r0.w);
            lay = setWin(lay, id, { st: 'normal', x: w.prev ? w.prev.x : w.x, y: w.prev ? w.prev.y : w.y, w: w.prev ? w.prev.w : w.w, h: w.prev ? w.prev.h : w.h, prev: undefined });
            g.r0 = { x: g.start.x - fx * pv.w, y: g.r0.y, w: pv.w, h: pv.h };
            winEl[id].setAttribute('data-st', 'normal');
          }
        }
      }
      e.preventDefault();
      var r;
      if (g.kind === 'move') {
        g.zone = NO_MAX.indexOf(id) >= 0 ? null : snapZone(p, d);
        r = fit({ x: g.r0.x + dx, y: g.r0.y + dy, w: g.r0.w, h: g.r0.h }, d, id);
        if (!g.zone) r = fit(magnetMove(r, others(id), d), d, id);
        showPreview(g.zone ? (g.zone === 'top' ? { x: GAP / 2, y: GAP / 2, w: d.w - GAP, h: d.h - GAP } : zoneRect(g.zone, d)) : null);
      } else {
        r = resizeBy(g.r0, g.h, dx, dy, minOf(id));
        r = magnetResize(r, g.h, others(id), d);
        r = fit(r, d, id);
      }
      g.r = r; place(id, r);
    }
    function onUp() {
      if (!g) return;
      var s = g; g = null;
      try { s.el.releasePointerCapture(s.pid); } catch (x) { /* ignore */ }
      desk.classList.remove('bt-desk-moving', 'bt-desk-sizing'); showPreview(null);
      if (!s.moved) return;
      var d = size();
      if (s.kind === 'move' && s.zone) lay = snapTo(lay, s.id, s.zone, d);
      else if (s.r) lay = setWin(lay, s.id, Object.assign(toFrac(s.r, d), s.kind === 'resize' ? { prev: undefined } : {}));
      changed(s.kind === 'move' ? 'move' : 'size');
    }
    // keyboard on a title bar: arrows move, Shift + arrows resize (Alt: 1 px steps)
    function onKey(e) {
      var head = e.target.closest && e.target.closest('.bt-win-head'); if (!head || e.target !== head || !free()) return;
      var dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!dir) return;
      e.preventDefault();
      var id = head.closest('.bt-win').getAttribute('data-win'), d = size(), r = curRect(id), st = e.altKey ? 1 : 16;
      r = e.shiftKey ? resizeBy(r, dir[0] ? 'e' : 's', dir[0] * st, dir[1] * st, minOf(id)) : { x: r.x + dir[0] * st, y: r.y + dir[1] * st, w: r.w, h: r.h };
      lay = setWin(lay, id, Object.assign(toFrac(fit(r, d, id), d), { st: 'normal', prev: undefined }));
      changed('move');
    }
    function act(id, a) {
      if (a === 'min') lay = minimize(lay, id);
      else if (a === 'max') lay = maximize(lay, id);
      else if (a === 'close') lay = close(lay, id);
      changed(a);
    }
    function onClick(e) {
      var b = e.target.closest && e.target.closest('[data-win-act]');
      if (b && desk.contains(b)) { var w = b.closest('.bt-win'); if (w) act(w.getAttribute('data-win'), b.getAttribute('data-win-act')); return; }
      var tk = e.target.closest && e.target.closest('[data-task]');
      if (tk && bar && bar.contains(tk)) {
        var id = tk.getAttribute('data-task'), w2 = lay.wins[id], top = lay.z[lay.z.length - 1];
        if (w2.st === 'min') lay = restore(lay, id);
        else if (id === top) lay = minimize(lay, id);
        else lay = front(lay, id);
        changed('task');
      }
    }
    function onDbl(e) {
      var head = e.target.closest && e.target.closest('.bt-win-head');
      if (!head || !free() || e.target.closest('button, select, input, a')) return;
      act(head.closest('.bt-win').getAttribute('data-win'), 'max');
    }

    // --- "Windows" menu: open / close each window, presets, named layouts, reset
    function renderMenu(box) {
      box.textContent = '';
      function h(txt) { var p = document.createElement('p'); p.className = 'bt-pop-title'; p.textContent = txt; box.appendChild(p); }
      function btn(cls, act, label, attrs) {
        var b = document.createElement('button'); b.type = 'button'; b.className = cls; b.setAttribute('data-desk-act', act); b.textContent = label;
        Object.keys(attrs || {}).forEach(function (k) { b.setAttribute(k, attrs[k]); });
        return b;
      }
      h(t('backtest.win.windows', 'Pencereler'));
      CLOSABLE.forEach(function (id) {
        var l = document.createElement('label'); l.className = 'bt-pop-check';
        var i = document.createElement('input'); i.type = 'checkbox'; i.checked = !lay.wins[id].closed; i.setAttribute('data-win-toggle', id);
        l.appendChild(i); var s = document.createElement('span'); s.textContent = title(id); l.appendChild(s); box.appendChild(l);
      });
      box.appendChild(sep());
      h(t('backtest.win.layouts', 'Düzenler'));
      var row = document.createElement('div'); row.className = 'bt-desk-presets';
      PRESET_IDS.forEach(function (id) {
        var b = btn('bt-pop-btn bt-desk-preset', 'preset', t('backtest.win.preset_' + id, id), { 'data-preset': id, 'aria-pressed': lay.preset === id ? 'true' : 'false' });
        if (PRESETS[id].pro && !opts.pro()) { var tag = document.createElement('span'); tag.className = 'bt-pro'; tag.textContent = 'PRO'; b.appendChild(tag); }
        row.appendChild(b);
      });
      box.appendChild(row);
      if (lay.saved.length) {
        var ul = document.createElement('ul'); ul.className = 'bt-desk-saved';
        lay.saved.forEach(function (s) {
          var li = document.createElement('li');
          li.appendChild(btn('bt-pop-btn bt-desk-load', 'load', s.name, { 'data-name': s.name, title: t('backtest.win.load', 'Yükle') + ': ' + s.name }));
          var del = btn('bt-pop-btn bt-desk-del', 'delete', '×', { 'data-name': s.name, 'aria-label': t('backtest.win.delete', 'Sil') + ': ' + s.name, title: t('backtest.win.delete', 'Sil') });
          li.appendChild(del); ul.appendChild(li);
        });
        box.appendChild(ul);
      }
      var form = document.createElement('form'); form.className = 'bt-desk-save'; form.setAttribute('data-desk-form', '1'); form.noValidate = true;
      var inp = document.createElement('input'); inp.type = 'text'; inp.className = 'bt-input'; inp.maxLength = MAX_NAME; inp.setAttribute('data-desk-name', '1');
      inp.placeholder = t('backtest.win.name_ph', 'Düzen adı'); inp.setAttribute('aria-label', t('backtest.win.name_ph', 'Düzen adı'));
      form.appendChild(inp);
      var sb = document.createElement('button'); sb.type = 'submit'; sb.className = 'bt-pop-btn bt-desk-savebtn'; sb.textContent = t('backtest.win.save', 'Kaydet'); form.appendChild(sb);
      box.appendChild(form);
      var hint = document.createElement('p'); hint.className = 'bt-hint';
      hint.textContent = opts.pro() ? t('backtest.win.saved_pro', 'Düzenler bu tarayıcıda, hesabına özel saklanır.')
        : t('backtest.win.saved_free', 'Ücretsiz planda 1 kayıtlı düzen; daha fazlası Premium\'da. Düzenler bu tarayıcıda saklanır.');
      box.appendChild(hint);
      box.appendChild(sep());
      var rs = btn('bt-pop-btn', 'reset', t('backtest.win.reset', 'Düzeni sıfırla')); box.appendChild(rs);
      var p = document.createElement('p'); p.className = 'bt-hint';
      p.textContent = opts.wide() ? t('backtest.win.hint', 'Başlıktan sürükle; kenara bırakınca yarım, üste bırakınca tam ekran, köşeye bırakınca çeyrek olur. Kenarlardan boyutlandır.')
        : t('backtest.win.narrow', 'Dar ekranda pencereler alt alta dizilir; taşıma geniş ekranda.');
      box.appendChild(p);
    }
    function sep() { var s = document.createElement('div'); s.className = 'bt-pop-sep'; return s; }
    function onMenu(e, box) {
      var b = e.target.closest && e.target.closest('[data-desk-act]'); if (!b || !box.contains(b)) return false;
      var a = b.getAttribute('data-desk-act'), d = size();
      if (a === 'preset') {
        var id = b.getAttribute('data-preset'), pr = PRESETS[id];
        if (pr.pro && !opts.pro()) { opts.upgrade(); return true; }
        lay = applyPreset(lay, id, d); opts.setCharts(pr.charts); changed('preset');
      } else if (a === 'load') {
        var r = loadNamed(lay, b.getAttribute('data-name')); if (!r) return true;
        lay = r.layout; if (!opts.setCharts(r.charts)) opts.setCharts('1'); changed('load');
      } else if (a === 'delete') { lay = deleteNamed(lay, b.getAttribute('data-name')); changed('saved'); }
      else if (a === 'reset') { lay = applyPreset(lay, 'classic', d); opts.setCharts('1'); changed('reset'); opts.toast(t('backtest.win.reset_done', 'Düzen sıfırlandı'), 'success'); }
      renderMenu(box);
      return true;
    }
    function onMenuSubmit(e, box) {
      if (!e.target.closest || !e.target.closest('[data-desk-form]')) return;
      e.preventDefault();
      var inp = box.querySelector('[data-desk-name]'), r = saveNamed(lay, inp.value, opts.charts(), opts.pro());
      if (!r.ok) {
        if (r.error === 'LIMIT') { opts.toast(t('backtest.win.limit', 'Ücretsiz planda 1 kayıtlı düzen olabilir. Aynı adla kaydedersen üzerine yazılır.'), 'warning'); opts.upgrade(); }
        else if (r.error === 'MAX') opts.toast(t('backtest.win.max', 'En fazla {n} kayıtlı düzen olabilir.', { n: MAX_SAVED }), 'warning');
        else { inp.setAttribute('aria-invalid', 'true'); try { inp.focus(); } catch (x) { /* ignore */ } }
        return;
      }
      lay = r.layout; flush(); opts.toast(t('backtest.win.saved', 'Düzen kaydedildi'), 'success'); renderMenu(box);
    }
    function onMenuChange(e) {
      var id = e.target.getAttribute && e.target.getAttribute('data-win-toggle'); if (!id) return false;
      lay = e.target.checked ? open(lay, id) : close(lay, id); changed('visibility');
      return true;
    }

    PAGE.on(desk, 'pointerdown', onDown, true);
    PAGE.on(document, 'pointermove', onMove);
    PAGE.on(document, 'pointerup', onUp);
    PAGE.on(document, 'pointercancel', onUp);
    PAGE.on(desk, 'keydown', onKey);
    PAGE.on(desk, 'click', onClick);
    PAGE.on(desk, 'dblclick', onDbl);
    var resizeT = 0;
    PAGE.on(global, 'resize', function () { clearTimeout(resizeT); resizeT = setTimeout(apply, 60); });
    apply();

    return {
      layout: function () { return lay; },
      apply: apply,
      kind: function () { return kind; },
      // open a window and bring it to the front (also restores a minimized one); in the fixed layouts it just has to exist
      show: function (id) { if (!lay.wins[id]) return; lay = open(lay, id); changed('open'); },
      isOpen: function (id) { return !!winEl[id] && !winEl[id].hidden; },
      state: function (id) { return lay.wins[id] ? (lay.wins[id].closed ? 'closed' : lay.wins[id].st) : null; },
      act: act,
      renderMenu: renderMenu, onMenu: onMenu, onMenuSubmit: onMenuSubmit, onMenuChange: onMenuChange,
      // the chart windows of a new chart layout share the area of the chart windows shown so far
      tileCharts: function (layoutId) {
        if (!lay.wins.chart) return;
        var d = size(), n = (GRID[layoutId] || GRID['1']).slots.length, cur = CHARTS.filter(function (id, i) { return i === 0 || present(id); }).map(function (id) { return toPx(lay.wins[id], d); });
        var area = tileArea(layoutId, bbox(cur), d), rs = tile(layoutId, area);
        for (var i = 0; i < n; i++) lay = setWin(lay, CHARTS[i], Object.assign(toFrac(fit(rs[i], d, CHARTS[i]), d), { st: 'normal', closed: false, prev: undefined }));
        changed('tile');
      },
      multi: function (id) { return multiOf(lay, id); },
      setMulti: function (id, m) { lay.multi[id] = normalizeMulti(id, m); persist(); },
      widgets: function () { return lay.widgets; },
      setWidgets: function (w) { lay.widgets = w; persist(); },
      flush: flush,
      destroy: function () { flush(); }
    };
  }

  global.WwBtDesk = {
    VERSION: VERSION, KEY: KEY, WINS: WINS, CHARTS: CHARTS, CLOSABLE: CLOSABLE, FREE_ONLY: FREE_ONLY, NO_MAX: NO_MAX, DRAW_W: DRAW_W, MIN: MIN, STACK: STACK, SIMPLE: SIMPLE, PRESETS: PRESETS, PRESET_IDS: PRESET_IDS,
    GAP: GAP, EDGE: EDGE, CORNER: CORNER, MAGNET: MAGNET, TASKBAR: TASKBAR, MAX_SAVED: MAX_SAVED, GRID: GRID, MULTI_IDS: MULTI_IDS,
    toPx: toPx, toFrac: toFrac, fit: fit, inset: inset, snapZone: snapZone, zoneRect: zoneRect, magnetMove: magnetMove, magnetResize: magnetResize,
    resizeBy: resizeBy, tile: tile, tileArea: tileArea, carveDraw: carveDraw, bbox: bbox, fromPreset: fromPreset, defaults: defaults, normalize: normalize, front: front, maximize: maximize,
    restore: restore, minimize: minimize, close: close, open: open, snapTo: snapTo, applyPreset: applyPreset, saveNamed: saveNamed, loadNamed: loadNamed,
    deleteNamed: deleteNamed, visibleWins: visibleWins, multiDefault: multiDefault, normalizeMulti: normalizeMulti, multiOf: multiOf, swapViews: swapViews,
    cellArea: cellArea, template: template, resizeTracks: resizeTracks, storageKey: storageKey, load: load, save: save, mount: mount
  };
})(typeof window !== 'undefined' ? window : globalThis);
