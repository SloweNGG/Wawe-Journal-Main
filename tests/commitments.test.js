// ============================================================
// Daily promises (supabase/functions/_shared/commitments.ts): the coach's [[commit:...]] line, taking it, settling it
// the day after, what the panel and the coach see; the panel's line pattern and texts.
// Runner: node --test tests/*.test.js
// ============================================================
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  COMMIT_KINDS, cleanCommitment, cleanTarget, commitmentBreaks, settleCommitment, commitmentState, resolveCommitments, settleOnce,
  localDay, LOG_MAX,
} from '../supabase/functions/_shared/commitments.ts';
import { resolveVisuals } from '../supabase/functions/_shared/visuals.ts';
import { COACH_KNOWLEDGE } from '../supabase/functions/_shared/coach-knowledge.ts';
import { makeDb } from './helpers/fake-db.js';

const TZ = 'Europe/Istanbul';
// [local 'YYYY-MM-DD HH:MM', pnl, lot, stop?, closed?]
const T = (local, pnl, lot = 1, stop = true, closed = true) => ({ symbol: 'EURUSD', trade_date: new Date(Date.parse(local.replace(' ', 'T') + ':00+03:00')).toISOString(),
  pnl: closed ? pnl : null, lot, exit_price: closed ? 1 : null, stop_loss: stop ? 0.9 : null, platform_source: null });
const at = (local) => Date.parse(local.replace(' ', 'T') + ':00+03:00');
const NOW = at('2026-11-16 14:00');                              // Monday afternoon in Istanbul

// Monday 16 Nov: 4 trades (loss, loss, win, loss: the 3rd comes after two losses), day -70; one backtest row that never counts
const monday = [T('2026-11-16 09:00', -50), T('2026-11-16 10:00', -60), T('2026-11-16 11:00', 80), T('2026-11-16 12:00', -40),
  { ...T('2026-11-16 12:30', 500), platform_source: 'backtest' }];

describe('daily promises: taking one', () => {
  it('today / tomorrow in the member\'s zone, nothing else', () => {
    assert.deepEqual(cleanCommitment({ kind: 'max_trades_per_day', target: 3, when: 'tomorrow' }, NOW, TZ),
      { kind: 'max_trades_per_day', target: 3, day: '2026-11-17', made_at: new Date(NOW).toISOString() });
    assert.equal(cleanCommitment({ kind: 'no_trading', target: 5, when: 'today' }, NOW, TZ).target, 0);       // fixed targets
    assert.equal(cleanCommitment({ kind: 'stop_every_trade', target: 9, day: '2026-11-16' }, NOW, TZ).target, 1);
    // 23:30 UTC on Monday is already Tuesday in Istanbul
    assert.equal(cleanCommitment({ kind: 'no_trading', target: 0, when: 'today' }, Date.parse('2026-11-16T23:30:00Z'), TZ).day, '2026-11-17');
    for (const bad of [{ kind: 'max_trades_per_day', target: 0, when: 'today' }, { kind: 'max_trades_per_day', target: 2.5, when: 'today' },
      { kind: 'max_trades_per_day', target: 51, when: 'today' }, { kind: 'stop_after_losses', target: 11, when: 'today' },
      { kind: 'max_daily_loss', target: -5, when: 'today' }, { kind: 'win_more', target: 1, when: 'today' },
      { kind: 'no_trading', target: 0, day: '2026-11-15' }, { kind: 'no_trading', target: 0, day: '2026-11-18' }, { kind: 'no_trading', target: 0 }, null])
      assert.equal(cleanCommitment(bad, NOW, TZ), null, JSON.stringify(bad));
    assert.equal(cleanTarget('max_daily_loss', '250.456'), 250.46);
  });
});

describe('daily promises: counting', () => {
  it('each kind counts its breaks on its own day only', () => {
    const all = monday.concat([T('2026-11-15 09:00', -10), T('2026-11-17 09:00', -10)]);
    const c = (kind, target) => commitmentBreaks({ kind, target, day: '2026-11-16' }, all, TZ);
    assert.deepEqual(c('no_trading', 0), { trades: 4, breaks: 4 });
    assert.deepEqual(c('max_trades_per_day', 3), { trades: 4, breaks: 1 });
    assert.deepEqual(c('max_trades_per_day', 4), { trades: 4, breaks: 0 });
    assert.deepEqual(c('max_trades_per_day', 2), { trades: 4, breaks: 2 });      // every trade over the cap, not the day
    assert.equal(c('stop_after_losses', 2).breaks, 1);              // the win resets the streak
    assert.equal(c('stop_after_losses', 1).breaks, 2);
    assert.equal(c('max_daily_loss', 50).breaks, 1);                // -70 for the day
    assert.equal(c('stop_every_trade', 1).breaks, 0);
    // an open trade counts for "no trading" (it was opened)
    assert.equal(commitmentBreaks({ kind: 'no_trading', target: 0, day: '2026-11-18' }, [T('2026-11-18 09:00', 0, 1, true, false)], TZ).breaks, 1);
  });
});

