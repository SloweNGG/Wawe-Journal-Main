// scripts/coach-prompt/measure.ts
// Runs the REAL AI coach function (supabase/functions/ai-coach/index.ts) on this machine with demo data and captures the
// exact request it would send to Gemini: how big each part of the prompt is and how much of it repeats from one request
// to the next (the part Gemini's implicit cache can reuse). No network, no live database: stubs.ts stands in for Supabase
// and the HTTP server, and fetch() is replaced so Gemini "answers" with a fixed text.
//
//   node scripts/seed-demo.mjs   (once: writes .demo-data/db.json, the demo trades)
//   deno run --allow-read --allow-env --allow-write=<dir> --import-map=scripts/coach-prompt/import_map.json \
//     scripts/coach-prompt/measure.ts [--json <dir>/out.json] [--dump <dir>]
//
// The demo data is stretched to the shape of a real active account (208 trades over 7 journals, 11 strategies, 3 backtest
// accounts with 91 trades, 3 prop challenges, a trading plan, ~240 economic news): only the sizes matter here.
// Tokens are estimated as characters / 4 (JSON and English prose); the real counts come from the "ai-coach tokens" log.

const ROOT = new URL('../../', import.meta.url);
const out = Deno.args.includes('--json') ? Deno.args[Deno.args.indexOf('--json') + 1] : null;

// ---------- demo data shaped like a real account ----------
const demo = JSON.parse(await Deno.readTextFile(new URL('.demo-data/db.json', ROOT))).tables;
const UID = demo.user_profiles[0].id;
const id = (p: string, n: number) => `0de30000-0000-4000-8000-${p}${String(n).padStart(12 - p.length, '0')}`;
const journals = Array.from({ length: 7 }, (_, i) => ({ ...demo.journals[0], id: i ? id('a', i) : demo.journals[0].id, name: i ? `Journal ${i + 1}` : demo.journals[0].name }));
const strategies = Array.from({ length: 11 }, (_, i) => ({ ...demo.strategies[i % demo.strategies.length], id: id('c', 100 + i),
  name: demo.strategies[i % demo.strategies.length].name + (i >= demo.strategies.length ? ` v${Math.floor(i / demo.strategies.length) + 1}` : ''),
  journal_id: journals[i % 7].id }));
const SYMBOLS = ['EURUSD', 'GBPUSD', 'XAUUSD', 'NAS100', 'US30', 'USDJPY', 'BTCUSD'];
const trades = Array.from({ length: 208 }, (_, i) => {
  const t = demo.trades[i % demo.trades.length];
  return { ...t, id: id('1', i), journal_id: journals[i % 7].id, strategy_id: strategies[i % 11].id, symbol: SYMBOLS[i % 7],
    notes: i < 118 ? (t.notes || 'Followed the plan, entry on the retest.') : null };
}).sort((a, b) => (a.trade_date < b.trade_date ? 1 : -1));
const btAccounts = [0, 1, 2].map((i) => ({ ...demo.backtest_accounts[0], id: id('b', i), name: ['EURUSD H1 Replay', 'Gold 15m', 'NAS100 5m'][i],
  symbol: ['EURUSD', 'XAUUSD', 'NAS100'][i], updated_at: '2026-11-2' + i }));
const btTrades = Array.from({ length: 91 }, (_, i) => {
  const t = trades[i];
  return { id: id('2', i), user_id: UID, backtest_account_id: btAccounts[i % 3].id, symbol: btAccounts[i % 3].symbol, direction: t.direction, lot: t.lot,
    entry_price: t.entry_price, exit_price: t.exit_price, stop_loss: t.stop_loss, take_profit: t.take_profit, initial_stop_loss: t.stop_loss,
    initial_take_profit: t.take_profit, entry_time: t.trade_date, exit_time: t.trade_date, pnl: t.pnl, commission: 0, gross_pnl: t.pnl,
    exit_reason: t.pnl > 0 ? 'tp' : 'sl', exit_ambiguous: false, section_no: 1 };
});
const props = [0, 1, 2].map((i) => ({ id: id('d', i), user_id: UID, is_active: true, journal_id: journals[i].id, template_key: 'ftmo',
  starting_balance: 10000 * (i + 1), start_date: '2026-10-01', phase_index: 0, reset_tz: 'Europe/Prague', time_shift_hours: 0,
  rules: { phase_name: 'Phase 1', daily_loss_limit_pct: 5, max_loss_limit_pct: 10, profit_target_pct: 10, min_trading_days: 4 } }));
