// ============================================================
// QUICK ADD MODAL - İŞLEM EKLEME
// ⭐ Emoji temizlendi, tüm ikonlar SVG (Lucide tarzı)
// ⭐ Custom Date Picker - dark/light tema uyumlu
// ⭐ i18n entegrasyonu tam
// ⭐ Broker CSV parser desteği (Türkçe brokerlar, MT4/5, cTrader, Binance, Bybit, Coinbase)
// ⭐ Excel (.xlsx/.xls) ve HTML (.htm/.html) dosya desteği
// ⭐ Drag & Drop ile dosya bırakma
// ⭐ INLINE CSV parser (build sorunundan bağımsız)
// ⭐ FIX: _qaInlineParse idx.direction içindeki 'islemacilisyoru' typo'su
//    'islemacilisyonu' olarak düzeltildi.
// ⭐ FIX: showBrokerPreview'a P&L sütunu eklendi.
// ⭐ FIX: fileToCsvText artık sheet_to_csv yerine sheet_to_json(raw:true)
//    kullanıyor. Böylece xlsx'teki "Net $" gibi para birimi başlıklı
//    sütunların ham sayı değerleri (locale yeniden biçimlendirmesi
//    devreye girmeden) parser'a ulaşır.
// ⭐ FIX: executeCsvImport içindeki PnL seçimi sıkılaştırıldı:
//    boş string, $ / ₺ / € sembolü, sonda boşluk gibi durumları da
//    güvenle temizleyip number'a çevirir. Broker'ın gerçek Net $
//    değeri varsa onu kullanır, yoksa calcPnL fallback'i çalışır.
// ============================================================

// ============================================================
// ⭐ INLINE CSV PARSER
// ============================================================

function _qaNormHeader(h) {
  return String(h || '')
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');
}

function _qaSplitLine(line, delim) {
  var out = [], cur = '', q = false;
  for (var i = 0; i < line.length; i++) {
    var c = line[i], n = line[i + 1];
    if (c === '"') {
      if (q && n === '"') { cur += '"'; i++; }
      else { q = !q; }
    } else if (c === delim && !q) {
      out.push(cur.trim()); cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

function _qaDetectDelim(line) {
  var a = (line.match(/,/g) || []).length;
  var b = (line.match(/;/g) || []).length;
  var c = (line.match(/\t/g) || []).length;
  if (c >= a && c >= b) return '\t';
  if (b > a) return ';';
  return ',';
}

function _qaDate(raw) {
  if (!raw) return new Date().toISOString();
  raw = String(raw).trim();

  // Tercih edilen yol: BrokerDictionary.parseDate (içe aktarma saat dilimi ayarı, AM/PM, MM/DD-DD/MM takası).
  // Tam gün (UTC gece yarısı) sonuçlar sadece-tarih olarak ('YYYY-MM-DD') döner.
  if (typeof BrokerDictionary !== 'undefined' && typeof BrokerDictionary.parseDate === 'function') {
    var pd = BrokerDictionary.parseDate(raw);
    if (pd && !isNaN(pd.getTime())) {
      return (pd.getTime() % 86400000 === 0) ? pd.toISOString().slice(0, 10) : pd.toISOString();
    }
  }

  var hasOffset = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(raw);

  var mIsoTime = raw.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (mIsoTime) {
    if (hasOffset) {
      var parsedOffset = new Date(raw);
      if (!isNaN(parsedOffset.getTime())) return parsedOffset.toISOString();
    }
    var localDate = new Date(+mIsoTime[1], +mIsoTime[2] - 1, +mIsoTime[3], +mIsoTime[4], +mIsoTime[5], +(mIsoTime[6] || 0));
    if (!isNaN(localDate.getTime())) return localDate.toISOString();
  }

  var mDmyTime = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (mDmyTime) {
    var d1 = +mDmyTime[1], mo1 = +mDmyTime[2];
    if (mo1 > 12 && d1 <= 12) { var tmp = d1; d1 = mo1; mo1 = tmp; }
    if (hasOffset) {
      var isoStr = mDmyTime[3] + '-' + String(mo1).padStart(2, '0') + '-' + String(d1).padStart(2, '0') + 'T' +
                   mDmyTime[4].padStart(2, '0') + ':' + mDmyTime[5].padStart(2, '0') + ':' +
                   (mDmyTime[6] || '00').padStart(2, '0') + (raw.match(/(?:Z|[+-]\d{2}(?::?\d{2})?)$/i)?.[0] || '');
      var parsedDmyOffset = new Date(isoStr);
      if (!isNaN(parsedDmyOffset.getTime())) return parsedDmyOffset.toISOString();
    }
    var localDmy = new Date(+mDmyTime[3], mo1 - 1, d1, +mDmyTime[4], +mDmyTime[5], +(mDmyTime[6] || 0));
    if (!isNaN(localDmy.getTime())) return localDmy.toISOString();
  }

  var m1 = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m1) return m1[3] + '-' + m1[2] + '-' + m1[1];
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  var m2 = raw.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  if (m2) return m2[1] + '-' + m2[2] + '-' + m2[3];
  var m3 = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (m3) return m3[3] + '-' + m3[2] + '-' + m3[1];
  var d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString();
  return new Date().toISOString();
}

function _qaDir(raw) {
  if (!raw) return 'LONG';
  var v = String(raw).toUpperCase().trim();
  if (v === 'BUY' || v === 'LONG' || v === 'B' || v === 'L' || v === 'AL' || v === 'ALIŞ' || v === 'ALIS' || v === 'ALIM') return 'LONG';
  if (v === 'SELL' || v === 'SHORT' || v === 'S' || v === 'SH' || v === 'SAT' || v === 'SATIŞ' || v === 'SATIS' || v === 'SATIM') return 'SHORT';
  return 'LONG';
}

// Sıkı yön eşlemesi: tanınmayan değer (ör. "XYZ") LONG/SHORT'a SESSİZCE düşmez, null döner.
function _qaStrictDir(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  if (typeof BrokerDictionary !== 'undefined' && typeof BrokerDictionary.normalizeDirection === 'function') {
    return BrokerDictionary.normalizeDirection(raw);
  }
  var v = String(raw).toUpperCase().trim();
  if (['BUY', 'LONG', 'B', 'L', 'AL', 'ALIŞ', 'ALIS', 'ALIM'].indexOf(v) >= 0) return 'LONG';
  if (['SELL', 'SHORT', 'S', 'SH', 'SAT', 'SATIŞ', 'SATIS', 'SATIM'].indexOf(v) >= 0) return 'SHORT';
  return null;
}

function _qaSym(raw) {
  if (!raw) return '';
  return String(raw).toUpperCase().replace(/[\/\-_ ]/g, '').replace(/[^A-Z0-9]/g, '');
}

function _qaNum(v) {
  if (v === null || v === undefined) return NaN;
  var s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  return parseFloat(s);
}

function _qaInlineParse(text, broker) {
  var lines = text.split(/\r?\n/).filter(function(l) { return l.trim(); });
  if (lines.length < 2) return { rows: [], errors: ['Dosya boş'], detected: 'unknown' };

  var delim = _qaDetectDelim(lines[0]);
  var headers = _qaSplitLine(lines[0], delim).map(_qaNormHeader);

  function fi() {
    for (var a = 0; a < arguments.length; a++) {
      var t = _qaNormHeader(arguments[a]);
      for (var b = 0; b < headers.length; b++) {
        if (headers[b] === t || headers[b].indexOf(t) >= 0) return b;
      }
    }
    return -1;
  }

  var idx = {
    symbol:     fi('sembol', 'symbol', 'enstruman', 'parite', 'item'),
    direction:  fi('islemacilisyonu', 'islemyonu', 'yon', 'direction', 'side', 'type'),
    date:       fi('kapatmazamani', 'kapaniszamani', 'closedatetime', 'closetime', 'tarih', 'date', 'time', 'opentime'),
    entry:      fi('girisfiyati', 'openprice', 'entryprice', 'entry', 'giris', 'price'),
    exit:       fi('kapanisfiyati', 'closeprice', 'cikisfiyati', 'exitprice', 'exit', 'cikis'),
    lot:        fi('kapanismiktari', 'miktar', 'lot', 'size', 'volume', 'qty', 'quantity'),
    pnl:        fi('totalpnl', 'net', 'net$', 'kz', 'kar', 'profit', 'pnl'),
    gross_pnl:  fi('positionpnl', 'grosspnl', 'gross', 'brut'),
    commission: fi('commission', 'komisyon', 'fee', 'ucret'),
    swap:       fi('swap', 'rollover', 'faiz'),
    comment:    fi('comment', 'yorum', 'aciklama', 'not', 'notes'),
    ticket:     fi('positionid', 'ticket', 'position', 'orderid'),
    sl:         fi('sl', 'stoploss', 'zarardurdur'),
    tp:         fi('tp', 'takeprofit', 'karal')
  };

  if (idx.symbol < 0) return { rows: [], errors: ['Sembol kolonu bulunamadı'], detected: 'unknown' };
  if (idx.entry < 0)  return { rows: [], errors: ['Giriş fiyatı kolonu bulunamadı'], detected: 'unknown' };

  var rows = [], errors = [];

  for (var i = 1; i < lines.length; i++) {
    var v = _qaSplitLine(lines[i], delim);
    if (v.length < 3) continue;

    var sym = _qaSym(v[idx.symbol]);
    if (!sym) { errors.push('Satır ' + (i+1) + ': Sembol yok'); continue; }

    var lot = idx.lot >= 0 ? _qaNum(v[idx.lot]) : NaN;
    if (isNaN(lot) || lot <= 0) { errors.push('Satır ' + (i+1) + ': Lot geçersiz'); continue; }

    var entry = _qaNum(v[idx.entry]);
    if (isNaN(entry) || entry === 0) { errors.push('Satır ' + (i+1) + ': Giriş geçersiz'); continue; }

    var exit = idx.exit >= 0 ? _qaNum(v[idx.exit]) : null;
    var sl = idx.sl >= 0 ? _qaNum(v[idx.sl]) : null;
    var tp = idx.tp >= 0 ? _qaNum(v[idx.tp]) : null;

    var comm = idx.commission >= 0 ? _qaNum(v[idx.commission]) : 0;
    if (isNaN(comm)) comm = 0;
    comm = Math.abs(comm);

    var sw = idx.swap >= 0 ? _qaNum(v[idx.swap]) : 0;
    if (isNaN(sw)) sw = 0;

    var grossPnl = idx.gross_pnl >= 0 ? _qaNum(v[idx.gross_pnl]) : null;
    if (isNaN(grossPnl)) grossPnl = null;

    var pnl = null;
    if (idx.pnl >= 0) {
      var pp = _qaNum(v[idx.pnl]);
      if (!isNaN(pp)) pnl = pp;
    }

    var cmt = idx.comment >= 0 && v[idx.comment] ? String(v[idx.comment]).trim() : '';
    var tkt = idx.ticket >= 0 && v[idx.ticket] ? String(v[idx.ticket]).trim() : '';

    rows.push({
      symbol: sym,
      direction: _qaDir(v[idx.direction]),
      lot: lot,
      entry_price: entry,
      exit_price: (exit === null || isNaN(exit)) ? null : exit,
      stop_loss: (sl === null || isNaN(sl)) ? null : sl,
      take_profit: (tp === null || isNaN(tp)) ? null : tp,
      trade_date: _qaDate(v[idx.date]),
      notes: cmt || 'CSV Import',
      pnl: pnl,
      gross_pnl: grossPnl,
      commission: comm,
      swap: sw,
      ticket: tkt || null
    });
  }

  return { rows: rows, errors: errors, detected: broker || 'generic' };
}

function ensureCsvParsers() {
  if (typeof window.parseCsvByBroker !== 'function') {
    window.parseCsvByBroker = function(text, broker) {
      return _qaInlineParse(text, broker);
    };
    console.log('✅ Inline CSV parser hazır');
  }
  return Promise.resolve();
}

// ============================================================
// TEMA BAŞLATMA / TEMA DEĞİŞİMİNİ DİNLE → quick-add-boot.js
// (perf parça 2a: bu dosya artık ilk açılışta yükleniyor; sayfa açılışında çalışması gereken
// tema kodu her zaman yüklenen quick-add-boot.js'e taşındı)
// ============================================================

// ============================================================
// DATE PICKER STİLLERİ - HEAD'E INJECT EDİLİR
// ============================================================

(function injectDatePickerStyles() {
  if (document.getElementById('qa-date-picker-styles')) return;
  var style = document.createElement('style');
  style.id = 'qa-date-picker-styles';
  style.textContent = `
.qa-date-input-wrap { position: relative; }
.qa-date-input-wrap input { width: 100%; padding-right: 36px !important; cursor: pointer; }
.qa-date-input-icon { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: var(--qa-muted, #6b6b80); pointer-events: none; display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; }
.qa-date-input-icon svg { width: 16px; height: 16px; stroke: currentColor; fill: none; }
.qa-date-picker-overlay { position: fixed; inset: 0; z-index: 9999; background: transparent; display: none; }
.qa-date-picker-overlay.open { display: block; }
.qa-date-picker { position: fixed; z-index: 10000; background: var(--qa-surface, #111118); border: 1px solid var(--qa-border-strong, rgba(255,255,255,0.12)); border-radius: 14px; padding: 14px; box-shadow: 0 20px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(var(--ac-b1-rgb),0.08); width: 300px; font-family: var(--qa-font-body); color: var(--qa-text, #e8e8f0); opacity: 0; visibility: hidden; transform: translateY(-6px) scale(0.97); transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), visibility 0.18s; pointer-events: none; user-select: none; -webkit-user-select: none; }
.qa-date-picker.open { opacity: 1; visibility: visible; transform: translateY(0) scale(1); pointer-events: auto; }
.qa-date-picker-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--qa-border, rgba(255,255,255,0.06)); }
.qa-dp-nav { width: 32px; height: 32px; flex-shrink: 0; border-radius: 8px; background: transparent; border: 1px solid var(--qa-border, rgba(255,255,255,0.06)); color: var(--qa-muted, #6b6b80); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s ease; padding: 0; }
.qa-dp-nav svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 2; }
.qa-dp-nav:hover { border-color: var(--qa-accent, var(--ac-b1)); color: var(--qa-accent, var(--ac-b1)); background: rgba(var(--ac-b1-rgb),0.08); }
.qa-dp-nav:active { transform: scale(0.94); }
.qa-dp-title { flex: 1; background: transparent; border: none; color: var(--qa-text, #e8e8f0); font-family: var(--font); font-weight: 600; font-size: 13px; padding: 6px 10px; border-radius: 8px; cursor: default; text-align: center; }
.qa-date-picker-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; margin-bottom: 4px; }
.qa-dp-weekday { text-align: center; font-size: 10px; font-weight: 600; color: var(--qa-muted, #6b6b80); padding: 6px 0; text-transform: uppercase; letter-spacing: 0.05em; }
.qa-date-picker-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.qa-dp-day { aspect-ratio: 1 / 1; min-height: 34px; border-radius: 8px; background: transparent; border: 1px solid transparent; color: var(--qa-text, #e8e8f0); font-family: inherit; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.12s ease; display: flex; align-items: center; justify-content: center; padding: 0; }
.qa-dp-day:hover { background: rgba(var(--ac-b1-rgb),0.12); color: var(--qa-accent-light, var(--ac-l1)); }
.qa-dp-day:active { transform: scale(0.94); }
.qa-dp-day.other-month { color: var(--qa-muted, #6b6b80); opacity: 0.4; }
.qa-dp-day.today { border-color: var(--qa-accent, var(--ac-b1)); color: var(--qa-accent, var(--ac-b1)); font-weight: 700; }
.qa-dp-day.selected { background: linear-gradient(135deg, var(--ac), var(--ac-l1)); color: #fff; border-color: transparent; box-shadow: 0 4px 12px rgba(var(--ac-rgb),0.4); font-weight: 700; }
.qa-dp-day.selected:hover { color: #fff; transform: scale(1.04); }
.qa-date-picker-footer { display: flex; gap: 6px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--qa-border, rgba(255,255,255,0.06)); }
.qa-dp-footer-btn { flex: 1; padding: 7px 10px; border-radius: 8px; background: transparent; border: 1px solid var(--qa-border, rgba(255,255,255,0.06)); color: var(--qa-muted, #6b6b80); font-family: inherit; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.15s ease; }
.qa-dp-footer-btn:hover { border-color: var(--qa-accent, var(--ac-b1)); color: var(--qa-accent, var(--ac-b1)); background: rgba(var(--ac-b1-rgb),0.06); }
.qa-dp-footer-btn:active { transform: scale(0.96); }
body.light-theme .qa-date-picker { background: #ffffff; border-color: rgba(0,0,0,0.08); box-shadow: 0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(var(--ac-b1-rgb),0.06); color: #1a1a2e; }
body.light-theme .qa-date-picker-header { border-bottom-color: rgba(0,0,0,0.06); }
body.light-theme .qa-dp-nav { border-color: rgba(0,0,0,0.08); color: #6b6b80; }
body.light-theme .qa-dp-nav:hover { border-color: var(--ac-b1); color: var(--ac-b1); background: rgba(var(--ac-b1-rgb),0.06); }
body.light-theme .qa-dp-title { color: #1a1a2e; }
body.light-theme .qa-dp-weekday { color: #9999aa; }
body.light-theme .qa-dp-day { color: #1a1a2e; }
body.light-theme .qa-dp-day:hover { background: rgba(var(--ac-b1-rgb),0.1); color: var(--ac-b1); }
body.light-theme .qa-dp-day.other-month { color: #bbbbcc; }
body.light-theme .qa-dp-day.today { border-color: var(--ac-b1); color: var(--ac-b1); }
body.light-theme .qa-dp-day.selected { background: linear-gradient(135deg, var(--ac-b1), var(--ac-b3)); color: #fff; border-color: transparent; box-shadow: 0 4px 12px rgba(var(--ac-b1-rgb),0.35); }
body.light-theme .qa-date-picker-footer { border-top-color: rgba(0,0,0,0.06); }
body.light-theme .qa-dp-footer-btn { border-color: rgba(0,0,0,0.08); color: #6b6b80; }
body.light-theme .qa-dp-footer-btn:hover { border-color: var(--ac-b1); color: var(--ac-b1); background: rgba(var(--ac-b1-rgb),0.06); }
@media (max-width: 480px) {
  .qa-date-picker { width: calc(100vw - 32px); max-width: 320px; }
  .qa-dp-day { min-height: 40px; font-size: 13px; }
}
`;
  document.head.appendChild(style);
})();

// ============================================================
// SHEETJS LAZY LOADER (Excel desteği)
// ============================================================

let _xlsxLoading = null;
function loadXLSX() {
  if (typeof XLSX !== 'undefined') return Promise.resolve();
  if (_xlsxLoading) return _xlsxLoading;
  _xlsxLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return _xlsxLoading;
}

async function fileToCsvText(file) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    await loadXLSX();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false, cellNF: false, cellText: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];

    // ⭐ FIX: sheet_to_csv yerine sheet_to_json kullan — böylece "Net $"
    // gibi para birimi başlıklı sütunlardaki değerler ham sayı olarak gelir,
    // locale yeniden biçimlendirmesi devreye girmez.
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });

    if (!rows || rows.length === 0) return '';

    function esc(v) {
      if (v === null || v === undefined) return '';
      var s = String(v);
      if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }

    return rows.map(function(row) {
      return (row || []).map(esc).join(',');
    }).join('\n');
  }

  if (lowerName.endsWith('.htm') || lowerName.endsWith('.html')) {
    const text = await file.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const tables = doc.querySelectorAll('table');
    if (!tables.length) return text;

    let bestTable = tables[0];
    let bestRowCount = 0;
    tables.forEach(function(t) {
      const rc = t.querySelectorAll('tr').length;
      if (rc > bestRowCount) { bestRowCount = rc; bestTable = t; }
    });

    const rows = Array.from(bestTable.querySelectorAll('tr')).map(function(tr) {
      return Array.from(tr.querySelectorAll('th,td')).map(function(td) {
        const t = (td.textContent || '').trim().replace(/\s+/g, ' ');
        return '"' + t.replace(/"/g, '""') + '"';
      }).join(',');
    });
    return rows.join('\n');
  }

  return await file.text();
}

