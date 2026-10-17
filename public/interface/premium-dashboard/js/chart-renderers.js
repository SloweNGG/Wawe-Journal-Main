// ============================================================
// chart-renderers.js - Tüm grafik işlemleri
// ⭐ FIX: Font boyutları mobil/desktop ayrımı
// ⭐ FIX: Outlier mantığı eklendi (5 chart)
// ⭐ FIX: Tooltip'lerde gerçek değer gösterimi
// ⭐ FIX: Tüm text öğelerine CHART_THEME.textColor açıkça set edildi
// ⭐ FIX: Donut merkez label tasarımı iyileştirildi (hiyerarşi)
// ============================================================

import {
  calcTradePnL,
  formatCurrency,
  apexCurrencyFormatter,
  toLwcTime,
  dedupeByTime,
  showEmptyChart,
  getCurrencySymbol
} from './helpers.js';

import { widgetOpt, isPro } from './widget-prefs.js';
import { renderPropWidgets, renderPropWidget, PROP_WIDGET_KEYS, propChartLevels, propState } from './prop-widgets.js';
import { buildInsightList, MIN_INSIGHT_TRADES } from './insights-engine.js';

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

function _getCurrentLang() {
  try {
    if (typeof window !== 'undefined' && window.i18n && typeof window.i18n.getCurrentLanguage === 'function') {
      return window.i18n.getCurrentLanguage();
    }
  } catch (e) {}
  return 'tr';
}

// ⭐ CHART STATE
var charts = {
  lightweight: {},
  apex: {}
};

// ⭐ CHART THEME - mobil/desktop ayrımı
var CHART_THEME = {
  textColor: '#e8e8f0',
  gridColor: 'rgba(255,255,255,0.06)',
  green: '#22c55e',
  red: '#ef4444',
  purple: '#8b5cf6',
  orange: '#f97316',
  gray: '#64748b',
  fontFamily: "'DM Sans', sans-serif",
  fontSizeDesktop: '11px',
  fontSizeMobile: '9px',
  legendSizeDesktop: '12px',
  legendSizeMobile: '10px',
};

export function getChartTheme() {
  return CHART_THEME;
}

export function updateChartTheme() {
  var isLight = document.body.classList.contains('light-theme');
  if (isLight) {
    CHART_THEME.textColor = '#1e293b';
    CHART_THEME.gridColor = 'rgba(0,0,0,0.06)';
  } else {
    CHART_THEME.textColor = '#e8e8f0';
    CHART_THEME.gridColor = 'rgba(255,255,255,0.06)';
  }
  try {
    var accentVal = getComputedStyle(document.body).getPropertyValue('--accent').trim();
    if (accentVal) CHART_THEME.purple = accentVal;
  } catch(e) {}
}

// ⭐ MOBIL KONTROL
function isMobile() {
  return window.innerWidth < 768;
}

// ⭐ FONT SIZE HELPER
function getFontSize() {
  return isMobile() ? CHART_THEME.fontSizeMobile : CHART_THEME.fontSizeDesktop;
}

function getLegendSize() {
  return isMobile() ? CHART_THEME.legendSizeMobile : CHART_THEME.legendSizeDesktop;
}

export function getCharts() {
  return charts;
}

export function clearApexChart(key) {
  if (charts.apex[key]) {
    try { charts.apex[key].destroy(); } catch(e) {}
    delete charts.apex[key];
  }
}

export function clearAllApexCharts() {
  Object.keys(charts.apex).forEach(function(k) {
    try { charts.apex[k].destroy(); } catch(e) {}
    delete charts.apex[k];
  });
}

export function clearLightweightChart() {
  if (charts.lightweight.cumulative) {
    try { charts.lightweight.cumulative.chart.remove(); } catch(e) {}
    delete charts.lightweight.cumulative;
  }
}

