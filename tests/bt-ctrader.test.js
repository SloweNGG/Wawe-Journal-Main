// Backtest v2, Phase 2: cTrader candle source (bt-ctrader.js): broker symbol matching, Edge Function client errors, per-user browser
// cache, month conversion/caching/abort, coverage. Network and IndexedDB are fakes; nothing leaves the process.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBt, plain } from './helpers/bt-env.js';

const { S, C, X } = loadBt(['symbols', 'candles', 'ctrader']);
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222';
const tick = () => new Promise((r) => setTimeout(r, 0));
const flush = async () => { for (let i = 0; i < 8; i++) await tick(); };

// ------------------------------------------------------------ fakes
// minimal IndexedDB: one store keyed by 'k', async callbacks like the real one
function fakeIdb() {
  const data = new Map();
  const db = {
    createObjectStore() {},
    transaction() {
      let pending = 0, done = false;
      const t = { oncomplete: null, onerror: null, onabort: null };
      const finish = () => setTimeout(() => { if (pending > 0) return finish(); if (!done) { done = true; t.oncomplete && t.oncomplete(); } }, 1);
      const req = (fn) => { const r = {}; pending++; setTimeout(() => { r.result = fn(); r.onsuccess && r.onsuccess(); pending--; }, 0); return r; };
      const store = {
        get: (k) => req(() => data.get(k)),
        put: (v) => req(() => { data.set(v.k, v); }),
        clear: () => req(() => { data.clear(); }),
        openCursor() {
          const r = {}, keys = [...data.keys()]; let i = -1;
          const step = () => { pending++; i++; setTimeout(() => {
            if (i >= keys.length) r.result = null;
            else { const key = keys[i]; r.result = { value: data.get(key), delete() { data.delete(key); }, continue() { step(); } }; }
            r.onsuccess && r.onsuccess(); pending--;
          }, 0); };
          step();
          return r;
        },
      };
      t.objectStore = () => store;
      finish();
      return t;
    },
  };
  return { data, open() { const r = {}; setTimeout(() => { r.result = db; r.onupgradeneeded && r.onupgradeneeded(); r.onsuccess && r.onsuccess(); }, 0); return r; } };
}

// month columns from a list of [minuteOffset, o, h, l, c] in 1e-5 units
const cols = (rows, month) => ({ ok: true, month, scale: 100000, n: rows.length, tm: rows.map((r) => r[0]), o: rows.map((r) => r[1]), h: rows.map((r) => r[2]), l: rows.map((r) => r[3]), c: rows.map((r) => r[4]) });
function fakeApi(over = {}) {
  const calls = [];
  return {
    calls,
    month: async (id, key) => { calls.push(['month', id, key]); if (over.month) return over.month(id, key); return cols([[0, 108300, 108350, 108290, 108320], [1, 108320, 108330, 108310, 108325]], key); },
    coverageOfAccount: async (id) => { calls.push(['coverage', id]); return over.coverage ? over.coverage(id) : { ok: true, firstT: Date.UTC(2013, 4, 14, 3, 7) / 1000 }; },
  };
}
const ACC = { id: 'bbbbbbbb-0000-4000-8000-000000000001', ctid: 4455667, symbolId: 1, symbolName: 'EURUSD', brokerName: 'Spotware', isLive: false };
const NOW = Date.UTC(2026, 9, 21, 12);
const mkSrc = (api, cache, over = {}) => X.createCTraderSource(Object.assign({ api, cache, account: ACC, sym: S.get('EURUSD'), now: () => NOW }, over));

