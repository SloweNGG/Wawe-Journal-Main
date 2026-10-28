// Backtest v2: the replay screen as a desktop (bt-desk.js): windows, snapping, magnet, presets, named layouts, storage. Pure parts.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

await import('../public/interface/backtest/js/bt-desk.js');
const D = globalThis.WwBtDesk;
const desk = { w: 1400, h: 700 };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

describe('bt-desk layout model', () => {
  it('default = the Classic preset: every window once, statistics closed, history in the taskbar, charts never closed', () => {
    const d = D.defaults(desk);
    assert.deepEqual(Object.keys(d.wins).sort(), D.WINS.slice().sort());
    assert.equal(d.preset, 'classic');
    assert.equal(d.wins.stats.closed, true); assert.equal(d.wins.history.st, 'min');
    for (const id of D.CHARTS) assert.equal(d.wins[id].closed, false, id);
    assert.deepEqual(d.z.slice().sort(), D.WINS.slice().sort());
    const r = D.fit(D.toPx(d.wins.replay, desk), desk, 'replay');
    assert.ok(r.h >= D.MIN.replay[1] && r.x === 4 && r.y === 4 && r.w === desk.w - 8, 'replay across the top with a 4 px margin, at least its minimum height ' + JSON.stringify(r));
  });
  it('normalize: anything stored is checked (unknown version, numbers, states, charts cannot be closed, z order complete)', () => {
    assert.deepEqual(D.normalize(null).preset, 'classic');
    assert.deepEqual(D.normalize({ v: 99 }).preset, 'classic');
    const n = D.normalize({ v: 1, wins: { chart: { x: -1, y: 'a', w: 9, h: 0.5, st: 'weird', closed: true }, order: { x: 0.1, y: 0.1, w: 0.2, h: 0.3, st: 'max', closed: true,
      prev: { x: 0.5, y: 0.5, w: 0.3, h: 0.3 } } }, z: ['order', 'nope', 'order'], saved: [{ name: '  Mine  ', wins: {} }, { name: 'mine' }, { name: '' }], preset: 'x',
      multi: { '2x2': { cols: [1, 99], rows: [1], order: [0, 1, 2, 2] } } });
    const step = Math.round((D.DRAW_W + D.GAP) / 1400 * 10000) / 10000;   // a layout from before the drawing tools window: it takes the chart's left edge
    assert.deepEqual(n.wins.chart, { x: step, y: D.defaults().wins.chart.y, w: Math.round((1 - step) * 10000) / 10000, h: 0.5, st: 'normal', closed: false });
    assert.deepEqual(n.wins.draw, { x: 0, y: n.wins.chart.y, w: Math.round(D.DRAW_W / 1400 * 10000) / 10000, h: 0.5, st: 'normal', closed: false });
    assert.equal(n.wins.order.st, 'max'); assert.equal(n.wins.order.closed, true); assert.deepEqual(n.wins.order.prev, { x: 0.5, y: 0.5, w: 0.3, h: 0.3 });
    assert.equal(n.z[n.z.length - 1], 'order'); assert.equal(n.z.length, D.WINS.length);
    assert.deepEqual(n.saved.map((s) => s.name), ['Mine'], 'trimmed, case-insensitive unique, no empty name');
    assert.equal(n.preset, null);
    assert.deepEqual(n.multi['2x2'], { cols: [1, 6], rows: [1, 1], order: [0, 1, 2, 3] });
  });
  it('px <-> fractions, fit: minimum size and inside the desk', () => {
    const f = D.toFrac({ x: 140, y: 70, w: 700, h: 350 }, desk);
    assert.deepEqual(f, { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }); assert.deepEqual(D.toPx(f, desk), { x: 140, y: 70, w: 700, h: 350 });
    assert.deepEqual(D.fit({ x: 1300, y: -40, w: 50, h: 20 }, desk, 'order'), { x: 1400 - D.MIN.order[0], y: 0, w: D.MIN.order[0], h: D.MIN.order[1] });
    assert.deepEqual(D.fit({ x: 0, y: 0, w: 5000, h: 5000 }, { w: 300, h: 200 }, 'chart'), { x: 0, y: 0, w: 300, h: 200 }, 'a desk smaller than the minimum');
  });
  it('snap zones: sides = half, top = whole desk, corners = quarter; the zone rects keep the margin', () => {
    assert.equal(D.snapZone({ x: 3, y: 350 }, desk), 'left'); assert.equal(D.snapZone({ x: 1399, y: 350 }, desk), 'right');
    assert.equal(D.snapZone({ x: 700, y: 2 }, desk), 'top'); assert.equal(D.snapZone({ x: 2, y: 10 }, desk), 'tl');
    assert.equal(D.snapZone({ x: 1395, y: 690 }, desk), 'br'); assert.equal(D.snapZone({ x: -30, y: 650 }, desk), 'bl', 'beyond the edge counts');
    assert.equal(D.snapZone({ x: 700, y: 350 }, desk), null);
    assert.deepEqual(D.zoneRect('left', desk), { x: 4, y: 4, w: 692, h: 692 });
    assert.deepEqual(D.zoneRect('br', desk), { x: 704, y: 354, w: 692, h: 342 });
    assert.equal(D.zoneRect('nowhere', desk), null);
  });
  it('magnet: desk edges, side by side with the gap, aligned edges; nothing beyond 10 px', () => {
    const o = [{ x: 400, y: 100, w: 300, h: 200 }];
    assert.deepEqual(D.magnetMove({ x: 9, y: 300, w: 200, h: 100 }, [], desk), { x: 4, y: 300, w: 200, h: 100 }, 'left desk edge');
    assert.deepEqual(D.magnetMove({ x: 712, y: 330, w: 200, h: 100 }, o, desk), { x: 708, y: 330, w: 200, h: 100 }, 'right of the other window, gap 8');
    assert.deepEqual(D.magnetMove({ x: 712, y: 302, w: 200, h: 100 }, o, desk), { x: 708, y: 308, w: 200, h: 100 }, 'and below it with the gap');
    assert.deepEqual(D.magnetMove({ x: 150, y: 106, w: 240, h: 100 }, o, desk), { x: 152, y: 100, w: 240, h: 100 }, 'top edges aligned, right edge next to it');
    assert.deepEqual(D.magnetMove({ x: 150, y: 450, w: 100, h: 100 }, o, desk), { x: 150, y: 450, w: 100, h: 100 }, 'far: unchanged');
    assert.deepEqual(D.magnetResize({ x: 50, y: 50, w: 343, h: 100 }, 'e', o, desk), { x: 50, y: 50, w: 342, h: 100 }, 'right edge to the other window minus the gap');
    assert.deepEqual(D.magnetResize({ x: 50, y: 98, w: 100, h: 100 }, 'n', o, desk), { x: 50, y: 100, w: 100, h: 98 }, 'top edge to the other top');
  });
  it('resize from any edge or corner keeps the minimum size and the opposite edge', () => {
    const r = { x: 100, y: 100, w: 400, h: 300 };
    assert.deepEqual(D.resizeBy(r, 'se', 50, -20, [200, 150]), { x: 100, y: 100, w: 450, h: 280 });
    assert.deepEqual(D.resizeBy(r, 'nw', 30, 40, [200, 150]), { x: 130, y: 140, w: 370, h: 260 });
    assert.deepEqual(D.resizeBy(r, 'w', 390, 0, [200, 150]), { x: 300, y: 100, w: 200, h: 300 }, 'west edge stops at the minimum width, right edge stays');
    assert.deepEqual(D.resizeBy(r, 'n', 0, 999, [200, 150]), { x: 100, y: 250, w: 400, h: 150 });
  });
  it('multi-chart tiles share the area with gaps (2 side by side, 2x2, 1 + 3)', () => {
    const a = { x: 0, y: 0, w: 808, h: 408 };
    assert.deepEqual(D.tile('2h', a), [{ x: 0, y: 0, w: 400, h: 408 }, { x: 408, y: 0, w: 400, h: 408 }]);
    assert.deepEqual(D.tile('2x2', a).map((r) => [r.x, r.y, r.w, r.h]), [[0, 0, 400, 200], [408, 0, 400, 200], [0, 208, 400, 200], [408, 208, 400, 200]]);
    const t = D.tile('1+3', { x: 0, y: 0, w: 808, h: 616 });
    assert.equal(t[0].h, 616, 'the big chart spans three rows'); assert.equal(t.length, 4); assert.equal(t[3].y + t[3].h, 616);
    assert.deepEqual(D.bbox([{ x: 10, y: 20, w: 5, h: 5 }, { x: 0, y: 30, w: 50, h: 10 }]), { x: 0, y: 20, w: 50, h: 20 });
    const ta = D.tileArea('1+3', { x: 4, y: 600, w: 1000, h: 300 }, desk);
    assert.ok(ta.h >= 3 * D.MIN.chart2[1] + 2 * D.GAP && ta.y + ta.h <= desk.h - 4, 'grown to fit three rows, still inside the desk ' + JSON.stringify(ta));
    assert.ok(D.tile('1+3', ta).every((r, i) => r.h >= D.MIN[D.CHARTS[i]][1] && r.w >= D.MIN[D.CHARTS[i]][0]), 'no tile below its minimum');
  });
  it('maximize / restore keep the free size, minimize, close (charts only minimize), open brings to the front', () => {
    let l = D.defaults(desk);
    const free = { x: l.wins.order.x, y: l.wins.order.y, w: l.wins.order.w, h: l.wins.order.h };
    l = D.maximize(l, 'order');
    assert.equal(l.wins.order.st, 'max'); assert.deepEqual(l.wins.order.prev, free); assert.equal(l.z[l.z.length - 1], 'order');
    l = D.maximize(l, 'order');
    assert.equal(l.wins.order.st, 'normal'); assert.equal(l.wins.order.prev, undefined); assert.equal(l.wins.order.w, free.w, 'double click again restores');
    l = D.minimize(l, 'balance'); assert.equal(l.wins.balance.st, 'min');
    l = D.open(l, 'balance'); assert.equal(l.wins.balance.st, 'normal'); assert.equal(l.z[l.z.length - 1], 'balance');
    l = D.close(l, 'open'); assert.equal(l.wins.open.closed, true);
    l = D.close(l, 'chart'); assert.equal(l.wins.chart.closed, false); assert.equal(l.wins.chart.st, 'min', 'the chart window only minimizes');
    l = D.open(l, 'open'); assert.equal(l.wins.open.closed, false);
    assert.equal(D.front(l, 'replay').z.slice(-1)[0], 'replay');
    assert.equal(l.preset, null, 'a change leaves the preset');
  });
  it('snap to a zone remembers the free size; top = maximized', () => {
    let l = D.defaults(desk);
    const before = { x: l.wins.balance.x, y: l.wins.balance.y, w: l.wins.balance.w, h: l.wins.balance.h };
    l = D.snapTo(l, 'balance', 'left', desk);
    assert.deepEqual(D.toPx(l.wins.balance, desk), D.zoneRect('left', desk)); assert.deepEqual(l.wins.balance.prev, before);
    l = D.snapTo(l, 'balance', 'tr', desk);
    assert.deepEqual(l.wins.balance.prev, before, 'snapping again keeps the first free size');
    l = D.snapTo(l, 'stats', 'top', desk); assert.equal(l.wins.stats.st, 'max');
  });
  it('presets: Focus, Analysis (statistics open, order in the taskbar), Multi-chart (four chart windows, 2x2)', () => {
    let l = D.applyPreset(D.defaults(desk), 'focus', desk);
    assert.equal(l.preset, 'focus'); assert.equal(l.wins.open.closed, true); assert.equal(l.wins.history.closed, true);
    l = D.applyPreset(l, 'analysis', desk);
    assert.equal(l.wins.stats.closed, false); assert.equal(l.wins.order.st, 'min'); assert.equal(l.wins.orders.closed, true);
    const m = D.fromPreset('multi', desk);
    assert.equal(m.charts, '2x2'); assert.ok(D.CHARTS.every((id) => !m.wins[id].closed && m.wins[id].st === 'normal'));
    assert.equal(D.PRESETS.multi.pro, true); assert.deepEqual(D.PRESET_IDS, ['classic', 'focus', 'analysis', 'multi']);
    for (const id of D.PRESET_IDS) {
      const p = D.fromPreset(id, desk), shown = Object.keys(p.wins).filter((k) => !p.wins[k].closed && p.wins[k].st === 'normal' && (D.CHARTS.indexOf(k) <= 0 || id === 'multi'));
      for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
        const a = D.toPx(p.wins[shown[i]], desk), b = D.toPx(p.wins[shown[j]], desk);
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        assert.ok(!overlap, `${id}: ${shown[i]} and ${shown[j]} do not overlap`);
      }
    }
  });
  it('named layouts: free keeps 1 (same name replaces), Premium unlimited (500 as a store guard); load and delete', () => {
    let l = D.defaults(desk);
    assert.deepEqual(D.saveNamed(l, '  ', '1', false), { ok: false, error: 'NAME' });
    let r = D.saveNamed(l, 'Sabah', '1', false); assert.ok(r.ok); l = r.layout;
    assert.deepEqual(D.saveNamed(l, 'Akşam', '1', false), { ok: false, error: 'LIMIT' });
    l = D.maximize(l, 'chart');
    r = D.saveNamed(l, 'sabah', '2x2', false); assert.ok(r.ok, 'same name (any case) replaces'); l = r.layout;
    assert.equal(l.saved.length, 1); assert.equal(l.saved[0].charts, '2x2'); assert.equal(l.saved[0].wins.chart.st, 'max');
    for (let i = 0; i < D.MAX_SAVED - 1; i++) { r = D.saveNamed(l, 'L' + i, '1', true); assert.ok(r.ok); l = r.layout; }
    assert.deepEqual(D.saveNamed(l, 'one more', '1', true), { ok: false, error: 'MAX' });
    l = D.applyPreset(l, 'focus', desk);
    const ld = D.loadNamed(l, 'sabah');
    assert.equal(ld.charts, '2x2'); assert.equal(ld.layout.wins.chart.st, 'max'); assert.equal(ld.layout.preset, null);
    assert.equal(D.loadNamed(l, 'nope'), null);
    assert.equal(D.deleteNamed(l, 'sabah').saved.length, D.MAX_SAVED - 1);
  });
  it('visible windows: closed ones and charts the layout does not have are left out', () => {
    const l = D.defaults(desk);
    assert.deepEqual(D.visibleWins(l, (id) => D.CHARTS.indexOf(id) <= 0), ['replay', 'chart', 'draw', 'balance', 'order', 'open', 'orders', 'history']);
    assert.ok(D.visibleWins(l, () => true).includes('chart4'));
  });
  it('drawing tools window: left of the chart column in every preset (no overlap), closable, never maximized; a stored one is kept', () => {
    D.PRESET_IDS.forEach((id) => {
      const w = D.applyPreset(D.defaults(desk), id, desk).wins, dr = D.toPx(w.draw, desk), ch = D.toPx(w.chart, desk);
      assert.equal(w.draw.closed, false, id);
      assert.ok(Math.abs(dr.w - D.DRAW_W) <= 1, id + ' two toolbar columns wide');
      assert.ok(dr.x + dr.w + D.GAP - 1 <= ch.x && ch.x <= dr.x + dr.w + D.GAP + 1, id + ' the chart starts one gap to the right');
      assert.ok(dr.y <= ch.y + 1 && dr.y + dr.h >= ch.y + ch.h - 1, id + ' as tall as the chart column');
      if (id === 'multi') { const c3 = D.toPx(w.chart3, desk); assert.ok(Math.abs(c3.x - ch.x) <= 1 && dr.y + dr.h >= c3.y + c3.h - 1, 'multi: the chart under it moves too'); }
    });
    assert.ok(D.CLOSABLE.includes('draw') && D.FREE_ONLY.includes('draw'));
    let l = D.defaults(desk); l = D.maximize(l, 'draw'); assert.equal(l.wins.draw.st, 'normal', 'no maximize');
    l = D.close(l, 'draw'); assert.equal(l.wins.draw.closed, true); l = D.open(l, 'draw'); assert.equal(l.wins.draw.closed, false);
    const kept = D.normalize({ v: 1, wins: { chart: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, draw: { x: 0.8, y: 0.1, w: 0.2, h: 0.05 } } });
    assert.deepEqual([kept.wins.chart.x, kept.wins.draw.x, kept.wins.draw.h], [0.2, 0.8, 0.05], 'a stored drawing window and its chart stay where they are');
    const narrow = D.normalize({ v: 1, wins: { chart: { x: 0.5, y: 0.2, w: 0.1, h: 0.5 } } });
    assert.equal(narrow.wins.chart.x, 0.5, 'a chart too narrow to share is not shrunk');
  });
});

