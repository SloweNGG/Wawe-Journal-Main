// ============================================================
// CALENDAR.JS - TAKVİM ÖZEL FONKSİYONLAR (OPTİMİZE EDİLMİŞ)
// ============================================================

console.log('📅 calendar.js yükleniyor...');

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
    } catch(e) {}
  }
  
  console.log('🎨 [calendar.js] Tema ayarlandı:', savedTheme || 'dark');
})();

// ============================================================
// ⭐ TEMA DEĞİŞİMİNİ DİNLE
// ============================================================

(function listenThemeChanges() {
  console.log('🎨 [Calendar] Tema izleyici başlatıldı...');
  
  window.addEventListener('storage', function(e) {
    if (e.key === 'ww_theme') {
      console.log('🔄 [Calendar] Tema değişikliği algılandı:', e.newValue);
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
        } catch(e) {}
      }
      
      if (typeof renderCalendar === 'function') {
        setTimeout(function() { renderCalendar(); }, 100);
      }
    }
  });
  
  document.addEventListener('themeChanged', function(e) {
    console.log('🔄 [Calendar] ThemeChanged event yakalandı');
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
        setTimeout(function() { renderCalendar(); }, 100);
      }
    }
  });
  
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
      var savedTheme = localStorage.getItem('ww_theme');
      var isLight = savedTheme === 'light';
      document.body.classList.toggle('light-theme', isLight);
      
      if (typeof renderCalendar === 'function') {
        setTimeout(function() { renderCalendar(); }, 100);
      }
    }
  });
  
  console.log('✅ [Calendar] Tema izleyici yüklendi!');
})();

// ============================================================
// INSTRUMENT_MULTIPLIERS - script.js'den gelir
// ============================================================

// ============================================================
// PnL HESAPLAMA
// ============================================================
function calcTradePnL(t) {
  try {
    if (!t.entry_price || !t.exit_price || !t.lot) return 0;
    var mult = t.multiplier || window.INSTRUMENT_MULTIPLIERS?.[t.instrument] || 100000;
    var dir = (t.direction === 'LONG' || t.direction === 'BUY') ? 1 : -1;
    return dir * (parseFloat(t.exit_price) - parseFloat(t.entry_price)) * parseFloat(t.lot) * mult;
  } catch(e) {
    return 0;
  }
}

// ============================================================
// FORMAT FONKSİYONLARI
// ============================================================
function formatCurrency(value) {
  try {
    var num = parseFloat(value) || 0;
    var currency = (typeof getCurrencySymbol === 'function') ? getCurrencySymbol() : '$';
    var absNum = Math.abs(num);
    var formatted = absNum.toFixed(2);
    var parts = formatted.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    formatted = parts.join(',');
    return (num >= 0 ? '+' : '-') + currency + formatted;
  } catch(e) {
    return (value >= 0 ? '+' : '') + value.toFixed(2);
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
  } catch(e) {
    return '';
  }
}

