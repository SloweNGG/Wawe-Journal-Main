/**
 * WwRangePicker — Dashboard / Strateji / Analitik araç çubuğundaki "Özel" tarih aralığı için temaya uyan takvim.
 *
 * Sayfadaki eski panel (.custom-range-panel: iki <input type="date"> + .custom-range-apply) yerinde kalır ve
 * değeri taşımaya devam eder. Bu dosya [data-range="custom"] düğmesine tıklamayı yakalar ve paneli açmak yerine
 * aralık takvimini açar (masaüstünde iki ay yan yana, telefonda alttan açılan tek ay). "Uygula"da tarihler
 * paneldeki kutulara yazılır ve panelin kendi Uygula düğmesine tıklanır: sayfaların filtre kodu değişmez.
 * Gelecek günler seçilemez (işlem yok). Stil bu dosyanın içindedir (açık/koyu tema).
 */
(function (global) {
  'use strict';
  if (global.WwRangePicker) return;

  var ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  var PRESETS = [
    ['last7', 'Last 7 days'], ['last30', 'Last 30 days'], ['last90', 'Last 90 days'],
    ['last_week', 'Last week'], ['last_month', 'Last month'], ['last_year', 'Last year']
  ];

  var CSS =
    /* eski satır içi panel yalnızca değer taşır; sayfa onu açmaya çalışsa da (analitik: .open) görünmez */
    '.custom-range-panel{display:none!important}' +
    '.ww-rp{position:fixed;z-index:10060;box-sizing:border-box;display:grid;grid-template-columns:150px auto;' +
      'grid-template-areas:"side main" "foot foot";border-radius:16px;background:#000;border:1px solid rgba(255,255,255,.12);' +
      'color:var(--text,#f1f1f8);font-family:var(--font);box-shadow:0 24px 70px rgba(0,0,0,.65);user-select:none;-webkit-user-select:none;' +
      'opacity:0;transform:translateY(-4px);transition:opacity .15s ease,transform .15s ease;pointer-events:none}' +
    '.ww-rp.open{opacity:1;transform:none;pointer-events:auto}' +
    '.ww-rp *{box-sizing:border-box}' +
    '.ww-rp-side{grid-area:side;display:flex;flex-direction:column;gap:2px;padding:12px 8px;border-right:1px solid rgba(255,255,255,.08)}' +
    '.ww-rp-side-k{padding:2px 10px 8px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#a0a0b8)}' +
    '.ww-rp-preset{display:block;width:100%;padding:8px 10px;border:0;border-radius:8px;background:transparent;color:var(--muted,#a0a0b8);' +
      'font:inherit;font-size:12.5px;font-weight:500;text-align:left;white-space:nowrap;cursor:pointer;transition:background .15s,color .15s}' +
    '.ww-rp-preset:hover{background:rgba(255,255,255,.06);color:var(--text,#f1f1f8)}' +
    '.ww-rp-preset.is-on{background:rgba(139,92,246,.16);color:var(--text,#f1f1f8);font-weight:600}' +
    '.ww-rp-preset:focus-visible,.ww-rp-field:focus-visible,.ww-rp-btn:focus-visible,.ww-rp-nav:focus-visible{outline:2px solid var(--accent,#8b5cf6);outline-offset:1px}' +
    '.ww-rp-main{grid-area:main;padding:14px 16px 10px;min-width:0}' +
    '.ww-rp-fields{display:flex;align-items:center;gap:8px;margin-bottom:12px}' +
    '.ww-rp-field{flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:2px;padding:7px 11px;border-radius:10px;' +
      'border:1px solid rgba(255,255,255,.1);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;transition:border-color .15s,box-shadow .15s}' +
    '.ww-rp-field:hover{border-color:rgba(255,255,255,.22)}' +
    '.ww-rp-field.is-active{border-color:var(--accent,#8b5cf6);box-shadow:0 0 0 3px rgba(139,92,246,.18)}' +
    '.ww-rp-field-k{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#a0a0b8)}' +
    '.ww-rp-field-v{font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.ww-rp-field-v.is-empty{color:var(--muted,#a0a0b8);font-weight:500}' +
    '.ww-rp-arrow{flex:none;color:var(--muted,#a0a0b8);opacity:.6}' +
    '.ww-rp-arrow svg{width:14px;height:14px;display:block;stroke:currentColor;fill:none;stroke-width:2}' +
    '.ww-rp-months{display:flex;gap:22px}' +
    '.ww-rp-month{flex:1 1 0;min-width:0}' +
    '.ww-rp-head{display:flex;align-items:center;height:30px;margin-bottom:6px}' +
    '.ww-rp-title{flex:1;text-align:center;font-size:13px;font-weight:600;text-transform:capitalize}' +
    '.ww-rp-nav{width:30px;height:30px;padding:0;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:transparent;' +
      'color:var(--muted,#a0a0b8);cursor:pointer;display:flex;align-items:center;justify-content:center;flex:none}' +
    '.ww-rp-nav svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2}' +
    '.ww-rp-nav:hover:not(:disabled){border-color:var(--accent,#8b5cf6);color:var(--text,#f1f1f8)}' +
    '.ww-rp-nav:disabled{opacity:.25;cursor:default}' +
    '.ww-rp-navgap{width:30px;flex:none}' +
    '.ww-rp-wds,.ww-rp-days{display:grid;grid-template-columns:repeat(7,36px);row-gap:2px}' +
    '.ww-rp-wd{text-align:center;font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted,#a0a0b8);padding:2px 0 6px}' +
    '.ww-rp-blank{height:34px}' +
    '.ww-rp-day{position:relative;height:34px;padding:0;border:0;border-radius:8px;background:transparent;color:inherit;' +
      'font-family:var(--font);font-size:12.5px;font-variant-numeric:tabular-nums;cursor:pointer}' +
    '.ww-rp-day:hover:not(:disabled){background:rgba(255,255,255,.08)}' +
    '.ww-rp-day:focus-visible{outline:2px solid var(--accent,#8b5cf6);outline-offset:-2px;z-index:1}' +
    '.ww-rp-day.today::after{content:"";position:absolute;left:50%;bottom:5px;width:4px;height:4px;margin-left:-2px;border-radius:50%;background:var(--accent2,#a78bfa)}' +
    '.ww-rp-day.in{background:rgba(139,92,246,.16);border-radius:0}' +
    '.ww-rp-day.in.pv{background:rgba(139,92,246,.09)}' +
    '.ww-rp-day.in:hover:not(:disabled){background:rgba(139,92,246,.26)}' +
    '.ww-rp-days>.c1.in{border-radius:8px 0 0 8px}' +
    '.ww-rp-days>.c7.in{border-radius:0 8px 8px 0}' +
    '.ww-rp-days>.c1.c7.in{border-radius:8px}' +
    '.ww-rp-day.first.in{border-top-left-radius:8px;border-bottom-left-radius:8px}' +
    '.ww-rp-day.last.in{border-top-right-radius:8px;border-bottom-right-radius:8px}' +
    '.ww-rp-day.edge,.ww-rp-day.edge:hover:not(:disabled){background:var(--accent,#8b5cf6);color:#fff;font-weight:700}' +
    '.ww-rp-day.edge.today::after{background:#fff}' +
    '.ww-rp-day.edge.s{border-radius:8px 0 0 8px}' +
    '.ww-rp-day.edge.e{border-radius:0 8px 8px 0}' +
    '.ww-rp-day.edge.s.e,.ww-rp-day.edge.solo{border-radius:8px}' +
    /* satırın / ayın tek hücresi kalan uç: dört köşe yuvarlak */
    '.ww-rp-days>.c1.edge.e,.ww-rp-days>.c7.edge.s,.ww-rp-day.first.edge.e,.ww-rp-day.last.edge.s{border-radius:8px}' +
    '.ww-rp-day:disabled{opacity:.22;cursor:default}' +
    '.ww-rp-foot{grid-area:foot;display:flex;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid rgba(255,255,255,.08)}' +
    '.ww-rp-sum{flex:1;min-width:0;font-size:12px;color:var(--muted,#a0a0b8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.ww-rp-sum strong{color:var(--text,#f1f1f8);font-weight:600}' +
    '.ww-rp-btn{height:32px;padding:0 14px;border-radius:9px;border:1px solid rgba(255,255,255,.12);background:transparent;color:var(--muted,#a0a0b8);' +
      'font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;transition:border-color .15s,color .15s,background .15s}' +
    '.ww-rp-btn:hover:not(:disabled){border-color:rgba(255,255,255,.28);color:var(--text,#f1f1f8)}' +
    '.ww-rp-btn.is-primary{border-color:#7c3aed;background:#000;color:#f4f4f5}' +
    '.ww-rp-btn.is-primary:hover:not(:disabled){background:rgba(124,58,237,.18);border-color:#8b5cf6}' +
    '.ww-rp-btn:disabled{opacity:.4;cursor:default}' +
    '.ww-rp-btn.is-link{border-color:transparent;padding:0 8px}' +
    /* telefon: alttan açılan tek aylık panel, hazır aralıklar yatay kayan çipler */
    '.ww-rp.is-sheet{left:8px!important;right:8px;top:auto!important;bottom:8px;max-height:calc(100dvh - 16px);overflow-y:auto;' +
      'grid-template-columns:minmax(0,1fr);grid-template-areas:"side" "main" "foot";transform:translateY(12px)}' +
    '.ww-rp.is-sheet.open{transform:none}' +
    '.ww-rp.is-sheet .ww-rp-side{flex-direction:row;overflow-x:auto;gap:6px;padding:12px;border-right:0;border-bottom:1px solid rgba(255,255,255,.08);scrollbar-width:none}' +
    '.ww-rp.is-sheet .ww-rp-side-k{display:none}' +
    '.ww-rp.is-sheet .ww-rp-preset{width:auto;flex:none;padding:7px 12px;border:1px solid rgba(255,255,255,.1);border-radius:999px}' +
    '.ww-rp.is-sheet .ww-rp-preset.is-on{border-color:var(--accent,#8b5cf6)}' +
    '.ww-rp.is-sheet .ww-rp-main{padding:12px}' +
    '.ww-rp.is-sheet .ww-rp-wds,.ww-rp.is-sheet .ww-rp-days{grid-template-columns:repeat(7,minmax(0,1fr))}' +
    '.ww-rp.is-sheet .ww-rp-day,.ww-rp.is-sheet .ww-rp-blank{height:40px}' +
    '.ww-rp.is-sheet .ww-rp-btn{height:38px}' +
    /* açık tema */
    'body.light-theme .ww-rp{background:#fff;border-color:var(--border,#e2e2ea);box-shadow:0 24px 60px rgba(15,23,42,.16)}' +
    'body.light-theme .ww-rp-side,body.light-theme .ww-rp.is-sheet .ww-rp-side{border-color:var(--border,#e2e2ea)}' +
    'body.light-theme .ww-rp-foot{border-top-color:var(--border,#e2e2ea)}' +
    'body.light-theme .ww-rp-preset:hover,body.light-theme .ww-rp-day:hover:not(:disabled){background:rgba(15,23,42,.05)}' +
    'body.light-theme .ww-rp-preset.is-on{background:rgba(139,92,246,.1)}' +
    'body.light-theme .ww-rp-field,body.light-theme .ww-rp-nav,body.light-theme .ww-rp-btn,body.light-theme .ww-rp.is-sheet .ww-rp-preset{border-color:var(--border,#e2e2ea)}' +
    'body.light-theme .ww-rp-field:hover,body.light-theme .ww-rp-btn:hover:not(:disabled){border-color:rgba(15,23,42,.25)}' +
    'body.light-theme .ww-rp-day.in{background:rgba(139,92,246,.12)}' +
    'body.light-theme .ww-rp-day.in.pv{background:rgba(139,92,246,.07)}' +
    'body.light-theme .ww-rp-btn.is-primary{background:#fff;border-color:#7c3aed;color:#4c1d95}' +
    'body.light-theme .ww-rp-btn.is-primary:hover:not(:disabled){background:rgba(124,58,237,.08)}' +
    'body.light-theme .ww-rp-btn.is-link{border-color:transparent}' +
    '@media (prefers-reduced-motion:reduce){.ww-rp{transition:none}}';

  var ICON_PREV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  var ICON_NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
  var ICON_ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  // ---------------------------------------------------------------- saf yardımcılar (testlerde de kullanılır)
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) { var x = new Date(Date.UTC(y, m, d)); return x.getUTCFullYear() + '-' + pad(x.getUTCMonth() + 1) + '-' + pad(x.getUTCDate()); }
  function parts(s) { return { y: +s.slice(0, 4), m: +s.slice(5, 7) - 1, d: +s.slice(8, 10) }; }
  function addDays(s, n) { var p = parts(s); return iso(p.y, p.m, p.d + n); }
  function dayCount(a, b) { var x = parts(a), y = parts(b); return Math.round((Date.UTC(y.y, y.m, y.d) - Date.UTC(x.y, x.m, x.d)) / 864e5) + 1; }

  // Hazır aralıklar; hafta pazartesi başlar (takvim ızgarasıyla aynı)
  function presetRange(id, today) {
    var p = parts(today), dow = (new Date(Date.UTC(p.y, p.m, p.d)).getUTCDay() + 6) % 7;
    switch (id) {
      case 'last7': return { start: addDays(today, -6), end: today };
      case 'last30': return { start: addDays(today, -29), end: today };
      case 'last90': return { start: addDays(today, -89), end: today };
      case 'last_week': var mon = addDays(today, -dow - 7); return { start: mon, end: addDays(mon, 6) };
      case 'last_month': return { start: iso(p.y, p.m - 1, 1), end: iso(p.y, p.m, 0) };
      case 'last_year': return { start: iso(p.y - 1, 0, 1), end: iso(p.y - 1, 11, 31) };
    }
    return null;
  }

  // Gün tıklaması. sel: { start, end, next: 'start'|'end', edit }.
  // - Bitiş bekleniyorsa: başlangıçtan önceki gün yeni başlangıç olur, sonraki gün aralığı tamamlar.
  // - Başlangıç bekleniyorsa yeni aralık başlar; "Başlangıç" kutusuna tıklanmışsa (edit) bitiş korunur.
  function pickDay(sel, d) {
    if (sel.next === 'end' && sel.start) {
      if (d < sel.start) return { start: d, end: null, next: 'end', edit: false };
      return { start: sel.start, end: d, next: 'start', edit: false };
    }
    if (sel.edit && sel.end && d <= sel.end) return { start: d, end: sel.end, next: 'start', edit: false };
    return { start: d, end: null, next: 'end', edit: false };
  }

  // Ay ızgarası: pazartesiden başlayan 6 hafta; ay dışı günler boş hücre
  function monthCells(year, month, max) {
    var lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7, cells = [];
    for (var i = 0; i < 42; i++) {
      var d = iso(year, month, 1 - lead + i);
      cells.push({ iso: d, day: +d.slice(8, 10), out: parts(d).m !== ((month % 12) + 12) % 12, disabled: !!(max && d > max) });
    }
    return cells;
  }

  // ---------------------------------------------------------------- dil ve biçim
  function t(key, fallback, params) {
    var i = global.i18n, v = i && typeof i.t === 'function' ? i.t(key, params) : null;
    if (!v || v === key) {
      v = fallback;
      if (params) Object.keys(params).forEach(function (k) { v = v.replace(new RegExp('\\{+' + k + '\\}+', 'g'), params[k]); });
    }
    return v;
  }
  function lang() { var i = global.i18n; return i && typeof i.getCurrentLanguage === 'function' ? i.getCurrentLanguage() : 'en'; }
  function locale() { var l = lang(); return l === 'tr' ? 'tr-TR' : (l === 'de' ? 'de-DE' : 'en-US'); }
  function fmt(s, opts) {
    var p = parts(s);
    try { return new Intl.DateTimeFormat(locale(), Object.assign({ timeZone: 'UTC' }, opts)).format(new Date(Date.UTC(p.y, p.m, p.d))); }
    catch (e) { return s; }
  }
  function todayIso() {
    try { if (global.WwTime) return global.WwTime.todayKey(); } catch (e) { }
    var n = new Date(); return iso(n.getFullYear(), n.getMonth(), n.getDate());
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------------------------------------------------------------- açılır pencere
  var pop = null, cur = null; // cur: { btn, panel, inputs:[start,end], apply, sel, hover, y, m, focus, today }

  function injectCss() {
    if (document.getElementById('ww-rp-css')) return;
    var s = document.createElement('style');
    s.id = 'ww-rp-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  function isSheet() { return global.innerWidth < 640; }
  function monthsShown() { return global.innerWidth >= 760 ? 2 : 1; }

  // [data-range="custom"] düğmesinin panelini en yakın ortak kapsayıcıda arar
  function findPanel(btn) {
    for (var n = btn.parentElement; n && n !== document.body; n = n.parentElement) {
      var p = n.querySelector('.custom-range-panel');
      if (p) {
        var inputs = p.querySelectorAll('input[type="date"]'), apply = p.querySelector('.custom-range-apply');
        return inputs.length >= 2 && apply ? { panel: p, inputs: [inputs[0], inputs[1]], apply: apply } : null;
      }
    }
    return null;
  }

  // görüntülenen aralık: önizleme (bitiş bekleniyor + fare bir günde) ya da seçim
  function shownRange() {
    var s = cur.sel;
    if (s.start && !s.end && s.next === 'end' && cur.hover && cur.hover >= s.start) return { a: s.start, b: cur.hover, pv: true };
    if (s.start && s.end) return { a: s.start, b: s.end, pv: false };
    if (s.start) return { a: s.start, b: s.start, pv: false };
    return null;
  }

  function render() {
    if (!pop || !cur) return;
    var n = monthsShown(), today = cur.today, s = cur.sel;
    var html = '<div class="ww-rp-side" role="group" aria-label="' + esc(t('range.presets', 'Quick ranges')) + '">' +
      '<div class="ww-rp-side-k">' + esc(t('range.presets', 'Quick ranges')) + '</div>';
    PRESETS.forEach(function (p) {
      var r = presetRange(p[0], today), on = r && s.start === r.start && s.end === r.end;
      html += '<button type="button" class="ww-rp-preset' + (on ? ' is-on' : '') + '" data-preset="' + p[0] + '"' + (on ? ' aria-pressed="true"' : '') + '>' +
        esc(t('range.' + p[0], p[1])) + '</button>';
    });
    html += '</div><div class="ww-rp-main"><div class="ww-rp-fields">' +
      field('start', t('range.start', 'Start'), s.start, s.next === 'start') +
      '<span class="ww-rp-arrow">' + ICON_ARROW + '</span>' +
      field('end', t('range.end', 'End'), s.end, s.next === 'end') +
      '</div><div class="ww-rp-months">';
    // sağdaki ay cur.y/cur.m; iki ay gösteriliyorsa soldaki bir önceki ay
    for (var k = n - 1; k >= 0; k--) {
      var mp = parts(iso(cur.y, cur.m - k, 1)), first = iso(mp.y, mp.m, 1), isFirst = k === n - 1, isLast = k === 0;
      html += '<div class="ww-rp-month"><div class="ww-rp-head">' +
        (isFirst ? '<button type="button" class="ww-rp-nav" data-nav="-1" aria-label="' + esc(t('datepicker.prev_month', 'Previous month')) + '">' + ICON_PREV + '</button>' : '<span class="ww-rp-navgap"></span>') +
        '<div class="ww-rp-title" aria-live="polite">' + esc(fmt(first, { month: 'long', year: 'numeric' })) + '</div>' +
        (isLast ? '<button type="button" class="ww-rp-nav" data-nav="1" aria-label="' + esc(t('datepicker.next_month', 'Next month')) + '"' + (first >= iso(parts(today).y, parts(today).m, 1) ? ' disabled' : '') + '>' + ICON_NEXT + '</button>' : '<span class="ww-rp-navgap"></span>') +
        '</div><div class="ww-rp-wds" aria-hidden="true">';
      for (var w = 0; w < 7; w++) html += '<div class="ww-rp-wd">' + esc(fmt(iso(2024, 0, 1 + w), { weekday: 'short' })) + '</div>'; // 2024-01-01 pazartesi
      html += '</div><div class="ww-rp-days">';
      monthCells(mp.y, mp.m, today).forEach(function (c, i) {
        if (c.out) { html += '<span class="ww-rp-blank c' + (i % 7 + 1) + '"></span>'; return; }
        html += '<button type="button" class="ww-rp-day c' + (i % 7 + 1) + (c.iso === today ? ' today' : '') + '" data-date="' + c.iso + '" tabindex="-1"' +
          ' aria-label="' + esc(fmt(c.iso, { dateStyle: 'full' })) + '"' + (c.disabled ? ' disabled' : '') + '>' + c.day + '</button>';
      });
      html += '</div></div>';
    }
    html += '</div></div><div class="ww-rp-foot"><span class="ww-rp-sum" aria-live="polite"></span>' +
      '<button type="button" class="ww-rp-btn is-link" data-act="clear">' + esc(t('range.clear', 'Clear')) + '</button>' +
      '<button type="button" class="ww-rp-btn" data-act="cancel">' + esc(t('range.cancel', 'Cancel')) + '</button>' +
      '<button type="button" class="ww-rp-btn is-primary" data-act="apply">' + esc(t('dashboard.filter.apply', 'Apply')) + '</button></div>';
    pop.innerHTML = html;
    paint();
  }

  function field(id, label, value, active) {
    return '<button type="button" class="ww-rp-field' + (active ? ' is-active' : '') + '" data-field="' + id + '" aria-pressed="' + (active ? 'true' : 'false') + '">' +
      '<span class="ww-rp-field-k">' + esc(label) + '</span>' +
      '<span class="ww-rp-field-v' + (value ? '' : ' is-empty') + '">' + esc(value ? fmt(value, { day: 'numeric', month: 'short', year: 'numeric' }) : '—') + '</span></button>';
  }

  // seçim / önizleme sınıfları; fare hareketinde ızgara yeniden kurulmadan güncellenir
  function paint() {
    var r = shownRange(), s = cur.sel, days = pop.querySelectorAll('.ww-rp-day'), focusSet = false;
    Array.prototype.forEach.call(days, function (b) {
      var d = b.getAttribute('data-date'), inR = !!(r && d >= r.a && d <= r.b);
      var isS = !!(r && d === r.a), isE = !!(r && d === r.b && (s.end || r.pv)), edge = isS || isE || d === s.start;
      b.classList.toggle('in', inR && r.a !== r.b && !edge);           // uçlar dolu renkte; şerit yalnızca aradaki günler
      b.classList.toggle('pv', inR && r.pv && !edge);
      b.classList.toggle('edge', edge);
      b.classList.toggle('s', isS && r.a !== r.b);
      b.classList.toggle('e', isE && r.a !== r.b);
      b.classList.toggle('solo', !!(r && r.a === r.b && d === r.a));
      b.classList.toggle('first', inR && d === iso(+d.slice(0, 4), +d.slice(5, 7) - 1, 1));
      b.classList.toggle('last', inR && d === iso(+d.slice(0, 4), +d.slice(5, 7), 0));
      b.setAttribute('aria-pressed', d === s.start || d === s.end ? 'true' : 'false');
      var f = d === cur.focus; b.tabIndex = f ? 0 : -1; if (f) focusSet = true;
    });
    if (!focusSet) { var firstOn = pop.querySelector('.ww-rp-day:not(:disabled)'); if (firstOn) firstOn.tabIndex = 0; }
    var sum = pop.querySelector('.ww-rp-sum'), apply = pop.querySelector('[data-act="apply"]');
    if (s.start) {
      var nDays = dayCount(s.start, s.end || (r && r.pv ? r.b : s.start));
      sum.innerHTML = '<strong>' + esc(nDays === 1 ? t('range.one_day', '1 day') : t('range.days', '{{n}} days', { n: nDays })) + '</strong>' +
        (s.end ? '' : ' · ' + esc(t('range.pick_end', 'Pick the end date')));
    } else sum.textContent = t('range.pick_start', 'Pick the start date');
    apply.disabled = !s.start;
    pop.querySelector('[data-act="clear"]').disabled = !s.start;
  }

  function place() {
    if (!pop || !cur) return;
    if (!document.body.contains(cur.btn)) return close();             // SPA ile sayfa değişti
    var sheet = isSheet();
    pop.classList.toggle('is-sheet', sheet);
    if (sheet) { pop.style.top = ''; pop.style.left = ''; return; }
    var r = cur.btn.getBoundingClientRect(), m = 8, w = pop.offsetWidth, h = pop.offsetHeight;
    var top = r.bottom + 8;
    if (top + h > innerHeight - m) top = r.top - h - 8 >= m ? r.top - h - 8 : Math.max(m, innerHeight - h - m);
    var left = Math.min(Math.max(m, r.right - w), innerWidth - w - m);  // düğmenin sağ kenarına hizalı (filtreler sağda)
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';
  }

  function show(y, m) { cur.y = y; cur.m = m; render(); }
  function focusDay() { var el = pop && cur && pop.querySelector('[data-date="' + cur.focus + '"]'); if (el) el.focus(); }

  // görünen ay(lar) dışına çıkan odak görünümü kaydırır
  function ensureVisible(d) {
    var p = parts(d), n = monthsShown(), right = cur.y * 12 + cur.m, idx = p.y * 12 + p.m;
    if (idx > right) show(p.y, p.m);
    else if (idx < right - (n - 1)) { var q = parts(iso(p.y, p.m + n - 1, 1)); show(q.y, q.m); }
    else paint();
  }

  function open(btn, ctx) {
    injectCss();
    if (!pop) {
      pop = document.createElement('div');
      pop.className = 'ww-rp';
      pop.setAttribute('role', 'dialog');
      pop.addEventListener('mousedown', function (e) { if (!e.target.closest('.ww-rp-day,.ww-rp-preset,.ww-rp-field,.ww-rp-btn,.ww-rp-nav')) e.preventDefault(); });
      pop.addEventListener('click', onPopClick);
      pop.addEventListener('keydown', onPopKey);
      pop.addEventListener('mouseover', onHover);
      pop.addEventListener('mouseleave', function () { if (cur && cur.hover) { cur.hover = null; paint(); } });
      document.body.appendChild(pop);
    }
    var today = todayIso();
    var a = ctx.inputs[0].value, b = ctx.inputs[1].value;
    var start = ISO_RE.test(a) ? a : null, end = ISO_RE.test(b) ? b : null;
    if (start && end && end < start) { var x = start; start = end; end = x; }
    if (!start) end = null;
    // sağdaki ay: bitişin ayı; yalnızca başlangıç varsa bir sonraki ay (bitiş genelde ileride seçilir), bugünü aşmadan
    var anchor = end || (start ? iso(parts(start).y, parts(start).m + monthsShown() - 1, 1) : today), p = parts(anchor > today ? today : anchor);
    cur = { btn: btn, panel: ctx.panel, inputs: ctx.inputs, apply: ctx.apply, today: today, hover: null,
            sel: { start: start, end: end, next: start && !end ? 'end' : 'start', edit: false }, y: p.y, m: p.m, focus: end || start || today };
    pop.setAttribute('aria-label', t('range.title', 'Date range'));
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-haspopup', 'dialog');
    render();
    place();
    pop.classList.add('open');
    focusDay();
    document.addEventListener('mousedown', onOutside, true);
    global.addEventListener('keydown', onEsc, true);
    global.addEventListener('resize', onResize);
    document.addEventListener('scroll', onScroll, true);
  }

  function close(refocus) {
    if (!cur) return;
    var btn = cur.btn;
    btn.setAttribute('aria-expanded', 'false');
    pop.classList.remove('open');
    cur = null;
    document.removeEventListener('mousedown', onOutside, true);
    global.removeEventListener('keydown', onEsc, true);
    global.removeEventListener('resize', onResize);
    document.removeEventListener('scroll', onScroll, true);
    if (refocus === true && document.body.contains(btn)) btn.focus();
  }

  function apply() {
    var c = cur, s = c.sel;
    if (!s.start) return;
    close(true);
    c.inputs[0].value = s.start;
    c.inputs[1].value = s.end || s.start;
    c.apply.click();                                                   // sayfanın kendi filtre kodu çalışır
  }

  function onPopClick(e) {
    if (!cur) return;
    var el;
    if ((el = e.target.closest('[data-nav]')) && !el.disabled) {
      var p = parts(iso(cur.y, cur.m + Number(el.getAttribute('data-nav')), 1));
      return show(p.y, p.m);
    }
    if ((el = e.target.closest('[data-date]')) && !el.disabled) {
      var d = el.getAttribute('data-date');
      cur.sel = pickDay(cur.sel, d);
      cur.focus = d; cur.hover = null;
      render();
      return focusDay();
    }
    if ((el = e.target.closest('[data-preset]'))) {
      var r = presetRange(el.getAttribute('data-preset'), cur.today);
      cur.sel = { start: r.start, end: r.end, next: 'start', edit: false };
      cur.focus = r.end;
      var q = parts(r.end);
      show(q.y, q.m);
      var again = pop.querySelector('[data-preset="' + el.getAttribute('data-preset') + '"]');
      if (again) again.focus();
      return;
    }
    if ((el = e.target.closest('[data-field]'))) {
      var f = el.getAttribute('data-field');
      if (f === 'end' && !cur.sel.start) f = 'start';
      cur.sel.next = f; cur.sel.edit = f === 'start';
      var target = (f === 'start' ? cur.sel.start : cur.sel.end) || cur.sel.start;
      if (target) { cur.focus = target; var tp = parts(target), right = cur.y * 12 + cur.m, idx = tp.y * 12 + tp.m; if (idx > right || idx < right - (monthsShown() - 1)) { cur.y = tp.y; cur.m = tp.m; } }
      render();
      return;
    }
    if ((el = e.target.closest('[data-act]')) && !el.disabled) {
      var act = el.getAttribute('data-act');
      if (act === 'apply') return apply();
      if (act === 'cancel') return close(true);
      if (act === 'clear') { cur.sel = { start: null, end: null, next: 'start', edit: false }; cur.hover = null; render(); focusDay(); }
    }
  }

  function onHover(e) {
    if (!cur || cur.sel.next !== 'end' || !cur.sel.start) return;
    var el = e.target.closest('[data-date]'), d = el && !el.disabled ? el.getAttribute('data-date') : null;
    if (d !== cur.hover) { cur.hover = d; paint(); }
  }

  function onPopKey(e) {
    if (!cur || !e.target.closest('[data-date]')) return;
    var step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key], next = null;
    if (step) next = addDays(cur.focus, step);
    else if (e.key === 'PageUp' || e.key === 'PageDown') { var p = parts(cur.focus); next = iso(p.y, p.m + (e.key === 'PageUp' ? -1 : 1), Math.min(p.d, 28)); }
    else if (e.key === 'Home' || e.key === 'End') { var q = parts(cur.focus); next = e.key === 'Home' ? iso(q.y, q.m, 1) : iso(q.y, q.m + 1, 0); }
    if (!next) return;
    e.preventDefault();
    if (next > cur.today) next = cur.today;
    cur.focus = next;
    if (cur.sel.next === 'end' && cur.sel.start) cur.hover = next;     // klavyede de aralık önizlemesi
    ensureVisible(next);
    focusDay();
  }

  function onOutside(e) {
    if (!cur || pop.contains(e.target) || cur.btn.contains(e.target)) return;
    close();
  }
  // Escape yalnızca takvimi kapatsın, arkadaki pencereyi değil
  function onEsc(e) {
    if (e.key !== 'Escape' || !cur) return;
    e.preventDefault();
    e.stopPropagation();
    close(true);
  }
  function onResize() { if (!cur) return; var n = pop.querySelectorAll('.ww-rp-month').length; if (n !== monthsShown()) render(); place(); }
  function onScroll(e) { if (cur && !pop.contains(e.target)) place(); }

  // "Özel" düğmesi: sayfanın kendi dinleyicisinden önce yakalanır (capture) ve takvim açılır
  function onCustomClick(e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-range="custom"]') : null;
    if (!btn) return;
    var ctx = findPanel(btn);
    if (!ctx) return;                                                  // tanınmayan yapı: eski davranış
    e.preventDefault();
    e.stopImmediatePropagation();
    if (cur && cur.btn === btn) close(true);
    else { close(); open(btn, ctx); }
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    if (document.head) injectCss();
    document.addEventListener('click', onCustomClick, true);
  }

  global.WwRangePicker = { presetRange: presetRange, pickDay: pickDay, monthCells: monthCells, dayCount: dayCount, close: close };
})(typeof window !== 'undefined' ? window : globalThis);
