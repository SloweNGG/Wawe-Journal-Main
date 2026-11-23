// Hızlı ekleme bu sayfada kullanılabilir mi? SPA geçişinde pencere body'de kalıyor ama
// quick-add kullanmayan sayfada gizli (bkz. SpaRouter.astro, body[data-quick-add])
function wwQuickAddReady() {
  var open = window.quickAddOpen;
  if (typeof open !== 'function') return false;
  // Gecikmeli yüklemede (quick-add-boot.js) pencere ilk açılışta kurulur; o ana kadar overlay yoktur
  if (!open.__wwLazy && !document.getElementById('quick-add-overlay')) return false;
  var spa = !!document.querySelector('meta[name="astro-view-transitions-enabled"]');
  return !spa || document.body.hasAttribute('data-quick-add');
}

// Yeni işlem: bu sayfada hızlı ekleme penceresi varsa onu açar, yoksa işlem ekleme sayfasına gider
function wwOpenAddTrade() {
  if (wwQuickAddReady()) {
    window.quickAddOpen();
    return;
  }
  if (window.PageTransition && typeof window.PageTransition.exit === 'function') window.PageTransition.exit('/add-trade');
  else window.location.href = '/add-trade';
}
window.wwOpenAddTrade = wwOpenAddTrade;

// Sayfada açık (görünür) bir pencere var mı? Kapalı pencereler DOM'da kalır ve role="dialog" aria-modal="true"
// taşır: yükseltme penceresi (.ww-up-modal, display:none kapsayıcıda) ve Hızlı Ekle'nin tarih seçicisi
// (#qa-date-picker, visibility:hidden + opacity:0) "N" kısayolunu hep engelliyordu. Yalnızca görünen pencere sayılır.
function wwDialogVisible(el) {
  if (typeof el.checkVisibility === 'function') return el.checkVisibility({ visibilityProperty: true, opacityProperty: true });
  if (!el.getClientRects().length) return false;
  var cs = window.getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.opacity !== '0';
}

function wwOpenModalDialog() {
  var list = document.querySelectorAll('.quick-add-overlay.active, [role="dialog"][aria-modal="true"]:not([hidden])');
  for (var i = 0; i < list.length; i++) {
    if (wwDialogVisible(list[i])) return list[i];
  }
  return null;
}

function wwIsProCached() {
  var plan = sessionStorage.getItem('ww_user_plan') || localStorage.getItem('ww_user_plan') || localStorage.getItem('ww_cached_plan');
  return plan === 'premium' || (window.__wwUserProfile && window.__wwUserProfile.plan === 'premium') ||
    (window.SETTINGS_STATE && window.SETTINGS_STATE.isPro === true);
}

function closeAllNavDropdowns(except) {
  // 1. Pro dropdown
  if (except !== 'pro') {
    var pMenu = document.getElementById('pro-dropdown-menu');
    var pBtn = document.getElementById('pro-dropdown-btn');
    if (pMenu) pMenu.classList.remove('open');
    if (pBtn) pBtn.classList.remove('active');
  }

  // 2. Journal switcher
  if (except !== 'journal') {
    var js = document.getElementById('nav-journal-switcher');
    if (js) js.classList.remove('open');
  }

  // 3. Bell notification panel
  if (except !== 'bell') {
    var bell = document.getElementById('bell-panel');
    var bellBtn = document.getElementById('overtrade-bell-btn');
    if (bell) bell.classList.remove('open');
    if (bellBtn) bellBtn.classList.remove('active');
  }

  // 4. User avatar dropdown
  if (except !== 'avatar') {
    var av = document.getElementById('dropdown-menu');
    var avBtn = document.getElementById('user-avatar');
    if (av) av.classList.remove('show');
    if (avBtn) avBtn.classList.remove('active');
  }

  // 5. Mobile menu
  if (except !== 'mobile') {
    var toggle = document.getElementById('nav-toggle');
    var menu = document.getElementById('nav-menu');
    var backdrop = document.getElementById('nav-backdrop');
    if (toggle) toggle.classList.remove('open');
    if (menu) menu.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    document.body.style.overflow = '';
  }
}
window.closeAllNavDropdowns = closeAllNavDropdowns;

window.wwTogglePro = function(e, btn) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  var m = document.getElementById('pro-dropdown-menu');
  var b = btn || document.getElementById('pro-dropdown-btn');
  var willOpen = m ? !m.classList.contains('open') : false;
  closeAllNavDropdowns(willOpen ? 'pro' : null);
  if (m) {
    m.classList.toggle('open', willOpen);
    if (b) b.classList.toggle('active', willOpen);
  }
};

window.wwToggleJournal = function(e, btn) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  var js = document.getElementById('nav-journal-switcher');
  var willOpen = js ? !js.classList.contains('open') : false;
  closeAllNavDropdowns(willOpen ? 'journal' : null);
  if (js) {
    js.classList.toggle('open', willOpen);
  }
};

// Görülen okunmamış bildirimler: panel açılınca kaydedilir, rozetin yanıp sönmesi durur.
// Yeni (görülmemiş) bir okunmamış bildirim gelince yeniden başlar. Tarayıcıda saklanır,
// böylece her sayfa açılışında baştan yanıp sönmez.
var BELL_SEEN_KEY = 'ww_bell_seen_ids';
function wwBellSeenSet() {
  try {
    var arr = JSON.parse(localStorage.getItem(BELL_SEEN_KEY) || '[]');
    var set = {};
    (Array.isArray(arr) ? arr : []).forEach(function(id) { set[id] = true; });
    return set;
  } catch (e) { return {}; }
}
function wwMarkBellSeen() {
  var unread = (window._allNotifications || []).filter(function(n) { return !n.is_read && n.id != null; });
  try {
    var ids = Object.keys(wwBellSeenSet()).concat(unread.map(function(n) { return String(n.id); }));
    var uniq = ids.filter(function(id, i) { return ids.indexOf(id) === i; }).slice(-300);
    localStorage.setItem(BELL_SEEN_KEY, JSON.stringify(uniq));
  } catch (e) {}
  var badge = document.getElementById('bell-badge');
  if (badge) badge.classList.remove('is-live');
}

window.wwToggleBell = function(e, btn) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  var p = document.getElementById('bell-panel');
  var b = btn || document.getElementById('overtrade-bell-btn');
  var willOpen = p ? !p.classList.contains('open') : false;
  closeAllNavDropdowns(willOpen ? 'bell' : null);
  if (p) {
    p.classList.toggle('open', willOpen);
    if (b) b.classList.toggle('active', willOpen);
    if (willOpen) wwMarkBellSeen();
    if (willOpen && window._wwBellView === 'prefs') wwSetBellView('list');
    if (willOpen && typeof window.loadNotifications === 'function') {
      window.loadNotifications();
    }
  }
};

window.wwToggleAvatar = function(e, btn) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  var d = document.getElementById('dropdown-menu');
  var b = btn || document.getElementById('user-avatar');
  var willOpen = d ? !d.classList.contains('show') : false;
  closeAllNavDropdowns(willOpen ? 'avatar' : null);
  if (d) {
    d.classList.toggle('show', willOpen);
    if (b) b.classList.toggle('active', willOpen);
  }
};

window.wwNotifTab = 'all';
window._allNotifications = [];

window.wwGoToOvertradeSettings = function(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  var panel = document.getElementById('bell-panel');
  if (panel) panel.classList.remove('open');

  if (window.location.pathname.indexOf('settings') !== -1) {
    if (typeof window.switchPanel === 'function') {
      window.switchPanel('panel-overtrade');
    } else {
      window.location.hash = 'panel-overtrade';
    }
  } else {
    window.location.href = '/settings#panel-overtrade';
  }
};

