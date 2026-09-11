// ⭐ Service Worker - NETWORK FIRST (Önce sunucu, olmazsa cache)
// Dashboard, index ve diğer HTML dosyaları her zaman taze gelir
// CSS/JS dosyaları Network First stratejisi ile çalışır
// ⭐ FIX: Cache API sadece GET destekler — HEAD/POST gibi isteklerde
//        SW müdahale etmiyor, tarayıcı default davranışına bırakılıyor.
//        (settings.astro'dan gelen HEAD isteği artık patlamıyor.)

const CACHE_NAME = 'wawe-v7'; // ⭐ Sürüm değişti (eski cache temizlensin)

// ⭐ INSTALL: Sadece hazırlan, hiçbir şey cache'leme
self.addEventListener('install', function(e) {
  wwLog.log('⚡ SW: Install');
  e.waitUntil(
    self.skipWaiting()
  );
});

// ⭐ ACTIVATE: Eski cache'leri temizle
self.addEventListener('activate', function(e) {
  wwLog.log('⚡ SW: Activate');
  e.waitUntil(
    caches.keys()
      .then(function(cacheNames) {
        return Promise.all(
          cacheNames.map(function(cacheName) {
            if (cacheName !== CACHE_NAME) {
              wwLog.log('🗑️ SW: Eski cache siliniyor:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(function() {
        return clients.claim();
      })
  );
});

// ⭐ FETCH: NETWORK FIRST - Önce sunucu, olmazsa cache
self.addEventListener('fetch', function(e) {
  // ⭐ FIX (KRİTİK): Cache API sadece GET isteklerini destekler.
  // HEAD, POST, PUT, DELETE gibi isteklerde SW müdahale etmez —
  // tarayıcı doğrudan fetch yapar, cache.put çağrılmaz, hata çıkmaz.
  if (e.request.method !== 'GET') {
    return;
  }

  var url = new URL(e.request.url);
  var pathname = url.pathname;

  // ⭐ HTML dosyaları - HER ZAMAN SUNUCUDAN
  if (pathname.endsWith('.html') || pathname === '/') {
    e.respondWith(
      fetch(e.request)
        .catch(function() {
          return caches.match('/index.html');
        })
    );
    return;
  }

  // ⭐ CSS/JS - NETWORK FIRST (önce sunucu, olmazsa cache)
  if (pathname.endsWith('.css') || pathname.endsWith('.js')) {
    e.respondWith(
      fetch(e.request)
        .then(function(response) {
          // Başarılı ise cache'le (sadece 200 durumunda)
          if (response && response.status === 200) {
            // ⭐ FIX: response.clone() sadece başarılı response'ta
            var clonedResponse = response.clone();
            caches.open(CACHE_NAME)
              .then(function(cache) {
                cache.put(e.request, clonedResponse);
              })
              .catch(function() {});
          }
          return response;
        })
        .catch(function() {
          // Network hatası varsa cache'den döndür
          return caches.match(e.request);
        })
    );
    return;
  }

  // ⭐ Diğer dosyalar (resimler vs) - CACHE ÖNCELİKLİ
  e.respondWith(
    caches.match(e.request)
      .then(function(cached) {
        if (cached) {
          // Cache'den dönerken arkada tazele (stale-while-revalidate)
          fetch(e.request)
            .then(function(response) {
              if (response && response.status === 200) {
                // ⭐ FIX: response.clone() sadece başarılı response'ta
                var clonedResponse = response.clone();
                caches.open(CACHE_NAME)
                  .then(function(cache) {
                    cache.put(e.request, clonedResponse);
                  })
                  .catch(function() {});
              }
            })
            .catch(function() {});
          return cached;
        }
        return fetch(e.request);
      })
  );
});