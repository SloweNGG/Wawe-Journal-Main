// ============================================================
// Economic calendar: Forex Factory export parsing and the coach's slice (_shared/econ-calendar.ts), the cached refresh
// (_shared/econ-feed.ts, fake DB + stubbed fetch), the navbar badge's pure helpers (econ-calendar.js), wiring and texts.
// Runner: node --test tests/*.test.js
// ============================================================
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseFeed, eventId, symbolCurrencies, tradedCurrencies, coachCalendar, localTime, COACH_EVENTS_MAX, pairLabel, memberPairs, PAIR_CATALOG, pairOf, mergeFeeds, moves, symbolMarket, SOURCES } from '../supabase/functions/_shared/econ-calendar.ts';
import { ensureFresh, staleIds, readCalendar, REFRESH_MS, CLAIM_MS } from '../supabase/functions/_shared/econ-feed.ts';
import { makeDb } from './helpers/fake-db.js';

const FEED = [
  { title: 'Retail Sales m/m', country: 'USD', date: '2026-11-17T08:30:00-05:00', impact: 'High', forecast: '0.1%', previous: '0.8%' },
  { title: 'CPI y/y', country: 'GBP', date: '2026-11-18T02:00:00-05:00', impact: 'High', forecast: '3.6%', previous: '3.5%' },
  { title: 'Building Permits', country: 'USD', date: '2026-11-18T08:30:00-05:00', impact: 'Medium', forecast: '', previous: '1.31M' },
  { title: 'Bank Holiday', country: 'JPY', date: '2026-11-19T00:00:00-05:00', impact: 'Holiday', forecast: '', previous: '' },
  { title: 'Trade Balance', country: 'AUD', date: '2026-11-19T19:30:00-05:00', impact: 'Low', forecast: '4.1B', previous: '3.9B' },
  { title: 'broken', country: 'US', date: '2026-11-19T19:30:00-05:00', impact: 'High' },            // bad currency
  { title: '', country: 'USD', date: '2026-11-19T19:30:00-05:00', impact: 'High' },                // no title
  { title: 'x', country: 'USD', date: 'tomorrow', impact: 'High' },                                // bad date
  { title: 'x', country: 'USD', date: '2026-11-19T19:30:00-05:00', impact: 'Non-Economic' },       // unknown impact
  { title: 'Retail Sales m/m', country: 'USD', date: '2026-11-17T08:30:00-05:00', impact: 'High' }, // duplicate
];

describe('econ-calendar: parse', () => {
  it('turns the export into rows with UTC times and stable ids; skips the malformed', () => {
    const r = parseFeed(FEED);
    assert.equal(r.length, 5);
    assert.deepEqual(r[0], { id: eventId('USD', 'Retail Sales m/m', '2026-11-17T13:30:00.000Z'), title: 'Retail Sales m/m', currency: 'USD', impact: 'high',
      event_at: '2026-11-17T13:30:00.000Z', forecast: '0.1%', previous: '0.8%', impacts: { ff: 'high' } });
    assert.match(r[0].id, /^[0-9a-f]{16}$/);
    assert.equal(r[2].forecast, null);
    assert.equal(r[3].impact, 'holiday');
    assert.equal(parseFeed('<html>Request Denied</html>'), null);
    assert.equal(parseFeed({ error: 1 }), null);
    assert.deepEqual(parseFeed([]), []);
    assert.deepEqual(parseFeed([{ title: 'IEA World Energy Outlook', country: 'All', date: '2026-11-19T05:00:00-05:00', impact: 'Low' }], 'ee')[0].impacts, { ee: 'low' });
  });
  it('merges the four sites: one row per event, every site impact kept, the highest wins', () => {
    const ff = parseFeed(FEED, 'ff');
    const cc = parseFeed([{ ...FEED[0], impact: 'Low' }], 'cc');
    const ee = parseFeed([{ ...FEED[0], impact: 'High' }, { title: 'Distillate Inventories', country: 'USD', date: '2026-11-18T10:30:00-05:00', impact: 'High', forecast: '', previous: '4.1M' }], 'ee');
    const mm = parseFeed([{ ...FEED[2], impact: 'Low', forecast: '1.30M' }], 'mm');
    const m = mergeFeeds([ff, cc, mm, ee]);
    assert.equal(m.length, 6);
    const rs = m.find((e) => e.title === 'Retail Sales m/m');
    assert.deepEqual(rs.impacts, { ff: 'high', cc: 'low', ee: 'high' }); assert.equal(rs.impact, 'high');
    const bp = m.find((e) => e.title === 'Building Permits');
    assert.deepEqual(bp.impacts, { ff: 'medium', mm: 'low' }); assert.equal(bp.impact, 'medium'); assert.equal(bp.forecast, '1.30M');  // FF had none
    assert.deepEqual(m.find((e) => e.title === 'Distillate Inventories').impacts, { ee: 'high' });
    assert.ok(m.every((e, i) => i === 0 || m[i - 1].event_at <= e.event_at));
  });
  it('every site has an export url', () => { for (const k of ['ff', 'cc', 'mm', 'ee']) assert.match(SOURCES[k].url, /^https:\/\/nfs\.faireconomy\.media\/[a-z]{2}_calendar_thisweek\.json$/); });
  it('ids change with the time (a rescheduled event is a new row)', () => {
    assert.notEqual(eventId('USD', 'CPI', '2026-11-17T13:30:00.000Z'), eventId('USD', 'CPI', '2026-11-17T14:30:00.000Z'));
    assert.equal(eventId('USD', 'CPI', 'a'), eventId('USD', 'CPI', 'a'));
  });
});