describe('daily promises: settling', () => {
  const plan = { goal: { kind: 'stop_every_trade', target: 1, week_start: '2026-11-16' }, coach: { id: 'rex', tone: 'strict' },
    commitment: { kind: 'max_trades_per_day', target: 3, day: '2026-11-16', made_at: '2026-11-15T20:00:00Z' } };
  it('not before the day is over plus an hour of grace', () => {
    assert.equal(settleCommitment(plan, monday, TZ, NOW), null);
    assert.equal(settleCommitment(plan, monday, TZ, at('2026-11-17 00:30')), null);
  });
  it('after it: the result goes to the log, the rest of the plan stays', () => {
    const s = settleCommitment(plan, monday, TZ, at('2026-11-17 01:30'));
    assert.deepEqual(s.result, { kind: 'max_trades_per_day', target: 3, day: '2026-11-16', trades: 4, breaks: 1, kept: false });
    assert.equal(s.plan.commitment, undefined);
    assert.deepEqual(s.plan.goal, plan.goal); assert.deepEqual(s.plan.coach, plan.coach);
    assert.deepEqual(s.plan.commitment_log, [s.result]);
    const kept = settleCommitment({ commitment: { kind: 'max_trades_per_day', target: 5, day: '2026-11-16' } }, monday, TZ, at('2026-11-18 09:00'));
    assert.equal(kept.result.kept, true);
  });
  it('the log keeps the last 30; broken or very old data is dropped without a result', () => {
    const log = Array.from({ length: LOG_MAX }, (_, i) => ({ kind: 'no_trading', target: 0, day: '2026-10-' + String(i + 1).padStart(2, '0'), trades: 0, breaks: 0, kept: true }));
    const s = settleCommitment({ ...plan, commitment_log: log }, monday, TZ, at('2026-11-17 09:00'));
    assert.equal(s.plan.commitment_log.length, LOG_MAX); assert.equal(s.plan.commitment_log[0].day, '2026-10-02');
    const junk = settleCommitment({ commitment: { kind: 'nope', day: 'x' } }, monday, TZ, NOW);
    assert.equal(junk.result, null); assert.equal(junk.plan.commitment, undefined);
    const old = settleCommitment({ commitment: { kind: 'no_trading', target: 0, day: '2026-09-01' } }, monday, TZ, NOW);
    assert.equal(old.result, null); assert.equal(old.plan.commitment_log, undefined);
  });
  it('writes the plan and one notification; a request that lost the race does neither', async () => {
    const row = { user_id: 'u1', plan: JSON.parse(JSON.stringify(plan)), updated_at: '2026-11-15T20:00:00.000000+00:00' };
    const db = makeDb({ coach_settings: [row], notifications: [] });
    const later = at('2026-11-17 09:00');
    const stale = { plan: JSON.parse(JSON.stringify(plan)), updated_at: 'older' };              // read before someone else wrote
    assert.equal(await settleOnce(db, 'u1', stale, monday, TZ, later), null);
    assert.equal(db.tables.notifications.length, 0); assert.ok(db.tables.coach_settings[0].plan.commitment);
    const mine = { plan: row.plan, updated_at: row.updated_at };
    const r = await settleOnce(db, 'u1', mine, monday, TZ, later);
    assert.equal(r.kept, false);
    assert.equal(db.tables.coach_settings[0].plan.commitment, undefined);
    assert.equal(db.tables.coach_settings[0].plan.commitment_log.length, 1);
    assert.equal(mine.plan.commitment, undefined);                                              // the caller sees the new plan
    const n = db.tables.notifications;
    assert.equal(n.length, 1);
    assert.deepEqual([n[0].title_key, n[0].message_key, n[0].type, n[0].meta_data.breaks, n[0].meta_data.alert_key],
      ['coach.commit.title', 'coach.commit.msg_missed', 'warning', 1, 'commit:2026-11-16']);
    assert.equal(await settleOnce(db, 'u1', mine, monday, TZ, later + 3600e3), null);         // nothing left to settle
    assert.equal(db.tables.notifications.length, 1);
    assert.equal(await settleOnce(makeDb({}, { fail: () => true }), 'u1', { plan, updated_at: 'x' }, monday, TZ, later), null);   // never throws
    assert.equal(await settleOnce(db, 'u1', null, monday, TZ, later), null);
  });
});

