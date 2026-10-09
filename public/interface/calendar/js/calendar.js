// ============================================================
// CALENDAR.JS - TAKVİM ÖZEL FONKSİYONLAR (OPTİMİZE EDİLMİŞ)
// ============================================================

wwLog.log('📅 calendar.js yükleniyor...');

// ============================================================
// ⭐ TEMA KONTROLÜ - SAYFA YÜKLENİRKEN
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
    } catch (e) { }
  }

  wwLog.log('🎨 [calendar.js] Tema ayarlandı:', savedTheme || 'dark');
})();

// ============================================================
// ⭐ TEMA DEĞİŞİMİNİ DİNLE
// ============================================================

(function listenThemeChanges() {
  wwLog.log('🎨 [Calendar] Tema izleyici başlatıldı...');

  window.addEventListener('storage', function (e) {
    if (e.key === 'ww_theme') {
      wwLog.log('🔄 [Calendar] Tema değişikliği algılandı:', e.newValue);
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
        } catch (e) { }
      }

      if (typeof renderCalendar === 'function') {
        renderCalendar();
      }
    }
  });

  document.addEventListener('themeChanged', function (e) {
    wwLog.log('🔄 [Calendar] ThemeChanged event yakalandı');
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

      if (typeof renderCalendar === 'function') {
        renderCalendar();
      }
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      var savedTheme = localStorage.getItem('ww_theme');
      var isLight = savedTheme === 'light';
      document.body.classList.toggle('light-theme', isLight);

      if (typeof renderCalendar === 'function') {
        renderCalendar();
      }
    }
  });
})();

// ============================================================
// PnL & FORMAT YARDIMCILARI
// ============================================================

function calcTradePnL(t) {
  try {
    if (t.pnl !== undefined && t.pnl !== null) return parseFloat(t.pnl);
    if (!t.entry_price || !t.exit_price || !t.lot) return 0;
    if (typeof window.calcPnL === 'function') {
      return window.calcPnL(t.entry_price, t.exit_price, t.lot, t.direction, t.instrument, t.multiplier);
    }
    var mult = t.multiplier || window.INSTRUMENT_MULTIPLIERS?.[t.instrument] || 100000;
    var dir = (t.direction === 'LONG' || t.direction === 'BUY') ? 1 : -1;
    return dir * (parseFloat(t.exit_price) - parseFloat(t.entry_price)) * parseFloat(t.lot) * mult;
  } catch (e) {
    return 0;
  }
}

function formatCurrency(value) {
  try {
    if (typeof window.formatCurrency === 'function' && window.formatCurrency !== formatCurrency) {
      return window.formatCurrency(value);
    }
    var num = parseFloat(value) || 0;
    var currency = (typeof getCurrencySymbol === 'function') ? getCurrencySymbol() : '$';
    var absNum = Math.abs(num);
    var formatted = absNum.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (num >= 0 ? '+' : '-') + currency + formatted;
  } catch (e) {
    var n = parseFloat(value) || 0;
    return (n >= 0 ? '+' : '-') + '$' + Math.abs(n).toFixed(2);
  }
}

function formatShortPnL(value) {
  try {
    var num = parseFloat(value) || 0;
    var absVal = Math.abs(num);
    var formatted;
    if (absVal >= 1000000) {
      formatted = (absVal / 1000000).toFixed(2) + 'M';
    } else if (absVal >= 1000) {
      formatted = (absVal / 1000).toFixed(1) + 'K';
    } else if (absVal >= 100) {
      formatted = absVal.toFixed(0);
    } else if (absVal >= 1) {
      formatted = absVal.toFixed(1);
    } else {
      formatted = absVal.toFixed(2);
    }
    return (num > 0 ? '+' : (num < 0 ? '-' : '')) + formatted;
  } catch (e) {
    return '';
  }
}

function formatLocalDate(year, month, day) {
  var m = String(month + 1).padStart(2, '0');
  var d = String(day).padStart(2, '0');
  return year + '-' + m + '-' + d;
}

function getTradeDateKey(rawDate) {
  if (!rawDate) return '';
  return String(rawDate).split('T')[0].split(' ')[0];
}

function formatDayLabel(dateStr, lang) {
  try {
    var parts = dateStr.split('-');
    if (parts.length === 3) {
      var d = parseInt(parts[2], 10);
      var m = parseInt(parts[1], 10) - 1;
      return d + ' ' + getMonthNameShort(m, lang);
    }
    var dt = new Date(dateStr + 'T00:00:00');
    return dt.getDate() + ' ' + getMonthNameShort(dt.getMonth(), lang);
  } catch (e) {
    return '';
  }
}

// ============================================================
// DİL FONKSİYONLARI
// ============================================================

function getMonthName(month, lang) {
  var names = {
    tr: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
  };
  return (names[lang] || names.en)[month];
}

function getMonthNameShort(month, lang) {
  var names = {
    tr: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    de: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
  };
  return (names[lang] || names.en)[month];
}

function getDayNames(lang) {
  var names = {
    tr: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'],
    en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    de: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
  };
  return names[lang] || names.en;
}

function sanitizeHTML(str) {
  if (!str) return '';
  var temp = document.createElement('div');
  temp.textContent = str;
  return temp.innerHTML;
}

// ============================================================
// SKELETON GÖSTER/GİZLE
// ============================================================

function showCalendarSkeleton() {
  var el1 = document.getElementById('cal-grid-skeleton');
  var el2 = document.getElementById('cal-grid');
  var el3 = document.getElementById('calendar-summary-skeleton');
  var el4 = document.getElementById('calendar-summary');
  var el5 = document.getElementById('cal-legend');

  if (el1) el1.style.display = 'grid';
  if (el2) el2.style.display = 'none';
  if (el3) el3.style.display = 'grid';
  if (el4) el4.style.display = 'none';
  if (el5) el5.style.display = 'none';
}

