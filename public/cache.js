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

        // ⚡ 3. Sayfalar Arası Akıllı Senkronizasyon (Cross-page SWR)
        // Dashboard, Trades, Calendar, Strategies ve Premium Dashboard aynı defterdeki
        // aynı işlem verisini paylaşır. Biri indirdiğinde diğerleri Supabase'e gitmeden anında faydalanır.
        var isTradePrefix = prefix && prefix.indexOf('trades') === 0;
        if (isTradePrefix) {
          var mainKey = getCacheKey('trades', userId, journalId);
          var dashKey = getCacheKey('trades_dashboard', userId, journalId);

          if (prefix === 'trades_dashboard') {
            // Dashboard kronolojik (ASC) sıra bekler. Ana 'trades' listesi (DESC) varsa ters çevirerek kullan.
            var mainTrades = this.get('trades', userId, journalId);
            if (mainTrades && Array.isArray(mainTrades) && mainTrades.length > 0) {
              var ascTrades = mainTrades.slice().reverse();
              memoryCache.set(dashKey, { timestamp: Date.now(), data: ascTrades });
              return ascTrades;
            }
          } else {
            // Diğer sayfalar (trades, calendar, strategies, premium) DESC sıra bekler.
            // Eğer ana liste yok ama dashboard listesi varsa, ters çevirerek kullan.
            if (prefix !== 'trades') {
              var existingMain = this.get('trades', userId, journalId);
              if (existingMain && Array.isArray(existingMain) && existingMain.length > 0) {
                memoryCache.set(key, { timestamp: Date.now(), data: existingMain });
                return existingMain;
              }
            }
            var dashTrades = memoryCache.get(dashKey);
            if (!dashTrades) {
              var rawDash = sessionStorage.getItem('ww_cache_' + dashKey);
              if (rawDash) {
                try { dashTrades = JSON.parse(rawDash); } catch (e) {}
              }
            }
            if (dashTrades && Array.isArray(dashTrades.data) && dashTrades.data.length > 0) {
              var descTrades = dashTrades.data.slice().reverse();
              memoryCache.set(key, { timestamp: Date.now(), data: descTrades });
              memoryCache.set(mainKey, { timestamp: Date.now(), data: descTrades });
              return descTrades;
            }
          }
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
          if (data.length <= 3000) {
            sessionStorage.setItem('ww_cache_' + key, JSON.stringify(entry));
          }
        } catch (storageErr) {}

        // ⚡ Sayfalar arası çapraz besleme:
        // Dashboard verisi kaydedildiyse, diğer sayfalar için DESC listeyi de hazırla
        var isTradePrefix = prefix && prefix.indexOf('trades') === 0;
        if (isTradePrefix) {
          var mainKey = getCacheKey('trades', userId, journalId);
          var dashKey = getCacheKey('trades_dashboard', userId, journalId);

          if (prefix === 'trades_dashboard') {
            var descData = data.slice().reverse();
            memoryCache.set(mainKey, { timestamp: Date.now(), data: descData });
            try {
              if (descData.length <= 3000) {
                sessionStorage.setItem('ww_cache_' + mainKey, JSON.stringify({ timestamp: Date.now(), data: descData }));
              }
            } catch (se) {}
          } else {
            // Trades, calendar veya strategies kaydedildiyse, dashboard için ASC listeyi de hazırla
            if (prefix !== 'trades') {
              memoryCache.set(mainKey, entry);
            }
            var ascData = data.slice().reverse();
            memoryCache.set(dashKey, { timestamp: Date.now(), data: ascData });
            try {
              if (ascData.length <= 3000) {
                sessionStorage.setItem('ww_cache_' + dashKey, JSON.stringify({ timestamp: Date.now(), data: ascData }));
              }
            } catch (se) {}
          }
        }
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
