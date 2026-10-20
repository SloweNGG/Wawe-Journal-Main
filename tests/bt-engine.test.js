// Backtest v2: exact-money trade engine (public/interface/backtest/js/bt-engine.js)
// Verified numbers: docs/backtest-v2/asama-arayuz/prototip/check-numbers.mjs and stage4.md section 7.3
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBt, plain } from './helpers/bt-env.js';

const { S, E } = loadBt(['symbols', 'engine']);
const T0 = 1788220800; // 2026-09-01T00:00:00Z

function eurState(over = {}) {
  const st = E.createState(Object.assign({ sym: 'EURUSD', startCents: 1000000, spreadPts: 2, cplCents: 700 }, over));
  E.setQuote(st, [T0, 108300, 108312, 108295, 108309]);
  return st;
}

describe('bt-engine: decimal helpers', () => {
  it('parseScaled', () => {
    const a = E.parseScaled('1.083115', 5, 'round'); assert.equal(a.value, 108312); assert.equal(a.snapped, true);
    assert.equal(E.parseScaled('1,08311', 5, 'exact').value, 108311);
    assert.equal(E.parseScaled('0.375', 2, 'exact').ok, false);
    assert.equal(E.parseScaled('0.375', 2, 'exact').code, 'DECIMALS');
    assert.equal(E.parseScaled('0,5', 2, 'exact').value, 50);
    assert.equal(E.parseScaled('abc', 2, 'exact').code, 'FORMAT');
    assert.equal(E.parseScaled('1,2,3', 2, 'exact').code, 'FORMAT');
    assert.equal(E.parseScaled('1,2.3', 2, 'exact').code, 'FORMAT');
    assert.equal(E.parseScaled('', 2, 'exact').code, 'FORMAT');
    assert.equal(E.parseScaled('1.230', 2, 'exact').value, 123, 'trailing zeros are not extra decimals');
    assert.equal(E.parseScaled('99999999999999999999', 2, 'exact').code, 'RANGE');
  });
  it('scaledToStr', () => {
    assert.equal(E.scaledToStr(108311, 5), '1.08311');
    assert.equal(E.scaledToStr(-5, 2), '-0.05');
    assert.equal(E.scaledToStr(-0, 2), '0.00');
    assert.equal(E.scaledToStr(8160025, 2), '81600.25');
    assert.equal(E.toPlainDecimalString(1e-7), '0.0000001');
    assert.equal(E.toPlainDecimalString(1.5e21), '1500000000000000000000');
  });
  it('Postgres ROUND(.,2) parity: decimal -> cents -> string', () => {
    const r = (x) => E.centsToStr(E.toCents(x));
    const cases = [['1.005', '1.01'], ['-1.005', '-1.01'], ['2.675', '2.68'], ['1.045', '1.05'], ['0.125', '0.13'],
      ['-0.125', '-0.13'], ['-0.005', '-0.01'], ['-0.0049', '0.00'], ['41.44000000000037', '41.44'], [1e-7, '0.00'],
      ['12345678.995', '12345679.00'], [41.44, '41.44']];
    for (const [i, o] of cases) assert.equal(r(i), o, String(i));
  });
  it('why toFixed / Math.round are banned', () => {
    assert.deepEqual([1.005, -1.005, 2.675, 1.045].map((x) => x.toFixed(2)), ['1.00', '-1.00', '2.67', '1.04']);
    assert.deepEqual([1.005, -1.005, 2.675, 1.045].map((x) => Math.round(x * 100) / 100), [1, -1, 2.68, 1.05]);
    assert.equal(Math.round(-0.125 * 100) / 100, -0.12);
    assert.ok(Object.is(Math.round(-0.005 * 100) / 100, -0));
    assert.equal((-1.255).toFixed(2), '-1.25');
  });
  it('roundDiv', () => {
    assert.equal(E.roundDiv(5, 10), 1); assert.equal(E.roundDiv(-5, 10), -1);
    assert.ok(Object.is(E.roundDiv(-4, 10), 0));
    assert.equal(E.roundDiv(25, 10), 3); assert.equal(E.roundDiv(-25, 10), -3);
    assert.equal(E.roundDiv(2 ** 60, 3), Number((BigInt(2 ** 60) + BigInt(1)) / BigInt(3)));
  });
});

