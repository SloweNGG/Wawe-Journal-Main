// Derleme kimliği: scripts/asset-version.mjs derlemede bu jetonu build ID ile değiştirir (geliştirmede olduğu gibi
// kalır; o zaman cache-first devre dışı). Her deploy'da sw.js değişir → yeni SW kurulur → activate eski önbelleği siler.
const BUILD_ID = '__WW_BUILD_ID__';
const CACHE_VERSION = 'wawe-v52-' + BUILD_ID; // v52: sürümlü yerel JS/CSS/font/ikon cache-first (perf parça 1)
const PRECACHE_URLS = ['/'];
const IS_BUILD = /^[0-9]+$/.test(BUILD_ID);
// ?v=<BUILD_ID> taşıyan bu türler içerik olarak hiç değişmez (yeni deploy = yeni adres)
const VERSIONED_EXT = /\.(?:m?js|css|json|woff2?|ttf|otf|svg|png|webp|ico)$/i;

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

// Bu derlemenin sürümlü yerel dosyası mı? (başka derlemenin ?v= değeri → ağdan, önbelleğe yazılmaz)
function isVersionedAsset(url) {
  return IS_BUILD && url.searchParams.get('v') === BUILD_ID && VERSIONED_EXT.test(url.pathname);
}

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

  // ⭐ Sürümlü yerel JS/CSS/font/ikon (?v=<BUILD_ID>): cache-first. Adres her deploy'da değiştiği için
  // önbellekteki kopya hiçbir zaman bayat olmaz; ağa hiç gidilmez.
  if (isVersionedAsset(url)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then((cache) =>
        cache.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req).then((res) => {
            if (res && res.status === 200 && res.type === 'basic') {
              cache.put(req, res.clone()).catch(() => {});
            }
            return res;
          });
        })
      ).catch(() => fetch(req))
    );
    return;
  }
  // Başka derlemenin (eski/yeni deploy ya da geliştirme) ?v= değeri: ağdan, önbelleğe yazılmadan
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
