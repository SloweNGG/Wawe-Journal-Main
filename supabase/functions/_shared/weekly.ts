// supabase/functions/_shared/weekly.ts
// Weekly review and the weekly goal. A week is Monday-Sunday in the member's zone. The review of last week is written once
// as a notification the first time the coach sees the member in a new week (panel opened, a sync, a manual trade): no cron.
// The goal is one measurable behaviour for the week (coach_settings.plan.goal = { kind, target, week_start }), suggested
// from last week's biggest leak and accepted by the member in the panel; the next review says whether it held.
// weeklyReview / goalCheck / suggestGoal are pure (Node tests); runWeeklyReview does the I/O.

export const GOAL_KINDS = ['stop_every_trade', 'max_trades_per_day', 'stop_after_losses', 'max_daily_loss', 'no_size_up_after_loss'] as const;
export type GoalKind = typeof GOAL_KINDS[number];
export interface Goal { kind: GoalKind; target: number; week_start: string }

interface T { trade_date: string; exit_date?: string | null; pnl?: any; exit_price?: any; stop_loss?: any; lot?: any; symbol?: string; platform_source?: string | null }
const num = (v: unknown) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : NaN; };
const r2 = (v: number) => Math.round(v * 100) / 100;
const FMT = new Map<string, Intl.DateTimeFormat>();
function parts(ms: number, tz: string) {
  let f = FMT.get(tz);
  if (!f) { try { f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }); } catch (_) { f = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }); } FMT.set(tz, f); }
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { day: `${p.year}-${p.month}-${p.day}`, wd: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) };
}
export const addDays = (day: string, n: number) => new Date(Date.parse(day + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
// Monday of the week containing ms (local day string)
export function weekStart(ms: number, tz: string) { const p = parts(ms, tz); return addDays(p.day, -p.wd); }

function closedIn(trades: T[], tz: string, from: string, to: string) {
  return (trades || []).filter((t) => t && t.platform_source !== 'backtest' && Number.isFinite(num(t.exit_price)) && Number.isFinite(Date.parse(t.trade_date)))
    .map((t) => ({ t, open: Date.parse(t.trade_date), day: parts(Date.parse(t.trade_date), tz).day }))
    .filter((x) => x.day >= from && x.day <= to).sort((a, b) => a.open - b.open);
}
function median(a: number[]) { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

// how many times a goal was broken in [from, to]; lots: the member's usual lot per symbol (for the size goal)
export function goalBreaks(kind: GoalKind, target: number, trades: T[], tz: string, from: string, to: string, lots?: Map<string, number>) {
  const w = closedIn(trades, tz, from, to);
  const byDay = new Map<string, typeof w>();
  for (const x of w) (byDay.get(x.day) || byDay.set(x.day, []).get(x.day)!).push(x);
  let breaks = 0;
  if (kind === 'stop_every_trade') breaks = w.filter((x) => !Number.isFinite(num(x.t.stop_loss))).length;
  else if (kind === 'max_trades_per_day') breaks = [...byDay.values()].filter((d) => d.length > target).length;
  else if (kind === 'max_daily_loss') breaks = [...byDay.values()].filter((d) => d.reduce((s, x) => s + (num(x.t.pnl) || 0), 0) < -target).length;
  else if (kind === 'stop_after_losses') {
    for (const d of byDay.values()) { let streak = 0; for (const x of d) { if (streak >= target) breaks++; const p = num(x.t.pnl); streak = p < 0 ? streak + 1 : p > 0 ? 0 : streak; } }
  } else if (kind === 'no_size_up_after_loss') {
    for (const d of byDay.values()) for (let i = 1; i < d.length; i++) {
      const usual = lots?.get(String(d[i].t.symbol || '').toUpperCase());
      if (num(d[i - 1].t.pnl) < 0 && usual && num(d[i].t.lot) >= 1.5 * usual) breaks++;
    }
  }
  return { trades: w.length, breaks };
}
function usualLots(trades: T[]) {
  const m = new Map<string, number[]>();
  for (const t of trades || []) { const l = num(t.lot); if (l > 0) { const k = String(t.symbol || '').toUpperCase(); (m.get(k) || m.set(k, []).get(k)!).push(l); } }
  return new Map([...m.entries()].filter(([, v]) => v.length >= 5).map(([k, v]) => [k, median(v)]));
}

// the goal for next week, from last week's biggest leak (null: nothing worth a goal)
export function suggestGoal(trades: T[], tz: string, from: string, to: string): { kind: GoalKind; target: number; breaks: number } | null {
  const w = closedIn(trades, tz, from, to);
  if (w.length < 3) return null;
  const lots = usualLots(trades);
  const perDay = new Map<string, number>(); for (const x of w) perDay.set(x.day, (perDay.get(x.day) || 0) + 1);
  const usualDay = Math.max(2, Math.round(median([...perDay.values()])));
  const cands: { kind: GoalKind; target: number; breaks: number; weight: number }[] = [];
  const add = (kind: GoalKind, target: number, weight: number) => { const b = goalBreaks(kind, target, trades, tz, from, to, lots).breaks; if (b > 0) cands.push({ kind, target, breaks: b, weight: b * weight }); };
  add('stop_after_losses', 2, 3);
  add('no_size_up_after_loss', 1, 3);
  add('stop_every_trade', 1, 2);
  add('max_trades_per_day', usualDay + 1, 2);
  cands.sort((a, b) => b.weight - a.weight);
  return cands.length ? { kind: cands[0].kind, target: cands[0].target, breaks: cands[0].breaks } : null;
}

// last week's review (from / to: its Monday and Sunday), with the result of the goal that was set for it
export function weeklyReview(trades: T[], tz: string, from: string, goal?: Goal | null, discipline?: (from: string, to: string) => number | null) {
  const to = addDays(from, 6);
  const w = closedIn(trades, tz, from, to);
  if (!w.length) return null;
  const prev = closedIn(trades, tz, addDays(from, -7), addDays(from, -1));
  const net = w.reduce((s, x) => s + (num(x.t.pnl) || 0), 0), wins = w.filter((x) => num(x.t.pnl) > 0).length, losses = w.filter((x) => num(x.t.pnl) < 0).length;
  const days = new Map<string, number>(); for (const x of w) days.set(x.day, (days.get(x.day) || 0) + (num(x.t.pnl) || 0));
  const sorted = [...days.entries()].sort((a, b) => a[1] - b[1]);
  const g = goal && goal.week_start === from ? { ...goal, ...goalBreaks(goal.kind, goal.target, trades, tz, from, to, usualLots(trades)) } : null;
  return {
    week_start: from, week_end: to, trades: w.length, net: r2(net), win_rate: wins + losses ? Math.round(wins / (wins + losses) * 1000) / 10 : null,
    trading_days: days.size, best_day: sorted.length ? { day: sorted[sorted.length - 1][0], net: r2(sorted[sorted.length - 1][1]) } : null,
    worst_day: sorted.length ? { day: sorted[0][0], net: r2(sorted[0][1]) } : null,
    previous_week: prev.length ? { trades: prev.length, net: r2(prev.reduce((s, x) => s + (num(x.t.pnl) || 0), 0)) } : null,
    plan_score: discipline ? discipline(from, to) : null,
    goal: g ? { kind: g.kind, target: g.target, breaks: g.breaks, met: g.trades > 0 && g.breaks === 0, trades: g.trades } : null,
    next_goal: suggestGoal(trades, tz, from, to),
  };
}

// this week's goal so far
export function goalProgress(trades: T[], tz: string, goal: Goal | null | undefined, now: number) {
  if (!goal || !GOAL_KINDS.includes(goal.kind)) return null;
  const ws = weekStart(now, tz);
  if (goal.week_start !== ws) return null;
  return { ...goal, ...goalBreaks(goal.kind, goal.target, trades, tz, ws, addDays(ws, 6), usualLots(trades)) };
}

// a goal sent by the panel -> valid or null
export function cleanGoal(raw: any, now: number, tz: string): Goal | null {
  if (!raw || !GOAL_KINDS.includes(raw.kind)) return null;
  const t = num(raw.target);
  if (!(t > 0 && t < 1e9)) return null;
  return { kind: raw.kind, target: raw.kind === 'max_daily_loss' ? r2(t) : Math.round(t), week_start: weekStart(now, tz) };
}

// I/O: write last week's review once (notification 'coach.weekly'), never throws. -> the review written, or null
export async function runWeeklyReview(admin: any, userId: string, trades: T[], opts: { tz: string; now?: number; goal?: Goal | null; discipline?: (from: string, to: string) => number | null }) {
  try {
    const now = opts.now ?? Date.now();
    const last = addDays(weekStart(now, opts.tz), -7);
    const key = `weekly:${last}`;
    const { data: sent } = await admin.from('notifications').select('meta_data').eq('user_id', userId).eq('title_key', 'coach.weekly.title')
      .gte('created_at', new Date(now - 14 * 864e5).toISOString()).limit(10);
    if ((sent || []).some((n: any) => n?.meta_data?.alert_key === key)) return null;
    const r = weeklyReview(trades, opts.tz, last, opts.goal, opts.discipline);
    if (!r) return null;
    const goalLine = r.goal ? (r.goal.met ? 'met' : 'missed') : 'none';
    const { error } = await admin.from('notifications').insert({
      user_id: userId, type: 'info', is_read: false, title_key: 'coach.weekly.title', message_key: `coach.weekly.msg_${goalLine}`,
      meta_data: { alert_key: key, source: 'coach', kind: 'weekly', week: r.week_start, trades: r.trades, net: r.net, win_rate: r.win_rate ?? 0,
        goal_kind: r.goal?.kind || '', goal_breaks: r.goal?.breaks ?? 0 },
    });
    if (error) { console.error('weekly review insert failed:', String(error.code || '-')); return null; }
    return r;
  } catch (e) {
    console.error('weekly review failed:', String((e as Error)?.name || 'Error'));
    return null;
  }
}
