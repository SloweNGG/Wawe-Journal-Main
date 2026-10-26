// Backtest v2: "Plan and usage" tab helpers of bt-plan.js (levels, badge, feature rows, RPC answer check)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import '../public/interface/backtest/js/bt-plan.js';
import '../public/interface/backtest/js/bt-draw.js';

const P = globalThis.WwBtPlan;
const rpc = (o = {}) => ({ premium: false, plan: 'free', plan_expires_at: null, accounts: { used: 1, limit: 1 },
  trades: { used: 37, limit: 100, month: '2026-10', resets_at: '2026-11-01T00:00:00Z' }, server_now: '2026-10-26T10:00:00Z', ...o });

describe('bt-plan', () => {
  it('levels: below 80 % ok, from 80 % warn, at or over the limit full', () => {
    assert.equal(P.level(0, 100), 'ok'); assert.equal(P.level(79, 100), 'ok');
    assert.equal(P.level(80, 100), 'warn'); assert.equal(P.level(99, 100), 'warn');
    assert.equal(P.level(100, 100), 'full'); assert.equal(P.level(140, 100), 'full');
    assert.equal(P.level(1, 1), 'full'); assert.equal(P.level(0, 1), 'ok'); assert.equal(P.level(0, 0), 'full');
    assert.equal(P.level(3, 10), 'ok'); assert.equal(P.level(8, 10), 'warn');
  });
  it('bar width stays within 0..100 %', () => {
    assert.equal(P.pct(37, 100), 37); assert.equal(P.pct(150, 100), 100); assert.equal(P.pct(0, 0), 100); assert.equal(P.pct(0, 10), 0);
  });
  it('normalize: the RPC answer as numbers and times; incomplete answers are refused', () => {
    const n = P.normalize(rpc({ plan_expires_at: '2026-12-31T21:00:00Z' }));
    assert.deepEqual(n.accounts, { used: 1, limit: 1 });
    assert.equal(n.trades.used, 37); assert.equal(n.trades.limit, 100); assert.equal(n.trades.month, '2026-10');
    assert.equal(n.trades.resetsMs, Date.UTC(2026, 10, 1)); assert.equal(n.expiresMs, Date.UTC(2026, 11, 31, 21));
    assert.equal(P.normalize(rpc()).expiresMs, null);
    assert.equal(P.normalize(null), null); assert.equal(P.normalize({}), null);
    assert.equal(P.normalize(rpc({ trades: { used: 'x', limit: 100 } })), null);
    assert.equal(P.normalize(rpc({ accounts: { used: 1 } })), null);
    assert.equal(P.normalize(rpc({ premium: 'true' })).premium, false);   // only a real boolean counts
  });
  it('badge: free plan from 80 % of the monthly trades, never for Premium, not for the account quota alone', () => {
    assert.equal(P.badge(null), null);
    assert.equal(P.badge(P.normalize(rpc())), null);                                       // 37/100, accounts 1/1
    assert.deepEqual(P.badge(P.normalize(rpc({ trades: { used: 85, limit: 100 } }))), { level: 'warn', used: 85, limit: 100 });
    assert.deepEqual(P.badge(P.normalize(rpc({ trades: { used: 100, limit: 100 } }))), { level: 'full', used: 100, limit: 100 });
    assert.equal(P.badge(P.normalize(rpc({ premium: true, trades: { used: 500, limit: 100 } }))), null);
  });
  it('features: drawing tools (9 / 9) and saved drawings on for every plan; the rest by plan; the count matches bt-draw.js', () => {
    assert.equal(P.DRAW_TOOLS, globalThis.WwBtDraw.TOOLS.length);
    const free = P.features({});
    assert.deepEqual(free.map((f) => f.id), ['drawing_tools', 'saved_drawings', 'themes', 'stats', 'multi']);
    assert.deepEqual(free.map((f) => f.on), [true, true, false, false, false]); assert.equal(free[0].value, '9 / 9');
    const pro = P.features({ backtestThemes: true, backtestStats: true, backtestMultiChart: true });
    assert.ok(pro.every((f) => f.on)); assert.equal(pro[0].value, '9 / 9');
    assert.deepEqual(P.features({ backtestStats: true }).map((f) => f.on), [true, true, false, true, false]);
  });
});