describe('daily promises: a day without trades', () => {
  it('a cap or stop promise on a day without trades is untested: logged, not counted, not reported', async () => {
    const plan = { commitment: { kind: 'max_trades_per_day', target: 3, day: '2026-11-15' } };      // a Sunday off
    const s = settleCommitment(plan, monday, TZ, NOW);
    assert.deepEqual(s.result, { kind: 'max_trades_per_day', target: 3, day: '2026-11-15', trades: 0, breaks: 0, kept: true, untested: true });
    assert.equal(commitmentState(s.plan, monday, TZ, NOW), null);                                // no last, no record
    const db = makeDb({ coach_settings: [{ user_id: 'u1', plan, updated_at: 'v' }], notifications: [] });
    const r = await settleOnce(db, 'u1', { plan, updated_at: 'v' }, monday, TZ, NOW);
    assert.equal(r.untested, true); assert.equal(db.tables.notifications.length, 0);
    assert.equal(db.tables.coach_settings[0].plan.commitment, undefined);
  });
  it('"no trading" on a day without trades is a kept promise', () => {
    const s = settleCommitment({ commitment: { kind: 'no_trading', target: 0, day: '2026-11-15' } }, monday, TZ, NOW);
    assert.equal(s.result.kept, true); assert.equal(s.result.untested, undefined);
    assert.deepEqual(commitmentState(s.plan, monday, TZ, NOW).record, { kept: 1, total: 1 });
  });
});

describe('daily promises: what the panel and the coach see', () => {
  it('the open promise, the last result and the 30-day record', () => {
    assert.equal(commitmentState({}, monday, TZ, NOW), null);
    const today = commitmentState({ commitment: { kind: 'max_trades_per_day', target: 3, day: '2026-11-16' } }, monday, TZ, NOW);
    assert.equal(today.current.status, 'broken'); assert.equal(today.current.trades, 4); assert.equal(today.last, null);
    assert.equal(commitmentState({ commitment: { kind: 'max_trades_per_day', target: 5, day: '2026-11-16' } }, monday, TZ, NOW).current.status, 'clean');
    const log = [
      { kind: 'no_trading', target: 0, day: '2026-10-01', trades: 2, breaks: 2, kept: false },     // outside 30 days
      { kind: 'no_trading', target: 0, day: '2026-11-10', trades: 0, breaks: 0, kept: true },
      { kind: 'max_trades_per_day', target: 3, day: '2026-11-15', trades: 7, breaks: 4, kept: false },
    ];
    const st = commitmentState({ commitment: { kind: 'no_trading', target: 0, day: '2026-11-17' }, commitment_log: log }, monday, TZ, NOW);
    assert.equal(st.current.status, 'upcoming');
    assert.deepEqual(st.last, log[2]);
    assert.deepEqual(st.record, { kept: 1, total: 2 });
    // a result older than three days is no longer "last", the record stays
    const later = commitmentState({ commitment_log: log }, monday, TZ, at('2026-11-20 10:00'));
    assert.equal(later.last, null); assert.deepEqual(later.record, { kept: 1, total: 2 });
  });
});

