// supabase/functions/_shared/backtest-context.ts
// The member's backtest accounts (Backtest v2: public.backtest_accounts + public.backtest_account_trades) for the AI coach:
// per account the balance, the result, how trades ended (TP / SL / manual), risk against the INITIAL stop (the planned risk,
// immutable), drawdown, direction / session split and the last trades; plus symbol by symbol the tested results against
// the live ones. Journal mirrors (trades rows with platform_source 'backtest') are copies of the closed trades of LINKED
// accounts; this module reads the source tables, so unlinked accounts are covered too. Pure (Node tests).
import { type TradeRow, isClosed, stats, groupBy, session, execution, withR, dir } from './trade-summary.ts';

export interface BacktestAccountRow {
  id: string; name: string; symbol: string; timeframe?: string | null; starting_balance: number | string;
  journal_id?: string | null; data_source?: string | null; is_active?: boolean | null; replay_time?: string | null;
  section_no?: number | null; created_at?: string | null; updated_at?: string | null;
}
export interface BacktestTradeRow {
  id?: string; backtest_account_id: string; symbol: string; direction: string; lot: number | string;
  entry_price: number | string; exit_price?: number | string | null; stop_loss?: number | string | null; take_profit?: number | string | null;
  initial_stop_loss?: number | string | null; initial_take_profit?: number | string | null;
  entry_time: string; exit_time?: string | null; pnl?: number | string | null; commission?: number | string | null;
  gross_pnl?: number | string | null; exit_reason?: string | null; exit_ambiguous?: boolean | null; section_no?: number | null;
}

const num = (v: unknown): number => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : NaN; };
const r2 = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const MAX_ACCOUNTS = 10;

// a backtest trade in the journal's shape; the stop / target are the ones set at the fill (the plan), not the moved ones
export function asTradeRow(t: BacktestTradeRow): TradeRow & { exit_reason?: string | null } {
  const sl = num(t.initial_stop_loss), tp = num(t.initial_take_profit);
  return {
    id: t.id, symbol: String(t.symbol || '?').toUpperCase(), direction: t.direction, lot: t.lot, entry_price: t.entry_price,
    exit_price: t.exit_price ?? null, stop_loss: Number.isFinite(sl) ? sl : (t.stop_loss ?? null), take_profit: Number.isFinite(tp) ? tp : (t.take_profit ?? null),
    pnl: t.pnl ?? null, trade_date: t.entry_time, exit_date: t.exit_time ?? null, commission: t.commission ?? null,
    gross_pnl: t.gross_pnl ?? null, platform_source: 'backtest', exit_reason: t.exit_reason ?? null,
  };
}

// Is the tested system ready to trade live? Every condition that is not met is a reason (empty list = ready).
export const READY_MIN_TRADES = 30;
export function readiness(acc: { data: string; totals: any; max_drawdown_pct: number | null; exit_reasons: any[] }) {
  const reasons: string[] = [];
  const t = acc.totals || {};
  if ((t.trades || 0) < READY_MIN_TRADES) reasons.push('few_trades');
  if (acc.data !== 'real_market_history') reasons.push('synthetic_data');
  if (!(Number(t.expectancy) > 0)) reasons.push('no_edge');
  if (t.avg_r != null && t.avg_r < 0.1) reasons.push('thin_edge');
  if (acc.max_drawdown_pct != null && acc.max_drawdown_pct > 20) reasons.push('deep_drawdown');
  const manual = (acc.exit_reasons || []).find((x: any) => x.key === 'manual');
  if (manual && t.trades && manual.trades / t.trades > 0.3 && manual.net < 0) reasons.push('manual_exits');
  return { ready: !reasons.length, reasons };
}

