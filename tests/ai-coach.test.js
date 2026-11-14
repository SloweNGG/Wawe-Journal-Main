// ============================================================
// AI coach: chart directives (supabase/functions/_shared/visuals.ts), Gemini stream rebuilding (gemini-stream.ts), the knowledge
// base listing only real datasets (coach-knowledge.ts) and the equity curve (trade-summary.ts).
// Runner: node --test tests/*.test.js
// ============================================================
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveVisuals, buildVisual, MAX_VISUALS } from '../supabase/functions/_shared/visuals.ts';
import { takeSseEvents, createStepBuilder } from '../supabase/functions/_shared/gemini-stream.ts';
import { COACH_KNOWLEDGE, VISUAL_DATASETS, VISUAL_METRICS, answerLength, answerLengthRule } from '../supabase/functions/_shared/coach-knowledge.ts';
import { summarizeTrades, equityCurve } from '../supabase/functions/_shared/trade-summary.ts';

const S = [{ id: 's1', name: 'Breakout' }, { id: 's2', name: 'Scalp' }];
const rows = [];
for (let i = 0; i < 40; i++) {
  const d = new Date(Date.UTC(2026, 8, 1 + i, 8 + (i % 10)));
  rows.push({ symbol: i % 2 ? 'EURUSD' : 'XAUUSD', direction: 'BUY', lot: 1, entry_price: 1, exit_price: i % 3 === 0 ? 0.95 : 1.06, stop_loss: 0.95, pnl: i % 3 === 0 ? -80 : 60,
    rr_ratio: 1, trade_date: d.toISOString(), exit_date: new Date(+d + 3600e3).toISOString(), strategy_id: i % 4 ? 's1' : 's2', platform_source: null });
}
const summary = summarizeTrades(rows, S, { tz: 'UTC' });
const eq = equityCurve(rows);

describe('visuals', () => {
  it('kpis, equity and bars come from the summary, not from the model', () => {
    const k = buildVisual('kpis', summary, eq);
    assert.equal(k.kind, 'kpis'); assert.deepEqual(k.items.map((x) => x.id), ['win_rate', 'net', 'profit_factor', 'max_drawdown']);
    assert.equal(k.items[1].value, summary.totals.net);
    const e = buildVisual('equity', summary, eq);
    assert.equal(e.points.length, 40); assert.equal(e.points[39].v, summary.totals.net);
    const b = buildVisual('bar:by_strategy:net', summary, eq);
    assert.equal(b.unit, 'money'); assert.deepEqual(b.items.map((x) => x.label), ['Breakout', 'Scalp']);   // best first
    assert.ok(b.items[0].value >= b.items[1].value);
  });
  it('time-like buckets keep their order; object datasets work', () => {
    const w = buildVisual('bar:by_weekday:win_rate', summary, eq);
    const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    assert.deepEqual(w.items.map((x) => x.label), order.filter((d) => w.items.some((x) => x.label === d)));
    const a = buildVisual('bar:after_consecutive_losses:win_rate', summary, eq);
    assert.equal(a.unit, 'pct'); assert.deepEqual(a.items.map((x) => x.label), ['0', '1'].concat(a.items.length > 2 ? ['2+'] : []));
  });
  it('unknown datasets/metrics and empty data are rejected', () => {
    assert.equal(buildVisual('bar:by_planet:net', summary, eq), null);
    assert.equal(buildVisual('bar:by_symbol:sharpe', summary, eq), null);
    assert.equal(buildVisual('pie', summary, eq), null);
    assert.equal(buildVisual('kpis', summarizeTrades([], []), []), null);
    assert.equal(buildVisual('equity', summary, eq.slice(0, 1)), null);
  });
  it('resolveVisuals keeps valid lines, drops invalid, surplus and inline ones', () => {
    const text = 'Intro.\n[[viz:kpis]]\nMore.\n  [[viz:bar:by_planet:net]]  \nText [[viz:equity]] inline.\n[[viz:bar:by_symbol:net]]\n[[viz:equity]]\n[[viz:bar:by_weekday:net]]\nEnd.';
    const r = resolveVisuals(text, summary, eq);
    assert.deepEqual(Object.keys(r.visuals), ['kpis', 'bar:by_symbol:net', 'equity']);
    assert.equal(Object.keys(r.visuals).length, MAX_VISUALS);
    assert.match(r.text, /^Intro\.\n\[\[viz:kpis\]\]\nMore\./);
    assert.ok(!/by_planet|by_weekday/.test(r.text));
    assert.match(r.text, /Text  inline\./);                       // the inline directive is removed, the sentence stays
    assert.match(r.text, /\[\[viz:bar:by_symbol:net\]\]\n\[\[viz:equity\]\]\n+End\./);     // a dropped line may leave a blank line (not rendered)
  });
  it('the same chart twice keeps both lines with one data entry', () => {
    const r = resolveVisuals('[[viz:kpis]]\nx\n[[viz:kpis]]', summary, eq);
    assert.equal(r.text, '[[viz:kpis]]\nx\n[[viz:kpis]]'); assert.equal(Object.keys(r.visuals).length, 1);
  });
  it('the knowledge base only offers datasets and metrics that exist', () => {
    for (const d of VISUAL_DATASETS) assert.ok(d in summary, d + ' missing in the summary');
    for (const m of VISUAL_METRICS) assert.ok(m in summary.by_strategy[0], m + ' missing in a bucket');
    for (const m of COACH_KNOWLEDGE.matchAll(/\[\[viz:([a-z_:]+)\]\]/g)) assert.ok(buildVisual(m[1], summary, eq), 'example ' + m[1] + ' does not resolve');
  });
  it('equity curve is thinned to at most 80 points, first and last kept, backtest and open trades left out', () => {
    const many = []; for (let i = 0; i < 500; i++) many.push({ ...rows[0], pnl: 1, trade_date: new Date(Date.UTC(2025, 0, 1) + i * 864e5).toISOString(), exit_date: null });
    many.push({ ...rows[0], pnl: 999, platform_source: 'backtest' }, { ...rows[0], exit_price: null, pnl: 999 });
    const c = equityCurve(many);
    assert.equal(c.length, 80); assert.equal(c[0].v, 1); assert.equal(c[79].v, 500); assert.equal(c[0].t, '2025-01-01');
  });
});

