// ============================================================
// Live coach alerts (supabase/functions/_shared/coach-alerts.ts): what the coach warns about right after new trades
// arrive, and what it must stay quiet about (history backfills, backtest rows, other days).
// Runner: node --test tests/*.test.js
// ============================================================
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { detectAlerts } from '../supabase/functions/_shared/coach-alerts.ts';

const J = '11111111-1111-1111-1111-111111111111';
const NOW = Date.parse('2026-11-14T15:00:00Z');                         // 18:00 in Istanbul
const at = (iso) => iso;
// history: 20 days, 3 trades a day, 1 lot, losses of 100, wins of 150, every trade with a stop
function history() {
  const out = [];
  for (let d = 0; d < 20; d++) for (let k = 0; k < 3; k++) {
    const t = Date.parse('2026-10-20T08:00:00Z') + d * 864e5 + k * 3600e3, win = (d + k) % 3 !== 0 && d % 4 !== 0;   // every 4th day: 3 losses
    out.push({ symbol: 'EURUSD', direction: 'BUY', lot: 1, entry_price: 1.1, stop_loss: 1.09, exit_price: win ? 1.115 : 1.09, pnl: win ? 150 : -100,
      trade_date: new Date(t).toISOString(), exit_date: new Date(t + 1800e3).toISOString(), platform_source: null });
  }
  return out;
}
function today(list) {   // [pnl, lot, minutes before NOW, extra]
  return list.map(([pnl, lot, ago, extra = {}]) => ({ symbol: 'EURUSD', direction: 'BUY', lot, entry_price: 1.1, stop_loss: 1.09, exit_price: pnl < 0 ? 1.09 : 1.115, pnl,
    trade_date: new Date(NOW - ago * 60e3 - 600e3).toISOString(), exit_date: new Date(NOW - ago * 60e3).toISOString(), platform_source: null, ...extra }));
}
const run = (trades, extra = {}) => detectAlerts({ trades, tz: 'Europe/Istanbul', now: NOW, journalId: J, journalName: 'Main', ...extra });
const kinds = (a) => a.map((x) => x.kind);

