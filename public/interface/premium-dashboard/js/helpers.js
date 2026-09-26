// ============================================================
// premium-dashboard/js/helpers.js - Saf yardımcı fonksiyonlar
// ⭐ FIX: showEmptyChart zenginleştirildi (ikon + metin + link)
// ⭐ TEMİZLİK: /add-trade.html referansları kaldırıldı
//        - "Lot" ve "Henüz işlem" case'leri artık quickAddOpen() çağırıyor
//        - Quick Add modal aynı sayfada açılıyor, kullanıcı sayfadan çıkmıyor
// ⭐ i18n: bellEmptyStateHtml() artık 'nav.no_notifications' anahtarını kullanıyor
// ⭐ i18n (YENİ): showEmptyChart() içindeki mesaj ve buton metinleri
//    i18n'e taşındı. Hem eski Türkçe mesaj (string.includes ile algılama)
//    hem de yeni 'empty.*' type API'si destekleniyor.
// ⭐ FIX (BUG): ES module scope'unda `i18n` doğrudan tanımlı olmadığı için
//    `typeof i18n !== 'undefined'` kontrolü her zaman false dönüyordu.
//    Artık `window.i18n` üzerinden güvenli erişim yapılıyor.
// ⭐ PnL FIX: calcTradePnL() artık önce DB'deki gerçek t.pnl değerini
//    kullanır; yoksa hesaplamaya fallback yapar.
// ============================================================

export function sanitizeHTML(str) {
  if (!str) return '';
  var temp = document.createElement('div');
  temp.textContent = str;
  return temp.innerHTML;
}

export function sanitizeURL(url) {
  if (!url) return '';
  try {
    var parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.href;
  } catch (e) {
    return '';
  }
}

export function getCurrencySymbol() {
  try {
    return localStorage.getItem('ww_currency') || '$';
  } catch(e) {
    return '$';
  }
}

export function getMultiplier(t) {
  var mult = t.multiplier || 100000;
  if (t.instrument && typeof INSTRUMENT_MULTIPLIERS !== 'undefined' && INSTRUMENT_MULTIPLIERS[t.instrument]) {
    mult = t.multiplier || INSTRUMENT_MULTIPLIERS[t.instrument] || 100000;
  }
  return mult;
}

export function calcTradePnL(t) {
  try {
    if (!t.exit_price) return 0;

    var storedPnl = parseFloat(t.pnl);
    if (t.pnl !== null && t.pnl !== undefined && !isNaN(storedPnl)) {
      return storedPnl;
    }

    if (!t.entry_price || !t.lot) return 0;
    var mult = getMultiplier(t);
    var dir = (t.direction === 'LONG' || t.direction === 'BUY') ? 1 : -1;
    return dir * (parseFloat(t.exit_price) - parseFloat(t.entry_price)) * parseFloat(t.lot) * mult;
  } catch(e) {
    return 0;
  }
}

export function formatCurrency(value) {
  var num = parseFloat(value) || 0;
  var currency = getCurrencySymbol();
  var formatted = Math.abs(num).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (num < 0) return '-' + currency + formatted;
  return '+' + currency + formatted;
}

export function formatCurrencyPlain(value) {
  var num = parseFloat(value) || 0;
  var currency = getCurrencySymbol();
  var formatted = Math.abs(num).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (num < 0 ? '-' : '') + currency + formatted;
}

export function formatCurrencyPDF(value) {
  var num = parseFloat(value) || 0;
  var currency = getCurrencySymbol();
  var formatted = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (num < 0) return '-' + currency + formatted;
  return '+' + currency + formatted;
}

export function toLwcTime(dateStr) {
  if (!dateStr) return null;
  try {
    var d = new Date(dateStr);
    return Math.floor(d.getTime() / 1000);
  } catch(e) {
    return null;
  }
}

export function dedupeByTime(points) {
  var map = {};
  points.forEach(function(p) {
    map[p.time] = p.value;
  });
  return Object.keys(map).sort(function(a, b) { return a - b; }).map(function(t) {
    return { time: parseInt(t), value: map[t] };
  });
}

