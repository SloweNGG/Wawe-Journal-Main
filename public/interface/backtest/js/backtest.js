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
  var CENTER_BARS = 100, RIGHT_OFFSET = 6;          // "center the chart": about 100 candles, the cursor candle on the right
  var FREE_LIMIT = 1, PRO_LIMIT = 10;
  var EXTRA_COLUMNS = true;
  // exit_rule (migration 202610290001): set to true once that migration runs on the live database. Until then the close patch leaves
  // the column out, because an unknown column fails the whole close and the trade would stay open in the database.
  var EXIT_RULE_LIVE = false;
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
  var L = { user: null, plan: 'free', feat: {}, look: null, usage: null, pu: null, puErr: false, puLoading: false, accounts: [], summaries: {}, src: null, store: null, cov: {}, journals: [], journalsLoaded: false,
    srcs: {}, ct: null, ctApi: null, ctCache: null, brokerSyms: {}, ctForm: null, ctFormAccts: {} };
  var R = null;
  var LAY = null;                               // window.WwBtLayout controller (mode, full screen, shortcut sheet)
  var DESK = null, statsFs = false;             // window.WwBtDesk controller (windows, layouts, full-screen multi-chart grid, stats widgets)
  var DRAWER = null;                            // appearance drawer (WwBtLook.mountDrawer)
  var booted = false;                           // init drew the page once (plan changes are applied from then on)
  var SKELETON_HTML = '';                       // the skeleton cards of the page, restored while the list reloads
  var DRAW = null;                              // drawing tools controller (WwBtDraw.createController)
  var STATS = null, statsTimer = 0;             // statistics tab view (WwBtStats.createView)
  var RANGE = null;                             // date and range panel of the toolbar (WwBtRange.create)
  var FSEDIT = null;                            // arranging the boxes of the full-screen chart (WwBtFsEdit.create)
  var FEATURES = ['backtestThemes', 'backtestStats', 'backtestMultiChart', 'backtestUnlimitedTrades'];   // drawings are free for everyone (2026-10-26)
  var bootTimer = 0, tries = 0, themeObserver = null, resizeTimer = 0, chipTimer = 0, cleaned = false;
  var failedJobs = [], editing = null, modalOpener = null;
  var planSeq = 0, planTimer = 0;                // "Plan and usage" tab: the newest answer wins, refreshes are debounced

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
      window.WwBtStore && window.WwBtGate && window.WwTime && window.WwChart && window.WwBtLayout && window.WwBtDesk && window.WwBtLook && window.WwBtDraw && window.WwBtStats && window.WwBtPlan && window.WwBtRange && window.WwBtFsEdit &&
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
    SKELETON_HTML = $('bt-accounts').innerHTML;
    setPageState('list');                                     // skeleton cards while the account list loads
    var planReady = loadPlan();
    // Pro bought while the page is open (payment.js: realtime / payment check): the features unlock without a reload
    PAGE.on(window, 'ww-plan-changed', function () { loadPlan().then(function () { if (PAGE.alive) applyPlan(); }); });
    Promise.resolve().then(function () { return window.journal.ensureActiveJournal(user.id); }).catch(function () { /* navbar consistency only */ });
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
      : window.WwBtStore.createLocalStore({ userId: user.id, limit: function () { return L.plan === 'premium' ? PRO_LIMIT : FREE_LIMIT; } });
    // Journals are only needed to link cTrader-data accounts (synthetic accounts cannot be linked: database CHECK); loaded on demand (ensureJournals).
    L.look = window.WwBtLook.load(safeStorage());
    DRAW = window.WwBtDraw.createController({
      // every tool, drawings saved to the account: free for every plan (owner, 2026-10-26; migration 202610260002)
      bar: $('bt-draw-bar'), t: _t, pro: function () { return true; }, saveable: function () { return true; },
      upgrade: function () { openUpgrade('backtest_drawings'); }, toast: toast, newId: newId, confirm: function (txt) { return askConfirm(txt); },
      icons: icons, local: safeStorage(), session: safeSession(), db: drawingsDb(), userId: function () { return L.user && L.user.id; }, quote: drawQuote
    });
    STATS = window.WwBtStats.createView();
    LAY = window.WwBtLayout.mount({ page: PAGE, root: $('bt-root'), view: $('bt-view-replay'), t: _t, storage: safeStorage(), onChange: onLayoutChange });
    FSEDIT = window.WwBtFsEdit.create({ root: $('bt-root'), host: document.body, t: _t, storage: safeStorage(),
      isOn: function () { return !!LAY && LAY.isFullscreen(); },
      onChange: function (on) { $('bt-fs-edit').setAttribute('aria-pressed', on ? 'true' : 'false'); },
      onVisibility: function () { if (DESK) DESK.apply(); else FSEDIT.apply(); if (R) { renderTables(); renderOrders(true); renderStats(); } } });
    DESK = window.WwBtDesk.mount({ page: PAGE, desk: $('bt-desk'), storage: safeStorage(), userId: user.id, t: _t, mode: function () { return LAY.mode(); },
      wide: wideScreen, fullscreen: function () { return LAY.isFullscreen(); }, pro: function () { return can('backtestMultiChart'); }, present: chartPresent,
      charts: function () { return shownLayout(); }, setCharts: setChartsFromDesk, upgrade: function () { openUpgrade('backtest_multichart'); }, toast: toast,
      onChange: onDeskChange, icons: icons, placed: function (kind) { placeDrawBar(kind); if (FSEDIT) FSEDIT.apply(); },
      fsShown: function (id) { return !!FSEDIT && FSEDIT.shownWin(id); } });
    bindStaticUi(); setupThemeObserver(); setupI18n(); setupKeyboard(); setupVisibility();
    var ok = (await Promise.all([loadList(), planReady]))[0];
    if (!PAGE.alive || !ok) return;
    LAY.setMode(planMode(), true); DESK.apply(); placeCells(); placeStatsHost(); booted = true;
    var deep = new URLSearchParams(location.search).get('account');
    if (deep && findAccount(deep)) { await whenActivated(); if (PAGE.alive) openAccount(deep); } else showList();
  }
  function safeStorage() { try { return window.localStorage; } catch (e) { return null; } }
  function safeSession() { try { return window.sessionStorage; } catch (e) { return null; } }
  // Drawings: public.backtest_drawings (RLS: own rows, every plan). Smoke tests (local backend): localStorage.
  function drawingsDb() {
    if (BACKEND !== 'supabase') {
      var K = 'ww-bt-drawings-test', all = function () { try { return JSON.parse(localStorage.getItem(K) || '[]'); } catch (e) { return []; } };
      var put = function (rows) { localStorage.setItem(K, JSON.stringify(rows)); };
      return {
        load: function (acc) { return Promise.resolve({ data: all().filter(function (r) { return r.backtest_account_id === acc; }), error: null }); },
        save: function (row) { var a = all().filter(function (r) { return r.id !== row.id; }); a.push(row); put(a); return Promise.resolve({ error: null }); },
        remove: function (id) { put(all().filter(function (r) { return r.id !== id; })); return Promise.resolve({ error: null }); }
      };
    }
    return {
      load: function (acc) { return window.sb.from('backtest_drawings').select('id,tool,points,style,created_at').eq('user_id', L.user.id).eq('backtest_account_id', acc).order('created_at', { ascending: true }); },
      save: function (row) { return window.sb.from('backtest_drawings').upsert(row); },
      remove: function (id) { return window.sb.from('backtest_drawings').delete().eq('id', id).eq('user_id', L.user.id); }
    };
  }
  // labels of the long/short drawing tool: distance in pips (crypto: price points) and the money at the order panel's lot
  // (the symbol's minimum lot when the field is empty or invalid). diff: signed price move in the trade's favour.
  function drawQuote(diff, price) {
    if (!R || !R.sym) return null;
    var s = R.sym, r = E.parseScaled($('bt-lot').value, s.lotDigits, 'exact'), unit = Math.round(s.lot.step * Math.pow(10, s.lotDigits));
    var lot = r.ok && r.value > 0 && r.value % unit === 0 ? r.value / Math.pow(10, s.lotDigits) : s.lot.min;
    var crypto = S.spreadUnit(s.id) === 'price', ad = Math.abs(diff);
    var dist = crypto ? _t('backtest.draw.points', '{n} puan', { n: ad.toFixed(s.digits) }) : _t('backtest.draw.pips', '{n} pip', { n: (ad / s.pipSize).toFixed(1) });
    var usd = diff / s.pipSize * S.pipValueUsd(s.id, lot, price > 0 ? price : 1);
    return { dist: dist, money: (usd >= 0 ? '+' : '-') + Math.abs(usd).toFixed(2) + ' $', lot: _t('backtest.draw.lot', '{n} lot', { n: lot.toFixed(s.lotDigits) }) };
  }
  // plan and the backtest features through user.js (isPro / hasFeature); any failure counts as the free plan
  function loadPlan() {
    return Promise.all([Promise.resolve().then(function () { return window.isPro(); })].concat(FEATURES.map(function (f) {
      return Promise.resolve().then(function () { return window.hasFeature(f); });
    }))).then(function (r) {
      L.plan = r[0] === true ? 'premium' : 'free';
      L.feat = {}; FEATURES.forEach(function (f, i) { L.feat[f] = r[i + 1] === true; });
    }, function () { L.plan = 'free'; L.feat = {}; });
  }
  // the plan changed on an open page: every plan-dependent control is drawn again (before the first load, init draws them)
  function applyPlan() {
    if (!booted) return;
    LAY.setMode(planMode());                                  // the view follows the plan (Premium: advanced, free: simple)
    DESK.apply(); placeCells(); placeStatsHost(); renderPlan();
    if (R) {
      applyLook(); applyChartLayout(); renderStats(); renderLimit(); updateControls();
      if (R.acc.dataSource === 'ctrader') loadUsage().then(function () { if (R) { renderLimit(); updateControls(); } });
    } else renderList();
    renderLayoutPicker();
    if (DRAWER && !$('bt-look-drawer').hidden) DRAWER.render();
  }
  function isPro() { return L.plan === 'premium'; }
  // The view follows the plan (owner, 2026-10-27): Premium always gets the advanced view, the free plan the simple one; there is no
  // switch. The drawing tools work in both (they are free for every plan).
  function planMode() { return isPro() ? 'advanced' : 'simple'; }
  function can(f) { return L.feat[f] === true; }
  // free user on a Premium control: the upgrade window (the control shows a small PRO tag)
  function openUpgrade(feature) { if (typeof window.openUpgradeModal === 'function') window.openUpgradeModal({ feature: feature || 'backtest_pro' }); }
  // Monthly trade limit of cTrader-data accounts on the free plan (migration 202610240002, enforced by the database trigger;
  // the page shows it and disables the order buttons). Synthetic-data accounts are never limited. null usage = no limit shown.
  function loadUsage() {
    if (BACKEND !== 'supabase' || !window.sb.rpc) { L.usage = null; return Promise.resolve(null); }
    return Promise.resolve(window.sb.rpc('get_backtest_trade_usage')).then(function (r) {
      L.usage = r && !r.error && r.data && isFinite(r.data.used) && isFinite(r.data.limit) ? r.data : null;
      return L.usage;
    }, function () { L.usage = null; return null; });
  }
  function limitApplies() { return !!(R && R.acc.dataSource === 'ctrader' && L.usage && !L.usage.premium && !can('backtestUnlimitedTrades')); }
  function atLimit() { return limitApplies() && L.usage.used >= L.usage.limit; }
  function renderLimit() {
    var box = $('bt-limit'); if (!box) return;
    var on = limitApplies(); box.hidden = !on;
    if (!on) return;
    var u = L.usage, full = u.used >= u.limit;
    setText('bt-limit-text', _t('backtest.limit.usage', 'Bu ay {used} / {limit} işlem', { used: Math.min(u.used, u.limit), limit: u.limit }));
    $('bt-limit-fill').style.width = Math.min(100, u.limit ? u.used / u.limit * 100 : 100) + '%';
    box.classList.toggle('bt-limit-full', full);
    show($('bt-limit-full'), full);
  }
  // "Plan and usage" tab of the account window and the header badge (bt-plan.js). get_backtest_plan_usage (migration 202610260001)
  // returns the plan, the active accounts and this month's cTrader-data trades with their limits; read when the tab opens, after a
  // trade is opened and whenever the account list is reloaded. No numbers without the database: a failed call shows an error.
  function loadPlanUsage() {
    var seq = ++planSeq;
    if (BACKEND !== 'supabase' || !window.sb || typeof window.sb.rpc !== 'function') { L.puErr = true; renderPlan(); return Promise.resolve(null); }
    L.puLoading = true; if (planTabOpen()) renderPlanPanel();
    return Promise.resolve(window.sb.rpc('get_backtest_plan_usage')).then(function (r) { return r && !r.error ? window.WwBtPlan.normalize(r.data) : null; }, function () { return null; })
      .then(function (d) {
        if (seq !== planSeq || !PAGE.alive) return d;
        L.puLoading = false; L.puErr = !d;
        if (d) {
          L.pu = d;
          // the order panel's limit indicator follows the same database numbers
          if (L.usage && !L.usage.premium) { L.usage.used = d.trades.used; L.usage.limit = d.trades.limit; renderLimit(); updateControls(); }
        }
        renderPlan();
        return d;
      });
  }
  function refreshPlanSoon() { clearTimeout(planTimer); planTimer = later(loadPlanUsage, 400); }
  function planTabOpen() { return $('bt-account-modal').classList.contains('active') && !$('bt-acc-pane-plan').hidden; }
  function renderPlan() { renderPlanBadges(); if (planTabOpen()) renderPlanPanel(); }
  function renderPlanPanel() {
    window.WwBtPlan.render($('bt-plan-panel'), {
      data: L.pu, error: L.puErr, loading: L.puLoading, feat: L.feat, t: _t,
      fmtDate: function (ms) { return dtf('pday', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ms)); },
      fmtDateTime: function (ms) { return dtf('pdt', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ms)); },
      upgrade: function () { closeModal('bt-account-modal'); openUpgrade('backtest_pro'); },
      retry: loadPlanUsage
    });
    icons();
  }
  // free plan, monthly cTrader trades from 80 %: a small badge next to the title (list and replay); it opens the tab
  function renderPlanBadges() {
    var b = window.WwBtPlan.badge(L.pu);
    Array.prototype.forEach.call(document.querySelectorAll('[data-bt-plan-badge]'), function (btn) {
      btn.hidden = !b;
      if (!b) return;
      btn.setAttribute('data-level', b.level);
      btn.querySelector('.bt-plan-badge-text').textContent = _t('backtest.plan.badge', '{used}/{limit} işlem', { used: b.used, limit: b.limit });
      var lab = b.level === 'full' ? _t('backtest.plan.badge_reached', 'Bu ayın işlem sınırına ulaştın ({used} / {limit}). Plan ve kullanımı aç.', { used: b.used, limit: b.limit })
        : _t('backtest.plan.badge_near', 'Bu ayın işlem sınırına yaklaşıyorsun ({used} / {limit}). Plan ve kullanımı aç.', { used: b.used, limit: b.limit });
      btn.title = lab; btn.setAttribute('aria-label', lab);
    });
  }
  // the badge: the account window on the plan tab (replay), or the tab on its own (list view: no account to edit)
  function openPlanTab(opener) {
    if (R && $('bt-root').getAttribute('data-state') === 'replay') return openAccountModal('edit', R.acc, opener, 'plan');
    editing = null;
    $('bt-account-modal').setAttribute('data-mode', 'plan');
    $('bt-account-modal-title').textContent = _t('backtest.acc.tab_plan', 'Plan ve kullanım');
    show($('bt-account-error'), false);
    openModal('bt-account-modal', opener);
    selectAccTab('plan');
    $('bt-account-close').focus();
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
      var accounts = rows.map(E.accountFromRow), summaries = {};
      // one request per account, all at once (they used to run one after another)
      await Promise.all(accounts.map(function (a) {
        return L.store.listTrades(a.id).then(function (tr) {
          var s = { closed: 0, open: 0, realizedCents: 0 };
          tr.forEach(function (t) { if (t.exit_time) { s.closed++; s.realizedCents += E.toCents(t.pnl) || 0; } else s.open++; });
          summaries[a.id] = s;
        });
      }).concat(accounts.some(function (a) { return a.dataSource === 'ctrader'; }) ? [ensureJournals()] : []));
      L.accounts = accounts; L.summaries = summaries;
      if (!PAGE.alive) return false;
      syncOnList();
      refreshPlanSoon();                                          // account count (create, delete) and this month's trades
      return true;
    } catch (e) {
      wwLogWarn(e);
      show($('bt-list-error'), true); show($('bt-accounts'), false); $('bt-accounts').setAttribute('aria-busy', 'false');
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
  // the skeleton cards of the page (backtest.astro) again while the list reloads (retry after an error)
  function showSkeleton() {
    var box = $('bt-accounts'); box.innerHTML = SKELETON_HTML; box.setAttribute('aria-busy', 'true');
    show(box, true); show($('bt-accounts-empty'), false); show($('bt-list-error'), false);
  }
  function quotaLimit() { return L.plan === 'premium' ? PRO_LIMIT : FREE_LIMIT; }
  function renderList() {
    var box = $('bt-accounts'); box.textContent = ''; box.setAttribute('aria-busy', 'false');
    var n = L.accounts.length;
    show($('bt-accounts-empty'), n === 0); show(box, n > 0);
    show($('bt-storage-warning'), !L.store.persistent);
    setText('bt-quota', _t('backtest.quota.label', 'Hesap {n}/{max}', { n: n, max: quotaLimit() }) + ' · ' +
      (L.plan === 'premium' ? _t('backtest.quota.plan_pro', 'Pro') : _t('backtest.quota.plan_free', 'Ücretsiz')));
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
      if (a.sectionNo > 1) row(_t('backtest.section.current', 'Bölüm'), String(a.sectionNo));
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
      if (L.plan === 'premium') return toast(_t('backtest.quota.pro_reached', 'En fazla {n} aktif backtest hesabı açabilirsin.', { n: PRO_LIMIT }), 'warning');
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
    if (backResolve) finishBack('cancel');
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
    var off = $('bt-f-journal-off'); show(off, !linkable);
    if (!linkable) {
      off.textContent = source !== 'ctrader' ? (editing ? _t('backtest.acc.journal_synthetic', 'Sentetik veriyle çalışan hesap deftere bağlanamaz: işlemleri gerçek piyasa verisinden gelmez.')
        : _t('backtest.acc.journal_create', 'Deftere yalnızca cTrader verili hesaplar bağlanır. Veri sekmesinde cTrader verisini seçebilirsin.'))
        : _t('backtest.acc.journal_unavailable', 'Defter bağlantısı şu an kullanılamıyor.');
      return;
    }
    var sel = $('bt-f-journal'); sel.textContent = '';
    var none = document.createElement('option'); none.value = ''; none.textContent = _t('backtest.field.journal_none', 'Bağlantı yok'); sel.appendChild(none);
    L.journals.forEach(function (j) { var o = document.createElement('option'); o.value = j.id; o.textContent = j.name; sel.appendChild(o); });
    sel.value = selected || '';
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
    var crypto = S.spreadUnit(s.id) === 'price', lab = $('bt-f-spread-label');
    lab.setAttribute('data-i18n', crypto ? 'backtest.field.spread_crypto' : 'backtest.field.spread');
    lab.textContent = crypto ? _t('backtest.field.spread_crypto', 'Spread (USD)') : _t('backtest.field.spread', 'Spread (pip)');
    var pts = p.ok ? E.spreadPts(s, p.value) : null;
    $('bt-f-spread-hint').textContent = pts === null ? '' : crypto
      ? _t('backtest.field.spread_hint_crypto', 'AL ile SAT arası {price} USD (varsayılan {def} USD)', { price: E.ptsToStr(pts, s.digits), def: E.hundredthsToStr(Math.round(s.defaultSpreadPips * 100)) })
      : _t('backtest.field.spread_hint', '{points} puan = {price} (varsayılan {def} pip)', { points: pts, price: E.ptsToStr(pts, s.digits), def: s.defaultSpreadPips });
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

  // ---------------------------------------------------------------- account window: tabs (Genel, Veri, İşlem koşulları, Defter, Tehlikeli bölge)
  var ACC_TABS = ['general', 'data', 'trading', 'journal', 'plan', 'danger'], accSnap = null;
  function accTabs() { return ACC_TABS.filter(function (id) { return !$('bt-acc-tab-' + id).hidden; }); }
  function selectAccTab(id, focus) {
    if (accTabs().indexOf(id) < 0) id = 'general';
    ACC_TABS.forEach(function (t) {
      var on = t === id, b = $('bt-acc-tab-' + t);
      b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1;
      $('bt-acc-pane-' + t).hidden = !on;
    });
    $('bt-account-modal').setAttribute('data-tab', id);
    if (focus) try { $('bt-acc-tab-' + id).focus(); } catch (e) { /* ignore */ }
    if (id === 'plan' && $('bt-account-modal').classList.contains('active')) { renderPlanPanel(); loadPlanUsage(); }   // numbers from the database on every open
  }
  // the explanation of a small "i" (hover / focus) follows the language
  function refreshTips(box) {
    Array.prototype.forEach.call(box.querySelectorAll('[data-tip-key]'), function (b) {
      var txt = _t(b.getAttribute('data-tip-key'), b.getAttribute('data-tip')); b.setAttribute('data-tip', txt); b.setAttribute('aria-label', txt);
    });
  }
  // a small lock next to a value that cannot be changed; its reason opens on hover / focus
  function roLock(tip) {
    var b = el('span', 'bt-ro-lock'); b.tabIndex = 0; b.setAttribute('role', 'img'); b.setAttribute('data-tip', tip); b.setAttribute('aria-label', tip);
    var i = el('i'); i.setAttribute('data-lucide', 'lock'); i.setAttribute('aria-hidden', 'true'); b.appendChild(i);
    return b;
  }
  function setLock(id, on, tip) { var h = $(id); h.textContent = ''; h.hidden = !on; if (on) h.appendChild(roLock(tip)); }
  // edit: symbol, source, start, section and timeframe as facts (they cannot be changed here)
  function fillAccInfo(acc) {
    var dl = $('bt-f-info'); dl.textContent = '';
    var locked = _t('backtest.acc.locked', 'Hesap oluşturulduktan sonra değiştirilemez.');
    function row(label, value, lock, extra) {
      var r = el('div', 'bt-acc-info-row'), dt = el('dt', '', label), dd = el('dd');
      dd.appendChild(el('span', 'bt-acc-info-val', value));
      if (lock) dd.appendChild(roLock(lock));
      if (extra) dd.appendChild(extra);
      r.appendChild(dt); r.appendChild(dd); dl.appendChild(r);
    }
    var sym = S.get(acc.symbol);
    row(_t('backtest.field.symbol', 'Sembol'), sym ? sym.name : acc.symbol, locked);
    row(_t('backtest.field.source', 'Veri kaynağı'), acc.dataSource === 'ctrader' && acc.source
      ? _t('backtest.acc.source_ct', 'cTrader · {broker} · {symbol} · hesap {account}', { broker: acc.source.brokerName || 'broker', symbol: acc.source.symbolName, account: acc.source.ctid })
      : _t('backtest.source.option_synthetic', 'Sentetik veri (pratik)'), locked);
    var first = acc.sections && acc.sections.length ? acc.sections[0].start : acc.replaySec;
    row(_t('backtest.acc.start', 'Başlangıç tarihi'), first ? fmtDateTime(first) : '—', _t('backtest.acc.start_tip', 'Hesap açılırken seçilir. Replay zamanı için araç çubuğundaki «Tarihe git».'));
    var total = acc.sections ? acc.sections.length : 1;
    row(_t('backtest.acc.section', 'Mevcut bölüm'), _t('backtest.acc.section_value', 'Bölüm {n} / {total}', { n: acc.sectionNo || 1, total: total }), _t('backtest.acc.section_tip', 'Geçmişe her dönüş yeni bir bölüm açar.'));
    var tfb = el('button', 'bt-link-btn bt-acc-tf-link', _t('backtest.acc.tf_toolbar', 'Araç çubuğundan değiştir')); tfb.type = 'button'; tfb.setAttribute('data-act', 'tf-toolbar');
    row(_t('backtest.field.timeframe', 'Zaman dilimi'), C.TF_LABEL[acc.tf] || acc.tf, null, tfb);
  }
  function accValues() { return [$('bt-f-name').value.trim(), $('bt-f-balance').value.trim(), $('bt-f-spread').value.trim(), $('bt-f-commission').value.trim(), $('bt-f-journal').value || ''].join('|'); }
  // edit: Save stays off until something changed
  function accDirty() { if (!editing) return; $('bt-account-submit').disabled = accValues() === accSnap; }

  // tab: the tab to open on ('plan' from the header badge); default 'general'
  async function openAccountModal(mode, acc, opener, tab) {
    fillSymbolSelect();
    editing = mode === 'edit' ? acc : null;
    var edit = mode === 'edit', modal = $('bt-account-modal');
    modal.setAttribute('data-mode', edit ? 'edit' : 'create');
    $('bt-account-modal-title').textContent = edit ? _t('backtest.modal.edit_title', 'Hesap ayarları') : _t('backtest.modal.create_title', 'Yeni backtest hesabı');
    $('bt-account-submit-label').textContent = edit ? _t('common.save', 'Kaydet') : _t('backtest.modal.create', 'Hesabı oluştur');
    $('bt-account-submit').disabled = false;
    show($('bt-account-error'), false);
    $('bt-acc-tab-danger').hidden = !edit;
    show(modal.querySelector('.bt-acc-create'), !edit); show($('bt-f-info'), edit);
    selectAccTab('general');
    var trades = edit ? await L.store.listTrades(acc.id) : [];
    if (!PAGE.alive) return;
    var hasTrades = trades.length > 0, hasOpen = trades.some(function (t) { return !t.exit_time; });
    $('bt-account-reset').disabled = !(edit && hasTrades);
    $('bt-account-reset-desc').textContent = edit && !hasTrades ? _t('backtest.acc.reset_none', 'Sıfırlanacak işlem yok.') : _t('backtest.acc.reset_desc', 'Tüm işlemler silinir, bakiye başlangıca döner; ayarlar ve bölüm kalır.');
    if (edit) {
      $('bt-f-name').value = acc.name; $('bt-f-symbol').value = acc.symbol; $('bt-f-tf').value = acc.tf;
      $('bt-f-balance').value = E.centsToStr(acc.startCents); $('bt-f-spread').value = E.hundredthsToStr(acc.spreadH);
      $('bt-f-commission').value = E.centsToStr(acc.cplCents);
      fillAccInfo(acc);
    } else {
      $('bt-f-name').value = ''; $('bt-f-tf').value = '1h'; $('bt-f-balance').value = '10000.00'; $('bt-f-commission').value = '0.00';
      $('bt-f-symbol').selectedIndex = 0;
      var s0 = S.get($('bt-f-symbol').value); $('bt-f-spread').value = E.hundredthsToStr(Math.round(s0.defaultSpreadPips * 100));
    }
    var source = edit ? acc.dataSource : 'synthetic';
    var ctState = edit ? 'ready' : (await loadCtStatus()).state;
    if (!PAGE.alive) return;
    L.ctForm = null;
    if (!edit) fillSourceField(source, ctState);
    if (source === 'ctrader') await ensureJournals();
    fillJournalSelect(edit ? acc.journalId : '', source);
    show($('bt-f-ct-wrap'), false);
    $('bt-f-symbol').disabled = edit; $('bt-f-tf').disabled = edit;
    $('bt-f-balance').disabled = edit && hasTrades;
    $('bt-f-spread').disabled = edit && hasOpen; $('bt-f-commission').disabled = edit && hasOpen;
    var openLock = _t('backtest.field.locked_open_positions', 'Açık pozisyon varken değiştirilemez.');
    setLock('bt-f-balance-lock', edit && hasTrades, _t('backtest.field.balance_locked', 'İşlem varken başlangıç bakiyesi değiştirilemez.'));
    setLock('bt-f-spread-lock', edit && hasOpen, openLock); setLock('bt-f-commission-lock', edit && hasOpen, openLock);
    refreshTips(modal);
    openModal('bt-account-modal', opener);
    icons();
    spreadHint();
    if (!edit) {
      await startHint();
      var cov = formCov();
      if (cov && PAGE.alive) $('bt-f-start').value = toLocalInput(defaultStart(cov));
    }
    accSnap = edit ? accValues() : null; accDirty();
    if (tab === 'plan') selectAccTab('plan', true); else $('bt-f-name').focus();
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
      ctDepth(_t('backtest.ctrader.depth', 'Bu hesapta bu sembolün verisi: {from} – {to}', { from: fmtDay(cov.firstT), to: fmtDay(cov.lastT) }), 'data');
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
  function fillSourceField(source, ctState) {
    $('bt-f-source-synthetic').checked = source !== 'ctrader';
    $('bt-f-source-ctrader').checked = source === 'ctrader';
    $('bt-f-source-synthetic').disabled = false;
    $('bt-f-source-ctrader').disabled = ctState !== 'ready';
    var needLink = ctState !== 'ready';
    show($('bt-f-source-connect'), needLink);
    if (needLink) $('bt-f-source-connect-link').textContent = ctState === 'reconnect'
      ? _t('backtest.ctrader.reconnect', 'cTrader bağlantısını yenile') : _t('backtest.ctrader.connect', 'cTrader hesabını bağla');
  }
  function selectedSource() { return $('bt-f-source-ctrader').checked ? 'ctrader' : 'synthetic'; }
  // a form error is shown under the panes and the tab with the field opens
  function formError(msg, tab) { var e = $('bt-account-error'); e.textContent = msg; e.hidden = false; if (tab) selectAccTab(tab); }
  function mapStoreError(e) {
    var m = String((e && e.message) || '');
    if (m.indexOf('BACKTEST_LIMIT_EXCEEDED') >= 0) return L.plan === 'premium'
      ? _t('backtest.quota.pro_reached', 'En fazla {n} aktif backtest hesabı açabilirsin.', { n: PRO_LIMIT }) : _t('backtest.quota.free_reached', 'Ücretsiz planda 1 backtest hesabı açabilirsin.');
    if (m.indexOf('CTRADER_ACCOUNT_NOT_LINKED') >= 0) return _t('backtest.err.ctrader_not_linked', 'Bu cTrader hesabı bağlı değil. Önce hesabını bağla.');
    if (m.indexOf('INVALID_JOURNAL') >= 0) return _t('backtest.err.invalid_journal', 'Seçilen hesap geçersiz.');
    if (m.indexOf('BACKTEST_OPEN_POSITIONS:replay_time') >= 0) return _t('backtest.err.goto_open_positions', 'Açık pozisyon varken başka bir tarihe gidilemez. Önce açık pozisyonlarını kapat.');
    if (m.indexOf('BACKTEST_OPEN_POSITIONS') >= 0) return _t('backtest.err.open_positions_settings', 'Açık pozisyon varken spread ve komisyon değiştirilemez.');
    if (m.indexOf('BACKTEST_REPLAY_BACKWARD') >= 0) return _t('backtest.err.goto_backward', 'Geri dönüş kaydedilemedi. Sayfayı yenileyip tekrar dene.');
    if (e && e.code === '23514') return _t('backtest.err.invalid_value', 'Geçersiz değer.');
    return _t('backtest.err.generic', 'Bir hata oluştu. Lütfen tekrar dene.');
  }

  async function submitAccountForm() {
    var btn = $('bt-account-submit'); if (btn.disabled) return;
    var edit = !!editing, sym = S.get($('bt-f-symbol').value);
    var name = $('bt-f-name').value.trim();
    if (!(Array.from(name).length >= 1 && Array.from(name).length <= 60)) return formError(_t('backtest.err.name', 'Hesap adı 1-60 karakter olmalı.'), 'general');
    var bal = E.parseScaled($('bt-f-balance').value, 2, 'exact');
    if (!bal.ok || !(bal.value > 0 && bal.value <= 10000000000)) return formError(_t('backtest.err.balance', 'Başlangıç bakiyesi 0 ile 100.000.000 arasında olmalı (en fazla 2 ondalık).'), 'trading');
    var sp = E.parseScaled($('bt-f-spread').value, 2, 'exact');
    if (!sp.ok || sp.value < 0 || sp.value > 1000000) return formError(S.spreadUnit(sym.id) === 'price'
      ? _t('backtest.err.spread_crypto', 'Spread 0 ile 10000 USD arasında olmalı (en fazla 2 ondalık).') : _t('backtest.err.spread', 'Spread 0 ile 10000 pip arasında olmalı (en fazla 2 ondalık).'), 'trading');
    var cm = E.parseScaled($('bt-f-commission').value, 2, 'exact');
    if (!cm.ok || cm.value < 0 || cm.value > 1000000) return formError(_t('backtest.err.commission', 'Komisyon 0 ile 10000 USD arasında olmalı (en fazla 2 ondalık).'), 'trading');
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
        if (!ctSel.acc) return formError(_t('backtest.ctrader.pick_account', 'Bir cTrader hesabı seç.'), 'data');
        if (!ctSel.ok || !(L.ctForm && L.ctForm.cov)) return formError(_t('backtest.ctrader.pick_symbol', 'Bir broker sembolü seç ve veri derinliğinin ölçülmesini bekle.'), 'data');
        cov = L.ctForm.cov;
        var info;
        try { info = await L.ctApi.symbolInfo(ctSel.ctid, ctSel.symbolId); } catch (e0) { return formError(ctErrorText(e0), 'data'); }
        ctSource = { ctid: ctSel.ctid, brokerName: ctSel.acc.broker_name || '', isLive: !!ctSel.acc.is_live, symbolId: ctSel.symbolId, symbolName: ctSel.symbolName, digits: isFinite(info.digits) ? info.digits : null };
      } else cov = L.cov[sym.id] || await L.src.coverage(sym.id);
      var startSec = fromLocalInput($('bt-f-start').value);
      if (startSec === null) return formError(_t('backtest.err.start_required', 'Başlangıç tarihi seç.'), 'data');
      if (startSec < cov.firstT || startSec > cov.lastT) return formError(_t('backtest.err.start_range', 'Başlangıç {from} ile {to} arasında olmalı.', { from: fmtDay(cov.firstT), to: fmtDay(cov.lastT) }));
      var no = S.nextOpen(startSec * 1000, sym.id);
      if (no === null || no / 1000 > cov.lastT) return formError(_t('backtest.err.no_data_after', 'Bu tarihten sonra veri yok.'), 'data');
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
      dropOrders(acc.id);
      closeModal('bt-delete-modal'); closeModal('bt-account-modal');
      if (R && R.acc.id === acc.id) { closeReplayState(); }
      await loadList(); showList();
      toast(_t('backtest.toast.deleted', 'Hesap silindi'), 'success');
    } catch (e) { toast(mapStoreError(e), 'error'); }
  }

  async function confirmReset() {
    var acc = editing; if (!acc) return;
    try {
      await resetTrades(acc);                                               // the journal copies of the deleted trades go too
      closeModal('bt-reset-modal'); closeModal('bt-account-modal');
      // one section again: any account update without trades resets the sections (database trigger)
      var here = R && R.acc.id === acc.id && R.win ? R.win.t[R.k] + 60 : acc.replaySec;
      var fresh = await L.store.updateAccount(acc.id, E.accountPatch({ replaySec: here }));
      if (R && R.acc.id === acc.id) { R.lastSavedReplaySec = here; applyAccountChange(E.accountFromRow(fresh)); renderTables(); }
      await loadList();
      if (!R) renderList();
      toast(_t('backtest.reset.done', 'Hesap sıfırlandı'), 'success');
    } catch (e) { toast(mapStoreError(e), 'error'); }
  }
  function applyAccountChange(a) {
    R.acc = a; R.eng.sp = E.spreadPts(R.sym, a.spreadH); R.eng.cplCents = a.cplCents; R.eng.startCents = a.startCents;
    setText('bt-acc-name', a.name); renderSectionChip();
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
      eng.orders = loadOrders(acc.id);                                   // pending orders of this browser
      eng.allowFill = function () { return atLimit() ? 'TRADE_LIMIT' : null; };
      var spd = SPEED_DEFAULT;
      try { var sv = parseFloat(localStorage.getItem(SPEED_KEY)); if (SPEEDS.indexOf(sv) >= 0) spd = sv; } catch (e) { /* ignore */ }
      R = { acc: acc, sym: sym, scale: Math.pow(10, sym.digits), tfId: acc.tf, tfMin: C.TF_MIN[acc.tf] || 60, speed: spd,
        cov: null, win: null, winMonths: [], k: 0, candles: [], builder: null, eng: eng, token: 0, playing: false, rafId: 0, lastTs: null,
        accum: 0, buffering: false, busy: false, loadingNext: null, nextState: null, dirtyFrom: -1, closedQueue: [], gap: null,
        chart: null, series: null, askLine: null, lines: {}, dirty: false, lastSavedReplaySec: acc.replaySec, lastSaveAt: 0, lastLiveAt: 0,
        src: srcFor(acc), abort: new AbortController(), el: $('bt-chart'), extra: [], hist: null, histMonths: 0,
        fillQueue: [], inserting: {}, dropped: {}, endSec: loadRangeEnd(acc.id) };
      setPageState('replay');
      $('bt-view-replay').setAttribute('data-replay', 'loading');
      setText('bt-acc-name', acc.name); setText('bt-acc-symbol', sym.name); setSourceLabel(acc);
      $('bt-tf').value = acc.tf; $('bt-speed').value = String(spd);
      try { var u = new URL(location.href); u.searchParams.set('account', id); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (e) { /* ignore */ }
      overlay(_t('backtest.chart.loading', 'Mum verisi yükleniyor…'));
      DRAW.setAccount(acc.id);
      buildChart(R);
      R.cov = await R.src.coverage(sym.id);
      if (!PAGE.alive || !R) return;
      var replaySec = acc.replaySec || R.cov.firstT + 60;
      // never before the trades of the CURRENT section (earlier sections may lie later in market time)
      eng.open.forEach(function (p) { replaySec = Math.max(replaySec, p.entryT); });
      eng.closed.forEach(function (t) { if (t.section === acc.sectionNo) replaySec = Math.max(replaySec, t.reason === 'manual' ? t.exitT : t.exitT + 60); });
      eng.orders.forEach(function (o) { if (o.section === acc.sectionNo) replaySec = Math.max(replaySec, o.placedT); });
      renderSectionChip();
      L.usage = null; renderLimit();
      if (acc.dataSource === 'ctrader') loadUsage().then(function () { if (R && R.acc.id === acc.id) { renderLimit(); updateControls(); } });
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
    if (LAY) LAY.setFullscreen(false);
    openStatsFs(false);
    if ($('bt-look-drawer')) $('bt-look-drawer').hidden = true;
    if (DRAW) DRAW.setAccount(null);
    if (STATS) STATS.destroy();
    pause(); saveReplayTime(true);
    R.abort.abort(); R.token++;
    destroyCharts();
    (R.extra || []).forEach(function (v) { if (v.cell) v.cell.remove(); }); R.extra = [];
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
    resetLoads(); R.hist = null; R.histMonths = 0;
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
    (R.extra || []).forEach(viewCandles);
    views().forEach(clearPriceLines);                        // nothing of the previous date / section stays on the chart
    renderChartData(); rebuildMarkers(); syncPriceLines(); updateAskLine(); renderLive(true); renderTables(); renderOrders(true); renderStats();
    hideOverlay(); setReplay('ready');
    applyChartLayout();
    centerAll();
    var gi = $('bt-goto-input');
    gi.min = toLocalInput(cov.firstT); gi.max = toLocalInput(cov.lastT); gi.value = toLocalInput(R.win.t[R.k] + 60);
    if (RANGE) RANGE.refresh();
    loadHistory(tok); maybePrefetch();
  }
  function dataFailed(e) {
    if (!R) return;
    pause(); hideOverlay(); setReplay('error');
    showDataBanner({ kind: 'error', err: e });
  }

  // the months before the window, as many as the longest timeframe on screen needs; kept as minutes (R.hist) so every chart
  // view can aggregate them in its own timeframe
  async function loadHistory(tok) {
    var first = R.winMonths[0], need = historyNeed(), keys = [];
    for (var i = 1; i <= need; i++) { var k2 = C.addMonths(first, -i); if (R.cov.months.indexOf(k2) >= 0) keys.unshift(k2); }
    if (!keys.length) { R.hist = null; R.histMonths = need; return; }
    var hist = null;
    for (var j = 0; j < keys.length; j++) {
      var mm;
      try { mm = await monthMinutes(keys[j], tok); } catch (e) { return; }
      if (stale(tok) || !mm) return;
      overlay(_t('backtest.chart.loading_n', 'Geçmiş yükleniyor {done}/{total}', { done: j + 1, total: keys.length }), true);
      hist = C.concatMinutes(hist, mm);
    }
    hideOverlay();
    R.hist = hist; R.histMonths = need;
    var id = R.sym.id;
    views().forEach(function (v) {
      var wStart = C.bucketStart(R.win.t[0], v.tfMin, id), before = v.candles.length, range = v.chart ? v.chart.timeScale().getVisibleLogicalRange() : null;
      v.candles = C.merge(C.aggregate(hist, v.tfMin, id), v.candles.filter(function (c) { return c.time >= wStart; }));
      var added = v.candles.length - before;
      v.builder = C.createBuilder(v.tfMin, id, v.candles);
      if (v === R) R.builder = v.builder;
      renderChartData(v);
      if (range && v.chart) v.chart.timeScale().setVisibleLogicalRange({ from: range.from + added, to: range.to + added });
    });
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
    if (R.eng.events.length) Array.prototype.push.apply(R.fillQueue, E.takeEvents(R.eng));
    var idx = R.builder.push(BAR[0], BAR[1], BAR[2], BAR[3], BAR[4]);
    if (R.dirtyFrom < 0 || idx < R.dirtyFrom) R.dirtyFrom = idx;
    for (var x = 0, ex = R.extra; x < ex.length; x++) {
      var vi = ex[x].builder.push(BAR[0], BAR[1], BAR[2], BAR[3], BAR[4]);
      if (ex[x].dirtyFrom < 0 || vi < ex[x].dirtyFrom) ex[x].dirtyFrom = vi;
    }
    if (closed.length) Array.prototype.push.apply(R.closedQueue, closed);
    if (k > 0 && BAR[0] - W.t[k - 1] > 60) R.gap = C.gapKind(W.t[k - 1], BAR[0], R.sym.id);
    R.dirty = true;
  }
  function play() {
    if (!R || R.playing || R.busy || anyModalOpen()) return;
    // the end of the range is behind the replay time (stepped or went past it): it no longer applies
    if (R.endSec && R.win.t[R.k] + 60 >= R.endSec) {
      setRangeEnd(null);
      toast(_t('backtest.range.end_cleared', 'Bitiş zamanı geçildiği için kaldırıldı.'), 'info');
    }
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
    if (R.playing) { R.playing = false; setPlayUi(false); setReplay('ready'); saveReplayTime(true); renderStats(); }
  }
  function tick(ts) {
    if (R) R.rafId = 0;
    if (!PAGE.alive || !R || !R.playing) return;
    var dt = R.lastTs === null ? 16 : ts - R.lastTs; R.lastTs = ts;
    var plan = C.framePlan(R.accum, dt, R.speed, R.tfMin, MAX_BARS_PER_FRAME), atEnd = false;
    R.accum = plan.acc;
    for (var i = 0; i < plan.n; i++) {
      if (R.endSec && R.win.t[R.k] + 60 >= R.endSec) { atEnd = true; break; }
      if (R.k + 1 >= R.win.n) { needMore(); break; }
      advance1();
    }
    afterFrame();
    if (atEnd) {
      pause();
      toast(_t('backtest.range.end_reached', 'Aralığın sonuna gelindi: {date}.', { date: RANGE ? RANGE.fmt(toLocalInput(R.endSec), true) : toLocalInput(R.endSec) }), 'info');
      return;
    }
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
    if (R.fillQueue.length) handleOrderEvents(R.fillQueue.splice(0));        // fills first: their rows are inserted before a close updates them
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
  // Go to a date. Never with an open position (close it first). Back in time on an account with trades: a confirmation, then a new
  // section (the database numbers it); the trades stay and the balance continues in the order they were opened.
  async function goTo(sec) {
    if (!R) return;
    if (sec === null) return toast(_t('backtest.err.start_required', 'Tarih seç.'), 'warning');
    if (R.eng.open.length) return toast(_t('backtest.err.goto_open_positions', 'Açık pozisyon varken başka bir tarihe gidilemez. Önce açık pozisyonlarını kapat.'), 'warning');
    if (sec > R.cov.lastT) return toast(_t('backtest.err.no_data_after', 'Bu tarihten sonra veri yok.'), 'warning');
    var nowSec = R.win.t[R.k] + 60, target = Math.max(sec, R.cov.firstT);
    if (!(R.eng.closed.length && target < nowSec)) {
      cancelAllOrders('goto');
      await placeCursor(target, 'goto');
      if (R) saveReplayTime(true);
      return;
    }
    var choice = await askBack(R.acc.sectionNo + 1);
    if (!R || choice === 'cancel') return;
    var acc = R.acc;
    if (choice === 'reset') {
      try { await resetTrades(acc); } catch (e) { return toast(mapStoreError(e), 'error'); }
      if (!R || R.acc.id !== acc.id) return;
    }
    pause();
    cancelAllOrders('goto');
    await placeCursor(target, 'goto');
    if (!R || R.acc.id !== acc.id) return;
    var newSec = R.win.t[R.k] + 60;
    try {
      var row = await L.store.updateAccount(acc.id, E.accountPatch({ replaySec: newSec }));
      if (!R || R.acc.id !== acc.id) return;
      R.lastSavedReplaySec = newSec; R.dirty = false;
      applyAccountChange(E.accountFromRow(row));
      rebuildMarkers(); renderTables();
      if (choice === 'continue') toast(_t('backtest.back.started', 'Bölüm {n} başladı.', { n: R.acc.sectionNo }), 'success');
    } catch (e) {
      // not stored (an open position elsewhere, an old database rule): back to where the account is
      toast(mapStoreError(e), 'error');
      if (R && R.acc.id === acc.id) await placeCursor(nowSec, 'resume');
    }
  }
  // the three-way confirmation of going back: resolves 'continue' | 'reset' | 'cancel'
  var backResolve = null;
  function askBack(nextSection) {
    return new Promise(function (resolve) {
      if (backResolve) backResolve('cancel');
      backResolve = resolve;
      $('bt-back-note').textContent = _t('backtest.back.note', 'İşlemlerin silinmez; Bölüm {n} başlar. Bakiye, işlemleri açtığın sırayla devam eder.', { n: nextSection });
      openModal('bt-back-modal');
    });
  }
  function finishBack(v) {
    $('bt-back-modal').classList.remove('active');
    var r = backResolve; backResolve = null; if (r) r(v);
  }
  // delete every trade of the account (and their journal copies), then one section again (the database resets it on the next update)
  async function resetTrades(acc) {
    await L.store.deleteTrades(acc.id);
    if (SYNC && acc.journalId) syncResult(await SYNC.reconcileAccount(syncAcc(acc), { closedTrades: [] }));
    if (R && R.acc.id === acc.id) cancelAllOrders('reset');
    else dropOrders(acc.id);
    if (R && R.acc.id === acc.id) {
      R.eng.open = []; R.eng.closed = []; R.eng.realizedCents = 0;
      syncPriceLines(); rebuildMarkers(); renderTables(); renderStats(); renderLive(true);
    }
  }
  function setTimeframe(tfId) {
    if (!R || !C.TF_MIN[tfId] || tfId === R.tfId) return;
    pause(); R.tfId = tfId; R.tfMin = C.TF_MIN[tfId]; var tok = ++R.token;
    resetLoads(); hideOverlay();
    R.candles = C.aggregate(R.win, R.tfMin, R.sym.id, 0, R.k);
    R.builder = C.createBuilder(R.tfMin, R.sym.id, R.candles);
    R.tickSeen = null; R.tickHide = null;
    clearPriceLines(R);
    renderChartData(R); rebuildMarkers(); syncPriceLines(); updateAskLine();
    centerView(R);
    loadHistory(tok); maybePrefetch();
    L.store.updateAccount(R.acc.id, { timeframe: tfId }).catch(function (e) { toast(mapStoreError(e), 'error'); });
    R.acc.tf = tfId;
    if (shownLayout() !== '1') mainHead(true);
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
      if (!/BACKTEST_REPLAY_BACKWARD|BACKTEST_OPEN_POSITIONS/.test(String(e && e.message))) wwLogWarn(e);
    });
  }
  function wwLogWarn(e) { try { window.wwLog.warn('[bt]', e); } catch (x) { /* ignore */ } }
  // onError(e) -> true: the error was handled (no retry, no banner)
  function persist(label, run, onFail, onError) {
    var job = { label: label, run: run, onFail: onFail, onError: onError };
    run().then(function () { show($('bt-save-banner'), failedJobs.length > 0); }, function (e) {
      if (e && e.code === '23505') return;
      if (onError && onError(e)) return;
      failedJobs.push(job);
      if (onFail) onFail();
      toast(_t('backtest.err.save_failed', 'Kaydedilemedi, tekrar denenecek.'), 'error');
      show($('bt-save-banner'), true); pause();
    });
  }
  function retrySave() {
    var jobs = failedJobs; failedJobs = []; show($('bt-save-banner'), false);
    jobs.forEach(function (j) { persist(j.label, j.run, j.onFail, j.onError); });
  }
  function ctx() { return { userId: L.user.id, accountId: R.acc.id }; }
  function persistClose(t) {
    if (R.dropped[t.id]) return;
    var patch = E.tradeClosePatch(R.eng, t, { extraColumns: EXTRA_COLUMNS, exitRule: EXIT_RULE_LIVE || BACKEND === 'local' }), id = t.id, acc = R.acc, wait = R.inserting[t.id], dropped = R.dropped;
    persist('close', function () {
      return Promise.resolve(wait).then(function () { return dropped[id] ? [] : L.store.updateTrade(id, patch, { onlyOpen: true }); }).then(function (rows) {
        if (dropped[id]) return;
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
      case 'PRICE_REQUIRED': return _t('backtest.err.price_required', 'Emir fiyatını gir.');
      case 'LIMIT_BUY': return _t('backtest.err.limit_buy', 'AL limit fiyatı AL fiyatının ({ask}) altında olmalı.', { ask: E.ptsToStr(q.ask, s.digits) });
      case 'STOP_BUY': return _t('backtest.err.stop_buy', 'AL stop fiyatı AL fiyatının ({ask}) üstünde olmalı.', { ask: E.ptsToStr(q.ask, s.digits) });
      case 'LIMIT_SELL': return _t('backtest.err.limit_sell', 'SAT limit fiyatı SAT fiyatının ({bid}) üstünde olmalı.', { bid: E.ptsToStr(q.bid, s.digits) });
      case 'STOP_SELL': return _t('backtest.err.stop_sell', 'SAT stop fiyatı SAT fiyatının ({bid}) altında olmalı.', { bid: E.ptsToStr(q.bid, s.digits) });
      case 'SL_ORDER_LONG': return _t('backtest.err.sl_order_long', 'AL emrinde SL, emir fiyatının spread kadar altında olmalı.');
      case 'TP_ORDER_LONG': return _t('backtest.err.tp_order_long', 'AL emrinde TP, emir fiyatının üstünde olmalı.');
      case 'SL_ORDER_SHORT': return _t('backtest.err.sl_order_short', 'SAT emrinde SL, emir fiyatının spread kadar üstünde olmalı.');
      case 'TP_ORDER_SHORT': return _t('backtest.err.tp_order_short', 'SAT emrinde TP, emir fiyatının altında olmalı.');
      case 'MAX_ORDERS': return _t('backtest.err.max_orders', 'En fazla {n} bekleyen emir olabilir.', { n: E.MAX_ORDERS });
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
    if (atLimit()) { orderError(_t('backtest.limit.reached', 'Bu ayın işlem sınırına ulaştın. Sınırsız işlem Premium\'da.')); openUpgrade('backtest_trades'); return; }
    if (ordType() !== 'market') return placePending(dir);
    var rd = readOrder(dir); if (!rd.ok) return orderError(rd.msg);
    var pos;
    try { pos = E.openPosition(R.eng, { id: newId(), dir: dir, steps: rd.o.steps, sl: rd.o.sl, tp: rd.o.tp, section: R.acc.sectionNo }); } catch (e) { return orderError(codeMessage(e)); }
    orderError('');
    insertPosition(pos);
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
    // ambiguous exits: SL and TP in one 1m bar (also after an order filled in it) -> SL; an order filled and closed in one bar
    if (trades.some(function (t) { return t.exitRule === 'pessimistic'; })) toast(_t('backtest.toast.ambiguous', 'TP ve SL aynı 1 dakikalık mumda: kötümser kural uygulandı, SL sayıldı.'), 'warning');
    if (trades.some(function (t) { return t.intrabar && t.exitRule === 'bar_path'; })) toast(_t('backtest.toast.intrabar', 'Emir aynı 1 dakikalık mumda doldu ve kapandı: emrin önce dolduğu mumun yoluna (açılış, dip/tepe, kapanış) göre kabul edildi.'), 'info');
  }
  function dirLabel(dir) { return dir > 0 ? _t('backtest.order.buy', 'AL') : _t('backtest.order.sell', 'SAT'); }
  function reasonLabel(r) {
    return r === 'tp' ? 'TP' : r === 'sl' ? 'SL' : _t('backtest.reason.manual', 'Manuel');
  }

  // ---------------------------------------------------------------- pending orders (limit / stop)
  // Kept in this browser per user and account ('ww_bt_orders_v1:<user>:<account>'); a fill becomes a normal trade row (database,
  // monthly limit, journal copy). Going to another date or resetting the account cancels them (they belong to the replay time).
  var ORD_KEY = 'ww_bt_orders_v1', ORDTYPE_KEY = 'ww_bt_ordtype';
  function ordersKey(accId) { return ORD_KEY + ':' + (L.user ? L.user.id : '') + ':' + accId; }
  function loadOrders(accId) {
    try { return E.sanitizeOrders(JSON.parse(localStorage.getItem(ordersKey(accId)) || '[]')); } catch (e) { return []; }
  }
  function saveOrders() {
    if (!R) return;
    try {
      if (R.eng.orders.length) localStorage.setItem(ordersKey(R.acc.id), JSON.stringify(R.eng.orders));
      else localStorage.removeItem(ordersKey(R.acc.id));
    } catch (e) { /* storage full or blocked: the orders stay for this visit */ }
  }
  function dropOrders(accId) { try { localStorage.removeItem(ordersKey(accId)); } catch (e) { /* ignore */ } }

  // ---------------------------------------------------------------- date range (end of the replay)
  // The end is a viewer convenience: kept in this browser per user and account; the replay pauses when it reaches it.
  var RANGE_KEY = 'ww_bt_range_end_v1';
  function rangeKey(accId) { return RANGE_KEY + ':' + (L.user ? L.user.id : '') + ':' + accId; }
  function loadRangeEnd(accId) {
    try { var v = parseInt(localStorage.getItem(rangeKey(accId)), 10); return v > 0 ? v : null; } catch (e) { return null; }
  }
  function setRangeEnd(sec) {
    if (!R) return;
    R.endSec = sec || null;
    try {
      if (R.endSec) localStorage.setItem(rangeKey(R.acc.id), String(R.endSec));
      else localStorage.removeItem(rangeKey(R.acc.id));
    } catch (e) { /* storage blocked: the end stays for this visit */ }
    if (RANGE) RANGE.refresh();
  }
  function setupRange() {
    RANGE = window.WwBtRange.create({
      trigger: $('bt-range-btn'),
      t: _t,
      locale: localeTag,
      toLocal: toLocalInput,
      fromLocal: fromLocalInput,
      bounds: function () { return R && R.cov ? { min: R.cov.firstT, max: R.cov.lastT } : { min: 0, max: 0 }; },
      start: function () { return fromLocalInput($('bt-goto-input').value); },
      now: function () { return R && R.win ? R.win.t[R.k] + 60 : fromLocalInput($('bt-goto-input').value); },
      end: function () { return R ? R.endSec : null; },
      apply: function (startSec, endSec, startChanged) {
        if (!R) return;
        setRangeEnd(endSec);
        if (startChanged) goTo(startSec);                     // only the end changed: the replay stays where it is
      }
    });
  }
  function findOrder(id) { var list = (R && R.eng.orders) || []; for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function ordType() { return L.ordType || 'market'; }
  // "AL LİMİT", "SAT STOP"
  function ordLabel(dir, type) {
    var k = (dir > 0 ? 'buy_' : 'sell_') + type;
    return _t('backtest.order.' + k, { buy_limit: 'AL LİMİT', buy_stop: 'AL STOP', sell_limit: 'SAT LİMİT', sell_stop: 'SAT STOP' }[k]);
  }
  function setOrdType(t) {
    if (E.ORDER_TYPES.indexOf(t) < 0) t = 'market';
    L.ordType = t;
    try { localStorage.setItem(ORDTYPE_KEY, t); } catch (e) { /* ignore */ }
    Array.prototype.forEach.call(document.querySelectorAll('#bt-ordtype [data-ordtype]'), function (b) { b.setAttribute('aria-checked', b.getAttribute('data-ordtype') === t ? 'true' : 'false'); });
    show($('bt-ord-price-wrap'), t !== 'market');
    var buy = $('bt-buy-label'), sell = $('bt-sell-label');
    if (t === 'market') {
      buy.setAttribute('data-i18n', 'backtest.order.buy'); sell.setAttribute('data-i18n', 'backtest.order.sell');
      buy.textContent = _t('backtest.order.buy', 'AL'); sell.textContent = _t('backtest.order.sell', 'SAT');
    } else {
      buy.setAttribute('data-i18n', 'backtest.order.buy_' + t); sell.setAttribute('data-i18n', 'backtest.order.sell_' + t);
      buy.textContent = ordLabel(1, t); sell.textContent = ordLabel(-1, t);
    }
    orderError(''); if (R) renderLive(false);
  }
  // the price rule under the price field, with the live quote
  function ordPriceHint() {
    var h = $('bt-ord-price-hint'); if (!h || !R) return;
    var q = E.quote(R.eng), t = ordType(), d = R.sym.digits;
    if (!q || t === 'market') { h.textContent = ''; return; }
    h.textContent = t === 'limit'
      ? _t('backtest.order.limit_hint', 'AL limit {ask} altında, SAT limit {bid} üstünde', { ask: E.ptsToStr(q.ask, d), bid: E.ptsToStr(q.bid, d) })
      : _t('backtest.order.stop_hint', 'AL stop {ask} üstünde, SAT stop {bid} altında', { ask: E.ptsToStr(q.ask, d), bid: E.ptsToStr(q.bid, d) });
  }
  function placePending(dir) {
    if (atLimit()) { orderError(_t('backtest.limit.reached', 'Bu ayın işlem sınırına ulaştın. Sınırsız işlem Premium\'da.')); openUpgrade('backtest_trades'); return; }
    var rd = readOrder(dir); if (!rd.ok) return orderError(rd.msg);
    var price = parseLevel('bt-ord-price');
    if (!price.ok) return orderError(codeMessage({ code: 'PRICE' }));
    if (price.value == null) return orderError(codeMessage({ code: 'PRICE_REQUIRED' }));
    var o;
    try { o = E.placeOrder(R.eng, { id: newId(), dir: dir, type: ordType(), price: price.value, steps: rd.o.steps, sl: rd.o.sl, tp: rd.o.tp, section: R.acc.sectionNo }); }
    catch (e) { return orderError(codeMessage(e)); }
    orderError(''); saveOrders();
    $('bt-ord-price').value = ''; $('bt-sl').value = ''; $('bt-tp').value = '';
    syncPriceLines(); renderOrders(); renderLive(true);
    toast(_t('backtest.orders.placed', '{label} {lot} @ {price} verildi', { label: ordLabel(o.dir, o.type), lot: E.stepsToStr(o.steps, R.sym.lotDigits), price: E.ptsToStr(o.price, R.sym.digits) }), 'success');
  }
  function cancelOrderId(id, quiet) {
    if (!R) return;
    var o = E.cancelOrder(R.eng, id); if (!o) return;
    saveOrders(); syncPriceLines(); renderOrders();
    if (!quiet) toast(_t('backtest.orders.cancelled', 'Bekleyen emir iptal edildi'), 'info');
  }
  // the date changes (go to, a new section, reset): pending orders of the old replay time go
  function cancelAllOrders(reason) {
    if (!R || !R.eng.orders.length) return;
    var n = R.eng.orders.length; R.eng.orders = []; saveOrders(); syncPriceLines(); renderOrders();
    toast(_t(reason === 'reset' ? 'backtest.orders.cancelled_reset' : 'backtest.orders.cancelled_goto', '{n} bekleyen emir iptal edildi (tarih değişti).', { n: n }), 'info');
  }
  // fills and refusals reported by the engine after a frame (before the closes of the same frame are stored)
  function handleOrderEvents(evs) {
    var fills = 0;
    evs.forEach(function (ev) {
      if (ev.kind === 'fill') {
        fills++;
        insertPosition(ev.position);
        toast(_t(ev.gap ? 'backtest.orders.filled_gap' : 'backtest.orders.filled', '{label} doldu: {price}', { label: ordLabel(ev.order.dir, ev.order.type), price: E.ptsToStr(ev.position.entry, R.sym.digits) }), 'success');
      } else if (ev.kind === 'reject') {
        var msg = ev.code === 'TRADE_LIMIT' ? _t('backtest.orders.rejected_limit', 'Emir tetiklendi ama bu ayın işlem sınırına ulaştın; emir iptal edildi.')
          : ev.code === 'MAX_POSITIONS' ? _t('backtest.orders.rejected_max', 'Emir tetiklendi ama en fazla {n} açık pozisyon olabilir; emir iptal edildi.', { n: E.MAX_POSITIONS })
          : _t('backtest.orders.rejected_equity', 'Emir tetiklendi ama özsermaye yetersiz; emir iptal edildi.');
        toast(msg, 'warning');
        if (ev.code === 'TRADE_LIMIT') openUpgrade('backtest_trades');
      }
    });
    saveOrders();
    syncPriceLines(); rebuildMarkers(); renderOrders(); renderTables(); renderLive(true); if (fills) renderStats();
  }
  // a new position (market order or a filled pending order) into the database; the monthly limit can refuse it there
  function insertPosition(pos) {
    var row = E.tradeInsertRow(R.eng, pos, ctx()), acc = R.acc, done;
    R.inserting[pos.id] = new Promise(function (r) { done = r; });
    persist('open', function () {
      return L.store.insertTrade(row).then(function (r) {
        if (acc.dataSource === 'ctrader' && L.usage) { L.usage.used++; renderLimit(); updateControls(); }
        refreshPlanSoon();
        done(); return r;
      });
    }, function () { done(); pos.unsaved = true; renderTables(); }, function (e) {
      done();
      // the database refused the trade over the monthly limit: take the position back (nothing was stored)
      if (String(e && e.message).indexOf('BACKTEST_TRADE_LIMIT') < 0) return false;
      var lim = parseInt(String(e.message).split(':')[1], 10);
      if (L.usage) { L.usage.limit = isFinite(lim) ? lim : L.usage.limit; L.usage.used = Math.max(L.usage.used, L.usage.limit); }
      else L.usage = { used: lim || 0, limit: lim || 0, premium: false };
      if (R && R.acc.id === acc.id) {
        R.dropped[pos.id] = true;
        R.eng.open = R.eng.open.filter(function (p) { return p.id !== pos.id; });
        R.eng.closed = R.eng.closed.filter(function (t) { if (t.id !== pos.id) return true; R.eng.realizedCents -= t.net; return false; });
        syncPriceLines(); rebuildMarkers(); renderTables(); renderLive(true); renderLimit(); updateControls(); renderStats();
      }
      if (pos.fromOrder) toast(_t('backtest.orders.rejected_limit', 'Emir tetiklendi ama bu ayın işlem sınırına ulaştın; emir iptal edildi.'), 'warning');
      orderError(_t('backtest.limit.reached', 'Bu ayın işlem sınırına ulaştın. Sınırsız işlem Premium\'da.'));
      openUpgrade('backtest_trades');
      refreshPlanSoon();
      return true;
    });
  }
  // pending orders: the tab table and the compact list (simple mode). Rows are rebuilt when the orders change; the distance cell
  // follows the quote in place.
  function ordKey(o) { return o.id + ':' + o.price + ':' + o.sl + ':' + o.tp + ':' + o.steps; }
  function ordDistance(o) {
    var q = E.quote(R.eng); if (!q) return '—';
    var d = Math.abs(o.price - (o.dir > 0 ? q.ask : q.bid)), s = R.sym;
    return S.spreadUnit(s.id) === 'price' ? E.ptsToStr(d, s.digits) + ' USD' : (d / s.pointsPerPip).toFixed(1) + ' pip';
  }
  function renderOrders(force) {
    if (!R) return;
    var list = R.eng.orders, s = R.sym, body = $('bt-orders-body'), mini = $('bt-mini-ord-list');
    var key = list.map(ordKey).join('|') + '#' + lang();
    if (force || key !== R.ordKey) {
      R.ordKey = key; body.textContent = ''; mini.textContent = '';
      list.forEach(function (o) {
        var tr = el('tr'); tr.setAttribute('data-id', o.id);
        tr.appendChild(td(dirLabel(o.dir), o.dir > 0 ? 'bt-up' : 'bt-down'));
        tr.appendChild(td(o.type === 'limit' ? _t('backtest.order.type_limit', 'Limit') : _t('backtest.order.type_stop', 'Stop')));
        tr.appendChild(td(E.stepsToStr(o.steps, s.lotDigits), 'bt-num')); tr.appendChild(td(E.ptsToStr(o.price, s.digits), 'bt-num'));
        tr.appendChild(td(o.sl == null ? '—' : E.ptsToStr(o.sl, s.digits), 'bt-num')); tr.appendChild(td(o.tp == null ? '—' : E.ptsToStr(o.tp, s.digits), 'bt-num'));
        tr.appendChild(td('—', 'bt-num bt-live-dist')); tr.appendChild(td(fmtShort(o.placedT), 'bt-num'));
        var act = el('td', 'bt-actions');
        act.appendChild(rowBtn('edit-order', o.id, _t('backtest.pos.edit', 'Düzenle'), 'edit'));
        act.appendChild(rowBtn('cancel-order', o.id, _t('backtest.orders.cancel_short', 'İptal'), 'close'));
        tr.appendChild(act); body.appendChild(tr);
        var li = el('li'); li.setAttribute('data-id', o.id);
        li.appendChild(el('span', 'bt-num ' + (o.dir > 0 ? 'bt-up' : 'bt-down'), ordLabel(o.dir, o.type) + ' ' + E.stepsToStr(o.steps, s.lotDigits)));
        li.appendChild(el('span', 'bt-mini-meta bt-num', '@ ' + E.ptsToStr(o.price, s.digits)));
        var ma = el('span', 'bt-mini-act');
        var m1 = el('button', 'btn btn-ghost', _t('backtest.orders.cancel_short', 'İptal')); m1.type = 'button'; m1.setAttribute('data-act', 'cancel-order'); m1.setAttribute('data-id', o.id);
        ma.appendChild(m1); li.appendChild(ma); mini.appendChild(li);
      });
      show($('bt-orders-empty'), list.length === 0);
      setText('bt-orders-count', String(list.length)); setText('bt-mini-ord-count', String(list.length));
      show($('bt-mini-ord'), list.length > 0);
    }
    for (var i = 0; i < body.children.length; i++) {
      var o2 = findOrder(body.children[i].getAttribute('data-id'));
      setCell(body.children[i].querySelector('.bt-live-dist'), o2 ? ordDistance(o2) : '—', 'bt-num bt-live-dist');
    }
  }
  function openEditOrder(id) {
    var o = findOrder(id); if (!o) return;
    editing = o; var s = R.sym;
    $('bt-ord-info').textContent = ordLabel(o.dir, o.type) + ' · ' + _t('backtest.col.placed', 'Verildi') + ' ' + fmtShort(o.placedT);
    $('bt-ord-f-price').value = E.ptsToStr(o.price, s.digits); $('bt-ord-f-lot').value = E.stepsToStr(o.steps, s.lotDigits);
    $('bt-ord-f-sl').value = o.sl == null ? '' : E.ptsToStr(o.sl, s.digits); $('bt-ord-f-tp').value = o.tp == null ? '' : E.ptsToStr(o.tp, s.digits);
    show($('bt-ord-error'), false);
    openModal('bt-ord-modal');
  }
  function submitEditOrder() {
    var o = editing; if (!o || !R || !findOrder(o.id)) { closeModal('bt-ord-modal'); return; }
    var s = R.sym, err = $('bt-ord-error');
    function lv(id, required) { var v = $(id).value.trim(); if (v === '') return required ? { ok: false } : { ok: true, value: null }; var r = E.parseScaled(v, s.digits, 'round'); return r.ok && r.value > 0 ? { ok: true, value: r.value } : { ok: false }; }
    var price = lv('bt-ord-f-price', true), sl = lv('bt-ord-f-sl'), tp = lv('bt-ord-f-tp');
    var lot = E.parseScaled($('bt-ord-f-lot').value, s.lotDigits, 'exact'), unit = Math.round(s.lot.step * Math.pow(10, s.lotDigits));
    if (!price.ok || !sl.ok || !tp.ok) { err.textContent = codeMessage({ code: 'PRICE' }); err.hidden = false; return; }
    if (!lot.ok || lot.value % unit !== 0) { err.textContent = _t('backtest.err.lot_format', 'Lot en fazla {step} adımlarıyla girilebilir.', { step: s.lot.step }); err.hidden = false; return; }
    try { E.modifyOrder(R.eng, o.id, { price: price.value, sl: sl.value, tp: tp.value, steps: lot.value / unit }); } catch (e) { err.textContent = codeMessage(e); err.hidden = false; return; }
    saveOrders(); closeModal('bt-ord-modal'); syncPriceLines(); renderOrders();
    toast(_t('backtest.orders.updated', 'Bekleyen emir güncellendi'), 'success');
  }
  // pending order lines are dragged on the chart (cursor tool): price, SL or TP; validated on release, reverted when not allowed
  function orderLineHit(v, y) {
    var best = null;
    (R.eng.orders || []).forEach(function (o) {
      ['price', 'sl', 'tp'].forEach(function (k) {
        if (o[k] == null) return;
        var yy = v.series.priceToCoordinate(o[k] / R.scale); if (yy === null) return;
        var d = Math.abs(yy - y); if (d <= 6 && (!best || d < best.d)) best = { id: o.id, key: k, d: d };
      });
    });
    return best;
  }
  // Bound once per chart element; the element remembers its current view (a rebuilt chart or another account reuses the element).
  // Dragging the order line moves its SL and TP along (same distance); dragging an SL or TP line moves only that level.
  function bindOrderDrag(view) {
    var host = view.el; host.__btView = view;
    if (host.__btOrderDrag) return;
    host.__btOrderDrag = true;
    var drag = null, saved = null;
    function cur() { return host.__btView; }
    function local(e) { var r = host.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function inPane(v, pt) { var ts = v.chart.timeScale(); return pt.x >= 0 && pt.x < ts.width() && pt.y >= 0 && pt.y < host.clientHeight - ts.height(); }
    function usable(v) { return R && v && v.chart && R.eng.orders.length && (!DRAW || DRAW.tool() === 'cursor'); }
    host.addEventListener('pointerdown', function (e) {
      var v = cur();
      if (e.button > 0 || !usable(v)) return;
      var pt = local(e); if (!inPane(v, pt)) return;
      var h = orderLineHit(v, pt.y); if (!h) return;
      e.preventDefault(); e.stopPropagation();
      var o = findOrder(h.id);
      drag = { v: v, id: h.id, key: h.key, orig: { price: o.price, sl: o.sl, tp: o.tp }, pid: e.pointerId, moved: false };
      // a copy: chart.options() hands out the chart's own objects, which applyOptions(false) then turns off in place
      var op = v.chart.options(); saved = JSON.parse(JSON.stringify({ handleScroll: op.handleScroll, handleScale: op.handleScale }));
      v.chart.applyOptions({ handleScroll: false, handleScale: false });
      try { host.setPointerCapture(e.pointerId); } catch (x) { /* synthetic event */ }
    }, true);
    host.addEventListener('pointermove', function (e) {
      var v = cur(); if (!R || !v || !v.chart) return;
      var pt = local(e);
      if (drag) {
        e.preventDefault(); e.stopPropagation();
        var p = drag.v.series.coordinateToPrice(pt.y), o = findOrder(drag.id);
        if (p === null || !o) return;
        var pts = Math.round(p * R.scale); if (!(pts > 0)) return;
        if (o[drag.key] === pts) return;
        if (drag.key === 'price') {
          var dl = pts - drag.orig.price;
          o.price = pts; o.sl = drag.orig.sl == null ? null : drag.orig.sl + dl; o.tp = drag.orig.tp == null ? null : drag.orig.tp + dl;
        } else o[drag.key] = pts;
        drag.moved = true; syncPriceLines();
        return;
      }
      if (usable(v) && inPane(v, pt) && orderLineHit(v, pt.y)) { host.style.cursor = 'ns-resize'; e.stopPropagation(); }
    }, true);
    function up(e) {
      if (!drag) return;
      var d = drag; drag = null; e.stopPropagation();
      try { host.releasePointerCapture(d.pid); } catch (x) { /* ignore */ }
      if (saved && d.v.chart) d.v.chart.applyOptions(saved); saved = null;
      var o = findOrder(d.id); if (!o || !d.moved) return;
      var ch = { price: o.price, sl: o.sl, tp: o.tp };
      o.price = d.orig.price; o.sl = d.orig.sl; o.tp = d.orig.tp;      // back to the stored values; the engine checks the new ones
      var val = ch[d.key];
      try {
        E.modifyOrder(R.eng, d.id, ch); saveOrders();
        toast(_t('backtest.orders.moved', '{what}: {price}', { what: d.key === 'price' ? _t('backtest.order.price', 'Emir fiyatı') : d.key.toUpperCase(), price: E.ptsToStr(val, R.sym.digits) }), 'success');
      } catch (err) { toast(codeMessage(err), 'warning'); }
      syncPriceLines(); renderOrders(true);
    }
    host.addEventListener('pointerup', up, true); host.addEventListener('pointercancel', up, true);
  }

  // ---------------------------------------------------------------- chart views
  // R itself is the main view: the account timeframe (toolbar, candle step, legend, statistics). R.extra holds the other charts
  // of a multi-chart layout (Premium), each with its own timeframe over the same replay cursor. A view has: el, tfMin, chart,
  // series, vol, sessions, layer, candles, builder, bars, ha, dirtyFrom, lines, askLine, bidLine, look, tickSeen, tickHide.
  var LAYOUTS = { '1': 1, '2h': 2, '2v': 2, '2x2': 4, '1+3': 4 }, LAYOUT_IDS = ['1', '2h', '2v', '2x2', '1+3'];
  var EXTRA_TFS = ['15m', '4h', '1d'];
  function views() { return R ? [R].concat(R.extra || []) : []; }
  function colors() { return window.WwChart.colors(); }
  // The chart clips a label whose centre is closer to the left edge than half its width ("30 Jun" showed as "0 Jun").
  // Such a tick is shown blank instead. The chart caches the formatted text per tick time, so the set of blanked ticks
  // is re-checked whenever the visible range changes and the labels are re-formatted when that set changes.
  function clipLimit(len) { return len * 3.8 + 4; }
  function tickLabelFor(v) {
    return function (time, type) {
      var text = tickText(v, time, type);
      if (!text || !R || !v.chart) return text;
      if (!v.tickSeen) { v.tickSeen = {}; v.tickHide = {}; }
      v.tickSeen[time] = text.length;
      try {
        var x = v.chart.timeScale().timeToCoordinate(time);
        if (x !== null && x > -4 && x < clipLimit(text.length)) { v.tickHide[time] = true; return ''; }
      } catch (e) { /* keep the label */ }
      return v.tickHide[time] ? '' : text;
    };
  }
  function refreshClippedTicks(v) {
    if (!R || !v.chart || !v.tickSeen) return;
    var ts = v.chart.timeScale(), seen = v.tickSeen, hide = {}, changed = false, k;
    var keys = Object.keys(seen);
    if (keys.length > 4000) { v.tickSeen = {}; v.tickHide = {}; return; }
    keys.forEach(function (t) {
      var x = ts.timeToCoordinate(+t);
      if (x !== null && x > -4 && x < clipLimit(seen[t])) hide[t] = true;
    });
    for (k in hide) if (!v.tickHide[k]) changed = true;
    for (k in v.tickHide) if (!hide[k]) changed = true;
    if (!changed) return;
    v.tickHide = hide;
    ts.applyOptions({ tickMarkFormatter: tickLabelFor(v) });
  }
  function tickText(v, time, type) {
    if (typeof time !== 'number' || !R) return null;
    var mo = MONTHS[lang()] || MONTHS.tr;
    if (v.tfMin >= 1440) {
      var key = S.tradingDayKey(time * 1000, R.sym.id), y = +key.slice(0, 4), m = +key.slice(5, 7), d = +key.slice(8, 10);
      return type === 0 ? String(y) : type === 1 ? mo[m - 1] : d + ' ' + mo[m - 1];
    }
    var p = window.WwTime.partsInTz(time * 1000, tz());
    if (type === 0) return String(p.y);
    if (type === 1) return mo[p.m - 1];
    if (type === 2 || (p.H === 0 && p.Mi === 0)) return p.d + ' ' + mo[p.m - 1];
    return fmtTime(time);
  }
  function crosshairTimeFor(v) { return function (time) { return v.tfMin >= 1440 ? fmtTradingDay(time) : fmtDateTime(time); }; }
  // the resolved appearance (free users: one of the two free themes, whatever is stored)
  function look() { return window.WwBtLook.resolve(L.look, window.WwChart.isLight(), can('backtestThemes')); }
  function buildChart(v) {
    v = v || R;
    var c = colors(), lk = look(), LK = window.WwBtLook;
    v.look = lk; v.lines = {}; v.tickSeen = null; v.tickHide = null;
    v.chart = window.LightweightCharts.createChart(v.el, window.WwChart.mergeDeep(window.WwChart.lwc({
      autoSize: true,
      rightPriceScale: { borderVisible: false, entireTextOnly: true, scaleMargins: { top: 0.08, bottom: lk.showVolume ? 0.2 : 0.08 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: v === R ? 8 : 6,
        shiftVisibleRangeOnNewBar: true, lockVisibleTimeRangeOnResize: true, tickMarkFormatter: tickLabelFor(v) },
      localization: { locale: localeTag(), timeFormatter: crosshairTimeFor(v) },
      crosshair: { mode: window.LightweightCharts.CrosshairMode.Normal },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: { time: true, price: true } }
    }), LK.chartOptions(lk, c)));
    v.series = LK.addSeries(v.chart, lk, S.priceFormat(R.sym.id));
    v.vol = null;
    if (lk.showVolume) {
      v.vol = v.chart.addHistogramSeries({ priceScaleId: 'bt-vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
      v.chart.priceScale('bt-vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 }, visible: false });
    }
    v.sessions = LK.createSessionPrimitive({ bars: function () { return v.bars || []; }, tfMin: function () { return v.tfMin; } });
    v.series.attachPrimitive(v.sessions); v.sessions.setVisible(lk.showSessions);
    if (v === R) v.chart.subscribeCrosshairMove(renderLegend);
    v.chart.subscribeCrosshairMove(function (p) { markTip(v, p); });
    v.tlines = LK.createTradeLinePrimitive({ segments: function () { return v.tlSegs || []; }, colors: function () { return { up: v.look.up, down: v.look.down }; } });
    v.series.attachPrimitive(v.tlines); v.tlines.setVisible(lk.tradeLines);
    // every chart scrolls, zooms and shows its crosshair on its own (owner, 2026-10-26: the charts are fully independent)
    v.chart.timeScale().subscribeVisibleLogicalRangeChange(function () { refreshClippedTicks(v); if (v === R) updateNowBtn(); });
    bindOrderDrag(v);
    var dg = R.sym.digits;
    v.layer = DRAW.attach({ chart: v.chart, series: v.series, el: v.el, bars: function () { return v.bars || []; }, pane: v === R ? 'main' : v.pane,   // drawings stay on their own chart
      tfSec: function () { return v.tfMin * 60; }, fmt: function (p) { return Number(p).toFixed(dg); } });
    if (!v.chart.autoSizeActive || !v.chart.autoSizeActive()) installResizeFallback();
  }
  function destroyChart(v) {
    v = v || R;
    if (!v || !v.chart) return;
    if (v.layer) { DRAW.detach(v.layer); v.layer = null; }
    try { v.chart.remove(); } catch (e) { /* ignore */ }
    v.chart = null; v.series = null; v.vol = null; v.sessions = null; v.tlines = null; v.markGroups = {}; v.lines = {}; v.askLine = null; v.bidLine = null;
    markTip(v, null);
  }
  function destroyCharts() { views().forEach(destroyChart); }
  function rebuildChart() {
    if (!R || !R.chart) return;
    views().forEach(function (v) {
      if (!v.chart) return;
      var range = v.chart.timeScale().getVisibleLogicalRange();
      destroyChart(v); buildChart(v);
      if (v.candles && v.candles.length) renderChartData(v);
      if (range) v.chart.timeScale().setVisibleLogicalRange(range);
    });
    rebuildMarkers(); syncPriceLines(); updateAskLine();
  }
  // v.bars: the candles in prices (legend, drawings, sessions); v.ha: their Heikin Ashi version when that style is on
  function renderChartData(v) {
    if (!v) { views().forEach(renderChartData); return; }
    if (!v.series) return;
    if (v.candles.length > MAX_CHART_CANDLES) { v.candles.splice(0, v.candles.length - TRIM_TO); v.builder = C.createBuilder(v.tfMin, R.sym.id, v.candles); }
    v.bars = v.candles.map(function (x) { return C.toChartBar(x, R.scale); });
    if (!v.bars.every(C.validBar)) {                       // never hand an invalid price to a series (the data layer drops them already)
      wwLogWarn(new Error('invalid candles dropped'));
      v.candles = v.candles.filter(function (x, i) { return C.validBar(v.bars[i]); });
      v.bars = v.bars.filter(C.validBar);
      v.builder = C.createBuilder(v.tfMin, R.sym.id, v.candles);
      if (v === R) R.builder = v.builder;
    }
    v.ha = v.look.style === 'heikin' ? window.WwBtLook.heikinAshi(v.bars, 0, []) : null;
    v.series.setData(window.WwBtLook.toSeriesData(v.look, v.bars, v.ha));
    if (v.vol) v.vol.setData(v.candles.map(function (x) { return volPoint(v, x); }));
    v.dirtyFrom = -1;
    if (v === R) renderLegend();
  }
  function volPoint(v, x) {
    var a = window.WwBtLook.withAlpha(x.close >= x.open ? v.look.up : v.look.down, 0.45);
    return { time: x.time, value: isFinite(x.v) && x.v > 0 ? x.v : 0, color: a };
  }
  function seriesPoint(v, i) {
    var b = v.bars[i];
    if (v.look.style === 'line') return { time: b.time, value: b.close };
    return v.look.style === 'heikin' ? v.ha[i] : b;
  }
  function flushChart() {
    views().forEach(function (v) {
      if (v.dirtyFrom < 0 || !v.series) return;
      var from = v.dirtyFrom, i;
      for (i = from; i < v.candles.length; i++) v.bars[i] = C.toChartBar(v.candles[i], R.scale);
      if (v.ha) window.WwBtLook.heikinAshi(v.bars, from, v.ha);
      for (i = from; i < v.candles.length; i++) {
        if (!C.validBar(v.bars[i])) continue;
        v.series.update(seriesPoint(v, i)); if (v.vol) v.vol.update(volPoint(v, v.candles[i]));
      }
      v.dirtyFrom = -1;
    });
  }
  // appearance change from the drawer: colors and switches in place, a new candle style or volume rebuilds the charts
  function applyLook(how) {
    if (!R || !R.chart) return;
    var lk = look(), prev = R.look;
    if (how === 'full' || !prev || lk.style !== prev.style || lk.showVolume !== prev.showVolume || lk.hollow !== prev.hollow) return rebuildChart();
    views().forEach(function (v) {
      if (!v.chart) return;
      v.look = lk;
      v.chart.applyOptions(window.WwBtLook.chartOptions(lk, colors()));
      v.series.applyOptions(window.WwBtLook.seriesOptions(lk, S.priceFormat(R.sym.id)));
      if (v.sessions) v.sessions.setVisible(lk.showSessions);
      if (v.tlines) v.tlines.setVisible(lk.tradeLines);
      if (v.vol) v.vol.setData(v.candles.map(function (x) { return volPoint(v, x); }));
    });
    rebuildMarkers(); syncPriceLines(); updateAskLine();
  }
  // Trade markers (WwBtLook.tradeMarkers): small arrows and exit dots by default, labels / open positions only / none from the
  // appearance drawer; markers of one kind on one candle are merged with their count. Hover: a box with the trades (markTip).
  function rebuildMarkers() {
    if (!R) return;
    var c = colors(), sec = R.acc.sectionNo, lk = look(), LK = window.WwBtLook;
    var trades = R.eng.closed.filter(function (t) { return t.section === sec; }).slice(-MAX_MARKER_TRADES).concat(R.eng.open);   // this section's trades
    views().forEach(function (v) {
      if (!v.series) return;
      var first = v.candles.length ? v.candles[0].time : 0, last = v.candles.length ? v.candles[v.candles.length - 1].time : 0;
      var inView = function (tm) { return tm >= first && tm <= last; }, list = [], segs = [];
      trades.forEach(function (t) {
        var e = C.bucketStart(t.entryBarT, v.tfMin, R.sym.id), x = t.exitT != null ? C.bucketStart(t.exitBarT, v.tfMin, R.sym.id) : null;
        if (!inView(e) && !(x !== null && inView(x))) return;
        list.push({ id: t.id, dir: t.dir, open: t.exitT == null, src: t,
          entry: inView(e) ? { time: e, label: dirLabel(t.dir) + ' ' + E.stepsToStr(t.steps, R.sym.lotDigits) } : { time: e, label: '' },
          exit: x !== null && inView(x) ? { time: x, label: reasonLabel(t.reason), net: t.net } : null });
        if (x !== null && inView(e) && inView(x)) segs.push({ t0: e, p0: t.entry / R.scale, t1: x, p1: t.exit / R.scale, win: t.net >= 0 });
      });
      // an entry before the loaded candles is left out (its exit still shows)
      var r = LK.tradeMarkers(list, lk.marks, { up: c.up, down: c.down });
      r.markers = r.markers.filter(function (m) { return inView(m.time); });
      v.markGroups = r.groups; v.tlSegs = segs;
      v.series.setMarkers(r.markers);
      if (v.tlines) { v.tlines.setVisible(lk.tradeLines); v.tlines.refresh(); }
    });
  }
  // Lightweight Charts keeps reporting the last hovered marker while the pointer stays in its bar column: the pointer must be
  // within half a bar of the marker and in its band (below the low / above the high of the candle)
  function nearMarker(v, id, pt) {
    var k = id.split(':'), time = +k[1], below = k[2] === 'belowBar', ts = v.chart.timeScale(), x = ts.timeToCoordinate(time);
    if (x === null || Math.abs(pt.x - x) > Math.max(8, ts.options().barSpacing / 2 + 4)) return false;
    var bars = v.bars || [], lo = 0, hi = bars.length - 1;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (bars[mid].time < time) lo = mid + 1; else hi = mid; }
    var b = bars[lo]; if (!b || b.time !== time) return false;
    var y = v.series.priceToCoordinate(below ? b.low : b.high); if (y === null) return false;
    return below ? pt.y >= y - 4 && pt.y <= y + 60 : pt.y <= y + 4 && pt.y >= y - 60;
  }
  // the box over a hovered marker: direction, lot, entry and exit price, reason and P&L of each trade on it
  var MAX_TIP_ROWS = 6;
  function markTip(v, p) {
    var tip = $('bt-mark-tip');
    var g = p && p.hoveredObjectId && p.point && v && v.markGroups && nearMarker(v, p.hoveredObjectId, p.point) ? v.markGroups[p.hoveredObjectId] : null;
    if (!g) { if (tip && tip.getAttribute('data-view') === String(views().indexOf(v))) tip.hidden = true; return; }
    if (!tip) { tip = el('div', 'bt-mark-tip'); tip.id = 'bt-mark-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
    tip.setAttribute('data-view', String(views().indexOf(v)));
    tip.textContent = '';
    var s = R.sym, d = s.digits;
    g.slice(0, MAX_TIP_ROWS).forEach(function (it) {
      var t = it.trade.src, row = el('div', 'bt-mark-row'), open = t.exitT == null;
      row.appendChild(el('span', 'bt-mark-dir ' + (t.dir > 0 ? 'bt-up' : 'bt-down'), dirLabel(t.dir) + ' ' + E.stepsToStr(t.steps, s.lotDigits)));
      row.appendChild(el('span', 'bt-num', E.ptsToStr(t.entry, d) + (open ? '' : ' → ' + E.ptsToStr(t.exit, d))));
      var net = open ? (R.eng.quote ? E.grossCents(s, t.dir, t.entry, E.closeFill(t.dir, R.eng.quote.bid, R.eng.sp), t.steps) - t.comm : 0) : t.net;
      row.appendChild(el('span', 'bt-mark-why', open ? _t('backtest.mark.open', 'Açık') : reasonLabel(t.reason)));
      row.appendChild(el('span', 'bt-num ' + (net > 0 ? 'bt-up' : net < 0 ? 'bt-down' : ''), fmtUsd(net, true)));
      tip.appendChild(row);
    });
    if (g.length > MAX_TIP_ROWS) tip.appendChild(el('div', 'bt-hint', _t('backtest.mark.more', '+{n} işlem daha', { n: g.length - MAX_TIP_ROWS })));
    tip.hidden = false;
    var r = v.el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    var x = r.left + p.point.x + 14, y = r.top + p.point.y + 14;
    if (x + w > window.innerWidth - 8) x = r.left + p.point.x - w - 14;
    if (y + h > window.innerHeight - 8) y = r.top + p.point.y - h - 14;
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
  }
  // a price line only for a valid price (finite, positive); anything else removes the line
  function okPrice(p) { return typeof p === 'number' && isFinite(p) && p > 0; }
  function priceLine(v, Ls, key, pts, opts) {
    var price = pts == null ? NaN : pts / R.scale;
    if (!okPrice(price)) { if (Ls[key]) { try { v.series.removePriceLine(Ls[key]); } catch (e) { /* series rebuilt */ } Ls[key] = null; } return; }
    if (Ls[key]) Ls[key].applyOptions({ price: price, title: opts.title });
    else Ls[key] = v.series.createPriceLine(Object.assign({ price: price, lineWidth: 1, axisLabelVisible: true }, opts));
  }
  // every price line of a view (positions, Ask, Bid) off the chart; syncPriceLines / updateAskLine draw the current ones again
  function clearPriceLines(v) {
    if (!v || !v.series) return;
    Object.keys(v.lines || {}).forEach(function (id) { ['entry', 'sl', 'tp'].forEach(function (k) { priceLine(v, v.lines[id], k, null); }); });
    v.lines = {};
    [v.askLine, v.bidLine].forEach(function (l) { if (l) { try { v.series.removePriceLine(l); } catch (e) { /* ignore */ } } });
    v.askLine = null; v.bidLine = null;
  }
  function syncPriceLines() {
    if (!R) return;
    var c = colors(), LS = window.LightweightCharts.LineStyle;
    views().forEach(function (v) {
      if (!v.series) return;
      var keep = {};
      R.eng.open.forEach(function (p) {
        var Ls = v.lines[p.id] || (v.lines[p.id] = {}); keep[p.id] = true;
        priceLine(v, Ls, 'entry', p.entry, { color: p.dir > 0 ? c.up : c.down, lineStyle: LS.Solid, title: dirLabel(p.dir) + ' ' + E.stepsToStr(p.steps, R.sym.lotDigits) });
        priceLine(v, Ls, 'sl', p.sl, { color: c.down, lineStyle: LS.Dashed, title: 'SL' });
        priceLine(v, Ls, 'tp', p.tp, { color: c.up, lineStyle: LS.Dashed, title: 'TP' });
      });
      (R.eng.orders || []).forEach(function (o) {
        var key = 'o:' + o.id, Ls = v.lines[key] || (v.lines[key] = {}); keep[key] = true;
        priceLine(v, Ls, 'entry', o.price, { color: o.dir > 0 ? c.up : c.down, lineStyle: LS.LargeDashed, title: ordLabel(o.dir, o.type) + ' ' + E.stepsToStr(o.steps, R.sym.lotDigits) });
        priceLine(v, Ls, 'sl', o.sl, { color: c.down, lineStyle: LS.SparseDotted, title: 'SL' });
        priceLine(v, Ls, 'tp', o.tp, { color: c.up, lineStyle: LS.SparseDotted, title: 'TP' });
      });
      Object.keys(v.lines).forEach(function (id) {
        if (!keep[id]) { ['entry', 'sl', 'tp'].forEach(function (k) { priceLine(v, v.lines[id], k, null); }); delete v.lines[id]; }
      });
    });
  }
  function updateAskLine() {
    if (!R || !R.eng.quote) return;
    var LS = window.LightweightCharts.LineStyle, bid = R.eng.quote.bid / R.scale, ask = (R.eng.quote.bid + R.eng.sp) / R.scale;
    if (!okPrice(bid) || !okPrice(ask)) { views().forEach(clearAskBid); return; }
    views().forEach(function (v) {
      if (!v.series) return;
      // Heikin Ashi: the last REAL price (bid), since the series' own last value is an averaged close
      var haLast = v.look && v.look.style === 'heikin' && v.look.showLastPrice;
      if (!haLast && v.bidLine) { v.series.removePriceLine(v.bidLine); v.bidLine = null; }
      else if (haLast && v.bidLine) v.bidLine.applyOptions({ price: bid });
      else if (haLast) v.bidLine = v.series.createPriceLine({ price: bid, color: v.look.up, lineWidth: 1, lineStyle: LS.Dotted, axisLabelVisible: true, title: 'Bid' });
      if (!R.eng.sp) { if (v.askLine) { v.series.removePriceLine(v.askLine); v.askLine = null; } return; }
      if (v.askLine) v.askLine.applyOptions({ price: ask });
      else v.askLine = v.series.createPriceLine({ price: ask, color: colors().muted, lineWidth: 1, lineStyle: LS.Dotted, axisLabelVisible: true, title: 'Ask' });
    });
  }
  function clearAskBid(v) {
    [v.askLine, v.bidLine].forEach(function (l) { if (l && v.series) { try { v.series.removePriceLine(l); } catch (e) { /* ignore */ } } });
    v.askLine = null; v.bidLine = null;
  }
  // "Center the chart": about CENTER_BARS candles with the replay cursor's candle on the right, and the price scale back on auto
  // scale. After going to a date, a section, a timeframe change, opening the account and full screen; the button and R do the same.
  function centerView(v) {
    if (!v || !v.chart) return;
    try { v.chart.priceScale('right').applyOptions({ autoScale: true }); } catch (e) { /* ignore */ }
    var n = v.bars ? v.bars.length : 0; if (!n) return;
    v.chart.timeScale().setVisibleLogicalRange({ from: n - CENTER_BARS, to: n - 1 + RIGHT_OFFSET });
    if (v === R) updateNowBtn();
    later(function () { checkScale(v); }, 150);
  }
  // self-check after centering: with auto scale on, the price axis must frame the visible candles. Price lines never take part in
  // auto scale; only series data and primitives do. If the axis is far off the candles (the BTCUSD axis at minus billions), the
  // case is logged with both ranges and the view is built again from its candles (no stray series or primitive survives that).
  function checkScale(v, again) {
    if (!v || !v.chart || !v.series || !v.bars || !v.bars.length || !v.el) return;
    var h = v.el.clientHeight - (v.chart.timeScale().height() || 0); if (!(h > 40)) return;
    var a = v.series.coordinateToPrice(4), b = v.series.coordinateToPrice(h - 4), r = v.chart.timeScale().getVisibleLogicalRange();
    if (a == null || b == null || !r) return;
    var lo = Math.min(a, b), hi = Math.max(a, b), n = v.bars.length, clo = Infinity, chi = -Infinity;
    for (var i = Math.max(0, Math.ceil(r.from)); i <= Math.min(n - 1, Math.floor(r.to)); i++) { clo = Math.min(clo, v.bars[i].low); chi = Math.max(chi, v.bars[i].high); }
    if (!isFinite(clo)) return;
    var span = Math.max(chi - clo, chi * 1e-4);
    if (isFinite(lo) && isFinite(hi) && lo <= clo + span * 0.05 && hi >= chi - span * 0.05 && hi - lo <= span * 4) return;
    wwLogWarn(new Error('price scale off the candles: axis [' + lo + ', ' + hi + '] candles [' + clo + ', ' + chi + '] style ' + (v.look && v.look.style) + (again ? ' (after rebuild)' : '')));
    if (again) return;
    var range = v.chart.timeScale().getVisibleLogicalRange();
    destroyChart(v); buildChart(v); renderChartData(v);
    if (range) v.chart.timeScale().setVisibleLogicalRange(range);
    rebuildMarkers(); syncPriceLines(); updateAskLine();
    later(function () { checkScale(v, true); }, 150);
  }
  function centerAll() { views().forEach(centerView); updateNowBtn(); }
  // "Back to the current candle": shown while the cursor's candle is scrolled out of the main chart
  function updateNowBtn() {
    var b = $('bt-now-btn'); if (!b) return;
    var away = false;
    if (R && R.chart && R.bars && R.bars.length) {
      var r = R.chart.timeScale().getVisibleLogicalRange(), n = R.bars.length;
      away = !!r && (r.to < n - 1.5 || r.from > n - 1);
    }
    if (b.hidden === away) b.hidden = !away;
  }
  function renderLegend(param) {
    var box = $('bt-legend'); if (!box || !R) return;
    var bar = null, bars = R.bars || [], at = -1;
    if (param && param.time && param.logical != null) { var li = Math.round(param.logical); if (bars[li] && bars[li].time === param.time) { bar = bars[li]; at = li; } }
    if (!bar && bars.length) { at = bars.length - 1; bar = bars[at]; }
    if (!bar) { box.textContent = ''; return; }
    var d = R.sym.digits, up = bar.close >= bar.open;
    // a fixed width per value (the widest price of the chart), so hovering or a new digit never moves the row
    var w = String(Math.floor(Math.max(bar.high, bars.length ? bars[bars.length - 1].high : 0))).length + d + 1;
    if (!R.legW || w > R.legW) { R.legW = w; box.style.setProperty('--bt-leg-ch', w); }
    box.textContent = '';
    [['O', bar.open], ['H', bar.high], ['L', bar.low], ['C', bar.close]].forEach(function (x) {
      var s = el('span', 'bt-leg ' + (up ? 'bt-up' : 'bt-down')); s.appendChild(el('i', '', x[0])); s.appendChild(el('b', '', Number(x[1]).toFixed(d)));
      box.appendChild(s);
    });
    // activity estimate of the candle (sum of its 1-minute ranges, in price units) when the bars are shown
    var c = R.candles && R.candles[at];
    if (R.look && R.look.showVolume && c) {
      var a = el('span', 'bt-leg bt-leg-act'); a.appendChild(el('i', '', _t('backtest.chart.activity', 'Aktivite (tahmini)'))); a.appendChild(el('b', '', ((c.v || 0) / R.scale).toFixed(d)));
      box.appendChild(a);
    }
  }
  var resizeFallbackOn = false;
  function installResizeFallback() {
    if (resizeFallbackOn) return; resizeFallbackOn = true;
    PAGE.on(window, 'resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = later(function () { views().forEach(function (v) { if (v.chart && v.el) v.chart.applyOptions({ width: v.el.clientWidth, height: v.el.clientHeight }); }); }, 80);
    });
  }

  // ---------------------------------------------------------------- multi-chart (Premium): layouts, own timeframes, sync
  function wideScreen() { try { return window.matchMedia('(min-width: 1025px)').matches; } catch (e) { return true; } }
  // the layout actually shown: Premium, advanced mode and a wide screen, otherwise one chart (the stored choice stays)
  function shownLayout() {
    var id = LAY.prefs().charts;
    return can('backtestMultiChart') && LAY.mode() === 'advanced' && wideScreen() && LAYOUTS[id] ? id : '1';
  }
  function historyNeed() { var n = 1; views().forEach(function (v) { n = Math.max(n, C.historyMonths(v.tfMin)); }); return n; }
  // candles of a view from the loaded history minutes and the window up to the cursor (never later than the cursor)
  function viewCandles(v) {
    var id = R.sym.id;
    v.candles = C.merge(R.hist && R.hist.n ? C.aggregate(R.hist, v.tfMin, id) : [], R.win ? C.aggregate(R.win, v.tfMin, id, 0, R.k) : []);
    v.builder = C.createBuilder(v.tfMin, id, v.candles);
    v.dirtyFrom = -1;
  }
  function tfOptions(sel, value) {
    sel.textContent = '';
    C.TF_IDS.forEach(function (id) { var o = document.createElement('option'); o.value = id; o.textContent = C.TF_LABEL[id]; sel.appendChild(o); });
    sel.value = value;
  }
  function newView(i, tf) {
    var cell = el('div', 'bt-cell bt-cell-x'), head = el('div', 'bt-cell-head'), sel = el('select', 'bt-select bt-num bt-cell-tf');
    sel.setAttribute('aria-label', _t('backtest.multi.timeframe', 'Bu grafiğin zaman dilimi'));
    tfOptions(sel, C.TF_MIN[tf] ? tf : EXTRA_TFS[i]);
    head.appendChild(cellGrip()); head.appendChild(sel); cell.appendChild(head);
    var host = el('div', 'bt-chart'); cell.appendChild(host);
    cellHost(i).appendChild(cell);
    var v = { el: host, cell: cell, pane: 'chart' + (i + 2), tfSel: sel, tfId: sel.value, tfMin: C.TF_MIN[sel.value], candles: [], bars: [], lines: {}, dirtyFrom: -1 };
    sel.addEventListener('change', function () { setViewTimeframe(v, sel.value); });
    return v;
  }
  // the drawing toolbar: its own window on the free desk (sized by that window's width), next to the main chart otherwise
  function placeDrawBar(kind) {
    var bar = $('bt-draw-bar'), free = kind === 'free', home = free ? $('bt-draw-win-body') : document.querySelector('#bt-chart-card .bt-chart-body');
    if (!bar || !home) return;
    if (free) bar.setAttribute('data-fit', 'width'); else bar.removeAttribute('data-fit');
    if (bar.parentNode !== home) home.insertBefore(bar, home.firstChild);
  }
  // where an extra chart's cell goes: its own window on the free desk, the shared grid otherwise (full screen)
  function freeDesk() { return !!DESK && DESK.kind() === 'free'; }
  function cellHost(i) { var w = freeDesk() && document.querySelector('.bt-win[data-win="chart' + (i + 2) + '"] .bt-win-body'); return w || $('bt-charts'); }
  function gridLayout() { return freeDesk() ? '1' : shownLayout(); }
  function placeCells() {
    if (!R || !R.extra) return;
    R.extra.forEach(function (v, i) { var h = cellHost(i); if (v.cell.parentNode !== h) h.appendChild(v.cell); });
    $('bt-charts').setAttribute('data-layout', gridLayout());
    layoutCells();
  }
  // chart window present on the desk: the main one always, chart2..4 while the chart layout has that many charts
  function chartPresent(id) { var i = window.WwBtDesk.CHARTS.indexOf(id); return i <= 0 || !!(R && R.extra && R.extra.length >= i); }
  // a layout or preset asks for a chart layout: multi-chart stays Premium
  function setChartsFromDesk(id) {
    if (!LAYOUTS[id]) id = '1';
    if (id !== '1' && !can('backtestMultiChart')) return false;
    LAY.setCharts(id, (R && R.extra && R.extra.length ? R.extra.map(function (x) { return x.tfId; }) : LAY.prefs().tfs));
    if (R) applyChartLayout();
    return true;
  }
  function applyChartLayout() {
    if (!R || !R.chart) return;
    var id = shownLayout(), need = LAYOUTS[id] - 1, tfs = LAY.prefs().tfs, added = false;
    $('bt-charts').setAttribute('data-layout', gridLayout());
    R.extra = R.extra || [];
    while (R.extra.length > need) { var gone = R.extra.pop(); destroyChart(gone); gone.cell.remove(); }
    while (R.extra.length < need) {
      var i = R.extra.length, v = newView(i, tfs[i]);
      R.extra.push(v); buildChart(v); viewCandles(v); renderChartData(v); added = true;
      centerView(v);                                       // a new chart starts at the replay cursor; the others keep their view
    }
    if (added) { rebuildMarkers(); syncPriceLines(); updateAskLine(); }
    renderLayoutPicker();
    if (DESK) DESK.apply();
    placeCells();
    if (added && R.histMonths < historyNeed()) loadHistory(R.token);
  }
  function setViewTimeframe(v, tfId) {
    if (!R || !C.TF_MIN[tfId]) return;
    v.tfId = tfId; v.tfMin = C.TF_MIN[tfId];
    viewCandles(v);
    clearPriceLines(v);
    renderChartData(v); rebuildMarkers(); syncPriceLines(); updateAskLine();
    v.tickSeen = null; v.tickHide = null;
    v.chart.applyOptions({ timeScale: { tickMarkFormatter: tickLabelFor(v) }, localization: { timeFormatter: crosshairTimeFor(v) } });
    centerView(v);
    LAY.setCharts(LAY.prefs().charts, R.extra.map(function (x) { return x.tfId; }));
    if (R.histMonths < historyNeed()) loadHistory(R.token);
  }
  function renderLayoutPicker() {
    var box = $('bt-layout-pop'); if (!box) return;
    var cur = shownLayout(), pro = can('backtestMultiChart');
    box.textContent = '';
    LAYOUT_IDS.forEach(function (id) {
      var b = el('button', 'bt-layout-opt'); b.type = 'button'; b.setAttribute('data-layout', id); b.setAttribute('aria-pressed', cur === id ? 'true' : 'false');
      var ic = el('span', 'bt-layout-ico bt-li-' + id.replace('+', 'p')); for (var k = 0; k < LAYOUTS[id]; k++) ic.appendChild(el('i'));
      b.appendChild(ic); b.appendChild(el('span', '', _t('backtest.multi.layout_' + id.replace('+', 'p'), id)));
      if (id !== '1' && !pro) { b.appendChild(el('span', 'bt-pro', 'PRO')); b.setAttribute('data-pro', '1'); }
      box.appendChild(b);
    });
    if (!wideScreen()) box.appendChild(el('p', 'bt-hint', _t('backtest.multi.narrow', 'Dar ekranda tek grafik gösterilir.')));
  }

  // ---------------------------------------------------------------- UI rendering
  function setReplay(state) { var v = $('bt-view-replay'); if (v) v.setAttribute('data-replay', state); updateControls(); }
  function updateControls() {
    if (!R) return;
    var st = $('bt-view-replay').getAttribute('data-replay'), blocked = st === 'loading' || st === 'error';
    var capped = atLimit();
    $('bt-buy-btn').disabled = blocked || !R.eng.quote || capped; $('bt-sell-btn').disabled = blocked || !R.eng.quote || capped;
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
      // crypto: the spread in the price unit ("10.00 USD"); forex/gold: price and pips
      setText('bt-spread', S.spreadUnit(s.id) === 'price' ? E.ptsToStr(R.eng.sp, s.digits) + ' USD' : E.ptsToStr(R.eng.sp, s.digits) + '\n(' + pipsStr(R.acc.spreadH) + ' pip)');
    }
    var sm = E.summary(R.eng);
    setText('bt-stat-balance', fmtUsd(sm.balanceCents)); setText('bt-stat-equity', fmtUsd(sm.equityCents));
    var rz = $('bt-stat-realized'), fl = $('bt-stat-floating');
    rz.textContent = fmtUsd(sm.realizedCents, true); rz.className = 'bt-num ' + pnlClass(sm.realizedCents);
    fl.textContent = fmtUsd(sm.floatingCents, true); fl.className = 'bt-num ' + pnlClass(sm.floatingCents);
    // order hint
    var lot = parseLotQuiet();
    var hint = $('bt-lot-hint');
    if (S.spreadUnit(s.id) === 'price') {
      // crypto: a "pip" is one dollar of price; the position value and the P&L of a 1% move say more
      var val = lot && q ? S.positionValueUsd(s.id, lot.lot, q.bid / R.scale) : null;
      hint.textContent = _t('backtest.order.lot_hint_crypto', 'Adım {step} · {min}–{max} · Değer ≈ {value} · %1 hareket ≈ {pct}', {
        step: s.lot.step, min: s.lot.min, max: s.lot.max, value: val == null ? '—' : fmtUsd(Math.round(val * 100)), pct: val == null ? '—' : fmtUsd(Math.round(val)) });
    } else hint.textContent = _t('backtest.order.lot_hint', 'Adım {step} · {min}–{max} · 1 pip ≈ {pip}', {
      step: s.lot.step, min: s.lot.min, max: s.lot.max, pip: lot && q ? fmtUsd(Math.round(S.pipValueUsd(s.id, lot.lot, q.bid / R.scale) * 100)) : '—' });
    ordPriceHint();
    var risk = $('bt-order-risk'); risk.textContent = '';
    if (lot && q) {
      var sl = quietLevel('bt-sl'), tp = quietLevel('bt-tp'), op = ordType() === 'market' ? null : quietLevel('bt-ord-price');
      if (sl !== false && tp !== false && op !== false && (sl !== null || tp !== null)) {
        var pvB = E.preview(R.eng, { dir: 1, steps: lot.steps, sl: sl, tp: tp, entry: op });
        if (pvB) risk.textContent = _t('backtest.order.risk', 'Risk {risk} · Kazanç {reward} · R:R {rr}', {
          risk: pvB.riskCents == null ? '—' : fmtUsd(pvB.riskCents), reward: pvB.rewardCents == null ? '—' : fmtUsd(pvB.rewardCents),
          rr: pvB.rr == null ? '—' : E.hundredthsToStr(pvB.rr) });
      }
    }
    if (force || R.eng.open.length) renderOpenRows();
    if (R.eng.orders.length) renderOrders();
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
  // a row button of the live tables: icon + label; in a narrow window only the icon shows (the label stays as title / aria-label)
  var ROW_ICONS = {
    edit: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
  };
  function rowBtn(act, id, label, icon) {
    var b = el('button', 'btn btn-ghost bt-row-btn'); b.type = 'button';
    b.setAttribute('data-act', act); b.setAttribute('data-id', id); b.title = label; b.setAttribute('aria-label', label);
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ROW_ICONS[icon] + '</svg>';
    b.appendChild(el('span', 'bt-row-btn-t', label));
    return b;
  }
  // Open positions: the rows are built when the set of positions (or a stop, target, saved state) changes; while the replay runs only
  // the live cells (price, P&L) get new text, so the buttons stay where they are and can be clicked during play.
  function posKey(p) { return p.id + ':' + p.sl + ':' + p.tp + ':' + (p.unsaved ? 1 : 0); }
  function renderOpenRows() {
    var body = $('bt-open-body'), s = R.sym, fl = E.floating(R.eng);
    var key = R.eng.open.map(posKey).join('|') + '#' + lang();
    if (key !== R.openKey || body.children.length !== R.eng.open.length) {
      R.openKey = key; body.textContent = '';
      R.eng.open.forEach(function (p) {
        var tr = el('tr'); tr.setAttribute('data-id', p.id);
        tr.appendChild(td(dirLabel(p.dir), p.dir > 0 ? 'bt-up' : 'bt-down')); tr.appendChild(td(E.stepsToStr(p.steps, s.lotDigits), 'bt-num'));
        tr.appendChild(td(fmtShort(p.entryT), 'bt-num')); tr.appendChild(td(E.ptsToStr(p.entry, s.digits), 'bt-num'));
        tr.appendChild(td(p.sl == null ? '—' : E.ptsToStr(p.sl, s.digits), 'bt-num')); tr.appendChild(td(p.tp == null ? '—' : E.ptsToStr(p.tp, s.digits), 'bt-num'));
        tr.appendChild(td('—', 'bt-num bt-live-mark')); tr.appendChild(td('—', 'bt-num bt-live-pnl'));
        var act = el('td', 'bt-actions');
        act.appendChild(rowBtn('edit', p.id, _t('backtest.pos.edit', 'Düzenle'), 'edit'));
        act.appendChild(rowBtn('close', p.id, _t('backtest.pos.close', 'Kapat'), 'close'));
        if (p.unsaved) act.appendChild(el('span', 'bt-chip bt-chip-warn', _t('backtest.pos.unsaved', 'Kaydedilmedi')));
        tr.appendChild(act); body.appendChild(tr);
      });
      show($('bt-open-empty'), R.eng.open.length === 0);
      setText('bt-open-count', String(R.eng.open.length));
    }
    for (var i = 0; i < body.children.length; i++) {
      var row = body.children[i], f = fl.byId[row.getAttribute('data-id')];
      var mk = row.querySelector('.bt-live-mark'), pc = row.querySelector('.bt-live-pnl');
      setCell(mk, f ? E.ptsToStr(f.mark, s.digits) : '—', 'bt-num bt-live-mark');
      setCell(pc, f ? fmtUsd(f.net, true) : '—', 'bt-num bt-live-pnl ' + (f ? pnlClass(f.net) : ''));
    }
    renderMiniPositions(fl);
  }
  function setCell(c, text, cls) { if (!c) return; if (c.textContent !== text) c.textContent = text; if (c.className !== cls) c.className = cls; }
  // simple mode: the open positions under the order panel (the bottom tabs are hidden there); same in-place updates
  function renderMiniPositions(fl) {
    var list = $('bt-mini-pos-list'), s = R.sym; if (!list) return;
    var key = R.eng.open.map(posKey).join('|') + '#' + lang();
    if (key !== R.miniKey || list.children.length !== R.eng.open.length) {
      R.miniKey = key; list.textContent = '';
      R.eng.open.forEach(function (p) {
        var li = el('li'); li.setAttribute('data-id', p.id);
        li.appendChild(el('span', 'bt-num ' + (p.dir > 0 ? 'bt-up' : 'bt-down'), dirLabel(p.dir) + ' ' + E.stepsToStr(p.steps, s.lotDigits)));
        li.appendChild(el('span', 'bt-mini-meta bt-num', '@ ' + E.ptsToStr(p.entry, s.digits)));
        var act = el('span', 'bt-mini-act');
        act.appendChild(el('span', 'bt-num bt-live-pnl', '—'));
        var b1 = el('button', 'btn btn-ghost', _t('backtest.pos.edit', 'Düzenle')); b1.type = 'button'; b1.setAttribute('data-act', 'edit'); b1.setAttribute('data-id', p.id);
        var b2 = el('button', 'btn btn-ghost', _t('backtest.pos.close', 'Kapat')); b2.type = 'button'; b2.setAttribute('data-act', 'close'); b2.setAttribute('data-id', p.id);
        act.appendChild(b1); act.appendChild(b2); li.appendChild(act);
        list.appendChild(li);
      });
      show($('bt-mini-pos-empty'), R.eng.open.length === 0);
      setText('bt-mini-pos-count', String(R.eng.open.length));
    }
    for (var i = 0; i < list.children.length; i++) {
      var li2 = list.children[i], f = fl.byId[li2.getAttribute('data-id')];
      setCell(li2.querySelector('.bt-live-pnl'), f ? fmtUsd(f.net, true) : '—', 'bt-num bt-live-pnl ' + (f ? pnlClass(f.net) : ''));
    }
  }
  function sectionStart(no) {
    var list = (R && R.acc.sections) || [];
    for (var i = 0; i < list.length; i++) if (list[i].no === no) return list[i].start;
    return null;
  }
  function renderSectionChip() {
    var c = $('bt-acc-section'); if (!c || !R) return;
    c.hidden = R.acc.sectionNo <= 1;
    c.textContent = _t('backtest.section.chip', 'Bölüm {n}', { n: R.acc.sectionNo });
    var st = sectionStart(R.acc.sectionNo); c.title = st ? _t('backtest.section.since', '{date} tarihinden', { date: fmtDay(st) }) : '';
  }
  // the section filter of the history (all / one section); hidden while the account has a single section
  function fillSectionFilter(nums) {
    var sel = $('bt-history-section'), keep = sel.value || 'all';
    sel.textContent = '';
    var all = document.createElement('option'); all.value = 'all'; all.textContent = _t('backtest.section.all', 'Tüm bölümler'); sel.appendChild(all);
    nums.forEach(function (n) {
      var o = document.createElement('option'); o.value = String(n); var st = sectionStart(n);
      o.textContent = _t('backtest.section.chip', 'Bölüm {n}', { n: n }) + (st ? ' · ' + fmtDay(st) : ''); sel.appendChild(o);
    });
    sel.value = keep === 'all' || nums.indexOf(+keep) >= 0 ? keep : 'all';
    show($('bt-history-filter'), nums.length > 1);
    return sel.value;
  }
  function renderTables() {
    if (!R) return;
    renderOpenRows();
    var s = R.sym, body = $('bt-history-body'); body.textContent = '';
    // newest first in the order they were opened, grouped by section
    var all = R.eng.closed.slice().sort(E.bySeq).reverse(), nums = [];
    all.forEach(function (t) { if (nums.indexOf(t.section) < 0) nums.push(t.section); });
    nums.sort(function (a, b) { return b - a; });
    var f = fillSectionFilter(nums), rows = f === 'all' ? all : all.filter(function (t) { return t.section === +f; });
    var grouped = nums.length > 1, shown = rows.slice(0, MAX_HISTORY_ROWS), lastSec = null;
    var sums = {}; rows.forEach(function (t) { var x = sums[t.section] || (sums[t.section] = { n: 0, net: 0 }); x.n++; x.net += t.net; });
    shown.forEach(function (t) {
      if (grouped && t.section !== lastSec) {
        lastSec = t.section;
        var hr = el('tr', 'bt-sec-row'), hc = el('td'); hc.colSpan = 10;
        var st = sectionStart(t.section), x = sums[t.section];
        hc.appendChild(el('span', 'bt-sec-name', _t('backtest.section.chip', 'Bölüm {n}', { n: t.section })));
        hc.appendChild(el('span', 'bt-sec-meta bt-num', (st ? _t('backtest.section.since', '{date} tarihinden', { date: fmtDay(st) }) + ' · ' : '') +
          _t('backtest.section.trades', '{n} işlem', { n: x.n }) + ' · '));
        hc.appendChild(el('span', 'bt-num ' + pnlClass(x.net), fmtUsd(x.net, true)));
        hr.appendChild(hc); body.appendChild(hr);
      }
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
    setText('bt-history-count', String(all.length));
  }
  // Statistics tab: drawn only while it is visible (the charts are not free), coalesced while the replay closes trades
  function renderStats() {
    if (!R) return;
    var sv = $('bt-stats-view');
    if (!sv || !sv.getClientRects().length) { R.statsDirty = true; return; }
    clearTimeout(statsTimer);
    statsTimer = later(drawStats, 120);
  }
  function drawStats() {
    if (!R || !STATS) return;
    R.statsDirty = false;
    var sym = R.sym, eng = R.eng, sp = eng.sp;
    function risk(t) { return t.sl0 == null ? null : -E.grossCents(sym, t.dir, t.entry, t.sl0, t.steps) + t.comm; }
    var trades = eng.closed.map(function (t) { return { seq: t.seq, section: t.section, entryT: t.entryT, exitT: t.exitT, net: t.net, comm: t.comm, dir: t.dir, entry: t.entry, steps: t.steps, riskCents: risk(t), rr: t.rr == null ? null : t.rr / 100 }; });
    var open = eng.open.map(function (t) { return { entryT: t.entryT, exitT: null, net: 0, comm: t.comm, dir: t.dir, entry: t.entry, steps: t.steps }; });
    // equity curve in market time: the current section only, from the balance the earlier sections left
    var secNo = R.acc.sectionNo, secTrades = trades.filter(function (t) { return t.section === secNo; });
    var secStartCents = R.acc.startCents + trades.reduce(function (a, t) { return t.section === secNo ? a : a + t.net; }, 0);
    var firstT = secTrades.concat(open).length ? Math.min.apply(null, secTrades.concat(open).map(function (t) { return t.entryT; })) - 60 : 0;
    var span = R.tfMin * 60, candles = !firstT ? [] : R.candles.filter(function (c) { return c.time + span > firstT; }).map(function (c) { return { time: c.time, close: c.close, span: span }; });
    STATS.render({ box: $('bt-stats-view'), t: _t, pro: can('backtestStats'), fmtUsd: fmtUsd, locale: localeTag(), colors: colors(), lwc: window.WwChart.lwc,
      layout: DESK ? DESK.widgets() : null, drag: wideScreen(), onLayout: function (l) { if (DESK) DESK.setWidgets(l); if (!$('bt-widgets-pop').hidden) renderWidgetsMenu(); },
      monthNames: MONTHS[lang()] || MONTHS.tr, upgrade: function () { openUpgrade('backtest_stats'); },
      data: { trades: trades, open: open, candles: candles, startCents: R.acc.startCents, section: secNo, sectionTrades: secTrades, sectionStartCents: secStartCents,
        floatCents: function (t, closePts) { return E.grossCents(sym, t.dir, t.entry, E.closeFill(t.dir, closePts, sp), t.steps) - t.comm; },
        monthOf: function (sec) { var p = window.WwTime.partsInTz(sec * 1000, tz()); return p.y + '-' + pad2(p.m); },
        sessionsAt: window.WwBtLook.sessionsAt } });
    var sm = E.summary(eng);
    setText('bt-stats-extra', _t('backtest.stat.commission', 'Toplam komisyon') + ': ' + fmtUsd(sm.commissionCents) + ' · ' +
      _t('backtest.stat.ambiguous', 'Belirsiz çıkış (aynı 1 dk mumda)') + ': ' + sm.ambiguous + ' ·');
  }
  // open positions, pending orders, history and statistics are windows: open one and bring it to the front
  function showWin(name) { if (DESK) DESK.show(name); if (name === 'stats') { renderStats(); icons(); } }

  // ---------------------------------------------------------------- listeners
  function bindStaticUi() {
    $('bt-accounts').addEventListener('click', onAccountsClick);
    $('bt-accounts').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.classList.contains('bt-account-card')) openAccount(e.target.getAttribute('data-id'));
    });
    $('bt-new-account-btn').addEventListener('click', function (e) { newAccountClicked(e.currentTarget); });
    $('bt-empty-create-btn').addEventListener('click', function (e) { newAccountClicked(e.currentTarget); });
    $('bt-list-retry-btn').addEventListener('click', async function () { showSkeleton(); if (await loadList()) { setPageState('list'); renderList(); } });
    $('bt-back-btn').addEventListener('click', backToList);
    $('bt-acc-settings-btn').addEventListener('click', function (e) { if (R) openAccountModal('edit', R.acc, e.currentTarget); });
    // account modal
    $('bt-account-form').addEventListener('submit', function (e) { e.preventDefault(); submitAccountForm(); });
    $('bt-account-submit').addEventListener('click', submitAccountForm);
    $('bt-account-close').addEventListener('click', function () { closeModal('bt-account-modal'); });
    $('bt-account-cancel').addEventListener('click', function () { closeModal('bt-account-modal'); });
    $('bt-account-delete').addEventListener('click', function (e) { openDeleteModal(editing, e.currentTarget); });
    $('bt-account-reset').addEventListener('click', function (e) { openModal('bt-reset-modal', e.currentTarget); });
    // tabs: click, arrow keys (vertical on desktop, horizontal on a phone), Home / End
    $('bt-acc-tabs').addEventListener('click', function (e) { var t = e.target.closest('[data-acc-tab]'); if (t) selectAccTab(t.getAttribute('data-acc-tab')); });
    $('bt-acc-tabs').addEventListener('keydown', function (e) {
      var list = accTabs(), cur = list.indexOf((document.activeElement && document.activeElement.getAttribute('data-acc-tab')) || ''), k = e.key;
      if (cur < 0) return;
      var next = k === 'ArrowDown' || k === 'ArrowRight' ? cur + 1 : k === 'ArrowUp' || k === 'ArrowLeft' ? cur - 1 : k === 'Home' ? 0 : k === 'End' ? list.length - 1 : null;
      if (next === null) return;
      e.preventDefault(); selectAccTab(list[(next + list.length) % list.length], true);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-bt-plan-badge]'), function (b) {
      b.addEventListener('click', function (e) { openPlanTab(e.currentTarget); });
    });
    $('bt-account-form').addEventListener('input', accDirty);
    $('bt-account-form').addEventListener('change', accDirty);
    // timeframe: changed in the replay toolbar, not here
    $('bt-account-form').addEventListener('click', function (e) {
      if (!e.target.closest('[data-act="tf-toolbar"]')) return;
      var acc = editing; closeModal('bt-account-modal');
      if (R && acc && R.acc.id === acc.id) { if (DESK) DESK.show('replay'); try { $('bt-tf').focus(); } catch (x) { /* ignore */ } }
      else if (acc) openAccount(acc.id);
    });
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
    ['bt-account-modal', 'bt-delete-modal', 'bt-reset-modal', 'bt-pos-modal', 'bt-ord-modal', 'bt-keys-modal'].forEach(function (id) {
      $(id).addEventListener('click', function (e) { if (e.target === $(id)) closeModal(id); });
    });
    // toolbar
    $('bt-tf').addEventListener('change', function () { setTimeframe(this.value); });
    $('bt-speed').addEventListener('change', function () { setSpeed(parseFloat(this.value)); });
    $('bt-play-btn').addEventListener('click', function () { if (R && R.playing) pause(); else play(); });
    $('bt-step-btn').addEventListener('click', stepCandle);
    $('bt-step1m-btn').addEventListener('click', stepMinute);
    setupRange();
    $('bt-goto-btn').addEventListener('click', function () { goTo(fromLocalInput($('bt-goto-input').value)); });   // hidden; the smoke drivers use it
    $('bt-center-btn').addEventListener('click', function () { centerAll(); });
    $('bt-now-btn').addEventListener('click', function () { centerAll(); });
    // orders
    $('bt-buy-btn').addEventListener('click', function () { submitOrder(1); });
    $('bt-sell-btn').addEventListener('click', function () { submitOrder(-1); });
    $('bt-order-form').addEventListener('submit', function (e) { e.preventDefault(); });
    ['bt-lot', 'bt-sl', 'bt-tp'].forEach(function (id) { $(id).addEventListener('input', function () { orderError(''); renderLive(false); }); });
    ['bt-open-body', 'bt-mini-pos-list'].forEach(function (id) {
      $(id).addEventListener('click', function (e) {
        var b = e.target.closest('button[data-act]'); if (!b) return;
        if (b.getAttribute('data-act') === 'close') closePos(b.getAttribute('data-id')); else openEditPos(b.getAttribute('data-id'));
      });
    });
    // layout: mode switch, full screen, shortcut sheet
    Array.prototype.forEach.call(document.querySelectorAll('[data-bt-fs]'), function (b) {
      b.addEventListener('click', function () { LAY.setFullscreen(!LAY.isFullscreen()); });
    });
    $('bt-fs-edit').addEventListener('click', function () { FSEDIT.setEditing(!FSEDIT.isEditing()); });
    $('bt-keys-btn').addEventListener('click', function (e) { openKeys(e.currentTarget); });
    $('bt-keys-link').addEventListener('click', function (e) { openKeys(e.currentTarget); });
    $('bt-keys-close').addEventListener('click', function () { closeModal('bt-keys-modal'); });
    // appearance drawer
    DRAWER = window.WwBtLook.mountDrawer({ box: $('bt-look-body'), t: _t, state: function () { return L.look; }, pro: function () { return can('backtestThemes'); },
      light: function () { return window.WwChart.isLight(); }, upgrade: function () { openUpgrade('backtest_themes'); }, newId: newId,
      change: function (next, how) { L.look = next; window.WwBtLook.save(safeStorage(), next); applyLook(how); } });
    $('bt-look-btn').addEventListener('click', function () { toggleDrawer(); });
    $('bt-limit-upgrade').addEventListener('click', function () { openUpgrade('backtest_trades'); });
    $('bt-back-continue').addEventListener('click', function () { finishBack('continue'); });
    $('bt-back-reset').addEventListener('click', function () { finishBack('reset'); });
    $('bt-back-cancel').addEventListener('click', function () { finishBack('cancel'); });
    $('bt-back-close').addEventListener('click', function () { finishBack('cancel'); });
    $('bt-back-modal').addEventListener('click', function (e) { if (e.target === $('bt-back-modal')) finishBack('cancel'); });
    $('bt-history-section').addEventListener('change', function () { renderTables(); });
    // multi-chart layout picker (Premium)
    $('bt-layout-btn').addEventListener('click', function (e) { e.stopPropagation(); toggleLayoutPop(); });
    $('bt-layout-pop').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-layout]'); if (!b) return;
      var id = b.getAttribute('data-layout');
      if (b.hasAttribute('data-pro')) { toggleLayoutPop(false); return openUpgrade('backtest_multichart'); }
      LAY.setCharts(id, (R && R.extra.length ? R.extra.map(function (x) { return x.tfId; }) : LAY.prefs().tfs));
      toggleLayoutPop(false); applyChartLayout();
      if (freeDesk()) DESK.tileCharts(shownLayout());
    });
    PAGE.on(document, 'click', function (e) {
      if (!e.target.closest('#bt-layout-pop, #bt-layout-btn')) toggleLayoutPop(false);
      if (!e.target.closest('#bt-panels-pop, #bt-panels-btn')) togglePop('bt-panels', false);
      if (!e.target.closest('#bt-widgets-pop, #bt-widgets-btn')) togglePop('bt-widgets', false);
    });
    // panels menu (show / hide, reset), statistics: own panel / back to the tab / full screen, widget menu
    $('bt-panels-btn').addEventListener('click', function (e) { e.stopPropagation(); togglePop('bt-panels'); });
    $('bt-panels-pop').addEventListener('change', function (e) { DESK.onMenuChange(e); });
    $('bt-panels-pop').addEventListener('click', function (e) { e.stopPropagation(); DESK.onMenu(e, $('bt-panels-pop')); });
    $('bt-panels-pop').addEventListener('submit', function (e) { DESK.onMenuSubmit(e, $('bt-panels-pop')); });
    $('bt-widgets-btn').addEventListener('click', function (e) { e.stopPropagation(); togglePop('bt-widgets'); });
    $('bt-widgets-pop').addEventListener('change', function (e) { var id = e.target.getAttribute('data-widget-toggle'); if (id) setWidget(id, e.target.checked); });
    $('bt-widgets-pop').addEventListener('click', function (e) { if (e.target.closest('[data-act="reset-widgets"]')) { DESK.setWidgets(null); renderWidgetsMenu(); renderStats(); } });
    $('bt-stats-fs-btn').addEventListener('click', function () { openStatsFs(!statsFs); });
    $('bt-stats-fs-close').addEventListener('click', function () { openStatsFs(false); });
    $('bt-charts').addEventListener('pointerdown', onChartsPointer);
    if (window.ResizeObserver) { var croF = 0, cro = new ResizeObserver(function () { cancelAnimationFrame(croF); croF = requestAnimationFrame(positionSplits); }); cro.observe($('bt-charts')); PAGE.onLeave(function () { cro.disconnect(); }); }
    var wasWide = wideScreen();
    PAGE.on(window, 'resize', function () { var w = wideScreen(); if (w !== wasWide) { wasWide = w; if (R) applyChartLayout(); } });
    $('bt-look-close').addEventListener('click', function () { toggleDrawer(false); });
    // pending orders: type, list, edit modal
    $('bt-ordtype').addEventListener('click', function (e) { var b = e.target.closest('[data-ordtype]'); if (b) setOrdType(b.getAttribute('data-ordtype')); });
    $('bt-ord-price').addEventListener('input', function () { orderError(''); renderLive(false); });
    ['bt-orders-body', 'bt-mini-ord-list'].forEach(function (id) {
      $(id).addEventListener('click', function (e) {
        var b = e.target.closest('button[data-act]'); if (!b) return;
        if (b.getAttribute('data-act') === 'cancel-order') cancelOrderId(b.getAttribute('data-id')); else if (b.getAttribute('data-act') === 'edit-order') openEditOrder(b.getAttribute('data-id'));
      });
    });
    $('bt-ord-close').addEventListener('click', function () { closeModal('bt-ord-modal'); });
    $('bt-ord-cancel').addEventListener('click', function () { closeModal('bt-ord-modal'); });
    $('bt-ord-save').addEventListener('click', submitEditOrder);
    $('bt-ord-form').addEventListener('submit', function (e) { e.preventDefault(); submitEditOrder(); });
    $('bt-ord-cancel-order').addEventListener('click', function () { var o = editing; closeModal('bt-ord-modal'); if (o) cancelOrderId(o.id); });
    try { L.ordType = localStorage.getItem(ORDTYPE_KEY) || 'market'; } catch (e) { L.ordType = 'market'; }
    setOrdType(L.ordType);
    $('bt-save-retry-btn').addEventListener('click', retrySave);
  }
  function setupKeyboard() {
    PAGE.on(document, 'keydown', function (e) {
      if (e.key === 'Escape' && anyModalOpen()) { closeAllModals(); return; }
      if (e.key === 'Escape' && statsFs) { openStatsFs(false); e.preventDefault(); return; }
      if (!R || anyModalOpen() || statsFs) return;
      if (e.key === 'Escape') { if (escapeChain()) e.preventDefault(); return; }
      var tg = e.target && e.target.tagName;
      if (tg === 'INPUT' || tg === 'SELECT' || tg === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
      if (RANGE && RANGE.isOpen()) return;                     // the date panel is open: Space / arrows belong to it
      if (FSEDIT && FSEDIT.isEditing()) return;                // arranging the full screen: arrows move the boxes
      if ((e.ctrlKey || e.metaKey) && DRAW && DRAW.undoKey(e)) { e.preventDefault(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ') { e.preventDefault(); if (R.playing) pause(); else play(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (e.shiftKey) stepMinute(); else stepCandle(); }
      else if (e.key === '?') { e.preventDefault(); openKeys(null); }
      else if (e.shiftKey && (e.key === 'B' || e.key === 'b')) { e.preventDefault(); if (!$('bt-buy-btn').disabled) submitOrder(1); }
      else if (e.shiftKey && (e.key === 'S' || e.key === 's')) { e.preventDefault(); if (!$('bt-sell-btn').disabled) submitOrder(-1); }
      else if (!e.shiftKey && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); LAY.setFullscreen(!LAY.isFullscreen()); }
      else if (!e.shiftKey && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); centerAll(); }
      else if (handleToolKey(e)) e.preventDefault();
    });
  }
  // Esc: the innermost thing first (drawing in progress / selection, then full screen). true when something was closed.
  function escapeChain() {
    if (FSEDIT && FSEDIT.isEditing()) { FSEDIT.setEditing(false); return true; }
    if (statsFs) { openStatsFs(false); return true; }
    if (!$('bt-panels-pop').hidden) { togglePop('bt-panels', false); return true; }
    if (!$('bt-widgets-pop').hidden) { togglePop('bt-widgets', false); return true; }
    if (!$('bt-layout-pop').hidden) { toggleLayoutPop(false); return true; }
    if (!$('bt-look-drawer').hidden) { toggleDrawer(false); return true; }
    if (DRAW && DRAW.escape()) return true;
    if (LAY && LAY.isFullscreen()) { LAY.setFullscreen(false); return true; }
    return false;
  }
  // drawing keys (1-9 tools, V cursor, M magnet, Del): the toolbar is there in both views
  function handleToolKey(e) { return !!DRAW && DRAW.key(e); }
  function toggleLayoutPop(on) {
    var p = $('bt-layout-pop'); if (!p) return;
    if (on === undefined) on = p.hidden;
    if (on) renderLayoutPicker();
    p.hidden = !on; $('bt-layout-btn').setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  function toggleDrawer(on) {
    var d = $('bt-look-drawer'); if (on === undefined) on = d.hidden;
    if (on) { DRAWER.render(); d.hidden = false; $('bt-look-btn').setAttribute('aria-expanded', 'true'); var f = d.querySelector('button, input'); if (f) f.focus(); }
    else if (!d.hidden) { d.hidden = true; $('bt-look-btn').setAttribute('aria-expanded', 'false'); try { $('bt-look-btn').focus(); } catch (e) { /* ignore */ } }
  }
  function openKeys(opener) {
    var box = $('bt-keys-list'); LAY.renderSheet(box);
    if (LAY.mode() !== 'advanced') Array.prototype.forEach.call(box.querySelectorAll('.bt-adv-only'), function (r) { r.remove(); });
    openModal('bt-keys-modal', opener);
  }
  function onLayoutChange(prefs, what) {
    if ((what === 'mode' || what === 'fullscreen') && DESK) { DESK.apply(); placeCells(); placeStatsHost(); }
    if (what === 'mode' && R) { renderTables(); renderLive(true); renderStats(); }
    if (what === 'mode' && R) applyChartLayout();
    if (what === 'fullscreen' && FSEDIT && !LAY.isFullscreen()) FSEDIT.setEditing(false);
    if ((what === 'mode' || what === 'fullscreen') && FSEDIT) later(function () { if (FSEDIT) FSEDIT.apply(); }, 100);   // the stored places of the full-screen boxes
    if (what === 'fullscreen') { icons(); if (R && R.chart) later(function () { if (R && R.chart && !(R.chart.autoSizeActive && R.chart.autoSizeActive())) { var w = $('bt-chart'); R.chart.applyOptions({ width: w.clientWidth, height: w.clientHeight }); } if (R) centerAll(); }, 80); }
  }
  // ---------------------------------------------------------------- windows (bt-desk.js), statistics placement, widgets
  function onDeskChange(what) {
    if (!$('bt-panels-pop').hidden) DESK.renderMenu($('bt-panels-pop'));
    if (what === 'preset' || what === 'load' || what === 'reset') placeCells();
    if (R) later(function () {
      if (!R) return;
      views().forEach(function (v) { if (v.chart && v.el && !(v.chart.autoSizeActive && v.chart.autoSizeActive())) v.chart.applyOptions({ width: v.el.clientWidth, height: v.el.clientHeight }); });
      positionSplits(); updateNowBtn(); DRAW && DRAW.render();
      if (R.statsDirty) renderStats();
    }, 60);
  }
  function togglePop(name, on) {
    var p = $(name + '-pop'), b = $(name + '-btn'); if (!p) return;
    if (on === undefined) on = p.hidden;
    if (on) { if (name === 'bt-panels') { DESK.renderMenu(p); icons(); } else renderWidgetsMenu(); }
    p.hidden = !on; b.setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  function popCheck(box, attr, id, label, checked) {
    var l = el('label', 'bt-pop-check'), i = el('input'); i.type = 'checkbox'; i.checked = checked; i.setAttribute(attr, id);
    l.appendChild(i); l.appendChild(el('span', '', label)); box.appendChild(l);
  }
  function popBtn(box, act, icon, label) {
    var b = el('button', 'bt-pop-btn'); b.type = 'button'; b.setAttribute('data-act', act);
    var ic = el('i'); ic.setAttribute('data-lucide', icon); ic.setAttribute('aria-hidden', 'true'); b.appendChild(ic); b.appendChild(el('span', '', label));
    box.appendChild(b);
  }
  var WIDGET_LABELS = { kpis: ['backtest.st.w_kpis', 'Temel rakamlar'], balance: ['backtest.st.balance_curve_seq', 'Bakiye eğrisi (işlem sırasıyla)'], teaser: ['backtest.st.more', 'Gelişmiş analiz'],
    drawdown: ['backtest.st.drawdown', 'Drawdown (zirveden düşüş, %)'], rdist: ['backtest.st.r_dist', 'R dağılımı'], equity: ['backtest.st.w_equity', 'Varlık eğrisi (bölüm)'],
    sessions: ['backtest.st.sessions', 'Seanslara göre kazanma oranı (giriş saati)'], monthly: ['backtest.st.monthly', 'Aylık getiri (%)'] };
  function renderWidgetsMenu() {
    var box = $('bt-widgets-pop'), lay = window.WwBtStats.normalizeWidgets(DESK.widgets()); box.textContent = '';
    window.WwBtStats.widgetIds(can('backtestStats')).forEach(function (id) {
      popCheck(box, 'data-widget-toggle', id, _t(WIDGET_LABELS[id][0], WIDGET_LABELS[id][1]), lay.hidden.indexOf(id) < 0);
    });
    box.appendChild(el('div', 'bt-pop-sep'));
    popBtn(box, 'reset-widgets', 'rotate-ccw', _t('backtest.st.w_reset', 'Widget düzenini sıfırla'));
    icons();
  }
  function setWidget(id, on) {
    var lay = window.WwBtStats.normalizeWidgets(DESK.widgets());
    lay.hidden = lay.hidden.filter(function (x) { return x !== id; }); if (!on) lay.hidden.push(id);
    DESK.setWidgets(lay); renderStats();
  }
  // the statistics (bar, widgets, footer) live in their window or in the full-screen statistics view
  function placeStatsHost() {
    var host = $('bt-stats-host'); if (!host || !DESK) return;
    var slot = statsFs ? $('bt-stats-fs-slot') : $('bt-stats-slot');
    if (host.parentNode !== slot) slot.insertBefore(host, slot.firstChild);
    show($('bt-stats-fs-btn'), !statsFs);
    if (R) renderStats();
  }
  function openStatsFs(on) {
    on = !!on; if (on === statsFs && (on || $('bt-stats-fs').hidden)) return;
    statsFs = on;
    $('bt-stats-fs').hidden = !on;
    document.documentElement.classList.toggle('bt-stfs-lock', on);
    if (on && R && R.playing) pause();
    placeStatsHost();
    if (on) { try { $('bt-stats-fs-close').focus(); } catch (e) { /* ignore */ } } else if ($('bt-stats-fs-btn')) { try { $('bt-stats-fs-btn').focus(); } catch (e) { /* ignore */ } }
  }

  // ---------------------------------------------------------------- multi-chart grid: swap charts by their grip, resize each track
  function cellGrip() {
    var b = el('button', 'bt-grip bt-cell-grip'); b.type = 'button'; b.title = _t('backtest.multi.move', 'Grafiğin yerini değiştir (başka bir grafiğin üstüne sürükle)');
    b.setAttribute('aria-label', b.title);
    var i = el('i'); i.setAttribute('data-lucide', 'grip-vertical'); i.setAttribute('aria-hidden', 'true'); b.appendChild(i);
    return b;
  }
  function cellOf(v) { return v === R ? R.el.parentNode : v.cell; }
  // the main chart's cell gets a head (grip + timeframe) when there is more than one chart
  function mainHead(on) {
    var cell = R.el.parentNode, h = cell.querySelector('.bt-cell-head');
    if (!on) { if (h) h.remove(); return; }
    if (!h) { h = el('div', 'bt-cell-head bt-cell-head-main'); h.appendChild(cellGrip()); h.appendChild(el('span', 'bt-cell-tag bt-num')); cell.appendChild(h); icons(); }
    h.querySelector('.bt-cell-tag').textContent = (C.TF_LABEL[R.tfId] || R.tfId) + ' · ' + _t('backtest.multi.main', 'ana');
  }
  function layoutCells() {
    if (!R || !R.chart) return;
    var id = gridLayout(), box = $('bt-charts'), D = window.WwBtDesk, vs = views();
    Array.prototype.slice.call(box.querySelectorAll('.bt-msplit')).forEach(function (x) { x.remove(); });
    if (id === '1') { box.style.gridTemplateColumns = ''; box.style.gridTemplateRows = ''; vs.forEach(function (v) { cellOf(v).style.gridArea = ''; }); mainHead(false); return; }
    var m = DESK.multi(id);
    box.style.gridTemplateColumns = D.template(m.cols); box.style.gridTemplateRows = D.template(m.rows);
    vs.forEach(function (v, i) { cellOf(v).style.gridArea = D.cellArea(id, m, i); });
    mainHead(true);
    D.GRID[id].splits.forEach(function (sp, k) {
      var sEl = el('div', 'bt-msplit bt-msplit-' + sp.kind); sEl.setAttribute('data-msplit', String(k)); sEl.setAttribute('role', 'separator');
      sEl.setAttribute('aria-orientation', sp.kind === 'col' ? 'vertical' : 'horizontal'); sEl.title = _t('backtest.dock.resize', 'Boyutlandır (sürükle veya ok tuşları)');
      box.appendChild(sEl);
    });
    positionSplits();
  }
  function tracksPx(cs, prop) { return cs[prop].split(' ').map(parseFloat).filter(function (x) { return isFinite(x); }); }
  function positionSplits() {
    var box = $('bt-charts'); if (!box || !R || !LAY) return;
    var id = gridLayout(); if (id === '1') return;
    var cs = getComputedStyle(box), cols = tracksPx(cs, 'gridTemplateColumns'), rows = tracksPx(cs, 'gridTemplateRows');
    var g = parseFloat(cs.columnGap) || 6, rg = parseFloat(cs.rowGap) || 6;
    function off(tr, gap, i) { var x = 0; for (var k = 0; k < i; k++) x += tr[k] + gap; return x; }
    window.WwBtDesk.GRID[id].splits.forEach(function (sp, k) {
      var sEl = box.querySelector('[data-msplit="' + k + '"]'); if (!sEl) return;
      if (sp.kind === 'col') {
        var x = off(cols, g, sp.i + 1) - g / 2, t0 = off(rows, rg, sp.from - 1);
        sEl.style.left = (x - 5) + 'px'; sEl.style.width = '10px'; sEl.style.top = t0 + 'px'; sEl.style.height = Math.max(0, off(rows, rg, sp.to - 1) - rg - t0) + 'px';
      } else {
        var y = off(rows, rg, sp.i + 1) - rg / 2, l0 = off(cols, g, sp.from - 1);
        sEl.style.top = (y - 5) + 'px'; sEl.style.height = '10px'; sEl.style.left = l0 + 'px'; sEl.style.width = Math.max(0, off(cols, g, sp.to - 1) - g - l0) + 'px';
      }
    });
  }
  var cellDrag = null;
  function onChartsPointer(e) {
    if (e.button > 0 || !R || gridLayout() === '1' || !wideScreen()) return;
    var sp = e.target.closest('.bt-msplit'), grip = e.target.closest('.bt-cell-grip');
    if (!sp && !grip) return;
    e.preventDefault(); e.stopPropagation();
    var id = gridLayout(), m = DESK.multi(id), box = $('bt-charts'), cs = getComputedStyle(box);
    if (sp) {
      var spec = window.WwBtDesk.GRID[id].splits[+sp.getAttribute('data-msplit')], col = spec.kind === 'col';
      var px = tracksPx(cs, col ? 'gridTemplateColumns' : 'gridTemplateRows'), total = px.reduce(function (a, b) { return a + b; }, 0);
      cellDrag = { kind: 'split', id: id, spec: spec, col: col, x: e.clientX, y: e.clientY, start: (col ? m.cols : m.rows).slice(), m: m, total: total, el: sp };
      sp.classList.add('bt-split-active');
    } else {
      var cell = grip.closest('.bt-cell'), from = -1;
      views().forEach(function (v, i) { if (cellOf(v) === cell) from = i; });
      cellDrag = { kind: 'swap', id: id, from: from, m: m, cell: cell, over: null };
      cell.classList.add('bt-cell-moving');
    }
    $('bt-root').classList.add('bt-resizing');
    document.addEventListener('pointermove', onChartsMove); document.addEventListener('pointerup', onChartsUp); document.addEventListener('pointercancel', onChartsUp);
  }
  function onChartsMove(e) {
    var d = cellDrag; if (!d) return;
    var box = $('bt-charts');
    if (d.kind === 'split') {
      var tr = window.WwBtDesk.resizeTracks(d.start, d.spec.i, d.col ? e.clientX - d.x : e.clientY - d.y, d.total);
      if (d.col) { d.m.cols = tr; box.style.gridTemplateColumns = window.WwBtDesk.template(tr); } else { d.m.rows = tr; box.style.gridTemplateRows = window.WwBtDesk.template(tr); }
      positionSplits();
      return;
    }
    var t = document.elementFromPoint(e.clientX, e.clientY), c = t && t.closest('#bt-charts .bt-cell');
    if (d.over && d.over !== c) d.over.classList.remove('bt-cell-drop');
    d.over = c && c !== d.cell ? c : null;
    if (d.over) d.over.classList.add('bt-cell-drop');
  }
  function onChartsUp() {
    var d = cellDrag; cellDrag = null;
    document.removeEventListener('pointermove', onChartsMove); document.removeEventListener('pointerup', onChartsUp); document.removeEventListener('pointercancel', onChartsUp);
    $('bt-root').classList.remove('bt-resizing');
    if (!d) return;
    if (d.kind === 'split') { d.el.classList.remove('bt-split-active'); DESK.setMulti(d.id, d.m); return; }
    d.cell.classList.remove('bt-cell-moving');
    if (d.over) {
      d.over.classList.remove('bt-cell-drop');
      var to = -1; views().forEach(function (v, i) { if (cellOf(v) === d.over) to = i; });
      if (to >= 0 && d.from >= 0) { DESK.setMulti(d.id, window.WwBtDesk.swapViews(d.m, d.from, to)); layoutCells(); }
    }
  }
  function setupVisibility() {
    PAGE.on(document, 'visibilitychange', function () { if (document.hidden && R) { pause(); saveReplayTime(true); } });
    PAGE.on(window, 'pagehide', function () { if (R) saveReplayTime(true); });
  }
  function setupThemeObserver() {
    var last = document.body.classList.contains('light-theme');
    themeObserver = new MutationObserver(function () {
      var now = document.body.classList.contains('light-theme');
      if (now !== last) { last = now; rebuildChart(); renderStats(); }
    });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
  function setupI18n() {
    PAGE.onI18nChange(function () {
      requestAnimationFrame(function () {
        if (!PAGE.alive) return;
        fmtCache = {};
        refreshTips($('bt-account-modal'));
        if (R) {
          renderLive(true); renderTables(); renderStats(); setPlayUi(R.playing);
          views().forEach(function (v) { if (v.chart) v.chart.applyOptions({ localization: { locale: localeTag(), timeFormatter: crosshairTimeFor(v) }, timeScale: { tickMarkFormatter: tickLabelFor(v) } }); });
          rebuildMarkers(); renderLayoutPicker();
        if (FSEDIT) FSEDIT.relabel();
        } else if (L.store) renderList();
        if (L.store) renderPlan();
      });
    });
  }

  // ---------------------------------------------------------------- teardown
  function cleanup() {
    if (cleaned) return; cleaned = true;
    clearTimeout(bootTimer); clearTimeout(resizeTimer); clearTimeout(chipTimer); clearTimeout(planTimer); planSeq++;
    if (SYNC) { try { SYNC.cancelPending(); } catch (e) { /* ignore */ } }
    if (confirmResolve) { var cr = confirmResolve; confirmResolve = null; cr(false); }
    if (backResolve) { var br = backResolve; backResolve = null; br('cancel'); }
    if (R) { try { pause(); saveReplayTime(true); R.abort.abort(); R.token++; } catch (e) { /* ignore */ } }
    if (themeObserver) themeObserver.disconnect();
    try { destroyCharts(); } catch (e) { /* ignore */ }
    if (LAY) { try { LAY.destroy(); } catch (e) { /* ignore */ } }
    if (DESK) { try { DESK.destroy(); } catch (e) { /* ignore */ } }
    document.documentElement.classList.remove('bt-stfs-lock');
    if (DRAW) { try { DRAW.destroy(); } catch (e) { /* ignore */ } }
    clearTimeout(statsTimer);
    if (STATS) { try { STATS.destroy(); } catch (e) { /* ignore */ } }
    if (RANGE) { try { RANGE.destroy(); } catch (e) { /* ignore */ } RANGE = null; }
    if (FSEDIT) { try { FSEDIT.destroy(); } catch (e) { /* ignore */ } FSEDIT = null; }
    R = null; L.accounts = []; L.summaries = {}; L.cov = {}; L.srcs = {}; L.ct = null; L.brokerSyms = {}; L.ctForm = null; L.ctFormAccts = {}; ctSeq++;
  }
  PAGE.onLeave(cleanup);
  // browser smoke tests only (tests/smoke/make.py sets __BT_TEST__): read access to the chart and the drawings
  if (window.__BT_TEST__) PAGE.expose('__btTest', { chart: function () { return R && R.chart; }, series: function () { return R && R.series; },
    bars: function () { return R && R.bars; }, tfSec: function () { return R && R.tfMin * 60; }, draw: function () { return DRAW; }, R: function () { return R; }, desk: function () { return DESK; }, openWin: showWin, stats: function () { return STATS; } });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
