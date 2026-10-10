/**
 * fill-pairing.js
 * ---------------------------------------------------------------------------
 * Layer 4 (Fill-based pairing). Depends on window.BrokerDictionary
 * (broker-dictionary.js must be loaded first).
 *
 * Some export formats (Binance, Bybit spot, TradingView Strategy Tester)
 * give one row per FILL/EVENT, not one row per closed trade. This module
 * turns a stream of fills into closed round-trip trades using FIFO
 * inventory matching, with partial-fill support.
 *
 * Exposes: window.FillPairing = { pairFills }
 *
 * Input: array of fill objects (already field-extracted by parser-v2's
 * generic matcher):
 *   { symbol: string, side: 'LONG'|'SHORT'|'BUY'|'SELL', price: number,
 *     qty: number, date: Date|null, fee?: number, rowIndex: number }
 *
 * Output:
 *   {
 *     trades: [{ symbol, direction, entry, exit, lot, pnl, date, dateOpen,
 *                partial: boolean, sourceRows: [rowIndex,...] }],
 *     openPositions: [{ symbol, direction, entry, lot, date, rowIndex }],
 *     warnings: [string, ...]
 *   }
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';
  var Dict = global.BrokerDictionary;

  function toLongShort(side) {
    if (side === 'LONG' || side === 'SHORT') return side;
    var d = Dict.normalizeDirection(side);
    return d; // may be null if unrecognized
  }

  /**
   * Matches an incoming fill (on the OPPOSITE side of a queue) against that
   * queue's oldest entries first (FIFO), splitting for partial fills.
   * Mutates `queue` in place (removes/shrinks matched entries).
   * Returns { trades, remainingQty, remainingFee }.
   */
  function matchAgainstQueue(queue, incoming, closingDirectionOfQueue) {
    var trades = [];
    var remainingQty = incoming.qty;
    var remainingFee = incoming.fee || 0;

    while (remainingQty > 1e-12 && queue.length > 0) {
      var lot = queue[0];
      var matchedQty = Math.min(lot.qty, remainingQty);
      // Fees are treated as a cost magnitude regardless of how the source
      // export signs them (some exchanges report fee as positive, some as
      // a negative "outflow") - Math.abs keeps pnl correct either way.
      var lotFeeShare = lot.fee ? (Math.abs(lot.fee) * (matchedQty / lot.originalQty)) : 0;
      var incFeeShare = incoming.fee ? (Math.abs(incoming.fee) * (matchedQty / incoming.qty)) : 0;

      var entryPrice, exitPrice;
      if (closingDirectionOfQueue === 'LONG') {
        entryPrice = lot.price;   // queue holds the original BUY (open long)
        exitPrice = incoming.price; // incoming SELL closes it
      } else {
        entryPrice = lot.price;   // queue holds the original SELL (open short)
        exitPrice = incoming.price; // incoming BUY covers it
      }

      var mult = (global.BrokerDictionary && typeof global.BrokerDictionary.getMultiplier === 'function')
        ? global.BrokerDictionary.getMultiplier(lot.symbol)
        : 1;
      var rawDiff = (closingDirectionOfQueue === 'LONG'
        ? (exitPrice - entryPrice) * matchedQty
        : (entryPrice - exitPrice) * matchedQty) * mult;
      var pnl = rawDiff - lotFeeShare - incFeeShare;

      var isPartial = matchedQty < lot.originalQty || matchedQty < incoming.qty;

      trades.push({
        symbol: lot.symbol,
        direction: closingDirectionOfQueue,
        entry: entryPrice,
        exit: exitPrice,
        lot: matchedQty,
        pnl: pnl,
        date: incoming.date,       // trade "closes" on the incoming fill's date
        dateOpen: lot.date,
        partial: isPartial,
        sourceRows: [lot.rowIndex, incoming.rowIndex]
      });

      lot.qty -= matchedQty;
      remainingQty -= matchedQty;
      if (lot.qty <= 1e-12) queue.shift();
    }

    return { trades: trades, remainingQty: remainingQty };
  }

  /**
   * pairFills(fills) -> { trades, openPositions, warnings }
   */
  function pairFills(fills) {
    var trades = [];
    var warnings = [];
    // per-symbol open-lot queues, one for long-side inventory, one for short-side
    var buyQueues = {};  // symbol -> [{symbol, price, qty, originalQty, fee, date, rowIndex}]
    var sellQueues = {};

    fills.forEach(function (raw, i) {
      var side = toLongShort(raw.side);
      var symbol = raw.symbol || '(unknown)';
      var price = raw.price;
      var qty = raw.qty;
      var rowIndex = raw.rowIndex != null ? raw.rowIndex : i;

      if (side === null) {
        warnings.push('Row ' + rowIndex + ': yön (side) tanınamadı, fill atlandı.');
        return;
      }
      if (price === null || price === undefined || isNaN(price)) {
        warnings.push('Row ' + rowIndex + ': geçersiz fiyat, fill atlandı.');
        return;
      }
      if (qty === null || qty === undefined || isNaN(qty) || qty <= 0) {
        warnings.push('Row ' + rowIndex + ': geçersiz miktar, fill atlandı.');
        return;
      }

      buyQueues[symbol] = buyQueues[symbol] || [];
      sellQueues[symbol] = sellQueues[symbol] || [];

      var incoming = { symbol: symbol, price: price, qty: qty, fee: raw.fee || 0, date: raw.date, rowIndex: rowIndex };

      if (side === 'LONG') {
        // A BUY first closes existing SHORT inventory (FIFO), leftover opens/adds LONG.
        var res = matchAgainstQueue(sellQueues[symbol], incoming, 'SHORT');
        trades = trades.concat(res.trades);
        if (res.remainingQty > 1e-12) {
          buyQueues[symbol].push({
            symbol: symbol, price: price, qty: res.remainingQty, originalQty: qty,
            fee: raw.fee ? raw.fee * (res.remainingQty / qty) : 0,
            date: raw.date, rowIndex: rowIndex
          });
        }
      } else {
        // A SELL first closes existing LONG inventory (FIFO), leftover opens/adds SHORT.
        var res2 = matchAgainstQueue(buyQueues[symbol], incoming, 'LONG');
        trades = trades.concat(res2.trades);
        if (res2.remainingQty > 1e-12) {
          sellQueues[symbol].push({
            symbol: symbol, price: price, qty: res2.remainingQty, originalQty: qty,
            fee: raw.fee ? raw.fee * (res2.remainingQty / qty) : 0,
            date: raw.date, rowIndex: rowIndex
          });
        }
      }
    });

    var openPositions = [];
    Object.keys(buyQueues).forEach(function (sym) {
      buyQueues[sym].forEach(function (lot) {
        openPositions.push({ symbol: sym, direction: 'LONG', entry: lot.price, lot: lot.qty, date: lot.date, rowIndex: lot.rowIndex });
      });
    });
    Object.keys(sellQueues).forEach(function (sym) {
      sellQueues[sym].forEach(function (lot) {
        openPositions.push({ symbol: sym, direction: 'SHORT', entry: lot.price, lot: lot.qty, date: lot.date, rowIndex: lot.rowIndex });
      });
    });
    if (openPositions.length > 0) {
      warnings.push(openPositions.length + ' pozisyon dosya sonunda hâlâ açık görünüyor (karşı işlem bulunamadı) — bunlar kapalı işlem olarak sayılmadı.');
    }

    return { trades: trades, openPositions: openPositions, warnings: warnings };
  }

  global.FillPairing = { pairFills: pairFills };
})(typeof window !== 'undefined' ? window : this);