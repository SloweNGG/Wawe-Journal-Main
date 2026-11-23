// Backtest indicators (bt-ind.js): settings, the formulas against straightforward reference code, the replay's tail updates,
// the oscillator band layout
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import '../public/interface/backtest/js/bt-ind.js';

const I = globalThis.WwBtInd;
const near = (a, b, eps = 1e-9) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)));
function mem() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; }
function sameArr(a, b, what) {
  assert.equal(a.length, b.length, what + ' length');
  for (let i = 0; i < b.length; i++) assert.ok(near(a[i], b[i]), `${what}[${i}]: ${a[i]} vs ${b[i]}`);
}
// deterministic random walk candles
function candles(n, seed = 7) {
  let s = seed, p = 1.1;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = p, c = o + (rnd() - 0.5) * 0.004, h = Math.max(o, c) + rnd() * 0.002, l = Math.min(o, c) - rnd() * 0.002;
    out.push({ time: 1700000000 + i * 3600, open: o, high: h, low: l, close: c }); p = c;
  }
  return out;
}
const inst = (type, params = {}) => I.cleanInst({ type, params });
const run = (type, params, bars) => I.compute(inst(type, params), bars, 0, {});

// ---- reference implementations (whole series, no state)
const refSma = (x, n) => x.map((_, i) => (i < n - 1 || x.slice(i - n + 1, i + 1).some((v) => v == null) ? null : x.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n));
function refSmooth(x, n, alpha) {
  const out = []; let prev = null;
  for (let i = 0; i < x.length; i++) {
    let v = null;
    if (x[i] != null) v = prev == null ? refSma(x.slice(0, i + 1), n)[i] : alpha * x[i] + (1 - alpha) * prev;
    out.push(v); prev = v;
  }
  return out;
}
const refEma = (x, n) => refSmooth(x, n, 2 / (n + 1));
const refRma = (x, n) => refSmooth(x, n, 1 / n);

describe('bt-ind: settings', () => {
  it('seven indicators; a new one gets the defaults and a unique id', () => {
    assert.deepEqual(I.TYPE_IDS, ['sma', 'ema', 'bb', 'rsi', 'macd', 'stoch', 'atr']);
    const a = I.create('rsi'), b = I.create('rsi');
    assert.deepEqual(a.params, { length: 14, source: 'close' });
    assert.equal(a.colors.rsi, '#a855f7'); assert.equal(a.hidden, false);
    assert.notEqual(a.id, b.id);
    assert.equal(I.create('vwap'), null);
  });
  it('normalize: clamps, rounds, falls back to defaults, drops unknown types, keeps at most 10, unique ids', () => {
    const s = I.normalize({ list: [
      { id: 'x', type: 'sma', params: { length: 9999, source: 'weird' }, colors: { ma: 'red' } },
      { id: 'x', type: 'bb', params: { length: '30', mult: 2.345 }, colors: { up: '#ABCDEF' }, hidden: true },
      { type: 'nope' }, null, 'str',
      { type: 'macd', params: { fast: -5, slow: 3.6, signal: 'abc' } }
    ] });
    assert.equal(s.list.length, 3);
    assert.deepEqual(s.list[0].params, { length: 500, source: 'close' });
    assert.equal(s.list[0].colors.ma, '#f59e0b');
    assert.deepEqual(s.list[1].params, { length: 30, mult: 2.3, source: 'close' });
    assert.equal(s.list[1].colors.up, '#abcdef'); assert.equal(s.list[1].hidden, true);
    assert.notEqual(s.list[1].id, 'x', 'a duplicate id is replaced');
    assert.deepEqual(s.list[2].params, { fast: 1, slow: 4, signal: 9, source: 'close' });
    const many = I.normalize({ list: Array.from({ length: 15 }, () => ({ type: 'ema' })) });
    assert.equal(many.list.length, I.MAX); assert.equal(I.MAX, 10);
    assert.deepEqual(I.normalize(null), { list: [] }); assert.deepEqual(I.normalize({ list: 'x' }), { list: [] });
  });
  it('load / save through storage; broken JSON is an empty list', () => {
    const st = mem();
    assert.deepEqual(I.load(st), { list: [] });
    I.save(st, { list: [{ id: 'a1', type: 'ema', params: { length: 21 } }] });
    assert.equal(I.load(st).list[0].params.length, 21);
    st.setItem(I.KEY, '{broken'); assert.deepEqual(I.load(st), { list: [] });
    assert.deepEqual(I.load(null), { list: [] });
    const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    assert.deepEqual(I.load(bad), { list: [] }); assert.equal(I.save(bad, { list: [] }), false);
  });
  it('labels and the compute key (colors do not change the values)', () => {
    assert.equal(I.label(inst('rsi')), 'RSI 14');
    assert.equal(I.label(inst('sma', { length: 50, source: 'hl2' })), 'SMA 50 hl2');
    assert.equal(I.label(inst('bb')), 'BB 20 2');
    assert.equal(I.label(inst('macd')), 'MACD 12 26 9');
    assert.equal(I.label(inst('stoch')), 'Stoch 14 1 3');
    const a = inst('ema'), b = JSON.parse(JSON.stringify(a)); b.colors.ma = '#000000';
    assert.equal(I.calcKey(a), I.calcKey(b));
    b.params.length = 10; assert.notEqual(I.calcKey(a), I.calcKey(b));
  });
});

