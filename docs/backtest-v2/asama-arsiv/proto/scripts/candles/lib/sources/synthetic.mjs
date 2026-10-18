// "synthetic" development source (D12): deterministic, seedable, realistic 1m BID candles.
// - Respects each symbol's market hours (WwBtSymbols.isOpen): no bar while the market is closed.
// - Prices on the symbol's point grid (digits); typical volatility from sym.synthetic.vol (annualised).
// - Random access by UTC day: a day depends only on (seed, symbol, day) and two daily anchors, so building a
//   month day by day (daily mode) gives byte-identical files to building it at once (backfill).
// - Only +, -, *, /, sqrt and integer ops: bit-identical results on every IEEE-754 JS engine (no Math.exp/log/cos).
// Writes to the separate dataset prefix synthetic/ and is labelled "Sentetik veri · test" in the UI.
import { DAY, dayStart, dayStr, dayAdd, monthStart, monthEnd } from '../time.mjs';

export const GENERATOR = Object.freeze({ name: 'synthetic', version: 1 });
const EPOCH = Date.UTC(2018, 0, 1) / 1000;           // fixed forever: changing it changes every generated price
const LN2 = 0.6931471805599453;
const HALF_LIFE_DAYS = 365;                          // mean reversion towards sym.synthetic.ref
const SUBSTEPS = 4;                                  // intra-minute path points for high/low
const JUMP_P = 0.002, JUMP_MULT = 4;                 // occasional fat-tail minutes
const GAP_FACTOR = 0.3, GAP_CAP_MIN = 600;           // opening gap after a closure of >= 60 min
// Realistic imperfections, so replay gap handling can be tested (drawn from a separate stream: the price path
// does not depend on them). Outages are reported to the validator as known outages, thin drops are <= 5 min.
const THIN_DROP_P = 0.0003;                          // per open minute: bar missing
const OUTAGE_DAY_P = { crypto: 1 / 45, default: 1 / 60 };
const OUTAGE_MIN = [20, 120];                        // outage length range in minutes

// UTC-hour volatility profiles (relative; normalised over the open minutes of each day)
const PROFILES = {
  fx:     [0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.8, 1.2, 1.2, 1.2, 1.2, 1.2, 1.4, 1.4, 1.4, 1.4, 0.9, 0.9, 0.9, 0.9, 0.8, 0.6, 0.6, 0.6],
  metal:  [0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.7, 1.0, 1.0, 1.0, 1.0, 1.0, 1.5, 1.5, 1.5, 1.5, 1.5, 0.9, 0.9, 0.9, 0.8, 0.6, 0.6, 0.6],
  crypto: [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.15, 1.15, 1.15, 1.15, 1.15, 1.15, 1.15, 1.15, 0.95, 0.95, 0.95]
};

