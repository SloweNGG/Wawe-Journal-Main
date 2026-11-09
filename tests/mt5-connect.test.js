// ============================================================
// WAWE JOURNAL - MT5 BAĞLAMA ARAYÜZÜ TEST SUITE
// Runner: node --test tests/*.test.js
// Kapsam: public/interface/journals/js/mt5-connect.js (WwMt5, DOM'suz kısımlar)
//   - beta anahtarı (?mt5=1 / ?mt5=0, localStorage), kod normalleştirme, hata metinleri
//   - kart durumu (EA bekleniyor / çevrimiçi / MT5 kapalı), deftere göre eşleme
//   - kart çubuğu HTML'i (kaçış, bakiye, son kontrol, hata), durum çekme (zaman aşımı -> önbellek), bağlantı kesme
// ============================================================
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const code = fs.readFileSync(path.resolve('public/interface/journals/js/mt5-connect.js'), 'utf8');
function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}
function load(extra = {}) {
  const win = { setTimeout, clearTimeout, Promise, Date, JSON, ...extra };
  win.window = win;
  vm.runInNewContext(code, win);
  return win.WwMt5;
}
const NOW = Date.UTC(2026, 10, 9, 12);
const iso = (ms) => new Date(ms).toISOString();

describe('enabled (beta anahtarı)', () => {
  it('?mt5=1 açar ve hatırlar, ?mt5=0 kapatır', () => {
    const st = memStorage();
    const M = load({ localStorage: st, location: { search: '' } });
    assert.equal(M.enabled('', st), false);
    assert.equal(M.enabled('?mt5=1', st), true);
    assert.equal(M.enabled('', st), true);
    assert.equal(M.enabled('?a=b&mt5=0', st), false);
    assert.equal(M.enabled('', st), false);
  });
  it('depolama yoksa yalnızca adres', () => {
    const M = load();
    assert.equal(M.enabled('?mt5=1', null), true);
    assert.equal(M.enabled('', null), false);
    assert.equal(M.enabled('?mt5=12', null), false);
  });
});

describe('normalizeCode / claimErrorText', () => {
  const M = load();
  it('yalnızca 6 rakam', () => {
    assert.equal(M.normalizeCode('482 913'), '482913');
    assert.equal(M.normalizeCode(' 48-29 13 99'), '482913');
    assert.equal(M.normalizeCode(null), '');
  });
  it('hata kodları anlaşılır metne', () => {
    assert.match(M.claimErrorText('INVALID_CODE'), /süresi dolmuş/);
    assert.match(M.claimErrorText('TOO_MANY_ATTEMPTS'), /15 dakika/);
    assert.match(M.claimErrorText('INVALID_JOURNAL'), /Defter/);
    assert.match(M.claimErrorText('???'), /tekrar deneyin/);
  });
  it('i18n varsa çeviri kullanılır, yer tutucular doldurulur', () => {
    const W = load({ i18n: { t: (k) => (k === 'mt5.err.too_many' ? 'Too many' : k) } });
    assert.equal(W.claimErrorText('TOO_MANY_ATTEMPTS'), 'Too many');
    assert.match(W.claimErrorText('INVALID_CODE'), /Kod hatalı/);
  });
});

describe('accountState / mapByJournal', () => {
  const M = load();
  it('durumlar', () => {
    assert.equal(M.accountState({ connected: false, last_seen_at: iso(NOW) }, NOW), 'waiting');
    assert.equal(M.accountState({ connected: true, last_seen_at: iso(NOW - 60000) }, NOW), 'online');
    assert.equal(M.accountState({ connected: true, last_seen_at: iso(NOW - 4 * 60000) }, NOW), 'offline');
    assert.equal(M.accountState({ connected: true, last_seen_at: null }, NOW), 'offline');
    assert.equal(M.accountState(null, NOW), 'waiting');
  });
  it('deftere göre eşleme, bağsız hesaplar dışarıda', () => {
    const m = M.mapByJournal([{ id: 'a', journal_id: 'j1' }, { id: 'b', journal_id: null }, null]);
    assert.deepEqual(Object.keys(m), ['j1']);
    assert.equal(m.j1.id, 'a');
    assert.deepEqual(Object.keys(M.mapByJournal(undefined)), []);
  });
});

