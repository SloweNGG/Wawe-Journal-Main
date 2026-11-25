// supabase/functions/_shared/visuals.ts
// Turns the visual directives the AI coach writes ([[viz:...]], see coach-knowledge.ts) into chart data taken from the app's
// own trade summary and series (trade-summary.ts), never from the model. Unknown or surplus directives are removed from the
// text. Pure (Node tests).
import { VISUAL_DATASETS, VISUAL_METRICS, SHARE_DATASETS } from './coach-knowledge.ts';
import type { ChartSeries } from './trade-summary.ts';

export const MAX_VISUALS = 3;
// what a chat panel older than the ring / grid / calendar charts can draw (it sends no `viz: 2`): it would break on the others
export const LEGACY_KINDS = ['kpis', 'equity', 'bar'];
export const DIRECTIVE_LINE = /^[ \t]*\[\[viz:([a-z0-9_:]+)\]\][ \t]*$/gm;   // digits: by_month_last_12

// buckets in their natural order (time-like) keep it; the others are sorted by value, best first
const ORDERED = new Set(['by_weekday', 'by_entry_hour_local', 'by_month_last_12', 'by_trade_number_of_day', 'after_consecutive_losses', 'r_buckets']);
const UNIT: Record<string, string> = { net: 'money', avg_win: 'money', avg_loss: 'money', win_rate: 'pct', trades: 'count', profit_factor: 'ratio' };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SESSIONS = ['asia', 'london', 'london_ny_overlap', 'new_york', 'late'];
const CALENDAR_WEEKS = 6;
const SHARE_SLICES = 5;                                             // the biggest buckets; the rest is one "other" slice

type Point = { t: string; v: number };
export type Visual =
  | { kind: 'kpis'; items: { id: string; value: number | null; unit: string; sub?: string }[] }
  | { kind: 'equity'; points: Point[] }
  | { kind: 'bar'; dataset: string; metric: string; unit: string; items: { label: string; value: number; trades: number }[] }
  | { kind: 'winloss'; trades: number; wins: number; losses: number; breakeven: number; win_rate: number | null;
      avg_win: number | null; avg_loss: number | null; breakeven_win_rate: number | null; profit_factor: number | null }
  | { kind: 'share'; dataset: string; total: number; items: { label: string; trades: number; net: number; win_rate: number | null }[] }
  | { kind: 'heatmap'; rows: string[]; cols: string[]; cells: { r: number; c: number; net: number; trades: number; win_rate: number | null }[] }
  | { kind: 'calendar'; start: string; days_n: number; today: string; days: { d: string; net: number; trades: number }[] }
  | { kind: 'drawdown'; points: Point[]; max: Point }
  | { kind: 'streak'; items: { t: string; s: string; v: number; r: number | null }[] };

function rows(summary: any, dataset: string): any[] {
  const v = summary?.[dataset];
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.entries(v).map(([key, s]: [string, any]) => ({ key, ...s }));
  return [];
}
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
// YYYY-MM-DD <-> UTC day number (calendar arithmetic only; the days themselves are already local)
const dayNo = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;
const dayStr = (n: number) => new Date(n * 864e5).toISOString().slice(0, 10);

