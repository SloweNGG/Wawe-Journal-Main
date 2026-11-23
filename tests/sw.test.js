// public/sw.js — sürümlü yerel varlıklar cache-first; sayfalar önce ağ (3 sn / çevrimdışı → önbellek);
// API, Supabase, admin, settings panelleri ve sürümsüz modüller ağdan
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stampJs } from '../scripts/asset-version.mjs';
import nodeCrypto, { webcrypto } from 'node:crypto';

const ORIGIN = 'https://wawejournal.com';
const ID = '1790000000000';

function response(body, extra = {}) {
  return {
    status: 200, ok: true, type: 'basic', redirected: false, body,
    clone() { return this; },
    arrayBuffer: async () => new TextEncoder().encode(String(body)).buffer,
    ...extra,
  };
}

// net(url) → 'ok' (varsayılan) | 'fail' | 'hang' | 'redirect'; body(url, opts) → yanıt gövdesi; crypto → self.crypto
function loadSw(source, { net = () => 'ok', body = null, crypto = null } = {}) {
  const listeners = {};
  const stores = new Map(); // ad → Map(url → yanıt)
  const fetched = [];
  const timers = [];
  const store = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    const keyOf = (req) => (typeof req === 'string' ? req : req.url);
    return {
      match: async (req) => m.get(keyOf(req)),
      put: async (req, res) => { m.delete(keyOf(req)); m.set(keyOf(req), res); },
      addAll: async (urls) => urls.forEach((u) => m.set(new URL(u, ORIGIN).href, response('pre'))),
      // Cache API: ekleme sırasıyla; ignoreSearch → sorgu hariç aynı adres
      keys: async (req, opts = {}) => {
        const all = [...m.keys()].map((url) => ({ url }));
        if (!req) return all;
        const strip = (u) => u.split('?')[0];
        return all.filter((k) => (opts.ignoreSearch ? strip(k.url) === strip(keyOf(req)) : k.url === keyOf(req)));
      },
      delete: async (req) => m.delete(keyOf(req)),
    };
  };
  const caches = {
    open: async (name) => store(name),
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    match: async (req) => {
      for (const m of stores.values()) if (m.has(req.url)) return m.get(req.url);
      return undefined;
    },
  };
  const fetch = (req, opts) => {
    fetched.push(req.url + (opts && opts.cache ? ' [' + opts.cache + ']' : ''));
    if (body) return Promise.resolve(response(body(req.url, opts)));
    const mode = net(req.url);
    if (mode === 'fail') return Promise.reject(new TypeError('Failed to fetch'));
    if (mode === 'hang') return new Promise(() => {});
    if (mode === 'redirect') return Promise.resolve(response('redir:' + req.url, { redirected: true }));
    return Promise.resolve(response('net:' + req.url));
  };
  // Zamanlayıcılar elle tetiklenir (3 sn beklememek için)
  const setTimeout = (fn, ms) => (timers.push({ fn, ms }), timers.length);
  const clearTimeout = (id) => { if (timers[id - 1]) timers[id - 1].fn = () => {}; };
  const self = {
    location: new URL(ORIGIN + '/sw.js'),
    addEventListener: (type, fn) => (listeners[type] = fn),
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  if (crypto) self.crypto = crypto;
  vm.runInNewContext(source, { self, caches, fetch, URL, Promise, console, setTimeout, clearTimeout, Uint8Array, Array });
  const tick = () => new Promise((r) => setImmediate(r));
  return {
    stores,
    fetched,
    timers,
    async request(path, { mode = 'cors', destination = '', fireTimers = false } = {}) {
      const req = { method: 'GET', url: new URL(path, ORIGIN).href, mode, destination };
      let responded = null;
      const waits = [];
      listeners.fetch({ request: req, respondWith: (p) => (responded = p), waitUntil: (p) => waits.push(p) });
      if (!responded) return 'network';
      if (fireTimers) {
        await tick();
        timers.forEach((t) => t.fn());
      }
      try {
        return await responded;
      } catch (e) {
        return 'error:' + e.message;
      } finally {
        await Promise.race([Promise.all(waits), tick()]);
        await tick();
      }
    },
    async lifecycle() {
      const wait = [];
      listeners.install({ waitUntil: (p) => wait.push(p) });
      await Promise.all(wait);
      const act = [];
      listeners.activate({ waitUntil: (p) => act.push(p) });
      await Promise.all(act);
    },
  };
}

const built = stampJs(fs.readFileSync('public/sw.js', 'utf8'), ID);
const cacheName = 'wawe-v54-' + ID;
const ASSETS = 'wawe-assets-v1';
const HASH = 'a1b2c3d4e5';

