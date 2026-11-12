// ============================================================
// AI coach: trade summary (supabase/functions/_shared/trade-summary.ts) — the context the ai-coach Edge Function sends to Gemini.
// Runner: node --test tests/*.test.js
// ============================================================
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTrades, safeTimeZone, isClosed } from '../supabase/functions/_shared/trade-summary.ts';

const S = [{ id: 's1', name: 'Breakout', description: 'range break' }, { id: 's2', name: 'Scalp' }];
let n = 0;
function tr(o) {
  n++;
  return Object.assign({ id: 't' + n, symbol: 'EURUSD', direction: 'BUY', lot: 1, entry_price: 1.1, exit_price: 1.101, stop_loss: 1.099, take_profit: 1.103,
    pnl: 100, rr_ratio: 2, trade_date: '2026-10-05T08:00:00Z', exit_date: '2026-10-05T09:00:00Z', notes: null, strategy_id: 's1', platform_source: null }, o);
}

describe('trade-summary', () => {
  it('only closed trades count; open ones are reported separately', () => {
    const s = summarizeTrades([tr({ pnl: 100 }), tr({ pnl: -50 }), tr({ exit_price: null, pnl: null })], S);
    assert.equal(s.totals.trades, 2); assert.equal(s.totals.open_or_unfinished, 1);
    assert.equal(s.totals.wins, 1); assert.equal(s.totals.losses, 1); assert.equal(s.totals.win_rate, 50);
    assert.equal(s.totals.net, 50); assert.equal(s.totals.profit_factor, 2);
    assert.equal(isClosed({ exit_price: '1.2' }), true); assert.equal(isClosed({ exit_price: null }), false);
  });
  it('per strategy, symbol and direction (BUY/SELL normalised)', () => {
    const s = summarizeTrades([tr({ pnl: 100 }), tr({ pnl: 50, strategy_id: 's2', direction: 'SELL', symbol: 'xauusd' }), tr({ pnl: -20, strategy_id: null })], S);
    const by = Object.fromEntries(s.by_strategy.map((x) => [x.key, x]));
    assert.equal(by.Breakout.net, 100); assert.equal(by.Scalp.net, 50); assert.equal(by['(no strategy)'].net, -20);
    assert.ok(s.by_symbol.some((x) => x.key === 'XAUUSD'));
    assert.deepEqual(s.by_direction.map((x) => x.key).sort(), ['LONG', 'SHORT']);
  });
  it('drawdown, streaks and the result after consecutive losses (revenge trading)', () => {
    const d = (h) => `2026-10-0${1 + Math.floor(h / 24)}T${String(h % 24).padStart(2, '0')}:00:00Z`;
    const rows = [100, -50, -50, -50, 30, -10].map((p, i) => tr({ pnl: p, trade_date: d(i * 2), exit_date: d(i * 2 + 1) }));
    const s = summarizeTrades(rows, S);
    assert.equal(s.risk.max_drawdown, 150); assert.equal(s.risk.max_consecutive_losses, 3); assert.equal(s.risk.max_consecutive_wins, 1);
    assert.equal(s.after_consecutive_losses['2+'].trades, 2);           // the 4th (-50) and the 5th (+30) trade
    assert.equal(s.after_consecutive_losses['2+'].net, -20);
  });
  it('weekday and hour in the trader time zone; sessions in UTC', () => {
    // 2026-10-09 is a Friday; 22:30 UTC is already Saturday 01:30 in Istanbul (UTC+3)
    const s = summarizeTrades([tr({ trade_date: '2026-10-09T22:30:00Z', exit_date: '2026-10-09T23:00:00Z' })], S, { tz: 'Europe/Istanbul' });
    assert.equal(s.by_weekday[0].key, 'Sat'); assert.equal(s.by_entry_hour_local[0].key, '01');
    assert.match(s.by_session_utc[0].key, /^late/);
    const u = summarizeTrades([tr({ trade_date: '2026-10-09T22:30:00Z' })], S, { tz: 'Not/AZone' });
    assert.equal(u.time_zone, 'UTC'); assert.equal(u.by_weekday[0].key, 'Fri');
    assert.equal(safeTimeZone('Europe/Berlin'), 'Europe/Berlin'); assert.equal(safeTimeZone(42), 'UTC');
  });
  it('n-th trade of the day (overtrading)', () => {
    const rows = [1, 2, 3, 4, 5].map((h) => tr({ trade_date: `2026-10-05T0${h}:00:00Z`, pnl: h < 3 ? 10 : -10 }));
    const s = summarizeTrades(rows, S);
    assert.equal(s.by_trade_number_of_day['1st'].net, 10); assert.equal(s.by_trade_number_of_day['4th+'].trades, 2);
    assert.equal(s.trading_days, 1);
  });
  it('recent trades: newest first, notes shortened, strategy names instead of ids', () => {
    const s = summarizeTrades([tr({ trade_date: '2026-10-01T08:00:00Z' }), tr({ trade_date: '2026-10-02T08:00:00Z', notes: 'x'.repeat(500) + '\n\nmore' })], S, { recent: 1 });
    assert.equal(s.recent_trades.length, 1); assert.equal(s.recent_trades[0].date, '2026-10-02 08:00');
    assert.equal(s.recent_trades[0].notes.length, 200); assert.equal(s.recent_trades[0].strategy, 'Breakout');
    assert.equal(s.strategies[0].name, 'Breakout');
  });
  it('backtest mirrors are kept apart from live results', () => {
    const s = summarizeTrades([tr({ pnl: 100 }), tr({ pnl: -500, platform_source: 'backtest' })], S);
    assert.equal(s.totals.net, 100); assert.equal(s.backtest_trades.totals.net, -500);
  });
  it('no trades: a note, no crash; bad rows are skipped', () => {
    const s = summarizeTrades([{ symbol: 'X', direction: 'BUY', trade_date: 'nope' }], []);
    assert.equal(s.totals.trades, 0); assert.equal(s.note, 'No closed trades yet.'); assert.deepEqual(s.recent_trades, []);
  });
  it('the summary of 3000 trades stays small (it goes into every request)', () => {
    const rows = []; for (let i = 0; i < 3000; i++) rows.push(tr({ pnl: (i % 3) - 1, trade_date: new Date(Date.UTC(2025, 0, 1) + i * 3600e3 * 7).toISOString(), symbol: 'SYM' + (i % 40), notes: 'note ' + i }));
    const len = JSON.stringify(summarizeTrades(rows, S)).length;
    assert.ok(len < 20000, 'summary is ' + len + ' chars');
  });
});
