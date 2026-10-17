// ============================================================
// WAWE JOURNAL - İÇGÖRÜ MOTORU TEST SUITE
// File: tests/insights-engine.test.js
// Runner: node --test tests/*.test.js
// Kapsam: public/interface/premium-dashboard/js/insights-engine.js
// ============================================================

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Tarayıcı globalleri: WwTime (UTC sabit) + WwMetrics
function makeWindow() {
  const store = { ww_time_settings: JSON.stringify({ tz: 'UTC', dayStart: 0 }) };
  const win = {
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    dispatchEvent: () => true,
    CustomEvent: class { constructor(n, o) { this.type = n; this.detail = o && o.detail; } },
    Intl, Date, Math, Number, String, Array, Object, RegExp, JSON, isNaN, isFinite, parseInt, parseFloat
  };
  win.window = win;
  vm.runInNewContext(fs.readFileSync(path.resolve('public/interface/shared/time-settings.js'), 'utf8'), win);
  vm.runInNewContext(fs.readFileSync(path.resolve('public/interface/shared/trade-metrics.js'), 'utf8'), win);
  return win;
}

let E;
before(async () => {
  globalThis.window = makeWindow();
  E = await import(pathToFileURL(path.resolve('public/interface/premium-dashboard/js/insights-engine.js')).href);
});

// İşlem üretici: gün (Ocak 2026), saat, pnl ve ek alanlar
let seq = 0;
function tr(day, hour, pnl, extra) {
  const d = String(day).padStart(2, '0'), h = String(hour).padStart(2, '0');
  return Object.assign({ id: ++seq, exit_price: 1, pnl, symbol: 'EURUSD', direction: 'LONG', lot: 1, stop_loss: 1.1,
    trade_date: `2026-01-${d}T${h}:00:00Z` }, extra || {});
}
const find = (list, id) => list.find((x) => x.id === id);
const ids = (list) => list.map((x) => x.id);

describe('İçgörü motoru: genel', () => {
  it('8 kapanmış işlemden az: işlem içgörüsü yok (açık işlemler sayılmaz)', () => {
    const list = [1, 2, 3, 4, 5, 6, 7].map((d) => tr(d, 10, 10));
    list.push({ pnl: 5, trade_date: '2026-01-09T10:00:00Z' }); // açık
    assert.deepEqual(E.analyzeTrades(list), []);
  });

  it('her içgörüde örneklem var; etki ve değer negatif değil, sonlu', () => {
    const list = [];
    for (let d = 1; d <= 12; d++) list.push(tr(d, 9, d % 3 === 0 ? -40 : 60), tr(d, 15, d % 2 ? -30 : 20, { symbol: 'XAUUSD' }));
    const out = E.analyzeTrades(list);
    assert.ok(out.length > 0);
    out.forEach((x) => {
      assert.ok(Number.isInteger(x.n) && x.n > 0, `${x.id} n`);
      if (x.impact !== undefined) assert.ok(Number.isFinite(x.impact) && x.impact >= 0, `${x.id} impact ${x.impact}`);
      if (x.value !== undefined) assert.ok(Number.isFinite(x.value) && x.value > 0, `${x.id} value`);
    });
    assert.equal(out[out.length - 1].id, 'expectancy');
  });
});

