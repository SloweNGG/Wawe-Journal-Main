// ============================================================
// WAWE - ECONOMIC CALENDAR: navbar countdown badge, calendar panel, pre-news alerts, "ask the coach".
// Data: the econ-calendar Edge Function (the weekly exports of Forex Factory, CryptoCraft, MetalsMine and EnergyExch,
// merged and cached server-side, migrations 202611170001-0002), with the member's pairs (from their trades) and a catalog
// of popular pairs. Pair -> currencies / market comes from the server only. An event moves a pair when (same rule as
// _shared/econ-calendar.ts moves()): it is Forex Factory news in one of the pair's currencies, or news of the pair's own
// market site (EnergyExch for USOIL, MetalsMine for XAU/USD, CryptoCraft for BTC/USD) in its currency or global ("ALL").
//   - Badge (#nav-econ, in Navbar.astro and navbar.js getNavbarHTML): the next event that passes the filters, the member's
//     pair it moves and a live countdown ("EUR/USD · USD Retail Sales · 42 dk"); "now" for 2 minutes after the time.
//   - Panel: same look as the notification panel (header, tab rows, body, footer; its own class names because navbar.js
//     drives every .bell-tab-btn on the page). Impact tabs with counts; pair chips: "My pairs" (default, from the trades),
//     "All", or any pairs picked (a pair = the news of both its currencies). Each event lists the pairs it moves.
//   - Filters, alert settings: this browser (localStorage ww_econ_prefs). pairs null = my pairs, [] = all, [..] = picked.
//   - Alerts while the app is open in any tab: `minutes` before an event an on-screen card (same-minute events grouped),
//     plus a desktop notification when turned on and allowed. One tab claims each alert (localStorage ww_econ_alerted).
//   - "Ask the coach" (panel header and each event): opens the AI coach with the question (window.WwAiCoach.ask); the
//     coach reads the same calendar on the server (ai-coach economic_calendar).
//   - The export has no actual results and only this week: the panel says so.
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
  var MARKET_SOURCE = { fx: 'ff', crypto: 'cc', metals: 'mm', energy: 'ee' };
  var SOURCE_NAMES = { ff: 'Forex Factory', cc: 'CryptoCraft', mm: 'MetalsMine', ee: 'EnergyExch' };
  var MARKET_FALLBACK = { energy: 'Enerji', metals: 'Metal', crypto: 'Kripto' };
  var SVG_X = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var SVG_SPARK = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>';

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
  function coach() { return global.WwAiCoach && typeof global.WwAiCoach.ask === 'function' ? global.WwAiCoach : null; }

  // ---------------------------------------------------------------- pure (tested)
  function cleanPrefs(p) {
    p = p && typeof p === 'object' ? p : {};
    return {
      impact: p.impact === 'medium' || p.impact === 'all' ? p.impact : 'high',
      pairs: Array.isArray(p.pairs) ? p.pairs.filter(function (x) { return typeof x === 'string' && /^[A-Z0-9/]{2,12}$/.test(x); }).slice(0, 20) : null,
      alert: p.alert !== false,
      minutes: MINUTES.indexOf(+p.minutes) >= 0 ? +p.minutes : 15,
      desktop: p.desktop === true,
    };
  }
  // the pairs the filter uses: null = the member's pairs; [] = every pair (no pair filter)
  function activePairs(prefs, mine, catalog) {
    if (prefs.pairs === null) return mine.slice();
    var all = mine.concat(catalog);
    return prefs.pairs.map(function (l) { for (var i = 0; i < all.length; i++) if (all[i].label === l) return all[i]; return null; }).filter(Boolean);
  }
  function sourcesOf(e) {
    var k = e && e.impacts && typeof e.impacts === 'object' ? Object.keys(e.impacts).filter(function (x) { return SOURCE_NAMES[x]; }) : [];
    return k.length ? k : ['ff'];
  }
  function moves(p, e) {
    var src = sourcesOf(e), own = MARKET_SOURCE[p.market] || 'ff';
    if (src.indexOf('ff') < 0 && src.indexOf(own) < 0) return false;     // another market's news
    if (e.currency === 'ALL') return true;                               // global news of a market it is in
    return p.currencies.indexOf(e.currency) >= 0;
  }
  function affects(pairs, e) { return pairs.filter(function (p) { return moves(p, e); }).map(function (p) { return p.label; }); }
  // the market of news that is not on Forex Factory (for the row's tag); null for Forex Factory news
  function marketOf(e) {
    var src = sourcesOf(e);
    if (src.indexOf('ff') >= 0) return null;
    for (var m in MARKET_SOURCE) if (MARKET_SOURCE[m] === src[0]) return m;
    return null;
  }
  function passes(e, prefs, pairs) {
    var min = prefs.impact === 'high' ? 3 : prefs.impact === 'medium' ? 2 : 0;
    if ((IMPACT_RANK[e.impact] || 0) < min) return false;
    return !pairs.length || affects(pairs, e).length > 0;
  }
  // a pair chip clicked: from "my pairs" the picked list starts as my pairs; nothing left = all
  function togglePair(prefs, mine, label) {
    var cur = prefs.pairs === null ? mine.map(function (p) { return p.label; }) : prefs.pairs.slice();
    var i = cur.indexOf(label);
    if (i >= 0) cur.splice(i, 1); else cur.push(label);
    return cur;
  }
  // the badge's event: the first one that passes, from NOW_WINDOW_MS ago on; events at the same time come together
  function nextGroup(events, prefs, pairs, now) {
    var list = events.filter(function (e) { return passes(e, prefs, pairs) && Date.parse(e.event_at) > now - NOW_WINDOW_MS; })
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
  // groups due for an alert now: start within `minutes`, not started, not alerted
  function dueAlerts(events, prefs, pairs, now, alerted) {
    if (!prefs.alert) return [];
    var groups = {};
    events.forEach(function (e) {
      if (!passes(e, prefs, pairs)) return;
      var t = Date.parse(e.event_at);
      if (t <= now || t - now > prefs.minutes * 60e3 || alerted[e.id]) return;
      (groups[e.event_at] = groups[e.event_at] || []).push(e);
    });
    return Object.keys(groups).sort().map(function (k) { return { at: Date.parse(k), events: groups[k] }; });
  }
  function groupTop(g) { return g.events.slice().sort(function (a, b) { return IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact]; })[0]; }
  function groupMore(g) { return g.events.length > 1 ? _t('econ.more', '+{n}', { n: g.events.length - 1 }) : ''; }
  function ccyText(c) { return c === 'ALL' ? _t('econ.global', 'Küresel') : c; }
  function groupTitle(g) { var top = groupTop(g), more = groupMore(g); return ccyText(top.currency) + ' ' + top.title + (more ? ' ' + more : ''); }
  // the pairs a group moves (the event's own currency, any event of the group), for the badge and the alerts
  function groupPairs(g, pairs) {
    var out = [];
    g.events.forEach(function (e) { affects(pairs, e).forEach(function (l) { if (out.indexOf(l) < 0) out.push(l); }); });
    return out;
  }

  // ---------------------------------------------------------------- state
  var S = { events: [], mine: [], catalog: [], coversUntil: null, fetchedAt: 0, loading: false, error: false, open: false,
    prefs: cleanPrefs(store(PREF_KEY)), timer: null, tickSig: '', listScroll: null };
  function savePrefs() { store(PREF_KEY, S.prefs); changed(); }
  function pairs() { return activePairs(S.prefs, S.mine, S.catalog); }
  // pairs shown under each event: the active filter, else the member's own
  function shownPairs() { var p = pairs(); return p.length ? p : S.mine; }
  function cleanPairs(list) {
    return (Array.isArray(list) ? list : []).filter(function (p) { return p && typeof p.label === 'string' && Array.isArray(p.currencies); })
      .map(function (p) { return { label: p.label, currencies: p.currencies.filter(function (c) { return /^[A-Z]{3}$/.test(c); }), market: MARKET_SOURCE[p.market] ? p.market : 'fx' }; });
  }
  function apply(d) {
    S.events = Array.isArray(d.events) ? d.events : [];
    S.mine = cleanPairs(d.pairs); S.catalog = cleanPairs(d.catalog);
    S.coversUntil = d.covers_until || null; S.error = false;
  }

  function load(force) {
    if (S.loading) return Promise.resolve();
    var cached = store(CACHE_KEY);
    if (!force && cached && Date.now() - cached.at < CACHE_MS && Array.isArray(cached.events)) {
      apply(cached); S.fetchedAt = cached.at; render(); return Promise.resolve();
    }
    S.loading = true;
    return session().then(function (s) {
      if (!s) { S.loading = false; return; }
      return fetch(endpoint() + '/functions/v1/econ-calendar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token, apikey: anonKey() }, body: '{}' })
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (j) {
          S.loading = false;
          if (!j || !j.ok || !Array.isArray(j.events)) { S.error = !S.events.length; render(); return; }
          apply(j); S.fetchedAt = Date.now();
          store(CACHE_KEY, { at: S.fetchedAt, events: j.events, covers_until: S.coversUntil, pairs: j.pairs || [], catalog: j.catalog || [] });
          S.tickSig = ''; render(); changed();
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
    var now = Date.now(), ps = pairs(), g = nextGroup(S.events, S.prefs, ps, now);
    var sig, html, cls = 'econ-btn';
    if (!g) {
      sig = 'none|' + lang() + '|' + S.events.length;
      html = '<span class="econ-ico" aria-hidden="true"></span><span class="econ-txt econ-quiet">' + esc(_t('econ.title', 'Haberler')) + '</span>';
      b.title = S.events.length ? _t('econ.none_left', 'Bu hafta filtrene uyan haber kalmadı.') : _t('econ.title_long', 'Ekonomik takvim');
    } else {
      var cd = countdown(g.at - now), top = groupTop(g), more = groupMore(g), gp = groupPairs(g, shownPairs());
      cls += ' imp-' + top.impact + (cd ? '' : ' is-now') + (g.at - now < S.prefs.minutes * 60e3 ? ' is-soon' : '');
      sig = g.at + '|' + cd + '|' + lang() + '|' + cls + '|' + gp.join(',');
      html = '<span class="econ-dot" aria-hidden="true"></span>' +
        (gp.length ? '<span class="econ-pair">' + esc(gp[0]) + '</span>' : '') +
        '<span class="econ-name">' + esc(ccyText(top.currency) + ' ' + top.title) + '</span>' +
        (more ? '<span class="econ-more">' + esc(more) + '</span>' : '') +
        '<span class="econ-sep" aria-hidden="true">·</span><span class="econ-cd">' + esc(cd || _t('econ.now', 'ŞİMDİ')) + '</span>';
      b.title = groupTitle(g) + (gp.length ? ' · ' + gp.join(', ') : '') + ' — ' + fmtTime(g.at) + (cd ? ' (' + cd + ')' : '');
    }
    if (sig === S.tickSig) return;
    S.tickSig = sig;
    b.className = cls;
    b.innerHTML = html;
    b.setAttribute('aria-label', b.title);
  }

  // ---------------------------------------------------------------- panel
  // times and days in the app's time zone setting (time-settings.js WwTime), like the trades; the device zone without it
  function tz() {
    try { if (global.WwTime && typeof global.WwTime.getTz === 'function') { var z = global.WwTime.getTz(); if (z) return z; } } catch (e) { /* device */ }
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; }
  }
  function fmtTime(ms) {
    var o = { hour: '2-digit', minute: '2-digit' }, z = tz();
    try { if (z) o.timeZone = z; return new Date(ms).toLocaleTimeString(locale(), o); } catch (e) { return new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }); }
  }
  function dayKey(ms) {
    try { if (global.WwTime && typeof global.WwTime.keyOfInstant === 'function') return global.WwTime.keyOfInstant(ms); } catch (e) { /* device */ }
    var d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dayLabel(ms, now) {
    var k = dayKey(ms);
    if (k === dayKey(now)) return _t('econ.today', 'Bugün');
    if (k === dayKey(now + 86400e3)) return _t('econ.tomorrow', 'Yarın');
    if (k === dayKey(now - 86400e3)) return _t('econ.yesterday', 'Dün');
    var o = { weekday: 'long', day: 'numeric', month: 'long' }, z = tz();
    try { if (z) o.timeZone = z; return new Date(ms).toLocaleDateString(locale(), o); } catch (e) { return new Date(ms).toLocaleDateString(locale()); }
  }

  function renderPanel() {
    var p = document.getElementById('econ-panel');
    if (!p || !S.open) return;
    var now = Date.now(), pr = S.prefs, ps = pairs(), shown = shownPairs(), ask = !!coach();
    var today = dayKey(now);
    var week = S.events.filter(function (e) { return dayKey(Date.parse(e.event_at)) >= today; });
    var list = week.filter(function (e) { return passes(e, pr, ps); });
    var next = nextGroup(S.events, pr, ps, now);
    var countFor = function (imp) { var x = cleanPrefs(pr); x.impact = imp; return week.filter(function (e) { return passes(e, x, ps) && Date.parse(e.event_at) > now - NOW_WINDOW_MS; }).length; };

    var h = '<div class="econ-panel-header"><div class="econ-title-wrap"><h3>' + esc(_t('econ.title_long', 'Ekonomik takvim')) + '</h3>' +
      '<span class="econ-src" title="' + esc(Object.keys(SOURCE_NAMES).map(function (k) { return SOURCE_NAMES[k]; }).join(' · ')) + '">Forex Factory +3</span></div><div class="econ-head-actions">' +
      (ask ? '<button type="button" class="econ-ask-all" data-act="ask-week" title="' + esc(_t('econ.ask', 'Koça sor')) + '">' + SVG_SPARK + '<span>' + esc(_t('econ.ask', 'Koça sor')) + '</span></button>' : '') +
      '<button type="button" class="econ-close" data-act="close" aria-label="' + esc(_t('econ.close', 'Kapat')) + '" title="' + esc(_t('econ.close', 'Kapat')) + '">' + SVG_X + '</button></div></div>';

    h += '<div class="econ-tabs" role="tablist">' + [['high', _t('econ.f_high', 'Yüksek')], ['medium', _t('econ.f_medium', 'Yüksek + Orta')], ['all', _t('econ.f_all', 'Tümü')]].map(function (o) {
      return '<button type="button" class="econ-tab' + (pr.impact === o[0] ? ' active' : '') + '" data-act="impact" data-v="' + o[0] + '">' + esc(o[1]) + '<span class="econ-count">' + countFor(o[0]) + '</span></button>';
    }).join('') + '</div>';

    // pair chips: my pairs (when the member has trades), all, then the member's and the popular pairs
    var labels = [], allPairs = S.mine.concat(S.catalog);
    allPairs.forEach(function (x) { if (labels.indexOf(x.label) < 0) labels.push(x.label); });
    var picked = ps.map(function (x) { return x.label; });
    h += '<div class="econ-tabs econ-pairs" role="group" aria-label="' + esc(_t('econ.pairs', 'Pariteler')) + '">' +
      (S.mine.length ? '<button type="button" class="econ-tab' + (pr.pairs === null ? ' active' : '') + '" data-act="mine">' + esc(_t('econ.my_pairs', 'Paritelerim')) + '</button>' : '') +
      '<button type="button" class="econ-tab' + (!ps.length ? ' active' : '') + '" data-act="allpairs">' + esc(_t('econ.all_pairs', 'Tüm pariteler')) + '</button>' +
      labels.map(function (l) {
        var on = pr.pairs !== null && picked.indexOf(l) >= 0, mineMark = S.mine.some(function (x) { return x.label === l; });
        return '<button type="button" class="econ-tab econ-chip' + (on ? ' active' : '') + (mineMark ? ' is-mine' : '') + '" data-act="pair" data-v="' + esc(l) + '">' + esc(l) + '</button>';
      }).join('') + '</div>';

    h += '<div class="econ-panel-body">';
    if (S.error) h += '<div class="econ-empty">' + esc(_t('econ.error', 'Takvim şu an yüklenemedi. Biraz sonra tekrar dene.')) + '</div>';
    else if (!S.events.length) h += '<div class="econ-empty">' + esc(S.loading ? _t('econ.loading', 'Yükleniyor…') : _t('econ.empty', 'Takvim henüz yüklenmedi.')) + '</div>';
    else if (!list.length) h += '<div class="econ-empty">' + esc(_t('econ.none_filter', 'Bu filtrelere uyan haber yok.')) + '</div>';
    else {
      var lastDay = '';
      list.forEach(function (e) {
        var t = Date.parse(e.event_at), dk = dayKey(t);
        if (dk !== lastDay) { lastDay = dk; h += '<div class="econ-day">' + esc(dayLabel(t, now)) + '</div>'; }
        var past = t < now - NOW_WINDOW_MS, isNext = next && next.at === t, hit = affects(shown, e), mk = marketOf(e);
        var vals = [];
        if (e.forecast) vals.push(_t('econ.forecast', 'Bkl') + ' ' + e.forecast);
        if (e.previous) vals.push(_t('econ.previous', 'Önc') + ' ' + e.previous);
        h += '<div class="econ-row imp-' + e.impact + (past ? ' past' : '') + (isNext ? ' next' : '') + '">' +
          '<span class="econ-time">' + (e.impact === 'holiday' ? esc(_t('econ.allday', 'Tatil')) : esc(fmtTime(t))) + '</span>' +
          '<span class="econ-dot" title="' + esc(_t('econ.impact_' + e.impact, e.impact)) + '"></span>' +
          '<span class="econ-ccy">' + esc(e.currency === 'ALL' ? '🌐' : e.currency) + '</span>' +
          '<span class="econ-title">' + esc(e.title) +
            (mk ? '<em class="econ-mkt econ-mkt-' + mk + '" title="' + esc(sourcesOf(e).map(function (k) { return SOURCE_NAMES[k]; }).join(', ')) + '">' + esc(_t('econ.market_' + mk, MARKET_FALLBACK[mk] || mk)) + '</em>' : '') +
            (vals.length ? '<small>' + esc(vals.join(' · ')) + '</small>' : '') +
            (hit.length ? '<span class="econ-hits">' + hit.slice(0, 4).map(function (l) { return '<b>' + esc(l) + '</b>'; }).join('') + (hit.length > 4 ? '<b>+' + (hit.length - 4) + '</b>' : '') + '</span>' : '') +
          '</span>' +
          '<span class="econ-end">' + (isNext ? '<span class="econ-cd">' + esc(countdown(t - now) || _t('econ.now', 'ŞİMDİ')) + '</span>' : '') +
            (ask && e.impact !== 'holiday' ? '<button type="button" class="econ-ask" data-act="ask" data-id="' + esc(e.id) + '" title="' + esc(_t('econ.ask', 'Koça sor')) + '" aria-label="' + esc(_t('econ.ask', 'Koça sor')) + '">' + SVG_SPARK + '</button>' : '') +
          '</span></div>';
      });
      if (S.coversUntil && Date.parse(S.coversUntil) < now + 7 * 86400e3) h += '<div class="econ-note">' + esc(_t('econ.week_end', 'Gelecek haftanın takvimi henüz yayınlanmadı.')) + '</div>';
    }
    h += '</div>';
    var perm = global.Notification ? global.Notification.permission : 'unsupported';
    h += '<div class="econ-panel-footer"><div class="econ-foot-row"><label class="econ-sw"><input type="checkbox" data-act="alert"' + (pr.alert ? ' checked' : '') + '> ' +
      esc(_t('econ.alert', 'Haberden önce uyar')) + '</label><select data-act="minutes" aria-label="' + esc(_t('econ.minutes', 'Kaç dakika önce')) + '"' + (pr.alert ? '' : ' disabled') + '>' +
      MINUTES.map(function (m) { return '<option value="' + m + '"' + (pr.minutes === m ? ' selected' : '') + '>' + esc(_t('econ.min_before', '{n} dk önce', { n: m })) + '</option>'; }).join('') + '</select>' +
      (perm === 'unsupported' ? '' : '<label class="econ-sw"><input type="checkbox" data-act="desktop"' + (pr.desktop && perm === 'granted' ? ' checked' : '') + (pr.alert && perm !== 'denied' ? '' : ' disabled') + '> ' +
        esc(perm === 'denied' ? _t('econ.desktop_denied', 'Masaüstü bildirimi tarayıcıda engelli') : _t('econ.desktop', 'Masaüstü bildirimi')) + '</label>') +
      '</div><div class="econ-fine">' + esc(_t('econ.sub', 'Saatler: {tz} · Kaynak: Forex Factory, CryptoCraft, MetalsMine, EnergyExch', { tz: tz() || 'local' })) + ' · ' +
      esc(_t('econ.fine', 'Uyarılar uygulama açıkken çalışır. Açıklanan sonuçlar (actual) bu takvimde yok.')) + '</div></div>';

    var sc = p.querySelector('.econ-panel-body'), keep = sc && S.listScroll != null ? S.listScroll : null;
    p.innerHTML = h;
    sc = p.querySelector('.econ-panel-body');
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
  function askCoach(text) {
    var c = coach();
    if (!c) return;
    toggle(false);
    c.ask(text);
  }
  function eventQuestion(e) {
    var t = Date.parse(e.event_at), hit = affects(shownPairs(), e);
    return _t('econ.ask_event', '{ccy} {title} ({when}) {pairs}nasıl etkiler? O saatte nasıl davranmalıyım?', {
      ccy: ccyText(e.currency), title: e.title, when: dayLabel(t, Date.now()) + ' ' + fmtTime(t),
      pairs: hit.length ? _t('econ.ask_event_pairs', '{list} paritelerimi ', { list: hit.join(', ') }) : _t('econ.ask_event_mine', 'işlemlerimi '),
    });
  }
  function onPanelClick(ev) {
    ev.stopPropagation();
    var t = ev.target.closest('[data-act]');
    if (!t || t.tagName === 'INPUT' || t.tagName === 'SELECT') return;
    var act = t.getAttribute('data-act'), v = t.getAttribute('data-v');
    if (act === 'close') return toggle(false);
    if (act === 'ask-week') return askCoach(_t('econ.ask_week', 'Bu haftaki ekonomik takvime göre paritelerim için nelere dikkat etmeliyim?'));
    if (act === 'ask') {
      var id = t.getAttribute('data-id'), e = S.events.filter(function (x) { return x.id === id; })[0];
      if (e) askCoach(eventQuestion(e));
      return;
    }
    if (act === 'impact') S.prefs.impact = v;
    if (act === 'mine') S.prefs.pairs = null;
    if (act === 'allpairs') S.prefs.pairs = [];
    if (act === 'pair') S.prefs.pairs = togglePair(S.prefs, S.mine, v);
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
    dueAlerts(S.events, S.prefs, pairs(), now, store(ALERTED_KEY) || {}).forEach(function (g) {
      if (!claim(g.events.map(function (e) { return e.id; }))) return;
      var mins = Math.max(1, Math.round((g.at - now) / 60000)), gp = groupPairs(g, shownPairs());
      var title = groupTitle(g) + (gp.length ? ' · ' + gp.join(', ') : '');
      var body = _t('econ.alert_body', '{t} · {n} dk sonra ({time})', { t: title, n: mins, time: fmtTime(g.at) });
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
    c.className = 'econ-card imp-' + groupTop(g).impact;
    c.innerHTML = '<span class="econ-dot" aria-hidden="true"></span><div><b>' + esc(_t('econ.alert_title', 'Yaklaşan haber')) + '</b><div>' + esc(body) + '</div>' +
      '<small>' + esc(_t('econ.alert_tip', 'Yeni pozisyon açmadan önce spread ve kaymaya dikkat et.')) + '</small></div>' +
      '<button type="button" aria-label="' + esc(_t('econ.close', 'Kapat')) + '">' + SVG_X + '</button>';
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
    if (S.open) {
      var p = document.getElementById('econ-panel'), cd = p && p.querySelector('.econ-row.next .econ-cd');
      if (cd) { var g = nextGroup(S.events, S.prefs, pairs(), Date.now()); cd.textContent = g ? (countdown(g.at - Date.now()) || _t('econ.now', 'ŞİMDİ')) : ''; }
    }
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
      if (e.key === PREF_KEY) { S.prefs = cleanPrefs(store(PREF_KEY)); S.tickSig = ''; render(); changed(); }
      if (e.key === 'ww_language') { S.tickSig = ''; render(); }
    });
    if (global.i18n && typeof global.i18n.onChange === 'function') global.i18n.onChange(function () { S.tickSig = ''; render(); });
    if (global.sb && global.sb.auth && typeof global.sb.auth.onAuthStateChange === 'function') {
      global.sb.auth.onAuthStateChange(function (evt) { if (evt === 'SIGNED_IN' && !S.events.length) load(true); });
    }
  }

  // ---------------------------------------------------------------- API for other pages (the trading calendar)
  // range(fromMs, toMs): the events of a range (the month on screen), cached 5 minutes per range.
  // visible(events): the ones that pass the member's filters (impact, pairs), like the badge.
  // describe(e): { time, ccy, pairs (the member's pairs it moves), market (energy/metals/crypto or null), impactLabel }.
  // ask(e): opens the coach with the question about the event (false without the coach).
  // dayKey(ms): the day of an instant in the app's time zone. Changes (filters, data): window event "ww:econ-change".
  var RANGES = {};
  function range(fromMs, toMs) {
    var k = Math.floor(fromMs / 60000) + '|' + Math.floor(toMs / 60000), c = RANGES[k];
    if (c && Date.now() - c.at < CACHE_MS) return c.p;
    var p = session().then(function (s) {
      if (!s) return [];
      return fetch(endpoint() + '/functions/v1/econ-calendar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token, apikey: anonKey() },
        body: JSON.stringify({ from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() }) })
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (j) {
          if (!j || !j.ok || !Array.isArray(j.events)) { delete RANGES[k]; return []; }
          if (!S.mine.length && Array.isArray(j.pairs)) { S.mine = cleanPairs(j.pairs); S.catalog = cleanPairs(j.catalog); }
          return j.events;
        });
    }).catch(function () { delete RANGES[k]; return []; });
    RANGES[k] = { at: Date.now(), p: p };
    return p;
  }
  function changed() { try { global.dispatchEvent(new CustomEvent('ww:econ-change')); } catch (e) { /* old browsers */ } }
  var api = {
    range: range,
    visible: function (events) { var ps = pairs(); return (events || []).filter(function (e) { return passes(e, S.prefs, ps); }); },
    describe: function (e) {
      var mk = marketOf(e);
      return { time: e.impact === 'holiday' ? _t('econ.allday', 'Tatil') : fmtTime(Date.parse(e.event_at)), ccy: ccyText(e.currency), pairs: affects(shownPairs(), e),
        market: mk, marketLabel: mk ? _t('econ.market_' + mk, MARKET_FALLBACK[mk] || mk) : '', impactLabel: _t('econ.impact_' + e.impact, e.impact),
        sites: sourcesOf(e).map(function (k) { return SOURCE_NAMES[k]; }) };
    },
    ask: function (e) { if (!coach()) return false; askCoach(eventQuestion(e)); return true; },
    canAsk: function () { return !!coach(); },
    dayKey: dayKey,
    filterLabel: function () {
      var imp = { high: _t('econ.f_high', 'Yüksek'), medium: _t('econ.f_medium', 'Yüksek + Orta'), all: _t('econ.f_all', 'Tümü') }[S.prefs.impact];
      var ps = pairs();
      return imp + ' · ' + (S.prefs.pairs === null && S.mine.length ? _t('econ.my_pairs', 'Paritelerim') : ps.length ? ps.map(function (p) { return p.label; }).join(', ') : _t('econ.all_pairs', 'Tüm pariteler'));
    },
    openPanel: function () { toggle(true); },
  };

  global.WWEcon = { ready: true, reload: function () { return load(true); }, open: function () { toggle(true); },
    range: api.range, visible: api.visible, describe: api.describe, ask: api.ask, canAsk: api.canAsk, dayKey: api.dayKey, filterLabel: api.filterLabel,
    _test: { cleanPrefs: cleanPrefs, activePairs: activePairs, affects: affects, moves: moves, marketOf: marketOf, passes: passes, togglePair: togglePair, nextGroup: nextGroup,
      countdown: countdown, dueAlerts: dueAlerts, groupTitle: groupTitle, groupMore: groupMore, groupPairs: groupPairs } };
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  try { global.dispatchEvent(new CustomEvent('ww:econ-ready')); } catch (e) { /* old browsers */ }
})(typeof window !== 'undefined' ? window : globalThis);
