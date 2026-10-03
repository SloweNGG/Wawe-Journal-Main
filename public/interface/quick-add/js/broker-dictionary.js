/**
 * broker-dictionary.js
 * ---------------------------------------------------------------------------
 * Layer 1 (Normalization) + shared low-level utilities used by every other
 * module (broker-detector.js, fill-pairing.js, parser-v2.js). Load this file
 * FIRST via <script>.
 *
 * Exposes: window.BrokerDictionary = {
 *   normalizeHeader, normalizeValue, levenshtein,
 *   parseNumber, parseDate, normalizeDirection,
 *   FIELD_ORDER, FIELD_CANDIDATES, EXCEL_EPOCH
 * }
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------
  // Character folding tables (Latin-script diacritics -> ASCII)
  // ---------------------------------------------------------------------
  var ACCENT_MAP = {
    // Turkish
    'ı': 'i', 'İ': 'i', 'ş': 's', 'Ş': 's', 'ğ': 'g', 'Ğ': 'g',
    'ü': 'u', 'Ü': 'u', 'ö': 'o', 'Ö': 'o', 'ç': 'c', 'Ç': 'c',
    // German
    'ä': 'a', 'Ä': 'a', 'ß': 'ss',
    // Spanish / Portuguese
    'á': 'a', 'Á': 'a', 'é': 'e', 'É': 'e', 'í': 'i', 'Í': 'i',
    'ó': 'o', 'Ó': 'o', 'ú': 'u', 'Ú': 'u', 'ñ': 'n', 'Ñ': 'n',
    'ã': 'a', 'Ã': 'a', 'õ': 'o', 'Õ': 'o', 'â': 'a', 'Â': 'a',
    'ê': 'e', 'Ê': 'e', 'ô': 'o', 'Ô': 'o', 'à': 'a', 'À': 'a'
  };

  function foldAccents(str) {
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      out += ACCENT_MAP.hasOwnProperty(ch) ? ACCENT_MAP[ch] : ch;
    }
    return out;
  }

  /**
   * normalizeHeader: lowercase, strip BOM/NBSP/zero-width chars, fold Latin
   * diacritics, then keep only [a-z0-9] plus Cyrillic letters (а-яё) so
   * Russian headers survive as meaningful tokens instead of being wiped out.
   */
  function normalizeHeader(h) {
    var s = String(h == null ? '' : h);
    s = s.replace(/^\uFEFF/, '');               // BOM
    s = s.replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' '); // NBSP / zero-width
    s = s.toLowerCase();
    s = foldAccents(s);
    // keep ascii letters/digits and cyrillic letters, drop everything else
    s = s.replace(/[^a-z0-9\u0430-\u044f\u0451]/g, '');
    return s;
  }

  function normalizeValue(v) {
    return normalizeHeader(v);
  }

  /**
   * Classic Levenshtein edit distance (iterative DP, O(n*m)).
   */
  function levenshtein(a, b) {
    if (a === b) return 0;
    var al = a.length, bl = b.length;
    if (al === 0) return bl;
    if (bl === 0) return al;
    var prev = new Array(bl + 1);
    var cur = new Array(bl + 1);
    for (var j = 0; j <= bl; j++) prev[j] = j;
    for (var i = 1; i <= al; i++) {
      cur[0] = i;
      var ca = a.charCodeAt(i - 1);
      for (j = 1; j <= bl; j++) {
        var cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
        var del = prev[j] + 1;
        var ins = cur[j - 1] + 1;
        var sub = prev[j - 1] + cost;
        cur[j] = Math.min(del, ins, sub);
      }
      var tmp = prev; prev = cur; cur = tmp;
    }
    return prev[bl];
  }

  // ---------------------------------------------------------------------
  // Number parsing
  // ---------------------------------------------------------------------
  function parseNumber(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return isFinite(raw) ? raw : null;
    var s = String(raw).trim();
    if (s === '') return null;

    var negative = false;
    if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }

    s = s.replace(/[€$£₺¥]/g, '').replace(/\s/g, '').replace(/%$/, '').replace(/^\+/, '');
    if (/^-/.test(s)) { negative = true; s = s.slice(1); }
    if (/^-/.test(s)) { s = s.slice(1); }

    var hasComma = s.indexOf(',') >= 0;
    var hasDot = s.indexOf('.') >= 0;

    if (hasComma && hasDot) {
      var lastComma = s.lastIndexOf(',');
      var lastDot = s.lastIndexOf('.');
      if (lastComma > lastDot) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (hasComma && !hasDot) {
      var parts = s.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        s = parts[0].replace(/,/g, '') + '.' + parts[1];
      } else {
        s = s.replace(/,/g, '');
      }
    }

    var n = parseFloat(s);
    if (isNaN(n)) return null;
    return negative ? -n : n;
  }

  // ---------------------------------------------------------------------
  // Date parsing — supports milliseconds (e.g. 17/06/2026 07:24:01.278)
  // ---------------------------------------------------------------------
  var EXCEL_EPOCH = Date.UTC(1899, 11, 30);

  function excelSerialToDate(serial) {
    var ms = EXCEL_EPOCH + Math.round(serial * 86400000);
    return new Date(ms);
  }

  function parseDate(raw) {
    if (raw === null || raw === undefined || raw === '') return null;

    // Excel serial date
    if (typeof raw === 'number') {
      if (raw > 20000 && raw < 80000) return excelSerialToDate(raw);
      return null;
    }

    // Already a Date object
    if (raw instanceof Date) {
      return isNaN(raw.getTime()) ? null : raw;
    }

    var s = String(raw).trim();
    if (s === '') return null;

    // Pure numeric string that looks like an excel serial
    if (/^\d{4,6}(\.\d+)?$/.test(s)) {
      var num = parseFloat(s);
      if (num > 20000 && num < 80000) return excelSerialToDate(num);
    }

    // 1. Explicit offset check: has 'Z' or [+-]\d{2}(?::?\d{2})? at end
    var offsetMatch = s.match(/(?:Z|[+-]\d{2}(?::?\d{2})?)$/i);

    // ⭐ ISO 8601 with optional milliseconds:
    //  2026-06-17T07:24:01.278 / 2026-06-17 07:24:01.278 / 2026.06.17 07:24:01
    var m = s.match(/^(\d{4})[-.](\d{2})[-.](\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(.*)?$/);
    if (m) {
      if (offsetMatch) {
        var parsedNative = new Date(s);
        if (!isNaN(parsedNative.getTime())) return parsedNative;
      }
      // Saat dilimi yoksa kullanıcının yerel saati olarak yorumla (new Date(Y, M-1, D, H, m, s) yerel saatle oluşturur)
      return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    }

    // Date only ISO-ish: 2026-06-17 / 2026.06.17
    m = s.match(/^(\d{4})[-.](\d{2})[-.](\d{2})$/);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));

    // ⭐ DD/MM/YYYY or DD.MM.YYYY with time + optional milliseconds:
    //  17/06/2026 07:24:01.278
    m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(.*)?$/);
    if (m) {
      var d1 = +m[1], mo1 = +m[2];
      if (mo1 > 12 && d1 <= 12) { var t = d1; d1 = mo1; mo1 = t; }
      if (offsetMatch) {
        var isoStr = m[3] + '-' + String(mo1).padStart(2, '0') + '-' + String(d1).padStart(2, '0') + 'T' +
                     String(+m[4]).padStart(2, '0') + ':' + String(+m[5]).padStart(2, '0') + ':' +
                     String(+(m[6] || 0)).padStart(2, '0') + (m[7] || '');
        var parsedOffset = new Date(isoStr);
        if (!isNaN(parsedOffset.getTime())) return parsedOffset;
      }
      // Yerel saat olarak oluştur
      return new Date(+m[3], mo1 - 1, d1, +m[4], +m[5], +(m[6] || 0));
    }

    // ⭐ DD/MM/YYYY or DD.MM.YYYY with time but WITHOUT seconds:
    //  17/06/2026 07:24
    m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})[ T](\d{1,2}):(\d{2})(.*)?$/);
    if (m) {
      var d2 = +m[1], mo2 = +m[2];
      if (mo2 > 12 && d2 <= 12) { var t2 = d2; d2 = mo2; mo2 = t2; }
      if (offsetMatch) {
        var isoStr2 = m[3] + '-' + String(mo2).padStart(2, '0') + '-' + String(d2).padStart(2, '0') + 'T' +
                      String(+m[4]).padStart(2, '0') + ':' + String(+m[5]).padStart(2, '0') + ':00' + (m[6] || '');
        var parsedOffset2 = new Date(isoStr2);
        if (!isNaN(parsedOffset2.getTime())) return parsedOffset2;
      }
      // Yerel saat olarak oluştur
      return new Date(+m[3], mo2 - 1, d2, +m[4], +m[5]);
    }

    // ⭐ DD/MM/YYYY or DD.MM.YYYY (date only)
    m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
    if (m) {
      var d3 = +m[1], mo3 = +m[2];
      if (mo3 > 12 && d3 <= 12) { var t3 = d3; d3 = mo3; mo3 = t3; }
      return new Date(Date.UTC(+m[3], mo3 - 1, d3));
    }

    // Last resort: let the JS engine try
    var native = new Date(s);
    if (!isNaN(native.getTime())) return native;

    return null;
  }

  // ---------------------------------------------------------------------
  // Direction parsing
  // ---------------------------------------------------------------------
  var SHORT_EXACT = ['S', 'SH', 'SELL', 'SHORT', 'SAT', 'SATIŞ', 'SATIS', 'SATIM'];
  var LONG_EXACT = ['B', 'L', 'BUY', 'LONG', 'AL', 'ALIŞ', 'ALIS', 'ALIM'];

  var SHORT_SUBSTR = [
    'sell', 'short',
    'sat', 'satis', 'satim',
    'verkauf', 'leerverkauf',
    'venta', 'corto',
    'venda', 'curto',
    'продажа', 'шорт'
  ];
  var LONG_SUBSTR = [
    'buy', 'long',
    'alis', 'alim',
    'kauf', 'long',
    'compra', 'largo',
    'compra', 'longo',
    'покупка', 'лонг'
  ];

  function normalizeDirection(raw) {
    if (raw === null || raw === undefined) return null;
    var trimmedUpper = String(raw).trim().toUpperCase();
    if (SHORT_EXACT.indexOf(trimmedUpper) >= 0) return 'SHORT';
    if (LONG_EXACT.indexOf(trimmedUpper) >= 0) return 'LONG';

    var norm = normalizeValue(raw);
    for (var i = 0; i < SHORT_SUBSTR.length; i++) {
      if (norm.indexOf(SHORT_SUBSTR[i]) >= 0) return 'SHORT';
    }
    for (var j = 0; j < LONG_SUBSTR.length; j++) {
      if (norm.indexOf(LONG_SUBSTR[j]) >= 0) return 'LONG';
    }
    return null;
  }

  // ---------------------------------------------------------------------
  // Field dictionaries
  // ---------------------------------------------------------------------
  var FIELD_ORDER = ['symbol', 'direction', 'date', 'entry', 'exit', 'lot', 'pnl', 'sl', 'tp', 'fee'];

  var FIELD_CANDIDATES = {
    symbol: [
      'sembol', 'symbol', 'enstruman', 'parite', 'ticker', 'instrument',
      'instrumentname', 'asset', 'item', 'pair',
      'wertpapier', 'instrumento', 'simbolo', 'par', 'инструмент', 'символ'
    ],
    direction: [
      'islemacilisyonu', 'islemyonu', 'yon', 'direction', 'tradetype',
      'buysell', 'ordertype', 'side', 'type', 'action',
      'richtung', 'seite', 'typ', 'direccion', 'lado', 'tipo',
      'direcao', 'направление', 'сторона', 'тип'
    ],
    date: [
      'kapatmazamani', 'kapaniszamani', 'closetime', 'closingtime', 'exittime',
      'createtime', 'tarih', 'datetime', 'date', 'time', 'opentime',
      'schliesszeit', 'zeit', 'datum', 'horadecierre', 'fecha', 'hora',
      'horadefechamento', 'data', 'времязакрытия', 'дата', 'время'
    ],
    entry: [
      'girisfiyati', 'entryprice', 'avgentryprice', 'openprice', 'entry', 'giris',
      'eroffnungspreis', 'einstiegspreis',
      'preciodeentrada', 'preciodeapertura',
      'precodeentrada', 'precodeabertura',
      'ценаоткрытия', 'price'
    ],
    exit: [
      'kapanisfiyati', 'cikisfiyati', 'closingprice', 'closeprice', 'avgexitprice',
      'exitprice', 'exit', 'cikis',
      'schlusskurs', 'ausstiegspreis',
      'preciodesalida', 'preciodecierre',
      'precodesaida', 'precodefechamento',
      'ценазакрытия'
    ],
    lot: [
      'kapanismiktari', 'miktar', 'lot', 'size', 'volume', 'units', 'qty',
      'closedsize', 'executed', 'quantity', 'contracts',
      'menge', 'volumen', 'stuckzahl',
      'cantidad', 'quantidade', 'объем', 'количество'
    ],
    pnl: [
      'kapatmakz', 'closedpl', 'closedpnl', 'net', 'netdollar', 'kz', 'kar',
      'realizedprofit', 'realizedpl', 'netprofit', 'profit', 'pnl',
      'gewinn', 'nettogewinn', 'ganancia', 'beneficio', 'lucro', 'ganho',
      'прибыль', 'чистаяприбыль'
    ],
    sl: ['sl', 'stoploss', 'zarardurdur', 'verlustbegrenzung', 'стоплосс'],
    tp: ['tp', 'takeprofit', 'karal', 'gewinnmitnahme', 'тейкпрофит'],
    fee: ['fee', 'commission', 'komisyon', 'ucret', 'gebuhr', 'comision', 'taxa', 'комиссия']
  };

  global.BrokerDictionary = {
    normalizeHeader: normalizeHeader,
    normalizeValue: normalizeValue,
    levenshtein: levenshtein,
    parseNumber: parseNumber,
    parseDate: parseDate,
    normalizeDirection: normalizeDirection,
    FIELD_ORDER: FIELD_ORDER,
    FIELD_CANDIDATES: FIELD_CANDIDATES,
    EXCEL_EPOCH: EXCEL_EPOCH
  };
})(typeof window !== 'undefined' ? window : this);