// ============================================================
// WAWE JOURNAL – config.js (GÜVENLİ - import.meta YOK)
// ============================================================

// ── Secret config'i yükle ────────────────────────────────────
(function loadSecretConfig() {
  try {
    const script = document.createElement('script');
    script.src = 'config.secret.js';
    script.async = false;
    document.head.appendChild(script);
    
    const startTime = Date.now();
    while (!window.__SECRET_CONFIG__ && Date.now() - startTime < 100) {
      // bekliyoruz
    }
  } catch (e) {
    // Sessizce geç
  }
})();

// ── Secret config'ten al veya fallback kullan ──────────────
const _SECRET = window.__SECRET_CONFIG__ || {};

// ── Environment variables (Vite) - sadece build zamanında ──
// NOT: import.meta kullanılmıyor! Vite build sırasında değerleri gömer.
// Development'da window._ENV kullanılır (opsiyonel)
const _ENV = typeof window !== 'undefined' && window._ENV ? window._ENV : {};

const WW_CONFIG = {
  // ==========================================================
  // 🔐 SUPABASE
  // ==========================================================
  SUPABASE_URL: _SECRET.SUPABASE_URL || _ENV.SUPABASE_URL || 'https://odasapyhtdopbnlfhwde.supabase.co',
  SUPABASE_ANON_KEY: _SECRET.SUPABASE_ANON_KEY || _ENV.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kYXNhcHlodGRvcGJubGZod2RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NDk0NjgsImV4cCI6MjA5NDAyNTQ2OH0.AH7V9i61pFWj33sCy51khdYHZn34BNitXY9exJySmWg',
  
  // ==========================================================
  // 💳 NOWPAYMENTS
  // ==========================================================
  NOWPAYMENTS_API_KEY: _SECRET.NOWPAYMENTS_API_KEY || _ENV.NOWPAYMENTS_API_KEY || 'TJQZ4RE-4VV4FGD-JY1G44M-YNW1NWD',
  NOWPAYMENTS_IPN_SECRET: _SECRET.NOWPAYMENTS_IPN_SECRET || _ENV.NOWPAYMENTS_IPN_SECRET || 'Ngvk2yr74o7uznfnljM7QI4u1xS8T9oi',
  
  // ==========================================================
  // 📰 NEWS API (opsiyonel)
  // ==========================================================
  NEWS_API_KEY: _SECRET.NEWS_API_KEY || _ENV.NEWS_API_KEY || '',
  NEWS_API_BASE_URL: _SECRET.NEWS_API_BASE_URL || _ENV.NEWS_API_BASE_URL || 'https://api.forexfactory.com',
  
  // ==========================================================
  // 💰 FİYAT AYARLARI (Herkese açık)
  // ==========================================================
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

  // ==========================================================
  // ⚙️ DİĞER AYARLAR (Herkese açık)
  // ==========================================================
  NOWPAYMENTS_ENV: 'production',
  NOWPAYMENTS_CURRENCY: 'USD',
  NOWPAYMENTS_PAY_CURRENCY: 'LTC',

  THEME: {
    backgroundColor: '#0a0a0f',
    fontSize: 16,
    surfaceColor: '#111118',
    borderColor: '#1e1e2e',
    textColor: '#e8e8f0'
  }
};

// ════════════════════════════════════════════════════════════════
// 💰 FİYAT FONKSİYONLARI - GLOBAL OLARAK TANIMLA
// ════════════════════════════════════════════════════════════════

window.getPrices = function() {
  try {
    const saved = localStorage.getItem('ww_prices');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        monthly: (typeof parsed.monthly === 'number' && !isNaN(parsed.monthly) && parsed.monthly > 0) ? parsed.monthly : WW_CONFIG.DEFAULT_PRICES.monthly,
        yearly: (typeof parsed.yearly === 'number' && !isNaN(parsed.yearly) && parsed.yearly > 0) ? parsed.yearly : WW_CONFIG.DEFAULT_PRICES.yearly,
        currency: (typeof parsed.currency === 'string') ? parsed.currency : WW_CONFIG.DEFAULT_PRICES.currency,
        discount: {
          yearly: (typeof parsed.discount?.yearly === 'number' && !isNaN(parsed.discount?.yearly)) ? parsed.discount.yearly : WW_CONFIG.DEFAULT_PRICES.discount.yearly,
          promo: (typeof parsed.discount?.promo === 'number' && !isNaN(parsed.discount?.promo)) ? parsed.discount.promo : WW_CONFIG.DEFAULT_PRICES.discount.promo
        },
        paymentMethods: Array.isArray(parsed.paymentMethods) && parsed.paymentMethods.length > 0 
          ? parsed.paymentMethods 
          : WW_CONFIG.DEFAULT_PRICES.paymentMethods
      };
    }
  } catch (e) {}
  return {
    monthly: WW_CONFIG.DEFAULT_PRICES.monthly,
    yearly: WW_CONFIG.DEFAULT_PRICES.yearly,
    currency: WW_CONFIG.DEFAULT_PRICES.currency,
    discount: {
      yearly: WW_CONFIG.DEFAULT_PRICES.discount.yearly,
      promo: WW_CONFIG.DEFAULT_PRICES.discount.promo
    },
    paymentMethods: WW_CONFIG.DEFAULT_PRICES.paymentMethods.slice()
  };
};

window.getMonthlyPrice = function() {
  try {
    const prices = window.getPrices();
    const value = prices.monthly;
    return (typeof value === 'number' && !isNaN(value) && value > 0) ? value : 9;
  } catch (e) {
    return 9;
  }
};

window.getYearlyPrice = function() {
  try {
    const prices = window.getPrices();
    const value = prices.yearly;
    return (typeof value === 'number' && !isNaN(value) && value > 0) ? value : 79;
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
    
    if (window.updateHomePrices) {
      window.updateHomePrices();
    }
    
    return updatedPrices;
  } catch (e) {
    return null;
  }
};

window.resetPrices = function() {
  try {
    localStorage.removeItem('ww_prices');
    if (window.updateHomePrices) {
      window.updateHomePrices();
    }
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
    if (updated !== null) {
      if (window.setYearlyDiscount) {
        window.setYearlyDiscount(discountPercent);
      }
      return true;
    }
    return false;
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

// ── WW_CONFIG.PRICES ile uyumluluk için ──
if (!WW_CONFIG.PRICES) {
  Object.defineProperty(WW_CONFIG, 'PRICES', {
    get: function() {
      return window.getPrices();
    },
    set: function(value) {
      if (value) {
        window.savePrices(value);
      }
    },
    configurable: true,
    enumerable: true
  });
}

// ── WW_CONFIG'i global olarak tanımla ──────────────────────
if (typeof window !== 'undefined') {
  window.WW_CONFIG = WW_CONFIG;
}

console.log('✅ Wawe Journal config loaded!');
console.log('🔑 API Keys:', {
  SUPABASE: WW_CONFIG.SUPABASE_URL ? '✅' : '❌',
  NOWPAYMENTS: WW_CONFIG.NOWPAYMENTS_API_KEY ? '✅' : '❌'
});