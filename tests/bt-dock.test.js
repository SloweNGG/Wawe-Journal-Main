// Backtest v2: movable panels (bt-dock.js) and statistics widgets (bt-stats.js layout model): the pure parts.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { plain } from './helpers/bt-env.js';

await import('../public/interface/backtest/js/bt-dock.js');
const D = globalThis.WwBtDock;
globalThis.WwMetrics = globalThis.WwMetrics || {};
await import('../public/interface/backtest/js/bt-stats.js');
const ST = globalThis.WwBtStats;

const all = (p) => D.ZONES.flatMap((z) => p.zones[z]);
const R = (left, top, width, height) => ({ left, top, width, height });

describe('bt-dock layout model', () => {
  it('defaults: chart in the middle, balance and orders right, tabs (and detached stats) below; old panel sizes are taken over', () => {
    const d = D.defaults({ sideW: 400, bottomH: 300 });
    assert.deepEqual(plain(d.zones), { top: [], left: [], center: ['chart'], right: ['balance', 'order'], bottom: ['tabs', 'stats'] });
    assert.equal(d.size.right, 400); assert.equal(d.size.bottom, 300);
    assert.equal(d.statsDetached, false);
  });
  it('normalize: each panel exactly once, unknown ids dropped, the chart is never hidden, sizes and weights clamped', () => {
    const n = D.normalize({ v: 1, zones: { top: ['order', 'chart', 'x'], left: ['chart'], center: [], right: ['balance', 'balance'], bottom: [] }, hidden: ['chart', 'tabs', 'nope'],
      size: { left: 5, right: 9999, top: 'a' }, weight: { chart: 100, tabs: -3 } });
    assert.deepEqual(all(n).slice().sort(), D.PANELS.slice().sort());
    assert.deepEqual(plain(n.zones.top), ['order', 'chart']);
    assert.deepEqual(plain(n.hidden), ['tabs']);
    assert.equal(n.size.left, D.SIZE.left.min); assert.equal(n.size.right, D.SIZE.right.max); assert.equal(n.size.top, D.SIZE.top.def);
    assert.equal(n.weight.chart, 10); assert.equal(n.weight.tabs, 0.2);
  });
  it('a stored layout of another version starts from the defaults', () => {
    assert.deepEqual(plain(D.normalize({ v: 99, zones: { left: ['chart'] } }).zones), plain(D.defaults().zones));
    assert.deepEqual(plain(D.normalize(null).zones), plain(D.defaults().zones));
  });
  it('move: to another zone at a position; moving a hidden panel shows it', () => {
    let p = D.defaults();
    p = D.move(p, 'order', 'left', 0);
    assert.deepEqual(plain(p.zones.left), ['order']); assert.deepEqual(plain(p.zones.right), ['balance']);
    p = D.move(p, 'balance', 'left', 0);
    assert.deepEqual(plain(p.zones.left), ['balance', 'order']);
    p = D.move(p, 'chart', 'left', 99);
    assert.deepEqual(plain(p.zones.left), ['balance', 'order', 'chart']); assert.deepEqual(plain(p.zones.center), []);
    p = D.setHidden(p, 'tabs', true); assert.deepEqual(plain(p.hidden), ['tabs']);
    p = D.move(p, 'tabs', 'top', 0); assert.deepEqual(plain(p.hidden), []);
    assert.deepEqual(all(p).slice().sort(), D.PANELS.slice().sort());
  });
  it('setHidden ignores the chart', () => {
    assert.deepEqual(plain(D.setHidden(D.defaults(), 'chart', true).hidden), []);
  });
  it('effective: simple mode is fixed (chart, balance, orders); advanced shows the zones without hidden panels, stats only when detached', () => {
    let p = D.move(D.defaults(), 'tabs', 'left', 0);
    assert.deepEqual(plain(D.effective(p, { mode: 'simple' })), { top: [], left: [], center: ['chart'], right: ['balance', 'order'], bottom: [] });
    assert.deepEqual(plain(D.effective(p, { mode: 'advanced' }).left), ['tabs']);
    assert.deepEqual(plain(D.effective(p, { mode: 'advanced' }).bottom), []);
    p.statsDetached = true;
    assert.deepEqual(plain(D.effective(p, { mode: 'advanced' }).bottom), ['stats']);
    p = D.setHidden(p, 'balance', true);
    assert.deepEqual(plain(D.effective(p, { mode: 'advanced' }).right), ['order']);
  });
  it('dropTarget: near an empty edge -> that zone with a strip preview; over a panel -> before/after it; outside -> null', () => {
    const box = R(0, 0, 1200, 800), zones = { center: R(0, 0, 850, 550), right: R(860, 0, 340, 800), bottom: R(0, 560, 850, 240) };
    const panels = { center: [{ id: 'chart', rect: R(0, 0, 850, 550) }], right: [{ id: 'balance', rect: R(860, 0, 340, 150) }, { id: 'order', rect: R(860, 160, 340, 400) }], bottom: [{ id: 'tabs', rect: R(0, 560, 850, 240) }] };
    const left = D.dropTarget(box, zones, panels, { x: 10, y: 300 }, { left: 320 });
    assert.equal(left.zone, 'left'); assert.equal(left.index, 0); assert.equal(left.rect.left, 0); assert.equal(left.rect.width, 320);
    const top = D.dropTarget(box, zones, panels, { x: 600, y: 8 }, {});
    assert.equal(top.zone, 'top'); assert.equal(top.rect.height, 220);
    const beforeOrder = D.dropTarget(box, zones, panels, { x: 1000, y: 200 });
    assert.equal(beforeOrder.zone, 'right'); assert.equal(beforeOrder.index, 1); assert.equal(beforeOrder.rect.top, 160); assert.equal(beforeOrder.rect.height, 200);
    const afterOrder = D.dropTarget(box, zones, panels, { x: 1000, y: 500 });
    assert.equal(afterOrder.index, 2); assert.equal(afterOrder.rect.top, 360);
    const row = D.dropTarget(box, zones, panels, { x: 600, y: 700 });
    assert.equal(row.zone, 'bottom'); assert.equal(row.index, 1); assert.equal(row.rect.left, 425);   // right half of the tabs: after them
    const rightEdgeFull = D.dropTarget(box, zones, panels, { x: 1190, y: 50 });
    assert.equal(rightEdgeFull.zone, 'right'); assert.equal(rightEdgeFull.index, 0);                  // a full edge zone: like hovering its panels
    assert.equal(D.dropTarget(box, zones, panels, { x: 1300, y: 50 }), null);
  });
});

