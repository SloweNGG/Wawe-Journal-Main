// ============================================================
// WAWE JOURNAL – config.js (SORUNSUZ - import.meta.env KULLANMAZ)
// ============================================================

// ============================================================
// SUPABASE YAPILANDIRMASI - Environment'dan oku (import.meta.env YOK!)
// ============================================================

// ⭐ Environment variable'ları oku - import.meta.env KULLANMA!
// Vite build sırasında define ile değiştirilirler
// Normal script'te çalışması için process.env veya window kullan

const getEnv = (key, fallback) => {
  // Önce process.env'den dene (Node.js / Vite)
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  // Sonra window'dan dene (manual override)
  if (typeof window !== 'undefined' && window[key]) {
    return window[key];
  }
  // Fallback
  return fallback;
};

const SUPABASE_URL = getEnv('VITE_SUPABASE_URL', 'https://odasapyhtdopbnlfhwde.supabase.co');
const SUPABASE_ANON_KEY = getEnv('VITE_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kYXNhcHlodGRvcGJubGZod2RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NDk0NjgsImV4cCI6MjA5NDAyNTQ2OH0.AH7V9i61pFWj33sCy51khdYHZn34BNitXY9exJySmWg');
const APP_URL = getEnv('VITE_APP_URL', 'https://wawejournal.com');
const APP_NAME = getEnv('VITE_APP_NAME', 'Wawe Journal');

// ============================================================
// GLOBAL DEĞİŞKENLER
// ============================================================
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
window.APP_URL = APP_URL;
window.APP_NAME = APP_NAME;

// ============================================================
// SUPABASE CLIENT - DOĞRUDAN OLUŞTUR
// ============================================================
if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
  window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('✅ Supabase client oluşturuldu (window.supabase ile)');
} else {
  console.warn('⚠️ window.supabase bulunamadı, supabase-js yüklenmemiş olabilir.');
}

// ============================================================
// 💰 FİYAT FONKSİYONLARI - GLOBAL
// ============================================================

window.getPrices = function() {
  try {
    const saved = localStorage.getItem('ww_prices');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        monthly: (typeof parsed.monthly === 'number' && !isNaN(parsed.monthly) && parsed.monthly > 0) ? parsed.monthly : 9,
        yearly: (typeof parsed.yearly === 'number' && !isNaN(parsed.yearly) && parsed.yearly > 0) ? parsed.yearly : 79,
        currency: (typeof parsed.currency === 'string') ? parsed.currency : 'USD',
        discount: {
          yearly: (typeof parsed.discount?.yearly === 'number' && !isNaN(parsed.discount?.yearly)) ? parsed.discount.yearly : 27,
          promo: (typeof parsed.discount?.promo === 'number' && !isNaN(parsed.discount?.promo)) ? parsed.discount.promo : 0
        },
        paymentMethods: Array.isArray(parsed.paymentMethods) && parsed.paymentMethods.length > 0 
          ? parsed.paymentMethods 
          : ['BTC', 'LTC']
      };
    }
  } catch (e) {}
  return {
    monthly: 9,
    yearly: 79,
    currency: 'USD',
    discount: {
      yearly: 27,
      promo: 0
    },
    paymentMethods: ['BTC', 'LTC']
  };
};

window.getMonthlyPrice = function() {
  try {
    const prices = window.getPrices();
    return (typeof prices.monthly === 'number' && !isNaN(prices.monthly) && prices.monthly > 0) ? prices.monthly : 9;
  } catch (e) {
    return 9;
  }
};

window.getYearlyPrice = function() {
  try {
    const prices = window.getPrices();
    return (typeof prices.yearly === 'number' && !isNaN(prices.yearly) && prices.yearly > 0) ? prices.yearly : 79;
  } catch (e) {
    return 79;
  }
};

window.getYearlyDiscount = function() {
  try {
    const prices = window.getPrices();
    if (prices.discount && typeof prices.discount.yearly === 'number' && !isNaN(prices.discount.yearly)) {
      return prices.discount.yearly;
    }
    const monthly = window.getMonthlyPrice();
    const yearly = window.getYearlyPrice();
    const fullPrice = monthly * 12;
    if (fullPrice > 0 && yearly < fullPrice && yearly > 0) {
      return Math.round(((fullPrice - yearly) / fullPrice) * 100);
    }
    return 27;
  } catch (e) {
    return 27;
  }
};

