// ============================================================
// ANA SAYFA (LANDING) — sayfa script'i (landing-page.js)
// ============================================================
// Eskiden src/pages/index.astro içinde satır içi <script is:inline> bloğuydu; HTML küçülsün, kod küçültülsün (minify)
// ve kalıcı önbelleğe (immutable, ?v=<içerik hash'i>) girsin diye buraya AYNEN taşındı.
// Sayfada bloğun eski yerinde yüklenir: <script src="/interface/landing/js/landing-page.js" is:inline>.
// defer/async YOK: engelleyici klasik script olarak satır içiyle aynı anda çalışır (üstündeki DOM hazır, defer
// script'ler henüz çalışmadı). Üst seviye adlar global kalır (minify üst seviyeyi yeniden adlandırmaz).
// Sayfa SPA değil (her açılış tam yükleme), bu yüzden data-page-script gerekmez.
// ============================================================
    function waitForDeps(cb, maxMs) {
      maxMs = maxMs || 8000;
      var t0 = Date.now();
      (function check() {
        if (window.sb && typeof window.loadPlatformStats === 'function') {
          try { cb(); } catch (e) { window.wwLog && wwLog.warn('[index] cb error:', e); }
          return;
        }
        if (Date.now() - t0 > maxMs) return;
        setTimeout(check, 50);
      })();
    }

    // MAINTENANCE
    (function() {
      var p = window.location.pathname;
      if (p.includes('admin.html') || p.includes('login.html') || p.includes('maintenance.html')) return;
      waitForDeps(function() {
        (async function() {
          try {
            var s = window.getSystemSettings ? window.getSystemSettings() : {};
            if (s.maintenance_mode) {
              var { data: { session } } = await window.sb.auth.getSession();
              if (session && session.user?.app_metadata?.role === 'admin') return;
              window.location.href = '/maintenance.html';
            }
          } catch(e) {}
        })();
      });
    })();

    // OTURUM: giriş yapmış kullanıcı ana sayfayı gezebilir, navbar'da avatar + Dashboard görür (NavAuth).
    // Yükleme SDK'sız, localStorage'dan yapıldı; burada SDK ile doğrulanır: oturum geçersizse ziyaretçi görünümüne döner.
    // Yüklü uygulama (PWA, start_url "/") açılınca doğrudan Dashboard'a gider.
    (function() {
      var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
      waitForDeps(function() {
        (async function() {
          try {
            var { data: { session } } = await window.sb.auth.getSession();
            if (session && standalone) { window.location.replace('/dashboard'); return; }
            document.documentElement.classList.toggle('ww-authed', !!session);
          } catch(e) {}
        })();
      });
    })();

    // NAV: compact the glass pill once the page is scrolled
    (function() {
      var nav = document.getElementById('navbar');
      if (!nav) return;
      function onScroll() { nav.classList.toggle('is-compact', (window.scrollY || document.documentElement.scrollTop || 0) > 80); }
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    })();

    // SHOWCASE LAPTOP: önce kapak açılır, sonra kaydırdıkça uygulama ekranları sırayla değişir
    (function() {
      var sec = document.querySelector('.showcase');
      if (!sec) return;
      var shots = sec.querySelectorAll('.sc-shot'), caps = sec.querySelectorAll('.sc-cap'), tabs = sec.querySelectorAll('.sc-tab');
      var n = shots.length, cur = 0, raf = 0, lastLid = '', pathEl = sec.querySelector('.br-path');
      var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      // ilerleme: kapak açılır (0–LID) → ekranlar değişir (FIRST–LAST) → son ekrandan sonra kapak kapanır (CLOSE–1)
      var LID = 0.12, FIRST = 0.15, LAST = 0.84, CLOSE = 0.87;
      function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
      function show(i) {
        if (i === cur) return; cur = i;
        if (pathEl) pathEl.textContent = shots[i].getAttribute('data-path') || '';
        for (var k = 0; k < n; k++) {
          var on = k === i;
          shots[k].classList.toggle('is-on', on); caps[k].classList.toggle('is-on', on);
          tabs[k].classList.toggle('is-on', on); tabs[k].setAttribute('aria-selected', on ? 'true' : 'false');
        }
      }
      function geo() {
        var sr = sec.getBoundingClientRect(), vh = window.innerHeight || 800, lead = vh * 0.45;
        return { sr: sr, vh: vh, lead: lead, span: Math.max(1, sr.height - vh + lead) };
      }
      function update() {
        raf = 0;
        var g = geo();
        var p = Math.max(0, Math.min(1, (g.lead - g.sr.top) / g.span));
        var lid = p < CLOSE ? Math.min(1, p / LID) : 1 - Math.min(1, (p - CLOSE) / (1 - CLOSE));
        // değer değişmediyse yazma: bölümün ortasında kapak hep açık (1), boşuna stil hesabı yaptırmasın
        var v = ease(lid).toFixed(3);
        if (v !== lastLid) { lastLid = v; sec.style.setProperty('--lid', v); }
        show(p < FIRST ? 0 : Math.min(n - 1, Math.floor((p - FIRST) / (LAST - FIRST) * n)));
      }
      function req() { if (!raf) raf = requestAnimationFrame(update); }
      tabs.forEach(function(b, i) {
        b.addEventListener('click', function() {
          if (still) { show(i); return; }
          var g = geo(), y = window.scrollY + g.sr.top - g.lead;
          var p = FIRST + (i + 0.5) / n * (LAST - FIRST);
          window.scrollTo({ top: y + p * g.span, behavior: 'smooth' });
        });
      });
      // ekran görüntülerini bölüm yaklaşınca indirip önceden çöz: sekme değişirken ilk gösterimde takılma olmasın
      var warmed = false;
      function warm() {
        if (warmed) return; warmed = true;
        shots.forEach(function(im) { im.loading = 'eager'; });
        // sırayla, biri bitince diğeri: altısını birden çözmek zayıf telefonda kendisi takılma yaratır
        var i = 0;
        (function next() {
          var im = shots[i++];
          if (!im || !im.decode) return;
          im.decode().catch(function() {}).then(next);
        })();
      }
      if (still) { warm(); return; }
      window.addEventListener('resize', req);
      // kaydırma dinleyicisi yalnızca bölüm ekrana yakınken çalışır (sayfanın geri kalanında her karede ölçüm yapmasın);
      // çıkarken son bir güncelleme durumu (kapak kapalı) sabitler
      if ('IntersectionObserver' in window) {
        var live = false;
        new IntersectionObserver(function(es) {
          var on = es[es.length - 1].isIntersecting;
          if (on === live) return;
          live = on;
          if (on) { warm(); window.addEventListener('scroll', req, { passive: true }); }
          else window.removeEventListener('scroll', req);
          req();
        }, { rootMargin: '50% 0px' }).observe(sec);
      } else {
        warm();
        window.addEventListener('scroll', req, { passive: true });
      }
      update();
    })();

    // EKRAN DIŞINDAKİ SONSUZ ANİMASYONLAR: görünmezken durur, görününce kaldığı kareden sürer (görüntü değişmez).
    // Arka plandaki 5 büyük parıltı, parlayan başlıklar, nefes alan butonlar ve koç avatarları sayfa boyunca hiç durmadan kare üretiyordu.
    (function() {
      if (!('IntersectionObserver' in window)) return;
      var io = new IntersectionObserver(function(es) {
        es.forEach(function(e) { e.target.classList.toggle('anim-off', !e.isIntersecting); });
      }, { rootMargin: '200px 0px' });
      document.querySelectorAll('.drift, .shine, .bp, .chat-orb, .wwc-av').forEach(function(el) { io.observe(el); });
    })();

    // BILLING PERIOD TOGGLE
    var pricing = document.getElementById('pricing');
    var pickM = document.getElementById('pick-monthly');
    var pickY = document.getElementById('pick-yearly');
    function setPeriod(period) {
      if (!pricing) return;
      pricing.setAttribute('data-period', period);
      if (pickM) { pickM.classList.toggle('on', period === 'monthly'); pickM.setAttribute('aria-pressed', period === 'monthly'); }
      if (pickY) { pickY.classList.toggle('on', period === 'yearly'); pickY.setAttribute('aria-pressed', period === 'yearly'); }
    }
    if (pickM) pickM.addEventListener('click', function() { setPeriod('monthly'); });
    if (pickY) pickY.addEventListener('click', function() { setPeriod('yearly'); });

    // PRICES
    var priceTimeout = null;
    function updateHomePrices() {
      if (priceTimeout) cancelAnimationFrame(priceTimeout);
      priceTimeout = requestAnimationFrame(function() {
        try {
          var mp = window.getMonthlyPrice ? window.getMonthlyPrice() : 12;
          var yp = window.getYearlyPrice ? window.getYearlyPrice() : 99;
          var mEl = document.getElementById('monthly-price-value');
          if (mEl) mEl.textContent = mp % 1 === 0 ? mp.toFixed(0) : mp.toFixed(2);
          var yEl = document.getElementById('yearly-price-value');
          if (yEl) yEl.textContent = yp % 1 === 0 ? yp.toFixed(0) : yp.toFixed(2);
        } catch (e) {}
      });
    }
    window.addEventListener('storage', function(e) {
      if (e.key && e.key.startsWith('ww_')) updateHomePrices();
    });
    document.addEventListener('DOMContentLoaded', updateHomePrices);

    // PRO BUTTON (follows the selected billing period)
    // Logged in: the payment wizard (card / crypto / partner code) opens with that period selected.
    // Logged out: sign up first; register forwards ?plan to the same wizard.
    var upPro = document.getElementById('upgrade-pro-home');
    if (upPro) upPro.addEventListener('click', function(e) {
      e.preventDefault(); e.stopPropagation();
      var period = pricing && pricing.getAttribute('data-period') === 'yearly' ? 'yearly' : 'monthly';
      (async function() {
        var dest = '/register?plan=' + period;
        try {
          var sb = window.sb || window.supabase;
          if (sb && sb.auth) {
            var res = await sb.auth.getSession();
            if (res && res.data && res.data.session) dest = '/settings?plan=' + period + '#panel-plan';
          }
        } catch (err) { console.error(err); }
        window.location.href = dest;
      })();
    });

    // LANGUAGE SELECTOR
    var langCurrent = document.getElementById('lang-current');
    var langDropdown = document.getElementById('lang-dropdown');
    var langOptions = document.querySelectorAll('.lang-option');
    var langFlag = document.querySelector('.lang-current-flag');

    function updateLanguageUI(lang) {
      var sel = document.querySelector('.lang-option[data-lang="' + lang + '"]');
      if (!sel) return;
      if (langFlag) langFlag.textContent = sel.dataset.flag;
      langOptions.forEach(function(opt) { opt.classList.toggle('active', opt.dataset.lang === lang); });
    }
    function toggleDD() { langDropdown && langDropdown.classList.toggle('show'); }
    function closeDD() { langDropdown && langDropdown.classList.remove('show'); }
    if (langCurrent) langCurrent.addEventListener('click', function(e) { e.stopPropagation(); toggleDD(); });
    langOptions.forEach(function(o) {
      o.addEventListener('click', function(e) {
        e.stopPropagation();
        i18n.setLanguage(o.dataset.lang);
        updateLanguageUI(o.dataset.lang);
        closeDD();
      });
    });
    document.addEventListener('click', function(e) {
      if (langCurrent && langDropdown && !langCurrent.contains(e.target) && !langDropdown.contains(e.target)) closeDD();
    });
    // index-i18n.js is deferred: it only exists once the document has been parsed
    document.addEventListener('DOMContentLoaded', function() {
      if (typeof i18n === 'undefined') return;
      updateLanguageUI(i18n.getCurrentLanguage());
      i18n.onChange(function(l) { updateLanguageUI(l); updateHomePrices(); });
    });
