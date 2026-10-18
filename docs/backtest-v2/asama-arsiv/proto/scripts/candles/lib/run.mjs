// Orchestration: lock -> per dataset manifest -> per symbol (pool) -> per month (sequential) -> upload file,
// then manifest. Idempotent: identical content (same sha256) is never uploaded twice.
import os from 'node:os';
import { validateRows, manifestQuality } from './quality.mjs';
import { encodeMonth, decodeMonth } from './month-file.mjs';
import {
  manifestPath, monthPath, datasetPrefix, parseManifest, serializeManifest, setMonth, planBackfill, planDaily, lagDays
} from './manifest.mjs';
import { mapPool, createMutex } from './http.mjs';
import { ymRange, ymAdd, ymOf, currentYm, todayUtc, dayAdd, dayStart, dayStr, monthStart, monthEnd, DAY, isoUtc, ymCmp } from './time.mjs';

export const LOCK_PATH = '_import.lock.json';
export const LOCK_STALE_MS = 6 * 3600 * 1000;       // > the longest possible GitHub job (6 h)
export const CACHE_FINAL = 'max-age=31536000';      // safe: clients always add ?cacheNonce=<sha256 prefix>
export const CACHE_PARTIAL = 'max-age=300';
export const CACHE_MANIFEST = 'no-cache';
export const LAG_TOLERANCE_DAYS = 2;                // owner decision: newest-day lag <= 2 days = warning

export class FatalError extends Error { constructor(m) { super(m); this.name = 'FatalError'; } }
export class LockError extends Error { constructor(m) { super(m); this.name = 'LockError'; } }

export async function acquireLock(storage, { runId, mode, sources, forceUnlock, log, clock = Date.now }) {
  const body = Buffer.from(JSON.stringify({ runId, mode, sources, host: os.hostname(), gha: process.env.GITHUB_ACTIONS === 'true', startedAt: new Date(clock()).toISOString() }));
  if (await storage.createExclusive(LOCK_PATH, body, { contentType: 'application/json' })) return;
  let held = null;
  try { held = JSON.parse((await storage.get(LOCK_PATH)).toString('utf8')); } catch { /* unreadable lock = stale */ }
  const age = held ? clock() - Date.parse(held.startedAt) : Infinity;
  if (forceUnlock || !(age < LOCK_STALE_MS)) {
    log.warn(`taking over the import lock of run ${held ? held.runId : '?'} (age ${Number.isFinite(age) ? Math.round(age / 60000) + ' min' : 'unknown'}${forceUnlock ? ', --force-unlock' : ', stale'})`);
    await storage.put(LOCK_PATH, body, { contentType: 'application/json', cacheControl: 'no-cache', upsert: true });
    return;
  }
  throw new LockError(`another import is running (run ${held.runId} on ${held.host}, started ${held.startedAt}). Wait, or use --force-unlock if it crashed.`);
}

export async function releaseLock(storage, runId, log) {
  try {
    const buf = await storage.get(LOCK_PATH);
    if (buf && JSON.parse(buf.toString('utf8')).runId === runId) await storage.remove([LOCK_PATH]);
  } catch (e) { log.warn(`could not release the import lock: ${e.message}`); }
}

/**
 * @param {object} p { opts, S, storage, resolved: [{adapter, symbols, planOnly, override}], log, report, runId, clock }
 * @returns {Promise<number>} exit code
 */
