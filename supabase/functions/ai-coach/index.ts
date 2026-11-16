// supabase/functions/ai-coach/index.ts
// AI coach: the member asks about their own trading (optionally with a chart screenshot); Google Gemini answers with a
// summary of the member's trades and strategies (_shared/trade-summary.ts) and a fixed knowledge base
// (_shared/coach-knowledge.ts) as context, plus the state of the member's active prop challenges (_shared/prop-context.ts)
// and their backtest accounts (_shared/backtest-context.ts).
// Migrations 202611120002 (tables, limits) and 202611120003 (visuals).
//   POST { message, conversationId?, journalId?, image?: { mimeType, data (base64) }, lang?, tz?, stream?, detail?: short|normal|detailed }
//     coach?: kai|mira|rex|atlas|nova, tone?: soft|balanced|strict (_shared/coach-personas.ts; else coach_settings.plan.coach)
//     currency?: $|€|£|₺|₿ (or USD/EUR/...): the currency the panel shows; else user_profiles.preferred_currency, else $
//     stream false -> JSON { ok, conversationId, reply, visuals, usage: { used, limit, premium } }
//     stream true  -> text/event-stream: "start" {usage}, "delta" {text} ..., then "done" {conversationId, reply, visuals,
//                     usage} or "error" {code, message}; "reset" {} = the answer so far was broken and is being retried
//                     (the panel clears it). Checks before the first byte (auth, limit, input) still answer JSON.
//   visuals: { "<directive id>": chart data } for the [[viz:...]] lines of the reply, built from the app's numbers
//   (_shared/visuals.ts), never from the model.
//   POST { action: "alerts", journalId, tz? } -> { ok, alerts }: live coach checks after a manual trade (_shared/coach-alerts.ts),
//   written to public.notifications like after a sync; saves the member's zone in coach_settings. No Gemini call.
//   POST { action: "goal", goal: { kind, target } | null, tz? } -> { ok, goal }: this week's goal (_shared/weekly.ts) in coach_settings.plan.goal.
//   POST { action: "commit", commit: { kind, target, day } | null, tz? } -> { ok, commitment }: the member takes (or drops) the
//   promise the coach proposed with a [[commit:...]] line (_shared/commitments.ts), stored in coach_settings.plan.commitment.
//   POST { action: "apply", act: { type, ... }, journalId?, tz? } -> { ok, ... }: the member confirmed a card the coach wrote
//   with an [[action:{...}]] line (_shared/actions.ts): add a strategy, set plan rules, set this week's goal. Validated again here.
//   snapshot / alerts / chat also write last week's review once (notification coach.weekly, _shared/weekly.ts) and settle a
//   promise whose day is over (notification coach.commit, result in plan.commitment_log).
//   POST { action: "snapshot", journalId?, tz? } -> { ok, snapshot: { month, overall, insights, coach_suggestion } } for the panel's
//   opening screen: numbers and rule-based findings (_shared/insights.ts), and the coach that fits the strongest finding
//   (the coach picker's "pick for me"). No Gemini call, no message counted.
// Security:
//   - The member's JWT is required; every row is read for the caller only (journal and conversation ownership checked).
//   - GEMINI_API_KEY lives in the function secrets and never reaches the browser or a log.
//   - Daily message limit per plan (ai_take_message, refunded when Gemini fails). Images are sent to Gemini, never stored.
// Gemini Interactions API, streamed (stateless: store=false; the model's output steps are rebuilt from the stream, kept in
// ai_messages.steps and sent back unchanged to the same model, as the API requires for thought signatures; another model
// gets the plain text). A model that is busy or failing before its first word hands over to the next one.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, jsonRes } from '../_shared/ctrader.ts';
import { summarizeTrades, safeTimeZone, equityCurve } from '../_shared/trade-summary.ts';
import { COACH_KNOWLEDGE, answerLength, answerLengthRule, currencySymbol, currencyRule, type AnswerLength } from '../_shared/coach-knowledge.ts';
import { resolveVisuals } from '../_shared/visuals.ts';
import { createStepBuilder, takeSseEvents, createLeakGuard } from '../_shared/gemini-stream.ts';
import { pickInsights, snapshotNumbers } from '../_shared/insights.ts';
import { loadPropContexts } from '../_shared/prop-context.ts';
import { readPaged } from '../_shared/paged.ts';
import { runCoachAlerts } from '../_shared/coach-alerts.ts';
import { cleanPlan, disciplineReport, checkTrades } from '../_shared/discipline.ts';
import { weekStart, addDays, weeklyReview, goalProgress, cleanGoal, runWeeklyReview } from '../_shared/weekly.ts';
import { cleanCommitment, commitmentState, resolveCommitments, settleOnce } from '../_shared/commitments.ts';
import { resolveActions, applyAction } from '../_shared/actions.ts';
import { backtestContext } from '../_shared/backtest-context.ts';
import { resolveCoach, coachIntro, suggestCoach, type Coach } from '../_shared/coach-personas.ts';
import { runChain, modelHealth } from '../_shared/model-chain.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
// tried in order: a model that is busy (429/503) or failing (5xx) hands over to the next one
const GEMINI_MODELS = (Deno.env.get('GEMINI_MODELS') || 'gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash-lite')
  .split(',').map((m) => m.trim()).filter(Boolean);
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse';
const GEMINI_REVISION = '2026-05-20';
// a model may accept the request and then stay silent (seen on the free tier: 100 s without a word): give up on it and
// move on. The wait for the first word and the order of the models: _shared/model-chain.ts (busy models go last for a while).
const IDLE_MS = 15_000;                            // between two chunks once text flows
const HEALTH = modelHealth();                      // lives as long as this function instance

