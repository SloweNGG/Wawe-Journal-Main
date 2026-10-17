// ============================================================
// insights-engine.js - İçgörü hesapları (saf hesap; metin/HTML yok)
// ============================================================
// Her içgörü bir nesnedir:
//   { id, tone: 'good'|'warn'|'info', impact, value, n, data }
//   impact: "bunu yapmasaydın K/Z bu kadar daha iyi olurdu" (≥ 0, para). Uyarılar buna göre sıralanır.
//   value:  olumlu içgörülerde o dilimin getirdiği kâr (para).
//   n:      dayandığı işlem sayısı (örneklem).
//   idx:    uyarının kapsadığı işlemler (kronolojik sıradaki konumları) — çakışma ayıklaması için.
// Metinler chart-renderers.js'de i18n ile üretilir. Testler: tests/insights-engine.test.js
//
// Hesaplar ortak modülü kullanır (window.WwMetrics, window.WwTime): K/Z tanımı her yerde aynı.
// Gürültüyü önlemek için her kural en az örneklem ister ve yalnızca para kaybettiren
// (toplamı negatif) dilimler için "bunu yapma" der.
// ============================================================

export var MIN_INSIGHT_TRADES = 8;

// Davranış eşikleri
var DAY_TRADE_LIMIT = 3;        // günün 4. ve sonraki işlemleri "aşırı işlem"
var SIZE_UP_FACTOR = 1.2;       // kayıp sonrası lot en az %20 büyüdüyse "lot şişirme"
var OVERLAP_LIMIT = 0.5;        // daha etkili bir uyarıyla işlemlerinin yarısından fazlası ortaksa gösterilmez

function M() { return window.WwMetrics; }
function T() { return window.WwTime; }

function stats(pnls) {
  var n = pnls.length, sum = 0, wins = 0;
  pnls.forEach(function(v) { sum += v; if (v > 0) wins++; });
  return { n: n, sum: sum, wins: wins, wr: n ? (wins / n) * 100 : 0, avg: n ? sum / n : 0 };
}

function isLong(t) {
  var d = String(t.direction || '').toUpperCase();
  return d === 'LONG' || d === 'BUY';
}

// Kapanmış işlemler eskiden yeniye + K/Z'leri (tek geçişte)
function prepare(trades) {
  var closed = M().chronological(trades || []);
  return { closed: closed, pnls: closed.map(function(t) { return M().tradePnL(t); }) };
}

// Gruplar: { anahtar: { pnls: [...], idx: [işlem konumları] } }
function groupBy(closed, pnls, keyFn) {
  var g = {};
  closed.forEach(function(t, i) {
    var k = keyFn(t, i);
    if (k === null || k === undefined || k === '') return;
    g[k] = g[k] || { pnls: [], idx: [] };
    g[k].pnls.push(pnls[i]);
    g[k].idx.push(i);
  });
  return g;
}

// En kötü (toplamı en negatif) ve en iyi (toplamı en pozitif) grup
function extremes(groups, minN) {
  var best = null, worst = null;
  Object.keys(groups).forEach(function(k) {
    var s = stats(groups[k].pnls);
    if (s.n < minN) return;
    if (s.sum > 0 && (!best || s.sum > best.s.sum)) best = { k: k, s: s, idx: groups[k].idx };
    if (s.sum < 0 && (!worst || s.sum < worst.s.sum)) worst = { k: k, s: s, idx: groups[k].idx };
  });
  return { best: best, worst: worst };
}

// Konumlardan K/Z listesi
function pick(pnls, idx) { return idx.map(function(i) { return pnls[i]; }); }