// ⭐ DEEP MERGE
function deepMerge(target, source) {
  var result = {};
  for (var key in target) {
    if (target.hasOwnProperty(key)) {
      result[key] = target[key];
    }
  }
  for (var key in source) {
    if (source.hasOwnProperty(key)) {
      if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
        result[key] = deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }
  return result;
}

// Her grafik sayfa açılışında yalnızca bir kez animasyonla çizilir; sonraki güncellemeler
// (filtre, tema, prop durumu, düzen değişikliği) animasyonsuz uygulanır — grafikler "zıplamaz".
var animatedKeys = {};
export function resetChartAnimations() {
  animatedKeys = {};
  lastInsightsSig = null;
  rot.sig = null;
  rot.index = 0;
}

// ⭐ APEXCHARTS HELPER
export function renderOrUpdateApex(key, containerId, options) {
  var container = document.getElementById(containerId);
  if (!container) return;

  var mergedOptions = deepMerge({
    chart: {
      height: '100%',
      foreColor: CHART_THEME.textColor,
      fontFamily: CHART_THEME.fontFamily,
      toolbar: { show: false },
      animations: {
        enabled: true,
        speed: 400,
        easing: 'easeinout',
        animateGradually: { enabled: true, delay: 100 }
      },
      background: 'transparent',
    },
    grid: {
      borderColor: CHART_THEME.gridColor,
      strokeDashArray: 3,
    },
    dataLabels: { enabled: false },
    stroke: { width: 1 },
    legend: {
      onItemClick: { toggleDataSeries: false },
      onItemHover: { highlightDataSeries: true },
    },
    tooltip: {
      theme: document.body.classList.contains('light-theme') ? 'light' : 'dark',
    }
  }, options);

  var firstRender = !animatedKeys[key];
  animatedKeys[key] = true;
  mergedOptions.chart.animations = Object.assign({}, mergedOptions.chart.animations, { enabled: firstRender });

  if (charts.apex[key]) {
    charts.apex[key].updateOptions(mergedOptions, true, false);
  } else {
    var instance = new ApexCharts(container, mergedOptions);
    instance.render();
    charts.apex[key] = instance;
  }
}

// ⭐ OUTLIER HELPER - en büyük değer korunur, diğerleri kırpılır
function capOutliers(data) {
  if (!data || data.length === 0) return data;
  
  var maxVal = Math.max.apply(null, data.map(Math.abs));
  if (maxVal === 0) return data;
  
  var maxPositive = Math.max.apply(null, data);
  var minNegative = Math.min.apply(null, data);
  
  return data.map(function(v) {
    if (v === maxPositive && maxPositive > 0) return v;
    if (v === minNegative && minNegative < 0) return v;
    if (Math.abs(v) > maxVal * 0.85) {
      return (v > 0 ? maxVal * 0.85 : -maxVal * 0.85);
    }
    return v;
  });
}

// ⭐ METRİK YARDIMCILARI - gruplanmış işlemlerin K/Z listesinden seçilen metriği üretir
// pnl: toplam K/Z · avg: ortalama K/Z · count: işlem sayısı · winrate: kazanma oranı (%)
function metricValue(pnls, metric) {
  if (metric === 'count') return pnls.length;
  if (!pnls.length) return metric === 'winrate' ? null : 0;
  var sum = pnls.reduce(function(s, v) { return s + v; }, 0);
  if (metric === 'avg') return sum / pnls.length;
  if (metric === 'winrate') {
    var wins = pnls.filter(function(v) { return v > 0; }).length;
    return Math.round((wins / pnls.length) * 1000) / 10;
  }
  return sum;
}

function isMoneyMetric(metric) {
  return metric === 'pnl' || metric === 'avg';
}

function metricSeriesName(metric) {
  switch (metric) {
    case 'avg': return _t('premium_dash.opt.metric_avg', 'Ort. K/Z');
    case 'count': return _t('premium_dash.trade_count', 'İşlem Sayısı');
    case 'winrate': return _t('premium_dash.opt.metric_winrate', 'Win rate');
    default: return _t('common.pnl', 'K/Z');
  }
}

function formatMetric(metric, v) {
  if (v === null || v === undefined) return '—';
  if (metric === 'count') return v + ' ' + _t('dashboard.trades_count_suffix', 'işlem');
  if (metric === 'winrate') return v.toFixed(1) + '%';
  return formatCurrency(v);
}

function metricAxisFormatter(metric) {
  if (metric === 'count') return function(v) { return v === null || v === undefined ? '' : String(Math.round(v)); };
  if (metric === 'winrate') return function(v) { return v === null || v === undefined ? '' : Math.round(v) + '%'; };
  return apexCurrencyFormatter;
}

// K/Z metriklerinde pozitif yeşil / negatif kırmızı; adet ve win rate'te tek renk
function metricBarColors(metric) {
  if (isMoneyMetric(metric)) {
    return { ranges: [
      { from: -Infinity, to: -0.01, color: CHART_THEME.red },
      { from: 0, to: Infinity, color: CHART_THEME.green },
    ]};
  }
  return { ranges: [] };
}

// Bar grafiği seçeneklerini metriğe göre kurar (dikey ya da yatay)
function metricBarOptions(metric, labels, realData, displayData, opts) {
  var horizontal = !!(opts && opts.horizontal);
  var valueAxis = {
    labels: {
      style: { fontSize: getFontSize(), colors: CHART_THEME.textColor },
      formatter: metricAxisFormatter(metric),
    }
  };
  var categoryAxis = {
    labels: {
      style: { fontSize: getFontSize(), colors: CHART_THEME.textColor },
      rotate: 0,
    }
  };
  if (metric === 'winrate') { valueAxis.min = 0; valueAxis.max = 100; }

  var options = {
    chart: { type: 'bar' },
    series: [{ name: metricSeriesName(metric), data: displayData }],
    colors: [CHART_THEME.purple],
    plotOptions: {
      bar: {
        horizontal: horizontal,
        borderRadius: 4,
        columnWidth: isMobile() ? '50%' : '65%',
        barHeight: isMobile() ? '50%' : '60%',
        colors: metricBarColors(metric),
      }
    },
    tooltip: {
      y: {
        formatter: function(value, ctx) {
          var real = realData[ctx.dataPointIndex];
          return formatMetric(metric, real === undefined ? value : real);
        }
      }
    }
  };

  if (horizontal) {
    // Yatay barda değer ekseni xaxis'tir; uzun para etiketleri üst üste binmesin diye az tick
    options.xaxis = Object.assign({ categories: labels, tickAmount: 4 }, valueAxis);
    options.yaxis = { labels: { style: categoryAxis.labels.style, formatter: function(v) { return String(v || ''); } } };
  } else {
    options.xaxis = Object.assign({ categories: labels }, categoryAxis);
    if (opts && opts.tickAmount) options.xaxis.tickAmount = opts.tickAmount;
    options.yaxis = valueAxis;
  }
  if (opts && opts.tooltipX) options.tooltip.x = { formatter: opts.tooltipX };
  return options;
}

// ⭐ DAĞILIM GRAFİĞİ - halka / pasta / bar (Win/Loss ve Long/Short adet görünümü ortak kullanır)
function renderDistribution(key, containerId, cfg) {
  var type = cfg.type;
  var countSuffix = ' ' + _t('dashboard.trades_count_suffix', 'işlem');

  if (type === 'bar') {
    renderOrUpdateApex(key, containerId, {
      chart: { type: 'bar' },
      series: [{ name: _t('premium_dash.trade_count', 'İşlem Sayısı'), data: cfg.series }],
      colors: cfg.colors,
      // Yatay barda xaxis değer eksenidir, yaxis kategori etiketleridir
      xaxis: {
        categories: cfg.labels,
        tickAmount: 4,
        labels: {
          style: { fontSize: getFontSize(), colors: CHART_THEME.textColor },
          formatter: function(v) { return String(Math.round(v)); }
        },
      },
      yaxis: {
        labels: { style: { fontSize: getFontSize(), colors: CHART_THEME.textColor } }
      },
      plotOptions: {
        bar: { horizontal: true, distributed: true, borderRadius: 4, barHeight: '55%' }
      },
      legend: { show: false },
      dataLabels: {
        enabled: true,
        style: { fontSize: getLegendSize(), fontFamily: CHART_THEME.fontFamily, fontWeight: 700 },
        formatter: function(val) {
          var total = cfg.series.reduce(function(s, v) { return s + v; }, 0);
          return val + ' (' + (total ? Math.round((val / total) * 100) : 0) + '%)';
        }
      },
      tooltip: { y: { formatter: function(val) { return val + countSuffix; } } }
    });
    return;
  }

  var pieOptions = { expandOnClick: false };
  if (type === 'donut') {
    pieOptions.donut = {
      size: '72%',
      labels: {
        show: true,
        name: {
          fontSize: '10px',
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 600,
          color: CHART_THEME.gray,
          offsetY: -5
        },
        value: {
          fontSize: '18px',
          fontFamily: "'Inter', sans-serif",
          fontWeight: 800,
          color: CHART_THEME.textColor,
          offsetY: 8,
          formatter: function(val) { return val; }
        },
        total: {
          show: true,
          label: cfg.centerLabel,
          fontSize: '10px',
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 600,
          color: CHART_THEME.gray,
          formatter: cfg.centerValue
        }
      }
    };
  }

  renderOrUpdateApex(key, containerId, {
    chart: { type: type === 'pie' ? 'pie' : 'donut' },
    series: cfg.series,
    labels: cfg.labels,
    colors: cfg.colors,
    plotOptions: { pie: pieOptions },
    dataLabels: { enabled: type === 'pie' },
    legend: {
      position: 'bottom',
      fontSize: getLegendSize(),
      fontFamily: "'DM Sans', sans-serif",
      labels: { colors: CHART_THEME.textColor },
      itemMargin: { horizontal: 8, vertical: 4 },
      formatter: function(seriesName, opts) {
        var value = opts.w.globals.series[opts.seriesIndex];
        return seriesName + ' ' + value;
      }
    },
    stroke: { width: 0 },
    tooltip: {
      y: { formatter: function(val) { return val + countSuffix; } }
    }
  });
}

// ⭐ 1. WIN/LOSS CHART (Halka / Pasta / Bar)
export function renderWinLossChart(trades) {
  var containerId = 'chart-winloss';
  var container = document.getElementById(containerId);
  if (!container) return;

  // Break-even (pnl == 0) artık kayıp sayılmaz; ayrı nötr dilim olarak gösterilir.
  // Win rate paydası tüm kapanmış işlemlerdir (diğer sayfalarla aynı tanım).
  var wins = 0, losses = 0, breakeven = 0;
  trades.forEach(function(t) {
    if (!t.exit_price) return;
    var p = calcTradePnL(t);
    if (p > 0) wins++;
    else if (p < 0) losses++;
    else breakeven++;
  });

  var total = wins + losses + breakeven;
  if (total === 0) {
    showEmptyChart(containerId, 'empty.no_closed');
    clearApexChart('winloss');
    return;
  }

  var wlSeries = [wins, losses];
  var wlLabels = [_t('dashboard.stats.winners', 'Kazanan'), _t('dashboard.stats.losers', 'Kaybeden')];
  var wlColors = [CHART_THEME.green, CHART_THEME.red];
  if (breakeven > 0) {
    wlSeries.push(breakeven);
    wlLabels.push(_t('dashboard.stats.breakeven', 'Break-even'));
    wlColors.push(CHART_THEME.gray);
  }

  renderDistribution('winloss', containerId, {
    type: widgetOpt('winloss', 'type'),
    series: wlSeries,
    labels: wlLabels,
    colors: wlColors,
    centerLabel: _t('dashboard.stats.win_rate', 'Win Rate'),
    centerValue: function() { return Math.round((wins / total) * 100) + '%'; }
  });
}

// ⭐ 2. DIRECTION CHART (Adet dağılımı ya da Long vs Short performans karşılaştırması)
export function renderDirectionChart(trades) {
  var containerId = 'chart-direction';
  var container = document.getElementById(containerId);
  if (!container) return;

  var metric = widgetOpt('direction', 'metric');
  var labels = [_t('direction.long', 'Long'), _t('direction.short', 'Short')];
  var colors = [CHART_THEME.purple, CHART_THEME.orange];

  if (metric === 'count') {
    var longs = 0, shorts = 0;
    trades.forEach(function(t) {
      if (t.direction === 'LONG' || t.direction === 'BUY') longs++;
      else shorts++;
    });

    var total = longs + shorts;
    if (total === 0) {
      showEmptyChart(containerId, 'empty.no_trades');
      clearApexChart('direction');
      return;
    }

    renderDistribution('direction', containerId, {
      type: widgetOpt('direction', 'type'),
      series: [longs, shorts],
      labels: labels,
      colors: colors,
      centerLabel: _t('common.total', 'Toplam'),
      centerValue: function() { return total; }
    });
    return;
  }

  // K/Z, ortalama ve win rate: kapanmış işlemler üzerinden Long vs Short karşılaştırması
  var groups = [[], []];
  trades.forEach(function(t) {
    if (!t.exit_price) return;
    var isLong = t.direction === 'LONG' || t.direction === 'BUY';
    groups[isLong ? 0 : 1].push(calcTradePnL(t));
  });

  if (!groups[0].length && !groups[1].length) {
    showEmptyChart(containerId, 'empty.no_closed');
    clearApexChart('direction');
    return;
  }

  var data = groups.map(function(g) { return metricValue(g, metric); });
  var options = metricBarOptions(metric, labels, data, data, { horizontal: true });
  // Para metriklerinde renk işaretten gelir; win rate'te yön renkleri kullanılır
  if (!isMoneyMetric(metric)) {
    options.colors = colors;
    options.plotOptions.bar.distributed = true;
    options.legend = { show: false };
  }
  options.dataLabels = {
    enabled: true,
    style: { fontSize: getLegendSize(), fontFamily: CHART_THEME.fontFamily, fontWeight: 700 },
    formatter: function(val, ctx) { return formatMetric(metric, data[ctx.dataPointIndex]); }
  };
  renderOrUpdateApex('direction', containerId, options);
}

// ⭐ 3. DAILY CHART (Outlier korumalı, aralık ve grafik tipi ayarlanabilir)
export function renderDailyChart(trades) {
  var containerId = 'chart-daily';
  var container = document.getElementById(containerId);
  if (!container) return;

  var range = widgetOpt('daily', 'range');
  var type = widgetOpt('daily', 'type');

  // Pencere bugünün anahtarından (kullanıcının saat dilimi) kurulur; kronolojik sıralı.
  // Pencere dışındaki işlemler çubuk üretmez (eskiden sona eklenip sırayı bozuyordu, UTC günü kullanılıyordu).
  var days = {};
  var windowToday = window.WwTime.todayKey();
  for (var i = range - 1; i >= 0; i--) {
    days[window.WwTime.addDays(windowToday, -i)] = 0;
  }

  var hasData = false;
  trades.forEach(function(t) {
    if (!window.WwMetrics.isClosed(t)) return;
    var dStr = window.WwMetrics.dateKey(t);
    if (dStr && days[dStr] !== undefined) {
      days[dStr] += calcTradePnL(t);
      hasData = true;
    }
  });

  if (!hasData) {
    showEmptyChart(containerId, 'empty.no_recent');
    clearApexChart('daily');
    return;
  }

  var dailyLabels = Object.keys(days).map(function(d) {
    var parts = d.split('-');
    return parseInt(parts[2], 10) + '/' + parseInt(parts[1], 10);
  });
  var dailyData = Object.values(days);

  var tooltip = {
    y: {
      formatter: function(value, { dataPointIndex }) {
        var realValue = dailyData[dataPointIndex];
        return formatCurrency(realValue === undefined ? value : realValue);
      }
    }
  };
  var xaxis = {
    categories: dailyLabels,
    labels: { style: { fontSize: getFontSize(), colors: CHART_THEME.textColor }, rotate: 0, hideOverlappingLabels: true },
    tickAmount: isMobile() ? 6 : 10,
  };
  var yaxis = {
    labels: {
      style: { fontSize: getFontSize(), colors: CHART_THEME.textColor },
      formatter: apexCurrencyFormatter,
    }
  };

  if (type === 'line' || type === 'area') {
    // Çizgi/alan görünümünde gerçek değerler çizilir (kırpma barlara özgü).
    // Kategori ekseni + tickAmount çizgi grafiklerde noktaları kaydırdığı için tarih ekseni kullanılır.
    var dayKeys = Object.keys(days);
    var points = dayKeys.map(function(d, idx) {
      var p = d.split('-');
      return { x: Date.UTC(+p[0], +p[1] - 1, +p[2]), y: dailyData[idx] };
    });
    renderOrUpdateApex('daily', containerId, {
      chart: { type: type },
      series: [{ name: _t('dashboard.chart.daily', 'Günlük K/Z'), data: points }],
      colors: [CHART_THEME.purple],
      stroke: { width: 2, curve: 'smooth' },
      fill: type === 'area'
        ? { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.02, stops: [0, 100] } }
        : { opacity: 1 },
      markers: { size: 0, hover: { size: 4 } },
      annotations: { yaxis: [{ y: 0, borderColor: CHART_THEME.gray, strokeDashArray: 3 }] },
      xaxis: {
        type: 'datetime',
        labels: {
          datetimeUTC: true,
          format: 'd/M',
          style: { fontSize: getFontSize(), colors: CHART_THEME.textColor },
        },
      },
      yaxis: yaxis,
      tooltip: {
        x: { format: 'dd/MM/yyyy' },
        y: { formatter: function(value) { return formatCurrency(value); } }
      }
    });
    return;
  }

  // ⭐ Outlier koruması - en büyük değer korunur
  var cappedData = capOutliers(dailyData);

  renderOrUpdateApex('daily', containerId, {
    chart: { type: 'bar' },
    series: [{ name: _t('dashboard.chart.daily', 'Günlük K/Z'), data: cappedData }],
    xaxis: xaxis,
    yaxis: yaxis,
    plotOptions: {
      bar: {
        borderRadius: 4,
        columnWidth: isMobile() ? '50%' : '70%',
        colors: metricBarColors('pnl')
      }
    },
    tooltip: tooltip
  });
}