describe('daily promises: the coach\'s line', () => {
  it('the last valid line stays with an absolute day; the others go', () => {
    const text = 'Bugün çok işlem açtın.\n[[commit:max_trades_per_day:3:today]]\nYarın:\n[[viz:kpis]]\n  [[commit:max_trades_per_day:3:tomorrow]]  \n' +
      'Satır içi [[commit:no_trading:0:today]] olmaz.\n[[commit:win_more:5:tomorrow]]\n[[commit:max_trades_per_day:3:nextweek]]';
    const r = resolveCommitments(text, NOW, TZ);
    assert.equal(r.text, 'Bugün çok işlem açtın.\n\nYarın:\n[[viz:kpis]]\n[[commit:max_trades_per_day:3:tomorrow]]\nSatır içi  olmaz.');
    assert.deepEqual(r.visuals, { 'commit:max_trades_per_day:3:tomorrow': { kind: 'commit', commit: { kind: 'max_trades_per_day', target: 3, day: '2026-11-17' } } });
    assert.deepEqual(resolveCommitments('Sadece metin.', NOW, TZ), { text: 'Sadece metin.', visuals: {} });
    assert.equal(resolveCommitments('[[commit:max_daily_loss:150.5:today]]', NOW, TZ).visuals['commit:max_daily_loss:150.5:today'].commit.target, 150.5);
  });
  it('chart lines and promise lines live together (charts first, as the function does)', () => {
    const rv = resolveVisuals('A\n[[viz:kpis]]\nB\n[[commit:no_trading:0:tomorrow]]', { totals: { trades: 3, wins: 1, losses: 2, win_rate: 33.3, net: -10, profit_factor: 0.5 } }, []);
    const rc = resolveCommitments(rv.text, NOW, TZ);
    assert.equal(rc.text, 'A\n[[viz:kpis]]\nB\n[[commit:no_trading:0:tomorrow]]');
    assert.ok(rv.visuals.kpis); assert.ok(rc.visuals['commit:no_trading:0:tomorrow']);
  });
  it('the coach hears the latest result once: only in the first answer of a new chat', () => {
    const src = fs.readFileSync(new URL('../supabase/functions/ai-coach/index.ts', import.meta.url), 'utf8');
    assert.match(src, /mention_last: !conversation && !!daily\.commitment\.last/);
    assert.match(COACH_KNOWLEDGE, /mention_last true/); assert.match(COACH_KNOWLEDGE, /Not under a question about numbers, strategies or a chart/);
  });
  it('the knowledge base explains it and its example resolves', () => {
    assert.match(COACH_KNOWLEDGE, /### Daily promises \(commitment\)/);
    const ex = [...COACH_KNOWLEDGE.matchAll(/\[\[commit:[a-z_]+:[0-9.]+:(?:today|tomorrow)\]\]/g)].map((m) => m[0]);
    assert.ok(ex.length >= 1);
    for (const e of ex) assert.equal(Object.keys(resolveCommitments(e, NOW, TZ).visuals).length, 1, e);
    for (const k of COMMIT_KINDS) assert.ok(COACH_KNOWLEDGE.includes(k), k);
  });
});

describe('daily promises: panel', () => {
  const src = fs.readFileSync(new URL('../public/components/ai-coach/ai-coach.js', import.meta.url), 'utf8');
  it('the panel recognises exactly the lines the server keeps', () => {
    const m = src.match(/var COMMIT_LINE = (\/.+\/);/);
    assert.ok(m, 'COMMIT_LINE in ai-coach.js');
    const panel = new Function('return ' + m[1])();
    for (const ln of ['[[commit:max_trades_per_day:3:tomorrow]]', '  [[commit:no_trading:0:today]] ', '[[commit:max_daily_loss:150.5:today]]'])
      assert.ok(panel.test(ln), ln);
    for (const ln of ['x [[commit:no_trading:0:today]]', '[[commit:no_trading:0:nextweek]]', '[[viz:kpis]]']) assert.ok(!panel.test(ln), ln);
    // every line the server keeps is one the panel turns into a card, and its id is the visuals key
    const r = resolveCommitments('[[commit:stop_after_losses:2:today]]', NOW, TZ);
    assert.equal(panel.exec(r.text)[1], Object.keys(r.visuals)[0]);
  });
  it('saving the plan keeps the promise, its log and every other non-rule key', () => {
    assert.match(src, /Object\.keys\(old\)\.forEach\(function \(k\) \{ if \(RULES\.indexOf\(k\) < 0\) keep\[k\] = old\[k\]; \}\);/);
    // and it merges into the plan read from the server, not the copy loaded when the panel opened
    const save = src.slice(src.indexOf('function savePlan()'), src.indexOf('function setAlerts('));
    assert.ok(save.indexOf(".select('plan')") > 0 && save.indexOf(".select('plan')") < save.indexOf('.upsert('), 'savePlan reads the plan first');
    assert.ok(!/S\.prefs && S\.prefs\.plan\) \|\| \{\}, keep/.test(save), 'no merge into the stale copy');
  });
  it('texts in all locales; the notification title names the coach', async () => {
    const keys = ['offer', 'today', 'tomorrow', 'yesterday', 'take', 'taken_short', 'expired', 'taken', 'dropped', 'current', 'kept', 'missed', 'record'];
    for (const l of ['tr', 'en', 'de']) {
      const loc = (await import('../public/i18n/locales/' + l + '.js')).default;
      for (const k of keys) assert.ok(loc['aiCoach.commit.' + k], l + ' ' + k);
      for (const k of COMMIT_KINDS) assert.ok(loc['aiCoach.goal.' + k], l + ' goal ' + k);
      assert.match(loc['coach.commit.title'], /^\{coach\}: /);
      assert.match(loc['coach.commit.msg_missed'], /\{breaks\}/);
      assert.ok(loc['coach.commit.msg_kept']);
      for (const k of ['current', 'kept', 'missed']) assert.match(loc['aiCoach.commit.' + k], /\{day\}/, l + ' ' + k);
    }
  });
  it('local day helper', () => {
    assert.equal(localDay(Date.parse('2026-11-16T22:30:00Z'), TZ), '2026-11-17');
    assert.equal(localDay(Date.parse('2026-11-16T22:30:00Z'), 'Not/AZone'), '2026-11-16');
  });
});
