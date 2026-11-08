// Admin telefon bildirimleri (Web Push): supabase/functions/_shared/webpush.js şifrelemesi ve VAPID imzası,
// public/sw.js push / notificationclick olayları, migration tetikleyicileri ve admin paneli bağlantısı.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import { encryptPayload, vapidAuthorization, generateVapidKeys, sendWebPush } from '../supabase/functions/_shared/webpush.js';

// RFC 8291 alıcı tarafı, node:crypto ile (webpush.js'ten bağımsız yazıldı)
function decrypt(body, ua, auth) {
  const salt = body.subarray(0, 16);
  const rs = body.readUInt32BE(16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const cipher = body.subarray(21 + idlen);
  const ecdh = ua.computeSecret(asPublic);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', ecdh, auth, info, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(cipher.subarray(cipher.length - 16));
  const plain = Buffer.concat([d.update(cipher.subarray(0, cipher.length - 16)), d.final()]);
  return { rs, idlen, delimiter: plain[plain.length - 1], text: plain.subarray(0, -1).toString('utf8') };
}

function receiver() {
  const ua = crypto.createECDH('prime256v1');
  ua.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ua, auth, p256dh: ua.getPublicKey().toString('base64url'), authB64: auth.toString('base64url') };
}

describe('webpush.js — RFC 8291 aes128gcm', () => {
  it('alıcı kendi özel anahtarıyla çözer (Türkçe ve emoji dahil)', async () => {
    const r = receiver();
    const msg = JSON.stringify({ title: '💸 Para çekme isteği', body: '$25.00 · LTC\nğüşiöç İı' });
    const out = decrypt(Buffer.from(await encryptPayload(msg, r.p256dh, r.authB64)), r.ua, r.auth);
    assert.equal(out.text, msg);
    assert.equal(out.delimiter, 2);
    assert.equal(out.rs, 4096);
    assert.equal(out.idlen, 65);
  });

  it('her gönderimde yeni salt ve geçici anahtar', async () => {
    const r = receiver();
    const a = Buffer.from(await encryptPayload('x', r.p256dh, r.authB64));
    const b = Buffer.from(await encryptPayload('x', r.p256dh, r.authB64));
    assert.notDeepEqual(a.subarray(0, 16), b.subarray(0, 16));
    assert.notDeepEqual(a.subarray(21, 86), b.subarray(21, 86));
  });

  it('yanlış auth ile çözülemez', async () => {
    const r = receiver();
    const body = Buffer.from(await encryptPayload('gizli', r.p256dh, r.authB64));
    assert.throws(() => decrypt(body, r.ua, crypto.randomBytes(16)));
  });

  it('bozuk abonelik anahtarlarını reddeder', async () => {
    const r = receiver();
    await assert.rejects(encryptPayload('x', 'AAAA', r.authB64), /p256dh/);
    await assert.rejects(encryptPayload('x', r.p256dh, 'AAAA'), /auth/);
  });
});

describe('webpush.js — VAPID (RFC 8292)', () => {
  it('ES256 imzalı JWT; aud = push servisinin origin\'i, 12 saat geçerli', async () => {
    const keys = await generateVapidKeys();
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc:def', { ...keys, subject: 'https://wawejournal.com' }, 1_800_000_000);
    const m = header.match(/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/);
    assert.ok(m, header);
    assert.equal(m[4], keys.publicKey);
    assert.deepEqual(JSON.parse(Buffer.from(m[1], 'base64url')), { typ: 'JWT', alg: 'ES256' });
    assert.deepEqual(JSON.parse(Buffer.from(m[2], 'base64url')),
      { aud: 'https://fcm.googleapis.com', exp: 1_800_000_000 + 43200, sub: 'https://wawejournal.com' });
    const pub = Buffer.from(keys.publicKey, 'base64url');
    const key = crypto.createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') } });
    assert.ok(crypto.verify('sha256', Buffer.from(m[1] + '.' + m[2]), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(m[3], 'base64url')));
  });
});

