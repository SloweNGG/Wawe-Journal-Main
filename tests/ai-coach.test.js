// ============================================================
// AI coach: chart directives (supabase/functions/_shared/visuals.ts), Gemini stream rebuilding (gemini-stream.ts), the knowledge
// base listing only real datasets (coach-knowledge.ts) and the equity curve (trade-summary.ts).
// Runner: node --test tests/*.test.js
// ============================================================
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveVisuals, buildVisual, MAX_VISUALS } from '../supabase/functions/_shared/visuals.ts';
import { takeSseEvents, createStepBuilder } from '../supabase/functions/_shared/gemini-stream.ts';
import { COACH_KNOWLEDGE, VISUAL_DATASETS, VISUAL_METRICS } from '../supabase/functions/_shared/coach-knowledge.ts';
import { summarizeTrades, equityCurve } from '../supabase/functions/_shared/trade-summary.ts';

const S = [{ id: 's1', name: 'Breakout' }, { id: 's2', name: 'Scalp' }];
const rows = [];
for (let i = 0; i < 40; i++) {
  const d = new Date(Date.UTC(2026, 8, 1 + i, 8 + (i % 10)));
  rows.push({ symbol: i % 2 ? 'EURUSD' : 'XAUUSD', direction: 'BUY', lot: 1, entry_price: 1, exit_price: 1.1, pnl: i % 3 === 0 ? -80 : 60,
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
