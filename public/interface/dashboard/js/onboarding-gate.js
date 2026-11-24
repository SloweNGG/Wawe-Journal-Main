// ============================================================
// ONBOARDING KAPISI (onboarding-gate.js)
// ============================================================
// Layout.astro her uygulama sayfasında onboarding.js (~72 KB) ve onboarding.css'i (~38 KB, render-blocking)
// yüklüyordu; onboarding.js de her tam yüklemede bir user_profiles sorgusu atıyordu. Sihirbazı, turu ve görevleri
// bitirmiş kullanıcıya ise hiçbir şey göstermiyordu. Artık sayfada yalnızca bu küçük dosya yüklenir:
//   - window.sb hazır olunca oturumdaki kullanıcı sb.auth.getSession() ile okunur (yerel, sorgu yok)
//   - onboardingNeeded() hayır derse: onboarding dosyaları hiç inmez, veritabanı sorgusu atılmaz
//   - evet derse (ya da emin değilse): onboarding.css + onboarding.js yüklenir; onboarding.js eskisi gibi
//     kendi kendine başlar (waitForAuthAndStart → initOnboarding)
// Karar onboarding.js'teki initOnboarding + renderTasksWidget ile AYNI yerel bayraklara bakar:
//   wj_wizard_done_<uid>, wj_tour_done_<uid> ve görevler (wj_tasks_all_done_<uid> | wj_tasks_dismissed_<uid> |
//   user_metadata.tasks_completed). Veritabanı "bitti" diyorsa onboarding.js bayrakları yerelde de yazar; yani yeni
//   cihazda dosya bir kez iner, sonraki yüklemelerde inmez. Şüphede yükle (en kötü durum: eski davranış).
// Konsol yardımcıları: window.startOnboardingWizard / startOnboardingTour burada "yükle, sonra çağır" vekilidir;
// onboarding.js yüklenince gerçekleriyle değiştirir. refreshOnboardingTasks bilerek tanımlanmaz: çağıranlar typeof ile
// bakar, görevler bittiyse yapacak işi yok.
// Layout body sonunda (#app-scroll-container dışında) defer ile yüklenir: tam yüklemede bir kez çalışır, SPA'da çalışmaz.
// ============================================================
(function (global) {
  'use strict';
  if (global.WwOnboardingGate) return;

  var JS_URL = '/interface/dashboard/js/onboarding.js?v=__WW_BUILD_ID__';
  var CSS_URL = '/interface/dashboard/css/onboarding.css?v=__WW_BUILD_ID__';

  /**
   * onboarding.js'in bu kullanıcıya bir şey göstermesi (ya da yapması) gerekebilir mi?
   * getLocal / getSessionItem: localStorage / sessionStorage okuyucu (testte sahte). Hata → true (yükle).
   */
  function onboardingNeeded(user, getLocal, getSessionItem) {
    if (!user || !user.id) return true;                       // oturum yok / bilinmiyor: eskisi gibi onboarding.js karar versin
    try {
      var uid = user.id;
      var flag = function (k) { return getLocal(k + uid) === 'true'; };
      var wizardDone = flag('wj_wizard_done_');
      var tourDone = flag('wj_tour_done_');
      var tasksDone = flag('wj_tasks_all_done_') || flag('wj_tasks_dismissed_') ||
        !!(user.user_metadata && user.user_metadata.tasks_completed);
      // initOnboarding, strateji görevinden dönüldüyse bir başarı bildirimi gösterir (strategies.js bu anahtarı yazar)
      var strategyToast = getSessionItem('wj_strategy_just_completed') === 'true';
      return !(wizardDone && tourDone && tasksDone) || strategyToast;
    } catch (e) {
      return true;
    }
  }

  function readLocal(k) { return global.localStorage.getItem(k); }
  function readSession(k) { return global.sessionStorage.getItem(k); }

  var loading = null;

  function addCss() {
    if (document.querySelector('link[data-wj-onboarding-css]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = CSS_URL;
    l.setAttribute('data-wj-onboarding-css', '');
    document.head.appendChild(l);
  }

  function injectScript(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('[onboarding-gate] yüklenemedi: ' + url)); };
      document.head.appendChild(s);
    });
  }

  // CSS + JS birlikte iner; arayüz (sihirbaz/tur/görev kartı) ancak oturum + veritabanı yanıtlarından sonra kurulur,
  // CSS o zamana hazır olur (sihirbaz zaten 400 ms gecikmeli açılır).
  function load() {
    if (!loading) {
      addCss();
      loading = global.WwLazy && typeof global.WwLazy.loadScriptOnce === 'function'
        ? global.WwLazy.loadScriptOnce(JS_URL)
        : injectScript(JS_URL);
      loading.catch(function (err) {
        loading = null;
        if (global.wwLog) global.wwLog.warn(String(err));
      });
    }
    return loading;
  }

  // Konsol / test yardımcıları için "yükle, sonra çağır" vekilleri; onboarding.js bunların üzerine yazar
  function shim(name) {
    if (typeof global[name] === 'function') return;
    var fn = function () {
      var args = arguments;
      return load().then(function () {
        var real = global[name];
        if (typeof real === 'function' && real !== fn) return real.apply(global, args);
      });
    };
    fn.__wjGate = true;
    global[name] = fn;
  }

  function decide(sb) {
    if (!sb || !sb.auth || typeof sb.auth.getSession !== 'function') { load(); return; }
    var p;
    try { p = sb.auth.getSession(); } catch (e) { load(); return; }
    Promise.resolve(p).then(function (res) {
      // Oturum kesin yok (hatasız cevap, session: null): sayfa zaten girişe yönlendiriyor (requireAuth); onboarding'in
      // gösterecek bir şeyi yok, ~24 KB (gz) inmesin. Girişten sonra login/register tam yüklemeyle döner, kapı yeniden karar verir.
      if (res && !res.error && res.data && res.data.session === null) return;
      var user = res && res.data && res.data.session ? res.data.session.user : null;
      if (onboardingNeeded(user, readLocal, readSession)) load();
    }, function () { load(); });
  }

  // onboarding.js'teki waitForAuthAndStart ile aynı bekleme: 120 ms aralıkla en fazla 45 deneme
  function waitForSb(done) {
    if (global.sb) { done(global.sb); return; }
    var attempts = 0;
    var poller = setInterval(function () {
      attempts++;
      if (global.sb || attempts >= 45) {
        clearInterval(poller);
        done(global.sb || null);
      }
    }, 120);
  }

  shim('startOnboardingWizard');
  shim('startOnboardingTour');

  global.WwOnboardingGate = { onboardingNeeded: onboardingNeeded, load: load };

  waitForSb(decide);
})(typeof window !== 'undefined' ? window : this);
