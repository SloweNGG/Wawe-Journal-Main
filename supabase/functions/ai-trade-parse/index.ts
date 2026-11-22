// supabase/functions/ai-trade-parse/index.ts
// "Add with AI" in Quick Add: reads trades from a screenshot and/or the trader's own words and returns them as data.
// Nothing is saved here: the browser puts one trade into the trade form, several into the import preview, and the trader
// confirms (public/interface/quick-add/js/quick-add.js). Instruction and cleaning: _shared/trade-extract.ts.
//
//   POST { text?: string (<= 2000), image?: { mimeType: png|jpeg|webp, data: base64 }, lang?: tr|en|de, tz?, recentSymbols?: string[] }
//   -> 200 { ok, trades: ExtractedTrade[], note, usage: { used, limit, premium } }
//   POST { action: "map", headers: string[], sample: string[][] (<= 5 rows), lang? }   CSV column mapping for a file the
//   parser did not recognise -> 200 { ok, mapping: { field: columnIndex }, fillBased, note, usage }. The browser's parser
//   then reads every row itself (no trade value comes from the model).
//   -> 4xx/5xx { ok: false, code, message, usage? }   codes: UNAUTHORIZED, BAD_REQUEST, BAD_IMAGE, TOO_LARGE, LIMIT, BUSY,
//                                                     UPSTREAM, SERVER, NOT_CONFIGURED
//
// Security / cost:
//   - JWT checked here (deploy without --no-verify-jwt). GEMINI_API_KEY / OPENROUTER_API_KEY stay in the function secrets.
//   - Shares the AI coach's daily limit (ai_take_message / ai_refund_message, migration 202611120002): one read = one
//     message; refunded when no model answers or nothing was found. No new table.
//   - The image is sent to the model and never stored; no content and no user id is logged.
// Models: the coach's chain (GEMINI_MODELS, then OpenRouter's vision/text models when OPENROUTER_API_KEY is set), through
// _shared/model-chain.ts. A reply that is not the JSON asked for counts as a failed model and the next one is tried.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, jsonRes } from '../_shared/ctrader.ts';
import { safeTimeZone } from '../_shared/trade-summary.ts';
import { takeSseEvents, createStepBuilder } from '../_shared/gemini-stream.ts';
import { runChain, modelHealth } from '../_shared/model-chain.ts';
import { OPENROUTER_URL, isOpenRouter, openRouterChain, chatRequest, createChatBuilder, chatOutcome } from '../_shared/openrouter-stream.ts';
import { extractInstruction, extractUserText, readExtraction, cleanRecentSymbols, MAX_TEXT,
  mappingInstruction, mappingUserText, readMapping, cleanHeaders, cleanSample } from '../_shared/trade-extract.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
const GEMINI_MODELS = (Deno.env.get('GEMINI_MODELS') || 'gemini-3.5-flash-lite,gemini-3.6-flash')
  .split(',').map((m) => m.trim()).filter(Boolean);
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') || '';
const OPENROUTER_MODELS = OPENROUTER_API_KEY
  ? openRouterChain(Deno.env.get('OPENROUTER_MODELS') || 'nvidia/nemotron-3-ultra-550b-a55b:free') : [];
const OPENROUTER_VISION_MODELS = OPENROUTER_API_KEY
  ? openRouterChain(Deno.env.get('OPENROUTER_VISION_MODELS') || 'particle-ai/particle-1:free,nvidia/nemotron-3.5-super-vl:free') : [];
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse';
const GEMINI_REVISION = '2026-05-20';
const IDLE_MS = 20_000;
const HEALTH = modelHealth();

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_B64 = 7 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LANGS = ['tr', 'en', 'de'];

function fail(code: string, message: string, status: number, cors: Record<string, string>, extra: Record<string, unknown> = {}) {
  return jsonRes({ ok: false, code, message, ...extra }, status, { ...cors, 'Cache-Control': 'no-store' });
}

function todayIn(tz: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

type Got = { ok: boolean; status: number; forwarded: boolean; text: string };

// reads a whole SSE answer; onEvent returns the text delta of one event. firstWordMs until the first text, then IDLE_MS.
async function collect(res: Response, onEvent: (ev: any) => string, arm: (ms: number) => void): Promise<boolean> {
  const reader = res.body!.getReader(), dec = new TextDecoder();
  let buf = '', got = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const { events, rest } = takeSseEvents(buf);
    buf = rest;
    for (const ev of events) if (onEvent(ev)) got = true;
    if (got) arm(IDLE_MS);
  }
  buf += dec.decode();
  for (const ev of takeSseEvents(buf + '\n\n').events) onEvent(ev);
  return true;
}

async function withTimer<T>(firstWordMs: number, fn: (signal: AbortSignal, arm: (ms: number) => void) => Promise<T>): Promise<T> {
  const ac = new AbortController();
  let timer = setTimeout(() => ac.abort(), firstWordMs);
  const arm = (ms: number) => { clearTimeout(timer); timer = setTimeout(() => ac.abort(), ms); };
  try { return await fn(ac.signal, arm); } finally { clearTimeout(timer); }
}

