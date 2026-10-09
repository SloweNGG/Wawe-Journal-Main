// ============================================================
// STRATEGIES.JS - STRATEJİ SAYFASI ÖZEL FONKSİYONLAR
// ⭐ MIGRATE: Chart.js → ApexCharts
//    - Sparkline: ApexCharts line (sparkline mode)
//    - Comparison: ApexCharts bar (distributed colors)
//    - Equity Curve: ApexCharts area
//    - Tema desteği (light/dark) tüm grafiklerde
// ⭐ i18n: Tüm hardcoded metinler i18n.t() çağrılarına dönüştürüldü
//    (plan badge, add/edit modalları, detay modal, CSV/PDF export,
//     toast mesajları, tablo başlıkları).
// ============================================================

wwLog.log('📊 strategies.js yükleniyor...');

// ============================================================
// ⭐ TEMA KONTROLÜ
// ============================================================

(function initTheme() {
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
    } catch(e) {}
  }

  wwLog.log('🎨 [strategies.js] Tema ayarlandı:', savedTheme || 'dark');
})();

// ============================================================
// TEMA DEĞİŞİMİNİ DİNLE
// ⭐ DEĞİŞİKLİK: ApexCharts instance'larını yeniden render etmek yerine
//    sadece tema değişkenleri güncellenir. Grafikler orijinal tema ile kalır.
//    (Kullanıcı isteği: "tema değişince grafikler yeniden render EDİLMEZ")
// ============================================================

(function listenThemeChanges() {
  wwLog.log('🎨 [Strategies] Tema izleyici başlatıldı...');

  function applyThemeFromStorage() {
    var savedTheme = localStorage.getItem('ww_theme');
    var isLight = savedTheme === 'light';
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
      } catch(e) {}
    }
  }

  window.addEventListener('storage', function(e) {
    if (e.key === 'ww_theme') {
      wwLog.log('🔄 [Strategies] Tema değişikliği algılandı:', e.newValue);
      applyThemeFromStorage();
      // ⭐ Grafikler yeniden render EDİLMEZ
    }
  });

  document.addEventListener('themeChanged', function(e) {
    wwLog.log('🔄 [Strategies] ThemeChanged event yakalandı');
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
    // ⭐ Grafikler yeniden render EDİLMEZ
  });

  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
      var savedTheme = localStorage.getItem('ww_theme');
      var isLight = savedTheme === 'light';
      document.body.classList.toggle('light-theme', isLight);
      // ⭐ Grafikler yeniden render EDİLMEZ
    }
  });

  wwLog.log('✅ [Strategies] Tema izleyici yüklendi!');
})();

// ============================================================
// APEXCHARTS TEMA YARDIMCISI
// ============================================================
function getStrategiesApexTheme() {
  var isLight = document.body.classList.contains('light-theme');
  return {
    mode: isLight ? 'light' : 'dark',
    textColor: isLight ? '#475569' : '#e8e8f0',
    gridColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)'
  };
}

// ============================================================
// GÜVENLİK: HTML SANITIZE
// ============================================================
function sanitizeHTML(str) {
  if (!str) return '';
  var temp = document.createElement('div');
  temp.textContent = str;
  return temp.innerHTML;
}

// ============================================================
// GLOBAL DEĞİŞKENLER
// ============================================================
var currentUser = null;
var strategiesList = [];
var allTradesForStats = [];
var sparkCharts = {};
var currentTimeRange = 'all';
var equityChartInstance = null;
var currentDetailStrategyId = null;

// ⭐ PERFORMANS: Strateji verilerini cache'le
var strategyDataCache = {};
var strategyDataCacheTime = 0;
var STRATEGY_DATA_CACHE_TTL = 30000;

// ⭐ PERFORMANS: Tüm işlemleri strateji bazında grupla
var tradesByStrategy = {};

// ============================================================
// SKELETON GÖSTER/GİZLE
// ============================================================
function showStrategySkeleton() {
  var el1 = document.getElementById('summary-stats-skeleton');
  var el2 = document.getElementById('summary-stats-bar');
  var el3 = document.getElementById('strategies-grid-skeleton');
  var el4 = document.getElementById('strategies-list-container');
  var el5 = document.getElementById('comparison-skeleton');
  var el6 = document.getElementById('comparison-section');

  if (el1) el1.style.display = 'grid';
  if (el2) el2.style.display = 'none';
  if (el3) el3.style.display = 'grid';
  if (el4) el4.style.display = 'none';
  if (el5) el5.style.display = 'block';
  if (el6) el6.style.display = 'none';
}

function hideStrategySkeleton() {
  var el1 = document.getElementById('summary-stats-skeleton');
  var el2 = document.getElementById('summary-stats-bar');
  var el3 = document.getElementById('strategies-grid-skeleton');
  var el4 = document.getElementById('strategies-list-container');
  var el5 = document.getElementById('comparison-skeleton');
  var el6 = document.getElementById('comparison-section');

  if (el1) el1.style.display = 'none';
  if (el3) el3.style.display = 'none';
  if (el4) el4.style.display = 'block';
  if (el5) el5.style.display = 'none';

  if (strategiesList && strategiesList.length > 0) {
    if (el2) el2.style.display = 'grid';
    if (el6) el6.style.display = 'block';
  } else {
    if (el2) el2.style.display = 'none';
    if (el6) el6.style.display = 'none';
  }
}