describe('econ-calendar: currencies a member trades', () => {
  it('pairs, metals, indices, oil, crypto, broker suffixes', () => {
    assert.deepEqual(symbolCurrencies('EURUSD'), ['EUR', 'USD']);
    assert.deepEqual(symbolCurrencies('gbpjpy.m'), ['GBP', 'JPY']);
    assert.deepEqual(symbolCurrencies('XAUUSD'), ['USD']);
    assert.deepEqual(symbolCurrencies('NAS100'), ['USD']);
    assert.deepEqual(symbolCurrencies('US30.cash'), ['USD']);
    assert.deepEqual(symbolCurrencies('GER40'), ['EUR']);
    assert.deepEqual(symbolCurrencies('UK100'), ['GBP']);
    assert.deepEqual(symbolCurrencies('BTCUSDT'), ['USD']);
    assert.deepEqual(symbolCurrencies('USOIL'), ['USD']);
    assert.deepEqual(symbolCurrencies('USDTRY'), ['USD']);
    assert.deepEqual(symbolCurrencies('AAPL'), []);
    assert.deepEqual(symbolCurrencies(''), []);
  });
  it('most traded first', () => {
    assert.deepEqual(tradedCurrencies(['XAUUSD', 'XAUUSD', 'EURGBP', 'GBPUSD']), ['USD', 'GBP', 'EUR']);
    assert.deepEqual(tradedCurrencies([]), []);
  });
});

describe('econ-calendar: pairs', () => {
  it('labels as the member reads them', () => {
    assert.equal(pairLabel('EURUSD'), 'EUR/USD');
    assert.equal(pairLabel('eurusd.m'), 'EUR/USD');
    assert.equal(pairLabel('EUR/USD'), 'EUR/USD');
    assert.equal(pairLabel('XAUUSD+'), 'XAU/USD');
    assert.equal(pairLabel('BTCUSDT'), 'BTC/USD');
    assert.equal(pairLabel('NAS100.cash'), 'NAS100');
    assert.equal(pairLabel('US30'), 'US30');
  });
  it("the member's pairs, most traded first, unknown symbols left out; the catalog maps too", () => {
    assert.deepEqual(memberPairs(['XAUUSD', 'xauusd.m', 'EURUSD', 'AAPL', 'GER40']), [
      { label: 'XAU/USD', currencies: ['USD'], market: 'metals' }, { label: 'EUR/USD', currencies: ['EUR', 'USD'], market: 'fx' }, { label: 'GER40', currencies: ['EUR'], market: 'fx' }]);
    assert.equal(symbolMarket('USOIL'), 'energy'); assert.equal(symbolMarket('WTI.cash'), 'energy'); assert.equal(symbolMarket('BTCUSDT'), 'crypto');
    assert.equal(symbolMarket('NAS100'), 'fx'); assert.equal(symbolMarket('XAGUSD'), 'metals');
    for (const l of PAIR_CATALOG) assert.ok(pairOf(l).currencies.length, l);
    assert.deepEqual(pairOf('GBP/JPY').currencies, ['GBP', 'JPY']);
  });
});