// ============================================================
// ⭐ i18n GÜVENLİ ERİŞİM (ES module scope'u için)
// ============================================================
// ES module scope'unda `i18n` doğrudan tanımlı değil.
// Global window.i18n üzerinden erişilir.
// i18n.js yüklenmemişse veya hata verse bile fallback metni döner.

var _EMPTY_FALLBACKS = {
  'empty.no_closed':           'Yeterli kapanan işlem yok',
  'empty.no_recent':           'Son 30 gün için yeterli veri yok',
  'empty.no_rr':               'R:R verisi yok',
  'empty.no_lot':              'Lot verisi yok',
  'empty.no_trades':           'Henüz işlem yok',
  'empty.not_enough':          'Yeterli veri yok',
  'empty.default':             'Veri yok',
  'empty.action.view_trades':     'İşlemleri görüntüle',
  'empty.action.view_calendar':   'Takvimi görüntüle',
  'empty.action.view_strategies': 'Stratejileri görüntüle',
  'empty.action.add_trade':       'İşlem ekle',
  'empty.action.add_first_trade': 'İlk işlemi ekle',
  'empty.action.back_dashboard':  'Dashboard\'a dön',
  'nav.no_notifications':      'Yeni bildirim yok'
};

function _t(key, params) {
  try {
    if (typeof window !== 'undefined' && window.i18n && typeof window.i18n.t === 'function') {
      var v = window.i18n.t(key, params);
      if (v && v !== key) return v;
    }
  } catch (e) {}
  return (_EMPTY_FALLBACKS[key] !== undefined) ? _EMPTY_FALLBACKS[key] : key;
}

// ============================================================
// ⭐ BOŞ GRAFİK TİPİ ÇÖZÜMLEYİCİ
// ============================================================
// Hem yeni 'empty.*' type API'sini hem de eski Türkçe mesaj string'ini
// algılar. Böylece chart-renderers.js'i değiştirmek zorunda kalmayız.

export function filterTradesByDate(trades, range, customStart, customEnd) {
  if (!trades || !Array.isArray(trades)) return [];
  if (!range || range === 'all') return trades;

  if (range === 'custom' && customStart && customEnd) {
    var cStart = new Date(customStart);
    cStart.setHours(0, 0, 0, 0);
    var cEnd = new Date(customEnd);
    cEnd.setHours(23, 59, 59, 999);
    return trades.filter(function(t) {
      if (!t.trade_date) return false;
      var d = new Date(t.trade_date);
      return d >= cStart && d <= cEnd;
    });
  }

  var now = new Date();
  var start = new Date();
  if (range === 'week') {
    start.setDate(now.getDate() - 7);
  } else if (range === 'month') {
    start.setMonth(now.getMonth() - 1);
  } else if (range === 'year') {
    start.setMonth(0, 1);
  }
  start.setHours(0, 0, 0, 0);

  return trades.filter(function(t) {
    if (!t.trade_date) return false;
    var d = new Date(t.trade_date);
    return d >= start;
  });
}

// ============================================================
// ⭐ BOŞ GRAFİK TİPİ ÇÖZÜMLEYİCİ & SVG İKONLAR
// ============================================================