// ============================================================
// NAVBAR AVATAR
// ============================================================
async function updateNavbarAvatar() {
  var userAvatar = document.getElementById('user-avatar');
  if (!userAvatar) return;
  try {
    var { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    var { data: profile } = await sb.from('user_profiles').select('avatar_url').eq('id', user.id).single();
    if (profile && profile.avatar_url) {
      userAvatar.innerHTML = '<img src="' + sanitizeHTML(profile.avatar_url) + '" alt="avatar">';
    } else {
      var initial = (user.user_metadata && user.user_metadata.username) ? user.user_metadata.username.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();
      userAvatar.textContent = initial;
    }
  } catch(e) {}
}

// ============================================================
// PLAN BADGE GÜNCELLEME
// ============================================================

// ⭐ DEĞİŞTİ: Plan rozeti sorumluluğu navbar.js'e taşındı (DRY + race fix)
async function updatePlanBadge() {
  if (typeof window.updateNavbarBadge === 'function') {
    await window.updateNavbarBadge();
  }
}

// ============================================================
// TRADE PNL YARDIMCI FONKSİYONLARI
// ============================================================
function getTradeMultiplier(t) {
  var mult = t.multiplier || 100000;
  if (typeof INSTRUMENT_MULTIPLIERS !== 'undefined' && INSTRUMENT_MULTIPLIERS[t.instrument]) {
    mult = t.multiplier || INSTRUMENT_MULTIPLIERS[t.instrument] || 100000;
  }
  return mult;
}

function getTradePnL(t) {
  try {
    return calcPnL(t.entry_price, t.exit_price, t.lot, t.direction, 'other', getTradeMultiplier(t));
  } catch(e) {
    return 0;
  }
}

// ============================================================
// i18n HELPER
// ============================================================
function _t(key, fallback) {
  if (typeof i18n !== 'undefined' && typeof i18n.t === 'function') {
    return i18n.t(key, fallback);
  }
  return fallback || key;
}

// ============================================================
// ZAMAN ARALIĞI FİLTRESİ (DASHBOARD İLE AYNI)
// ============================================================
window._stratCustomRangeStart = null;
window._stratCustomRangeEnd = null;

function filterTradesByRange(trades, range) {
  if (!range || range === 'all') return trades;
  if (range === 'custom' && window._stratCustomRangeStart && window._stratCustomRangeEnd) {
    var cStart = new Date(window._stratCustomRangeStart);
    cStart.setHours(0, 0, 0, 0);
    var cEnd = new Date(window._stratCustomRangeEnd);
    cEnd.setHours(23, 59, 59, 999);
    return trades.filter(function(t) {
      if (!t.trade_date) return false;
      var d = new Date(t.trade_date);
      return d >= cStart && d <= cEnd;
    });
  }
  var now = new Date();
  var start = new Date();
  if (range === 'week' || range === '7d') {
    start.setDate(now.getDate() - 7);
  } else if (range === 'month') {
    start.setDate(1);
  } else if (range === '30d') {
    start.setDate(now.getDate() - 30);
  } else if (range === '90d') {
    start.setDate(now.getDate() - 90);
  } else if (range === 'year') {
    start.setMonth(0, 1);
  }
  start.setHours(0, 0, 0, 0);
  return trades.filter(function(t) {
    if (!t.trade_date) return false;
    return new Date(t.trade_date) >= start;
  });
}

// ============================================================
// getStrategyPerformance
// ============================================================
function getStrategyPerformance(strategyId) {
  var now = Date.now();
  if (strategyDataCache[strategyId] && (now - strategyDataCacheTime) < STRATEGY_DATA_CACHE_TTL) {
    return strategyDataCache[strategyId];
  }

  try {
    var strategyTrades = tradesByStrategy[strategyId] || [];
    var filteredTrades = filterTradesByRange(strategyTrades, currentTimeRange);
    var closedTrades = filteredTrades.filter(function(t) { return t.exit_price; });
    var totalPnL = 0, wins = 0, losses = 0, openTrades = 0;
    var longCount = 0, shortCount = 0;

    filteredTrades.forEach(function(t) {
      var dir = (t.direction || '').toLowerCase();
      if (dir === 'long' || dir === 'buy') longCount++; else shortCount++;
      if (!t.exit_price) { openTrades++; return; }
      var pnl = getTradePnL(t);
      totalPnL += pnl;
      if (pnl > 0) wins++; else if (pnl < 0) losses++;
    });

    var total = closedTrades.length;
    var winRate = total > 0 ? parseFloat(((wins / total) * 100).toFixed(1)) : 0;

    var sorted = closedTrades.slice().sort(function(a, b) { return new Date(a.trade_date) - new Date(b.trade_date); });

    var cumulative = 0, peak = 0, maxDrawdown = 0;
    var grossProfit = 0, grossLoss = 0, winAmounts = [], lossAmounts = [];
    var curWinStreak = 0, curLossStreak = 0, maxWinStreak = 0, maxLossStreak = 0;
    var pnlSeries = [];
    var tradesDetail = [];
    var instrumentMap = {};

    sorted.forEach(function(t) {
      var pnl = getTradePnL(t);
      cumulative += pnl;
      pnlSeries.push(cumulative);
      if (cumulative > peak) peak = cumulative;
      var dd = peak - cumulative;
      if (dd > maxDrawdown) maxDrawdown = dd;

      if (pnl > 0) {
        grossProfit += pnl; winAmounts.push(pnl);
        curWinStreak++; curLossStreak = 0;
        if (curWinStreak > maxWinStreak) maxWinStreak = curWinStreak;
      } else if (pnl < 0) {
        grossLoss += Math.abs(pnl); lossAmounts.push(Math.abs(pnl));
        curLossStreak++; curWinStreak = 0;
        if (curLossStreak > maxLossStreak) maxLossStreak = curLossStreak;
      } else {
        curWinStreak = 0; curLossStreak = 0;
      }

      var instrumentKey = (t.instrument || 'Diğer');
      var symbolKey = (t.symbol || '—');
      var key = instrumentKey + ':' + symbolKey;

      if (!instrumentMap[key]) {
        instrumentMap[key] = {
          instrument: instrumentKey,
          symbol: symbolKey,
          trades: 0,
          wins: 0,
          pnl: 0,
          count: 0
        };
      }
      instrumentMap[key].trades++;
      instrumentMap[key].pnl += pnl;
      if (pnl > 0) instrumentMap[key].wins++;
      instrumentMap[key].count++;

      tradesDetail.push({
        trade_date: t.trade_date,
        instrument: t.instrument || '—',
        symbol: t.symbol || '—',
        direction: t.direction || '—',
        entry_price: t.entry_price,
        exit_price: t.exit_price,
        lot: t.lot,
        pnl: pnl
      });
    });

    var instrumentBreakdown = Object.keys(instrumentMap).map(function(k) {
      var d = instrumentMap[k];
      return {
        instrument: d.instrument,
        symbol: d.symbol,
        trades: d.trades,
        pnl: d.pnl,
        winRate: d.trades ? parseFloat(((d.wins / d.trades) * 100).toFixed(1)) : 0
      };
    }).sort(function(a, b) { return b.pnl - a.pnl; });

    var bestInstrument = instrumentBreakdown.length ? instrumentBreakdown[0] : null;
    var worstInstrument = instrumentBreakdown.length ? instrumentBreakdown[instrumentBreakdown.length - 1] : null;

    var profitFactor = grossLoss > 0 ? parseFloat((grossProfit / grossLoss).toFixed(2)) : (grossProfit > 0 ? null : 0);
    var avgWin = winAmounts.length ? grossProfit / winAmounts.length : 0;
    var avgLoss = lossAmounts.length ? grossLoss / lossAmounts.length : 0;
    var avgRR = avgLoss > 0 ? parseFloat((avgWin / avgLoss).toFixed(2)) : (avgWin > 0 ? null : 0);

    var result = {
      totalTrades: total,
      totalTradesWithOpen: filteredTrades.length,
      wins: wins,
      losses: losses,
      openTrades: openTrades,
      totalPnL: totalPnL,
      winRate: winRate,
      pnlSeries: pnlSeries,
      longCount: longCount,
      shortCount: shortCount,
      profitFactor: profitFactor,
      avgWin: avgWin,
      avgLoss: avgLoss,
      avgRR: avgRR,
      maxWinStreak: maxWinStreak,
      maxLossStreak: maxLossStreak,
      maxDrawdown: maxDrawdown,
      instrumentBreakdown: instrumentBreakdown,
      bestInstrument: bestInstrument,
      worstInstrument: worstInstrument,
      tradesDetail: tradesDetail
    };

    strategyDataCache[strategyId] = result;
    strategyDataCacheTime = now;

    return result;
  } catch(e) {
    return {
      totalTrades: 0, totalTradesWithOpen: 0, wins: 0, losses: 0, openTrades: 0, totalPnL: 0, winRate: 0,
      pnlSeries: [], longCount: 0, shortCount: 0, profitFactor: 0, avgWin: 0, avgLoss: 0, avgRR: 0,
      maxWinStreak: 0, maxLossStreak: 0, maxDrawdown: 0, instrumentBreakdown: [], bestInstrument: null,
      worstInstrument: null, tradesDetail: []
    };
  }
}

// ============================================================
// FORMATLAMA FONKSİYONLARI
// ============================================================
function formatCurrencyFixed(value) {
  var num = parseFloat(value) || 0;
  var currency = typeof getCurrencySymbol === 'function' ? getCurrencySymbol() : '$';
  var formatted = Math.abs(num).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (num < 0) {
    return '-' + currency + formatted;
  }
  return currency + formatted;
}

var formatCurrencySafe = (typeof formatCurrency === 'function') ? formatCurrency : formatCurrencyFixed;

function fmtDate(dateStr) {
  try {
    var d = new Date(dateStr);
    return d.toLocaleDateString('tr-TR');
  } catch(e) { return dateStr || '—'; }
}

// ============================================================
// APEXCHARTS READY HELPER (Non-blocking)
// ============================================================
var _apexReadyCallbacks = [];
var _apexReadyPoller = null;

function whenApexReady(callback) {
  if (typeof window.ApexCharts !== 'undefined') {
    callback();
    return;
  }
  _apexReadyCallbacks.push(callback);
  if (!_apexReadyPoller) {
    var attempts = 0;
    _apexReadyPoller = setInterval(function() {
      attempts++;
      if (typeof window.ApexCharts !== 'undefined') {
        clearInterval(_apexReadyPoller);
        _apexReadyPoller = null;
        var cbs = _apexReadyCallbacks.slice();
        _apexReadyCallbacks = [];
        cbs.forEach(function(cb) {
          try { cb(); } catch(e) { console.error('whenApexReady callback error:', e); }
        });
      } else if (attempts >= 150) {
        clearInterval(_apexReadyPoller);
        _apexReadyPoller = null;
      }
    }, 30);
  }
}

// ============================================================
// DRAW SPARKLINE - ApexCharts
// ============================================================
function drawSparkline(containerId, data, color) {
  whenApexReady(function() {
    try {
      var container = document.getElementById(containerId);
      if (!container) return;
      if (sparkCharts[containerId]) {
        try { sparkCharts[containerId].destroy(); } catch(e) {}
        sparkCharts[containerId] = null;
      }
      container.innerHTML = '';

      var plotData = (data && data.length === 1) ? [0, data[0]] : (data || []);
      if (!plotData.length) return;

      var isNeg = plotData[plotData.length - 1] < 0;
      var lineColor = isNeg ? '#ef4444' : (color || '#8b5cf6');

      var options = {
        series: [{ name: 'Equity', data: plotData }],
        chart: {
          type: 'area',
          height: 42,
          sparkline: { enabled: true },
          animations: { enabled: true, speed: 500 },
          background: 'transparent',
          toolbar: { show: false }
        },
        stroke: {
          curve: 'smooth',
          width: 2,
          colors: [lineColor]
        },
        fill: {
          type: 'gradient',
          gradient: {
            shadeIntensity: 1,
            opacityFrom: 0.38,
            opacityTo: 0.02,
            stops: [0, 100]
          }
        },
        colors: [lineColor],
        markers: { size: 0 },
        tooltip: { enabled: false },
        grid: { show: false }
      };

      sparkCharts[containerId] = new ApexCharts(container, options);
      sparkCharts[containerId].render();
    } catch(e) {
      console.warn('drawSparkline error:', e);
    }
  });
}

// ============================================================
// RENDER STRATEGIES GRID
// ============================================================
function renderStrategiesGrid() {
  var container = document.getElementById('strategies-list-container');
  if (!container) return;
  container.style.display = 'block';

  if (strategiesList.length === 0) {
    var compSection = document.getElementById('comparison-section');
    var statsBar = document.getElementById('summary-stats-bar');
    if (compSection) compSection.style.display = 'none';
    if (statsBar) statsBar.style.display = 'none';
    container.innerHTML = '\n      <div class="empty-strategies">\n        <div class="empty-icon">\n          <i data-lucide="target">\n            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">\n              <circle cx="12" cy="12" r="10"></circle>\n              <circle cx="12" cy="12" r="6"></circle>\n              <circle cx="12" cy="12" r="2"></circle>\n            </svg>\n          </i>\n        </div>\n        <h3 data-i18n="strategies.empty.title">' + (typeof _t === 'function' ? _t('strategies.empty.title', 'Henüz strateji eklenmemiş') : 'Henüz strateji eklenmemiş') + '</h3>\n        <p data-i18n="strategies.empty.desc">' + (typeof _t === 'function' ? _t('strategies.empty.desc', '"Yeni Strateji Ekle" butonu ile ilk stratejini oluştur.') : '"Yeni Strateji Ekle" butonu ile ilk stratejini oluştur.') + '</p>\n      </div>';
    if (typeof i18n !== 'undefined' && i18n.apply) i18n.apply();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    return;
  }

  var compSection2 = document.getElementById('comparison-section');
  var statsBar2 = document.getElementById('summary-stats-bar');
  if (compSection2) compSection2.style.display = 'block';
  if (statsBar2) statsBar2.style.display = 'grid';

  var totalTradeCount = 0, bestWR = 0, totalPnLAll = 0;
  strategiesList.forEach(function(s) {
    var p = getStrategyPerformance(s.id);
    if (!p) return;
    totalTradeCount += p.totalTradesWithOpen;
    if (p.winRate > bestWR) bestWR = p.winRate;
    totalPnLAll += p.totalPnL;
  });

  var totalStrategiesEl = document.getElementById('stat-total-strategies');
  var totalTradesEl = document.getElementById('stat-total-trades');
  var bestWrEl = document.getElementById('stat-best-wr');
  var pnlEl = document.getElementById('stat-total-pnl');

  if (totalStrategiesEl) totalStrategiesEl.textContent = strategiesList.length;
  if (totalTradesEl) totalTradesEl.textContent = totalTradeCount;
  if (bestWrEl) bestWrEl.textContent = bestWR + '%';
  if (pnlEl) {
    pnlEl.textContent = formatCurrencySafe(totalPnLAll);
    pnlEl.className = 'stat-value ' + (totalPnLAll >= 0 ? 'pos' : 'neg');
  }

  var cards = strategiesList.map(function(s) {
    var perf = getStrategyPerformance(s.id);
    var sparkId = 'spark-' + s.id;
    var hasData = perf && perf.totalTrades > 0;

    var safeName = sanitizeHTML(s.name);
    var safeColor = sanitizeHTML(s.color || '#8b5cf6');
    var safeDescription = sanitizeHTML(s.description || '');

    var descriptionHtml = '';
    if (safeDescription) {
      descriptionHtml = '<div class="sc-desc">' + (safeDescription.length > 40 ? safeDescription.substring(0,40) + '…' : safeDescription) + '</div>';
    } else {
      descriptionHtml = '<div class="sc-desc" style="opacity:.4" data-i18n="strategies.card.no_description">' + _t('strategies.card.no_description', 'Açıklama Yok') + '</div>';
    }

    var instrumentTagHtml = '';
    if (hasData && perf.bestInstrument) {
      var bi = perf.bestInstrument;
      var displayName = sanitizeHTML(bi.instrument + ' ' + bi.symbol);
      instrumentTagHtml = '<div class="sc-instrument-tag" title="' + _t('strategies.card.best_instrument', 'En iyi enstrüman') + '">' +
        '<span style="display:flex;align-items:center;gap:5px;">' +
          '<svg class="tag-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>' +
          '<span class="tag-name">' + displayName + '</span>' +
        '</span>' +
        '<span class="tag-pnl ' + (bi.pnl >= 0 ? 'pos' : 'neg') + '">' + formatCurrencySafe(bi.pnl) + '</span>' +
        '</div>';
    }

    var sparkHtml = '';
    if (hasData && perf.pnlSeries.length >= 1) {
      sparkHtml = '<div class="sc-spark clickable" data-id="' + s.id + '" title="' + _t('strategies.card.enlarge_equity', "Equity curve'yi büyüt") + '"><span class="sc-spark-hint">' + _t('strategies.card.enlarge', 'büyüt ⤢') + '</span><div id="' + sparkId + '" style="width:100%;height:100%;"></div></div>';
    } else {
      var safeGradId = 'empty-spark-grad-' + String(s.id).replace(/[^a-zA-Z0-9_-]/g, '');
      sparkHtml = '<div class="sc-spark sc-spark-empty" title="' + _t('strategies.card.no_data', 'Veri Yok') + '">' +
        '<svg class="sc-spark-empty-svg" viewBox="0 0 280 42" preserveAspectRatio="none" aria-hidden="true">' +
          '<defs>' +
            '<linearGradient id="' + safeGradId + '" x1="0" y1="0" x2="0" y2="1">' +
              '<stop offset="0%" stop-color="' + safeColor + '" stop-opacity="0.22"/>' +
              '<stop offset="100%" stop-color="' + safeColor + '" stop-opacity="0"/>' +
            '</linearGradient>' +
          '</defs>' +
          '<line x1="0" y1="14" x2="280" y2="14" stroke="rgba(255,255,255,0.04)" stroke-dasharray="3,3" stroke-width="1"/>' +
          '<line x1="0" y1="28" x2="280" y2="28" stroke="rgba(255,255,255,0.04)" stroke-dasharray="3,3" stroke-width="1"/>' +
          '<path d="M 0,26 C 45,26 70,16 110,21 C 150,26 185,15 225,20 C 250,24 268,18 280,19 L 280,42 L 0,42 Z" fill="url(#' + safeGradId + ')"/>' +
          '<path d="M 0,26 C 45,26 70,16 110,21 C 150,26 185,15 225,20 C 250,24 268,18 280,19" fill="none" stroke="' + safeColor + '" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="4,3" opacity="0.4"/>' +
        '</svg>' +
        '<div class="sc-spark-empty-badge">' +
          '<svg class="sc-spark-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>' +
          '</svg>' +
          '<span data-i18n="strategies.card.no_data">' + _t('strategies.card.no_data', 'Veri Yok') + '</span>' +
        '</div>' +
      '</div>';
    }

    var wrDotClass = hasData ? (perf.winRate >= 50 ? 'pos' : 'neg') : '';
    var wrDotHtml = hasData
      ? '<span class="sc-wr-dot ' + wrDotClass + '" title="' + _t('strategies.card.win_rate', 'Win Rate') + ': ' + perf.winRate + '%"></span>'
      : '<span style="font-size:13px;color:var(--muted);padding-right:4px;">—</span>';

    var longPill = (perf && perf.longCount > 0)
      ? '<span class="dp dp-long"><svg class="dp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg> Long ' + perf.longCount + '</span>'
      : '';
    var shortPill = (perf && perf.shortCount > 0)
      ? '<span class="dp dp-short"><svg class="dp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg> Short ' + perf.shortCount + '</span>'
      : '';

    return '\n      <div class="strategy-card" data-id="' + s.id + '">\n        <div class="sc-top">\n          <div class="sc-header">\n            <div class="sc-name-row">\n              <div class="sc-color-bar" style="background:' + safeColor + '"></div>\n              <div>\n                <div class="sc-name">' + safeName + '</div>\n                ' + descriptionHtml + '\n              </div>\n            </div>\n            ' + wrDotHtml + '\n          </div>\n\n          <div class="sc-stats">\n            <div class="sc-stat">\n              <div class="sc-stat-lbl" data-i18n="strategies.card.trades">' + _t('strategies.card.trades', 'İşlem') + '</div>\n              <div class="sc-stat-val">' + (perf ? perf.totalTradesWithOpen : 0) + '</div>\n            </div>\n            <div class="sc-stat">\n              <div class="sc-stat-lbl" data-i18n="strategies.card.win_rate">' + _t('strategies.card.win_rate', 'Win Rate') + '</div>\n              <div class="sc-stat-val">' + (hasData ? perf.winRate + '%' : '—') + '</div>\n            </div>\n            <div class="sc-stat">\n              <div class="sc-stat-lbl" data-i18n="strategies.card.pnl">' + _t('strategies.card.pnl', 'K/Z') + '</div>\n              <div class="sc-stat-val">' + (hasData ? formatCurrencySafe(perf.totalPnL) : '—') + '</div>\n            </div>\n          </div>\n\n          ' + instrumentTagHtml + '\n          ' + sparkHtml + '\n        </div>\n\n        <div class="sc-footer">\n          <div class="dir-pills">\n            ' + longPill + '\n            ' + shortPill + '\n            ' + (!perf || (perf.longCount === 0 && perf.shortCount === 0) ? '<span style="font-size:11px;color:var(--muted)">—</span>' : '') + '\n          </div>\n          <div class="sc-actions">\n            <button class="sc-btn edit-strategy-btn" data-id="' + s.id + '" aria-label="' + _t('common.edit', 'Düzenle') + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>\n            <button class="sc-btn danger delete-strategy-btn" data-id="' + s.id + '" aria-label="' + _t('common.delete', 'Sil') + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>\n          </div>\n        </div>\n      </div>';
  });

  cards.push('\n    <div class="strategy-card-add" id="add-card-shortcut">\n      <div class="add-icon">\n        <svg width="18" height="18" viewBox="0 0 14 14" fill="none">\n          <path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>\n        </svg>\n      </div>\n      <span class="add-label" data-i18n="strategies.add_button">' + _t('strategies.add_button', 'Yeni Strateji Ekle') + '</span>\n    </div>');

  container.innerHTML = '<div class="strategies-grid">' + cards.join('') + '</div>';

  // ⭐ Sparkline'ları ApexCharts ile çiz
  for (var sIdx = 0; sIdx < strategiesList.length; sIdx++) {
    var s = strategiesList[sIdx];
    var perf = getStrategyPerformance(s.id);
    var sparkId = 'spark-' + s.id;

    if (perf && perf.totalTrades > 0 && perf.pnlSeries.length >= 1) {
      drawSparkline(sparkId, perf.pnlSeries, s.color);
    }
  }

  var editBtns = document.querySelectorAll('.edit-strategy-btn');
  editBtns.forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      openEditModal(this.dataset.id);
    });
  });

  var deleteBtns = document.querySelectorAll('.delete-strategy-btn');
  deleteBtns.forEach(function(btn) {
    btn.addEventListener('click', async function(e) {
      e.stopPropagation();
      if (confirm(i18n.t('strategies.delete_confirm'))) {
        var ok = await deleteStrategy(this.dataset.id);
        if (window.wwCache) window.wwCache.invalidate('strategies');
        try { window.dispatchEvent(new CustomEvent('strategy-deleted')); } catch(ev) {}
        if (ok) await loadAllData();
      }
    });
  });

  var strategyCards = document.querySelectorAll('.strategy-card');
  strategyCards.forEach(function(cardEl) {
    cardEl.addEventListener('click', function(e) {
      if (e.target.closest('.sc-btn')) return;
      if (e.target.closest('.sc-spark.clickable')) {
        openEquityModal(this.dataset.id);
        return;
      }
      openDetailModal(this.dataset.id);
    });
  });

  var addShortcut = document.getElementById('add-card-shortcut');
  if (addShortcut) {
    addShortcut.addEventListener('click', function() {
      openAddStrategyModal();
    });
  }

  if (typeof i18n !== 'undefined') i18n.apply();
}