const MOVES_CASES = [
  // [pair, event currency, sites, expected]
  ['EUR/USD', 'USD', ['ff'], true], ['XAU/USD', 'USD', ['ff'], true], ['USOIL', 'USD', ['ff'], true], ['GBP/USD', 'EUR', ['ff'], false],
  ['USOIL', 'USD', ['ee'], true], ['EUR/USD', 'USD', ['ee'], false], ['XAU/USD', 'USD', ['ee'], false],
  ['XAU/USD', 'GBP', ['mm'], false], ['XAU/USD', 'USD', ['mm'], true], ['BTC/USD', 'USD', ['cc'], true], ['EUR/USD', 'USD', ['cc'], false],
  ['USOIL', 'ALL', ['ee'], true], ['EUR/USD', 'ALL', ['ee'], false], ['EUR/USD', 'ALL', ['ff'], true],
  ['EUR/USD', 'USD', ['ff', 'ee'], true], ['USOIL', 'USD', ['ff', 'cc'], true],
];
const caseEvent = (cur, sites) => ({ id: 'x', title: 'x', currency: cur, impact: 'high', event_at: '2026-11-17T13:30:00.000Z', impacts: Object.fromEntries(sites.map((k) => [k, 'high'])) });

describe('econ-calendar: which pairs an event moves', () => {
  it('Forex Factory news by currency; the other sites only within their market', () => {
    for (const [pair, cur, sites, want] of MOVES_CASES) assert.equal(moves(pairOf(pair), caseEvent(cur, sites)), want, `${pair} ${cur} ${sites}`);
    assert.equal(moves(pairOf('EUR/USD'), { ...caseEvent('USD', []), impacts: undefined }), true);    // old rows: Forex Factory
  });
});

