// SCRATCH verification of the Stage 4 pure APIs specified in plan/frontend/stage4.md.
// Not repo code. Builds on the verified prototypes (bt-symbols.js, bt-math.js) copied here.
import assert from 'node:assert/strict';
await import('./bt-symbols.js');
await import('./bt-math.js');
const S = globalThis.WwBtSymbols, M = globalThis.WwBtMath;
const roundDiv = M.roundDiv;
function pow10(n) { let r = 1; for (let i = 0; i < n; i++) r *= 10; return r; }

// ---------------- exact decimal <-> scaled integer ----------------
function toPlainDecimalString(x) {               // from agents2/bt-mapping-compact.mjs:4-16
  if (typeof x === 'string') return x.trim();
  if (!Number.isFinite(x)) throw new RangeError('non-finite');
  const s = String(x);
  if (!/e/i.test(s)) return s;
  const [mant, e] = s.toLowerCase().split('e'); const exp = +e;
  const neg = mant[0] === '-'; const [i, f = ''] = mant.replace('-', '').split('.');
  let digits = i + f, point = i.length + exp;
  if (point <= 0) { digits = '0'.repeat(1 - point) + digits; point = 1; }
  if (point >= digits.length) { digits += '0'.repeat(point - digits.length); point = digits.length; }
  const out = (digits.slice(0, point) + (point < digits.length ? '.' + digits.slice(point) : '')).replace(/^0+(?=\d)/, '');
  return (neg ? '-' : '') + out;
}
// parseScaled('1.083115', 5, 'round') -> { ok, value: 108312, snapped: true }
function parseScaled(input, scale, mode) {
  let s = (typeof input === 'number') ? toPlainDecimalString(input) : String(input == null ? '' : input).trim();
  if (s.indexOf(',') >= 0 && s.indexOf('.') < 0 && (s.match(/,/g) || []).length === 1) s = s.replace(',', '.');
  const m = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return { ok: false, code: 'FORMAT' };
  const neg = m[1] === '-'; let ip = m[2], fp = m[3] || '', snapped = false;
  if (fp.length > scale) {
    if (mode !== 'round') return { ok: false, code: 'DECIMALS' };
    const keep = fp.slice(0, scale), rest = fp.slice(scale);
    snapped = /[1-9]/.test(rest);
    let v = Number(ip + keep.padEnd(scale, '0'));
    if (rest.charCodeAt(0) >= 53) v += 1;           // first dropped digit >= '5' -> away from zero
    if (!Number.isSafeInteger(v)) return { ok: false, code: 'RANGE' };
    return { ok: true, value: (neg && v !== 0) ? -v : v, snapped };
  }
  const v = Number(ip + fp.padEnd(scale, '0'));
  if (!Number.isSafeInteger(v)) return { ok: false, code: 'RANGE' };
  return { ok: true, value: (neg && v !== 0) ? -v : v, snapped };
}
function scaledToStr(v, scale) {
  if (v === 0) v = 0;                                  // -0 -> 0
  const neg = v < 0; let s = String(Math.abs(v));
  if (scale === 0) return (neg ? '-' : '') + s;
  while (s.length <= scale) s = '0' + s;
  return (neg ? '-' : '') + s.slice(0, s.length - scale) + '.' + s.slice(s.length - scale);
}
const centsToStr = (c) => scaledToStr(c, 2);
const toCents = (v) => { const r = parseScaled(v, 2, 'round'); if (!r.ok) throw new Error('cents ' + v); return r.value; };