function formatDayLabel(dateStr, lang) {
  try {
    var d = new Date(dateStr + 'T00:00:00');
    return d.getDate() + ' ' + getMonthNameShort(d.getMonth(), lang);
  } catch(e) {
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

// ============================================================
// GÜVENLİK FONKSİYONLARI
// ============================================================
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
// TAKVİM FONKSİYONLARI
// ============================================================
var calendarTrades = [];
var currentMonth = new Date().getMonth();
var currentYear = new Date().getFullYear();
var jumpPopoverYear = currentYear;
var lastNavDirection = null;
var calendarRenderTimeout = null;

// ⭐ PERFORMANS: Gün bazında gruplanmış veri
var tradesByDate = {};
var calendarRenderCache = {};
var CALENDAR_CACHE_TTL = 30000; // 30 saniye

function renderCalendar() {
  try {
    hideCalendarSkeleton();

    var lang = typeof i18n !== 'undefined' && i18n.getCurrentLanguage ? i18n.getCurrentLanguage() : 'en';
    var monthLabel = document.getElementById('calendar-month-label');
    var dayNamesContainer = document.getElementById('cal-day-names');
    var grid = document.getElementById('cal-grid');

    var monthName = getMonthName(currentMonth, lang);
    if (monthLabel) monthLabel.textContent = monthName + ' ' + currentYear;

    var firstDay = new Date(currentYear, currentMonth, 1);
    var dayNames = getDayNames(lang);
    
    if (dayNamesContainer) {
      dayNamesContainer.innerHTML = dayNames.map(function(name, idx) {
        var weekendClass = (idx === 5 || idx === 6) ? ' weekend' : '';
        return '<div class="dname' + weekendClass + '">' + name + '</div>';
      }).join('');
    }

    var daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    var firstDayOfWeek = firstDay.getDay();
    var startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    var html = '';
    var totalTrades = 0;
    var totalPnl = 0;
    var wins = 0;
    var bestDay = { date: '', pnl: -Infinity };
    var worstDay = { date: '', pnl: Infinity };
    var anyTradedDay = false;
    var maxPnl = 0;

    for (var i = 0; i < startOffset; i++) {
      html += '<div class="cal-day empty"><div class="day-texture"></div></div>';
    }

    for (var d = 1; d <= daysInMonth; d++) {
      var dateObj = new Date(currentYear, currentMonth, d);
      var dateStr = dateObj.toISOString().split('T')[0];
      var isToday = dateStr === new Date().toISOString().split('T')[0];
      var dow = dateObj.getDay();
      var isWeekend = (dow === 0 || dow === 6);

      // ⭐ DOĞRUDAN GRUPLANMIŞ VERİDEN AL - FİLTRELEME YOK
      var dayTrades = tradesByDate[dateStr] || [];
      var hasTrade = dayTrades.length > 0;

      var dayPnl = 0;
      for (var j = 0; j < dayTrades.length; j++) {
        var t = dayTrades[j];
        if (t.exit_price) {
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
        if (Math.abs(dayPnl) > maxPnl) maxPnl = Math.abs(dayPnl);
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
      
      var tradeCountText = hasTrade ? (dayTrades.length + ' ' + (typeof i18n !== 'undefined' && i18n.t ? i18n.t('trades.stats.trade_count') : 'işlem')) : '';
      var ariaLabel = d + ' ' + monthName + (hasTrade ? ', ' + dayTrades.length + ' işlem, ' + pnlDisplay : ', işlem yok');

      html += '\n        <div class="cal-day ' + colorClass + ' ' + todayClass + ' ' + weekendClass2 + '" data-date="' + dateStr + '" role="button" tabindex="0" aria-label="' + ariaLabel + '" onclick="openDayPopup(\'' + dateStr + '\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openDayPopup(\'' + dateStr + '\');}">\n          <div class="day-bg ' + (colorClass ? 'show' : '') + '"></div>\n          <div class="day-bg glow ' + (colorClass ? 'show' : '') + '"></div>\n          <div class="day-number">' + d + '</div>\n          ' + (pnlDisplay ? '<div class="day-pnl ' + pnlClass + '">' + pnlDisplay + '</div>' : '') + '\n          ' + (tradeCountText ? '<div class="day-trade-count">' + tradeCountText + '</div>' : '') + '\n          <div class="day-pnl-bar ' + (hasTrade ? 'show' : '') + ' ' + barClass + '"></div>\n        </div>\n      ';
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
  } catch(e) {
    console.warn('renderCalendar hatası:', e);
  }
}

// ============================================================
// POPUP FONKSİYONLARI
// ============================================================
var currentPopupFilter = 'all';
var currentPopupDateTrades = [];

function renderPopupTrades() {
  var body = document.getElementById('popup-body');
  if (!body) return;
  var filtered = currentPopupDateTrades.filter(function(t) {
    if (currentPopupFilter === 'all') return true;
    var isLong = (t.direction === 'LONG' || t.direction === 'BUY');
    return currentPopupFilter === 'long' ? isLong : !isLong;
  });
  if (filtered.length === 0) {
    var noText = typeof i18n !== 'undefined' && i18n.t ? i18n.t('calendar.no_trades') : 'İşlem yok';
    body.innerHTML = '<div class="popup-empty">' + noText + '</div>';
    return;
  }
  body.innerHTML = filtered.map(function(t) {
    var pnl = t.exit_price ? calcTradePnL(t) : null;
    var pnlText = pnl !== null ? formatCurrency(pnl) : (typeof i18n !== 'undefined' && i18n.t ? i18n.t('trades.open') : 'Açık');
    var pnlClass = pnl !== null ? (pnl >= 0 ? 'positive' : 'negative') : '';
    var isLong = t.direction === 'LONG' || t.direction === 'BUY';
    var badgeClass = isLong ? 'long' : 'short';
    var badgeText = isLong ? 'L' : 'S';
    var safeSymbol = sanitizeHTML(t.symbol || '—');
    return '<div class="popup-trade">\n        <div class="pt-left">\n          <span class="pt-badge ' + badgeClass + '">' + badgeText + '</span>\n          <span class="pt-symbol">' + safeSymbol + '</span>\n        </div>\n        <span class="pt-pnl ' + pnlClass + '">' + pnlText + '</span>\n      </div>';
  }).join('');
}

function openDayPopup(dateStr) {
  try {
    var overlay = document.getElementById('calendar-popup-overlay');
    var popup = document.getElementById('calendar-day-popup');
    var title = document.getElementById('popup-date-title');
    var filterBar = document.getElementById('popup-filter');

    var date = new Date(dateStr + 'T00:00:00');
    var lang = typeof i18n !== 'undefined' && i18n.getCurrentLanguage ? i18n.getCurrentLanguage() : 'en';
    if (title) title.textContent = date.toLocaleDateString(lang, { day: '2-digit', month: 'long', year: 'numeric' });

    // ⭐ DOĞRUDAN GRUPLANMIŞ VERİDEN AL
    currentPopupDateTrades = tradesByDate[dateStr] || [];
    currentPopupFilter = 'all';

    if (filterBar) {
      filterBar.style.display = currentPopupDateTrades.length > 0 ? 'flex' : 'none';
      var btns = filterBar.querySelectorAll('button');
      btns.forEach(function(b) { b.classList.toggle('active', b.getAttribute('data-filter') === 'all'); });
    }

    renderPopupTrades();

    if (overlay) overlay.classList.add('active');
    if (popup) popup.classList.add('active');
  } catch(e) {}
}
window.openDayPopup = openDayPopup;

function closeDayPopup() {
  var overlay = document.getElementById('calendar-popup-overlay');
  var popup = document.getElementById('calendar-day-popup');
  if (overlay) overlay.classList.remove('active');
  if (popup) popup.classList.remove('active');
}

// ============================================================
// AY GEÇİŞİ
// ============================================================
function goToMonth(month, year, direction) {
  currentMonth = month;
  currentYear = year;
  lastNavDirection = direction || null;
  showCalendarSkeleton();
  if (calendarRenderTimeout) clearTimeout(calendarRenderTimeout);
  calendarRenderTimeout = setTimeout(renderCalendar, 180);
}

function loadCalendarTrades(trades) {
  calendarTrades = trades || [];
  
  // ⭐ İŞLEMLERİ GÜN BAZINDA GRUPLA - OPTİMİZASYON
  tradesByDate = {};
  calendarTrades.forEach(function(t) {
    if (t.trade_date) {
      if (!tradesByDate[t.trade_date]) tradesByDate[t.trade_date] = [];
      tradesByDate[t.trade_date].push(t);
    }
  });
  
  showCalendarSkeleton();
  if (calendarRenderTimeout) clearTimeout(calendarRenderTimeout);
  calendarRenderTimeout = setTimeout(renderCalendar, 200);
}

// ============================================================
// ⭐ OPTİMİZE EDİLMİŞ LOAD TRADES
// ============================================================
async function loadCalendarTradesFromDB(userId) {
  // ⭐ SADECE GEREKLİ KOLONLAR - OPTİMİZE EDİLDİ
  var { data, error } = await sb
    .from('trades')
    .select('id,trade_date,entry_price,exit_price,lot,direction,instrument,multiplier,symbol')
    .eq('user_id', userId)
    .order('trade_date', { ascending: true })
    .limit(1000); // ⭐ MAX 1000 İŞLEM
  
  if (error) {
    if (typeof showToast === 'function') {
      var errMsg = typeof i18n !== 'undefined' && i18n.t ? i18n.t('toast.load_error') : 'Veri yüklenemedi: ';
      showToast(errMsg + error.message, 'error');
    }
    return null;
  }
  
  return data || [];
}

// ============================================================
// INIT CALENDAR
// ============================================================
async function initCalendar() {
  try {
    console.log('📅 Calendar başlatılıyor...');
    
    if (typeof sb === 'undefined' || !sb) {
      console.error('❌ Supabase client (sb) tanımlı değil!');
      return;
    }
    
    // Event listener'lar
    var prevBtn = document.getElementById('cal-prev');
    var nextBtn = document.getElementById('cal-next');
    var todayBtn = document.getElementById('cal-today');
    var closeBtn = document.getElementById('popup-close');
    var popupOverlay = document.getElementById('calendar-popup-overlay');
    var popupFilterBar = document.getElementById('popup-filter');
    
    if (prevBtn) {
      prevBtn.addEventListener('click', function() {
        var m = currentMonth, y = currentYear;
        if (m === 0) { m = 11; y--; } else { m--; }
        goToMonth(m, y, 'right');
      });
    }
    
    if (nextBtn) {
      nextBtn.addEventListener('click', function() {
        var m = currentMonth, y = currentYear;
        if (m === 11) { m = 0; y++; } else { m++; }
        goToMonth(m, y, 'left');
      });
    }
    
    if (todayBtn) {
      todayBtn.addEventListener('click', function() {
        var today = new Date();
        var dir = (today.getFullYear() > currentYear || (today.getFullYear() === currentYear && today.getMonth() > currentMonth)) ? 'left' : (today.getFullYear() < currentYear || (today.getFullYear() === currentYear && today.getMonth() < currentMonth)) ? 'right' : null;
        goToMonth(today.getMonth(), today.getFullYear(), dir);
      });
    }
    
    if (closeBtn) closeBtn.addEventListener('click', closeDayPopup);
    if (popupOverlay) popupOverlay.addEventListener('click', closeDayPopup);
    
    if (popupFilterBar) {
      popupFilterBar.addEventListener('click', function(e) {
        var btn = e.target.closest('button[data-filter]');
        if (!btn) return;
        currentPopupFilter = btn.getAttribute('data-filter');
        var btns = popupFilterBar.querySelectorAll('button');
        btns.forEach(function(b) { b.classList.toggle('active', b === btn); });
        renderPopupTrades();
      });
    }
    
    // Touch events
    var grid = document.getElementById('cal-grid');
    if (grid) {
      var touchStartX = 0, touchStartY = 0, touching = false;
      
      grid.addEventListener('touchstart', function(e) {
        if (!e.touches || !e.touches.length) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touching = true;
      }, { passive: true });
      
      grid.addEventListener('touchend', function(e) {
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
    
    // Jump popover
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
        var lang = typeof i18n !== 'undefined' && i18n.getCurrentLanguage ? i18n.getCurrentLanguage() : 'en';
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
      
      titleBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (popover.classList.contains('open')) closePopover(); else openPopover();
      });
      
      document.addEventListener('click', function(e) {
        if (!popover.contains(e.target) && e.target !== titleBtn) closePopover();
      });
      popover.addEventListener('click', function(e) { e.stopPropagation(); });
      
      if (yearPrev) yearPrev.addEventListener('click', function() { jumpPopoverYear--; renderMonthsGrid(); });
      if (yearNext) yearNext.addEventListener('click', function() { jumpPopoverYear++; renderMonthsGrid(); });
      
      if (monthsGrid) {
        monthsGrid.addEventListener('click', function(e) {
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
    
    // Auth ve veri yükleme
    showCalendarSkeleton();
    
    var user = await requireAuth();
    if (!user) return;
    
    // ⭐ TEK SORGU - OPTİMİZE EDİLDİ
    var tradesData = await loadCalendarTradesFromDB(user.id);
    if (tradesData === null) {
      hideCalendarSkeleton();
      return;
    }
    
    loadCalendarTrades(tradesData || []);
    
    // i18n değişimlerini dinle
    if (typeof i18n !== 'undefined' && i18n.onChange) {
      i18n.onChange(function() {
        renderCalendar();
      });
    }
    
    console.log('✅ Calendar başlatıldı!');
  } catch (e) {
    console.error('❌ Calendar init hatası:', e);
  }
}

// ⭐ Global
window.initCalendar = initCalendar;
window.renderCalendar = renderCalendar;
window.openDayPopup = openDayPopup;
window.closeDayPopup = closeDayPopup;
window.calcTradePnL = calcTradePnL;
window.formatCurrency = formatCurrency;
window.formatShortPnL = formatShortPnL;

console.log('✅ calendar.js yüklendi! (OPTİMİZE EDİLDİ)');