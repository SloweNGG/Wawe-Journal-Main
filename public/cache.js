// ============================================================
// WAWE JOURNAL - SWR / CLIENT CACHE MANAGER (Instant Page Loads)
// ============================================================
// Amaç: Dashboard, Trades, Calendar ve Premium Dashboard arasında
// gezinirken verileri 0ms'de anında ekrana basmak ve arka planda
// gerektiğinde tazelemek. Yeni işlem kaydedildiğinde/silindiğinde
// ('trade-saved') önbellek kendini otomatik temizler.
// ============================================================

(function(global) {
  'use strict';

  var CACHE_TTL_MS = 2 * 60 * 1000; // 2 dakika tazelik süresi
  var memoryCache = new Map();

  function getCacheKey(prefix, userId, journalId) {
    return (prefix || 'trades') + ':' + (userId || 'anon') + ':' + (journalId || 'all');
  }

  var WwCache = {
    /**
     * Önbellekten veri oku (geçerli ise)
     */
    get: function(prefix, userId, journalId) {
      try {
        var key = getCacheKey(prefix, userId, journalId);
        
        // 1. Önce RAM (Memory Cache) kontrolü
        if (memoryCache.has(key)) {
          var item = memoryCache.get(key);
          if (Date.now() - item.timestamp < CACHE_TTL_MS) {
            return item.data;
          }
          memoryCache.delete(key);
        }

        // 2. SessionStorage kontrolü
        var raw = sessionStorage.getItem('ww_cache_' + key);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
            memoryCache.set(key, parsed);
            return parsed.data;
          }
          sessionStorage.removeItem('ww_cache_' + key);
        }
      } catch (e) {
        // Kota/JSON hatası vs. sessizce geç
      }
      return null;
    },

    /**
     * Önbelleğe veri yaz
     */
    set: function(prefix, userId, journalId, data) {
      try {
        if (!data || !Array.isArray(data)) return;
        var key = getCacheKey(prefix, userId, journalId);
        var entry = {
          timestamp: Date.now(),
          data: data
        };

        memoryCache.set(key, entry);

        // Çok büyük listelerde quota hatası almamak için güvenli set
        try {
          // 5000+ satırlarda sessionStorage'ı şişirmemek için limitli tutulabilir
          if (data.length <= 3000) {
            sessionStorage.setItem('ww_cache_' + key, JSON.stringify(entry));
          }
        } catch (storageErr) {}
      } catch (e) {}
    },

    /**
     * İşlem eklendiğinde, silindiğinde veya güncellendiğinde önbelleği temizle
     */
    invalidate: function(prefix) {
      try {
        memoryCache.clear();
        for (var i = sessionStorage.length - 1; i >= 0; i--) {
          var k = sessionStorage.key(i);
          if (k && k.indexOf('ww_cache_') === 0) {
            if (!prefix || k.indexOf('ww_cache_' + prefix) === 0) {
              sessionStorage.removeItem(k);
            }
          }
        }
        if (typeof wwLog !== 'undefined' && wwLog.log) {
          wwLog.log('⚡ [WwCache] Önbellek geçersiz kılındı (tazelendi).');
        }
      } catch (e) {}
    }
  };

  // Global erişim
  global.wwCache = WwCache;

  // Global olayları dinle: işlem eklendiğinde veya silindiğinde önbelleği düşür
  if (typeof window !== 'undefined') {
    window.addEventListener('trade-saved', function() {
      WwCache.invalidate('trades');
    });
    window.addEventListener('trade-deleted', function() {
      WwCache.invalidate('trades');
    });
    window.addEventListener('storage', function(e) {
      if (e.key === 'ww_active_journal_id' || e.key === 'activeJournalId') {
        WwCache.invalidate('trades');
      }
    });
  }

})(typeof window !== 'undefined' ? window : this);