describe('İçgörü motoru: parasal etki', () => {
  it('zarar ettiren saat dilimi: etki = o dilimin kaybı', () => {
    const list = [];
    for (let d = 1; d <= 6; d++) list.push(tr(d, 9, 50));          // 08–10 kârlı
    for (let d = 1; d <= 4; d++) list.push(tr(d, 16, -30));        // 16–18 zararlı: -120
    const w = find(E.analyzeTrades(list), 'weak_hour');
    assert.ok(w);
    assert.equal(w.impact, 120);
    assert.equal(w.n, 4);
    assert.deepEqual([w.data.from, w.data.to], [16, 18]);
    const b = find(E.analyzeTrades(list), 'best_hour');
    assert.equal(b.value, 300);
  });

  it('düşük win rate ama kârlı gün uyarı üretmez (yalnızca para kaybettiren dilim)', () => {
    const list = [];
    // Cuma (2, 9, 16, 23 Ocak 2026): 1 büyük kazanç + 3 küçük kayıp → win rate %25 ama toplam kâr
    [2, 9, 16, 23].forEach((d, i) => list.push(tr(d, 10, i === 0 ? 500 : -20)));
    for (let d = 5; d <= 8; d++) list.push(tr(d, 10, 30));
    assert.equal(find(E.analyzeTrades(list), 'weak_dow'), undefined);
  });

  it('zarar ettiren gün: Cuma işlemleri atlanırsa kazanılacak tutar', () => {
    const list = [];
    [2, 9, 16, 23].forEach((d) => list.push(tr(d, 10, -50)));     // Cuma: -200
    for (let d = 5; d <= 8; d++) list.push(tr(d, 10, 40));
    const w = find(E.analyzeTrades(list), 'weak_dow');
    assert.equal(w.impact, 200);
    assert.equal(w.data.dow, 5);
  });

  it('büyük kayıplar ortalama kazanç seviyesinde kesilseydi', () => {
    // kazançlar 100,100,100 (ort 100); kayıplar -50, -250, -300 (ort 200 > 100)
    const list = [tr(1, 10, 100), tr(2, 10, 100), tr(3, 10, 100), tr(4, 10, -50), tr(5, 10, -250), tr(6, 10, -300), tr(7, 10, 0), tr(8, 10, 0)];
    const w = find(E.analyzeTrades(list), 'payoff_low');
    assert.equal(w.impact, 150 + 200);   // (250-100) + (300-100); -50 zaten küçük
    assert.equal(w.n, 2);
  });

  it('zarar ettiren yön, diğer yön kârlıyken', () => {
    const list = [];
    for (let d = 1; d <= 5; d++) list.push(tr(d, 10, -20, { direction: 'SHORT' }));
    for (let d = 1; d <= 5; d++) list.push(tr(d, 12, 30, { direction: 'BUY' }));
    const w = find(E.analyzeTrades(list), 'weak_direction');
    assert.equal(w.data.side, 'short');
    assert.equal(w.impact, 100);
  });
});

describe('İçgörü motoru: davranış', () => {
  it('kayıptan hemen sonra aynı gün açılan işlemler (intikam)', () => {
    const list = [];
    for (let d = 1; d <= 5; d++) list.push(tr(d, 9, -20), tr(d, 10, -40), tr(d, 14, 80));
    // her gün: 10:00 işlemi kayıptan sonra (-40), 14:00 işlemi de kayıptan sonra (+80)
    const w = find(E.analyzeTrades(list), 'after_loss');
    // afterLoss = 5×(-40) + 5×(+80) = +200 → zarar değil, uyarı yok
    assert.equal(w, undefined);

    const list2 = [];
    for (let d = 1; d <= 5; d++) list2.push(tr(d, 9, -20), tr(d, 10, -40), tr(d, 14, 60), tr(d + 10, 9, 70));
    const w2 = find(E.analyzeTrades(list2), 'after_loss');
    // afterLoss: her gün 10:00 (-40) ve 14:00 (+60, önceki -40) → 5×20 = +100 → yine yok
    assert.equal(w2, undefined);

    const list3 = [];
    for (let d = 1; d <= 5; d++) list3.push(tr(d, 9, -20), tr(d, 10, -40), tr(d + 10, 9, 90));
    const w3 = find(E.analyzeTrades(list3), 'after_loss');
    assert.ok(w3);
    assert.equal(w3.impact, 200);
    assert.equal(w3.n, 5);
  });

  it('saati olmayan işlemler gün içi sıraya dayalı analizlere girmez', () => {
    const list = [];
    for (let d = 1; d <= 5; d++) {
      list.push({ id: ++seq, exit_price: 1, pnl: -20, trade_date: `2026-01-0${d}` }, { id: ++seq, exit_price: 1, pnl: -40, trade_date: `2026-01-0${d}` });
      list.push(tr(d + 10, 9, 90));
    }
    assert.equal(find(E.analyzeTrades(list), 'after_loss'), undefined);
    assert.equal(find(E.analyzeTrades(list), 'overtrading'), undefined);
  });

  it('günde 3 işlemden sonrası zarar ettiriyorsa (aşırı işlem)', () => {
    const list = [];
    for (let d = 1; d <= 4; d++) list.push(tr(d, 9, 30), tr(d, 10, 30), tr(d, 11, 30), tr(d, 12, -25), tr(d, 13, -25));
    const w = find(E.analyzeTrades(list), 'overtrading');
    assert.equal(w.impact, 200);
    assert.equal(w.n, 8);
    assert.equal(w.data.days, 4);
    // Aynı kayıpları "12:00–14:00 arası zarar" uyarısı da kapsıyor (eşit etki): sıralamada
    // bu işlemleri anlatan tek uyarı kalır
    const warns = E.rankInsights(E.analyzeTrades(list)).filter((x) => x.impact > 0);
    assert.equal(warns.length, 1, 'aynı kayıplar için tek uyarı: ' + warns.map((x) => x.id));
    assert.equal(warns[0].impact, 200);
  });

  it('kayıptan sonra lotu büyütmek', () => {
    const list = [];
    for (let d = 1; d <= 3; d++) list.push(tr(d, 9, -30, { lot: 1 }), tr(d, 10, -60, { lot: 2 }));
    list.push(tr(5, 9, 50), tr(6, 9, 50));
    const w = find(E.analyzeTrades(list), 'size_up');
    // ardışık çiftler: (d,9)→(d,10) lot 1→2 kayıp sonrası; (d,10)→(d+1,9) lot 2→1 değil
    assert.equal(w.n, 3);
    assert.equal(w.impact, 180);
  });

  it('stop loss olmayan işlemler zarar ettiriyorsa', () => {
    const list = [];
    for (let d = 1; d <= 4; d++) list.push(tr(d, 9, 40), tr(d, 11, -30, { stop_loss: null }));
    const w = find(E.analyzeTrades(list), 'no_stop');
    assert.equal(w.impact, 120);
    assert.equal(w.data.withWr, 100);
  });

  it('hiç stop/R:R verisi yoksa bilgi notu', () => {
    const list = [1, 2, 3, 4, 5, 6, 7, 8].map((d) => tr(d, 10, 10, { stop_loss: null }));
    assert.ok(find(E.analyzeTrades(list), 'no_sl_data'));
  });
});

