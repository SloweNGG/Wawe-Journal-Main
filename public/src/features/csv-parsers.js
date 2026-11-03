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

    // Tarihi okunamayan satır asla "bugün" sayılmaz (ParserV2 bunları zaten atlar; bu son kontrol): hatalı satır olarak
    // önizlemede gösterilir, içe aktarılmaz
    var errors = (result.errors || []).slice();
    var dated = (result.rows || []).filter(function (r) {
      if (formatDateISO(r.date)) return true;
      errors.push('Satır ' + (r.line || '?') + ': tarih okunamadı, atlandı.');
      return false;
    });

    return {
      rows: dated.map(function(r) {
        var note = (r.comment && String(r.comment).trim()) ? String(r.comment).trim() : (r.notes || 'CSV Import');
        return {
          symbol: r.symbol,
          direction: r.direction,
          lot: r.lot,
          entry_price: r.entry,
          exit_price: r.exit,
          stop_loss: r.sl,
          take_profit: r.tp,
          trade_date: formatDateISO(r.date),
          notes: note,
          pnl: r.pnl,
          gross_pnl: r.gross_pnl != null ? r.gross_pnl : null,
          commission: r.commission != null ? Math.abs(r.commission) : (r.fee != null ? Math.abs(r.fee) : 0),
          swap: r.swap != null ? r.swap : 0,
          ticket: r.ticket || null
        };
      }),
      errors: errors,
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

  // ⭐ Sağlam tarih formatlayıcı — Saat varsa ISO UTC, saat yoksa YYYY-MM-DD döner.
  // Okunamayan/boş girdi için null döner (eskiden sessizce "şimdi" yazılıyordu ve içe aktarma hash'i
  // her denemede değiştiği için DB mükerrer kontrolü de işlemiyordu).
  // Saat dilimi bilgisi olmayan duvar saatleri Ayarlar > Görünüm > Saat ve Gün'deki içe aktarma saat dilimine göre çevrilir.
  function formatDateISO(date) {
    if (!date) return null;

    // 1. String
    if (typeof date === 'string') {
      var s = date.trim();
      var hasOffset = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(s);
      var mIsoTime = s.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (mIsoTime) {
        if (hasOffset) {
          var parsedOffset = new Date(s);
          if (!isNaN(parsedOffset.getTime())) return parsedOffset.toISOString();
        }
        if (window.WwTime) {
          return window.WwTime.importWallTimeToIso(+mIsoTime[1], +mIsoTime[2], +mIsoTime[3], +mIsoTime[4], +mIsoTime[5], +(mIsoTime[6] || 0));
        }
        var localDate = new Date(+mIsoTime[1], +mIsoTime[2] - 1, +mIsoTime[3], +mIsoTime[4], +mIsoTime[5], +(mIsoTime[6] || 0));
        if (!isNaN(localDate.getTime())) return localDate.toISOString();
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      var parsed = new Date(s);
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
      return null;
    }

    // 2. Date objesi (ParserV2/BrokerDictionary.parseDate zaten saat dilimi ayarını uygulamıştır)
    if (date instanceof Date) {
      return isNaN(date.getTime()) ? null : date.toISOString();
    }

    // 3. Number (Excel serial vs.)
    if (typeof date === 'number') {
      var EXCEL_EPOCH = Date.UTC(1899, 11, 30);
      if (date > 20000 && date < 80000) {
        var ms = EXCEL_EPOCH + Math.round(date * 86400000);
        return new Date(ms).toISOString();
      }
    }

    return null;
  }
}