describe('matchBrokerSymbols', () => {
  const list = [[1, 'EURUSD'], [2, 'EURUSD.r'], [3, 'EURUSDm'], [4, 'EURUSDXXXXXXX'], [5, 'GBPUSD'], [41, 'XAUUSD'], [42, 'GOLD'], [43, 'XAUUSD.pro'], [50, 'BTCUSD'], [51, 'BTCUSDT'], [60, 'ETHUSD'], [70, 'EURGBP']];
  it('exact name first, then close variants; unrelated symbols never match', () => {
    const m = X.matchBrokerSymbols('EURUSD', list).map((r) => r.name);
    assert.deepEqual(plain(m), ['EURUSD', 'EURUSDm', 'EURUSD.r']);
    assert.ok(!m.includes('EURUSDXXXXXXX') && !m.includes('GBPUSD') && !m.includes('EURGBP'));
  });
  it('gold: XAUUSD variants before the GOLD alias', () => {
    const m = X.matchBrokerSymbols('XAUUSD', list).map((r) => r.name);
    assert.deepEqual(plain(m), ['XAUUSD', 'XAUUSD.pro', 'GOLD']);
  });
  it('crypto: BTC/USDT matches the broker BTCUSDT or BTCUSD; ETH/USDT matches ETHUSD', () => {
    assert.deepEqual(plain(X.matchBrokerSymbols('BTCUSDT', list).map((r) => r.name)), ['BTCUSDT', 'BTCUSD']);
    assert.deepEqual(plain(X.matchBrokerSymbols('ETHUSDT', list).map((r) => r.name)), ['ETHUSD']);
  });
  it('empty or junk lists give no candidates', () => {
    assert.deepEqual(plain(X.matchBrokerSymbols('EURUSD', [])), []);
    assert.deepEqual(plain(X.matchBrokerSymbols('EURUSD', null)), []);
    assert.deepEqual(plain(X.matchBrokerSymbols('EURUSD', [[0, 'EURUSD'], ['x', 'EURUSD'], [3, null]])), []);
  });
});

describe('createApi', () => {
  const mkFetch = (status, body, calls = []) => async (url, init) => { calls.push({ url, init }); return { ok: status >= 200 && status < 300, status, json: async () => body }; };
  const api = (f, token = 'jwt-123') => X.createApi({ url: 'https://x.supabase.co', anonKey: 'anon', getToken: async () => token, fetch: f });
  it('POSTs to the Edge Function with the user JWT and the action', async () => {
    const calls = [];
    const r = await api(mkFetch(200, { ok: true, symbols: [[1, 'EURUSD']] }, calls)).symbols(4455667);
    assert.deepEqual(plain(r), [[1, 'EURUSD']]);
    assert.equal(calls[0].url, 'https://x.supabase.co/functions/v1/ctrader-candles');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer jwt-123'); assert.equal(calls[0].init.headers.apikey, 'anon');
    assert.deepEqual(JSON.parse(calls[0].init.body), { action: 'symbols', ctidAccount: 4455667 });
  });
  it('month and coverage send the backtest account id (the server derives the broker account and symbol)', async () => {
    const calls = [];
    const a = api(mkFetch(200, { ok: true, n: 0 }, calls));
    await a.month(ACC.id, '2024-03'); await a.coverageOfAccount(ACC.id);
    assert.deepEqual(JSON.parse(calls[0].init.body), { action: 'month', backtestAccountId: ACC.id, month: '2024-03' });
    assert.deepEqual(JSON.parse(calls[1].init.body), { action: 'coverage', backtestAccountId: ACC.id });
  });
  it('error codes: cTrader auth -> AUTH (with needsReconnect), wawe session -> SESSION, rate, network, upstream', async () => {
    const code = async (f, token) => { try { await api(f, token).month(ACC.id, '2024-03'); } catch (e) { return e; } };
    let e = await code(mkFetch(401, { ok: false, code: 'AUTH', error: 'x', needs_reconnect: true }));
    assert.equal(e.code, 'AUTH'); assert.equal(e.needsReconnect, true);
    assert.equal((await code(mkFetch(404, { ok: false, code: 'NO_ACCOUNT', needs_reconnect: true }))).code, 'AUTH');
    assert.equal((await code(mkFetch(401, { ok: false, code: 'UNAUTHORIZED' }))).code, 'SESSION');
    assert.equal((await code(mkFetch(200, { ok: true }), null)).code, 'SESSION', 'no session token');
    assert.equal((await code(mkFetch(429, { ok: false, code: 'RATE' }))).code, 'RATE');
    assert.equal((await code(mkFetch(502, { ok: false, code: 'UPSTREAM' }))).code, 'UPSTREAM');
    assert.equal((await code(mkFetch(500, null))).code, 'UPSTREAM');
    assert.equal((await code(async () => { throw new TypeError('fetch failed'); })).code, 'NETWORK');
    assert.equal((await code(async () => { const x = new Error('a'); x.name = 'AbortError'; throw x; })).code, 'ABORTED');
  });
});

