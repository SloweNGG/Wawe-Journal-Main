// ============================================================
// WAWE JOURNAL - BACKTEST SENKRON TEST SUITE 
// Runner: node --test tests/*.test.js
// Kapsam: public/interface/backtest/js/bt-sync.js (WwBtSync): eşleme, ondalık/yuvarlama
// paritesi, idempotency, toplam değişmezi, upsert/silme/bağlama akışları.
// ============================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { FakeDb, trgCalcPnlBranch1 } from './helpers/fake-supabase.js';

const FILES = {
  symbols: "public/interface/backtest/js/bt-symbols.js",     // Stage 3B
  source: "public/interface/shared/trades-source.js",       // Stage 6
  sync: "public/interface/backtest/js/bt-sync.js",          // Stage 5
  time: "public/interface/shared/time-settings.js",
  metrics: "public/interface/shared/trade-metrics.js"
};
const code = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(path.resolve(f), "utf8")]));

function load({ withTrades = true, client } = {}) {
  const store = { ww_time_settings: JSON.stringify({ tz: 'UTC', dayStart: 0 }) };
  const events = [];
  const invalidations = [];
  const win = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    setTimeout, clearTimeout, console,
    dispatchEvent: (e) => { events.push(e); return true; },
    CustomEvent: class { constructor(n, o) { this.type = n; this.detail = o && o.detail; } },
    wwCache: { invalidate: (p) => invalidations.push(p) }
  };
  win.window = win;
  if (client) win.sb = client;
  vm.runInNewContext(code.symbols, win);
  if (withTrades) vm.runInNewContext(code.source, win);
  vm.runInNewContext(code.sync, win);
  vm.runInNewContext(code.time, win);
  vm.runInNewContext(code.metrics, win);
  win.WwBtSync._config.retryDelays = [0, 0, 0];
  win.WwBtSync._config.notifyDebounceMs = 0;
  return { S: win.WwBtSync, M: win.WwMetrics, win, events, invalidations, store };
}
const plainJson = (x) => JSON.parse(JSON.stringify(x));   // cross-realm (vm) objects -> this realm

const U = 'aaaaaaaa-0000-4000-8000-000000000001';
const J1 = 'bbbbbbbb-0000-4000-8000-000000000001';
const J2 = 'bbbbbbbb-0000-4000-8000-000000000002';
const ACC = 'cccccccc-0000-4000-8000-000000000001';
const ACC2 = 'cccccccc-0000-4000-8000-000000000002';

const account = { id: ACC, user_id: U, journal_id: J1, symbol: 'EURUSD' };
const eurTrade = {
  id: 'dddddddd-0000-4000-8000-000000000001', backtest_account_id: ACC, user_id: U, symbol: 'EURUSD',
  direction: 'LONG', lot: '0.37', entry_price: '1.08311', exit_price: '1.08423', stop_loss: '1.08111',
  take_profit: '1.08711', entry_time: '2024-03-05T14:01:00+00:00', exit_time: '2024-03-05T16:27:00+00:00',
  pnl: '38.85', commission: '2.59', gross_pnl: '41.44', rr_ratio: '2.00', exit_reason: 'manual'
};
const EXPECTED_ROW = {
  user_id: U, journal_id: J1, platform_source: 'backtest',
  import_hash: 'backtest:' + ACC + ':dddddddd-0000-4000-8000-000000000001',
  position_id: null, status: 'closed', is_quick_entry: false,
  symbol: 'EURUSD', direction: 'LONG', instrument: 'forex', multiplier: '100000', lot: '0.37',
  entry_price: '1.08311', exit_price: '1.08423', stop_loss: '1.08111', take_profit: '1.08711',
  rr_ratio: '2.00', pnl: '38.85', gross_pnl: '41.44', commission: '2.59', swap: '0.00',
  trade_date: '2024-03-05T14:01:00.000Z', exit_date: '2024-03-05T16:27:00.000Z'
};

