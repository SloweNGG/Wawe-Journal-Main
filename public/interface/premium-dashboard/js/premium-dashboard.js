// ============================================================
// premium-dashboard.js - ANA DOSYA
// Global state, init, event listeners, koordinasyon
// ============================================================

// Logger — global wwLog'a fallback ile bağlan
const wwLog = (typeof window !== 'undefined' && window.wwLog) 
  ? window.wwLog 
  : { log: () => {}, warn: () => {}, info: () => {}, debug: () => {}, error: console.error.bind(console) };

import {
  getCurrencySymbol,
  sanitizeHTML,
  sanitizeURL,
  calcTradePnL,
  formatCurrency,
  formatCurrencyPDF,
  bellEmptyStateHtml,
  filterTradesByDate
} from './helpers.js';

import {
  getChartTheme,
  updateChartTheme,
  renderCharts,
  getCharts,
  clearAllApexCharts,
  clearLightweightChart
} from './chart-renderers.js';

import {
  showSkeletons,
  hideSkeletons,
  injectSkeletonMarkup,
  saveLayoutOrder,
  loadLayoutOrder,
  resetLayout,
  initDragDrop,
  forceResizeAllCharts,
  renderPremiumStats,
  renderKpiBar,
  buildWidgets,
  renderWidgets,
  loadStrategySection,
  markOvertradeAsRead,
  updateNavbarAvatar,
  exportCSV,
  exportPDF
} from './dashboard-manager.js';

// i18n Safe Helper
function _t(key, fallback) {
  try {
    if (typeof window !== 'undefined' && window.i18n && typeof window.i18n.t === 'function') {
      var val = window.i18n.t(key);
      if (val && val !== key) return val;
    }
  } catch (e) {}
  return fallback !== undefined ? fallback : key;
}

// GLOBAL STATE
var currentUser = null;
var allTrades = [];
var currentFilteredTrades = [];
var currentRange = 'all';
var customRangeStart = null;
var customRangeEnd = null;
var isPageVisible = true;
var chartRafId = null;

// TEMA OBSERVER
var themeObserver = new MutationObserver(function(mutations) {
  mutations.forEach(function(mutation) {
    if (mutation.attributeName === 'class') {
      updateChartTheme();
      if (currentFilteredTrades && currentFilteredTrades.length > 0) {
        renderCharts(currentFilteredTrades);
      }
    }
  });
});
themeObserver.observe(document.body, { attributes: true });

// WINDOW RESIZE - SADECE RESIZE
var resizeTimer = null;
window.addEventListener('resize', function() {
  if (resizeTimer) { clearTimeout(resizeTimer); resizeTimer = null; }
  resizeTimer = setTimeout(function() {
    forceResizeAllCharts();
    resizeTimer = null;
  }, 300);
});

// VISIBILITY CHANGE
document.addEventListener('visibilitychange', function() {
  isPageVisible = !document.hidden;
  if (isPageVisible && currentFilteredTrades && currentFilteredTrades.length > 0) {
    var hasCharts = document.querySelector('.chart-wrap .apexcharts-canvas, .chart-wrap .lwc-chart');
    if (!hasCharts) {
      if (chartRafId) cancelAnimationFrame(chartRafId);
      chartRafId = requestAnimationFrame(function() {
        renderCharts(currentFilteredTrades);
      });
    }
  }
});

