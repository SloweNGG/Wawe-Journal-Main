// supabase/functions/_shared/econ-calendar.ts
// Economic calendar (migrations 202611170001 + 202611170002, table public.econ_events): the weekly calendar exports of
// Fair Economy's four sites, read by econ-calendar (navbar badge) and ai-coach.
//   - Forex Factory (macro news, every pair), CryptoCraft (crypto), MetalsMine (metals: adds e.g. LME copper stocks, ZAR
//     CPI, platinum reports), EnergyExch (energy: adds e.g. distillate / gasoline stocks, rig counts). Same format:
//     [{ title, country (currency code, "All" = global), date (ISO, New York offset), impact: High|Medium|Low|Holiday,
//     forecast, previous }] for this week (Sunday-Saturday, New York). No actual values, no next week.
//   - Each site rates impact for its own market, so one event can be High on Forex Factory and Low on CryptoCraft. Events
//     are merged by id (currency + title + time): impacts = { ff: 'high', cc: 'low', ... }, impact = the highest.
//   - Which pairs an event moves (moves()): Forex Factory events by currency (USD CPI moves EUR/USD, XAU/USD, NAS100...);
//     an event only on the other sites only moves pairs of that market (EnergyExch's USD distillate stocks move USOIL, not
//     EUR/USD); "All" events move every pair of their market.
//   - About 2 requests per 5 minutes per file and IP, an HTML "Request Denied" page beyond that: fetched by the server
//     only (econ-feed.ts: at most once per REFRESH_MS, a refused site keeps its previous events), never by browsers.
// Pure (Node tests): parsing, merging, ids, pairs, the coach's slice.

export const IMPACTS = ['high', 'medium', 'low', 'holiday'] as const;
export type Impact = typeof IMPACTS[number];
export const SOURCES = {
  ff: { url: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json', name: 'Forex Factory', market: 'fx' },
  cc: { url: 'https://nfs.faireconomy.media/cc_calendar_thisweek.json', name: 'CryptoCraft', market: 'crypto' },
  mm: { url: 'https://nfs.faireconomy.media/mm_calendar_thisweek.json', name: 'MetalsMine', market: 'metals' },
  ee: { url: 'https://nfs.faireconomy.media/ee_calendar_thisweek.json', name: 'EnergyExch', market: 'energy' },
} as const;
export type Source = keyof typeof SOURCES;
export type Market = 'fx' | 'crypto' | 'metals' | 'energy';
export const SOURCE_KEYS = Object.keys(SOURCES) as Source[];
const RANK: Record<Impact, number> = { high: 3, medium: 2, low: 1, holiday: 0 };

export interface EconEvent { id: string; title: string; currency: string; impact: Impact; event_at: string; forecast: string | null; previous: string | null; impacts?: Partial<Record<Source, Impact>> }
export const eventSources = (e: EconEvent): Source[] => {
  const k = Object.keys(e.impacts || {}).filter((x) => x in SOURCES) as Source[];
  return k.length ? k : ['ff'];
};

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

// one export -> rows; anything malformed is skipped. null = not a calendar at all (e.g. the "Request Denied" page).
export function parseFeed(raw: unknown, source: Source = 'ff'): EconEvent[] | null {
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
    out.push({ id, title, currency, impact, event_at: at, forecast: clean(e?.forecast, 24), previous: clean(e?.previous, 24), impacts: { [source]: impact } });
  }
  return out;
}

