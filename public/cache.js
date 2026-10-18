// ============================================================
// WAWE JOURNAL - SWR / CLIENT CACHE MANAGER (Instant Page Loads)
// ============================================================
// Amaç: Dashboard, Trades, Calendar ve Premium Dashboard arasında
// gezinirken verileri 0ms'de anında ekrana basmak ve arka planda
// gerektiğinde tazelemek. Yeni işlem kaydedildiğinde/silindiğinde
// ('trade-saved') önbellek kendini otomatik temizler.
//
// KOLON FARKINDALIĞI: Her sayfa 'trades' tablosundan FARKLI kolonları çeker
// (Calendar/Strategies/Dashboard hafif listeler, Trades sayfası tam liste).
// Sayfalar arası paylaşımda eksik kolonlu liste "tam veri" sanılırsa, Trades
// sayfasında düzenlenen işlemin SL/TP/not/komisyon/swap alanları DB'de
// sıfırlanabiliyordu. Bu yüzden get() artık opsiyonel `needCols` alır ve
// yalnızca bu kolonların TAMAMINI taşıyan veriyi döndürür; set() de eksik
// kolonlu listeyi, daha fazla kolonu olan canlı bir listenin üzerine yazmaz.
//
// KAPSAM SÖZLEŞMESİ (Backtest v2): 'trades' ve 'trades_<sayfa>' anahtarları YALNIZCA
// canlı satır taşır (platform_source IS DISTINCT FROM 'backtest'). Karışık ya da backtest
// listeler WwTrades.cacheKey() ile 'trades@all' / 'trades@backtest' anahtarlarına yazılır;
// bu anahtarlar çapraz beslenmez (isLiveTradePrefix), ama invalidate('trades') onları da siler.
// ============================================================

