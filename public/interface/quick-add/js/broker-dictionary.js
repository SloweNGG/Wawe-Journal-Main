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
  // opts.decimal: ',' | '.' | undefined. A dosya düzeyinde ondalık ayracı biliniyorsa
  // (bkz. detectDecimalSeparator) hücre tek başına tahmin edilmez:
  //   ','  -> "1.234,56" / "1,08521" / "0,001"  (nokta = binlik ayracı)
  //   '.'  -> "1,234.56" / "1.08521"            (virgül = binlik ayracı)
  // İpucu yoksa tek hücreden tahmin edilir; belirsiz "1,234" (tam 3 hane) binlik sayılır.
  function parseNumber(raw, opts) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return isFinite(raw) ? raw : null;
    var s = String(raw).trim();
    if (s === '') return null;

    var decimalHint = opts && opts.decimal;
    var negative = false;
    if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }

    s = s.replace(/[€$£₺¥]/g, '').replace(/\s/g, '').replace(/%$/, '').replace(/^\+/, '');
    if (/^-/.test(s)) { negative = true; s = s.slice(1); }
    if (/^-/.test(s)) { s = s.slice(1); }

    var hasComma = s.indexOf(',') >= 0;
    var hasDot = s.indexOf('.') >= 0;

    if (decimalHint === ',') {
      s = s.replace(/\./g, '').replace(/,/g, '.');
    } else if (decimalHint === '.') {
      s = s.replace(/,/g, '');
    } else if (hasComma && hasDot) {
      var lastComma = s.lastIndexOf(',');
      var lastDot = s.lastIndexOf('.');
      if (lastComma > lastDot) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (hasComma && !hasDot) {
      var parts = s.split(',');
      // Tek virgül: tam 3 haneli ve tamsayı kısmı 0 olmayan değer ("1,234") belirsizdir
      // ve binlik sayılır. Diğer tüm tek-virgül biçimleri ondalıktır
      // ("1,5", "1,08521", "0,001", "0,125").
      if (parts.length === 2 && (parts[1].length !== 3 || /^0+$/.test(parts[0]))) {
        s = parts[0] + '.' + parts[1];
      } else {
        s = s.replace(/,/g, '');
      }
    }

    var n = parseFloat(s);
    if (isNaN(n)) return null;
    return negative ? -n : n;
  }

  // Dosyadaki sayısal hücrelere bakıp ondalık ayracını (',' veya '.') bulur.
  // Yalnızca KESİN kanıt oy sayılır; yetersiz/çelişkili kanıtta undefined döner.
  function detectDecimalSeparator(rows) {
    var commaVotes = 0, dotVotes = 0;
    var reCommaDec = /^-?\d+,(\d+)$/;
    var reDotDec = /^-?\d+\.(\d+)$/;
    var reCommaDecWithThousands = /^-?\d{1,3}(\.\d{3})+,\d+$/;
    var reDotDecWithThousands = /^-?\d{1,3}(,\d{3})+\.\d+$/;
    var reMultiComma = /^-?\d{1,3}(,\d{3}){2,}$/;
    var reMultiDot = /^-?\d{1,3}(\.\d{3}){2,}$/;

    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      if (!row) continue;
      for (var c = 0; c < row.length; c++) {
        var v = row[c];
        if (typeof v !== 'string') continue;
        var t = v.trim().replace(/[€$£₺¥\s]/g, '').replace(/^\+/, '').replace(/^\((.*)\)$/, '-$1');
        if (t === '' || t.length > 20) continue;
        var m;
        if (reCommaDecWithThousands.test(t) || reMultiDot.test(t)) { commaVotes++; continue; }
        if (reDotDecWithThousands.test(t) || reMultiComma.test(t)) { dotVotes++; continue; }
        if ((m = reCommaDec.exec(t))) {
          // "1,234" belirsiz; "0,5" ve "1,5" gibi 3 hane olmayanlar ya da 0,xxx kesin
          if (m[1].length !== 3 || /^-?0\d*,/.test(t)) commaVotes++;
          continue;
        }
        if ((m = reDotDec.exec(t))) {
          if (m[1].length !== 3 || /^-?0\./.test(t)) dotVotes++;
        }
      }
    }
    if (commaVotes > dotVotes) return ',';
    if (dotVotes > commaVotes) return '.';
    return undefined;
  }

  // ---------------------------------------------------------------------
  // Date parsing — supports milliseconds (e.g. 17/06/2026 07:24:01.278)
  // ---------------------------------------------------------------------
  var EXCEL_EPOCH = Date.UTC(1899, 11, 30);

  function excelSerialToDate(serial) {
    var ms = EXCEL_EPOCH + Math.round(serial * 86400000);
    return new Date(ms);
  }

  // Saat dilimi bilgisi OLMAYAN duvar saatini, Ayarlar > Görünüm > Saat ve Gün'deki "içe aktarılan dosyalardaki
  // saatler" saat dilimine göre gerçek bir ana (Date) çevirir. (Eskiden tarayıcının yerel saati varsayılıyordu;
  // broker saati GMT+2/+3 olan dosyalarda tüm işlem saatleri kayıyordu.) WwTime yoksa yerel saat.
  function wallDate(y, mo, d, H, Mi, S) {
    if (global.WwTime && typeof global.WwTime.importWallTimeToIso === 'function') {
      return new Date(global.WwTime.importWallTimeToIso(y, mo, d, H, Mi, S || 0));
    }
    return new Date(y, mo - 1, d, H, Mi, S || 0);
  }

  // "7:24:01 PM" gibi 12 saatlik değerlerde AM/PM'i saate uygular (eskiden PM yok sayılıyordu: 19:24 yerine 07:24)
  function applyMeridiem(hour, trailing) {
    var mm = /\b(AM|PM)\b/i.exec(trailing || '');
    if (!mm) return hour;
    var isPm = mm[1].toUpperCase() === 'PM';
    if (isPm && hour < 12) return hour + 12;
    if (!isPm && hour === 12) return 0;
    return hour;
  }

  // Excel seri tarihi: tam gün ise sadece-tarih (UTC gece yarısı), saat kısmı varsa duvar saati
  function excelSerialToWallDate(serial) {
    var d = excelSerialToDate(serial);
    if (Math.abs(serial - Math.round(serial)) < 1e-9) return d;
    return wallDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
  }

  function parseDate(raw) {
    if (raw === null || raw === undefined || raw === '') return null;

    // Excel serial date
    if (typeof raw === 'number') {
      if (raw > 20000 && raw < 80000) return excelSerialToWallDate(raw);
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
      if (num > 20000 && num < 80000) return excelSerialToWallDate(num);
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
      // Saat dilimi yoksa: dosyadaki saatlerin saat dilimi ayarına göre yorumla (WwTime importTz)
      return wallDate(+m[1], +m[2], +m[3], applyMeridiem(+m[4], m[7]), +m[5], +(m[6] || 0));
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
      // Saat dilimi yok: içe aktarma saat dilimi ayarına göre yorumla
      return wallDate(+m[3], mo1, d1, applyMeridiem(+m[4], m[7]), +m[5], +(m[6] || 0));
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
      // Saat dilimi yok: içe aktarma saat dilimi ayarına göre yorumla
      return wallDate(+m[3], mo2, d2, applyMeridiem(+m[4], m[6]), +m[5], 0);
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
    if (!isNaN(native.getTime())) {
      // Saat dilimi belirtilmemiş metinlerde tarayıcının yerel saatine güvenme: bileşenleri duvar saati say
      var hasZone = /(?:Z|UTC|GMT|[+-]\d{2}:?\d{2})\s*$/i.test(s);
      if (!hasZone) {
        if (s.indexOf(':') < 0) return new Date(Date.UTC(native.getFullYear(), native.getMonth(), native.getDate()));
        return wallDate(native.getFullYear(), native.getMonth() + 1, native.getDate(), native.getHours(), native.getMinutes(), native.getSeconds());
      }
      return native;
    }

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
  var FIELD_ORDER = ['symbol', 'direction', 'date', 'entry', 'exit', 'lot', 'pnl', 'gross_pnl', 'commission', 'swap', 'sl', 'tp', 'fee', 'comment', 'ticket'];

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
      'totalpnl', 'kapatmakz', 'closedpl', 'closedpnl', 'net', 'netdollar', 'kz', 'kar',
      'realizedprofit', 'realizedpl', 'netprofit', 'profit', 'pnl',
      'gewinn', 'nettogewinn', 'ganancia', 'beneficio', 'lucro', 'ganho',
      'прибыль', 'чистаяприбыль', 'toplamkz', 'totalprofit'
    ],
    gross_pnl: [
      'positionpnl', 'grosspnl', 'gross', 'brutkz', 'brut', 'brutkar', 'brutpnl'
    ],
    commission: [
      'commission', 'komisyon', 'fee', 'ucret', 'gebuhr', 'comision', 'taxa', 'комиссия'
    ],
    swap: [
      'swap', 'rollover', 'gecelikmaliyet', 'faiz', 'tasimamaliyeti'
    ],
    sl: ['sl', 'stoploss', 'zarardurdur', 'verlustbegrenzung', 'стоплосс'],
    tp: ['tp', 'takeprofit', 'karal', 'gewinnmitnahme', 'тейкпрофит'],
    fee: ['fee', 'commission', 'komisyon', 'ucret', 'gebuhr', 'comision', 'taxa', 'комиссия'],
    comment: ['comment', 'yorum', 'aciklama', 'not', 'notes', 'memo', 'description'],
    ticket: ['positionid', 'ticket', 'position', 'deal', 'orderid', 'orderticket', 'bilet']
  };

  var INSTRUMENT_MULTIPLIERS = { forex: 100000, gold: 100, index: 10, crypto: 1, other: 1 };

  var FIAT_CODES = 'EUR|USD|GBP|JPY|CHF|CAD|AUD|NZD|TRY|ZAR|MXN|SEK|NOK|PLN|SGD|HKD|CNH|CZK|HUF|DKK|THB|ILS|RUB|CNY';
  var FOREX_PAIR_RE = new RegExp('^(' + FIAT_CODES + ')(' + FIAT_CODES + ')(?![A-Z]{4,})');
  var CRYPTO_BASE_RE = /^(XBT|BTC|ETH|SOL|ADA|XRP|DOGE|BNB|LTC|TRX|MATIC|AVAX|DOT|LINK|SHIB|NEAR|FTM)/;
  var CRYPTO_QUOTE_RE = /(USDT|USDC|BUSD)$/;

  // Sıra önemli: forex çifti (USDCAD, USDTRY...) kripto "USDC"/"USDT" alt-dizisiyle
  // karışmasın diye forex ÖNCE, kripto ise başa/sona sabitlenmiş eşleşmeyle kontrol edilir.
  function guessInstrument(symbol) {
    if (!symbol) return 'other';
    var s = String(symbol).toUpperCase().trim();
    var letters = s.replace(/[^A-Z]/g, '');
    if (/(XAU|GOLD|XAG|SILVER|XPT|PLATINUM|XPD)/.test(s)) return 'gold';
    if (FOREX_PAIR_RE.test(letters)) return 'forex';
    if (CRYPTO_BASE_RE.test(letters) || CRYPTO_QUOTE_RE.test(letters)) return 'crypto';
    if (/(US30|NAS|NAS100|SPX|SP500|DAX|UK100|JP225|USTEC|GER40|GER30|FRA40|DE40|DE30|DJ30|WS30|US100|US500|NIKKEI|FTSE)/.test(s)) return 'index';
    if (letters.length === 6) return 'forex';
    return 'other';
  }

  function getMultiplier(symbol) {
    var inst = guessInstrument(symbol);
    return INSTRUMENT_MULTIPLIERS[inst] || 1;
  }

  global.BrokerDictionary = {
    normalizeHeader: normalizeHeader,
    normalizeValue: normalizeValue,
    levenshtein: levenshtein,
    parseNumber: parseNumber,
    detectDecimalSeparator: detectDecimalSeparator,
    parseDate: parseDate,
    normalizeDirection: normalizeDirection,
    guessInstrument: guessInstrument,
    getMultiplier: getMultiplier,
    INSTRUMENT_MULTIPLIERS: INSTRUMENT_MULTIPLIERS,
    FIELD_ORDER: FIELD_ORDER,
    FIELD_CANDIDATES: FIELD_CANDIDATES,
    EXCEL_EPOCH: EXCEL_EPOCH
  };
})(typeof window !== 'undefined' ? window : this);