// Backtest v2: drawing tools (window.WwBtDraw), rendered with the Lightweight Charts plugin system (series primitives, v4.1).
// A drawing is stored with TIME (UTC seconds) and PRICE coordinates, never with bar indexes, so it stays on the same spot when
// the timeframe changes, when history is prepended and while the replay reveals new candles. Times map to the chart through the
// revealed candles only (beyond the last one by extrapolating the bar length), so nothing ever reads a future candle; the magnet
// snaps to revealed candles only.
// Free plan: trend line, horizontal line and rectangle, kept for the browser session. Premium: every tool, saved to the account
// (public.backtest_drawings: points + style jsonb; the style keeps color, lock, text, width, dash, fill, opacity, fib levels and
// text size). Undo/redo works on committed changes (create, move, resize, settings, delete, clear). The pure helpers at the top
// are unit tested.
(function (global) {
  'use strict';

  var TOOLS = ['trend', 'hline', 'ray', 'rect', 'fib', 'long', 'short', 'text', 'measure'];
  var FREE_TOOLS = ['trend', 'hline', 'rect'];
  var NPTS = { trend: 2, hline: 1, ray: 2, rect: 2, fib: 2, long: 3, short: 3, text: 1, measure: 2 };
  var ICONS = { trend: 'trending-up', hline: 'minus', ray: 'move-up-right', rect: 'rectangle-horizontal', fib: 'align-vertical-space-around',
    long: 'arrow-up-from-line', short: 'arrow-down-from-line', text: 'type', measure: 'ruler' };
  var FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  var COLORS = { trend: '#8b5cf6', hline: '#f59e0b', ray: '#38bdf8', rect: '#8b5cf6', fib: '#a78bfa', long: '#22c55e', short: '#ef4444', text: null, measure: '#38bdf8' };
  var SWATCHES = ['#8b5cf6', '#38bdf8', '#22c55e', '#f59e0b', '#ef4444', '#f472b6', '#e8e8f0', '#64748b'];
  var DASHES = ['solid', 'dashed', 'dotted'];
  var AREA = { rect: true, fib: true, long: true, short: true, measure: true };              // tools with a fill
  var DEF_OPACITY = { rect: 0.14, fib: 0.1, long: 0.16, short: 0.16, measure: 0.15 };
  var TEXT_SIZES = [11, 13, 16, 20, 24, 32];
  var MAX_TEXT = 200, MAX_DRAWINGS = 500, MAX_LEVELS = 12, MAX_HISTORY = 100;
  var HIT_PX = 7, HANDLE_R = 5, HANDLE_HIT = 9, TOUCH_HIT = 16;
  var RECT_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  var CURSORS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

  function num(v) { var n = Number(v); return isFinite(n) ? n : NaN; }
  function clone(d) { return JSON.parse(JSON.stringify(d)); }
  function isColor(v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v); }

  // ---------------------------------------------------------------- time <-> logical index (pure)
  // bars: ascending [{ time }]; tfSec: bar length in seconds. Fractional logical inside a bar / a gap, extrapolated outside.
  function timeToLogical(bars, tfSec, t) {
    var n = bars.length; if (!n) return NaN;
    var first = bars[0].time, last = bars[n - 1].time;
    if (t <= first) return (t - first) / tfSec;
    if (t >= last) return n - 1 + (t - last) / tfSec;
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (bars[mid].time <= t) lo = mid; else hi = mid; }
    var a = bars[lo].time, b = bars[hi].time;
    // inside a bar: proportional to the bar length; in a gap (weekend, closed market) the rest of the slot spreads the gap
    var inBar = Math.min(t - a, tfSec);
    var frac = b - a <= tfSec ? (t - a) / (b - a) : (inBar < tfSec ? inBar / tfSec * 0.5 : 0.5 + 0.5 * (t - a - tfSec) / (b - a - tfSec));
    return lo + frac;
  }
  function logicalToTime(bars, tfSec, l) {
    var n = bars.length; if (!n) return NaN;
    if (l <= 0) return bars[0].time + l * tfSec;
    if (l >= n - 1) return bars[n - 1].time + (l - (n - 1)) * tfSec;
    var i = Math.floor(l), f = l - i, a = bars[i].time, b = bars[i + 1].time;
    if (b - a <= tfSec) return a + f * (b - a);
    return f < 0.5 ? a + f / 0.5 * tfSec : a + tfSec + (f - 0.5) / 0.5 * (b - a - tfSec);
  }
  // magnet: the closest open/high/low/close of the revealed bar under the pointer (time = that bar's time)
  function magnet(bars, logical, price) {
    if (!bars.length) return null;
    var i = Math.max(0, Math.min(bars.length - 1, Math.round(logical))), b = bars[i], best = b.close;
    [b.open, b.high, b.low].forEach(function (v) { if (Math.abs(v - price) < Math.abs(best - price)) best = v; });
    return { t: b.time, p: best };
  }

  // ---------------------------------------------------------------- model (pure)
  // { id, tool, pts: [{ t, p }], color (#rrggbb | null = theme), text, locked, width (1-4), dash, fill, opacity, levels, size }
  // Style fields at their default are left out (old rows and new defaults look the same).
  function cleanLevels(list) {
    if (!Array.isArray(list)) return null;
    var seen = {}, out = [];
    list.forEach(function (v) {
      var x = typeof v === 'string' && !v.trim() ? NaN : num(v);
      if (!isFinite(x) || x < -5 || x > 10) return;
      x = Math.round(x * 10000) / 10000;
      if (!seen[x]) { seen[x] = true; out.push(x); }
    });
    out.sort(function (a, b) { return a - b; });
    return out.length && out.length <= MAX_LEVELS ? out : null;
  }
  // "0, 0.5, 0.618; 1" -> [0, 0.5, 0.618, 1] (null when nothing valid or too many)
  function parseLevels(s) {
    var parts = String(s || '').split(/[;,\s]+/).filter(Boolean).map(function (x) { return x.replace(/%$/, ''); });
    if (!parts.length || parts.length > MAX_LEVELS) return null;
    return cleanLevels(parts);
  }
  function sanitize(d) {
    if (!d || typeof d !== 'object' || TOOLS.indexOf(d.tool) < 0 || typeof d.id !== 'string' || !Array.isArray(d.pts)) return null;
    var pts = d.pts.slice(0, NPTS[d.tool]).map(function (x) { return { t: num(x && x.t), p: num(x && x.p) }; });
    if (pts.length !== NPTS[d.tool] || pts.some(function (x) { return !isFinite(x.t) || !isFinite(x.p); })) return null;
    var out = { id: d.id, tool: d.tool, pts: pts, color: isColor(d.color) ? d.color.toLowerCase() : null, locked: d.locked === true };
    if (d.tool === 'text') {
      out.text = String(d.text || '').slice(0, MAX_TEXT); if (!out.text.trim()) return null;
      var sz = Math.round(num(d.size)); if (TEXT_SIZES.indexOf(sz) >= 0 && sz !== 13) out.size = sz;
    } else {
      var w = num(d.width); if (w >= 1 && w <= 4 && Math.round(w) === w && w !== defWidth(d.tool)) out.width = w;
      if (DASHES.indexOf(d.dash) > 0) out.dash = d.dash;
    }
    if (AREA[d.tool]) {
      if (d.fill === false) out.fill = false;
      var op = num(d.opacity); if (op >= 0 && op <= 1) { op = Math.round(op * 100) / 100; if (op !== DEF_OPACITY[d.tool]) out.opacity = op; }
    }
    if (d.tool === 'fib' && d.levels != null) { var lv = cleanLevels(d.levels); if (lv && lv.join() !== FIB_LEVELS.join()) out.levels = lv; }
    return out;
  }
  var STYLE_KEYS = ['width', 'dash', 'fill', 'opacity', 'levels', 'size'];
  function toRow(d, userId, accountId) {
    var style = { color: d.color || null, locked: !!d.locked };
    if (d.tool === 'text') style.text = d.text;
    STYLE_KEYS.forEach(function (k) { if (d[k] !== undefined) style[k] = d[k]; });
    return { id: d.id, user_id: userId, backtest_account_id: accountId, tool: d.tool, points: d.pts.map(function (x) { return { t: x.t, p: x.p }; }), style: style };
  }
  function fromRow(r) {
    var st = r && r.style && typeof r.style === 'object' ? r.style : {};
    var d = { id: r && r.id, tool: r && r.tool, pts: r && r.points, color: st.color, text: st.text, locked: st.locked };
    STYLE_KEYS.forEach(function (k) { if (st[k] !== undefined) d[k] = st[k]; });
    return sanitize(d);
  }
  function defWidth(tool) { return tool === 'fib' || tool === 'measure' ? 1 : 2; }
  function widthOf(d) { return d.width || defWidth(d.tool); }
  function fillOf(d) { return AREA[d.tool] ? (d.fill === false ? 0 : (d.opacity != null ? d.opacity : DEF_OPACITY[d.tool])) : 0; }
  // fib levels from the first point (level 1) to the second point (level 0)
  function fibLevels(d) {
    var a = d.pts[0].p, b = d.pts[1].p;
    return (d.levels || FIB_LEVELS).map(function (lv) { return { level: lv, price: b + (a - b) * lv }; });
  }
  // long / short position tool: pts[0] = entry (start time, entry price), pts[1] = target (end time), pts[2] = stop (end time)
  function newPosition(tool, t, p, unit, tfSec) {
    var dir = tool === 'long' ? 1 : -1, end = t + 20 * tfSec;
    return [{ t: t, p: p }, { t: end, p: p + dir * 2 * unit }, { t: end, p: p - dir * unit }];
  }
  function positionStats(d) {
    var e = d.pts[0].p, tg = d.pts[1].p, sl = d.pts[2].p, risk = Math.abs(e - sl), reward = Math.abs(tg - e);
    return { reward: reward, risk: risk, rr: risk > 0 ? reward / risk : null, targetPct: e ? (tg - e) / e * 100 : 0, stopPct: e ? (sl - e) / e * 100 : 0 };
  }
  function measureStats(d, bars, tfSec) {
    var a = d.pts[0], b = d.pts[1], la = timeToLogical(bars, tfSec, a.t), lb = timeToLogical(bars, tfSec, b.t);
    return { dp: b.p - a.p, pct: a.p ? (b.p - a.p) / a.p * 100 : 0, bars: Math.round(Math.abs(lb - la)), seconds: Math.abs(b.t - a.t) };
  }
  // move every point by `dl` logical bars and `dp` price (in logical space, so a drag across a weekend keeps the shape)
  function moveBy(d, bars, tfSec, dl, dp) {
    var out = clone(d);
    out.pts = d.pts.map(function (x) { return { t: logicalToTime(bars, tfSec, timeToLogical(bars, tfSec, x.t) + dl), p: x.p + dp }; });
    return out;
  }
  // rectangle edge/corner handle ('nw', 'n', ..., 'w'): sets the time of the left/right edge and the price of the top/bottom edge;
  // dragging past the opposite edge flips the box (the other point keeps its values)
  function resizeRect(d, h, t, p) {
    var out = clone(d), P = out.pts, L = P[0].t <= P[1].t ? 0 : 1, T = P[0].p >= P[1].p ? 0 : 1;
    if (h.indexOf('w') >= 0) P[L].t = t;
    if (h.indexOf('e') >= 0) P[1 - L].t = t;
    if (h.indexOf('n') >= 0) P[T].p = p;
    if (h.indexOf('s') >= 0) P[1 - T].p = p;
    return out;
  }
  // drag one handle. Position tools keep the target on the profit side and the stop on the loss side.
  function setHandle(d, idx, t, p, tfSec) {
    if (typeof idx === 'string') return resizeRect(d, idx, t, p);
    var out = clone(d), P = out.pts;
    if (d.tool === 'hline') { P[0] = { t: t, p: p }; return out; }
    if (d.tool === 'long' || d.tool === 'short') {
      var dir = d.tool === 'long' ? 1 : -1, e = P[0].p, eps = Math.abs(e) * 1e-6 || 1e-9;
      if (idx === 0) { var de = p - e; P[0] = { t: Math.min(t, P[1].t - tfSec), p: p }; P[1].p += de; P[2].p += de; }
      else if (idx === 1) P[1].p = dir > 0 ? Math.max(p, e + eps) : Math.min(p, e - eps);
      else if (idx === 2) P[2].p = dir > 0 ? Math.min(p, e - eps) : Math.max(p, e + eps);
      else if (idx === 3) { var end = Math.max(t, P[0].t + tfSec); P[1].t = end; P[2].t = end; }
      return out;
    }
    if (P[idx]) P[idx] = { t: t, p: p };
    return out;
  }

  // ---------------------------------------------------------------- geometry (pure, media pixels)
  function distSeg(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy, u = L ? ((px - x1) * dx + (py - y1) * dy) / L : 0;
    u = Math.max(0, Math.min(1, u));
    var x = x1 + u * dx, y = y1 + u * dy; return Math.sqrt((px - x) * (px - x) + (py - y) * (py - y));
  }
  // the ray from (x1,y1) through (x2,y2) to the pane edge
  function rayEnd(x1, y1, x2, y2, w, h) {
    var dx = x2 - x1, dy = y2 - y1;
    if (!dx && !dy) return { x: x2, y: y2 };
    var ts = [];
    if (dx > 0) ts.push((w - x1) / dx); else if (dx < 0) ts.push(-x1 / dx);
    if (dy > 0) ts.push((h - y1) / dy); else if (dy < 0) ts.push(-y1 / dy);
    var tt = Math.max(1, Math.min.apply(null, ts.filter(function (v) { return v >= 0; }).concat([1e6])));
    return { x: x1 + dx * tt, y: y1 + dy * tt };
  }
  function inBox(px, py, x1, y1, x2, y2, pad) {
    pad = pad || 0;
    return px >= Math.min(x1, x2) - pad && px <= Math.max(x1, x2) + pad && py >= Math.min(y1, y2) - pad && py <= Math.max(y1, y2) + pad;
  }
  // Shift on a line: the end snaps to the closest multiple of 45° around the anchor. Horizontal and vertical keep the pointer's
  // x (or y); a diagonal takes the pointer's projection. kind: 'h' | 'v' | 'd' (the caller copies the anchor's price / time exactly).
  function lockAngle(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    if (!dx && !dy) return { x: x2, y: y2, kind: 'h' };
    var k = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
    if (k === 0 || k === 4) return { x: x2, y: y1, kind: 'h' };
    if (k === 2 || k === 6) return { x: x1, y: y2, kind: 'v' };
    var c = k === 1 || k === 7 ? Math.SQRT1_2 : -Math.SQRT1_2, s = k === 1 || k === 3 ? Math.SQRT1_2 : -Math.SQRT1_2, L = dx * c + dy * s;
    return { x: x1 + c * L, y: y1 + s * L, kind: 'd' };
  }
  // Shift on a box: a square on screen (the larger side wins), growing from the anchor towards the pointer
  function squareBox(ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, s = Math.max(Math.abs(dx), Math.abs(dy));
    return { x: ax + (dx < 0 ? -s : s), y: ay + (dy < 0 ? -s : s) };
  }
  // the eight handles of a box on screen: corners and edge middles
  function rectHandles(xa, ya, xb, yb) {
    var l = Math.min(xa, xb), r = Math.max(xa, xb), t = Math.min(ya, yb), b = Math.max(ya, yb), cx = (l + r) / 2, cy = (t + b) / 2;
    var at = { nw: [l, t], n: [cx, t], ne: [r, t], e: [r, cy], se: [r, b], s: [cx, b], sw: [l, b], w: [l, cy] };
    return RECT_HANDLES.map(function (h) { return { i: h, x: at[h][0], y: at[h][1] }; });
  }
  function oppositeCorner(h, xa, ya, xb, yb) {
    var l = Math.min(xa, xb), r = Math.max(xa, xb), t = Math.min(ya, yb), b = Math.max(ya, yb);
    return { x: h.indexOf('w') >= 0 ? r : l, y: h.indexOf('n') >= 0 ? b : t };
  }
  function withAlpha(c, a) {
    var m = /^#([0-9a-f]{6})$/i.exec(c || ''); if (!m) return c;
    return 'rgba(' + parseInt(m[1].slice(0, 2), 16) + ',' + parseInt(m[1].slice(2, 4), 16) + ',' + parseInt(m[1].slice(4, 6), 16) + ',' + a + ')';
  }
  function dashOf(d, w) { return d.dash === 'dashed' ? [6 + w * 2, 4 + w] : d.dash === 'dotted' ? [Math.max(1, w), 3 + w * 1.5] : []; }

  // ---------------------------------------------------------------- shared drawing set (all charts of the account)
  function createSet() {
    var items = [], sel = null, subs = [], hidden = false, lockAll = false;
    function emit(kind, d, at) { subs.forEach(function (f) { try { f(kind, d, at); } catch (e) { /* a listener must not break the others */ } }); }
    function idx(id) { for (var i = 0; i < items.length; i++) if (items[i].id === id) return i; return -1; }
    return {
      list: function () { return items; },
      get: function (id) { var i = idx(id); return i < 0 ? null : items[i]; },
      reset: function (list) { items = (list || []).map(sanitize).filter(Boolean); sel = null; emit('reset'); },
      // `at`: position in the stacking order (undo of a delete puts the drawing back where it was)
      add: function (d, at) {
        d = sanitize(d); if (!d || idx(d.id) >= 0) return null;
        var i = at >= 0 && at < items.length ? at : items.length; items.splice(i, 0, d); emit('add', d, i); return d;
      },
      // transient: redraw only (dragging); a final put() without transient persists
      put: function (d, transient) { var i = idx(d.id); d = sanitize(d); if (i < 0 || !d) return null; items[i] = d; emit(transient ? 'drag' : 'update', d, i); return d; },
      remove: function (id) { var i = idx(id); if (i < 0) return; var d = items.splice(i, 1)[0]; if (sel === id) sel = null; emit('remove', d, i); },
      clear: function () { var old = items; items = []; sel = null; emit('clear', old); },
      selected: function () { return sel; },
      select: function (id) { if (sel === id) return; sel = id; emit('select'); },
      hidden: function () { return hidden; },
      setHidden: function (v) { hidden = !!v; if (hidden) sel = null; emit('view'); },
      lockAll: function () { return lockAll; },
      setLockAll: function (v) { lockAll = !!v; emit('view'); },
      on: function (f) { subs.push(f); return function () { subs = subs.filter(function (x) { return x !== f; }); }; },
      redraw: function () { emit('view'); }
    };
  }

  // ---------------------------------------------------------------- chart layer (browser)
  // opts: { chart, series, el (the chart element), bars() (revealed candles in prices), tfSec(), set, ctl (controller below),
  //         fmt(price) -> text, t(key, fb, params), quote(diff, price) -> { dist, money } | null (position tool labels) }
  function createLayer(opts) {
    var chart = opts.chart, series = opts.series, el = opts.el, set = opts.set, ctl = opts.ctl;
    var api = null, create = null, drag = null, editor = null, boxes = {}, unsub = null, interactive = true, saved = null, last = null;
    function css(name, fb) { var v = getComputedStyle(document.body).getPropertyValue(name).trim(); return v || fb; }
    function light() { return document.body.classList.contains('light-theme'); }
    function textColor() { return light() ? '#0f172a' : '#e8e8f0'; }
    function colorOf(d) { return d.color || COLORS[d.tool] || textColor(); }

    function mapper() {
      var ts = chart.timeScale(), bars = opts.bars(), tf = opts.tfSec();
      if (!bars.length) return null;
      var x0 = ts.logicalToCoordinate(0), x1 = ts.logicalToCoordinate(1);
      if (x0 === null || x1 === null || x1 === x0) return null;
      var sp = x1 - x0;
      return {
        bars: bars, tf: tf, sp: sp,
        x: function (t) { return x0 + timeToLogical(bars, tf, t) * sp; },
        l: function (x) { return (x - x0) / sp; },
        t: function (x) { return logicalToTime(bars, tf, (x - x0) / sp); },
        y: function (p) { var y = series.priceToCoordinate(p); return y === null ? NaN : y; },
        p: function (y) { var p = series.coordinateToPrice(y); return p === null ? NaN : p; },
        w: ts.width(), h: el.clientHeight - ts.height()
      };
    }

    // --- drawing
    function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    // `maxX`: keep a centered label inside the pane (it would be cut by the price axis)
    function label(ctx, text, x, y, color, align, bg, maxX) {
      ctx.font = '600 11.5px "Geist", system-ui, sans-serif'; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
      var tw = ctx.measureText(text).width;
      if (align === 'center' && maxX) x = Math.max(tw / 2 + 7, Math.min(maxX - tw / 2 - 7, x));
      if (bg) {
        var w = tw + 10, bx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x - 5;
        ctx.fillStyle = bg; ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, y - 9, w, 18, 4); else ctx.rect(bx, y - 9, w, 18);
        ctx.fill();
      }
      ctx.fillStyle = color; ctx.fillText(text, x, y);
    }
    function handlesOf(d, m) {
      var P = d.pts, xs = P.map(function (q) { return m.x(q.t); }), ys = P.map(function (q) { return m.y(q.p); });
      if (d.tool === 'hline') return [{ i: 0, x: Math.max(24, Math.min(m.w - 24, xs[0])), y: ys[0] }];
      if (d.tool === 'text') return [];
      if (d.tool === 'rect') return rectHandles(xs[0], ys[0], xs[1], ys[1]);
      if (d.tool === 'long' || d.tool === 'short') return [{ i: 0, x: xs[0], y: ys[0] }, { i: 1, x: xs[1], y: ys[1] }, { i: 2, x: xs[2], y: ys[2] }, { i: 3, x: xs[1], y: ys[0] }];
      return P.map(function (q, i) { return { i: i, x: xs[i], y: ys[i] }; });
    }
    function pipText(diff, price) {
      var q = opts.quote ? opts.quote(diff, price) : null;
      return q ? ' · ' + q.dist + ' · ' + q.money : '';
    }
    function drawOne(ctx, d, m, selected) {
      var c = colorOf(d), P = d.pts, x = P.map(function (q) { return m.x(q.t); }), y = P.map(function (q) { return m.y(q.p); });
      if (y.some(isNaN) || x.some(isNaN)) return;
      var w = widthOf(d), fa = fillOf(d), cc = c.charAt(0) === '#' ? c : '#8b5cf6';
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = d.dash === 'dotted' ? 'round' : 'butt'; ctx.setLineDash(dashOf(d, w));
      var b = null;
      switch (d.tool) {
        case 'trend': line(ctx, x[0], y[0], x[1], y[1]); break;
        case 'ray': var e = rayEnd(x[0], y[0], x[1], y[1], m.w, m.h); line(ctx, x[0], y[0], e.x, e.y); break;
        case 'hline': line(ctx, 0, y[0], m.w, y[0]); break;
        case 'rect':
          if (fa) { ctx.fillStyle = withAlpha(cc, fa); ctx.fillRect(Math.min(x[0], x[1]), Math.min(y[0], y[1]), Math.abs(x[1] - x[0]), Math.abs(y[1] - y[0])); }
          ctx.strokeRect(Math.min(x[0], x[1]), Math.min(y[0], y[1]), Math.abs(x[1] - x[0]), Math.abs(y[1] - y[0])); break;
        case 'fib':
          var xl = Math.min(x[0], x[1]), xr = Math.max(x[0], x[1]), lvs = fibLevels(d), lo = Math.min.apply(null, d.levels || FIB_LEVELS), hi = Math.max.apply(null, d.levels || FIB_LEVELS);
          lvs.forEach(function (lv, k) {
            var yy = m.y(lv.price); if (isNaN(yy)) return;
            if (k > 0 && fa) { var yp = m.y(lvs[k - 1].price); ctx.fillStyle = withAlpha(cc, k % 2 ? fa * 0.7 : fa * 1.2); ctx.fillRect(xl, Math.min(yy, yp), xr - xl, Math.abs(yy - yp)); }
            ctx.lineWidth = lv.level === lo || lv.level === hi ? w + 0.5 : w; line(ctx, xl, yy, xr, yy);
            label(ctx, lv.level + ' · ' + opts.fmt(lv.price), xl + 4, yy - 8, c, 'left');
          });
          ctx.setLineDash([4, 4]); ctx.lineWidth = 1; line(ctx, x[0], y[0], x[1], y[1]); ctx.setLineDash([]);
          break;
        case 'long': case 'short':
          var up = d.tool === 'long', xa = x[0], xb = x[1], ye = y[0], yt = y[1], ys = y[2], st = positionStats(d), dir = up ? 1 : -1;
          var G = css('--green', '#22c55e'), Rr = css('--red', '#ef4444'), pa = fa || 0;
          if (pa) {
            ctx.fillStyle = withAlpha(G.charAt(0) === '#' ? G : '#22c55e', pa); ctx.fillRect(Math.min(xa, xb), Math.min(ye, yt), Math.abs(xb - xa), Math.abs(yt - ye));
            ctx.fillStyle = withAlpha(Rr.charAt(0) === '#' ? Rr : '#ef4444', pa); ctx.fillRect(Math.min(xa, xb), Math.min(ye, ys), Math.abs(xb - xa), Math.abs(ys - ye));
          }
          ctx.strokeStyle = textColor(); ctx.lineWidth = 1; ctx.setLineDash([]); line(ctx, xa, ye, xb, ye);
          var mid = (xa + xb) / 2;
          label(ctx, opts.t('backtest.draw.target', 'Hedef') + ' ' + opts.fmt(P[1].p) + ' (' + (st.targetPct >= 0 ? '+' : '') + st.targetPct.toFixed(2) + '%)' + pipText(dir * (P[1].p - P[0].p), P[1].p),
            mid, yt + (up ? -12 : 12), '#fff', 'center', '#16a34a', m.w);
          label(ctx, opts.t('backtest.draw.stop', 'Stop') + ' ' + opts.fmt(P[2].p) + ' (' + (st.stopPct >= 0 ? '+' : '') + st.stopPct.toFixed(2) + '%)' + pipText(dir * (P[2].p - P[0].p), P[2].p),
            mid, ys + (up ? 12 : -12), '#fff', 'center', '#dc2626', m.w);
          var lot = opts.quote ? opts.quote(0, P[0].p) : null;
          label(ctx, 'R:R ' + (st.rr == null ? '—' : st.rr.toFixed(2)) + (lot && lot.lot ? ' · ' + lot.lot : ''), mid, ye, textColor(), 'center', light() ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.7)', m.w);
          break;
        case 'text':
          if (editor && editor.id === d.id) break;              // edited in place: the input shows it
          var fs = d.size || 13;
          ctx.font = '600 ' + fs + 'px "Geist", system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          var tw = ctx.measureText(d.text).width; ctx.fillStyle = c; ctx.fillText(d.text, x[0], y[0]);
          b = { x1: x[0] - 3, y1: y[0] - fs * 0.75, x2: x[0] + tw + 3, y2: y[0] + fs * 0.75 };
          if (selected) { ctx.strokeStyle = withAlpha(cc, 0.6); ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.strokeRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1); }
          break;
        case 'measure':
          var ms = measureStats(d, m.bars, m.tf), upM = ms.dp >= 0, mc = upM ? '#38bdf8' : '#f472b6';
          if (fa) { ctx.fillStyle = withAlpha(mc, fa); ctx.fillRect(Math.min(x[0], x[1]), Math.min(y[0], y[1]), Math.abs(x[1] - x[0]), Math.abs(y[1] - y[0])); }
          ctx.strokeStyle = mc; ctx.lineWidth = w; line(ctx, x[0], y[0], x[1], y[1]);
          var txt = (ms.dp >= 0 ? '+' : '−') + opts.fmt(Math.abs(ms.dp)) + ' (' + (ms.pct >= 0 ? '+' : '') + ms.pct.toFixed(2) + '%) · ' +
            opts.t('backtest.draw.bars', '{n} mum', { n: ms.bars }) + ' · ' + duration(ms.seconds);
          label(ctx, txt, (x[0] + x[1]) / 2, Math.min(y[0], y[1]) - 14, '#fff', 'center', mc, m.w);
          break;
      }
      if (b) boxes[d.id] = b;
      if (selected) {
        ctx.setLineDash([]);
        handlesOf(d, m).forEach(function (h) {
          ctx.beginPath();
          if (typeof h.i === 'string') ctx.rect(h.x - HANDLE_R + 0.5, h.y - HANDLE_R + 0.5, HANDLE_R * 2 - 1, HANDLE_R * 2 - 1); else ctx.arc(h.x, h.y, HANDLE_R, 0, Math.PI * 2);
          ctx.fillStyle = light() ? '#ffffff' : '#000000'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = c; ctx.stroke();
        });
      }
    }
    function duration(sec) {
      var d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), mi = Math.round((sec % 3600) / 60);
      return (d ? opts.t('backtest.draw.days', '{n}g', { n: d }) + ' ' : '') + (h || d ? opts.t('backtest.draw.hours', '{n}s', { n: h }) + ' ' : '') + opts.t('backtest.draw.minutes', '{n}dk', { n: mi });
    }
    var renderer = {
      draw: function (target) {
        var m = mapper(); if (!m) return;
        target.useMediaCoordinateSpace(function (scope) {
          var ctx = scope.context; boxes = {};
          ctx.save();
          if (!set.hidden()) set.list().forEach(function (d) { drawOne(ctx, d, m, d.id === set.selected()); });
          if (create) drawOne(ctx, create.d, m, true);
          ctx.restore();
        });
      }
    };
    var paneView = { renderer: function () { return renderer; }, zOrder: function () { return 'top'; } };
    // price axis labels of horizontal lines
    function axisViews() {
      if (set.hidden()) return [];
      return set.list().filter(function (d) { return d.tool === 'hline'; }).map(function (d) {
        var y = isFinite(d.pts[0].p) ? series.priceToCoordinate(d.pts[0].p) : null, c = colorOf(d);
        return { coordinate: function () { return y === null ? -100 : y; }, text: function () { return opts.fmt(d.pts[0].p); },
          textColor: function () { return '#ffffff'; }, backColor: function () { return c; }, visible: function () { return y !== null; }, tickVisible: function () { return true; } };
      });
    }
    var primitive = {
      attached: function (p) { api = p; },
      detached: function () { api = null; },
      paneViews: function () { return [paneView]; },
      priceAxisViews: axisViews,
      // drawings never take part in the price scale's auto-scale (a line drawn at another time or price must not stretch the axis)
      autoscaleInfo: function () { return null; },
      updateAllViews: function () {}
    };
    series.attachPrimitive(primitive);
    function refresh() { if (api && api.requestUpdate) api.requestUpdate(); }
    unsub = set.on(function (kind) { if ((kind === 'remove' || kind === 'reset' || kind === 'clear') && editor && editor.id && !set.get(editor.id)) closeEditor(false); refresh(); });

    // --- hit test (media px). touch: larger targets.
    function hitTest(x, y, touch) {
      var m = mapper(); if (!m || set.hidden()) return null;
      var list = set.list(), selId = set.selected(), order = list.slice().reverse(), hr = touch ? TOUCH_HIT : HANDLE_HIT, tol = touch ? 12 : HIT_PX;
      if (selId) order.sort(function (a, b2) { return (b2.id === selId) - (a.id === selId); });
      for (var k = 0; k < order.length; k++) {
        var d = order[k];
        if (d.id === selId) {
          var hs = handlesOf(d, m);
          for (var j = 0; j < hs.length; j++) if (Math.abs(hs[j].x - x) <= hr && Math.abs(hs[j].y - y) <= hr) return { id: d.id, handle: hs[j].i };
        }
        if (hitBody(d, m, x, y, tol)) return { id: d.id, handle: -1 };
      }
      return null;
    }
    function hitBody(d, m, x, y, tol) {
      var P = d.pts, xs = P.map(function (q) { return m.x(q.t); }), ys = P.map(function (q) { return m.y(q.p); });
      switch (d.tool) {
        case 'trend': return distSeg(x, y, xs[0], ys[0], xs[1], ys[1]) <= tol;
        case 'ray': var e = rayEnd(xs[0], ys[0], xs[1], ys[1], m.w, m.h); return distSeg(x, y, xs[0], ys[0], e.x, e.y) <= tol;
        case 'hline': return Math.abs(y - ys[0]) <= tol;
        case 'rect': case 'fib':
          // a filled box is grabbed anywhere inside; an empty one on its outline
          if (fillOf(d) > 0) return inBox(x, y, xs[0], ys[0], xs[1], ys[1], tol);
          return inBox(x, y, xs[0], ys[0], xs[1], ys[1], tol) && !inBox(x, y, xs[0], ys[0], xs[1], ys[1], -tol);
        case 'measure': return inBox(x, y, xs[0], ys[0], xs[1], ys[1], tol);
        case 'long': case 'short': return inBox(x, y, xs[0], Math.min(ys[1], ys[2]), xs[1], Math.max(ys[1], ys[2]), 3);
        case 'text': var b = boxes[d.id]; return !!b && inBox(x, y, b.x1, b.y1, b.x2, b.y2, 3);
      }
      return false;
    }

    // --- pointer interaction: create (drag, or click-move-click), select, move, resize; Esc / pointercancel undo the gesture
    function local(e) { var r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function inPane(pt, m) { return m && pt.x >= 0 && pt.y >= 0 && pt.x < m.w && pt.y < m.h; }
    function model(pt, m, useMagnet) {
      var t = m.t(pt.x), p = m.p(pt.y);
      if (useMagnet && ctl.magnet()) { var s = magnet(m.bars, m.l(pt.x), p); if (s) return s; }
      return { t: t, p: p };
    }
    // a point with Shift: lines lock to 0/45/90°, boxes become squares (around `anchor`, a model point)
    function constrained(tool, anchor, pt, m, shift) {
      if (shift && (tool === 'trend' || tool === 'ray')) {
        var lk = lockAngle(m.x(anchor.t), m.y(anchor.p), pt.x, pt.y);
        if (lk.kind === 'h') return { t: m.t(lk.x), p: anchor.p };
        if (lk.kind === 'v') return { t: anchor.t, p: m.p(lk.y) };
        return { t: m.t(lk.x), p: m.p(lk.y) };
      }
      if (shift && tool === 'rect') {
        var sq = squareBox(m.x(anchor.t), m.y(anchor.p), pt.x, pt.y);
        return { t: m.t(sq.x), p: m.p(sq.y) };
      }
      return model(pt, m, true);
    }
    function setInteractive(on) {
      if (on === interactive) return;
      interactive = on;
      if (!on) { var o = chart.options(); saved = { handleScroll: o.handleScroll, handleScale: o.handleScale }; chart.applyOptions({ handleScroll: false, handleScale: false }); }
      else if (saved) chart.applyOptions(saved);
    }
    function setCursor(c) {
      if (c) { el.style.setProperty('--bt-draw-cursor', c); el.classList.add('bt-draw-cur'); }
      else el.classList.remove('bt-draw-cur');
    }
    function idleCursor() { setCursor(ctl.tool() !== 'cursor' ? 'crosshair' : ''); }
    function consume(e) { e.preventDefault(); e.stopPropagation(); }
    function capture(e) { try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } }
    function release(pid) { try { if (pid != null && el.hasPointerCapture && el.hasPointerCapture(pid)) el.releasePointerCapture(pid); } catch (x) { /* ignore */ } }
    function finishCreate() {
      var c = create; create = null; refresh();
      if (!c) return;
      release(c.pid);
      ctl.created(c.d);
    }
    function onDown(e) {
      if (editor && e.target === editor.input) return;
      if (editor) closeEditor(true);
      if (e.button !== 0) return;
      var m = mapper(), pt = local(e), touch = e.pointerType === 'touch';
      if (!inPane(pt, m)) return;
      last = { pt: pt, shift: e.shiftKey };
      var tool = ctl.tool();
      if (create && create.wait) { consume(e); create.d.pts[create.d.pts.length - 1] = constrained(create.d.tool, create.d.pts[0], pt, m, e.shiftKey); finishCreate(); return; }
      if (tool !== 'cursor') {
        consume(e);
        if (!ctl.allowed(tool)) { ctl.denied(tool); return; }
        var q = model(pt, m, true), id = ctl.newId();
        if (tool === 'hline') { create = { d: { id: id, tool: tool, pts: [q], color: null } }; finishCreate(); return; }
        if (tool === 'text') { openEditor({ id: null, newId: id, at: q, text: '' }); return; }
        if (tool === 'long' || tool === 'short') {
          var unit = Math.abs(m.p(0) - m.p(m.h)) * 0.06 || Math.abs(q.p) * 0.002;
          create = { d: { id: id, tool: tool, pts: newPosition(tool, q.t, q.p, unit, m.tf), color: null } }; finishCreate(); return;
        }
        create = { d: { id: id, tool: tool, pts: [q, { t: q.t, p: q.p }], color: null }, down: pt, dragging: true, pid: e.pointerId };
        capture(e); refresh(); return;
      }
      if (set.hidden()) return;
      var hit = hitTest(pt.x, pt.y, touch);
      if (!hit) { if (set.selected()) set.select(null); ctl.closePop(); return; }
      consume(e);
      set.select(hit.id);
      var d = set.get(hit.id);
      if (!d || d.locked || set.lockAll()) return;
      setInteractive(false);
      drag = { id: hit.id, handle: hit.handle, start: pt, l0: m.l(pt.x), p0: m.p(pt.y), orig: clone(d), moved: false, pid: e.pointerId };
      capture(e);
      setCursor(typeof hit.handle === 'string' ? CURSORS[hit.handle] : 'grabbing');
    }
    // the gesture in progress follows the pointer (also called when Shift goes down or up without a move)
    function update() {
      var m = mapper(); if (!m || !last) return;
      var pt = last.pt, shift = last.shift;
      if (drag) {
        if (!drag.moved && Math.abs(pt.x - drag.start.x) + Math.abs(pt.y - drag.start.y) < 3) return;
        drag.moved = true;
        var o = drag.orig, h = drag.handle, nd;
        if (typeof h === 'string') {
          if (shift && h.length === 2) {
            var xs = o.pts.map(function (q) { return m.x(q.t); }), ys = o.pts.map(function (q) { return m.y(q.p); });
            var opp = oppositeCorner(h, xs[0], ys[0], xs[1], ys[1]), sq = squareBox(opp.x, opp.y, pt.x, pt.y);
            nd = resizeRect(o, h, m.t(sq.x), m.p(sq.y));
          } else { var qr = model(pt, m, true); nd = resizeRect(o, h, qr.t, qr.p); }
        } else if (h >= 0) {
          var other = o.tool === 'trend' || o.tool === 'ray' ? o.pts[1 - h] : null;
          var q = other ? constrained(o.tool, other, pt, m, shift) : model(pt, m, true);
          nd = setHandle(o, h, q.t, q.p, m.tf);
        } else {
          var dl = m.l(pt.x) - drag.l0, dp = m.p(pt.y) - drag.p0;
          if (shift) { if (Math.abs(pt.x - drag.start.x) >= Math.abs(pt.y - drag.start.y)) dp = 0; else dl = 0; }
          nd = moveBy(o, m.bars, m.tf, dl, dp);
        }
        set.put(nd, true);
        return;
      }
      if (create && (create.dragging || create.wait)) {
        create.d.pts[create.d.pts.length - 1] = constrained(create.d.tool, create.d.pts[0], pt, m, shift); refresh();
      }
    }
    function onMove(e) {
      var m = mapper(); if (!m) return;
      var pt = local(e);
      last = { pt: pt, shift: e.shiftKey };
      if (drag) { consume(e); update(); return; }
      if (create && (create.dragging || create.wait)) { consume(e); update(); return; }
      if (editor) return;
      if (ctl.tool() !== 'cursor') { setCursor(inPane(pt, m) ? 'crosshair' : ''); return; }
      var h = inPane(pt, m) ? hitTest(pt.x, pt.y, e.pointerType === 'touch') : null, d2 = h && set.get(h.id);
      if (!h) return setCursor('');
      if (d2 && (d2.locked || set.lockAll())) return setCursor('pointer');
      setCursor(typeof h.handle === 'string' ? CURSORS[h.handle] : h.handle >= 0 ? 'grab' : 'move');
    }
    function endDrag(commit) {
      var dd = drag; drag = null;
      release(dd.pid);
      setInteractive(ctl.tool() === 'cursor');
      if (!dd.moved) { idleCursor(); return; }
      if (commit) { var cur = set.get(dd.id); if (cur) set.put(cur, false); }
      else set.put(dd.orig, true);                          // back to where it was, nothing saved
      idleCursor();
    }
    function onUp(e) {
      if (drag) { consume(e); last = { pt: local(e), shift: e.shiftKey }; update(); endDrag(true); return; }
      if (create && create.dragging) {
        consume(e);
        var pt = local(e), moved = Math.abs(pt.x - create.down.x) + Math.abs(pt.y - create.down.y) > 4;
        last = { pt: pt, shift: e.shiftKey }; update();
        create.dragging = false; release(create.pid);
        if (moved) finishCreate(); else create.wait = true;     // click, move, click
      }
    }
    // Esc or a cancelled pointer: the gesture is undone (a drawing being created disappears, a dragged one goes back)
    function cancel() {
      var did = false;
      if (create) { release(create.pid); create = null; refresh(); did = true; }
      if (drag) { endDrag(false); did = true; }
      if (editor) { closeEditor(false); did = true; }
      return did;
    }
    function onCancel() { cancel(); }
    function onKey(e) {
      if (e.key !== 'Shift' || !(drag || (create && (create.dragging || create.wait))) || !last) return;
      last.shift = e.type === 'keydown'; update();
    }
    function hitAt(e) {
      var m = mapper(), pt = local(e);
      if (!inPane(pt, m) || set.hidden()) return null;
      return hitTest(pt.x, pt.y, e.pointerType === 'touch');
    }
    // right click: settings of the drawing under the pointer
    function onContext(e) {
      if (create || drag) { consume(e); cancel(); return; }
      var h = hitAt(e); if (!h) return;
      consume(e); set.select(h.id); ctl.openPop(h.id, e.clientX, e.clientY);
    }
    // double click: text -> edit in place, any other drawing -> settings
    function onDbl(e) {
      if (ctl.tool() !== 'cursor' || create) return;
      var h = hitAt(e); if (!h) return;
      consume(e); set.select(h.id);
      var d = set.get(h.id);
      if (d && d.tool === 'text' && !d.locked && !set.lockAll()) editText(d.id);
      else ctl.openPop(h.id, e.clientX, e.clientY);
    }

    // --- text in place: an input over the chart at the text's spot (Enter keeps, Esc drops, leaving the field keeps)
    function openEditor(o) {
      closeEditor(true);
      var m = mapper(); if (!m) return;
      var d = o.id ? set.get(o.id) : null, at = d ? d.pts[0] : o.at, fs = (d && d.size) || 13;
      var inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'bt-draw-edit'; inp.maxLength = MAX_TEXT; inp.value = o.text || '';
      inp.placeholder = opts.t('backtest.draw.text_placeholder', 'Metin yaz, Enter');
      inp.setAttribute('aria-label', opts.t('backtest.draw.text_label', 'Grafiğe yazılacak metin'));
      inp.style.left = Math.round(m.x(at.t) - 4) + 'px'; inp.style.top = Math.round(m.y(at.p) - fs * 0.75 - 4) + 'px';
      inp.style.font = '600 ' + fs + 'px "Geist", system-ui, sans-serif'; inp.style.color = d ? colorOf(d) : textColor();
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      el.appendChild(inp);
      editor = { id: o.id, newId: o.newId, at: at, input: inp };
      setInteractive(false); refresh();
      inp.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); closeEditor(true); }
        else if (e.key === 'Escape') { e.preventDefault(); closeEditor(false); }
      });
      inp.addEventListener('blur', function () { if (editor && editor.input === inp) closeEditor(true); });
      ['pointerdown', 'pointermove', 'pointerup', 'dblclick', 'contextmenu'].forEach(function (k) { inp.addEventListener(k, function (e) { e.stopPropagation(); }); });
      setTimeout(function () { try { inp.focus(); inp.select(); } catch (x) { /* ignore */ } }, 0);
    }
    function closeEditor(keep) {
      var ed = editor; if (!ed) return;
      editor = null;
      var txt = ed.input.value.trim().slice(0, MAX_TEXT);
      if (ed.input.parentNode) ed.input.parentNode.removeChild(ed.input);
      setInteractive(ctl.tool() === 'cursor' && !drag);
      if (keep) {
        if (!ed.id) { if (txt) ctl.created({ id: ed.newId, tool: 'text', pts: [ed.at], text: txt, color: null }); else ctl.setTool('cursor'); }
        else { var cur = set.get(ed.id); if (cur && txt && txt !== cur.text) { var n = clone(cur); n.text = txt; set.put(n); } else if (cur && !txt) set.remove(cur.id); }
      } else if (!ed.id) ctl.setTool('cursor');
      refresh();
    }
    function editText(id) { var d = set.get(id); if (d && d.tool === 'text') openEditor({ id: id, text: d.text }); }

    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('pointermove', onMove, true);
    el.addEventListener('pointerup', onUp, true);
    el.addEventListener('pointercancel', onCancel, true);
    el.addEventListener('contextmenu', onContext, true);
    el.addEventListener('dblclick', onDbl, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);

    return {
      refresh: refresh,
      toolChanged: function () {
        if (create) { release(create.pid); create = null; refresh(); }
        if (editor && !editor.id) closeEditor(true);
        setInteractive(ctl.tool() === 'cursor' && !drag && !editor); idleCursor();
      },
      cancel: cancel,
      busy: function () { return !!(create || drag || editor); },
      editText: editText,
      hasDraft: function () { return !!create; },
      destroy: function () {
        if (drag) { var dd = drag; drag = null; set.put(dd.orig, true); }     // a chart rebuilt mid-drag leaves no half-moved drawing
        create = null; closeEditor(false);
        if (unsub) unsub();
        el.removeEventListener('pointerdown', onDown, true); el.removeEventListener('pointermove', onMove, true);
        el.removeEventListener('pointerup', onUp, true); el.removeEventListener('pointercancel', onCancel, true);
        el.removeEventListener('contextmenu', onContext, true); el.removeEventListener('dblclick', onDbl, true);
        window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true);
        try { series.detachPrimitive(primitive); } catch (e) { /* chart already removed */ }
        setCursor('');
      }
    };
  }

  // ---------------------------------------------------------------- undo history (pure)
  // Records committed changes { id, before, after, at } from the set's events; undo/redo apply them back through the set, so they
  // are saved like any other change. Transient drags are not changes; a reset (another account) clears the history.
  function createHistory(set) {
    var shadow = {}, undo = [], redo = [], applying = false, subs = [];
    function snap() { shadow = {}; set.list().forEach(function (x) { shadow[x.id] = clone(x); }); }
    function record(ch) { if (applying || !ch.length) return; undo.push(ch); if (undo.length > MAX_HISTORY) undo.shift(); redo = []; }
    snap();
    var off = set.on(function (kind, d, at) {
      if (kind === 'reset') { snap(); undo = []; redo = []; }
      else if (kind === 'add') { record([{ id: d.id, before: null, after: clone(d), at: at }]); shadow[d.id] = clone(d); }
      else if (kind === 'update') {
        var b = shadow[d.id] || null;
        if (!b || JSON.stringify(b) !== JSON.stringify(d)) record([{ id: d.id, before: b, after: clone(d), at: at }]);
        shadow[d.id] = clone(d);
      } else if (kind === 'remove') { record([{ id: d.id, before: shadow[d.id] || clone(d), after: null, at: at }]); delete shadow[d.id]; }
      else if (kind === 'clear') { record(d.map(function (x, i) { return { id: x.id, before: shadow[x.id] || clone(x), after: null, at: i }; })); shadow = {}; }
      else return;
      subs.forEach(function (f) { f(); });
    });
    function apply(ch, back) {
      applying = true;
      // a step is one change, or a clear: independent deletes in stacking order, so both ways go in recorded order
      var touched = null;
      try {
        ch.forEach(function (c) {
          var target = back ? c.before : c.after;
          if (!target) { set.remove(c.id); return; }
          touched = c.id;
          if (set.get(c.id)) set.put(clone(target)); else set.add(clone(target), c.at);
        });
      } finally { applying = false; }
      set.select(touched && set.get(touched) ? touched : null);
    }
    return {
      canUndo: function () { return undo.length > 0; },
      canRedo: function () { return redo.length > 0; },
      undo: function () { if (!undo.length) return false; var ch = undo.pop(); apply(ch, true); redo.push(ch); subs.forEach(function (f) { f(); }); return true; },
      redo: function () { if (!redo.length) return false; var ch = redo.pop(); apply(ch, false); undo.push(ch); subs.forEach(function (f) { f(); }); return true; },
      on: function (f) { subs.push(f); },
      destroy: function () { off(); subs = []; }
    };
  }

  // ---------------------------------------------------------------- controller: tool state, toolbar, keys, settings, persistence (browser)
  // opts: { bar (toolbar element), t, pro() -> every tool, saveable() -> drawings go to the account, upgrade(), toast(msg, type),
  //         newId(), confirm(text) -> Promise<bool>, icons(), local (localStorage), session (sessionStorage),
  //         db: { load(accountId) -> Promise<rows>, save(row) -> Promise, remove(id) -> Promise } | null, userId(), quote(diff, price) }
  var UI_KEY = 'ww_bt_draw_ui', SESSION_PREFIX = 'ww_bt_draw:';
  function createController(opts) {
    var set = createSet(), hist = createHistory(set), layers = [], tool = 'cursor', acc = null, timers = {}, failShown = false, loadSeq = 0, pop = null;
    var ui = { magnet: false, hidden: false, lockAll: false };
    try { var u = JSON.parse((opts.local && opts.local.getItem(UI_KEY)) || '{}'); ui.magnet = u.magnet === true; ui.hidden = u.hidden === true; ui.lockAll = u.lockAll === true; } catch (e) { /* defaults */ }
    set.setHidden(ui.hidden); set.setLockAll(ui.lockAll);
    function saveUi() { try { if (opts.local) opts.local.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* ignore */ } }
    function allowed(id) { return id === 'cursor' || FREE_TOOLS.indexOf(id) >= 0 || opts.pro(); }

    // persistence: Premium -> the account (debounced upsert per drawing); otherwise the browser session
    function sessionKey() { return SESSION_PREFIX + acc; }
    function writeSession() {
      if (!acc || !opts.session) return;
      try { opts.session.setItem(sessionKey(), JSON.stringify(set.list())); } catch (e) { /* full or blocked: memory only */ }
    }
    function failed(e) {
      if (failShown) return; failShown = true;
      opts.toast(opts.t('backtest.draw.save_failed', 'Çizim kaydedilemedi. Bu oturumda görünmeye devam eder.'), 'error');
      try { global.wwLog.warn('[bt-draw]', e); } catch (x) { /* ignore */ }
    }
    function doSave(id) {
      var cur = set.get(id); if (!cur || !acc) return;
      opts.db.save(toRow(cur, opts.userId(), acc)).then(function (r) { if (r && r.error) failed(r.error); }, failed);
    }
    function saveOne(d) {
      if (!opts.db || !opts.saveable()) return writeSession();
      var id = d.id;
      clearTimeout(timers[id]);
      timers[id] = setTimeout(function () { delete timers[id]; doSave(id); }, 400);
    }
    // pending saves go out now (account switch, leaving the page)
    function flush() { Object.keys(timers).forEach(function (id) { clearTimeout(timers[id]); delete timers[id]; doSave(id); }); }
    function removeOne(d) {
      if (!opts.db || !opts.saveable()) return writeSession();
      clearTimeout(timers[d.id]); delete timers[d.id];
      opts.db.remove(d.id).then(function (r) { if (r && r.error) failed(r.error); }, failed);
    }
    set.on(function (kind, d) {
      if (kind === 'add' || kind === 'update') saveOne(d);
      else if (kind === 'remove') removeOne(d);
      else if (kind === 'clear') { if (opts.db && opts.saveable()) d.forEach(removeOne); else writeSession(); }
      if (pop && (kind === 'remove' || kind === 'clear' || kind === 'reset') && !set.get(pop.id)) closePop();
      else if (pop && kind === 'update' && d.id === pop.id && !pop.busy) renderPop();
      if (kind !== 'drag') renderBar();
    });
    hist.on(renderBar);
    // load the drawings of an account: saved rows (Premium, or what a lapsed Premium saved) + this session's drawings
    function setAccount(id) {
      flush(); closePop(); cancelAll();
      acc = id || null; failShown = false; setTool('cursor');
      var seq = ++loadSeq;
      if (!acc) { set.reset([]); return Promise.resolve(); }
      var sess = [];
      try { sess = JSON.parse((opts.session && opts.session.getItem(sessionKey())) || '[]') || []; } catch (e) { sess = []; }
      set.reset(sess);
      if (!opts.db) return Promise.resolve();
      return Promise.resolve().then(function () { return opts.db.load(acc); }).then(function (r) {
        if (seq !== loadSeq) return;
        var rows = r && !r.error && Array.isArray(r.data) ? r.data : [];
        var byId = {}; rows.map(fromRow).filter(Boolean).forEach(function (d) { byId[d.id] = d; });
        sess.forEach(function (d) { var s = sanitize(d); if (s) byId[s.id] = s; });
        set.reset(Object.keys(byId).map(function (k) { return byId[k]; }));
      }, function () { /* table missing or offline: the session drawings stay */ });
    }
    function cancelAll() { var c = false; layers.forEach(function (l) { if (l.cancel()) c = true; }); return c; }

    function setTool(id) {
      if (TOOLS.indexOf(id) < 0) id = 'cursor';
      if (!allowed(id)) { opts.upgrade(); return; }
      tool = id;
      if (id !== 'cursor') closePop();
      layers.forEach(function (l) { l.toolChanged(); });
      renderBar();
    }
    function created(d) {
      if (set.list().length >= MAX_DRAWINGS) { opts.toast(opts.t('backtest.draw.too_many', 'En fazla {n} çizim olabilir.', { n: MAX_DRAWINGS }), 'warning'); setTool('cursor'); return; }
      var added = set.add(d);
      setTool('cursor');
      if (added) set.select(added.id);
    }
    function selected() { var id = set.selected(); return id ? set.get(id) : null; }
    function delSelected() {
      var d = selected(); if (!d) return false;
      if (d.locked) { opts.toast(opts.t('backtest.draw.locked_hint', 'Kilitli çizim değiştirilemez; önce kilidi aç.'), 'info'); return true; }
      set.remove(d.id); return true;
    }
    function edit(d, patch, transient) { var n = clone(d); Object.keys(patch).forEach(function (k) { if (patch[k] === undefined) delete n[k]; else n[k] = patch[k]; }); return set.put(n, transient); }
    function undo() { cancelAll(); return hist.undo(); }
    function redo() { cancelAll(); return hist.redo(); }

    // toolbar
    function btn(cls, icon, title, attrs) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'bt-draw-btn ' + (cls || ''); b.title = title; b.setAttribute('aria-label', title);
      var i = document.createElement('i'); i.setAttribute('data-lucide', icon); i.setAttribute('aria-hidden', 'true'); b.appendChild(i);
      Object.keys(attrs || {}).forEach(function (k) { b.setAttribute(k, attrs[k]); });
      return b;
    }
    function mod() { return /Mac|iPhone|iPad/.test((global.navigator && global.navigator.platform) || '') ? '⌘' : 'Ctrl+'; }
    function renderBar() {
      var bar = opts.bar; if (!bar) return;
      bar.textContent = '';
      bar.appendChild(btn('', 'mouse-pointer-2', opts.t('backtest.draw.cursor', 'İmleç') + ' (V)', { 'data-tool': 'cursor', 'aria-pressed': tool === 'cursor' ? 'true' : 'false' }));
      TOOLS.forEach(function (id, k) {
        var b = btn('', ICONS[id], opts.t('backtest.draw.tool_' + id, id) + ' (' + (k + 1) + ')', { 'data-tool': id, 'aria-pressed': tool === id ? 'true' : 'false' });
        if (!allowed(id)) { var s = document.createElement('span'); s.className = 'bt-pro bt-draw-pro'; s.textContent = 'PRO'; b.appendChild(s); b.setAttribute('data-pro', '1'); }
        bar.appendChild(b);
      });
      bar.appendChild(sep());
      bar.appendChild(btn('', 'magnet', opts.t('backtest.draw.magnet', 'Mıknatıs') + ' (M)', { 'data-act': 'magnet', 'aria-pressed': ui.magnet ? 'true' : 'false' }));
      bar.appendChild(btn('', ui.lockAll ? 'pin' : 'pin-off', opts.t('backtest.draw.lock_all', 'Tüm çizimleri kilitle'), { 'data-act': 'lockall', 'aria-pressed': ui.lockAll ? 'true' : 'false' }));
      bar.appendChild(btn('', ui.hidden ? 'eye-off' : 'eye', opts.t('backtest.draw.hide_all', 'Çizimleri gizle'), { 'data-act': 'hide', 'aria-pressed': ui.hidden ? 'true' : 'false' }));
      var ub = btn('', 'undo-2', opts.t('backtest.draw.undo', 'Geri al') + ' (' + mod() + 'Z)', { 'data-act': 'undo' }); ub.disabled = !hist.canUndo(); bar.appendChild(ub);
      var rb = btn('', 'redo-2', opts.t('backtest.draw.redo', 'Yinele') + ' (' + mod() + '⇧Z)', { 'data-act': 'redo' }); rb.disabled = !hist.canRedo(); bar.appendChild(rb);
      // the same buttons whether or not a drawing is selected (disabled instead of missing), so the bar never changes its width and
      // the chart next to it never resizes when a drawing is clicked; color and text are edited in the settings window
      var d = selected(), none = !d;
      var sb = btn('', 'sliders-horizontal', opts.t('backtest.draw.settings', 'Çizim ayarları'), { 'data-act': 'settings' }); sb.disabled = none; bar.appendChild(sb);
      var lb = btn('', d && d.locked ? 'pin' : 'pin-off', d && d.locked ? opts.t('backtest.draw.unlock', 'Kilidi aç') : opts.t('backtest.draw.lock', 'Kilitle'), { 'data-act': 'lock', 'aria-pressed': d && d.locked ? 'true' : 'false' });
      lb.disabled = none; bar.appendChild(lb);
      var db = btn('bt-draw-del', 'trash-2', opts.t('backtest.draw.delete', 'Sil') + ' (Del)', { 'data-act': 'delete' }); db.disabled = none; bar.appendChild(db);
      var cb = btn('bt-draw-del', 'eraser', opts.t('backtest.draw.clear', 'Tüm çizimleri sil'), { 'data-act': 'clear' }); cb.disabled = !set.list().length; bar.appendChild(cb);
      opts.icons();
      fitBar();
    }
    // vertical bar: as many 32 px rows as the chart height allows, the rest wraps into another column (explicit rows, so the
    // grid's width follows the real column count)
    function fitBar() {
      var bar = opts.bar; if (!bar || getComputedStyle(bar).display !== 'grid') { if (bar) bar.style.gridTemplateRows = ''; return; }
      var h = bar.clientHeight; if (!h) return;
      var v = 'repeat(' + Math.max(1, Math.floor((h - 4 + 2) / 34)) + ', 32px)';
      if (bar.style.gridTemplateRows !== v) bar.style.gridTemplateRows = v;
    }
    var ro = null, roFrame = 0;
    // next frame, not inside the observer callback (changing the width there would loop the observer)
    if (opts.bar && global.ResizeObserver) { ro = new global.ResizeObserver(function () { cancelAnimationFrame(roFrame); roFrame = requestAnimationFrame(fitBar); }); ro.observe(opts.bar); }
    function sep() { var s = document.createElement('span'); s.className = 'bt-draw-sep'; s.setAttribute('aria-hidden', 'true'); return s; }
    function editTextOf(d) { var l = layers[0]; if (l) l.editText(d.id); }
    function onBarClick(e) {
      var b = e.target.closest('button'); if (!b || !opts.bar.contains(b)) return;
      var t = b.getAttribute('data-tool');
      if (t) return setTool(tool === t && t !== 'cursor' ? 'cursor' : t);
      var a = b.getAttribute('data-act'), d = selected();
      if (a === 'magnet') { ui.magnet = !ui.magnet; saveUi(); renderBar(); }
      else if (a === 'lockall') { ui.lockAll = !ui.lockAll; saveUi(); set.setLockAll(ui.lockAll); renderBar(); }
      else if (a === 'hide') { ui.hidden = !ui.hidden; saveUi(); set.setHidden(ui.hidden); closePop(); renderBar(); }
      else if (a === 'undo') undo();
      else if (a === 'redo') redo();
      else if (a === 'lock' && d) edit(d, { locked: !d.locked });
      else if (a === 'delete') delSelected();
      else if (a === 'settings' && d) { var r = b.getBoundingClientRect(); openPop(d.id, r.right + 8, r.top); }
      else if (a === 'clear') opts.confirm(opts.t('backtest.draw.clear_confirm', 'Bu hesaptaki tüm çizimler silinsin mi?')).then(function (ok) { if (ok) set.clear(); });
    }
    if (opts.bar) opts.bar.addEventListener('click', onBarClick);

    // ---- settings popover: color, width, line style, fill and opacity (+ fib levels, text size), lock and delete
    function closePop() {
      if (!pop) return;
      if (pop.el.parentNode) pop.el.parentNode.removeChild(pop.el);
      document.removeEventListener('pointerdown', pop.outside, true);
      pop = null;
    }
    function openPop(id, x, y) {
      var d = set.get(id); if (!d) return;
      closePop();
      var box = document.createElement('div'); box.className = 'bt-dset'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', opts.t('backtest.draw.settings', 'Çizim ayarları'));
      pop = { id: id, el: box, x: x, y: y, busy: false, outside: function (e) { if (pop && !box.contains(e.target)) closePop(); } };
      document.body.appendChild(box);
      renderPop();
      document.addEventListener('pointerdown', pop.outside, true);
      box.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(); } });
    }
    function seg(name, items, cur, attr) {
      var row = document.createElement('div'); row.className = 'bt-dset-row';
      var l = document.createElement('span'); l.className = 'bt-dset-label'; l.textContent = name; row.appendChild(l);
      var g = document.createElement('div'); g.className = 'bt-dset-seg'; g.setAttribute('role', 'group'); g.setAttribute('aria-label', name);
      items.forEach(function (it) {
        var b = document.createElement('button'); b.type = 'button'; b.setAttribute(attr, it.v); b.title = it.title || String(it.label);
        b.setAttribute('aria-pressed', it.v === cur ? 'true' : 'false');
        if (it.html) b.innerHTML = it.html; else b.textContent = it.label;
        g.appendChild(b);
      });
      row.appendChild(g); return row;
    }
    function renderPop() {
      if (!pop) return;
      var d = set.get(pop.id); if (!d) { closePop(); return; }
      var box = pop.el, t = opts.t, c = d.color || COLORS[d.tool] || '#e8e8f0', focused = document.activeElement && box.contains(document.activeElement) ? document.activeElement.getAttribute('data-k') : null;
      box.textContent = '';
      var head = document.createElement('div'); head.className = 'bt-dset-head';
      var h = document.createElement('strong'); h.textContent = t('backtest.draw.tool_' + d.tool, d.tool); head.appendChild(h);
      var x = document.createElement('button'); x.type = 'button'; x.className = 'bt-dset-x'; x.setAttribute('data-k', 'close'); x.setAttribute('aria-label', t('common.close', 'Kapat')); x.textContent = '×'; head.appendChild(x);
      box.appendChild(head);
      // color
      var row = document.createElement('div'); row.className = 'bt-dset-row';
      var lab = document.createElement('span'); lab.className = 'bt-dset-label'; lab.textContent = t('backtest.draw.color', 'Renk'); row.appendChild(lab);
      var sw = document.createElement('div'); sw.className = 'bt-dset-swatches';
      SWATCHES.forEach(function (s) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'bt-dset-sw'; b.style.background = s; b.setAttribute('data-color', s); b.title = s;
        b.setAttribute('aria-label', s); b.setAttribute('aria-pressed', s === c ? 'true' : 'false'); sw.appendChild(b);
      });
      var ci = document.createElement('input'); ci.type = 'color'; ci.className = 'bt-draw-color'; ci.value = c; ci.setAttribute('data-k', 'color'); ci.setAttribute('aria-label', t('backtest.draw.color', 'Renk'));
      sw.appendChild(ci); row.appendChild(sw); box.appendChild(row);
      if (d.tool !== 'text') {
        box.appendChild(seg(t('backtest.draw.width', 'Kalınlık'), [1, 2, 3, 4].map(function (n) { return { v: String(n), label: String(n), html: '<i style="height:' + n + 'px"></i>' }; }), String(widthOf(d)), 'data-width'));
        box.appendChild(seg(t('backtest.draw.style', 'Çizgi stili'), [
          { v: 'solid', title: t('backtest.draw.solid', 'Düz'), html: '<i class="bt-dset-ln"></i>' },
          { v: 'dashed', title: t('backtest.draw.dashed', 'Kesik'), html: '<i class="bt-dset-ln bt-dset-dashed"></i>' },
          { v: 'dotted', title: t('backtest.draw.dotted', 'Noktalı'), html: '<i class="bt-dset-ln bt-dset-dotted"></i>' }], d.dash || 'solid', 'data-dash'));
      } else {
        box.appendChild(seg(t('backtest.draw.font_size', 'Yazı boyutu'), TEXT_SIZES.map(function (n) { return { v: String(n), label: String(n) }; }), String(d.size || 13), 'data-size'));
      }
      if (AREA[d.tool]) {
        var fr = document.createElement('div'); fr.className = 'bt-dset-row';
        var fl = document.createElement('label'); fl.className = 'bt-dset-check';
        var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = d.fill !== false; cb.setAttribute('data-k', 'fill');
        fl.appendChild(cb); fl.appendChild(document.createTextNode(' ' + t('backtest.draw.fill', 'Dolgu'))); fr.appendChild(fl);
        var rg = document.createElement('input'); rg.type = 'range'; rg.min = '0'; rg.max = '100'; rg.step = '5'; rg.className = 'bt-dset-range';
        rg.value = String(Math.round((d.opacity != null ? d.opacity : DEF_OPACITY[d.tool]) * 100)); rg.disabled = d.fill === false; rg.setAttribute('data-k', 'opacity');
        rg.setAttribute('aria-label', t('backtest.draw.opacity', 'Opaklık'));
        var ov = document.createElement('span'); ov.className = 'bt-dset-val bt-num'; ov.textContent = rg.value + '%';
        fr.appendChild(rg); fr.appendChild(ov); box.appendChild(fr);
      }
      if (d.tool === 'fib') {
        var lr = document.createElement('div'); lr.className = 'bt-dset-row bt-dset-col';
        var ll = document.createElement('label'); ll.className = 'bt-dset-label'; ll.textContent = t('backtest.draw.levels', 'Seviyeler'); ll.htmlFor = 'bt-dset-levels'; lr.appendChild(ll);
        var li = document.createElement('input'); li.type = 'text'; li.id = 'bt-dset-levels'; li.className = 'bt-input bt-dset-levels'; li.setAttribute('data-k', 'levels');
        li.value = (d.levels || FIB_LEVELS).join(', '); li.placeholder = FIB_LEVELS.join(', ');
        var lh = document.createElement('div'); lh.className = 'bt-dset-inline';
        lh.appendChild(li);
        var rs = document.createElement('button'); rs.type = 'button'; rs.className = 'bt-dset-btn'; rs.setAttribute('data-k', 'levels-reset'); rs.textContent = t('backtest.draw.levels_reset', 'Varsayılan'); lh.appendChild(rs);
        lr.appendChild(lh);
        var hint = document.createElement('p'); hint.className = 'bt-hint'; hint.id = 'bt-dset-levels-hint'; hint.textContent = t('backtest.draw.levels_hint', 'Virgülle ayır, ör. 0, 0.5, 0.618, 1 (en fazla 12)'); lr.appendChild(hint);
        box.appendChild(lr);
      }
      var foot = document.createElement('div'); foot.className = 'bt-dset-foot';
      if (d.tool === 'text') { var eb = document.createElement('button'); eb.type = 'button'; eb.className = 'bt-dset-btn'; eb.setAttribute('data-k', 'edit-text'); eb.textContent = t('backtest.draw.edit_text', 'Metni düzenle'); foot.appendChild(eb); }
      var lk = document.createElement('button'); lk.type = 'button'; lk.className = 'bt-dset-btn'; lk.setAttribute('data-k', 'lock'); lk.setAttribute('aria-pressed', d.locked ? 'true' : 'false');
      lk.textContent = d.locked ? t('backtest.draw.unlock', 'Kilidi aç') : t('backtest.draw.lock', 'Kilitle'); foot.appendChild(lk);
      var del = document.createElement('button'); del.type = 'button'; del.className = 'bt-dset-btn bt-dset-del'; del.setAttribute('data-k', 'delete'); del.textContent = t('backtest.draw.delete', 'Sil'); foot.appendChild(del);
      box.appendChild(foot);
      // place next to the pointer, inside the viewport
      var vw = global.innerWidth || 1200, vh = global.innerHeight || 800, bw = box.offsetWidth || 260, bh = box.offsetHeight || 240;
      box.style.left = Math.round(Math.max(8, Math.min(vw - bw - 8, pop.x + 10))) + 'px';
      box.style.top = Math.round(Math.max(8, Math.min(vh - bh - 8, pop.y - 10))) + 'px';
      if (focused) { var f = box.querySelector('[data-k="' + focused + '"]'); if (f) try { f.focus(); } catch (e) { /* ignore */ } }
    }
    function onPopClick(e) {
      if (!pop || !pop.el.contains(e.target)) return;
      var d = set.get(pop.id); if (!d) return closePop();
      var b = e.target.closest('button'); if (!b) return;
      var k = b.getAttribute('data-k');
      if (k === 'close') return closePop();
      if (b.hasAttribute('data-color')) return edit(d, { color: b.getAttribute('data-color') });
      if (b.hasAttribute('data-width')) return edit(d, { width: +b.getAttribute('data-width') });
      if (b.hasAttribute('data-dash')) return edit(d, { dash: b.getAttribute('data-dash') });
      if (b.hasAttribute('data-size')) return edit(d, { size: +b.getAttribute('data-size') });
      if (k === 'levels-reset') return edit(d, { levels: undefined });
      if (k === 'lock') return edit(d, { locked: !d.locked });
      if (k === 'edit-text') { closePop(); return editTextOf(d); }
      if (k === 'delete') { if (d.locked) return opts.toast(opts.t('backtest.draw.locked_hint', 'Kilitli çizim değiştirilemez; önce kilidi aç.'), 'info'); set.remove(d.id); closePop(); }
    }
    function onPopInput(e) {
      if (!pop || !pop.el.contains(e.target)) return;
      var d = set.get(pop.id); if (!d) return;
      var k = e.target.getAttribute('data-k'), live = e.type === 'input';
      pop.busy = live;                                     // a slider being dragged is not rebuilt under the pointer
      if (k === 'color') edit(d, { color: e.target.value }, live);
      else if (k === 'fill' && !live) edit(d, { fill: e.target.checked ? undefined : false });
      else if (k === 'opacity') { var ov = e.target.nextSibling; if (ov) ov.textContent = e.target.value + '%'; edit(d, { opacity: +e.target.value / 100 }, live); }
      else if (k === 'levels' && !live) {
        var lv = parseLevels(e.target.value);
        if (lv) edit(d, { levels: lv }); else { e.target.setAttribute('aria-invalid', 'true'); e.target.value = (d.levels || FIB_LEVELS).join(', '); }
      }
      if (!live) pop.busy = false;
    }
    var doc = global.document || null;
    if (doc) { doc.addEventListener('click', onPopClick); doc.addEventListener('input', onPopInput); doc.addEventListener('change', onPopInput); }

    var ctl = {
      tool: function () { return tool; },
      magnet: function () { return ui.magnet; },
      allowed: allowed,
      denied: function () { opts.upgrade(); },
      newId: opts.newId,
      created: created,
      setTool: setTool,
      openPop: openPop,
      closePop: closePop
    };
    return {
      set: set,
      history: hist,
      attach: function (lo) { var l = createLayer(Object.assign({ set: set, ctl: ctl, t: opts.t, quote: opts.quote }, lo)); layers.push(l); return l; },
      detach: function (l) { if (!l) return; l.destroy(); layers = layers.filter(function (x) { return x !== l; }); },
      setAccount: setAccount,
      tool: function () { return tool; },
      setTool: setTool,
      render: renderBar,
      undo: undo,
      redo: redo,
      openSettings: openPop,
      settingsOpen: function () { return pop ? pop.id : null; },
      busy: function () { return layers.some(function (l) { return l.busy(); }); },
      // keyboard (no modifiers; the page skips inputs): true when the key was used
      key: function (e) {
        var k = e.key;
        if (/^[1-9]$/.test(k)) { setTool(TOOLS[+k - 1]); return true; }
        if (k === 'v' || k === 'V') { setTool('cursor'); return true; }
        if ((k === 'm' || k === 'M') && !e.shiftKey) { ui.magnet = !ui.magnet; saveUi(); renderBar(); return true; }
        if (k === 'Delete' || k === 'Backspace') return delSelected();
        return false;
      },
      // Ctrl/Cmd+Z undo, Shift+Ctrl/Cmd+Z and Ctrl+Y redo: true when the key belongs to the drawings
      undoKey: function (e) {
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
        var k = (e.key || '').toLowerCase();
        if (k === 'z') { if (e.shiftKey) redo(); else undo(); return true; }
        if (k === 'y' && !e.shiftKey) { redo(); return true; }
        return false;
      },
      escape: function () {
        if (pop) { closePop(); return true; }
        if (cancelAll()) return true;
        if (tool !== 'cursor') { setTool('cursor'); return true; }
        if (set.selected()) { set.select(null); return true; }
        return false;
      },
      destroy: function () {
        flush(); closePop();
        if (ro) { ro.disconnect(); ro = null; cancelAnimationFrame(roFrame); }
        layers.forEach(function (l) { l.destroy(); }); layers = [];
        hist.destroy();
        if (doc) { doc.removeEventListener('click', onPopClick); doc.removeEventListener('input', onPopInput); doc.removeEventListener('change', onPopInput); }
        if (opts.bar) opts.bar.removeEventListener('click', onBarClick);
      }
    };
  }

  global.WwBtDraw = {
    TOOLS: TOOLS, FREE_TOOLS: FREE_TOOLS, NPTS: NPTS, ICONS: ICONS, FIB_LEVELS: FIB_LEVELS, COLORS: COLORS, MAX_TEXT: MAX_TEXT, MAX_DRAWINGS: MAX_DRAWINGS,
    TEXT_SIZES: TEXT_SIZES, MAX_LEVELS: MAX_LEVELS,
    timeToLogical: timeToLogical, logicalToTime: logicalToTime, magnet: magnet,
    sanitize: sanitize, toRow: toRow, fromRow: fromRow, fibLevels: fibLevels, newPosition: newPosition, positionStats: positionStats,
    measureStats: measureStats, moveBy: moveBy, setHandle: setHandle, resizeRect: resizeRect, distSeg: distSeg, rayEnd: rayEnd, inBox: inBox,
    lockAngle: lockAngle, squareBox: squareBox, rectHandles: rectHandles, parseLevels: parseLevels, cleanLevels: cleanLevels, fillOf: fillOf, widthOf: widthOf,
    createSet: createSet, createHistory: createHistory, createLayer: createLayer, createController: createController
  };
})(typeof window !== 'undefined' ? window : globalThis);
