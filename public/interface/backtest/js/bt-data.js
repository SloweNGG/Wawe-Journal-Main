// Backtest v2: candle sources (window.WwBtData). Phase A ships the SyntheticSource only: candles are
// generated in the browser (bt-synthetic.js), no network, no storage, no licence. The CandleSource
// interface is the one the archive source (Phase E) will implement, so the page does not change:
//   kind, provider(symbolId), label(symbolId), coverage(symbolId) -> Promise<{symbol, firstT, lastT, months, partial, updatedAt}>,
//   getMonth(symbolId, 'YYYY-MM', {signal}) -> Promise<rows [[t,o,h,l,c], ...] decimal prices>,
//   getMonthMinutes(symbolId, key, {signal}) -> Promise<Minutes in points> (fast path, optional),
//   prefetch(symbolId, key), isCached(symbolId, key)
// Errors reject with Error{code: 'NOT_FOUND' | 'ABORTED' | 'CORRUPT'}.
// Depends on WwBtSymbols, WwBtCandles, WwBtSynthetic.
(function (global) {
  'use strict';

  var FIRST_MONTH = '2024-01';
  var CACHE_MAX = 8;                       // months kept in memory (LRU)

  function fail(code, msg) { var e = new Error(msg || code); e.code = code; return e; }

  function createSyntheticSource(opts) {
    opts = opts || {};
    var S = global.WwBtSymbols, C = global.WwBtCandles, Y = global.WwBtSynthetic;
    var seed = opts.seed === undefined ? 1 : opts.seed;
    var nowMs = typeof opts.now === 'function' ? opts.now : function () { return Date.now(); };
    var gen = Y.createGenerator({ S: S, seed: seed });
    var cache = {}, order = [], inflight = {};

    // complete UTC days up to yesterday, like a real daily feed
    function lastMonthKey() { return C.monthKey(Math.floor(nowMs() / 86400000) * 86400 - 86400); }
    function endOfFeedSec() { return Math.floor(nowMs() / 86400000) * 86400; }   // 00:00 UTC today (exclusive)

    function months() {
      var out = [], k = FIRST_MONTH, last = lastMonthKey();
      while (k <= last) { out.push(k); k = C.nextMonth(k); }
      return out;
    }
    function touch(ck) {
      var i = order.indexOf(ck); if (i >= 0) order.splice(i, 1);
      order.push(ck);
      while (order.length > CACHE_MAX) delete cache[order.shift()];
    }
    function build(symbolId, key) {
      var s = S.get(symbolId);
      if (!s) throw fail('NOT_FOUND', 'unknown symbol ' + symbolId);
      var rows = Y.generateMonth(gen, s, key), end = endOfFeedSec(), pts = [];
      for (var i = 0; i < rows.length; i++) if (rows[i][0] < end) pts.push(rows[i]);
      return C.toMinutes(pts, s.digits, { points: true });
    }

    var src = {
      kind: 'synthetic',
      provider: function () { return 'Synthetic'; },
      label: function () { return 'synthetic'; },
      coverage: function (symbolId) {
        return new Promise(function (resolve, reject) {
          var s = S.get(symbolId);
          if (!s) return reject(fail('NOT_FOUND', 'unknown symbol ' + symbolId));
          var ms = months(), last = lastMonthKey();
          var firstT = C.monthStart(ms[0]);
          resolve({
            symbol: s.id, firstT: firstT, lastT: endOfFeedSec() - 60, months: ms,
            partial: C.monthKey(endOfFeedSec() - 60) === last && C.monthStart(C.nextMonth(last)) > endOfFeedSec() ? [last] : [],
            updatedAt: new Date(nowMs()).toISOString()
          });
        });
      },
      isCached: function (symbolId, key) { return !!cache[symbolId + '|' + key]; },
      getMonthMinutes: function (symbolId, key, o) {
        var ck = symbolId + '|' + key;
        if (o && o.signal && o.signal.aborted) return Promise.reject(fail('ABORTED'));
        if (cache[ck]) { touch(ck); return Promise.resolve(cache[ck]); }
        if (months().indexOf(key) < 0) return Promise.reject(fail('NOT_FOUND', 'no data for ' + key));
        if (inflight[ck]) return inflight[ck];
        // yield once so the loading overlay can paint before the (synchronous) generation
        inflight[ck] = new Promise(function (resolve) { setTimeout(resolve, 0); }).then(function () {
          try {
            var m = build(symbolId, key);
            cache[ck] = m; touch(ck);
            return m;
          } finally { delete inflight[ck]; }
        });
        return inflight[ck];
      },
      getMonth: function (symbolId, key, o) {
        var s = S.get(symbolId);
        return src.getMonthMinutes(symbolId, key, o).then(function (m) {
          var scale = Math.pow(10, s.digits), rows = new Array(m.n);
          for (var i = 0; i < m.n; i++) rows[i] = [m.t[i], m.o[i] / scale, m.h[i] / scale, m.l[i] / scale, m.c[i] / scale];
          return rows;
        });
      },
      prefetch: function (symbolId, key) {
        try { src.getMonthMinutes(symbolId, key).catch(function () {}); } catch (e) { /* best effort */ }
      }
    };
    return src;
  }

  global.WwBtData = { createSyntheticSource: createSyntheticSource, FIRST_MONTH: FIRST_MONTH };
})(typeof window !== 'undefined' ? window : globalThis);
