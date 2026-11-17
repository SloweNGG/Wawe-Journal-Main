// ============================================================
// Economic calendar: Forex Factory export parsing and the coach's slice (_shared/econ-calendar.ts), the cached refresh
// (_shared/econ-feed.ts, fake DB + stubbed fetch), the navbar badge's pure helpers (econ-calendar.js), wiring and texts.
// Runner: node --test tests/*.test.js
// ============================================================
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseFeed, eventId, symbolCurrencies, tradedCurrencies, coachCalendar, localTime, COACH_EVENTS_MAX } from '../supabase/functions/_shared/econ-calendar.ts';
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
      event_at: '2026-11-17T13:30:00.000Z', forecast: '0.1%', previous: '0.8%' });
    assert.match(r[0].id, /^[0-9a-f]{16}$/);
    assert.equal(r[2].forecast, null);
    assert.equal(r[3].impact, 'holiday');
    assert.equal(parseFeed('<html>Request Denied</html>'), null);
    assert.equal(parseFeed({ error: 1 }), null);
    assert.deepEqual(parseFeed([]), []);
  });
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

describe('econ-calendar: the coach slice', () => {
  const ev = parseFeed(FEED);
  const now = Date.parse('2026-11-17T12:00:00Z');
  it('high + medium, member currencies, local times, minutes from now, no actual values', () => {
    const c = coachCalendar(ev, ['USD'], now, 'Europe/Istanbul', '2026-11-17T11:50:00Z');
    assert.equal(c.source, 'Forex Factory');
    assert.equal(c.now_local, '2026-11-17 15:00');
    assert.deepEqual(c.events.map((e) => e.title), ['Retail Sales m/m', 'Building Permits']);
    assert.deepEqual(c.events[0], { when_local: '2026-11-17 16:30', minutes_from_now: 90, currency: 'USD', title: 'Retail Sales m/m', impact: 'high', forecast: '0.1%', previous: '0.8%' });
    assert.equal('forecast' in c.events[1], false);
    assert.equal(c.covers_until_local, '2026-11-20 03:30');
    assert.equal(c.note, undefined);
  });
  it('all currencies when none are known; events released over 2 h ago are dropped', () => {
    const c = coachCalendar(ev, [], Date.parse('2026-11-17T16:00:00Z'), 'UTC', 'x');
    assert.equal(c.currencies, 'all');
    assert.deepEqual(c.events.map((e) => e.currency + ' ' + e.title), ['GBP CPI y/y', 'USD Building Permits']);
  });
  it('never loaded: a note; capped with high impact kept first', () => {
    assert.equal(coachCalendar([], ['USD'], now, 'UTC', null).note, 'calendar not loaded yet');
    const many = [];
    for (let i = 0; i < 50; i++) many.push({ id: 'm' + i, title: 'M' + i, currency: 'USD', impact: 'medium', event_at: new Date(now + (i + 1) * 3600e3).toISOString(), forecast: null, previous: null });
    many.push({ id: 'h', title: 'NFP', currency: 'USD', impact: 'high', event_at: new Date(now + 100 * 3600e3).toISOString(), forecast: null, previous: null });
    const c = coachCalendar(many, ['USD'], now, 'UTC', 'x');
    assert.equal(c.events.length, COACH_EVENTS_MAX);
    assert.ok(c.events.some((e) => e.title === 'NFP'));
  });
  it('localTime', () => { assert.equal(localTime('2026-11-17T13:30:00.000Z', 'America/New_York'), '2026-11-17 08:30'); });
});

