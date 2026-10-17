// ============================================================
// dashboard-manager.js - Widgets, drag-drop, skeleton, strategy, export
// ⭐ FIX: buildWidgets() height alanları kaldırıldı
// ⭐ FIX: renderWidgets() inline height kaldırıldı
// ⭐ FIX: Kullanılmayan currentUser ve allTrades kaldırıldı
// ⭐ FIX: strategy-empty-note zenginleştirildi
// ⭐ FIX: Yükleniyor durumu gerçek düzen üzerinde (#main-content.is-loading), ayrı iskelet HTML yok
// ⭐ FIX: Skeleton boyutları gerçek widget boyutlarıyla uyumlu
// ⭐ FIX: forceResizeAllCharts() - LWC v4 resize düzeltildi
// ⭐ FIX: forceResizeAllCharts() - Apex resize'da var shadowing giderildi
// ⭐ FIX (YENİ): buildWidgets() sırası optimize edildi - grid-auto-flow:dense
//        KALDIRILDI (SortableJS ile çakışıyordu). Bunun yerine default sıra
//        ile boş sütunlar minimuma indirildi.
// ⭐ i18n: resetLayout, loadStrategySection, exportCSV, exportPDF,
//         markOvertradeAsRead içindeki hardcoded metinler i18n'e taşındı.
// ============================================================

// ⭐ Logger — global wwLog'a fallback ile bağlan
const wwLog = (typeof window !== 'undefined' && window.wwLog) 
  ? window.wwLog 
  : { log: () => {}, warn: () => {}, info: () => {}, debug: () => {}, error: console.error.bind(console) };

import {
  sanitizeHTML,
  sanitizeURL,
  calcTradePnL,
  formatCurrency,
  formatCurrencyPDF,
  bellEmptyStateHtml
} from './helpers.js';

import {
  renderCharts,
  getCharts,
  updateChartTheme,
  clearAllApexCharts,
  clearLightweightChart
} from './chart-renderers.js';

import {
  loadPrefs,
  saveOrder,
  getWidgetPrefs,
  widgetOpt,
  isPro,
  FREE_ANALYSIS_QUOTA
} from './widget-prefs.js';

import { isPropActive } from './prop-widgets.js';

// ⭐ i18n Safe Helper
function _t(key, fallback) {
  try {
    if (typeof window !== 'undefined' && window.i18n && typeof window.i18n.t === 'function') {
      var val = window.i18n.t(key);
      if (val && val !== key) return val;
    }
  } catch (e) {}
  return fallback !== undefined ? fallback : key;
}

// ⭐ GLOBAL DEĞİŞKENLER
var sortableInstance = null;
var isDragging = false;
var resizeTimeout = null;
var isResizing = false;
var allStrategies = [];
var chartRafId = null;

// ⭐ OVERTRADE
var OVERTRADE_READ_KEY = 'ww_overtrade_read_signature';
var currentOvertradeSignature = '';

// ⭐ YÜKLENİYOR DURUMU
// Sayfa düzeni (başlık, KPI'lar, kart kutuları) veri gelmeden kurulur; #main-content.is-loading
// iken değerler ve grafik alanları sakin bir parıltıyla bekler. Veri gelince sınıf kalkar, düzen kaymaz.
export function showSkeletons() {
  var main = document.getElementById('main-content');
  if (main) main.classList.add('is-loading');
}

export function hideSkeletons() {
  var main = document.getElementById('main-content');
  if (main) main.classList.remove('is-loading');
  setTimeout(forceResizeAllCharts, 200);
}

// ⭐ LAYOUT — tercihler widget-prefs.js'de (sıra + boyut + gizli + grafik ayarları)
export function saveLayoutOrder() {
  var items = document.querySelectorAll('#dashboard-grid .grid-item');
  var order = [];
  items.forEach(function(el) { order.push(el.dataset.widget); });
  saveOrder(order);
}

export function loadLayoutOrder() {
  return loadPrefs().order;
}

// Kayıtlı sıraya göre tüm widget anahtarları (yeni eklenen widget'lar sona)
export function getOrderedWidgetKeys(widgets) {
  var widgetKeys = Object.keys(widgets);
  var savedOrder = loadLayoutOrder();
  if (!savedOrder || !savedOrder.length) return widgetKeys;
  var ordered = savedOrder.filter(function(k) { return widgetKeys.indexOf(k) !== -1; });
  var missing = widgetKeys.filter(function(k) { return ordered.indexOf(k) === -1; });
  // Kayıtlı düzende henüz olmayan prop kartları en üste, diğer yeni kartlar sona eklenir
  var top = missing.filter(function(k) { return widgets[k].pinTop; });
  var rest = missing.filter(function(k) { return !widgets[k].pinTop; });
  return top.concat(ordered, rest);
}

// Kullanıcı tercihi (hidden true/false) yoksa kartın varsayılanı geçerli.
// Ücretsiz planda analiz kartlarının varsayılanı freeDefault'tur (3 kart açık başlar).
function isBaseHidden(key, w) {
  // Prop kartları yalnızca prop defteri açıkken var
  if (w && w.propOnly && !isPropActive()) return true;
  var hidden = getWidgetPrefs(key).hidden;
  if (typeof hidden === 'boolean') return hidden;
  if (!isPro() && w && w.tier === 'analysis') return !w.freeDefault;
  return !!(w && w.defaultHidden);
}

// Ücretsiz planda sıradaki ilk FREE_ANALYSIS_QUOTA analiz kartı görünür; fazlası (ör. Pro'dan düşünce) gizlenir
export function getVisibleWidgetKeys(widgets) {
  var keys = getOrderedWidgetKeys(widgets).filter(function(k) { return !isBaseHidden(k, widgets[k]); });
  if (isPro()) return keys;
  var analysisCount = 0;
  return keys.filter(function(k) {
    if (widgets[k].tier !== 'analysis') return true;
    analysisCount++;
    return analysisCount <= FREE_ANALYSIS_QUOTA;
  });
}

export function isAnalysisWidget(w) {
  return !!(w && w.tier === 'analysis');
}

// Boyut: sm=1/4, md=2/4, lg=3/4, full=4/4 sütun · Yükseklik: normal | tall (2 satır)
export var WIDGET_SIZES = ['sm', 'md', 'lg', 'full'];
export var WIDGET_HEIGHTS = ['normal', 'tall'];

export function getWidgetLayout(key, w) {
  var p = getWidgetPrefs(key);
  var size = WIDGET_SIZES.indexOf(p.size) !== -1 ? p.size : w.size;
  var height = WIDGET_HEIGHTS.indexOf(p.height) !== -1 ? p.height : w.height;
  return { size: size || 'sm', height: height || 'normal' };
}

