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

// Pairs as the member reads them: "EUR/USD", "XAU/USD", "BTC/USD", indices by their name ("NAS100" from "NAS100.cash").
// The badge filters by pair (a pair = the news of its currencies) and shows which of the member's pairs an event moves.
const PAIR_SIDE = [...CURRENCIES, 'XAU', 'XAG', 'BTC', 'ETH'];
export function pairLabel(symbol: string): string {
  const raw = String(symbol || '').toUpperCase().trim();
  const m = raw.match(/^([A-Z]{3})[\/_-]?([A-Z]{3})/);
  if (m && PAIR_SIDE.includes(m[1]) && PAIR_SIDE.includes(m[2])) return m[1] + '/' + m[2];
  if (m && /^(BTC|ETH)$/.test(m[1]) && /^USD/.test(raw.slice(3).replace(/[\/_-]/, ''))) return m[1] + '/USD';   // BTCUSDT
  return raw.split(/[.\s_]/)[0].replace(/[^A-Z0-9]/g, '').slice(0, 12);
}
export interface Pair { label: string; currencies: string[] }
export const PAIR_CATALOG = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'NZD/USD', 'GBP/JPY', 'NAS100', 'US30', 'GER40', 'BTC/USD'];
export function pairOf(label: string): Pair { return { label, currencies: symbolCurrencies(label) }; }
// the member's pairs from their symbols, most traded first (max 8); symbols whose news currency is unknown are left out
export function memberPairs(symbols: string[], max = 8): Pair[] {
  const n = new Map<string, number>();
  for (const s of symbols) { const l = pairLabel(s); if (l && symbolCurrencies(l).length) n.set(l, (n.get(l) || 0) + 1); }
  return [...n].sort((x, y) => y[1] - x[1]).slice(0, max).map(([l]) => pairOf(l));
}
export const affects = (pairs: Pair[], currency: string) => pairs.filter((p) => p.currencies.includes(currency)).map((p) => p.label);

// local "YYYY-MM-DD HH:mm" in a zone (the coach writes times the member reads)
export function localTime(iso: string, tz: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

export const COACH_EVENTS_MAX = 40;

// What the coach reads: from 3 days ago (released this week, no actual values) to 7 days ahead. Every high impact event
// (any currency) plus medium ones in the member's currencies (all when none are known); each with the member's pairs it
// moves. Over COACH_EVENTS_MAX: upcoming events in the member's currencies first, then other upcoming high, then released.
export function coachCalendar(events: EconEvent[], symbols: string[], now: number, tz: string, fetchedAt: string | null) {
  const from = now - 72 * 3600e3, to = now + 7 * 86400e3;
  const pairs = memberPairs(symbols), mineCcy = new Set(tradedCurrencies(symbols));
  const mine = (c: string) => !mineCcy.size || mineCcy.has(c);
  const rank = (e: EconEvent) => {
    const up = Date.parse(e.event_at) >= now - 2 * 3600e3;
    return up ? (mine(e.currency) ? (e.impact === 'high' ? 0 : 1) : 2) : (mine(e.currency) ? 3 : 4);
  };
  let list = events.filter((e) => { const t = Date.parse(e.event_at); return t >= from && t <= to; })
    .filter((e) => e.impact === 'high' || (e.impact === 'medium' && mine(e.currency)));
  if (list.length > COACH_EVENTS_MAX) {
    list = list.map((e, i) => ({ e, i, r: rank(e) })).sort((a, b) => a.r - b.r || a.i - b.i).slice(0, COACH_EVENTS_MAX).map((x) => x.e);
  }
  list.sort((a, b) => Date.parse(a.event_at) - Date.parse(b.event_at));
  return {
    source: 'Forex Factory',
    time_zone: tz,
    now_local: localTime(new Date(now).toISOString(), tz),
    my_pairs: pairs.map((p) => p.label),
    my_currencies: mineCcy.size ? [...mineCcy] : 'all',
    // the export only has this week: nothing after this time is known yet (not "no news")
    covers_until_local: events.length ? localTime(events.reduce((m, e) => (e.event_at > m ? e.event_at : m), events[0].event_at), tz) : null,
    ...(fetchedAt ? {} : { note: 'calendar not loaded yet' }),
    events: list.map((e) => {
      const mins = Math.round((Date.parse(e.event_at) - now) / 60000), hit = affects(pairs, e.currency);
      return {
        when_local: localTime(e.event_at, tz), minutes_from_now: mins, status: mins >= 0 ? 'upcoming' : 'released',
        currency: e.currency, title: e.title, impact: e.impact,
        ...(e.forecast ? { forecast: e.forecast } : {}), ...(e.previous ? { previous: e.previous } : {}),
        ...(hit.length ? { moves_my_pairs: hit } : {}),
      };
    }),
  };
}
