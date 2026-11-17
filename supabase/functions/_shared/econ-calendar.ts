// supabase/functions/_shared/econ-calendar.ts
// Economic calendar (migration 202611170001, table public.econ_events): Forex Factory's weekly calendar export
// https://nfs.faireconomy.media/ff_calendar_thisweek.json, read by econ-calendar (navbar badge) and ai-coach.
//   - The export: [{ title, country (currency code), date (ISO with the New York offset), impact: High|Medium|Low|Holiday,
//     forecast, previous }] for this week (Sunday-Saturday, New York). No actual values, no next week (that file is 404).
//   - It allows about 2 requests per 5 minutes per IP and answers an HTML "Request Denied" page beyond that, so it is
//     fetched by the server only (econ-feed.ts: at most once per REFRESH_MS), never by browsers.
// Pure (Node tests): parsing, ids, the currencies a member trades, the coach's slice.

export const FEED_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
export const IMPACTS = ['high', 'medium', 'low', 'holiday'] as const;
export type Impact = typeof IMPACTS[number];

export interface EconEvent { id: string; title: string; currency: string; impact: Impact; event_at: string; forecast: string | null; previous: string | null }

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF', 'CNY'];

// short stable id from the fields that identify an event (a rescheduled event gets a new id; the old one is removed)
export function eventId(currency: string, title: string, at: string): string {
  const s = `${currency}|${title}|${at}`;
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

const clean = (v: unknown, max: number) => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return s ? s.slice(0, max) : null;
};

// the export -> rows; anything malformed is skipped. null = not a calendar at all (e.g. the "Request Denied" page).
export function parseFeed(raw: unknown): EconEvent[] | null {
  if (!Array.isArray(raw)) return null;
  const out: EconEvent[] = [], seen = new Set<string>();
  for (const e of raw as any[]) {
    const title = clean(e?.title, 160), currency = clean(e?.country, 8)?.toUpperCase() || null;
    const impact = String(e?.impact || '').toLowerCase() as Impact;
    const t = Date.parse(String(e?.date || ''));
    if (!title || !currency || !/^[A-Z]{3}$/.test(currency) || !IMPACTS.includes(impact) || !Number.isFinite(t)) continue;
    const at = new Date(t).toISOString();
    const id = eventId(currency, title, at);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, title, currency, impact, event_at: at, forecast: clean(e?.forecast, 24), previous: clean(e?.previous, 24) });
  }
  return out;
}

// currencies whose news moves a symbol: forex pairs by their two codes, metals/crypto/US indices and oil -> USD, other
// indices by their country. Unknown symbols add nothing.
const INDEX_CCY: [RegExp, string][] = [
  [/^(US|NAS|NDX|SPX|SP500|US500|US30|US100|DJ|DOW|USTEC|WS30|NQ|ES|YM|RTY|US2000)/, 'USD'],
  [/^(GER|DE|DAX|EU50|STOXX|ESTX|FRA|CAC|SPA|IBEX|ITA|NETH|AEX)/, 'EUR'],
  [/^(UK|FTSE|GB)/, 'GBP'], [/^(JP|JPN|NIK|NKY)/, 'JPY'], [/^(AUS|ASX|AU200)/, 'AUD'], [/^(CN|CHINA|HK)/, 'CNY'],
  [/^(XAU|XAG|XPT|XPD|GOLD|SILVER|BTC|ETH|SOL|XRP|LTC|USOIL|UKOIL|WTI|BRENT|OIL|XTI|XBR|CL|NG|NATGAS)/, 'USD'],
];
export function symbolCurrencies(symbol: string): string[] {
  const s = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const a = s.slice(0, 3), b = s.slice(3, 6);
  if (CURRENCIES.includes(a) && CURRENCIES.includes(b)) return [a, b];
  for (const [re, c] of INDEX_CCY) if (re.test(s)) return [c];
  // an exotic pair (USDTRY, EURPLN): the major side only
  return s.length >= 6 ? [a, b].filter((c) => CURRENCIES.includes(c)) : [];
}

// the member's currencies from their symbols, most traded first; [] when nothing is known
export function tradedCurrencies(symbols: string[]): string[] {
  const n = new Map<string, number>();
  for (const s of symbols) for (const c of symbolCurrencies(s)) n.set(c, (n.get(c) || 0) + 1);
  return [...n].sort((x, y) => y[1] - x[1]).map(([c]) => c);
}

// local "YYYY-MM-DD HH:mm" in a zone (the coach writes times the member reads)
export function localTime(iso: string, tz: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

export const COACH_EVENTS_MAX = 30;

// what the coach sees: high and medium events from 2 h ago to 7 days ahead in the member's currencies (all currencies
// when none are known), times local, at most COACH_EVENTS_MAX (high first when cutting).
export function coachCalendar(events: EconEvent[], currencies: string[], now: number, tz: string, fetchedAt: string | null) {
  const from = now - 2 * 3600e3, to = now + 7 * 86400e3;
  const want = new Set(currencies);
  let list = events.filter((e) => (e.impact === 'high' || e.impact === 'medium') && (!want.size || want.has(e.currency)))
    .filter((e) => { const t = Date.parse(e.event_at); return t >= from && t <= to; })
    .sort((a, b) => Date.parse(a.event_at) - Date.parse(b.event_at));
  if (list.length > COACH_EVENTS_MAX) {
    const keep = new Set(list.filter((e) => e.impact === 'high').slice(0, COACH_EVENTS_MAX).map((e) => e.id));
    for (const e of list) { if (keep.size >= COACH_EVENTS_MAX) break; keep.add(e.id); }
    list = list.filter((e) => keep.has(e.id));
  }
  return {
    source: 'Forex Factory',
    time_zone: tz,
    now_local: localTime(new Date(now).toISOString(), tz),
    currencies: currencies.length ? currencies : 'all',
    // the export only has this week: nothing after this time is known yet (not "no news")
    covers_until_local: events.length ? localTime(events.reduce((m, e) => (e.event_at > m ? e.event_at : m), events[0].event_at), tz) : null,
    ...(fetchedAt ? {} : { note: 'calendar not loaded yet' }),
    events: list.map((e) => ({
      when_local: localTime(e.event_at, tz),
      minutes_from_now: Math.round((Date.parse(e.event_at) - now) / 60000),
      currency: e.currency, title: e.title, impact: e.impact,
      ...(e.forecast ? { forecast: e.forecast } : {}), ...(e.previous ? { previous: e.previous } : {}),
    })),
  };
}