// ---- exact engine-like money (D4) used to build fixtures for the sum invariant ----
function dec(x) { const m = /^(-)?(\d+)(?:\.(\d*))?$/.exec(String(x)); const f = m[3] || ''; const n = BigInt(m[2] + f); return { n: m[1] ? -n : n, s: f.length }; }
function rdiv(num, den) { const neg = num < 0n; const a = (neg ? -num : num) * 100n; let q = a / den; if ((a % den) * 2n >= den) q += 1n; return neg ? -q : q; }
function cents(c) { const a = c < 0n ? -c : c; return (c < 0n && a !== 0n ? '-' : '') + (a / 100n) + '.' + String(a % 100n).padStart(2, '0'); }
function money({ dir, entry, exit, lot, contract, cpl, toUsd }) {
  const e = dec(entry), x = dec(exit), l = dec(lot), c = dec(cpl);
  const s = Math.max(e.s, x.s), E = e.n * 10n ** BigInt(s - e.s), X = x.n * 10n ** BigInt(s - x.s);
  let num = BigInt(dir) * (X - E) * l.n * BigInt(contract), den = 10n ** BigInt(s + l.s);
  if (toUsd === 'base') { num *= 10n ** BigInt(x.s); den *= x.n; }    // divide by exit price (USDJPY)
  const g = rdiv(num, den), cm = rdiv(l.n * c.n, 10n ** BigInt(l.s + c.s));
  return { gross: g, commission: cm, net: g - cm };
}

describe('WwBtSync.mapTrade — alan eşlemesi', () => {
  const { S } = load();

  it('EURUSD LONG: tüm alanlar ondalık metin, trade_date = giriş, exit_date = çıkış (R16)', () => {
    assert.deepEqual(plainJson(S.mapTrade(account, eurTrade)), EXPECTED_ROW);
  });

  it('anahtar kümesi sabit: notes / strategy_id / id / created_at ASLA gönderilmez', () => {
    assert.deepEqual(Object.keys(S.mapTrade(account, eurTrade)), Object.keys(EXPECTED_ROW));
  });

  it('gross_pnl kolonu yoksa gross = pnl + commission türetilir', () => {
    const t = { ...eurTrade }; delete t.gross_pnl;
    assert.equal(S.mapTrade(account, t).gross_pnl, '41.44');
  });

  it('PostgREST sayı döndürse de (JSON number) çıktı bayt bayt aynı', () => {
    const wire = { ...eurTrade, lot: 0.37, entry_price: 1.08311, exit_price: 1.08423, stop_loss: 1.08111, take_profit: 1.08711, pnl: 38.85, commission: 2.59, gross_pnl: 41.44 };
    assert.equal(JSON.stringify(S.mapTrade(account, wire)), JSON.stringify(S.mapTrade(account, eurTrade)));
    assert.equal(JSON.stringify(S.mapTrade(account, JSON.parse(JSON.stringify(eurTrade)))), JSON.stringify(EXPECTED_ROW));
  });

  it('para alanları tam 2 ondalık, fiyat/lot üssüz ondalık metin', () => {
    const r = S.mapTrade(account, eurTrade);
    for (const k of ['pnl', 'gross_pnl', 'commission', 'swap', 'rr_ratio']) assert.match(r[k], /^-?\d+\.\d{2}$/, k);
    for (const k of ['lot', 'entry_price', 'exit_price', 'stop_loss', 'take_profit', 'multiplier']) assert.match(r[k], /^\d+(\.\d+)?$/, k);
  });

  it('sembol sınıfı ve kontrat büyüklüğü config\'ten gelir (XAUUSD gold/100, BTCUSDT crypto/1, USDJPY forex/100000)', () => {
    const gold = S.mapTrade({ ...account, symbol: 'XAUUSD' }, { ...eurTrade, symbol: 'XAUUSD', entry_price: '2000.00', exit_price: '2000.05', stop_loss: null, take_profit: null, lot: '0.01', gross_pnl: '0.05', commission: '0.01', pnl: '0.04' });
    assert.equal(gold.instrument, 'gold'); assert.equal(gold.multiplier, '100'); assert.equal(gold.rr_ratio, null);
    const btc = S.mapTrade({ ...account, symbol: 'BTCUSDT' }, { ...eurTrade, symbol: 'BTCUSDT', entry_price: '64000.10', exit_price: '64100.10', stop_loss: null, take_profit: null, lot: '0.1', gross_pnl: '10.00', commission: '0.00', pnl: '10.00' });
    assert.equal(btc.instrument, 'crypto'); assert.equal(btc.multiplier, '1'); assert.equal(btc.lot, '0.1');
    const m = money({ dir: -1, entry: '151.234', exit: '150.987', lot: '1', contract: 100000, cpl: '7', toUsd: 'base' });
    const jpy = S.mapTrade({ ...account, symbol: 'USDJPY' }, { ...eurTrade, symbol: 'USDJPY', direction: 'SHORT', entry_price: '151.234', exit_price: '150.987', stop_loss: null, take_profit: null, lot: '1', gross_pnl: cents(m.gross), commission: cents(m.commission), pnl: cents(m.net) });
    assert.deepEqual([jpy.gross_pnl, jpy.commission, jpy.pnl, jpy.instrument], ['163.59', '7.00', '156.59', 'forex']);
  });

  it('geçersiz girdiler açık kodlarla reddedilir', () => {
    const cases = [
      [account, { ...eurTrade, exit_time: null, exit_price: null, pnl: null }, 'TRADE_NOT_CLOSED'],
      [{ ...account, journal_id: null }, eurTrade, 'ACCOUNT_NOT_LINKED'],
      [account, { ...eurTrade, backtest_account_id: ACC2 }, 'TRADE_ACCOUNT_MISMATCH'],
      [account, { ...eurTrade, symbol: 'GBPUSD' }, 'SYMBOL_MISMATCH'],
      [{ ...account, symbol: 'NOPE' }, { ...eurTrade, symbol: 'NOPE' }, 'UNKNOWN_SYMBOL'],
      [account, { ...eurTrade, direction: 'BUY' }, 'DIRECTION_INVALID'],
      [account, { ...eurTrade, pnl: '38.86' }, 'MONEY_IDENTITY'],
      [account, { ...eurTrade, pnl: '38.851' }, 'MONEY_SCALE'],
      [account, { ...eurTrade, commission: '-2.59', gross_pnl: '36.26' }, 'COMMISSION_NEGATIVE'],
      [account, { ...eurTrade, exit_price: 1.0842399999999999 }, 'PRICE_SCALE'],
      [account, { ...eurTrade, lot: '0.375' }, 'LOT_INVALID'],
      [account, { ...eurTrade, lot: '0' }, 'LOT_INVALID'],
      [account, { ...eurTrade, exit_time: '2024-03-05T13:00:00Z' }, 'TIME_ORDER'],
      [account, { ...eurTrade, entry_time: 'not a date' }, 'TIME_INVALID']
    ];
    for (const [a, t, codeExp] of cases) {
      assert.throws(() => S.mapTrade(a, t), (e) => e.code === codeExp, codeExp);
    }
  });
});