describe('bt-ind: formulas', () => {
  const bars = candles(400), close = bars.map((b) => b.close);
  it('price sources', () => {
    const b = { open: 1, high: 4, low: 0, close: 2 };
    assert.deepEqual(I.SOURCES.map((s) => I.srcVal(b, s)), [2, 1, 4, 0, 2, 2, 7 / 4]);
  });
  it('SMA: mean of the last n, nothing before n values', () => {
    const o = run('sma', { length: 3 }, [1, 2, 3, 4, 5].map((c, i) => ({ time: i, open: c, high: c, low: c, close: c })));
    assert.deepEqual(o.ma, [null, null, 2, 3, 4]);
    sameArr(run('sma', { length: 20 }, bars).ma, refSma(close, 20), 'sma20');
    sameArr(run('sma', { length: 10, source: 'hlc3' }, bars).ma, refSma(bars.map((b) => (b.high + b.low + b.close) / 3), 10), 'sma hlc3');
  });
  it('EMA: seeded with the SMA of the first n values, then alpha 2/(n+1)', () => {
    const o = run('ema', { length: 3 }, [1, 2, 3, 4, 5, 6].map((c, i) => ({ time: i, open: c, high: c, low: c, close: c })));
    assert.deepEqual(o.ma, [null, null, 2, 3, 4, 5]);
    sameArr(run('ema', { length: 50 }, bars).ma, refEma(close, 50), 'ema50');
  });
  it('Bollinger: SMA middle, population deviation times the multiplier', () => {
    const o = run('bb', { length: 20, mult: 2 }, bars), mid = refSma(close, 20);
    sameArr(o.mid, mid, 'mid');
    for (let i = 19; i < bars.length; i++) {
      const w = close.slice(i - 19, i + 1), sd = Math.sqrt(w.reduce((a, x) => a + (x - mid[i]) ** 2, 0) / 20);
      assert.ok(near(o.up[i], mid[i] + 2 * sd) && near(o.lo[i], mid[i] - 2 * sd), 'band ' + i);
    }
    assert.equal(o.up[18], null);
  });
  it('RSI: Wilder smoothing of gains and losses; only rising = 100, only falling = 0', () => {
    const ch = close.map((c, i) => (i ? c - close[i - 1] : null));
    const ag = refRma(ch.map((d) => (d == null ? null : Math.max(d, 0))), 14), al = refRma(ch.map((d) => (d == null ? null : Math.max(-d, 0))), 14);
    const ref = ag.map((g, i) => (g == null || al[i] == null ? null : al[i] === 0 ? 100 : g === 0 ? 0 : 100 - 100 / (1 + g / al[i])));
    const o = run('rsi', { length: 14 }, bars);
    sameArr(o.rsi, ref, 'rsi'); assert.equal(o.rsi[13], null); assert.notEqual(o.rsi[14], null);
    for (const v of o.rsi) if (v != null) assert.ok(v >= 0 && v <= 100);
    const line = (k) => Array.from({ length: 30 }, (_, i) => { const c = 1 + k * i * 0.01; return { time: i, open: c, high: c, low: c, close: c }; });
    assert.equal(run('rsi', {}, line(1)).rsi[29], 100);
    assert.equal(run('rsi', {}, line(-1)).rsi[29], 0);
  });
  it('MACD: EMA(fast) - EMA(slow), EMA signal, histogram = MACD - signal', () => {
    const o = run('macd', {}, bars), m = refEma(close, 12).map((f, i) => { const s = refEma(close, 26)[i]; return f == null || s == null ? null : f - s; });
    sameArr(o.macd, m, 'macd');
    const sg = refEma(m, 9); sameArr(o.signal, sg, 'signal');
    sameArr(o.hist, m.map((x, i) => (x == null || sg[i] == null ? null : x - sg[i])), 'hist');
    assert.equal(o.macd[24], null); assert.notEqual(o.macd[25], null);
    assert.equal(o.signal[32], null); assert.notEqual(o.signal[33], null);
  });
  it('Stochastic: %K from the highest high / lowest low, smoothed, %D its SMA; a flat window keeps the last value', () => {
    const o = run('stoch', { length: 14, smooth: 3, d: 3 }, bars);
    const raw = bars.map((b, i) => {
      if (i < 13) return null;
      const w = bars.slice(i - 13, i + 1), hh = Math.max(...w.map((x) => x.high)), ll = Math.min(...w.map((x) => x.low));
      return 100 * (b.close - ll) / (hh - ll);
    });
    const k = refSma(raw, 3); sameArr(o.k, k, '%K'); sameArr(o.d, refSma(k, 3), '%D');
    const flat = Array.from({ length: 20 }, (_, i) => ({ time: i, open: 1, high: 1, low: 1, close: 1 }));
    assert.equal(run('stoch', { length: 5 }, flat).k[10], 50);
  });
  it('ATR: Wilder smoothing of the true range (the first candle: high - low)', () => {
    const tr = bars.map((b, i) => (i ? Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close)) : b.high - b.low));
    const o = run('atr', { length: 14 }, bars);
    sameArr(o.atr, refRma(tr, 14), 'atr'); assert.equal(o.atr[12], null); assert.notEqual(o.atr[13], null);
  });
});

