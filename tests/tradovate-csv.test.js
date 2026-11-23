// Tradovate CSV içe aktarma: Performance raporu ve Orders dışa aktarımı (parser-v2.js)
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
const csv = (rows) => rows.map((r) => r.join(',')).join('\n');
const plain = (v) => JSON.parse(JSON.stringify(v));
const ymd = (d) => [d.getFullYear(), d.getMonth() + 1, d.getDate()].join('-');

const PERF_HEAD = ['symbol', '_priceFormat', '_priceFormatType', '_tickSize', 'buyFillId', 'sellFillId', 'qty', 'buyPrice', 'sellPrice', 'pnl', 'boughtTimestamp', 'soldTimestamp', 'duration'];
const perf = (sym, bf, sf, qty, bp, sp, pnl, bt, st) => [sym, '-2', '0', '0.25', bf, sf, qty, bp, sp, pnl, bt, st, '1min'];

describe('Tradovate Performance report', () => {
  it('long and short round trips, $(x) losses, root symbol and point value', () => {
    const r = P.parse(csv([
      PERF_HEAD,
      perf('MNQZ5', '101', '102', '1', '21000.25', '21010.50', '$20.50', '11/05/2025 09:31:05', '11/05/2025 09:35:10'),
      perf('ESZ5', '104', '103', '2', '6000.00', '6001.00', '$(100.00)', '11/05/2025 10:02:00', '11/05/2025 10:00:00'),
    ]), {});
    assert.equal(r.detected, 'tradovate');
    assert.equal(r.rows.length, 2, JSON.stringify(r.errors));
    const [a, b] = r.rows;
    assert.equal(a.symbol, 'MNQ');
    assert.equal(a.direction, 'LONG');
    assert.equal(a.entry, 21000.25);
    assert.equal(a.exit, 21010.5);
    assert.equal(a.pnl, 20.5);
    assert.equal(a.multiplier, 2);
    assert.equal(a.comment, 'Tradovate MNQZ5');
    // ABD tarihi: 11/05 = 5 Kasım (gün/ay okunsaydı 11 Mayıs olurdu)
    assert.equal(ymd(a.date), '2025-11-5');
    assert.equal(a.date.getHours(), 9);
    assert.equal(a.date.getMinutes(), 35);
    assert.equal(b.symbol, 'ES');
    assert.equal(b.direction, 'SHORT');
    assert.equal(b.entry, 6001);
    assert.equal(b.exit, 6000);
    assert.equal(b.pnl, -100);
    assert.equal(b.lot, 2);
  });

  it('scale-out rows sharing the entry fill become one trade', () => {
    const r = P.parse(csv([
      PERF_HEAD,
      perf('MNQZ5', '201', '202', '1', '21000.00', '21010.00', '$20.00', '11/06/2025 09:30:00', '11/06/2025 09:31:00'),
      perf('MNQZ5', '201', '203', '2', '21000.00', '21020.00', '$80.00', '11/06/2025 09:30:00', '11/06/2025 09:40:00'),
    ]), {});
    assert.equal(r.rows.length, 1);
    const t = r.rows[0];
    assert.equal(t.lot, 3);
    assert.equal(t.pnl, 100);
    assert.equal(t.exit, 21016.666667);
    assert.equal(t.date.getMinutes(), 40);
    assert.equal(t.dateOpen.getMinutes(), 30);
  });

  it('a reversing fill does not merge the long and the following short', () => {
    // 301 alış 1, 302 satış 2 (uzunu kapatır, kısa açar), 303 alış 1 (kısayı kapatır)
    const r = P.parse(csv([
      PERF_HEAD,
      perf('MESZ5', '301', '302', '1', '6000.00', '6002.00', '$10.00', '11/07/2025 09:30:00', '11/07/2025 09:32:00'),
      perf('MESZ5', '303', '302', '1', '5999.00', '6002.00', '$15.00', '11/07/2025 09:35:00', '11/07/2025 09:32:00'),
    ]), {});
    assert.equal(r.rows.length, 2);
    assert.deepEqual(plain(r.rows.map((x) => x.direction)), ['LONG', 'SHORT']);
  });
});