describe('gemini-stream', () => {
  const sse = (o) => 'event: ' + o.event_type + '\ndata: ' + JSON.stringify(o) + '\n\n';
  const events = [
    { event_type: 'interaction.created', interaction: { id: 'v1', status: 'in_progress' } },
    { event_type: 'step.start', index: 0, step: { type: 'thought' } },
    { event_type: 'step.delta', index: 0, delta: { type: 'thought_signature', signature: 'SIG' } },
    { event_type: 'step.stop', index: 0 },
    { event_type: 'step.start', index: 1, step: { type: 'model_output' } },
    { event_type: 'step.delta', index: 1, delta: { type: 'text', text: 'Merhaba ' } },
    { event_type: 'step.delta', index: 1, delta: { type: 'text', text: 'dünya.\n[[viz:kpis]]' } },
    { event_type: 'step.delta', index: 1, delta: { type: 'something_new', x: 1 } },
    { event_type: 'step.stop', index: 1 },
    { event_type: 'interaction.completed', interaction: { status: 'completed', usage: { total_tokens: 9 } } },
  ];
  it('rebuilds the steps (thought signature + text) exactly like the non-streaming answer', () => {
    const wire = events.map(sse).join('') + 'event: done\ndata: [DONE]\n\n';
    const b = createStepBuilder(), deltas = [];
    // feed in awkward chunks: events split across reads
    let buf = '';
    for (let i = 0; i < wire.length; i += 7) {
      buf += wire.slice(i, i + 7);
      const { events: ev, rest } = takeSseEvents(buf); buf = rest;
      for (const e of ev) { const d = b.push(e); if (d) deltas.push(d); }
    }
    const r = b.result();
    assert.deepEqual(deltas, ['Merhaba ', 'dünya.\n[[viz:kpis]]']);
    assert.deepEqual(r.steps, [{ type: 'thought', signature: 'SIG' }, { type: 'model_output', content: [{ type: 'text', text: 'Merhaba dünya.\n[[viz:kpis]]' }] }]);
    assert.equal(r.text, 'Merhaba dünya.\n[[viz:kpis]]'); assert.equal(r.status, 'completed'); assert.equal(r.error, null);
  });
  it('an error event is reported; CRLF and broken events are tolerated', () => {
    const b = createStepBuilder();
    const { events: ev } = takeSseEvents('data: {broken\r\n\r\nevent: error\r\ndata: {"event_type":"error","error":{"code":"service_unavailable","message":"busy"}}\r\n\r\n');
    ev.forEach((e) => b.push(e));
    assert.deepEqual(b.result().error, { code: 'service_unavailable', message: 'busy' }); assert.equal(b.result().text, '');
  });
});