// the sites' rows -> one row per event: impacts of every site, impact = the highest, forecast / previous from the first
// site that has them (Forex Factory first). Sorted by time.
export function mergeFeeds(lists: EconEvent[][]): EconEvent[] {
  const by = new Map<string, EconEvent>();
  for (const list of lists) for (const e of list) {
    const m = by.get(e.id);
    if (!m) { by.set(e.id, { ...e, impacts: { ...(e.impacts || {}) } }); continue; }
    m.impacts = { ...m.impacts, ...(e.impacts || {}) };
    if (RANK[e.impact] > RANK[m.impact]) m.impact = e.impact;
    if (!m.forecast && e.forecast) m.forecast = e.forecast;
    if (!m.previous && e.previous) m.previous = e.previous;
  }
  return [...by.values()].sort((a, b) => a.event_at.localeCompare(b.event_at) || a.id.localeCompare(b.id));
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
export interface Pair { label: string; currencies: string[]; market: Market }
// the market of a symbol: metals, energy, crypto; everything else (forex, indices) follows the macro calendar
export function symbolMarket(symbol: string): Market {
  const s = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^(XAU|XAG|XPT|XPD|XCU|GOLD|SILVER|COPPER|PLAT|PALL)/.test(s)) return 'metals';
  if (/^(USOIL|UKOIL|WTI|BRENT|OIL|XTI|XBR|XNG|NG|NATGAS|CL[A-Z0-9]?$)/.test(s)) return 'energy';
  if (/^(BTC|ETH|SOL|XRP|LTC|ADA|DOGE|BNB)/.test(s)) return 'crypto';
  return 'fx';
}
const MARKET_SOURCE: Record<Market, Source> = { fx: 'ff', crypto: 'cc', metals: 'mm', energy: 'ee' };
// does an event move a pair: Forex Factory news by currency; other sites' news only within their market
export function moves(p: Pair, e: EconEvent): boolean {
  const src = eventSources(e), own = MARKET_SOURCE[p.market];
  if (!src.includes('ff') && !src.includes(own)) return false;    // another market's news
  if (e.currency === 'ALL') return true;                           // global news (G20, IEA outlook) of a market it is in
  return p.currencies.includes(e.currency);
}
export const PAIR_CATALOG = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'XAG/USD', 'USOIL', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'NZD/USD', 'GBP/JPY', 'NAS100', 'US30', 'GER40', 'BTC/USD'];
export function pairOf(label: string): Pair { return { label, currencies: symbolCurrencies(label), market: symbolMarket(label) }; }
// the member's pairs from their symbols, most traded first (max 8); symbols whose news currency is unknown are left out
export function memberPairs(symbols: string[], max = 8): Pair[] {
  const n = new Map<string, number>();
  for (const s of symbols) { const l = pairLabel(s); if (l && symbolCurrencies(l).length) n.set(l, (n.get(l) || 0) + 1); }
  return [...n].sort((x, y) => y[1] - x[1]).slice(0, max).map(([l]) => pairOf(l));
}
export const affects = (pairs: Pair[], e: EconEvent) => pairs.filter((p) => moves(p, e)).map((p) => p.label);

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
  const pairs = memberPairs(symbols), ccys = tradedCurrencies(symbols);
  // relevant: moves one of the member's pairs; without known pairs, any Forex Factory event
  const relevant = (e: EconEvent) => (pairs.length ? affects(pairs, e).length > 0 : eventSources(e).includes('ff'));
  const rank = (e: EconEvent) => {
    const up = Date.parse(e.event_at) >= now - 2 * 3600e3, r = relevant(e);
    return up ? (r ? (e.impact === 'high' ? 0 : 1) : 2) : (r ? 3 : 4);
  };
  let list = events.filter((e) => { const t = Date.parse(e.event_at); return t >= from && t <= to; })
    .filter((e) => (e.impact === 'high' && (eventSources(e).includes('ff') || relevant(e))) || (e.impact === 'medium' && relevant(e)));
  if (list.length > COACH_EVENTS_MAX) {
    list = list.map((e, i) => ({ e, i, r: rank(e) })).sort((a, b) => a.r - b.r || a.i - b.i).slice(0, COACH_EVENTS_MAX).map((x) => x.e);
  }
  list.sort((a, b) => Date.parse(a.event_at) - Date.parse(b.event_at));
  return {
    sources: SOURCE_KEYS.map((k) => SOURCES[k].name),
    time_zone: tz,
    now_local: localTime(new Date(now).toISOString(), tz),
    my_pairs: pairs.map((p) => p.label),
    my_currencies: ccys.length ? ccys : 'all',
    // the exports only have this week: nothing after this time is known yet (not "no news")
    covers_until_local: events.length ? localTime(events.reduce((m, e) => (e.event_at > m ? e.event_at : m), events[0].event_at), tz) : null,
    ...(fetchedAt ? {} : { note: 'calendar not loaded yet' }),
    events: list.map((e) => {
      const mins = Math.round((Date.parse(e.event_at) - now) / 60000), hit = affects(pairs, e), src = eventSources(e);
      return {
        when_local: localTime(e.event_at, tz), minutes_from_now: mins, status: mins >= 0 ? 'upcoming' : 'released',
        currency: e.currency === 'ALL' ? 'global' : e.currency, title: e.title, impact: e.impact,
        ...(e.forecast ? { forecast: e.forecast } : {}), ...(e.previous ? { previous: e.previous } : {}),
        // only for news of the crypto / metals / energy sites (Forex Factory news is the default)
        ...(src.includes('ff') ? {} : { market: SOURCES[src[0]].market, site: src.map((k) => SOURCES[k].name).join(', ') }),
        ...(hit.length ? { moves_my_pairs: hit } : {}),
      };
    }),
  };
}