// ⭐ İŞLEM İÇGÖRÜLERİ
export function analyzeTrades(trades) {
  var p = prepare(trades);
  var closed = p.closed, pnls = p.pnls;
  if (closed.length < MIN_INSIGHT_TRADES) return [];
  var all = stats(pnls);
  var out = [];

  // 1) Saat dilimleri (2 saatlik): en kârlı ve en çok kaybettiren
  var hours = extremes(groupBy(closed, pnls, function(t) {
    var h = T().hourOf(t.trade_date);
    return h === null ? null : Math.floor(h / 2) * 2;
  }), 3);
  if (hours.best) {
    out.push({ id: 'best_hour', tone: 'good', value: hours.best.s.sum, n: hours.best.s.n,
      data: { from: +hours.best.k, to: +hours.best.k + 2, wr: hours.best.s.wr } });
  }
  if (hours.worst) {
    out.push({ id: 'weak_hour', tone: 'warn', impact: -hours.worst.s.sum, n: hours.worst.s.n, idx: hours.worst.idx,
      data: { from: +hours.worst.k, to: +hours.worst.k + 2, wr: hours.worst.s.wr } });
  }

  // 2) Haftanın günü: zarar ettiren gün
  var dows = extremes(groupBy(closed, pnls, function(t) { return T().dowOf(t.trade_date); }), 4);
  if (dows.worst) {
    out.push({ id: 'weak_dow', tone: 'warn', impact: -dows.worst.s.sum, n: dows.worst.s.n, idx: dows.worst.idx,
      data: { dow: +dows.worst.k, wr: dows.worst.s.wr, overallWr: all.wr } });
  }

  // 3) Yön: bir taraf zarar, diğeri kâr ettiriyorsa
  var side = { long: [], short: [] };
  closed.forEach(function(t, i) { side[isLong(t) ? 'long' : 'short'].push(i); });
  var sl = stats(pick(pnls, side.long)), ss = stats(pick(pnls, side.short));
  [['long', sl, ss], ['short', ss, sl]].forEach(function(x) {
    if (x[1].n >= 5 && x[1].sum < 0 && x[2].sum > 0) {
      out.push({ id: 'weak_direction', tone: 'warn', impact: -x[1].sum, n: x[1].n, idx: side[x[0]],
        data: { side: x[0], wr: x[1].wr, otherWr: x[2].wr } });
    }
  });

  // 4) Sembol: en iyi ve zarar ettiren (en az 2 farklı sembol)
  var symGroups = groupBy(closed, pnls, function(t) { return String(t.symbol || '').trim().toUpperCase(); });
  if (Object.keys(symGroups).length >= 2) {
    var syms = extremes(symGroups, 3);
    if (syms.best) out.push({ id: 'best_symbol', tone: 'good', value: syms.best.s.sum, n: syms.best.s.n, data: { symbol: syms.best.k, wr: syms.best.s.wr } });
    if (syms.worst) out.push({ id: 'weak_symbol', tone: 'warn', impact: -syms.worst.s.sum, n: syms.worst.s.n, idx: syms.worst.idx, data: { symbol: syms.worst.k, wr: syms.worst.s.wr } });
  }

  // 5) Kazanç/kayıp oranı. Kayıp büyükse: ortalama kazancı aşan kayıplar o seviyede kesilseydi ne kazanılırdı
  var winP = pnls.filter(function(v) { return v > 0; }), lossP = pnls.filter(function(v) { return v < 0; });
  if (winP.length >= 3 && lossP.length >= 3) {
    var avgW = stats(winP).avg;
    var avgL = -stats(lossP).avg;
    if (avgL > avgW) {
      var bigIdx = [];
      pnls.forEach(function(v, i) { if (v < 0 && -v > avgW) bigIdx.push(i); });
      var saved = bigIdx.reduce(function(s, i) { return s + (-pnls[i] - avgW); }, 0);
      out.push({ id: 'payoff_low', tone: 'warn', impact: saved, n: bigIdx.length, idx: bigIdx, data: { avgWin: avgW, avgLoss: avgL } });
    } else {
      out.push({ id: 'payoff_high', tone: avgW / avgL >= 2 ? 'good' : 'info', n: pnls.length, data: { ratio: avgW / avgL, avgWin: avgW, avgLoss: avgL } });
    }
  }

  // 6) DAVRANIŞ — gün içi sıra gerektirir: saati olmayan işlemler dahil edilmez
  var days = {};
  closed.forEach(function(t, i) {
    if (T().hourOf(t.trade_date) === null) return;
    var k = M().dateKey(t);
    if (!k) return;
    (days[k] = days[k] || []).push({ i: i, pnl: pnls[i] });
  });
  var afterLoss = [], beyondLimit = [], firsts = [], rest = [], overDays = 0;
  Object.keys(days).forEach(function(k) {
    var list = days[k];
    if (list.length > DAY_TRADE_LIMIT) overDays++;
    list.forEach(function(x, j) {
      if (j === 0) firsts.push(x.i); else rest.push(x.i);
      if (j > 0 && list[j - 1].pnl < 0) afterLoss.push(x.i);
      if (j >= DAY_TRADE_LIMIT) beyondLimit.push(x.i);
    });
  });

  // 6a) Kayıptan hemen sonra (aynı gün) açılan işlemler — intikam işlemi
  var al = stats(pick(pnls, afterLoss));
  if (al.n >= 4 && al.sum < 0 && al.avg < all.avg) {
    out.push({ id: 'after_loss', tone: 'warn', impact: -al.sum, n: al.n, idx: afterLoss, data: { wr: al.wr, avg: al.avg, overallAvg: all.avg } });
  }

  // 6b) Aşırı işlem ve 6c) ilk işlemden sonra durmak (çakışırsa sıralamada ayıklanır)
  var bl = stats(pick(pnls, beyondLimit)), fs = stats(pick(pnls, firsts)), rs = stats(pick(pnls, rest));
  if (bl.n >= 4 && bl.sum < 0) {
    out.push({ id: 'overtrading', tone: 'warn', impact: -bl.sum, n: bl.n, idx: beyondLimit, data: { limit: DAY_TRADE_LIMIT, days: overDays } });
  }
  if (fs.n >= 4 && rs.n >= 4 && fs.sum > 0 && rs.sum < 0) {
    out.push({ id: 'stop_after_first', tone: 'warn', impact: -rs.sum, n: rs.n, idx: rest, data: { firstSum: fs.sum, firstWr: fs.wr, restSum: rs.sum, restWr: rs.wr } });
  }

  // 6d) Kayıptan sonra lotu büyütmek (gün sınırı yok; ardışık işlemler)
  var sizeUp = [];
  for (var i = 1; i < closed.length; i++) {
    var prevLot = M().toNum(closed[i - 1].lot), lot = M().toNum(closed[i].lot);
    if (pnls[i - 1] < 0 && prevLot > 0 && lot >= prevLot * SIZE_UP_FACTOR) sizeUp.push(i);
  }
  var su = stats(pick(pnls, sizeUp));
  if (su.n >= 3 && su.sum < 0) {
    out.push({ id: 'size_up', tone: 'warn', impact: -su.sum, n: su.n, idx: sizeUp, data: { wr: su.wr } });
  }

  // 7) Stop loss disiplini
  var withSl = [], noSl = [];
  closed.forEach(function(t, i) { (M().toNum(t.stop_loss) > 0 ? withSl : noSl).push(i); });
  var ws = stats(pick(pnls, withSl)), ns = stats(pick(pnls, noSl));
  var hasRR = closed.some(function(t) { return M().toNum(t.rr_ratio) > 0; });
  if (ws.n >= 4 && ns.n >= 4 && ns.sum < 0 && ns.avg < ws.avg) {
    out.push({ id: 'no_stop', tone: 'warn', impact: -ns.sum, n: ns.n, idx: noSl, data: { wr: ns.wr, withWr: ws.wr } });
  } else if (ws.n === 0 && !hasRR) {
    out.push({ id: 'no_sl_data', tone: 'info', n: closed.length, data: {} });
  }

  // 8) Son 10 işlemde form (en az 20 işlem, genelden 15+ puan fark)
  if (pnls.length >= 20) {
    var recent = stats(pnls.slice(-10));
    var diff = recent.wr - all.wr;
    if (Math.abs(diff) >= 15) {
      out.push({ id: diff > 0 ? 'form_up' : 'form_down', tone: diff > 0 ? 'good' : 'warn', n: 10, data: { wr: recent.wr, overallWr: all.wr } });
    }
  }

  // 9) Kârın tek güne yoğunlaşması / en iyi gün
  var byDay = {};
  closed.forEach(function(t, i) {
    var k = M().dateKey(t);
    if (!k) return;
    byDay[k] = byDay[k] || { sum: 0, n: 0 };
    byDay[k].sum += pnls[i];
    byDay[k].n++;
  });
  var dayKeys = Object.keys(byDay);
  var top = null;
  dayKeys.forEach(function(k) { if (!top || byDay[k].sum > byDay[top].sum) top = k; });
  if (top && byDay[top].sum > 0) {
    var share = all.sum > 0 ? byDay[top].sum / all.sum : 0;
    if (dayKeys.length >= 5 && share >= 0.4) {
      out.push({ id: 'concentration', tone: 'warn', n: byDay[top].n, data: { date: top, sum: byDay[top].sum, share: share } });
    } else {
      out.push({ id: 'best_day', tone: 'good', n: byDay[top].n, data: { date: top, sum: byDay[top].sum } });
    }
  }

  // 10) Temel: işlem başı ortalama K/Z (her zaman; listenin sonunda)
  out.push({ id: 'expectancy', tone: all.avg >= 0 ? 'good' : 'warn', n: all.n, data: { avg: all.avg, wr: all.wr } });

  return out;
}

