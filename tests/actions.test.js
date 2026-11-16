// ============================================================
// Action cards (supabase/functions/_shared/actions.ts): the coach prepares a strategy, plan rules, this week's goal or
// the monthly profit target; the member confirms; the server validates again and writes. Panel pattern and texts.
// Runner: node --test tests/*.test.js
// ============================================================
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cleanAction, resolveActions, applyAction, MAX_ACTIONS, STRATEGY_COLORS, ACTION_TYPES } from '../supabase/functions/_shared/actions.ts';
import { resolveCommitments } from '../supabase/functions/_shared/commitments.ts';
import { COACH_KNOWLEDGE } from '../supabase/functions/_shared/coach-knowledge.ts';
import { makeDb } from './helpers/fake-db.js';

const J1 = '11111111-1111-4111-8111-111111111111', J2 = '22222222-2222-4222-8222-222222222222';
const TZ = 'Europe/Istanbul', NOW = Date.parse('2026-11-16T11:00:00Z');   // Monday

describe('action cards: validation', () => {
  it('a strategy: name required and clipped, description optional, colour from the palette', () => {
    assert.deepEqual(cleanAction({ type: 'add_strategy', name: '  London   Breakout ', description: 'Açılış\nkırılımı', color: '#3B82F6' }),
      { type: 'add_strategy', name: 'London Breakout', description: 'Açılış kırılımı', color: '#3b82f6' });
    assert.equal(cleanAction({ type: 'add_strategy', name: 'X', color: 'red' }).color, STRATEGY_COLORS[0]);
    assert.equal(cleanAction({ type: 'add_strategy', name: 'a'.repeat(200) }).name.length, 60);
    assert.equal(cleanAction({ type: 'add_strategy', name: '   ' }), null);
    assert.equal(cleanAction({ type: 'add_strategy', name: 'X', description: 'd'.repeat(900) }).description.length, 500);
  });
  it('plan rules: valid values only, null removes, one bad value drops the card', () => {
    assert.deepEqual(cleanAction({ type: 'set_plan', rules: { max_trades_per_day: 3, require_stop: true, no_trading_after: 0, max_daily_loss: null } }),
      { type: 'set_plan', rules: { max_trades_per_day: 3, require_stop: true, no_trading_after: 0 }, remove: ['max_daily_loss'] });
    assert.equal(cleanAction({ type: 'set_plan', rules: { max_trades_per_day: 99 } }), null);
    assert.equal(cleanAction({ type: 'set_plan', rules: { max_trades_per_day: 3, no_trading_after: 25 } }), null);
    assert.equal(cleanAction({ type: 'set_plan', rules: { unknown: 1 } }), null);
    assert.equal(cleanAction({ type: 'set_plan' }), null);
  });
  it('goals and the monthly target', () => {
    assert.deepEqual(cleanAction({ type: 'set_goal', kind: 'stop_after_losses', target: 2 }), { type: 'set_goal', kind: 'stop_after_losses', target: 2 });
    assert.equal(cleanAction({ type: 'set_goal', kind: 'stop_every_trade', target: 50 }).target, 1);
    assert.equal(cleanAction({ type: 'set_goal', kind: 'max_trades_per_day', target: 2.5 }), null);
    assert.equal(cleanAction({ type: 'set_goal', kind: 'make_money', target: 1 }), null);
    assert.deepEqual(cleanAction({ type: 'set_monthly_target', amount: '2000.555' }), { type: 'set_monthly_target', amount: 2000.56 });
    assert.equal(cleanAction({ type: 'set_monthly_target', amount: -5 }), null);
    assert.equal(cleanAction({ type: 'delete_everything' }), null);
    assert.equal(cleanAction(null), null);
  });
});

