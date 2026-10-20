// Month file v1: one gzip-compressed JSON document per dataset/symbol/UTC month.
//   {"v":1,"symbol":"BTCUSDT","month":"2026-09","tf":"1m","digits":2,"source":"binance","price":"trade",
//    "count":43200,"first":1788220800,"last":1790812740,"rows":[[1788220800,57012.5,57020,57001.1,57010],...]}
// t = bar OPEN time in UTC epoch seconds; prices rounded to the symbol digits; gaps = no row (never filled).
// The JSON text is deterministic (fixed key order, no timestamps), so sha256(JSON text) identifies the
// content. Never hash the .gz bytes: the gzip header OS byte differs between Windows and Linux.
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { pointsToNumber, numberToPoints, hasAtMostDigits } from './prices.mjs';
import { monthStart, monthEnd, isYm } from './time.mjs';

export const FORMAT_VERSION = 1;

export class MonthFileError extends Error {
  constructor(message) { super(message); this.name = 'MonthFileError'; }
}

export function sha256Hex(bufOrString) { return createHash('sha256').update(bufOrString).digest('hex'); }

/**
 * @param {{symbol:string, month:string, digits:number, source:string, price:string, rows:number[][]}} m
 *        rows: [t, o, h, l, c] in integer points, sorted, unique, validated
 */
export function encodeMonth(m) {
  if (!isYm(m.month)) throw new MonthFileError(`bad month ${m.month}`);
  const rows = m.rows.map((r) => [r[0], pointsToNumber(r[1], m.digits), pointsToNumber(r[2], m.digits), pointsToNumber(r[3], m.digits), pointsToNumber(r[4], m.digits)]);
  const doc = {
    v: FORMAT_VERSION, symbol: m.symbol, month: m.month, tf: '1m', digits: m.digits,
    source: m.source, price: m.price,
    count: rows.length, first: rows.length ? rows[0][0] : null, last: rows.length ? rows[rows.length - 1][0] : null,
    rows
  };
  const json = JSON.stringify(doc);
  const sha256 = sha256Hex(Buffer.from(json, 'utf8'));
  const gz = gzipSync(Buffer.from(json, 'utf8'), { level: 9 });
  return { json, sha256, rev: sha256.slice(0, 12), gz, bytes: gz.length, count: doc.count, first: doc.first, last: doc.last };
}

/**
 * Decode and verify a month file. Accepts gzip bytes or (if an intermediary already decoded it) plain JSON.
 * @param {Buffer} buf
 * @param {{symbol?:string, month?:string, digits?:number, sha256?:string}} [expect]
 * @returns {{doc:object, rows:number[][], sha256:string}}  rows in integer points
 */
export function decodeMonth(buf, expect = {}) {
  let raw;
  try { raw = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf, { maxOutputLength: 64 * 1024 * 1024 }) : Buffer.from(buf); }
  catch (e) { throw new MonthFileError(`gunzip failed: ${e.code || e.message}`); }
  const sha256 = sha256Hex(raw);
  if (expect.sha256 && expect.sha256 !== sha256) throw new MonthFileError(`sha256 mismatch: file ${sha256.slice(0, 12)} != manifest ${expect.sha256.slice(0, 12)}`);
  let doc;
  try { doc = JSON.parse(raw.toString('utf8')); } catch (e) { throw new MonthFileError(`invalid JSON: ${e.message}`); }
  if (!doc || typeof doc !== 'object') throw new MonthFileError('not an object');
  if (!Number.isInteger(doc.v) || doc.v < 1) throw new MonthFileError('missing format version');
  if (doc.v > FORMAT_VERSION) throw new MonthFileError(`format v${doc.v} is newer than supported v${FORMAT_VERSION}`);
  if (doc.tf !== '1m') throw new MonthFileError(`tf ${doc.tf} != 1m`);
  for (const k of ['symbol', 'month', 'digits']) {
    if (expect[k] !== undefined && doc[k] !== expect[k]) throw new MonthFileError(`${k} ${doc[k]} != expected ${expect[k]}`);
  }
  if (!isYm(doc.month) || !Number.isInteger(doc.digits) || !Array.isArray(doc.rows)) throw new MonthFileError('bad header');
  if (doc.count !== doc.rows.length) throw new MonthFileError(`count ${doc.count} != rows ${doc.rows.length}`);
  const lo = monthStart(doc.month), hi = monthEnd(doc.month);
  const rows = new Array(doc.rows.length);
  let prev = -Infinity;
  for (let i = 0; i < doc.rows.length; i++) {
    const r = doc.rows[i];
    if (!Array.isArray(r) || r.length !== 5) throw new MonthFileError(`row ${i}: not [t,o,h,l,c]`);
    const t = r[0];
    if (!Number.isInteger(t) || t % 60 !== 0 || t < lo || t >= hi || t <= prev) throw new MonthFileError(`row ${i}: bad or unsorted time ${t}`);
    prev = t;
    const p = [t];
    for (let j = 1; j < 5; j++) {
      if (typeof r[j] !== 'number' || !(r[j] > 0) || !hasAtMostDigits(r[j], doc.digits)) throw new MonthFileError(`row ${i}: bad price ${r[j]}`);
      p.push(numberToPoints(r[j], doc.digits));
    }
    if (p[3] > Math.min(p[1], p[4]) || p[2] < Math.max(p[1], p[4])) throw new MonthFileError(`row ${i}: OHLC inconsistent`);
    rows[i] = p;
  }
  const first = rows.length ? rows[0][0] : null, last = rows.length ? rows[rows.length - 1][0] : null;
  if (doc.first !== first || doc.last !== last) throw new MonthFileError('first/last do not match rows');
  return { doc, rows, sha256 };
}