// ⭐ PROP İÇGÖRÜLERİ — prop durumundan (window.__wwPropState) ve işlemlerden
export function analyzeProp(trades, s) {
  if (!s || !s.active || s.invalid) return [];
  var out = [];

  // Hedef temposu: işlem günü başına ortalama kazanç ile kalan hedef; minimum gün kuralı da hesaba katılır
  var target = s.target || {}, days = s.days || {};
  if (target.amount > 0 && target.remaining > 0 && days.count >= 1) {
    if (target.earned > 0) {
      var perDay = target.earned / days.count;
      var needed = Math.ceil(target.remaining / perDay);
      var minLeft = Math.max(0, (days.min || 0) - days.count);
      out.push({ id: 'prop_pace', tone: 'good', pinned: true, n: days.count,
        data: { days: Math.max(needed, minLeft), perDay: perDay, remaining: target.remaining, byMinDays: minLeft > needed } });
    } else if (days.count >= 2) {
      out.push({ id: 'prop_no_progress', tone: 'warn', pinned: true, n: days.count, data: { remaining: target.remaining, days: days.count } });
    }
  }

  // Gün toplamları (kayıplı günler ve en kötü gün)
  var p = prepare(trades);
  var byDay = {};
  p.closed.forEach(function(t, i) {
    var k = M().dateKey(t);
    if (k) byDay[k] = (byDay[k] || 0) + p.pnls[i];
  });
  var lossDays = Object.keys(byDay).map(function(k) { return byDay[k]; }).filter(function(v) { return v < 0; });
  var limit = (s.daily && s.daily.limit) || 0;
  var distance = (s.maxLoss && s.maxLoss.distance) || 0;

  if (lossDays.length) {
    var worst = Math.min.apply(null, lossDays);
    if (limit > 0 && -worst > limit) {
      // En kötü gün günlük limiti aşıyor (en acil)
      out.push({ id: 'prop_worst_over_daily', tone: 'warn', pinned: true, n: 1, data: { worst: worst, limit: limit } });
    } else if (distance > 0) {
      var left = distance + worst;
      out.push({ id: 'prop_worst_day', tone: (left <= 0 || (limit > 0 && left < limit)) ? 'warn' : 'info', pinned: left <= 0 || (limit > 0 && left < limit),
        n: 1, data: { worst: worst, left: left, distance: distance } });
    }
  }

  // Kayıplı günlerde günlük limitin ne kadarı harcanıyor
  if (limit > 0 && lossDays.length >= 2) {
    var avgLossDay = -lossDays.reduce(function(a, b) { return a + b; }, 0) / lossDays.length;
    var pct = (avgLossDay / limit) * 100;
    out.push({ id: 'prop_daily_burn', tone: pct >= 50 ? 'warn' : 'info', n: lossDays.length, data: { pct: pct, avgLossDay: avgLossDay, limit: limit } });
  }

  return out;
}