describe('İçgörü motoru: prop', () => {
  const base = {
    active: true, invalid: false,
    target: { amount: 10000, remaining: 6000, earned: 4000 },
    days: { count: 4, min: 4 },
    daily: { limit: 5000 },
    maxLoss: { distance: 9000 }
  };

  it('hedef temposu: gün başı 1000 → 6000 için 6 işlem günü', () => {
    const p = find(E.analyzeProp([], base), 'prop_pace');
    assert.equal(p.data.days, 6);
    assert.equal(p.data.perDay, 1000);
    assert.equal(p.pinned, true);
  });

  it('minimum işlem günü kuralı tempodan uzunsa o esas alınır', () => {
    const p = find(E.analyzeProp([], Object.assign({}, base, { days: { count: 1, min: 10 }, target: { amount: 1000, remaining: 100, earned: 900 } })), 'prop_pace');
    assert.equal(p.data.days, 9);
    assert.equal(p.data.byMinDays, true);
  });

  it('hedef tamamlandıysa veya prop yoksa tempo yok; ilerleme yoksa uyarı', () => {
    assert.equal(find(E.analyzeProp([], Object.assign({}, base, { target: { amount: 10000, remaining: 0, earned: 10000 } })), 'prop_pace'), undefined);
    assert.deepEqual(E.analyzeProp([], null), []);
    assert.deepEqual(E.analyzeProp([], { active: true, invalid: true }), []);
    assert.ok(find(E.analyzeProp([], Object.assign({}, base, { target: { amount: 10000, remaining: 10500, earned: -500 } })), 'prop_no_progress'));
  });

  it('en kötü gün tekrar etse zemine kalan; limit altında kalırsa uyarı', () => {
    const trades = [tr(1, 9, -2000), tr(1, 10, -1500), tr(2, 9, 800)];
    const w = find(E.analyzeProp(trades, base), 'prop_worst_day');
    assert.equal(w.data.worst, -3500);
    assert.equal(w.data.left, 5500);
    assert.equal(w.tone, 'info');
    const w2 = find(E.analyzeProp(trades, Object.assign({}, base, { maxLoss: { distance: 6000 } })), 'prop_worst_day');
    assert.equal(w2.data.left, 2500);
    assert.equal(w2.tone, 'warn');
  });

  it('en kötü gün günlük limiti aşıyorsa ayrı ve acil uyarı', () => {
    const w = find(E.analyzeProp([tr(1, 9, -6000)], base), 'prop_worst_over_daily');
    assert.equal(w.data.worst, -6000);
    assert.equal(w.pinned, true);
  });

  it('kayıplı günlerde günlük limitin yüzde kaçı harcanıyor', () => {
    const trades = [tr(1, 9, -3000), tr(2, 9, -2000), tr(3, 9, 4000)];
    const w = find(E.analyzeProp(trades, base), 'prop_daily_burn');
    assert.equal(w.data.pct, 50);
    assert.equal(w.tone, 'warn');
    assert.equal(w.n, 2);
  });
});

