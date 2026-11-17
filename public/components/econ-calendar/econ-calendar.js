// ============================================================
// WAWE - ECONOMIC CALENDAR: navbar countdown badge, calendar panel, pre-news alerts.
// Data: the econ-calendar Edge Function (Forex Factory's weekly export cached server-side, migration 202611170001).
//   - Badge (#nav-econ, in Navbar.astro and navbar.js getNavbarHTML): the next event that passes the filters, with a live
//     countdown ("USD Retail Sales · 42 dk"); "now" for 2 minutes after the time. Click: the week's calendar by day.
//   - Filters (impact: high | medium = high+medium | all; currencies: none chosen = all) apply to the badge, the list and
//     the alerts. Stored in this browser (localStorage ww_econ_prefs), like the overtrade settings.
//   - Alerts while the app is open in any tab: `minutes` before an event an on-screen card (events at the same minute are
//     grouped), plus a desktop notification when the member turned it on and the browser allows it. One tab claims each
//     alert (localStorage ww_econ_alerted), so several open tabs alert once.
//   - The export has no actual results and only this week: the panel says so; after the last event "next week's calendar
//     is not out yet".
// Pure helpers are exported on window.WWEcon._test for tests/econ-calendar.test.js.
// ============================================================
(function (global) {
  'use strict';
  if (global.WWEcon && global.WWEcon.ready) return;

  var PREF_KEY = 'ww_econ_prefs', ALERTED_KEY = 'ww_econ_alerted', CACHE_KEY = 'ww_econ_cache';
  var REFRESH_MS = 15 * 60e3, CACHE_MS = 5 * 60e3, NOW_WINDOW_MS = 2 * 60e3;
  var FALLBACK_URL = 'https://odasapyhtdopbnlfhwde.supabase.co';
  var MINUTES = [5, 10, 15, 30, 60];
  var IMPACT_RANK = { high: 3, medium: 2, low: 1, holiday: 0 };

  // ---------------------------------------------------------------- helpers
  function _t(key, fallback, params) {
    var s = fallback;
    try { if (global.i18n && typeof global.i18n.t === 'function') { var v = global.i18n.t(key, params); if (v && v !== key) s = v; } } catch (e) { /* fallback */ }
    if (params) Object.keys(params).forEach(function (k) { s = String(s).split('{' + k + '}').join(params[k]); });
    return s;
  }
  function lang() { try { var l = global.i18n && global.i18n.getCurrentLanguage && global.i18n.getCurrentLanguage(); return ['tr', 'en', 'de'].indexOf(l) >= 0 ? l : 'tr'; } catch (e) { return 'tr'; } }
  function locale() { return { tr: 'tr-TR', en: 'en-GB', de: 'de-DE' }[lang()]; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } return v; }
  function endpoint() { var c = global.WW_CONFIG || {}; return global.SUPABASE_URL || c.SUPABASE_URL || FALLBACK_URL; }
  function anonKey() { var c = global.WW_CONFIG || {}; return global.SUPABASE_ANON_KEY || c.SUPABASE_ANON_KEY || ''; }
  function session() {
    if (!global.sb || !global.sb.auth) return Promise.resolve(null);
    return global.sb.auth.getSession().then(function (r) { return r && r.data && r.data.session ? r.data.session : null; }, function () { return null; });
  }

  // ---------------------------------------------------------------- pure (tested)
  function cleanPrefs(p) {
    p = p && typeof p === 'object' ? p : {};
    return {
      impact: p.impact === 'medium' || p.impact === 'all' ? p.impact : 'high',
      ccys: Array.isArray(p.ccys) ? p.ccys.filter(function (c) { return /^[A-Z]{3}$/.test(c); }).slice(0, 12) : [],
      alert: p.alert !== false,
      minutes: MINUTES.indexOf(+p.minutes) >= 0 ? +p.minutes : 15,
      desktop: p.desktop === true,
    };
  }
  function passes(e, prefs) {
    var min = prefs.impact === 'high' ? 3 : prefs.impact === 'medium' ? 2 : 0;
    if ((IMPACT_RANK[e.impact] || 0) < min) return false;
    return !prefs.ccys.length || prefs.ccys.indexOf(e.currency) >= 0;
  }
  // the badge's event: the first one that passes, from NOW_WINDOW_MS ago on; events at the same time come together
  function nextGroup(events, prefs, now) {
    var list = events.filter(function (e) { return passes(e, prefs) && Date.parse(e.event_at) > now - NOW_WINDOW_MS; })
      .sort(function (a, b) { return Date.parse(a.event_at) - Date.parse(b.event_at) || (IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact]); });
    if (!list.length) return null;
    var t = list[0].event_at;
    return { at: Date.parse(t), events: list.filter(function (e) { return e.event_at === t; }) };
  }
  // "2g 4s" / "3s 12dk" / "42 dk" / "09:41" (under 10 minutes) / null = now
  function countdown(ms) {
    if (ms <= 0) return null;
    var s = Math.ceil(ms / 1000), m = Math.ceil(ms / 60000);
    if (ms < 10 * 60e3) { var mm = Math.floor(s / 60), ss = s % 60; return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss; }
    if (m < 60) return _t('econ.min', '{n} dk', { n: m });
    var h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d >= 1) return _t('econ.dh', '{d}g {h}s', { d: d, h: h % 24 });
    return _t('econ.hm', '{h}s {m}dk', { h: h, m: m % 60 });
  }
  // groups that are due for an alert now: start within `minutes`, not started, not alerted
  function dueAlerts(events, prefs, now, alerted) {
    if (!prefs.alert) return [];
    var groups = {};
    events.forEach(function (e) {
      if (!passes(e, prefs)) return;
      var t = Date.parse(e.event_at);
      if (t <= now || t - now > prefs.minutes * 60e3 || alerted[e.id]) return;
      (groups[e.event_at] = groups[e.event_at] || []).push(e);
    });
    return Object.keys(groups).sort().map(function (k) { return { at: Date.parse(k), events: groups[k] }; });
  }
  function groupTop(g) { return g.events.slice().sort(function (a, b) { return IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact]; })[0]; }
  function groupMore(g) { return g.events.length > 1 ? _t('econ.more', '+{n}', { n: g.events.length - 1 }) : ''; }
  function groupTitle(g) { var top = groupTop(g), more = groupMore(g); return top.currency + ' ' + top.title + (more ? ' ' + more : ''); }

  // ---------------------------------------------------------------- state
  var S = { events: [], coversUntil: null, fetchedAt: 0, loading: false, error: false, open: false, prefs: cleanPrefs(store(PREF_KEY)), timer: null, tickSig: '' };
  function savePrefs() { store(PREF_KEY, S.prefs); }

  function load(force) {
    if (S.loading) return Promise.resolve();
    var cached = store(CACHE_KEY);
    if (!force && cached && Date.now() - cached.at < CACHE_MS && Array.isArray(cached.events)) {
      S.events = cached.events; S.coversUntil = cached.covers_until || null; S.fetchedAt = cached.at; S.error = false;
      render(); return Promise.resolve();
    }
    S.loading = true;
    return session().then(function (s) {
      if (!s) { S.loading = false; return; }
      return fetch(endpoint() + '/functions/v1/econ-calendar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token, apikey: anonKey() }, body: '{}' })
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (j) {
          S.loading = false;
          if (!j || !j.ok || !Array.isArray(j.events)) { S.error = !S.events.length; render(); return; }
          S.events = j.events; S.coversUntil = j.covers_until || null; S.fetchedAt = Date.now(); S.error = false;
          store(CACHE_KEY, { at: S.fetchedAt, events: j.events, covers_until: S.coversUntil });
          render();
        });
    }).catch(function () { S.loading = false; S.error = !S.events.length; render(); });
  }

  // ---------------------------------------------------------------- badge
  function host() { return document.getElementById('nav-econ'); }
  function mount() {
    var h = host();
    if (!h || h.getAttribute('data-econ') === '1') return !!h;
    h.setAttribute('data-econ', '1');
    h.innerHTML = '<button type="button" class="econ-btn" id="econ-btn" aria-haspopup="dialog" aria-expanded="false"></button>' +
      '<div class="econ-panel" id="econ-panel" role="dialog"></div><div class="econ-alerts" id="econ-alerts" aria-live="polite"></div>';
    h.querySelector('#econ-btn').addEventListener('click', function (ev) { ev.stopPropagation(); toggle(); });
    h.querySelector('#econ-panel').addEventListener('click', onPanelClick);
    h.querySelector('#econ-panel').addEventListener('change', onPanelChange);
    return true;
  }
  function renderBadge() {
    var b = document.getElementById('econ-btn');
    if (!b) return;
    var now = Date.now(), g = nextGroup(S.events, S.prefs, now);
    var sig, html, cls = 'econ-btn';
    if (!g) {
      sig = 'none|' + lang() + '|' + S.events.length;
      html = '<span class="econ-ico" aria-hidden="true"></span><span class="econ-txt econ-quiet">' + esc(S.events.length ? _t('econ.none_short', 'Haber yok') : _t('econ.title', 'Haberler')) + '</span>';
      b.title = S.events.length ? _t('econ.none_left', 'Bu hafta filtrene uyan haber kalmadı.') : _t('econ.title_long', 'Ekonomik takvim');
    } else {
      var cd = countdown(g.at - now), top = g.events[0];
      cls += ' imp-' + top.impact + (cd ? '' : ' is-now') + (g.at - now < S.prefs.minutes * 60e3 ? ' is-soon' : '');
      sig = g.at + '|' + cd + '|' + lang() + '|' + cls;
      var label = groupTitle(g), top1 = groupTop(g), more = groupMore(g);
      // the "+n" stays visible when a long title is cut
      html = '<span class="econ-dot" aria-hidden="true"></span><span class="econ-name">' + esc(top1.currency + ' ' + top1.title) + '</span>' +
        (more ? '<span class="econ-more">' + esc(more) + '</span>' : '') +
        '<span class="econ-sep" aria-hidden="true">·</span><span class="econ-cd">' + esc(cd || _t('econ.now', 'ŞİMDİ')) + '</span>';
      b.title = label + ' — ' + fmtTime(g.at) + (cd ? ' (' + cd + ')' : '');
    }
    if (sig === S.tickSig) return;
    S.tickSig = sig;
    b.className = cls;
    b.innerHTML = html;
    b.setAttribute('aria-label', b.title);
  }

  // ---------------------------------------------------------------- panel
  function fmtTime(ms) { return new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }); }
  function dayKey(ms) { var d = new Date(ms); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
  function dayLabel(ms, now) {
    var k = dayKey(ms);
    if (k === dayKey(now)) return _t('econ.today', 'Bugün');
    if (k === dayKey(now + 86400e3)) return _t('econ.tomorrow', 'Yarın');
    if (k === dayKey(now - 86400e3)) return _t('econ.yesterday', 'Dün');
    return new Date(ms).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function tz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } }

  function renderPanel() {
    var p = document.getElementById('econ-panel');
    if (!p || !S.open) return;
    var now = Date.now(), pr = S.prefs;
    var ccys = {}; S.events.forEach(function (e) { ccys[e.currency] = 1; });
    var ccyList = Object.keys(ccys).sort();
    var dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    var list = S.events.filter(function (e) { return passes(e, pr) && Date.parse(e.event_at) >= +dayStart; });
    var next = nextGroup(S.events, pr, now);
    var h = '<div class="econ-head"><div><h3>' + esc(_t('econ.title_long', 'Ekonomik takvim')) + '</h3>' +
      '<div class="econ-sub">' + esc(_t('econ.sub', 'Saatler: {tz} · Kaynak: Forex Factory', { tz: tz() || 'local' })) + '</div></div>' +
      '<button type="button" class="econ-x" data-act="close" aria-label="' + esc(_t('econ.close', 'Kapat')) + '">×</button></div>';
    h += '<div class="econ-filters"><div class="econ-seg" role="group">' +
      [['high', _t('econ.f_high', 'Yüksek')], ['medium', _t('econ.f_medium', 'Yüksek + Orta')], ['all', _t('econ.f_all', 'Tümü')]].map(function (o) {
        return '<button type="button" data-act="impact" data-v="' + o[0] + '" class="' + (pr.impact === o[0] ? 'on' : '') + '">' + esc(o[1]) + '</button>';
      }).join('') + '</div><div class="econ-ccys">' +
      '<button type="button" data-act="ccy" data-v="" class="' + (pr.ccys.length ? '' : 'on') + '">' + esc(_t('econ.all_ccy', 'Hepsi')) + '</button>' +
      ccyList.map(function (c) { return '<button type="button" data-act="ccy" data-v="' + c + '" class="' + (pr.ccys.indexOf(c) >= 0 ? 'on' : '') + '">' + c + '</button>'; }).join('') +
      '</div></div>';
    h += '<div class="econ-list">';
    if (S.error) h += '<div class="econ-empty">' + esc(_t('econ.error', 'Takvim şu an yüklenemedi. Biraz sonra tekrar dene.')) + '</div>';
    else if (!S.events.length) h += '<div class="econ-empty">' + esc(S.loading ? _t('econ.loading', 'Yükleniyor…') : _t('econ.empty', 'Takvim henüz yüklenmedi.')) + '</div>';
    else if (!list.length) h += '<div class="econ-empty">' + esc(_t('econ.none_filter', 'Bu filtrelere uyan haber yok.')) + '</div>';
    else {
      var lastDay = '';
      list.forEach(function (e) {
        var t = Date.parse(e.event_at), dk = dayKey(t);
        if (dk !== lastDay) { lastDay = dk; h += '<div class="econ-day">' + esc(dayLabel(t, now)) + '</div>'; }
        var past = t < now - NOW_WINDOW_MS, isNext = next && next.at === t;
        var vals = [];
        if (e.forecast) vals.push(_t('econ.forecast', 'Bkl') + ' ' + e.forecast);
        if (e.previous) vals.push(_t('econ.previous', 'Önc') + ' ' + e.previous);
        h += '<div class="econ-row imp-' + e.impact + (past ? ' past' : '') + (isNext ? ' next' : '') + '">' +
          '<span class="econ-time">' + (e.impact === 'holiday' ? esc(_t('econ.allday', 'Tatil')) : esc(fmtTime(t))) + '</span>' +
          '<span class="econ-dot" title="' + esc(_t('econ.impact_' + e.impact, e.impact)) + '"></span>' +
          '<span class="econ-ccy">' + esc(e.currency) + '</span>' +
          '<span class="econ-title">' + esc(e.title) + (vals.length ? '<small>' + esc(vals.join(' · ')) + '</small>' : '') + '</span>' +
          (isNext ? '<span class="econ-cd">' + esc(countdown(t - now) || _t('econ.now', 'ŞİMDİ')) + '</span>' : '') + '</div>';
      });
      if (S.coversUntil && Date.parse(S.coversUntil) < now + 7 * 86400e3) h += '<div class="econ-note">' + esc(_t('econ.week_end', 'Gelecek haftanın takvimi henüz yayınlanmadı.')) + '</div>';
    }
    h += '</div>';
    var perm = global.Notification ? global.Notification.permission : 'unsupported';
    h += '<div class="econ-foot"><label class="econ-sw"><input type="checkbox" data-act="alert"' + (pr.alert ? ' checked' : '') + '> ' +
      esc(_t('econ.alert', 'Haberden önce uyar')) + '</label><select data-act="minutes" aria-label="' + esc(_t('econ.minutes', 'Kaç dakika önce')) + '"' + (pr.alert ? '' : ' disabled') + '>' +
      MINUTES.map(function (m) { return '<option value="' + m + '"' + (pr.minutes === m ? ' selected' : '') + '>' + esc(_t('econ.min_before', '{n} dk önce', { n: m })) + '</option>'; }).join('') + '</select>' +
      (perm === 'unsupported' ? '' : '<label class="econ-sw"><input type="checkbox" data-act="desktop"' + (pr.desktop && perm === 'granted' ? ' checked' : '') + (pr.alert && perm !== 'denied' ? '' : ' disabled') + '> ' +
        esc(perm === 'denied' ? _t('econ.desktop_denied', 'Masaüstü bildirimi tarayıcıda engelli') : _t('econ.desktop', 'Masaüstü bildirimi')) + '</label>') +
      '<div class="econ-fine">' + esc(_t('econ.fine', 'Uyarılar uygulama açıkken çalışır. Açıklanan sonuçlar (actual) bu takvimde yok.')) + '</div></div>';
    var sc = p.querySelector('.econ-list'), keep = sc && S.listScroll != null ? S.listScroll : null;
    p.innerHTML = h;
    sc = p.querySelector('.econ-list');
    if (!sc) return;
    // first render after opening: the next event near the top; later renders (filters) keep the position
    if (keep != null) sc.scrollTop = keep;
    else { var nx = sc.querySelector('.econ-row.next'); if (nx) sc.scrollTop = Math.max(0, nx.offsetTop - sc.offsetTop - 34); }
    S.listScroll = sc.scrollTop;
    sc.addEventListener('scroll', function () { S.listScroll = sc.scrollTop; }, { passive: true });
  }
  function toggle(force) {
    var p = document.getElementById('econ-panel'), b = document.getElementById('econ-btn');
    if (!p || !b) return;
    S.open = force != null ? force : !S.open;
    S.listScroll = null;
    if (S.open && typeof global.closeAllNavDropdowns === 'function') { try { global.closeAllNavDropdowns('econ'); } catch (e) { /* ignore */ } }
    p.classList.toggle('open', S.open);
    b.setAttribute('aria-expanded', S.open ? 'true' : 'false');
    if (S.open) { renderPanel(); if (Date.now() - S.fetchedAt > CACHE_MS) load(true).then(renderPanel); }
  }
  function onPanelClick(ev) {
    ev.stopPropagation();
    var t = ev.target.closest('[data-act]');
    if (!t || t.tagName === 'INPUT' || t.tagName === 'SELECT') return;
    var act = t.getAttribute('data-act'), v = t.getAttribute('data-v');
    if (act === 'close') return toggle(false);
    if (act === 'impact') S.prefs.impact = v;
    if (act === 'ccy') {
      if (!v) S.prefs.ccys = [];
      else { var i = S.prefs.ccys.indexOf(v); if (i >= 0) S.prefs.ccys.splice(i, 1); else S.prefs.ccys.push(v); }
    }
    savePrefs(); S.tickSig = ''; render();
  }
  function onPanelChange(ev) {
    var t = ev.target, act = t.getAttribute('data-act');
    if (act === 'alert') S.prefs.alert = t.checked;
    if (act === 'minutes') S.prefs.minutes = +t.value;
    if (act === 'desktop') {
      if (!t.checked) S.prefs.desktop = false;
      else if (global.Notification) {
        var N = global.Notification;
        Promise.resolve(N.permission === 'granted' ? 'granted' : N.requestPermission()).then(function (p) {
          S.prefs.desktop = p === 'granted'; savePrefs(); renderPanel();
        });
        return;
      }
    }
    savePrefs(); S.tickSig = ''; render();
  }

  // ---------------------------------------------------------------- alerts
  function claim(ids) {
    var a = store(ALERTED_KEY) || {}, now = Date.now(), fresh = {};
    Object.keys(a).forEach(function (k) { if (now - a[k] < 2 * 86400e3) fresh[k] = a[k]; });   // keep two days
    if (ids.some(function (id) { return fresh[id]; })) return false;
    ids.forEach(function (id) { fresh[id] = now; });
    store(ALERTED_KEY, fresh);
    return true;
  }
  function checkAlerts() {
    var now = Date.now();
    dueAlerts(S.events, S.prefs, now, store(ALERTED_KEY) || {}).forEach(function (g) {
      if (!claim(g.events.map(function (e) { return e.id; }))) return;
      var mins = Math.max(1, Math.round((g.at - now) / 60000));
      var title = groupTitle(g), body = _t('econ.alert_body', '{t} · {n} dk sonra ({time})', { t: title, n: mins, time: fmtTime(g.at) });
      showCard(g, body);
      if (S.prefs.desktop && global.Notification && global.Notification.permission === 'granted') {
        try { new global.Notification(_t('econ.alert_title', 'Yaklaşan haber'), { body: body, tag: 'ww-econ-' + g.at, icon: '/favicon.svg' }); } catch (e) { /* some browsers need the SW */ }
      }
    });
  }
  function showCard(g, body) {
    var box = document.getElementById('econ-alerts');
    if (!box) return;
    var c = document.createElement('div');
    c.className = 'econ-card imp-' + g.events[0].impact;
    c.innerHTML = '<span class="econ-dot" aria-hidden="true"></span><div><b>' + esc(_t('econ.alert_title', 'Yaklaşan haber')) + '</b><div>' + esc(body) + '</div>' +
      '<small>' + esc(_t('econ.alert_tip', 'Yeni pozisyon açmadan önce spread ve kaymaya dikkat et.')) + '</small></div>' +
      '<button type="button" aria-label="' + esc(_t('econ.close', 'Kapat')) + '">×</button>';
    var close = function () { if (c.parentNode) c.parentNode.removeChild(c); };
    c.querySelector('button').addEventListener('click', function (ev) { ev.stopPropagation(); close(); });
    c.addEventListener('click', function () { close(); toggle(true); });
    box.appendChild(c);
    setTimeout(close, 60e3);
  }

  // ---------------------------------------------------------------- loop
  function render() { if (!mount()) return; renderBadge(); renderPanel(); }
  function tick() {
    if (!mount()) return;
    renderBadge();
    if (S.open) { var p = document.getElementById('econ-panel'), cd = p && p.querySelector('.econ-row.next .econ-cd'); if (cd) { var g = nextGroup(S.events, S.prefs, Date.now()); cd.textContent = g ? (countdown(g.at - Date.now()) || _t('econ.now', 'ŞİMDİ')) : ''; } }
    checkAlerts();
    if (Date.now() - S.fetchedAt > REFRESH_MS && !document.hidden) load(true);
  }
  function start() {
    if (S.timer) return;
    render();
    load(false);
    S.timer = setInterval(tick, 1000);
    // capture: the bell and other navbar buttons stop their clicks from bubbling
    document.addEventListener('click', function (ev) { if (S.open && host() && !host().contains(ev.target)) toggle(false); }, true);
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && S.open) toggle(false); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && Date.now() - S.fetchedAt > CACHE_MS) load(true); });
    document.addEventListener('astro:after-swap', function () { toggle(false); S.tickSig = ''; render(); });
    window.addEventListener('storage', function (e) {
      if (e.key === PREF_KEY) { S.prefs = cleanPrefs(store(PREF_KEY)); S.tickSig = ''; render(); }
      if (e.key === 'ww_language') { S.tickSig = ''; render(); }
    });
    if (global.i18n && typeof global.i18n.onChange === 'function') global.i18n.onChange(function () { S.tickSig = ''; render(); });
    if (global.sb && global.sb.auth && typeof global.sb.auth.onAuthStateChange === 'function') {
      global.sb.auth.onAuthStateChange(function (evt) { if (evt === 'SIGNED_IN' && !S.events.length) load(true); });
    }
  }

  global.WWEcon = { ready: true, reload: function () { return load(true); }, open: function () { toggle(true); },
    _test: { cleanPrefs: cleanPrefs, passes: passes, nextGroup: nextGroup, countdown: countdown, dueAlerts: dueAlerts, groupTitle: groupTitle, groupMore: groupMore } };
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(typeof window !== 'undefined' ? window : globalThis);