describe('browser cache (IndexedDB, per user)', () => {
  const minutes = (n) => ({ n, t: new Float64Array([60, 120].slice(0, n)), o: new Int32Array([1, 2].slice(0, n)), h: new Int32Array([1, 2].slice(0, n)), l: new Int32Array([1, 2].slice(0, n)), c: new Int32Array([1, 2].slice(0, n)) });
  it('stores a month and returns it to the same user in a new cache instance', async () => {
    const idb = fakeIdb();
    const a = X.createCache({ indexedDB: idb, userId: U1 });
    await a.put('k1', minutes(2), true);
    const b = X.createCache({ indexedDB: idb, userId: U1 });
    const rec = await b.get('k1');
    assert.equal(rec.n, 2); assert.deepEqual([...rec.t], [60, 120]);
  });
  it('a different user never reads another user\'s month, and purgeOthers deletes it', async () => {
    const idb = fakeIdb();
    await X.createCache({ indexedDB: idb, userId: U1 }).put('k1', minutes(2), true);
    await X.createCache({ indexedDB: idb, userId: U1 }).putMeta('cov', { firstT: 5 });
    const other = X.createCache({ indexedDB: idb, userId: U2 });
    assert.equal(await other.get('k1'), null, 'U2 cannot read U1');
    assert.equal(await other.getMeta('cov'), null);
    assert.ok(idb.data.size >= 2);
    await other.purgeOthers();
    assert.equal(idb.data.size, 0, 'U1 entries are gone once U2 opens the page');
  });
  it('purgeOthers keeps the own entries', async () => {
    const idb = fakeIdb();
    const me = X.createCache({ indexedDB: idb, userId: U1 });
    await me.put('k1', minutes(1), true);
    await X.createCache({ indexedDB: idb, userId: U2 }).put('k2', minutes(1), true);
    await me.purgeOthers();
    assert.deepEqual([...idb.data.keys()], [U1 + '|k1']);
  });
  it('without IndexedDB everything works in memory (and nothing throws)', async () => {
    const c = X.createCache({ indexedDB: null, userId: U1 });
    assert.equal(c.persistent, false);
    await c.put('k', minutes(2), true);
    assert.equal((await c.get('k')).n, 2);
    assert.equal(await c.getMeta('x'), null);
    await c.purgeOthers(); await c.putMeta('x', 1);
  });
  it('a broken IndexedDB (open throws) degrades to memory', async () => {
    const c = X.createCache({ indexedDB: { open() { throw new Error('denied'); } }, userId: U1 });
    await c.put('k', minutes(1), true);
    assert.equal((await c.get('k')).n, 1);
  });
});