describe('import_hash yardımcıları', () => {
  const { S } = load();
  it('importHash / hashPrefix / parseHash gidiş-dönüş; ctrader ve bozuk anahtarlar reddedilir', () => {
    const h = S.importHash(ACC, 'dddddddd-0000-4000-8000-000000000009');
    assert.equal(h, 'backtest:' + ACC + ':dddddddd-0000-4000-8000-000000000009');
    assert.ok(h.startsWith(S.hashPrefix(ACC)));
    assert.deepEqual(plainJson(S.parseHash(h)), { accountId: ACC, tradeId: 'dddddddd-0000-4000-8000-000000000009' });
    for (const bad of ['ctrader:123:456', 'backtest:', 'backtest:not-a-uuid:1', 'backtest:' + ACC + ':', 'backtest:' + ACC + ':1:2', null]) {
      assert.equal(S.parseHash(bad), null, String(bad));
    }
  });
});

describe('Yuvarlama paritesi (Postgres ROUND(numeric, 2), eşitlikte sıfırdan uzağa)', () => {
  const { S } = load();
  const vectors = [[1.005, '1.01'], [-1.005, '-1.01'], [2.675, '2.68'], [1.045, '1.05'], [0.125, '0.13'], [-0.125, '-0.13'],
    [-0.005, '-0.01'], [-0.0049, '0.00'], [-1.255, '-1.26'], [41.44000000000037, '41.44'], [1e-7, '0.00'], [12345678.995, '12345679.00'], ['-0.05', '-0.05'], [0, '0.00']];
  it('round2 Postgres ile aynı (negatif sıfır yok)', () => {
    for (const [x, out] of vectors) assert.equal(S._dec.round2(x), out, String(x));
  });
  it('toFixed ve Math.round neden yasak: Postgres\'ten farklı sonuçlar (belgeleme testi)', () => {
    assert.deepEqual([1.005, -1.005, 2.675, 1.045, -1.255, 12345678.995].map((x) => x.toFixed(2)), ['1.00', '-1.00', '2.67', '1.04', '-1.25', '12345678.99']);
    assert.equal((-0.0049).toFixed(2), '-0.00');
    assert.deepEqual([1.005, -1.005, -0.125, -1.255].map((x) => Math.round(x * 100) / 100), [1, -1, -0.12, -1.25]);
    assert.ok(Object.is(Math.round(-0.005 * 100) / 100, -0));
  });
  it('rr_ratio tetikleyici formülüyle aynı; eşitlik durumu 1.005 -> 1.01 (XAUUSD 2 basamak)', () => {
    assert.equal(S._dec.rrRatio('1.08311', '1.08111', '1.08711'), '2.00');
    assert.equal(S._dec.rrRatio('2000.00', '1998.00', '2002.01'), '1.01');
    assert.equal(S._dec.rrRatio('1.1', '1.1', '1.2'), null);
    assert.equal(S._dec.rrRatio('1.1', null, '1.2'), null);
  });
  it('trg_calc_pnl (dal 1) eşlenen satırda pnl\'e dokunmaz ve rr_ratio\'yu aynı değere yazar (no-op)', () => {
    const rows = [
      S.mapTrade(account, eurTrade),
      S.mapTrade({ ...account, symbol: 'XAUUSD' }, { ...eurTrade, symbol: 'XAUUSD', entry_price: '2000.00', exit_price: '2002.01', stop_loss: '1998.00', take_profit: '2002.01', lot: '0.01', gross_pnl: '2.01', commission: '0.01', pnl: '2.00' }),
      S.mapTrade(account, { ...eurTrade, stop_loss: '1.08311', take_profit: '1.08711' }),
      S.mapTrade(account, { ...eurTrade, take_profit: null })
    ];
    for (const r of rows) {
      const after = trgCalcPnlBranch1(plainJson(r));
      assert.equal(after.pnl, r.pnl);
      assert.equal(after.rr_ratio, r.rr_ratio);
    }
    assert.equal(rows[1].rr_ratio, '1.01');
    assert.equal(rows[2].rr_ratio, null);
    assert.equal(rows[3].rr_ratio, null);
  });
});