export async function runImport(p) {
  const { opts, storage, log, report } = p;
  const clock = p.clock || Date.now;
  const today = todayUtc(clock);
  const state = { errors: 0 };
  const manifests = new Map();                         // dataset -> { m, mutex }
  const lockHeld = !opts.dryRun;
  if (lockHeld) await acquireLock(storage, { runId: p.runId, mode: opts.mode, sources: p.resolved.map((r) => r.adapter.id), forceUnlock: opts.forceUnlock, log, clock });
  try {
    for (const r of p.resolved) {
      const ds = r.adapter.dataset;
      if (!manifests.has(ds)) manifests.set(ds, { m: parseManifest(await storage.get(manifestPath(ds)), ds), mutex: createMutex() });
    }
    const jobs = [];
    for (const r of p.resolved) for (const sym of r.symbols) jobs.push({ r, sym });
    await mapPool(jobs, opts.concurrency, async ({ r, sym }) => {
      const ctx = { ...p, today, clock, state, man: manifests.get(r.adapter.dataset), adapter: r.adapter, sym, planOnly: r.planOnly, override: r.override };
      try {
        if (opts.mode === 'backfill') await backfillSymbol(ctx);
        else await dailySymbol(ctx);
      } catch (e) {
        if (e.fatal || e instanceof FatalError) throw e;
        state.errors++;
        log.error(`${r.adapter.id} ${sym.id}: ${e.message}`, 'Candles import');
        report.error(`${r.adapter.id} ${sym.id}: ${e.message}`, { source: r.adapter.id, symbol: sym.id });
      }
    });
  } finally {
    if (lockHeld) await releaseLock(storage, p.runId, log);
  }
  return state.errors ? 1 : 0;
}

async function backfillSymbol(c) {
  const { opts, adapter, sym, man, log, storage } = c;
  const cur = currentYm(c.clock);
  const to = opts.to || cur;
  const defFrom = adapter.dataset === 'synthetic' ? ymAdd(to, -12) : sym.dataStart;
  let from = opts.from || defFrom;
  if (ymCmp(from, sym.dataStart) < 0 && adapter.dataset !== 'synthetic') from = sym.dataStart;
  const months = ymRange(from, ymCmp(to, cur) > 0 ? cur : to);
  const listing = await storage.list(datasetPrefix(adapter.dataset) + sym.id);
  const plan = planBackfill({ manifest: man.m, symId: sym.id, sourceId: adapter.id, generator: adapter.generator, months, listing, force: opts.forceMonths, currentYm: cur });
  log.info(`${adapter.dataset}/${adapter.id} ${sym.id}: ${plan.todo.length} month(s) to build, ${plan.skip.length} final/skipped (${months[0]}..${months[months.length - 1]})`);
  if (opts.dryRun || c.planOnly) {
    for (const t of plan.todo) c.report.add({ dataset: adapter.dataset, source: adapter.id, symbol: sym.id, month: t.ym, action: 'planned', reason: t.reason });
    for (const t of plan.todo) log.info(`  plan ${sym.id} ${t.ym}: ${t.reason}`);
    return;
  }
  let prevClose = null;
  for (const t of plan.todo) {
    const res = await buildMonthFromSource(c, t.ym, prevClose);
    if (res && res.lastClose) prevClose = res.lastClose;
  }
}

/** Build a whole month (final monthly artifact if published, else complete days up to yesterday). */
async function buildMonthFromSource(c, ym, prevClose) {
  const { adapter, sym, log } = c;
  const srcCtx = { today: c.today, log };
  const isPast = monthEnd(ym) <= dayStart(c.today);
  let fetched = null, partial = true, throughDay = null, origin;
  if (isPast && await adapter.monthAvailable(sym, ym, srcCtx)) {
    fetched = await adapter.fetchMonth(sym, ym, srcCtx);
    if (fetched) { partial = false; throughDay = dayStr(monthEnd(ym) - DAY); origin = fetched.origin; }
  }
  if (!fetched) {
    const lastDay = isPast ? dayStr(monthEnd(ym) - DAY) : dayAdd(c.today, -1);
    const days = await fetchDays(c, `${ym}-01`, lastDay);
    if (!days.rows.length && !days.through) {
      log.warn(`${sym.id} ${ym}: no ${adapter.label} data published for this month yet`);
      return null;
    }
    fetched = { rows: days.rows, parse: days.parse };
    throughDay = days.through;
    origin = { kind: adapter.dailyIsFinal ? 'generated' : 'daily', files: days.files };
    // Real sources: a month built from daily files stays partial until the final monthly artifact replaces it.
    partial = !(adapter.dailyIsFinal && isPast && throughDay === lastDay);
  }
  return writeMonth(c, ym, fetched.rows, fetched.parse, { partial, throughDay, origin, prevClose });
}

