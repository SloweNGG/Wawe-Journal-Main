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
        return bestMatchForHeader(h, Dict.FIELD_CANDIDATES[field]);
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

      var entry = Dict.parseNumber(get(row, 'entry'));
      var exit = Dict.parseNumber(get(row, 'exit'));
      var lot = Dict.parseNumber(get(row, 'lot'));
      var pnl = Dict.parseNumber(get(row, 'pnl'));
      var gross_pnl = Dict.parseNumber(get(row, 'gross_pnl'));
      var sl = Dict.parseNumber(get(row, 'sl'));
      var tp = Dict.parseNumber(get(row, 'tp'));
      var fee = Dict.parseNumber(get(row, 'fee'));
      var commission = Dict.parseNumber(get(row, 'commission'));
      var swap = Dict.parseNumber(get(row, 'swap'));
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

    dataRows.forEach(function (row, i) {
      var lineNo = i + 2;
      var symbol = get(row, 'symbol');
      symbol = symbol == null ? null : String(symbol).trim();
      if (!symbol) symbol = options.defaultSymbol || null;

      var price = Dict.parseNumber(get(row, 'entry'));
      var qty = Dict.parseNumber(get(row, 'lot'));
      var date = Dict.parseDate(get(row, 'date'));
      var fee = Dict.parseNumber(get(row, 'fee')) || 0;

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
  // Public entry point
  // =========================================================================
  function parse(input, options) {
    options = options || {};
    var rows2d = toRows2D(input);
    if (!rows2d || rows2d.length < 2) {
      return { rows: [], errors: ['Dosya boş ya da sadece başlık satırı var.'], warnings: [], detected: null, confidence: 0, needsManualMapping: false };
    }

    var rawHeaders = rows2d[0].map(function (h) { return h == null ? '' : String(h); });
    var dataRows = rows2d.slice(1).filter(function (r) {
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
        headerFingerprint: fingerprint
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
    _internal: { matchHeaders: matchHeaders, scoreMatch: scoreMatch, parseTradingViewSide: parseTradingViewSide }
  };
})(typeof window !== 'undefined' ? window : this);