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
    c.destroy();
  });
});