export function widgetLayoutClasses(key, w) {
  var layout = getWidgetLayout(key, w);
  return 'size-' + layout.size + (layout.height === 'tall' ? ' h-tall' : '');
}

// ⭐ DRAG DROP
export function initDragDrop() {
  var grid = document.getElementById('dashboard-grid');
  if (!grid) return;

  if (sortableInstance) {
    try { sortableInstance.destroy(); } catch(e) {}
    sortableInstance = null;
  }

  if (typeof Sortable !== 'undefined') {
    sortableInstance = new Sortable(grid, {
      animation: 300,
      handle: '.drag-handle',
      ghostClass: 'sortable-ghost',
      onStart: function() { isDragging = true; },
      onEnd: function() {
        isDragging = false;
        setTimeout(forceResizeAllCharts, 300);
        saveLayoutOrder();
      }
    });
  }
}

// SPA: sayfadan çıkarken sürükle-bırak örneğini kaldır (document'a eklediği dinleyiciler dahil)
export function destroyDragDrop() {
  if (sortableInstance) {
    try { sortableInstance.destroy(); } catch(e) {}
    sortableInstance = null;
  }
  isDragging = false;
}

// ⭐ FORCE RESIZE
export function forceResizeAllCharts() {
  if (isResizing) return;
  isResizing = true;

  if (resizeTimeout) {
    cancelAnimationFrame(resizeTimeout);
    resizeTimeout = null;
  }

  resizeTimeout = setTimeout(function() {
    var charts = getCharts();

    // ⭐ APEXCHARTS RESIZE
    Object.keys(charts.apex).forEach(function(key) {
      var instance = charts.apex[key];
      if (instance && typeof instance.resize === 'function') {
        // ⭐ FIX: var ismi shadowing'i önlemek için apexEl olarak değiştirildi
        var apexEl = instance.container || instance.el;
        if (apexEl && apexEl.isConnected) {
          var rect = apexEl.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            instance.resize(rect.width, rect.height);
          }
        }
      }
    });

    // ⭐ LIGHTWEIGHT CHARTS RESIZE (Kümülatif K/Z)
    if (charts.lightweight.cumulative) {
      var lwc = charts.lightweight.cumulative;
      if (lwc.chart && typeof lwc.chart.applyOptions === 'function') {
        // ⭐ FIX: LWC v4'te chart.container public API'de yok → DOM'dan alıyoruz
        var lwcContainer = document.getElementById('chart-cumulative');
        if (lwcContainer) {
          var lwcRect = lwcContainer.getBoundingClientRect();
          if (lwcRect.width > 0 && lwcRect.height > 0) {
            try {
              lwc.chart.applyOptions({ width: lwcRect.width, height: lwcRect.height });
            } catch(e) {}
          }
        }
      }
    }

    isResizing = false;
    resizeTimeout = null;
  }, 200);
}

// ⭐ HEADER İSTATİSTİKLERİ — ortak modülden (interface/shared/trade-metrics.js — testli)
function computeHeaderStats(trades) {
  var m = window.WwMetrics.summarize(trades || []);
  return {
    total: m.total,
    wins: m.wins,
    losses: m.losses,
    pnl: m.totalPnL,
    avg: m.expectancy,
    wr: m.winRate,
    grossWin: m.grossWin,
    grossLoss: m.grossLoss,
    pf: m.profitFactor, // null => ∞
    sharpe: m.sharpe    // null => hesaplanamaz (tek işlem / sapma yok)
  };
}

// Önceki döneme göre değişim rozeti; tone: 'good' artış iyi, 'neutral' renksiz
function setDelta(id, diff, text, tone) {
  var el = document.getElementById(id);
  if (!el) return;
  if (diff === null || !isFinite(diff)) { el.textContent = ''; el.className = 'pstat-delta'; return; }
  var dir = diff > 0 ? 'up' : (diff < 0 ? 'down' : 'flat');
  el.className = 'pstat-delta ' + dir + (tone === 'neutral' ? ' neutral' : '');
  el.textContent = dir === 'flat' ? '±0' : (dir === 'up' ? '▲ ' : '▼ ') + text;
  el.title = _t('premium_dash.vs_prev', 'Önceki döneme göre');
}

function setText(id, text) {
  var el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ⭐ RENDER PREMIUM STATS — prevTrades verilirse (hafta/ay/yıl filtresi) değişim rozetleri gösterilir
export function renderPremiumStats(trades, prevTrades) {
  try {
    var s = computeHeaderStats(trades);
    var p = prevTrades ? computeHeaderStats(prevTrades) : null;
    var hasPrev = !!(p && p.total);

    setText('pstat-total', s.total);
    setText('pstat-total-sub', _t('premium_dash.sub.wl', '{w} kazanan · {l} kaybeden')
      .replace('{w}', s.wins).replace('{l}', s.losses));

    var elPnl = document.getElementById('pstat-pnl');
    if (elPnl) {
      elPnl.textContent = formatCurrency(s.pnl);
      elPnl.className = 'pstat-value ' + (s.pnl > 0 ? 'positive' : (s.pnl < 0 ? 'negative' : ''));
    }
    setText('pstat-pnl-sub', _t('premium_dash.sub.per_trade', 'İşlem başı {v}').replace('{v}', formatCurrency(s.avg)));

    setText('pstat-wr', s.wr.toFixed(1) + '%');
    var bar = document.getElementById('pstat-wr-bar');
    if (bar) bar.style.width = Math.min(100, s.wr) + '%';

    setText('pstat-pf', window.WwMetrics.formatProfitFactor(s.pf));
    // Brüt kayıp yoksa "+$0,00" yerine nötr "$0,00"
    var zero = formatCurrency(0).replace(/^\+/, '');
    setText('pstat-pf-sub', _t('premium_dash.sub.gross', 'Brüt {w} / {l}')
      .replace('{w}', s.grossWin > 0 ? formatCurrency(s.grossWin) : zero)
      .replace('{l}', s.grossLoss > 0 ? formatCurrency(-s.grossLoss) : zero));

    // Tek işlemde (sapma yok) Sharpe hesaplanamaz: yanıltıcı "0.00" yerine "—"
    setText('pstat-sharpe', s.sharpe === null ? '—' : s.sharpe.toFixed(2));
    setText('pstat-sharpe-sub', _t('premium_dash.sub.sharpe', 'İşlem bazlı'));

    if (hasPrev) {
      var dTotal = s.total - p.total;
      setDelta('pstat-total-delta', dTotal, String(Math.abs(dTotal)), 'neutral');
      setDelta('pstat-pnl-delta', s.pnl - p.pnl, formatCurrency(Math.abs(s.pnl - p.pnl)).replace(/^[+-]/, ''));
      var dWr = s.wr - p.wr;
      setDelta('pstat-wr-delta', Math.round(dWr * 10) / 10, Math.abs(dWr).toFixed(1) + ' ' + _t('premium_dash.pts', 'puan'));
      var pfNow = s.pf === null ? Infinity : s.pf, pfPrev = p.pf === null ? Infinity : p.pf;
      setDelta('pstat-pf-delta', isFinite(pfNow) && isFinite(pfPrev) ? pfNow - pfPrev : null, Math.abs(pfNow - pfPrev).toFixed(2));
      setDelta('pstat-sharpe-delta', s.sharpe !== null && p.sharpe !== null ? s.sharpe - p.sharpe : null,
        Math.abs((s.sharpe || 0) - (p.sharpe || 0)).toFixed(2));
    } else {
      ['pstat-total-delta', 'pstat-pnl-delta', 'pstat-wr-delta', 'pstat-pf-delta', 'pstat-sharpe-delta'].forEach(function(id) {
        setDelta(id, null);
      });
    }
  } catch(e) {}
}

// ⭐ RENDER KPI BAR
function setKpi(id, text, tone) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('positive', tone === 'positive');
  el.classList.toggle('negative', tone === 'negative');
}

