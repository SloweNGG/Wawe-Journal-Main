// ============================================================
// PAGE-TRANSITION.JS - components/navbar/page-transition.js
// Ultra-Hızlı ve Pürüzsüz Sayfa Geçişi + Akıllı Link Prefetching + Dil Koruma
// ============================================================

(function() {
  // ── URL NORMALİZASYONU ──────────────────────────────────────
  // Cloudflare Pages "/dashboard.html" isteğini 308 ile "/dashboard"a
  // yönlendiriyor. Her geçişte bu fazladan ağ turu atılmasın diye
  // iç linklere doğrudan temiz URL ile gidiyoruz.
  function normalizeUrl(href) {
    try {
      var u = new URL(href, window.location.href);
      if (u.origin !== window.location.origin) return href;
      var path = u.pathname;
      if (/\/index\.html$/.test(path)) {
        path = path.slice(0, -'index.html'.length);
      } else if (/\.html$/.test(path)) {
        path = path.slice(0, -'.html'.length);
      }
      return path + u.search + u.hash;
    } catch (e) {
      return href;
    }
  }

  // ── DURUM PARMAK İZİ ────────────────────────────────────────
  // Önceden hazırlanmış (prerender) veya geri tuşuyla geri gelen (bfcache)
  // bir sayfa, hazırlandığı andaki veriyi/ayarları gösterir. Arada işlem
  // eklenmiş, dil/tema/defter değişmişse bunu storage içeriğinden anlarız.
  // Sürekli değişen ama ekranı etkilemeyen anahtarlar (auth token yenileme,
  // zaman damgaları) hariç tutulur.
  var VOLATILE_KEY = /^sb-|_time$|^ww_last_active_push$/;

  function stateFingerprint() {
    var parts = [];
    try {
      [localStorage, sessionStorage].forEach(function(store, s) {
        for (var i = 0; i < store.length; i++) {
          var k = store.key(i);
          if (!k || VOLATILE_KEY.test(k)) continue;
          parts.push(s + ':' + k + '=' + store.getItem(k));
        }
      });
    } catch (e) {
      // Storage okunamıyorsa her seferinde "değişti" say (güvenli taraf)
      return String(Math.random());
    }
    return parts.sort().join('\n');
  }

  function hasSession() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && /^sb-.+-auth-token$/.test(k) && localStorage.getItem(k)) return true;
      }
    } catch (e) {
      return true; // emin değilsek kullanıcıyı atmayalım
    }
    return false;
  }

  // ── PREFETCH / PRERENDER ────────────────────────────────────
  // Uygulama sayfaları, link üzerine gelindiğinde (Chrome/Edge'de) arka
  // planda JS ve veri dahil TAMAMEN hazırlanır; tıklayınca anında açılır.
  // Desteklemeyen tarayıcılarda sadece HTML önceden indirilir.
  var APP_PATHS = ['/dashboard', '/trades', '/calendar', '/strategies', '/journals',
    '/premium-dashboard', '/my-earnings', '/settings', '/backtest', '/add-trade', '/report-bug'];
  var PRERENDER_MAX_AGE_MS = 60 * 1000;
  var MAX_PRERENDERS = 2;
  var HOVER_INTENT_MS = 80;

  var supportsPrerender = false;
  try {
    supportsPrerender = !!(HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules'));
  } catch (e) {}

  // Bayat bulunup iptal edilen bir URL bu süre boyunca yeniden hazırlanmaz.
  // Chrome, aynı URL'nin kuralı kaldırılıp hemen geri eklenirse bunu değişiklik
  // saymıyor ve eski (bayat) sayfayı açmaya devam ediyor.
  var RESTART_COOLDOWN_MS = 1000;

  var prefetchedUrls = new Set();
  var prerenders = []; // { url, script, startedAt, fingerprint }
  var cancelledAt = {}; // url -> zaman

  function pathOf(url) {
    return url.split('#')[0].split('?')[0];
  }

  function isAppPath(url) {
    return APP_PATHS.indexOf(pathOf(url)) !== -1;
  }

  function canPrerender(url) {
    if (!supportsPrerender || !isAppPath(url)) return false;
    // Premium olmayan kullanıcı premium-dashboard'a tıklayınca upgrade modalı açılıyor
    if (pathOf(url) === '/premium-dashboard') {
      try {
        var plan = sessionStorage.getItem('ww_user_plan') || localStorage.getItem('ww_user_plan');
        if (plan !== 'premium') return false;
      } catch (e) {
        return false;
      }
    }
    return true;
  }

  function cancelPrerender(entry) {
    try { entry.script.remove(); } catch (e) {}
    prerenders = prerenders.filter(function(p) { return p !== entry; });
  }

  function isPrerenderFresh(entry) {
    return (Date.now() - entry.startedAt) < PRERENDER_MAX_AGE_MS &&
      entry.fingerprint === stateFingerprint();
  }

  function discardIfStale(entry) {
    if (isPrerenderFresh(entry)) return false;
    cancelPrerender(entry);
    cancelledAt[entry.url] = Date.now();
    return true;
  }

  function startPrerender(url) {
    var existing = prerenders.filter(function(p) { return p.url === url; })[0];
    if (existing && !discardIfStale(existing)) return;
    if (Date.now() - (cancelledAt[url] || 0) < RESTART_COOLDOWN_MS) return;
    while (prerenders.length >= MAX_PRERENDERS) cancelPrerender(prerenders[0]);

    try {
      var script = document.createElement('script');
      script.type = 'speculationrules';
      script.textContent = JSON.stringify({
        prerender: [{ source: 'list', urls: [url], eagerness: 'immediate' }]
      });
      document.head.appendChild(script);
      prerenders.push({ url: url, script: script, startedAt: Date.now(), fingerprint: stateFingerprint() });
    } catch (e) {}
  }

  // Tıklamadan hemen önce: hazırlanan sayfa bayatsa iptal et, normal yüklensin
  function discardStalePrerender(url) {
    prerenders.slice().forEach(function(entry) {
      if (entry.url === url) discardIfStale(entry);
    });
  }

  // Bulunduğumuz sayfa SPA router'ı yüklediyse (Layout spa={true}) ve hedef de
  // SPA sayfasıysa, geçiş sayfa yenilenmeden yapılır (bkz. SpaRouter.astro)
  function canSpaNavigate(url) {
    try {
      return !!(window.wwSpa && window.wwSpa.canHandle(url));
    } catch (e) {
      return false;
    }
  }

  function prefetchUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return;

    // Harici linkleri, anchor ve protokolleri es geç
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('//') ||
        rawUrl.startsWith('#') || rawUrl.startsWith('javascript:') || rawUrl.startsWith('mailto:')) {
      return;
    }

    var url = normalizeUrl(rawUrl).split('#')[0];
    // .pdf, .csv gibi dosya linklerini es geç
    if (/\.[a-z0-9]+$/i.test(pathOf(url))) return;
    // Bulunduğumuz sayfayı hazırlamaya gerek yok
    if (pathOf(url) === window.location.pathname) return;

    // SPA ile açılacaksa sadece HTML'i önceden çek (prerender burada işe yaramaz)
    if (canSpaNavigate(url)) {
      window.wwSpa.prefetch(url);
      return;
    }

    if (canPrerender(url)) {
      startPrerender(url);
      return;
    }

    if (prefetchedUrls.has(url)) return;
    prefetchedUrls.add(url);
    try {
      var link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = url;
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

      var targetUrl = normalizeUrl(targetHref);

      // Sayfa yenilemeden geçiş: router önceki geçişi kendisi iptal eder,
      // bu yüzden hızlı ardışık tıklamalarda kilitlemeye gerek yok
      if (canSpaNavigate(targetUrl)) {
        this.isTransitioning = false;
        window.wwSpa.navigate(targetUrl);
        return;
      }

      var main = this.getMainElement();
      if (main) {
        main.classList.remove('page-enter');
        main.classList.add('page-exit');
      }

      discardStalePrerender(targetUrl.split('#')[0]);

      setTimeout(function() {
        window.location.href = targetUrl;
      }, 40);
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
          (window.WwJournalMark ? window.WwJournalMark.forJournal({ id: opts.id, color: c }, { dotSize: 9 }) : '') +
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
        if (swIcon && window.WwJournalMark) swIcon.innerHTML = window.WwJournalMark.forJournal(targetJournal, { dotSize: 9 });
      }

      var color = targetJournal.color || '#7c6dfa';
      var icon = targetJournal.icon || 'folder';
      var name = targetJournal.name || defaultAccountText;

      this.showTransitHUD({ id: targetJournal.id, name: name, icon: icon, color: color, state: 'switching' });

      var main = this.getMainElement();
      if (main) {
        main.classList.remove('journal-switching-in', 'journal-switching-in-active');
        main.classList.add('journal-switching-out');
      }

      try {
        localStorage.setItem('ww_active_journal_id', targetJournal.id);
        localStorage.setItem('ww_active_journal_name', name);

        // Hedef hesabın prop rozetini ve cTrader durumunu önbellekte anında hazırla
        var rawProps = localStorage.getItem('ww_cached_props_map');
        if (rawProps) {
          try {
            var pMap = JSON.parse(rawProps);
            var targetProp = pMap[targetJournal.id];
            if (targetProp) {
              var resolver = window.getPropFirmInfo || (window.PropTemplates && window.PropTemplates.getPropFirmInfo);
              var firm = (targetProp.rules && targetProp.rules.firm) || (window.PropTemplates && window.PropTemplates.getPropTemplate(targetProp.template_key) && window.PropTemplates.getPropTemplate(targetProp.template_key).firm) || 'Prop';
              var pInfo = typeof resolver === 'function' ? resolver(firm || targetProp.template_key) : null;
              if (pInfo) {
                var logoSrc = pInfo.symbolLogo || pInfo.logo;
                var badgeHtml = '<span class="nav-prop-tag nav-prop-firm-tag ' + (pInfo.badgeClass || '') + '"><img src="' + logoSrc + '" class="nav-prop-mini-icon" alt="" />' + pInfo.name + '</span>';
                localStorage.setItem('ww_active_prop_badge_html', badgeHtml);
              } else {
                localStorage.setItem('ww_active_prop_badge_html', '<span class="nav-prop-tag">PROP</span>');
              }
            } else {
              localStorage.removeItem('ww_active_prop_badge_html');
            }
          } catch(pe) {}
        }

        // Hedef hesabın işareti (renk noktası; bağlıysa yanıp söner): sayfa açılırken anında basılsın
        if (window.WwJournalMark) {
          localStorage.setItem('ww_active_journal_icon_html', window.WwJournalMark.forJournal(targetJournal, { dotSize: 9 }));
        }

        var rawCt = localStorage.getItem('ww_cached_ctrader_map');
        if (rawCt) {
          try {
            var ctMap = JSON.parse(rawCt);
            var targetCt = ctMap[targetJournal.id];
            if (targetCt) {
              var dotCls = targetCt.is_live ? 'live' : 'demo';
              var dotTit = 'cTrader ' + (targetCt.is_live ? 'Live' : 'Demo') + ' (' + (targetCt.broker_name || 'Hesap') + ')';
              localStorage.setItem('ww_active_ctrader_dot_html', '<span class="ctrader-status-dot ' + dotCls + '" id="nav-ctrader-dot" title="' + dotTit + '"></span>');
            } else {
              localStorage.removeItem('ww_active_ctrader_dot_html');
            }
          } catch(cte) {}
        }

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
          id: data.id,
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

      // Fare link üzerinde kısa bir süre durursa (menü üzerinden geçerken her
      // linki boşuna hazırlamamak için) veya dokunulduğunda/basıldığında hazırla
      var hoverTimer = null;
      var hoverLink = null;

      function internalLinkFrom(target) {
        var a = target && target.closest ? target.closest('a[href]') : null;
        return (a && PageTransition.isInternalNavLink(a)) ? a : null;
      }

      document.addEventListener('mouseover', function(e) {
        var a = internalLinkFrom(e.target);
        if (a === hoverLink) return;
        hoverLink = a;
        clearTimeout(hoverTimer);
        if (!a) return;
        hoverTimer = setTimeout(function() {
          prefetchUrl(a.getAttribute('href'));
        }, HOVER_INTENT_MS);
      }, { passive: true });

      function prefetchNow(e) {
        var a = internalLinkFrom(e.target);
        if (a) prefetchUrl(a.getAttribute('href'));
      }
      document.addEventListener('touchstart', prefetchNow, { passive: true });
      document.addEventListener('mousedown', prefetchNow, { passive: true });

      // Link tıklamalarında pürüzsüz micro-exit animasyonu
      document.addEventListener('click', function(e) {
        // Yeni sekmede açma veya tuş kombinasyonlarını tarayıcıya bırak
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0 || e.defaultPrevented) return;

        var a = e.target.closest('a[href]');
        if (!a || !PageTransition.isInternalNavLink(a)) return;

        var href = a.getAttribute('href');
        var targetUrl = new URL(a.href, window.location.href);
        var samePath = pathOf(normalizeUrl(href)) === pathOf(normalizeUrl(window.location.pathname));

        // SPA geçişi sürerken bulunduğumuz sayfanın linkine tıklandıysa kullanıcı
        // geçişten vazgeçmiştir: router'a gönder, bekleyen geçişi iptal etsin
        if (samePath && spaNavTarget !== null && !targetUrl.hash && canSpaNavigate(href)) {
          e.preventDefault();
          PageTransition.exit(href);
          return;
        }

        // Zaten aynı sayfadaysak (veya sadece anchor ise) tarayıcıya bırak veya iptal et
        if (samePath && (!targetUrl.search || targetUrl.search === window.location.search)) {
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

  // SPA geçişi takibi: en son istenen sayfa. Hızlı ardışık tıklamalarda atlanan
  // ara geçişler de swap yapabildiği için ancak son hedefe varılınca bitmiş sayılır.
  var spaNavTarget = null;
  document.addEventListener('astro:before-preparation', function(e) {
    spaNavTarget = e.to ? e.to.pathname : null;
  });

  // SPA geçişi: View Transitions API olmayan tarayıcılarda içerik giriş animasyonu
  document.addEventListener('astro:after-swap', function() {
    if (spaNavTarget === window.location.pathname) spaNavTarget = null;
    PageTransition.isTransitioning = false;
    if (!document.startViewTransition) PageTransition.enter();
  });

  // Tarayıcı İleri/Geri (bfcache) desteği
  var fingerprintAtHide = null;
  window.addEventListener('pagehide', function(e) {
    if (e.persisted) fingerprintAtHide = stateFingerprint();
  });

  window.addEventListener('pageshow', function(e) {
    // Geri tuşuyla hafızadan geri gelen sayfa: çıkış yapıldıysa gösterme,
    // arada veri/ayar değiştiyse güncel haliyle yeniden yükle
    if (e.persisted && isAppPath(window.location.pathname)) {
      if (!hasSession()) {
        window.location.replace('/login');
        return;
      }
      if (fingerprintAtHide !== null && fingerprintAtHide !== stateFingerprint()) {
        window.location.reload();
        return;
      }
    }

    // Sayfadan ayrılmadan hazırlanan sayfalar artık geçersiz
    prerenders.slice().forEach(cancelPrerender);

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