describe('bt-engine: money', () => {
  it('fixed cases', () => {
    assert.equal(E.grossCents('EURUSD', 1, 108311, 108423, 37), 4144);
    assert.equal(E.commissionCents('EURUSD', 700, 37), 259);
    assert.equal(E.grossCents('EURUSD', 1, 108311, 108711, 37), 14800);
    assert.equal(E.grossCents('EURUSD', 1, 108311, 108111, 37), -7400);
    assert.equal(E.grossCents('EURUSD', 1, 108311, 108400, 37), 3293);
    assert.equal(E.grossCents('USDJPY', -1, 151234, 150987, 100), 16359);
    assert.equal(E.commissionCents('USDJPY', 700, 100), 700);
    assert.equal(E.grossCents('EURUSD', -1, 110000, 110123, 50), -6150);
    assert.equal(E.commissionCents('EURUSD', 700, 50), 350);
    assert.equal(E.grossCents('XAUUSD', 1, 200000, 200005, 1), 5);
    assert.equal(E.commissionCents('XAUUSD', 50, 1), 1, '0.005 tie goes away from zero');
    assert.equal(E.grossCents('BTCUSDT', 1, 10000000, 10012345, 1), 123);
    assert.equal(E.grossCents('BTCUSDT', -1, 10000000, 10012350, 1), -124);
  });
  it('rrHundredths', () => {
    assert.equal(E.rrHundredths(108311, 108111, 108711), 200);
    assert.equal(E.rrHundredths(110000, 109992, 110011), 138);
    assert.equal(E.rrHundredths(100000, 99000, 101005), 101);
    assert.equal(E.rrHundredths(100000, 100000, 100400), null);
    assert.equal(E.rrHundredths(100000, null, 100400), null);
  });
  it('spreadPts from hundredths of a pip', () => {
    assert.equal(E.spreadPts('EURUSD', 20), 2); assert.equal(E.spreadPts('EURUSD', 15), 2);
    assert.equal(E.spreadPts('XAUUSD', 200), 20); assert.equal(E.spreadPts('BTCUSDT', 1000), 1000);
    assert.equal(E.spreadPts('USDJPY', 30), 3);
  });
});

describe('bt-engine: fills and triggers', () => {
  it('fills', () => {
    assert.equal(E.marketFill(1, 108300, 2), 108302); assert.equal(E.marketFill(-1, 108300, 2), 108300);
    assert.equal(E.closeFill(1, 108300, 2), 108300); assert.equal(E.closeFill(-1, 108300, 2), 108302);
  });
  it('LONG triggers', () => {
    const L = { dir: 1, sl: 108200, tp: 108500 };
    assert.equal(E.exitOnBar(L, [0, 108300, 108499, 108201, 108300], 2), null);
    assert.deepEqual(plain(E.exitOnBar(L, [0, 108300, 108500, 108250, 108300], 2)), { reason: 'tp', pts: 108500, ambiguous: false });
    assert.deepEqual(plain(E.exitOnBar(L, [0, 108300, 108550, 108150, 108300], 2)), { reason: 'sl', pts: 108200, ambiguous: true });
    assert.deepEqual(plain(E.exitOnBar(L, [0, 108150, 108160, 108100, 108120], 2)), { reason: 'sl', pts: 108150, ambiguous: false });
    assert.deepEqual(plain(E.exitOnBar(L, [0, 108600, 108650, 108590, 108620], 2)), { reason: 'tp', pts: 108500, ambiguous: false });
  });
  it('SHORT triggers on the ask', () => {
    const Sh = { dir: -1, sl: 108400, tp: 108100 };
    assert.equal(E.exitOnBar(Sh, [0, 108300, 108397, 108099, 108300], 2), null);
    assert.deepEqual(plain(E.exitOnBar(Sh, [0, 108300, 108398, 108200, 108300], 2)), { reason: 'sl', pts: 108400, ambiguous: false });
    assert.deepEqual(plain(E.exitOnBar(Sh, [0, 108300, 108350, 108098, 108300], 2)), { reason: 'tp', pts: 108100, ambiguous: false });
    assert.deepEqual(plain(E.exitOnBar(Sh, [0, 108450, 108460, 108440, 108450], 2)), { reason: 'sl', pts: 108452, ambiguous: false });
  });
});

