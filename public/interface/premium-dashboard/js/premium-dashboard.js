// ============================================================
// premium-dashboard.js - ANA DOSYA
// Global state, init, event listeners, koordinasyon
// ⭐ FIX: Scroll listener KALDIRILDI (gereksiz performans yükü)
// ⭐ Sadece resize ve drag-drop sonrası resize çalışır
// ⭐ i18n: Hardcoded metinler i18n.t() çağrılarına + data-i18n
//    attribute'larına dönüştürüldü (yükleme hatası, premium-only
//    ekranı, ana içerik başlık/KPI etiketleri, hata toast'ları).
// ============================================================

// ⭐ Logger — global wwLog'a fallback ile bağlan
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
  bellEmptyStateHtml
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

// ⭐ GLOBAL STATE
var currentUser = null;
var allTrades = [];
var isPageVisible = true;
var chartRafId = null;

// ⭐ TEMA OBSERVER
var themeObserver = new MutationObserver(function(mutations) {
  mutations.forEach(function(mutation) {
    if (mutation.attributeName === 'class') {
      updateChartTheme();
      if (allTrades && allTrades.length > 0) {
        renderCharts(allTrades);
      }
    }
  });
});
themeObserver.observe(document.body, { attributes: true });

// ⭐ WINDOW RESIZE - SADECE RESIZE
var resizeTimer = null;
window.addEventListener('resize', function() {
  if (resizeTimer) { clearTimeout(resizeTimer); resizeTimer = null; }
  resizeTimer = setTimeout(function() {
    forceResizeAllCharts();
    resizeTimer = null;
  }, 300);
});

// ⭐ SCROLL LISTENER KALDIRILDI - gereksiz performans yükü
// Drag-drop zaten onEnd'de resize tetikliyor

// ⭐ VISIBILITY CHANGE
document.addEventListener('visibilitychange', function() {
  isPageVisible = !document.hidden;
  if (isPageVisible && allTrades && allTrades.length > 0) {
    var hasCharts = document.querySelector('.chart-wrap .apexcharts-canvas, .chart-wrap .lwc-chart');
    if (!hasCharts) {
      if (chartRafId) cancelAnimationFrame(chartRafId);
      chartRafId = requestAnimationFrame(function() {
        renderCharts(allTrades);
      });
    }
  }
});

// ⭐ MENU FONKSİYONLARI
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