// ⭐ 4. SYMBOL CHART (metrik seçilebilir)
export function renderSymbolChart(trades) {
  var containerId = 'chart-symbol';
  var container = document.getElementById(containerId);
  if (!container) return;

  var metric = widgetOpt('symbol', 'metric');
  var symbolMap = {};
  trades.forEach(function(t) {
    if (t.exit_price) {
      var sym = (t.symbol || 'OTHER').trim().toUpperCase();
      (symbolMap[sym] = symbolMap[sym] || []).push(calcTradePnL(t));
    }
  });

  var rows = Object.keys(symbolMap).map(function(sym) {
    return { sym: sym, value: metricValue(symbolMap[sym], metric) };
  });
  // K/Z metriklerinde büyüklüğe (|değer|), diğerlerinde değere göre sıralanır
  rows.sort(function(a, b) {
    return isMoneyMetric(metric) ? Math.abs(b.value) - Math.abs(a.value) : (b.value || 0) - (a.value || 0);
  });
  rows = rows.slice(0, 8);

  if (rows.length === 0) {
    showEmptyChart(containerId, 'empty.no_trades');
    clearApexChart('symbol');
    return;
  }

  var labels = rows.map(function(r) { return r.sym; });
  var data = rows.map(function(r) { return isMoneyMetric(metric) ? parseFloat(r.value.toFixed(2)) : r.value; });

  renderOrUpdateApex('symbol', containerId, metricBarOptions(metric, labels, data, data, { horizontal: true }));
}

// ⭐ 5. HOURLY CHART (Outlier korumalı, metrik ve saat aralığı seçilebilir)
export function renderHourlyChart(trades) {
  var containerId = 'chart-hourly';
  var container = document.getElementById(containerId);
  if (!container) return;

  var metric = widgetOpt('hourly', 'metric');
  var BUCKET_SIZE = widgetOpt('hourly', 'bucket');
  var bucketCount = Math.ceil(24 / BUCKET_SIZE);
  var buckets = [];
  for (var b = 0; b < bucketCount; b++) buckets.push([]);
  var hasData = false;

  trades.forEach(function(t) {
    if (t.exit_price) {
      // Saat, Ayarlar'daki saat dilimine göre. Saati bilinmeyen (sadece-tarih) işlemler bu grafiğe girmez
      // (eskiden hepsi cihaz saat farkı kadar sahte bir saat dilimine yığılıyordu).
      var hour = window.WwTime.hourOf(t.trade_date);
      if (hour === null) return;
      buckets[Math.floor(hour / BUCKET_SIZE)].push(calcTradePnL(t));
      hasData = true;
    }
  });

  if (!hasData) {
    // İşlem var ama saatleri bilinmiyorsa (sadece-tarih girilmiş) 'henüz işlem yok' demek yanıltıcı olur
    showEmptyChart(containerId, 'empty.not_enough');
    clearApexChart('hourly');
    return;
  }

  var labels = [];
  for (var i = 0; i < bucketCount; i++) {
    var startH = i * BUCKET_SIZE;
    var endH = Math.min(24, startH + BUCKET_SIZE);
    labels.push(BUCKET_SIZE === 1
      ? String(startH).padStart(2, '0')
      : String(startH).padStart(2, '0') + '-' + String(endH).padStart(2, '0'));
  }

  var data = buckets.map(function(g) { return metricValue(g, metric); });
  // ⭐ Outlier koruması - en büyük değer korunur (sadece K/Z metriklerinde)
  var display = isMoneyMetric(metric) ? capOutliers(data) : data;

  renderOrUpdateApex('hourly', containerId, metricBarOptions(metric, labels, data, display, {
    tickAmount: BUCKET_SIZE === 1 ? (isMobile() ? 6 : 12) : undefined,
    tooltipX: function(val, opts) { return _t('premium_dash.hour_prefix', 'Saat ') + labels[opts.dataPointIndex]; }
  }));
}

// ⭐ 6. DAY OF WEEK CHART (Outlier korumalı, metrik seçilebilir)
export function renderDowChart(trades) {
  var containerId = 'chart-dow';
  var container = document.getElementById(containerId);
  if (!container) return;

  var metric = widgetOpt('dow', 'metric');
  var dayNames = [
    _t('days.sun', 'Paz'),
    _t('days.mon', 'Pzt'),
    _t('days.tue', 'Sal'),
    _t('days.wed', 'Çar'),
    _t('days.thu', 'Per'),
    _t('days.fri', 'Cum'),
    _t('days.sat', 'Cmt')
  ];
  var groups = [[], [], [], [], [], [], []];

  var hasData = false;
  trades.forEach(function(t) {
    if (t.exit_price) {
      // Haftanın günü işlem gününden (saat dilimi + gün başlangıcı) hesaplanır; sadece-tarih değerler kaymaz
      var dow = window.WwTime.dowOf(t.trade_date);
      if (dow === null) return;
      groups[dow].push(calcTradePnL(t));
      hasData = true;
    }
  });

  if (!hasData) {
    showEmptyChart(containerId, 'empty.no_trades');
    clearApexChart('dow');
    return;
  }

  var data = groups.map(function(g) { return metricValue(g, metric); });
  // ⭐ Outlier koruması - en büyük değer korunur (sadece K/Z metriklerinde)
  var display = isMoneyMetric(metric) ? capOutliers(data) : data;

  renderOrUpdateApex('dow', containerId, metricBarOptions(metric, dayNames, data, display));
}

// ⭐ 7. RR CHART
export function renderRRChart(trades) {
  var containerId = 'chart-rr';
  var container = document.getElementById(containerId);
  if (!container) return;

  var rrData = {};
  trades.forEach(function(t) {
    if (t.exit_price && t.rr_ratio) {
      var key = parseFloat(t.rr_ratio).toFixed(1);
      rrData[key] = (rrData[key] || 0) + 1;
    }
  });

  var keys = Object.keys(rrData).sort(function(a, b) { return parseFloat(a) - parseFloat(b); });
  if (keys.length === 0) {
    showEmptyChart(containerId, 'empty.no_rr');
    clearApexChart('rr');
    return;
  }

  var labels = keys;
  var data = keys.map(function(k) { return rrData[k]; });

  renderOrUpdateApex('rr', containerId, {
    chart: { type: 'bar' },
    series: [{ name: _t('premium_dash.trade_count', 'İşlem Sayısı'), data: data }],
    colors: [CHART_THEME.purple],
    xaxis: {
      categories: labels,
      labels: {
        style: { 
          fontSize: getFontSize(), 
          colors: CHART_THEME.textColor 
        },
      }
    },
    yaxis: {
      labels: {
        style: { 
          fontSize: getFontSize(), 
          colors: CHART_THEME.textColor 
        },
      }
    },
    plotOptions: {
      bar: {
        borderRadius: 4,
        columnWidth: isMobile() ? '50%' : '70%',
      }
    },
    tooltip: {
      y: { formatter: function(val) { return val + ' ' + _t('dashboard.trades_count_suffix', 'işlem'); } }
    }
  });
}

// ⭐ 8. LOT CHART (Outlier korumalı, metrik seçilebilir)
export function renderLotChart(trades) {
  var containerId = 'chart-lot';
  var container = document.getElementById(containerId);
  if (!container) return;

  var metric = widgetOpt('lot', 'metric');
  var lotMap = {};
  trades.forEach(function(t) {
    if (t.exit_price) {
      var key = parseFloat(t.lot || 0).toFixed(2);
      (lotMap[key] = lotMap[key] || []).push(calcTradePnL(t));
    }
  });

  var lots = Object.keys(lotMap).sort(function(a, b) { return parseFloat(a) - parseFloat(b); });

  if (lots.length === 0) {
    showEmptyChart(containerId, 'empty.no_lot');
    clearApexChart('lot');
    return;
  }

  var data = lots.map(function(l) { return metricValue(lotMap[l], metric); });
  // ⭐ Outlier koruması - en büyük değer korunur (sadece K/Z metriklerinde)
  var display = isMoneyMetric(metric) ? capOutliers(data) : data;

  renderOrUpdateApex('lot', containerId, metricBarOptions(metric, lots, data, display, {
    tooltipX: function(val) { return _t('csv.lot', 'Lot') + ' ' + val; }
  }));
}