function hideCalendarSkeleton() {
  var el1 = document.getElementById('cal-grid-skeleton');
  var el2 = document.getElementById('cal-grid');
  var el3 = document.getElementById('calendar-summary-skeleton');
  var el4 = document.getElementById('calendar-summary');
  var el5 = document.getElementById('cal-legend');

  if (el1) el1.style.display = 'none';
  if (el2) el2.style.display = 'grid';
  if (el3) el3.style.display = 'none';
  if (el4) el4.style.display = 'grid';
  if (el5) el5.style.display = 'flex';
}

// ============================================================
// TAKVİM STATE & RENDER
// ============================================================

var calendarTrades = [];
var currentMonth = new Date().getMonth();
var currentYear = new Date().getFullYear();
var jumpPopoverYear = currentYear;
var lastNavDirection = null;
var tradesByDate = {};

function renderCalendar() {
  try {
    var lang = typeof i18n !== 'undefined' && i18n.getCurrentLanguage ? i18n.getCurrentLanguage() : 'tr';
    var monthLabel = document.getElementById('calendar-month-label');
    var dayNamesContainer = document.getElementById('cal-day-names');
    var grid = document.getElementById('cal-grid');

    var monthName = getMonthName(currentMonth, lang);
    if (monthLabel) monthLabel.textContent = monthName + ' ' + currentYear;

    var firstDay = new Date(currentYear, currentMonth, 1);
    var dayNames = getDayNames(lang);

    if (dayNamesContainer) {
      dayNamesContainer.innerHTML = dayNames.map(function (name, idx) {
        var weekendClass = (idx === 5 || idx === 6) ? ' weekend' : '';
        return '<div class="dname' + weekendClass + '">' + name + '</div>';
      }).join('');
    }

    var daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    var firstDayOfWeek = firstDay.getDay();
    // Monday as start of week: 0(Sun)->6, 1(Mon)->0, ..., 6(Sat)->5
    var startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    var html = '';
    var totalTrades = 0;
    var totalPnl = 0;
    var wins = 0;
    var bestDay = { date: '', pnl: -Infinity };
    var worstDay = { date: '', pnl: Infinity };
    var anyTradedDay = false;

    var now = new Date();
    var todayStr = formatLocalDate(now.getFullYear(), now.getMonth(), now.getDate());

    for (var i = 0; i < startOffset; i++) {
      html += '<div class="cal-day empty"><div class="day-texture"></div></div>';
    }

    for (var d = 1; d <= daysInMonth; d++) {
      var dateStr = formatLocalDate(currentYear, currentMonth, d);
      var isToday = (dateStr === todayStr);
      var dateObj = new Date(currentYear, currentMonth, d);
      var dow = dateObj.getDay();
      var isWeekend = (dow === 0 || dow === 6);

      var dayTrades = tradesByDate[dateStr] || [];
      var hasTrade = dayTrades.length > 0;

      var dayPnl = 0;
      for (var j = 0; j < dayTrades.length; j++) {
        var t = dayTrades[j];
        if (t.exit_price || t.pnl !== undefined) {
          var pnl = calcTradePnL(t);
          dayPnl += pnl;
        }
      }

      totalTrades += dayTrades.length;
      totalPnl += dayPnl;
      if (dayPnl > 0) wins++;
      if (hasTrade) {
        anyTradedDay = true;
        if (dayPnl > bestDay.pnl) bestDay = { date: dateStr, pnl: dayPnl };
        if (dayPnl < worstDay.pnl) worstDay = { date: dateStr, pnl: dayPnl };
      }

      var colorClass = '';
      if (hasTrade && dayPnl > 0) {
        var absPnl = Math.abs(dayPnl);
        if (absPnl > 1000) colorClass = 'color-4';
        else if (absPnl > 500) colorClass = 'color-3';
        else if (absPnl > 100) colorClass = 'color-2';
        else colorClass = 'color-1';
      } else if (hasTrade && dayPnl < 0) {
        var absPnl2 = Math.abs(dayPnl);
        if (absPnl2 > 1000) colorClass = 'color-neg4';
        else if (absPnl2 > 500) colorClass = 'color-neg3';
        else if (absPnl2 > 100) colorClass = 'color-neg2';
        else colorClass = 'color-neg1';
      }

      var todayClass = isToday ? 'today' : '';
      var weekendClass2 = isWeekend ? 'weekend-cell' : '';

      var pnlDisplay = '';
      if (hasTrade && dayPnl !== 0) {
        pnlDisplay = formatShortPnL(dayPnl);
      }
      var pnlClass = dayPnl > 0 ? 'positive' : (dayPnl < 0 ? 'negative' : '');
      var barClass = dayPnl > 0 ? 'positive' : (dayPnl < 0 ? 'negative' : '');

      var tradeCountText = hasTrade ? (dayTrades.length + ' ' + (typeof i18n !== 'undefined' && i18n.t ? i18n.t('trades.stats.trade_count', 'işlem') : 'işlem')) : '';
      var ariaLabel = d + ' ' + monthName + (hasTrade ? ', ' + dayTrades.length + ' işlem, ' + pnlDisplay : ', işlem yok');

      html += '<div class="cal-day ' + colorClass + ' ' + todayClass + ' ' + weekendClass2 + '" data-date="' + dateStr + '" role="button" tabindex="0" aria-label="' + ariaLabel + '" onclick="openDayModal(\'' + dateStr + '\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openDayModal(\'' + dateStr + '\');}">' +
        '<div class="day-bg ' + (colorClass ? 'show' : '') + '"></div>' +
        '<div class="day-bg glow ' + (colorClass ? 'show' : '') + '"></div>' +
        '<div class="day-number">' + d + '</div>' +
        (pnlDisplay ? '<div class="day-pnl ' + pnlClass + '">' + pnlDisplay + '</div>' : '') +
        (tradeCountText ? '<div class="day-trade-count">' + tradeCountText + '</div>' : '') +
        '<div class="day-pnl-bar ' + (hasTrade ? 'show' : '') + ' ' + barClass + '"></div>' +
        '</div>';
    }

    if (grid) {
      grid.innerHTML = html;
      grid.classList.remove('anim-left', 'anim-right');
      if (lastNavDirection === 'left' || lastNavDirection === 'right') {
        void grid.offsetWidth;
        grid.classList.add(lastNavDirection === 'left' ? 'anim-left' : 'anim-right');
      }
      lastNavDirection = null;
    }

    var winRate = totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : 0;
    var tradesEl = document.getElementById('cal-summary-trades');
    if (tradesEl) tradesEl.textContent = totalTrades;

    var pnlEl = document.getElementById('cal-summary-pnl');
    if (pnlEl) {
      pnlEl.textContent = formatCurrency(totalPnl);
      pnlEl.className = 's-value' + (totalPnl >= 0 ? ' positive' : ' negative');
    }

    var winrateEl = document.getElementById('cal-summary-winrate');
    if (winrateEl) winrateEl.textContent = winRate + '%';

    var bestEl = document.getElementById('cal-summary-best');
    var bestDateEl = document.getElementById('cal-summary-best-date');
    if (bestEl) bestEl.textContent = anyTradedDay ? formatCurrency(bestDay.pnl) : '—';
    if (bestDateEl) bestDateEl.textContent = anyTradedDay ? formatDayLabel(bestDay.date, lang) : '';

    var worstEl = document.getElementById('cal-summary-worst');
    var worstDateEl = document.getElementById('cal-summary-worst-date');
    if (worstEl) worstEl.textContent = anyTradedDay ? formatCurrency(worstDay.pnl) : '—';
    if (worstDateEl) worstDateEl.textContent = anyTradedDay ? formatDayLabel(worstDay.date, lang) : '';

    hideCalendarSkeleton();
  } catch (e) {
    wwLog.warn('renderCalendar hatası:', e);
    hideCalendarSkeleton();
  }
}

