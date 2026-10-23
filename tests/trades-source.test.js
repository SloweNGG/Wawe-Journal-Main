// ============================================================
// WAWE JOURNAL - İŞLEM KAYNAĞI KAPSAMI TEST SUITE 
// Runner: node --test tests/*.test.js
// Kapsam: public/interface/shared/trades-source.js (WwTrades) + public/cache.js kapsam sözleşmesi
// ============================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { recordingClient } from './helpers/fake-supabase.js';

const sourceCode = fs.readFileSync(path.resolve("public/interface/shared/trades-source.js"), "utf8");
const cacheCode = fs.readFileSync(path.resolve("public/cache.js"), "utf8");

const LIVE_OR = 'platform_source.is.null,platform_source.neq.backtest';
const plainJson = (x) => JSON.parse(JSON.stringify(x));

function load(extra = {}) {
  const win = { ...extra };
  win.window = win;
  vm.runInNewContext(sourceCode, win);
  return { T: win.WwTrades, win };
}

const rows = [
  { id: 'm1', platform_source: null },
  { id: 'm2' },                                  // column missing -> live
  { id: 'm3', platform_source: '' },
  { id: 'c1', platform_source: 'ctrader' },
  { id: 'b1', platform_source: 'backtest' },
  { id: 'b2', platform_source: 'backtest' }
];

describe('WwTrades sabitleri ve kapsam yardımcıları', () => {
  const { T } = load();

  it('LIVE_OR NULL-güvenli ifade (neq tek başına NULL satırları düşürür)', () => {
    assert.equal(T.LIVE_OR, LIVE_OR);
    assert.equal(T.BACKTEST, 'backtest');
    assert.deepEqual(plainJson(T.SCOPES), ['live', 'backtest', 'all']);
  });

  it('filterScope: NULL / eksik / boş / ctrader = canlı; varsayılan ve geçersiz kapsam = canlı', () => {
    const ids = (l) => plainJson(l.map((t) => t.id));
    assert.deepEqual(ids(T.filterScope(rows)), ['m1', 'm2', 'm3', 'c1']);
    assert.deepEqual(ids(T.filterScope(rows, 'live')), ['m1', 'm2', 'm3', 'c1']);
    assert.deepEqual(ids(T.filterScope(rows, 'nope')), ['m1', 'm2', 'm3', 'c1']);
    assert.deepEqual(ids(T.filterScope(rows, 'backtest')), ['b1', 'b2']);
    assert.deepEqual(ids(T.filterScope(rows, 'all')), rows.map((r) => r.id));
    assert.deepEqual(plainJson(T.filterScope(null)), []);
    assert.deepEqual(plainJson(T.filterScope([null, { id: 'x' }])), [{ id: 'x' }]);
  });

  it('filterScope girdiyi değiştirmez (yeni dizi döner)', () => {
    const copy = rows.slice();
    const out = T.filterScope(copy, 'all');
    assert.notEqual(out, copy);
    assert.equal(copy.length, 6);
  });

  it('isBacktest / inScope', () => {
    assert.equal(T.isBacktest({ platform_source: 'backtest' }), true);
    assert.equal(T.isBacktest({ platform_source: 'Backtest' }), false);
    assert.equal(T.isBacktest(null), false);
    assert.equal(T.inScope({ platform_source: null }, 'backtest'), false);
    assert.equal(T.inScope({ platform_source: 'backtest' }, 'all'), true);
  });

  it('applyScope: live -> or(LIVE_OR), backtest -> eq, all -> filtre yok', () => {
    const rec = () => { const calls = []; const q = { or: (s) => (calls.push(['or', s]), q), eq: (c, v) => (calls.push(['eq', c, v]), q) }; return { q, calls }; };
    let r = rec(); assert.equal(T.applyScope(r.q, 'live'), r.q); assert.deepEqual(r.calls, [['or', LIVE_OR]]);
    r = rec(); T.applyScope(r.q); assert.deepEqual(r.calls, [['or', LIVE_OR]]);
    r = rec(); T.applyScope(r.q, 'backtest'); assert.deepEqual(r.calls, [['eq', 'platform_source', 'backtest']]);
    r = rec(); T.applyScope(r.q, 'all'); assert.deepEqual(r.calls, []);
  });

  it('withSourceCol: platform_source eklenir, boşluklar/yıldız/korunan kolonlar', () => {
    assert.equal(T.withSourceCol('id,symbol'), 'id,symbol,platform_source');
    assert.equal(T.withSourceCol('id, trade_date , pnl'), 'id,trade_date,pnl,platform_source');
    assert.equal(T.withSourceCol('id,platform_source'), 'id,platform_source');
    assert.equal(T.withSourceCol('*'), '*');
    assert.equal(T.withSourceCol(undefined), '*');
  });

  it('cacheKey: canlı = temel anahtar, diğerleri @kapsam', () => {
    assert.equal(T.cacheKey('trades', 'live'), 'trades');
    assert.equal(T.cacheKey('trades'), 'trades');
    assert.equal(T.cacheKey('trades', 'all'), 'trades@all');
    assert.equal(T.cacheKey('trades_dashboard', 'backtest'), 'trades_dashboard@backtest');
  });

  it('ikinci yükleme ilk nesneyi değiştirmez (BaseHead + bundle.js ikisi de yükler)', () => {
    const { T: first, win } = load();
    vm.runInNewContext(sourceCode, win);
    assert.equal(win.WwTrades, first);
  });
});

