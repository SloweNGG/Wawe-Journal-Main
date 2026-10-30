// ============================================================
// pdf-report.js - PERFORMANS RAPORU (PDF)
// Seçilen dönemin kapanmış işlemlerinden çok sayfalı bir rapor üretir:
// başlık + dönem, 8 metrik kartı, kümülatif K/Z grafiği, sembol / yön / ay kırılımı
// ve tüm işlemlerin listesi (sayfalara bölünür). Uygulamayla aynı görünüm: siyah zemin,
// nötr çizgiler, DM Sans. Türkçe karakterler için DM Sans TTF gömülür (/fonts/pdf);
// yüklenemezse Helvetica'ya düşülür ve ş/ğ/ı gibi harfler sadeleştirilir.
// Metrikler ortak modülden gelir (interface/shared/trade-metrics.js — testli).
// ============================================================

import { calcTradePnL, formatCurrency, getCurrencySymbol } from './helpers.js';

function _t(key, fallback) {
  try {
    if (window.i18n && typeof window.i18n.t === 'function') {
      var v = window.i18n.t(key);
      if (v && v !== key) return v;
    }
  } catch (e) {}
  return fallback;
}

function currentLang() {
  try {
    if (window.i18n && typeof window.i18n.getCurrentLanguage === 'function') return window.i18n.getCurrentLanguage();
  } catch (e) {}
  return 'tr';
}

// ---- renkler (RGB) ----
var C = {
  bg: [0, 0, 0],
  card: [10, 10, 12],
  row: [7, 7, 9],
  line: [34, 34, 40],
  text: [232, 232, 240],
  muted: [138, 138, 154],
  up: [34, 197, 94],
  down: [239, 68, 68]
};
var M = 14;   // kenar boşluğu (mm)

// ---- font ----
var fontCache = null;   // { regular, bold } base64; false = yüklenemedi