// ============================================================
// GÜN DETAY MODAL & PERFORMANS HESAPLAMA (STRATEJİ PANELİ İLE AYNI)
// ============================================================

var currentModalDateStr = null;

function getDayPerformance(dateStr) {
  var trades = tradesByDate[dateStr] || [];
  var totalTrades = trades.length;
  var closedTrades = trades.filter(function (t) { return t.exit_price != null || t.pnl != null; });

  var winTrades = 0;
  var lossTrades = 0;
  var grossWin = 0;
  var grossLoss = 0;
  var totalPnL = 0;
  var runningPnL = 0;
  var peakPnL = 0;
  var maxDD = 0;

  var currentWinStreak = 0;
  var maxWinStreak = 0;
  var currentLossStreak = 0;
  var maxLossStreak = 0;

  var instrumentMap = {};

  var processedTrades = closedTrades.map(function (t) {
    var pnl = calcTradePnL(t);
    totalPnL += pnl;

    runningPnL += pnl;
    if (runningPnL > peakPnL) peakPnL = runningPnL;
    var dd = peakPnL - runningPnL;
    if (dd > maxDD) maxDD = dd;

    if (pnl > 0) {
      winTrades++;
      grossWin += pnl;
      currentWinStreak++;
      if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
      currentLossStreak = 0;
    } else if (pnl < 0) {
      lossTrades++;
      grossLoss += Math.abs(pnl);
      currentLossStreak++;
      if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
      currentWinStreak = 0;
    } else {
      currentWinStreak = 0;
      currentLossStreak = 0;
    }

    var instKey = (t.instrument || 'forex') + ' ' + (t.symbol || 'UNKNOWN');
    if (!instrumentMap[instKey]) {
      instrumentMap[instKey] = { instrument: t.instrument || 'forex', symbol: t.symbol || '', trades: 0, wins: 0, pnl: 0 };
    }
    instrumentMap[instKey].trades++;
    if (pnl > 0) instrumentMap[instKey].wins++;
    instrumentMap[instKey].pnl += pnl;

    return {
      trade_date: t.trade_date || t.date || dateStr,
      symbol: t.symbol || '—',
      instrument: t.instrument || 'forex',
      direction: t.direction || 'BUY',
      entry_price: t.entry_price,
      exit_price: t.exit_price,
      lot: t.lot,
      pnl: pnl
    };
  });

  var winRate = closedTrades.length > 0 ? Math.round((winTrades / closedTrades.length) * 100) : 0;
  var avgWin = winTrades > 0 ? (grossWin / winTrades) : 0;
  var avgLoss = lossTrades > 0 ? -(grossLoss / lossTrades) : 0;

  var profitFactor = null;
  if (grossLoss > 0) {
    profitFactor = parseFloat((grossWin / grossLoss).toFixed(2));
  } else if (grossWin > 0) {
    profitFactor = null; // infinity
  } else {
    profitFactor = 0;
  }

  var avgRR = 0;
  if (Math.abs(avgLoss) > 0) {
    avgRR = parseFloat((avgWin / Math.abs(avgLoss)).toFixed(2));
  } else if (avgWin > 0) {
    avgRR = '∞';
  }

  var instrumentBreakdown = Object.values(instrumentMap).map(function (item) {
    return {
      instrument: item.instrument,
      symbol: item.symbol,
      trades: item.trades,
      winRate: item.trades > 0 ? Math.round((item.wins / item.trades) * 100) : 0,
      pnl: item.pnl
    };
  });

  return {
    totalTrades: totalTrades,
    closedTradesCount: closedTrades.length,
    winTrades: winTrades,
    lossTrades: lossTrades,
    winRate: winRate,
    profitFactor: profitFactor,
    avgRR: avgRR,
    maxDrawdown: maxDD,
    maxWinStreak: maxWinStreak,
    maxLossStreak: maxLossStreak,
    avgWin: avgWin,
    avgLoss: avgLoss,
    totalPnL: totalPnL,
    instrumentBreakdown: instrumentBreakdown,
    tradesDetail: processedTrades
  };
}

