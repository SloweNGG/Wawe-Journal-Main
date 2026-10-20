// Validation and quality report for 1m rows [t, o, h, l, c] (t = UTC epoch seconds of the bar open,
// prices = integer points). Never fills or invents candles: bad rows are dropped and counted,
// missing minutes are reported as gaps.

const DETAIL_CAP = 50;          // max listed items per detail kind (counts are always exact)
const THIN_MAX_MIN = 5;         // open-market gap of <= 5 min = 'thin' (normal around rollover/session open)
const OUTAGE_MIN = 60;          // >= 60 min = 'outage'

export const COVERAGE_WARN = { crypto: 0.995, default: 0.98 };

/**
 * @param {Array<number[]>} input  rows [t,o,h,l,c] (points), any order, may contain duplicates
 * @param {object} ctx
 *   sym: symbol config (id, instrument, sanity, digits); S: WwBtSymbols API (isOpen, isThin)
 *   bounds: { from, to }   rows outside [from, to) are dropped as outOfRange (a month or a day)
 *   coverage: { from, to } window in which every open minute is expected (defaults to bounds)
 *   knownOutages: [{ from, to, note }] (seconds; optional)  prevClose: points (optional, continuity)
 *   parse: { malformed, rounded, header, units } counters from the adapter's parser (optional)
 */