import { pickInsights, snapshotNumbers } from '../supabase/functions/_shared/insights.ts';
import fs from 'node:fs';

describe('insights (opening screen)', () => {
  // a journal with revenge trading, missing stops and a losing strategy
  const R = []; let streak = 0;
  for (let i = 0; i < 80; i++) {
    const d = new Date(Date.UTC(2026, 8, 1, 8) + i * 7 * 3600e3);
    const win = streak >= 2 ? i % 5 === 0 : i % 2 === 0;
    const sid = i % 3 === 0 ? 's2' : 's1';
    R.push({ symbol: 'EURUSD', direction: 'BUY', lot: 1, entry_price: 1, exit_price: 1.1, stop_loss: i % 4 === 0 ? null : 0.9,
      pnl: win ? 100 : (sid === 's2' ? -150 : -60), trade_date: d.toISOString(), exit_date: new Date(+d + (win ? 30 : 120) * 60e3).toISOString(), strategy_id: sid, platform_source: null });
    streak = win ? 0 : streak + 1;
  }
  const sum = summarizeTrades(R, [{ id: 's1', name: 'Breakout' }, { id: 's2', name: 'Scalp' }], { tz: 'UTC' });
  it('finds the strongest leaks first, at most 3', () => {
    const ins = pickInsights(sum);
    assert.ok(ins.length <= 3 && ins.length > 0);
    const ids = ins.map((x) => x.id);
    assert.ok(ids.includes('no_stop'), ids.join());
    assert.ok(ins.every((x, i) => i === 0 || ins[i - 1].severity >= x.severity));
    const ns = ins.find((x) => x.id === 'no_stop'); assert.equal(ns.params.pct, 25);
  });
  it('a journal without trades gets the starter finding', () => {
    assert.deepEqual(pickInsights(summarizeTrades([], [])).map((x) => x.id), ['no_trades']);
  });
  it('small buckets are not reported', () => {
    const few = summarizeTrades(R.slice(0, 6), [{ id: 's1', name: 'Breakout' }, { id: 's2', name: 'Scalp' }], { tz: 'UTC' });
    const ids = pickInsights(few, 10).map((x) => x.id);
    assert.ok(!ids.includes('revenge') && !ids.includes('weak_weekday') && !ids.includes('weak_strategy'), ids.join());
  });
  it('snapshot numbers: this month only when the last month bucket is the current month', () => {
    const last = sum.by_month_last_12[sum.by_month_last_12.length - 1];
    assert.equal(snapshotNumbers(sum, last.key).month.trades, last.trades);
    assert.equal(snapshotNumbers(sum, '2099-01').month.trades, 0);
    assert.equal(snapshotNumbers(sum, '2099-01').overall.trades, sum.totals.trades);
  });
  it('every finding the server can send has text in the panel and in all locales', async () => {
    const src = fs.readFileSync('supabase/functions/_shared/insights.ts', 'utf8');
    const ids = [...new Set([...src.matchAll(/id: '([a-z_]+)'/g)].map((m) => m[1]))];
    const panel = fs.readFileSync('public/components/ai-coach/ai-coach.js', 'utf8');
    for (const id of ids) assert.match(panel, new RegExp('\\n    ' + id + ": \\["), id + ' missing in INSIGHT_TR');
    for (const l of ['tr', 'en', 'de']) {
      const loc = (await import('../public/i18n/locales/' + l + '.js')).default;
      for (const id of ids) { assert.ok(loc['aiCoach.insight.' + id], l + ' insight ' + id); assert.ok(loc['aiCoach.insight_q.' + id], l + ' question ' + id); }
    }
  });
});

describe('answer length setting', () => {
  it('accepts only short / normal / detailed and adds a rule only for short and detailed', () => {
    assert.equal(answerLength('short'), 'short');
    assert.equal(answerLength('detailed'), 'detailed');
    for (const v of [undefined, null, '', 'long', 1, { toString: () => 'short ' }]) assert.equal(answerLength(v), 'normal');
    assert.equal(answerLengthRule('normal'), '');
    assert.match(answerLengthRule('short'), /80 words/);
    assert.match(answerLengthRule('detailed'), /300-500 words/);
  });
});