function openDayModal(dateStr) {
  try {
    currentModalDateStr = dateStr;
    var modal = document.getElementById('calendar-day-modal');
    var title = document.getElementById('day-detail-title');
    var dot = document.getElementById('day-detail-dot');
    var body = document.getElementById('day-modal-body');

    var date = new Date(dateStr + 'T00:00:00');
    var lang = typeof i18n !== 'undefined' && i18n.getCurrentLanguage ? i18n.getCurrentLanguage() : 'tr';
    var formattedDate = date.toLocaleDateString(lang === 'tr' ? 'tr-TR' : (lang === 'de' ? 'de-DE' : 'en-US'), { day: '2-digit', month: 'long', year: 'numeric' });
    if (title) title.textContent = formattedDate;

    var perf = getDayPerformance(dateStr);

    if (dot) {
      if (perf.closedTradesCount === 0) {
        dot.style.background = 'var(--accent)';
        dot.style.boxShadow = '0 0 8px var(--accent)';
      } else if (perf.totalPnL >= 0) {
        dot.style.background = 'var(--green)';
        dot.style.boxShadow = '0 0 8px rgba(34,197,94,0.4)';
      } else {
        dot.style.background = 'var(--red)';
        dot.style.boxShadow = '0 0 8px rgba(239,68,68,0.4)';
      }
    }

    if (body) {
      if (perf.totalTrades === 0) {
        var noTradesText = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('calendar.no_trades', 'Bu güne ait işlem yok.') : 'Bu güne ait işlem yok.';
        body.innerHTML = '<div class="detail-empty-note">' + noTradesText + '</div>';
      } else {
        var pfDisplay = (perf.profitFactor === null) ? '∞' : perf.profitFactor;
        var rrDisplay = (perf.avgRR === null) ? '∞' : perf.avgRR;

        var tLblPF = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('strategies.detail.profit_factor', 'PROFIT FACTOR') : 'PROFIT FACTOR';
        var tLblRR = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('strategies.detail.avg_rr', 'AVG R:R') : 'AVG R:R';
        var tLblDD = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('strategies.detail.max_drawdown', 'MAX DRAWDOWN') : 'MAX DRAWDOWN';
        var tLblWR = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('strategies.detail.win_rate', 'WIN RATE') : 'WIN RATE';
        var tLblMWS = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('strategies.detail.max_win_streak', 'MAX WIN STREAK') : 'MAX WIN STREAK';
        var tLblMLS = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('strategies.detail.max_loss_streak', 'MAX LOSS STREAK') : 'MAX LOSS STREAK';
        var tLblAW = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('strategies.detail.avg_win', 'AVG WIN') : 'AVG WIN';
        var tLblAL = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('strategies.detail.avg_loss', 'AVG LOSS') : 'AVG LOSS';

        var metricsHtml = `
          <div class="detail-metrics-grid">
            <div class="detail-metric-box">
              <div class="detail-metric-lbl">${tLblPF}</div>
              <div class="detail-metric-val ${perf.profitFactor !== null && perf.profitFactor >= 1 ? 'pos' : (perf.profitFactor !== null && perf.profitFactor > 0 ? 'neg' : '')}">${pfDisplay}</div>
            </div>
            <div class="detail-metric-box">
              <div class="detail-metric-lbl">${tLblRR}</div>
              <div class="detail-metric-val">${rrDisplay}</div>
            </div>
            <div class="detail-metric-box">
              <div class="detail-metric-lbl">${tLblDD}</div>
              <div class="detail-metric-val ${perf.maxDrawdown > 0 ? 'neg' : ''}">${perf.maxDrawdown > 0 ? '-' : ''}${formatCurrency(perf.maxDrawdown)}</div>
            </div>
            <div class="detail-metric-box">
              <div class="detail-metric-lbl">${tLblWR}</div>
              <div class="detail-metric-val ${perf.winRate >= 50 ? 'pos' : 'neg'}">${perf.winRate}%</div>
            </div>
            <div class="detail-metric-box">
              <div class="detail-metric-lbl">${tLblMWS}</div>
              <div class="detail-metric-val pos">${perf.maxWinStreak}</div>
            </div>
            <div class="detail-metric-box">
              <div class="detail-metric-lbl">${tLblMLS}</div>
              <div class="detail-metric-val neg">${perf.maxLossStreak}</div>
            </div>
            <div class="detail-metric-box">
              <div class="detail-metric-lbl">${tLblAW}</div>
              <div class="detail-metric-val pos">${formatCurrency(perf.avgWin)}</div>
            </div>
            <div class="detail-metric-box">
              <div class="detail-metric-lbl">${tLblAL}</div>
              <div class="detail-metric-val neg">${formatCurrency(perf.avgLoss)}</div>
            </div>
          </div>
        `;

        var tBreakdown = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('strategies.detail.instrument_breakdown', 'Enstrüman Kırılımı') : 'Enstrüman Kırılımı';
        var tTradeList = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('strategies.detail.trade_list', 'İşlem Listesi') : 'İşlem Listesi';
        var tInstrument = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('strategies.detail.instrument', 'Enstrüman · Sembol') : 'Enstrüman · Sembol';
        var tTrades = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('strategies.detail.trades', 'İşlem') : 'İşlem';
        var tWinRate = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('strategies.detail.win_rate', 'Win Rate') : 'Win Rate';
        var tPnL = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('strategies.detail.pnl', 'K/Z') : 'K/Z';
        var tDate = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('strategies.detail.date', 'Tarih') : 'Tarih';
        var tSymbol = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('strategies.detail.symbol', 'Sembol') : 'Sembol';
        var tDirection = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('strategies.detail.direction', 'Yön') : 'Yön';
        var tEntry = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('strategies.detail.entry', 'Giriş') : 'Giriş';
        var tExit = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('strategies.detail.exit', 'Çıkış') : 'Çıkış';
        var tLot = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('strategies.detail.lot', 'Lot') : 'Lot';
        var tNoData = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('strategies.detail.no_data', 'Veri yok') : 'Veri yok';
        var tNoTradesInList = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('strategies.detail.no_trades_in_list', 'İşlem yok') : 'İşlem yok';

        var instrumentRows = perf.instrumentBreakdown.map(function (ib) {
          var displayName = sanitizeHTML((ib.instrument || '') + ' ' + (ib.symbol || ''));
          return '<tr><td>' + displayName + '</td><td>' + ib.trades + '</td><td>' + ib.winRate + '%</td><td class="' + (ib.pnl >= 0 ? 'pos' : 'neg') + '">' + formatCurrency(ib.pnl) + '</td></tr>';
        }).join('');

        var instrumentHtml = `
          <div class="detail-section-title">${tBreakdown}</div>
          <div class="detail-table-wrap" style="max-height:160px;">
            <table class="detail-table">
              <thead>
                <tr>
                  <th>${tInstrument}</th>
                  <th>${tTrades}</th>
                  <th>${tWinRate}</th>
                  <th>${tPnL}</th>
                </tr>
              </thead>
              <tbody>
                ${instrumentRows || '<tr><td colspan="4" style="text-align:center;color:var(--muted);">' + tNoData + '</td></tr>'}
              </tbody>
            </table>
          </div>
        `;

        var tradeRows = perf.tradesDetail.map(function (t) {
          var dStr = t.trade_date ? t.trade_date.split('T')[0] : dateStr;
          return '<tr>' +
            '<td>' + dStr + '</td>' +
            '<td><strong>' + sanitizeHTML(t.symbol) + '</strong></td>' +
            '<td>' + sanitizeHTML(t.instrument) + '</td>' +
            '<td><span style="color:' + (t.direction === 'LONG' || t.direction === 'BUY' ? 'var(--green)' : 'var(--red)') + ';font-weight:700;">' + sanitizeHTML(t.direction) + '</span></td>' +
            '<td>' + (t.entry_price != null ? t.entry_price : '—') + '</td>' +
            '<td>' + (t.exit_price != null ? t.exit_price : '—') + '</td>' +
            '<td>' + (t.lot != null ? t.lot : '—') + '</td>' +
            '<td class="' + (t.pnl >= 0 ? 'pos' : 'neg') + '">' + formatCurrency(t.pnl) + '</td>' +
            '</tr>';
        }).join('');

        var tradesHtml = `
          <div class="detail-section-title">${tTradeList} (${perf.tradesDetail.length})</div>
          <div class="detail-table-wrap">
            <table class="detail-table">
              <thead>
                <tr>
                  <th>${tDate}</th>
                  <th>${tSymbol}</th>
                  <th>${tInstrument}</th>
                  <th>${tDirection}</th>
                  <th>${tEntry}</th>
                  <th>${tExit}</th>
                  <th>${tLot}</th>
                  <th>${tPnL}</th>
                </tr>
              </thead>
              <tbody>
                ${tradeRows || '<tr><td colspan="8" style="text-align:center;color:var(--muted);">' + tNoTradesInList + '</td></tr>'}
              </tbody>
            </table>
          </div>
        `;

        body.innerHTML = metricsHtml + instrumentHtml + tradesHtml;
      }
    }

    if (modal) {
      modal.classList.add('active');
      modal.style.display = 'flex';
    }
  } catch (e) {
    console.error('openDayModal error:', e);
  }
}

