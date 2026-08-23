// ============================================================
// WAWE JOURNAL - HELPERS
// ============================================================

import { INSTRUMENT_MULTIPLIERS } from '../core/config.js';
import { getCurrencySymbol } from '../core/storage.js';

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

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

export function getInstrumentMultiplier(instrument) {
  return INSTRUMENT_MULTIPLIERS[instrument] || 1;
}

// ⭐ window'a ata (sayfalar için)
window.sanitizeHTML = sanitizeHTML;
window.escapeHtml = escapeHtml;
window.calcPnL = calcPnL;
window.calcRR = calcRR;
window.formatCurrency = formatCurrency;
window.formatCurrencyPDF = formatCurrencyPDF;
window.formatDate = formatDate;
window.getInstrumentMultiplier = getInstrumentMultiplier;