// a reply that is not the JSON asked for is treated like a busy model (503): the next model is tried
type Judge = (text: string) => boolean;
function judged(text: string, valid: Judge): Got {
  return valid(text) ? { ok: true, status: 200, forwarded: false, text } : { ok: false, status: 503, forwarded: false, text: '' };
}

function callGemini(model: string, system: string, userText: string, image: { mime_type: string; data: string } | null, firstWordMs: number, valid: Judge): Promise<Got> {
  return withTimer(firstWordMs, async (signal, arm) => {
    let res: Response;
    const content: any[] = [{ type: 'text', text: userText }];
    if (image) content.push({ type: 'image', data: image.data, mime_type: image.mime_type });
    try {
      res = await fetch(GEMINI_URL, {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY, 'Api-Revision': GEMINI_REVISION },
        body: JSON.stringify({ model, system_instruction: system, input: [{ type: 'user_input', content }],
          generation_config: { thinking_level: 'low', max_output_tokens: 8192 }, store: false, stream: true }),
      });
    } catch (_) {
      console.error('ai-trade-parse gemini error:', model, signal.aborted ? 'timeout' : 'network');
      return { ok: false, status: 503, forwarded: false, text: '' };
    }
    if (!res.ok || !res.body) {
      console.error('ai-trade-parse gemini error:', model, res.status);
      return { ok: false, status: res.status, forwarded: false, text: '' };
    }
    const b = createStepBuilder();
    try { await collect(res, (ev) => b.push(ev), arm); } catch (_) {
      console.error('ai-trade-parse stream broken:', model, signal.aborted ? 'timeout' : 'read error');
      return { ok: false, status: 503, forwarded: false, text: '' };
    }
    const r = b.result();
    if (r.error || !r.text || r.status !== 'completed') {
      const busy = !r.error || /unavailable|exhausted|overload|deadline|timeout|internal/i.test(r.error.code);
      console.error('ai-trade-parse stream error:', model, r.error ? r.error.code.slice(0, 40) : (r.text ? 'cut off' : 'empty'));
      return { ok: false, status: busy ? 503 : 400, forwarded: false, text: '' };
    }
    return judged(r.text, valid);
  });
}

function callOpenRouter(model: string, system: string, userText: string, image: { mime_type: string; data: string } | null, firstWordMs: number, valid: Judge): Promise<Got> {
  return withTimer(firstWordMs, async (signal, arm) => {
    const last = image
      ? [{ type: 'text', text: userText }, { type: 'image_url', image_url: { url: `data:${image.mime_type};base64,${image.data}` } }]
      : userText;
    let res: Response;
    try {
      res = await fetch(OPENROUTER_URL, {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + OPENROUTER_API_KEY },
        body: JSON.stringify(chatRequest(model, [{ role: 'system', content: system }, { role: 'user', content: last }])),
      });
    } catch (_) {
      console.error('ai-trade-parse openrouter error:', model, signal.aborted ? 'timeout' : 'network');
      return { ok: false, status: 503, forwarded: false, text: '' };
    }
    if (!res.ok || !res.body) {
      console.error('ai-trade-parse openrouter error:', model, res.status);
      return { ok: false, status: res.status === 429 ? 429 : res.status >= 500 || res.status === 408 ? 503 : res.status, forwarded: false, text: '' };
    }
    const b = createChatBuilder();
    try { await collect(res, (ev) => b.push(ev), arm); } catch (_) {
      return { ok: false, status: 503, forwarded: false, text: '' };
    }
    const r = b.result();
    if (chatOutcome(r) !== 200) return { ok: false, status: chatOutcome(r), forwarded: false, text: '' };
    return judged(r.text, valid);
  });
}

