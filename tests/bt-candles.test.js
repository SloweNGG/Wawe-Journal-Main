// Backtest v2: aggregation and cursor maths (public/interface/backtest/js/bt-candles.js)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBt, plain, minutes } from './helpers/bt-env.js';

const { S, C } = loadBt(['symbols', 'candles']);
const sec = (iso) => Date.parse(iso) / 1000;

// n consecutive 1m bars starting at t0 with a predictable price path (points)
function bars(t0, n, base = 100000) {
  const rows = [];
  for (let i = 0; i < n; i++) rows.push([t0 + i * 60, base + i, base + i + 3, base + i - 2, base + i + 1]);
  return rows;
}

describe('bt-candles: month keys', () => {
  it('arithmetic', () => {
    assert.equal(C.addMonths('2024-12', 1), '2025-01'); assert.equal(C.addMonths('2020-01', -1), '2019-12');
    assert.equal(C.nextMonth('2026-09'), '2026-10'); assert.equal(C.prevMonth('2026-01'), '2025-12');
    assert.equal(C.monthKey(sec('2026-09-30T23:59:00Z')), '2026-09'); assert.equal(C.monthStart('2024-02'), Date.UTC(2024, 1, 1) / 1000);
  });
});

describe('bt-candles: Minutes', () => {
  it('toMinutes rounds to points and drops bad rows', () => {
    const m = C.toMinutes([[60, 1.08311, 1.0832, 1.0831, 1.08315], [60, 1, 1, 1, 1], [120, 1.083114, 1, 1, 1], [180, NaN, 1, 1, 1], [240, 1.08311, 1.08311, 1.08311, 1.08311]], 5);
    assert.equal(m.n, 2); assert.equal(m.bad, 3); assert.equal(m.o[0], 108311); assert.equal(m.h[0], 108320);
  });
  it('concat requires ascending, slice and binary search', () => {
    const a = minutes(C, bars(1000, 5)), b = minutes(C, bars(1000 + 5 * 60, 5));
    const ab = C.concatMinutes(a, b);
    assert.equal(ab.n, 10);
    assert.throws(() => C.concatMinutes(b, a), (e) => e.code === 'BT_NON_MONOTONIC');
    assert.equal(C.indexAtOrAfter(ab, 1000 + 61), 2); assert.equal(C.indexAtOrAfter(ab, 99999), 10);
    assert.equal(C.indexAtOrBefore(ab, 1000 + 61), 1); assert.equal(C.indexAtOrBefore(ab, 5), -1);
    assert.equal(C.resumeIndex(ab, 1000 + 120), 1);                 // replay = last revealed open + 60
    const sl = C.sliceMinutes(ab, 3); assert.equal(sl.n, 7); assert.equal(sl.t[0], 1000 + 180);
  });
});

describe('bt-candles: buckets and aggregation', () => {
  it('M5 on the UTC grid', () => {
    const t0 = sec('2026-09-01T10:00:00Z'), m = minutes(C, bars(t0, 12));
    const cs = C.aggregate(m, 5, 'EURUSD');
    assert.equal(cs.length, 3);
    assert.deepEqual(plain(cs[0]), { time: t0, open: 100000, high: 100007, low: 99998, close: 100005, n: 5 });
    assert.equal(cs[2].n, 2);
  });
  it('D1 FX opens at 17:00 New York (summer 21:00Z, winter 22:00Z)', () => {
    assert.equal(C.bucketStart(sec('2026-09-01T03:00:00Z'), 1440, 'EURUSD'), sec('2026-08-31T21:00:00Z'));
    assert.equal(C.bucketStart(sec('2026-12-02T03:00:00Z'), 1440, 'EURUSD'), sec('2026-12-01T22:00:00Z'));
    assert.equal(C.bucketStart(sec('2026-09-01T20:59:00Z'), 1440, 'EURUSD'), sec('2026-08-31T21:00:00Z'));
    assert.equal(C.bucketStart(sec('2026-09-01T21:00:00Z'), 1440, 'EURUSD'), sec('2026-09-01T21:00:00Z'));
  });
  it('D1 crypto opens at 00:00 UTC; H4 from the anchor', () => {
    assert.equal(C.bucketStart(sec('2026-09-01T15:30:00Z'), 1440, 'BTCUSDT'), sec('2026-09-01T00:00:00Z'));
    assert.equal(C.bucketStart(sec('2026-09-01T15:30:00Z'), 240, 'BTCUSDT'), sec('2026-09-01T12:00:00Z'));
    assert.equal(C.bucketStart(sec('2026-09-01T03:00:00Z'), 240, 'EURUSD'), sec('2026-09-01T01:00:00Z'));   // 21:00Z + 4h
  });
  it('DST transitions 2026-03-08 and 2026-11-01 keep one D1 candle per trading day', () => {
    const cases = [['2026-03-08', 'EURUSD'], ['2026-11-01', 'EURUSD'], ['2026-03-08', 'XAUUSD'], ['2026-11-01', 'XAUUSD']];
    for (const [d, id] of cases) {
      const t = sec(d + 'T00:00:00Z') - 2 * 86400;
      const rows = [];
      for (let i = 0; i < 6 * 1440; i++) { const x = t + i * 60; if (S.isOpen(x * 1000, id)) rows.push([x, 100, 101, 99, 100]); }
      const m = minutes(C, rows);
      const cs = C.aggregate(m, 1440, id);
      const anchors = new Set(cs.map((c) => c.time));
      assert.equal(anchors.size, cs.length, `${d} ${id}: unique daily candles`);
      for (const c of cs) assert.equal(S.dayAnchor(c.time * 1000, id) / 1000, c.time, `${d} ${id}: candle time is the trading-day anchor`);
    }
  });
  it('aggregateUpTo never uses a bar after the cursor (property test)', () => {
    const t0 = sec('2026-09-01T00:00:00Z'), rows = bars(t0, 3000), m = minutes(C, rows);
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (const tf of [1, 5, 15, 30, 60, 240, 1440]) {
      for (let i = 0; i < 40; i++) {
        const k = Math.floor(rnd() * 3000), tCursor = t0 + k * 60;
        const cs = C.aggregateUpTo(m, tCursor, tf, 'BTCUSDT');
        const last = cs[cs.length - 1];
        assert.equal(last.close, m.c[k], 'last close is the cursor bar close');
        let n = 0; for (const c of cs) n += c.n;
        assert.equal(n, k + 1, 'exactly the bars 0..k');
        assert.ok(last.high <= Math.max(...rows.slice(0, k + 1).map((r) => r[2])));
      }
    }
    assert.deepEqual(plain(C.aggregateUpTo(m, t0 - 60, 5, 'BTCUSDT')), []);
  });
  it('partialAt = the in-progress candle', () => {
    const t0 = sec('2026-09-01T10:00:00Z'), m = minutes(C, bars(t0, 12));
    const p = C.partialAt(m, 7, 5, 'EURUSD');
    assert.equal(p.time, t0 + 300); assert.equal(p.n, 3);
  });
});

