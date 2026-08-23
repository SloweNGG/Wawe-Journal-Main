// ============================================================
// WAWE JOURNAL - PRICING
// ============================================================

import { safeLocalStorageGet, safeLocalStorageSet } from './core/storage.js';
import { showToast } from './utils/ui.js';

let homePriceUpdateTimeout = null;

export function getMonthlyPrice() {
  try {
    const saved = safeLocalStorageGet('ww_monthly_price', null);
    if (saved) return parseFloat(saved);
  } catch(e) {}
  return WW_CONFIG.DEFAULT_PRICES?.monthly || 9.00;
}

export function getYearlyPrice() {
  try {
    const saved = safeLocalStorageGet('ww_yearly_price', null);
    if (saved) return parseFloat(saved);
  } catch(e) {}
  return WW_CONFIG.DEFAULT_PRICES?.yearly || 79.00;
}

export function setMonthlyPrice(price) {
  safeLocalStorageSet('ww_monthly_price', String(price));
  updateHomePrices();
}

export function setYearlyPrice(price) {
  safeLocalStorageSet('ww_yearly_price', String(price));
  updateHomePrices();
}

export function updateHomePrices() {
  if (homePriceUpdateTimeout) {
    cancelAnimationFrame(homePriceUpdateTimeout);
  }
  
  homePriceUpdateTimeout = requestAnimationFrame(function() {
    try {
      const monthlyPrice = getMonthlyPrice();
      const yearlyPrice = getYearlyPrice();
      
      const monthlyEl = document.getElementById('monthly-price-value');
      if (monthlyEl) {
        monthlyEl.textContent = monthlyPrice.toFixed(2);
        monthlyEl.style.fontSize = '2.8rem';
        monthlyEl.style.fontWeight = '700';
        monthlyEl.style.display = 'inline-block';
        monthlyEl.style.color = 'var(--text)';
      }
      
      const yearlyEl = document.getElementById('yearly-price-value');
      if (yearlyEl) {
        yearlyEl.textContent = yearlyPrice.toFixed(2);
        yearlyEl.style.fontSize = '2.8rem';
        yearlyEl.style.fontWeight = '700';
        yearlyEl.style.display = 'inline-block';
        yearlyEl.style.color = 'var(--text)';
      }
      
      const saveEl = document.getElementById('yearly-save-text');
      if (saveEl) {
        const monthlyFull = monthlyPrice * 12;
        if (monthlyFull > 0) {
          const discount = Math.round(((monthlyFull - yearlyPrice) / monthlyFull) * 100);
          let text = '';
          try {
            const lang = window.i18n ? i18n.getCurrentLanguage() : 'en';
            if (lang === 'tr') text = '🎯 %' + discount + ' tasarruf et!';
            else if (lang === 'de') text = '🎯 ' + discount + '% sparen!';
            else text = '🎯 Save ' + discount + '%!';
          } catch(e) {
            text = '🎯 Save ' + discount + '%!';
          }
          saveEl.textContent = text;
          saveEl.style.fontSize = '13px';
          saveEl.style.fontWeight = '600';
          saveEl.style.color = '#7c6dfa';
        }
      }
    } catch (error) {}
  });
}

export function adminUpdatePrices(monthly, yearly) {
  setMonthlyPrice(monthly);
  setYearlyPrice(yearly);
  updateHomePrices();
  showToast('✅ Fiyatlar güncellendi!', 'success');
}

export function resetPrices() {
  setMonthlyPrice(WW_CONFIG.DEFAULT_PRICES?.monthly || 9.00);
  setYearlyPrice(WW_CONFIG.DEFAULT_PRICES?.yearly || 79.00);
  updateHomePrices();
  showToast('↺ Fiyatlar varsayılana döndürüldü!', 'success');
}

window.addEventListener('storage', function(e) {
  if (e.key === 'ww_monthly_price' || e.key === 'ww_yearly_price' || e.key === 'ww_prices') {
    updateHomePrices();
  }
});

document.addEventListener('DOMContentLoaded', function() {
  setTimeout(updateHomePrices, 300);
});

if (window.i18n && i18n.onChange) {
  i18n.onChange(function() {
    setTimeout(updateHomePrices, 200);
  });
}