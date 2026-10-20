// manifest.json v1 - one per dataset root: "manifest.json" (real archive) and "synthetic/manifest.json".
// Written ONLY by the importer, always AFTER the month file it describes (crash-safe: a month file
// without a matching manifest entry is simply rebuilt on the next run).
import { FORMAT_VERSION } from './month-file.mjs';
import { ymRange, ymCmp, ymAdd, ymOf, dayAdd, dayStart, dayStr, daysOfMonth, monthEnd, DAY } from './time.mjs';

export const MANIFEST_VERSION = 1;
export const DATASETS = {
  archive: { prefix: '', label: 'Arşiv' },
  synthetic: { prefix: 'synthetic/', label: 'Sentetik veri · test' }
};

export function datasetPrefix(dataset) {
  const d = DATASETS[dataset];
  if (!d) throw new Error(`unknown dataset ${dataset}`);
  return d.prefix;
}
export function manifestPath(dataset) { return datasetPrefix(dataset) + 'manifest.json'; }
export function monthPath(dataset, symbol, ym) { return `${datasetPrefix(dataset)}${symbol}/${ym}.json.gz`; }

export function emptyManifest(dataset) {
  datasetPrefix(dataset);
  return { v: MANIFEST_VERSION, dataset, updatedAt: null, symbols: {} };
}

export function parseManifest(buf, dataset) {
  if (!buf) return emptyManifest(dataset);
  let m;
  try { m = JSON.parse(Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf)); }
  catch (e) { throw new Error(`manifest.json is not valid JSON: ${e.message}`); }
  if (!m || m.v !== MANIFEST_VERSION) throw new Error(`manifest.json version ${m && m.v} is not supported (expected ${MANIFEST_VERSION})`);
  if (m.dataset !== dataset) throw new Error(`manifest.json belongs to dataset "${m.dataset}", expected "${dataset}"`);
  if (!m.symbols || typeof m.symbols !== 'object') throw new Error('manifest.json has no symbols map');
  return m;
}

/** Stable, compact serialization: symbols and months sorted, summary fields first. */
export function serializeManifest(m) {
  const symbols = {};
  for (const id of Object.keys(m.symbols).sort()) {
    const s = m.symbols[id];
    const months = {};
    for (const ym of Object.keys(s.months || {}).sort()) months[ym] = s.months[ym];
    symbols[id] = {
      source: s.source, digits: s.digits, price: s.price, ...(s.generator ? { generator: s.generator } : {}),
      firstMonth: s.firstMonth ?? null, lastMonth: s.lastMonth ?? null, lastBar: s.lastBar ?? null, throughDay: s.throughDay ?? null,
      months
    };
  }
  return JSON.stringify({ v: m.v, dataset: m.dataset, updatedAt: m.updatedAt, symbols });
}

/**
 * Insert/replace one month entry and refresh the symbol summary.
 * entry: { source, bars, first, last, sha256, bytes, partial, throughDay, coverage, quality, origin, updatedAt }
 */
export function setMonth(m, sym, info, ym, entry) {
  const s = m.symbols[sym.id] || (m.symbols[sym.id] = { source: info.source, digits: sym.digits, price: info.price, months: {} });
  s.source = info.source; s.digits = sym.digits; s.price = info.price;
  if (info.generator) s.generator = info.generator; else delete s.generator;
  s.months[ym] = { v: FORMAT_VERSION, ...entry };
  refreshSummary(s);
  m.updatedAt = entry.updatedAt;
  return s;
}

export function refreshSummary(s) {
  const yms = Object.keys(s.months).filter((k) => s.months[k].bars > 0).sort();
  s.firstMonth = yms[0] || null;
  s.lastMonth = yms[yms.length - 1] || null;
  const last = s.lastMonth ? s.months[s.lastMonth] : null;
  s.lastBar = last ? last.last : null;
  s.throughDay = last ? last.throughDay : null;
}

/**
 * Backfill plan for one symbol: which months must be (re)built, computed BEFORE any source request.
 * @param {object} p { manifest, symId, sourceId, generator?, months: ['YYYY-MM'], listing: Map(name -> size) | null,
 *                     force: Set(ym), currentYm }
 * @returns {{ todo: Array<{ym, reason}>, skip: Array<{ym, reason}> }}
 */
