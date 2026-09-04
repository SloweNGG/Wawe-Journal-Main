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

  if (charts.apex[key]) {
    charts.apex[key].updateOptions(mergedOptions, true, true);
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

// ⭐ 1. WIN/LOSS CHART (Donut - iyileştirilmiş merkez tasarımı)
export function renderWinLossChart(trades) {
  var containerId = 'chart-winloss';
  var container = document.getElementById(containerId);
  if (!container) return;

  var wins = 0, losses = 0;
  trades.forEach(function(t) {
    if (!t.exit_price) return;
    if (calcTradePnL(t) > 0) wins++;
    else losses++;
  });

  var total = wins + losses;
  if (total === 0) {
    showEmptyChart(containerId, 'Henüz kapanan işlem yok');
    clearApexChart('winloss');
    return;
  }

  renderOrUpdateApex('winloss', containerId, {
    chart: { type: 'donut' },
    series: [wins, losses],
    labels: ['Kazanan', 'Kaybeden'],
    colors: [CHART_THEME.green, CHART_THEME.red],
    plotOptions: {
      pie: {
        donut: {
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
              label: 'Win Rate',
              fontSize: '10px',
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 600,
              color: CHART_THEME.gray,
              formatter: function() {
                return Math.round((wins / total) * 100) + '%';
              }
            }
          }
        },
        expandOnClick: false,
      }
    },
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
      y: { formatter: function(val) { return val + ' işlem'; } }
    }
  });
}

// ⭐ 2. DIRECTION CHART (Donut - iyileştirilmiş merkez tasarımı)
export function renderDirectionChart(trades) {
  var containerId = 'chart-direction';
  var container = document.getElementById(containerId);
  if (!container) return;

  var longs = 0, shorts = 0;
  trades.forEach(function(t) {
    if (t.direction === 'LONG' || t.direction === 'BUY') longs++;
    else shorts++;
  });

  var total = longs + shorts;
  if (total === 0) {
    showEmptyChart(containerId, 'Henüz işlem yok');
    clearApexChart('direction');
    return;
  }

  renderOrUpdateApex('direction', containerId, {
    chart: { type: 'donut' },
    series: [longs, shorts],
    labels: ['Long', 'Short'],
    colors: [CHART_THEME.purple, CHART_THEME.orange],
    plotOptions: {
      pie: {
        donut: {
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
              label: 'Toplam',
              fontSize: '10px',
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 600,
              color: CHART_THEME.gray,
              formatter: function() { return total; }
            }
          }
        },
        expandOnClick: false,
      }
    },
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
      y: { formatter: function(val) { return val + ' işlem'; } }
    }
  });
}

// ⭐ 3. DAILY CHART (Outlier korumalı)
export function renderDailyChart(trades) {
  var containerId = 'chart-daily';
  var container = document.getElementById(containerId);
  if (!container) return;

  var days = {};
  var now = new Date();
  for (var i = 29; i >= 0; i--) {
    var d = new Date(now);
    d.setDate(d.getDate() - i);
    days[d.toISOString().split('T')[0]] = 0;
  }

  var hasData = false;
  trades.forEach(function(t) {
    if (t.exit_price && days[t.trade_date] !== undefined) {
      days[t.trade_date] += calcTradePnL(t);
      hasData = true;
    }
  });

  if (!hasData) {
    showEmptyChart(containerId, 'Son 30 günde işlem yok');
    clearApexChart('daily');
    return;
  }

  var dailyLabels = Object.keys(days).map(function(d) {
    var dt = new Date(d);
    return dt.getDate() + '/' + (dt.getMonth() + 1);
  });
  var dailyData = Object.values(days);
  
  // ⭐ Outlier koruması - en büyük değer korunur
  var cappedData = capOutliers(dailyData);

  renderOrUpdateApex('daily', containerId, {
    chart: { type: 'bar' },
    series: [{ name: 'Günlük K/Z', data: cappedData }],
    xaxis: {
      categories: dailyLabels,
      labels: { 
        style: { 
          fontSize: getFontSize(), 
          colors: CHART_THEME.textColor 
        } 
      },
      tickAmount: isMobile() ? 6 : 10,
    },
    yaxis: {
      labels: {
        style: { 
          fontSize: getFontSize(), 
          colors: CHART_THEME.textColor 
        },
        formatter: apexCurrencyFormatter,
      }
    },
    plotOptions: {
      bar: {
        borderRadius: 4,
        columnWidth: isMobile() ? '50%' : '70%',
        colors: {
          ranges: [
            { from: -Infinity, to: -0.01, color: CHART_THEME.red },
            { from: 0, to: Infinity, color: CHART_THEME.green },
          ]
        }
      }
    },
    tooltip: {
      y: {
        formatter: function(value, { dataPointIndex }) {
          var realValue = dailyData[dataPointIndex] || value;
          return formatCurrency(realValue);
        }
      }
    }
  });
}

