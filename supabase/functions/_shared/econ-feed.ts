// supabase/functions/_shared/econ-feed.ts
// Keeps public.econ_events (migrations 202611170001-0002) in step with the four sites' weekly exports (econ-calendar.ts
// SOURCES: Forex Factory, CryptoCraft, MetalsMine, EnergyExch) and reads it back. Used by econ-calendar (navbar badge) and
// ai-coach. Needs the service-role client.
//   - fresh enough: last_success_at within REFRESH_MS -> no fetch.
//   - otherwise one caller claims the refresh in econ_feed_state (last_attempt_at older than CLAIM_MS), the others go on
//     with the rows they have: each export allows ~2 requests per 5 minutes and a refused fetch must not be retried soon.
//   - the four exports are fetched in parallel; a site that answers badly (HTML "Request Denied", timeout) keeps its
//     events from the stored rows (impacts[site]). The merged week replaces the stored one: upsert every event, delete the
//     ones in its time range that are gone (rescheduled or removed), drop events older than KEEP_DAYS.
//   - last_status: "ok", or "partial: mm not json" (still a success: the refused site's events are the stored ones), or
//     every site's error when none answered.

import { SOURCES, SOURCE_KEYS, parseFeed, mergeFeeds, type EconEvent, type Source } from './econ-calendar.ts';

export const REFRESH_MS = 30 * 60_000;
export const CLAIM_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 6_000;
// past weeks stay for the trading calendar page (news of the days the member traded); ~170 events a week
const KEEP_DAYS = 400;
const COLS = 'id, title, currency, impact, event_at, forecast, previous, impacts';

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
  const good = status === 'ok' || status.startsWith('partial');
  const next = { last_attempt_at: nowIso, last_success_at: good ? nowIso : st.last_success_at, last_status: status.slice(0, 80) };
  await admin.from('econ_feed_state').update(next).eq('id', 1);
  if (status !== 'ok') console.error('econ-feed: refresh', good ? 'partial:' : 'failed:', status);
  return next;
}

async function fetchSource(src: Source): Promise<{ events: EconEvent[] | null; status: string }> {
  const ac = new AbortController(), timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(SOURCES[src].url, { signal: ac.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return { events: null, status: `${src} http ${res.status}` };
    let raw: unknown;
    try { raw = JSON.parse(await res.text()); } catch (_) { return { events: null, status: `${src} not json` }; }   // "Request Denied" page
    const events = parseFeed(raw, src);
    if (!events) return { events: null, status: `${src} not a calendar` };
    return { events, status: 'ok' };
  } catch (_) {
    return { events: null, status: `${src} ${ac.signal.aborted ? 'timeout' : 'network'}` };
  } finally { clearTimeout(timer); }
}

async function refresh(admin: any, now: number): Promise<string> {
  const got = await Promise.all(SOURCE_KEYS.map((k) => fetchSource(k)));
  const failed = got.filter((g) => !g.events).map((g) => g.status);
  if (failed.length === SOURCE_KEYS.length) return failed.join(', ');
  // a refused site: its events of the stored week, with its own impact
  let stored: EconEvent[] = [];
  if (failed.length) {
    const { data } = await admin.from('econ_events').select(COLS).gte('event_at', new Date(now - 8 * 86400e3).toISOString()).limit(1000);
    stored = (data || []) as EconEvent[];
  }
  const lists = SOURCE_KEYS.map((k, i) => got[i].events ||
    stored.filter((r) => r.impacts && r.impacts[k]).map((r) => ({ ...r, impact: r.impacts![k]!, impacts: { [k]: r.impacts![k]! } })));
  const events = mergeFeeds(lists);
  if (!events.length) return 'empty';
  const at = new Date(now).toISOString();
  const { error: ue } = await admin.from('econ_events').upsert(events.map((e) => ({ ...e, impacts: e.impacts || {}, updated_at: at })), { onConflict: 'id' });
  if (ue) return 'upsert failed';
  const times = events.map((e) => e.event_at).sort();
  const { data: inRange } = await admin.from('econ_events').select('id').gte('event_at', times[0]).lte('event_at', times[times.length - 1]);
  const gone = staleIds(inRange || [], events);
  if (gone.length) await admin.from('econ_events').delete().in('id', gone);
  await admin.from('econ_events').delete().lt('event_at', new Date(now - KEEP_DAYS * 86400e3).toISOString());
  return failed.length ? 'partial: ' + failed.join(', ') : 'ok';
}

export async function loadEvents(admin: any, fromIso: string, toIso: string): Promise<EconEvent[]> {
  const { data } = await admin.from('econ_events').select(COLS).gte('event_at', fromIso).lte('event_at', toIso)
    .order('event_at', { ascending: true }).limit(1000);   // PostgREST's cap; a 45-day range is ~900
  return (data || []) as EconEvent[];
}

// for ai-coach: the cached rows around now and when they were loaded, read only (the navbar badge keeps them fresh; a
// chat must not wait for the exports). null when the tables are missing.
export async function readCalendar(admin: any, now = Date.now()): Promise<{ events: EconEvent[]; fetchedAt: string | null } | null> {
  const [{ data: st, error: se }, events] = await Promise.all([
    admin.from('econ_feed_state').select('last_success_at').eq('id', 1).maybeSingle(),
    loadEvents(admin, new Date(now - 73 * 3600e3).toISOString(), new Date(now + 8 * 86400e3).toISOString()),
  ]);
  if (se || !st) return null;
  return { events, fetchedAt: st.last_success_at || null };
}