describe('barHtml', () => {
  const M = load();
  const base = { id: 'x', login: 51234567, server: 'FTMO-Demo', broker_name: 'FTMO <b>', is_live: false, connected: true,
    last_seen_at: iso(NOW - 30000), last_sync_at: iso(NOW - 30000), balance: 100250.5, currency: 'USD' };
  const h = { now: NOW, rel: () => '30 sn önce', abs: () => 'ABS', balance: (v, c) => c + ' ' + v };
  it('çevrimiçi, demo, bakiye, son kontrol; broker adı kaçışlı', () => {
    const html = M.barHtml(base, h);
    assert.match(html, /mt5-state online/);
    assert.match(html, /ct-env demo">Demo/);
    assert.match(html, /#51234567 · FTMO &lt;b&gt;/);
    assert.match(html, /USD 100250\.5/);
    assert.match(html, /Son kontrol · <b>30 sn önce<\/b>/);
    assert.doesNotMatch(html, /FTMO <b>/);
  });
  it('bekleniyor, bakiye yok, veri yok', () => {
    const html = M.barHtml({ ...base, connected: false, balance: null, last_sync_at: null, last_seen_at: null, is_live: null }, h);
    assert.match(html, /mt5-state waiting/);
    assert.match(html, /ct-balance muted/);
    assert.match(html, /Henüz veri gelmedi/);
    assert.doesNotMatch(html, /ct-env/);
  });
  it('kapalı + hata mesajı', () => {
    const html = M.barHtml({ ...base, is_live: true, last_seen_at: iso(NOW - 3600e3), last_error: 'İşlemler kaydedilemedi' }, h);
    assert.match(html, /mt5-state offline/);
    assert.match(html, /ct-env live">Live/);
    assert.match(html, /ct-sync-state error/);
  });
});

describe('fetchStatus / disconnect', () => {
  it('başarılı cevap önbelleğe yazılır; hata/zaman aşımında önbellek döner', async () => {
    const st = memStorage();
    const M = load({ localStorage: st });
    const list = [{ id: 'a', journal_id: 'j' }];
    let r = await M.fetchStatus({ rpc: async (n) => { assert.equal(n, 'get_mt5_status'); return { data: { accounts: list } }; } }, 500);
    assert.equal(r.stale, false);
    assert.equal(JSON.parse(st.getItem('ww_cached_mt5_accounts'))[0].id, 'a');
    r = await M.fetchStatus({ rpc: async () => ({ error: { message: 'x' } }) }, 500);
    assert.equal(r.stale, true);
    assert.equal(r.accounts[0].id, 'a');
    r = await M.fetchStatus({ rpc: () => new Promise(() => {}) }, 20);
    assert.equal(r.stale, true);
    assert.equal(r.accounts.length, 1);
    r = await M.fetchStatus(null, 20);
    assert.equal(r.accounts.length, 1);
  });
  it('önbellek yoksa boş liste', async () => {
    const M = load({ localStorage: memStorage() });
    const r = await M.fetchStatus({ rpc: async () => { throw new Error('net'); } }, 50);
    assert.equal(r.accounts.length, 0);
  });
  it('disconnect: başarı ve hatalar', async () => {
    const M = load();
    const calls = [];
    assert.equal(await M.disconnect({ rpc: async (n, a) => { calls.push([n, a]); return { data: { success: true } }; } }, 'acc'), true);
    assert.equal(calls[0][0], 'disconnect_mt5_account');
    assert.equal(calls[0][1].p_account_id, 'acc');
    await assert.rejects(M.disconnect({ rpc: async () => ({ data: { success: false, error: 'NOT_FOUND' } }) }, 'acc'), /NOT_FOUND/);
    await assert.rejects(M.disconnect({ rpc: async () => ({ error: { message: 'denied' } }) }, 'acc'), /denied/);
  });
});