describe('İçgörü motoru: sıralama ve liste', () => {
  it('prop sabit üstte, sonra etkiye göre uyarılar, sonra kâra göre olumlular, beklenti en sonda', () => {
    const ranked = E.rankInsights([
      { id: 'expectancy', tone: 'good' },
      { id: 'best_symbol', tone: 'good', value: 50 },
      { id: 'weak_hour', tone: 'warn', impact: 100 },
      { id: 'no_sl_data', tone: 'info' },
      { id: 'prop_pace', tone: 'good', pinned: true },
      { id: 'weak_dow', tone: 'warn', impact: 300 },
      { id: 'best_hour', tone: 'good', value: 80 },
      { id: 'form_down', tone: 'warn' }
    ]);
    assert.deepEqual(ids(ranked), ['prop_pace', 'weak_dow', 'weak_hour', 'best_hour', 'best_symbol', 'form_down', 'no_sl_data', 'expectancy']);
  });

  it('az işlem + prop: prop içgörüleri ve "daha fazla işlem" notu', () => {
    const state = { active: true, target: { amount: 10000, remaining: 6000, earned: 4000 }, days: { count: 4, min: 4 }, daily: { limit: 5000 }, maxLoss: { distance: 9000 } };
    const list = E.buildInsightList([tr(1, 9, 100), tr(2, 9, 200)], null, state);
    assert.equal(list[0].id, 'prop_pace');
    const more = find(list, 'need_more');
    assert.equal(more.data.more, 6);
  });

  it('az işlem ve prop yok: boş liste (boş durum mesajı gösterilir)', () => {
    assert.deepEqual(E.buildInsightList([tr(1, 9, 100)], null, null), []);
  });
});

describe('İçgörü motoru: çakışma ayıklama', () => {
  it('aynı işlemleri kapsayan uyarılardan yalnızca en etkilisi kalır (para iki kez sayılmaz)', () => {
    const list = [];
    for (let k = 1; k <= 14; k++) {
      list.push(tr(k, 9, 180));
      if (k % 2 === 0) list.push(tr(k, 10, -90), tr(k, 11, -70, { lot: 2 }));
      if (k % 3 === 0) list.push(tr(k, 15, -60, { symbol: 'XAUUSD', stop_loss: null }));
    }
    const raw = E.analyzeTrades(list).filter((x) => x.impact > 0);
    assert.ok(raw.length >= 4, 'ham listede birden çok çakışan uyarı var: ' + raw.map((x) => x.id));
    const warns = E.rankInsights(E.analyzeTrades(list)).filter((x) => x.impact > 0);
    // kalan uyarıların işlemleri birbirinden büyük ölçüde ayrı olmalı
    for (let a = 0; a < warns.length; a++) for (let b = a + 1; b < warns.length; b++) {
      const A = new Set(warns[a].idx), B = warns[b].idx;
      const common = B.filter((i) => A.has(i)).length;
      assert.ok(common / Math.min(A.size, B.length) <= 0.5, `${warns[a].id} ↔ ${warns[b].id}`);
    }
    assert.equal(warns[0].id, 'stop_after_first');
  });

  it('ayrı işlemlere dayanan uyarılar korunur; işlem listesi olmayanlara dokunulmaz', () => {
    const out = E.dropOverlapping([
      { id: 'a', impact: 300, idx: [1, 2, 3] },
      { id: 'b', impact: 200, idx: [4, 5, 6] },
      { id: 'c', impact: 150, idx: [1, 2, 7] },      // a ile 2/3 ortak → düşer
      { id: 'd', impact: 100, idx: [3, 8, 9, 10] },  // a ile 1/3 ortak → kalır
      { id: 'prop_pace', pinned: true },
      { id: 'best_hour', value: 50, idx: [1, 2, 3] }  // olumlu içgörü: ayıklanmaz
    ]);
    assert.deepEqual(out.map((x) => x.id), ['a', 'b', 'd', 'prop_pace', 'best_hour']);
  });
});
