// ============================================================
// Weekly review and goal (supabase/functions/_shared/weekly.ts).
// Runner: node --test tests/*.test.js
// ============================================================
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { weekStart, goalBreaks, suggestGoal, weeklyReview, goalProgress, cleanGoal, runWeeklyReview, GOAL_KINDS } from '../supabase/functions/_shared/weekly.ts';
import { makeDb } from './helpers/fake-db.js';

const TZ = 'Europe/Istanbul';
// [local 'YYYY-MM-DD HH:MM', pnl, lot, stop?]
const T = (local, pnl, lot = 1, stop = true) => ({ symbol: 'EURUSD', trade_date: new Date(Date.parse(local.replace(' ', 'T') + ':00+03:00')).toISOString(), pnl, lot, exit_price: 1, stop_loss: stop ? 0.9 : null, platform_source: null });
// usual lot history (5+ trades) two weeks earlier
const base = [1, 2, 3, 4, 5, 6].map((d) => T(`2026-10-2${d} 10:00`, 50));
// last week (Mon 2026-11-02 .. Sun 2026-11-08): Tuesday 3 losses then a 4th trade (after 2 losses), Wednesday a double lot after a loss, Thursday no stop
const lastWeek = [
  T('2026-11-03 09:00', -100), T('2026-11-03 10:00', -100), T('2026-11-03 11:00', -100), T('2026-11-03 12:00', 150),
  T('2026-11-04 09:00', -80), T('2026-11-04 10:00', 120, 2), T('2026-11-05 09:00', 200, 1, false), T('2026-11-08 23:30', 60),
];
const NOW = Date.parse('2026-11-10T09:00:00Z');                 // Tuesday of the next week

describe('weekly review and goal', () => {
  it('weeks start on Monday in the member\'s zone', () => {
    assert.equal(weekStart(NOW, TZ), '2026-11-09');
    assert.equal(weekStart(Date.parse('2026-11-08T21:30:00Z'), TZ), '2026-11-09');   // Sunday 21:30 UTC = Monday 00:30 Istanbul
    assert.equal(weekStart(Date.parse('2026-11-08T21:30:00Z'), 'UTC'), '2026-11-02');
  });
  it('each goal kind counts its breaks', () => {
    const all = base.concat(lastWeek), f = '2026-11-02', t = '2026-11-08';
    assert.deepEqual(goalBreaks('stop_every_trade', 1, all, TZ, f, t), { trades: 8, breaks: 1 });
    assert.equal(goalBreaks('max_trades_per_day', 3, all, TZ, f, t).breaks, 1);
    assert.equal(goalBreaks('stop_after_losses', 2, all, TZ, f, t).breaks, 2);                 // 3rd and 4th trade of Tuesday
    assert.equal(goalBreaks('max_daily_loss', 140, all, TZ, f, t).breaks, 1);                  // Tuesday -150
    assert.equal(goalBreaks('max_daily_loss', 150, all, TZ, f, t).breaks, 0);                  // exactly at the cap: kept
    assert.equal(goalBreaks('no_size_up_after_loss', 1, all, TZ, f, t, new Map([['EURUSD', 1]])).breaks, 1);
  });
  it('suggests the strongest leak; review of last week with the goal result', () => {
    const all = base.concat(lastWeek);
    assert.deepEqual(suggestGoal(all, TZ, '2026-11-02', '2026-11-08'), { kind: 'stop_after_losses', target: 2, breaks: 2 });
    const r = weeklyReview(all, TZ, '2026-11-02', { kind: 'stop_every_trade', target: 1, week_start: '2026-11-02' }, () => 62.5);
    assert.equal(r.trades, 8); assert.equal(r.net, 150); assert.equal(r.win_rate, 50); assert.equal(r.trading_days, 4);
    assert.deepEqual(r.worst_day, { day: '2026-11-03', net: -150 }); assert.deepEqual(r.best_day, { day: '2026-11-05', net: 200 });
    assert.deepEqual(r.goal, { kind: 'stop_every_trade', target: 1, breaks: 1, met: false, trades: 8 });
    assert.equal(r.plan_score, 62.5); assert.equal(r.next_goal.kind, 'stop_after_losses');
    assert.equal(weeklyReview(all, TZ, '2026-11-02', { kind: 'stop_every_trade', target: 1, week_start: '2026-10-26' }).goal, null);   // a goal of another week
    assert.equal(weeklyReview(all, TZ, '2026-11-16'), null);                                                                        // no trades
  });
  it('this week\'s goal progress; goals from the panel are validated', () => {
    const g = cleanGoal({ kind: 'max_trades_per_day', target: '3.4' }, NOW, TZ);
    assert.deepEqual(g, { kind: 'max_trades_per_day', target: 3, week_start: '2026-11-09' });
    assert.equal(cleanGoal({ kind: 'win_more', target: 1 }, NOW, TZ), null); assert.equal(cleanGoal({ kind: 'max_daily_loss', target: -5 }, NOW, TZ), null);
    const now = base.concat([T('2026-11-09 09:00', 10), T('2026-11-09 10:00', 10), T('2026-11-09 11:00', 10), T('2026-11-09 12:00', 10)]);
    assert.deepEqual(goalProgress(now, TZ, g, NOW), { ...g, trades: 4, breaks: 1 });
    assert.equal(goalProgress(now, TZ, { ...g, week_start: '2026-11-02' }, NOW), null);
  });
  it('the review notification is written once per week, with its numbers', async () => {
    const db = makeDb({ notifications: [] });
    const r = await runWeeklyReview(db, 'u1', base.concat(lastWeek), { tz: TZ, now: NOW, goal: { kind: 'stop_after_losses', target: 2, week_start: '2026-11-02' } });
    assert.equal(r.week_start, '2026-11-02');
    const n = db.tables.notifications;
    assert.equal(n.length, 1); assert.equal(n[0].title_key, 'coach.weekly.title'); assert.equal(n[0].message_key, 'coach.weekly.msg_missed');
    assert.deepEqual([n[0].meta_data.trades, n[0].meta_data.net, n[0].meta_data.goal_breaks, n[0].meta_data.alert_key], [8, 150, 2, 'weekly:2026-11-02']);
    assert.equal(await runWeeklyReview(db, 'u1', base.concat(lastWeek), { tz: TZ, now: NOW + 3600e3 }), null);
    assert.equal(db.tables.notifications.length, 1);
    assert.equal(await runWeeklyReview(makeDb({ notifications: [] }, { fail: () => true }), 'u1', lastWeek, { tz: TZ, now: NOW }), null);   // never throws
  });
  it('texts for every goal kind and the review in all locales', async () => {
    for (const l of ['tr', 'en', 'de']) {
      const loc = (await import('../public/i18n/locales/' + l + '.js')).default;
      for (const k of GOAL_KINDS) assert.ok(loc['aiCoach.goal.' + k], l + ' ' + k);
      for (const k of ['coach.weekly.title', 'coach.weekly.msg_met', 'coach.weekly.msg_missed', 'coach.weekly.msg_none']) assert.ok(loc[k], l + ' ' + k);
    }
    const panel = fs.readFileSync('public/components/ai-coach/ai-coach.js', 'utf8');
    for (const k of GOAL_KINDS) assert.ok(panel.includes(k + ': \''), 'GOAL_TR ' + k);
  });
});