export function renderKpiBar(trades) {
  try {
    var m = window.WwMetrics.summarize(trades);

    // Renk değerden gelir: kazanç/kayıp yoksa "—", drawdown yoksa nötr "$0,00" (eskiden kırmızı "+$0,00")
    var zero = formatCurrency(0).replace(/^\+/, '');
    setKpi('kpi-avg-win', m.wins ? formatCurrency(m.avgWin) : '—', m.wins ? 'positive' : '');
    setKpi('kpi-avg-loss', m.losses ? formatCurrency(-m.avgLoss) : '—', m.losses ? 'negative' : '');
    setText('kpi-payoff', window.WwMetrics.formatProfitFactor(m.payoff));
    setKpi('kpi-dd', m.maxDrawdown > 0 ? formatCurrency(-m.maxDrawdown) : zero, m.maxDrawdown > 0 ? 'negative' : '');
    var elRr = document.getElementById('kpi-rr');
    if (elRr) {
      // R:R girilmemişse 0.00 yerine "—" (yanıltıcı sıfır gösterilmez)
      elRr.textContent = m.avgRR === null ? '—' : m.avgRR.toFixed(2);
      elRr.title = m.avgRR === null ? _t('premium_dash.no_rr_hint', 'R:R verisi yok — işlemlere stop loss ekleyin') : '';
    }
  } catch(e) {}
}

// ⭐ KART KATEGORİLERİ — "Kartlar" panelinde bu sırayla gruplanır
export function getWidgetCategories() {
  return [
    { id: 'prop',        label: _t('premium_dash.cat.prop', 'Prop Firm') },
    { id: 'performance', label: _t('premium_dash.cat.performance', 'Performans') },
    { id: 'time',        label: _t('premium_dash.cat.time', 'Zaman Analizi') },
    { id: 'breakdown',   label: _t('premium_dash.cat.breakdown', 'Dağılım') },
    { id: 'risk',        label: _t('premium_dash.cat.risk', 'Risk & Disiplin') },
    { id: 'strategy',    label: _t('premium_dash.cat.strategy', 'Strateji') }
  ];
}

