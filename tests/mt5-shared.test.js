// ============================================================
// WAWE JOURNAL - MT5 KÖPRÜSÜ ORTAK KOD TEST SUITE
// Runner: node --test tests/*.test.js
// Kapsam: supabase/functions/_shared/mt5.ts (Node, tür soyma ile aynen yüklenir)
//   - sembol normalleştirme (broker son ekleri), enstrüman tahmini
//   - sunucu saati -> UTC (New York kapanışı GMT+2/+3 düzeni, ABD yaz saati sınırları, sabit farklar)
//   - hesap ve pozisyon doğrulama, pozisyon -> trades satırı (komisyon işareti, net PnL, import_hash)
//   - senkron partisi: geçersizler atlanır ama imleç onları da kapsar, tekrar eden pozisyon, 500 sınırı
//   - token / sır biçimleri, SHA-256 (SQL digest ile aynı hex)
// ============================================================
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../supabase/functions/_shared/mt5.ts';

const utc = (s) => Date.parse(s);
const sec = (s) => Math.floor(Date.parse(s) / 1000);

describe('normalizeSymbol', () => {
  it('broker son ekleri atılır', () => {
    assert.equal(M.normalizeSymbol('EURUSD.r'), 'EURUSD');
    assert.equal(M.normalizeSymbol('EURUSD#'), 'EURUSD');
    assert.equal(M.normalizeSymbol('XAUUSD+'), 'XAUUSD');
    assert.equal(M.normalizeSymbol('GBPJPY_i'), 'GBPJPY');
    assert.equal(M.normalizeSymbol('EURUSDm'), 'EURUSD');
    assert.equal(M.normalizeSymbol('XAUUSDc'), 'XAUUSD');
    assert.equal(M.normalizeSymbol('BTCUSD.pro'), 'BTCUSD');
    assert.equal(M.normalizeSymbol('EUR/USD'), 'EURUSD');
  });
  it('endeks ve hisse adları korunur', () => {
    assert.equal(M.normalizeSymbol('Ger40'), 'GER40');
    assert.equal(M.normalizeSymbol('US30Cash'), 'US30CASH');
    assert.equal(M.normalizeSymbol('NAS100'), 'NAS100');
    assert.equal(M.normalizeSymbol('AAPL.US'), 'AAPL');
  });
  it('boş / bozuk girdi', () => {
    assert.equal(M.normalizeSymbol(''), '');
    assert.equal(M.normalizeSymbol(null), '');
    assert.equal(M.normalizeSymbol('<script>'), 'SCRIPT');
  });
});

describe('guessInstrument', () => {
  it('ctrader-sync ile aynı sınıflar', () => {
    assert.equal(M.guessInstrument('EURUSD'), 'forex');
    assert.equal(M.guessInstrument('USDCAD'), 'forex');
    assert.equal(M.guessInstrument('XAUUSD'), 'gold');
    assert.equal(M.guessInstrument('BTCUSD'), 'crypto');
    assert.equal(M.guessInstrument('US30CASH'), 'index');
    assert.equal(M.guessInstrument('GER40'), 'index');
    assert.equal(M.guessInstrument('AAPL'), 'other');
  });
});

describe('sunucu saati -> UTC', () => {
  it('ABD yaz saati sınırları (2026: 8 Mart 07:00 UTC - 1 Kasım 06:00 UTC)', () => {
    assert.equal(M.usDstActive(utc('2026-03-08T06:59:59Z')), false);
    assert.equal(M.usDstActive(utc('2026-03-08T07:00:00Z')), true);
    assert.equal(M.usDstActive(utc('2026-11-01T05:59:59Z')), true);
    assert.equal(M.usDstActive(utc('2026-11-01T06:00:00Z')), false);
    assert.equal(M.usDstActive(utc('2025-03-09T07:00:00Z')), true);
    assert.equal(M.usDstActive(utc('2025-03-09T06:00:00Z')), false);
  });
  it('GMT+2/+3 broker: yazın 3, kışın 2 saat düşülür (EA şu an hangisini gönderirse göndersin)', () => {
    // Temmuz: sunucu 15:00 -> 12:00 UTC
    const summerServer = sec('2026-07-10T15:00:00Z');
    assert.equal(new Date(M.serverToUtcMs(summerServer, 7200)).toISOString(), '2026-07-10T12:00:00.000Z');
    assert.equal(new Date(M.serverToUtcMs(summerServer, 10800)).toISOString(), '2026-07-10T12:00:00.000Z');
    // Ocak: sunucu 15:00 -> 13:00 UTC
    const winterServer = sec('2026-01-10T15:00:00Z');
    assert.equal(new Date(M.serverToUtcMs(winterServer, 10800)).toISOString(), '2026-01-10T13:00:00.000Z');
    assert.equal(new Date(M.serverToUtcMs(winterServer, 7200)).toISOString(), '2026-01-10T13:00:00.000Z');
  });
  it('diğer farklar sabit; saat sapması 15 dk\'ya yuvarlanır', () => {
    const s = sec('2026-07-10T15:00:00Z');
    assert.equal(new Date(M.serverToUtcMs(s, 0)).toISOString(), '2026-07-10T15:00:00.000Z');
    assert.equal(new Date(M.serverToUtcMs(s, 3600)).toISOString(), '2026-07-10T14:00:00.000Z');
    assert.equal(new Date(M.serverToUtcMs(s, -18000)).toISOString(), '2026-07-10T20:00:00.000Z');
    assert.equal(M.roundOffset(7187), 7200);       // bilgisayar saati 13 sn geri
    assert.equal(M.roundOffset(10830), 10800);
    assert.equal(M.roundOffset('abc'), 0);
    assert.equal(M.roundOffset(99 * 3600), 0);
  });
});

