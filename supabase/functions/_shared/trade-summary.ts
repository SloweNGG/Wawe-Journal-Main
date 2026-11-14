// supabase/functions/_shared/trade-summary.ts
// Compact statistics of a user's trades for the AI coach (ai-coach Edge Function). Pure: no I/O, so Node tests can run it.
// Same definitions as public/interface/shared/trade-metrics.js: a trade counts only when it is closed (exit_price set) and its
// result is the stored (net) pnl. Times are bucketed in the user's time zone (IANA name, falls back to UTC).

import { emotionStats } from './emotions.ts';

export interface TradeRow {
  id?: string; symbol: string; direction: string; lot?: number | string | null;
  entry_price?: number | string | null; exit_price?: number | string | null;
  stop_loss?: number | string | null; take_profit?: number | string | null;
  pnl?: number | string | null; rr_ratio?: number | string | null;
  trade_date: string; exit_date?: string | null; notes?: string | null;
  strategy_id?: string | null; platform_source?: string | null;
  // broker costs (cTrader / MT5 sync): commission is stored as a positive cost, swap as signed income;
  // pnl = gross_pnl - commission + swap
  commission?: number | string | null; swap?: number | string | null; gross_pnl?: number | string | null;
  journal_id?: string | null;
}
export interface StrategyRow { id: string; name: string; description?: string | null }

const num = (v: unknown): number => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : NaN; };
const r2 = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

export function isClosed(t: TradeRow) { return Number.isFinite(num(t.exit_price)); }
export function dir(t: TradeRow) { const d = String(t.direction || '').toUpperCase(); return d === 'BUY' || d === 'LONG' ? 'LONG' : 'SHORT'; }
function endTime(t: TradeRow) { return Date.parse(t.exit_date || t.trade_date); }

