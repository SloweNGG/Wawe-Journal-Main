// ============================================================
// HIZLI EKLE ÖN YÜKLEYİCİ (quick-add-boot.js) — perf parça 2a
// ============================================================
// Sayfa açılışında yalnızca bu küçük dosya yüklenir. Asıl Hızlı Ekle (~210 KB: broker-dictionary,
// broker-detector, fill-pairing, parser-v2, quick-modal-i18n, quick-add) ilk ihtiyaçta iner:
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
    var savedFontSize = localStorage.getItem('ww_font_size');
    var customTheme = localStorage.getItem('ww_custom_theme');

    if (savedTheme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }

    if (savedFontSize) {
      document.body.style.fontSize = savedFontSize + 'px';
    }

    if (savedTheme !== 'light' && customTheme) {
      try {
        var settings = JSON.parse(customTheme);
        var root = document.documentElement;
        if (settings.backgroundColor) root.style.setProperty('--bg', settings.backgroundColor);
        if (settings.surfaceColor) {
          root.style.setProperty('--surface', settings.surfaceColor);
          root.style.setProperty('--surface2', settings.surfaceColor);
        }
        if (settings.borderColor) root.style.setProperty('--border', settings.borderColor);
        if (settings.textColor) root.style.setProperty('--text', settings.textColor);
        if (settings.fontSize) document.body.style.fontSize = settings.fontSize + 'px';
      } catch (e) {}
    }
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

      var customTheme = localStorage.getItem('ww_custom_theme');
      if (customTheme && !isLight) {
        try {
          var settings = JSON.parse(customTheme);
          var root = document.documentElement;
          if (settings.backgroundColor) root.style.setProperty('--bg', settings.backgroundColor);
          if (settings.surfaceColor) {
            root.style.setProperty('--surface', settings.surfaceColor);
            root.style.setProperty('--surface2', settings.surfaceColor);
          }
          if (settings.borderColor) root.style.setProperty('--border', settings.borderColor);
          if (settings.textColor) root.style.setProperty('--text', settings.textColor);
          if (settings.fontSize) document.body.style.fontSize = settings.fontSize + 'px';
        } catch (e) {}
      }
    } catch (e) {}
  }

  window.addEventListener('storage', function(e) {
    if (e.key === 'ww_theme' || e.key === 'ww_custom_theme' || e.key === 'ww_font_size') {
      applyThemeFromStorage();
    }
  });

  document.addEventListener('themeChanged', function(e) {
    if (e.detail && e.detail.settings) {
      var settings = e.detail.settings;
      var root = document.documentElement;
      if (settings.backgroundColor) root.style.setProperty('--bg', settings.backgroundColor);
      if (settings.surfaceColor) {
        root.style.setProperty('--surface', settings.surfaceColor);
        root.style.setProperty('--surface2', settings.surfaceColor);
      }
      if (settings.borderColor) root.style.setProperty('--border', settings.borderColor);
      if (settings.textColor) root.style.setProperty('--text', settings.textColor);
      if (settings.fontSize) document.body.style.fontSize = settings.fontSize + 'px';
    }
  });
})();

(function (global) {
  'use strict';
  if (global.__wwQuickAddBoot) return;
  global.__wwQuickAddBoot = true;

  // Sıra önemli (her biri bir öncekini kullanır). ?v= derlemede build ID olur.
  var FILES = [
    '/interface/quick-add/js/broker-dictionary.js?v=__WW_BUILD_ID__',
    '/interface/quick-add/js/broker-detector.js?v=__WW_BUILD_ID__',
    '/interface/quick-add/js/fill-pairing.js?v=__WW_BUILD_ID__',
    '/interface/quick-add/js/parser-v2.js?v=__WW_BUILD_ID__',
    '/interface/quick-add/js/quick-modal-i18n.js?v=__WW_BUILD_ID__',
    '/interface/quick-add/js/quick-add.js?v=__WW_BUILD_ID__'
  ];

  // quick-add.js'teki ICONS.plus ile aynı
  var PLUS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

  var loading = null;

  function isReal() {
    return typeof global.quickAddOpen === 'function' && !global.quickAddOpen.__wwLazy;
  }

  function load() {
    if (isReal() && document.getElementById('quick-add-overlay')) return Promise.resolve();
    if (!loading) {
      loading = global.WwLazy.loadScriptsInOrder(FILES).then(function () {
        if (typeof global.quickAddInit === 'function') global.quickAddInit();
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