window.getPaymentMethods = function() {
  try {
    const prices = window.getPrices();
    if (prices.paymentMethods && Array.isArray(prices.paymentMethods) && prices.paymentMethods.length > 0) {
      return prices.paymentMethods.slice();
    }
  } catch (e) {}
  return ['BTC', 'LTC'];
};

window.savePrices = function(prices) {
  try {
    const currentPrices = window.getPrices();
    
    const updatedPrices = {
      monthly: (typeof prices.monthly === 'number' && !isNaN(prices.monthly) && prices.monthly > 0) 
        ? prices.monthly 
        : currentPrices.monthly,
      yearly: (typeof prices.yearly === 'number' && !isNaN(prices.yearly) && prices.yearly > 0) 
        ? prices.yearly 
        : currentPrices.yearly,
      currency: (typeof prices.currency === 'string' && prices.currency.length > 0) 
        ? prices.currency 
        : currentPrices.currency,
      discount: {
        yearly: (typeof prices.discount?.yearly === 'number' && !isNaN(prices.discount?.yearly)) 
          ? prices.discount.yearly 
          : currentPrices.discount.yearly,
        promo: (typeof prices.discount?.promo === 'number' && !isNaN(prices.discount?.promo)) 
          ? prices.discount.promo 
          : currentPrices.discount.promo
      },
      paymentMethods: Array.isArray(prices.paymentMethods) && prices.paymentMethods.length > 0 
        ? prices.paymentMethods.slice() 
        : currentPrices.paymentMethods.slice()
    };
    
    localStorage.setItem('ww_prices', JSON.stringify(updatedPrices));
    return updatedPrices;
  } catch (e) {
    return null;
  }
};

window.resetPrices = function() {
  try {
    localStorage.removeItem('ww_prices');
    return true;
  } catch (e) {
    return false;
  }
};

window.adminUpdatePrices = function(monthly, yearly) {
  try {
    const current = window.getPrices();
    const updated = window.savePrices({
      monthly: monthly,
      yearly: yearly,
      currency: current.currency,
      discount: current.discount,
      paymentMethods: current.paymentMethods
    });
    return updated !== null;
  } catch (e) {
    return false;
  }
};

window.adminUpdateDiscount = function(discountPercent) {
  try {
    const current = window.getPrices();
    const updated = window.savePrices({
      monthly: current.monthly,
      yearly: current.yearly,
      currency: current.currency,
      discount: {
        yearly: discountPercent,
        promo: current.discount.promo
      },
      paymentMethods: current.paymentMethods
    });
    return updated !== null;
  } catch (e) {
    return false;
  }
};

window.adminUpdatePaymentMethods = function(methods) {
  try {
    if (!Array.isArray(methods) || methods.length === 0) {
      return false;
    }
    const current = window.getPrices();
    const updated = window.savePrices({
      monthly: current.monthly,
      yearly: current.yearly,
      currency: current.currency,
      discount: current.discount,
      paymentMethods: methods
    });
    return updated !== null;
  } catch (e) {
    return false;
  }
};

window.setPaymentMethods = function(methods) {
  try {
    const current = window.getPrices();
    const updated = window.savePrices({
      monthly: current.monthly,
      yearly: current.yearly,
      currency: current.currency,
      discount: current.discount,
      paymentMethods: methods
    });
    return updated !== null;
  } catch (e) {
    return false;
  }
};

// ============================================================
// WW_CONFIG OBJESİ - Global erişim için
// ============================================================
const WW_CONFIG = {
  SUPABASE_URL: SUPABASE_URL,
  SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
  APP_URL: APP_URL,
  APP_NAME: APP_NAME,
  DEFAULT_PRICES: {
    monthly: 9,
    yearly: 79,
    currency: 'USD',
    discount: {
      yearly: 27,
      promo: 0
    },
    paymentMethods: ['BTC', 'LTC']
  },
  THEME: {
    backgroundColor: '#0a0a0f',
    fontSize: 16,
    surfaceColor: '#111118',
    borderColor: '#1e1e2e',
    textColor: '#e8e8f0'
  }
};

window.WW_CONFIG = WW_CONFIG;

console.log('✅ Wawe Journal config loaded from environment!');
console.log('🔑 Supabase:', SUPABASE_URL ? '✅' : '❌');
console.log('📦 sb client:', window.sb ? '✅' : '⚠️ (script.js tarafından oluşturulacak)');
console.log('🌐 Environment:', typeof process !== 'undefined' && process.env ? 'production' : 'browser');