// PG ROUND(numeric,2) parity via decimal strings
for (const [inp, out] of [['1.005', '1.01'], ['-1.005', '-1.01'], ['2.675', '2.68'], ['1.045', '1.05'], ['0.125', '0.13'], ['-0.125', '-0.13'], ['-0.005', '-0.01'], ['-0.0049', '0.00'], ['41.44000000000037', '41.44'], [1e-7, '0.00'], ['12345678.995', '12345679.00'], ['-0.05', '-0.05'], [0, '0.00'], [41.44, '41.44']]) {
  assert.equal(centsToStr(toCents(inp)), out, 'round ' + inp);
}
assert.deepEqual(parseScaled('1.083115', 5, 'round'), { ok: true, value: 108312, snapped: true });
assert.deepEqual(parseScaled('1,08311', 5, 'exact'), { ok: true, value: 108311, snapped: false });
assert.equal(parseScaled('0.375', 2, 'exact').ok, false);
assert.equal(parseScaled('0,5', 2, 'exact').value, 50);
assert.equal(parseScaled('abc', 2, 'exact').ok, false);
assert.equal(scaledToStr(108311, 5), '1.08311'); assert.equal(scaledToStr(-5, 2), '-0.05');
assert.equal(scaledToStr(-0, 2), '0.00'); assert.equal(scaledToStr(37, 2), '0.37'); assert.equal(scaledToStr(8160025, 2), '81600.25');
assert.equal(toPlainDecimalString(1e-7), '0.0000001');

