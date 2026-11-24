// public/config.js → wwDedupFetch: aynı anda giden birebir aynı Supabase okuma isteklerini tek istekte birleştirir.
// Runner: node --test tests/*.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync('public/config.js', 'utf8');
const BASE = 'https://odasapyhtdopbnlfhwde.supabase.co';

function load() {
  const created = [];
  const window = {
    supabase: { createClient: (url, key, opts) => { created.push({ url, key, opts }); return { opts }; } },
    location: { origin: 'https://wawejournal.com' },
  };
  window.window = window;
  const ctx = vm.createContext({ window, console: { log() {}, warn() {}, error() {} }, Headers, Response, Map, Promise, fetch: () => Promise.reject(new Error('real fetch not used in tests')), localStorage: { getItem: () => null } });
  vm.runInContext(SRC, ctx, { filename: 'config.js' });
  return { window, created };
}

// Elle cevaplanan sahte fetch: her çağrı bir kayıt; resolve(body) / reject(err) ile tamamlanır
function fakeFetch() {
  const calls = [];
  const f = (input, init) => new Promise((resolve, reject) => {
    calls.push({ input, init, resolve: (body, status = 200) => resolve(new Response(body, { status })), reject });
  });
  f.calls = calls;
  return f;
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const auth = (t) => ({ headers: new Headers({ Authorization: 'Bearer ' + t, apikey: 'anon' }) });

describe('Supabase request de-duplication (config.js)', () => {
  it('the app client gets the de-duplicating fetch', () => {
    const { window, created } = load();
    assert.equal(created.length, 1);
    assert.equal(typeof window.wwSbDedup, 'function');
    assert.equal(created[0].opts.global.fetch, window.wwSbDedup);
  });

  it('identical concurrent GETs: one network call, every caller reads its own body', async () => {
    const base = fakeFetch();
    const f = load().window.wwDedupFetch(base);
    const url = BASE + '/rest/v1/prop_accounts?select=*&user_id=eq.u1';
    const a = f(url, auth('t1'));
    const b = f(url, auth('t1'));
    const c = f(url, auth('t1'));
    assert.equal(base.calls.length, 1);
    base.calls[0].resolve('[{"id":1}]');
    const bodies = await Promise.all([a, b, c].map((p) => p.then((r) => r.json())));
    assert.deepEqual(bodies, [[{ id: 1 }], [{ id: 1 }], [{ id: 1 }]]);
    assert.equal(f.saved, 2);
  });

  it('no time-based cache: the same GET after the answer goes to the network again', async () => {
    const base = fakeFetch();
    const f = load().window.wwDedupFetch(base);
    const url = BASE + '/rest/v1/trades?select=id';
    const a = f(url, auth('t1'));
    base.calls[0].resolve('[]');
    await (await a).text();
    await tick();
    f(url, auth('t1'));
    assert.equal(base.calls.length, 2);
  });

  it('a different token, Prefer (count) or Range never shares', () => {
    const base = fakeFetch();
    const f = load().window.wwDedupFetch(base);
    const url = BASE + '/rest/v1/trades?select=id';
    f(url, auth('t1'));
    f(url, auth('t2'));
    f(url, { method: 'HEAD', headers: new Headers({ Authorization: 'Bearer t1', Prefer: 'count=exact' }) });
    f(url, { method: 'HEAD', headers: new Headers({ Authorization: 'Bearer t1', Prefer: 'count=planned' }) });
    f(url, { headers: new Headers({ Authorization: 'Bearer t1', Range: '0-9' }) });
    assert.equal(base.calls.length, 5);
  });

  it('read-only RPCs share when the body matches; other RPCs and writes never share', () => {
    const base = fakeFetch();
    const f = load().window.wwDedupFetch(base);
    const rpc = (name, body) => f(BASE + '/rest/v1/rpc/' + name, { method: 'POST', body, headers: new Headers({ Authorization: 'Bearer t1' }) });
    rpc('get_ctrader_status', '{}');
    rpc('get_ctrader_status', '{}');
    rpc('get_mt5_status', '{}');
    rpc('list_journals', '{"p":1}');
    rpc('list_journals', '{"p":2}');
    assert.equal(base.calls.length, 4, 'ctrader shared, list_journals bodies differ');
    rpc('delete_journal', '{"id":1}');
    rpc('delete_journal', '{"id":1}');
    assert.equal(base.calls.length, 6, 'unknown RPC: never shared');
  });

  it('a write in between: a read started after it does not get the earlier answer', async () => {
    const base = fakeFetch();
    const f = load().window.wwDedupFetch(base);
    const url = BASE + '/rest/v1/trades?select=*';
    f(url, auth('t1'));                                                     // okuma (uçuşta)
    f(BASE + '/rest/v1/trades', { method: 'POST', body: '[{}]', ...auth('t1') });   // yazma
    f(url, auth('t1'));                                                     // yazmadan sonra okuma
    assert.equal(base.calls.length, 3);
    f(url, auth('t1'));                                                     // bu, ikinci okumayla birleşir
    assert.equal(base.calls.length, 3);
    for (const m of ['PATCH', 'PUT', 'DELETE']) {
      f(BASE + '/rest/v1/user_profiles?id=eq.u1', { method: m, ...auth('t1') });
      f(url, auth('t1'));
    }
    assert.equal(base.calls.length, 9, 'each write resets sharing');
  });

  it('auth calls and edge functions reset sharing too; econ-calendar (read-only) does not', () => {
    const base = fakeFetch();
    const f = load().window.wwDedupFetch(base);
    const url = BASE + '/rest/v1/trades?select=*';
    f(url, auth('t1'));
    f(BASE + '/functions/v1/econ-calendar', { method: 'POST', body: '{}', ...auth('t1') });
    f(url, auth('t1'));
    assert.equal(base.calls.length, 2, 'econ-calendar: still shared');
    f(BASE + '/functions/v1/ctrader-sync', { method: 'POST', body: '{}', ...auth('t1') });
    f(url, auth('t1'));
    f(BASE + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: '{}' });
    f(url, auth('t1'));
    assert.equal(base.calls.length, 6);
  });

  it('requests with an abort signal, non-string bodies or a Request object are not shared', () => {
    const base = fakeFetch();
    const f = load().window.wwDedupFetch(base);
    const url = BASE + '/rest/v1/trades?select=id';
    const ac = new AbortController();
    f(url, { ...auth('t1'), signal: ac.signal });
    f(url, { ...auth('t1'), signal: ac.signal });
    f(BASE + '/rest/v1/rpc/get_prices', { method: 'POST', body: new Blob(['{}']) });
    f(BASE + '/rest/v1/rpc/get_prices', { method: 'POST', body: new Blob(['{}']) });
    const req = new Request(url);
    f(req);
    f(req);
    assert.equal(base.calls.length, 6);
  });

  it('a network error reaches every caller and the entry is dropped', async () => {
    const base = fakeFetch();
    const f = load().window.wwDedupFetch(base);
    const url = BASE + '/auth/v1/user';
    const a = f(url, auth('t1'));
    const b = f(url, auth('t1'));
    base.calls[0].reject(new TypeError('Failed to fetch'));
    await assert.rejects(a, /Failed to fetch/);
    await assert.rejects(b, /Failed to fetch/);
    f(url, auth('t1'));
    assert.equal(base.calls.length, 2);
  });

  it('HTTP errors are shared as they are (status kept for every caller)', async () => {
    const base = fakeFetch();
    const f = load().window.wwDedupFetch(base);
    const url = BASE + '/rest/v1/payments?select=id';
    const a = f(url, auth('t1'));
    const b = f(url, auth('t1'));
    base.calls[0].resolve('{"message":"denied"}', 403);
    const [ra, rb] = await Promise.all([a, b]);
    assert.equal(ra.status, 403);
    assert.equal(rb.status, 403);
    assert.equal((await rb.json()).message, 'denied');
  });
});

describe('READ_RPC stays read-only', () => {
  it('every shared RPC is a plain read in its latest migration (no INSERT / UPDATE / DELETE)', () => {
    const names = SRC.match(/READ_RPC = \/\\\/rest\\\/v1\\\/rpc\\\/\(([^)]+)\)/)[1].split('|');
    assert.ok(names.length >= 5, names.join(','));
    const files = fs.readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort();
    for (const n of names) {
      let body = null;
      for (const f of files) {
        const s = fs.readFileSync('supabase/migrations/' + f, 'utf8');
        const re = new RegExp('create\\s+(or\\s+replace\\s+)?function\\s+(public\\.)?' + n + '\\s*\\(([\\s\\S]*?)\\$(\\w*)\\$([\\s\\S]*?)\\$\\4\\$', 'gi');
        for (const m of s.matchAll(re)) body = m[5];
      }
      assert.ok(body, n + ': definition not found in supabase/migrations');
      assert.doesNotMatch(body, /^\s*(insert\s+into|update\s+\w|delete\s+from)/im, n + ' writes: remove it from READ_RPC');
    }
  });
});
