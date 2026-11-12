// supabase/functions/_shared/trade-summary.ts
// Compact statistics of a user's trades for the AI coach (ai-coach Edge Function). Pure: no I/O, so Node tests can run it.
// Same definitions as public/interface/shared/trade-metrics.js: a trade counts only when it is closed (exit_price set) and its
// result is the stored (net) pnl. Times are bucketed in the user's time zone (IANA name, falls back to UTC).

export interface TradeRow {
  id?: string; symbol: string; direction: string; lot?: number | string | null;
  entry_price?: number | string | null; exit_price?: number | string | null;
  stop_loss?: number | string | null; take_profit?: number | string | null;
  pnl?: number | string | null; rr_ratio?: number | string | null;
  trade_date: string; exit_date?: string | null; notes?: string | null;
  strategy_id?: string | null; platform_source?: string | null;
}
export interface StrategyRow { id: string; name: string; description?: string | null }

const num = (v: unknown): number => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : NaN; };
const r2 = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

export function isClosed(t: TradeRow) { return Number.isFinite(num(t.exit_price)); }
function dir(t: TradeRow) { const d = String(t.direction || '').toUpperCase(); return d === 'BUY' || d === 'LONG' ? 'LONG' : 'SHORT'; }
function endTime(t: TradeRow) { return Date.parse(t.exit_date || t.trade_date); }

// a bucket of trades -> { trades, win_rate, net, avg_win, avg_loss, profit_factor }
function stats(list: TradeRow[]) {
  let wins = 0, losses = 0, gw = 0, gl = 0, net = 0;
  for (const t of list) {
    const p = num(t.pnl); if (!Number.isFinite(p)) continue;
    net += p;
    if (p > 0) { wins++; gw += p; } else if (p < 0) { losses++; gl += -p; }
  }
  return {
    trades: list.length, wins, losses, win_rate: pct(wins, wins + losses), net: r2(net),
    avg_win: wins ? r2(gw / wins) : null, avg_loss: losses ? r2(-gl / losses) : null,
    profit_factor: gl > 0 ? r2(gw / gl) : (gw > 0 ? 'inf' : null),
  };
}
function groupBy(list: TradeRow[], key: (t: TradeRow) => string) {
  const m = new Map<string, TradeRow[]>();
  for (const t of list) { const k = key(t); const a = m.get(k); if (a) a.push(t); else m.set(k, [t]); }
  return m;
}

function zoneParts(ms: number, tz: string): { weekday: string; hour: number; day: string; month: string } {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { weekday: p.weekday, hour: Number(p.hour) % 24, day: `${p.year}-${p.month}-${p.day}`, month: `${p.year}-${p.month}` };
}
export function safeTimeZone(tz: unknown): string {
  try { if (typeof tz === 'string' && tz.length < 64) { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } } catch (_) { /* invalid */ }
  return 'UTC';
}
// forex sessions by UTC hour of the entry
function session(ms: number) {
  const h = new Date(ms).getUTCHours();
  if (h < 7) return 'asia (00-07 UTC)';
  if (h < 12) return 'london (07-12 UTC)';
  if (h < 16) return 'london_ny_overlap (12-16 UTC)';
  if (h < 21) return 'new_york (16-21 UTC)';
  return 'late (21-24 UTC)';
}