describe('planReconcile — saf plan', () => {
  const { S } = load();
  const t2 = { ...eurTrade, id: 'dddddddd-0000-4000-8000-000000000002', entry_time: '2024-03-04T10:00:00Z', exit_time: '2024-03-04T11:00:00Z' };
  const wire = (row, extra) => ({ id: 'row-' + row.import_hash.slice(-2), journal_id: row.journal_id, ...plainJson(row),
    lot: Number(row.lot), entry_price: Number(row.entry_price), exit_price: Number(row.exit_price), stop_loss: row.stop_loss == null ? null : Number(row.stop_loss),
    take_profit: row.take_profit == null ? null : Number(row.take_profit), pnl: Number(row.pnl), gross_pnl: Number(row.gross_pnl), commission: Number(row.commission),
    swap: 0, rr_ratio: row.rr_ratio == null ? null : Number(row.rr_ratio), multiplier: Number(row.multiplier), trade_date: '2024-03-05T14:01:00+00:00', ...extra });

  it('ilk çalıştırma: hepsi eklenir, trade_date sırasına göre', () => {
    const p = S.planReconcile(account, [eurTrade, t2], []);
    assert.deepEqual(plainJson(p.insert.map((r) => r.import_hash.slice(-1))), ['2', '1']);
    assert.equal(p.remove.length + p.repair.length, 0);
  });
  it('ikinci çalıştırma (PostgREST sayılarıyla dönen satırlar): değişiklik yok', () => {
    const r1 = S.mapTrade(account, eurTrade);
    const p = S.planReconcile(account, [eurTrade], [wire(r1)]);
    assert.deepEqual([p.insert.length, p.remove.length, p.repair.length, p.kept], [0, 0, 0, 1]);
  });
  it('yetim (işlemi olmayan), yanlış defterdeki ve sapmış satırlar', () => {
    const r1 = S.mapTrade(account, eurTrade);
    const orphan = { ...wire(r1), id: 'orphan', import_hash: S.importHash(ACC, 'gone') };
    const wrongJ = { ...wire(r1), id: 'wrongJ', journal_id: J2 };
    const drift = { ...wire(r1), id: 'drift', pnl: 99.99, notes: 'kullanıcı notu' };
    const p = S.planReconcile(account, [eurTrade], [orphan, wrongJ, drift]);
    assert.deepEqual(plainJson(p.remove.slice().sort()), ['orphan', 'wrongJ']);
    assert.equal(p.repair.length, 1);
    assert.equal(p.repair[0].id, 'drift');
    assert.equal(p.repair[0].patch.pnl, '38.85');
    assert.ok(!('notes' in p.repair[0].patch) && !('strategy_id' in p.repair[0].patch) && !('journal_id' in p.repair[0].patch));
  });
  it('bağlı olmayan hesap: önekli tüm satırlar silinir, ekleme yok', () => {
    const r1 = S.mapTrade(account, eurTrade);
    const p = S.planReconcile({ ...account, journal_id: null }, [eurTrade], [wire(r1)]);
    assert.deepEqual([p.insert.length, p.remove.length], [0, 1]);
  });
  it('başka hesabın satırlarına dokunmaz', () => {
    const other = S.mapTrade({ ...account, id: ACC2 }, { ...eurTrade, backtest_account_id: ACC2 });
    const p = S.planReconcile(account, [], [wire(other, { id: 'other' })]);
    assert.deepEqual([p.insert.length, p.remove.length, p.repair.length], [0, 0, 0]);
  });
  it('eşlenemeyen işlem diğerlerini durdurmaz, hata raporlanır, mevcut aynası silinmez', () => {
    const bad = { ...t2, pnl: '1.234' };
    const existingBad = { id: 'keep-bad', journal_id: J1, import_hash: S.importHash(ACC, bad.id) };
    const p = S.planReconcile(account, [eurTrade, bad], [existingBad]);
    assert.equal(p.insert.length, 1);
    assert.deepEqual(plainJson(p.errors), [{ tradeId: bad.id, code: 'MONEY_SCALE' }]);
    assert.equal(p.remove.length, 0);
  });
});

