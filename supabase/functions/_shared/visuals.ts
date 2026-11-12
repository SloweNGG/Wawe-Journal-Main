// supabase/functions/_shared/visuals.ts
// Turns the visual directives the AI coach writes ([[viz:...]], see coach-knowledge.ts) into chart data taken from the app's
// own trade summary, never from the model. Unknown or surplus directives are removed from the text. Pure (Node tests).
import { VISUAL_DATASETS, VISUAL_METRICS } from './coach-knowledge.ts';

export const MAX_VISUALS = 3;
export const DIRECTIVE_LINE = /^[ \t]*\[\[viz:([a-z_:]+)\]\][ \t]*$/gm;

// buckets in their natural order (time-like) keep it; the others are sorted by value, best first
const ORDERED = new Set(['by_weekday', 'by_entry_hour_local', 'by_month_last_12', 'by_trade_number_of_day', 'after_consecutive_losses']);
const UNIT: Record<string, string> = { net: 'money', avg_win: 'money', avg_loss: 'money', win_rate: 'pct', trades: 'count', profit_factor: 'ratio' };

export type Visual =
  | { kind: 'kpis'; items: { id: string; value: number | null; unit: string; sub?: string }[] }
  | { kind: 'equity'; points: { t: string; v: number }[] }
  | { kind: 'bar'; dataset: string; metric: string; unit: string; items: { label: string; value: number; trades: number }[] };

function rows(summary: any, dataset: string): any[] {
  const v = summary?.[dataset];
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.entries(v).map(([key, s]: [string, any]) => ({ key, ...s }));
  return [];
}

export function buildVisual(id: string, summary: any, equity: { t: string; v: number }[]): Visual | null {
  const p = id.split(':');
  if (p[0] === 'kpis' && p.length === 1) {
    const t = summary?.totals, r = summary?.risk;
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
    items = items.slice(0, 12);
    return items.length ? { kind: 'bar', dataset, metric, unit: UNIT[metric], items } : null;
  }
  return null;
}

// { text, visuals }: directives that resolve stay in the text (the panel replaces each line with its chart); the others go.
export function resolveVisuals(text: string, summary: any, equity: { t: string; v: number }[]) {
  const visuals: Record<string, Visual> = {};
  let count = 0;
  const KEEP = '\u0000';                                            // kept lines are protected from the inline cleanup below
  const out = text.replace(DIRECTIVE_LINE, (_line, id: string) => {
    if (!visuals[id]) {                                             // the same chart twice: both lines stay, one data entry
      if (count >= MAX_VISUALS) return '';
      const v = buildVisual(id, summary, equity);
      if (!v) return '';
      visuals[id] = v; count++;
    }
    return `${KEEP}${id}${KEEP}`;
  }).replace(/\[\[viz:[^\]\n]*\]\]/g, '')                           // a directive inside a sentence is not drawn
    .replace(new RegExp(`${KEEP}([a-z_:]+)${KEEP}`, 'g'), '[[viz:$1]]')
    .replace(/\n{3,}/g, '\n\n').trim();
  return { text: out, visuals };
}
