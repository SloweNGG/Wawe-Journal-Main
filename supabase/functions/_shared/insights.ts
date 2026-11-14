// supabase/functions/_shared/insights.ts
// The AI coach panel's opening screen (ai-coach Edge Function, action "snapshot"): a few numbers and up to 3 personal
// findings picked by rules from the trade summary (trade-summary.ts). No model call, no message quota. Each finding is an
// id + params; the panel words it in the member's language (aiCoach.insight.<id>) and offers a matching question.
// Pure (Node tests).

export interface Insight { id: string; severity: number; params: Record<string, string | number> }

const MIN = 8;                                       // trades a bucket needs before it is worth a finding

function worst(list: any[], minTrades = MIN) {
  return (list || []).filter((x) => x && x.trades >= minTrades && Number.isFinite(x.net) && x.net < 0)
    .sort((a, b) => a.net - b.net)[0] || null;
}

export function pickInsights(s: any, max = 3): Insight[] {
  const out: Insight[] = [];
  const t = s?.totals;
  if (!t || !t.trades) return [{ id: 'no_trades', severity: 0, params: {} }];
  const wr = Number(t.win_rate) || 0;

  // prop challenges first: a rule about to break costs the whole account
  for (const p of (s.prop_accounts || []) as any[]) {
    if (!p || !p.status) continue;
    const journal = p.journal || '—';
    if (p.status === 'failed') { out.push({ id: 'prop_failed', severity: 110, params: { journal } }); continue; }
    if (p.status !== 'in_progress') continue;
    if (p.avg_losses_until_daily_limit != null && p.avg_losses_until_daily_limit <= 2 && p.daily_loss?.today_result < 0) {
      out.push({ id: 'prop_daily_limit', severity: 105, params: { journal, room: p.daily_loss.room_left_today, losses: p.avg_losses_until_daily_limit } });
    } else if (p.avg_losses_until_max_loss != null && p.avg_losses_until_max_loss <= 3) {
      out.push({ id: 'prop_max_loss', severity: 100, params: { journal, room: p.max_loss.room_left, losses: p.avg_losses_until_max_loss } });
    } else if (p.profit_target && !p.profit_target.reached && p.profit_target.progress_pct >= 75) {
      out.push({ id: 'prop_target_close', severity: 45, params: { journal, remaining: p.profit_target.remaining, pct: Math.round(p.profit_target.progress_pct) } });
    }
  }

  // pass probability of each running challenge: with a smaller risk per trade when that clearly passes more often
  for (const p of (s.prop_accounts || []) as any[]) {
    const pp = p && p.status === 'in_progress' ? p.pass_probability : null;
    if (!pp || pp.kind !== 'challenge') continue;
    const better = pp.best_risk_scale < 1 ? (pp.by_risk || []).find((x: any) => x.risk_scale === pp.best_risk_scale) : null;
    if (better) out.push({ id: 'prop_odds_risk', severity: 92, params: { journal: p.journal || '—', pass: Math.round(pp.pass_pct), better: Math.round(better.pass_pct), cut: Math.round((1 - pp.best_risk_scale) * 100) } });
    else out.push({ id: 'prop_odds', severity: pp.pass_pct < 30 ? 82 : 50, params: { journal: p.journal || '—', pass: Math.round(pp.pass_pct) } });
  }

  // an emotion in the trader's notes that keeps costing money
  const em = (s.emotions?.by_emotion || []).filter((x: any) => !x.positive && x.trades >= 5 && x.net < 0).sort((a: any, b: any) => a.net - b.net)[0];
  if (em) out.push({ id: 'emotion_cost', severity: 76, params: { emotion: em.key, net: em.net, trades: em.trades } });

  // the member's own trading plan: how often it is followed (last 7 days, enough trades)
  const tp = s.trading_plan?.last_7_days;
  if (tp && tp.trades >= 5 && tp.score != null) {
    const rule = s.trading_plan.most_broken_rule_7d;
    if (tp.score < 80 && rule) out.push({ id: 'plan_discipline', severity: tp.score < 60 ? 87 : 64, params: { score: Math.round(tp.score), rule, trades: tp.trades } });
    else if (tp.score >= 90) out.push({ id: 'plan_followed', severity: 33, params: { score: Math.round(tp.score), trades: tp.trades } });
  }

  // position size grows after losses: the money version of revenge trading
  const ps = s.position_sizing;
  if (ps && ps.avg_size_after_loss != null && ps.avg_size_after_win && ps.trades_after_loss >= MIN && ps.avg_size_after_loss >= 1.25 * ps.avg_size_after_win) {
    out.push({ id: 'size_after_loss', severity: 88, params: { after_loss: ps.avg_size_after_loss, after_win: ps.avg_size_after_win, trades: ps.trades_after_loss } });
  } else if (ps && ps.oversized_1_5x && ps.oversized_1_5x.trades >= 5 && ps.oversized_1_5x.net < 0) {
    out.push({ id: 'oversized', severity: 72, params: { trades: ps.oversized_1_5x.trades, net: ps.oversized_1_5x.net } });
  }
  // stops that do not hold, winners cut before the target
  const rm = s.r_multiples;
  if (rm && rm.losses_beyond_stop?.trades >= 5 && rm.losses_with_r >= MIN && rm.losses_beyond_stop.pct_of_losses >= 20) {
    out.push({ id: 'stop_overrun', severity: 84, params: { pct: rm.losses_beyond_stop.pct_of_losses, avg_r: rm.losses_beyond_stop.avg_r, trades: rm.losses_beyond_stop.trades } });
  }
  if (rm && rm.winners_with_target >= MIN && rm.winners_target_capture_median_pct != null && rm.winners_target_capture_median_pct <= 60) {
    out.push({ id: 'early_exit', severity: 58, params: { capture: rm.winners_target_capture_median_pct, trades: rm.winners_with_target } });
  }
  const c = s.costs;
  if (c && c.cost_pct_of_gross_profit != null && c.cost_pct_of_gross_profit >= 20 && c.trades_with_cost_data >= MIN) {
    out.push({ id: 'costs_high', severity: 62, params: { pct: Math.round(c.cost_pct_of_gross_profit), total: c.net_cost_total } });
  }
  // tested vs live: the idea works, the execution does not
  const gap = (s.backtest_vs_live?.by_strategy || []).concat(s.backtest_vs_live?.by_symbol || [])
    .filter((x: any) => x.live.trades >= 10 && x.backtest.trades >= 10 && x.live.win_rate != null && x.backtest.win_rate != null && x.live.win_rate <= x.backtest.win_rate - 15)
    .sort((a: any, b: any) => (a.live.win_rate - a.backtest.win_rate) - (b.live.win_rate - b.backtest.win_rate))[0];
  if (gap) out.push({ id: 'backtest_gap', severity: 68, params: { name: gap.key, live: gap.live.win_rate, backtest: gap.backtest.win_rate, trades: gap.live.trades } });
  // a backtest account that loses over a real sample: the system needs work before it goes live
  const btWeak = ((s.backtest_accounts?.accounts || []) as any[])
    .filter((a) => a && a.totals && a.totals.trades >= 20 && a.totals.net < 0).sort((a, b) => a.totals.net - b.totals.net)[0];
  if (btWeak) out.push({ id: 'bt_no_edge', severity: 52, params: { name: btWeak.name, net: btWeak.totals.net, trades: btWeak.totals.trades } });
  // a tested system that looks ready and is not traded live yet: the next step is a small live trial
  const ready = ((s.backtest_accounts?.accounts || []) as any[]).find((a) => a?.live_readiness?.ready && !a.live_readiness.trades_this_symbol_live);
  if (ready) out.push({ id: 'bt_ready', severity: 42, params: { name: ready.name, symbol: ready.symbol, trades: ready.totals.trades } });

  // recent form against the trader's own history
  const rf = s.recent_form;
  if (rf && rf.before.trades >= 20 && rf.last_20.win_rate != null && rf.before.win_rate != null) {
    if (rf.last_20.win_rate <= rf.before.win_rate - 15 && rf.last_20.net < 0) out.push({ id: 'form_down', severity: 66, params: { win_rate: rf.last_20.win_rate, before: rf.before.win_rate } });
    else if (rf.last_20.win_rate >= rf.before.win_rate + 10 && rf.last_20.net > 0) out.push({ id: 'form_up', severity: 35, params: { win_rate: rf.last_20.win_rate, before: rf.before.win_rate } });
  }

  const after = s.after_consecutive_losses?.['2+'], base = s.after_consecutive_losses?.['0'];
  if (after && after.trades >= MIN && after.win_rate != null && after.win_rate <= (base?.win_rate ?? wr) - 10) {
    out.push({ id: 'revenge', severity: 90 + Math.min(20, (base?.win_rate ?? wr) - after.win_rate), params: { win_rate: after.win_rate, base: base?.win_rate ?? wr, trades: after.trades } });
  }
  const nth = s.by_trade_number_of_day || {}, late = nth['4th+'] || nth['3rd'], first = nth['1st'];
  if (late && first && late.trades >= MIN && late.net < 0 && late.win_rate != null && first.win_rate != null && late.win_rate <= first.win_rate - 10) {
    out.push({ id: 'overtrading', severity: 80, params: { win_rate: late.win_rate, first: first.win_rate, trades: late.trades } });
  }
  const r = s.risk || {};
  if (r.trades_with_stop_loss_pct != null && r.trades_with_stop_loss_pct < 90 && t.trades >= MIN) {
    out.push({ id: 'no_stop', severity: 85, params: { pct: Math.round(100 - r.trades_with_stop_loss_pct) } });
  }
  if (r.avg_hold_minutes_losers && r.avg_hold_minutes_winners && r.avg_hold_minutes_losers >= 1.5 * r.avg_hold_minutes_winners && t.losses >= MIN) {
    out.push({ id: 'holding_losers', severity: 60, params: { losers: r.avg_hold_minutes_losers, winners: r.avg_hold_minutes_winners } });
  }
  const st = worst((s.by_strategy || []).filter((x: any) => x.key !== '(no strategy)'), 10);
  if (st) out.push({ id: 'weak_strategy', severity: 75, params: { name: st.key, net: st.net, win_rate: st.win_rate ?? 0, trades: st.trades } });
  const wd = worst(s.by_weekday);
  if (wd && wd.win_rate != null && wd.win_rate <= wr - 10) out.push({ id: 'weak_weekday', severity: 70, params: { day: wd.key, win_rate: wd.win_rate, trades: wd.trades } });
  const ses = worst(s.by_session_utc);
  if (ses && ses.win_rate != null && ses.win_rate <= wr - 10) out.push({ id: 'weak_session', severity: 65, params: { session: String(ses.key).split(' ')[0], net: ses.net, trades: ses.trades } });
  const sym = worst(s.by_symbol);
  if (sym && (s.by_symbol || []).length > 1) out.push({ id: 'weak_symbol', severity: 55, params: { symbol: sym.key, net: sym.net, trades: sym.trades } });
  const best = (s.by_strategy || []).filter((x: any) => x.trades >= 10 && x.net > 0 && x.key !== '(no strategy)').sort((a: any, b: any) => b.net - a.net)[0];
  if (best) out.push({ id: 'best_strategy', severity: 40, params: { name: best.key, net: best.net, win_rate: best.win_rate ?? 0, trades: best.trades } });
  if (!out.length) out.push({ id: 'general', severity: 1, params: { trades: t.trades, win_rate: wr } });
  return out.sort((a, b) => b.severity - a.severity).slice(0, max);
}

// numbers for the opening screen: this month (last month bucket when it is the current month) and all time
export function snapshotNumbers(s: any, nowMonth: string) {
  const t = s?.totals || {};
  const months = s?.by_month_last_12 || [];
  const m = months.length && months[months.length - 1].key === nowMonth ? months[months.length - 1] : null;
  return {
    month: { key: nowMonth, trades: m ? m.trades : 0, net: m ? m.net : 0, win_rate: m ? m.win_rate : null },
    overall: { trades: t.trades || 0, net: t.net ?? 0, win_rate: t.win_rate ?? null, profit_factor: t.profit_factor === 'inf' ? null : (t.profit_factor ?? null) },
  };
}