window.wwSwitchNotifTab = function(tabName) {
  window.wwNotifTab = tabName || 'all';
  var buttons = document.querySelectorAll('.bell-tab-btn');
  buttons.forEach(function(btn) {
    if (btn.getAttribute('data-tab') === window.wwNotifTab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  if (typeof window.renderNotifications === 'function') {
    window.renderNotifications();
  }
};

function getDismissedClientNotifs() {
  try {
    return JSON.parse(localStorage.getItem('ww_dismissed_client_notifs') || '[]');
  } catch (e) {
    return [];
  }
}

function dismissClientNotif(id) {
  try {
    var list = getDismissedClientNotifs();
    if (!list.includes(id)) {
      list.push(id);
      // en yeni 500 anahtar yeter (eskiler artık hiç üretilmeyen günlerin overtrade anahtarları)
      localStorage.setItem('ww_dismissed_client_notifs', JSON.stringify(list.slice(-500)));
    }
  } catch (e) {}
  wwQueueServerRead(id);
}

function isClientNotifDismissed(id) {
  if (id && _wwSrvReads.set[String(id)]) return true;
  return getDismissedClientNotifs().includes(id);
}

// ── Tarayıcının ürettiği bildirimlerin (ot_*, prem_*, pay_*) okundu bilgisi hesapta ──────────────
// public.notification_reads (202611230003). Eskiden yalnızca localStorage'daydı: başka cihaz/tarayıcıda,
// PWA'da, gizli pencerede ya da Safari site verisini silince hepsi yeniden "okunmamış" çıkıyordu.
// Tablo yoksa (migration uygulanmamış) sessizce yalnızca localStorage ile çalışır.
var WW_READ_KEY_RE = /^(ot|prem|pay)_[A-Za-z0-9_.:-]{1,100}$/;
var WW_READ_KEEP_DAYS = 120;
var _wwSrvReads = { uid: null, set: {}, loadedAt: 0, ok: false, unavailable: false, promise: null, migrated: false };
var _wwSrvReadQueue = [];
var _wwSrvReadTimer = null;

function wwNotifSb() { return window.sb || window.supabase; }
function wwNotifUid() {
  var u = window.SETTINGS_STATE && window.SETTINGS_STATE.currentUser;
  return (u && u.id) || null;
}

function wwLoadServerReads(sb, uid, force) {
  if (!sb || !uid) return Promise.resolve(_wwSrvReads.set);
  if (_wwSrvReads.uid !== uid) {
    _wwSrvReads = { uid: uid, set: {}, loadedAt: 0, ok: false, unavailable: false, promise: null, migrated: false };
  }
  if (_wwSrvReads.unavailable) return Promise.resolve(_wwSrvReads.set);
  if (!force && Date.now() - _wwSrvReads.loadedAt < 60000) return Promise.resolve(_wwSrvReads.set);
  if (_wwSrvReads.promise) return _wwSrvReads.promise;
  var state = _wwSrvReads;
  var since = new Date(Date.now() - WW_READ_KEEP_DAYS * 864e5).toISOString();
  state.promise = Promise.resolve(
    sb.from('notification_reads').select('notif_key').eq('user_id', uid).gte('read_at', since).limit(1000)
  ).then(function(res) {
    if (res && res.error) {
      var code = res.error.code || '';
      // tablo yok (migration uygulanmamış): bu oturumda bir daha sorma
      if (code === '42P01' || code === 'PGRST205' || code === 'PGRST204') state.unavailable = true;
    } else if (res && Array.isArray(res.data)) {
      res.data.forEach(function(r) { if (r && r.notif_key) state.set[r.notif_key] = true; });
      state.ok = true;
      wwMigrateLocalReads(sb, uid);
      wwPruneServerReads(sb, uid, since);
    }
    return state.set;
  }, function() { return state.set; }).then(function(set) {
    state.loadedAt = Date.now();
    state.promise = null;
    return set;
  });
  return state.promise;
}

function wwQueueServerRead(id) {
  var key = id == null ? '' : String(id);
  if (!WW_READ_KEY_RE.test(key) || _wwSrvReads.set[key]) return;
  _wwSrvReads.set[key] = true;
  if (_wwSrvReadQueue.indexOf(key) === -1) _wwSrvReadQueue.push(key);
  if (_wwSrvReadTimer) return;
  _wwSrvReadTimer = setTimeout(wwFlushServerReads, 250);
}

async function wwFlushServerReads() {
  _wwSrvReadTimer = null;
  var keys = _wwSrvReadQueue.splice(0, 200);
  if (!keys.length || _wwSrvReads.unavailable) return;
  var sb = wwNotifSb();
  var uid = wwNotifUid();
  if (!uid && sb && sb.auth) {
    try { var s = await sb.auth.getSession(); uid = s && s.data && s.data.session && s.data.session.user && s.data.session.user.id; } catch (e) {}
  }
  if (!sb || !uid) return;
  try {
    var res = await sb.from('notification_reads').upsert(
      keys.map(function(k) { return { user_id: uid, notif_key: k }; }),
      { onConflict: 'user_id,notif_key', ignoreDuplicates: true }
    );
    if (res && res.error) {
      var code = res.error.code || '';
      if (code === '42P01' || code === 'PGRST205' || code === 'PGRST204') _wwSrvReads.unavailable = true;
      else console.warn('🔔 notification_reads yazılamadı:', res.error);
    }
  } catch (e) {
    console.warn('🔔 notification_reads yazılamadı:', e);
  }
  if (_wwSrvReadQueue.length && !_wwSrvReadTimer) _wwSrvReadTimer = setTimeout(wwFlushServerReads, 250);
}

// Bu tarayıcıda önceden okunmuş (localStorage) anahtarları bir kez hesaba taşı; böylece diğer cihazlar da görür
function wwMigrateLocalReads(sb, uid) {
  if (_wwSrvReads.migrated) return;
  _wwSrvReads.migrated = true;
  try {
    var flag = 'ww_notif_reads_migrated_' + uid;
    if (localStorage.getItem(flag)) return;
    var local = getDismissedClientNotifs();
    var ot = [];
    try { ot = JSON.parse(localStorage.getItem('ww_overtrade_dismissed_v2') || '[]'); } catch (e) {}
    var cutoff = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
    local.concat(Array.isArray(ot) ? ot : []).forEach(function(k) {
      k = String(k || '');
      if (!WW_READ_KEY_RE.test(k)) return;
      // overtrade anahtarlarının sonu gün: yalnızca son 14 günün anahtarları işe yarar
      var m = /^ot_.*?(\d{4}-\d{2}-\d{2})$/.exec(k);
      if (m && m[1] < cutoff) return;
      wwQueueServerRead(k);
    });
    localStorage.setItem(flag, '1');
  } catch (e) {}
}

// 120 günden eski anahtarlar bir işe yaramaz: oturum başına bir kez temizlenir
function wwPruneServerReads(sb, uid, since) {
  try {
    var flag = 'ww_notif_reads_pruned_' + uid;
    if (sessionStorage.getItem(flag)) return;
    sessionStorage.setItem(flag, '1');
    Promise.resolve(sb.from('notification_reads').delete().eq('user_id', uid).lt('read_at', since)).catch(function() {});
  } catch (e) {}
}

// Bu sayfada okundu yapılan sunucu bildirimleri: henüz yazılmamışken gelen bir yükleme
// (realtime, zil açılışı, overtrade güncellemesi) onları yeniden okunmamış göstermesin
var _wwReadOverlay = {};
var _wwMarkAllAt = 0;
var _wwNotifLoadSeq = 0;

// ── Bildirim kategorileri ve tercihleri ──────────────────────────────────────────────────────────
// risk (overtrade, günlük kayıp, sunucu uyarıları) · coach_alert (AI koç canlı uyarıları: coach_settings.alerts_enabled,
// kapatılınca sunucu üretmez) · coach (haftalık rapor, söz hatırlatmaları) · partner (başvuru, ödeme talepleri) ·
// system (duyurular) · account (Pro süresi, ödemeler: her zaman açık).
// Diğerleri user_profiles.notification_prefs (202611230004) içinde; yoksa bu tarayıcıda (localStorage) tutulur.
var WW_NOTIF_PREF_CATS = ['risk', 'coach_alert', 'coach', 'partner', 'system', 'account'];
var _wwNotifPrefs = { uid: null, prefs: {}, coachAlerts: null, loadedAt: 0, colMissing: false, promise: null };

function wwNotifPrefsLocalKey(uid) { return 'ww_notif_prefs_' + uid; }
function wwNotifPrefsReadLocal(uid) {
  try { var v = JSON.parse(localStorage.getItem(wwNotifPrefsLocalKey(uid)) || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; }
}
function wwNotifPrefsWriteLocal() {
  if (!_wwNotifPrefs.uid) return;
  try { localStorage.setItem(wwNotifPrefsLocalKey(_wwNotifPrefs.uid), JSON.stringify({ prefs: _wwNotifPrefs.prefs, coachAlerts: _wwNotifPrefs.coachAlerts })); } catch (e) {}
}
function wwCleanNotifPrefs(p) {
  var out = {};
  if (!p || typeof p !== 'object') return out;
  ['risk', 'coach', 'partner', 'system'].forEach(function(k) { if (p[k] === false) out[k] = false; });
  if (typeof p.ts === 'number') out.ts = p.ts;
  return out;
}

function wwNotifPrefOn(cat) {
  if (!cat || cat === 'account') return true;
  if (cat === 'coach_alert') return _wwNotifPrefs.coachAlerts !== false;
  return _wwNotifPrefs.prefs[cat] !== false;
}

function wwLoadNotifPrefs(sb, uid, force) {
  if (!sb || !uid) return Promise.resolve();
  if (_wwNotifPrefs.uid !== uid) {
    var local = wwNotifPrefsReadLocal(uid) || {};
    _wwNotifPrefs = { uid: uid, prefs: wwCleanNotifPrefs(local.prefs), coachAlerts: local.coachAlerts === false ? false : null, loadedAt: 0, colMissing: false, promise: null };
  }
  if (!force && Date.now() - _wwNotifPrefs.loadedAt < 60000) return Promise.resolve();
  if (_wwNotifPrefs.promise) return _wwNotifPrefs.promise;
  var st = _wwNotifPrefs;
  var pProfile = Promise.resolve(sb.from('user_profiles').select('notification_prefs').eq('id', uid).maybeSingle()).then(function(r) {
    if (r && r.error) { if (/notification_prefs/.test(r.error.message || '') || r.error.code === '42703') st.colMissing = true; return; }
    var remote = r && r.data ? r.data.notification_prefs : null;
    if (remote && typeof remote === 'object') {
      var clean = wwCleanNotifPrefs(remote);
      // bu tarayıcıda daha yeni bir değişiklik (ör. yazım başarısız olduysa) varsa o kalır
      if (!(st.prefs.ts && clean.ts && st.prefs.ts > clean.ts)) st.prefs = clean;
    }
  }, function() {});
  var pCoach = Promise.resolve(sb.from('coach_settings').select('alerts_enabled').eq('user_id', uid).maybeSingle()).then(function(r) {
    if (r && !r.error) st.coachAlerts = (r.data && r.data.alerts_enabled === false) ? false : true;
  }, function() {});
  st.promise = Promise.all([pProfile, pCoach]).then(function() {
    st.loadedAt = Date.now();
    st.promise = null;
    wwNotifPrefsWriteLocal();
  });
  return st.promise;
}

async function wwSetNotifPref(cat, on) {
  if (WW_NOTIF_PREF_CATS.indexOf(cat) === -1 || cat === 'account') return;
  var sb = wwNotifSb();
  var uid = _wwNotifPrefs.uid || wwNotifUid();
  if (!uid && sb && sb.auth) {
    try { var s = await sb.auth.getSession(); uid = s && s.data && s.data.session && s.data.session.user && s.data.session.user.id; } catch (e) {}
  }
  if (!uid) return;
  if (_wwNotifPrefs.uid !== uid) await wwLoadNotifPrefs(sb, uid);
  var prev = cat === 'coach_alert' ? _wwNotifPrefs.coachAlerts : _wwNotifPrefs.prefs[cat];
  if (cat === 'coach_alert') {
    _wwNotifPrefs.coachAlerts = !!on;
  } else {
    var next = Object.assign({}, _wwNotifPrefs.prefs);
    if (on) delete next[cat]; else next[cat] = false;
    next.ts = Date.now();
    _wwNotifPrefs.prefs = next;
  }
  wwNotifPrefsWriteLocal();
  if (typeof window.renderNotifications === 'function') window.renderNotifications();

  var err = null;
  try {
    if (cat === 'coach_alert') {
      var r1 = await sb.from('coach_settings').upsert({ user_id: uid, alerts_enabled: !!on }, { onConflict: 'user_id' });
      err = r1 && r1.error;
    } else if (!_wwNotifPrefs.colMissing) {
      var payload = Object.assign({ v: 1 }, _wwNotifPrefs.prefs);
      var r2 = await sb.from('user_profiles').update({ notification_prefs: payload }).eq('id', uid);
      err = r2 && r2.error;
      if (err && (/notification_prefs/.test(err.message || '') || err.code === '42703')) { _wwNotifPrefs.colMissing = true; err = null; }
    }
  } catch (e) { err = e; }

  if (err) {
    console.warn('🔔 Bildirim tercihi kaydedilemedi:', err);
    if (cat === 'coach_alert') _wwNotifPrefs.coachAlerts = prev;
    else { var back = Object.assign({}, _wwNotifPrefs.prefs); if (prev === false) back[cat] = false; else delete back[cat]; _wwNotifPrefs.prefs = back; }
    wwNotifPrefsWriteLocal();
    if (typeof showToast === 'function') showToast(t('noti.prefs_save_error', 'Tercih kaydedilemedi. Birazdan tekrar dene.'), 'error');
    if (typeof window.renderNotifications === 'function') window.renderNotifications();
    return;
  }
  // kapatılan kategori listeden çıkar, açılan geri gelir
  _wwNotifPrefs.loadedAt = Date.now();
  if (typeof window.loadNotifications === 'function') window.loadNotifications();
}
window.wwSetNotifPref = wwSetNotifPref;

// Kategori ve tıklama hedefi (ilk aksiyon = kartın tamamına tıklama)
var _wwNotifActions = {};
function wwSafeNotifUrl(u) {
  u = typeof u === 'string' ? u.trim() : '';
  // yalnızca site içi yollar: "/x", "//" ve şema yok
  return /^\/(?!\/)[A-Za-z0-9\-._~\/?#=&%+]*$/.test(u) ? u : '';
}
function wwDecorateNotif(item) {
  var id = String(item.id || '');
  var tk = item.titleKey || '';
  var meta = item.meta || {};
  var acts = [];
  var cat = 'system';
  if (item.is_overtrade) {
    cat = 'risk';
    acts.push({ label: t('noti.act_trades', 'İşlemleri gör'), href: '/trades' });
    acts.push({ label: t('noti.act_limits', 'Limitler'), href: '/settings#panel-overtrade' });
  } else if (/^prem_/.test(id)) {
    cat = 'account';
    acts.push({ label: t('noti.act_renew', 'Planı yenile'), href: '/settings#panel-plan' });
  } else if (/^pay_/.test(id)) {
    cat = 'account';
    acts.push({ label: t('noti.act_retry_payment', 'Tekrar dene'), href: '/settings#panel-plan' });
  } else if (tk.indexOf('coach.alert.') === 0) {
    cat = 'coach_alert';
    acts.push({ label: t('noti.act_open_coach', 'Koçu aç'), coach: true });
  } else if (tk.indexOf('coach.') === 0) {
    cat = 'coach';
    acts.push({ label: t('noti.act_open_coach', 'Koçu aç'), coach: true });
  } else if (item.isPartner || tk.indexOf('noti.payout') === 0 || tk.indexOf('noti.partner') === 0) {
    cat = 'partner';
    acts.push({ label: t('noti.act_earnings', 'Kazançlarım'), href: '/my-earnings' });
  } else if (item.srcType === 'premium' || item.srcType === 'finance' || tk.indexOf('payment') !== -1 || tk.indexOf('premium') !== -1 || /premium|pro\b/i.test(tk)) {
    cat = 'account';
    acts.push({ label: t('noti.act_plan', 'Planım'), href: '/settings#panel-plan' });
  } else if (item.srcType === 'warning' || item.srcType === 'error' || item.srcType === 'danger') {
    cat = 'risk';
  }
  // admin / sunucu bildirimi kendi hedefini verebilir: meta_data.url ("/..."), meta_data.cta (etiket ya da çeviri anahtarı)
  var metaUrl = wwSafeNotifUrl(meta.url);
  if (metaUrl) {
    var ctaLabel = typeof meta.cta === 'string' && meta.cta ? t(meta.cta, meta.cta) : t('noti.act_open', 'Aç');
    acts = [{ label: ctaLabel.slice(0, 40), href: metaUrl }].concat(acts.slice(0, 1));
  }
  item.cat = cat;
  item.actions = acts.slice(0, 2);
  return item;
}

function wwRunNotifAction(id, act) {
  if (!act) return;
  var item = (window._allNotifications || []).find(function(n) { return String(n.id) === String(id); });
  if (item && !item.is_read && typeof window.wwMarkAsRead === 'function') window.wwMarkAsRead(null, item.id);
  var panel = document.getElementById('bell-panel');
  if (panel) panel.classList.remove('open');
  var bellBtn = document.getElementById('overtrade-bell-btn');
  if (bellBtn) { bellBtn.classList.remove('active'); bellBtn.setAttribute('aria-expanded', 'false'); }
  if (act.coach) {
    if (window.WwAiCoach && typeof window.WwAiCoach.open === 'function') window.WwAiCoach.open();
    return;
  }
  if (act.href) {
    if (typeof window.closeMobileMenuAndNavigate === 'function') window.closeMobileMenuAndNavigate(null, act.href);
    else window.location.href = act.href;
  }
}

// Zil paneli: tercihler görünümü (dişli düğmesi panelin başlığına JS ile eklenir; Navbar.astro ve getNavbarHTML aynı kalır)
window._wwBellView = 'list';
function wwEnsureBellPrefsBtn() {
  var actions = document.querySelector('#bell-panel .bell-panel-header-actions');
  if (!actions || document.getElementById('bell-prefs-btn')) return;
  var label = t('noti.prefs_title', 'Bildirim tercihleri');
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bell-prefs-btn';
  btn.id = 'bell-prefs-btn';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-pressed', 'false');
  btn.innerHTML = '<i data-lucide="settings-2"></i>';
  var closeBtn = document.getElementById('bell-panel-close');
  if (closeBtn && closeBtn.parentNode === actions) actions.insertBefore(btn, closeBtn); else actions.appendChild(btn);
  if (typeof lucide !== 'undefined' && lucide.createIcons) { try { lucide.createIcons(); } catch (e) {} }
}

function wwSetBellView(view) {
  window._wwBellView = view === 'prefs' ? 'prefs' : 'list';
  var panel = document.getElementById('bell-panel');
  if (panel) panel.classList.toggle('is-prefs', window._wwBellView === 'prefs');
  var btn = document.getElementById('bell-prefs-btn');
  if (btn) {
    btn.setAttribute('aria-pressed', window._wwBellView === 'prefs' ? 'true' : 'false');
    btn.classList.toggle('active', window._wwBellView === 'prefs');
  }
  if (window._wwBellView === 'prefs') {
    var sb = wwNotifSb();
    var uid = wwNotifUid();
    if (sb && uid) wwLoadNotifPrefs(sb, uid).then(function() { if (window._wwBellView === 'prefs') window.renderNotifications(); });
  }
  if (typeof window.renderNotifications === 'function') window.renderNotifications();
}
window.wwSetBellView = wwSetBellView;

function wwRenderBellPrefs(body) {
  var rows = [
    { cat: 'risk', icon: 'shield-alert', title: t('noti.pref_risk', 'Risk ve limit uyarıları'), desc: t('noti.pref_risk_desc', 'Overtrade, günlük kayıp limiti ve risk uyarıları.') },
    { cat: 'coach_alert', icon: 'zap', title: t('noti.pref_coach_alert', 'AI koç canlı uyarıları'), desc: t('noti.pref_coach_alert_desc', 'İşlemlerinden sonra plan ihlali ve risk uyarıları. Kapatınca koç bu uyarıları hiç üretmez.') },
    { cat: 'coach', icon: 'sparkles', title: t('noti.pref_coach', 'AI koç raporları'), desc: t('noti.pref_coach_desc', 'Haftalık rapor ve verdiğin sözlerin hatırlatmaları.') },
    { cat: 'partner', icon: 'handshake', title: t('noti.pref_partner', 'Partner ve kazançlar'), desc: t('noti.pref_partner_desc', 'Partner başvurusu sonucu ve ödeme talepleri.') },
    { cat: 'system', icon: 'megaphone', title: t('noti.pref_system', 'Duyurular ve sistem'), desc: t('noti.pref_system_desc', 'Platform duyuruları ve genel bildirimler.') },
    { cat: 'account', icon: 'crown', title: t('noti.pref_account', 'Hesap ve ödeme'), desc: t('noti.pref_account_desc', 'Pro süresi ve ödemeler. Hesabın için önemli olduğundan her zaman açık.'), locked: true }
  ];
  var hidden = window._wwNotifHiddenCount || 0;
  var html = '<div class="bell-prefs">' +
    '<div class="bell-prefs-head">' +
      '<button type="button" class="bell-prefs-back" data-bell-view="list"><i data-lucide="arrow-left"></i><span>' + sanitizeHTML(t('noti.prefs_back', 'Bildirimlere dön')) + '</span></button>' +
      '<p class="bell-prefs-intro">' + sanitizeHTML(t('noti.prefs_intro', 'Zilde hangi bildirimleri görmek istediğini seç. Tercihlerin hesabına kaydedilir, her cihazda aynıdır.')) + '</p>' +
    '</div>';
  rows.forEach(function(r) {
    var on = r.locked ? true : wwNotifPrefOn(r.cat);
    html += '<div class="bell-pref-row' + (r.locked ? ' is-locked' : '') + '">' +
      '<div class="bell-pref-icon"><i data-lucide="' + r.icon + '"></i></div>' +
      '<div class="bell-pref-text"><div class="bell-pref-title" id="bell-pref-t-' + r.cat + '">' + sanitizeHTML(r.title) + '</div>' +
      '<div class="bell-pref-desc">' + sanitizeHTML(r.desc) + '</div></div>' +
      '<button type="button" class="bell-pref-switch' + (on ? ' on' : '') + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '"' +
        ' aria-labelledby="bell-pref-t-' + r.cat + '" data-pref-cat="' + r.cat + '"' + (r.locked ? ' disabled aria-disabled="true"' : '') + '>' +
        '<span class="bell-pref-knob"></span></button>' +
    '</div>';
  });
  if (hidden > 0) {
    html += '<div class="bell-prefs-note"><i data-lucide="eye-off"></i><span>' +
      sanitizeHTML(t('noti.prefs_hidden', '{n} bildirim kapattığın kategorilerde olduğu için gizli.', { n: hidden })) + '</span></div>';
  }
  html += '</div>';
  body.innerHTML = html;
  if (typeof lucide !== 'undefined' && lucide.createIcons) { try { lucide.createIcons(); } catch (e) {} }
}

// Panel içindeki tıklamalar: tercih anahtarı, görünüm değişimi, kartın hedefi / aksiyon düğmeleri
if (!window.__wwBellDelegated) {
  window.__wwBellDelegated = true;
  document.addEventListener('click', function(e) {
    var target = e.target;
    if (!target || !target.closest) return;
    // DOM'u bir sonraki tick'te değiştir: aynı tıklamayı dinleyen "dışarı tıklanınca kapat" işleyicisi hedefi
    // panelin içinde görsün (yeniden çizilen düğme DOM'dan kopunca paneli kapatıyordu)
    if (target.closest('#bell-prefs-btn')) {
      e.preventDefault();
      setTimeout(function() { wwSetBellView(window._wwBellView === 'prefs' ? 'list' : 'prefs'); }, 0);
      return;
    }
    if (!target.closest('#bell-panel-body')) return;
    var viewBtn = target.closest('[data-bell-view]');
    if (viewBtn) { e.preventDefault(); var v = viewBtn.getAttribute('data-bell-view'); setTimeout(function() { wwSetBellView(v); }, 0); return; }
    var sw = target.closest('.bell-pref-switch');
    if (sw) {
      e.preventDefault();
      if (sw.disabled) return;
      var pc = sw.getAttribute('data-pref-cat'), pOn = sw.getAttribute('aria-checked') !== 'true';
      setTimeout(function() { wwSetNotifPref(pc, pOn); }, 0);
      return;
    }
    if (target.closest('.noti-mark-read')) return;
    var itemEl = target.closest('.noti-item');
    if (!itemEl) return;
    var nid = itemEl.getAttribute('data-id');
    var acts = _wwNotifActions[nid];
    if (!acts || !acts.length) return;
    var chip = target.closest('.noti-action');
    var idx = chip ? Number(chip.getAttribute('data-ai')) || 0 : 0;
    e.preventDefault();
    setTimeout(function() { wwRunNotifAction(nid, acts[idx]); }, 0);
  });
}

window.wwMarkAllAsRead = async function() {
  try {
    var sb = window.sb || window.supabase;
    var user = window.SETTINGS_STATE?.currentUser;
    if (!user || !user.id) {
      try {
        var sess = await sb?.auth?.getSession();
        user = sess?.data?.session?.user;
      } catch (sessErr) {}
    }

    // Önce ekran (iyimser), sonra sunucu: arada gelen bir yükleme bunları geri getirmesin
    _wwMarkAllAt = Date.now();

    // Overtrade ve yerel bildirimleri de okundu yap
    if (Array.isArray(window._allNotifications)) {
      window._allNotifications.forEach(function(item) {
        if (item.id && !item.is_overtrade && !/^(prem|pay)_/.test(String(item.id))) _wwReadOverlay[String(item.id)] = true;
        if (item.is_overtrade) {
          var otRaw = (item.rawId || item.id || '').toString();
          var otClean = otRaw.replace(/^ot_/, '');
          var otPref = 'ot_' + otClean;
          dismissClientNotif(otRaw);
          dismissClientNotif(otClean);
          dismissClientNotif(otPref);
          if (item.id) dismissClientNotif(item.id.toString());
          if (typeof window.dismissOvertradeWarning === 'function') {
            window.dismissOvertradeWarning(otClean);
            window.dismissOvertradeWarning(otPref);
          }
        }
        if (item.id && (item.id.toString().startsWith('prem_') || item.id.toString().startsWith('pay_'))) {
          dismissClientNotif(item.id.toString());
        }
        item.is_read = true;
      });
    }

    // Aktif overtrade uyarılarını da sıfırla
    window._activeOvertradeWarnings = [];

    if (typeof window.renderNotifications === 'function') {
      window.renderNotifications();
    }

    if (sb && user && user.id) {
      var markAllErr = null;
      try {
        var { error: rpcErr } = await sb.rpc('mark_notifications_as_read', { p_user_id: user.id });
        if (rpcErr) {
          var upd = await sb.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
          markAllErr = upd && upd.error;
        }
      } catch (eRpc) {
        try {
          var upd2 = await sb.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
          markAllErr = upd2 && upd2.error;
        } catch (eUpd) { markAllErr = eUpd; }
      }
      if (markAllErr) console.warn('🔔 Bildirimler sunucuda okundu yapılamadı:', markAllErr);
    }

    if (typeof showToast === 'function') {
      var lang = (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) ? i18n.getCurrentLanguage() : 'tr';
      var toastMsg = lang === 'en' ? 'All notifications marked as read' : lang === 'de' ? 'Alle Benachrichtigungen als gelesen markiert' : 'Tüm bildirimler okundu olarak işaretlendi';
      showToast(toastMsg, 'success');
    }
  } catch (err) {
    console.error('Mark all read error:', err);
  }
};

// Bir tıklamanın içinden yeniden çizim: bir sonraki tick'te (aynı tıklamanın "dışarı tıklanınca kapat" işleyicisi,
// DOM'dan kopmuş hedefi panelin dışı sanıp paneli kapatmasın)
function wwRenderNotifsSoon() {
  setTimeout(function() { if (typeof window.renderNotifications === 'function') window.renderNotifications(); }, 0);
}

window.wwMarkAsRead = async function(e, id) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  try {
    var strId = id ? id.toString() : '';
    var item = (window._allNotifications || []).find(function(n) { 
      return n.id === id || n.rawId === id || (n.id && n.id.toString() === strId) || (n.rawId && n.rawId.toString() === strId); 
    });
    if (item) {
      item.is_read = true;
    }

    var isOt = strId.startsWith('ot_') || (item && item.is_overtrade);
    if (isOt) {
      var rawId = (item && item.rawId ? item.rawId : strId).toString();
      var cleanId = rawId.replace(/^ot_/, '');
      var prefixedId = 'ot_' + cleanId;

      dismissClientNotif(strId);
      dismissClientNotif(rawId);
      dismissClientNotif(cleanId);
      dismissClientNotif(prefixedId);

      if (typeof window.dismissOvertradeWarning === 'function') {
        window.dismissOvertradeWarning(cleanId);
        window.dismissOvertradeWarning(prefixedId);
        window.dismissOvertradeWarning(rawId);
      }

      if (Array.isArray(window._activeOvertradeWarnings)) {
        window._activeOvertradeWarnings = window._activeOvertradeWarnings.filter(function(w) {
          var wid = (w.id || w.type || '').toString();
          var wClean = wid.replace(/^ot_/, '');
          return wid !== strId && wid !== rawId && wid !== cleanId && wid !== prefixedId && wClean !== cleanId && w.type !== cleanId;
        });
      }
    } else if (strId.startsWith('prem_') || strId.startsWith('pay_')) {
      dismissClientNotif(strId);
    } else {
      _wwReadOverlay[strId] = true;
      wwRenderNotifsSoon();
      var sb = window.sb || window.supabase;
      var user = window.SETTINGS_STATE?.currentUser;
      if (!user || !user.id) {
        try {
          var sess = await sb?.auth?.getSession();
          user = sess?.data?.session?.user;
        } catch (sessErr) {}
      }
      if (sb && user && user.id) {
        try {
          var { error: rpcErr } = await sb.rpc('mark_notification_as_read', { p_user_id: user.id, p_notification_id: id });
          if (rpcErr) {
            await sb.from('notifications').update({ is_read: true }).eq('id', id).eq('user_id', user.id);
          }
        } catch (eRpc) {
          try {
            await sb.from('notifications').update({ is_read: true }).eq('id', id).eq('user_id', user.id);
          } catch (eUpd) {}
        }
      }
    }

    wwRenderNotifsSoon();
  } catch (err) {
    console.error('Mark read error:', err);
  }
};

function formatNotifTime(dateInput) {
  try {
    var date = new Date(dateInput);
    if (isNaN(date.getTime())) return t('noti.just_now', 'Az önce');
    var diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSec < 60) return t('noti.just_now', 'Az önce');
    var diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
      var lang = (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) ? i18n.getCurrentLanguage() : 'tr';
      var minSuffix = lang === 'en' ? 'min ago' : lang === 'de' ? 'Min. zuvor' : 'dk önce';
      return diffMin + ' ' + minSuffix;
    }
    var diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return t('noti.hours_ago', '{h} saat önce', { h: diffHours });
    var diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return t('noti.days_ago', '{d} gün önce', { d: diffDays });
    var currentLang = (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) ? i18n.getCurrentLanguage() : 'tr';
    var locale = currentLang === 'en' ? 'en-US' : currentLang === 'de' ? 'de-DE' : 'tr-TR';
    return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  } catch(e) {
    return 'az önce';
  }
}

window.renderNotifications = function() {
  var body = document.getElementById('bell-panel-body');
  var badge = document.getElementById('bell-badge');
  var dot = document.getElementById('bell-dot');
  var bellBtn = document.getElementById('overtrade-bell-btn');
  var markReadBtn = document.getElementById('bell-mark-read-btn');
  var unreadPill = document.getElementById('bell-unread-pill');

  var all = window._allNotifications || [];
  var unreadList = all.filter(function(n) { return !n.is_read; });
  var riskList = all.filter(function(n) { return n.category === 'risk'; });
  var systemList = all.filter(function(n) { return n.category !== 'risk'; });

  // Tab sayılarını güncelle
  var cAll = document.getElementById('bell-tab-all-count');
  var cUnread = document.getElementById('bell-tab-unread-count');
  var cRisk = document.getElementById('bell-tab-risk-count');
  var cSys = document.getElementById('bell-tab-system-count');

  if (cAll) cAll.textContent = all.length;
  if (cUnread) cUnread.textContent = unreadList.length;
  if (cRisk) cRisk.textContent = riskList.length;
  if (cSys) cSys.textContent = systemList.length;

  // Rozet ve sayaç güncelle
  var totalUnread = unreadList.length;
  // Sayı arttıysa rozet bir kez belirir, zil bir kez sallanır (sürekli animasyon yok).
  // Yalnızca sunucudan gerçekten yüklenmiş iki liste karşılaştırılır: veri gelmeden yapılan
  // çizimler (ör. dil güncellemesi, boş liste) sayılmaz; yoksa her sayfa açılışında zil sallanırdı.
  var notifsLoaded = !!window._wwNotifsLoaded;
  var prevUnread = window._wwLastUnreadLoaded;
  if (notifsLoaded) window._wwLastUnreadLoaded = totalUnread;
  var unreadIncreased = notifsLoaded && typeof prevUnread === 'number' && totalUnread > prevUnread;
  if (bellBtn) {
    var bellLabel = t('nav.notifications', 'Bildirimler');
    bellBtn.setAttribute('aria-label', totalUnread > 0 ? bellLabel + ', ' + totalUnread + ' ' + t('noti.unread_suffix', 'okunmamış') : bellLabel);
  }
  if (totalUnread > 0) {
    if (badge) {
      badge.textContent = totalUnread > 9 ? '9+' : totalUnread;
      badge.classList.toggle('is-wide', totalUnread > 9);
      badge.style.display = 'flex';
      // Görülmemiş okunmamış bildirim varsa rozetin etrafında yumuşak bir halka yanıp söner
      var seenSet = wwBellSeenSet();
      var panelOpen = !!(document.getElementById('bell-panel') && document.getElementById('bell-panel').classList.contains('open'));
      badge.classList.toggle('is-live', !panelOpen && unreadList.some(function(n) { return !seenSet[String(n.id)]; }));
      if (unreadIncreased) {
        badge.classList.remove('bump');
        void badge.offsetWidth;
        badge.classList.add('bump');
        if (bellBtn) {
          bellBtn.classList.remove('ring');
          void bellBtn.offsetWidth;
          bellBtn.classList.add('ring');
        }
      }
    }
    if (dot) dot.style.display = 'none';
    if (bellBtn) bellBtn.classList.add('has-alert');
    if (markReadBtn) markReadBtn.style.display = 'inline-flex';
    if (unreadPill) {
      unreadPill.textContent = totalUnread + ' ' + t('noti.new_suffix', 'yeni');
      unreadPill.style.display = 'inline-block';
    }
  } else {
    if (badge) badge.style.display = 'none';
    if (dot) dot.style.display = 'none';
    if (bellBtn) bellBtn.classList.remove('has-alert');
    if (markReadBtn) markReadBtn.style.display = 'none';
    if (unreadPill) {
      unreadPill.textContent = t('noti.up_to_date', 'Güncel');
      unreadPill.style.display = 'none';
    }
  }

  wwEnsureBellPrefsBtn();
  if (!body) return;
  if (window._wwBellView === 'prefs') { wwRenderBellPrefs(body); return; }

  // Filtreleme
  var filtered = all;
  _wwNotifActions = {};
  var currentTab = window.wwNotifTab || 'all';
  if (currentTab === 'unread') {
    filtered = unreadList;
  } else if (currentTab === 'risk') {
    filtered = riskList;
  } else if (currentTab === 'system') {
    filtered = systemList;
  }

  if (filtered.length === 0) {
    var emptyIcon = 'bell-off';
    var emptyTitle = t('noti.empty_title', 'Yeni Bildirim Yok');
    var emptyDesc = t('noti.empty_desc', 'Şu an için her şey yolunda görünüyor.');

    if (currentTab === 'unread') {
      emptyIcon = 'check-circle-2';
      emptyTitle = t('noti.empty_unread_title', 'Tüm Bildirimler Okundu!');
      emptyDesc = t('noti.empty_unread_desc', 'Okunmamış herhangi bir bildirim veya risk uyarınız bulunmuyor.');
    } else if (currentTab === 'risk') {
      emptyIcon = 'shield-check';
      emptyTitle = t('noti.empty_risk_title', 'Risk Uyarısı Bulunmuyor');
      emptyDesc = t('noti.empty_risk_desc', 'Tüm işlemleriniz ve overtrade risk limitleriniz güvenli seviyede.');
    } else if (currentTab === 'system') {
      emptyIcon = 'bell-off';
      emptyTitle = t('noti.empty_system_title', 'Sistem Bildirimi Yok');
      emptyDesc = t('noti.empty_system_desc', 'Hesabınız veya platform duyurularıyla ilgili yeni bir bildirim yok.');
    }

    body.innerHTML = `
      <div class="bell-panel-empty">
        <div class="bell-empty-icon-wrap">
          <i data-lucide="${emptyIcon}"></i>
        </div>
        <div class="bell-empty-title">${emptyTitle}</div>
        <div class="bell-empty-desc">${emptyDesc}</div>
      </div>
    `;
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    return;
  }

  var html = '';
  filtered.forEach(function(n) {
    var timeStr = formatNotifTime(n.created_at);
    var otStatsHtml = '';

    if (n.stats) {
      var isLoss = n.stats.type === 'daily_loss';
      var isOver = false;
      var curDisplay = '';
      var limDisplay = '';

      if (isLoss) {
        var absLoss = Math.abs(Number(n.stats.current) || 0);
        var numLimit = Number(n.stats.limit) || 0;
        isOver = absLoss >= numLimit;
        var cSym = (typeof window.getCurrencySymbol === 'function') ? window.getCurrencySymbol() : (window.currencySymbol || '$');
        var fLoss = (absLoss % 1 === 0) ? absLoss.toLocaleString() : absLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        var fLim = (numLimit % 1 === 0) ? numLimit.toLocaleString() : numLimit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        curDisplay = cSym + fLoss;
        limDisplay = cSym + fLim;
      } else {
        var numCur = Math.round(Number(n.stats.current) || 0);
        var numLim = Math.round(Number(n.stats.limit) || 0);
        isOver = numCur >= numLim;
        curDisplay = numCur.toLocaleString();
        limDisplay = numLim.toLocaleString();
      }

      var typeTitle = n.stats.type === 'daily_trades' ? t('overtrade.daily_trades', 'Günlük İşlem') :
                      n.stats.type === 'weekly_trades' ? t('overtrade.weekly_trades', 'Haftalık İşlem') :
                      n.stats.type === 'daily_loss' ? t('overtrade.loss', 'Günlük Kayıp') : t('noti.tab_risk', 'Risk Limiti');
      var limitExceededText = t('noti.limit_exceeded', 'LİMİT AŞILDI');
      otStatsHtml = `
        <div class="noti-ot-stats">
          <div class="noti-stat-chip ${isOver ? 'limit-danger' : ''}">
            <span class="noti-stat-cur">${curDisplay}</span>
            <span class="noti-stat-sep" style="opacity:0.4;">/</span>
            <span class="noti-stat-lim" style="opacity:0.8;">${limDisplay}</span>
          </div>
          <span class="noti-stat-chip">${typeTitle}</span>
          ${isOver ? `<span class="noti-stat-chip limit-danger">${limitExceededText}</span>` : ''}
        </div>
      `;
    }

    var markReadText = t('noti.mark_read_single', 'Okundu');
    var acts = Array.isArray(n.actions) ? n.actions : [];
    if (acts.length) _wwNotifActions[String(n.id)] = acts;
    var actionsHtml = acts.length ? '<div class="noti-actions">' + acts.map(function(a, ai) {
      return '<button type="button" class="noti-action' + (ai === 0 ? ' primary' : '') + '" data-ai="' + ai + '">' +
        sanitizeHTML(a.label) + (ai === 0 ? '<i data-lucide="' + (a.coach ? 'sparkles' : 'arrow-right') + '"></i>' : '') + '</button>';
    }).join('') + '</div>' : '';
    html += `
      <div class="noti-item ${n.is_read ? '' : 'unread'}${acts.length ? ' has-action' : ''}" data-id="${sanitizeHTML(String(n.id))}">
        ${!n.is_read ? '<span class="noti-unread-dot"></span>' : ''}
        <div class="noti-icon ${n.iconType || n.type}">
          <i data-lucide="${n.iconName}"></i>
        </div>
        <div class="noti-content">
          <div class="noti-header-row">
            <span class="noti-tag ${n.tagClass || n.type}">${n.tagText}</span>
            ${!n.is_read ? `
              <button class="noti-mark-read" onclick="window.wwMarkAsRead(event, '${n.id}')" title="${markReadText}">
                <i data-lucide="check"></i>
                <span>${markReadText}</span>
              </button>
            ` : ''}
          </div>
          <h4 class="noti-title">${window.sanitizeHTML ? sanitizeHTML(n.title) : n.title}</h4>
          <div class="noti-desc">${window.sanitizeHTML ? sanitizeHTML(n.message) : n.message}</div>
          ${otStatsHtml}
          <div class="noti-bottom-row">
            <span class="noti-time">
              <i data-lucide="clock"></i>
              <span>${timeStr}</span>
            </span>
            ${actionsHtml}
          </div>
        </div>
      </div>
    `;
  });

  body.innerHTML = html;
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
};

window.loadNotifications = async function() {
  // Aynı anda birden çok yükleme olabilir (realtime, zil açılışı, overtrade, rozet): yalnızca en son başlayan listeyi yazar
  var loadSeq = ++_wwNotifLoadSeq;
  try {
    var sb = window.sb || window.supabase;
    if (!sb) return;

    var user = window.SETTINGS_STATE?.currentUser;
    if (!user || !user.id) {
      try {
        var sessionRes = await sb.auth.getSession();
        user = sessionRes?.data?.session?.user || null;
        if (user) {
          if (!window.SETTINGS_STATE) window.SETTINGS_STATE = {};
          window.SETTINGS_STATE.currentUser = user;
          if (user.id) sessionStorage.setItem('ww_user_id', user.id);
        }
      } catch (sessErr) {
        console.warn('🔔 [loadNotifications] getSession hatası:', sessErr);
      }
    }

    if (user && user.id) {
      console.log('🔔 [loadNotifications] Oturum açık kullanıcı ID:', user.id);

      // Gerçek zamanlı bildirim dinleyicisi (Supabase Realtime). WwRealtime (interface/shared/realtime-guard.js) kanalı
      // yalnızca geçerli oturumla açar ve token reddedilirse sonsuz yeniden denemeyi durdurur; yoksa kanal açılmaz.
      if (!window._wwNotifSubscribed && window.WwRealtime) {
        window._wwNotifSubscribed = true;
        try {
          window.WwRealtime.subscribe(sb, 'realtime_user_notifications_' + user.id, function(ch) {
            return ch.on('postgres_changes', {
              event: '*',
              schema: 'public',
              table: 'notifications',
              filter: 'user_id=eq.' + user.id
            }, function(payload) {
              console.log('🔔 [loadNotifications Realtime] Veritabanından bildirim değişikliği:', payload);
              // a new live coach alert: the coach panel shows it (toast, optional desktop notification)
              try {
                if (payload && payload.eventType === 'INSERT' && payload.new && /^coach\.alert\./.test(payload.new.title_key || '') && wwNotifPrefOn('coach_alert')) {
                  window.dispatchEvent(new CustomEvent('ww:coach-alert', { detail: payload.new }));
                }
              } catch (evErr) { /* ignore */ }
              if (typeof window.loadNotifications === 'function') {
                window.loadNotifications();
              }
            });
          });
        } catch (rtErr) {
          console.warn('🔔 [loadNotifications] Realtime dinleyici hatası:', rtErr);
        }
      }
    } else {
      console.warn('🔔 [loadNotifications] Oturum açmış kullanıcı bulunamadı.');
    }

    var combined = [];

    // Hesaptaki okundu anahtarları (ot_/prem_/pay_): başka cihazda okunanlar burada da okundu görünür
    if (user && user.id) {
      try { await wwLoadServerReads(sb, user.id); } catch (srErr) {}
    }

    // 1. OverTrade risk uyarılarını topla
    var otWarnings = window._activeOvertradeWarnings;
    if (otWarnings === undefined && typeof window.checkOvertrade === 'function' && sb && user && user.id) {
      try {
        var isPrem = true;
        if (typeof window.getUserPlanSilent === 'function') {
          var planRes = await window.getUserPlanSilent();
          if (planRes && planRes.plan !== 'premium') {
            isPrem = false;
          }
        }
        if (isPrem) {
          var weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          var weekAgoStr = weekAgo.toISOString().split('T')[0];
          var trades = null;

          // ⚡ Eğer sayfada işlemler zaten önbelleğe alındıysa Supabase'e ek istek atma
          if (typeof window.wwCache !== 'undefined') {
            var activeJid = (typeof window.getActiveJournalId === 'function') ? window.getActiveJournalId() : localStorage.getItem('ww_active_journal_id');
            var otCols = ['trade_date', 'entry_price', 'exit_price', 'lot', 'direction', 'instrument', 'multiplier', 'pnl', 'platform_source'];
            var cached = window.wwCache.get('trades', user.id, activeJid, otCols) || window.wwCache.get('trades', user.id, 'all', otCols);
            if (cached && Array.isArray(cached) && cached.length > 0) {
              trades = window.WwTrades.filterScope(cached, 'live').filter(function(t) { return t.trade_date && t.trade_date >= weekAgoStr; });
            }
          }

          if (!trades) {
            // Canlı kapsam: replay'de son 7 güne düşen backtest işlemleri overtrade uyarısı üretmez
            var otQuery = sb
              .from('trades')
              .select('trade_date,entry_price,exit_price,lot,direction,instrument,multiplier,pnl,platform_source')
              .eq('user_id', user.id)
              .gte('trade_date', weekAgoStr);
            var { data: fetchedTrades } = await window.WwTrades.applyScope(otQuery, 'live')
              .order('trade_date', { ascending: false });
            trades = fetchedTrades;
          }

          if (trades) {
            otWarnings = window.checkOvertrade(trades) || [];
          } else {
            otWarnings = [];
          }
        } else {
          otWarnings = [];
        }
        window._activeOvertradeWarnings = otWarnings;
      } catch (otErr) {
        otWarnings = [];
        window._activeOvertradeWarnings = [];
      }
    }
    if (!otWarnings) otWarnings = [];

    if (Array.isArray(otWarnings)) {
      otWarnings.forEach(function(w) {
        var isDanger = w.level === 'danger';
        var otId = (w.id || w.type || 'warning').toString();
        var cleanOtId = otId.replace(/^ot_/, '');
        var prefixedOtId = 'ot_' + cleanOtId;

        var isDismissed = false;
        if (typeof window.isOvertradeWarningDismissed === 'function') {
          isDismissed = window.isOvertradeWarningDismissed(otId) ||
                        window.isOvertradeWarningDismissed(cleanOtId) ||
                        window.isOvertradeWarningDismissed(prefixedOtId);
        }
        if (!isDismissed && typeof isClientNotifDismissed === 'function') {
          isDismissed = isClientNotifDismissed(otId) ||
                        isClientNotifDismissed(cleanOtId) ||
                        isClientNotifDismissed(prefixedOtId);
        }

        var criticalText = t('noti.tag_critical', 'KRİTİK RİSK');
        var warningText = t('noti.tag_warning', 'RİSK UYARISI');
        var critTitle = t('noti.overtrade_warning_title', 'Kritik Risk Limiti Aşıldı!');
        var warnTitle = t('noti.overtrade_warning_title', 'Over Trade Uyarısı');

        var msg = w.message || 'Belirlenen işlem limitinize yaklaştınız.';
        if (w.type === 'daily_loss') {
          var cSym = (typeof window.getCurrencySymbol === 'function') ? window.getCurrencySymbol() : (window.currencySymbol || '$');
          var absCur = Math.abs(Number(w.current) || 0);
          var numLim = Number(w.limit) || 0;
          var fLoss = cSym + (absCur % 1 === 0 ? absCur.toLocaleString() : absCur.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
          var fLim = cSym + (numLim % 1 === 0 ? numLim.toLocaleString() : numLim.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
          msg = (typeof t === 'function')
            ? t('overtrade.daily_loss_warning', 'Bugün {{loss}} kaybettin. Günlük kayıp limitin {{limit}}!', { loss: fLoss, limit: fLim })
            : ('Bugün ' + fLoss + ' kaybettin. Günlük kayıp limitin ' + fLim + '!');
        }

        combined.push({
          id: prefixedOtId,
          rawId: otId,
          category: 'risk',
          type: isDanger ? 'danger' : 'warning',
          tagText: isDanger ? criticalText : warningText,
          iconName: isDanger ? 'octagon-alert' : 'triangle-alert',
          title: isDanger ? critTitle : warnTitle,
          message: msg,
          stats: { current: Math.abs(Number(w.current) || 0), limit: Number(w.limit) || 0, type: w.type },
          is_read: isDismissed,
          created_at: Date.now(),
          is_overtrade: true
        });
      });
    }

    // 2. Supabase sistem & kullanıcı bildirimlerini topla (notifications tablosu)
    if (sb && user && user.id) {
      var { data: notis, error } = await sb
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.warn('⚠️ [loadNotifications] notifications tablosu sorgu hatası:', error);
      } else {
        console.log('✅ [loadNotifications] notifications tablosundan çekilen kayıt sayısı:', notis ? notis.length : 0);
      }

      if (!error && Array.isArray(notis)) {
        notis.forEach(function(n) {
          var isPartner = (n.type === 'partner') || (n.title_key && n.title_key.indexOf('partner') !== -1);
          var isRisk = !isPartner && (n.type === 'error' || n.type === 'warning' || n.type === 'danger');
          var iconName = 'bell';
          var tagText = t('noti.tag_info', 'SİSTEM');
          var tagClass = isPartner ? 'partner' : (n.type || 'info');
          var iconType = n.type || 'info';

          if (isPartner) {
            tagText = t('noti.tag_partner', 'PARTNER');
            tagClass = 'partner';
            if (n.type === 'success' || (n.title_key && n.title_key.indexOf('approved') !== -1)) {
              iconName = 'award';
              iconType = 'success';
            } else {
              iconName = 'info';
              iconType = 'warning';
            }
          } else if (n.type === 'success') { iconName = 'check-circle-2'; tagText = t('noti.tag_success', 'BAŞARILI'); }
          else if (n.type === 'error' || n.type === 'danger') { iconName = 'alert-circle'; tagText = t('noti.tag_critical', 'KRİTİK RİSK'); tagClass = 'danger'; iconType = 'danger'; }
          else if (n.type === 'warning') { iconName = 'alert-triangle'; tagText = t('noti.tag_warning', 'RİSK UYARISI'); }
          else if (n.type === 'finance') { iconName = 'wallet'; tagText = t('noti.tag_finance', 'FİNANS'); }
          else if (n.type === 'premium' || (n.title_key && n.title_key.indexOf('premium') !== -1)) { iconName = 'crown'; tagText = t('noti.tag_premium', 'PRO'); tagClass = 'pro'; iconType = 'pro'; }
          else { iconName = 'info'; tagText = t('noti.tag_info', 'SİSTEM'); }

          var helperT = typeof t === 'function' ? t : function(k, f, p) { return f || k; };
          var metaData = Object.assign({}, n.meta_data || {});
          // coach notifications start with the name of the coach the member picked (AI coach panel)
          if (n.title_key && n.title_key.indexOf('coach.') === 0 && !metaData.coach) metaData.coach = (window.WwAiCoach && typeof window.WwAiCoach.coachName === 'function') ? window.WwAiCoach.coachName() : 'Kai';
          if (!metaData.plan) {
            var curLangCode = (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) ? i18n.getCurrentLanguage() : 'tr';
            metaData.plan = curLangCode === 'en' ? '1-month' : (curLangCode === 'de' ? '1-monatiges' : '1 aylık');
          }

          var title = n.title || (n.title_key ? helperT(n.title_key, n.title_key, metaData) : null) || 'Bildirim';
          var desc = n.message || n.description || (n.message_key ? helperT(n.message_key, n.message_key, metaData) : '') || '';

          var createdTs = n.created_at ? (typeof n.created_at === 'number' ? n.created_at : new Date(n.created_at).getTime()) : Date.now();
          // bu sayfada okundu yapıldıysa (sunucu yazımı henüz bitmemiş olabilir) okundu kalır
          var readHere = !!_wwReadOverlay[String(n.id)] || (_wwMarkAllAt > 0 && createdTs <= _wwMarkAllAt);

          combined.push({
            id: n.id,
            rawId: n.id,
            category: isRisk ? 'risk' : 'system',
            type: n.type === 'error' ? 'danger' : (n.type || 'info'),
            tagClass: tagClass,
            iconType: iconType,
            tagText: tagText,
            iconName: iconName,
            title: title,
            message: desc,
            stats: null,
            is_read: !!n.is_read || readHere,
            created_at: isNaN(createdTs) ? Date.now() : createdTs,
            is_overtrade: false,
            titleKey: n.title_key || '',
            srcType: n.type || '',
            meta: metaData,
            isPartner: isPartner
          });
        });
      }
    }

    // 3. Pro süre & abonelik kontrolü
    if (sb && user && user.id) {
      try {
        var profile = window.__wwUserProfile;
        if (!profile || profile.id !== user.id) {
          var { data: pData } = await sb
            .from('user_profiles')
            .select('id, plan, plan_expires_at')
            .eq('id', user.id)
            .single();
          if (pData) profile = pData;
        }

        if (profile && profile.plan === 'premium' && profile.plan_expires_at) {
          var expDate = new Date(profile.plan_expires_at);
          var now = new Date();
          var diffMs = expDate.getTime() - now.getTime();
          var daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

          // Anahtar yalnızca bitiş gününe bağlı (kullanıcı zaten satırın sahibi). Eskiden kalan gün sayısı da
          // anahtardaydı: okunan uyarı ertesi gün yeni bir bildirim gibi tekrar çıkıyordu. Yenilemede tarih değişir, yeniden çıkar.
          var expDay = expDate.toISOString().slice(0, 10);
          if (daysLeft <= 0) {
            var expId = 'prem_expired_' + expDay;
            combined.push({
              id: expId,
              rawId: expId,
              category: 'system',
              type: 'warning',
              tagText: t('noti.tag_premium', 'PRO'),
              iconName: 'hourglass',
              title: t('noti.premium_expired_title', 'Pro Süreniz Sona Erdi'),
              message: t('noti.premium_expired_desc', 'Pro üyeliğinizin süresi doldu. Özellikleri kesintisiz kullanmak için planınızı yenileyebilirsiniz.'),
              stats: null,
              is_read: isClientNotifDismissed(expId),
              created_at: expDate.getTime(),
              is_overtrade: false
            });
          } else if (daysLeft <= 7) {
            var expiringId = 'prem_expiring_' + expDay;
            combined.push({
              id: expiringId,
              rawId: expiringId,
              category: 'system',
              type: 'warning',
              tagText: t('noti.tag_premium', 'PRO'),
              iconName: 'crown',
              title: t('noti.premium_expiring_title', 'Pro Süresi Doluyor'),
              message: t('noti.premium_expiring_desc', 'Pro aboneliğinizin bitmesine {days} gün kaldı.', { days: daysLeft }),
              stats: null,
              is_read: isClientNotifDismissed(expiringId),
              created_at: Date.now() - 1800000,
              is_overtrade: false
            });
          }
        }
      } catch (premErr) {
        console.warn('Pro notification check error:', premErr);
      }
    }

    // 4. Tamamlanamayan ödemeler (payments tablosundan, son 14 gün)
    // Başarılı ödeme bildirimi burada üretilmez: creem-webhook ve nowpayment-webhook onu zaten
    // notifications tablosuna yazıyor (noti.payment_success_title). Eskiden burada bir kopyası daha üretiliyordu;
    // okundu bilgisi yalnızca tarayıcıda olduğu için başka cihazda/girişte "Pro'ya Hoş Geldin" yeniden çıkıyordu.
    if (sb && user && user.id) {
      try {
        var paySince = new Date(Date.now() - 14 * 864e5).toISOString();
        var { data: userPayments } = await sb
          .from('payments')
          .select('id, payment_status, plan_type, created_at')
          .eq('user_id', user.id)
          .in('payment_status', ['failed', 'expired'])
          .gte('created_at', paySince)
          .order('created_at', { ascending: false })
          .limit(3);

        if (Array.isArray(userPayments)) {
          var curLang = (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) ? i18n.getCurrentLanguage() : 'tr';
          userPayments.forEach(function(p) {
            var pId = 'pay_' + p.id;
            var pDate = p.created_at ? new Date(p.created_at).getTime() : Date.now();
            var isYearly = (p.plan_type === 'yearly' || p.plan_type === 'year');
            var planLabel = isYearly
              ? (curLang === 'en' ? '1-year' : curLang === 'de' ? '1-jähriges' : '1 yıllık')
              : (curLang === 'en' ? '1-month' : curLang === 'de' ? '1-monatiges' : '1 aylık');
            combined.push({
              id: pId,
              rawId: p.id,
              category: 'system',
              type: 'warning',
              tagText: t('noti.tag_finance', 'FİNANS'),
              iconName: 'alert-circle',
              title: t('noti.payment_failed_title', 'Ödeme Tamamlanamadı'),
              message: t('noti.payment_failed_desc', '{plan} Pro ödeme işleminiz zaman aşımına uğradı veya tamamlanamadı.', {
                plan: planLabel
              }),
              stats: null,
              is_read: isClientNotifDismissed(pId),
              created_at: isNaN(pDate) ? Date.now() : pDate,
              is_overtrade: false
            });
          });
        }
      } catch (payErr) {
        console.warn('Payments notification check error:', payErr);
      }
    }

    // Tarihe göre yeniden eskiye sırala (timestamp ms sayı karşılaştırması)
    combined.sort(function(a, b) {
      var timeA = typeof a.created_at === 'number' ? a.created_at : (new Date(a.created_at).getTime() || 0);
      var timeB = typeof b.created_at === 'number' ? b.created_at : (new Date(b.created_at).getTime() || 0);
      return timeB - timeA;
    });

    // Kategori + tıklama hedefi; kapatılan kategoriler zilde gösterilmez ve sayılmaz (Bildirim tercihleri)
    if (user && user.id) {
      try { await wwLoadNotifPrefs(sb, user.id); } catch (npErr) {}
    }
    var hiddenCount = 0;
    combined = combined.filter(function(item) {
      wwDecorateNotif(item);
      if (wwNotifPrefOn(item.cat)) return true;
      hiddenCount++;
      return false;
    });

    // daha yeni bir yükleme başladıysa bu (eski) sonuç yazılmaz
    if (loadSeq !== _wwNotifLoadSeq) return;
    window._wwNotifHiddenCount = hiddenCount;
    window._allNotifications = combined;
    window._wwNotifsLoaded = true;
    window.renderNotifications();
  } catch (err) {
    console.error('Load notifications error:', err);
  }
};

// Doğrulama ve test için konsoldan çağrılabilir yardımcı
window.testSendNotification = async function(type, title, message) {
  var sb = window.sb || window.supabase;
  var user = window.SETTINGS_STATE?.currentUser;
  if (!user || !user.id) {
    var s = await sb?.auth?.getSession();
    user = s?.data?.session?.user;
  }
  if (!sb || !user || !user.id) {
    console.error('❌ Oturum açmış kullanıcı bulunamadı! Lütfen önce giriş yapın.');
    return;
  }
  var { data, error } = await sb.from('notifications').insert([{
    user_id: user.id,
    type: type || 'info',
    title_key: title || 'Test Bildirimi',
    message_key: message || 'Bu bir test sistem bildirimidir.',
    meta_data: {},
    is_read: false
  }]).select();
  if (error) {
    console.error('❌ Bildirim eklenirken hata oluştu:', error);
  } else {
    console.log('✅ Bildirim veritabanına eklendi:', data);
    await window.loadNotifications();
  }
};

var _lastBadgeFetch = 0;
var _isFetchingBadge = false;

window.updateNotificationBadge = async function(force) {
  try {
    var now = Date.now();
    if (!force && (now - _lastBadgeFetch < 4000 || _isFetchingBadge)) {
      return;
    }
    _isFetchingBadge = true;
    _lastBadgeFetch = now;

    await window.loadNotifications();
  } catch (err) {
    // Graceful error handling
  } finally {
    _isFetchingBadge = false;
  }
};

window.closeMobileMenuAndNavigate = function(e, url) {
  if (e) e.preventDefault();
  var toggle = document.getElementById('nav-toggle');
  var menu = document.getElementById('nav-menu');
  var backdrop = document.getElementById('nav-backdrop');
  if (toggle) toggle.classList.remove('open');
  if (menu) menu.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
  document.body.style.overflow = '';
  if (url) {
    if (url.indexOf('/analytics') !== -1) {
      var cachedPlan = sessionStorage.getItem('ww_user_plan') || localStorage.getItem('ww_cached_plan');
      var isPrem = cachedPlan === 'premium' || (window.__wwUserProfile && window.__wwUserProfile.plan === 'premium');
      if (!isPrem) {
        if (typeof window.openUpgradeModal === 'function') {
          window.openUpgradeModal({ feature: 'analytics_dashboard' });
          return;
        }
      }
    }
    if (window.location.pathname.indexOf('settings') !== -1 && url.indexOf('#panel-') !== -1) {
      var pId = url.split('#')[1];
      if (typeof window.switchPanel === 'function') {
        window.switchPanel(pId);
        window.scrollTo({ top: 0, behavior: 'instant' });
        return;
      }
    }
    // page-transition.js: .html yönlendirmesini atlar, önceden hazırlanmış sayfayı kullanır
    if (window.PageTransition && typeof window.PageTransition.exit === 'function') {
      window.PageTransition.exit(url);
    } else {
      window.location.href = url;
    }
  }
};

function t(key, fallback, params) {
  if (typeof fallback === 'object' && fallback !== null && typeof params === 'string') {
    var temp = fallback;
    fallback = params;
    params = temp;
  } else if (typeof fallback === 'object' && fallback !== null) {
    params = fallback;
    fallback = '';
  }
  var val = fallback || key || '';
  if (typeof i18n !== 'undefined' && i18n.t && key) {
    var translated = i18n.t(key, params);
    if (translated && translated !== key) val = translated;
  }
  if (typeof val === 'string' && params && typeof params === 'object') {
    for (var k in params) {
      val = val.replace(new RegExp('\\{+' + k + '\\}+', 'g'), params[k]);
    }
  }
  var res = typeof val === 'string' ? val : String(val || '');
  return res === '[object Object]' ? (fallback || key) : res;
}

wwLog.log('🧭 Navbar yükleniyor (CLIENT-SIDE RENDER)...');

var navbarRendered = false;
var cachedAvatarUrl = null;
var navEventsInitialized = false;

function sanitizeHTML(str) {
  if (!str) return '';
  var temp = document.createElement('div');
  temp.textContent = str;
  return temp.innerHTML;
}

function sanitizeURL(url) {
  if (!url) return '';
  try {
    var parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.href;
  } catch (e) {
    return '';
  }
}

function loadLucideIcons() {
  if (typeof lucide !== 'undefined') {
    try { lucide.createIcons(); } catch(e) {}
    return;
  }
  var script = document.createElement('script');
  script.src = 'https://unpkg.com/lucide@latest';
  script.defer = true;
  script.onload = function() {
    if (typeof lucide !== 'undefined') {
      try { lucide.createIcons(); } catch(e) {}
    }
  };
  document.head.appendChild(script);
}

function getNavbarHTML(translations) {
  var tt = function(key, fallback) {
    if (translations && translations[key] && translations[key] !== key) return translations[key];
    if (typeof i18n !== 'undefined' && typeof i18n.t === 'function') {
      var val = i18n.t(key);
      if (val && val !== key) return val;
    }
    return fallback || key;
  };

  var menuGeneral = tt('nav.menu_general', 'GENEL');
  var menuPro = tt('nav.menu_pro', 'PRO');
  var menuAccount = tt('nav.menu_account', 'HESAP');

  return `
    <nav class="nav">
      <a href="/dashboard" class="nav-logo" title="Wawe Journal - Dashboard">
        <img class="nav-logo-mark" src="/resim.svg" alt="Wawe Journal" width="26" height="26" />
      </a>
      
        <div class="nav-journal-switcher" id="nav-journal-switcher">
          <button type="button" class="journal-switch-btn" aria-haspopup="true" aria-expanded="false" aria-controls="journal-dropdown" onclick="wwToggleJournal(event, this)">
            <span class="journal-icon ww-mark-host"><span class="ww-mark ww-mark--dot" style="--mk-size:9px;--mk:#7c6dfa;--mk-ring:#7c6dfa40"><span class="ww-mark-dot"></span></span></span>
            <span class="journal-name">Ana Hesap</span>
            <svg class="journal-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="journal-dropdown" id="journal-dropdown"></div>
        </div>
      <div class="nav-links">
        <a href="/dashboard" data-page="dashboard"><span data-i18n="nav.dashboard">${tt('nav.dashboard', 'Dashboard')}</span></a>
        <a href="/trades" data-page="trades"><span data-i18n="nav.trades">${tt('nav.trades', 'İşlemler')}</span></a>
        <a href="/strategies" data-page="strategies"><span data-i18n="nav.strategies">${tt('nav.strategies', 'Stratejiler')}</span></a>
        <a href="/calendar" data-page="calendar"><span data-i18n="nav.calendar">${tt('nav.calendar', 'Takvim')}</span></a>
        <a href="/backtest" data-page="backtest" id="nav-backtest-link"><span data-i18n="nav.backtest">${tt('nav.backtest', 'Backtest')}</span></a>
        <a href="/analytics" data-page="analytics" data-pro-link><span data-i18n="nav.analysis">${tt('nav.analysis', 'Analiz')}</span></a>
      </div>
      <div class="nav-right">
        <div class="nav-econ" id="nav-econ"></div>
        <div class="nav-bell-wrapper" id="nav-bell-wrapper">
          <button class="nav-bell-btn" id="overtrade-bell-btn" aria-label="Bildirimler" title="Bildirimler" onclick="wwToggleBell(event, this)">
            <i data-lucide="bell" class="nav-bell-icon"></i>
            <span class="bell-badge" id="bell-badge" style="display:none;">0</span>
          </button>
          <div class="bell-panel" id="bell-panel" role="dialog" aria-label="Bildirim Paneli">
            <div class="bell-panel-header">
              <div class="bell-panel-title-wrap">
                <div class="bell-panel-title-text">
                  <h3 data-i18n="nav.notifications">${tt('nav.notifications', 'Bildirimler')}</h3>
                  <span class="bell-unread-pill" id="bell-unread-pill" style="display:none;">0 yeni</span>
                </div>
              </div>
              <div class="bell-panel-header-actions">
                <button class="bell-mark-read-btn" id="bell-mark-read-btn" style="display:none;" onclick="window.wwMarkAllAsRead()" title="${tt('nav.mark_read', 'Tümünü Oku')}" data-i18n-title="nav.mark_read">
                  <i data-lucide="check-check"></i>
                  <span data-i18n="nav.mark_read">${tt('nav.mark_read', 'Tümünü Oku')}</span>
                </button>
                <button class="bell-panel-close" id="bell-panel-close" title="Kapat" aria-label="Kapat">
                  <i data-lucide="x"></i>
                </button>
              </div>
            </div>
            <div class="bell-filter-tabs" id="bell-filter-tabs">
              <button type="button" class="bell-tab-btn active" data-tab="all" onclick="window.wwSwitchNotifTab('all')">
                <span data-i18n="noti.tab_all">${tt('noti.tab_all', 'Tümü')}</span>
                <span class="tab-count" id="bell-tab-all-count">0</span>
              </button>
              <button type="button" class="bell-tab-btn" data-tab="unread" onclick="window.wwSwitchNotifTab('unread')">
                <span data-i18n="noti.tab_unread">${tt('noti.tab_unread', 'Okunmamış')}</span>
                <span class="tab-count" id="bell-tab-unread-count">0</span>
              </button>
              <button type="button" class="bell-tab-btn" data-tab="risk" onclick="window.wwSwitchNotifTab('risk')">
                <span data-i18n="noti.tab_risk">${tt('noti.tab_risk', 'Risk & Limit')}</span>
                <span class="tab-count" id="bell-tab-risk-count">0</span>
              </button>
              <button type="button" class="bell-tab-btn" data-tab="system" onclick="window.wwSwitchNotifTab('system')">
                <span data-i18n="noti.tab_system">${tt('noti.tab_system', 'Sistem')}</span>
                <span class="tab-count" id="bell-tab-system-count">0</span>
              </button>
            </div>
            <div class="bell-panel-body" id="bell-panel-body">
              <div class="bell-panel-empty">
                <div class="bell-empty-icon-wrap">
                  <i data-lucide="bell-off"></i>
                </div>
                <div class="bell-empty-title" data-i18n="noti.empty_title">${tt('noti.empty_title', 'Yeni Bildirim Yok')}</div>
                <div class="bell-empty-desc" data-i18n="noti.empty_desc">${tt('noti.empty_desc', 'Şu an için her şey yolunda görünüyor.')}</div>
              </div>
            </div>
            <div class="bell-panel-footer">
              <a href="/settings#panel-overtrade" class="bell-footer-link" onclick="window.wwGoToOvertradeSettings(event)">
                <i data-lucide="sliders-horizontal"></i>
                <span data-i18n="noti.overtrade_settings">${tt('noti.overtrade_settings', 'Overtrade ve Risk Ayarları')}</span>
              </a>
            </div>
          </div>
        </div>
        
        <a href="/settings#panel-plan" class="plan-badge" id="plan-badge" aria-label="${tt('nav.plan', 'Abonelik planı')}">
          <span class="plan-dot"></span>
          <span class="plan-text" id="plan-text">${tt('nav.free_badge', 'Ücretsiz')}</span>
        </a>
        <button type="button" class="user-avatar" id="user-avatar" aria-haspopup="true" aria-expanded="false" aria-controls="dropdown-menu" aria-label="${tt('nav.account_menu', 'Hesap menüsü')}" data-i18n-aria-label="nav.account_menu" onclick="window.wwToggleAvatar(event, this)">
          <span id="nav-avatar-text" style="font-size:13px;font-weight:600;">?</span>
        </button>
        
        <div class="dropdown-menu" id="dropdown-menu">
          <div class="nav-dd-head">
            <div class="nav-dd-id">
              <div class="nav-dd-name" id="nav-dd-name">&nbsp;</div>
              <div class="nav-dd-email" id="nav-dd-email"></div>
            </div>
          </div>
          <div class="nav-dd-plan" aria-live="polite">
            <span id="plan-tooltip-title">${tt('nav.plan_tooltip_free', 'Ücretsiz Plan')}</span>
            <span class="nav-dd-plan-sep">·</span>
            <span id="plan-tooltip-sub">${tt('nav.plan_tooltip_free_desc', 'Sınırsız Süre')}</span>
          </div>
          <div class="dropdown-divider"></div>
          <a href="/settings#panel-profile" class="dropdown-item">
            <i data-lucide="user" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.profile">${tt('nav.profile', 'Profil')}</span>
          </a>
          <a href="/settings" class="dropdown-item">
            <i data-lucide="settings" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.settings">${tt('nav.settings', 'Ayarlar')}</span>
          </a>
          <a href="/my-earnings" class="dropdown-item">
            <i data-lucide="dollar-sign" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.earnings">${tt('nav.earnings', 'Kazançlarım')}</span>
          </a>
          <a href="/report-bug" class="dropdown-item">
            <i data-lucide="bug" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.report_bug">${tt('nav.report_bug', 'Hata Bildir')}</span>
          </a>
          <a href="/support" class="dropdown-item">
            <i data-lucide="life-buoy" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.help">${tt('nav.help', 'Yardım Merkezi')}</span>
          </a>
          <span id="admin-link" style="display:none;">
            <a href="/admin" class="dropdown-item">
              <i data-lucide="shield" style="width:16px;height:16px;"></i>
              <span data-i18n="nav.admin">${tt('nav.admin', 'Admin')}</span>
            </a>
          </span>
          <div class="dropdown-divider nav-upgrade-divider" id="avatar-upgrade-divider"></div>
          <a href="/settings#panel-plan" class="dropdown-item nav-upgrade-item" id="avatar-upgrade-link" style="color:var(--accent2);">
            <i data-lucide="crown" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.upgrade_pro">${tt('nav.upgrade_pro', "Pro'ya Geç →")}</span>
          </a>
          <div class="dropdown-divider"></div>
          <button class="dropdown-item" id="logout-dropdown-btn">
            <i data-lucide="log-out" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.logout">${tt('nav.logout', 'Çıkış Yap')}</span>
          </button>
        </div>
        
        <button type="button" class="nav-toggle" id="nav-toggle" aria-label="${tt('nav.open_menu', 'Menüyü aç')}" aria-expanded="false" aria-controls="nav-menu" data-i18n-aria-label="nav.open_menu">
          <span class="bar"></span><span class="bar"></span><span class="bar"></span>
        </button>
      </div>
    </nav>

    <div class="nav-backdrop" id="nav-backdrop"></div>
    <div class="nav-menu" id="nav-menu">
      <div class="nav-menu-inner">
        
        <div class="user-card" id="menu-user-card">
          <div class="user-card-avatar" id="menu-user-avatar">
            <span id="menu-avatar-text">?</span>
          </div>
          <div class="user-card-info">
            <div class="user-card-name" id="menu-user-name">Kullanıcı</div>
            <div class="user-card-plan" id="menu-user-plan">
              <span class="plan-dot"></span>
              <span class="plan-text">${tt('nav.free_badge', 'Ücretsiz')}</span>
            </div>
          </div>
        </div>

        <a href="/journals" class="menu-journal-link" id="menu-journal-link" onclick="closeMobileMenuAndNavigate(event, '/journals')">
          <span class="menu-journal-icon ww-mark-host"><span class="ww-mark ww-mark--dot" style="--mk-size:9px;--mk:#7c6dfa;--mk-ring:#7c6dfa40"><span class="ww-mark-dot"></span></span></span>
          <span class="menu-journal-info">
            <span class="menu-journal-label" data-i18n="nav.current_account">${tt('nav.current_account', 'Aktif Hesap')}</span>
            <span class="menu-journal-name" id="menu-journal-name">Ana Hesap</span>
          </span>
          <i data-lucide="chevron-right" class="menu-journal-arrow"></i>
        </a>

        <div class="menu-section">
          <div class="menu-section-title" data-i18n="nav.menu_general">${menuGeneral}</div>
          <a href="/" onclick="closeMobileMenuAndNavigate(event, '/')">
            <i data-lucide="home" style="width:16px;height:16px;"></i> <span data-i18n="nav.home">${tt('nav.home', 'Ana Sayfa')}</span>
          </a>
          <a href="/dashboard" onclick="closeMobileMenuAndNavigate(event, '/dashboard')">
            <i data-lucide="layout-dashboard" style="width:16px;height:16px;"></i> <span data-i18n="nav.dashboard">${tt('nav.dashboard', 'Dashboard')}</span>
          </a>
          <a href="/trades" onclick="closeMobileMenuAndNavigate(event, '/trades')">
            <i data-lucide="list" style="width:16px;height:16px;"></i> <span data-i18n="nav.trades">${tt('nav.trades', 'İşlemler')}</span>
          </a>
          <a href="/strategies" onclick="closeMobileMenuAndNavigate(event, '/strategies')">
            <i data-lucide="target" style="width:16px;height:16px;"></i> <span data-i18n="nav.strategies">${tt('nav.strategies', 'Stratejiler')}</span>
          </a>
          <a href="/calendar" onclick="closeMobileMenuAndNavigate(event, '/calendar')">
            <i data-lucide="calendar" style="width:16px;height:16px;"></i> <span data-i18n="nav.calendar">${tt('nav.calendar', 'Takvim')}</span>
          </a>
          <a href="/backtest" id="nav-backtest-link-mobile" onclick="closeMobileMenuAndNavigate(event, '/backtest')">
            <i data-lucide="history" style="width:16px;height:16px;"></i> <span data-i18n="nav.backtest">${tt('nav.backtest', 'Backtest')}</span>
          </a>
        </div>

        <div class="menu-section">
          <div class="menu-section-title" data-i18n="nav.menu_pro">${menuPro}</div>
          <a href="/analytics" data-pro-link onclick="closeMobileMenuAndNavigate(event, '/analytics')">
            <i data-lucide="line-chart" style="width:16px;height:16px;"></i> <span data-i18n="nav.analysis">${tt('nav.analysis', 'Analiz')}</span>
          </a>
          <a href="/settings#panel-appearance" onclick="closeMobileMenuAndNavigate(event, '/settings#panel-appearance')">
            <i data-lucide="palette" style="width:16px;height:16px;"></i> <span data-i18n="nav.theme_customization">${tt('nav.theme_customization', 'Tema Özelleştirme')}</span>
          </a>
          <a href="/settings#panel-overtrade" onclick="closeMobileMenuAndNavigate(event, '/settings#panel-overtrade')">
            <i data-lucide="bell" style="width:16px;height:16px;"></i> <span data-i18n="nav.overtrade_alert">${tt('nav.overtrade_alert', 'Over Trade Uyarısı')}</span>
          </a>
          <a href="/settings#panel-plan" class="go-pro" onclick="closeMobileMenuAndNavigate(event, '/settings#panel-plan')">
            <i data-lucide="rocket" style="width:16px;height:16px;"></i> <span data-i18n="nav.upgrade_pro">${tt('nav.upgrade_pro', "Pro'ya Geç →")}</span>
          </a>
        </div>

        <div class="menu-section">
          <div class="menu-section-title" data-i18n="nav.menu_account">${menuAccount}</div>
          <a href="/settings#panel-profile" onclick="closeMobileMenuAndNavigate(event, '/settings#panel-profile')">
            <i data-lucide="user" style="width:16px;height:16px;"></i> <span data-i18n="nav.profile">${tt('nav.profile', 'Profil')}</span>
          </a>
          <a href="/settings" onclick="closeMobileMenuAndNavigate(event, '/settings')">
            <i data-lucide="settings" style="width:16px;height:16px;"></i> <span data-i18n="nav.settings">${tt('nav.settings', 'Ayarlar')}</span>
          </a>
          <a href="/my-earnings" onclick="closeMobileMenuAndNavigate(event, '/my-earnings')">
            <i data-lucide="dollar-sign" style="width:16px;height:16px;"></i> <span data-i18n="nav.earnings">${tt('nav.earnings', 'Kazançlarım')}</span>
          </a>
          <a href="/report-bug" onclick="closeMobileMenuAndNavigate(event, '/report-bug')">
            <i data-lucide="bug" style="width:16px;height:16px;"></i> <span data-i18n="nav.report_bug">${tt('nav.report_bug', 'Hata Bildir')}</span>
          </a>
          <a href="/support">
            <i data-lucide="life-buoy" style="width:16px;height:16px;"></i> <span data-i18n="nav.help">${tt('nav.help', 'Yardım Merkezi')}</span>
          </a>
          <span id="admin-link-mobile" style="display:none;">
            <a href="/admin" onclick="closeMobileMenuAndNavigate(event, '/admin')">
              <i data-lucide="shield" style="width:16px;height:16px;"></i> <span data-i18n="nav.admin">${tt('nav.admin', 'Admin')}</span>
            </a>
          </span>
          <button id="logout-btn-mobile">
            <i data-lucide="log-out" style="width:16px;height:16px;"></i> <span data-i18n="nav.logout">${tt('nav.logout', 'Çıkış Yap')}</span>
          </button>
        </div>

      </div>
    </div>
  `;
}

function updateNavbarI18n() {
  if (typeof i18n === 'undefined' || typeof i18n.t !== 'function') {
    return;
  }
  var textUpdates = [];
  var placeholderUpdates = [];
  var htmlUpdates = [];

  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    // same as i18n.js: {n}-style placeholders come from data-i18n-params (without them "Grafik 2" became "Chart {n}")
    var params;
    try { params = JSON.parse(el.getAttribute('data-i18n-params') || 'null') || undefined; } catch (e) { params = undefined; }
    var translation = i18n.t(key, params);
    if (translation && translation !== key && el.textContent !== translation) {
      textUpdates.push({ el: el, translation: translation });
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
    var key = el.getAttribute('data-i18n-placeholder');
    var translation = i18n.t(key);
    if (translation && translation !== key && el.getAttribute('placeholder') !== translation) {
      placeholderUpdates.push({ el: el, translation: translation });
    }
  });

  document.querySelectorAll('[data-i18n-html]').forEach(function(el) {
    var key = el.getAttribute('data-i18n-html');
    var params;
    try { params = JSON.parse(el.getAttribute('data-i18n-params') || 'null') || undefined; } catch (e) { params = undefined; }
    var translation = i18n.t(key, params);
    if (translation && translation !== key && el.innerHTML !== translation) {
      htmlUpdates.push({ el: el, translation: sanitizeHTML(translation) });
    }
  });

  textUpdates.forEach(function(item) { item.el.textContent = item.translation; });
  placeholderUpdates.forEach(function(item) { item.el.setAttribute('placeholder', item.translation); });
  htmlUpdates.forEach(function(item) { item.el.innerHTML = item.translation; });

  if (typeof window.renderNotifications === 'function') {
    try { window.renderNotifications(); } catch(e) {}
  }

  if (typeof updateNavbarJournal === 'function') {
    try { updateNavbarJournal(0); } catch(e) {}
  }

  updateNavbarBadgeSync();
}

if (typeof window !== 'undefined') {
  if (window.i18n && typeof window.i18n.onChange === 'function') {
    window.i18n.onChange(function() {
      updateNavbarI18n();
    });
  } else if (window.i18nReady && typeof window.i18nReady.then === 'function') {
    window.i18nReady.then(function() {
      if (window.i18n && typeof window.i18n.onChange === 'function') {
        window.i18n.onChange(function() {
          updateNavbarI18n();
        });
      }
    });
  }
}

// Backtest v2 (Faz 1, pratik modu): link giriş yapmış herkese gösterilir (izinleri veritabanı belirler)
function showBacktestLink() {
  var l = document.getElementById('nav-backtest-link');
  var lm = document.getElementById('nav-backtest-link-mobile');
  if (l) l.style.display = '';
  if (lm) lm.style.display = '';
}

function applyAvatarToNav(url) {
  var navAvatar = document.getElementById('user-avatar');
  var menuAvatar = document.getElementById('menu-user-avatar');
  var menuName = document.getElementById('menu-user-name');
  var user = window.SETTINGS_STATE?.currentUser || null;
  var fullName = user?.user_metadata?.username || user?.email || sessionStorage.getItem('ww_user_display_name') || 'Kullanıcı';
  var initial = fullName.charAt(0)?.toUpperCase() || '?';

  if (navAvatar) {
    if (url) {
      var safeUrl = sanitizeURL(url);
      if (safeUrl) {
        navAvatar.innerHTML = '<img src="' + safeUrl + '" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
        navAvatar.style.background = 'transparent';
      } else {
        navAvatar.innerHTML = '<span id="nav-avatar-text" style="font-size:13px;font-weight:600;">' + sanitizeHTML(initial) + '</span>';
        navAvatar.style.background = ''; // CSS: vurgu gradyanı (gri zeminde açık temada beyaz harf görünmüyordu)
      }
    } else {
      navAvatar.innerHTML = '<span id="nav-avatar-text" style="font-size:13px;font-weight:600;">' + sanitizeHTML(initial) + '</span>';
      navAvatar.style.background = ''; // CSS: vurgu gradyanı (gri zeminde açık temada beyaz harf görünmüyordu)
    }
  }

  if (menuAvatar) {
    if (url) {
      var safeUrl2 = sanitizeURL(url);
      if (safeUrl2) {
        menuAvatar.innerHTML = '<img src="' + safeUrl2 + '" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
        menuAvatar.style.background = 'transparent';
      } else {
        menuAvatar.innerHTML = '<span id="menu-avatar-text" style="font-size:20px;font-weight:600;">' + sanitizeHTML(initial) + '</span>';
        menuAvatar.style.background = '';
      }
    } else {
      menuAvatar.innerHTML = '<span id="menu-avatar-text" style="font-size:20px;font-weight:600;">' + sanitizeHTML(initial) + '</span>';
      menuAvatar.style.background = '';
    }
  }

  if (menuName) {
    var displayName = fullName;
    if (displayName && displayName.includes('@')) displayName = displayName.split('@')[0];
    menuName.textContent = displayName || 'Kullanıcı';
  }

  // Avatar menüsü başlığı: kim olduğun (ad + e-posta)
  var ddName = document.getElementById('nav-dd-name');
  var ddEmail = document.getElementById('nav-dd-email');
  var email = (user && user.email) || (window.__wwUserProfile && window.__wwUserProfile.email) || sessionStorage.getItem('ww_user_email') || '';
  if (ddName) {
    var shortName = fullName && fullName.includes('@') ? fullName.split('@')[0] : fullName;
    ddName.textContent = shortName || 'Kullanıcı';
  }
  if (ddEmail) {
    ddEmail.textContent = email && email !== fullName ? email : '';
    ddEmail.style.display = ddEmail.textContent ? '' : 'none';
  }
}

async function loadNavbarAvatar() {
  try {
    var sb = window.sb || window.supabase;
    if (!sb) return;

    var storedUserId = sessionStorage.getItem('ww_user_id');
    var storedDisplayName = sessionStorage.getItem('ww_user_display_name');
    var storedAvatar = sessionStorage.getItem('ww_avatar_url');
    var storedTime = sessionStorage.getItem('ww_avatar_time');
    var storedIsAdmin = sessionStorage.getItem('ww_user_is_admin');
    var now = Date.now();

    if (storedDisplayName || storedUserId) {
      if (!window.SETTINGS_STATE) window.SETTINGS_STATE = {};
      if (!window.SETTINGS_STATE.currentUser) {
        window.SETTINGS_STATE.currentUser = {
          id: storedUserId || null,
          user_metadata: { username: storedDisplayName || '' }
        };
      } else if (!window.SETTINGS_STATE.currentUser.id && storedUserId) {
        window.SETTINGS_STATE.currentUser.id = storedUserId;
      }
    }

    if (storedTime && (now - parseInt(storedTime, 10)) < 300000 && storedUserId) {
      var av = (storedAvatar && storedAvatar !== 'none') ? storedAvatar : null;
      cachedAvatarUrl = av;
      applyAvatarToNav(av);
      if (storedIsAdmin === 'true') {
        var al = document.getElementById('admin-link');
        var alm = document.getElementById('admin-link-mobile');
        if (al) al.style.display = 'inline';
        if (alm) alm.style.display = 'block';
      }
      showBacktestLink();
      return;
    }

    var sessionRes = await sb.auth.getSession();
    var user = sessionRes?.data?.session?.user;
    if (!user) return;

    if (!window.SETTINGS_STATE) window.SETTINGS_STATE = {};
    window.SETTINGS_STATE.currentUser = user;
    if (user.id) sessionStorage.setItem('ww_user_id', user.id);
    if (user.email) { try { sessionStorage.setItem('ww_user_email', user.email); } catch (e) {} }
    
    var isAdminUser = (user?.app_metadata?.role === 'admin');
    sessionStorage.setItem('ww_user_is_admin', isAdminUser ? 'true' : 'false');
    if (isAdminUser) {
      var al = document.getElementById('admin-link');
      var alm = document.getElementById('admin-link-mobile');
      if (al) al.style.display = 'inline';
      if (alm) alm.style.display = 'block';
    }
    showBacktestLink();

    var displayName = user?.user_metadata?.username || user?.email || 'Kullanıcı';
    if (displayName) {
      sessionStorage.setItem('ww_user_display_name', displayName);
      try { localStorage.setItem('ww_user_display_name', displayName); } catch (e) {}
    }

    var avatarUrl = null;
    if (window.__wwUserProfile && window.__wwUserProfile.id === user.id) {
      avatarUrl = window.__wwUserProfile.avatar_url || null;
    } else {
      var { data: profile } = await sb.from('user_profiles').select('avatar_url').eq('id', user.id).single();
      avatarUrl = profile?.avatar_url || null;
    }

    cachedAvatarUrl = avatarUrl;
    sessionStorage.setItem('ww_avatar_url', avatarUrl || 'none');
    try { localStorage.setItem('ww_avatar_url', avatarUrl || 'none'); } catch (e) {}
    sessionStorage.setItem('ww_avatar_time', String(now));
    applyAvatarToNav(avatarUrl);
  } catch (e) {
    var fallbackAvatar = sessionStorage.getItem('ww_avatar_url');
    applyAvatarToNav((fallbackAvatar && fallbackAvatar !== 'none') ? fallbackAvatar : null);
  }
}

function updateBadgeUI(isPro, expiresAt) {
  var badge = document.getElementById('plan-badge');
  var text = document.getElementById('plan-text');
  var menuPlan = document.getElementById('menu-user-plan');
  var tipTitle = document.getElementById('plan-tooltip-title');
  var tipSub = document.getElementById('plan-tooltip-sub');

  if (window.SETTINGS_STATE) window.SETTINGS_STATE.isPro = isPro;

  if (badge) {
    if (isPro) badge.classList.add('pro');
    else badge.classList.remove('pro');
  }

  if (isPro) {
    document.documentElement.classList.add('is-pro');
    if (document.body) document.body.classList.add('is-pro');
  } else {
    document.documentElement.classList.remove('is-pro');
    if (document.body) document.body.classList.remove('is-pro');
  }

  // Pro kullanıcılarda upgrade butonlarını ve PRO etiketini tamamen gizle
  try {
    var upgradeEls = document.querySelectorAll('.nav-upgrade-wrapper, .nav-upgrade-item, .nav-upgrade-divider, .go-pro, #pro-menu-footer, #avatar-upgrade-link, #avatar-upgrade-divider, .pro-menu-tag');
    upgradeEls.forEach(function(el) {
      el.style.display = isPro ? 'none' : '';
    });
  } catch (e) {}

  var proText = t('nav.pro_badge', 'Pro');
  var freeText = t('nav.free_badge', 'Free');

  if (text) text.textContent = isPro ? proText : freeText;

  // Tooltip içeriğini güncelle (kalan süre ve bitiş tarihi)
  if (tipTitle && tipSub) {
    var currentLang = (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) ? i18n.getCurrentLanguage() : 'tr';
    var locale = currentLang === 'en' ? 'en-US' : currentLang === 'de' ? 'de-DE' : 'tr-TR';

    if (!isPro) {
      tipTitle.textContent = t('nav.plan_tooltip_free', 'Ücretsiz Plan');
      tipSub.textContent = t('nav.plan_tooltip_free_desc', 'Sınırsız Süre');
    } else if (!expiresAt) {
      tipTitle.textContent = t('nav.plan_tooltip_pro', 'Pro Üyelik');
      tipSub.textContent = t('nav.plan_tooltip_lifetime', 'Sınırsız Erişim');
    } else {
      var exp = new Date(expiresAt);
      if (isNaN(exp.getTime())) {
        tipTitle.textContent = t('nav.plan_tooltip_pro', 'Pro Üyelik');
        tipSub.textContent = t('nav.plan_tooltip_lifetime', 'Sınırsız Erişim');
      } else {
        var diffMs = exp.getTime() - Date.now();
        if (diffMs <= 0) {
          tipTitle.textContent = t('nav.plan_tooltip_expired', 'Süresi Doldu');
          tipSub.textContent = t('nav.plan_tooltip_expires', 'Bitiş: {date}', {
            date: exp.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
          });
        } else {
          var daysLeft = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          var dateStr = exp.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
          if (daysLeft > 0) {
            tipTitle.textContent = t('nav.plan_tooltip_days_left', '{d} gün kaldı', { d: daysLeft });
            tipSub.textContent = t('nav.plan_tooltip_expires', 'Bitiş: {date}', { date: dateStr });
          } else {
            var hoursLeft = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60)));
            tipTitle.textContent = t('nav.plan_tooltip_hours_left', '{h} saat kaldı', { h: hoursLeft });
            tipSub.textContent = t('nav.plan_tooltip_expires', 'Bitiş: {date}', {
              date: exp.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
            });
          }
        }
      }
    }
  }

  if (menuPlan) {
    var dot = menuPlan.querySelector('.plan-dot');
    var planTextEl = menuPlan.querySelector('.plan-text');
    if (dot) {
      if (isPro) {
        dot.style.background = 'var(--accent2)';
        dot.style.boxShadow = '0 0 8px rgba(var(--ac-rgb),0.4)';
      } else {
        dot.style.background = 'var(--green)';
        dot.style.boxShadow = 'none';
      }
    }
    if (planTextEl) {
      planTextEl.textContent = isPro ? proText : freeText;
      planTextEl.style.color = isPro ? 'var(--accent2)' : 'var(--green)';
    }
  }
}
window.updateBadgeUI = updateBadgeUI;