const MAX_BODY_BYTES = 8 * 1024 * 1024;            // base64 image included
const MAX_IMAGE_B64 = 7 * 1024 * 1024;             // ~5 MB of image bytes
const MAX_MESSAGE = 4000;
const HISTORY_TURNS = 20;                          // last messages of the conversation sent back
const MAX_TRADES = 3000;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LANGS: Record<string, string> = { tr: 'Turkish', en: 'English', de: 'German' };

const TRADE_COLS = 'id, journal_id, symbol, direction, lot, entry_price, exit_price, stop_loss, take_profit, pnl, rr_ratio, trade_date, exit_date, notes, strategy_id, platform_source, commission, swap, gross_pnl';
const MAX_BT_TRADES = 5000;
const BT_ACCOUNT_COLS = 'id, name, symbol, timeframe, starting_balance, journal_id, data_source, is_active, replay_time, section_no, created_at, updated_at';
const BT_TRADE_COLS = 'id, backtest_account_id, symbol, direction, lot, entry_price, exit_price, stop_loss, take_profit, initial_stop_loss, initial_take_profit, entry_time, exit_time, pnl, commission, gross_pnl, exit_reason, exit_ambiguous, section_no';

// share of trades in [from, to] (local days) that broke no rule of the plan; null without a plan or trades
function planScore(rawPlan: any, trades: any[], tz: string) {
  const plan = cleanPlan(rawPlan);
  if (!plan) return undefined;
  return (from: string, to: string) => {
    const rows = checkTrades(plan, trades, tz).filter((c) => c.day >= from && c.day <= to);
    return rows.length ? Math.round(rows.filter((c) => !c.broken.length).length / rows.length * 1000) / 10 : null;
  };
}
// the weekly review and the daily commitment cover all journals: the last 5 weeks of trades are read for them (a
// journal-scoped chat does not have them). Writes last week's review and a finished commitment's result once.
// -> { weekly: { review, goal }, commitment } or null on a read error
async function coachDaily(admin: any, userId: string, tz: string) {
  const { data: cs } = await admin.from('coach_settings').select('plan, updated_at').eq('user_id', userId).maybeSingle();
  const since = new Date(Date.now() - 35 * 864e5).toISOString();
  const rows = await readPaged((a, b) => admin.from('trades').select('symbol, lot, trade_date, exit_date, pnl, exit_price, stop_loss, platform_source')
    .eq('user_id', userId).gte('trade_date', since).order('trade_date', { ascending: false }).range(a, b), 3000);
  if (!rows) return null;
  await settleOnce(admin, userId, cs || null, rows, tz);          // updates cs.plan when it settles
  const goal = cs?.plan?.goal || null;
  const written = await runWeeklyReview(admin, userId, rows, { tz, goal, discipline: planScore(cs?.plan, rows, tz) });
  const lastWs = addDays(weekStart(Date.now(), tz), -7);
  return {
    weekly: { review: written || weeklyReview(rows, tz, lastWs, goal, planScore(cs?.plan, rows, tz)), goal: goalProgress(rows, tz, goal, Date.now()) },
    commitment: commitmentState(cs?.plan, rows, tz, Date.now()),
  };
}