function account(a: BacktestAccountRow, rows: BacktestTradeRow[], journalName: string | null) {
  const all = rows.map(asTradeRow);
  const closed = all.filter(isClosed).sort((x, y) => Date.parse(x.exit_date || x.trade_date) - Date.parse(y.exit_date || y.trade_date));
  const start = num(a.starting_balance);
  let eq = Number.isFinite(start) ? start : 0, peak = eq, maxDd = 0, maxDdPct = 0, cl = 0, maxCl = 0, com = 0;
  for (const t of closed) {
    const p = num(t.pnl) || 0;
    eq += p; peak = Math.max(peak, eq);
    if (peak - eq > maxDd) { maxDd = peak - eq; maxDdPct = peak > 0 ? (maxDd / peak) * 100 : 0; }
    cl = p < 0 ? cl + 1 : p > 0 ? 0 : cl; maxCl = Math.max(maxCl, cl);
    com += num(t.commission) || 0;
  }
  const ex = execution(closed);
  const held = closed.map((t) => (Date.parse(t.exit_date!) - Date.parse(t.trade_date)) / 60000).filter((m) => Number.isFinite(m) && m >= 0);
  const byReason = groupBy(closed, (t) => String((t as any).exit_reason || 'unknown'));
  const net = stats(closed).net as number;
  return {
    name: a.name, symbol: String(a.symbol || '').toUpperCase(), timeframe: a.timeframe || null,
    // synthetic = generated practice candles (not market data); ctrader = real market history
    data: a.data_source === 'ctrader' ? 'real_market_history' : 'synthetic_practice',
    active: a.is_active !== false, linked_journal: a.journal_id ? (journalName || 'linked') : null,
    starting_balance: r2(start), balance: r2(eq), result_pct: Number.isFinite(start) && start > 0 ? r2((net / start) * 100) : null,
    replay_period: closed.length ? { first: closed[0].trade_date.slice(0, 10), last: String(closed[closed.length - 1].exit_date).slice(0, 10) } : null,
    replay_now: a.replay_time ? String(a.replay_time).slice(0, 16).replace('T', ' ') : null,
    section: a.section_no ?? null,
    totals: { ...withR(closed), open_positions: all.length - closed.length },
    max_drawdown: r2(maxDd), max_drawdown_pct: r2(maxDdPct), max_consecutive_losses: maxCl, commission_total: r2(com),
    avg_hold_minutes: held.length ? Math.round(held.reduce((s, x) => s + x, 0) / held.length) : null,
    exit_reasons: ['tp', 'sl', 'manual'].filter((k) => byReason.has(k)).map((k) => ({ key: k, ...stats(byReason.get(k)!) })),
    same_bar_tp_sl: rows.filter((r) => r.exit_ambiguous && r.exit_time).length,     // TP and SL in the same 1m bar: the result is uncertain
    r_multiples: ex.r_multiples, r_buckets: ex.r_buckets,
    by_direction: [...groupBy(closed, dir).entries()].map(([k, v]) => ({ key: k, ...stats(v) })),
    by_session_utc: [...groupBy(closed, (t) => session(Date.parse(t.trade_date))).entries()].map(([k, v]) => ({ key: k, ...stats(v) })),
    last_trades: closed.slice(-8).reverse().map((t) => ({
      entry: t.trade_date.slice(0, 16).replace('T', ' '), dir: dir(t), lot: r2(num(t.lot)), pnl: r2(num(t.pnl)),
      exit_reason: (t as any).exit_reason || null, held_minutes: t.exit_date ? Math.round((Date.parse(t.exit_date) - Date.parse(t.trade_date)) / 60000) : null,
    })),
  };
}

// accounts: the member's backtest accounts; trades: their trades (any order); live: the journal's trade rows (backtest
// mirrors and open trades are filtered out here); journalNames: id -> name of the member's journals
export function backtestContext(accounts: BacktestAccountRow[], trades: BacktestTradeRow[], live: TradeRow[], journalNames: Map<string, string> = new Map()) {
  if (!accounts || !accounts.length) return null;
  const byAcc = new Map<string, BacktestTradeRow[]>();
  for (const t of trades || []) { const a = byAcc.get(t.backtest_account_id); if (a) a.push(t); else byAcc.set(t.backtest_account_id, [t]); }
  // active first, then the most recently used; accounts without trades last
  const ordered = accounts.slice().sort((x, y) =>
    (Number(y.is_active !== false) - Number(x.is_active !== false)) || (Number(byAcc.has(y.id)) - Number(byAcc.has(x.id)))
    || String(y.updated_at || y.created_at || '').localeCompare(String(x.updated_at || x.created_at || '')));
  const list = ordered.slice(0, MAX_ACCOUNTS).map((a) => account(a, byAcc.get(a.id) || [], a.journal_id ? journalNames.get(a.journal_id) || null : null))
    .map((x) => ({ ...x, live_readiness: readiness(x) }));

  // every closed backtest trade (all accounts) against the live trades, per symbol and data kind
  const real = new Set(accounts.filter((a) => a.data_source === 'ctrader').map((a) => a.id));
  const bt = (trades || []).map((t) => ({ row: asTradeRow(t), real: real.has(t.backtest_account_id) })).filter((x) => isClosed(x.row));
  const liveClosed = (live || []).filter((t) => t && t.platform_source !== 'backtest' && isClosed(t));
  const L = groupBy(liveClosed, (t) => String(t.symbol || '?').toUpperCase());
  const realRows = new Set(bt.filter((x) => x.real).map((x) => x.row));
  const B = groupBy(bt.map((x) => x.row), (t) => t.symbol);
  const vsLive = [...B.entries()].filter(([k, v]) => L.has(k) && v.length >= 5 && L.get(k)!.length >= 5)
    .sort((a, b) => b[1].length - a[1].length).slice(0, 8)
    .map(([k, v]) => ({ key: k, live: withR(L.get(k)!), backtest: withR(v), backtest_on_real_market_history: v.filter((t) => realRows.has(t)).length }));
  const allClosed = bt.map((x) => x.row);
  return {
    accounts_total: accounts.length, accounts_shown: list.length,
    totals: { ...withR(allClosed), real_market_trades: bt.filter((x) => x.real).length, synthetic_trades: bt.filter((x) => !x.real).length },
    accounts: list,
    vs_live_by_symbol: vsLive,
  };
}
