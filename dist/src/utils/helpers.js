// ============================================================
// WAWE JOURNAL - HELPERS (APEXCHARTS DESTEKLİ)
// ⭐ ApexCharts için yardımcı fonksiyonlar eklendi
// ⭐ FormatCurrency fonksiyonları geliştirildi
// ============================================================

import { INSTRUMENT_MULTIPLIERS } from '../core/config.js';
import { getCurrencySymbol } from '../core/storage.js';

// ============================================================
// ⭐ HTML GÜVENLİK
// ============================================================

export function sanitizeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    if (m === '"') return '&quot;';
    if (m === "'") return '&#39;';
    return m;
  });
}

export function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// ============================================================
// ⭐ İŞLEM HESAPLAMALARI
// ============================================================

export function calcPnL(entry, exit, lot, direction, instrument, customMultiplier) {
  const entryNum = parseFloat(entry);
  const exitNum = parseFloat(exit);
  const lotNum = parseFloat(lot);
  
  if (exit === null || exit === undefined || exit === '') return 0;
  if (isNaN(entryNum) || isNaN(exitNum) || isNaN(lotNum)) return 0;
  if (entryNum === 0 || lotNum === 0) return 0;
  
  const multiplier = customMultiplier ?? INSTRUMENT_MULTIPLIERS[instrument] ?? 1;
  const dir = (direction?.toUpperCase() === 'LONG' || direction?.toUpperCase() === 'BUY') ? 1 : -1;
  
  return dir * (exitNum - entryNum) * lotNum * multiplier;
}

export function calcRR(entry, sl, tp, direction) {
  const entryNum = parseFloat(entry);
  const slNum = parseFloat(sl);
  const tpNum = parseFloat(tp);
  
  if (isNaN(entryNum) || isNaN(slNum) || isNaN(tpNum)) return null;
  if (!entryNum || !slNum || !tpNum) return null;
  
  const risk = Math.abs(entryNum - slNum);
  const reward = Math.abs(tpNum - entryNum);
  if (risk === 0 || isNaN(risk) || isNaN(reward)) return null;
  return (reward / risk).toFixed(2);
}

// ============================================================
// ⭐ PARA BİRİMİ FORMATLAMA - MEVCUT + APEXCHARTS
// ============================================================

export function formatCurrency(value) {
  const num = parseFloat(value) || 0;
  const currency = getCurrencySymbol();
  const formatted = Math.abs(num).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  if (num < 0) {
    return '-' + currency + formatted;
  }
  return '+' + currency + formatted;
}

export function formatCurrencyPDF(value) {
  const num = parseFloat(value) || 0;
  const currency = getCurrencySymbol();
  const formatted = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  if (num < 0) {
    return '-' + currency + formatted;
  }
  return '+' + currency + formatted;
}

// ⭐ APEXCHARTS İÇİN PARA BİRİMİ FORMATLAYICI (Tooltip'ler için)
export function formatCurrencyApex(value) {
  const num = parseFloat(value) || 0;
  const currency = getCurrencySymbol();
  const formatted = Math.abs(num).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  if (num < 0) {
    return '-' + currency + formatted;
  }
  return '+' + currency + formatted;
}

// ⭐ APEXCHARTS İÇİN SAYI FORMATLAYICI (Yüzde, etc.)
export function formatPercentApex(value) {
  const num = parseFloat(value) || 0;
  return num.toFixed(1) + '%';
}

// ⭐ APEXCHARTS İÇİN KISA PARA FORMATI (Büyük sayılar için)
export function formatCurrencyShort(value) {
  const num = parseFloat(value) || 0;
  const absNum = Math.abs(num);
  const currency = getCurrencySymbol();
  
  let formatted;
  if (absNum >= 1000000) {
    formatted = (absNum / 1000000).toFixed(1) + 'M';
  } else if (absNum >= 1000) {
    formatted = (absNum / 1000).toFixed(1) + 'K';
  } else {
    formatted = absNum.toFixed(2);
  }
  
  if (num < 0) {
    return '-' + currency + formatted;
  }
  return '+' + currency + formatted;
}

// ============================================================
// ⭐ TARİH FORMATLAMA - MEVCUT + APEXCHARTS
// ============================================================

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