describe('bt-ind: replay updates the tail only', () => {
  it('candle by candle (the last one growing, then new ones) gives the same values as one full computation', () => {
    const all = candles(220, 3);
    for (const type of I.TYPE_IDS) {
      const x = I.create(type), st = {}, live = [];
      for (let i = 0; i < all.length; i++) {
        const b = all[i];
        // the candle forms in three ticks: open only, half way, final
        live.push({ time: b.time, open: b.open, high: b.open, low: b.open, close: b.open });
        I.compute(x, live, live.length - 1, st);
        live[i] = { time: b.time, open: b.open, high: Math.max(b.open, (b.open + b.close) / 2), low: Math.min(b.open, (b.open + b.close) / 2), close: (b.open + b.close) / 2 };
        I.compute(x, live, i, st);
        live[i] = { ...b };
        I.compute(x, live, i, st);
      }
      const full = I.compute(x, all, 0, {});
      for (const k of Object.keys(full)) sameArr(st.out[k], full[k], type + '.' + k);
    }
  });
  it('a "from" past the computed values starts where the values end', () => {
    const all = candles(60), x = I.create('ema'), st = {};
    I.compute(x, all.slice(0, 30), 0, st);
    I.compute(x, all, 55, st);                  // 30..54 were never computed: computed now
    sameArr(st.out.ma, I.compute(x, all, 0, {}).ma, 'ema');
  });
});

describe('bt-ind: oscillator bands', () => {
  it('without oscillators the candles and the volume keep their old margins', () => {
    const a = I.margins(0, false), b = I.margins(0, true);
    assert.ok(near(a.main.top, 0.08) && near(a.main.bottom, 0.08));
    assert.ok(near(b.main.bottom, 0.2) && near(b.vol.top, 0.84) && near(b.vol.bottom, 0));
    assert.deepEqual(a.osc, []);
  });
  it('bands of 20% each (together at most half), stacked under the candles, every margin valid', () => {
    for (const n of [1, 2, 3, 5, 10]) for (const vol of [false, true]) {
      const m = I.margins(n, vol), h = Math.min(0.2, 0.5 / n);
      assert.ok(near(m.area, h * n) && m.area <= 0.5 + 1e-12);
      assert.ok(m.main.top + m.main.bottom < 1 && m.main.bottom >= m.area);
      m.osc.forEach((o, i) => {
        assert.ok(o.top + o.bottom < 1, 'margins leave room');
        assert.ok(near(o.y0, 1 - m.area + i * h) && near(o.y1, o.y0 + h));
        assert.ok(o.top >= o.y0 && 1 - o.bottom <= o.y1 + 1e-12, 'the series stays in its band');
      });
      if (vol) assert.ok(1 - m.vol.bottom <= 1 - m.area + 1e-12 && near(m.vol.bottom, m.area), 'volume sits right above the bands');
    }
  });
  it('colors: alpha and readable text', () => {
    assert.equal(I.withAlpha('#ff0000', 0.5), 'rgba(255,0,0,0.5)');
    assert.equal(I.onColor('#f59e0b'), '#111111'); assert.equal(I.onColor('#3b82f6'), '#ffffff');
  });
});