// ---------------- engine state machine ----------------
const MAX_OPEN = 20;
function sym(x) { return typeof x === 'string' ? S.get(x) : x; }
function createState(cfg) {
  const s = sym(cfg.symbol);
  return { sym: s, sp: cfg.spreadPts, startCents: cfg.startCents, cplCents: cfg.cplCents, open: [], closed: [], realizedCents: 0, quote: null };
}
function setQuote(st, bar) { st.quote = { t: bar[0], bid: bar[4] }; }
function bidOf(st) { return st.quote.bid; } function askOf(st) { return st.quote.bid + st.sp; }
function floating(st) {
  let total = 0; const byId = {};
  for (const p of st.open) {
    const mark = M.closeFill(p.dir, bidOf(st), st.sp);
    const g = M.grossCents(st.sym.id, p.dir, p.entry, mark, p.steps);
    byId[p.id] = { mark, gross: g, net: g - p.comm }; total += g - p.comm;
  }
  return { total, byId };
}
function validateOrder(st, o) {
  if (!st.quote) return { ok: false, code: 'NO_QUOTE' };
  const s = st.sym, minS = Math.round(s.lot.min / s.lot.step), maxS = Math.round(s.lot.max / s.lot.step);
  if (!Number.isSafeInteger(o.steps) || o.steps < minS || o.steps > maxS) return { ok: false, code: 'LOT_RANGE', field: 'lot' };
  const bid = bidOf(st), ask = askOf(st);
  if (o.sl != null && o.sl <= 0) return { ok: false, code: 'PRICE', field: 'sl' };
  if (o.tp != null && o.tp <= 0) return { ok: false, code: 'PRICE', field: 'tp' };
  if (o.dir > 0) {
    if (o.sl != null && !(o.sl < bid)) return { ok: false, code: 'SL_LONG', field: 'sl' };
    if (o.tp != null && !(o.tp > ask)) return { ok: false, code: 'TP_LONG', field: 'tp' };
  } else {
    if (o.sl != null && !(o.sl > ask)) return { ok: false, code: 'SL_SHORT', field: 'sl' };
    if (o.tp != null && !(o.tp < bid)) return { ok: false, code: 'TP_SHORT', field: 'tp' };
  }
  if (st.open.length >= MAX_OPEN) return { ok: false, code: 'MAX_POSITIONS' };
  if (st.startCents + st.realizedCents + floating(st).total <= 0) return { ok: false, code: 'NO_EQUITY' };
  return { ok: true };
}
function rrH(entry, sl, tp) { if (sl == null || tp == null) return null; const risk = Math.abs(entry - sl); if (risk === 0) return null; return roundDiv(Math.abs(tp - entry) * 100, risk); }
function commissionCents(s, cplCents, steps) { return roundDiv(cplCents * steps, pow10(s.lotDigits)); }
function openPosition(st, o) {
  const v = validateOrder(st, o); if (!v.ok) { const e = new Error(v.code); e.code = v.code; throw e; }
  const entry = M.marketFill(o.dir, bidOf(st), st.sp);
  const p = { id: o.id, dir: o.dir, steps: o.steps, entry, entryT: st.quote.t + 60, entryBarT: st.quote.t, sl: o.sl ?? null, tp: o.tp ?? null, sl0: o.sl ?? null, tp0: o.tp ?? null, comm: commissionCents(st.sym, st.cplCents, o.steps), rr: rrH(entry, o.sl ?? null, o.tp ?? null) };
  st.open.push(p); return p;
}
function settle(st, idx, exit, exitT, exitBarT, reason, ambiguous) {
  const p = st.open[idx]; st.open.splice(idx, 1);
  const gross = M.grossCents(st.sym.id, p.dir, p.entry, exit, p.steps), net = gross - p.comm;
  const tr = Object.assign({}, p, { exit, exitT, exitBarT, reason, ambiguous: !!ambiguous, gross, net });
  st.closed.push(tr); st.realizedCents += net; return tr;
}
function onBar(st, bar) {
  const out = [];
  for (let i = 0; i < st.open.length;) {
    const p = st.open[i];
    if (p.entryBarT < bar[0]) {
      const hit = M.exitOnBar(p, bar, st.sp);
      if (hit) { out.push(settle(st, i, hit.price, bar[0], bar[0], hit.reason.toLowerCase(), hit.ambiguous)); continue; }
    }
    i++;
  }
  setQuote(st, bar); return out;
}
function closePosition(st, id) {
  const i = st.open.findIndex(p => p.id === id); if (i < 0) return null;
  return settle(st, i, M.closeFill(st.open[i].dir, bidOf(st), st.sp), st.quote.t + 60, st.quote.t, 'manual', false);
}
function summary(st) {
  const f = floating(st).total, bal = st.startCents + st.realizedCents;
  let peak = st.startCents, run = st.startCents, dd = 0, ddBp = 0;
  for (const t of st.closed.slice().sort((a, b) => a.exitT - b.exitT)) { run += t.net; if (run > peak) peak = run; const d = peak - run; if (d > dd) { dd = d; ddBp = roundDiv(d * 10000, peak); } }
  return { balance: bal, realized: st.realizedCents, floating: f, equity: bal + f, maxDd: dd, maxDdBp: ddBp };
}
function preview(st, o) {
  const entry = M.marketFill(o.dir, bidOf(st), st.sp), comm = commissionCents(st.sym, st.cplCents, o.steps);
  const risk = o.sl == null ? null : -M.grossCents(st.sym.id, o.dir, entry, o.sl, o.steps) + comm;
  const reward = o.tp == null ? null : M.grossCents(st.sym.id, o.dir, entry, o.tp, o.steps) - comm;
  return { entry, risk, reward, rr: rrH(entry, o.sl ?? null, o.tp ?? null) };
}

