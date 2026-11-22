// supabase/functions/_shared/coach-compact.ts
// What the AI coach model reads, as opposed to what the app keeps (ai-coach/index.ts):
//   - compactForModel(context): a smaller, prompt-only copy of the trader data JSON. Every number the coach can quote stays;
//     only the packaging changes: nulls / empty lists / empty objects and constant notes go, the strategy cross-tabs are
//     nested by strategy, strategies become name -> rules, the backtest breakdowns and R buckets become small fixed-column
//     tables, and the economic calendar is grouped per local day into released / upcoming. The context object itself is
//     never touched: charts (visuals.ts), promise cards (commitments.ts) and action cards (actions.ts) keep reading it.
//   - The values that change on every request (the minute, whether to mention the last promise, the monthly target the
//     browser sends) leave the system prompt and go into a short "[App context]" line at the start of the trader's latest
//     message (appContext / withAppContext), so the system prompt and the history stay the same from one message to the
//     next (Gemini's implicit cache can reuse an identical prefix).
//   - historyKeep(): how many of the last messages are sent back; the window's start moves in steps, not every turn.
// Pure (Node tests: tests/coach-compact.test.js).
import { localTime } from './econ-calendar.ts';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const isScalar = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
const nonEmpty = (v: unknown): v is Obj[] => Array.isArray(v) && v.length > 0;

// Stats columns always come in this order, so a column means the same in every table, and are never left out (even when
// null in every row): a missing avg_loss column would read as "no data" instead of "no losses".
const STATS = ['key', 'trades', 'wins', 'losses', 'win_rate', 'net', 'avg_win', 'avg_loss', 'profit_factor', 'expectancy', 'avg_r'];
// R buckets and exit reasons: trades, wins, losses and net only. wins / losses must stay: a win or a loss is decided by the
// net result after commission and swap, while R comes from prices, so a break-even exit that paid commission (R 0, bucket
// "0…1R") is a loss inside a positive bucket, and a stop trailed into profit is a win under "sl". The averages and the
// profit factor of a bucket are left out (the coach reads these buckets for counts and money).
const OUTCOME_COLS = ['key', 'trades', 'wins', 'losses', 'net'];

// [{a,b},{a,b}] -> {cols:[a,b], rows:[[..],[..]]}. fixed: exactly these columns. Otherwise the stats columns first (in STATS
// order), then the others in the order they appear; a non-stats column that is null in every row is left out.
export function table(list: Obj[], fixed?: string[]) {
  const seen = [...new Set(list.flatMap((r) => Object.keys(r)))];
  const cols = fixed || [...STATS.filter((k) => seen.includes(k)),
    ...seen.filter((k) => !STATS.includes(k) && list.some((r) => r[k] !== null && r[k] !== undefined))];
  return { cols, rows: list.map((r) => cols.map((k) => (r[k] === undefined ? null : r[k]))) };
}
// {"0":{..},"2+":{..}} -> a table with a key column
const mapTable = (m: Obj) => table(Object.entries(m).map(([key, s]) => ({ key, ...(s as Obj) })));
// a list of 2+ flat objects (one row stays an object: a table of one row reads worse than the object)
const tableable = (v: unknown): v is Obj[] => Array.isArray(v) && v.length >= 2 && v.every((r) => isObj(r) && Object.values(r).every(isScalar));

// The generic pass: null / undefined / [] / {} keys out of objects (a missing field = not known or not set: no goal, no
// stop, no consistency rule, no losses for avg_loss); table rows keep their nulls (a position needs a value).
// tables: lists of flat objects become column tables (opts.tables of compactForModel).
function generic(v: unknown, tables: boolean): unknown {
  if (tables && tableable(v)) return table(v);
  if (Array.isArray(v)) return v.map((x) => generic(x, tables));
  if (!isObj(v)) return v;
  return pack(Object.entries(v).map(([k, x]) => [k, generic(x, tables)]));
}
// entries -> object without empty values (fromEntries: a strategy called "__proto__" stays a plain key)
function pack(entries: [string, unknown][]): Obj {
  return Object.fromEntries(entries.filter(([, x]) => x !== null && x !== undefined
    && !(Array.isArray(x) && !x.length) && !(isObj(x) && !Object.keys(x).length)));
}

// strategy_by_session_utc / strategy_by_direction rows keyed "<strategy> | <bucket>" -> rows nested by strategy name.
// Split at the LAST " | ": the bucket is a fixed word (a session name or LONG / SHORT), a strategy name may contain " | ".
function crossTab(list: Obj[]) {
  const rows = new Map<string, [string, unknown[]][]>();
  for (const r of list) {
    const key = String(r.key ?? ''), i = key.lastIndexOf(' | ');
    const s = i >= 0 ? key.slice(0, i) : key, b = i >= 0 ? key.slice(i + 3) : '(all)';
    if (!rows.has(s)) rows.set(s, []);
    rows.get(s)!.push([b, [r.trades ?? null, r.win_rate ?? null, r.net ?? null]]);
  }
  return { cols: ['trades', 'win_rate', 'net'], rows: Object.fromEntries([...rows].map(([s, b]) => [s, Object.fromEntries(b)])) };
}

