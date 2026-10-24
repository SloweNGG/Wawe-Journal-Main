// Backtest v2: chart appearance (themes, plan gating, Heikin Ashi, sessions) of bt-look.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import '../public/interface/backtest/js/bt-look.js';

const K = globalThis.WwBtLook;
const near = (a, b) => Math.abs(a - b) < 1e-9;
function mem() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; }

describe('bt-look', () => {
  it('four presets, two of them free', () => {
    assert.deepEqual(K.PRESET_IDS, ['wawe', 'tradingview', 'mono', 'night']);
    assert.deepEqual(K.FREE_PRESETS, ['wawe', 'tradingview']);
    for (const light of [false, true]) for (const id of K.PRESET_IDS) {
      const p = K.presets(light)[id];
      assert.ok(K.STYLES.includes(p.style)); for (const k of K.SWITCHES) assert.equal(typeof p[k], 'boolean', id + ' ' + k);
    }
  });
  it('WaweJournal follows the site theme: no own background (pure black / white), shared grid', () => {
    const d = K.resolve(K.normalize({}), false, false);
    assert.equal(d.id, 'wawe'); assert.equal(d.bg, null); assert.equal(d.grid, null); assert.equal(d.up, '#22c55e');
    assert.equal(d.wickUp, d.up, 'missing wick/border colors fall back to the body color');
  });
  it('free plan: premium presets and every override are ignored; premium gets them', () => {
    const st = K.normalize({ preset: 'night', custom: { up: '#ffffff', style: 'heikin', showGrid: false } });
    const free = K.resolve(st, false, false), pro = K.resolve(st, false, true);
    assert.equal(free.id, 'wawe'); assert.equal(free.style, 'candles'); assert.equal(free.showGrid, true); assert.equal(free.up, '#22c55e');
    assert.equal(pro.id, 'night'); assert.equal(pro.style, 'heikin'); assert.equal(pro.up, '#ffffff'); assert.equal(pro.showGrid, false); assert.equal(pro.bg, '#0b1426');
    const tv = K.resolve(K.normalize({ preset: 'tradingview', custom: { up: '#000000' } }), true, false);
    assert.equal(tv.id, 'tradingview'); assert.equal(tv.up, '#26a69a', 'free TradingView, overrides dropped');
    assert.equal(K.needsPro(K.normalize({ preset: 'tradingview' })), false);
    assert.equal(K.needsPro(K.normalize({ preset: 'mono' })), true);
    assert.equal(K.needsPro(K.normalize({ preset: 'wawe', custom: { showVolume: true } })), true);
  });
  it('normalize drops bad values (unknown style, script in a color, too many saved themes)', () => {
    const saved = Array.from({ length: 20 }, (_, i) => ({ id: 's' + i, name: 'T' + i, look: { up: '#123456', down: 'url(x)' } }));
    const st = K.normalize({ preset: 'saved:s3', custom: { style: 'renko', up: 'javascript:1', down: 'rgba(1,2,3,0.5)', showGrid: 'yes' }, saved });
    assert.deepEqual(st.custom, { down: 'rgba(1,2,3,0.5)' });
    assert.equal(st.saved.length, K.MAX_SAVED); assert.deepEqual(st.saved[0].look, { up: '#123456' });
    assert.equal(st.preset, 'saved:s3');
    assert.equal(K.normalize({ preset: 'saved:nope' }).preset, 'wawe');
  });
  it('saved theme applies for premium, storage round trip', () => {
    const s = mem();
    K.save(s, { preset: 'saved:a', saved: [{ id: 'a', name: 'Mine', look: { style: 'bars', up: '#abcdef', showVolume: true } }] });
    const st = K.load(s);
    const lk = K.resolve(st, false, true);
    assert.equal(lk.style, 'bars'); assert.equal(lk.up, '#abcdef'); assert.equal(lk.showVolume, true); assert.equal(lk.down, '#ef4444');
    assert.equal(K.resolve(st, false, false).id, 'wawe');
    assert.equal(K.load({ getItem() { throw new Error('x'); } }).preset, 'wawe');
  });
  it('Heikin Ashi: formula and incremental tail update equal a full recompute', () => {
    const bars = [
      { time: 1, open: 10, high: 12, low: 9, close: 11 }, { time: 2, open: 11, high: 13, low: 10, close: 12 },
      { time: 3, open: 12, high: 12.5, low: 8, close: 9 }, { time: 4, open: 9, high: 10, low: 7, close: 8 }];
    const ha = K.heikinAshi(bars, 0, []);
    assert.ok(near(ha[0].close, 10.5) && near(ha[0].open, 10.5));
    assert.ok(near(ha[1].open, (ha[0].open + ha[0].close) / 2) && near(ha[1].close, 11.5));
    assert.ok(ha.every((h, i) => h.high >= Math.max(h.open, h.close, bars[i].high) - 1e-12 && h.low <= Math.min(h.open, h.close, bars[i].low) + 1e-12));
    const part = K.heikinAshi(bars.slice(0, 3), 0, []);
    bars[2] = { time: 3, open: 12, high: 14, low: 8, close: 13.5 };     // the last candle keeps changing during the replay
    K.heikinAshi(bars, 2, part);
    assert.deepEqual(part, K.heikinAshi(bars, 0, []));
  });
  it('sessions: London and New York overlap in the afternoon, weekends empty, DST followed', () => {
    assert.deepEqual(K.sessionsAt(Date.UTC(2026, 9, 21, 13, 0) / 1000), ['london', 'ny']);     // Wed 13:00 UTC
    assert.deepEqual(K.sessionsAt(Date.UTC(2026, 9, 21, 2, 0) / 1000), ['asia']);
    assert.deepEqual(K.sessionsAt(Date.UTC(2026, 9, 24, 13, 0) / 1000), []);                   // Saturday
    assert.deepEqual(K.sessionsAt(Date.UTC(2026, 6, 15, 7, 30) / 1000), ['asia', 'london']);   // BST: London opens 07:00 UTC, Tokyo still open
    assert.deepEqual(K.sessionsAt(Date.UTC(2026, 0, 14, 7, 30) / 1000), ['asia']);              // GMT: not yet (Tokyo until 09:00 UTC)
  });
  it('series options: hollow candles, line color, last price switch; colors for the color input', () => {
    const lk = K.resolve(K.normalize({ preset: 'mono' }), false, true);
    const o = K.seriesOptions(lk, { type: 'price' });
    assert.equal(o.upColor, 'rgba(0,0,0,0)'); assert.equal(o.borderUpColor, '#f5f5f5'); assert.equal(o.lastValueVisible, true);
    const ln = K.seriesOptions(Object.assign({}, lk, { style: 'line', showLastPrice: false }), {});
    assert.equal(ln.color, lk.up); assert.equal(ln.priceLineVisible, false);
    const ha = K.seriesOptions(Object.assign({}, lk, { style: 'heikin', showLastPrice: true }), {});
    assert.equal(ha.lastValueVisible, false, 'Heikin Ashi: the averaged close is not shown as the last price (the page draws the real bid)');
    assert.equal(K.withAlpha('#22c55e', 0.4), 'rgba(34,197,94,0.4)'); assert.equal(K.withAlpha('rgba(1,2,3,1)', 0.4), 'rgba(1,2,3,1)');
    assert.equal(K.toHex('rgba(42,46,57,0.6)'), '#2a2e39'); assert.equal(K.toHex('#abc'), '#aabbcc'); assert.equal(K.toHex(null, '#000000'), '#000000');
    assert.deepEqual(K.toSeriesData({ style: 'line' }, [{ time: 1, close: 5 }]), [{ time: 1, value: 5 }]);
  });
});