function closeDayModal() {
  var modal = document.getElementById('calendar-day-modal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
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
    setTimeout(function () { URL.revokeObjectURL(url); }, 200);
  } catch (e) { }
}

function csvEscape(val) {
  var s = (val === null || val === undefined) ? '' : String(val);
  return '"' + s.replace(/"/g, '""') + '"';
}

function exportDayCSV(dateStr) {
  try {
    var targetDate = dateStr || currentModalDateStr;
    if (!targetDate) return;
    var perf = getDayPerformance(targetDate);
    var rows = [[
      'Tarih', 'Sembol', 'Enstrüman', 'Yön', 'Giriş', 'Çıkış', 'Lot', 'K/Z'
    ]];
    perf.tradesDetail.forEach(function (t) {
      rows.push([t.trade_date, t.symbol, t.instrument, t.direction, t.entry_price, t.exit_price, t.lot, t.pnl.toFixed(2)]);
    });
    rows.push([]);
    var pfDisplay = (perf.profitFactor === null) ? '∞' : perf.profitFactor;
    rows.push(['GÜNLÜK ÖZET']);
    rows.push(['Toplam İşlem', perf.totalTrades]);
    rows.push(['Win Rate', perf.winRate + '%']);
    rows.push(['Toplam K/Z', perf.totalPnL.toFixed(2)]);
    rows.push(['Profit Factor', pfDisplay]);
    rows.push(['Maks. Drawdown', perf.maxDrawdown.toFixed(2)]);

    var csvContent = rows.map(function (r) { return r.map(csvEscape).join(','); }).join('\r\n');
    downloadBlob('\uFEFF' + csvContent, targetDate + '_islemler.csv', 'text/csv;charset=utf-8;');
    if (typeof showToast === 'function') showToast(typeof i18n !== 'undefined' && i18n.t ? i18n.t('toast.csv_exported', 'CSV indirildi!') : 'CSV indirildi!');
  } catch (e) {
    if (typeof showToast === 'function') showToast('CSV export error', 'error');
  }
}

async function exportDayPDF(dateStr) {
  try {
    var targetDate = dateStr || currentModalDateStr;
    if (!targetDate) return;
    if (typeof window.jspdf === 'undefined' && typeof jsPDF === 'undefined') {
      if (typeof window.loadJsPDF === 'function') {
        await window.loadJsPDF(true);
      }
    }
    var PDFConstructor = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : (typeof jsPDF !== 'undefined' ? jsPDF : null);
    if (!PDFConstructor) {
      window.print();
      return;
    }
    var perf = getDayPerformance(targetDate);
    var doc = new PDFConstructor({ unit: 'mm', format: 'a4' });
    var pageW = doc.internal.pageSize.getWidth();
    var margin = 12;
    var y = margin + 5;

    doc.setFillColor(10, 10, 15);
    doc.rect(0, 0, pageW, 6, 'F');
    doc.setFillColor(139, 92, 246);
    doc.rect(0, 0, pageW, 3, 'F');
    doc.setTextColor(30, 30, 40);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Wawe Journal - Günlük Rapor: ' + targetDate, margin, y);
    y += 10;

    var pfDisplay = (perf.profitFactor === null) ? '∞' : perf.profitFactor;
    var summaryRows = [
      ['Toplam İşlem', String(perf.totalTrades), 'Win Rate', perf.winRate + '%'],
      ['Toplam K/Z', formatCurrency(perf.totalPnL), 'Profit Factor', String(pfDisplay)],
      ['Maks. Drawdown', formatCurrency(perf.maxDrawdown), 'Maks. Win/Loss Seri', perf.maxWinStreak + ' / ' + perf.maxLossStreak]
    ];

    if (doc.autoTable) {
      doc.autoTable({
        startY: y,
        head: [['Metrik', 'Değer', 'Metrik', 'Değer']],
        body: summaryRows,
        theme: 'striped',
        headStyles: { fillColor: [139, 92, 246], textColor: [255, 255, 255], fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 },
        margin: { left: margin, right: margin }
      });
      y = doc.lastAutoTable.finalY + 8;

      var tradeTableRows = perf.tradesDetail.map(function (t) {
        return [
          t.trade_date ? t.trade_date.split('T')[0] : targetDate,
          t.symbol,
          t.instrument,
          t.direction,
          t.entry_price != null ? String(t.entry_price) : '—',
          t.exit_price != null ? String(t.exit_price) : '—',
          t.lot != null ? String(t.lot) : '—',
          formatCurrency(t.pnl)
        ];
      });

      doc.autoTable({
        startY: y,
        head: [['Tarih', 'Sembol', 'Enstrüman', 'Yön', 'Giriş', 'Çıkış', 'Lot', 'K/Z']],
        body: tradeTableRows.length ? tradeTableRows : [['—', '—', '—', '—', '—', '—', '—', 'İşlem yok']],
        theme: 'grid',
        headStyles: { fillColor: [30, 30, 46], textColor: [255, 255, 255], fontSize: 7 },
        styles: { fontSize: 7, cellPadding: 1.5 },
        margin: { left: margin, right: margin }
      });
    }

    doc.save(targetDate + '_rapor.pdf');
    if (typeof showToast === 'function') showToast(typeof i18n !== 'undefined' && i18n.t ? i18n.t('toast.pdf_exported', 'PDF indirildi!') : 'PDF indirildi!');
  } catch (e) {
    console.error('PDF export error:', e);
    window.print();
  }
}

// Global aliases
window.openDayPopup = openDayModal;
window.openDayModal = openDayModal;
window.closeDayPopup = closeDayModal;
window.closeDayModal = closeDayModal;
window.exportDayCSV = exportDayCSV;
window.exportDayPDF = exportDayPDF;

// ============================================================
// AY GEÇİŞİ
// ============================================================

function goToMonth(month, year, direction) {
  currentMonth = month;
  currentYear = year;
  lastNavDirection = direction || null;
  renderCalendar();
}

function loadCalendarTrades(trades) {
  calendarTrades = trades || [];
  tradesByDate = {};
  calendarTrades.forEach(function (t) {
    var dKey = getTradeDateKey(t.trade_date || t.date);
    if (dKey) {
      if (!tradesByDate[dKey]) tradesByDate[dKey] = [];
      tradesByDate[dKey].push(t);
    }
  });
  renderCalendar();
}

// ============================================================
// DB'DEN İŞLEMLERİ YÜKLE
// ============================================================

async function loadCalendarTradesFromDB(userId) {
  var jid = window.journal ? window.journal.getActiveJournalId() : null;
  if (!jid) {
    jid = localStorage.getItem('ww_active_journal_id') || localStorage.getItem('activeJournalId');
  }
  if (!jid) {
    if (typeof wwLog !== 'undefined') wwLog.warn('Aktif journal yok, veri yüklenmiyor');
    return [];
  }

  // ⚡ SWR Önbellek Kontrolü: trades_calendar, trades veya trades_dashboard varsa 0ms beklemeden dön
  if (typeof window !== 'undefined' && window.wwCache) {
    var cachedTrades = window.wwCache.get('trades_calendar', userId, jid) ||
                       window.wwCache.get('trades', userId, jid) ||
                       window.wwCache.get('trades_dashboard', userId, jid);
    if (cachedTrades && cachedTrades.length > 0) {
      // Arka planda sessizce taze verileri kontrol et (SWR revalidate)
      fetchFreshCalendarTrades(userId, jid);
      return cachedTrades;
    }
  }

  return await fetchFreshCalendarTrades(userId, jid, true);
}

async function fetchFreshCalendarTrades(userId, jid, isInitialLoad) {
  var allTrades = [];
  var pageSize = 1000;
  var from = 0;
  var hasMore = true;

  try {
    while (hasMore) {
      var { data: pageData, error } = await sb
        .from('trades')
        .select('id,trade_date,entry_price,exit_price,stop_loss,take_profit,lot,direction,instrument,multiplier,symbol,pnl')
        .eq('user_id', userId)
        .eq('journal_id', jid)
        .order('trade_date', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) {
        if (isInitialLoad && typeof showToast === 'function') {
          var errMsg = typeof i18n !== 'undefined' && i18n.t ? i18n.t('toast.load_error', 'Veri yüklenemedi: ') : 'Veri yüklenemedi: ';
          showToast(errMsg + error.message, 'error');
        }
        return [];
      }

      if (pageData && pageData.length > 0) {
        allTrades = allTrades.concat(pageData);
        if (pageData.length < pageSize) hasMore = false;
        else from += pageSize;
      } else {
        hasMore = false;
      }
    }

    // ⚡ Sonucu önbelleğe kaydet
    if (typeof window !== 'undefined' && window.wwCache) {
      window.wwCache.set('trades_calendar', userId, jid, allTrades);
      window.wwCache.set('trades', userId, jid, allTrades);
    }

    if (!isInitialLoad && trades) {
      // SWR Revalidation: Veri değiştiyse takvimi güncelle
      var isCountChanged = trades.length !== allTrades.length;
      var isFirstItemChanged = trades.length > 0 && allTrades.length > 0 && trades[0].id !== allTrades[0].id;
      if (isCountChanged || isFirstItemChanged) {
        loadCalendarTrades(allTrades);
      }
    }
  } catch (err) {
    console.error('fetchFreshCalendarTrades hatası:', err);
  }

  return allTrades;
}

// ============================================================
// INIT CALENDAR
// ============================================================

var isCalendarInitialized = false;

async function initCalendar() {
  if (isCalendarInitialized) return;
  isCalendarInitialized = true;

  try {
    wwLog.log('📅 Calendar başlatılıyor...');

    if (typeof sb === 'undefined' || !sb) {
      console.error('❌ Supabase client (sb) tanımlı değil!');
      hideCalendarSkeleton();
      return;
    }

    // Navigation buttons
    var prevBtn = document.getElementById('cal-prev');
    var nextBtn = document.getElementById('cal-next');
    var todayBtn = document.getElementById('cal-today');

    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        if (currentMonth === 0) {
          goToMonth(11, currentYear - 1, 'right');
        } else {
          goToMonth(currentMonth - 1, currentYear, 'right');
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        if (currentMonth === 11) {
          goToMonth(0, currentYear + 1, 'left');
        } else {
          goToMonth(currentMonth + 1, currentYear, 'left');
        }
      });
    }

    if (todayBtn) {
      todayBtn.addEventListener('click', function () {
        var now = new Date();
        var m = now.getMonth();
        var y = now.getFullYear();
        var dir = (y > currentYear || (y === currentYear && m > currentMonth)) ? 'left' : (y < currentYear || (y === currentYear && m < currentMonth)) ? 'right' : null;
        goToMonth(m, y, dir);
      });
    }

    // Modal buttons
    var closeBtn = document.getElementById('close-day-modal');
    var closeBtn2 = document.getElementById('close-day-modal-btn');
    var modalOverlay = document.getElementById('calendar-day-modal');
    var dayCsvBtn = document.getElementById('day-export-csv');
    var dayPdfBtn = document.getElementById('day-export-pdf');

    if (closeBtn) closeBtn.addEventListener('click', closeDayModal);
    if (closeBtn2) closeBtn2.addEventListener('click', closeDayModal);
    if (modalOverlay) {
      modalOverlay.addEventListener('click', function (e) {
        if (e.target === modalOverlay) closeDayModal();
      });
    }
    if (dayCsvBtn) dayCsvBtn.addEventListener('click', function () { exportDayCSV(); });
    if (dayPdfBtn) dayPdfBtn.addEventListener('click', function () { exportDayPDF(); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDayModal();
    });

    // Touch events for mobile swipe
    var grid = document.getElementById('cal-grid');
    if (grid) {
      var touchStartX = 0, touchStartY = 0, touching = false;

      grid.addEventListener('touchstart', function (e) {
        if (!e.touches || !e.touches.length) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touching = true;
      }, { passive: true });

      grid.addEventListener('touchend', function (e) {
        if (!touching) return;
        touching = false;
        var touch = (e.changedTouches && e.changedTouches[0]) || null;
        if (!touch) return;
        var dx = touch.clientX - touchStartX;
        var dy = touch.clientY - touchStartY;
        if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        if (dx < 0) {
          if (nextBtn) nextBtn.click();
        } else {
          if (prevBtn) prevBtn.click();
        }
      }, { passive: true });
    }

    // Month / Year Jump popover
    var titleBtn = document.getElementById('cal-title-btn');
    var popover = document.getElementById('cal-jump-popover');
    var yearLabel = document.getElementById('jump-year-label');
    var monthsGrid = document.getElementById('jump-months-grid');
    var yearPrev = document.getElementById('jump-year-prev');
    var yearNext = document.getElementById('jump-year-next');

    if (titleBtn && popover) {
      function renderMonthsGrid() {
        if (!yearLabel || !monthsGrid) return;
        yearLabel.textContent = jumpPopoverYear;
        var lang = typeof i18n !== 'undefined' && i18n.getCurrentLanguage ? i18n.getCurrentLanguage() : 'tr';
        var html = '';
        for (var m = 0; m < 12; m++) {
          var isCurrent = (m === currentMonth && jumpPopoverYear === currentYear);
          html += '<button type="button" class="jump-month-btn' + (isCurrent ? ' current' : '') + '" data-month="' + m + '">' + getMonthNameShort(m, lang) + '</button>';
        }
        monthsGrid.innerHTML = html;
      }

      function openPopover() {
        jumpPopoverYear = currentYear;
        renderMonthsGrid();
        popover.classList.add('open');
        titleBtn.classList.add('open');
        titleBtn.setAttribute('aria-expanded', 'true');
      }

      function closePopover() {
        popover.classList.remove('open');
        titleBtn.classList.remove('open');
        titleBtn.setAttribute('aria-expanded', 'false');
      }

      titleBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (popover.classList.contains('open')) closePopover(); else openPopover();
      });

      document.addEventListener('click', function (e) {
        if (!e.target.closest('#cal-jump-popover') && !e.target.closest('#cal-title-btn')) closePopover();
      });
      popover.addEventListener('click', function (e) { e.stopPropagation(); });

      if (yearPrev) yearPrev.addEventListener('click', function () { jumpPopoverYear--; renderMonthsGrid(); });
      if (yearNext) yearNext.addEventListener('click', function () { jumpPopoverYear++; renderMonthsGrid(); });

      if (monthsGrid) {
        monthsGrid.addEventListener('click', function (e) {
          var btn = e.target.closest('button[data-month]');
          if (!btn) return;
          var m = parseInt(btn.getAttribute('data-month'), 10);
          var y = jumpPopoverYear;
          var dir = (y > currentYear || (y === currentYear && m > currentMonth)) ? 'left' : (y < currentYear || (y === currentYear && m < currentMonth)) ? 'right' : null;
          goToMonth(m, y, dir);
          closePopover();
        });
      }
    }

    // Skeleton ve veri yükleme
    showCalendarSkeleton();

    if (typeof requireAuth !== 'function') {
      console.warn('⚠️ requireAuth tanımlı değil');
      hideCalendarSkeleton();
      return;
    }

    var user = await requireAuth();
    if (!user) {
      hideCalendarSkeleton();
      return;
    }

    var jid = (window.journal && typeof window.journal.getActiveJournalId === 'function')
      ? window.journal.getActiveJournalId()
      : (localStorage.getItem('ww_active_journal_id') || localStorage.getItem('activeJournalId'));

    if (!jid && window.journal && typeof window.journal.ensureActiveJournal === 'function') {
      try {
        await window.journal.ensureActiveJournal(user.id);
      } catch (e) { }
    } else if (window.journal && typeof window.journal.ensureActiveJournal === 'function') {
      window.journal.ensureActiveJournal(user.id).catch(function () {});
    }

    // Over-Trade bildirimleri (arka planda bloklamayan)
    try {
      if (typeof updateOvertradeBell === 'function') {
        updateOvertradeBell().catch(function () {});
      }
    } catch (e) { }

    // Verileri çek ve takvimi çiz
    var tradesData = await loadCalendarTradesFromDB(user.id);
    loadCalendarTrades(tradesData || []);

    // i18n değişimlerini dinle
    if (typeof i18n !== 'undefined' && i18n.onChange) {
      i18n.onChange(function () {
        renderCalendar();
        if (typeof i18n.apply === 'function') i18n.apply();
      });
    }

    wwLog.log('✅ Calendar başlatıldı!');
  } catch (e) {
    console.error('❌ Calendar init hatası:', e);
    hideCalendarSkeleton();
  }
}

