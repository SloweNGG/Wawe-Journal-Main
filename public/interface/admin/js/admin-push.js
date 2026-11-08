// ============================================================
// ADMIN — TELEFON BİLDİRİMLERİ (Web Push)
// Bu cihazı Edge Function admin-notify'a kaydeder. Bildirimler: yeni üye, Pro satışı (ve Creem iade/itiraz
// uyarıları), hata bildirimi / öneri, para çekme isteği. Bildirimi gösteren: /sw.js (push, notificationclick).
// ============================================================

(function() {
  var state = { busy: false, info: null, error: '' };

  function esc(s) { return typeof escapeHtml === 'function' ? escapeHtml(s) : String(s == null ? '' : s); }
  function svg(name, size) { return typeof adminSvg === 'function' ? adminSvg(name, '', size || 14) : ''; }

  function supported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  function b64urlToBytes(str) {
    var b = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    var bin = atob(b + '==='.slice((b.length + 3) % 4));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function sameKey(buf, b64) {
    if (!buf) return false;
    var a = new Uint8Array(buf), b = b64urlToBytes(b64);
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  async function callFn(action, extra) {
    var client = window.sb;
    var sessionRes = client ? await client.auth.getSession() : null;
    var session = sessionRes && sessionRes.data && sessionRes.data.session;
    if (!session || !window.SUPABASE_URL) throw new Error('Oturum bulunamadı');
    var res = await fetch(window.SUPABASE_URL + '/functions/v1/admin-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token, 'apikey': window.SUPABASE_ANON_KEY || '' },
      body: JSON.stringify(Object.assign({ action: action }, extra || {}))
    });
    var data = await res.json().catch(function() { return null; });
    if (res.status === 404) throw new Error('admin-notify fonksiyonu henüz yüklenmemiş');
    if (!res.ok || !data || data.ok === false) throw new Error((data && data.error) || ('HTTP ' + res.status));
    return data;
  }

  async function registration() {
    await navigator.serviceWorker.register('/sw.js');
    return navigator.serviceWorker.ready;
  }

  async function currentSubscription() {
    if (!supported()) return null;
    var reg = await navigator.serviceWorker.getRegistration('/');
    return reg ? reg.pushManager.getSubscription() : null;
  }

  async function refresh() {
    state.error = '';
    try {
      var sub = await currentSubscription();
      state.info = await callFn('config', { endpoint: sub ? sub.endpoint : '' });
      state.info.subscribed = !!sub && state.info.thisDevice;
    } catch (e) {
      state.info = null;
      state.error = e.message || String(e);
    }
    render();
  }

  async function enable() {
    if (state.busy) return;
    state.busy = true; render();
    try {
      var info = state.info || await callFn('config', {});
      if (!info.configured || !info.publicKey) throw new Error('Sunucu tarafı henüz kurulmadı (VAPID anahtarları eksik)');
      var perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error(perm === 'denied'
        ? 'Bildirim izni engellenmiş. Chrome: adres çubuğundaki simge → İzinler → Bildirimler → İzin ver.'
        : 'Bildirim izni verilmedi.');
      var reg = await registration();
      var sub = await reg.pushManager.getSubscription();
      // Sunucu anahtarı değiştiyse eski abonelik çalışmaz: yenisi alınır
      if (sub && !sameKey(sub.options && sub.options.applicationServerKey, info.publicKey)) {
        await sub.unsubscribe();
        sub = null;
      }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(info.publicKey) });
      await callFn('subscribe', { subscription: sub.toJSON() });
      if (typeof showToast === 'function') showToast('Bu cihazda bildirimler açıldı', 'success');
    } catch (e) {
      if (typeof showToast === 'function') showToast(e.message || String(e), 'error');
    }
    state.busy = false;
    await refresh();
  }

  async function disable() {
    if (state.busy) return;
    state.busy = true; render();
    try {
      var sub = await currentSubscription();
      if (sub) {
        await callFn('unsubscribe', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      if (typeof showToast === 'function') showToast('Bu cihazda bildirimler kapatıldı', 'info');
    } catch (e) {
      if (typeof showToast === 'function') showToast(e.message || String(e), 'error');
    }
    state.busy = false;
    await refresh();
  }

  async function test() {
    if (state.busy) return;
    state.busy = true; render();
    try {
      var r = await callFn('test', {});
      if (!r.devices) throw new Error('Kayıtlı cihaz yok');
      if (typeof showToast === 'function') {
        showToast(r.sent ? 'Deneme bildirimi gönderildi (' + r.sent + '/' + r.devices + ' cihaz)' : 'Gönderilemedi: push servisi kabul etmedi', r.sent ? 'success' : 'error');
      }
    } catch (e) {
      if (typeof showToast === 'function') showToast(e.message || String(e), 'error');
    }
    state.busy = false;
    await refresh();
  }

  function render() {
    var box = document.getElementById('push-settings-container');
    if (!box) return;

    var events =
      '<ul class="push-events">' +
        '<li><span>🆕</span><div><strong>Yeni üye</strong><p>Biri kayıt olduğunda</p></div></li>' +
        '<li><span>💎</span><div><strong>Pro satışı</strong><p>Kart (Creem) ve kripto ödemeleri; Creem iade, itiraz ve iptal uyarıları</p></div></li>' +
        '<li><span>🐞</span><div><strong>Hata bildirimi / öneri</strong><p>Hata Bildir sayfasından gelen her kayıt</p></div></li>' +
        '<li><span>💸</span><div><strong>Para çekme isteği</strong><p>Kazançlar sayfasından gelen çekim talebi</p></div></li>' +
      '</ul>';

    var status, actions = '', note = '';
    var busy = state.busy ? ' disabled' : '';

    if (!supported()) {
      status = '<span class="push-dot off"></span>Bu tarayıcı bildirim desteklemiyor';
      note = 'Telefonda Chrome ile <strong>wawejournal.com/admin</strong> adresini açın.';
    } else if (state.error) {
      status = '<span class="push-dot off"></span>Durum alınamadı';
      note = esc(state.error);
      actions = '<button type="button" class="btn btn-ghost btn-sm" data-push="refresh">' + svg('refresh') + 'Tekrar dene</button>';
    } else if (!state.info) {
      status = '<span class="push-dot"></span>Yükleniyor…';
    } else {
      var info = state.info;
      var on = info.subscribed;
      status = '<span class="push-dot ' + (on ? 'on' : 'off') + '"></span>' +
        (on ? 'Bu cihazda açık' : 'Bu cihazda kapalı') +
        '<span class="push-count">Kayıtlı cihaz: ' + (info.devices || 0) + '</span>';
      if (!info.configured) {
        note = 'Sunucu tarafı henüz kurulmadı: VAPID anahtarları Supabase secrets\'a eklenmeli.';
      } else if (on) {
        actions =
          '<button type="button" class="btn btn-primary btn-sm" data-push="test"' + busy + '>' + svg('zap') + 'Test bildirimi gönder</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-push="disable"' + busy + '>Bu cihazda kapat</button>';
      } else {
        actions = '<button type="button" class="btn btn-primary btn-sm" data-push="enable"' + busy + '>' + svg('bell') + 'Bu cihazda bildirimleri aç</button>';
        if (Notification.permission === 'denied') {
          note = 'Bildirim izni bu tarayıcıda engellenmiş. Chrome: adres çubuğundaki simge → İzinler → Bildirimler → İzin ver, sonra sayfayı yenileyin.';
        }
      }
    }

    box.innerHTML =
      '<div class="push-status">' + status + '</div>' +
      (actions ? '<div class="push-actions">' + actions + '</div>' : '') +
      (note ? '<p class="push-note">' + note + '</p>' : '') +
      '<div class="push-subtitle">Bildirim gelen olaylar</div>' + events;
  }

  function onClick(e) {
    var btn = e.target.closest && e.target.closest('[data-push]');
    if (!btn || !document.getElementById('push-settings-container').contains(btn)) return;
    var a = btn.getAttribute('data-push');
    if (a === 'enable') enable();
    else if (a === 'disable') disable();
    else if (a === 'test') test();
    else if (a === 'refresh') refresh();
  }

  window.renderPushSettings = function() {
    var box = document.getElementById('push-settings-container');
    if (!box) return;
    if (!box.dataset.bound) {
      box.dataset.bound = '1';
      box.addEventListener('click', onClick);
    }
    render();
    refresh();
  };
})();
