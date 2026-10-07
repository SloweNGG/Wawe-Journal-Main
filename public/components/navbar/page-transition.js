// ============================================================
// PAGE-TRANSITION.JS - components/navbar/page-transition.js
// Ultra-Hızlı ve Pürüzsüz Sayfa Geçişi + Akıllı Link Prefetching + Dil Koruma
// ============================================================

(function() {
  var prefetchedUrls = new Set();

  function prefetchUrl(url) {
    if (!url || typeof url !== 'string') return;
    if (prefetchedUrls.has(url)) return;

    // Harici linkleri, anchor ve protokolleri es geç
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//') || 
        url.startsWith('#') || url.startsWith('javascript:') || url.startsWith('mailto:')) {
      return;
    }

    var clean = url.split('#')[0].split('?')[0];
    if (!clean.endsWith('.html') && !clean.endsWith('/') && clean !== '') return;

    prefetchedUrls.add(url);
    try {
      var link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = url;
      link.as = 'document';
      document.head.appendChild(link);
    } catch (e) {}
  }

  var PageTransition = {
    isTransitioning: false,
    timeoutId: null,

    getMainElement: function() {
      // Sayfadaki ana içerik alanını bul (navbar hariç)
      var target = document.querySelector('main, .main, .dashboard-main, .calendar-page-main, .strategies-main, .settings-wrap, .trades-main, .bug-main, .journals-main, .my-earnings-container, .admin-main, .premium-main');
      if (target) return target;

      var container = document.getElementById('app-scroll-container');
      if (container && container.children) {
        for (var i = 0; i < container.children.length; i++) {
          var ch = container.children[i];
          if (ch.id !== 'navbar-container') return ch;
        }
      }
      return document.body;
    },

    enter: function() {
      var main = this.getMainElement();
      if (!main) return;

      main.classList.remove('page-exit');
      main.classList.add('page-enter');

      clearTimeout(this.timeoutId);
      this.timeoutId = setTimeout(function() {
        if (main) main.classList.remove('page-enter');
      }, 220);

      this.restoreLanguage();
    },

    exit: function(targetHref) {
      if (this.isTransitioning) return;
      this.isTransitioning = true;

      this.saveLanguageBeforeExit();

      var main = this.getMainElement();
      if (main) {
        main.classList.remove('page-enter');
        main.classList.add('page-exit');
      }

      setTimeout(function() {
        window.location.href = targetHref;
      }, 130);
    },

    saveLanguageBeforeExit: function() {
      try {
        if (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) {
          var currentLang = i18n.getCurrentLanguage();
          localStorage.setItem('ww_language', currentLang);
        }
      } catch (e) {}
    },

    restoreLanguage: function() {
      try {
        var savedLang = localStorage.getItem('ww_language');
        if (savedLang && typeof i18n !== 'undefined') {
          var currentLang = i18n.getCurrentLanguage ? i18n.getCurrentLanguage() : null;
          if (currentLang !== savedLang) {
            if (typeof i18n.setLanguage === 'function') i18n.setLanguage(savedLang);
          } else if (typeof i18n.apply === 'function') {
            i18n.apply();
          }
          if (typeof window.updateNavbarI18n === 'function') {
            window.updateNavbarI18n();
          }
          document.documentElement.setAttribute('data-lang', savedLang);
        }
      } catch (e) {}
    },

    isInternalNavLink: function(anchor) {
      if (!anchor) return false;
      var href = anchor.getAttribute('href');
      if (!href) return false;

      // Harici veya aksiyon linkleri filtrele
      if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//') ||
          href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') ||
          href === '#') {
        return false;
      }

      // Sadece uygulama içi HTML sayfaları veya root
      return true;
    },

    init: function() {
      this.restoreLanguage();
      this.enter();

      // Fare link üzerine geldiğinde veya dokunulduğunda akıllı prefetch yap
      document.addEventListener('mouseover', function(e) {
        var a = e.target.closest('a[href]');
        if (a && PageTransition.isInternalNavLink(a)) {
          prefetchUrl(a.getAttribute('href'));
        }
      }, { passive: true });

      document.addEventListener('touchstart', function(e) {
        var a = e.target.closest('a[href]');
        if (a && PageTransition.isInternalNavLink(a)) {
          prefetchUrl(a.getAttribute('href'));
        }
      }, { passive: true });

      // Link tıklamalarında pürüzsüz micro-exit animasyonu
      document.addEventListener('click', function(e) {
        // Yeni sekmede açma veya tuş kombinasyonlarını tarayıcıya bırak
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0 || e.defaultPrevented) return;

        var a = e.target.closest('a[href]');
        if (!a || !PageTransition.isInternalNavLink(a)) return;

        var href = a.getAttribute('href');
        var targetUrl = new URL(a.href, window.location.href);

        // Zaten aynı sayfadaysak (veya sadece anchor ise) tarayıcıya bırak veya iptal et
        if (targetUrl.pathname === window.location.pathname && (!targetUrl.search || targetUrl.search === window.location.search)) {
          if (targetUrl.hash) return; // anchor scroll'u serbest bırak
          e.preventDefault();
          return;
        }

        e.preventDefault();
        PageTransition.exit(href);
      });
    }
  };

  // Sayfa ilk yüklendiğinde başlat
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      PageTransition.init();
    });
  } else {
    PageTransition.init();
  }

  // Tarayıcı İleri/Geri (bfcache) desteği
  window.addEventListener('pageshow', function(e) {
    PageTransition.isTransitioning = false;
    var main = PageTransition.getMainElement();
    if (main) {
      main.classList.remove('page-exit');
    }
    PageTransition.enter();
  });

  window.PageTransition = PageTransition;
  window.restoreLanguage = PageTransition.restoreLanguage;
  window.saveLanguageBeforeExit = PageTransition.saveLanguageBeforeExit;
})();