/** Fetch consecutive days; stops at the first day that is not published yet. */
async function fetchDays(c, fromDay, toDay) {
  const rows = [], parse = { malformed: 0, rounded: 0 };
  let through = null, files = 0;
  for (let d = fromDay; d <= toDay; d = dayAdd(d, 1)) {
    const r = await c.adapter.fetchDay(c.sym, d, { today: c.today, log: c.log });
    if (!r) { c.log.debug(`${c.sym.id} ${d}: not published yet`); break; }
    for (const x of r.rows) rows.push(x);
    parse.malformed += r.parse.malformed || 0; parse.rounded += r.parse.rounded || 0;
    through = d; files += r.origin.files || 0;
  }
  return { rows, parse, through, files };
}

async function dailySymbol(c) {
  const { adapter, sym, man, log, storage, opts } = c;
  const plan = planDaily({ manifest: man.m, symId: sym.id, sourceId: adapter.id, generator: adapter.generator, today: c.today });
  if (opts.dryRun || c.planOnly) {
    for (const t of plan) { log.info(`  plan ${sym.id} ${t.ym}: ${t.reason} ${t.fromDay || ''}..${t.toDay}`); c.report.add({ dataset: adapter.dataset, source: adapter.id, symbol: sym.id, month: t.ym, action: 'planned', reason: t.reason }); }
    return;
  }
  for (const t of plan) {
    const entry = man.m.symbols[sym.id] && man.m.symbols[sym.id].months[t.ym];
    const isPast = monthEnd(t.ym) <= dayStart(c.today);
    // a past month built from dailies becomes final as soon as the monthly artifact is published
    if (isPast && (t.rebuild || entry?.partial) && await adapter.monthAvailable(sym, t.ym, { today: c.today, log })) {
      await buildMonthFromSource(c, t.ym, null);
      continue;
    }
    if (t.rebuild) { await buildMonthFromSource(c, t.ym, null); continue; }
    if (!t.fromDay) continue;                                         // nothing new yet
    let base = [];
    if (entry && entry.bars > 0) {
      const buf = await storage.get(monthPath(adapter.dataset, sym.id, t.ym));
      try {
        base = buf ? decodeMonth(buf, { symbol: sym.id, month: t.ym, digits: sym.digits, sha256: entry.sha256 }).rows : null;
      } catch (e) { log.warn(`${sym.id} ${t.ym}: stored file does not match the manifest (${e.message}); rebuilding the month`); base = null; }
      if (!base) { await buildMonthFromSource(c, t.ym, null); continue; }
    }
    const days = await fetchDays(c, t.fromDay, t.toDay);
    if (!days.through) continue;                                       // not published yet (lag checked below)
    const rows = base.concat(days.rows);
    const isPastFull = isPast && days.through === dayStr(monthEnd(t.ym) - DAY);
    await writeMonth(c, t.ym, rows, days.parse, {
      partial: !(adapter.dailyIsFinal && isPastFull),
      throughDay: days.through,
      origin: { kind: adapter.dailyIsFinal ? 'generated' : 'daily', files: (entry?.origin?.files || 0) + days.files }
    });
  }
  // publication lag of the newest day (owner rule: <= 2 days warning, older = failure)
  const s = man.m.symbols[sym.id];
  const lag = lagDays({ throughDay: s ? s.throughDay : null, today: c.today, symId: sym.id, S: c.S });
  if (lag > LAG_TOLERANCE_DAYS) {
    throw new Error(`archive is ${Number.isFinite(lag) ? lag : 'all'} trading day(s) behind (last complete day ${s ? s.throughDay : 'none'}); tolerance is ${LAG_TOLERANCE_DAYS}`);
  } else if (lag > 0) {
    log.warn(`${sym.id}: newest ${lag} day(s) not published by ${adapter.label} yet (tolerated up to ${LAG_TOLERANCE_DAYS})`);
    c.report.warn(`${sym.id}: ${lag} day(s) publication lag`, { symbol: sym.id, source: adapter.id });
  }
}

