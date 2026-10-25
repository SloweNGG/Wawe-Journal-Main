// ============================================================
// analytics.js - ANA DOSYA
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
  clearLightweightChart,
  setAllTrades,
  renderChartFor,
  resetChartAnimations
} from './chart-renderers.js';

import {
  showSkeletons,
  hideSkeletons,
  saveLayoutOrder,
  loadLayoutOrder,
  initDragDrop,
  destroyDragDrop,
  forceResizeAllCharts,
  renderProStats,
  renderKpiBar,
  buildWidgets,
  renderWidgets,
  loadStrategySection,
  markOvertradeAsRead,
  updateNavbarAvatar,
  exportCSV,
  exportPDF
} from './dashboard-manager.js';

import { initCustomizer } from './widget-customizer.js';
import { initChartExpand } from './chart-expand.js';
import { openExportDialog, closeExportDialog } from './export-dialog.js';
import { isPropActive, renderPropHeader, setHeaderMetaHtml, renderPropWidgets } from './prop-widgets.js';
import { setPlan, isPro, isPlanPreview, applyKpiDensity } from './widget-prefs.js';

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

// ============================================================
// SPA YAŞAM DÖNGÜSÜ
// Bu bir ES modülü: tarayıcı onu doküman başına yalnızca BİR KEZ çalıştırır. SPA ile
// sayfaya her girişte mount(), çıkışta da PAGE.onLeave temizliği çalışır
// (bkz. en alttaki mountIfOnPage ve BaseHead.astro → wwPage).
// ============================================================
var PAGE = null;

// GLOBAL STATE (mount() her ziyarette sıfırlar)
var currentUser = null;
var allTrades = [];
var currentFilteredTrades = [];
var currentRange = 'all';
var customRangeStart = null;
var customRangeEnd = null;
var isPageVisible = true;
var chartRafId = null;

// TEMA OBSERVER (mount'ta bağlanır, çıkışta ayrılır)
// body'ye açılışta ortam ışığı, navbar, plan gibi birçok sınıf eklenir; eskiden her biri tüm
// grafikleri baştan çiziyordu. Artık yalnızca açık/koyu tema gerçekten değişince çizilir.
var lastLightTheme = null;
var themeObserver = new MutationObserver(function() {
  var isLight = document.body.classList.contains('light-theme');
  if (isLight === lastLightTheme) return;
  lastLightTheme = isLight;
  updateChartTheme();
  if (isDataReady && currentFilteredTrades && currentFilteredTrades.length > 0) {
    renderCharts(currentFilteredTrades);
  }
  // açık büyütülmüş grafik de yeni temayla çizilsin
  if (window.WwChartViewer && window.WwChartViewer.isOpen()) window.WwChartViewer.rerender();
});

// WINDOW RESIZE - SADECE RESIZE
var resizeTimer = null;
function onWindowResize() {
  if (resizeTimer) { clearTimeout(resizeTimer); resizeTimer = null; }
  resizeTimer = setTimeout(function() {
    forceResizeAllCharts();
    resizeTimer = null;
  }, 300);
}

// ⭐ GRAFİK ZAMANLAYICI — tüm çizim istekleri buradan geçer.
// Eskiden iskeleti kaldıran çağrı tek bir zamanlayıcının içindeydi; o zamanlayıcı başka bir
// güncellemeyle (taze veri, prop durumu, plan, filtre) iptal edilince iskelet ekranda kalıyordu.
// Artık her çizimden sonra (hata olsa bile) veri hazırsa iskelet kaldırılır.
function scheduleCharts() {
  if (chartRafId) cancelAnimationFrame(chartRafId);
  chartRafId = requestAnimationFrame(function() {
    chartRafId = null;
    try {
      renderCharts(currentFilteredTrades);
    } catch (e) {
      console.error('[Analiz] Grafik çizim hatası:', e);
    } finally {
      if (isDataReady) hideSkeletons();
    }
  });
}

// VISIBILITY CHANGE
function onVisibilityChange() {
  isPageVisible = !document.hidden;
  if (isPageVisible && currentFilteredTrades && currentFilteredTrades.length > 0) {
    var hasCharts = document.querySelector('.chart-wrap .apexcharts-canvas, .chart-wrap .lwc-chart');
    if (!hasCharts) scheduleCharts();
  }
}

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

  var options = document.querySelectorAll('#pro-date-filter-group .date-filter-option');
  var dataReadyForFilter = isDataReady;
  options.forEach(function(opt) {
    if (opt.dataset.range === currentRange) {
      opt.classList.add('active');
    } else {
      opt.classList.remove('active');
    }
  });

  var customPanel = document.getElementById('pro-custom-range-panel');
  if (customPanel) {
    if (currentRange === 'custom') {
      customPanel.classList.add('open');
    } else {
      customPanel.classList.remove('open');
    }
  }

  if (!dataReadyForFilter) return;
  renderHeaderStats();
  renderCharts(currentFilteredTrades);
  loadStrategySection(currentFilteredTrades, currentUser);
}