export function validateRows(input, ctx) {
  const { sym, S } = ctx;
  const bounds = ctx.bounds;
  const cov = ctx.coverage || bounds;
  const sanityMin = Math.round(sym.sanity.min * 10 ** sym.digits);
  const sanityMax = Math.round(sym.sanity.max * 10 ** sym.digits);
  const q = {
    expected: 0, present: 0, missing: 0, ratio: 1,
    gaps: 0, maxGapMin: 0, unexplainedGaps: 0, unexplainedMin: 0,
    dupes: 0, conflicts: 0, invalid: 0, outOfRange: 0, misaligned: 0,
    malformed: ctx.parse?.malformed || 0, rounded: ctx.parse?.rounded || 0,
    outOfOrder: 0, outOfHours: 0, zeroRange: 0, suspects: 0
  };
  const details = { gaps: [], invalid: [], conflicts: [], suspects: [], outOfHours: [] };
  const push = (arr, item) => { if (arr.length < DETAIL_CAP) arr.push(item); };

  // 1. per-row checks
  const byT = new Map();
  let prevT = -Infinity;
  for (const r of input) {
    const [t, o, h, l, c] = r;
    if (!Number.isInteger(t) || t % 60 !== 0) { q.misaligned++; continue; }
    if (t < bounds.from || t >= bounds.to) { q.outOfRange++; continue; }
    let why = null;
    if (![o, h, l, c].every(Number.isSafeInteger)) why = 'non-integer price';
    else if (!(o > 0 && h > 0 && l > 0 && c > 0)) why = 'price <= 0';
    else if (l > Math.min(o, c) || h < Math.max(o, c)) why = 'OHLC inconsistent';
    else if (l < sanityMin || h > sanityMax) why = 'outside sanity range';
    if (why) { q.invalid++; push(details.invalid, { t, why }); continue; }
    if (t < prevT) q.outOfOrder++;
    prevT = Math.max(prevT, t);
    const old = byT.get(t);
    if (old) {
      q.dupes++;
      if (old[1] !== o || old[2] !== h || old[3] !== l || old[4] !== c) { q.conflicts++; push(details.conflicts, t); }
      continue;   // keep the first occurrence
    }
    byT.set(t, [t, o, h, l, c]);
  }
  const rows = [...byT.values()].sort((a, b) => a[0] - b[0]);
  q.present = rows.length;

  // 2. bar-level observations (report only)
  const sp = sym.sanity;
  for (let i = 0; i < rows.length; i++) {
    const [t, o, h, l, c] = rows[i];
    if (o === h && h === l && l === c) q.zeroRange++;
    if (!S.isOpen(t * 1000, sym.id)) { q.outOfHours++; push(details.outOfHours, t); }
    const range = (h - l) / c * 100;
    if (range > sp.barPct) { q.suspects++; push(details.suspects, { t, kind: 'range', value: round2(range) }); }
    if (i > 0) {
      const p = rows[i - 1], dt = t - p[0];
      const jump = Math.abs(o - p[4]) / p[4] * 100;
      const limit = dt === 60 ? sp.jumpPct : sp.jumpPct * 3;
      if (jump > limit) { q.suspects++; push(details.suspects, { t, kind: dt === 60 ? 'jump' : 'gap-jump', value: round2(jump) }); }
    }
    if (i > 0 && i < rows.length - 1) {
      const pc = rows[i - 1][4], no = rows[i + 1][1];
      const upWick = (h - Math.max(o, c, pc, no)) / c * 100;
      const dnWick = (Math.min(o, c, pc, no) - l) / c * 100;
      if (upWick > sp.spikePct) { q.suspects++; push(details.suspects, { t, kind: 'wick-high', value: round2(upWick) }); }
      if (dnWick > sp.spikePct) { q.suspects++; push(details.suspects, { t, kind: 'wick-low', value: round2(dnWick) }); }
    }
  }
  if (ctx.prevClose && rows.length) {
    const jump = Math.abs(rows[0][1] - ctx.prevClose) / ctx.prevClose * 100;
    if (jump > sp.jumpPct * 3) { q.suspects++; push(details.suspects, { t: rows[0][0], kind: 'month-continuity', value: round2(jump) }); }
  }

  // 3. expected open minutes and gaps inside the coverage window
  const inCov = rows.filter((r) => r[0] >= cov.from && r[0] < cov.to);
  let expected = 0;
  for (let t = cov.from; t < cov.to; t += 60) if (S.isOpen(t * 1000, sym.id)) expected++;
  q.expected = expected;
  let run = null;
  const closeRun = () => {
    if (!run) return;
    const min = run.n;
    const known = (ctx.knownOutages || []).find((k) => run.from >= k.from && run.to <= k.to);
    let kind = min <= THIN_MAX_MIN ? 'thin' : min >= OUTAGE_MIN ? 'outage' : 'missing';
    if (run.thin) kind = 'holiday-thin';
    if (known) kind = 'known-outage';
    q.gaps++; q.missing += min; q.maxGapMin = Math.max(q.maxGapMin, min);
    if (kind === 'missing' || kind === 'outage') { q.unexplainedGaps++; q.unexplainedMin += min; }
    push(details.gaps, { from: run.from, to: run.to + 60, min, kind, note: known ? known.note : undefined });
    run = null;
  };
  const scan = (a, b) => {           // missing minutes in [a, b)
    for (let t = a; t < b; t += 60) {
      if (S.isOpen(t * 1000, sym.id)) {
        if (run && run.to === t - 60) { run.to = t; run.n++; run.thin = run.thin && S.isThin(t * 1000, sym.id); }
        else { closeRun(); run = { from: t, to: t, n: 1, thin: S.isThin(t * 1000, sym.id) }; }
      } else closeRun();   // a closed minute ends a run: gaps never span a closed session
    }
  };
  let expect = cov.from;
  for (const r of inCov) { if (r[0] > expect) scan(expect, r[0]); closeRun(); expect = r[0] + 60; }
  if (expect < cov.to) scan(expect, cov.to);
  closeRun();
  const presentOpen = inCov.length - inCov.filter((r) => !S.isOpen(r[0] * 1000, sym.id)).length;
  q.ratio = expected ? Math.round(presentOpen / expected * 1e6) / 1e6 : 1;

  // 4. verdict
  const reasons = [], warnings = [];
  const hard = q.invalid + q.conflicts + q.malformed + q.misaligned;
  if (hard > Math.max(5, Math.floor(input.length * 0.001))) reasons.push(`${hard} invalid/conflicting/malformed rows (limit max(5, 0.1%))`);
  if (expected > 0 && q.present === 0) reasons.push('no rows although the market was open');
  const minRatio = sym.instrument === 'crypto' ? COVERAGE_WARN.crypto : COVERAGE_WARN.default;
  if (q.ratio < minRatio) warnings.push(`coverage ${(q.ratio * 100).toFixed(2)}% < ${(minRatio * 100).toFixed(1)}%`);
  if (q.unexplainedGaps) warnings.push(`${q.unexplainedGaps} unexplained gap(s), ${q.unexplainedMin} min`);
  if (q.outOfHours) warnings.push(`${q.outOfHours} bar(s) outside configured market hours (schedule config?)`);
  if (q.suspects) warnings.push(`${q.suspects} suspect bar(s) (report only)`);
  if (hard) warnings.push(`${hard} row(s) dropped`);
  if (q.rounded) warnings.push(`${q.rounded} price(s) had more decimals than digits=${sym.digits} and were rounded`);
  const verdict = reasons.length ? 'fail' : warnings.length ? 'warn' : 'ok';
  return { rows, quality: q, details, verdict, reasons, warnings };
}

/** Compact quality summary stored in manifest.json (the full details go to the run report). */
export function manifestQuality(q) {
  return {
    expected: q.expected, missing: q.missing, gaps: q.gaps, maxGapMin: q.maxGapMin,
    unexplainedGaps: q.unexplainedGaps, dupes: q.dupes, conflicts: q.conflicts,
    invalid: q.invalid + q.malformed + q.misaligned, rounded: q.rounded,
    outOfHours: q.outOfHours, zeroRange: q.zeroRange, suspects: q.suspects
  };
}

function round2(x) { return Math.round(x * 100) / 100; }