// ---- deterministic PRNG: FNV-1a string hash -> fmix32 -> mulberry32 stream ----
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function fmix32(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
export function stream(key) {
  let a = fmix32(fnv1a(key));
  const u = () => {                                  // mulberry32 -> [0, 1)
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const n = () => { let s = 0; for (let i = 0; i < 12; i++) s += u(); return s - 6; };   // Irwin-Hall N(0,1) approx
  return { u, n };
}

/**
 * @param {{ S: object, seed?: number }} o  S = WwBtSymbols
 */
export function createSyntheticGenerator({ S, seed = 1 }) {
  const anchorCache = new Map();

  function params(sym) {
    const sc = S.SCHEDULES[sym.schedule];
    const scale = 10 ** sym.digits;
    const yearMin = (sc.alwaysOpen ? 365 : 252) * 1440;
    return {
      sc, scale,
      ref: sym.synthetic.ref * scale,
      sigmaMin: sym.synthetic.vol / Math.sqrt(yearMin),          // relative stdev per open minute
      lo: sym.sanity.min * scale * 1.25, hi: sym.sanity.max * scale * 0.8,
      profile: PROFILES[sym.schedule] || PROFILES.fx
    };
  }

  // Open fraction of a UTC day, probed every 15 min (anchor walk only; bars use exact minutes).
  function openFraction(sym, d0) {
    if (S.SCHEDULES[sym.schedule].alwaysOpen) return 1;
    let k = 0;
    for (let t = d0; t < d0 + DAY; t += 900) if (S.isOpen(t * 1000, sym.id)) k++;
    return k / 96;
  }

  // A[i] = price level (float points) at 00:00 UTC of day EPOCH + i. Sequential walk, extended lazily.
  function anchor(sym, idx) {
    if (idx < 0) throw new Error(`synthetic data starts at ${dayStr(EPOCH)}`);
    let c = anchorCache.get(sym.id);
    if (!c) { const p = params(sym); c = { p, A: [p.ref], rnd: stream(`${seed}|${sym.id}|anchors|v${GENERATOR.version}`) }; anchorCache.set(sym.id, c); }
    const { p, A, rnd } = c;
    const theta = LN2 / HALF_LIFE_DAYS;
    const sigmaDay = p.sigmaMin * Math.sqrt(1440 * (p.sc.alwaysOpen ? 1 : 365 / 252));
    while (A.length <= idx) {
      const i = A.length - 1, a = A[i];
      const w = openFraction(sym, EPOCH + i * DAY);
      let next = a + theta * w * (p.ref - a) + sigmaDay * a * Math.sqrt(w) * rnd.n();
      if (next < p.lo) next = p.lo + (p.lo - next) * 0.1;
      if (next > p.hi) next = p.hi - (next - p.hi) * 0.1;
      A.push(next);
    }
    return A[idx];
  }

  function openMinutes(sym, d0, p) {
    const mins = [];
    let closedRun = 0;
    // closure length before 00:00 matters for the first minute: look back up to GAP_CAP_MIN
    for (let t = d0 - 60; t >= d0 - GAP_CAP_MIN * 60 && !S.isOpen(t * 1000, sym.id); t -= 60) closedRun++;
    for (let t = d0; t < d0 + DAY; t += 60) {
      if (!S.isOpen(t * 1000, sym.id)) { closedRun++; continue; }
      mins.push({ t, f: p.profile[Math.floor((t - d0) / 3600)], gapMin: closedRun >= 60 ? Math.min(closedRun, GAP_CAP_MIN) : 0 });
      closedRun = 0;
    }
    return mins;
  }

  /** Deterministic imperfections of one day: an optional outage window and isolated thin drops. */
  function dayDrops(sym, idx, mins) {
    const rnd = stream(`${seed}|${sym.id}|drops|${idx}|v${GENERATOR.version}`);
    const pDay = S.SCHEDULES[sym.schedule].alwaysOpen ? OUTAGE_DAY_P.crypto : OUTAGE_DAY_P.default;
    let outage = null;
    if (mins.length && rnd.u() < pDay) {
      const at = mins[Math.floor(rnd.u() * mins.length)].t;
      const len = OUTAGE_MIN[0] + Math.floor(rnd.u() * (OUTAGE_MIN[1] - OUTAGE_MIN[0]));
      outage = { from: at, to: at + len * 60, note: 'synthetic outage (generated on purpose)' };
    }
    const drop = new Set();
    for (const m of mins) {
      if (outage && m.t >= outage.from && m.t < outage.to) { drop.add(m.t); continue; }
      if (rnd.u() < THIN_DROP_P) drop.add(m.t);
    }
    return { outage, drop };
  }

  /** Known (generated) outage windows that intersect [from, to) seconds - fed to the validator. */
  function outages(sym, from, to) {
    const out = [], p = params(sym);
    for (let d0 = Math.floor(from / DAY) * DAY; d0 < to; d0 += DAY) {
      const idx = Math.round((d0 - EPOCH) / DAY);
      if (idx < 0) continue;
      const { outage } = dayDrops(sym, idx, openMinutes(sym, d0, p));
      if (outage && outage.to > from && outage.from < to) out.push(outage);
    }
    return out;
  }

  /** Rows [t,o,h,l,c] (integer points) for one UTC day. */
  function generateDay(sym, day) {
    const d0 = dayStart(day);
    const idx = Math.round((d0 - EPOCH) / DAY);
    const p = params(sym);
    const start = anchor(sym, idx), end = anchor(sym, idx + 1);
    // open minutes of the day, each with its variance and an optional opening gap
    const mins = openMinutes(sym, d0, p);
    if (!mins.length) return [];
    // normalise the profile so the mean variance per open minute equals sigmaMin^2
    let f2 = 0; for (const m of mins) f2 += m.f * m.f;
    const norm = Math.sqrt(mins.length / f2);
    const rnd = stream(`${seed}|${sym.id}|day|${idx}|v${GENERATOR.version}`);
    const base = p.sigmaMin * start;                       // stdev in points per minute at today's level
    const inc = [], vars = [];
    for (const m of mins) {
      const s = base * m.f * norm;
      const jump = rnd.u() < JUMP_P ? JUMP_MULT : 1;
      const gs = m.gapMin ? s * Math.sqrt(m.gapMin) * GAP_FACTOR : 0;
      inc.push(gs ? gs * rnd.n() : 0, s * jump * rnd.n());
      vars.push(gs * gs, s * s * jump * jump);
    }
    // Brownian bridge: condition the independent increments on their sum = end - start
    let sum = 0, V = 0;
    for (let i = 0; i < inc.length; i++) { sum += inc[i]; V += vars[i]; }
    const k = V > 0 ? (end - start - sum) / V : 0;
    for (let i = 0; i < inc.length; i++) inc[i] += vars[i] * k;
    // walk the path and build the bars
    const rows = new Array(mins.length);
    let level = start;
    for (let i = 0; i < mins.length; i++) {
      const o = level + inc[2 * i];
      const c = o + inc[2 * i + 1];
      // intra-minute path: SUBSTEPS increments conditioned on the minute move
      const sub = Math.sqrt(vars[2 * i + 1] / SUBSTEPS);
      const u = []; let us = 0;
      for (let j = 0; j < SUBSTEPS; j++) { const x = sub * rnd.n(); u.push(x); us += x; }
      let hi = Math.max(o, c), lo = Math.min(o, c), x = o;
      for (let j = 0; j < SUBSTEPS - 1; j++) { x += u[j] + (c - o - us) / SUBSTEPS; if (x > hi) hi = x; if (x < lo) lo = x; }
      const O = Math.round(o), C = Math.round(c);
      const H = Math.max(Math.round(hi), O, C), L = Math.max(1, Math.min(Math.round(lo), O, C));
      rows[i] = [mins[i].t, O, H, L, C];
      level = c;
    }
    const { drop } = dayDrops(sym, idx, mins);
    return drop.size ? rows.filter((r) => !drop.has(r[0])) : rows;
  }

  function generateRange(sym, fromDay, toDay) {
    const out = [];
    for (let d = fromDay; d <= toDay; d = dayAdd(d, 1)) for (const r of generateDay(sym, d)) out.push(r);
    return out;
  }

  return { generateDay, generateRange, anchor, outages };
}

/**
 * Source adapter. Availability mimics a real daily feed: every complete UTC day up to yesterday.
 * It never touches the network.
 */
export function createSyntheticAdapter({ S, seed = 1 }) {
  const gen = createSyntheticGenerator({ S, seed });
  return {
    id: 'synthetic', label: 'Sentetik', dataset: 'synthetic', price: 'bid', network: false,
    dailyIsFinal: true,                                  // a generated day never changes later
    generator: { ...GENERATOR, seed },
    supports: (sym) => !!sym.synthetic,
    isEnabled: () => true,                                // development source: never licence-gated
    knownOutages: (sym, bounds) => gen.outages(sym, bounds.from, bounds.to),
    /** A complete month is "published" once the whole month is in the past. */
    async monthAvailable(sym, ym, ctx) { return monthEnd(ym) <= dayStart(ctx.today); },
    async fetchMonth(sym, ym) {
      const first = dayStr(monthStart(ym)), last = dayStr(monthEnd(ym) - DAY);
      return { rows: gen.generateRange(sym, first, last), origin: { kind: 'generated', files: 0 }, parse: {} };
    },
    /** One day, or null when not yet "published" (today or later). */
    async fetchDay(sym, day, ctx) {
      if (day >= ctx.today) return null;
      return { rows: gen.generateDay(sym, day), origin: { kind: 'generated', files: 0 }, parse: {} };
    }
  };
}
