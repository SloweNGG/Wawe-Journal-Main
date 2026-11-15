// ============================================================
// Trading plan and discipline score (supabase/functions/_shared/discipline.ts) and its use by the coach's findings and
// live alerts.
// Runner: node --test tests/*.test.js
// ============================================================
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cleanPlan, checkTrades, disciplineReport, PLAN_RULES } from '../supabase/functions/_shared/discipline.ts';
import { pickInsights } from '../supabase/functions/_shared/insights.ts';
import { detectAlerts } from '../supabase/functions/_shared/coach-alerts.ts';

// one trade: [local Istanbul time 'YYYY-MM-DD HH:MM', minutes held, pnl, stop?]
function T(local, held, pnl, stop = true) {
  const open = Date.parse(local.replace(' ', 'T') + ':00+03:00');
  return { id: local, trade_date: new Date(open).toISOString(), exit_date: new Date(open + held * 60e3).toISOString(), pnl, exit_price: 1, stop_loss: stop ? 0.9 : null, platform_source: null };
}

describe('trading plan', () => {
  it('cleanPlan keeps only valid rules; nothing valid -> null', () => {
    assert.deepEqual(cleanPlan({ max_trades_per_day: 3, max_daily_loss: '250.555', max_loss_per_trade: -5, require_stop: true, no_trading_after: 22, extra: 1 }),
      { max_trades_per_day: 3, max_daily_loss: 250.56, require_stop: true, no_trading_after: 22 });
    assert.equal(cleanPlan({ max_trades_per_day: 0, no_trading_after: 24, require_stop: 'yes' }), null);
    assert.equal(cleanPlan(null), null); assert.equal(cleanPlan('x'), null);
  });
  it('each rule, in the member\'s day and hours', () => {
    const plan = { max_trades_per_day: 2, max_daily_loss: 150, max_loss_per_trade: 100, require_stop: true, no_trading_after: 21 };
    const trades = [
      T('2026-11-10 09:00', 30, -100), T('2026-11-10 10:00', 30, -60),            // after these two the day is at -160
      T('2026-11-10 12:00', 30, 50),                                              // 3rd trade + opened after the daily loss cap
      T('2026-11-10 21:30', 10, -130, false),                                     // 4th, after hours, no stop, loss > 110 (day at -110: under the cap)
      T('2026-11-11 00:30', 10, 40),                                              // new local day (21:30 UTC on the 10th)
    ];
    const c = checkTrades(plan, trades, 'Europe/Istanbul');
    assert.deepEqual(c.map((x) => x.broken), [[], [], ['max_trades_per_day', 'max_daily_loss'], ['max_trades_per_day', 'max_loss_per_trade', 'require_stop', 'no_trading_after'], []]);   // the day is back at -110 by 21:30
    assert.equal(c[4].day, '2026-11-11');
    // slippage tolerance: a loss of 105 on a 100 cap is fine
    assert.deepEqual(checkTrades({ max_loss_per_trade: 100 }, [T('2026-11-10 09:00', 5, -105)], 'Europe/Istanbul')[0].broken, []);
  });
  it('discipline report: score, cost of breaking the plan, most broken rule; backtest rows ignored', () => {
    const now = Date.parse('2026-11-14T12:00:00Z');
    const trades = [T('2026-11-12 09:00', 30, 120), T('2026-11-12 10:00', 30, -80, false), T('2026-11-13 09:00', 30, 90), T('2026-11-13 11:00', 30, -70, false),
      { ...T('2026-11-13 12:00', 30, -999, false), platform_source: 'backtest' }, T('2026-10-01 09:00', 30, -50, false)];
    const r = disciplineReport({ require_stop: true }, trades, 'Europe/Istanbul', now);
    assert.deepEqual(r.last_7_days, { trades: 4, followed: 2, score: 50, net_following_plan: 210, net_breaking_plan: -150,
      broken_by_rule: { require_stop: { trades: 2, net: -150 } }, days_fully_followed: 0, trading_days: 2 });
    assert.equal(r.last_30_days.trades, 4); assert.equal(r.most_broken_rule_7d, 'require_stop');
    assert.equal(disciplineReport(null, trades, 'UTC'), null);
    for (const k of Object.keys(r.rules)) assert.ok(PLAN_RULES.includes(k));
  });
  it('opening screen: a low score names the rule; a high one is praised; too few trades says nothing', () => {
    const low = pickInsights({ totals: { trades: 10, win_rate: 50 }, trading_plan: { last_7_days: { trades: 8, score: 50 }, most_broken_rule_7d: 'require_stop' } }, 10);
    assert.deepEqual(low.find((x) => x.id === 'plan_discipline').params, { score: 50, rule: 'require_stop', trades: 8 });
    assert.ok(pickInsights({ totals: { trades: 10, win_rate: 50 }, trading_plan: { last_7_days: { trades: 8, score: 95 } } }, 10).some((x) => x.id === 'plan_followed'));
    assert.ok(!pickInsights({ totals: { trades: 10, win_rate: 50 }, trading_plan: { last_7_days: { trades: 3, score: 0 }, most_broken_rule_7d: 'require_stop' } }, 10).some((x) => /^plan_/.test(x.id)));
  });
  it('live alerts: the newest trade broke a plan rule', () => {
    const now = Date.parse('2026-11-14T19:00:00Z');                                   // 22:00 Istanbul
    const t = [T('2026-11-14 21:40', 10, -180, false)];
    const a = detectAlerts({ trades: t, plan: { require_stop: true, max_loss_per_trade: 150, no_trading_after: 21 }, tz: 'Europe/Istanbul', now, journalId: 'j', journalName: 'Main' });
    assert.deepEqual(a.map((x) => x.kind), ['plan_trade_loss', 'plan_stop', 'plan_hours']);
    assert.deepEqual(a[0].params, { journal: 'Main', loss: 180, cap: 150 }); assert.equal(a[2].params.hour, '21:00');
  });
  it('every rule has a name in the panel and the locales', async () => {
    const panel = fs.readFileSync('public/components/ai-coach/ai-coach.js', 'utf8');
    for (const l of ['tr', 'en', 'de']) {
      const loc = (await import('../public/i18n/locales/' + l + '.js')).default;
      for (const r of PLAN_RULES) { assert.ok(loc['aiCoach.rule.' + r], l + ' ' + r); assert.ok(panel.includes(r + ': \''), 'RULE_TR ' + r); }
      for (const k of ['plan_discipline', 'plan_followed']) assert.ok(loc['aiCoach.insight.' + k] && loc['aiCoach.insight_q.' + k], l + ' ' + k);
    }
  });
});