const now = Date.now();
const CUR = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'NZD', 'CNY'];
const econ = Array.from({ length: 243 }, (_, i) => ({ id: 'e' + i, title: ['CPI m/m', 'Unemployment Claims', 'Retail Sales m/m', 'PMI', 'Rate Decision', 'GDP q/q'][i % 6],
  currency: CUR[i % CUR.length], impact: ['high', 'medium', 'low'][i % 3], event_at: new Date(now - 70 * 3600e3 + i * 3.4 * 3600e3).toISOString(),
  forecast: '0.2%', previous: '0.3%', impacts: { ff: ['high', 'medium', 'low'][i % 3] } }));
const plan = { coach: 'kai', max_trades_per_day: 3, max_daily_loss: 300, max_loss_per_trade: 150, require_stop: true, no_trading_after: 20,
  goal: { kind: 'max_trades_day', target: 3, week: '2026-11-16' } };

// earlier turns like the stored ones (live averages, 2026-11-22: question ~45 chars, answer ~870, thought signature ~1,400)
const ANSWER = 'Son 30 işlemine baktım. Kazanma oranın %54, ortalama kazancın ortalama kaybının 1,4 katı. '.repeat(9).slice(0, 870);
const SIG = 'Q2l'.repeat(470);
function conversation(cid: string, turns: number) {
  const rows = [];
  for (let i = 0; i < turns; i++) {
    const at = new Date(now - (turns - i) * 60e3).toISOString();
    if (i % 2 === 0) rows.push({ id: cid + 'u' + i, conversation_id: cid, user_id: UID, role: 'user', content: 'Bu hafta neden zarar ettim, ne yapmalıyım?', had_image: false, steps: null, model: null, created_at: at });
    else rows.push({ id: cid + 'm' + i, conversation_id: cid, user_id: UID, role: 'model', content: ANSWER, had_image: false, model: 'gemini-3.5-flash-lite', created_at: at,
      steps: [{ type: 'thought', signature: SIG }, { type: 'model_output', content: [{ type: 'text', text: ANSWER }] }] });
  }
  return rows;
}
const CONV = { c10: '11111111-1111-4111-8111-111111111110', c20: '11111111-1111-4111-8111-111111111120', c40: '11111111-1111-4111-8111-111111111140' };
(globalThis as any).__coachUserId = UID;
(globalThis as any).__coachDb = {
  journals: journals.map((j) => ({ ...j, user_id: UID })), strategies: strategies.map((s) => ({ ...s, user_id: UID })), trades: trades.map((t) => ({ ...t, user_id: UID })),
  backtest_accounts: btAccounts.map((a) => ({ ...a, user_id: UID })), backtest_account_trades: btTrades, prop_accounts: props,
  coach_settings: [{ user_id: UID, plan, updated_at: new Date(now).toISOString(), time_zone: 'Europe/Istanbul' }],
  user_profiles: [{ id: UID, preferred_currency: 'USD' }], econ_events: econ, econ_feed_state: [{ id: 1, last_success_at: new Date(now - 600e3).toISOString() }],
  ai_conversations: Object.values(CONV).map((c) => ({ id: c, user_id: UID, journal_id: null })),
  ai_messages: [...conversation(CONV.c10, 10), ...conversation(CONV.c20, 20), ...conversation(CONV.c40, 40)],
};

// ---------- fetch: Gemini answers with a fixed text, everything else is offline ----------
const captured: any[] = [];
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url instanceof Request ? url.url : url);
  if (!u.includes('generativelanguage.googleapis.com')) return new Response('offline', { status: 503 });
  const body = JSON.parse(String(init?.body || '{}'));
  captured.push(body);
  const ev = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
  const text = 'Bu bir ölçüm cevabıdır; koçun gerçek cevabı değildir. Prompt boyutu ölçülüyor, içerik önemsiz. Teşekkürler.';
  const sse = ev({ event_type: 'step.start', index: 0, step: { type: 'model_output' } }) + ev({ event_type: 'step.delta', index: 0, delta: { type: 'text', text } })
    + ev({ event_type: 'step.stop', index: 0 }) + ev({ event_type: 'interaction.completed', interaction: { status: 'completed', usage: { total_input_tokens: 1, total_output_tokens: 1 } } }) + 'data: [DONE]\n\n';
  return new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}) as typeof fetch;