// Everything the coach knows about the member: trade summary (+ prop challenge state) and the raw trades for the charts.
// journalId null = all journals. null on a read error.
async function loadContext(admin: any, userId: string, journalId: string | null, tz: string, recent?: number) {
  const tradesP = readPaged((a, b) => {
    let q = admin.from('trades').select(TRADE_COLS).eq('user_id', userId).order('trade_date', { ascending: false }).order('id', { ascending: false }).range(a, b);
    return journalId ? q.eq('journal_id', journalId) : q;
  }, MAX_TRADES);
  let sq = admin.from('strategies').select('id, name, description').eq('user_id', userId);
  if (journalId) sq = sq.or(`journal_id.eq.${journalId},journal_id.is.null`);
  // backtest accounts are not tied to a journal scope: the coach sees all of the member's accounts
  const baq = admin.from('backtest_accounts').select(BT_ACCOUNT_COLS).eq('user_id', userId).limit(50);
  const btP = readPaged((a, b) => admin.from('backtest_account_trades').select(BT_TRADE_COLS).eq('user_id', userId)
    .order('entry_time', { ascending: false }).order('id', { ascending: false }).range(a, b), MAX_BT_TRADES);
  const jq = admin.from('journals').select('id, name').eq('user_id', userId);
  const cq = admin.from('coach_settings').select('plan').eq('user_id', userId).maybeSingle();     // error (no table yet): no plan
  const [trades, { data: strategies, error: se }, { data: btAccounts, error: bae }, btTrades, { data: js }, { data: cs }] =
    await Promise.all([tradesP, sq, baq, btP, jq, cq]);
  if (!trades || se) return null;
  const summary = summarizeTrades(trades, strategies || [], { tz, ...(recent != null ? { recent } : {}) });
  const names = new Map<string, string>((js || []).map((j: any) => [j.id, j.name]));
  // the member's trading plan and how well the trades follow it
  const plan = disciplineReport(cleanPlan(cs?.plan), trades, tz);
  if (plan) summary.trading_plan = plan;
  // last week's review and this week's goal (Monday-Sunday in the member's zone)
  const goal = cs?.plan?.goal || null, now = Date.now(), lastWs = addDays(weekStart(now, tz), -7);
  const wk = { last_week: weeklyReview(trades, tz, lastWs, goal, planScore(cs?.plan, trades, tz)), this_week_goal: goalProgress(trades, tz, goal, now) };
  if (wk.last_week || wk.this_week_goal) summary.weekly = wk;

  // backtest accounts (a read error leaves the rest of the answer intact); their per-symbol comparison with the live trades
  // replaces the one built from journal mirrors, which only cover linked accounts
  if (!bae && btTrades && btAccounts && btAccounts.length) {
    try {
      const bt = backtestContext(btAccounts, btTrades, trades, names);
      if (bt) {
        // a ready system: does the member already trade its symbol live?
        const liveSymbols = new Set(trades.filter((t: any) => t.platform_source !== 'backtest' && t.exit_price != null).map((t: any) => String(t.symbol || '').toUpperCase()));
        for (const a of bt.accounts as any[]) a.live_readiness.trades_this_symbol_live = liveSymbols.has(a.symbol);
        summary.backtest_accounts = bt;
        const prev = (summary.backtest_vs_live || {}) as Record<string, unknown>;
        summary.backtest_vs_live = { by_strategy: prev.by_strategy || [], by_symbol: bt.vs_live_by_symbol };
        delete (bt as any).vs_live_by_symbol;
      }
    } catch (_) { console.error('ai-coach: backtest context failed'); }
  }

  // prop challenges: a prop context failing to load leaves the rest of the answer intact
  try {
    const props = await loadPropContexts(admin, userId, journalId, names);
    if (props.length) summary.prop_accounts = props;
  } catch (_) { console.error('ai-coach: prop context failed'); }
  return { summary, trades, coach: cs?.plan?.coach };
}

function fail(code: string, message: string, status: number, cors: Record<string, string>, extra: Record<string, unknown> = {}) {
  return jsonRes({ ok: false, code, error: message, ...extra }, status, { ...cors, 'Cache-Control': 'no-store' });
}