// a bucket of trades -> { trades, win_rate, net, avg_win, avg_loss, profit_factor }
export function stats(list: TradeRow[]) {
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
export function groupBy(list: TradeRow[], key: (t: TradeRow) => string) {
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
export function session(ms: number) {
  const h = new Date(ms).getUTCHours();
  if (h < 7) return 'asia (00-07 UTC)';
  if (h < 12) return 'london (07-12 UTC)';
  if (h < 16) return 'london_ny_overlap (12-16 UTC)';
  if (h < 21) return 'new_york (16-21 UTC)';
  return 'late (21-24 UTC)';
}

// R multiple of a closed trade: its result in units of the risk it took (entry -> recorded stop). null without a stop, with a
// stop on the winning side of the entry (moved to break-even or trailed into profit: not the planned risk any more), with a
// stop too close to the entry to be a real risk, or an absurd value.
export function rMultiple(t: TradeRow): number | null {
  const e = num(t.entry_price), x = num(t.exit_price), sl = num(t.stop_loss);
  if (!(Number.isFinite(e) && Number.isFinite(x) && Number.isFinite(sl)) || e <= 0) return null;
  const s = dir(t) === 'LONG' ? 1 : -1;
  const risk = s * (e - sl);
  if (!(risk > e * 0.00005)) return null;
  const r = (s * (x - e)) / risk;
  return Number.isFinite(r) && Math.abs(r) <= 50 ? r : null;
}
// planned reward:risk from the recorded stop and target; null when either is missing or on the wrong side
function plannedRr(t: TradeRow): number | null {
  const e = num(t.entry_price), sl = num(t.stop_loss), tp = num(t.take_profit);
  if (!(Number.isFinite(e) && Number.isFinite(sl) && Number.isFinite(tp)) || e <= 0) return null;
  const s = dir(t) === 'LONG' ? 1 : -1, risk = s * (e - sl), reward = s * (tp - e);
  if (!(risk > e * 0.00005) || !(reward > 0)) return null;
  const rr = reward / risk;
  return rr <= 50 ? rr : null;
}
const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
function median(a: number[]) {
  if (!a.length) return NaN;
  const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const symKey = (t: TradeRow) => String(t.symbol || '?').toUpperCase();
// buckets of the R distribution, in order: where the losses and wins land relative to the planned risk
export const R_BUCKETS = ['≤ −1.5R', '−1.5R…−0.9R', '−0.9R…0', '0…1R', '1R…2R', '≥ 2R'] as const;
function rBucket(r: number) {
  return r <= -1.5 ? R_BUCKETS[0] : r <= -0.9 ? R_BUCKETS[1] : r < 0 ? R_BUCKETS[2] : r < 1 ? R_BUCKETS[3] : r < 2 ? R_BUCKETS[4] : R_BUCKETS[5];
}

// Execution against the plan: R multiples, stops that did not hold, winners closed before their target.
export function execution(closed: TradeRow[]) {
  const rs = closed.map((t) => ({ t, r: rMultiple(t) })).filter((x): x is { t: TradeRow; r: number } => x.r != null);
  if (!rs.length) return { r_multiples: null, r_buckets: [] };
  const wins = rs.filter((x) => x.r > 0), losses = rs.filter((x) => x.r < 0);
  const over = losses.filter((x) => x.r < -1.2);
  const capture = wins.map((x) => { const p = plannedRr(x.t); return p ? (x.r / p) * 100 : NaN; }).filter(Number.isFinite);
  const planned = rs.map((x) => plannedRr(x.t)).filter((v): v is number => v != null);
  const byB = groupBy(rs.map((x) => x.t), (t) => rBucket(rMultiple(t)!));
  return {
    r_multiples: {
      trades_with_r: rs.length, share_of_closed_pct: pct(rs.length, closed.length),
      expectancy_r: r2(avg(rs.map((x) => x.r))),
      avg_win_r: wins.length ? r2(avg(wins.map((x) => x.r))) : null,
      avg_loss_r: losses.length ? r2(avg(losses.map((x) => x.r))) : null, losses_with_r: losses.length,
      // a loss far beyond -1R: the stop was moved away, ignored, missing at the broker, or slippage
      losses_beyond_stop: { trades: over.length, pct_of_losses: pct(over.length, losses.length), avg_r: over.length ? r2(avg(over.map((x) => x.r))) : null },
      planned_rr_avg: planned.length ? r2(avg(planned)) : null, trades_with_target: planned.length,
      // how much of the planned target the winners took (median, %), and how many closed before 80 % of it
      winners_target_capture_median_pct: capture.length ? Math.round(median(capture)) : null,
      winners_closed_before_80pct_of_target_pct: capture.length ? pct(capture.filter((c) => c < 80).length, capture.length) : null,
      winners_with_target: capture.length,
    },
    r_buckets: R_BUCKETS.filter((k) => byB.has(k)).map((k) => ({ key: k, ...stats(byB.get(k)!) })),
  };
}

// Position size discipline: lot relative to the trader's usual lot on the same symbol (median), after a win vs a loss.
function sizing(closed: TradeRow[]) {
  const med = new Map<string, number>();
  for (const [k, v] of groupBy(closed, symKey)) {
    const lots = v.map((t) => num(t.lot)).filter((x) => Number.isFinite(x) && x > 0);
    if (lots.length >= 5) med.set(k, median(lots));
  }
  const byEntry = closed.slice().sort((a, b) => Date.parse(a.trade_date) - Date.parse(b.trade_date));
  const rel = (t: TradeRow) => { const m = med.get(symKey(t)), l = num(t.lot); return m && m > 0 && Number.isFinite(l) && l > 0 ? l / m : NaN; };
  const afterLoss: number[] = [], afterWin: number[] = [];
  const oversized: TradeRow[] = []; let oversizedAfterLoss = 0, sized = 0;
  for (let i = 0; i < byEntry.length; i++) {
    const t = byEntry[i], x = rel(t);
    if (!Number.isFinite(x)) continue;
    sized++;
    const prev = i > 0 ? num(byEntry[i - 1].pnl) : NaN;
    if (prev < 0) afterLoss.push(x); else if (prev > 0) afterWin.push(x);
    if (x >= 1.5) { oversized.push(t); if (prev < 0) oversizedAfterLoss++; }
  }
  if (sized < 10) return null;
  return {
    note: 'size = lot / the trader\'s median lot on the same symbol (1.0 = usual size)',
    avg_size_after_loss: afterLoss.length ? r2(avg(afterLoss)) : null, trades_after_loss: afterLoss.length,
    avg_size_after_win: afterWin.length ? r2(avg(afterWin)) : null, trades_after_win: afterWin.length,
    oversized_1_5x: { ...stats(oversized), share_pct: pct(oversized.length, sized), after_a_loss: oversizedAfterLoss },
    normal_size: stats(byEntry.filter((t) => { const x = rel(t); return Number.isFinite(x) && x < 1.5; })),
  };
}

// Broker costs (synced accounts): what commission and swap took from the gross result.
function costs(closed: TradeRow[]) {
  let com = 0, swp = 0, grossWin = 0, n = 0, flipped = 0;
  for (const t of closed) {
    const c = num(t.commission), s = num(t.swap);
    if (!Number.isFinite(c) && !Number.isFinite(s)) continue;
    n++; com += Number.isFinite(c) ? c : 0; swp += Number.isFinite(s) ? s : 0;
    let g = num(t.gross_pnl);
    if (!Number.isFinite(g)) g = (num(t.pnl) || 0) + (Number.isFinite(c) ? c : 0) - (Number.isFinite(s) ? s : 0);
    if (g > 0) { grossWin += g; if ((num(t.pnl) || 0) <= 0) flipped++; }
  }
  if (!n || (Math.abs(com) < 0.005 && Math.abs(swp) < 0.005)) return null;
  const cost = com - swp;
  return {
    trades_with_cost_data: n, commission_total: r2(com), swap_total: r2(swp), net_cost_total: r2(cost),
    avg_cost_per_trade: r2(cost / n), cost_pct_of_gross_profit: grossWin > 0 ? r2((cost / grossWin) * 100) : null,
    gross_winners_turned_losers_by_costs: flipped,
  };
}

export function withR(list: TradeRow[]) {
  const rs = list.map(rMultiple).filter((v): v is number => v != null);
  return { ...stats(list), expectancy: list.length ? r2(list.reduce((s, t) => s + (num(t.pnl) || 0), 0) / list.length) : null, avg_r: rs.length >= 5 ? r2(avg(rs)) : null };
}

export function summarizeTrades(rows: TradeRow[], strategies: StrategyRow[], opts: { tz?: string; recent?: number; now?: number } = {}) {
  const tz = safeTimeZone(opts.tz);
  const stratName = new Map(strategies.map((s) => [s.id, s.name]));
  const all = rows.filter((t) => t && t.trade_date && Number.isFinite(Date.parse(t.trade_date)));
  const backtest = all.filter((t) => t.platform_source === 'backtest');
  const live = all.filter((t) => t.platform_source !== 'backtest');
  const closed = live.filter(isClosed).sort((a, b) => endTime(a) - endTime(b));
  const open = live.length - closed.length;

  const nowMs = opts.now ?? Date.now(), today = zoneParts(nowMs, tz);
  const todays = live.filter((t) => zoneParts(Date.parse(t.trade_date), tz).day === today.day);
  const out: Record<string, unknown> = {
    time_zone: tz,
    now_local: { date: today.day, weekday: today.weekday, hour: today.hour },
    period: closed.length ? { first: closed[0].trade_date.slice(0, 10), last: (closed[closed.length - 1].exit_date || closed[closed.length - 1].trade_date).slice(0, 10) } : null,
    totals: { ...stats(closed), expectancy_per_trade: closed.length ? r2((stats(closed).net as number) / closed.length) : null, open_or_unfinished: open },
    today: { opened: todays.length, ...stats(todays.filter(isClosed)) },
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

    const ex = execution(closed);
    out.r_multiples = ex.r_multiples;
    out.r_buckets = ex.r_buckets;
    out.position_sizing = sizing(closed);
    out.costs = costs(closed);
    // is the trader getting better or worse: the last 20 closed trades against everything before
    if (closed.length >= 30) out.recent_form = { last_20: withR(closed.slice(-20)), before: withR(closed.slice(0, -20)) };
    // the trades that moved the account most, with the trader's own notes: the "why" behind the numbers
    const brief = (t: TradeRow) => {
      const r = rMultiple(t), held = t.exit_date ? Math.round((Date.parse(t.exit_date) - Date.parse(t.trade_date)) / 60000) : NaN;
      return {
        date: t.trade_date.slice(0, 16).replace('T', ' '), symbol: t.symbol, dir: dir(t), lot: r2(num(t.lot)), pnl: r2(num(t.pnl)),
        r: r == null ? null : r2(r), held_minutes: Number.isFinite(held) && held >= 0 ? held : null,
        strategy: (t.strategy_id && stratName.get(t.strategy_id)) || null, stop_loss_set: Number.isFinite(num(t.stop_loss)),
        notes: t.notes ? String(t.notes).replace(/\s+/g, ' ').slice(0, 200) : null,
      };
    };
    // emotions in the trader's notes (tags from the trade forms and plain words): what each one costs
    const em = emotionStats(closed);
    if (em) out.emotions = em;
    const byPnl = closed.filter((t) => Number.isFinite(num(t.pnl))).sort((a, b) => num(a.pnl) - num(b.pnl));
    out.largest_losses = byPnl.filter((t) => num(t.pnl) < 0).slice(0, 8).map(brief);
    out.largest_wins = byPnl.filter((t) => num(t.pnl) > 0).slice(-5).reverse().map(brief);
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
    // the same strategy / symbol tested and traded live: a live result far below the test points at execution, not the idea
    const pair = (key: (t: TradeRow) => string, skipNoStrategy: boolean) => {
      const L = groupBy(closed, key), B = groupBy(bc, key);
      return [...L.entries()].filter(([k, v]) => B.has(k) && v.length >= 5 && B.get(k)!.length >= 5 && !(skipNoStrategy && k === '(no strategy)'))
        .sort((a, b) => b[1].length - a[1].length).slice(0, 8)
        .map(([k, v]) => ({ key: k, live: withR(v), backtest: withR(B.get(k)!) }));
    };
    const vs = { by_strategy: pair((t) => (t.strategy_id && stratName.get(t.strategy_id)) || '(no strategy)', true), by_symbol: pair(symKey, false) };
    if (vs.by_strategy.length || vs.by_symbol.length) out.backtest_vs_live = vs;
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
