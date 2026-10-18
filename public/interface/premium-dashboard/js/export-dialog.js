// ============================================================
// export-dialog.js - PDF RAPORU DÖNEM SEÇİMİ
// PDF'e tıklayınca açılır: hazır aralıklar (son 7 gün, son 1 ay, son 3 ay, geçen ay,
// bu yıl, tümü) veya elle başlangıç / bitiş tarihi. Seçilen aralıktaki kapanmış işlem
// sayısı ve net K/Z anında gösterilir; "PDF oluştur" raporu o aralıkla üretir.
// Varsayılan: sayfadaki tarih filtresi. Görünüm premium-dashboard.css → .pd-export-*.
// ============================================================

import { formatCurrency, calcTradePnL } from './helpers.js';

function _t(key, fallback) {
  try {
    if (window.i18n && typeof window.i18n.t === 'function') {
      var v = window.i18n.t(key);
      if (v && v !== key) return v;
    }
  } catch (e) {}
  return fallback;
}

function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
  });
}

// Hazır aralıklar: { start, end } gün anahtarları ('YYYY-MM-DD'); null = sınır yok
function presetKeys(id) {
  var W = window.WwTime, today = W.todayKey();
  if (id === '7d') return { start: W.addDays(today, -6), end: today };
  if (id === '1m') return { start: W.addMonths(today, -1), end: today };
  if (id === '3m') return { start: W.addMonths(today, -3), end: today };
  if (id === 'ytd') return { start: today.slice(0, 4) + '-01-01', end: today };
  if (id === 'lastm') {
    var thisMonth = today.slice(0, 7) + '-01';
    return { start: W.addMonths(thisMonth, -1), end: W.addDays(thisMonth, -1) };
  }
  return { start: null, end: null };   // 'all'
}

var PRESETS = [
  ['7d', 'premium_dash.export.p7d', 'Son 7 gün'],
  ['1m', 'premium_dash.export.p1m', 'Son 1 ay'],
  ['3m', 'premium_dash.export.p3m', 'Son 3 ay'],
  ['lastm', 'premium_dash.export.plastm', 'Geçen ay'],
  ['ytd', 'premium_dash.export.pytd', 'Bu yıl'],
  ['all', 'premium_dash.export.pall', 'Tümü']
];

// Sayfadaki filtre → pencerenin ilk seçimi
function initialSelection(page) {
  page = page || {};
  if (page.range === 'week') return { id: '7d' };
  if (page.range === 'month') return { id: '1m' };
  if (page.range === 'year') return { id: 'ytd' };
  if (page.range === 'custom' && page.start && page.end) {
    return { id: 'custom', start: String(page.start).slice(0, 10), end: String(page.end).slice(0, 10) };
  }
  return { id: 'all' };
}

function closedInRange(trades, start, end) {
  return window.WwMetrics.closedTrades(trades || []).filter(function (t) {
    var k = window.WwMetrics.dateKey(t);
    return k && (!start || k >= start) && (!end || k <= end);
  });
}

var overlay = null;

export function closeExportDialog() {
  if (!overlay) return;
  if (overlay._onKey) document.removeEventListener('keydown', overlay._onKey);
  if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  overlay = null;
}

/* opts: {
     getAllTrades: () => tüm işlemler,
     pageRange: { range, start, end }   sayfanın o anki filtresi,
     journalName: string,
     onExport: async (trades, meta) => { ... }   meta = { startKey, endKey, journalName }
   } */
