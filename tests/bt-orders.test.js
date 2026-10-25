// Backtest v2: pending orders (limit / stop) in the engine (bt-engine.js): placement rules, fills with gaps, the order of events
// inside one 1m bar (the bar path), SL/TP of a position opened inside a bar, no look-ahead, refusals (positions, equity, page guard).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBt, plain } from './helpers/bt-env.js';

const { E } = loadBt(['symbols', 'engine']);
const T0 = 1788220800; // 2026-09-01T00:00:00Z
// EUR/USD, spread 2 points: bid 108309, ask 108311 after the bar at T0
function st0(over = {}) {
  const st = E.createState(Object.assign({ sym: 'EURUSD', startCents: 1000000, spreadPts: 2, cplCents: 700 }, over));
  E.setQuote(st, [T0, 108300, 108312, 108295, 108309]);
  return st;
}
let n = 0;
const ord = (o) => Object.assign({ id: 'o' + (++n), steps: 10, sl: null, tp: null }, o);
const bar = (k, o, h, l, c) => [T0 + 60 * k, o, h, l, c];
const code = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };

describe('bt-orders: placing', () => {
  it('buy limit below the ask, buy stop above it; sell limit above the bid, sell stop below it', () => {
    const st = st0();
    assert.equal(code(() => E.placeOrder(st, ord({ dir: 1, type: 'limit', price: 108311 }))), 'LIMIT_BUY');
    assert.equal(code(() => E.placeOrder(st, ord({ dir: 1, type: 'stop', price: 108311 }))), 'STOP_BUY');
    assert.equal(code(() => E.placeOrder(st, ord({ dir: -1, type: 'limit', price: 108309 }))), 'LIMIT_SELL');
    assert.equal(code(() => E.placeOrder(st, ord({ dir: -1, type: 'stop', price: 108309 }))), 'STOP_SELL');
    assert.equal(st.orders.length, 0);
    E.placeOrder(st, ord({ dir: 1, type: 'limit', price: 108300 }));
    E.placeOrder(st, ord({ dir: 1, type: 'stop', price: 108320 }));
    E.placeOrder(st, ord({ dir: -1, type: 'limit', price: 108320 }));
    E.placeOrder(st, ord({ dir: -1, type: 'stop', price: 108300 }));
    assert.equal(st.orders.length, 4);
  });
  it('SL / TP against the order price (a long stop is a bid level, a short stop an ask level)', () => {
    const st = st0();
    assert.equal(code(() => E.placeOrder(st, ord({ dir: 1, type: 'limit', price: 108300, sl: 108298 }))), 'SL_ORDER_LONG');     // 108300 - spread
    assert.equal(code(() => E.placeOrder(st, ord({ dir: 1, type: 'limit', price: 108300, tp: 108300 }))), 'TP_ORDER_LONG');
    assert.equal(code(() => E.placeOrder(st, ord({ dir: -1, type: 'limit', price: 108320, sl: 108322 }))), 'SL_ORDER_SHORT');
    assert.equal(code(() => E.placeOrder(st, ord({ dir: -1, type: 'limit', price: 108320, tp: 108320 }))), 'TP_ORDER_SHORT');
    assert.equal(code(() => E.placeOrder(st, ord({ dir: 1, type: 'limit', price: 108300, sl: 108297, tp: 108301 }))), null);
  });
  it('lot range, price format, order type, no quote, at most 50 orders', () => {
    const st = st0();
    assert.equal(code(() => E.placeOrder(st, ord({ dir: 1, type: 'limit', price: 108300, steps: 0 }))), 'LOT_RANGE');
    assert.equal(code(() => E.placeOrder(st, ord({ dir: 1, type: 'limit', price: 1083.5 }))), 'PRICE');
    assert.equal(code(() => E.placeOrder(st, ord({ dir: 1, type: 'market', price: 108300 }))), 'ORDER_TYPE');
    assert.equal(code(() => E.placeOrder(E.createState({ sym: 'EURUSD', startCents: 1, spreadPts: 2 }), ord({ dir: 1, type: 'limit', price: 108300 }))), 'NO_QUOTE');
    for (let i = 0; i < E.MAX_ORDERS; i++) E.placeOrder(st, ord({ dir: 1, type: 'limit', price: 108300 - i }));
    assert.equal(code(() => E.placeOrder(st, ord({ dir: 1, type: 'limit', price: 108200 }))), 'MAX_ORDERS');
  });
  it('the order remembers when it was placed (the last revealed bar)', () => {
    const st = st0(), o = E.placeOrder(st, ord({ dir: 1, type: 'limit', price: 108300, section: 2 }));
    assert.equal(o.placedBarT, T0); assert.equal(o.placedT, T0 + 60); assert.equal(o.section, 2);
  });
  it('modify (same rules, unchanged on error) and cancel', () => {
    const st = st0(), o = E.placeOrder(st, ord({ dir: 1, type: 'limit', price: 108300 }));
    E.modifyOrder(st, o.id, { price: 108290, sl: 108270, tp: 108330 });
    assert.deepEqual([st.orders[0].price, st.orders[0].sl, st.orders[0].tp], [108290, 108270, 108330]);
    assert.equal(code(() => E.modifyOrder(st, o.id, { price: 108400 })), 'LIMIT_BUY');
    assert.equal(st.orders[0].price, 108290);
    assert.equal(code(() => E.modifyOrder(st, 'nope', { price: 1 })), 'NOT_FOUND');
    assert.equal(E.cancelOrder(st, o.id).id, o.id); assert.equal(st.orders.length, 0); assert.equal(E.cancelOrder(st, o.id), null);
  });
});