// ============================================================
// HEADER — başlık, dinamik bilgi satırı, araç çubuğu ve KPI kartları
// ============================================================
var HEADER_ICONS = {
  crown: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18h20"/><path d="m2 7 5 5 5-8 5 8 5-5-2 11H4z"/></svg>',
  download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  chevron: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  csv: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
  pdf: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
  sliders: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>'
};

function i18nSpan(key, fallback) {
  return '<span data-i18n="' + key + '">' + _t(key, fallback) + '</span>';
}

function statCardHtml(id, labelKey, labelFallback, extraHtml) {
  return '<div class="pstat-card">' +
    '<div class="pstat-top">' +
      '<span class="pstat-label" data-i18n="' + labelKey + '">' + _t(labelKey, labelFallback) + '</span>' +
      '<span class="pstat-delta" id="' + id + '-delta"></span>' +
    '</div>' +
    '<div class="pstat-value" id="' + id + '">—</div>' +
    (extraHtml || '<div class="pstat-sub" id="' + id + '-sub"></div>') +
  '</div>';
}

function kpiItemHtml(id, labelKey, labelFallback, cls) {
  return '<div class="kpi-item">' +
    '<span class="kpi-label" data-i18n="' + labelKey + '">' + _t(labelKey, labelFallback) + '</span>' +
    '<span class="kpi-value' + (cls ? ' ' + cls : '') + '" id="' + id + '">—</span>' +
  '</div>';
}

function headerHtml() {
  var filters = [
    ['all', 'dashboard.filter.all', 'Tümü'],
    ['week', 'dashboard.filter.week', 'Bu Hafta'],
    ['month', 'dashboard.filter.month', 'Bu Ay'],
    ['year', 'dashboard.filter.year', 'Bu Yıl'],
    ['custom', 'dashboard.filter.custom', 'Özel']
  ].map(function(f) {
    return '<button type="button" class="date-filter-option' + (f[0] === 'all' ? ' active' : '') + '" data-range="' + f[0] + '"' +
      (f[0] === 'custom' ? ' id="pro-custom-range-btn"' : '') + ' data-i18n="' + f[1] + '">' + _t(f[1], f[2]) + '</button>';
  }).join('');

  return '' +
    (isPlanPreview()
      ? '<div class="plan-preview-bar" role="status">' +
          '<span class="plan-preview-dot"></span>' +
          '<span><strong>' + _t('analytics_dash.preview.title', 'Ücretsiz plan önizlemesi') + '</strong> — ' +
          _t('analytics_dash.preview.text', 'Ücretsiz kullanıcıların göreceği dashboard. Buradaki değişiklikler kendi düzenini etkilemez.') + '</span>' +
          '<a href="' + window.location.pathname + '" class="plan-preview-exit">' + _t('analytics_dash.preview.exit', 'Önizlemeden çık') + '</a>' +
        '</div>'
      : '') +
    '<div class="page-header">' +
      '<div class="ph-title">' +
        '<div class="ph-eyebrow" id="ph-eyebrow">' + HEADER_ICONS.crown + i18nSpan('analytics_dash.eyebrow', 'Pro Analitik') + '</div>' +
        '<div class="page-header-title-row">' +
          '<h1 data-i18n="analytics_dash.heading">' + _t('analytics_dash.heading', 'Performans Analizi') + '</h1>' +
          scopeBadgeHtml() +
          '<div id="pro-prop-badge"></div>' +
        '</div>' +
        '<div class="ph-meta" id="pro-header-meta"></div>' +
      '</div>' +
      '<div class="header-actions">' +
        '<div class="ph-prop-actions" id="ph-prop-actions"></div>' +
        '<div class="date-filter-group" id="pro-date-filter-group">' + filters + '</div>' +
        '<div class="custom-range-panel" id="pro-custom-range-panel">' +
          '<input type="date" id="pro-range-start" class="custom-range-input" />' +
          '<span class="custom-range-sep">–</span>' +
          '<input type="date" id="pro-range-end" class="custom-range-input" />' +
          '<button type="button" class="custom-range-apply" id="pro-range-apply" data-i18n="dashboard.filter.apply">' + _t('dashboard.filter.apply', 'Uygula') + '</button>' +
        '</div>' +
        '<div class="ph-export">' +
          '<button type="button" class="ph-btn" id="export-menu-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="export-menu">' +
            HEADER_ICONS.download + i18nSpan('analytics_dash.export', 'Dışa aktar') + HEADER_ICONS.chevron +
          '</button>' +
          '<div class="ph-menu" id="export-menu" role="menu">' +
            '<button type="button" role="menuitem" class="ph-menu-item" id="export-csv-btn">' + HEADER_ICONS.csv +
              '<span><strong data-i18n="analytics_dash.export_csv">' + _t('analytics_dash.export_csv', 'CSV') + '</strong>' +
              '<small data-i18n="analytics_dash.export_csv_desc">' + _t('analytics_dash.export_csv_desc', 'Excel için işlem listesi') + '</small></span>' +
            '</button>' +
            '<button type="button" role="menuitem" class="ph-menu-item" id="export-pdf-btn">' + HEADER_ICONS.pdf +
              '<span><strong data-i18n="analytics_dash.export_pdf">' + _t('analytics_dash.export_pdf', 'PDF raporu') + '</strong>' +
              '<small data-i18n="analytics_dash.export_pdf_desc">' + _t('analytics_dash.export_pdf_desc', 'Özet ve işlem tablosu') + '</small></span>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="ph-btn ph-btn--accent" id="customize-btn" aria-haspopup="dialog" aria-expanded="false">' +
          HEADER_ICONS.sliders + i18nSpan('analytics_dash.customize', 'Özelleştir') +
        '</button>' +
      '</div>' +
    '</div>' +

    '<div class="pro-stats-grid" id="pro-stats-grid">' +
      statCardHtml('pstat-total', 'dashboard.stats.total_trades', 'Toplam İşlem') +
      statCardHtml('pstat-pnl', 'dashboard.stats.total_pnl', 'Toplam K/Z') +
      statCardHtml('pstat-wr', 'dashboard.stats.win_rate', 'Win Rate', '<div class="pstat-bar"><span id="pstat-wr-bar"></span></div>') +
      statCardHtml('pstat-pf', 'dashboard.kpi.profit_factor', 'Profit Factor') +
      statCardHtml('pstat-sharpe', 'analytics_dash.sharpe_ratio', 'Sharpe Ratio') +
    '</div>' +

    '<div class="kpi-bar">' +
      kpiItemHtml('kpi-avg-win', 'dashboard.kpi.avg_win', 'Ort. Kazanç', 'positive') +
      kpiItemHtml('kpi-avg-loss', 'dashboard.kpi.avg_loss', 'Ort. Kayıp', 'negative') +
      kpiItemHtml('kpi-payoff', 'analytics_dash.kpi.payoff', 'Kazanç/Kayıp Oranı') +
      kpiItemHtml('kpi-dd', 'dashboard.kpi.max_drawdown', 'Maks. Drawdown', 'negative') +
      kpiItemHtml('kpi-rr', 'dashboard.kpi.avg_rr', 'Ort. R:R') +
    '</div>' +

    '<div class="dashboard-grid" id="dashboard-grid"></div>';
}

