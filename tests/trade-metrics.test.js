// ============================================================
// WAWE JOURNAL - İŞLEM METRİKLERİ TEST SUITE
// File: tests/trade-metrics.test.js
// Runner: node --test tests/*.test.js
// Kapsam: public/interface/shared/trade-metrics.js (WwMetrics) — tüm sayfaların
// K/Z, win rate, profit factor, drawdown, seri, Sharpe ve R:R hesabı buradan gelir.
// ============================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const timeCode = fs.readFileSync(path.resolve('public/interface/shared/time-settings.js'), 'utf8');
const metricsCode = fs.readFileSync(path.resolve('public/interface/shared/trade-metrics.js'), 'utf8');

// Tarayıcı ortamı: önce WwTime (UTC sabit), sonra WwMetrics
function load({ withTime = true, calcPnL } = {}) {
  const store = { ww_time_settings: JSON.stringify({ tz: 'UTC', dayStart: 0 }) };
  const win = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    dispatchEvent: () => true,
    CustomEvent: class { constructor(n, o) { this.type = n; this.detail = o && o.detail; } },
    Intl, Date, Math, Number, String, Array, Object, RegExp, JSON, isNaN, isFinite, parseInt, parseFloat
  };
  win.window = win;
  if (calcPnL) win.calcPnL = calcPnL;
  if (withTime) vm.runInNewContext(timeCode, win);
  vm.runInNewContext(metricsCode, win);
  return win.WwMetrics;
}

const M = load();

// Kapanmış işlem kısayolu: gün sırası ile tarih üretir (gün 1 = 2026-01-01)
function tr(pnl, day, extra) {
  const d = String(day).padStart(2, '0');
  return Object.assign({ id: 'd' + day + '_' + pnl, pnl: pnl, exit_price: 1, trade_date: '2026-01-' + d + 'T12:00:00Z' }, extra || {});
}
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

describe('WwMetrics: kapanmış işlem ve K/Z', () => {
  it('kapanmış = geçerli çıkış fiyatı; 0 da geçerli fiyattır, boş/null değildir', () => {
    assert.equal(M.isClosed({ exit_price: 1.1 }), true);
    assert.equal(M.isClosed({ exit_price: 0 }), true);
    assert.equal(M.isClosed({ exit_price: '0' }), true);
    assert.equal(M.isClosed({ exit_price: null }), false);
    assert.equal(M.isClosed({ exit_price: '' }), false);
    assert.equal(M.isClosed({ exit_price: 'abc' }), false);
    assert.equal(M.isClosed(null), false);
  });

  it('kayıtlı (net) pnl önceliklidir; metin sayılar okunur', () => {
    assert.equal(M.tradePnL({ exit_price: 1.2, entry_price: 1.1, lot: 1, pnl: '-12.5' }), -12.5);
    assert.equal(M.tradePnL({ exit_price: 1.2, entry_price: 1.1, lot: 1, pnl: 0 }), 0);
  });

  it('pnl yoksa giriş/çıkıştan hesaplanır (LONG/BUY +, SHORT/SELL −, çarpan)', () => {
    close(M.tradePnL({ exit_price: 110, entry_price: 100, lot: 2, direction: 'LONG', multiplier: 10 }), 200);
    close(M.tradePnL({ exit_price: 110, entry_price: 100, lot: 2, direction: 'BUY' }), 20);
    close(M.tradePnL({ exit_price: 110, entry_price: 100, lot: 2, direction: 'SHORT', multiplier: 10 }), -200);
    close(M.tradePnL({ exit_price: 90, entry_price: 100, lot: 1, direction: 'SELL' }), 10);
  });

  it('sayfadaki calcPnL varsa (enstrüman çarpanları) o kullanılır', () => {
    const M2 = load({ calcPnL: (e, x, lot, dir) => (dir === 'LONG' ? 1 : -1) * (x - e) * lot * 100000 });
    close(M2.tradePnL({ exit_price: 1.1010, entry_price: 1.1000, lot: 1, direction: 'LONG' }), 100);
  });

  it('açık işlem ve eksik veri 0 döner (istatistiğe girmez, NaN üretmez)', () => {
    assert.equal(M.tradePnL({ entry_price: 100, lot: 1, pnl: 50 }), 0);
    assert.equal(M.tradePnL({ exit_price: 100, lot: 1 }), 0);
    assert.equal(M.tradePnL({ exit_price: 100, entry_price: 'x', lot: 1 }), 0);
    assert.equal(M.tradePnL(undefined), 0);
  });
});

