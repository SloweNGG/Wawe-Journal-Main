// ============================================================
// AUTH SPA — login ↔ register arasında sayfa yenilemeden, animasyonsuz geçiş
// ============================================================
// İki sayfanın stili ve sağ paneli aynı; sadece soldaki form (.auth-side)
// değişir. Diğer sayfanın HTML'i boşta önceden çekilir, tıklayınca anında
// yerine konur ve sayfanın kendi script'leri (data-auth-script) yeniden çalışır.
// Uygulama sayfalarındaki SpaRouter.astro'dan bağımsızdır.
// ============================================================
(function () {
  if (window.__wwAuthSpa) return;
  window.__wwAuthSpa = true;

  var PAGES = { '/login': true, '/register': true };
  var cache = {};

  function pageKey(url) {
    return url.pathname.replace(/\.html$/, '').replace(/\/$/, '');
  }

  function toAuthUrl(href) {
    try {
      var url = new URL(href, location.href);
      return url.origin === location.origin && PAGES[pageKey(url)] ? url : null;
    } catch (e) {
      return null;
    }
  }

  function load(url) {
    var key = pageKey(url);
    if (!cache[key]) {
      cache[key] = fetch(url.pathname, { credentials: 'same-origin' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.text();
        })
        .catch(function (err) {
          delete cache[key];
          throw err;
        });
    }
    return cache[key];
  }

  var currentKey = pageKey(location);

  function go(url, push) {
    load(url).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var nextSide = doc.querySelector('.auth-side');
      var side = document.querySelector('.auth-side');
      var host = document.getElementById('app-scroll-container');
      if (!nextSide || !side || !host) {
        location.href = url.href;
        return;
      }

      // Eski Turnstile widget'ını kapat, token'ı sıfırla (yeni form kendi widget'ını çizer)
      var ts = side.querySelector('#turnstile-container');
      if (ts && window.turnstile && typeof window.turnstile.remove === 'function') {
        try { window.turnstile.remove(ts); } catch (e) {}
      }
      window.latestTurnstileToken = '';

      side.replaceWith(document.importNode(nextSide, true));
      document.title = doc.title;
      currentKey = pageKey(url);
      if (push) history.pushState({ wwAuth: true }, '', url.pathname + url.search + url.hash);
      host.scrollTop = 0;
      window.scrollTo(0, 0);

      // Sayfa script'lerini yeni DOM'a karşı yeniden çalıştır
      document.querySelectorAll('script[data-auth-script]').forEach(function (s) { s.remove(); });
      doc.querySelectorAll('script[data-auth-script]').forEach(function (old) {
        var s = document.createElement('script');
        s.setAttribute('data-auth-script', '');
        s.textContent = old.textContent;
        host.appendChild(s);
      });

      var first = document.querySelector('.auth-side input');
      if (first && window.matchMedia('(pointer: fine)').matches) first.focus({ preventScroll: true });
    }).catch(function () {
      location.href = url.href;
    });
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    var url = toAuthUrl(a.getAttribute('href'));
    if (!url) return;
    e.preventDefault();
    if (pageKey(url) !== currentKey) go(url, true);
  });

  window.addEventListener('popstate', function () {
    var url = toAuthUrl(location.href);
    if (url && pageKey(url) !== currentKey) go(url, false);
  });

  // Diğer sayfayı (ve geri tuşu için bu sayfayı) boşta önceden çek
  function prefetchAll() {
    Object.keys(PAGES).forEach(function (path) {
      load(new URL(path + '.html', location.href)).catch(function () {});
    });
  }
  if ('requestIdleCallback' in window) requestIdleCallback(prefetchAll, { timeout: 1500 });
  else setTimeout(prefetchAll, 300);
})();