async function updateNavbarBadge() {
  try {
    var badge = document.getElementById('plan-badge');
    var text = document.getElementById('plan-text');
    if (!badge || !text) return;

    var isPendingPay = sessionStorage.getItem('ww_pending_payment') === 'true' || 
                       localStorage.getItem('ww_pending_payment') === 'true' ||
                       window.location.search.includes('payment=success');

    var now = Date.now();
    var storedPlan = sessionStorage.getItem('ww_user_plan');
    var storedExp = sessionStorage.getItem('ww_user_plan_expires_at');
    var storedPlanTime = sessionStorage.getItem('ww_user_plan_time');
    if (!isPendingPay && storedPlan && storedPlanTime && (now - parseInt(storedPlanTime, 10)) < 300000) {
      updateBadgeUI(storedPlan === 'premium', storedExp || null);
      return;
    }

    if (window.__wwUserProfile && window.__wwUserProfile.plan) {
      var isPrem = window.__wwUserProfile.plan === 'premium';
      var expVal = window.__wwUserProfile.plan_expires_at || null;
      sessionStorage.setItem('ww_user_plan', isPrem ? 'premium' : 'free');
      try { localStorage.setItem('ww_user_plan', isPrem ? 'premium' : 'free'); } catch (e) {}
      sessionStorage.setItem('ww_user_plan_expires_at', expVal || '');
      sessionStorage.setItem('ww_user_plan_time', String(now));
      updateBadgeUI(isPrem, expVal);
      return;
    }

    var sb = window.sb || window.supabase;
    if (!sb) { updateNavbarBadgeSync(); return; }

    var sessionRes = await sb.auth.getSession();
    var user = sessionRes?.data?.session?.user;
    if (!user) { updateNavbarBadgeSync(); return; }

    var { data: profile } = await sb.from('user_profiles').select('plan, plan_expires_at').eq('id', user.id).single();
    var isPro = profile?.plan === 'premium';
    var expiresAt = profile?.plan_expires_at || null;

    try {
      sessionStorage.setItem('ww_user_plan', isPro ? 'premium' : 'free');
      try { localStorage.setItem('ww_user_plan', isPro ? 'premium' : 'free'); } catch (e) {}
      sessionStorage.setItem('ww_user_plan_expires_at', expiresAt || '');
      sessionStorage.setItem('ww_user_plan_time', String(Date.now()));
    } catch (e) {}

    updateBadgeUI(isPro, expiresAt);
  } catch (e) {
    var fallbackPlan = sessionStorage.getItem('ww_user_plan');
    var fallbackExp = sessionStorage.getItem('ww_user_plan_expires_at');
    if (fallbackPlan) updateBadgeUI(fallbackPlan === 'premium', fallbackExp || null);
    else updateNavbarBadgeSync();
  }
}