describe('WwMetrics: kronolojik sıra', () => {
  it('yeniden eskiye gelen liste eskiden yeniye çevrilir, açık işlemler çıkarılır', () => {
    const list = [tr(3, 3), { pnl: 9, trade_date: '2026-01-02T00:00:00Z' }, tr(1, 1), tr(2, 2)];
    assert.deepEqual(M.chronological(list).map(t => t.pnl), [1, 2, 3]);
  });

  it('saat dilimi farklı yazılmış tarihler gerçek zamana göre sıralanır (metin sırasına göre değil)', () => {
    // 10:00+03:00 = 07:00Z → 08:00Z'den ÖNCE. Metin karşılaştırması tersini söylerdi.
    const a = { pnl: 1, exit_price: 1, trade_date: '2026-01-05T08:00:00Z' };
    const b = { pnl: 2, exit_price: 1, trade_date: '2026-01-05T10:00:00+03:00' };
    assert.deepEqual(M.chronological([a, b]).map(t => t.pnl), [2, 1]);
  });

  it('eşit zamanlarda gelen sıra korunur; tarihi okunamayan en başa alınır', () => {
    const x = tr(1, 4), y = tr(2, 4), z = { pnl: 3, exit_price: 1, trade_date: 'bozuk' };
    assert.deepEqual(M.chronological([x, y, z]).map(t => t.pnl), [3, 1, 2]);
  });

  it('girdi listesini değiştirmez', () => {
    const list = [tr(2, 2), tr(1, 1)];
    M.chronological(list);
    assert.deepEqual(list.map(t => t.pnl), [2, 1]);
  });
});

describe('WwMetrics: drawdown', () => {
  it('zirveden en büyük düşüş pozitif büyüklük olarak döner', () => {
    // eğri: 100, 50, 70, -30, 170 → zirve 100, dip -30 → 130
    const list = [tr(100, 1), tr(-50, 2), tr(20, 3), tr(-100, 4), tr(200, 5)];
    assert.equal(M.maxDrawdown(list), 130);
  });

  it('liste hangi sırada gelirse gelsin aynı sonuç (veritabanı yeniden eskiye döner)', () => {
    const list = [tr(100, 1), tr(-50, 2), tr(20, 3), tr(-100, 4), tr(200, 5)];
    assert.equal(M.maxDrawdown(list.slice().reverse()), 130);
    assert.equal(M.maxDrawdown([list[3], list[0], list[4], list[1], list[2]]), 130);
  });

  it('zirve 0\'dan başlar: ilk işlemler kayıpsa düşüş sayılır', () => {
    assert.equal(M.maxDrawdown([tr(-40, 1), tr(-60, 2), tr(30, 3)]), 100);
  });

  it('düşüş yoksa 0 (−0 değil), boş listede 0', () => {
    assert.ok(Object.is(M.maxDrawdown([tr(10, 1), tr(20, 2)]), 0));
    assert.ok(Object.is(M.maxDrawdown([]), 0));
  });

  it('eğri noktaları: equity birikir, drawdown ≤ 0 ve zirveye göre', () => {
    const c = M.equityCurve([tr(-50, 2), tr(100, 1)]);
    assert.deepEqual(c.map(p => [p.equity, p.peak, p.drawdown]), [[100, 100, 0], [50, 100, -50]]);
  });
});

describe('WwMetrics: seriler', () => {
  it('en uzun kazanç/kayıp serisi ve mevcut seri (eskiden yeniye)', () => {
    // + + + - - + - - - -   (son 4 kayıp)
    const p = [10, 20, 30, -5, -5, 40, -1, -2, -3, -4];
    const s = M.streaks(p.map((v, i) => tr(v, i + 1)).reverse());
    assert.equal(s.maxWin, 3);
    assert.equal(s.maxLoss, 4);
    assert.equal(s.current, 4);
    assert.equal(s.currentType, 'loss');
    assert.equal(s.worstLossRun, -10);
  });

  it('başabaş işlem iki seriyi de bitirir; en son başabaşsa mevcut seri yok', () => {
    const s = M.streaks([tr(5, 1), tr(5, 2), tr(0, 3), tr(5, 4), tr(0, 5)]);
    assert.equal(s.maxWin, 2);
    assert.equal(s.current, 0);
    assert.equal(s.currentType, null);
  });

  it('boş liste', () => {
    assert.deepEqual({ ...M.streaks([]) }, { maxWin: 0, maxLoss: 0, current: 0, currentType: null, worstLossRun: 0 });
  });
});