// ⭐ BUILD WIDGETS
// Her kart: başlık, şablon, varsayılan boyut, kategori, panel açıklaması ve simgesi.
// defaultHidden: kart panelden eklenene kadar görünmez.
// tier: 'analysis' — ücretsiz planda kotaya tabi (freeDefault: ücretsiz planda başta açık olan 3 kart).
// Varsayılan yerleşim (4 sütunlu grid, kullanıcı ⚙ menüsünden değiştirebilir):
//   Prop defterinde: prop-summary (tam genişlik, en üst satır); ayrı kural kartları panelden eklenebilir
//   Satır 1: insights (1, tek kartlık vitrin) + cumulative (2) + winloss (1)
//   Satır 2: symbol (1) + daily (2) + direction (1)
//   Satır 3-4: strategies (1, uzun — tablo kutu içinde kayar) + hourly (1) + dow (1) + rr (1) / lot (1)
//   (Uzun strateji kartı ortada: sonda kalınca altında boş hücreler oluşuyordu)
//   goal ve recent ana dashboard'da da var; burada varsayılan gizli, panelden eklenebilir
export function buildWidgets() {
  var dailyRange = widgetOpt('daily', 'range');
  var chartDiv = function(id) { return '<div id="chart-' + id + '" style="width:100%;height:100%;"></div>'; };
  // Ayrı kural kartları panelden eklenebilir; varsayılan görünüm birleşik prop-summary kartı
  var propCard = function(key, titleKey, titleFallback, descKey, descFallback, icon) {
    return {
      title: _t(titleKey, titleFallback),
      template: chartDiv(key),
      propOnly: true,
      pinTop: true,
      defaultHidden: true,
      category: 'prop',
      icon: icon,
      desc: _t(descKey, descFallback),
      i18nKey: titleKey
    };
  };
  return {
    // ⭐ Prop firm — yalnızca prop defteri açıkken, en üst satırda
    'prop-summary': {
      title: _t('premium_dash.widgets.prop_summary', 'Prop Hesap Durumu'),
      template: chartDiv('prop-summary'),
      size: 'full',
      propOnly: true,
      pinTop: true,
      category: 'prop',
      icon: 'propsum',
      desc: _t('premium_dash.desc.prop_summary', 'Hesap, kural durumu ve dört kural tek kartta.'),
      i18nKey: 'premium_dash.widgets.prop_summary'
    },
    'prop-daily': propCard('prop-daily', 'prop.today_margin', 'Bugünün Kalan Marjı',
      'premium_dash.desc.prop_daily', 'Bugün kurallara takılmadan kaybedebileceğin tutar.', 'shield'),
    'prop-maxloss': propCard('prop-maxloss', 'prop.max_loss_floor', 'Maksimum Kayıp Zemini',
      'premium_dash.desc.prop_maxloss', 'Hesabın kapanacağı bakiye seviyesi ve ona uzaklığın.', 'floor'),
    'prop-target': propCard('prop-target', 'prop.target', 'Kâr Hedefi',
      'premium_dash.desc.prop_target', 'Bu fazı geçmek için hedefe ne kadar kaldı.', 'target'),
    'prop-days': propCard('prop-days', 'prop.trading_days_balance', 'İşlem Günü / Bakiye',
      'premium_dash.desc.prop_days', 'Asgari işlem günü şartı ve güncel bakiye.', 'days'),
    'insights': {
      title: _t('premium_dash.widgets.insights', 'İçgörüler'),
      template: chartDiv('insights'),
      size: 'sm',
      category: 'performance',
      icon: 'insight',
      desc: _t('premium_dash.desc.insights', 'Verinden otomatik çıkarılan güçlü ve zayıf yönler.'),
      i18nKey: 'premium_dash.widgets.insights'
    },
    'cumulative': {
      title: _t('premium_dash.widgets.cumulative', 'Kümülatif K/Z'),
      badge: true,
      badgeId: 'cumulative-change',
      badgeDefault: '↑ +0%',
      template: '<div id="chart-cumulative" class="lwc-chart-container"></div>',
      size: 'md',
      category: 'performance',
      icon: 'area',
      desc: _t('premium_dash.desc.cumulative', 'Toplam K/Z\'nin zaman içindeki eğrisi.'),
      i18nKey: 'premium_dash.widgets.cumulative'
    },
    'winloss': {
      title: _t('premium_dash.widgets.winloss', 'Win / Loss Dağılımı'),
      template: chartDiv('winloss'),
      doughnut: true,
      category: 'performance',
      icon: 'donut',
      desc: _t('premium_dash.desc.winloss', 'Kazanan, kaybeden ve başabaş işlem oranı.'),
      i18nKey: 'premium_dash.widgets.winloss'
    },
    'goal': {
      title: _t('premium_dash.widgets.goal', 'Aylık Hedef'),
      template: chartDiv('goal'),
      defaultHidden: true,
      category: 'performance',
      icon: 'goal',
      desc: _t('premium_dash.desc.goal', 'Bu ayki K/Z\'nin belirlediğin hedefe göre ilerlemesi.'),
      i18nKey: 'premium_dash.widgets.goal'
    },
    'symbol': {
      title: _t('premium_dash.widgets.symbol', 'Sembol Bazlı Performans'),
      template: chartDiv('symbol'),
      category: 'breakdown',
      icon: 'hbar',
      desc: _t('premium_dash.desc.symbol', 'Enstrüman bazında K/Z, işlem sayısı ve win rate.'),
      i18nKey: 'premium_dash.widgets.symbol'
    },
    'daily': {
      // Başlık seçilen aralığı gösterir; 30 gün varsayılanında mevcut çeviri anahtarı kullanılır
      title: dailyRange === 30
        ? _t('premium_dash.widgets.daily', 'Günlük K/Z – Son 30 Gün')
        : _t('premium_dash.widgets.daily_range', 'Günlük K/Z – Son {n} Gün').replace('{n}', dailyRange),
      template: chartDiv('daily'),
      size: 'md',
      category: 'time',
      icon: 'bar',
      desc: _t('premium_dash.desc.daily', 'Son 7–90 günün günlük K/Z\'si.'),
      i18nKey: dailyRange === 30 ? 'premium_dash.widgets.daily' : null
    },
    'direction': {
      title: _t('premium_dash.widgets.direction', 'Long / Short Dağılımı'),
      template: chartDiv('direction'),
      doughnut: true,
      category: 'breakdown',
      icon: 'donut',
      desc: _t('premium_dash.desc.direction', 'Long ve Short işlemlerin adet ve performans karşılaştırması.'),
      i18nKey: 'premium_dash.widgets.direction'
    },
    'strategies': {
      tier: 'analysis',
      freeDefault: true,
      title: _t('premium_dash.widgets.strategies', 'Strateji Karşılaştırması'),
      template: '<div id="strategy-section-body"></div>',
      size: 'sm',
      height: 'tall',
      category: 'strategy',
      icon: 'table',
      desc: _t('premium_dash.desc.strategies', 'Stratejilerin win rate, PF ve K/Z karşılaştırması.'),
      i18nKey: 'premium_dash.widgets.strategies'
    },
    'hourly': {
      tier: 'analysis',
      freeDefault: true,
      title: _t('premium_dash.widgets.hourly', 'Saat Bazlı Performans'),
      template: chartDiv('hourly'),
      category: 'time',
      icon: 'bar',
      desc: _t('premium_dash.desc.hourly', 'Günün hangi saatlerinde daha iyi trade ediyorsun?'),
      i18nKey: 'premium_dash.widgets.hourly'
    },
    'dow': {
      tier: 'analysis',
      freeDefault: true,
      title: _t('premium_dash.widgets.dow', 'Haftanın Günü'),
      template: chartDiv('dow'),
      category: 'time',
      icon: 'bar',
      desc: _t('premium_dash.desc.dow', 'Haftanın hangi günleri kârlı?'),
      i18nKey: 'premium_dash.widgets.dow'
    },
    'recent': {
      title: _t('premium_dash.widgets.recent', 'Son İşlemler'),
      template: chartDiv('recent'),
      size: 'md',
      defaultHidden: true,
      category: 'performance',
      icon: 'list',
      desc: _t('premium_dash.desc.recent', 'En son 8 işlemin tarih, yön ve K/Z özeti.'),
      i18nKey: 'premium_dash.widgets.recent'
    },
    'rr': {
      tier: 'analysis',
      title: _t('premium_dash.widgets.rr', 'R:R Dağılımı'),
      template: chartDiv('rr'),
      category: 'breakdown',
      icon: 'bar',
      desc: _t('premium_dash.desc.rr', 'İşlemlerin risk/ödül oranı dağılımı.'),
      i18nKey: 'premium_dash.widgets.rr'
    },
    'lot': {
      tier: 'analysis',
      title: _t('premium_dash.widgets.lot', 'Lot Büyüklüğü'),
      template: chartDiv('lot'),
      category: 'breakdown',
      icon: 'bar',
      desc: _t('premium_dash.desc.lot', 'Pozisyon büyüklüğüne göre sonuçlar.'),
      i18nKey: 'premium_dash.widgets.lot'
    },
    // ⭐ Panelden eklenebilen kartlar (varsayılan gizli)
    'monthly': {
      tier: 'analysis',
      title: _t('premium_dash.widgets.monthly', 'Aylık K/Z'),
      template: chartDiv('monthly'),
      size: 'md',
      defaultHidden: true,
      category: 'performance',
      icon: 'bar',
      desc: _t('premium_dash.desc.monthly', 'Ay ay K/Z, işlem sayısı veya win rate.'),
      i18nKey: 'premium_dash.widgets.monthly'
    },
    'calendar': {
      tier: 'analysis',
      title: _t('premium_dash.widgets.calendar', 'K/Z Takvimi'),
      template: chartDiv('calendar'),
      size: 'md',
      height: 'tall',
      defaultHidden: true,
      category: 'time',
      icon: 'calendar',
      desc: _t('premium_dash.desc.calendar', 'Ayın her günü renkli kutularla: hangi gün kâr, hangi gün zarar.'),
      i18nKey: 'premium_dash.widgets.calendar'
    },
    'drawdown': {
      tier: 'analysis',
      title: _t('premium_dash.widgets.drawdown', 'Drawdown'),
      badge: true,
      badgeId: 'drawdown-max',
      badgeDefault: '—',
      template: chartDiv('drawdown'),
      size: 'md',
      defaultHidden: true,
      category: 'risk',
      icon: 'drawdown',
      desc: _t('premium_dash.desc.drawdown', 'Zirveden düşüşler: en kötü dönem ne kadar derindi?'),
      i18nKey: 'premium_dash.widgets.drawdown'
    },
    'streaks': {
      tier: 'analysis',
      title: _t('premium_dash.widgets.streaks', 'Kazanç / Kayıp Serileri'),
      template: chartDiv('streaks'),
      defaultHidden: true,
      category: 'risk',
      icon: 'streak',
      desc: _t('premium_dash.desc.streaks', 'En uzun seriler, mevcut seri ve son işlemlerin dizilimi.'),
      i18nKey: 'premium_dash.widgets.streaks'
    }
  };
}

