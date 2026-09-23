const CACHE_VERSION = 'wawe-v7';
const PRECACHE_URLS = ['/'];

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
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
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

  // HTML ve API isteklerini SW'ye sokma
  if (url.pathname.endsWith('.html') || url.pathname.startsWith('/api/')) return;

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
