// Backtest: technical indicators on the chart (window.WwBtInd): simple and exponential moving average, Bollinger Bands, RSI,
// MACD, Stochastic, ATR. Computed from the real candle prices (also while Heikin Ashi is shown) with TradingView's formulas:
// EMA seeded with the SMA of its first values, RSI and ATR smoothed with Wilder's RMA, Bollinger with the population deviation.
// Lightweight Charts 4 has no panes: an oscillator sits in a band at the bottom of the chart on its own (hidden) price scale, and
// this module draws the band lines, levels, names and values itself. The replay updates the tail only (compute(..., from)).
// Settings live in localStorage (per browser) like the appearance, and every chart of the page shows the same indicators.
// Pure parts (normalize, compute, margins) are unit tested; attach / mountDrawer need window.LightweightCharts and the DOM.
(function (global) {
  'use strict';

  var KEY = 'ww_bt_ind_v1';
  var MAX = 10;
  var SOURCES = ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'];
  // params: number { k, def, min, max, step? } or the price source; lines: one series each (hist: histogram), colorOnly: a color
  // setting without its own series (the falling bars of the MACD histogram)
  var TYPES = {
    sma: { kind: 'overlay', params: [{ k: 'length', def: 20, min: 1, max: 500 }, { k: 'source', def: 'close' }], lines: [{ k: 'ma', color: '#f59e0b', width: 2 }] },
    ema: { kind: 'overlay', params: [{ k: 'length', def: 50, min: 1, max: 500 }, { k: 'source', def: 'close' }], lines: [{ k: 'ma', color: '#3b82f6', width: 2 }] },
    bb: { kind: 'overlay', params: [{ k: 'length', def: 20, min: 2, max: 500 }, { k: 'mult', def: 2, min: 0.1, max: 10, step: 0.1 }, { k: 'source', def: 'close' }],
      lines: [{ k: 'mid', color: '#f59e0b', width: 1 }, { k: 'up', color: '#3b82f6', width: 1 }, { k: 'lo', color: '#3b82f6', width: 1 }], fill: ['up', 'lo'] },
    rsi: { kind: 'osc', range: [0, 100], levels: [30, 70], params: [{ k: 'length', def: 14, min: 2, max: 200 }, { k: 'source', def: 'close' }],
      lines: [{ k: 'rsi', color: '#a855f7', width: 2 }], decimals: 2 },
    macd: { kind: 'osc', levels: [0], params: [{ k: 'fast', def: 12, min: 1, max: 200 }, { k: 'slow', def: 26, min: 2, max: 300 }, { k: 'signal', def: 9, min: 1, max: 100 }, { k: 'source', def: 'close' }],
      lines: [{ k: 'hist', color: '#26a69a', hist: true }, { k: 'histDown', color: '#ef5350', colorOnly: true }, { k: 'macd', color: '#3b82f6', width: 2 }, { k: 'signal', color: '#f97316', width: 2 }] },
    stoch: { kind: 'osc', range: [0, 100], levels: [20, 80], params: [{ k: 'length', def: 14, min: 1, max: 200 }, { k: 'smooth', def: 1, min: 1, max: 50 }, { k: 'd', def: 3, min: 1, max: 50 }],
      lines: [{ k: 'k', color: '#3b82f6', width: 2 }, { k: 'd', color: '#f97316', width: 2 }], decimals: 2 },
    atr: { kind: 'osc', params: [{ k: 'length', def: 14, min: 1, max: 200 }], lines: [{ k: 'atr', color: '#ef4444', width: 2 }] }
  };
  var TYPE_IDS = ['sma', 'ema', 'bb', 'rsi', 'macd', 'stoch', 'atr'];
  var SHORT = { sma: 'SMA', ema: 'EMA', bb: 'BB', rsi: 'RSI', macd: 'MACD', stoch: 'Stoch', atr: 'ATR' };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function isHex(v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v); }
  var seq = 0;
  function newId() { seq = (seq + 1) % 1e6; return 'i' + Date.now().toString(36) + seq.toString(36) + Math.floor(Math.random() * 1296).toString(36); }

  // ---------------------------------------------------------------- settings
  function cleanInst(x) {
    if (!x || typeof x !== 'object' || !TYPES[x.type]) return null;
    var T = TYPES[x.type], p = {}, c = {}, src = x.params && typeof x.params === 'object' ? x.params : {}, col = x.colors && typeof x.colors === 'object' ? x.colors : {};
    T.params.forEach(function (d) {
      var v = src[d.k];
      if (d.k === 'source') { p.source = SOURCES.indexOf(v) >= 0 ? v : d.def; return; }
      v = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
      if (typeof v !== 'number' || !isFinite(v)) { p[d.k] = d.def; return; }
      p[d.k] = d.step ? Number(clamp(Math.round(v / d.step) * d.step, d.min, d.max).toFixed(4)) : clamp(Math.round(v), d.min, d.max);
    });
    T.lines.forEach(function (l) { c[l.k] = isHex(col[l.k]) ? col[l.k].toLowerCase() : l.color; });
    var id = typeof x.id === 'string' && /^[a-z0-9_-]{1,40}$/i.test(x.id) ? x.id : newId();
    return { id: id, type: x.type, params: p, colors: c, hidden: x.hidden === true };
  }
  function create(type) { return cleanInst({ type: type }); }
  // Stored state: { list: [instance] } (at most MAX, unique ids)
  function normalize(s) {
    var list = s && Array.isArray(s.list) ? s.list : [], out = [], ids = {};
    list.forEach(function (x) {
      if (out.length >= MAX) return;
      var c = cleanInst(x); if (!c) return;
      if (ids[c.id]) c.id = newId();
      ids[c.id] = true; out.push(c);
    });
    return { list: out };
  }
  function load(storage) {
    var raw = null, p = null;
    try { raw = storage ? storage.getItem(KEY) : null; } catch (e) { raw = null; }
    try { p = raw ? JSON.parse(raw) : null; } catch (e) { p = null; }
    return normalize(p);
  }
  function save(storage, s) { try { if (storage) storage.setItem(KEY, JSON.stringify(normalize(s))); return true; } catch (e) { return false; } }
  // "RSI 14", "SMA 20 hl2", "BB 20 2", "MACD 12 26 9" (the source only when it is not the close)
  function label(inst) {
    var T = TYPES[inst.type], parts = [SHORT[inst.type]];
    T.params.forEach(function (d) { if (d.k !== 'source') parts.push(String(inst.params[d.k])); });
    if (inst.params.source && inst.params.source !== 'close') parts.push(inst.params.source);
    return parts.join(' ');
  }
  // what decides the computed values (a color change keeps the values)
  function calcKey(inst) { return inst.type + ':' + JSON.stringify(inst.params); }

  // ---------------------------------------------------------------- math (pure; bars: [{ time, open, high, low, close }])
  function srcVal(b, s) {
    switch (s) {
      case 'open': return b.open;
      case 'high': return b.high;
      case 'low': return b.low;
      case 'hl2': return (b.high + b.low) / 2;
      case 'hlc3': return (b.high + b.low + b.close) / 3;
      case 'ohlc4': return (b.open + b.high + b.low + b.close) / 4;
      default: return b.close;
    }
  }
  function cut(a, from) { if (a.length > from) a.length = from; return a; }
  // mean of src[i-n+1..i]; null until n values exist (a null inside the window makes it null too)
  function smaAt(src, i, n) {
    if (i < n - 1) return null;
    var s = 0;
    for (var j = i - n + 1; j <= i; j++) { if (src[j] == null) return null; s += src[j]; }
    return s / n;
  }
  function smaInto(src, n, out, from) { cut(out, from); for (var i = from; i < src.length; i++) out.push(smaAt(src, i, n)); return out; }
  // exponential smoothing seeded with the SMA of the first n values: EMA (alpha 2/(n+1)) and Wilder's RMA (alpha 1/n)
  function smoothInto(src, n, alpha, out, from) {
    cut(out, from);
    for (var i = from; i < src.length; i++) {
      var prev = i > 0 ? out[i - 1] : null, x = src[i];
      if (x == null) out.push(null);
      else if (prev == null) out.push(smaAt(src, i, n));
      else out.push(alpha * x + (1 - alpha) * prev);
    }
    return out;
  }
  function arr(st, k) { return st[k] || (st[k] = []); }

  // Values of an indicator for bars[from..] (earlier values stay). st: the instance's state object (reset it when the params change).
  // Returns st.out: { line key: [number | null per bar] }.
  function compute(inst, bars, from, st) {
    var p = inst.params, n = bars.length, i;
    st.out = st.out || {};
    from = clamp(from || 0, 0, Math.min(n, st.n == null ? 0 : st.n));
    st.n = n;
    var src = arr(st, 'src'); cut(src, from);
    for (i = from; i < n; i++) src.push(srcVal(bars[i], p.source || 'close'));
    var o = st.out;
    switch (inst.type) {
      case 'sma': o.ma = smaInto(src, p.length, arr(o, 'ma'), from); break;
      case 'ema': o.ma = smoothInto(src, p.length, 2 / (p.length + 1), arr(o, 'ma'), from); break;
      case 'bb': {
        var mid = smaInto(src, p.length, arr(o, 'mid'), from), up = cut(arr(o, 'up'), from), lo = cut(arr(o, 'lo'), from);
        for (i = from; i < n; i++) {
          if (mid[i] == null) { up.push(null); lo.push(null); continue; }
          var s2 = 0; for (var j = i - p.length + 1; j <= i; j++) { var d = src[j] - mid[i]; s2 += d * d; }
          var dev = Math.sqrt(s2 / p.length) * p.mult;
          up.push(mid[i] + dev); lo.push(mid[i] - dev);
        }
        break;
      }
      case 'rsi': {
        var g = cut(arr(st, 'g'), from), l = cut(arr(st, 'l'), from);
        for (i = from; i < n; i++) {
          if (i === 0) { g.push(null); l.push(null); continue; }
          var ch = src[i] - src[i - 1]; g.push(Math.max(ch, 0)); l.push(Math.max(-ch, 0));
        }
        var ag = smoothInto(g, p.length, 1 / p.length, arr(st, 'ag'), from), al = smoothInto(l, p.length, 1 / p.length, arr(st, 'al'), from);
        var r = cut(arr(o, 'rsi'), from);
        for (i = from; i < n; i++) r.push(ag[i] == null || al[i] == null ? null : al[i] === 0 ? 100 : ag[i] === 0 ? 0 : 100 - 100 / (1 + ag[i] / al[i]));
        break;
      }
      case 'macd': {
        var ef = smoothInto(src, p.fast, 2 / (p.fast + 1), arr(st, 'ef'), from), es = smoothInto(src, p.slow, 2 / (p.slow + 1), arr(st, 'es'), from);
        var m = cut(arr(o, 'macd'), from);
        for (i = from; i < n; i++) m.push(ef[i] == null || es[i] == null ? null : ef[i] - es[i]);
        var sg = smoothInto(m, p.signal, 2 / (p.signal + 1), arr(o, 'signal'), from), h = cut(arr(o, 'hist'), from);
        for (i = from; i < n; i++) h.push(m[i] == null || sg[i] == null ? null : m[i] - sg[i]);
        break;
      }
      case 'stoch': {
        var raw = cut(arr(st, 'raw'), from);
        for (i = from; i < n; i++) {
          if (i < p.length - 1) { raw.push(null); continue; }
          var hh = -Infinity, ll = Infinity;
          for (var k = i - p.length + 1; k <= i; k++) { hh = Math.max(hh, bars[k].high); ll = Math.min(ll, bars[k].low); }
          raw.push(hh === ll ? (raw[i - 1] != null ? raw[i - 1] : 50) : 100 * (bars[i].close - ll) / (hh - ll));
        }
        var kk = smaInto(raw, p.smooth, arr(o, 'k'), from);
        o.d = smaInto(kk, p.d, arr(o, 'd'), from);
        break;
      }
      case 'atr': {
        var tr = cut(arr(st, 'tr'), from);
        for (i = from; i < n; i++) {
          var b = bars[i], pc = i > 0 ? bars[i - 1].close : null;
          tr.push(pc == null ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc)));
        }
        o.atr = smoothInto(tr, p.length, 1 / p.length, arr(o, 'atr'), from);
        break;
      }
    }
    return o;
  }

  // ---------------------------------------------------------------- chart layout (fractions of the pane height)
  // Oscillator bands at the bottom (each at most 20%, together at most 50%); the candles and the volume share the rest as before
  // (candles 8% from the top, 8% or with volume 20% from the bottom of their part; volume in the lowest 16% of it).
  function margins(nOsc, vol) {
    var h = nOsc ? Math.min(0.2, 0.5 / nOsc) : 0, area = h * nOsc, m = 1 - area, osc = [];
    for (var i = 0; i < nOsc; i++) {
      var top = 1 - area + i * h;
      osc.push({ top: top + h * 0.24, bottom: Math.max(0, 1 - (top + h) + h * 0.06), y0: top, y1: top + h });
    }
    return { main: { top: 0.08 * m, bottom: area + m * (vol ? 0.2 : 0.08) }, vol: { top: 1 - area - m * 0.16, bottom: area }, osc: osc, area: area };
  }

  // ---------------------------------------------------------------- chart (browser)
  // o: { chart, series (the candles), bars() -> bars, fmt(price) -> text, vol() -> volume shown, layout(margins) (the page applies
  //      the candle and volume scales) }
  function attach(o) {
    var chart = o.chart, items = {}, order = [], hover = null, alive = true, m = margins(0, false);
    var api = { requestUpdate: null };
    function rangeFor(T) { return T.range ? function () { return { priceRange: { minValue: T.range[0], maxValue: T.range[1] } }; } : undefined; }
    function makeSeries(it) {
      var T = TYPES[it.inst.type], osc = T.kind === 'osc', sid = osc ? 'bt-ind-' + it.inst.id : 'right';
      it.series = {};
      T.lines.forEach(function (l) {
        if (l.colorOnly) return;
        var base = { priceScaleId: sid, lastValueVisible: !osc, priceLineVisible: false, crosshairMarkerVisible: !l.hist,
          autoscaleInfoProvider: osc ? rangeFor(T) : undefined, priceFormat: osc ? { type: 'custom', formatter: function (v) { return fmtVal(it.inst, v); } } : o.priceFormat };
        it.series[l.k] = l.hist ? chart.addHistogramSeries(base)
          : chart.addLineSeries(Object.assign(base, { color: it.inst.colors[l.k], lineWidth: l.width || 2 }));
      });
    }
    function dropSeries(it) { Object.keys(it.series || {}).forEach(function (k) { try { chart.removeSeries(it.series[k]); } catch (e) { /* chart gone */ } }); it.series = {}; }
    function histColor(it, i, h) {
      var a = it.st.out.hist, prev = i > 0 ? a[i - 1] : null, grow = prev == null || Math.abs(h) >= Math.abs(prev);
      return withAlpha(h >= 0 ? it.inst.colors.hist : it.inst.colors.histDown, grow ? 0.85 : 0.45);
    }
    function point(it, k, i, b) {
      var v = it.st.out[k] ? it.st.out[k][i] : null;
      if (v == null || !isFinite(v)) return { time: b.time };
      return k === 'hist' ? { time: b.time, value: v, color: histColor(it, i, v) } : { time: b.time, value: v };
    }
    function fill(it) {
      var bars = o.bars() || [];
      it.st = {}; compute(it.inst, bars, 0, it.st);
      Object.keys(it.series).forEach(function (k) { it.series[k].setData(bars.map(function (b, i) { return point(it, k, i, b); })); });
    }
    function oscIds() { return order.filter(function (id) { return TYPES[items[id].inst.type].kind === 'osc'; }); }
    function relayout() {
      var ids = oscIds();
      m = margins(ids.length, !!o.vol());
      ids.forEach(function (id, i) { try { chart.priceScale('bt-ind-' + id).applyOptions({ scaleMargins: { top: m.osc[i].top, bottom: m.osc[i].bottom }, visible: false }); } catch (e) { /* ignore */ } });
      o.layout(m);
      if (api.requestUpdate) api.requestUpdate();
    }
    // the stored list -> series (unchanged ones stay, a color change only restyles)
    function apply(list) {
      if (!alive) return;
      var want = {}, next = [];
      (list || []).forEach(function (inst) { if (!inst.hidden && TYPES[inst.type]) { want[inst.id] = inst; next.push(inst.id); } });
      Object.keys(items).forEach(function (id) {
        var it = items[id];
        if (!want[id] || calcKey(want[id]) !== it.key) { dropSeries(it); delete items[id]; }
      });
      next.forEach(function (id) {
        var inst = want[id], it = items[id];
        if (!it) { it = items[id] = { inst: inst, key: calcKey(inst), st: {} }; makeSeries(it); fill(it); return; }
        var recolor = JSON.stringify(it.inst.colors) !== JSON.stringify(inst.colors);
        it.inst = inst;
        if (recolor) {
          TYPES[inst.type].lines.forEach(function (l) { if (it.series[l.k] && !l.hist) it.series[l.k].applyOptions({ color: inst.colors[l.k] }); });
          if (it.series.hist) fill(it);
        }
      });
      order = next;
      relayout();
    }
    // all values again (new candles loaded, a trimmed history)
    function setData() { order.forEach(function (id) { fill(items[id]); }); if (api.requestUpdate) api.requestUpdate(); }
    // the replay changed bars[from..] (the last candle grew or new ones came)
    function update(from) {
      var bars = o.bars() || [];
      order.forEach(function (id) {
        var it = items[id];
        compute(it.inst, bars, from, it.st);
        Object.keys(it.series).forEach(function (k) {
          for (var i = Math.max(0, from); i < bars.length; i++) {
            var pt = point(it, k, i, bars[i]);
            if (pt.value != null) { try { it.series[k].update(pt); } catch (e) { fill(it); return; } }
          }
        });
      });
      if (api.requestUpdate) api.requestUpdate();
    }
    // lowest and highest overlay value in bars[a..b] (the page's price scale self-check counts them as part of the chart)
    function range(a, b) {
      var lo = Infinity, hi = -Infinity;
      order.forEach(function (id) {
        var it = items[id]; if (TYPES[it.inst.type].kind !== 'overlay') return;
        Object.keys(it.series).forEach(function (k) {
          var v = it.st.out[k] || [];
          for (var i = Math.max(0, a); i <= Math.min(v.length - 1, b); i++) if (v[i] != null) { lo = Math.min(lo, v[i]); hi = Math.max(hi, v[i]); }
        });
      });
      return isFinite(lo) ? { lo: lo, hi: hi } : null;
    }
    function fmtVal(inst, v) {
      if (v == null || !isFinite(v)) return '—';
      var d = TYPES[inst.type].decimals;
      return d != null ? v.toFixed(d) : o.fmt(v);
    }
    // ------------------------------------------------ drawing: Bollinger fill, band lines, levels, names, values
    function opt() { var l = chart.options().layout || {}; return { font: l.fontFamily || 'sans-serif', text: l.textColor || '#999' }; }
    function bgColor() {
      var b = (chart.options().layout || {}).background || {};
      return b.color && b.color !== 'transparent' ? b.color : (o.light && o.light() ? '#ffffff' : '#000000');
    }
    function at(it) { var n = (o.bars() || []).length; return hover != null && hover >= 0 && hover < n ? hover : n - 1; }
    function valuesText(it, i) {
      return TYPES[it.inst.type].lines.filter(function (l) { return !l.colorOnly; }).map(function (l) {
        var v = it.st.out[l.k] ? it.st.out[l.k][i] : null;
        return { text: fmtVal(it.inst, v), color: l.hist ? (v != null && v < 0 ? it.inst.colors.histDown : it.inst.colors.hist) : it.inst.colors[l.k] };
      });
    }
    function drawLabel(ctx, x, y, it, font) {
      var parts = [{ text: label(it.inst), color: opt().text }].concat(valuesText(it, at(it)));
      ctx.font = font; ctx.textBaseline = 'middle';
      var w = 0; parts.forEach(function (p, k) { w += ctx.measureText(p.text).width + (k ? 8 : 0); });
      ctx.globalAlpha = 0.72; ctx.fillStyle = bgColor(); ctx.fillRect(x - 3, y - 8, w + 6, 16); ctx.globalAlpha = 1;
      parts.forEach(function (p, k) { ctx.fillStyle = p.color; ctx.fillText(p.text, x, y); x += ctx.measureText(p.text).width + 8; });
    }
    var bgRenderer = {
      draw: function () {},
      drawBackground: function (target) {
        if (!api.chart || !api.series) return;
        var ts = chart.timeScale(), r = ts.getVisibleLogicalRange(); if (!r) return;
        target.useMediaCoordinateSpace(function (scope) {
          var ctx = scope.context, W = scope.mediaSize.width, H = scope.mediaSize.height;
          // Bollinger fill between the bands
          order.forEach(function (id) {
            var it = items[id], T = TYPES[it.inst.type]; if (!T.fill) return;
            var up = it.st.out[T.fill[0]] || [], lo = it.st.out[T.fill[1]] || [], a = Math.max(0, Math.floor(r.from) - 1), b = Math.min(up.length - 1, Math.ceil(r.to) + 1);
            var top = [], bot = [];
            for (var i = a; i <= b; i++) {
              if (up[i] == null || lo[i] == null) continue;
              var x = ts.logicalToCoordinate(i), y1 = api.series.priceToCoordinate(up[i]), y2 = api.series.priceToCoordinate(lo[i]);
              if (x === null || y1 === null || y2 === null) continue;
              top.push([x, y1]); bot.push([x, y2]);
            }
            if (top.length < 2) return;
            ctx.beginPath(); ctx.moveTo(top[0][0], top[0][1]);
            top.forEach(function (q) { ctx.lineTo(q[0], q[1]); });
            for (var j = bot.length - 1; j >= 0; j--) ctx.lineTo(bot[j][0], bot[j][1]);
            ctx.closePath(); ctx.fillStyle = withAlpha(it.inst.colors[T.fill[0]], 0.08); ctx.fill();
          });
          // oscillator bands: a line on top, the levels dashed
          var ids = oscIds(), grid = withAlpha(opt().text, 0.28);
          ids.forEach(function (id, n) {
            var it = items[id], T = TYPES[it.inst.type], band = m.osc[n]; if (!band) return;
            var y0 = Math.round(band.y0 * H) + 0.5;
            ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.setLineDash([]);
            ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y0); ctx.stroke();
            var s0 = it.series[T.lines.filter(function (l) { return !l.colorOnly; })[0].k];
            ctx.setLineDash([3, 4]); ctx.strokeStyle = withAlpha(opt().text, 0.35);
            (T.levels || []).forEach(function (lv) {
              var y = s0 ? s0.priceToCoordinate(lv) : null; if (y === null || y < y0 || y > band.y1 * H) return;
              ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); ctx.stroke();
            });
            ctx.setLineDash([]);
          });
        });
      }
    };
    var topRenderer = {
      draw: function (target) {
        if (!api.chart) return;
        target.useMediaCoordinateSpace(function (scope) {
          var ctx = scope.context, W = scope.mediaSize.width, H = scope.mediaSize.height, f = opt(), font = '11px ' + f.font;
          ctx.save();
          // overlay names and values in the top left corner, one row each
          var y = 12;
          order.forEach(function (id) { var it = items[id]; if (TYPES[it.inst.type].kind !== 'overlay') return; drawLabel(ctx, 8, y, it, font); y += 17; });
          // oscillators: name and values at the top of their band (their values on the axis: axisRenderer)
          oscIds().forEach(function (id, n) {
            var band = m.osc[n]; if (!band) return;
            drawLabel(ctx, 8, band.y0 * H + 10, items[id], font);
          });
          ctx.restore();
        });
      }
    };
    // The price axis next to the oscillator bands: the candles' prices would run on into them (Lightweight Charts 4 has one right
    // scale), so the bands get their own axis strip like a TradingView pane: the levels and the current value of each line.
    var axisRenderer = {
      draw: function (target) {
        if (!api.chart) return;
        var ids = oscIds(); if (!ids.length) return;
        target.useMediaCoordinateSpace(function (scope) {
          var ctx = scope.context, W = scope.mediaSize.width, H = scope.mediaSize.height, f = opt(), lay = chart.options().layout || {};
          var font = (lay.fontSize || 12) + 'px ' + f.font, top = Math.round(m.osc[0].y0 * H);
          ctx.save();
          ctx.fillStyle = bgColor(); ctx.fillRect(0, top, W, H - top);
          ctx.font = font; ctx.textBaseline = 'middle';
          ids.forEach(function (id, n) {
            var it = items[id], T = TYPES[it.inst.type], band = m.osc[n]; if (!band) return;
            var y0 = band.y0 * H, y1 = band.y1 * H, lines = T.lines.filter(function (l) { return !l.colorOnly; }), s0 = it.series[lines[0].k];
            ctx.strokeStyle = withAlpha(f.text, 0.28); ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, Math.round(y0) + 0.5); ctx.lineTo(W, Math.round(y0) + 0.5); ctx.stroke();
            // value tags of the lines, pushed apart so two close values never cover each other (as on TradingView)
            var i = at(it), tags = [];
            lines.forEach(function (l) {
              if (l.hist || !it.series[l.k]) return;
              var v = it.st.out[l.k] ? it.st.out[l.k][i] : null; if (v == null) return;
              var y = it.series[l.k].priceToCoordinate(v); if (y === null) return;
              tags.push({ y: y, text: fmtVal(it.inst, v), color: it.inst.colors[l.k] });
            });
            layoutTags(tags, y0 + 9, y1 - 9, 18);
            // the levels, unless a value tag sits on them
            ctx.fillStyle = withAlpha(f.text, 0.7);
            (T.levels || []).forEach(function (lv) {
              var y = s0 ? s0.priceToCoordinate(lv) : null; if (y === null || y < y0 + 6 || y > y1 - 6) return;
              if (tags.some(function (g) { return Math.abs(g.y - y) < 15; })) return;
              ctx.fillText(T.decimals != null ? String(lv) : fmtVal(it.inst, lv), 8, y);
            });
            tags.forEach(function (g) {
              ctx.fillStyle = g.color; ctx.fillRect(0, g.y - 9, W, 18);
              ctx.fillStyle = onColor(g.color); ctx.fillText(g.text, 8, g.y);
            });
          });
          ctx.restore();
        });
      }
    };
    var axisViews = [{ renderer: function () { return axisRenderer; }, zOrder: function () { return 'top'; } }];
    var views = [
      { renderer: function () { return bgRenderer; }, zOrder: function () { return 'bottom'; } },
      { renderer: function () { return topRenderer; }, zOrder: function () { return 'top'; } }
    ];
    var prim = {
      attached: function (p) { api = p; },
      detached: function () { api = { requestUpdate: null }; },
      paneViews: function () { return order.length ? views : []; },
      priceAxisPaneViews: function () { return oscIds().length ? axisViews : []; },
      autoscaleInfo: function () { return null; },
      updateAllViews: function () {}
    };
    o.series.attachPrimitive(prim);
    // over an oscillator band the crosshair's price label would show a candle price: hidden there (the band shows its values)
    var priceLabelOff = false;
    function onMove(p) {
      var h = p && p.point && p.logical != null ? Math.round(p.logical) : null;
      if (h !== hover) { hover = h; if (api.requestUpdate && order.length) api.requestUpdate(); }
      var off = false;
      if (p && p.point && m.osc.length) {
        var el = chart.chartElement ? chart.chartElement() : null, ph = el ? el.clientHeight - chart.timeScale().height() : 0;
        off = ph > 0 && p.point.y >= m.osc[0].y0 * ph;
      }
      if (off !== priceLabelOff) { priceLabelOff = off; try { chart.applyOptions({ crosshair: { horzLine: { labelVisible: !off } } }); } catch (e) { /* ignore */ } }
    }
    chart.subscribeCrosshairMove(onMove);
    function destroy() {
      if (!alive) return; alive = false;
      try { chart.unsubscribeCrosshairMove(onMove); } catch (e) { /* ignore */ }
      try { o.series.detachPrimitive(prim); } catch (e) { /* ignore */ }
      Object.keys(items).forEach(function (id) { dropSeries(items[id]); });
      items = {}; order = [];
    }
    return {
      apply: apply, setData: setData, update: update, range: range, destroy: destroy,
      margins: function () { return m; },
      count: function () { return order.length; },
      values: function (id, i) { var it = items[id]; return it ? valuesText(it, i == null ? at(it) : i) : null; }
    };
  }

  // Axis tags { y } kept inside [lo, hi] and at least `gap` apart, each as close to its own value as possible (sorted by y; pushed
  // down from the top, then back up from the bottom). Changes the tags in place.
  function layoutTags(tags, lo, hi, gap) {
    if (!tags.length) return tags;
    tags.sort(function (a, b) { return a.y - b.y; });
    var i;
    for (i = 0; i < tags.length; i++) tags[i].y = Math.max(tags[i].y, lo, i ? tags[i - 1].y + gap : lo);
    for (i = tags.length - 1; i >= 0; i--) tags[i].y = Math.min(tags[i].y, i < tags.length - 1 ? tags[i + 1].y - gap : hi);
    return tags;
  }
  // '#22c55e' + 0.4 -> 'rgba(34,197,94,0.4)'
  function withAlpha(c, a) {
    var mm = /^#([0-9a-f]{6})$/i.exec(String(c || '').trim());
    if (!mm) return c;
    var h = mm[1];
    return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
  }
  // black or white text on a color
  function onColor(c) {
    var mm = /^#([0-9a-f]{6})$/i.exec(String(c || '')); if (!mm) return '#ffffff';
    var h = mm[1], l = (0.299 * parseInt(h.slice(0, 2), 16) + 0.587 * parseInt(h.slice(2, 4), 16) + 0.114 * parseInt(h.slice(4, 6), 16)) / 255;
    return l > 0.6 ? '#111111' : '#ffffff';
  }

  // ---------------------------------------------------------------- indicators drawer (browser)
  // opts: { box, t (i18n), state() -> stored state, change(next, how) (the page stores and applies it; how: 'colors' while a color
  //         picker is open, otherwise 'full') }
  function mountDrawer(opts) {
    var box = opts.box, t = opts.t, focusId = null, focusType = null;
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function icon(name) { var i = el('i'); i.setAttribute('data-lucide', name); i.setAttribute('aria-hidden', 'true'); return i; }
    function section(title) { var s = el('section', 'bt-look-sec'), h = el('h4', 'bt-look-h'); h.appendChild(el('span', '', title)); s.appendChild(h); box.appendChild(s); return s; }
    function clone(s) { return JSON.parse(JSON.stringify(s)); }
    function commit(next, how) { opts.change(normalize(next), how || 'full'); if (how !== 'colors') render(); }
    function render() {
      var st = opts.state(), full = st.list.length >= MAX;
      box.textContent = '';
      // the add buttons stay on top while the list scrolls (adding several in a row)
      var s1 = section(t('backtest.ind.add', 'İndikatör ekle')), grid = el('div', 'bt-ind-types');
      s1.classList.add('bt-ind-add');
      TYPE_IDS.forEach(function (id) {
        var b = el('button', 'bt-ind-type', SHORT[id]), full_ = t('backtest.ind.type_' + id, id); b.type = 'button'; b.setAttribute('data-add', id); b.disabled = full;
        b.title = full_; b.setAttribute('aria-label', t('backtest.ind.add', 'İndikatör ekle') + ': ' + full_ + ' (' + SHORT[id] + ')');
        grid.appendChild(b);
      });
      s1.appendChild(grid);
      if (full) s1.appendChild(el('p', 'bt-hint', t('backtest.ind.max', 'En fazla {max} indikatör eklenebilir.', { max: MAX })));
      var s2 = section(t('backtest.ind.on_chart', 'Grafikteki indikatörler') + ' · ' + st.list.length + ' / ' + MAX);
      if (!st.list.length) s2.appendChild(el('p', 'bt-hint', t('backtest.ind.empty', 'Henüz indikatör yok. Yukarıdan bir tane ekle.')));
      st.list.forEach(function (inst) {
        var T = TYPES[inst.type], card = el('div', 'bt-ind-card'); card.setAttribute('data-id', inst.id);
        if (inst.hidden) card.setAttribute('data-hidden', '1');
        var head = el('div', 'bt-ind-head'), dot = el('span', 'bt-ind-dot'); dot.style.background = inst.colors[T.lines[0].k];
        head.appendChild(dot); head.appendChild(el('b', 'bt-ind-name', label(inst))); head.appendChild(el('span', 'bt-ind-kind', t('backtest.ind.type_' + inst.type, inst.type)));
        var eye = el('button', 'bt-icon-btn bt-ind-btn'); eye.type = 'button'; eye.setAttribute('data-act', 'toggle');
        var eyeTitle = inst.hidden ? t('backtest.ind.show', 'Göster') : t('backtest.ind.hide', 'Gizle');
        eye.title = eyeTitle; eye.setAttribute('aria-label', eyeTitle + ': ' + label(inst)); eye.setAttribute('aria-pressed', inst.hidden ? 'true' : 'false');
        eye.appendChild(icon(inst.hidden ? 'eye-off' : 'eye'));
        var del = el('button', 'bt-icon-btn bt-ind-btn'); del.type = 'button'; del.setAttribute('data-act', 'del');
        del.title = t('backtest.ind.remove', 'Kaldır'); del.setAttribute('aria-label', del.title + ': ' + label(inst)); del.appendChild(icon('trash-2'));
        head.appendChild(eye); head.appendChild(del); card.appendChild(head);
        var ps = el('div', 'bt-ind-params');
        T.params.forEach(function (d) {
          var lab = el('label', 'bt-ind-field'); lab.appendChild(el('span', '', t('backtest.ind.param_' + d.k, d.k)));
          var inp;
          if (d.k === 'source') {
            inp = el('select', 'bt-select');
            SOURCES.forEach(function (s) { var op = el('option', '', t('backtest.ind.src_' + s, s)); op.value = s; inp.appendChild(op); });
            inp.value = inst.params.source;
          } else {
            inp = el('input', 'bt-input bt-num'); inp.type = 'number'; inp.min = d.min; inp.max = d.max; inp.step = d.step || 1; inp.value = inst.params[d.k];
            inp.inputMode = d.step ? 'decimal' : 'numeric';
          }
          inp.setAttribute('data-param', d.k); lab.appendChild(inp); ps.appendChild(lab);
        });
        card.appendChild(ps);
        var cs = el('div', 'bt-ind-colors');
        T.lines.forEach(function (l) {
          var lab = el('label', 'bt-look-color'), inp = el('input'); inp.type = 'color'; inp.value = inst.colors[l.k]; inp.setAttribute('data-color', l.k);
          lab.appendChild(inp); lab.appendChild(el('span', '', t('backtest.ind.line_' + l.k, l.k))); cs.appendChild(lab);
        });
        card.appendChild(cs);
        s2.appendChild(card);
      });
      if (st.list.length) {
        var all = el('button', 'bt-link-btn', t('backtest.ind.remove_all', 'Tümünü kaldır')); all.type = 'button'; all.setAttribute('data-act', 'clear');
        s2.appendChild(all);
      }
      box.appendChild(el('p', 'bt-hint bt-look-foot', t('backtest.ind.stored_note', 'İndikatörler bu tarayıcıda saklanır ve tüm grafiklerde görünür. Değerler gerçek fiyatlardan hesaplanır (Heikin Ashi seçiliyken de).')));
      if (global.lucide && global.lucide.createIcons) { try { global.lucide.createIcons({ nameAttr: 'data-lucide' }); } catch (e) { /* ignore */ } }
      // a new indicator: its card comes into view and flashes; the focus stays on the add button (the next one is one press away)
      if (focusId) {
        var c = box.querySelector('.bt-ind-card[data-id="' + focusId + '"]'), addBtn = box.querySelector('[data-add="' + focusType + '"]'); focusId = null;
        if (c) { if (c.scrollIntoView) c.scrollIntoView({ block: 'nearest' }); c.classList.add('bt-ind-new'); }
        if (addBtn && !addBtn.disabled) addBtn.focus();
      }
    }
    function find(next, e) {
      var card = e.target.closest('.bt-ind-card'); if (!card) return null;
      var id = card.getAttribute('data-id'), hit = null;
      next.list.forEach(function (x) { if (x.id === id) hit = x; });
      return hit;
    }
    function onClick(e) {
      var b = e.target.closest('button'); if (!b || !box.contains(b)) return;
      var next = clone(opts.state());
      if (b.hasAttribute('data-add')) {
        if (next.list.length >= MAX) return;
        var inst = create(b.getAttribute('data-add')); next.list.push(inst); focusId = inst.id; focusType = inst.type;
        return commit(next, 'full');
      }
      var act = b.getAttribute('data-act');
      if (act === 'clear') { next.list = []; return commit(next, 'full'); }
      var hit = find(next, e); if (!hit) return;
      if (act === 'toggle') { hit.hidden = !hit.hidden; return commit(next, 'full'); }
      if (act === 'del') { next.list = next.list.filter(function (x) { return x !== hit; }); return commit(next, 'full'); }
    }
    function onInput(e) {
      var k = e.target.getAttribute('data-color'); if (!k) return;
      var next = clone(opts.state()), hit = find(next, e); if (!hit) return;
      hit.colors[k] = e.target.value; commit(next, 'colors');                    // live while the picker is open, no re-render
    }
    function onChange(e) {
      var next = clone(opts.state()), hit = find(next, e); if (!hit) return;
      var k = e.target.getAttribute('data-param'), c = e.target.getAttribute('data-color');
      if (c) { hit.colors[c] = e.target.value; return commit(next, 'full'); }
      if (k) { hit.params[k] = k === 'source' ? e.target.value : e.target.value; return commit(next, 'full'); }
    }
    box.addEventListener('click', onClick);
    box.addEventListener('input', onInput);
    box.addEventListener('change', onChange);
    return { render: render };
  }

  global.WwBtInd = {
    KEY: KEY, MAX: MAX, TYPES: TYPES, TYPE_IDS: TYPE_IDS, SOURCES: SOURCES, SHORT: SHORT,
    cleanInst: cleanInst, create: create, normalize: normalize, load: load, save: save, label: label, calcKey: calcKey,
    srcVal: srcVal, compute: compute, margins: margins, layoutTags: layoutTags, attach: attach, withAlpha: withAlpha, onColor: onColor, mountDrawer: mountDrawer
  };
})(typeof window !== 'undefined' ? window : globalThis);