// ---------- fixtures for DB-level tests ----------
function makeDb() {
  const db = new FakeDb({ userId: U, journals: [{ id: J1, user_id: U, is_default: true }, { id: J2, user_id: U, is_default: false }] });
  db.tables.backtest_accounts.push({ id: ACC, user_id: U, journal_id: null, symbol: 'EURUSD', starting_balance: '10000.00' });
  return db;
}
function seedTrades(db, n, accountId = ACC) {
  const out = [];
  let price = 108000;   // points (5 digits)
  for (let i = 0; i < n; i++) {
    const dir = i % 3 === 0 ? -1 : 1;
    const entryPts = price + (i % 7) * 13;
    const exitPts = entryPts + ((i * 37) % 91) - 45;
    const lot = ['0.01', '0.10', '0.37', '1.00', '2.55'][i % 5];
    const fmt = (p) => (p / 100000).toFixed(5);   // fixture formatting of integer points only (not money)
    const m = money({ dir, entry: fmt(entryPts), exit: fmt(exitPts), lot, contract: 100000, cpl: '7', toUsd: 'quote' });
    const t0 = Date.UTC(2024, 0, 2, 8, 0) + i * 3600000;
    const row = {
      id: 'eeeeeeee-0000-4000-8000-' + String(i + 1).padStart(12, '0'), backtest_account_id: accountId, user_id: U, symbol: 'EURUSD',
      direction: dir > 0 ? 'LONG' : 'SHORT', lot, entry_price: fmt(entryPts), exit_price: fmt(exitPts),
      stop_loss: i % 4 === 0 ? null : fmt(entryPts - dir * 200), take_profit: i % 4 === 0 ? null : fmt(entryPts + dir * 300),
      entry_time: new Date(t0).toISOString(), exit_time: new Date(t0 + 1800000).toISOString(),
      gross_pnl: cents(m.gross), commission: cents(m.commission), pnl: cents(m.net), exit_reason: 'manual'
    };
    out.push(row);
    db.tables.backtest_account_trades.push(row);
    price += 11;
  }
  return out;
}
function centsOf(v) { const d = dec(typeof v === 'number' ? String(v) : v); return d.s <= 2 ? d.n * 10n ** BigInt(2 - d.s) : (() => { throw new Error('scale'); })(); }