// ============================================================
// RENDER COMPARISON CHARTS - ApexCharts
// ============================================================
function renderComparisonCharts() {
  whenApexReady(function() {
    _renderComparisonChartsActual();
  });
}

function _renderComparisonChartsActual() {
  try {
    if (!strategiesList.length) return;
    var labels = [], wrData = [], pnlData = [], colors = [];

    for (var sIdx2 = 0; sIdx2 < strategiesList.length; sIdx2++) {
      var s = strategiesList[sIdx2];
      var perf = getStrategyPerformance(s.id);
      if (perf && perf.totalTrades > 0) {
        labels.push(s.name.length > 12 ? s.name.slice(0,10) + '..' : s.name);
        wrData.push(perf.winRate);
        pnlData.push(perf.totalPnL);
        colors.push(s.color || '#8b5cf6');
      }
    }
    if (!wrData.length) return;

    var theme = getStrategiesApexTheme();

    // ⭐ WİN RATE KARŞILAŞTIRMASI (Bar)
    var winEl = document.getElementById('winrate-comparison-chart');
    if (winEl) {
      if (window.winrateChart) {
        try { window.winrateChart.destroy(); } catch(e) {}
        window.winrateChart = null;
      }
      winEl.innerHTML = '';

      var winOptions = {
        series: [{ name: 'Win Rate', data: wrData }],
        chart: {
          type: 'bar',
          height: '100%',
          width: '100%',
          toolbar: { show: false },
          background: 'transparent',
          fontFamily: "'DM Sans', sans-serif",
          animations: { enabled: true, speed: 500 }
        },
        plotOptions: {
          bar: {
            borderRadius: 5,
            columnWidth: '60%',
            distributed: true
          }
        },
        colors: colors,
        dataLabels: { enabled: false },
        grid: {
          borderColor: theme.gridColor,
          strokeDashArray: 3,
          position: 'back'
        },
        xaxis: {
          categories: labels,
          labels: {
            style: {
              colors: theme.textColor,
              fontFamily: "'DM Mono', monospace",
              fontSize: '9px'
            },
            rotate: 0,
            hideOverlappingLabels: true,
            trim: true
          },
          axisBorder: { show: false },
          axisTicks: { show: false }
        },
        yaxis: {
          max: 100,
          labels: {
            style: {
              colors: theme.textColor,
              fontFamily: "'DM Mono', monospace",
              fontSize: '9px'
            },
            formatter: function(v) { return v.toFixed(0) + '%'; }
          }
        },
        tooltip: {
          theme: theme.mode,
          y: {
            formatter: function(v) { return v.toFixed(1) + '%'; }
          },
          style: {
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '12px'
          }
        },
        legend: { show: false }
      };

      window.winrateChart = new ApexCharts(winEl, winOptions);
      window.winrateChart.render();
    }

    // ⭐ TOPLAM K/Z KARŞILAŞTIRMASI (Bar)
    var pnlEl = document.getElementById('pnl-comparison-chart');
    if (pnlEl) {
      if (window.pnlChart) {
        try { window.pnlChart.destroy(); } catch(e) {}
        window.pnlChart = null;
      }
      pnlEl.innerHTML = '';

      var barColors = pnlData.map(function(v) { return v >= 0 ? '#22c55e' : '#ef4444'; });

      var pnlOptions = {
        series: [{ name: 'K/Z', data: pnlData }],
        chart: {
          type: 'bar',
          height: '100%',
          width: '100%',
          toolbar: { show: false },
          background: 'transparent',
          fontFamily: "'DM Sans', sans-serif",
          animations: { enabled: true, speed: 500 }
        },
        plotOptions: {
          bar: {
            borderRadius: 5,
            columnWidth: '60%',
            distributed: true
          }
        },
        colors: barColors,
        dataLabels: { enabled: false },
        grid: {
          borderColor: theme.gridColor,
          strokeDashArray: 3,
          position: 'back'
        },
        xaxis: {
          categories: labels,
          labels: {
            style: {
              colors: theme.textColor,
              fontFamily: "'DM Mono', monospace",
              fontSize: '9px'
            },
            rotate: 0,
            hideOverlappingLabels: true,
            trim: true
          },
          axisBorder: { show: false },
          axisTicks: { show: false }
        },
        yaxis: {
          labels: {
            style: {
              colors: theme.textColor,
              fontFamily: "'DM Mono', monospace",
              fontSize: '9px'
            },
            formatter: function(v) { return formatCurrencySafe(v); }
          }
        },
        tooltip: {
          theme: theme.mode,
          y: {
            formatter: function(v) { return formatCurrencySafe(v); }
          },
          style: {
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '12px'
          }
        },
        legend: { show: false }
      };

      window.pnlChart = new ApexCharts(pnlEl, pnlOptions);
      window.pnlChart.render();
    }
  } catch(e) {
    console.error('renderComparisonCharts hatası:', e);
  }
}