// ⭐ APEXCHARTS İÇİN KISA TARİH FORMATI
export function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear().toString().slice(2);
  return day + '/' + month + '/' + year;
}

// ⭐ APEXCHARTS İÇİN TAM TARİH FORMATI (Tooltip)
export function formatDateFull(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('tr-TR', {
    day: '2-digit', month: 'long', year: 'numeric'
  });
}

// ============================================================
// ⭐ ENSTRÜMAN ÇARPAN
// ============================================================

export function getInstrumentMultiplier(instrument) {
  return INSTRUMENT_MULTIPLIERS[instrument] || 1;
}

// ============================================================
// ⭐ APEXCHARTS İÇİN RENK UTILITY'LERİ
// ============================================================

// Renk skalası oluştur (pozitif/negatif için)
export function getPnLColor(value) {
  const num = parseFloat(value) || 0;
  if (num > 0) return '#22c55e';
  if (num < 0) return '#ef4444';
  return '#8b8b9e';
}

// Opaklık ile renk döndür
export function getPnLColorWithOpacity(value, opacity) {
  const color = getPnLColor(value);
  if (color === '#22c55e') {
    return 'rgba(34, 197, 94, ' + opacity + ')';
  } else if (color === '#ef4444') {
    return 'rgba(239, 68, 68, ' + opacity + ')';
  }
  return 'rgba(139, 139, 158, ' + opacity + ')';
}

// Gradyan renkler
export function getGradientColors(value) {
  const num = parseFloat(value) || 0;
  if (num > 0) {
    return {
      start: 'rgba(34, 197, 94, 0.8)',
      end: 'rgba(34, 197, 94, 0.05)'
    };
  } else if (num < 0) {
    return {
      start: 'rgba(239, 68, 68, 0.8)',
      end: 'rgba(239, 68, 68, 0.05)'
    };
  }
  return {
    start: 'rgba(139, 139, 158, 0.4)',
    end: 'rgba(139, 139, 158, 0.02)'
  };
}

// ============================================================
// ⭐ APEXCHARTS İÇİN VERİ DÖNÜŞÜMÜ
// ============================================================

// Trades'den cumulative data oluştur
export function buildCumulativeData(trades) {
  let cum = 0;
  return trades.map(function(t) {
    const pnl = calcPnL(
      t.entry_price, 
      t.exit_price, 
      t.lot, 
      t.direction, 
      t.instrument, 
      t.multiplier
    );
    cum += pnl;
    return {
      x: t.trade_date || new Date().toISOString(),
      y: parseFloat(cum.toFixed(2))
    };
  });
}

// Trades'den daily data oluştur
export function buildDailyData(trades, days) {
  const result = {};
  const now = new Date();
  const daysCount = days || 30;
  
  for (var i = daysCount - 1; i >= 0; i--) {
    var d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    result[key] = 0;
  }
  
  trades.forEach(function(t) {
    if (t.exit_price && result[t.trade_date] !== undefined) {
      const pnl = calcPnL(
        t.entry_price, 
        t.exit_price, 
        t.lot, 
        t.direction, 
        t.instrument, 
        t.multiplier
      );
      result[t.trade_date] += pnl;
    }
  });
  
  return result;
}

// ============================================================
// ⭐ window'a ata (sayfalar için)
// ============================================================

window.sanitizeHTML = sanitizeHTML;
window.escapeHtml = escapeHtml;
window.calcPnL = calcPnL;
window.calcRR = calcRR;
window.formatCurrency = formatCurrency;
window.formatCurrencyPDF = formatCurrencyPDF;
window.formatDate = formatDate;
window.getInstrumentMultiplier = getInstrumentMultiplier;

// ⭐ ApexCharts yardımcıları
window.formatCurrencyApex = formatCurrencyApex;
window.formatPercentApex = formatPercentApex;
window.formatCurrencyShort = formatCurrencyShort;
window.formatDateShort = formatDateShort;
window.formatDateFull = formatDateFull;
window.getPnLColor = getPnLColor;
window.getPnLColorWithOpacity = getPnLColorWithOpacity;
window.getGradientColors = getGradientColors;
window.buildCumulativeData = buildCumulativeData;
window.buildDailyData = buildDailyData;