function updateNavbarBadgeSync() {
  try {
    var badge = document.getElementById('plan-badge');
    var text = document.getElementById('plan-text');
    if (!badge || !text) return;
    var plan = localStorage.getItem('ww_user_plan') || sessionStorage.getItem('ww_user_plan');
    var isPro = (plan === 'premium') || (window.SETTINGS_STATE?.isPro === true);
    var exp = localStorage.getItem('ww_user_plan_expires_at') || sessionStorage.getItem('ww_user_plan_expires_at') || null;
    updateBadgeUI(isPro, exp);
  } catch (e) {}
}

function setActiveNavLink() {
  var currentPath = window.location.pathname;
  var navLinks = document.querySelectorAll('.nav-links a, .nav-menu-inner a');

  // Linkler temiz adres (/trades); eski ".html" biçimi de aynı sayfa sayılır. "#panel-..." ekli linkler
  // (ayar kısayolları) bölüm linki değildir, eskisi gibi eşleşmez.
  var clean = function(p) {
    return p.replace(/\/index\.html(?=$|[?#])/, '/').replace(/\.html(?=$|[?#])/, '');
  };
  var current = clean(currentPath);
  var SECTIONS = ['/dashboard', '/trades', '/strategies', '/calendar', '/backtest', '/journals', '/settings', '/analytics', '/admin'];

  var isLinkMatching = function(href) {
    if (!href) return false;
    var target = clean(href);
    if (current === '/') return target === '/';
    for (var i = 0; i < SECTIONS.length; i++) {
      if (current.indexOf(SECTIONS[i]) !== -1 && target === SECTIONS[i]) return true;
    }
    return target === current;
  };

  navLinks.forEach(function(link) {
    var href = link.getAttribute('href');
    var shouldBeActive = isLinkMatching(href);
    if (shouldBeActive && !link.classList.contains('active')) {
      link.classList.add('active');
    } else if (!shouldBeActive && link.classList.contains('active')) {
      link.classList.remove('active');
    }
    // Ekran okuyucu "geçerli sayfa" der; "#panel-..." kısayolları hiç eşleşmediği için işaretlenmez
    if (shouldBeActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

// Açılır menülerin aria-expanded değeri: menüler birçok yerden (dışarı tıklama, ESC, SPA geçişi, hash değişimi)
// doğrudan sınıfla kapatılıyor; her yere ayrı kod eklemek yerine sınıf değişimi izlenir ve düğmeye yansıtılır.
function wwSyncNavAria() {
  var pairs = [
    ['nav-journal-switcher', 'open', '#nav-journal-switcher .journal-switch-btn'],
    ['dropdown-menu', 'show', '#user-avatar'],
    ['bell-panel', 'open', '#overtrade-bell-btn'],
    ['nav-menu', 'open', '#nav-toggle']
  ];
  pairs.forEach(function(p) {
    var panel = document.getElementById(p[0]);
    var btn = document.querySelector(p[2]);
    if (!panel || !btn) return;
    var sync = function() { btn.setAttribute('aria-expanded', panel.classList.contains(p[1]) ? 'true' : 'false'); };
    sync();
    if (panel._wwAriaObs || typeof MutationObserver === 'undefined') return;
    panel._wwAriaObs = new MutationObserver(sync);
    panel._wwAriaObs.observe(panel, { attributes: true, attributeFilter: ['class'] });
  });
}

var avatarDropdownInitialized = false;

function setupAvatarDropdown() {
  if (avatarDropdownInitialized) return;
  avatarDropdownInitialized = true;
}

// ============================================================
// ⭐ FIX: initNavEvents — butonlara event listener EKLEMİYORUZ.
// Inline onclick (HTML'de) tek handler olarak kalıyor.
// Böylece çift fire problemi çözüldü.
// ============================================================
function initNavEvents() {
  wwLog.log('🔗 Navbar event\'leri bağlanıyor...');

  // Journal change → dropdown'u yenile
  if (!window._journalChangedBound) {
    window._journalChangedBound = true;
    document.addEventListener('journal-changed', function() { updateNavbarJournal(0); });
  }

  // Global dropdown listener: outside-click, internal link click, and Escape
  if (!window._navGlobalListenersBound) {
    window._navGlobalListenersBound = true;

    // 1. Dışarı tıklanınca tüm açık dropdown'ları kapat
    document.addEventListener('click', function(e) {
      if (!e.target || !e.target.closest) return;
      var isInsideNav = e.target.closest(
        '#pro-dropdown-btn, #pro-dropdown-menu, ' +
        '#overtrade-bell-btn, #bell-panel, ' +
        '#nav-journal-switcher, ' +
        '#user-avatar, #dropdown-menu, ' +
        '#nav-toggle, #nav-menu'
      );
      if (!isInsideNav) {
        closeAllNavDropdowns();
      }
    });

    // 2. Menü içindeki linklere tıklandığında menüleri kapat & panel yönlendirmesini sağla
    document.addEventListener('click', function(e) {
      if (!e.target || !e.target.closest) return;
      var a = e.target.closest('#pro-dropdown-menu a, #journal-dropdown a, #journal-dropdown button, #bell-panel a, #dropdown-menu a');
      if (a) {
        var href = a.getAttribute('href') || '';
        if (href.indexOf('#panel-') !== -1 && window.location.pathname.indexOf('settings') !== -1) {
          var panelId = href.split('#')[1];
          if (panelId && typeof window.switchPanel === 'function') {
            e.preventDefault();
            window.switchPanel(panelId);
          }
        }
        setTimeout(function() {
          closeAllNavDropdowns();
        }, 60);
      }
    });

    // 3. ESC tuşuna basılınca tüm dropdown'ları kapat
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        closeAllNavDropdowns();
      }
    });

    // 4. "+ İşlem Ekle": sayfada hızlı ekleme varsa pencereyi açar, yoksa işlem ekleme sayfasına gider
    document.addEventListener('click', function(e) {
      if (!e.target || !e.target.closest) return;
      if (e.target.closest('#nav-add-trade')) {
        e.preventDefault();
        closeAllNavDropdowns();
        wwOpenAddTrade();
        return;
      }
      // Analiz (Analiz): Pro değilse sayfaya gitmek yerine yükseltme penceresi
      var pl = e.target.closest('a[data-pro-link]');
      if (pl && !wwIsProCached() && typeof window.openUpgradeModal === 'function') {
        e.preventDefault();
        window.openUpgradeModal({ feature: 'analytics_dashboard' });
      }
    });

    // 5. "N" kısayolu: yazı alanında değilken yeni işlem
    document.addEventListener('keydown', function(e) {
      if (e.key !== 'n' && e.key !== 'N') return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      var t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (wwOpenModalDialog()) return;
      if (!wwQuickAddReady()) return;
      e.preventDefault();
      wwOpenAddTrade();
    });
  }

  loadLucideIcons();
  setupAvatarDropdown();
  wwSyncNavAria();

  // Bell kapatma butonu
  var bellClose = document.getElementById('bell-panel-close');
  if (bellClose && !bellClose._bound) {
    bellClose._bound = true;
    bellClose.addEventListener('click', function(e) {
      e.stopPropagation();
      var panel = document.getElementById('bell-panel');
      if (panel) panel.classList.remove('open');
    });
  }

  // Logout dropdown butonu
  var logoutBtn = document.getElementById('logout-dropdown-btn');
  if (logoutBtn && !logoutBtn._bound) {
    logoutBtn._bound = true;
    logoutBtn.addEventListener('click', async function(e) {
      e.preventDefault();
      var sb = window.sb || window.supabase;
      if (sb) await sb.auth.signOut();
      localStorage.removeItem('ww_last_active_push');
      try {
        sessionStorage.removeItem('ww_user_plan');
        sessionStorage.removeItem('ww_avatar_url');
        sessionStorage.removeItem('ww_user_display_name');
        sessionStorage.removeItem('ww_active_journal_id');
      } catch(e) {}
      window.location.href = '/';
    });
  }

  // Hamburger menü
  var toggle = document.getElementById('nav-toggle');
  var menu = document.getElementById('nav-menu');
  var backdrop = document.getElementById('nav-backdrop');

  if (toggle && menu && backdrop && !toggle._bound) {
    toggle._bound = true;
    toggle.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var isOpen = this.classList.toggle('open');
      menu.classList.toggle('open');
      backdrop.classList.toggle('open');
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    backdrop.addEventListener('click', function() {
      toggle.classList.remove('open');
      menu.classList.remove('open');
      backdrop.classList.remove('open');
      document.body.style.overflow = '';
    });
  }

  // Mobil logout
  var logoutMobile = document.getElementById('logout-btn-mobile');
  if (logoutMobile && !logoutMobile._bound) {
    logoutMobile._bound = true;
    logoutMobile.addEventListener('click', function(e) {
      e.preventDefault();
      var toggleEl = document.getElementById('nav-toggle');
      if (toggleEl) toggleEl.classList.remove('open');
      var menuEl = document.getElementById('nav-menu');
      if (menuEl) menuEl.classList.remove('open');
      var backdropEl = document.getElementById('nav-backdrop');
      if (backdropEl) backdropEl.classList.remove('open');
      document.body.style.overflow = '';
      var logoutBtnEl = document.getElementById('logout-dropdown-btn');
      if (logoutBtnEl) logoutBtnEl.click();
    });
  }

  navEventsInitialized = true;
  wwLog.log('✅ Navbar event\'leri bağlandı!');
}

function loadNavbar(containerId) {
  var container = document.getElementById(containerId);
  if (!container) {
    console.error('❌ Navbar container bulunamadı:', containerId);
    return;
  }

  if (navbarRendered) {
    setTimeout(function() {
      updateNavbarI18n();
      loadNavbarAvatar();
      updateNavbarBadge();
      updateNotificationBadge();
      setActiveNavLink();
      loadLucideIcons();
      initNavEvents();
      updateNavbarJournal(0);
    }, 50);
    return;
  }

  var translations = {};
  if (typeof i18n !== 'undefined' && typeof i18n.t === 'function') {
    var navbarKeys = [
      'nav.dashboard', 'nav.trades', 'nav.strategies', 'nav.calendar', 'nav.backtest', 'nav.admin', 'nav.journals',
      'nav.pro', 'nav.analytics_dashboard', 'nav.theme_customization', 'nav.overtrade_alert',
      'nav.upgrade_pro', 'nav.notifications', 'nav.mark_read', 'nav.no_notifications',
      'nav.profile', 'nav.settings', 'nav.logout', 'nav.home', 'nav.pro_badge',
      'nav.free_badge', 'nav.menu_general', 'nav.menu_pro', 'nav.menu_account', 'nav.report_bug'
    ];
    navbarKeys.forEach(function(key) { translations[key] = i18n.t(key); });
  }

  container.innerHTML = getNavbarHTML(translations);
  navbarRendered = true;

  requestAnimationFrame(function() {
    setActiveNavLink();
    document.querySelectorAll('.nav-links a').forEach(function(link) {
      link.classList.add('loaded');
    });
  });

  setTimeout(function() {
    initNavEvents();
    loadNavbarAvatar();
    updateNavbarBadge();
    updateNotificationBadge();
    updateNavbarJournal(0);
    wwLog.log('✅ Navbar tamamen yüklendi!');
  }, 50);
}

function hydrateExistingNavbar() {
  if (window.__wwNavbarHydrated) return true;
  var container = document.getElementById('navbar-container');
  if (container && container.children.length > 0) {
    window.__wwNavbarHydrated = true;
    navbarRendered = true;
    setActiveNavLink();
    initNavEvents();
    loadNavbarAvatar();
    updateNavbarBadge();
    updateNotificationBadge();
    loadLucideIcons();
    updateNavbarJournal(0);
    return true;
  }
  return false;
}

function initNavbarBoot() {
  if (window.__wwNavbarBooted) return;
  window.__wwNavbarBooted = true;

  if (!hydrateExistingNavbar()) {
    var container = document.getElementById('navbar-container');
    if (container) loadNavbar('navbar-container');
  }

  window.addEventListener('hashchange', function() {
    var toggle = document.getElementById('nav-toggle');
    var menu = document.getElementById('nav-menu');
    var backdrop = document.getElementById('nav-backdrop');
    if (toggle) toggle.classList.remove('open');
    if (menu) menu.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    document.body.style.overflow = '';
    setActiveNavLink();
  });

  window.addEventListener('popstate', function() {
    setActiveNavLink();
  });

  // SPA geçişi (SpaRouter.astro): navbar sayfalar arasında kalıcı; tam yüklemedeki
  // gibi açık menüler (mobil menü, bildirimler, avatar...) yeni sayfada kapalı gelsin
  document.addEventListener('astro:after-swap', function() {
    closeAllNavDropdowns();
    setActiveNavLink();
  });

  window.addEventListener('load', function() {
    loadLucideIcons();
  });

  window.addEventListener('storage', function(e) {
    if (e.key === 'ww_language' && e.newValue) {
      updateNavbarI18n();
      updateNavbarBadgeSync();
      loadLucideIcons();
      initNavEvents();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNavbarBoot);
} else {
  initNavbarBoot();
}

window.setActiveNavLink = setActiveNavLink;
window.updateNavbarI18n = updateNavbarI18n;
window.updateNavbarBadge = updateNavbarBadge;
window.updateNavbarBadgeSync = updateNavbarBadgeSync;
window.loadNavbar = loadNavbar;
window.sanitizeHTML = sanitizeHTML;
window.sanitizeURL = sanitizeURL;
window.loadLucideIcons = loadLucideIcons;
window.initNavEvents = initNavEvents;

window.refreshNavbar = function() {
  updateNavbarI18n();
  updateNavbarBadgeSync();
  setActiveNavLink();
  loadNavbarAvatar();
  loadLucideIcons();
  initNavEvents();
};

wwLog.log('✅ navbar.js yüklendi! (CLIENT-SIDE RENDER + AVATAR CACHE + FRESH BADGE)');

// ============================================================
// ============================================================
// ⭐ INSTANT NAVBAR JOURNAL (CACHE-FIRST + 0ms SWR)
// ============================================================
function safeEscape(str) {
  if (typeof window !== 'undefined' && typeof window.sanitizeHTML === 'function') {
    return window.sanitizeHTML(str);
  }
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Hesabın küçük işareti: renk noktası (prop firma/broker bağlıysa yanıp söner). WwJournalMark yüklenmediyse boş döner.
function journalMarkHtml(j, propAcc, hasBroker, dotSize) {
  var M = window.WwJournalMark;
  if (!M) return '';
  return M.html({
    color: j && j.color,
    prop: M.propInfoOf(propAcc),
    broker: !!hasBroker,
    dotSize: dotSize
  });
}

function getPropBadgeHtml(propAcc) {
  if (!propAcc) return '';
  var firm = (propAcc.rules && propAcc.rules.firm) ||
    (window.PropTemplates && window.PropTemplates.getPropTemplate(propAcc.template_key) && window.PropTemplates.getPropTemplate(propAcc.template_key).firm) ||
    'Prop';
  var resolver = window.getPropFirmInfo || (window.PropTemplates && window.PropTemplates.getPropFirmInfo);
  var pInfo = typeof resolver === 'function' ? resolver(firm || propAcc.template_key) : null;
  if (pInfo) {
    var logoSrc = pInfo.symbolLogo || pInfo.logo;
    return '<span class="nav-prop-tag nav-prop-firm-tag ' + (pInfo.badgeClass || '') + '"><img src="' + logoSrc + '" class="nav-prop-mini-icon" alt="" />' + safeEscape(pInfo.name) + '</span>';
  }
  return '<span class="nav-prop-tag">PROP</span>';
}

// Defterin bağlı olduğu broker: { id, name, logo, live } ya da null. ctAcc: get_ctrader_status satırı,
// mtAcc: get_mt5_status'tan küçültülmüş { platform: 'mt4' | 'mt5', is_live } (bkz. mt5MapFrom).
function navBrokerOf(ctAcc, mtAcc) {
  if (ctAcc) return { id: 'ctrader', name: 'cTrader', logo: '/images/platforms/ctrader_icon.png', live: ctAcc.is_live === true };
  if (mtAcc) {
    var mt4 = mtAcc.platform === 'mt4';
    return { id: mtAcc.platform, name: mt4 ? 'MetaTrader 4' : 'MetaTrader 5', logo: mt4 ? '/images/platforms/mt4.png' : '/images/platforms/mt5.png', live: mtAcc.is_live === true };
  }
  return null;
}

// get_mt5_status hesaplarından { journalId: { platform, is_live } } (önbelleğe yalnızca bu kadarı yazılır)
function mt5MapFrom(accounts) {
  var m = {};
  (Array.isArray(accounts) ? accounts : []).forEach(function(a) {
    if (a && a.journal_id) m[a.journal_id] = { platform: /^mt4-/i.test(String(a.ea_version || '')) ? 'mt4' : 'mt5', is_live: a.is_live === true };
  });
  return m;
}

function renderNavbarJournalUI(journals, activeJ, propMap, ctraderMap, mt5Map) {
  mt5Map = mt5Map || {};
  if (!journals || journals.length === 0 || !activeJ) return;
  var switcher = document.getElementById('nav-journal-switcher');
  var wasOpen = switcher ? switcher.classList.contains('open') : false;

  propMap = propMap || {};
  ctraderMap = ctraderMap || {};

  var activeProp = propMap[activeJ.id];
  var activeCtrader = ctraderMap[activeJ.id];

  var swName = document.querySelector('.nav-journal-switcher .journal-name');
  var swIcon = document.querySelector('.nav-journal-switcher .journal-icon');
  var badgeHtml = getPropBadgeHtml(activeProp);

  if (swName) {
    swName.textContent = activeJ.name || '';
    swName.title = activeJ.name || '';

    if (swName.parentNode) {
      var existingBadge = swName.parentNode.querySelector('.nav-prop-tag');
      if (existingBadge) existingBadge.remove();

      var existingCtDot = swName.parentNode.querySelector('.ctrader-status-dot');
      if (existingCtDot) existingCtDot.remove();

      // ⭐ Canlı Yeşil veya Neon Mor Işık Ekle
      if (activeCtrader) {
        var dotClass = activeCtrader.is_live ? 'live' : 'demo';
        var dotTitle = 'cTrader ' + (activeCtrader.is_live ? 'Live' : 'Demo') + ' (' + (activeCtrader.broker_name || 'Hesap') + ') – Senkronlamak için tıklayın';
        var dotEl = document.createElement('span');
        dotEl.className = 'ctrader-status-dot ' + dotClass;
        dotEl.id = 'nav-ctrader-dot';
        dotEl.title = dotTitle;
        dotEl.style.cursor = 'pointer';
        dotEl.onclick = function(e) {
          if (window.wwSyncCtrader) {
            window.wwSyncCtrader(e, activeCtrader.ctid_trader_account_id, activeJ.id, dotEl);
          }
        };
        swName.parentNode.insertBefore(dotEl, swName);
      }

      if (badgeHtml) {
        var tempWrapper = document.createElement('div');
        tempWrapper.innerHTML = badgeHtml;
        var badgeEl = tempWrapper.firstElementChild;
        if (badgeEl) {
          swName.parentNode.insertBefore(badgeEl, swName.nextSibling);
        }
      }
    }
  }

  // Hesap işareti: renk noktası; prop firma / broker bağlıysa yanıp söner (bkz. interface/shared/journal-mark.js)
  if (swIcon) {
    swIcon.innerHTML = journalMarkHtml(activeJ, activeProp, !!activeCtrader, 9);
  }

  // Mobil menü göstergesi
  var menuJournalName = document.getElementById('menu-journal-name');
  if (menuJournalName) {
    menuJournalName.innerHTML = safeEscape(activeJ.name) + badgeHtml;
  }
  
  var menuJournalIcon = document.querySelector('.menu-journal-icon');
  if (menuJournalIcon) {
    menuJournalIcon.innerHTML = journalMarkHtml(activeJ, activeProp, !!activeCtrader, 10);
  }

  // Dropdown listesini doldur
  var dropdown = document.getElementById('journal-dropdown');
  if (dropdown) {
    var swTitle = (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t('journal.switcher_title') : 'Hesaplar';
    var html = '<div class="journal-menu-header">' +
      '<span class="journal-menu-title">' + swTitle + '</span>' +
      '<span class="journal-menu-count">' + journals.length + '</span>' +
    '</div>';

    html += '<div class="journal-menu-list">';
    journals.forEach(function(j) {
      var isActive = (j.id === activeJ.id) ? 'active' : '';
      var tradesLabel = (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t('journal.trades_label') : 'işlem';
      if (!tradesLabel || tradesLabel === 'journal.trades_label') tradesLabel = 'işlem';
      var tradesTxt = '<span class="journal-count-num">' + (j.trade_count || 0) + '</span> <span class="journal-count-label">' + tradesLabel + '</span>';
      var itemColor = j.color || '#7c6dfa';
      var pa = propMap[j.id];
      var propItemBadge = getPropBadgeHtml(pa);
      var resolver = window.getPropFirmInfo || (window.PropTemplates && window.PropTemplates.getPropFirmInfo);
      var pInfo = (pa && typeof resolver === 'function') ? resolver((pa.rules && pa.rules.firm) || pa.template_key) : null;
      var ctAcc = ctraderMap[j.id];
      var broker = navBrokerOf(ctAcc, mt5Map[j.id]);

      // Hesap işareti: hesabın renginde nokta; prop firma / broker bağlıysa yanıp söner.
      // Broker bağlıysa işaretin sağ alt köşesinde brokerın küçük logosu durur.
      var iconWrapClass = 'journal-icon-wrap' + (broker ? ' has-broker' : '');
      var iconWrapStyle = 'background:' + itemColor + '22; color:' + itemColor + '; border-color:' + itemColor + '40;';
      var iconInner = journalMarkHtml(j, pa, !!broker, 12) +
        (broker ? '<img class="journal-broker-badge" src="' + broker.logo + '" alt="' + broker.name + '" title="' + broker.name + '" width="14" height="14" loading="lazy" />' : '');

      var ctBadgeHtml = '';
      var ctSyncBtnHtml = '';
      if (broker && !ctAcc) {
        ctBadgeHtml = '<span class="ctrader-nav-tag ' + (broker.live ? 'live' : 'demo') + '">' + (broker.live ? 'LIVE' : 'DEMO') + '</span>';
      }
      if (ctAcc) {
        ctBadgeHtml = '<span class="ctrader-nav-tag ' + (ctAcc.is_live ? 'live' : 'demo') + '">' + (ctAcc.is_live ? 'LIVE' : 'DEMO') + '</span>';
        // NOT: kart bir <button>; içine ikinci bir <button> koymak geçersiz HTML'dir (innerHTML ayrıştırıcısı dıştaki
        // butonu kapatıp bunu kartın DIŞINA atıyordu). Bu yüzden <span role="button"> kullanılır.
        ctSyncBtnHtml = '<span class="ctrader-nav-sync-btn" role="button" tabindex="0" title="cTrader ile Senkronla" aria-label="cTrader ile Senkronla" ' +
          'onclick="window.wwSyncCtrader && window.wwSyncCtrader(event, \'' + ctAcc.ctid_trader_account_id + '\', \'' + j.id + '\', this)" ' +
          'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){window.wwSyncCtrader && window.wwSyncCtrader(event, \'' + ctAcc.ctid_trader_account_id + '\', \'' + j.id + '\', this)}">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>' +
        '</span>';
      }

      html += '<button class="journal-item ' + isActive + '" data-id="' + j.id + '" type="button" title="' + safeEscape(j.name) + '">' +
        '<div class="' + iconWrapClass + '" style="' + iconWrapStyle + '">' +
          iconInner +
        '</div>' +
        '<div class="journal-info">' +
          '<span class="journal-name">' + safeEscape(j.name) + propItemBadge + ctBadgeHtml + '</span>' +
          '<span class="journal-count">' + tradesTxt + '</span>' +
        '</div>' +
        ctSyncBtnHtml +
        '<i data-lucide="check" class="journal-check"></i>' +
      '</button>';
    });
    html += '</div>';

    var manageTxt = (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t('journal.manage') : 'Hesapları Yönet';
    html += '<div class="journal-menu-footer"><a href="/journals" class="journal-manage-link"><i data-lucide="settings"></i> <span>' + manageTxt + ' →</span></a></div>';
    dropdown.innerHTML = html;

    dropdown.querySelectorAll('.journal-item').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var id = btn.dataset.id;
        if (id !== activeJ.id) {
          btn.classList.add('switching');
          var targetJ = journals.find(function(item) { return item.id === id; }) || {
            id: id,
            name: (btn.querySelector('.journal-name') && btn.querySelector('.journal-name').textContent) || 'Hesap',
            icon: 'folder',
            color: '#7c6dfa'
          };
          if (typeof window.switchJournalWithAnimation === 'function') {
            window.switchJournalWithAnimation(targetJ);
          } else if (window.PageTransition && typeof window.PageTransition.switchJournal === 'function') {
            window.PageTransition.switchJournal(targetJ);
          } else {
            if (window.journal && typeof window.journal.setActiveJournalId === 'function') {
              window.journal.setActiveJournalId(id);
            }
            window.location.reload();
          }
        } else {
          var sw = document.getElementById('nav-journal-switcher');
          if (sw) sw.classList.remove('open');
        }
      };
    });
  }

  // ⭐ Cache'i anında güncelle (Bir sonraki sayfa açılışı 0ms olsun)
  try {
    if (activeJ && activeJ.name) {
      localStorage.setItem('ww_active_journal_name', activeJ.name);
      localStorage.setItem('ww_active_journal_id', activeJ.id);
    }
    if (badgeHtml) {
      localStorage.setItem('ww_active_prop_badge_html', badgeHtml);
    } else {
      localStorage.removeItem('ww_active_prop_badge_html');
    }
    if (swIcon) {
      localStorage.setItem('ww_active_journal_icon_html', swIcon.innerHTML);
    }
    if (activeCtrader) {
      var dotCls = activeCtrader.is_live ? 'live' : 'demo';
      var dotTit = 'cTrader ' + (activeCtrader.is_live ? 'Live' : 'Demo') + ' (' + (activeCtrader.broker_name || 'Hesap') + ')';
      localStorage.setItem('ww_active_ctrader_dot_html', '<span class="ctrader-status-dot ' + dotCls + '" id="nav-ctrader-dot" title="' + dotTit + '"></span>');
    } else {
      localStorage.removeItem('ww_active_ctrader_dot_html');
    }
    localStorage.setItem('ww_cached_journals_list', JSON.stringify(journals));
    localStorage.setItem('ww_cached_props_map', JSON.stringify(propMap));
    localStorage.setItem('ww_cached_ctrader_map', JSON.stringify(ctraderMap));
    localStorage.setItem('ww_cached_nav_mt5_map', JSON.stringify(mt5Map));
  } catch(e) {}

  if (typeof lucide !== 'undefined') lucide.createIcons();
  if (wasOpen && switcher) switcher.classList.add('open');
}

function renderNavbarFromCache() {
  try {
    var rawJournals = localStorage.getItem('ww_cached_journals_list');
    var rawProps = localStorage.getItem('ww_cached_props_map');
    var rawCtrader = localStorage.getItem('ww_cached_ctrader_map');
    var activeId = (typeof window.getActiveJournalId === 'function')
      ? window.getActiveJournalId()
      : (localStorage.getItem('ww_active_journal_id') || null);

    if (rawJournals) {
      var journals = JSON.parse(rawJournals);
      var propMap = rawProps ? JSON.parse(rawProps) : {};
      var ctraderMap = rawCtrader ? JSON.parse(rawCtrader) : {};
      var rawMt5 = localStorage.getItem('ww_cached_nav_mt5_map');
      var mt5Map = rawMt5 ? JSON.parse(rawMt5) : {};
      if (Array.isArray(journals) && journals.length > 0) {
        var activeJ = (activeId && journals.find(function(j) { return j.id === activeId; }))
          || journals.find(function(j) { return j.is_default; })
          || journals[0];
        renderNavbarJournalUI(journals, activeJ, propMap, ctraderMap, mt5Map);
      }
    }
  } catch(e) {}
}

// Sayfa yüklenir yüklenmez önbellekten anında çiz
try {
  renderNavbarFromCache();
} catch(e) {}

async function updateNavbarJournal(retries) {
  // 1. Önce RAM/localStorage önbelleğinden 0ms içinde ekrana bas
  renderNavbarFromCache();

  try {
    var activeId = (window.journal && typeof window.journal.getActiveJournalId === 'function')
      ? window.journal.getActiveJournalId()
      : (localStorage.getItem('ww_active_journal_id') || null);

    // 2. Arka planda paralel sorgula
    var journalsPromise = (async function() {
      if (window.location.search.includes('test=')) {
        return [
          { id: 'j-ftmo', name: 'FTMO Challenge 100K', icon: 'briefcase', total_pnl: 4320.50, trade_count: 24, is_default: true },
          { id: 'j-fn', name: 'FundedNext Stellar 50K', icon: 'zap', total_pnl: -1250.00, trade_count: 18, is_default: false },
          { id: 'j-fp', name: 'FundingPips Master 100K', icon: 'target', total_pnl: 8120.00, trade_count: 42, is_default: false }
        ];
      }
      if (window.journal && typeof window.journal.listJournals === 'function') {
        try {
          var res = await window.journal.listJournals();
          return Array.isArray(res) ? res : [];
        } catch(e) { return []; }
      }
      return [];
    })();

    var propPromise = (async function() {
      if (window.location.search.includes('test=')) {
        return [
          { journal_id: 'j-ftmo', template_key: 'ftmo-2step', rules: { firm: 'FTMO' } },
          { journal_id: 'j-fn', template_key: 'fundednext-stellar-1step', rules: { firm: 'FundedNext' } },
          { journal_id: 'j-fp', template_key: 'fundingpips-2step', rules: { firm: 'FundingPips' } }
        ];
      }
      if (window.PropService && typeof window.PropService.getActivePropAccounts === 'function') {
        try {
          var res = await window.PropService.getActivePropAccounts();
          return Array.isArray(res) ? res : [];
        } catch(e) { return []; }
      }
      return [];
    })();

    var ctraderPromise = (async function() {
      if (window.sb && typeof window.sb.rpc === 'function') {
        try {
          return await Promise.race([
            window.sb.rpc('get_ctrader_status'),
            new Promise(function(r) { setTimeout(function() { r({ data: { accounts: [] } }); }, 1200); })
          ]);
        } catch(e) { return { data: { accounts: [] } }; }
      }
      return { data: { accounts: [] } };
    })();

    // MetaTrader 4/5 hesapları (yalnızca hangi defterin hangi platforma bağlı olduğu için; zaman aşımında önbellek kalır)
    var mt5Promise = (async function() {
      if (window.sb && typeof window.sb.rpc === 'function') {
        try {
          return await Promise.race([
            window.sb.rpc('get_mt5_status'),
            new Promise(function(r) { setTimeout(function() { r(null); }, 1200); })
          ]);
        } catch(e) { return null; }
      }
      return null;
    })();

    var [journals, activeProps, ctStatus, mt5Status] = await Promise.all([
      journalsPromise,
      propPromise,
      ctraderPromise,
      mt5Promise
    ]);

    if (!journals || journals.length === 0) return;

    var activeJ = (activeId && journals.find(function(j) { return j.id === activeId; }))
      || journals.find(function(j) { return j.is_default; })
      || journals[0];

    var propMap = {};
    (activeProps || []).forEach(function(pa) { if (pa && pa.journal_id) propMap[pa.journal_id] = pa; });

    var ctraderMap = {};
    if (ctStatus && ctStatus.data && Array.isArray(ctStatus.data.accounts)) {
      ctStatus.data.accounts.forEach(function(acc) {
        if (acc && acc.journal_id) ctraderMap[acc.journal_id] = acc;
      });
    }

    var mt5Map;
    if (mt5Status && !mt5Status.error && mt5Status.data && Array.isArray(mt5Status.data.accounts)) {
      mt5Map = mt5MapFrom(mt5Status.data.accounts);
    } else {
      try { mt5Map = JSON.parse(localStorage.getItem('ww_cached_nav_mt5_map') || '{}') || {}; } catch(e) { mt5Map = {}; }
    }

    renderNavbarJournalUI(journals, activeJ, propMap, ctraderMap, mt5Map);
    maybeAutoSyncCtrader(ctStatus && ctStatus.data);
  } catch(err) {
    if (typeof wwLog !== 'undefined') wwLog.error('updateNavbarJournal err', err);
  }
}

window.updateNavbarJournal = updateNavbarJournal;

// ⭐ Otomatik cTrader senkronu ("Siteye girdiğimde otomatik senkronla", hesap kartındaki anahtar = ctrader_accounts.auto_sync).
// Açık hesap deftere bağlıysa, erişimi duruyorsa ve son başarılı senkron 30 dk'dan eskiyse arka planda sessizce senkronlanır.
// Bu tarayıcıda 30 dk içinde denenmiş hesap tekrar denenmez (sekmeler ve sayfa geçişleri dahil; WwCtSync.autoSync).
// Bildirim yalnızca yeni işlem gelirse; bağlantı koptuysa günde en fazla bir uyarı.
var ctAutoSyncRunning = false;
function maybeAutoSyncCtrader(status) {
  if (ctAutoSyncRunning || !status || !window.WwCtSync || !window.sb || !window.sb.auth) return;
  if (/ctrader-callback/.test(window.location.pathname) || window.location.search.indexOf('test=') !== -1) return;
  ctAutoSyncRunning = true;
  var toastFn = window.showToast || window.showMsg || function() {};
  window.WwCtSync.autoSync({
    status: status,
    getToken: async function() {
      var r = await window.sb.auth.getSession();
      return r && r.data && r.data.session ? r.data.session.access_token : null;
    },
    notify: function(code, acc) {
      var label = window.WwCtSync.accountLabel(acc);
      toastFn(code === 'ACCESS_REVOKED'
        ? t('ctrader.auto.access_revoked', 'Otomatik senkron yapılamadı ({account}): cTrader bu hesaba erişim izni vermiyor. Hesaplar sayfasından yeniden yetkilendirin.', { account: label })
        : t('ctrader.auto.reconnect', 'Otomatik senkron yapılamadı: cTrader bağlantısının süresi dolmuş. Hesaplar sayfasından yeniden bağlayın.'), 'warning');
    }
  }).then(function(r) {
    if (!r || !r.ran) return;
    if (typeof wwLog !== 'undefined') wwLog.info('[ctrader] auto sync', r.ran, 'account(s),', r.inserted, 'new trade(s)');
    if (r.inserted > 0) {
      toastFn(t('ctrader.auto.inserted', 'cTrader otomatik senkron: {n} yeni işlem aktarıldı', { n: r.inserted }), 'success');
      if (window.wwCache) {
        window.wwCache.invalidate('trades');
        window.wwCache.invalidate('trades_dashboard');
      }
      window.dispatchEvent(new CustomEvent('trade-saved'));
    }
    // Sessiz kalmalı: document üzerindeki 'journal-changed' pano/takvim/işlemler sayfasını YENİDEN YÜKLER, gönderilmez.
    // Veri gösteren sayfalar yukarıdaki 'trade-saved' ile yerinde tazelenir; Hesaplar sayfası o olayı dinlemez, kartlarını
    // (yeni işlem olmasa da "son senkron" zamanı değiştiği için her seferinde) window.loadTrades ile tazeleriz.
    var onJournals = /\/journals(\.html)?$/.test(window.location.pathname);
    if (onJournals && typeof window.loadTrades === 'function') window.loadTrades();
  }).catch(function(e) {
    if (typeof wwLog !== 'undefined') wwLog.warn('[ctrader] auto sync error', e);
  }).finally(function() {
    ctAutoSyncRunning = false;
  });
}

// ============================================================
// ⭐ ARKA PLAN (K/Z ışığı): asıl motor public/components/ambient/ambient.js (window.WwAmbient).
// syncAmbientGlow eski çağıranlar için (dashboard K/Z'yi WwAmbient.setPnl ile verir).
// ============================================================
function syncAmbientGlow(overridePnl) {
  if (!window.WwAmbient) return;
  if (overridePnl === undefined || overridePnl === null) window.WwAmbient.apply();
  else window.WwAmbient.setPnl(overridePnl);
}
window.syncAmbientGlow = syncAmbientGlow;

// ⭐ cTrader Global Senkronizasyon Tetikleyici
window.wwSyncCtrader = async function(e, ctid, journalId, btn) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  if (!ctid || !journalId) return;

  var dot = document.getElementById('nav-ctrader-dot');
  if (btn) btn.classList.add('spinning');
  if (dot) {
    dot.dataset.prevClass = dot.className;
    dot.className = 'ctrader-status-dot syncing';
  }

  var toastFn = window.showToast || window.showMsg || function(m) { console.log(m); };
  toastFn('cTrader işlemleri senkronize ediliyor...', 'info');

  try {
    var sessionRes = await window.sb.auth.getSession();
    var token = sessionRes?.data?.session?.access_token;
    if (!token) throw new Error('Oturum bulunamadı.');

    if (!window.WwCtSync) throw new Error('cTrader senkron modülü yüklenemedi. Sayfayı yenileyin.');

    // Sunucu tek çağrıda en fazla ~90 sn çalışır; uzun geçmişte `done:false` döner, WwCtSync.runSync kaldığı yerden
    // devam eder (en fazla 10 tur).
    var run;
    try {
      run = await window.WwCtSync.runSync({
        ctid: ctid,
        journalId: journalId,
        token: token,
        onRound: function(r) { toastFn(t('ctrader.sync.rounds', 'Geçmiş işlemler alınıyor... ({n})', { n: r }), 'info'); }
      });
    } catch (syncErr) {
      if (syncErr.code === 'NEEDS_RECONNECT' || syncErr.code === 'ACCESS_REVOKED') {
        toastFn(syncErr.code === 'ACCESS_REVOKED'
          ? t('ctrader.err.access_revoked', 'Bu cTrader hesabına erişim izni yok. cTrader ile yeniden yetkilendirirken bu hesabı da seçin.')
          : t('ctrader.err.reconnect', 'cTrader yetkilendirme süresi dolmuş. Lütfen hesabı yeniden bağlayın.'), 'warning');
        if (!/\/journals(\.html)?$/.test(window.location.pathname)) {
          setTimeout(function() { window.location.href = '/journals'; }, 1500);
        } else if (typeof window.loadTrades === 'function') {
          window.loadTrades();                       // Hesaplar sayfası: kartın durumunu tazele
        }
        return;
      }
      if (syncErr.inserted > 0) syncErr.message += ' (' + syncErr.inserted + ' işlem yine de aktarıldı)';
      throw syncErr;
    }
    var totalInserted = run.inserted;
    var allWarnings = run.warnings;
    var data = run.last;

    // ── Sonuç bildirimleri ──
    // NOT: showToast aynı anda TEK bildirim gösterir (yenisi eskisini siler). Art arda çağırmak yalnızca SONUNCUYU
    // gösterirdi (bakiye/uyarılar hiç görünmüyordu). Bu yüzden özet tek bildirimde, uyarılar ise sırayla gösterilir.
    var summary = totalInserted > 0
      ? ('✅ ' + totalInserted + ' yeni cTrader işlemi aktarıldı')
      : 'cTrader hesabınız güncel, yeni kapanmış işlem bulunamadı';
    var notes = [];            // [mesaj, tür] — özetten sonra sırayla gösterilir
    var balanceNote = false;

    // Bakiye: yeni sunucu sürümü cevapta HER ZAMAN `balance` anahtarını döndürür (sayı ya da null).
    // Anahtar hiç yoksa sunucudaki ctrader-sync eski sürümdür (deploy edilmemiş).
    if (typeof data.balance === 'number') {
      summary += ' · Bakiye: ' + data.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
        (data.balance_currency ? ' ' + data.balance_currency : '') +
        (data.balance_source === 'last_deal' ? ' (son kapanış işlemine göre)' : '');
    } else if ('balance' in data) {
      // Güncel sunucu sürümü ama cTrader bakiye döndürmedi: nedenini göster
      balanceNote = true;
      if (data.balance_debug) console.warn('[ctrader-sync] Bakiye alınamadı:', data.balance_debug);
      notes.push(['Bakiye alınamadı' + (data.balance_debug ? '. Ayrıntı: ' + String(data.balance_debug).slice(0, 220) : '.'), 'warning']);
    } else {
      balanceNote = true;
      console.warn('[ctrader-sync] Yanıtta `balance` yok: sunucudaki fonksiyon güncel sürüm değil (deploy edilmemiş olabilir).', data);
      notes.push(['Bakiye alınamadı: sunucudaki senkron fonksiyonu güncel değil (ctrader-sync yeniden deploy edilmeli).', 'warning']);
    }
    if (data.done === false) {
      notes.push(['Geçmişin tamamı henüz alınamadı. Kalanını almak için tekrar senkronlayın.', 'warning']);
    }
    // Sunucu uyarıları (lot bilgisi alınamayan işlemler vb.); tekrar edenler tekilleştirilir, bakiye notuyla aynı olan elenir
    allWarnings
      .filter(function(w, i) { return allWarnings.indexOf(w) === i; })
      .filter(function(w) { return !(balanceNote && w.indexOf('bakiye bilgisini döndürmedi') !== -1); })
      .slice(0, 2)
      .forEach(function(w) { notes.push([w, 'warning']); });

    var toastQueue = [[summary, totalInserted > 0 ? 'success' : 'info']].concat(notes);
    toastFn(toastQueue[0][0], toastQueue[0][1]);
    toastQueue.slice(1).forEach(function(item, i) {
      setTimeout(function() { toastFn(item[0], item[1]); }, 3400 * (i + 1));
    });

    // ⚡ Sayfa YENİLENMEDEN canlı güncelle: önbellekleri düşür, 'trade-saved' gönder. Veri gösteren sayfalar bu olayla
    // kendini yerinde tazeler (Pano, İşlemler, Takvim, Analitik, Stratejiler). 'journal-changed' GÖNDERİLMEZ: hesap
    // değişmedi, o olay bazı sayfalarda tam yenileme demek.
    if (window.wwCache) {
      window.wwCache.invalidate('trades');
      window.wwCache.invalidate('trades_dashboard');
    }
    window.dispatchEvent(new CustomEvent('trade-saved', { detail: { source: 'ctrader-sync', journalId: journalId, inserted: totalInserted } }));
    // Hesaplar sayfası 'trade-saved' dinlemez; kartlardaki "son senkron" ve bakiye yeni işlem olmasa da değişir
    if (/\/journals(\.html)?$/.test(window.location.pathname) && typeof window.loadTrades === 'function') window.loadTrades();
    // Navbar'daki hesap listesi (işlem sayısı, son senkron); otomatik senkron 30 dk kuralıyla tekrar tetiklenmez
    if (typeof window.updateNavbarJournal === 'function') window.updateNavbarJournal(0);

  } catch(err) {
    console.error('Sync error:', err);
    toastFn(err.message || 'Senkronizasyon hatası', 'error');
  } finally {
    if (btn) btn.classList.remove('spinning');
    if (dot) {
      dot.className = dot.dataset.prevClass || 'ctrader-status-dot';
    }
  }
};