const logs: string[] = [];
const origLog = console.log;
console.log = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };

Deno.env.set('SUPABASE_URL', 'http://local'); Deno.env.set('SUPABASE_ANON_KEY', 'x'); Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'x');
Deno.env.set('GEMINI_API_KEY', 'local-measure'); Deno.env.delete('OPENROUTER_API_KEY');
const mod = await import('../../supabase/functions/ai-coach/index.ts');
const { COACH_KNOWLEDGE } = await import('../../supabase/functions/_shared/coach-knowledge.ts');
const handler = (globalThis as any).__coachHandler as (r: Request) => Promise<Response>;
if (!handler) throw new Error('ai-coach did not call serve()');

async function ask(body: Record<string, unknown>) {
  const n = captured.length;
  const res = await handler(new Request('http://local/ai-coach', { method: 'POST', headers: { Authorization: 'Bearer local', 'Content-Type': 'application/json' },
    body: JSON.stringify({ lang: 'tr', tz: 'Europe/Istanbul', message: 'Bu hafta neden zarar ettim?', ...body }) }));
  const j = await res.json();
  if (!j.ok) throw new Error('ai-coach answered ' + JSON.stringify(j));
  return captured[n];
}

const est = (chars: number) => Math.round(chars / 4);
function commonPrefix(a: string, b: string) { let i = 0; const n = Math.min(a.length, b.length); while (i < n && a[i] === b[i]) i++; return i; }
// what Gemini reads, in order: system instruction, then the input turns
const wire = (req: any) => JSON.stringify(req.system_instruction) + JSON.stringify(req.input);

function breakdown(req: any) {
  const sys: string = req.system_instruction;
  const k = sys.indexOf(COACH_KNOWLEDGE), d = sys.indexOf('\nTrader data (JSON');
  const dataJson = d >= 0 ? sys.slice(sys.indexOf('\n', d + 1) + 1) : '';
  const input = req.input as any[];
  const history = input.slice(0, -1);
  const last = JSON.stringify(input[input.length - 1]);
  // the per-request [App context] line at the start of the latest message (index.ts); 0 before it existed
  const text = String(input[input.length - 1]?.content?.[0]?.text || '');
  const appContext = text.startsWith('[App context]') ? text.split('\n')[0].length : 0;
  const sigChars = JSON.stringify(history).match(/"signature":"[^"]*"/g)?.join('').length || 0;
  let dataKeys: Record<string, number> = {};
  try { const o = JSON.parse(dataJson); dataKeys = Object.fromEntries(Object.entries(o).map(([key, v]) => [key, JSON.stringify(v).length]).sort((a, b) => b[1] - a[1])); } catch (_) { /* not JSON */ }
  return {
    system: sys.length, rules_and_intro: k >= 0 ? k : null, knowledge: k >= 0 ? COACH_KNOWLEDGE.length : null,
    data: dataJson.length, history: JSON.stringify(history).length, history_turns: history.length, signatures: sigChars,
    message: last.length, app_context: appContext, total: wire(req).length, dataKeys,
  };
}