describe('bt-engine: scenarios', () => {
  it('manual close', () => {
    const st = eurState();
    const p = E.openPosition(st, { id: 'a', dir: 1, steps: 37, sl: 108111, tp: 108711 });
    assert.equal(p.entry, 108311); assert.equal(p.comm, 259); assert.equal(p.rr, 200); assert.equal(p.entryT, T0 + 60);
    // the entry bar does not trigger SL, even with a low through it
    assert.equal(E.onBar(st, [T0, 108300, 108320, 108100, 108300]).length, 0);
    assert.equal(st.open.length, 1);
    E.onBar(st, [T0 + 60, 108400, 108430, 108390, 108423]);
    const fl = E.floating(st);
    assert.equal(fl.byId.a.gross, 4144); assert.equal(fl.byId.a.net, 3885);
    const t = E.closePosition(st, 'a');
    assert.equal(t.exit, 108423); assert.equal(t.net, 3885); assert.equal(t.exitT, T0 + 120); assert.equal(t.exitBarT, T0 + 60);
    assert.equal(E.centsToStr(E.summary(st).balanceCents), '10038.85');
  });
  it('TP on the next bar', () => {
    const st = eurState();
    E.openPosition(st, { id: 'a', dir: 1, steps: 37, sl: 108111, tp: 108711 });
    const closed = E.onBar(st, [T0 + 60, 108320, 108720, 108300, 108700]);
    assert.equal(closed.length, 1);
    assert.equal(closed[0].reason, 'tp'); assert.equal(closed[0].exit, 108711); assert.equal(closed[0].exitT, T0 + 60);
    assert.equal(closed[0].gross, 14800); assert.equal(E.centsToStr(closed[0].net), '145.41');
  });
  it('TP and SL in the same 1m bar: SL first, flagged ambiguous', () => {
    const st = eurState({ cplCents: 0 });
    E.setQuote(st, [T0, 108300, 108300, 108300, 108300]);   // bid 108300, ask 108302
    E.openPosition(st, { id: 'a', dir: 1, steps: 100, sl: 108200, tp: 108500 });
    const closed = E.onBar(st, [T0 + 60, 108300, 108550, 108150, 108300]);
    assert.equal(closed[0].reason, 'sl'); assert.equal(closed[0].ambiguous, true); assert.equal(closed[0].gross, -10200);
    assert.equal(E.summary(st).ambiguous, 1);
  });
  it('SHORT gap after a weekend fills at the ask open', () => {
    const st = eurState();
    E.openPosition(st, { id: 'a', dir: -1, steps: 10, sl: 108400, tp: null });
    const closed = E.onBar(st, [T0 + 3 * 86400, 108450, 108460, 108440, 108450]);
    assert.equal(closed[0].exit, 108452); assert.equal(closed[0].exitT, T0 + 3 * 86400);
  });
  it('modify keeps the initial levels and rr', () => {
    const st = eurState();
    const p = E.openPosition(st, { id: 'a', dir: 1, steps: 37, sl: 108111, tp: 108711 });
    E.modifyPosition(st, 'a', 108200, null);
    assert.equal(p.sl, 108200); assert.equal(p.tp, null); assert.equal(p.sl0, 108111); assert.equal(p.tp0, 108711); assert.equal(p.rr, 200);
    assert.throws(() => E.modifyPosition(st, 'a', 108309, null), (e) => e.code === 'MODIFY_LONG');   // SL must stay below the bid 108309
    assert.throws(() => E.modifyPosition(st, 'zzz', 1, null), (e) => e.code === 'NOT_FOUND');
  });
});