export function buildVisual(id: string, summary: any, equity: Point[], series?: ChartSeries | null): Visual | null {
  const p = id.split(':');
  const t = summary?.totals;
  if (p[0] === 'kpis' && p.length === 1) {
    const r = summary?.risk;
    if (!t || !t.trades) return null;
    return { kind: 'kpis', items: [
      { id: 'win_rate', value: t.win_rate, unit: 'pct', sub: `${t.wins}/${t.wins + t.losses}` },
      { id: 'net', value: t.net, unit: 'money', sub: String(t.trades) },
      { id: 'profit_factor', value: t.profit_factor === 'inf' ? null : t.profit_factor, unit: 'ratio' },
      { id: 'max_drawdown', value: r ? r.max_drawdown : null, unit: 'money' },
    ] };
  }
  if (p[0] === 'equity' && p.length === 1) return equity.length >= 2 ? { kind: 'equity', points: equity } : null;
  if (p[0] === 'bar' && p.length === 3) {
    const [, dataset, metric] = p;
    if (!(VISUAL_DATASETS as readonly string[]).includes(dataset) || !(VISUAL_METRICS as readonly string[]).includes(metric)) return null;
    let items = rows(summary, dataset)
      .map((x) => ({ label: String(x.key), value: Number(x[metric]), trades: Number(x.trades) || 0 }))
      .filter((x) => Number.isFinite(x.value) && x.trades > 0);
    if (!ORDERED.has(dataset)) items.sort((a, b) => b.value - a.value);
    items = items.slice(0, ORDERED.has(dataset) ? 24 : 12);          // every hour of the day fits as columns
    return items.length ? { kind: 'bar', dataset, metric, unit: UNIT[metric], items } : null;
  }
  // wins / losses / break-even ring with the payoff: is the win rate enough for the size of the wins and losses
  if (p[0] === 'winloss' && p.length === 1) {
    if (!t || !t.trades || !(t.wins + t.losses)) return null;
    const aw = Number.isFinite(t.avg_win) ? t.avg_win : null, al = Number.isFinite(t.avg_loss) ? t.avg_loss : null;
    return { kind: 'winloss', trades: t.trades, wins: t.wins, losses: t.losses, breakeven: Math.max(0, t.trades - t.wins - t.losses),
      win_rate: t.win_rate, avg_win: aw, avg_loss: al,
      breakeven_win_rate: aw != null && al != null && aw - al > 0 ? pct(-al, aw - al) : null,
      profit_factor: typeof t.profit_factor === 'number' ? t.profit_factor : null };
  }
  // where the trades go: share of the trade count per bucket, each slice with its net
  if (p[0] === 'share' && p.length === 2) {
    const dataset = p[1];
    if (!(SHARE_DATASETS as readonly string[]).includes(dataset) || !t || !t.trades) return null;
    const all = rows(summary, dataset).map((x) => ({ label: String(x.key), trades: Number(x.trades) || 0, net: Number(x.net) || 0, win_rate: x.win_rate ?? null }))
      .filter((x) => x.trades > 0);
    if (all.length < 2) return null;
    if (!ORDERED.has(dataset)) all.sort((a, b) => b.trades - a.trades);
    // the summary lists only the biggest buckets of a dataset (by_symbol: 12): whatever is not drawn becomes "other"
    let items = ORDERED.has(dataset) || all.length <= SHARE_SLICES + 1 ? all : all.slice(0, SHARE_SLICES);
    const shown = items.reduce((s, x) => s + x.trades, 0);
    const rest = t.trades - shown;
    if (rest > 0) {
      const restNet = (Number(t.net) || 0) - items.reduce((s, x) => s + x.net, 0);
      items = [...items, { label: '(other)', trades: rest, net: Math.round(restNet * 100) / 100, win_rate: null }];
    }
    return { kind: 'share', dataset, total: t.trades, items };
  }
  // weekday × session grid of net results
  if (p[0] === 'heatmap' && p.length === 1) {
    const g = series?.grid || [];
    if (g.reduce((s, c) => s + c.n, 0) < 8 || g.length < 2) return null;
    const rowsWd = WEEKDAYS.filter((d) => g.some((c) => c.wd === d)), cols = SESSIONS.filter((s) => g.some((c) => c.s === s));
    if (rowsWd.length < 1 || cols.length < 1) return null;
    const cells = g.filter((c) => rowsWd.includes(c.wd) && cols.includes(c.s))
      .map((c) => ({ r: rowsWd.indexOf(c.wd), c: cols.indexOf(c.s), net: c.v, trades: c.n, win_rate: pct(c.w, c.w + c.l) }))
      .sort((a, b) => a.r - b.r || a.c - b.c);
    return { kind: 'heatmap', rows: rowsWd, cols, cells };
  }
  // daily results of the last weeks (Monday first), ending this week, or the week of the last trade when nothing is recent
  if (p[0] === 'calendar' && p.length === 1) {
    const daily = series?.daily || [];
    if (!daily.length || !series?.today) return null;
    const days_n = CALENDAR_WEEKS * 7, today = dayNo(series.today), lastDay = dayNo(daily[daily.length - 1].d);
    const end = today - lastDay < days_n - 7 ? today : lastDay;
    const monday = end - ((new Date(end * 864e5).getUTCDay() + 6) % 7);
    const start = monday - (CALENDAR_WEEKS - 1) * 7;
    const days = daily.filter((x) => { const n = dayNo(x.d); return n >= start && n < start + days_n; }).map((x) => ({ d: x.d, net: x.v, trades: x.n }));
    return days.length ? { kind: 'calendar', start: dayStr(start), days_n, today: series.today, days } : null;
  }
  // how far below the previous peak the account was after each trade
  if (p[0] === 'drawdown' && p.length === 1) {
    const pts = series?.drawdown || [];
    if (pts.length < 2) return null;
    const max = pts.reduce((a, b) => (b.v < a.v ? b : a));
    return max.v < 0 ? { kind: 'drawdown', points: pts, max } : null;
  }
  // the last closed trades in order (form, streaks, tilt)
  if (p[0] === 'streak' && p.length === 1) {
    const items = series?.last || [];
    return items.length >= 5 ? { kind: 'streak', items } : null;
  }
  return null;
}

// { text, visuals }: directives that resolve stay in the text (the panel replaces each line with its chart); the others go.
// kinds: the chart kinds the panel can draw (LEGACY_KINDS for an old panel); every kind when left out.
export function resolveVisuals(text: string, summary: any, equity: Point[], series?: ChartSeries | null, kinds?: string[]) {
  const visuals: Record<string, Visual> = {};
  let count = 0;
  const KEEP = '\u0000';                                            // kept lines are protected from the inline cleanup below
  const out = text.replace(DIRECTIVE_LINE, (_line, id: string) => {
    if (!visuals[id]) {                                             // the same chart twice: both lines stay, one data entry
      if (count >= MAX_VISUALS) return '';
      const v = kinds && !kinds.includes(id.split(':')[0]) ? null : buildVisual(id, summary, equity, series);
      if (!v) return '';
      visuals[id] = v; count++;
    }
    return `${KEEP}${id}${KEEP}`;
  }).replace(/\[\[viz:[^\]\n]*\]\]/g, '')                           // a directive inside a sentence is not drawn
    .replace(new RegExp(`${KEEP}([a-z0-9_:]+)${KEEP}`, 'g'), '[[viz:$1]]')
    .replace(/\n{3,}/g, '\n\n').trim();
  return { text: out, visuals };
}
