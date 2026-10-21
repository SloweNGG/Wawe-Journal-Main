// ============================================================
// WAWE JOURNAL - cTrader ORTAK EDGE FUNCTION KODU TEST SUITE
// Runner: node --test tests/*.test.js
// Kapsam: supabase/functions/_shared/ctrader.ts (Node, tür soyma ile aynen yüklenir)
//   - trendbar çözme, 9 günlük parça + hasMore sayfalama (14 000 bar tavanı simülasyonu)
//   - ilk bar/ay bulma (ikili arama)
//   - kilitli token yenileme: eşzamanlı iki çağıran tek yenileme yapar, kesin hata -> needs_reconnect,
//     geçici hata -> bağlantı kopmuş sayılmaz
//   - hata sınıflandırma
// ============================================================
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as X from '../supabase/functions/_shared/ctrader.ts';

const MIN = 60000;

// Sahte cTrader: M1 barları bir fonksiyonla üretilir; 14 000 tavanı ve hasMore, gerçek davranış gibi (aralığın SONUNDAN N bar)
// quirks (gerçek sunucuda gözlenen / olası davranışlar; eski `count: 1` + ay sonu bitişi sorgusu canlıda "veri yok" üretti):
//   futureEmpty: bitişi "şimdi"den ilerideyse boş yanıt; slotCount: `count` bar değil ZAMAN YUVASI sayar (bitişten geriye count dakika)
function fakeServer({ firstMin, lastMin, holes = () => false, cap = 14000, now = Infinity, futureEmpty = false, slotCount = false }) {
  const calls = [];
  const bar = (t) => ({ utcTimestampInMinutes: t, low: 100000 + (t % 50), deltaOpen: 2, deltaHigh: 7, deltaClose: 5 });
  return {
    calls,
    async sendRequest(type, p) {
      calls.push({ type, p });
      assert.equal(type, 2137);
      let a = Math.ceil(p.fromTimestamp / MIN), b = Math.floor(p.toTimestamp / MIN);
      if (futureEmpty && p.toTimestamp > now) return { payload: { trendbar: [], hasMore: false } };
      if (slotCount && p.count && p.period === 1) a = Math.max(a, b - p.count + 1);
      const step = p.period === 13 ? 7 * 1440 : 1;
      const all = [];
      for (let t = Math.max(a, firstMin); t <= Math.min(b, lastMin); t += step) if (!holes(t)) all.push(t);
      let take = all, hasMore = false;
      const lim = p.count ? Math.min(p.count, cap) : cap;
      if (all.length > lim) { take = all.slice(all.length - lim); hasMore = true; }
      return { payload: { trendbar: take.map(bar), hasMore } };
    },
  };
}

describe('decodeTrendbar', () => {
  it('low + deltalar, 1e-5 birim', () => {
    assert.deepEqual(X.decodeTrendbar({ utcTimestampInMinutes: 5, low: 100, deltaOpen: 3, deltaHigh: 9, deltaClose: 4 }), { tMin: 5, o: 103, h: 109, l: 100, c: 104 });
  });
  it('bozuk bar atılır', () => {
    assert.equal(X.decodeTrendbar({ utcTimestampInMinutes: 0, low: 1 }), null);
    assert.equal(X.decodeTrendbar({ low: 'x', utcTimestampInMinutes: 3 }), null);
    assert.equal(X.decodeTrendbar(null), null);
  });
});

