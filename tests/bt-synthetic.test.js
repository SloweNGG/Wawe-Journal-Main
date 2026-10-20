// Backtest v2: synthetic candles and the SyntheticSource (bt-synthetic.js, bt-data.js)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBt, plain } from './helpers/bt-env.js';

const { S, C, Y, D } = loadBt(['symbols', 'candles', 'synthetic', 'data']);
const gen = Y.createGenerator({ S, seed: 1 });

describe('bt-synthetic: generator', () => {
  it('is deterministic: a month at once equals day by day', () => {
    const sym = S.get('EURUSD');
    const month = Y.generateMonth(gen, sym, '2026-09');
    const g2 = Y.createGenerator({ S, seed: 1 });
    let days = [];
    for (let d = 1; d <= 30; d++) days = days.concat(g2.generateDay(sym, '2026-09-' + String(d).padStart(2, '0')));
    assert.deepEqual(plain(month), plain(days));
  });
  it('a different seed gives different prices; the same seed in a new generator gives the same', () => {
    const sym = S.get('EURUSD');
    const a = Y.generateMonth(Y.createGenerator({ S, seed: 1 }), sym, '2026-08').slice(0, 50);
    const b = Y.generateMonth(Y.createGenerator({ S, seed: 1 }), sym, '2026-08').slice(0, 50);
    const c = Y.generateMonth(Y.createGenerator({ S, seed: 2 }), sym, '2026-08').slice(0, 50);
    assert.deepEqual(plain(a), plain(b)); assert.notDeepEqual(plain(a), plain(c));
  });
  it('no bars while the market is closed; none before 17:00 New York on Sunday', () => {
    for (const id of ['EURUSD', 'XAUUSD']) {
      const rows = Y.generateMonth(gen, S.get(id), '2026-09');
      assert.ok(rows.length > 20000, id);
      for (const r of rows) assert.ok(S.isOpen(r[0] * 1000, id), `${id} bar at ${new Date(r[0] * 1000).toISOString()} is inside market hours`);
    }
  });
  it('crypto is 24/7 (about one bar per minute)', () => {
    const rows = Y.generateMonth(gen, S.get('BTCUSDT'), '2026-09');
    assert.ok(rows.length > 29.5 * 1440 && rows.length <= 30 * 1440);
  });
  it('prices are positive integers on the point grid; high >= max(o,c); low <= min(o,c); times ascend by minutes', () => {
    for (const id of ['EURUSD', 'USDJPY', 'XAUUSD', 'BTCUSDT', 'ETHUSDT', 'GBPUSD']) {
      const rows = Y.generateMonth(gen, S.get(id), '2026-09');
      let prev = 0;
      for (const [t, o, h, l, c] of rows) {
        assert.ok(t > prev && t % 60 === 0); prev = t;
        for (const v of [o, h, l, c]) assert.ok(Number.isInteger(v) && v > 0);
        assert.ok(h >= Math.max(o, c) && l <= Math.min(o, c));
      }
    }
  });
});

describe('bt-data: SyntheticSource', () => {
  const NOW = Date.parse('2026-10-19T12:00:00Z');
  const src = () => D.createSyntheticSource({ seed: 1, now: () => NOW });
  it('coverage ends yesterday; months ascend from 2024-01', async () => {
    const cov = await src().coverage('EURUSD');
    assert.equal(cov.months[0], '2024-01'); assert.equal(cov.months[cov.months.length - 1], '2026-10');
    assert.equal(cov.lastT, Date.parse('2026-10-19T00:00:00Z') / 1000 - 60);
    assert.equal(cov.firstT, Date.parse('2024-01-01T00:00:00Z') / 1000);
    assert.deepEqual(plain(cov.partial), ['2026-10']);
  });
  it('the current month never contains today', async () => {
    const m = await src().getMonthMinutes('BTCUSDT', '2026-10');
    assert.ok(m.n > 0 && m.t[m.n - 1] < Date.parse('2026-10-19T00:00:00Z') / 1000);
  });
  it('getMonth rows convert back to the same points', async () => {
    const s = src(), sym = S.get('EURUSD');
    const rows = await s.getMonth('EURUSD', '2026-09'), m = await s.getMonthMinutes('EURUSD', '2026-09');
    const back = C.toMinutes(rows, sym.digits);
    assert.equal(back.bad, 0); assert.equal(back.n, m.n); assert.equal(back.c[1000], m.c[1000]);
  });
  it('caches, rejects unknown months and symbols, honours abort', async () => {
    const s = src();
    assert.equal(s.isCached('EURUSD', '2026-09'), false);
    await s.getMonthMinutes('EURUSD', '2026-09');
    assert.equal(s.isCached('EURUSD', '2026-09'), true);
    await assert.rejects(() => s.getMonthMinutes('EURUSD', '2019-01'), (e) => e.code === 'NOT_FOUND');
    await assert.rejects(() => s.coverage('NOPE'), (e) => e.code === 'NOT_FOUND');
    const ac = { aborted: true };
    await assert.rejects(() => s.getMonthMinutes('EURUSD', '2026-08', { signal: ac }), (e) => e.code === 'ABORTED');
    assert.equal(s.kind, 'synthetic');
  });
});
