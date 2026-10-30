// ============================================================
// WAWE JOURNAL - TARİH ARALIĞI SEÇİCİ TEST SUITE
// File: tests/ww-range-picker.test.js
// Runner: node --test tests/*.test.js
// Kapsam: public/interface/shared/ww-range-picker.js — hazır aralıklar, gün seçimi akışı, ay ızgarası, gün sayısı.
// Açma/kapama, konumlama ve klavye tarayıcıda denendi (DOM gerektirir).
// ============================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const code = fs.readFileSync(path.resolve('public/interface/shared/ww-range-picker.js'), 'utf8');

function load() {
  const window = {};
  vm.runInNewContext(code, { window, Object, Date, Math, Number, Intl, String, RegExp, Array });
  return window.WwRangePicker;
}
const P = load();

describe('presetRange', () => {
  const today = '2026-10-30'; // perşembe

  it('son N gün bugünü içerir', () => {
    assert.deepEqual({ ...P.presetRange('last7', today) }, { start: '2026-10-24', end: today });
    assert.deepEqual({ ...P.presetRange('last30', today) }, { start: '2026-10-01', end: today });
    assert.deepEqual({ ...P.presetRange('last90', today) }, { start: '2026-08-02', end: today });
  });

  it('geçen hafta pazartesi–pazar', () => {
    assert.deepEqual({ ...P.presetRange('last_week', today) }, { start: '2026-10-19', end: '2026-10-25' });
    assert.deepEqual({ ...P.presetRange('last_week', '2026-10-26') }, { start: '2026-10-19', end: '2026-10-25' }); // pazartesi
    assert.deepEqual({ ...P.presetRange('last_week', '2026-11-01') }, { start: '2026-10-19', end: '2026-10-25' }); // pazar
  });

  it('geçen ay ve geçen yıl takvim sınırlarında', () => {
    assert.deepEqual({ ...P.presetRange('last_month', today) }, { start: '2026-09-01', end: '2026-09-30' });
    assert.deepEqual({ ...P.presetRange('last_month', '2026-01-15') }, { start: '2025-12-01', end: '2025-12-31' });
    assert.deepEqual({ ...P.presetRange('last_month', '2024-03-31') }, { start: '2024-02-01', end: '2024-02-29' });
    assert.deepEqual({ ...P.presetRange('last_year', today) }, { start: '2025-01-01', end: '2025-12-31' });
  });

  it('bilinmeyen kimlik null', () => {
    assert.equal(P.presetRange('nope', today), null);
  });
});

describe('pickDay', () => {
  const empty = { start: null, end: null, next: 'start', edit: false };

  it('iki tıklama aralığı tamamlar', () => {
    const a = P.pickDay(empty, '2026-10-05');
    assert.equal(a.start, '2026-10-05'); assert.equal(a.end, null); assert.equal(a.next, 'end');
    const b = P.pickDay(a, '2026-10-12');
    assert.equal(b.start, '2026-10-05'); assert.equal(b.end, '2026-10-12'); assert.equal(b.next, 'start');
  });

  it('bitiş beklenirken önceki gün yeni başlangıç olur', () => {
    const a = P.pickDay(P.pickDay(empty, '2026-10-12'), '2026-10-05');
    assert.equal(a.start, '2026-10-05'); assert.equal(a.end, null); assert.equal(a.next, 'end');
  });

  it('aynı gün tek günlük aralık', () => {
    const a = P.pickDay(P.pickDay(empty, '2026-10-05'), '2026-10-05');
    assert.equal(a.start, '2026-10-05'); assert.equal(a.end, '2026-10-05');
  });

  it('tamamlanmış aralıktan sonra tıklama yeni aralık başlatır', () => {
    const done = { start: '2026-10-05', end: '2026-10-12', next: 'start', edit: false };
    const a = P.pickDay(done, '2026-10-08');
    assert.equal(a.start, '2026-10-08'); assert.equal(a.end, null);
  });

  it('Başlangıç kutusundan düzenleme bitişi korur', () => {
    const edit = { start: '2026-10-05', end: '2026-10-12', next: 'start', edit: true };
    const a = P.pickDay(edit, '2026-10-01');
    assert.equal(a.start, '2026-10-01'); assert.equal(a.end, '2026-10-12');
    const b = P.pickDay(edit, '2026-10-20'); // bitişten sonra: yeni aralık
    assert.equal(b.start, '2026-10-20'); assert.equal(b.end, null);
  });
});

describe('monthCells / dayCount', () => {
  it('pazartesiden başlayan 42 gün, bugünden sonrası kapalı', () => {
    const cells = P.monthCells(2026, 9, '2026-10-30');
    assert.equal(cells.length, 42);
    assert.equal(cells[0].iso, '2026-09-28');
    assert.equal(cells.filter((c) => !c.out).length, 31);
    assert.equal(cells.find((c) => c.iso === '2026-10-30').disabled, false);
    assert.equal(cells.find((c) => c.iso === '2026-10-31').disabled, true);
  });

  it('gün sayısı uçları dahil', () => {
    assert.equal(P.dayCount('2026-10-05', '2026-10-05'), 1);
    assert.equal(P.dayCount('2026-10-01', '2026-10-31'), 31);
    assert.equal(P.dayCount('2026-03-28', '2026-03-30'), 3); // yaz saati geçişi
    assert.equal(P.dayCount('2025-12-31', '2026-01-01'), 2);
  });
});