const ORD_HEAD = ['orderId', 'Account', 'Order ID', 'B/S', 'Contract', 'Product', 'Product Description', 'avgPrice', 'filledQty', 'Fill Time', 'lastCommandId', 'Status', '_priceFormat', '_priceFormatType', '_tickSize', 'spreadDefinitionId', 'Version ID', 'Timestamp', 'Date', 'Quantity', 'Text', 'Type', 'Limit Price', 'Stop Price', 'decimalLimit', 'decimalStop', 'Filled Qty', 'Avg Fill Price', 'decimalFillAvg'];
const ord = (id, acct, side, contract, price, qty, time, status = ' Filled') =>
  [id, acct, id, side, contract, 'MNQ', 'Micro E-mini Nasdaq', price, qty, time, id, status, '-2', '0', '0.25', '', id, time, time.slice(0, 10), qty, '', 'Market', '', '', '', '', qty, price, price];

describe('Tradovate Orders export', () => {
  it('pairs fills by position, ignores unfilled orders, computes P&L with the point value', () => {
    const r = P.parse(csv([
      ORD_HEAD,
      ord('1', 'APEX-1', ' Buy', 'MNQZ5', '21000.00', '1', '11/05/2025 09:30:00'),
      ord('2', 'APEX-1', ' Buy', 'MNQZ5', '21010.00', '1', '11/05/2025 09:31:00'),
      ord('3', 'APEX-1', ' Sell', 'MNQZ5', '21000.00', '0', '11/05/2025 09:31:30', ' Canceled'),
      ord('4', 'APEX-1', ' Sell', 'MNQZ5', '21020.00', '2', '11/05/2025 09:40:00'),
    ]), {});
    assert.equal(r.detected, 'tradovate-orders');
    assert.equal(r.rows.length, 1, JSON.stringify({ e: r.errors, w: r.warnings }));
    const t = r.rows[0];
    assert.equal(t.symbol, 'MNQ');
    assert.equal(t.direction, 'LONG');
    assert.equal(t.lot, 2);
    assert.equal(t.entry, 21005);
    assert.equal(t.exit, 21020);
    assert.equal(t.pnl, 60); // (21020-21005) * 2 kontrat * $2
    assert.equal(t.ticket, '1');
  });

  it('newest-first file, reversal through zero, open position left out', () => {
    const r = P.parse(csv([
      ORD_HEAD,
      ord('13', 'A', ' Sell', 'ESZ5', '6005.00', '1', '11/05/2025 11:00:00'),
      ord('12', 'A', ' Buy', 'ESZ5', '6002.00', '2', '11/05/2025 10:30:00'),
      ord('11', 'A', ' Sell', 'ESZ5', '6004.00', '1', '11/05/2025 10:00:00'),
    ]), {});
    // 11: kısa 1 @6004 açar; 12: kısayı 6002'de kapatır (+$100) ve uzun 1 açar; 13: uzunu 6005'te kapatır (+$150)
    assert.equal(r.rows.length, 2);
    assert.deepEqual(plain(r.rows.map((x) => [x.direction, x.pnl])), [['SHORT', 100], ['LONG', 150]]);
    assert.equal(r.openPositions.length, 0);

    const open = P.parse(csv([ORD_HEAD, ord('21', 'A', ' Buy', 'MNQZ5', '21000.00', '1', '11/05/2025 09:30:00')]), {});
    assert.equal(open.rows.length, 0);
    assert.equal(open.openPositions.length, 1);
    assert.ok(open.warnings.some((w) => w.includes('açık')));
  });

  it('separate accounts are tracked separately and flagged', () => {
    const r = P.parse(csv([
      ORD_HEAD,
      ord('1', 'A', ' Buy', 'MNQZ5', '21000.00', '1', '11/05/2025 09:30:00'),
      ord('2', 'B', ' Sell', 'MNQZ5', '21005.00', '1', '11/05/2025 09:31:00'),
      ord('3', 'A', ' Sell', 'MNQZ5', '21010.00', '1', '11/05/2025 09:32:00'),
      ord('4', 'B', ' Buy', 'MNQZ5', '21001.00', '1', '11/05/2025 09:33:00'),
    ]), {});
    assert.deepEqual(plain(r.rows.map((x) => [x.direction, x.pnl])), [['LONG', 20], ['SHORT', 8]]);
    assert.ok(r.warnings.some((w) => w.includes('2 Tradovate')));
  });

  it('unknown contract root: P&L left for the app to compute, with a warning', () => {
    const r = P.parse(csv([
      ORD_HEAD,
      ord('1', 'A', ' Buy', 'XYZZ5', '10.00', '1', '11/05/2025 09:30:00'),
      ord('2', 'A', ' Sell', 'XYZZ5', '11.00', '1', '11/05/2025 09:31:00'),
    ]), {});
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].pnl, null);
    assert.equal(r.rows[0].multiplier, null);
    assert.ok(r.warnings.some((w) => w.includes('XYZ')));
  });
});

