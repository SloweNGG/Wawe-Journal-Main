// supabase/functions/_shared/actions.ts
// Things the coach may set up for the member, always through a card the member confirms ("Apply"); the coach never
// changes anything on its own. The coach writes a line [[action:{json}]]; resolveActions validates it and puts the
// clean action in the answer's visuals under "action:aN" (the line becomes [[action:aN]], the panel draws the card).
// On "Apply" the panel sends the action back (ai-coach action "apply") and applyAction validates it AGAIN (the browser
// is not trusted) and writes it:
//   add_strategy        { name, description?, color? }  -> public.strategies row in the member's journal (same name: kept)
//   set_plan            { rules: { rule: value | null } } -> coach_settings.plan rules (null removes a rule; other keys kept)
//   set_goal            { kind, target }                 -> this week's goal, coach_settings.plan.goal (weekly.ts)
//   set_monthly_target  { amount }                       -> the dashboard's monthly profit target: it lives in the browser
//                                                           (localStorage per journal), so the panel writes it itself
// Pure except applyAction (I/O).
import { PLAN_RULES, cleanPlan } from './discipline.ts';
import { GOAL_KINDS, cleanGoal } from './weekly.ts';

export const ACTION_TYPES = ['add_strategy', 'set_plan', 'set_goal', 'set_monthly_target'] as const;
export type ActionType = typeof ACTION_TYPES[number];
export const MAX_ACTIONS = 3;                                      // cards per answer
export const STRATEGY_COLORS = ['#8b5cf6', '#a78bfa', '#ec4899', '#ef4444', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6'];
export const MAX_NAME = 60, MAX_DESC = 500;
// a whole directive line; the JSON is one object on one line
export const ACTION_LINE = /^[ \t]*\[\[action:(\{.*\})\]\][ \t]*$/gm;

const num = (v: unknown) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : NaN; };
const clip = (s: unknown, n: number) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

// raw action (from the model or the browser) -> a clean action, or null
export function cleanAction(raw: any): any | null {
  if (!raw || typeof raw !== 'object' || !(ACTION_TYPES as readonly string[]).includes(raw.type)) return null;
  if (raw.type === 'add_strategy') {
    const name = clip(raw.name, MAX_NAME);
    if (!name) return null;
    const description = clip(raw.description, MAX_DESC) || null;
    const color = STRATEGY_COLORS.includes(String(raw.color || '').toLowerCase()) ? String(raw.color).toLowerCase() : STRATEGY_COLORS[0];
    return { type: 'add_strategy', name, description, color };
  }
  if (raw.type === 'set_plan') {
    const r = raw.rules && typeof raw.rules === 'object' ? raw.rules : null;
    if (!r) return null;
    const set: Record<string, unknown> = {}, remove: string[] = [];
    for (const k of PLAN_RULES) {
      if (!(k in r)) continue;
      if (r[k] === null || r[k] === false) { remove.push(k); continue; }
      const one = cleanPlan({ [k]: r[k] }) as Record<string, unknown> | null;
      if (!one) return null;                                       // one bad value: the whole card goes
      set[k] = one[k];
    }
    if (!Object.keys(set).length && !remove.length) return null;
    return { type: 'set_plan', rules: set, remove };
  }
  if (raw.type === 'set_goal') {
    if (!(GOAL_KINDS as readonly string[]).includes(raw.kind)) return null;
    const fixed = raw.kind === 'stop_every_trade' || raw.kind === 'no_size_up_after_loss';
    const t = fixed ? 1 : num(raw.target);
    if (!(t > 0 && t < 1e9)) return null;
    if ((raw.kind === 'max_trades_per_day' || raw.kind === 'stop_after_losses') && !(Number.isInteger(t) && t <= 50)) return null;
    return { type: 'set_goal', kind: raw.kind, target: raw.kind === 'max_daily_loss' ? Math.round(t * 100) / 100 : t };
  }
  const a = num(raw.amount);
  if (!(a > 0 && a < 1e9)) return null;
  return { type: 'set_monthly_target', amount: Math.round(a * 100) / 100 };
}