// ⭐ 9. CUMULATIVE CHART (Lightweight Charts)
export function renderCumulativeChart(trades) {
  var containerId = 'chart-cumulative';
  var container = document.getElementById(containerId);
  if (!container) return;

  if (charts.lightweight.cumulative) {
    try { charts.lightweight.cumulative.chart.remove(); } catch(e) {}
    delete charts.lightweight.cumulative;
  }

  container.innerHTML = '';
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.minHeight = '150px';

  var cum = 0;
  var points = [];
  // Kümülatif eğri KRONOLOJİK (eskiden yeniye) sırayla biriktirilmeli. Taze çekilen liste
  // trade_date DESC geldiği için eskiden eğri ters çıkıyordu (toplamdan başlayıp son işlemde bitiyordu).
  // Yalnızca kapanmış işlemler eğriye girer.
  var chronological = window.WwMetrics.chronological(trades);
  chronological.forEach(function(t) {
    var pnl = calcTradePnL(t);
    cum += pnl;
    var time = toLwcTime(t.trade_date);
    if (time !== null) {
      points.push({ time: time, value: cum });
    }
  });

  if (points.length === 0) {
    showEmptyChart(containerId, 'empty.not_enough');
    return;
  }

  points = dedupeByTime(points);

  if (points.length > 0) {
    var firstTime = points[0].time;
    var baseTime = typeof firstTime === 'number' ? firstTime - 86400 : firstTime;
    points.unshift({ time: baseTime, value: 0 });
  }

  var firstVal = points[0].value;
  var lastVal = points[points.length - 1].value;
  // Baz çizgisi 0'dan başladığı için yüzde anlamsızdı (hep 0%); mutlak değişim gösterilir.
  var changeEl = document.getElementById('cumulative-change');
  if (changeEl) {
    changeEl.textContent = (lastVal >= firstVal ? '↑ ' : '↓ ') + formatCurrency(lastVal - firstVal).replace(/^[+-]/, '');
    changeEl.className = 'chart-badge ' + (lastVal >= firstVal ? '' : 'negative');
  }

  var fontSize = isMobile() ? 8 : 9;

  var chart = LightweightCharts.createChart(container, {
    layout: {
      background: { color: 'transparent' },
      textColor: CHART_THEME.textColor,
      fontSize: fontSize,
      fontFamily: CHART_THEME.fontFamily,
    },
    grid: {
      vertLines: { color: CHART_THEME.gridColor },
      horzLines: { color: CHART_THEME.gridColor },
    },
    rightPriceScale: {
      borderVisible: false,
      scaleMargins: { top: 0.18, bottom: 0.18 },
      alignLabels: true,
      autoScale: true
    },
    timeScale: {
      borderVisible: false,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 0,
      minBarSpacing: 0.001,
      fixLeftEdge: true,
      fixRightEdge: true,
      lockVisibleTimeRangeOnResize: true,
      tickMarkFormatter: function(time) {
        var date = new Date(time * 1000);
        return date.getDate() + '/' + (date.getMonth() + 1);
      },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Magnet,
      vertLine: { labelVisible: true },
      horzLine: { labelVisible: true },
    },
    handleScroll: false,
    handleScale: false,
    width: container.clientWidth || 300,
    height: container.clientHeight || 180,
  });

  var priceFormat = {
    type: 'custom',
    formatter: function(price) {
      return formatCurrency(price);
    },
    minMove: 0.01,
  };
  // Seri tipi kullanıcı tercihine göre: alan (varsayılan), çizgi ya da sıfırın üstü yeşil / altı kırmızı
  var seriesType = widgetOpt('cumulative', 'type');
  var series;
  if (seriesType === 'line') {
    series = chart.addLineSeries({
      color: CHART_THEME.purple,
      lineWidth: 2.5,
      priceFormat: priceFormat,
    });
  } else if (seriesType === 'baseline') {
    series = chart.addBaselineSeries({
      baseValue: { type: 'price', price: 0 },
      topLineColor: CHART_THEME.green,
      topFillColor1: 'rgba(34,197,94,0.28)',
      topFillColor2: 'rgba(34,197,94,0.02)',
      bottomLineColor: CHART_THEME.red,
      bottomFillColor1: 'rgba(239,68,68,0.02)',
      bottomFillColor2: 'rgba(239,68,68,0.28)',
      lineWidth: 2.5,
      priceFormat: priceFormat,
    });
  } else {
    series = chart.addAreaSeries({
      lineColor: CHART_THEME.purple,
      topColor: 'rgba(139,92,246,0.35)',
      bottomColor: 'rgba(139,92,246,0.0)',
      lineWidth: 2.5,
      priceFormat: priceFormat,
    });
  }

  series.setData(points);

  var propLines = propChartLevels(points[points.length - 1].value);
  if (propLines.length) {
    propLines.forEach(function(l) {
      series.createPriceLine({
        price: l.price,
        color: l.color,
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: l.title
      });
    });
    series.applyOptions({
      autoscaleInfoProvider: function(original) {
        var r = original();
        if (!r || !r.priceRange) return r;
        var min = r.priceRange.minValue, max = r.priceRange.maxValue;
        propLines.forEach(function(l) { min = Math.min(min, l.price); max = Math.max(max, l.price); });
        return { priceRange: { minValue: min, maxValue: max }, margins: r.margins };
      }
    });
  }
  
  if (points.length >= 2) {
    chart.timeScale().setVisibleLogicalRange({
      from: 0,
      to: points.length - 1
    });
  } else {
    chart.timeScale().fitContent();
  }

  charts.lightweight.cumulative = {
    chart: chart,
    series: series,
  };

  var tooltip = document.createElement('div');
  tooltip.style.cssText = [
    'position:absolute',
    'display:none',
    'background:var(--surface)',
    'border:1px solid var(--border)',
    'border-radius:8px',
    'padding:6px 12px',
    'font-size:11px',
    'font-family:\'DM Sans\',sans-serif',
    'color:var(--text)',
    'pointer-events:none',
    'z-index:10',
    'box-shadow:0 4px 16px rgba(0,0,0,0.3)',
    'backdrop-filter:blur(8px)',
  ].join(';');
  container.style.position = 'relative';
  container.appendChild(tooltip);

  chart.subscribeCrosshairMove(function(param) {
    if (!param || !param.point || param.point.x < 0 || param.point.y < 0) {
      tooltip.style.display = 'none';
      return;
    }
    var data = param.seriesData.get(series);
    if (!data || !data.time) {
      tooltip.style.display = 'none';
      return;
    }
    var date = new Date(data.time * 1000);
    var lang = _getCurrentLang();
    var locale = lang === 'en' ? 'en-US' : (lang === 'de' ? 'de-DE' : 'tr-TR');
    var dateStr = date.toLocaleDateString(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    var pnlLabel = _t('common.pnl', 'K/Z');
    tooltip.innerHTML = '<div><strong>' + dateStr + '</strong></div><div>' + pnlLabel + ': ' + formatCurrency(data.value) + '</div>';
    tooltip.style.display = 'block';
    var x = param.point.x;
    var y = param.point.y;
    if (x + 160 > container.clientWidth) x = x - 160;
    if (y + 60 > container.clientHeight) y = y - 60;
    tooltip.style.left = Math.max(0, x) + 'px';
    tooltip.style.top = Math.max(0, y - 10) + 'px';
  });
}

// Kapanmış işlemler, eskiden yeniye (ortak modül: saat dilimi farklı tarihleri de doğru sıralar)
function chronologicalClosed(trades) {
  return window.WwMetrics.chronological(trades);
}

function localeOf() {
  var lang = _getCurrentLang();
  return lang === 'en' ? 'en-US' : (lang === 'de' ? 'de-DE' : 'tr-TR');
}

// Takvim hücreleri için kısa para formatı: +$1.2K, -$85
function formatCompactCurrency(v) {
  var sym = getCurrencySymbol();
  var abs = Math.abs(v);
  var body = abs >= 1000 ? (abs / 1000).toFixed(abs >= 10000 ? 0 : 1) + 'K' : String(Math.round(abs));
  return (v > 0 ? '+' : (v < 0 ? '-' : '')) + sym + body;
}

// ⭐ 10. DRAWDOWN (Underwater) - zirveden düşüş, işlem bazında
export function renderDrawdownChart(trades) {
  var containerId = 'chart-drawdown';
  var container = document.getElementById(containerId);
  if (!container) return;

  var maxDD = -window.WwMetrics.maxDrawdown(trades) || 0;
  var points = [];
  window.WwMetrics.equityCurve(trades).forEach(function(p) {
    var time = toLwcTime(p.trade.trade_date);
    if (time !== null) points.push({ x: time * 1000, y: Math.round(p.drawdown * 100) / 100 });
  });

  var badge = document.getElementById('drawdown-max');
  if (!points.length) {
    if (badge) badge.textContent = '—';
    showEmptyChart(containerId, 'empty.not_enough');
    clearApexChart('drawdown');
    return;
  }
  if (badge) {
    badge.textContent = maxDD < 0 ? formatCurrency(maxDD) : formatCurrency(0).replace(/^\+/, '');
    badge.className = 'chart-badge' + (maxDD < 0 ? ' negative' : '');
  }
  points.unshift({ x: points[0].x - 86400000, y: 0 });

  renderOrUpdateApex('drawdown', containerId, {
    chart: { type: 'area' },
    series: [{ name: _t('premium_dash.widgets.drawdown', 'Drawdown'), data: points }],
    colors: [CHART_THEME.red],
    stroke: { width: 2, curve: 'straight' },
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.05, opacityTo: 0.35, stops: [0, 100] } },
    markers: { size: 0, hover: { size: 4 } },
    xaxis: {
      type: 'datetime',
      labels: { datetimeUTC: true, format: 'd/M', style: { fontSize: getFontSize(), colors: CHART_THEME.textColor } },
    },
    yaxis: {
      max: 0,
      labels: { style: { fontSize: getFontSize(), colors: CHART_THEME.textColor }, formatter: apexCurrencyFormatter }
    },
    tooltip: {
      x: { format: 'dd/MM/yyyy HH:mm' },
      y: { formatter: function(v) { return formatCurrency(v); } }
    }
  });
}