// ============================================================
// ANA MODÜL
// ============================================================

(function() {
  'use strict';

  function t(key, params) {
    try {
      if (typeof quickI18n !== 'undefined' && typeof quickI18n.t === 'function') {
        return quickI18n.t(key, params);
      }
    } catch(e) {}
    return key;
  }

  const CHUNK_SIZE = 500;
  const MULTIPLIER_MAP = { forex: 100000, gold: 100, index: 10, crypto: 1, other: 1 };

  function guessInstrument(symbol) {
    if (typeof BrokerDictionary !== 'undefined' && typeof BrokerDictionary.guessInstrument === 'function') {
      return BrokerDictionary.guessInstrument(symbol);
    }
    const s = String(symbol || '').toUpperCase().trim();
    const letters = s.replace(/[^A-Z]/g, '');
    const FIAT = 'EUR|USD|GBP|JPY|CHF|CAD|AUD|NZD|TRY|ZAR|MXN|SEK|NOK|PLN|SGD|HKD|CNH|CZK|HUF|DKK|THB|ILS|RUB|CNY';
    // BrokerDictionary.guessInstrument ile aynı mantık: forex önce, kripto sabitlenmiş eşleşme
    if (/(XAU|GOLD|XAG|SILVER|XPT|PLATINUM|XPD)/.test(s)) return 'gold';
    if (new RegExp('^(' + FIAT + ')(' + FIAT + ')(?![A-Z]{4,})').test(letters)) return 'forex';
    if (/^(XBT|BTC|ETH|SOL|ADA|XRP|DOGE|BNB|LTC|TRX|MATIC|AVAX|DOT|LINK|SHIB|NEAR|FTM)/.test(letters) || /(USDT|USDC|BUSD)$/.test(letters)) return 'crypto';
    if (/(US30|NAS|NAS100|SPX|SP500|DAX|UK100|JP225|USTEC|GER40|GER30|FRA40|DE40|DE30|DJ30|WS30|US100|US500|NIKKEI|FTSE)/.test(s)) return 'index';
    if (letters.length === 6) return 'forex';
    return 'other';
  }

  // ⭐ YENİ: Broker'ın gerçek Net $ değerini (varsa) sıkıca okuyup number
  // döndürür. Boş string, null, undefined, $ / ₺ / € sembolleri, sonda
  // boşluk, Türkçe ondalık virgül gibi tüm durumları güvenle temizler.
  // Geçerli bir sayı yoksa null döner.
  function parseStoredPnl(raw) {
    if (raw === null || raw === undefined) return null;
    var s = String(raw).trim();
    if (s === '' || s === '-' || s === '—') return null;
    // Para birimi sembolleri ve boşlukları sil
    s = s.replace(/[$₺€£¥\s]/g, '');
    // Türkçe ondalık virgül → nokta
    s = s.replace(',', '.');
    var n = parseFloat(s);
    if (isNaN(n) || !isFinite(n)) return null;
    return n;
  }

  const ICONS = {
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    buy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 6"/><polyline points="15 6 21 6 21 12"/></svg>',
    sell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 7 9 13 13 9 21 18"/><polyline points="15 18 21 18 21 12"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    fileLarge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    spinner: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="animation:qaSpin 0.6s linear infinite;"><circle cx="12" cy="12" r="9" opacity="0.25"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" width="13" height="13"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
  };

  function badgeIcon(type) {
    const map = {
      loading: { icon: ICONS.spinner, color: 'var(--accent, #7c6dfa)' },
      success: { icon: ICONS.check, color: 'var(--green, #22c55e)' },
      error: { icon: ICONS.close, color: 'var(--red, #ef4444)' },
      warning: { icon: ICONS.alert, color: 'var(--red, #ef4444)' }
    };
    const m = map[type] || map.loading;
    return '<span style="display:inline-flex;color:' + m.color + ';">' + m.icon + '</span>';
  }

  function logTag(type) {
    if (type === 'warning') {
      return '<span style="color:var(--accent2,#9b8bfa);font-weight:600;">!</span>';
    }
    return '<span style="color:var(--red,#ef4444);font-weight:600;">×</span>';
  }

  function chunkArray(arr, size) {
    var chunks = [];
    for (var i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  // ============================================================
  // STATE
  // ============================================================
  let currentSide = 'BUY';
  let currentTab = 'price';
  let strategiesList = [];
  let isSubmitting = false;
  let csvFile = null;
  let isImporting = false;
  let currentInstrument = 'forex';
  let currentMultiplier = 100000;
  let csvPreviewData = null;

  let datePickerState = { isOpen: false, viewYear: 2026, viewMonth: 0, selectedDate: null };
  let datePickerTargetInput = null;

  function el(id) { return document.getElementById(id); }
  function qsa(selector) { return document.querySelectorAll(selector); }

  function checkGlobals() {
    const required = {
      'sb': typeof sb !== 'undefined',
      'requireAuth': typeof requireAuth === 'function',
      'calcPnL': typeof calcPnL === 'function',
      'calcRR': typeof calcRR === 'function',
      'formatCurrency': typeof formatCurrency === 'function',
      'showToast': typeof showToast === 'function'
    };
    const missing = Object.keys(required).filter(k => !required[k]);
    if (missing.length > 0) {
      wwLog.warn('Eksik global bağımlılıklar:', missing.join(', '));
      return false;
    }
    return true;
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ============================================================
  // DATE PICKER HELPERS
  // ============================================================

  function isoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  // "Bugün" (varsayılan işlem tarihi): Ayarlar > Görünüm > Saat ve Gün'deki saat dilimi ve gün başlangıcına
  // göre. (Eskiden cihaz saati veya UTC günü kullanılıyordu: UTC+3'te 00:00-03:00 arası dünün tarihi çıkıyordu.)
  function todayIso() {
    return (window.WwTime && typeof window.WwTime.todayKey === 'function') ? window.WwTime.todayKey() : isoDate(new Date());
  }

  function getLocale(lang) {
    return lang === 'tr' ? 'tr-TR' : lang === 'de' ? 'de-DE' : 'en-US';
  }

  function formatDateDisplay(iso, lang) {
    if (!iso) return '';
    try {
      const l = lang || (typeof quickI18n !== 'undefined' ? quickI18n.getCurrentLanguage() : 'tr');
      const d = new Date(iso + 'T00:00:00');
      if (isNaN(d.getTime())) return iso;
      return new Intl.DateTimeFormat(getLocale(l), { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
    } catch(e) { return iso; }
  }

  function getWeekdayNames(lang) {
    try {
      const ref = new Date(2024, 0, 1);
      const names = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(ref);
        d.setDate(ref.getDate() + i);
        names.push(new Intl.DateTimeFormat(getLocale(lang), { weekday: 'short' }).format(d));
      }
      return names;
    } catch(e) { return ['Mo','Tu','We','Th','Fr','Sa','Su']; }
  }

  function getMonthTitle(year, month, lang) {
    try {
      const l = lang || (typeof quickI18n !== 'undefined' ? quickI18n.getCurrentLanguage() : 'tr');
      const d = new Date(year, month, 1);
      const monthName = new Intl.DateTimeFormat(getLocale(l), { month: 'long' }).format(d);
      return monthName.charAt(0).toUpperCase() + monthName.slice(1) + ' ' + year;
    } catch(e) { return year + '-' + (month + 1); }
  }

  function renderDatePicker() {
    const grid = el('qa-dp-grid');
    const title = el('qa-dp-title');
    const weekdays = el('qa-dp-weekdays');
    if (!grid || !title || !weekdays) return;

    const lang = (typeof quickI18n !== 'undefined') ? quickI18n.getCurrentLanguage() : 'tr';
    const year = datePickerState.viewYear;
    const month = datePickerState.viewMonth;

    title.textContent = getMonthTitle(year, month, lang);

    const dayNames = getWeekdayNames(lang);
    weekdays.innerHTML = dayNames.map(n => '<div class="qa-dp-weekday">' + escapeHtml(n) + '</div>').join('');

    const firstOfMonth = new Date(year, month, 1);
    const firstDayOfWeek = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = isoDate(today);
    const selectedIso = datePickerState.selectedDate;

    const cells = [];
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      cells.push({ day, date: new Date(year, month - 1, day), otherMonth: true });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({ day, date: new Date(year, month, day), otherMonth: false });
    }
    const remaining = 42 - cells.length;
    for (let i = 1; i <= remaining; i++) {
      cells.push({ day: i, date: new Date(year, month + 1, i), otherMonth: true });
    }

    grid.innerHTML = cells.map(cell => {
      const iso = isoDate(cell.date);
      const isToday = iso === todayStr;
      const isSelected = iso === selectedIso;
      const classes = ['qa-dp-day'];
      if (cell.otherMonth) classes.push('other-month');
      if (isToday) classes.push('today');
      if (isSelected) classes.push('selected');
      return '<button type="button" class="' + classes.join(' ') + '" data-date="' + iso + '">' + cell.day + '</button>';
    }).join('');
  }

  function openDatePicker(input) {
    if (!input) return;
    datePickerTargetInput = input;

    let iso = input.getAttribute('data-iso') || '';
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      iso = todayIso();
    }

    let baseDate;
    try { baseDate = new Date(iso + 'T00:00:00'); } catch(e) { baseDate = new Date(); }
    if (isNaN(baseDate.getTime())) baseDate = new Date();

    datePickerState.viewYear = baseDate.getFullYear();
    datePickerState.viewMonth = baseDate.getMonth();
    datePickerState.selectedDate = iso;
    datePickerState.isOpen = true;

    renderDatePicker();

    const picker = el('qa-date-picker');
    const overlay = el('qa-date-picker-overlay');
    if (!picker) return;

    const rect = input.getBoundingClientRect();
    const pickerWidth = 300;
    const pickerHeight = 360;
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const margin = 8;

    let top = rect.bottom + margin;
    let left = rect.left;

    if (top + pickerHeight > viewportH - margin) {
      const above = rect.top - pickerHeight - margin;
      top = above >= margin ? above : Math.max(margin, viewportH - pickerHeight - margin);
    }
    if (left + pickerWidth > viewportW - margin) left = viewportW - pickerWidth - margin;
    if (left < margin) left = margin;

    picker.style.top = top + 'px';
    picker.style.left = left + 'px';
    picker.classList.add('open');
    if (overlay) overlay.classList.add('open');
  }

  function closeDatePicker() {
    const picker = el('qa-date-picker');
    const overlay = el('qa-date-picker-overlay');
    if (picker) picker.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    datePickerState.isOpen = false;
    datePickerTargetInput = null;
  }

  function selectDate(iso) {
    const input = datePickerTargetInput;
    if (input) {
      input.value = formatDateDisplay(iso);
      input.setAttribute('data-iso', iso);
    }
    datePickerState.selectedDate = iso;
    closeDatePicker();
  }

  function prevMonth() {
    datePickerState.viewMonth--;
    if (datePickerState.viewMonth < 0) { datePickerState.viewMonth = 11; datePickerState.viewYear--; }
    renderDatePicker();
  }

  function nextMonth() {
    datePickerState.viewMonth++;
    if (datePickerState.viewMonth > 11) { datePickerState.viewMonth = 0; datePickerState.viewYear++; }
    renderDatePicker();
  }

  // ============================================================
  // MODAL HTML
  // ============================================================

  function getModalHTML() {
    const today = todayIso();
    const todayDisplay = formatDateDisplay(today);

    return `
      <div class="quick-add-overlay" id="quick-add-overlay">
        <div class="quick-add-modal">

          <div class="quick-add-header">
            <h2 data-quick-i18n="quickmodal.title">İşlem Ekle</h2>
            <button class="close-btn" id="quick-add-close" aria-label="Close">${ICONS.close}</button>
          </div>

          <div class="quick-add-tabs" id="quick-tabs">
            <button class="quick-tab active" data-tab="price">${ICONS.edit}<span data-quick-i18n="quickmodal.tab_price">Fiyattan Hesapla</span></button>
            <button class="quick-tab" data-tab="csv">${ICONS.file}<span data-quick-i18n="quickmodal.tab_csv">CSV İçe Aktar</span></button>
            <button class="quick-tab" data-tab="bulk">${ICONS.list}<span data-quick-i18n="quickmodal.tab_bulk">Toplu Metin</span></button>
            <button class="quick-tab qa-tab-ai" data-tab="ai">${ICONS.sparkle}<span data-quick-i18n="quickmodal.tab_ai">AI ile Ekle</span></button>
          </div>

          <div class="quick-add-body">
            <div class="quick-add-error" id="quick-add-error">
              ${ICONS.alert}
              <span id="quick-add-error-text"></span>
            </div>

            <div class="quick-tab-content active" id="tab-price">
              <div class="qa-grid-layout">
                <!-- Sol Kolon: İşlem Temel Bilgileri -->
                <div class="qa-col-left">
                  <div class="quick-add-row qa-row-sym-side">
                    <div class="quick-add-field">
                      <label data-quick-i18n="quickmodal.symbol">Sembol *</label>
                      <div class="qa-sym-wrap">
                        <input type="text" id="price-symbol" placeholder="EURUSD" style="text-transform:uppercase;" autofocus
                               autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="qa-sym-list">
                        <div class="qa-sym-list" id="qa-sym-list" role="listbox" hidden></div>
                      </div>
                    </div>
                    <div class="quick-add-field">
                      <label data-quick-i18n="quickmodal.side">Yön *</label>
                      <div class="quick-add-side-toggle">
                        <button class="quick-add-side-btn active-buy" data-side="BUY" id="price-side-buy">${ICONS.buy}<span data-quick-i18n="quickmodal.buy">Alış</span></button>
                        <button class="quick-add-side-btn" data-side="SELL" id="price-side-sell">${ICONS.sell}<span data-quick-i18n="quickmodal.sell">Satış</span></button>
                      </div>
                    </div>
                  </div>

                  <div class="quick-add-field">
                    <label data-quick-i18n="quickmodal.instrument">Enstrüman *</label>
                    <div class="quick-add-instrument-grid">
                      <button class="quick-add-instrument-btn active" data-instrument="forex" data-multiplier="100000" data-quick-i18n="quickmodal.instrument_forex">Forex</button>
                      <button class="quick-add-instrument-btn" data-instrument="gold" data-multiplier="100" data-quick-i18n="quickmodal.instrument_gold">Altın</button>
                      <button class="quick-add-instrument-btn" data-instrument="index" data-multiplier="10" data-quick-i18n="quickmodal.instrument_index">Endeks</button>
                      <button class="quick-add-instrument-btn" data-instrument="crypto" data-multiplier="1" data-quick-i18n="quickmodal.instrument_crypto">Kripto</button>
                      <button class="quick-add-instrument-btn" data-instrument="other" data-multiplier="1" data-quick-i18n="quickmodal.instrument_other">Diğer</button>
                    </div>
                  </div>

                  <div class="quick-add-field" id="price-custom-multiplier-wrap" style="display:none;">
                    <label data-quick-i18n="quickmodal.custom_multiplier">Manuel Çarpan *</label>
                    <input type="text" inputmode="decimal" id="price-custom-multiplier" placeholder="1000">
                  </div>

                  <div class="quick-add-row">
                    <div class="quick-add-field">
                      <label for="price-lot" data-quick-i18n="quickmodal.lot">Lot *</label>
                      <div class="quick-add-lot-wrap">
                        <input type="text" inputmode="decimal" id="price-lot" placeholder="0.10" value="1.00">
                        <div class="lot-presets">
                          <button type="button" class="lot-preset" data-lot="0.01">0.01</button>
                          <button type="button" class="lot-preset" data-lot="0.10">0.1</button>
                          <button type="button" class="lot-preset active" data-lot="1.00">1</button>
                        </div>
                      </div>
                    </div>
                    <div class="quick-add-field">
                      <label data-quick-i18n="quickmodal.date">Tarih</label>
                      <div class="qa-date-input-wrap">
                        <input type="text" id="price-date" readonly
                               data-iso="${today}"
                               value="${todayDisplay}"
                               data-quick-i18n-placeholder="quickmodal.date_placeholder"
                               placeholder="Tarih seç">
                        <span class="qa-date-input-icon">${ICONS.calendar}</span>
                      </div>
                    </div>
                  </div>

                  <div class="quick-add-field">
                    <label for="price-strategy" data-quick-i18n="quickmodal.strategy">Strateji</label>
                    <div class="quick-add-strategy-wrap">
                      <select id="price-strategy">
                        <option value="" data-quick-i18n="quickmodal.no_strategy">— Strateji Yok —</option>
                      </select>
                      <button type="button" class="create-strategy-btn" id="price-create-strategy" title="+">${ICONS.plus}</button>
                    </div>
                  </div>
                </div>

                <!-- Sağ Kolon: Fiyatlar ve Canlı Hesaplama Terminali -->
                <div class="qa-col-right">
                  <div class="quick-add-row">
                    <div class="quick-add-field">
                      <label data-quick-i18n="quickmodal.entry_price">Giriş Fiyatı *</label>
                      <input type="text" inputmode="decimal" id="price-entry" placeholder="1.08500">
                    </div>
                    <div class="quick-add-field">
                      <label data-quick-i18n="quickmodal.exit_price">Çıkış Fiyatı</label>
                      <input type="text" inputmode="decimal" id="price-exit" placeholder="1.09000">
                    </div>
                  </div>

                  <div class="quick-add-row">
                    <div class="quick-add-field">
                      <label data-quick-i18n="quickmodal.stop_loss">Stop Loss</label>
                      <input type="text" inputmode="decimal" id="price-sl" placeholder="1.08000">
                    </div>
                    <div class="quick-add-field">
                      <label data-quick-i18n="quickmodal.take_profit">Take Profit</label>
                      <input type="text" inputmode="decimal" id="price-tp" placeholder="1.09500">
                    </div>
                  </div>

                  <div class="quick-add-row qa-row-comm">
                    <div class="quick-add-field">
                      <div class="qa-label-row">
                        <label for="price-commission" data-quick-i18n="quickmodal.commission">Komisyon</label>
                        <button type="button" class="qa-comm-btn-gear" id="qa-comm-gear-btn" title="Komisyon Oran ve Şablon Ayarı">
                          ${ICONS.settings}
                        </button>
                      </div>
                      <div class="qa-comm-input-wrap-main">
                        <input type="text" inputmode="decimal" id="price-commission" placeholder="0.00">
                        <span id="price-comm-badge" class="qa-comm-auto-badge" style="display:none;" data-quick-i18n="quickmodal.comm_auto_hint">Otomatik</span>
                      </div>
                    </div>
                    <div class="quick-add-field">
                      <label data-quick-i18n="quickmodal.swap">Swap</label>
                      <input type="text" inputmode="decimal" id="price-swap" placeholder="0.00">
                    </div>
                  </div>

                  <!-- Canlı Hesaplama Önizleme Kartı -->
                  <div class="quick-add-preview visible" id="price-preview">
                    <div class="preview-rail"></div>

                    <div class="preview-items-row">
                      <div class="preview-item">
                        <span class="p-label" data-quick-i18n="quickmodal.estimated_pnl">Net K/Z</span>
                        <span class="p-val" id="preview-pnl">—</span>
                      </div>
                      <div class="preview-divider"></div>
                      <div class="preview-item">
                        <span class="p-label" data-quick-i18n="quickmodal.risk_reward">Risk / Reward</span>
                        <span class="p-val accent" id="preview-rr">—</span>
                      </div>
                    </div>

                    <div class="preview-breakdown" id="preview-breakdown" style="display:none;">
                      <div class="breakdown-item">
                        <span class="breakdown-lbl" data-quick-i18n="quickmodal.gross">Brüt</span>:
                        <span class="breakdown-val" id="preview-gross">—</span>
                      </div>
                      <span class="breakdown-sep">·</span>
                      <div class="breakdown-item">
                        <span class="breakdown-lbl" data-quick-i18n="quickmodal.commission">Komisyon</span>:
                        <span class="breakdown-val" id="preview-comm">—</span>
                      </div>
                      <span class="breakdown-sep">·</span>
                      <div class="breakdown-item">
                        <span class="breakdown-lbl" data-quick-i18n="quickmodal.swap">Swap</span>:
                        <span class="breakdown-val" id="preview-swap">—</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Tam genişlik: not + duygu çipleri (note-tools.js çubuğu textarea'nın altına ekler) -->
              <div class="quick-add-field quick-add-notes qa-notes-section">
                <label for="price-notes" data-quick-i18n="quickmodal.notes">Notlar</label>
                <textarea id="price-notes" rows="2" data-quick-i18n-placeholder="quickmodal.notes_placeholder" placeholder="Notlar…"></textarea>
              </div>
            </div>

            <div class="quick-tab-content" id="tab-csv">
              <div class="qa-csv-wrap">
                <!-- Bırakma alanı: tıklayınca da dosya seçici açılır -->
                <div class="quick-import-area" id="quick-import-dropzone" role="button" tabindex="0">
                  <div class="qa-drop-hint">${ICONS.upload}<span data-quick-i18n="quickmodal.csv_drop_hint">Dosyayı bırak</span></div>

                  <div class="quick-import-icon">${ICONS.fileLarge}</div>
                  <div class="qa-drop-title" data-quick-i18n="quickmodal.csv_drop_title">Dosyayı sürükleyip bırak</div>
                  <p data-quick-i18n="quickmodal.csv_import_desc">MT4/MT5 veya Excel'den dışa aktardığınız CSV dosyasını yükleyin</p>
                  <button type="button" class="quick-import-btn" id="quick-csv-select">${ICONS.upload}<span data-quick-i18n="quickmodal.csv_choose_file">Dosya Seç</span></button>
                  <div class="qa-drop-formats">CSV · XLSX · XLS · HTML · TXT</div>
                </div>
                <input type="file" id="quick-csv-file" accept=".csv,.xlsx,.xls,.htm,.html,.txt" hidden>

                <div class="qa-csv-options">
                  <label for="quick-csv-broker" data-quick-i18n="quickmodal.broker_format">Broker Formatı</label>
                  <div class="quick-add-field">
                    <select id="quick-csv-broker">
                      <option value="auto" data-quick-i18n="quickmodal.broker_auto">Otomatik Algıla</option>
                      <option value="turkish" data-quick-i18n="quickmodal.broker_turkish">Türk Broker</option>
                      <option value="mt5">MetaTrader 4/5</option>
                      <option value="ctrader">cTrader</option>
                      <option value="tradovate">Tradovate</option>
                      <option value="binance">Binance</option>
                      <option value="bybit">Bybit</option>
                      <option value="coinbase">Coinbase</option>
                      <option value="generic" data-quick-i18n="quickmodal.broker_generic">Genel Format</option>
                    </select>
                  </div>
                </div>

                <div class="quick-import-status" id="quick-csv-status" style="display:none;">
                  <span class="status-icon">${ICONS.file}</span>
                  <span class="status-text" id="quick-csv-filename"></span>
                  <span class="status-badge" id="quick-csv-badge"></span>
                </div>

                <div class="quick-import-log" id="quick-csv-log" style="display:none;"></div>
                <div id="csv-preview-container" style="display:none;"></div>
              </div>
            </div>

            <div class="quick-tab-content" id="tab-bulk">
              <div class="quick-bulk-area">
                <div class="qa-bulk-guide">
                  <div class="qa-bulk-guide-head">
                    <p data-quick-i18n="quickmodal.bulk_desc">Her satıra bir işlem gelecek şekilde aşağıdaki formatta girin:</p>
                    <button type="button" class="qa-bulk-example-btn" id="quick-bulk-example">${ICONS.plus}<span data-quick-i18n="quickmodal.bulk_use_example">Örneği ekle</span></button>
                  </div>
                  <div class="qa-bulk-line is-format"><span class="qa-bulk-k" data-quick-i18n="quickmodal.bulk_format_label">Format</span><code data-quick-i18n="quickmodal.bulk_format">sembol,yön,lot,giriş,çıkış,tarih,not</code></div>
                  <div class="qa-bulk-line"><span class="qa-bulk-k" data-quick-i18n="quickmodal.bulk_example_label">Örnek</span><code data-quick-i18n="quickmodal.bulk_example">EURUSD,LONG,0.10,1.08500,1.09000,2026-01-15,İlk işlem</code></div>
                </div>
                <div class="qa-bulk-editor">
                  <textarea id="quick-bulk-textarea" rows="7" spellcheck="false" data-quick-i18n-placeholder="quickmodal.bulk_placeholder" placeholder="EURUSD,LONG,0.10,1.08500,1.09000,2026-01-15,İlk işlem"></textarea>
                  <span class="qa-bulk-count" id="quick-bulk-count"></span>
                </div>
                <div class="quick-bulk-progress" id="quick-bulk-progress" style="display:none;">
                  <span id="quick-bulk-status"></span>
                  <div class="quick-bulk-bar"><div class="quick-bulk-fill" id="quick-bulk-fill"></div></div>
                </div>
                <div class="quick-bulk-log" id="quick-bulk-log" style="display:none;"></div>
              </div>
            </div>

            <div class="quick-tab-content" id="tab-ai">
              <div class="qa-ai-wrap">
                <div class="quick-import-area qa-ai-drop" id="qa-ai-drop" role="button" tabindex="0">
                  <div class="qa-drop-hint">${ICONS.image}<span data-quick-i18n="quickmodal.ai_drop_hint">Görseli bırak</span></div>
                  <div class="quick-import-icon">${ICONS.sparkle}</div>
                  <div class="qa-drop-title" data-quick-i18n="quickmodal.ai_drop_title">Ekran görüntüsünü yapıştır veya bırak</div>
                  <p data-quick-i18n="quickmodal.ai_drop_desc">MT4/MT5, cTrader, TradingView, broker uygulaması ya da prop firma paneli. Ctrl+V ile de yapıştırabilirsin.</p>
                  <button type="button" class="quick-import-btn" id="qa-ai-pick">${ICONS.image}<span data-quick-i18n="quickmodal.ai_choose_image">Görsel Seç</span></button>
                </div>
                <div class="qa-ai-thumb" id="qa-ai-thumb" hidden>
                  <img id="qa-ai-thumb-img" alt="">
                  <span class="qa-ai-thumb-name" id="qa-ai-thumb-name"></span>
                  <button type="button" class="qa-ai-thumb-x" id="qa-ai-thumb-x" data-quick-i18n-title="quickmodal.ai_remove_image" title="Görseli kaldır" aria-label="Görseli kaldır">${ICONS.close}</button>
                </div>
                <input type="file" id="qa-ai-file" accept="image/png,image/jpeg,image/webp" hidden>
                <label class="qa-ai-label" for="qa-ai-text" data-quick-i18n="quickmodal.ai_text_label">veya yazarak anlat</label>
                <textarea id="qa-ai-text" rows="3" maxlength="2000" data-quick-i18n-placeholder="quickmodal.ai_text_placeholder" placeholder="örn: Altın 0.5 lot long, 2350'den girdim 2365'te kapattım, stop 2340"></textarea>
                <div class="qa-ai-meta">
                  <span data-quick-i18n="quickmodal.ai_privacy">Görsel saklanmaz. AI hiçbir şeyi kendisi kaydetmez; önce sen kontrol edersin.</span>
                  <span class="qa-ai-usage" id="qa-ai-usage"></span>
                </div>
                <div class="qa-ai-msg" id="qa-ai-msg" hidden></div>
              </div>
            </div>

            <div class="quick-add-loading" id="quick-add-loading">
              <div class="spinner"></div>
              <span data-quick-i18n="quickmodal.loading_saving">İşlem kaydediliyor...</span>
            </div>
          </div>

          <div class="quick-add-footer">
            <button class="btn-cancel" id="quick-add-cancel" data-quick-i18n="quickmodal.cancel">İptal</button>
            <button class="btn-save" id="quick-add-save">${ICONS.check}<span data-quick-i18n="quickmodal.save">Kaydet</span></button>
            <button class="btn-save" id="quick-import-btn" style="display:none;">${ICONS.upload}<span data-quick-i18n="quickmodal.import">İçe Aktar</span></button>
            <button class="btn-save" id="quick-bulk-btn" style="display:none;">${ICONS.send}<span data-quick-i18n="quickmodal.paste_add">İşlemleri Ekle</span></button>
            <button class="btn-save" id="quick-ai-btn" style="display:none;">${ICONS.sparkle}<span data-quick-i18n="quickmodal.ai_read">AI ile Oku</span></button>
          </div>

          <!-- Komisyon & Swap Şablon Modalı (Panelin Ortasında Açılır) -->
          <div class="qa-comm-modal-overlay" id="qa-comm-popover" style="display:none;">
            <div class="qa-comm-modal-dialog">
              <div class="qa-comm-modal-header">
                <div class="qa-comm-modal-title">
                  <span class="qa-comm-title-icon">${ICONS.settings}</span>
                  <span data-quick-i18n="quickmodal.comm_modal_title">Komisyon & Swap Şablonları</span>
                </div>
                <button type="button" class="qa-comm-modal-close" id="qa-comm-popover-close" aria-label="Kapat">✕</button>
              </div>

              <div class="qa-comm-presets">
                <div class="qa-comm-presets-label" data-quick-i18n="quickmodal.comm_presets_title">HAZIR ŞABLONLAR</div>
                <div class="qa-comm-chips" id="qa-comm-chips-list"></div>
              </div>

              <div class="qa-comm-modal-grid">
                <div class="quick-add-field">
                  <label data-quick-i18n="quickmodal.comm_template_name">ŞABLON ADI</label>
                  <input type="text" id="qa-comm-input-name" data-quick-i18n-placeholder="quickmodal.comm_template_name_ph" placeholder="örn: cTrader Raw">
                </div>
                <div class="quick-add-field">
                  <label data-quick-i18n="quickmodal.comm_rate_per_lot">LOT BAŞI ORAN</label>
                  <div class="qa-comm-input-wrap">
                    <input type="text" inputmode="decimal" id="qa-comm-input-rate" placeholder="2.26">
                    <span class="qa-comm-input-suffix">$/lot</span>
                  </div>
                </div>
              </div>

              <div class="qa-comm-toggle-bar">
                <label class="qa-comm-toggle-switch">
                  <input type="checkbox" id="qa-comm-auto-toggle" checked>
                  <span class="qa-comm-switch-track"></span>
                  <span class="qa-comm-switch-text" data-quick-i18n="quickmodal.comm_auto_toggle">Sonraki işlemlerde lota göre otomatik hesapla</span>
                </label>
              </div>

              <div class="qa-comm-modal-actions">
                <button type="button" class="qa-comm-btn-del" id="qa-comm-btn-del" style="display:none;" data-quick-i18n="quickmodal.comm_delete">Şablonu Sil</button>
                <div class="qa-comm-actions-right">
                  <button type="button" class="qa-comm-btn-cancel" id="qa-comm-btn-cancel" data-quick-i18n="quickmodal.dismiss">Vazgeç</button>
                  <button type="button" class="qa-comm-btn-save" id="qa-comm-btn-save">
                    ${ICONS.check}
                    <span data-quick-i18n="quickmodal.comm_save_apply">Kaydet ve Uygula</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <div class="qa-date-picker-overlay" id="qa-date-picker-overlay"></div>
      <div class="qa-date-picker" id="qa-date-picker" role="dialog" aria-modal="true">
        <div class="qa-date-picker-header">
          <button type="button" class="qa-dp-nav" id="qa-dp-prev" aria-label="Previous month">${ICONS.chevronLeft}</button>
          <button type="button" class="qa-dp-title" id="qa-dp-title" tabindex="-1">—</button>
          <button type="button" class="qa-dp-nav" id="qa-dp-next" aria-label="Next month">${ICONS.chevronRight}</button>
        </div>
        <div class="qa-date-picker-weekdays" id="qa-dp-weekdays"></div>
        <div class="qa-date-picker-grid" id="qa-dp-grid"></div>
        <div class="qa-date-picker-footer">
          <button type="button" class="qa-dp-footer-btn" id="qa-dp-today" data-quick-i18n="quickmodal.date_today">Bugün</button>
          <button type="button" class="qa-dp-footer-btn" id="qa-dp-clear" data-quick-i18n="quickmodal.date_clear">Temizle</button>
        </div>
      </div>
    `;
  }

  // ============================================================
  // STRATEJİLER
  // ============================================================

  async function loadStrategies() {
    try {
      if (!checkGlobals() || typeof requireAuth !== 'function') return;
      const user = await requireAuth();
      if (!user) return;

      if (!window.journal) return;
      await window.journal.ensureActiveJournal(user.id);

      var jid = window.journal ? window.journal.getActiveJournalId() : null;
      if (!jid) return;

      const { data, error } = await sb
        .from('strategies')
        .select('id, name, color, description')
        .eq('user_id', user.id)
        .eq('journal_id', jid)
        .eq('is_active', true)
        .order('name', { ascending: true });

      strategiesList = (!error && data) ? data : [];

      const select = el('price-strategy');
      if (select) {
        const currentValue = select.value;
        select.innerHTML = '<option value="" data-quick-i18n="quickmodal.no_strategy">' + escapeHtml(t('quickmodal.no_strategy')) + '</option>';
        strategiesList.forEach(function(s) {
          const option = document.createElement('option');
          option.value = s.id;
          option.textContent = s.name;
          select.appendChild(option);
        });
        if (currentValue) select.value = currentValue;
      }
    } catch (e) {
      wwLog.warn('Stratejiler yüklenemedi:', e);
    }
  }

  function selectInstrument(instrument, multiplier) {
    currentInstrument = instrument;
    currentMultiplier = multiplier;

    qsa('.quick-add-instrument-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.instrument === instrument);
    });

    const customWrap = el('price-custom-multiplier-wrap');
    if (customWrap) {
      customWrap.style.display = instrument === 'other' ? 'block' : 'none';
    }

    updatePricePreview();
  }

  // ============================================================
  // HAZIR SEMBOLLER — son kullanılanlar + popüler, enstrüman otomatik
  // ============================================================

  const POPULAR_SYMBOLS = {
    forex: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'EURJPY', 'GBPJPY', 'EURGBP'],
    gold: ['XAUUSD', 'XAGUSD'],
    index: ['NAS100', 'US30', 'SPX500', 'GER40', 'UK100', 'JP225'],
    crypto: ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD']
  };
  const RECENT_SYM_KEY = 'ww_qa_recent_symbols';
  const RECENT_SYM_MAX = 8;
  let recentSymbols = [];
  let recentSymbolsLoaded = false;
  let instrumentTouched = false; // kullanıcı enstrümanı elle seçtiyse yazarken ezme
  let symActive = -1;

  function readRecentSymbols() {
    try {
      const arr = JSON.parse(localStorage.getItem(RECENT_SYM_KEY) || '[]');
      return Array.isArray(arr) ? arr.filter(function(s) { return typeof s === 'string' && s; }).slice(0, RECENT_SYM_MAX) : [];
    } catch (e) { return []; }
  }
  function writeRecentSymbols(list) {
    recentSymbols = list.slice(0, RECENT_SYM_MAX);
    try { localStorage.setItem(RECENT_SYM_KEY, JSON.stringify(recentSymbols)); } catch (e) {}
  }
  function pushRecentSymbol(sym) {
    const s = String(sym || '').toUpperCase().trim();
    if (!s) return;
    writeRecentSymbols([s].concat(recentSymbols.filter(function(x) { return x !== s; })));
  }

  // ---- Kullanıcının kendi sembolleri ("Sembollerim") — bu tarayıcıda saklanır (komisyon şablonları gibi)
  const CUSTOM_SYM_KEY = 'ww_qa_custom_symbols';
  const CUSTOM_SYM_MAX = 30;
  // Sembol başına son kullanılan enstrüman/çarpan (USOIL → Diğer ×1000 gibi özel semboller için)
  const SYM_INST_KEY = 'ww_qa_symbol_instruments';
  const SYM_RE = /^[A-Z0-9][A-Z0-9._\/#!-]{1,23}$/;

  function normSymbol(v) {
    return String(v || '').toUpperCase().replace(/\s+/g, '');
  }
  function readCustomSymbols() {
    try {
      const arr = JSON.parse(localStorage.getItem(CUSTOM_SYM_KEY) || '[]');
      return Array.isArray(arr) ? arr.filter(function(s) { return typeof s === 'string' && SYM_RE.test(s); }).slice(0, CUSTOM_SYM_MAX) : [];
    } catch (e) { return []; }
  }
  function writeCustomSymbols(list) {
    try { localStorage.setItem(CUSTOM_SYM_KEY, JSON.stringify(list.slice(0, CUSTOM_SYM_MAX))); } catch (e) {}
  }
  function addCustomSymbol(sym) {
    const s = normSymbol(sym);
    if (!SYM_RE.test(s)) return false;
    const list = readCustomSymbols().filter(function(x) { return x !== s; });
    list.unshift(s);
    writeCustomSymbols(list);
    return true;
  }
  function removeCustomSymbol(sym) {
    writeCustomSymbols(readCustomSymbols().filter(function(x) { return x !== sym; }));
  }
  function readSymbolInstruments() {
    try {
      const o = JSON.parse(localStorage.getItem(SYM_INST_KEY) || '{}');
      return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch (e) { return {}; }
  }
  function rememberSymbolInstrument(sym, inst, mult) {
    const s = normSymbol(sym);
    if (!s || !inst || !(mult > 0)) return;
    const map = readSymbolInstruments();
    delete map[s];
    map[s] = { i: inst, m: mult };
    const keys = Object.keys(map);
    if (keys.length > 200) keys.slice(0, keys.length - 200).forEach(function(k) { delete map[k]; });
    try { localStorage.setItem(SYM_INST_KEY, JSON.stringify(map)); } catch (e) {}
  }

  // Aktif defterdeki son işlemlerin sembolleri (sayfa başına bir kez; kayıttan sonra pushRecentSymbol günceller)
  async function loadRecentSymbols() {
    if (!recentSymbols.length) recentSymbols = readRecentSymbols();
    if (recentSymbolsLoaded) return;
    try {
      if (!checkGlobals() || typeof requireAuth !== 'function') return;
      const user = await requireAuth();
      if (!user || !window.journal) return;
      await window.journal.ensureActiveJournal(user.id);
      const jid = window.journal.getActiveJournalId();
      if (!jid) return;
      if (!window.WwTrades || typeof window.WwTrades.applyScope !== 'function') return;
      // Yalnızca canlı işlemler (backtest sembolleri önerilere karışmasın)
      const { data, error } = await window.WwTrades.applyScope(
        sb.from('trades')
          .select('symbol')
          .eq('user_id', user.id)
          .eq('journal_id', jid),
        'live'
      )
        .order('trade_date', { ascending: false })
        .limit(200);
      if (error || !data) return;
      const seen = {};
      const list = [];
      data.forEach(function(r) {
        const s = String(r.symbol || '').toUpperCase().trim();
        if (s && !seen[s]) { seen[s] = true; list.push(s); }
      });
      recentSymbolsLoaded = true;
      writeRecentSymbols(list);
      const box = el('qa-sym-list');
      if (box && !box.hidden) renderSymbolList();
    } catch (e) { /* öneriler olmadan da çalışır */ }
  }

  function instrumentLabel(inst) {
    return t('quickmodal.instrument_' + inst);
  }

  function applyInstrumentFor(sym, force) {
    if (!force && instrumentTouched) return;
    // Önce bu sembolle en son kaydedilen enstrüman/çarpan (özel semboller için asıl bilgi bu)
    const saved = readSymbolInstruments()[normSymbol(sym)];
    if (saved && saved.i && (saved.i === 'other' || MULTIPLIER_MAP[saved.i])) {
      selectInstrument(saved.i, saved.i === 'other' ? null : MULTIPLIER_MAP[saved.i]);
      if (saved.i === 'other') {
        const cm = el('price-custom-multiplier');
        if (cm) { cm.value = String(saved.m); updatePricePreview(); }
      }
      return;
    }
    const inst = guessInstrument(sym);
    if (inst === 'other' || !MULTIPLIER_MAP[inst]) return;
    if (inst !== currentInstrument) selectInstrument(inst, MULTIPLIER_MAP[inst]);
  }

  function symbolMatches(sym, q) {
    return !q || sym.indexOf(q) !== -1;
  }
  // Yazılanla başlayanlar öne ("US" → USDJPY, US30 … sonra EURUSD)
  function byPrefix(q) {
    return function(a, b) {
      if (!q) return 0;
      return (b.indexOf(q) === 0 ? 1 : 0) - (a.indexOf(q) === 0 ? 1 : 0);
    };
  }

  function renderSymbolList() {
    const box = el('qa-sym-list');
    const input = el('price-symbol');
    if (!box || !input) return;
    const q = normSymbol(input.value);
    const groups = [];

    const custom = readCustomSymbols();
    const mine = custom.filter(function(s) { return symbolMatches(s, q); }).sort(byPrefix(q));
    // Boşken de başlık + ipucu görünsün: özellik keşfedilsin
    if (mine.length || !q) groups.push({ label: t('quickmodal.sym_mine'), items: mine, mine: true });

    const recent = recentSymbols.filter(function(s) { return symbolMatches(s, q) && custom.indexOf(s) === -1; }).sort(byPrefix(q)).slice(0, 6);
    if (recent.length) groups.push({ label: t('quickmodal.sym_recent'), items: recent, recent: true });

    const popular = [];
    Object.keys(POPULAR_SYMBOLS).forEach(function(inst) {
      const items = POPULAR_SYMBOLS[inst].filter(function(s) { return symbolMatches(s, q) && recent.indexOf(s) === -1 && custom.indexOf(s) === -1; }).sort(byPrefix(q));
      if (items.length) popular.push({ label: instrumentLabel(inst), items: items, prefix: !!q && items[0].indexOf(q) === 0 });
    });
    // Yazılanla başlayan sembolü olan gruplar üstte
    popular.sort(function(a, b) { return (b.prefix ? 1 : 0) - (a.prefix ? 1 : 0); });
    Array.prototype.push.apply(groups, popular);

    // Yazılan sembol henüz "Sembollerim"de değilse ekleme satırı
    const canAdd = SYM_RE.test(q) && custom.indexOf(q) === -1;

    const total = groups.reduce(function(n, g) { return n + g.items.length; }, 0);
    if (!total && !canAdd && q) { closeSymbolList(); return; }

    let html = '';
    let idx = 0;
    if (canAdd) {
      html += '<button type="button" class="qa-sym-item qa-sym-add" role="option" id="qa-sym-opt-' + idx + '" data-idx="' + idx + '" data-add="' + escapeHtml(q) + '" tabindex="-1">' +
        ICONS.plus + '<span>' + escapeHtml(t('quickmodal.sym_add', { symbol: q })) + '</span></button>';
      idx++;
    }
    groups.forEach(function(g) {
      html += '<div class="qa-sym-group' + (g.recent ? ' is-recent' : '') + (g.mine ? ' is-mine' : '') + '">';
      html += '<div class="qa-sym-label">' + escapeHtml(g.label) + '</div>';
      if (g.mine && !g.items.length) {
        html += '<div class="qa-sym-hint">' + escapeHtml(t('quickmodal.sym_mine_hint')) + '</div></div>';
        return;
      }
      html += '<div class="qa-sym-chips">';
      g.items.forEach(function(s) {
        const btn = '<button type="button" class="qa-sym-item" role="option" id="qa-sym-opt-' + idx + '" data-idx="' + idx + '" data-sym="' + escapeHtml(s) + '" tabindex="-1">' + escapeHtml(s) + '</button>';
        if (g.mine) {
          html += '<span class="qa-sym-own">' + btn + '<button type="button" class="qa-sym-del" data-del="' + escapeHtml(s) + '" tabindex="-1" title="' + escapeHtml(t('quickmodal.sym_remove')) + '" aria-label="' + escapeHtml(t('quickmodal.sym_remove') + ' ' + s) + '">' + ICONS.close + '</button></span>';
        } else {
          html += btn;
        }
        idx++;
      });
      html += '</div></div>';
    });
    box.innerHTML = html;
    box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    symActive = Math.min(symActive, idx - 1);
    paintSymbolActive();
  }

  function paintSymbolActive() {
    const input = el('price-symbol');
    qsa('#qa-sym-list .qa-sym-item').forEach(function(b) {
      const on = Number(b.dataset.idx) === symActive;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) b.scrollIntoView({ block: 'nearest' });
    });
    if (input) {
      if (symActive >= 0) input.setAttribute('aria-activedescendant', 'qa-sym-opt-' + symActive);
      else input.removeAttribute('aria-activedescendant');
    }
  }

  function closeSymbolList() {
    const box = el('qa-sym-list');
    const input = el('price-symbol');
    if (box) { box.hidden = true; box.innerHTML = ''; }
    if (input) { input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
    symActive = -1;
  }

  // Listede bir öğe seçildi: ekleme satırı ise önce "Sembollerim"e kaydet
  function pickSymbolItem(b) {
    if (!b) return;
    if (b.dataset.add) {
      addCustomSymbol(b.dataset.add);
      pickSymbol(normSymbol(b.dataset.add));
      return;
    }
    pickSymbol(b.dataset.sym);
  }

  function pickSymbol(sym) {
    const input = el('price-symbol');
    if (!input) return;
    input.value = sym;
    closeSymbolList();
    applyInstrumentFor(sym, true);
    input.dispatchEvent(new Event('input', { bubbles: true })); // önizleme güncellensin
    const entry = el('price-entry');
    if (entry) entry.focus();
  }

  function initSymbolPicker() {
    const input = el('price-symbol');
    const box = el('qa-sym-list');
    if (!input || !box) return;

    // Programla verilen odakta (modal açılışı) değil, kullanıcı tıklayınca / yazınca açılır
    input.addEventListener('mousedown', function() { if (box.hidden) setTimeout(renderSymbolList, 0); });
    input.addEventListener('input', function(e) {
      if (!e.isTrusted) return;
      symActive = -1;
      renderSymbolList();
    });
    input.addEventListener('keydown', function(e) {
      const open = !box.hidden;
      const count = box.querySelectorAll('.qa-sym-item').length;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!open) { renderSymbolList(); symActive = 0; paintSymbolActive(); return; }
        if (!count) return;
        symActive = (symActive + 1) % count; paintSymbolActive();
      } else if (e.key === 'ArrowUp' && open && count) {
        e.preventDefault();
        symActive = symActive <= 0 ? count - 1 : symActive - 1; paintSymbolActive();
      } else if (e.key === 'Enter' && open && symActive >= 0) {
        e.preventDefault();
        pickSymbolItem(box.querySelector('.qa-sym-item[data-idx="' + symActive + '"]'));
      } else if (e.key === 'Escape' && open) {
        e.stopPropagation(); // modalı kapatma, sadece listeyi kapat
        closeSymbolList();
      } else if (e.key === 'Tab') {
        closeSymbolList();
      }
    });
    input.addEventListener('blur', function() { setTimeout(closeSymbolList, 120); });
    // Elle yazılan sembolde de enstrümanı tahmin et (kullanıcı enstrümanı kendisi seçmediyse)
    input.addEventListener('change', function() { if (input.value.trim()) applyInstrumentFor(input.value.trim().toUpperCase(), false); });

    // Odak input'ta kalsın (blur listeyi kapatmasın)
    box.addEventListener('mousedown', function(e) { e.preventDefault(); });
    box.addEventListener('click', function(e) {
      const del = e.target.closest('.qa-sym-del');
      if (del) {
        removeCustomSymbol(del.dataset.del);
        symActive = -1;
        renderSymbolList();
        return;
      }
      pickSymbolItem(e.target.closest('.qa-sym-item'));
    });

    qsa('.quick-add-instrument-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) { if (e.isTrusted) instrumentTouched = true; });
    });
  }

  function getMultiplier() {
    if (currentInstrument === 'other') {
      const customEl = el('price-custom-multiplier');
      const v = customEl ? parseFloat(customEl.value) : null;
      return isNaN(v) ? null : v;
    }
    return currentMultiplier || 1;
  }

  // ============================================================
  // KOMİSYON VE SWAP ŞABLON YÖNETİMİ
  // ============================================================
  var DEFAULT_COMM_PROFILES = [
    { id: 'ctrader', name: 'cTrader Raw', commPerLot: 9.04 },
    { id: 'prop', name: 'Prop Firm', commPerLot: 6.00 },
    { id: 'zero', name: 'Sıfır Komisyon', commPerLot: 0 }
  ];

  function getCommProfiles() {
    try {
      var raw = localStorage.getItem('ww_comm_profiles');
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch(e) {}
    return DEFAULT_COMM_PROFILES;
  }

  function saveCommProfiles(list) {
    try {
      localStorage.setItem('ww_comm_profiles', JSON.stringify(list));
    } catch(e) {}
  }

  function isAutoCommEnabled() {
    var saved = localStorage.getItem('ww_comm_auto_enabled');
    return saved !== 'false';
  }

  function getActiveCommProfile() {
    var profiles = getCommProfiles();
    var activeId = localStorage.getItem('ww_comm_active_profile_id') || 'ctrader';
    var found = profiles.find(function(p) { return p.id === activeId; });
    return found || profiles[0] || { id: 'custom', name: 'Özel', commPerLot: 0 };
  }

  function renderCommChips() {
    var listEl = el('qa-comm-chips-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    var profiles = getCommProfiles();
    var activeProf = getActiveCommProfile();

    profiles.forEach(function(prof) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'qa-comm-chip' + (prof.id === activeProf.id ? ' active' : '');
      var displayName = prof.name;
      if (prof.id === 'zero') {
        displayName = (typeof quickI18n !== 'undefined' ? quickI18n.t('quickmodal.comm_zero_label') : 'Sıfır Komisyon');
      }
      btn.textContent = displayName + (prof.commPerLot > 0 ? (' (' + prof.commPerLot + ')') : ' (0)');
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        selectCommProfile(prof.id);
      });
      listEl.appendChild(btn);
    });

    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'qa-comm-chip qa-comm-chip-add';
    var addText = (typeof quickI18n !== 'undefined' ? quickI18n.t('quickmodal.comm_new_template') : '+ Yeni Şablon');
    addBtn.innerHTML = addText;
    addBtn.addEventListener('click', function(e) {
      e.preventDefault();
      prepareNewCommProfile();
    });
    listEl.appendChild(addBtn);
  }

  function selectCommProfile(id) {
    var profiles = getCommProfiles();
    var prof = profiles.find(function(p) { return p.id === id; });
    if (!prof) return;

    localStorage.setItem('ww_comm_active_profile_id', prof.id);
    localStorage.setItem('ww_commission_per_lot', String(prof.commPerLot));

    var nameInput = el('qa-comm-input-name');
    var rateInput = el('qa-comm-input-rate');
    var delBtn = el('qa-comm-btn-del');

    if (nameInput) nameInput.value = prof.name;
    if (rateInput) rateInput.value = prof.commPerLot;

    var isStandard = (prof.id === 'ctrader' || prof.id === 'prop' || prof.id === 'zero');
    if (delBtn) delBtn.style.display = isStandard ? 'none' : 'inline-block';

    renderCommChips();
    syncCommissionWithLot(true);
  }

  function prepareNewCommProfile() {
    var nameInput = el('qa-comm-input-name');
    var rateInput = el('qa-comm-input-rate');
    var delBtn = el('qa-comm-btn-del');

    if (nameInput) {
      nameInput.value = '';
      nameInput.focus();
    }
    if (rateInput) rateInput.value = '';
    if (delBtn) delBtn.style.display = 'none';

    document.querySelectorAll('.qa-comm-chip').forEach(function(c) { c.classList.remove('active'); });
  }

  function syncCommissionWithLot(forceRecalc) {
    var autoEnabled = isAutoCommEnabled();
    var activeProf = getActiveCommProfile();
    var commInput = el('price-commission');
    var commBadge = el('price-comm-badge');
    var lot = parseFloat(el('price-lot')?.value);

    if (!autoEnabled) {
      if (commBadge) {
        commBadge.textContent = 'Manuel';
        commBadge.style.display = 'inline-block';
        commBadge.title = 'Otomatik komisyon hesabı kapalı';
      }
      if (commInput && !commInput.value) commInput.placeholder = '0.00';
      updatePricePreview();
      return;
    }

    if (commBadge) {
      var badgeText = activeProf.name + (activeProf.commPerLot > 0 ? (' ' + activeProf.commPerLot + '/lot') : ' (0)');
      commBadge.textContent = badgeText;
      commBadge.style.display = 'inline-block';
      commBadge.title = activeProf.name + ' şablonuna göre otomatik hesaplanıyor';
    }

    var isUserEdited = commInput && commInput.dataset.userEdited === 'true';

    if (forceRecalc || !isUserEdited) {
      if (commInput && !isNaN(lot) && lot > 0) {
        var calculated = parseFloat((lot * activeProf.commPerLot).toFixed(2));
        commInput.value = calculated > 0 ? calculated.toFixed(2) : (activeProf.commPerLot === 0 ? '0.00' : '');
        commInput.dataset.userEdited = 'false';
      }
    }
    updatePricePreview();
  }

  function initCommissionPopover() {
    var gearBtn = el('qa-comm-gear-btn');
    var popover = el('qa-comm-popover');
    var closeBtn = el('qa-comm-popover-close');
    var cancelBtn = el('qa-comm-btn-cancel');
    var autoToggle = el('qa-comm-auto-toggle');
    var saveBtn = el('qa-comm-btn-save');
    var delBtn = el('qa-comm-btn-del');

    if (autoToggle) {
      autoToggle.checked = isAutoCommEnabled();
      autoToggle.addEventListener('change', function() {
        localStorage.setItem('ww_comm_auto_enabled', this.checked ? 'true' : 'false');
        syncCommissionWithLot(true);
      });
    }

    if (gearBtn && popover) {
      gearBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var isHidden = (popover.style.display === 'none' || !popover.style.display);
        popover.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) {
          var activeProf = getActiveCommProfile();
          selectCommProfile(activeProf.id);
        }
      });
    }

    if (closeBtn && popover) {
      closeBtn.addEventListener('click', function(e) {
        e.preventDefault();
        popover.style.display = 'none';
      });
    }

    if (cancelBtn && popover) {
      cancelBtn.addEventListener('click', function(e) {
        e.preventDefault();
        popover.style.display = 'none';
      });
    }

    // Karartılmış backdrop'a tıklayınca modalı kapatma
    if (popover) {
      popover.addEventListener('click', function(e) {
        if (e.target === popover) {
          popover.style.display = 'none';
        }
      });
    }

    // Escape tuşuyla kapatma
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && popover && popover.style.display !== 'none') {
        popover.style.display = 'none';
      }
    });

    // Enter ile hızlı kaydetme
    var nameInput = el('qa-comm-input-name');
    var rateInput = el('qa-comm-input-rate');
    [nameInput, rateInput].forEach(function(inp) {
      if (inp) {
        inp.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (saveBtn) saveBtn.click();
          }
        });
      }
    });

    if (saveBtn) {
      saveBtn.addEventListener('click', function(e) {
        e.preventDefault();
        var nInput = el('qa-comm-input-name');
        var rInput = el('qa-comm-input-rate');
        var name = (nInput?.value || '').trim() || 'Özel Şablon';
        var rate = parseFloat(rInput?.value?.replace(',', '.')) || 0;

        var profiles = getCommProfiles();
        var activeId = localStorage.getItem('ww_comm_active_profile_id') || ('custom_' + Date.now());
        var existingIdx = profiles.findIndex(function(p) { return p.id === activeId; });

        if (existingIdx > -1) {
          profiles[existingIdx].name = name;
          profiles[existingIdx].commPerLot = rate;
        } else {
          var newId = 'custom_' + Date.now();
          profiles.push({ id: newId, name: name, commPerLot: rate });
          activeId = newId;
        }

        saveCommProfiles(profiles);
        localStorage.setItem('ww_comm_active_profile_id', activeId);
        localStorage.setItem('ww_commission_per_lot', String(rate));
        if (autoToggle) {
          localStorage.setItem('ww_comm_auto_enabled', autoToggle.checked ? 'true' : 'false');
        }

        renderCommChips();
        syncCommissionWithLot(true);
        if (popover) popover.style.display = 'none';
        if (typeof showToast === 'function') {
          var updatedMsg = (typeof quickI18n !== 'undefined' ? quickI18n.t('quickmodal.comm_updated_msg') : 'Komisyon şablonu güncellendi: ') + name;
          showToast(updatedMsg, 'success');
        }
      });
    }

    if (delBtn) {
      delBtn.addEventListener('click', function(e) {
        e.preventDefault();
        var activeId = localStorage.getItem('ww_comm_active_profile_id');
        var profiles = getCommProfiles().filter(function(p) { return p.id !== activeId; });
        saveCommProfiles(profiles);
        selectCommProfile(profiles[0]?.id || 'ctrader');
        if (typeof showToast === 'function') {
          var delMsg = (typeof quickI18n !== 'undefined' ? quickI18n.t('quickmodal.comm_deleted_msg') : 'Şablon silindi.');
          showToast(delMsg, 'info');
        }
      });
    }
  }

  function updatePricePreview() {
    const symbol = (el('price-symbol')?.value || '').trim().toUpperCase();
    const entry = parseFloat(el('price-entry')?.value);
    const exit = parseFloat(el('price-exit')?.value);
    const lot = parseFloat(el('price-lot')?.value);
    const sl = parseFloat(el('price-sl')?.value);
    const tp = parseFloat(el('price-tp')?.value);
    const dir = currentSide === 'BUY' ? 'LONG' : 'SHORT';
    const mult = getMultiplier();

    const commInput = el('price-commission');
    const swapInput = el('price-swap');
    const commBadge = el('price-comm-badge');
    const previewEl = el('price-preview');
    const pnlEl = el('preview-pnl');
    const rrEl = el('preview-rr');
    const breakdownEl = el('preview-breakdown');
    const grossEl = el('preview-gross');
    const commEl = el('preview-comm');
    const swapValEl = el('preview-swap');

    // Otomatik komisyon kontrolü
    const autoEnabled = isAutoCommEnabled();
    const activeProf = getActiveCommProfile();
    let commission = 0;
    const isUserEdited = commInput && commInput.dataset.userEdited === 'true';

    if (autoEnabled) {
      if (!isUserEdited && !isNaN(lot) && lot > 0) {
        commission = parseFloat((lot * activeProf.commPerLot).toFixed(2));
        if (commInput && (!commInput.value || commInput.value.trim() === '')) {
          commInput.value = commission > 0 ? commission.toFixed(2) : (activeProf.commPerLot === 0 ? '0.00' : '');
        }
      } else {
        commission = parseFloat(commInput?.value) || 0;
      }
      if (commBadge) {
        commBadge.textContent = isUserEdited ? 'Özel' : (activeProf.name + (activeProf.commPerLot > 0 ? (' ' + activeProf.commPerLot + '/lot') : ' (0)')); commBadge.title = commBadge.textContent;
        commBadge.style.display = 'inline-block';
      }
    } else {
      commission = parseFloat(commInput?.value) || 0;
      if (commBadge) {
        commBadge.textContent = 'Manuel'; commBadge.title = commBadge.textContent;
        commBadge.style.display = 'inline-block';
      }
    }

    const swap = parseFloat(swapInput?.value) || 0;

    let hasPnl = false;
    let hasRr = false;
    let pnlSign = 0;

    if (entry && lot && !isNaN(entry) && !isNaN(lot) && mult !== null) {
      if (exit && !isNaN(exit)) {
        try {
          const direction = (dir && (dir.toUpperCase() === 'LONG' || dir.toUpperCase() === 'BUY')) ? 1 : -1;
          const rawPnl = direction * (parseFloat(exit) - parseFloat(entry)) * parseFloat(lot) * mult;
          
          let gross = rawPnl;
          const curr = (typeof window.getCurrencySymbol === 'function' ? window.getCurrencySymbol() : '') || localStorage.getItem('ww_currency') || '$';
          const isEurAccount = (curr === '€' || curr === 'EUR');
          
          // EUR hesabı: USD cinsinden kazanç yalnızca EURUSD için çıkış fiyatına bölünerek EUR'a çevrilir.
          // Diğer çiftlerde (GBPUSD, XAUUSD...) doğru kur bilinmediği için dönüşüm YAPILMAZ.
          if (isEurAccount && /^EURUSD/.test(String(symbol).toUpperCase().replace(/[^A-Z]/g, '')) && parseFloat(exit) > 0) {
            gross = rawPnl / parseFloat(exit);
          }

          gross = parseFloat(gross.toFixed(2));
          const net = parseFloat((gross - commission + swap).toFixed(2));

          if (pnlEl && typeof formatCurrency === 'function') {
            pnlEl.textContent = formatCurrency(net);
            pnlEl.className = 'p-val' + (net >= 0 ? ' pos' : ' neg');
          }
          pnlSign = net >= 0 ? 1 : -1;
          hasPnl = true;

          // Breakdown detayları
          if (breakdownEl && grossEl && commEl && swapValEl && typeof formatCurrency === 'function') {
            grossEl.textContent = formatCurrency(gross);
            commEl.textContent = '-' + formatCurrency(Math.abs(commission)).replace('+', '');
            swapValEl.textContent = (swap > 0 ? '+' : '') + formatCurrency(swap);
            breakdownEl.style.display = 'flex';
          }
        } catch(e) {}
      }

      if (sl && tp && !isNaN(sl) && !isNaN(tp)) {
        try {
          let rr = null;
          if (typeof calcRR === 'function') {
            rr = calcRR(entry, sl, tp, dir);
          } else {
            const risk = Math.abs(entry - sl);
            const reward = Math.abs(tp - entry);
            if (risk > 0) rr = (reward / risk).toFixed(2);
          }
          if (rr !== null && rrEl) {
            rrEl.textContent = '1 : ' + rr;
            hasRr = true;
          }
        } catch(e) {}
      }
    }

    if (pnlEl && !hasPnl) {
      pnlEl.textContent = '—';
      pnlEl.className = 'p-val';
      if (breakdownEl) breakdownEl.style.display = 'none';
    }
    if (rrEl && !hasRr) {
      rrEl.textContent = '—';
    }

    if (previewEl) {
      previewEl.classList.remove('rail-pos', 'rail-neg');
      if (hasPnl) {
        previewEl.classList.add(pnlSign >= 0 ? 'rail-pos' : 'rail-neg');
      }
    }
  }

  function openModal() {
    const overlay = el('quick-add-overlay');
    if (!overlay) return;

    closeDatePicker();
    resetForm();
    setSide('BUY');
    switchTab('price');
    selectInstrument('forex', 100000);
    instrumentTouched = false;
    closeSymbolList();
    loadStrategies();
    loadRecentSymbols();

    if (typeof quickI18n !== 'undefined' && typeof quickI18n.apply === 'function') {
      quickI18n.apply();
    }

    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    renderCommChips();
    syncCommissionWithLot(true);

    setTimeout(function() {
      const symbol = el('price-symbol');
      if (symbol) symbol.focus();
    }, 100);
  }

  function closeModal() {
    const overlay = el('quick-add-overlay');
    if (!overlay) return;

    closeDatePicker();
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    isSubmitting = false;
    isImporting = false;
    csvPreviewData = null;
    syncImportBtn();

    const loading = el('quick-add-loading');
    if (loading) loading.classList.remove('active');

    csvFile = null;
    const fileInput = el('quick-csv-file');
    if (fileInput) fileInput.value = '';

    const previewContainer = el('csv-preview-container');
    if (previewContainer) previewContainer.style.display = 'none';

    const dropzone = el('quick-import-dropzone');
    if (dropzone) dropzone.classList.remove('qa-dragover');

    resetAi();
  }

  function resetForm() {
    const today = todayIso();
    const todayDisplay = formatDateDisplay(today);

    const ids = ['price-symbol', 'price-entry', 'price-exit', 'price-sl', 'price-tp', 'price-custom-multiplier', 'price-notes'];
    ids.forEach(function(id) {
      const e = el(id);
      if (e) e.value = '';
    });

    const pLot = el('price-lot');
    if (pLot) pLot.value = '1.00';

    const pStrategy = el('price-strategy');
    if (pStrategy) pStrategy.value = '';

    const pDate = el('price-date');
    if (pDate) {
      pDate.value = todayDisplay;
      pDate.setAttribute('data-iso', today);
    }

    const bulkText = el('quick-bulk-textarea');
    if (bulkText) bulkText.value = '';
    updateBulkCount();

    const error = el('quick-add-error');
    if (error) error.classList.remove('active');

    const loading = el('quick-add-loading');
    if (loading) loading.classList.remove('active');

    const csvLog = el('quick-csv-log');
    if (csvLog) { csvLog.style.display = 'none'; csvLog.innerHTML = ''; }
    const csvStatus = el('quick-csv-status');
    if (csvStatus) csvStatus.style.display = 'none';
    const brokerSelect = el('quick-csv-broker');
    if (brokerSelect) brokerSelect.value = 'auto';

    const bulkLog = el('quick-bulk-log');
    if (bulkLog) { bulkLog.style.display = 'none'; bulkLog.innerHTML = ''; }
    const bulkProgress = el('quick-bulk-progress');
    if (bulkProgress) bulkProgress.style.display = 'none';

    const preview = el('price-preview');
    if (preview) preview.classList.remove('visible', 'rail-pos', 'rail-neg');
    const breakdown = el('preview-breakdown');
    if (breakdown) breakdown.style.display = 'none';

    const pComm = el('price-commission');
    if (pComm) {
      pComm.value = '';
      pComm.dataset.userEdited = 'false';
    }
    const pSwap = el('price-swap');
    if (pSwap) pSwap.value = '';
    const pCommBadge = el('price-comm-badge');
    if (pCommBadge) pCommBadge.style.display = 'none';

    const previewContainer = el('csv-preview-container');
    if (previewContainer) { previewContainer.style.display = 'none'; previewContainer.innerHTML = ''; }

    const saveBtn = el('quick-add-save');
    const importBtn = el('quick-import-btn');
    const bulkBtn = el('quick-bulk-btn');
    if (saveBtn) saveBtn.style.display = '';
    if (importBtn) importBtn.style.display = 'none';
    if (bulkBtn) bulkBtn.style.display = 'none';
  }

  function switchTab(tab) {
    currentTab = tab;
    closeDatePicker();

    qsa('.quick-tab').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    qsa('.quick-tab-content').forEach(function(content) {
      content.classList.toggle('active', content.id === 'tab-' + tab);
    });

    const saveBtn = el('quick-add-save');
    const importBtn = el('quick-import-btn');
    const bulkBtn = el('quick-bulk-btn');

    const aiBtn = el('quick-ai-btn');

    if (saveBtn) saveBtn.style.display = (tab === 'csv' || tab === 'bulk' || tab === 'ai') ? 'none' : '';
    if (importBtn) importBtn.style.display = (tab === 'csv') ? '' : 'none';
    syncImportBtn();
    if (bulkBtn) bulkBtn.style.display = (tab === 'bulk') ? '' : 'none';
    if (aiBtn) aiBtn.style.display = (tab === 'ai') ? '' : 'none';
    if (tab === 'ai') { syncAiBtn(); showAiUsage(); }

    const error = el('quick-add-error');
    if (error) error.classList.remove('active');

    if (tab === 'csv' && typeof ensureCsvParsers === 'function') {
      ensureCsvParsers();
    }
  }

  function setSide(side) {
    currentSide = side;
    const buyBtn = el('price-side-buy');
    const sellBtn = el('price-side-sell');
    if (buyBtn && sellBtn) {
      buyBtn.classList.toggle('active-buy', side === 'BUY');
      sellBtn.classList.toggle('active-sell', side === 'SELL');
    }
    updatePricePreview();
  }

  function setLotPreset(value) {
    const input = el('price-lot');
    if (!input) return;
    input.value = value;
    qsa('.lot-preset').forEach(function(btn) {
      btn.classList.toggle('active', parseFloat(btn.dataset.lot) === parseFloat(value));
    });
    syncCommissionWithLot(false);
  }

  // ============================================================
  // CSV IMPORT
  // ============================================================

  function renderCSVLog(messages) {
    const elm = el('quick-csv-log');
    if (elm) {
      if (messages && messages.length > 0) {
        elm.style.display = 'block';
        elm.innerHTML = messages.join('');
      } else {
        elm.style.display = 'none';
        elm.innerHTML = '';
      }
    }
  }

  // Footer "İçe Aktar" yalnızca okunmuş bir dosya varken aktif
  function syncImportBtn() {
    const btn = el('quick-import-btn');
    if (btn) btn.disabled = !csvPreviewData || isImporting;
  }

  // Önizlemede ISO zaman damgası ("2026-11-20T07:00:00.000Z") yerine yerel "2026-11-20 10:00"
  function previewDate(d) {
    if (!d) return '—';
    const s = String(d);
    if (s.indexOf('T') === -1) return s;
    const dt = new Date(s);
    if (isNaN(dt.getTime())) return s;
    const p = function(n) { return String(n).padStart(2, '0'); };
    return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate()) + ' ' + p(dt.getHours()) + ':' + p(dt.getMinutes());
  }

  function colLabel(key, fallback) {
    const s = t(key);
    return (s && s !== key ? s : fallback).replace(/\s*\*\s*$/, '');
  }

  function showBrokerPreview(rows, detected, errors) {
    const container = el('csv-preview-container');
    if (!container) return;

    container.style.display = 'block';
    let html = '<div class="qa-csv-preview">';

    html += '<div class="qa-csv-preview-head">';
    html += '<span class="qa-csv-title">' + escapeHtml(t('quickmodal.csv_import_title') || 'İçe Aktarılacak') + '</span>';
    html += '<span class="qa-csv-tag">' + escapeHtml(String(detected || 'unknown').toUpperCase()) + '</span>';
    html += '<span class="qa-csv-count">' + rows.length + ' ' + escapeHtml(t('quickmodal.records')) + '</span>';
    html += '</div>';

    if (errors && errors.length > 0) {
      html += '<div class="qa-csv-errors">';
      errors.slice(0, 3).forEach(function(e) {
        html += '<div>' + ICONS.alert + '<span>' + escapeHtml(e) + '</span></div>';
      });
      if (errors.length > 3) {
        html += '<div class="qa-csv-errors-more">' + escapeHtml(t('quickmodal.more_errors', { count: errors.length - 3 })) + '</div>';
      }
      html += '</div>';
    }

    const hasCommOrSwap = rows.some(function(r) {
      return (r.commission != null && Number(r.commission) > 0) || (r.swap != null && Number(r.swap) !== 0);
    });

    const headers = [
      colLabel('quickmodal.symbol', 'Symbol'),
      colLabel('quickmodal.side', 'Side'),
      colLabel('quickmodal.lot', 'Lot'),
      colLabel('quickmodal.entry_price', 'Entry'),
      colLabel('quickmodal.exit_price', 'Exit'),
      'P&L'
    ];
    if (hasCommOrSwap) {
      headers.push(colLabel('quickmodal.commission', 'Comm'), colLabel('quickmodal.swap', 'Swap'));
    }
    headers.push(colLabel('quickmodal.date', 'Date'));

    html += '<div class="qa-csv-table-wrap"><table class="qa-csv-table"><thead><tr>';
    headers.forEach(function(h) { html += '<th>' + escapeHtml(h) + '</th>'; });
    html += '</tr></thead><tbody>';

    rows.slice(0, 30).forEach(function(r) {
      html += '<tr>';
      html += '<td class="sym">' + escapeHtml(r.symbol) + '</td>';
      html += '<td class="' + (r.direction === 'LONG' ? 'pos' : 'neg') + '">' + escapeHtml(r.direction) + '</td>';
      html += '<td>' + (r.lot != null ? escapeHtml(String(r.lot)) : '—') + '</td>';
      html += '<td>' + (r.entry_price ? escapeHtml(String(r.entry_price)) : '—') + '</td>';
      html += '<td class="muted">' + (r.exit_price != null ? escapeHtml(String(r.exit_price)) : '—') + '</td>';

      var pnlDisplay = '—';
      var pnlCls = 'muted';
      var pnlVal = r.pnl;

      // Fallback: Eğer r.pnl yoksa veya null ise, entry/exit/lot üzerinden çarpanla hesapla
      if ((pnlVal == null || isNaN(pnlVal)) && r.entry_price != null && r.exit_price != null && r.lot != null) {
        var inst = r.instrument || guessInstrument(r.symbol);
        var mult = r.multiplier || MULTIPLIER_MAP[inst] || 1;
        var diff = r.direction === 'LONG' ? (r.exit_price - r.entry_price) : (r.entry_price - r.exit_price);
        pnlVal = diff * r.lot * mult - (Math.abs(Number(r.commission) || 0)) + (Number(r.swap) || 0);
      }

      if (pnlVal != null && !isNaN(pnlVal)) {
        var pnlNum = parseFloat(pnlVal);
        pnlDisplay = (pnlNum >= 0 ? '+' : '') + pnlNum.toFixed(2);
        pnlCls = pnlNum >= 0 ? 'pos' : 'neg';
      }
      html += '<td class="' + pnlCls + ' strong">' + pnlDisplay + '</td>';

      if (hasCommOrSwap) {
        var commNum = parseFloat(r.commission);
        var commStr = (!isNaN(commNum) && commNum > 0) ? '-' + commNum.toFixed(2) : '—';
        var swapNum = parseFloat(r.swap);
        var swapStr = (!isNaN(swapNum) && swapNum !== 0) ? (swapNum > 0 ? '+' : '') + swapNum.toFixed(2) : '—';
        html += '<td class="muted">' + commStr + '</td>';
        html += '<td class="muted">' + swapStr + '</td>';
      }

      html += '<td class="muted">' + escapeHtml(previewDate(r.trade_date)) + '</td>';
      html += '</tr>';
    });

    if (rows.length > 30) {
      html += '<tr class="qa-csv-more"><td colspan="' + headers.length + '">' + escapeHtml(t('quickmodal.more_records', { count: rows.length - 30 })) + '</td></tr>';
    }
    html += '</tbody></table></div></div>';

    container.innerHTML = html;
  }

  async function handleCsvFileSelect(file) {
    // Önceki dosyanın önizlemesi/verisi yeni dosya okunamazsa ekranda (ve içe aktarımda) kalmasın
    csvPreviewData = null;
    syncImportBtn();
    renderCSVLog([]);
    const oldPreview = el('csv-preview-container');
    if (oldPreview) { oldPreview.style.display = 'none'; oldPreview.innerHTML = ''; }

    try {
      csvFile = file;

      await ensureCsvParsers();

      const statusEl = el('quick-csv-status');
      const filenameEl = el('quick-csv-filename');
      const badgeEl = el('quick-csv-badge');

      if (statusEl) statusEl.style.display = 'flex';
      if (filenameEl) filenameEl.textContent = t('quickmodal.csv_file_selected', { filename: file.name });
      if (badgeEl) badgeEl.innerHTML = badgeIcon('loading');

      let csvText;
      try {
        csvText = await fileToCsvText(file);
      } catch (e) {
        wwLog.warn('Dosya çevirme hatası:', e);
        showToast('Dosya okunamadı: ' + e.message, 'error');
        if (badgeEl) badgeEl.innerHTML = badgeIcon('error');
        return;
      }

      const brokerSelect = el('quick-csv-broker');
      const selectedBroker = brokerSelect ? brokerSelect.value : 'auto';

      if (typeof window.parseCsvByBroker === 'function') {
        const parsed = window.parseCsvByBroker(csvText, selectedBroker);
        const detected = parsed.detected || selectedBroker;

        if (!parsed.rows || parsed.rows.length === 0) {
          showToast(t('quickmodal.csv_no_data'), 'error');
          if (badgeEl) badgeEl.innerHTML = badgeIcon('error');
          if (parsed.errors && parsed.errors.length > 0) {
            const errorHtml = parsed.errors.map(function(e) {
              return '<div>' + logTag('error') + ' — ' + escapeHtml(e) + '</div>';
            }).join('');
            renderCSVLog([errorHtml]);
          }
          return;
        }

        // Parser uyarıları (ör. tarihi okunamayan satırlar) hata listesinin sonunda gösterilir
        const previewNotes = (parsed.errors || []).concat(parsed.warnings || []);
        showBrokerPreview(parsed.rows, detected, previewNotes);
        if (badgeEl) badgeEl.innerHTML = badgeIcon('success');

        csvPreviewData = {
          isBrokerParsed: true,
          parsed: parsed,
          rawText: csvText,
          detected: detected
        };
        syncImportBtn();
        return;
      }

      showToast('CSV parser yüklenemedi', 'error');
    } catch(e) {
      wwLog.warn('CSV okuma hatası:', e);
      showToast(t('quickmodal.error_save', { message: e.message }), 'error');
      const badgeEl = el('quick-csv-badge');
      if (badgeEl) badgeEl.innerHTML = badgeIcon('error');
    }
  }

  async function executeCsvImport() {
    if (isImporting || !csvPreviewData) return;

    await ensureCsvParsers();

    const user = await requireAuth();
    if (!user) {
      showToast(t('quickmodal.error_auth_required'), 'error');
      return;
    }

    if (!window.journal) return;
    await window.journal.ensureActiveJournal(user.id);

    const journalId = window.journal.getActiveJournalId();
    const progressEl = el('quick-csv-status');
    const statusText = el('quick-csv-filename');
    const badge = el('quick-csv-badge');
    const log = [];

    isImporting = true;
    syncImportBtn();
    if (statusText) statusText.textContent = t('quickmodal.csv_processing');
    if (badge) badge.innerHTML = badgeIcon('loading');
    if (progressEl) progressEl.style.display = 'flex';

    let failed = 0;
    let imported = 0;

    try {
      const trades = [];
      let skippedDuplicates = 0;

      // ⭐ Duplicate (Mükerrer İşlem) Önleme - Mevcut defterdeki işlemleri sayfalı çek
      const existingSignatures = new Map();
      try {
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          // Mükerrer kontrolü yalnızca CANLI işlemlerle (backtest aynası gerçek işlemi "mükerrer" yapmasın)
          const { data: existingData, error: fetchErr } = await window.WwTrades.applyScope(
            sb.from('trades')
              .select('symbol, direction, entry_price, exit_price, lot, trade_date')
              .eq('journal_id', journalId),
            'live'
          )
            .order('trade_date', { ascending: false })
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1);

          if (fetchErr) {
            throw fetchErr;
          }

          if (existingData && existingData.length > 0) {
            existingData.forEach(function(et) {
              const sig = (et.symbol || '').toUpperCase() + '|' +
                          (et.direction || '').toUpperCase() + '|' +
                          Number(et.entry_price || 0).toFixed(4) + '|' +
                          (et.exit_price != null ? Number(et.exit_price).toFixed(4) : '') + '|' +
                          Number(et.lot || 0).toFixed(4) + '|' +
                          String(et.trade_date || '').substring(0, 10);
              existingSignatures.set(sig, (existingSignatures.get(sig) || 0) + 1);
            });
            if (existingData.length < pageSize) {
              hasMore = false;
            } else {
              from += pageSize;
            }
          } else {
            hasMore = false;
          }
        }
      } catch (fetchErr) {
        wwLog.error('Mevcut işlemler sorgulanamadı:', fetchErr);
        if (progressEl) progressEl.style.display = 'none';
        if (badge) badge.innerHTML = badgeIcon('error');
        isImporting = false;
        syncImportBtn();
        showToast('Mevcut işlemler yüklenirken hata oluştu: ' + fetchErr.message + '. Yarım veriyle işleme devam edilmedi.', 'error');
        return;
      }

      if (csvPreviewData.isBrokerParsed) {
        const rows = csvPreviewData.parsed.rows || [];
        const sigOccurrences = new Map();

        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          if (!r.symbol || !r.direction || !r.lot || !r.entry_price) {
            log.push('<div>' + logTag('error') + ' — #' + (i + 1) + ' eksik alan</div>');
            failed++;
            continue;
          }

          // Duplicate kontrolü
          const sig = (r.symbol || '').toUpperCase() + '|' +
                      (r.direction || '').toUpperCase() + '|' +
                      Number(r.entry_price || 0).toFixed(4) + '|' +
                      (r.exit_price != null ? Number(r.exit_price).toFixed(4) : '') + '|' +
                      Number(r.lot || 0).toFixed(4) + '|' +
                      String(r.trade_date || '').substring(0, 10);

          if (existingSignatures.get(sig) > 0) {
            existingSignatures.set(sig, existingSignatures.get(sig) - 1);
            skippedDuplicates++;
            log.push('<div>' + logTag('warning') + ' — #' + (i + 1) + ' ' + escapeHtml(r.symbol) + ' (' + (r.trade_date || '-') + ') mükerrer işlem, atlandı.</div>');
            continue;
          }

          const instrument = r.instrument || guessInstrument(r.symbol);
          const multiplier = r.multiplier || MULTIPLIER_MAP[instrument] || 1;

          // ⭐ YENİ: Broker'ın gerçek Net $ değerini sıkıca oku
          let pnl = parseStoredPnl(r.pnl);

          // Broker'ın değeri yoksa entry/exit/lot'tan hesapla (fallback)
          if (pnl === null && r.exit_price != null && r.entry_price) {
            const diff = r.direction === 'LONG'
              ? (r.exit_price - r.entry_price)
              : (r.entry_price - r.exit_price);
            pnl = diff * r.lot * multiplier;
          }

          // Dosyadaki kaçıncı özdeş satır sayacı
          const baseHash = (r.symbol || '').toUpperCase() + '|' +
                           (r.direction || '').toUpperCase() + '|' +
                           Number(r.entry_price || 0).toFixed(4) + '|' +
                           (r.exit_price != null ? Number(r.exit_price).toFixed(4) : '') + '|' +
                           Number(r.lot || 0).toFixed(4) + '|' +
                           String(r.trade_date || '').trim();
          const occ = (sigOccurrences.get(baseHash) || 0) + 1;
          sigOccurrences.set(baseHash, occ);
          const importHash = baseHash + '|' + (r.ticket || r.order_id || r.id || occ);

          const commVal = r.commission != null ? Math.abs(Number(r.commission) || 0) : (r.fee != null ? Math.abs(Number(r.fee) || 0) : 0);
          const swapVal = r.swap != null ? (Number(r.swap) || 0) : 0;
          let grossVal = r.gross_pnl != null ? (Number(r.gross_pnl) || 0) : null;
          if (grossVal == null && pnl != null) {
            grossVal = parseFloat((pnl + commVal - swapVal).toFixed(2));
          }

          trades.push({
            user_id: user.id,
            journal_id: journalId,
            symbol: r.symbol,
            direction: r.direction,
            instrument: instrument,
            lot: r.lot,
            entry_price: r.entry_price,
            exit_price: r.exit_price != null ? r.exit_price : null,
            stop_loss: r.stop_loss != null ? r.stop_loss : null,
            take_profit: r.take_profit != null ? r.take_profit : null,
            trade_date: r.trade_date,
            notes: (r.comment && String(r.comment).trim()) ? String(r.comment).trim() : (r.notes || 'CSV Import'),
            multiplier: multiplier,
            pnl: pnl,
            gross_pnl: grossVal,
            commission: commVal,
            swap: swapVal,
            import_hash: importHash,
          });
        }
      }

      if (trades.length > 0) {
        const chunks = chunkArray(trades, CHUNK_SIZE);
        const totalChunks = chunks.length;

        for (let c = 0; c < totalChunks; c++) {
          if (statusText) {
            statusText.textContent = t('quickmodal.csv_importing') + ' (' + (c + 1) + '/' + totalChunks + ')';
          }
          const { error } = await sb.from('trades').insert(chunks[c]);
          if (error) {
            // DB Unique Kısıtı İhlali veya Kısmi Hata Durumu (kod 23505 veya duplicate)
            const isDuplicateError = error.code === '23505' || (error.message && error.message.toLowerCase().includes('duplicate'));
            if (isDuplicateError) {
              // Chunk'ı tek tek deneyip mükerrerleri atla, geçerlileri ekle
              for (let itemIdx = 0; itemIdx < chunks[c].length; itemIdx++) {
                const item = chunks[c][itemIdx];
                const { error: singleErr } = await sb.from('trades').insert([item]);
                if (singleErr) {
                  if (singleErr.code === '23505' || (singleErr.message && singleErr.message.toLowerCase().includes('duplicate'))) {
                    skippedDuplicates++;
                    log.push('<div>' + logTag('warning') + ' — ' + escapeHtml(item.symbol) + ' (' + (item.trade_date || '-') + ') DB mükerrer kısıtı, atlandı.</div>');
                  } else {
                    log.push('<div>' + logTag('error') + ' — ' + escapeHtml(singleErr.message) + '</div>');
                    failed++;
                  }
                } else {
                  imported++;
                }
              }
            } else {
              log.push('<div>' + logTag('error') + ' — ' + escapeHtml(error.message) + '</div>');
              failed += chunks[c].length;
            }
          } else {
            imported += chunks[c].length;
          }
        }
      }

      renderCSVLog(log);
      if (progressEl) progressEl.style.display = 'none';

      if (imported > 0 && failed === 0) {
        try {
          window.dispatchEvent(new CustomEvent('trade-saved'));
        } catch (evErr) {}
        if (typeof window.refreshOnboardingTasks === 'function') {
          window.refreshOnboardingTasks();
        }
        if (skippedDuplicates > 0) {
          showToast(t('quickmodal.csv_duplicates_skipped', { count: imported, skipped: skippedDuplicates }), 'success');
        } else {
          showToast(t('quickmodal.csv_import_success', { count: imported }), 'success');
        }
      } else if (imported > 0) {
        try {
          window.dispatchEvent(new CustomEvent('trade-saved'));
        } catch (evErr) {}
        if (typeof window.refreshOnboardingTasks === 'function') {
          window.refreshOnboardingTasks();
        }
        showToast(t('quickmodal.csv_import_error', { success: imported, failed: failed }), 'error');
      } else if (skippedDuplicates > 0 && failed === 0) {
        if (statusText) statusText.textContent = t('quickmodal.csv_all_duplicates', { count: skippedDuplicates });
        if (badge) badge.innerHTML = badgeIcon('warning');
        showToast(t('quickmodal.csv_all_duplicates', { count: skippedDuplicates }), 'info');
      } else {
        showToast(t('quickmodal.error_general'), 'error');
      }

      if (imported > 0) {
        const previewContainer = el('csv-preview-container');
        if (previewContainer) previewContainer.style.display = 'none';
        csvPreviewData = null;
        setTimeout(function() {
          closeModal();
          window.location.href = '/trades';
        }, 1500);
      }
    } catch(e) {
      wwLog.warn('CSV import hatası:', e);
      if (progressEl) progressEl.style.display = 'none';
      showToast(t('quickmodal.error_save', { message: e.message }), 'error');
    }

    isImporting = false;
    syncImportBtn();
    if (badge) badge.innerHTML = badgeIcon(failed > 0 ? 'warning' : 'success');
  }

  // ============================================================
  // BULK IMPORT
  // ============================================================

  // Hatalı satırı içeriğiyle göster ("× — #3" yerine "3. satırda geçersiz format: EURUSD,LONG,abc")
  function bulkLineError(idx, raw) {
    var line = String(raw || '').trim();
    if (line.length > 70) line = line.slice(0, 70) + '…';
    return '<div>' + logTag('error') + ' ' + escapeHtml(t('quickmodal.bulk_invalid_format', { line: idx + 1, error: line })) + '</div>';
  }

  function updateBulkCount() {
    var ta = el('quick-bulk-textarea');
    var out = el('quick-bulk-count');
    if (!ta || !out) return;
    var n = ta.value.split('\n').filter(function(l) { return l.trim(); }).length;
    out.textContent = n > 0 ? t('quickmodal.bulk_lines', { count: n }) : '';
  }

  async function handleBulkImport() {
    if (isSubmitting) return;

    const textarea = el('quick-bulk-textarea');
    if (!textarea) return;

    const text = textarea.value.trim();
    if (!text) {
      showToast(t('quickmodal.bulk_required'), 'error');
      return;
    }

    const lines = text.split('\n').filter(function(l) { return l.trim(); });
    if (lines.length === 0) {
      showToast(t('quickmodal.bulk_required'), 'error');
      return;
    }

    const user = await requireAuth();
    if (!user) {
      showToast(t('quickmodal.error_auth_required'), 'error');
      return;
    }

    if (!window.journal) return;
    await window.journal.ensureActiveJournal(user.id);

    const journalId = window.journal.getActiveJournalId();
    const progressEl = el('quick-bulk-progress');
    const statusEl = el('quick-bulk-status');
    const fillEl = el('quick-bulk-fill');
    const logEl = el('quick-bulk-log');
    const errors = [];
    const trades = [];
    const defaultDate = todayIso();

    isSubmitting = true;
    if (progressEl) progressEl.style.display = 'block';
    if (fillEl) fillEl.style.width = '0%';
    if (statusEl) statusEl.textContent = t('quickmodal.bulk_processing');
    if (logEl) { logEl.style.display = 'none'; logEl.innerHTML = ''; }

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const parts = lines[lineIdx].split(',').map(function(p) { return p.trim(); });
      if (parts.length < 5) {
        errors.push(bulkLineError(lineIdx, lines[lineIdx]));
        continue;
      }

      const symbol = parts[0].toUpperCase();
      const finalDir = _qaStrictDir(parts[1]);
      const lot = parseFloat(parts[2]);
      const entry = parseFloat(parts[3]);
      const exit = parseFloat(parts[4]); // yalnızca kapanmış işlemler: çıkış fiyatı zorunlu
      const date = parts[5] ? _qaDate(parts[5]) : defaultDate;
      const notes = parts[6] || 'Bulk import - ' + new Date().toLocaleString();

      if (!symbol || !finalDir || isNaN(lot) || lot <= 0 || isNaN(entry) || isNaN(exit)) {
        errors.push(bulkLineError(lineIdx, lines[lineIdx]));
        continue;
      }

      // Enstrüman ve çarpan sembolden türetilir (eskiden hepsi 'forex'/100000 yazılıyordu;
      // XAUUSD, BTCUSD gibi sembollerde PnL 10^2-10^5 kat şişiyordu). PnL de burada hesaplanıp saklanır.
      const instrument = guessInstrument(symbol);
      const mult = MULTIPLIER_MAP[instrument] || 1;
      const rawPnl = (finalDir === 'LONG' ? 1 : -1) * (exit - entry) * lot * mult;
      const curr = (typeof window.getCurrencySymbol === 'function' ? window.getCurrencySymbol() : '') || localStorage.getItem('ww_currency') || '$';
      const isEurUsdPair = /^EURUSD/.test(symbol.replace(/[^A-Z]/g, ''));
      const grossPnl = parseFloat((((curr === '€' || curr === 'EUR') && isEurUsdPair && exit > 0) ? rawPnl / exit : rawPnl).toFixed(2));

      trades.push({
        user_id: user.id,
        journal_id: journalId,
        symbol: symbol,
        direction: finalDir,
        instrument: instrument,
        lot: lot,
        entry_price: entry,
        exit_price: exit,
        trade_date: date,
        notes: notes || null,
        multiplier: mult,
        gross_pnl: grossPnl,
        commission: 0,
        swap: 0,
        pnl: grossPnl
      });
    }

    if (errors.length > 0) {
      if (logEl) { logEl.style.display = 'block'; logEl.innerHTML = errors.join(''); }
      isSubmitting = false;
      if (progressEl) progressEl.style.display = 'none';
      return;
    }

    if (trades.length === 0) {
      isSubmitting = false;
      if (progressEl) progressEl.style.display = 'none';
      return;
    }

    let success = 0;
    let failed = 0;

    try {
      const chunks = chunkArray(trades, CHUNK_SIZE);
      const totalChunks = chunks.length;

      for (let c = 0; c < totalChunks; c++) {
        if (statusEl) {
          statusEl.textContent = t('quickmodal.bulk_progress', {
            current: success,
            total: trades.length,
            failed: failed
          });
        }
        if (fillEl) fillEl.style.width = (((c + 1) / totalChunks) * 100) + '%';

        const { error } = await sb.from('trades').insert(chunks[c]);
        if (error) {
          errors.push('<div>' + logTag('error') + ' — ' + escapeHtml(error.message) + '</div>');
          failed += chunks[c].length;
        } else {
          success += chunks[c].length;
        }
      }

      if (failed > 0) {
        if (logEl) { logEl.style.display = 'block'; logEl.innerHTML = errors.join(''); }
        if (fillEl) fillEl.style.background = 'var(--red)';
        if (statusEl) statusEl.textContent = t('quickmodal.bulk_error', { success: success, failed: failed });
        showToast(t('quickmodal.bulk_error', { success: success, failed: failed }), 'error');
      } else {
        if (statusEl) statusEl.textContent = t('quickmodal.bulk_complete', { success: success });
        if (fillEl) fillEl.style.background = 'var(--green)';
        showToast(t('quickmodal.bulk_complete', { success: success }), 'success');
        setTimeout(function() {
          closeModal();
          window.location.href = '/trades';
        }, 1500);
      }
    } catch(e) {
      wwLog.warn('Bulk import hatası:', e);
      if (logEl) { logEl.style.display = 'block'; logEl.innerHTML = '<div>' + logTag('error') + ' — ' + escapeHtml(e.message) + '</div>'; }
      showToast(t('quickmodal.error_general'), 'error');
    }

    isSubmitting = false;
    if (progressEl) setTimeout(function() { progressEl.style.display = 'none'; }, 3000);
  }

  function refreshPage() {
    if (typeof loadTrades === 'function') loadTrades();
    if (typeof refresh === 'function') refresh();
    else if (typeof applyFiltersAndSort === 'function') applyFiltersAndSort();
    else setTimeout(function() { window.location.reload(); }, 300);
  }

  // ============================================================
  // SAVE TRADE
  // ============================================================

  async function saveTrade() {
    if (isSubmitting) return;
    if (currentTab !== 'price') return;

    const error = el('quick-add-error');
    const errorText = el('quick-add-error-text');
    const loading = el('quick-add-loading');
    const saveBtn = el('quick-add-save');
    const cancelBtn = el('quick-add-cancel');

    function showError(msg) {
      if (errorText) errorText.textContent = msg;
      else if (error) error.textContent = msg;
      if (error) error.classList.add('active');
    }

    if (error) error.classList.remove('active');

    if (!checkGlobals()) {
      showError(t('quickmodal.error_connection'));
      return;
    }

    const user = await requireAuth();
    if (!user) {
      showError(t('quickmodal.error_auth_required'));
      return;
    }

    if (!window.journal) return;
    await window.journal.ensureActiveJournal(user.id);

    const symbol = el('price-symbol')?.value?.trim()?.toUpperCase() || '';
    const lot = parseFloat(el('price-lot')?.value);
    const entry = parseFloat(el('price-entry')?.value);
    const exit = parseFloat(el('price-exit')?.value) || null;
    const sl = parseFloat(el('price-sl')?.value) || null;
    const tp = parseFloat(el('price-tp')?.value) || null;
    const customMult = parseFloat(el('price-custom-multiplier')?.value);
    const strategyId = el('price-strategy')?.value || null;
    const notes = el('price-notes')?.value || null;
    const instrument = currentInstrument || 'forex';

    const dateInput = el('price-date');
    const date = (dateInput && dateInput.getAttribute('data-iso')) || todayIso();

    let mult = currentMultiplier;
    if (instrument === 'other' && !isNaN(customMult) && customMult > 0) {
      mult = customMult;
    }

    if (!symbol) { showError(t('quickmodal.error_symbol_required')); el('price-symbol')?.focus(); return; }
    if (isNaN(entry) || !entry || entry === 0) { showError(t('quickmodal.error_entry_invalid')); el('price-entry')?.focus(); return; }
    // 'Açık işlem' kavramı yok: çıkış fiyatı zorunlu
    if (!exit || isNaN(exit)) { showError(t('quickmodal.error_exit_invalid')); el('price-exit')?.focus(); return; }
    if (isNaN(lot) || !lot || lot === 0) { showError(t('quickmodal.error_lot_invalid')); el('price-lot')?.focus(); return; }
    if (instrument === 'other' && (isNaN(mult) || mult === 0)) { showError(t('quickmodal.error_multiplier_required')); el('price-custom-multiplier')?.focus(); return; }

    const direction = currentSide === 'BUY' ? 'LONG' : 'SHORT';

    // Komisyon ve Swap
    const commInput = el('price-commission');
    const swapInput = el('price-swap');
    let commission = parseFloat(commInput?.value);
    if (isNaN(commission)) {
      const defCommPerLot = parseFloat(localStorage.getItem('ww_commission_per_lot') || '0');
      commission = defCommPerLot > 0 ? parseFloat((lot * defCommPerLot).toFixed(2)) : 0;
    }
    const swap = parseFloat(swapInput?.value) || 0;

    let calculatedGross = null;
    let calculatedNet = null;
    let calculatedRr = null;

    if (exit && !isNaN(exit)) {
      const dirSign = direction === 'LONG' ? 1 : -1;
      let rawPnl = dirSign * (exit - entry) * lot * (mult || 100000);
      
      const curr = (typeof window.getCurrencySymbol === 'function' ? window.getCurrencySymbol() : '') || localStorage.getItem('ww_currency') || '$';
      const isEurAccount = (curr === '€' || curr === 'EUR');
      if (isEurAccount && /^EURUSD/.test(String(symbol).toUpperCase().replace(/[^A-Z]/g, '')) && exit > 0) {
        calculatedGross = parseFloat((rawPnl / exit).toFixed(2));
      } else {
        calculatedGross = parseFloat(rawPnl.toFixed(2));
      }

      calculatedNet = parseFloat((calculatedGross - commission + swap).toFixed(2));
    }

    if (sl && tp && !isNaN(sl) && !isNaN(tp)) {
      const risk = Math.abs(entry - sl);
      const reward = Math.abs(tp - entry);
      if (risk > 0) calculatedRr = parseFloat((reward / risk).toFixed(2));
    }

    const tradeData = {
      journal_id: window.journal.getActiveJournalId(),
      user_id: user.id,
      symbol: symbol,
      direction: direction,
      instrument: instrument,
      lot: lot,
      entry_price: entry,
      exit_price: exit,
      stop_loss: sl,
      take_profit: tp,
      gross_pnl: calculatedGross,
      commission: commission || 0,
      swap: swap || 0,
      pnl: calculatedNet,
      rr_ratio: calculatedRr,
      trade_date: date,
      strategy_id: strategyId || null,
      notes: notes,
      multiplier: mult || 100000,
      is_quick_entry: false
    };

    isSubmitting = true;
    if (saveBtn) saveBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    if (loading) loading.classList.add('active');
    if (error) error.classList.remove('active');

    try {
      const { error: insertError } = await sb.from('trades').insert([tradeData]);

      if (insertError) {
        wwLog.error('Insert hatası:', insertError);
        showError(t('quickmodal.error_save', { message: insertError.message }));
        return;
      }

      pushRecentSymbol(tradeData.symbol);
      rememberSymbolInstrument(tradeData.symbol, tradeData.instrument, tradeData.multiplier);
      try {
        window.dispatchEvent(new CustomEvent('trade-saved'));
      } catch (evErr) {}
      if (typeof window.refreshOnboardingTasks === 'function') {
        window.refreshOnboardingTasks();
      }

      if (typeof showToast === 'function') {
        showToast(t('quickmodal.success_saved'), 'success');
      }

      closeModal();
      refreshPage();
    } catch (e) {
      wwLog.error('Kaydetme hatası:', e);
      showError(t('quickmodal.error_general'));
    } finally {
      isSubmitting = false;
      if (saveBtn) saveBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
      if (loading) loading.classList.remove('active');
    }
  }

  // ============================================================
  // FAB
  // ============================================================

  function createFab() {
    if (document.getElementById('quick-add-fab')) return;
    try {
      const fab = document.createElement('button');
      fab.id = 'quick-add-fab';
      fab.className = 'quick-add-fab';
      fab.setAttribute('aria-label', 'Add Trade');
      fab.title = 'Add Trade';
      fab.innerHTML = ICONS.plus;
      fab.addEventListener('click', openModal);
      document.body.appendChild(fab);
      wwLog.log('✅ FAB butonu oluşturuldu');
    } catch(e) {
      wwLog.error('FAB oluşturulamadı:', e);
    }
  }

  // ============================================================
  // EVENT LISTENER'LAR
  // ============================================================

  function attachModalEvents() {
    const closeBtn = document.getElementById('quick-add-close');
    const cancelBtn = document.getElementById('quick-add-cancel');
    const overlay = document.getElementById('quick-add-overlay');

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (overlay) {
      overlay.addEventListener('click', function(e) {
        if (e.target === this) closeModal();
      });
    }

    qsa('.quick-tab').forEach(function(btn) {
      btn.addEventListener('click', function() { switchTab(this.dataset.tab); });
    });

    const buyBtn = document.getElementById('price-side-buy');
    const sellBtn = document.getElementById('price-side-sell');
    if (buyBtn) buyBtn.addEventListener('click', function() { setSide('BUY'); });
    if (sellBtn) sellBtn.addEventListener('click', function() { setSide('SELL'); });

    qsa('.lot-preset').forEach(function(btn) {
      btn.addEventListener('click', function() { setLotPreset(this.dataset.lot); });
    });

    const lotInput = document.getElementById('price-lot');
    if (lotInput) {
      lotInput.addEventListener('input', function() {
        const val = parseFloat(this.value);
        if (!isNaN(val)) {
          qsa('.lot-preset').forEach(function(btn) {
            btn.classList.toggle('active', parseFloat(btn.dataset.lot) === val);
          });
        }
        updatePricePreview();
      });
    }

    qsa('.quick-add-instrument-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        selectInstrument(this.dataset.instrument, parseFloat(this.dataset.multiplier) || 1);
      });
    });

    const dateInput = document.getElementById('price-date');
    if (dateInput) {
      dateInput.addEventListener('click', function(e) {
        e.stopPropagation();
        if (datePickerState.isOpen && datePickerTargetInput === this) {
          closeDatePicker();
        } else {
          openDatePicker(this);
        }
      });
    }

    const dpPrev = document.getElementById('qa-dp-prev');
    const dpNext = document.getElementById('qa-dp-next');
    const dpGrid = document.getElementById('qa-dp-grid');
    const dpToday = document.getElementById('qa-dp-today');
    const dpClear = document.getElementById('qa-dp-clear');
    const dpOverlay = document.getElementById('qa-date-picker-overlay');

    if (dpPrev) dpPrev.addEventListener('click', function(e) { e.stopPropagation(); prevMonth(); });
    if (dpNext) dpNext.addEventListener('click', function(e) { e.stopPropagation(); nextMonth(); });

    if (dpGrid) {
      dpGrid.addEventListener('click', function(e) {
        e.stopPropagation();
        const btn = e.target.closest('.qa-dp-day');
        if (btn) {
          const iso = btn.getAttribute('data-date');
          if (iso) selectDate(iso);
        }
      });
    }

    if (dpToday) {
      dpToday.addEventListener('click', function(e) {
        e.stopPropagation();
        selectDate(todayIso());
      });
    }

    if (dpClear) {
      dpClear.addEventListener('click', function(e) {
        e.stopPropagation();
        if (datePickerTargetInput) {
          datePickerTargetInput.value = '';
          datePickerTargetInput.setAttribute('data-iso', '');
        }
        closeDatePicker();
      });
    }

    if (dpOverlay) {
      dpOverlay.addEventListener('click', function(e) {
        e.stopPropagation();
        closeDatePicker();
      });
    }

    const modal = document.querySelector('.quick-add-modal');
    if (modal) {
      modal.addEventListener('click', function(e) {
        if (!datePickerState.isOpen) return;
        const picker = document.getElementById('qa-date-picker');
        const input = document.getElementById('price-date');
        if (picker && e.target.closest('.qa-date-picker')) return;
        if (e.target.closest('.qa-date-input-wrap')) return;
        closeDatePicker();
      });
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        if (datePickerState.isOpen) {
          e.stopPropagation();
          closeDatePicker();
          return;
        }
        const ov = document.getElementById('quick-add-overlay');
        if (ov && ov.classList.contains('active')) {
          closeModal();
        }
      }
    });

    const body = document.querySelector('.quick-add-body');
    if (body) {
      const previewIds = ['price-entry', 'price-exit', 'price-sl', 'price-tp', 'price-lot', 'price-custom-multiplier', 'price-commission', 'price-swap', 'price-symbol'];
      body.addEventListener('input', function(e) {
        const id = e.target.id;
        if (id === 'price-commission') {
          e.target.dataset.userEdited = e.target.value.trim() !== '' ? 'true' : 'false';
        }
        if (id === 'price-lot') {
          syncCommissionWithLot(false);
        }
        if (previewIds.indexOf(id) !== -1) updatePricePreview();
        if (id === 'price-symbol') e.target.value = e.target.value.toUpperCase();
      });
      body.addEventListener('change', function(e) {
        if (e.target.id === 'price-commission') {
          e.target.dataset.userEdited = e.target.value.trim() !== '' ? 'true' : 'false';
        }
        if (e.target.id === 'price-lot') {
          syncCommissionWithLot(false);
        }
        if (previewIds.indexOf(e.target.id) !== -1) updatePricePreview();
      });
    }

    initCommissionPopover();
    initSymbolPicker();
    initAiTab();

    const saveBtn = document.getElementById('quick-add-save');
    if (saveBtn) saveBtn.addEventListener('click', saveTrade);

    const importBtn = document.getElementById('quick-import-btn');
    if (importBtn) importBtn.addEventListener('click', executeCsvImport);

    const bulkBtn = document.getElementById('quick-bulk-btn');
    if (bulkBtn) bulkBtn.addEventListener('click', handleBulkImport);

    const csvSelectBtn = document.getElementById('quick-csv-select');
    const csvFileInput = document.getElementById('quick-csv-file');
    if (csvSelectBtn && csvFileInput) {
      csvSelectBtn.addEventListener('click', function(e) { e.stopPropagation(); csvFileInput.click(); });
      // Bırakma alanının tamamı tıklanabilir (klavyede Enter/Boşluk)
      const dz = document.getElementById('quick-import-dropzone');
      if (dz) {
        dz.addEventListener('click', function() { csvFileInput.click(); });
        dz.addEventListener('keydown', function(e) {
          if (e.target === dz && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); csvFileInput.click(); }
        });
      }
      csvFileInput.addEventListener('change', function() {
        if (this.files && this.files[0]) handleCsvFileSelect(this.files[0]);
      });
    }

    const bulkTa = document.getElementById('quick-bulk-textarea');
    if (bulkTa) bulkTa.addEventListener('input', updateBulkCount);
    const bulkExample = document.getElementById('quick-bulk-example');
    if (bulkExample && bulkTa) {
      bulkExample.addEventListener('click', function() {
        const sample = t('quickmodal.bulk_placeholder');
        bulkTa.value = bulkTa.value.trim() ? bulkTa.value.replace(/\s*$/, '\n') + sample : sample;
        updateBulkCount();
        bulkTa.focus();
      });
    }

    const brokerSelect = document.getElementById('quick-csv-broker');
    if (brokerSelect) {
      brokerSelect.addEventListener('change', function() {
        if (csvFile) handleCsvFileSelect(csvFile);
      });
    }

    const createStrategyBtn = document.getElementById('price-create-strategy');
    if (createStrategyBtn) {
      createStrategyBtn.addEventListener('click', function(e) {
        e.preventDefault();
        window.location.href = '/strategies';
      });
    }

    if (typeof quickI18n !== 'undefined' && typeof quickI18n.onChange === 'function') {
      quickI18n.onChange(function() {
        const di = document.getElementById('price-date');
        if (di) {
          const iso = di.getAttribute('data-iso');
          if (iso) di.value = formatDateDisplay(iso);
        }
        if (datePickerState.isOpen) renderDatePicker();
        renderCommChips();
      });
    }

    if (typeof applyDecimalFix === 'function') {
      try {
        applyDecimalFix(['price-lot', 'price-entry', 'price-exit', 'price-sl', 'price-tp', 'price-custom-multiplier']);
      } catch(e) {}
    }

    attachDragDrop();
  }

  // ============================================================
  // DRAG & DROP
  // ============================================================

  function attachDragDrop() {
    const dropzone = document.getElementById('quick-import-dropzone');
    const overlayRoot = document.getElementById('quick-add-overlay');

    let dragDepth = 0;

    function isFileDrag(e) {
      if (!e.dataTransfer || !e.dataTransfer.types) return false;
      return Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') !== -1;
    }

    function preventFileOpen(e) {
      if (isFileDrag(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    ['dragover', 'drop'].forEach(function(evName) {
      document.addEventListener(evName, preventFileOpen, false);
    });

    if (dropzone) {
      dropzone.addEventListener('dragenter', function(e) {
        if (!isFileDrag(e)) return;
        dragDepth++;
        dropzone.classList.add('qa-dragover');
      });

      dropzone.addEventListener('dragover', function(e) {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      });

      dropzone.addEventListener('dragleave', function(e) {
        if (!isFileDrag(e)) return;
        dragDepth--;
        if (dragDepth <= 0) {
          dragDepth = 0;
          dropzone.classList.remove('qa-dragover');
        }
      });

      dropzone.addEventListener('drop', function(e) {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        dragDepth = 0;
        dropzone.classList.remove('qa-dragover');

        const files = e.dataTransfer && e.dataTransfer.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        const lower = file.name.toLowerCase();
        const ok = /\.(csv|xlsx|xls|htm|html|txt)$/.test(lower);
        if (!ok) {
          if (typeof showToast === 'function') {
            showToast('Desteklenmeyen dosya tipi. CSV, Excel veya HTML yükleyin.', 'error');
          }
          return;
        }

        handleCsvFileSelect(file);
      });
    }

    if (overlayRoot) {
      overlayRoot.addEventListener('transitionend', function() {
        if (!overlayRoot.classList.contains('active') && dropzone) {
          dropzone.classList.remove('qa-dragover');
          dragDepth = 0;
        }
      });
    }
  }

  // ============================================================
  // AI İLE EKLE — ekran görüntüsü ve/veya yazıdan işlem okuma
  // ============================================================
  // Sunucu: supabase/functions/ai-trade-parse (AI koçun günlük hakkını paylaşır, görseli saklamaz, hiçbir şey kaydetmez).
  // Tek işlem → "Fiyattan Hesapla" formu doldurulur, kullanıcı kontrol edip kaydeder.
  // Birden fazla → CSV önizlemesi (mükerrer kontrolü, kayıt ve yönlendirme executeCsvImport'ta).

  const AI_FALLBACK_URL = 'https://odasapyhtdopbnlfhwde.supabase.co';
  const AI_MAX_SIDE = 2000;   // tablo ekran görüntülerinde küçük rakamlar okunabilsin
  const AI_JPEG_Q = 0.88;
  let aiImage = null;         // { mimeType, data (base64), url (önizleme) }
  let aiBusy = false;
  let aiUsage = null;         // { used, limit, premium }

  function aiEndpoint() { const c = window.WW_CONFIG || {}; return window.SUPABASE_URL || c.SUPABASE_URL || AI_FALLBACK_URL; }
  function aiAnonKey() { const c = window.WW_CONFIG || {}; return window.SUPABASE_ANON_KEY || c.SUPABASE_ANON_KEY || ''; }
  function aiLang() {
    const l = (typeof quickI18n !== 'undefined' && quickI18n.currentLang) || localStorage.getItem('ww_language') || 'tr';
    return ['tr', 'en', 'de'].indexOf(l) >= 0 ? l : 'en';
  }
  function aiTz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } }

  // Görsel dosyası → en uzun kenarı AI_MAX_SIDE olan JPEG (base64). Dosya hiçbir yere kaydedilmez.
  function prepareAiImage(file) {
    return new Promise(function(resolve, reject) {
      if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error('type'));
      if (file.size > 25 * 1024 * 1024) return reject(new Error('size'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function() {
        const k = Math.min(1, AI_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const dataUrl = c.toDataURL('image/jpeg', AI_JPEG_Q);
        resolve({ mimeType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1), url: url, name: file.name || '' });
      };
      img.onerror = function() { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  function setAiMsg(html, kind) {
    const m = el('qa-ai-msg');
    if (!m) return;
    if (!html) { m.hidden = true; m.innerHTML = ''; return; }
    m.hidden = false;
    m.className = 'qa-ai-msg' + (kind ? ' is-' + kind : '');
    m.innerHTML = html;
  }

  function syncAiBtn() {
    const btn = el('quick-ai-btn');
    if (!btn) return;
    const text = (el('qa-ai-text')?.value || '').trim();
    btn.disabled = aiBusy || (!aiImage && !text);
    btn.classList.toggle('is-busy', aiBusy);
    const label = btn.querySelector('span');
    if (label) label.textContent = aiBusy ? t('quickmodal.ai_reading') : t('quickmodal.ai_read');
  }

  let aiUsageAsked = false;
  function showAiUsage() {
    const u = el('qa-ai-usage');
    if (!u) return;
    u.textContent = aiUsage && aiUsage.limit ? t('quickmodal.ai_usage', { used: aiUsage.used, limit: aiUsage.limit }) : '';
    // ilk açılışta AI koçla ortak günlük hak (get_ai_usage, migration 202611120002)
    if (!aiUsage && !aiUsageAsked && window.sb && typeof window.sb.rpc === 'function') {
      aiUsageAsked = true;
      window.sb.rpc('get_ai_usage').then(function(r) {
        if (r && r.data && r.data.limit) { aiUsage = r.data; showAiUsage(); }
      }, function() {});
    }
  }

  async function setAiImage(file) {
    try {
      const img = await prepareAiImage(file);
      if (aiImage && aiImage.url) URL.revokeObjectURL(aiImage.url);
      aiImage = img;
      const thumb = el('qa-ai-thumb');
      const tImg = el('qa-ai-thumb-img');
      const tName = el('qa-ai-thumb-name');
      if (tImg) tImg.src = img.url;
      if (tName) tName.textContent = img.name || t('quickmodal.ai_pasted_image');
      if (thumb) thumb.hidden = false;
      el('qa-ai-drop')?.classList.add('has-image');
      setAiMsg('');
    } catch (e) {
      setAiMsg(escapeHtml(t('quickmodal.ai_bad_image')), 'error');
    }
    syncAiBtn();
  }

  function clearAiImage() {
    if (aiImage && aiImage.url) URL.revokeObjectURL(aiImage.url);
    aiImage = null;
    const thumb = el('qa-ai-thumb');
    if (thumb) thumb.hidden = true;
    const tImg = el('qa-ai-thumb-img');
    if (tImg) tImg.removeAttribute('src');
    const fi = el('qa-ai-file');
    if (fi) fi.value = '';
    el('qa-ai-drop')?.classList.remove('has-image', 'qa-dragover');
    syncAiBtn();
  }

  function resetAi() {
    clearAiImage();
    const ta = el('qa-ai-text');
    if (ta) ta.value = '';
    aiBusy = false;
    setAiMsg('');
    syncAiBtn();
  }

  // "YYYY-MM-DD HH:mm" (kaynağın gösterdiği duvar saati) → içe aktarma saat dilimi ayarıyla ISO; sadece tarih aynen kalır
  function aiTradeDate(tr) {
    const s = tr.close_time || tr.open_time;
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (typeof BrokerDictionary !== 'undefined' && BrokerDictionary.parseDate) {
      const d = BrokerDictionary.parseDate(s);
      if (d && !isNaN(d.getTime())) return d.toISOString();
    }
    return s.slice(0, 10);
  }

  // Okunan K/Z fiyatlardan hesaplananla tutuyor mu? Yalnızca USD kotasyonlu forex/altın/kriptoda (çarpan kesin) bakılır.
  function aiPnlMismatch(tr) {
    if (tr.pnl == null || tr.exit == null || tr.lot == null) return null;
    const sym = String(tr.symbol || '');
    const inst = guessInstrument(sym);
    if (['forex', 'gold', 'crypto'].indexOf(inst) < 0 || !/USDT?$/.test(sym)) return null;
    const mult = MULTIPLIER_MAP[inst] || 1;
    const calc = (tr.direction === 'LONG' ? tr.exit - tr.entry : tr.entry - tr.exit) * tr.lot * mult;
    const gross = Math.abs(tr.pnl);
    // komisyon/swap farkına pay bırakılır: %20 ya da 2 birim
    if (Math.abs(calc - tr.pnl) <= Math.max(2, gross * 0.2)) return null;
    return calc;
  }

  function markAiFilled(ids) {
    ids.forEach(function(id) {
      const e = el(id);
      if (!e) return;
      e.classList.add('qa-ai-filled');
      e.addEventListener('input', function off() { e.classList.remove('qa-ai-filled'); e.removeEventListener('input', off); });
    });
  }

  // Tek işlem: formu doldur, kullanıcı kontrol edip kaydetsin
  function fillPriceFormFromAi(tr, note) {
    ['price-entry', 'price-exit', 'price-sl', 'price-tp', 'price-custom-multiplier', 'price-notes'].forEach(function(id) {
      const e = el(id); if (e) e.value = '';
    });
    const qa = document.querySelectorAll('.qa-ai-filled');
    qa.forEach(function(e) { e.classList.remove('qa-ai-filled'); });

    const filled = ['price-symbol', 'price-entry'];
    const sym = el('price-symbol');
    if (sym) sym.value = tr.symbol;
    setSide(tr.direction === 'SHORT' ? 'SELL' : 'BUY');
    instrumentTouched = false;
    // önce sembolün bilinen/kaydedilmiş enstrümanı; tanınmayan sembol "Diğer" olur ve çarpanı kullanıcı girer
    applyInstrumentFor(tr.symbol, true);
    const guessed = guessInstrument(tr.symbol);
    if ((guessed === 'other' || !MULTIPLIER_MAP[guessed]) && currentInstrument !== 'other') selectInstrument('other', 1);
    const multEl = el('price-custom-multiplier');
    const needsMult = currentInstrument === 'other' && !(multEl && parseFloat(multEl.value) > 0);

    const setNum = function(id, v) { const e = el(id); if (e && v != null) { e.value = String(v); filled.push(id); } };
    setNum('price-entry', tr.entry);
    setNum('price-exit', tr.exit);
    setNum('price-sl', tr.sl);
    setNum('price-tp', tr.tp);
    if (tr.lot != null) {
      const lotEl = el('price-lot');
      if (lotEl) { lotEl.value = String(tr.lot); filled.push('price-lot'); }
      qsa('.lot-preset').forEach(function(b) { b.classList.toggle('active', parseFloat(b.dataset.lot) === tr.lot); });
    }
    const comm = el('price-commission');
    if (comm && tr.commission != null) {
      comm.value = String(Math.abs(tr.commission));
      comm.dataset.userEdited = 'true';
      filled.push('price-commission');
    } else {
      syncCommissionWithLot(true);
    }
    if (tr.swap != null) setNum('price-swap', tr.swap);
    const iso = (tr.close_time || tr.open_time || '').slice(0, 10);
    const dateEl = el('price-date');
    if (dateEl && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      dateEl.setAttribute('data-iso', iso);
      dateEl.value = formatDateDisplay(iso);
      filled.push('price-date');
    }
    const notes = el('price-notes');
    if (notes && tr.notes) { notes.value = tr.notes; filled.push('price-notes'); }

    switchTab('price');
    updatePricePreview();
    markAiFilled(filled);

    const hints = [t('quickmodal.ai_filled')];
    if (tr.exit == null) hints.push(t('quickmodal.ai_no_exit'));
    if (tr.lot == null) hints.push(t('quickmodal.ai_no_lot_single'));
    if (needsMult) hints.push(t('quickmodal.ai_check_multiplier'));
    const mm = aiPnlMismatch(tr);
    if (mm != null) hints.push(t('quickmodal.ai_pnl_mismatch', { n: 1, symbol: tr.symbol, pnl: tr.pnl.toFixed(2), calc: mm.toFixed(2) }));
    if (note) hints.push(note);
    showToast(hints.join(' '), hints.length > 1 ? 'info' : 'success');
    const focusId = tr.exit == null ? 'price-exit' : (needsMult ? 'price-custom-multiplier' : null);
    if (focusId) setTimeout(function() { el(focusId)?.focus(); }, 50);
  }

  // Birden fazla işlem: CSV önizlemesine koy, "İçe Aktar" mevcut akışla kaydeder
  function previewManyFromAi(trades, note) {
    const rows = [];
    const notes = [];
    let open = 0, noDate = 0;
    trades.forEach(function(tr, i) {
      if (tr.exit == null) { open++; return; }
      if (tr.lot == null) { notes.push(t('quickmodal.ai_no_lot', { n: i + 1, symbol: tr.symbol })); return; }
      const mm = aiPnlMismatch(tr);
      if (mm != null) notes.push(t('quickmodal.ai_pnl_mismatch', { n: i + 1, symbol: tr.symbol, pnl: tr.pnl.toFixed(2), calc: mm.toFixed(2) }));
      let date = aiTradeDate(tr);
      if (!date) { noDate++; date = todayIso(); }
      rows.push({
        symbol: tr.symbol, direction: tr.direction, lot: tr.lot,
        entry_price: tr.entry, exit_price: tr.exit, stop_loss: tr.sl, take_profit: tr.tp,
        trade_date: date, notes: tr.notes || 'AI', pnl: tr.pnl, gross_pnl: null,
        commission: tr.commission != null ? Math.abs(tr.commission) : 0, swap: tr.swap != null ? tr.swap : 0, ticket: null
      });
    });
    if (open) notes.unshift(t('quickmodal.ai_open_skipped', { count: open }));
    if (noDate) notes.push(t('quickmodal.ai_no_date', { count: noDate }));
    if (note) notes.push(note);

    if (!rows.length) {
      setAiMsg(escapeHtml(notes.join(' ') || t('quickmodal.ai_none')), 'error');
      return;
    }

    csvFile = null;
    switchTab('csv');
    const statusEl = el('quick-csv-status');
    const filenameEl = el('quick-csv-filename');
    const badgeEl = el('quick-csv-badge');
    if (statusEl) statusEl.style.display = 'flex';
    if (filenameEl) filenameEl.textContent = t('quickmodal.ai_found_many', { count: rows.length });
    if (badgeEl) badgeEl.innerHTML = badgeIcon('success');
    renderCSVLog([]);
    showBrokerPreview(rows, 'AI', notes);
    csvPreviewData = { isBrokerParsed: true, parsed: { rows: rows }, rawText: '', detected: 'AI' };
    syncImportBtn();
  }

  async function runAiRead() {
    if (aiBusy) return;
    const text = (el('qa-ai-text')?.value || '').trim();
    if (!aiImage && !text) { setAiMsg(escapeHtml(t('quickmodal.ai_need_input')), 'error'); return; }

    const session = (window.sb && window.sb.auth) ? (await window.sb.auth.getSession().catch(function() { return null; })) : null;
    const token = session && session.data && session.data.session ? session.data.session.access_token : null;
    if (!token) { setAiMsg(escapeHtml(t('quickmodal.ai_login')), 'error'); return; }

    aiBusy = true;
    setAiMsg('');
    syncAiBtn();
    try {
      const body = { text: text, lang: aiLang(), tz: aiTz(), recentSymbols: (recentSymbols || []).slice(0, 12) };
      if (aiImage) body.image = { mimeType: aiImage.mimeType, data: aiImage.data };
      const res = await fetch(aiEndpoint() + '/functions/v1/ai-trade-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': aiAnonKey() },
        body: JSON.stringify(body)
      });
      let j = null;
      try { j = await res.json(); } catch (e) { j = null; }
      if (j && j.usage) { aiUsage = j.usage; showAiUsage(); }
      if (!res.ok || !j || !j.ok) {
        const code = j && j.code;
        const key = code === 'LIMIT' ? 'quickmodal.ai_limit' : code === 'BUSY' ? 'quickmodal.ai_busy'
          : code === 'BAD_IMAGE' || code === 'TOO_LARGE' ? 'quickmodal.ai_bad_image' : code === 'UNAUTHORIZED' ? 'quickmodal.ai_login' : 'quickmodal.ai_error';
        setAiMsg(escapeHtml(t(key)), 'error');
        return;
      }
      const trades = Array.isArray(j.trades) ? j.trades : [];
      if (!trades.length) { setAiMsg(escapeHtml(j.note || t('quickmodal.ai_none')), 'error'); return; }
      if (trades.length === 1) fillPriceFormFromAi(trades[0], j.note);
      else previewManyFromAi(trades, j.note);
    } catch (e) {
      wwLog.warn('AI okuma hatası:', e);
      setAiMsg(escapeHtml(t('quickmodal.ai_error')), 'error');
    } finally {
      aiBusy = false;
      syncAiBtn();
    }
  }

  function initAiTab() {
    const drop = el('qa-ai-drop');
    const fileInput = el('qa-ai-file');
    const pick = el('qa-ai-pick');
    const ta = el('qa-ai-text');
    const btn = el('quick-ai-btn');
    const x = el('qa-ai-thumb-x');
    if (!drop || !fileInput) return;

    if (x) {
      x.title = t('quickmodal.ai_remove_image');
      x.setAttribute('aria-label', t('quickmodal.ai_remove_image'));
      x.addEventListener('click', clearAiImage);
    }
    if (pick) pick.addEventListener('click', function(e) { e.stopPropagation(); fileInput.click(); });
    drop.addEventListener('click', function() { fileInput.click(); });
    drop.addEventListener('keydown', function(e) {
      if (e.target === drop && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); fileInput.click(); }
    });
    fileInput.addEventListener('change', function() { if (this.files && this.files[0]) setAiImage(this.files[0]); });

    let depth = 0;
    const isFiles = function(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0; };
    drop.addEventListener('dragenter', function(e) { if (!isFiles(e)) return; depth++; drop.classList.add('qa-dragover'); });
    drop.addEventListener('dragover', function(e) { if (!isFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    drop.addEventListener('dragleave', function(e) { if (!isFiles(e)) return; if (--depth <= 0) { depth = 0; drop.classList.remove('qa-dragover'); } });
    drop.addEventListener('drop', function(e) {
      if (!isFiles(e)) return;
      e.preventDefault(); e.stopPropagation();
      depth = 0; drop.classList.remove('qa-dragover');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) setAiImage(f);
    });

    // Pencere açıkken panodaki görsel: "Fiyattan Hesapla" ya da AI sekmesindeyken yapıştırınca AI sekmesine alınır
    document.addEventListener('paste', function(e) {
      const overlay = el('quick-add-overlay');
      if (!overlay || !overlay.classList.contains('active')) return;
      if (currentTab !== 'ai' && currentTab !== 'price') return;
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && /^image\//.test(items[i].type)) {
          const f = items[i].getAsFile();
          if (!f) continue;
          e.preventDefault();
          if (currentTab !== 'ai') switchTab('ai');
          setAiImage(f);
          return;
        }
      }
    });

    if (ta) {
      ta.addEventListener('input', syncAiBtn);
      ta.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runAiRead(); }
      });
    }
    if (btn) btn.addEventListener('click', runAiRead);
    syncAiBtn();
  }

  // ============================================================
  // MODAL OLUŞTUR
  // ============================================================

  function createModal() {
    let container = document.getElementById('quick-add-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'quick-add-container';
      document.body.appendChild(container);
    }
    container.innerHTML = getModalHTML();
    attachModalEvents();

    if (typeof quickI18n !== 'undefined' && typeof quickI18n.apply === 'function') {
      try { quickI18n.apply(); } catch(e) {}
    }

    wwLog.log('✅ Quick Add modal oluşturuldu');
  }

  window.quickAddOpen = openModal;
  window.quickAddClose = closeModal;
  // quick-add-boot.js ilk açılışta dosyayı yükleyip modalı hemen kurar (100 ms'lik init beklemeden)
  window.quickAddInit = function() { initQuickAdd(); };

  let initialized = false;

  function initQuickAdd() {
    if (initialized) return;
    initialized = true;

    try { createFab(); } catch(e) { wwLog.error('FAB init hatası:', e); }
    try { createModal(); } catch(e) { wwLog.error('Modal init hatası:', e); }
    try { ensureCsvParsers(); } catch(e) {}

    wwLog.log('✅ Quick Add Modal başlatıldı. (Türkçe broker + inline parser)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(initQuickAdd, 100);
    });
  } else {
    setTimeout(initQuickAdd, 100);
  }
})();

wwLog.log('quick-add.js yüklendi. (inline parser dahil)');