describe('WwTrades.fetchAll / count (kayıt tutan sahte istemci)', () => {
  function pagedClient(pages, { countValue = 0, unassigned = [] } = {}) {
    return recordingClient((call) => {
      if (call.head) return { data: null, count: countValue, error: null, status: 200 };
      const isUn = call.filters.some((f) => f[0] === 'is' && f[1] === 'journal_id');
      const src = isUn ? unassigned : pages;
      const [a, z] = call.range;
      return { data: src.slice(a, z + 1), error: null, status: 200 };
    });
  }

  it('sayfalama 1000\'lik; kolonlara platform_source eklenir; filtre zinciri sırası', async () => {
    const all = Array.from({ length: 1200 }, (_, i) => ({ id: 'r' + i, platform_source: null }));
    const c = pagedClient(all);
    const { T } = load();
    const res = await T.fetchAll({ client: c, userId: 'u', journalId: 'j', columns: 'id,trade_date,pnl', ascending: false });
    assert.equal(res.error, null);
    assert.equal(res.data.length, 1200);
    assert.deepEqual(c.calls.map((x) => x.range), [[0, 999], [1000, 1999]]);
    const first = c.calls[0];
    assert.equal(first.table, 'trades');
    assert.equal(first.columns, 'id,trade_date,pnl,platform_source');
    assert.deepEqual(first.filters, [['eq', 'user_id', 'u'], ['eq', 'journal_id', 'j'], ['or', LIVE_OR]]);
    assert.deepEqual(first.orders, [['trade_date', false], ['id', true]]);
  });

  it('since + ascending + backtest kapsamı', async () => {
    const c = pagedClient([{ id: 1 }]);
    const { T } = load();
    await T.fetchAll({ client: c, userId: 'u', since: '2026-10-11', scope: 'backtest', ascending: true, columns: 'trade_date' });
    assert.deepEqual(c.calls[0].filters, [['eq', 'user_id', 'u'], ['gte', 'trade_date', '2026-10-11'], ['eq', 'platform_source', 'backtest']]);
    assert.deepEqual(c.calls[0].orders, [['trade_date', true], ['id', true]]);
  });

  it('2. sayfada hata: o ana kadarki satırlar + hata döner', async () => {
    let n = 0;
    const c = recordingClient((call) => (++n === 1 ? { data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null } : { data: null, error: { message: 'boom' } }));
    const { T } = load();
    const res = await T.fetchAll({ client: c, userId: 'u', journalId: 'j' });
    assert.equal(res.data.length, 1000);
    assert.equal(res.error.message, 'boom');
  });

  it('deftersiz geri dönüş: canlı liste boş VE defterde hiç satır yoksa (HEAD count 0) çalışır, aynı kapsamla', async () => {
    const c = pagedClient([], { countValue: 0, unassigned: [{ id: 'old', platform_source: null }] });
    const { T } = load();
    const res = await T.fetchAll({ client: c, userId: 'u', journalId: 'j', unassignedFallback: true });
    assert.deepEqual(plainJson(res.data), [{ id: 'old', platform_source: null }]);
    const head = c.calls.find((x) => x.head);
    assert.deepEqual(head.filters, [['eq', 'user_id', 'u'], ['eq', 'journal_id', 'j']]);   // scope 'all' -> no source filter
    const un = c.calls.find((x) => x.filters.some((f) => f[0] === 'is'));
    assert.deepEqual(un.filters, [['eq', 'user_id', 'u'], ['is', 'journal_id', null], ['or', LIVE_OR]]);
  });

  it('deftersiz geri dönüş: defterde yalnızca backtest satırı varsa ÇALIŞMAZ (ilgisiz eski işlemler gösterilmez)', async () => {
    const c = pagedClient([], { countValue: 3, unassigned: [{ id: 'old' }] });
    const { T } = load();
    const res = await T.fetchAll({ client: c, userId: 'u', journalId: 'j', unassignedFallback: true });
    assert.deepEqual(plainJson(res.data), []);
    assert.equal(c.calls.some((x) => x.filters.some((f) => f[0] === 'is')), false);
  });

  it('kapsam "all" iken HEAD count atlanır (liste zaten tüm kapsamlar)', async () => {
    const c = pagedClient([], { unassigned: [{ id: 'old' }] });
    const { T } = load();
    const res = await T.fetchAll({ client: c, userId: 'u', journalId: 'j', scope: 'all', unassignedFallback: true });
    assert.equal(res.data.length, 1);
    assert.equal(c.calls.some((x) => x.head), false);
  });

  it('count: HEAD + exact + kapsam + since kolonu', async () => {
    const c = pagedClient([], { countValue: 42 });
    const { T } = load();
    const r = await T.count({ client: c, journalId: 'j', scope: 'backtest' });
    assert.equal(r.count, 42);
    assert.equal(c.calls[0].head, true);
    assert.equal(c.calls[0].count, 'exact');
    assert.deepEqual(c.calls[0].filters, [['eq', 'journal_id', 'j'], ['eq', 'platform_source', 'backtest']]);
    const c2 = pagedClient([], { countValue: 1 });
    await T.count({ client: c2, since: '2026-10-18', scope: 'live' });
    assert.deepEqual(c2.calls[0].filters, [['gte', 'created_at', '2026-10-18'], ['or', LIVE_OR]]);
  });

  it('istemci yoksa hata döner, istisna fırlatmaz', async () => {
    const { T } = load();
    const r = await T.fetchAll({});
    assert.equal(r.error.message, 'SUPABASE_NOT_READY');
  });
});