describe('bt-desk storage and the full-screen grid', () => {
  it('per user; a first start takes the widgets and grid of the old panel layout', () => {
    const st = mem();
    st.setItem('ww_bt_dock_v1:u1', JSON.stringify({ v: 1, widgets: { order: ['kpis'], hidden: [] }, multi: { '2h': { cols: [2, 1], rows: [1], order: [1, 0] } } }));
    const l = D.load(st, 'u1');
    assert.deepEqual(l.widgets, { order: ['kpis'], hidden: [] }); assert.deepEqual(l.multi['2h'], { cols: [2, 1], rows: [1], order: [1, 0] });
    l.wins.order.st = 'max';
    assert.ok(D.save(st, 'u1', l));
    assert.equal(D.load(st, 'u1').wins.order.st, 'max');
    assert.equal(D.load(st, 'u2').wins.order.st, 'normal', 'another user has their own layout');
    assert.equal(D.storageKey('u1'), 'ww_bt_desk_v1:u1');
    const bad = mem(); bad.setItem('ww_bt_desk_v1:u1', '{oops'); assert.equal(D.load(bad, 'u1').preset, 'classic');
  });
  it('grid helpers: default tracks, swap, cell areas, template, track resize', () => {
    assert.deepEqual(D.multiDefault('1+3'), { cols: [2, 1], rows: [1, 1, 1], order: [0, 1, 2, 3] });
    assert.deepEqual(D.swapViews(D.multiDefault('2x2'), 0, 3).order, [3, 1, 2, 0]);
    assert.equal(D.cellArea('1+3', D.multiDefault('1+3'), 0), '1 / 1 / 4 / 2');
    assert.equal(D.template([1, 2]), 'minmax(0, 1fr) minmax(0, 2fr)');
    assert.deepEqual(D.resizeTracks([1, 1], 0, 100, 400), [1.5, 0.5]);
    const rt = D.resizeTracks([1, 1], 0, 1000, 400); assert.ok(Math.abs(rt[0] - 1.85) < 1e-9 && Math.abs(rt[1] - 0.15) < 1e-9, 'each track keeps 0.15');
  });
});