// ⭐ 4. SYMBOL CHART (Outlier korumalı)
export function renderSymbolChart(trades) {
  var containerId = 'chart-symbol';
  var container = document.getElementById(containerId);
  if (!container) return;

  var symbolMap = {};
  trades.forEach(function(t) {
    if (t.exit_price) {
      var pnl = calcTradePnL(t);
      symbolMap[t.symbol] = (symbolMap[t.symbol] || 0) + pnl;
    }
  });

  var sorted = Object.entries(symbolMap).sort(function(a, b) {
    return Math.abs(b[1]) - Math.abs(a[1]);
  }).slice(0, 8);

  if (sorted.length === 0) {
    showEmptyChart(containerId, 'Henüz işlem yok');
    clearApexChart('symbol');
    return;
  }

  var labels = sorted.map(function(s) { return s[0]; });
  var data = sorted.map(function(s) { return s[1]; });
  
  // ⭐ Outlier koruması - en büyük değer korunur
  var cappedData = capOutliers(data);

  renderOrUpdateApex('symbol', containerId, {
    chart: { type: 'bar' },
    series: [{ name: 'Toplam K/Z', data: cappedData }],
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
        formatter: apexCurrencyFormatter,
      }
    },
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 4,
        colors: {
          ranges: [
            { from: -Infinity, to: -0.01, color: CHART_THEME.red },
            { from: 0, to: Infinity, color: CHART_THEME.green },
          ]
        }
      }
    },
    tooltip: {
      y: {
        formatter: function(value, { dataPointIndex }) {
          var realValue = data[dataPointIndex] || value;
          return formatCurrency(realValue);
        }
      }
    }
  });
}

// ⭐ 5. HOURLY CHART (Outlier korumalı)
export function renderHourlyChart(trades) {
  var containerId = 'chart-hourly';
  var container = document.getElementById(containerId);
  if (!container) return;

  var BUCKET_SIZE = 3;
  var bucketCount = 24 / BUCKET_SIZE;
  var buckets = new Array(bucketCount).fill(0);
  var hasData = false;

  trades.forEach(function(t) {
    if (t.exit_price) {
      var hour = new Date(t.trade_date).getHours();
      var idx = Math.floor(hour / BUCKET_SIZE);
      buckets[idx] += calcTradePnL(t);
      hasData = true;
    }
  });

  if (!hasData) {
    showEmptyChart(containerId, 'Henüz işlem yok');
    clearApexChart('hourly');
    return;
  }

  var labels = [];
  for (var i = 0; i < bucketCount; i++) {
    var startH = i * BUCKET_SIZE;
    var endH = startH + BUCKET_SIZE;
    labels.push(String(startH).padStart(2, '0') + '-' + String(endH).padStart(2, '0'));
  }
  
  // ⭐ Outlier koruması - en büyük değer korunur
  var cappedBuckets = capOutliers(buckets);

  renderOrUpdateApex('hourly', containerId, {
    chart: { type: 'bar' },
    series: [{ name: 'K/Z', data: cappedBuckets }],
    xaxis: {
      categories: labels,
      labels: {
        style: { 
          fontSize: getFontSize(), 
          colors: CHART_THEME.textColor 
        },
        rotate: 0,
      },
    },
    yaxis: {
      labels: {
        style: { 
          fontSize: getFontSize(), 
          colors: CHART_THEME.textColor 
        },
        formatter: apexCurrencyFormatter,
      }
    },
    plotOptions: {
      bar: {
        borderRadius: 5,
        columnWidth: isMobile() ? '40%' : '55%',
        colors: {
          ranges: [
            { from: -Infinity, to: -0.01, color: CHART_THEME.red },
            { from: 0, to: Infinity, color: CHART_THEME.green },
          ]
        }
      }
    },
    tooltip: {
      y: {
        formatter: function(value, { dataPointIndex }) {
          var realValue = buckets[dataPointIndex] || value;
          return formatCurrency(realValue);
        }
      },
      x: { formatter: function(val, opts) { return 'Saat ' + labels[opts.dataPointIndex]; } }
    }
  });
}