describe('econ-calendar: the coach slice', () => {
  const ev = parseFeed(FEED);
  const now = Date.parse('2026-11-17T12:00:00Z');
  it('high (any currency) + medium in my currencies, local times, the pairs each event moves, no actual values', () => {
    const c = coachCalendar(ev, ['EURUSD', 'XAUUSD'], now, 'Europe/Istanbul', '2026-11-17T11:50:00Z');
    assert.deepEqual(c.sources, ['Forex Factory', 'CryptoCraft', 'MetalsMine', 'EnergyExch']);
    assert.equal(c.now_local, '2026-11-17 15:00');
    assert.deepEqual(c.my_pairs, ['EUR/USD', 'XAU/USD']);
    assert.deepEqual(c.my_currencies, ['USD', 'EUR']);
    assert.deepEqual(c.events.map((e) => e.currency + ' ' + e.title), ['USD Retail Sales m/m', 'GBP CPI y/y', 'USD Building Permits']);
    assert.deepEqual(c.events[0], { when_local: '2026-11-17 16:30', minutes_from_now: 90, status: 'upcoming', currency: 'USD', title: 'Retail Sales m/m', impact: 'high',
      forecast: '0.1%', previous: '0.8%', moves_my_pairs: ['EUR/USD', 'XAU/USD'] });
    assert.equal('moves_my_pairs' in c.events[1], false);                  // GBP: none of my pairs
    assert.equal(c.covers_until_local, '2026-11-20 03:30');
    assert.equal(c.note, undefined);
  });
  it('released events of the last 3 days stay (status released); older ones go', () => {
    const c = coachCalendar(ev, ['EURUSD'], Date.parse('2026-11-19T12:00:00Z'), 'UTC', 'x');
    const r = c.events.find((e) => e.title === 'Retail Sales m/m');
    assert.equal(r.status, 'released'); assert.ok(r.minutes_from_now < 0);
    assert.equal(coachCalendar(ev, ['EURUSD'], Date.parse('2026-11-21T14:00:00Z'), 'UTC', 'x').events.some((e) => e.title === 'Retail Sales m/m'), false);
  });
  it('news of another market stays out unless the member trades it; global events read as "global"', () => {
    const ee = parseFeed([{ title: 'Distillate Inventories', country: 'USD', date: '2026-11-18T10:30:00-05:00', impact: 'High' },
      { title: 'IEA World Energy Outlook', country: 'All', date: '2026-11-18T11:00:00-05:00', impact: 'Medium' }], 'ee');
    const all = mergeFeeds([parseFeed(FEED, 'ff'), ee]);
    assert.equal(coachCalendar(all, ['EURUSD'], now, 'UTC', 'x').events.some((e) => e.title === 'Distillate Inventories'), false);
    const oil = coachCalendar(all, ['USOIL', 'EURUSD'], now, 'UTC', 'x');
    const d = oil.events.find((e) => e.title === 'Distillate Inventories');
    assert.deepEqual([d.market, d.site, d.moves_my_pairs], ['energy', 'EnergyExch', ['USOIL']]);
    const g = oil.events.find((e) => e.title === 'IEA World Energy Outlook');
    assert.equal(g.currency, 'global'); assert.deepEqual(g.moves_my_pairs, ['USOIL']);
    assert.deepEqual(oil.events.find((e) => e.title === 'Retail Sales m/m').moves_my_pairs, ['USOIL', 'EUR/USD']);
  });
  it('no symbols: all currencies; never loaded: a note; capped with my upcoming events first', () => {
    assert.equal(coachCalendar(ev, [], now, 'UTC', 'x').my_currencies, 'all');
    assert.equal(coachCalendar([], ['EURUSD'], now, 'UTC', null).note, 'calendar not loaded yet');
    const many = [];
    for (let i = 0; i < 60; i++) many.push({ id: 'm' + i, title: 'M' + i, currency: 'JPY', impact: 'high', event_at: new Date(now + (i + 1) * 3600e3).toISOString(), forecast: null, previous: null });
    many.push({ id: 'h', title: 'NFP', currency: 'USD', impact: 'high', event_at: new Date(now + 100 * 3600e3).toISOString(), forecast: null, previous: null });
    const c = coachCalendar(many, ['EURUSD'], now, 'UTC', 'x');
    assert.equal(c.events.length, COACH_EVENTS_MAX);
    assert.ok(c.events.some((e) => e.title === 'NFP'));
    assert.ok(c.events.every((e, i, a) => i === 0 || a[i - 1].minutes_from_now <= e.minutes_from_now));
  });
  it('localTime', () => { assert.equal(localTime('2026-11-17T13:30:00.000Z', 'America/New_York'), '2026-11-17 08:30'); });
});

