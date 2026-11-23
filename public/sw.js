// Derleme kimliği: scripts/asset-version.mjs derlemede bu jetonu build ID ile değiştirir (geliştirmede olduğu gibi
// kalır; o zaman cache-first devre dışı). Her deploy'da sw.js değişir → yeni SW kurulur → activate eski SAYFA önbelleğini siler.
const BUILD_ID = '__WW_BUILD_ID__';
const CACHE_VERSION = 'wawe-v54-' + BUILD_ID; // v54: sürümlü varlıklar ayrı ve deploy'da SİLİNMEYEN wawe-assets-v1'de; v53: sayfalar önce ağ (3 sn / çevrimdışı → önbellek); Storage avatarları ayrı wawe-storage-v1'de (deploy'da silinmez)
const PRECACHE_URLS = ['/'];
const IS_BUILD = /^[0-9]+$/.test(BUILD_ID);
// ?v=<içerik hash'i> taşıyan bu türler içerik olarak hiç değişmez (içerik değişirse adres değişir; bkz. scripts/asset-version.mjs)
const VERSIONED_EXT = /\.(?:m?js|css|json|woff2?|ttf|otf|svg|png|webp|ico)$/i;
// Dosya başına içerik hash'i (sha256'nın ilk 10 hex'i). Değişmeyen dosyanın adresi deploy'lar arasında aynı kalır.
const CONTENT_HASH = /^[0-9a-f]{10}$/;
// Sürümlü varlık önbelleği: deploy'da SİLİNMEZ (değişmeyen dosyalar yeniden inmesin). Aynı dosyanın eski sürümü
// yenisi yazılınca silinir; toplam en çok ASSETS_MAX kayıt (sitede artık olmayan dosyalar için tavan, en eskiler gider).
const ASSET_CACHE = 'wawe-assets-v1';
const ASSETS_MAX = 700;
// Sayfa (HTML) için ağın bu süre içinde cevap vermesi beklenir; gecikirse önbellekteki kopya gösterilir
const NAV_TIMEOUT_MS = 3000;

// Supabase Storage'daki avatarlar: dosya adı her yüklemede yeni (avatars/<uid>_<zaman>.<uzantı>), içerik hiç değişmez.
// Yüklemedeki cacheControl eskiden 1 saatti: her saat ve her tarayıcı önbelleği temizliğinde yeniden iniyordu (Storage
// "cached egress"). Burada önce önbellek; ayrı ve deploy'da SİLİNMEYEN bir önbellekte, en çok STORAGE_MAX dosya.
const STORAGE_CACHE = 'wawe-storage-v1';
const STORAGE_MAX = 40;
const AVATAR_PATH = /^\/storage\/v1\/object\/public\/avatars\/[^?#]+$/;

function isStorageAvatar(url) {
  return url.protocol === 'https:' && url.hostname.endsWith('.supabase.co') && AVATAR_PATH.test(url.pathname) && !url.search;
}

function storageCacheFirst(req) {
  const key = req.url;
  return caches.open(STORAGE_CACHE).then((cache) => cache.match(key).then((hit) => {
    if (hit) return hit;
    // CORS ile (Storage "access-control-allow-origin: *" döner): opak olmayan yanıt önbelleğe yazılabilir
    return fetch(key, { mode: 'cors', credentials: 'omit' }).then((res) => {
      if (res && res.status === 200) {
        const clone = res.clone();
        cache.put(key, clone)
          .then(() => cache.keys())
          .then((keys) => Promise.all(keys.slice(0, Math.max(0, keys.length - STORAGE_MAX)).map((k) => cache.delete(k))))
          .catch(() => {});
      }
      return res;
    });
  })).catch(() => fetch(req));
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {});
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION && k !== STORAGE_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => trimAssets())
      .then(() => self.clients.claim())
  );
});

// Sayfa isteği mi? Tarayıcı gezintisi (navigate / document) ve uzantısız sayfa yolları
// (/dashboard; Cloudflare /dashboard.html'i buraya yönlendiriyor, SPA router da HTML'i bu adresle fetch ediyor).
// Gezinti olmayan .html fetch'leri (settings panelleri, auth-spa) sayfa sayılmaz; önceki gibi doğrudan ağdan.
function isPageRequest(req, url) {
  if (req.mode === 'navigate' || req.destination === 'document') return true;
  return !url.pathname.split('/').pop().includes('.');
}

