// supabase/functions/_shared/coach-alerts.ts
// Live coach alerts: right after new trades reach a journal (cTrader / MT5 sync, or a manual entry through ai-coach
// action "alerts") the coach checks the trading DAY for behaviour that usually ends badly and warns the member through
// public.notifications (bell, realtime toast, optional desktop notification). Rule based, no model call, no quota.
// Only today's trades (member's time zone) count, and only when the newest one closed in the last hours: a history
// backfill raises nothing. Each kind fires at most once per journal and day (prop_failed once per account).
// detectAlerts is pure (Node tests); runCoachAlerts does the I/O.
import { rMultiple } from './trade-summary.ts';

export interface AlertTrade {
  id?: string; journal_id?: string | null; symbol: string; direction: string; lot?: number | string | null;
  stop_loss?: number | string | null; entry_price?: number | string | null; exit_price?: number | string | null;
  pnl?: number | string | null; trade_date: string; exit_date?: string | null; platform_source?: string | null;
}
export interface Alert { kind: string; key: string; level: 'warning' | 'error'; severity: number; params: Record<string, string | number> }

const RECENT_MS = 6 * 3600e3;            // the newest trade must have closed within this window
const MAX_ALERTS = 2;                    // per run, strongest first
const num = (v: unknown) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : NaN; };
const r2 = (v: number) => Math.round(v * 100) / 100;
const FMT = new Map<string, Intl.DateTimeFormat | null>();
function localDay(ms: number, tz: string) {
  if (!FMT.has(tz)) { try { FMT.set(tz, new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })); } catch (_) { FMT.set(tz, null); } }
  const f = FMT.get(tz);
  return f ? f.format(new Date(ms)) : new Date(ms).toISOString().slice(0, 10);
}
function median(a: number[]) { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
const closeMs = (t: AlertTrade) => Date.parse(t.exit_date || t.trade_date);

// trades: the journal's recent trades (any order; open, backtest and broken rows are ignored); prop: the journal's prop
// context (prop-context.ts) or null; plan: the member's trading plan rules (coach_settings.plan) or {}
export function detectAlerts(input: { trades: AlertTrade[]; prop?: any; plan?: any; tz: string; now: number; journalId: string; journalName?: string | null }): Alert[] {
  const { tz, now, journalId } = input;
  const journal = input.journalName || '';
  const closed = (input.trades || []).filter((t) => t && t.platform_source !== 'backtest' && Number.isFinite(num(t.exit_price)) && Number.isFinite(num(t.pnl)) && Number.isFinite(closeMs(t)))
    .sort((a, b) => closeMs(a) - closeMs(b));
  if (!closed.length) return [];
  const newest = closed[closed.length - 1];
  if (now - closeMs(newest) > RECENT_MS || closeMs(newest) > now + 600e3) return [];
  const today = localDay(now, tz);
  const dayOf = new Map(closed.map((t) => [t, localDay(closeMs(t), tz)]));
  const todays = closed.filter((t) => dayOf.get(t) === today);
  if (!todays.length || todays[todays.length - 1] !== newest) return [];
  const history = closed.filter((t) => dayOf.get(t) !== today);
  const out: Alert[] = [];
  const key = (kind: string) => `${kind}:${journalId}:${today}`;
  const add = (kind: string, level: 'warning' | 'error', severity: number, params: Record<string, string | number>, k?: string) =>
    out.push({ kind, key: k || key(kind), level, severity, params: { journal, ...params } });

  // 1) losses in a row today, ending with the newest trade
  let streak = 0, streakLoss = 0;
  for (let i = todays.length - 1; i >= 0 && num(todays[i].pnl) < 0; i--) { streak++; streakLoss += num(todays[i].pnl); }
  if (streak >= 3) add('loss_streak', 'warning', 70 + Math.min(20, streak * 3), { n: streak, loss: r2(-streakLoss) });

  // 2) a bigger lot right after a loss (same day)
  const lots = new Map<string, number[]>();
  for (const t of closed.slice(0, -1)) { const l = num(t.lot); if (l > 0) { const k = String(t.symbol).toUpperCase(); (lots.get(k) || lots.set(k, []).get(k)!).push(l); } }
  const usual = median(lots.get(String(newest.symbol).toUpperCase()) || []);
  const prev = todays.length >= 2 ? todays[todays.length - 2] : null;
  const ratio = num(newest.lot) / usual;
  if (prev && num(prev.pnl) < 0 && (lots.get(String(newest.symbol).toUpperCase()) || []).length >= 5 && ratio >= 1.5) {
    add('size_up_after_loss', 'error', 90, { ratio: r2(ratio), lot: r2(num(newest.lot)), usual: r2(usual) });
  }

  // 3) far more trades than usual today (or above the plan's cap)
  const perDay = new Map<string, number>(), dayNets = new Map<string, number>();
  for (const t of history) { const d = dayOf.get(t)!; perDay.set(d, (perDay.get(d) || 0) + 1); dayNets.set(d, (dayNets.get(d) || 0) + num(t.pnl)); }
  const usualCount = median([...perDay.values()]);
  const cap = num(input.plan?.max_trades_per_day);
  if (cap > 0 && todays.length > cap) add('plan_trades', 'warning', 80, { n: todays.length, cap });
  else if (perDay.size >= 5 && todays.length >= Math.max(5, Math.ceil(2 * usualCount))) add('overtrading', 'warning', 65, { n: todays.length, usual: Math.round(usualCount) });

  // 4) today's loss: the plan's daily loss cap, or far beyond a usual losing day
  const dayNet = todays.reduce((s, t) => s + num(t.pnl), 0);
  const planLoss = num(input.plan?.max_daily_loss);
  const losingDays = [...dayNets.values()].filter((v) => v < 0);
  if (planLoss > 0 && dayNet <= -planLoss) add('plan_daily_loss', 'error', 88, { loss: r2(-dayNet), cap: r2(planLoss) });
  else if (losingDays.length >= 5 && dayNet < 0 && -dayNet >= 2.5 * median(losingDays.map((v) => -v))) add('big_day_loss', 'warning', 72, { loss: r2(-dayNet), usual: r2(median(losingDays.map((v) => -v))) });

  // 5) a large loss without a stop
  const losses = history.concat(todays.slice(0, -1)).map((t) => num(t.pnl)).filter((p) => p < 0);
  const avgLoss = losses.length ? -losses.reduce((s, x) => s + x, 0) / losses.length : NaN;
  if (num(newest.pnl) < 0 && !Number.isFinite(num(newest.stop_loss)) && losses.length >= 8 && -num(newest.pnl) >= 2 * avgLoss) {
    add('big_loss_no_stop', 'warning', 75, { loss: r2(-num(newest.pnl)), usual: r2(avgLoss) });
  }
  // a loss far beyond the planned stop (stop moved away, or not at the broker)
  const r = rMultiple(newest as any);
  if (r != null && r <= -1.5) add('stop_overrun', 'warning', 74, { r: r2(r) });

  // 6) prop challenge: the rules that end the account
  const p = input.prop;
  if (p && p.status === 'failed') add('prop_failed', 'error', 110, {}, `prop_failed:${p.account_id || journalId}`);
  else if (p && p.status === 'in_progress') {
    if (p.avg_losses_until_daily_limit != null && p.avg_losses_until_daily_limit <= 1 && p.daily_loss?.today_result < 0) {
      add('prop_daily_room', 'error', 105, { room: r2(Number(p.daily_loss.room_left_today) || 0), losses: p.avg_losses_until_daily_limit });
    } else if (p.avg_losses_until_max_loss != null && p.avg_losses_until_max_loss <= 2) {
      add('prop_max_room', 'error', 100, { room: r2(Number(p.max_loss?.room_left) || 0), losses: p.avg_losses_until_max_loss });
    }
  }
  return out.sort((a, b) => b.severity - a.severity);
}

// I/O: load, detect, drop what was already sent, write notifications. Never throws (a sync must not fail because of it).
// -> the alerts written
export async function runCoachAlerts(admin: any, userId: string, journalId: string, opts: { tz?: string; now?: number; propContextFor?: (journalId: string) => Promise<any> } = {}): Promise<Alert[]> {
  try {
    const { data: prefs } = await admin.from('coach_settings').select('alerts_enabled, plan, time_zone').eq('user_id', userId).maybeSingle();
    if (prefs && prefs.alerts_enabled === false) return [];
    const now = opts.now ?? Date.now();
    const tz = opts.tz || prefs?.time_zone || 'UTC';
    const since = new Date(now - 45 * 864e5).toISOString();
    const { data: trades, error } = await admin.from('trades')
      .select('id, journal_id, symbol, direction, lot, stop_loss, entry_price, exit_price, pnl, trade_date, exit_date, platform_source')
      .eq('user_id', userId).eq('journal_id', journalId).gte('trade_date', since).order('trade_date', { ascending: false }).limit(1000);
    if (error || !trades || !trades.length) return [];
    const { data: j } = await admin.from('journals').select('name').eq('id', journalId).eq('user_id', userId).maybeSingle();
    const prop = opts.propContextFor ? await opts.propContextFor(journalId).catch(() => null) : null;
    const found = detectAlerts({ trades, prop, plan: prefs?.plan || {}, tz, now, journalId, journalName: j?.name || null });
    if (!found.length) return [];
    // already sent (the last 3 days of coach alerts)
    const { data: sent } = await admin.from('notifications').select('meta_data')
      .eq('user_id', userId).like('title_key', 'coach.alert.%').gte('created_at', new Date(now - 3 * 864e5).toISOString()).limit(200);
    const seen = new Set((sent || []).map((n: any) => n?.meta_data?.alert_key).filter(Boolean));
    if (found.some((a) => a.kind === 'prop_failed')) {
      const { data: old } = await admin.from('notifications').select('meta_data').eq('user_id', userId).eq('title_key', 'coach.alert.prop_failed.title').limit(50);
      for (const n of old || []) if (n?.meta_data?.alert_key) seen.add(n.meta_data.alert_key);
    }
    const fresh = found.filter((a) => !seen.has(a.key)).slice(0, MAX_ALERTS);
    if (!fresh.length) return [];
    const { error: ie } = await admin.from('notifications').insert(fresh.map((a) => ({
      user_id: userId, type: a.level, is_read: false,
      title_key: `coach.alert.${a.kind}.title`, message_key: `coach.alert.${a.kind}.msg`,
      meta_data: { ...a.params, alert_key: a.key, kind: a.kind, journal_id: journalId, source: 'coach' },
    })));
    if (ie) { console.error('coach alerts insert failed:', String(ie.code || '-')); return []; }
    return fresh;
  } catch (e) {
    console.error('coach alerts failed:', String((e as Error)?.name || 'Error'));
    return [];
  }
}
