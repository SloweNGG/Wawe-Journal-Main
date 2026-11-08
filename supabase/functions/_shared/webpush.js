// Web Push gönderimi, yalnızca WebCrypto ile (harici paket yok; Deno Edge Functions ve Node testleri aynı kodu çalıştırır).
//   - İçerik şifreleme: RFC 8291 (Message Encryption for Web Push) + RFC 8188 aes128gcm, tek kayıt.
//   - Sunucu kimliği: RFC 8292 VAPID (ES256 imzalı JWT, "vapid t=…, k=…" başlığı).
// Anahtarlar base64url: VAPID public = 65 baytlık sıkıştırılmamış P-256 noktası, private = 32 baytlık d.
// Abonelik (tarayıcının PushSubscription.toJSON()'u): { endpoint, keys: { p256dh, auth } }.

const te = new TextEncoder();

export function b64urlEncode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str) {
  const b = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

function p256Point(b64, what) {
  const p = b64urlDecode(b64);
  if (p.length !== 65 || p[0] !== 4) throw new Error(what + ': 65 baytlık sıkıştırılmamış P-256 anahtarı bekleniyor');
  return p;
}

// Yeni VAPID anahtar çifti (kurulumda bir kez üretilir).
export async function generateVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  return { publicKey: b64urlEncode(pub), privateKey: jwk.d };
}

// Authorization başlığı. JWT'nin aud'u push servisinin origin'i, ömrü 12 saat (servisler en çok 24 saat kabul eder).
export async function vapidAuthorization(endpoint, vapid, nowSec) {
  const pub = p256Point(vapid.publicKey, 'VAPID public key');
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33)), d: vapid.privateKey, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  const header = b64urlEncode(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64urlEncode(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: now + 12 * 3600, sub: vapid.subject })));
  const unsigned = header + '.' + claims;
  // WebCrypto ECDSA imzası zaten JWS'in istediği r||s (64 bayt) biçiminde
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(unsigned)));
  return 'vapid t=' + unsigned + '.' + b64urlEncode(sig) + ', k=' + vapid.publicKey;
}

async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

// RFC 8291 şifreli gövde: salt(16) | rs(4) | idlen(1)=65 | sunucu geçici public key(65) | AES-128-GCM(veri | 0x02).
// opts.salt / opts.asKeyPair yalnızca testlerde sabit değer vermek için.
export async function encryptPayload(payload, p256dh, authSecret, opts = {}) {
  const uaPublic = p256Point(p256dh, 'p256dh');
  const auth = b64urlDecode(authSecret);
  if (auth.length !== 16) throw new Error('auth: 16 bayt bekleniyor');

  const asKeys = opts.asKeyPair || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));

  const ikm = await hkdf(auth, ecdhSecret, concat(te.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);

  const data = typeof payload === 'string' ? te.encode(payload) : payload;
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(data, new Uint8Array([2]))));

  const rs = 4096;
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

// Tek aboneliğe gönderir. Fırlatmaz (ağ hatası status 0 olarak döner).
// gone: abonelik artık geçersiz (404/410), kayıt silinmeli.
export async function sendWebPush(subscription, payload, vapid, opts = {}) {
  try {
    const body = await encryptPayload(
      typeof payload === 'string' ? payload : JSON.stringify(payload),
      subscription.keys.p256dh,
      subscription.keys.auth,
    );
    const res = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuthorization(subscription.endpoint, vapid),
        TTL: String(opts.ttl ?? 86400),
        Urgency: opts.urgency || 'high',
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
      },
      body,
    });
    const text = res.ok ? '' : (await res.text().catch(() => '')).slice(0, 300);
    return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410, error: text };
  } catch (err) {
    return { ok: false, status: 0, gone: false, error: String(err && err.message || err) };
  }
}
