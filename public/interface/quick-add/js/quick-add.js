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
    symbol:    fi('sembol', 'symbol', 'enstruman', 'parite', 'item'),
    direction: fi('islemacilisyonu', 'islemyonu', 'yon', 'direction', 'side', 'type'),
    date:      fi('kapatmazamani', 'kapaniszamani', 'tarih', 'date', 'time', 'opentime'),
    entry:     fi('girisfiyati', 'entryprice', 'entry', 'giris', 'openprice', 'price'),
    exit:      fi('kapanisfiyati', 'cikisfiyati', 'exitprice', 'exit', 'cikis', 'closeprice'),
    lot:       fi('kapanismiktari', 'miktar', 'lot', 'size', 'volume', 'qty', 'quantity'),
    pnl:       fi('net', 'net$', 'kz', 'kar', 'profit', 'pnl'),
    sl:        fi('sl', 'stoploss', 'zarardurdur'),
    tp:        fi('tp', 'takeprofit', 'karal')
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

    var pnl = null;
    if (idx.pnl >= 0) {
      var pp = _qaNum(v[idx.pnl]);
      if (!isNaN(pp)) pnl = pp;
    }

    rows.push({
      symbol: sym,
      direction: _qaDir(v[idx.direction]),
      lot: lot,
      entry_price: entry,
      exit_price: (exit === null || isNaN(exit)) ? null : exit,
      stop_loss: (sl === null || isNaN(sl)) ? null : sl,
      take_profit: (tp === null || isNaN(tp)) ? null : tp,
      trade_date: _qaDate(v[idx.date]),
      notes: 'CSV Import',
      pnl: pnl
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
// TEMA BAŞLATMA
// ============================================================

(function initQuickAddTheme() {
  try {
    var savedTheme = localStorage.getItem('ww_theme');
    var savedFontSize = localStorage.getItem('ww_font_size');
    var customTheme = localStorage.getItem('ww_custom_theme');

    if (savedTheme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }

    if (savedFontSize) {
      document.body.style.fontSize = savedFontSize + 'px';
    }

    if (savedTheme !== 'light' && customTheme) {
      try {
        var settings = JSON.parse(customTheme);
        var root = document.documentElement;
        if (settings.backgroundColor) root.style.setProperty('--bg', settings.backgroundColor);
        if (settings.surfaceColor) {
          root.style.setProperty('--surface', settings.surfaceColor);
          root.style.setProperty('--surface2', settings.surfaceColor);
        }
        if (settings.borderColor) root.style.setProperty('--border', settings.borderColor);
        if (settings.textColor) root.style.setProperty('--text', settings.textColor);
        if (settings.fontSize) document.body.style.fontSize = settings.fontSize + 'px';
      } catch (e) {}
    }
  } catch (e) {}
})();

// ============================================================
// TEMA DEĞİŞİMİNİ DİNLE
// ============================================================

(function listenQuickAddThemeChanges() {
  function applyThemeFromStorage() {
    try {
      var savedTheme = localStorage.getItem('ww_theme');
      var isLight = savedTheme === 'light';
      document.body.classList.toggle('light-theme', isLight);

      var customTheme = localStorage.getItem('ww_custom_theme');
      if (customTheme && !isLight) {
        try {
          var settings = JSON.parse(customTheme);
          var root = document.documentElement;
          if (settings.backgroundColor) root.style.setProperty('--bg', settings.backgroundColor);
          if (settings.surfaceColor) {
            root.style.setProperty('--surface', settings.surfaceColor);
            root.style.setProperty('--surface2', settings.surfaceColor);
          }
          if (settings.borderColor) root.style.setProperty('--border', settings.borderColor);
          if (settings.textColor) root.style.setProperty('--text', settings.textColor);
          if (settings.fontSize) document.body.style.fontSize = settings.fontSize + 'px';
        } catch (e) {}
      }
    } catch (e) {}
  }

  window.addEventListener('storage', function(e) {
    if (e.key === 'ww_theme' || e.key === 'ww_custom_theme' || e.key === 'ww_font_size') {
      applyThemeFromStorage();
    }
  });

  document.addEventListener('themeChanged', function(e) {
    if (e.detail && e.detail.settings) {
      var settings = e.detail.settings;
      var root = document.documentElement;
      if (settings.backgroundColor) root.style.setProperty('--bg', settings.backgroundColor);
      if (settings.surfaceColor) {
        root.style.setProperty('--surface', settings.surfaceColor);
        root.style.setProperty('--surface2', settings.surfaceColor);
      }
      if (settings.borderColor) root.style.setProperty('--border', settings.borderColor);
      if (settings.textColor) root.style.setProperty('--text', settings.textColor);
      if (settings.fontSize) document.body.style.fontSize = settings.fontSize + 'px';
    }
  });
})();

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
.qa-date-picker { position: fixed; z-index: 10000; background: var(--qa-surface, #111118); border: 1px solid var(--qa-border-strong, rgba(255,255,255,0.12)); border-radius: 14px; padding: 14px; box-shadow: 0 20px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(124,109,250,0.08); width: 300px; font-family: var(--qa-font-body, 'DM Sans', system-ui, sans-serif); color: var(--qa-text, #e8e8f0); opacity: 0; visibility: hidden; transform: translateY(-6px) scale(0.97); transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), visibility 0.18s; pointer-events: none; user-select: none; -webkit-user-select: none; }
.qa-date-picker.open { opacity: 1; visibility: visible; transform: translateY(0) scale(1); pointer-events: auto; }
.qa-date-picker-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--qa-border, rgba(255,255,255,0.06)); }
.qa-dp-nav { width: 32px; height: 32px; flex-shrink: 0; border-radius: 8px; background: transparent; border: 1px solid var(--qa-border, rgba(255,255,255,0.06)); color: var(--qa-muted, #6b6b80); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s ease; padding: 0; }
.qa-dp-nav svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 2; }
.qa-dp-nav:hover { border-color: var(--qa-accent, #7c6dfa); color: var(--qa-accent, #7c6dfa); background: rgba(124,109,250,0.08); }
.qa-dp-nav:active { transform: scale(0.94); }
.qa-dp-title { flex: 1; background: transparent; border: none; color: var(--qa-text, #e8e8f0); font-family: var(--qa-font-heading, 'Syne', inherit); font-weight: 600; font-size: 13px; padding: 6px 10px; border-radius: 8px; cursor: default; text-align: center; }
.qa-date-picker-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; margin-bottom: 4px; }
.qa-dp-weekday { text-align: center; font-size: 10px; font-weight: 600; color: var(--qa-muted, #6b6b80); padding: 6px 0; text-transform: uppercase; letter-spacing: 0.05em; }
.qa-date-picker-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.qa-dp-day { aspect-ratio: 1 / 1; min-height: 34px; border-radius: 8px; background: transparent; border: 1px solid transparent; color: var(--qa-text, #e8e8f0); font-family: inherit; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.12s ease; display: flex; align-items: center; justify-content: center; padding: 0; }
.qa-dp-day:hover { background: rgba(124,109,250,0.12); color: var(--qa-accent-light, #a78bfa); }
.qa-dp-day:active { transform: scale(0.94); }
.qa-dp-day.other-month { color: var(--qa-muted, #6b6b80); opacity: 0.4; }
.qa-dp-day.today { border-color: var(--qa-accent, #7c6dfa); color: var(--qa-accent, #7c6dfa); font-weight: 700; }
.qa-dp-day.selected { background: linear-gradient(135deg, #8b5cf6, #a78bfa); color: #fff; border-color: transparent; box-shadow: 0 4px 12px rgba(139,92,246,0.4); font-weight: 700; }
.qa-dp-day.selected:hover { color: #fff; transform: scale(1.04); }
.qa-date-picker-footer { display: flex; gap: 6px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--qa-border, rgba(255,255,255,0.06)); }
.qa-dp-footer-btn { flex: 1; padding: 7px 10px; border-radius: 8px; background: transparent; border: 1px solid var(--qa-border, rgba(255,255,255,0.06)); color: var(--qa-muted, #6b6b80); font-family: inherit; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.15s ease; }
.qa-dp-footer-btn:hover { border-color: var(--qa-accent, #7c6dfa); color: var(--qa-accent, #7c6dfa); background: rgba(124,109,250,0.06); }
.qa-dp-footer-btn:active { transform: scale(0.96); }
body.light-theme .qa-date-picker { background: #ffffff; border-color: rgba(0,0,0,0.08); box-shadow: 0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(124,109,250,0.06); color: #1a1a2e; }
body.light-theme .qa-date-picker-header { border-bottom-color: rgba(0,0,0,0.06); }
body.light-theme .qa-dp-nav { border-color: rgba(0,0,0,0.08); color: #6b6b80; }
body.light-theme .qa-dp-nav:hover { border-color: #7c6dfa; color: #7c6dfa; background: rgba(124,109,250,0.06); }
body.light-theme .qa-dp-title { color: #1a1a2e; }
body.light-theme .qa-dp-weekday { color: #9999aa; }
body.light-theme .qa-dp-day { color: #1a1a2e; }
body.light-theme .qa-dp-day:hover { background: rgba(124,109,250,0.1); color: #7c6dfa; }
body.light-theme .qa-dp-day.other-month { color: #bbbbcc; }
body.light-theme .qa-dp-day.today { border-color: #7c6dfa; color: #7c6dfa; }
body.light-theme .qa-dp-day.selected { background: linear-gradient(135deg, #7c6dfa, #9b8bfa); color: #fff; border-color: transparent; box-shadow: 0 4px 12px rgba(124,109,250,0.35); }
body.light-theme .qa-date-picker-footer { border-top-color: rgba(0,0,0,0.06); }
body.light-theme .qa-dp-footer-btn { border-color: rgba(0,0,0,0.08); color: #6b6b80; }
body.light-theme .qa-dp-footer-btn:hover { border-color: #7c6dfa; color: #7c6dfa; background: rgba(124,109,250,0.06); }
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
    const s = String(symbol || '').toUpperCase();
    if (/(BTC|ETH|SOL|ADA|XRP|DOGE|BNB|USDT|USDC|LTC|TRX|MATIC|AVAX|DOT|LINK)/.test(s)) return 'crypto';
    if (/(XAU|GOLD|XAG|SILVER)/.test(s)) return 'gold';
    if (/(US30|NAS|NAS100|SPX|SP500|DAX|UK100|JP225|USTEC|GER40|FRA40)/.test(s)) return 'index';
    if (/^[A-Z]{6}$/.test(s)) return 'forex';
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
    chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
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
      iso = isoDate(new Date());
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
    const today = isoDate(new Date());
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
                      <input type="text" id="price-symbol" placeholder="EURUSD" style="text-transform:uppercase;" autofocus>
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
                      <label data-quick-i18n="quickmodal.lot">Lot *</label>
                      <div class="quick-add-lot-wrap">
                        <input type="text" inputmode="decimal" id="price-lot" placeholder="0.10" value="1.00">
                        <div class="lot-presets">
                          <button class="lot-preset" data-lot="0.01">0.01</button>
                          <button class="lot-preset" data-lot="0.10">0.10</button>
                          <button class="lot-preset active" data-lot="1.00">1.00</button>
                        </div>
                      </div>
                    </div>
                    <div class="quick-add-field">
                      <label data-quick-i18n="quickmodal.strategy">Strateji</label>
                      <div class="quick-add-strategy-wrap">
                        <select id="price-strategy">
                          <option value="" data-quick-i18n="quickmodal.no_strategy">— Strateji Yok —</option>
                        </select>
                        <button class="create-strategy-btn" id="price-create-strategy" title="+">${ICONS.plus}</button>
                      </div>
                    </div>
                  </div>

                  <div class="quick-add-row">
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
                    <div class="quick-add-field quick-add-notes">
                      <label data-quick-i18n="quickmodal.notes">Notlar</label>
                      <textarea id="price-notes" rows="1" data-quick-i18n-placeholder="quickmodal.notes_placeholder" placeholder="Notlar…"></textarea>
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

                  <!-- Canlı Hesaplama Önizleme Kartı -->
                  <div class="quick-add-preview visible" id="price-preview">
                    <div class="preview-rail"></div>

                    <div class="preview-items-row">
                      <div class="preview-item">
                        <span class="p-label" data-quick-i18n="quickmodal.estimated_pnl">Tahmini K/Z</span>
                        <span class="p-val" id="preview-pnl">—</span>
                      </div>
                      <div class="preview-divider"></div>
                      <div class="preview-item">
                        <span class="p-label" data-quick-i18n="quickmodal.risk_reward">Risk / Reward</span>
                        <span class="p-val accent" id="preview-rr">—</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="quick-tab-content" id="tab-csv">
              <div class="quick-import-area" id="quick-import-dropzone">
                <div class="qa-drop-hint" data-quick-i18n="quickmodal.csv_drop_hint">📁 Dosyayı buraya bırak</div>

                <div class="quick-import-icon">${ICONS.fileLarge}</div>
                <p data-quick-i18n="quickmodal.csv_import_desc">MT4/MT5, cTrader, Binance veya Excel dışa aktarım dosyanızı yükleyin</p>

                <div class="quick-add-field" style="text-align:left; margin-top:0.9rem; margin-bottom:0.75rem;">
                  <label data-quick-i18n="quickmodal.broker_format">Broker Formatı</label>
                  <select id="quick-csv-broker">
                    <option value="auto" data-quick-i18n="quickmodal.broker_auto">🔍 Otomatik Algıla</option>
                    <option value="turkish" data-quick-i18n="quickmodal.broker_turkish">Türkçe Broker</option>
                    <option value="mt5">MetaTrader 4/5</option>
                    <option value="ctrader">cTrader</option>
                    <option value="binance">Binance</option>
                    <option value="bybit">Bybit</option>
                    <option value="coinbase">Coinbase</option>
                    <option value="generic" data-quick-i18n="quickmodal.broker_generic">Genel Format</option>
                  </select>
                </div>

                <button class="quick-import-btn" id="quick-csv-select">${ICONS.upload}<span data-quick-i18n="quickmodal.csv_choose_file">Dosya Seç</span></button>
                <input type="file" id="quick-csv-file" accept=".csv,.xlsx,.xls,.htm,.html,.txt" style="display:none;">

                <div class="quick-import-status" id="quick-csv-status" style="display:none;">
                  <span class="status-text" id="quick-csv-filename"></span>
                  <span class="status-badge" id="quick-csv-badge"></span>
                </div>

                <div class="quick-import-log" id="quick-csv-log" style="display:none;"></div>
                <div id="csv-preview-container" style="display:none;"></div>
              </div>
            </div>

            <div class="quick-tab-content" id="tab-bulk">
              <div class="quick-bulk-area">
                <p style="font-size:12px;color:var(--muted);margin-bottom:0.5rem;" data-quick-i18n="quickmodal.bulk_desc">Her satıra bir işlem gelecek şekilde girin:</p>
                <div style="font-size:11px;font-family:'DM Mono',monospace;color:var(--muted);background:var(--surface2);padding:6px 10px;border-radius:6px;margin-bottom:0.75rem;">
                  <span data-quick-i18n="quickmodal.bulk_format">sembol,yön,lot,giriş,çıkış,tarih,not</span><br>
                  <span data-quick-i18n="quickmodal.bulk_example">EURUSD,LONG,0.10,1.08500,1.09000,2026-01-15,İlk işlem</span>
                </div>
                <textarea id="quick-bulk-textarea" rows="6" data-quick-i18n-placeholder="quickmodal.bulk_placeholder" placeholder="EURUSD,LONG,0.10,1.08500,1.09000,2026-01-15,İlk işlem"></textarea>
                <div class="quick-bulk-progress" id="quick-bulk-progress" style="display:none;">
                  <span id="quick-bulk-status"></span>
                  <div class="quick-bulk-bar"><div class="quick-bulk-fill" id="quick-bulk-fill"></div></div>
                </div>
                <div class="quick-bulk-log" id="quick-bulk-log" style="display:none;"></div>
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

  function getMultiplier() {
    if (currentInstrument === 'other') {
      const customEl = el('price-custom-multiplier');
      const v = customEl ? parseFloat(customEl.value) : null;
      return isNaN(v) ? null : v;
    }
    return currentMultiplier || 1;
  }

  function updatePricePreview() {
    const entry = parseFloat(el('price-entry')?.value);
    const exit = parseFloat(el('price-exit')?.value);
    const lot = parseFloat(el('price-lot')?.value);
    const sl = parseFloat(el('price-sl')?.value);
    const tp = parseFloat(el('price-tp')?.value);
    const dir = currentSide === 'BUY' ? 'LONG' : 'SHORT';
    const mult = getMultiplier();

    const previewEl = el('price-preview');
    const pnlEl = el('preview-pnl');
    const rrEl = el('preview-rr');

    let hasPnl = false;
    let hasRr = false;
    let pnlSign = 0;

    if (entry && lot && !isNaN(entry) && !isNaN(lot) && mult !== null) {
      if (exit && !isNaN(exit)) {
        try {
          let pnl = 0;
          if (typeof calcPnL === 'function') {
            pnl = calcPnL(entry, exit, lot, dir, 'other', mult);
          } else {
            const direction = (dir && (dir.toUpperCase() === 'LONG' || dir.toUpperCase() === 'BUY')) ? 1 : -1;
            pnl = direction * (parseFloat(exit) - parseFloat(entry)) * parseFloat(lot) * mult;
          }
          if (pnlEl && typeof formatCurrency === 'function') {
            pnlEl.textContent = formatCurrency(pnl);
            pnlEl.className = 'p-val' + (pnl >= 0 ? ' pos' : ' neg');
          }
          pnlSign = pnl >= 0 ? 1 : -1;
          hasPnl = true;
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
    loadStrategies();

    if (typeof quickI18n !== 'undefined' && typeof quickI18n.apply === 'function') {
      quickI18n.apply();
    }

    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

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

    const loading = el('quick-add-loading');
    if (loading) loading.classList.remove('active');

    csvFile = null;
    const fileInput = el('quick-csv-file');
    if (fileInput) fileInput.value = '';

    const previewContainer = el('csv-preview-container');
    if (previewContainer) previewContainer.style.display = 'none';

    const dropzone = el('quick-import-dropzone');
    if (dropzone) dropzone.classList.remove('qa-dragover');
  }

  function resetForm() {
    const today = isoDate(new Date());
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

    if (saveBtn) saveBtn.style.display = (tab === 'csv' || tab === 'bulk') ? 'none' : '';
    if (importBtn) importBtn.style.display = (tab === 'csv') ? '' : 'none';
    if (bulkBtn) bulkBtn.style.display = (tab === 'bulk') ? '' : 'none';

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
    updatePricePreview();
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

  function showBrokerPreview(rows, detected, errors) {
    const container = el('csv-preview-container');
    if (!container) return;

    container.style.display = 'block';
    let html = '<div style="margin-top:12px;padding:12px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);text-align:left;">';

    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;flex-wrap:wrap;">';
    html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">';
    html += '<span style="font-size:13px;font-weight:600;">' + escapeHtml(t('quickmodal.csv_import_title') || 'İçe Aktarılacak') + '</span>';
    html += '<span style="font-size:10px;font-family:monospace;padding:2px 8px;border-radius:12px;background:rgba(124,109,250,0.15);color:var(--accent2);border:1px solid rgba(124,109,250,0.25);letter-spacing:0.05em;">';
    html += escapeHtml(String(detected || 'unknown').toUpperCase());
    html += '</span>';
    html += '<span style="font-size:11px;color:var(--muted);font-family:monospace;">' + rows.length + ' kayıt</span>';
    html += '</div>';
    html += '<button class="btn btn-primary" id="csv-confirm-import" style="font-size:12px;padding:4px 12px;display:inline-flex;align-items:center;gap:4px;">' + ICONS.check + '<span>' + escapeHtml(t('quickmodal.import') || 'İçe Aktar') + '</span></button>';
    html += '</div>';

    if (errors && errors.length > 0) {
      html += '<div style="font-size:11px;color:var(--red);background:rgba(239,68,68,0.06);padding:6px 10px;border-radius:6px;margin-bottom:8px;border:1px solid rgba(239,68,68,0.15);font-family:monospace;">';
      errors.slice(0, 3).forEach(function(e) {
        html += '<div>⚠️ ' + escapeHtml(e) + '</div>';
      });
      if (errors.length > 3) {
        html += '<div>' + escapeHtml(t('quickmodal.more_errors', { count: errors.length - 3 })) + '</div>';
      }
      html += '</div>';
    }

    html += '<div style="overflow-x:auto;max-height:220px;overflow-y:auto;font-size:11px;border-radius:6px;border:1px solid var(--border);">';
    html += '<table style="width:100%;border-collapse:collapse;font-family:\'DM Mono\',monospace;">';
    html += '<thead><tr style="background:var(--surface);position:sticky;top:0;z-index:1;">';
    ['Symbol', 'Side', 'Lot', 'Entry', 'Exit', 'P&L', 'Date'].forEach(function(h) {
      html += '<th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border);font-weight:600;color:var(--muted);font-size:10px;letter-spacing:0.05em;">' + h + '</th>';
    });
    html += '</tr></thead><tbody>';

    rows.slice(0, 30).forEach(function(r) {
      const dirColor = r.direction === 'LONG' ? 'var(--green)' : 'var(--red)';
      html += '<tr>';
      html += '<td style="padding:5px 8px;border-bottom:1px solid var(--border);font-weight:600;">' + escapeHtml(r.symbol) + '</td>';
      html += '<td style="padding:5px 8px;border-bottom:1px solid var(--border);color:' + dirColor + ';font-weight:600;">' + escapeHtml(r.direction) + '</td>';
      html += '<td style="padding:5px 8px;border-bottom:1px solid var(--border);">' + (r.lot != null ? r.lot : '—') + '</td>';
      html += '<td style="padding:5px 8px;border-bottom:1px solid var(--border);">' + (r.entry_price || '—') + '</td>';
      html += '<td style="padding:5px 8px;border-bottom:1px solid var(--border);color:var(--muted);">' + (r.exit_price != null ? r.exit_price : '—') + '</td>';

      var pnlDisplay = '—';
      var pnlColor = 'var(--muted)';
      if (r.pnl != null && !isNaN(r.pnl)) {
        var pnlNum = parseFloat(r.pnl);
        pnlDisplay = (pnlNum >= 0 ? '+' : '') + pnlNum.toFixed(2);
        pnlColor = pnlNum >= 0 ? 'var(--green)' : 'var(--red)';
      }
      html += '<td style="padding:5px 8px;border-bottom:1px solid var(--border);color:' + pnlColor + ';font-weight:600;">' + pnlDisplay + '</td>';

      html += '<td style="padding:5px 8px;border-bottom:1px solid var(--border);color:var(--muted);">' + escapeHtml(r.trade_date) + '</td>';
      html += '</tr>';
    });

    if (rows.length > 30) {
      html += '<tr><td colspan="7" style="padding:8px;text-align:center;color:var(--muted);">+ve ' + (rows.length - 30) + ' kayıt daha</td></tr>';
    }
    html += '</tbody></table></div></div>';

    container.innerHTML = html;

    const confirmBtn = el('csv-confirm-import');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', function() {
        executeCsvImport();
      });
    }
  }

  function showCsvPreview(rows, headers) {
    const container = el('csv-preview-container');
    if (!container) return;

    container.style.display = 'block';
    let html = '<div style="margin-top:12px;padding:12px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
    html += '<span style="font-size:13px;font-weight:600;">' + escapeHtml(t('quickmodal.csv_import_title')) + ' (' + rows.length + ')</span>';
    html += '<button class="btn btn-primary" id="csv-confirm-import" style="font-size:12px;padding:4px 12px;display:inline-flex;align-items:center;gap:4px;">' + ICONS.check + '<span>' + escapeHtml(t('quickmodal.import')) + '</span></button>';
    html += '</div>';
    html += '<div style="overflow-x:auto;max-height:200px;overflow-y:auto;font-size:12px;">';
    html += '<table style="width:100%;border-collapse:collapse;font-family:\'DM Mono\',monospace;">';

    html += '<thead><tr style="background:var(--surface);">';
    headers.forEach(function(h) {
      html += '<th style="padding:4px 8px;text-align:left;border-bottom:1px solid var(--border);">' + escapeHtml(h) + '</th>';
    });
    html += '</tr></thead><tbody>';

    const displayRows = rows.slice(0, 10);
    displayRows.forEach(function(row) {
      html += '<tr>';
      row.forEach(function(cell) {
        html += '<td style="padding:4px 8px;border-bottom:1px solid var(--border);">' + escapeHtml(String(cell || '')) + '</td>';
      });
      html += '</tr>';
    });
    if (rows.length > 10) {
      html += '<tr><td colspan="' + headers.length + '" style="padding:8px;text-align:center;color:var(--muted);">+' + (rows.length - 10) + '</td></tr>';
    }
    html += '</tbody></table></div></div>';

    container.innerHTML = html;

    const confirmBtn = el('csv-confirm-import');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', function() {
        executeCsvImport();
      });
    }
  }

  async function handleCsvFileSelect(file) {
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

        showBrokerPreview(parsed.rows, detected, parsed.errors);
        if (badgeEl) badgeEl.innerHTML = badgeIcon('success');

        csvPreviewData = {
          isBrokerParsed: true,
          parsed: parsed,
          rawText: csvText,
          detected: detected
        };
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
          const { data: existingData, error: fetchErr } = await sb
            .from('trades')
            .select('symbol, direction, entry_price, exit_price, lot, trade_date')
            .eq('journal_id', journalId)
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

          const instrument = guessInstrument(r.symbol);
          const multiplier = MULTIPLIER_MAP[instrument] || 1;

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
            notes: r.notes || 'CSV Import',
            multiplier: multiplier,
            pnl: pnl,
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
          window.location.href = 'trades.html';
        }, 1500);
      }
    } catch(e) {
      wwLog.warn('CSV import hatası:', e);
      if (progressEl) progressEl.style.display = 'none';
      showToast(t('quickmodal.error_save', { message: e.message }), 'error');
    }

    isImporting = false;
    if (badge) badge.innerHTML = badgeIcon(failed > 0 ? 'warning' : 'success');
  }

  // ============================================================
  // BULK IMPORT
  // ============================================================

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
    const defaultDate = new Date().toISOString().split('T')[0];

    isSubmitting = true;
    if (progressEl) progressEl.style.display = 'block';
    if (fillEl) fillEl.style.width = '0%';
    if (statusEl) statusEl.textContent = t('quickmodal.bulk_processing');
    if (logEl) { logEl.style.display = 'none'; logEl.innerHTML = ''; }

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const parts = lines[lineIdx].split(',').map(function(p) { return p.trim(); });
      if (parts.length < 5) {
        errors.push('<div>' + logTag('error') + ' — #' + (lineIdx + 1) + '</div>');
        continue;
      }

      const symbol = parts[0].toUpperCase();
      const direction = parts[1].toUpperCase();
      const lot = parseFloat(parts[2]);
      const entry = parseFloat(parts[3]);
      const exit = parts[4] ? parseFloat(parts[4]) : null;
      const date = parts[5] ? _qaDate(parts[5]) : defaultDate;
      const notes = parts[6] || 'Bulk import - ' + new Date().toLocaleString();

      if (!symbol || !direction || isNaN(lot) || isNaN(entry)) {
        errors.push('<div>' + logTag('error') + ' — #' + (lineIdx + 1) + '</div>');
        continue;
      }

      let finalDir = 'SHORT';
      if (direction === 'BUY' || direction === 'LONG') finalDir = 'LONG';

      trades.push({
        user_id: user.id,
        journal_id: journalId,
        symbol: symbol,
        direction: finalDir,
        instrument: 'forex',
        lot: lot,
        entry_price: entry,
        exit_price: exit,
        trade_date: date,
        notes: notes || null,
        multiplier: 100000
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
          window.location.href = 'trades.html';
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
    const date = (dateInput && dateInput.getAttribute('data-iso')) || isoDate(new Date());

    let mult = currentMultiplier;
    if (instrument === 'other' && !isNaN(customMult) && customMult > 0) {
      mult = customMult;
    }

    if (!symbol) { showError(t('quickmodal.error_symbol_required')); el('price-symbol')?.focus(); return; }
    if (isNaN(entry) || !entry || entry === 0) { showError(t('quickmodal.error_entry_invalid')); el('price-entry')?.focus(); return; }
    if (isNaN(lot) || !lot || lot === 0) { showError(t('quickmodal.error_lot_invalid')); el('price-lot')?.focus(); return; }
    if (instrument === 'other' && (isNaN(mult) || mult === 0)) { showError(t('quickmodal.error_multiplier_required')); el('price-custom-multiplier')?.focus(); return; }

    const direction = currentSide === 'BUY' ? 'LONG' : 'SHORT';

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
      pnl: null,
      rr_ratio: null,
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
        selectDate(isoDate(new Date()));
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
      const previewIds = ['price-entry', 'price-exit', 'price-sl', 'price-tp', 'price-lot', 'price-custom-multiplier'];
      body.addEventListener('input', function(e) {
        const id = e.target.id;
        if (previewIds.indexOf(id) !== -1) updatePricePreview();
        if (id === 'price-symbol') e.target.value = e.target.value.toUpperCase();
      });
      body.addEventListener('change', function(e) {
        if (previewIds.indexOf(e.target.id) !== -1) updatePricePreview();
      });
    }

    const saveBtn = document.getElementById('quick-add-save');
    if (saveBtn) saveBtn.addEventListener('click', saveTrade);

    const importBtn = document.getElementById('quick-import-btn');
    if (importBtn) importBtn.addEventListener('click', executeCsvImport);

    const bulkBtn = document.getElementById('quick-bulk-btn');
    if (bulkBtn) bulkBtn.addEventListener('click', handleBulkImport);

    const csvSelectBtn = document.getElementById('quick-csv-select');
    const csvFileInput = document.getElementById('quick-csv-file');
    if (csvSelectBtn && csvFileInput) {
      csvSelectBtn.addEventListener('click', function() { csvFileInput.click(); });
      csvFileInput.addEventListener('change', function() {
        if (this.files && this.files[0]) handleCsvFileSelect(this.files[0]);
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
        window.location.href = '/strategies.html';
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