/** Validate, encode, upload (file first, then manifest) one month. */
async function writeMonth(c, ym, rawRows, parse, meta) {
  const { adapter, sym, man, storage, log, report } = c;
  const bounds = { from: monthStart(ym), to: monthEnd(ym) };
  const coverage = { from: bounds.from, to: meta.throughDay ? dayStart(meta.throughDay) + DAY : bounds.from };
  const v = validateRows(rawRows, { sym, S: c.S, bounds, coverage, knownOutages: adapter.knownOutages(sym, bounds), prevClose: meta.prevClose, parse });
  const item = report.add({ dataset: adapter.dataset, source: adapter.id, symbol: sym.id, month: ym, action: null, bars: v.rows.length,
    partial: meta.partial, throughDay: meta.throughDay, quality: v.quality, verdict: v.verdict, reasons: v.reasons, warnings: v.warnings, details: v.details, override: c.override || undefined });
  if (v.verdict === 'fail') {
    item.action = 'failed';
    c.state.errors++;
    log.error(`${sym.id} ${ym}: ${v.reasons.join('; ')} - not uploaded`, 'Candle validation');
    return null;
  }
  for (const w of v.warnings) log.warn(`${sym.id} ${ym}: ${w}`);
  const enc = encodeMonth({ symbol: sym.id, month: ym, digits: sym.digits, source: adapter.id, price: adapter.price, rows: v.rows });
  const path = monthPath(adapter.dataset, sym.id, ym);
  const prev = man.m.symbols[sym.id]?.months[ym];
  const unchanged = prev && prev.sha256 === enc.sha256 && prev.bytes > 0;
  if (!unchanged) {
    await storage.put(path, enc.gz, { contentType: 'application/gzip', cacheControl: meta.partial ? CACHE_PARTIAL : CACHE_FINAL, upsert: true });
  }
  item.action = unchanged ? 'unchanged' : 'uploaded';
  item.sha256 = enc.sha256; item.bytes = unchanged ? prev.bytes : enc.bytes;
  const entry = {
    source: adapter.id, bars: enc.count, first: enc.first, last: enc.last, sha256: enc.sha256, bytes: item.bytes,
    partial: meta.partial, throughDay: meta.throughDay,
    coverage: { from: coverage.from, to: coverage.to, expected: v.quality.expected, ratio: v.quality.ratio },
    quality: manifestQuality(v.quality), origin: meta.origin,
    override: c.override ? true : undefined,
    updatedAt: isoUtc(Math.floor(c.clock() / 1000))
  };
  await man.mutex(async () => {
    setMonth(man.m, sym, { source: adapter.id, price: adapter.price, generator: adapter.generator }, ym, entry);
    await storage.put(manifestPath(adapter.dataset), Buffer.from(serializeManifest(man.m)), { contentType: 'application/json', cacheControl: CACHE_MANIFEST, upsert: true });
  });
  log.info(`${adapter.dataset}/${sym.id} ${ym}: ${item.action} ${enc.count} bars, ${(item.bytes / 1024).toFixed(0)} KiB, ${meta.partial ? 'partial through ' + meta.throughDay : 'final'}, coverage ${(v.quality.ratio * 100).toFixed(2)}%`);
  return { lastClose: v.rows.length ? v.rows[v.rows.length - 1][4] : null };
}

/** Rollback step 1 / cleanup: delete every object of one dataset through the Storage API. */
export async function runPurge({ storage, dataset, S, log }) {
  const prefix = datasetPrefix(dataset);
  const paths = [];
  for (const sym of S.list()) for (const name of (await storage.list(prefix + sym.id)).keys()) paths.push(`${prefix}${sym.id}/${name}`);
  const n = await storage.remove(paths);
  await storage.remove([manifestPath(dataset)]);
  log.info(`purged ${n} month file(s) and the manifest of dataset "${dataset}"`);
  return 0;
}

export { ymOf };
