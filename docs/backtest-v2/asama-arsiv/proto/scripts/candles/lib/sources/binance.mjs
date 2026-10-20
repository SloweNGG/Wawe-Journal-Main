// Binance spot 1m klines from data.binance.vision. WRITTEN BUT DISABLED (R52): every binance symbol in
// bt-symbols.js has enabled:false until the owner's licence decision. Binance Vision Dataset Terms v1.0
// (2026-08-26): CC BY-NC-SA 4.0; commercial use needs a written enterprise data licence (§3.4, §4.3, §4.4).
// The importer refuses this adapter unless the symbol is enabled or the owner passes
// --owner-override-disabled binance on a LOCAL run (refused under GitHub Actions).
//
// Complete months: monthly zip + .CHECKSUM. Current (or not yet published) month: daily zips + .CHECKSUM.
// Deterministic URLs only (no S3 listing: issue #511 asks whether listing is an approved access method).
import { createHash } from 'node:crypto';
import { extractSingleEntry } from '../zip.mjs';
import { decimalToPoints } from '../prices.mjs';
import { fetchWithRetry } from '../http.mjs';
import { parseYm, dayStart, monthStart, monthEnd } from '../time.mjs';

export const BASE = 'https://data.binance.vision/data/spot';
const CHECKSUM_RE = /^([0-9a-fA-F]{64}) [ *](\S+)\s*$/;          // sha256sum text or binary mode
const ENTRY_RE = /^[A-Z0-9]+-1m-\d{4}-\d{2}(-\d{2})?\.csv$/;

// Verified exchange-wide halts (gaps tagged 'known-outage' instead of 'missing'). Add entries only after a
// gap was seen in the imported data AND matched to a Binance announcement.
export const KNOWN_OUTAGES = [
  { from: Date.UTC(2020, 5, 28, 2, 0) / 1000, to: Date.UTC(2020, 5, 28, 5, 30) / 1000, note: 'Binance spot system upgrade 2020-06-28 (gap 02:00-05:29Z seen in ETHUSDT-1m-2020-06; resume 05:30 UTC per announcement)' }
];

export function monthlyUrl(sym, ym) { const { y, m } = parseYm(ym); const s = sym.source.symbol; return `${BASE}/monthly/klines/${s}/1m/${s}-1m-${y}-${String(m).padStart(2, '0')}.zip`; }
export function dailyUrl(sym, day) { const s = sym.source.symbol; return `${BASE}/daily/klines/${s}/1m/${s}-1m-${day}.zip`; }

export function parseChecksum(text, expectedName) {
  const m = CHECKSUM_RE.exec(String(text).trim());
  if (!m) throw new Error('CHECKSUM file has an unexpected format');
  if (m[2].replace(/^\*/, '') !== expectedName) throw new Error(`CHECKSUM names ${m[2]}, expected ${expectedName}`);
  return m[1].toLowerCase();
}

/**
 * Binance kline CSV -> rows [t, o, h, l, c] in integer points. No header expected (a non-numeric first
 * line is skipped and counted). open_time: 13 digits = ms (<= 2024), 16 digits = µs (from 2025-01-01).
 */
export function parseKlinesCsv(buf, digits) {
  const parse = { lines: 0, header: 0, malformed: 0, rounded: 0, units: { ms: 0, us: 0 } };
  const rows = [];
  const text = buf.toString('utf8');
  let i = 0, lineNo = 0;
  while (i < text.length) {
    let j = text.indexOf('\n', i); if (j < 0) j = text.length;
    let line = text.slice(i, j); i = j + 1; lineNo++;
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (!line) continue;
    if (lineNo === 1 && !/^\d/.test(line)) { parse.header++; continue; }
    parse.lines++;
    const c = line.split(',');
    if (c.length !== 12 || !/^\d{13}(\d{3})?$/.test(c[0])) { parse.malformed++; continue; }
    const us = c[0].length === 16;
    if (/[^0]/.test(c[0].slice(10))) { parse.malformed++; continue; }   // sub-second part must be zero
    parse.units[us ? 'us' : 'ms']++;
    const t = Number(c[0].slice(0, 10));
    const px = [];
    for (let k = 1; k <= 4; k++) {
      const p = decimalToPoints(c[k], digits);
      if (!p) { px.length = 0; break; }
      if (p.rounded) parse.rounded++;
      px.push(p.pts);
    }
    if (px.length !== 4) { parse.malformed++; continue; }
    rows.push([t, px[0], px[1], px[2], px[3]]);
  }
  return { rows, parse };
}

export function createBinanceAdapter({ fetch = globalThis.fetch, log, cache, sleep } = {}) {
  async function download(url, name) {
    const cached = cache && await cache.get('binance', name);
    if (cached) return cached;
    const sumRes = await fetchWithRetry(url + '.CHECKSUM', {}, { fetch, log, sleep, accept404: true, label: name + '.CHECKSUM' });
    if (!sumRes) return null;                                       // not published (yet)
    const expected = parseChecksum(await sumRes.text(), name);
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetchWithRetry(url, {}, { fetch, log, sleep, accept404: true, label: name });
      if (!res) return null;
      const zip = Buffer.from(await res.arrayBuffer());
      const got = createHash('sha256').update(zip).digest('hex');
      if (got === expected) { if (cache) await cache.put('binance', name, zip, expected); return zip; }
      log?.warn?.(`${name}: sha256 mismatch (attempt ${attempt + 1}/3)`);
    }
    throw new Error(`${name}: sha256 does not match its .CHECKSUM after 3 downloads`);
  }
  function toRows(zip, name, sym) {
    const { data } = extractSingleEntry(zip, { nameRe: ENTRY_RE });
    const { rows, parse } = parseKlinesCsv(data, sym.digits);
    return { rows, parse, origin: { files: 1, name, sha256: createHash('sha256').update(zip).digest('hex') } };
  }
  return {
    id: 'binance', label: 'Binance', dataset: 'archive', price: 'trade', network: true,
    dailyIsFinal: false,                                 // dailies are replaced by the monthly zip once published
    supports: (sym) => !!sym.source && sym.source.provider === 'binance',
    isEnabled: (sym) => sym.enabled === true,
    knownOutages: () => KNOWN_OUTAGES,
    async monthAvailable(sym, ym, ctx) {
      if (monthEnd(ym) > dayStart(ctx.today)) return false;          // current month: dailies only
      const name = monthlyUrl(sym, ym).split('/').pop();
      if (cache && await cache.get('binance', name)) return true;
      const r = await fetchWithRetry(monthlyUrl(sym, ym) + '.CHECKSUM', {}, { fetch, log, sleep, accept404: true, label: name + '.CHECKSUM' });
      if (r) await r.body?.cancel?.();
      return !!r;
    },
    async fetchMonth(sym, ym) {
      const url = monthlyUrl(sym, ym), name = url.split('/').pop();
      const zip = await download(url, name);
      if (!zip) return null;
      const r = toRows(zip, name, sym);
      return { rows: r.rows, parse: r.parse, origin: { kind: 'monthly', ...r.origin } };
    },
    async fetchDay(sym, day, ctx) {
      if (day >= ctx.today) return null;
      const url = dailyUrl(sym, day), name = url.split('/').pop();
      const zip = await download(url, name);
      if (!zip) return null;
      const r = toRows(zip, name, sym);
      return { rows: r.rows, parse: r.parse, origin: { kind: 'daily', ...r.origin } };
    }
  };
}

export { monthStart };
