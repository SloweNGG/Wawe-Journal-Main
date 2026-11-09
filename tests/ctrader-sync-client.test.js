// ============================================================
// WAWE JOURNAL - cTrader SENKRON İSTEMCİSİ TEST SUITE
// Runner: node --test tests/*.test.js
// Kapsam: public/interface/shared/ctrader-sync.js (WwCtSync)
//   - runSync: done:false turları, hata kodları (erişim kalktı / yeniden bağlan / meşgul / ağ), tur tavanı
//   - autoSyncCandidates: yalnızca auto_sync açık, deftere bağlı, erişimi olan, 30 dk'dan eski hesaplar
//   - autoSync: deneme kaydı (sekmeler arası, başarısızda da), günde bir uyarı, NEEDS_RECONNECT'te durma
//   - chooseAccount: OAuth dönüşünde soru sormadan bağlanacak hesap
// ============================================================
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const code = fs.readFileSync(path.resolve('public/interface/shared/ctrader-sync.js'), 'utf8');
function load(extra = {}) {
  const win = { ...extra };
  win.window = win;
  vm.runInNewContext(code, win);
  return win.WwCtSync;
}
const S = load();
const MIN = 60000;
const NOW = Date.UTC(2026, 10, 9, 12);

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}
// responder(call, body) -> { status, body }
function fakeFetch(responder) {
  const calls = [];
  const f = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, headers: init.headers });
    const r = await responder(calls.length, body);
    if (r === 'NETWORK') throw new TypeError('Failed to fetch');
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  f.calls = calls;
  return f;
}
const ok = (extra = {}) => ({ status: 200, body: { success: true, done: true, inserted: 0, skipped: 0, warnings: [], ...extra } });
const acc = (o = {}) => ({ id: 'a1', ctid_trader_account_id: 111, journal_id: 'j1', auto_sync: true, access_revoked: false, is_syncing: false, last_sync_at: new Date(NOW - 2 * 3600000).toISOString(), ...o });

describe('runSync', () => {
  it('done:false geldikçe devam eder, toplamları ve uyarıları biriktirir', async () => {
    const f = fakeFetch((n) => ok({ done: n >= 3, inserted: 10 * n, skipped: 1, warnings: n === 2 ? ['w'] : [] }));
    const rounds = [];
    const r = await S.runSync({ ctid: '111', journalId: 'j1', token: 'T', fetchFn: f, url: 'https://x', onRound: (k) => rounds.push(k) });
    assert.equal(r.inserted, 60); assert.equal(r.skipped, 3); assert.equal(r.rounds, 3); assert.equal(r.done, true);
    assert.deepEqual([...r.warnings], ['w']); assert.deepEqual(rounds, [1, 2]);
    assert.equal(f.calls[0].url, 'https://x/functions/v1/ctrader-sync');
    assert.equal(f.calls[0].body.ctidTraderAccountId, 111);       // sayı olarak gider
    assert.equal(f.calls[0].headers.Authorization, 'Bearer T');
  });

  it('tur tavanında durur ve done:false bildirir', async () => {
    const f = fakeFetch(() => ok({ done: false, inserted: 1 }));
    const r = await S.runSync({ ctid: 1, journalId: 'j', token: 'T', fetchFn: f, maxRounds: 4 });
    assert.equal(f.calls.length, 4); assert.equal(r.done, false); assert.equal(r.inserted, 4);
  });

  it('hata kodları: erişim kalktı, yeniden bağlan, meşgul, genel, ağ', async () => {
    const cases = [
      [{ status: 403, body: { error: 'izin yok', access_revoked: true } }, 'ACCESS_REVOKED'],
      [{ status: 401, body: { error: 'süre doldu', needs_reconnect: true } }, 'NEEDS_RECONNECT'],
      [{ status: 429, body: { error: 'devam ediyor', is_syncing: true } }, 'BUSY'],
      [{ status: 400, body: { error: 'cTrader bağlantı hatası: x' } }, 'FAILED'],
      ['NETWORK', 'NETWORK'],
    ];
    for (const [resp, want] of cases) {
      const f = fakeFetch(() => resp);
      await assert.rejects(() => S.runSync({ ctid: 1, journalId: 'j', token: 'T', fetchFn: f }), (e) => e.code === want, want);
    }
  });

  it('ikinci turda hata: o ana kadar eklenenler hatada taşınır', async () => {
    const f = fakeFetch((n) => (n === 1 ? ok({ done: false, inserted: 7 }) : { status: 400, body: { error: 'boom' } }));
    await assert.rejects(() => S.runSync({ ctid: 1, journalId: 'j', token: 'T', fetchFn: f }),
      (e) => e.code === 'FAILED' && e.inserted === 7 && e.rounds === 2 && e.message === 'boom');
  });

  it('oturum yoksa istek atmaz', async () => {
    const f = fakeFetch(() => ok());
    await assert.rejects(() => S.runSync({ ctid: 1, journalId: 'j', token: null, fetchFn: f }), (e) => e.code === 'NO_SESSION');
    assert.equal(f.calls.length, 0);
  });

  it('JSON olmayan 502 cevabı genel hata olur, çökmez', async () => {
    const f = async () => ({ ok: false, status: 502, json: async () => { throw new SyntaxError('html'); } });
    await assert.rejects(() => S.runSync({ ctid: 1, journalId: 'j', token: 'T', fetchFn: f }), (e) => e.code === 'FAILED');
  });
});