describe('bt-candles: merge and builder', () => {
  it('merge joins a boundary bucket', () => {
    const a = [{ time: 1, open: 1, high: 5, low: 1, close: 2, n: 2 }, { time: 2, open: 2, high: 6, low: 2, close: 3, n: 1 }];
    const b = [{ time: 2, open: 3, high: 9, low: 0, close: 4, n: 2 }, { time: 3, open: 4, high: 4, low: 4, close: 4, n: 1 }];
    const m = C.merge(a, b);
    assert.equal(m.length, 3); assert.deepEqual(plain(m[1]), { time: 2, open: 2, high: 9, low: 0, close: 4, n: 3 });
    assert.throws(() => C.merge(b, a), (e) => e.code === 'BT_NON_MONOTONIC');
    assert.equal(C.merge([], b).length, 2);
  });
  it('builder equals aggregate', () => {
    const t0 = sec('2026-09-01T10:00:00Z'), rows = bars(t0, 50), m = minutes(C, rows);
    const cs = []; const b = C.createBuilder(15, 'EURUSD', cs);
    rows.forEach((r) => b.push(r[0], r[1], r[2], r[3], r[4]));
    assert.deepEqual(plain(cs), plain(C.aggregate(m, 15, 'EURUSD')));
  });
});

describe('bt-candles: stepping, gaps, frames', () => {
  it('stepTarget completes the current candle, or the next one', () => {
    const t0 = sec('2026-09-01T10:00:00Z'), m = minutes(C, bars(t0, 30));
    assert.deepEqual(plain(C.stepTarget(m, 1, 5, 'EURUSD')), { j: 4, open: false });      // mid-candle -> its last bar
    assert.deepEqual(plain(C.stepTarget(m, 4, 5, 'EURUSD')), { j: 9, open: false });      // at a candle end -> the next candle
    assert.deepEqual(plain(C.stepTarget(m, 27, 5, 'EURUSD')), { j: 29, open: true });     // bucket may continue in unloaded data
    assert.deepEqual(plain(C.stepTarget(m, 29, 5, 'EURUSD')), { j: 29, open: true });
  });
  it('gapKind distinguishes a closed market from missing data', () => {
    assert.equal(C.gapKind(1000, 1060, 'EURUSD'), null);
    const fri = sec('2026-09-04T20:59:00Z'), sun = sec('2026-09-06T21:00:00Z');
    const g = C.gapKind(fri, sun, 'EURUSD'); assert.equal(g.kind, 'closed');
    const m = C.gapKind(sec('2026-09-02T10:00:00Z'), sec('2026-09-02T10:15:00Z'), 'EURUSD');
    assert.equal(m.kind, 'missing'); assert.equal(m.minutes, 14);
  });
  it('framePlan: speed = chart candles per second, dt clamped to 250 ms, backlog capped', () => {
    assert.deepEqual(plain(C.framePlan(0, 16, 1, 60, 3000)), { n: 0, acc: 0.96 });
    const p = C.framePlan(0, 1000, 1, 60, 3000); assert.equal(p.n, 15);                  // 250 ms * 60 min/s
    assert.equal(C.framePlan(0, 250, 10, 1440, 3000).n, 3000); assert.equal(C.framePlan(0, 250, 10, 1440, 3000).acc, 0);
    assert.equal(C.framePlan(0.5, 100, 0.1, 1, 3000).n, 0);
  });
  it('toChartBar and constants', () => {
    assert.deepEqual(plain(C.toChartBar({ time: 5, open: 108311, high: 108320, low: 108300, close: 108315 }, 1e5)), { time: 5, open: 1.08311, high: 1.0832, low: 1.083, close: 1.08315 });
    assert.deepEqual(plain(C.TF_IDS), ['1m', '5m', '15m', '30m', '1h', '4h', '1d']);
    assert.equal(C.TF_MIN['4h'], 240); assert.equal(C.historyMonths(1440), 10);
  });
});