describe('parseAccount', () => {
  it('geçerli hesap', () => {
    const r = M.parseAccount({ login: '51234567', server: ' FTMO-Demo ', company: 'FTMO S.R.O.', currency: 'usd', trade_mode: 0, balance: '100000.5', equity: 99950 });
    assert.equal(r.ok, true);
    assert.deepEqual({ ...r.value }, { login: 51234567, server: 'FTMO-Demo', broker: 'FTMO S.R.O.', currency: 'USD', isLive: false, balance: 100000.5, equity: 99950 });
  });
  it('gerçek hesap ve eksik alanlar', () => {
    const r = M.parseAccount({ login: 7, server: 'X', trade_mode: 2 });
    assert.equal(r.value.isLive, true);
    assert.equal(r.value.balance, null);
    assert.equal(r.value.broker, null);
  });
  it('bozuk hesap reddedilir', () => {
    assert.equal(M.parseAccount(null).ok, false);
    assert.equal(M.parseAccount({ login: 0, server: 'x' }).reason, 'account.login');
    assert.equal(M.parseAccount({ login: 1.5, server: 'x' }).reason, 'account.login');
    assert.equal(M.parseAccount({ login: 5, server: '' }).reason, 'account.server');
    assert.equal(M.parseAccount({ login: 5, server: 'x'.repeat(129) }).reason, 'account.server');
  });
});

const NOW = sec('2026-11-09T12:00:00Z') + 7200;
const POS = {
  id: '123456789', symbol: 'EURUSD.r', side: 'buy', volume: 0.5,
  open_ts: sec('2026-11-05T10:00:00Z'), close_ts: sec('2026-11-05T14:30:00Z'),
  open_price: 1.08, close_price: 1.081, sl: 1.075, tp: 0,
  profit: 50, commission: -3.5, swap: -1.25, fee: 0,
};

describe('validatePosition', () => {
  it('geçerli pozisyon; tp=0 -> null', () => {
    const r = M.validatePosition(POS, NOW);
    assert.equal(r.ok, true);
    assert.equal(r.value.symbol, 'EURUSD');
    assert.equal(r.value.sl, 1.075);
    assert.equal(r.value.tp, null);
  });
  const bad = (patch, reason) => assert.equal(M.validatePosition({ ...POS, ...patch }, NOW).reason, reason);
  it('bozuk alanlar', () => {
    bad({ id: 'abc' }, 'id');
    bad({ id: '0' }, 'id');
    bad({ id: '123456789012345678901' }, 'id');
    bad({ symbol: '' }, 'symbol');
    bad({ side: 'long' }, 'side');
    bad({ volume: 0 }, 'volume');
    bad({ volume: -1 }, 'volume');
    bad({ volume: 'NaN' }, 'volume');
    bad({ open_ts: 100 }, 'open_ts');
    bad({ close_ts: NOW + 3 * 86400 }, 'close_ts');
    bad({ close_ts: POS.open_ts - 1 }, 'close_ts');
    bad({ open_ts: 1.5e9 + 0.5 }, 'open_ts');
    bad({ open_price: 0 }, 'open_price');
    bad({ close_price: 'x' }, 'close_price');
    bad({ profit: 'abc' }, 'profit');
    bad({ swap: 1e13 }, 'swap');
  });
  it('eksik para alanları 0 sayılır', () => {
    const r = M.validatePosition({ ...POS, commission: undefined, swap: null, fee: undefined }, NOW);
    assert.equal(r.ok, true);
    assert.equal(r.value.commission, 0);
    assert.equal(r.value.swap, 0);
  });
});

