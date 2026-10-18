// DRAFT (scratch prototype, not repo code) of public/interface/backtest/js/bt-symbols.js
// Based on agents3/symbols-scripts/bt-symbols.js; this copy adds what the archive needs
// (Stage 3B, decision D12): enabled flag, source-agnostic `source`, `synthetic` parameters.
// Browser: <script src="/interface/backtest/js/bt-symbols.js?v=1" is:inline defer></script> -> window.WwBtSymbols
// Node:    import '<path>/bt-symbols.js' (side effect, globalThis.WwBtSymbols)  or  vm.runInNewContext (tests)
(function (global) {
  'use strict';

  // ==========================================================================
  // 1) MARKET SCHEDULES. Wall-clock times in an IANA zone (DST handled by Intl).
  //    weekOpen/weekClose: 'Ddd HH:MM'. dailyBreak: closed every weekday inside the week.
  //    dayStart: D1/H4/W1 anchor. holidays 'MM-DD': that TRADING day is closed, i.e.
  //    from the previous calendar day dayStart to that day dayStart (17:00 NY -> 17:00 NY).
  //    thinDays: importer only; gaps after thinAfter local time are expected (early close).
  // ==========================================================================
  var SCHEDULES = {
    fx: {
      tz: 'America/New_York', weekOpen: 'Sun 17:00', weekClose: 'Fri 17:00', dailyBreak: null,
      dayStart: '17:00', holidays: ['12-25', '01-01'], thinDays: ['12-24', '12-31'], thinAfter: '12:00'
    },
    metal: {
      tz: 'America/New_York', weekOpen: 'Sun 18:00', weekClose: 'Fri 17:00', dailyBreak: ['17:00', '18:00'],
      dayStart: '17:00', holidays: ['12-25', '01-01'], thinDays: ['12-24', '12-31'], thinAfter: '12:00'
    },
    crypto: { tz: 'UTC', alwaysOpen: true, dayStart: '00:00', weekStartDow: 1 }
  };

  // ==========================================================================
  // 2) DATA PROVIDERS of the candle archive (source-agnostic, D12).
  //    A provider id here must match an importer adapter in scripts/candles/lib/sources/.
  //    There is deliberately NO 'dukascopy' entry (owner decision R50).
  //    'synthetic' is not a provider: every symbol can be generated synthetically for tests
  //    (separate Storage prefix synthetic/, UI label "Sentetik veri · test").
  // ==========================================================================
  var PROVIDERS = {
    binance: {
      label: 'Binance', price: 'trade',
      // Binance Vision Dataset Terms v1.0 (2026-08-26): CC BY-NC-SA 4.0, commercial use only with a
      // written enterprise licence (§3.4, §4.3, §4.4). Keep every binance symbol enabled:false until
      // the owner's licence decision (R52).
      licence: 'CC BY-NC-SA 4.0 (Binance Vision Dataset Terms v1.0)'
    }
  };

  // ==========================================================================
  // 3) SYMBOLS. Add a symbol = copy a block. Units:
  //    point = 10^-digits (storage/display/fill grid), pip = pipSize (UI + spread_pips unit),
  //    1.0 lot = contractSize units of base. P&L (quote ccy) = dir*(exit-entry)*lot*contractSize,
  //    toUsd: 'quote' (quote is USD/USDT -> x1) | 'base' (base is USD -> / exit price).
  //    enabled: the REAL archive of this symbol may be imported and shown. false = the importer
  //             refuses the symbol (owner-only override exists) and the page offers only synthetic data.
  //    source:  { provider, symbol, ... } of the licensed real archive, or null when none exists yet.
  //    synthetic: { ref: typical price, vol: annualised volatility } for the synthetic test generator.
  // ==========================================================================
  var SYMBOLS = [
    {
      id: 'EURUSD', name: 'EUR/USD', instrument: 'forex', base: 'EUR', quote: 'USD', toUsd: 'quote',
      enabled: false,             // no licensed forex source yet (R53); no Dukascopy adapter (R50)
      source: null,
      synthetic: { ref: 1.10, vol: 0.07 },
      digits: 5, pipSize: 0.0001, contractSize: 100000, lot: { min: 0.01, step: 0.01, max: 100 },
      schedule: 'fx', dataStart: '2020-01', defaultSpreadPips: 0.2,
      sanity: { min: 0.5, max: 2.5, barPct: 1.5, jumpPct: 1, spikePct: 0.3 }
    },
    {
      id: 'GBPUSD', name: 'GBP/USD', instrument: 'forex', base: 'GBP', quote: 'USD', toUsd: 'quote',
      enabled: false, source: null,
      synthetic: { ref: 1.27, vol: 0.08 },
      digits: 5, pipSize: 0.0001, contractSize: 100000, lot: { min: 0.01, step: 0.01, max: 100 },
      schedule: 'fx', dataStart: '2020-01', defaultSpreadPips: 0.4,
      sanity: { min: 0.7, max: 3, barPct: 1.5, jumpPct: 1, spikePct: 0.3 }
    },
    {
      id: 'USDJPY', name: 'USD/JPY', instrument: 'forex', base: 'USD', quote: 'JPY', toUsd: 'base',
      enabled: false, source: null,
      synthetic: { ref: 145.0, vol: 0.09 },
      digits: 3, pipSize: 0.01, contractSize: 100000, lot: { min: 0.01, step: 0.01, max: 100 },
      schedule: 'fx', dataStart: '2020-01', defaultSpreadPips: 0.3,
      sanity: { min: 60, max: 300, barPct: 1.5, jumpPct: 1, spikePct: 0.3 }
    },
    {
      id: 'XAUUSD', name: 'XAU/USD', instrument: 'gold', base: 'XAU', quote: 'USD', toUsd: 'quote',
      enabled: false, source: null,  // no licensed gold source yet (R53)
      synthetic: { ref: 2300, vol: 0.15 },
      digits: 2, pipSize: 0.1, contractSize: 100, lot: { min: 0.01, step: 0.01, max: 100 },
      schedule: 'metal', dataStart: '2020-01', defaultSpreadPips: 2,
      sanity: { min: 500, max: 20000, barPct: 2.5, jumpPct: 2, spikePct: 0.5 }
    },
    {
      id: 'BTCUSDT', name: 'BTC/USDT', instrument: 'crypto', base: 'BTC', quote: 'USDT', toUsd: 'quote',
      enabled: false,             // Binance adapter written but DISABLED until the licence decision (R52)
      source: { provider: 'binance', market: 'spot', symbol: 'BTCUSDT' },
      synthetic: { ref: 60000, vol: 0.55 },
      digits: 2, pipSize: 1, contractSize: 1, lot: { min: 0.01, step: 0.01, max: 100 },
      schedule: 'crypto', dataStart: '2020-01', defaultSpreadPips: 10,
      sanity: { min: 1000, max: 2000000, barPct: 8, jumpPct: 5, spikePct: 2 }
    },
    {
      id: 'ETHUSDT', name: 'ETH/USDT', instrument: 'crypto', base: 'ETH', quote: 'USDT', toUsd: 'quote',
      enabled: false,             // see BTCUSDT
      source: { provider: 'binance', market: 'spot', symbol: 'ETHUSDT' },
      synthetic: { ref: 3000, vol: 0.70 },
      digits: 2, pipSize: 1, contractSize: 1, lot: { min: 0.01, step: 0.01, max: 1000 },
      schedule: 'crypto', dataStart: '2020-01', defaultSpreadPips: 1,
      sanity: { min: 50, max: 200000, barPct: 10, jumpPct: 6, spikePct: 3 }
    }
  ];

  // ==========================================================================
  // 4) Helpers (pure; same code in browser, importer and tests)
  // ==========================================================================
  var DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  function hm(s) { var p = String(s).split(':'); return (+p[0]) * 60 + (+p[1]); }
  function wmin(s) { var p = String(s).split(' '); return DOW[p[0]] * 1440 + hm(p[1]); }
  function pow10(n) { var r = 1; for (var i = 0; i < n; i++) r *= 10; return r; }
  function decimalsOf(x) { var s = String(x); var i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; }

  // Expand a schedule into sorted half-open [start, end) local week-minute intervals.
  function expand(sc) {
    if (sc.alwaysOpen) return null;
    var a = wmin(sc.weekOpen), b = wmin(sc.weekClose);
    var iv = [[a, b]];
    if (sc.dailyBreak) {
      var bs = hm(sc.dailyBreak[0]), be = hm(sc.dailyBreak[1]);
      for (var d = 0; d < 7; d++) {
        var s = d * 1440 + bs, e = d * 1440 + be, next = [];
        iv.forEach(function (x) {
          if (e <= x[0] || s >= x[1]) { next.push(x); return; }
          if (s > x[0]) next.push([x[0], s]);
          if (e < x[1]) next.push([e, x[1]]);
        });
        iv = next;
      }
    }
    return iv.sort(function (p, q) { return p[0] - q[0]; });
  }

  var dtfCache = {};
  function parts(ms, tz) {
    var f = dtfCache[tz] || (dtfCache[tz] = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }));
    var o = {};
    f.formatToParts(new Date(ms)).forEach(function (p) { if (p.type !== 'literal') o[p.type] = +p.value; });
    var H = o.hour === 24 ? 0 : o.hour;
    var dow = new Date(Date.UTC(o.year, o.month - 1, o.day)).getUTCDay();
    return { y: o.year, m: o.month, d: o.day, H: H, Mi: o.minute, S: o.second, dow: dow };
  }
  function offsetMin(ms, tz) {
    var p = parts(ms, tz);
    return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.H, p.Mi, p.S) - Math.floor(ms / 1000) * 1000) / 60000);
  }
  // Zone offset cached per UTC hour (New York changes offset only on whole UTC hours).
  var offCache = {};
  function localParts(ms, tz) {
    var off = 0;
    if (tz !== 'UTC') {
      var hk = tz + '|' + Math.floor(ms / 3600000);
      off = offCache[hk];
      if (off === undefined) off = offCache[hk] = offsetMin(Math.floor(ms / 3600000) * 3600000, tz);
    }
    var l = new Date(ms + off * 60000);
    return { y: l.getUTCFullYear(), m: l.getUTCMonth() + 1, d: l.getUTCDate(), H: l.getUTCHours(),
             Mi: l.getUTCMinutes(), S: l.getUTCSeconds(), dow: l.getUTCDay() };
  }
  function zonedToUtc(y, m, d, H, Mi, tz) {
    var guess = Date.UTC(y, m - 1, d, H, Mi, 0);
    var off = offsetMin(guess, tz), ms = guess - off * 60000, off2 = offsetMin(ms, tz);
    return off2 === off ? ms : guess - off2 * 60000;
  }
  function addDays(y, m, d, n) {
    var t = new Date(Date.UTC(y, m - 1, d + n));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  var BY_ID = {};
  function prep(sym) {
    var sc = SCHEDULES[sym.schedule];
    sym._sc = sc;
    if (sc && !sc._iv && !sc.alwaysOpen) sc._iv = expand(sc);
    sym.point = 1 / pow10(sym.digits);
    sym.pointsPerPip = Math.round(sym.pipSize * pow10(sym.digits));
    sym.lotDigits = decimalsOf(sym.lot.step);
    BY_ID[sym.id] = sym;
  }

  function validate() {
    var errors = [], seen = {};
    SYMBOLS.forEach(function (s) {
      function need(c, msg) { if (!c) errors.push(s.id + ': ' + msg); }
      need(/^[A-Z0-9]{3,12}$/.test(s.id), 'id');
      need(!seen[s.id], 'duplicate id'); seen[s.id] = true;
      need(['forex', 'gold', 'crypto', 'index', 'other'].indexOf(s.instrument) >= 0, 'instrument');
      need(s.toUsd === 'quote' ? /^(USD|USDT|USDC)$/.test(s.quote) : (s.toUsd === 'base' ? s.base === 'USD' : false), 'toUsd vs base/quote');
      need(typeof s.enabled === 'boolean', 'enabled must be true/false');
      need(s.source === null || (s.source && PROVIDERS.hasOwnProperty(s.source.provider) && /^[A-Z0-9]{3,20}$/.test(s.source.symbol || '')), 'source must be null or {provider in PROVIDERS, symbol}');
      need(!(s.enabled && !s.source), 'enabled:true needs a licensed source');
      need(s.synthetic && s.synthetic.ref >= s.sanity.min && s.synthetic.ref <= s.sanity.max && s.synthetic.vol > 0 && s.synthetic.vol < 3, 'synthetic {ref inside sanity range, 0 < vol < 3}');
      need(Number.isInteger(s.digits) && s.digits >= 0 && s.digits <= 8, 'digits');
      need(Math.abs(s.pipSize * pow10(s.digits) - Math.round(s.pipSize * pow10(s.digits))) < 1e-9 && s.pipSize * pow10(s.digits) >= 1, 'pipSize on point grid');
      need(s.contractSize > 0, 'contractSize');
      need(s.lot && s.lot.min > 0 && s.lot.step > 0 && s.lot.max >= s.lot.min, 'lot');
      need(!!SCHEDULES[s.schedule], 'schedule');
      need(/^\d{4}-(0[1-9]|1[0-2])$/.test(s.dataStart), 'dataStart');
      need(s.sanity && s.sanity.min > 0 && s.sanity.max > s.sanity.min, 'sanity');
    });
    return errors;
  }

  // ---- market hours ----
  function tradingDate(p, sc) {
    return (p.H * 60 + p.Mi >= hm(sc.dayStart)) ? addDays(p.y, p.m, p.d, 1) : { y: p.y, m: p.m, d: p.d };
  }
  function regularOpen(p, sc) {
    var w = p.dow * 1440 + p.H * 60 + p.Mi, iv = sc._iv;
    for (var i = 0; i < iv.length; i++) if (w >= iv[i][0] && w < iv[i][1]) return true;
    return false;
  }
  function isHoliday(p, sc) {
    if (!sc.holidays) return false;
    var td = tradingDate(p, sc);
    return sc.holidays.indexOf(pad(td.m) + '-' + pad(td.d)) >= 0;
  }
  function isOpen(ms, id) {
    var sc = BY_ID[id]._sc;
    if (sc.alwaysOpen) return true;
    var p = localParts(ms, sc.tz);
    return regularOpen(p, sc) && !isHoliday(p, sc);
  }
  // Is ms (inside an open-market gap) on a thin day after thinAfter? (importer gap labels)
  function isThin(ms, id) {
    var sc = BY_ID[id]._sc;
    if (sc.alwaysOpen || !sc.thinDays) return false;
    var p = localParts(ms, sc.tz);
    var md = pad(p.m) + '-' + pad(p.d);
    return sc.thinDays.indexOf(md) >= 0 && p.H * 60 + p.Mi >= hm(sc.thinAfter);
  }
  function nextOpen(ms, id) {
    var sc = BY_ID[id]._sc;
    var t = Math.ceil(ms / 60000) * 60000;
    if (sc.alwaysOpen) return t;
    for (var guard = 0; guard < 32; guard++) {
      var p = localParts(t, sc.tz);
      var reg = regularOpen(p, sc);
      if (reg && !isHoliday(p, sc)) return t;
      if (reg) {
        var td = tradingDate(p, sc), ds = hm(sc.dayStart);
        t = zonedToUtc(td.y, td.m, td.d, Math.floor(ds / 60), ds % 60, sc.tz);
        continue;
      }
      var w = p.dow * 1440 + p.H * 60 + p.Mi, iv = sc._iv, start = null, add = 0;
      for (var i = 0; i < iv.length; i++) if (iv[i][0] > w) { start = iv[i][0]; break; }
      if (start === null) { start = iv[0][0]; add = 7; }
      var day = addDays(p.y, p.m, p.d, Math.floor(start / 1440) - p.dow + add), mod = start % 1440;
      t = zonedToUtc(day.y, day.m, day.d, Math.floor(mod / 60), mod % 60, sc.tz);
    }
    return null;
  }
  var anchorCache = {};
  function dayAnchor(ms, id) {
    var sc = BY_ID[id]._sc;
    var key = sc.tz + '|' + sc.dayStart + '|' + Math.floor(ms / 3600000);
    var hourStart = Math.floor(ms / 3600000) * 3600000;
    var c = anchorCache[key];
    if (c === undefined) {
      var p = parts(hourStart, sc.tz), ds = hm(sc.dayStart);
      var day = (p.H * 60 + p.Mi >= ds) ? { y: p.y, m: p.m, d: p.d } : addDays(p.y, p.m, p.d, -1);
      c = anchorCache[key] = zonedToUtc(day.y, day.m, day.d, Math.floor(ds / 60), ds % 60, sc.tz);
    }
    return c;
  }

  // ---- price / money helpers ----
  function toPoints(price, id) { return Math.round(price * pow10(BY_ID[id].digits)); }
  function fromPoints(pts, id) { var s = BY_ID[id]; return +(pts / pow10(s.digits)).toFixed(s.digits); }
  function spreadPoints(spreadPips, id) { return Math.round((+spreadPips || 0) * BY_ID[id].pointsPerPip); }
  function pipValueUsd(id, lot, price) {
    var s = BY_ID[id], q = s.pipSize * s.contractSize * lot;
    return s.toUsd === 'base' ? q / price : q;
  }

  SYMBOLS.forEach(prep);

  global.WwBtSymbols = {
    SYMBOLS: SYMBOLS,
    SCHEDULES: SCHEDULES,
    PROVIDERS: PROVIDERS,
    get: function (id) { return BY_ID[String(id || '').toUpperCase()] || null; },
    list: function () { return SYMBOLS.slice(); },
    validate: validate,
    isOpen: isOpen,
    isThin: isThin,
    nextOpen: nextOpen,
    dayAnchor: dayAnchor,
    toPoints: toPoints,
    fromPoints: fromPoints,
    spreadPoints: spreadPoints,
    pipValueUsd: pipValueUsd,
    _parts: parts,
    _localParts: localParts,
    _offsetMin: offsetMin,
    _zonedToUtc: zonedToUtc
  };
})(typeof window !== 'undefined' ? window : globalThis);
