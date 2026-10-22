// Backtest v2: page controller. Open to every signed-in user (practice mode), synthetic candles generated in the browser,
// accounts and trades in the user's account (WwBtStore, Supabase backend). data_source is 'synthetic' or 'ctrader' (Phase 2: the
// candles of a cTrader account come from the user's own broker through the ctrader-candles Edge Function, bt-ctrader.js).
// Re-runs on every SPA visit (data-page-script): top-level state lives in this IIFE and is torn down in PAGE.onLeave.
// Spec: docs/backtest-v2/asama-arayuz/stage4.md + stage4-ek.md.
(function () {
  'use strict';

  var PAGE = window.wwPage.current();
  var S, C, E;

  var SPEEDS = [0.1, 0.3, 0.5, 1, 3, 10], SPEED_DEFAULT = 1, SPEED_KEY = 'ww_bt_speed';
  var MAX_BARS_PER_FRAME = 3000, SAVE_EVERY_MS = 5000, LIVE_UI_MS = 100, PREFETCH_AHEAD_SEC = 2 * 86400;
  var MAX_CHART_CANDLES = 25000, TRIM_TO = 20000, MAX_MARKER_TRADES = 300, MAX_HISTORY_ROWS = 200;
  var BOOT_POLL_MS = 50, BOOT_MAX_TRIES = 160;
  var FREE_LIMIT = 1, PREMIUM_LIMIT = 10;
  var EXTRA_COLUMNS = true;
  var MONTHS = {
    tr: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    de: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
  };

  // Backend: 'local' (Phase A, localStorage, no journal sync) or 'supabase' (Phase B: SupabaseStore + journal sync).
  // Live since migrations 00-05 ran on 2026-10-20; window.WW_BT_BACKEND = 'local' exists for the browser smoke tests only.
  var BACKEND = window.WW_BT_BACKEND === 'local' ? 'local' : 'supabase';
  var SYNC = null;                              // window.WwBtSync, only with the supabase backend
  var SWEEP_KEY = 'ww_bt_sweep_at', SWEEP_EVERY_MS = 10 * 60 * 1000;
  var syncToastShown = false;
  var L = { user: null, plan: 'free', accounts: [], summaries: {}, src: null, store: null, cov: {}, journals: [], journalsLoaded: false,
    srcs: {}, ct: null, ctApi: null, ctCache: null, brokerSyms: {}, ctForm: null, ctFormAccts: {} };
  var R = null;
  var bootTimer = 0, tries = 0, themeObserver = null, resizeTimer = 0, chipTimer = 0, cleaned = false;
  var failedJobs = [], editing = null, modalOpener = null;

  // ---------------------------------------------------------------- helpers
  function $(id) { return document.getElementById(id); }
  function show(el, on) { if (el) el.hidden = !on; }
  function setText(id, t) { var el = $(id); if (el) el.textContent = t; }
  function lang() { try { return window.i18n.getCurrentLanguage(); } catch (e) { return 'tr'; } }
  function localeTag() { return { tr: 'tr-TR', de: 'de-DE' }[lang()] || 'en-US'; }
  function _t(key, fb, params) {
    var s = null;
    try { s = window.i18n && window.i18n.t(key, params); } catch (e) { s = null; }
    if (s && s !== key) return s;
    s = fb || key;
    if (params) Object.keys(params).forEach(function (p) { s = s.replace(new RegExp('\\{+' + p + '\\}+', 'g'), params[p]); });
    return s;
  }
  function toast(msg, type) { if (typeof window.showToast === 'function') window.showToast(msg, type); }
  function icons() { try { if (window.lucide) window.lucide.createIcons(); } catch (e) { /* optional */ } }
  function later(fn, ms) { var id = setTimeout(function () { if (PAGE.alive) fn(); }, ms); return id; }
  function stale(tok) { return !PAGE.alive || !R || tok !== R.token; }
  function newId() { return window.WwBtStore.newId(); }
  function tz() { return window.WwTime ? window.WwTime.getTz() : 'UTC'; }
  function h12() { try { return !!window.WwTime.getSettings().hour12; } catch (e) { return false; } }

  var fmtCache = {};
  function dtf(kind, opts) {
    var k = kind + '|' + localeTag() + '|' + tz() + '|' + h12();
    return fmtCache[k] || (fmtCache[k] = new Intl.DateTimeFormat(localeTag(), Object.assign({ timeZone: tz(), hour12: h12() }, opts)));
  }
  function fmtDateTime(sec) {
    return dtf('dt', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(sec * 1000));
  }
  // with the year: the depth of a broker account can reach back many years
  function fmtDay(sec) {
    return dtf('day', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(sec * 1000));
  }
  function fmtShort(sec) {
    return dtf('sh', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(sec * 1000));
  }
  function fmtTime(sec) { return dtf('t', { hour: '2-digit', minute: '2-digit' }).format(new Date(sec * 1000)); }
  function fmtTradingDay(sec) {
    var key = S.tradingDayKey(sec * 1000, R.sym.id);
    return new Intl.DateTimeFormat(localeTag(), { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
      .format(new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10))));
  }
  function fmtUsd(cents, signed) {
    var nf = new Intl.NumberFormat(localeTag(), { style: 'currency', currency: 'USD' });
    var s = nf.format(Math.abs(cents) / 100);
    if (!signed) return (cents < 0 ? '−' : '') + s;
    return (cents > 0 ? '+' : cents < 0 ? '−' : '') + s;
  }
  function pnlClass(c) { return c > 0 ? 'bt-up' : c < 0 ? 'bt-down' : ''; }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function toLocalInput(sec) {
    var p = window.WwTime.partsInTz(sec * 1000, tz());
    return p.y + '-' + pad2(p.m) + '-' + pad2(p.d) + 'T' + pad2(p.H) + ':' + pad2(p.Mi);
  }
  function fromLocalInput(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || '');
    if (!m) return null;
    return Math.floor(window.WwTime.zonedToUtcMs(+m[1], +m[2], +m[3], +m[4], +m[5], 0, tz()) / 1000);
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  // ---------------------------------------------------------------- page state
  function setPageState(state) {
    var root = $('bt-root'); if (root) root.setAttribute('data-state', state);
    show($('bt-view-list'), state === 'list' || state === 'demo' || state === 'fatal');
    show($('bt-view-replay'), state === 'replay');
    show($('bt-demo'), state === 'demo');
    show($('bt-fatal'), state === 'fatal');
    if (state === 'list') {
      show($('bt-accounts'), true);
    }
    icons();
  }

  // ---------------------------------------------------------------- boot
  function start() {
    if (!PAGE.alive) return;
    var ok = window.LightweightCharts && window.sb && typeof window.requireAuth === 'function' && window.journal &&
      window.WwBtSymbols && window.WwBtCandles && window.WwBtEngine && window.WwBtSynthetic && window.WwBtData && window.WwBtCTrader &&
      window.WwBtStore && window.WwBtGate && window.WwTime && window.WwChart &&
      (BACKEND !== 'supabase' || (window.WwBtSync && window.WwTrades));
    if (!ok) {
      if (++tries >= BOOT_MAX_TRIES) return setPageState('fatal');
      bootTimer = setTimeout(start, BOOT_POLL_MS);
      return;
    }
    S = window.WwBtSymbols; C = window.WwBtCandles; E = window.WwBtEngine;
    SYNC = BACKEND === 'supabase' ? window.WwBtSync : null;
    init();
  }

  async function init() {
    var user = await window.requireAuth();
    if (!PAGE.alive || !user) return;
    var gate = window.WwBtGate.decide(user);
    if (gate === 'demo') return setPageState('demo');         // nothing is generated, loaded or stored for the ?test=1 fake user
    if (gate !== 'member') return;
    L.user = user;
    try { await window.journal.ensureActiveJournal(user.id); } catch (e) { /* navbar consistency only */ }
    if (!PAGE.alive) return;
    try { var pl = await window.getUserPlanSilent(); L.plan = pl && pl.plan === 'premium' ? 'premium' : 'free'; } catch (e) { L.plan = 'free'; }
    if (!PAGE.alive) return;
    L.src = window.WwBtData.createSyntheticSource({ seed: 1 });
    // cTrader candles: Edge Function client + per-user IndexedDB cache (entries of other user ids are removed)
    L.ctApi = window.WwBtCTrader.createApi({
      url: window.SUPABASE_URL, anonKey: window.SUPABASE_ANON_KEY,
      getToken: function () { return window.sb.auth.getSession().then(function (r) { return r && r.data && r.data.session ? r.data.session.access_token : null; }); }
    });
    L.ctCache = window.WwBtCTrader.createCache({ userId: user.id });
    L.ctCache.purgeOthers().catch(function () { /* best effort */ });
    L.store = BACKEND === 'supabase'
      ? window.WwBtStore.createSupabaseStore({ sb: window.sb, userId: user.id })
      : window.WwBtStore.createLocalStore({ userId: user.id, limit: function () { return L.plan === 'premium' ? PREMIUM_LIMIT : FREE_LIMIT; } });
    // Journals are only needed to link cTrader-data accounts (synthetic accounts cannot be linked: database CHECK); loaded on demand (ensureJournals).
    bindStaticUi(); setupThemeObserver(); setupI18n(); setupKeyboard(); setupVisibility();
    var ok = await loadList();
    if (!PAGE.alive || !ok) return;
    var deep = new URLSearchParams(location.search).get('account');
    if (deep && findAccount(deep)) { await whenActivated(); if (PAGE.alive) openAccount(deep); } else showList();
  }
  function whenActivated() {
    return document.prerendering ? new Promise(function (r) { document.addEventListener('prerenderingchange', r, { once: true }); }) : Promise.resolve();
  }

  // ---------------------------------------------------------------- list view
  function findAccount(id) { for (var i = 0; i < L.accounts.length; i++) if (L.accounts[i].id === id) return L.accounts[i]; return null; }

  async function loadList() {
    show($('bt-list-error'), false);
    try {
      var rows = await L.store.listAccounts();
      L.accounts = rows.map(E.accountFromRow); L.summaries = {};
      for (var i = 0; i < L.accounts.length; i++) {
        var tr = await L.store.listTrades(L.accounts[i].id), s = { closed: 0, open: 0, realizedCents: 0 };
        tr.forEach(function (t) { if (t.exit_time) { s.closed++; s.realizedCents += E.toCents(t.pnl) || 0; } else s.open++; });
        L.summaries[L.accounts[i].id] = s;
      }
      if (L.accounts.some(function (a) { return a.dataSource === 'ctrader'; })) await ensureJournals();
      if (!PAGE.alive) return false;
      syncOnList();
      return true;
    } catch (e) {
      wwLogWarn(e);
      show($('bt-list-error'), true); show($('bt-accounts'), false);
      return false;
    }
  }
  // List screen: heal stale mirrors (rarely) and retry accounts whose last sync failed
  function syncOnList() {
    if (!SYNC || !L.user) return;
    var now = Date.now(), last = 0;
    try { last = parseInt(sessionStorage.getItem(SWEEP_KEY) || '0', 10) || 0; } catch (e) { last = 0; }
    if (now - last > SWEEP_EVERY_MS) {
      try { sessionStorage.setItem(SWEEP_KEY, String(now)); } catch (e) { /* ignore */ }
      SYNC.sweepOrphans(L.user.id).then(function (r) { syncResult(r); });
    }
    var dirty = SYNC.dirtyAccounts();
    L.accounts.forEach(function (a) {
      if (dirty.indexOf(a.id) >= 0 && a.journalId) SYNC.reconcileAccount(syncAcc(a)).then(syncResult);
    });
  }
  function syncAcc(a) { return { id: a.id, user_id: a.userId || (L.user && L.user.id), journal_id: a.journalId || null, symbol: a.symbol }; }
  // one toast per visit when a sync fails (the next entry or the list screen retries)
  function syncResult(r) {
    if (r && r.ok === false && r.code !== 'CANCELLED' && !syncToastShown && PAGE.alive) {
      syncToastShown = true;
      toast(_t('backtest.sync.error', 'Backtest işlemleri bağlı hesaba aktarılamadı. Bu backtest hesabına tekrar girdiğinde yeniden denenecek.'), 'error');
    }
    return r;
  }
  function journalName(id) {
    for (var i = 0; i < L.journals.length; i++) if (L.journals[i].id === id) return L.journals[i].name;
    return '';
  }
  async function ensureJournals() {
    if (!SYNC || L.journalsLoaded) return;
    try { L.journals = (await window.journal.listJournals()) || []; L.journalsLoaded = true; } catch (e) { L.journals = []; }
  }
  // The candle source of an account: the shared synthetic generator, or the account's own cTrader source (its broker account and symbol)
  function srcFor(acc) {
    if (acc.dataSource !== 'ctrader' || !acc.source) return L.src;
    if (!L.srcs[acc.id]) {
      L.srcs[acc.id] = window.WwBtCTrader.createCTraderSource({
        api: L.ctApi, cache: L.ctCache, sym: S.get(acc.symbol),
        account: { id: acc.id, ctid: acc.source.ctid, symbolId: acc.source.symbolId, symbolName: acc.source.symbolName, brokerName: acc.source.brokerName, isLive: acc.source.isLive }
      });
    }
    return L.srcs[acc.id];
  }
  function sourceText(a) {
    if (a.dataSource !== 'ctrader') return _t('backtest.source.synthetic', 'Sentetik veri, gerçek piyasa verisi değildir');
    return 'cTrader · ' + ((a.source && a.source.brokerName) || 'broker') + (a.source && a.source.symbolName ? ' · ' + a.source.symbolName : '');
  }
  // chart label: the synthetic text keeps its data-i18n (language switch); the cTrader one is plain text (broker name from the account)
  function setSourceLabel(a) {
    var e = $('bt-source-label'); if (!e) return;
    e.setAttribute('data-source', a.dataSource || 'synthetic');
    if (a.dataSource === 'ctrader') { e.removeAttribute('data-i18n'); e.textContent = sourceText(a); }
    else { e.setAttribute('data-i18n', 'backtest.source.synthetic'); e.textContent = sourceText(a); }
  }
  // list banner "cTrader connection required" (the account's candles cannot be loaded; nothing else is lost)
  function showCtNeeded(on) { show($('bt-ctrader-needed'), !!on); }
  function showList() {
    if (R) closeReplayState();
    setPageState('list'); renderList();
    try { var u = new URL(location.href); u.searchParams.delete('account'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (e) { /* ignore */ }
  }
  function quotaLimit() { return L.plan === 'premium' ? PREMIUM_LIMIT : FREE_LIMIT; }
  function renderList() {
    var box = $('bt-accounts'); box.textContent = ''; box.setAttribute('aria-busy', 'false');
    var n = L.accounts.length;
    show($('bt-accounts-empty'), n === 0); show(box, n > 0);
    show($('bt-storage-warning'), !L.store.persistent);
    setText('bt-quota', _t('backtest.quota.label', 'Hesap {n}/{max}', { n: n, max: quotaLimit() }) + ' · ' +
      (L.plan === 'premium' ? _t('backtest.quota.plan_premium', 'Premium') : _t('backtest.quota.plan_free', 'Ücretsiz')));
    show($('bt-quota-note'), L.plan !== 'premium' && n > FREE_LIMIT);
    L.accounts.forEach(function (a) {
      var sym = S.get(a.symbol), sm = L.summaries[a.id] || { closed: 0, open: 0, realizedCents: 0 };
      var card = el('article', 'bt-account-card'); card.tabIndex = 0; card.setAttribute('data-id', a.id);
      var head = el('div', 'bt-card-head'); head.appendChild(el('h3', '', a.name)); head.appendChild(el('span', 'bt-chip', sym ? sym.name : a.symbol));
      card.appendChild(head);
      var bal = a.startCents + sm.realizedCents;
      var dl = el('dl', 'bt-card-meta');
      function row(k, v, cls) { var d = el('div'); d.appendChild(el('dt', '', k)); d.appendChild(el('dd', 'bt-num ' + (cls || ''), v)); dl.appendChild(d); }
      row(_t('backtest.stat.balance', 'Bakiye'), fmtUsd(bal));
      row(_t('backtest.stat.realized', 'Gerçekleşen K/Z'), fmtUsd(sm.realizedCents, true), pnlClass(sm.realizedCents));
      row(_t('backtest.field.timeframe', 'Zaman dilimi'), C.TF_LABEL[a.tf] || a.tf);
      row(_t('backtest.card.trades', 'İşlemler'), sm.closed + ' / ' + sm.open);
      row(_t('backtest.card.replay_time', 'Replay zamanı'), a.replaySec ? fmtDateTime(a.replaySec) : '—');
      if (SYNC && a.dataSource === 'ctrader') row(_t('backtest.card.journal', 'Bağlı hesap'), a.journalId ? (journalName(a.journalId) || '…') : '—');
      card.appendChild(dl);
      card.appendChild(sourceBadge(a));
      var act = el('div', 'bt-card-actions');
      var bOpen = el('button', 'btn btn-primary', _t('backtest.card.open', 'Aç')); bOpen.type = 'button'; bOpen.setAttribute('data-act', 'open');
      var bSet = el('button', 'btn btn-ghost', _t('backtest.card.settings', 'Ayarlar')); bSet.type = 'button'; bSet.setAttribute('data-act', 'settings');
      var bDel = el('button', 'btn btn-ghost bt-del', _t('common.delete', 'Sil')); bDel.type = 'button'; bDel.setAttribute('data-act', 'delete');
      act.appendChild(bOpen); act.appendChild(bSet); act.appendChild(bDel); card.appendChild(act);
      box.appendChild(card);
    });
  }
  // "Synthetic data, not real market data" label of the card (the chart has the same text in backtest.astro)
  function sourceBadge(a) {
    var b = el('p', 'bt-source', sourceText(a));
    b.setAttribute('data-source', a.dataSource || 'synthetic');
    return b;
  }
  function onAccountsClick(e) {
    var card = e.target.closest('.bt-account-card'); if (!card || card.classList.contains('bt-skeleton')) return;
    var id = card.getAttribute('data-id'), btn = e.target.closest('button[data-act]'), act = btn ? btn.getAttribute('data-act') : 'open';
    if (act === 'settings') return openAccountModal('edit', findAccount(id), btn);
    if (act === 'delete') return openDeleteModal(findAccount(id), btn);
    openAccount(id);
  }
  function newAccountClicked(opener) {
    if (L.accounts.length >= quotaLimit()) {
      if (L.plan === 'premium') return toast(_t('backtest.quota.premium_reached', 'En fazla {n} aktif backtest hesabı açabilirsin.', { n: PREMIUM_LIMIT }), 'warning');
      toast(_t('backtest.quota.free_reached', 'Ücretsiz planda 1 backtest hesabı açabilirsin.'), 'info');
      if (typeof window.openUpgradeModal === 'function') window.openUpgradeModal({ feature: 'backtest' });
      return;
    }
    openAccountModal('create', null, opener);
  }

  // ---------------------------------------------------------------- modals
  function openModal(id, opener) {
    if (R && R.playing) pause();
    modalOpener = opener || document.activeElement;
    $(id).classList.add('active');
  }
  function closeModal(id) {
    $(id).classList.remove('active');
    if (modalOpener && modalOpener.focus && document.contains(modalOpener)) { try { modalOpener.focus(); } catch (e) { /* ignore */ } }
  }
  function anyModalOpen() { return !!document.querySelector('.bt-modal.active'); }
  function closeAllModals() {
    var m = document.querySelectorAll('.bt-modal.active'); for (var i = 0; i < m.length; i++) m[i].classList.remove('active');
    if (confirmResolve) finishConfirm(false);
  }

  // page-local confirm (no confirm-dialog.js: it injects unescaped HTML). Resolves true on confirm, false on cancel/close/Esc.
  var confirmResolve = null;
  function askConfirm(text, okLabel) {
    return new Promise(function (resolve) {
      if (confirmResolve) confirmResolve(false);
      confirmResolve = resolve;
      $('bt-confirm-text').textContent = text;
      $('bt-confirm-ok').textContent = okLabel || _t('backtest.confirm.ok', 'Devam');
      $('bt-confirm-modal').classList.add('active');
    });
  }
  function finishConfirm(v) {
    $('bt-confirm-modal').classList.remove('active');
    var r = confirmResolve; confirmResolve = null; if (r) r(v);
  }
  // Journal link: only for accounts whose data comes from the user's broker (cTrader). Synthetic accounts never show it.
  function fillJournalSelect(selected, source) {
    var linkable = !!SYNC && source === 'ctrader';
    show($('bt-f-journal-wrap'), linkable);
    if (!linkable) return;
    var sel = $('bt-f-journal'); sel.textContent = '';
    var none = document.createElement('option'); none.value = ''; none.textContent = _t('backtest.field.journal_none', 'Bağlantı yok'); sel.appendChild(none);
    L.journals.forEach(function (j) { var o = document.createElement('option'); o.value = j.id; o.textContent = j.name; sel.appendChild(o); });
    sel.value = selected || '';
    $('bt-f-journal-hint').textContent = _t('backtest.sync.link_hint', 'Bağlı hesaba yalnızca kapanan işlemler aktarılır; canlı istatistiklere girmezler.');
  }
  // Change the linked journal (SYNC only). Confirms when mirrors would be removed. Returns { ok } | { aborted } | { error }.
  async function changeJournal(acc, newJ) {
    var oldJ = acc.journalId || null;
    if (oldJ) {
      var cnt = await SYNC.countMirrors(syncAcc(acc));
      if (cnt.count > 0) {
        var msg = newJ ? _t('backtest.sync.relink_confirm', 'Backtest hesabı başka bir hesaba bağlanacak. Eski hesaba aktarılan {count} işlem (notları ve strateji atamalarıyla birlikte) oradan silinip yeni hesaba aktarılacak. Devam edilsin mi?', { count: cnt.count })
          : _t('backtest.sync.unlink_confirm', 'Bağlantı kaldırılsın mı? Bu backtest hesabından aktarılan {count} işlem (notları ve strateji atamalarıyla birlikte) bağlı hesaptan silinecek. Backtest hesabındaki işlemler korunur.', { count: cnt.count });
        if (!(await askConfirm(msg))) return { aborted: true };
      }
    }
    var r = await SYNC.linkAccount(syncAcc(acc), newJ);
    if (!r.ok) return { error: r };
    toast(newJ ? _t('backtest.sync.linked', '{count} işlem bağlı hesaba aktarıldı.', { count: r.inserted || 0 }) : _t('backtest.sync.unlinked', 'Bağlantı kaldırıldı; aktarılan işlemler hesaptan silindi.'), 'success');
    return { ok: true };
  }

  function fillSymbolSelect() {
    var sel = $('bt-f-symbol'); if (sel.options.length) return;
    var groups = { forex: [], gold: [], crypto: [] };
    S.list().forEach(function (s) { (groups[s.instrument] || (groups[s.instrument] = [])).push(s); });
    Object.keys(groups).forEach(function (g) {
      if (!groups[g].length) return;
      var og = document.createElement('optgroup'); og.label = _t('backtest.group.' + g, g);
      groups[g].forEach(function (s) { var o = document.createElement('option'); o.value = s.id; o.textContent = s.name; og.appendChild(o); });
      sel.appendChild(og);
    });
  }
  function spreadHint() {
    var s = S.get($('bt-f-symbol').value), p = E.parseScaled($('bt-f-spread').value, 2, 'exact');
    if (!s) return;
    var pts = p.ok ? E.spreadPts(s, p.value) : null;
    $('bt-f-spread-hint').textContent = pts === null ? '' :
      _t('backtest.field.spread_hint', '{points} puan = {price} (varsayılan {def} pip)', { points: pts, price: E.ptsToStr(pts, s.digits), def: s.defaultSpreadPips });
  }
  async function startHint() {
    var s = S.get($('bt-f-symbol').value); if (!s) return;
    if (selectedSource() === 'ctrader') return refreshCtPanel(true);      // cTrader: coverage of the chosen broker account and symbol
    try {
      var cov = await L.src.coverage(s.id); if (!PAGE.alive) return;
      L.cov[s.id] = cov;
      $('bt-f-start').min = toLocalInput(cov.firstT); $('bt-f-start').max = toLocalInput(cov.lastT);
      $('bt-f-start-hint').textContent = _t('backtest.field.start_hint', 'Saat dilimin: {tz}. Veri: {from} – {to}', { tz: tz(), from: fmtShort(cov.firstT), to: fmtShort(cov.lastT) });
    } catch (e) { $('bt-f-start-hint').textContent = _t('backtest.data.unavailable', 'Mum verisi şu an kullanılamıyor.'); }
  }
  function defaultStart(cov) {
    var key = C.addMonths(C.monthKey(cov.lastT), -3);
    return Math.max(cov.firstT, Math.floor(window.WwTime.zonedToUtcMs(+key.slice(0, 4), +key.slice(5, 7), 1, 0, 0, 0, tz()) / 1000));
  }
  // coverage the account form is working with: the synthetic feed of the symbol, or the measured cTrader depth
  function formCov() {
    return selectedSource() === 'ctrader' ? (L.ctForm && L.ctForm.cov) : L.cov[$('bt-f-symbol').value];
  }

  async function openAccountModal(mode, acc, opener) {
    fillSymbolSelect();
    editing = mode === 'edit' ? acc : null;
    var edit = mode === 'edit';
    $('bt-account-modal-title').textContent = edit ? _t('backtest.modal.edit_title', 'Hesap ayarları') : _t('backtest.modal.create_title', 'Yeni backtest hesabı');
    $('bt-account-submit-label').textContent = edit ? _t('common.save', 'Kaydet') : _t('backtest.modal.create', 'Hesabı oluştur');
    show($('bt-account-error'), false);
    show($('bt-f-start-wrap'), !edit);
    show($('bt-f-start-note'), edit);
    var trades = edit ? await L.store.listTrades(acc.id) : [];
    if (!PAGE.alive) return;
    var hasTrades = trades.length > 0, hasOpen = trades.some(function (t) { return !t.exit_time; });
    $('bt-account-delete').hidden = !edit; $('bt-account-reset').hidden = !(edit && hasTrades);
    if (edit) {
      $('bt-f-name').value = acc.name; $('bt-f-symbol').value = acc.symbol; $('bt-f-tf').value = acc.tf;
      $('bt-f-balance').value = E.centsToStr(acc.startCents); $('bt-f-spread').value = E.hundredthsToStr(acc.spreadH);
      $('bt-f-commission').value = E.centsToStr(acc.cplCents);
    } else {
      $('bt-f-name').value = ''; $('bt-f-tf').value = '1h'; $('bt-f-balance').value = '10000.00'; $('bt-f-commission').value = '0.00';
      $('bt-f-symbol').selectedIndex = 0;
      var s0 = S.get($('bt-f-symbol').value); $('bt-f-spread').value = E.hundredthsToStr(Math.round(s0.defaultSpreadPips * 100));
    }
    var source = edit ? acc.dataSource : 'synthetic';
    var ctState = edit ? 'ready' : (await loadCtStatus()).state;
    if (!PAGE.alive) return;
    L.ctForm = null;
    fillSourceField(source, edit, ctState);
    if (source === 'ctrader') await ensureJournals();
    fillJournalSelect(edit ? acc.journalId : '', source);
    show($('bt-f-ct-wrap'), false);
    var sum = $('bt-f-ct-summary'); show(sum, edit && source === 'ctrader');
    if (edit && source === 'ctrader' && acc.source) sum.textContent = _t('backtest.ctrader.summary', 'Veri kaynağı: cTrader · {broker} · {symbol} (hesap {account})', { broker: acc.source.brokerName || 'broker', symbol: acc.source.symbolName, account: acc.source.ctid });
    $('bt-f-symbol').disabled = edit; $('bt-f-tf').disabled = edit;
    $('bt-f-balance').disabled = edit && hasTrades;
    $('bt-f-spread').disabled = edit && hasOpen; $('bt-f-commission').disabled = edit && hasOpen;
    var sh = $('bt-f-symbol-hint'); show(sh, edit); sh.textContent = edit ? _t('backtest.field.symbol_locked', 'Sembol oluşturulduktan sonra değiştirilemez.') : '';
    var bh = $('bt-f-balance-hint'); show(bh, edit && hasTrades); bh.textContent = _t('backtest.field.balance_locked', 'İşlem varken başlangıç bakiyesi değiştirilemez.');
    var lockMsg = _t('backtest.field.locked_open_positions', 'Açık pozisyon varken değiştirilemez.');
    $('bt-f-commission-hint').textContent = edit && hasOpen ? lockMsg : _t('backtest.field.commission_hint', 'Pozisyon kapanınca bakiyeden düşülür.');
    openModal('bt-account-modal', opener);
    spreadHint();
    if (!edit) {
      await startHint();
      var cov = formCov();
      if (cov && PAGE.alive) $('bt-f-start').value = toLocalInput(defaultStart(cov));
    }
    $('bt-f-name').focus();
  }

  // ---------------------------------------------------------------- cTrader data source (Phase 2)
  var ctSeq = 0;                                   // the newest form refresh wins; older answers are dropped
  function ctAccountLabel(a) {
    return (a.broker_name || 'cTrader') + ' · ' + (a.trader_login || a.ctid_trader_account_id) + ' · ' + (a.is_live ? _t('backtest.ctrader.live', 'Gerçek') : _t('backtest.ctrader.demo', 'Demo'));
  }
  // 'ready' (connected, has accounts) | 'reconnect' (the token needs a new connection) | 'none' (not connected)
  async function loadCtStatus() {
    var now = Date.now();
    if (L.ct && now - L.ct.at < 30000) return L.ct;
    var st = { at: now, state: 'none', accounts: [] };
    try {
      var res = await Promise.race([window.sb.rpc('get_ctrader_status'), new Promise(function (r) { setTimeout(function () { r(null); }, 4000); })]);
      var d = res && !res.error ? res.data : null;
      if (!d) st.at = 0;                          // timeout or error: do not remember it
      else if (d.is_connected && d.token_status !== 'active') st.state = 'reconnect';
      else if (d.is_connected && Array.isArray(d.accounts) && d.accounts.length) { st.accounts = d.accounts; st.state = 'ready'; }
    } catch (e) { st.at = 0; }
    L.ct = st;
    return st;
  }
  function ctErrorText(e) {
    var c = e && e.code;
    if (c === 'AUTH') return _t('backtest.ctrader.err_auth', 'cTrader bağlantısı gerekli: bağlantı koptu ya da süresi doldu. Hesabını yeniden bağla.');
    if (c === 'RATE') return _t('backtest.ctrader.err_rate', 'Çok sık istek gönderildi. Birkaç saniye sonra tekrar dene.');
    if (c === 'SESSION') return _t('backtest.ctrader.err_session', 'Oturumun sona ermiş. Sayfayı yenileyip tekrar giriş yap.');
    if (c === 'NETWORK') return _t('backtest.ctrader.err_network', 'Bağlantı hatası. İnternetini kontrol edip tekrar dene.');
    if (c === 'NOT_FOUND') return _t('backtest.ctrader.no_data', 'Bu hesapta bu sembol için mum verisi yok.');
    return _t('backtest.ctrader.err_upstream', 'Sunucu hatası: cTrader verisi şu an alınamıyor. Birazdan tekrar dene.');
  }
  // Read at submit time from the lists themselves: the account is looked up in the accounts the select was filled from (not in the
  // shared status cache, which may be refreshed or dropped while the form is open), the symbol comes from the symbol select.
  function ctSelection() {
    var accSel = $('bt-f-ct-account'), ctid = Number(accSel.value), symSel = $('bt-f-ct-symbol'), symbolId = Number(symSel.value);
    var acc = ctid > 0 ? (L.ctFormAccts[String(accSel.value)] || null) : null;
    var opt = symSel.selectedIndex >= 0 ? symSel.options[symSel.selectedIndex] : null;
    return { ctid: ctid, acc: acc, symbolId: symbolId, symbolName: opt ? opt.textContent : '', ok: !!(acc && symbolId > 0 && opt) };
  }
  function fillCtAccounts() {
    var sel = $('bt-f-ct-account'); sel.textContent = ''; L.ctFormAccts = {};
    ((L.ct && L.ct.accounts) || []).forEach(function (a) {
      var o = document.createElement('option'); o.value = String(a.ctid_trader_account_id); o.textContent = ctAccountLabel(a); sel.appendChild(o);
      L.ctFormAccts[o.value] = a;
    });
    sel.selectedIndex = sel.options.length ? 0 : -1;                         // the default account is selected explicitly; the form reads the select itself
  }
  // `reconnect`: a lost/expired cTrader token needs a new connection, so the message carries a link to the connection page.
  function ctDepth(text, isError, reconnect) {
    var d = $('bt-f-ct-depth'); d.textContent = text; d.classList.toggle('bt-error', !!isError);
    if (reconnect) {
      var a = document.createElement('a'); a.className = 'bt-link'; a.href = '/journals';
      a.textContent = _t('backtest.ctrader.reconnect', 'cTrader bağlantısını yenile');
      d.appendChild(document.createTextNode(' ')); d.appendChild(a);
    }
  }
  // Measures how far back the chosen account has data for the chosen symbol and sets the start-date limits. `reloadSymbols`: the
  // account or the page symbol changed, so the broker symbol candidates are rebuilt first.
  async function refreshCtPanel(reloadSymbols) {
    var seq = ++ctSeq, sym = S.get($('bt-f-symbol').value);
    L.ctForm = { cov: null, seq: seq };
    show($('bt-f-ct-wrap'), true);
    var symSel = $('bt-f-ct-symbol');
    $('bt-f-start').min = ''; $('bt-f-start').max = '';
    $('bt-f-start-hint').textContent = '';
    try {
      var ctid = Number($('bt-f-ct-account').value);
      if (!ctid) { ctDepth(_t('backtest.ctrader.pick_account', 'Bir cTrader hesabı seç.'), true); return; }
      if (reloadSymbols !== false) {
        symSel.textContent = '';
        ctDepth(_t('backtest.ctrader.measuring', 'Veri derinliği ölçülüyor…'));
        var list = L.brokerSyms[ctid];
        if (!list) { list = await L.ctApi.symbols(ctid); L.brokerSyms[ctid] = list; }
        if (seq !== ctSeq || !PAGE.alive) return;
        var cands = window.WwBtCTrader.matchBrokerSymbols(sym.id, list);
        cands.forEach(function (c) { var o = document.createElement('option'); o.value = String(c.id); o.textContent = c.name; symSel.appendChild(o); });
        symSel.selectedIndex = cands.length ? 0 : -1;                         // default broker symbol selected explicitly
        if (!cands.length) { ctDepth(_t('backtest.ctrader.no_symbol', 'Bu cTrader hesabında {symbol} için eşleşen sembol bulunamadı.', { symbol: sym.name }), true); return; }
      }
      var symbolId = Number(symSel.value);
      if (!symbolId) { ctDepth(_t('backtest.ctrader.pick_symbol', 'Bir broker sembolü seç ve veri derinliğinin ölçülmesini bekle.'), true); return; }
      ctDepth(_t('backtest.ctrader.measuring', 'Veri derinliği ölçülüyor…'));
      var key = 'ct|' + ctid + '|' + symbolId, cov = L.cov[key];
      if (!cov) {
        var j = await L.ctApi.coverage(ctid, symbolId);
        if (seq !== ctSeq || !PAGE.alive) return;
        if (!j.firstT) { ctDepth(_t('backtest.ctrader.no_data', 'Bu hesapta bu sembol için mum verisi yok.'), true); return; }
        cov = window.WwBtCTrader.buildCoverage(j.firstT, Date.now(), sym.id); L.cov[key] = cov;
      }
      if (seq !== ctSeq || !PAGE.alive) return;
      L.ctForm.cov = cov;
      $('bt-f-start').min = toLocalInput(cov.firstT); $('bt-f-start').max = toLocalInput(cov.lastT);
      ctDepth(_t('backtest.ctrader.depth', 'Bu hesapta bu sembolün verisi: {from} – {to}', { from: fmtDay(cov.firstT), to: fmtDay(cov.lastT) }));
      $('bt-f-start-hint').textContent = _t('backtest.field.start_hint', 'Saat dilimin: {tz}. Veri: {from} – {to}', { tz: tz(), from: fmtDay(cov.firstT), to: fmtDay(cov.lastT) });
      if (reloadSymbols !== 'keepStart') $('bt-f-start').value = toLocalInput(defaultStart(cov));
    } catch (e) {
      if (seq !== ctSeq || !PAGE.alive) return;
      var lost = !!(e && (e.code === 'AUTH' || e.needsReconnect));
      if (e && e.code === 'NOT_FOUND') ctDepth(_t('backtest.ctrader.no_data', 'Bu hesapta bu sembol için mum verisi yok.'), true);
      else ctDepth(ctErrorText(e), true, lost);
      if (lost) { if (L.ct) L.ct.at = 0; }                                   // refetch the status on the next open; the open form keeps its accounts
    }
  }
  function onSourceChange() {
    var src = selectedSource();
    (async function () {
      if (src === 'ctrader') { await ensureJournals(); fillCtAccounts(); }
      fillJournalSelect('', src);
      if (src === 'ctrader') { await refreshCtPanel(true); }
      else { show($('bt-f-ct-wrap'), false); L.ctForm = null; ctSeq++; await startHint(); var cov = formCov(); if (cov && PAGE.alive) $('bt-f-start').value = toLocalInput(defaultStart(cov)); }
    })();
  }

  // Data source choice. Synthetic is always possible; cTrader needs a connected cTrader account (ctState 'ready'), otherwise it is
  // disabled with a link that leads to the connection. Fixed once the account exists.
  function fillSourceField(source, locked, ctState) {
    $('bt-f-source-synthetic').checked = source !== 'ctrader';
    $('bt-f-source-ctrader').checked = source === 'ctrader';
    $('bt-f-source-synthetic').disabled = !!locked;
    $('bt-f-source-ctrader').disabled = !!locked || ctState !== 'ready';
    show($('bt-f-source-note'), !!locked);
    var needLink = !locked && ctState !== 'ready';
    show($('bt-f-source-connect'), needLink);
    if (needLink) $('bt-f-source-connect-link').textContent = ctState === 'reconnect'
      ? _t('backtest.ctrader.reconnect', 'cTrader bağlantısını yenile') : _t('backtest.ctrader.connect', 'cTrader hesabını bağla');
  }
  function selectedSource() { return $('bt-f-source-ctrader').checked ? 'ctrader' : 'synthetic'; }
  function formError(msg) { var e = $('bt-account-error'); e.textContent = msg; e.hidden = false; }
  function mapStoreError(e) {
    var m = String((e && e.message) || '');
    if (m.indexOf('BACKTEST_LIMIT_EXCEEDED') >= 0) return L.plan === 'premium'
      ? _t('backtest.quota.premium_reached', 'En fazla {n} aktif backtest hesabı açabilirsin.', { n: PREMIUM_LIMIT }) : _t('backtest.quota.free_reached', 'Ücretsiz planda 1 backtest hesabı açabilirsin.');
    if (m.indexOf('CTRADER_ACCOUNT_NOT_LINKED') >= 0) return _t('backtest.err.ctrader_not_linked', 'Bu cTrader hesabı bağlı değil. Önce hesabını bağla.');
    if (m.indexOf('INVALID_JOURNAL') >= 0) return _t('backtest.err.invalid_journal', 'Seçilen hesap geçersiz.');
    if (m.indexOf('BACKTEST_OPEN_POSITIONS') >= 0) return _t('backtest.err.open_positions_settings', 'Açık pozisyon varken spread ve komisyon değiştirilemez.');
    if (m.indexOf('BACKTEST_REPLAY_BACKWARD') >= 0) return _t('backtest.err.goto_backward', 'İşlem yapılmış hesapta geri gidilemez; önce hesabı sıfırlayın.');
    if (e && e.code === '23514') return _t('backtest.err.invalid_value', 'Geçersiz değer.');
    return _t('backtest.err.generic', 'Bir hata oluştu. Lütfen tekrar dene.');
  }

  async function submitAccountForm() {
    var btn = $('bt-account-submit'); if (btn.disabled) return;
    var edit = !!editing, sym = S.get($('bt-f-symbol').value);
    var name = $('bt-f-name').value.trim();
    if (!(Array.from(name).length >= 1 && Array.from(name).length <= 60)) return formError(_t('backtest.err.name', 'Hesap adı 1-60 karakter olmalı.'));
    var bal = E.parseScaled($('bt-f-balance').value, 2, 'exact');
    if (!bal.ok || !(bal.value > 0 && bal.value <= 10000000000)) return formError(_t('backtest.err.balance', 'Başlangıç bakiyesi 0 ile 100.000.000 arasında olmalı (en fazla 2 ondalık).'));
    var sp = E.parseScaled($('bt-f-spread').value, 2, 'exact');
    if (!sp.ok || sp.value < 0 || sp.value > 1000000) return formError(_t('backtest.err.spread', 'Spread 0 ile 10000 pip arasında olmalı (en fazla 2 ondalık).'));
    var cm = E.parseScaled($('bt-f-commission').value, 2, 'exact');
    if (!cm.ok || cm.value < 0 || cm.value > 1000000) return formError(_t('backtest.err.commission', 'Komisyon 0 ile 10000 USD arasında olmalı (en fazla 2 ondalık).'));
    btn.disabled = true;
    try {
      if (edit) {
        if (SYNC && editing.dataSource === 'ctrader') {
          var newJ = $('bt-f-journal').value || null;
          if (newJ !== (editing.journalId || null)) {
            var cj = await changeJournal(editing, newJ);
            if (cj.aborted) { btn.disabled = false; return; }
            if (cj.error) { formError(mapStoreError(cj.error.error || {})); btn.disabled = false; return; }
          }
        }
        var f = { name: name };
        if (!$('bt-f-spread').disabled) { f.spreadH = sp.value; f.cplCents = cm.value; }
        var upd = await L.store.updateAccount(editing.id, E.accountPatch(f));
        if (!$('bt-f-balance').disabled && bal.value !== editing.startCents) await L.store.updateAccount(editing.id, { starting_balance: E.centsToStr(bal.value) });
        closeModal('bt-account-modal');
        if (R && R.acc.id === editing.id) { applyAccountChange(E.accountFromRow(await L.store.getAccount(editing.id))); }
        await loadList(); if (!R) renderList();
        toast(_t('backtest.toast.saved', 'Kaydedildi'), 'success');
        return upd;
      }
      var source = selectedSource(), ctSel = null, ctSource = null, cov;
      if (source === 'ctrader') {
        ctSel = ctSelection();
        if (!ctSel.acc) return formError(_t('backtest.ctrader.pick_account', 'Bir cTrader hesabı seç.'));
        if (!ctSel.ok || !(L.ctForm && L.ctForm.cov)) return formError(_t('backtest.ctrader.pick_symbol', 'Bir broker sembolü seç ve veri derinliğinin ölçülmesini bekle.'));
        cov = L.ctForm.cov;
        var info;
        try { info = await L.ctApi.symbolInfo(ctSel.ctid, ctSel.symbolId); } catch (e0) { return formError(ctErrorText(e0)); }
        ctSource = { ctid: ctSel.ctid, brokerName: ctSel.acc.broker_name || '', isLive: !!ctSel.acc.is_live, symbolId: ctSel.symbolId, symbolName: ctSel.symbolName, digits: isFinite(info.digits) ? info.digits : null };
      } else cov = L.cov[sym.id] || await L.src.coverage(sym.id);
      var startSec = fromLocalInput($('bt-f-start').value);
      if (startSec === null) return formError(_t('backtest.err.start_required', 'Başlangıç tarihi seç.'));
      if (startSec < cov.firstT || startSec > cov.lastT) return formError(_t('backtest.err.start_range', 'Başlangıç {from} ile {to} arasında olmalı.', { from: fmtDay(cov.firstT), to: fmtDay(cov.lastT) }));
      var no = S.nextOpen(startSec * 1000, sym.id);
      if (no === null || no / 1000 > cov.lastT) return formError(_t('backtest.err.no_data_after', 'Bu tarihten sonra veri yok.'));
      var row = E.accountInsertRow({ id: newId(), userId: L.user.id, journalId: SYNC && source === 'ctrader' ? ($('bt-f-journal').value || null) : null, dataSource: source, source: ctSource,
        name: name, symbol: sym.id, tf: $('bt-f-tf').value,
        startCents: bal.value, spreadH: sp.value, cplCents: cm.value, replaySec: no / 1000 + 60 });
      var created = await L.store.createAccount(row);
      closeModal('bt-account-modal');
      await loadList();
      openAccount(created.id, { startAt: startSec });
    } catch (e) {
      var msg = mapStoreError(e);
      formError(msg);
      if (e && String(e.message).indexOf('BACKTEST_LIMIT_EXCEEDED') >= 0 && L.plan !== 'premium' && typeof window.openUpgradeModal === 'function') { closeModal('bt-account-modal'); window.openUpgradeModal({ feature: 'backtest' }); }
    } finally { btn.disabled = false; }
  }

  function openDeleteModal(acc, opener) {
    if (!acc) return;
    editing = acc;
    var s = L.summaries[acc.id] || { closed: 0, open: 0 };
    $('bt-delete-text').textContent = _t('backtest.delete.message', '"{name}" hesabı ve {n} işlemi kalıcı olarak silinecek.', { name: acc.name, n: s.closed + s.open });
    show($('bt-delete-note'), false);
    openModal('bt-delete-modal', opener);
    if (SYNC && acc.journalId) {
      SYNC.countMirrors(syncAcc(acc)).then(function (c) {
        if (!PAGE.alive || editing !== acc || !c.count) return;
        $('bt-delete-note').textContent = _t('backtest.sync.delete_confirm_linked', 'Backtest hesabı ve tüm işlemleri silinecek; bağlı hesaba aktarılan {count} işlem de silinecek. Bu işlem geri alınamaz.', { count: c.count });
        show($('bt-delete-note'), true);
      });
    }
  }
  async function confirmDelete() {
    var acc = editing; if (!acc) return;
    try {
      if (SYNC && acc.journalId) {
        var dr = await SYNC.deleteAccount(syncAcc(acc));
        if (!dr.ok) throw (dr.error || new Error('delete failed'));
      } else await L.store.deleteAccount(acc.id);
      closeModal('bt-delete-modal'); closeModal('bt-account-modal');
      if (R && R.acc.id === acc.id) { closeReplayState(); }
      await loadList(); showList();
      toast(_t('backtest.toast.deleted', 'Hesap silindi'), 'success');
    } catch (e) { toast(mapStoreError(e), 'error'); }
  }

  async function confirmReset() {
    var acc = editing; if (!acc) return;
    try {
      await L.store.deleteTrades(acc.id);
      if (SYNC && acc.journalId) syncResult(await SYNC.reconcileAccount(syncAcc(acc), { closedTrades: [] }));   // the mirrors of the deleted trades go too
      closeModal('bt-reset-modal'); closeModal('bt-account-modal');
      if (R && R.acc.id === acc.id) {
        R.eng.open = []; R.eng.closed = []; R.eng.realizedCents = 0;
        syncPriceLines(); rebuildMarkers(); renderTables(); renderStats(); renderLive(true);
      }
      await loadList();
      if (!R) renderList();
      toast(_t('backtest.reset.done', 'Hesap sıfırlandı'), 'success');
    } catch (e) { toast(mapStoreError(e), 'error'); }
  }
  function applyAccountChange(a) {
    R.acc = a; R.eng.sp = E.spreadPts(R.sym, a.spreadH); R.eng.cplCents = a.cplCents; R.eng.startCents = a.startCents;
    setText('bt-acc-name', a.name);
    updateAskLine(); renderLive(true); renderStats();
  }

  // ---------------------------------------------------------------- replay: open / close
  async function openAccount(id, opts) {
    opts = opts || {};
    var acc = findAccount(id); if (!acc) return showList();
    var sym = S.get(acc.symbol); if (!sym) return showList();
    showCtNeeded(false);
    try {
      var rows = await L.store.listTrades(id);
      if (!PAGE.alive) return;
      var eng = E.createState({ sym: sym, startCents: acc.startCents, spreadPts: E.spreadPts(sym, acc.spreadH), cplCents: acc.cplCents });
      E.restore(eng, rows);
      var spd = SPEED_DEFAULT;
      try { var sv = parseFloat(localStorage.getItem(SPEED_KEY)); if (SPEEDS.indexOf(sv) >= 0) spd = sv; } catch (e) { /* ignore */ }
      R = { acc: acc, sym: sym, scale: Math.pow(10, sym.digits), tfId: acc.tf, tfMin: C.TF_MIN[acc.tf] || 60, speed: spd,
        cov: null, win: null, winMonths: [], k: 0, candles: [], builder: null, eng: eng, token: 0, playing: false, rafId: 0, lastTs: null,
        accum: 0, buffering: false, busy: false, loadingNext: null, nextState: null, dirtyFrom: -1, closedQueue: [], gap: null,
        chart: null, series: null, askLine: null, lines: {}, dirty: false, lastSavedReplaySec: acc.replaySec, lastSaveAt: 0, lastLiveAt: 0,
        src: srcFor(acc), abort: new AbortController() };
      setPageState('replay');
      $('bt-view-replay').setAttribute('data-replay', 'loading');
      setText('bt-acc-name', acc.name); setText('bt-acc-symbol', sym.name); setSourceLabel(acc);
      $('bt-tf').value = acc.tf; $('bt-speed').value = String(spd);
      try { var u = new URL(location.href); u.searchParams.set('account', id); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (e) { /* ignore */ }
      overlay(_t('backtest.chart.loading', 'Mum verisi yükleniyor…'));
      buildChart();
      R.cov = await R.src.coverage(sym.id);
      if (!PAGE.alive || !R) return;
      var replaySec = acc.replaySec || R.cov.firstT + 60;
      eng.open.forEach(function (p) { replaySec = Math.max(replaySec, p.entryT); });
      eng.closed.forEach(function (t) { replaySec = Math.max(replaySec, t.reason === 'manual' ? t.exitT : t.exitT + 60); });
      var g0 = opts.startAt ? 'goto' : 'resume';
      await placeCursor(opts.startAt || replaySec, g0);
      if (SYNC && acc.journalId && R) {
        var closedRows = rows.filter(function (r) { return r.exit_time; });
        SYNC.reconcileAccount(syncAcc(acc), { closedTrades: closedRows }).then(syncResult);
      }
      if (opts.startAt && R) saveReplayTime(true);
    } catch (e) {
      if (!PAGE.alive) return;
      wwLogWarn(e);
      var ctLost = acc.dataSource === 'ctrader' && e && e.code === 'AUTH';
      closeReplayState(); showList();
      if (ctLost) { L.ct = null; showCtNeeded(true); }                        // trades and journal copies stay; only the data needs the connection
      else toast(acc.dataSource === 'ctrader' && e && e.code ? ctErrorText(e) : _t('backtest.data.unavailable', 'Mum verisi şu an kullanılamıyor.'), 'error');
    }
  }
  function closeReplayState() {
    if (!R) return;
    pause(); saveReplayTime(true);
    R.abort.abort(); R.token++;
    destroyChart();
    R = null;
    window.clearTimeout(chipTimer);
  }
  async function backToList() {
    if (!R) return;
    closeReplayState();
    await loadList(); if (!PAGE.alive) return;
    showList();
  }

  // ---------------------------------------------------------------- cursor and windows
  function barAt(k) { var W = R.win; return [W.t[k], W.o[k], W.h[k], W.l[k], W.c[k]]; }
  function monthMinutes(key, tok) {
    return R.src.getMonthMinutes(R.sym.id, key, { signal: R.abort.signal }).then(function (m) { return stale(tok) ? null : m; });
  }
  function nearestPresent(months, key, dir) {
    if (months.indexOf(key) >= 0) return key;
    var i;
    if (dir > 0) { for (i = 0; i < months.length; i++) if (months[i] > key) return months[i]; return months[months.length - 1]; }
    for (i = months.length - 1; i >= 0; i--) if (months[i] < key) return months[i];
    return months[0];
  }
  function nextPresent(months, key) { for (var i = 0; i < months.length; i++) if (months[i] > key) return months[i]; return null; }
  function prevPresent(months, key) { for (var i = months.length - 1; i >= 0; i--) if (months[i] < key) return months[i]; return null; }
  function resetLoads() { R.loadingNext = null; R.nextState = null; R.buffering = false; hideDataBanner(); }

  async function placeCursor(targetSec, mode) {
    var tok = ++R.token; pause(); setReplay('loading'); overlay(_t('backtest.chart.loading', 'Mum verisi yükleniyor…'));
    resetLoads();
    var cov = R.cov, id = R.sym.id;
    var want = mode === 'goto' ? Math.floor((S.nextOpen(targetSec * 1000, id) || cov.lastT * 1000) / 1000) : targetSec - 60;
    want = Math.min(Math.max(want, cov.firstT), cov.lastT);
    var key = nearestPresent(cov.months, C.monthKey(want), mode === 'goto' ? 1 : -1);
    var m, k, pm;
    try { m = await monthMinutes(key, tok); } catch (e) { return dataFailed(e); }
    if (stale(tok) || !m) return;
    k = mode === 'goto' ? C.indexAtOrAfter(m, want) : C.indexAtOrBefore(m, want);
    R.winMonths = [key];
    if (mode === 'goto' && k >= m.n) {
      var nk = nextPresent(cov.months, key);
      if (nk) { try { m = await monthMinutes(nk, tok); } catch (e2) { return dataFailed(e2); } if (stale(tok) || !m) return; key = nk; k = 0; R.winMonths = [nk]; } else k = m.n - 1;
    }
    if (mode === 'resume' && k < 0) {
      var pk = prevPresent(cov.months, key);
      if (pk) { try { pm = await monthMinutes(pk, tok); } catch (e3) { return dataFailed(e3); } if (stale(tok) || !pm) return; m = C.concatMinutes(pm, m); k = pm.n - 1; R.winMonths = [pk, key]; } else k = 0;
    }
    if (!m.n) { return dataFailed({ code: 'CORRUPT' }); }
    R.win = m; R.k = Math.max(0, k);
    E.setQuote(R.eng, barAt(R.k));
    R.candles = C.aggregate(m, R.tfMin, id, 0, R.k);
    R.builder = C.createBuilder(R.tfMin, id, R.candles);
    renderChartData(); rebuildMarkers(); syncPriceLines(); updateAskLine(); renderLive(true); renderTables(); renderStats();
    hideOverlay(); setReplay('ready');
    var gi = $('bt-goto-input');
    gi.min = toLocalInput(cov.firstT); gi.max = toLocalInput(cov.lastT); gi.value = toLocalInput(R.win.t[R.k] + 60);
    loadHistory(tok); maybePrefetch();
  }
  function dataFailed(e) {
    if (!R) return;
    pause(); hideOverlay(); setReplay('error');
    showDataBanner({ kind: 'error', err: e });
  }

  async function loadHistory(tok) {
    var first = R.winMonths[0], need = C.historyMonths(R.tfMin), keys = [];
    for (var i = 1; i <= need; i++) { var k2 = C.addMonths(first, -i); if (R.cov.months.indexOf(k2) >= 0) keys.unshift(k2); }
    if (!keys.length) return;
    var hist = [];
    for (var j = 0; j < keys.length; j++) {
      var mm;
      try { mm = await monthMinutes(keys[j], tok); } catch (e) { return; }
      if (stale(tok) || !mm) return;
      overlay(_t('backtest.chart.loading_n', 'Geçmiş yükleniyor {done}/{total}', { done: j + 1, total: keys.length }), true);
      hist = C.merge(hist, C.aggregate(mm, R.tfMin, R.sym.id));
    }
    hideOverlay();
    var before = R.candles.length, range = R.chart ? R.chart.timeScale().getVisibleLogicalRange() : null;
    R.candles = C.merge(hist, R.candles);
    var added = R.candles.length - before;
    R.builder = C.createBuilder(R.tfMin, R.sym.id, R.candles);
    renderChartData();
    if (range) R.chart.timeScale().setVisibleLogicalRange({ from: range.from + added, to: range.to + added });
    rebuildMarkers();
  }
  function maybePrefetch() {
    if (!R || R.nextState || R.loadingNext) return;
    var lastT = R.win.t[R.win.n - 1];
    if (lastT - R.win.t[R.k] < PREFETCH_AHEAD_SEC) loadNext(R.token);
  }
  function loadNext(tok) {
    if (R.loadingNext) return R.loadingNext;
    if (R.nextState) return Promise.resolve(false);
    var lastKey = R.winMonths[R.winMonths.length - 1], nk = C.nextMonth(lastKey);
    if (R.cov.months.indexOf(nk) < 0) { R.nextState = { kind: 'end' }; return Promise.resolve(false); }
    R.loadingNext = monthMinutes(nk, tok).then(function (m) {
      R.loadingNext = null; if (stale(tok) || !m) return false;
      R.win = C.concatMinutes(R.win, m); R.winMonths.push(nk); return true;
    }, function (e) { if (R) R.loadingNext = null; if (!stale(tok)) R.nextState = { kind: 'error', err: e }; return false; });
    return R.loadingNext;
  }
  function maybeTrim() {
    if (R.winMonths.length < 2) return;
    var firstLen = C.indexAtOrAfter(R.win, C.monthStart(R.winMonths[1]));
    if (R.k >= firstLen) { R.win = C.sliceMinutes(R.win, firstLen); R.k -= firstLen; R.winMonths.shift(); }
  }

  // ---------------------------------------------------------------- play loop
  var BAR = [0, 0, 0, 0, 0];
  function advance1() {
    var W = R.win, k = ++R.k;
    BAR[0] = W.t[k]; BAR[1] = W.o[k]; BAR[2] = W.h[k]; BAR[3] = W.l[k]; BAR[4] = W.c[k];
    var closed = E.onBar(R.eng, BAR);
    var idx = R.builder.push(BAR[0], BAR[1], BAR[2], BAR[3], BAR[4]);
    if (R.dirtyFrom < 0 || idx < R.dirtyFrom) R.dirtyFrom = idx;
    if (closed.length) Array.prototype.push.apply(R.closedQueue, closed);
    if (k > 0 && BAR[0] - W.t[k - 1] > 60) R.gap = C.gapKind(W.t[k - 1], BAR[0], R.sym.id);
    R.dirty = true;
  }
  function play() {
    if (!R || R.playing || R.busy || anyModalOpen()) return;
    if (R.k + 1 >= R.win.n) {
      loadNext(R.token).then(function (ok) { if (!PAGE.alive || !R) return; if (ok) play(); else showDataBanner(R.nextState); });
      return;
    }
    R.playing = true; R.lastTs = null; R.accum = 0; setPlayUi(true); setReplay('playing');
    R.rafId = requestAnimationFrame(tick);
  }
  function pause() {
    if (!R) return;
    if (R.rafId) cancelAnimationFrame(R.rafId);
    R.rafId = 0;
    if (R.playing) { R.playing = false; setPlayUi(false); setReplay('ready'); saveReplayTime(true); }
  }
  function tick(ts) {
    if (R) R.rafId = 0;
    if (!PAGE.alive || !R || !R.playing) return;
    var dt = R.lastTs === null ? 16 : ts - R.lastTs; R.lastTs = ts;
    var plan = C.framePlan(R.accum, dt, R.speed, R.tfMin, MAX_BARS_PER_FRAME);
    R.accum = plan.acc;
    for (var i = 0; i < plan.n; i++) {
      if (R.k + 1 >= R.win.n) { needMore(); break; }
      advance1();
    }
    afterFrame();
    if (R && R.playing && !R.buffering) R.rafId = requestAnimationFrame(tick);
  }
  function needMore() {
    if (R.buffering) return;
    var tok = R.token; R.buffering = true; setReplay('buffering'); overlay(_t('backtest.chart.buffering', 'Sonraki ay yükleniyor…'), true);
    loadNext(tok).then(function (ok) {
      if (!PAGE.alive || stale(tok)) return;
      R.buffering = false; hideOverlay();
      if (!ok) { pause(); showDataBanner(R.nextState); return; }
      if (R.playing && !R.rafId) { R.lastTs = null; R.rafId = requestAnimationFrame(tick); }
    });
  }
  function afterFrame() {
    flushChart();
    if (R.closedQueue.length) handleClosed(R.closedQueue.splice(0));
    updateAskLine();
    var now = performance.now();
    if (now - R.lastLiveAt >= LIVE_UI_MS) { R.lastLiveAt = now; renderLive(false); }
    if (R.gap) { showGapChip(R.gap); R.gap = null; }
    maybeTrim(); maybePrefetch();
    if (R.dirty && now - R.lastSaveAt >= SAVE_EVERY_MS) saveReplayTime(false);
  }

  async function stepCandle() {
    if (!R || R.busy) return;
    pause(); R.busy = true; var tok = R.token;
    try {
      var st;
      for (;;) {
        st = C.stepTarget(R.win, R.k, R.tfMin, R.sym.id);
        if (!st.open) break;
        var more = await loadNext(tok);
        if (stale(tok)) return;
        if (!more) break;
      }
      st = C.stepTarget(R.win, R.k, R.tfMin, R.sym.id);
      if (st.j === R.k) { showDataBanner(R.nextState); return; }
      while (R.k < st.j) advance1();
      afterFrame(); saveReplayTime(true);
    } finally { if (R) R.busy = false; }
  }
  async function stepMinute() {
    if (!R || R.busy) return;
    pause(); var tok = R.token;
    if (R.k + 1 >= R.win.n) {
      var ok = await loadNext(tok);
      if (stale(tok)) return;
      if (!ok) { showDataBanner(R.nextState); return; }
    }
    advance1(); afterFrame(); saveReplayTime(true);
  }
  async function goTo(sec) {
    if (!R) return;
    if (sec === null) return toast(_t('backtest.err.start_required', 'Tarih seç.'), 'warning');
    if (R.eng.open.length) return toast(_t('backtest.err.goto_open_positions', 'Açık pozisyon varken tarihe gidilemez.'), 'warning');
    var nowSec = R.win.t[R.k] + 60;
    if (R.eng.closed.length && sec < nowSec) return toast(_t('backtest.err.goto_backward', 'İşlem yapılmış hesapta geri gidilemez; önce hesabı sıfırlayın.'), 'warning');
    if (sec > R.cov.lastT) return toast(_t('backtest.err.no_data_after', 'Bu tarihten sonra veri yok.'), 'warning');
    await placeCursor(Math.max(sec, R.cov.firstT), 'goto');
    if (R) saveReplayTime(true);
  }
  function setTimeframe(tfId) {
    if (!R || !C.TF_MIN[tfId] || tfId === R.tfId) return;
    pause(); R.tfId = tfId; R.tfMin = C.TF_MIN[tfId]; var tok = ++R.token;
    resetLoads(); hideOverlay();
    R.candles = C.aggregate(R.win, R.tfMin, R.sym.id, 0, R.k);
    R.builder = C.createBuilder(R.tfMin, R.sym.id, R.candles);
    renderChartData(); rebuildMarkers();
    loadHistory(tok); maybePrefetch();
    L.store.updateAccount(R.acc.id, { timeframe: tfId }).catch(function (e) { toast(mapStoreError(e), 'error'); });
    R.acc.tf = tfId;
  }
  function setSpeed(v) { if (!R) return; R.speed = v; try { localStorage.setItem(SPEED_KEY, String(v)); } catch (e) { /* ignore */ } }

  // ---------------------------------------------------------------- persistence
  function saveReplayTime(force) {
    if (!R || !R.win || (!R.dirty && !force)) return;
    var sec = R.win.t[R.k] + 60;
    if (sec === R.lastSavedReplaySec) { R.dirty = false; return; }
    R.lastSaveAt = performance.now(); R.dirty = false;
    var acc = R.acc, prev = R.lastSavedReplaySec;
    R.lastSavedReplaySec = sec;
    L.store.updateAccount(acc.id, E.accountPatch({ replaySec: sec })).catch(function (e) {
      if (R) R.lastSavedReplaySec = prev;
      if (String(e && e.message).indexOf('BACKTEST_REPLAY_BACKWARD') < 0) wwLogWarn(e);
    });
  }
  function wwLogWarn(e) { try { window.wwLog.warn('[bt]', e); } catch (x) { /* ignore */ } }
  function persist(label, run, onFail) {
    var job = { label: label, run: run, onFail: onFail };
    run().then(function () { show($('bt-save-banner'), failedJobs.length > 0); }, function (e) {
      if (e && e.code === '23505') return;
      failedJobs.push(job);
      if (onFail) onFail();
      toast(_t('backtest.err.save_failed', 'Kaydedilemedi, tekrar denenecek.'), 'error');
      show($('bt-save-banner'), true); pause();
    });
  }
  function retrySave() {
    var jobs = failedJobs; failedJobs = []; show($('bt-save-banner'), false);
    jobs.forEach(function (j) { persist(j.label, j.run, j.onFail); });
  }
  function ctx() { return { userId: L.user.id, accountId: R.acc.id }; }
  function persistClose(t) {
    var patch = E.tradeClosePatch(R.eng, t, { extraColumns: EXTRA_COLUMNS }), id = t.id, acc = R.acc;
    persist('close', function () {
      return L.store.updateTrade(id, patch, { onlyOpen: true }).then(function (rows) {
        if (!rows.length) return wwLogWarn('close matched no open row');
        // linked account: copy the CLOSED trade (the saved DB row, not the engine object) into the journal
        if (SYNC && acc.journalId) SYNC.syncClosedTrade(syncAcc(acc), rows[0]).then(function (r) {
          syncResult(r);
          if (r && r.account && PAGE.alive) L.store.getAccount(acc.id).then(function (fresh) { if (fresh && R && R.acc.id === acc.id) applyAccountChange(E.accountFromRow(fresh)); });
        });
      });
    }, function () { t.unsaved = true; renderTables(); });
  }

  // ---------------------------------------------------------------- orders
  function orderError(msg) { var e = $('bt-order-error'); e.textContent = msg; e.hidden = !msg; }
  function codeMessage(e) {
    var s = R.sym, q = E.quote(R.eng) || { bid: 0, ask: 0 };
    switch (e.code) {
      case 'NO_QUOTE': return _t('backtest.err.no_quote', 'Henüz fiyat yok.');
      case 'LOT_RANGE': return _t('backtest.err.lot_range', 'Lot {min} ile {max} arasında olmalı.', { min: s.lot.min, max: s.lot.max });
      case 'PRICE': return _t('backtest.err.price_format', 'Geçerli bir fiyat gir.');
      case 'SL_LONG': return _t('backtest.err.sl_long', 'AL için SL, SAT fiyatının ({bid}) altında olmalı.', { bid: E.ptsToStr(q.bid, s.digits) });
      case 'TP_LONG': return _t('backtest.err.tp_long', 'AL için TP, AL fiyatının ({ask}) üstünde olmalı.', { ask: E.ptsToStr(q.ask, s.digits) });
      case 'SL_SHORT': return _t('backtest.err.sl_short', 'SAT için SL, AL fiyatının ({ask}) üstünde olmalı.', { ask: E.ptsToStr(q.ask, s.digits) });
      case 'TP_SHORT': return _t('backtest.err.tp_short', 'SAT için TP, SAT fiyatının ({bid}) altında olmalı.', { bid: E.ptsToStr(q.bid, s.digits) });
      case 'MAX_POSITIONS': return _t('backtest.err.max_positions', 'En fazla {n} açık pozisyon olabilir.', { n: E.MAX_POSITIONS });
      case 'NO_EQUITY': return _t('backtest.err.no_equity', 'Özsermaye tükendi, yeni işlem açılamaz.');
      case 'MODIFY_LONG': return _t('backtest.err.modify_long', 'AL için SL piyasanın altında, TP üstünde olmalı.');
      case 'MODIFY_SHORT': return _t('backtest.err.modify_short', 'SAT için SL piyasanın üstünde, TP altında olmalı.');
      default: return _t('backtest.err.generic', 'Bir hata oluştu. Lütfen tekrar dene.');
    }
  }
  function parseLevel(id) {
    var inp = $(id), v = inp.value.trim();
    if (v === '') return { ok: true, value: null };
    var r = E.parseScaled(v, R.sym.digits, 'round');
    if (!r.ok || !(r.value > 0)) return { ok: false, code: 'PRICE' };
    if (r.snapped) { inp.value = E.ptsToStr(r.value, R.sym.digits); toast(_t('backtest.order.price_snapped', 'Fiyat {price} olarak yuvarlandı.', { price: inp.value }), 'info'); }
    return { ok: true, value: r.value };
  }
  function parseLot() {
    var s = R.sym, r = E.parseScaled($('bt-lot').value, s.lotDigits, 'exact');
    if (!r.ok) return { ok: false, msg: _t('backtest.err.lot_format', 'Lot en fazla {step} adımlarıyla girilebilir.', { step: s.lot.step }) };
    var unit = Math.round(s.lot.step * Math.pow(10, s.lotDigits));
    if (r.value % unit !== 0) return { ok: false, msg: _t('backtest.err.lot_format', 'Lot en fazla {step} adımlarıyla girilebilir.', { step: s.lot.step }) };
    return { ok: true, steps: r.value / unit };
  }
  function readOrder(dir) {
    var lot = parseLot(); if (!lot.ok) return { ok: false, msg: lot.msg };
    var sl = parseLevel('bt-sl'), tp = parseLevel('bt-tp');
    if (!sl.ok || !tp.ok) return { ok: false, msg: codeMessage({ code: 'PRICE' }) };
    return { ok: true, o: { dir: dir, steps: lot.steps, sl: sl.value, tp: tp.value } };
  }
  function submitOrder(dir) {
    if (!R || !R.win) return;
    var rd = readOrder(dir); if (!rd.ok) return orderError(rd.msg);
    var pos;
    try { pos = E.openPosition(R.eng, { id: newId(), dir: dir, steps: rd.o.steps, sl: rd.o.sl, tp: rd.o.tp }); } catch (e) { return orderError(codeMessage(e)); }
    orderError('');
    var row = E.tradeInsertRow(R.eng, pos, ctx());
    persist('open', function () { return L.store.insertTrade(row); }, function () { pos.unsaved = true; renderTables(); });
    $('bt-sl').value = ''; $('bt-tp').value = '';
    syncPriceLines(); rebuildMarkers(); renderTables(); renderLive(true); renderStats(); saveReplayTime(true);
  }
  function closePos(id) {
    if (!R) return;
    var t = E.closePosition(R.eng, id); if (!t) return;
    handleClosed([t]); saveReplayTime(true);
  }
  function openEditPos(id) {
    var p = null; R.eng.open.forEach(function (x) { if (x.id === id) p = x; });
    if (!p) return;
    editing = p; var s = R.sym;
    $('bt-pos-info').textContent = (p.dir > 0 ? _t('backtest.order.buy', 'AL') : _t('backtest.order.sell', 'SAT')) + ' ' + E.stepsToStr(p.steps, s.lotDigits) + ' @ ' + E.ptsToStr(p.entry, s.digits);
    $('bt-pos-sl').value = p.sl == null ? '' : E.ptsToStr(p.sl, s.digits); $('bt-pos-tp').value = p.tp == null ? '' : E.ptsToStr(p.tp, s.digits);
    show($('bt-pos-error'), false);
    openModal('bt-pos-modal');
  }
  function submitEditPos() {
    var p = editing; if (!p || !R) return;
    function lv(id) { var v = $(id).value.trim(); if (v === '') return { ok: true, value: null }; var r = E.parseScaled(v, R.sym.digits, 'round'); return r.ok && r.value > 0 ? { ok: true, value: r.value } : { ok: false }; }
    var sl = lv('bt-pos-sl'), tp = lv('bt-pos-tp'), err = $('bt-pos-error');
    if (!sl.ok || !tp.ok) { err.textContent = codeMessage({ code: 'PRICE' }); err.hidden = false; return; }
    try { E.modifyPosition(R.eng, p.id, sl.value, tp.value); } catch (e) { err.textContent = codeMessage(e); err.hidden = false; return; }
    var patch = E.tradeModifyPatch(R.eng, p), id = p.id;
    persist('modify', function () { return L.store.updateTrade(id, patch, { onlyOpen: true }); }, function () { p.unsaved = true; renderTables(); });
    closeModal('bt-pos-modal'); syncPriceLines(); renderTables(); renderLive(true);
  }
  function handleClosed(trades) {
    trades.forEach(persistClose);
    syncPriceLines(); rebuildMarkers(); renderTables(); renderStats(); renderLive(true);
    var sum = 0; trades.forEach(function (t) { sum += t.net; });
    if (trades.length === 1) {
      var t = trades[0];
      toast(_t('backtest.toast.closed', '{dir} kapandı ({reason}): {pnl}', { dir: dirLabel(t.dir), reason: reasonLabel(t.reason), pnl: fmtUsd(t.net, true) }), sum >= 0 ? 'success' : 'info');
    } else toast(_t('backtest.toast.closed_many', '{n} işlem kapandı: {pnl}', { n: trades.length, pnl: fmtUsd(sum, true) }), sum >= 0 ? 'success' : 'info');
    if (trades.some(function (t) { return t.ambiguous; })) toast(_t('backtest.toast.ambiguous', 'TP ve SL aynı 1 dakikalık mumda: SL sayıldı.'), 'warning');
  }
  function dirLabel(dir) { return dir > 0 ? _t('backtest.order.buy', 'AL') : _t('backtest.order.sell', 'SAT'); }
  function reasonLabel(r) {
    return r === 'tp' ? 'TP' : r === 'sl' ? 'SL' : _t('backtest.reason.manual', 'Manuel');
  }

  // ---------------------------------------------------------------- chart
  function colors() { return window.WwChart.colors(); }
  // The chart clips a label whose centre is closer to the left edge than half its width ("30 Jun" showed as "0 Jun").
  // Such a tick is shown blank instead. The chart caches the formatted text per tick time, so the set of blanked ticks
  // is re-checked whenever the visible range changes and the labels are re-formatted when that set changes.
  function clipLimit(len) { return len * 3.8 + 4; }
  function tickLabel(time, type) {
    var text = tickText(time, type);
    if (!text || !R || !R.chart) return text;
    if (!R.tickSeen) { R.tickSeen = {}; R.tickHide = {}; }
    R.tickSeen[time] = text.length;
    try {
      var x = R.chart.timeScale().timeToCoordinate(time);
      if (x !== null && x > -4 && x < clipLimit(text.length)) { R.tickHide[time] = true; return ''; }
    } catch (e) { /* keep the label */ }
    return R.tickHide[time] ? '' : text;
  }
  function refreshClippedTicks() {
    if (!R || !R.chart || !R.tickSeen) return;
    var ts = R.chart.timeScale(), seen = R.tickSeen, hide = {}, changed = false, k;
    var keys = Object.keys(seen);
    if (keys.length > 4000) { R.tickSeen = {}; R.tickHide = {}; return; }
    keys.forEach(function (t) {
      var x = ts.timeToCoordinate(+t);
      if (x !== null && x > -4 && x < clipLimit(seen[t])) hide[t] = true;
    });
    for (k in hide) if (!R.tickHide[k]) changed = true;
    for (k in R.tickHide) if (!hide[k]) changed = true;
    if (!changed) return;
    R.tickHide = hide;
    ts.applyOptions({ tickMarkFormatter: tickLabel });
  }
  function tickText(time, type) {
    if (typeof time !== 'number' || !R) return null;
    var mo = MONTHS[lang()] || MONTHS.tr;
    if (R.tfMin >= 1440) {
      var key = S.tradingDayKey(time * 1000, R.sym.id), y = +key.slice(0, 4), m = +key.slice(5, 7), d = +key.slice(8, 10);
      return type === 0 ? String(y) : type === 1 ? mo[m - 1] : d + ' ' + mo[m - 1];
    }
    var p = window.WwTime.partsInTz(time * 1000, tz());
    if (type === 0) return String(p.y);
    if (type === 1) return mo[p.m - 1];
    if (type === 2 || (p.H === 0 && p.Mi === 0)) return p.d + ' ' + mo[p.m - 1];
    return fmtTime(time);
  }
  function crosshairTime(time) { return R && R.tfMin >= 1440 ? fmtTradingDay(time) : fmtDateTime(time); }
  function buildChart() {
    var c = colors();
    R.chart = window.LightweightCharts.createChart($('bt-chart'), window.WwChart.lwc({
      autoSize: true,
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 8,
        shiftVisibleRangeOnNewBar: true, lockVisibleTimeRangeOnResize: true, tickMarkFormatter: tickLabel },
      localization: { locale: localeTag(), timeFormatter: crosshairTime },
      crosshair: { mode: window.LightweightCharts.CrosshairMode.Normal },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true }
    }));
    R.series = R.chart.addCandlestickSeries({
      upColor: c.up, downColor: c.down, borderUpColor: c.up, borderDownColor: c.down, wickUpColor: c.up, wickDownColor: c.down,
      priceFormat: S.priceFormat(R.sym.id)
    });
    R.chart.subscribeCrosshairMove(renderLegend);
    R.chart.timeScale().subscribeVisibleLogicalRangeChange(refreshClippedTicks);
    if (!R.chart.autoSizeActive || !R.chart.autoSizeActive()) installResizeFallback();
  }
  function destroyChart() {
    if (!R || !R.chart) return;
    try { R.chart.remove(); } catch (e) { /* ignore */ }
    R.chart = null; R.series = null; R.lines = {}; R.askLine = null;
  }
  function rebuildChart() {
    if (!R || !R.chart) return;
    var range = R.chart.timeScale().getVisibleLogicalRange();
    destroyChart(); buildChart();
    if (R.candles.length) { renderChartData(); rebuildMarkers(); syncPriceLines(); updateAskLine(); }
    if (range) R.chart.timeScale().setVisibleLogicalRange(range);
  }
  function renderChartData() {
    if (!R.series) return;
    if (R.candles.length > MAX_CHART_CANDLES) { R.candles.splice(0, R.candles.length - TRIM_TO); R.builder = C.createBuilder(R.tfMin, R.sym.id, R.candles); }
    R.series.setData(R.candles.map(function (x) { return C.toChartBar(x, R.scale); }));
    R.dirtyFrom = -1;
    renderLegend();
  }
  function flushChart() {
    if (R.dirtyFrom < 0 || !R.series) return;
    for (var i = R.dirtyFrom; i < R.candles.length; i++) R.series.update(C.toChartBar(R.candles[i], R.scale));
    R.dirtyFrom = -1;
  }
  function rebuildMarkers() {
    if (!R || !R.series) return;
    var c = colors(), first = R.candles.length ? R.candles[0].time : 0, last = R.candles.length ? R.candles[R.candles.length - 1].time : 0, m = [];
    R.eng.closed.slice(-MAX_MARKER_TRADES).concat(R.eng.open).forEach(function (t) {
      var long = t.dir > 0;
      m.push({ time: C.bucketStart(t.entryBarT, R.tfMin, R.sym.id), position: long ? 'belowBar' : 'aboveBar', shape: long ? 'arrowUp' : 'arrowDown',
        color: long ? c.up : c.down, text: dirLabel(t.dir) + ' ' + E.stepsToStr(t.steps, R.sym.lotDigits) });
      if (t.exitT != null) m.push({ time: C.bucketStart(t.exitBarT, R.tfMin, R.sym.id), position: long ? 'aboveBar' : 'belowBar', shape: 'circle',
        color: t.net >= 0 ? c.up : c.down, text: reasonLabel(t.reason) });
    });
    m = m.filter(function (x) { return x.time >= first && x.time <= last; }).sort(function (a, b) { return a.time - b.time; });
    R.series.setMarkers(m);
  }
  function priceLine(Ls, key, pts, opts) {
    if (pts == null) { if (Ls[key]) { R.series.removePriceLine(Ls[key]); Ls[key] = null; } return; }
    var price = pts / R.scale;
    if (Ls[key]) Ls[key].applyOptions({ price: price });
    else Ls[key] = R.series.createPriceLine(Object.assign({ price: price, lineWidth: 1, axisLabelVisible: true }, opts));
  }
  function syncPriceLines() {
    if (!R || !R.series) return;
    var c = colors(), keep = {}, LS = window.LightweightCharts.LineStyle;
    R.eng.open.forEach(function (p) {
      var Ls = R.lines[p.id] || (R.lines[p.id] = {}); keep[p.id] = true;
      priceLine(Ls, 'entry', p.entry, { color: p.dir > 0 ? c.up : c.down, lineStyle: LS.Solid, title: dirLabel(p.dir) + ' ' + E.stepsToStr(p.steps, R.sym.lotDigits) });
      priceLine(Ls, 'sl', p.sl, { color: c.down, lineStyle: LS.Dashed, title: 'SL' });
      priceLine(Ls, 'tp', p.tp, { color: c.up, lineStyle: LS.Dashed, title: 'TP' });
    });
    Object.keys(R.lines).forEach(function (id) {
      if (!keep[id]) { ['entry', 'sl', 'tp'].forEach(function (k) { priceLine(R.lines[id], k, null); }); delete R.lines[id]; }
    });
  }
  function updateAskLine() {
    if (!R || !R.series || !R.eng.quote) return;
    if (!R.eng.sp) { if (R.askLine) { R.series.removePriceLine(R.askLine); R.askLine = null; } return; }
    var ask = (R.eng.quote.bid + R.eng.sp) / R.scale;
    if (R.askLine) R.askLine.applyOptions({ price: ask });
    else R.askLine = R.series.createPriceLine({ price: ask, color: colors().muted, lineWidth: 1, lineStyle: window.LightweightCharts.LineStyle.Dotted, axisLabelVisible: true, title: 'Ask' });
  }
  function renderLegend(param) {
    var box = $('bt-legend'); if (!box || !R) return;
    var bar = null;
    if (param && param.time && param.seriesData && R.series) bar = param.seriesData.get(R.series);
    if (!bar && R.candles.length) bar = C.toChartBar(R.candles[R.candles.length - 1], R.scale);
    if (!bar) { box.textContent = ''; return; }
    var d = R.sym.digits, up = bar.close >= bar.open;
    box.textContent = '';
    [['O', bar.open], ['H', bar.high], ['L', bar.low], ['C', bar.close]].forEach(function (x) {
      var s = el('span', 'bt-leg ' + (up ? 'bt-up' : 'bt-down')); s.appendChild(el('i', '', x[0])); s.appendChild(document.createTextNode(' ' + Number(x[1]).toFixed(d)));
      box.appendChild(s);
    });
  }
  function installResizeFallback() {
    PAGE.on(window, 'resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = later(function () { var w = $('bt-chart'); if (R && R.chart && w) R.chart.applyOptions({ width: w.clientWidth, height: w.clientHeight }); }, 80);
    });
  }

  // ---------------------------------------------------------------- UI rendering
  function setReplay(state) { var v = $('bt-view-replay'); if (v) v.setAttribute('data-replay', state); updateControls(); }
  function updateControls() {
    if (!R) return;
    var st = $('bt-view-replay').getAttribute('data-replay'), blocked = st === 'loading' || st === 'error';
    $('bt-buy-btn').disabled = blocked || !R.eng.quote; $('bt-sell-btn').disabled = blocked || !R.eng.quote;
    var atEnd = R.nextState && R.nextState.kind === 'end' && R.win && R.k + 1 >= R.win.n;
    $('bt-play-btn').disabled = blocked || !!atEnd; $('bt-step-btn').disabled = blocked || !!atEnd; $('bt-step1m-btn').disabled = blocked || !!atEnd;
  }
  function setPlayUi(on) {
    var b = $('bt-play-btn'); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    var t = on ? _t('backtest.pause', 'Duraklat') : _t('backtest.play', 'Oynat');
    b.title = t; setText('bt-play-label', t);
    b.innerHTML = '<i data-lucide="' + (on ? 'pause' : 'play') + '" aria-hidden="true"></i><span id="bt-play-label" class="bt-sr"></span>';
    setText('bt-play-label', t); icons();
  }
  function overlay(text, soft) { var o = $('bt-chart-overlay'); setText('bt-overlay-text', text); o.hidden = false; o.classList.toggle('bt-soft', !!soft); }
  function hideOverlay() { var o = $('bt-chart-overlay'); if (o) o.hidden = true; }
  function showDataBanner(ns) {
    var box = $('bt-data-banner'), btn = $('bt-data-banner-btn');
    if (!ns) return;
    box.hidden = false; btn.hidden = true;
    if (ns.kind === 'end') setText('bt-data-banner-text', _t('backtest.data.end_reached', 'Verinin sonuna ulaşıldı: {time}', { time: fmtDateTime(R.cov.lastT) }));
    else if (ns.err && ns.err.code === 'AUTH') {                              // the cTrader connection is gone: the data cannot be loaded until it is renewed
      setText('bt-data-banner-text', _t('backtest.ctrader.needed_short', 'cTrader bağlantısı gerekli. Bağlantıyı yenileyince devam edebilirsin.'));
      btn.hidden = false; btn.textContent = _t('backtest.ctrader.reconnect', 'cTrader bağlantısını yenile'); btn.onclick = function () { window.location.href = '/journals'; };
    } else {
      setText('bt-data-banner-text', (R && R.acc.dataSource === 'ctrader' && ns.err && ns.err.code && ns.err.code !== 'NOT_FOUND' && ns.err.code !== 'CORRUPT') ? ctErrorText(ns.err) : _t('backtest.data.load_failed', 'Mum verisi yüklenemedi.'));
      btn.hidden = false; btn.textContent = _t('backtest.retry', 'Tekrar dene'); btn.onclick = function () { retryNext(); };
    }
    updateControls();
  }
  function hideDataBanner() { var b = $('bt-data-banner'); if (b) b.hidden = true; }
  function retryNext() {
    if (!R) return;
    hideDataBanner();
    if (R.win) { R.nextState = null; stepMinute(); } else placeCursor(R.acc.replaySec, 'resume');
  }
  function showGapChip(g) {
    var n = $('bt-gap-note'); if (!n) return;
    n.textContent = g.kind === 'closed' ? _t('backtest.market.closed_skipped', 'Piyasa kapalı: {dur} atlandı', { dur: durText(g.minutes) })
      : _t('backtest.market.data_gap', 'Veri boşluğu: {min} dk', { min: g.minutes });
    clearTimeout(chipTimer); chipTimer = later(function () { n.textContent = ''; }, 4000);
  }
  function durText(min) {
    var d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
    return (d ? d + 'g ' : '') + (h ? h + 's ' : '') + (!d && !h ? m + 'dk' : '').trim() || '0dk';
  }

  function renderClock() {
    if (!R || !R.win) return;
    var sec = R.win.t[R.k] + 60;
    setText('bt-clock-time', fmtDateTime(sec));
    var off = ''; try { off = window.WwTime.offsetLabel(tz(), sec * 1000); } catch (e) { off = tz(); }
    setText('bt-clock-tz', off);
    var chip = $('bt-market-chip'), open = S.isOpen(sec * 1000, R.sym.id);
    chip.hidden = open; chip.textContent = _t('backtest.market.closed', 'Piyasa kapalı');
  }
  // spread in pips from the account's hundredths ("20" -> "0.2", "150" -> "1.5", "0" -> "0")
  function pipsStr(h) { return E.hundredthsToStr(h).replace(/\.?0+$/, ''); }
  function renderLive(force) {
    if (!R || !R.win) return;
    var q = E.quote(R.eng), s = R.sym;
    renderClock();
    if (q) {
      setText('bt-bid', E.ptsToStr(q.bid, s.digits)); setText('bt-ask', E.ptsToStr(q.ask, s.digits));
      setText('bt-spread', E.ptsToStr(R.eng.sp, s.digits) + ' (' + pipsStr(R.acc.spreadH) + ' pip)');
    }
    var sm = E.summary(R.eng);
    setText('bt-stat-balance', fmtUsd(sm.balanceCents)); setText('bt-stat-equity', fmtUsd(sm.equityCents));
    var rz = $('bt-stat-realized'), fl = $('bt-stat-floating');
    rz.textContent = fmtUsd(sm.realizedCents, true); rz.className = 'bt-num ' + pnlClass(sm.realizedCents);
    fl.textContent = fmtUsd(sm.floatingCents, true); fl.className = 'bt-num ' + pnlClass(sm.floatingCents);
    // order hint
    var lot = parseLotQuiet();
    var hint = $('bt-lot-hint');
    hint.textContent = _t('backtest.order.lot_hint', 'Adım {step} · {min}–{max} · 1 pip ≈ {pip}', {
      step: s.lot.step, min: s.lot.min, max: s.lot.max, pip: lot && q ? fmtUsd(Math.round(S.pipValueUsd(s.id, lot.lot, q.bid / R.scale) * 100)) : '—' });
    var risk = $('bt-order-risk'); risk.textContent = '';
    if (lot && q) {
      var sl = quietLevel('bt-sl'), tp = quietLevel('bt-tp');
      if (sl !== false && tp !== false && (sl !== null || tp !== null)) {
        var pvB = E.preview(R.eng, { dir: 1, steps: lot.steps, sl: sl, tp: tp });
        if (pvB) risk.textContent = _t('backtest.order.risk', 'Risk {risk} · Kazanç {reward} · R:R {rr}', {
          risk: pvB.riskCents == null ? '—' : fmtUsd(pvB.riskCents), reward: pvB.rewardCents == null ? '—' : fmtUsd(pvB.rewardCents),
          rr: pvB.rr == null ? '—' : E.hundredthsToStr(pvB.rr) });
      }
    }
    if (force || R.eng.open.length) renderOpenRows();
    updateControls();
  }
  function parseLotQuiet() {
    var r = parseLot(); if (!r.ok) return null;
    return { steps: r.steps, lot: r.steps * R.sym.lot.step };
  }
  function quietLevel(id) {
    var v = $(id).value.trim(); if (v === '') return null;
    var r = E.parseScaled(v, R.sym.digits, 'round'); return r.ok && r.value > 0 ? r.value : false;
  }

  function td(text, cls) { return el('td', cls || '', text); }
  function renderOpenRows() {
    var body = $('bt-open-body'), q = R.eng.quote, s = R.sym, fl = E.floating(R.eng);
    body.textContent = '';
    R.eng.open.forEach(function (p) {
      var tr = el('tr'), f = fl.byId[p.id];
      tr.appendChild(td(dirLabel(p.dir), p.dir > 0 ? 'bt-up' : 'bt-down')); tr.appendChild(td(E.stepsToStr(p.steps, s.lotDigits), 'bt-num'));
      tr.appendChild(td(fmtShort(p.entryT), 'bt-num')); tr.appendChild(td(E.ptsToStr(p.entry, s.digits), 'bt-num'));
      tr.appendChild(td(p.sl == null ? '—' : E.ptsToStr(p.sl, s.digits), 'bt-num')); tr.appendChild(td(p.tp == null ? '—' : E.ptsToStr(p.tp, s.digits), 'bt-num'));
      tr.appendChild(td(f ? E.ptsToStr(f.mark, s.digits) : '—', 'bt-num'));
      var pc = td(f ? fmtUsd(f.net, true) : '—', 'bt-num ' + (f ? pnlClass(f.net) : '')); tr.appendChild(pc);
      var act = el('td', 'bt-actions');
      var b1 = el('button', 'btn btn-ghost', _t('backtest.pos.edit', 'Düzenle')); b1.type = 'button'; b1.setAttribute('data-act', 'edit'); b1.setAttribute('data-id', p.id);
      var b2 = el('button', 'btn btn-ghost', _t('backtest.pos.close', 'Kapat')); b2.type = 'button'; b2.setAttribute('data-act', 'close'); b2.setAttribute('data-id', p.id);
      act.appendChild(b1); act.appendChild(b2);
      if (p.unsaved) act.appendChild(el('span', 'bt-chip bt-chip-warn', _t('backtest.pos.unsaved', 'Kaydedilmedi')));
      tr.appendChild(act); body.appendChild(tr);
    });
    show($('bt-open-empty'), R.eng.open.length === 0);
    setText('bt-open-count', String(R.eng.open.length));
    void q;
  }
  function renderTables() {
    if (!R) return;
    renderOpenRows();
    var s = R.sym, body = $('bt-history-body'); body.textContent = '';
    var rows = R.eng.closed.slice().sort(function (a, b) { return b.exitT - a.exitT; });
    rows.slice(0, MAX_HISTORY_ROWS).forEach(function (t) {
      var tr = el('tr');
      tr.appendChild(td(dirLabel(t.dir), t.dir > 0 ? 'bt-up' : 'bt-down')); tr.appendChild(td(E.stepsToStr(t.steps, s.lotDigits), 'bt-num'));
      tr.appendChild(td(fmtShort(t.entryT), 'bt-num')); tr.appendChild(td(E.ptsToStr(t.entry, s.digits), 'bt-num'));
      tr.appendChild(td(fmtShort(t.exitT), 'bt-num')); tr.appendChild(td(E.ptsToStr(t.exit, s.digits), 'bt-num'));
      tr.appendChild(td(reasonLabel(t.reason) + (t.ambiguous ? ' ⚠' : ''), t.ambiguous ? 'bt-warn' : ''));
      tr.appendChild(td(fmtUsd(t.comm), 'bt-num')); tr.appendChild(td(fmtUsd(t.net, true), 'bt-num ' + pnlClass(t.net)));
      tr.appendChild(td(t.rr == null ? '—' : E.hundredthsToStr(t.rr), 'bt-num'));
      body.appendChild(tr);
    });
    show($('bt-history-empty'), rows.length === 0);
    var more = $('bt-history-more'); more.hidden = rows.length <= MAX_HISTORY_ROWS;
    more.textContent = _t('backtest.history.more', 'Son {n} işlem gösteriliyor ({total} işlemden).', { n: MAX_HISTORY_ROWS, total: rows.length });
    setText('bt-history-count', String(rows.length));
  }
  function renderStats() {
    if (!R) return;
    var sm = E.summary(R.eng), grid = $('bt-stats-grid'); grid.textContent = '';
    var met = null;
    try { if (window.WwMetrics) met = window.WwMetrics.summarize(R.eng.closed.map(function (t) { return E.metricsRow(R.eng, t); })); } catch (e) { met = null; }
    function item(k, v) { var d = el('div', 'bt-stats-item'); d.appendChild(el('dt', '', k)); d.appendChild(el('dd', 'bt-num', v)); grid.appendChild(d); }
    item(_t('backtest.stat.balance', 'Bakiye'), fmtUsd(sm.balanceCents));
    item(_t('backtest.stat.trades', 'Kapanan işlem'), String(sm.closedCount));
    item(_t('backtest.stat.wins_losses', 'Kazanç / Kayıp'), sm.wins + ' / ' + sm.losses);
    item(_t('backtest.stat.win_rate', 'Kazanma oranı'), (met ? met.winRate : (sm.closedCount ? sm.wins / sm.closedCount * 100 : 0)).toFixed(1) + '%');
    if (met) {
      item(_t('backtest.stat.profit_factor', 'Profit factor'), window.WwMetrics.formatProfitFactor ? window.WwMetrics.formatProfitFactor(met.profitFactor) : String(met.profitFactor));
      item(_t('backtest.stat.expectancy', 'Beklenti (işlem başı)'), fmtUsd(Math.round(met.expectancy * 100), true));
      item(_t('backtest.stat.avg_rr', 'Ortalama R:R'), met.avgRR == null ? '—' : met.avgRR.toFixed(2));
    }
    item(_t('backtest.stat.max_dd', 'Maks. düşüş'), fmtUsd(sm.maxDdCents) + ' (' + (sm.maxDdBp / 100).toFixed(2) + '%)');
    item(_t('backtest.stat.commission', 'Toplam komisyon'), fmtUsd(sm.commissionCents));
    item(_t('backtest.stat.ambiguous', 'Belirsiz çıkış (TP+SL aynı mumda)'), String(sm.ambiguous));
  }
  function selectTab(name) {
    ['open', 'history', 'stats'].forEach(function (n) {
      $('bt-tab-' + n).setAttribute('aria-selected', n === name ? 'true' : 'false'); show($('bt-panel-' + n), n === name);
    });
    if (name === 'stats') renderStats();
  }

  // ---------------------------------------------------------------- listeners
  function bindStaticUi() {
    $('bt-accounts').addEventListener('click', onAccountsClick);
    $('bt-accounts').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.classList.contains('bt-account-card')) openAccount(e.target.getAttribute('data-id'));
    });
    $('bt-new-account-btn').addEventListener('click', function (e) { newAccountClicked(e.currentTarget); });
    $('bt-empty-create-btn').addEventListener('click', function (e) { newAccountClicked(e.currentTarget); });
    $('bt-list-retry-btn').addEventListener('click', async function () { if (await loadList()) { setPageState('list'); renderList(); } });
    $('bt-back-btn').addEventListener('click', backToList);
    $('bt-acc-settings-btn').addEventListener('click', function (e) { if (R) openAccountModal('edit', R.acc, e.currentTarget); });
    // account modal
    $('bt-account-form').addEventListener('submit', function (e) { e.preventDefault(); submitAccountForm(); });
    $('bt-account-submit').addEventListener('click', submitAccountForm);
    $('bt-account-close').addEventListener('click', function () { closeModal('bt-account-modal'); });
    $('bt-account-cancel').addEventListener('click', function () { closeModal('bt-account-modal'); });
    $('bt-account-delete').addEventListener('click', function (e) { openDeleteModal(editing, e.currentTarget); });
    $('bt-account-reset').addEventListener('click', function (e) { openModal('bt-reset-modal', e.currentTarget); });
    $('bt-f-symbol').addEventListener('change', function () {
      var s = S.get(this.value); $('bt-f-spread').value = E.hundredthsToStr(Math.round(s.defaultSpreadPips * 100)); spreadHint();
      startHint().then(function () { var cov = formCov(); if (cov && PAGE.alive) $('bt-f-start').value = toLocalInput(defaultStart(cov)); });
    });
    $('bt-f-spread').addEventListener('input', spreadHint);
    $('bt-f-source-synthetic').addEventListener('change', onSourceChange);
    $('bt-f-source-ctrader').addEventListener('change', onSourceChange);
    $('bt-f-ct-account').addEventListener('change', function () { refreshCtPanel(true); });
    $('bt-f-ct-symbol').addEventListener('change', function () { refreshCtPanel(false); });
    // delete / reset / position modals
    $('bt-delete-close').addEventListener('click', function () { closeModal('bt-delete-modal'); });
    $('bt-delete-cancel').addEventListener('click', function () { closeModal('bt-delete-modal'); });
    $('bt-delete-confirm').addEventListener('click', confirmDelete);
    $('bt-reset-close').addEventListener('click', function () { closeModal('bt-reset-modal'); });
    $('bt-reset-cancel').addEventListener('click', function () { closeModal('bt-reset-modal'); });
    $('bt-reset-confirm').addEventListener('click', confirmReset);
    $('bt-confirm-ok').addEventListener('click', function () { finishConfirm(true); });
    $('bt-confirm-cancel').addEventListener('click', function () { finishConfirm(false); });
    $('bt-confirm-close').addEventListener('click', function () { finishConfirm(false); });
    $('bt-confirm-modal').addEventListener('click', function (e) { if (e.target === $('bt-confirm-modal')) finishConfirm(false); });
    $('bt-pos-close').addEventListener('click', function () { closeModal('bt-pos-modal'); });
    $('bt-pos-cancel').addEventListener('click', function () { closeModal('bt-pos-modal'); });
    $('bt-pos-save').addEventListener('click', submitEditPos);
    $('bt-pos-form').addEventListener('submit', function (e) { e.preventDefault(); submitEditPos(); });
    ['bt-account-modal', 'bt-delete-modal', 'bt-reset-modal', 'bt-pos-modal'].forEach(function (id) {
      $(id).addEventListener('click', function (e) { if (e.target === $(id)) closeModal(id); });
    });
    // toolbar
    $('bt-tf').addEventListener('change', function () { setTimeframe(this.value); });
    $('bt-speed').addEventListener('change', function () { setSpeed(parseFloat(this.value)); });
    $('bt-play-btn').addEventListener('click', function () { if (R && R.playing) pause(); else play(); });
    $('bt-step-btn').addEventListener('click', stepCandle);
    $('bt-step1m-btn').addEventListener('click', stepMinute);
    $('bt-goto-btn').addEventListener('click', function () { goTo(fromLocalInput($('bt-goto-input').value)); });
    $('bt-goto-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); goTo(fromLocalInput(this.value)); } });
    // orders
    $('bt-buy-btn').addEventListener('click', function () { submitOrder(1); });
    $('bt-sell-btn').addEventListener('click', function () { submitOrder(-1); });
    $('bt-order-form').addEventListener('submit', function (e) { e.preventDefault(); });
    ['bt-lot', 'bt-sl', 'bt-tp'].forEach(function (id) { $(id).addEventListener('input', function () { orderError(''); renderLive(false); }); });
    $('bt-open-body').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act]'); if (!b) return;
      if (b.getAttribute('data-act') === 'close') closePos(b.getAttribute('data-id')); else openEditPos(b.getAttribute('data-id'));
    });
    ['open', 'history', 'stats'].forEach(function (n) { $('bt-tab-' + n).addEventListener('click', function () { selectTab(n); }); });
    $('bt-save-retry-btn').addEventListener('click', retrySave);
  }
  function setupKeyboard() {
    PAGE.on(document, 'keydown', function (e) {
      if (e.key === 'Escape' && anyModalOpen()) { closeAllModals(); return; }
      if (!R || anyModalOpen()) return;
      var tg = e.target && e.target.tagName;
      if (tg === 'INPUT' || tg === 'SELECT' || tg === 'TEXTAREA') return;
      if (e.key === ' ') { e.preventDefault(); if (R.playing) pause(); else play(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (e.shiftKey) stepMinute(); else stepCandle(); }
    });
  }
  function setupVisibility() {
    PAGE.on(document, 'visibilitychange', function () { if (document.hidden && R) { pause(); saveReplayTime(true); } });
    PAGE.on(window, 'pagehide', function () { if (R) saveReplayTime(true); });
  }
  function setupThemeObserver() {
    var last = document.body.classList.contains('light-theme');
    themeObserver = new MutationObserver(function () {
      var now = document.body.classList.contains('light-theme');
      if (now !== last) { last = now; rebuildChart(); }
    });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
  function setupI18n() {
    PAGE.onI18nChange(function () {
      requestAnimationFrame(function () {
        if (!PAGE.alive) return;
        fmtCache = {};
        if (R) {
          renderLive(true); renderTables(); renderStats(); setPlayUi(R.playing);
          if (R.chart) { R.chart.applyOptions({ localization: { locale: localeTag(), timeFormatter: crosshairTime }, timeScale: { tickMarkFormatter: tickLabel } }); rebuildMarkers(); }
        } else if (L.store) renderList();
      });
    });
  }

  // ---------------------------------------------------------------- teardown
  function cleanup() {
    if (cleaned) return; cleaned = true;
    clearTimeout(bootTimer); clearTimeout(resizeTimer); clearTimeout(chipTimer);
    if (SYNC) { try { SYNC.cancelPending(); } catch (e) { /* ignore */ } }
    if (confirmResolve) { var cr = confirmResolve; confirmResolve = null; cr(false); }
    if (R) { try { pause(); saveReplayTime(true); R.abort.abort(); R.token++; } catch (e) { /* ignore */ } }
    if (themeObserver) themeObserver.disconnect();
    try { destroyChart(); } catch (e) { /* ignore */ }
    R = null; L.accounts = []; L.summaries = {}; L.cov = {}; L.srcs = {}; L.ct = null; L.brokerSyms = {}; L.ctForm = null; L.ctFormAccts = {}; ctSeq++;
  }
  PAGE.onLeave(cleanup);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
