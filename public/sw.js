// Derleme kimliği: scripts/asset-version.mjs derlemede bu jetonu build ID ile değiştirir (geliştirmede olduğu gibi
// kalır; o zaman cache-first devre dışı). Her deploy'da sw.js değişir → yeni SW kurulur → activate eski önbelleği siler.
const BUILD_ID = '__WW_BUILD_ID__';
const CACHE_VERSION = 'wawe-v53-' + BUILD_ID; // v53: sayfalar önce ağ (3 sn / çevrimdışı → önbellek); v52: sürümlü varlıklar cache-first
const PRECACHE_URLS = ['/'];
const IS_BUILD = /^[0-9]+$/.test(BUILD_ID);
// ?v=<BUILD_ID> taşıyan bu türler içerik olarak hiç değişmez (yeni deploy = yeni adres)
const VERSIONED_EXT = /\.(?:m?js|css|json|woff2?|ttf|otf|svg|png|webp|ico)$/i;
// Sayfa (HTML) için ağın bu süre içinde cevap vermesi beklenir; gecikirse önbellekteki kopya gösterilir
const NAV_TIMEOUT_MS = 3000;

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

  // API isteklerini SW'ye sokma
  if (url.pathname.startsWith('/api/')) return;

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