// ------------------------------------------------------------------ richer data for the coach (2026-11-14)
import { rMultiple, R_BUCKETS } from '../supabase/functions/_shared/trade-summary.ts';
import { propContext } from '../supabase/functions/_shared/prop-context.ts';

const day = (d, h = 9) => new Date(Date.UTC(2026, 9, d, h)).toISOString();
function T(o) { return { symbol: 'EURUSD', direction: 'BUY', lot: 1, entry_price: 1.1, stop_loss: 1.09, take_profit: 1.12, trade_date: day(1), platform_source: null, ...o }; }

describe('R multiples and execution', () => {
  it('R uses the recorded stop as the risk, both directions; no / moved stop gives null', () => {
    assert.equal(Math.round(rMultiple(T({ exit_price: 1.12 })) * 100) / 100, 2);
    assert.equal(Math.round(rMultiple(T({ exit_price: 1.09 })) * 100) / 100, -1);
    assert.equal(Math.round(rMultiple(T({ direction: 'SELL', stop_loss: 1.11, exit_price: 1.08 })) * 100) / 100, 2);
    assert.equal(rMultiple(T({ exit_price: 1.12, stop_loss: null })), null);
    assert.equal(rMultiple(T({ exit_price: 1.12, stop_loss: 1.1 })), null);          // moved to break-even
    assert.equal(rMultiple(T({ exit_price: 1.12, stop_loss: 1.105 })), null);        // trailed into profit (long, stop above entry)
    assert.equal(rMultiple(T({ exit_price: null })), null);
  });
  it('losses beyond the stop, target capture and the R distribution', () => {
    const list = [];
    for (let i = 0; i < 10; i++) list.push(T({ exit_price: 1.11, pnl: 100, trade_date: day(1 + i) }));           // +1R of a 2R plan: 50 % capture
    for (let i = 0; i < 6; i++) list.push(T({ exit_price: 1.09, pnl: -100, trade_date: day(12 + i) }));          // -1R
    for (let i = 0; i < 5; i++) list.push(T({ exit_price: 1.08, pnl: -200, trade_date: day(20 + i) }));          // -2R: stop not held
    const s = summarizeTrades(list, [], { tz: 'UTC' });
    const r = s.r_multiples;
    assert.equal(r.trades_with_r, 21); assert.equal(r.losses_with_r, 11);
    assert.deepEqual(r.losses_beyond_stop, { trades: 5, pct_of_losses: 45.5, avg_r: -2 });
    assert.equal(r.winners_target_capture_median_pct, 50); assert.equal(r.winners_closed_before_80pct_of_target_pct, 100);
    assert.equal(r.planned_rr_avg, 2); assert.equal(r.expectancy_r, -0.29);
    assert.deepEqual(s.r_buckets.map((b) => [b.key, b.trades]), [[R_BUCKETS[0], 5], [R_BUCKETS[1], 6], [R_BUCKETS[4], 10]]);
    const v = buildVisual('bar:r_buckets:trades', s, []);
    assert.deepEqual(v.items.map((x) => x.label), [R_BUCKETS[0], R_BUCKETS[1], R_BUCKETS[4]]);   // natural order, not by value
    const ids = pickInsights(s, 10).map((x) => x.id);
    assert.ok(ids.includes('stop_overrun') && ids.includes('early_exit'), ids.join());
  });
});

