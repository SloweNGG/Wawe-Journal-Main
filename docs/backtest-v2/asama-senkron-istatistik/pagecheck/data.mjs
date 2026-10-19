// Deterministic dataset for the page differential check: 1 premium user, 2 journals, 3 strategies,
// 120 live trades (sources: NULL, 'ctrader', CSV-like) over the last 80 days, optionally 30 backtest mirrors
// with deliberately huge, net-positive P&L so any leak into a statistic is obvious.
export const FIXED_NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
export const USER_ID = '00000000-0000-4000-8000-0000000000aa';
export const J1 = '11111111-1111-4111-8111-111111111111';
export const J2 = '22222222-2222-4222-8222-222222222222';
const S1 = '33333333-3333-4333-8333-333333333331', S2 = '33333333-3333-4333-8333-333333333332', S3 = '33333333-3333-4333-8333-333333333333';
const pad = (n, w = 12) => String(n).padStart(w, '0');
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function makeData({ backtest = false } = {}) {
  const r = rng(2026);
  const trades = [];
  const syms = [['EURUSD', 'forex', 100000], ['GBPUSD', 'forex', 100000], ['XAUUSD', 'gold', 100], ['BTCUSDT', 'crypto', 1], ['USDJPY', 'forex', 100000]];
  for (let i = 0; i < 120; i++) {
    const [symbol, instrument, mult] = syms[i % syms.length];
    const day = i % 80, hour = 7 + (i * 5) % 11;
    const td = new Date(FIXED_NOW - day * 86400000 - (12 - hour) * 3600000);
    const dir = r() < 0.55 ? 'LONG' : 'SHORT';
    const entry = symbol === 'BTCUSDT' ? 60000 + Math.round(r() * 4000) : symbol === 'XAUUSD' ? 2300 + Math.round(r() * 80) : 1.05 + Math.round(r() * 800) / 10000;
    const move = (r() - 0.45) * (symbol === 'BTCUSDT' ? 900 : symbol === 'XAUUSD' ? 14 : 0.006);
    const exit = +(entry + (dir === 'LONG' ? move : -move)).toFixed(symbol === 'BTCUSDT' || symbol === 'XAUUSD' ? 2 : 5);
    const lot = [0.1, 0.2, 0.5, 1][i % 4];
    const pnl = Math.round((dir === 'LONG' ? exit - entry : entry - exit) * lot * mult * 100) / 100;
    trades.push({
      id: '44444444-4444-4444-8444-' + pad(i), user_id: USER_ID, journal_id: i % 9 === 8 ? J2 : J1, strategy_id: [S1, S2, null, S3][i % 4], symbol, direction: dir, instrument,
      lot, multiplier: mult, entry_price: entry, exit_price: exit, stop_loss: null, take_profit: null, pnl, rr_ratio: null,
      trade_date: td.toISOString(), exit_date: td.toISOString(), notes: i % 10 === 0 ? 'note ' + i : null, created_at: td.toISOString(), updated_at: td.toISOString(),
      status: 'closed', commission: 0, swap: 0, gross_pnl: pnl, is_quick_entry: false, position_id: null, import_hash: null,
      platform_source: i % 3 === 0 ? 'ctrader' : (i % 3 === 1 ? null : 'csv')
    });
  }
  if (backtest) {
    for (let i = 0; i < 30; i++) {
      const td = new Date(FIXED_NOW - (i % 60) * 86400000 - 3600000);
      trades.push({
        id: '55555555-5555-4555-8555-' + pad(i), user_id: USER_ID, journal_id: J1, strategy_id: i % 3 === 0 ? S1 : null, symbol: 'EURUSD', direction: i % 2 ? 'LONG' : 'SHORT', instrument: 'forex',
        lot: 1, multiplier: 100000, entry_price: 1.1, exit_price: 1.09, stop_loss: 1.09, take_profit: 1.12, pnl: i % 2 ? 9000 : -8000, rr_ratio: 2, trade_date: td.toISOString(),
        exit_date: td.toISOString(), notes: null, created_at: td.toISOString(), updated_at: td.toISOString(), status: 'closed', commission: 0, swap: 0, gross_pnl: i % 2 ? 9000 : -8000,
        is_quick_entry: false, position_id: null, import_hash: 'backtest:cccccccc-0000-4000-8000-000000000001:' + pad(i), platform_source: 'backtest'
      });
    }
  }
  return {
    trades,
    journals: [
      { id: J1, user_id: USER_ID, name: 'Ana Hesap', description: null, color: '#7c6dfa', icon: 'folder', is_default: true, is_active: true, created_at: '2026-01-01T00:00:00Z', trading_day_offset: 'Europe/Prague' },
      { id: J2, user_id: USER_ID, name: 'Ikinci', description: null, color: '#22c55e', icon: 'folder', is_default: false, is_active: true, created_at: '2026-01-02T00:00:00Z', trading_day_offset: 'Europe/Prague' }
    ],
    strategies: [
      { id: S1, user_id: USER_ID, journal_id: J1, name: 'Breakout', color: '#8b5cf6', is_active: true, created_at: '2026-01-01T00:00:00Z', description: null },
      { id: S2, user_id: USER_ID, journal_id: J1, name: 'Pullback', color: '#22c55e', is_active: true, created_at: '2026-01-01T00:00:00Z', description: null },
      { id: S3, user_id: USER_ID, journal_id: J1, name: 'Range', color: '#fbbf24', is_active: true, created_at: '2026-01-01T00:00:00Z', description: null }
    ],
    user_profiles: [{ id: USER_ID, email: 't@example.com', username: 'tester', avatar_url: null, is_active: true, plan: 'premium', plan_expires_at: null, max_journals: 10, role: 'user',
      onboarding_completed: true, onboarding_tour_completed: true, preferred_currency: 'USD', created_at: '2026-01-01T00:00:00Z' }],
    user_onboarding: [], notifications: [], prop_accounts: [], ctrader_accounts: []
  };
}
