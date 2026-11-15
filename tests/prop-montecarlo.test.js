// ============================================================
// Prop challenge pass probability (public/src/utils/prop-montecarlo.js): copies equal, deterministic, rule semantics of
// prop-calculator.js, risk scaling, and its use by the AI coach (prop-context.ts, insights.ts).
// Runner: node --test tests/*.test.js
// ============================================================
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../public/src/utils/prop-calculator.js';            // UMD: registers globalThis.PropCalculator / PropMonteCarlo
import '../public/src/utils/prop-montecarlo.js';
const PC = globalThis.PropCalculator, MC = globalThis.PropMonteCarlo;
import { propContext } from '../supabase/functions/_shared/prop-context.ts';
import { pickInsights } from '../supabase/functions/_shared/insights.ts';

const ACC = { id: 'acc1', starting_balance: 10000, start_date: '2026-11-01', reset_tz: 'UTC', time_shift_hours: 0,
  rules: { daily_loss_limit_pct: 5, max_loss_limit_pct: 10, profit_target_pct: 10, min_trading_days: 4 } };
// n trades, 2 per day from 2026-09-01: win w (money) with probability p (deterministic pattern), else loss l
function history(n, p, w, l, from = Date.UTC(2026, 8, 1)) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ trade_date: new Date(from + Math.floor(i / 2) * 864e5 + (i % 2) * 3600e3).toISOString(), pnl: (i * 7919 % 100) < p * 100 ? w : l, exit_price: 1 });
  return out;
}
function run(acc, trades, runs = 1500) {
  const phase = trades.filter((t) => t.trade_date.slice(0, 10) >= acc.start_date);
  const status = PC.calculatePropStatus({ account: acc, trades: phase, currentDate: '2026-11-14' });
  return MC.simulate({ account: acc, status, trades, runs });
}

describe('prop pass probability', () => {
  it('the coach and the dashboard use the same engine (byte-identical copies)', () => {
    assert.equal(fs.readFileSync('supabase/functions/_shared/prop-montecarlo.js', 'utf8'), fs.readFileSync('public/src/utils/prop-montecarlo.js', 'utf8'),
      'copy public/src/utils/prop-montecarlo.js to supabase/functions/_shared/ and redeploy ai-coach');
  });
  it('deterministic: the same input gives the same answer', () => {
    const t = history(60, 0.5, 200, -100);
    assert.deepEqual(run(ACC, t), run(ACC, t));
  });
  it('a strong trader passes often, a losing one rarely; probabilities add up to 100', () => {
    const good = run(ACC, history(80, 0.6, 250, -100)), bad = run(ACC, history(80, 0.35, 100, -100));
    assert.equal(good.kind, 'challenge');
    assert.ok(good.pass_pct > 70, JSON.stringify(good)); assert.ok(bad.pass_pct < 15, JSON.stringify(bad));
    for (const x of [good, bad]) assert.ok(Math.abs(x.pass_pct + x.fail_pct + x.open_pct - 100) < 0.05);
    assert.equal(good.by_risk.length, 4); assert.deepEqual(good.by_risk.map((b) => b.risk_scale), [0.5, 0.75, 1, 1.25]);
  });
  it('big losses against the daily limit: smaller risk passes more often and is recommended', () => {
    // 3 trades a day, losses of 3 % of the balance: two losses in a day break the 5 % daily limit
    const t = []; for (let i = 0; i < 90; i++) t.push({ trade_date: new Date(Date.UTC(2026, 8, 1) + Math.floor(i / 3) * 864e5 + (i % 3) * 3600e3).toISOString(), pnl: (i * 7919 % 100) < 55 ? 400 : -300, exit_price: 1 });
    const m = run(ACC, t);
    const half = m.by_risk.find((b) => b.risk_scale === 0.5);
    assert.ok(m.fail_daily_pct > m.fail_max_pct, JSON.stringify(m));
    assert.ok(half.pass_pct > m.pass_pct + 5, JSON.stringify(m.by_risk)); assert.ok(m.best_risk_scale < 1);
  });
  it('starts from the challenge state: close to the target passes more than a fresh start', () => {
    const t = history(60, 0.5, 200, -100);
    const ahead = t.concat([{ trade_date: '2026-11-02T09:00:00Z', pnl: 900, exit_price: 1 }, { trade_date: '2026-11-03T09:00:00Z', pnl: 0, exit_price: 1 }]);
    assert.ok(run(ACC, ahead).pass_pct > run(ACC, t).pass_pct);
  });
  it('a max-trading-days rule caps the runs and fails them on time', () => {
    const acc = { ...ACC, rules: { ...ACC.rules, max_trading_days: 3, profit_target_pct: 20 } };
    const m = run(acc, history(60, 0.5, 200, -100));
    assert.equal(m.horizon_days, 3); assert.ok(m.fail_pct + m.open_pct > 90);
  });
  it('end-of-day trailing max loss fails more often than a static one', () => {
    const t = history(80, 0.5, 300, -200);
    const st = run(ACC, t), tr = run({ ...ACC, rules: { ...ACC.rules, max_loss_type: 'eod_trailing', max_loss_limit_pct: 4 } }, t);
    assert.ok(tr.fail_max_pct > st.fail_max_pct, st.fail_max_pct + ' vs ' + tr.fail_max_pct);
  });
  it('funded account without a target: survival; too few trades / passed / failed are reported as such', () => {
    const t = history(60, 0.5, 200, -100);
    const funded = run({ ...ACC, rules: { daily_loss_limit_pct: 5, max_loss_limit_pct: 10 } }, t);
    assert.equal(funded.kind, 'survival'); assert.equal(funded.pass_pct, 0); assert.ok(funded.open_pct > 0);
    assert.deepEqual(run(ACC, history(10, 0.5, 200, -100)), { kind: 'not_enough_trades', trades: 10, needed: 20 });
    assert.equal(run(ACC, t.concat([{ trade_date: '2026-11-02T09:00:00Z', pnl: -900, exit_price: 1 }])).kind, 'failed');
  });
});

describe('pass probability in the AI coach', () => {
  it('prop context carries it and the opening screen recommends a smaller risk when it clearly helps', () => {
    const t = []; for (let i = 0; i < 90; i++) t.push({ trade_date: new Date(Date.UTC(2026, 8, 1) + Math.floor(i / 3) * 864e5 + (i % 3) * 3600e3).toISOString(), pnl: (i * 7919 % 100) < 55 ? 400 : -300, exit_price: 1 });
    const p = propContext(ACC, 'FTMO', t, { currentDate: '2026-11-14', runs: 800 });
    assert.equal(p.pass_probability.kind, 'challenge'); assert.ok(p.pass_probability.best_risk_scale < 1);
    const f = pickInsights({ totals: { trades: 90, win_rate: 55 }, prop_accounts: [p] }, 10).find((x) => x.id === 'prop_odds_risk');
    assert.ok(f && f.params.better > f.params.pass && f.params.journal === 'FTMO', JSON.stringify(f));
  });
});