describe('Tradovate helpers', () => {
  const I = P._internal;
  it('futures roots', () => {
    assert.equal(I.futuresRoot('MNQZ5'), 'MNQ');
    assert.equal(I.futuresRoot('MNQZ25'), 'MNQ');
    assert.equal(I.futuresRoot('6EH6'), '6E');
    assert.equal(I.futuresRoot('M2KZ5'), 'M2K');
    assert.equal(I.futuresRoot('MESM4'), 'MES');
  });
  it('treasury fractional prices', () => {
    assert.equal(I.parseTradovatePrice("118'16"), 118.5);
    assert.equal(I.parseTradovatePrice("110'165"), 110 + 16.5 / 32);
    assert.equal(I.parseTradovatePrice('5310.25'), 5310.25);
  });
  it('12-hour times', () => {
    const d = I.parseTradovateDate('11/05/2025 1:05:00 PM');
    assert.equal(d.getHours(), 13);
    assert.equal(ymd(d), '2025-11-5');
  });
  it('other brokers are not mistaken for Tradovate', () => {
    const r = P.parse(csv([['Date(UTC)', 'Pair', 'Side', 'Price', 'Executed', 'Amount', 'Fee'], ['2026-06-17 07:24:01', 'BTCUSDT', 'BUY', '65000', '0.01', '650', '0'], ['2026-06-17 07:32:23', 'BTCUSDT', 'SELL', '65400', '0.01', '654', '0']]), {});
    assert.equal(r.detected, 'binance');
  });
});