describe('WwMetrics: Sharpe ve R:R', () => {
  it('Sharpe = ortalama / standart sapma (popülasyon)', () => {
    // pnl: 10, -10, 30 → ort 10, sapma √(800/3)
    close(M.sharpe([tr(10, 1), tr(-10, 2), tr(30, 3)]), 10 / Math.sqrt(800 / 3));
  });

  it('tek işlemde veya sapma sıfırken hesaplanamaz → null (yanıltıcı 0.00 değil)', () => {
    assert.equal(M.sharpe([tr(5336.96, 1)]), null);
    assert.equal(M.sharpe([tr(50, 1), tr(50, 2)]), null);
    assert.equal(M.sharpe([]), null);
  });

  it('ortalama R:R yalnızca girilmiş pozitif değerlerden; hiç yoksa null', () => {
    const list = [tr(1, 1, { rr_ratio: 2 }), tr(1, 2, { rr_ratio: '3' }), tr(1, 3, { rr_ratio: null }), tr(1, 4, { rr_ratio: -1 })];
    assert.equal(M.avgRR(list), 2.5);
    assert.equal(M.avgRR([tr(1, 1)]), null);
    // açık işlemin R:R'ı sayılmaz
    assert.equal(M.avgRR([{ rr_ratio: 9, trade_date: '2026-01-01' }]), null);
  });
});

describe('WwMetrics: özet (summarize)', () => {
  it('karışık liste: tüm alanlar', () => {
    const list = [tr(100, 1), tr(-50, 2), tr(0, 3), tr(200, 4), tr(-50, 5), { pnl: 999, trade_date: '2026-01-06' }];
    const s = M.summarize(list);
    assert.equal(s.total, 5);               // açık işlem sayılmaz
    assert.equal(s.wins, 2);
    assert.equal(s.losses, 2);
    assert.equal(s.breakeven, 1);
    assert.equal(s.totalPnL, 200);
    assert.equal(s.winRate, 40);            // payda başabaş dahil tüm kapanmışlar
    assert.equal(s.grossWin, 300);
    assert.equal(s.grossLoss, 100);         // pozitif büyüklük
    assert.equal(s.avgWin, 150);
    assert.equal(s.avgLoss, 50);            // pozitif büyüklük
    assert.equal(s.profitFactor, 3);
    assert.equal(s.payoff, 3);
    assert.equal(s.expectancy, 40);
    assert.equal(s.maxDrawdown, 50);
    assert.equal(s.maxWinStreak, 1);
    assert.equal(s.maxLossStreak, 1);
    assert.equal(s.avgRR, null);
  });

  it('hiç kayıp yok: profit factor ve oran ∞ (null), drawdown 0', () => {
    const s = M.summarize([tr(5336.96, 1)]);
    assert.equal(s.profitFactor, null);
    assert.equal(s.payoff, null);
    assert.equal(s.avgLoss, 0);
    assert.equal(s.maxDrawdown, 0);
    assert.equal(s.sharpe, null);
    assert.equal(s.winRate, 100);
    assert.equal(M.formatProfitFactor(s.profitFactor), '∞');
  });

  it('hiç kazanç yok: profit factor 0, oran 0', () => {
    const s = M.summarize([tr(-10, 1), tr(-30, 2)]);
    assert.equal(s.profitFactor, 0);
    assert.equal(s.payoff, 0);
    assert.equal(s.maxDrawdown, 40);
    assert.equal(s.maxLossStreak, 2);
  });

  it('boş liste: sıfırlar, NaN yok', () => {
    const s = M.summarize([]);
    Object.keys(s).forEach(k => {
      if (s[k] !== null) assert.ok(Number.isFinite(s[k]), `${k} sonlu olmalı: ${s[k]}`);
    });
    assert.equal(s.profitFactor, 0);
    assert.equal(M.formatProfitFactor(s.profitFactor), '0.00');
  });

  it('kuruş hassasiyeti: 0.1 + 0.2 gibi toplamlar beklenen değere yakın', () => {
    const s = M.summarize([tr(0.1, 1), tr(0.2, 2), tr(-0.3, 3)]);
    close(s.totalPnL, 0, 1e-12);
    close(s.profitFactor, 1, 1e-12);
  });

  it('WwTime yüklenmese de çalışır (Date.parse yedeği)', () => {
    const M3 = load({ withTime: false });
    assert.equal(M3.maxDrawdown([tr(100, 2), tr(-30, 3), tr(-20, 1)]), 30); // eğri: -20, 80, 50
    assert.deepEqual(M3.chronological([tr(2, 2), tr(1, 1)]).map(t => t.pnl), [1, 2]);
  });
});

describe('WwMetrics: oran ve gösterim', () => {
  it('ratio: payda > 0 → bölüm; payda 0 ve pay > 0 → null (∞); ikisi de 0 → 0', () => {
    assert.equal(M.ratio(6, 2), 3);
    assert.equal(M.ratio(5, 0), null);
    assert.equal(M.ratio(0, 0), 0);
  });

  it('formatProfitFactor', () => {
    assert.equal(M.formatProfitFactor(null), '∞');
    assert.equal(M.formatProfitFactor(Infinity), '∞');
    assert.equal(M.formatProfitFactor(1.005), '1.00');
    assert.equal(M.formatProfitFactor(NaN), '0.00');
    assert.equal(M.formatProfitFactor(undefined), '0.00');
  });
});