// ⭐ 11. AYLIK PERFORMANS (metrik + aralık seçilebilir)
export function renderMonthlyChart(trades) {
  var containerId = 'chart-monthly';
  var container = document.getElementById(containerId);
  if (!container) return;

  var metric = widgetOpt('monthly', 'metric');
  var range = widgetOpt('monthly', 'range');
  var today = window.WwTime.todayKey();
  var months = [];
  for (var i = range - 1; i >= 0; i--) months.push(window.WwTime.addMonths(today, -i).slice(0, 7));
  var groups = {};
  months.forEach(function(m) { groups[m] = []; });

  var hasData = false;
  trades.forEach(function(t) {
    if (!window.WwMetrics.isClosed(t)) return;
    var m = window.WwMetrics.dateKey(t).slice(0, 7);
    if (groups[m]) { groups[m].push(calcTradePnL(t)); hasData = true; }
  });

  if (!hasData) {
    showEmptyChart(containerId, 'empty.no_recent');
    clearApexChart('monthly');
    return;
  }

  var locale = localeOf();
  var labels = months.map(function(m) {
    var p = m.split('-');
    var name = new Date(Date.UTC(+p[0], +p[1] - 1, 1)).toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' });
    return name + " '" + p[0].slice(2);
  });
  var data = months.map(function(m) { return metricValue(groups[m], metric); });

  renderOrUpdateApex('monthly', containerId, metricBarOptions(metric, labels, data, data));
}

// ⭐ 12. KAZANÇ / KAYIP SERİLERİ (HTML)
export function renderStreaksWidget(trades) {
  var containerId = 'chart-streaks';
  var container = document.getElementById(containerId);
  if (!container) return;

  var closed = chronologicalClosed(trades);
  if (!closed.length) {
    showEmptyChart(containerId, 'empty.no_closed');
    return;
  }

  // Seriler ortak modülden (başabaş seriyi bitirir)
  var st = window.WwMetrics.streaks(closed);
  var maxWin = st.maxWin, maxLoss = st.maxLoss, worstRun = st.worstLossRun;
  var currentText = st.current > 0
    ? st.current + ' ' + (st.currentType === 'win' ? _t('premium_dash.streak.win_suffix', 'kazanç') : _t('premium_dash.streak.loss_suffix', 'kayıp'))
    : '—';
  var currentCls = st.currentType === 'win' ? 'pos' : (st.currentType === 'loss' ? 'neg' : '');

  var LAST = 40;
  var recent = closed.slice(-LAST);
  var dots = recent.map(function(t) {
    var p = calcTradePnL(t);
    var cls = p > 0 ? 'win' : (p < 0 ? 'loss' : 'be');
    var when = t.trade_date ? window.WwTime.formatDate(t.trade_date, _getCurrentLang(), { day: '2-digit', month: '2-digit' }) : '';
    return '<span class="stk-dot ' + cls + '" title="' + when + ' · ' + formatCurrency(p) + '"></span>';
  }).join('');

  container.innerHTML =
    '<div class="stk">' +
      '<div class="stk-stats">' +
        '<div class="stk-stat"><span class="stk-val pos">' + maxWin + '</span><span class="stk-label">' + _t('premium_dash.streak.max_win', 'En uzun kazanç serisi') + '</span></div>' +
        '<div class="stk-stat"><span class="stk-val neg">' + maxLoss + '</span><span class="stk-label">' + _t('premium_dash.streak.max_loss', 'En uzun kayıp serisi') + '</span></div>' +
        '<div class="stk-stat"><span class="stk-val ' + currentCls + '">' + currentText + '</span><span class="stk-label">' + _t('premium_dash.streak.current', 'Mevcut seri') + '</span></div>' +
        '<div class="stk-stat"><span class="stk-val' + (worstRun < 0 ? ' neg' : '') + '">' + (worstRun < 0 ? formatCurrency(worstRun) : '—') + '</span><span class="stk-label">' + _t('premium_dash.streak.worst_run', 'En kötü kayıp serisi') + '</span></div>' +
      '</div>' +
      '<div class="stk-recent">' +
        '<span class="stk-label">' + _t('premium_dash.streak.last_n', 'Son {n} işlem').replace('{n}', recent.length) + '</span>' +
        '<div class="stk-dots">' + dots + '</div>' +
      '</div>' +
    '</div>';
}