describe('Toplam değişmezi ve okuyucu paritesi', () => {
  it('Σ trades.pnl (hesap öneki) = Σ net (backtest) = bakiye − başlangıç; WwMetrics aynı toplamı görür', async () => {
    const db = makeDb();
    const { S, M } = load({ client: db.client });
    const trades = seedTrades(db, 120);
    const linked = { id: ACC, user_id: U, journal_id: J1, symbol: 'EURUSD' };
    db.tables.backtest_accounts[0].journal_id = J1;
    const res = await S.reconcileAccount(linked);
    assert.equal(res.ok, true);
    assert.equal(res.inserted, 120);
    const mirrors = db.tables.trades.filter((r) => r.journal_id === J1 && r.import_hash.startsWith(S.hashPrefix(ACC)));
    const btSum = trades.reduce((s, t) => s + centsOf(t.pnl), 0n);
    const trSum = mirrors.reduce((s, t) => s + centsOf(t.pnl), 0n);
    const balance = centsOf('10000.00') + btSum;
    assert.equal(trSum, btSum);
    assert.equal(balance - centsOf('10000.00'), trSum);
    // reader parity: what the trades page (scope backtest) would compute
    const wireRows = (await db.client.from('trades').select('id,exit_price,pnl,trade_date,rr_ratio,platform_source').eq('user_id', U).eq('journal_id', J1)).data;
    const s = M.summarize(wireRows);
    assert.equal(s.total, 120);
    assert.equal(BigInt(Math.round(s.totalPnL * 100)), trSum);
    assert.ok(wireRows.every((r) => M.isClosed(r)));
    const curve = M.equityCurve(wireRows);
    assert.equal(BigInt(Math.round(curve[curve.length - 1].equity * 100)), trSum);
  });
});