var _EMPTY_TYPE_MAP = {
  no_closed:  { icon: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', msgKey: 'empty.no_closed',  actionKey: 'empty.action.view_trades',     link: '/trades.html' },
  no_recent:  { icon: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', msgKey: 'empty.no_recent',  actionKey: 'empty.action.view_calendar',   link: '/calendar.html' },
  no_rr:      { icon: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>', msgKey: 'empty.no_rr',      actionKey: 'empty.action.view_strategies', link: '/strategies.html' },
  no_lot:     { icon: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>', msgKey: 'empty.no_lot',     actionKey: 'empty.action.add_trade',       quickAdd: true },
  no_trades:  { icon: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>', msgKey: 'empty.no_trades',  actionKey: 'empty.action.add_first_trade', quickAdd: true },
  not_enough: { icon: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>', msgKey: 'empty.not_enough', actionKey: 'empty.action.view_trades',     link: '/trades.html' },
  default:    { icon: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>', msgKey: 'empty.default',    actionKey: 'empty.action.back_dashboard',  link: '/dashboard.html' }
};

function _resolveEmptyType(input) {
  if (!input || typeof input !== 'string') return 'default';

  // Yeni type API: 'empty.no_closed' → 'no_closed'
  if (input.indexOf('empty.') === 0) {
    var t = input.slice(6);
    if (_EMPTY_TYPE_MAP[t]) return t;
    return 'default';
  }

  // Eski Türkçe mesaj algılama (backward compatibility)
  if (input.includes('kapanan işlem')) return 'no_closed';
  if (input.includes('Son 30 gün'))    return 'no_recent';
  if (input.includes('RR'))            return 'no_rr';
  if (input.includes('Lot'))           return 'no_lot';
  if (input.includes('Henüz işlem'))   return 'no_trades';
  if (input.includes('Yeterli veri'))  return 'not_enough';

  return 'default';
}

// ============================================================
// ⭐ BOŞ STATE - ZENGİNLEŞTİRİLMİŞ + i18n DESTEKLİ
// ============================================================

export function showEmptyChart(containerId, typeOrMessage) {
  var container = document.getElementById(containerId);
  if (!container) return;

  var type = _resolveEmptyType(typeOrMessage);
  var cfg = _EMPTY_TYPE_MAP[type];

  var displayMessage;
  if (typeof typeOrMessage === 'string' && typeOrMessage.indexOf('empty.') === 0) {
    displayMessage = _t(cfg.msgKey);
  } else if (typeof typeOrMessage === 'string' && typeOrMessage.length > 0) {
    displayMessage = typeOrMessage;
  } else {
    displayMessage = _t('empty.not_enough');
  }

  var actionText = _t(cfg.actionKey);

  var btnStyle = "font-size:11px;color:var(--accent);text-decoration:none;font-weight:500;border:1px solid var(--border);padding:0.15rem 0.7rem;border-radius:20px;transition:all 0.2s;background:var(--surface);cursor:pointer;font-family:'DM Sans',sans-serif;";
  var btnHover = "onmouseover=\"this.style.borderColor='var(--accent)';this.style.background='rgba(139,92,246,0.05)';\" onmouseout=\"this.style.borderColor='var(--border)';this.style.background='var(--surface)';\"";

  var buttonHtml = '';
  if (cfg.quickAdd) {
    buttonHtml = '<button type="button" onclick="if(typeof quickAddOpen===\'function\')quickAddOpen()" style="' + btnStyle + '" ' + btnHover + '>' + actionText + ' →</button>';
  } else if (cfg.link) {
    buttonHtml = '<a href="' + cfg.link + '" style="' + btnStyle + '" ' + btnHover + '>' + actionText + ' →</a>';
  }

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:80px;padding:0.5rem;text-align:center;color:var(--muted);font-family:'DM Sans',sans-serif;">
      <div style="margin-bottom:0.5rem;opacity:0.6;color:var(--muted);display:flex;align-items:center;justify-content:center;">${cfg.icon}</div>
      <p style="font-size:12px;margin:0 0 0.3rem;color:var(--muted);">${displayMessage}</p>
      ${buttonHtml}
    </div>
  `;
}

export function bellEmptyStateHtml() {
  var emptyText = _t('nav.no_notifications');
  return '<div class="bell-panel-empty" id="bell-panel-empty"><span class="empty-icon" style="opacity:0.5;display:inline-flex;align-items:center;justify-content:center;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><line x1="2" y1="2" x2="22" y2="22"/></svg></span><span>' + emptyText + '</span></div>';
}

export function apexCurrencyFormatter(value) {
  return formatCurrency(value);
}