// ⭐ 13. K/Z TAKVİMİ (HTML, Pazartesi başlangıçlı ay görünümü)
export function renderCalendarWidget(trades) {
  var containerId = 'chart-calendar';
  var container = document.getElementById(containerId);
  if (!container) return;

  var today = window.WwTime.todayKey();
  var base = widgetOpt('calendar', 'month') === 'previous' ? window.WwTime.addMonths(today, -1) : today;
  var y = +base.slice(0, 4), m = +base.slice(5, 7);
  var monthPrefix = base.slice(0, 7);
  var daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  var firstKey = monthPrefix + '-01';
  var offset = (window.WwTime.dowOfKey(firstKey) + 6) % 7; // Pazartesi = 0

  var byDay = {}, total = 0, count = 0;
  trades.forEach(function(t) {
    if (!window.WwMetrics.isClosed(t)) return;
    var k = window.WwMetrics.dateKey(t);
    if (k.slice(0, 7) !== monthPrefix) return;
    var p = calcTradePnL(t);
    byDay[k] = byDay[k] || { pnl: 0, n: 0 };
    byDay[k].pnl += p;
    byDay[k].n++;
    total += p;
    count++;
  });
  var maxAbs = 0;
  Object.keys(byDay).forEach(function(k) { maxAbs = Math.max(maxAbs, Math.abs(byDay[k].pnl)); });

  var dayNames = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(function(d) {
    return '<span class="cal-wd">' + _t('days.' + d, d) + '</span>';
  }).join('');

  var cells = '';
  for (var b = 0; b < offset; b++) cells += '<span class="cal-cell cal-blank"></span>';
  for (var d = 1; d <= daysInMonth; d++) {
    var key = monthPrefix + '-' + String(d).padStart(2, '0');
    var info = byDay[key];
    var cls = 'cal-cell', style = '', val = '', title = '';
    if (info) {
      cls += info.pnl > 0 ? ' pos' : (info.pnl < 0 ? ' neg' : ' be');
      // Yoğunluk: en büyük günün |K/Z|'sine oranla 0.18–0.85 arası
      var alpha = maxAbs ? 0.18 + 0.67 * (Math.abs(info.pnl) / maxAbs) : 0.3;
      style = ' style="--a:' + alpha.toFixed(2) + '"';
      val = '<span class="cal-v">' + formatCompactCurrency(info.pnl) + '</span>';
      title = ' title="' + formatCurrency(info.pnl) + ' · ' + info.n + ' ' + _t('dashboard.trades_count_suffix', 'işlem') + '"';
    }
    if (key === today) cls += ' today';
    cells += '<span class="' + cls + '"' + style + title + '><span class="cal-d">' + d + '</span>' + val + '</span>';
  }

  var monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(localeOf(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
  var totalCls = total > 0 ? 'pos' : (total < 0 ? 'neg' : '');
  container.innerHTML =
    '<div class="cal">' +
      '<div class="cal-top"><span class="cal-month">' + monthName + '</span>' +
        '<span class="cal-total ' + totalCls + '">' + (count ? formatCurrency(total) + ' · ' + count + ' ' + _t('dashboard.trades_count_suffix', 'işlem') : '—') + '</span></div>' +
      '<div class="cal-grid">' + dayNames + cells + '</div>' +
    '</div>';
}

// ⭐ 14. İÇGÖRÜLER — verilerden basit kurallarla çıkarılan cümleler (yapay zekâ yok).
// Her kural yeterli örneklem ister; gürültülü/tek işlemlik sonuçlar üretilmez.
var INSIGHT_ICONS = {
  good: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  warn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
};

function tr(key, fallback, params) {
  var s = _t(key, fallback);
  Object.keys(params || {}).forEach(function(k) { s = s.split('{' + k + '}').join(params[k]); });
  return s;
}

// Hesaplar insights-engine.js'de (testli); burada yalnızca metne çevrilir.
function plainMoney(v) { return formatCurrency(Math.abs(v)).replace(/^[+-]/, ''); }
function pct(v) { return Math.round(v); }
function hourRange(from, to) { return String(from).padStart(2, '0') + ':00–' + String(to % 24).padStart(2, '0') + ':00'; }
function dowName(d) {
  // 1 Ocak 2023 Pazar olduğundan +d gün → tam gün adı (Cuma, Friday…)
  return new Date(Date.UTC(2023, 0, 1 + d)).toLocaleDateString(localeOf(), { weekday: 'long', timeZone: 'UTC' });
}
function sideName(side) { return side === 'long' ? _t('direction.long', 'Long') : _t('direction.short', 'Short'); }

function insightCopy(ins) {
  var d = ins.data || {};
  var nTxt = ins.n + ' ' + _t('dashboard.trades_count_suffix', 'işlem');
  switch (ins.id) {
    case 'best_hour':
      return { text: tr('premium_dash.ins.best_hour', 'En kârlı saat aralığın {h}', { h: hourRange(d.from, d.to) }),
        detail: formatCurrency(ins.value) + ' · ' + nTxt + ' · %' + pct(d.wr) + ' win rate' };
    case 'weak_hour':
      return { text: tr('premium_dash.ins.weak_hour', '{h} arası zarar ettiriyor', { h: hourRange(d.from, d.to) }),
        detail: tr('premium_dash.ins.skip_detail', 'Bu işlemleri atlasaydın K/Z {v} daha iyi olurdu', { v: plainMoney(ins.impact) }) + ' · ' + nTxt };
    case 'weak_dow':
      return { text: tr('premium_dash.ins.weak_dow', '{day} günleri zarar ediyorsun', { day: dowName(d.dow) }),
        detail: tr('premium_dash.ins.skip_detail', 'Bu işlemleri atlasaydın K/Z {v} daha iyi olurdu', { v: plainMoney(ins.impact) }) +
          ' · %' + pct(d.wr) + ' ' + tr('premium_dash.ins.vs_overall_short', '(genel %{wr})', { wr: pct(d.overallWr) }) };
    case 'weak_direction':
      return { text: tr('premium_dash.ins.weak_direction', '{side} işlemlerin zarar ettiriyor', { side: sideName(d.side) }),
        detail: nTxt + ' · ' + formatCurrency(-ins.impact) + ' · ' + sideName(d.side) + ' %' + pct(d.wr) + ', ' +
          sideName(d.side === 'long' ? 'short' : 'long') + ' %' + pct(d.otherWr) };
    case 'best_symbol':
      return { text: tr('premium_dash.ins.best_symbol', 'En iyi enstrümanın {s}', { s: d.symbol }),
        detail: formatCurrency(ins.value) + ' · ' + nTxt + ' · %' + pct(d.wr) + ' win rate' };
    case 'weak_symbol':
      return { text: tr('premium_dash.ins.weak_symbol', '{s} zarar ettiriyor', { s: d.symbol }),
        detail: nTxt + ' · ' + formatCurrency(-ins.impact) + ' · %' + pct(d.wr) + ' win rate' };
    case 'payoff_low':
      return { text: _t('premium_dash.ins.payoff_low', 'Ortalama kaybın ortalama kazancından büyük'),
        detail: tr('premium_dash.ins.payoff_cut', 'Ortalama kazancını ({w}) aşan {n} kaybı o seviyede kesseydin {v} daha iyi olurdu',
          { w: plainMoney(d.avgWin), n: ins.n, v: plainMoney(ins.impact) }) };
    case 'payoff_high':
      return { text: tr('premium_dash.ins.payoff_high', 'Kazançların kayıplarının {x} katı', { x: d.ratio.toFixed(1) }),
        detail: formatCurrency(d.avgWin) + ' / ' + formatCurrency(-d.avgLoss) };
    case 'after_loss':
      return { text: _t('premium_dash.ins.after_loss', 'Kayıptan hemen sonra açtığın işlemler zarar ettiriyor'),
        detail: tr('premium_dash.ins.after_loss_detail', 'Aynı gün kayıp sonrası {n} işlem: {v} · %{wr} win rate', { n: ins.n, v: formatCurrency(-ins.impact), wr: pct(d.wr) }) };
    case 'overtrading':
      return { text: tr('premium_dash.ins.overtrading', 'Günün {k}. işleminden sonrası zarar ettiriyor', { k: d.limit + 1 }),
        detail: tr('premium_dash.ins.overtrading_detail', 'Günde {l} işlemde dursaydın K/Z {v} daha iyi olurdu', { l: d.limit, v: plainMoney(ins.impact) }) + ' · ' + nTxt };
    case 'stop_after_first':
      return { text: _t('premium_dash.ins.stop_after_first', 'Günün ilk işleminden sonra performansın düşüyor'),
        detail: tr('premium_dash.ins.stop_after_first_detail', 'İlk işlemler {a}, sonrakiler {b}', { a: formatCurrency(d.firstSum), b: formatCurrency(d.restSum) }) };
    case 'size_up':
      return { text: _t('premium_dash.ins.size_up', 'Kayıptan sonra lot büyütmek zarar ettiriyor'),
        detail: tr('premium_dash.ins.size_up_detail', 'Kayıp sonrası lotu artırdığın {n} işlem: {v}', { n: ins.n, v: formatCurrency(-ins.impact) }) + ' · %' + pct(d.wr) + ' win rate' };
    case 'no_stop':
      return { text: _t('premium_dash.ins.no_stop', 'Stop loss koymadığın işlemler zarar ettiriyor'),
        detail: tr('premium_dash.ins.no_stop_detail', 'Stop\'suz {n} işlem: {v} · win rate %{wr} (stop\'lu %{wr2})',
          { n: ins.n, v: formatCurrency(-ins.impact), wr: pct(d.wr), wr2: pct(d.withWr) }) };
    case 'no_sl_data':
      return { text: _t('premium_dash.ins.no_sl', 'İşlemlerinde stop loss bilgisi yok'),
        detail: _t('premium_dash.ins.no_sl_detail', 'SL eklersen R:R ve risk analizleri açılır') };
    case 'form_up':
    case 'form_down':
      return { text: tr(ins.id === 'form_up' ? 'premium_dash.ins.form_up' : 'premium_dash.ins.form_down',
          ins.id === 'form_up' ? 'Son 10 işlemde formdasın: win rate %{wr}' : 'Son 10 işlemde form düşüşü: win rate %{wr}', { wr: pct(d.wr) }),
        detail: tr('premium_dash.ins.vs_overall', 'Genel ortalaman %{wr}', { wr: pct(d.overallWr) }) };
    case 'concentration':
      return { text: tr('premium_dash.ins.concentration', 'Kârının büyük kısmı tek bir günden: %{p}', { p: pct(d.share * 100) }),
        detail: window.WwTime.formatDate(d.date, _getCurrentLang(), { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' + formatCurrency(d.sum) };
    case 'best_day':
      return { text: tr('premium_dash.ins.best_day', 'En iyi günün {date}', { date: window.WwTime.formatDate(d.date, _getCurrentLang(), { day: 'numeric', month: 'long' }) }),
        detail: formatCurrency(d.sum) + ' · ' + nTxt };
    case 'expectancy':
      return { text: tr(d.avg >= 0 ? 'premium_dash.ins.expectancy_pos' : 'premium_dash.ins.expectancy_neg',
          d.avg >= 0 ? 'İşlem başına ortalama {v} kazanıyorsun' : 'İşlem başına ortalama {v} kaybediyorsun', { v: plainMoney(d.avg) }),
        detail: tr('premium_dash.ins.based_on', '{n} kapanmış işlem · win rate %{wr}', { n: ins.n, wr: pct(d.wr) }) };
    case 'prop_pace':
      return { text: tr('premium_dash.ins.prop_pace', 'Bu tempoyla hedefe ~{d} işlem günü', { d: d.days }),
        detail: d.byMinDays
          ? tr('premium_dash.ins.prop_pace_min', 'Minimum işlem günü kuralı belirleyici · kalan hedef {r}', { r: plainMoney(d.remaining) })
          : tr('premium_dash.ins.prop_pace_detail', 'İşlem günü başına ortalama {v} · kalan hedef {r}', { v: formatCurrency(d.perDay), r: plainMoney(d.remaining) }) };
    case 'prop_no_progress':
      return { text: _t('premium_dash.ins.prop_no_progress', 'Bu fazda henüz net kâr yok'),
        detail: tr('premium_dash.ins.prop_no_progress_detail', '{n} işlem günü · kalan hedef {r}', { n: d.days, r: plainMoney(d.remaining) }) };
    case 'prop_worst_over_daily':
      return { text: _t('premium_dash.ins.prop_worst_over_daily', 'En kötü günün günlük kayıp limitini aşıyor'),
        detail: tr('premium_dash.ins.prop_worst_over_daily_detail', 'En kötü gün {w} · günlük limit {l}', { w: formatCurrency(d.worst), l: plainMoney(d.limit) }) };
    case 'prop_worst_day':
      return { text: d.left <= 0
          ? _t('premium_dash.ins.prop_worst_breach', 'En kötü günün tekrar etse hesap zemini aşılır')
          : tr('premium_dash.ins.prop_worst_day', 'En kötü günün tekrar etse zemine {v} kalır', { v: plainMoney(d.left) }),
        detail: tr('premium_dash.ins.prop_worst_day_detail', 'En kötü gün {w} · zemine şu an {d}', { w: formatCurrency(d.worst), d: plainMoney(d.distance) }) };
    case 'prop_daily_burn':
      return { text: tr('premium_dash.ins.prop_daily_burn', 'Kayıplı günlerinde günlük limit kullanımın ortalama %{p}', { p: pct(d.pct) }),
        detail: tr('premium_dash.ins.prop_daily_burn_detail', 'Ortalama kayıplı gün {v} · günlük limit {l} · {n} gün',
          { v: formatCurrency(-d.avgLossDay), l: plainMoney(d.limit), n: ins.n }) };
    case 'need_more':
      return { text: tr('premium_dash.ins.need_more', 'Davranış içgörüleri için {k} kapanmış işlem daha gerekiyor', { k: d.more }),
        detail: tr('premium_dash.ins.need_more_detail', 'Şu an {n} kapanmış işlem var', { n: ins.n }) };
    default:
      return null;
  }
}

// Ekranda gösterilecek içgörüler: sıralı, metinli (bilinmeyen kimlikler atlanır)
export function buildInsights(trades) {
  var propTrades = allTradesRef && allTradesRef.length ? allTradesRef : trades;
  return buildInsightList(trades, propTrades, propState()).map(function(ins) {
    var copy = insightCopy(ins);
    return copy ? Object.assign({}, ins, copy) : null;
  }).filter(Boolean);
}

// ⭐ İÇGÖRÜ ANİMASYONU
// Kartlar sırayla belirir, parasal etki rozetleri sıfırdan sayar. Yalnızca içerik değiştiğinde
// (ilk gelişte, filtre/veri değişince) oynar; aynı içerik yeniden çizilince (prop durumu, tema,
// düzen) oynamaz. Hareket azaltma tercihine ve arka plandaki sekmeye saygı gösterir.
var lastInsightsSig = null;

function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}

function setInsightsHtml(container, html, sig) {
  var animate = sig !== lastInsightsSig && !prefersReducedMotion() && !document.hidden;
  lastInsightsSig = sig;
  container.innerHTML = html;
  if (!animate || !container.firstElementChild) return;
  container.firstElementChild.classList.add('ins-animate');
  countUpImpacts(container);
}

// Etki rozeti: 0'dan gerçek tutara yavaşlayarak sayar; genişlik baştan son değere sabitlenir (zıplamaz)
function countUpImpacts(root) {
  root.querySelectorAll('.ins-impact[data-value]').forEach(function(el) {
    var target = parseFloat(el.getAttribute('data-value'));
    if (!(target > 0)) return;
    var finalText = el.textContent;
    var item = el.closest('.ins-item');
    var order = item ? parseInt(item.style.getPropertyValue('--i'), 10) || 0 : 0;
    var delay = 220 + order * 70, duration = 750, start = null;
    el.style.minWidth = el.offsetWidth + 'px';
    el.textContent = formatCurrency(0);
    function step(ts) {
      if (!el.isConnected) return;
      if (start === null) start = ts + delay;
      var t = Math.min(1, Math.max(0, (ts - start) / duration));
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = t >= 1 ? finalText : formatCurrency(target * eased);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}

// ⭐ İÇGÖRÜ VİTRİNİ (Pro) — tek kart gösterilir, sırayla yerine bir sonraki gelir.
// Zamanlayıcı CSS ilerleme çubuğudur: çubuk dolunca (animationend) sıradaki karta geçilir.
// Böylece fareyle üzerine gelince / odaklanınca çubuk durur, kaldığı yerden devam eder.
// Aynı içerik yeniden çizilirse (prop durumu, tema) vitrin baştan kurulmaz, kaldığı yerden sürer.
var ROT_MAX = 6;
var ROT_MS = 6500;   // kart başına süre (CSS --ins-rot-ms buradan verilir)
var rot = { sig: null, index: 0, list: [], itemHtml: null, slideStart: 0 };

function rotIcon(dir) {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
    (dir < 0 ? '<polyline points="15 18 9 12 15 6"/>' : '<polyline points="9 18 15 12 9 6"/>') + '</svg>';
}

function renderInsightRotator(container, list, sig, itemHtml) {
  var existing = container.querySelector('.ins-rot');
  if (existing && sig === rot.sig) return;          // aynı içerik: kaldığı yerden devam
  var changed = sig !== rot.sig;
  rot.sig = sig;
  rot.list = list;
  rot.itemHtml = itemHtml;
  if (changed || rot.index >= list.length) rot.index = 0;
  lastInsightsSig = sig;

  var multi = list.length > 1;
  var dots = list.map(function(_, i) {
    return '<button type="button" class="ins-rot-dot" data-i="' + i + '" aria-label="' + (i + 1) + ' / ' + list.length + '"></button>';
  }).join('');
  container.innerHTML =
    '<div class="ins-rot' + (multi ? ' is-multi' : '') + '" style="--ins-rot-ms:' + ROT_MS + 'ms" tabindex="0" role="region" aria-roledescription="carousel" aria-label="' +
      sanitizeInsight(_t('premium_dash.widgets.insights', 'İçgörüler')) + '">' +
      '<div class="ins-rot-stage" aria-live="off"></div>' +
      (multi
        ? '<div class="ins-rot-foot">' +
            '<button type="button" class="ins-rot-nav" data-dir="-1" aria-label="' + sanitizeInsight(_t('premium_dash.ins.prev', 'Önceki')) + '">' + rotIcon(-1) + '</button>' +
            '<div class="ins-rot-dots">' + dots + '</div>' +
            '<span class="ins-rot-count"></span>' +
            '<button type="button" class="ins-rot-nav" data-dir="1" aria-label="' + sanitizeInsight(_t('premium_dash.ins.next', 'Sonraki')) + '">' + rotIcon(1) + '</button>' +
          '</div>' +
          '<div class="ins-rot-progress"><span></span></div>'
        : '') +
    '</div>';

  var root = container.querySelector('.ins-rot');
  showRotSlide(root, rot.index, changed ? 'enter' : 'none');
  if (!multi) return;

  root.addEventListener('click', function(e) {
    var nav = e.target.closest('.ins-rot-nav');
    var dot = e.target.closest('.ins-rot-dot');
    if (nav) goRotSlide(root, rot.index + Number(nav.getAttribute('data-dir')), Number(nav.getAttribute('data-dir')), true);
    else if (dot) {
      var i = Number(dot.getAttribute('data-i'));
      if (i !== rot.index) goRotSlide(root, i, i > rot.index ? 1 : -1, true);
    }
  });
  root.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); goRotSlide(root, rot.index + 1, 1, true); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); goRotSlide(root, rot.index - 1, -1, true); }
  });
  var bar = root.querySelector('.ins-rot-progress span');
  bar.addEventListener('animationend', function() {
    if (root.isConnected) goRotSlide(root, rot.index + 1, 1);
  });
}

// manual: kullanıcı geçtiyse ekran okuyucu yeni kartı okur (otomatik geçişte okumaz)
function goRotSlide(root, index, dir, manual) {
  var n = rot.list.length;
  if (!n) return;
  var stage = root.querySelector('.ins-rot-stage');
  if (stage) stage.setAttribute('aria-live', manual ? 'polite' : 'off');
  rot.index = ((index % n) + n) % n;
  showRotSlide(root, rot.index, dir < 0 ? 'prev' : 'next');
}

// Kartı göster: eskisi kayarak çıkar, yenisi diğer taraftan girer; ilerleme çubuğu baştan başlar
function showRotSlide(root, index, mode) {
  var stage = root.querySelector('.ins-rot-stage');
  var ins = rot.list[index];
  if (!stage || !ins) return;
  var reduce = prefersReducedMotion();

  var incoming = document.createElement('div');
  incoming.className = 'ins-rot-slide';
  incoming.innerHTML = rot.itemHtml(ins, 0);
  var old = stage.querySelector('.ins-rot-slide:not(.is-leaving)');

  if (mode === 'none' || reduce || !old) {
    stage.innerHTML = '';
    stage.appendChild(incoming);
    if (mode !== 'none' && !reduce) incoming.classList.add('is-entering', 'from-' + (mode === 'prev' ? 'left' : 'right'));
  } else {
    stage.querySelectorAll('.ins-rot-slide.is-leaving').forEach(function(el) { el.remove(); });
    old.classList.add('is-leaving', 'to-' + (mode === 'prev' ? 'right' : 'left'));
    incoming.classList.add('is-entering', 'from-' + (mode === 'prev' ? 'left' : 'right'));
    stage.appendChild(incoming);
    setTimeout(function() { if (old.parentNode) old.remove(); }, 420);
  }
  if (mode !== 'none' && !reduce && !document.hidden) countUpImpacts(incoming);

  root.querySelectorAll('.ins-rot-dot').forEach(function(d, i) {
    d.classList.toggle('active', i === index);
    d.setAttribute('aria-current', i === index ? 'true' : 'false');
  });
  var count = root.querySelector('.ins-rot-count');
  if (count) count.textContent = (index + 1) + ' / ' + rot.list.length;

  // İlerleme çubuğu: yeni kartta baştan başlar. Vitrin aynı içerikle yeniden kurulduysa
  // (ör. prop durumu gelince kart ızgarası yenilenir) kaldığı yerden devam eder.
  var bar = root.querySelector('.ins-rot-progress span');
  if (bar) {
    var now = Date.now();
    var elapsed = mode === 'none' && rot.slideStart ? Math.min(now - rot.slideStart, ROT_MS - 50) : 0;
    if (!elapsed) rot.slideStart = now;
    bar.style.animationDelay = elapsed ? (-elapsed) + 'ms' : '';
    bar.classList.remove('run');
    void bar.offsetWidth;
    bar.classList.add('run');
  }
}

export function renderInsightsWidget(trades) {
  var containerId = 'chart-insights';
  var container = document.getElementById(containerId);
  if (!container) return;

  var insights = buildInsights(trades);
  if (!insights.length) {
    var closedCount = chronologicalClosed(trades).length;
    setInsightsHtml(container, '<div class="ins-empty">' + INSIGHT_ICONS.info + '<span>' +
      tr('premium_dash.ins.empty', 'Seçili dönemde {n} kapanmış işlem var; içgörüler için en az {min} gerekiyor. Daha geniş bir tarih aralığı seçebilirsin.',
        { n: closedCount, min: MIN_INSIGHT_TRADES }) + '</span></div>', 'empty:' + closedCount);
    return;
  }

  var impactTitle = _t('premium_dash.ins.impact_title', 'Bunu yapmasaydın K/Z bu kadar daha iyi olurdu');
  var itemHtml = function(ins, order) {
    var impact = ins.impact > 0
      ? '<span class="ins-impact" data-value="' + ins.impact + '" title="' + sanitizeInsight(impactTitle) + '">' + sanitizeInsight(formatCurrency(ins.impact)) + '</span>'
      : '';
    return '<div class="ins-item ' + ins.tone + '" style="--i:' + (order || 0) + '">' +
      '<span class="ins-ico">' + INSIGHT_ICONS[ins.tone] + '</span>' +
      '<div class="ins-body"><div class="ins-text">' + sanitizeInsight(ins.text) + '</div>' +
      '<div class="ins-detail">' + sanitizeInsight(ins.detail || '') + '</div></div>' +
      impact +
    '</div>';
  };

  // İçerik imzası: aynıysa animasyon tekrar oynamaz
  var sig = (isPro() ? 'pro|' : 'free|') + insights.slice(0, 6).map(function(i) { return i.id + ':' + i.text + ':' + (i.detail || ''); }).join('|');

  if (isPro()) {
    renderInsightRotator(container, insights.slice(0, ROT_MAX), sig, itemHtml);
    return;
  }

  // Ücretsiz plan: haftanın içgörüsü (hafta numarasına göre sabit seçim) + kalanların sayısı.
  // Bilgi notları (ör. "SL yok") yerine önce performansa dair içgörüler seçilir.
  var week = Math.floor(Date.now() / (7 * 86400000));
  var pool = insights.filter(function(i) { return i.tone !== 'info'; });
  if (!pool.length) pool = insights;
  var pick = pool[week % pool.length];
  var rest = Math.min(insights.length, 6) - 1;
  var moreHtml = rest > 0
    ? '<div class="ins-more" style="--i:2">' +
        '<div class="ins-more-title">' + tr('premium_dash.ins.more_title', '+{n} içgörü daha hazır', { n: rest }) + '</div>' +
        '<div class="ins-more-text">' + _t('premium_dash.ins.more_text', 'Pro\'da tüm içgörülerin her gün yeni verinle güncellenir.') + '</div>' +
        '<button type="button" class="ins-more-btn" data-upgrade="insights">' + _t('premium_dash.ins.more_cta', 'Pro\'yu incele') + '</button>' +
      '</div>'
    : '';
  setInsightsHtml(container, '<div class="ins-grid ins-grid--free">' +
    '<div class="ins-week-label">' + _t('premium_dash.ins.week_label', 'Haftanın içgörüsü') + '</div>' +
    itemHtml(pick, 1) + moreHtml + '</div>', sig);
}

// İçgörü metinleri sembol/sayı içerir; yine de HTML'e kaçırılarak yazılır
function sanitizeInsight(str) {
  var d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

// ⭐ Filtrelenmemiş işlemler — aylık hedef seçili tarih filtresinden bağımsız hesaplanır
var allTradesRef = [];
export function setAllTrades(trades) {
  allTradesRef = trades || [];
}

// ⭐ 15. SON İŞLEMLER (eski dashboard'dan taşındı)
export function renderRecentTradesWidget(trades) {
  var containerId = 'chart-recent';
  var container = document.getElementById(containerId);
  if (!container) return;

  var list = trades.slice().sort(function(a, b) {
    var da = String(a.trade_date || ''), db = String(b.trade_date || '');
    return da < db ? 1 : (da > db ? -1 : 0);
  }).slice(0, 8);

  if (!list.length) {
    showEmptyChart(containerId, 'empty.no_trades');
    return;
  }

  var lang = _getCurrentLang();
  var rows = list.map(function(t) {
    var closed = window.WwMetrics.isClosed(t);
    var pnl = closed ? calcTradePnL(t) : 0;
    var isLong = t.direction === 'LONG' || t.direction === 'BUY';
    var when = t.trade_date ? window.WwTime.formatDate(t.trade_date, lang, { day: 'numeric', month: 'short' }) : '—';
    var pnlHtml = closed
      ? '<span class="rt-pnl ' + (pnl > 0 ? 'pos' : (pnl < 0 ? 'neg' : '')) + '">' + formatCurrency(pnl) + '</span>'
      : '<span class="rt-open">' + _t('premium_dash.recent.open', 'Açık') + '</span>';
    return '<a class="rt-row" href="/trades.html">' +
      '<span class="rt-date">' + sanitizeInsight(when) + '</span>' +
      '<span class="rt-sym">' + sanitizeInsight((t.symbol || '—').toUpperCase()) + '</span>' +
      '<span class="rt-dir ' + (isLong ? 'long' : 'short') + '">' + (isLong ? _t('direction.long', 'Long') : _t('direction.short', 'Short')) + '</span>' +
      '<span class="rt-lot">' + (t.lot ? sanitizeInsight(String(t.lot)) : '') + '</span>' +
      pnlHtml +
    '</a>';
  }).join('');

  container.innerHTML = '<div class="rt">' +
    '<div class="rt-list">' + rows + '</div>' +
    '<a class="rt-all" href="/trades.html">' + _t('premium_dash.recent.view_all', 'Tüm işlemler →') + '</a>' +
  '</div>';
}

// ⭐ 16. AYLIK HEDEF (eski dashboard'dan taşındı; aynı localStorage anahtarı → kullanıcının hedefi korunur)
var GOAL_PRESETS = [1000, 2500, 5000, 10000];
var goalEditing = false;

function goalKey() {
  return 'ww_monthly_target_' + (window.journal ? window.journal.getActiveJournalId() : '');
}

function loadGoal() {
  try {
    var v = parseFloat(localStorage.getItem(goalKey()));
    if (v > 0 && isFinite(v)) return v;
  } catch (e) {}
  return 5000;
}

export function renderGoalWidget() {
  var containerId = 'chart-goal';
  var container = document.getElementById(containerId);
  if (!container) return;

  var target = loadGoal();
  var today = window.WwTime.todayKey();
  var monthPrefix = today.slice(0, 7);
  var y = +today.slice(0, 4), m = +today.slice(5, 7), d = +today.slice(8, 10);
  var daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  var daysLeft = daysInMonth - d + 1;

  var monthPnl = 0;
  allTradesRef.forEach(function(t) {
    if (!window.WwMetrics.isClosed(t)) return;
    if (window.WwMetrics.dateKey(t).slice(0, 7) === monthPrefix) monthPnl += calcTradePnL(t);
  });

  var pct = target > 0 ? (monthPnl / target) * 100 : 0;
  var remaining = target - monthPnl;
  var monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(localeOf(), { month: 'long', timeZone: 'UTC' });

  var statusHtml;
  if (remaining <= 0) {
    statusHtml = '<span class="goal-status pos">' + _t('premium_dash.goal.reached', 'Hedef aşıldı: {v}').replace('{v}', formatCurrency(-remaining)) + '</span>';
  } else {
    statusHtml = '<span class="goal-status">' + _t('premium_dash.goal.remaining', 'Hedefe {v} kaldı').replace('{v}', formatCurrency(remaining).replace(/^\+/, '')) + '</span>' +
      '<span class="goal-sub">' + _t('premium_dash.goal.days_left', '{n} gün kaldı').replace('{n}', daysLeft) +
      ' · ' + _t('premium_dash.goal.per_day', 'günde ort. {v}').replace('{v}', formatCurrency(remaining / daysLeft).replace(/^\+/, '')) + '</span>';
  }

  var editHtml = goalEditing
    ? '<form class="goal-form" data-goal-form>' +
        '<label class="goal-form-label" for="goal-input">' + _t('premium_dash.goal.label', 'Aylık hedef') + '</label>' +
        '<input id="goal-input" class="goal-input" type="number" min="1" step="any" inputmode="decimal" value="' + target + '" />' +
        '<div class="goal-presets">' + GOAL_PRESETS.map(function(v) {
          return '<button type="button" class="goal-preset" data-goal-preset="' + v + '">' + formatCompactCurrency(v).replace(/^\+/, '') + '</button>';
        }).join('') + '</div>' +
        '<div class="goal-form-actions">' +
          '<button type="button" class="goal-cancel" data-goal-cancel>' + _t('premium_dash.goal.cancel', 'Vazgeç') + '</button>' +
          '<button type="submit" class="goal-save">' + _t('premium_dash.goal.save', 'Kaydet') + '</button>' +
        '</div>' +
      '</form>'
    : '';

  container.innerHTML = '<div class="goal' + (goalEditing ? ' is-editing' : '') + '">' +
    '<div class="goal-top">' +
      '<span class="goal-month">' + sanitizeInsight(monthName) + '</span>' +
      '<button type="button" class="goal-edit" data-goal-edit>' + _t('premium_dash.goal.edit', 'Düzenle') + '</button>' +
    '</div>' +
    '<div class="goal-amounts">' +
      '<span class="goal-current ' + (monthPnl > 0 ? 'pos' : (monthPnl < 0 ? 'neg' : '')) + '">' + formatCurrency(monthPnl) + '</span>' +
      '<span class="goal-target">/ ' + formatCurrency(target).replace(/^\+/, '') + '</span>' +
    '</div>' +
    '<div class="goal-bar"><span class="' + (monthPnl < 0 ? 'neg' : '') + '" style="width:' + Math.max(0, Math.min(100, pct)).toFixed(1) + '%"></span></div>' +
    '<div class="goal-meta"><span class="goal-pct">%' + Math.round(pct) + '</span>' + statusHtml + '</div>' +
    editHtml +
  '</div>';

  if (goalEditing) {
    var input = container.querySelector('#goal-input');
    if (input) { input.focus(); input.select(); }
  }

  // Olay bağlama: her çizimde yeniden atanır (dinleyici birikmez)
  container.onclick = function(e) {
    if (e.target.closest('[data-goal-edit]')) { goalEditing = !goalEditing; renderGoalWidget(); return; }
    if (e.target.closest('[data-goal-cancel]')) { goalEditing = false; renderGoalWidget(); return; }
    var preset = e.target.closest('[data-goal-preset]');
    if (preset) {
      var inp = container.querySelector('#goal-input');
      if (inp) inp.value = preset.getAttribute('data-goal-preset');
    }
  };
  container.onsubmit = function(e) {
    e.preventDefault();
    var inp = container.querySelector('#goal-input');
    var v = inp ? parseFloat(inp.value) : NaN;
    if (!(v > 0) || !isFinite(v)) {
      if (inp) inp.classList.add('invalid');
      return;
    }
    try { localStorage.setItem(goalKey(), String(v)); } catch (err) {}
    goalEditing = false;
    renderGoalWidget();
    if (typeof showToast === 'function') showToast(_t('dashboard.goal.updated', 'Hedef güncellendi'), 'success');
  };
}

// ⭐ RENDER ALL CHARTS
export function renderCharts(trades) {
  if (!trades || !trades.length) {
    var chartIds = ['chart-cumulative', 'chart-winloss', 'chart-daily', 'chart-symbol',
                    'chart-direction', 'chart-hourly', 'chart-dow', 'chart-rr', 'chart-lot',
                    'chart-drawdown', 'chart-monthly', 'chart-streaks', 'chart-calendar', 'chart-insights', 'chart-recent'];
    chartIds.forEach(function(id) {
      showEmptyChart(id, 'empty.not_enough');
    });
    clearAllApexCharts();
    clearLightweightChart();
    renderGoalWidget();
    renderPropWidgets();
    return;
  }

  renderCumulativeChart(trades);
  renderWinLossChart(trades);
  renderDailyChart(trades);
  renderSymbolChart(trades);
  renderDirectionChart(trades);
  renderHourlyChart(trades);
  renderDowChart(trades);
  renderRRChart(trades);
  renderLotChart(trades);
  renderDrawdownChart(trades);
  renderMonthlyChart(trades);
  renderStreaksWidget(trades);
  renderCalendarWidget(trades);
  renderInsightsWidget(trades);
  renderRecentTradesWidget(trades);
  renderGoalWidget();
  renderPropWidgets();
}

// ⭐ TEK WIDGET'I SIFIRDAN ÇİZ - grafik tipi/metrik/boyut değişince kullanılır.
// Apex örneği önce yok edilir: updateOptions tip değişimini (donut → bar vb.) güvenilir uygulamıyor.
var CHART_RENDERERS = {
  cumulative: renderCumulativeChart,
  winloss: renderWinLossChart,
  daily: renderDailyChart,
  symbol: renderSymbolChart,
  direction: renderDirectionChart,
  hourly: renderHourlyChart,
  dow: renderDowChart,
  rr: renderRRChart,
  lot: renderLotChart,
  drawdown: renderDrawdownChart,
  monthly: renderMonthlyChart,
  streaks: renderStreaksWidget,
  calendar: renderCalendarWidget,
  insights: renderInsightsWidget,
  recent: renderRecentTradesWidget,
  goal: renderGoalWidget
};
PROP_WIDGET_KEYS.forEach(function(k) { CHART_RENDERERS[k] = function() { renderPropWidget(k); }; });

export function renderChartFor(key, trades) {
  var fn = CHART_RENDERERS[key];
  if (!fn) return;
  if (key === 'cumulative') clearLightweightChart();
  else clearApexChart(key);

  var container = document.getElementById('chart-' + key);
  if (!container) return;
  container.innerHTML = '';

  // Hedef ve prop kartları işlem listesinden bağımsız çizilir
  if (key !== 'goal' && PROP_WIDGET_KEYS.indexOf(key) === -1 && (!trades || !trades.length)) {
    showEmptyChart('chart-' + key, 'empty.not_enough');
    return;
  }
  fn(trades || []);
}