describe('cache.js kapsam sözleşmesi', () => {
  function loadCache(src) {
    const store = {};
    const ss = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      key: (i) => Object.keys(store)[i],
      get length() { return Object.keys(store).length; }
    };
    const win = { sessionStorage: ss, addEventListener: () => {}, Map, Date, JSON };
    win.window = win;
    vm.runInNewContext(src, win);
    return { C: win.wwCache, store };
  }
  const mixed = [{ id: 'b1', platform_source: 'backtest', trade_date: '2024-01-02' }, { id: 'l1', platform_source: null, trade_date: '2024-01-01' }];
  const live = [{ id: 'l1', platform_source: null, trade_date: '2024-01-01' }];

  it('YENİ: trades@all / trades@backtest çapraz beslenmez', () => {
    const { C } = loadCache(cacheCode);
    C.set('trades@all', 'u', 'j', mixed);
    C.set('trades@backtest', 'u', 'j', [mixed[0]]);
    assert.equal(C.get('trades_dashboard', 'u', 'j'), null);
    assert.equal(C.get('trades', 'u', 'j'), null);
    assert.equal(C.get('trades_calendar', 'u', 'j'), null);
    assert.equal(plainJson(C.get('trades@all', 'u', 'j')).length, 2);
  });

  it('YENİ: canlı anahtarlar eskisi gibi paylaşılır (trades -> trades_dashboard ters sırayla)', () => {
    const { C } = loadCache(cacheCode);
    C.set('trades', 'u', 'j', live);
    assert.deepEqual(plainJson(C.get('trades_dashboard', 'u', 'j')), live.slice().reverse());
    C.set('trades_calendar', 'u', 'j2', live);
    assert.deepEqual(plainJson(C.get('trades', 'u', 'j2')), live);
  });

  it('YENİ: invalidate(\'trades\') kapsamlı anahtarları da siler (bellek + sessionStorage)', () => {
    const { C, store } = loadCache(cacheCode);
    C.set('trades@all', 'u', 'j', mixed);
    C.set('trades', 'u', 'j', live);
    assert.ok(Object.keys(store).some((k) => k.startsWith('ww_cache_trades@all')));
    C.invalidate('trades');
    assert.equal(Object.keys(store).filter((k) => k.startsWith('ww_cache_trades')).length, 0);
    assert.equal(C.get('trades@all', 'u', 'j'), null);
  });
});