describe('action cards: the coach\'s lines', () => {
  it('valid lines become numbered cards; broken, surplus, repeated and inline ones go', () => {
    const text = 'Hazırladım.\n[[action:{"type":"add_strategy","name":"Londra Kırılımı","color":"#22c55e"}]]\n' +
      '[[action:{"type":"set_plan","rules":{"max_trades_per_day":3}}]]\n[[action:{bozuk json]]\n' +
      '[[action:{"type":"set_plan","rules":{"max_trades_per_day":3}}]]\nSatır içi [[action:{"type":"set_monthly_target","amount":5}]] olmaz.\n' +
      '[[action:{"type":"set_goal","kind":"stop_every_trade","target":1}]]\n[[action:{"type":"set_monthly_target","amount":2000}]]';
    const r = resolveActions(text);
    assert.equal(r.text, 'Hazırladım.\n[[action:a1]]\n[[action:a2]]\n\nSatır içi  olmaz.\n[[action:a3]]');
    assert.equal(Object.keys(r.visuals).length, MAX_ACTIONS);
    assert.deepEqual(r.visuals['action:a1'], { kind: 'action', action: { type: 'add_strategy', name: 'Londra Kırılımı', description: null, color: '#22c55e' } });
    assert.equal(r.visuals['action:a3'].action.type, 'set_goal');
  });
  it('works with promise lines in the same answer (the function runs promises first, then actions)', () => {
    const t = 'Yarın 2 işlem.\n[[commit:max_trades_per_day:2:tomorrow]]\n[[action:{"type":"set_plan","rules":{"max_trades_per_day":2}}]]';
    const rc = resolveCommitments(t, NOW, TZ), ra = resolveActions(rc.text);
    assert.equal(ra.text, 'Yarın 2 işlem.\n[[commit:max_trades_per_day:2:tomorrow]]\n[[action:a1]]');
    assert.ok(rc.visuals['commit:max_trades_per_day:2:tomorrow']); assert.ok(ra.visuals['action:a1']);
  });
  it('every example in the knowledge base resolves, every type is explained', () => {
    const ex = [...COACH_KNOWLEDGE.matchAll(/\[\[action:\{.*?\}\]\]/g)].map((m) => m[0]);
    assert.equal(ex.length, 4);
    for (const e of ex) assert.equal(Object.keys(resolveActions(e).visuals).length, 1, e);
    for (const k of ACTION_TYPES) assert.ok(COACH_KNOWLEDGE.includes(k), k);
  });
});

