// supabase/functions/_shared/prop-context.ts
// Prop firm challenge state for the AI coach: the active prop accounts of the member, evaluated with the app's own engine
// (prop-calculator.js, a byte-identical copy of public/src/utils/prop-calculator.js; tests/ai-coach.test.js keeps the two
// equal) on the same input the prop card uses (live, closed trades of the journal: id, trade_date, pnl). So the coach quotes
// the numbers the member sees on the card. Pure (Node tests).
import './prop-calculator.js';
import './prop-montecarlo.js';

const PC = (globalThis as any).PropCalculator as { calculatePropStatus: (p: Record<string, unknown>) => any };
const MC = (globalThis as any).PropMonteCarlo as { simulate: (p: Record<string, unknown>) => any };

export interface PropAccountRow {
  id: string; journal_id: string; template_key?: string | null; rules?: Record<string, any> | null;
  starting_balance: number | string; start_date: string; phase_index?: number | null;
  reset_tz: string; time_shift_hours?: number | string | null;
}
export interface PropTradeRow { id?: string; trade_date: string; pnl?: number | string | null; exit_price?: number | string | null; platform_source?: string | null }

const r2 = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);

// -> the coach's view of one prop account, or null when it cannot be evaluated
// rows: the journal's trades (all of them: the calculator keeps the phase's own, the pass-probability simulation uses the
// whole history as the trader's result distribution)
export function propContext(acc: PropAccountRow, journalName: string | null, rows: PropTradeRow[], opts: { currentDate?: string; runs?: number } = {}) {
  // same input as prop-service.js syncPropAccountStatus: live rows only, closed only (exit price set), stored pnl
  const trades = (rows || []).filter((t) => t && t.platform_source !== 'backtest' && t.exit_price !== null && t.exit_price !== undefined && t.exit_price !== '')
    .map((t) => ({ id: t.id, trade_date: t.trade_date, pnl: Number(t.pnl) || 0 }));
  let st: any;
  try { st = PC.calculatePropStatus({ account: acc, trades, ...(opts.currentDate ? { currentDate: opts.currentDate } : {}) }); } catch (_) { return null; }
  if (!st) return null;
  const rules = acc.rules || {};
  const base = { journal: journalName || null, firm_template: acc.template_key || null, phase: rules.phase_name || null };
  if (st.overall_status === 'invalid_rules') return { ...base, status: 'invalid_rules' };

  // the phase's own trades (from the start date, prop-day rules) give the typical loss: how many of them the limits still allow
  const start = String(acc.start_date || '').slice(0, 10);
  const phaseLosses = trades.filter((t) => String(t.trade_date).slice(0, 10) >= start && t.pnl < 0).map((t) => -t.pnl);
  const avgLoss = phaseLosses.length >= 3 ? phaseLosses.reduce((s, x) => s + x, 0) / phaseLosses.length : NaN;
  const fit = (room: number) => (Number.isFinite(avgLoss) && avgLoss > 0 && Number.isFinite(room) ? Math.max(0, Math.floor(room / avgLoss)) : null);
  const dl = st.daily_loss || {}, ml = st.max_loss || {}, pt = st.profit_target || {}, td = st.trading_days || {}, cs = st.consistency || {};
  return {
    ...base,
    status: st.overall_status,                      // in_progress | passed | failed
    fail_reasons: st.fail_reasons || [],
    warnings: st.warnings || [],
    start_date: start, starting_balance: r2(Number(acc.starting_balance)),
    balance: st.current_balance, result: st.total_pnl, result_pct: st.total_pnl_pct,
    profit_target: pt.target_pct == null ? null : { target_pct: pt.target_pct, remaining: pt.remaining_amount, progress_pct: pt.progress_pct, reached: !!pt.is_reached },
    daily_loss: { limit: dl.limit_amount, limit_pct: dl.limit_pct, today_result: dl.today_pnl, room_left_today: dl.remaining_margin,
      worst_day: dl.worst_daily_loss, worst_day_date: dl.worst_daily_loss_day },
    max_loss: { type: ml.type, limit_pct: ml.limit_pct, room_left: ml.distance_to_stop, room_left_pct: ml.distance_to_stop_pct, current_drawdown: ml.current_drawdown },
    trading_days: { count: td.count, min_required: td.min_required, remaining: td.remaining, max_allowed: td.max_allowed },
    consistency: cs.enabled ? { max_single_day_pct: cs.max_allowed_pct, best_day_pct: cs.best_day_profit_pct, met: cs.is_met, extra_profit_needed: cs.required_additional_profit } : null,
    phase_trades: st.stats ? { trades: st.stats.trades_count, wins: st.stats.wins, losses: st.stats.losses, win_rate: st.stats.win_rate_pct } : null,
    avg_loss_in_phase: Number.isFinite(avgLoss) ? r2(avgLoss) : null,
    // how many typical losses fit before a rule breaks (null when the phase has fewer than 3 losses)
    avg_losses_until_daily_limit: fit(Number(dl.remaining_margin)),
    avg_losses_until_max_loss: fit(Number(ml.distance_to_stop)),
    pass_probability: passProbability(acc, st, trades, opts.runs),
  };
}

// Monte Carlo of the rest of the challenge with the trader's own results (prop-montecarlo.js), compact for the model
export function passProbability(acc: PropAccountRow, status: any, trades: { trade_date: string; pnl: number }[], runs?: number) {
  let m: any;
  try { m = MC.simulate({ account: acc, status, trades, ...(runs ? { runs } : {}) }); } catch (_) { return null; }
  if (!m || m.kind === 'failed' || m.kind === 'passed') return null;
  if (m.kind === 'not_enough_trades') return { kind: m.kind, trades: m.trades, needed: m.needed };
  return {
    kind: m.kind, runs: m.runs, horizon_days: m.horizon_days, sample_trades: m.sample_trades,
    pass_pct: m.pass_pct, fail_pct: m.fail_pct, still_open_pct: m.open_pct,
    fail_by: { daily_loss: m.fail_daily_pct, max_loss: m.fail_max_pct, time_limit: m.fail_time_pct },
    median_days_to_pass: m.median_days_to_pass, avg_loss_pct_of_balance: m.avg_loss_pct_of_balance,
    by_risk: m.by_risk.map((x: any) => ({ risk_scale: x.risk_scale, pass_pct: x.pass_pct, fail_pct: x.fail_pct })),
    best_risk_scale: m.best_risk_scale,
  };
}
