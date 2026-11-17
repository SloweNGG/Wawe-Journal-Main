// supabase/functions/_shared/econ-feed.ts
// Keeps public.econ_events (migration 202611170001) in step with Forex Factory's weekly export (econ-calendar.ts) and
// reads it back. Used by econ-calendar (navbar badge) and ai-coach. Needs the service-role client.
//   - fresh enough: last_success_at within REFRESH_MS -> no fetch.
//   - otherwise one caller claims the refresh in econ_feed_state (last_attempt_at older than CLAIM_MS), the others go on
//     with the rows they have: the export allows ~2 requests per 5 minutes and a refused fetch must not be retried soon.
//   - a good export replaces the week: upsert every event, delete the ones in its time range that are gone (rescheduled
//     or removed), drop events older than KEEP_DAYS. A bad answer (HTML "Request Denied", timeout) keeps the old rows.

import { FEED_URL, parseFeed, type EconEvent } from './econ-calendar.ts';

export const REFRESH_MS = 30 * 60_000;
export const CLAIM_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 6_000;
const KEEP_DAYS = 30;
const COLS = 'id, title, currency, impact, event_at, forecast, previous';

export interface FeedState { last_attempt_at: string | null; last_success_at: string | null; last_status: string | null }

// ids of stored events inside the export's time range that the export no longer has
export function staleIds(stored: { id: string }[], fresh: EconEvent[]): string[] {
  const keep = new Set(fresh.map((e) => e.id));
  return stored.map((r) => r.id).filter((id) => !keep.has(id));
}

export async function ensureFresh(admin: any, now = Date.now()): Promise<FeedState | null> {
  const { data: st } = await admin.from('econ_feed_state').select('last_attempt_at, last_success_at, last_status').eq('id', 1).maybeSingle();
  if (!st) return null;                                                   // table missing (migration not applied)
  if (st.last_success_at && now - Date.parse(st.last_success_at) < REFRESH_MS) return st;
  const nowIso = new Date(now).toISOString();
  const { data: claimed } = await admin.from('econ_feed_state').update({ last_attempt_at: nowIso })
    .eq('id', 1).lt('last_attempt_at', new Date(now - CLAIM_MS).toISOString()).select('id');
  if (!claimed || !claimed.length) return st;                             // another caller is fetching, or tried just now
  const status = await refresh(admin, now);
  const next = { last_attempt_at: nowIso, last_success_at: status === 'ok' ? nowIso : st.last_success_at, last_status: status };
  await admin.from('econ_feed_state').update(next).eq('id', 1);
  if (status !== 'ok') console.error('econ-feed: refresh failed:', status);
  return next;
}

async function refresh(admin: any, now: number): Promise<string> {
  let raw: unknown;
  const ac = new AbortController(), timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(FEED_URL, { signal: ac.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return `http ${res.status}`;
    const text = await res.text();
    try { raw = JSON.parse(text); } catch (_) { return 'not json'; }      // the "Request Denied" page is HTML
  } catch (_) {
    return ac.signal.aborted ? 'timeout' : 'network';
  } finally { clearTimeout(timer); }
  const events = parseFeed(raw);
  if (!events) return 'not a calendar';
  if (!events.length) return 'empty';
  const at = new Date(now).toISOString();
  const { error: ue } = await admin.from('econ_events').upsert(events.map((e) => ({ ...e, updated_at: at })), { onConflict: 'id' });
  if (ue) return 'upsert failed';
  const times = events.map((e) => e.event_at).sort();
  const { data: inRange } = await admin.from('econ_events').select('id').gte('event_at', times[0]).lte('event_at', times[times.length - 1]);
  const gone = staleIds(inRange || [], events);
  if (gone.length) await admin.from('econ_events').delete().in('id', gone);
  await admin.from('econ_events').delete().lt('event_at', new Date(now - KEEP_DAYS * 86400e3).toISOString());
  return 'ok';
}

export async function loadEvents(admin: any, fromIso: string, toIso: string): Promise<EconEvent[]> {
  const { data } = await admin.from('econ_events').select(COLS).gte('event_at', fromIso).lte('event_at', toIso)
    .order('event_at', { ascending: true }).limit(500);
  return (data || []) as EconEvent[];
}

// for ai-coach: the cached rows around now and when they were loaded, read only (the navbar badge keeps them fresh; a
// chat must not wait for Forex Factory). null when the tables are missing.
export async function readCalendar(admin: any, now = Date.now()): Promise<{ events: EconEvent[]; fetchedAt: string | null } | null> {
  const [{ data: st, error: se }, events] = await Promise.all([
    admin.from('econ_feed_state').select('last_success_at').eq('id', 1).maybeSingle(),
    loadEvents(admin, new Date(now - 73 * 3600e3).toISOString(), new Date(now + 8 * 86400e3).toISOString()),
  ]);
  if (se || !st) return null;
  return { events, fetchedAt: st.last_success_at || null };
}
