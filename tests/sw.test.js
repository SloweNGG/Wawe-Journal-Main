// public/sw.js — sürümlü yerel varlıklar cache-first; sayfalar önce ağ (3 sn / çevrimdışı → önbellek);
// API, Supabase, admin, settings panelleri ve sürümsüz modüller ağdan
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stampJs } from '../scripts/asset-version.mjs';

const ORIGIN = 'https://wawejournal.com';
const ID = '1790000000000';

function response(body, extra = {}) {
  return { status: 200, ok: true, type: 'basic', redirected: false, body, clone() { return this; }, ...extra };
}

// net(url) → 'ok' (varsayılan) | 'fail' | 'hang' | 'redirect'
function loadSw(source, { net = () => 'ok' } = {}) {
  const listeners = {};
  const stores = new Map(); // ad → Map(url → yanıt)
  const fetched = [];
  const timers = [];
  const store = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      match: async (req) => m.get(typeof req === 'string' ? req : req.url),
      put: async (req, res) => void m.set(typeof req === 'string' ? req : req.url, res),
      addAll: async (urls) => urls.forEach((u) => m.set(new URL(u, ORIGIN).href, response('pre'))),
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
  const fetch = (req) => {
    fetched.push(req.url);
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
  vm.runInNewContext(source, { self, caches, fetch, URL, Promise, console, setTimeout, clearTimeout });
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
const cacheName = 'wawe-v53-' + ID;

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
    await sw.lifecycle();
    assert.deepEqual([...sw.stores.keys()], [cacheName]);
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
