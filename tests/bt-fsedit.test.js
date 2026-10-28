// Backtest v2: arranging the full-screen chart (public/interface/backtest/js/bt-fsedit.js) — pure helpers. Dragging, the box list
// and the floating windows need the DOM (browser).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

await import('../public/interface/backtest/js/bt-fsedit.js');
const FE = globalThis.WwBtFsEdit, M = FE.MARGIN;
const it_ = (id) => FE.ITEMS.find((i) => i.id === id);

describe('bt-fsedit', () => {
  it('the boxes and the windows that can be added', () => {
    assert.deepEqual(FE.ITEMS.map((i) => i.id), ['toolbar', 'stats', 'order', 'draw', 'legend', 'open', 'orders', 'history', 'statsw']);
    assert.deepEqual(FE.ITEMS.filter((i) => i.win).map((i) => i.win), ['open', 'orders', 'history', 'stats'], 'desk window ids');
    assert.ok(it_('draw').keepSize, 'the drawing bar keeps its size (its buttons follow its height)');
  });
  it('shown: boxes unless hidden, windows once added', () => {
    const st = FE.sanitize(null);
    assert.ok(FE.isShown(st, 'order') && !FE.isShown(st, 'open'));
    const st2 = FE.sanitize({ vis: { order: false, open: true, foo: true, history: 'yes' } });
    assert.deepEqual(st2.vis, { order: false, open: true });
    assert.ok(!FE.isShown(st2, 'order') && FE.isShown(st2, 'open') && !FE.isShown(st2, 'history') && !FE.isShown(st2, 'foo'));
  });
  it('position <-> fraction of the free room; edges are 0 and 1', () => {
    assert.deepEqual(FE.toRatio(M, M, 200, 100, 1000, 800), { x: 0, y: 0 });
    assert.deepEqual(FE.toRatio(1000 - 200 - M, 800 - 100 - M, 200, 100, 1000, 800), { x: 1, y: 1 });
    const r = FE.toRatio(400, 300, 200, 100, 1000, 800);
    assert.deepEqual(FE.fromRatio(r, 200, 100, 1000, 800), { left: 400, top: 300 });
  });
  it('a box in the right corner stays in the right corner of a smaller window', () => {
    const r = FE.toRatio(1000 - 250 - M, 800 - 300 - M, 250, 300, 1000, 800);
    assert.deepEqual(FE.fromRatio(r, 250, 300, 600, 500), { left: 600 - 250 - M, top: 500 - 300 - M });
  });
  it('never off screen; a box larger than the window sits at the edge', () => {
    assert.deepEqual(FE.toRatio(-50, 5000, 200, 100, 1000, 800), { x: 0, y: 1 });
    assert.deepEqual(FE.fromRatio({ x: 0.7, y: 0.7 }, 1200, 900, 1000, 800), { left: M, top: M });
  });
  it('window size: stored or first size, at least the minimum, at most the screen', () => {
    assert.deepEqual(FE.winSize(it_('open'), null, 1600, 900), { w: 560, h: 220 });
    assert.deepEqual(FE.winSize(it_('open'), { x: 0, y: 0, w: 700, h: 300 }, 1600, 900), { w: 700, h: 300 });
    assert.deepEqual(FE.winSize(it_('open'), { x: 0, y: 0, w: 50, h: 20 }, 1600, 900), { w: 240, h: 110 });
    assert.deepEqual(FE.winSize(it_('history'), { x: 0, y: 0, w: 3000, h: 3000 }, 1000, 600), { w: 1000 - 2 * M, h: 600 - 2 * M });
  });
  it('stored state: known boxes, numbers clamped, sizes for windows only; the first version (positions alone) still loads', () => {
    assert.deepEqual(FE.sanitize({ pos: { toolbar: { x: 0.5, y: 2, w: 300, h: 40 }, order: { x: 'a', y: 0 }, foo: { x: 0, y: 0 }, open: { x: -1, y: 0.25, w: 600, h: 250 } } }).pos,
      { toolbar: { x: 0.5, y: 1 }, open: { x: 0, y: 0.25, w: 600, h: 250 } });
    assert.deepEqual(FE.sanitize({ toolbar: { x: 0.2, y: 0.9 } }), { pos: { toolbar: { x: 0.2, y: 0.9 } }, vis: {} });
    assert.deepEqual(FE.sanitize(null), { pos: {}, vis: {} });
    assert.deepEqual(FE.sanitize('x'), { pos: {}, vis: {} });
  });
});
