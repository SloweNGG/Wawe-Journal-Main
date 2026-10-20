// PROTOTYPE (scratch) of the config-driven math: HTF aggregation + engine money/trigger rules.
// Depends on WwBtSymbols (bt-symbols.js). Prices are integer POINTS (price * 10^digits),
// lots are integer STEPS (lot / lot.step), money is integer CENTS.
(function (global) {
  'use strict';
  var S = global.WwBtSymbols;
  function pow10(n) { var r = 1; for (var i = 0; i < n; i++) r *= 10; return r; }
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a; }

  // ---------------- rounding: Postgres ROUND(numeric, s) semantics (ties away from zero) -------------
  // exact for integers num, den (den > 0); BigInt fallback when the Number path is not exact
  function roundDiv(num, den) {
    if (!(den > 0)) throw new RangeError('den');
    if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den) || !Number.isSafeInteger(2 * Math.abs(num) + den)) {
      var N = BigInt(num), D = BigInt(den), neg = N < BigInt(0), A = neg ? -N : N;
      var q = A / D, r = A % D; if (r * BigInt(2) >= D) q += BigInt(1);
      return Number(neg ? -q : q);
    }
    var negN = num < 0, a = negN ? -num : num;
    var qq = Math.floor(a / den), rr = a - qq * den;
    if (rr < 0) { qq -= 1; rr += den; } else if (rr >= den) { qq += 1; rr -= den; }
    if (2 * rr >= den) qq += 1;
    return (negN && qq !== 0) ? -qq : qq;          // never -0 (would print as -0.00)
  }

  // ---------------- money ----------------
  // gross P&L in USD cents, rounded ONCE. dir = +1 LONG / -1 SHORT. exitPts = fill or mark price.
  function grossCents(id, dir, entryPts, exitPts, lotSteps) {
    var s = S.get(id);
    // quote amount = dir*(exit-entry)*10^-digits * lotSteps*10^-lotDigits * contractSize ; cents = *100
    var fn = s.contractSize * 100, fd = pow10(s.digits + s.lotDigits);
    if (s.toUsd === 'base') { fn *= pow10(s.digits); fd *= exitPts; }    // divide by exit price (USD base)
    var g = gcd(fn, fd); fn /= g; fd /= g;
    var num = dir * (exitPts - entryPts) * lotSteps * fn;
    if (!Number.isSafeInteger(num)) {                                    // exact BigInt path
      var N = BigInt(dir * (exitPts - entryPts)) * BigInt(lotSteps) * BigInt(fn), D = BigInt(fd);
      var neg = N < BigInt(0), A = neg ? -N : N, q = A / D, r = A % D; if (r * BigInt(2) >= D) q += BigInt(1);
      return Number(neg ? -q : q);
    }
    return roundDiv(num, fd);
  }
  // round-turn commission for the whole position, USD cents, rounded ONCE (positive cost)
  function commissionCents(id, commissionPerLotUsd, lotSteps) {
    var s = S.get(id), cpl = Math.round((+commissionPerLotUsd || 0) * 100);
    return roundDiv(cpl * lotSteps, pow10(s.lotDigits));
  }
  // rr_ratio exactly like trades trigger: ROUND(|tp-entry| / |entry-sl|, 2); null if not computable
  function rrRatio(entryPts, slPts, tpPts) {
    if (entryPts == null || slPts == null || tpPts == null) return null;
    var risk = Math.abs(entryPts - slPts), reward = Math.abs(tpPts - entryPts);
    if (risk === 0) return null;
    return roundDiv(reward * 100, risk) / 100;
  }

  // ---------------- fills and triggers on BID 1m bars ----------------
  // bar = [tSec, o, h, l, c] BID points; sp = spread points; ask = bid + sp
  function marketFill(dir, bidClose, sp) { return dir > 0 ? bidClose + sp : bidClose; }       // open
  function closeFill(dir, bidClose, sp) { return dir > 0 ? bidClose : bidClose + sp; }        // close / mark
  // pos: { dir, sl, tp } in points (sl/tp may be null). Returns null or { reason, price, ambiguous }
  function exitOnBar(pos, bar, sp) {
    var adj = pos.dir > 0 ? 0 : sp;                 // LONG triggers on BID, SHORT on ASK
    var o = bar[1] + adj, h = bar[2] + adj, l = bar[3] + adj;
    var slHit, tpHit, slGap, tpGap;
    if (pos.dir > 0) {
      slHit = pos.sl != null && l <= pos.sl; tpHit = pos.tp != null && h >= pos.tp;
      slGap = slHit && o <= pos.sl;          tpGap = tpHit && o >= pos.tp;
    } else {
      slHit = pos.sl != null && h >= pos.sl; tpHit = pos.tp != null && l <= pos.tp;
      slGap = slHit && o >= pos.sl;          tpGap = tpHit && o <= pos.tp;
    }
    if (slGap) return { reason: 'SL', price: o, ambiguous: false };          // opened beyond SL: fill at open (worse)
    if (tpGap) return { reason: 'TP', price: pos.tp, ambiguous: false };     // opened beyond TP: fill at TP (no bonus)
    if (slHit) return { reason: 'SL', price: pos.sl, ambiguous: !!tpHit };   // both in one 1m bar -> SL first
    if (tpHit) return { reason: 'TP', price: pos.tp, ambiguous: false };
    return null;
  }

  // ---------------- higher timeframes from 1m ----------------
  var TF = { M1: 1, M5: 5, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440, W1: 10080 };
  function bucketStart(tSec, tfMin, id) {
    if (tfMin <= 60) return tSec - (((tSec % (tfMin * 60)) + tfMin * 60) % (tfMin * 60));    // UTC grid
    var a = S.dayAnchor(tSec * 1000, id) / 1000;                                             // 17:00 NY or 00:00 UTC
    if (tfMin === 240 || tfMin === 1440) return a + Math.floor((tSec - a) / (tfMin * 60)) * tfMin * 60;
    if (tfMin === 10080) {
      var sc = S.get(id)._sc;
      if (sc.alwaysOpen) { var dow = new Date(a * 1000).getUTCDay(); return a - ((dow + 6) % 7) * 86400; } // Monday 00:00 UTC
      // trading date of anchor a is the NEXT local calendar day (day starts at 17:00 NY): Mon..Fri
      var td = new Date((a + 86400) * 1000 + S._offsetMin(a * 1000, sc.tz) * 60000).getUTCDay();
      return a - ((td + 6) % 7) * 86400;   // back to the Sunday-17:00 anchor (no DST change inside a FX week)
    }
    throw new Error('tf');
  }
  // aggregate ascending 1m bars [t,o,h,l,c] -> [{time,open,high,low,close,n}], no synthetic bars
  function aggregate(bars, tfMin, id, from, to) {
    var out = [], cur = null, i0 = from || 0, i1 = to == null ? bars.length - 1 : to;
    for (var i = i0; i <= i1; i++) {
      var b = bars[i], s = bucketStart(b[0], tfMin, id);
      if (!cur || cur.time !== s) { cur = { time: s, open: b[1], high: b[2], low: b[3], close: b[4], n: 1 }; out.push(cur); }
      else { if (b[2] > cur.high) cur.high = b[2]; if (b[3] < cur.low) cur.low = b[3]; cur.close = b[4]; cur.n++; }
    }
    return out;
  }
  // in-progress HTF candle at replay cursor index k (1m bars <= cursor only)
  function partialAt(bars, k, tfMin, id) {
    var s = bucketStart(bars[k][0], tfMin, id), i = k;
    while (i > 0 && bars[i - 1][0] >= s) i--;
    return aggregate(bars, tfMin, id, i, k)[0];
  }

  global.WwBtMath = {
    roundDiv: roundDiv, grossCents: grossCents, commissionCents: commissionCents, rrRatio: rrRatio,
    marketFill: marketFill, closeFill: closeFill, exitOnBar: exitOnBar,
    TF: TF, bucketStart: bucketStart, aggregate: aggregate, partialAt: partialAt
  };
})(typeof window !== 'undefined' ? window : globalThis);
