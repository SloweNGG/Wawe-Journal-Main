// ============================================================
// WwMt5 — MetaTrader 5 connection UI for the journals page (WaweSync EA + mt5-bridge).
//
//   enabled()            always true since the release (the old ?mt5=1 beta switch is gone)
//   fetchStatus(sb, ms)  get_mt5_status() with a timeout; on failure the last cached list (never an empty one)
//   mapByJournal(list)   { journalId: account }
//   accountState(a, now) 'waiting' (code entered, EA not seen yet) | 'online' (EA seen < 3 min) | 'offline'
//   barHtml(a, h)        the MT5 strip on a journal card (same look as the cTrader strip)
//   open(opts)           the connect window: 3 guided steps, 6 digit code, live "waiting -> connected"
//   disconnect(sb, id)   disconnect_mt5_account()
//
// The user never types an MT5 password: the EA shows a code on the chart, the user enters it here
// (claim_mt5_pairing), the EA receives its own token. Server side: supabase/functions/mt5-bridge.
// Pure parts are tested in tests/mt5-connect.test.js (vm, no DOM).
// ============================================================
(function (global) {
  'use strict';
  if (global.WwMt5) return;

  var BETA_KEY = 'ww_mt5_beta';
  var CACHE_KEY = 'ww_cached_mt5_accounts';
  var HOST = 'https://odasapyhtdopbnlfhwde.supabase.co';     // the EA's WebRequest allow-list entry
  var EA_URL = '/downloads/WaweSync.ex5';
  var ONLINE_MS = 3 * 60 * 1000;
  var POLL_MS = 3000;
  var WAIT_LIMIT_MS = 3 * 60 * 1000;

  // ------------------------------------------------------------------ helpers
  function store() { try { return global.localStorage || null; } catch (e) { return null; } }

  function t(key, fallback, params) {
    function fill(s) {
      if (typeof s !== 'string' || !params) return s;
      for (var k in params) s = s.split('{' + k + '}').join(String(params[k]));
      return s;
    }
    try {
      var v = global.i18n && typeof global.i18n.t === 'function' ? global.i18n.t(key, params) : key;
      return (v && v !== key) ? v : fill(fallback);
    } catch (e) { return fill(fallback); }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // MT5 is released (2026-11-09, EA tested end to end on a MetaQuotes demo account): always on. The beta switch
  // (?mt5=1 -> localStorage ww_mt5_beta) is gone; its leftover key is removed.
  function enabled(search, st) {
    st = st === undefined ? store() : st;
    try { if (st && st.getItem(BETA_KEY) !== null) st.removeItem(BETA_KEY); } catch (e) {}
    return true;
  }

  function normalizeCode(s) { return String(s == null ? '' : s).replace(/\D/g, '').slice(0, 6); }

  function claimErrorText(code) {
    switch (code) {
      case 'INVALID_CODE': return t('mt5.err.invalid_code', 'Kod hatalı ya da süresi dolmuş. Grafikte görünen güncel kodu girin.');
      case 'TOO_MANY_ATTEMPTS': return t('mt5.err.too_many', 'Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.');
      case 'INVALID_JOURNAL': return t('mt5.err.journal', 'Defter bulunamadı. Sayfayı yenileyip tekrar deneyin.');
      default: return t('mt5.err.generic', 'Bağlanamadı. Lütfen tekrar deneyin.');
    }
  }

  function accountState(a, now) {
    if (!a || !a.connected) return 'waiting';
    var seen = a.last_seen_at ? Date.parse(a.last_seen_at) : NaN;
    return (isFinite(seen) && (now - seen) < ONLINE_MS) ? 'online' : 'offline';
  }

  function mapByJournal(list) {
    var m = {};
    (Array.isArray(list) ? list : []).forEach(function (a) { if (a && a.journal_id) m[a.journal_id] = a; });
    return m;
  }

  function cached() {
    try {
      var v = JSON.parse((store() && store().getItem(CACHE_KEY)) || 'null');
      return Array.isArray(v) ? v : null;
    } catch (e) { return null; }
  }

  async function fetchStatus(sb, timeoutMs) {
    var fallback = { accounts: cached() || [], stale: true };
    if (!sb || typeof sb.rpc !== 'function') return fallback;
    try {
      var res = await Promise.race([
        sb.rpc('get_mt5_status'),
        new Promise(function (r) { setTimeout(function () { r(null); }, timeoutMs || 2000); }),
      ]);
      if (!res || res.error || !res.data || !Array.isArray(res.data.accounts)) return fallback;
      try { store() && store().setItem(CACHE_KEY, JSON.stringify(res.data.accounts)); } catch (e) {}
      return { accounts: res.data.accounts, stale: false };
    } catch (e) { return fallback; }
  }

  async function disconnect(sb, accountId) {
    var res = await sb.rpc('disconnect_mt5_account', { p_account_id: accountId });
    if (res && res.error) throw new Error(res.error.message);
    if (!res || !res.data || res.data.success !== true) throw new Error((res && res.data && res.data.error) || 'FAILED');
    return true;
  }

  // ------------------------------------------------------------------ journal card strip
  // h: { rel(iso) -> "5 dk önce", abs(iso) -> full date, balance(value, currency) -> text, now }
  function barHtml(a, h) {
    h = h || {};
    var now = h.now || Date.now();
    var rel = h.rel || function (iso) { return iso; };
    var abs = h.abs || function (iso) { return iso; };
    var state = accountState(a, now);
    var env = a.is_live === true ? 'Live' : (a.is_live === false ? 'Demo' : '');
    var stateHtml;
    if (state === 'online') {
      stateHtml = '<span class="mt5-state online" title="' + esc(t('mt5.card.online_tip', 'WaweSync çalışıyor; kapanan işlemler birkaç saniye içinde aktarılır.')) + '">' +
        '<i class="mt5-dot"></i>' + esc(t('mt5.card.online', 'Çevrimiçi')) + '</span>';
    } else if (state === 'offline') {
      stateHtml = '<span class="mt5-state offline" title="' + esc(t('mt5.card.offline_tip', 'MT5 kapalı ya da WaweSync grafikten kaldırılmış. MT5 açılınca aradaki işlemler de gönderilir.')) + '">' +
        '<i class="mt5-dot"></i>' + esc(t('mt5.card.offline', 'MT5 kapalı')) + '</span>';
    } else {
      stateHtml = '<span class="mt5-state waiting" title="' + esc(t('mt5.card.waiting_tip', 'Kod girildi; WaweSync\'in bağlanması bekleniyor. MT5 açık ve EA grafikte olmalı.')) + '">' +
        '<i class="mt5-dot"></i>' + esc(t('mt5.card.waiting', 'EA bekleniyor')) + '</span>';
    }
    var hasBal = a.balance !== null && a.balance !== undefined && isFinite(Number(a.balance));
    var balText = hasBal ? (h.balance ? h.balance(a.balance, a.currency) : String(a.balance)) : '—';
    var lastHtml = a.last_sync_at
      ? '<span class="ct-sync-state" title="' + esc(abs(a.last_sync_at)) + '">' + esc(t('mt5.card.last_check', 'Son kontrol')) + ' · <b>' + esc(rel(a.last_sync_at)) + '</b></span>'
      : (a.last_seen_at
        ? '<span class="ct-sync-state" title="' + esc(abs(a.last_seen_at)) + '">' + esc(t('mt5.card.last_seen', 'Son görülme')) + ' · <b>' + esc(rel(a.last_seen_at)) + '</b></span>'
        : '<span class="ct-sync-state">' + esc(t('mt5.card.never', 'Henüz veri gelmedi')) + '</span>');
    if (a.last_error) lastHtml = '<span class="ct-sync-state error" title="' + esc(a.last_error) + '">⚠ ' + esc(a.last_error) + '</span>';
    return '<div class="journal-card-ctrader-bar mt5-bar">' +
      '<img class="ct-logo" src="/images/platforms/mt5.png" alt="MetaTrader 5" width="22" height="22" />' +
      '<div class="ct-info">' +
        '<span class="ct-name">MetaTrader 5' + (env ? ' <em class="ct-env ' + (a.is_live ? 'live' : 'demo') + '">' + env + '</em>' : '') + '</span>' +
        '<span class="ct-login" title="' + esc((a.broker_name ? a.broker_name + ' · ' : '') + a.server) + '">#' + esc(a.login) + (a.broker_name ? ' · ' + esc(a.broker_name) : '') + '</span>' +
      '</div>' +
      stateHtml +
      '<div class="ct-meta">' +
        '<span class="ct-balance' + (hasBal ? '' : ' muted') + '" title="' + esc(a.balance_updated_at ? abs(a.balance_updated_at) : '') + '">' + esc(t('mt5.card.balance', 'Bakiye')) + ' <b>' + esc(balText) + '</b></span>' +
        lastHtml +
      '</div>' +
    '</div>';
  }

  // ------------------------------------------------------------------ connect window
  var ui = null;         // { overlay, body, foot, ... } built once
  var session = null;    // current open() call

  function copyText(text, btn) {
    function done(ok) {
      if (!btn) return;
      var old = btn.getAttribute('data-label') || btn.textContent;
      btn.setAttribute('data-label', old);
      btn.textContent = ok ? t('mt5.copied', 'Kopyalandı ✓') : t('mt5.copy_failed', 'Seçip kopyalayın');
      setTimeout(function () { btn.textContent = old; }, 1600);
    }
    try {
      if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
        return;
      }
    } catch (e) {}
    done(false);
  }

  function build() {
    if (ui) return ui;
    var doc = global.document;
    var overlay = doc.createElement('div');
    overlay.className = 'journal-modal-overlay mt5-overlay';
    overlay.id = 'mt5-modal';
    overlay.innerHTML =
      '<div class="journal-modal mt5-modal" role="dialog" aria-modal="true" aria-labelledby="mt5-title">' +
        '<div class="journal-modal-header">' +
          '<h3 id="mt5-title" class="mt5-title"><img src="/images/platforms/mt5.png" alt="" width="22" height="22" /><span></span></h3>' +
          '<button class="journal-modal-close" type="button" data-mt5-close aria-label="Close">×</button>' +
        '</div>' +
        '<div class="journal-modal-body mt5-body"></div>' +
      '</div>';
    doc.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.closest('[data-mt5-close]')) close();
    });
    ui = { overlay: overlay, title: overlay.querySelector('.mt5-title span'), body: overlay.querySelector('.mt5-body') };
    return ui;
  }

  function close() {
    if (session) { session.closed = true; if (session.timer) clearTimeout(session.timer); }
    if (ui) ui.overlay.classList.remove('active');
    var s = session;
    session = null;
    if (s && s.changed && typeof s.onDone === 'function') s.onDone();
  }

  function stepHtml(n, title, body) {
    return '<li class="mt5-step"><span class="mt5-step-n">' + n + '</span><div class="mt5-step-main">' +
      '<div class="mt5-step-title">' + esc(title) + '</div>' + body + '</div></li>';
  }

  function renderGuide() {
    var s = session;
    var journalName = s.journalName || '';
    var existing = s.accounts.filter(function (a) { return a.journal_id === s.journalId; })[0] || null;
    var others = s.accounts.filter(function (a) { return a.journal_id !== s.journalId; });
    ui.title.textContent = t('mt5.title', 'MetaTrader 5 bağla');

    var html = '<p class="mt5-lead">' + t('mt5.lead', '<b>{journal}</b> defterine MT5 hesabınızı bağlayın. Kapanan işlemleriniz kendiliğinden aktarılır.', { journal: esc(journalName) }) + '</p>';
    if (existing) {
      html += '<div class="mt5-note info">' + esc(t('mt5.existing', 'Bu deftere bağlı MT5 hesabı: #{login} ({broker}). Yeni bir kod girerseniz yerine o hesap bağlanır.', {
        login: existing.login, broker: existing.broker_name || existing.server })) + '</div>';
    }
    if (s.hasCtrader) {
      html += '<div class="mt5-note warn">' + esc(t('mt5.ct_conflict', 'Bu deftere bir cTrader hesabı da bağlı. İki hesabın işlemleri aynı defterde toplanır.')) + '</div>';
    }

    html += '<ol class="mt5-steps">';
    html += stepHtml(1, t('mt5.s1.title', 'WaweSync\'i MT5\'e ekleyin'),
      '<p>' + esc(t('mt5.s1.text', 'Dosyayı indirin. MT5\'te Dosya → Veri Klasörünü Aç → MQL5 → Experts klasörüne kopyalayın, sonra soldaki Gezgin\'de Expert Advisors\'a sağ tıklayıp Yenile\'ye basın.')) + '</p>' +
      '<a class="mt5-btn ghost" href="' + EA_URL + '" download data-mt5-download>⬇ ' + esc(t('mt5.s1.download', 'WaweSync\'i indir')) + '</a>');
    html += stepHtml(2, t('mt5.s2.title', 'İnternet iznini verin (bir kez)'),
      '<p>' + esc(t('mt5.s2.text', 'Araçlar → Seçenekler → Expert Advisors (Uzman Danışmanlar) sekmesinde "Listelenen URL\'ler için WebRequest\'e izin ver" kutusunu işaretleyin ve bu adresi ekleyin:')) + '</p>' +
      '<div class="mt5-copy"><code>' + esc(HOST) + '</code><button type="button" class="mt5-btn small" data-mt5-copy>' + esc(t('mt5.copy', 'Kopyala')) + '</button></div>');
    html += stepHtml(3, t('mt5.s3.title', 'Bir grafiğe sürükleyin'),
      '<p>' + esc(t('mt5.s3.text', 'Gezgin\'deki WaweSync\'i herhangi bir grafiğin üzerine sürükleyip Tamam\'a basın. Grafikte 6 haneli bir kod belirir.')) + '</p>');
    html += stepHtml(4, t('mt5.s4.title', 'Kodu buraya girin'),
      '<form class="mt5-code-form" data-mt5-form autocomplete="off">' +
        '<input class="mt5-code" data-mt5-code inputmode="numeric" pattern="[0-9 ]*" maxlength="7" placeholder="000 000" aria-label="' + esc(t('mt5.s4.title', 'Kodu buraya girin')) + '" />' +
        '<button type="submit" class="mt5-btn primary" data-mt5-submit disabled>' + esc(t('mt5.connect', 'Bağla')) + '</button>' +
      '</form>' +
      '<div class="mt5-err" data-mt5-err hidden></div>');
    html += '</ol>';

    html += '<div class="mt5-note safe">🔒 ' + esc(t('mt5.safe', 'WaweSync yalnızca işlem geçmişinizi okur: işlem açamaz, kapatamaz ve MT5 şifrenizi istemez.')) + '</div>';

    if (others.length) {
      html += '<div class="mt5-others"><div class="mt5-others-title">' + esc(t('mt5.others', 'Daha önce bağladığınız MT5 hesapları')) + '</div>';
      others.forEach(function (a) {
        var where = a.journal_name
          ? t('mt5.others_linked', '"{name}" defterinde', { name: a.journal_name })
          : t('mt5.others_free', 'Bir deftere bağlı değil');
        html += '<div class="mt5-other"><div><b>#' + esc(a.login) + '</b> <span>' + esc(a.broker_name || a.server) + '</span><small>' + esc(where) + '</small></div>' +
          '<button type="button" class="mt5-btn small" data-mt5-link="' + esc(a.id) + '" data-mt5-from="' + esc(a.journal_name || '') + '">' + esc(t('mt5.link_here', 'Bu deftere bağla')) + '</button></div>';
      });
      html += '</div>';
    }

    html += '<details class="mt5-help"><summary>' + esc(t('mt5.help.title', 'Takıldınız mı?')) + '</summary><ul>' +
      '<li>' + esc(t('mt5.help.permission', 'Grafikte kod yerine "İzin gerekli" yazıyorsa 2. adımdaki adresi ekleyin.')) + '</li>' +
      '<li>' + esc(t('mt5.help.navigator', 'WaweSync listede görünmüyorsa Gezgin\'de sağ tıklayıp Yenile\'ye basın ya da MT5\'i yeniden başlatın.')) + '</li>' +
      '<li>' + esc(t('mt5.help.expired', 'Kodun süresi 15 dakika; dolunca grafikte kendiliğinden yenisi çıkar.')) + '</li>' +
      '<li>' + esc(t('mt5.help.mobile', 'Telefondaki MT5 uygulamasında EA çalışmaz; WaweSync\'i bilgisayardaki ya da VPS\'teki MT5\'e ekleyin.')) + '</li>' +
      '</ul></details>';

    ui.body.innerHTML = html;
    wireGuide();
  }

  function wireGuide() {
    var body = ui.body;
    var input = body.querySelector('[data-mt5-code]');
    var submit = body.querySelector('[data-mt5-submit]');
    var form = body.querySelector('[data-mt5-form]');
    var copyBtn = body.querySelector('[data-mt5-copy]');
    if (copyBtn) copyBtn.addEventListener('click', function () { copyText(HOST, copyBtn); });
    if (input) {
      input.addEventListener('input', function () {
        var c = normalizeCode(input.value);
        input.value = c.length > 3 ? c.slice(0, 3) + ' ' + c.slice(3) : c;
        submit.disabled = c.length !== 6;
        showError('');
      });
      setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
    }
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); claim(normalizeCode(input.value)); });
    body.querySelectorAll('[data-mt5-link]').forEach(function (b) {
      b.addEventListener('click', function () { linkExisting(b.getAttribute('data-mt5-link'), b.getAttribute('data-mt5-from'), b); });
    });
  }

  function showError(msg) {
    var el = ui && ui.body.querySelector('[data-mt5-err]');
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  async function claim(code) {
    var s = session;
    if (!s || code.length !== 6) return;
    var submit = ui.body.querySelector('[data-mt5-submit]');
    if (submit) { submit.disabled = true; submit.textContent = t('mt5.connecting', 'Bağlanıyor…'); }
    try {
      var res = await s.sb.rpc('claim_mt5_pairing', { p_code: code, p_journal_id: s.journalId });
      if (s.closed) return;
      if (res && res.error) throw new Error(res.error.message);
      var d = res && res.data;
      if (!d || d.success !== true) {
        showError(claimErrorText(d && d.error));
        if (submit) { submit.disabled = false; submit.textContent = t('mt5.connect', 'Bağla'); }
        return;
      }
      s.changed = true;
      s.accountId = d.account_id;
      s.claimedAt = Date.now();
      renderWaiting(d);
      poll();
    } catch (err) {
      if (s.closed) return;
      showError(claimErrorText('') + (err && err.message ? ' (' + err.message + ')' : ''));
      if (submit) { submit.disabled = false; submit.textContent = t('mt5.connect', 'Bağla'); }
    }
  }

  async function linkExisting(accountId, fromJournal, btn) {
    var s = session;
    if (!s || !accountId) return;
    if (fromJournal && !global.confirm(t('mt5.move_confirm', 'Bu hesap "{name}" defterinden ayrılıp bu deftere bağlanacak. Devam edilsin mi?', { name: fromJournal }))) return;
    if (btn) btn.disabled = true;
    try {
      var res = await s.sb.rpc('link_mt5_account', { p_account_id: accountId, p_journal_id: s.journalId });
      if (res && res.error) throw new Error(res.error.message);
      if (!res || !res.data || res.data.success !== true) throw new Error((res && res.data && res.data.error) || 'FAILED');
      s.changed = true;
      if (global.showToast) global.showToast(t('mt5.linked_toast', 'MT5 hesabı bu deftere bağlandı. Geçmiş işlemler birkaç dakika içinde aktarılır.'), 'success');
      close();
    } catch (err) {
      if (btn) btn.disabled = false;
      if (global.showToast) global.showToast(t('mt5.err.generic', 'Bağlanamadı. Lütfen tekrar deneyin.') + (err && err.message ? ' (' + err.message + ')' : ''), 'error');
    }
  }

  function renderWaiting(claimData, phase, acc) {
    phase = phase || 'token';
    var steps = [
      ['code', t('mt5.w.code', 'Kod doğrulandı'), true],
      ['token', t('mt5.w.token', 'WaweSync bağlanıyor'), phase !== 'token'],
      ['sync', t('mt5.w.sync', 'İşlemler aktarılıyor'), phase === 'done'],
    ];
    var info = claimData ? ('#' + esc(claimData.login) + (claimData.broker_name ? ' · ' + esc(claimData.broker_name) : '')) : '';
    var html = '<div class="mt5-wait">' +
      '<div class="mt5-wait-acc">' + info + '</div>' +
      '<ul class="mt5-wait-steps">' + steps.map(function (x) {
        var cls = x[2] ? 'done' : (x[0] === phase ? 'active' : '');
        return '<li class="' + cls + '"><span class="mt5-wait-ic"></span>' + esc(x[1]) + '</li>';
      }).join('') + '</ul>';
    if (phase === 'done') {
      html += '<div class="mt5-note ok">' + esc(t('mt5.w.done', 'Bağlandı! Son 90 günün kapanmış işlemleri ve bundan sonra kapanan her işlem bu deftere otomatik aktarılır.')) + '</div>' +
        '<button type="button" class="mt5-btn primary wide" data-mt5-close>' + esc(t('mt5.done', 'Tamam')) + '</button>';
    } else if (phase === 'slow') {
      html += '<div class="mt5-note warn">' + esc(t('mt5.w.slow', 'WaweSync henüz bağlanmadı. MT5 açık mı ve EA grafikte mi? Bağlanınca defter kartında "Çevrimiçi" yazar; bu pencereyi kapatabilirsiniz.')) + '</div>' +
        '<button type="button" class="mt5-btn ghost wide" data-mt5-close>' + esc(t('mt5.close', 'Kapat')) + '</button>';
    } else {
      html += '<p class="mt5-wait-hint">' + esc(t('mt5.w.hint', 'Birkaç saniye sürer. Grafikteki panel "Bağlı ✓" olarak değişecek.')) + '</p>';
    }
    html += '</div>';
    ui.body.innerHTML = html;
    session.claimData = claimData;
  }

  async function poll() {
    var s = session;
    if (!s || s.closed) return;
    var r = await fetchStatus(s.sb, 4000);
    if (!session || session !== s || s.closed) return;
    var acc = (r.accounts || []).filter(function (a) { return a.id === s.accountId; })[0];
    var phase = 'token';
    if (acc && acc.connected) phase = acc.last_sync_at && Date.parse(acc.last_sync_at) >= s.claimedAt - 5000 ? 'done' : 'sync';
    if (phase !== 'done' && Date.now() - s.claimedAt > WAIT_LIMIT_MS) phase = 'slow';
    renderWaiting(s.claimData, phase, acc);
    if (phase === 'done' || phase === 'slow') return;
    s.timer = setTimeout(poll, POLL_MS);
  }

  // opts: { sb, journalId, journalName, accounts (get_mt5_status list), hasCtrader, onDone }
  function open(opts) {
    if (!opts || !opts.journalId) return;
    if (session) close();
    build();
    session = {
      sb: opts.sb || global.sb, journalId: opts.journalId, journalName: opts.journalName || '',
      accounts: Array.isArray(opts.accounts) ? opts.accounts : (cached() || []),
      hasCtrader: !!opts.hasCtrader, onDone: opts.onDone, changed: false, closed: false,
    };
    renderGuide();
    ui.overlay.classList.add('active');
  }

  global.WwMt5 = {
    HOST: HOST, EA_URL: EA_URL,
    enabled: enabled, normalizeCode: normalizeCode, claimErrorText: claimErrorText, accountState: accountState,
    mapByJournal: mapByJournal, fetchStatus: fetchStatus, cached: cached, disconnect: disconnect,
    barHtml: barHtml, open: open, close: close,
  };
})(typeof window !== 'undefined' ? window : this);