// ============================================================
// STRATEJİ EKLEME MODALI
// ============================================================
function openAddStrategyModal() {
  var nameEl = document.getElementById('new-strategy-name');
  var descEl = document.getElementById('new-strategy-desc');
  var colorEl = document.getElementById('new-strategy-color');
  var modalEl = document.getElementById('add-strategy-modal');
  if (nameEl) nameEl.value = '';
  if (descEl) descEl.value = '';
  if (colorEl) colorEl.value = '#8b5cf6';
  if (modalEl) modalEl.style.display = 'flex';
}

async function confirmAddStrategy() {
  var nameEl = document.getElementById('new-strategy-name');
  var descEl = document.getElementById('new-strategy-desc');
  var colorEl = document.getElementById('new-strategy-color');

  var name = nameEl ? nameEl.value.trim() : '';
  if (!name) {
    showToast(i18n.t('strategies.error_name_required'), 'error');
    return;
  }

  var desc = descEl ? descEl.value.trim() : '';
  var color = colorEl ? colorEl.value : '#8b5cf6';

  try {
    await addStrategy(name, desc, color);
    if (window.wwCache) window.wwCache.invalidate('strategies');
    document.getElementById('add-strategy-modal').style.display = 'none';
    await loadAllData();

    try {
      window.dispatchEvent(new CustomEvent('strategy-saved'));
    } catch (evErr) {}
    if (typeof window.refreshOnboardingTasks === 'function') {
      window.refreshOnboardingTasks();
    }

    var urlParams = new URLSearchParams(window.location.search);
    var isFromOnboarding = urlParams.get('action') === 'new' || sessionStorage.getItem('wj_from_onboarding') === 'true';
    if (isFromOnboarding) {
      sessionStorage.removeItem('wj_from_onboarding');
      sessionStorage.setItem('wj_strategy_just_completed', 'true');
      var successMsg = (typeof i18n !== 'undefined' && typeof i18n.t === 'function')
        ? i18n.t('onboarding.task_strategy_toast')
        : 'Strateji başarıyla eklendi! Görev tamamlandı.';
      showToast(successMsg, 'success');
      setTimeout(function() {
        window.location.href = '/dashboard';
      }, 1200);
    } else {
      showToast(i18n.t('strategies.added'));
    }
  } catch (e) {
    showToast(i18n.t('strategies.error_add') + e.message, 'error');
  }
}

function closeAddStrategyModal() {
  document.getElementById('add-strategy-modal').style.display = 'none';
}

// ============================================================
// DÜZENLEME MODALI
// ============================================================
function openEditModal(strategyId) {
  try {
    var s = strategiesList.find(function(x) { return x.id === strategyId; });
    if (!s) return;
    var idEl = document.getElementById('edit-strategy-id');
    var nameEl = document.getElementById('edit-strategy-name');
    var descEl = document.getElementById('edit-strategy-desc');
    var colorEl = document.getElementById('edit-strategy-color');
    var modalEl = document.getElementById('edit-strategy-modal');

    if (idEl) idEl.value = s.id;
    if (nameEl) nameEl.value = sanitizeHTML(s.name);
    if (descEl) descEl.value = sanitizeHTML(s.description || '');
    if (colorEl) colorEl.value = sanitizeHTML(s.color || '#8b5cf6');
    if (modalEl) modalEl.style.display = 'flex';
  } catch(e) {}
}