describe('position size, costs, recent form, extremes, backtest vs live', () => {
  // 40 trades: after a loss the next trade is twice the usual lot and loses
  const list = []; let prevLoss = false;
  for (let i = 0; i < 40; i++) {
    const loss = prevLoss || i % 4 === 0;
    list.push(T({ lot: prevLoss ? 2 : 1, exit_price: loss ? 1.09 : 1.12, pnl: loss ? -100 * (prevLoss ? 2 : 1) : 150, trade_date: day(1 + (i >> 1), 8 + (i % 2) * 4),
      exit_date: day(1 + (i >> 1), 9 + (i % 2) * 4), commission: 7, swap: -1, gross_pnl: (loss ? -100 * (prevLoss ? 2 : 1) : 150) + 8, notes: i === 1 ? 'revenge, wanted it back' : null }));
    prevLoss = !prevLoss && loss;
  }
  const s = summarizeTrades(list, [], { tz: 'UTC', now: Date.parse(day(20, 15)) });
  it('size after a loss vs after a win, oversized trades', () => {
    const p = s.position_sizing;
    assert.equal(p.avg_size_after_win, 1); assert.equal(p.avg_size_after_loss, 1.5);   // half of the after-loss trades are doubled
    assert.ok(p.oversized_1_5x.trades >= 5 && p.oversized_1_5x.net < 0 && p.oversized_1_5x.after_a_loss === p.oversized_1_5x.trades);
    assert.ok(pickInsights(s, 10).some((x) => x.id === 'size_after_loss'));
  });
  it('costs: commission positive cost, swap signed; pnl = gross - commission + swap', () => {
    const c = s.costs;
    assert.equal(c.commission_total, 280); assert.equal(c.swap_total, -40); assert.equal(c.net_cost_total, 320); assert.equal(c.avg_cost_per_trade, 8);
    assert.ok(c.cost_pct_of_gross_profit > 0);
    assert.equal(summarizeTrades(list.map((t) => ({ ...t, commission: null, swap: null })), []).costs, null);
  });
  it('recent form, today, largest trades with notes', () => {
    assert.equal(s.recent_form.last_20.trades, 20); assert.equal(s.recent_form.before.trades, 20);
    assert.equal(s.now_local.date, '2026-10-20'); assert.equal(s.today.opened, 2);
    assert.equal(s.largest_losses[0].pnl, -200); assert.ok(s.largest_losses.length <= 8 && s.largest_wins.length <= 5);
    assert.ok(s.largest_losses.some((x) => x.notes === 'revenge, wanted it back'));
    assert.equal(summarizeTrades(list.slice(0, 20), []).recent_form, undefined);
  });
  it('backtest vs live per strategy and symbol, backtest kept out of the live numbers', () => {
    const live = [], bt = [];
    for (let i = 0; i < 12; i++) live.push(T({ strategy_id: 's1', exit_price: i % 4 ? 1.09 : 1.12, pnl: i % 4 ? -100 : 200, trade_date: day(1 + i) }));
    for (let i = 0; i < 12; i++) bt.push(T({ strategy_id: 's1', platform_source: 'backtest', exit_price: i % 4 ? 1.12 : 1.09, pnl: i % 4 ? 200 : -100, trade_date: day(1 + i) }));
    const x = summarizeTrades([...live, ...bt], [{ id: 's1', name: 'Breakout' }], { tz: 'UTC' });
    assert.equal(x.totals.trades, 12);
    const g = x.backtest_vs_live.by_strategy[0];
    assert.equal(g.key, 'Breakout'); assert.equal(g.live.win_rate, 25); assert.equal(g.backtest.win_rate, 75);
    const ins = pickInsights(x, 10).find((i) => i.id === 'backtest_gap');
    assert.deepEqual(ins.params, { name: 'Breakout', live: 25, backtest: 75, trades: 12 });
  });
});