var GEAR_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

// ⭐ RENDER WIDGETS - gizli widget'lar atlanır, boyut sınıfları tercihten gelir
export function renderWidgets() {
  var grid = document.getElementById('dashboard-grid');
  if (!grid) return;

  var widgets = buildWidgets();
  var orderedKeys = getVisibleWidgetKeys(widgets);
  var settingsLabel = _t('premium_dash.widget_settings', 'Widget ayarları');

  var html = '';
  orderedKeys.forEach(function(key) {
    var w = widgets[key];
    var badgeHtml = '';
    if (w.badge) {
      badgeHtml = '<span class="chart-badge" id="' + w.badgeId + '">' + w.badgeDefault + '</span>';
    }
    var doughnutClass = w.doughnut ? ' chart-wrap--doughnut' : '';

    html += '\n      <div class="grid-item ' + widgetLayoutClasses(key, w) + '" data-widget="' + key + '">\n        <div class="widget-tools">\n          <button type="button" class="widget-settings-btn" data-widget-settings="' + key + '" title="' + settingsLabel + '" aria-label="' + settingsLabel + '" aria-haspopup="true">' + GEAR_ICON + '</button>\n          <div class="drag-handle">⠿</div>\n        </div>\n        <div class="grid-header">\n          <h3' + (w.i18nKey ? ' data-i18n="' + w.i18nKey + '"' : '') + '>' + w.title + '</h3>\n          ' + badgeHtml + '\n        </div>\n        <div class="chart-wrap' + doughnutClass + '">\n          ' + w.template + '\n        </div>\n      </div>\n    ';
  });

  grid.innerHTML = html;
  if (typeof window !== 'undefined' && window.i18n && window.i18n.apply) {
    window.i18n.apply();
  }
  setTimeout(initDragDrop, 100);
}

// ⭐ STRATEGY SECTION — sıralanabilir strateji karşılaştırma tablosu
// Her satır: renk + isim + işlem sayısı · mini equity eğrisi · win rate · profit factor · ort. K/Z · net K/Z
// Stratejisiz işlemler ayrı satırda; seçili dönemde işlemi olmayan stratejiler tek satırda özetlenir.
var strategySort = { key: 'pnl', dir: -1 };

// sanitizeHTML tırnakları kaçırmaz; öznitelik içine yazılan metinler için
function escapeAttr(str) {
  return sanitizeHTML(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Kullanıcı rengi style özniteliğine yazılır: yalnızca hex / rgb(a) / hsl(a) / renk adı kabul edilir
function safeColor(c) {
  var v = String(c || '').trim();
  return /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%]+\)|[a-z]+)$/i.test(v) ? v : 'var(--accent)';
}

function computeStrategyPerf(closedTrades) {
  var m = window.WwMetrics.summarize(closedTrades);
  var curve = [0].concat(window.WwMetrics.equityCurve(closedTrades).map(function(p) { return p.equity; }));
  return {
    count: m.total,
    winRate: m.winRate,
    pnl: m.totalPnL,
    avg: m.expectancy,
    pf: m.profitFactor, // null => ∞
    curve: curve
  };
}

// Kümülatif K/Z mini eğrisi (inline SVG; sıfır çizgisi kesikli)
function sparklineSvg(curve) {
  if (!curve || curve.length < 2) return '<span class="sc-spark-empty">—</span>';
  var W = 100, H = 28, pad = 2;
  var min = Math.min.apply(null, curve), max = Math.max.apply(null, curve);
  var span = max - min || 1;
  var x = function(i) { return (i / (curve.length - 1)) * W; };
  var y = function(v) { return pad + (1 - (v - min) / span) * (H - pad * 2); };
  var pts = curve.map(function(v, i) { return x(i).toFixed(2) + ',' + y(v).toFixed(2); }).join(' ');
  var last = curve[curve.length - 1];
  var cls = last >= 0 ? 'pos' : 'neg';
  var zero = (min < 0 && max > 0)
    ? '<line x1="0" x2="' + W + '" y1="' + y(0).toFixed(2) + '" y2="' + y(0).toFixed(2) + '" class="sc-spark-zero"/>'
    : '';
  return '<svg class="sc-spark ' + cls + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
    zero +
    '<polygon points="0,' + H + ' ' + pts + ' ' + W + ',' + H + '" class="sc-spark-fill"/>' +
    '<polyline points="' + pts + '" class="sc-spark-line"/>' +
  '</svg>';
}