describe('service worker', () => {
  it('the build stamps its ID into the cache name', () => {
    assert.ok(!built.includes('__WW_BUILD_ID__'));
    assert.match(built, new RegExp("'" + ID + "'"));
  });

  it('serves this build’s versioned JS/CSS/fonts cache-first (second load does not touch the network)', async () => {
    const sw = loadSw(built);
    for (const p of ['/interface/dashboard/js/dashboard.js?v=' + ID, '/styles.css?v=' + ID, '/fonts/pdf/DMSans-Bold.ttf?v=' + ID, '/i18n/locales/tr.js?v=' + ID]) {
      const first = await sw.request(p);
      assert.equal(first.body, 'net:' + ORIGIN + p);
      const n = sw.fetched.length;
      const second = await sw.request(p);
      assert.equal(second.body, 'net:' + ORIGIN + p);
      assert.equal(sw.fetched.length, n, p + ' came from the cache');
    }
  });

  it('leaves API, Supabase, admin, CDN, HTML fragments and other builds’ versions to the network', async () => {
    const sw = loadSw(built);
    for (const p of [
      '/api/x',
      '/admin',
      '/interface/admin/js/admin-core.js?v=' + ID,
      'https://odasapyhtdopbnlfhwde.supabase.co/rest/v1/trades',
      'https://cdn.jsdelivr.net/npm/lucide@0.441.0/dist/umd/lucide.min.js',
      '/interface/dashboard/js/dashboard.js?v=1780000000000',
      '/styles.css?v=1780000000000',
      '/interface/dashboard/js/dashboard.js',
      '/settings/panels/plan.html',
      '/register.html',
    ]) {
      assert.equal(await sw.request(p), 'network', p);
    }
    assert.equal(await sw.request('/admin', { mode: 'navigate', destination: 'document' }), 'network', 'admin navigation');
  });

  it('without a build ID (astro dev) nothing is cache-first', async () => {
    const sw = loadSw(fs.readFileSync('public/sw.js', 'utf8'));
    assert.equal(await sw.request('/interface/dashboard/js/onboarding.js?v=__WW_BUILD_ID__'), 'network');
  });

  it('activate deletes caches of older versions', async () => {
    const sw = loadSw(built);
    sw.stores.set('wawe-v51', new Map([['x', 1]]));
    sw.stores.set('wawe-v52-1780000000000', new Map([['y', 1]]));
    sw.stores.set('wawe-v53-1780000000000', new Map([['z', 1]]));
    await sw.lifecycle();
    assert.deepEqual([...sw.stores.keys()].sort(), [ASSETS, cacheName].sort());
  });

  it('content-hashed assets are cache-first and the asset cache survives a deploy (new SW activates)', async () => {
    const sw = loadSw(built);
    const p = '/interface/dashboard/js/dashboard.js?v=' + HASH;
    await sw.request(p);
    const n = sw.fetched.length;
    // yeni deploy: farklı build ID'li SW aynı önbellek nesneleriyle kurulur
    const next = loadSw(stampJs(fs.readFileSync('public/sw.js', 'utf8'), '1790000000999'));
    for (const [k, v] of sw.stores) next.stores.set(k, v);
    await next.lifecycle();
    assert.ok(next.stores.has(ASSETS), 'asset cache kept');
    assert.ok(!next.stores.has(cacheName), 'old page cache removed');
    const again = await next.request(p);
    assert.equal(again.body, 'net:' + ORIGIN + p);
    assert.equal(next.fetched.length, 0, 'unchanged file is not downloaded again after the deploy');
    assert.equal(sw.fetched.length, n);
  });

  it('a new version of a file replaces the old one in the asset cache', async () => {
    const sw = loadSw(built);
    await sw.request('/styles.css?v=' + HASH);
    await sw.request('/styles.css?v=ffffffffff');
    await sw.request('/cache.js?v=' + HASH);
    const keys = [...sw.stores.get(ASSETS).keys()];
    assert.deepEqual(keys, [ORIGIN + '/styles.css?v=ffffffffff', ORIGIN + '/cache.js?v=' + HASH]);
  });

  it('uppercase, short or non-hex ?v values are not treated as content hashes', async () => {
    const sw = loadSw(built);
    for (const v of ['A1B2C3D4E5', 'abc', 'zzzzzzzzzz', 'a1b2c3d4e5f']) assert.equal(await sw.request('/styles.css?v=' + v), 'network', v);
  });
});