// Hafta/ay/yıl filtresinde bir önceki eşdeğer dönemin işlemleri (değişim rozetleri için)
function getPreviousPeriodTrades() {
  if (currentRange === 'all' || currentRange === 'custom') return null;
  var prev = window.WwTime.previousRangeKeys(currentRange);
  if (!prev) return null;
  return allTrades.filter(function(t) {
    var k = window.WwMetrics.dateKey(t);
    return k && k >= prev.start && k < prev.end;
  });
}

// Bilgi satırı: defter · dönem · işlem sayısı · son işlem tarihi
function updateHeaderMeta() {
  var el = document.getElementById('pro-header-meta');
  if (!el) return;
  var lang = (window.i18n && typeof window.i18n.getCurrentLanguage === 'function') ? window.i18n.getCurrentLanguage() : 'tr';
  var parts = [];

  // Defter adı: navbar'daki ilk metin düğümü (yanındaki rozet metinleri alınmaz)
  var journalEl = document.querySelector('.nav-journal-switcher .journal-name');
  var journal = journalEl && journalEl.firstChild ? String(journalEl.firstChild.textContent || '').trim() : '';
  if (journal) parts.push({ text: journal, cls: 'ph-meta-journal' });

  var rangeText;
  if (currentRange === 'custom' && customRangeStart && customRangeEnd) {
    var fmt = { day: 'numeric', month: 'short' };
    rangeText = window.WwTime.formatDate(customRangeStart, lang, fmt) + ' – ' + window.WwTime.formatDate(customRangeEnd, lang, fmt);
  } else {
    var active = document.querySelector('#pro-date-filter-group .date-filter-option[data-range="' + currentRange + '"]');
    rangeText = active ? active.textContent.trim() : '';
  }
  if (rangeText) parts.push({ text: rangeText });

  var closed = currentFilteredTrades.filter(function(t) { return window.WwMetrics.isClosed(t); });
  parts.push({ text: _t('analytics_dash.meta.trades', '{n} kapanmış işlem').replace('{n}', closed.length) });

  var last = '';
  currentFilteredTrades.forEach(function(t) {
    var d = String(t.trade_date || '');
    if (d > last) last = d;
  });
  if (last) {
    parts.push({ text: _t('analytics_dash.meta.last_trade', 'Son işlem {date}')
      .replace('{date}', window.WwTime.formatDate(last, lang, { day: 'numeric', month: 'short', year: 'numeric' })) });
  }

  el.innerHTML = parts.map(function(p) {
    return '<span class="ph-meta-item' + (p.cls ? ' ' + p.cls : '') + '">' + sanitizeHTML(p.text) + '</span>';
  }).join('<span class="ph-meta-sep" aria-hidden="true">·</span>');
  // Prop defterinde aynı satır "Prop Hesap Durumu" kartında da gösterilir
  setHeaderMetaHtml(el.innerHTML);
}