// Gerçek Tradovate Orders dışa aktarımının biçimi (demo hesap, MESM4; TradeZella yardım sayfasındaki örnek dosya):
// 29 sütun, B/S / Status / Type değerlerinde baştaki boşluk, CRLF satır sonu, dolum saatine göre sırasız satırlar,
// iptal edilen emirlerde boş dolum alanları.
describe('Tradovate Orders: real export layout', () => {
  const HEAD = 'orderId,Account,Order ID,B/S,Contract,Product,Product Description,avgPrice,filledQty,Fill Time,lastCommandId,Status,_priceFormat,_priceFormatType,_tickSize,spreadDefinitionId,Version ID,Timestamp,Date,Quantity,Text,Type,Limit Price,Stop Price,decimalLimit,decimalStop,Filled Qty,Avg Fill Price,decimalFillAvg';
  const FILE = [
    HEAD,
    '65509915441,DEMO1520898,65509915441, Buy,MESM4,MES,Micro E-mini S&P 500,5068.5,1,04/23/2024 09:11:54,65509915452, Filled,-2,0,0.25,,65509915452,04/23/2024 09:05:23,4/23/24,1,multibracket, Stop,,5068.50,,5068.5,1,5068.50,5068.5',
    '65509915444,DEMO1520898,65509915444, Sell,MESM4,MES,Micro E-mini S&P 500,,,,65509915478, Canceled,-2,0,0.25,,65509915478,04/23/2024 09:11:54,4/23/24,1,multibracket, Limit,5078.50,,5078.5,,,,',
    '65509915446,DEMO1520898,65509915446, Sell,MESM4,MES,Micro E-mini S&P 500,5067.25,1,04/23/2024 09:30:21,65509915546, Filled,-2,0,0.25,,65509915546,04/23/2024 09:29:18,4/23/24,1,multibracket, Stop,,5067.25,,5067.25,1,5067.25,5067.25',
    '65509915489,DEMO1520898,65509915489, Buy,MESM4,MES,Micro E-mini S&P 500,5068.5,3,04/23/2024 09:14:21,65509915489, Filled,-2,0,0.25,,65509915489,04/23/2024 09:14:21,4/23/24,3,multibracket, Limit,5068.50,,5068.5,,3,5068.50,5068.5',
    '65509915498,DEMO1520898,65509915498, Sell,MESM4,MES,Micro E-mini S&P 500,,,,65509915518, Canceled,-2,0,0.25,,65509915518,04/23/2024 09:14:36,4/23/24,3,multibracket, Limit,5078.50,,5078.5,,,,',
    '65509915500,DEMO1520898,65509915500, Sell,MESM4,MES,Micro E-mini S&P 500,5067.25,3,04/23/2024 09:30:21,65509915550, Filled,-2,0,0.25,,65509915550,04/23/2024 09:29:26,4/23/24,3,multibracket, Stop,,5067.25,,5067.25,3,5067.25,5067.25',
    '65509915579,DEMO1520898,65509915579, Buy,MESM4,MES,Micro E-mini S&P 500,5071.75,3,04/23/2024 09:41:42,65509915579, Filled,-2,0,0.25,,65509915579,04/23/2024 09:38:41,4/23/24,3,multibracket, Stop,,5071.75,,5071.75,3,5071.75,5071.75',
    '65509915582,DEMO1520898,65509915582, Sell,MESM4,MES,Micro E-mini S&P 500,5079.5,3,04/23/2024 09:45:29,65509915610, Filled,-2,0,0.25,,65509915610,04/23/2024 09:42:32,4/23/24,3,multibracket, Limit,5079.50,,5079.5,,3,5079.50,5079.5',
    '65509915584,DEMO1520898,65509915584, Sell,MESM4,MES,Micro E-mini S&P 500,,,,65509915596, Canceled,-2,0,0.25,,65509915596,04/23/2024 09:41:42,4/23/24,3,multibracket, Stop,,5069.50,,5069.5,,,',
  ].join('\r\n') + '\r\n';

  it('fills grouped until flat; canceled orders and padding ignored', () => {
    const r = P.parse(FILE, {});
    assert.equal(r.detected, 'tradovate-orders');
    assert.deepEqual(plain(r.errors), []);
    assert.equal(r.openPositions.length, 0);
    assert.equal(r.rows.length, 2);
    const [a, b] = r.rows;
    assert.equal(a.symbol, 'MES');
    assert.equal(a.direction, 'LONG');
    assert.equal(a.lot, 4);
    assert.equal(a.entry, 5068.5);
    assert.equal(a.exit, 5067.25);
    assert.equal(a.pnl, -25);
    assert.equal(a.multiplier, 5);
    assert.equal(a.ticket, '65509915441');
    assert.equal(ymd(a.dateOpen), '2024-4-23');
    assert.equal(a.dateOpen.getHours(), 9);
    assert.equal(a.dateOpen.getMinutes(), 11);
    assert.equal(a.date.getMinutes(), 30);
    assert.equal(b.direction, 'LONG');
    assert.equal(b.lot, 3);
    assert.equal(b.entry, 5071.75);
    assert.equal(b.exit, 5079.5);
    assert.equal(b.pnl, 116.25);
  });
});