describe('autoSyncCandidates', () => {
  it('yalnızca uygun hesaplar', () => {
    const list = [
      acc({ ctid_trader_account_id: 1 }),
      acc({ ctid_trader_account_id: 2, auto_sync: false }),
      acc({ ctid_trader_account_id: 3, auto_sync: undefined }),          // migration öncesi sunucu: alan yok -> kapalı
      acc({ ctid_trader_account_id: 4, journal_id: null }),
      acc({ ctid_trader_account_id: 5, access_revoked: true }),
      acc({ ctid_trader_account_id: 6, is_syncing: true }),
      acc({ ctid_trader_account_id: 7, last_sync_at: new Date(NOW - 10 * MIN).toISOString() }),
      acc({ ctid_trader_account_id: 8, last_sync_at: null }),            // hiç senkron yok -> uygun
      acc({ ctid_trader_account_id: 9, last_sync_at: new Date(NOW - 30 * MIN).toISOString() }),   // tam 30 dk -> uygun
      acc({ ctid_trader_account_id: 10 }),
    ];
    const attempts = { 10: NOW - 5 * MIN };                               // bu tarayıcıda az önce denendi
    assert.deepEqual(S.autoSyncCandidates(list, NOW, attempts).map((a) => a.ctid_trader_account_id), [1, 8, 9]);
  });
  it('liste değilse boş', () => {
    assert.deepEqual(S.autoSyncCandidates(null, NOW, {}).length, 0);
  });
});