function renderHeaderStats() {
  setAllTrades(allTrades);
  renderProStats(currentFilteredTrades, getPreviousPeriodTrades());
  renderKpiBar(currentFilteredTrades);
  updateHeaderMeta();
}

// PDF raporu: önce dönem penceresi (hazır aralıklar veya elle tarih); varsayılan sayfadaki filtre
function openPdfDialog() {
  var jName = (document.querySelector('.nav-journal-switcher .journal-name') || {}).textContent || '';
  openExportDialog({
    getAllTrades: function() { return allTrades; },
    pageRange: { range: currentRange, start: customRangeStart, end: customRangeEnd },
    journalName: jName.trim(),
    onExport: function(trades, meta) { return exportPDF(trades, meta); }
  });
}

// Dışa aktar menüsü: aç/kapa, dışarı tıklayınca ve Esc ile kapanır
function initExportMenu(scope) {
  var btn = document.getElementById('export-menu-btn');
  var menu = document.getElementById('export-menu');
  if (!btn || !menu) return;
  function setOpen(open) {
    menu.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    setOpen(!menu.classList.contains('open'));
  });
  menu.addEventListener('click', function(e) {
    if (e.target.closest('.ph-menu-item')) setOpen(false);
  });
  scope.on(document, 'click', function(e) {
    if (!e.target.closest('.ph-export')) setOpen(false);
  });
  scope.on(document, 'keydown', function(e) {
    if (e.key === 'Escape' && menu.classList.contains('open')) { setOpen(false); btn.focus(); }
  });
}

var isDashboardDomRendered = false;
var isDataReady = false;
var lastPropActive = false;

function onPropState() {
  renderPropHeader();
  if (!isDashboardDomRendered) return;
  var active = isPropActive();
  if (active !== lastPropActive) {
    lastPropActive = active;
    rerenderWidgetGrid();
    return;
  }
  // Prop kartları işlem verisine bağlı değil: yükleme sürerken de hemen güncellenir
  renderPropWidgets();
  if (isDataReady) {
    renderChartFor('cumulative', currentFilteredTrades);
    renderChartFor('insights', currentFilteredTrades);   // prop temposu / limit içgörüleri
  }
}

// Hesap planını kart görünümüne uygular. Sayfa Pro'ya özel; ?plan=free ücretsiz plan önizlemesini açar.
function applyAccountPlan(accountPlan) {
  var wasPro = isPro();
  var previewFree = new URLSearchParams(window.location.search).get('plan') === 'free';
  if (accountPlan === 'premium') {
    if (previewFree) setPlan('free', { preview: true });
    else setPlan('pro');
  } else {
    setPlan('free');
  }
  if (isDashboardDomRendered && wasPro !== isPro()) rerenderWidgetGrid();
}

// Hızlı ekleme / silme sonrası taze veriyi çek (art arda olaylar tek isteğe indirgenir)
var tradeRefreshTimer = null;
function onTradesChanged() {
  if (tradeRefreshTimer) clearTimeout(tradeRefreshTimer);
  tradeRefreshTimer = setTimeout(function() {
    tradeRefreshTimer = null;
    var jid = window.journal && typeof window.journal.getActiveJournalId === 'function' ? window.journal.getActiveJournalId() : null;
    if (currentUser && jid && PAGE && PAGE.alive) fetchFreshTrades(currentUser.id, jid, !isDataReady, PAGE);
  }, 300);
}

// Veri değişti mi? Adet, ilk kayıt, toplam K/Z ve son tarih birlikte karşılaştırılır
// (düzenlenen bir işlem adedi değiştirmez; eskiden bu durumda ekran güncellenmiyordu)
function tradesSignature(list) {
  var sum = 0, last = '';
  list.forEach(function(t) {
    sum += Number(t.pnl) || 0;
    var d = String(t.trade_date || '');
    if (d > last) last = d;
  });
  return list.length + '|' + (list[0] ? list[0].id : '') + '|' + sum.toFixed(2) + '|' + last;
}

// Widget gösterildiğinde/gizlendiğinde ya da düzen sıfırlandığında grid'i baştan kurar
function rerenderWidgetGrid() {
  clearAllApexCharts();
  clearLightweightChart();
  renderWidgets();
  renderPropHeader();
  if (!isDataReady) {   // yükleniyorsa yalnızca kart düzeni (ve veriden bağımsız prop kartları) kurulur
    renderPropWidgets();
    return;
  }
  scheduleCharts();
  loadStrategySection(currentFilteredTrades, currentUser);
}