async function confirmEditStrategy() {
  var idEl = document.getElementById('edit-strategy-id');
  var nameEl = document.getElementById('edit-strategy-name');
  var descEl = document.getElementById('edit-strategy-desc');
  var colorEl = document.getElementById('edit-strategy-color');

  var id = idEl ? idEl.value : '';
  var name = nameEl ? nameEl.value.trim() : '';
  if (!name) {
    showToast(i18n.t('strategies.error_name_required'), 'error');
    return;
  }
  var desc = descEl ? descEl.value.trim() : '';
  var color = colorEl ? colorEl.value : '#8b5cf6';

  try {
    await updateStrategy(id, { name: name, description: desc, color: color });
    if (window.wwCache) window.wwCache.invalidate('strategies');
    try { window.dispatchEvent(new CustomEvent('strategy-saved')); } catch(ev) {}
    document.getElementById('edit-strategy-modal').style.display = 'none';
    await loadAllData();
    showToast(i18n.t('strategies.updated'));
  } catch (e) {
    showToast(i18n.t('strategies.error_update') + e.message, 'error');
  }
}

function closeEditStrategyModal() {
  document.getElementById('edit-strategy-modal').style.display = 'none';
}

// ============================================================
// DETAY MODALI
// ============================================================
function openDetailModal(strategyId) {
  try {
    var s = strategiesList.find(function(x) { return x.id === strategyId; });
    if (!s) return;
    currentDetailStrategyId = strategyId;
    var perf = getStrategyPerformance(strategyId);

    var nameEl = document.getElementById('detail-strategy-name');
    var dotEl = document.getElementById('detail-color-dot');
    if (nameEl) nameEl.textContent = sanitizeHTML(s.name);
    if (dotEl) dotEl.style.background = sanitizeHTML(s.color || '#8b5cf6');

    var body = document.getElementById('detail-modal-body');
    if (!body) return;

    if (perf.totalTrades === 0) {
      body.innerHTML = '<div class="detail-empty-note">' + i18n.t('strategies.detail.no_closed_trades') + '</div>';
      var modalEl = document.getElementById('strategy-detail-modal');
      if (modalEl) modalEl.style.display = 'flex';
      return;
    }

    var pfDisplay = (perf.profitFactor === null) ? '∞' : perf.profitFactor;
    var rrDisplay = (perf.avgRR === null) ? '∞' : perf.avgRR;

    var metricsHtml = '\n      <div class="detail-metrics-grid">\n        <div class="detail-metric-box"><div class="detail-metric-lbl" data-i18n="strategies.detail.profit_factor">Profit Factor</div><div class="detail-metric-val ' + (perf.profitFactor !== null && perf.profitFactor >= 1 ? 'pos' : (perf.profitFactor !== null ? 'neg' : 'pos')) + '">' + pfDisplay + '</div></div>\n        <div class="detail-metric-box"><div class="detail-metric-lbl" data-i18n="strategies.detail.avg_rr">Ort. R:R</div><div class="detail-metric-val">' + rrDisplay + '</div></div>\n        <div class="detail-metric-box"><div class="detail-metric-lbl" data-i18n="strategies.detail.max_drawdown">Maks. Drawdown</div><div class="detail-metric-val neg">' + formatCurrencySafe(perf.maxDrawdown) + '</div></div>\n        <div class="detail-metric-box"><div class="detail-metric-lbl" data-i18n="strategies.detail.win_rate">Win Rate</div><div class="detail-metric-val ' + (perf.winRate >= 50 ? 'pos' : 'neg') + '">' + perf.winRate + '%</div></div>\n        <div class="detail-metric-box"><div class="detail-metric-lbl" data-i18n="strategies.detail.max_win_streak">Maks. Kazanma Serisi</div><div class="detail-metric-val pos">' + perf.maxWinStreak + '</div></div>\n        <div class="detail-metric-box"><div class="detail-metric-lbl" data-i18n="strategies.detail.max_loss_streak">Maks. Kaybetme Serisi</div><div class="detail-metric-val neg">' + perf.maxLossStreak + '</div></div>\n        <div class="detail-metric-box"><div class="detail-metric-lbl" data-i18n="strategies.detail.avg_win">Ort. Kazanç</div><div class="detail-metric-val pos">' + formatCurrencySafe(perf.avgWin) + '</div></div>\n        <div class="detail-metric-box"><div class="detail-metric-lbl" data-i18n="strategies.detail.avg_loss">Ort. Kayıp</div><div class="detail-metric-val neg">' + formatCurrencySafe(perf.avgLoss) + '</div></div>\n      </div>';

    var instrumentRows = perf.instrumentBreakdown.map(function(ib) {
      var displayName = sanitizeHTML(ib.instrument + ' ' + ib.symbol);
      return '<tr><td>' + displayName + '</td><td>' + ib.trades + '</td><td>' + ib.winRate + '%</td><td class="' + (ib.pnl >= 0 ? 'pos' : 'neg') + '">' + formatCurrencySafe(ib.pnl) + '</td></tr>';
    }).join('');

    var instrumentHtml = '\n      <div class="detail-section-title" data-i18n="strategies.detail.instrument_breakdown">Enstrüman Kırılımı</div>\n      <div class="detail-table-wrap" style="max-height:160px;">\n        <table class="detail-table">\n          <thead><tr><th data-i18n="strategies.detail.instrument">Enstrüman · Sembol</th><th data-i18n="strategies.detail.trades">İşlem</th><th data-i18n="strategies.detail.win_rate">Win Rate</th><th data-i18n="strategies.detail.pnl">K/Z</th></tr></thead>\n          <tbody>' + (instrumentRows || '<tr><td colspan="4" style="text-align:center;color:var(--muted);">' + i18n.t('strategies.detail.no_data') + '</td></tr>') + '</tbody>\n        </table>\n      </div>';

    var tradeRows = perf.tradesDetail.slice().reverse().map(function(t) {
      return '<tr>' +
        '<td>' + fmtDate(t.trade_date) + '</td>' +
        '<td>' + sanitizeHTML(t.symbol) + '</td>' +
        '<td>' + sanitizeHTML(t.instrument) + '</td>' +
        '<td>' + sanitizeHTML(t.direction) + '</td>' +
        '<td>' + (t.entry_price != null ? t.entry_price : '—') + '</td>' +
        '<td>' + (t.exit_price != null ? t.exit_price : '—') + '</td>' +
        '<td>' + (t.lot != null ? t.lot : '—') + '</td>' +
        '<td class="' + (t.pnl >= 0 ? 'pos' : 'neg') + '">' + formatCurrencySafe(t.pnl) + '</td>' +
        '</tr>';
    }).join('');

    var tradesHtml = '\n      <div class="detail-section-title" data-i18n="strategies.detail.trade_list">İşlem Listesi (' + perf.tradesDetail.length + ')</div>\n      <div class="detail-table-wrap">\n        <table class="detail-table">\n          <thead><tr><th data-i18n="strategies.detail.date">Tarih</th><th data-i18n="strategies.detail.symbol">Sembol</th><th data-i18n="strategies.detail.instrument">Enstrüman</th><th data-i18n="strategies.detail.direction">Yön</th><th data-i18n="strategies.detail.entry">Giriş</th><th data-i18n="strategies.detail.exit">Çıkış</th><th data-i18n="strategies.detail.lot">Lot</th><th data-i18n="strategies.detail.pnl">K/Z</th></tr></thead>\n          <tbody>' + (tradeRows || '<tr><td colspan="8" style="text-align:center;color:var(--muted);">' + i18n.t('strategies.detail.no_trades_in_list') + '</td></tr>') + '</tbody>\n        </table>\n      </div>';

    body.innerHTML = metricsHtml + instrumentHtml + tradesHtml;

    var modalEl2 = document.getElementById('strategy-detail-modal');
    if (modalEl2) modalEl2.style.display = 'flex';

    if (typeof i18n !== 'undefined') i18n.apply();
  } catch(e) {}
}

// ============================================================
// EQUITY MODAL - ApexCharts
// ============================================================
function openEquityModal(strategyId) {
  try {
    var s = strategiesList.find(function(x) { return x.id === strategyId; });
    if (!s) return;
    var perf = getStrategyPerformance(s.id);
    if (!perf.pnlSeries.length) return;

    var nameEl = document.getElementById('equity-strategy-name');
    var dotEl = document.getElementById('equity-color-dot');
    if (nameEl) nameEl.textContent = sanitizeHTML(s.name) + ' — Equity Curve';
    if (dotEl) dotEl.style.background = sanitizeHTML(s.color || '#8b5cf6');

    var modalEl = document.getElementById('equity-curve-modal');
    if (modalEl) modalEl.style.display = 'flex';

    whenApexReady(function() {
      var equityEl = document.getElementById('equity-curve-canvas');
      if (!equityEl) return;

      if (equityChartInstance) {
        try { equityChartInstance.destroy(); } catch(e) {}
        equityChartInstance = null;
      }
      equityEl.innerHTML = '';

    var theme = getStrategiesApexTheme();
    var labels = perf.tradesDetail.map(function(t, i) { return fmtDate(t.trade_date); });
    var isNeg = perf.pnlSeries[perf.pnlSeries.length - 1] < 0;
    var lineColor = isNeg ? '#ef4444' : (s.color || '#8b5cf6');

    var equityOptions = {
      series: [{ name: 'Kümülatif K/Z', data: perf.pnlSeries }],
      chart: {
        type: 'area',
        height: '100%',
        width: '100%',
        toolbar: { show: false },
        background: 'transparent',
        fontFamily: "'DM Sans', sans-serif",
        animations: { enabled: true, speed: 500 },
        zoom: { enabled: false }
      },
      stroke: {
        curve: 'smooth',
        width: 2,
        colors: [lineColor]
      },
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.35,
          opacityTo: 0.02,
          stops: [0, 100]
        }
      },
      colors: [lineColor],
      dataLabels: { enabled: false },
      markers: {
        size: 3,
        colors: [lineColor],
        strokeColors: lineColor,
        strokeWidth: 0,
        hover: { size: 6 }
      },
      grid: {
        borderColor: theme.gridColor,
        strokeDashArray: 3,
        position: 'back'
      },
      xaxis: {
        categories: labels,
        tickAmount: 8,
        labels: {
          style: {
            colors: theme.textColor,
            fontFamily: "'DM Mono', monospace",
            fontSize: '9px'
          },
          rotate: 0,
          hideOverlappingLabels: true,
          trim: true
        },
        axisBorder: { show: false },
        axisTicks: { show: false }
      },
      yaxis: {
        labels: {
          style: {
            colors: theme.textColor,
            fontFamily: "'DM Mono', monospace",
            fontSize: '9px'
          },
          formatter: function(v) { return formatCurrencySafe(v); }
        }
      },
      tooltip: {
        theme: theme.mode,
        y: {
          formatter: function(v) { return formatCurrencySafe(v); }
        },
        style: {
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '12px'
        }
      },
      legend: { show: false }
    };

    equityChartInstance = new ApexCharts(equityEl, equityOptions);
    equityChartInstance.render();
    });
  } catch(e) {
    console.error('openEquityModal hatası:', e);
  }
}