serve(async (req: Request) => {
  const cors = getCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return fail('METHOD', 'Method not allowed', 405, cors);
  if (!GEMINI_API_KEY) return fail('NOT_CONFIGURED', 'AI is not configured.', 503, cors);

  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return fail('UNAUTHORIZED', 'Unauthorized', 401, cors);
  const { data: { user }, error: authError } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY).auth.getUser(authHeader.substring(7));
  if (authError || !user) return fail('UNAUTHORIZED', 'Unauthorized', 401, cors);

  let body: any;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return fail('TOO_LARGE', 'Request too large.', 413, cors);
    body = JSON.parse(raw);
  } catch { return fail('BAD_REQUEST', 'Invalid JSON body.', 400, cors); }

  const lang = LANGS.includes(body?.lang) ? body.lang : 'tr';
  const tz = safeTimeZone(body?.tz);
  const isMap = body?.action === 'map';
  const text = !isMap && typeof body?.text === 'string' ? body.text.trim() : '';
  let image: { mime_type: string; data: string } | null = null;
  let headers: string[] | null = null, sample: string[][] = [];
  if (isMap) {
    // CSV column mapping: header row + a few data rows of a file the parser did not recognise
    headers = cleanHeaders(body?.headers);
    if (!headers) return fail('BAD_REQUEST', 'Send the header row.', 400, cors);
    sample = cleanSample(body?.sample, headers.length);
  } else {
    if (text.length > MAX_TEXT) return fail('BAD_REQUEST', 'Text must be at most ' + MAX_TEXT + ' characters.', 400, cors);
    if (body?.image) {
      const mt = String(body.image.mimeType || ''), data = String(body.image.data || '');
      if (!IMAGE_TYPES.includes(mt) || !data || data.length > MAX_IMAGE_B64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return fail('BAD_IMAGE', 'Unsupported or too large image.', 400, cors);
      image = { mime_type: mt, data };
    }
    if (!text && !image) return fail('BAD_REQUEST', 'Send a screenshot or a description.', 400, cors);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: take, error: takeErr } = await admin.rpc('ai_take_message', { p_user: user.id });
  if (takeErr || !take) return fail('SERVER', 'Usage check failed.', 500, cors);
  const usage = { used: take.used, limit: take.limit, premium: !!take.premium };
  if (!take.ok) return fail('LIMIT', 'Daily AI limit reached.', 429, cors, { usage });
  const refund = () => admin.rpc('ai_refund_message', { p_user: user.id }).then(() => {}, () => {});
  const refunded = { ...usage, used: Math.max(0, usage.used - 1) };

  try {
    const t0 = Date.now();
    if (isMap) {
      const cols = headers!.length;
      const valid: Judge = (t) => !!readMapping(t, cols);
      const system = mappingInstruction(lang), userText = mappingUserText(headers!, sample);
      const chained = await runChain([...GEMINI_MODELS, ...OPENROUTER_MODELS], (model, firstWordMs) => isOpenRouter(model)
        ? callOpenRouter(model, system, userText, null, firstWordMs, valid)
        : callGemini(model, system, userText, null, firstWordMs, valid), { health: HEALTH });
      const m = chained.got ? readMapping(chained.got.text, cols) : null;
      console.log('ai-trade-parse map ' + JSON.stringify({ ms: Date.now() - t0, model: chained.used || null, attempts: chained.attempts,
        columns: cols, rows: sample.length, mapped: m ? Object.keys(m.mapping).length : null }));
      if (!m) {
        await refund();
        const busy = chained.lastStatus === 429 || chained.lastStatus === 503;
        return fail(busy ? 'BUSY' : 'UPSTREAM', busy ? 'The AI service is busy. Try again in a minute.' : 'The AI service could not answer. Try again shortly.',
          busy ? 503 : 502, cors, { usage: refunded });
      }
      if (!Object.keys(m.mapping).length) await refund();
      return jsonRes({ ok: true, mapping: m.mapping, fillBased: m.fillBased, note: m.note, usage: Object.keys(m.mapping).length ? usage : refunded },
        200, { ...cors, 'Cache-Control': 'no-store' });
    }

    const system = extractInstruction(lang, todayIn(tz), cleanRecentSymbols(body?.recentSymbols));
    const userText = extractUserText(text, !!image);
    const models = [...GEMINI_MODELS, ...(image ? OPENROUTER_VISION_MODELS : OPENROUTER_MODELS)];
    const valid: Judge = (t) => !!readExtraction(t);
    const chained = await runChain(models, (model, firstWordMs) => isOpenRouter(model)
      ? callOpenRouter(model, system, userText, image, firstWordMs, valid)
      : callGemini(model, system, userText, image, firstWordMs, valid), { health: HEALTH });
    const { got, used, lastStatus } = chained;
    const out = got ? readExtraction(got.text) : null;
    // timings and counts only (no content, no user id)
    console.log('ai-trade-parse ' + JSON.stringify({ ms: Date.now() - t0, model: used || null, attempts: chained.attempts, image: !!image,
      text_chars: text.length, trades: out ? out.trades.length : null, dropped: out ? out.dropped : null }));
    if (!got || !out) {
      await refund();
      if (lastStatus === 429 || lastStatus === 503) return fail('BUSY', 'The AI service is busy. Try again in a minute.', 503, cors, { usage: refunded });
      return fail('UPSTREAM', 'The AI service could not answer. Try again shortly.', 502, cors, { usage: refunded });
    }
    // nothing found: the read is not counted
    if (!out.trades.length) await refund();
    return jsonRes({ ok: true, trades: out.trades, note: out.note, usage: out.trades.length ? usage : refunded }, 200, { ...cors, 'Cache-Control': 'no-store' });
  } catch (e) {
    await refund();
    console.error('ai-trade-parse error:', String((e as Error)?.name || 'Error'));
    return fail('SERVER', 'Something went wrong. Try again.', 500, cors, { usage: refunded });
  }
});