describe('service worker: pages network-first', () => {
  it('navigations and extensionless page paths come from the network and are cached', async () => {
    const sw = loadSw(built);
    const nav = await sw.request('/dashboard.html', { mode: 'navigate', destination: 'document' });
    assert.equal(nav.body, 'net:' + ORIGIN + '/dashboard.html');
    const spa = await sw.request('/analytics'); // SPA router: fetch('/analytics')
    assert.equal(spa.body, 'net:' + ORIGIN + '/analytics');
    const again = await sw.request('/analytics');
    assert.equal(again.body, 'net:' + ORIGIN + '/analytics');
    assert.equal(sw.fetched.filter((u) => u.endsWith('/analytics')).length, 2, 'every page load asks the network');
    const store = sw.stores.get(cacheName);
    assert.ok(store.has(ORIGIN + '/dashboard.html') && store.has(ORIGIN + '/analytics'));
  });

  it('offline: shows the last good copy, also across /x and /x.html', async () => {
    let offline = false;
    const sw = loadSw(built, { net: () => (offline ? 'fail' : 'ok') });
    await sw.request('/dashboard', { mode: 'navigate', destination: 'document' });
    offline = true;
    const res = await sw.request('/dashboard', { mode: 'navigate', destination: 'document' });
    assert.equal(res.body, 'net:' + ORIGIN + '/dashboard');
    const viaHtml = await sw.request('/dashboard.html', { mode: 'navigate', destination: 'document' });
    assert.equal(viaHtml.body, 'net:' + ORIGIN + '/dashboard');
  });

  it('offline without a copy: the browser error stays', async () => {
    const sw = loadSw(built, { net: () => 'fail' });
    assert.match(String(await sw.request('/trades', { mode: 'navigate', destination: 'document' })), /^error:/);
  });

  it('network slower than 3 s: the cached copy is shown, the fresh answer still refreshes the cache later', async () => {
    let slow = false;
    const sw = loadSw(built, { net: () => (slow ? 'hang' : 'ok') });
    await sw.request('/calendar', { mode: 'navigate', destination: 'document' });
    slow = true;
    const res = await sw.request('/calendar', { mode: 'navigate', destination: 'document', fireTimers: true });
    assert.equal(res.body, 'net:' + ORIGIN + '/calendar');
    assert.ok(sw.timers.some((t) => t.ms === 3000), 'timeout is 3000 ms');
  });

  it('redirect answers are not cached', async () => {
    const sw = loadSw(built, { net: () => 'redirect' });
    await sw.request('/strategies');
    assert.ok(!sw.stores.get(cacheName)?.has(ORIGIN + '/strategies'));
  });
});

describe('service worker: content hash verification', () => {
  const sha10 = (text) => nodeCrypto.createHash('sha256').update(text).digest('hex').slice(0, 10);

  it('a JS file whose bytes match ?v is cached', async () => {
    const good = 'console.log(1)';
    const sw = loadSw(built, { body: () => good, crypto: webcrypto });
    const p = '/interface/x.js?v=' + sha10(good);
    await sw.request(p);
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(sw.stores.get(ASSETS).has(ORIGIN + p));
  });

  it('mismatching bytes (an old hash answered with new content) are not cached; one reload past the HTTP cache is tried', async () => {
    const oldText = 'console.log("old")';
    let reverted = false;
    const sw = loadSw(built, { body: (url, opts) => (opts && opts.cache === 'reload' && reverted ? oldText : 'console.log("new")'), crypto: webcrypto });
    const p = '/interface/x.js?v=' + sha10(oldText);
    const res = await sw.request(p);
    assert.equal(res.body, 'console.log("new")');
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(!sw.stores.get(ASSETS)?.has(ORIGIN + p), 'poisoned bytes stay out of the cache');
    assert.deepEqual(sw.fetched, [ORIGIN + p, ORIGIN + p + ' [reload]']);
    // dosya eski içeriğe döndü (revert): yeniden doğrulanır ve doğru kopya saklanır
    reverted = true;
    const again = await sw.request(p);
    assert.equal(again.body, oldText);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(sw.stores.get(ASSETS).get(ORIGIN + p).body, oldText);
  });

  it('fonts and images are not hashed in the worker', async () => {
    const sw = loadSw(built, { body: () => 'FONT', crypto: webcrypto });
    await sw.request('/fonts/pdf/DMSans-Bold.ttf?v=0123456789');
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(sw.stores.get(ASSETS).has(ORIGIN + '/fonts/pdf/DMSans-Bold.ttf?v=0123456789'));
    assert.equal(sw.fetched.length, 1);
  });
});
