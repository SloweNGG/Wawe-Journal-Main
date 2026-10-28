// Backtest v2: date and range panel of the replay toolbar (window.WwBtRange). One button opens a calendar: the first click picks
// the start, the second the end; both have a time field, presets set the end from the start. Apply goes to the start (when it
// changed) and keeps the end; the replay pauses when it reaches the end. Everything works on local strings ('YYYY-MM-DD',
// 'HH:MM') in the user's time zone; the page converts them to seconds. Pure helpers are unit tested; create() needs the DOM.
(function (global) {
  'use strict';

  var KEY_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^\d{2}:\d{2}$/;
  var PRESETS = [{ id: '1d', days: 1 }, { id: '1w', days: 7 }, { id: '1m', months: 1 }, { id: '3m', months: 3 }];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(y, m, d) { var x = new Date(Date.UTC(y, m, d)); return x.getUTCFullYear() + '-' + pad(x.getUTCMonth() + 1) + '-' + pad(x.getUTCDate()); }
  function parts(k) { return { y: +k.slice(0, 4), m: +k.slice(5, 7) - 1, d: +k.slice(8, 10) }; }
  function addDays(k, n) { var p = parts(k); return key(p.y, p.m, p.d + n); }
  // months: the same day, or the last day of a shorter month (Jan 31 + 1 month = Feb 28/29)
  function addMonths(k, n) {
    var p = parts(k), last = new Date(Date.UTC(p.y, p.m + n + 1, 0)).getUTCDate();
    return key(p.y, p.m + n, Math.min(p.d, last));
  }
  // the end a preset gives: same time of day, N days / months after the start day
  function presetEnd(startKey, id) {
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].id !== id) continue;
      return PRESETS[i].days ? addDays(startKey, PRESETS[i].days) : addMonths(startKey, PRESETS[i].months);
    }
    return null;
  }
  // month grid from Monday: 42 days, out = other month, off = outside the data
  function monthCells(y, m, min, max) {
    var lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7, cells = [];
    for (var i = 0; i < 42; i++) {
      var k = key(y, m, 1 - lead + i);
      cells.push({ key: k, day: +k.slice(8, 10), out: parts(k).m !== ((m % 12) + 12) % 12, off: !!((min && k < min) || (max && k > max)) });
    }
    return cells;
  }
  // a day click: picking the start moves on to the end; an end before the start becomes the new start
  function pickDay(st, k) {
    var s = { start: st.start, end: st.end, active: st.active };
    if (s.active === 'start' || !s.start) { s.start = k; if (s.end && s.end < k) s.end = null; s.active = 'end'; }
    else if (k < s.start) { s.start = k; }
    else { s.end = k; }
    return s;
  }
  function splitLocal(v) { return { day: String(v || '').slice(0, 10), time: String(v || '').slice(11, 16) }; }

  // opts: trigger, t(key, fallback, vars), locale(), toLocal(sec) -> 'YYYY-MM-DDTHH:MM', fromLocal(str) -> sec | null,
  //       bounds() -> { min, max } seconds, start() -> seconds (shown on the button), now() -> seconds (the panel opens on it),
  //       end() -> seconds | null, apply(startSec, endSec, startChanged)
  function create(opts) {
    var trigger = opts.trigger, t = opts.t, pop = null, st = null;

    function fmt(local, withTime) {
      var p = splitLocal(local), d = parts(p.day), hm = p.time.split(':');
      var o = { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' };
      if (withTime) { o.hour = '2-digit'; o.minute = '2-digit'; o.hourCycle = 'h23'; }
      try { return new Intl.DateTimeFormat(opts.locale(), o).format(new Date(Date.UTC(d.y, d.m, d.d, +hm[0] || 0, +hm[1] || 0))); }
      catch (e) { return local; }
    }
    function refresh() {
      var s = opts.start(), e = opts.end();
      var lab = trigger.querySelector('.bt-rg-label');
      if (!lab) return;
      lab.textContent = s ? fmt(opts.toLocal(s), true) + (e ? '  →  ' + fmt(opts.toLocal(e), true) : '') : '—';
      trigger.classList.toggle('has-end', !!e);
    }

    function lim() {
      var b = opts.bounds();
      return { min: b && b.min ? splitLocal(opts.toLocal(b.min)).day : '', max: b && b.max ? splitLocal(opts.toLocal(b.max)).day : '' };
    }

    function render() {
      var L = lim(), first = key(st.y, st.m, 1), lastOfMonth = key(st.y, st.m + 1, 0), loc = opts.locale();
      var h = '';
      h += '<div class="bt-rg-fields">';
      ['start', 'end'].forEach(function (f) {
        var day = st[f], on = st.active === f;
        h += '<div class="bt-rg-field' + (on ? ' is-active' : '') + '">' +
          '<button type="button" class="bt-rg-pick" data-field="' + f + '" aria-pressed="' + on + '">' +
            '<span class="bt-rg-k">' + t('backtest.range.' + f, f === 'start' ? 'Başlangıç' : 'Bitiş') + '</span>' +
            '<span class="bt-rg-v">' + (day ? fmt(day + 'T00:00', false) : t('backtest.range.no_end', 'Bitiş yok')) + '</span>' +
          '</button>' +
          '<input type="time" class="bt-input bt-num bt-rg-time" data-time="' + f + '" step="60" value="' + st[f + 'Time'] + '"' + (day ? '' : ' disabled') +
            ' aria-label="' + t('backtest.range.' + f, f) + '" />' +
          (f === 'end' && day ? '<button type="button" class="bt-rg-clear" data-clear aria-label="' + t('backtest.range.no_end', 'Bitiş yok') + '">×</button>' : '') +
        '</div>';
      });
      h += '</div>';
      // month / year selects: the data can span years
      var years = [], y0 = +(L.min || first).slice(0, 4), y1 = +(L.max || first).slice(0, 4);
      for (var y = y0; y <= y1; y++) years.push(y);
      if (years.indexOf(st.y) < 0) years.push(st.y);
      h += '<div class="bt-rg-head">' +
        '<button type="button" class="bt-rg-nav" data-nav="-1" aria-label="' + t('backtest.range.prev_month', 'Önceki ay') + '"' + (L.min && first <= L.min ? ' disabled' : '') + '>‹</button>' +
        '<select class="bt-select bt-rg-month" aria-label="' + t('backtest.range.title', 'Tarih aralığı') + '">';
      for (var mo = 0; mo < 12; mo++) {
        var mk = key(st.y, mo, 1);
        var name; try { name = new Intl.DateTimeFormat(loc, { timeZone: 'UTC', month: 'long' }).format(new Date(Date.UTC(2024, mo, 1))); } catch (e) { name = String(mo + 1); }
        var moOff = (L.min && key(st.y, mo + 1, 0) < L.min) || (L.max && mk > L.max);
        h += '<option value="' + mo + '"' + (mo === st.m ? ' selected' : '') + (moOff ? ' disabled' : '') + '>' + name + '</option>';
      }
      h += '</select><select class="bt-select bt-rg-year bt-num">';
      years.sort().forEach(function (yy) { h += '<option value="' + yy + '"' + (yy === st.y ? ' selected' : '') + '>' + yy + '</option>'; });
      h += '</select>' +
        '<button type="button" class="bt-rg-nav" data-nav="1" aria-label="' + t('backtest.range.next_month', 'Sonraki ay') + '"' + (L.max && lastOfMonth >= L.max ? ' disabled' : '') + '>›</button>' +
        '</div><div class="bt-rg-grid" role="grid">';
      for (var w = 0; w < 7; w++) {
        var wd; try { wd = new Intl.DateTimeFormat(loc, { timeZone: 'UTC', weekday: 'short' }).format(new Date(Date.UTC(2024, 0, 1 + w))); } catch (e) { wd = ''; }
        h += '<div class="bt-rg-wd">' + wd + '</div>';
      }
      monthCells(st.y, st.m, L.min, L.max).forEach(function (c) {
        var inRange = st.start && st.end && c.key > st.start && c.key < st.end;
        var cls = 'bt-rg-day' + (c.out ? ' out' : '') + (inRange ? ' in' : '') + (c.key === st.start ? ' sel start' : '') + (c.key === st.end ? ' sel end' : '');
        h += '<button type="button" class="' + cls + '" data-day="' + c.key + '"' + (c.off ? ' disabled' : '') + '>' + c.day + '</button>';
      });
      h += '</div><div class="bt-rg-presets">';
      PRESETS.forEach(function (p) {
        h += '<button type="button" class="bt-rg-preset" data-preset="' + p.id + '"' + (st.start ? '' : ' disabled') + '>' + t('backtest.range.preset_' + p.id, p.id) + '</button>';
      });
      h += '</div>' +
        '<p class="bt-rg-msg" role="alert"' + (st.err ? '' : ' hidden') + '>' + (st.err || '') + '</p>' +
        '<div class="bt-rg-foot"><span class="bt-rg-hint">' + t('backtest.range.hint', 'Replay bitiş anına gelince durur.') + '</span>' +
          '<button type="button" class="btn btn-ghost bt-rg-apply" data-apply>' + t('backtest.goto.button', 'Git') + '</button></div>';
      pop.innerHTML = h;
    }

    function place() {
      var r = trigger.getBoundingClientRect(), m = 8, w = pop.offsetWidth || 320, ht = pop.offsetHeight || 420;
      var top = r.bottom + 6;
      if (top + ht > innerHeight - m) top = r.top - ht - 6 >= m ? r.top - ht - 6 : Math.max(m, innerHeight - ht - m);
      pop.style.top = top + 'px';
      pop.style.left = Math.min(Math.max(m, r.left), innerWidth - w - m) + 'px';
    }

    function open() {
      if (!pop) {
        pop = document.createElement('div');
        pop.className = 'bt-rg-pop';
        pop.id = 'bt-range-pop';
        pop.setAttribute('role', 'dialog');
        pop.setAttribute('aria-label', t('backtest.range.title', 'Tarih aralığı'));
        pop.addEventListener('click', onClick);
        pop.addEventListener('change', onChange);
        pop.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.matches('.bt-rg-time')) { e.preventDefault(); applyNow(); } });
        document.body.appendChild(pop);
      }
      var s = splitLocal(opts.toLocal(opts.now() || opts.bounds().min));
      var eSec = opts.end(), e = eSec ? splitLocal(opts.toLocal(eSec)) : null;
      var p = parts(s.day);
      st = { start: s.day, startTime: s.time, end: e ? e.day : null, endTime: e ? e.time : s.time, active: 'start', y: p.y, m: p.m, err: '',
        from: s.day + 'T' + s.time };
      render();
      pop.hidden = false;
      place();
      trigger.setAttribute('aria-expanded', 'true');
      var f = pop.querySelector('.bt-rg-day.start') || pop.querySelector('.bt-rg-pick');
      if (f) f.focus();
      document.addEventListener('mousedown', onOutside, true);
      window.addEventListener('keydown', onEsc, true);
      window.addEventListener('resize', place);
    }
    function close(refocus) {
      if (!st) return;
      st = null;
      pop.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', onOutside, true);
      window.removeEventListener('keydown', onEsc, true);
      window.removeEventListener('resize', place);
      if (refocus) trigger.focus();
    }
    function isOpen() { return !!st; }

    function show(k) { var p = parts(k); st.y = p.y; st.m = p.m; }
    function onClick(e) {
      var b = e.target.closest('button');
      if (!b || b.disabled) return;
      st.err = '';
      if (b.hasAttribute('data-nav')) { show(key(st.y, st.m + Number(b.getAttribute('data-nav')), 1)); }
      else if (b.hasAttribute('data-field')) { st.active = b.getAttribute('data-field'); if (st[st.active]) show(st[st.active]); }
      else if (b.hasAttribute('data-day')) {
        var s = pickDay(st, b.getAttribute('data-day'));
        st.start = s.start; st.end = s.end; st.active = s.active;
      }
      else if (b.hasAttribute('data-preset')) { st.end = presetEnd(st.start, b.getAttribute('data-preset')); st.endTime = st.startTime; st.active = 'end'; show(st.end); }
      else if (b.hasAttribute('data-clear')) { st.end = null; st.active = 'end'; }
      else if (b.hasAttribute('data-apply')) { return applyNow(); }
      else return;
      render();
      var day = b.getAttribute('data-day'), again = day && pop.querySelector('[data-day="' + day + '"]');
      if (again) again.focus();
    }
    function onChange(e) {
      var el = e.target;
      if (el.matches('.bt-rg-time')) { if (TIME_RE.test(el.value)) st[el.getAttribute('data-time') + 'Time'] = el.value; return; }
      if (el.matches('.bt-rg-month')) st.m = +el.value;
      else if (el.matches('.bt-rg-year')) st.y = +el.value;
      else return;
      render();
    }
    function applyNow() {
      var s = opts.fromLocal(st.start + 'T' + st.startTime);
      var e = st.end ? opts.fromLocal(st.end + 'T' + st.endTime) : null;
      if (s === null || (st.end && e === null)) return;
      if (e !== null && e <= s) { st.err = t('backtest.range.end_before_start', 'Bitiş başlangıçtan sonra olmalı.'); render(); return; }
      var changed = st.start + 'T' + st.startTime !== st.from;
      close(true);
      opts.apply(s, e, changed);
      refresh();
    }
    function onOutside(e) { if (st && !pop.contains(e.target) && !trigger.contains(e.target)) close(false); }
    function onEsc(e) { if (e.key !== 'Escape' || !st) return; e.preventDefault(); e.stopPropagation(); close(true); }

    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.addEventListener('click', function () { if (st) close(false); else open(); });

    function destroy() { close(false); if (pop) { pop.remove(); pop = null; } }

    return { refresh: refresh, close: close, isOpen: isOpen, fmt: fmt, destroy: destroy };
  }

  global.WwBtRange = { PRESETS: PRESETS, addDays: addDays, addMonths: addMonths, presetEnd: presetEnd, monthCells: monthCells, pickDay: pickDay, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