// ============================================================
// DETAY VE EQUITY MODAL KAPATMA
// ============================================================
function setupDetailAndEquityModals() {
  var detailModal = document.getElementById('strategy-detail-modal');
  var equityModal = document.getElementById('equity-curve-modal');

  ['close-detail-modal', 'close-detail-modal-btn'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', function() { if (detailModal) detailModal.style.display = 'none'; });
  });
  ['close-equity-modal', 'close-equity-modal-btn'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', function() {
      if (equityModal) equityModal.style.display = 'none';
      // ⭐ Equity modalı kapanınca chart'ı temizle
      if (equityChartInstance) {
        try { equityChartInstance.destroy(); } catch(e) {}
        equityChartInstance = null;
      }
    });
  });
  if (detailModal) {
    detailModal.addEventListener('click', function(e) { if (e.target === detailModal) detailModal.style.display = 'none'; });
  }
  if (equityModal) {
    equityModal.addEventListener('click', function(e) {
      if (e.target === equityModal) {
        equityModal.style.display = 'none';
        if (equityChartInstance) {
          try { equityChartInstance.destroy(); } catch(e) {}
          equityChartInstance = null;
        }
      }
    });
  }

  var detailCsvBtn = document.getElementById('detail-export-csv');
  if (detailCsvBtn) {
    detailCsvBtn.addEventListener('click', function() {
      if (currentDetailStrategyId) exportStrategyCSV(currentDetailStrategyId);
    });
  }
  var detailPdfBtn = document.getElementById('detail-export-pdf');
  if (detailPdfBtn) {
    detailPdfBtn.addEventListener('click', function() {
      if (currentDetailStrategyId) exportStrategyPDF(currentDetailStrategyId);
    });
  }
}

// ============================================================
// CSV / PDF EXPORT
// ============================================================
function downloadBlob(content, filename, mimeType) {
  try {
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 200);
  } catch(e) {}
}