describe('bt-engine: validateOrder, preview, summary', () => {
  const v = (st, o) => E.validateOrder(st, Object.assign({ dir: 1, steps: 10, sl: null, tp: null }, o));
  it('side checks at bid 108300 / ask 108302', () => {
    const st = E.createState({ sym: 'EURUSD', startCents: 1000000, spreadPts: 2, cplCents: 0 });
    E.setQuote(st, [T0, 108300, 108300, 108300, 108300]);
    assert.equal(v(st, { dir: 1, tp: 108302 }).code, 'TP_LONG'); assert.ok(v(st, { dir: 1, tp: 108303 }).ok);
    assert.equal(v(st, { dir: 1, sl: 108300 }).code, 'SL_LONG'); assert.ok(v(st, { dir: 1, sl: 108299 }).ok);
    assert.equal(v(st, { dir: -1, tp: 108300 }).code, 'TP_SHORT'); assert.ok(v(st, { dir: -1, tp: 108299 }).ok);
    assert.equal(v(st, { dir: -1, sl: 108302 }).code, 'SL_SHORT'); assert.ok(v(st, { dir: -1, sl: 108303 }).ok);
    assert.equal(v(st, { steps: 0 }).code, 'LOT_RANGE'); assert.equal(v(st, { steps: 10001 }).code, 'LOT_RANGE'); assert.ok(v(st, { steps: 10000 }).ok);
    assert.equal(v(st, { sl: 0 }).code, 'PRICE'); assert.equal(v(st, { sl: 1.5 }).code, 'PRICE');
  });
  it('no quote, max positions, no equity', () => {
    const st = E.createState({ sym: 'EURUSD', startCents: 1000000, spreadPts: 2, cplCents: 0 });
    assert.equal(v(st, {}).code, 'NO_QUOTE');
    E.setQuote(st, [T0, 108300, 108300, 108300, 108300]);
    for (let i = 0; i < 20; i++) E.openPosition(st, { id: 'p' + i, dir: 1, steps: 1, sl: null, tp: null });
    assert.equal(v(st, {}).code, 'MAX_POSITIONS');
    const st2 = E.createState({ sym: 'EURUSD', startCents: 100, spreadPts: 2, cplCents: 0 });
    E.setQuote(st2, [T0, 108300, 108300, 108300, 108300]);
    E.openPosition(st2, { id: 'a', dir: 1, steps: 10000, sl: null, tp: null });
    E.onBar(st2, [T0 + 60, 107000, 107000, 107000, 107000]);
    assert.equal(v(st2, {}).code, 'NO_EQUITY');
  });
  it('preview', () => {
    const st = eurState();
    assert.deepEqual(plain(E.preview(st, { dir: 1, steps: 37, sl: 108111, tp: 108711 })),
      { entry: 108311, riskCents: 7659, rewardCents: 14541, commCents: 259, rr: 200 });
  });
  it('summary drawdown', () => {
    const st = E.createState({ sym: 'EURUSD', startCents: 100000, spreadPts: 0, cplCents: 0 });
    [10000, -30000, 5000, -10000].forEach((net, i) => st.closed.push({ id: 'c' + i, net, gross: net, comm: 0, exitT: i + 1, entryT: i }));
    st.realizedCents = -25000;
    const s = E.summary(st);
    assert.equal(s.balanceCents, 75000); assert.equal(s.maxDdCents, 35000); assert.equal(s.maxDdBp, 3182);
    assert.equal(s.wins, 2); assert.equal(s.losses, 2);
  });
});