describe('econ-feed: cached refresh', () => {
  const realFetch = globalThis.fetch;
  let calls = 0, reply;
  before(() => { globalThis.fetch = async (url) => { calls++; return reply(String(url)); }; });
  after(() => { globalThis.fetch = realFetch; });
  const json = (v) => () => new Response(JSON.stringify(v), { status: 200 });
  const now = Date.parse('2026-11-17T12:00:00Z');
  const fresh = () => ({ econ_feed_state: [{ id: 1, last_attempt_at: '1970-01-01T00:00:00.000Z', last_success_at: null, last_status: null }], econ_events: [] });

  it('first call loads the four exports (merged); a second call within REFRESH_MS does not fetch', async () => {
    const t = fresh(), db = makeDb(t); calls = 0; reply = json(FEED);
    const st = await ensureFresh(db, now);
    assert.equal(calls, 4); assert.equal(st.last_status, 'ok');
    assert.equal(t.econ_events.length, 5);
    assert.deepEqual(t.econ_events.find((e) => e.title === 'Retail Sales m/m').impacts, { ff: 'high', cc: 'high', mm: 'high', ee: 'high' });
    assert.equal(t.econ_feed_state[0].last_success_at, new Date(now).toISOString());
    await ensureFresh(db, now + REFRESH_MS - 1000);
    assert.equal(calls, 4);
  });
  it('a refused site keeps its stored events (partial = success); the others are replaced', async () => {
    const t = fresh(), db = makeDb(t); calls = 0;
    const EE = [{ title: 'Distillate Inventories', country: 'USD', date: '2026-11-18T10:30:00-05:00', impact: 'High', forecast: '', previous: '4.1M' }];
    reply = (u) => new Response(JSON.stringify(u.includes('/ee_') ? EE : FEED), { status: 200 });
    await ensureFresh(db, now);
    assert.equal(t.econ_events.length, 6);
    reply = (u) => (u.includes('/ee_') ? new Response('<html>Request Denied</html>', { status: 200 }) : new Response(JSON.stringify(FEED.slice(0, 2)), { status: 200 }));
    const st = await ensureFresh(db, now + REFRESH_MS + 1000);
    assert.equal(st.last_status, 'partial: ee not json');
    assert.equal(st.last_success_at, new Date(now + REFRESH_MS + 1000).toISOString());
    const titles = t.econ_events.map((e) => e.title).sort();
    assert.ok(titles.includes('Distillate Inventories'), 'refused site keeps its event');
    assert.ok(!titles.includes('Building Permits'), 'gone from the answering sites');
    assert.deepEqual(t.econ_events.find((e) => e.title === 'Retail Sales m/m').impacts, { ff: 'high', cc: 'high', mm: 'high' });
  });
  it('a refused export ("Request Denied" HTML) keeps the rows and is not retried within CLAIM_MS', async () => {
    const t = fresh(), db = makeDb(t); calls = 0; reply = json(FEED);
    await ensureFresh(db, now);
    reply = () => new Response('<html>Request Denied</html>', { status: 200 });
    const later = now + REFRESH_MS + 1000;
    const st = await ensureFresh(db, later);
    assert.equal(calls, 8); assert.equal(st.last_status, 'ff not json, cc not json, mm not json, ee not json'); assert.equal(st.last_success_at, new Date(now).toISOString());
    assert.equal(t.econ_events.length, 5);
    await ensureFresh(db, later + CLAIM_MS - 1000);
    assert.equal(calls, 8);                                    // the claim is still held
    reply = () => new Response('busy', { status: 503 });
    assert.equal((await ensureFresh(db, later + CLAIM_MS + 1000)).last_status, 'ff http 503, cc http 503, mm http 503, ee http 503');
    assert.equal(calls, 12);
  });
  it('a new export removes events that are gone from its range and keeps older weeks', async () => {
    const t = fresh(), db = makeDb(t); calls = 0; reply = json(FEED);
    t.econ_events.push({ id: 'old0000000000000', title: 'Last week', currency: 'USD', impact: 'high', event_at: '2026-11-10T13:30:00.000Z' });
    await ensureFresh(db, now);
    reply = json(FEED.filter((e) => e.title !== 'CPI y/y'));
    await ensureFresh(db, now + REFRESH_MS + 1000);
    assert.deepEqual(t.econ_events.map((e) => e.title).sort(), ['Bank Holiday', 'Building Permits', 'Last week', 'Retail Sales m/m', 'Trade Balance']);
  });
  it('no state row (migration missing) -> null; readCalendar reads without fetching', async () => {
    assert.equal(await ensureFresh(makeDb({}), now), null);
    const t = fresh(), db = makeDb(t); reply = json(FEED); await ensureFresh(db, now); calls = 0;
    const r = await readCalendar(db, now);
    assert.equal(calls, 0); assert.equal(r.fetchedAt, new Date(now).toISOString());
    assert.ok(r.events.length >= 3);
    assert.equal(await readCalendar(makeDb({}), now), null);
  });
  it('staleIds', () => { assert.deepEqual(staleIds([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }]), ['a']); });
});