// strategies [{name, description}] -> { name: description }. With all journals in scope the same strategy can come from
// several journals: exact copies collapse into one entry, the same name with different descriptions keeps them all (a
// list), and a DIFFERENT name with the same description reads "same as <first name>" (copies like "London Breakout v2").
// A strategy without a description stays (null): the name alone tells the coach it exists (no duplicate add_strategy).
function strategies(list: Obj[]) {
  const by = new Map<string, (string | null)[]>();
  for (const s of list) {
    const name = String(s.name ?? ''), d = typeof s.description === 'string' && s.description ? s.description : null;
    const ds = by.get(name) || [];
    if (!ds.includes(d)) ds.push(d);
    by.set(name, ds);
  }
  const firstWith = new Map<string, string>();
  return Object.fromEntries([...by].map(([name, ds]) => {
    if (ds.length > 1) return [name, ds];
    const d = ds[0];
    if (d && firstWith.has(d)) return [name, `same as ${firstWith.get(d)}`];
    if (d) firstWith.set(d, name);
    return [name, d];
  }));
}

// backtest_vs_live: per symbol (or strategy) one live and one backtest row with the full stats. The backtest side adds up
// every backtest account on that symbol, so it is not any one account's totals: nothing of it may be left out.
function vsLive(v: Obj) {
  return pack(Object.entries(v).map(([side, list]) => {
    if (!nonEmpty(list)) return [side, null];
    const seen = [...new Set(list.flatMap((r) => [...Object.keys((r.live as Obj) || {}), ...Object.keys((r.backtest as Obj) || {})]))];
    const statCols = [...STATS.filter((k) => k !== 'key' && seen.includes(k)), ...seen.filter((k) => !STATS.includes(k))];
    const real = list.some((r) => r.backtest_on_real_market_history != null);
    const pick = (s: unknown) => statCols.map((k) => (isObj(s) && s[k] !== undefined ? s[k] : null));
    return [side, {
      cols: ['key', 'side', ...statCols, ...(real ? ['real_market_trades'] : [])],
      rows: list.flatMap((r) => [
        [r.key, 'live', ...pick(r.live), ...(real ? [null] : [])],
        [r.key, 'backtest', ...pick(r.backtest), ...(real ? [r.backtest_on_real_market_history ?? null] : [])],
      ]),
    }];
  }));
}

// backtest accounts: per account the breakdowns become small tables; R buckets and exit reasons keep wins and losses
const BT_TABLES = new Set(['by_direction', 'by_session_utc', 'last_trades']);
function backtest(bt: Obj, tables: boolean) {
  return pack(Object.entries(bt).map(([k, v]) => {
    if (k !== 'accounts' || !Array.isArray(v)) return [k, generic(v, tables)];
    return [k, v.map((a: Obj) => pack(Object.entries(a).map(([ak, x]) => {
      if ((ak === 'exit_reasons' || ak === 'r_buckets') && nonEmpty(x)) return [ak, table(x, OUTCOME_COLS)];
      if (BT_TABLES.has(ak) && nonEmpty(x)) return [ak, table(x)];
      return [ak, generic(x, tables)];
    })))];
  }));
}

