// Backtest v2: drawing tools model (bt-draw.js): time/price coordinates, magnet, rows, position tool, persistence routing
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import '../public/interface/backtest/js/bt-draw.js';

const D = globalThis.WwBtDraw;
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const H = 3600;
// H1 bars with a weekend gap after the 3rd bar
const bars = [0, H, 2 * H, 2 * H + 50 * H, 2 * H + 51 * H].map((t, i) => ({ time: t, open: 1 + i / 100, high: 1.02 + i / 100, low: 0.99 + i / 100, close: 1.01 + i / 100 }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('bt-draw', () => {
  it('time <-> logical: exact on bars, proportional inside a bar, gaps compressed, extrapolated outside, round trip', () => {
    assert.equal(D.timeToLogical(bars, H, 0), 0); assert.equal(D.timeToLogical(bars, H, 2 * H), 2);
    assert.equal(D.timeToLogical(bars, H, H / 2), 0.5);
    assert.equal(D.timeToLogical(bars, H, -H), -1);
    assert.equal(D.timeToLogical(bars, H, 2 * H + 53 * H), 6, 'two bars after the last one');
    const inGap = D.timeToLogical(bars, H, 2 * H + 25 * H);
    assert.ok(inGap > 2.5 && inGap < 3, 'weekend gap maps into the second half of the slot: ' + inGap);
    for (const t of [-5000, 0, 1234, 2 * H + 10, 2 * H + 30 * H, 2 * H + 51 * H, 2 * H + 60 * H]) assert.ok(near(D.logicalToTime(bars, H, D.timeToLogical(bars, H, t)), t, 1e-6), 'round trip ' + t);
    assert.ok(Number.isNaN(D.timeToLogical([], H, 5)));
  });
  it('the same time lands inside the matching bar on another timeframe (M15 bars of the same hours)', () => {
    const m15 = []; for (let t = 0; t < 3 * H; t += 900) m15.push({ time: t });
    const t = H + 1000;                            // 01:16:40
    const l = D.timeToLogical(m15, 900, t), i = Math.floor(l);
    assert.ok(m15[i].time <= t && t < m15[i].time + 900, 'M15 bar ' + i);
    assert.ok(near(D.timeToLogical(bars, H, t), 1 + 1000 / H));
  });
  it('magnet snaps to the closest OHLC of the revealed bar under the pointer, never beyond the last bar', () => {
    assert.deepEqual(D.magnet(bars, 1.2, 1.0195), { t: H, p: 1.02 });          // bar 1 high is 1.03? low 1.00, open 1.01, close 1.02
    const last = bars[bars.length - 1];
    assert.equal(D.magnet(bars, 40, 0).t, last.time, 'future pointer -> last revealed bar');
    assert.equal(D.magnet([], 1, 1), null);
  });
  it('sanitize: tool, point count, numbers, colors and text are checked', () => {
    assert.equal(D.sanitize({ id: 'a', tool: 'circle', pts: [] }), null);
    assert.equal(D.sanitize({ id: 'a', tool: 'trend', pts: [{ t: 1, p: 1 }] }), null, 'trend needs two points');
    assert.equal(D.sanitize({ id: 'a', tool: 'trend', pts: [{ t: 1, p: 'x' }, { t: 2, p: 1 }] }), null);
    assert.equal(D.sanitize({ id: 'a', tool: 'text', pts: [{ t: 1, p: 1 }], text: '   ' }), null, 'empty text');
    const d = D.sanitize({ id: 'a', tool: 'text', pts: [{ t: 1, p: 1 }, { t: 9, p: 9 }], text: 'x'.repeat(300), color: 'red', locked: 'yes' });
    assert.equal(d.pts.length, 1); assert.equal(d.text.length, D.MAX_TEXT); assert.equal(d.color, null); assert.equal(d.locked, false);
    assert.equal(D.sanitize({ id: 'b', tool: 'hline', pts: [{ t: 1, p: 2 }], color: '#ABCDEF' }).color, '#abcdef');
  });
  it('row mapping round trip (backtest_drawings: points + style)', () => {
    const d = D.sanitize({ id: 'x1', tool: 'text', pts: [{ t: 100, p: 1.5 }], text: 'Not', color: '#112233', locked: true });
    const row = D.toRow(d, 'u1', 'acc1');
    assert.deepEqual(row, { id: 'x1', user_id: 'u1', backtest_account_id: 'acc1', tool: 'text', points: [{ t: 100, p: 1.5 }], style: { color: '#112233', locked: true, text: 'Not' } });
    assert.deepEqual(D.fromRow(row), d);
    assert.equal(D.fromRow({ id: 'z', tool: 'trend', points: 'nope', style: null }), null);
  });
  it('every drawing belongs to one chart: pane kept in the style, main chart by default', () => {
    const d = D.sanitize({ id: 'p1', tool: 'trend', pts: [{ t: 1, p: 1 }, { t: 2, p: 2 }], pane: 'chart3' });
    assert.equal(d.pane, 'chart3'); assert.equal(D.paneOf(d), 'chart3');
    const row = D.toRow(d, 'u', 'a');
    assert.equal(row.style.pane, 'chart3'); assert.deepEqual(D.fromRow(row), d);
    const old = D.fromRow({ id: 'p0', tool: 'hline', points: [{ t: 1, p: 1 }], style: { color: null, locked: false } });
    assert.equal(old.pane, undefined); assert.equal(D.paneOf(old), 'main', 'drawings saved before panes stay on the main chart');
    for (const bad of ['main', 'chart1', 'chart', 'x', 5, null]) assert.equal(D.sanitize({ id: 'q', tool: 'hline', pts: [{ t: 1, p: 1 }], pane: bad }).pane, undefined, String(bad));
  });
  it('fib levels run from the first point (1) to the second (0)', () => {
    const lv = D.fibLevels({ pts: [{ t: 0, p: 100 }, { t: 1, p: 200 }] });
    assert.deepEqual(lv.map((x) => x.level), D.FIB_LEVELS);
    assert.equal(lv[0].price, 200); assert.equal(lv[lv.length - 1].price, 100); assert.ok(near(lv[4].price, 200 - 0.618 * 100));
  });
  it('position tool: 1:2 default, stats, target/stop stay on their side, width and entry handles', () => {
    const pts = D.newPosition('long', 1000, 1.1, 0.01, H);
    assert.deepEqual(pts, [{ t: 1000, p: 1.1 }, { t: 1000 + 20 * H, p: 1.12 }, { t: 1000 + 20 * H, p: 1.09 }]);
    const d = { id: 'p', tool: 'long', pts };
    const st = D.positionStats(d);
    assert.ok(near(st.rr, 2)); assert.ok(near(st.targetPct, (0.02 / 1.1) * 100)); assert.ok(st.stopPct < 0);
    assert.ok(D.setHandle(d, 1, 0, 1.0, H).pts[1].p > 1.1, 'long target cannot go below the entry');
    assert.ok(D.setHandle(d, 2, 0, 1.5, H).pts[2].p < 1.1, 'long stop cannot go above the entry');
    const w = D.setHandle(d, 3, 0, 0, H); assert.equal(w.pts[1].t, 1000 + H); assert.equal(w.pts[2].t, 1000 + H, 'at least one bar wide');
    const e = D.setHandle(d, 0, 2000, 1.2, H); assert.ok(near(e.pts[1].p, 1.22) && near(e.pts[2].p, 1.19), 'moving the entry moves target and stop with it');
    const sh = D.newPosition('short', 0, 2, 0.1, H); assert.ok(sh[1].p < 2 && sh[2].p > 2);
  });
  it('moveBy keeps the shape in bar units across a gap; measure stats', () => {
    const d = { id: 'm', tool: 'trend', pts: [{ t: 0, p: 1 }, { t: H, p: 2 }] };
    const m = D.moveBy(d, bars, H, 2, 0.5);
    assert.ok(near(m.pts[0].t, 2 * H) && near(m.pts[1].t, 2 * H + 50 * H, 1e-6), 'one bar further = across the weekend gap');
    assert.ok(near(m.pts[0].p, 1.5));
    const ms = D.measureStats({ pts: [{ t: 0, p: 1 }, { t: 2 * H + 50 * H, p: 1.1 }] }, bars, H);
    assert.equal(ms.bars, 3); assert.ok(near(ms.pct, 10)); assert.equal(ms.seconds, 52 * H);
  });
  it('geometry: segment distance, ray to the pane edge, boxes', () => {
    assert.equal(D.distSeg(5, 5, 0, 0, 10, 0), 5); assert.equal(D.distSeg(-3, 4, 0, 0, 10, 0), 5);
    assert.deepEqual(D.rayEnd(0, 0, 10, 5, 100, 100), { x: 100, y: 50 });
    assert.deepEqual(D.rayEnd(50, 50, 40, 40, 100, 100), { x: 0, y: 0 });
    assert.ok(D.inBox(5, 5, 10, 10, 0, 0)); assert.ok(!D.inBox(12, 5, 10, 10, 0, 0)); assert.ok(D.inBox(12, 5, 10, 10, 0, 0, 3));
  });
  it('free tools are the trend line, the horizontal line and the rectangle', () => {
    assert.deepEqual(D.FREE_TOOLS, ['trend', 'hline', 'rect']);
    assert.equal(D.TOOLS.length, 9); for (const t of D.TOOLS) assert.ok(D.ICONS[t] && D.NPTS[t]);
  });
  it('set: add/put/remove/select, transient drag events are not persisted', () => {
    const s = D.createSet(), ev = [];
    s.on((k) => ev.push(k));
    const a = s.add({ id: 'a', tool: 'hline', pts: [{ t: 1, p: 1 }] });
    s.put(Object.assign({}, a, { pts: [{ t: 1, p: 2 }] }), true);
    s.put(s.get('a'));
    s.select('a'); s.remove('a');
    assert.deepEqual(ev, ['add', 'drag', 'update', 'select', 'remove']);
    assert.equal(s.selected(), null); assert.equal(s.list().length, 0);
    assert.equal(s.add({ id: 'b', tool: 'trend', pts: [] }), null);
  });
  it('Shift: lines lock to 0/45/90 degrees around the anchor, boxes become squares on screen', () => {
    assert.deepEqual(D.lockAngle(100, 100, 180, 108), { x: 180, y: 100, kind: 'h' }, 'nearly flat -> horizontal, keeps the x');
    assert.deepEqual(D.lockAngle(100, 100, 96, 20), { x: 100, y: 20, kind: 'v' }, 'nearly vertical -> vertical, keeps the y');
    const d = D.lockAngle(100, 100, 150, 140);
    assert.equal(d.kind, 'd'); assert.ok(near(d.x - 100, d.y - 100, 1e-9) && d.x > 100, '45 degrees down-right ' + JSON.stringify(d));
    const u = D.lockAngle(100, 100, 40, 160);
    assert.ok(near(100 - u.x, u.y - 100, 1e-9) && u.x < 100, '45 degrees down-left');
    assert.equal(D.lockAngle(5, 5, 5, 5).kind, 'h');
    assert.deepEqual(D.squareBox(10, 10, 50, 25), { x: 50, y: 50 });
    assert.deepEqual(D.squareBox(10, 10, -20, 5), { x: -20, y: -20 }, 'up-left keeps the direction');
  });
  it('rectangle: eight handles, edges and corners resize, dragging past the opposite edge flips the box', () => {
    const hs = D.rectHandles(50, 80, 10, 20);
    assert.deepEqual(hs.map((h) => h.i), ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);
    assert.deepEqual(hs.find((h) => h.i === 'nw'), { i: 'nw', x: 10, y: 20 }); assert.deepEqual(hs.find((h) => h.i === 's'), { i: 's', x: 30, y: 80 });
    // pts drawn from bottom-right to top-left: [later time, lower price] then [earlier time, higher price]
    const r = { id: 'r', tool: 'rect', pts: [{ t: 200, p: 1.0 }, { t: 100, p: 2.0 }] };
    assert.deepEqual(D.resizeRect(r, 'e', 300, 9).pts, [{ t: 300, p: 1.0 }, { t: 100, p: 2.0 }], 'right edge = the later point');
    assert.deepEqual(D.resizeRect(r, 'n', 9, 2.5).pts, [{ t: 200, p: 1.0 }, { t: 100, p: 2.5 }], 'top edge = the higher price');
    assert.deepEqual(D.resizeRect(r, 'sw', 50, 0.5).pts, [{ t: 200, p: 0.5 }, { t: 50, p: 2.0 }]);
    assert.deepEqual(D.setHandle(r, 'w', 260, 1).pts, [{ t: 200, p: 1.0 }, { t: 260, p: 2.0 }], 'past the right edge: flipped, still two points');
    assert.deepEqual(D.setHandle(r, 0, 7, 8, H).pts[0], { t: 7, p: 8 }, 'numeric handles still move a point');
  });
  it('style: width, line style, fill, opacity, fib levels and text size are checked; defaults are left out; row round trip', () => {
    const base = { id: 'a', tool: 'rect', pts: [{ t: 1, p: 1 }, { t: 2, p: 2 }] };
    assert.deepEqual(D.sanitize(Object.assign({ width: 2, dash: 'solid', opacity: 0.14 }, base)), Object.assign({ color: null, locked: false }, base), 'defaults are not stored');
    const r = D.sanitize(Object.assign({ width: 3, dash: 'dotted', fill: false, opacity: 0.456, levels: [1] }, base));
    assert.equal(r.width, 3); assert.equal(r.dash, 'dotted'); assert.equal(r.fill, false); assert.equal(r.opacity, 0.46); assert.equal(r.levels, undefined, 'levels only on fib');
    for (const bad of [{ width: 0 }, { width: 5 }, { width: 2.5 }, { dash: 'wavy' }, { opacity: 1.5 }, { opacity: 'x' }]) {
      const x = D.sanitize(Object.assign({}, base, bad)); assert.ok(x && x.width === undefined && x.dash === undefined && x.opacity === undefined, JSON.stringify(bad));
    }
    assert.equal(D.sanitize({ id: 't', tool: 'trend', pts: base.pts, fill: false, opacity: 0.5 }).fill, undefined, 'a line has no fill');
    const fib = D.sanitize({ id: 'f', tool: 'fib', pts: base.pts, levels: [1, '0.5', 0, 0.5, 'x', 2.618] });
    assert.deepEqual(fib.levels, [0, 0.5, 1, 2.618], 'sorted, unique, numbers only');
    assert.equal(D.sanitize({ id: 'f', tool: 'fib', pts: base.pts, levels: D.FIB_LEVELS.slice() }).levels, undefined, 'the default set is not stored');
    assert.deepEqual(D.fibLevels(fib).map((l) => l.level), [0, 0.5, 1, 2.618]);
    const tx = D.sanitize({ id: 'x', tool: 'text', pts: [{ t: 1, p: 1 }], text: 'Hi', size: 20, width: 3 });
    assert.equal(tx.size, 20); assert.equal(tx.width, undefined, 'text has a size, not a line width');
    assert.equal(D.sanitize({ id: 'x', tool: 'text', pts: [{ t: 1, p: 1 }], text: 'Hi', size: 17 }).size, undefined, 'only the offered sizes');
    const row = D.toRow(r, 'u', 'a1');
    assert.deepEqual(row.style, { color: null, locked: false, width: 3, dash: 'dotted', fill: false, opacity: 0.46 });
    assert.deepEqual(D.fromRow(row), r);
    assert.deepEqual(D.fromRow(D.toRow(fib, 'u', 'a1')), fib);
    assert.ok(JSON.stringify(D.toRow(fib, 'u', 'a1').style).length < 2048, 'fits the 2 KB style check');
    assert.equal(D.fillOf(r), 0); assert.equal(D.fillOf(D.sanitize(base)), 0.14); assert.equal(D.widthOf(fib), 1); assert.equal(D.widthOf(r), 3);
  });
  it('horizontal line length: full (default), ray to the right, segment with two ends on one price; row round trip', () => {
    const base = { id: 'h', tool: 'hline', pts: [{ t: 10, p: 1.5 }] };
    assert.equal(D.sanitize(base).extend, undefined, 'full is the default and left out');
    assert.equal(D.sanitize({ ...base, extend: 'right' }).extend, 'right');
    assert.equal(D.sanitize({ ...base, extend: 'odd' }).extend, undefined);
    assert.equal(D.sanitize({ ...base, extend: 'none' }).extend, undefined, 'a segment needs its second point');
    const seg = D.sanitize({ ...base, extend: 'none', pts: [{ t: 10, p: 1.5 }, { t: 90, p: 9 }] });
    assert.deepEqual(seg.pts, [{ t: 10, p: 1.5 }, { t: 90, p: 1.5 }], 'the end keeps the start price');
    assert.equal(D.sanitize({ ...base, pts: [{ t: 10, p: 1.5 }, { t: 90, p: 1.5 }] }).pts.length, 1, 'not a segment: one point');
    assert.deepEqual(D.fromRow(D.toRow(seg, 'u', 'a')), seg);
    assert.deepEqual(D.hlineSpan(D.sanitize(base), [300], 800), [0, 800]);
    assert.deepEqual(D.hlineSpan({ extend: 'right' }, [300], 800), [300, 800]);
    assert.deepEqual(D.hlineSpan(seg, [500, 200], 800), [200, 500]);
    // handles: the start moves time and price (the end follows the price), the end changes only the length
    let m = D.setHandle(seg, 0, 20, 2, H); assert.deepEqual(m.pts, [{ t: 20, p: 2 }, { t: 90, p: 2 }]);
    m = D.setHandle(seg, 1, 150, 7, H); assert.deepEqual(m.pts, [{ t: 10, p: 1.5 }, { t: 150, p: 1.5 }]);
    assert.deepEqual(D.setHandle(D.sanitize(base), 0, 30, 3, H).pts, [{ t: 30, p: 3 }]);
    assert.deepEqual(D.EXTENDS, ['both', 'right', 'none']);
  });
  it('toolbar groups: lines and positions share a button by default; stored groups are checked', () => {
    const ts = (g) => g.map((x) => x.t);
    assert.deepEqual(ts(D.defaultGroups()), [['trend', 'ray', 'hline'], ['rect'], ['fib'], ['long', 'short'], ['text'], ['measure']]);
    assert.deepEqual(D.defaultGroups().map((x) => x.c), ['trend', 'rect', 'fib', 'long', 'text', 'measure'], 'a button shows its first tool');
    assert.ok(D.isDefaultGroups(D.defaultGroups()));
    assert.deepEqual(D.normalizeGroups('x'), D.defaultGroups());
    const n = D.normalizeGroups([{ t: ['ray', 'nope', 'ray', 'fib'], c: 'fib' }, { t: [] }, null, { t: ['trend'], c: 'zzz' }]);
    assert.deepEqual(ts(n), [['ray', 'fib'], ['trend'], ['hline'], ['rect'], ['long'], ['short'], ['text'], ['measure']], 'unknown and repeated dropped, missing ones at the end');
    assert.deepEqual(n.map((x) => x.c).slice(0, 2), ['fib', 'trend'], 'the shown tool kept when valid, else the first');
    assert.equal(D.groupOf(D.defaultGroups(), 'short'), 3); assert.equal(D.groupOf(D.defaultGroups(), 'x'), -1);
  });
  it('toolbar drag and drop: reorder buttons, merge, a tool into another group, out to its own button, inside its group', () => {
    const g = D.defaultGroups(), ts = (x) => x.map((y) => y.t);
    assert.deepEqual(ts(D.moveGroup(g, 0, 3)), [['rect'], ['fib'], ['trend', 'ray', 'hline'], ['long', 'short'], ['text'], ['measure']], 'before the 4th button');
    assert.deepEqual(ts(D.moveGroup(g, 5, 0))[0], ['measure']);
    assert.deepEqual(ts(D.moveGroup(g, 2, 6))[5], ['fib'], 'to the end');
    assert.deepEqual(ts(D.mergeGroup(g, 2, 0)).slice(0, 2), [['trend', 'ray', 'hline', 'fib'], ['rect']], 'a button dropped on another joins it');
    assert.equal(D.mergeGroup(g, 2, 0)[0].c, 'trend', 'the target keeps what it shows');
    assert.deepEqual(ts(D.mergeGroup(g, 1, 1)), ts(g), 'on itself: nothing');
    let m = D.moveTool(g, 'ray', { at: 1 });
    assert.deepEqual(ts(m).slice(0, 3), [['trend', 'hline'], ['ray'], ['rect']], 'out of the group: its own button');
    m = D.moveTool(g, 'trend', { at: 6 });
    assert.deepEqual(m[0], { t: ['ray', 'hline'], c: 'ray' }, 'the group shows another tool when its shown one leaves');
    assert.deepEqual(ts(m)[6], ['trend']);
    m = D.moveTool(g, 'rect', { group: 0, at: 1 });
    assert.deepEqual(ts(m).slice(0, 2), [['trend', 'rect', 'ray', 'hline'], ['fib']], 'into another group; the emptied button disappears');
    m = D.moveTool(g, 'fib', { at: 0 });
    assert.deepEqual(ts(m).slice(0, 3), [['fib'], ['trend', 'ray', 'hline'], ['rect']], 'a single tool to the front');
    m = D.moveTool(g, 'rect', { at: 3 });
    assert.deepEqual(ts(m).slice(0, 4), [['trend', 'ray', 'hline'], ['fib'], ['rect'], ['long', 'short']], 'before the 4th button (counted before the move)');
    m = D.moveTool(g, 'trend', { group: 0, at: 3 });
    assert.deepEqual(m[0], { t: ['ray', 'hline', 'trend'], c: 'trend' }, 'inside its group: reordered, the shown tool stays');
    m = D.moveTool(g, 'hline', { group: 0, at: 0 }); assert.deepEqual(m[0].t, ['hline', 'trend', 'ray']);
    assert.deepEqual(D.normalizeGroups(m), m, 'results stay valid');
  });
  it('fib levels from text: separators, percent sign, limits', () => {
    assert.deepEqual(D.parseLevels('0, 0.5; 0.618 1'), [0, 0.5, 0.618, 1]);
    assert.deepEqual(D.parseLevels('1.618%, -0.272'), [-0.272, 1.618]);
    assert.equal(D.parseLevels(''), null); assert.equal(D.parseLevels('a, b'), null);
    assert.equal(D.parseLevels(Array.from({ length: 13 }, (_, i) => i / 10).join(',')), null, 'at most 12 levels');
    assert.equal(D.cleanLevels([11, -6]), null, 'out of range');
  });
  it('history: create, move, settings, delete and clear are undone and redone through the set; drags are not steps', () => {
    const s = D.createSet(), h = D.createHistory(s), ev = [];
    s.on((k, d) => { if (k !== 'select' && k !== 'view') ev.push(k + ':' + (d && d.id ? d.id : '')); });
    const a = s.add({ id: 'a', tool: 'trend', pts: [{ t: 1, p: 1 }, { t: 2, p: 2 }] });
    s.add({ id: 'b', tool: 'hline', pts: [{ t: 1, p: 5 }] });
    s.put(Object.assign({}, a, { pts: [{ t: 1, p: 1.5 }, { t: 2, p: 2 }] }), true);       // dragging
    s.put(Object.assign({}, a, { pts: [{ t: 1, p: 1.7 }, { t: 2, p: 2 }] }), true);
    s.put(s.get('a'));                                                                     // drop
    s.put(Object.assign({}, s.get('a'), { width: 4 }));                                    // settings
    s.put(Object.assign({}, s.get('a')));                                                  // no change: no step
    s.remove('b');
    assert.ok(h.canUndo() && !h.canRedo());
    h.undo(); assert.deepEqual(s.list().map((d) => d.id), ['a', 'b'], 'delete undone, back in its stacking place');
    assert.equal(s.selected(), 'b', 'the restored drawing is selected');
    h.undo(); assert.equal(s.get('a').width, undefined, 'settings undone');
    h.undo(); assert.equal(s.get('a').pts[0].p, 1, 'the whole drag is one step');
    h.redo(); assert.equal(s.get('a').pts[0].p, 1.7);
    h.undo(); h.undo(); assert.deepEqual(s.list().map((d) => d.id), ['a']); h.undo(); assert.equal(s.list().length, 0); assert.equal(h.canUndo(), false);
    assert.equal(h.undo(), false, 'nothing left');
    h.redo(); h.redo(); assert.deepEqual(s.list().map((d) => d.id), ['a', 'b']);
    s.add({ id: 'c', tool: 'hline', pts: [{ t: 1, p: 6 }] });
    assert.equal(h.canRedo(), false, 'a new change drops the redo steps');
    s.clear(); assert.equal(s.list().length, 0); h.undo(); assert.deepEqual(s.list().map((d) => d.id), ['a', 'b', 'c'], 'clear is one step');
    s.reset([]); assert.equal(h.canUndo(), false, 'another account: no history');
    assert.ok(ev.includes('remove:b') && ev.includes('add:b'), 'undo goes through the set (saved like any change)');
    h.destroy();
  });
  it('controller: free -> session storage only; premium -> debounced upserts and deletes; saved rows + session merged on load', async () => {
    const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
    const calls = [], rows = [{ id: 'r1', tool: 'hline', points: [{ t: 5, p: 1.2 }], style: { color: null, locked: false } }];
    const db = { load: async () => ({ data: rows, error: null }), save: async (r) => { calls.push(['save', r.id, r.backtest_account_id]); return { error: null }; }, remove: async (id) => { calls.push(['remove', id]); return { error: null }; } };
    let pro = false, ups = 0;
    const session = mem();
    const c = D.createController({ bar: null, t: (k, fb) => fb, pro: () => pro, saveable: () => pro, upgrade: () => ups++, toast() {}, newId: () => 'n' + Math.random(),
      askText() {}, confirm: async () => true, icons() {}, local: mem(), session, db, userId: () => 'u1' });
    await c.setAccount('acc1');
    assert.deepEqual(c.set.list().map((d) => d.id), ['r1'], 'saved rows are shown (a lapsed Premium keeps seeing them)');
    c.setTool('fib'); assert.equal(c.tool(), 'cursor'); assert.equal(ups, 1, 'premium tool -> upgrade window');
    c.setTool('rect'); assert.equal(c.tool(), 'rect');
    c.set.add({ id: 'f1', tool: 'trend', pts: [{ t: 1, p: 1 }, { t: 2, p: 2 }] });
    await sleep(450);
    assert.equal(calls.length, 0, 'free: nothing goes to the database');
    assert.ok(JSON.parse(session.getItem('ww_bt_draw:acc1')).some((d) => d.id === 'f1'), 'free: kept in the session');
    pro = true;
    c.set.add({ id: 'p1', tool: 'fib', pts: [{ t: 1, p: 1 }, { t: 2, p: 2 }] });
    c.set.put(Object.assign({}, c.set.get('p1'), { color: '#123456' }));
    await sleep(450);
    assert.deepEqual(calls, [['save', 'p1', 'acc1']], 'one debounced upsert per drawing');
    c.set.add({ id: 'p2', tool: 'ray', pts: [{ t: 1, p: 1 }, { t: 2, p: 2 }] });
    await c.setAccount('acc2');                                // pending save is flushed for the old account
    assert.deepEqual(calls[1], ['save', 'p2', 'acc1']);
    await c.setAccount('acc1');
    c.set.remove('r1'); await sleep(10);
    assert.deepEqual(calls[2], ['remove', 'r1']);
    assert.equal(c.key({ key: '3', shiftKey: false }), true); assert.equal(c.tool(), 'ray');
    assert.equal(c.escape(), true); assert.equal(c.tool(), 'cursor');
    // undo / redo keys: the delete of r1 comes back and goes again (and reaches the database both ways)
    assert.equal(c.undoKey({ key: 'z', ctrlKey: true }), true); assert.ok(c.set.get('r1'), 'Ctrl+Z restores');
    await sleep(450);
    assert.ok(calls.some((x) => x[0] === 'save' && x[1] === 'r1'), 'the restored drawing is saved again');
    assert.equal(c.undoKey({ key: 'Z', metaKey: true, shiftKey: true }), true); assert.equal(c.set.get('r1'), null, 'Shift+Cmd+Z redoes');
    await sleep(10);
    assert.deepEqual(calls[calls.length - 1], ['remove', 'r1'], 'and deletes it again');
    assert.equal(c.undoKey({ key: 'y', ctrlKey: true }), true);
    assert.equal(c.undoKey({ key: 'z' }), false, 'no modifier: not ours');
    c.destroy();
  });
});
