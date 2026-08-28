// ⭐ Service Worker - SADECE STATİK DOSYALARI CACHE'LER
// Dashboard, index ve diğer HTML dosyaları her zaman taze gelir

const CACHE_NAME = 'wawe-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/trades.html',
  '/strategies.html',
  '/calendar.html',
  '/admin.html',
  '/login.html',
  '/register.html',
  '/styles.css',
  '/index.css',
  '/pages.css',
  '/config.js',
  '/i18n.js',
  '/resim.svg'
];

// ⭐ INSTALL: Statik dosyaları cache'le
self.addEventListener('install', function(e) {
  console.log('⚡ SW: Install');
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS).catch(function(err) {
        console.warn('⚠️ SW: Bazı dosyalar cache\'lenemedi:', err);
      });
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ⭐ ACTIVATE: Eski cache'leri temizle
self.addEventListener('activate', function(e) {
  console.log('⚡ SW: Activate');
  e.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ SW: Eski cache siliniyor:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() {
      return clients.claim();
    })
  );
});

// ⭐ FETCH: HTML dosyalarını her zaman SUNUCUDAN al, diğerlerini cache'den
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);
  var pathname = url.pathname;
  
  // ⭐ HTML dosyaları - HER ZAMAN SUNUCUDAN (404'ü önle)
  if (pathname.endsWith('.html') || pathname === '/') {
    e.respondWith(
      fetch(e.request).catch(function() {
        // Hata olursa index.html'ye yönlendir (SPA mantığı)
        return caches.match('/index.html');
      })
    );
    return;
  }
  
  // ⭐ CSS/JS - CACHE ÖNCELİKLİ, sonra sunucu
  if (pathname.endsWith('.css') || pathname.endsWith('.js')) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        if (cached) {
          // Cache'den gelirken ARKADA sunucudan tazele (stale-while-revalidate)
          fetch(e.request).then(function(response) {
            if (response && response.status === 200) {
              caches.open(CACHE_NAME).then(function(cache) {
                cache.put(e.request, response);
              });
            }
          }).catch(function() {});
          return cached;
        }
        return fetch(e.request).then(function(response) {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(e.request, response);
            });
          }
          return response;
        });
      })
    );
    return;
  }
  
  // ⭐ Diğer dosyalar (resimler vs) - CACHE ÖNCELİKLİ
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request);
    })
  );
});