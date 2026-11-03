// WwRealtime (fix/live-traffic 2b): Realtime kanalı yalnızca geçerli oturumla açılır; token reddedilirse sonsuz yeniden deneme
// yerine kanal kaldırılır, oturum bir kez yenilenir, olmazsa kanal kapalı kalır. Sahte supabase istemcisiyle vm'de.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync('public/interface/shared/realtime-guard.js', 'utf8');
const flush = () => new Promise((r) => setTimeout(r, 0));
const future = () => Math.floor(Date.now() / 1000) + 3600;

function setup({ session = { access_token: 'tok-1', expires_at: future() }, joinReply = 'ok', refresh = 'ok', emitOnRefresh = false, sameToken = false } = {}) {
  const calls = { channels: 0, joins: 0, removed: 0, setAuth: [], refresh: 0 };
  let authCb = null;
  const sb = {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: (cb) => { authCb = cb; return { data: { subscription: {} } }; },
      refreshSession: async () => {
        calls.refresh++;
        if (refresh === 'fail') return { data: { session: null }, error: { message: 'Invalid Refresh Token' } };
        const next = { access_token: sameToken ? 'tok-1' : 'tok-' + (calls.refresh + 1), expires_at: future() };
        // supabase-js: yenileme TOKEN_REFRESHED olayını yayar (bazen sonuç dönmeden önce, bazen sonra)
        if (emitOnRefresh) { authCb && authCb('TOKEN_REFRESHED', next); setTimeout(() => authCb && authCb('TOKEN_REFRESHED', next), 0); }
        return { data: { session: next }, error: null };
      },
    },
    realtime: { setAuth: (t) => { calls.setAuth.push(t); } },
    channel: (name) => {
      calls.channels++;
      const ch = { name, bindings: 0, on() { this.bindings++; return this; }, subscribe(cb) {
        calls.joins++;
        const r = typeof joinReply === 'function' ? joinReply(calls.joins) : joinReply;
        Promise.resolve().then(() => r === 'ok' ? cb('SUBSCRIBED') : cb('CHANNEL_ERROR', new Error(r)));
        return this;
      } };
      return ch;
    },
    removeChannel: () => { calls.removed++; },
  };
  const ctx = { console, Promise, Date, setTimeout, window: {} };
  vm.runInNewContext(src, ctx);
  return { W: ctx.window.WwRealtime, sb, calls, auth: (ev, s) => authCb && authCb(ev, s) };
}
const build = (ch) => ch.on('postgres_changes', {}, () => {});

