// ============================================================
// premium-dashboard/js/helpers.js - Saf yardımcı fonksiyonlar
// ⭐ FIX: showEmptyChart zenginleştirildi (ikon + metin + link)
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

// ⭐ BOŞ STATE - ZENGİNLEŞTİRİLMİŞ
export function showEmptyChart(containerId, message) {
  var container = document.getElementById(containerId);
  if (!container) return;
  
  // Grafik türüne göre ikon ve mesaj belirle
  var icon = '📊';
  var actionText = '';
  var actionLink = '';
  
  if (message && message.includes('kapanan işlem')) {
    icon = '⏳';
    actionText = 'İşlemleri görüntüle';
    actionLink = '/trades.html';
  } else if (message && message.includes('Son 30 gün')) {
    icon = '📅';
    actionText = 'Takvimi görüntüle';
    actionLink = '/calendar.html';
  } else if (message && message.includes('RR')) {
    icon = '📈';
    actionText = 'Stratejileri görüntüle';
    actionLink = '/strategies.html';
  } else if (message && message.includes('Lot')) {
    icon = '📐';
    actionText = 'İşlem ekle';
    actionLink = '/add-trade.html';
  } else if (message && message.includes('Henüz işlem')) {
    icon = '📭';
    actionText = 'İlk işlemi ekle';
    actionLink = '/add-trade.html';
  } else if (message && message.includes('Yeterli veri')) {
    icon = '📉';
    actionText = 'İşlemleri görüntüle';
    actionLink = '/trades.html';
  } else {
    icon = '📊';
    actionText = 'Dashboard\'a dön';
    actionLink = '/dashboard.html';
  }
  
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:80px;padding:0.5rem;text-align:center;color:var(--muted);font-family:'DM Sans',sans-serif;">
      <div style="font-size:2rem;margin-bottom:0.5rem;opacity:0.6;">${icon}</div>
      <p style="font-size:12px;margin:0 0 0.3rem;color:var(--muted);">${message || 'Yeterli veri yok'}</p>
      ${actionLink ? `<a href="${actionLink}" style="font-size:11px;color:var(--accent);text-decoration:none;font-weight:500;border:1px solid var(--border);padding:0.15rem 0.7rem;border-radius:20px;transition:all 0.2s;background:var(--surface);" onmouseover="this.style.borderColor='var(--accent)';this.style.background='rgba(139,92,246,0.05)';" onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--surface)';">${actionText} →</a>` : ''}
    </div>
  `;
}

export function bellEmptyStateHtml() {
  var emptyText = (typeof i18n !== 'undefined' && i18n.t && i18n.t('dashboard.bell.empty') !== 'dashboard.bell.empty') ? i18n.t('dashboard.bell.empty') : 'Yeni bildirim yok';
  return '<div class="bell-panel-empty" id="bell-panel-empty"><span class="empty-icon">🔕</span><span>' + emptyText + '</span></div>';
}

export function apexCurrencyFormatter(value) {
  return formatCurrency(value);
}