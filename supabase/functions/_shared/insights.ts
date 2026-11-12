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
