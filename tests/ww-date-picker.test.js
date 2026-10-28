// ============================================================
// WAWE JOURNAL - TARİH SEÇİCİ TEST SUITE
// File: tests/ww-date-picker.test.js
// Runner: node --test tests/*.test.js
// Kapsam: public/interface/shared/ww-date-picker.js — ay ızgarası (monthCells). Açma/kapama, klavye ve
// değer eşitleme tarayıcıda denendi (DOM gerektirir).
// ============================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const code = fs.readFileSync(path.resolve('public/interface/shared/ww-date-picker.js'), 'utf8');

function load() {
  const window = {};
  class HTMLInputElement {}
  Object.defineProperty(HTMLInputElement.prototype, 'value', { get() { return ''; }, set() {}, configurable: true });
  vm.runInNewContext(code, { window, HTMLInputElement, Object, Date, Math, Number, Intl });
  return window.WwDatePicker;
}

describe('monthCells', () => {
  it('pazartesiden başlayan 42 gün verir', () => {
    const cells = load().monthCells(2026, 9); // Ekim 2026, 1 Ekim perşembe
    assert.equal(cells.length, 42);
    assert.equal(cells[0].iso, '2026-09-28');
    assert.equal(cells[3].iso, '2026-10-01');
    assert.equal(cells[41].iso, '2026-11-08');
  });

  it('ay dışı günleri işaretler', () => {
    const cells = load().monthCells(2026, 9);
    assert.equal(cells[0].out, true);
    assert.equal(cells[3].out, false);
    assert.equal(cells.filter((c) => !c.out).length, 31);
  });

  it('ay 1 ile başlıyorsa önceki aydan gün koymaz', () => {
    assert.equal(load().monthCells(2026, 5)[0].iso, '2026-06-01'); // 1 Haziran 2026 pazartesi
  });

  it('min / max dışındaki günleri kapatır', () => {
    const cells = load().monthCells(2026, 9, { min: '2026-10-05', max: '2026-10-28' });
    const byIso = Object.fromEntries(cells.map((c) => [c.iso, c.disabled]));
    assert.equal(byIso['2026-10-04'], true);
    assert.equal(byIso['2026-10-05'], false);
    assert.equal(byIso['2026-10-28'], false);
    assert.equal(byIso['2026-10-29'], true);
  });

  it('yıl geçişinde doğru tarihleri verir', () => {
    const cells = load().monthCells(2026, 11); // Aralık 2026
    assert.equal(cells.find((c) => c.iso === '2027-01-01').out, true);
    assert.equal(cells.find((c) => c.iso === '2026-12-31').out, false);
  });
});
