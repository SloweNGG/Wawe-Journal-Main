// supabase/functions/_shared/commitments.ts
// Daily commitments: the coach ends an answer with an order for today or tomorrow ("tomorrow: at most 3 trades") and
// writes it as a directive line [[commit:KIND:TARGET:WHEN]]. The panel turns that line into an "I promise" button; a
// promise the member takes is stored in coach_settings.plan.commitment = { kind, target, day, made_at } (day = local
// YYYY-MM-DD). Once that day is over (plus an hour of grace for late syncs) it is settled against the trades: the result
// goes to plan.commitment_log (last LOG_MAX), a notification tells the member, the opening screen and the coach show it.
// No migration: everything lives in the plan jsonb, like the weekly goal (weekly.ts). Pure except settleOnce (I/O).
import { GOAL_KINDS, goalBreaks, usualLots, addDays } from './weekly.ts';

export const COMMIT_KINDS = [...GOAL_KINDS, 'no_trading'] as const;
export type CommitKind = typeof COMMIT_KINDS[number];
export interface Commitment { kind: CommitKind; target: number; day: string; made_at?: string }
// untested: no trade that day, so a cap / stop promise was never put to the test (a weekend, a day off): logged, but not
// counted in the record, not reported and not shown as kept. "no_trading" is always tested (no trade is the point).
export interface CommitResult { kind: CommitKind; target: number; day: string; trades: number; breaks: number; kept: boolean; untested?: boolean }

export const LOG_MAX = 30;                 // settled promises kept in the plan
export const GRACE_MS = 3600e3;            // a day is settled one hour after its local midnight (late syncs)
export const RECORD_DAYS = 30;             // "kept n of m" window
const RECENT_DAYS = 3;                     // the last result is shown this long

// a whole directive line; the panel uses the same shape (ai-coach.js COMMIT_LINE)
export const COMMIT_LINE = /^[ \t]*\[\[commit:([a-z_]+):([0-9]+(?:\.[0-9]+)?):(today|tomorrow)\]\][ \t]*$/gm;

interface T { trade_date: string; exit_date?: string | null; pnl?: any; exit_price?: any; stop_loss?: any; lot?: any; symbol?: string; platform_source?: string | null }
const num = (v: unknown) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : NaN; };
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const FMT = new Map<string, Intl.DateTimeFormat>();
export function localDay(ms: number, tz: string) {
  let f = FMT.get(tz);
  if (!f) { try { f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }); } catch (_) { f = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }); } FMT.set(tz, f); }
  return f.format(new Date(ms));
}

// the target as stored: fixed for the yes/no kinds, range-checked for the others; null = invalid
export function cleanTarget(kind: string, raw: unknown): number | null {
  const t = num(raw);
  if (kind === 'no_trading') return 0;
  if (kind === 'stop_every_trade' || kind === 'no_size_up_after_loss') return 1;
  if (kind === 'max_trades_per_day') return Number.isInteger(t) && t >= 1 && t <= 50 ? t : null;
  if (kind === 'stop_after_losses') return Number.isInteger(t) && t >= 1 && t <= 10 ? t : null;
  if (kind === 'max_daily_loss') return t > 0 && t < 1e9 ? Math.round(t * 100) / 100 : null;
  return null;
}

// { kind, target, when: today|tomorrow } or { kind, target, day } -> a commitment for today or tomorrow (local), or null
export function cleanCommitment(raw: any, now: number, tz: string): Commitment | null {
  if (!raw || !(COMMIT_KINDS as readonly string[]).includes(raw.kind)) return null;
  const target = cleanTarget(raw.kind, raw.target);
  if (target == null) return null;
  const today = localDay(now, tz), tomorrow = addDays(today, 1);
  const day = raw.when === 'today' ? today : raw.when === 'tomorrow' ? tomorrow : String(raw.day || '');
  if (day !== today && day !== tomorrow) return null;
  return { kind: raw.kind, target, day, made_at: new Date(now).toISOString() };
}
function stored(c: any): Commitment | null {
  return c && (COMMIT_KINDS as readonly string[]).includes(c.kind) && DAY.test(String(c.day || '')) && cleanTarget(c.kind, c.target) != null
    ? { kind: c.kind, target: cleanTarget(c.kind, c.target)!, day: c.day, made_at: c.made_at } : null;
}

// trades of the commitment's day and how many times it was broken
export function commitmentBreaks(c: Commitment, trades: T[], tz: string) {
  if (c.kind === 'no_trading') {
    // any live trade opened that day breaks it, closed or still open
    const n = (trades || []).filter((t) => t && t.platform_source !== 'backtest' && Number.isFinite(Date.parse(t.trade_date)) && localDay(Date.parse(t.trade_date), tz) === c.day).length;
    return { trades: n, breaks: n };
  }
  const g = goalBreaks(c.kind, c.target, trades, tz, c.day, c.day, usualLots(trades));
  // one day: every trade over the cap is a break ("3 promised, 5 opened" = 2), not the one day the weekly goal counts
  if (c.kind === 'max_trades_per_day') return { trades: g.trades, breaks: Math.max(0, g.trades - c.target) };
  return g;
}

