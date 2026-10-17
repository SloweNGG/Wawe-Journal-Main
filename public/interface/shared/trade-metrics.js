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

  // İşlemin zamanı (ms). Saat dilimi ekli/eksiz tüm biçimler WwTime.parseMs ile çözülür;
  // metin karşılaştırması "…+03:00" ile "…Z" gibi farklı biçimleri yanlış sıralıyordu.
  function tradeTime(t) {
    var raw = t && t.trade_date;
    if (raw === null || raw === undefined || raw === '') return NaN;
    if (global.WwTime && typeof global.WwTime.parseMs === 'function') return global.WwTime.parseMs(raw);
    var p = Date.parse(String(raw));
    return isNaN(p) ? NaN : p;
  }

  // Kapanmış işlemler, eskiden yeniye. Veritabanı listeleri yeniden eskiye gelir; drawdown ve seri
  // gibi sıraya bağlı metrikler mutlaka bunu kullanmalı. Eşit zamanda gelen sıra korunur (kararlı);
  // tarihi okunamayan işlemler en başa alınır.
  function chronological(trades) {
    return closedTrades(trades)
      .map(function (t, i) { return { t: t, i: i, ms: tradeTime(t) }; })
      .sort(function (a, b) {
        var am = isNaN(a.ms) ? -Infinity : a.ms;
        var bm = isNaN(b.ms) ? -Infinity : b.ms;
        if (am !== bm) return am < bm ? -1 : 1;
        return a.i - b.i;
      })
      .map(function (x) { return x.t; });
  }

  // Kümülatif K/Z eğrisi (eskiden yeniye). equity: o işlem sonrası toplam,
  // drawdown: zirveden uzaklık (≤ 0). Zirve 0'dan başlar: ilk işlem kayıpsa o da drawdown'dır.
  function equityCurve(trades) {
    var equity = 0, peak = 0;
    return chronological(trades).map(function (t) {
      var pnl = tradePnL(t);
      equity += pnl;
      if (equity > peak) peak = equity;
      return { trade: t, pnl: pnl, equity: equity, peak: peak, drawdown: equity - peak };
    });
  }

  // En büyük düşüş, pozitif büyüklük olarak (düşüş yoksa 0)
  function maxDrawdown(trades) {
    var worst = 0;
    equityCurve(trades).forEach(function (p) { if (p.drawdown < worst) worst = p.drawdown; });
    return worst === 0 ? 0 : -worst;
  }

  // Ardışık kazanç/kayıp serileri (eskiden yeniye). Başabaş işlem iki seriyi de bitirir.
  // current: en son işlemlerin oluşturduğu seri; worstLossRun: bir kayıp serisinin en kötü toplamı (≤ 0).
  function streaks(trades) {
    var r = { maxWin: 0, maxLoss: 0, current: 0, currentType: null, worstLossRun: 0 };
    var run = 0, sign = 0, sum = 0;
    chronological(trades).forEach(function (t) {
      var p = tradePnL(t);
      var s = p > 0 ? 1 : (p < 0 ? -1 : 0);
      if (s !== 0 && s === sign) { run++; sum += p; }
      else { run = s === 0 ? 0 : 1; sign = s; sum = s === 0 ? 0 : p; }
      if (sign > 0 && run > r.maxWin) r.maxWin = run;
      if (sign < 0) {
        if (run > r.maxLoss) r.maxLoss = run;
        if (sum < r.worstLossRun) r.worstLossRun = sum;
      }
    });
    r.current = run;
    r.currentType = run > 0 ? (sign > 0 ? 'win' : 'loss') : null;
    return r;
  }

  // İşlem bazlı Sharpe: ortalama / standart sapma (popülasyon). En az 2 işlem ve sıfırdan
  // büyük sapma yoksa hesaplanamaz → null (eskiden yanıltıcı "0.00" gösteriliyordu).
  function sharpe(trades) {
    var pnls = closedTrades(trades).map(tradePnL);
    if (pnls.length < 2) return null;
    var avg = pnls.reduce(function (a, b) { return a + b; }, 0) / pnls.length;
    var variance = pnls.reduce(function (a, v) { return a + (v - avg) * (v - avg); }, 0) / pnls.length;
    var sd = Math.sqrt(variance);
    return sd > 1e-12 ? avg / sd : null;
  }

  // Kullanıcının girdiği R:R değerlerinin ortalaması (kapanmış işlemler, yalnızca pozitif değerler).
  // Hiç R:R girilmemişse null ("—" gösterilir, yanıltıcı 0 değil).
  function avgRR(trades) {
    var sum = 0, n = 0;
    closedTrades(trades).forEach(function (t) {
      var rr = toNum(t.rr_ratio);
      if (rr > 0) { sum += rr; n++; }
    });
    return n ? sum / n : null;
  }

  // Oran kuralı (profit factor, kazanç/kayıp oranı): payda yokken pay varsa null (∞), ikisi de yoksa 0
  function ratio(num, den) {
    if (den > 0) return num / den;
    return num > 0 ? null : 0;
  }

  // Kapanmış işlemlerden özet — tüm sayfalar aynı tanımı kullanır.
  //   wins: pnl>0, losses: pnl<0, breakeven: pnl==0. Win rate paydası tüm kapanmış işlemler.
  //   grossWin, grossLoss, avgWin, avgLoss POZİTİF büyüklüklerdir (gösterirken kayıp eksiyle yazılır).
  //   profitFactor = grossWin / grossLoss, payoff = avgWin / avgLoss (null → ∞).
  //   expectancy = işlem başı ortalama K/Z. maxDrawdown pozitif büyüklük. sharpe/avgRR yoksa null.
  function summarize(trades) {
    var closed = closedTrades(trades);
    var s = {
      total: closed.length, wins: 0, losses: 0, breakeven: 0,
      totalPnL: 0, grossWin: 0, grossLoss: 0, avgWin: 0, avgLoss: 0,
      winRate: 0, profitFactor: 0, payoff: 0, expectancy: 0,
      maxDrawdown: 0, maxWinStreak: 0, maxLossStreak: 0, sharpe: null, avgRR: null
    };
    closed.forEach(function (t) {
      var pnl = tradePnL(t);
      s.totalPnL += pnl;
      if (pnl > 0) { s.wins++; s.grossWin += pnl; }
      else if (pnl < 0) { s.losses++; s.grossLoss -= pnl; }
      else { s.breakeven++; }
    });
    s.winRate = s.total ? (s.wins / s.total) * 100 : 0;
    s.avgWin = s.wins ? s.grossWin / s.wins : 0;
    s.avgLoss = s.losses ? s.grossLoss / s.losses : 0;
    s.profitFactor = ratio(s.grossWin, s.grossLoss);
    s.payoff = ratio(s.avgWin, s.avgLoss);
    s.expectancy = s.total ? s.totalPnL / s.total : 0;
    s.maxDrawdown = maxDrawdown(closed);
    var st = streaks(closed);
    s.maxWinStreak = st.maxWin;
    s.maxLossStreak = st.maxLoss;
    s.sharpe = sharpe(closed);
    s.avgRR = avgRR(closed);
    return s;
  }

  // Profit factor / oran gösterimi: null → "∞"
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
    tradeTime: tradeTime,
    chronological: chronological,
    equityCurve: equityCurve,
    maxDrawdown: maxDrawdown,
    streaks: streaks,
    sharpe: sharpe,
    avgRR: avgRR,
    ratio: ratio,
    summarize: summarize,
    formatProfitFactor: formatProfitFactor
  };
})(typeof window !== 'undefined' ? window : this);
