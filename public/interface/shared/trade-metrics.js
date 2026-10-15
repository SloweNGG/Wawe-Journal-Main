// ============================================================
// WAWE JOURNAL - ORTAK İŞLEM METRİKLERİ (tek doğruluk kaynağı)
// ============================================================
// Dashboard, Premium Dashboard, Calendar, Trades, Strategies ve Overtrade
// aynı metriği (PnL, win rate, profit factor, günlük kova) 4-5 ayrı yerde
// farklı şekilde hesaplıyordu; aynı işlem sayfalar arasında farklı sonuç
// gösteriyordu. Bu dosya o tanımları tek yerde toplar.
//
// KURAL: "Açık işlem" diye bir kavram YOKTUR. Bir işlem ya kapanmıştır
// (çıkış fiyatı vardır) ya da istatistiklere hiç girmez.
//
// Tarih/saat dilimi mantığı time-settings.js (WwTime) içindedir; dateKey() ona devreder.
// ============================================================
(function (global) {
  'use strict';

  function toNum(v) {
    if (v === null || v === undefined || v === '') return NaN;
    var n = parseFloat(v);
    return isFinite(n) ? n : NaN;
  }

  // Kapanmış işlem = geçerli bir çıkış fiyatı var
  function isClosed(t) {
    return !!t && !isNaN(toNum(t.exit_price));
  }

  function closedTrades(trades) {
    return (trades || []).filter(isClosed);
  }

  // Bir işlemin net PnL'i. Sıra: kayıtlı (net) pnl → girişten hesaplanan brüt PnL.
  // Kapanmamış işlem için 0 döner (istatistiklere girmez).
  function tradePnL(t) {
    try {
      if (!isClosed(t)) return 0;

      var stored = toNum(t.pnl);
      if (!isNaN(stored)) return stored;

      var entry = toNum(t.entry_price);
      var lot = toNum(t.lot);
      var exit = toNum(t.exit_price);
      if (isNaN(entry) || isNaN(lot)) return 0;

      if (typeof global.calcPnL === 'function') {
        var v = global.calcPnL(entry, exit, lot, t.direction, t.instrument, t.multiplier);
        return isFinite(v) ? v : 0;
      }
      var mult = toNum(t.multiplier);
      if (isNaN(mult)) mult = 1;
      var dir = (t.direction === 'LONG' || t.direction === 'BUY') ? 1 : -1;
      return dir * (exit - entry) * lot * mult;
    } catch (e) {
      return 0;
    }
  }

  // 'YYYY-MM-DD' (kullanıcının işlem günü) anahtarı. Mantık time-settings.js (WwTime) içindedir:
  // seçilen saat dilimi ve gün başlangıç saati uygulanır; sadece-tarih değerler kaymaz.
  function dateKey(t) {
    var raw = (t && typeof t === 'object') ? t.trade_date : t;
    if (raw === null || raw === undefined || raw === '') return '';
    if (global.WwTime) return global.WwTime.dateKey(raw);
    var s = String(raw);
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
  }

  // Kapanmış işlemlerden özet. wins: pnl>0, losses: pnl<0, breakeven: pnl==0.
  // Win rate paydası = tüm KAPANMIŞ işlemler (break-even dahil).
  // Profit factor: kayıp yokken kazanç varsa null (∞), hiç işlem yoksa 0.
  function summarize(trades) {
    var closed = closedTrades(trades);
    var s = {
      total: closed.length, wins: 0, losses: 0, breakeven: 0,
      totalPnL: 0, grossWin: 0, grossLoss: 0, avgWin: 0, avgLoss: 0,
      winRate: 0, profitFactor: 0
    };
    closed.forEach(function (t) {
      var pnl = tradePnL(t);
      s.totalPnL += pnl;
      if (pnl > 0) { s.wins++; s.grossWin += pnl; }
      else if (pnl < 0) { s.losses++; s.grossLoss += pnl; }
      else { s.breakeven++; }
    });
    s.winRate = s.total ? (s.wins / s.total) * 100 : 0;
    s.avgWin = s.wins ? s.grossWin / s.wins : 0;
    s.avgLoss = s.losses ? s.grossLoss / s.losses : 0; // negatif
    if (s.losses > 0) s.profitFactor = s.grossWin / Math.abs(s.grossLoss);
    else s.profitFactor = s.wins > 0 ? null : 0;
    return s;
  }

  // Profit factor gösterimi: null → "∞"
  function formatProfitFactor(pf) {
    if (pf === null || pf === Infinity) return '∞';
    if (pf === undefined || isNaN(pf)) return '0.00';
    return pf.toFixed(2);
  }

  global.WwMetrics = {
    toNum: toNum,
    isClosed: isClosed,
    closedTrades: closedTrades,
    tradePnL: tradePnL,
    dateKey: dateKey,
    summarize: summarize,
    formatProfitFactor: formatProfitFactor
  };
})(typeof window !== 'undefined' ? window : this);
