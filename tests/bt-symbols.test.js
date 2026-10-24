// Backtest v2: symbol config and market hours (public/interface/backtest/js/bt-symbols.js)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBt, plain } from './helpers/bt-env.js';

const { S } = loadBt(['symbols']);
const ms = (iso) => Date.parse(iso);

describe('bt-symbols: config', () => {
  it('validates', () => assert.deepEqual(plain(S.validate()), []));
  it('lists the six symbols', () => assert.deepEqual(plain(S.list().map((s) => s.id)), ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSDT', 'ETHUSDT']));
  it('XAUUSD pip is 0.1 (decision D13): 2 digits, 10 points per pip', () => {
    const x = S.get('XAUUSD');
    assert.equal(x.pipSize, 0.1); assert.equal(x.digits, 2); assert.equal(x.pointsPerPip, 10);
  });
  it('derived fields', () => {
    assert.equal(S.get('EURUSD').pointsPerPip, 10);
    assert.equal(S.get('BTCUSDT').pointsPerPip, 100);
    assert.equal(S.get('EURUSD').lotDigits, 2);
    assert.equal(S.get('eurusd').id, 'EURUSD');
    assert.equal(S.get('NOPE'), null);
  });
  it('priceFormat', () => assert.deepEqual(plain(S.priceFormat('EURUSD')), { type: 'price', precision: 5, minMove: 0.00001 }));
  it('pipValueUsd (display only)', () => {
    assert.equal(S.pipValueUsd('EURUSD', 1, 1.1), 10);
    assert.ok(Math.abs(S.pipValueUsd('USDJPY', 1, 150) - 1000 / 150) < 1e-9);
  });
});

describe('bt-symbols: market hours', () => {
  it('FX: closed Saturday, open from Sunday 17:00 New York to Friday 17:00', () => {
    assert.equal(S.isOpen(ms('2026-09-05T12:00:00Z'), 'EURUSD'), false);       // Saturday
    assert.equal(S.isOpen(ms('2026-09-06T20:59:00Z'), 'EURUSD'), false);       // Sunday 16:59 EDT
    assert.equal(S.isOpen(ms('2026-09-06T21:00:00Z'), 'EURUSD'), true);        // Sunday 17:00 EDT
    assert.equal(S.isOpen(ms('2026-09-04T20:59:00Z'), 'EURUSD'), true);        // Friday 16:59 EDT
    assert.equal(S.isOpen(ms('2026-09-04T21:00:00Z'), 'EURUSD'), false);       // Friday 17:00 EDT
  });
  it('DST: the open moves by one hour in winter (EST)', () => {
    assert.equal(S.isOpen(ms('2026-12-06T21:59:00Z'), 'EURUSD'), false);
    assert.equal(S.isOpen(ms('2026-12-06T22:00:00Z'), 'EURUSD'), true);
  });
  it('gold: daily break 17:00-18:00 New York', () => {
    assert.equal(S.isOpen(ms('2026-09-02T20:59:00Z'), 'XAUUSD'), true);
    assert.equal(S.isOpen(ms('2026-09-02T21:30:00Z'), 'XAUUSD'), false);
    assert.equal(S.isOpen(ms('2026-09-02T22:00:00Z'), 'XAUUSD'), true);
  });
  it('crypto: always open', () => {
    assert.equal(S.isOpen(ms('2026-09-05T12:00:00Z'), 'BTCUSDT'), true);
    assert.equal(S.nextOpen(ms('2026-09-05T12:00:30Z'), 'BTCUSDT'), ms('2026-09-05T12:01:00Z'));
  });
  it('holidays: Christmas trading day is closed for FX', () => {
    assert.equal(S.isOpen(ms('2026-12-25T15:00:00Z'), 'EURUSD'), false);
  });
  it('nextOpen skips a weekend', () => {
    assert.equal(S.nextOpen(ms('2026-09-05T12:00:00Z'), 'EURUSD'), ms('2026-09-06T21:00:00Z'));
    assert.equal(S.nextOpen(ms('2026-09-02T10:00:00Z'), 'EURUSD'), ms('2026-09-02T10:00:00Z'));
  });
  it('nextOpen of an open minute is itself, rounded up to the minute', () => {
    assert.equal(S.nextOpen(ms('2026-09-02T10:00:01Z'), 'EURUSD'), ms('2026-09-02T10:01:00Z'));
  });
  it('dayAnchor: 17:00 New York for FX, 00:00 UTC for crypto', () => {
    assert.equal(S.dayAnchor(ms('2026-09-01T03:00:00Z'), 'EURUSD'), ms('2026-08-31T21:00:00Z'));
    assert.equal(S.dayAnchor(ms('2026-09-01T22:00:00Z'), 'EURUSD'), ms('2026-09-01T21:00:00Z'));
    assert.equal(S.dayAnchor(ms('2026-09-01T15:30:00Z'), 'BTCUSDT'), ms('2026-09-01T00:00:00Z'));
  });
  it('tradingDayKey: the day that ENDS at 17:00 New York (FX), UTC day (crypto)', () => {
    assert.equal(S.tradingDayKey(ms('2026-08-31T21:00:00Z'), 'EURUSD'), '2026-09-01');
    assert.equal(S.tradingDayKey(ms('2026-09-01T20:59:00Z'), 'EURUSD'), '2026-09-01');
    assert.equal(S.tradingDayKey(ms('2026-09-01T21:00:00Z'), 'EURUSD'), '2026-09-02');
    assert.equal(S.tradingDayKey(ms('2026-09-01T23:59:00Z'), 'BTCUSDT'), '2026-09-01');
  });
  it('spread unit: pips for forex and gold, price units for crypto; crypto position value', () => {
    assert.equal(S.spreadUnit('EURUSD'), 'pip'); assert.equal(S.spreadUnit('XAUUSD'), 'pip'); assert.equal(S.spreadUnit('USDJPY'), 'pip');
    assert.equal(S.spreadUnit('BTCUSDT'), 'price'); assert.equal(S.spreadUnit('ETHUSDT'), 'price');
    assert.equal(S.get('BTCUSDT').pipSize, 1, 'crypto pip = 1 price unit, so spread_pips is the spread in USD');
    assert.equal(S.spreadPoints(10, 'BTCUSDT'), 1000, '10 USD = 1000 points at 2 digits');
    assert.equal(S.positionValueUsd('BTCUSDT', 0.1, 60000), 6000);
    assert.equal(S.positionValueUsd('USDJPY', 1, 150), 100000, 'USD base: the notional is the lot in USD');
  });
});
