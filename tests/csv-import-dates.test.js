// CSV import (Quick Add): format detection and trade dates. Every sample in tests/fixtures/csv-import is parsed the way
// Quick Add does (parseCsvByBroker → ParserV2) and each imported trade_date must be the file's own date and time, read in
// the import time zone setting. A row whose date is missing or unreadable is never given today's date: it is an error
// row (shown in the preview) and is not imported.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const DIR = 'tests/fixtures/csv-import/';
const SCRIPTS = ['public/interface/shared/time-settings.js', 'public/interface/quick-add/js/broker-dictionary.js', 'public/interface/quick-add/js/broker-detector.js',
  'public/interface/quick-add/js/fill-pairing.js', 'public/interface/quick-add/js/parser-v2.js', 'public/src/features/csv-parsers.js'];

function load(importTz) {
  const store = {};
  const ctx = { console, Intl, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    dispatchEvent: () => true, CustomEvent: class { constructor(n, o) { this.type = n; this.detail = o && o.detail; } } };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of SCRIPTS) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
  ctx.WwTime.setSettings({ tz: importTz, importTz: 'same' });
  return ctx;
}

// the date as written in the file → { day: 'YYYY-MM-DD', time: 'HH:MM:SS' | null }
function fileDate(raw) {
  let m = raw.match(/^(\d{4})[-.](\d{2})[-.](\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return { day: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] ? `${m[4]}:${m[5]}:${m[6] || '00'}` : null };
  m = raw.match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return { day: `${m[3]}-${m[2]}-${m[1]}`, time: `${m[4]}:${m[5]}:${m[6] || '00'}` };
  throw new Error('unknown fixture date format: ' + raw);
}
// the imported trade_date, read back as wall time in the import time zone
function importedDate(iso, tz) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { day: iso, time: null };
  const d = new Date(iso);
  assert.ok(!isNaN(d), 'trade_date is not a date: ' + iso);
  if (/T00:00:00\.000Z$/.test(iso)) return { day: iso.slice(0, 10), time: null };   // date-only rows (calendar day, UTC midnight)
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:${p.second}` };
}
// parsed in the vm context: copied out so arrays / objects compare with this realm's prototypes
const parse = (ctx, file) => JSON.parse(JSON.stringify(ctx.parseCsvByBroker(fs.readFileSync(DIR + file, 'utf8'), 'auto')));
function csvCells(line) { return line.split(line.includes(';') ? ';' : ','); }

// name → expected detection, the column holding the trade (close) date, symbol and P&L columns
const SAMPLES = {
  'tr-broker-comma.csv': { detected: 'tr-legacy', date: 6, symbol: 0, pnl: 5 },
  'tr-broker-dot.csv': { detected: 'tr-legacy', date: 6, symbol: 0, pnl: 5 },
  'tr-generic.csv': { date: 0, symbol: 1, pnl: 6 },
  'generic-1-date-only.csv': { detected: 'generic', date: 0, symbol: 1, pnl: 6 },
  'generic-2-side-volume.csv': { detected: 'generic', date: 0, symbol: 1, pnl: 6 },
  'generic-3-direction-lot.csv': { detected: 'generic', date: 0, symbol: 1, pnl: 6 },
  'generic-4-snake-case.csv': { detected: 'generic', date: 0, symbol: 1, pnl: 6 },
  'generic-5-type-size.csv': { date: 0, symbol: 1, pnl: 6 },
  'mt5-positions.csv': { detected: 'mt5', date: 8, symbol: 2, pnl: 12 },
  'mt5-open-close.csv': { date: 8, symbol: 2, pnl: 12 },   // Open Time / Close Time layout: read with the XTB map, same columns
};
const num = (s) => Number(String(s).replace(',', '.'));

describe('csv-import dates', () => {
  for (const tz of ['Europe/Istanbul', 'America/New_York']) {
    for (const [file, exp] of Object.entries(SAMPLES)) {
      it(`${file} (${tz}): every trade keeps the file's date and time`, () => {
        const ctx = load(tz);
        const text = fs.readFileSync(DIR + file, 'utf8');
        const lines = text.trim().split('\n').slice(1).map(csvCells);
        const r = parse(ctx, file);
        if (exp.detected) assert.equal(r.detected, exp.detected);
        if (!file.startsWith('mt5')) assert.notEqual(r.detected, 'mt5', 'a non-MT5 file must not be read with the MT5 column map');
        assert.deepEqual(r.errors, []);
        assert.equal(r.rows.length, lines.length);
        r.rows.forEach((row, i) => {
          assert.equal(row.symbol, lines[i][exp.symbol]);
          assert.equal(row.pnl, num(lines[i][exp.pnl]));
          assert.deepEqual(importedDate(row.trade_date, tz), fileDate(lines[i][exp.date]), `${file} row ${i + 2}: ${row.trade_date}`);
        });
      });
    }
  }

  it('MT5 files are still detected as MT5 (positions report with repeated Time / Price)', () => {
    const ctx = load('Europe/Istanbul');
    assert.equal(parse(ctx, 'mt5-positions.csv').detected, 'mt5');
  });

  it('rows with a missing or unreadable date are error rows, never today, and are not imported', () => {
    const ctx = load('Europe/Istanbul');
    const r = parse(ctx, 'bad-dates.csv');
    assert.deepEqual(r.rows.map((x) => x.symbol), ['EURUSD', 'BTCUSD']);
    assert.deepEqual(r.rows.map((x) => importedDate(x.trade_date, 'Europe/Istanbul')), [fileDate('2026-01-15 10:00'), fileDate('2026-01-17 12:00')]);
    assert.deepEqual(r.errors, ['Satır 3: tarih bulunamadı, atlandı.', 'Satır 4: tarih okunamadı ("yarın"), atlandı.']);
    assert.ok(!r.warnings.some((w) => /bugün/.test(w)));
  });

  it('a file without a date column imports nothing and says why', () => {
    const ctx = load('Europe/Istanbul');
    const r = parse(ctx, 'no-date-column.csv');
    assert.equal(r.rows.length, 0);
    assert.equal(r.errors[0], 'Dosyada tarih sütunu bulunamadı; tarihi olmayan satırlar içe aktarılmaz.');
    assert.deepEqual(r.errors.slice(1), ['Satır 2: tarih bulunamadı, atlandı.', 'Satır 3: tarih bulunamadı, atlandı.']);
  });

  it('the wrapper no longer has a "today" fallback for trade_date', () => {
    const src = fs.readFileSync('public/src/features/csv-parsers.js', 'utf8');
    assert.ok(!/todayKey|bugünün tarihiyle/.test(src));
  });
});