describe('WwRealtime.subscribe', () => {
  it('valid session: one join, token passed to realtime.setAuth, joined', async () => {
    const t = setup();
    const h = t.W.subscribe(t.sb, 'c1', build);
    await flush(); await flush();
    assert.equal(t.calls.joins, 1);
    assert.deepEqual(t.calls.setAuth, ['tok-1']);
    assert.equal(h.state(), 'joined');
  });

  it('JwtSignatureError: channel removed at once, session refreshed ONCE, one retry, then stopped (no loop)', async () => {
    const t = setup({ joinReply: 'JwtSignatureError: Failed to validate JWT signature' });
    const h = t.W.subscribe(t.sb, 'c1', build);
    for (let i = 0; i < 10; i++) await flush();
    assert.equal(t.calls.joins, 2, 'first join + one retry after refresh');
    assert.equal(t.calls.refresh, 1);
    assert.equal(t.calls.removed, 2);
    assert.equal(h.state(), 'stopped');
    assert.deepEqual(t.calls.setAuth, ['tok-1', 'tok-2']);
  });

  it('refreshSession emitting TOKEN_REFRESHED (before and after it resolves) does not start a loop', async () => {
    for (const sameToken of [false, true]) {
      const t = setup({ joinReply: 'JwtSignatureError: Failed to validate JWT signature', emitOnRefresh: true, sameToken });
      const h = t.W.subscribe(t.sb, 'c1', build);
      for (let i = 0; i < 40; i++) await flush();
      assert.ok(t.calls.joins <= 2 * 3, 'joins ' + t.calls.joins + ' (sameToken ' + sameToken + ')');
      assert.ok(t.calls.refresh <= 3, 'refresh ' + t.calls.refresh);
      assert.equal(h.state(), 'stopped');
      const j = t.calls.joins;
      for (let i = 0; i < 40; i++) await flush();
      assert.equal(t.calls.joins, j, 'quiet afterwards');
    }
  });

  it('a stopped channel reopens for a NEW token (e.g. hourly refresh), at most 3 recoveries per page', async () => {
    const t = setup({ joinReply: 'JwtSignatureError: Failed to validate JWT signature', refresh: 'fail' });
    const h = t.W.subscribe(t.sb, 'c1', build);
    for (let i = 0; i < 6; i++) await flush();
    assert.equal(h.state(), 'stopped');
    t.auth('TOKEN_REFRESHED', { access_token: 'tok-1', expires_at: future() });   // aynı (reddedilmiş) token: açılmaz
    for (let i = 0; i < 6; i++) await flush();
    assert.equal(t.calls.joins, 1);
    for (let k = 0; k < 6; k++) { t.auth('TOKEN_REFRESHED', { access_token: 'new-' + k, expires_at: future() }); for (let i = 0; i < 6; i++) await flush(); }
    assert.ok(t.calls.joins <= 1 + 3, 'joins ' + t.calls.joins);
  });

  it('error, refresh succeeds and the new token is accepted: joined with the new token', async () => {
    const t = setup({ joinReply: (n) => (n === 1 ? 'Token has expired 3 seconds ago' : 'ok') });
    const h = t.W.subscribe(t.sb, 'c1', build);
    for (let i = 0; i < 10; i++) await flush();
    assert.equal(t.calls.joins, 2);
    assert.equal(h.state(), 'joined');
    assert.equal(t.calls.setAuth[t.calls.setAuth.length - 1], 'tok-2');
  });

  it('refresh fails: stopped after a single join', async () => {
    const t = setup({ joinReply: 'JwtSignatureError: Failed to validate JWT signature', refresh: 'fail' });
    const h = t.W.subscribe(t.sb, 'c1', build);
    for (let i = 0; i < 10; i++) await flush();
    assert.equal(t.calls.joins, 1);
    assert.equal(t.calls.refresh, 1);
    assert.equal(h.state(), 'stopped');
  });

  it('expired session: no channel at all until a valid token arrives (TOKEN_REFRESHED)', async () => {
    const t = setup({ session: { access_token: 'old', expires_at: Math.floor(Date.now() / 1000) - 60 } });
    const h = t.W.subscribe(t.sb, 'c1', build);
    await flush(); await flush();
    assert.equal(t.calls.channels, 0);
    assert.equal(h.state(), 'waiting');
    t.auth('TOKEN_REFRESHED', { access_token: 'tok-9', expires_at: future() });
    await flush(); await flush();
    assert.equal(t.calls.joins, 1);
    assert.equal(h.state(), 'joined');
    assert.equal(t.calls.setAuth[t.calls.setAuth.length - 1], 'tok-9');
  });

  it('no session: no channel; SIGNED_OUT removes open channels', async () => {
    const none = setup({ session: null });
    none.W.subscribe(none.sb, 'c1', build);
    await flush(); await flush();
    assert.equal(none.calls.channels, 0);
    const t = setup();
    const h = t.W.subscribe(t.sb, 'c1', build);
    await flush(); await flush();
    t.auth('SIGNED_OUT', null);
    assert.equal(t.calls.removed, 1);
    assert.equal(h.state(), 'waiting');
  });

  it('network-type errors are left to supabase-js (no removal, no refresh)', async () => {
    const t = setup({ joinReply: 'timeout' });
    t.W.subscribe(t.sb, 'c1', build);
    for (let i = 0; i < 6; i++) await flush();
    assert.equal(t.calls.removed, 0);
    assert.equal(t.calls.refresh, 0);
  });

  it('same name twice returns the same subscription', async () => {
    const t = setup();
    const a = t.W.subscribe(t.sb, 'c1', build), b = t.W.subscribe(t.sb, 'c1', build);
    assert.equal(a, b);
    await flush(); await flush();
    assert.equal(t.calls.joins, 1);
  });
});

describe('both app channels go through WwRealtime', () => {
  it('navbar notifications and payment plan listener; BaseHead loads the guard; bundle.js is in sync', () => {
    const nav = fs.readFileSync('public/components/navbar/navbar.js', 'utf8');
    const pay = fs.readFileSync('public/src/services/payment.js', 'utf8');
    assert.match(nav, /window\.WwRealtime\.subscribe\(sb, 'realtime_user_notifications_' \+ user\.id,/);
    assert.match(pay, /window\.WwRealtime\.subscribe\(sb, channelName,/);
    for (const f of [nav, pay]) assert.doesNotMatch(f, /\.subscribe\(\);/);
    assert.match(fs.readFileSync('src/components/BaseHead.astro', 'utf8'), /<script src="\/interface\/shared\/realtime-guard\.js\?v=\d+" is:inline><\/script>/);
    assert.match(fs.readFileSync('public/src/bundle.js', 'utf8'), /WwRealtime\.subscribe\(\w+,\w+,/);
  });
});
