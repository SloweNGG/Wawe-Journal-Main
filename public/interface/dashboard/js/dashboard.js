// ============================================================
// DASHBOARD - ANA JS DOSYASI (APEXCHARTS & LIGHTWEIGHT CHARTS)
// ⭐ Chart.js → ApexCharts + Lightweight Charts GEÇİŞİ
// ⭐ FIX: Chart boyutlandırma / container senkronizasyonu
// ⭐ FIX: Tooltip'ler container dışında render
// ⭐ FIX: Outlier capping - KALDIRILDI (otomatik ölçekleme yeterli)
// ⭐ FIX: Number.MIN_VALUE → -Number.MAX_VALUE
// ⭐ FIX: ResizeObserver feature-detection eklendi
// ⭐ FIX: Her chart ayrı try/catch ile korundu
// ⭐ FIX: visibilitychange'de SADECE resize
// ⭐ FIX: chartContainers shadowing düzeltildi
// ⭐ FIX: Donut beyaz kenarlık kaldırıldı (stroke: 0)
// ⭐ FIX: Donut tooltip followCursor: true
// ⭐ FIX: Emoji → Lucide ikon (strateji + recent trades)
// ⭐ FIX: Sembol chart dataLabel taşması düzeltildi
// ⭐ FIX: Donut boyutu 65% (orijinal Chart.js cutout ile aynı)
// ⭐ Tüm FIX'ler korundu
// ⭐ FIX: startDashboard() - window.ApexCharts kontrolü
// ⭐ FIX: hideSkeletons() - Promise + requestAnimationFrame
// ⭐ FIX: refresh() - await hideSkeletons()
// ⭐ FIX: renderCharts() - renderAttempts limiti 5, allReady kaldırıldı
// ⭐ DEĞİŞİKLİK: renderDailyChart xaxis rotateAlways/rotateAngle kaldırıldı, maxTicksLimit ve tickAmount kullanıldı
// ⭐ DEĞİŞİKLİK: renderSymbolChart dataLabels bar içine hizalandı, outlier capping kaldırıldı
// ⭐ DEĞİŞİKLİK: renderStats avgLoss negatif gönderildi, parent stat-card'a class eklendi
// ⭐ DEĞİŞİKLİK: formatCurrency locale 'en-US' yapıldı, tek kaynak
// ⭐ DEĞİŞİKLİK: renderRecentTrades'de saat gösterimi kaldırıldı, sadece gün/ay
// ⭐ FIX (HATA): renderWinLossChart ve renderDirectionChart tooltip/legend formatter'larına güvenlik kontrolü eklendi
// ⭐ FIX: ApexCharts eksen ayarları (tickAmount, datetime tipi) düzeltildi
// ⭐ FIX: Mobilde kompakt para birimi formatı eklendi
// ⭐ FIX: Stat ve KPI değerlerine title eklendi (tam değer)
// ⭐ FIX: Aylık hedef yüzdesi -100..100 arası clamp edildi
// ⭐ FIX: Donut grafikleri merkez yazısı kaldırıldı, boyut küçültüldü (SORUN 7)
// ⭐ FIX: Welcome mesajı kaldırıldı (SORUN 4)
// ⭐ FIX: Options menü eklendi, eski date-filter/export kaldırıldı (SORUN 3)
// ⭐ FIX: Sembol grafiği tick ayarları iyileştirildi (SORUN 9)
// ⭐ FIX: Son işlemler paneli yeniden tasarlandı (SORUN 10)
// ⭐ FIX: Grafik büyütme modalı eklendi (SORUN 11)
// ⭐ FIX: getApexColors mutedColor eşleştirildi (SORUN 1)
// ⭐ FIX: Options menü dinamik fixed pozisyon (SORUN 3)
// ⭐ FIX: Masaüstü toolbar + custom range eklendi (SORUN 4)
// ⭐ FIX: Sembol grafiği mobilde grid/dataLabels gizlendi (SORUN 5)
// ⭐ FIX: KPI accordion SADECE mobilde (SORUN 6)
// ⭐ FIX: Mobil donut carousel eklendi (SORUN 7)
// ⭐ FIX: Not ikonu trade-row-symbol-line içine taşındı (SORUN 8)
// ⭐ FIX: Unterminated string literal düzeltildi (closeChartExpansion)
// ⭐ FIX (TEMA): Sayfa başında tema localStorage'dan yükleniyor
// ⭐ FIX (TEMA): storage / themeChanged event'leri dinleniyor
// ⭐ FIX (TEMA): Tema değişince chart'lar yeniden render ediliyor
// ⭐ FIX (LOCALE): formatCurrency + formatCompactCurrency tr-TR yapıldı
//        (premium-dashboard/helpers.js ile tutarlılık sağlandı)
// ⭐ FIX (BADGE): Kümülatif K/Z badge'i 0'a yakın bölmede patlamıyor
//        (changePercent hesabına Math.abs + min baseline guard eklendi)
// ⭐ TEMİZLİK: renderStreak() fonksiyonu SİLİNDİ
//        - dashboard.astro'da #streak-dots/#streak-count/#streak-label
//          elementleri hiç yok
//        - safeEl uyarısı veriyordu, hiçbir görsel etkisi yoktu
// ============================================================

// ============================================================
// ⭐ TEMA BAŞLATMA - SAYFA YÜKLENİRKEN (EN BAŞTA ÇALIŞIR)
// ============================================================

(function initTheme() {
  try {
    var savedTheme = localStorage.getItem('ww_theme');
    var savedFontSize = localStorage.getItem('ww_font_size');
    var customTheme = localStorage.getItem('ww_custom_theme');

    if (savedTheme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }

    if (savedFontSize) {
      document.body.style.fontSize = savedFontSize + 'px';
    }

    if (savedTheme !== 'light' && customTheme) {
      try {
        var settings = JSON.parse(customTheme);
        var root = document.documentElement;
        if (settings.backgroundColor) root.style.setProperty('--bg', settings.backgroundColor);
        if (settings.surfaceColor) {
          root.style.setProperty('--surface', settings.surfaceColor);
          root.style.setProperty('--surface2', settings.surfaceColor);
        }
        if (settings.borderColor) root.style.setProperty('--border', settings.borderColor);
        if (settings.textColor) root.style.setProperty('--text', settings.textColor);
        if (settings.fontSize) {
          document.body.style.fontSize = settings.fontSize + 'px';
        }
      } catch (e) {}
    }

    wwLog.log('🎨 [dashboard.js] Tema ayarlandı:', savedTheme || 'dark');
  } catch (e) {}
})();