// Veri gelince: istatistikler, grafikler ve stratejiler doldurulur (düzen zaten kurulu)
function renderDashboardDOM() {
  if (!isDashboardDomRendered) buildDashboardShell();
  isDataReady = true;
  try {
    renderHeaderStats();
  } catch (e) {
    console.error('[Analiz] İstatistik hatası:', e);
  }
  scheduleCharts();
  loadStrategySection(currentFilteredTrades, currentUser);
}

// Sayfa düzeni: başlık, KPI'lar ve kart kutuları veri gelmeden kurulur (yüklenirken parıltıyla bekler).
// Veri gelince yalnızca içerik dolar — ayrı bir iskelet HTML'i değiştirilmediği için düzen kaymaz.
function buildDashboardShell() {
  var main2 = document.getElementById('main-content');
  if (!main2) return;

  main2.innerHTML = headerHtml();
  applyKpiDensity();

  if (typeof window !== 'undefined' && window.i18n && window.i18n.apply) window.i18n.apply();

  renderWidgets();
  renderHeaderStats();

  // Filter toolbar click handlers
  var filterGroup = document.getElementById('pro-date-filter-group');
  if (filterGroup) {
    filterGroup.addEventListener('click', function(e) {
      var btn = e.target.closest('.date-filter-option');
      if (!btn) return;
      var range = btn.dataset.range;
      if (range === 'custom') {
        var customPanel = document.getElementById('pro-custom-range-panel');
        if (customPanel) {
          customPanel.classList.toggle('open');
        }
      } else {
        applyFilter(range);
      }
    });
  }

  var rangeApplyBtn = document.getElementById('pro-range-apply');
  if (rangeApplyBtn) {
    rangeApplyBtn.addEventListener('click', function() {
      var s = document.getElementById('pro-range-start');
      var e = document.getElementById('pro-range-end');
      var startVal = s ? s.value : '';
      var endVal = e ? e.value : '';
      if (startVal && endVal) {
        applyFilter('custom', startVal, endVal);
      }
    });
  }

  var exportCsvBtn = document.getElementById('export-csv-btn');
  if (exportCsvBtn) exportCsvBtn.addEventListener('click', function() { exportCSV(currentFilteredTrades); });
  var exportPdfBtn = document.getElementById('export-pdf-btn');
  if (exportPdfBtn) exportPdfBtn.addEventListener('click', openPdfDialog);

  var fabCsv = document.getElementById('export-csv-fab');
  var fabPdf = document.getElementById('export-pdf-fab');
  if (fabCsv) fabCsv.addEventListener('click', function() { exportCSV(currentFilteredTrades); });
  if (fabPdf) fabPdf.addEventListener('click', openPdfDialog);

  initExportMenu(PAGE);
  lastPropActive = isPropActive();
  renderPropHeader();
  renderPropWidgets();

  // Navbar defter adını sonradan yükleyebilir; bilgi satırı güncel kalsın
  var journalNameEl = document.querySelector('.nav-journal-switcher .journal-name');
  if (journalNameEl && typeof MutationObserver !== 'undefined') {
    var journalObserver = new MutationObserver(updateHeaderMeta);
    journalObserver.observe(journalNameEl, { childList: true, characterData: true, subtree: true });
    PAGE.onLeave(function() { journalObserver.disconnect(); });
  }

  // Grafik kartına tıklayınca büyük görünüm (ana dashboard'daki gibi)
  initChartExpand(PAGE, function() { return currentFilteredTrades; });

  initCustomizer(PAGE, {
    getTrades: function() { return currentFilteredTrades; },
    rerenderAll: rerenderWidgetGrid,
    onLayoutChange: renderPropHeader
  });

  isDashboardDomRendered = true;
  syncScopeBadge();
}

// Defterin trade_scope ayarı (live | backtest | all). Prop kartları bundan ETKİLENMEZ (prop-service kendi canlı verisini çeker).
function activeTradeScope(jid) {
  try {
    var id = jid || (window.journal && window.journal.getActiveJournalId && window.journal.getActiveJournalId());
    return window.WwTrades ? window.WwTrades.journalScope(id) : 'live';
  } catch (e) { return 'live'; }
}
// "Backtest dahil" / "Sadece backtest" rozeti; 'live' iken boş
function scopeBadgeHtml() {
  var sc = activeTradeScope();
  if (sc === 'live') return '<span id="scope-badge" class="ww-scope-badge" hidden></span>';
  var key = sc === 'all' ? 'scope.badge_all' : 'scope.badge_backtest';
  var fb = sc === 'all' ? 'Backtest dahil' : 'Sadece backtest';
  return '<span id="scope-badge" class="ww-scope-badge" data-i18n="' + key + '">' + _t(key, fb) + '</span>';
}

// Başlık rozetini (varsa) güncel kapsama göre eşitle: başlık, defter kapsamı çözülmeden önce çizilmiş olabilir
function syncScopeBadge(tScope) {
  try { window.WwTrades.applyScopeBadge(document.getElementById('scope-badge'), tScope || activeTradeScope()); } catch (e) {}
}

