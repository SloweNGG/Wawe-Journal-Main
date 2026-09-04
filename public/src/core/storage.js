// ============================================================
// WAWE JOURNAL - STORAGE
// ============================================================

export function safeLocalStorageGet(key, defaultValue) {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;
    return value;
  } catch (e) {
    return defaultValue;
  }
}

export function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

export function safeLocalStorageRemove(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    return false;
  }
}

// ⭐ getCurrencySymbol - DOĞRUDAN localStorage'dan oku (window çağrısı YOK!)
export function getCurrencySymbol() {
  return safeLocalStorageGet('ww_currency', '$');
}

// ⭐ setCurrencySymbol - localStorage'a kaydet ve event fırlat
export function setCurrencySymbol(symbol) {
  safeLocalStorageSet('ww_currency', symbol);
  // ⭐ Event fırlat - diğer sayfaları güncellemek için
  try {
    window.dispatchEvent(new CustomEvent('currencyChanged', { 
      detail: { symbol: symbol } 
    }));
  } catch(e) {}
}

// ⭐ window'a ata (sadece gerekli olanlar)
window.getCurrencySymbol = getCurrencySymbol;
window.setCurrencySymbol = setCurrencySymbol;
window.safeLocalStorageGet = safeLocalStorageGet;
window.safeLocalStorageSet = safeLocalStorageSet;
window.safeLocalStorageRemove = safeLocalStorageRemove;