export function systemInstruction(lang: string, context: unknown, detail: AnswerLength = 'normal', coach: Coach = resolveCoach(null, null), currency = '$'): string {
  return [
    ...coachIntro(coach),
    'You help ONE trader improve by analysing THEIR OWN journal data, given below as JSON, and chart screenshots they share.',
    '',
    'Rules:',
    `- Always answer in ${LANGS[lang] || 'Turkish'}, whatever language the data is in.`,
    '- Write only the final answer the trader reads. Think silently: never write your reasoning, analysis of the request, rule checklists, drafts or word counts.',
    '- Base every claim about the trader on the JSON. Quote the concrete numbers and say when a sample is too small to conclude anything.',
    '- Never invent trades, numbers or strategies that are not in the data. If the data cannot answer the question, say so and say what the trader could record to make it answerable.',
    '- Use short paragraphs and bullet lists; markdown bold and lists are rendered. No tables, no headings above level 3.',
    '- Never show the data\'s field names, JSON keys, code or values like null/true (e.g. write "trades with a stop loss", not trades_with_stop_loss_pct); the trader only sees plain language.',
    '- You are not a licensed financial adviser; mention it only when the trader asks for direct investment advice. Do not end answers with disclaimers or risk notes (the app already shows one).',
    '- Stay on trading, risk management, trading psychology and the use of the journal. Politely decline anything else.',
    currencyRule(currency),
    '- Times in by_entry_hour_local are in the time_zone field.',
    '',
    COACH_KNOWLEDGE,
    '',
    ...(answerLengthRule(detail) ? [answerLengthRule(detail), ''] : []),
    'Trader data (JSON, generated by the app, read-only):',
    JSON.stringify(context),
  ].join('\n');
}

// earlier turns as Interactions input: raw steps only for turns of the same model (thought signatures), text otherwise
export function buildHistory(msgs: { role: string; content: string; steps?: any; model?: string | null; had_image?: boolean }[], model: string): any[] {
  const h: any[] = [];
  for (const m of msgs) {
    if (m.role === 'user') {
      h.push({ type: 'user_input', content: [{ type: 'text', text: m.content + (m.had_image ? '\n[The trader attached a chart screenshot to this message; it is no longer available.]' : '') }] });
    } else if (m.model === model && Array.isArray(m.steps) && m.steps.length) h.push(...m.steps);
    else h.push({ type: 'model_output', content: [{ type: 'text', text: m.content }] });
  }
  while (h.length && h[0].type !== 'user_input') h.shift();      // the cut may start inside a model turn
  return h;
}