(function(global) {
  'use strict';

  var CACHE_TTL_MS = 2 * 60 * 1000; // 2 dakika tazelik süresi
  var memoryCache = new Map();

  function getCacheKey(prefix, userId, journalId) {
    return (prefix || 'trades') + ':' + (userId || 'anon') + ':' + (journalId || 'all');
  }

  // Yalnızca canlı işlem listeleri ('trades', 'trades_dashboard', 'trades_calendar', ...) sayfalar arası paylaşılır.
  // 'trades@all' / 'trades@backtest' gibi kapsamlı anahtarlar paylaşılmaz.
  function isLiveTradePrefix(prefix) {
    return typeof prefix === 'string' && /^trades(_[a-z]+)?$/.test(prefix);
  }

  // Liste, istenen kolonların hepsini taşıyor mu? (PostgREST aynı sorguda tüm satırlara
  // aynı anahtarları döndürür, bu yüzden ilk satıra bakmak yeterli. Boş liste her zaman uygundur.)
  function hasCols(data, needCols) {
    if (!needCols || !needCols.length) return true;
    if (!Array.isArray(data) || data.length === 0) return true;
    var row = data[0];
    if (!row || typeof row !== 'object') return false;
    for (var i = 0; i < needCols.length; i++) {
      if (!(needCols[i] in row)) return false;
    }
    return true;
  }

  function colKeys(data) {
    return (Array.isArray(data) && data.length > 0 && data[0] && typeof data[0] === 'object')
      ? Object.keys(data[0]) : [];
  }

  // `existing`, `incoming`ın kolonlarının üst kümesi ve daha zengin mi?
  function isRicherSuperset(existingData, incomingData) {
    var a = colKeys(existingData), b = colKeys(incomingData);
    if (a.length <= b.length) return false;
    for (var i = 0; i < b.length; i++) {
      if (a.indexOf(b[i]) < 0) return false;
    }
    return true;
  }

  // Ham (çapraz mantık olmadan) taze kayıt: önce RAM, sonra sessionStorage
  function readLiveEntry(key) {
    var item = memoryCache.get(key);
    if (item && Date.now() - item.timestamp < CACHE_TTL_MS) return item;
    try {
      var raw = sessionStorage.getItem('ww_cache_' + key);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Date.now() - parsed.timestamp < CACHE_TTL_MS) return parsed;
      }
    } catch (e) {}
    return null;
  }

  // Çapraz besleme yazımı: mevcut taze liste daha zengin kolonlara sahipse ONU KORU
  function writeCross(key, data) {
    var existing = readLiveEntry(key);
    if (existing && isRicherSuperset(existing.data, data)) return;
    var entry = { timestamp: Date.now(), data: data };
    memoryCache.set(key, entry);
    try {
      if (data.length <= 3000) {
        sessionStorage.setItem('ww_cache_' + key, JSON.stringify(entry));
      }
    } catch (se) {}
  }

  var WwCache = {
    /**
     * Önbellekten veri oku (geçerli ise).
     * needCols (opsiyonel): çağıranın ihtiyaç duyduğu kolon adları. Verilirse yalnızca
     * bu kolonların hepsini taşıyan veri döner; aksi halde null (çağıran taze çeker).
     */
    get: function(prefix, userId, journalId, needCols) {
      try {
        var key = getCacheKey(prefix, userId, journalId);

        // 1. Önce RAM (Memory Cache) kontrolü
        if (memoryCache.has(key)) {
          var item = memoryCache.get(key);
          if (Date.now() - item.timestamp < CACHE_TTL_MS) {
            if (hasCols(item.data, needCols)) return item.data;
          } else {
            memoryCache.delete(key);
          }
        }

        // 2. SessionStorage kontrolü
        var raw = sessionStorage.getItem('ww_cache_' + key);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
            if (hasCols(parsed.data, needCols)) {
              memoryCache.set(key, parsed);
              return parsed.data;
            }
          } else {
            sessionStorage.removeItem('ww_cache_' + key);
          }
        }

        // ⚡ 3. Sayfalar Arası Akıllı Senkronizasyon (Cross-page SWR)
        // Dashboard, Trades, Calendar, Strategies ve Premium Dashboard aynı defterdeki
        // aynı işlem verisini paylaşır. Biri indirdiğinde diğerleri Supabase'e gitmeden anında faydalanır.
        // Yalnızca ihtiyaç duyulan kolonları taşıyan listeler paylaşılır (needCols).
        var isTradePrefix = isLiveTradePrefix(prefix);
        if (isTradePrefix) {
          var mainKey = getCacheKey('trades', userId, journalId);
          var dashKey = getCacheKey('trades_dashboard', userId, journalId);

          if (prefix === 'trades_dashboard') {
            // Dashboard kronolojik (ASC) sıra bekler. Ana 'trades' listesi (DESC) varsa ters çevirerek kullan.
            var mainTrades = this.get('trades', userId, journalId, needCols);
            if (mainTrades && Array.isArray(mainTrades) && mainTrades.length > 0) {
              var ascTrades = mainTrades.slice().reverse();
              memoryCache.set(dashKey, { timestamp: Date.now(), data: ascTrades });
              return ascTrades;
            }
          } else {
            // Diğer sayfalar (trades, calendar, strategies, premium) DESC sıra bekler.
            // Eğer ana liste yok ama dashboard listesi varsa, ters çevirerek kullan.
            if (prefix !== 'trades') {
              var existingMain = this.get('trades', userId, journalId, needCols);
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
            if (dashTrades && Array.isArray(dashTrades.data) && dashTrades.data.length > 0 &&
                Date.now() - dashTrades.timestamp < CACHE_TTL_MS && hasCols(dashTrades.data, needCols)) {
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
        var isTradePrefix = isLiveTradePrefix(prefix);
        if (isTradePrefix) {
          var mainKey = getCacheKey('trades', userId, journalId);
          var dashKey = getCacheKey('trades_dashboard', userId, journalId);

          if (prefix === 'trades_dashboard') {
            writeCross(mainKey, data.slice().reverse());
          } else {
            // Trades, calendar veya strategies kaydedildiyse, dashboard için ASC listeyi de hazırla
            if (prefix !== 'trades') {
              writeCross(mainKey, data);
            }
            writeCross(dashKey, data.slice().reverse());
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

  // Global olayları dinle: işlem/strateji eklendiğinde veya silindiğinde önbelleği düşür
  if (typeof window !== 'undefined') {
    window.addEventListener('trade-saved', function() {
      WwCache.invalidate('trades');
    });
    window.addEventListener('trade-deleted', function() {
      WwCache.invalidate('trades');
    });
    window.addEventListener('strategy-saved', function() {
      WwCache.invalidate('strategies');
    });
    window.addEventListener('strategy-deleted', function() {
      WwCache.invalidate('strategies');
    });
    window.addEventListener('storage', function(e) {
      if (e.key === 'ww_active_journal_id' || e.key === 'activeJournalId') {
        WwCache.invalidate('trades');
        WwCache.invalidate('strategies');
      }
    });
  }

})(typeof window !== 'undefined' ? window : this);