describe('prop challenge context', () => {
  it('the coach\'s prop engine is the app\'s engine, byte for byte', () => {
    assert.equal(fs.readFileSync('supabase/functions/_shared/prop-calculator.js', 'utf8'), fs.readFileSync('public/src/utils/prop-calculator.js', 'utf8'),
      'copy public/src/utils/prop-calculator.js to supabase/functions/_shared/prop-calculator.js and redeploy ai-coach');
  });
  const acc = { id: 'p1', journal_id: 'j1', template_key: 'ftmo', starting_balance: 10000, start_date: '2026-10-01', reset_tz: 'Europe/Prague', time_shift_hours: 0,
    rules: { phase_name: 'Phase 1', daily_loss_limit_pct: 5, max_loss_limit_pct: 10, profit_target_pct: 10, min_trading_days: 4 } };
  it('quotes the card\'s numbers and how many typical losses still fit', () => {
    const rows = [
      { trade_date: '2026-10-02T09:00:00Z', pnl: -200, exit_price: 1 }, { trade_date: '2026-10-03T09:00:00Z', pnl: -200, exit_price: 1 },
      { trade_date: '2026-10-05T09:00:00Z', pnl: 300, exit_price: 1 }, { trade_date: '2026-10-06T09:00:00Z', pnl: -200, exit_price: 1 },
      { trade_date: '2026-10-06T10:00:00Z', pnl: -200, exit_price: 1 },
      { trade_date: '2026-10-06T11:00:00Z', pnl: 5000, exit_price: 1, platform_source: 'backtest' },   // never counted
      { trade_date: '2026-10-06T12:00:00Z', pnl: 999, exit_price: null },                              // open: not counted
    ];
    const p = propContext(acc, 'FTMO 10k', rows, { currentDate: '2026-10-06' });
    assert.equal(p.status, 'in_progress'); assert.equal(p.journal, 'FTMO 10k'); assert.equal(p.phase, 'Phase 1');
    assert.equal(p.balance, 9500); assert.equal(p.daily_loss.limit, 500); assert.equal(p.daily_loss.today_result, -400);
    assert.equal(p.daily_loss.room_left_today, 100); assert.equal(p.max_loss.room_left, 500);
    assert.equal(p.avg_loss_in_phase, 200); assert.equal(p.avg_losses_until_daily_limit, 0); assert.equal(p.avg_losses_until_max_loss, 2);
    assert.equal(p.profit_target.remaining, 1500);
    const ins = pickInsights({ totals: { trades: 5, win_rate: 20 }, prop_accounts: [p] });
    assert.equal(ins[0].id, 'prop_daily_limit'); assert.deepEqual(ins[0].params, { journal: 'FTMO 10k', room: 100, losses: 0 });
  });
  it('a broken rule is reported; bad rules do not throw', () => {
    const rows = [{ trade_date: '2026-10-02T09:00:00Z', pnl: -600, exit_price: 1 }];
    const p = propContext(acc, 'X', rows, { currentDate: '2026-10-06' });
    assert.equal(p.status, 'failed'); assert.ok(p.fail_reasons.includes('DAILY_LOSS_EXCEEDED'));
    assert.equal(pickInsights({ totals: { trades: 1, win_rate: 0 }, prop_accounts: [p] })[0].id, 'prop_failed');
    assert.equal(propContext({ ...acc, starting_balance: 0 }, 'X', rows).status, 'invalid_rules');
    assert.equal(propContext({ ...acc, reset_tz: null }, 'X', rows), null);
  });
});