describe('fetchMinuteBars', () => {
  const from = Date.UTC(2024, 2, 1), to = Date.UTC(2024, 3, 1) - 1;   // Mart 2024, tam M1: 44 640 bar
  const m0 = from / MIN, m1 = Math.floor(to / MIN);

  it('bir ayı eksiksiz, tekrarsız ve sıralı getirir (9 günlük parçalar)', async () => {
    const srv = fakeServer({ firstMin: m0, lastMin: m1 });
    const bars = await X.fetchMinuteBars(srv, 1, 41, from, to);
    assert.equal(bars.length, m1 - m0 + 1);
    for (let i = 1; i < bars.length; i++) assert.ok(bars[i].tMin > bars[i - 1].tMin);
    assert.equal(bars[0].tMin, m0); assert.equal(bars.at(-1).tMin, m1);
    // 31 gün / 9 = 4 parça, her parça tavanın altında: sayfalama gerekmez
    assert.equal(srv.calls.length, 4);
    assert.ok(srv.calls.every((c) => c.p.period === 1 && c.p.symbolId === 41 && c.p.ctidTraderAccountId === 1));
  });

  it('parça tavanı aşarsa hasMore ile geriye doğru sayfalar, bar kaybolmaz', async () => {
    const srv = fakeServer({ firstMin: m0, lastMin: m1, cap: 3000 });   // 9 gün = 12 960 bar > 3000
    const bars = await X.fetchMinuteBars(srv, 1, 41, from, to);
    assert.equal(bars.length, m1 - m0 + 1, 'tavan düşük olsa da hiç bar eksik değil');
    assert.ok(srv.calls.length > 4);
  });

  it('ilerleme yoksa sonsuz döngüye girmez', async () => {
    let n = 0;
    const stuck = { async sendRequest() { n++; return { payload: { trendbar: [{ utcTimestampInMinutes: m0 + 5, low: 1, deltaOpen: 0, deltaHigh: 0, deltaClose: 0 }], hasMore: true } }; } };
    const bars = await X.fetchMinuteBars(stuck, 1, 1, from, from + 9 * 86400000);
    assert.ok(n <= X.MAX_PAGES * 2 + 2);
    assert.ok(bars.length >= 1);
  });

  it('delikli veride (hafta sonu) yalnızca var olan barlar gelir', async () => {
    const srv = fakeServer({ firstMin: m0, lastMin: m1, holes: (t) => { const d = new Date(t * MIN).getUTCDay(); return d === 6 || d === 0; } });
    const bars = await X.fetchMinuteBars(srv, 1, 41, from, to);
    assert.ok(bars.every((b) => ![0, 6].includes(new Date(b.tMin * MIN).getUTCDay())));
    assert.ok(bars.length > 20000 && bars.length < 44640);
  });
});

describe('findFirstMinuteBar', () => {
  const now = Date.UTC(2026, 9, 21, 12);
  it('ilk M1 ayını ve ilk barı bulur (2013-05-14\'te başlayan veri)', async () => {
    const first = Date.UTC(2013, 4, 14, 3, 7) / MIN;
    const srv = fakeServer({ firstMin: first, lastMin: now / MIN });
    const r = await X.findFirstMinuteBar(srv, 1, 41, now);
    assert.equal(r.firstMonth, '2013-05');
    assert.equal(r.firstTMin, first);
    assert.ok(r.probes <= 20, 'az istek: ' + r.probes);
  });
  it('ayın ilk günü başlayan veri', async () => {
    const first = Date.UTC(2020, 0, 1) / MIN;
    const srv = fakeServer({ firstMin: first, lastMin: now / MIN });
    const r = await X.findFirstMinuteBar(srv, 1, 1, now);
    assert.equal(r.firstMonth, '2020-01'); assert.equal(r.firstTMin, first);
  });
  it('canlıda görülen sunucu tuhaflıklarında da ilk ayı bulur (gelecek bitişte boş yanıt, count = zaman yuvası)', async () => {
    const first = Date.UTC(2013, 4, 14, 3, 7) / MIN;
    for (const quirks of [{ futureEmpty: true }, { slotCount: true }, { futureEmpty: true, slotCount: true }]) {
      const srv = fakeServer({ firstMin: first, lastMin: now / MIN, holes: (t) => { const d = new Date(t * MIN).getUTCDay(); return d === 6 || d === 0; }, now, ...quirks });
      const r = await X.findFirstMinuteBar(srv, 1, 41, now);
      assert.ok(r, JSON.stringify(quirks));
      assert.equal(r.firstMonth, '2013-05'); assert.equal(r.firstTMin, first);
    }
  });
  it('istekler count taşımaz ve hiçbirinin bitişi "şimdi"den ileride değildir', async () => {
    const srv = fakeServer({ firstMin: Date.UTC(2020, 0, 1) / MIN, lastMin: now / MIN });
    await X.findFirstMinuteBar(srv, 1, 1, now);
    assert.ok(srv.calls.length > 3);
    assert.ok(srv.calls.every((c) => c.p.count === undefined), 'count yok');
    assert.ok(srv.calls.every((c) => c.p.toTimestamp <= now), 'bitiş şimdiden ileride değil');
  });
  it('dünün ayında bar yoksa bir önceki aya bakar (ay başı)', async () => {
    const early = Date.UTC(2026, 10, 1, 8);                              // 1 Kasım 08:00: dün Ekim'in son günü
    const srv = fakeServer({ firstMin: Date.UTC(2020, 0, 1) / MIN, lastMin: Date.UTC(2026, 9, 30, 21) / MIN });
    const r = await X.findFirstMinuteBar(srv, 1, 1, early);
    assert.equal(r.firstMonth, '2020-01');
  });
  it('W1 ipucu yanlışsa (daha geç bir ay) ipucuna güvenmez', async () => {
    const first = Date.UTC(2015, 5, 3) / MIN;
    const srv = fakeServer({ firstMin: first, lastMin: now / MIN });
    const orig = srv.sendRequest.bind(srv);
    srv.sendRequest = async (t, p) => (p.period === 13
      ? { payload: { trendbar: [{ utcTimestampInMinutes: Date.UTC(2022, 0, 3) / MIN, low: 1, deltaOpen: 0, deltaHigh: 0, deltaClose: 0 }], hasMore: false } }
      : orig(t, p));
    const r = await X.findFirstMinuteBar(srv, 1, 1, now);
    assert.equal(r.firstMonth, '2015-06');
  });
  it('veri yoksa null', async () => {
    const srv = fakeServer({ firstMin: 10, lastMin: 5 });   // hiç bar yok
    assert.equal(await X.findFirstMinuteBar(srv, 1, 1, now), null);
  });
  it('AUTH hatası yukarı fırlar', async () => {
    const bad = { async sendRequest() { throw { errorCode: 'CH_ACCESS_TOKEN_INVALID', description: 'bad token' }; } };
    await assert.rejects(() => X.findFirstMinuteBar(bad, 1, 1, now), (e) => X.classifyCtraderError(e).code === 'AUTH');
  });
});