describe('cache.js sekmeler arası geçersiz kılma', () => {
  // İki sekme: ayrı RAM + sessionStorage, ortak localStorage ve saat.
  function tabs() {
    const clock = { t: 1000000 };
    const FakeDate = { now: () => clock.t };
    const ls = {};
    const localStorage = {
      getItem: (k) => (k in ls ? ls[k] : null),
      setItem: (k, v) => { ls[k] = String(v); },
      removeItem: (k) => { delete ls[k]; }
    };
    function tab() {
      const store = {};
      const sessionStorage = {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        key: (i) => Object.keys(store)[i],
        get length() { return Object.keys(store).length; }
      };
      const win = { sessionStorage, localStorage, addEventListener: () => {}, Map, Date: FakeDate, JSON };
      win.window = win;
      vm.runInNewContext(cacheCode, win);
      return win.wwCache;
    }
    return { clock, A: tab(), B: tab() };
  }
  const live = [{ id: 'l1', platform_source: null }];
  const mixed = [{ id: 'b1', platform_source: 'backtest' }, { id: 'l1', platform_source: null }];

  it('başka sekmede invalidate: bu sekmenin (RAM ve sessionStorage) kaydı bayat sayılır', () => {
    const { clock, A, B } = tabs();
    A.set('trades@all', 'u', 'j', live);
    A.set('trades', 'u', 'j', live);
    assert.equal(plainJson(A.get('trades@all', 'u', 'j')).length, 1);
    clock.t += 5000;
    B.invalidate('trades');                       // başka sekmede senkron yazdı
    assert.equal(A.get('trades@all', 'u', 'j'), null);
    assert.equal(A.get('trades', 'u', 'j'), null);
    assert.equal(A.get('trades_dashboard', 'u', 'j'), null);
  });

  it('geçersiz kılmadan SONRA yazılan kayıt taze kalır; strategies damgası trades\'i etkilemez', () => {
    const { clock, A, B } = tabs();
    clock.t += 1000;
    B.invalidate('trades');
    clock.t += 1000;
    A.set('trades@all', 'u', 'j', mixed);
    assert.equal(plainJson(A.get('trades@all', 'u', 'j')).length, 2);
    clock.t += 1000;
    B.invalidate('strategies');
    assert.equal(plainJson(A.get('trades@all', 'u', 'j')).length, 2);
    A.set('strategies', 'u', 'j', [{ id: 's1' }]);
    clock.t += 1000;
    B.invalidate('strategies');
    assert.equal(A.get('strategies', 'u', 'j'), null);
  });

  it('localStorage yoksa (özel pencere) eski davranış: yerel invalidate çalışır, hata atmaz', () => {
    const win = { sessionStorage: { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 }, addEventListener: () => {}, Map, Date, JSON };
    win.window = win;
    Object.defineProperty(win, 'localStorage', { get() { throw new Error('blocked'); } });
    vm.runInNewContext(cacheCode, win);
    win.wwCache.set('trades', 'u', 'j', live);
    assert.equal(plainJson(win.wwCache.get('trades', 'u', 'j')).length, 1);
    win.wwCache.invalidate('trades');
    assert.equal(win.wwCache.get('trades', 'u', 'j'), null);
  });
});