const runs: Record<string, any> = {};
runs.new_chat = await ask({});
runs.history_10 = await ask({ conversationId: CONV.c10 });
runs.history_20 = await ask({ conversationId: CONV.c20 });
runs.history_40 = await ask({ conversationId: CONV.c40 });
// for the cache: the same chat one message later (the turn just answered is stored, the clock moved 2 minutes), another
// coach, another language, another member's data
const RealNow = Date.now;
function nextTurn(cid: string, message: string) {
  const db = (globalThis as any).__coachDb, at = new Date(RealNow() + 1000).toISOString();
  db.ai_messages.push(
    { id: cid + 'nu', conversation_id: cid, user_id: UID, role: 'user', content: message, had_image: false, steps: null, model: null, created_at: at },
    { id: cid + 'nm', conversation_id: cid, user_id: UID, role: 'model', content: ANSWER, had_image: false, model: 'gemini-3.5-flash-lite', created_at: at + 'z',
      steps: [{ type: 'thought', signature: SIG }, { type: 'model_output', content: [{ type: 'text', text: ANSWER }] }] });
}
nextTurn(CONV.c10, 'Bu hafta neden zarar ettim?');
nextTurn(CONV.c20, 'Bu hafta neden zarar ettim?');
nextTurn(CONV.c40, 'Bu hafta neden zarar ettim?');
Date.now = () => RealNow() + 120_000;
const again10 = await ask({ conversationId: CONV.c10, message: 'Peki risk yönetimimi nasıl düzeltirim?' });
const again = await ask({ conversationId: CONV.c20, message: 'Peki risk yönetimimi nasıl düzeltirim?' });
const again40 = await ask({ conversationId: CONV.c40, message: 'Peki risk yönetimimi nasıl düzeltirim?' });
Date.now = RealNow;
const otherCoach = await ask({ coach: 'mira' });
const otherLang = await ask({ lang: 'en' });
(globalThis as any).__coachDb.trades = (globalThis as any).__coachDb.trades.slice(40);    // a different member's journal
const otherData = await ask({});
console.log = origLog;

const result: any = { measured_at: new Date(now).toISOString(), scenarios: {}, cache_prefix: {} };
for (const [name, req] of Object.entries(runs)) result.scenarios[name] = breakdown(req);
const pre = (a: any, b: any) => { const c = commonPrefix(wire(a), wire(b)); return { chars: c, est_tokens: est(c), pct_of_request: Math.round(c / wire(b).length * 100) }; };
result.cache_prefix = {
  next_message_short_chat: pre(runs.history_10, again10),
  next_message_long_chat: pre(runs.history_20, again),
  // 40 -> 42 messages: the history window's start stays put within one step (20 -> 22 crosses a step, so its start moves)
  next_message_40_chat: pre(runs.history_40, again40),
  other_coach: pre(runs.new_chat, otherCoach),
  other_language: pre(runs.new_chat, otherLang),
  other_member_data: pre(runs.new_chat, otherData),
};
result.token_log = logs.filter((l) => l.startsWith('ai-coach tokens')).slice(0, 1);

const s = result.scenarios;
console.log('\nAI coach request size (demo data shaped like an active account; tokens ~ chars/4)\n');
console.log('scenario      total chars  ~tokens   system  knowledge  data   history (signatures)  turns');
for (const [n, b] of Object.entries(s) as [string, any][]) {
  console.log(`${n.padEnd(13)} ${String(b.total).padStart(11)}  ${String(est(b.total)).padStart(7)}  ${String(b.system).padStart(7)}  ${String(b.knowledge).padStart(9)}  ${String(b.data).padStart(5)}  ${String(b.history).padStart(7)} (${b.signatures})  ${String(b.history_turns).padStart(12)}`);
}
console.log('\nbiggest parts of the trader data (chars):');
for (const [k, v] of Object.entries(s.new_chat.dataKeys).slice(0, 14)) console.log(`  ${k.padEnd(28)} ${v}`);
console.log('\nrepeated prefix (what an implicit cache could reuse):');
for (const [k, v] of Object.entries(result.cache_prefix) as [string, any][]) console.log(`  ${k.padEnd(24)} ${String(v.chars).padStart(7)} chars ~${v.est_tokens} tokens (${v.pct_of_request}% of the request)`);
console.log('\nlog line check:', result.token_log[0] ? result.token_log[0].slice(0, 160) + '...' : 'MISSING');
if (out) { await Deno.writeTextFile(out, JSON.stringify(result, null, 2)); console.log('\nwritten', out); }
// --dump <dir>: the captured requests (demo data only) for reading: new chat and a 20-message chat
const dump = Deno.args.includes('--dump') ? Deno.args[Deno.args.indexOf('--dump') + 1] : null;
if (dump) for (const n of ['new_chat', 'history_20']) await Deno.writeTextFile(`${dump}/${n}.request.json`, JSON.stringify(runs[n], null, 2));
void mod;
