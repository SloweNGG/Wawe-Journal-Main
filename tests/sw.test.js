// public/sw.js — sürümlü yerel varlıklar cache-first; HTML, API, Supabase, admin ve sürümsüz modüller ağdan
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stampJs } from '../scripts/asset-version.mjs';

const ORIGIN = 'https://wawejournal.com';
const ID = '1790000000000';

function loadSw(source) {
  const listeners = {};
  const stores = new Map(); // ad → Map(url → yanıt)
  const fetched = [];
  const store = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      match: async (req) => m.get(typeof req === 'string' ? req : req.url),
      put: async (req, res) => void m.set(typeof req === 'string' ? req : req.url, res),
      addAll: async (urls) => urls.forEach((u) => m.set(new URL(u, ORIGIN).href, { status: 200, type: 'basic', body: 'pre' })),
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
  const fetch = async (req) => {
    fetched.push(req.url);
    return { status: 200, type: 'basic', body: 'net:' + req.url, clone() { return this; } };
  };
  const self = {
    location: new URL(ORIGIN + '/sw.js'),
    addEventListener: (type, fn) => (listeners[type] = fn),
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  vm.runInNewContext(source, { self, caches, fetch, URL, Promise, console });
  return {
    stores,
    fetched,
    async request(path) {
      const req = { method: 'GET', url: new URL(path, ORIGIN).href };
      let responded = null;
      listeners.fetch({ request: req, respondWith: (p) => (responded = p) });
      return responded ? await responded : 'network';
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

  it('leaves HTML, API, Supabase, admin, CDN and other builds’ versions to the network', async () => {
    const sw = loadSw(built);
    for (const p of [
      '/dashboard.html',
      '/api/x',
      '/admin',
      '/interface/admin/js/admin-core.js?v=' + ID,
      'https://odasapyhtdopbnlfhwde.supabase.co/rest/v1/trades',
      'https://cdn.jsdelivr.net/npm/lucide@0.441.0/dist/umd/lucide.min.js',
      '/interface/dashboard/js/dashboard.js?v=1780000000000',
      '/styles.css?v=1780000000000',
      '/interface/dashboard/js/dashboard.js',
      '/settings/panels/plan.html',
    ]) {
      assert.equal(await sw.request(p), 'network', p);
    }
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
    assert.deepEqual([...sw.stores.keys()], ['wawe-v52-' + ID]);
  });
});
