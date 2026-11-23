// Backtest v2: drawing tools (window.WwBtDraw), rendered with the Lightweight Charts plugin system (series primitives, v4.1).
// A drawing is stored with TIME (UTC seconds) and PRICE coordinates, never with bar indexes, so it stays on the same spot when
// the timeframe changes, when history is prepended and while the replay reveals new candles. Times map to the chart through the
// revealed candles only (beyond the last one by extrapolating the bar length), so nothing ever reads a future candle; the magnet
// snaps to revealed candles only.
// Free plan: trend line, horizontal line and rectangle, kept for the browser session. Premium: every tool, saved to the account
// (public.backtest_drawings: points + style jsonb; the style keeps color, lock, text, width, dash, fill, opacity, fib levels and
// text size). Undo/redo works on committed changes (create, move, resize, settings, delete, clear). The pure helpers at the top
// are unit tested.
// The toolbar groups related tools on one button (lines, positions): the button shows the last tool used, its corner (or a right click)
// opens the others. The user reorders buttons and moves tools between groups by drag and drop (kept per browser, reset to default).
// Every drawing belongs to the chart it was drawn on (`pane`: 'main' or the window id 'chart2'..'chart4', kept in the style;
// missing = 'main', so older drawings stay on the main chart). A chart's layer shows, selects and edits only its own drawings.
(function (global) {
  'use strict';

  // The first nine keep their places: the number keys 1-9 pick them (the toolbar shows the number in the tooltip)
  var TOOLS = ['trend', 'hline', 'ray', 'rect', 'fib', 'long', 'short', 'text', 'measure',
    'vline', 'arrow', 'channel', 'fibext', 'pitchfork', 'ellipse', 'triangle', 'brush', 'callout'];
  var FREE_TOOLS = ['trend', 'hline', 'rect'];
  // points of a finished drawing (the brush: 2..MAX_BRUSH, see sanitize)
  var NPTS = { trend: 2, hline: 1, ray: 2, rect: 2, fib: 2, long: 3, short: 3, text: 1, measure: 2,
    vline: 1, arrow: 2, channel: 3, fibext: 3, pitchfork: 3, ellipse: 2, triangle: 3, brush: 2, callout: 2 };
  var ICONS = { trend: 'trending-up', hline: 'minus', ray: 'move-up-right', rect: 'rectangle-horizontal', fib: 'align-vertical-space-around',
    long: 'arrow-up-from-line', short: 'arrow-down-from-line', text: 'type', measure: 'ruler',
    vline: 'separator-vertical', arrow: 'arrow-up-right', channel: 'equal', fibext: 'align-vertical-space-between', pitchfork: 'git-fork',
    ellipse: 'circle', triangle: 'triangle', brush: 'brush', callout: 'message-square-text' };
  var FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  var FIBEXT_LEVELS = [0, 0.618, 1, 1.272, 1.618, 2, 2.618];
  var COLORS = { trend: '#8b5cf6', hline: '#f59e0b', ray: '#38bdf8', rect: '#8b5cf6', fib: '#a78bfa', long: '#22c55e', short: '#ef4444', text: null, measure: '#38bdf8',
    vline: '#f59e0b', arrow: '#f472b6', channel: '#38bdf8', fibext: '#a78bfa', pitchfork: '#22c55e', ellipse: '#f59e0b', triangle: '#8b5cf6', brush: '#f472b6', callout: '#3b82f6' };
  var SWATCHES = ['#8b5cf6', '#38bdf8', '#22c55e', '#f59e0b', '#ef4444', '#f472b6', '#e8e8f0', '#64748b'];
  var DASHES = ['solid', 'dashed', 'dotted'];
  var EXTENDS = ['both', 'right', 'none'];                  // horizontal line: across the chart, a ray to the right, a segment (two ends)
  var LINE_EXTENDS = ['none', 'right', 'left', 'both'];     // trend line: a segment, or extended past one end or both
  var ZONE_EXTENDS = ['none', 'right'];                     // rectangle and Fibonacci tools: their right edge reaches the chart's right edge
  var AREA = { rect: true, fib: true, long: true, short: true, measure: true, channel: true, fibext: true, pitchfork: true, ellipse: true, triangle: true }; // tools with a fill
  var DEF_OPACITY = { rect: 0.14, fib: 0.1, long: 0.16, short: 0.16, measure: 0.15, channel: 0.1, fibext: 0.08, pitchfork: 0.06, ellipse: 0.14, triangle: 0.14 };
  var TEXTUAL = { text: true, callout: true };              // tools that carry a text (and a font size instead of a line width)
  var TEXT_SIZES = [11, 13, 16, 20, 24, 32];
  var MAX_TEXT = 200, MAX_DRAWINGS = 500, MAX_LEVELS = 12, MAX_HISTORY = 100, SEG_BARS = 20, MAX_BRUSH = 120;
  var STYLE_DEFAULT_KEYS = ['color', 'width', 'dash', 'fill', 'opacity', 'levels', 'size', 'extend', 'stats'];   // what "set as default" keeps
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
  // magnet: the closest open/high/low/close of the revealed bar under the pointer (time = that bar's time). Off the candles (the
  // empty space after the last one, or before the first) nothing snaps, so a line can still be drawn into the future.
  function magnet(bars, logical, price) {
    if (!bars.length || !(logical >= -0.5 && logical <= bars.length - 0.5)) return null;
    var i = Math.max(0, Math.min(bars.length - 1, Math.round(logical))), b = bars[i], best = b.close;
    [b.open, b.high, b.low].forEach(function (v) { if (Math.abs(v - price) < Math.abs(best - price)) best = v; });
    return { t: b.time, p: best };
  }

  // ---------------------------------------------------------------- model (pure)
  // { id, tool, pts: [{ t, p }], color (#rrggbb | null = theme), text, locked, width (1-4), dash, fill, opacity, levels, size, pane, extend }
  // A horizontal line has one point, or two as a segment (extend 'none'; the second point keeps the first one's price).
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
  // brush points are rounded (whole seconds, 8 significant digits): a long stroke stays small in the database
  function roundPt(x) { return { t: Math.round(x.t), p: Number(x.p.toPrecision(8)) }; }
  function sanitize(d) {
    if (!d || typeof d !== 'object' || TOOLS.indexOf(d.tool) < 0 || typeof d.id !== 'string' || !Array.isArray(d.pts)) return null;
    var seg = d.tool === 'hline' && d.extend === 'none' && d.pts.length >= 2, n = seg ? 2 : NPTS[d.tool];
    if (d.tool === 'brush') n = Math.min(d.pts.length, MAX_BRUSH);
    var pts = d.pts.slice(0, n).map(function (x) { return { t: num(x && x.t), p: num(x && x.p) }; });
    if (pts.length !== n || n < 1 || pts.some(function (x) { return !isFinite(x.t) || !isFinite(x.p); })) return null;
    if (d.tool === 'brush') { if (n < 2) return null; pts = pts.map(roundPt); }
    if (seg) pts[1].p = pts[0].p;
    // a channel's third point only carries the width: it is kept straight above the first point (the same time)
    if (d.tool === 'channel') pts[2].t = pts[0].t;
    var out = { id: d.id, tool: d.tool, pts: pts, color: isColor(d.color) ? d.color.toLowerCase() : null, locked: d.locked === true };
    if (TEXTUAL[d.tool]) {
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
    if (d.tool === 'hline' && EXTENDS.indexOf(d.extend) > 0 && (d.extend !== 'none' || seg)) out.extend = d.extend;
    if (d.tool === 'trend' && LINE_EXTENDS.indexOf(d.extend) > 0) out.extend = d.extend;
    if ((d.tool === 'rect' || d.tool === 'fib' || d.tool === 'fibext') && ZONE_EXTENDS.indexOf(d.extend) > 0) out.extend = d.extend;
    if (d.tool === 'trend' && d.stats === true) out.stats = true;
    if ((d.tool === 'fib' || d.tool === 'fibext') && d.levels != null) { var lv = cleanLevels(d.levels); if (lv && lv.join() !== defLevels(d.tool).join()) out.levels = lv; }
    if (typeof d.pane === 'string' && PANE_RE.test(d.pane)) out.pane = d.pane;
    return out;
  }
  function defLevels(tool) { return tool === 'fibext' ? FIBEXT_LEVELS : FIB_LEVELS; }
  // stored "set as default" styles ({ tool: { color, width, ... } }): every value goes through sanitize, anything else is dropped
  function cleanDefaults(src) {
    var out = {};
    if (!src || typeof src !== 'object') return out;
    TOOLS.forEach(function (tool) {
      var st = src[tool]; if (!st || typeof st !== 'object') return;
      var probe = { id: 'x', tool: tool, pts: [], text: 'x' };
      for (var i = 0; i < Math.max(2, NPTS[tool]); i++) probe.pts.push({ t: i, p: 1 + i });
      STYLE_DEFAULT_KEYS.forEach(function (k) { if (st[k] !== undefined) probe[k] = st[k]; });
      if (tool === 'hline') delete probe.extend;                // the horizontal line keeps its own last-used length mode
      var c = sanitize(probe); if (!c) return;
      var keep = {};
      STYLE_DEFAULT_KEYS.forEach(function (k) { if (c[k] !== undefined && c[k] !== null) keep[k] = c[k]; });
      if (Object.keys(keep).length) out[tool] = keep;
    });
    return out;
  }
  var PANE_RE = /^chart[2-9]$/;                            // the extra charts; the main chart is the default and is left out
  function paneOf(d) { return d.pane || 'main'; }
  var STYLE_KEYS = ['width', 'dash', 'fill', 'opacity', 'levels', 'size', 'pane', 'extend', 'stats'];
  function toRow(d, userId, accountId) {
    var style = { color: d.color || null, locked: !!d.locked };
    if (TEXTUAL[d.tool]) style.text = d.text;
    STYLE_KEYS.forEach(function (k) { if (d[k] !== undefined) style[k] = d[k]; });
    return { id: d.id, user_id: userId, backtest_account_id: accountId, tool: d.tool, points: d.pts.map(function (x) { return { t: x.t, p: x.p }; }), style: style };
  }
  function fromRow(r) {
    var st = r && r.style && typeof r.style === 'object' ? r.style : {};
    var d = { id: r && r.id, tool: r && r.tool, pts: r && r.points, color: st.color, text: st.text, locked: st.locked };
    STYLE_KEYS.forEach(function (k) { if (st[k] !== undefined) d[k] = st[k]; });
    return sanitize(d);
  }
  function defWidth(tool) { return tool === 'fib' || tool === 'measure' || tool === 'fibext' ? 1 : 2; }
  function widthOf(d) { return d.width || defWidth(d.tool); }
  function fillOf(d) { return AREA[d.tool] ? (d.fill === false ? 0 : (d.opacity != null ? d.opacity : DEF_OPACITY[d.tool])) : 0; }
  // the x range a horizontal line covers on screen (xs: its points' x, w: pane width)
  function hlineSpan(d, xs, w) {
    if (d.extend === 'right') return [xs[0], w];
    if (d.extend === 'none') return [Math.min(xs[0], xs[1]), Math.max(xs[0], xs[1])];
    return [0, w];
  }
  // Fibonacci retracement: levels from the first point (level 1) to the second point (level 0).
  // Trend-based extension: A, B, C; level n sits at C + n * (B - A) (1 = the A-B move repeated from C).
  function fibLevels(d) {
    if (d.tool === 'fibext') {
      var A = d.pts[0].p, B = d.pts[1].p, C = d.pts[2].p;
      return (d.levels || FIBEXT_LEVELS).map(function (lv) { return { level: lv, price: C + (B - A) * lv }; });
    }
    var a = d.pts[0].p, b = d.pts[1].p;
    return (d.levels || FIB_LEVELS).map(function (lv) { return { level: lv, price: b + (a - b) * lv }; });
  }
  // long / short position tool: pts[0] = entry (start time, entry price), pts[1] = target (end time), pts[2] = stop (end time).
  // `end`: the end time (the chart passes 20 bars later, counted in candles so a weekend does not shorten the box)
  function newPosition(tool, t, p, unit, tfSec, end) {
    var dir = tool === 'long' ? 1 : -1;
    if (!(end > t)) end = t + 20 * tfSec;
    return [{ t: t, p: p }, { t: end, p: p + dir * 2 * unit }, { t: end, p: p - dir * unit }];
  }
  // parallel channel: pts[0]-pts[1] is the base line, pts[2] sits straight above pts[0] at the parallel line (its price - the first
  // point's price = the channel's width in price, so the width stays when the base line is dragged)
  function channelOffset(d) { return d.pts[2].p - d.pts[0].p; }
  // the price a straight screen line through (x0, p0)-(x1, p1) has at x (the chart's price scale is linear inside a pane)
  function priceOnLine(x0, p0, x1, p1, x) { return x1 === x0 ? p0 : p0 + (x - x0) / (x1 - x0) * (p1 - p0); }
  // a stroke of the brush in screen space, thinned (Ramer-Douglas-Peucker) until at most `max` points are left
  function simplify(pts, eps) {
    if (pts.length < 3) return pts.slice();
    var a = pts[0], b = pts[pts.length - 1], far = -1, fd = -1;
    for (var i = 1; i < pts.length - 1; i++) { var dd = distSeg(pts[i].x, pts[i].y, a.x, a.y, b.x, b.y); if (dd > fd) { fd = dd; far = i; } }
    if (fd <= eps) return [a, b];
    var l = simplify(pts.slice(0, far + 1), eps), r = simplify(pts.slice(far), eps);
    return l.slice(0, -1).concat(r);
  }
  function thinStroke(pts, max) {
    var out = simplify(pts, 0.75), eps = 0.75;
    while (out.length > max && eps < 1e4) { eps *= 1.6; out = simplify(pts, eps); }
    return out;
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
    // horizontal line: the start sets the time and the price (a segment's end follows the price), a segment's end only its length
    if (d.tool === 'hline') { if (idx === 1 && P[1]) P[1].t = t; else { P[0] = { t: t, p: p }; if (P[1]) P[1].p = p; } return out; }
    if (d.tool === 'long' || d.tool === 'short') {
      var dir = d.tool === 'long' ? 1 : -1, e = P[0].p, eps = Math.abs(e) * 1e-6 || 1e-9;
      if (idx === 0) { var de = p - e; P[0] = { t: Math.min(t, P[1].t - tfSec), p: p }; P[1].p += de; P[2].p += de; }
      else if (idx === 1) P[1].p = dir > 0 ? Math.max(p, e + eps) : Math.min(p, e - eps);
      else if (idx === 2) P[2].p = dir > 0 ? Math.min(p, e - eps) : Math.max(p, e + eps);
      else if (idx === 3) { var end = Math.max(t, P[0].t + tfSec); P[1].t = end; P[2].t = end; }
      return out;
    }
    // channel: the base line's ends move freely and the width stays; the third handle (on the parallel line) only sets the width,
    // `p` there is already the price the parallel line should have above the first point (the layer converts the pointer)
    if (d.tool === 'channel') {
      var off = channelOffset(d);
      if (idx === 0) { P[0] = { t: t, p: p }; P[2] = { t: t, p: p + off }; }
      else if (idx === 1) P[1] = { t: t, p: p };
      else if (idx === 2) P[2] = { t: P[0].t, p: p };
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
  // a trend line on screen with its extension: 'right' past the second point, 'left' past the first, 'both' (an extended line)
  function extendLine(x1, y1, x2, y2, w, h, mode) {
    var a = { x: x1, y: y1 }, b = { x: x2, y: y2 };
    if (mode === 'right' || mode === 'both') b = rayEnd(x1, y1, x2, y2, w, h);
    if (mode === 'left' || mode === 'both') a = rayEnd(x2, y2, x1, y1, w, h);
    return [a.x, a.y, b.x, b.y];
  }
  // Andrews' pitchfork on screen: the median line from the pivot through the middle of the other two points, and two tines through
  // those points, parallel to it; all three run to the pane edge. Returns [x1, y1, x2, y2] segments: median, upper tine, lower tine.
  function pitchforkLines(xs, ys, w, h) {
    var mx = (xs[1] + xs[2]) / 2, my = (ys[1] + ys[2]) / 2, dx = mx - xs[0], dy = my - ys[0];
    if (!dx && !dy) return [];
    function ray(x, y) { var e = rayEnd(x, y, x + dx, y + dy, w, h); return [x, y, e.x, e.y]; }
    return [ray(xs[0], ys[0]), ray(xs[1], ys[1]), ray(xs[2], ys[2])];
  }
  // ellipse in the box (x1,y1)-(x2,y2): 'in' (filled area), 'edge' (on the outline within tol px) or null
  function ellipseHit(px, py, x1, y1, x2, y2, tol) {
    var cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
    if (rx < 1 || ry < 1) return distSeg(px, py, x1, y1, x2, y2) <= tol ? 'edge' : null;
    var k = Math.sqrt((px - cx) * (px - cx) / (rx * rx) + (py - cy) * (py - cy) / (ry * ry));
    if (Math.abs(k - 1) * Math.min(rx, ry) <= tol) return 'edge';
    return k < 1 ? 'in' : null;
  }
  // point in a polygon (even-odd)
  function inPoly(px, py, xs, ys) {
    var inside = false;
    for (var i = 0, j = xs.length - 1; i < xs.length; j = i++) {
      if ((ys[i] > py) !== (ys[j] > py) && px < (xs[j] - xs[i]) * (py - ys[i]) / (ys[j] - ys[i]) + xs[i]) inside = !inside;
    }
    return inside;
  }
  function nearPath(px, py, xs, ys, closed, tol) {
    for (var i = 0; i + 1 < xs.length; i++) if (distSeg(px, py, xs[i], ys[i], xs[i + 1], ys[i + 1]) <= tol) return true;
    return !!closed && xs.length > 2 && distSeg(px, py, xs[xs.length - 1], ys[ys.length - 1], xs[0], ys[0]) <= tol;
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

  // ---------------------------------------------------------------- toolbar groups (pure)
  // [{ t: [tool ids], c: the tool the button shows }]; every tool in exactly one group
  var DEFAULT_GROUPS = [['trend', 'ray', 'hline', 'vline', 'arrow'], ['channel', 'pitchfork'], ['fib', 'fibext'], ['rect', 'ellipse', 'triangle', 'brush'],
    ['long', 'short'], ['text', 'callout'], ['measure']];
  // the default before the new tools (2026-11-23): a toolbar stored like this simply becomes the new default
  var OLD_DEFAULT_GROUPS = [['trend', 'ray', 'hline'], ['rect'], ['fib'], ['long', 'short'], ['text'], ['measure']];
  // a tool missing from a stored (customized) toolbar joins the group of its closest relative, else gets its own button
  var SIBLING = { vline: 'hline', arrow: 'trend', pitchfork: 'channel', fibext: 'fib', ellipse: 'rect', triangle: 'rect', brush: 'rect', callout: 'text' };
  function defaultGroups() { return DEFAULT_GROUPS.map(function (g) { return { t: g.slice(), c: g[0] }; }); }
  // anything stored is checked: unknown and repeated tools dropped, empty groups dropped, a missing tool goes next to its relative
  // (SIBLING) or gets its own button at the end
  function normalizeGroups(src) {
    if (!Array.isArray(src)) return defaultGroups();
    var seen = {}, out = [];
    src.forEach(function (g) {
      var t = (g && Array.isArray(g.t) ? g.t : []).filter(function (id) { if (TOOLS.indexOf(id) < 0 || seen[id]) return false; seen[id] = true; return true; });
      if (t.length) out.push({ t: t, c: t.indexOf(g.c) >= 0 ? g.c : t[0] });
    });
    if (JSON.stringify(out.map(function (g) { return g.t; })) === JSON.stringify(OLD_DEFAULT_GROUPS)) return defaultGroups();
    TOOLS.forEach(function (id) {
      if (seen[id]) return;
      var gi = SIBLING[id] ? groupOf(out, SIBLING[id]) : -1;
      if (gi >= 0) out[gi].t.push(id); else out.push({ t: [id], c: id });
      seen[id] = true;
    });
    return out;
  }
  function isDefaultGroups(groups) { return JSON.stringify(groups.map(function (g) { return g.t; })) === JSON.stringify(DEFAULT_GROUPS); }
  function groupOf(groups, tool) { for (var i = 0; i < groups.length; i++) if (groups[i].t.indexOf(tool) >= 0) return i; return -1; }
  // drag and drop. Positions are counted in the list before the move (what the user sees while dragging).
  // a button to another place: `to` = the button it goes before (groups.length = the end)
  function moveGroup(groups, from, to) {
    var n = clone(groups); if (from < 0 || from >= n.length) return n;
    var g = n.splice(from, 1)[0]; if (to > from) to--;
    n.splice(Math.max(0, Math.min(n.length, to)), 0, g);
    return n;
  }
  // a button dropped on another one: its tools join that group at the end (the target keeps the tool it shows)
  function mergeGroup(groups, from, into) {
    if (from === into || !groups[from] || !groups[into]) return clone(groups);
    var n = clone(groups); n[into].t = n[into].t.concat(n[from].t); n.splice(from, 1);
    return n;
  }
  // one tool of a group: dest { group, at } = into that group before position `at`; dest { at } = its own button before button `at`
  function moveTool(groups, tool, dest) {
    var gi = groupOf(groups, tool); if (gi < 0) return clone(groups);
    var n = clone(groups), src = n[gi], pos = src.t.indexOf(tool), at = dest.at;
    src.t.splice(pos, 1); if (src.c === tool) src.c = src.t[0];
    if (dest.group != null) {
      var target = n[dest.group]; if (!target) return clone(groups);
      if (dest.group === gi && at > pos) at--;
      target.t.splice(Math.max(0, Math.min(target.t.length, at)), 0, tool);
      if (dest.group === gi) src.c = groups[gi].c;
    } else {
      n.splice(Math.max(0, Math.min(n.length, at)), 0, { t: [tool], c: tool });
      if (at <= gi) gi++;
    }
    if (!src.t.length) n.splice(gi, 1);
    return n;
  }

  // ---------------------------------------------------------------- chart layer (browser)
  // opts: { chart, series, el (the chart element), bars() (revealed candles in prices), tfSec(), set, ctl (controller below),
  //         fmt(price) -> text, t(key, fb, params), quote(diff, price) -> { dist, money } | null (position tool labels),
  //         pane ('main' | 'chart2'..'chart4': the drawings this layer shows and creates) }
  function createLayer(opts) {
    var chart = opts.chart, series = opts.series, el = opts.el, set = opts.set, ctl = opts.ctl, pane = opts.pane || 'main';
    function own() { return set.list().filter(function (d) { return paneOf(d) === pane; }); }
    function mark(d) { if (pane !== 'main') d.pane = pane; return d; }   // a new drawing belongs to this chart
    var api = null, create = null, drag = null, editor = null, boxes = {}, unsub = null, interactive = true, saved = null, last = null;
    function css(name, fb) { var v = getComputedStyle(document.body).getPropertyValue(name).trim(); return v || fb; }
    function light() { return document.body.classList.contains('light-theme'); }
    function textColor() { return light() ? '#0f172a' : '#e8e8f0'; }
    function colorOf(d) { return d.color || COLORS[d.tool] || textColor(); }
    // white or dark text on a colored background (the callout bubble)
    function onColor(c) {
      var m = /^#([0-9a-f]{6})$/i.exec(c || ''); if (!m) return '#ffffff';
      var r = parseInt(m[1].slice(0, 2), 16), g = parseInt(m[1].slice(2, 4), 16), b = parseInt(m[1].slice(4, 6), 16);
      return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? '#0f172a' : '#ffffff';
    }
    // the chart's own crosshair time format (vertical line label on the time axis)
    function timeText(t) {
      try { var f = chart.options().localization.timeFormatter; if (typeof f === 'function') return f(t); } catch (e) { /* fall back */ }
      return new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ');
    }

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
    function poly(ctx, xs, ys, close) {
      ctx.beginPath(); ctx.moveTo(xs[0], ys[0]);
      for (var i = 1; i < xs.length; i++) ctx.lineTo(xs[i], ys[i]);
      if (close) ctx.closePath();
    }
    function arrowHead(ctx, x1, y1, x2, y2, w, color) {
      var a = Math.atan2(y2 - y1, x2 - x1), s = 7 + w * 2.5;
      ctx.save(); ctx.setLineDash([]); ctx.fillStyle = color; ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - s * Math.cos(a - 0.42), y2 - s * Math.sin(a - 0.42));
      ctx.lineTo(x2 - s * Math.cos(a + 0.42), y2 - s * Math.sin(a + 0.42));
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
    // `maxX`: keep a centered label inside the pane (it would be cut by the price axis)
    function label(ctx, text, x, y, color, align, bg, maxX) {
      ctx.font = '600 11.5px "Geist", system-ui, sans-serif'; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
      var tw = ctx.measureText(text).width;
      if (align === 'center' && maxX) x = Math.max(tw / 2 + 7, Math.min(maxX - tw / 2 - 7, x));
      if (align === 'left' && maxX && bg) x = Math.min(x, maxX - tw - 8);
      if (bg) {
        var w = tw + 10, bx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x - 5;
        ctx.fillStyle = bg; ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, y - 9, w, 18, 4); else ctx.rect(bx, y - 9, w, 18);
        ctx.fill();
      }
      ctx.fillStyle = color; ctx.fillText(text, x, y);
    }
    // the price change, percent, candles and time between two points (measure tool, trend line info label)
    function statsText(d, m) {
      var ms = measureStats(d, m.bars, m.tf);
      return (ms.dp >= 0 ? '+' : '−') + opts.fmt(Math.abs(ms.dp)) + ' (' + (ms.pct >= 0 ? '+' : '') + ms.pct.toFixed(2) + '%) · ' +
        opts.t('backtest.draw.bars', '{n} mum', { n: ms.bars }) + ' · ' + duration(ms.seconds);
    }
    function channelYs(d, m) {
      var off = channelOffset(d);
      return [m.y(d.pts[0].p + off), m.y(d.pts[1].p + off)];
    }
    // the levels of a Fibonacci tool on screen: [{ level, price, y }], the x range they span and the y range they cover
    function fibGeom(d, m, x) {
      var lvs = fibLevels(d), xl, xr;
      if (d.tool === 'fibext') { xl = x[2]; xr = x[2] + Math.max(Math.abs(x[1] - x[0]), 40); }
      else { xl = Math.min(x[0], x[1]); xr = Math.max(x[0], x[1]); }
      if (d.extend === 'right') xr = Math.max(xr, m.w);
      lvs.forEach(function (lv) { lv.y = m.y(lv.price); });
      var ys = lvs.map(function (lv) { return lv.y; }).filter(function (v) { return !isNaN(v); });
      return { lvs: lvs, xl: xl, xr: xr, yt: ys.length ? Math.min.apply(null, ys) : NaN, yb: ys.length ? Math.max.apply(null, ys) : NaN };
    }
    function handlesOf(d, m) {
      var P = d.pts, xs = P.map(function (q) { return m.x(q.t); }), ys = P.map(function (q) { return m.y(q.p); });
      if (d.tool === 'hline') {
        if (d.extend === 'none') return [{ i: 0, x: xs[0], y: ys[0] }, { i: 1, x: xs[1], y: ys[0] }];
        return [{ i: 0, x: d.extend === 'right' ? xs[0] : Math.max(24, Math.min(m.w - 24, xs[0])), y: ys[0] }];
      }
      if (d.tool === 'vline') return [{ i: 0, x: xs[0], y: Math.max(24, Math.min(m.h - 24, isNaN(ys[0]) ? m.h / 2 : ys[0])) }];
      if (d.tool === 'text' || d.tool === 'brush') return [];
      if (d.tool === 'rect' || d.tool === 'ellipse') return rectHandles(xs[0], ys[0], xs[1], ys[1]);
      if (d.tool === 'long' || d.tool === 'short') return [{ i: 0, x: xs[0], y: ys[0] }, { i: 1, x: xs[1], y: ys[1] }, { i: 2, x: xs[2], y: ys[2] }, { i: 3, x: xs[1], y: ys[0] }];
      if (d.tool === 'channel') { var cy = channelYs(d, m); return [{ i: 0, x: xs[0], y: ys[0] }, { i: 1, x: xs[1], y: ys[1] }, { i: 2, x: (xs[0] + xs[1]) / 2, y: (cy[0] + cy[1]) / 2 }]; }
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
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = d.dash === 'dotted' ? 'round' : 'butt'; ctx.lineJoin = 'round'; ctx.setLineDash(dashOf(d, w));
      var b = null;
      // a tool with three points while its second point is being placed: the first leg only
      if (d.tool !== 'brush' && P.length < NPTS[d.tool]) {
        poly(ctx, x, y, false); ctx.stroke();
        if (selected) drawHandles(ctx, P.map(function (q, i) { return { i: i, x: x[i], y: y[i] }; }), c);
        return;
      }
      switch (d.tool) {
        case 'trend':
          var L = extendLine(x[0], y[0], x[1], y[1], m.w, m.h, d.extend); line(ctx, L[0], L[1], L[2], L[3]);
          if (d.stats) label(ctx, statsText(d, m), x[1] + 10, y[1] + (y[1] >= y[0] ? 14 : -14), '#fff', 'left', withAlpha(cc, 0.92), m.w);
          break;
        case 'arrow': line(ctx, x[0], y[0], x[1], y[1]); arrowHead(ctx, x[0], y[0], x[1], y[1], w, c); break;
        case 'ray': var e = rayEnd(x[0], y[0], x[1], y[1], m.w, m.h); line(ctx, x[0], y[0], e.x, e.y); break;
        case 'hline': var hs = hlineSpan(d, x, m.w); line(ctx, hs[0], y[0], hs[1], y[0]); break;
        case 'vline': line(ctx, x[0], 0, x[0], m.h); break;
        case 'rect':
          var rl = Math.min(x[0], x[1]), rr = d.extend === 'right' ? Math.max(m.w, rl) : Math.max(x[0], x[1]), rt = Math.min(y[0], y[1]), rh = Math.abs(y[1] - y[0]);
          if (fa) { ctx.fillStyle = withAlpha(cc, fa); ctx.fillRect(rl, rt, rr - rl, rh); }
          ctx.strokeRect(rl, rt, rr - rl, rh); break;
        case 'ellipse':
          ctx.beginPath(); ctx.ellipse((x[0] + x[1]) / 2, (y[0] + y[1]) / 2, Math.max(0.5, Math.abs(x[1] - x[0]) / 2), Math.max(0.5, Math.abs(y[1] - y[0]) / 2), 0, 0, Math.PI * 2);
          if (fa) { ctx.fillStyle = withAlpha(cc, fa); ctx.fill(); }
          ctx.stroke(); break;
        case 'triangle':
          poly(ctx, x, y, true);
          if (fa) { ctx.fillStyle = withAlpha(cc, fa); ctx.fill(); }
          ctx.stroke(); break;
        case 'brush':
          ctx.lineCap = 'round'; poly(ctx, x, y, false); ctx.stroke();
          if (selected) {
            var bl = Math.min.apply(null, x) - 4, br = Math.max.apply(null, x) + 4, bt = Math.min.apply(null, y) - 4, bb = Math.max.apply(null, y) + 4;
            ctx.save(); ctx.strokeStyle = withAlpha(cc, 0.6); ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.strokeRect(bl, bt, br - bl, bb - bt); ctx.restore();
          }
          break;
        case 'channel':
          var cy = channelYs(d, m), my0 = (y[0] + cy[0]) / 2, my1 = (y[1] + cy[1]) / 2;
          if (fa) { poly(ctx, [x[0], x[1], x[1], x[0]], [y[0], y[1], cy[1], cy[0]], true); ctx.fillStyle = withAlpha(cc, fa); ctx.fill(); }
          line(ctx, x[0], y[0], x[1], y[1]); line(ctx, x[0], cy[0], x[1], cy[1]);
          ctx.save(); ctx.lineWidth = 1; ctx.setLineDash([4, 4]); line(ctx, x[0], my0, x[1], my1); ctx.restore();
          break;
        case 'pitchfork':
          var pl = pitchforkLines(x, y, m.w, m.h);
          if (pl.length) {
            if (fa) { poly(ctx, [pl[1][0], pl[1][2], pl[2][2], pl[2][0]], [pl[1][1], pl[1][3], pl[2][3], pl[2][1]], true); ctx.fillStyle = withAlpha(cc, fa); ctx.fill(); }
            pl.forEach(function (s) { line(ctx, s[0], s[1], s[2], s[3]); });
          }
          ctx.save(); ctx.lineWidth = 1; ctx.setLineDash([4, 4]); line(ctx, x[1], y[1], x[2], y[2]); ctx.restore();
          break;
        case 'fib': case 'fibext':
          var fg = fibGeom(d, m, x), lo = Math.min.apply(null, d.levels || defLevels(d.tool)), hi = Math.max.apply(null, d.levels || defLevels(d.tool));
          fg.lvs.forEach(function (lv, k) {
            var yy = lv.y; if (isNaN(yy)) return;
            if (k > 0 && fa) { var yp = fg.lvs[k - 1].y; ctx.fillStyle = withAlpha(cc, k % 2 ? fa * 0.7 : fa * 1.2); ctx.fillRect(fg.xl, Math.min(yy, yp), fg.xr - fg.xl, Math.abs(yy - yp)); }
            ctx.lineWidth = lv.level === lo || lv.level === hi ? w + 0.5 : w; line(ctx, fg.xl, yy, fg.xr, yy);
            label(ctx, lv.level + ' · ' + opts.fmt(lv.price), fg.xl + 4, yy - 8, c, 'left');
          });
          ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
          if (d.tool === 'fibext') { poly(ctx, x, y, false); ctx.stroke(); } else line(ctx, x[0], y[0], x[1], y[1]);
          ctx.setLineDash([]);
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
        case 'callout':
          b = drawCallout(ctx, d.text || '', d.size || 13, x[0], y[0], x[1], y[1], cc, (editor && editor.id === d.id) || !d.text);
          break;
        case 'measure':
          var ms = measureStats(d, m.bars, m.tf), upM = ms.dp >= 0, mc = upM ? '#38bdf8' : '#f472b6';
          if (fa) { ctx.fillStyle = withAlpha(mc, fa); ctx.fillRect(Math.min(x[0], x[1]), Math.min(y[0], y[1]), Math.abs(x[1] - x[0]), Math.abs(y[1] - y[0])); }
          ctx.strokeStyle = mc; ctx.lineWidth = w; line(ctx, x[0], y[0], x[1], y[1]);
          label(ctx, statsText(d, m), (x[0] + x[1]) / 2, Math.min(y[0], y[1]) - 14, '#fff', 'center', mc, m.w);
          break;
      }
      if (b) boxes[d.id] = b;
      if (selected) drawHandles(ctx, handlesOf(d, m), c);
    }
    // the callout: a bubble at (bx, by) (its left edge, vertically centered) with a wedge pointing at (ax, ay). Returns its box.
    // `editing`: the in-place input covers the bubble; only the wedge is drawn.
    function drawCallout(ctx, text, fs, ax, ay, bx, by, bg, editing) {
      ctx.save(); ctx.setLineDash([]);
      ctx.font = '600 ' + fs + 'px "Geist", system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      var tw = text ? ctx.measureText(text).width : 60, padX = 9, bh = Math.round(fs * 1.25 + 12), bw = tw + padX * 2;
      var box = { x1: bx, y1: by - bh / 2, x2: bx + bw, y2: by + bh / 2 }, cx = bx + bw / 2, cy = by;
      // the wedge: from the bubble's middle to the anchor, as wide as a third of the bubble's shorter side
      var dx = ax - cx, dy = ay - cy, L = Math.sqrt(dx * dx + dy * dy) || 1, half = Math.min(bw, bh) / 3, nx = -dy / L * half, ny = dx / L * half;
      ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(cx + nx, cy + ny); ctx.lineTo(ax, ay); ctx.lineTo(cx - nx, cy - ny); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(ax, ay, 2.5, 0, Math.PI * 2); ctx.fill();
      if (!editing) {
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(box.x1, box.y1, bw, bh, 6); else ctx.rect(box.x1, box.y1, bw, bh); ctx.fill();
        ctx.fillStyle = onColor(bg); ctx.fillText(text, bx + padX, by + 0.5);
      }
      ctx.restore();
      return box;
    }
    function drawHandles(ctx, hs, c) {
      ctx.setLineDash([]);
      hs.forEach(function (h) {
        ctx.beginPath();
        if (typeof h.i === 'string') ctx.rect(h.x - HANDLE_R + 0.5, h.y - HANDLE_R + 0.5, HANDLE_R * 2 - 1, HANDLE_R * 2 - 1); else ctx.arc(h.x, h.y, HANDLE_R, 0, Math.PI * 2);
        ctx.fillStyle = light() ? '#ffffff' : '#000000'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = c; ctx.stroke();
      });
    }
    function duration(sec) {
      // whole minutes first, so 59.6 minutes reads "1s 0dk" and never "60dk"
      var tm = Math.round(sec / 60), d = Math.floor(tm / 1440), h = Math.floor((tm % 1440) / 60), mi = tm % 60;
      return (d ? opts.t('backtest.draw.days', '{n}g', { n: d }) + ' ' : '') + (h || d ? opts.t('backtest.draw.hours', '{n}s', { n: h }) + ' ' : '') + opts.t('backtest.draw.minutes', '{n}dk', { n: mi });
    }
    var renderer = {
      draw: function (target) {
        var m = mapper(); if (!m) return;
        target.useMediaCoordinateSpace(function (scope) {
          var ctx = scope.context; boxes = {};
          ctx.save();
          if (!set.hidden()) own().forEach(function (d) { drawOne(ctx, d, m, d.id === set.selected()); });
          if (create) drawOne(ctx, create.d, m, true);
          // a new callout while its text is typed: the wedge from the anchor to the input
          if (editor && editor.anchor && !editor.id) {
            var ax = m.x(editor.anchor.t), ay = m.y(editor.anchor.p), bx = m.x(editor.at.t), by = m.y(editor.at.p);
            if (![ax, ay, bx, by].some(isNaN)) drawCallout(ctx, '', 13, ax, ay, bx, by, COLORS.callout, true);
          }
          ctx.restore();
        });
      }
    };
    var paneView = { renderer: function () { return renderer; }, zOrder: function () { return 'top'; } };
    // price axis labels of horizontal lines
    function axisViews() {
      if (set.hidden()) return [];
      return own().filter(function (d) { return d.tool === 'hline'; }).map(function (d) {
        var y = isFinite(d.pts[0].p) ? series.priceToCoordinate(d.pts[0].p) : null, c = colorOf(d);
        return { coordinate: function () { return y === null ? -100 : y; }, text: function () { return opts.fmt(d.pts[0].p); },
          textColor: function () { return '#ffffff'; }, backColor: function () { return c; }, visible: function () { return y !== null; }, tickVisible: function () { return true; } };
      });
    }
    // time axis labels of vertical lines
    function timeViews() {
      if (set.hidden()) return [];
      var m = mapper(); if (!m) return [];
      return own().filter(function (d) { return d.tool === 'vline'; }).map(function (d) {
        var x = m.x(d.pts[0].t), c = colorOf(d), txt = timeText(d.pts[0].t);
        return { coordinate: function () { return isNaN(x) ? -100 : x; }, text: function () { return txt; },
          textColor: function () { return onColor(c); }, backColor: function () { return c; }, visible: function () { return !isNaN(x) && x >= 0 && x <= m.w; }, tickVisible: function () { return true; } };
      });
    }
    var primitive = {
      attached: function (p) { api = p; },
      detached: function () { api = null; },
      paneViews: function () { return [paneView]; },
      priceAxisViews: axisViews,
      timeAxisViews: timeViews,
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
      var list = own(), selId = set.selected(), order = list.slice().reverse(), hr = touch ? TOUCH_HIT : HANDLE_HIT, tol = touch ? 12 : HIT_PX;
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
      var P = d.pts, xs = P.map(function (q) { return m.x(q.t); }), ys = P.map(function (q) { return m.y(q.p); }), filled = fillOf(d) > 0;
      if (xs.some(isNaN) || ys.some(isNaN)) return false;
      switch (d.tool) {
        case 'trend': var L = extendLine(xs[0], ys[0], xs[1], ys[1], m.w, m.h, d.extend); return distSeg(x, y, L[0], L[1], L[2], L[3]) <= tol;
        case 'arrow': return distSeg(x, y, xs[0], ys[0], xs[1], ys[1]) <= tol;
        case 'ray': var e = rayEnd(xs[0], ys[0], xs[1], ys[1], m.w, m.h); return distSeg(x, y, xs[0], ys[0], e.x, e.y) <= tol;
        case 'hline': var hs = hlineSpan(d, xs, m.w); return Math.abs(y - ys[0]) <= tol && x >= hs[0] - tol && x <= hs[1] + tol;
        case 'vline': return Math.abs(x - xs[0]) <= tol;
        case 'rect':
          var rr = d.extend === 'right' ? Math.max(m.w, xs[0], xs[1]) : Math.max(xs[0], xs[1]), rl = Math.min(xs[0], xs[1]);
          // a filled box is grabbed anywhere inside; an empty one on its outline
          if (filled) return inBox(x, y, rl, ys[0], rr, ys[1], tol);
          return inBox(x, y, rl, ys[0], rr, ys[1], tol) && !inBox(x, y, rl, ys[0], rr, ys[1], -tol);
        case 'ellipse': var eh = ellipseHit(x, y, xs[0], ys[0], xs[1], ys[1], tol); return eh === 'edge' || (eh === 'in' && filled);
        case 'triangle': return nearPath(x, y, xs, ys, true, tol) || (filled && inPoly(x, y, xs, ys));
        case 'brush': return nearPath(x, y, xs, ys, false, tol + widthOf(d) / 2);
        case 'fib': case 'fibext':
          // every level counts (also the ones past 0 and 1, e.g. 1.618), filled: anywhere between the outer levels
          var fg = fibGeom(d, m, xs);
          if (d.tool === 'fibext' && nearPath(x, y, xs, ys, false, tol)) return true;
          if (isNaN(fg.yt) || x < fg.xl - tol || x > fg.xr + tol) return false;
          if (filled && y >= fg.yt - tol && y <= fg.yb + tol) return true;
          return fg.lvs.some(function (lv) { return !isNaN(lv.y) && Math.abs(y - lv.y) <= tol; });
        case 'channel':
          var cy = channelYs(d, m), cxs = [xs[0], xs[1], xs[1], xs[0]], cys = [ys[0], ys[1], cy[1], cy[0]];
          return distSeg(x, y, xs[0], ys[0], xs[1], ys[1]) <= tol || distSeg(x, y, xs[0], cy[0], xs[1], cy[1]) <= tol || (filled && inPoly(x, y, cxs, cys));
        case 'pitchfork':
          var pl = pitchforkLines(xs, ys, m.w, m.h);
          if (distSeg(x, y, xs[1], ys[1], xs[2], ys[2]) <= tol || pl.some(function (s) { return distSeg(x, y, s[0], s[1], s[2], s[3]) <= tol; })) return true;
          return filled && pl.length === 3 && inPoly(x, y, [pl[1][0], pl[1][2], pl[2][2], pl[2][0]], [pl[1][1], pl[1][3], pl[2][3], pl[2][1]]);
        case 'measure': return inBox(x, y, xs[0], ys[0], xs[1], ys[1], tol);
        case 'long': case 'short': return inBox(x, y, xs[0], Math.min(ys[1], ys[2]), xs[1], Math.max(ys[1], ys[2]), 3);
        case 'text': var b = boxes[d.id]; return !!b && inBox(x, y, b.x1, b.y1, b.x2, b.y2, 3);
        case 'callout':
          var cb = boxes[d.id]; if (cb && inBox(x, y, cb.x1, cb.y1, cb.x2, cb.y2, 3)) return true;
          return !!cb && distSeg(x, y, xs[0], ys[0], (cb.x1 + cb.x2) / 2, (cb.y1 + cb.y2) / 2) <= tol;
      }
      return false;
    }

    // --- pointer interaction: create (drag, or click-move-click; three-point tools take one more click), select, move, resize;
    // Esc / pointercancel undo the gesture
    function local(e) { var r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function inPane(pt, m) { return m && pt.x >= 0 && pt.y >= 0 && pt.x < m.w && pt.y < m.h; }
    function model(pt, m, useMagnet) {
      var t = m.t(pt.x), p = m.p(pt.y);
      if (useMagnet && ctl.magnet()) { var s = magnet(m.bars, m.l(pt.x), p); if (s) return s; }
      return { t: t, p: p };
    }
    // a point with Shift: lines lock to 0/45/90°, boxes become squares (ellipses circles) (around `anchor`, a model point)
    function constrained(tool, anchor, pt, m, shift) {
      if (shift && (tool === 'trend' || tool === 'ray' || tool === 'arrow')) {
        var lk = lockAngle(m.x(anchor.t), m.y(anchor.p), pt.x, pt.y);
        if (lk.kind === 'h') return { t: m.t(lk.x), p: anchor.p };
        if (lk.kind === 'v') return { t: anchor.t, p: m.p(lk.y) };
        return { t: m.t(lk.x), p: m.p(lk.y) };
      }
      if (tool === 'hline') return { t: model(pt, m, true).t, p: anchor.p };
      if (shift && (tool === 'rect' || tool === 'ellipse')) {
        var sq = squareBox(m.x(anchor.t), m.y(anchor.p), pt.x, pt.y);
        return { t: m.t(sq.x), p: m.p(sq.y) };
      }
      return model(pt, m, true);
    }
    // the channel's width from the pointer: the price the parallel line gets above the first point
    function channelPrice(d, pt, m) {
      var q = model(pt, m, true), x0 = m.x(d.pts[0].t), x1 = m.x(d.pts[1].t);
      return d.pts[0].p + (q.p - priceOnLine(x0, d.pts[0].p, x1, d.pts[1].p, pt.x));
    }
    // the point being placed while creating follows the pointer
    function placeLast(pt, m, shift) {
      var d = create.d, k = d.pts.length - 1;
      if (d.tool === 'channel' && k === 2) d.pts[2] = { t: d.pts[0].t, p: channelPrice(d, pt, m) };
      else d.pts[k] = constrained(d.tool, d.pts[k === 1 ? 0 : k - 1], pt, m, shift);
    }
    function setInteractive(on) {
      if (on === interactive) return;
      interactive = on;
      // a copy: chart.options() hands out the chart's own objects, which applyOptions(false) then turns off in place
      if (!on) { var o = chart.options(); saved = clone({ handleScroll: o.handleScroll, handleScale: o.handleScale }); chart.applyOptions({ handleScroll: false, handleScale: false }); }
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
      // a callout gets its text first: the input opens at the bubble's place (nothing is created when it stays empty)
      if (c.d.tool === 'callout') { openEditor({ id: null, newId: c.d.id, at: c.d.pts[1], anchor: c.d.pts[0], text: '' }); return; }
      ctl.created(c.d);
    }
    // the brush stroke ends: thinned on screen, then turned into time/price points (a tap without a stroke draws nothing)
    function finishBrush() {
      var c = create, m = mapper(); create = null; refresh();
      if (!c) return;
      release(c.pid);
      if (!m || c.raw.length < 2) return;
      var pts = thinStroke(c.raw, MAX_BRUSH).map(function (q) { return { t: m.t(q.x), p: m.p(q.y) }; });
      c.d.pts = pts;
      ctl.created(c.d);
    }
    // the first leg of a three-point tool is done: one more point follows the pointer until the next click
    function nextStage() {
      var d = create.d;
      if (d.tool === 'channel') d.pts.push({ t: d.pts[0].t, p: d.pts[0].p });
      else d.pts.push({ t: d.pts[1].t, p: d.pts[1].p });
      create.dragging = false; create.wait = true;
      if (last) { var m = mapper(); if (m) placeLast(last.pt, m, last.shift); }
      refresh();
    }
    function onDown(e) {
      if (editor && e.target === editor.input) return;
      if (editor) closeEditor(true);
      if (e.button !== 0) return;
      var m = mapper(), pt = local(e), touch = e.pointerType === 'touch';
      if (!inPane(pt, m)) return;
      last = { pt: pt, shift: e.shiftKey };
      var tool = ctl.tool();
      if (create && create.wait) {
        consume(e); placeLast(pt, m, e.shiftKey);
        if (create.d.pts.length < NPTS[create.d.tool]) nextStage(); else finishCreate();
        return;
      }
      if (tool !== 'cursor') {
        consume(e);
        if (!ctl.allowed(tool)) { ctl.denied(tool); return; }
        var q = model(pt, m, true), id = ctl.newId();
        var ext = tool === 'hline' ? ctl.hlineMode() : null;
        if (tool === 'hline' && ext !== 'none') { create = { d: mark({ id: id, tool: tool, pts: [q], color: null, extend: ext }) }; finishCreate(); return; }
        if (tool === 'vline') { create = { d: mark({ id: id, tool: tool, pts: [q], color: null }) }; finishCreate(); return; }
        if (tool === 'text') { openEditor({ id: null, newId: id, at: q, text: '' }); return; }
        if (tool === 'long' || tool === 'short') {
          var unit = Math.abs(m.p(0) - m.p(m.h)) * 0.06 || Math.abs(q.p) * 0.002;
          var end = logicalToTime(m.bars, m.tf, timeToLogical(m.bars, m.tf, q.t) + 20);
          create = { d: mark({ id: id, tool: tool, pts: newPosition(tool, q.t, q.p, unit, m.tf, end), color: null }) }; finishCreate(); return;
        }
        if (tool === 'brush') {
          var q0 = model(pt, m, false);
          create = { d: mark({ id: id, tool: tool, pts: [q0, { t: q0.t, p: q0.p }], color: null }), raw: [pt], brush: true, dragging: true, pid: e.pointerId };
          capture(e); refresh(); return;
        }
        create = { d: mark({ id: id, tool: tool, pts: [q, { t: q.t, p: q.p }], color: null, extend: ext || undefined }), down: pt, dragging: true, pid: e.pointerId };
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
      // Alt (Option) + drag: a copy is moved and the original stays (like most drawing apps)
      drag = { id: hit.id, handle: hit.handle, start: pt, l0: m.l(pt.x), p0: m.p(pt.y), orig: clone(d), moved: false, pid: e.pointerId, clone: e.altKey && hit.handle === -1 };
      capture(e);
      setCursor(typeof hit.handle === 'string' ? CURSORS[hit.handle] : 'grabbing');
    }
    // the gesture in progress follows the pointer (also called when Shift goes down or up without a move)
    function update() {
      var m = mapper(); if (!m || !last) return;
      var pt = last.pt, shift = last.shift;
      if (drag) {
        if (!drag.moved && Math.abs(pt.x - drag.start.x) + Math.abs(pt.y - drag.start.y) < 3) return;
        if (!drag.moved && drag.clone) {
          // the copy takes the original's place in the set while it is dragged; the original is put back when the drag ends
          var copy = clone(drag.orig); copy.id = ctl.newId(); copy.locked = false;
          var added = set.add(copy); if (!added) { drag.clone = false; } else { drag.id = added.id; drag.orig = clone(added); set.select(added.id); }
        }
        drag.moved = true;
        var o = drag.orig, h = drag.handle, nd;
        if (typeof h === 'string') {
          if (shift && h.length === 2) {
            var xs = o.pts.map(function (q) { return m.x(q.t); }), ys = o.pts.map(function (q) { return m.y(q.p); });
            var opp = oppositeCorner(h, xs[0], ys[0], xs[1], ys[1]), sq = squareBox(opp.x, opp.y, pt.x, pt.y);
            nd = resizeRect(o, h, m.t(sq.x), m.p(sq.y));
          } else { var qr = model(pt, m, true); nd = resizeRect(o, h, qr.t, qr.p); }
        } else if (h >= 0) {
          if (o.tool === 'channel' && h === 2) nd = setHandle(o, 2, o.pts[0].t, channelPrice(o, pt, m), m.tf);
          else if (o.tool === 'vline') nd = setHandle(o, 0, model(pt, m, true).t, o.pts[0].p, m.tf);
          else {
            var other = o.tool === 'trend' || o.tool === 'ray' || o.tool === 'arrow' ? o.pts[1 - h] : null;
            var q = other ? constrained(o.tool, other, pt, m, shift) : model(pt, m, true);
            nd = setHandle(o, h, q.t, q.p, m.tf);
          }
        } else {
          var dl = m.l(pt.x) - drag.l0, dp = m.p(pt.y) - drag.p0;
          if (shift) { if (Math.abs(pt.x - drag.start.x) >= Math.abs(pt.y - drag.start.y)) dp = 0; else dl = 0; }
          nd = moveBy(o, m.bars, m.tf, dl, dp);
        }
        set.put(nd, true);
        return;
      }
      if (create && create.brush && create.dragging) {
        var lr = create.raw[create.raw.length - 1];
        if (Math.abs(pt.x - lr.x) + Math.abs(pt.y - lr.y) >= 2 && create.raw.length < 4000) {
          create.raw.push(pt);
          var qb = { t: m.t(pt.x), p: m.p(pt.y) };
          if (create.raw.length === 2) create.d.pts[1] = qb; else create.d.pts.push(qb);
          refresh();
        }
        return;
      }
      if (create && (create.dragging || create.wait)) { placeLast(pt, m, shift); refresh(); }
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
      if (dd.clone && !commit) { set.remove(dd.id); idleCursor(); return; }     // a cancelled Alt-drag leaves no copy
      if (commit) { var cur = set.get(dd.id); if (cur) set.put(cur, false); }
      else set.put(dd.orig, true);                          // back to where it was, nothing saved
      idleCursor();
    }
    function onUp(e) {
      if (drag) { consume(e); last = { pt: local(e), shift: e.shiftKey }; update(); endDrag(true); return; }
      if (create && create.brush) { consume(e); last = { pt: local(e), shift: e.shiftKey }; update(); finishBrush(); return; }
      if (create && create.dragging) {
        consume(e);
        var pt = local(e), moved = Math.abs(pt.x - create.down.x) + Math.abs(pt.y - create.down.y) > 4;
        last = { pt: pt, shift: e.shiftKey }; update();
        create.dragging = false; release(create.pid);
        if (!moved) { create.wait = true; return; }        // click, move, click
        if (create.d.pts.length < NPTS[create.d.tool]) nextStage(); else finishCreate();
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
    // double click: text and callout -> edit in place, any other drawing -> settings
    function onDbl(e) {
      if (ctl.tool() !== 'cursor' || create) return;
      var h = hitAt(e); if (!h) return;
      consume(e); set.select(h.id);
      var d = set.get(h.id);
      if (d && TEXTUAL[d.tool] && !d.locked && !set.lockAll()) editText(d.id);
      else ctl.openPop(h.id, e.clientX, e.clientY);
    }

    // --- text in place: an input over the chart at the text's spot (Enter keeps, Esc drops, leaving the field keeps).
    // o: { id (an existing text/callout) | newId, at (model point), anchor (a new callout's arrow point), text }
    function openEditor(o) {
      closeEditor(true);
      var m = mapper(); if (!m) return;
      var d = o.id ? set.get(o.id) : null, callout = d ? d.tool === 'callout' : !!o.anchor;
      var at = d ? d.pts[callout ? 1 : 0] : o.at, fs = (d && d.size) || 13;
      var inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'bt-draw-edit' + (callout ? ' bt-draw-edit-callout' : ''); inp.maxLength = MAX_TEXT; inp.value = o.text || '';
      inp.placeholder = opts.t('backtest.draw.text_placeholder', 'Metin yaz, Enter');
      inp.setAttribute('aria-label', opts.t('backtest.draw.text_label', 'Grafiğe yazılacak metin'));
      inp.style.left = Math.round(m.x(at.t) - (callout ? 0 : 4)) + 'px'; inp.style.top = Math.round(m.y(at.p) - fs * 0.75 - 4) + 'px';
      inp.style.font = '600 ' + fs + 'px "Geist", system-ui, sans-serif'; inp.style.color = d && !callout ? colorOf(d) : textColor();
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      el.appendChild(inp);
      editor = { id: o.id, newId: o.newId, at: at, anchor: o.anchor || null, input: inp };
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
        if (!ed.id) {
          if (txt) ctl.created(mark(ed.anchor ? { id: ed.newId, tool: 'callout', pts: [ed.anchor, ed.at], text: txt, color: null }
            : { id: ed.newId, tool: 'text', pts: [ed.at], text: txt, color: null }));
          else if (!ctl.stay()) ctl.setTool('cursor');
        } else { var cur = set.get(ed.id); if (cur && txt && txt !== cur.text) { var n = clone(cur); n.text = txt; set.put(n); } else if (cur && !txt) set.remove(cur.id); }
      } else if (!ed.id && !ctl.stay()) ctl.setTool('cursor');
      refresh();
    }
    function editText(id) { var d = set.get(id); if (d && TEXTUAL[d.tool]) openEditor({ id: id, text: d.text }); }

    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('pointermove', onMove, true);
    el.addEventListener('pointerup', onUp, true);
    el.addEventListener('pointercancel', onCancel, true);
    el.addEventListener('contextmenu', onContext, true);
    el.addEventListener('dblclick', onDbl, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);

    return {
      pane: pane,
      refresh: refresh,
      toolChanged: function () {
        if (create) { release(create.pid); create = null; refresh(); }
        if (editor && !editor.id) closeEditor(true);
        setInteractive(ctl.tool() === 'cursor' && !drag && !editor); idleCursor();
      },
      cancel: cancel,
      busy: function () { return !!(create || drag || editor); },
      editText: editText,
      // the time `n` bars after `t` on this chart (NaN without candles)
      later: function (t, n) { var m = mapper(); return m ? logicalToTime(m.bars, m.tf, timeToLogical(m.bars, m.tf, t) + n) : NaN; },
      // a copy of a drawing moved `n` bars to the right on this chart (paste, clone); null without candles
      shifted: function (d, n) { var m = mapper(); return m ? moveBy(d, m.bars, m.tf, n, 0) : null; },
      hasDraft: function () { return !!create; },
      destroy: function () {
        if (drag) { var dd = drag; drag = null; if (dd.clone && dd.moved) set.remove(dd.id); else set.put(dd.orig, true); }   // a chart rebuilt mid-drag leaves no half-moved drawing
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
    // hline: the length mode a new horizontal line gets (the last one chosen); groups: the toolbar buttons (see normalizeGroups)
    // stay: a tool stays picked after a drawing (TradingView's "stay in drawing mode"); defaults: the style a tool's new drawings
    // start with ("set as default" in the settings), per tool
    var ui = { magnet: false, hidden: false, lockAll: false, stay: false, hline: 'both', groups: defaultGroups(), defaults: {} };
    try {
      var u = JSON.parse((opts.local && opts.local.getItem(UI_KEY)) || '{}'); ui.magnet = u.magnet === true; ui.hidden = u.hidden === true; ui.lockAll = u.lockAll === true;
      ui.stay = u.stay === true;
      if (EXTENDS.indexOf(u.hline) >= 0) ui.hline = u.hline;
      ui.groups = normalizeGroups(u.groups);
      ui.defaults = cleanDefaults(u.defaults);
    } catch (e) { /* defaults */ }
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
      if (id !== 'cursor') { closePop(); var gi = groupOf(ui.groups, id); if (gi >= 0 && ui.groups[gi].c !== id) { ui.groups[gi].c = id; saveUi(); } }
      closeFly();
      layers.forEach(function (l) { l.toolChanged(); });
      renderBar();
    }
    function created(d) {
      if (set.list().length >= MAX_DRAWINGS) { opts.toast(opts.t('backtest.draw.too_many', 'En fazla {n} çizim olabilir.', { n: MAX_DRAWINGS }), 'warning'); setTool('cursor'); return; }
      var def = ui.defaults[d.tool];
      if (def) Object.keys(def).forEach(function (k) { if (d[k] === undefined || d[k] === null) d[k] = def[k]; });
      var added = set.add(d);
      if (ui.stay) { renderBar(); return; }                // the tool stays picked for the next drawing
      setTool('cursor');
      if (added) set.select(added.id);
    }
    // copy and paste (Ctrl/Cmd+C, Ctrl/Cmd+V) and "clone": a copy a few bars to the right, on the chart of the original
    var clip = null;
    function cloneOf(d) {
      var l = layerOf(d), n = l ? l.shifted(d, 3) : null; if (!n) return null;
      n.id = opts.newId(); n.locked = false; return n;
    }
    function paste(src) {
      if (!src) return false;
      if (set.list().length >= MAX_DRAWINGS) { opts.toast(opts.t('backtest.draw.too_many', 'En fazla {n} çizim olabilir.', { n: MAX_DRAWINGS }), 'warning'); return true; }
      var n = cloneOf(src); if (!n) return false;
      var added = set.add(n); if (added) { set.select(added.id); clip = clone(added); }   // pasting again puts the next copy further right
      return true;
    }
    function setDefault(d) {
      var keep = {}; STYLE_DEFAULT_KEYS.forEach(function (k) { if (d[k] !== undefined && d[k] !== null && !(d.tool === 'hline' && k === 'extend')) keep[k] = d[k]; });
      ui.defaults[d.tool] = keep; saveUi();
      opts.toast(opts.t('backtest.draw.default_saved', 'Yeni {tool} çizimleri bu stille başlayacak.', { tool: opts.t('backtest.draw.tool_' + d.tool, d.tool) }), 'success');
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
    function toolKey(id) { var i = TOOLS.indexOf(id); return i >= 0 && i < 9 ? String(i + 1) : ''; }
    function toolName(id) { var k = toolKey(id); return opts.t('backtest.draw.tool_' + id, id) + (k ? ' (' + k + ')' : ''); }
    function mod() { return /Mac|iPhone|iPad/.test((global.navigator && global.navigator.platform) || '') ? '⌘' : 'Ctrl+'; }
    function renderBar() {
      var bar = opts.bar; if (!bar) return;
      bar.textContent = '';
      bar.appendChild(btn('', 'mouse-pointer-2', opts.t('backtest.draw.cursor', 'İmleç') + ' (V)', { 'data-tool': 'cursor', 'aria-pressed': tool === 'cursor' ? 'true' : 'false' }));
      ui.groups.forEach(function (g, gi) {
        var id = g.t.indexOf(tool) >= 0 ? tool : g.c;
        var b = btn('', ICONS[id], toolName(id), { 'data-tool': id, 'data-group': gi, 'data-tools': g.t.join(' '), 'aria-pressed': g.t.indexOf(tool) >= 0 ? 'true' : 'false' });
        if (!allowed(id)) { var s = document.createElement('span'); s.className = 'bt-pro bt-draw-pro'; s.textContent = 'PRO'; b.appendChild(s); b.setAttribute('data-pro', '1'); }
        if (g.t.length > 1) {
          var mo = document.createElement('span'); mo.className = 'bt-draw-more'; mo.setAttribute('data-more', gi); mo.setAttribute('aria-hidden', 'true'); b.appendChild(mo);
          b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', fly && fly.gi === gi ? 'true' : 'false');
        }
        bar.appendChild(b);
      });
      bar.appendChild(sep());
      bar.appendChild(btn('', 'magnet', opts.t('backtest.draw.magnet', 'Mıknatıs') + ' (M)', { 'data-act': 'magnet', 'aria-pressed': ui.magnet ? 'true' : 'false' }));
      bar.appendChild(btn('', 'pen-line', opts.t('backtest.draw.stay', 'Çizim modunda kal'), { 'data-act': 'stay', 'aria-pressed': ui.stay ? 'true' : 'false' }));
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
    // grid's width follows the real column count). In its own window (data-fit="width") the window's width sets the columns instead.
    function fitBar() {
      var bar = opts.bar; if (!bar || getComputedStyle(bar).display !== 'grid') { if (bar) bar.style.gridTemplateRows = ''; return; }
      var v;
      if (bar.getAttribute('data-fit') === 'width') {
        var w = bar.clientWidth; if (!w) return;
        v = 'repeat(' + Math.ceil(bar.children.length / Math.max(1, Math.floor((w + 3) / 37))) + ', 32px)';
      } else {
        var h = bar.clientHeight; if (!h) return;
        v = 'repeat(' + Math.max(1, Math.floor((h - 4 + 2) / 34)) + ', 32px)';
      }
      if (bar.style.gridTemplateRows !== v) bar.style.gridTemplateRows = v;
    }
    var ro = null, roFrame = 0;
    // next frame, not inside the observer callback (changing the width there would loop the observer)
    if (opts.bar && global.ResizeObserver) { ro = new global.ResizeObserver(function () { cancelAnimationFrame(roFrame); roFrame = requestAnimationFrame(fitBar); }); ro.observe(opts.bar); }
    function sep() { var s = document.createElement('span'); s.className = 'bt-draw-sep'; s.setAttribute('aria-hidden', 'true'); return s; }
    function layerOf(d) { return layers.filter(function (x) { return x.pane === paneOf(d); })[0] || null; }
    function editTextOf(d) { var l = layerOf(d); if (l) l.editText(d.id); }
    // length mode of a horizontal line; a segment ends SEG_BARS bars after its start until its end handle is dragged
    function setHlineMode(d, mode) {
      if (EXTENDS.indexOf(mode) < 0) return;
      var patch = { extend: mode === 'both' ? undefined : mode };
      if (mode === 'none' && d.pts.length < 2) {
        var l = layerOf(d), t1 = l ? l.later(d.pts[0].t, SEG_BARS) : NaN; if (!isFinite(t1)) return;
        patch.pts = [d.pts[0], { t: t1, p: d.pts[0].p }];
      }
      ui.hline = mode; saveUi();
      edit(d, patch);
    }
    function onBarClick(e) {
      if (dnd && dnd.done) { dnd = null; return; }                 // the click that ends a drag
      var b = e.target.closest('button'); if (!b || !opts.bar.contains(b)) return;
      if (e.target.closest('[data-more]')) return toggleFly(+b.getAttribute('data-group'), b);
      var t = b.getAttribute('data-tool');
      if (t) return setTool(tool === t && t !== 'cursor' ? 'cursor' : t);
      var a = b.getAttribute('data-act'), d = selected();
      if (a === 'magnet') { ui.magnet = !ui.magnet; saveUi(); renderBar(); }
      else if (a === 'stay') { ui.stay = !ui.stay; saveUi(); renderBar(); }
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

    // ---- group menu: the tools of a button (corner, right click, arrow keys), reset of the toolbar, a hint about drag and drop
    var fly = null, dnd = null;
    function setGroups(g) { ui.groups = normalizeGroups(g); saveUi(); renderBar(); }
    function closeFly(focusBack) {
      if (!fly) return;
      var f = fly; fly = null;
      if (f.el.parentNode) f.el.parentNode.removeChild(f.el);
      document.removeEventListener('pointerdown', f.outside, true);
      var b = opts.bar && opts.bar.querySelector('[data-group="' + f.gi + '"]');
      if (b && b.hasAttribute('aria-expanded')) b.setAttribute('aria-expanded', 'false');
      if (focusBack && b) try { b.focus(); } catch (e) { /* ignore */ }
    }
    function toggleFly(gi, anchor) { if (fly && fly.gi === gi) closeFly(); else openFly(gi, anchor); }
    function openFly(gi, anchor, focusFirst) {
      closeFly();
      var g = ui.groups[gi]; if (!g || !anchor) return;
      var box = document.createElement('div'); box.className = 'bt-draw-fly'; box.setAttribute('role', 'menu');
      box.setAttribute('aria-label', opts.t('backtest.draw.toolbar', 'Çizim araçları'));
      g.t.forEach(function (id) {
        var it = document.createElement('button'); it.type = 'button'; it.className = 'bt-draw-fly-item'; it.setAttribute('role', 'menuitemradio');
        it.setAttribute('data-fly-tool', id); it.setAttribute('aria-checked', tool === id ? 'true' : 'false');
        var ic = document.createElement('i'); ic.setAttribute('data-lucide', ICONS[id]); ic.setAttribute('aria-hidden', 'true'); it.appendChild(ic);
        var lb = document.createElement('span'); lb.textContent = opts.t('backtest.draw.tool_' + id, id); it.appendChild(lb);
        if (!allowed(id)) { var pro = document.createElement('span'); pro.className = 'bt-pro'; pro.textContent = 'PRO'; it.appendChild(pro); }
        if (toolKey(id)) { var kb = document.createElement('kbd'); kb.textContent = toolKey(id); it.appendChild(kb); }
        box.appendChild(it);
      });
      var sp = document.createElement('div'); sp.className = 'bt-draw-fly-sep'; box.appendChild(sp);
      var rs = document.createElement('button'); rs.type = 'button'; rs.className = 'bt-draw-fly-item bt-draw-fly-reset'; rs.setAttribute('role', 'menuitem'); rs.setAttribute('data-fly-act', 'reset');
      rs.textContent = opts.t('backtest.draw.bar_reset', 'Araç çubuğunu varsayılana döndür'); rs.disabled = isDefaultGroups(ui.groups); box.appendChild(rs);
      var hint = document.createElement('p'); hint.className = 'bt-draw-fly-hint';
      hint.textContent = opts.t('backtest.draw.bar_hint', 'Sürükleyerek sırala. Bir aracı başka bir düğmenin üstüne bırakınca o gruba girer, çubukta boş bir yere bırakınca tek başına düğme olur.');
      box.appendChild(hint);
      document.body.appendChild(box);
      opts.icons();
      fly = { gi: gi, el: box, outside: function (e) { if (fly && !box.contains(e.target) && !(opts.bar && opts.bar.contains(e.target))) closeFly(); } };
      document.addEventListener('pointerdown', fly.outside, true);
      if (anchor.hasAttribute('aria-expanded')) anchor.setAttribute('aria-expanded', 'true');
      // next to the button: to its right on a vertical bar, under it on a horizontal one; inside the viewport
      var r = anchor.getBoundingClientRect(), vw = global.innerWidth || 1200, vh = global.innerHeight || 800, bw = box.offsetWidth, bh = box.offsetHeight;
      var x = r.right + 6, y = r.top;
      if (x + bw > vw - 8) { x = Math.max(8, Math.min(vw - bw - 8, r.left)); y = r.bottom + 6; }
      box.style.left = Math.round(x) + 'px'; box.style.top = Math.round(Math.max(8, Math.min(vh - bh - 8, y))) + 'px';
      box.addEventListener('click', onFlyClick);
      box.addEventListener('keydown', onFlyKey);
      if (focusFirst) { var first = box.querySelector('.bt-draw-fly-item'); if (first) try { first.focus(); } catch (e) { /* ignore */ } }
    }
    function onFlyClick(e) {
      if (dnd && dnd.done) { dnd = null; return; }
      var b = e.target.closest('button'); if (!b || !fly) return;
      var t = b.getAttribute('data-fly-tool');
      if (t) { closeFly(); setTool(t); return; }
      if (b.getAttribute('data-fly-act') === 'reset') { closeFly(); setGroups(defaultGroups()); }
    }
    function onFlyKey(e) {
      var items = [].slice.call(fly.el.querySelectorAll('.bt-draw-fly-item:not(:disabled)')), i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFly(true); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); var n = items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]; if (n) n.focus(); }
      else if (e.key === 'Tab') closeFly();
    }
    function onBarKey(e) {
      var b = e.target.closest && e.target.closest('[data-group]'); if (!b || !b.querySelector('[data-more]')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); openFly(+b.getAttribute('data-group'), b, true); }
    }
    function onBarContext(e) {
      var b = e.target.closest && e.target.closest('[data-group]'); if (!b || !opts.bar.contains(b)) return;
      e.preventDefault(); openFly(+b.getAttribute('data-group'), b);
    }

    // ---- drag and drop (mouse and pen; a touch keeps scrolling the bar): a button moves or joins another group, a tool from the menu
    // moves inside its group, joins another one or becomes its own button
    function onDragDown(e) {
      if (e.button !== 0 || e.pointerType === 'touch') return;
      if (dnd && dnd.done) dnd = null;
      var it = fly && e.target.closest && e.target.closest('.bt-draw-fly [data-fly-tool]');
      var b = !it && opts.bar && e.target.closest && e.target.closest('[data-group]');
      if (it) dnd = { kind: 'tool', tool: it.getAttribute('data-fly-tool'), from: fly.gi, src: it };
      else if (b && opts.bar.contains(b) && !e.target.closest('[data-more]')) dnd = { kind: 'group', tool: b.getAttribute('data-tool'), from: +b.getAttribute('data-group'), src: b };
      else return;
      dnd.x = e.clientX; dnd.y = e.clientY; dnd.on = false;
    }
    function onDragMove(e) {
      if (!dnd || dnd.done) return;
      if (!dnd.on) {
        if (Math.abs(e.clientX - dnd.x) + Math.abs(e.clientY - dnd.y) < 6) return;
        dnd.on = true;
        var gh = document.createElement('div'); gh.className = 'bt-draw-ghost'; gh.setAttribute('aria-hidden', 'true');
        var svg = dnd.src.querySelector('svg'); if (svg) gh.appendChild(svg.cloneNode(true));
        document.body.appendChild(gh); dnd.ghost = gh;
        var ln = document.createElement('div'); ln.className = 'bt-draw-drop-line'; ln.hidden = true; document.body.appendChild(ln); dnd.line = ln;
        document.body.classList.add('bt-draw-dragging');
        if (dnd.kind === 'group') closeFly();
      }
      e.preventDefault();
      dnd.ghost.style.left = e.clientX + 'px'; dnd.ghost.style.top = e.clientY + 'px';
      showDrop(dnd.target = dropAt(e.clientX, e.clientY));
    }
    function onDragUp() {
      if (!dnd) return;
      if (!dnd.on) { dnd = null; return; }
      var d = dnd, t = d.target, g = null;
      endDrag();
      dnd = { done: true };                                  // swallows the click that follows
      setTimeout(function () { if (dnd && dnd.done) dnd = null; }, 0);
      if (!t) return;
      if (d.kind === 'group') g = t.into != null ? mergeGroup(ui.groups, d.from, t.into) : moveGroup(ui.groups, d.from, t.at);
      else if (t.into != null) g = t.into === d.from ? null : moveTool(ui.groups, d.tool, { group: t.into, at: ui.groups[t.into].t.length });
      else g = moveTool(ui.groups, d.tool, t.group != null ? { group: t.group, at: t.at } : { at: t.at });
      if (!g) return;
      var wasFly = fly && d.kind === 'tool' && t.group != null, anchorGi = null;
      setGroups(g);
      if (wasFly) { anchorGi = groupOf(ui.groups, d.tool); var a = opts.bar.querySelector('[data-group="' + anchorGi + '"]'); if (a) openFly(anchorGi, a); }
      else closeFly();
    }
    function endDrag() {
      if (!dnd) return;
      if (dnd.ghost && dnd.ghost.parentNode) dnd.ghost.parentNode.removeChild(dnd.ghost);
      if (dnd.line && dnd.line.parentNode) dnd.line.parentNode.removeChild(dnd.line);
      [].forEach.call(document.querySelectorAll('.bt-draw-drop-into'), function (x) { x.classList.remove('bt-draw-drop-into'); });
      document.body.classList.remove('bt-draw-dragging');
      dnd = null;
    }
    // where the pointer drops: { group, at } in the open menu; on the bar { into: button } (its middle) or { at: button } (its ends)
    function dropAt(x, y) {
      function inside(r, pad) { return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad; }
      if (fly && dnd.kind === 'tool' && dnd.from === fly.gi && inside(fly.el.getBoundingClientRect(), 4)) {
        var its = [].slice.call(fly.el.querySelectorAll('[data-fly-tool]')), at = its.length;
        for (var k = 0; k < its.length; k++) { var ri = its[k].getBoundingClientRect(); if (y < ri.top + ri.height / 2) { at = k; break; } }
        var ref = its[Math.min(at, its.length - 1)].getBoundingClientRect();
        return { group: fly.gi, at: at, line: { x: ref.left + 4, y: at < its.length ? ref.top : ref.bottom, w: ref.width - 8, h: 2 } };
      }
      if (!opts.bar || !inside(opts.bar.getBoundingClientRect(), 6)) return null;
      var bs = [].slice.call(opts.bar.querySelectorAll('[data-group]')); if (!bs.length) return null;
      var rs = bs.map(function (b) { return b.getBoundingClientRect(); });
      var vert = rs.length < 2 || Math.abs(rs[1].left - rs[0].left) < 2;      // flow down a column (the vertical bar) or along a row
      function edge(i, after) {
        var r = rs[Math.min(i, rs.length - 1)], end = after || i >= rs.length;
        return vert ? { x: r.left + 3, y: end ? r.bottom : r.top - 2, w: r.width - 6, h: 2 } : { x: end ? r.right : r.left - 2, y: r.top + 3, w: 2, h: r.height - 6 };
      }
      for (var i = 0; i < rs.length; i++) {
        if (!inside(rs[i], 1)) continue;
        var f = vert ? (y - rs[i].top) / rs[i].height : (x - rs[i].left) / rs[i].width;
        if (f < 0.28) return { at: i, line: edge(i) };
        if (f > 0.72) return { at: i + 1, line: edge(i, true) };
        if (dnd.kind === 'group' && i === dnd.from) return null;
        return { into: i, el: bs[i] };
      }
      // between or after the buttons: the closest one decides
      var best = 0, bd = Infinity;
      rs.forEach(function (r, k) { var d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)); if (d < bd) { bd = d; best = k; } });
      var rb = rs[best], after = vert ? y > rb.top + rb.height / 2 : x > rb.left + rb.width / 2;
      return { at: best + (after ? 1 : 0), line: edge(best, after) };
    }
    function showDrop(t) {
      [].forEach.call(document.querySelectorAll('.bt-draw-drop-into'), function (x) { x.classList.remove('bt-draw-drop-into'); });
      var ln = dnd.line;
      if (t && t.el) t.el.classList.add('bt-draw-drop-into');
      if (!t || !t.line) { ln.hidden = true; return; }
      ln.hidden = false; ln.style.left = Math.round(t.line.x) + 'px'; ln.style.top = Math.round(t.line.y) + 'px'; ln.style.width = Math.round(t.line.w) + 'px'; ln.style.height = Math.round(t.line.h) + 'px';
    }
    function onDragKey(e) { if (e.key === 'Escape' && dnd && dnd.on) { e.preventDefault(); e.stopPropagation(); endDrag(); } }
    var doc0 = global.document || null;
    if (opts.bar) { opts.bar.addEventListener('keydown', onBarKey); opts.bar.addEventListener('contextmenu', onBarContext); }
    if (doc0) {
      doc0.addEventListener('pointerdown', onDragDown, true); doc0.addEventListener('pointermove', onDragMove, true);
      doc0.addEventListener('pointerup', onDragUp, true); doc0.addEventListener('pointercancel', endDrag, true); doc0.addEventListener('keydown', onDragKey, true);
    }

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
    function check(key, text, on) {
      var r = document.createElement('div'); r.className = 'bt-dset-row';
      var l = document.createElement('label'); l.className = 'bt-dset-check';
      var c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!on; c.setAttribute('data-k', key);
      l.appendChild(c); l.appendChild(document.createTextNode(' ' + text)); r.appendChild(l);
      return r;
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
      if (!TEXTUAL[d.tool]) {
        box.appendChild(seg(t('backtest.draw.width', 'Kalınlık'), [1, 2, 3, 4].map(function (n) { return { v: String(n), label: String(n), html: '<i style="height:' + n + 'px"></i>' }; }), String(widthOf(d)), 'data-width'));
        box.appendChild(seg(t('backtest.draw.style', 'Çizgi stili'), [
          { v: 'solid', title: t('backtest.draw.solid', 'Düz'), html: '<i class="bt-dset-ln"></i>' },
          { v: 'dashed', title: t('backtest.draw.dashed', 'Kesik'), html: '<i class="bt-dset-ln bt-dset-dashed"></i>' },
          { v: 'dotted', title: t('backtest.draw.dotted', 'Noktalı'), html: '<i class="bt-dset-ln bt-dset-dotted"></i>' }], d.dash || 'solid', 'data-dash'));
        if (d.tool === 'hline') box.appendChild(seg(t('backtest.draw.extend', 'Uzunluk'), [
          { v: 'both', label: t('backtest.draw.extend_both', 'Tam'), title: t('backtest.draw.extend_both_hint', 'Grafiğin bir ucundan öbürüne') },
          { v: 'right', label: t('backtest.draw.extend_right', 'Sağa'), title: t('backtest.draw.extend_right_hint', 'Başladığı yerden sağa doğru') },
          { v: 'none', label: t('backtest.draw.extend_none', 'Parça'), title: t('backtest.draw.extend_none_hint', 'İki ucu var; uçlarından sürükleyerek uzat veya kısalt') }], d.extend || 'both', 'data-extend'));
        if (d.tool === 'trend') {
          box.appendChild(seg(t('backtest.draw.line_extend', 'Uzat'), [
            { v: 'none', label: t('backtest.draw.line_extend_none', 'Yok') },
            { v: 'left', label: t('backtest.draw.line_extend_left', 'Sola') },
            { v: 'right', label: t('backtest.draw.extend_right', 'Sağa') },
            { v: 'both', label: t('backtest.draw.line_extend_both', 'İki yöne') }], d.extend || 'none', 'data-lext'));
          box.appendChild(check('stats', t('backtest.draw.stats', 'Bilgi etiketi'), d.stats === true));
        }
        if (d.tool === 'rect' || d.tool === 'fib' || d.tool === 'fibext') box.appendChild(check('zone-extend', t('backtest.draw.zone_extend', 'Sağa uzat'), d.extend === 'right'));
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
      if (d.tool === 'fib' || d.tool === 'fibext') {
        var lr = document.createElement('div'); lr.className = 'bt-dset-row bt-dset-col';
        var ll = document.createElement('label'); ll.className = 'bt-dset-label'; ll.textContent = t('backtest.draw.levels', 'Seviyeler'); ll.htmlFor = 'bt-dset-levels'; lr.appendChild(ll);
        var li = document.createElement('input'); li.type = 'text'; li.id = 'bt-dset-levels'; li.className = 'bt-input bt-dset-levels'; li.setAttribute('data-k', 'levels');
        li.value = (d.levels || defLevels(d.tool)).join(', '); li.placeholder = defLevels(d.tool).join(', ');
        var lh = document.createElement('div'); lh.className = 'bt-dset-inline';
        lh.appendChild(li);
        var rs = document.createElement('button'); rs.type = 'button'; rs.className = 'bt-dset-btn'; rs.setAttribute('data-k', 'levels-reset'); rs.textContent = t('backtest.draw.levels_reset', 'Varsayılan'); lh.appendChild(rs);
        lr.appendChild(lh);
        var hint = document.createElement('p'); hint.className = 'bt-hint'; hint.id = 'bt-dset-levels-hint'; hint.textContent = t('backtest.draw.levels_hint', 'Virgülle ayır, ör. 0, 0.5, 0.618, 1 (en fazla 12)'); lr.appendChild(hint);
        box.appendChild(lr);
      }
      var foot = document.createElement('div'); foot.className = 'bt-dset-foot';
      if (TEXTUAL[d.tool]) { var eb = document.createElement('button'); eb.type = 'button'; eb.className = 'bt-dset-btn'; eb.setAttribute('data-k', 'edit-text'); eb.textContent = t('backtest.draw.edit_text', 'Metni düzenle'); foot.appendChild(eb); }
      var lk = document.createElement('button'); lk.type = 'button'; lk.className = 'bt-dset-btn'; lk.setAttribute('data-k', 'lock'); lk.setAttribute('aria-pressed', d.locked ? 'true' : 'false');
      lk.textContent = d.locked ? t('backtest.draw.unlock', 'Kilidi aç') : t('backtest.draw.lock', 'Kilitle'); foot.appendChild(lk);
      var cl = document.createElement('button'); cl.type = 'button'; cl.className = 'bt-dset-btn'; cl.setAttribute('data-k', 'clone'); cl.textContent = t('backtest.draw.clone', 'Kopyasını oluştur'); foot.appendChild(cl);
      var df = document.createElement('button'); df.type = 'button'; df.className = 'bt-dset-btn'; df.setAttribute('data-k', 'default'); df.textContent = t('backtest.draw.make_default', 'Varsayılan yap');
      df.title = t('backtest.draw.make_default_hint', 'Bu aracın yeni çizimleri bu renk ve stille başlasın'); foot.appendChild(df);
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
      if (b.hasAttribute('data-extend')) return setHlineMode(d, b.getAttribute('data-extend'));
      if (b.hasAttribute('data-lext')) { var lx = b.getAttribute('data-lext'); return edit(d, { extend: lx === 'none' ? undefined : lx }); }
      if (k === 'clone') { closePop(); return paste(d); }
      if (k === 'default') return setDefault(d);
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
      else if (k === 'stats' && !live) edit(d, { stats: e.target.checked ? true : undefined });
      else if (k === 'zone-extend' && !live) edit(d, { extend: e.target.checked ? 'right' : undefined });
      else if (k === 'opacity') { var ov = e.target.nextSibling; if (ov) ov.textContent = e.target.value + '%'; edit(d, { opacity: +e.target.value / 100 }, live); }
      else if (k === 'levels' && !live) {
        var lv = parseLevels(e.target.value);
        if (lv) edit(d, { levels: lv }); else { e.target.setAttribute('aria-invalid', 'true'); e.target.value = (d.levels || defLevels(d.tool)).join(', '); }
      }
      if (!live) pop.busy = false;
    }
    var doc = global.document || null;
    if (doc) { doc.addEventListener('click', onPopClick); doc.addEventListener('input', onPopInput); doc.addEventListener('change', onPopInput); }

    var ctl = {
      tool: function () { return tool; },
      magnet: function () { return ui.magnet; },
      stay: function () { return ui.stay; },
      hlineMode: function () { return ui.hline; },
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
      // Ctrl/Cmd+Z undo, Shift+Ctrl/Cmd+Z and Ctrl+Y redo, Ctrl/Cmd+C copies the selected drawing and Ctrl/Cmd+V pastes it:
      // true when the key belongs to the drawings (a copy only when a drawing is selected and no page text is)
      undoKey: function (e) {
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
        var k = (e.key || '').toLowerCase();
        if (k === 'z') { if (e.shiftKey) redo(); else undo(); return true; }
        if (k === 'y' && !e.shiftKey) { redo(); return true; }
        if (k === 'c' && !e.shiftKey) {
          var d = selected(), txt = global.getSelection ? String(global.getSelection()) : '';
          if (!d || txt) return false;
          clip = clone(d); return true;
        }
        if (k === 'v' && !e.shiftKey && clip) { cancelAll(); return paste(set.get(clip.id) || clip); }
        return false;
      },
      escape: function () {
        if (dnd && dnd.on) { endDrag(); return true; }
        if (fly) { closeFly(true); return true; }
        if (pop) { closePop(); return true; }
        if (cancelAll()) return true;
        if (tool !== 'cursor') { setTool('cursor'); return true; }
        if (set.selected()) { set.select(null); return true; }
        return false;
      },
      destroy: function () {
        flush(); closePop(); closeFly(); endDrag();
        if (doc0) {
          doc0.removeEventListener('pointerdown', onDragDown, true); doc0.removeEventListener('pointermove', onDragMove, true);
          doc0.removeEventListener('pointerup', onDragUp, true); doc0.removeEventListener('pointercancel', endDrag, true); doc0.removeEventListener('keydown', onDragKey, true);
        }
        if (opts.bar) { opts.bar.removeEventListener('keydown', onBarKey); opts.bar.removeEventListener('contextmenu', onBarContext); }
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
    TEXT_SIZES: TEXT_SIZES, MAX_LEVELS: MAX_LEVELS, EXTENDS: EXTENDS, SEG_BARS: SEG_BARS, hlineSpan: hlineSpan,
    FIBEXT_LEVELS: FIBEXT_LEVELS, LINE_EXTENDS: LINE_EXTENDS, ZONE_EXTENDS: ZONE_EXTENDS, MAX_BRUSH: MAX_BRUSH, OLD_DEFAULT_GROUPS: OLD_DEFAULT_GROUPS,
    extendLine: extendLine, pitchforkLines: pitchforkLines, ellipseHit: ellipseHit, inPoly: inPoly, nearPath: nearPath, thinStroke: thinStroke,
    channelOffset: channelOffset, priceOnLine: priceOnLine, cleanDefaults: cleanDefaults, defLevels: defLevels,
    DEFAULT_GROUPS: DEFAULT_GROUPS, defaultGroups: defaultGroups, normalizeGroups: normalizeGroups, isDefaultGroups: isDefaultGroups, groupOf: groupOf,
    moveGroup: moveGroup, mergeGroup: mergeGroup, moveTool: moveTool,
    timeToLogical: timeToLogical, logicalToTime: logicalToTime, magnet: magnet,
    sanitize: sanitize, toRow: toRow, fromRow: fromRow, paneOf: paneOf, fibLevels: fibLevels, newPosition: newPosition, positionStats: positionStats,
    measureStats: measureStats, moveBy: moveBy, setHandle: setHandle, resizeRect: resizeRect, distSeg: distSeg, rayEnd: rayEnd, inBox: inBox,
    lockAngle: lockAngle, squareBox: squareBox, rectHandles: rectHandles, parseLevels: parseLevels, cleanLevels: cleanLevels, fillOf: fillOf, widthOf: widthOf,
    createSet: createSet, createHistory: createHistory, createLayer: createLayer, createController: createController
  };
})(typeof window !== 'undefined' ? window : globalThis);