// ⭐ SIRALAMA
//   1) Prop uyarıları ve hedef temposu (sabit üstte)
//   2) Parasal etkisi olan uyarılar — etkiye göre büyükten küçüğe
//   3) Olumlu içgörüler — getirdiği kâra göre
//   4) Diğerleri (form, yoğunlaşma, oran, bilgi notları) eklenme sırasıyla
//   5) Temel beklenti en sonda
export function rankInsights(list) {
  function tier(x) {
    if (x.pinned) return 0;
    if (x.id === 'expectancy') return 5;
    if (x.impact > 0) return 1;
    if (x.value > 0) return 2;
    if (x.tone === 'info') return 4;
    return 3;
  }
  var sorted = list
    .map(function(x, i) { return { x: x, i: i, t: tier(x) }; })
    .sort(function(a, b) {
      if (a.t !== b.t) return a.t - b.t;
      if (a.t === 1) return b.x.impact - a.x.impact;
      if (a.t === 2) return b.x.value - a.x.value;
      return a.i - b.i;
    })
    .map(function(o) { return o.x; });
  return dropOverlapping(sorted);
}

// Aynı işlemleri farklı açılardan anlatan uyarılardan yalnızca en etkilisi kalır.
// (Ör. "ilk işlemden sonra dur", "kayıp sonrası işlem" ve "lot şişirme" çoğu zaman aynı
// işlemlerdir; hepsini göstermek aynı kaybı birkaç kez saymak olur.) Liste etkiye göre sıralı gelir.
// Ölçü: ortak işlem sayısı / küçük kümenin büyüklüğü — OVERLAP_LIMIT'i aşarsa küçük etkili olan düşer.
export function dropOverlapping(sorted) {
  var kept = [];
  return sorted.filter(function(x) {
    if (!(x.impact > 0) || !x.idx || !x.idx.length) return true;
    var set = {};
    x.idx.forEach(function(i) { set[i] = true; });
    var dup = kept.some(function(k) {
      var common = 0;
      k.idx.forEach(function(i) { if (set[i]) common++; });
      return common / Math.min(k.idx.length, x.idx.length) > OVERLAP_LIMIT;
    });
    if (!dup) kept.push(x);
    return !dup;
  });
}

// Panoda gösterilecek liste: prop + işlem içgörüleri, sıralı. İşlem sayısı azsa ve prop içgörüsü
// varsa "daha fazla işlem gerekiyor" notu eklenir (boş durum mesajı yerine).
export function buildInsightList(trades, propTrades, propState) {
  var tradeIns = analyzeTrades(trades);
  var propIns = analyzeProp(propTrades || trades, propState);
  var list = rankInsights(propIns.concat(tradeIns));
  if (!tradeIns.length && propIns.length) {
    var closedN = M().closedTrades(trades || []).length;
    list.push({ id: 'need_more', tone: 'info', n: closedN, data: { more: MIN_INSIGHT_TRADES - closedN } });
  }
  return list;
}
