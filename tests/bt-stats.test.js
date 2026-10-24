// Backtest v2: statistics tab numbers (bt-stats.js on top of WwMetrics)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// trade-metrics.js is a classic browser script (window || this): run both files in one context with a `window`
const ctx = { console, Date, Math, JSON, Intl };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['public/interface/shared/trade-metrics.js', 'public/interface/backtest/js/bt-stats.js']) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
const S = ctx.WwBtStats, M = ctx.WwMetrics;
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const plain = (x) => JSON.parse(JSON.stringify(x));   // values from the vm context have other prototypes
const D = (y, m, d, h = 12) => Date.UTC(y, m - 1, d, h) / 1000;
// closed trades in cents; risk = initial risk in cents (null: no stop loss)
const trades = [
  { entryT: D(2026, 1, 5, 9), exitT: D(2026, 1, 5, 14), net: 20000, comm: 0, riskCents: 10000 },   // +2R
  { entryT: D(2026, 1, 20, 2), exitT: D(2026, 1, 20, 3), net: -10000, comm: 0, riskCents: 10000 },  // -1R
  { entryT: D(2026, 2, 3, 13), exitT: D(2026, 2, 3, 15), net: 5000, comm: 0, riskCents: null },     // no SL
  { entryT: D(2026, 3, 1, 13), exitT: D(2026, 3, 2, 10), net: -2500, comm: 0, riskCents: 5000 }      // -0.5R (Sunday entry: off-session)
];

describe('bt-stats', () => {
  it('key figures equal WwMetrics.summarize on the same trades', () => {
    const k = S.kpis(trades, 1000000), s = M.summarize(S.metricRows(trades));
    assert.equal(k.count, 4); assert.equal(k.wins, 2); assert.equal(k.losses, 2);
    assert.ok(near(k.net, s.totalPnL) && near(k.net, 125)); assert.ok(near(k.winRate, 50));
    assert.ok(near(k.profitFactor, 250 / 125)); assert.ok(near(k.expectancy, 125 / 4));
    assert.ok(near(k.expectancyR, (2 - 1 - 0.5) / 3), 'average R over the trades that had a stop loss');
    assert.ok(near(k.maxDd, 100) && near(k.maxDdPct, 100 / 10200 * 100), 'drawdown from the 10 200 peak after the first trade');
  });
  it('balance curve: starts at the starting balance, one point per closed trade, unique ascending times', () => {
    const b = S.balanceSeries(trades, 1000000, D(2026, 1, 5, 8));
    assert.deepEqual(plain(b.map((p) => p.value)), [10000, 10200, 10100, 10150, 10125]);
    assert.ok(b.every((p, i) => i === 0 || p.time > b[i - 1].time));
    const same = S.balanceSeries([{ entryT: 1, exitT: 100, net: 100 }, { entryT: 2, exitT: 100, net: 200 }], 0, 0);
    assert.deepEqual(plain(same), [{ time: 100, value: 3 }], 'two closes in the same second become one point with the later balance');
  });
  it('equity at candle closes: realized trades plus open positions priced at the close', () => {
    const closed = [{ entryT: 100, exitT: 250, net: 500, dir: 1, entry: 10 }], open = [{ entryT: 260, exitT: null, dir: 1, entry: 10 }];
    const candles = [0, 100, 200, 300].map((t, i) => ({ time: t, close: 10 + i, span: 100 }));
    const eq = S.equitySeries(closed, open, candles, 10000, (t, c) => (c - t.entry) * 100);
    // candle 0: the later-closed trade is open at 10 -> 0; candle 100 (close 11): it floats +100; candle 200 (ends 300): realized +500 and the
    // open trade (entry 260) floats (12-10)*100; candle 300: +500 and (13-10)*100
    assert.deepEqual(plain(eq.map((p) => p.value)), [100, 101, 107, 108]);
    const dd = S.drawdownSeries([{ time: 1, value: 100 }, { time: 2, value: 120 }, { time: 3, value: 90 }, { time: 4, value: 130 }]);
    assert.deepEqual(plain(dd.map((p) => p.value)), [0, 0, -25, 0]);
  });
  it('monthly returns use the balance at the start of each month; year total over the first month base', () => {
    const mo = S.monthly(trades, 1000000, (sec) => new Date(sec * 1000).toISOString().slice(0, 7));
    assert.deepEqual(plain(mo.years), ['2026']);
    assert.ok(near(mo.cells['2026'][1].ret, 100 / 10000 * 100)); assert.equal(mo.cells['2026'][1].trades, 2);
    assert.ok(near(mo.cells['2026'][2].ret, 50 / 10100 * 100)); assert.ok(near(mo.cells['2026'][3].ret, -25 / 10150 * 100));
    assert.ok(near(mo.totals['2026'].ret, 125 / 10000 * 100));
    assert.equal(mo.cells['2026'][4], undefined);
  });
  it('R distribution bins; trades without a stop loss are counted apart', () => {
    const r = S.rDistribution(trades);
    assert.equal(r.count, 3); assert.equal(r.skipped, 1); assert.ok(near(r.avg, 0.5 / 3));
    const at = (from) => r.bins.find((b) => b.from === from).count;
    assert.equal(at(2), 1); assert.equal(at(-1), 2, '-1R sits in [-1, 0), so do -0.5R'); assert.equal(at(-Infinity), 0);
    assert.equal(r.bins.reduce((a, b) => a + b.count, 0), 3);
  });
  it('session win rate by entry time, overlap counted in both, off-session bucket', () => {
    const sessionsAt = (t) => { const h = new Date(t * 1000).getUTCHours(), dow = new Date(t * 1000).getUTCDay(); if (dow === 0) return []; const o = []; if (h < 9) o.push('asia'); if (h >= 8 && h < 17) o.push('london'); if (h >= 13 && h < 21) o.push('ny'); return o; };
    const ss = S.sessionStats(trades, sessionsAt), by = Object.fromEntries(ss.map((x) => [x.id, x]));
    assert.equal(by.london.trades, 2); assert.equal(by.london.wins, 2, '09:00 and 13:00 entries');
    assert.equal(by.ny.trades, 1); assert.equal(by.asia.trades, 1); assert.equal(by.asia.wins, 0);
    assert.equal(by.off.trades, 1); assert.equal(by.off.winRate, 0);
    assert.ok(ss.every((x) => x.trades === 0 ? x.winRate === null : x.winRate >= 0));
  });
  it('step line of the balance on the equity times (balance at the candle end, as the equity)', () => {
    const bal = [{ time: 5, value: 1 }, { time: 15, value: 2 }, { time: 29, value: 3 }], eq = [{ time: 0, value: 9 }, { time: 10, value: 9 }, { time: 20, value: 9 }];
    assert.deepEqual(plain(S.stepTo(bal, eq).map((p) => p.value)), [1, 1, 2]);
    assert.deepEqual(plain(S.stepTo(bal, eq, 10).map((p) => p.value)), [1, 2, 3], 'a close inside the last candle reaches the line');
  });
});
