// ParserV2: rapor biçimli dosyalar (başlık 1. satırda değil) ve sıraya bağlı fill eşleştirme
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const DIR = 'public/interface/quick-add/js/';
function load() {
  const ctx = { console, localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} } };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['broker-dictionary.js', 'broker-detector.js', 'fill-pairing.js', 'parser-v2.js']) {
    vm.runInContext(fs.readFileSync(DIR + f, 'utf8'), ctx, { filename: f });
  }
  return ctx.ParserV2;
}
const P = load();
const csv = (rows) => rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');

const MT5_HEAD = ['Time', 'Position', 'Symbol', 'Type', 'Volume', 'Price', 'S / L', 'T / P', 'Time', 'Price', 'Commission', 'Swap', 'Profit'];
const MT5_ROW1 = ['2026.06.17 07:24:01', '555001', 'EURUSD', 'buy', '0.25', '1.16125', '1.16000', '1.16400', '2026.06.17 07:32:23', '1.16119', '-1.25', '0', '-1.50'];
const MT5_ROW2 = ['2026.06.18 09:00:00', '555002', 'XAUUSD', 'sell', '0.10', '2350.10', '', '', '2026.06.18 10:15:00', '2345.60', '-0.70', '0', '45.00'];

const MT4_HEAD = ['Ticket', 'Open Time', 'Type', 'Size', 'Item', 'Price', 'S / L', 'T / P', 'Close Time', 'Price', 'Commission', 'Taxes', 'Swap', 'Profit'];
const MT4_ROW = ['12345', '2026.06.17 07:24:01', 'buy', '0.25', 'eurusd', '1.16125', '0', '0', '2026.06.17 07:32:23', '1.16119', '-1.25', '0', '0', '-1.50'];

describe('ParserV2 report-style files', () => {
  it('MT5 history report: finds the Positions header under the account rows and stops at the Orders section', () => {
    const r = P.parse(csv([
      ['Trade History Report'],
      ['Name:', 'Wawe Test'],
      ['Account:', '115347272 (USD, MetaQuotes-Demo, demo, Hedge)'],
      ['Company:', 'MetaQuotes Ltd.'],
      ['Date:', '2026.11.18 10:00'],
      ['Positions'],
      MT5_HEAD, MT5_ROW1, MT5_ROW2,
      ['Orders'],
      ['Open Time', 'Order', 'Symbol', 'Type', 'Volume', 'Price', 'S / L', 'T / P', 'Time', 'State', 'Comment'],
      ['2026.06.17 07:24:01', '777', 'EURUSD', 'buy', '0.25 / 0.25', 'market', '', '', '2026.06.17 07:24:01', 'filled', ''],
    ]), {});
    assert.equal(r.rows.length, 2, JSON.stringify(r.errors));
    assert.equal(r.rows.map((x) => x.symbol).join(','), 'EURUSD,XAUUSD');
    assert.equal(r.rows[0].entry, 1.16125);
    assert.equal(r.rows[0].exit, 1.16119);
    assert.equal(r.rows[1].direction.toUpperCase().startsWith('S'), true);
  });

  it('MT4 Detailed Statement: header under "Closed Transactions:", balance and total rows do not become trades, stops at Open Trades', () => {
    const r = P.parse(csv([
      ['Account: 123', 'Name: John', 'Currency: USD', 'Leverage: 1:100'],
      ['Closed Transactions:'],
      MT4_HEAD,
      MT4_ROW,
      ['12346', '2026.06.16 08:00:00', 'balance', 'Deposit', '', '', '', '', '', '', '', '', '', '1000.00'],
      ['', '', '', '', '', '', '', '', '', '', '-1.25', '0', '0', '-1.50'],
      ['Open Trades:'],
      MT4_HEAD,
      ['12347', '2026.06.18 07:24:01', 'buy', '0.10', 'gbpusd', '1.27000', '0', '0', '', '1.27100', '0', '0', '0', '10.00'],
    ]), {});
    assert.equal(r.rows.length, 1, JSON.stringify({ rows: r.rows, errors: r.errors }));
    assert.equal(r.rows[0].symbol.toUpperCase(), 'EURUSD');
    assert.equal(r.rows[0].exit, 1.16119);
  });

  it('header already on the first row: unchanged behaviour', () => {
    const a = P.parse(csv([MT5_HEAD, MT5_ROW1, MT5_ROW2]), {});
    assert.equal(a.rows.length, 2);
    const g = P.parse(csv([['Symbol', 'Direction', 'Lot', 'Entry', 'Exit', 'Date'], ['EURUSD', 'Buy', '0.1', '1.1', '1.2', '2026-06-17']]), {});
    assert.equal(g.rows.length, 1);
  });

  it('a file with no recognisable header keeps the old error', () => {
    const r = P.parse(csv([['foo', 'bar'], ['1', '2'], ['3', '4']]), {});
    assert.equal(r.rows.length, 0);
  });
});

describe('ParserV2 fill pairing order', () => {
  const head = ['Date(UTC)', 'Pair', 'Side', 'Price', 'Executed', 'Amount', 'Fee'];
  const buy = ['2026-06-17 07:24:01', 'BTCUSDT', 'BUY', '65000', '0.01', '650', '0'];
  const sell = ['2026-06-17 07:32:23', 'BTCUSDT', 'SELL', '65400', '0.01', '654', '0'];

  it('oldest-first file: one long trade', () => {
    const r = P.parse(csv([head, buy, sell]), {});
    assert.equal(r.rows.length, 1);
    assert.equal(String(r.rows[0].direction).toUpperCase(), 'LONG');
    assert.equal(r.rows[0].entry, 65000);
  });

  it('newest-first file gives the same long trade (fills sorted by time)', () => {
    const r = P.parse(csv([head, sell, buy]), {});
    assert.equal(r.rows.length, 1);
    assert.equal(String(r.rows[0].direction).toUpperCase(), 'LONG');
    assert.equal(r.rows[0].entry, 65000);
    assert.equal(r.rows[0].exit, 65400);
  });
});

describe('ParserV2 SL/TP header matching', () => {
  it('XTB "Profit" is not read as take profit; "Net profit" is the P&L', () => {
    const r = P.parse(csv([
      ['Position', 'Symbol', 'Type', 'Volume', 'Open time', 'Open price', 'Close time', 'Close price', 'Profit', 'Net profit'],
      ['1', 'EURUSD', 'BUY', '0.25', '17.06.2026 07:24:01', '1.16125', '17.06.2026 07:32:23', '1.16119', '-4.12', '-4.30'],
    ]), {});
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].tp, null);
    assert.equal(r.rows[0].pnl, -4.3);
  });

  it('explicit S / L and T / P columns still map', () => {
    const r = P.parse(csv([MT5_HEAD, MT5_ROW1]), {});
    assert.equal(r.rows[0].sl, 1.16);
    assert.equal(r.rows[0].tp, 1.164);
  });
});

