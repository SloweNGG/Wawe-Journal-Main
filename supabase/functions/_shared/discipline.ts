// supabase/functions/_shared/discipline.ts
// The member's trading plan (coach_settings.plan) and how well the trades follow it: every closed live trade is checked
// against the rules, and the discipline score is the share of trades that broke none. Used by the AI coach (summary,
// opening screen) and the live alerts. Pure (Node tests).
//
// Plan (all optional; an empty plan has no rules):
//   max_trades_per_day   1..50     the (n+1)th and later trades of a day break it
//   max_daily_loss       > 0       trades opened after the day's closed result reached -max_daily_loss break it
//   max_loss_per_trade   > 0       a trade that lost more than this (10 % tolerance for slippage) breaks it
//   require_stop         boolean   a trade without a stop loss breaks it
//   no_trading_after     0..23     a trade opened at or after this local hour breaks it

export interface Plan { max_trades_per_day?: number; max_daily_loss?: number; max_loss_per_trade?: number; require_stop?: boolean; no_trading_after?: number }
export const PLAN_RULES = ['max_trades_per_day', 'max_daily_loss', 'max_loss_per_trade', 'require_stop', 'no_trading_after'] as const;

const num = (v: unknown) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : NaN; };

// a plan as sent by the panel -> only valid rules (never throws); null when nothing is set
export function cleanPlan(raw: any): Plan | null {
  if (!raw || typeof raw !== 'object') return null;
  const p: Plan = {};
  const n = num(raw.max_trades_per_day); if (Number.isInteger(n) && n >= 1 && n <= 50) p.max_trades_per_day = n;
  const d = num(raw.max_daily_loss); if (d > 0 && d < 1e9) p.max_daily_loss = Math.round(d * 100) / 100;
  const l = num(raw.max_loss_per_trade); if (l > 0 && l < 1e9) p.max_loss_per_trade = Math.round(l * 100) / 100;
  if (raw.require_stop === true) p.require_stop = true;
  const h = num(raw.no_trading_after); if (Number.isInteger(h) && h >= 0 && h <= 23) p.no_trading_after = h;
  return Object.keys(p).length ? p : null;
}

const FMT = new Map<string, Intl.DateTimeFormat>();
function local(ms: number, tz: string) {
  let f = FMT.get(tz);
  if (!f) {
    try { f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }); }
    catch (_) { f = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }); }
    FMT.set(tz, f);
  }
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}

export interface TradeLike { id?: string; trade_date: string; exit_date?: string | null; pnl?: number | string | null; exit_price?: number | string | null; stop_loss?: number | string | null; platform_source?: string | null }

// -> the rules each trade broke, in entry order: [{ trade, day, broken: string[] }]
export function checkTrades(plan: Plan, trades: TradeLike[], tz: string) {
  const list = (trades || []).filter((t) => t && t.platform_source !== 'backtest' && Number.isFinite(num(t.exit_price)) && Number.isFinite(Date.parse(t.trade_date)))
    .map((t) => ({ t, open: Date.parse(t.trade_date), close: Date.parse(t.exit_date || t.trade_date) }))
    .sort((a, b) => a.open - b.open);
  const out: { trade: TradeLike; day: string; broken: string[] }[] = [];
  const count = new Map<string, number>();
  for (const x of list) {
    const { day, hour } = local(x.open, tz);
    const broken: string[] = [];
    const n = (count.get(day) || 0) + 1; count.set(day, n);
    if (plan.max_trades_per_day && n > plan.max_trades_per_day) broken.push('max_trades_per_day');
    if (plan.max_daily_loss) {
      // the day's result of the trades already CLOSED when this one opened
      const before = list.filter((y) => y !== x && y.close <= x.open && local(y.open, tz).day === day).reduce((s, y) => s + (num(y.t.pnl) || 0), 0);
      if (before <= -plan.max_daily_loss) broken.push('max_daily_loss');
    }
    if (plan.max_loss_per_trade && num(x.t.pnl) < -plan.max_loss_per_trade * 1.1) broken.push('max_loss_per_trade');
    if (plan.require_stop && !Number.isFinite(num(x.t.stop_loss))) broken.push('require_stop');
    if (plan.no_trading_after != null && hour >= plan.no_trading_after) broken.push('no_trading_after');
    out.push({ trade: x.t, day, broken });
  }
  return out;
}

const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

// the discipline report for the coach: score (share of trades with no broken rule) over the last 7 and 30 days, which
// rules break most and what breaking them cost
export function disciplineReport(plan: Plan | null, trades: TradeLike[], tz: string, now = Date.now()) {
  if (!plan) return null;
  const checked = checkTrades(plan, trades, tz);
  const since = (days: number) => local(now - days * 864e5, tz).day;
  const window = (days: number) => {
    const from = since(days), rows = checked.filter((c) => c.day > from);
    if (!rows.length) return null;
    const ok = rows.filter((c) => !c.broken.length);
    const by: Record<string, { trades: number; net: number }> = {};
    for (const c of rows) for (const r of c.broken) { by[r] = by[r] || { trades: 0, net: 0 }; by[r].trades++; by[r].net += num(c.trade.pnl) || 0; }
    for (const k of Object.keys(by)) by[k].net = Math.round(by[k].net * 100) / 100;
    const netOk = ok.reduce((s, c) => s + (num(c.trade.pnl) || 0), 0), netBroken = rows.filter((c) => c.broken.length).reduce((s, c) => s + (num(c.trade.pnl) || 0), 0);
    const byDay = new Map<string, { trades: number; ok: number }>();
    for (const c of rows) { const d = byDay.get(c.day) || { trades: 0, ok: 0 }; d.trades++; if (!c.broken.length) d.ok++; byDay.set(c.day, d); }
    return {
      trades: rows.length, followed: ok.length, score: pctOf(ok.length, rows.length),
      net_following_plan: Math.round(netOk * 100) / 100, net_breaking_plan: Math.round(netBroken * 100) / 100,
      broken_by_rule: by,
      days_fully_followed: [...byDay.values()].filter((d) => d.ok === d.trades).length, trading_days: byDay.size,
    };
  };
  const top = (w: any) => w ? Object.entries(w.broken_by_rule as Record<string, { trades: number }>).sort((a, b) => b[1].trades - a[1].trades)[0]?.[0] || null : null;
  const w7 = window(7), w30 = window(30);
  return { rules: plan, last_7_days: w7, last_30_days: w30, most_broken_rule_7d: top(w7), most_broken_rule_30d: top(w30) };
}