// the coach's [[action:{...}]] lines -> { text, visuals }: valid ones become [[action:aN]] (at most MAX_ACTIONS, the same
// action once), the rest are removed, inline ones too.
export function resolveActions(text: string) {
  const visuals: Record<string, unknown> = {};
  const seen = new Set<string>();
  let n = 0;
  const out = text.replace(ACTION_LINE, (_l, json: string) => {
    let raw: any = null;
    try { raw = JSON.parse(json); } catch (_) { return ''; }
    const a = cleanAction(raw);
    if (!a || n >= MAX_ACTIONS) return '';
    const key = JSON.stringify(a);
    if (seen.has(key)) return '';
    seen.add(key);
    const id = `action:a${++n}`;
    visuals[id] = { kind: 'action', action: a };
    return `[[${id}]]`;
  })
    // whatever else starts like a card (broken JSON, inside a sentence) is never shown as raw text
    .replace(/^[ \t]*\[\[action:(?!a\d\]\])[^\n]*$/gm, '')
    .replace(/\[\[action:(?!a\d\]\])[^\n]*?\]\]/g, '')
    .replace(/\n{3,}/g, '\n\n').trim();
  return { text: out, visuals };
}

const lower = (s: string) => s.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();

// I/O: apply a confirmed action for the member. journalId: the journal a strategy goes to (checked here).
// -> { ok: true, ...result } | { ok: false, code }
export async function applyAction(admin: any, userId: string, raw: any, opts: { journalId?: string | null; tz: string; now?: number }) {
  const a = cleanAction(raw);
  if (!a) return { ok: false, code: 'BAD_REQUEST' };
  const now = opts.now ?? Date.now();
  if (a.type === 'set_monthly_target') return { ok: true, action: a, client: true };     // the panel stores it

  if (a.type === 'add_strategy') {
    const jid = opts.journalId || '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jid)) return { ok: false, code: 'NO_JOURNAL' };
    const { data: own } = await admin.from('journals').select('id').eq('id', jid).eq('user_id', userId).maybeSingle();
    if (!own) return { ok: false, code: 'NOT_FOUND' };
    const { data: list, error: le } = await admin.from('strategies').select('id, name').eq('user_id', userId).eq('journal_id', jid);
    if (le) return { ok: false, code: 'SERVER' };
    const same = (list || []).find((s: any) => lower(String(s.name || '')) === lower(a.name));
    if (same) return { ok: true, action: a, strategy: { id: same.id, name: same.name }, existed: true };
    const { data: row, error } = await admin.from('strategies').insert({ user_id: userId, journal_id: jid, name: a.name, description: a.description, color: a.color, is_active: true })
      .select('id, name').single();
    if (error || !row) return { ok: false, code: 'SERVER' };
    return { ok: true, action: a, strategy: { id: row.id, name: row.name }, existed: false };
  }

  const { data: cs, error: ce } = await admin.from('coach_settings').select('plan').eq('user_id', userId).maybeSingle();
  if (ce) return { ok: false, code: 'SERVER' };
  const plan: Record<string, any> = { ...((cs && cs.plan) || {}) };
  if (a.type === 'set_plan') {
    const rules: Record<string, any> = { ...(cleanPlan(plan) || {}) };
    for (const k of a.remove) delete rules[k];
    Object.assign(rules, a.rules);
    for (const k of PLAN_RULES) delete plan[k];
    Object.assign(plan, cleanPlan(rules) || {});
  } else {
    const g = cleanGoal({ kind: a.kind, target: a.target }, now, opts.tz);
    if (!g) return { ok: false, code: 'BAD_REQUEST' };
    plan.goal = g;
  }
  const { error: ue } = await admin.from('coach_settings').upsert({ user_id: userId, plan, time_zone: opts.tz }, { onConflict: 'user_id' });
  if (ue) return { ok: false, code: 'SERVER' };
  return { ok: true, action: a, plan };
}
