// Analiz: dokunmatik cihazda SortableJS sayfa yüklendikten sonra boşta önden iner (perf 3b); fareli masaüstünde
// yalnızca düzenleme niyetinde (perf 2c, değişmedi). Önceden ilk dokunuş kütüphaneyi indiriyor, sürüklemeyi başlatamıyordu.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const dm = fs.readFileSync('public/interface/analytics/js/dashboard-manager.js', 'utf8');
const block = dm.slice(dm.indexOf('var touchPreloadTimer = null;'), dm.indexOf('// Düzenleme niyeti: SortableJS'));

function setup({ touch = false, maxTouchPoints = 0, ric = true, readyState = 'complete' } = {}) {
  const calls = { load: 0, ric: [], timeouts: [], listeners: {} };
  const win = {
    matchMedia: (q) => ({ matches: q === '(any-pointer: coarse)' && touch }),
    addEventListener: (ev, fn) => { calls.listeners[ev] = fn; },
    removeEventListener: (ev) => { delete calls.listeners[ev]; },
  };
  if (ric) {
    win.requestIdleCallback = (fn, opts) => { calls.ric.push({ fn, opts }); return calls.ric.length; };
    win.cancelIdleCallback = () => {};
  }
  const ctx = {
    window: win, navigator: { maxTouchPoints }, document: { readyState },
    sortableInstance: null,
    loadDragDrop: () => { calls.load++; },
    setTimeout: (fn, ms) => { calls.timeouts.push({ fn, ms }); return calls.timeouts.length; },
    clearTimeout: () => {},
  };
  vm.runInNewContext(block + '\nthis.preloadOnTouch = preloadOnTouch;', ctx);
  return { ctx, calls };
}

describe('SortableJS preload on touch devices', () => {
  it('mouse-only desktop: nothing is scheduled (loads only on editing intent, as before)', () => {
    const { ctx, calls } = setup();
    ctx.preloadOnTouch({ isConnected: true });
    assert.equal(calls.ric.length + calls.timeouts.length, 0);
    assert.equal(calls.load, 0);
    assert.equal(calls.listeners.load, undefined);
  });

  it('touch device, page loaded: requestIdleCallback (3 s timeout), then loads once', () => {
    const { ctx, calls } = setup({ touch: true });
    const grid = { isConnected: true };
    ctx.preloadOnTouch(grid);
    ctx.preloadOnTouch(grid);   // renderWidgets → initDragDrop tekrar çağrılabilir
    assert.equal(calls.ric.length, 1);
    assert.equal(calls.ric[0].opts.timeout, 3000);
    calls.ric[0].fn();
    assert.equal(calls.load, 1);
  });

  it('maxTouchPoints alone counts as touch; without requestIdleCallback falls back to setTimeout', () => {
    const { ctx, calls } = setup({ maxTouchPoints: 5, ric: false });
    ctx.preloadOnTouch({ isConnected: true });
    assert.equal(calls.timeouts.length, 1);
    assert.equal(calls.timeouts[0].ms, 1500);
    calls.timeouts[0].fn();
    assert.equal(calls.load, 1);
  });

  it('page still loading: waits for the load event, then idle', () => {
    const { ctx, calls } = setup({ touch: true, readyState: 'interactive' });
    ctx.preloadOnTouch({ isConnected: true });
    assert.equal(calls.ric.length, 0);
    assert.equal(typeof calls.listeners.load, 'function');
    calls.listeners.load();
    assert.equal(calls.ric.length, 1);
    calls.ric[0].fn();
    assert.equal(calls.load, 1);
  });

  it('grid gone (SPA left the page) or Sortable already bound: no load', () => {
    const a = setup({ touch: true });
    a.ctx.preloadOnTouch({ isConnected: false });
    a.calls.ric[0].fn();
    assert.equal(a.calls.load, 0);
    const b = setup({ touch: true });
    b.ctx.preloadOnTouch({ isConnected: true });
    b.ctx.sortableInstance = {};
    b.calls.ric[0].fn();
    assert.equal(b.calls.load, 0);
  });

  it('initDragDrop arms intent and touch preload; leaving the page cancels a pending preload', () => {
    assert.match(dm, /armDragIntent\(grid\);\s*preloadOnTouch\(grid\);/);
    assert.match(dm, /export function destroyDragDrop\(\) \{\s*if \(touchPreloadTimer\) \{\s*touchPreloadTimer\.cancel\(touchPreloadTimer\.id\);/);
  });
});