// scenario 1: EURUSD manual close (verified money numbers)
let st = createState({ symbol: 'EURUSD', spreadPts: 2, startCents: 1000000, cplCents: 700 });
const T0 = Date.parse('2026-01-05T10:00:00Z') / 1000;
setQuote(st, [T0, 108300, 108312, 108295, 108309]);           // bid 1.08309 -> ask 1.08311
let p = openPosition(st, { id: 'a1', dir: 1, steps: 37, sl: 108111, tp: 108711 });
assert.equal(p.entry, 108311); assert.equal(p.comm, 259); assert.equal(p.rr, 200); assert.equal(p.entryT, T0 + 60);
assert.deepEqual(onBar(st, [T0, 108300, 108312, 108100, 108309]), []);          // same bar as entry: skipped
assert.deepEqual(onBar(st, [T0 + 60, 108320, 108430, 108300, 108423]), []);
let f = floating(st); assert.equal(f.byId.a1.gross, 4144); assert.equal(f.total, 3885);
let tr = closePosition(st, 'a1');
assert.equal(tr.exit, 108423); assert.equal(tr.gross, 4144); assert.equal(tr.net, 3885); assert.equal(tr.exitT, T0 + 120); assert.equal(tr.exitBarT, T0 + 60);
assert.equal(centsToStr(summary(st).balance), '10038.85');
// scenario 2: TP on the next bar
st = createState({ symbol: 'EURUSD', spreadPts: 2, startCents: 1000000, cplCents: 700 });
setQuote(st, [T0, 108300, 108312, 108295, 108309]);
openPosition(st, { id: 'a2', dir: 1, steps: 37, sl: 108111, tp: 108711 });
let closed = onBar(st, [T0 + 60, 108320, 108720, 108300, 108700]);
assert.equal(closed.length, 1); assert.equal(closed[0].reason, 'tp'); assert.equal(closed[0].exit, 108711); assert.equal(closed[0].exitT, T0 + 60);
assert.equal(closed[0].gross, 14800); assert.equal(centsToStr(closed[0].net), '145.41');
// scenario 3: same 1m bar hits SL and TP -> SL, ambiguous
st = createState({ symbol: 'EURUSD', spreadPts: 2, startCents: 1000000, cplCents: 0 });
setQuote(st, [T0, 108300, 108310, 108290, 108300]);
openPosition(st, { id: 'a3', dir: 1, steps: 100, sl: 108200, tp: 108500 });
closed = onBar(st, [T0 + 60, 108300, 108550, 108150, 108300]);
assert.equal(closed[0].reason, 'sl'); assert.equal(closed[0].exit, 108200); assert.equal(closed[0].ambiguous, true);
assert.equal(closed[0].gross, -10200);                       // (108200 - 108302) * 100 steps
// scenario 4: USDJPY SHORT, spread 0, commission 7
st = createState({ symbol: 'USDJPY', spreadPts: 0, startCents: 1000000, cplCents: 700 });
setQuote(st, [T0, 151200, 151240, 151190, 151234]);
openPosition(st, { id: 'j1', dir: -1, steps: 100, sl: null, tp: null });
onBar(st, [T0 + 60, 151234, 151240, 150980, 150987]);
assert.equal(floating(st).byId.j1.gross, 16359);
tr = closePosition(st, 'j1'); assert.equal(centsToStr(tr.net), '156.59');
// scenario 5: SHORT gap above SL fills at ask open
st = createState({ symbol: 'EURUSD', spreadPts: 2, startCents: 1000000, cplCents: 0 });
setQuote(st, [T0, 108300, 108310, 108290, 108300]);
openPosition(st, { id: 's1', dir: -1, steps: 10, sl: 108400, tp: 108100 });
closed = onBar(st, [T0 + 3 * 86400, 108450, 108460, 108440, 108450]);      // after a weekend gap
assert.equal(closed[0].reason, 'sl'); assert.equal(closed[0].exit, 108452); assert.equal(closed[0].exitT, T0 + 3 * 86400);
// validateOrder side checks (bid 108300 / ask 108302)
st = createState({ symbol: 'EURUSD', spreadPts: 2, startCents: 1000000, cplCents: 0 });
setQuote(st, [T0, 108300, 108310, 108290, 108300]);
const vo = (o) => validateOrder(st, Object.assign({ steps: 10 }, o)).code || 'OK';
assert.equal(vo({ dir: 1, tp: 108302 }), 'TP_LONG'); assert.equal(vo({ dir: 1, tp: 108303 }), 'OK');
assert.equal(vo({ dir: 1, sl: 108300 }), 'SL_LONG'); assert.equal(vo({ dir: 1, sl: 108299 }), 'OK');
assert.equal(vo({ dir: -1, tp: 108300 }), 'TP_SHORT'); assert.equal(vo({ dir: -1, tp: 108299 }), 'OK');
assert.equal(vo({ dir: -1, sl: 108302 }), 'SL_SHORT'); assert.equal(vo({ dir: -1, sl: 108303 }), 'OK');
assert.equal(vo({ dir: 1, steps: 0 }), 'LOT_RANGE'); assert.equal(vo({ dir: 1, steps: 10001 }), 'LOT_RANGE'); assert.equal(vo({ dir: 1, steps: 10000 }), 'OK');
// preview (risk hint)
st = createState({ symbol: 'EURUSD', spreadPts: 2, startCents: 1000000, cplCents: 700 });
setQuote(st, [T0, 108300, 108312, 108295, 108309]);
const pv = preview(st, { dir: 1, steps: 37, sl: 108111, tp: 108711 });
assert.deepEqual(pv, { entry: 108311, risk: 7659, reward: 14541, rr: 200 });
// drawdown
st = createState({ symbol: 'EURUSD', spreadPts: 0, startCents: 100000, cplCents: 0 });
st.closed = [10000, -30000, 5000, -10000].map((n, i) => ({ net: n, exitT: i })); st.realizedCents = -25000;
assert.deepEqual(((s) => [s.balance, s.maxDd, s.maxDdBp])(summary(st)), [75000, 35000, 3182]);
console.log('engine OK');