// Canlı kapsam kolonları: platform_source listeyi kendini tanımlar kılar (önbellek savunması)
var PRO_TRADE_COLS = ['id', 'symbol', 'direction', 'lot', 'entry_price', 'exit_price', 'stop_loss', 'take_profit', 'trade_date', 'pnl', 'rr_ratio', 'notes', 'strategy_id', 'instrument', 'multiplier', 'platform_source'];

async function fetchFreshTrades(userId, jid, renderImmediate, scope) {
  var allTradesData = [];

  try {
    // Analizler, içgörüler, PDF raporu ve CSV defterin trade_scope ayarına göre (varsayılan 'live': backtest girmez).
    // Sayfalama ve deftersiz eski işlemlere geri dönüş fetchAll içinde.
    var tScope = activeTradeScope(jid);
    syncScopeBadge(tScope);
    var res = await window.WwTrades.fetchAll({
      userId: userId,
      journalId: jid,
      columns: PRO_TRADE_COLS.join(','),
      scope: tScope,
      ascending: false,
      unassignedFallback: true
    });

    if (res.error) {
      if (renderImmediate) {
        if (typeof showToast === 'function') showToast(_t('common.load_error', 'Yükleme hatası: ') + res.error.message, 'error');
        revealWithoutData(scope);
      }
      return;
    }
    allTradesData = res.data;

    // ⚡ Sonucu önbelleğe kaydet
    if (typeof window !== 'undefined' && window.wwCache) {
      // Yalnızca kendi anahtarına yaz (ortak 'trades' anahtarı cache.js çapraz beslemesiyle yönetilir)
      window.wwCache.set(window.WwTrades.cacheKey('trades_pro', tScope), userId, jid, allTradesData);
      // Prop betiği işlemleri ayrıca çekmesin diye haber verilir
      window.dispatchEvent(new CustomEvent('ww:pro-trades'));
    }

    // Bu arada başka sayfaya geçildiyse yeni sayfanın DOM'una yazma
    if (scope && !scope.alive) return;

    if (renderImmediate) {
      allTrades = allTradesData;
      currentFilteredTrades = filterTradesByDate(allTrades, currentRange, customRangeStart, customRangeEnd);
      renderDashboardDOM();
    } else {
      // SWR Revalidation: Veri değiştiyse UI güncelle
      if (tradesSignature(allTrades) !== tradesSignature(allTradesData)) {
        allTrades = allTradesData;
        currentFilteredTrades = filterTradesByDate(allTrades, currentRange, customRangeStart, customRangeEnd);
        renderHeaderStats();
        scheduleCharts();
        loadStrategySection(currentFilteredTrades, currentUser);
      }
    }
  } catch(e) {
    console.error('[Analiz] fetchFreshTrades hatası:', e);
    if (renderImmediate) revealWithoutData(scope);
  }
}

// Veri alınamadığında (hata, defter yok) iskelette kalmak yerine boş pano gösterilir
function revealWithoutData(scope) {
  if (scope && !scope.alive) return;
  if (isDataReady) return;
  allTrades = allTrades || [];
  currentFilteredTrades = filterTradesByDate(allTrades, currentRange, customRangeStart, customRangeEnd);
  renderDashboardDOM();
}