describe('bt-orders: fills', () => {
  it('never in the bar the order was placed in (no look-ahead), then in the next bar that reaches the level', () => {
    const st = st0(), o = E.placeOrder(st, ord({ dir: 1, type: 'limit', price: 108300 }));
    assert.equal(E.onBar(st, [T0, 108309, 108309, 108200, 108250]).length, 0);       // same bar time as the placement: ignored
    assert.equal(st.open.length, 0); assert.equal(st.orders.length, 1);
    E.onBar(st, bar(1, 108309, 108312, 108305, 108308));                              // does not reach 108298 (bid)
    assert.equal(st.open.length, 0);
    E.onBar(st, bar(2, 108320, 108325, 108290, 108300));                              // falling bar crosses 108298
    assert.equal(st.open.length, 1); assert.equal(st.orders.length, 0);
    const p = st.open[0];
    assert.equal(p.id, o.id); assert.equal(p.entry, 108300); assert.equal(p.entryT, T0 + 120); assert.equal(p.gap, false); assert.equal(p.fromOrder, 'limit');
    const ev = plain(E.takeEvents(st));
    assert.equal(ev.length, 1); assert.equal(ev[0].kind, 'fill'); assert.equal(ev[0].position.id, o.id);
    assert.equal(E.takeEvents(st).length, 0);
  });
  it('gaps: a limit fills at the better open, a stop slips to the open', () => {
    let st = st0(); E.placeOrder(st, ord({ dir: 1, type: 'limit', price: 108300 }));
    E.onBar(st, bar(1, 108280, 108290, 108270, 108285));                              // opens at bid 108280 = ask 108282 < 108300
    assert.equal(st.open[0].entry, 108282); assert.equal(st.open[0].gap, true);
    st = st0(); E.placeOrder(st, ord({ dir: 1, type: 'stop', price: 108330 }));
    E.onBar(st, bar(1, 108340, 108350, 108338, 108345));                              // ask 108342 > 108330
    assert.equal(st.open[0].entry, 108342); assert.equal(st.open[0].gap, true);
    st = st0(); E.placeOrder(st, ord({ dir: -1, type: 'stop', price: 108280 }));
    E.onBar(st, bar(1, 108270, 108275, 108260, 108265));
    assert.equal(st.open[0].entry, 108270); assert.equal(st.open[0].dir, -1);
    st = st0(); E.placeOrder(st, ord({ dir: -1, type: 'limit', price: 108320 }));
    E.onBar(st, bar(1, 108330, 108335, 108325, 108331));                              // a sell limit gets the higher open
    assert.equal(st.open[0].entry, 108330);
  });
  it('no gap: exactly the order price (a sell limit on a rising bar)', () => {
    const st = st0(); E.placeOrder(st, ord({ dir: -1, type: 'limit', price: 108330 }));
    E.onBar(st, bar(1, 108310, 108335, 108305, 108332));
    assert.equal(st.open[0].entry, 108330); assert.equal(st.open[0].gap, false);
  });
  it('commission and R:R come from the fill price', () => {
    const st = st0(); E.placeOrder(st, ord({ dir: 1, type: 'limit', price: 108300, sl: 108270, tp: 108340, steps: 37 }));
    E.onBar(st, bar(1, 108280, 108290, 108278, 108289));                              // gap: fill 108282
    const p = st.open[0];
    assert.equal(p.entry, 108282); assert.equal(p.comm, E.commissionCents('EURUSD', 700, 37)); assert.equal(p.rr, E.rrHundredths(108282, 108270, 108340));
  });
  it('a filled position is checked by the normal SL/TP rule from the next bar on', () => {
    const st = st0(); E.placeOrder(st, ord({ dir: 1, type: 'limit', price: 108300, tp: 108320 }));
    E.onBar(st, bar(1, 108320, 108322, 108296, 108305));                              // falling: fill, then down to the close, no TP
    assert.equal(st.open.length, 1);
    const closed = E.onBar(st, bar(2, 108305, 108325, 108300, 108318));
    assert.equal(closed.length, 1); assert.equal(closed[0].reason, 'tp'); assert.equal(closed[0].exitT, T0 + 120); assert.equal(!!closed[0].intrabar, false);
  });
});

