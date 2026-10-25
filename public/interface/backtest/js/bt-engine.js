// Backtest v2: exact-money trade engine (window.WwBtEngine). Pure: no DOM, no network.
// Units: prices = integer POINTS (10^-digits), lots = integer STEPS (lot.step), money = integer CENTS,
// rr = integer HUNDREDTHS, times = UTC SECONDS. Rounding is Postgres ROUND(numeric, 2): ties away from
// zero, never "-0". toFixed/Math.round are never used on stored values.
// Depends on WwBtSymbols (symbol objects: digits, lotDigits, contractSize, toUsd, lot, pointsPerPip).
(function (global) {
  'use strict';

  var MAX_POSITIONS = 20, MAX_ORDERS = 50;
  var ORDER_TYPES = ['limit', 'stop'];

  function S() { return global.WwBtSymbols; }
  function sym(x) { return typeof x === 'string' ? S().get(x) : x; }
  function pow10(n) { var r = 1; for (var i = 0; i < n; i++) r *= 10; return r; }
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a; }
  function codeError(code, field) { var e = new Error(code); e.code = code; if (field) e.field = field; return e; }

  // ---------------------------------------------------------------- numbers
  // Exact integer division rounded half away from zero (BigInt fallback), never -0.
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
    if (qq === 0) return 0;                          // never -0 (it would print as -0.00)
    return negN ? -qq : qq;
  }

  // number -> plain decimal string without exponent (1e-7 -> '0.0000001')
  function toPlainDecimalString(x) {
    if (typeof x === 'string') return x.trim();
    var s = String(x);
    var m = s.match(/^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/i);
    if (!m) return s;
    var sign = m[1], int = m[2], frac = m[3] || '', exp = parseInt(m[4], 10);
    var digits = int + frac, point = int.length + exp;
    if (point <= 0) return sign + '0.' + new Array(-point + 1).join('0') + digits;
    if (point >= digits.length) return sign + digits + new Array(point - digits.length + 1).join('0');
    return sign + digits.slice(0, point) + '.' + digits.slice(point);
  }

  // decimal string/number -> { ok, value (integer, scaled by 10^scale), snapped, code }
  // mode 'exact' rejects extra decimals (DECIMALS); 'round' snaps half away from zero (snapped: true).
  // A single ',' is accepted as the decimal separator.
  function parseScaled(input, scale, mode) {
    if (input === null || input === undefined) return { ok: false, code: 'FORMAT' };
    if (typeof input === 'number' && !isFinite(input)) return { ok: false, code: 'FORMAT' };
    var s = toPlainDecimalString(input);
    if (s.indexOf(',') >= 0) {
      if (s.indexOf('.') >= 0 || s.indexOf(',') !== s.lastIndexOf(',')) return { ok: false, code: 'FORMAT' };
      s = s.replace(',', '.');
    }
    var m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(s);
    if (!m || (m[2] === '' && (m[3] === undefined || m[3] === ''))) return { ok: false, code: 'FORMAT' };
    var neg = m[1] === '-', int = m[2] || '0', frac = m[3] || '';
    var keep = frac.slice(0, scale), extra = frac.slice(scale), snapped = false;
    var extraNonZero = /[1-9]/.test(extra);
    if (extraNonZero) {
      if (mode === 'exact') return { ok: false, code: 'DECIMALS' };
      snapped = true;
    }
    while (keep.length < scale) keep += '0';
    var n = BigInt(int + keep);
    if (extra.length && extra.charAt(0) >= '5' && mode !== 'exact') n += BigInt(1);
    if (n > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, code: 'RANGE' };
    var v = Number(n);
    if (neg && v !== 0) v = -v;
    return { ok: true, value: v, snapped: snapped };
  }

  function scaledToStr(v, scale) {
    v = Math.round(v);
    if (v === 0) return scale > 0 ? '0.' + new Array(scale + 1).join('0') : '0';
    var neg = v < 0, a = String(neg ? -v : v);
    if (scale === 0) return (neg ? '-' : '') + a;
    while (a.length <= scale) a = '0' + a;
    return (neg ? '-' : '') + a.slice(0, a.length - scale) + '.' + a.slice(a.length - scale);
  }
  function centsToStr(c) { return scaledToStr(c, 2); }
  function ptsToStr(p, digits) { return scaledToStr(p, digits); }
  function stepsToStr(n, lotDigits) { return scaledToStr(n, lotDigits); }
  function hundredthsToStr(h) { return scaledToStr(h, 2); }

  function dbInt(v, scale) {
    if (v === null || v === undefined || v === '') return null;
    var r = parseScaled(v, scale, 'round');
    return r.ok ? r.value : null;
  }
  function toCents(v) { return dbInt(v, 2); }
  function toPts(v, digits) { return dbInt(v, digits); }
  function toSteps(v, lotDigits) { return dbInt(v, lotDigits); }
  function toHundredths(v) { return dbInt(v, 2); }

  // ---------------------------------------------------------------- money
  // spread in points from hundredths of a pip (spread_pips numeric(10,2))
  function spreadPts(symbol, spreadH) { return roundDiv(spreadH * sym(symbol).pointsPerPip, 100); }

  // gross P&L in USD cents, rounded ONCE. dir +1 LONG / -1 SHORT; exitPts = fill or mark price.
  function grossCents(symbol, dir, entryPts, exitPts, steps) {
    var s = sym(symbol);
    var fn = s.contractSize * 100, fd = pow10(s.digits + s.lotDigits);
    if (s.toUsd === 'base') { fn *= pow10(s.digits); fd *= exitPts; }     // USD is the base: divide by the exit price
    var g = gcd(fn, fd); fn /= g; fd /= g;
    var num = dir * (exitPts - entryPts) * steps * fn;
    if (!Number.isSafeInteger(num)) {
      var N = BigInt(dir * (exitPts - entryPts)) * BigInt(steps) * BigInt(fn), D = BigInt(fd);
      var neg = N < BigInt(0), A = neg ? -N : N, q = A / D, r = A % D; if (r * BigInt(2) >= D) q += BigInt(1);
      return Number(neg ? -q : q);
    }
    return roundDiv(num, fd);
  }
  // round-turn commission of the whole position (positive cents), rounded once
  function commissionCents(symbol, cplCents, steps) { return roundDiv(cplCents * steps, pow10(sym(symbol).lotDigits)); }
  // ROUND(|tp - entry| / |entry - sl|, 2) as hundredths; null when a level is missing or the risk is 0
  function rrHundredths(entryPts, slPts, tpPts) {
    if (entryPts == null || slPts == null || tpPts == null) return null;
    var risk = Math.abs(entryPts - slPts), reward = Math.abs(tpPts - entryPts);
    if (risk === 0) return null;
    return roundDiv(reward * 100, risk);
  }

  // ---------------------------------------------------------------- fills and triggers (bars are BID)
  function marketFill(dir, bid, sp) { return dir > 0 ? bid + sp : bid; }       // open LONG at ask, SHORT at bid
  function closeFill(dir, bid, sp) { return dir > 0 ? bid : bid + sp; }        // close LONG at bid, SHORT at ask

  // pos: { dir, sl, tp } in points; bar = [t, o, h, l, c] BID points; sp = spread points.
  // Returns null or { reason: 'sl'|'tp', pts, ambiguous }. TP and SL inside ONE 1m bar: SL first, flagged.
  function exitOnBar(pos, bar, sp) {
    var adj = pos.dir > 0 ? 0 : sp;                 // LONG triggers on BID, SHORT on ASK = BID + sp
    var o = bar[1] + adj, h = bar[2] + adj, l = bar[3] + adj, slHit, tpHit, slGap, tpGap;
    if (pos.dir > 0) {
      slHit = pos.sl != null && l <= pos.sl; tpHit = pos.tp != null && h >= pos.tp;
      slGap = slHit && o <= pos.sl;          tpGap = tpHit && o >= pos.tp;
    } else {
      slHit = pos.sl != null && h >= pos.sl; tpHit = pos.tp != null && l <= pos.tp;
      slGap = slHit && o >= pos.sl;          tpGap = tpHit && o <= pos.tp;
    }
    if (slGap) return { reason: 'sl', pts: o, ambiguous: false };          // opened beyond SL: fill at the open (slippage)
    if (tpGap) return { reason: 'tp', pts: pos.tp, ambiguous: false };     // opened beyond TP: fill at TP, no improvement
    if (slHit) return { reason: 'sl', pts: pos.sl, ambiguous: !!tpHit };
    if (tpHit) return { reason: 'tp', pts: pos.tp, ambiguous: false };
    return null;
  }

  // ---------------------------------------------------------------- state
  function createState(o) {
    return { sym: sym(o.sym), sp: o.spreadPts | 0, startCents: o.startCents, cplCents: o.cplCents | 0,
             open: [], closed: [], realizedCents: 0, quote: null,
             orders: [], events: [], allowFill: null };      // pending orders; fills/rejections of the last bars (the page drains them)
  }
  function setQuote(st, bar) { st.quote = { t: bar[0], bid: bar[4] }; }     // never keeps the (reused) bar array
  function quote(st) { return st.quote ? { t: st.quote.t, bid: st.quote.bid, ask: st.quote.bid + st.sp } : null; }

  function isoToSec(v) { var ms = Date.parse(v); return isNaN(ms) ? null : Math.round(ms / 1000); }
  function secToIso(sec) { return new Date(sec * 1000).toISOString(); }

  // DB rows (any order) -> open positions and closed trades
  function restore(st, rows) {
    var s = st.sym, open = [], closed = [], real = 0;
    (rows || []).forEach(function (r) {
      var entryT = isoToSec(r.entry_time);
      var p = {
        id: r.id, dir: r.direction === 'SHORT' ? -1 : 1, steps: toSteps(r.lot, s.lotDigits),
        entry: toPts(r.entry_price, s.digits), entryT: entryT, entryBarT: entryT - 60,
        sl: toPts(r.stop_loss, s.digits), tp: toPts(r.take_profit, s.digits),
        sl0: r.initial_stop_loss != null ? toPts(r.initial_stop_loss, s.digits) : toPts(r.stop_loss, s.digits),
        tp0: r.initial_take_profit != null ? toPts(r.initial_take_profit, s.digits) : toPts(r.take_profit, s.digits),
        comm: toCents(r.commission) || 0, rr: toHundredths(r.rr_ratio),
        // opening order (the balance follows it, not the market time: the replay can go back in time) and the account section
        seq: Date.parse(r.created_at) || entryT * 1000, section: r.section_no > 0 ? Number(r.section_no) : 1
      };
      if (r.exit_time) {
        var exitT = isoToSec(r.exit_time), net = toCents(r.pnl);
        p.exit = toPts(r.exit_price, s.digits); p.exitT = exitT; p.reason = r.exit_reason;
        p.exitBarT = r.exit_reason === 'manual' ? exitT - 60 : exitT;
        p.ambiguous = !!r.exit_ambiguous;
        p.net = net;
        p.gross = r.gross_pnl != null ? toCents(r.gross_pnl) : net + p.comm;
        real += net; closed.push(p);
      } else open.push(p);
    });
    open.sort(function (a, b) { return a.entryT - b.entryT; });
    closed.sort(bySeq);
    st.open = open; st.closed = closed; st.realizedCents = real;
    return st;
  }

  // trades in the order they were opened (ties: market entry time, then id)
  function bySeq(a, b) { return (a.seq - b.seq) || (a.entryT - b.entryT) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); }

  function indexOfId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return i; return -1; }

  // balance and equity
  function floating(st) {
    var total = 0, byId = {};
    if (!st.quote) return { total: 0, byId: byId };
    st.open.forEach(function (p) {
      var mark = closeFill(p.dir, st.quote.bid, st.sp);
      var g = grossCents(st.sym, p.dir, p.entry, mark, p.steps);
      byId[p.id] = { mark: mark, gross: g, net: g - p.comm };
      total += g - p.comm;
    });
    return { total: total, byId: byId };
  }

  // ---------------------------------------------------------------- orders
  function validLevel(v) { return v == null || (Number.isInteger(v) && v > 0); }

  function validateOrder(st, o) {
    var s = st.sym;
    if (!st.quote) return { ok: false, code: 'NO_QUOTE' };
    var minSteps = Math.round(s.lot.min / s.lot.step), maxSteps = Math.round(s.lot.max / s.lot.step);
    if (!Number.isInteger(o.steps) || o.steps < minSteps || o.steps > maxSteps) return { ok: false, code: 'LOT_RANGE', field: 'lot' };
    if (!validLevel(o.sl)) return { ok: false, code: 'PRICE', field: 'sl' };
    if (!validLevel(o.tp)) return { ok: false, code: 'PRICE', field: 'tp' };
    var bid = st.quote.bid, ask = bid + st.sp;
    if (o.dir > 0) {
      if (o.sl != null && !(o.sl < bid)) return { ok: false, code: 'SL_LONG', field: 'sl' };
      if (o.tp != null && !(o.tp > ask)) return { ok: false, code: 'TP_LONG', field: 'tp' };
    } else {
      if (o.sl != null && !(o.sl > ask)) return { ok: false, code: 'SL_SHORT', field: 'sl' };
      if (o.tp != null && !(o.tp < bid)) return { ok: false, code: 'TP_SHORT', field: 'tp' };
    }
    if (st.open.length >= MAX_POSITIONS) return { ok: false, code: 'MAX_POSITIONS' };
    if (st.startCents + st.realizedCents + floating(st).total <= 0) return { ok: false, code: 'NO_EQUITY' };
    return { ok: true };
  }

  function openPosition(st, o) {
    var v = validateOrder(st, o);
    if (!v.ok) throw codeError(v.code, v.field);
    var entry = marketFill(o.dir, st.quote.bid, st.sp);
    var p = {
      id: o.id, dir: o.dir, steps: o.steps, entry: entry,
      entryT: st.quote.t + 60, entryBarT: st.quote.t,            // entry time = last revealed open + 60 s
      sl: o.sl == null ? null : o.sl, tp: o.tp == null ? null : o.tp,
      sl0: o.sl == null ? null : o.sl, tp0: o.tp == null ? null : o.tp,
      comm: commissionCents(st.sym, st.cplCents, o.steps),       // round-turn, snapshotted now, booked at close
      rr: rrHundredths(entry, o.sl == null ? null : o.sl, o.tp == null ? null : o.tp),
      seq: o.seq != null ? o.seq : Date.now(), section: o.section > 0 ? o.section : 1
    };
    st.open.push(p);
    return p;
  }

  // edit SL/TP of an open position against the live market only; entry, sl0/tp0 and rr stay
  function validateModify(st, id, sl, tp) {
    var i = indexOfId(st.open, id);
    if (i < 0) return { ok: false, code: 'NOT_FOUND' };
    if (!st.quote) return { ok: false, code: 'NO_QUOTE' };
    if (!validLevel(sl)) return { ok: false, code: 'PRICE', field: 'sl' };
    if (!validLevel(tp)) return { ok: false, code: 'PRICE', field: 'tp' };
    var p = st.open[i], bid = st.quote.bid, ask = bid + st.sp;
    if (p.dir > 0) {
      if (sl != null && !(sl < bid)) return { ok: false, code: 'MODIFY_LONG', field: 'sl' };
      if (tp != null && !(tp > bid)) return { ok: false, code: 'MODIFY_LONG', field: 'tp' };
    } else {
      if (sl != null && !(sl > ask)) return { ok: false, code: 'MODIFY_SHORT', field: 'sl' };
      if (tp != null && !(tp < ask)) return { ok: false, code: 'MODIFY_SHORT', field: 'tp' };
    }
    return { ok: true };
  }
  function modifyPosition(st, id, sl, tp) {
    var v = validateModify(st, id, sl, tp);
    if (!v.ok) throw codeError(v.code, v.field);
    var p = st.open[indexOfId(st.open, id)];
    p.sl = sl == null ? null : sl; p.tp = tp == null ? null : tp;
    return p;
  }

  function settle(st, i, exit, exitT, exitBarT, reason, ambiguous) {
    var p = st.open.splice(i, 1)[0];
    var gross = grossCents(st.sym, p.dir, p.entry, exit, p.steps);
    var t = {};
    Object.keys(p).forEach(function (k) { t[k] = p[k]; });
    t.exit = exit; t.exitT = exitT; t.exitBarT = exitBarT; t.reason = reason; t.ambiguous = !!ambiguous;
    t.gross = gross; t.net = gross - p.comm;
    st.closed.push(t); st.realizedCents += t.net;
    return t;
  }
  // manual close at the current quote (LONG at bid, SHORT at ask)
  function closePosition(st, id) {
    var i = indexOfId(st.open, id);
    if (i < 0 || !st.quote) return null;
    return settle(st, i, closeFill(st.open[i].dir, st.quote.bid, st.sp), st.quote.t + 60, st.quote.t, 'manual', false);
  }

  // one newly revealed 1m bar: TP/SL for positions opened BEFORE it, then the pending orders placed BEFORE it, then the quote
  // moves. Returns closed trades (also those a pending order opened and closed inside this bar); fills and rejections go to st.events.
  function onBar(st, bar) {
    var out = [];
    for (var i = 0; i < st.open.length;) {
      var p = st.open[i];
      if (p.entryBarT < bar[0]) {
        var hit = exitOnBar(p, bar, st.sp);
        if (hit) { out.push(settle(st, i, hit.pts, bar[0], bar[0], hit.reason, hit.ambiguous)); continue; }
      }
      i++;
    }
    if (st.orders && st.orders.length) fillOrders(st, bar, out);
    setQuote(st, bar);
    return out;
  }

  // ---------------------------------------------------------------- pending orders (limit / stop)
  // order: { id, dir, type 'limit'|'stop', price (points; the ASK level for a buy, the BID level for a sell), steps, sl, tp,
  //          placedT, placedBarT, seq, section }. A buy limit waits below the ask, a buy stop above it; a sell limit above the bid,
  //          a sell stop below it. An order never looks at the bar it was placed in or an earlier one (placedBarT < bar time).
  function validatePending(st, o) {
    var s = st.sym;
    if (!st.quote) return { ok: false, code: 'NO_QUOTE' };
    if (ORDER_TYPES.indexOf(o.type) < 0 || (o.dir !== 1 && o.dir !== -1)) return { ok: false, code: 'ORDER_TYPE' };
    var minSteps = Math.round(s.lot.min / s.lot.step), maxSteps = Math.round(s.lot.max / s.lot.step);
    if (!Number.isInteger(o.steps) || o.steps < minSteps || o.steps > maxSteps) return { ok: false, code: 'LOT_RANGE', field: 'lot' };
    if (!(Number.isInteger(o.price) && o.price > 0)) return { ok: false, code: 'PRICE', field: 'price' };
    if (!validLevel(o.sl)) return { ok: false, code: 'PRICE', field: 'sl' };
    if (!validLevel(o.tp)) return { ok: false, code: 'PRICE', field: 'tp' };
    var bid = st.quote.bid, ask = bid + st.sp;
    if (o.dir > 0 && o.type === 'limit' && !(o.price < ask)) return { ok: false, code: 'LIMIT_BUY', field: 'price' };
    if (o.dir > 0 && o.type === 'stop' && !(o.price > ask)) return { ok: false, code: 'STOP_BUY', field: 'price' };
    if (o.dir < 0 && o.type === 'limit' && !(o.price > bid)) return { ok: false, code: 'LIMIT_SELL', field: 'price' };
    if (o.dir < 0 && o.type === 'stop' && !(o.price < bid)) return { ok: false, code: 'STOP_SELL', field: 'price' };
    if (o.dir > 0) {
      if (o.sl != null && !(o.sl < o.price - st.sp)) return { ok: false, code: 'SL_ORDER_LONG', field: 'sl' };     // a long's stop triggers on the bid
      if (o.tp != null && !(o.tp > o.price)) return { ok: false, code: 'TP_ORDER_LONG', field: 'tp' };
    } else {
      if (o.sl != null && !(o.sl > o.price + st.sp)) return { ok: false, code: 'SL_ORDER_SHORT', field: 'sl' };    // a short's stop triggers on the ask
      if (o.tp != null && !(o.tp < o.price)) return { ok: false, code: 'TP_ORDER_SHORT', field: 'tp' };
    }
    return { ok: true };
  }
  function placeOrder(st, o) {
    if ((st.orders || []).length >= MAX_ORDERS) throw codeError('MAX_ORDERS');
    var v = validatePending(st, o);
    if (!v.ok) throw codeError(v.code, v.field);
    var ord = { id: o.id, dir: o.dir, type: o.type, price: o.price, steps: o.steps, sl: o.sl == null ? null : o.sl, tp: o.tp == null ? null : o.tp,
      placedT: st.quote.t + 60, placedBarT: st.quote.t, seq: o.seq != null ? o.seq : Date.now(), section: o.section > 0 ? o.section : 1 };
    st.orders.push(ord);
    return ord;
  }
  // change price / SL / TP / lot of a pending order (the same rules as placing it, against the live quote)
  function modifyOrder(st, id, ch) {
    var i = indexOfId(st.orders || [], id);
    if (i < 0) throw codeError('NOT_FOUND');
    var cur = st.orders[i], n = {};
    Object.keys(cur).forEach(function (k) { n[k] = cur[k]; });
    ['price', 'sl', 'tp', 'steps'].forEach(function (k) { if (ch && ch[k] !== undefined) n[k] = ch[k]; });
    var v = validatePending(st, n);
    if (!v.ok) throw codeError(v.code, v.field);
    st.orders[i] = n;
    return n;
  }
  function cancelOrder(st, id) {
    var i = indexOfId(st.orders || [], id);
    return i < 0 ? null : st.orders.splice(i, 1)[0];
  }
  // The price path inside one 1m bar (BID points): a rising bar goes open -> low -> high -> close, a falling one open -> high -> low
  // -> close. It decides the order of events inside a single minute (an order and the SL/TP of the position it opens).
  function barPath(bar) { return bar[4] >= bar[1] ? [bar[1], bar[3], bar[2], bar[4]] : [bar[1], bar[2], bar[3], bar[4]]; }
  // the first point of the path (from `from`, default the open) where the bid reaches `thr` falling ('le') or rising ('ge'):
  // { seg (segment index), bid, atStart (already there at `from`) } or null
  function firstCross(path, thr, cond, from) {
    from = from || { seg: 0, bid: path[0] };
    var start = from.bid;
    if (cond === 'le' ? start <= thr : start >= thr) return { seg: from.seg, bid: start, atStart: true };
    for (var k = from.seg; k < path.length - 1; k++) {
      var a = k === from.seg ? start : path[k], b = path[k + 1];
      if (cond === 'le' ? (b <= thr && a > thr) : (b >= thr && a < thr)) return { seg: k, bid: thr, atStart: false };
    }
    return null;
  }
  // when and where a pending order fills in this bar: { fill (price of the order side: ask for a buy, bid for a sell), seg, bid, gap }
  // or null. Gap: the bar opens beyond the level, the fill is the open (a limit gets the better price, a stop slips).
  function orderFillOnBar(ord, bar, sp) {
    var adj = ord.dir > 0 ? sp : 0, thr = ord.price - adj;                           // the level as a BID
    var cond = (ord.dir > 0) === (ord.type === 'limit') ? 'le' : 'ge';                 // buy limit and sell stop wait for a fall
    var path = barPath(bar), x = firstCross(path, thr, cond);
    if (!x) return null;
    if (x.atStart) return { fill: path[0] + adj, seg: 0, bid: path[0], gap: path[0] !== thr };
    return { fill: ord.price, seg: x.seg, bid: x.bid, gap: false };
  }
  // SL / TP of a position on the rest of the bar path after `from` (its fill point): { reason, pts } or null; the earlier one wins
  function exitOnPath(pos, path, from, sp) {
    var adj = pos.dir > 0 ? 0 : sp, best = null;
    function test(level, reason, cond) {
      if (level == null) return;
      var x = firstCross(path, level - adj, cond, from);
      if (!x) return;
      var at = x.atStart ? x.seg - 0.5 : x.seg;
      if (!best || at < best.at) best = { reason: reason, pts: level, at: at };
    }
    if (pos.dir > 0) { test(pos.sl, 'sl', 'le'); test(pos.tp, 'tp', 'ge'); } else { test(pos.sl, 'sl', 'ge'); test(pos.tp, 'tp', 'le'); }
    return best ? { reason: best.reason, pts: best.pts } : null;
  }
  // pending orders against one bar. A filled order becomes a position (entry inside this bar, entry time = the bar's open) and may
  // close again on the rest of the bar path. The position limit (20), the equity and the page's guard (monthly trade limit) can
  // refuse a fill: the order is dropped with a 'reject' event.
  function fillOrders(st, bar, out) {
    var keep = [];
    st.orders.forEach(function (ord) {
      if (!(ord.placedBarT < bar[0])) { keep.push(ord); return; }
      var f = orderFillOnBar(ord, bar, st.sp);
      if (!f) { keep.push(ord); return; }
      var deny = st.open.length >= MAX_POSITIONS ? 'MAX_POSITIONS'
        : (st.startCents + st.realizedCents + floating(st).total <= 0 ? 'NO_EQUITY' : (typeof st.allowFill === 'function' ? st.allowFill(ord) : null));
      if (deny) { st.events.push({ kind: 'reject', order: ord, code: deny, t: bar[0] }); return; }
      var p = {
        id: ord.id, dir: ord.dir, steps: ord.steps, entry: f.fill, entryT: bar[0], entryBarT: bar[0],
        sl: ord.sl, tp: ord.tp, sl0: ord.sl, tp0: ord.tp, comm: commissionCents(st.sym, st.cplCents, ord.steps),
        rr: rrHundredths(f.fill, ord.sl, ord.tp), seq: ord.seq, section: ord.section > 0 ? ord.section : 1, fromOrder: ord.type, gap: f.gap
      };
      st.open.push(p);
      st.events.push({ kind: 'fill', order: ord, position: p, gap: f.gap, t: bar[0] });
      var ex = exitOnPath(p, barPath(bar), { seg: f.seg, bid: f.bid }, st.sp);
      if (ex) {
        var t = settle(st, st.open.length - 1, ex.pts, bar[0], bar[0], ex.reason, true);
        t.intrabar = true;                                     // entry and exit inside one 1m bar: the bar path decided the order
        out.push(t);
      }
    });
    st.orders = keep;
  }
  // the fills and rejections since the last call
  function takeEvents(st) { var e = st.events || []; st.events = []; return e; }
  // stored orders (browser storage) -> valid orders only
  function sanitizeOrders(list) {
    return (Array.isArray(list) ? list : []).filter(function (o) {
      return o && typeof o.id === 'string' && (o.dir === 1 || o.dir === -1) && ORDER_TYPES.indexOf(o.type) >= 0 && Number.isInteger(o.price) && o.price > 0 &&
        Number.isInteger(o.steps) && o.steps > 0 && validLevel(o.sl) && validLevel(o.tp) && isFinite(o.placedT) && isFinite(o.placedBarT);
    }).slice(0, MAX_ORDERS).map(function (o) {
      return { id: o.id, dir: o.dir, type: o.type, price: o.price, steps: o.steps, sl: o.sl == null ? null : o.sl, tp: o.tp == null ? null : o.tp,
        placedT: o.placedT, placedBarT: o.placedBarT, seq: isFinite(o.seq) ? o.seq : o.placedT * 1000, section: o.section > 0 ? o.section : 1 };
    });
  }

  // ---------------------------------------------------------------- summary
  function summary(st) {
    var fl = floating(st).total, bal = st.startCents + st.realizedCents;
    var wins = 0, losses = 0, even = 0, amb = 0, comm = 0;
    st.closed.forEach(function (t) {
      if (t.net > 0) wins++; else if (t.net < 0) losses++; else even++;
      if (t.ambiguous) amb++;
      comm += t.comm;
    });
    // drawdown on the closed-trade balance curve, from startCents, in opening order
    var curve = st.closed.slice().sort(bySeq);
    var b = st.startCents, peak = b, maxDd = 0, ddPeak = peak;
    curve.forEach(function (t) {
      b += t.net;
      if (b > peak) peak = b;
      if (peak - b > maxDd) { maxDd = peak - b; ddPeak = peak; }
    });
    return {
      startCents: st.startCents, realizedCents: st.realizedCents, balanceCents: bal, floatingCents: fl, equityCents: bal + fl,
      closedCount: st.closed.length, openCount: st.open.length, wins: wins, losses: losses, breakeven: even,
      ambiguous: amb, commissionCents: comm, maxDdCents: maxDd,
      maxDdBp: ddPeak > 0 ? roundDiv(maxDd * 10000, ddPeak) : 0
    };
  }

  // numbers for the order hint: risk = gross loss at SL + commission, reward = gross at TP - commission (o.entry: at a pending price)
  function preview(st, o) {
    if (!st.quote) return null;
    var entry = o.entry != null ? o.entry : marketFill(o.dir, st.quote.bid, st.sp), comm = commissionCents(st.sym, st.cplCents, o.steps);   // entry: a pending order's price
    var risk = o.sl != null ? -grossCents(st.sym, o.dir, entry, o.sl, o.steps) + comm : null;
    var reward = o.tp != null ? grossCents(st.sym, o.dir, entry, o.tp, o.steps) - comm : null;
    return { entry: entry, riskCents: risk, rewardCents: reward, commCents: comm, rr: rrHundredths(entry, o.sl, o.tp) };
  }

  // ---------------------------------------------------------------- DB mapping (decimal strings, ISO times)
  function accountFromRow(r) {
    return {
      id: r.id, userId: r.user_id, journalId: r.journal_id || null, name: r.name, symbol: r.symbol, tf: r.timeframe,
      startCents: toCents(r.starting_balance), spreadH: toHundredths(r.spread_pips), cplCents: toCents(r.commission_per_lot),
      replaySec: isoToSec(r.replay_time), isActive: r.is_active !== false, dataSource: r.data_source || 'synthetic',
      sectionNo: r.section_no > 0 ? Number(r.section_no) : 1,
      sections: (Array.isArray(r.sections) && r.sections.length ? r.sections : [{ no: 1, start: r.replay_time }]).map(function (x) {
        return { no: Number(x.no) || 1, start: isoToSec(x.start) };
      }),
      source: r.data_source === 'ctrader' ? {
        ctid: Number(r.source_ctid_account), brokerName: r.source_broker_name || '', isLive: r.source_is_live === true,
        symbolId: Number(r.source_symbol_id), symbolName: r.source_symbol_name || '', digits: r.source_digits == null ? null : Number(r.source_digits)
      } : null,
      createdAt: r.created_at, updatedAt: r.updated_at
    };
  }
  function accountInsertRow(a) {
    var row = {
      user_id: a.userId, journal_id: a.journalId || null, name: a.name, symbol: a.symbol, timeframe: a.tf,
      starting_balance: centsToStr(a.startCents), spread_pips: hundredthsToStr(a.spreadH),
      commission_per_lot: centsToStr(a.cplCents), replay_time: secToIso(a.replaySec), data_source: a.dataSource || 'synthetic'
    };
    if (a.id) row.id = a.id;
    if (row.data_source === 'ctrader' && a.source) {         // where the candles come from; immutable after creation (migration 09)
      row.source_ctid_account = a.source.ctid; row.source_broker_name = a.source.brokerName || null;
      row.source_is_live = a.source.isLive === true; row.source_symbol_id = a.source.symbolId;
      row.source_symbol_name = a.source.symbolName; row.source_digits = a.source.digits == null ? null : a.source.digits;
    }
    return row;
  }
  function accountPatch(f) {
    var p = {};
    if (f.name !== undefined) p.name = f.name;
    if (f.journalId !== undefined) p.journal_id = f.journalId || null;
    if (f.spreadH !== undefined) p.spread_pips = hundredthsToStr(f.spreadH);
    if (f.cplCents !== undefined) p.commission_per_lot = centsToStr(f.cplCents);
    if (f.tf !== undefined) p.timeframe = f.tf;
    if (f.replaySec !== undefined) p.replay_time = secToIso(f.replaySec);
    if (f.isActive !== undefined) p.is_active = !!f.isActive;
    return p;
  }
  function tradeInsertRow(st, pos, ctx) {
    var s = st.sym, lv = function (v) { return v == null ? null : ptsToStr(v, s.digits); };
    return {
      id: pos.id, user_id: ctx.userId, backtest_account_id: ctx.accountId, symbol: s.id,
      direction: pos.dir > 0 ? 'LONG' : 'SHORT', lot: stepsToStr(pos.steps, s.lotDigits),
      entry_price: ptsToStr(pos.entry, s.digits), stop_loss: lv(pos.sl), take_profit: lv(pos.tp),
      entry_time: secToIso(pos.entryT), commission: centsToStr(pos.comm),
      rr_ratio: pos.rr == null ? null : hundredthsToStr(pos.rr)
    };
  }
  function tradeClosePatch(st, t, opts) {
    var p = { exit_price: ptsToStr(t.exit, st.sym.digits), exit_time: secToIso(t.exitT), exit_reason: t.reason, pnl: centsToStr(t.net) };
    if (opts && opts.extraColumns) { p.gross_pnl = centsToStr(t.gross); p.exit_ambiguous = !!t.ambiguous; }
    return p;
  }
  function tradeModifyPatch(st, pos) {
    var s = st.sym;
    return { stop_loss: pos.sl == null ? null : ptsToStr(pos.sl, s.digits), take_profit: pos.tp == null ? null : ptsToStr(pos.tp, s.digits) };
  }
  // row for WwMetrics.summarize (win rate, profit factor, expectancy, average R:R)
  function metricsRow(st, t) {
    return {
      exit_price: t.exit / pow10(st.sym.digits), pnl: t.net / 100, trade_date: secToIso(t.exitT),
      rr_ratio: t.rr == null ? null : t.rr / 100, entry_price: t.entry / pow10(st.sym.digits),
      lot: t.steps / pow10(st.sym.lotDigits), direction: t.dir > 0 ? 'LONG' : 'SHORT'
    };
  }

  global.WwBtEngine = {
    MAX_POSITIONS: MAX_POSITIONS, MAX_ORDERS: MAX_ORDERS, ORDER_TYPES: ORDER_TYPES,
    roundDiv: roundDiv, toPlainDecimalString: toPlainDecimalString, parseScaled: parseScaled,
    scaledToStr: scaledToStr, centsToStr: centsToStr, ptsToStr: ptsToStr, stepsToStr: stepsToStr, hundredthsToStr: hundredthsToStr,
    toCents: toCents, toPts: toPts, toSteps: toSteps, toHundredths: toHundredths,
    spreadPts: spreadPts, grossCents: grossCents, commissionCents: commissionCents, rrHundredths: rrHundredths,
    marketFill: marketFill, closeFill: closeFill, exitOnBar: exitOnBar,
    createState: createState, setQuote: setQuote, quote: quote, restore: restore,
    validateOrder: validateOrder, openPosition: openPosition, validateModify: validateModify, modifyPosition: modifyPosition,
    closePosition: closePosition, onBar: onBar, bySeq: bySeq,
    validatePending: validatePending, placeOrder: placeOrder, modifyOrder: modifyOrder, cancelOrder: cancelOrder, barPath: barPath,
    orderFillOnBar: orderFillOnBar, exitOnPath: exitOnPath, takeEvents: takeEvents, sanitizeOrders: sanitizeOrders, floating: floating, summary: summary, preview: preview,
    accountFromRow: accountFromRow, accountInsertRow: accountInsertRow, accountPatch: accountPatch,
    tradeInsertRow: tradeInsertRow, tradeClosePatch: tradeClosePatch, tradeModifyPatch: tradeModifyPatch, metricsRow: metricsRow
  };
})(typeof window !== 'undefined' ? window : globalThis);