function strategyRowHtml(row, rank, isUnassigned) {
  var p = row.perf;
  var pnlCls = p.pnl > 0 ? 'pos' : (p.pnl < 0 ? 'neg' : '');
  var avgCls = p.avg > 0 ? 'pos' : (p.avg < 0 ? 'neg' : '');
  var pfVal = p.pf === null ? Infinity : p.pf;
  var pfCls = pfVal >= 1.5 ? 'pos' : (pfVal < 1 ? 'neg' : '');
  var wr = Math.round(p.winRate * 10) / 10;
  var tradesText = p.count + ' ' + _t('dashboard.trades_count_suffix', 'işlem');
  var rankHtml = isUnassigned
    ? '<span class="sc-rank sc-rank--none">–</span>'
    : '<span class="sc-rank' + (rank === 1 ? ' sc-rank--top' : '') + '">' + rank + '</span>';

  return '<div class="sc-row' + (isUnassigned ? ' sc-row--unassigned' : '') + '">' +
    '<div class="sc-cell sc-name-cell">' +
      rankHtml +
      '<span class="sc-dot" style="background:' + row.color + '"></span>' +
      '<span class="sc-name-wrap">' +
        '<span class="sc-name" title="' + row.name + '">' + row.name + '</span>' +
        '<span class="sc-sub">' + tradesText + '</span>' +
      '</span>' +
    '</div>' +
    '<div class="sc-cell sc-spark-cell">' + sparklineSvg(p.curve) + '</div>' +
    '<div class="sc-cell sc-wr-cell">' +
      '<span class="sc-num">' + wr.toFixed(1) + '%</span>' +
      '<span class="sc-wr-bar"><span class="sc-wr-fill" style="width:' + Math.min(100, Math.max(0, wr)) + '%"></span></span>' +
    '</div>' +
    '<div class="sc-cell sc-num sc-pf ' + pfCls + '" data-label="PF">' + window.WwMetrics.formatProfitFactor(p.pf) + '</div>' +
    '<div class="sc-cell sc-num sc-avg ' + avgCls + '">' + formatCurrency(p.avg) + '</div>' +
    '<div class="sc-cell sc-num sc-pnl ' + pnlCls + '">' + formatCurrency(p.pnl) + '</div>' +
  '</div>';
}

function renderStrategyCardsDOM(strategiesList, trades, section) {
  var closed = trades.filter(function(t) { return t.exit_price; });
  var unassignedTrades = closed.filter(function(t) { return !t.strategy_id; });

  if (!strategiesList.length) {
    section.innerHTML = `
      <div class="strategy-empty-note" style="padding:1.5rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:0.5rem;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.5" style="opacity:0.5;">
          <path d="M22 12h-4l-3 9H9l-3-9H2"/>
          <path d="M5 3h14l-2 6H7L5 3z"/>
        </svg>
        <span style="font-size:13px;color:var(--muted);font-family:'DM Sans',sans-serif;">${_t('premium_dash.no_strategies', 'Henüz strateji eklenmemiş.')}</span>
        <a href="strategies.html" style="color:var(--accent2);font-size:12px;text-decoration:none;font-weight:500;border:1px solid var(--border);padding:0.2rem 0.8rem;border-radius:20px;transition:all 0.2s;background:var(--surface);" onmouseover="this.style.borderColor='var(--accent)';this.style.background='rgba(139,92,246,0.05)';" onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--surface)';">${_t('premium_dash.create_strategy', 'Strateji oluştur →')}</a>
      </div>
    `;
    return;
  }

  var active = [], inactive = [];
  strategiesList.forEach(function(s) {
    var perf = computeStrategyPerf(closed.filter(function(t) { return t.strategy_id === s.id; }));
    var row = {
      name: escapeAttr(s.name || _t('premium_dash.strategy_fallback', 'Strateji')),
      color: safeColor(s.color),
      perf: perf
    };
    (perf.count ? active : inactive).push(row);
  });

  var sortKey = strategySort.key, dir = strategySort.dir;
  active.sort(function(a, b) {
    var av = a.perf[sortKey], bv = b.perf[sortKey];
    if (sortKey === 'pf') { av = av === null ? Infinity : av; bv = bv === null ? Infinity : bv; }
    if (av === bv) return b.perf.pnl - a.perf.pnl;
    return av < bv ? -dir : dir;
  });

  var cols = [
    { key: null,      label: _t('premium_dash.strat.col_strategy', 'Strateji'), cls: 'sc-name-cell' },
    { key: null,      label: _t('premium_dash.strat.col_trend', 'Eğri'), cls: 'sc-spark-cell' },
    { key: 'winRate', label: _t('premium_dash.win_rate_label', 'Win Rate'), cls: 'sc-wr-cell' },
    { key: 'pf',      label: 'PF', cls: 'sc-pf', title: _t('dashboard.kpi.profit_factor', 'Profit Factor') },
    { key: 'avg',     label: _t('premium_dash.strat.col_avg', 'Ort. K/Z'), cls: 'sc-avg' },
    { key: 'pnl',     label: _t('premium_dash.strat.col_pnl', 'Net K/Z'), cls: 'sc-pnl' }
  ];
  var headHtml = '<div class="sc-row sc-head">' + cols.map(function(c) {
    if (!c.key) return '<div class="sc-cell ' + c.cls + '">' + c.label + '</div>';
    var isActive = c.key === sortKey;
    var arrow = isActive ? (dir < 0 ? ' ↓' : ' ↑') : '';
    return '<button type="button" class="sc-cell sc-sort ' + c.cls + (isActive ? ' active' : '') + '" data-sort="' + c.key + '"' +
      (c.title ? ' title="' + c.title + '"' : '') + '>' + c.label + arrow + '</button>';
  }).join('') + '</div>';

  var bodyHtml = active.map(function(row, i) { return strategyRowHtml(row, i + 1, false); }).join('');

  if (unassignedTrades.length) {
    bodyHtml += strategyRowHtml({
      name: escapeAttr(_t('premium_dash.strat.unassigned', 'Stratejisiz işlemler')),
      color: 'var(--muted)',
      perf: computeStrategyPerf(unassignedTrades)
    }, 0, true);
  }

  if (!active.length && !unassignedTrades.length) {
    bodyHtml += '<div class="sc-empty-row">' + _t('premium_dash.strat.no_trades_period', 'Seçili dönemde stratejili işlem yok.') + '</div>';
  }

  var footHtml = '';
  if (inactive.length) {
    var names = inactive.map(function(r) { return r.name; }).join(', ');
    footHtml = '<div class="sc-foot" title="' + names + '">' +
      _t('premium_dash.strat.inactive', '{n} stratejide bu dönemde işlem yok').replace('{n}', inactive.length) +
      ': <span class="sc-foot-names">' + names + '</span></div>';
  }

  section.innerHTML = '<div class="strategy-compare" role="table">' + headHtml + bodyHtml + '</div>' + footHtml;

  // Sütun başlığına tıklayınca sırala (aynı sütun → yön değişir)
  section.onclick = function(e) {
    var btn = e.target.closest('[data-sort]');
    if (!btn) return;
    var key = btn.getAttribute('data-sort');
    strategySort = key === strategySort.key ? { key: key, dir: -strategySort.dir } : { key: key, dir: -1 };
    renderStrategyCardsDOM(strategiesList, trades, section);
  };
}

