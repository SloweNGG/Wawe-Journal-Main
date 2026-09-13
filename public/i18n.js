// ============================================================
// WAWE JOURNAL – i18n.js (CORE + LAZY LOADER)
// ⭐ PERFORMANS: Dil dosyaları ayrı ve lazy yükleniyor.
//    - Sadece aktif dil + İngilizce fallback çekilir
//    - ~%60 daha az JS parse süresi, ~%80 daha az transfer
//    - Kritik anahtarlar için sync fallback dict (FOUC önleme)
//
// ⭐ FIX: setLanguage() artık Promise<boolean> döner.
//    Böylece `await i18n.setLanguage('tr')` çağrısı, dil dosyası
//    yüklendikten ve DOM'a uygulandıktan sonra resolve olur.
//    (settings.js dil değiştirme sorunu düzeltildi)
//
// ⚙️ Yapılandırma:
//    window.WW_I18N_PATH = '/i18n/locales/'  (varsayılan: './i18n/locales/')
//    İstersen HTML'de <head> içinde override edebilirsin.
// ============================================================

(function () {
  'use strict';

  // ⭐ Dil dosyalarının yolu (varsayılan: site köküne göre)
  var I18N_PATH = (typeof window !== 'undefined' && window.WW_I18N_PATH)
    ? window.WW_I18N_PATH
    : './i18n/locales/';

  var SUPPORTED_LANGS = ['en', 'tr', 'de'];

  // ⭐ SYNC FALLBACK — dil dosyası yüklenene kadar (~50ms) gösterilecek metinler
  //    Bu sözlüğü minimum tut! Sadece ilk boyamada görünecek kritik metinler.
  //    (İngilizce fallback olduğu için EN değerleri kullanılıyor)
  var CRITICAL_FALLBACK = {
    'app_name': 'Journal',
    'nav.dashboard': 'Dashboard',
    'nav.trades': 'Trades',
    'nav.strategies': 'Strategies',
    'nav.calendar': 'Calendar',
    'nav.settings': 'Settings',
    'nav.logout': 'Logout',
    'nav.premium': 'Premium',
    'nav.login': 'Login',
    'nav.register': 'Register',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.close': 'Close',
    'common.load_error': 'Failed to load: ',
    'common.unexpected_error': 'Something went wrong.',
    'common.db_connection_error': 'No database connection!',
    'toast.csv_exported': 'CSV downloaded!',
    'toast.pdf_exported': 'PDF downloaded!',
    'toast.no_trades_export': 'No trades to export.'
  };

  // ════════════════════════════════════════════════════════════
  // I18n SINIFI
  // ════════════════════════════════════════════════════════════
  function I18n(defaultLang) {
    this.defaultLang = defaultLang || 'en';
    this.currentLang = this.defaultLang;
    this.listeners = [];
    this.translations = {};       // { en: {...}, tr: {...}, de: {...} }
    this._loadedLangs = {};
    this._applyCounter = 0;
    this._isReady = false;
    this._readyPromise = null;

    // localStorage'dan kayıtlı dili oku
    var savedLang = null;
    try { savedLang = localStorage.getItem('ww_language'); } catch (e) {}

    if (savedLang && SUPPORTED_LANGS.indexOf(savedLang) !== -1) {
      this.currentLang = savedLang;
    } else {
      this.currentLang = this.defaultLang;
      try { localStorage.setItem('ww_language', this.defaultLang); } catch (e) {}
    }
  }

  // ⭐ Belirli bir dili async yükle (cache'li)
  I18n.prototype.loadLanguage = async function (lang) {
    if (this._loadedLangs[lang]) return this._loadedLangs[lang];
    if (SUPPORTED_LANGS.indexOf(lang) === -1) return null;

    try {
      var url = I18N_PATH + lang + '.js';
      var mod = await import(/* @vite-ignore */ url);
      var dict = (mod && mod.default) ? mod.default : mod;

      this._loadedLangs[lang] = dict;
      this.translations[lang] = dict;

      if (typeof wwLog !== 'undefined' && wwLog.log) {
        wwLog.log('[i18n] Loaded ' + lang + ' (' + Object.keys(dict).length + ' keys)');
      }
      return dict;
    } catch (e) {
      if (typeof wwLog !== 'undefined' && wwLog.warn) {
        wwLog.warn('[i18n] Failed to load ' + lang, e);
      }
      return null;
    }
  };

  // ⭐ İlk yükleme (async) — window.i18nReady promise döner
  I18n.prototype.initAsync = function () {
    if (this._readyPromise) return this._readyPromise;
    var self = this;

    this._readyPromise = (async function () {
      var active = self.currentLang;
      var promises = [];

      // Her zaman İngilizce (fallback için)
      promises.push(self.loadLanguage('en'));

      // Aktif dil İngilizce değilse onu da yükle
      if (active !== 'en') {
        promises.push(self.loadLanguage(active));
      }

      await Promise.all(promises);
      self._isReady = true;

      // İlk apply (DOM'daki tüm [data-i18n] elemanları çevrilir)
      self.apply();

      if (typeof wwLog !== 'undefined' && wwLog.log) {
        wwLog.log('[i18n] Ready. Language: ' + self.currentLang);
      }
    })();

    return this._readyPromise;
  };

  // ⭐ Çeviri — sync, i18nReady öncesi de çağrılabilir
  I18n.prototype.t = function (key, params) {
    params = params || {};

    var text =
      (this.translations[this.currentLang] && this.translations[this.currentLang][key]) ||
      (this.translations[this.defaultLang] && this.translations[this.defaultLang][key]) ||
      CRITICAL_FALLBACK[key] ||
      key;

    if (params && typeof params === 'object') {
      var keys = Object.keys(params);
      for (var i = 0; i < keys.length; i++) {
        var p = keys[i];
        text = text.replace(new RegExp('{{' + p + '}}', 'g'), params[p]);
      }
    }
    return text;
  };

  // ⭐ Dil değiştir — ASYNC: Promise<boolean> döner
  //    await i18n.setLanguage('tr') → dosya yüklendikten sonra apply edilir
  I18n.prototype.setLanguage = function (lang) {
    if (SUPPORTED_LANGS.indexOf(lang) === -1) {
      if (typeof wwLog !== 'undefined' && wwLog.warn) {
        wwLog.warn('[i18n] Unknown language: ' + lang);
      }
      return Promise.resolve(false);
    }

    // Zaten bu dilde, dosya yüklü ve DOM'a uygulanmışsa sadece apply et
    if (this.currentLang === lang &&
        document.documentElement.getAttribute('data-lang') === lang &&
        this._loadedLangs[lang]) {
      this.apply();
      return Promise.resolve(true);
    }

    var self = this;
    var callId = ++this._applyCounter;

    return (async function () {
      // 1) Dil dosyasını yükle (gerekirse)
      if (!self._loadedLangs[lang]) {
        await self.loadLanguage(lang);
      }

      // 2) Daha yeni bir çağrı varsa iptal (race condition guard)
      if (self._applyCounter !== callId) return false;

      // 3) State'i güncelle
      self.currentLang = lang;
      try { localStorage.setItem('ww_language', lang); } catch (e) {}
      document.documentElement.setAttribute('data-lang', lang);

      // 4) DOM'a uygula + listener'ları tetikle
      self._applyInternal(callId);
      return true;
    })();
  };

  I18n.prototype._applyInternal = function (callId) {
    if (this._applyCounter !== callId) return;
    this.apply();

    for (var i = 0; i < this.listeners.length; i++) {
      try { this.listeners[i](this.currentLang); } catch (e) {}
    }
  };

  I18n.prototype.getCurrentLanguage = function () {
    return this.currentLang;
  };

  // ════════════════════════════════════════════════════════════
  // apply() — TÜM data-i18n ATTRIBUTE'LARINI GÜNCELLER
  // ════════════════════════════════════════════════════════════
  I18n.prototype.apply = function () {
    var lang = this.currentLang;
    document.documentElement.lang = lang;
    document.documentElement.setAttribute('data-lang', lang);

    var self = this;

    // data-i18n → textContent
    var textEls = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < textEls.length; i++) {
      var el = textEls[i];
      var key = el.getAttribute('data-i18n');
      if (!key) continue;

      var params = {};
      var paramsAttr = el.getAttribute('data-i18n-params');
      if (paramsAttr) {
        try { params = JSON.parse(paramsAttr); } catch (e) {}
      }

      var text = self.t(key, params);
      if (text !== key && el.textContent !== text) el.textContent = text;
    }

    // data-i18n-html → innerHTML
    var htmlEls = document.querySelectorAll('[data-i18n-html]');
    for (var j = 0; j < htmlEls.length; j++) {
      var elH = htmlEls[j];
      var keyH = elH.getAttribute('data-i18n-html');
      if (!keyH) continue;

      var paramsH = {};
      var paramsAttrH = elH.getAttribute('data-i18n-params');
      if (paramsAttrH) {
        try { paramsH = JSON.parse(paramsAttrH); } catch (e) {}
      }

      var textH = self.t(keyH, paramsH);
      if (textH !== keyH && elH.innerHTML !== textH) elH.innerHTML = textH;
    }

    // data-i18n-placeholder → placeholder
    var phEls = document.querySelectorAll('[data-i18n-placeholder]');
    for (var k = 0; k < phEls.length; k++) {
      var elP = phEls[k];
      var keyP = elP.getAttribute('data-i18n-placeholder');
      if (!keyP) continue;
      var textP = self.t(keyP);
      if (textP !== keyP && elP.placeholder !== textP) elP.placeholder = textP;
    }

    // data-i18n-title → title attribute
    var titleEls = document.querySelectorAll('[data-i18n-title]');
    for (var m = 0; m < titleEls.length; m++) {
      var elT = titleEls[m];
      var keyT = elT.getAttribute('data-i18n-title');
      if (!keyT) continue;
      var textT = self.t(keyT);
      if (textT !== keyT && elT.title !== textT) elT.title = textT;
    }

    if (typeof wwLog !== 'undefined' && wwLog.log) {
      wwLog.log('[i18n] apply: ' + lang +
        ' (text:' + textEls.length +
        ', html:' + htmlEls.length +
        ', ph:' + phEls.length + ')');
    }
  };

  I18n.prototype.onChange = function (cb) {
    if (typeof cb === 'function') this.listeners.push(cb);
  };

  I18n.prototype.refresh = function () {
    var saved = null;
    try { saved = localStorage.getItem('ww_language'); } catch (e) {}

    if (saved && saved !== this.currentLang && SUPPORTED_LANGS.indexOf(saved) !== -1) {
      var self = this;
      (async function () {
        await self.loadLanguage(saved);
        self.currentLang = saved;
        self.apply();
      })();
    } else {
      this.apply();
    }
    return this.currentLang;
  };

  I18n.prototype.syncStorageOnly = function (lang) {
    if (SUPPORTED_LANGS.indexOf(lang) === -1) return false;
    try { localStorage.setItem('ww_language', lang); } catch (e) {}
    return true;
  };

  I18n.prototype.getSavedLanguage = function () {
    try { return localStorage.getItem('ww_language') || this.defaultLang; }
    catch (e) { return this.defaultLang; }
  };

  I18n.prototype.resolveLanguageConflict = function (dbLang) {
    var saved = this.getSavedLanguage();
    if (saved && SUPPORTED_LANGS.indexOf(saved) !== -1) return saved;
    if (dbLang && SUPPORTED_LANGS.indexOf(dbLang) !== -1) {
      try { localStorage.setItem('ww_language', dbLang); } catch (e) {}
      return dbLang;
    }
    return this.defaultLang;
  };

  I18n.prototype.isReady = function () {
    return this._isReady;
  };

  // ════════════════════════════════════════════════════════════
  // BOOT
  // ════════════════════════════════════════════════════════════
  var i18n = new I18n('en');
  window.i18n = i18n;

  // Async init promise — diğer kodlar `await window.i18nReady` yapabilir
  window.i18nReady = i18n.initAsync();

  // DOMContentLoaded sonrası güvenlik ağı (yeni eklenen DOM elemanları için)
  window.i18nReady.then(function () {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        i18n.apply();
      }, { once: true });
    } else {
      i18n.apply();
    }
  });

  if (typeof wwLog !== 'undefined' && wwLog.log) {
    wwLog.log('[i18n] Core loaded. Initial lang: ' + i18n.getCurrentLanguage());
  }
})();