describe('bt-orders: inside one 1m bar', () => {
  it('the bar path: rising open -> low -> high -> close, falling open -> high -> low -> close', () => {
    assert.deepEqual(plain(E.barPath([0, 10, 15, 5, 12])), [10, 5, 15, 12]);
    assert.deepEqual(plain(E.barPath([0, 10, 15, 5, 8])), [10, 15, 5, 8]);
  });
  it('fill and SL in the same bar: closed at the SL, flagged as decided by the bar path', () => {
    const st = st0(); E.placeOrder(st, ord({ dir: 1, type: 'limit', price: 108300, sl: 108280 }));
    const closed = E.onBar(st, bar(1, 108320, 108322, 108270, 108275));               // falls through the limit and the stop
    assert.equal(closed.length, 1); assert.equal(st.open.length, 0);
    const t = closed[0];
    assert.equal(t.reason, 'sl'); assert.equal(t.exit, 108280); assert.equal(t.entry, 108300); assert.equal(t.intrabar, true); assert.equal(t.ambiguous, true);
    assert.equal(t.entryT, T0 + 60); assert.equal(t.exitT, T0 + 60);
    assert.equal(st.realizedCents, t.net);
    assert.deepEqual(plain(E.takeEvents(st).map((e) => e.kind)), ['fill']);
  });
  it('the low BEFORE the fill does not stop the position out: a buy stop on a rising bar reaches its TP', () => {
    const st = st0(); E.placeOrder(st, ord({ dir: 1, type: 'stop', price: 108320, sl: 108300, tp: 108340 }));
    const closed = E.onBar(st, bar(1, 108310, 108345, 108295, 108344));               // o -> low 108295 (< SL) -> high -> close
    assert.equal(closed.length, 1); assert.equal(closed[0].reason, 'tp'); assert.equal(closed[0].entry, 108320); assert.equal(closed[0].exit, 108340);
  });
  it('fill on the way down, TP on the way up (rising bar)', () => {
    const st = st0(); E.placeOrder(st, ord({ dir: 1, type: 'limit', price: 108300, sl: 108280, tp: 108330 }));
    const closed = E.onBar(st, bar(1, 108305, 108340, 108290, 108338));
    assert.equal(closed.length, 1); assert.equal(closed[0].reason, 'tp');
  });
  it('a short: its SL and TP are ask levels (bid + spread)', () => {
    let st = st0(); E.placeOrder(st, ord({ dir: -1, type: 'limit', price: 108330, sl: 108350 }));
    let closed = E.onBar(st, bar(1, 108310, 108347, 108305, 108346));                 // rising: fill at 108330, bid peaks 108347 = ask 108349 < SL
    assert.equal(closed.length, 0); assert.equal(st.open.length, 1);
    st = st0(); E.placeOrder(st, ord({ dir: -1, type: 'limit', price: 108330, sl: 108350 }));
    closed = E.onBar(st, bar(1, 108310, 108348, 108305, 108346));                      // bid 108348 = ask 108350: SL
    assert.equal(closed.length, 1); assert.equal(closed[0].reason, 'sl'); assert.equal(closed[0].exit, 108350);
  });
  it('a gap fill can still close at the TP later in the same bar', () => {
    const st = st0(); E.placeOrder(st, ord({ dir: 1, type: 'stop', price: 108330, tp: 108360 }));
    const closed = E.onBar(st, bar(1, 108340, 108365, 108338, 108362));               // gap fill at ask 108342, then up to 108365
    assert.equal(closed.length, 1); assert.equal(closed[0].entry, 108342); assert.equal(closed[0].reason, 'tp');
  });
  it('two orders in one bar both fill, in the order they were placed', () => {
    const st = st0();
    const a = E.placeOrder(st, ord({ dir: 1, type: 'limit', price: 108300 })), b = E.placeOrder(st, ord({ dir: 1, type: 'limit', price: 108290 }));
    E.onBar(st, bar(1, 108320, 108322, 108280, 108285));
    assert.deepEqual(plain(st.open.map((p) => p.id)), [a.id, b.id]);
    assert.deepEqual(plain(st.open.map((p) => p.entry)), [108300, 108290]);
  });
});

