// Backtest v2: layout preferences (simple / advanced mode, panel sizes) of bt-layout.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import '../public/interface/backtest/js/bt-layout.js';

const L = globalThis.WwBtLayout;
function mem(init) { const m = new Map(Object.entries(init || {})); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }; }

describe('bt-layout', () => {
  it('normalize: defaults, ranges, unknown mode stays undecided', () => {
    assert.deepEqual(L.normalize(null), { mode: null, sideW: 340, bottomH: 240, charts: '1', tfs: [] });
    const p = L.normalize({ mode: 'x', sideW: 5000, bottomH: -3, charts: '2x2', tfs: ['1h', 2, '4h', '1d', '5m', '15m'] });
    assert.equal(p.mode, null); assert.equal(p.sideW, L.SIDE.max); assert.equal(p.bottomH, L.BOTTOM.min);
    assert.equal(p.charts, '2x2'); assert.deepEqual(p.tfs, ['1h', '4h', '1d', '5m']);
    assert.equal(L.normalize({ sideW: 'NaN' }).sideW, 340);
  });
  it('load/save round trip; broken JSON and throwing storage fall back to defaults', () => {
    const s = mem();
    assert.equal(L.load(s).mode, null);
    assert.ok(L.save(s, { mode: 'advanced', sideW: 400, bottomH: 300 }));
    assert.deepEqual(L.load(s), { mode: 'advanced', sideW: 400, bottomH: 300, charts: '1', tfs: [] });
    assert.equal(L.load(mem({ [L.KEY]: '{bad' })).sideW, 340);
    const boom = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    assert.equal(L.load(boom).mode, null); assert.equal(L.save(boom, {}), false);
    assert.equal(L.load(null).bottomH, 240);
  });
  it('default mode: simple for a new user, advanced for someone who already has accounts', () => {
    assert.equal(L.defaultMode(0), 'simple'); assert.equal(L.defaultMode(2), 'advanced');
  });
  it('panel sizes fit the space the chart needs', () => {
    assert.equal(L.fitSide(500, 1400), 500);
    assert.equal(L.fitSide(500, 760), 400);           // chart keeps 360 px
    assert.equal(L.fitSide(100, 1400), L.SIDE.min);
    assert.equal(L.fitSide(500, 300), L.SIDE.min);    // never below the minimum
    assert.equal(L.fitBottom(600, 700), 500);         // chart keeps 200 px
    assert.equal(L.fitBottom(10, 900), L.BOTTOM.min);
  });
  it('shortcut list: unique ids, drawing keys marked advanced', () => {
    const ids = L.SHORTCUTS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ['tools', 'cursor', 'magnet', 'delete_drawing']) assert.ok(L.SHORTCUTS.find((s) => s.id === id).advanced);
    for (const id of ['play', 'step', 'fullscreen', 'exit', 'sheet']) assert.ok(!L.SHORTCUTS.find((s) => s.id === id).advanced);
  });
});