describe('bt-engine: DB mapping', () => {
  it('insert, close, restore round trip', () => {
    const st = eurState();
    const p = E.openPosition(st, { id: 'a', dir: 1, steps: 37, sl: 108111, tp: 108711 });
    const row = E.tradeInsertRow(st, p, { userId: 'u1', accountId: 'acc1' });
    assert.deepEqual(plain(row), { id: 'a', user_id: 'u1', backtest_account_id: 'acc1', symbol: 'EURUSD', direction: 'LONG', lot: '0.37',
      entry_price: '1.08311', stop_loss: '1.08111', take_profit: '1.08711', entry_time: new Date((T0 + 60) * 1000).toISOString(),
      commission: '2.59', rr_ratio: '2.00' });
    E.onBar(st, [T0 + 60, 108400, 108430, 108390, 108423]);
    const t = E.closePosition(st, 'a');
    assert.deepEqual(plain(E.tradeClosePatch(st, t, { extraColumns: true })),
      { exit_price: '1.08423', exit_time: new Date((T0 + 120) * 1000).toISOString(), exit_reason: 'manual', pnl: '38.85', gross_pnl: '41.44', exit_ambiguous: false });
    assert.equal(E.tradeClosePatch(st, t, {}).gross_pnl, undefined);
    // PostgREST-style numbers
    const st2 = E.createState({ sym: 'EURUSD', startCents: 1000000, spreadPts: 2, cplCents: 700 });
    E.restore(st2, [{ id: 'a', direction: 'LONG', lot: 0.37, entry_price: 1.08311, stop_loss: 1.08111, take_profit: 1.08711,
      entry_time: new Date((T0 + 60) * 1000).toISOString(), exit_time: new Date((T0 + 120) * 1000).toISOString(), exit_price: 1.08423,
      exit_reason: 'manual', pnl: 38.85, gross_pnl: 41.44, commission: 2.59, rr_ratio: 2, exit_ambiguous: false }]);
    const c = st2.closed[0];
    assert.equal(c.steps, 37); assert.equal(c.entry, 108311); assert.equal(c.net, 3885); assert.equal(c.gross, 4144); assert.equal(c.exitBarT, T0 + 60);
    assert.equal(st2.realizedCents, 3885);
  });
  it('restore rebuilds gross when the column is missing; open rows stay open', () => {
    const st = E.createState({ sym: 'EURUSD', startCents: 1000000, spreadPts: 2, cplCents: 0 });
    E.restore(st, [
      { id: 'o', direction: 'SHORT', lot: '0.10', entry_price: '1.10000', entry_time: '2026-09-01T00:01:00.000Z', commission: '0.70' },
      { id: 'c', direction: 'LONG', lot: '0.10', entry_price: '1.10000', entry_time: '2026-09-01T00:01:00.000Z', exit_time: '2026-09-01T01:00:00.000Z',
        exit_price: '1.10100', exit_reason: 'tp', pnl: '9.30', commission: '0.70' }]);
    assert.equal(st.open.length, 1); assert.equal(st.open[0].dir, -1);
    assert.equal(st.closed[0].gross, 1000); assert.equal(st.closed[0].exitBarT, st.closed[0].exitT);
  });
  it('account mapping', () => {
    const a = { userId: 'u', journalId: null, name: 'A', symbol: 'EURUSD', tf: '1h', startCents: 1000000, spreadH: 20, cplCents: 700, replaySec: T0 };
    const row = E.accountInsertRow(a);
    assert.equal(row.starting_balance, '10000.00'); assert.equal(row.spread_pips, '0.20'); assert.equal(row.commission_per_lot, '7.00');
    const back = E.accountFromRow(Object.assign({ id: 'x', is_active: true }, row));
    assert.equal(back.startCents, 1000000); assert.equal(back.spreadH, 20); assert.equal(back.cplCents, 700); assert.equal(back.replaySec, T0);
    assert.deepEqual(plain(E.accountPatch({ spreadH: 15, tf: '4h' })), { spread_pips: '0.15', timeframe: '4h' });
  });
  it('metricsRow feeds WwMetrics', () => {
    const st = eurState();
    E.openPosition(st, { id: 'a', dir: 1, steps: 37, sl: 108111, tp: 108711 });
    E.onBar(st, [T0 + 60, 108400, 108430, 108390, 108423]);
    const t = E.closePosition(st, 'a'), m = E.metricsRow(st, t);
    assert.equal(m.pnl, 38.85); assert.equal(m.rr_ratio, 2); assert.equal(m.direction, 'LONG'); assert.equal(m.lot, 0.37);
  });
});

// ---------------------------------------------------------------- fuzz against a BigInt decimal reference
describe('bt-engine: fuzz', () => {
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const big = (x) => BigInt(x);
  function refRound(N, D) { const neg = N < 0n; const A = neg ? -N : N; let q = A / D; if ((A % D) * 2n >= D) q += 1n; return Number(neg ? -q : q); }
  function refGross(s, dir, entry, exit, steps) {
    // cents = dir*(exit-entry)*steps*contractSize*100 / (10^lotDigits * [exit if USD base]) with price scaling
    let num = big(dir * (exit - entry)) * big(steps) * big(s.contractSize) * 100n;
    let den = 10n ** big(s.lotDigits);
    if (s.toUsd === 'base') den *= big(exit); else den *= 10n ** big(s.digits);
    if (s.toUsd === 'base') num *= 1n; // price terms cancel: (exit-entry)/10^d / (exit/10^d)
    return refRound(num, den);
  }
  it('20000 random trades across all symbols', () => {
    const r = rng(12345);
    for (let i = 0; i < 20000; i++) {
      const s = S.list()[Math.floor(r() * 6)];
      const entry = 1 + Math.floor(r() * (s.id === 'BTCUSDT' ? 20000000 : 500000));
      const exit = Math.max(1, entry + Math.floor((r() - 0.5) * entry * 0.05));
      const steps = 1 + Math.floor(r() * 5000), dir = r() < 0.5 ? 1 : -1;
      assert.equal(E.grossCents(s, dir, entry, exit, steps), refGross(s, dir, entry, exit, steps), `${s.id} ${dir} ${entry} ${exit} ${steps}`);
      const sl = Math.max(1, entry - Math.floor(r() * 3000) - 1), tp = entry + 1 + Math.floor(r() * 3000);
      const risk = BigInt(Math.abs(entry - sl)), reward = BigInt(Math.abs(tp - entry));
      assert.equal(E.rrHundredths(entry, sl, tp), refRound(reward * 100n, risk));
    }
  });
});