// ⭐ 6. DAY OF WEEK CHART (Outlier korumalı)
export function renderDowChart(trades) {
  var containerId = 'chart-dow';
  var container = document.getElementById(containerId);
  if (!container) return;

  var dayNames = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  var dowMap = {};
  for (var d = 0; d < 7; d++) dowMap[d] = 0;

  var hasData = false;
  trades.forEach(function(t) {
    if (t.exit_price) {
      var dow = new Date(t.trade_date).getDay();
      dowMap[dow] = (dowMap[dow] || 0) + calcTradePnL(t);
      hasData = true;
    }
  });

  if (!hasData) {
    showEmptyChart(containerId, 'Henüz işlem yok');
    clearApexChart('dow');
    return;
  }

  var data = Object.values(dowMap);
  
  // ⭐ Outlier koruması - en büyük değer korunur
  var cappedData = capOutliers(data);

  renderOrUpdateApex('dow', containerId, {
    chart: { type: 'bar' },
    series: [{ name: 'Günlük K/Z', data: cappedData }],
    xaxis: {
      categories: dayNames,
      labels: { 
        style: { 
          fontSize: getFontSize(), 
          colors: CHART_THEME.textColor 
        } 
      },
    },
    yaxis: {
      labels: {
        style: { 
          fontSize: getFontSize(), 
          colors: CHART_THEME.textColor 
        },
        formatter: apexCurrencyFormatter,
      }
    },
    plotOptions: {
      bar: {
        borderRadius: 4,
        columnWidth: isMobile() ? '50%' : '60%',
        colors: {
          ranges: [
            { from: -Infinity, to: -0.01, color: CHART_THEME.red },
            { from: 0, to: Infinity, color: CHART_THEME.green },
          ]
        }
      }
    },
    tooltip: {
      y: {
        formatter: function(value, { dataPointIndex }) {
          var realValue = data[dataPointIndex] || value;
          return formatCurrency(realValue);
        }
      }
    }
  });
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
    showEmptyChart(containerId, 'Henüz RR verisi yok');
    clearApexChart('rr');
    return;
  }

  var labels = keys;
  var data = keys.map(function(k) { return rrData[k]; });

  renderOrUpdateApex('rr', containerId, {
    chart: { type: 'bar' },
    series: [{ name: 'İşlem Sayısı', data: data }],
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
      y: { formatter: function(val) { return val + ' işlem'; } }
    }
  });
}

