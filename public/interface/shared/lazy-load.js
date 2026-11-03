// ============================================================
// GECİKMELİ YÜKLEYİCİ (window.WwLazy) — perf parça 2
// ============================================================
// Sayfa açılışında gerekmeyen script'leri (quick-add, grafik kütüphaneleri, SortableJS)
// ilk ihtiyaçta bir kez yükler.
//
//   loadScriptOnce(url, { test })  → Promise
//     Aynı adres (sorgu yok sayılarak: ?v= farkı aynı dosya) yalnızca bir kez eklenir; aynı anda gelen
//     çağrılar aynı Promise'i paylaşır. `test()` true dönerse (kütüphane zaten sayfada, ör. başka bir
//     sayfanın <script> etiketiyle SPA'dan önce yüklenmiş) hiç yüklemeden çözülür. Hata olursa kayıt silinir,
//     sonraki çağrı yeniden dener.
//   loadScriptsInOrder([url, ...]) → Promise
//     Hepsi paralel iner, eklenme sırasıyla çalışır (async=false).
//   whenVisible(el | [el], fn, { rootMargin }) → iptal fonksiyonu
//     Eleman ekrana yaklaşınca (varsayılan 300px) fn bir kez çalışır. IntersectionObserver yoksa hemen.
//   busy(el, promise)
//     Yükleme 120 ms'den uzun sürerse tetikleyiciye bekleme durumu (aria-busy, ilerleme imleci) verir.
//
// Yerel adreslerde `?v=__WW_BUILD_ID__` yazın (derleme gerçek build ID'yi koyar; bkz. scripts/asset-version.mjs).
// Eklenen <script>'ler head'de data-ssr OLMADAN durur; SPA geçişinde silinmez, tekrar çalışmaz.
// ============================================================
(function (global) {
  'use strict';
  if (global.WwLazy) return;

  var registry = Object.create(null);

  function keyOf(url) {
    try {
      var u = new URL(url, location.href);
      return u.origin + u.pathname;
    } catch (e) {
      return String(url);
    }
  }

  function inject(url, ordered) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      if (ordered) s.async = false;
      s.setAttribute('data-ww-lazy', '');
      s.onload = function () { resolve(); };
      s.onerror = function () {
        s.remove();
        reject(new Error('[WwLazy] yüklenemedi: ' + url));
      };
      document.head.appendChild(s);
    });
  }

  function load(url, opts, ordered) {
    opts = opts || {};
    try {
      if (typeof opts.test === 'function' && opts.test()) return Promise.resolve();
    } catch (e) {}
    var key = keyOf(url);
    if (registry[key]) return registry[key];
    var p = inject(url, ordered).catch(function (err) {
      if (registry[key] === p) delete registry[key];
      throw err;
    });
    registry[key] = p;
    return p;
  }

  function loadScriptOnce(url, opts) {
    return load(url, opts, false);
  }

  function loadScriptsInOrder(urls) {
    return Promise.all(urls.map(function (u) {
      return typeof u === 'string' ? load(u, null, true) : load(u.url, u, true);
    }));
  }

  function whenVisible(els, fn, opts) {
    var list = (Array.isArray(els) ? els : [els]).filter(Boolean);
    var done = false;
    var io = null;
    function run() {
      if (done) return;
      done = true;
      if (io) io.disconnect();
      fn();
    }
    if (!list.length || typeof IntersectionObserver !== 'function') {
      run();
      return function () {};
    }
    io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) return run();
      }
    }, { rootMargin: (opts && opts.rootMargin) || '300px' });
    list.forEach(function (el) { io.observe(el); });
    return function () {
      done = true;
      if (io) io.disconnect();
    };
  }

  // Bekleme durumu: kısa (önbellekten) yüklemelerde yanıp sönmesin diye 120 ms gecikmeli
  var styleAdded = false;
  function addStyle() {
    if (styleAdded) return;
    styleAdded = true;
    var st = document.createElement('style');
    st.setAttribute('data-runtime', '');
    st.textContent = '.ww-lazy-busy{cursor:progress!important;opacity:.72;pointer-events:none}';
    document.head.appendChild(st);
  }
  function busy(el, promise) {
    if (!el || !promise) return promise;
    var timer = setTimeout(function () {
      addStyle();
      el.classList.add('ww-lazy-busy');
      el.setAttribute('aria-busy', 'true');
    }, 120);
    function clear() {
      clearTimeout(timer);
      el.classList.remove('ww-lazy-busy');
      el.removeAttribute('aria-busy');
    }
    promise.then(clear, clear);
    return promise;
  }

  // CDN kütüphaneleri tek yerde (sürüm değişirse yalnızca burası). Admin ve backtest kendi <script>
  // etiketleriyle aynı adresleri yükler; test() sayfada zaten varsa ikinci kez yüklemeyi önler.
  var LIBS = {
    apexcharts: {
      url: 'https://cdn.jsdelivr.net/npm/apexcharts@8.2.0',
      test: function () { return typeof global.ApexCharts !== 'undefined'; }
    },
    'lightweight-charts': {
      url: 'https://cdn.jsdelivr.net/npm/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js',
      test: function () { return typeof global.LightweightCharts !== 'undefined'; }
    },
    sortablejs: {
      url: 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js',
      test: function () { return typeof global.Sortable !== 'undefined'; }
    }
  };

  function loadLib(name) {
    var lib = LIBS[name];
    if (!lib) return Promise.reject(new Error('[WwLazy] bilinmeyen kütüphane: ' + name));
    return loadScriptOnce(lib.url, { test: lib.test });
  }

  function loadLibs(names) {
    return Promise.all(names.map(loadLib));
  }

  function libReady(name) {
    var lib = LIBS[name];
    return !!(lib && lib.test());
  }

  global.WwLazy = {
    LIBS: LIBS,
    loadLib: loadLib,
    loadLibs: loadLibs,
    libReady: libReady,
    loadScriptOnce: loadScriptOnce,
    loadScriptsInOrder: loadScriptsInOrder,
    whenVisible: whenVisible,
    busy: busy,
  };
  global.loadScriptOnce = loadScriptOnce;
})(typeof window !== 'undefined' ? window : this);
