// ============================================================
// SAHTE REALTIME (Phoenix) SUNUCUSU — scripts/perf/fake-realtime.mjs
// ============================================================
// Puppeteer'ın istek yakalaması WebSocket'leri görmez: sahte oturumla açılan sayfa Realtime'a CANLI bağlanıyor ve sahte
// JWT yüzünden canlı loglara "JwtSignatureError" yazdırıyordu (fix/live-traffic, Sorun 2). Bu modül sayfaya, *.supabase.co
// adreslerine açılan WebSocket'leri sayfa içinde cevaplayan bir sınıf koyar; gerçek soket hiç açılmaz.
//   mode 'ok'           : phx_join → ok (postgres_changes bağları id'leriyle), heartbeat → ok
//   mode 'jwt-error'    : phx_join → error {reason: 'JwtSignatureError: Failed to validate JWT signature'}
//   mode 'jwt-expired'  : phx_join → error {reason: 'Token has expired …'}
//   closeAfterError     : hata cevabından sonra soketi kapatır (sunucunun bağlantıyı düşürdüğü durum)
// Sayfada window.__wwRealtime = { sockets, frames: [{ t, dir, msg }] } kayıt tutar (ritim analizi için).
// ============================================================
export const REALTIME_INIT = function (opts) {
  var log = { sockets: 0, frames: [] };
  window.__wwRealtime = log;
  var Native = window.WebSocket;
  function now() { return Math.round(performance.now()); }
  function FakeSocket(url) {
    var self = this;
    this.url = String(url); this.readyState = 0; this.binaryType = 'blob'; this.bufferedAmount = 0; this.protocol = ''; this.extensions = '';
    this._ls = {};
    log.sockets++;
    log.frames.push({ t: now(), dir: 'open', msg: this.url.replace(/apikey=[^&]+/, 'apikey=…') });
    setTimeout(function () { self.readyState = 1; self._emit('open', {}); }, 5);
  }
  FakeSocket.CONNECTING = 0; FakeSocket.OPEN = 1; FakeSocket.CLOSING = 2; FakeSocket.CLOSED = 3;
  FakeSocket.prototype.CONNECTING = 0; FakeSocket.prototype.OPEN = 1; FakeSocket.prototype.CLOSING = 2; FakeSocket.prototype.CLOSED = 3;
  FakeSocket.prototype.addEventListener = function (ev, fn) { (this._ls[ev] = this._ls[ev] || []).push(fn); };
  FakeSocket.prototype.removeEventListener = function (ev, fn) { this._ls[ev] = (this._ls[ev] || []).filter(function (f) { return f !== fn; }); };
  FakeSocket.prototype._emit = function (ev, e) {
    var h = this['on' + ev]; if (typeof h === 'function') h.call(this, e);
    (this._ls[ev] || []).slice().forEach(function (f) { f.call(this, e); }, this);
  };
  FakeSocket.prototype._reply = function (msg) {
    var self = this;
    log.frames.push({ t: now(), dir: 'in', msg: msg });
    setTimeout(function () { if (self.readyState === 1) self._emit('message', { data: JSON.stringify(msg) }); }, 10);
  };
  FakeSocket.prototype.send = function (data) {
    var m; try { m = JSON.parse(data); } catch (e) { return; }
    log.frames.push({ t: now(), dir: 'out', msg: [m[0], m[1], m[2], m[3]] });
    var joinRef = m[0], ref = m[1], topic = m[2], event = m[3], payload = m[4] || {};
    if (event === 'heartbeat') return this._reply([null, ref, 'phoenix', 'phx_reply', { status: 'ok', response: {} }]);
    if (event === 'phx_leave') return this._reply([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]);
    if (event === 'access_token') return;
    if (event !== 'phx_join') return;
    if (opts.mode === 'ok') {
      var pc = ((payload.config || {}).postgres_changes || []).map(function (c, i) { return Object.assign({}, c, { id: 1000 + i }); });
      return this._reply([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: pc } }]);
    }
    var reason = opts.mode === 'jwt-expired' ? 'Token has expired 0 seconds ago' : 'JwtSignatureError: Failed to validate JWT signature';
    this._reply([joinRef, ref, topic, 'phx_reply', { status: 'error', response: { reason: reason } }]);
    if (opts.closeAfterError) { var self = this; setTimeout(function () { self.close(1000, 'error'); }, 20); }
  };
  FakeSocket.prototype.close = function (code, reason) {
    if (this.readyState >= 2) return;
    var self = this; this.readyState = 2;
    log.frames.push({ t: now(), dir: 'close', msg: code || 1000 });
    setTimeout(function () { self.readyState = 3; self._emit('close', { code: code || 1000, reason: reason || '', wasClean: true }); }, 5);
  };
  window.WebSocket = function (url, protocols) {
    if (/\.supabase\.co\//.test(String(url))) return new FakeSocket(url);
    return new Native(url, protocols);
  };
  window.WebSocket.prototype = Native.prototype;
  ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k) { window.WebSocket[k] = Native[k]; });
};

/** page: Puppeteer sayfası. opts: { mode: 'ok' | 'jwt-error' | 'jwt-expired', closeAfterError } */
export async function installFakeRealtime(page, opts = {}) {
  await page.evaluateOnNewDocument(REALTIME_INIT, { mode: opts.mode || 'ok', closeAfterError: !!opts.closeAfterError });
}