describe('autoSync', () => {
  const baseStatus = (accounts) => ({ is_connected: true, token_status: 'active', accounts });

  it('uygun hesapları sırayla senkronlar, toplam yeni işlemi döner, denemeyi kaydeder', async () => {
    const storage = memStorage();
    const f = fakeFetch((n, b) => ok({ inserted: b.ctidTraderAccountId === 1 ? 3 : 0 }));
    const r = await S.autoSync({
      status: baseStatus([acc({ ctid_trader_account_id: 1, journal_id: 'j1' }), acc({ ctid_trader_account_id: 2, journal_id: 'j2' }), acc({ ctid_trader_account_id: 3, auto_sync: false })]),
      getToken: async () => 'T', fetchFn: f, storage, now: () => NOW,
    });
    assert.equal(r.ran, 2); assert.equal(r.inserted, 3);
    assert.deepEqual(f.calls.map((c) => [c.body.ctidTraderAccountId, c.body.journalId]), [[1, 'j1'], [2, 'j2']]);
    const st = JSON.parse(storage.getItem(S.ATTEMPTS_KEY));
    assert.equal(st.attempts['1'], NOW); assert.equal(st.attempts['2'], NOW);
  });

  it('30 dk içinde ikinci açılış (ya da başka sekme) istek atmaz; başarısız deneme de sayılır', async () => {
    const storage = memStorage();
    const fail = fakeFetch(() => ({ status: 400, body: { error: 'boom' } }));
    const status = baseStatus([acc()]);
    const r1 = await S.autoSync({ status, getToken: async () => 'T', fetchFn: fail, storage, now: () => NOW });
    assert.equal(r1.ran, 1); assert.ok(r1.results[0].error);
    const f2 = fakeFetch(() => ok());
    const r2 = await S.autoSync({ status, getToken: async () => 'T', fetchFn: f2, storage, now: () => NOW + 29 * MIN });
    assert.equal(r2.ran, 0); assert.equal(f2.calls.length, 0);
    const r3 = await S.autoSync({ status, getToken: async () => 'T', fetchFn: f2, storage, now: () => NOW + 31 * MIN });
    assert.equal(r3.ran, 1);
  });

  it('erişim kalktı / yeniden bağlan uyarısı günde bir kez; NEEDS_RECONNECT diğer hesapları denemez', async () => {
    const storage = memStorage();
    const notes = [];
    const f = fakeFetch(() => ({ status: 401, body: { error: 'süre doldu', needs_reconnect: true } }));
    const status = baseStatus([acc({ ctid_trader_account_id: 1 }), acc({ ctid_trader_account_id: 2 })]);
    let t = NOW;
    const run = () => S.autoSync({ status, getToken: async () => 'T', fetchFn: f, storage, now: () => t, notify: (c, a) => notes.push([c, a.ctid_trader_account_id]) });
    const r = await run();
    assert.equal(f.calls.length, 1); assert.equal(r.ran, 1);
    assert.deepEqual(notes, [['NEEDS_RECONNECT', 1]]);
    t = NOW + 31 * MIN; await run();
    assert.equal(notes.length, 1);                                   // 24 saat dolmadı: tekrar uyarmaz
    t = NOW + 25 * 3600000; await run();
    assert.equal(notes.length, 2);
  });

  it('token durumu needs_reconnect ise hiç denemez; oturum yoksa istek atmaz', async () => {
    const f = fakeFetch(() => ok());
    const r1 = await S.autoSync({ status: { token_status: 'needs_reconnect', accounts: [acc()] }, getToken: async () => 'T', fetchFn: f, storage: memStorage(), now: () => NOW });
    assert.equal(r1.ran, 0);
    const r2 = await S.autoSync({ status: baseStatus([acc()]), getToken: async () => null, fetchFn: f, storage: memStorage(), now: () => NOW });
    assert.equal(r2.ran, 0);
    assert.equal(f.calls.length, 0);
  });

  it('bozuk ya da erişilemeyen depolama senkronu engellemez', async () => {
    const bad = { getItem: () => '{bozuk', setItem: () => { throw new Error('quota'); } };
    const f = fakeFetch(() => ok({ inserted: 2 }));
    const r = await S.autoSync({ status: baseStatus([acc()]), getToken: async () => 'T', fetchFn: f, storage: bad, now: () => NOW });
    assert.equal(r.inserted, 2);
    const r2 = await S.autoSync({ status: baseStatus([acc()]), getToken: async () => 'T', fetchFn: f, storage: null, now: () => NOW });
    assert.equal(r2.inserted, 2);
  });

  it('eski kayıtlar (7 günden eski) temizlenir', async () => {
    const storage = memStorage({ [S.ATTEMPTS_KEY]: JSON.stringify({ attempts: { 999: NOW - 8 * 86400000 }, warned: { 998: NOW - 8 * 86400000 } }) });
    await S.autoSync({ status: baseStatus([acc()]), getToken: async () => 'T', fetchFn: fakeFetch(() => ok()), storage, now: () => NOW });
    const st = JSON.parse(storage.getItem(S.ATTEMPTS_KEY));
    assert.equal(st.attempts['999'], undefined); assert.equal(st.warned['998'], undefined);
  });
});

describe('chooseAccount', () => {
  const a = { id: 'a', journal_id: null }, b = { id: 'b', journal_id: 'j1' }, c = { id: 'c', journal_id: null };
  it('tek hesap: sormadan', () => assert.equal(S.chooseAccount([a], 'j9').account.id, 'a'));
  it('defter zaten listedeki bir hesaba bağlı: o hesap', () => {
    const r = S.chooseAccount([a, b, c], 'j1');
    assert.equal(r.account.id, 'b'); assert.equal(r.reason, 'already_linked');
  });
  it('birden çok hesap ve eşleşme yok: kullanıcıya sorulur (null)', () => assert.equal(S.chooseAccount([a, c], 'j1'), null));
  it('hiç hesap yok: null', () => assert.equal(S.chooseAccount([], 'j1'), null));
});

describe('endpoint', () => {
  it('WW_CONFIG değerleri öncelikli', () => {
    const W = load({ WW_CONFIG: { SUPABASE_URL: 'https://cfg', SUPABASE_ANON_KEY: 'k' } });
    assert.deepEqual({ ...W.endpoint() }, { url: 'https://cfg', anonKey: 'k' });
  });
});
