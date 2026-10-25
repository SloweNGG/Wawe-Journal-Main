// Backtest v2: 1m -> timeframe aggregation and cursor maths (window.WwBtCandles). Pure: no DOM, no network.
// Data types:
//   Minutes: { n, t: Float64Array (UTC s of the 1m bar open), o, h, l, c: Int32Array (integer POINTS) }
//   Candle:  { time (bucket start, UTC s), open, high, low, close, n, v } in points. n = 1m bars inside, v = sum of their ranges
//            (high - low, points): the "volume" bars of the chart. Neither data source delivers traded volume, so the page labels
//            it as an activity estimate.
// Depends on WwBtSymbols (dayAnchor, nextOpen).
(function (global) {
  'use strict';

  var TF_IDS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
  var TF_MIN = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440 };
  var TF_LABEL = { '1m': 'M1', '5m': 'M5', '15m': 'M15', '30m': 'M30', '1h': 'H1', '4h': 'H4', '1d': 'D1' };
  var HISTORY_MONTHS = { 1: 1, 5: 1, 15: 1, 30: 2, 60: 2, 240: 4, 1440: 10 };
  var INT32_MAX = 2147483647;

  function S() { return global.WwBtSymbols; }
  function symId(x) { return typeof x === 'string' ? x : x.id; }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function historyMonths(tfMin) { return HISTORY_MONTHS[tfMin] || 1; }

  // ---------------------------------------------------------------- month keys
  function monthKey(tSec) {
    var d = new Date(tSec * 1000);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1);
  }
  function monthStart(key) { return Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, 1) / 1000; }
  function addMonths(key, n) {
    var t = new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1 + n, 1));
    return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1);
  }
  function nextMonth(key) { return addMonths(key, 1); }
  function prevMonth(key) { return addMonths(key, -1); }

  // ---------------------------------------------------------------- Minutes
  function emptyMinutes() {
    return { n: 0, t: new Float64Array(0), o: new Int32Array(0), h: new Int32Array(0), l: new Int32Array(0), c: new Int32Array(0), bad: 0 };
  }
  // rows [t,o,h,l,c]; prices decimal numbers (or points when opts.points). Bad rows are dropped and counted.
  function toMinutes(rows, digits, opts) {
    var scale = Math.pow(10, digits), pts = !!(opts && opts.points);
    var N = rows.length, t = new Float64Array(N), o = new Int32Array(N), h = new Int32Array(N), l = new Int32Array(N), c = new Int32Array(N);
    var n = 0, bad = 0, last = -Infinity;
    for (var i = 0; i < N; i++) {
      var r = rows[i], ts = r[0];
      var f = pts ? 1 : scale;
      var vo = r[1] * f, vh = r[2] * f, vl = r[3] * f, vc = r[4] * f;
      var ok = isFinite(ts) && isFinite(vo) && isFinite(vh) && isFinite(vl) && isFinite(vc) && ts > last;
      if (ok && !pts) {
        ok = Math.abs(vo - Math.round(vo)) <= 1e-6 && Math.abs(vh - Math.round(vh)) <= 1e-6 &&
             Math.abs(vl - Math.round(vl)) <= 1e-6 && Math.abs(vc - Math.round(vc)) <= 1e-6;
      }
      // positive and inside the Int32 point arrays (a larger value would wrap to a negative price)
      if (ok) ok = vo > 0 && vh > 0 && vl > 0 && vc > 0 && vo <= INT32_MAX && vh <= INT32_MAX && vl <= INT32_MAX && vc <= INT32_MAX;
      if (!ok) { bad++; continue; }
      t[n] = ts; o[n] = Math.round(vo); h[n] = Math.round(vh); l[n] = Math.round(vl); c[n] = Math.round(vc);
      last = ts; n++;
    }
    return { n: n, t: t.subarray(0, n), o: o.subarray(0, n), h: h.subarray(0, n), l: l.subarray(0, n), c: c.subarray(0, n), bad: bad };
  }
  function concatMinutes(a, b) {
    if (!a || !a.n) return b || emptyMinutes();
    if (!b || !b.n) return a;
    if (!(a.t[a.n - 1] < b.t[0])) {
      var e = new Error('BT_NON_MONOTONIC'); e.code = 'BT_NON_MONOTONIC'; throw e;
    }
    var n = a.n + b.n, t = new Float64Array(n), o = new Int32Array(n), h = new Int32Array(n), l = new Int32Array(n), c = new Int32Array(n);
    t.set(a.t, 0); t.set(b.t, a.n); o.set(a.o, 0); o.set(b.o, a.n); h.set(a.h, 0); h.set(b.h, a.n);
    l.set(a.l, 0); l.set(b.l, a.n); c.set(a.c, 0); c.set(b.c, a.n);
    return { n: n, t: t, o: o, h: h, l: l, c: c, bad: (a.bad || 0) + (b.bad || 0) };
  }
  function sliceMinutes(m, from) {
    from = Math.max(0, Math.min(from, m.n));
    return { n: m.n - from, t: m.t.subarray(from), o: m.o.subarray(from), h: m.h.subarray(from), l: m.l.subarray(from), c: m.c.subarray(from), bad: m.bad || 0 };
  }
  // first i with t[i] >= tSec, or m.n
  function indexAtOrAfter(m, tSec) {
    var lo = 0, hi = m.n;
    while (lo < hi) { var mid = (lo + hi) >>> 1; if (m.t[mid] < tSec) lo = mid + 1; else hi = mid; }
    return lo;
  }
  // last i with t[i] <= tSec, or -1
  function indexAtOrBefore(m, tSec) {
    var lo = 0, hi = m.n;                                  // first index with t > tSec, minus one
    while (lo < hi) { var mid = (lo + hi) >>> 1; if (m.t[mid] <= tSec) lo = mid + 1; else hi = mid; }
    return lo - 1;
  }
  function resumeIndex(m, replaySec) { return indexAtOrBefore(m, replaySec - 60); }

  // ---------------------------------------------------------------- buckets
  var anchorCache = { id: null, hour: NaN, anchor: 0 };
  function anchorSec(tSec, id) {
    var h = Math.floor(tSec / 3600);
    if (anchorCache.id === id && anchorCache.hour === h) return anchorCache.anchor;
    var a = S().dayAnchor(h * 3600000, id) / 1000;
    anchorCache.id = id; anchorCache.hour = h; anchorCache.anchor = a;
    return a;
  }
  // Up to H1: UTC grid. H4: from the trading-day anchor. D1: the trading-day anchor itself
  // (17:00 New York for FX/gold, 00:00 UTC for crypto), which also covers 23/25-hour DST days.
  function bucketStart(tSec, tfMin, id) {
    id = symId(id);
    if (tfMin <= 60) { var g = tfMin * 60; return tSec - (((tSec % g) + g) % g); }
    var a = anchorSec(tSec, id);
    if (tfMin === 1440) return a;
    var step = tfMin * 60;
    return a + Math.floor((tSec - a) / step) * step;
  }

  // candles from the existing 1m bars only (no synthetic bars), indexes from..to inclusive
  function aggregate(m, tfMin, id, from, to) {
    id = symId(id);
    var out = [], cur = null, i0 = from || 0, i1 = to == null ? m.n - 1 : to;
    for (var i = i0; i <= i1; i++) {
      var s = bucketStart(m.t[i], tfMin, id);
      if (!cur || cur.time !== s) { cur = { time: s, open: m.o[i], high: m.h[i], low: m.l[i], close: m.c[i], n: 1, v: m.h[i] - m.l[i] }; out.push(cur); }
      else { if (m.h[i] > cur.high) cur.high = m.h[i]; if (m.l[i] < cur.low) cur.low = m.l[i]; cur.close = m.c[i]; cur.n++; cur.v += m.h[i] - m.l[i]; }
    }
    return out;
  }
  // everything the user may see at timestamp tCursor (1m bars with t <= tCursor): never anything later
  function aggregateUpTo(m, tCursor, tfMin, id) {
    var k = indexAtOrBefore(m, tCursor);
    return k < 0 ? [] : aggregate(m, tfMin, id, 0, k);
  }
  // the in-progress candle at the cursor index k
  function partialAt(m, k, tfMin, id) {
    id = symId(id);
    var s = bucketStart(m.t[k], tfMin, id), i = k;
    while (i > 0 && bucketStart(m.t[i - 1], tfMin, id) === s) i--;
    return aggregate(m, tfMin, id, i, k)[0];
  }
  // concatenation that merges a boundary bucket with an equal time (D1/H4 FX buckets cross month files)
  function merge(a, b) {
    if (!a || !a.length) return b ? b.slice() : [];
    if (!b || !b.length) return a.slice();
    var la = a[a.length - 1], fb = b[0];
    if (fb.time < la.time) { var e = new Error('BT_NON_MONOTONIC'); e.code = 'BT_NON_MONOTONIC'; throw e; }
    if (fb.time === la.time) {
      var m = { time: la.time, open: la.open, high: Math.max(la.high, fb.high), low: Math.min(la.low, fb.low), close: fb.close, n: la.n + fb.n, v: (la.v || 0) + (fb.v || 0) };
      return a.slice(0, -1).concat([m], b.slice(1));
    }
    return a.concat(b);
  }
  // incremental builder over a shared candles array: push(t,o,h,l,c) -> index of the changed candle
  function createBuilder(tfMin, id, candles) {
    id = symId(id);
    var b = {
      candles: candles,
      push: function (t, o, h, l, c) {
        var s = bucketStart(t, tfMin, id), last = candles.length ? candles[candles.length - 1] : null;
        if (last && last.time === s) {
          if (h > last.high) last.high = h;
          if (l < last.low) last.low = l;
          last.close = c; last.n++; last.v = (last.v || 0) + (h - l);
          return candles.length - 1;
        }
        candles.push({ time: s, open: o, high: h, low: l, close: c, n: 1, v: h - l });
        return candles.length - 1;
      }
    };
    return b;
  }
  // last index j >= k that lies in the same bucket as k; j === m.n-1 means the bucket may continue in unloaded data
  function bucketEndIndex(m, k, tfMin, id) {
    id = symId(id);
    var s = bucketStart(m.t[k], tfMin, id), j = k;
    while (j + 1 < m.n && bucketStart(m.t[j + 1], tfMin, id) === s) j++;
    return j;
  }
  // "step one candle": finish the current candle, or the next one when the current is already complete
  function stepTarget(m, k, tfMin, id) {
    if (k >= m.n - 1) return { j: k, open: true };
    var je = bucketEndIndex(m, k, tfMin, id), j = je > k ? je : bucketEndIndex(m, k + 1, tfMin, id);
    return { j: j, open: j === m.n - 1 };
  }
  // null when the step is <= 60 s; otherwise a closed-market gap (weekend, break, holiday) or missing data
  function gapKind(prevT, t, id) {
    id = symId(id);
    if (t - prevT <= 60) return null;
    var no = S().nextOpen((prevT + 60) * 1000, id);
    if (no === null || no >= t * 1000) return { kind: 'closed', minutes: Math.round((t - prevT - 60) / 60) };
    return { kind: 'missing', minutes: Math.round((t * 1000 - no) / 60000) };
  }
  // play accumulator: speed = chart candles per second, so a candle of tfMin minutes is revealed in 1/speed s
  function framePlan(acc, dtMs, speed, tfMin, maxBars) {
    var a = acc + Math.min(dtMs, 250) / 1000 * speed * tfMin;
    var n = Math.min(Math.floor(a), maxBars);
    return { n: n, acc: Math.floor(a) > maxBars ? 0 : a - n };
  }
  function toChartBar(c, scale) {
    return { time: c.time, open: c.open / scale, high: c.high / scale, low: c.low / scale, close: c.close / scale };
  }
  // a bar a chart series may receive: finite, positive prices, low <= open/close <= high
  function validBar(b) {
    return !!b && isFinite(b.time) && isFinite(b.open) && isFinite(b.high) && isFinite(b.low) && isFinite(b.close) &&
      b.low > 0 && b.low <= b.high && b.open >= b.low && b.open <= b.high && b.close >= b.low && b.close <= b.high;
  }
  // every 1m bar positive and in range (records cached by an older page version are checked before use)
  function validMinutes(m) {
    if (!m || !(m.n >= 0) || !m.t || !m.o || m.t.length < m.n) return false;
    for (var i = 0; i < m.n; i++) {
      if (!(m.l[i] > 0 && m.o[i] > 0 && m.c[i] > 0 && m.h[i] > 0 && m.l[i] <= m.h[i]) || !isFinite(m.t[i]) || (i && !(m.t[i] > m.t[i - 1]))) return false;
    }
    return true;
  }

  global.WwBtCandles = {
    TF_IDS: TF_IDS, TF_MIN: TF_MIN, TF_LABEL: TF_LABEL,
    historyMonths: historyMonths, monthKey: monthKey, monthStart: monthStart, addMonths: addMonths,
    nextMonth: nextMonth, prevMonth: prevMonth,
    emptyMinutes: emptyMinutes, toMinutes: toMinutes, concatMinutes: concatMinutes, sliceMinutes: sliceMinutes,
    indexAtOrAfter: indexAtOrAfter, indexAtOrBefore: indexAtOrBefore, resumeIndex: resumeIndex,
    bucketStart: bucketStart, aggregate: aggregate, aggregateUpTo: aggregateUpTo, partialAt: partialAt,
    merge: merge, createBuilder: createBuilder, bucketEndIndex: bucketEndIndex, stepTarget: stepTarget,
    gapKind: gapKind, framePlan: framePlan, toChartBar: toChartBar, validBar: validBar, validMinutes: validMinutes
  };
})(typeof window !== 'undefined' ? window : globalThis);