describe('econ-calendar: navbar badge helpers', () => {
  let E;
  before(async () => { await import('../public/components/econ-calendar/econ-calendar.js'); E = globalThis.WWEcon._test; });
  const now = Date.parse('2026-11-17T12:00:00Z');
  const ev = (id, cur, imp, minutes) => ({ id, title: id, currency: cur, impact: imp, event_at: new Date(now + minutes * 60e3).toISOString() });
  const events = [ev('a', 'USD', 'high', -10), ev('b', 'USD', 'medium', 20), ev('c', 'EUR', 'high', 45), ev('d', 'EUR', 'low', 45), ev('e', 'GBP', 'high', 45)];
  const mine = [{ label: 'EUR/USD', currencies: ['EUR', 'USD'], market: 'fx' }, { label: 'XAU/USD', currencies: ['USD'], market: 'metals' }];
  const catalog = [{ label: 'GBP/USD', currencies: ['GBP', 'USD'], market: 'fx' }, { label: 'USD/JPY', currencies: ['USD', 'JPY'], market: 'fx' }];
  it('prefs are cleaned (old currency filters dropped)', () => {
    assert.deepEqual(E.cleanPrefs(null), { impact: 'high', pairs: null, alert: true, minutes: 15, desktop: false });
    assert.deepEqual(E.cleanPrefs({ impact: 'x', ccys: ['EUR'], pairs: ['EUR/USD', 'bad pair!', 3], minutes: 7, alert: false, desktop: true }),
      { impact: 'high', pairs: ['EUR/USD'], alert: false, minutes: 15, desktop: true });
  });
  it('pairs: null = mine, [] = all, picked from mine and the catalog', () => {
    assert.deepEqual(E.activePairs(E.cleanPrefs({}), mine, catalog).map((p) => p.label), ['EUR/USD', 'XAU/USD']);
    assert.deepEqual(E.activePairs(E.cleanPrefs({ pairs: [] }), mine, catalog), []);
    assert.deepEqual(E.activePairs(E.cleanPrefs({ pairs: ['GBP/USD', 'NOPE'] }), mine, catalog).map((p) => p.label), ['GBP/USD']);
    assert.deepEqual(E.togglePair(E.cleanPrefs({}), mine, 'GBP/USD'), ['EUR/USD', 'XAU/USD', 'GBP/USD']);
    assert.deepEqual(E.togglePair(E.cleanPrefs({}), mine, 'EUR/USD'), ['XAU/USD']);
    assert.deepEqual(E.togglePair(E.cleanPrefs({ pairs: ['GBP/USD'] }), mine, 'GBP/USD'), []);
    assert.deepEqual(E.affects(mine, caseEvent('USD', ['ff'])), ['EUR/USD', 'XAU/USD']);
    assert.deepEqual(E.affects(mine, caseEvent('GBP', ['ff'])), []);
    assert.deepEqual(E.affects(mine, caseEvent('USD', ['mm'])), ['XAU/USD']);
  });
  it('the badge matches pairs exactly like the server (same cases)', () => {
    for (const [pair, cur, sites, want] of MOVES_CASES) assert.equal(E.moves(pairOf(pair), caseEvent(cur, sites)), want, `${pair} ${cur} ${sites}`);
    assert.equal(E.marketOf(caseEvent('USD', ['ee'])), 'energy');
    assert.equal(E.marketOf(caseEvent('USD', ['ff', 'ee'])), null);
  });
  it('next event by impact and pairs; same-time events together; just released counts as now', () => {
    const p = E.cleanPrefs({}), all = [];
    const g = E.nextGroup(events, p, all, now);
    assert.deepEqual(g.events.map((e) => e.id), ['c', 'e']);
    assert.deepEqual(E.nextGroup(events, p, mine, now).events.map((e) => e.id), ['c']);         // GBP moves none of my pairs
    assert.deepEqual(E.groupPairs(g, mine), ['EUR/USD']);
    assert.equal(E.nextGroup(events, E.cleanPrefs({ impact: 'medium' }), mine, now).events[0].id, 'b');
    assert.deepEqual(E.nextGroup(events, p, [catalog[0]], now).events.map((e) => e.id), ['e']);
    assert.equal(E.nextGroup([ev('x', 'USD', 'high', -1)], p, all, now).events[0].id, 'x');
    assert.equal(E.nextGroup([ev('x', 'USD', 'high', -3)], p, all, now), null);
    assert.equal(E.groupTitle(g), 'EUR c +1');
  });
  it('countdown', () => {
    assert.equal(E.countdown(0), null);
    assert.equal(E.countdown(9 * 60e3 + 5e3), '09:05');
    assert.equal(E.countdown(42 * 60e3), '42 dk');
    assert.equal(E.countdown(3 * 3600e3 + 12 * 60e3), '3s 12dk');
    assert.equal(E.countdown(2 * 86400e3 + 4 * 3600e3), '2g 4s');
  });
  it('alerts: within the minutes, not started, not alerted, alerts on, my pairs', () => {
    const p = E.cleanPrefs({ impact: 'medium', minutes: 30 });
    assert.deepEqual(E.dueAlerts(events, p, mine, now, {}).map((g) => g.events.map((e) => e.id)), [['b']]);
    assert.deepEqual(E.dueAlerts(events, E.cleanPrefs({ minutes: 60 }), mine, now, {}).map((g) => g.events.map((e) => e.id)), [['c']]);
    assert.deepEqual(E.dueAlerts(events, E.cleanPrefs({ minutes: 60 }), [], now, {}).map((g) => g.events.map((e) => e.id)), [['c', 'e']]);
    assert.deepEqual(E.dueAlerts(events, p, mine, now, { b: 1 }), []);
    assert.deepEqual(E.dueAlerts(events, E.cleanPrefs({ impact: 'medium', minutes: 30, alert: false }), mine, now, {}), []);
  });
});