// ============================================================
// ⭐ START CALENDAR - DEPENDENCY KONTROLLÜ BAŞLATMA
// ============================================================

var calendarCheckAttempts = 0;
var MAX_CALENDAR_CHECK_ATTEMPTS = 160; // 160 * 50ms = 8 saniye max

function startCalendar() {
  var isSbReady = typeof window.sb !== 'undefined';
  var isAuthReady = typeof window.requireAuth === 'function';
  var isJournalReady = typeof window.journal !== 'undefined';

  if (!isSbReady || !isAuthReady || !isJournalReady) {
    calendarCheckAttempts++;
    if (calendarCheckAttempts >= MAX_CALENDAR_CHECK_ATTEMPTS) {
      if (typeof wwLog !== 'undefined') {
        wwLog.warn('⚠️ [Calendar] Bağımlılıklar zaman aşımına uğradı');
      }
      hideCalendarSkeleton();
      return;
    }
    setTimeout(startCalendar, 50);
    return;
  }

  if (typeof lucide !== 'undefined') {
    try { lucide.createIcons(); } catch (e) { }
  }

  if (typeof loadNavbar === 'function') {
    var container = document.getElementById('navbar-container');
    if (container && container.innerHTML.trim() === '') {
      try { loadNavbar('navbar-container'); } catch (e) { }
    }
  }

  initCalendar();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startCalendar);
} else {
  startCalendar();
}

// ⭐ Global
window.initCalendar = initCalendar;
window.startCalendar = startCalendar;
window.renderCalendar = renderCalendar;
window.calcTradePnL = calcTradePnL;
window.formatCurrency = formatCurrency;
window.formatShortPnL = formatShortPnL;
window.loadTrades = initCalendar;
window.refresh = initCalendar;

wwLog.log('✅ calendar.js yüklendi! (OPTİMİZE EDİLDİ)');
document.addEventListener('journal-changed', () => {
  if (window.__wj_journal_transitioning) return;
  window.location.reload();
});