// ---------------- candles: merge / builder / bucketEndIndex / gapKind ----------------
function merge(a, b) {
  const out = a.map(c => Object.assign({}, c));
  for (const c of b) {
    const last = out[out.length - 1];
    if (last && last.time === c.time) { if (c.high > last.high) last.high = c.high; if (c.low < last.low) last.low = c.low; last.close = c.close; last.n += c.n; }
    else if (last && c.time < last.time) throw new Error('BT_NON_MONOTONIC');
    else out.push(Object.assign({}, c));
  }
  return out;
}
function createBuilder(tfMin, id, candles) {
  candles = candles || [];
  return { candles, push(t, o, h, l, c) {
    const s = M.bucketStart(t, tfMin, id), last = candles[candles.length - 1];
    if (last && last.time === s) { if (h > last.high) last.high = h; if (l < last.low) last.low = l; last.close = c; last.n++; return candles.length - 1; }
    if (last && s < last.time) throw new Error('BT_NON_MONOTONIC');
    candles.push({ time: s, open: o, high: h, low: l, close: c, n: 1 }); return candles.length - 1;
  } };
}
function bucketEndIndex(bars, k, tfMin, id) {
  const s = M.bucketStart(bars[k][0], tfMin, id); let j = k;
  while (j + 1 < bars.length && M.bucketStart(bars[j + 1][0], tfMin, id) === s) j++;
  return j;
}
function gapKind(prevT, t, id) {
  if (t - prevT <= 60) return null;
  const from = (prevT + 60) * 1000, no = S.nextOpen(from, id);
  if (no === null || no >= t * 1000) return { kind: 'closed', minutes: (t - prevT) / 60 - 1 };
  return { kind: 'missing', minutes: Math.round((t * 1000 - no) / 60000) };
}
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
function synth(id, fromIso, toIso, start) {
  const out = []; let px = start;
  for (let ms = Date.parse(fromIso); ms < Date.parse(toIso); ms += 60000) {
    if (!S.isOpen(ms, id)) continue;
    const o = px, c = px + Math.round((rnd() - 0.5) * 20); const h = Math.max(o, c) + Math.floor(rnd() * 5), l = Math.min(o, c) - Math.floor(rnd() * 5);
    out.push([ms / 1000, o, h, l, c]); px = c;
  }
  return out;
}
const fx = synth('EURUSD', '2026-08-28T00:00:00Z', '2026-09-04T00:00:00Z', 108000);
const cut = fx.findIndex(b => b[0] >= Date.parse('2026-09-01T00:00:00Z') / 1000);
for (const tf of [1, 5, 15, 30, 60, 240, 1440]) {
  const whole = M.aggregate(fx, tf, 'EURUSD');
  const split = merge(M.aggregate(fx.slice(0, cut), tf, 'EURUSD'), M.aggregate(fx.slice(cut), tf, 'EURUSD'));
  assert.deepEqual(split, whole, 'merge tf ' + tf);
  for (const k of [0, 17, 1439, 2000, cut - 1, cut, fx.length - 1]) {
    const b = createBuilder(tf, 'EURUSD'); for (let i = 0; i <= k; i++) b.push(...fx[i]);
    assert.deepEqual(b.candles, M.aggregate(fx, tf, 'EURUSD', 0, k), 'builder tf ' + tf + ' k ' + k);
    const last = b.candles[b.candles.length - 1];
    assert.equal(last.close, fx[k][4]); assert.ok(b.candles.every(c => c.time <= fx[k][0]));
  }
}
// D1 bucket spanning the month boundary: Tue 2026-09-01 bar starts 2026-08-31T21:00Z
const d1 = M.aggregate(fx, 1440, 'EURUSD').map(c => new Date(c.time * 1000).toISOString().slice(0, 16));
assert.ok(d1.includes('2026-08-31T21:00'));
// bucketEndIndex: H1 bucket of a bar at 10:17 ends at the 10:59 bar
const k1017 = fx.findIndex(b => b[0] === Date.parse('2026-09-02T10:17:00Z') / 1000);
assert.equal(new Date(fx[bucketEndIndex(fx, k1017, 60, 'EURUSD')][0] * 1000).toISOString(), '2026-09-02T10:59:00.000Z');
assert.equal(bucketEndIndex(fx, fx.length - 1, 60, 'EURUSD'), fx.length - 1);
// gapKind: weekend closed; 30-minute hole on a Tuesday is missing (30 minutes)
const fri = Date.parse('2026-08-28T20:59:00Z') / 1000, sun = Date.parse('2026-08-30T21:00:00Z') / 1000;
assert.deepEqual(gapKind(fri, sun, 'EURUSD'), { kind: 'closed', minutes: (sun - fri) / 60 - 1 });
const a = Date.parse('2026-09-01T09:59:00Z') / 1000, b2 = Date.parse('2026-09-01T10:30:00Z') / 1000;
assert.deepEqual(gapKind(a, b2, 'EURUSD'), { kind: 'missing', minutes: 30 });
assert.equal(gapKind(a, a + 60, 'EURUSD'), null);
// stepTarget: complete current bucket, else complete the next one; open=true at the loaded end
function stepTarget(bars, k, tfMin, id) {
  if (k >= bars.length - 1) return { j: k, open: true };
  const end = bucketEndIndex(bars, k, tfMin, id);
  const j = end > k ? end : bucketEndIndex(bars, k + 1, tfMin, id);
  return { j, open: j === bars.length - 1 };
}
const k1059 = fx.findIndex(b => b[0] === Date.parse('2026-09-02T10:59:00Z') / 1000);
assert.equal(new Date(fx[stepTarget(fx, k1017, 60, 'EURUSD').j][0] * 1000).toISOString(), '2026-09-02T10:59:00.000Z');
assert.equal(new Date(fx[stepTarget(fx, k1059, 60, 'EURUSD').j][0] * 1000).toISOString(), '2026-09-02T11:59:00.000Z');
assert.deepEqual(stepTarget(fx, fx.length - 1, 60, 'EURUSD'), { j: fx.length - 1, open: true });
// D1 step from Friday's last bar skips the weekend to Monday's trading day (Sunday 21:00Z .. Monday 20:59Z)
const kFriLast = fx.findIndex(b => b[0] === Date.parse('2026-08-28T20:59:00Z') / 1000);
const stD1 = stepTarget(fx, kFriLast, 1440, 'EURUSD');
assert.equal(new Date(fx[stD1.j][0] * 1000).toISOString(), '2026-08-31T20:59:00.000Z');
// framePlan
function framePlan(acc, dtMs, speed, tfMin, maxBars) {
  const a = acc + Math.min(dtMs, 250) / 1000 * speed * tfMin;
  const n = Math.min(Math.floor(a), maxBars);
  let rest = a - n; if (rest > maxBars) rest = 0;
  return { n, acc: rest };
}
assert.equal(framePlan(0, 16.67, 1, 60, 3000).n, 1);
let fp = framePlan(0, 16, 0.1, 1, 3000); assert.equal(fp.n, 0); assert.ok(Math.abs(fp.acc - 0.0016) < 1e-12);
fp = framePlan(0, 1000, 10, 1440, 3000); assert.equal(fp.n, 3000); assert.equal(fp.acc, 600);   // dt clamped to 250 ms: 3600 -> 3000 now, 600 kept
fp = framePlan(2900, 250, 10, 1440, 3000); assert.equal(fp.n, 3000); assert.equal(fp.acc, 0);     // 6500 -> 3000, rest 3500 > max -> dropped
assert.deepEqual(framePlan(0, 5000, 1, 60, 3000), framePlan(0, 250, 1, 60, 3000));                // dt clamp
console.log('candles OK');