describe('createCTraderSource', () => {
  it('label and kind: "cTrader · broker name"', () => {
    const src = mkSrc(fakeApi(), X.createCache({ indexedDB: null, userId: U1 }));
    assert.equal(src.kind, 'ctrader'); assert.equal(src.label(), 'cTrader · Spotware'); assert.equal(src.provider(), 'cTrader');
  });

  it('converts a server month into Minutes in points of the symbol digits (EURUSD: 5)', async () => {
    const src = mkSrc(fakeApi(), X.createCache({ indexedDB: null, userId: U1 }));
    const m = await src.getMonthMinutes(1, '2024-03');
    assert.equal(m.n, 2);
    const t0 = Date.UTC(2024, 2, 1) / 1000;
    assert.deepEqual([m.t[0], m.t[1]], [t0, t0 + 60]);
    assert.deepEqual([m.o[0], m.h[0], m.l[0], m.c[0]], [108300, 108350, 108290, 108320]);
    const rows = await src.getMonth(1, '2024-03');
    assert.equal(rows[0][1], 1.083); assert.equal(rows[0][2], 1.0835);
  });

  it('gold (2 digits): 1e-5 units are scaled down to points', async () => {
    const api = fakeApi({ month: async (id, key) => cols([[0, 231050000, 231080000, 231000000, 231070000]], key) });
    const src = X.createCTraderSource({ api, cache: X.createCache({ indexedDB: null, userId: U1 }), account: Object.assign({}, ACC, { symbolName: 'XAUUSD' }), sym: S.get('XAUUSD'), now: () => NOW });
    const m = await src.getMonthMinutes(41, '2024-03');
    assert.deepEqual([m.o[0], m.h[0], m.l[0], m.c[0]], [231050, 231080, 231000, 231070]);
  });

  it('repairs impossible bars (high below close, low above open) and drops non-increasing or non-positive ones', async () => {
    const api = fakeApi({ month: async (id, key) => cols([
      [0, 108300, 108290, 108310, 108320],      // high < open/close, low > open
      [0, 108300, 108300, 108300, 108300],      // duplicate minute: dropped
      [1, 0, 1, 0, 1],                                      // zero price: dropped
      [2, 108300, 108300, 108300, 108300],
    ], key) });
    const m = await mkSrc(api, X.createCache({ indexedDB: null, userId: U1 })).getMonthMinutes(1, '2024-03');
    assert.equal(m.n, 2); assert.equal(m.bad, 2);
    assert.ok(m.h[0] >= Math.max(m.o[0], m.c[0]) && m.l[0] <= Math.min(m.o[0], m.c[0]));
    for (let i = 1; i < m.n; i++) assert.ok(m.t[i] > m.t[i - 1]);
  });

  it('the second request is served from memory (one network call)', async () => {
    const api = fakeApi(); const src = mkSrc(api, X.createCache({ indexedDB: null, userId: U1 }));
    await src.getMonthMinutes(1, '2024-03'); await src.getMonthMinutes(1, '2024-03');
    assert.equal(api.calls.filter((c) => c[0] === 'month').length, 1);
    assert.equal(src.isCached(1, '2024-03'), true); assert.equal(src.isCached(1, '2024-04'), false);
  });

  it('a complete month is persisted: a new page load reads it from IndexedDB without any network call', async () => {
    const idb = fakeIdb();
    const api1 = fakeApi(); const s1 = mkSrc(api1, X.createCache({ indexedDB: idb, userId: U1 }));
    await s1.getMonthMinutes(1, '2024-03'); await flush();
    const api2 = fakeApi({ month: async () => { throw new Error('network must not be used'); } });
    const s2 = mkSrc(api2, X.createCache({ indexedDB: idb, userId: U1 }));
    const m = await s2.getMonthMinutes(1, '2024-03');
    assert.equal(m.n, 2); assert.equal(api2.calls.length, 0);
    assert.equal(m.o[0], 108300);
  });

  it('the month still in progress is never persisted (it grows every day)', async () => {
    const idb = fakeIdb();
    const s1 = mkSrc(fakeApi(), X.createCache({ indexedDB: idb, userId: U1 }));
    await s1.getMonthMinutes(1, '2026-10'); await flush();
    assert.equal([...idb.data.keys()].filter((k) => k.includes('2026-10')).length, 0);
    await s1.getMonthMinutes(1, '2026-09'); await flush();
    assert.equal([...idb.data.keys()].filter((k) => k.includes('2026-09')).length, 1);
  });

  it('the cache key carries the broker account, symbol and digits: another account or symbol never shares a month', async () => {
    const idb = fakeIdb();
    await mkSrc(fakeApi(), X.createCache({ indexedDB: idb, userId: U1 })).getMonthMinutes(1, '2024-03'); await flush();
    const api2 = fakeApi();
    const other = X.createCTraderSource({ api: api2, cache: X.createCache({ indexedDB: idb, userId: U1 }), account: Object.assign({}, ACC, { ctid: 999 }), sym: S.get('EURUSD'), now: () => NOW });
    await other.getMonthMinutes(1, '2024-03');
    assert.equal(api2.calls.length, 1, 'a different broker account is fetched on its own');
  });

  it('user B never gets user A\'s persisted candles', async () => {
    const idb = fakeIdb();
    await mkSrc(fakeApi(), X.createCache({ indexedDB: idb, userId: U1 })).getMonthMinutes(1, '2024-03'); await flush();
    const api2 = fakeApi();
    await mkSrc(api2, X.createCache({ indexedDB: idb, userId: U2 })).getMonthMinutes(1, '2024-03');
    assert.equal(api2.calls.length, 1, 'U2 asks the server (which checks ownership) instead of reading U1\'s entry');
  });

  it('an empty month is NOT_FOUND (no data for that month), and is not cached', async () => {
    const api = fakeApi({ month: async (id, key) => cols([], key) });
    const src = mkSrc(api, X.createCache({ indexedDB: null, userId: U1 }));
    await assert.rejects(() => src.getMonthMinutes(1, '2024-03'), (e) => e.code === 'NOT_FOUND');
    await assert.rejects(() => src.getMonthMinutes(1, '2024-03'), (e) => e.code === 'NOT_FOUND');
    assert.equal(api.calls.length, 2);
  });

  it('errors keep their code (AUTH = the connection is gone) and a later retry can succeed', async () => {
    let fail = true;
    const api = fakeApi({ month: async (id, key) => { if (fail) { const e = new Error('x'); e.code = 'AUTH'; throw e; } return cols([[0, 108300, 108300, 108300, 108300]], key); } });
    const src = mkSrc(api, X.createCache({ indexedDB: null, userId: U1 }));
    await assert.rejects(() => src.getMonthMinutes(1, '2024-03'), (e) => e.code === 'AUTH');
    fail = false;
    assert.equal((await src.getMonthMinutes(1, '2024-03')).n, 1);
  });

  it('abort: the caller gets ABORTED at once, the shared download finishes for the next caller (one network call)', async () => {
    let release; const gate = new Promise((r) => { release = r; });
    const api = fakeApi({ month: async (id, key) => { await gate; return cols([[0, 108300, 108300, 108300, 108300]], key); } });
    const src = mkSrc(api, X.createCache({ indexedDB: null, userId: U1 }));
    const ac = new AbortController();
    const first = src.getMonthMinutes(1, '2024-03', { signal: ac.signal });
    const second = src.getMonthMinutes(1, '2024-03');
    ac.abort();
    await assert.rejects(() => first, (e) => e.code === 'ABORTED');
    release();
    assert.equal((await second).n, 1);
    assert.equal(api.calls.filter((c) => c[0] === 'month').length, 1);
    await assert.rejects(() => src.getMonthMinutes(1, '2024-03', { signal: ac.signal }), (e) => e.code === 'ABORTED');
  });

  it('coverage: from the first bar to yesterday, one month list; measured once and remembered', async () => {
    const api = fakeApi(); const cache = X.createCache({ indexedDB: null, userId: U1 });
    // the meta store needs IndexedDB; with the memory fallback getMeta is always null, so each source measures once and keeps the promise
    const src = mkSrc(api, cache);
    const [c1, c2] = await Promise.all([src.coverage(1), src.coverage(1)]);
    assert.equal(api.calls.filter((c) => c[0] === 'coverage').length, 1);
    assert.equal(c1, c2);
    assert.equal(c1.firstT, Date.UTC(2013, 4, 14, 3, 7) / 1000);
    assert.equal(c1.months[0], '2013-05'); assert.equal(c1.months.at(-1), '2026-10');
    assert.equal(c1.lastT, Date.UTC(2026, 9, 21) / 1000 - 60, 'complete UTC days only');
    for (let i = 1; i < c1.months.length; i++) assert.equal(c1.months[i], C.nextMonth(c1.months[i - 1]));
  });

  it('coverage is remembered in IndexedDB (a new page load does not measure again)', async () => {
    const idb = fakeIdb();
    const s1 = mkSrc(fakeApi(), X.createCache({ indexedDB: idb, userId: U1 })); await s1.coverage(1); await flush();
    const api2 = fakeApi({ coverage: async () => { throw new Error('must not measure again'); } });
    const c = await mkSrc(api2, X.createCache({ indexedDB: idb, userId: U1 })).coverage(1);
    assert.equal(api2.calls.length, 0); assert.equal(c.months[0], '2013-05');
  });

  it('coverage without data is NOT_FOUND and a failed measurement is retried next time', async () => {
    let n = 0;
    const api = fakeApi({ coverage: async () => { n++; if (n === 1) return { ok: true, firstT: null }; return { ok: true, firstT: Date.UTC(2020, 0, 1) / 1000 }; } });
    const src = mkSrc(api, X.createCache({ indexedDB: null, userId: U1 }));
    await assert.rejects(() => src.coverage(1), (e) => e.code === 'NOT_FOUND');
    assert.equal((await src.coverage(1)).months[0], '2020-01');
  });

  it('buildCoverage: needs at least one complete day of data', () => {
    assert.throws(() => X.buildCoverage(NOW / 1000, NOW, 'EURUSD'), (e) => e.code === 'NOT_FOUND');
    assert.equal(X.buildCoverage(Date.UTC(2026, 9, 1) / 1000, NOW, 'EURUSD').months.join(), '2026-10');
  });
});
