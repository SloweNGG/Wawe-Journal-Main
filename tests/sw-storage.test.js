// Service worker: Supabase Storage avatarları önce önbellekten (fix/live-traffic 1b). sw.js sahte caches / fetch ile vm'de.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SB = 'https://odasapyhtdopbnlfhwde.supabase.co';
const AV = SB + '/storage/v1/object/public/avatars/avatars/00000000-0000-4000-8000-000000000001_1793560404898.jpg';

function load() {
  const stores = new Map();
  const fetches = [];
  const listeners = {};
  const makeCache = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      match: async (k) => m.get(typeof k === 'string' ? k : k.url),
      put: async (k, v) => { m.delete(k); m.set(typeof k === 'string' ? k : k.url, v); },
      keys: async () => [...m.keys()],
      delete: async (k) => m.delete(k),
      addAll: async () => {},
    };
  };
  const ctx = {
    URL, Promise, console,
    self: { location: { origin: 'https://wawejournal.com' }, addEventListener: (ev, fn) => { listeners[ev] = fn; }, skipWaiting() {}, clients: { claim: async () => {} } },
    caches: { open: async (n) => makeCache(n), keys: async () => [...stores.keys()], delete: async (n) => stores.delete(n), match: async () => undefined },
    fetch: async (url, opts) => { fetches.push({ url: typeof url === 'string' ? url : url.url, opts }); return { status: 200, type: 'cors', clone() { return this; } }; },
  };
  vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), ctx);
  async function request(url) {
    let responded = null;
    listeners.fetch({ request: { method: 'GET', url }, respondWith: (p) => { responded = p; } });
    if (responded) await responded;
    await new Promise((r) => setTimeout(r, 0));
    return responded !== null;
  }
  return { ctx, stores, fetches, listeners, request };
}

describe('sw.js: Supabase Storage avatars', () => {
  it('first request goes to the network in CORS mode, the second comes from the cache', async () => {
    const sw = load();
    assert.equal(await sw.request(AV), true);
    assert.equal(sw.fetches.length, 1);
    assert.equal(sw.fetches[0].opts.mode, 'cors');
    assert.equal(sw.fetches[0].opts.credentials, 'omit');
    assert.equal(await sw.request(AV), true);
    assert.equal(sw.fetches.length, 1, 'served from wawe-storage-v1');
    assert.ok(sw.stores.get('wawe-storage-v1').has(AV));
  });

  it('other buckets, query strings and other Supabase calls are left alone', async () => {
    const sw = load();
    for (const u of [AV + '?t=1', SB + '/storage/v1/object/public/bug-reports/x.jpg', SB + '/rest/v1/trades', SB + '/storage/v1/object/sign/avatars/x.jpg']) {
      assert.equal(await sw.request(u), false, u);
    }
    assert.equal(sw.fetches.length, 0);
  });

  it('keeps at most 40 avatars (oldest dropped)', async () => {
    const sw = load();
    for (let i = 0; i < 45; i++) await sw.request(AV.replace('1793560404898', String(1793560400000 + i)));
    const keys = [...sw.stores.get('wawe-storage-v1').keys()];
    assert.equal(keys.length, 40);
    assert.ok(keys[0].includes('1793560400005'));
  });

  it('activate deletes old versioned caches but keeps the avatar cache', async () => {
    const sw = load();
    await sw.request(AV);
    sw.stores.set('wawe-v51', new Map());
    let wait;
    sw.listeners.activate({ waitUntil: (p) => { wait = p; } });
    await wait;
    assert.ok(sw.stores.has('wawe-storage-v1'));
    assert.ok(!sw.stores.has('wawe-v51'));
  });
});

describe('settings.js: avatar upload', () => {
  const src = fs.readFileSync('public/settings/js/settings.js', 'utf8');
  it('shrinks to at most 256 px (WebP, JPEG fallback) and uploads with a one-year cache', () => {
    assert.match(src, /var AVATAR_MAX_PX = 256;/);
    assert.match(src, /var AVATAR_CACHE_SECONDS = '31536000';/);
    assert.match(src, /file = await shrinkAvatar\(file\);/);
    assert.match(src, /cacheControl: AVATAR_CACHE_SECONDS,/);
    assert.match(src, /'image\/webp', 0\.86\)/);
    assert.doesNotMatch(src, /from\('avatars'\)\.upload\(fileName, file, \{\s*cacheControl: '3600'/);
  });
  it('file names stay unique per upload (the cache relies on it)', () => {
    assert.match(src, /var fileName = 'avatars\/' \+ user\.id \+ '_' \+ Date\.now\(\) \+ '\.' \+ ext;/);
  });
});