describe('WwTrades defter bazlı kapsam (journals.trade_scope)', () => {
  function withStorage(extra = {}) {
    const ls = {};
    const localStorage = { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } };
    const r = load({ localStorage, ...extra });
    return { ...r, ls };
  }

  it('bilinmeyen / eksik defter = live (mevcut davranış)', () => {
    const { T } = withStorage();
    assert.equal(T.journalScope('j1'), 'live');
    assert.equal(T.journalScope(null), 'live');
    assert.equal(T.journalScope(undefined), 'live');
  });

  it('rememberJournalScopes: list_journals sonucundan okunur, geçersiz değer live olur, silinen defter düşer', () => {
    const { T } = withStorage();
    T.rememberJournalScopes([{ id: 'a', trade_scope: 'all' }, { id: 'b', trade_scope: 'backtest' }, { id: 'c', trade_scope: 'bogus' }, { id: 'd' }]);
    assert.equal(T.journalScope('a'), 'all');
    assert.equal(T.journalScope('b'), 'backtest');
    assert.equal(T.journalScope('c'), 'live');
    assert.equal(T.journalScope('d'), 'live');
    T.rememberJournalScopes([{ id: 'a', trade_scope: 'live' }]);
    assert.equal(T.journalScope('a'), 'live');
    assert.equal(T.journalScope('b'), 'live');   // artık listede yok
    T.rememberJournalScopes('not an array');     // yok sayılır
    assert.equal(T.journalScope('a'), 'live');
  });

  it('setJournalScope tek defteri günceller, diğerlerine dokunmaz', () => {
    const { T } = withStorage();
    T.rememberJournalScopes([{ id: 'a', trade_scope: 'live' }, { id: 'b', trade_scope: 'all' }]);
    T.setJournalScope('a', 'backtest');
    assert.equal(T.journalScope('a'), 'backtest');
    assert.equal(T.journalScope('b'), 'all');
    T.setJournalScope('a', 'nonsense');
    assert.equal(T.journalScope('a'), 'live');
  });

  it('localStorage yoksa / bozuksa live, istisna yok', () => {
    const { T } = load({});
    assert.equal(T.journalScope('a'), 'live');
    assert.doesNotThrow(() => T.rememberJournalScopes([{ id: 'a', trade_scope: 'all' }]));
    const bad = withStorage();
    bad.ls['ww_journal_scopes'] = '{not json';
    assert.equal(bad.T.journalScope('a'), 'live');
    bad.ls['ww_journal_scopes'] = '[1,2]';
    assert.equal(bad.T.journalScope('a'), 'live');
  });

  it('resolveJournalScope: haritada varsa ağa gitmez; yoksa listJournals çağırır ve harita dolar; hata = live', async () => {
    let calls = 0;
    const win = withStorage();
    win.win.journal = { listJournals: async () => { calls++; win.T.rememberJournalScopes([{ id: 'x', trade_scope: 'all' }]); return []; } };
    assert.equal(await win.T.resolveJournalScope('x'), 'all');       // haritada yoktu -> listelendi
    assert.equal(calls, 1);
    assert.equal(await win.T.resolveJournalScope('x'), 'all');       // artık haritada
    assert.equal(calls, 1);
    assert.equal(await win.T.resolveJournalScope(null), 'live');
    const failing = withStorage();
    failing.win.journal = { listJournals: async () => { throw new Error('down'); } };
    assert.equal(await failing.T.resolveJournalScope('y'), 'live');
    const none = withStorage();
    assert.equal(await none.T.resolveJournalScope('z'), 'live');     // journal köprüsü yok
  });

  it('kapsamlı önbellek anahtarı: live = eski anahtar, diğerleri @kapsam', () => {
    const { T } = withStorage();
    for (const base of ['trades_dashboard', 'trades_pro', 'trades_calendar', 'trades_strategies']) {
      assert.equal(T.cacheKey(base, T.journalScope('x')), base);
    }
    T.setJournalScope('x', 'all');
    assert.equal(T.cacheKey('trades_dashboard', T.journalScope('x')), 'trades_dashboard@all');
    T.setJournalScope('x', 'backtest');
    assert.equal(T.cacheKey('trades_calendar', T.journalScope('x')), 'trades_calendar@backtest');
  });

  it('applyScopeBadge: live gizli, all "Backtest dahil", backtest "Sadece backtest"; i18n varsa onu kullanır', () => {
    const el = { hidden: true, textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } };
    const { T } = withStorage();
    T.applyScopeBadge(el, 'live');
    assert.equal(el.hidden, true); assert.equal(el.textContent, ''); assert.equal(el.attrs['data-i18n'], undefined);
    T.applyScopeBadge(el, 'all');
    assert.equal(el.hidden, false); assert.equal(el.textContent, 'Backtest dahil'); assert.equal(el.attrs['data-i18n'], 'scope.badge_all');
    T.applyScopeBadge(el, 'backtest');
    assert.equal(el.textContent, 'Sadece backtest'); assert.equal(el.attrs['data-i18n'], 'scope.badge_backtest');
    const i18n = { t: (k) => ({ 'scope.badge_all': 'Backtest included' }[k] || k) };
    const w = withStorage({ i18n });
    w.T.applyScopeBadge(el, 'all');
    assert.equal(el.textContent, 'Backtest included');
    w.T.applyScopeBadge(el, 'backtest');   // anahtar yoksa yedek metin
    assert.equal(el.textContent, 'Sadece backtest');
    assert.doesNotThrow(() => w.T.applyScopeBadge(null, 'all'));
    w.T.applyScopeBadge(el, 'live');
    assert.equal(el.hidden, true);
  });

  it('fetchAll scope=all: sorguya kapsam süzgeci eklenmez; scope=backtest: eq platform_source', async () => {
    const { T } = withStorage();
    const all = recordingClient(() => ({ data: [{ id: 1 }], error: null }));
    await T.fetchAll({ client: all, userId: 'u', journalId: 'j', columns: 'id', scope: 'all' });
    assert.deepEqual(all.calls[0].filters, [['eq', 'user_id', 'u'], ['eq', 'journal_id', 'j']]);
    const bt = recordingClient(() => ({ data: [{ id: 1 }], error: null }));
    await T.fetchAll({ client: bt, userId: 'u', journalId: 'j', columns: 'id', scope: 'backtest' });
    assert.deepEqual(bt.calls[0].filters, [['eq', 'user_id', 'u'], ['eq', 'journal_id', 'j'], ['eq', 'platform_source', 'backtest']]);
    const live = recordingClient(() => ({ data: [{ id: 1 }], error: null }));
    await T.fetchAll({ client: live, userId: 'u', journalId: 'j', columns: 'id', scope: T.journalScope('unknown') });
    assert.deepEqual(live.calls[0].filters, [['eq', 'user_id', 'u'], ['eq', 'journal_id', 'j'], ['or', T.LIVE_OR]]);
  });
});
