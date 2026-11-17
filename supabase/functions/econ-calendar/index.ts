// supabase/functions/econ-calendar/index.ts
// Economic calendar for the navbar countdown badge (public/components/econ-calendar/econ-calendar.js).
//   POST {} (or GET) with the member's JWT -> { ok, events: [{ id, title, currency, impact, impacts, event_at, forecast,
//     previous }], fetched_at, covers_until, pairs, catalog }: events from 24 h ago to the end of the cached week, oldest first.
//   POST { from, to } (ISO times, at most 45 days apart: _shared/econ-calendar.ts parseRange): the events of that range instead (the trading calendar
//   page asks for the month on screen). Past weeks are kept 400 days (_shared/econ-feed.ts KEEP_DAYS); the exports have
//   no history, so news before 2026-11-15 (when the cache started) is not there.
//   pairs: the member's pairs from their last 300 trades ([{ label: "EUR/USD", currencies: ["EUR","USD"] }], most traded
//   first); catalog: popular pairs to pick from. The badge filters by pair = the news of its currencies
//   (_shared/econ-calendar.ts pairLabel / symbolCurrencies; the mapping lives only on the server).
//   The data is Forex Factory's weekly export cached in public.econ_events (migration 202611170001); a call refreshes it
//   when it is older than 30 minutes (_shared/econ-feed.ts: one refresh at a time, at most one try per 5 minutes).
//   covers_until: the last event the export has; the export only has this week, so after it nothing is known yet.
// Security: a signed-in member is required (the data is public, the refresh is not something to hand to anyone);
// the tables are service-role only. verify_jwt stays on.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, jsonRes } from '../_shared/ctrader.ts';
import { ensureFresh, loadEvents } from '../_shared/econ-feed.ts';
import { memberPairs, pairOf, PAIR_CATALOG, parseRange } from '../_shared/econ-calendar.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';


serve(async (req: Request) => {
  const cors = getCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST' && req.method !== 'GET') return jsonRes({ ok: false, code: 'METHOD' }, 405, cors);

  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return jsonRes({ ok: false, code: 'UNAUTHORIZED' }, 401, cors);
  const { data: { user }, error } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY).auth.getUser(auth.substring(7));
  if (error || !user) return jsonRes({ ok: false, code: 'UNAUTHORIZED' }, 401, cors);

  let body: any = null;
  if (req.method === 'POST') { try { body = await req.json(); } catch (_) { body = null; } }
  const range = parseRange(body);
  if (range === 'bad') return jsonRes({ ok: false, code: 'BAD_RANGE' }, 400, cors);

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const state = await ensureFresh(admin);
    if (!state) return jsonRes({ ok: false, code: 'NOT_CONFIGURED' }, 503, cors);
    const now = Date.now();
    const [events, { data: trades }] = await Promise.all([
      range ? loadEvents(admin, new Date(range.from).toISOString(), new Date(range.to).toISOString())
        : loadEvents(admin, new Date(now - 86400e3).toISOString(), new Date(now + 14 * 86400e3).toISOString()),
      admin.from('trades').select('symbol').eq('user_id', user.id).order('trade_date', { ascending: false }).limit(300),
    ]);
    return jsonRes({
      ok: true, events,
      fetched_at: state.last_success_at,
      covers_until: events.length ? events[events.length - 1].event_at : null,
      pairs: memberPairs((trades || []).map((t: any) => String(t.symbol || ''))),
      catalog: PAIR_CATALOG.map(pairOf),
    }, 200, { ...cors, 'Cache-Control': 'private, max-age=60' });
  } catch (_) {
    console.error('econ-calendar error');
    return jsonRes({ ok: false, code: 'SERVER' }, 500, { ...cors, 'Cache-Control': 'no-store' });
  }
});