describe('action cards: applying', () => {
  const fresh = () => makeDb({
    journals: [{ id: J1, user_id: 'u1' }, { id: J2, user_id: 'u2' }],
    strategies: [{ id: 's1', user_id: 'u1', journal_id: J1, name: 'İstanbul Scalp' }, { id: 's9', user_id: 'u2', journal_id: J2, name: 'Breakout' }],
    coach_settings: [{ user_id: 'u1', plan: { max_trades_per_day: 4, max_daily_loss: 200, goal: { kind: 'stop_every_trade', target: 1, week_start: '2026-11-09' },
      coach: { id: 'rex', tone: 'strict' }, commitment: { kind: 'no_trading', target: 0, day: '2026-11-17' }, commitment_log: [] } }],
  });
  it('a strategy goes into the member\'s journal; a foreign or missing journal is refused; the same name is kept', async () => {
    const db = fresh();
    const r = await applyAction(db, 'u1', { type: 'add_strategy', name: 'Londra Kırılımı', description: 'Açılışta kırılım', color: '#22c55e' }, { journalId: J1, tz: TZ });
    assert.equal(r.ok, true); assert.equal(r.existed, false);
    const row = db.tables.strategies.find((s) => s.name === 'Londra Kırılımı');
    assert.deepEqual([row.user_id, row.journal_id, row.description, row.color, row.is_active], ['u1', J1, 'Açılışta kırılım', '#22c55e', true]);
    assert.deepEqual(await applyAction(db, 'u1', { type: 'add_strategy', name: 'X' }, { journalId: J2, tz: TZ }), { ok: false, code: 'NOT_FOUND' });
    assert.deepEqual(await applyAction(db, 'u1', { type: 'add_strategy', name: 'X' }, { journalId: null, tz: TZ }), { ok: false, code: 'NO_JOURNAL' });
    assert.deepEqual(await applyAction(db, 'u1', { type: 'add_strategy', name: 'X' }, { journalId: 'not-a-uuid', tz: TZ }), { ok: false, code: 'NO_JOURNAL' });
    const dup = await applyAction(db, 'u1', { type: 'add_strategy', name: '  istanbul   scalp ' }, { journalId: J1, tz: TZ });   // Turkish İ/i
    assert.equal(dup.existed, true); assert.equal(dup.strategy.id, 's1');
    assert.equal(db.tables.strategies.filter((s) => s.user_id === 'u1').length, 2);
    // another member's strategy of the same name does not count
    const own = await applyAction(db, 'u1', { type: 'add_strategy', name: 'Breakout' }, { journalId: J1, tz: TZ });
    assert.equal(own.existed, false);
  });
  it('plan rules merge into the plan; goal, coach and promise stay; null removes a rule', async () => {
    const db = fresh();
    const r = await applyAction(db, 'u1', { type: 'set_plan', rules: { max_trades_per_day: 3, require_stop: true, max_daily_loss: null } }, { tz: TZ });
    assert.equal(r.ok, true);
    const p = db.tables.coach_settings[0].plan;
    assert.equal(p.max_trades_per_day, 3); assert.equal(p.require_stop, true); assert.equal(p.max_daily_loss, undefined);
    assert.equal(p.goal.kind, 'stop_every_trade'); assert.equal(p.coach.id, 'rex'); assert.equal(p.commitment.kind, 'no_trading'); assert.deepEqual(p.commitment_log, []);
  });
  it('this week\'s goal is dated by the server; the monthly target is left to the panel; junk is refused', async () => {
    const db = fresh();
    const r = await applyAction(db, 'u1', { type: 'set_goal', kind: 'stop_after_losses', target: 2 }, { tz: TZ, now: NOW });
    assert.equal(r.ok, true);
    assert.deepEqual(db.tables.coach_settings[0].plan.goal, { kind: 'stop_after_losses', target: 2, week_start: '2026-11-16' });
    assert.deepEqual(await applyAction(db, 'u1', { type: 'set_monthly_target', amount: 2000 }, { tz: TZ }), { ok: true, action: { type: 'set_monthly_target', amount: 2000 }, client: true });
    assert.deepEqual(await applyAction(db, 'u1', { type: 'set_plan', rules: { max_trades_per_day: 500 } }, { tz: TZ }), { ok: false, code: 'BAD_REQUEST' });
    // a member without a settings row gets one
    const db2 = makeDb({ coach_settings: [] });
    assert.equal((await applyAction(db2, 'u7', { type: 'set_plan', rules: { require_stop: true } }, { tz: TZ })).ok, true);
    assert.deepEqual(db2.tables.coach_settings[0].plan, { require_stop: true });
  });
});

describe('action cards: panel', () => {
  const src = fs.readFileSync(new URL('../public/components/ai-coach/ai-coach.js', import.meta.url), 'utf8');
  it('the panel recognises exactly the card lines the server writes', () => {
    const m = src.match(/var ACTION_LINE = (\/.+\/);/);
    assert.ok(m);
    const panel = new Function('return ' + m[1])();
    const r = resolveActions('[[action:{"type":"set_monthly_target","amount":1000}]]');
    assert.equal(panel.exec(r.text)[1], Object.keys(r.visuals)[0]);
    for (const ln of ['[[action:a1]]', ' [[action:a3]] ']) assert.ok(panel.test(ln), ln);
    for (const ln of ['[[action:a4]]', 'x [[action:a1]]', '[[action:{"type":"set_goal"}]]']) assert.ok(!panel.test(ln), ln);
  });
  it('the monthly target is written where the dashboard reads it', () => {
    assert.match(src, /localStorage\.setItem\('ww_monthly_target_' \+ jid, String\(a\.amount\)\)/);
    const dash = fs.readFileSync(new URL('../src/pages/dashboard.astro', import.meta.url), 'utf8');
    assert.match(dash, /localStorage\.getItem\('ww_monthly_target_' \+ jid\)/);
  });
  it('texts in all locales', async () => {
    const keys = ['strategy', 'journal', 'add_strategy', 'plan', 'on', 'off', 'was', 'remove', 'update_plan', 'goal', 'monthly', 'save_target', 'exists', 'done', 'no_journal', 'target_saved', 'strategy_added', 'same'];
    for (const l of ['tr', 'en', 'de']) {
      const loc = (await import('../public/i18n/locales/' + l + '.js')).default;
      for (const k of keys) assert.ok(loc['aiCoach.action.' + k], l + ' ' + k);
      assert.match(loc['aiCoach.action.strategy_added'], /\{name\}/);
    }
  });
});