describe('G/Ç akışları (sahte Supabase + Migration 04 öykünmesi)', () => {
  const linked = () => ({ id: ACC, user_id: U, journal_id: J1, symbol: 'EURUSD' });

  it('syncClosedTrade: upsert seçenekleri cTrader deseniyle aynı; önbellek + trade-saved; ikinci çağrı no-op', async () => {
    const db = makeDb(); db.tables.backtest_accounts[0].journal_id = J1;
    const { S, events, invalidations } = load({ client: db.client });
    const r1 = await S.syncClosedTrade(linked(), eurTrade);
    assert.deepEqual([r1.ok, r1.inserted], [true, 1]);
    const up = db.client.calls.find((c) => c.op === 'upsert');
    assert.deepEqual(plainJson(up.options), { onConflict: 'user_id,journal_id,import_hash', ignoreDuplicates: true });
    assert.equal(up.columns, 'id');
    assert.deepEqual(invalidations, ['trades']);
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual(events.map((e) => e.type), ['trade-saved']);
    const r2 = await S.syncClosedTrade(linked(), eurTrade);
    assert.deepEqual([r2.ok, r2.inserted], [true, 0]);
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(events.length, 1, 'no event when nothing changed');
    assert.equal(db.tables.trades.length, 1);
    assert.equal(db.tables.trades[0].rr_ratio, '2.00');
  });

  it('bağlı değilse hiçbir istek atılmaz; WwTrades yoksa yazmaz (Stage 6 olmadan Stage 5 çalışmaz)', async () => {
    const db = makeDb();
    const a = load({ client: db.client });
    const r = await a.S.syncClosedTrade({ ...linked(), journal_id: null }, eurTrade);
    assert.equal(r.skipped, 'NOT_LINKED');
    const b = load({ client: db.client, withTrades: false });
    const r2 = await b.S.syncClosedTrade(linked(), eurTrade);
    assert.equal(r2.code, 'STATS_FILTER_MISSING');
    assert.deepEqual(plainJson(b.S.dirtyAccounts()), [ACC]);
    assert.equal(db.client.calls.length, 0);
  });

  it('parçalama: 450 işlem -> upsert 200/200/50; 250 yetim -> silme 100/100/50', async () => {
    const db = makeDb(); db.tables.backtest_accounts[0].journal_id = J1;
    const { S } = load({ client: db.client });
    seedTrades(db, 450);
    await S.reconcileAccount(linked());
    assert.deepEqual(db.client.calls.filter((c) => c.op === 'upsert').map((c) => c.payload.length), [200, 200, 50]);
    db.tables.backtest_account_trades.splice(0, 250);           // e.g. an account reset in Stage 4
    db.client.calls.length = 0;
    const r = await S.reconcileAccount(linked());
    assert.equal(r.removed, 250);
    assert.deepEqual(db.client.calls.filter((c) => c.op === 'delete').map((c) => c.filters.find((f) => f[0] === 'in')[2].length), [100, 100, 50]);
    assert.ok(db.client.calls.filter((c) => c.op === 'delete').every((c) => c.filters.some((f) => f[0] === 'eq' && f[1] === 'platform_source' && f[2] === 'backtest')));
    assert.equal(db.tables.trades.length, 200);
  });

  it('geçici hata tekrar denenir; kalıcı hata denenmez ve hesap "kirli" işaretlenir', async () => {
    const db = makeDb(); db.tables.backtest_accounts[0].journal_id = J1;
    const { S } = load({ client: db.client });
    db.failNext.push({ table: 'trades', op: 'upsert', error: { message: 'TypeError: Failed to fetch' }, status: 0 });
    const r1 = await S.syncClosedTrade(linked(), eurTrade);
    assert.deepEqual([r1.ok, r1.inserted], [true, 1]);
    assert.equal(db.client.calls.filter((c) => c.op === 'upsert').length, 2);
    db.failNext.push({ table: 'trades', op: 'upsert', error: { code: '23514', message: 'check constraint' }, status: 400 });
    const r2 = await S.syncClosedTrade(linked(), { ...eurTrade, id: 'dddddddd-0000-4000-8000-0000000000ff' });
    assert.deepEqual([r2.ok, r2.code], [false, 'PERMANENT']);
    assert.equal(db.client.calls.filter((c) => c.op === 'upsert').length, 3);
    assert.deepEqual(plainJson(S.dirtyAccounts()), [ACC]);
    const r3 = await S.reconcileAccount(linked());
    assert.equal(r3.ok, true);
    assert.deepEqual(plainJson(S.dirtyAccounts()), []);
  });

  it('bayat hesap: defter başka sekmede silinmiş/ayrılmış -> hesap tazelenir, yazım yapılmaz', async () => {
    const db = makeDb();
    db.tables.backtest_accounts[0].journal_id = null;         // DB: already unlinked (e.g. delete_journal detached it)
    db.journals = db.journals.filter((j) => j.id !== J2);     // the stale journal no longer exists
    const { S } = load({ client: db.client });
    const r = await S.syncClosedTrade({ ...linked(), journal_id: J2 }, eurTrade);
    assert.equal(r.ok, true);
    assert.equal(r.account.journal_id, null);
    assert.equal(db.tables.trades.length, 0);
  });

  it('bağla -> taşı -> kaldır -> sil (R17/R18): satırlar atomik temizlenir, yeni deftere geri doldurulur', async () => {
    const db = makeDb();
    const { S } = load({ client: db.client });
    seedTrades(db, 30);
    let acc = { id: ACC, user_id: U, journal_id: null, symbol: 'EURUSD' };
    let r = await S.linkAccount(acc, J1);                       // R17: past closed trades are transferred
    assert.deepEqual([r.ok, r.inserted, r.account.journal_id], [true, 30, J1]);
    db.tables.trades[0].notes = 'not';                          // user note on a mirror (lost on relink, documented)
    acc = r.account;
    r = await S.linkAccount(acc, J2);                           // relink: M04 trigger deletes J1 rows
    assert.deepEqual([r.ok, r.inserted], [true, 30]);
    assert.equal(db.tables.trades.filter((t) => t.journal_id === J1).length, 0);
    assert.equal(db.tables.trades.filter((t) => t.journal_id === J2).length, 30);
    acc = r.account;
    r = await S.unlinkAccount(acc);                             // R18 unlink
    assert.deepEqual([r.ok, r.account.journal_id, db.tables.trades.length], [true, null, 0]);
    acc = r.account;
    r = await S.linkAccount(acc, J1);
    acc = r.account;
    r = await S.deleteAccount(acc);                             // R18 delete
    assert.equal(r.ok, true);
    assert.deepEqual([db.tables.trades.length, db.tables.backtest_account_trades.length, db.tables.backtest_accounts.length], [0, 0, 0]);
  });

  it('aynı sekmede sıra: kapanış upsert\'i ile bağlantı kaldırma yarışmaz (ayna kalmaz)', async () => {
    const db = makeDb(); db.tables.backtest_accounts[0].journal_id = J1;
    const { S } = load({ client: db.client });
    db.tables.backtest_account_trades.push(eurTrade);
    const p1 = S.syncClosedTrade(linked(), eurTrade);
    const p2 = S.unlinkAccount(linked());
    await Promise.all([p1, p2]);
    assert.equal(db.tables.trades.length, 0);
  });

  it('sweepOrphans: hesabı silinmiş / bağlantısı uymayan backtest satırlarını siler, canlı satırlara dokunmaz', async () => {
    const db = makeDb(); db.tables.backtest_accounts[0].journal_id = J1;
    const { S } = load({ client: db.client });
    seedTrades(db, 5);
    await S.reconcileAccount(linked());
    db.tables.trades.push({ id: 'ghost', user_id: U, journal_id: J1, platform_source: 'backtest', import_hash: S.importHash(ACC2, 'x'), pnl: '1.00' });
    db.tables.trades.push({ id: 'stale', user_id: U, journal_id: J2, platform_source: 'backtest', import_hash: S.importHash(ACC, 'y'), pnl: '1.00' });
    db.tables.trades.push({ id: 'live', user_id: U, journal_id: J1, platform_source: null, import_hash: null, pnl: '5.00' });
    const r = await S.sweepOrphans(U);
    assert.deepEqual([r.ok, r.removed], [true, 2]);
    assert.ok(db.tables.trades.some((t) => t.id === 'live'));
    assert.equal(db.tables.trades.length, 6);
  });

  it('cancelPending: uzun tekrar denemesini keser, kuyruğu kilitlemez', async () => {
    const db = makeDb(); db.tables.backtest_accounts[0].journal_id = J1;
    const { S } = load({ client: db.client });
    S._config.retryDelays = [60000];
    db.failNext.push({ table: 'trades', op: 'upsert', error: { message: 'Failed to fetch' }, status: 0 });
    const p = S.syncClosedTrade(linked(), eurTrade);
    await new Promise((r) => setTimeout(r, 5));
    S.cancelPending();
    const r = await p;
    assert.equal(r.ok, false);
    assert.equal(r.code, 'CANCELLED');
    S._config.retryDelays = [0];
    const r2 = await S.syncClosedTrade(linked(), eurTrade);
    assert.equal(r2.ok, true);
  });

  it('countMirrors: yalnızca bu hesabın önekli satırları sayılır (HEAD)', async () => {
    const db = makeDb(); db.tables.backtest_accounts[0].journal_id = J1;
    const { S } = load({ client: db.client });
    seedTrades(db, 7);
    await S.reconcileAccount(linked());
    const c = await S.countMirrors(linked());
    assert.equal(c.count, 7);
    const head = db.client.calls[db.client.calls.length - 1];
    assert.equal(head.head, true);
  });
});

// ---- D13: the journal row carries the levels at open (initial_*), not the edited ones
describe('mapTrade: initial levels (D13)', () => {
  it('uses initial_stop_loss / initial_take_profit when the columns exist, rr_ratio follows them', () => {
    const { S } = load();
    const edited = { ...eurTrade, stop_loss: '1.08250', take_profit: null, initial_stop_loss: '1.08111', initial_take_profit: '1.08711' };
    const row = S.mapTrade(account, edited);
    assert.equal(row.stop_loss, '1.08111'); assert.equal(row.take_profit, '1.08711'); assert.equal(row.rr_ratio, '2.00');
  });
  it('a position opened without SL/TP stays without them even if levels were set later', () => {
    const { S } = load();
    const row = S.mapTrade(account, { ...eurTrade, stop_loss: '1.08250', take_profit: '1.08900', initial_stop_loss: null, initial_take_profit: null, rr_ratio: null });
    assert.equal(row.stop_loss, null); assert.equal(row.take_profit, null); assert.equal(row.rr_ratio, null);
  });
  it('falls back to the current levels when the columns are absent', () => {
    const { S } = load();
    assert.deepEqual(plainJson(S.mapTrade(account, eurTrade)), EXPECTED_ROW);
  });
});