// MAX_POSITIONS / NO_EQUITY
st = createState({ symbol: 'EURUSD', spreadPts: 2, startCents: 1000000, cplCents: 0 });
setQuote(st, [T0, 108300, 108310, 108290, 108300]);
for (let i = 0; i < 20; i++) openPosition(st, { id: 'm' + i, dir: 1, steps: 1 });
assert.equal(validateOrder(st, { dir: 1, steps: 1 }).code, 'MAX_POSITIONS');
st = createState({ symbol: 'EURUSD', spreadPts: 0, startCents: 100, cplCents: 0 });   // $1.00 account
setQuote(st, [T0, 108300, 108310, 108290, 108300]);
openPosition(st, { id: 'e1', dir: 1, steps: 100 });                                       // 1 lot
onBar(st, [T0 + 60, 108300, 108300, 108200, 108200]);                                     // -100 pts * 100 steps = -$100 floating
assert.ok(floating(st).total < -100); assert.equal(validateOrder(st, { dir: 1, steps: 1 }).code, 'NO_EQUITY');
// toMinutes-style rounding of decimal prices
assert.deepEqual([1.08311, 1.0832, 1.083, 1.08315].map(x => Math.round(x * 1e5)), [108311, 108320, 108300, 108315]);
assert.ok([1.08311, 1.0832, 1.083, 1.08315].every(x => Math.abs(x * 1e5 - Math.round(x * 1e5)) < 1e-6));
// DB mapping strings (scenario 1) and restore from PostgREST numbers
assert.deepEqual([scaledToStr(108311, 5), scaledToStr(108111, 5), scaledToStr(108711, 5), scaledToStr(108423, 5)], ['1.08311', '1.08111', '1.08711', '1.08423']);
assert.deepEqual([centsToStr(259), centsToStr(3885), centsToStr(4144), scaledToStr(200, 2), scaledToStr(37, 2)], ['2.59', '38.85', '41.44', '2.00', '0.37']);
assert.deepEqual([parseScaled(0.37, 2, 'round').value, parseScaled(1.08311, 5, 'round').value, parseScaled(38.85, 2, 'round').value, parseScaled(2.59, 2, 'round').value], [37, 108311, 3885, 259]);
assert.deepEqual([parseScaled('10000.00', 2, 'exact').value, parseScaled('0.20', 2, 'exact').value, parseScaled('7.00', 2, 'exact').value], [1000000, 20, 700]);
console.log('mapping OK');
console.log('ALL OK');
