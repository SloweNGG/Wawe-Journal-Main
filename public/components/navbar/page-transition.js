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

  function t(key, fallback) {
    try {
      if (typeof window !== 'undefined' && window.i18n && typeof window.i18n.t === 'function') {
        var res = window.i18n.t(key);
        if (res && res !== key) return res;
      }
    } catch (e) {}

    try {
      var lang = (typeof localStorage !== 'undefined' && localStorage.getItem('ww_language')) ||
                 (typeof document !== 'undefined' && document.documentElement.getAttribute('data-lang')) || 'en';
      var dict = {
        tr: {
          'journal.transit_active': 'Aktif',
          'journal.transit_switching': 'Geçiliyor',
          'journal.transit_ready': 'Hazır',
          'journal.default_account': 'Hesap'
        },
        en: {
          'journal.transit_active': 'Active',
          'journal.transit_switching': 'Switching',
          'journal.transit_ready': 'Ready',
          'journal.default_account': 'Account'
        },
        de: {
          'journal.transit_active': 'Aktiv',
          'journal.transit_switching': 'Wechseln',
          'journal.transit_ready': 'Bereit',
          'journal.default_account': 'Konto'
        }
      };
      if (dict[lang] && dict[lang][key]) return dict[lang][key];
    } catch (e) {}

    return fallback;
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

      // Navbar sekmesini anında hedef sayfaya geçir (pürüzsüz geçiş hissi)
      try {
        var cleanTarget = (targetHref || '').split('?')[0].split('#')[0];
        document.querySelectorAll('.nav-links a').forEach(function(link) {
          var href = (link.getAttribute('href') || '').split('?')[0].split('#')[0];
          if (href && href === cleanTarget) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      } catch (e) {}

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

    showTransitHUD: function(opts) {
      opts = opts || {};
      var existing = document.getElementById('wj-journal-transit-hud');
      if (existing) existing.remove();

      var hud = document.createElement('div');
      hud.id = 'wj-journal-transit-hud';
      hud.className = 'wj-journal-transit-hud';
      var c = opts.color || '#7c6dfa';
      hud.style.setProperty('--transit-color', c);
      hud.style.setProperty('--transit-glow', c + '35');

      var isReady = opts.state === 'ready';
      var statusText = isReady ? t('journal.transit_active', 'Aktif') : t('journal.transit_switching', 'Geçiliyor');
      var readyText = t('journal.transit_ready', 'Hazır');
      var defaultAccountText = t('journal.default_account', 'Hesap');
      var statusHtml = isReady
        ? '<span class="wj-journal-transit-ready"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> ' + readyText + '</span>'
        : '<div class="wj-journal-transit-spinner"></div>';

      hud.innerHTML =
        '<div class="wj-journal-transit-icon" style="color:' + c + '; background:' + c + '16; border-color:' + c + '35;">' +
          '<i data-lucide="' + (opts.icon || 'folder') + '"></i>' +
        '</div>' +
        '<div class="wj-journal-transit-text">' +
          '<span class="wj-journal-transit-name">' + (opts.name || defaultAccountText) + '</span>' +
          '<span class="wj-journal-transit-dot"></span>' +
          '<span class="wj-journal-transit-sub">' + statusText + '</span>' +
        '</div>' +
        statusHtml;

      document.body.appendChild(hud);
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

      requestAnimationFrame(function() {
        hud.classList.add('visible');
      });

      if (isReady) {
        setTimeout(function() {
          hud.classList.remove('visible');
          hud.classList.add('hiding');
          setTimeout(function() { hud.remove(); }, 180);
        }, 500);
      }
    },

    switchJournal: function(targetJournal, redirectUrl) {
      if (!targetJournal || !targetJournal.id) return;
      if (this.isTransitioning) return;
      this.isTransitioning = true;
      window.__wj_journal_transitioning = true;

      var currentId = localStorage.getItem('ww_active_journal_id');
      if (targetJournal.id === currentId && !redirectUrl) {
        this.isTransitioning = false;
        window.__wj_journal_transitioning = false;
        return;
      }

      var defaultAccountText = t('journal.default_account', 'Hesap');
      var sw = document.getElementById('nav-journal-switcher');
      if (sw) {
        sw.classList.remove('open');
        sw.classList.add('morphing');
        var swName = sw.querySelector('.journal-name');
        var swIcon = sw.querySelector('.journal-icon');
        var oldBadge = sw.querySelector('.nav-prop-tag');
        if (oldBadge) oldBadge.remove();
        if (swName) swName.textContent = targetJournal.name || defaultAccountText;
        if (swIcon) swIcon.setAttribute('data-lucide', targetJournal.icon || 'folder');
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      }

      var color = targetJournal.color || '#7c6dfa';
      var icon = targetJournal.icon || 'folder';
      var name = targetJournal.name || defaultAccountText;

      this.showTransitHUD({ name: name, icon: icon, color: color, state: 'switching' });

      var main = this.getMainElement();
      if (main) {
        main.classList.remove('journal-switching-in', 'journal-switching-in-active');
        main.classList.add('journal-switching-out');
      }

      try {
        localStorage.setItem('ww_active_journal_id', targetJournal.id);
        sessionStorage.setItem('ww_journal_transit', JSON.stringify({
          id: targetJournal.id,
          name: name,
          icon: icon,
          color: color
        }));
      } catch (e) {}

      try {
        window.dispatchEvent(new CustomEvent('journal-changed', {
          detail: { id: targetJournal.id, oldId: currentId }
        }));
      } catch (e) {}

      setTimeout(function() {
        if (redirectUrl) {
          window.location.href = redirectUrl;
        } else if (window.location.pathname.includes('/journals')) {
          window.location.href = '/dashboard.html';
        } else {
          window.location.reload();
        }
      }, 135);
    },

    checkJournalTransitArrival: function() {
      try {
        var raw = sessionStorage.getItem('ww_journal_transit');
        if (!raw) return;
        var data = JSON.parse(raw);
        sessionStorage.removeItem('ww_journal_transit');

        var main = this.getMainElement();
        if (main) {
          main.classList.add('journal-switching-in');
        }

        this.showTransitHUD({
          name: data.name,
          icon: data.icon,
          color: data.color,
          state: 'ready'
        });

        requestAnimationFrame(function() {
          requestAnimationFrame(function() {
            if (main) {
              main.classList.remove('journal-switching-in');
              main.classList.add('journal-switching-in-active');
            }
          });
        });

        setTimeout(function() {
          if (main) {
            main.classList.remove('journal-switching-in-active');
          }
        }, 220);
      } catch (e) {}
    },

    init: function() {
      this.restoreLanguage();
      this.checkJournalTransitArrival();
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
          if (targetUrl.hash && targetUrl.hash.startsWith('#panel-')) {
            e.preventDefault();
            var pId = targetUrl.hash.replace('#', '');
            if (typeof window.switchPanel === 'function') {
              window.switchPanel(pId);
            }
            window.scrollTo({ top: 0, behavior: 'instant' });
            return;
          }
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
  window.switchJournalWithAnimation = function(targetJournal, redirectUrl) {
    PageTransition.switchJournal(targetJournal, redirectUrl);
  };
  window.restoreLanguage = PageTransition.restoreLanguage;
  window.saveLanguageBeforeExit = PageTransition.saveLanguageBeforeExit;
})();