(function() {
  'use strict';

  // ============================================================
  // GÜVENLİ ELEMENT ALICI
  // ============================================================

  function safeEl(id) {
    var el = document.getElementById(id);
    if (!el) {
      wwLog.warn('⚠️ Element bulunamadı:', id);
    }
    return el;
  }

  // ============================================================
  // YEREL TARİH STRING'İ
  // ============================================================

  function localDateStr(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  // ============================================================
  // SKELETON GÖSTER/GİZLE
  // ============================================================

  function showSkeletons() {
    var el1 = safeEl('stats-skeleton');
    var el2 = safeEl('stats-grid');
    var el3 = safeEl('charts-top-skeleton');
    var el4 = safeEl('charts-top-grid');
    var el5 = safeEl('charts-bottom-skeleton');
    var el6 = safeEl('charts-bottom-grid');
    var el7 = safeEl('recent-trades-skeleton');
    var el8 = safeEl('recent-trades-container-wrap');

    if (el1) el1.style.display = 'grid';
    if (el2) el2.style.display = 'none';
    if (el3) el3.style.display = 'grid';
    if (el4) el4.style.display = 'none';
    if (el5) el5.style.display = 'grid';
    if (el6) el6.style.display = 'none';
    if (el7) el7.style.display = 'block';
    if (el8) el8.style.display = 'none';
  }

  function hideSkeletons() {
    var el1 = safeEl('stats-skeleton');
    var el2 = safeEl('stats-grid');
    var el3 = safeEl('charts-top-skeleton');
    var el4 = safeEl('charts-top-grid');
    var el5 = safeEl('charts-bottom-skeleton');
    var el6 = safeEl('charts-bottom-grid');
    var el7 = safeEl('recent-trades-skeleton');
    var el8 = safeEl('recent-trades-container-wrap');

    if (el1) el1.style.display = 'none';
    if (el2) el2.style.display = 'grid';
    if (el3) el3.style.display = 'none';
    if (el4) el4.style.display = 'grid';
    if (el5) el5.style.display = 'none';
    if (el6) el6.style.display = 'grid';
    if (el7) el7.style.display = 'none';
    if (el8) el8.style.display = 'block';

    return new Promise(function(resolve) {
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          resolve();
        });
      });
    });
  }

  // ============================================================
  // UTILITY FUNCTIONS
  // ============================================================

  function calcTradePnL(t) {
    try {
      if (!t || !t.entry_price || !t.exit_price || !t.lot) return 0;
      if (typeof window.calcPnL === 'function') {
        return window.calcPnL(t.entry_price, t.exit_price, t.lot, t.direction, t.instrument, t.multiplier);
      }
      var mult = t.multiplier || 100000;
      var dir = (t.direction === 'LONG' || t.direction === 'BUY') ? 1 : -1;
      return dir * (parseFloat(t.exit_price) - parseFloat(t.entry_price)) * parseFloat(t.lot) * mult;
    } catch (e) {
      return 0;
    }
  }

  // ⭐ FIX (LOCALE): tr-TR yapıldı → premium-dashboard/helpers.js ile tutarlı
  function formatCurrency(value) {
    if (typeof window.formatCurrency === 'function') {
      return window.formatCurrency(value);
    }
    var num = parseFloat(value) || 0;
    var symbol = typeof getCurrencySymbol === 'function' ? getCurrencySymbol() : '$';
    var formatted = Math.abs(num).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (num >= 0 ? '+' : '-') + symbol + formatted;
  }

  // ⭐ FIX (LOCALE): tr-TR yapıldı
  function formatCompactCurrency(value) {
    var symbol = typeof getCurrencySymbol === 'function' ? getCurrencySymbol() : '$';
    var num = parseFloat(value) || 0;
    var abs = Math.abs(num);
    var compact;
    try {
      compact = new Intl.NumberFormat('tr-TR', {
        notation: 'compact',
        maximumFractionDigits: 1
      }).format(abs);
    } catch (e) {
      compact = abs.toFixed(0);
    }
    return (num >= 0 ? '+' : '-') + symbol + compact;
  }

  function formatCurrencyPDF(value) {
    if (typeof window.formatCurrencyPDF === 'function') {
      return window.formatCurrencyPDF(value);
    }
    return formatCurrency(value);
  }

  function sanitizeHTML(str) {
    if (typeof window.sanitizeHTML === 'function') {
      return window.sanitizeHTML(str);
    }
    if (!str) return '';
    var temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
  }

  function escapeAttr(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function showToast(msg, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
    } else {
      wwLog.log('📢 Toast:', msg, type);
    }
  }

  // ============================================================
  // ANA DASHBOARD STATE
  // ============================================================

  var currentUsername = '';
  var monthlyTarget = 5000;
  var TARGET_STORAGE_KEY = 'ww_monthly_target';

  var allTrades = [];
  var allTradesFullStats = [];
  var currentRange = 'all';

  // ⭐ APEXCHARTS STATE
  var apexCharts = {};
  var chartRafId = null;
  var isPageVisible = true;
  var chartsInitialized = false;
  var chartsBusy = false;
  var chartsRenderedOnce = false;
  var refreshToken = 0;

  // ⭐ RESIZE OBSERVER
  var resizeObservers = {};
  var chartContainers = {};

  // ⭐ CHART EXPANSION (SORUN 11)
  var expandedChart = null;
  var _chartExpandResizeTimer = null;

  // ⭐ CUSTOM RANGE (SORUN 4)
  window._customRangeStart = null;
  window._customRangeEnd = null;

  // ============================================================
  // ⭐ APEXCHARTS TEMA
  // ============================================================

  function getApexTheme() {
    var isLight = document.body.classList.contains('light-theme');
    return {
      mode: isLight ? 'light' : 'dark',
      palette: 'palette1',
      monochrome: {
        enabled: false
      }
    };
  }

  function getApexColors() {
    var isLight = document.body.classList.contains('light-theme');
    return {
      textColor: isLight ? '#1e293b' : '#e8e8f0',
      mutedColor: isLight ? '#64748b' : '#a8a8c0',
      gridColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',
      accent: '#8b5cf6',
      green: isLight ? '#10b981' : '#22c55e',
      red: isLight ? '#dc2626' : '#ef4444',
      surface: isLight ? '#ffffff' : '#0e0e16'
    };
  }

  // ============================================================
  // ⭐ APEXCHARTS BASE OPTIONS (Tooltip body'de render)
  // ============================================================

  function getBaseOptions() {
    var colors = getApexColors();
    var theme = getApexTheme();
    return {
      theme: theme,
      chart: {
        fontFamily: "'DM Sans', sans-serif",
        toolbar: {
          show: false
        },
        animations: {
          enabled: true,
          easing: 'easeinout',
          speed: 400
        },
        background: 'transparent'
      },
      grid: {
        borderColor: colors.gridColor,
        strokeDashArray: 4,
        position: 'back',
        padding: {
          top: 10,
          bottom: 10,
          left: 10,
          right: 10
        }
      },
      tooltip: {
        theme: theme.mode,
        style: {
          fontSize: '12px',
          fontFamily: "'DM Sans', sans-serif"
        },
        custom: function({ series, seriesIndex, dataPointIndex, w }) {
          var label = w.globals.labels[dataPointIndex] || '';
          var seriesName = w.globals.seriesNames[seriesIndex] || '';
          var value = w.globals.series[seriesIndex][dataPointIndex] || 0;
          var color = w.globals.colors[seriesIndex] || '#8b5cf6';

          return '<div style="background:' + colors.surface + ';border:1px solid ' + colors.gridColor + ';border-radius:8px;padding:8px 14px;box-shadow:0 8px 24px rgba(0,0,0,0.3);color:' + colors.textColor + ';font-family:\'DM Sans\',sans-serif;font-size:12px;max-width:280px;">' +
            '<div style="font-weight:600;margin-bottom:4px;color:' + color + ';">' + label + '</div>' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
            '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + color + ';"></span>' +
            '<span>' + seriesName + ': <strong>' + value + '</strong></span>' +
            '</div>' +
            '</div>';
        }
      },
      dataLabels: {
        enabled: false
      },
      legend: {
        labels: {
          colors: colors.textColor,
          useSeriesColors: false
        },
        fontFamily: "'DM Sans', sans-serif",
        fontSize: '12px',
        fontWeight: 500
      }
    };
  }

  // ============================================================
  // ⭐ TEMA DEĞİŞİMİNİ DİNLE (FIX)
  // ============================================================

  function resetChartsForTheme() {
    chartsRenderedOnce = false;
    chartsInitialized = false;
    destroyAllCharts();

    var filtered = filterByDate(allTrades, currentRange);
    if (filtered && filtered.length > 0) {
      if (chartRafId) cancelAnimationFrame(chartRafId);
      chartRafId = requestAnimationFrame(function() {
        chartRafId = null;
        renderCharts(filtered);
      });
    }
  }

  // ⭐ storage event - başka sekmede tema değişirse
  window.addEventListener('storage', function(e) {
    if (e.key === 'ww_theme') {
      wwLog.log('🔄 [Dashboard] Tema değişikliği algılandı (storage):', e.newValue);
      var isLight = e.newValue === 'light';
      document.body.classList.toggle('light-theme', isLight);

      var customTheme = localStorage.getItem('ww_custom_theme');
      if (customTheme && !isLight) {
        try {
          var settings = JSON.parse(customTheme);
          var root = document.documentElement;
          if (settings.backgroundColor) root.style.setProperty('--bg', settings.backgroundColor);
          if (settings.surfaceColor) {
            root.style.setProperty('--surface', settings.surfaceColor);
            root.style.setProperty('--surface2', settings.surfaceColor);
          }
          if (settings.borderColor) root.style.setProperty('--border', settings.borderColor);
          if (settings.textColor) root.style.setProperty('--text', settings.textColor);
          if (settings.fontSize) document.body.style.fontSize = settings.fontSize + 'px';
        } catch (e) {}
      }

      setTimeout(resetChartsForTheme, 100);
    }
  });

  // ⭐ themeChanged event - settings.js bu event'i dispatch ediyor
  document.addEventListener('themeChanged', function(e) {
    wwLog.log('🔄 [Dashboard] themeChanged event yakalandı');
    if (e.detail && e.detail.settings && !document.body.classList.contains('light-theme')) {
      var settings = e.detail.settings;
      var root = document.documentElement;
      if (settings.backgroundColor) root.style.setProperty('--bg', settings.backgroundColor);
      if (settings.surfaceColor) {
        root.style.setProperty('--surface', settings.surfaceColor);
        root.style.setProperty('--surface2', settings.surfaceColor);
      }
      if (settings.borderColor) root.style.setProperty('--border', settings.borderColor);
      if (settings.textColor) root.style.setProperty('--text', settings.textColor);
      if (settings.fontSize) document.body.style.fontSize = settings.fontSize + 'px';
    }
    setTimeout(resetChartsForTheme, 100);
  });

  // ⭐ chartsReset event - eski uyumluluk için
  document.addEventListener('chartsReset', function(e) {
    wwLog.log('🔄 chartsReset event alındı, grafikler yeniden render ediliyor...');
    resetChartsForTheme();
  });

  // ============================================================
  // ⭐ RESIZE OBSERVER - FEATURE DETECTION İLE
  // ============================================================

  function setupResizeObserver(containerId, chart) {
    var container = safeEl(containerId);
    if (!container) return;

    if (typeof ResizeObserver === 'undefined') {
      wwLog.log('ℹ️ ResizeObserver desteklenmiyor, boyut takibi yapılamıyor.');
      return;
    }

    if (resizeObservers[containerId]) {
      try {
        resizeObservers[containerId].disconnect();
      } catch(e) {}
      delete resizeObservers[containerId];
    }

    try {
      var observer = new ResizeObserver(function(entries) {
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i];
          var rect = entry.contentRect;
          if (rect.width > 0 && rect.height > 0) {
            try {
              if (chart && typeof chart.resize === 'function') {
                chart.resize(rect.width, rect.height);
              }
            } catch(e) {
              // Sessizce geç
            }
          }
        }
      });

      observer.observe(container);
      resizeObservers[containerId] = observer;
      chartContainers[containerId] = container;
    } catch(e) {
      wwLog.warn('ResizeObserver kurulamadı:', e);
    }
  }

  function cleanupResizeObservers() {
    for (var key in resizeObservers) {
      try {
        resizeObservers[key].disconnect();
      } catch(e) {}
      delete resizeObservers[key];
    }
    chartContainers = {};
  }

  // ============================================================
  // FILTER FUNCTIONS
  // ============================================================

  function filterByDate(trades, range) {
    if (range === 'all') return trades;
    if (range === 'custom' && window._customRangeStart && window._customRangeEnd) {
      var cStart = new Date(window._customRangeStart);
      cStart.setHours(0,0,0,0);
      var cEnd = new Date(window._customRangeEnd);
      cEnd.setHours(23,59,59,999);
      return trades.filter(function(t) {
        var d = t.trade_date ? new Date(t.trade_date) : null;
        return d && d >= cStart && d <= cEnd;
      });
    }
    var now = new Date();
    var start = new Date();
    if (range === 'week') start.setDate(now.getDate() - 7);
    if (range === 'month') start.setMonth(now.getMonth() - 1);
    if (range === 'year') start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    return trades.filter(function(t) { return t.trade_date && new Date(t.trade_date) >= start; });
  }

  function getPreviousPeriodTrades(trades, range) {
    var now = new Date();
    var currentStart = new Date();
    if (range === 'week') currentStart.setDate(now.getDate() - 7);
    if (range === 'month') currentStart.setMonth(now.getMonth() - 1);
    if (range === 'year') currentStart.setMonth(0, 1);
    currentStart.setHours(0, 0, 0, 0);

    var prevEnd = new Date(currentStart);
    var prevStart = new Date(currentStart);
    if (range === 'week') prevStart.setDate(prevStart.getDate() - 7);
    if (range === 'month') prevStart.setMonth(prevStart.getMonth() - 1);
    if (range === 'year') {
      prevStart.setFullYear(prevStart.getFullYear() - 1, 0, 1);
    }
    prevStart.setHours(0, 0, 0, 0);

    return trades.filter(function(t) {
      return t.trade_date && new Date(t.trade_date) >= prevStart && new Date(t.trade_date) < prevEnd;
    });
  }

  function calcTrend(current, previous) {
    if (previous === 0) return null;
    var percent = ((current - previous) / Math.abs(previous)) * 100;
    return { percent: Math.abs(percent).toFixed(1), isPositive: percent >= 0 };
  }

  function updateTrend(elementId, trend) {
    var el = safeEl(elementId);
    if (!el) return;

    if (!trend) {
      el.innerHTML = '';
      el.className = 'stat-trend';
      el.style.display = 'none';
      return;
    }

    el.style.display = 'flex';
    var arrow = trend.isPositive ? '↑' : '↓';
    var prevText = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('dashboard.trend_previous') : 'önceki döneme göre';
    el.innerHTML = arrow + ' ' + trend.percent + '% ' + prevText;
    el.className = 'stat-trend ' + (trend.isPositive ? 'positive' : 'negative');
  }

  function smartDateLabel(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    var day = d.getDate();
    var month = d.getMonth() + 1;
    var year = d.getFullYear();
    var currentYear = new Date().getFullYear();
    if (year !== currentYear) {
      return day + '/' + month + '/' + String(year).slice(2);
    }
    return day + '/' + month;
  }

  function getDayNames(lang) {
    var names = {
      tr: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'],
      en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      de: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
    };
    return names[lang] || names.en;
  }

  function loadMonthlyTarget() {
    try {
      var saved = localStorage.getItem(TARGET_STORAGE_KEY);
      if (saved && !isNaN(parseFloat(saved))) {
        monthlyTarget = parseFloat(saved);
      } else {
        monthlyTarget = 5000;
      }
    } catch (e) {
      monthlyTarget = 5000;
    }
  }

  function saveMonthlyTarget(target) {
    try {
      monthlyTarget = target;
      localStorage.setItem(TARGET_STORAGE_KEY, target);
    } catch (e) {}
  }

  // ============================================================
  // ANIMATION
  // ============================================================

  function animateNumber(elementId, targetValue, isCurrency, isPercentage, delay, animate) {
    var el = safeEl(elementId);
    if (!el) return;
    if (!animate) {
      if (isCurrency) el.textContent = formatCurrency(targetValue);
      else if (isPercentage) el.textContent = targetValue.toFixed(1) + '%';
      else el.textContent = targetValue;
      return;
    }
    var startValue = 0;
    var duration = 1000;
    var startTime = performance.now() + delay;

    function update(currentTime) {
      if (currentTime < startTime) { requestAnimationFrame(update); return; }
      var elapsed = currentTime - startTime;
      var progress = Math.min(elapsed / duration, 1);
      var current = startValue + (targetValue - startValue) * progress;
      if (isCurrency) el.textContent = formatCurrency(current);
      else if (isPercentage) el.textContent = current.toFixed(1) + '%';
      else el.textContent = Math.floor(current);
      if (progress < 1) requestAnimationFrame(update);
      else {
        if (isCurrency) el.textContent = formatCurrency(targetValue);
        else if (isPercentage) el.textContent = targetValue.toFixed(1) + '%';
        else el.textContent = targetValue;
      }
    }
    requestAnimationFrame(update);
  }

  // ============================================================
  // RENDER FUNCTIONS
  // ============================================================

  function renderStats(trades, previousTrades, animate) {
    previousTrades = previousTrades || null;
    animate = (animate !== undefined) ? animate : true;

    var total = trades.length;
    var totalPnL = 0, wins = 0, losses = 0;
    var winPnLs = [], lossPnLs = [];

    trades.forEach(function(t) {
      var pnl = calcTradePnL(t);
      totalPnL += pnl;
      if (pnl > 0) { wins++; winPnLs.push(pnl); }
      else if (pnl < 0) { losses++; lossPnLs.push(pnl); }
    });

    var wr = total ? (wins / total) * 100 : 0;
    var avgWin = winPnLs.length ? winPnLs.reduce(function(a, b) { return a + b; }, 0) / winPnLs.length : 0;
    var avgLoss = lossPnLs.length ? -(Math.abs(lossPnLs.reduce(function(a, b) { return a + b; }, 0) / lossPnLs.length)) : 0;
    var profitFactor = avgLoss !== 0 ? (winPnLs.reduce(function(a, b) { return a + b; }, 0) / Math.abs(lossPnLs.reduce(function(a, b) { return a + b; }, 0))) : 0;

    var cumulative = 0, maxCumulative = 0, maxDrawdown = 0;
    trades.forEach(function(t) {
      if (t.exit_price) {
        cumulative += calcTradePnL(t);
        maxCumulative = Math.max(maxCumulative, cumulative);
        maxDrawdown = Math.min(maxDrawdown, cumulative - maxCumulative);
      }
    });

    var totalRR = 0, rrCount = 0;
    trades.forEach(function(t) {
      if (t.rr_ratio) { totalRR += parseFloat(t.rr_ratio); rrCount++; }
    });
    var avgRR = rrCount ? totalRR / rrCount : 0;

    var rawProgress = (totalPnL / monthlyTarget) * 100;
    var progressPercent = Math.min(100, Math.max(-100, rawProgress));

    var isDesktop = window.innerWidth >= 960;
    var useAnimation = animate && isDesktop;

    animateNumber('stat-total', total, false, false, 0, useAnimation);
    animateNumber('stat-pnl', totalPnL, true, false, 150, useAnimation);
    animateNumber('stat-wins', wins, false, false, 300, useAnimation);
    animateNumber('stat-losses', losses, false, false, 450, useAnimation);
    animateNumber('stat-winrate', wr, false, true, 600, useAnimation);

    var avgWinEl = safeEl('kpi-avg-win');
    if (avgWinEl) {
      avgWinEl.textContent = formatCurrency(avgWin);
      avgWinEl.title = formatCurrency(avgWin);
    }
    var avgLossEl = safeEl('kpi-avg-loss');
    if (avgLossEl) {
      avgLossEl.textContent = formatCurrency(avgLoss);
      avgLossEl.title = formatCurrency(avgLoss);
    }
    var pfEl = safeEl('kpi-pf');
    if (pfEl) pfEl.textContent = profitFactor.toFixed(2);
    var ddEl = safeEl('kpi-dd');
    if (ddEl) {
      ddEl.textContent = formatCompactCurrency(maxDrawdown);
      ddEl.title = formatCurrency(maxDrawdown);
    }
    var rrEl = safeEl('kpi-rr');
    if (rrEl) rrEl.textContent = avgRR.toFixed(2);

    var goalPercentEl = safeEl('goal-percent');
    if (goalPercentEl) {
      if (rawProgress < -100) {
        goalPercentEl.textContent = '<-100%';
      } else if (rawProgress > 100) {
        goalPercentEl.textContent = '>100%';
      } else {
        goalPercentEl.textContent = Math.floor(progressPercent) + '%';
      }
    }
    var goalProgressEl = safeEl('goal-progress');
    if (goalProgressEl) {
      var absProgress = Math.abs(progressPercent);
      goalProgressEl.style.width = absProgress + '%';
      if (progressPercent < 0) {
        goalProgressEl.className = 'progress-fill negative';
      } else {
        goalProgressEl.className = 'progress-fill';
      }
    }

    var pnlEl = safeEl('stat-pnl');
    if (pnlEl) {
      var pnlCard = pnlEl.closest('.stat-card');
      if (pnlCard) {
        if (totalPnL >= 0) {
          pnlCard.classList.add('positive');
          pnlCard.classList.remove('negative');
        } else {
          pnlCard.classList.add('negative');
          pnlCard.classList.remove('positive');
        }
      }
      if (totalPnL >= 0) {
        pnlEl.classList.add('positive');
        pnlEl.classList.remove('negative');
      } else {
        pnlEl.classList.add('negative');
        pnlEl.classList.remove('positive');
      }
    }

    if (previousTrades && previousTrades.length > 0) {
      var prevTotal = previousTrades.length;
      var prevTotalPnL = 0, prevWins = 0, prevLosses = 0;
      previousTrades.forEach(function(t) {
        var pnl = calcTradePnL(t);
        prevTotalPnL += pnl;
        if (pnl > 0) prevWins++;
        else if (pnl < 0) prevLosses++;
      });
      var prevWr = prevTotal ? (prevWins / prevTotal) * 100 : 0;

      updateTrend('trend-total', calcTrend(total, prevTotal));
      updateTrend('trend-pnl', calcTrend(totalPnL, prevTotalPnL));
      updateTrend('trend-wr', calcTrend(wr, prevWr));
      updateTrend('trend-wins', calcTrend(wins, prevWins));

      var lossTrend = calcTrend(losses, prevLosses);
      if (lossTrend) {
        lossTrend.isPositive = !lossTrend.isPositive;
        updateTrend('trend-losses', lossTrend);
      } else {
        updateTrend('trend-losses', null);
      }
    } else {
      updateTrend('trend-total', null);
      updateTrend('trend-pnl', null);
      updateTrend('trend-wr', null);
      updateTrend('trend-wins', null);
      updateTrend('trend-losses', null);
    }

    var wrEl = safeEl('stat-winrate');
    if (wrEl) wrEl.style.color = wr >= 50 ? 'var(--green)' : 'var(--red)';

    return { total: total, totalPnL: totalPnL, wins: wins, losses: losses, wr: wr, profitFactor: profitFactor, avgRR: avgRR, maxDrawdown: Math.abs(maxDrawdown) };
  }

  async function renderStrategyTags(trades) {
    var container = safeEl('strategy-tags-container');
    if (!container) return;
    var bestWorstEl = safeEl('best-worst');
    var countDisplay = safeEl('strategy-count-display');

    var usedStrategyIds = new Set();
    trades.forEach(function(t) {
      if (t.strategy_id) {
        usedStrategyIds.add(t.strategy_id);
      }
    });

    if (usedStrategyIds.size === 0) {
      var noText = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('dashboard.no_strategies') : 'Henüz strateji kullanılmamış.';
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg></div>
          <p class="empty-text">${noText}</p>
          <a href="/strategies.html" class="empty-link">Strateji oluştur →</a>
        </div>
      `;
      if (bestWorstEl) bestWorstEl.style.display = 'none';
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }

    var strategiesMap = {};
    if (typeof window.getStrategiesMap === 'function') {
      strategiesMap = await window.getStrategiesMap();
    }

    var strategyNames = [];
    usedStrategyIds.forEach(function(strategyId) {
      if (strategiesMap[strategyId]) {
        strategyNames.push(strategiesMap[strategyId]);
      }
    });

    if (strategyNames.length === 0) {
      var noFound = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('dashboard.no_strategies_found') : 'Strateji bulunamadı.';
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
          <p class="empty-text">${noFound}</p>
        </div>
      `;
      if (bestWorstEl) bestWorstEl.style.display = 'none';
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }

    container.innerHTML = strategyNames.map(function(name) {
      var safeName = sanitizeHTML(name.length > 15 ? name.slice(0, 12) + '..' : name);
      return '<div class="strategy-pill pill-neutral"><span>' + safeName + '</span></div>';
    }).join('');

    if (bestWorstEl) {
      bestWorstEl.style.display = 'flex';
    }
    if (countDisplay) {
      countDisplay.textContent = usedStrategyIds.size;
    }
  }

  // ⭐ SORUN 8: Not ikonu trade-row-symbol-line içine taşındı
  async function renderRecentTrades(trades) {
    var container = safeEl('recent-trades-container');
    if (!container) return;

    if (!trades || !trades.length) {
      var noText = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('dashboard.no_trades') : 'Henüz işlem yok.';
      container.innerHTML = `
        <div class="recent-trades-empty">
          <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
          <p class="empty-text">${noText}</p>
          <button type="button" onclick="if(typeof quickAddOpen==='function')quickAddOpen()" class="empty-link" style="background:none;border:none;cursor:pointer;padding:0;font-family:inherit;">İlk işlemi ekle →</button>
        </div>
      `;
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }

    var recent = trades.slice(-10).reverse();
    var strategiesMap = {};
    if (typeof window.getStrategiesMap === 'function') {
      strategiesMap = await window.getStrategiesMap();
    }

    var html = '<div class="trade-list">';
    recent.forEach(function(t) {
      var pnl = calcTradePnL(t);
      var isLong = t.direction === 'LONG' || t.direction === 'BUY';
      var tradeDate = new Date(t.trade_date);
      var monthNames = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
      var monthShort = monthNames[tradeDate.getMonth()] || '';
      var formattedDate = tradeDate.getDate() + ' ' + monthShort;
      var strategyName = t.strategy_id ? (strategiesMap[t.strategy_id] || '—') : '—';
      var hasNote = t.notes && t.notes.trim().length > 0;
      var fullNote = hasNote ? t.notes : '';

      var safeSymbol = sanitizeHTML(t.symbol || '—');
      var safeStrategy = sanitizeHTML(strategyName);
      var safeNotesAttr = escapeAttr(fullNote);
      var safeFullNoteHtml = sanitizeHTML(fullNote);

      html += '\n        <div class="trade-row" data-trade-id="' + t.id + '" data-notes="' + safeNotesAttr + '" data-has-note="' + hasNote + '">\n          <div class="trade-row-left">\n            <div class="trade-row-info">\n              <div class="trade-row-symbol-line">\n                <span class="trade-symbol">' + safeSymbol + '</span>\n                <span class="trade-direction ' + (isLong ? 'long' : 'short') + '">' + (isLong ? 'LONG' : 'SHORT') + '</span>\n                ' + (hasNote ? '<span class="trade-note-indicator" title="Notu göster"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span>' : '') + '\n              </div>\n              <span class="trade-strategy" title="' + safeStrategy + '">' + (safeStrategy.length > 16 ? safeStrategy.slice(0, 14) + '..' : safeStrategy) + '</span>\n            </div>\n          </div>\n          <div class="trade-row-right">\n            <span class="trade-pnl ' + (pnl >= 0 ? 'positive' : 'negative') + '">' + formatCurrency(pnl) + '</span>\n            <span class="trade-date">' + formattedDate + '</span>\n          </div>\n        </div>\n        <div class="trade-note" id="note-' + t.id + '">\n          ' + (hasNote ? safeFullNoteHtml : 'Not yok') + '\n        </div>\n      ';
    });
    html += '</div>';
    container.innerHTML = html;

    document.querySelectorAll('.trade-row').forEach(function(row) {
      row.addEventListener('click', function(e) {
        e.stopPropagation();
        var tradeId = row.dataset.tradeId;
        var noteDiv = safeEl('note-' + tradeId);
        if (noteDiv) {
          noteDiv.classList.toggle('show');
        }
      });
    });
  }

  // ⭐ TEMİZLİK: renderStreak() fonksiyonu SİLİNDİ
  // (dashboard.astro'da #streak-dots/#streak-count/#streak-label yok)

  // ============================================================
  // MINI CALENDAR
  // ============================================================

  var miniCalendarTrades = [];

  function renderMiniCalendar() {
    var grid = safeEl('mini-cal-grid');
    if (!grid) return;

    var lang = 'en';
    if (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) {
      lang = i18n.getCurrentLanguage();
    }
    var dayNames = getDayNames(lang);

    var today = new Date();
    var currentDay = today.getDay();
    var startOffset = currentDay === 0 ? 6 : currentDay - 1;

    var startDate = new Date(today);
    startDate.setDate(today.getDate() - startOffset);

    var weekDays = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      weekDays.push(d);
    }

    var weekLabelEl = safeEl('mini-cal-week-label');
    if (weekLabelEl) {
      var firstDay = weekDays[0];
      var lastDay = weekDays[6];
      var langMap = {
        tr: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
        en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        de: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
      };
      var shortMonths = langMap[lang] || langMap.en;
      var fDay = firstDay.getDate();
      var lDay = lastDay.getDate();
      var fMonth = shortMonths[firstDay.getMonth()];
      var lMonth = shortMonths[lastDay.getMonth()];
      if (fMonth === lMonth) {
        weekLabelEl.textContent = fDay + '–' + lDay + ' ' + fMonth;
      } else {
        weekLabelEl.textContent = fDay + ' ' + fMonth + ' – ' + lDay + ' ' + lMonth;
      }
    }

    var html = '';
    var totalTrades = 0;
    var totalPnl = 0;

    weekDays.forEach(function(date, index) {
      var dateStr = localDateStr(date);
      var todayStr = localDateStr(today);
      var isToday = dateStr === todayStr;

      var dayTrades = miniCalendarTrades.filter(function(t) { return t.trade_date === dateStr; });
      var hasTrade = dayTrades.length > 0;

      var dayPnl = 0;
      dayTrades.forEach(function(t) {
        if (t.exit_price) {
          var pnl = calcTradePnL(t);
          dayPnl += pnl;
        }
      });

      totalTrades += dayTrades.length;
      totalPnl += dayPnl;

      var statusClass = 'empty-day';
      var pnlText = '';
      var pnlClass = '';

      if (hasTrade && dayPnl > 0) {
        statusClass = 'win';
        pnlText = '+' + dayPnl.toFixed(0);
        pnlClass = 'positive';
      } else if (hasTrade && dayPnl < 0) {
        statusClass = 'loss';
        pnlText = dayPnl.toFixed(0);
        pnlClass = 'negative';
      }

      if (isToday) statusClass += ' today';

      html += '\n        <div class="mini-cal-day ' + statusClass + '">\n          <span class="day-name">' + dayNames[index] + '</span>\n          <span class="day-number">' + date.getDate() + '</span>\n          ' + (pnlText ? '<span class="day-pnl-small ' + pnlClass + '">' + pnlText + '</span>' : '') + '\n        </div>\n      ';
    });

    grid.innerHTML = html;

    var todayInfo = safeEl('mini-cal-today-info');
    if (todayInfo) {
      var todayStr2 = localDateStr(today);
      var todayTrades = miniCalendarTrades.filter(function(t) { return t.trade_date === todayStr2; });
      var todayPnl = 0;
      todayTrades.forEach(function(t) {
        if (t.exit_price) todayPnl += calcTradePnL(t);
      });
      var pnlText2 = todayPnl !== 0 ? formatCurrency(todayPnl) : '0';
      todayInfo.textContent = 'Bugün: ' + todayTrades.length + ' işlem, ' + pnlText2;
    }

    var weekSummary = safeEl('mini-cal-week-summary');
    if (weekSummary) {
      weekSummary.textContent = 'Bu hafta: ' + totalTrades + ' işlem, ' + formatCurrency(totalPnl);
    }
  }

  function loadMiniCalendar(trades) {
    miniCalendarTrades = trades || [];
    renderMiniCalendar();
  }

  // ============================================================
  // ⭐ APEXCHARTS - DESTROY ALL
  // ⭐ SORUN 7: mobil donut id'leri eklendi
  // ============================================================

  function destroyAllCharts() {
    var chartIds = ['chart-cumulative', 'chart-winloss', 'chart-winloss-mobile', 'chart-daily', 'chart-symbol', 'chart-direction', 'chart-direction-mobile'];
    chartIds.forEach(function(id) {
      if (apexCharts[id]) {
        try {
          apexCharts[id].destroy();
        } catch (e) { }
        delete apexCharts[id];
      }
      var container = document.getElementById(id);
      if (!container) {
        var parentMap = {
          'chart-cumulative': '.chart-wrap--tall',
          'chart-winloss': '.chart-wrap--doughnut',
          'chart-winloss-mobile': '.donut-mobile-slide:first-child .chart-wrap--doughnut',
          'chart-daily': '#charts-bottom-grid .chart-card:nth-child(1) .chart-wrap',
          'chart-symbol': '#charts-bottom-grid .chart-card:nth-child(2) .chart-wrap',
          'chart-direction': '#charts-bottom-grid .chart-card:nth-child(3) .chart-wrap--doughnut',
          'chart-direction-mobile': '.donut-mobile-slide:last-child .chart-wrap--doughnut'
        };
        var parentSelector = parentMap[id];
        if (parentSelector) {
          var parents = document.querySelectorAll(parentSelector);
          parents.forEach(function(parent) {
            if (!parent.querySelector('#' + id)) {
              var newDiv = document.createElement('div');
              newDiv.id = id;
              parent.appendChild(newDiv);
            }
          });
        }
      }
    });
    cleanupResizeObservers();
    chartsInitialized = false;
  }

  // ============================================================
  // ⭐ APEXCHARTS - RENDER FUNCTIONS
  // ============================================================

  function renderCumulativeChart(trades) {
    if (!trades || !trades.length) return null;

    var colors = getApexColors();
    var cum = 0;
    var cumData = [];
    var cumTimestamps = [];

    trades.forEach(function(t) {
      var pnl = calcTradePnL(t);
      cum += pnl;
      cumData.push(parseFloat(cum.toFixed(2)));
      var ts = new Date(t.trade_date).getTime();
      cumTimestamps.push(ts);
    });

    // ⭐ FIX (BADGE): firstPnL 0'a çok yakınsa changePercent patlıyor.
    // Baseline olarak toplam PnL'i kullan, sıfırsa badge'i sıfırla.
    var firstPnL = cumData[0] || 0;
    var lastPnL = cumData[cumData.length - 1] || 0;
    var totalAbs = 0;
    for (var ci = 0; ci < cumData.length; ci++) totalAbs += Math.abs(cumData[ci]);

    var changePercent = 0;
    if (Math.abs(firstPnL) > 0.01 && totalAbs > 0.01) {
      changePercent = ((lastPnL - firstPnL) / Math.abs(firstPnL)) * 100;
      if (!isFinite(changePercent)) changePercent = 0;
    } else if (totalAbs > 0.01) {
      // firstPnL ~ 0 ama net değişim var → oransal anlamsız, sadece işaret göster
      changePercent = lastPnL >= 0 ? 100 : -100;
    }

    var changeEl = safeEl('cumulative-change');
    if (changeEl) {
      changeEl.textContent = (lastPnL >= firstPnL ? '↑' : '↓') + ' ' + Math.abs(changePercent).toFixed(1) + '%';
      changeEl.className = 'chart-badge ' + (lastPnL >= firstPnL ? '' : 'negative');
    }

    var isMobile = window.innerWidth < 768;
    var colors_ = getApexColors();

    var options = {
      series: [{
        name: 'Kümülatif K/Z',
        data: cumTimestamps.map(function(ts, idx) {
          return [ts, cumData[idx]];
        })
      }],
      chart: {
        type: 'area',
        height: '100%',
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: {
          enabled: true,
          easing: 'easeinout',
          speed: 400
        },
        background: 'transparent'
      },
      colors: ['#8b5cf6'],
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.5,
          opacityTo: 0.05,
          stops: [0, 90, 100]
        }
      },
      stroke: {
        curve: 'smooth',
        width: 2.5
      },
      dataLabels: { enabled: false },
      grid: {
        borderColor: colors_.gridColor,
        strokeDashArray: 4,
        position: 'back',
        padding: {
          top: 10,
          bottom: 10,
          left: 10,
          right: 10
        }
      },
      xaxis: {
        type: 'datetime',
        tickAmount: isMobile ? 4 : 10,
        labels: {
          style: {
            colors: colors_.mutedColor,
            fontSize: isMobile ? '10px' : '11px',
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 500
          },
          hideOverlappingLabels: true,
          trim: true
        },
        axisBorder: { show: false },
        axisTicks: { show: false }
      },
      yaxis: {
        labels: {
          style: {
            colors: colors_.mutedColor,
            fontSize: isMobile ? '10px' : '11px',
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 500
          },
          formatter: function(value) {
            return isMobile ? formatCompactCurrency(value) : formatCurrency(value);
          }
        },
        min: function(min) {
          return min - Math.abs(min) * 0.1;
        },
        max: function(max) {
          return max + Math.abs(max) * 0.1;
        }
      },
      tooltip: {
        theme: getApexTheme().mode,
        x: {
          formatter: function(value) {
            var d = new Date(value);
            return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
          }
        },
        y: {
          formatter: function(value) {
            return formatCurrency(value);
          }
        },
        style: {
          fontSize: '12px',
          fontFamily: "'DM Sans', sans-serif"
        }
      },
      legend: { show: false }
    };

    return options;
  }

  function renderWinLossChart(trades) {
    var colors = getApexColors();
    var wins = 0, losses = 0;
    var closedTrades = trades.filter(function(t) { return t.exit_price; });
    closedTrades.forEach(function(t) {
      if (calcTradePnL(t) > 0) wins++;
      else losses++;
    });

    var total = wins + losses;
    if (total === 0) return null;

    var isMobile = window.innerWidth < 768;

    var options = {
      series: [wins, losses],
      chart: {
        type: 'donut',
        height: '100%',
        toolbar: { show: false },
        animations: {
          enabled: true,
          easing: 'easeinout',
          speed: 400
        },
        background: 'transparent'
      },
      colors: ['#22c55e', '#ef4444'],
      labels: ['Kazanan', 'Kaybeden'],
      legend: {
        position: 'bottom',
        labels: {
          colors: colors.textColor,
          useSeriesColors: false
        },
        fontFamily: "'DM Sans', sans-serif",
        fontSize: isMobile ? '10px' : '12px',
        fontWeight: 500,
        itemMargin: {
          horizontal: 8,
          vertical: 2
        },
        offsetY: -4,
        formatter: function(seriesName, opts) {
          if (!opts || !opts.w || !opts.w.globals || !opts.w.globals.series) {
            return seriesName;
          }
          var value = opts.w.globals.series[opts.seriesIndex];
          return seriesName + ' ' + value;
        }
      },
      dataLabels: { enabled: false },
      stroke: { show: false, width: 0 },
      plotOptions: {
        pie: {
          donut: {
            size: '78%',
            labels: { show: false }
          }
        }
      },
      tooltip: {
        theme: getApexTheme().mode,
        followCursor: true,
        y: {
          formatter: function(value, { seriesIndex, dataPointIndex, w }) {
            if (!w || !w.globals || !w.globals.seriesTotals) {
              return value;
            }
            var total2 = w.globals.seriesTotals.reduce(function(a, b) { return a + b; }, 0);
            var percent = total2 > 0 ? ((value / total2) * 100).toFixed(1) : 0;
            return value + ' (' + percent + '%)';
          }
        },
        style: {
          fontSize: '12px',
          fontFamily: "'DM Sans', sans-serif"
        }
      }
    };

    return options;
  }

  function renderDailyChart(trades) {
    var colors = getApexColors();
    var days = {};
    var now = new Date();
    for (var i = 29; i >= 0; i--) {
      var d = new Date(now);
      d.setDate(d.getDate() - i);
      days[localDateStr(d)] = 0;
    }
    trades.forEach(function(t) {
      if (t.exit_price && days[t.trade_date] !== undefined) {
        days[t.trade_date] += calcTradePnL(t);
      }
    });

    var dailyLabels = Object.keys(days).map(function(d) {
      var dt = new Date(d);
      return dt.getDate() + '/' + (dt.getMonth() + 1);
    });
    var dailyData = Object.values(days);

    if (dailyData.every(function(v) { return v === 0; })) return null;

    var isMobile = window.innerWidth < 768;
    var colors_ = getApexColors();

    var options = {
      series: [{
        name: 'Günlük K/Z',
        data: dailyData
      }],
      chart: {
        type: 'bar',
        height: '100%',
        toolbar: { show: false },
        animations: {
          enabled: true,
          easing: 'easeinout',
          speed: 400
        },
        background: 'transparent'
      },
      colors: ['#8b5cf6'],
      plotOptions: {
        bar: {
          borderRadius: 3,
          columnWidth: '60%',
          distributed: true,
          colors: {
            ranges: [
              { from: 0, to: 0.01, color: colors_.mutedColor },
              { from: 0.01, to: Number.MAX_VALUE, color: '#22c55e' },
              { from: -Number.MAX_VALUE, to: -0.01, color: '#ef4444' }
            ]
          }
        }
      },
      dataLabels: { enabled: false },
      grid: {
        borderColor: colors_.gridColor,
        strokeDashArray: 4,
        position: 'back',
        padding: {
          top: 10,
          bottom: 10,
          left: 10,
          right: 10
        }
      },
      xaxis: {
        categories: dailyLabels,
        tickAmount: isMobile ? 4 : 10,
        labels: {
          style: {
            colors: colors_.mutedColor,
            fontSize: isMobile ? '9px' : '11px',
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 500
          },
          hideOverlappingLabels: true,
          trim: true
        },
        axisBorder: { show: false },
        axisTicks: { show: false }
      },
      yaxis: {
        labels: {
          style: {
            colors: colors_.mutedColor,
            fontSize: isMobile ? '9px' : '11px',
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 500
          },
          formatter: function(value) {
            return isMobile ? formatCompactCurrency(value) : formatCurrency(value);
          }
        }
      },
      tooltip: {
        theme: getApexTheme().mode,
        y: {
          formatter: function(value) {
            return formatCurrency(value);
          }
        },
        style: {
          fontSize: '12px',
          fontFamily: "'DM Sans', sans-serif"
        }
      },
      legend: { show: false }
    };

    return options;
  }

  // ⭐ SORUN 5: mobilde grid/dataLabels gizlendi
  function renderSymbolChart(trades) {
    var colors = getApexColors();
    var symbolMap = {};
    trades.forEach(function(t) {
      if (t.exit_price) {
        symbolMap[t.symbol] = (symbolMap[t.symbol] || 0) + calcTradePnL(t);
      }
    });

    var sortedSymbols = Object.entries(symbolMap)
      .sort(function(a, b) { return Math.abs(b[1]) - Math.abs(a[1]); })
      .slice(0, 8);

    if (sortedSymbols.length === 0) return null;

    var isMobile = window.innerWidth < 768;
    var colors_ = getApexColors();

    var options = {
      series: [{
        name: 'Sembol K/Z',
        data: sortedSymbols.map(function(s) { return parseFloat(s[1].toFixed(2)); })
      }],
      chart: {
        type: 'bar',
        height: '100%',
        toolbar: { show: false },
        animations: {
          enabled: true,
          easing: 'easeinout',
          speed: 400
        },
        background: 'transparent'
      },
      plotOptions: {
        bar: {
          borderRadius: 3,
          horizontal: true,
          barHeight: '60%',
          distributed: false,
          colors: {
            ranges: [
              { from: 0, to: 0.01, color: colors_.mutedColor },
              { from: 0.01, to: Number.MAX_VALUE, color: '#22c55e' },
              { from: -Number.MAX_VALUE, to: -0.01, color: '#ef4444' }
            ]
          }
        }
      },
      dataLabels: {
        enabled: !isMobile,
        formatter: function(value, { dataPointIndex }) {
          var realValue = sortedSymbols[dataPointIndex][1];
          return formatCurrency(realValue);
        },
        style: {
          fontSize: '9px',
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 600,
          colors: [colors_.textColor]
        },
        offsetX: 0,
        textAnchor: 'middle'
      },
      grid: {
        show: !isMobile,
        borderColor: colors_.gridColor,
        strokeDashArray: 4,
        position: 'back',
        padding: {
          top: 10,
          bottom: 10,
          left: isMobile ? 4 : 16,
          right: isMobile ? 4 : 16
        }
      },
      xaxis: {
        categories: sortedSymbols.map(function(s) { return s[0]; }),
        tickAmount: isMobile ? 3 : 5,
        labels: {
          show: !isMobile,
          style: {
            colors: colors_.mutedColor,
            fontSize: '11px',
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 600
          },
          formatter: function(value) {
            return formatCompactCurrency(value);
          },
          hideOverlappingLabels: true
        },
        axisBorder: { show: false },
        axisTicks: { show: false }
      },
      yaxis: {
        labels: {
          style: {
            colors: colors_.textColor,
            fontSize: isMobile ? '10px' : '12px',
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 600
          }
        }
      },
      tooltip: {
        theme: getApexTheme().mode,
        y: {
          formatter: function(value, { dataPointIndex }) {
            var realValue = sortedSymbols[dataPointIndex][1];
            return formatCurrency(realValue);
          }
        },
        style: {
          fontSize: '12px',
          fontFamily: "'DM Sans', sans-serif"
        }
      },
      legend: { show: false }
    };

    return options;
  }

  function renderDirectionChart(trades) {
    var colors = getApexColors();
    var longs = 0, shorts = 0;
    trades.forEach(function(t) {
      if (t.direction === 'LONG' || t.direction === 'BUY') longs++;
      else shorts++;
    });

    var total = longs + shorts;
    if (total === 0) return null;

    var isMobile = window.innerWidth < 768;

    var options = {
      series: [longs, shorts],
      chart: {
        type: 'donut',
        height: '100%',
        toolbar: { show: false },
        animations: {
          enabled: true,
          easing: 'easeinout',
          speed: 400
        },
        background: 'transparent'
      },
      colors: ['#8b5cf6', '#f97316'],
      labels: ['Long', 'Short'],
      legend: {
        position: 'bottom',
        labels: {
          colors: colors.textColor,
          useSeriesColors: false
        },
        fontFamily: "'DM Sans', sans-serif",
        fontSize: isMobile ? '10px' : '12px',
        fontWeight: 500,
        itemMargin: {
          horizontal: 8,
          vertical: 2
        },
        offsetY: -4,
        formatter: function(seriesName, opts) {
          if (!opts || !opts.w || !opts.w.globals || !opts.w.globals.series) {
            return seriesName;
          }
          var value = opts.w.globals.series[opts.seriesIndex];
          return seriesName + ' ' + value;
        }
      },
      dataLabels: { enabled: false },
      stroke: { show: false, width: 0 },
      plotOptions: {
        pie: {
          donut: {
            size: '78%',
            labels: { show: false }
          }
        }
      },
      tooltip: {
        theme: getApexTheme().mode,
        followCursor: true,
        y: {
          formatter: function(value, { seriesIndex, dataPointIndex, w }) {
            if (!w || !w.globals || !w.globals.seriesTotals) {
              return value;
            }
            var total2 = w.globals.seriesTotals.reduce(function(a, b) { return a + b; }, 0);
            var percent = total2 > 0 ? ((value / total2) * 100).toFixed(1) : 0;
            return value + ' (' + percent + '%)';
          }
        },
        style: {
          fontSize: '12px',
          fontFamily: "'DM Sans', sans-serif"
        }
      }
    };

    return options;
  }

  // ============================================================
  // ⭐ APEXCHARTS - RENDER MAIN
  // ⭐ SORUN 7: mobil donut container seçimi
  // ============================================================

  var renderAttempts = 0;
  function renderCharts(trades) {
    if (!isPageVisible) return;
    if (!trades || !trades.length) {
      destroyAllCharts();
      return;
    }

    if (chartsBusy) return;
    chartsBusy = true;

    try {
      var isMobileView = window.innerWidth < 768;
      var winlossTargetId = isMobileView ? 'chart-winloss-mobile' : 'chart-winloss';
      var directionTargetId = isMobileView ? 'chart-direction-mobile' : 'chart-direction';

      var containerIds = ['chart-cumulative', winlossTargetId, 'chart-daily', 'chart-symbol', directionTargetId];
      var allContainersExist = true;

      for (var c = 0; c < containerIds.length; c++) {
        var container = safeEl(containerIds[c]);
        if (!container) {
          allContainersExist = false;
          break;
        }
      }

      if (!allContainersExist) {
        chartsBusy = false;
        renderAttempts++;
        if (renderAttempts > 5) {
          renderAttempts = 0;
          wwLog.warn('⚠️ Container\'lar bulunamadı, grafik render atlanıyor.');
          return;
        }
        setTimeout(function() {
          renderCharts(trades);
        }, 150);
        return;
      }
      renderAttempts = 0;

      destroyAllCharts();

      try {
        var cumOptions = renderCumulativeChart(trades);
        if (cumOptions) {
          var cumContainer = safeEl('chart-cumulative');
          if (cumContainer) {
            var chart = new ApexCharts(cumContainer, cumOptions);
            chart.render();
            apexCharts['chart-cumulative'] = chart;
            setupResizeObserver('chart-cumulative', chart);
          }
        }
      } catch(e) {
        console.error('Cumulative chart render hatası:', e);
      }

      try {
        var wlOptions = renderWinLossChart(trades);
        if (wlOptions) {
          var wlContainer = safeEl(winlossTargetId);
          if (wlContainer) {
            var chart2 = new ApexCharts(wlContainer, wlOptions);
            chart2.render();
            apexCharts[winlossTargetId] = chart2;
            setupResizeObserver(winlossTargetId, chart2);
          }
        }
      } catch(e) {
        console.error('Win/Loss chart render hatası:', e);
      }

      try {
        var dailyOptions = renderDailyChart(trades);
        if (dailyOptions) {
          var dailyContainer = safeEl('chart-daily');
          if (dailyContainer) {
            var chart3 = new ApexCharts(dailyContainer, dailyOptions);
            chart3.render();
            apexCharts['chart-daily'] = chart3;
            setupResizeObserver('chart-daily', chart3);
          }
        }
      } catch(e) {
        console.error('Daily chart render hatası:', e);
      }

      try {
        var symbolOptions = renderSymbolChart(trades);
        if (symbolOptions) {
          var symbolContainer = safeEl('chart-symbol');
          if (symbolContainer) {
            var chart4 = new ApexCharts(symbolContainer, symbolOptions);
            chart4.render();
            apexCharts['chart-symbol'] = chart4;
            setupResizeObserver('chart-symbol', chart4);
          }
        }
      } catch(e) {
        console.error('Symbol chart render hatası:', e);
      }

      try {
        var dirOptions = renderDirectionChart(trades);
        if (dirOptions) {
          var dirContainer = safeEl(directionTargetId);
          if (dirContainer) {
            var chart5 = new ApexCharts(dirContainer, dirOptions);
            chart5.render();
            apexCharts[directionTargetId] = chart5;
            setupResizeObserver(directionTargetId, chart5);
          }
        }
      } catch(e) {
        console.error('Direction chart render hatası:', e);
      }

      chartsInitialized = true;
      chartsRenderedOnce = true;

    } catch (e) {
      console.error('ApexCharts render error:', e);
    } finally {
      chartsBusy = false;
    }
  }

  // ============================================================
  // ⭐ UPDATE CHARTS - SADECE RESIZE
  // ============================================================

  function updateCharts(trades) {
    if (!trades || !trades.length) {
      destroyAllCharts();
      return;
    }

    if (chartsInitialized && chartsRenderedOnce) {
      for (var key in apexCharts) {
        try {
          var container = safeEl(key);
          if (container) {
            var rect = container.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              apexCharts[key].resize(rect.width, rect.height);
            }
          }
        } catch(e) {}
      }
      return;
    }

    chartsRenderedOnce = false;
    chartsInitialized = false;
    destroyAllCharts();

    if (chartRafId) cancelAnimationFrame(chartRafId);
    chartRafId = requestAnimationFrame(function() {
      chartRafId = null;
      renderCharts(trades);
    });
  }

  // ============================================================
  // ⭐ CHART EXPANSION (SORUN 11)
  // ============================================================

  function setupChartExpansion() {
    var isDesktop = window.innerWidth >= 768;
    if (!isDesktop) return;

    var chartConfigs = [
      { cardSelector: '#charts-top-grid .chart-card:nth-child(1)', title: 'Kümülatif K/Z Serisi', renderFn: renderCumulativeChart },
      { cardSelector: '#charts-top-grid .chart-card:nth-child(2)', title: 'Win / Loss Dağılımı', renderFn: renderWinLossChart },
      { cardSelector: '#charts-bottom-grid .chart-card:nth-child(1)', title: 'Günlük K/Z - Son 30 Gün', renderFn: renderDailyChart },
      { cardSelector: '#charts-bottom-grid .chart-card:nth-child(2)', title: 'Sembol Bazlı Performans', renderFn: renderSymbolChart },
      { cardSelector: '#charts-bottom-grid .chart-card:nth-child(3)', title: 'Long / Short Dağılımı', renderFn: renderDirectionChart }
    ];

    chartConfigs.forEach(function(cfg) {
      var card = document.querySelector(cfg.cardSelector);
      if (!card) return;
      card.classList.add('expandable');
      card.onclick = function(e) {
        if (e.target.closest('.chart-wrap')) {
          openChartExpansion(cfg.title, cfg.renderFn);
        }
      };
    });
  }

  function openChartExpansion(title, renderFn) {
    var overlay = safeEl('chart-expand-modal');
    var titleEl = safeEl('chart-expand-title');
    var container = safeEl('chart-expand-container');
    if (!overlay || !container) return;

    titleEl.textContent = title;
    overlay.classList.add('active');
    overlay.style.display = 'flex';

    var filtered = filterByDate(allTrades, currentRange);
    var options = renderFn(filtered);
    if (!options) return;

    options.chart.height = 480;
    options.chart.animations = { enabled: true, speed: 300 };

    container.innerHTML = '';
    if (expandedChart) {
      try { expandedChart.destroy(); } catch(e) {}
    }
    expandedChart = new ApexCharts(container, options);
    expandedChart.render();
  }

  function closeChartExpansion() {
    var overlay = safeEl('chart-expand-modal');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.style.display = 'none';
    }
    if (expandedChart) {
      try { expandedChart.destroy(); } catch(e) {}
      expandedChart = null;
    }
  }

  // ============================================================
  // EXPORT FUNCTIONS
  // ============================================================

  function exportCSV() {
    try {
      var trades = filterByDate(allTrades, currentRange);
      if (!trades.length) {
        showToast('Dışa aktarılacak işlem yok.', 'error');
        return;
      }
      var headers = ['Sembol', 'Yön', 'Enstrüman', 'Lot', 'Giriş', 'Çıkış', 'SL', 'TP', 'K/Z', 'R:R', 'Tarih', 'Not'];
      var rows = trades.map(function(t) {
        var pnl = calcTradePnL(t);
        return [
          t.symbol || '', t.direction || '', t.instrument || '', t.lot || '',
          t.entry_price || '', t.exit_price || '', t.stop_loss || '', t.take_profit || '',
          t.exit_price ? pnl.toFixed(2) : '', t.rr_ratio || '', t.trade_date || '',
          (t.notes || '').replace(/,/g, ';').replace(/\n/g, ' ')
        ].join(',');
      });
      var csv = [headers.join(','), rows.join('\n')].join('\n');
      var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'wawe-journal-' + new Date().toISOString().split('T')[0] + '.csv';
      a.click();
      URL.revokeObjectURL(url);
      showToast('CSV indirildi!');
    } catch (e) {
      console.error('CSV export hatası:', e);
    }
  }

  async function generatePDF(lang) {
    try {
      var trades = filterByDate(allTrades, currentRange);
      if (!trades.length) {
        showToast('Dışa aktarılacak işlem yok.', 'error');
        return;
      }

      if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
        showToast('PDF kütüphanesi yüklenemedi.', 'error');
        return;
      }

      var { jsPDF } = window.jspdf;
      var doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      var W = doc.internal.pageSize.getWidth();
      var H = doc.internal.pageSize.getHeight();

      var isTurkish = lang === 'tr';
      var isGerman = lang === 'de';

      var globalStrategiesMap = {};
      if (typeof window.getStrategiesMap === 'function') {
        globalStrategiesMap = await window.getStrategiesMap();
      }

      var strategyNamesCache = {};
      for (var i = 0; i < trades.slice(0, 50).length; i++) {
        var t = trades.slice(0, 50)[i];
        if (t.strategy_id && globalStrategiesMap[t.strategy_id]) {
          strategyNamesCache[t.strategy_id] = globalStrategiesMap[t.strategy_id];
        }
      }

      var totalPnL = 0, wins = 0, losses = 0;
      trades.forEach(function(t) {
        var pnl = calcTradePnL(t);
        totalPnL += pnl;
        if (pnl > 0) wins++;
        else if (pnl < 0) losses++;
      });
      var total = trades.length;
      var wr = total ? (wins / total) * 100 : 0;

      doc.setFillColor(10, 10, 15);
      doc.rect(0, 0, W, H, 'F');
      doc.setFillColor(139, 92, 246);
      doc.rect(0, 0, W, 3, 'F');
      doc.setTextColor(232, 232, 240);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('WAWE JOURNAL', 12, 12);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 107, 128);

      var reportTitle = isTurkish ? 'Ticari Islem Raporu' : (isGerman ? 'Handelsbericht' : 'Trading Report');
      doc.text(reportTitle, 12, 18);

      doc.setTextColor(139, 92, 246);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(currentUsername || 'Trader', W - 12, 12, { align: 'right' });
      doc.setTextColor(107, 107, 128);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');

      var periodLabel = isTurkish ? 'Donem: ' : (isGerman ? 'Zeitraum: ' : 'Period: ');
      var rangeNames = {
        all: isTurkish ? 'Tum Zamanlar' : (isGerman ? 'Alle Zeiten' : 'All Time'),
        week: isTurkish ? 'Bu Hafta' : (isGerman ? 'Diese Woche' : 'This Week'),
        month: isTurkish ? 'Bu Ay' : (isGerman ? 'Diesen Monat' : 'This Month'),
        year: isTurkish ? 'Bu Yil' : (isGerman ? 'Dieses Jahr' : 'This Year'),
        custom: isTurkish ? 'Özel Aralık' : (isGerman ? 'Benutzerdefiniert' : 'Custom Range')
      };
      doc.text(periodLabel + (rangeNames[currentRange] || rangeNames.all), W - 12, 18, { align: 'right' });

      var dateLabel = isTurkish ? 'Tarih: ' : (isGerman ? 'Datum: ' : 'Date: ');
      doc.text(dateLabel + new Date().toLocaleDateString(isTurkish ? 'tr-TR' : (isGerman ? 'de-DE' : 'en-US')), W - 12, 24, { align: 'right' });

      var yPos = 32;
      var stats = [
        { label: isTurkish ? 'Toplam Islem' : (isGerman ? 'Gesamt Trades' : 'Total Trades'), value: total.toString(), color: [139, 92, 246] },
        { label: isTurkish ? 'Toplam K/Z' : (isGerman ? 'Gesamt P&L' : 'Total P&L'), value: formatCurrencyPDF(totalPnL), color: totalPnL >= 0 ? [34, 197, 94] : [239, 68, 68] },
        { label: isTurkish ? 'Win Rate' : (isGerman ? 'Win-Rate' : 'Win Rate'), value: wr.toFixed(1) + '%', color: wr >= 50 ? [34, 197, 94] : [239, 68, 68] },
        { label: isTurkish ? 'Kazanan' : (isGerman ? 'Gewinner' : 'Wins'), value: wins.toString(), color: [34, 197, 94] },
        { label: isTurkish ? 'Kaybeden' : (isGerman ? 'Verlierer' : 'Losses'), value: losses.toString(), color: [239, 68, 68] },
      ];

      var cellW = (W - 24) / 5;
      stats.forEach(function(s, idx) {
        var cx = 12 + idx * cellW;
        doc.setFillColor(17, 17, 24);
        doc.roundedRect(cx, yPos, cellW - 2, 15, 2, 2, 'F');
        doc.setFillColor(30, 30, 46);
        doc.roundedRect(cx, yPos, cellW - 2, 15, 2, 2, 'S');
        doc.setTextColor(107, 107, 128);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.text(s.label, cx + (cellW - 2) / 2, yPos + 5.5, { align: 'center' });
        doc.setTextColor(s.color[0], s.color[1], s.color[2]);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(s.value, cx + (cellW - 2) / 2, yPos + 12.5, { align: 'center' });
      });

      yPos += 22;
      doc.setTextColor(139, 92, 246);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');

      var detailsLabel = isTurkish ? 'Islem Detaylari' : (isGerman ? 'Handelsdetails' : 'Trade Details');
      doc.text(detailsLabel, 12, yPos);
      yPos += 5;

      var colDefs = [
        { label: isTurkish ? 'Sembol' : (isGerman ? 'Symbol' : 'Symbol'), w: 28 },
        { label: isTurkish ? 'Lot' : (isGerman ? 'Lot' : 'Lot'), w: 16 },
        { label: isTurkish ? 'Giris' : (isGerman ? 'Einstieg' : 'Entry'), w: 28 },
        { label: isTurkish ? 'Cikis' : (isGerman ? 'Ausstieg' : 'Exit'), w: 28 },
        { label: isTurkish ? 'K/Z' : (isGerman ? 'P&L' : 'P&L'), w: 28 },
        { label: isTurkish ? 'Strateji' : (isGerman ? 'Strategie' : 'Strategy'), w: 40 },
        { label: isTurkish ? 'Tarih' : (isGerman ? 'Datum' : 'Date'), w: 28 },
      ];
      var totalW = colDefs.reduce(function(s, c) { return s + c.w; }, 0);
      var startX = (W - totalW) / 2;

      doc.setFillColor(30, 30, 46);
      doc.rect(startX, yPos, totalW, 7, 'F');
      doc.setTextColor(107, 107, 128);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      var hx = startX + 2;
      colDefs.forEach(function(col) {
        doc.text(col.label, hx, yPos + 4.5);
        hx += col.w;
      });
      yPos += 7;

      var rowH = 5.5;
      var maxRows = Math.floor((H - yPos - 15) / rowH);
      var displayTrades = trades.slice(-maxRows).reverse();

      displayTrades.forEach(function(t, idx) {
        var pnl = calcTradePnL(t);
        var isEven = idx % 2 === 0;
        var stratName = t.strategy_id ? (strategyNamesCache[t.strategy_id] || '—') : '—';
        var dateStr = t.trade_date ? new Date(t.trade_date).toLocaleDateString(isTurkish ? 'tr-TR' : (isGerman ? 'de-DE' : 'en-US')) : '—';

        doc.setFillColor(isEven ? 17 : 10, isEven ? 17 : 10, isEven ? 24 : 15);
        doc.rect(startX, yPos, totalW, rowH, 'F');

        var cx2 = startX + 2;
        doc.setTextColor(232, 232, 240);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.text((t.symbol || '—').toUpperCase(), cx2, yPos + 4);
        cx2 += colDefs[0].w;
        doc.setTextColor(107, 107, 128);
        doc.setFont('helvetica', 'normal');
        doc.text(String(t.lot || '—'), cx2, yPos + 4);
        cx2 += colDefs[1].w;
        doc.text(String(t.entry_price || '—'), cx2, yPos + 4);
        cx2 += colDefs[2].w;
        if (t.exit_price) {
          doc.text(String(t.exit_price), cx2, yPos + 4);
        } else {
          doc.setTextColor(139, 92, 246);
          var openLabel = isTurkish ? 'Acik' : (isGerman ? 'Offen' : 'Open');
          doc.text(openLabel, cx2, yPos + 4);
          doc.setTextColor(107, 107, 128);
        }
        cx2 += colDefs[3].w;
        if (t.exit_price) {
          doc.setTextColor(pnl >= 0 ? 34 : 239, pnl >= 0 ? 197 : 68, pnl >= 0 ? 94 : 68);
          doc.setFont('helvetica', 'bold');
          doc.text(formatCurrencyPDF(pnl), cx2, yPos + 4);
          doc.setTextColor(107, 107, 128);
          doc.setFont('helvetica', 'normal');
        } else {
          doc.text('—', cx2, yPos + 4);
        }
        cx2 += colDefs[4].w;
        doc.setTextColor(139, 92, 246);
        doc.text(stratName.length > 18 ? stratName.slice(0, 15) + '..' : stratName, cx2, yPos + 4);
        doc.setTextColor(107, 107, 128);
        cx2 += colDefs[5].w;
        doc.text(dateStr, cx2, yPos + 4);

        yPos += rowH;
      });

      doc.setDrawColor(30, 30, 46);
      doc.setLineWidth(0.3);
      doc.rect(startX, yPos - displayTrades.length * rowH - 7, totalW, displayTrades.length * rowH + 7, 'S');

      if (trades.length > maxRows) {
        yPos += 3;
        doc.setTextColor(107, 107, 128);
        doc.setFontSize(6);
        var noteText = '* ' + trades.length + ' ' + (isTurkish ? 'islemden ilk' : (isGerman ? 'Trades, zeige erste' : 'trades, showing first')) + ' ' + maxRows + ' ' + (isTurkish ? 'tanesi gosteriliyor' : (isGerman ? 'Ergebnisse' : 'results'));
        doc.text(noteText, startX, yPos);
      }

      doc.setFillColor(17, 17, 24);
      doc.rect(0, H - 10, W, 10, 'F');
      doc.setDrawColor(30, 30, 46);
      doc.line(0, H - 10, W, H - 10);
      doc.setTextColor(139, 92, 246);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('Wawe Journal', 10, H - 4);
      doc.setTextColor(107, 107, 128);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.text('wawejournal.com', 10, H - 1.5);

      var pageLabel = 'Page 1/1  |  ' + total + ' ' + (isTurkish ? 'islem' : (isGerman ? 'Trades' : 'trades'));
      doc.text(pageLabel, W / 2, H - 3, { align: 'center' });

      doc.save('wawe-journal-rapor-' + new Date().toISOString().split('T')[0] + '.pdf');
      showToast('PDF indirildi!');
    } catch (e) {
      console.error('PDF export hatası:', e);
      showToast('PDF oluşturulamadı', 'error');
    }
  }

  // ============================================================
  // GOAL MODAL
  // ============================================================

  function setupGoalModal() {
    var goalModal = safeEl('goal-modal');
    var editGoalBtn = safeEl('edit-goal-btn');
    var closeGoalModal = safeEl('close-goal-modal');
    var cancelGoalBtn = safeEl('cancel-goal-btn');
    var saveGoalBtn = safeEl('save-goal-btn');
    var goalAmountInput = safeEl('goal-amount');

    function openGoalModal() {
      if (goalAmountInput) goalAmountInput.value = monthlyTarget;
      if (goalModal) goalModal.style.display = 'flex';
    }

    function closeGoalModalFunc() {
      if (goalModal) goalModal.style.display = 'none';
    }

    function saveGoal() {
      if (!goalAmountInput) return;
      var newTarget = parseFloat(goalAmountInput.value);
      if (isNaN(newTarget) || newTarget <= 0) {
        showToast('Geçerli bir hedef girin!', 'error');
        return;
      }
      saveMonthlyTarget(newTarget);
      closeGoalModalFunc();
      refresh();
      showToast('Hedef güncellendi!');
    }

    if (editGoalBtn) editGoalBtn.addEventListener('click', openGoalModal);
    if (closeGoalModal) closeGoalModal.addEventListener('click', closeGoalModalFunc);
    if (cancelGoalBtn) cancelGoalBtn.addEventListener('click', closeGoalModalFunc);
    if (saveGoalBtn) saveGoalBtn.addEventListener('click', saveGoal);
    if (goalModal) {
      goalModal.addEventListener('click', function(e) {
        if (e.target === goalModal) closeGoalModalFunc();
      });
    }
  }

  // ============================================================
  // PLAN BADGE GÜNCELLEME
  // ============================================================

  async function updatePlanBadge() {
    try {
      var badge = document.getElementById('plan-badge');
      var text = document.getElementById('plan-text');
      if (!badge || !text) return;

      if (typeof window.getUserPlan === 'function') {
        var planData = await window.getUserPlan();
        var isPremium = planData.plan === 'premium';

        if (isPremium) {
          badge.classList.add('premium');
          text.textContent = 'Premium';
        } else {
          badge.classList.remove('premium');
          text.textContent = 'Ücretsiz';
        }
      }
    } catch (e) {}
  }

  // ============================================================
  // ⭐ DATE FILTER / OPTIONS MENU (SORUN 3 & SORUN 4)
  // ============================================================

  function setupDateFilterAndOptions() {
    // Masaüstü toolbar date filter butonları
    document.querySelectorAll('.date-filter-option').forEach(function(opt) {
      opt.addEventListener('click', function() {
        if (this.dataset.range === 'custom') {
          var panel = safeEl('custom-range-panel');
          if (panel) {
            var isVisible = panel.style.display === 'flex';
            panel.style.display = isVisible ? 'none' : 'flex';
          }
          return;
        }
        setActiveDateRange(this.dataset.range);
        var dropdown = safeEl('options-menu-dropdown');
        if (dropdown) dropdown.classList.remove('open');
        refresh();
      });
    });

    var customRangeApplyBtn = safeEl('custom-range-apply');
    if (customRangeApplyBtn) {
      customRangeApplyBtn.addEventListener('click', function() {
        var startVal = safeEl('custom-range-start').value;
        var endVal = safeEl('custom-range-end').value;
        if (!startVal || !endVal) {
          showToast('Lütfen başlangıç ve bitiş tarihi seçin.', 'error');
          return;
        }
        currentRange = 'custom';
        window._customRangeStart = startVal;
        window._customRangeEnd = endVal;
        document.querySelectorAll('.date-filter-option').forEach(function(opt) { opt.classList.remove('active'); });
        document.querySelectorAll('[data-range="custom"]').forEach(function(opt) { opt.classList.add('active'); });
        var panel = safeEl('custom-range-panel');
        if (panel) panel.style.display = 'none';
        refresh();
      });
    }

    // CSV export butonları
    ['export-csv', 'export-csv-desktop'].forEach(function(id) {
      var btn = safeEl(id);
      if (btn) btn.addEventListener('click', function() {
        var dropdown = safeEl('options-menu-dropdown');
        if (dropdown) dropdown.classList.remove('open');
        exportCSV();
      });
    });

    // PDF export butonları
    ['export-pdf', 'export-pdf-desktop'].forEach(function(id) {
      var btn = safeEl(id);
      if (btn) btn.addEventListener('click', function() {
        var dropdown = safeEl('options-menu-dropdown');
        if (dropdown) dropdown.classList.remove('open');
        var lang = (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) ? i18n.getCurrentLanguage() : 'en';
        generatePDF(lang);
      });
    });

    // Options menu dropdown (SORUN 3 - position:fixed + JS)
    var optionsMenuBtn = safeEl('options-menu-btn');
    var optionsMenuDropdown = safeEl('options-menu-dropdown');
    if (optionsMenuBtn && optionsMenuDropdown) {
      function positionOptionsDropdown() {
        var rect = optionsMenuBtn.getBoundingClientRect();
        var dropdownWidth = optionsMenuDropdown.offsetWidth || 220;
        var viewportWidth = window.innerWidth;
        var left = rect.right - dropdownWidth;
        if (left < 8) left = 8;
        if (left + dropdownWidth > viewportWidth - 8) left = viewportWidth - dropdownWidth - 8;
        optionsMenuDropdown.style.position = 'fixed';
        optionsMenuDropdown.style.top = (rect.bottom + 8) + 'px';
        optionsMenuDropdown.style.left = left + 'px';
        optionsMenuDropdown.style.right = 'auto';
      }

      optionsMenuBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var isOpen = optionsMenuDropdown.classList.toggle('open');
        optionsMenuBtn.classList.toggle('active', isOpen);
        optionsMenuBtn.setAttribute('aria-expanded', isOpen);
        if (isOpen) positionOptionsDropdown();
      });

      window.addEventListener('resize', function() {
        if (optionsMenuDropdown.classList.contains('open')) positionOptionsDropdown();
      });
      window.addEventListener('scroll', function() {
        if (optionsMenuDropdown.classList.contains('open')) positionOptionsDropdown();
      }, true);

      document.addEventListener('click', function(e) {
        if (!optionsMenuDropdown.contains(e.target) && e.target !== optionsMenuBtn) {
          optionsMenuDropdown.classList.remove('open');
          optionsMenuBtn.classList.remove('active');
        }
      });

      // Mobil dropdown içindeki date filter option'lar
      optionsMenuDropdown.querySelectorAll('.date-filter-option').forEach(function(opt) {
        opt.addEventListener('click', function() {
          var range = this.dataset.range;
          setActiveDateRange(range);
          optionsMenuDropdown.classList.remove('open');
          optionsMenuBtn.classList.remove('active');
          refresh();
        });
      });

      // Mobil CSV/PDF butonları zaten yukarıda tanımlandı
    }
  }

  function setActiveDateRange(range) {
    currentRange = range;
    document.querySelectorAll('.date-filter-option').forEach(function(opt) {
      opt.classList.toggle('active', opt.dataset.range === range);
    });
  }

  // ============================================================
  // ⭐ KPI ACCORDION (SADECE MOBİLDE - SORUN 6)
  // ============================================================

  function setupKpiAccordion() {
    var kpiToggleBtn = safeEl('kpi-toggle-btn');
    var kpiBarWrapper = safeEl('kpi-bar-wrapper');
    if (kpiToggleBtn && kpiBarWrapper) {
      // Sadece mobilde localStorage kontrolü yap, masaüstünde etkilemez
      var isMobile = window.innerWidth < 768;
      if (isMobile) {
        var kpiCollapsedSaved = localStorage.getItem('ww_kpi_collapsed') === 'true';
        if (kpiCollapsedSaved) {
          kpiBarWrapper.classList.add('collapsed');
          kpiToggleBtn.classList.add('collapsed');
          kpiToggleBtn.setAttribute('aria-expanded', 'false');
        }
        kpiToggleBtn.addEventListener('click', function() {
          var isCollapsed = kpiBarWrapper.classList.toggle('collapsed');
          kpiToggleBtn.classList.toggle('collapsed', isCollapsed);
          kpiToggleBtn.setAttribute('aria-expanded', !isCollapsed);
          try { localStorage.setItem('ww_kpi_collapsed', isCollapsed); } catch(e) {}
        });
      }
    }
  }

  // ============================================================
  // ⭐ DONUT MOBILE CAROUSEL (SORUN 7) - scroll listener
  // ============================================================

  function setupDonutCarousel() {
    var donutTrack = safeEl('donut-mobile-track');
    if (donutTrack) {
      donutTrack.addEventListener('scroll', function() {
        var index = Math.round(donutTrack.scrollLeft / donutTrack.clientWidth);
        document.querySelectorAll('#donut-mobile-dots .dot').forEach(function(dot, i) {
          dot.classList.toggle('active', i === index);
        });
      });
    }
  }

  // ============================================================
  // ⭐ REFRESH FUNCTION
  // ============================================================

  async function refresh() {
    var myToken = ++refreshToken;
    try {
      showSkeletons();

      var filtered = filterByDate(allTrades, currentRange);
      var previous = getPreviousPeriodTrades(allTradesFullStats, currentRange);

      if (myToken !== refreshToken) return;

      renderStats(filtered, previous, true);
      await renderRecentTrades(filtered);

      if (myToken !== refreshToken) return;

      // ⭐ TEMİZLİK: renderStreak() çağrısı SİLİNDİ
      // (dashboard.astro'da #streak-dots yok)

      await renderStrategyTags(filtered);

      if (myToken !== refreshToken) return;

      loadMiniCalendar(allTrades);

      try {
        await updatePlanBadge();
      } catch (e) {}

      await hideSkeletons();

      if (myToken !== refreshToken) return;

      if (filtered.length > 0) {
        chartsRenderedOnce = false;
        chartsInitialized = false;
        destroyAllCharts();

        if (chartRafId) cancelAnimationFrame(chartRafId);
        setTimeout(function() {
          if (myToken !== refreshToken) return;
          chartRafId = requestAnimationFrame(function() {
            chartRafId = null;
            if (myToken !== refreshToken) return;
            renderAttempts = 0;
            renderCharts(filtered);
            setupChartExpansion();
          });
        }, 100);

      } else {
        destroyAllCharts();
        var emptyChartWraps = document.querySelectorAll('.chart-wrap');
        emptyChartWraps.forEach(function(container) {
          var div = container.querySelector('div');
          if (div) {
            var parent = div.parentElement;
            if (parent) {
              parent.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:12px;font-family:\'DM Sans\',sans-serif;">Bu aralıkta işlem yok</div>';
            }
          }
        });
      }

    } catch (e) {
      console.error('Refresh hatası:', e);
      hideSkeletons();
    }
  }

  // ============================================================
  // LOAD TRADES
  // ============================================================

  async function loadTrades(userId) {
    var { data, error } = await sb
      .from('trades')
      .select('id,symbol,direction,lot,entry_price,exit_price,stop_loss,take_profit,trade_date,pnl,rr_ratio,notes,strategy_id,instrument,multiplier')
      .eq('user_id', userId)
      .order('trade_date', { ascending: false })
      .limit(1000);

    if (error) {
      showToast('Veriler yüklenemedi: ' + error.message, 'error');
      return null;
    }

    var result = data || [];
    return result.reverse();
  }

  // ============================================================
  // INIT DASHBOARD
  // ============================================================

  async function initDashboard() {
    try {
      showSkeletons();

      // ⭐ ThemeObserver - body class değişince chart'ları yeniden render et
      // NOT: Artık themeChanged/storage event'leri de dinleniyor (yukarıda).
      // Bu observer sadece manuel class değişimleri için güvenlik ağı.
      try {
        var themeObserver = new MutationObserver(function(mutations) {
          mutations.forEach(function(mutation) {
            if (mutation.attributeName === 'class') {
              if (allTrades.length > 0) {
                var filtered = filterByDate(allTrades, currentRange);
                if (filtered.length > 0) {
                  chartsRenderedOnce = false;
                  chartsInitialized = false;
                  if (chartRafId) cancelAnimationFrame(chartRafId);
                  chartRafId = requestAnimationFrame(function() {
                    chartRafId = null;
                    renderCharts(filtered);
                  });
                }
              }
            }
          });
        });
        themeObserver.observe(document.body, { attributes: true });
      } catch (e) {}

      document.addEventListener('visibilitychange', function() {
        isPageVisible = !document.hidden;
        if (isPageVisible && allTrades.length > 0 && chartsInitialized) {
          var topGrid = safeEl('charts-top-grid');
          if (topGrid && topGrid.style.display !== 'none') {
            for (var key in apexCharts) {
              try {
                var container = safeEl(key);
                if (container) {
                  var rect = container.getBoundingClientRect();
                  if (rect.width > 0 && rect.height > 0) {
                    apexCharts[key].resize(rect.width, rect.height);
                  }
                }
              } catch(e) {}
            }
          }
        }
      });

      loadMonthlyTarget();

      if (typeof requireAuth !== 'function') {
        wwLog.warn('⚠️ requireAuth fonksiyonu bulunamadı');
        hideSkeletons();
        return;
      }

      var user = await requireAuth();
      if (!user) {
        hideSkeletons();
        return;
      }

      currentUsername = (user.user_metadata && user.user_metadata.username) || user.email.split('@')[0];

      if (typeof isAdmin === 'function' && isAdmin(user)) {
        var adminLink = safeEl('admin-link');
        var adminLinkMobile = safeEl('admin-link-mobile');
        if (adminLink) adminLink.style.display = 'inline';
        if (adminLinkMobile) adminLinkMobile.style.display = 'block';
      }

      try {
        await updatePlanBadge();
      } catch (e) {}

      try {
        if (typeof updateOvertradeBell === 'function') {
          await updateOvertradeBell();
        }
      } catch(e) {
        wwLog.warn('Over-Trade bildirimi kontrol edilemedi:', e);
      }

      try {
        var savedPayMethod = localStorage.getItem('ww_pay_method');
        if (savedPayMethod && typeof selectedPayMethod !== 'undefined') {
          selectedPayMethod = savedPayMethod;
        }
      } catch (e) {}

      if (typeof sb === 'undefined') {
        console.error('❌ sb (Supabase) tanımlı değil!');
        hideSkeletons();
        return;
      }

      var tradesData = await loadTrades(user.id);
      if (tradesData === null) {
        hideSkeletons();
        return;
      }

      allTrades = tradesData;
      allTradesFullStats = allTrades.filter(function(t) { return t.exit_price; });

      // Setup date filter & options
      setupDateFilterAndOptions();

      // Setup KPI accordion (sadece mobilde)
      setupKpiAccordion();

      // Setup goal modal
      setupGoalModal();

      // Setup donut carousel scroll listener
      setupDonutCarousel();

      if (typeof i18n !== 'undefined' && i18n.onChange) {
        i18n.onChange(function() {
          renderMiniCalendar();
          refresh();
        });
      }

      await refresh();

      window.addEventListener('resize', function() {
        clearTimeout(window._chartExpandResizeTimer);
        window._chartExpandResizeTimer = setTimeout(function() {
          setupChartExpansion();
        }, 300);
      });

      // ⭐ FIX: safeEl yazım hatası düzeltildi (safeE1 → safeEl)
      var chartExpandClose = safeEl('chart-expand-close');
      if (chartExpandClose) chartExpandClose.addEventListener('click', closeChartExpansion);

      var chartExpandModal = safeEl('chart-expand-modal');
      if (chartExpandModal) {
        chartExpandModal.addEventListener('click', function(e) {
          if (e.target === chartExpandModal) closeChartExpansion();
        });
      }

    } catch (e) {
      console.error('Dashboard init error:', e);
      hideSkeletons();
    }
  }

  // ============================================================
  // ⭐ DOM READY - APEXCHARTS KONTROLLÜ BAŞLAT
  // ============================================================

  function startDashboard() {
    if (typeof window.ApexCharts === 'undefined') {
      setTimeout(startDashboard, 50);
      return;
    }

    if (typeof lucide !== 'undefined') {
      var dashboardIcons = document.querySelectorAll('.dashboard-main [data-lucide]');
      if (dashboardIcons.length > 0) {
        lucide.createIcons();
      }
    }

    if (typeof loadNavbar === 'function') {
      var container = document.getElementById('navbar-container');
      if (container && container.innerHTML.trim() === '') {
        loadNavbar('navbar-container');
      }
    }

    setTimeout(initDashboard, 150);
  }

  document.addEventListener('DOMContentLoaded', startDashboard);

})();