// ⭐ LOAD PREMIUM DATA
async function loadPremiumData() {
  wwLog.log('📊 loadPremiumData başlatıldı...');

  if (typeof requireAuth === 'undefined') {
    wwLog.warn('⏳ requireAuth henüz yüklenmedi, 1 saniye bekleniyor...');
    await new Promise(function(resolve) { setTimeout(resolve, 1000); });

    if (typeof requireAuth === 'undefined') {
      console.error('❌ requireAuth hala yüklenmedi!');
      var main = document.getElementById('main-content');
      if (main) {
        main.innerHTML = '\n          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;text-align:center;gap:1rem;padding:2rem;">\n            <div style="font-size:3rem;">⚠️</div>\n            <h2 style="font-family:\'Syne\',sans-serif;font-size:1.5rem;color:var(--text);">' + i18n.t('premium_dash.load_error_title') + '</h2>\n            <p style="color:var(--muted);max-width:400px;font-size:14px;font-family:\'DM Sans\',sans-serif;">' + i18n.t('premium_dash.load_error_desc') + '</p>\n            <button onclick="location.reload()" class="btn btn-primary" style="padding:0.7rem 2rem;cursor:pointer;">' + i18n.t('premium_dash.reload') + '</button>\n          </div>\n        ';
      }
      return;
    }
  }

  showSkeletons();

  try {
    var user = await requireAuth();
    if (!user) return;
    currentUser = user;

    var planData = await getUserPlan();
    if (planData.plan !== 'premium') {
      var main = document.getElementById('main-content');
      main.innerHTML = '\n        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;text-align:center;gap:1.5rem;padding:2rem;">\n          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 13L2 9l4-6z"/><path d="M12 22V9"/><path d="M2 9h20"/><path d="M6 3l6 6 6-6"/></svg>\n          <h2 style="font-family:\'Syne\',sans-serif;font-size:1.5rem;color:var(--text);">' + i18n.t('premium_dash.premium_only_title') + '</h2>\n          <p style="color:var(--muted);max-width:400px;font-size:14px;font-family:\'DM Sans\',sans-serif;">' + i18n.t('premium_dash.premium_only_desc') + '</p>\n          <a href="settings.html#panel-plan" class="btn btn-primary" style="padding:0.7rem 2rem;text-decoration:none;font-family:\'DM Sans\',sans-serif;">' + i18n.t('nav.upgrade_premium') + '</a>\n          <a href="dashboard.html" style="color:var(--muted);font-size:13px;text-decoration:none;font-family:\'DM Sans\',sans-serif;">' + i18n.t('premium_dash.back_standard') + '</a>\n        </div>\n      ';
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

    var { data, error } = await sb.from('trades').select('*').eq('user_id', user.id).order('trade_date', { ascending: true });
    if (error) {
      if (typeof showToast === 'function') showToast(i18n.t('common.load_error') + error.message, 'error');
      return;
    }

    allTrades = data || [];

    var main2 = document.getElementById('main-content');
    main2.innerHTML = '\n      <div class="page-header">\n        <div>\n          <div class="page-header-title-row"><h1 data-i18n="premium_dash.title">' + i18n.t('premium_dash.title') + '</h1><span class="premium-crown-badge">Premium</span></div>\n          <p class="subtitle" data-i18n="premium_dash.subtitle">' + i18n.t('premium_dash.subtitle') + '</p>\n        </div>\n        <div class="header-actions">\n          <button class="btn-export" id="export-csv-btn"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> ' + i18n.t('dashboard.export_csv') + '</button>\n          <button class="btn-export" id="export-pdf-btn"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ' + i18n.t('dashboard.export_pdf') + '</button>\n          <button class="layout-reset-btn" id="layout-reset-btn"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> ' + i18n.t('premium_dash.reset_layout') + '</button>\n        </div>\n      </div>\n\n      <div class="premium-stats-grid" id="premium-stats-grid">\n        <div class="pstat-card"><div class="pstat-label" data-i18n="dashboard.stats.total_trades">' + i18n.t('dashboard.stats.total_trades') + '</div><div class="pstat-value" id="pstat-total">—</div></div>\n        <div class="pstat-card" data-critical="true"><div class="pstat-label" data-i18n="dashboard.stats.total_pnl">' + i18n.t('dashboard.stats.total_pnl') + '</div><div class="pstat-value" id="pstat-pnl">—</div></div>\n        <div class="pstat-card"><div class="pstat-label" data-i18n="dashboard.stats.win_rate">' + i18n.t('dashboard.stats.win_rate') + '</div><div class="pstat-value" id="pstat-wr">—</div></div>\n        <div class="pstat-card"><div class="pstat-label" data-i18n="dashboard.kpi.profit_factor">' + i18n.t('dashboard.kpi.profit_factor') + '</div><div class="pstat-value" id="pstat-pf">—</div></div>\n        <div class="pstat-card" data-critical="true"><div class="pstat-label" data-i18n="premium_dash.sharpe_ratio">' + i18n.t('premium_dash.sharpe_ratio') + '</div><div class="pstat-value" id="pstat-sharpe">—</div></div>\n      </div>\n\n      <div class="kpi-bar">\n        <div class="kpi-item"><span class="kpi-label" data-i18n="dashboard.kpi.avg_win">' + i18n.t('dashboard.kpi.avg_win') + '</span><span class="kpi-value positive" id="kpi-avg-win">—</span></div>\n        <div class="kpi-item"><span class="kpi-label" data-i18n="dashboard.kpi.avg_loss">' + i18n.t('dashboard.kpi.avg_loss') + '</span><span class="kpi-value negative" id="kpi-avg-loss">—</span></div>\n        <div class="kpi-item"><span class="kpi-label" data-i18n="dashboard.kpi.profit_factor">' + i18n.t('dashboard.kpi.profit_factor') + '</span><span class="kpi-value" id="kpi-pf">—</span></div>\n        <div class="kpi-item"><span class="kpi-label" data-i18n="dashboard.kpi.max_drawdown">' + i18n.t('dashboard.kpi.max_drawdown') + '</span><span class="kpi-value negative" id="kpi-dd">—</span></div>\n        <div class="kpi-item"><span class="kpi-label" data-i18n="dashboard.kpi.avg_rr">' + i18n.t('dashboard.kpi.avg_rr') + '</span><span class="kpi-value" id="kpi-rr">—</span></div>\n      </div>\n\n      <div class="dashboard-grid" id="dashboard-grid"></div>\n    ';

    // ⭐ DEĞİŞTİ: innerHTML sonrası i18n.apply() ile yeni DOM'u tara
    if (typeof i18n !== 'undefined' && i18n.apply) i18n.apply();

    renderWidgets();
    renderPremiumStats(allTrades);
    renderKpiBar(allTrades);

    document.getElementById('export-csv-btn').addEventListener('click', function() { exportCSV(allTrades); });
    document.getElementById('export-pdf-btn').addEventListener('click', function() { exportPDF(allTrades); });

    var fabCsv = document.getElementById('export-csv-fab');
    var fabPdf = document.getElementById('export-pdf-fab');
    if (fabCsv) fabCsv.addEventListener('click', function() { exportCSV(allTrades); });
    if (fabPdf) fabPdf.addEventListener('click', function() { exportPDF(allTrades); });

    document.getElementById('layout-reset-btn').addEventListener('click', resetLayout);

    if (chartRafId) cancelAnimationFrame(chartRafId);
    chartRafId = requestAnimationFrame(function() {
      renderCharts(allTrades);
    });

    loadStrategySection(allTrades, currentUser);

    hideSkeletons();

  } catch(e) {
    console.error('Premium Dashboard hatası:', e);
    if (typeof showToast === 'function') showToast(i18n.t('premium_dash.loading_error'), 'error');
  }
}

// ⭐ DOM READY
document.addEventListener('DOMContentLoaded', function() {
  wwLog.log('📄 DOM yüklendi, Premium Dashboard başlatılıyor...');

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
      if (!fabToggle.contains(e.target) && !fabActions.contains(e.target)) {
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
      if (!bellPanel.contains(e.target) && !bellBtn.contains(e.target)) {
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
});s

// ⭐ GLOBAL EXPORT (window üzerinden)
window.markOvertradeAsRead = markOvertradeAsRead;
window.openMenu = openMenu;
window.closeMenu = closeMenu;
window.exportCSV = function() { exportCSV(allTrades); };
window.exportPDF = function() { exportPDF(allTrades); };