export function openExportDialog(opts) {
  closeExportDialog();
  var sel = initialSelection(opts.pageRange);
  var busy = false;

  overlay = document.createElement('div');
  overlay.className = 'pd-export-overlay';
  overlay.innerHTML =
    '<div class="pd-export-box" role="dialog" aria-modal="true" aria-labelledby="pd-export-title">' +
      '<div class="pd-export-head">' +
        '<div><h3 id="pd-export-title">' + esc(_t('premium_dash.export.title', 'PDF raporu')) + '</h3>' +
        '<p>' + esc(_t('premium_dash.export.desc', 'Raporun kapsayacağı dönemi seç.')) + '</p></div>' +
        '<button type="button" class="pd-export-x" data-act="close" aria-label="' + esc(_t('common.close', 'Kapat')) + '">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="pd-export-body">' +
        '<div class="pd-export-label">' + esc(_t('premium_dash.export.period', 'Dönem')) + '</div>' +
        '<div class="pd-export-presets" role="radiogroup">' +
          PRESETS.map(function (p) {
            return '<button type="button" class="pd-export-chip" role="radio" data-preset="' + p[0] + '">' + esc(_t(p[1], p[2])) + '</button>';
          }).join('') +
        '</div>' +
        '<div class="pd-export-label">' + esc(_t('premium_dash.export.custom', 'Ya da tarihleri kendin seç')) + '</div>' +
        '<div class="pd-export-dates">' +
          '<label><span>' + esc(_t('premium_dash.export.from', 'Başlangıç')) + '</span><input type="date" data-field="start"></label>' +
          '<span class="pd-export-dash">–</span>' +
          '<label><span>' + esc(_t('premium_dash.export.to', 'Bitiş')) + '</span><input type="date" data-field="end"></label>' +
        '</div>' +
        '<div class="pd-export-summary" aria-live="polite"></div>' +
      '</div>' +
      '<div class="pd-export-foot">' +
        '<button type="button" class="pd-export-btn" data-act="close">' + esc(_t('common.cancel', 'İptal')) + '</button>' +
        '<button type="button" class="pd-export-btn primary" data-act="export">' + esc(_t('premium_dash.export.create', 'PDF oluştur')) + '</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  var startIn = overlay.querySelector('[data-field="start"]');
  var endIn = overlay.querySelector('[data-field="end"]');
  var summary = overlay.querySelector('.pd-export-summary');
  var exportBtn = overlay.querySelector('[data-act="export"]');
  var today = window.WwTime.todayKey();
  startIn.max = today;
  endIn.max = today;

  function currentKeys() {
    if (sel.id === 'custom') return { start: sel.start || null, end: sel.end || null };
    return presetKeys(sel.id);
  }

  function refresh() {
    overlay.querySelectorAll('.pd-export-chip').forEach(function (b) {
      var on = b.getAttribute('data-preset') === sel.id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    var k = currentKeys();
    // tarih alanları seçili aralığı gösterir ("Tümü"de boş)
    if (document.activeElement !== startIn) startIn.value = k.start || '';
    if (document.activeElement !== endIn) endIn.value = k.end || '';
    var invalid = k.start && k.end && k.start > k.end;
    var list = invalid ? [] : closedInRange(opts.getAllTrades(), k.start, k.end);
    var net = list.reduce(function (sum, t) { return sum + calcTradePnL(t); }, 0);
    if (invalid) {
      summary.className = 'pd-export-summary warn';
      summary.textContent = _t('premium_dash.export.bad_range', 'Başlangıç tarihi bitişten sonra olamaz.');
    } else if (!list.length) {
      summary.className = 'pd-export-summary warn';
      summary.textContent = _t('premium_dash.export.none', 'Bu aralıkta kapanmış işlem yok.');
    } else {
      summary.className = 'pd-export-summary';
      summary.innerHTML = '<b>' + esc(_t('premium_dash.export.count', '{n} işlem').replace('{n}', list.length)) + '</b>' +
        '<span class="' + (net > 0 ? 'up' : (net < 0 ? 'down' : '')) + '">' + esc(formatCurrency(net)) + '</span>';
    }
    exportBtn.disabled = busy || invalid || !list.length;
    return list;
  }

  function onDateInput() {
    sel = { id: 'custom', start: startIn.value || null, end: endIn.value || null };
    refresh();
  }
  startIn.addEventListener('change', onDateInput);
  endIn.addEventListener('change', onDateInput);

  overlay.addEventListener('click', async function (e) {
    if (e.target === overlay) { if (!busy) closeExportDialog(); return; }
    var chip = e.target.closest('.pd-export-chip');
    if (chip) { sel = { id: chip.getAttribute('data-preset') }; startIn.blur(); endIn.blur(); refresh(); return; }
    var act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.getAttribute('data-act') === 'close') { if (!busy) closeExportDialog(); return; }
    if (act.getAttribute('data-act') === 'export' && !busy) {
      var list = refresh();
      if (!list.length) return;
      var k = currentKeys();
      busy = true;
      exportBtn.disabled = true;
      exportBtn.textContent = _t('premium_dash.export.creating', 'Hazırlanıyor…');
      try {
        await opts.onExport(list, { startKey: k.start, endKey: k.end, journalName: opts.journalName });
        busy = false;
        closeExportDialog();
      } catch (err) {
        busy = false;
        exportBtn.textContent = _t('premium_dash.export.create', 'PDF oluştur');
        refresh();
      }
    }
  });

  overlay._onKey = function (e) { if (e.key === 'Escape' && !busy) closeExportDialog(); };
  document.addEventListener('keydown', overlay._onKey);

  refresh();
  var first = overlay.querySelector('.pd-export-chip.active') || exportBtn;
  try { first.focus({ preventScroll: true }); } catch (e) {}
}
