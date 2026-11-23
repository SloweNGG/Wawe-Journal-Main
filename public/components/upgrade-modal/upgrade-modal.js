// ============================================================
// YÜKSELTME PENCERESİ (upgrade-modal.js): Pro paywall ve limit uyarısı
// ============================================================
// İşaretleme (#ww-upgrade-modal-backdrop) src/components/UpgradeModal.astro'da sunucuda render edilir;
// stiller public/components/upgrade-modal/upgrade-modal.css'te. Yalnızca uygulama sayfalarında
// (Layout.astro, isAppPage) yüklenir; herkese açık sayfalarda çağıran yok.
// Eskiden bileşende satır içi <script> olarak her sayfanın HTML'inde (~21 KB, sıkıştırılmadan) iniyordu;
// içerik aynen taşındı. Layout'ta parser-blocking (defer'siz) yüklenir: sayfa ayrıştırması bittiğinde
// window.openUpgradeModal tanımlı olsun (çağıranlar typeof ile kontrol ediyor) ve DOMContentLoaded
// bağlamaları eskisi gibi çalışsın. SPA geçişlerinde yeniden çalışmaz (#app-scroll-container dışında).
// ============================================================
(function() {
  // UPGRADE MODAL CLIENT LOGIC
  var modalState = {
    tier: 'pro',    // 'free' | 'pro'
    period: 'monthly',  // 'monthly' | 'yearly'
    feature: 'journal'  // 'journal' | 'analytics_dashboard' | 'csv' | 'generic'
  };

  var I18N_DICT = {
    tr: {
      period_monthly: 'Aylık',
      period_yearly: 'Yıllık',
      period_mo_label: '/ay',
      period_yr_label: '/ay',
      billed_yearly: 'Yıllık {total}',
      btn_upgrade: 'Yükselt',
      btn_compare: 'Planları Karşılaştır',
      tier_free: 'Ücretsiz',
      free_forever: 'Süresiz ücretsiz',
      save_yearly: '%{n} tasarruf',
      btn_go_pro: 'Pro\'ya Geç',
      feat_free_1: 'Sınırsız işlem ve strateji',
      feat_free_2: '2 defter, 1 prop hesabı',
      feat_free_3: 'Dashboard ve K/Z takvimi',
      feat_free_4: 'CSV içe aktarma ve cTrader senkronu',
      feat_free_5: 'Standart PDF rapor',
      feat_free_6: '1 backtest hesabı ve çizim araçları',
      feat_pro_1: 'Ücretsiz plandaki her şey',
      feat_pro_2: 'Analiz paneli ve içgörüler',
      feat_pro_3: 'Detaylı PDF performans raporu',
      feat_pro_4: '10 defter, 10 prop hesabı',
      feat_pro_5: 'Backtest Pro: 10 hesap, gelişmiş istatistik, çoklu grafik',
      feat_pro_6: 'OverTrade uyarıları ve Tema Stüdyosu',
      
      // Feature-specific Notice Titles & Descriptions
      notice_journal_title: 'Hesap Limitine Ulaşıldı',
      notice_journal_desc: 'Maksimum defter sınırına ulaştınız. Ücretsiz planda en fazla 2 defter oluşturabilirsiniz.',
      notice_journal_sub: 'Daha fazla hesap eklemek veya limitleri kaldırmak için yukarıdaki planlardan birini seçin.',

      notice_dash_title: 'Özellik Dahil Değil',
      notice_dash_desc: 'Analiz özelliği Ücretsiz planınıza dahil değildir.',
      notice_dash_sub: 'Gelişmiş analitik panelini ve tüm göstergeleri açmak için yukarıdaki planlardan birini seçin.',

      notice_csv_title: 'Özellik Dahil Değil',
      notice_csv_desc: 'Otomatik Eşitleme ve CSV İçe Aktarma Ücretsiz planınıza dahil değildir.',
      notice_csv_sub: 'Devam etmek veya bu özelliğin kilidini açmak için yukarıdaki planlardan birini seçin.',

      notice_default_title: 'Özellik Dahil Değil',
      notice_default_desc: 'Bu özellik Ücretsiz planınıza dahil değildir.',
      notice_default_sub: 'Daha yüksek limitlerle devam etmek veya özellikleri açmak için bir plana geçin.',
      notice_bt_trades_title: 'Aylık İşlem Sınırına Ulaşıldı',
      notice_bt_trades_desc: 'Ücretsiz planda cTrader verili backtest hesaplarında ayda en fazla belirli sayıda işlem açabilirsiniz. Açık pozisyonlarınızı kapatabilirsiniz; sentetik veriyle işlem sınırsızdır.',
      notice_bt_trades_sub: 'Sınırsız işlem için Pro\'ya geçin.'
    },
    en: {
      period_monthly: 'Monthly',
      period_yearly: 'Yearly',
      period_mo_label: '/mo',
      period_yr_label: '/mo',
      billed_yearly: '{total} billed yearly',
      btn_upgrade: 'Upgrade',
      btn_compare: 'Compare Plans',
      tier_free: 'Free',
      free_forever: 'Free forever',
      save_yearly: 'save {n}%',
      btn_go_pro: 'See Pro',
      feat_free_1: 'Unlimited trades and strategies',
      feat_free_2: '2 journals, 1 prop account',
      feat_free_3: 'Dashboard and P&L calendar',
      feat_free_4: 'CSV import and cTrader sync',
      feat_free_5: 'Standard PDF report',
      feat_free_6: '1 backtest account with drawing tools',
      feat_pro_1: 'Everything in Free',
      feat_pro_2: 'Analytics dashboard and insights',
      feat_pro_3: 'Detailed PDF performance report',
      feat_pro_4: '10 journals, 10 prop accounts',
      feat_pro_5: 'Backtest Pro: 10 accounts, advanced stats, multi-chart',
      feat_pro_6: 'OverTrade alerts and Theme Studio',
      
      notice_journal_title: 'Account limit reached',
      notice_journal_desc: 'Creating additional trading journals is not included in your Free plan.',
      notice_journal_sub: 'Choose a plan above to continue with a higher limit or unlock this feature.',

      notice_dash_title: 'Feature not included',
      notice_dash_desc: 'Analytics is not included in your Free plan.',
      notice_dash_sub: 'Choose a plan above to continue with a higher limit or unlock this feature.',

      notice_csv_title: 'Feature not included',
      notice_csv_desc: 'Auto Sync Trades / Import CSVs is not included in your Free plan.',
      notice_csv_sub: 'Choose a plan above to continue with a higher limit or unlock this feature.',

      notice_default_title: 'Feature not included',
      notice_default_desc: 'This feature is not included in your Free plan.',
      notice_default_sub: 'Choose a plan above to continue with a higher limit or unlock this feature.',
      notice_bt_trades_title: 'Monthly trade limit reached',
      notice_bt_trades_desc: 'On the free plan, backtest accounts with cTrader data have a monthly trade limit. You can still close your open positions; synthetic-data trading is unlimited.',
      notice_bt_trades_sub: 'Go Pro for unlimited trades.'
    },
    de: {
      period_monthly: 'Monatlich',
      period_yearly: 'Jährlich',
      period_mo_label: '/mt',
      period_yr_label: '/mt',
      billed_yearly: '{total} jährlich abgerechnet',
      btn_upgrade: 'Upgraden',
      btn_compare: 'Pläne vergleichen',
      tier_free: 'Kostenlos',
      free_forever: 'Dauerhaft kostenlos',
      save_yearly: '{n}% sparen',
      btn_go_pro: 'Pro ansehen',
      feat_free_1: 'Unbegrenzte Trades und Strategien',
      feat_free_2: '2 Journale, 1 Prop-Konto',
      feat_free_3: 'Dashboard und P&L-Kalender',
      feat_free_4: 'CSV-Import und cTrader-Sync',
      feat_free_5: 'Standard-PDF-Bericht',
      feat_free_6: '1 Backtest-Konto mit Zeichenwerkzeugen',
      feat_pro_1: 'Alles aus Kostenlos',
      feat_pro_2: 'Analyse-Dashboard und Insights',
      feat_pro_3: 'Detaillierter PDF-Leistungsbericht',
      feat_pro_4: '10 Journale, 10 Prop-Konten',
      feat_pro_5: 'Backtest Pro: 10 Konten, erweiterte Statistiken, Multi-Chart',
      feat_pro_6: 'OverTrade-Warnungen und Theme Studio',
      
      notice_journal_title: 'Kontolimit erreicht',
      notice_journal_desc: 'Das Erstellen weiterer Trading-Tagebücher ist in Ihrem Free-Plan nicht enthalten.',
      notice_journal_sub: 'Wählen Sie oben einen Plan, um Ihr Limit zu erhöhen oder Features freizuschalten.',

      notice_dash_title: 'Funktion nicht enthalten',
      notice_dash_desc: 'Die Analyse ist in Ihrem Free-Plan nicht enthalten.',
      notice_dash_sub: 'Wählen Sie oben einen Plan, um dieses Feature freizuschalten.',

      notice_csv_title: 'Funktion nicht enthalten',
      notice_csv_desc: 'Auto-Sync / CSV-Import ist in Ihrem Free-Plan nicht enthalten.',
      notice_csv_sub: 'Wählen Sie oben einen Plan, um dieses Feature freizuschalten.',

      notice_default_title: 'Funktion nicht enthalten',
      notice_default_desc: 'Diese Funktion ist in Ihrem Free-Plan nicht enthalten.',
      notice_default_sub: 'Wählen Sie oben einen Plan, um dieses Feature freizuschalten.',
      notice_bt_trades_title: 'Monatliches Trade-Limit erreicht',
      notice_bt_trades_desc: 'Im kostenlosen Plan haben Backtest-Konten mit cTrader-Daten ein monatliches Trade-Limit. Offene Positionen können Sie weiterhin schließen; mit synthetischen Daten ist der Handel unbegrenzt.',
      notice_bt_trades_sub: 'Mit Pro handeln Sie unbegrenzt.'
    }
  };

  function getLang() {
    try {
      if (window.i18n && typeof window.i18n.getCurrentLanguage === 'function') {
        return window.i18n.getCurrentLanguage();
      }
      var l = localStorage.getItem('ww_language') || document.documentElement.getAttribute('data-lang');
      if (l && ['en', 'tr', 'de'].includes(l)) return l;
    } catch (e) {}
    return 'en';
  }

  function tStr(key) {
    var l = getLang();
    var dict = I18N_DICT[l] || I18N_DICT.en;
    return dict[key] || (I18N_DICT.en[key] || key);
  }

  // ⭐ Config ve Sistem Ayarlarından Dinamik Fiyatları Çek
  function getPricingData() {
    var monthly = 12;
    var yearly = 99;
    var currSym = '$';

    try {
      if (typeof window.getPrices === 'function') {
        var p = window.getPrices();
        if (p && typeof p.monthly === 'number' && p.monthly > 0) monthly = p.monthly;
        if (p && typeof p.yearly === 'number' && p.yearly > 0) yearly = p.yearly;
        if (p && p.currency === 'TRY') currSym = '₺';
        else if (p && p.currency === 'EUR') currSym = '€';
        else if (p && p.currency === 'GBP') currSym = '£';
      } else {
        if (typeof window.getMonthlyPrice === 'function') {
          var m = window.getMonthlyPrice();
          if (m && m > 0) monthly = m;
        }
        if (typeof window.getYearlyPrice === 'function') {
          var y = window.getYearlyPrice();
          if (y && y > 0) yearly = y;
        }
      }
    } catch(e) {}

    // Fallback directly to WW_CONFIG if globals were not populated
    try {
      if (window.WW_CONFIG && window.WW_CONFIG.DEFAULT_PRICES) {
        if (window.WW_CONFIG.DEFAULT_PRICES.monthly) monthly = window.WW_CONFIG.DEFAULT_PRICES.monthly;
        if (window.WW_CONFIG.DEFAULT_PRICES.yearly) yearly = window.WW_CONFIG.DEFAULT_PRICES.yearly;
      }
    } catch(e) {}

    var formatNum = function(n) {
      return (n % 1 === 0) ? n.toFixed(0) : n.toFixed(2);
    };

    return {
      pro: {
        monthly: {
          num: currSym + formatNum(monthly),
          periodKey: 'period_mo_label',
          total: currSym + formatNum(monthly)
        },
        yearly: {
          num: currSym + formatNum(yearly / 12),
          periodKey: 'period_yr_label',
          total: currSym + formatNum(yearly)
        }
      },
      // yearly vs. twelve monthly payments, e.g. 99 / 144 → 31%
      savePct: monthly > 0 ? Math.round((1 - yearly / (monthly * 12)) * 100) : 0
    };
  }

  // what each plan really includes (config.js FEATURES, journal/prop/backtest quotas in the database)
  var FEATURES_BY_TIER = { free: 6, pro: 6 };
  var CHECK_SVG = '<svg class="ww-up-check-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';

  // the Pro view of the feature that opened the modal; backtest images: smoke shots (plan=premium, synthetic data), see tests/smoke
  var PREVIEW_BY_FEATURE = {
    analytics_dashboard: '/images/landing/screen-analytics.webp',
    backtest: '/images/upgrade/backtest-multichart.webp',
    backtest_pro: '/images/upgrade/backtest-multichart.webp',
    backtest_multichart: '/images/upgrade/backtest-multichart.webp',
    backtest_drawings: '/images/upgrade/backtest-multichart.webp',
    backtest_stats: '/images/upgrade/backtest-stats.webp',
    backtest_themes: '/images/upgrade/backtest-themes.webp',
    backtest_trades: '/images/landing/screen-backtest.webp'
  };
  var PREVIEW_DEFAULT = '/images/landing/screen-analytics.webp';

  function updateModalUI() {
    var pricingMatrix = getPricingData();
    var tierKey = (modalState.tier === 'free') ? 'free' : 'pro';
    var periodKey = (modalState.period === 'yearly') ? 'yearly' : 'monthly';
    var isFree = tierKey === 'free';
    var pData = isFree ? null : pricingMatrix.pro[periodKey];

    // Plan title & price
    var nameEl = document.getElementById('ww-up-plan-name');
    if (nameEl) {
      nameEl.textContent = isFree ? tStr('tier_free') : 'Pro';
    }

    var priceNumEl = document.getElementById('ww-up-price-num');
    if (priceNumEl) priceNumEl.textContent = isFree ? '$0' : pData.num;

    var pricePerEl = document.getElementById('ww-up-price-period');
    if (pricePerEl) pricePerEl.textContent = isFree ? '' : tStr(pData.periodKey);

    var priceSubnoteEl = document.getElementById('ww-up-price-subnote');
    if (priceSubnoteEl) {
      if (isFree) {
        priceSubnoteEl.style.display = 'block';
        priceSubnoteEl.textContent = tStr('free_forever');
      } else if (periodKey === 'yearly') {
        priceSubnoteEl.style.display = 'block';
        priceSubnoteEl.textContent = '(' + tStr('billed_yearly').replace('{total}', pData.total) +
          (pricingMatrix.savePct > 0 ? ' · ' + tStr('save_yearly').replace('{n}', pricingMatrix.savePct) : '') + ')';
      } else {
        priceSubnoteEl.style.display = 'none';
      }
    }

    var previewEl = document.getElementById('ww-up-preview-img');
    var previewSrc = PREVIEW_BY_FEATURE[modalState.feature] || PREVIEW_DEFAULT;
    if (previewEl && previewEl.getAttribute('src') !== previewSrc) previewEl.setAttribute('src', previewSrc);

    // Feature items of the selected tier
    var featBox = document.getElementById('ww-up-features');
    if (featBox) {
      var html = '';
      for (var i = 1; i <= FEATURES_BY_TIER[tierKey]; i++) {
        var item = document.createElement('span');
        item.textContent = tStr('feat_' + tierKey + '_' + i);
        html += '<div class="ww-up-feat-item">' + CHECK_SVG + item.outerHTML + '</div>';
      }
      featBox.innerHTML = html;
    }

    // Billing period only applies to Pro; the main button opens the Pro tab from the Free one
    var periodSwitch = document.getElementById('ww-up-period-switch');
    if (periodSwitch) periodSwitch.classList.toggle('is-disabled', isFree);
    var upgradeBtnEl = document.getElementById('ww-up-btn-upgrade');
    if (upgradeBtnEl) upgradeBtnEl.textContent = isFree ? tStr('btn_go_pro') : tStr('btn_upgrade');

    // Static text translations
    document.querySelectorAll('[data-i18n-key]').forEach(function(el) {
      var k = el.getAttribute('data-i18n-key');
      el.textContent = tStr(k);
    });

    // Update Notice Box based on feature
    var titleEl = document.getElementById('ww-up-notice-title');
    var descEl = document.getElementById('ww-up-notice-desc');
    var subEl = document.getElementById('ww-up-notice-sub');

    var feat = modalState.feature || 'generic';
    if (feat === 'journal' || feat === 'account') {
      if (titleEl) titleEl.textContent = tStr('notice_journal_title');
      if (descEl) descEl.textContent = tStr('notice_journal_desc');
      if (subEl) subEl.textContent = tStr('notice_journal_sub');
    } else if (feat === 'analytics_dashboard' || feat === 'dashboard') {
      if (titleEl) titleEl.textContent = tStr('notice_dash_title');
      if (descEl) descEl.textContent = tStr('notice_dash_desc');
      if (subEl) subEl.textContent = tStr('notice_dash_sub');
    } else if (feat === 'backtest_trades') {
      if (titleEl) titleEl.textContent = tStr('notice_bt_trades_title');
      if (descEl) descEl.textContent = tStr('notice_bt_trades_desc');
      if (subEl) subEl.textContent = tStr('notice_bt_trades_sub');
    } else if (feat === 'csv' || feat === 'csv_import') {
      if (titleEl) titleEl.textContent = tStr('notice_csv_title');
      if (descEl) descEl.textContent = tStr('notice_csv_desc');
      if (subEl) subEl.textContent = tStr('notice_csv_sub');
    } else {
      if (titleEl) titleEl.textContent = tStr('notice_default_title');
      if (descEl) descEl.textContent = tStr('notice_default_desc');
      if (subEl) subEl.textContent = tStr('notice_default_sub');
    }

    // Tier buttons state
    document.querySelectorAll('#ww-up-tier-switch .ww-up-pill-btn').forEach(function(btn) {
      var active = btn.dataset.tier === modalState.tier;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    // Period buttons state
    document.querySelectorAll('#ww-up-period-switch .ww-up-pill-btn').forEach(function(btn) {
      var active = btn.dataset.period === modalState.period;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  // GLOBAL OPEN & CLOSE METHODS
  window.openUpgradeModal = function(opts) {
    opts = opts || {};
    if (opts.feature) modalState.feature = opts.feature;
    modalState.tier = opts.tier || 'pro';
    modalState.period = opts.period || 'monthly';

    updateModalUI();

    var backdrop = document.getElementById('ww-upgrade-modal-backdrop');
    if (backdrop) {
      backdrop.style.display = 'flex';
      requestAnimationFrame(function() {
        backdrop.classList.add('active');
      });
      document.body.style.overflow = 'hidden';
    }
  };

  window.closeUpgradeModal = function() {
    var backdrop = document.getElementById('ww-upgrade-modal-backdrop');
    if (backdrop) {
      backdrop.classList.remove('active');
      setTimeout(function() {
        backdrop.style.display = 'none';
        document.body.style.overflow = '';
      }, 240);
    }
  };

  // DOM Event Bindings
  document.addEventListener('DOMContentLoaded', function() {
    var backdrop = document.getElementById('ww-upgrade-modal-backdrop');
    var closeBtn = document.getElementById('ww-up-close-btn');

    if (closeBtn) {
      closeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        window.closeUpgradeModal();
      });
    }

    if (backdrop) {
      backdrop.addEventListener('click', function(e) {
        if (e.target === backdrop) {
          window.closeUpgradeModal();
        }
      });
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && backdrop && backdrop.classList.contains('active')) {
        window.closeUpgradeModal();
      }
    });

    // Tier Switcher
    document.querySelectorAll('#ww-up-tier-switch .ww-up-pill-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        modalState.tier = btn.dataset.tier || 'pro';
        updateModalUI();
      });
    });

    // Period Switcher
    document.querySelectorAll('#ww-up-period-switch .ww-up-pill-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        modalState.period = btn.dataset.period || 'monthly';
        updateModalUI();
      });
    });

    // Upgrade CTA Action
    var upgradeBtn = document.getElementById('ww-up-btn-upgrade');
    if (upgradeBtn) {
      upgradeBtn.addEventListener('click', function() {
        if (modalState.tier === 'free') {
          modalState.tier = 'pro';
          updateModalUI();
          return;
        }
        try {
          sessionStorage.setItem('ww_selected_tier', modalState.tier);
          sessionStorage.setItem('ww_selected_period', modalState.period);
          // Set wizard state so settings page picks up the period
          var wState = {};
          try { wState = JSON.parse(sessionStorage.getItem('ww_wizard_state_v1') || '{}'); } catch(e) {}
          wState.period = modalState.period;
          sessionStorage.setItem('ww_wizard_state_v1', JSON.stringify(wState));
        } catch(e) {}
        window.closeUpgradeModal();
        if (window.location.pathname.includes('/settings')) {
          if (typeof window.switchPanel === 'function') {
            window.switchPanel('panel-plan');
          } else {
            window.location.hash = '#panel-plan';
          }
        } else {
          window.location.href = '/settings#panel-plan';
        }
      });
    }

    // Compare Plans CTA Action
    var compareBtn = document.getElementById('ww-up-btn-compare');
    if (compareBtn) {
      compareBtn.addEventListener('click', function() {
        window.closeUpgradeModal();
        if (window.location.pathname.includes('/settings')) {
          if (typeof window.switchPanel === 'function') {
            window.switchPanel('panel-plan');
          } else {
            window.location.hash = '#panel-plan';
          }
        } else {
          window.location.href = '/settings#panel-plan';
        }
      });
    }

    // Smart Interceptor: Analiz clicks for free users
    document.addEventListener('click', function(e) {
      var proLink = e.target.closest('a[href*="/analytics"]');
      if (!proLink) return;

      var cachedPlan = sessionStorage.getItem('ww_user_plan') || localStorage.getItem('ww_cached_plan');
      var isProUser = cachedPlan === 'premium' || (window.__wwUserProfile && window.__wwUserProfile.plan === 'premium');

      if (!isProUser) {
        e.preventDefault();
        e.stopPropagation();
        window.openUpgradeModal({ feature: 'analytics_dashboard' });
      }
    }, true); // capture phase to intercept before page-transition.js

    // If on analytics.html directly without pro plan, trigger modal
    if (window.location.pathname.includes('/analytics')) {
      setTimeout(function() {
        var cachedPlan = sessionStorage.getItem('ww_user_plan') || localStorage.getItem('ww_cached_plan');
        if (cachedPlan !== 'premium') {
          window.openUpgradeModal({ feature: 'analytics_dashboard' });
        }
      }, 400);
    }
  });
})();
