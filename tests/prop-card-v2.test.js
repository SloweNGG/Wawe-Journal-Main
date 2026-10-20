// ============================================================
// WAWE JOURNAL - PERFORMANS KARTI (STANDART HESAP) TEST SUITE
// File: tests/prop-card-v2.test.js
// Runner: node --test tests/*.test.js
// Kapsam: public/interface/dashboard/js/prop-card-v2.js — renderStandard kutu grafikleri
// (en iyi/en kötü işlem çubukları, beklenti ve payoff çizgileri).
// ============================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const code = fs.readFileSync(path.resolve('public/interface/dashboard/js/prop-card-v2.js'), 'utf8');

function load() {
  const window = {};
  vm.runInNewContext(code, { window, Object, Math });
  return window.WWPropCardV2;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const box = (label) => ({ label, text: '0', cls: 'up', sub: '' });

function ctx(pnls) {
  return {
    esc,
    title: 'Performans & Edge', goalBtnLabel: 'Hedef', goalBtnTitle: 'Hedef', goalLabel: 'Aylık Hedef',
    pnlText: '+$0', targetText: '$5.000', goalPct: 0, goalPctText: '0%',
    best: box('En İyi İşlem'), worst: { ...box('En Kötü İşlem'), cls: 'down' },
    exp: box('Beklenti'), payoff: { ...box('Payoff Ratio'), cls: 'info' },
    spark: pnls && { pnls, fmtMoney: (v) => '$' + v.toFixed(2), fmtRatio: (v) => v.toFixed(2) + 'x', tradeLabel: 'İşlem' }
  };
}

const sparks = (html) => html.match(/<svg class="pc2-spark[^"]*"/g) || [];

describe('runningEdge', () => {
  it('her işlemden sonraki beklentiyi verir', () => {
    const { exp } = load().runningEdge([100, -50, 30]);
    assert.deepEqual([...exp], [100, 25, 80 / 3]);
  });

  it('payoff hem kazanç hem kayıp olana kadar null kalır', () => {
    const { payoff } = load().runningEdge([100, 50, -25, -75]);
    assert.deepEqual([...payoff.slice(0, 2)], [null, null]);
    assert.equal(payoff[2], 75 / 25);
    assert.equal(payoff[3], 75 / 50);
  });

  it('sıfır K/Z işlemi ne kazanç ne kayıp sayılır', () => {
    const { payoff } = load().runningEdge([0, 10, -10]);
    assert.deepEqual([...payoff], [null, null, 1]);
  });
});

describe('renderStandard grafikleri', () => {
  it('5 işlemden azsa grafik çizmez', () => {
    assert.equal(sparks(load().renderStandard(ctx([10, -5, 20, -1]))).length, 0);
  });

  it('spark verisi yoksa eski kartı aynen çizer', () => {
    assert.equal(sparks(load().renderStandard(ctx(null))).length, 0);
  });

  it('dört kutuya da grafik ekler', () => {
    const html = load().renderStandard(ctx([10, -5, 20, -1, 7]));
    assert.deepEqual(sparks(html), [
      '<svg class="pc2-spark bars"', '<svg class="pc2-spark bars"',
      '<svg class="pc2-spark up"', '<svg class="pc2-spark info"'
    ]);
  });

  it('en iyi ve en kötü işlemi kendi kutusunda vurgular', () => {
    const html = load().renderStandard(ctx([10, -5, 20, -40, 7]));
    const svgs = html.split('<svg class="pc2-spark').slice(1);
    assert.match(svgs[0], /<title>İşlem 3: \$20\.00<\/title>.*class="bar up hi"/);
    assert.doesNotMatch(svgs[0], /bar down hi/);
    assert.match(svgs[1], /<title>İşlem 4: \$-40\.00<\/title>.*class="bar down hi"/);
    assert.doesNotMatch(svgs[1], /bar up hi/);
  });

  it('en iyi kutusu yalnız kazançları, en kötü kutusu yalnız kayıpları çizer', () => {
    const [best, worst] = load().renderStandard(ctx([10, -5, 20, -40, 7])).split('<svg class="pc2-spark').slice(1);
    assert.equal((best.match(/class="bar up/g) || []).length, 3);
    assert.doesNotMatch(best, /class="bar down/);
    assert.equal((worst.match(/class="bar down/g) || []).length, 2);
    assert.doesNotMatch(worst, /class="bar up/);
  });

  it('hiç kazanç yoksa en iyi kutusunda grafik olmaz', () => {
    assert.deepEqual(sparks(load().renderStandard(ctx([-10, -5, -20, -40, -7]))), [
      '<svg class="pc2-spark bars"', '<svg class="pc2-spark up"'
    ]);
  });

  it('uzun geçmişi en fazla 60 çubuğa toplar, uç değeri kaybetmez', () => {
    const pnls = Array.from({ length: 250 }, (_, i) => (i % 2 ? -1 : 1) * (i % 17));
    pnls[173] = 999;
    const best = load().renderStandard(ctx(pnls)).split('<svg class="pc2-spark')[1];
    assert.ok((best.match(/class="hit"/g) || []).length <= 60);
    assert.equal((best.match(/bar up hi/g) || []).length, 1);
    assert.match(best, /\$999\.00<\/title>/);
  });

  it('payoff çizgisi tanımlı olduğu ilk işlemden başlar', () => {
    const html = load().renderStandard(ctx([10, 20, 30, -10, 5, -5]));
    const payoff = html.split('<svg class="pc2-spark').slice(1)[3];
    assert.doesNotMatch(payoff, /İşlem [123]:/);
    assert.match(payoff, /İşlem 4: 2\.00x/);
  });

  it('beklenti sıfırı geçiyorsa sıfır çizgisini gösterir', () => {
    const cross = load().renderStandard(ctx([-10, -10, 50, 5, 5])).split('<svg class="pc2-spark up"')[1];
    const positive = load().renderStandard(ctx([10, 10, 50, 5, 5])).split('<svg class="pc2-spark up"')[1];
    assert.match(cross, /class="zero"/);
    assert.doesNotMatch(positive, /class="zero"/);
  });
});