// ⭐ 8. LOT CHART (Outlier korumalı)
export function renderLotChart(trades) {
  var containerId = 'chart-lot';
  var container = document.getElementById(containerId);
  if (!container) return;

  var lotMap = {};
  trades.forEach(function(t) {
    if (t.exit_price) {
      var key = parseFloat(t.lot || 0).toFixed(2);
      lotMap[key] = (lotMap[key] || 0) + calcTradePnL(t);
    }
  });

  var sorted = Object.entries(lotMap).sort(function(a, b) {
    return parseFloat(a[0]) - parseFloat(b[0]);
  });

  if (sorted.length === 0) {
    showEmptyChart(containerId, 'Henüz işlem yok');
    clearApexChart('lot');
    return;
  }

  var labels = sorted.map(function(s) { return s[0]; });
  var data = sorted.map(function(s) { return s[1]; });
  
  // ⭐ Outlier koruması - en büyük değer korunur
  var cappedData = capOutliers(data);

  renderOrUpdateApex('lot', containerId, {
    chart: { type: 'bar' },
    series: [{ name: 'Lot Bazlı K/Z', data: cappedData }],
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
        formatter: apexCurrencyFormatter,
      }
    },
    plotOptions: {
      bar: {
        borderRadius: 4,
        columnWidth: isMobile() ? '50%' : '70%',
        colors: {
          ranges: [
            { from: -Infinity, to: -0.01, color: CHART_THEME.red },
            { from: 0, to: Infinity, color: CHART_THEME.green },
          ]
        }
      }
    },
    tooltip: {
      y: {
        formatter: function(value, { dataPointIndex }) {
          var realValue = data[dataPointIndex] || value;
          return formatCurrency(realValue);
        }
      }
    }
  });
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
  trades.forEach(function(t) {
    var pnl = calcTradePnL(t);
    cum += pnl;
    var time = toLwcTime(t.trade_date);
    if (time !== null) {
      points.push({ time: time, value: cum });
    }
  });

  if (points.length === 0) {
    showEmptyChart(containerId, 'Yeterli veri yok');
    return;
  }

  points = dedupeByTime(points);

  var firstVal = points[0].value;
  var lastVal = points[points.length - 1].value;
  var changePercent = firstVal !== 0 ? ((lastVal - firstVal) / Math.abs(firstVal) * 100).toFixed(1) : 0;
  var changeEl = document.getElementById('cumulative-change');
  if (changeEl) {
    changeEl.textContent = (lastVal >= firstVal ? '↑' : '↓') + ' ' + Math.abs(changePercent) + '%';
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
      scaleMargins: { top: 0.1, bottom: 0.1 },
    },
    timeScale: {
      borderVisible: false,
      timeVisible: true,
      secondsVisible: false,
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

  var series = chart.addAreaSeries({
    lineColor: CHART_THEME.purple,
    topColor: 'rgba(139,92,246,0.35)',
    bottomColor: 'rgba(139,92,246,0.0)',
    lineWidth: 2,
    priceFormat: {
      type: 'custom',
      formatter: function(price) {
        return formatCurrency(price);
      },
      minMove: 0.01,
    },
  });

  series.setData(points);
  chart.timeScale().fitContent();

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
    var dateStr = date.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    tooltip.innerHTML = '<div><strong>' + dateStr + '</strong></div><div>K/Z: ' + formatCurrency(data.value) + '</div>';
    tooltip.style.display = 'block';
    var x = param.point.x;
    var y = param.point.y;
    if (x + 160 > container.clientWidth) x = x - 160;
    if (y + 60 > container.clientHeight) y = y - 60;
    tooltip.style.left = Math.max(0, x) + 'px';
    tooltip.style.top = Math.max(0, y - 10) + 'px';
  });
}

// ⭐ RENDER ALL CHARTS
export function renderCharts(trades) {
  if (!trades || !trades.length) {
    var chartIds = ['chart-cumulative', 'chart-winloss', 'chart-daily', 'chart-symbol',
                    'chart-direction', 'chart-hourly', 'chart-dow', 'chart-rr', 'chart-lot'];
    chartIds.forEach(function(id) {
      showEmptyChart(id, 'Yeterli veri yok');
    });
    clearAllApexCharts();
    clearLightweightChart();
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
}