// MENU FONKSİYONLARI
export function openMenu() {
  var nt = document.getElementById('nav-toggle');
  var nm = document.getElementById('nav-menu');
  var nb = document.getElementById('nav-backdrop');
  if (nt) nt.classList.add('open');
  if (nm) nm.classList.add('open');
  if (nb) nb.classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeMenu() {
  var nt = document.getElementById('nav-toggle');
  var nm = document.getElementById('nav-menu');
  var nb = document.getElementById('nav-backdrop');
  if (nt) nt.classList.remove('open');
  if (nm) nm.classList.remove('open');
  if (nb) nb.classList.remove('open');
  document.body.style.overflow = '';
}

// DATE FILTER APPLIER
function applyFilter(range, start, end) {
  currentRange = range;
  customRangeStart = start || null;
  customRangeEnd = end || null;

  currentFilteredTrades = filterTradesByDate(allTrades, currentRange, customRangeStart, customRangeEnd);

  var options = document.querySelectorAll('#premium-date-filter-group .date-filter-option');
  options.forEach(function(opt) {
    if (opt.dataset.range === currentRange) {
      opt.classList.add('active');
    } else {
      opt.classList.remove('active');
    }
  });

  var customPanel = document.getElementById('premium-custom-range-panel');
  if (customPanel) {
    if (currentRange === 'custom') {
      customPanel.classList.add('open');
    } else {
      customPanel.classList.remove('open');
    }
  }

  renderPremiumStats(currentFilteredTrades);
  renderKpiBar(currentFilteredTrades);
  renderCharts(currentFilteredTrades);
  loadStrategySection(currentFilteredTrades, currentUser);
}

// LOAD PREMIUM DATA
async function loadPremiumData() {
  wwLog.log('[Premium Dashboard] loadPremiumData başlatıldı...');

  if (typeof requireAuth === 'undefined') {
    wwLog.warn('[Premium Dashboard] requireAuth henüz yüklenmedi, 1 saniye bekleniyor...');
    await new Promise(function(resolve) { setTimeout(resolve, 1000); });

    if (typeof requireAuth === 'undefined') {
      console.error('[Premium Dashboard] requireAuth hala yüklenmedi!');
      var main = document.getElementById('main-content');
      if (main) {
        main.innerHTML = '\n          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;text-align:center;gap:1rem;padding:2rem;">\n            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>\n            <h2 style="font-family:\'Syne\',sans-serif;font-size:1.5rem;color:var(--text);" data-i18n="premium_dash.load_error_title">' + _t('premium_dash.load_error_title', 'Yükleme Hatası') + '</h2>\n            <p style="color:var(--muted);max-width:400px;font-size:14px;font-family:\'DM Sans\',sans-serif;" data-i18n="premium_dash.load_error_desc">' + _t('premium_dash.load_error_desc', 'Gerekli modüller yüklenemedi. Lütfen sayfayı yenileyin.') + '</p>\n            <button onclick="location.reload()" class="btn btn-primary" style="padding:0.7rem 2rem;cursor:pointer;" data-i18n="premium_dash.reload">' + _t('premium_dash.reload', 'Sayfayı Yenile') + '</button>\n          </div>\n        ';
      }
      return;
    }
  }

  showSkeletons();

  try {
    var user = await requireAuth();
    if (!user) return;

    if (!window.journal) {
      if (typeof wwLog !== 'undefined') wwLog.warn('[Premium Dashboard] journal.js henüz yüklenmedi, atlanıyor');
      return;
    }
    await window.journal.ensureActiveJournal(user.id);
    currentUser = user;

    var planData = await getUserPlan();
    if (planData.plan !== 'premium') {
      var main = document.getElementById('main-content');
      main.innerHTML = '\n        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;text-align:center;gap:1.5rem;padding:2rem;">\n          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 13L2 9l4-6z"/><path d="M12 22V9"/><path d="M2 9h20"/><path d="M6 3l6 6 6-6"/></svg>\n          <h2 style="font-family:\'Syne\',sans-serif;font-size:1.5rem;color:var(--text);" data-i18n="premium_dash.premium_only_title">' + _t('premium_dash.premium_only_title', 'Premium\'a Özel') + '</h2>\n          <p style="color:var(--muted);max-width:400px;font-size:14px;font-family:\'DM Sans\',sans-serif;" data-i18n="premium_dash.premium_only_desc">' + _t('premium_dash.premium_only_desc', 'Bu sayfa sadece Premium üyelere özeldir.') + '</p>\n          <a href="settings.html#panel-plan" class="btn btn-primary" style="padding:0.7rem 2rem;text-decoration:none;font-family:\'DM Sans\',sans-serif;" data-i18n="nav.upgrade_premium">' + _t('nav.upgrade_premium', 'Premium\'a Geç →') + '</a>\n          <a href="dashboard.html" style="color:var(--muted);font-size:13px;text-decoration:none;font-family:\'DM Sans\',sans-serif;" data-i18n="premium_dash.back_standard">' + _t('premium_dash.back_standard', '← Standart Dashboard\'a Dön') + '</a>\n        </div>\n      ';
      return;
    }

    try {
      if (typeof window.updateOvertradeBell === 'function') {
        await window.updateOvertradeBell();
      }
    } catch(e) {}

    if (typeof isAdmin === 'function' && isAdmin(user)) {
      var adminLink = document.getElementById('admin-link');
      var adminLinkMobile = document.getElementById('admin-link-mobile');
      if (adminLink) adminLink.style.display = 'inline';
      if (adminLinkMobile) adminLinkMobile.style.display = 'block';
    }

    await updateNavbarAvatar();

    var jid = window.journal ? window.journal.getActiveJournalId() : null;
    if (!jid) {
      if (typeof wwLog !== 'undefined') wwLog.warn('[Premium Dashboard] Aktif journal yok, veri yüklenmiyor');
      return;
    }

    // ⚡ SWR Önbellek Kontrolü: Varsa hemen önbellekten dön (0ms gecikme)
    var allTradesData = [];
    if (typeof window !== 'undefined' && window.wwCache) {
      var cachedTrades = window.wwCache.get('trades_premium', user.id, jid);
      if (cachedTrades && cachedTrades.length > 0) {
        allTradesData = cachedTrades;
      }
    }

    if (allTradesData.length === 0) {
      var pageSize = 1000;
      var from = 0;
      var hasMore = true;

      while (hasMore) {
        var { data, error } = await sb
          .from('trades')
          .select('id,symbol,direction,lot,entry_price,exit_price,stop_loss,take_profit,trade_date,pnl,rr_ratio,notes,strategy_id,instrument,multiplier')
          .eq('user_id', user.id)
          .eq('journal_id', jid)
          .order('trade_date', { ascending: false })
          .order('id', { ascending: true })
          .range(from, from + pageSize - 1);

        if (error) {
          if (typeof showToast === 'function') showToast(_t('common.load_error', 'Yükleme hatası: ') + error.message, 'error');
          return;
        }

        if (data && data.length > 0) {
          allTradesData = allTradesData.concat(data);
          if (data.length < pageSize) hasMore = false;
          else from += pageSize;
        } else {
          hasMore = false;
        }
      }

      // ⚡ Sonucu önbelleğe kaydet
      if (typeof window !== 'undefined' && window.wwCache) {
        window.wwCache.set('trades_premium', user.id, jid, allTradesData);
      }
    }

    allTrades = allTradesData;
    currentFilteredTrades = filterTradesByDate(allTrades, currentRange, customRangeStart, customRangeEnd);

    var main2 = document.getElementById('main-content');
    main2.innerHTML = '\n      <div class="page-header">\n        <div>\n          <div class="page-header-title-row"><h1 data-i18n="premium_dash.title">' + _t('premium_dash.title', 'Premium Dashboard') + '</h1><span class="premium-crown-badge">Premium</span><div id="premium-prop-badge"></div></div>\n          <p class="subtitle" data-i18n="premium_dash.subtitle">' + _t('premium_dash.subtitle', 'Gelişmiş analiz ve strateji takibi') + '</p>\n        </div>\n        <div class="header-actions">\n          <div class="date-filter-group" id="premium-date-filter-group">\n            <button type="button" class="date-filter-option active" data-range="all" data-i18n="dashboard.filter.all">' + _t('dashboard.filter.all', 'Tümü') + '</button>\n            <button type="button" class="date-filter-option" data-range="week" data-i18n="dashboard.filter.week">' + _t('dashboard.filter.week', 'Bu Hafta') + '</button>\n            <button type="button" class="date-filter-option" data-range="month" data-i18n="dashboard.filter.month">' + _t('dashboard.filter.month', 'Bu Ay') + '</button>\n            <button type="button" class="date-filter-option" data-range="year" data-i18n="dashboard.filter.year">' + _t('dashboard.filter.year', 'Bu Yıl') + '</button>\n            <button type="button" class="date-filter-option" data-range="custom" id="premium-custom-range-btn" data-i18n="dashboard.filter.custom">' + _t('dashboard.filter.custom', 'Özel') + '</button>\n          </div>\n          <div class="custom-range-panel" id="premium-custom-range-panel">\n            <input type="date" id="premium-range-start" class="custom-range-input" />\n            <span class="custom-range-sep">–</span>\n            <input type="date" id="premium-range-end" class="custom-range-input" />\n            <button type="button" class="custom-range-apply" id="premium-range-apply" data-i18n="dashboard.filter.apply">' + _t('dashboard.filter.apply', 'Uygula') + '</button>\n          </div>\n          <button class="btn-export" id="export-csv-btn"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> <span data-i18n="dashboard.export_csv">' + _t('dashboard.export_csv', 'CSV İndir') + '</span></button>\n          <button class="btn-export" id="export-pdf-btn"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> <span data-i18n="dashboard.export_pdf">' + _t('dashboard.export_pdf', 'PDF İndir') + '</span></button>\n          <button class="layout-reset-btn" id="layout-reset-btn"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> <span data-i18n="premium_dash.reset_layout">' + _t('premium_dash.reset_layout', 'Düzeni Sıfırla') + '</span></button>\n        </div>\n      </div>\n\n      <div class="premium-stats-grid" id="premium-stats-grid">\n        <div class="pstat-card"><div class="pstat-label" data-i18n="dashboard.stats.total_trades">' + _t('dashboard.stats.total_trades', 'Toplam İşlem') + '</div><div class="pstat-value" id="pstat-total">—</div></div>\n        <div class="pstat-card" data-critical="true"><div class="pstat-label" data-i18n="dashboard.stats.total_pnl">' + _t('dashboard.stats.total_pnl', 'Toplam K/Z') + '</div><div class="pstat-value" id="pstat-pnl">—</div></div>\n        <div class="pstat-card"><div class="pstat-label" data-i18n="dashboard.stats.win_rate">' + _t('dashboard.stats.win_rate', 'Win Rate') + '</div><div class="pstat-value" id="pstat-wr">—</div></div>\n        <div class="pstat-card"><div class="pstat-label" data-i18n="dashboard.kpi.profit_factor">' + _t('dashboard.kpi.profit_factor', 'Profit Factor') + '</div><div class="pstat-value" id="pstat-pf">—</div></div>\n        <div class="pstat-card" data-critical="true"><div class="pstat-label" data-i18n="premium_dash.sharpe_ratio">' + _t('premium_dash.sharpe_ratio', 'Sharpe Ratio') + '</div><div class="pstat-value" id="pstat-sharpe">—</div></div>\n      </div>\n\n      <div class="kpi-bar">\n        <div class="kpi-item"><span class="kpi-label" data-i18n="dashboard.kpi.avg_win">' + _t('dashboard.kpi.avg_win', 'Ort. Kazanç') + '</span><span class="kpi-value positive" id="kpi-avg-win">—</span></div>\n        <div class="kpi-item"><span class="kpi-label" data-i18n="dashboard.kpi.avg_loss">' + _t('dashboard.kpi.avg_loss', 'Ort. Kayıp') + '</span><span class="kpi-value negative" id="kpi-avg-loss">—</span></div>\n        <div class="kpi-item"><span class="kpi-label" data-i18n="dashboard.kpi.profit_factor">' + _t('dashboard.kpi.profit_factor', 'Profit Factor') + '</span><span class="kpi-value" id="kpi-pf">—</span></div>\n        <div class="kpi-item"><span class="kpi-label" data-i18n="dashboard.kpi.max_drawdown">' + _t('dashboard.kpi.max_drawdown', 'Maks. Drawdown') + '</span><span class="kpi-value negative" id="kpi-dd">—</span></div>\n        <div class="kpi-item"><span class="kpi-label" data-i18n="dashboard.kpi.avg_rr">' + _t('dashboard.kpi.avg_rr', 'Ort. R:R') + '</span><span class="kpi-value" id="kpi-rr">—</span></div>\n      </div>\n\n      <div class="dashboard-grid" id="dashboard-grid"></div>\n    ';

    if (typeof window !== 'undefined' && window.i18n && window.i18n.apply) window.i18n.apply();

    renderWidgets();
    renderPremiumStats(currentFilteredTrades);
    renderKpiBar(currentFilteredTrades);

    // Filter toolbar click handlers
    var filterGroup = document.getElementById('premium-date-filter-group');
    if (filterGroup) {
      filterGroup.addEventListener('click', function(e) {
        var btn = e.target.closest('.date-filter-option');
        if (!btn) return;
        var range = btn.dataset.range;
        if (range === 'custom') {
          var customPanel = document.getElementById('premium-custom-range-panel');
          if (customPanel) {
            customPanel.classList.toggle('open');
          }
        } else {
          applyFilter(range);
        }
      });
    }

    var rangeApplyBtn = document.getElementById('premium-range-apply');
    if (rangeApplyBtn) {
      rangeApplyBtn.addEventListener('click', function() {
        var s = document.getElementById('premium-range-start');
        var e = document.getElementById('premium-range-end');
        var startVal = s ? s.value : '';
        var endVal = e ? e.value : '';
        if (startVal && endVal) {
          applyFilter('custom', startVal, endVal);
        }
      });
    }

    document.getElementById('export-csv-btn').addEventListener('click', function() { exportCSV(currentFilteredTrades); });
    document.getElementById('export-pdf-btn').addEventListener('click', function() { exportPDF(currentFilteredTrades); });

    var fabCsv = document.getElementById('export-csv-fab');
    var fabPdf = document.getElementById('export-pdf-fab');
    if (fabCsv) fabCsv.addEventListener('click', function() { exportCSV(currentFilteredTrades); });
    if (fabPdf) fabPdf.addEventListener('click', function() { exportPDF(currentFilteredTrades); });

    document.getElementById('layout-reset-btn').addEventListener('click', resetLayout);

    if (chartRafId) cancelAnimationFrame(chartRafId);
    chartRafId = requestAnimationFrame(function() {
      renderCharts(currentFilteredTrades);
    });

    loadStrategySection(currentFilteredTrades, currentUser);

    hideSkeletons();

  } catch(e) {
    console.error('[Premium Dashboard] Hata:', e);
    if (typeof showToast === 'function') showToast(_t('premium_dash.loading_error', 'Premium Dashboard yüklenirken hata oluştu'), 'error');
  }
}

// DOM READY
document.addEventListener('DOMContentLoaded', function() {
  wwLog.log('[Premium Dashboard] DOM yüklendi, Premium Dashboard başlatılıyor...');

  // Avatar dropdown
  var ua = document.getElementById('user-avatar');
  var dm = document.getElementById('dropdown-menu');
  if (ua && dm) {
    ua.addEventListener('click', function(e) { e.stopPropagation(); dm.classList.toggle('show'); });
    document.addEventListener('click', function() { dm.classList.remove('show'); });
  }

  // Logout
  var logoutBtn = document.getElementById('logout-dropdown-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async function() {
      localStorage.removeItem('ww_last_active_push');
      await sb.auth.signOut();
      window.location.href = 'index.html';
    });
  }

  // Mobile menu
  var nt = document.getElementById('nav-toggle');
  var nm = document.getElementById('nav-menu');
  var nb = document.getElementById('nav-backdrop');

  if (nt) nt.addEventListener('click', function() {
    nm.classList.contains('open') ? closeMenu() : openMenu();
  });
  if (nb) nb.addEventListener('click', closeMenu);

  var logoutMobile = document.getElementById('logout-btn-mobile');
  if (logoutMobile) {
    logoutMobile.addEventListener('click', function() {
      closeMenu();
      var btn = document.getElementById('logout-dropdown-btn');
      if (btn) btn.click();
    });
  }

  // FAB Toggle
  var fabToggle = document.getElementById('fab-toggle');
  var fabActions = document.getElementById('fab-actions');
  if (fabToggle && fabActions) {
    fabToggle.addEventListener('click', function() {
      fabActions.classList.toggle('open');
    });
    document.addEventListener('click', function(e) {
      if (!e.target.closest('#fab-toggle') && !e.target.closest('#fab-actions')) {
        fabActions.classList.remove('open');
      }
    });
  }

  // Bell Panel
  var bellBtn = document.getElementById('overtrade-bell-btn');
  var bellPanel = document.getElementById('bell-panel');
  if (bellBtn && bellPanel) {
    bellBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      bellPanel.classList.toggle('open');
      if (bellPanel.classList.contains('open')) {
        if (typeof window.markOvertradeAsRead === 'function') {
          window.markOvertradeAsRead();
        }
      }
    });
    document.addEventListener('click', function(e) {
      if (!e.target.closest('#bell-panel') && !e.target.closest('#overtrade-bell-btn')) {
        bellPanel.classList.remove('open');
      }
    });
  }

  // Bell mark read
  var markReadBtn = document.getElementById('bell-mark-read-btn');
  if (markReadBtn) {
    markReadBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (typeof window.markOvertradeAsRead === 'function') {
        window.markOvertradeAsRead();
      }
    });
  }

  // Inject skeleton and load
  injectSkeletonMarkup();
  setTimeout(function() {
    loadPremiumData();
  }, 500);
});

// GLOBAL EXPORT (window üzerinden)
window.markOvertradeAsRead = markOvertradeAsRead;
window.openMenu = openMenu;
window.closeMenu = closeMenu;
window.exportCSV = function() { exportCSV(currentFilteredTrades); };
window.exportPDF = function() { exportPDF(currentFilteredTrades); };
document.addEventListener('journal-changed', () => window.location.reload());