describe('bt-orders: refusals', () => {
  it('20 open positions: the order is dropped with a reject event', () => {
    const st = st0();
    for (let i = 0; i < E.MAX_POSITIONS; i++) E.openPosition(st, { id: 'p' + i, dir: 1, steps: 1 });
    E.placeOrder(st, ord({ dir: 1, type: 'limit', price: 108300 }));
    E.onBar(st, bar(1, 108320, 108322, 108290, 108300));
    assert.equal(st.open.length, E.MAX_POSITIONS); assert.equal(st.orders.length, 0);
    const ev = E.takeEvents(st); assert.equal(ev[0].kind, 'reject'); assert.equal(ev[0].code, 'MAX_POSITIONS');
  });
  it('the page guard (monthly trade limit) refuses a fill', () => {
    const st = st0(); st.allowFill = () => 'TRADE_LIMIT';
    E.placeOrder(st, ord({ dir: 1, type: 'limit', price: 108300 }));
    E.onBar(st, bar(1, 108320, 108322, 108290, 108300));
    assert.equal(st.open.length, 0); assert.equal(st.orders.length, 0);
    assert.equal(E.takeEvents(st)[0].code, 'TRADE_LIMIT');
  });
  it('no equity left: refused', () => {
    const st = st0(); st.realizedCents = -st.startCents;
    E.placeOrder(st, ord({ dir: 1, type: 'limit', price: 108300 }));
    E.onBar(st, bar(1, 108320, 108322, 108290, 108300));
    assert.equal(E.takeEvents(st)[0].code, 'NO_EQUITY');
  });
});

describe('bt-orders: storage', () => {
  it('sanitizeOrders keeps valid orders only', () => {
    const ok = { id: 'a', dir: 1, type: 'limit', price: 108300, steps: 10, sl: null, tp: 108330, placedT: T0 + 60, placedBarT: T0, seq: 5, section: 2 };
    const out = plain(E.sanitizeOrders([ok, { ...ok, id: 'b', type: 'market' }, { ...ok, id: 'c', price: -1 }, { ...ok, id: 'd', sl: 1.5 }, null, { ...ok, id: 'e', placedT: 'x' }]));
    assert.deepEqual(out.map((o) => o.id), ['a']); assert.equal(out[0].section, 2);
    assert.deepEqual(plain(E.sanitizeOrders('nope')), []);
  });
});
