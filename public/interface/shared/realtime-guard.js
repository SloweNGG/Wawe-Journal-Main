// ============================================================
// REALTIME KANALLARI — GEÇERLİ OTURUMLA, SONSUZ DENEME YOK (window.WwRealtime)
// ============================================================
// Önceden navbar (bildirimler) ve payment.js (plan) kanalları durum geri çağrısı olmadan subscribe ediliyordu. Sunucu token'ı
// reddedince (JwtSignatureError, süresi dolmuş token) supabase-js kanalı 1 s / 2 s / 5 s / sonra her 10 s sonsuza kadar
// yeniden deniyordu (kanal başına dakikada 6; sunucu soketi kapatırsa saniyede 1). Token hiç değişmediği için hiç düzelmiyordu.
// Burada:
//   - Kanal yalnızca geçerli (süresi dolmamış) oturum varken açılır; yoksa giriş / token yenileme olayı beklenir.
//   - Token yenilenince realtime.setAuth ile güncellenir. Oturum bekleyen kanal yeni token'la açılır; token hatası yüzünden
//     durdurulmuş kanal yalnızca REDDEDİLENDEN FARKLI bir token gelirse yeniden açılır (refreshSession'ın kendi
//     TOKEN_REFRESHED olayı kanalı yeniden açıp döngü kurmasın) ve sayfa başına en çok MAX_RECOVERIES kez.
//   - Kanal token hatası verirse kanal HEMEN kaldırılır (yeniden deneme döngüsü durur), oturum BİR KEZ yenilenmeye çalışılır;
//     yenilenirse kanal bir kez yeniden açılır, olmazsa kapalı kalır. Ağ hatası gibi diğer hatalarda supabase-js'in normal
//     yeniden bağlanması sürer.
//   - Çıkışta tüm kanallar kaldırılır.
// Kullanım: WwRealtime.subscribe(sb, 'kanal-adi', function (ch) { return ch.on('postgres_changes', {...}, fn); })
//   → { stop() }. Aynı adla ikinci çağrı mevcut kaydı döner.
// ============================================================
(function (global) {
  'use strict';

  var AUTH_ERROR = /jwt|token|signature|expired|unauthori[sz]ed|invalid.?claims|permission/i;
  var SKEW_MS = 10000;
  var MAX_RECOVERIES = 3;                                         // kanal başına, sayfa ömrü boyunca token hatası kurtarma
  var subs = {};
  var listening = null;

  function now() { return Date.now(); }
  function tokenValid(session) {
    if (!session || !session.access_token) return false;
    return !session.expires_at || session.expires_at * 1000 > now() + SKEW_MS;
  }
  function warn(msg) { try { (global.wwLog || console).warn('[Realtime] ' + msg); } catch (e) {} }
  function setAuth(sb, token) {
    try { if (sb.realtime && typeof sb.realtime.setAuth === 'function') { var p = sb.realtime.setAuth(token); if (p && p.catch) p.catch(function () {}); } } catch (e) {}
  }
  function getSession(sb) {
    return Promise.resolve().then(function () { return sb.auth.getSession(); })
      .then(function (r) { return (r && r.data && r.data.session) || null; }, function () { return null; });
  }
  function remove(sb, s) {
    if (!s.channel) return;
    var ch = s.channel; s.channel = null;
    try { if (typeof sb.removeChannel === 'function') sb.removeChannel(ch); else ch.unsubscribe(); } catch (e) {}
  }

  function listen(sb) {
    if (listening === sb || !sb.auth || typeof sb.auth.onAuthStateChange !== 'function') return;
    listening = sb;
    try {
      sb.auth.onAuthStateChange(function (event, session) {
        var names = Object.keys(subs);
        if (event === 'SIGNED_OUT') {
          names.forEach(function (n) { var s = subs[n]; remove(sb, s); s.state = 'waiting'; s.refreshTried = false; });
          return;
        }
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') && tokenValid(session)) {
          setAuth(sb, session.access_token);
          // oturum bekleyen ya da token hatası yüzünden durdurulmuş kanallar yeni token'la bir kez daha açılır
          names.forEach(function (n) {
            var s = subs[n];
            if (s.state === 'waiting') open(sb, s, session);
            else if (s.state === 'stopped' && session.access_token !== s.rejectedToken && s.recoveries < MAX_RECOVERIES) { s.refreshTried = false; open(sb, s, session); }
          });
        }
      });
    } catch (e) {}
  }

  function open(sb, s, session) {
    if (s.ended || s.channel) return;
    if (!tokenValid(session)) { s.state = 'waiting'; return; }
    setAuth(sb, session.access_token);
    s.token = session.access_token;
    var ch;
    try { ch = s.build(sb.channel(s.name)); } catch (e) { warn('kanal kurulamadı: ' + s.name); s.state = 'stopped'; return; }
    s.channel = ch; s.state = 'joining';
    try {
      ch.subscribe(function (status, err) {
        if (s.channel !== ch) return;
        if (status === 'SUBSCRIBED') { s.state = 'joined'; s.refreshTried = false; return; }
        if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') return;
        var msg = String((err && (err.message || err.reason)) || '');
        if (!AUTH_ERROR.test(msg)) return;                       // ağ vb.: supabase-js kendisi yeniden dener
        onAuthError(sb, s, msg);
      });
    } catch (e) { remove(sb, s); s.state = 'stopped'; }
  }

  function onAuthError(sb, s, msg) {
    remove(sb, s);                                               // supabase-js'in yeniden deneme zamanlayıcısı burada durur
    s.rejectedToken = s.token;
    if (s.refreshTried || s.recoveries >= MAX_RECOVERIES) { s.state = 'stopped'; warn(s.name + ' kapatıldı (token kabul edilmedi): ' + msg); return; }
    s.refreshTried = true; s.recoveries++; s.state = 'refreshing';
    Promise.resolve().then(function () { return sb.auth.refreshSession(); }).then(function (r) {
      var session = r && r.data && r.data.session;
      if (s.ended) return;
      if (!r || r.error || !tokenValid(session)) { s.state = 'stopped'; warn(s.name + ' kapatıldı (oturum yenilenemedi)'); return; }
      if (session.access_token === s.rejectedToken) { s.state = 'stopped'; warn(s.name + ' kapatıldı (yenilenen token aynı)'); return; }
      open(sb, s, session);
    }, function () { s.state = 'stopped'; warn(s.name + ' kapatıldı (oturum yenilenemedi)'); });
  }

  function subscribe(sb, name, build) {
    if (subs[name] && !subs[name].ended) return subs[name].handle;
    var s = { name: name, build: build, channel: null, state: 'checking', refreshTried: false, recoveries: 0, token: null, rejectedToken: null, ended: false };
    s.handle = { stop: function () { s.ended = true; remove(sb, s); delete subs[name]; }, state: function () { return s.state; } };
    subs[name] = s;
    if (!sb || typeof sb.channel !== 'function' || !sb.auth) { s.state = 'stopped'; return s.handle; }
    listen(sb);
    getSession(sb).then(function (session) { if (!s.ended) open(sb, s, session); });
    return s.handle;
  }

  global.WwRealtime = { subscribe: subscribe, _subs: subs, _tokenValid: tokenValid };
})(typeof window !== 'undefined' ? window : this);