describe('bt-dock multi-chart grid', () => {
  it('defaults per layout: 1+3 has a wide main column; order is the identity', () => {
    assert.deepEqual(plain(D.multiDefault('1+3')), { cols: [2, 1], rows: [1, 1, 1], order: [0, 1, 2, 3] });
    assert.deepEqual(plain(D.multiDefault('2h')), { cols: [1, 1], rows: [1], order: [0, 1] });
  });
  it('normalizeMulti: wrong lengths or a broken order fall back, fractions are clamped', () => {
    assert.deepEqual(plain(D.normalizeMulti('2x2', { cols: [1], rows: [100, 0], order: [0, 0, 1, 2] })), { cols: [1, 1], rows: [6, 0.15], order: [0, 1, 2, 3] });
    assert.deepEqual(plain(D.normalizeMulti('2x2', { order: [3, 2, 1, 0] }).order), [3, 2, 1, 0]);
  });
  it('swapViews and cellArea: the main chart (view 0) can take any slot, also the big one of 1+3', () => {
    let m = D.multiDefault('1+3');
    assert.equal(D.cellArea('1+3', m, 0), '1 / 1 / 4 / 2');
    m = D.swapViews(m, 0, 2);
    assert.deepEqual(plain(m.order), [2, 1, 0, 3]);
    assert.equal(D.cellArea('1+3', m, 2), '1 / 1 / 4 / 2'); assert.equal(D.cellArea('1+3', m, 0), '2 / 2 / 3 / 3');
  });
  it('resizeTracks moves size between two neighbours and keeps each at least 0.15', () => {
    const tr = D.resizeTracks([1, 1], 0, 200, 800);          // 200 px of 800 px = a quarter of the total (2) = 0.5
    assert.deepEqual(tr.map((x) => Math.round(x * 100) / 100), [1.5, 0.5]);
    assert.deepEqual(D.resizeTracks([1, 1], 0, 5000, 800).map((x) => Math.round(x * 100) / 100), [1.85, 0.15]);
    assert.equal(D.template([2, 1]), 'minmax(0, 2fr) minmax(0, 1fr)');
  });
});

describe('bt-dock storage', () => {
  it('per user key; a broken value gives the defaults; the old layout sizes are used once', () => {
    const mem = {}, st = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
    mem.ww_bt_layout_v1 = JSON.stringify({ sideW: 420 });
    assert.equal(D.load(st, 'u1').size.right, 420);
    const p = D.move(D.load(st, 'u1'), 'order', 'left', 0);
    D.save(st, 'u1', p);
    assert.ok(mem['ww_bt_dock_v1:u1']);
    assert.deepEqual(plain(D.load(st, 'u1').zones.left), ['order']);
    assert.deepEqual(plain(D.load(st, 'u2').zones.left), []);          // another user: own layout
    mem['ww_bt_dock_v1:u1'] = '{broken';
    assert.deepEqual(plain(D.load(st, 'u1').zones.left), []);
  });
});

describe('bt-stats widgets', () => {
  it('free: key figures, balance curve and the teaser; Premium: every chart, no teaser', () => {
    assert.deepEqual(plain(ST.widgetIds(false)), ['kpis', 'balance', 'teaser']);
    assert.deepEqual(plain(ST.widgetIds(true)), ['kpis', 'balance', 'drawdown', 'rdist', 'equity', 'sessions', 'monthly']);
  });
  it('normalizeWidgets: unknown and duplicate ids dropped, missing ones back at their default place, sizes clamped', () => {
    const l = ST.normalizeWidgets({ order: ['monthly', 'x', 'kpis', 'monthly'], hidden: ['rdist', 'rdist', 'zz'], size: { balance: { w: 9, h: 5000 }, kpis: { w: 2, h: 0 } } });
    assert.deepEqual(plain(l.order.slice(0, 2)), ['monthly', 'kpis']);
    assert.equal(l.order.length, ST.WIDGETS.length); assert.equal(new Set(l.order).size, ST.WIDGETS.length);
    assert.equal(l.order.indexOf('balance'), l.order.indexOf('kpis') + 1);
    assert.deepEqual(plain(l.hidden), ['rdist']);
    assert.deepEqual(plain(l.size.balance), { w: 4, h: 760 });
    assert.deepEqual(plain(l.size.kpis), { w: 2, h: 0 });
    assert.deepEqual(plain(ST.normalizeWidgets(null).order), ST.WIDGETS.map((w) => w.id));
  });
  it('columns by width and spans', () => {
    assert.equal(ST.columnsFor(1200), 4); assert.equal(ST.columnsFor(700), 2); assert.equal(ST.columnsFor(390), 1);
    assert.equal(ST.spanFor(2, 4), 2); assert.equal(ST.spanFor(4, 2), 2); assert.equal(ST.spanFor(1, 2), 1); assert.equal(ST.spanFor(3, 1), 1);
  });
});