// the stored commitment's day is over: -> the plan to save (commitment moved to the log) and the result; else null
export function settleCommitment(plan: any, trades: T[], tz: string, now: number): { plan: any; result: CommitResult } | null {
  const raw = plan?.commitment;
  if (!raw) return null;
  const c = stored(raw);
  const next = { ...plan };
  delete next.commitment;
  if (!c) return { plan: next, result: null as any };                    // broken data: dropped, nothing to report
  if (localDay(now - GRACE_MS, tz) <= c.day) return null;               // not over yet
  if (c.day < addDays(localDay(now, tz), -RECORD_DAYS)) return { plan: next, result: null as any };   // too old to judge
  const b = commitmentBreaks(c, trades, tz);
  const result: CommitResult = { kind: c.kind, target: c.target, day: c.day, trades: b.trades, breaks: b.breaks, kept: b.breaks === 0 };
  if (b.trades === 0 && c.kind !== 'no_trading') result.untested = true;
  next.commitment_log = [...(Array.isArray(plan.commitment_log) ? plan.commitment_log : []), result].slice(-LOG_MAX);
  return { plan: next, result };
}

// what the panel and the coach see: the open promise and how it goes, the latest result, the record of the last 30 days
export function commitmentState(plan: any, trades: T[], tz: string, now: number) {
  const today = localDay(now, tz);
  const c = stored(plan?.commitment);
  let current: (Commitment & { trades: number; breaks: number; status: string }) | null = null;
  if (c) {
    const b = commitmentBreaks(c, trades, tz);
    current = { ...c, trades: b.trades, breaks: b.breaks, status: c.day > today ? 'upcoming' : b.breaks ? 'broken' : 'clean' };
  }
  const log: CommitResult[] = (Array.isArray(plan?.commitment_log) ? plan.commitment_log : []).filter((r: any) => r && DAY.test(String(r.day || '')) && !r.untested);
  const last = log.length && log[log.length - 1].day >= addDays(today, -RECENT_DAYS) ? log[log.length - 1] : null;
  const window = log.filter((r) => r.day >= addDays(today, -RECORD_DAYS));
  const record = window.length ? { kept: window.filter((r) => r.kept).length, total: window.length } : null;
  return current || last || record ? { current, last, record } : null;
}

// the coach's [[commit:...]] lines -> { text, visuals }: the last valid one stays as a line (the panel draws its card from
// visuals[id], with the absolute day, so an old chat still shows the right day); invalid, surplus and inline ones go.
export function resolveCommitments(text: string, now: number, tz: string) {
  const found: { id: string; c: Commitment }[] = [];
  const KEEP = '\u0001';
  let out = text.replace(COMMIT_LINE, (_l, kind: string, target: string, when: string) => {
    const c = cleanCommitment({ kind, target, when }, now, tz);
    if (!c) return '';
    const id = `commit:${kind}:${target}:${when}`;
    found.push({ id, c });
    return `${KEEP}${found.length - 1}${KEEP}`;
  }).replace(/\[\[commit:[^\]\n]*\]\]/g, '');
  const keep = found.length - 1;
  out = out.replace(new RegExp(`${KEEP}(\\d+)${KEEP}`, 'g'), (_m, i: string) => (Number(i) === keep ? `[[${found[keep].id}]]` : ''))
    .replace(/\n{3,}/g, '\n\n').trim();
  const visuals: Record<string, unknown> = {};
  if (keep >= 0) { const { made_at: _m, ...c } = found[keep].c; visuals[found[keep].id] = { kind: 'commit', commit: c }; }
  return { text: out, visuals };
}

// I/O: settle the member's commitment once its day is over; never throws. The plan is written only if nobody changed the
// row meanwhile (updated_at), so two requests at the same moment notify once. -> the result, or null
export async function settleOnce(admin: any, userId: string, row: { plan: any; updated_at?: string } | null, trades: T[], tz: string, now = Date.now()) {
  try {
    if (!row || !row.plan) return null;
    const s = settleCommitment(row.plan, trades, tz, now);
    if (!s) return null;
    let q = admin.from('coach_settings').update({ plan: s.plan }).eq('user_id', userId);
    if (row.updated_at) q = q.eq('updated_at', row.updated_at);
    const { data, error } = await q.select('user_id');
    if (error || !data || !data.length) return null;
    row.plan = s.plan;
    if (!s.result) return null;
    const r = s.result;
    if (r.untested) return r;                                         // nothing happened that day: no notification
    const { error: ne } = await admin.from('notifications').insert({
      user_id: userId, type: r.kept ? 'success' : 'warning', is_read: false, title_key: 'coach.commit.title',
      message_key: r.kept ? 'coach.commit.msg_kept' : 'coach.commit.msg_missed',
      meta_data: { alert_key: `commit:${r.day}`, source: 'coach', kind: 'commit', commit_kind: r.kind, target: r.target, day: r.day, trades: r.trades, breaks: r.breaks },
    });
    if (ne) console.error('commitment notification failed:', String(ne.code || '-'));
    return r;
  } catch (e) {
    console.error('commitment settle failed:', String((e as Error)?.name || 'Error'));
    return null;
  }
}