describe('positionToTrade', () => {
  const ctx = { userId: 'u1', journalId: 'j1', login: 51234567, server: 'FTMO-Demo', offsetSec: 7200 };
  it('satır alanları, net PnL = brüt - komisyon + swap', () => {
    const t = M.positionToTrade(M.validatePosition({ ...POS, fee: -0.5 }, NOW).value, ctx);
    assert.equal(t.direction, 'LONG');
    assert.equal(t.instrument, 'forex');
    assert.equal(t.multiplier, 100000);
    assert.equal(t.gross_pnl, 50);
    assert.equal(t.commission, 4);           // -(-3.5 + -0.5)
    assert.equal(t.swap, -1.25);
    assert.equal(t.pnl, 44.75);              // 50 - 4 - 1.25
    assert.equal(t.platform_source, 'mt5');
    assert.equal(t.position_id, null);
    assert.equal(t.import_hash, 'mt5:ftmo-demo:51234567:123456789');
    // Kasım 5: ABD yaz saati bitti (1 Kasım) -> GMT+2: sunucu 14:30 -> 12:30 UTC
    assert.equal(t.trade_date, '2026-11-05T12:30:00.000Z');
    assert.equal(t.exit_date, t.trade_date);
    assert.equal(t.stop_loss, 1.075);
    assert.equal(t.take_profit, null);
  });
  it('sell -> SHORT, komisyon iadesi negatif kalır', () => {
    const t = M.positionToTrade(M.validatePosition({ ...POS, side: 'sell', commission: 2, profit: -10, swap: 0 }, NOW).value, ctx);
    assert.equal(t.direction, 'SHORT');
    assert.equal(t.commission, -2);
    assert.equal(t.pnl, -8);
  });
  it('kuruş yuvarlama', () => {
    const t = M.positionToTrade(M.validatePosition({ ...POS, profit: 0.1 + 0.2, commission: -0.005, swap: 0, volume: 0.123456 }, NOW).value, ctx);
    assert.equal(t.gross_pnl, 0.3);
    assert.equal(t.lot, 0.1235);
  });
});

describe('buildSyncRows', () => {
  const ctx = { userId: 'u1', journalId: 'j1', login: 5, server: 'S', offsetSec: 0, nowServerSec: NOW };
  it('geçersizler atlanır ama imleç onları da kapsar; tekrar eden pozisyon bir kez', () => {
    const later = POS.close_ts + 3600;
    const r = M.buildSyncRows([POS, { ...POS }, { ...POS, id: '2', side: 'x', close_ts: later }, { id: '3', close_ts: 'bad' }], ctx);
    assert.equal(r.rows.length, 1);
    assert.equal(r.rejected.length, 2);
    assert.deepEqual(r.rejected.map((x) => x.reason), ['side', 'symbol']);
    assert.equal(r.maxCloseTs, later);
    assert.equal(r.truncated, false);
  });
  it('dizi değilse boş; 500 sınırı', () => {
    assert.equal(M.buildSyncRows(undefined, ctx).rows.length, 0);
    assert.equal(M.buildSyncRows('x', ctx).maxCloseTs, 0);
    const many = Array.from({ length: 501 }, (_, i) => ({ ...POS, id: String(i + 1) }));
    const r = M.buildSyncRows(many, ctx);
    assert.equal(r.rows.length, 500);
    assert.equal(r.truncated, true);
  });
  it('gelecekteki zaman imleci ilerletmez', () => {
    const r = M.buildSyncRows([{ ...POS, close_ts: NOW + 5 * 86400 }], ctx);
    assert.equal(r.rows.length, 0);
    assert.equal(r.maxCloseTs, 0);
  });
});

describe('token ve yardımcılar', () => {
  it('bearerToken yalnızca wwm5_ + 64 hex kabul eder', () => {
    const tok = 'wwm5_' + 'a'.repeat(64);
    assert.equal(M.bearerToken('Bearer ' + tok), tok);
    assert.equal(M.bearerToken('bearer  ' + tok), tok);
    assert.equal(M.bearerToken('Bearer ' + tok + 'x'), null);
    assert.equal(M.bearerToken('Bearer eyJhbGciOi.x.y'), null);
    assert.equal(M.bearerToken(null), null);
  });
  it('sha256Hex, PostgreSQL encode(digest(x, \'sha256\'), \'hex\') ile aynı', async () => {
    assert.equal(await M.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('formatCode', () => {
    assert.equal(M.formatCode('482913'), '482 913');
    assert.equal(M.formatCode('12'), '12');
  });
  it('POLL_SECRET_RE', () => {
    assert.equal(M.POLL_SECRET_RE.test('f'.repeat(64)), true);
    assert.equal(M.POLL_SECRET_RE.test('F'.repeat(64)), false);
  });
});