describe('econ-calendar: wiring and texts', () => {
  it('the badge host is in both navbar copies; assets are loaded; the coach gets the calendar', () => {
    assert.match(fs.readFileSync('src/components/Navbar.astro', 'utf8'), /<div class="nav-econ" id="nav-econ"><\/div>\s*<div class="nav-bell-wrapper"/);
    assert.match(fs.readFileSync('public/components/navbar/navbar.js', 'utf8'), /<div class="nav-econ" id="nav-econ"><\/div>\s*<div class="nav-bell-wrapper"/);
    const layout = fs.readFileSync('src/layouts/Layout.astro', 'utf8');
    assert.match(layout, /\/components\/econ-calendar\/econ-calendar\.css/);
    assert.match(layout, /\/components\/econ-calendar\/econ-calendar\.js/);
    const coach = fs.readFileSync('supabase/functions/ai-coach/index.ts', 'utf8');
    assert.match(coach, /context\.economic_calendar = coachCalendar\(cal\.events, loaded\.trades/);
    assert.match(fs.readFileSync('supabase/functions/econ-calendar/index.ts', 'utf8'), /pairs: memberPairs\(/);
    // the panel can hand a question to the coach
    assert.match(fs.readFileSync('public/components/ai-coach/ai-coach.js', 'utf8'), /, ask: askFromOutside, coachName/);
    assert.match(fs.readFileSync('supabase/functions/_shared/coach-knowledge.ts', 'utf8'), /### Economic calendar \(economic_calendar\)/);
  });
  it('every text the badge uses exists in all locales', async () => {
    const src = fs.readFileSync('public/components/econ-calendar/econ-calendar.js', 'utf8');
    const keys = [...new Set([...src.matchAll(/_t\('(econ\.[a-z_]+)'/g)].map((m) => m[1]).filter((k) => !k.endsWith('_')))];
    for (const imp of ['high', 'medium', 'low', 'holiday']) keys.push('econ.impact_' + imp);
    assert.ok(keys.length > 30);
    for (const l of ['tr', 'en', 'de']) {
      const loc = (await import('../public/i18n/locales/' + l + '.js')).default;
      for (const k of keys) assert.ok(typeof loc[k] === 'string' && loc[k], `${l}: ${k}`);
    }
  });
});