async function fetchFreshStrategies(userId, jid, trades, section) {
  try {
    var { data: strategies, error } = await sb
      .from('strategies')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true });

    if (error) {
      console.error('Strateji çekme hatası:', error);
      if (!allStrategies.length) {
        section.innerHTML = '<div class="strategy-empty-note">' + _t('premium_dash.strategies_load_error', 'Stratejiler yüklenirken hata oluştu.') + '</div>';
      }
      return;
    }

    allStrategies = strategies || [];
    if (typeof window !== 'undefined' && window.wwCache) {
      window.wwCache.set('strategies', userId, jid, allStrategies);
    }
    renderStrategyCardsDOM(allStrategies, trades, section);
  } catch (e) {
    console.error('fetchFreshStrategies hatası:', e);
  }
}

export async function loadStrategySection(trades, user) {
  var section = document.getElementById('strategy-section-body');
  if (!section) return;

  if (!user || !user.id) {
    section.innerHTML = '<div class="strategy-empty-note">' + _t('premium_dash.strategies_not_loaded', 'Stratejiler yüklenemiyor. Lütfen sayfayı yenileyin.') + '</div>';
    return;
  }

  var activeJid = (window.journal && typeof window.journal.getActiveJournalId === 'function')
    ? window.journal.getActiveJournalId()
    : (localStorage.getItem('ww_active_journal_id') || 'all');

  // ⚡ SWR Önbellek Kontrolü: Stratejiler önbellekte varsa 0ms beklemeden hemen çiz
  var cachedStrategies = (typeof window !== 'undefined' && window.wwCache)
    ? (window.wwCache.get('strategies', user.id, activeJid) ||
       window.wwCache.get('strategies', user.id, 'all') ||
       window.wwCache.get('strategies', user.id, null))
    : null;

  if (cachedStrategies && Array.isArray(cachedStrategies) && cachedStrategies.length > 0) {
    allStrategies = cachedStrategies;
    renderStrategyCardsDOM(allStrategies, trades, section);
    // Arka planda sessizce taze veriyi kontrol et (SWR revalidate)
    fetchFreshStrategies(user.id, activeJid, trades, section);
    return;
  }

  await fetchFreshStrategies(user.id, activeJid, trades, section);
}

// ⭐ OVERTRADE BELL - MARK AS READ
export function markOvertradeAsRead() {
  try {
    if (currentOvertradeSignature) {
      localStorage.setItem(OVERTRADE_READ_KEY, currentOvertradeSignature);
    }
  } catch (e) {}
  var body = document.getElementById('bell-panel-body');
  if (body) body.innerHTML = bellEmptyStateHtml();
  var bellPanel = document.getElementById('bell-panel');
  if (bellPanel) bellPanel.classList.remove('open');
  if (typeof showToast === 'function') showToast(_t('premium_dash.notification_read_toast', 'Bildirim okundu olarak işaretlendi'));
}