describe('backtest accounts', async () => {
  const { backtestContext, asTradeRow } = await import('../supabase/functions/_shared/backtest-context.ts');
  const acc = [
    { id: 'a1', name: 'Gold 1h', symbol: 'XAUUSD', timeframe: '1h', starting_balance: 10000, data_source: 'ctrader', journal_id: 'j1', is_active: true, updated_at: '2026-11-01' },
    { id: 'a2', name: 'Practice', symbol: 'EURUSD', timeframe: '15m', starting_balance: 5000, data_source: 'synthetic', is_active: true, updated_at: '2026-11-02' },
    { id: 'a3', name: 'Old', symbol: 'GBPUSD', starting_balance: 1000, data_source: 'synthetic', is_active: false, updated_at: '2026-12-01' },
  ];
  const bt = [];
  // a1: 20 closed XAUUSD trades: 8 TP (+2R, +200), 10 SL (-1R, -100), 2 manual (-150); one open position
  for (let i = 0; i < 20; i++) {
    const reason = i < 8 ? 'tp' : i < 18 ? 'sl' : 'manual';
    const exit = reason === 'tp' ? 2020 : reason === 'sl' ? 1990 : 1985;
    bt.push({ id: 'b' + i, backtest_account_id: 'a1', symbol: 'XAUUSD', direction: 'LONG', lot: 1, entry_price: 2000, initial_stop_loss: 1990, initial_take_profit: 2020,
      stop_loss: 2000 /* moved to break-even later: the plan is the initial stop */, take_profit: 2020, exit_price: exit, pnl: reason === 'tp' ? 200 : reason === 'sl' ? -100 : -150,
      commission: 5, entry_time: new Date(Date.UTC(2025, 0, 1 + i, 8)).toISOString(), exit_time: new Date(Date.UTC(2025, 0, 1 + i, 10)).toISOString(), exit_reason: reason, exit_ambiguous: i === 0 });
  }
  bt.push({ id: 'open', backtest_account_id: 'a1', symbol: 'XAUUSD', direction: 'SHORT', lot: 1, entry_price: 2000, entry_time: '2025-02-01T08:00:00Z', exit_time: null, exit_price: null, pnl: null, exit_reason: null });
  for (let i = 0; i < 6; i++) bt.push({ id: 'p' + i, backtest_account_id: 'a2', symbol: 'EURUSD', direction: 'SHORT', lot: 0.5, entry_price: 1.1, initial_stop_loss: 1.11, exit_price: 1.09, pnl: 50,
    entry_time: new Date(Date.UTC(2025, 1, 1 + i)).toISOString(), exit_time: new Date(Date.UTC(2025, 1, 1 + i, 1)).toISOString(), exit_reason: 'manual' });
  const live = [];
  for (let i = 0; i < 6; i++) live.push(T({ symbol: 'XAUUSD', entry_price: 2000, stop_loss: 1990, exit_price: 1990, pnl: -100, trade_date: day(1 + i) }));
  live.push(T({ symbol: 'XAUUSD', pnl: 9999, platform_source: 'backtest' }));                   // a journal mirror: not a live trade
  const ctx = backtestContext(acc, bt, live, new Map([['j1', 'Main']]));

  it('per account: balance, result, exit reasons, R against the initial stop, drawdown', () => {
    const g = ctx.accounts.find((a) => a.name === 'Gold 1h');
    assert.equal(g.data, 'real_market_history'); assert.equal(g.linked_journal, 'Main');
    assert.equal(g.totals.trades, 20); assert.equal(g.totals.open_positions, 1);
    assert.equal(g.balance, 10000 + 8 * 200 - 10 * 100 - 2 * 150); assert.equal(g.result_pct, 3);
    assert.deepEqual(g.exit_reasons.map((x) => [x.key, x.trades, x.net]), [['tp', 8, 1600], ['sl', 10, -1000], ['manual', 2, -300]]);
    assert.equal(g.r_multiples.trades_with_r, 20);                                             // the moved stop did not hide R
    assert.equal(g.r_multiples.avg_win_r, 2); assert.equal(g.r_multiples.losses_beyond_stop.trades, 2);   // manual -1.5R
    assert.equal(g.max_consecutive_losses, 12); assert.equal(g.max_drawdown, 1300); assert.equal(g.same_bar_tp_sl, 1);
    assert.equal(g.commission_total, 100);
    assert.equal(asTradeRow(bt[0]).stop_loss, 1990);
  });
  it('synthetic accounts are marked, inactive ones come last, totals split real / synthetic', () => {
    assert.deepEqual(ctx.accounts.map((a) => a.name), ['Practice', 'Gold 1h', 'Old']);      // active + used, newest first; inactive last
    assert.equal(ctx.accounts[0].data, 'synthetic_practice'); assert.equal(ctx.accounts[2].totals.trades, 0);
    assert.equal(ctx.totals.trades, 26); assert.equal(ctx.totals.real_market_trades, 20); assert.equal(ctx.totals.synthetic_trades, 6);
  });
  it('backtest vs live per symbol uses the accounts, not the journal mirrors', () => {
    const x = ctx.vs_live_by_symbol.find((v) => v.key === 'XAUUSD');
    assert.equal(x.live.trades, 6); assert.equal(x.backtest.trades, 20); assert.equal(x.backtest_on_real_market_history, 20);
    assert.ok(!ctx.vs_live_by_symbol.some((v) => v.key === 'EURUSD'));                        // no live EURUSD trades
    assert.equal(backtestContext([], [], []), null);
  });
  it('a losing backtest account over 20+ trades becomes a finding', () => {
    const losing = backtestContext([acc[0]], bt.map((t) => ({ ...t, pnl: t.pnl == null ? null : -Math.abs(t.pnl) })), []);
    const f = pickInsights({ totals: { trades: 1, win_rate: 0 }, backtest_accounts: losing }, 10).find((i) => i.id === 'bt_no_edge');
    assert.deepEqual(f.params, { name: 'Gold 1h', net: losing.accounts[0].totals.net, trades: 20 });
  });
});

describe('dictation (panel)', () => {
  it('every dictation text exists in all locales, and the panel has a Turkish fallback for each', async () => {
    const panel = fs.readFileSync('public/components/ai-coach/ai-coach.js', 'utf8');
    const keys = [...new Set([...panel.matchAll(/_t\('(aiCoach\.(?:dictate[a-z_]*|listening))'/g)].map((m) => m[1]))];
    assert.deepEqual(keys.sort(), ['aiCoach.dictate', 'aiCoach.dictate_denied', 'aiCoach.dictate_failed', 'aiCoach.dictate_network', 'aiCoach.dictate_nomic', 'aiCoach.dictate_stop', 'aiCoach.listening']);
    for (const l of ['tr', 'en', 'de']) {
      const loc = (await import('../public/i18n/locales/' + l + '.js')).default;
      for (const k of keys) assert.ok(loc[k], l + ' ' + k);
    }
  });
});
