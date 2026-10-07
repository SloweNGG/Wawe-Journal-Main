/**
 * broker-detector.js
 * ---------------------------------------------------------------------------
 * Layer 3 (Broker auto-detection). Depends on window.BrokerDictionary
 * (broker-dictionary.js must be loaded first).
 *
 * Exposes: window.BrokerDetector = { detect(rawHeaders) }
 *
 * detect() returns:
 * {
 *   broker: 'mt4' | 'mt5' | 'ctrader' | 'xtb' | 'oanda' | 'ibkr' |
 *           'binance' | 'bybit-closed-pnl' | 'tradingview' | 'tr-legacy' | 'generic',
 *   confidence: 0..1,
 *   isFillBased: boolean,          // needs fill-pairing.js before row mapping
 *   explicitMap: function(rawHeaders)|null   // returns {field: headerIndex|[idx,idx]}
 * }
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';
  var Dict = global.BrokerDictionary;
  var norm = Dict.normalizeHeader;

  // Each signature lists NORMALIZED header tokens that, together, identify
  // the format. `required` tokens must ALL be present for the signature to
  // even be considered; `weight` tokens contribute to the confidence score.
  var SIGNATURES = [
    {
      broker: 'mt4',
      required: ['type', 'item'],
      weight: ['opentime', 'closetime', 'price', 'sl', 'tp', 'size', 'profit', 'ticket'],
      isFillBased: false,
      // MT4/MT5 exports repeat "Price" (open+close) and "Time" (open+close).
      // Resolve them positionally: first occurrence = open/entry, second = close/exit.
      explicitMap: function (rawHeaders) {
        var n = rawHeaders.map(norm);
        var priceIdx = indicesOf(n, 'price');
        var timeIdx = indicesOf(n, function (h) { return h.indexOf('time') >= 0; });
        var map = {};
        map.symbol = firstIndexOf(n, 'item');
        map.direction = firstIndexOf(n, 'type');
        map.lot = firstIndexOf(n, 'size');
        map.pnl = firstIndexOf(n, 'profit');
        map.sl = firstIndexOf(n, 'sl');
        map.tp = firstIndexOf(n, 'tp');
        if (priceIdx.length >= 2) { map.entry = priceIdx[0]; map.exit = priceIdx[1]; }
        else if (priceIdx.length === 1) { map.entry = priceIdx[0]; }
        if (timeIdx.length >= 2) { map.date = timeIdx[1]; map.dateOpen = timeIdx[0]; }
        else if (timeIdx.length === 1) { map.date = timeIdx[0]; }
        return map;
      }
    },
    {
      broker: 'mt5',
      required: ['symbol', 'volume'],
      weight: ['time', 'price', 'sl', 'tp', 'profit', 'position', 'commission', 'swap', 'positionid', 'totalpnl', 'positionpnl', 'comment'],
      isFillBased: false,
      explicitMap: function (rawHeaders) {
        var n = rawHeaders.map(norm);
        var map = {};
        map.symbol = firstIndexOf(n, 'symbol');
        map.direction = firstIndexOf(n, function (h) { return h === 'type' || h === 'side' || h === 'direction' || h === 'buysell'; });
        map.lot = firstIndexOf(n, function (h) { return h === 'volume' || h === 'size' || h === 'lot'; });

        // Prices: support Open Price / Close Price and duplicate Price
        var openPriceIdx = firstIndexOf(n, function(h) { return h === 'openprice' || h === 'entryprice' || h === 'entry'; });
        var closePriceIdx = firstIndexOf(n, function(h) { return h === 'closeprice' || h === 'closingprice' || h === 'exitprice' || h === 'exit'; });
        var priceIdx = indicesOf(n, function(h) { return h === 'price'; });
        if (openPriceIdx >= 0) {
          map.entry = openPriceIdx;
          if (closePriceIdx >= 0) map.exit = closePriceIdx;
        } else if (priceIdx.length >= 2) {
          map.entry = priceIdx[0];
          map.exit = priceIdx[1];
        } else if (priceIdx.length === 1) {
          map.entry = priceIdx[0];
        }

        // Times: support Open Date/Time / Close Date/Time and duplicate Time
        var closeTimeIdx = firstIndexOf(n, function(h) { return (h.indexOf('close') >= 0 && h.indexOf('time') >= 0) || h === 'closedatetime' || h === 'closetime'; });
        var openTimeIdx = firstIndexOf(n, function(h) { return (h.indexOf('open') >= 0 && h.indexOf('time') >= 0) || h === 'opendatetime' || h === 'opentime'; });
        var timeIdx = indicesOf(n, function (h) { return h.indexOf('time') >= 0; });
        if (closeTimeIdx >= 0) {
          map.date = closeTimeIdx;
          if (openTimeIdx >= 0) map.dateOpen = openTimeIdx;
        } else if (timeIdx.length >= 2) {
          map.date = timeIdx[1];
          map.dateOpen = timeIdx[0];
        } else if (timeIdx.length === 1) {
          map.date = timeIdx[0];
        }

        // PnL & Gross PnL
        map.pnl = firstIndexOf(n, function(h) { return h === 'totalpnl' || h === 'profit' || h === 'net' || h === 'pnl' || h === 'totalprofit'; });
        map.gross_pnl = firstIndexOf(n, function(h) { return h === 'positionpnl' || h === 'grosspnl' || h === 'gross' || h === 'brutkz'; });

        // Commission & Swap & Comment & Ticket
        map.commission = firstIndexOf(n, function(h) { return h === 'commission' || h === 'fee' || h === 'komisyon'; });
        map.swap = firstIndexOf(n, function(h) { return h === 'swap'; });
        map.comment = firstIndexOf(n, function(h) { return h === 'comment' || h === 'notes' || h === 'yorum'; });
        map.ticket = firstIndexOf(n, function(h) { return h === 'positionid' || h === 'ticket' || h === 'position'; });

        // SL & TP
        map.sl = firstIndexOf(n, function(h) { return h === 'sl' || h === 'stoploss'; });
        map.tp = firstIndexOf(n, function(h) { return h === 'tp' || h === 'takeprofit'; });

        return map;
      }
    },
    {
      // cTrader (EN): Symbol, Trade Type, Close Time, Entry Price, Closing Price, Volume, Net $
      // Both tokens required together (not just "entryprice" alone) so this
      // doesn't false-positive-match other formats that also happen to have
      // an "Entry Price" column, e.g. Bybit's Closed P&L export.
      broker: 'ctrader',
      required: ['entryprice', 'closingprice'],
      weight: ['tradetype', 'volume', 'netusd', 'net', 'symbol'],
      isFillBased: false,
      explicitMap: null // generic fuzzy matcher handles this fine (headers are descriptive)
    },
    {
      // Turkish legacy format this parser was originally built for.
      broker: 'tr-legacy',
      required: ['sembol'],
      weight: ['islemacilisyonu', 'girisfiyati', 'kapanisfiyati', 'kapanismiktari', 'net', 'kapatmazamani'],
      isFillBased: false,
      explicitMap: null
    },
    {
      broker: 'xtb',
      required: ['openprice', 'closeprice'],
      weight: ['symbol', 'type', 'volume', 'opentime', 'closetime', 'profit'],
      isFillBased: false,
      explicitMap: null
    },
    {
      broker: 'oanda',
      required: ['instrument'],
      weight: ['units', 'openprice', 'closeprice', 'realizedpl', 'opentime', 'closetime'],
      isFillBased: false,
      explicitMap: null
    },
    {
      // Interactive Brokers execution/trade confirmation report
      broker: 'ibkr',
      required: ['tradeprice'],
      weight: ['buysell', 'symbol', 'quantity', 'datetime'],
      isFillBased: false,
      explicitMap: null
    },
    {
      // Binance spot/futures trade history export (fill-based, one row per execution)
      broker: 'binance',
      required: ['pair', 'side'],
      weight: ['price', 'executed', 'amount', 'fee', 'date', 'realizedprofit'],
      isFillBased: true,
      explicitMap: null
    },
    {
      // Bybit derivatives "Closed P&L" export - already one row per CLOSED
      // trade (entry+exit both present), NOT fill-based. Confirmed via
      // Bybit's v5 closed-pnl API field names (avgEntryPrice/avgExitPrice/
      // closedPnl), which the CSV export's column headers mirror. Note:
      // "Closed P&L" normalizes to "closedpl" (the '&' is stripped, it does
      // NOT become "closedpnl") - required token below reflects that.
      // Given an explicit map because "Contracts" here means SYMBOL, which
      // collides with TradingView's use of the same word for position size
      // (see broker-dictionary.js note on the `lot` field).
      broker: 'bybit-closed-pnl',
      required: ['contracts', 'closedpl'],
      weight: ['qty', 'entryprice', 'exitprice', 'createtime', 'closingdirection'],
      isFillBased: false,
      explicitMap: function (rawHeaders) {
        var n = rawHeaders.map(norm);
        return {
          symbol: firstIndexOf(n, 'contracts'),
          direction: firstIndexOf(n, 'closingdirection'),
          entry: firstIndexOf(n, 'entryprice'),
          exit: firstIndexOf(n, 'exitprice'),
          lot: firstIndexOf(n, 'qty'),
          pnl: firstIndexOf(n, 'closedpl'),
          date: firstIndexOf(n, 'createtime')
        };
      }
    },
    {
      // Bybit spot trade history (fill-based, multiple fills per Order ID)
      broker: 'bybit-spot',
      required: ['orderid', 'side'],
      weight: ['symbol', 'price', 'qty', 'fee', 'time'],
      isFillBased: true,
      explicitMap: null
    },
    {
      // Coinbase transaction/portfolio export - not really a trade-P&L
      // format at all (no direction/exit concept); flagged so callers can
      // route straight to manual mapping instead of guessing.
      broker: 'coinbase',
      required: ['asset', 'quantitytransacted'],
      weight: ['transactiontype', 'priceattransaction', 'subtotal', 'total', 'fees'],
      isFillBased: true,
      explicitMap: null
    },
    {
      // TradingView Strategy Tester / paper trading export - one row per
      // ENTRY or EXIT *event*, not per closed trade. Type column holds
      // values like "Entry Long" / "Exit Short".
      broker: 'tradingview',
      required: ['type', 'signal'],
      weight: ['datetime', 'price', 'contracts', 'profit', 'drawdown', 'runup'],
      isFillBased: true,
      explicitMap: null
    }
  ];

  function indicesOf(normHeaders, matcher) {
    var test = typeof matcher === 'function' ? matcher : function (h) { return h === matcher; };
    var out = [];
    for (var i = 0; i < normHeaders.length; i++) if (test(normHeaders[i])) out.push(i);
    return out;
  }
  function firstIndexOf(normHeaders, matcher) {
    var test = typeof matcher === 'function' ? matcher : function (h) { return h === matcher; };
    for (var i = 0; i < normHeaders.length; i++) if (test(normHeaders[i])) return i;
    return -1;
  }

  function detect(rawHeaders) {
    var normHeaders = rawHeaders.map(norm);
    var headerSet = {};
    normHeaders.forEach(function (h) { headerSet[h] = true; });

    var best = null;
    for (var i = 0; i < SIGNATURES.length; i++) {
      var sig = SIGNATURES[i];
      var hasAllRequired = sig.required.every(function (tok) { return headerSet[tok]; });
      if (!hasAllRequired) continue;

      var matchedWeight = sig.weight.filter(function (tok) { return headerSet[tok]; }).length;
      var totalWeight = sig.weight.length || 1;
      var confidence = 0.6 + 0.4 * (matchedWeight / totalWeight); // required tokens already guarantee a 0.6 floor
      if (!best || confidence > best.confidence) {
        best = {
          broker: sig.broker,
          confidence: confidence,
          isFillBased: sig.isFillBased,
          explicitMap: sig.explicitMap ? sig.explicitMap(rawHeaders) : null
        };
      }
    }

    if (!best) {
      return { broker: 'generic', confidence: 0, isFillBased: false, explicitMap: null };
    }
    return best;
  }

  global.BrokerDetector = { detect: detect, SIGNATURES: SIGNATURES };
})(typeof window !== 'undefined' ? window : this);