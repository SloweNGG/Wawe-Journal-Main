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
    if (!t.entry_price || !t.exit_price || !t.lot) return 0;
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

var _EMPTY_TYPE_MAP = {
  no_closed:  { icon: '⏳', msgKey: 'empty.no_closed',  actionKey: 'empty.action.view_trades',     link: '/trades.html' },
  no_recent:  { icon: '📅', msgKey: 'empty.no_recent',  actionKey: 'empty.action.view_calendar',   link: '/calendar.html' },
  no_rr:      { icon: '📈', msgKey: 'empty.no_rr',      actionKey: 'empty.action.view_strategies', link: '/strategies.html' },
  no_lot:     { icon: '📐', msgKey: 'empty.no_lot',     actionKey: 'empty.action.add_trade',       quickAdd: true },
  no_trades:  { icon: '📭', msgKey: 'empty.no_trades',  actionKey: 'empty.action.add_first_trade', quickAdd: true },
  not_enough: { icon: '📉', msgKey: 'empty.not_enough', actionKey: 'empty.action.view_trades',     link: '/trades.html' },
  default:    { icon: '📊', msgKey: 'empty.default',    actionKey: 'empty.action.back_dashboard',  link: '/dashboard.html' }
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
// Kullanım:
//   showEmptyChart('chart-id', 'empty.no_closed')       → yeni type API
//   showEmptyChart('chart-id', 'Yeterli kapanan işlem yok') → eski mesaj (chart-renderers.js'ten)
//
// Her iki durumda da buton metni ve link/quickAdd davranışı i18n'den
// gelen metinlerle ve tip haritasıyla belirlenir.

export function showEmptyChart(containerId, typeOrMessage) {
  var container = document.getElementById(containerId);
  if (!container) return;

  var type = _resolveEmptyType(typeOrMessage);
  var cfg = _EMPTY_TYPE_MAP[type];

  // Mesaj metni:
  // - Yeni type API → i18n'den al
  // - Eski mesaj string → aynen göster (chart-renderers zaten Türkçe veriyor)
  // - Hiçbiri yoksa → i18n 'empty.not_enough'
  var displayMessage;
  if (typeof typeOrMessage === 'string' && typeOrMessage.indexOf('empty.') === 0) {
    displayMessage = _t(cfg.msgKey);
  } else if (typeof typeOrMessage === 'string' && typeOrMessage.length > 0) {
    displayMessage = typeOrMessage;
  } else {
    displayMessage = _t('empty.not_enough');
  }

  var actionText = _t(cfg.actionKey);

  // Ortak buton stili (a ve button için uyumlu)
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
      <div style="font-size:2rem;margin-bottom:0.5rem;opacity:0.6;">${cfg.icon}</div>
      <p style="font-size:12px;margin:0 0 0.3rem;color:var(--muted);">${displayMessage}</p>
      ${buttonHtml}
    </div>
  `;
}

export function bellEmptyStateHtml() {
  var emptyText = _t('nav.no_notifications');
  return '<div class="bell-panel-empty" id="bell-panel-empty"><span class="empty-icon">🔕</span><span>' + emptyText + '</span></div>';
}

export function apexCurrencyFormatter(value) {
  return formatCurrency(value);
}