function toBase64(buf) {
  var bytes = new Uint8Array(buf), bin = '', CHUNK = 0x8000;
  for (var i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

async function loadFonts() {
  if (fontCache !== null) return fontCache;
  try {
    var bufs = await Promise.all(['Regular', 'Bold'].map(function (w) {
      return fetch('/fonts/pdf/DMSans-' + w + '.ttf').then(function (r) {
        if (!r.ok) throw new Error('font ' + r.status);
        return r.arrayBuffer();
      });
    }));
    fontCache = { regular: toBase64(bufs[0]), bold: toBase64(bufs[1]) };
  } catch (e) {
    fontCache = false;
  }
  return fontCache;
}

function useFonts(doc, f) {
  if (!f) return 'helvetica';
  doc.addFileToVFS('DMSans-Regular.ttf', f.regular);
  doc.addFont('DMSans-Regular.ttf', 'DMSans', 'normal');
  doc.addFileToVFS('DMSans-Bold.ttf', f.bold);
  doc.addFont('DMSans-Bold.ttf', 'DMSans', 'bold');
  return 'DMSans';
}

// DM Sans'ta ₺ yok; Helvetica'da ş/ğ/ı/İ yok
function makeText(embedded) {
  var plain = { 'ş': 's', 'Ş': 'S', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I' };
  return function (s) {
    s = String(s === null || s === undefined ? '' : s).replace(/₺/g, 'TL ').replace(/−/g, '-');
    return embedded ? s : s.replace(/[şŞğĞıİ]/g, function (ch) { return plain[ch]; });
  };
}

// ---- yardımcılar ----
function money(v) { return formatCurrency(v); }
function moneyPlain(v) { return formatCurrency(v).replace(/^\+/, ''); }
function compactMoney(v) {
  var sym = getCurrencySymbol();
  var a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1e6) return s + sym + (a / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (a >= 1e3) return s + sym + (a / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return s + sym + Math.round(a);
}
function pct(v) { return (Number(v) || 0).toFixed(1) + '%'; }
function tone(v) { return v > 0 ? C.up : (v < 0 ? C.down : C.text); }
function fmtDay(key, lang) {
  return key ? window.WwTime.formatDate(key, lang, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function groupBy(closed, keyFn) {
  var map = {}, order = [];
  closed.forEach(function (t) {
    var k = keyFn(t);
    if (!map[k]) { map[k] = { key: k, n: 0, wins: 0, pnl: 0 }; order.push(k); }
    var pnl = calcTradePnL(t);
    map[k].n++;
    map[k].pnl += pnl;
    if (pnl > 0) map[k].wins++;
  });
  return order.map(function (k) { return map[k]; });
}

/* Raporu oluşturup indirir.
   trades: dönemin işlemleri (açık olanlar rapora girmez)
   meta: { startKey, endKey, journalName, strategies } — startKey null ise ilk işlemden başlar;
   strategies ({ id: ad }) verilir ve en az bir işlemde strateji varsa strateji kırılımı ve kolonu eklenir */
export async function buildPerformanceReport(trades, meta) {
  meta = meta || {};
  if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF.API.autoTable) {
    if (typeof window.loadJsPDF === 'function') await window.loadJsPDF(true);
  }
  if (typeof window.jspdf === 'undefined') throw new Error('jspdf');

  var fonts = await loadFonts();
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  var FONT = useFonts(doc, fonts);
  var T = makeText(!!fonts);
  var W = doc.internal.pageSize.getWidth();
  var H = doc.internal.pageSize.getHeight();
  var lang = currentLang();

  var closed = window.WwMetrics.chronological(trades || []);
  var s = window.WwMetrics.summarize(closed);
  var pnls = closed.map(calcTradePnL);
  var firstKey = closed.length ? window.WwMetrics.dateKey(closed[0]) : null;
  var lastKey = closed.length ? window.WwMetrics.dateKey(closed[closed.length - 1]) : null;
  var startKey = meta.startKey || firstKey;
  var endKey = meta.endKey || lastKey;
  var periodText = fmtDay(startKey, lang) + ' – ' + fmtDay(endKey, lang);
  var stratNames = meta.strategies || {};
  var stratOf = function (t) { return t.strategy_id && stratNames[t.strategy_id] ? stratNames[t.strategy_id] : null; };
  var hasStrategies = closed.some(stratOf);

  function fill(c) { doc.setFillColor(c[0], c[1], c[2]); }
  function color(c) { doc.setTextColor(c[0], c[1], c[2]); }
  function draw(c) { doc.setDrawColor(c[0], c[1], c[2]); }
  function font(style, size) { doc.setFont(FONT, style); doc.setFontSize(size); }
  function paintBg() { fill(C.bg); doc.rect(0, 0, W, H, 'F'); }
  function text(str, x, y, opts) { doc.text(T(str), x, y, opts); }
  function sectionTitle(str, x, y) { font('bold', 10); color(C.text); text(str, x, y); }
  function newPage() { doc.addPage(); paintBg(); return 18; }

  // ---------- başlık ----------
  paintBg();
  font('bold', 7.5); color(C.muted);
  text('WAWE JOURNAL', M, 16, { charSpace: 0.6 });
  font('normal', 7.5);
  text(_t('analytics_dash.report.generated', 'Oluşturulma') + ' ' + fmtDay(window.WwTime.todayKey(), lang), W - M, 16, { align: 'right' });
  font('bold', 21); color(C.text);
  text(_t('analytics_dash.report.title', 'Performans Raporu'), M, 27);
  font('normal', 9.5); color(C.muted);
  text((meta.journalName ? meta.journalName + '   ·   ' : '') + periodText, M, 34);
  draw(C.line); doc.setLineWidth(0.25); doc.line(M, 39, W - M, 39);

  // ---------- metrik kartları (4 x 2) ----------
  var best = pnls.length ? Math.max.apply(null, pnls) : 0;
  var worst = pnls.length ? Math.min.apply(null, pnls) : 0;
  var pf = window.WwMetrics.formatProfitFactor(s.profitFactor);
  var payoff = window.WwMetrics.formatProfitFactor(s.payoff);
  var cards = [
    { label: _t('analytics_dash.report.net_pnl', 'Net K/Z'), value: money(s.totalPnL), c: tone(s.totalPnL),
      sub: _t('analytics_dash.report.wl', '{w} kazanan · {l} kaybeden').replace('{w}', s.wins).replace('{l}', s.losses) },
    { label: _t('analytics_dash.report.trades', 'İşlem'), value: String(s.total), c: C.text,
      sub: s.breakeven ? _t('analytics_dash.report.breakeven', '{n} başabaş').replace('{n}', s.breakeven) : '' },
    { label: _t('analytics_dash.report.win_rate', 'Win Rate'), value: pct(s.winRate), c: C.text, sub: '' },
    { label: _t('analytics_dash.report.profit_factor', 'Profit Factor'), value: pf, c: C.text,
      sub: _t('analytics_dash.report.gross', 'Brüt {w} / {l}').replace('{w}', moneyPlain(s.grossWin)).replace('{l}', moneyPlain(-s.grossLoss)) },
    { label: _t('analytics_dash.report.expectancy', 'Beklenti'), value: money(s.expectancy), c: tone(s.expectancy),
      sub: _t('analytics_dash.report.per_trade', 'İşlem başı ortalama') },
    { label: _t('analytics_dash.report.payoff', 'Ort. Kazanç / Kayıp'), value: payoff === '∞' ? '∞' : payoff + 'x', c: C.text,
      sub: (s.wins ? money(s.avgWin) : '—') + ' / ' + (s.losses ? money(-s.avgLoss) : '—') },
    { label: _t('analytics_dash.report.max_dd', 'Max Drawdown'), value: s.maxDrawdown > 0 ? money(-s.maxDrawdown) : moneyPlain(0),
      c: s.maxDrawdown > 0 ? C.down : C.text, sub: '' },
    { label: _t('analytics_dash.report.best', 'En İyi İşlem'), value: best > 0 ? money(best) : '—', c: best > 0 ? C.up : C.text,
      sub: worst < 0 ? _t('analytics_dash.report.worst', 'En kötü {v}').replace('{v}', money(worst)) : '' }
  ];
  var gap = 3, cw = (W - 2 * M - 3 * gap) / 4, ch = 21, y = 45;
  cards.forEach(function (cd, i) {
    var cx = M + (i % 4) * (cw + gap), cy = y + Math.floor(i / 4) * (ch + gap);
    fill(C.card); draw(C.line); doc.setLineWidth(0.25);
    doc.roundedRect(cx, cy, cw, ch, 2, 2, 'FD');
    font('normal', 7); color(C.muted); text(cd.label, cx + 4, cy + 6);
    font('bold', 13); color(cd.c); text(cd.value, cx + 4, cy + 13.5);
    if (cd.sub) { font('normal', 6.5); color(C.muted); text(cd.sub, cx + 4, cy + 18.2, { maxWidth: cw - 8 }); }
  });
  y += 2 * ch + gap + 7;

  // ---------- kümülatif K/Z grafiği ----------
  var chartH = 64;
  fill(C.card); draw(C.line); doc.roundedRect(M, y, W - 2 * M, chartH, 2, 2, 'FD');
  font('bold', 9); color(C.text); text(_t('analytics_dash.report.equity', 'Kümülatif K/Z'), M + 5, y + 7.5);
  font('bold', 9); color(tone(s.totalPnL)); text(money(s.totalPnL), W - M - 5, y + 7.5, { align: 'right' });

  var curve = [0];
  pnls.forEach(function (p) { curve.push(curve[curve.length - 1] + p); });
  var px0 = M + 20, px1 = W - M - 6, py0 = y + 13, py1 = y + chartH - 10;
  var vmin = Math.min.apply(null, curve), vmax = Math.max.apply(null, curve);
  var span = (vmax - vmin) || 1;
  vmin -= span * 0.06; vmax += span * 0.06; span = vmax - vmin;
  function cx(i) { return px0 + (curve.length > 1 ? i / (curve.length - 1) : 0) * (px1 - px0); }
  function cy(v) { return py1 - (v - vmin) / span * (py1 - py0); }

  // ızgara + eksen yazıları
  doc.setLineWidth(0.15);
  for (var g = 0; g <= 3; g++) {
    var gv = vmin + span * g / 3, gy = cy(gv);
    draw([24, 24, 28]); doc.line(px0, gy, px1, gy);
    font('normal', 6.5); color(C.muted); text(compactMoney(gv), px0 - 2, gy + 1, { align: 'right' });
  }
  // sıfır çizgisi
  if (vmin < 0 && vmax > 0) {
    draw([90, 90, 104]); doc.setLineDashPattern([0.8, 0.8], 0); doc.line(px0, cy(0), px1, cy(0)); doc.setLineDashPattern([], 0);
  }
  // dolgu (çizgi ile sıfır arası, yarı saydam) ve çizgi
  var canAlpha = typeof doc.GState === 'function' && typeof doc.setGState === 'function';
  var zeroY = cy(Math.min(Math.max(0, vmin), vmax));
  for (var i = 1; i < curve.length; i++) {
    var a = curve[i - 1], b = curve[i];
    var segs = [[i - 1, a, i, b]];
    if ((a < 0 && b > 0) || (a > 0 && b < 0)) {     // sıfırı kesen parçayı ikiye böl
      var t = a / (a - b), mid = i - 1 + t;
      segs = [[i - 1, a, mid, 0], [mid, 0, i, b]];
    }
    segs.forEach(function (sg) {
      var x1 = cx(sg[0]), y1 = cy(sg[1]), x2 = cx(sg[2]), y2 = cy(sg[3]);
      var c = (sg[1] + sg[3]) / 2 >= 0 ? C.up : C.down;
      if (canAlpha) {
        doc.setGState(new doc.GState({ opacity: 0.14 }));
        fill(c);
        doc.lines([[x2 - x1, y2 - y1], [0, zeroY - y2], [x1 - x2, 0]], x1, y1, [1, 1], 'F', true);
        doc.setGState(new doc.GState({ opacity: 1 }));
      }
      draw(c); doc.setLineWidth(0.55); doc.line(x1, y1, x2, y2);
    });
  }
  // tarih yazıları: ilk, orta, son
  if (closed.length) {
    font('normal', 6.5); color(C.muted);
    var dk = function (idx) { return fmtDay(window.WwMetrics.dateKey(closed[idx]), lang); };
    text(dk(0), px0, py1 + 6);
    if (closed.length > 2) text(dk(Math.floor((closed.length - 1) / 2)), (px0 + px1) / 2, py1 + 6, { align: 'center' });
    text(dk(closed.length - 1), px1, py1 + 6, { align: 'right' });
  }
  y += chartH + 10;

  // ---------- kırılım tabloları ----------
  var tableBase = {
    theme: 'plain',
    styles: { font: FONT, fontSize: 7.5, textColor: C.text, cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 }, fillColor: C.bg },
    headStyles: { font: FONT, fontStyle: 'bold', fontSize: 6.8, textColor: C.muted, fillColor: C.card },
    alternateRowStyles: { fillColor: C.row },
    margin: { left: M, right: M, top: 18, bottom: 16 },
    willDrawPage: function (data) { if (data.pageNumber > 1) paintBg(); }
  };
  function table(opts) {
    var o = Object.assign({}, tableBase, opts);
    o.styles = Object.assign({}, tableBase.styles, opts.styles || {});
    o.head = (opts.head || []).map(function (r) { return r.map(T); });
    o.body = (opts.body || []).map(function (r) { return r.map(function (cell) { return typeof cell === 'object' && cell !== null ? Object.assign({}, cell, { content: T(cell.content) }) : T(cell); }); });
    doc.autoTable(o);
    return doc.lastAutoTable.finalY;
  }
  function pnlCell(v) { return { content: money(v), styles: { textColor: tone(v), fontStyle: 'bold', halign: 'right' } }; }
  function rightCell(v) { return { content: String(v), styles: { halign: 'right' } }; }
  var groupHead = function (first) {
    return [[first, _t('analytics_dash.report.col.trades', 'İşlem'), _t('analytics_dash.report.col.win', 'Win %'), _t('analytics_dash.report.col.pnl', 'K/Z')]];
  };
  var groupRow = function (g, label) { return [label, rightCell(g.n), rightCell(pct(g.n ? g.wins / g.n * 100 : 0)), pnlCell(g.pnl)]; };
  var headAlign = { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } };

  if (y > H - 50) y = newPage();
  var half = (W - 2 * M - 6) / 2;
  var bySymbol = groupBy(closed, function (t) { return (t.symbol || t.instrument || '—').toUpperCase(); })
    .sort(function (p, q) { return q.pnl - p.pnl; });
  var byDir = groupBy(closed, function (t) { return String(t.direction || '').toLowerCase() === 'short' ? 'short' : 'long'; });
  var dirLabel = function (k) { return k === 'short' ? _t('direction.short', 'Short') : _t('direction.long', 'Long'); };

  sectionTitle(_t('analytics_dash.report.by_symbol', 'Sembol Bazında'), M, y);
  sectionTitle(_t('analytics_dash.report.by_direction', 'Long / Short'), M + half + 6, y);
  var startPage = doc.internal.getCurrentPageInfo().pageNumber;
  var leftEnd = table({
    startY: y + 3, tableWidth: half, margin: { left: M, right: W - M - half, top: 18, bottom: 16 },
    head: groupHead(_t('analytics_dash.report.col.symbol', 'Sembol')), body: bySymbol.map(function (g) { return groupRow(g, g.key); }),
    headStyles: Object.assign({}, tableBase.headStyles), columnStyles: { 0: { fontStyle: 'bold' } },
    didParseCell: function (d) { if (d.section === 'head' && headAlign[d.column.index]) d.cell.styles.halign = 'right'; }
  });
  var leftPage = doc.internal.getCurrentPageInfo().pageNumber;
  doc.setPage(startPage);
  var rightEnd = table({
    startY: y + 3, tableWidth: half, margin: { left: M + half + 6, right: M, top: 18, bottom: 16 },
    head: groupHead(_t('analytics_dash.report.col.direction', 'Yön')), body: byDir.map(function (g) { return groupRow(g, dirLabel(g.key)); }),
    didParseCell: function (d) { if (d.section === 'head' && headAlign[d.column.index]) d.cell.styles.halign = 'right'; }
  });
  var rightPage = doc.internal.getCurrentPageInfo().pageNumber;
  if (leftPage > rightPage) { doc.setPage(leftPage); y = leftEnd; }
  else if (rightPage > leftPage) { y = rightEnd; }
  else { y = Math.max(leftEnd, rightEnd); }
  y += 10;

  var byMonth = groupBy(closed, function (t) { return window.WwMetrics.dateKey(t).slice(0, 7); });
  if (byMonth.length >= 2) {
    if (H - 16 - y < 40) y = newPage();
    sectionTitle(_t('analytics_dash.report.by_month', 'Aylık'), M, y);
    var monthLabel = function (ym) {
      return window.WwTime.formatDate(ym + '-01', lang, { day: undefined, month: 'long', year: 'numeric' });
    };
    y = table({
      startY: y + 3,
      head: groupHead(_t('analytics_dash.report.col.month', 'Ay')),
      body: byMonth.map(function (g) { return groupRow(g, monthLabel(g.key)); }),
      didParseCell: function (d) { if (d.section === 'head' && headAlign[d.column.index]) d.cell.styles.halign = 'right'; }
    }) + 10;
  }

  if (hasStrategies) {
    if (H - 16 - y < 40) y = newPage();
    sectionTitle(_t('analytics_dash.report.by_strategy', 'Strateji Bazında'), M, y);
    var noStrat = _t('analytics_dash.report.no_strategy', 'Stratejisiz');
    var byStrat = groupBy(closed, function (t) { return stratOf(t) || noStrat; }).sort(function (p, q) { return q.pnl - p.pnl; });
    y = table({
      startY: y + 3,
      head: groupHead(_t('analytics_dash.report.col.strategy', 'Strateji')),
      body: byStrat.map(function (g) { return groupRow(g, g.key === noStrat ? { content: g.key, styles: { textColor: C.muted } } : g.key); }),
      columnStyles: { 0: { fontStyle: 'bold' } },
      didParseCell: function (d) { if (d.section === 'head' && headAlign[d.column.index]) d.cell.styles.halign = 'right'; }
    }) + 10;
  }

  // ---------- işlem listesi ----------
  // başlık + en az ~6 satır sığmıyorsa liste yeni sayfadan başlar (sayfa sonunda 1-2 satır kalmasın)
  if (H - 16 - y < 62) y = newPage();
  sectionTitle(_t('analytics_dash.report.trade_list', 'İşlemler') + ' (' + closed.length + ')', M, y);
  var tradeHead = [['#', _t('csv.date', 'Tarih'), _t('csv.symbol', 'Sembol'), _t('csv.direction', 'Yön'), _t('csv.lot', 'Lot'),
    _t('csv.entry', 'Giriş'), _t('csv.exit', 'Çıkış'), _t('csv.rr', 'R:R'), _t('csv.pnl', 'K/Z')]];
  // strateji kolonu Yön'den sonra (indeks 4); sağa hizalı sayı kolonları bir kayar
  if (hasStrategies) tradeHead[0].splice(4, 0, _t('analytics_dash.report.col.strategy', 'Strateji'));
  var numFrom = hasStrategies ? 5 : 4;
  table({
    startY: y + 3,
    head: tradeHead,
    columnStyles: hasStrategies ? { 4: { cellWidth: 30, overflow: 'ellipsize' } } : {},
    body: closed.map(function (t, i) {
      var pnl = pnls[i];
      var dir = String(t.direction || '').toLowerCase() === 'short' ? 'SHORT' : (t.direction ? 'LONG' : '—');
      var row = [
        { content: String(i + 1), styles: { textColor: C.muted } },
        window.WwTime.formatDateTime ? window.WwTime.formatDateTime(t.trade_date, lang, { day: '2-digit', month: '2-digit', year: 'numeric' }) : fmtDay(window.WwMetrics.dateKey(t), lang),
        { content: (t.symbol || '—').toUpperCase(), styles: { fontStyle: 'bold' } },
        { content: dir, styles: { textColor: C.muted } },
        rightCell(t.lot !== null && t.lot !== undefined && t.lot !== '' ? t.lot : '—'),
        rightCell(t.entry_price || '—'),
        rightCell(t.exit_price || '—'),
        rightCell(t.rr_ratio ? Number(t.rr_ratio).toFixed(2) : '—'),
        pnlCell(pnl)
      ];
      if (hasStrategies) row.splice(4, 0, stratOf(t) || { content: '—', styles: { textColor: C.muted } });
      return row;
    }),
    didParseCell: function (d) { if (d.section === 'head' && d.column.index >= numFrom) d.cell.styles.halign = 'right'; }
  });

  // ---------- sayfa altı ----------
  var pages = doc.internal.getNumberOfPages();
  for (var p = 1; p <= pages; p++) {
    doc.setPage(p);
    draw(C.line); doc.setLineWidth(0.2); doc.line(M, H - 11, W - M, H - 11);
    font('normal', 6.8); color(C.muted);
    text('Wawe Journal  ·  ' + _t('analytics_dash.report.title', 'Performans Raporu') + '  ·  ' + periodText, M, H - 6.5);
    text(_t('analytics_dash.report.page', 'Sayfa {x} / {y}').replace('{x}', p).replace('{y}', pages), W - M, H - 6.5, { align: 'right' });
  }

  var slug = String(meta.journalName || 'rapor').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'rapor';
  doc.save('wawe-journal-' + slug + '-' + (startKey || '') + '_' + (endKey || '') + '.pdf');
}
