// ============================================================
// HIZLI EKLE ÖN YÜKLEYİCİ (quick-add-boot.js) — perf parça 2a
// ============================================================
// Sayfa açılışında yalnızca bu küçük dosya yüklenir. Asıl Hızlı Ekle (~210 KB: broker-dictionary,
// broker-detector, fill-pairing, parser-v2, quick-modal-i18n, note-tools, quick-add) ilk ihtiyaçta iner:
//   - sağ alttaki + (FAB) butonu buradan, eskisiyle aynı anda ve aynı görünümde oluşturulur
//   - window.quickAddOpen bir vekildir: ilk çağrıda dosyaları yükler, modalı kurar, sonra açar
//     (navbar +, "N" kısayolu, boş liste butonları, onboarding görevi hepsi bunu çağırır).
//     Yükleme bitince quick-add.js gerçek quickAddOpen/quickAddClose ile bunun üzerine yazar.
//   - FAB'ın üstüne gelince / dokununca indirme önden başlar
//   - window.quickAddLoad() → Promise: başka kod Hızlı Ekle'ye ihtiyaç duyarsa bunu bekler
// Sayfa açılışında çalışması gereken tema kodu (body teması, yazı boyutu, özel renkler ve
// değişim dinleyicileri) quick-add.js'ten buraya taşındı; davranışı aynı.
// ============================================================

// ============================================================
// TEMA BAŞLATMA
// ============================================================

(function initQuickAddTheme() {
  try {
    var savedTheme = localStorage.getItem('ww_theme');

    if (savedTheme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }

    if (window.WWTheme) window.WWTheme.applyFont();

    if (window.WWTheme) window.WWTheme.apply();
  } catch (e) {}
})();

// ============================================================
// TEMA DEĞİŞİMİNİ DİNLE
// ============================================================

(function listenQuickAddThemeChanges() {
  function applyThemeFromStorage() {
    try {
      var savedTheme = localStorage.getItem('ww_theme');
      var isLight = savedTheme === 'light';
      document.body.classList.toggle('light-theme', isLight);

      if (window.WWTheme) window.WWTheme.apply();
    } catch (e) {}
  }

  window.addEventListener('storage', function(e) {
    if (e.key === 'ww_theme' || e.key === 'ww_custom_theme' || e.key === 'ww_font_size') {
      applyThemeFromStorage();
    }
  });

  document.addEventListener('themeChanged', function(e) {
  });
})();

(function (global) {
  'use strict';
  if (global.__wwQuickAddBoot) return;
  global.__wwQuickAddBoot = true;

  // Sıra önemli (her biri bir öncekini kullanır). ?v= derlemede dosyanın içerik hash'i olur.
  // note-tools.js (not alanının altındaki duygu çipleri + dikte) bağımsızdır; eskiden Layout her uygulama sayfasında
  // yüklüyordu, artık yalnızca Hızlı Ekle ile (ve add-trade sayfasında) iner. quick-add.js'ten önce: modal kurulunca
  // (#price-notes) sayfa gözlemcisi çubuğu ekler.
  var FILES = [
    '/interface/quick-add/js/broker-dictionary.js?v=__WW_BUILD_ID__',
    '/interface/quick-add/js/broker-detector.js?v=__WW_BUILD_ID__',
    '/interface/quick-add/js/fill-pairing.js?v=__WW_BUILD_ID__',
    '/interface/quick-add/js/parser-v2.js?v=__WW_BUILD_ID__',
    '/interface/quick-add/js/quick-modal-i18n.js?v=__WW_BUILD_ID__',
    '/components/note-tools/note-tools.js?v=__WW_BUILD_ID__',
    '/interface/quick-add/js/quick-add.js?v=__WW_BUILD_ID__'
  ];
  var NOTE_CSS = '/components/note-tools/note-tools.css?v=__WW_BUILD_ID__';

  // quick-add.js'teki ICONS.plus ile aynı
  var PLUS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

  var loading = null;

  function isReal() {
    return typeof global.quickAddOpen === 'function' && !global.quickAddOpen.__wwLazy;
  }

  // note-tools.css: head'e çalışma anında eklenir (data-ssr yok: SPA geçişinde silinmez). add-trade'in kendi
  // (sunucudan gelen) bağlantısına güvenilmez, o sayfadan çıkınca SPA onu kaldırır. Açılış CSS'i bekler (çubuk stilsiz
  // görünmesin); yüklenemezse de (onerror) engellemez.
  function loadNoteCss() {
    if (document.querySelector('link[data-ww-note-css]')) return Promise.resolve();
    return new Promise(function (resolve) {
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = NOTE_CSS;
      l.setAttribute('data-ww-note-css', '');
      l.onload = l.onerror = function () { resolve(); };
      document.head.appendChild(l);
    });
  }

  function load() {
    if (isReal() && document.getElementById('quick-add-overlay')) return Promise.resolve();
    if (!loading) {
      var css = loadNoteCss();
      loading = global.WwLazy.loadScriptsInOrder(FILES).then(function () {
        if (typeof global.quickAddInit === 'function') global.quickAddInit();
        return css;
      });
      loading.catch(function () { loading = null; });
    }
    return loading;
  }

  function failMessage() {
    var msg = (global.i18n && typeof global.i18n.t === 'function')
      ? global.i18n.t('analytics_dash.quick_add_error')
      : 'Quick Add yüklenemedi. Sayfayı yenileyin.';
    if (!msg || msg === 'analytics_dash.quick_add_error') msg = 'Quick Add yüklenemedi. Sayfayı yenileyin.';
    if (typeof global.showToast === 'function') global.showToast(msg, 'error');
    else alert(msg);
  }

  // Tıklanan tetikleyici (bekleme durumu için): inline onclick'lerde window.event dolu
  function currentTrigger() {
    var ev = global.event;
    var t = ev && ev.target && ev.target.closest ? ev.target.closest('button, a, [role="button"]') : null;
    return t || document.getElementById('quick-add-fab');
  }

  function lazyOpen() {
    var p = load();
    global.WwLazy.busy(currentTrigger(), p);
    return p.then(function () {
      if (isReal()) global.quickAddOpen();
    }, function (err) {
      if (global.wwLog) global.wwLog.error('[quick-add] yüklenemedi:', err);
      failMessage();
    });
  }
  lazyOpen.__wwLazy = true;

  global.quickAddOpen = lazyOpen;
  global.quickAddClose = function () {}; // yüklenmeden önce açık pencere yok
  global.quickAddLoad = load;

  function prefetch() {
    load().catch(function () {});
  }

  // quick-add.js'teki createFab ile aynı buton, aynı anda (DOMContentLoaded + 100 ms)
  function createFab() {
    if (document.getElementById('quick-add-fab')) return;
    try {
      var fab = document.createElement('button');
      fab.id = 'quick-add-fab';
      fab.className = 'quick-add-fab';
      fab.setAttribute('aria-label', 'Add Trade');
      fab.title = 'Add Trade';
      fab.innerHTML = PLUS_ICON;
      fab.addEventListener('click', function () { global.quickAddOpen(); });
      fab.addEventListener('pointerenter', prefetch, { once: true });
      fab.addEventListener('touchstart', prefetch, { once: true, passive: true });
      fab.addEventListener('focus', prefetch, { once: true });
      document.body.appendChild(fab);
    } catch (e) {
      if (global.wwLog) global.wwLog.error('FAB oluşturulamadı:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(createFab, 100); });
  } else {
    setTimeout(createFab, 100);
  }
})(window);