function csvEscape(val) {
  var s = (val === null || val === undefined) ? '' : String(val);
  return '"' + s.replace(/"/g, '""') + '"';
}

function getCurrentLanguage() {
  try {
    if (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) {
      return i18n.getCurrentLanguage();
    }
  } catch(e) {}
  return 'en';
}

function exportStrategyCSV(strategyId) {
  try {
    var s = strategiesList.find(function(x) { return x.id === strategyId; });
    var perf = getStrategyPerformance(strategyId);
    var rows = [[
      i18n.t('strategies.detail.date'), i18n.t('strategies.detail.symbol'),
      i18n.t('strategies.detail.instrument'), i18n.t('strategies.detail.direction'),
      i18n.t('strategies.detail.entry'), i18n.t('strategies.detail.exit'),
      i18n.t('strategies.detail.lot'), i18n.t('strategies.detail.pnl')
    ]];
    perf.tradesDetail.forEach(function(t) {
      rows.push([fmtDate(t.trade_date), sanitizeHTML(t.symbol), sanitizeHTML(t.instrument), sanitizeHTML(t.direction), t.entry_price, t.exit_price, t.lot, t.pnl.toFixed(2)]);
    });
    rows.push([]);
    var pfDisplay = (perf.profitFactor === null) ? '∞' : perf.profitFactor;
    rows.push([i18n.t('strategies.detail.trade_list')]);
    rows.push([i18n.t('strategies.detail.trades'), perf.totalTradesWithOpen]);
    rows.push([i18n.t('strategies.detail.win_rate'), perf.winRate + '%']);
    rows.push([i18n.t('strategies.detail.pnl'), perf.totalPnL.toFixed(2)]);
    rows.push([i18n.t('strategies.detail.profit_factor'), pfDisplay]);
    rows.push([i18n.t('strategies.detail.max_drawdown'), perf.maxDrawdown.toFixed(2)]);

    var csvContent = rows.map(function(r) { return r.map(csvEscape).join(','); }).join('\r\n');
    downloadBlob('\uFEFF' + csvContent, (s ? sanitizeHTML(s.name) : 'strateji') + '_islemler.csv', 'text/csv;charset=utf-8;');
    showToast(i18n.t('toast.csv_exported'));
  } catch(e) { showToast(i18n.t('toast.csv_export_error'), 'error'); }
}

function exportAllStrategiesCSV() {
  try {
    var rows = [[
      i18n.t('trades.th_strategy'), i18n.t('strategies.summary.total_trades'),
      i18n.t('strategies.detail.win_rate'), i18n.t('strategies.summary.total_pnl'),
      i18n.t('strategies.detail.profit_factor'), i18n.t('strategies.detail.avg_rr'),
      i18n.t('strategies.detail.max_drawdown'), i18n.t('strategies.detail.instrument_breakdown')
    ]];
    strategiesList.forEach(function(s) {
      var perf = getStrategyPerformance(s.id);
      var bestInst = perf.bestInstrument ? (perf.bestInstrument.instrument + ' ' + perf.bestInstrument.symbol) : '—';
      rows.push([
        sanitizeHTML(s.name),
        perf.totalTradesWithOpen,
        perf.winRate + '%',
        perf.totalPnL.toFixed(2),
        perf.profitFactor === null ? '∞' : perf.profitFactor,
        perf.avgRR === null ? '∞' : perf.avgRR,
        perf.maxDrawdown.toFixed(2),
        sanitizeHTML(bestInst)
      ]);
    });
    var csvContent = rows.map(function(r) { return r.map(csvEscape).join(','); }).join('\r\n');
    downloadBlob('\uFEFF' + csvContent, 'strateji_ozeti.csv', 'text/csv;charset=utf-8;');
    showToast(i18n.t('toast.csv_exported'));
  } catch(e) { showToast(i18n.t('toast.csv_export_error'), 'error'); }
}

async function exportStrategyPDF(strategyId) {
  try {
    if (typeof window.jspdf === 'undefined' && typeof jsPDF === 'undefined') {
      if (typeof window.loadJsPDF === 'function') {
        await window.loadJsPDF(true);
      }
    }
    var PDFConstructor = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : (typeof jsPDF !== 'undefined' ? jsPDF : null);
    if (!PDFConstructor) {
      showToast(i18n.t('toast.pdf_export_error') || 'PDF library error', 'error');
      return;
    }
    var s = strategiesList.find(function(x) { return x.id === strategyId; });
    var perf = getStrategyPerformance(strategyId);
    var doc = new PDFConstructor({ unit: 'mm', format: 'a4' });
    var pageW = doc.internal.pageSize.getWidth();
    var margin = 12;
    var y = margin + 5;

    doc.setFillColor(10, 10, 15);
    doc.rect(0, 0, pageW, 6, 'F');
    doc.setFillColor(139, 92, 246);
    doc.rect(0, 0, pageW, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(i18n.t('strategies.title') + ': ' + sanitizeHTML(s.name), margin, y);
    y += 4;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 107, 128);
    doc.text('Wawe Journal · ' + new Date().toLocaleDateString(i18n.getCurrentLanguage() === 'tr' ? 'tr-TR' : (i18n.getCurrentLanguage() === 'de' ? 'de-DE' : 'en-US')), margin, y);
    y += 10;

    var trades = allTrades.filter(function(t) { return t.strategy_id === strategyId && t.exit_price; });
    var tableData = trades.slice(0, 30).map(function(t) {
      var pnl = calcPnL(t.entry_price, t.exit_price, t.lot, t.direction, t.instrument, t.multiplier);
      return [
        t.trade_date || '-',
        t.symbol || '-',
        (t.direction || '-').toUpperCase(),
        t.entry_price || '-',
        t.exit_price || '-',
        formatCurrency(pnl),
        t.rr_ratio ? t.rr_ratio + 'R' : '-'
      ];
    });

    doc.autoTable({
      startY: y,
      head: [[
        i18n.t('trades.table.date'),
        i18n.t('trades.table.symbol'),
        i18n.t('trades.table.direction'),
        i18n.t('trades.table.entry'),
        i18n.t('trades.table.exit'),
        i18n.t('trades.table.pnl'),
        'R:R'
      ]],
      body: tableData,
      theme: 'plain',
      headStyles: { fillColor: [30, 30, 46], textColor: [107, 107, 128], fontSize: 5 },
      bodyStyles: { textColor: [232, 232, 240], fontSize: 5 },
      columnStyles: { 5: { textColor: function(cell) { return cell.raw >= 0 ? [34,197,94] : [239,68,68]; } } },
      margin: { left: margin, right: margin },
      styles: { cellPadding: 1.5 }
    });
    doc.save((s ? sanitizeHTML(s.name) : 'strateji') + '_rapor.pdf');
    showToast(i18n.t('toast.pdf_exported'));
  } catch(e) { showToast(i18n.t('toast.pdf_export_error'), 'error'); }
}

async function exportAllStrategiesPDF() {
  try {
    if (typeof window.jspdf === 'undefined' && typeof jsPDF === 'undefined') {
      if (typeof window.loadJsPDF === 'function') {
        await window.loadJsPDF(true);
      }
    }
    var PDFConstructor = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : (typeof jsPDF !== 'undefined' ? jsPDF : null);
    if (!PDFConstructor) {
      showToast(i18n.t('toast.pdf_export_error') || 'PDF library error', 'error');
      return;
    }
    var doc = new PDFConstructor({ unit: 'mm', format: 'a4' });
    var pageW = doc.internal.pageSize.getWidth();
    var margin = 12;
    var y = margin + 5;

    doc.setFillColor(10, 10, 15);
    doc.rect(0, 0, pageW, 6, 'F');
    doc.setFillColor(139, 92, 246);
    doc.rect(0, 0, pageW, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(i18n.t('strategies.title'), margin, y);
    y += 4;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 107, 128);
    doc.text('Wawe Journal · ' + new Date().toLocaleDateString(i18n.getCurrentLanguage() === 'tr' ? 'tr-TR' : (i18n.getCurrentLanguage() === 'de' ? 'de-DE' : 'en-US')), margin, y);
    y += 10;

    var tableData = strategiesList.map(function(s) {
      var perf = getStrategyPerformance(s.id);
      return [
        sanitizeHTML(s.name),
        perf.totalTradesWithOpen,
        perf.winRate + '%',
        formatCurrencySafe(perf.totalPnL),
        perf.profitFactor === null ? '∞' : perf.profitFactor
      ];
    });

    doc.autoTable({
      startY: y,
      head: [[
        i18n.t('trades.th_strategy'), i18n.t('strategies.detail.trades'),
        i18n.t('strategies.detail.win_rate'), i18n.t('strategies.detail.pnl'),
        i18n.t('strategies.detail.profit_factor')
      ]],
      body: tableData,
      theme: 'dark',
      headStyles: { fillColor: [30, 30, 46], textColor: [107, 107, 128], fontSize: 6 },
      bodyStyles: { textColor: [232, 232, 240], fontSize: 6 },
      columnStyles: { 3: { textColor: function(cell) { return cell.raw.startsWith('-') ? [239,68,68] : [34,197,94]; } } },
      margin: { left: margin, right: margin },
      styles: { cellPadding: 2 }
    });
    doc.save('tum_stratejiler_ozet.pdf');
    showToast(i18n.t('toast.pdf_exported'));
  } catch(e) { showToast(i18n.t('toast.pdf_export_error'), 'error'); }
}

function setupExportButtons() {
  var csvBtn = document.getElementById('export-all-csv');
  if (csvBtn) csvBtn.addEventListener('click', exportAllStrategiesCSV);
  var pdfBtn = document.getElementById('export-all-pdf');
  if (pdfBtn) pdfBtn.addEventListener('click', exportAllStrategiesPDF);
}

// ============================================================
// LOAD ALL DATA
// ============================================================
function applyTradesByStrategy() {
  tradesByStrategy = {};
  allTradesForStats.forEach(function(t) {
    var sid = t.strategy_id || 'unassigned';
    if (!tradesByStrategy[sid]) tradesByStrategy[sid] = [];
    tradesByStrategy[sid].push(t);
  });
  strategyDataCache = {};
  strategyDataCacheTime = 0;
}

async function loadAllData() {
  try {
    var jid = (window.journal && typeof window.journal.getActiveJournalId === 'function')
      ? window.journal.getActiveJournalId()
      : (localStorage.getItem('ww_active_journal_id') || localStorage.getItem('activeJournalId'));

    if (!jid && window.journal && typeof window.journal.ensureActiveJournal === 'function' && currentUser) {
      try {
        jid = await window.journal.ensureActiveJournal(currentUser.id);
      } catch(e) {}
    }

    if (!jid) {
      if (typeof wwLog !== 'undefined') wwLog.warn('Aktif journal yok, veri yüklenmiyor');
      hideStrategySkeleton();
      return;
    }

    // ⚡ SWR Önbellek Kontrolü: Stratejiler ve işlemler önbellekte varsa 0ms'de render et!
    var cachedStrategies = (window.wwCache && window.wwCache.get) ? window.wwCache.get('strategies', currentUser.id, jid) : null;
    var cachedTrades = (window.wwCache && window.wwCache.get) ? (window.wwCache.get('trades_strategies', currentUser.id, jid) || window.wwCache.get('trades', currentUser.id, jid)) : null;

    var renderedFromCache = false;
    if (cachedStrategies && Array.isArray(cachedStrategies)) {
      strategiesList = cachedStrategies;
      allTradesForStats = cachedTrades || [];
      applyTradesByStrategy();
      renderStrategiesGrid();
      renderComparisonCharts();
      hideStrategySkeleton();
      renderedFromCache = true;
    }

    // ⚡ Paralel Veri Çekimi: Strategies ve Trades eşzamanlı çekilir
    var fetchStrategiesPromise = sb
      .from('strategies')
      .select('id, name, description, color, user_id, is_active, created_at')
      .eq('user_id', currentUser.id)
      .eq('journal_id', jid)
      .order('name');

    var fetchTradesPromise = (renderedFromCache && cachedTrades && cachedTrades.length > 0)
      ? Promise.resolve({ data: cachedTrades })
      : (async function() {
          var allTrades = [];
          var pageSize = 1000;
          var from = 0;
          var hasMore = true;

          while (hasMore) {
            var { data: tradesPage, error: tradesErr } = await sb
              .from('trades')
              .select('id, symbol, direction, instrument, lot, entry_price, exit_price, trade_date, strategy_id, multiplier')
              .eq('user_id', currentUser.id)
              .eq('journal_id', jid)
              .order('trade_date', { ascending: false })
              .order('id', { ascending: true })
              .range(from, from + pageSize - 1);

            if (tradesErr) {
              console.error('Strateji işlemleri yüklenirken hata:', tradesErr);
              if (typeof showToast === 'function' && !renderedFromCache) {
                showToast('Strateji verileri yüklenemedi: ' + tradesErr.message, 'error');
              }
              break;
            }

            if (tradesPage && tradesPage.length > 0) {
              allTrades = allTrades.concat(tradesPage);
              if (tradesPage.length < pageSize) hasMore = false;
              else from += pageSize;
            } else {
              hasMore = false;
            }
          }
          return { data: allTrades };
        })();

    var [stratRes, tradesRes] = await Promise.all([fetchStrategiesPromise, fetchTradesPromise]);

    var freshStrategies = (stratRes && stratRes.data) ? stratRes.data : strategiesList;
    var freshTrades = (tradesRes && tradesRes.data) ? tradesRes.data : allTradesForStats;

    // Önbellekten render edilmişse ve veriler BİREBİR AYNIYSA gereksiz 2. render'ı engelle!
    var dataChanged = !renderedFromCache;
    if (renderedFromCache) {
      if (freshStrategies.length !== strategiesList.length || freshTrades.length !== allTradesForStats.length) {
        dataChanged = true;
      } else {
        for (var si = 0; si < freshStrategies.length; si++) {
          var fs = freshStrategies[si], cs = strategiesList[si];
          if (!cs || fs.id !== cs.id || fs.name !== cs.name || fs.color !== cs.color || fs.description !== cs.description) {
            dataChanged = true;
            break;
          }
        }
        if (!dataChanged) {
          var checkCount = Math.min(freshTrades.length, 50);
          for (var ti = 0; ti < checkCount; ti++) {
            var ft = freshTrades[ti], ct = allTradesForStats[ti];
            if (!ct || ft.id !== ct.id || ft.exit_price !== ct.exit_price || ft.pnl !== ct.pnl || ft.strategy_id !== ct.strategy_id) {
              dataChanged = true;
              break;
            }
          }
        }
      }
    }

    if (stratRes && stratRes.data && window.wwCache) {
      window.wwCache.set('strategies', currentUser.id, jid, stratRes.data);
    }
    if (tradesRes && tradesRes.data && tradesRes.data.length > 0 && window.wwCache) {
      window.wwCache.set('trades_strategies', currentUser.id, jid, tradesRes.data);
    }

    if (dataChanged) {
      strategiesList = freshStrategies;
      allTradesForStats = freshTrades;
      applyTradesByStrategy();
      strategyDataCache = {};
      strategyDataCacheTime = 0;
      renderStrategiesGrid();
      renderComparisonCharts();
    }

    hideStrategySkeleton();
  } catch(e) {
    console.error('loadAllData hatası:', e);
    hideStrategySkeleton();
  }
}

function setupTimeFilterButtons() {
  var btns = document.querySelectorAll('.time-filter-btn');
  var customPanel = document.getElementById('custom-range-panel');
  var customApplyBtn = document.getElementById('custom-range-apply');
  var startInput = document.getElementById('custom-range-start');
  var endInput = document.getElementById('custom-range-end');

  btns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var range = this.dataset.range;
      if (range === 'custom') {
        if (customPanel) {
          var isHidden = (customPanel.style.display === 'none' || !customPanel.style.display);
          customPanel.style.display = isHidden ? 'flex' : 'none';
          if (isHidden && startInput && endInput && (!startInput.value || !endInput.value)) {
            var now = new Date();
            var firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            var toYmd = function(d) {
              return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            };
            if (!startInput.value) startInput.value = toYmd(firstDay);
            if (!endInput.value) endInput.value = toYmd(now);
          }
        }
        return;
      }

      if (customPanel) customPanel.style.display = 'none';
      btns.forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      currentTimeRange = range;

      strategyDataCache = {};
      strategyDataCacheTime = 0;

      renderStrategiesGrid();
      renderComparisonCharts();
    });
  });

  if (customApplyBtn) {
    customApplyBtn.addEventListener('click', function() {
      var sVal = startInput ? startInput.value : '';
      var eVal = endInput ? endInput.value : '';
      if (!sVal || !eVal) {
        if (typeof showToast === 'function') {
          showToast(_t('dashboard.custom_range_required', 'Lütfen başlangıç ve bitiş tarihi seçin.'), 'error');
        }
        return;
      }
      currentTimeRange = 'custom';
      window._stratCustomRangeStart = sVal;
      window._stratCustomRangeEnd = eVal;

      btns.forEach(function(b) { b.classList.toggle('active', b.dataset.range === 'custom'); });
      if (customPanel) customPanel.style.display = 'none';

      strategyDataCache = {};
      strategyDataCacheTime = 0;

      renderStrategiesGrid();
      renderComparisonCharts();
    });
  }
}

