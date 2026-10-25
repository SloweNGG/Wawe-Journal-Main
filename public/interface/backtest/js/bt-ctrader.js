// Backtest v2, Phase 2: cTrader candle source (window.WwBtCTrader). The candles of a cTrader account come from the user's OWN
// broker account through the ctrader-candles Edge Function; nothing is stored on the server, and the browser keeps them in
// IndexedDB under the user's id (entries of any other user id are deleted when the page opens).
// Implements the CandleSource interface of bt-data.js:
//   kind 'ctrader', provider(), label() -> 'cTrader · <broker>', coverage(symbolId), getMonthMinutes(symbolId, key, {signal}),
//   getMonth(...), prefetch(...), isCached(...).
// Errors reject with Error{code}: 'AUTH' (cTrader connection lost / token expired: reconnect), 'SESSION' (Wawe session),
//   'RATE', 'NETWORK', 'UPSTREAM', 'NOT_FOUND', 'ABORTED'.
// Depends on WwBtSymbols, WwBtCandles (loaded before this file). Pure apart from the injected api / cache / clock.
(function (global) {
  'use strict';

  var RAW_DIGITS = 5;                 // the Edge Function sends prices in 1e-5 units
  var CACHE_MAX = 8;                  // months kept in memory (LRU)
  var COVERAGE_TTL_MS = 30 * 86400000;

  function fail(code, msg, extra) {
    var e = new Error(msg || code); e.code = code;
    if (extra) for (var k in extra) e[k] = extra[k];
    return e;
  }

  // ---------------------------------------------------------------- broker symbol matching (pure)
  // The page offers its own symbols (contract size, pip, schedule are known for them); the broker spells them its own way
  // (XAUUSD, GOLD, EURUSD.r, EURUSDm, BTCUSD for BTC/USDT ...). Candidates are ordered best first.
  var ALIASES = {
    EURUSD: ['EURUSD'], GBPUSD: ['GBPUSD'], USDJPY: ['USDJPY'],
    XAUUSD: ['XAUUSD', 'GOLD'],
    BTCUSDT: ['BTCUSDT', 'BTCUSD', 'XBTUSD'], ETHUSDT: ['ETHUSDT', 'ETHUSD']
  };
  function norm(name) { return String(name || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  // brokerList: [[id, name], ...] -> [{ id, name, score }] (lower score = better), only plausible matches
  function matchBrokerSymbols(appId, brokerList) {
    var aliases = ALIASES[appId] || [String(appId).toUpperCase()], out = [];
    (brokerList || []).forEach(function (r) {
      var id = Number(r[0]), name = String(r[1] || ''), n = norm(name), best = -1;
      for (var i = 0; i < aliases.length; i++) {
        var a = aliases[i], s = -1;
        if (n === a) s = i * 10;
        else if (n.indexOf(a) === 0 && n.length - a.length <= 4) s = i * 10 + 1 + (n.length - a.length);
        if (s >= 0 && (best < 0 || s < best)) best = s;
      }
      if (best >= 0 && isFinite(id) && id > 0) out.push({ id: id, name: name, score: best });
    });
    out.sort(function (x, y) { return x.score - y.score || x.name.length - y.name.length || (x.name < y.name ? -1 : 1); });
    return out;
  }

  // Coverage object of bt-data.js from the first bar time (UTC s): complete UTC days up to yesterday, like the synthetic feed.
  function buildCoverage(firstT, nowMs, symbolId) {
    var C = global.WwBtCandles, end = Math.floor(nowMs / 86400000) * 86400, lastT = end - 60, ms = [], key = C.monthKey(firstT), last = C.monthKey(lastT);
    while (key <= last) { ms.push(key); key = C.nextMonth(key); }
    if (!ms.length || !(firstT < lastT)) throw fail('NOT_FOUND', 'no data');
    return { symbol: symbolId, firstT: firstT, lastT: lastT, months: ms, partial: [], updatedAt: new Date(nowMs).toISOString() };
  }

  // ---------------------------------------------------------------- Edge Function client
  // o: { url, anonKey, getToken: () => Promise<string|null>, fetch }
  function createApi(o) {
    var doFetch = o.fetch || (typeof fetch === 'function' ? fetch.bind(global) : null);
    function mapCode(code, status) {
      if (code === 'AUTH' || code === 'NO_ACCOUNT') return 'AUTH';
      if (code === 'UNAUTHORIZED' || status === 401) return 'SESSION';
      if (code === 'RATE' || status === 429) return 'RATE';
      if (code === 'NOT_FOUND') return 'NOT_FOUND';
      return 'UPSTREAM';
    }
    function call(body, signal) {
      return Promise.resolve().then(function () { return o.getToken(); }).then(function (token) {
        if (!token) throw fail('SESSION', 'no session');
        if (signal && signal.aborted) throw fail('ABORTED');
        return doFetch(o.url + '/functions/v1/ctrader-candles', {
          method: 'POST', signal: signal,
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': o.anonKey || '' },
          body: JSON.stringify(body)
        }).then(function (res) {
          return res.json().then(function (j) { return { res: res, j: j }; }, function () { return { res: res, j: null }; });
        }, function (e) { throw (e && e.name === 'AbortError') ? fail('ABORTED') : fail('NETWORK', 'network error'); });
      }).then(function (r) {
        if (r.res.ok && r.j && r.j.ok) return r.j;
        throw fail(mapCode(r.j && r.j.code, r.res.status), (r.j && r.j.error) || 'request failed', { needsReconnect: !!(r.j && r.j.needs_reconnect), status: r.res.status });
      });
    }
    return {
      call: call,
      symbols: function (ctid, signal) { return call({ action: 'symbols', ctidAccount: ctid }, signal).then(function (j) { return j.symbols || []; }); },
      symbolInfo: function (ctid, symbolId, signal) { return call({ action: 'symbolInfo', ctidAccount: ctid, symbolId: symbolId }, signal); },
      coverage: function (ctid, symbolId, signal) { return call({ action: 'coverage', ctidAccount: ctid, symbolId: symbolId }, signal); },
      coverageOfAccount: function (backtestAccountId, signal) { return call({ action: 'coverage', backtestAccountId: backtestAccountId }, signal); },
      month: function (backtestAccountId, key, signal) { return call({ action: 'month', backtestAccountId: backtestAccountId, month: key }, signal); }
    };
  }

  // ---------------------------------------------------------------- browser cache (IndexedDB, per user)
  // Months are stored as typed arrays (points of the page's symbol digits). Entries carry the user id; purgeOthers() removes
  // everything that belongs to another user so a shared browser never holds two users' candles side by side.
  // Without IndexedDB (private mode, tests) everything stays in memory.
  function createCache(o) {
    o = o || {};
    var idb = o.indexedDB !== undefined ? o.indexedDB : (typeof indexedDB !== 'undefined' ? indexedDB : null);
    var userId = o.userId, mem = {}, dbp = null, DB = 'ww_bt_ctrader', STORE = 'months';
    function open() {
      if (!idb) return Promise.resolve(null);
      if (dbp) return dbp;
      dbp = new Promise(function (resolve) {
        var req;
        try { req = idb.open(DB, 1); } catch (e) { return resolve(null); }
        req.onupgradeneeded = function () { try { req.result.createObjectStore(STORE, { keyPath: 'k' }); } catch (e) { /* exists */ } };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(null); };
        req.onblocked = function () { resolve(null); };
      });
      return dbp;
    }
    function tx(mode, fn) {
      return open().then(function (db) {
        if (!db) return null;
        return new Promise(function (resolve) {
          try {
            var t = db.transaction(STORE, mode), st = t.objectStore(STORE), out = fn(st);
            t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : null); };
            t.onerror = t.onabort = function () { resolve(null); };
          } catch (e) { resolve(null); }
        });
      });
    }
    var cache = {
      persistent: !!idb,
      get: function (k) {
        if (mem[k]) return Promise.resolve(mem[k]);
        return tx('readonly', function (st) { return st.get(userId + '|' + k); }).then(function (rec) {
          if (rec && rec.u === userId && rec.t && rec.n >= 0) { mem[k] = rec; return rec; }
          return null;
        });
      },
      put: function (k, m, persist) {
        var rec = { k: userId + '|' + k, u: userId, n: m.n, t: m.t, o: m.o, h: m.h, l: m.l, c: m.c };
        mem[k] = rec;
        return persist ? tx('readwrite', function (st) { return st.put(rec); }) : Promise.resolve(null);
      },
      getMeta: function (k) {
        return tx('readonly', function (st) { return st.get(userId + '|meta|' + k); }).then(function (rec) { return rec && rec.u === userId ? rec.v : null; });
      },
      putMeta: function (k, v) { return tx('readwrite', function (st) { return st.put({ k: userId + '|meta|' + k, u: userId, v: v }); }); },
      purgeOthers: function () {
        return tx('readwrite', function (st) {
          var req = st.openCursor();
          req.onsuccess = function () {
            var cur = req.result; if (!cur) return;
            if (cur.value && cur.value.u !== userId) cur.delete();
            cur.continue();
          };
          return null;
        });
      },
      clear: function () { mem = {}; return tx('readwrite', function (st) { return st.clear(); }); }
    };
    return cache;
  }

  // ---------------------------------------------------------------- server columns -> Minutes (pure)
  // j: { n, scale (price units per 1, 100000 from the Edge Function), tm (minute offsets in the month), o, h, l, c (integers) }.
  // Prices become integer points of the page symbol (`digits`). A bar is dropped when a value is not finite, not positive or does not
  // fit the Int32 point arrays (it would wrap to a negative price: BTC above 21,474.83 in 1e-5 units is 2^31). The rest is repaired so
  // that low <= open/close <= high.
  var INT32_MAX = 2147483647;
  function columnsToMinutes(j, key, digits) {
    var C = global.WwBtCandles, N = Math.max(0, Math.min(j && j.n | 0, (j && j.tm && j.tm.length) || 0)), base = C.monthStart(key);
    var scale = Number(j && j.scale), rawDigits = RAW_DIGITS;
    if (isFinite(scale) && scale >= 1) { var k = Math.round(Math.log(scale) / Math.LN10); if (Math.pow(10, k) === scale) rawDigits = k; }
    var div = Math.pow(10, rawDigits - digits);
    var t = new Float64Array(N), o_ = new Int32Array(N), h = new Int32Array(N), l = new Int32Array(N), c = new Int32Array(N);
    var n = 0, bad = 0, last = -Infinity;
    for (var i = 0; i < N; i++) {
      var ts = base + j.tm[i] * 60;
      var vo = Math.round(j.o[i] / div), vh = Math.round(j.h[i] / div), vl = Math.round(j.l[i] / div), vc = Math.round(j.c[i] / div);
      if (!(ts > last) || !isFinite(ts) || !(vo > 0 && vh > 0 && vl > 0 && vc > 0) || !(vo <= INT32_MAX && vh <= INT32_MAX && vl <= INT32_MAX && vc <= INT32_MAX)) { bad++; continue; }
      if (vh < vo || vh < vc) vh = Math.max(vo, vc);
      if (vl > vo || vl > vc) vl = Math.min(vo, vc);
      t[n] = ts; o_[n] = vo; h[n] = vh; l[n] = vl; c[n] = vc; last = ts; n++;
    }
    return { n: n, t: t.subarray(0, n), o: o_.subarray(0, n), h: h.subarray(0, n), l: l.subarray(0, n), c: c.subarray(0, n), bad: bad };
  }

  // ---------------------------------------------------------------- the source
  // o: { api, cache, userId, account: { id (backtest account id), ctid, symbolId, symbolName, brokerName, isLive }, sym (WwBtSymbols entry), now }
  function createCTraderSource(o) {
    var C = global.WwBtCandles;
    var api = o.api, cache = o.cache, acc = o.account, sym = o.sym;
    var nowMs = typeof o.now === 'function' ? o.now : function () { return Date.now(); };
    var mem = {}, order = [], inflight = {}, covPromise = null;
    var ckey = function (key) { return acc.ctid + '|' + acc.symbolId + '|' + sym.digits + '|' + key; };

    function endOfFeedSec() { return Math.floor(nowMs() / 86400000) * 86400; }     // 00:00 UTC today (exclusive): complete days only
    function touch(k) {
      var i = order.indexOf(k); if (i >= 0) order.splice(i, 1);
      order.push(k);
      while (order.length > CACHE_MAX) delete mem[order.shift()];
    }
    function withAbort(p, signal) {
      if (!signal) return p;
      return new Promise(function (resolve, reject) {
        if (signal.aborted) return reject(fail('ABORTED'));
        var onAbort = function () { reject(fail('ABORTED')); };
        signal.addEventListener('abort', onAbort, { once: true });
        p.then(function (v) { signal.removeEventListener('abort', onAbort); resolve(v); }, function (e) { signal.removeEventListener('abort', onAbort); reject(e); });
      });
    }
    var src = {
      kind: 'ctrader',
      provider: function () { return 'cTrader'; },
      label: function () { return 'cTrader · ' + (acc.brokerName || 'broker'); },
      coverage: function (symbolId) {
        if (covPromise) return covPromise;
        covPromise = Promise.resolve().then(function () {
          var k = 'cov|' + acc.ctid + '|' + acc.symbolId;
          return Promise.resolve(cache.getMeta(k)).catch(function () { return null; }).then(function (m) {
            if (m && m.firstT && nowMs() - m.at < COVERAGE_TTL_MS) return m.firstT;
            return api.coverageOfAccount(acc.id).then(function (j) {
              if (!j.firstT) throw fail('NOT_FOUND', 'no data');
              Promise.resolve(cache.putMeta(k, { firstT: j.firstT, at: nowMs() })).catch(function () {});
              return j.firstT;
            });
          });
        }).then(function (firstT) { return buildCoverage(firstT, nowMs(), sym.id); });
        covPromise.catch(function () { covPromise = null; });       // a failed measurement is retried next time
        return covPromise;
      },
      isCached: function (symbolId, key) { return !!mem[ckey(key)]; },
      getMonthMinutes: function (symbolId, key, opt) {
        var k = ckey(key), signal = opt && opt.signal;
        if (signal && signal.aborted) return Promise.reject(fail('ABORTED'));
        if (mem[k]) { touch(k); return Promise.resolve(mem[k]); }
        if (!inflight[k]) {
          // the shared load is not tied to one caller's AbortSignal (another caller may still want the month)
          inflight[k] = Promise.resolve(cache.get(k)).catch(function () { return null; }).then(function (rec) {
            var cached = rec ? { n: rec.n, t: rec.t, o: rec.o, h: rec.h, l: rec.l, c: rec.c, bad: 0 } : null;
            if (cached && C.validMinutes(cached)) return cached;               // an invalid cached month is fetched again (and overwritten)
            return api.month(acc.id, key).then(function (j) {
              var m = columnsToMinutes(j, key, sym.digits);
              if (!m.n) throw fail('NOT_FOUND', 'no data for ' + key);
              var complete = C.monthStart(C.nextMonth(key)) <= endOfFeedSec();     // a month still in progress is never persisted
              Promise.resolve(cache.put(k, m, complete)).catch(function () {});
              return m;
            });
          }).then(function (m) { mem[k] = m; touch(k); delete inflight[k]; return m; }, function (e) { delete inflight[k]; throw e; });
        }
        return withAbort(inflight[k], signal);
      },
      getMonth: function (symbolId, key, opt) {
        return src.getMonthMinutes(symbolId, key, opt).then(function (m) {
          var scale = Math.pow(10, sym.digits), rows = new Array(m.n);
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

  global.WwBtCTrader = {
    matchBrokerSymbols: matchBrokerSymbols, buildCoverage: buildCoverage, columnsToMinutes: columnsToMinutes, createApi: createApi, createCache: createCache, createCTraderSource: createCTraderSource,
    ALIASES: ALIASES
  };
})(typeof window !== 'undefined' ? window : globalThis);