// LOAD PRO DATA
async function loadProData(scope) {
  wwLog.log('[Analiz] loadProData başlatıldı...');

  // Hızlı auth hazır kontrolü (1 saniye uyumak yerine 20ms aralıklarla kontrol)
  var authTries = 0;
  while (typeof requireAuth === 'undefined' && authTries < 75) {
    await new Promise(function(resolve) { setTimeout(resolve, 20); });
    authTries++;
  }

  if (typeof requireAuth === 'undefined') {
    console.error('[Analiz] requireAuth hala yüklenmedi!');
    var main = document.getElementById('main-content');
    if (main) {
      main.classList.remove('is-loading');
      main.innerHTML = '\n          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;text-align:center;gap:1rem;padding:2rem;">\n            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>\n            <h2 style="font-family:var(--font-display);font-size:1.5rem;color:var(--text);" data-i18n="analytics_dash.load_error_title">' + _t('analytics_dash.load_error_title', 'Yükleme Hatası') + '</h2>\n            <p style="color:var(--muted);max-width:400px;font-size:14px;font-family:var(--font);" data-i18n="analytics_dash.load_error_desc">' + _t('analytics_dash.load_error_desc', 'Gerekli modüller yüklenemedi. Lütfen sayfayı yenileyin.') + '</p>\n            <button onclick="location.reload()" class="btn btn-primary" style="padding:0.7rem 2rem;cursor:pointer;" data-i18n="analytics_dash.reload">' + _t('analytics_dash.reload', 'Sayfayı Yenile') + '</button>\n          </div>\n        ';
    }
    return;
  }

  try {
    var user = await requireAuth();
    if (!user || !scope.alive) return;
    currentUser = user;

    // Aktif defter kimliği — önce localStorage veya journal state'ten hemen al
    var jid = (window.journal && typeof window.journal.getActiveJournalId === 'function')
      ? window.journal.getActiveJournalId()
      : (localStorage.getItem('ww_active_journal_id') || localStorage.getItem('activeJournalId'));

    if (!jid && window.journal && typeof window.journal.ensureActiveJournal === 'function') {
      try {
        jid = await window.journal.ensureActiveJournal(user.id);
      } catch (e) {
        wwLog.warn('[Analiz] ensureActiveJournal hatası:', e);
      }
    } else if (window.journal && typeof window.journal.ensureActiveJournal === 'function') {
      // jid zaten biliniyorsa arka planda doğrula, UI'ı bekletme
      window.journal.ensureActiveJournal(user.id).catch(function() {});
    }

    if (!scope.alive) return;

    // Plan kontrolü — requireAuth profili zaten önbelleğe aldığı için getUserPlan genelde ağa çıkmadan döner.
    // Eskiden önbellekteki 'premium' değerine güvenilip arka planda doğrulanıyor, uyuşmazlıkta location.reload()
    // yapılıyordu; önbellek düzelmediği için (ör. süresi dolmuş Pro) sayfa durmadan yenileniyordu.
    var planData = await getUserPlan();
    if (!scope.alive) return;
    if (!planData || planData.plan !== 'premium') {
      if (typeof window.openUpgradeModal === 'function') {
        window.openUpgradeModal({ feature: 'analytics_dashboard' });
      }
      var main = document.getElementById('main-content');
      main.classList.remove('is-loading');
      main.innerHTML = '\n        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;text-align:center;gap:1.5rem;padding:2rem;">\n          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 13L2 9l4-6z"/><path d="M12 22V9"/><path d="M2 9h20"/><path d="M6 3l6 6 6-6"/></svg>\n          <h2 style="font-family:var(--font-display);font-size:1.5rem;color:var(--text);" data-i18n="analytics_dash.pro_only_title">' + _t('analytics_dash.pro_only_title', 'Pro\'ya Özel') + '</h2>\n          <p style="color:var(--muted);max-width:400px;font-size:14px;font-family:var(--font);" data-i18n="analytics_dash.pro_only_desc">' + _t('analytics_dash.pro_only_desc', 'Bu sayfa sadece Pro üyelere özeldir.') + '</p>\n          <button onclick="if(window.openUpgradeModal)window.openUpgradeModal({feature:\'analytics_dashboard\'});else location.href=\'settings.html#panel-plan\';" class="btn btn-primary" style="padding:0.7rem 2rem;cursor:pointer;font-family:var(--font);" data-i18n="nav.upgrade_pro">' + _t('nav.upgrade_pro', 'Pro\'ya Geç →') + '</button>\n          <a href="dashboard.html" style="color:var(--muted);font-size:13px;text-decoration:none;font-family:var(--font);" data-i18n="analytics_dash.back_standard">' + _t('analytics_dash.back_standard', '← Standart Dashboard\'a Dön') + '</a>\n        </div>\n      ';
      return;
    }
    // Buraya yalnızca pro hesap ulaşır (?plan=free ise ücretsiz plan önizlemesi açılır)
    applyAccountPlan('premium');

    // Bloklamayan yardımcı fonksiyonlar (arka planda çalışsın)
    if (typeof window.updateOvertradeBell === 'function') {
      window.updateOvertradeBell().catch(function() {});
    }
    if (typeof updateNavbarAvatar === 'function') {
      updateNavbarAvatar().catch(function() {});
    }
    if (typeof isAdmin === 'function' && isAdmin(user)) {
      var adminLink = document.getElementById('admin-link');
      var adminLinkMobile = document.getElementById('admin-link-mobile');
      if (adminLink) adminLink.style.display = 'inline';
      if (adminLinkMobile) adminLinkMobile.style.display = 'block';
    }

    if (!jid) {
      if (typeof wwLog !== 'undefined') wwLog.warn('[Analiz] Aktif journal yok, veri yüklenmiyor');
      revealWithoutData(scope);
      return;
    }

    // ⚡ SWR Önbellek Kontrolü: trades_pro, trades veya trades_dashboard varsa 0ms beklemeden hemen göster
    try { await window.WwTrades.resolveJournalScope(jid); } catch (e) {}
    var tScope = activeTradeScope(jid);
    syncScopeBadge(tScope);
    var cachedTrades = (typeof window !== 'undefined' && window.wwCache)
      ? (tScope === 'live'
          ? (window.wwCache.get('trades_pro', user.id, jid, PRO_TRADE_COLS) ||
             window.wwCache.get('trades', user.id, jid, PRO_TRADE_COLS) ||
             window.wwCache.get('trades_dashboard', user.id, jid, PRO_TRADE_COLS))
          // kapsamlı listeler çapraz beslenmez: yalnızca kendi '@kapsam' anahtarları (cache.js sözleşmesi)
          : window.wwCache.get(window.WwTrades.cacheKey('trades_pro', tScope), user.id, jid, PRO_TRADE_COLS))
      : null;
    if (cachedTrades) cachedTrades = window.WwTrades.filterScope(cachedTrades, tScope);   // savunma katmanı

    if (cachedTrades && cachedTrades.length > 0) {
      allTrades = cachedTrades;
      currentFilteredTrades = filterTradesByDate(allTrades, currentRange, customRangeStart, customRangeEnd);
      renderDashboardDOM();
      // Arka planda sessizce taze verileri çek (SWR revalidation)
      fetchFreshTrades(user.id, jid, false, scope);
      return;
    }

    // Önbellek yoksa skeleton'u göster ve veriyi çek
    showSkeletons();
    await fetchFreshTrades(user.id, jid, true, scope);

  } catch(e) {
    console.error('[Analiz] Hata:', e);
    if (typeof showToast === 'function') showToast(_t('analytics_dash.loading_error', 'Analiz yüklenirken hata oluştu'), 'error');
    if (document.querySelector('#main-content.is-loading')) revealWithoutData(scope);
  }
}

