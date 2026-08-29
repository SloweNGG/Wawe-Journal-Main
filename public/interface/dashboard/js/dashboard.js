// ============================================================
// DASHBOARD - ANA JS DOSYASI (TÜM FİX'LER UYGULANDI)
// ⭐ FİX: 1.1 getPreviousPeriodTrades - yıl düzeltmesi
// ⭐ FİX: 1.2 loadTrades - ascending:false + reverse
// ⭐ FİX: 1.3 trend-losses invert
// ⭐ FİX: 1.4 trade-note tam metin
// ⭐ FİX: 1.5 DOM sorguları initDashboard'a taşındı
// ⭐ FİX: 1.6 localDateStr fonksiyonu eklendi
// ⭐ FİX: 1.7 Win/Loss açık kaldırıldı
// ⭐ FİX: 2.1 refresh sıralaması + token koruması
// ============================================================

(function() {
  'use strict';

  // ============================================================
  // GÜVENLİ ELEMENT ALICI
  // ============================================================

  function safeEl(id) {
    var el = document.getElementById(id);
    if (!el) {
      console.warn('⚠️ Element bulunamadı:', id);
    }
    return el;
  }

  // ============================================================
  // ⭐ FİX 1.6: YEREL TARİH STRING'İ
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

  function formatCurrency(value) {
    if (typeof window.formatCurrency === 'function') {
      return window.formatCurrency(value);
    }
    var num = parseFloat(value) || 0;
    var symbol = typeof getCurrencySymbol === 'function' ? getCurrencySymbol() : '$';
    var formatted = Math.abs(num).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (num >= 0 ? '+' : '-') + symbol + formatted;
  }

  function formatCurrencyPDF(value) {
    if (typeof window.formatCurrencyPDF === 'function') {
      return window.formatCurrencyPDF(value);
    }
    var num = parseFloat(value) || 0;
    var symbol = typeof getCurrencySymbol === 'function' ? getCurrencySymbol() : '$';
    var formatted = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (num >= 0 ? '+' : '-') + symbol + formatted;
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
      console.log('📢 Toast:', msg, type);
    }
  }

  // ============================================================
  // ANA DASHBOARD STATE
  // ============================================================

  // ⭐ FİX 1.5: DOM sorguları burada SADECE değişken olarak bildirildi
  var dateFilterOptions = null;
  var exportCsvBtn = null;
  var exportPdfBtn = null;
  var welcomeMsg = null;

  var currentUsername = '';
  var monthlyTarget = 5000;
  var TARGET_STORAGE_KEY = 'ww_monthly_target';

  var allTrades = [];
  var allTradesFullStats = [];
  var currentRange = 'all';
  var charts = {};
  var chartRafId = null;
  var isPageVisible = true;
  var chartsInitialized = false;
  var chartsBusy = false;
  var resizeDebounceId = null;
  var chartsRenderedOnce = false;

  // ⭐ FİX 2.1: refresh token
  var refreshToken = 0;

  // ============================================================
  // CHART THEME
  // ============================================================

  function setChartTheme() {
    try {
      if (typeof Chart === 'undefined') return;
      var isLightTheme = document.body.classList.contains('light-theme');
      if (isLightTheme) {
        Chart.defaults.color = '#1e293b';
        Chart.defaults.borderColor = 'rgba(0,0,0,0.08)';
      } else {
        Chart.defaults.color = '#e8e8f0';
        Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
      }
      Chart.defaults.font.family = "'DM Sans', sans-serif";
      Chart.defaults.font.size = 11;
      Chart.defaults.font.weight = '500';
      Chart.defaults.animation = {
        duration: 300,
        easing: 'easeOutQuart'
      };
    } catch (e) {
      console.warn('Chart theme ayarlanamadı:', e);
    }
  }

  // ============================================================
  // CHARTS RESET EVENT - TEMA DEĞİŞİMİNDE RENDER İÇİN
  // ============================================================

  function resetChartsForTheme() {
    chartsRenderedOnce = false;
    chartsInitialized = false;
    destroyAllCharts();

    var filtered = filterByDate(allTrades, currentRange);
    if (filtered && filtered.length > 0) {
      setChartTheme();
      if (chartRafId) cancelAnimationFrame(chartRafId);
      chartRafId = requestAnimationFrame(function() {
        chartRafId = null;
        renderCharts(filtered);
      });
    }
  }

  document.addEventListener('chartsReset', function(e) {
    console.log('🔄 chartsReset event alındı, grafikler yeniden render ediliyor...');
    resetChartsForTheme();
  });

  // ============================================================
  // FILTER FUNCTIONS
  // ============================================================

  function filterByDate(trades, range) {
    if (range === 'all') return trades;
    var now = new Date();
    var start = new Date();
    if (range === 'week') start.setDate(now.getDate() - 7);
    if (range === 'month') start.setMonth(now.getMonth() - 1);
    if (range === 'year') start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    return trades.filter(function(t) { return t.trade_date && new Date(t.trade_date) >= start; });
  }

  // ⭐ FİX 1.1: getPreviousPeriodTrades - yıl düzeltmesi
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
      // ⭐ FİX: geçen yılın 1 Ocak'ı
      prevStart.setFullYear(prevStart.getFullYear() - 1, 0, 1);
    }
    prevStart.setHours(0, 0, 0, 0);

    return trades.filter(function(t) {
      return t.trade_date && new Date(t.trade_date) >= prevStart && new Date(t.trade_date) < prevEnd;
    });
  }

  function calcTrend(current, previous) {
    if (previous === 0) return { percent: 0, isPositive: current >= 0 };
    var percent = ((current - previous) / Math.abs(previous)) * 100;
    return { percent: Math.abs(percent).toFixed(1), isPositive: percent >= 0 };
  }

  function updateTrend(elementId, trend) {
    var el = safeEl(elementId);
    if (!el) return;
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
    var avgLoss = lossPnLs.length ? Math.abs(lossPnLs.reduce(function(a, b) { return a + b; }, 0) / lossPnLs.length) : 0;
    var profitFactor = avgLoss ? (winPnLs.reduce(function(a, b) { return a + b; }, 0) / Math.abs(lossPnLs.reduce(function(a, b) { return a + b; }, 0))) : 0;

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

    var progressPercent = Math.min(100, (totalPnL / monthlyTarget) * 100);

    var isDesktop = window.innerWidth >= 960;
    var useAnimation = animate && isDesktop;

    animateNumber('stat-total', total, false, false, 0, useAnimation);
    animateNumber('stat-pnl', totalPnL, true, false, 150, useAnimation);
    animateNumber('stat-wins', wins, false, false, 300, useAnimation);
    animateNumber('stat-losses', losses, false, false, 450, useAnimation);
    animateNumber('stat-winrate', wr, false, true, 600, useAnimation);

    var avgWinEl = safeEl('kpi-avg-win');
    if (avgWinEl) avgWinEl.textContent = formatCurrency(avgWin);
    var avgLossEl = safeEl('kpi-avg-loss');
    if (avgLossEl) avgLossEl.textContent = formatCurrency(avgLoss);
    var pfEl = safeEl('kpi-pf');
    if (pfEl) pfEl.textContent = profitFactor.toFixed(2);
    var ddEl = safeEl('kpi-dd');
    if (ddEl) ddEl.textContent = formatCurrency(maxDrawdown);
    var rrEl = safeEl('kpi-rr');
    if (rrEl) rrEl.textContent = avgRR.toFixed(2);
    var goalPercentEl = safeEl('goal-percent');
    if (goalPercentEl) goalPercentEl.textContent = Math.floor(progressPercent) + '%';
    var goalProgressEl = safeEl('goal-progress');
    if (goalProgressEl) goalProgressEl.style.width = progressPercent + '%';

    if (previousTrades) {
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

      // ⭐ FİX 1.3: trend-losses invert
      var lossTrend = calcTrend(losses, prevLosses);
      lossTrend.isPositive = !lossTrend.isPositive;
      updateTrend('trend-losses', lossTrend);
    }

    var wrEl = safeEl('stat-winrate');
    if (wrEl) wrEl.style.color = wr >= 50 ? 'var(--green)' : 'var(--red)';

    var pnlEl = safeEl('stat-pnl');
    if (pnlEl) {
      if (totalPnL >= 0) {
        pnlEl.classList.add('positive');
        pnlEl.classList.remove('negative');
      } else {
        pnlEl.classList.add('negative');
        pnlEl.classList.remove('positive');
      }
    }

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
      container.innerHTML = '<p style="color:var(--muted);font-size:11px;">' + noText + '</p>';
      if (bestWorstEl) bestWorstEl.style.display = 'none';
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
      container.innerHTML = '<p style="color:var(--muted);font-size:11px;">' + noFound + '</p>';
      if (bestWorstEl) bestWorstEl.style.display = 'none';
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

  // ⭐ FİX 1.4: renderRecentTrades - not tam metin
  async function renderRecentTrades(trades) {
    var container = safeEl('recent-trades-container');
    if (!container) return;

    if (!trades || !trades.length) {
      var noText = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('dashboard.no_trades') : 'Henüz işlem yok.';
      container.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem;">' + noText + ' <a href="/add-trade.html" style="color:var(--accent);">İlk işlemi ekle →</a></p>';
      return;
    }

    var maxPnL = 1;
    try {
      maxPnL = Math.max.apply(null, trades.map(function(t) { return Math.abs(calcTradePnL(t)); }));
      if (!maxPnL) maxPnL = 1;
    } catch (e) { maxPnL = 1; }

    var recent = trades.slice(-10).reverse();
    var strategiesMap = {};
    if (typeof window.getStrategiesMap === 'function') {
      strategiesMap = await window.getStrategiesMap();
    }

    var html = '<div class="trade-list">';
    recent.forEach(function(t) {
      var pnl = calcTradePnL(t);
      var pnlPercent = Math.min(100, (Math.abs(pnl) / maxPnL) * 100);
      var isLong = t.direction === 'LONG' || t.direction === 'BUY';
      var tradeDate = new Date(t.trade_date);
      var monthNames = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
      var monthShort = monthNames[tradeDate.getMonth()] || '';
      var formattedDate = tradeDate.getDate() + ' ' + monthShort + ' ' + tradeDate.getHours().toString().padStart(2, '0') + ':' + tradeDate.getMinutes().toString().padStart(2, '0');
      var strategyName = t.strategy_id ? (strategiesMap[t.strategy_id] || '—') : '—';
      var hasNote = t.notes && t.notes.trim().length > 0;
      // ⭐ FİX 1.4: notePreview sadece liste satırı için
      var notePreview = hasNote ? (t.notes.length > 60 ? t.notes.substring(0, 57) + '...' : t.notes) : '';
      // ⭐ FİX 1.4: tam metin
      var fullNote = hasNote ? t.notes : '';

      var safeSymbol = sanitizeHTML(t.symbol || '—');
      var safeStrategy = sanitizeHTML(strategyName);
      var safeNotePreviewAttr = escapeAttr(notePreview);
      var safeNotesAttr = escapeAttr(fullNote);
      var safeFullNoteHtml = sanitizeHTML(fullNote);

      html += '\n        <div class="trade-row" data-trade-id="' + t.id + '" data-notes="' + safeNotesAttr + '" data-note-preview="' + safeNotePreviewAttr + '" data-has-note="' + hasNote + '">\n          <div class="trade-icon ' + (isLong ? 'long' : 'short') + '">' + (isLong ? 'L' : 'S') + '</div>\n          <div class="trade-symbol">' + safeSymbol + '</div>\n          <div class="trade-direction ' + (isLong ? 'long' : 'short') + '">' + (isLong ? 'LONG' : 'SHORT') + '</div>\n          <div class="trade-strategy" title="' + safeStrategy + '">' + (safeStrategy.length > 12 ? safeStrategy.slice(0, 10) + '..' : safeStrategy) + '</div>\n          <div class="trade-bar-container">\n            <div class="trade-bar ' + (pnl >= 0 ? 'positive' : 'negative') + '" style="width: ' + pnlPercent + '%"></div>\n          </div>\n          <div class="trade-pnl ' + (pnl >= 0 ? 'positive' : 'negative') + '">' + formatCurrency(pnl) + '</div>\n          <div class="trade-date">' + formattedDate + '</div>\n          ' + (hasNote ? '<div class="trade-note-indicator" title="Notu göster">\n            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">\n              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>\n              <polyline points="14 2 14 8 20 8"/>\n              <line x1="16" y1="13" x2="8" y2="13"/>\n              <line x1="16" y1="17" x2="8" y2="17"/>\n              <polyline points="10 9 9 9 8 9"/>\n            </svg>\n          </div>' : '<div style="width:24px;"></div>') + '\n        </div>\n        <div class="trade-note" id="note-' + t.id + '">\n          ' + (hasNote ? safeFullNoteHtml : 'Not yok') + '\n        </div>\n      ';
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

  function renderStreak(trades) {
    var container = safeEl('streak-dots');
    if (!container) return;
    var streakCountEl = safeEl('streak-count');
    var streakLabelEl = safeEl('streak-label');

    var last20 = trades.slice(-20).reverse();
    var streak = 0;
    var streakType = null;

    for (var i = 0; i < last20.length; i++) {
      var pnl = calcTradePnL(last20[i]);
      if (last20[i].exit_price) {
        var isWin = pnl > 0;
        if (streakType === null) { streakType = isWin; streak = 1; } else if (streakType === isWin) streak++;
        else break;
      }
    }

    var dots = last20.slice(0, 20).map(function(t) {
      if (!t.exit_price) return '<div class="streak-dot open"></div>';
      var pnl = calcTradePnL(t);
      return '<div class="streak-dot ' + (pnl > 0 ? 'win' : 'loss') + '"></div>';
    }).join('');

    container.innerHTML = dots;
    if (streakCountEl) streakCountEl.textContent = streak;
    if (streakLabelEl) {
      if (streakType === true) {
        streakLabelEl.textContent = streak + ' Kazanma Serisi';
      } else if (streakType === false) {
        streakLabelEl.textContent = streak + ' Kaybetme Serisi';
      } else {
        streakLabelEl.textContent = 'İşlem Yok';
      }
    }
  }

  // ============================================================
  // MINI CALENDAR
  // ============================================================

  var miniCalendarTrades = [];

  // ⭐ FİX 1.6: renderMiniCalendar - localDateStr kullan
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

    // ⭐ FİX 4.4: mini-cal-week-label güncelle
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
      // ⭐ FİX 1.6: toISOString yerine localDateStr
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
  // CHART FUNCTIONS
  // ============================================================

  function destroyAllCharts() {
    var chartIds = ['chart-cumulative', 'chart-winloss', 'chart-daily', 'chart-symbol', 'chart-direction'];
    chartIds.forEach(function(id) {
      if (charts[id]) {
        try { charts[id].destroy(); } catch (e) { }
        delete charts[id];
      }
    });
    chartsInitialized = false;
  }

  // ⭐ FİX 1.7: updateCharts - Win/Loss açık kaldırıldı
  function updateCharts(trades) {
    if (!trades || !trades.length) {
      destroyAllCharts();
      return;
    }
    if (!chartsInitialized) {
      renderCharts(trades);
      return;
    }

    var cum = 0;
    var cumLabels = [], cumData = [], cumColors = [];
    trades.forEach(function(t) {
      var pnl = calcTradePnL(t);
      cum += pnl;
      cumLabels.push(smartDateLabel(t.trade_date));
      cumData.push(cum);
      cumColors.push(cum >= 0 ? '#22c55e' : '#ef4444');
    });

    if (charts['chart-cumulative']) {
      charts['chart-cumulative'].data.labels = cumLabels;
      charts['chart-cumulative'].data.datasets[0].data = cumData;
      charts['chart-cumulative'].data.datasets[0].pointBackgroundColor = cumColors;
      charts['chart-cumulative'].update();
    }

    // ⭐ FİX 1.7: Win/Loss - SADECE KAPALI İŞLEMLER
    var wins = 0, losses = 0;
    var closedTrades = trades.filter(function(t) { return t.exit_price; });
    closedTrades.forEach(function(t) {
      if (calcTradePnL(t) > 0) wins++;
      else losses++;
    });
    if (charts['chart-winloss']) {
      charts['chart-winloss'].data.datasets[0].data = [wins, losses];
      charts['chart-winloss'].update();
    }

    // ⭐ FİX 1.6: days haritasında localDateStr kullan
    var days = {};
    var now = new Date();
    for (var i = 29; i >= 0; i--) {
      var d = new Date(now);
      d.setDate(d.getDate() - i);
      days[localDateStr(d)] = 0;
    }
    trades.forEach(function(t) {
      if (t.exit_price && days[t.trade_date] !== undefined) days[t.trade_date] += calcTradePnL(t);
    });
    var dailyLabels = Object.keys(days).map(function(d) {
      var dt = new Date(d);
      return dt.getDate() + '/' + (dt.getMonth() + 1);
    });
    var dailyData = Object.values(days);
    if (charts['chart-daily']) {
      charts['chart-daily'].data.labels = dailyLabels;
      charts['chart-daily'].data.datasets[0].data = dailyData;
      charts['chart-daily'].data.datasets[0].backgroundColor = dailyData.map(function(v) { return v >= 0 ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)'; });
      charts['chart-daily'].update();
    }

    var symbolMap = {};
    trades.forEach(function(t) {
      if (t.exit_price) symbolMap[t.symbol] = (symbolMap[t.symbol] || 0) + calcTradePnL(t);
    });
    var sortedSymbols = Object.entries(symbolMap).sort(function(a, b) { return Math.abs(b[1]) - Math.abs(a[1]); }).slice(0, 8);
    if (charts['chart-symbol']) {
      charts['chart-symbol'].data.labels = sortedSymbols.map(function(s) { return s[0]; });
      charts['chart-symbol'].data.datasets[0].data = sortedSymbols.map(function(s) { return s[1]; });
      charts['chart-symbol'].data.datasets[0].backgroundColor = sortedSymbols.map(function(s) { return s[1] >= 0 ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)'; });
      charts['chart-symbol'].update();
    }

    var longs = 0, shorts = 0;
    trades.forEach(function(t) {
      if (t.direction === 'LONG' || t.direction === 'BUY') longs++;
      else shorts++;
    });
    if (charts['chart-direction']) {
      charts['chart-direction'].data.datasets[0].data = [longs, shorts];
      charts['chart-direction'].update();
    }

    var firstPnL = cumData[0] || 0;
    var lastPnL = cumData[cumData.length - 1] || 0;
    var changePercent = firstPnL !== 0 ? ((lastPnL - firstPnL) / Math.abs(firstPnL) * 100).toFixed(1) : 0;
    var changeEl = safeEl('cumulative-change');
    if (changeEl) {
      changeEl.textContent = (lastPnL >= firstPnL ? '↑' : '↓') + ' ' + Math.abs(changePercent) + '%';
      changeEl.className = 'chart-badge ' + (lastPnL >= firstPnL ? '' : 'negative');
    }
  }

  // ⭐ FİX 1.7: renderCharts - Win/Loss açık kaldırıldı
  function renderCharts(trades) {
    if (!isPageVisible) return;
    if (!trades || !trades.length) {
      destroyAllCharts();
      return;
    }

    if (chartsBusy) return;
    chartsBusy = true;

    try {
      // Canvas görünürlük kontrolü
      var canvasIds = ['chart-cumulative', 'chart-winloss', 'chart-daily', 'chart-symbol', 'chart-direction'];
      var allVisible = true;
      for (var c = 0; c < canvasIds.length; c++) {
        var canvasEl = safeEl(canvasIds[c]);
        if (canvasEl) {
          var rect = canvasEl.getBoundingClientRect();
          var isInViewport = rect.width > 0 && rect.height > 0;
          if (!isInViewport) {
            allVisible = false;
            break;
          }
        }
      }

      if (!allVisible) {
        setTimeout(function() {
          if (!chartsBusy) {
            renderCharts(trades);
          }
        }, 200);
        return;
      }

      destroyAllCharts();

      var isMobile = window.innerWidth < 768;
      var isTablet = window.innerWidth < 1024;

      var tooltipConfig = {
        enabled: true,
        mode: 'index',
        intersect: false,
        animation: { duration: 200, easing: 'easeOutQuart' },
        animations: {
          opacity: {
            duration: 200,
            easing: 'easeOutQuart'
          }
        },
        backgroundColor: 'rgba(10,10,15,0.92)',
        borderColor: 'rgba(139,92,246,0.25)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        titleFont: { family: "'DM Sans', sans-serif", size: 12, weight: '600' },
        bodyFont: { family: "'DM Mono', monospace", size: 11 },
        bodySpacing: 4,
        titleColor: '#e8e8f0',
        bodyColor: '#b8b8c8'
      };

      var interactionConfig = {
        mode: 'index',
        intersect: false,
      };

      // Cumulative Chart
      var cum = 0;
      var cumLabels = [], cumData = [], cumColors = [];
      trades.forEach(function(t) {
        var pnl = calcTradePnL(t);
        cum += pnl;
        cumLabels.push(smartDateLabel(t.trade_date));
        cumData.push(cum);
        cumColors.push(cum >= 0 ? '#22c55e' : '#ef4444');
      });

      if (cumData.length === 0) {
        return;
      }

      var firstPnL = cumData[0] || 0;
      var lastPnL = cumData[cumData.length - 1] || 0;
      var changePercent = firstPnL !== 0 ? ((lastPnL - firstPnL) / Math.abs(firstPnL) * 100).toFixed(1) : 0;
      var changeEl = safeEl('cumulative-change');
      if (changeEl) {
        changeEl.textContent = (lastPnL >= firstPnL ? '↑' : '↓') + ' ' + Math.abs(changePercent) + '%';
        changeEl.className = 'chart-badge ' + (lastPnL >= firstPnL ? '' : 'negative');
      }

      var totalPoints = cumLabels.length;
      var maxTicks;
      if (isMobile) maxTicks = Math.min(4, totalPoints);
      else if (isTablet) maxTicks = Math.min(6, totalPoints);
      else maxTicks = Math.min(10, totalPoints);

      var pointRadius = totalPoints > 50 ? 0 : (totalPoints > 20 ? 1.5 : 3);
      var pointHoverRadius = totalPoints > 50 ? 4 : (totalPoints > 20 ? 5 : 6);

      var ctx1 = safeEl('chart-cumulative');
      if (ctx1 && typeof Chart !== 'undefined') {
        var existing1 = Chart.getChart ? Chart.getChart(ctx1) : null;
        if (existing1) { try { existing1.destroy(); } catch (e) {} }

        charts['chart-cumulative'] = new Chart(ctx1, {
          type: 'line',
          data: {
            labels: cumLabels,
            datasets: [{
              data: cumData,
              borderColor: '#8b5cf6',
              backgroundColor: 'rgba(139,92,246,0.08)',
              fill: true,
              tension: 0.3,
              pointRadius: pointRadius,
              pointHoverRadius: pointHoverRadius,
              pointBackgroundColor: cumColors,
              borderWidth: 2,
              hoverBorderWidth: 3
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: isMobile ? 300 : 500 },
            interaction: interactionConfig,
            plugins: {
              legend: { display: false },
              tooltip: {
                ...tooltipConfig,
                callbacks: {
                  title: function(items) {
                    var idx = items[0].dataIndex;
                    var t = trades[idx];
                    if (!t || !t.trade_date) return items[0].label;
                    var d = new Date(t.trade_date);
                    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
                  },
                  label: function(item) {
                    var val = item.raw;
                    var sign = val >= 0 ? '+' : '';
                    return 'K/Z: ' + sign + formatCurrency(val);
                  }
                }
              }
            },
            scales: {
              x: {
                ticks: { font: { size: isMobile ? 9 : 10, weight: '500' }, maxRotation: 0, autoSkip: true, maxTicksLimit: maxTicks },
                grid: { display: !isMobile }
              },
              y: {
                ticks: { font: { size: isMobile ? 9 : 11, weight: '500' }, maxTicksLimit: isMobile ? 4 : 6, callback: function(v) { return formatCurrency(v); } }
              }
            }
          }
        });
      }

      // ⭐ FİX 1.7: Win/Loss Doughnut - SADECE KAPALI İŞLEMLER
      var wins = 0, losses = 0;
      var closedTrades = trades.filter(function(t) { return t.exit_price; });
      closedTrades.forEach(function(t) {
        if (calcTradePnL(t) > 0) wins++;
        else losses++;
      });
      var ctx2 = safeEl('chart-winloss');
      if (ctx2 && typeof Chart !== 'undefined') {
        var existing2 = Chart.getChart ? Chart.getChart(ctx2) : null;
        if (existing2) { try { existing2.destroy(); } catch (e) {} }

        charts['chart-winloss'] = new Chart(ctx2, {
          type: 'doughnut',
          data: {
            labels: ['Kazanan', 'Kaybeden'],
            datasets: [{
              data: [wins, losses],
              backgroundColor: ['#22c55e', '#ef4444'],
              borderWidth: 2,
              borderColor: 'rgba(10,10,15,0.5)',
              hoverOffset: 8,
              cutout: '68%'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: isMobile ? 200 : 400 },
            interaction: interactionConfig,
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  font: { size: 11, weight: '500' },
                  boxWidth: 12,
                  padding: 10,
                  color: document.body.classList.contains('light-theme') ? '#1e293b' : '#e8e8f0'
                }
              },
              tooltip: {
                ...tooltipConfig,
                callbacks: {
                  label: function(item) {
                    var total = item.dataset.data.reduce(function(a, b) { return a + b; }, 0);
                    var percent = total > 0 ? ((item.raw / total) * 100).toFixed(1) : 0;
                    return item.label + ': ' + item.raw + ' (' + percent + '%)';
                  }
                }
              }
            }
          }
        });
      }

      // ⭐ FİX 1.6: Daily Chart - localDateStr kullan
      var days = {};
      var now = new Date();
      for (var i = 29; i >= 0; i--) {
        var d = new Date(now);
        d.setDate(d.getDate() - i);
        days[localDateStr(d)] = 0;
      }
      trades.forEach(function(t) {
        if (t.exit_price && days[t.trade_date] !== undefined) days[t.trade_date] += calcTradePnL(t);
      });
      var dailyLabels = Object.keys(days).map(function(d) {
        var dt = new Date(d);
        return dt.getDate() + '/' + (dt.getMonth() + 1);
      });
      var dailyData = Object.values(days);
      var ctx3 = safeEl('chart-daily');
      if (ctx3 && typeof Chart !== 'undefined') {
        var existing3 = Chart.getChart ? Chart.getChart(ctx3) : null;
        if (existing3) { try { existing3.destroy(); } catch (e) {} }

        charts['chart-daily'] = new Chart(ctx3, {
          type: 'bar',
          data: {
            labels: dailyLabels,
            datasets: [{
              data: dailyData,
              backgroundColor: dailyData.map(function(v) { return v >= 0 ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)'; }),
              borderColor: dailyData.map(function(v) { return v >= 0 ? '#22c55e' : '#ef4444'; }),
              borderWidth: 1,
              hoverBackgroundColor: dailyData.map(function(v) { return v >= 0 ? 'rgba(34,197,94,0.9)' : 'rgba(239,68,68,0.9)'; }),
              borderRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: isMobile ? 200 : 400 },
            interaction: interactionConfig,
            plugins: {
              legend: { display: false },
              tooltip: {
                ...tooltipConfig,
                callbacks: {
                  label: function(item) {
                    var val = item.raw;
                    var sign = val >= 0 ? '+' : '';
                    return 'K/Z: ' + sign + formatCurrency(val);
                  }
                }
              }
            },
            scales: {
              x: {
                ticks: { font: { size: 10, weight: '500' }, maxRotation: 45, autoSkip: true, maxTicksLimit: 6 }
              },
              y: {
                ticks: { font: { size: 11, weight: '500' }, callback: function(v) { return formatCurrency(v); } }
              }
            }
          }
        });
      }

      // Symbol Chart
      var symbolMap = {};
      trades.forEach(function(t) {
        if (t.exit_price) symbolMap[t.symbol] = (symbolMap[t.symbol] || 0) + calcTradePnL(t);
      });
      var sortedSymbols = Object.entries(symbolMap).sort(function(a, b) { return Math.abs(b[1]) - Math.abs(a[1]); }).slice(0, 8);
      var ctx4 = safeEl('chart-symbol');
      if (ctx4 && typeof Chart !== 'undefined') {
        var existing4 = Chart.getChart ? Chart.getChart(ctx4) : null;
        if (existing4) { try { existing4.destroy(); } catch (e) {} }

        charts['chart-symbol'] = new Chart(ctx4, {
          type: 'bar',
          data: {
            labels: sortedSymbols.map(function(s) { return s[0]; }),
            datasets: [{
              data: sortedSymbols.map(function(s) { return s[1]; }),
              backgroundColor: sortedSymbols.map(function(s) { return s[1] >= 0 ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)'; }),
              borderColor: sortedSymbols.map(function(s) { return s[1] >= 0 ? '#22c55e' : '#ef4444'; }),
              borderWidth: 1,
              hoverBackgroundColor: sortedSymbols.map(function(s) { return s[1] >= 0 ? 'rgba(34,197,94,0.9)' : 'rgba(239,68,68,0.9)'; }),
              borderRadius: 4
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: isMobile ? 200 : 400 },
            interaction: interactionConfig,
            plugins: {
              legend: { display: false },
              tooltip: {
                ...tooltipConfig,
                callbacks: {
                  label: function(item) {
                    var val = item.raw;
                    var sign = val >= 0 ? '+' : '';
                    return item.label + ': ' + sign + formatCurrency(val);
                  }
                }
              }
            },
            scales: {
              x: {
                ticks: { font: { size: 11, weight: '500' }, callback: function(v) { return formatCurrency(v); } }
              },
              y: {
                ticks: { font: { size: 11, weight: '500' } }
              }
            }
          }
        });
      }

      // Direction Chart
      var longs = 0, shorts = 0;
      trades.forEach(function(t) {
        if (t.direction === 'LONG' || t.direction === 'BUY') longs++;
        else shorts++;
      });
      var ctx5 = safeEl('chart-direction');
      if (ctx5 && typeof Chart !== 'undefined') {
        var existing5 = Chart.getChart ? Chart.getChart(ctx5) : null;
        if (existing5) { try { existing5.destroy(); } catch (e) {} }

        charts['chart-direction'] = new Chart(ctx5, {
          type: 'doughnut',
          data: {
            labels: ['Long', 'Short'],
            datasets: [{
              data: [longs, shorts],
              backgroundColor: ['#8b5cf6', '#f97316'],
              borderWidth: 2,
              borderColor: 'rgba(10,10,15,0.5)',
              hoverOffset: 8,
              cutout: '68%'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: isMobile ? 200 : 400 },
            interaction: interactionConfig,
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  font: { size: 11, weight: '500' },
                  boxWidth: 12,
                  padding: 10,
                  color: document.body.classList.contains('light-theme') ? '#1e293b' : '#e8e8f0'
                }
              },
              tooltip: {
                ...tooltipConfig,
                callbacks: {
                  label: function(item) {
                    var total = item.dataset.data.reduce(function(a, b) { return a + b; }, 0);
                    var percent = total > 0 ? ((item.raw / total) * 100).toFixed(1) : 0;
                    return item.label + ': ' + item.raw + ' (' + percent + '%)';
                  }
                }
              }
            }
          }
        });
      }

      chartsInitialized = true;
      chartsRenderedOnce = true;
    } finally {
      chartsBusy = false;
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
        year: isTurkish ? 'Bu Yil' : (isGerman ? 'Dieses Jahr' : 'This Year')
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
  // ⭐ FİX 2.1: REFRESH FUNCTION - SIRALAMA + TOKEN
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

      var streakContainer = safeEl('streak-dots');
      if (streakContainer) {
        renderStreak(filtered);
      }

      await renderStrategyTags(filtered);

      if (myToken !== refreshToken) return;

      loadMiniCalendar(allTrades);

      try {
        await updatePlanBadge();
      } catch (e) {}

      // ⭐ SIRALAMA DEĞİŞTİ: hideSkeletons ÖNCE, renderCharts SONRA
      hideSkeletons();

      if (myToken !== refreshToken) return;

      if (filtered.length > 0) {
        chartsRenderedOnce = false;
        chartsInitialized = false;
        destroyAllCharts();

        if (chartRafId) cancelAnimationFrame(chartRafId);
        chartRafId = requestAnimationFrame(function() {
          chartRafId = null;
          if (myToken !== refreshToken) return;
          renderCharts(filtered);
        });
      } else {
        destroyAllCharts();
        var chartContainers = document.querySelectorAll('.chart-wrap');
        chartContainers.forEach(function(container) {
          var canvas = container.querySelector('canvas');
          if (canvas) {
            var parent = canvas.parentElement;
            if (parent) {
              parent.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:11px;font-family:\'DM Sans\',sans-serif;">Bu aralıkta işlem yok</div>';
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
  // ⭐ FİX 1.2: LOAD TRADES - ascending:false + reverse
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
  // ⭐ FİX 1.5: INIT DASHBOARD - DOM sorguları burada yapılıyor
  // ============================================================

  async function initDashboard() {
    try {
      // ⭐ FİX 1.5: DOM sorguları burada yapılıyor
      dateFilterOptions = document.querySelectorAll('.date-filter-option');
      exportCsvBtn = safeEl('export-csv');
      exportPdfBtn = safeEl('export-pdf');
      welcomeMsg = safeEl('welcome-msg');

      showSkeletons();

      try {
        setChartTheme();
      } catch (e) {}

      try {
        var themeObserver = new MutationObserver(function(mutations) {
          mutations.forEach(function(mutation) {
            if (mutation.attributeName === 'class') {
              setChartTheme();
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
            updateCharts(filterByDate(allTrades, currentRange));
          }
        }
      });

      loadMonthlyTarget();

      if (typeof requireAuth !== 'function') {
        console.warn('⚠️ requireAuth fonksiyonu bulunamadı');
        hideSkeletons();
        return;
      }

      var user = await requireAuth();
      if (!user) {
        hideSkeletons();
        return;
      }

      currentUsername = (user.user_metadata && user.user_metadata.username) || user.email.split('@')[0];
      if (welcomeMsg) {
        if (typeof i18n !== 'undefined' && i18n.t) {
          welcomeMsg.innerHTML = i18n.t('dashboard.welcome', { username: currentUsername });
        } else {
          welcomeMsg.innerHTML = 'Hoş geldin, ' + currentUsername + '!';
        }
      }

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

      if (dateFilterOptions) {
        dateFilterOptions.forEach(function(option) {
          option.addEventListener('click', function() {
            dateFilterOptions.forEach(function(opt) { opt.classList.remove('active'); });
            this.classList.add('active');
            currentRange = this.dataset.range;
            refresh();
          });
        });
      }

      if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportCSV);

      if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', function(e) {
          e.preventDefault();
          var lang = 'en';
          if (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) {
            lang = i18n.getCurrentLanguage();
          }
          generatePDF(lang);
        });
      }

      setupGoalModal();

      if (typeof i18n !== 'undefined' && i18n.onChange) {
        i18n.onChange(function() {
          if (currentUsername && welcomeMsg) {
            welcomeMsg.innerHTML = i18n.t('dashboard.welcome', { username: currentUsername });
          }
          renderMiniCalendar();
          refresh();
        });
      }

      await refresh();

    } catch (e) {
      console.error('Dashboard init error:', e);
      hideSkeletons();
    }
  }

  // ============================================================
  // DOM READY
  // ============================================================

  document.addEventListener('DOMContentLoaded', function() {
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
  });

})();