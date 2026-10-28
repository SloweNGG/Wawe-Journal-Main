/**
 * WwDatePicker — tarayıcının beyaz takviminin yerine sitenin temasına uyan tarih seçici.
 *
 * Kullanım:
 *   WwDatePicker.attach(document.getElementById('prop-start-date'))
 *
 * Asıl <input type="date"> sayfada gizli kalır ve değeri taşımaya devam eder: mevcut kod
 * `input.value` okumaya/yazmaya, 'change' dinlemeye aynen devam edebilir; görünen düğme kendini
 * günceller. `min` / `max` öznitelikleri dışındaki günler seçilemez.
 * Stil bu dosyanın içindedir (açık/koyu tema).
 */
(function (global) {
  'use strict';
  if (global.WwDatePicker) return;

  var ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  var nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

  var CSS =
    '.ww-dp-native{display:none!important}' +
    '.ww-dp-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;cursor:pointer}' +
    '.ww-dp-trigger svg{width:15px;height:15px;flex-shrink:0;stroke:currentColor;fill:none;stroke-width:2;opacity:.6}' +
    '.ww-dp-trigger.is-empty .ww-dp-label{color:var(--muted)}' +
    '.ww-dp{position:fixed;z-index:10060;width:288px;box-sizing:border-box;padding:12px;border-radius:14px;' +
      'background:#0a0a0f;border:1px solid rgba(255,255,255,.12);color:var(--text,#f1f1f8);font-family:var(--font);' +
      'box-shadow:0 20px 60px rgba(0,0,0,.6);user-select:none;-webkit-user-select:none;' +
      'opacity:0;transform:translateY(-4px);transition:opacity .15s ease,transform .15s ease;pointer-events:none}' +
    '.ww-dp.open{opacity:1;transform:none;pointer-events:auto}' +
    '.ww-dp-head{display:flex;align-items:center;gap:6px;margin-bottom:8px}' +
    '.ww-dp-title{flex:1;text-align:center;font-size:13px;font-weight:600}' +
    '.ww-dp-nav{width:30px;height:30px;padding:0;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:transparent;' +
      'color:var(--muted,#a0a0b8);cursor:pointer;display:flex;align-items:center;justify-content:center}' +
    '.ww-dp-nav svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2}' +
    '.ww-dp-nav:hover:not(:disabled){border-color:var(--accent,#8b5cf6);color:var(--text,#f1f1f8)}' +
    '.ww-dp-nav:disabled{opacity:.3;cursor:default}' +
    '.ww-dp-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}' +
    '.ww-dp-wd{text-align:center;font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted,#a0a0b8);padding:4px 0 6px}' +
    '.ww-dp-day{height:34px;padding:0;border-radius:8px;border:1px solid transparent;background:transparent;color:inherit;' +
      'font-family:var(--font-mono,inherit);font-size:12px;cursor:pointer}' +
    '.ww-dp-day:hover:not(:disabled){background:rgba(139,92,246,.14)}' +
    '.ww-dp-day:focus-visible{outline:2px solid var(--accent,#8b5cf6);outline-offset:-2px}' +
    '.ww-dp-day.out{color:var(--muted,#a0a0b8);opacity:.45}' +
    '.ww-dp-day.today{border-color:rgba(255,255,255,.28);font-weight:700}' +
    '.ww-dp-day.sel{background:var(--accent,#8b5cf6);border-color:transparent;color:#fff;font-weight:700}' +
    '.ww-dp-day:disabled{opacity:.2;cursor:default}' +
    '.ww-dp-foot{display:flex;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08)}' +
    '.ww-dp-today{flex:1;padding:7px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:transparent;' +
      'color:var(--muted,#a0a0b8);font-family:inherit;font-size:12px;font-weight:600;cursor:pointer}' +
    '.ww-dp-today:hover:not(:disabled){border-color:var(--accent,#8b5cf6);color:var(--text,#f1f1f8)}' +
    '.ww-dp-today:disabled{opacity:.35;cursor:default}' +
    'body.light-theme .ww-dp{background:#fff;border-color:var(--border,#e2e2ea);box-shadow:0 20px 60px rgba(15,23,42,.15)}' +
    'body.light-theme .ww-dp-nav,body.light-theme .ww-dp-today{border-color:var(--border,#e2e2ea)}' +
    'body.light-theme .ww-dp-day.today{border-color:rgba(15,23,42,.25)}' +
    'body.light-theme .ww-dp-foot{border-top-color:var(--border,#e2e2ea)}' +
    '@media (prefers-reduced-motion:reduce){.ww-dp{transition:none}}';

  var ICON_CAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
  var ICON_PREV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  var ICON_NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

  function t(key, fallback) {
    var i = global.i18n;
    var v = i && typeof i.t === 'function' ? i.t(key) : null;
    return v && v !== key ? v : fallback;
  }
  function lang() {
    var i = global.i18n;
    return i && typeof i.getCurrentLanguage === 'function' ? i.getCurrentLanguage() : 'en';
  }
  function locale() { var l = lang(); return l === 'tr' ? 'tr-TR' : (l === 'de' ? 'de-DE' : 'en-US'); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) { var x = new Date(Date.UTC(y, m, d)); return x.getUTCFullYear() + '-' + pad(x.getUTCMonth() + 1) + '-' + pad(x.getUTCDate()); }
  function parts(s) { return { y: +s.slice(0, 4), m: +s.slice(5, 7) - 1, d: +s.slice(8, 10) }; }
  function todayIso() {
    try { if (global.WwTime) return global.WwTime.todayKey(); } catch (e) { }
    var n = new Date(); return iso(n.getFullYear(), n.getMonth(), n.getDate());
  }
  function addDays(s, n) { var p = parts(s); return iso(p.y, p.m, p.d + n); }
  function fmt(s, opts) {
    var p = parts(s);
    try { return new Intl.DateTimeFormat(locale(), Object.assign({ timeZone: 'UTC' }, opts)).format(new Date(Date.UTC(p.y, p.m, p.d))); }
    catch (e) { return s; }
  }

  /* Ay ızgarası: pazartesiden başlayan 6 hafta (42 gün). Saf fonksiyon (testlerde de kullanılır). */
  function monthCells(year, month, opts) {
    opts = opts || {};
    var lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
    var cells = [];
    for (var i = 0; i < 42; i++) {
      var d = iso(year, month, 1 - lead + i);
      cells.push({
        iso: d,
        day: +d.slice(8, 10),
        out: parts(d).m !== ((month % 12) + 12) % 12,
        disabled: (opts.min && d < opts.min) || (opts.max && d > opts.max) || false
      });
    }
    return cells;
  }

  var pop = null, cur = null; // cur: { input, trigger, y, m, focus }

  function injectCss() {
    if (document.getElementById('ww-dp-css')) return;
    var s = document.createElement('style');
    s.id = 'ww-dp-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function bounds(input) {
    return {
      min: ISO_RE.test(input.min || '') ? input.min : '',
      max: ISO_RE.test(input.max || '') ? input.max : ''
    };
  }

  function render() {
    if (!pop || !cur) return;
    var b = bounds(cur.input), sel = nativeValue.get.call(cur.input), today = todayIso();
    var first = iso(cur.y, cur.m, 1), lastOfMonth = iso(cur.y, cur.m + 1, 0);
    var html = '<div class="ww-dp-head">' +
      '<button type="button" class="ww-dp-nav" data-nav="-1" aria-label="' + t('datepicker.prev_month', 'Previous month') + '"' + (b.min && first <= b.min ? ' disabled' : '') + '>' + ICON_PREV + '</button>' +
      '<div class="ww-dp-title" aria-live="polite">' + fmt(first, { month: 'long', year: 'numeric' }) + '</div>' +
      '<button type="button" class="ww-dp-nav" data-nav="1" aria-label="' + t('datepicker.next_month', 'Next month') + '"' + (b.max && lastOfMonth >= b.max ? ' disabled' : '') + '>' + ICON_NEXT + '</button>' +
      '</div><div class="ww-dp-grid" role="grid">';
    // 2024-01-01 pazartesi
    for (var w = 0; w < 7; w++) html += '<div class="ww-dp-wd">' + fmt(iso(2024, 0, 1 + w), { weekday: 'short' }) + '</div>';
    monthCells(cur.y, cur.m, b).forEach(function (c) {
      var cls = 'ww-dp-day' + (c.out ? ' out' : '') + (c.iso === today ? ' today' : '') + (c.iso === sel ? ' sel' : '');
      html += '<button type="button" class="' + cls + '" data-date="' + c.iso + '" tabindex="' + (c.iso === cur.focus ? '0' : '-1') + '"' +
        (c.iso === sel ? ' aria-selected="true"' : '') + ' aria-label="' + fmt(c.iso, { dateStyle: 'full' }) + '"' + (c.disabled ? ' disabled' : '') + '>' + c.day + '</button>';
    });
    var todayOff = (b.min && today < b.min) || (b.max && today > b.max);
    html += '</div><div class="ww-dp-foot"><button type="button" class="ww-dp-today"' + (todayOff ? ' disabled' : '') + '>' + t('datepicker.today', 'Today') + '</button></div>';
    pop.innerHTML = html;
  }

  function place() {
    if (!pop || !cur) return;
    var r = cur.trigger.getBoundingClientRect(), m = 8;
    var w = pop.offsetWidth || 288, h = pop.offsetHeight || 340;
    var top = r.bottom + 6;
    if (top + h > innerHeight - m) top = r.top - h - 6 >= m ? r.top - h - 6 : Math.max(m, innerHeight - h - m);
    var left = Math.min(Math.max(m, r.left), innerWidth - w - m);
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';
  }

  function focusDay() {
    var el = pop && cur && pop.querySelector('[data-date="' + cur.focus + '"]');
    if (el) el.focus();
  }

  function moveFocus(n) {
    var b = bounds(cur.input), next = addDays(cur.focus, n);
    if ((b.min && next < b.min) || (b.max && next > b.max)) return;
    cur.focus = next;
    var p = parts(next);
    if (p.y !== cur.y || p.m !== cur.m) { cur.y = p.y; cur.m = p.m; }
    render();
    focusDay();
  }

  function open(input, trigger) {
    injectCss();
    if (!pop) {
      pop = document.createElement('div');
      pop.className = 'ww-dp';
      pop.setAttribute('role', 'dialog');
      pop.addEventListener('mousedown', function (e) { e.preventDefault(); }); // düğmeye odak kalsın, dışarı tıklama sayılmasın
      pop.addEventListener('click', onPopClick);
      pop.addEventListener('keydown', onPopKey);
      document.body.appendChild(pop);
    }
    var v = nativeValue.get.call(input), b = bounds(input);
    var base = ISO_RE.test(v) ? v : todayIso();
    if (b.max && base > b.max) base = b.max;
    if (b.min && base < b.min) base = b.min;
    var p = parts(base);
    cur = { input: input, trigger: trigger, y: p.y, m: p.m, focus: base };
    pop.setAttribute('aria-label', (input.labels && input.labels[0] && input.labels[0].textContent) || t('datepicker.label', 'Choose a date'));
    trigger.setAttribute('aria-expanded', 'true');
    render();
    place();
    pop.classList.add('open');
    focusDay();
    document.addEventListener('mousedown', onOutside, true);
    window.addEventListener('keydown', onEsc, true);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', onScroll, true);
  }

  function close(refocus) {
    if (!cur) return;
    var trigger = cur.trigger;
    trigger.setAttribute('aria-expanded', 'false');
    pop.classList.remove('open');
    cur = null;
    document.removeEventListener('mousedown', onOutside, true);
    window.removeEventListener('keydown', onEsc, true);
    window.removeEventListener('resize', close);
    document.removeEventListener('scroll', onScroll, true);
    if (refocus === true) trigger.focus();
  }

  function pick(d) {
    var input = cur.input;
    close(true);
    if (nativeValue.get.call(input) === d) return;
    input.value = d; // örnek üzerindeki setter düğmeyi günceller
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function onPopClick(e) {
    var nav = e.target.closest('[data-nav]');
    if (nav && !nav.disabled) {
      var p = parts(iso(cur.y, cur.m + Number(nav.getAttribute('data-nav')), 1));
      cur.y = p.y; cur.m = p.m;
      var b = bounds(cur.input);
      cur.focus = iso(p.y, p.m, 1);
      if (b.min && cur.focus < b.min) cur.focus = b.min;
      if (b.max && cur.focus > b.max) cur.focus = b.max;
      render();
      return;
    }
    var day = e.target.closest('[data-date]');
    if (day && !day.disabled) return pick(day.getAttribute('data-date'));
    if (e.target.closest('.ww-dp-today') && !e.target.closest('.ww-dp-today').disabled) pick(todayIso());
  }

  function onPopKey(e) {
    if (!cur || !e.target.closest('[data-date]')) return;
    var step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step) { e.preventDefault(); moveFocus(step); }
  }

  function onOutside(e) {
    if (!cur || pop.contains(e.target) || cur.trigger.contains(e.target)) return;
    close();
  }
  // Escape yalnızca takvimi kapatsın, arkadaki pencereyi değil
  function onEsc(e) {
    if (e.key !== 'Escape' || !cur) return;
    e.preventDefault();
    e.stopPropagation();
    close(true);
  }
  function onScroll(e) { if (cur && !pop.contains(e.target)) place(); }

  function attach(input) {
    if (!input || input._wwDatePicker) return;
    injectCss();
    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = input.className + ' ww-dp-trigger';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    if (input.id) {
      trigger.id = input.id + '-trigger';
      // <label> eskisi gibi alanı açsın
      document.querySelectorAll('label[for="' + input.id + '"]').forEach(function (l) { l.htmlFor = trigger.id; });
    }
    trigger.innerHTML = '<span class="ww-dp-label"></span>' + ICON_CAL;
    var label = trigger.firstChild;

    function refresh() {
      var v = nativeValue.get.call(input);
      label.textContent = ISO_RE.test(v) ? fmt(v, { day: 'numeric', month: 'long', year: 'numeric' }) : t('datepicker.placeholder', 'Select a date');
      trigger.classList.toggle('is-empty', !ISO_RE.test(v));
      trigger.disabled = input.disabled;
    }

    Object.defineProperty(input, 'value', {
      configurable: true,
      get: function () { return nativeValue.get.call(this); },
      set: function (v) { nativeValue.set.call(this, v); refresh(); }
    });
    input.addEventListener('change', refresh);
    input.classList.add('ww-dp-native');
    input.setAttribute('tabindex', '-1');
    input.insertAdjacentElement('afterend', trigger);
    trigger.addEventListener('click', function () {
      if (cur && cur.input === input) close(); else { close(); open(input, trigger); }
    });
    input._wwDatePicker = { refresh: refresh, trigger: trigger };
    refresh();
  }

  global.WwDatePicker = { attach: attach, monthCells: monthCells };
})(typeof window !== 'undefined' ? window : globalThis);
