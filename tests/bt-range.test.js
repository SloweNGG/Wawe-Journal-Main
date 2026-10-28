// Backtest v2: date and range panel (public/interface/backtest/js/bt-range.js) — pure helpers. Opening, the calendar and applying
// need the DOM (browser).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

await import('../public/interface/backtest/js/bt-range.js');
const RG = globalThis.WwBtRange;

describe('bt-range', () => {
  it('adds days and months on local day keys', () => {
    assert.equal(RG.addDays('2023-09-19', 1), '2023-09-20');
    assert.equal(RG.addDays('2023-12-31', 1), '2024-01-01');
    assert.equal(RG.addMonths('2023-09-19', 3), '2023-12-19');
    assert.equal(RG.addMonths('2024-01-31', 1), '2024-02-29', 'a shorter month: its last day');
    assert.equal(RG.addMonths('2023-01-31', 1), '2023-02-28');
  });
  it('presets: the end from the start day', () => {
    assert.deepEqual(RG.PRESETS.map((p) => p.id), ['1d', '1w', '1m', '3m']);
    assert.equal(RG.presetEnd('2023-09-19', '1d'), '2023-09-20');
    assert.equal(RG.presetEnd('2023-09-19', '1w'), '2023-09-26');
    assert.equal(RG.presetEnd('2023-09-19', '1m'), '2023-10-19');
    assert.equal(RG.presetEnd('2023-09-19', '3m'), '2023-12-19');
    assert.equal(RG.presetEnd('2023-09-19', 'x'), null);
  });
  it('day clicks: start, then end; an earlier day becomes the start', () => {
    let s = { start: '2023-09-19', end: null, active: 'start' };
    s = RG.pickDay(s, '2023-09-10');
    assert.deepEqual(s, { start: '2023-09-10', end: null, active: 'end' }, 'picking the start moves on to the end');
    s = RG.pickDay(s, '2023-09-15');
    assert.deepEqual(s, { start: '2023-09-10', end: '2023-09-15', active: 'end' });
    s = RG.pickDay(s, '2023-09-05');
    assert.deepEqual(s, { start: '2023-09-05', end: '2023-09-15', active: 'end' }, 'before the start: new start, the end stays');
    s = RG.pickDay({ start: '2023-09-05', end: '2023-09-15', active: 'start' }, '2023-09-20');
    assert.deepEqual(s, { start: '2023-09-20', end: null, active: 'end' }, 'a start after the end drops the end');
  });
  it('month grid: 42 days from Monday, days outside the data are off', () => {
    const c = RG.monthCells(2023, 8, '2023-09-05', '2023-09-28');   // September 2023 starts on a Friday
    assert.equal(c.length, 42);
    assert.equal(c[0].key, '2023-08-28');
    assert.ok(c[0].out && c[0].off);
    const d = (k) => c.find((x) => x.key === k);
    assert.ok(d('2023-09-04').off && !d('2023-09-05').off && !d('2023-09-28').off && d('2023-09-29').off);
    assert.ok(!d('2023-09-15').out);
  });
});