// ============================================================
// INIT STRATEGIES
// ============================================================
var isStrategiesInitialized = false;

async function initStrategies() {
  if (isStrategiesInitialized) return;
  isStrategiesInitialized = true;

  try {
    wwLog.log('📊 Strategies başlatılıyor...');

    if (typeof sb === 'undefined' || !sb) {
      console.error('❌ Supabase client (sb) tanımlı değil!');
      hideStrategySkeleton();
      return;
    }

    showStrategySkeleton();

    currentUser = await requireAuth();
    if (!currentUser) {
      hideStrategySkeleton();
      return;
    }

    // Aktif defteri arka planda garanti et (varsa bekletme)
    if (window.journal && typeof window.journal.ensureActiveJournal === 'function') {
      var existingJid = window.journal.getActiveJournalId ? window.journal.getActiveJournalId() : localStorage.getItem('ww_active_journal_id');
      if (!existingJid) {
        try { await window.journal.ensureActiveJournal(currentUser.id); } catch(e) {}
      } else {
        window.journal.ensureActiveJournal(currentUser.id).catch(function() {});
      }
    }

    // Navbar ve bildirimleri arka planda güncelle (skeleton süresini ASLA geciktirmesin)
    updateNavbarAvatar().catch(function() {});
    updatePlanBadge().catch(function() {});
    try {
      if (typeof updateOvertradeBell === 'function') {
        var bellPromise = updateOvertradeBell();
        if (bellPromise && typeof bellPromise.catch === 'function') bellPromise.catch(function() {});
      }
    } catch(e) {}

    if (typeof isAdmin === 'function' && isAdmin(currentUser)) {
      var adminLink = document.getElementById('admin-link');
      if (adminLink) adminLink.style.display = 'inline';
      var adminLinkMobile = document.getElementById('admin-link-mobile');
      if (adminLinkMobile) adminLinkMobile.style.display = 'block';
    }

    var userAvatar = document.getElementById('user-avatar');
    var dropdownMenu = document.getElementById('dropdown-menu');
    if (userAvatar && dropdownMenu) {
      userAvatar.addEventListener('click', function(e) {
        e.stopPropagation();
        dropdownMenu.classList.toggle('show');
      });
      document.addEventListener('click', function(e) {
        if (!e.target.closest('#user-avatar') && !e.target.closest('#dropdown-menu')) {
          dropdownMenu.classList.remove('show');
        }
      });
    }

    var logoutDropdownBtn = document.getElementById('logout-dropdown-btn');
    if (logoutDropdownBtn) {
      logoutDropdownBtn.addEventListener('click', async function() {
        try { localStorage.removeItem('ww_last_active_push'); } catch(e) {}
        await sb.auth.signOut();
        window.location.href = 'index.html';
      });
    }

    // Strateji ekleme modal event'leri
    var openAddBtn = document.getElementById('open-add-strategy-modal');
    if (openAddBtn) openAddBtn.addEventListener('click', openAddStrategyModal);

    var confirmAddBtn = document.getElementById('confirm-add-strategy');
    if (confirmAddBtn) confirmAddBtn.addEventListener('click', confirmAddStrategy);

    var cancelAddBtn = document.getElementById('cancel-add-strategy');
    if (cancelAddBtn) cancelAddBtn.addEventListener('click', closeAddStrategyModal);

    var closeAddBtn = document.getElementById('close-add-modal');
    if (closeAddBtn) closeAddBtn.addEventListener('click', closeAddStrategyModal);

    // Düzenleme modal event'leri
    var confirmEditBtn = document.getElementById('confirm-edit-strategy');
    if (confirmEditBtn) confirmEditBtn.addEventListener('click', confirmEditStrategy);

    var cancelEditBtn = document.getElementById('cancel-edit-strategy');
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', closeEditStrategyModal);

    var closeEditBtn = document.getElementById('close-edit-modal');
    if (closeEditBtn) closeEditBtn.addEventListener('click', closeEditStrategyModal);

    // Modal üzerine tıklayınca kapat
    var addModal = document.getElementById('add-strategy-modal');
    if (addModal) {
      addModal.addEventListener('click', function(e) {
        if (e.target === addModal) closeAddStrategyModal();
      });
    }
    var editModal = document.getElementById('edit-strategy-modal');
    if (editModal) {
      editModal.addEventListener('click', function(e) {
        if (e.target === editModal) closeEditStrategyModal();
      });
    }

    // İşlem ekleme / silme olaylarını dinle (başka yerden işlem eklenirse strateji verilerini tazele)
    window.addEventListener('trade-saved', function() {
      if (currentUser) loadAllData();
    });
    window.addEventListener('trade-deleted', function() {
      if (currentUser) loadAllData();
    });

    await loadAllData();
    setupTimeFilterButtons();
    setupExportButtons();
    setupDetailAndEquityModals();

    // Dil değişimini dinle
    if (typeof i18n !== 'undefined' && i18n.onChange) {
      i18n.onChange(function() {
        renderStrategiesGrid();
        renderComparisonCharts();
        if (typeof i18n.apply === 'function') i18n.apply();
      });
    }

    wwLog.log('✅ Strategies başlatıldı!');

    // Onboarding veya parametre ile strateji ekleme modalını otomatik aç
    try {
      var urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('action') === 'new' || window.location.hash === '#add-strategy' || sessionStorage.getItem('wj_from_onboarding') === 'true') {
        setTimeout(function() {
          openAddStrategyModal();
        }, 250);
      }
    } catch(e) {}
  } catch(e) {
    console.error('❌ Strategies init hatası:', e);
    hideStrategySkeleton();
  }
}

// ============================================================
// ⭐ START STRATEGIES - DEPENDENCY KONTROLLÜ BAŞLATMA
// ============================================================
var strategiesCheckAttempts = 0;
var MAX_STRATEGIES_CHECK_ATTEMPTS = 160;

function startStrategies() {
  var isSbReady = typeof window.sb !== 'undefined';
  var isAuthReady = typeof window.requireAuth === 'function';
  var isJournalReady = typeof window.journal !== 'undefined';

  if (!isSbReady || !isAuthReady || !isJournalReady) {
    strategiesCheckAttempts++;
    if (strategiesCheckAttempts >= MAX_STRATEGIES_CHECK_ATTEMPTS) {
      if (typeof wwLog !== 'undefined') {
        wwLog.warn('⚠️ [Strategies] Bağımlılıklar zaman aşımına uğradı');
      }
      hideStrategySkeleton();
      return;
    }
    setTimeout(startStrategies, 30);
    return;
  }

  if (typeof lucide !== 'undefined') {
    try { lucide.createIcons(); } catch(e) {}
  }

  if (typeof loadNavbar === 'function') {
    var container = document.getElementById('navbar-container');
    if (container && container.innerHTML.trim() === '') {
      try { loadNavbar('navbar-container'); } catch(e) {}
    }
  }

  initStrategies();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startStrategies);
} else {
  startStrategies();
}

// ⭐ Global
window.initStrategies = initStrategies;
window.startStrategies = startStrategies;
window.renderStrategiesGrid = renderStrategiesGrid;
window.renderComparisonCharts = renderComparisonCharts;
window.openEditModal = openEditModal;
window.openDetailModal = openDetailModal;
window.openEquityModal = openEquityModal;
window.exportStrategyCSV = exportStrategyCSV;
window.exportStrategyPDF = exportStrategyPDF;
window.openAddStrategyModal = openAddStrategyModal;

wwLog.log('✅ strategies.js yüklendi!');
document.addEventListener('journal-changed', () => {
  if (window.__wj_journal_transitioning) return;
  window.location.reload();
});