// One streamed Gemini call. onDelta gets the reply text as it arrives.
// -> { ok, status, steps, text, forwarded } ; ok=false with forwarded=false means another model may be tried.
async function streamGemini(model: string, payload: Record<string, unknown>, onDelta: (t: string) => void, firstWordMs: number) {
  const ac = new AbortController();
  let timer = setTimeout(() => ac.abort(), firstWordMs);
  const arm = (ms: number) => { clearTimeout(timer); timer = setTimeout(() => ac.abort(), ms); };
  try { return await streamGeminiInner(model, payload, onDelta, ac.signal, arm); }
  finally { clearTimeout(timer); }
}
async function streamGeminiInner(model: string, payload: Record<string, unknown>, onDelta: (t: string) => void,
  signal: AbortSignal, arm: (ms: number) => void) {
  let res: Response;
  try {
    res = await fetch(GEMINI_URL, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY, 'Api-Revision': GEMINI_REVISION },
      body: JSON.stringify({ model, ...payload, store: false, stream: true }),
    });
  } catch (_) {
    console.error('ai-coach gemini error:', model, signal.aborted ? 'timeout' : 'network');
    return { ok: false, status: 503, steps: [], text: '', forwarded: false };
  }
  if (!res.ok || !res.body) {
    let code = '-';
    try { const j = await res.json(); code = String(j?.error?.code || '-'); } catch (_) { /* no body */ }
    console.error('ai-coach gemini error:', model, res.status, code.slice(0, 40));
    return { ok: false, status: res.status, steps: [], text: '', forwarded: false };
  }
  const b = createStepBuilder(), reader = res.body.getReader(), dec = new TextDecoder();
  const guard = createLeakGuard(onDelta);   // reasoning written as answer text never reaches the member
  let buf = '', gotText = false;
  const feed = (ev: any) => { const d = b.push(ev); if (d) { gotText = true; guard.push(d); } };
  const leak = () => {
    console.error('ai-coach reasoning leak:', model);
    reader.cancel().catch(() => {});
    // like a busy model: the next model is tried and this one is put last for a while
    return { ok: false, status: 503, steps: [], text: '', forwarded: guard.forwarded };
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const { events, rest } = takeSseEvents(buf);
      buf = rest;
      for (const ev of events) feed(ev);
      if (guard.leaked) return leak();
      if (gotText) arm(IDLE_MS);
    }
    buf += dec.decode();
    for (const ev of takeSseEvents(buf + '\n\n').events) feed(ev);
  } catch (_) {
    console.error('ai-coach stream broken:', model, signal.aborted ? 'timeout' : 'read error');
    return { ok: false, status: 503, steps: b.result().steps, text: b.result().text, forwarded: guard.forwarded };
  }
  if (!guard.end()) return leak();
  const forwarded = guard.forwarded;
  const r = b.result();
  if (r.error || !r.text || r.status !== 'completed') {
    // an error event, no text, or a stream cut off before interaction.completed: not a usable answer
    console.error('ai-coach stream error:', model, r.error ? r.error.code.slice(0, 40) : (r.text ? 'cut off' : 'empty'), r.status || '-');
    const busy = !r.error || /unavailable|exhausted|overload|deadline|timeout|internal/i.test(r.error.code);
    return { ok: false, status: busy ? 503 : 400, steps: r.steps, text: r.text, forwarded };
  }
  return { ok: true, status: 200, steps: r.steps.filter((s: any) => s && s.type !== 'user_input'), text: r.text, forwarded };
}