// /dashboard ↔ /dashboard.html aynı sayfa: çevrimdışıyken hangisi önbellekteyse o gösterilir
function pageCacheKeys(url) {
  const keys = [url.href];
  const alt = new URL(url.href);
  if (alt.pathname.endsWith('.html')) alt.pathname = alt.pathname.slice(0, -5);
  else if (alt.pathname !== '/' && !alt.pathname.endsWith('/')) alt.pathname += '.html';
  else return keys;
  keys.push(alt.href);
  return keys;
}

function matchPage(cache, url) {
  return pageCacheKeys(url).reduce(
    (p, key) => p.then((hit) => hit || cache.match(key)),
    Promise.resolve(undefined)
  );
}

// Önce ağ: başarılı cevap önbelleğe yazılır. Ağ NAV_TIMEOUT_MS içinde cevap vermezse ya da hata verirse
// (çevrimdışı) önbellekteki kopya; o da yoksa ağın cevabı beklenir / tarayıcının hata sayfası.
function networkFirstPage(event, url) {
  const req = event.request;
  const network = fetch(req).then((res) => {
    // Yönlendirme cevapları (Cloudflare /x.html → /x) ve hatalar önbelleğe yazılmaz
    if (res && res.ok && res.type === 'basic' && !res.redirected) {
      const copy = res.clone();
      event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {}));
    }
    return res;
  });
  event.waitUntil(network.catch(() => {}));
  const cached = () => caches.open(CACHE_VERSION).then((cache) => matchPage(cache, url)).catch(() => undefined);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (res) => {
      if (!settled) { settled = true; resolve(res); }
    };
    const fallback = (err) =>
      cached().then((hit) => {
        if (hit) finish(hit);
        else if (err) { if (!settled) { settled = true; reject(err); } }
      });
    const timer = setTimeout(() => fallback(null), NAV_TIMEOUT_MS);
    network.then(
      (res) => { clearTimeout(timer); finish(res); },
      (err) => { clearTimeout(timer); fallback(err); }
    );
  });
}

// Sürümlü (adresi içeriğiyle değişen) yerel dosya mı? İçerik hash'i ya da (dist'te hedefi bulunamayan nadir referanslar için)
// bu derlemenin build ID'si. Başka derlemenin build ID'si ve geliştirme jetonu → ağdan, önbelleğe yazılmaz.
function isVersionedAsset(url) {
  if (!IS_BUILD || !VERSIONED_EXT.test(url.pathname)) return false;
  const v = url.searchParams.get('v');
  return !!v && (CONTENT_HASH.test(v) || v === BUILD_ID);
}

// Aynı dosyanın (aynı yol, başka ?v=) eski kopyalarını sil: önbellekte dosya başına tek sürüm kalır
function pruneOldVersions(cache, req) {
  const url = new URL(req.url);
  return cache.keys(url.origin + url.pathname, { ignoreSearch: true })
    .then((keys) => Promise.all(keys.filter((k) => k.url !== req.url).map((k) => cache.delete(k))))
    .catch(() => {});
}

// Tavan: en eski kayıtlar (Cache API anahtarları ekleme sırasıyla döner)
function trimAssets() {
  return caches.open(ASSET_CACHE)
    .then((cache) => cache.keys().then((keys) =>
      Promise.all(keys.slice(0, Math.max(0, keys.length - ASSETS_MAX)).map((k) => cache.delete(k)))))
    .catch(() => {});
}

// JS/CSS/JSON için gelen baytların sha256'sı ?v= ile uyuşuyor mu? Uyuşmazsa (eski sekme deploy sonrası eski hash'li adresi
// istedi ve sunucu yeni dosyayı verdi; tarayıcı bunu o adresle "immutable" sakladı) önbelleğe YAZILMAZ ve bir kez
// tarayıcı önbelleği atlanarak yeniden istenir. Böylece dosya ileride o eski içeriğe dönerse (revert) yanlış kopya kullanılmaz.
const VERIFY_EXT = /\.(?:m?js|css|json)$/i;

function sha10(res) {
  return res.clone().arrayBuffer()
    .then((buf) => self.crypto.subtle.digest('SHA-256', buf))
    .then((d) => Array.from(new Uint8Array(d).slice(0, 5), (b) => b.toString(16).padStart(2, '0')).join(''));
}

