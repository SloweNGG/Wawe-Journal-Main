// ============================================================
// helpers.js - Saf yardımcı fonksiyonlar
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

export function showEmptyChart(containerId, message) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:11px;font-family:\'DM Sans\',sans-serif;">' + (message || 'Yeterli veri yok') + '</div>';
}

export function bellEmptyStateHtml() {
  var emptyText = (typeof i18n !== 'undefined' && i18n.t && i18n.t('dashboard.bell.empty') !== 'dashboard.bell.empty') ? i18n.t('dashboard.bell.empty') : 'Yeni bildirim yok';
  return '<div class="bell-panel-empty" id="bell-panel-empty"><span class="empty-icon">🔕</span><span>' + emptyText + '</span></div>';
}

export function apexCurrencyFormatter(value) {
  return formatCurrency(value);
}