// MOUNT — sayfaya her girişte (ilk yükleme ve SPA ile her geri dönüş).
// Navbar SPA'da kalıcı: ona ve document'a bağlanan dinleyiciler scope.on ile eklenir,
// sayfadan çıkınca kaldırılır.
function mount(scope) {
  wwLog.log('[Analiz] DOM yüklendi, Analiz başlatılıyor...');

  PAGE = scope;
  applyAccountPlan(sessionStorage.getItem('ww_user_plan'));
  currentUser = null;
  allTrades = [];
  currentFilteredTrades = [];
  currentRange = 'all';
  customRangeStart = null;
  customRangeEnd = null;
  isPageVisible = true;
  isDashboardDomRendered = false;
  isDataReady = false;
  lastLightTheme = document.body.classList.contains('light-theme');
  resetChartAnimations();

  themeObserver.observe(document.body, { attributes: true });
  scope.on(window, 'resize', onWindowResize);
  scope.on(document, 'visibilitychange', onVisibilityChange);
  scope.on(window, 'ww:prop-state', onPropState);
  scope.on(window, 'trade-saved', onTradesChanged);
  scope.on(window, 'trade-deleted', onTradesChanged);
  scope.onLeave(function() {
    if (tradeRefreshTimer) { clearTimeout(tradeRefreshTimer); tradeRefreshTimer = null; }
  });
  scope.on(document, 'journal-changed', function() {
    if (window.__wj_journal_transitioning) return;
    window.location.reload();
  });
  scope.onLeave(function() {
    themeObserver.disconnect();
    if (resizeTimer) { clearTimeout(resizeTimer); resizeTimer = null; }
    if (chartRafId) { cancelAnimationFrame(chartRafId); chartRafId = null; }
    clearAllApexCharts();
    clearLightweightChart();
    destroyDragDrop();
    closeExportDialog();
  });

  // Navbar (avatar, zil, hamburger menü, çıkış) navbar.js tarafından yönetilir. Eskiden burada da
  // aynı butonlara dinleyici ekleniyordu: tek tıklama menüyü iki kez açıp kapattığı için
  // pro dashboard'da navbar açılır menüleri çalışmıyordu.

  // FAB Toggle
  var fabToggle = document.getElementById('fab-toggle');
  var fabActions = document.getElementById('fab-actions');
  if (fabToggle && fabActions) {
    fabToggle.addEventListener('click', function() {
      fabActions.classList.toggle('open');
    });
    scope.on(document, 'click', function(e) {
      if (!e.target.closest('#fab-toggle') && !e.target.closest('#fab-actions')) {
        fabActions.classList.remove('open');
      }
    });
  }

  // Düzeni hemen kur (yükleniyor durumunda), veriyi yükle
  buildDashboardShell();
  showSkeletons();
  loadProData(scope);
}

var mountedScope = null;
function mountIfOnPage() {
  if (!document.querySelector('main.pro-main')) return;
  var scope = window.wwPage.current();
  if (!scope.alive || scope === mountedScope) return;
  mountedScope = scope;
  mount(scope);
}

// İlk yükleme: DOM hazırsa hemen, değilse DOMContentLoaded'da başlat.
// (Eskiden yalnızca 'complete' kontrol ediliyordu; modül DOMContentLoaded'dan sonra ama sayfa
// tamamen yüklenmeden çalışırsa — 'interactive' — hiç başlamıyordu.)
if (document.readyState !== 'loading') {
  mountIfOnPage();
} else {
  document.addEventListener('DOMContentLoaded', mountIfOnPage);
}
// SPA ile sayfaya tekrar girildiğinde (modül ikinci kez çalışmaz)
document.addEventListener('ww:page-load', mountIfOnPage);

// GLOBAL EXPORT (window üzerinden)
window.markOvertradeAsRead = markOvertradeAsRead;
window.openMenu = openMenu;
window.closeMenu = closeMenu;
window.exportCSV = function() { exportCSV(currentFilteredTrades); };
window.exportPDF = function() { openPdfDialog(); };