// ⭐ NAVBAR AVATAR
export async function updateNavbarAvatar() {
  var el = document.getElementById('user-avatar');
  if (!el) return;
  try {
    var { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    var { data: profile } = await sb.from('user_profiles').select('avatar_url').eq('id', user.id).single();
    if (profile && profile.avatar_url) {
      var safeUrl = sanitizeURL(profile.avatar_url);
      if (safeUrl) {
        el.innerHTML = '<img src="' + safeUrl + '" alt="avatar">';
        el.style.background = 'transparent';
        el.style.border = '2px solid rgba(255,255,255,0.1)';
      } else {
        var initial = user.user_metadata && user.user_metadata.username ? user.user_metadata.username.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();
        el.textContent = initial;
        el.style.background = 'var(--accent)';
        el.style.border = 'none';
      }
    } else {
      var initial2 = user.user_metadata && user.user_metadata.username ? user.user_metadata.username.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();
      el.textContent = initial2;
      el.style.background = 'var(--accent)';
      el.style.border = 'none';
    }
  } catch(e) {}
}

// ⭐ EXPORT CSV
export function exportCSV(trades) {
  try {
    if (!trades || !trades.length) {
      if (typeof showToast === 'function') showToast(_t('toast.no_trades_export', 'Dışa aktarılacak işlem bulunamadı.'), 'error');
      return;
    }
    var headers = [
      _t('csv.symbol', 'Sembol'), _t('csv.direction', 'Yön'), _t('csv.instrument', 'Enstrüman'),
      _t('csv.lot', 'Lot'), _t('csv.entry', 'Giriş'), _t('csv.exit', 'Çıkış'),
      _t('csv.sl', 'Zarar Kes'), _t('csv.tp', 'Kâr Al'), _t('csv.pnl', 'K/Z'),
      _t('csv.rr', 'R:R'), _t('csv.date', 'Tarih'), _t('csv.notes', 'Notlar')
    ];
    var rows = trades.map(function(t) {
      var pnl = calcTradePnL(t);
      return [
        sanitizeHTML(t.symbol || ''),
        sanitizeHTML(t.direction || ''),
        sanitizeHTML(t.instrument || ''),
        t.lot || '',
        t.entry_price || '',
        t.exit_price || '',
        t.stop_loss || '',
        t.take_profit || '',
        t.exit_price ? pnl.toFixed(2) : '',
        t.rr_ratio || '',
        t.trade_date || '',
        (t.notes || '').replace(/,/g,';').replace(/\n/g,' ')
      ].join(',');
    });
    var csv = [headers.join(','), rows.join('\n')].join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    var jName = (document.querySelector('.nav-journal-switcher .journal-name') || {}).textContent || 'premium';
    a.download = 'wawe-journal-' + jName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + new Date().toISOString().split('T')[0] + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    if (typeof showToast === 'function') showToast(_t('toast.csv_exported', 'CSV indirildi!'), 'success');
  } catch(e) {
    if (typeof showToast === 'function') showToast(_t('toast.csv_export_error', 'CSV oluşturulurken hata oluştu.'), 'error');
  }
}

// ⭐ EXPORT PDF
export async function exportPDF(trades) {
  try {
    if (!trades || !trades.length) {
      if (typeof showToast === 'function') showToast(_t('toast.no_trades_export', 'Dışa aktarılacak işlem bulunamadı.'), 'error');
      return;
    }
    if (typeof window.jspdf === 'undefined') {
      if (typeof window.loadJsPDF === 'function') {
        await window.loadJsPDF(true);
      }
    }
    if (typeof window.jspdf === 'undefined') {
      if (typeof showToast === 'function') showToast(_t('toast.pdf_lib_error', 'PDF kütüphanesi yüklenemedi.'), 'error');
      return;
    }
    var { jsPDF } = window.jspdf;
    var doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    var W = doc.internal.pageSize.getWidth();
    var H = doc.internal.pageSize.getHeight();

    doc.setFillColor(10, 10, 15);
    doc.rect(0, 0, W, H, 'F');
    doc.setFillColor(139, 92, 246);
    doc.rect(0, 0, W, 3, 'F');
    doc.setTextColor(232, 232, 240);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(_t('premium_dash.pdf_title', 'WAWE JOURNAL - PREMIUM RAPOR'), 12, 12);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 107, 128);
    doc.text(_t('premium_dash.pdf_subtitle', 'Premium Dashboard Export'), 12, 18);
    var lang = (typeof window !== 'undefined' && window.i18n && typeof window.i18n.getCurrentLanguage === 'function') ? window.i18n.getCurrentLanguage() : 'tr';
    var locale = lang === 'en' ? 'en-US' : (lang === 'de' ? 'de-DE' : 'tr-TR');
    doc.text(new Date().toLocaleDateString(locale), W - 12, 18, { align: 'right' });

    var closed = trades.filter(function(t){ return t.exit_price; });
    var pnls = closed.map(function(t){ return calcTradePnL(t); });
    var totalPnL = pnls.reduce(function(s, v){ return s + v; }, 0);
    var wins = pnls.filter(function(v){ return v > 0; }).length;
    var total = closed.length;
    var lossCount = pnls.filter(function(v){ return v < 0; }).length; // break-even kayıp sayılmaz
    var wr = total ? ((wins/total)*100).toFixed(1) : '0.0';

    var stats = [
      [_t('dashboard.stats.total_trades', 'Toplam İşlem'), total.toString()],
      [_t('dashboard.stats.total_pnl', 'Toplam K/Z'), formatCurrencyPDF(totalPnL)],
      [_t('dashboard.stats.win_rate', 'Win Rate'), wr + '%'],
      [_t('dashboard.stats.winners', 'Kazanan'), wins.toString()],
      [_t('dashboard.stats.losers', 'Kaybeden'), lossCount.toString()]
    ];

    var yPos = 28;
    var cellW = (W - 24) / 5;
    stats.forEach(function(s, idx) {
      var cx = 12 + idx * cellW;
      doc.setFillColor(17, 17, 24);
      doc.roundedRect(cx, yPos, cellW - 2, 14, 2, 2, 'F');
      doc.setFillColor(30, 30, 46);
      doc.roundedRect(cx, yPos, cellW - 2, 14, 2, 2, 'S');
      doc.setTextColor(107, 107, 128);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.text(s[0], cx + (cellW - 2) / 2, yPos + 5, { align: 'center' });
      doc.setTextColor(232, 232, 240);
      doc.setFontSize(9);
      doc.text(s[1], cx + (cellW - 2) / 2, yPos + 12, { align: 'center' });
    });

    yPos += 22;
    doc.setTextColor(139, 92, 246);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(_t('premium_dash.pdf_details', 'İşlem Detayları'), 12, yPos);
    yPos += 5;

    var colDefs = [
      { label: _t('csv.symbol', 'Sembol'), w: 25 },
      { label: _t('csv.direction', 'Yön'), w: 18 },
      { label: _t('csv.lot', 'Lot'), w: 16 },
      { label: _t('csv.entry', 'Giriş'), w: 26 },
      { label: _t('csv.exit', 'Çıkış'), w: 26 },
      { label: _t('csv.pnl', 'K/Z'), w: 28 },
      { label: _t('csv.date', 'Tarih'), w: 26 }
    ];
    var totalW = colDefs.reduce(function(s, c){ return s + c.w; }, 0);
    var startX = (W - totalW) / 2;

    doc.setFillColor(30, 30, 46);
    doc.rect(startX, yPos, totalW, 6, 'F');
    doc.setTextColor(107, 107, 128);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    var hx = startX + 2;
    colDefs.forEach(function(col) {
      doc.text(col.label, hx, yPos + 4);
      hx += col.w;
    });
    yPos += 6;

    var rowH = 5;
    var maxRows = Math.floor((H - yPos - 15) / rowH);
    var displayTrades = trades.slice(-maxRows).reverse();

    displayTrades.forEach(function(t, idx) {
      var pnl = calcTradePnL(t);
      var isEven = idx % 2 === 0;
      doc.setFillColor(isEven ? 17 : 10, isEven ? 17 : 10, isEven ? 24 : 15);
      doc.rect(startX, yPos, totalW, rowH, 'F');

      var cx2 = startX + 2;
      doc.setTextColor(232, 232, 240);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.text((t.symbol || '—').toUpperCase(), cx2, yPos + 3.5);
      cx2 += colDefs[0].w;
      doc.setTextColor(107, 107, 128);
      doc.setFont('helvetica', 'normal');
      doc.text(t.direction || '—', cx2, yPos + 3.5);
      cx2 += colDefs[1].w;
      doc.text(String(t.lot || '—'), cx2, yPos + 3.5);
      cx2 += colDefs[2].w;
      doc.text(String(t.entry_price || '—'), cx2, yPos + 3.5);
      cx2 += colDefs[3].w;
      if (t.exit_price) {
        doc.text(String(t.exit_price), cx2, yPos + 3.5);
      } else {
        doc.setTextColor(139, 92, 246);
        doc.text(_t('trades.open', 'Açık'), cx2, yPos + 3.5);
        doc.setTextColor(107, 107, 128);
      }
      cx2 += colDefs[4].w;
      if (t.exit_price) {
        doc.setTextColor(pnl >= 0 ? 34 : 239, pnl >= 0 ? 197 : 68, pnl >= 0 ? 94 : 68);
        doc.setFont('helvetica', 'bold');
        doc.text(formatCurrencyPDF(pnl), cx2, yPos + 3.5);
        doc.setTextColor(107, 107, 128);
        doc.setFont('helvetica', 'normal');
      } else {
        doc.text('—', cx2, yPos + 3.5);
      }
      cx2 += colDefs[5].w;
      var dateStr = t.trade_date ? window.WwTime.formatDate(t.trade_date, lang, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
      doc.text(dateStr, cx2, yPos + 3.5);

      yPos += rowH;
    });

    doc.setDrawColor(30, 30, 46);
    doc.setLineWidth(0.3);
    doc.rect(startX, yPos - displayTrades.length * rowH - 6, totalW, displayTrades.length * rowH + 6, 'S');

    var jName = (document.querySelector('.nav-journal-switcher .journal-name') || {}).textContent || 'premium';
    doc.save('wawe-journal-' + jName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + new Date().toISOString().split('T')[0] + '.pdf');
    if (typeof showToast === 'function') showToast(_t('toast.pdf_exported', 'PDF indirildi!'), 'success');
  } catch(e) {
    console.error('PDF hatası:', e);
    if (typeof showToast === 'function') showToast(_t('toast.pdf_export_error', 'PDF oluşturulurken hata oluştu.'), 'error');
  }
}