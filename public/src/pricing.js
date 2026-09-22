// ============================================================
// WAWE JOURNAL - PRICING
// ============================================================

import { safeLocalStorageGet, safeLocalStorageSet } from './core/storage.js';
import { showToast } from './utils/ui.js';
import { WW_CONFIG } from './core/config.js';

let homePriceUpdateTimeout = null;

let currentMonthlyPrice = 12;
let currentYearlyPrice = 99;

try {
  const savedM = safeLocalStorageGet('ww_monthly_price');
  if (savedM !== null && !isNaN(parseFloat(savedM))) {
    currentMonthlyPrice = parseFloat(savedM);
  }
  const savedY = safeLocalStorageGet('ww_yearly_price');
  if (savedY !== null && !isNaN(parseFloat(savedY))) {
    currentYearlyPrice = parseFloat(savedY);
  }
} catch (e) {}

export function getMonthlyPrice() {
  return currentMonthlyPrice;
}

export function getYearlyPrice() {
  return currentYearlyPrice;
}

export function setMonthlyPrice(price) {
  const p = parseFloat(price);
  if (!isNaN(p)) {
    currentMonthlyPrice = p;
    safeLocalStorageSet('ww_monthly_price', p.toString());
  }
  if (window.adminUpdatePrices && window.adminUpdatePrices !== adminUpdatePrices) {
    window.adminUpdatePrices(price, getYearlyPrice());
  }
  updateHomePrices();
}

export function setYearlyPrice(price) {
  const p = parseFloat(price);
  if (!isNaN(p)) {
    currentYearlyPrice = p;
    safeLocalStorageSet('ww_yearly_price', p.toString());
  }
  if (window.adminUpdatePrices && window.adminUpdatePrices !== adminUpdatePrices) {
    window.adminUpdatePrices(getMonthlyPrice(), price);
  }
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
        monthlyEl.textContent = monthlyPrice % 1 === 0 ? monthlyPrice.toFixed(0) : monthlyPrice.toFixed(2);
        monthlyEl.style.fontSize = '2.8rem';
        monthlyEl.style.fontWeight = '700';
        monthlyEl.style.display = 'inline-block';
        monthlyEl.style.color = 'var(--text)';
      }
      
      const yearlyEl = document.getElementById('yearly-price-value');
      if (yearlyEl) {
        yearlyEl.textContent = yearlyPrice % 1 === 0 ? yearlyPrice.toFixed(0) : yearlyPrice.toFixed(2);
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
  if (monthly !== undefined && monthly !== null) {
    const m = parseFloat(monthly);
    if (!isNaN(m)) {
      currentMonthlyPrice = m;
      safeLocalStorageSet('ww_monthly_price', m.toString());
    }
  }
  if (yearly !== undefined && yearly !== null) {
    const y = parseFloat(yearly);
    if (!isNaN(y)) {
      currentYearlyPrice = y;
      safeLocalStorageSet('ww_yearly_price', y.toString());
    }
  }
  updateHomePrices();
  showToast('✅ Fiyatlar güncellendi!', 'success');
}

export function resetPrices() {
  setMonthlyPrice(WW_CONFIG.DEFAULT_PRICES?.monthly || 12);
  setYearlyPrice(WW_CONFIG.DEFAULT_PRICES?.yearly || 99);
  const defM = (typeof WW_CONFIG !== 'undefined' && WW_CONFIG.DEFAULT_PRICES?.monthly) ? WW_CONFIG.DEFAULT_PRICES.monthly : 12;
  const defY = (typeof WW_CONFIG !== 'undefined' && WW_CONFIG.DEFAULT_PRICES?.yearly) ? WW_CONFIG.DEFAULT_PRICES.yearly : 99;
  currentMonthlyPrice = defM;
  currentYearlyPrice = defY;
  safeLocalStorageSet('ww_monthly_price', defM.toString());
  safeLocalStorageSet('ww_yearly_price', defY.toString());
  updateHomePrices();
  showToast('↺ Fiyatlar varsayılana döndürüldü!', 'success');
}

window.addEventListener('storage', function(e) {
  if (e.key === 'ww_monthly_price' || e.key === 'ww_yearly_price' || e.key === 'ww_prices') {
    if (e.key === 'ww_monthly_price' && e.newValue) {
      const parsed = parseFloat(e.newValue);
      if (!isNaN(parsed)) currentMonthlyPrice = parsed;
    }
    if (e.key === 'ww_yearly_price' && e.newValue) {
      const parsed = parseFloat(e.newValue);
      if (!isNaN(parsed)) currentYearlyPrice = parsed;
    }
    updateHomePrices();
  }
});


export async function fetchPricesFromDB() {
  try {
    const sb = window.sb || window.supabase;
    if (!sb) return;
    
    // Call the new RPC
    const { data, error } = await sb.rpc('get_prices');
    if (!error && data) {
      if (data.monthly) setMonthlyPrice(data.monthly);
      if (data.yearly) setYearlyPrice(data.yearly);
      if (data.monthly) {
        const m = parseFloat(data.monthly);
        if (!isNaN(m)) {
          currentMonthlyPrice = m;
          safeLocalStorageSet('ww_monthly_price', m.toString());
        }
      }
      if (data.yearly) {
        const y = parseFloat(data.yearly);
        if (!isNaN(y)) {
          currentYearlyPrice = y;
          safeLocalStorageSet('ww_yearly_price', y.toString());
        }
      }
      updateHomePrices();
    }
  } catch (e) {
    console.error('fetchPricesFromDB hatasi:', e);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    updateHomePrices();
    fetchPricesFromDB(); // <--- Fetch on load!
    fetchPricesFromDB();
  }, 300);
});


if (window.i18n && i18n.onChange) {
  i18n.onChange(function() {
    setTimeout(updateHomePrices, 200);
  });
}