export function planBackfill(p) {
  const s = p.manifest.symbols[p.symId];
  const todo = [], skip = [];
  for (const ym of p.months) {
    const e = s && s.months[ym];
    let reason = null;
    if (p.force && p.force.has(ym)) reason = 'forced';
    else if (!e) reason = 'missing';
    else if (e.empty) { skip.push({ ym, reason: 'empty-at-source' }); continue; }
    else if (e.partial) reason = ym === p.currentYm ? 'current-month' : 'partial';
    else if (e.source !== p.sourceId) reason = `source-changed (${e.source} -> ${p.sourceId})`;
    else if ((e.v || 0) < FORMAT_VERSION) reason = 'format-upgrade';
    else if (p.generator && (!s.generator || s.generator.version !== p.generator.version || s.generator.seed !== p.generator.seed)) reason = 'generator-changed';
    else if (p.listing && p.listing.get(`${ym}.json.gz`) === undefined) reason = 'object-missing';
    else if (p.listing && p.listing.get(`${ym}.json.gz`) !== e.bytes) reason = 'size-mismatch';
    if (reason) todo.push({ ym, reason }); else skip.push({ ym, reason: 'final' });
  }
  return { todo, skip };
}

/**
 * Daily plan for one symbol: only months that can still change (current month, partial months),
 * and for each the UTC days after its throughDay up to `yesterday`.
 * @returns Array<{ ym, fromDay|null, toDay, rebuild:boolean, reason }>
 */
export function planDaily({ manifest, symId, sourceId, generator, today }) {
  const yesterday = dayAdd(today, -1);
  const s = manifest.symbols[symId];
  const cur = ymOf(dayStart(today));
  const prevYm = ymOf(dayStart(yesterday));
  const months = new Set([cur, prevYm]);
  if (s) for (const [ym, e] of Object.entries(s.months)) if (e.partial) months.add(ym);
  const out = [];
  for (const ym of [...months].sort(ymCmp)) {
    const e = s && s.months[ym];
    const lastDayOfMonth = dayStr(monthEnd(ym) - DAY);
    const toDay = yesterday < lastDayOfMonth ? yesterday : lastDayOfMonth;
    if (toDay < `${ym}-01`) continue;                         // e.g. the 1st of the month: no complete day yet
    const genMismatch = generator && s && (!s.generator || s.generator.version !== generator.version || s.generator.seed !== generator.seed);
    if (e && e.source !== sourceId) { out.push({ ym, fromDay: `${ym}-01`, toDay, rebuild: true, reason: 'source-changed' }); continue; }
    if (e && genMismatch) { out.push({ ym, fromDay: `${ym}-01`, toDay, rebuild: true, reason: 'generator-changed' }); continue; }
    if (e && !e.partial) continue;                             // final month
    if (!e) { out.push({ ym, fromDay: `${ym}-01`, toDay, rebuild: true, reason: 'missing' }); continue; }
    const fromDay = e.throughDay ? dayAdd(e.throughDay, 1) : `${ym}-01`;
    out.push({ ym, fromDay: fromDay <= toDay ? fromDay : null, toDay, rebuild: false, reason: fromDay <= toDay ? 'new-days' : 'finalize-check' });
  }
  return out;
}

/** Days with at least one open minute in [fromDay, toDay] (crypto: every day; FX: no Saturdays, no full holidays). */
export function openDays(fromDay, toDay, symId, S) {
  const out = [];
  for (let d = fromDay; d <= toDay; d = dayAdd(d, 1)) {
    const t0 = dayStart(d);
    let open = false;
    for (let t = t0; t < t0 + DAY; t += 900) if (S.isOpen(t * 1000, symId)) { open = true; break; }   // 15-min probe
    if (!open) for (let t = t0; t < t0 + DAY && !open; t += 60) open = S.isOpen(t * 1000, symId);
    if (open) out.push(d);
  }
  return out;
}

/** Lag of the archive behind `yesterday`, counted in days that should contain data. */
export function lagDays({ throughDay, today, symId, S }) {
  const yesterday = dayAdd(today, -1);
  if (!throughDay) return Infinity;
  if (throughDay >= yesterday) return 0;
  return openDays(dayAdd(throughDay, 1), yesterday, symId, S).length;
}

export { ymRange, ymAdd, daysOfMonth };