export function summarizeTrades(rows: TradeRow[], strategies: StrategyRow[], opts: { tz?: string; recent?: number; now?: number } = {}) {
  const tz = safeTimeZone(opts.tz);
  const stratName = new Map(strategies.map((s) => [s.id, s.name]));
  const all = rows.filter((t) => t && t.trade_date && Number.isFinite(Date.parse(t.trade_date)));
  const backtest = all.filter((t) => t.platform_source === 'backtest');
  const live = all.filter((t) => t.platform_source !== 'backtest');
  const closed = live.filter(isClosed).sort((a, b) => endTime(a) - endTime(b));
  const open = live.length - closed.length;

  const out: Record<string, unknown> = {
    time_zone: tz,
    period: closed.length ? { first: closed[0].trade_date.slice(0, 10), last: (closed[closed.length - 1].exit_date || closed[closed.length - 1].trade_date).slice(0, 10) } : null,
    totals: { ...stats(closed), open_or_unfinished: open },
  };
  if (!closed.length) {
    out.note = 'No closed trades yet.';
  } else {
    // equity curve, drawdown, streaks
    let eq = 0, peak = 0, maxDd = 0, cw = 0, cl = 0, maxCw = 0, maxCl = 0;
    const afterLosses: Record<string, TradeRow[]> = { '0': [], '1': [], '2+': [] };
    for (const t of closed) {
      const p = num(t.pnl) || 0;
      afterLosses[cl >= 2 ? '2+' : String(cl)].push(t);
      eq += p; peak = Math.max(peak, eq); maxDd = Math.max(maxDd, peak - eq);
      if (p > 0) { cw++; cl = 0; } else if (p < 0) { cl++; cw = 0; }
      maxCw = Math.max(maxCw, cw); maxCl = Math.max(maxCl, cl);
    }
    const rrs = closed.map((t) => num(t.rr_ratio)).filter(Number.isFinite);
    const withSl = closed.filter((t) => Number.isFinite(num(t.stop_loss))).length;
    const best = closed.reduce((a, b) => (num(b.pnl) > num(a.pnl) ? b : a));
    const worst = closed.reduce((a, b) => (num(b.pnl) < num(a.pnl) ? b : a));
    const holds = closed.filter((t) => t.exit_date).map((t) => ({ p: num(t.pnl), m: (Date.parse(t.exit_date!) - Date.parse(t.trade_date)) / 60000 })).filter((x) => Number.isFinite(x.m) && x.m >= 0);
    const avgHold = (f: (p: number) => boolean) => { const a = holds.filter((x) => f(x.p)); return a.length ? Math.round(a.reduce((s, x) => s + x.m, 0) / a.length) : null; };
    out.risk = {
      max_drawdown: r2(maxDd), max_consecutive_wins: maxCw, max_consecutive_losses: maxCl,
      avg_rr: rrs.length ? r2(rrs.reduce((s, x) => s + x, 0) / rrs.length) : null,
      trades_with_stop_loss_pct: pct(withSl, closed.length),
      best_trade: { symbol: best.symbol, pnl: r2(num(best.pnl)), date: best.trade_date.slice(0, 10) },
      worst_trade: { symbol: worst.symbol, pnl: r2(num(worst.pnl)), date: worst.trade_date.slice(0, 10) },
      avg_hold_minutes_winners: avgHold((p) => p > 0), avg_hold_minutes_losers: avgHold((p) => p < 0),
    };
    out.after_consecutive_losses = Object.fromEntries(Object.entries(afterLosses).map(([k, v]) => [k, stats(v)]));

    const top = (m: Map<string, TradeRow[]>, n: number) => [...m.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, n).map(([k, v]) => ({ key: k, ...stats(v) }));
    out.by_strategy = top(groupBy(closed, (t) => (t.strategy_id && stratName.get(t.strategy_id)) || '(no strategy)'), 15);
    // cross-tab of the 6 most used strategies: session and direction (buckets with at least 3 trades)
    const stratOf = (t: TradeRow) => (t.strategy_id && stratName.get(t.strategy_id)) || '(no strategy)';
    const topStrats = new Set((out.by_strategy as { key: string }[]).slice(0, 6).map((x) => x.key));
    const cross = (key: (t: TradeRow) => string) => [...groupBy(closed.filter((t) => topStrats.has(stratOf(t))), (t) => stratOf(t) + ' | ' + key(t)).entries()]
      .filter(([, v]) => v.length >= 3).map(([k, v]) => { const st = stats(v); return { key: k, trades: st.trades, win_rate: st.win_rate, net: st.net }; });
    out.strategy_by_session_utc = cross((t) => session(Date.parse(t.trade_date)).split(' ')[0]);
    out.strategy_by_direction = cross(dir);
    out.by_symbol = top(groupBy(closed, (t) => String(t.symbol || '?').toUpperCase()), 12);
    out.by_direction = top(groupBy(closed, dir), 2);
    const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const byWd = groupBy(closed, (t) => zoneParts(Date.parse(t.trade_date), tz).weekday);
    out.by_weekday = WD.filter((d) => byWd.has(d)).map((d) => ({ key: d, ...stats(byWd.get(d)!) }));
    const bySes = groupBy(closed, (t) => session(Date.parse(t.trade_date)));
    out.by_session_utc = [...bySes.entries()].map(([k, v]) => ({ key: k, ...stats(v) }));
    const byHour = groupBy(closed, (t) => String(zoneParts(Date.parse(t.trade_date), tz).hour).padStart(2, '0'));
    out.by_entry_hour_local = [...byHour.keys()].sort().map((k) => ({ key: k, ...stats(byHour.get(k)!) }));
    // overtrading: result of the n-th trade of a (local) day
    const perDay = groupBy(closed.slice().sort((a, b) => Date.parse(a.trade_date) - Date.parse(b.trade_date)), (t) => zoneParts(Date.parse(t.trade_date), tz).day);
    const nth: Record<string, TradeRow[]> = { '1st': [], '2nd': [], '3rd': [], '4th+': [] };
    for (const d of perDay.values()) d.forEach((t, i) => nth[i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : '4th+'].push(t));
    out.by_trade_number_of_day = Object.fromEntries(Object.entries(nth).filter(([, v]) => v.length).map(([k, v]) => [k, stats(v)]));
    out.trading_days = perDay.size;
    const byMonth = groupBy(closed, (t) => zoneParts(endTime(t), tz).month);
    out.by_month_last_12 = [...byMonth.keys()].sort().slice(-12).map((k) => ({ key: k, ...stats(byMonth.get(k)!) }));
  }
  const recentN = opts.recent ?? 25;
  out.recent_trades = live.slice().sort((a, b) => Date.parse(b.trade_date) - Date.parse(a.trade_date)).slice(0, recentN).map((t) => ({
    date: t.trade_date.slice(0, 16).replace('T', ' '), symbol: t.symbol, dir: dir(t), lot: r2(num(t.lot)),
    entry: Number.isFinite(num(t.entry_price)) ? num(t.entry_price) : null, exit: Number.isFinite(num(t.exit_price)) ? num(t.exit_price) : null,
    sl: Number.isFinite(num(t.stop_loss)) ? num(t.stop_loss) : null, tp: Number.isFinite(num(t.take_profit)) ? num(t.take_profit) : null,
    pnl: r2(num(t.pnl)), rr: r2(num(t.rr_ratio)), strategy: (t.strategy_id && stratName.get(t.strategy_id)) || null,
    notes: t.notes ? String(t.notes).replace(/\s+/g, ' ').slice(0, 200) : null,
  }));
  out.strategies = strategies.map((s) => ({ name: s.name, description: s.description ? String(s.description).slice(0, 300) : null }));
  if (backtest.length) {
    const bc = backtest.filter(isClosed);
    out.backtest_trades = { totals: stats(bc), by_strategy: [...groupBy(bc, (t) => (t.strategy_id && stratName.get(t.strategy_id)) || '(no strategy)').entries()].slice(0, 10).map(([k, v]) => ({ key: k, ...stats(v) })) };
  }
  return out;
}

// Cumulative result of the closed live trades over time, at most `maxPoints` points (the last trade of each step is kept,
// the first and last trades always). For the equity chart only; not sent to the model.
export function equityCurve(rows: TradeRow[], maxPoints = 80): { t: string; v: number }[] {
  const closed = rows.filter((t) => t && t.platform_source !== 'backtest' && isClosed(t) && Number.isFinite(endTime(t)))
    .sort((a, b) => endTime(a) - endTime(b));
  let eq = 0;
  const pts = closed.map((t) => { eq += num(t.pnl) || 0; return { t: new Date(endTime(t)).toISOString().slice(0, 10), v: Math.round(eq * 100) / 100 }; });
  if (pts.length <= maxPoints) return pts;
  const out: { t: string; v: number }[] = [], step = (pts.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) out.push(pts[Math.round(i * step)]);
  return out;
}
