// Backtest v2: drawing tools (window.WwBtDraw), rendered with the Lightweight Charts plugin system (series primitives, v4.1).
// A drawing is stored with TIME (UTC seconds) and PRICE coordinates, never with bar indexes, so it stays on the same spot when
// the timeframe changes, when history is prepended and while the replay reveals new candles. Times map to the chart through the
// revealed candles only (beyond the last one by extrapolating the bar length), so nothing ever reads a future candle; the magnet
// snaps to revealed candles only.
// Free plan: trend line, horizontal line and rectangle, kept for the browser session. Premium: every tool, saved to the account
// (public.backtest_drawings). The pure helpers at the top are unit tested.
(function (global) {
  'use strict';

  var TOOLS = ['trend', 'hline', 'ray', 'rect', 'fib', 'long', 'short', 'text', 'measure'];
  var FREE_TOOLS = ['trend', 'hline', 'rect'];
  var NPTS = { trend: 2, hline: 1, ray: 2, rect: 2, fib: 2, long: 3, short: 3, text: 1, measure: 2 };
  var ICONS = { trend: 'trending-up', hline: 'minus', ray: 'move-up-right', rect: 'rectangle-horizontal', fib: 'align-vertical-space-around',
    long: 'arrow-up-from-line', short: 'arrow-down-from-line', text: 'type', measure: 'ruler' };
  var FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  var COLORS = { trend: '#8b5cf6', hline: '#f59e0b', ray: '#38bdf8', rect: '#8b5cf6', fib: '#a78bfa', long: '#22c55e', short: '#ef4444', text: null, measure: '#38bdf8' };
  var MAX_TEXT = 200, MAX_DRAWINGS = 500, HIT_PX = 6, HANDLE_R = 5;

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
  // { id, tool, pts: [{ t, p }], color (#rrggbb | null = theme), text, locked }
  function sanitize(d) {
    if (!d || typeof d !== 'object' || TOOLS.indexOf(d.tool) < 0 || typeof d.id !== 'string' || !Array.isArray(d.pts)) return null;
    var pts = d.pts.slice(0, NPTS[d.tool]).map(function (x) { return { t: num(x && x.t), p: num(x && x.p) }; });
    if (pts.length !== NPTS[d.tool] || pts.some(function (x) { return !isFinite(x.t) || !isFinite(x.p); })) return null;
    var out = { id: d.id, tool: d.tool, pts: pts, color: isColor(d.color) ? d.color.toLowerCase() : null, locked: d.locked === true };
    if (d.tool === 'text') { out.text = String(d.text || '').slice(0, MAX_TEXT); if (!out.text.trim()) return null; }
    return out;
  }
  function toRow(d, userId, accountId) {
    var style = { color: d.color || null, locked: !!d.locked };
    if (d.tool === 'text') style.text = d.text;
    return { id: d.id, user_id: userId, backtest_account_id: accountId, tool: d.tool, points: d.pts.map(function (x) { return { t: x.t, p: x.p }; }), style: style };
  }
  function fromRow(r) {
    var st = r && r.style && typeof r.style === 'object' ? r.style : {};
    return sanitize({ id: r && r.id, tool: r && r.tool, pts: r && r.points, color: st.color, text: st.text, locked: st.locked });
  }
  // fib levels from the first point (level 1) to the second point (level 0)
  function fibLevels(d) {
    var a = d.pts[0].p, b = d.pts[1].p;
    return FIB_LEVELS.map(function (lv) { return { level: lv, price: b + (a - b) * lv }; });
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
  // drag one handle. Position tools keep the target on the profit side and the stop on the loss side.
  function setHandle(d, idx, t, p, tfSec) {
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
  function withAlpha(c, a) {
    var m = /^#([0-9a-f]{6})$/i.exec(c || ''); if (!m) return c;
    return 'rgba(' + parseInt(m[1].slice(0, 2), 16) + ',' + parseInt(m[1].slice(2, 4), 16) + ',' + parseInt(m[1].slice(4, 6), 16) + ',' + a + ')';
  }

  // ---------------------------------------------------------------- shared drawing set (all charts of the account)
  function createSet() {
    var items = [], sel = null, subs = [], hidden = false, lockAll = false;
    function emit(kind, d) { subs.forEach(function (f) { try { f(kind, d); } catch (e) { /* a listener must not break the others */ } }); }
    function idx(id) { for (var i = 0; i < items.length; i++) if (items[i].id === id) return i; return -1; }
    return {
      list: function () { return items; },
      get: function (id) { var i = idx(id); return i < 0 ? null : items[i]; },
      reset: function (list) { items = (list || []).map(sanitize).filter(Boolean); sel = null; emit('reset'); },
      add: function (d) { d = sanitize(d); if (!d) return null; items.push(d); emit('add', d); return d; },
      // transient: redraw only (dragging); a final put() without transient persists
      put: function (d, transient) { var i = idx(d.id); d = sanitize(d); if (i < 0 || !d) return null; items[i] = d; emit(transient ? 'drag' : 'update', d); return d; },
      remove: function (id) { var i = idx(id); if (i < 0) return; var d = items.splice(i, 1)[0]; if (sel === id) sel = null; emit('remove', d); },
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
  //         fmt(price) -> text, t(key, fb, params) }
  function createLayer(opts) {
    var chart = opts.chart, series = opts.series, el = opts.el, set = opts.set, ctl = opts.ctl;
    var api = null, draft = null, drag = null, boxes = {}, unsub = null, interactive = true, saved = null;
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
      ctx.font = '600 11.5px "DM Sans", sans-serif'; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
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
      if (d.tool === 'long' || d.tool === 'short') return [{ i: 0, x: xs[0], y: ys[0] }, { i: 1, x: xs[1], y: ys[1] }, { i: 2, x: xs[2], y: ys[2] }, { i: 3, x: xs[1], y: ys[0] }];
      return P.map(function (q, i) { return { i: i, x: xs[i], y: ys[i] }; });
    }
    function drawOne(ctx, d, m, selected) {
      var c = colorOf(d), P = d.pts, x = P.map(function (q) { return m.x(q.t); }), y = P.map(function (q) { return m.y(q.p); });
      if (y.some(isNaN)) return;
      ctx.strokeStyle = c; ctx.lineWidth = selected ? 2 : 1.5; ctx.setLineDash([]);
      var b = null;
      switch (d.tool) {
        case 'trend': line(ctx, x[0], y[0], x[1], y[1]); break;
        case 'ray': var e = rayEnd(x[0], y[0], x[1], y[1], m.w, m.h); line(ctx, x[0], y[0], e.x, e.y); break;
        case 'hline': line(ctx, 0, y[0], m.w, y[0]); break;
        case 'rect':
          ctx.fillStyle = withAlpha(c, 0.14); ctx.fillRect(Math.min(x[0], x[1]), Math.min(y[0], y[1]), Math.abs(x[1] - x[0]), Math.abs(y[1] - y[0]));
          ctx.strokeRect(Math.min(x[0], x[1]), Math.min(y[0], y[1]), Math.abs(x[1] - x[0]), Math.abs(y[1] - y[0])); break;
        case 'fib':
          var xl = Math.min(x[0], x[1]), xr = Math.max(x[0], x[1]);
          fibLevels(d).forEach(function (lv, k) {
            var yy = m.y(lv.price); if (isNaN(yy)) return;
            if (k > 0) { var yp = m.y(fibLevels(d)[k - 1].price); ctx.fillStyle = withAlpha(c, k % 2 ? 0.07 : 0.12); ctx.fillRect(xl, Math.min(yy, yp), xr - xl, Math.abs(yy - yp)); }
            ctx.lineWidth = lv.level === 0 || lv.level === 1 ? 1.5 : 1; line(ctx, xl, yy, xr, yy);
            label(ctx, lv.level + ' · ' + opts.fmt(lv.price), xl + 4, yy - 8, c, 'left');
          });
          ctx.setLineDash([4, 4]); ctx.lineWidth = 1; line(ctx, x[0], y[0], x[1], y[1]); ctx.setLineDash([]);
          break;
        case 'long': case 'short':
          var up = d.tool === 'long', xa = x[0], xb = x[1], ye = y[0], yt = y[1], ys = y[2], st = positionStats(d);
          var G = css('--green', '#22c55e'), Rr = css('--red', '#ef4444');
          ctx.fillStyle = withAlpha(G.charAt(0) === '#' ? G : '#22c55e', 0.16); ctx.fillRect(Math.min(xa, xb), Math.min(ye, yt), Math.abs(xb - xa), Math.abs(yt - ye));
          ctx.fillStyle = withAlpha(Rr.charAt(0) === '#' ? Rr : '#ef4444', 0.16); ctx.fillRect(Math.min(xa, xb), Math.min(ye, ys), Math.abs(xb - xa), Math.abs(ys - ye));
          ctx.strokeStyle = textColor(); ctx.lineWidth = 1; line(ctx, xa, ye, xb, ye);
          var mid = (xa + xb) / 2;
          label(ctx, opts.t('backtest.draw.target', 'Hedef') + ' ' + opts.fmt(P[1].p) + ' (' + (st.targetPct >= 0 ? '+' : '') + st.targetPct.toFixed(2) + '%)', mid, yt + (up ? -12 : 12), '#fff', 'center', '#16a34a', m.w);
          label(ctx, opts.t('backtest.draw.stop', 'Stop') + ' ' + opts.fmt(P[2].p) + ' (' + (st.stopPct >= 0 ? '+' : '') + st.stopPct.toFixed(2) + '%)', mid, ys + (up ? 12 : -12), '#fff', 'center', '#dc2626', m.w);
          label(ctx, 'R:R ' + (st.rr == null ? '—' : st.rr.toFixed(2)), mid, ye, textColor(), 'center', light() ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.7)', m.w);
          break;
        case 'text':
          ctx.font = '600 13px "DM Sans", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          var w = ctx.measureText(d.text).width; ctx.fillStyle = c; ctx.fillText(d.text, x[0], y[0]);
          b = { x1: x[0] - 3, y1: y[0] - 10, x2: x[0] + w + 3, y2: y[0] + 10 };
          if (selected) { ctx.strokeStyle = withAlpha(c.charAt(0) === '#' ? c : '#8b5cf6', 0.6); ctx.lineWidth = 1; ctx.strokeRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1); }
          break;
        case 'measure':
          var ms = measureStats(d, m.bars, m.tf), upM = ms.dp >= 0, mc = upM ? '#38bdf8' : '#f472b6';
          ctx.fillStyle = withAlpha(mc, 0.15); ctx.fillRect(Math.min(x[0], x[1]), Math.min(y[0], y[1]), Math.abs(x[1] - x[0]), Math.abs(y[1] - y[0]));
          ctx.strokeStyle = mc; ctx.lineWidth = 1; line(ctx, x[0], y[0], x[1], y[1]);
          var txt = (ms.dp >= 0 ? '+' : '−') + opts.fmt(Math.abs(ms.dp)) + ' (' + (ms.pct >= 0 ? '+' : '') + ms.pct.toFixed(2) + '%) · ' +
            opts.t('backtest.draw.bars', '{n} mum', { n: ms.bars }) + ' · ' + duration(ms.seconds);
          label(ctx, txt, (x[0] + x[1]) / 2, Math.min(y[0], y[1]) - 14, '#fff', 'center', mc, m.w);
          break;
      }
      if (b) boxes[d.id] = b;
      if (selected) {
        ctx.setLineDash([]);
        handlesOf(d, m).forEach(function (h) {
          ctx.beginPath(); ctx.arc(h.x, h.y, HANDLE_R, 0, Math.PI * 2);
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
          if (draft) drawOne(ctx, draft, m, true);
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
    unsub = set.on(function () { refresh(); });

    // --- hit test (media px)
    function hitTest(x, y) {
      var m = mapper(); if (!m || set.hidden()) return null;
      var list = set.list(), selId = set.selected(), order = list.slice();
      if (selId) order.sort(function (a, b2) { return (b2.id === selId) - (a.id === selId); }); else order.reverse();
      for (var k = 0; k < order.length; k++) {
        var d = order[k];
        if (d.id === selId) {
          var hs = handlesOf(d, m);
          for (var j = 0; j < hs.length; j++) if (Math.abs(hs[j].x - x) <= HANDLE_R + 3 && Math.abs(hs[j].y - y) <= HANDLE_R + 3) return { id: d.id, handle: hs[j].i };
        }
        if (hitBody(d, m, x, y)) return { id: d.id, handle: -1 };
      }
      return null;
    }
    function hitBody(d, m, x, y) {
      var P = d.pts, xs = P.map(function (q) { return m.x(q.t); }), ys = P.map(function (q) { return m.y(q.p); });
      switch (d.tool) {
        case 'trend': return distSeg(x, y, xs[0], ys[0], xs[1], ys[1]) <= HIT_PX;
        case 'ray': var e = rayEnd(xs[0], ys[0], xs[1], ys[1], m.w, m.h); return distSeg(x, y, xs[0], ys[0], e.x, e.y) <= HIT_PX;
        case 'hline': return Math.abs(y - ys[0]) <= HIT_PX;
        case 'rect': case 'measure': case 'fib': return inBox(x, y, xs[0], ys[0], xs[1], ys[1], HIT_PX);
        case 'long': case 'short': return inBox(x, y, xs[0], Math.min(ys[1], ys[2]), xs[1], Math.max(ys[1], ys[2]), 2);
        case 'text': var b = boxes[d.id]; return !!b && inBox(x, y, b.x1, b.y1, b.x2, b.y2, 2);
      }
      return false;
    }

    // --- pointer interaction
    function local(e) { var r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function inPane(pt, m) { return m && pt.x >= 0 && pt.y >= 0 && pt.x < m.w && pt.y < m.h; }
    function model(pt, m, useMagnet) {
      var t = m.t(pt.x), p = m.p(pt.y);
      if (useMagnet && ctl.magnet()) { var s = magnet(m.bars, m.l(pt.x), p); if (s) return s; }
      return { t: t, p: p };
    }
    function setInteractive(on) {
      if (on === interactive) return;
      interactive = on;
      if (!on) { var o = chart.options(); saved = { handleScroll: o.handleScroll, handleScale: o.handleScale }; chart.applyOptions({ handleScroll: false, handleScale: false }); }
      else if (saved) chart.applyOptions(saved);
    }
    function consume(e) { e.preventDefault(); e.stopPropagation(); }
    function finishDraft() {
      var d = draft; draft = null; refresh();
      if (!d) return;
      ctl.created(d);
    }
    function onDown(e) {
      if (e.button > 0) return;
      var m = mapper(), pt = local(e);
      if (!inPane(pt, m)) return;
      var tool = ctl.tool();
      if (tool !== 'cursor') {
        consume(e);
        if (!ctl.allowed(tool)) { ctl.denied(tool); return; }
        var q = model(pt, m, true);
        if (draft && draft.wait) { draft.pts[draft.pts.length - 1] = q; draft.wait = false; finishDraft(); return; }
        var id = ctl.newId();
        if (tool === 'hline') { draft = { id: id, tool: tool, pts: [q], color: null }; finishDraft(); return; }
        if (tool === 'text') { var at = q; ctl.askText('', function (txt) { if (txt) { draft = { id: id, tool: 'text', pts: [at], text: txt, color: null }; finishDraft(); } }); return; }
        if (tool === 'long' || tool === 'short') {
          var unit = Math.abs(m.p(0) - m.p(m.h)) * 0.06 || Math.abs(q.p) * 0.002;
          draft = { id: id, tool: tool, pts: newPosition(tool, q.t, q.p, unit, m.tf), color: null }; finishDraft(); return;
        }
        draft = { id: id, tool: tool, pts: [q, { t: q.t, p: q.p }], color: null, down: pt, dragging: true };
        try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
        refresh(); return;
      }
      if (set.hidden()) return;
      var hit = hitTest(pt.x, pt.y);
      if (!hit) { if (set.selected()) set.select(null); return; }
      consume(e);
      set.select(hit.id);
      var d = set.get(hit.id);
      if (!d || d.locked || set.lockAll()) return;
      setInteractive(false);
      drag = { id: hit.id, handle: hit.handle, start: pt, l0: m.l(pt.x), p0: m.p(pt.y), orig: clone(d), moved: false, pid: e.pointerId };
      try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    }
    function onMove(e) {
      var m = mapper(); if (!m) return;
      var pt = local(e);
      if (drag) {
        consume(e);
        if (!drag.moved && Math.abs(pt.x - drag.start.x) + Math.abs(pt.y - drag.start.y) < 3) return;
        drag.moved = true;
        var nd;
        if (drag.handle >= 0) { var q = model(pt, m, true); nd = setHandle(drag.orig, drag.handle, q.t, q.p, m.tf); }
        else nd = moveBy(drag.orig, m.bars, m.tf, m.l(pt.x) - drag.l0, m.p(pt.y) - drag.p0);
        set.put(nd, true);
        return;
      }
      if (draft && (draft.dragging || draft.wait)) {
        consume(e);
        draft.pts[draft.pts.length - 1] = model(pt, m, true); refresh(); return;
      }
      if (ctl.tool() !== 'cursor') { el.style.cursor = inPane(pt, m) ? 'crosshair' : ''; return; }
      var h = inPane(pt, m) ? hitTest(pt.x, pt.y) : null, d2 = h && set.get(h.id);
      el.style.cursor = h ? (d2 && (d2.locked || set.lockAll()) ? 'pointer' : h.handle >= 0 ? 'grab' : 'move') : '';
    }
    function onUp(e) {
      if (drag) {
        consume(e);
        try { el.releasePointerCapture(drag.pid); } catch (x) { /* ignore */ }
        var dd = drag; drag = null; setInteractive(ctl.tool() === 'cursor');
        if (dd.moved) { var cur = set.get(dd.id); if (cur) set.put(cur, false); }
        return;
      }
      if (draft && draft.dragging) {
        consume(e);
        var pt = local(e), moved = Math.abs(pt.x - draft.down.x) + Math.abs(pt.y - draft.down.y) > 4;
        draft.dragging = false;
        if (moved) finishDraft(); else draft.wait = true;     // click, move, click
      }
    }
    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('pointermove', onMove, true);
    el.addEventListener('pointerup', onUp, true);
    el.addEventListener('pointercancel', onUp, true);

    return {
      refresh: refresh,
      toolChanged: function () { if (draft) { draft = null; refresh(); } setInteractive(ctl.tool() === 'cursor'); el.style.cursor = ctl.tool() === 'cursor' ? '' : 'crosshair'; },
      cancelDraft: function () { if (draft) { draft = null; refresh(); return true; } return false; },
      hasDraft: function () { return !!draft; },
      destroy: function () {
        if (unsub) unsub();
        el.removeEventListener('pointerdown', onDown, true); el.removeEventListener('pointermove', onMove, true);
        el.removeEventListener('pointerup', onUp, true); el.removeEventListener('pointercancel', onUp, true);
        try { series.detachPrimitive(primitive); } catch (e) { /* chart already removed */ }
        el.style.cursor = '';
      }
    };
  }

  // ---------------------------------------------------------------- controller: tool state, toolbar, keys, persistence (browser)
  // opts: { bar (toolbar element), t, pro() -> every tool, saveable() -> drawings go to the account, upgrade(), toast(msg, type),
  //         newId(), askText(initial, cb), confirm(text) -> Promise<bool>, icons(), local (localStorage), session (sessionStorage),
  //         db: { load(accountId) -> Promise<rows>, save(row) -> Promise, remove(id) -> Promise } | null, userId() }
  var UI_KEY = 'ww_bt_draw_ui', SESSION_PREFIX = 'ww_bt_draw:';
  function createController(opts) {
    var set = createSet(), layers = [], tool = 'cursor', acc = null, timers = {}, failShown = false, loadSeq = 0;
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
      if (kind !== 'drag') renderBar();
    });
    // load the drawings of an account: saved rows (Premium, or what a lapsed Premium saved) + this session's drawings
    function setAccount(id) {
      flush();
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

    function setTool(id) {
      if (TOOLS.indexOf(id) < 0) id = 'cursor';
      if (!allowed(id)) { opts.upgrade(); return; }
      tool = id;
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

    // toolbar
    function btn(cls, icon, title, attrs) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'bt-draw-btn ' + (cls || ''); b.title = title; b.setAttribute('aria-label', title);
      var i = document.createElement('i'); i.setAttribute('data-lucide', icon); i.setAttribute('aria-hidden', 'true'); b.appendChild(i);
      Object.keys(attrs || {}).forEach(function (k) { b.setAttribute(k, attrs[k]); });
      return b;
    }
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
      var d = selected();
      if (d) {
        bar.appendChild(sep());
        var col = document.createElement('input'); col.type = 'color'; col.className = 'bt-draw-color'; col.title = opts.t('backtest.draw.color', 'Renk');
        col.setAttribute('aria-label', col.title); col.value = d.color || COLORS[d.tool] || '#e8e8f0'; col.setAttribute('data-act', 'color');
        bar.appendChild(col);
        if (d.tool === 'text') bar.appendChild(btn('', 'pencil-line', opts.t('backtest.draw.edit_text', 'Metni düzenle'), { 'data-act': 'text' }));
        bar.appendChild(btn('', d.locked ? 'pin' : 'pin-off', d.locked ? opts.t('backtest.draw.unlock', 'Kilidi aç') : opts.t('backtest.draw.lock', 'Kilitle'), { 'data-act': 'lock', 'aria-pressed': d.locked ? 'true' : 'false' }));
        bar.appendChild(btn('bt-draw-del', 'trash-2', opts.t('backtest.draw.delete', 'Sil') + ' (Del)', { 'data-act': 'delete' }));
      }
      if (set.list().length) { bar.appendChild(sep()); bar.appendChild(btn('bt-draw-del', 'eraser', opts.t('backtest.draw.clear', 'Tüm çizimleri sil'), { 'data-act': 'clear' })); }
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
    function onBarClick(e) {
      var b = e.target.closest('button'); if (!b || !opts.bar.contains(b)) return;
      var t = b.getAttribute('data-tool');
      if (t) return setTool(tool === t && t !== 'cursor' ? 'cursor' : t);
      var a = b.getAttribute('data-act'), d = selected();
      if (a === 'magnet') { ui.magnet = !ui.magnet; saveUi(); renderBar(); }
      else if (a === 'lockall') { ui.lockAll = !ui.lockAll; saveUi(); set.setLockAll(ui.lockAll); renderBar(); }
      else if (a === 'hide') { ui.hidden = !ui.hidden; saveUi(); set.setHidden(ui.hidden); renderBar(); }
      else if (a === 'lock' && d) { var n = clone(d); n.locked = !d.locked; set.put(n); }
      else if (a === 'delete') delSelected();
      else if (a === 'text' && d) opts.askText(d.text, function (txt) { if (txt) { var n2 = clone(d); n2.text = txt; set.put(n2); } });
      else if (a === 'clear') opts.confirm(opts.t('backtest.draw.clear_confirm', 'Bu hesaptaki tüm çizimler silinsin mi?')).then(function (ok) { if (ok) set.clear(); });
    }
    function onBarChange(e) {
      if (e.target.getAttribute('data-act') !== 'color') return;
      var d = selected(); if (!d) return;
      var n = clone(d); n.color = e.target.value; set.put(n);
    }
    if (opts.bar) { opts.bar.addEventListener('click', onBarClick); opts.bar.addEventListener('change', onBarChange); }

    var ctl = {
      tool: function () { return tool; },
      magnet: function () { return ui.magnet; },
      allowed: allowed,
      denied: function () { opts.upgrade(); },
      newId: opts.newId,
      askText: opts.askText,
      created: created
    };
    return {
      set: set,
      attach: function (lo) { var l = createLayer(Object.assign({ set: set, ctl: ctl, t: opts.t }, lo)); layers.push(l); return l; },
      detach: function (l) { if (!l) return; l.destroy(); layers = layers.filter(function (x) { return x !== l; }); },
      setAccount: setAccount,
      tool: function () { return tool; },
      setTool: setTool,
      render: renderBar,
      // keyboard (no modifiers; the page skips inputs): true when the key was used
      key: function (e) {
        var k = e.key;
        if (/^[1-9]$/.test(k)) { setTool(TOOLS[+k - 1]); return true; }
        if (k === 'v' || k === 'V') { setTool('cursor'); return true; }
        if ((k === 'm' || k === 'M') && !e.shiftKey) { ui.magnet = !ui.magnet; saveUi(); renderBar(); return true; }
        if (k === 'Delete' || k === 'Backspace') return delSelected();
        return false;
      },
      escape: function () {
        var c = false; layers.forEach(function (l) { if (l.cancelDraft()) c = true; });
        if (c) return true;
        if (tool !== 'cursor') { setTool('cursor'); return true; }
        if (set.selected()) { set.select(null); return true; }
        return false;
      },
      destroy: function () {
        flush();
        if (ro) { ro.disconnect(); ro = null; cancelAnimationFrame(roFrame); }
        layers.forEach(function (l) { l.destroy(); }); layers = [];
        if (opts.bar) { opts.bar.removeEventListener('click', onBarClick); opts.bar.removeEventListener('change', onBarChange); }
      }
    };
  }

  global.WwBtDraw = {
    TOOLS: TOOLS, FREE_TOOLS: FREE_TOOLS, NPTS: NPTS, ICONS: ICONS, FIB_LEVELS: FIB_LEVELS, COLORS: COLORS, MAX_TEXT: MAX_TEXT, MAX_DRAWINGS: MAX_DRAWINGS,
    timeToLogical: timeToLogical, logicalToTime: logicalToTime, magnet: magnet,
    sanitize: sanitize, toRow: toRow, fromRow: fromRow, fibLevels: fibLevels, newPosition: newPosition, positionStats: positionStats,
    measureStats: measureStats, moveBy: moveBy, setHandle: setHandle, distSeg: distSeg, rayEnd: rayEnd, inBox: inBox,
    createSet: createSet, createLayer: createLayer, createController: createController
  };
})(typeof window !== 'undefined' ? window : globalThis);