serve(async (req: Request) => {
  const cors = getCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return fail('METHOD', 'Method not allowed', 405, cors);
  if (!GEMINI_API_KEY) return fail('NOT_CONFIGURED', 'AI is not configured.', 503, cors);

  // 1) identity
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return fail('UNAUTHORIZED', 'Unauthorized', 401, cors);
  const { data: { user }, error: authError } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY).auth.getUser(authHeader.substring(7));
  if (authError || !user) return fail('UNAUTHORIZED', 'Unauthorized', 401, cors);

  // 2) body
  let body: any;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return fail('TOO_LARGE', 'Request too large.', 413, cors);
    body = JSON.parse(text);
  } catch { return fail('BAD_REQUEST', 'Invalid JSON body.', 400, cors); }
  if (body?.action === 'snapshot') {
    const jid = body?.journalId == null || body.journalId === '' ? null : String(body.journalId);
    if (jid && !UUID.test(jid)) return fail('BAD_REQUEST', 'Invalid journal.', 400, cors);
    const tzs = safeTimeZone(body?.tz);
    const adm = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    if (jid) {
      const { data } = await adm.from('journals').select('id').eq('id', jid).eq('user_id', user.id).maybeSingle();
      if (!data) return fail('NOT_FOUND', 'Journal not found.', 404, cors);
    }
    const loaded = await loadContext(adm, user.id, jid, tzs, 0);
    if (!loaded) return fail('SERVER', 'Could not read the journal.', 500, cors);
    const sum = loaded.summary;
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: tzs, year: 'numeric', month: '2-digit' }).formatToParts(new Date());
    const nowMonth = `${p.find((x) => x.type === 'year')?.value}-${p.find((x) => x.type === 'month')?.value}`;
    const daily = await coachDaily(adm, user.id, tzs).catch(() => null);
    return jsonRes({ ok: true, snapshot: { ...snapshotNumbers(sum, nowMonth), insights: pickInsights(sum), weekly: daily?.weekly || null,
      commitment: daily?.commitment || null, coach_suggestion: suggestCoach(pickInsights(sum, 50)) } }, 200, { ...cors, 'Cache-Control': 'no-store' });
  }
  if (body?.action === 'goal') {
    // the member takes (or drops: goal null) this week's goal; stored in coach_settings.plan.goal, rules kept
    const tzs = safeTimeZone(body?.tz);
    const g = body?.goal == null ? null : cleanGoal(body.goal, Date.now(), tzs);
    if (body?.goal != null && !g) return fail('BAD_REQUEST', 'Invalid goal.', 400, cors);
    const adm = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: cs, error: ce } = await adm.from('coach_settings').select('plan').eq('user_id', user.id).maybeSingle();
    if (ce) return fail('SERVER', 'Could not save the goal.', 500, cors);
    const plan = { ...((cs && cs.plan) || {}) };
    if (g) plan.goal = g; else delete plan.goal;
    const { error: ue } = await adm.from('coach_settings').upsert({ user_id: user.id, plan, time_zone: tzs }, { onConflict: 'user_id' });
    if (ue) return fail('SERVER', 'Could not save the goal.', 500, cors);
    return jsonRes({ ok: true, goal: g }, 200, { ...cors, 'Cache-Control': 'no-store' });
  }
  if (body?.action === 'commit') {
    // the member takes the coach's promise for today / tomorrow (or drops it: commit null); a finished one is settled first
    const tzs = safeTimeZone(body?.tz);
    const c = body?.commit == null ? null : cleanCommitment(body.commit, Date.now(), tzs);
    if (body?.commit != null && !c) return fail('BAD_REQUEST', 'Invalid commitment.', 400, cors);
    const adm = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const daily = await coachDaily(adm, user.id, tzs).catch(() => null);         // settles yesterday's before it is replaced
    if (!daily) return fail('SERVER', 'Could not save the commitment.', 500, cors);
    const { data: cs, error: ce } = await adm.from('coach_settings').select('plan').eq('user_id', user.id).maybeSingle();
    if (ce) return fail('SERVER', 'Could not save the commitment.', 500, cors);
    const plan = { ...((cs && cs.plan) || {}) };
    if (c) plan.commitment = c; else delete plan.commitment;
    const { error: ue } = await adm.from('coach_settings').upsert({ user_id: user.id, plan, time_zone: tzs }, { onConflict: 'user_id' });
    if (ue) return fail('SERVER', 'Could not save the commitment.', 500, cors);
    return jsonRes({ ok: true, commitment: c }, 200, { ...cors, 'Cache-Control': 'no-store' });
  }
  if (body?.action === 'apply') {
    // a card the member confirmed: never trusted as sent, applyAction validates it again
    const tzs = safeTimeZone(body?.tz);
    const jid = typeof body?.journalId === 'string' ? body.journalId : null;
    const adm = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const r: any = await applyAction(adm, user.id, body?.act, { journalId: jid, tz: tzs }).catch(() => ({ ok: false, code: 'SERVER' }));
    if (!r.ok) {
      const st = r.code === 'BAD_REQUEST' || r.code === 'NO_JOURNAL' ? 400 : r.code === 'NOT_FOUND' ? 404 : 500;
      return fail(r.code, 'Could not apply.', st, cors);
    }
    return jsonRes(r, 200, { ...cors, 'Cache-Control': 'no-store' });
  }
  if (body?.action === 'alerts') {
    // after a manual trade: the same live checks the sync functions run; also remembers the member's zone for them
    const jid = typeof body?.journalId === 'string' ? body.journalId : '';
    if (!UUID.test(jid)) return fail('BAD_REQUEST', 'Invalid journal.', 400, cors);
    const tzs = safeTimeZone(body?.tz);
    const adm = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: own } = await adm.from('journals').select('id').eq('id', jid).eq('user_id', user.id).maybeSingle();
    if (!own) return fail('NOT_FOUND', 'Journal not found.', 404, cors);
    if (tzs !== 'UTC' || body?.tz === 'UTC') {
      const { error: tze } = await adm.from('coach_settings').upsert({ user_id: user.id, time_zone: tzs }, { onConflict: 'user_id' });
      if (tze) console.error('ai-coach: time zone not saved:', String(tze.code || '-'));
    }
    await coachDaily(adm, user.id, tzs).catch(() => null);
    const alerts = await runCoachAlerts(adm, user.id, jid, {
      tz: tzs, propContextFor: async (j: string) => (await loadPropContexts(adm, user.id, j))[0] || null,
    });
    return jsonRes({ ok: true, alerts: alerts.map((a) => ({ kind: a.kind, key: a.key, level: a.level, params: a.params })) }, 200, { ...cors, 'Cache-Control': 'no-store' });
  }
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > MAX_MESSAGE) return fail('BAD_REQUEST', 'Message must be 1-' + MAX_MESSAGE + ' characters.', 400, cors);
  const lang = LANGS[body?.lang] ? body.lang : 'tr';
  const tz = safeTimeZone(body?.tz);
  const wantStream = body?.stream === true;
  const detail = answerLength(body?.detail);
  const bodyCurrency = currencySymbol(body?.currency);           // the symbol the panel shows; else the profile's (below)
  const convId = body?.conversationId == null ? null : String(body.conversationId);
  if (convId && !UUID.test(convId)) return fail('BAD_REQUEST', 'Invalid conversation.', 400, cors);
  const journalId = body?.journalId == null || body.journalId === '' ? null : String(body.journalId);
  if (journalId && !UUID.test(journalId)) return fail('BAD_REQUEST', 'Invalid journal.', 400, cors);
  let image: { mime_type: string; data: string } | null = null;
  if (body?.image) {
    const mt = String(body.image.mimeType || ''), data = String(body.image.data || '');
    if (!IMAGE_TYPES.includes(mt) || !data || data.length > MAX_IMAGE_B64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return fail('BAD_IMAGE', 'Unsupported or too large image.', 400, cors);
    image = { mime_type: mt, data };
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  // 3) ownership of the conversation / journal
  let conversation: { id: string; journal_id: string | null } | null = null;
  if (convId) {
    const { data } = await admin.from('ai_conversations').select('id, journal_id').eq('id', convId).eq('user_id', user.id).maybeSingle();
    if (!data) return fail('NOT_FOUND', 'Conversation not found.', 404, cors);
    conversation = data;
  }
  const scopeJournal = conversation ? conversation.journal_id : journalId;
  if (scopeJournal) {
    const { data } = await admin.from('journals').select('id').eq('id', scopeJournal).eq('user_id', user.id).maybeSingle();
    if (!data) return fail('NOT_FOUND', 'Journal not found.', 404, cors);
  }

  // 4) daily limit
  const { data: take, error: takeErr } = await admin.rpc('ai_take_message', { p_user: user.id });
  if (takeErr || !take) return fail('SERVER', 'Usage check failed.', 500, cors);
  const usage = { used: take.used, limit: take.limit, premium: !!take.premium };
  if (!take.ok) return fail('LIMIT', 'Daily AI message limit reached.', 429, cors, { usage });
  const refund = () => admin.rpc('ai_refund_message', { p_user: user.id }).then(() => {}, () => {});

  // 5..8) context, Gemini, save. send() is the stream writer (a no-op in JSON mode).
  type Outcome = { ok: true; conversationId: string | null; reply: string; visuals: Record<string, unknown> } | { ok: false; code: string; message: string; status: number };
  async function run(send: (event: string, data: unknown) => void): Promise<Outcome> {
    try {
      const t0 = Date.now();
      const [loaded, daily] = await Promise.all([loadContext(admin, user!.id, scopeJournal, tz), coachDaily(admin, user!.id, tz).catch(() => null)]);
      const tCtx = Date.now();
      if (!loaded) { await refund(); return { ok: false, code: 'SERVER', message: 'Could not read the journal.', status: 500 }; }
      const context = loaded.summary;
      // all journals, like the weekly goal. The latest result is told once, in the first answer of a new chat.
      if (daily?.commitment) context.commitment = { ...daily.commitment, mention_last: !conversation && !!daily.commitment.last };
      // the dashboard's monthly profit target lives in the browser: the panel sends it for the journal in view
      const mt = Number(body?.monthlyTarget);
      if (Number.isFinite(mt) && mt > 0 && mt < 1e9) context.monthly_profit_target = Math.round(mt * 100) / 100;
      const equity = equityCurve(loaded.trades);

      let msgs: any[] = [];
      if (conversation) {
        const { data } = await admin.from('ai_messages').select('role, content, steps, model, had_image')
          .eq('conversation_id', conversation.id).order('created_at', { ascending: false }).limit(HISTORY_TURNS);
        msgs = (data || []).reverse();
      }
      const userContent: any[] = [{ type: 'text', text: message }];
      if (image) userContent.push({ type: 'image', data: image.data, mime_type: image.mime_type });
      let currency = bodyCurrency;
      if (!currency) {
        const { data: prof } = await admin.from('user_profiles').select('preferred_currency').eq('id', user!.id).maybeSingle();
        currency = currencySymbol(prof?.preferred_currency) || '$';
      }
      const system = systemInstruction(lang, context, detail, resolveCoach(body, loaded.coach), currency);

      // model chain (_shared/model-chain.ts): busy models last, one more round after a pause on a short demand spike
      let tFirst = 0;
      const chained = await runChain(GEMINI_MODELS, (model, firstWordMs) => streamGemini(model, {
        system_instruction: system,
        input: [...buildHistory(msgs, model), { type: 'user_input', content: userContent }],
        generation_config: { thinking_level: 'low', max_output_tokens: 4096 },
      }, (t) => { if (!tFirst) tFirst = Date.now(); send('delta', { text: t }); }, firstWordMs), {
        health: HEALTH,
        onReset: () => { tFirst = 0; send('reset', {}); },   // the member saw part of a broken answer: the panel clears it
      });
      const { got, used, lastStatus } = chained;
      // timings only (no content, no user id): where the wait goes
      console.log('ai-coach timing ' + JSON.stringify({ ctx_ms: tCtx - t0, first_word_ms: tFirst ? tFirst - tCtx : null,
        total_ms: Date.now() - t0, model: used || null, attempts: chained.attempts, cooling: HEALTH.cooling() }));
      if (!got) {
        await refund();
        if (lastStatus === 429 || lastStatus === 503) return { ok: false, code: 'BUSY', message: 'The AI service is busy. Try again in a minute.', status: 503 };
        return { ok: false, code: 'UPSTREAM', message: 'The AI service could not answer. Try again shortly.', status: 502 };
      }
      const rv = resolveVisuals(got.text, context, equity);
      const rc = resolveCommitments(rv.text, Date.now(), tz);         // the "I promise" card: absolute day, never the model's
      const ra = resolveActions(rc.text);                           // cards the member confirms (strategy, plan, goals)
      const reply = ra.text, visuals: Record<string, unknown> = { ...rv.visuals, ...rc.visuals, ...ra.visuals };

      let cid = conversation?.id ?? null;
      if (!cid) {
        const title = message.replace(/\s+/g, ' ').slice(0, 60) || 'Chat';
        const { data: c, error: ce } = await admin.from('ai_conversations').insert({ user_id: user!.id, journal_id: scopeJournal, title }).select('id').single();
        if (ce || !c) console.error('ai-coach: conversation insert failed');
        else cid = c.id;
      }
      if (cid) {
        // both rows carry every column: a multi-row insert sends the union of the keys and a missing key becomes NULL
        // (had_image is NOT NULL), which used to reject the whole insert
        const { error: me } = await admin.from('ai_messages').insert([
          { conversation_id: cid, user_id: user!.id, role: 'user', content: message, had_image: !!image, steps: null, model: null, visuals: null },
          { conversation_id: cid, user_id: user!.id, role: 'model', content: reply.slice(0, 20000), had_image: false, steps: got.steps, model: used, visuals: Object.keys(visuals).length ? visuals : null },
        ]);
        if (me) console.error('ai-coach: message insert failed:', String(me.code || '-').slice(0, 20));
        await admin.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', cid);
      }
      return { ok: true, conversationId: cid, reply, visuals };
    } catch (e) {
      await refund();
      console.error('ai-coach error:', String((e as Error)?.name || 'Error'));
      return { ok: false, code: 'SERVER', message: 'Something went wrong. Try again.', status: 500 };
    }
  }

  if (!wantStream) {
    const out = await run(() => {});
    if (!out.ok) return fail(out.code, out.message, out.status, cors);
    return jsonRes({ ok: true, conversationId: out.conversationId, reply: out.reply, visuals: out.visuals, usage }, 200, { ...cors, 'Cache-Control': 'no-store' });
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (event: string, data: unknown) => {
        if (!open) return;
        try { controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch (_) { open = false; }
      };
      send('start', { usage });
      const out = await run(send);
      if (out.ok) send('done', { conversationId: out.conversationId, reply: out.reply, visuals: out.visuals, usage });
      else send('error', { code: out.code, message: out.message, usage: { ...usage, used: Math.max(0, usage.used - 1) } });
      open = false;
      try { controller.close(); } catch (_) { /* closed by the client */ }
    },
  });
  return new Response(stream, { status: 200, headers: { ...cors, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
});