describe('classifyCtraderError', () => {
  it('kodlar', () => {
    assert.equal(X.classifyCtraderError({ errorCode: 'CH_ACCESS_TOKEN_INVALID' }).code, 'AUTH');
    assert.equal(X.classifyCtraderError({ errorCode: 'OA_AUTH_TOKEN_EXPIRED' }).code, 'AUTH');
    assert.equal(X.classifyCtraderError({ errorCode: '104' }).code, 'AUTH');
    assert.equal(X.classifyCtraderError({ errorCode: 'REQUEST_FREQUENCY_EXCEEDED' }).code, 'RATE');
    assert.equal(X.classifyCtraderError({ errorCode: '108' }).code, 'RATE');
    assert.equal(X.classifyCtraderError({ errorCode: 'INVALID_REQUEST' }).code, 'RANGE');
    assert.equal(X.classifyCtraderError(new Error('İstek zaman aşımı (2137)')).code, 'OTHER');
  });
  it('mesaj ham hata metnini sızdırmaz', () => {
    const m = X.classifyCtraderError({ errorCode: 'X', description: 'secret-token-abc123' }).message;
    assert.ok(!m.includes('abc123'));
  });
});

// ------------------------------------------------------------ token yenileme
function memStore(initial) {
  const st = { row: initial ? { ...initial } : null, lease: null, reconnect: false, saves: 0, log: [] };
  const store = {
    async read() { await Promise.resolve(); return st.row ? { ...st.row } : null; },
    async acquire(_u, nowIso, cutoffIso) {
      await Promise.resolve();
      if (!st.row) return null;
      if (st.lease === null || st.lease < cutoffIso) { st.lease = nowIso; return { ...st.row }; }
      return null;
    },
    async save(_u, f) { st.saves++; st.row = { ...st.row, ...f, status: 'active' }; st.lease = null; },
    async release() { st.lease = null; },
    async markNeedsReconnect() { st.reconnect = true; },
  };
  return { st, store };
}
function fakeFetch(responder) {
  const calls = [];
  const f = async (url) => {
    calls.push(String(url));
    const r = await responder(calls.length);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  f.calls = calls;
  return f;
}
const NOW = Date.UTC(2026, 9, 21, 12);
const day = 86400000;
const deps = (fetchFn, extra = {}) => ({ clientId: 'cid', clientSecret: 'sec', fetchFn, now: () => NOW, sleepFn: async () => {}, ...extra });

describe('getAccessToken (kilitli, ortak yenileme)', () => {
  it('süresi yeterliyse yenilemez', async () => {
    const { store } = memStore({ access_token: 'A', refresh_token: 'R', expires_at: new Date(NOW + 5 * day).toISOString() });
    const f = fakeFetch(() => { throw new Error('çağrılmamalı'); });
    const r = await X.getAccessToken(store, 'u', deps(f));
    assert.deepEqual(r, { ok: true, accessToken: 'A', refreshed: false });
    assert.equal(f.calls.length, 0);
  });

  it('iki eşzamanlı çağıran: refresh token yalnızca BİR kez kullanılır', async () => {
    const { st, store } = memStore({ access_token: 'A', refresh_token: 'R1', expires_at: new Date(NOW + 2 * 3600000).toISOString() });
    const f = fakeFetch(async () => { await new Promise((r) => setTimeout(r, 20)); return { status: 200, body: { accessToken: 'A2', refreshToken: 'R2', expiresIn: '2592000' } }; });
    let sleeps = 0;
    const d = deps(f, { sleepFn: async () => { sleeps++; await new Promise((r) => setTimeout(r, 15)); } });
    const [x, y] = await Promise.all([X.getAccessToken(store, 'u', d), X.getAccessToken(store, 'u', d)]);
    assert.equal(f.calls.length, 1, 'tek yenileme');
    assert.ok(f.calls[0].includes('refresh_token=R1'));
    assert.equal(x.accessToken, 'A2'); assert.equal(y.accessToken, 'A2');
    assert.equal(st.row.refresh_token, 'R2'); assert.equal(st.saves, 1);
    assert.equal(st.lease, null, 'kira bırakıldı');
    assert.ok(sleeps >= 1, 'ikinci çağıran bekledi');
  });

  it('kesin hata (geçersiz refresh token): needs_reconnect işaretlenir, kira bırakılır', async () => {
    const { st, store } = memStore({ access_token: 'A', refresh_token: 'R', expires_at: new Date(NOW - day).toISOString() });
    const f = fakeFetch(() => ({ status: 200, body: { errorCode: 'INVALID_REFRESH_TOKEN', description: 'x' } }));
    const r = await X.getAccessToken(store, 'u', deps(f));
    assert.equal(r.ok, false); assert.equal(r.code, 'NEEDS_RECONNECT');
    assert.equal(st.reconnect, true); assert.equal(st.lease, null);
  });

  it('geçici hata (5xx): bağlantı kopmuş SAYILMAZ; token geçerliyse onunla devam', async () => {
    const { st, store } = memStore({ access_token: 'A', refresh_token: 'R', expires_at: new Date(NOW + 3600000).toISOString() });
    const f = fakeFetch(() => ({ status: 503, body: null }));
    const r = await X.getAccessToken(store, 'u', deps(f));
    assert.deepEqual(r, { ok: true, accessToken: 'A', refreshed: false });
    assert.equal(st.reconnect, false); assert.equal(st.lease, null);
  });

  it('geçici hata + token süresi dolmuş: REFRESH_ERROR (needs_reconnect değil)', async () => {
    const { st, store } = memStore({ access_token: 'A', refresh_token: 'R', expires_at: new Date(NOW - 1000).toISOString() });
    const f = fakeFetch(() => ({ status: 502, body: null }));
    const r = await X.getAccessToken(store, 'u', deps(f));
    assert.equal(r.ok, false); assert.equal(r.code, 'REFRESH_ERROR');
    assert.equal(st.reconnect, false);
  });

  it('satır yoksa NO_TOKEN', async () => {
    const { store } = memStore(null);
    const r = await X.getAccessToken(store, 'u', deps(fakeFetch(() => ({ status: 200, body: {} }))));
    assert.equal(r.code, 'NO_TOKEN');
  });

  it('eski kira (60 sn üstü) çalınabilir, taze kira beklenir', async () => {
    const { st, store } = memStore({ access_token: 'A', refresh_token: 'R', expires_at: new Date(NOW + 3600000).toISOString() });
    st.lease = new Date(NOW - 120000).toISOString();     // ölü kira
    const f = fakeFetch(() => ({ status: 200, body: { accessToken: 'B', refreshToken: 'R9', expiresIn: '100' } }));
    const r = await X.getAccessToken(store, 'u', deps(f));
    assert.equal(r.accessToken, 'B'); assert.equal(f.calls.length, 1);
  });

  it('yenileme sonrası kaydetme başarısız olursa tekrar dener (yeni refresh token kaybolmaz)', async () => {
    const { st, store } = memStore({ access_token: 'A', refresh_token: 'R', expires_at: new Date(NOW + 3600000).toISOString() });
    let fails = 2;
    const realSave = store.save;
    store.save = async (u, fl) => { if (fails-- > 0) throw new Error('db down'); return realSave(u, fl); };
    const f = fakeFetch(() => ({ status: 200, body: { accessToken: 'B', refreshToken: 'R2', expiresIn: '100' } }));
    const r = await X.getAccessToken(store, 'u', deps(f));
    assert.equal(r.ok, true); assert.equal(st.row.refresh_token, 'R2');
  });
});