describe('webpush.js — sendWebPush', () => {
  it('doğru başlıklarla POST eder; 410 → gone, ağ hatası fırlatmaz', async () => {
    const r = receiver();
    const vapid = { ...(await generateVapidKeys()), subject: 'https://wawejournal.com' };
    const orig = globalThis.fetch;
    const seen = [];
    try {
      globalThis.fetch = async (url, init) => { seen.push({ url, init }); return { ok: false, status: 410, text: async () => 'expired' }; };
      const res = await sendWebPush({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: r.p256dh, auth: r.authB64 } }, { title: 't' }, vapid);
      assert.deepEqual({ ok: res.ok, status: res.status, gone: res.gone }, { ok: false, status: 410, gone: true });
      const h = seen[0].init.headers;
      assert.equal(seen[0].init.method, 'POST');
      assert.equal(h['Content-Encoding'], 'aes128gcm');
      assert.equal(h.TTL, '86400');
      assert.equal(h.Urgency, 'high');
      assert.match(h.Authorization, /^vapid t=.+, k=/);
      assert.equal(JSON.parse(decrypt(Buffer.from(seen[0].init.body), r.ua, r.auth).text).title, 't');

      globalThis.fetch = async () => { throw new TypeError('network down'); };
      const res2 = await sendWebPush({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: r.p256dh, auth: r.authB64 } }, 'x', vapid);
      assert.equal(res2.ok, false);
      assert.equal(res2.status, 0);
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe('sw.js — push bildirimi', () => {
  function load() {
    const listeners = {};
    const shown = [];
    const opened = [];
    const windows = [];
    const self = {
      location: new URL('https://wawejournal.com/sw.js'),
      addEventListener: (t, fn) => (listeners[t] = fn),
      skipWaiting: () => {},
      registration: { showNotification: async (title, opts) => void shown.push({ title, opts }) },
      clients: {
        claim: async () => {},
        matchAll: async () => windows,
        openWindow: async (url) => void opened.push(url),
      },
    };
    vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), { self, caches: {}, fetch: () => {}, URL, Promise, console, setTimeout, clearTimeout });
    const fire = async (type, ev) => {
      const waits = [];
      listeners[type]({ ...ev, waitUntil: (p) => waits.push(p) });
      await Promise.all(waits);
    };
    return { fire, shown, opened, windows };
  }

  it('yükteki başlık, metin, tag ve adresle bildirim gösterir', async () => {
    const sw = load();
    await sw.fire('push', { data: { json: () => ({ title: '🆕 Yeni üye', body: 'ali · a@x.com', url: '/admin?panel=users', tag: 'signup-1' }) } });
    assert.equal(sw.shown[0].title, '🆕 Yeni üye');
    assert.equal(sw.shown[0].opts.body, 'ali · a@x.com');
    assert.equal(sw.shown[0].opts.tag, 'signup-1');
    assert.equal(sw.shown[0].opts.data.url, '/admin?panel=users');
    assert.ok(fs.existsSync('public' + sw.shown[0].opts.icon));
    assert.ok(fs.existsSync('public' + sw.shown[0].opts.badge));
  });

  it('JSON olmayan yük ve dış adres güvenli şekilde ele alınır', async () => {
    const sw = load();
    await sw.fire('push', { data: { json: () => { throw new Error('bad'); }, text: () => 'düz metin' } });
    assert.equal(sw.shown[0].title, 'Wawe Journal');
    assert.equal(sw.shown[0].opts.body, 'düz metin');
    await sw.fire('push', { data: { json: () => ({ title: 'x', url: 'https://evil.example/' }) } });
    assert.equal(sw.shown[1].opts.data.url, '/admin');
  });

  it('dokununca: açık pencere yoksa yeni pencere, varsa o pencere hedefe gider', async () => {
    const sw = load();
    let closed = 0;
    const note = { close: () => closed++, data: { url: '/admin?panel=payouts' } };
    await sw.fire('notificationclick', { notification: note });
    assert.equal(closed, 1);
    assert.deepEqual(sw.opened, ['https://wawejournal.com/admin?panel=payouts']);

    const nav = [];
    const win = { url: 'https://wawejournal.com/dashboard', focus: async () => win, navigate: async (u) => void nav.push(u) };
    sw.windows.push(win);
    await sw.fire('notificationclick', { notification: note });
    assert.deepEqual(nav, ['https://wawejournal.com/admin?panel=payouts']);
    assert.equal(sw.opened.length, 1);
  });
});

describe('admin bildirimleri — bağlantılar', () => {
  it('migration üç tabloya AFTER INSERT tetikleyicisi kurar, rollback hepsini kaldırır', () => {
    const up = fs.readFileSync('supabase/migrations/202611080001_admin_push_notifications.sql', 'utf8');
    const down = fs.readFileSync('supabase/rollbacks/202611080001_admin_push_notifications.down.sql', 'utf8');
    for (const [table, event] of [['user_profiles', 'signup'], ['bug_reports', 'report'], ['payout_requests', 'payout']]) {
      assert.match(up, new RegExp(`AFTER INSERT ON public\\.${table}\\s+FOR EACH ROW EXECUTE FUNCTION public\\.admin_push_enqueue\\('${event}'\\)`));
      assert.match(down, new RegExp(`DROP TRIGGER IF EXISTS admin_push_\\w+ ON public\\.${table};`));
    }
    assert.match(up, /functions\/v1\/admin-notify/);
    assert.match(up, /EXCEPTION WHEN OTHERS THEN/);
  });

  it('admin-notify tetikleyici olaylarını ve migration adını aynı yazar', () => {
    const fn = fs.readFileSync('supabase/functions/admin-notify/index.ts', 'utf8');
    assert.match(fn, /\['signup', 'report', 'payout'\]\.includes\(event\)/);
    assert.match(fn, /202611080001/);
  });

  it('admin paneli: menüde Telefon Bildirimleri, sayfada admin-push.js, ?panel= derin bağlantısı', () => {
    const core = fs.readFileSync('public/interface/admin/js/admin-core.js', 'utf8');
    assert.match(core, /panel: 'panel-push', tab: 'push'/);
    assert.match(core, /id="push-settings-container"/);
    assert.match(core, /openPanelFromUrl\(\);/);
    assert.match(fs.readFileSync('src/pages/admin.astro', 'utf8'), /\/interface\/admin\/js\/admin-push\.js/);
    // Bildirim adresleri gerçek sekmelere gider
    const tabs = [...core.matchAll(/tab: '([\w-]+)'/g)].map((m) => m[1]);
    const urls = [
      ...fs.readFileSync('supabase/functions/admin-notify/index.ts', 'utf8').matchAll(/\/admin\?panel=([\w-]+)/g),
      ...fs.readFileSync('supabase/functions/creem-webhook/index.ts', 'utf8').matchAll(/\/admin\?panel=([\w-]+)/g),
      ...fs.readFileSync('supabase/functions/nowpayment-webhook/index.ts', 'utf8').matchAll(/\/admin\?panel=([\w-]+)/g),
    ].map((m) => m[1]);
    assert.ok(urls.length >= 6);
    for (const u of urls) assert.ok(tabs.includes(u), u);
  });
});