describe('econ-feed: cached refresh', () => {
  const realFetch = globalThis.fetch;
  let calls = 0, reply;
  before(() => { globalThis.fetch = async () => { calls++; return reply(); }; });
  after(() => { globalThis.fetch = realFetch; });
  const json = (v) => () => new Response(JSON.stringify(v), { status: 200 });
  const now = Date.parse('2026-11-17T12:00:00Z');
  const fresh = () => ({ econ_feed_state: [{ id: 1, last_attempt_at: '1970-01-01T00:00:00.000Z', last_success_at: null, last_status: null }], econ_events: [] });

  it('first call loads the export; a second call within REFRESH_MS does not fetch', async () => {
    const t = fresh(), db = makeDb(t); calls = 0; reply = json(FEED);
    const st = await ensureFresh(db, now);
    assert.equal(calls, 1); assert.equal(st.last_status, 'ok');
    assert.equal(t.econ_events.length, 5);
    assert.equal(t.econ_feed_state[0].last_success_at, new Date(now).toISOString());
    await ensureFresh(db, now + REFRESH_MS - 1000);
    assert.equal(calls, 1);
  });
  it('a refused export ("Request Denied" HTML) keeps the rows and is not retried within CLAIM_MS', async () => {
    const t = fresh(), db = makeDb(t); calls = 0; reply = json(FEED);
    await ensureFresh(db, now);
    reply = () => new Response('<html>Request Denied</html>', { status: 200 });
    const later = now + REFRESH_MS + 1000;
    const st = await ensureFresh(db, later);
    assert.equal(calls, 2); assert.equal(st.last_status, 'not json'); assert.equal(st.last_success_at, new Date(now).toISOString());
    assert.equal(t.econ_events.length, 5);
    await ensureFresh(db, later + CLAIM_MS - 1000);
    assert.equal(calls, 2);                                    // the claim is still held
    reply = () => new Response('busy', { status: 503 });
    assert.equal((await ensureFresh(db, later + CLAIM_MS + 1000)).last_status, 'http 503');
    assert.equal(calls, 3);
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
  it('prefs are cleaned', () => {
    assert.deepEqual(E.cleanPrefs(null), { impact: 'high', ccys: [], alert: true, minutes: 15, desktop: false });
    assert.deepEqual(E.cleanPrefs({ impact: 'x', ccys: ['usd', 'EUR', 1], minutes: 7, alert: false, desktop: true }), { impact: 'high', ccys: ['EUR'], alert: false, minutes: 15, desktop: true });
  });
  it('next event by filters; events at the same time come together; just released counts as now', () => {
    const p = E.cleanPrefs({});
    const g = E.nextGroup(events, p, now);
    assert.deepEqual(g.events.map((e) => e.id), ['c', 'e']);
    assert.equal(E.nextGroup(events, E.cleanPrefs({ impact: 'medium' }), now).events[0].id, 'b');
    assert.deepEqual(E.nextGroup(events, E.cleanPrefs({ ccys: ['GBP'] }), now).events.map((e) => e.id), ['e']);
    assert.equal(E.nextGroup([ev('x', 'USD', 'high', -1)], p, now).events[0].id, 'x');
    assert.equal(E.nextGroup([ev('x', 'USD', 'high', -3)], p, now), null);
    assert.equal(E.groupTitle(g), 'EUR c +1');
  });
  it('countdown', () => {
    assert.equal(E.countdown(0), null);
    assert.equal(E.countdown(9 * 60e3 + 5e3), '09:05');
    assert.equal(E.countdown(42 * 60e3), '42 dk');
    assert.equal(E.countdown(3 * 3600e3 + 12 * 60e3), '3s 12dk');
    assert.equal(E.countdown(2 * 86400e3 + 4 * 3600e3), '2g 4s');
  });
  it('alerts: within the minutes, not started, not alerted, alerts on', () => {
    const p = E.cleanPrefs({ impact: 'medium', minutes: 30 });
    assert.deepEqual(E.dueAlerts(events, p, now, {}).map((g) => g.events.map((e) => e.id)), [['b']]);
    assert.deepEqual(E.dueAlerts(events, E.cleanPrefs({ minutes: 60 }), now, {}).map((g) => g.events.map((e) => e.id)), [['c', 'e']]);
    assert.deepEqual(E.dueAlerts(events, p, now, { b: 1 }), []);
    assert.deepEqual(E.dueAlerts(events, E.cleanPrefs({ impact: 'medium', minutes: 30, alert: false }), now, {}), []);
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
    assert.match(coach, /context\.economic_calendar = coachCalendar\(/);
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
