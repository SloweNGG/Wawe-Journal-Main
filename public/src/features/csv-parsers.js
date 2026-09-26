// ============================================================
// csv-parsers.js — DEPRECATED WRAPPER
// ============================================================
// Bu dosya artık aktif parser değil. ParserV2'ye delege eder.
// Eski `parseCsvByBroker(text, broker)` API'si korunur.
//
// Aktif parser: public/interface/quick-add/js/parser-v2.js
// ============================================================

if (typeof window !== 'undefined') {
  window.parseCsvByBroker = function(text, broker) {
    if (typeof window.ParserV2 === 'undefined') {
      console.error('❌ ParserV2 yüklenmemiş! script sırasını kontrol edin.');
      return {
        rows: [],
        errors: ['ParserV2 yüklenemedi — script tag sırasını kontrol edin.'],
        detected: 'unknown',
        needsManualMapping: false,
        confidence: 0
      };
    }

    var result;
    try {
      result = window.ParserV2.parse(text, {});
    } catch (e) {
      console.error('ParserV2 hatası:', e);
      return {
        rows: [],
        errors: ['Parser çalıştırılamadı: ' + e.message],
        detected: 'unknown',
        needsManualMapping: false,
        confidence: 0
      };
    }

    return {
      rows: (result.rows || []).map(function(r) {
        return {
          symbol: r.symbol,
          direction: r.direction,
          lot: r.lot,
          entry_price: r.entry,
          exit_price: r.exit,
          stop_loss: r.sl,
          take_profit: r.tp,
          // ⭐ Fallback: tarih parse edilemezse bugünü kullan (DB NOT NULL için)
          trade_date: formatDateISO(r.date) || new Date().toISOString().split('T')[0],
          notes: 'CSV Import',
          pnl: r.pnl
        };
      }),
      errors: result.errors || [],
      warnings: result.warnings || [],
      detected: result.detected || 'generic',
      confidence: result.confidence || 0,
      needsManualMapping: result.needsManualMapping || false,
      missingFields: result.missingFields,
      headers: result.headers,
      headerFingerprint: result.headerFingerprint
    };
  };

  window.detectBroker = function(headers) {
    if (typeof window.BrokerDetector === 'undefined') return 'unknown';
    return window.BrokerDetector.detect(headers).broker;
  };

  // ⭐ Sağlam tarih formatlayıcı — her zaman YYYY-MM-DD döner, asla null değil
  function formatDateISO(date) {
    // 1. Boş/undefined → bugün
    if (!date) return new Date().toISOString().split('T')[0];

    // 2. String → YYYY-MM-DD formatına sok
    if (typeof date === 'string') {
      var s = date.trim();
      // Zaten ISO formatında mı?
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
      // Değilse JS Date'e parse etmeyi dene
      var parsed = new Date(s);
      if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
      return new Date().toISOString().split('T')[0];
    }

    // 3. Date objesi
    if (date instanceof Date) {
      if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
      return new Date().toISOString().split('T')[0];
    }

    // 4. Number (Excel serial vs.)
    if (typeof date === 'number') {
      // Excel epoch başlangıcı 1899-12-30
      var EXCEL_EPOCH = Date.UTC(1899, 11, 30);
      if (date > 20000 && date < 80000) {
        var ms = EXCEL_EPOCH + Math.round(date * 86400000);
        return new Date(ms).toISOString().split('T')[0];
      }
    }

    // 5. Bilinmeyen tip → bugün
    return new Date().toISOString().split('T')[0];
  }

  console.log('✅ csv-parsers.js (wrapper) yüklendi — ParserV2 aktif');
}