/**
 * parser-v2.js
 * ---------------------------------------------------------------------------
 * Multi-broker CSV/XLSX trade-history parser. Load order:
 *   <script src="broker-dictionary.js"></script>
 *   <script src="broker-detector.js"></script>
 *   <script src="fill-pairing.js"></script>
 *   <script src="parser-v2.js"></script>
 *
 * Usage (CSV text):
 *   var result = ParserV2.parse(csvText, { defaultSymbol: 'BTCUSDT' });
 *
 * Usage (XLSX via SheetJS, already in the project):
 *   var ws = workbook.Sheets[workbook.SheetNames[0]];
 *   var rows2d = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
 *   var result = ParserV2.parse(rows2d);
 *
 * result shape:
 *   {
 *     rows: [{ symbol, direction, date, entry, exit, lot, pnl, sl, tp, fee,
 *              partial, warnings: [...] }, ...],
 *     errors: [string, ...],           // skipped/broken rows, with reasons
 *     warnings: [string, ...],         // mapping-quality / fallback notices
 *     detected: 'mt4'|'xtb'|...|'generic'|'manual',
 *     confidence: 0..1,
 *     needsManualMapping: boolean,
 *     missingFields: [string,...]|undefined,   // present when needsManualMapping
 *     headers: [string,...]|undefined,         // present when needsManualMapping
 *     suggestedMapping: {field:index}|undefined,
 *     headerFingerprint: string
 *   }
 *
 * When needsManualMapping is true, show the user `headers` and let them pick
 * a column index per field, then call:
 *   ParserV2.parse(input, { manualMapping: { symbol: 0, direction: 2, ... } })
 * ParserV2.saveManualMapping(result.headerFingerprint, manualMapping) caches
 * the choice so the same broker format is never asked twice.
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';
  var Dict = global.BrokerDictionary;
  var Detector = global.BrokerDetector;
  var Pairing = global.FillPairing;

  var SCORE_THRESHOLD = 40;
  var LOW_CONFIDENCE_THRESHOLD = 70;
  var STORAGE_PREFIX = 'parserV2.manualMapping.';

  // =========================================================================
  // Input normalization: CSV text or a 2D array (SheetJS sheet_to_json
  // header:1 output) both become a plain 2D array of raw cell values.
  // =========================================================================
  function detectDelimiter(line) {
    var candidates = [',', ';', '\t'];
    var best = ',', bestCount = -1;
    candidates.forEach(function (d) {
      // crude but effective: count occurrences outside quoted spans
      var count = 0, inQuotes = false;
      for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (ch === '"') inQuotes = !inQuotes;
        else if (ch === d && !inQuotes) count++;
      }
      if (count > bestCount) { bestCount = count; best = d; }
    });
    return best;
  }

  function splitCsvLine(line, delim) {
    var out = [];
    var cur = '';
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = false;
        } else cur += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === delim) { out.push(cur); cur = ''; }
        else cur += ch;
      }
    }
    out.push(cur);
    return out.map(function (s) { return s.trim(); });
  }

  function toRows2D(input) {
    if (Array.isArray(input)) return input;
    var text = String(input || '').replace(/^\uFEFF/, '');
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
    if (lines.length === 0) return [];
    var delim = detectDelimiter(lines[0]);
    return lines.map(function (l) { return splitCsvLine(l, delim); });
  }

  // =========================================================================
  // Layer 2: robust, scored, bidirectional-substring + fuzzy header matching
  // with positional resolution for duplicate columns (e.g. MT4's two
  // "Price" headers), used whenever broker-detector has no explicitMap.
  // =========================================================================
  function scoreMatch(headerNorm, candidateNorm) {
    if (!headerNorm || !candidateNorm) return 0;
    if (headerNorm === candidateNorm) return 100;
    if (headerNorm.indexOf(candidateNorm) >= 0) return 85;          // header contains candidate
    if (headerNorm.length >= 3 && candidateNorm.indexOf(headerNorm) >= 0) return 70; // candidate contains header
    if (Math.min(headerNorm.length, candidateNorm.length) >= 4) {
      var dist = Dict.levenshtein(headerNorm, candidateNorm);
      if (dist <= 2) return 50;
    }
    return 0;
  }

  function bestMatchForHeader(headerNorm, candidateList) {
    var best = { score: 0, rank: -1 };
    for (var r = 0; r < candidateList.length; r++) {
      var s = scoreMatch(headerNorm, Dict.normalizeHeader(candidateList[r]));
      if (s > best.score) best = { score: s, rank: r };
    }
    return best;
  }

  function findRawCloseKeywordIndex(rawHeaders, indices) {
    var closeWords = ['close', 'kapan', 'kapat', 'cierre', 'schluss', 'закрыт', 'fechamento'];
    for (var i = 0; i < indices.length; i++) {
      var raw = String(rawHeaders[indices[i]]).toLowerCase();
      for (var w = 0; w < closeWords.length; w++) {
        if (raw.indexOf(closeWords[w]) >= 0) return indices[i];
      }
    }
    return indices[indices.length - 1]; // fallback: last occurrence (close usually listed after open)
  }

  function matchHeaders(rawHeaders) {
    var normHeaders = rawHeaders.map(Dict.normalizeHeader);
    var warnings = [];
    var usedHeaders = {};

    // group identical normalized headers to detect duplicate-column cases
    var dupGroups = {};
    normHeaders.forEach(function (h, i) {
      if (!h) return;
      dupGroups[h] = dupGroups[h] || [];
      dupGroups[h].push(i);
    });

    // score matrix: matrix[field][headerIndex] = {score, rank}
    var matrix = {};
    Dict.FIELD_ORDER.forEach(function (field) {
      matrix[field] = normHeaders.map(function (h) {
        var m = bestMatchForHeader(h, Dict.FIELD_CANDIDATES[field]);
        // SL/TP'de "aday başlığı içeriyor" (70) eşleşmesi tehlikeli: "Profit" ⊂ "takeprofit", "Loss" ⊂ "stoploss".
        // XTB'nin brüt "Profit" sütunu take profit'e yazılıyordu. SL/TP yalnızca açık başlıkla eşleşir.
        if ((field === 'sl' || field === 'tp') && m.score === 70) return { score: 0, rank: -1 };
        return m;
      });
    });

    var mapping = {};

    // --- Special case: duplicate generic "price"-like column, shared by
    // entry & exit. Only kicks in when the SAME duplicate group is the top
    // candidate for both fields (i.e. no more specific header distinguished
    // them, e.g. plain "Price","Price" as in raw MT4/MT5 exports).
    var entryTop = topCandidates(matrix.entry, normHeaders.length)[0];
    var exitTop = topCandidates(matrix.exit, normHeaders.length)[0];
    if (entryTop && exitTop && entryTop.idx !== exitTop.idx) {
      var eGroup = dupGroups[normHeaders[entryTop.idx]];
      var xGroup = dupGroups[normHeaders[exitTop.idx]];
      if (eGroup && eGroup.length > 1 && eGroup === xGroup) {
        mapping.entry = eGroup[0];
        mapping.exit = eGroup[1];
        usedHeaders[eGroup[0]] = true;
        usedHeaders[eGroup[1]] = true;
      }
    } else if (entryTop && exitTop && entryTop.idx === exitTop.idx) {
      var group = dupGroups[normHeaders[entryTop.idx]];
      if (group && group.length > 1) {
        mapping.entry = group[0];
        mapping.exit = group[1];
        usedHeaders[group[0]] = true;
        usedHeaders[group[1]] = true;
      }
    }

    // --- Special case: duplicate "time"-like columns for `date` -- prefer
    // the one whose raw header text hints at "close".
    var dateTop = topCandidates(matrix.date, normHeaders.length)[0];
    if (dateTop && !mapping.date) {
      var dGroup = dupGroups[normHeaders[dateTop.idx]];
      if (dGroup && dGroup.length > 1) {
        var chosen = findRawCloseKeywordIndex(rawHeaders, dGroup);
        mapping.date = chosen;
        usedHeaders[chosen] = true;
      }
    }

    // --- Main assignment for everything not already resolved above.
    // IMPORTANT: this is a GLOBAL sort across (field, header) pairs, not a
    // per-field-in-order greedy loop. A per-field loop would let a weak
    // fuzzy match (e.g. score 50) on an early field in FIELD_ORDER steal a
    // header away from a much stronger exact match (score 100) that a
    // later field needed on that same header - e.g. TradingView's bare
    // "Price" header fuzzy-matching a "symbol" candidate before the
    // "entry" field (which has an exact match on "Price") ever gets a
    // turn. Sorting all candidate pairs globally by score first fixes
    // that starvation: exact matches are claimed before weak ones no
    // matter which field they belong to.
    var pending = Dict.FIELD_ORDER.filter(function (f) { return !mapping.hasOwnProperty(f); });
    var allCandidates = [];
    pending.forEach(function (field) {
      for (var idx = 0; idx < normHeaders.length; idx++) {
        var m = matrix[field][idx];
        if (m.score >= SCORE_THRESHOLD) allCandidates.push({ field: field, idx: idx, score: m.score, rank: m.rank });
      }
    });
    allCandidates.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.rank !== b.rank) return a.rank - b.rank;
      var fa = Dict.FIELD_ORDER.indexOf(a.field), fb = Dict.FIELD_ORDER.indexOf(b.field);
      if (fa !== fb) return fa - fb;
      return a.idx - b.idx;
    });

    var fieldAssigned = {};
    allCandidates.forEach(function (c) {
      if (fieldAssigned[c.field] || usedHeaders[c.idx]) return;
      mapping[c.field] = c.idx;
      usedHeaders[c.idx] = true;
      fieldAssigned[c.field] = true;
      if (c.score < LOW_CONFIDENCE_THRESHOLD) {
        warnings.push('"' + c.field + '" alanı düşük güvenle eşleşti (header: "' + rawHeaders[c.idx] + '", skor: ' + c.score + ') — sonucu kontrol edin.');
      }
    });
    pending.forEach(function (field) {
      if (!mapping.hasOwnProperty(field)) mapping[field] = null;
    });

    return { mapping: mapping, warnings: warnings };
  }

  function topCandidates(fieldScores, len) {
    var list = [];
    for (var i = 0; i < len; i++) {
      if (fieldScores[i].score > 0) list.push({ idx: i, score: fieldScores[i].score, rank: fieldScores[i].rank });
    }
    list.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.idx - b.idx;
    });
    return list;
  }

  // =========================================================================
  // TradingView-specific side derivation: "Entry Long" / "Exit Short" style
  // compound Type values don't map to BUY/SELL directly - the ACTION
  // (buy/sell order) depends on both the entry/exit half and the long/short
  // half of the string.
  // =========================================================================
  function parseTradingViewSide(raw) {
    var n = Dict.normalizeValue(raw);
    var isEntry = n.indexOf('entry') >= 0;
    var isExit = n.indexOf('exit') >= 0;
    var isLong = n.indexOf('long') >= 0;
    var isShort = n.indexOf('short') >= 0;
    if (isEntry && isLong) return 'BUY';
    if (isEntry && isShort) return 'SELL';
    if (isExit && isLong) return 'SELL';
    if (isExit && isShort) return 'BUY';
    return null;
  }

  // =========================================================================
  // localStorage cache for manual mappings (Layer 5), keyed by an exact
  // header fingerprint so the same broker/version is never asked twice.
  // =========================================================================
  function headerFingerprint(rawHeaders) {
    return rawHeaders.map(Dict.normalizeHeader).join('|');
  }
  function saveManualMapping(fingerprint, mapping) {
    try {
      global.localStorage.setItem(STORAGE_PREFIX + fingerprint, JSON.stringify(mapping));
      return true;
    } catch (e) { return false; }
  }
  function loadManualMapping(fingerprint) {
    try {
      var raw = global.localStorage.getItem(STORAGE_PREFIX + fingerprint);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function clearManualMapping(fingerprint) {
    try { global.localStorage.removeItem(STORAGE_PREFIX + fingerprint); return true; } catch (e) { return false; }
  }

  // =========================================================================
  // Row builders
  // =========================================================================
  function buildClosedTradeRows(rawHeaders, dataRows, mapping) {
    var rows = [];
    var errors = [];
    var get = function (row, field) {
      var idx = mapping[field];
      return idx == null || idx < 0 ? undefined : row[idx];
    };
    // Dosya düzeyinde ondalık ayracı ("1,08521" vs "1.08521"): hücre başına tahmin yerine
    var numOpts = { decimal: Dict.detectDecimalSeparator(dataRows) };
    var parseNum = function (v) { return Dict.parseNumber(v, numOpts); };

    dataRows.forEach(function (row, i) {
      var lineNo = i + 2; // +1 for header row, +1 for 1-based display
      var rowWarnings = [];

      var symbol = get(row, 'symbol');
      symbol = symbol == null ? null : String(symbol).trim();

      var directionRaw = get(row, 'direction');
      var direction = Dict.normalizeDirection(directionRaw);
      if (direction === null) {
        direction = 'LONG';
        rowWarnings.push('yön tespit edilemedi ("' + directionRaw + '"), varsayılan LONG kullanıldı — kontrol edin');
      }

      var entry = parseNum(get(row, 'entry'));
      var exit = parseNum(get(row, 'exit'));
      var lot = parseNum(get(row, 'lot'));
      var pnl = parseNum(get(row, 'pnl'));
      var gross_pnl = parseNum(get(row, 'gross_pnl'));
      var sl = parseNum(get(row, 'sl'));
      var tp = parseNum(get(row, 'tp'));
      var fee = parseNum(get(row, 'fee'));
      var commission = parseNum(get(row, 'commission'));
      var swap = parseNum(get(row, 'swap'));
      var comment = get(row, 'comment');
      var ticket = get(row, 'ticket');
      var date = Dict.parseDate(get(row, 'date'));

      if (commission === null && fee !== null) commission = fee;
      if (commission !== null) commission = Math.abs(commission);
      if (swap === null) swap = 0;

      if (!symbol || entry === null || exit === null) {
        errors.push('Satır ' + lineNo + ': sembol/giriş/çıkış fiyatı eksik ya da geçersiz, atlandı.');
        return;
      }

      if (pnl === null && lot !== null) {
        var mult = (Dict && typeof Dict.getMultiplier === 'function') ? Dict.getMultiplier(symbol) : 1;
        var sign = direction === 'SHORT' ? -1 : 1;
        var calcGross = (exit - entry) * lot * sign * mult;
        if (gross_pnl === null) gross_pnl = calcGross;
        pnl = calcGross - (commission || 0) + (swap || 0);
        rowWarnings.push('pnl kolonu bulunamadı, entry/exit/lot üzerinden hesaplandı');
      }

      rows.push({
        symbol: symbol, direction: direction, date: date,
        entry: entry, exit: exit, lot: lot, pnl: pnl, gross_pnl: gross_pnl,
        commission: commission || 0, swap: swap || 0, fee: fee,
        sl: sl, tp: tp,
        comment: comment ? String(comment).trim() : null,
        ticket: ticket ? String(ticket).trim() : null,
        partial: false, warnings: rowWarnings
      });
    });

    return { rows: rows, errors: errors };
  }

  function buildFillsAndPair(rawHeaders, dataRows, mapping, brokerKey, options) {
    var fills = [];
    var errors = [];
    var get = function (row, field) {
      var idx = mapping[field];
      return idx == null || idx < 0 ? undefined : row[idx];
    };
    var numOpts = { decimal: Dict.detectDecimalSeparator(dataRows) };
    var parseNum = function (v) { return Dict.parseNumber(v, numOpts); };

    dataRows.forEach(function (row, i) {
      var lineNo = i + 2;
      var symbol = get(row, 'symbol');
      symbol = symbol == null ? null : String(symbol).trim();
      if (!symbol) symbol = options.defaultSymbol || null;

      var price = parseNum(get(row, 'entry'));
      var qty = parseNum(get(row, 'lot'));
      var date = Dict.parseDate(get(row, 'date'));
      var fee = parseNum(get(row, 'fee')) || 0;

      var directionRaw = get(row, 'direction');
      var side = brokerKey === 'tradingview'
        ? parseTradingViewSide(directionRaw)
        : Dict.normalizeDirection(directionRaw);

      if (!symbol || price === null || qty === null || side === null) {
        errors.push('Satır ' + lineNo + ': eksik/geçersiz fill verisi, atlandı.');
        return;
      }
      fills.push({ symbol: symbol, side: side, price: price, qty: qty, date: date, fee: fee, rowIndex: lineNo });
    });

    // Eşleştirme FIFO ve sıraya bağlı: en yeniden eskiye dizili dosyalar (Binance/Bybit/TradingView çoğu zaman öyle)
    // satışı alıştan önce görüp işlemi ters yönde (short) kurardı. Her fill'in tarihi okunabiliyorsa eskiden yeniye
    // sıralanır (aynı anda olanlar dosyadaki sırasını korur). Tarihsiz fill varsa dosya sırasına dokunulmaz.
    var fillTime = function (f) {
      var d = f.date;
      var t = d instanceof Date ? d.getTime() : (d == null ? NaN : Date.parse(String(d).replace(' ', 'T')));
      return isNaN(t) ? null : t;
    };
    if (fills.length > 1 && fills.every(function (f) { return fillTime(f) !== null; })) {
      fills = fills
        .map(function (f, i) { return { f: f, t: fillTime(f), i: i }; })
        .sort(function (a, b) { return a.t - b.t || a.i - b.i; })
        .map(function (x) { return x.f; });
    }
    var paired = Pairing.pairFills(fills);
    var rows = paired.trades.map(function (t) {
      return {
        symbol: t.symbol, direction: t.direction, date: t.date, dateOpen: t.dateOpen,
        entry: t.entry, exit: t.exit, lot: t.lot, pnl: t.pnl, sl: null, tp: null, fee: null,
        partial: t.partial, warnings: []
      };
    });

    return { rows: rows, errors: errors, pairingWarnings: paired.warnings, openPositions: paired.openPositions };
  }

  // =========================================================================
  // Başlık satırı bulma (rapor biçimli dosyalar)
  // =========================================================================
  var HEADER_SCAN_ROWS = 60;

  function filledCount(row) {
    return (row || []).filter(function (c) { return c !== null && c !== undefined && String(c).trim() !== ''; }).length;
  }

  function rowAsHeaders(row) {
    return (row || []).map(function (h) { return h == null ? '' : String(h); });
  }

  // Bilinen bir broker imzası (MT4/MT5/XTB/OANDA/...) ya da en az sembol + giriş fiyatı eşleyen genel başlık mı?
  function headerQuality(row) {
    if (filledCount(row) < 4) return 0;
    var headers = rowAsHeaders(row);
    var d = Detector.detect(headers);
    if (d && d.broker !== 'generic') return 2 + d.confidence;
    var m = matchHeaders(headers).mapping || {};
    return (m.symbol !== undefined && m.symbol !== null && m.entry !== undefined && m.entry !== null) ? 1 : 0;
  }

  // 1. satır zaten iyi bir başlıksa ona dokunulmaz (normal CSV'ler eskisi gibi). Değilse ilk HEADER_SCAN_ROWS satırda
  // en iyi başlık satırı aranır; hiçbiri uygun değilse 0 kalır (eski davranış, hata mesajları aynı).
  function findHeaderRow(rows2d) {
    var firstQ = headerQuality(rows2d[0]);
    if (firstQ >= 2) return 0;
    var best = 0, bestQ = firstQ;
    var limit = Math.min(rows2d.length - 1, HEADER_SCAN_ROWS);
    for (var i = 1; i < limit; i++) {
      var q = headerQuality(rows2d[i]);
      if (q > bestQ) { best = i; bestQ = q; }
    }
    if (bestQ > 0) return best;
    // Hiçbir satır başlık gibi değil (tanınmayan format → sütun eşleme ekranı). 1. satır neredeyse boş bir rapor
    // başlığıysa ("Hesap özeti") eşleme ekranı boş sütunlar göstermesin: tablonun genişliğine yakın ilk satır başlık sayılır.
    var widest = 0;
    for (var w = 0; w < limit; w++) widest = Math.max(widest, filledCount(rows2d[w]));
    if (filledCount(rows2d[0]) * 2 >= widest) return 0;
    for (var k = 1; k < limit; k++) {
      if (filledCount(rows2d[k]) >= Math.max(2, Math.ceil(widest * 0.8))) return k;
    }
    return 0;
  }

  // Başlıktan sonraki satırlar. Başlık 1. satır değilse (rapor) bölüm, tek hücreli bir ara başlıkta
  // ("Orders", "Deals", "Open Trades:", "Summary:") ya da aynı başlığın tekrarında biter.
  function sectionRows(rows2d, headerIdx) {
    var rest = rows2d.slice(headerIdx + 1);
    if (headerIdx === 0) return rest;
    var headerKey = rowAsHeaders(rows2d[headerIdx]).join('|').toLowerCase();
    var out = [];
    for (var i = 0; i < rest.length; i++) {
      var n = filledCount(rest[i]);
      if (n === 0) continue;
      if (out.length && (n === 1 || rowAsHeaders(rest[i]).join('|').toLowerCase() === headerKey)) break;
      out.push(rest[i]);
    }
    return out;
  }

  // =========================================================================
  // Tradovate (vadeli işlemler): Performance raporu ve Orders dışa aktarımı
  // =========================================================================
  // 1,00 fiyat puanının kontrat başına USD değeri (CME/CBOT/NYMEX/COMEX spesifikasyonları).
  // Tahıl ve hayvancılık fiyatları sent cinsinden listelenir; değerler buna göredir.
  var FUTURES_POINT_VALUES = {
    ES: 50, MES: 5, NQ: 20, MNQ: 2, YM: 5, MYM: 0.5, RTY: 50, M2K: 5, EMD: 100, NKD: 5,
    CL: 1000, MCL: 100, QM: 500, NG: 10000, QG: 2500, RB: 42000, HO: 42000,
    GC: 100, MGC: 10, QO: 50, SI: 5000, SIL: 1000, QI: 2500, HG: 25000, MHG: 2500, PL: 50, PA: 100,
    ZB: 1000, UB: 1000, ZN: 1000, TN: 1000, ZF: 1000, ZT: 2000,
    '6E': 125000, M6E: 12500, E7: 62500, '6B': 62500, M6B: 6250, '6J': 12500000, '6A': 100000, M6A: 10000,
    '6C': 100000, '6S': 125000, '6N': 100000, '6M': 500000,
    ZC: 50, ZS: 50, ZW: 50, KE: 50, ZL: 600, ZM: 100, HE: 400, LE: 400, GF: 500,
    BTC: 5, MBT: 0.1, ETH: 50, MET: 0.1
  };

  // "MNQZ5" / "MNQZ25" / "6EH6" / "M2KZ5" -> kök "MNQ" / "6E" / "M2K" (ay kodu + yıl atılır)
  function futuresRoot(contract) {
    var s = String(contract == null ? '' : contract).trim().toUpperCase().replace(/^[@\/]/, '');
    var m = s.match(/^([A-Z0-9]+?)([FGHJKMNQUVXZ])(\d{1,2})$/);
    return m ? m[1] : s;
  }

  // Tradovate dışa aktarımları ABD biçimli: "05/29/2024 09:31:12" (ay/gün/yıl). Genel parseDate gün/ay varsaydığı
  // için 11/05 Mayıs olurdu; burada ay/gün okunur (ay > 12 ise ters çevrilir). Saat dilimi ayarı parseDate'te uygulanır.
  function parseTradovateDate(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    // TradingView'in Strategy Performance dışa aktarımı Tradovate Performance ile AYNI sütun adlarını kullanır ama zamanı
    // Unix epoch (ms) yazar (TradeTally dokümanındaki örnek). Epoch mutlak bir an: saat dilimi ayarı uygulanmaz.
    var epoch = typeof raw === 'number' ? raw : (/^\d{9,14}$/.test(String(raw).trim()) ? +String(raw).trim() : NaN);
    if (epoch >= 1e11 && epoch < 1e14) return new Date(epoch);          // ms: 1973-5138
    if (epoch >= 1e9 && epoch < 1e11) return new Date(epoch * 1000);    // sn: 2001-5138
    if (typeof raw === 'number' || raw instanceof Date) return Dict.parseDate(raw);
    var s = String(raw).trim();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(AM|PM)?)?$/i);
    if (!m) return Dict.parseDate(s);
    var mo = +m[1], d = +m[2];
    if (mo > 12 && d <= 12) { var t = mo; mo = d; d = t; }
    if (m[4] === undefined) return new Date(Date.UTC(+m[3], mo - 1, d));
    var h = +m[4];
    if (m[7]) {
      var pm = m[7].toUpperCase() === 'PM';
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
    }
    return Dict.parseDate(m[3] + '-' + pad(mo) + '-' + pad(d) + ' ' + pad(h) + ':' + m[5] + ':' + pad(+(m[6] || 0)));
  }

  // "$1,234.50" / "$(13.75)" / "-13.75" -> sayı. Tradovate her zaman ABD sayı biçimi kullanır.
  function parseTradovateMoney(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return isFinite(raw) ? raw : null;
    var s = String(raw).trim();
    if (s === '') return null;
    var negative = /\(.*\)/.test(s) || /^-|^\$-/.test(s);
    var n = parseFloat(s.replace(/[^0-9.]/g, ''));
    if (isNaN(n)) return null;
    return negative ? -n : n;
  }

  // Fiyat: ondalık ya da tahvil kesirli biçimi ("118'16" = 118 + 16/32, "110'165" = 110 + 16.5/32)
  function parseTradovatePrice(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return isFinite(raw) ? raw : null;
    var s = String(raw).trim();
    var m = s.match(/^(-?\d+)'(\d{2})(\d)?$/);
    if (m) {
      var eighth = { '0': 0, '2': 0.25, '5': 0.5, '7': 0.75 }[m[3] || '0'] || 0;
      return +m[1] + (+m[2] + eighth) / 32;
    }
    return parseTradovateMoney(s);
  }

  function round(n, dp) { return n == null || !isFinite(n) ? n : Number(n.toFixed(dp)); }

  function tvHeaderIndex(rawHeaders) {
    var n = rawHeaders.map(Dict.normalizeHeader);
    return function () {
      for (var a = 0; a < arguments.length; a++) {
        var i = n.indexOf(arguments[a]);
        if (i >= 0) return i;
      }
      return -1;
    };
  }

  function tvTime(d) { return d instanceof Date && !isNaN(d.getTime()) ? d.getTime() : null; }

  function tvRow(root, contract, direction, entry, exit, lot, pnl, dateOpen, date, ticket) {
    var pv = FUTURES_POINT_VALUES[root];
    return {
      symbol: root, direction: direction, date: date, dateOpen: dateOpen,
      entry: round(entry, 6), exit: round(exit, 6), lot: lot, pnl: round(pnl, 2), gross_pnl: round(pnl, 2),
      commission: 0, swap: 0, fee: null, sl: null, tp: null,
      comment: 'Tradovate ' + contract,
      ticket: ticket != null && ticket !== '' ? String(ticket) : null,
      instrument: 'other', multiplier: pv || null,
      partial: false, warnings: []
    };
  }

  // Performance: her satır bir alış-satış çifti (qty, buyPrice, sellPrice, pnl, boughtTimestamp, soldTimestamp).
  // Aynı dolumu paylaşan ve aynı yöndeki satırlar (kademeli giriş/çıkış) tek işlemde birleştirilir.
  function buildTradovatePerformance(rawHeaders, dataRows) {
    var col = tvHeaderIndex(rawHeaders);
    var C = {
      symbol: col('symbol', 'contract'), qty: col('qty', 'quantity'),
      buyPrice: col('buyprice'), sellPrice: col('sellprice'), pnl: col('pnl'),
      bought: col('boughttimestamp'), sold: col('soldtimestamp'),
      buyFill: col('buyfillid'), sellFill: col('sellfillid')
    };
    var cell = function (row, k) { return C[k] < 0 ? undefined : row[C[k]]; };
    var errors = [];
    var items = [];

    dataRows.forEach(function (row, i) {
      var lineNo = i + 2;
      var contract = String(cell(row, 'symbol') == null ? '' : cell(row, 'symbol')).trim();
      var qty = parseTradovateMoney(cell(row, 'qty'));
      var buy = parseTradovatePrice(cell(row, 'buyPrice'));
      var sell = parseTradovatePrice(cell(row, 'sellPrice'));
      var bought = parseTradovateDate(cell(row, 'bought'));
      var sold = parseTradovateDate(cell(row, 'sold'));
      if (!contract || !qty || qty <= 0 || buy === null || sell === null) {
        errors.push('Satır ' + lineNo + ': sembol/miktar/fiyat eksik ya da geçersiz, atlandı.');
        return;
      }
      var buyFill = cell(row, 'buyFill'), sellFill = cell(row, 'sellFill');
      var tb = tvTime(bought), ts = tvTime(sold);
      var isLong;
      if (tb !== null && ts !== null && tb !== ts) isLong = tb < ts;
      else if (buyFill && sellFill && !isNaN(+buyFill) && !isNaN(+sellFill)) isLong = +buyFill <= +sellFill;
      else isLong = true;

      var root = futuresRoot(contract);
      var pnl = parseTradovateMoney(cell(row, 'pnl'));
      if (pnl === null && FUTURES_POINT_VALUES[root]) pnl = (sell - buy) * qty * FUTURES_POINT_VALUES[root];
      items.push({
        contract: contract, root: root, qty: qty, pnl: pnl, lineNo: lineNo,
        direction: isLong ? 'LONG' : 'SHORT',
        entry: isLong ? buy : sell, exit: isLong ? sell : buy,
        opened: isLong ? bought : sold, closed: isLong ? sold : bought,
        entryFill: isLong ? buyFill : sellFill, exitFill: isLong ? sellFill : buyFill
      });
    });

    // Birleşim kümeleri: anahtar = yön + kontrat + dolum ID. Yön anahtarın parçası olduğu için pozisyonun
    // tersine döndüğü dolum (uzunu kapatıp kısa açan satış) iki işlemi birleştirmez.
    var parent = items.map(function (_, i) { return i; });
    var find = function (i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    var owner = {};
    items.forEach(function (it, i) {
      [['e', it.entryFill], ['x', it.exitFill]].forEach(function (f) {
        if (f[1] === undefined || f[1] === null || String(f[1]).trim() === '') return;
        var key = it.direction + '|' + it.contract + '|' + f[0] + '|' + String(f[1]).trim();
        if (owner[key] === undefined) owner[key] = i;
        else parent[find(i)] = find(owner[key]);
      });
    });

    var groups = {};
    var order = [];
    items.forEach(function (it, i) {
      var r = find(i);
      if (!groups[r]) { groups[r] = []; order.push(r); }
      groups[r].push(it);
    });

    var rows = order.map(function (r) {
      var g = groups[r];
      var first = g[0];
      var qty = 0, entryN = 0, exitN = 0, pnl = 0, pnlKnown = true, opened = null, closed = null;
      g.forEach(function (it) {
        qty += it.qty; entryN += it.entry * it.qty; exitN += it.exit * it.qty;
        if (it.pnl === null) pnlKnown = false; else pnl += it.pnl;
        if (it.opened && (!opened || it.opened < opened)) opened = it.opened;
        if (it.closed && (!closed || it.closed > closed)) closed = it.closed;
      });
      return tvRow(first.root, first.contract, first.direction, entryN / qty, exitN / qty, qty,
        pnlKnown ? pnl : null, opened, closed, first.entryFill);
    });
    rows.sort(function (a, b) { return (tvTime(a.date) || 0) - (tvTime(b.date) || 0); });
    return { rows: rows, errors: errors };
  }

  // Orders: emir başına bir satır. Dolan emirler zaman sırasıyla hesap + kontrat bazında izlenir; pozisyon
  // sıfırdan açılıp tekrar sıfıra dönene kadar olan dolumlar tek işlemdir. Ters dönen dolum bölünür.
  function buildTradovateOrders(rawHeaders, dataRows) {
    var col = tvHeaderIndex(rawHeaders);
    var C = {
      side: col('bs', 'side', 'action'), contract: col('contract', 'symbol'),
      price: col('avgfillprice', 'avgprice', 'price'), qty: col('filledqty', 'filled'),
      time: col('filltime', 'timestamp', 'date'), status: col('status'),
      account: col('account'), orderId: col('orderid')
    };
    var cell = function (row, k) { return C[k] < 0 ? undefined : row[C[k]]; };
    var errors = [];
    var warnings = [];
    var fills = [];
    var accounts = {};

    dataRows.forEach(function (row, i) {
      var lineNo = i + 2;
      var qty = parseTradovateMoney(cell(row, 'qty'));
      if (!qty || qty <= 0) return; // dolmamış/iptal emir: işlem değil, sessizce geçilir
      var status = Dict.normalizeValue(cell(row, 'status'));
      if (status.indexOf('reject') >= 0) return;
      var side = Dict.normalizeDirection(cell(row, 'side'));
      var contract = String(cell(row, 'contract') == null ? '' : cell(row, 'contract')).trim();
      var price = parseTradovatePrice(cell(row, 'price'));
      var date = parseTradovateDate(cell(row, 'time'));
      if (!side || !contract || price === null || !price) {
        errors.push('Satır ' + lineNo + ': yön/kontrat/fiyat eksik ya da geçersiz, atlandı.');
        return;
      }
      var account = String(cell(row, 'account') == null ? '' : cell(row, 'account')).trim();
      if (account) accounts[account] = true;
      fills.push({ side: side, contract: contract, price: price, qty: qty, date: date, account: account,
        orderId: cell(row, 'orderId'), i: fills.length });
    });

    if (fills.every(function (f) { return tvTime(f.date) !== null; })) {
      fills.sort(function (a, b) { return tvTime(a.date) - tvTime(b.date) || a.i - b.i; });
    }

    var books = {};
    var rows = [];
    var openPositions = [];
    var unknownRoots = {};

    function close(b) {
      var t = b.trade;
      var pv = FUTURES_POINT_VALUES[t.root];
      var sign = t.direction === 'LONG' ? 1 : -1;
      var pnl = pv ? sign * (t.exitN - t.entryN) * pv : null;
      if (!pv) unknownRoots[t.root] = true;
      rows.push(tvRow(t.root, t.contract, t.direction, t.entryN / t.qty, t.exitN / t.qty, t.qty, pnl,
        t.opened, t.closed, t.ticket));
      b.trade = null;
    }

    fills.forEach(function (f) {
      var key = f.account + '|' + f.contract;
      var b = books[key] || (books[key] = { pos: 0, trade: null });
      var signed = f.side === 'LONG' ? f.qty : -f.qty;
      var remaining = signed;
      while (Math.abs(remaining) > 1e-9) {
        if (b.pos === 0) {
          b.trade = { root: futuresRoot(f.contract), contract: f.contract, direction: remaining > 0 ? 'LONG' : 'SHORT',
            qty: 0, entryN: 0, exitN: 0, opened: f.date, closed: null, ticket: f.orderId };
        }
        var sameSide = (b.pos >= 0 && remaining > 0 && b.trade.direction === 'LONG') ||
                       (b.pos <= 0 && remaining < 0 && b.trade.direction === 'SHORT');
        if (sameSide) {
          var add = Math.abs(remaining);
          b.trade.qty += add; b.trade.entryN += add * f.price;
          b.pos += remaining; remaining = 0;
        } else {
          var closeQty = Math.min(Math.abs(remaining), Math.abs(b.pos));
          b.trade.exitN += closeQty * f.price;
          b.trade.closed = f.date;
          b.pos += remaining > 0 ? closeQty : -closeQty;
          remaining += remaining > 0 ? -closeQty : closeQty;
          if (Math.abs(b.pos) < 1e-9) { b.pos = 0; close(b); }
        }
      }
    });

    Object.keys(books).forEach(function (k) {
      var b = books[k];
      if (b.trade && b.pos !== 0) {
        openPositions.push({ symbol: b.trade.root, direction: b.trade.direction, entry: b.trade.entryN / b.trade.qty, lot: Math.abs(b.pos), date: b.trade.opened });
      }
    });
    if (openPositions.length) {
      warnings.push(openPositions.length + ' pozisyon dosyanın sonunda hâlâ açık (kapanış emri yok); bunlar içe aktarılmadı.');
    }
    var unknown = Object.keys(unknownRoots);
    if (unknown.length) {
      warnings.push(unknown.join(', ') + ' için kontrat çarpanı bilinmiyor; K/Z puan cinsinden hesaplandı, işlemi düzenleyip kontrol edin.');
    }
    var accountCount = Object.keys(accounts).length;
    if (accountCount > 1) {
      warnings.push('Dosyada ' + accountCount + ' Tradovate hesabı var; hepsi seçili deftere eklenecek. Hesapları ayırmak için Tradovate\'ten hesap başına dışa aktarın.');
    }
    rows.sort(function (a, b) { return (tvTime(a.date) || 0) - (tvTime(b.date) || 0); });
    return { rows: rows, errors: errors, pairingWarnings: warnings, openPositions: openPositions };
  }

  // =========================================================================
  // Public entry point
  // =========================================================================
  function parse(input, options) {
    options = options || {};
    var rows2d = toRows2D(input);
    if (!rows2d || rows2d.length < 2) {
      return { rows: [], errors: ['Dosya boş ya da sadece başlık satırı var.'], warnings: [], detected: null, confidence: 0, needsManualMapping: false };
    }

    // Rapor biçimli dosyalarda (MT4 Detailed Statement, MT5 geçmiş raporu, XTB Excel...) başlık 1. satırda değil:
    // üstte hesap bilgisi / rapor başlığı satırları var. Başlık satırı aranır, rapor bölümü bitince durulur.
    // Elle/AI eşlemede başlık satırı, eşleme ekranını açan sonucun headerRow'u (rapor biçimli dosyada 0 olmayabilir)
    var headerIdx = options.manualMapping
      ? (options.headerRow >= 0 && options.headerRow < rows2d.length - 1 ? options.headerRow : 0)
      : findHeaderRow(rows2d);
    var rawHeaders = rows2d[headerIdx].map(function (h) { return h == null ? '' : String(h); });
    var dataRows = sectionRows(rows2d, headerIdx).filter(function (r) {
      return r.some(function (c) { return c !== null && c !== undefined && String(c).trim() !== ''; });
    });
    var fingerprint = headerFingerprint(rawHeaders);

    var warnings = [];
    var mapping, detectedBroker, confidence, isFillBased;

    if (options.manualMapping) {
      mapping = options.manualMapping;
      detectedBroker = 'manual';
      confidence = 1;
      isFillBased = !!options.isFillBased;
    } else {
      var cached = loadManualMapping(fingerprint);
      if (cached) {
        mapping = cached.mapping;
        detectedBroker = 'manual-cached';
        confidence = 1;
        isFillBased = !!cached.isFillBased;
        warnings.push('Daha önce bu broker formatı için kaydedilmiş manuel eşleme kullanıldı.');
      } else {
        var detection = Detector.detect(rawHeaders);
        detectedBroker = detection.broker;
        confidence = detection.confidence;
        isFillBased = detection.isFillBased;
        if (detectedBroker === 'tradovate' || detectedBroker === 'tradovate-orders') {
          var tv = detectedBroker === 'tradovate'
            ? buildTradovatePerformance(rawHeaders, dataRows)
            : buildTradovateOrders(rawHeaders, dataRows);
          return {
            rows: tv.rows,
            errors: tv.errors,
            warnings: (tv.pairingWarnings || []).concat(['Tradovate raporlarında komisyon yok: K/Z komisyon hariçtir.']),
            detected: detectedBroker,
            confidence: confidence,
            needsManualMapping: false,
            isFillBased: isFillBased,
            openPositions: tv.openPositions || [],
            headerFingerprint: fingerprint
          };
        }
        if (detection.explicitMap) {
          mapping = detection.explicitMap;
          warnings.push('Broker "' + detection.broker + '" olarak tanındı (güven: ' + Math.round(confidence * 100) + '%), bilinen sabit kolon haritası kullanıldı.');
        } else {
          var matched = matchHeaders(rawHeaders);
          mapping = matched.mapping;
          warnings = warnings.concat(matched.warnings);
          if (detectedBroker !== 'generic') {
            warnings.push('Broker "' + detectedBroker + '" olarak tanındı (güven: ' + Math.round(confidence * 100) + '%), esnek başlık eşleştirme kullanıldı.');
          }
        }
      }
    }

    var requiredForMode = isFillBased
      ? ['direction', 'entry', 'lot']
      : ['symbol', 'direction', 'entry', 'exit'];
    // In fill-based mode a missing symbol column is only acceptable when
    // the caller supplied options.defaultSymbol (common for single-symbol
    // exports like TradingView's Strategy Tester, which has no symbol column).
    if (isFillBased && mapping.symbol == null && !options.defaultSymbol) {
      requiredForMode = requiredForMode.concat(['symbol']);
    }

    var missingRequired = requiredForMode.filter(function (f) { return mapping[f] == null || mapping[f] < 0; });

    if (missingRequired.length > 0) {
      return {
        rows: [], errors: [], warnings: warnings,
        detected: detectedBroker, confidence: confidence,
        needsManualMapping: true,
        missingFields: missingRequired,
        headers: rawHeaders,
        suggestedMapping: mapping,
        isFillBased: isFillBased,
        headerFingerprint: fingerprint,
        headerRow: headerIdx,
        // eşleme ekranı ve AI eşleme için ilk birkaç veri satırı (metin olarak)
        sampleRows: dataRows.slice(0, 5).map(function (r) { return r.map(function (c) { return c == null ? '' : String(c); }); })
      };
    }

    var built;
    if (isFillBased) {
      built = buildFillsAndPair(rawHeaders, dataRows, mapping, detectedBroker, options);
      warnings = warnings.concat(built.pairingWarnings);
    } else {
      built = buildClosedTradeRows(rawHeaders, dataRows, mapping);
    }

    return {
      rows: built.rows,
      errors: built.errors,
      warnings: warnings,
      detected: detectedBroker,
      confidence: confidence,
      needsManualMapping: false,
      isFillBased: isFillBased,
      openPositions: built.openPositions || [],
      headerFingerprint: fingerprint
    };
  }

  global.ParserV2 = {
    parse: parse,
    headerFingerprint: headerFingerprint,
    saveManualMapping: saveManualMapping,
    loadManualMapping: loadManualMapping,
    clearManualMapping: clearManualMapping,
    // exposed for testing / advanced use
    _internal: {
      matchHeaders: matchHeaders, scoreMatch: scoreMatch, parseTradingViewSide: parseTradingViewSide,
      futuresRoot: futuresRoot, parseTradovateDate: parseTradovateDate, parseTradovatePrice: parseTradovatePrice,
      FUTURES_POINT_VALUES: FUTURES_POINT_VALUES
    }
  };
})(typeof window !== 'undefined' ? window : this);