describe('coach alerts', () => {
  it('quiet on a normal day, on a history backfill and with no trades', () => {
    assert.deepEqual(run(history().concat(today([[150, 1, 30]]))), []);
    assert.deepEqual(run(history()), []);                                                    // newest trade is days old
    assert.deepEqual(run(today([[-100, 1, 400], [-100, 1, 390], [-100, 1, 380]])), []);       // > 6 h ago
    assert.deepEqual(run([]), []);
  });
  it('three losses in a row today', () => {
    const a = run(history().concat(today([[150, 1, 120], [-100, 1, 60], [-100, 1, 40], [-100, 1, 10]])));
    const s = a.find((x) => x.kind === 'loss_streak');
    assert.deepEqual(s.params, { journal: 'Main', n: 3, loss: 300 });
    assert.equal(s.key, `loss_streak:${J}:2026-11-14`);
  });
  it('a bigger lot right after a loss', () => {
    const a = run(history().concat(today([[-100, 1, 60], [-200, 2, 10]])));
    const s = a.find((x) => x.kind === 'size_up_after_loss');
    assert.equal(s.level, 'error'); assert.equal(s.params.ratio, 2); assert.equal(a[0].kind, 'size_up_after_loss');   // strongest first
    assert.ok(!kinds(run(history().concat(today([[150, 1, 60], [150, 2, 10]])))).includes('size_up_after_loss'));    // after a win: no
  });
  it('more trades than usual, or above the plan\'s cap', () => {
    const many = today([[150, 1, 200], [150, 1, 180], [-100, 1, 160], [150, 1, 140], [150, 1, 120], [150, 1, 30]]);
    assert.deepEqual(run(history().concat(many)).find((x) => x.kind === 'overtrading').params, { journal: 'Main', n: 6, usual: 3 });
    const capped = run(history().concat(today([[150, 1, 60], [150, 1, 40], [150, 1, 10]])), { plan: { max_trades_per_day: 2 } });
    assert.deepEqual(capped.find((x) => x.kind === 'plan_trades').params, { journal: 'Main', n: 3, cap: 2 });
  });
  it('a day loss above the plan\'s cap, or far beyond a usual losing day', () => {
    const t = history().concat(today([[-100, 1, 60], [-150, 1, 40], [120, 1, 10]]));
    assert.deepEqual(run(t, { plan: { max_daily_loss: 100 } }).find((x) => x.kind === 'plan_daily_loss').params, { journal: 'Main', loss: 130, cap: 100 });
    const big = run(history().concat(today([[-800, 1, 60], [50, 1, 10]])));          // usual losing day: -300
    assert.ok(kinds(big).includes('big_day_loss'), kinds(big).join());
  });
  it('a large loss without a stop, and a loss far beyond the stop', () => {
    const noStop = run(history().concat(today([[-250, 1, 10, { stop_loss: null }]])));
    assert.deepEqual(noStop.find((x) => x.kind === 'big_loss_no_stop').params, { journal: 'Main', loss: 250, usual: 100 });
    const over = run(history().concat(today([[-200, 1, 10, { exit_price: 1.075 }]])));
    assert.equal(over.find((x) => x.kind === 'stop_overrun').params.r, -2.5);
  });
  it('prop challenge: room for about one loss today, the max loss close, a broken rule (once per account)', () => {
    const t = history().concat(today([[-100, 1, 10]]));
    const day = run(t, { prop: { status: 'in_progress', avg_losses_until_daily_limit: 1, daily_loss: { today_result: -400, room_left_today: 100 }, avg_losses_until_max_loss: 5 } });
    assert.deepEqual(day[0], { kind: 'prop_daily_room', key: `prop_daily_room:${J}:2026-11-14`, level: 'error', severity: 105, params: { journal: 'Main', room: 100, losses: 1 } });
    const max = run(t, { prop: { status: 'in_progress', avg_losses_until_daily_limit: 4, daily_loss: { today_result: -100 }, avg_losses_until_max_loss: 2, max_loss: { room_left: 210.456 } } });
    assert.deepEqual(max[0].params, { journal: 'Main', room: 210.46, losses: 2 });
    const failed = run(t, { prop: { status: 'failed', account_id: 'acc9' } });
    assert.equal(failed[0].key, 'prop_failed:acc9');
  });
  it('"today" is the member\'s day: a trade at 01:00 Istanbul belongs to the new day there', () => {
    const now = Date.parse('2026-11-14T22:30:00Z');                                       // 01:30 on the 15th in Istanbul
    const t = [{ symbol: 'EURUSD', direction: 'BUY', lot: 1, entry_price: 1.1, exit_price: 1.09, stop_loss: 1.09, pnl: -100, trade_date: '2026-11-14T21:50:00Z', exit_date: '2026-11-14T22:00:00Z' }];
    const prop = { status: 'in_progress', avg_losses_until_daily_limit: 0, daily_loss: { today_result: -100, room_left_today: 0 } };
    assert.equal(detectAlerts({ trades: t, prop, tz: 'Europe/Istanbul', now, journalId: J }).find((x) => x.kind === 'prop_daily_room').key, `prop_daily_room:${J}:2026-11-15`);
    assert.equal(detectAlerts({ trades: t, prop, tz: 'UTC', now, journalId: J }).find((x) => x.kind === 'prop_daily_room').key, `prop_daily_room:${J}:2026-11-14`);
  });
  it('backtest rows and open trades are ignored', () => {
    const bt = today([[-100, 1, 60], [-100, 1, 40], [-100, 1, 10]]).map((x) => ({ ...x, platform_source: 'backtest' }));
    assert.deepEqual(run(history().concat(bt)), []);
    assert.deepEqual(run(today([[-100, 1, 10]]).map((x) => ({ ...x, exit_price: null }))), []);
  });
  it('every alert kind has a title and a message in all locales', async () => {
    const src = fs.readFileSync('supabase/functions/_shared/coach-alerts.ts', 'utf8');
    const ids = [...new Set([...src.matchAll(/add\('([a-z_]+)'/g)].map((m) => m[1]))];
    assert.ok(ids.length >= 10, ids.join());
    for (const l of ['tr', 'en', 'de']) {
      const loc = (await import('../public/i18n/locales/' + l + '.js')).default;
      for (const id of ids) { assert.ok(loc['coach.alert.' + id + '.title'], l + ' title ' + id); assert.ok(loc['coach.alert.' + id + '.msg'], l + ' msg ' + id); }
    }
  });
});

describe('coach alerts: writing notifications', async () => {
  const { runCoachAlerts } = await import('../supabase/functions/_shared/coach-alerts.ts');
  const { makeDb } = await import('./helpers/fake-db.js');
  const U = 'u1';
  const rows = () => history().concat(today([[150, 1, 120], [-100, 1, 60], [-100, 1, 40], [-200, 2, 10]])).map((t, i) => ({ ...t, id: 't' + i, user_id: U, journal_id: J }));
  const tables = (extra = {}) => ({ trades: rows(), journals: [{ id: J, user_id: U, name: 'Main' }], notifications: [], coach_settings: [], ...extra });

  it('writes the strongest alerts once (max 2), translated by keys, in the member\'s zone', async () => {
    const db = makeDb(tables({ coach_settings: [{ user_id: U, alerts_enabled: true, time_zone: 'Europe/Istanbul', plan: {} }] }));
    const a = await runCoachAlerts(db, U, J, { now: NOW });
    assert.deepEqual(a.map((x) => x.kind), ['size_up_after_loss', 'loss_streak']);
    const n = db.tables.notifications;
    assert.equal(n.length, 2);
    assert.deepEqual([n[0].type, n[0].title_key, n[0].message_key, n[0].is_read], ['error', 'coach.alert.size_up_after_loss.title', 'coach.alert.size_up_after_loss.msg', false]);
    assert.equal(n[0].meta_data.alert_key, `size_up_after_loss:${J}:2026-11-14`); assert.equal(n[0].meta_data.journal, 'Main'); assert.equal(n[0].user_id, U);
    assert.deepEqual(await runCoachAlerts(db, U, J, { now: NOW + 60e3 }), []);                 // the next sync: nothing new
    assert.equal(db.tables.notifications.length, 2);
  });
  it('switched off: nothing; no settings row (or no table yet): on, in UTC', async () => {
    const off = makeDb(tables({ coach_settings: [{ user_id: U, alerts_enabled: false }] }));
    assert.deepEqual(await runCoachAlerts(off, U, J, { now: NOW }), []);
    const none = makeDb(tables(), { fail: (t) => t === 'coach_settings' });
    const a = await runCoachAlerts(none, U, J, { now: NOW });
    assert.ok(a.length > 0 && a[0].key.endsWith(':2026-11-14'));
  });
  it('the prop context is used, and a write error or a failing read never throws', async () => {
    const db = makeDb(tables());
    const a = await runCoachAlerts(db, U, J, { now: NOW, propContextFor: async () => ({ status: 'in_progress', avg_losses_until_daily_limit: 1, daily_loss: { today_result: -300, room_left_today: 90 } }) });
    assert.equal(a[0].kind, 'prop_daily_room');
    assert.deepEqual(await runCoachAlerts(makeDb(tables(), { fail: (t, op) => t === 'notifications' && op === 'insert' }), U, J, { now: NOW }), []);
    assert.deepEqual(await runCoachAlerts(makeDb(tables(), { fail: (t) => t === 'trades' }), U, J, { now: NOW }), []);
    // a failing prop lookup is skipped: the one alert not sent yet (max 2 per run above) still goes out
    assert.deepEqual((await runCoachAlerts(db, U, J, { now: NOW, propContextFor: async () => { throw new Error('x'); } })).map((x) => x.kind), ['loss_streak']);
  });
  it('only the member\'s own journal trades are read', async () => {
    const t = tables(); t.trades.push(...today([[-999, 9, 5]]).map((x) => ({ ...x, user_id: 'other', journal_id: J })));
    const db = makeDb(t);
    const a = await runCoachAlerts(db, U, J, { now: NOW });
    assert.ok(!JSON.stringify(a).includes('999'));
  });
});