function verified(req, res) {
  const url = new URL(req.url);
  const v = url.searchParams.get('v');
  if (!CONTENT_HASH.test(v) || !VERIFY_EXT.test(url.pathname) || !(self.crypto && self.crypto.subtle)) return Promise.resolve({ res, ok: true });
  return sha10(res).then((h) => {
    if (h === v) return { res, ok: true };
    return fetch(req, { cache: 'reload' }).then((fresh) =>
      fresh && fresh.status === 200 && fresh.type === 'basic'
        ? sha10(fresh).then((h2) => ({ res: fresh, ok: h2 === v }))
        : { res: fresh, ok: false }
    );
  }).catch(() => ({ res, ok: false }));
}

function assetCacheFirst(req) {
  return caches.open(ASSET_CACHE).then((cache) =>
    cache.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        return verified(req, res).then(({ res: out, ok }) => {
          if (ok) cache.put(req, out.clone()).then(() => pruneOldVersions(cache, req)).catch(() => {});
          return out;
        });
      });
    })
  ).catch(() => fetch(req));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Admin panel sayfalarını ve admin varlıklarını ASLA SW'ye sokma (her zaman güncel kalsın)
  if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/interface/admin/')) return;

  // API isteklerini SW'ye sokma
  if (url.pathname.startsWith('/api/')) return;

  // Supabase Storage avatarı: önce önbellek (yukarı bkz.)
  if (isStorageAvatar(url)) {
    event.respondWith(storageCacheFirst(req));
    return;
  }

  // Cross-origin istekleri SW'ye sokma
  if (url.origin !== self.location.origin) return;

  // Supabase isteklerini SW'ye sokma
  if (url.hostname.includes('supabase.co')) return;

  // ⭐ Sayfalar (HTML): önce ağ — deploy sonrası her zaman yeni sayfa; ağ 3 sn'de cevap vermezse
  // ya da çevrimdışıysa son başarılı kopya
  if (isPageRequest(req, url)) {
    event.respondWith(networkFirstPage(event, url));
    return;
  }

  // Gezinti olmayan HTML parçaları (settings panelleri, auth-spa) SW'ye girmez
  if (url.pathname.endsWith('.html')) return;

  // ⭐ Sürümlü yerel JS/CSS/font/ikon (?v=<içerik hash'i>): cache-first. İçerik değişince adres değiştiği için
  // önbellekteki kopya hiçbir zaman bayat olmaz; ağa hiç gidilmez. Önbellek deploy'lar arasında korunur.
  if (isVersionedAsset(url)) {
    event.respondWith(assetCacheFirst(req));
    return;
  }
  // Başka derlemenin build ID'si ya da geliştirme jetonu taşıyan ?v= değeri: ağdan, önbelleğe yazılmadan
  if (url.searchParams.has('v') && VERSIONED_EXT.test(url.pathname)) return;

  // /interface/, /components/, /src/ ve /settings/ altındaki SÜRÜMSÜZ istekler (ör. settings panelleri)
  // her zaman sunucudan taze çekilsin; SW cache'ine takılıp kalmasın.
  if (
    url.pathname.startsWith('/interface/') ||
    url.pathname.startsWith('/components/') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/settings/')
  ) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => {
              cache.put(req, clone).catch(() => {});
            }).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// ⭐ Yönetici telefon bildirimleri (Web Push; gönderen: Edge Function admin-notify ve ödeme webhook'ları).
// Yük: { title, body, url, tag }. Abonelik yalnızca admin panelinden açılır; diğer kullanıcılara push gelmez.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Wawe Journal', {
      body: data.body || '',
      icon: '/apple-touch-icon.png',
      badge: '/images/brand/notification-badge.png',
      tag: data.tag || undefined,
      data: { url: typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/admin' },
    })
  );
});

// Bildirime dokununca: açık bir Wawe sekmesi varsa onu o adrese götür, yoksa yeni pencere aç
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/admin', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const win = list.find((c) => new URL(c.url).origin === self.location.origin && 'focus' in c);
      if (!win) return self.clients.openWindow(target);
      return win.focus()
        .then((w) => (w || win).navigate(target))
        .catch(() => self.clients.openWindow(target));
    })
  );
});
