const CACHE_VERSION = 'wawe-v52'; // Supabase Storage avatarları önbellekte (fix/live-traffic 1b)
const PRECACHE_URLS = ['/'];

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
        keys.filter((k) => k !== CACHE_VERSION && k !== STORAGE_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Admin panel sayfalarını ve admin varlıklarını ASLA SW'ye sokma (her zaman güncel kalsın)
  if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/interface/admin/')) return;

  // ⭐ /interface/, /components/, /src/ ve /settings/ altındaki tüm JS/CSS modülleri her zaman sunucudan taze çekilsin.
  // Böylece navbar.js, bundle.js gibi sık güncellenen kritik dosyalar SW cache'ine takılıp kalmaz.
  if (
    url.pathname.startsWith('/interface/') ||
    url.pathname.startsWith('/components/') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/settings/')
  ) return;

  // HTML ve API isteklerini SW'ye sokma
  if (url.pathname.endsWith('.html') || url.pathname.startsWith('/api/')) return;

  // Supabase Storage avatarı: önce önbellek (yukarı bkz.)
  if (isStorageAvatar(url)) {
    event.respondWith(storageCacheFirst(req));
    return;
  }

  // Cross-origin istekleri SW'ye sokma
  if (url.origin !== self.location.origin) return;

  // Supabase isteklerini SW'ye sokma
  if (url.hostname.includes('supabase.co')) return;

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