// Economic calendar: events grouped per local day ("2026-11-22 Sun") and split into released / upcoming by coachCalendar's
// own status, so "is CPI out yet" stays explicit and the block only changes when an event passes, not every minute.
// Left out: minutes_from_now and now_local (they change every minute: the current time is in the App context), the
// constant source list and time_zone (the same as the data's time_zone). market + site only for news not on Forex Factory.
const CAL_COLS = ['time', 'currency', 'title', 'impact', 'forecast', 'previous', 'moves', 'market', 'site'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayLabel = (d: string) => { const t = Date.parse(d + 'T12:00:00Z'); return Number.isFinite(t) ? `${d} ${WEEKDAYS[new Date(t).getUTCDay()]}` : d; };
function calendar(c: Obj) {
  const { events, sources: _s, time_zone: _tz, now_local: _n, ...rest } = c;
  const groups = { released: new Map<string, unknown[][]>(), upcoming: new Map<string, unknown[][]>() };
  for (const e of (Array.isArray(events) ? events : []) as Obj[]) {
    const [d, t] = String(e.when_local ?? '').split(' ');
    const released = e.status ? e.status === 'released' : Number(e.minutes_from_now) < 0;
    const g = released ? groups.released : groups.upcoming, day = dayLabel(d);
    const row: unknown[] = [t ?? null, e.currency ?? null, e.title ?? null, e.impact ?? null, e.forecast ?? null, e.previous ?? null, e.moves_my_pairs ?? null];
    if (e.market != null || e.site != null) row.push(e.market ?? null, e.site ?? null);
    if (!g.has(day)) g.set(day, []);
    g.get(day)!.push(row);
  }
  // both groups always present: an empty upcoming {} says "nothing upcoming", not "not known"
  return { ...(generic(rest, false) as Obj), cols: CAL_COLS, released: Object.fromEntries(groups.released), upcoming: Object.fromEntries(groups.upcoming) };
}

// Values that change per request: never in the system prompt (appContext() carries them in the latest message instead).
// now_local (summary: date, weekday, hour) changes every hour, monthly_profit_target is what the browser sent this time.
export const APP_CONTEXT_KEYS = ['now_local', 'monthly_profit_target'] as const;

// The prompt-only view of the trader data. opts.tables: every list of 2+ flat objects (by_strategy, by_entry_hour_local,
// recent_trades, largest_losses, ...) and after_consecutive_losses / by_trade_number_of_day become column tables (about
// -7k chars more). OFF by default: reading values by position needs a live A/B on the real model first.
export function compactForModel(context: Obj, opts: { tables?: boolean } = {}): Obj {
  const tables = !!opts.tables;
  return pack(Object.entries(context).map(([k, v]): [string, unknown] => {
    if ((APP_CONTEXT_KEYS as readonly string[]).includes(k) || v == null) return [k, null];
    if (k === 'strategy_by_session_utc' || k === 'strategy_by_direction') return [k, nonEmpty(v) ? crossTab(v) : null];
    if (k === 'r_buckets') return [k, nonEmpty(v) ? table(v, OUTCOME_COLS) : null];
    if (k === 'strategies') return [k, nonEmpty(v) ? strategies(v) : null];
    if (!isObj(v) && !Array.isArray(v)) return [k, v];
    if (k === 'after_consecutive_losses' || k === 'by_trade_number_of_day') return [k, tables && isObj(v) ? mapTable(v) : generic(v, false)];
    // the note repeats what the knowledge base says about size (1.0 = usual lot)
    if (k === 'position_sizing' && isObj(v)) { const { note: _note, ...p } = v; return [k, generic(p, tables)]; }
    // mention_last goes to the App context (true only in the first answer of a new chat)
    if (k === 'commitment' && isObj(v)) { const { mention_last: _m, ...c } = v; return [k, generic(c, tables)]; }
    if (k === 'backtest_vs_live' && isObj(v)) return [k, vsLive(v)];
    if (k === 'backtest_accounts' && isObj(v)) return [k, backtest(v, tables)];
    // no action works on a prop account id (actions.ts: strategies, plan, goals, monthly target)
    if (k === 'prop_accounts' && Array.isArray(v)) return [k, v.map((p: Obj) => { const { account_id: _id, ...x } = p; return generic(x, tables); })];
    if (k === 'economic_calendar' && isObj(v)) return [k, calendar(v)];
    return [k, generic(v, tables)];
  }));
}

// The trader's current local time to the minute, with the weekday: "2026-11-22 15:05 Sun". From the clock and the zone,
// not from the calendar block (which may be missing).
export function localNow(nowMs: number, tz: string): string {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date(nowMs));
  return `${localTime(new Date(nowMs).toISOString(), tz)} ${wd}`;
}

// The "[App context]" line for the latest message: the current time, mention_last (only when true) and the monthly
// profit target (only when the panel sent one). Built from the same context the data comes from.
export function appContext(context: Obj, nowMs: number, tz: string): string {
  const c: Obj = { now_local: localNow(nowMs, tz) };
  if (isObj(context.commitment) && context.commitment.mention_last === true) c.mention_last = true;
  if (typeof context.monthly_profit_target === 'number') c.monthly_profit_target = context.monthly_profit_target;
  return '[App context] ' + JSON.stringify(c);
}
// the text the model gets as the trader's latest message; ai_messages keeps the trader's own text only, so an old
// App context is never sent again
export const withAppContext = (message: string, app: string) => `${app}\n\n${message}`;

// History window: up to max of the last messages, with the start snapped in steps (max 20, step 6 -> 16 to 20 messages).
// A window that slid by one turn on every message would change the start of the history every time, so no history could
// be reused from the cache; snapped, it stays put for 3 turns. n is the conversation's message count (always even: both
// rows of a turn are written together), so the window starts on a trader message.
export const HISTORY_MAX = 20, HISTORY_STEP = 6;
export function historyKeep(n: number, max = HISTORY_MAX, step = HISTORY_STEP): number {
  if (!(n > 0)) return 0;
  return n <= max ? n : n - Math.ceil((n - max) / step) * step;
}
