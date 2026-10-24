// Backtest v2: statistics tab (window.WwBtStats). The numbers come from WwMetrics (net P&L, win rate, profit factor, expectancy,
// equity curve) on the account's closed trades; the backtest-only parts (equity with open positions, drawdown, monthly returns,
// R multiples, sessions) are computed here. Pure functions are unit tested; render() needs the DOM and LightweightCharts.
// Free plan: the key figures and the balance curve. Premium: everything.
(function (global) {
  'use strict';

  function M() { return global.WwMetrics; }
  var R_BINS = [[-Infinity, -2], [-2, -1], [-1, 0], [0, 1], [1, 2], [2, 3], [3, Infinity]];

  // trades: [{ entryT, exitT, net (cents), comm, riskCents|null, dir }], closed only. Rows for WwMetrics (USD, ISO exit time).
  function metricRows(trades) {
    return trades.map(function (t) { return { exit_price: 1, pnl: t.net / 100, trade_date: new Date(t.exitT * 1000).toISOString(), rr_ratio: t.rr == null ? null : t.rr }; });
  }
  // key figures (free): net P&L, win rate, profit factor, trade count; plus expectancy and drawdown for Premium
  function kpis(trades, startCents) {
    var s = M().summarize(metricRows(trades)), rs = trades.filter(function (t) { return t.riskCents > 0; });
    var avgR = rs.length ? rs.reduce(function (a, t) { return a + t.net / t.riskCents; }, 0) / rs.length : null;
    var dd = maxDrawdown(balanceSeries(trades, startCents, 0));
    return { net: s.totalPnL, winRate: s.winRate, profitFactor: s.profitFactor, count: s.total, wins: s.wins, losses: s.losses,
      expectancy: s.expectancy, expectancyR: avgR, avgWin: s.avgWin, avgLoss: s.avgLoss, maxDd: dd.amount, maxDdPct: dd.pct };
  }
  // balance after every closed trade (WwMetrics.equityCurve, chronological), in USD; one point per second (LWC needs unique times)
  function balanceSeries(trades, startCents, firstT) {
    var curve = M().equityCurve(metricRows(trades)), out = [], start = startCents / 100;
    if (firstT) out.push({ time: firstT, value: start });
    curve.forEach(function (p) {
      var t = Math.round(Date.parse(p.trade.trade_date) / 1000), v = Math.round((start + p.equity) * 100) / 100;
      if (out.length && out[out.length - 1].time >= t) out[out.length - 1].value = v;     // same second: the later balance
      else out.push({ time: t, value: v });
    });
    return out;
  }
  // Equity (balance + open P&L) at the close of every chart candle. `floatCents(trade, closePts)` prices one open trade at a
  // candle close (the page passes the engine's close-fill rule). Trades: closed ones and the still open ones (exitT null).
  function equitySeries(trades, open, candles, startCents, floatCents) {
    var all = trades.concat(open).slice().sort(function (a, b) { return a.entryT - b.entryT; });
    var closed = trades.slice().sort(function (a, b) { return a.exitT - b.exitT; });
    var out = [], ci = 0, realized = 0;
    for (var i = 0; i < candles.length; i++) {
      var c = candles[i], end = c.time + (c.span || 0);
      while (ci < closed.length && closed[ci].exitT <= end) realized += closed[ci++].net;
      var fl = 0;
      for (var k = 0; k < all.length && all[k].entryT <= end; k++) {
        var t = all[k];
        if (t.exitT != null && t.exitT <= end) continue;
        fl += floatCents(t, c.close);
      }
      out.push({ time: c.time, value: Math.round(startCents + realized + fl) / 100 });
    }
    return out;
  }
  // drawdown from the running peak, in percent (<= 0)
  function drawdownSeries(series) {
    var peak = -Infinity;
    return series.map(function (p) { if (p.value > peak) peak = p.value; return { time: p.time, value: peak > 0 ? Math.round((p.value - peak) / peak * 10000) / 100 : 0 }; });
  }
  function maxDrawdown(series) {
    var peak = -Infinity, worst = 0, pct = 0;
    series.forEach(function (p) { if (p.value > peak) peak = p.value; var d = peak - p.value; if (d > worst) { worst = d; pct = peak > 0 ? d / peak * 100 : 0; } });
    return { amount: worst, pct: pct };
  }
  // monthly returns: P&L of the trades closed in the month / balance at the start of that month. monthOf(sec) -> 'YYYY-MM'.
  function monthly(trades, startCents, monthOf) {
    var sorted = trades.slice().sort(function (a, b) { return a.exitT - b.exitT; }), bal = startCents, cells = {}, years = [];
    sorted.forEach(function (t) {
      var key = monthOf(t.exitT), y = key.slice(0, 4), m = +key.slice(5, 7);
      if (!cells[y]) { cells[y] = {}; years.push(y); }
      var c = cells[y][m] || (cells[y][m] = { pnl: 0, base: bal, trades: 0 });
      c.pnl += t.net; c.trades++; bal += t.net;
    });
    var totals = {};
    years.forEach(function (y) {
      var p = 0, base = null;
      for (var m = 1; m <= 12; m++) { var c = cells[y][m]; if (c) { c.ret = c.base > 0 ? c.pnl / c.base * 100 : 0; p += c.pnl; if (base === null) base = c.base; } }
      totals[y] = { pnl: p, ret: base > 0 ? p / base * 100 : 0 };
    });
    return { years: years, cells: cells, totals: totals };
  }
  // R multiples (net P&L / initial risk). Trades opened without a stop loss have no R and are counted apart.
  function rDistribution(trades) {
    var bins = R_BINS.map(function (b) { return { from: b[0], to: b[1], count: 0 }; }), skipped = 0, sum = 0, n = 0;
    trades.forEach(function (t) {
      if (!(t.riskCents > 0)) { skipped++; return; }
      var r = t.net / t.riskCents; sum += r; n++;
      for (var i = 0; i < bins.length; i++) if (r >= bins[i].from && r < bins[i].to) { bins[i].count++; break; }
    });
    return { bins: bins, skipped: skipped, count: n, avg: n ? sum / n : null };
  }
  // win rate by the session(s) open at the entry time (a trade in the London / New York overlap counts for both)
  function sessionStats(trades, sessionsAt) {
    var ids = ['asia', 'london', 'ny', 'off'], acc = {};
    ids.forEach(function (id) { acc[id] = { id: id, trades: 0, wins: 0, pnl: 0 }; });
    trades.forEach(function (t) {
      var ss = sessionsAt(t.entryT); if (!ss.length) ss = ['off'];
      ss.forEach(function (id) { var a = acc[id]; if (!a) return; a.trades++; if (t.net > 0) a.wins++; a.pnl += t.net; });
    });
    return ids.map(function (id) { var a = acc[id]; a.winRate = a.trades ? a.wins / a.trades * 100 : null; return a; });
  }

  // ---------------------------------------------------------------- render (browser)
  // opts: { box, t, pro, fmtUsd(cents, signed), fmtPct(n), monthNames[], upgrade(), data: { trades, open, candles, startCents,
  //         floatCents, monthOf, sessionsAt, firstT }, colors (WwChart.colors()), lwc (WwChart.lwc) }
  function createView() {
    var charts = [];
    function destroy() { charts.forEach(function (c) { try { c.remove(); } catch (e) { /* removed with the page */ } }); charts = []; }
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function card(box, title, wide) { var c = el('section', 'bt-st-card' + (wide ? ' bt-st-wide' : '')); c.appendChild(el('h4', 'bt-st-h', title)); box.appendChild(c); return c; }
    function lineChart(host, series, opts, kind) {
      var c = global.LightweightCharts.createChart(host, opts.lwc({
        autoSize: true, rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
        timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false }, handleScroll: false, handleScale: false,
        localization: { locale: opts.locale, priceFormatter: kind === 'pct' ? function (v) { return v.toFixed(1) + '%'; } : function (v) { return opts.fmtUsd(Math.round(v * 100)); } }
      }));
      charts.push(c);
      series.forEach(function (s) {
        var api = s.area ? c.addAreaSeries({ lineColor: s.color, topColor: s.top, bottomColor: s.bottom, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, invertFilledArea: !!s.invert })
          : c.addLineSeries({ color: s.color, lineWidth: s.width || 2, lineStyle: s.dashed ? 2 : 0, priceLineVisible: false, lastValueVisible: true });
        api.setData(s.data);
      });
      c.timeScale().fitContent();
      return c;
    }
    function render(opts) {
      destroy();
      var box = opts.box, t = opts.t, d = opts.data, C = opts.colors;
      box.textContent = '';
      box.onclick = function (e) { if (!opts.pro && e.target.closest('[data-pro]')) opts.upgrade(); };
      var k = kpis(d.trades, d.startCents);
      // key figures
      var row = el('div', 'bt-st-kpis');
      function kpi(label, value, cls, pro) {
        var e = el('div', 'bt-st-kpi' + (pro && !opts.pro ? ' bt-st-locked' : ''));
        var l = el('span', 'bt-st-label', label); if (pro && !opts.pro) { var tg = el('span', 'bt-pro', 'PRO'); l.appendChild(tg); }
        e.appendChild(l); e.appendChild(el('span', 'bt-num bt-st-value ' + (cls || ''), pro && !opts.pro ? '—' : value));
        if (pro && !opts.pro) e.setAttribute('data-pro', '1');
        row.appendChild(e);
      }
      var pf = M().formatProfitFactor(k.profitFactor);
      kpi(t('backtest.st.net', 'Net K/Z'), opts.fmtUsd(Math.round(k.net * 100), true), k.net > 0 ? 'bt-up' : k.net < 0 ? 'bt-down' : '');
      kpi(t('backtest.st.win_rate', 'Kazanma oranı'), k.count ? k.winRate.toFixed(1) + '%' : '—');
      kpi(t('backtest.st.profit_factor', 'Profit factor'), k.count ? pf : '—');
      kpi(t('backtest.st.trades', 'İşlem sayısı'), String(k.count) + (k.count ? ' (' + k.wins + '/' + k.losses + ')' : ''));
      kpi(t('backtest.st.expectancy', 'Beklenen değer'), k.count ? opts.fmtUsd(Math.round(k.expectancy * 100), true) + (k.expectancyR == null ? '' : ' · ' + (k.expectancyR >= 0 ? '+' : '') + k.expectancyR.toFixed(2) + 'R') : '—', k.expectancy > 0 ? 'bt-up' : k.expectancy < 0 ? 'bt-down' : '', true);
      kpi(t('backtest.st.max_dd', 'Maks. düşüş'), k.count ? opts.fmtUsd(Math.round(k.maxDd * 100)) + ' (' + k.maxDdPct.toFixed(2) + '%)' : '—', '', true);
      box.appendChild(row);
      var grid = el('div', 'bt-st-grid'); box.appendChild(grid);
      var bal = balanceSeries(d.trades, d.startCents, d.firstT);
      if (!opts.pro) {
        var c1 = card(grid, t('backtest.st.balance_curve', 'Bakiye eğrisi'), true), h1 = el('div', 'bt-st-chart'); c1.appendChild(h1);
        if (bal.length >= 2) lineChart(h1, [{ data: bal, color: C.up, area: true, top: hexA(C.up, 0.25), bottom: hexA(C.up, 0) }], opts);
        else h1.appendChild(el('p', 'bt-hint bt-st-empty', t('backtest.st.need_trades', 'Grafik için kapanmış işlem gerekiyor.')));
        // the Premium sections as one teaser card
        var lock = el('section', 'bt-st-card bt-st-wide bt-st-teaser'); lock.setAttribute('data-pro', '1');
        var hh = el('h4', 'bt-st-h', t('backtest.st.more', 'Gelişmiş analiz')); hh.appendChild(el('span', 'bt-pro', 'PRO')); lock.appendChild(hh);
        lock.appendChild(el('p', 'bt-hint', t('backtest.st.more_desc', 'Varlık eğrisi (açık pozisyonlarla), drawdown grafiği, aylık getiri ısı haritası, R dağılımı, seanslara göre kazanma oranı ve beklenen değer Premium\'da.')));
        var up = el('button', 'btn btn-primary', t('backtest.st.upgrade', 'Premium\'a geç')); up.type = 'button'; lock.appendChild(up);
        grid.appendChild(lock);
        return;
      }
      // Premium: balance + equity, drawdown
      var eq = equitySeries(d.trades, d.open, d.candles, d.startCents, d.floatCents);
      var c2 = card(grid, t('backtest.st.equity_curve', 'Bakiye ve varlık eğrisi'), true), h2 = el('div', 'bt-st-chart'); c2.appendChild(h2);
      var leg = el('p', 'bt-st-legend');
      leg.appendChild(swatch(C.up)); leg.appendChild(document.createTextNode(t('backtest.st.balance', 'Bakiye') + '  '));
      leg.appendChild(swatch('#38bdf8')); leg.appendChild(document.createTextNode(t('backtest.st.equity', 'Varlık (açık pozisyonlar dahil)')));
      c2.insertBefore(leg, h2);
      if (eq.length >= 2 || bal.length >= 2) {
        lineChart(h2, [{ data: eq, color: '#38bdf8', width: 1.5 }].concat(bal.length >= 2 ? [{ data: stepTo(bal, eq, d.candles.length ? d.candles[0].span : 0), color: C.up, width: 2 }] : []), opts);
      } else h2.appendChild(el('p', 'bt-hint bt-st-empty', t('backtest.st.need_trades', 'Grafik için kapanmış işlem gerekiyor.')));
      var dd = drawdownSeries(eq.length ? eq : bal);
      var c3 = card(grid, t('backtest.st.drawdown', 'Drawdown (zirveden düşüş, %)'), false), h3 = el('div', 'bt-st-chart'); c3.appendChild(h3);
      if (dd.length >= 2) lineChart(h3, [{ data: dd, color: C.down, area: true, top: hexA(C.down, 0), bottom: hexA(C.down, 0.3), invert: true }], opts, 'pct');
      else h3.appendChild(el('p', 'bt-hint bt-st-empty', t('backtest.st.need_trades', 'Grafik için kapanmış işlem gerekiyor.')));
      // R distribution
      var rd = rDistribution(d.trades), c4 = card(grid, t('backtest.st.r_dist', 'R dağılımı'), false);
      var maxC = Math.max.apply(null, rd.bins.map(function (b) { return b.count; }).concat([1]));
      var bars = el('div', 'bt-st-bars');
      rd.bins.forEach(function (b) {
        var lab = b.from === -Infinity ? '< ' + b.to + 'R' : b.to === Infinity ? '≥ ' + b.from + 'R' : b.from + '…' + b.to + 'R';
        var col = el('div', 'bt-st-bar'), fill = el('span', 'bt-st-fill ' + (b.to <= 0 ? 'bt-st-neg' : 'bt-st-pos'));
        fill.style.height = Math.round(b.count / maxC * 100) + '%'; fill.title = lab + ': ' + b.count;
        col.appendChild(el('span', 'bt-num bt-st-count', String(b.count))); col.appendChild(fill); col.appendChild(el('span', 'bt-st-blabel', lab));
        bars.appendChild(col);
      });
      c4.appendChild(bars);
      c4.appendChild(el('p', 'bt-hint', (rd.avg == null ? '' : t('backtest.st.avg_r', 'Ortalama {r}R', { r: (rd.avg >= 0 ? '+' : '') + rd.avg.toFixed(2) }) + ' · ') +
        t('backtest.st.no_sl', 'Zarar durdursuz {n} işlem R hesabına girmez.', { n: rd.skipped })));
      // sessions
      var ss = sessionStats(d.trades, d.sessionsAt), c5 = card(grid, t('backtest.st.sessions', 'Seanslara göre kazanma oranı (giriş saati)'), false);
      var tb = el('div', 'bt-st-sess');
      ss.forEach(function (x) {
        var r = el('div', 'bt-st-srow');
        r.appendChild(el('span', 'bt-st-sname', t('backtest.st.session_' + x.id, x.id)));
        var track = el('span', 'bt-st-track'), f = el('span', 'bt-st-sfill'); f.style.width = (x.winRate == null ? 0 : x.winRate) + '%'; track.appendChild(f); r.appendChild(track);
        r.appendChild(el('span', 'bt-num bt-st-sval', x.winRate == null ? '—' : x.winRate.toFixed(0) + '%'));
        r.appendChild(el('span', 'bt-num bt-st-smeta ' + (x.pnl > 0 ? 'bt-up' : x.pnl < 0 ? 'bt-down' : ''), x.trades + ' · ' + opts.fmtUsd(x.pnl, true)));
        tb.appendChild(r);
      });
      c5.appendChild(tb);
      // monthly heatmap
      var mo = monthly(d.trades, d.startCents, d.monthOf), c6 = card(grid, t('backtest.st.monthly', 'Aylık getiri (%)'), true);
      if (!mo.years.length) c6.appendChild(el('p', 'bt-hint bt-st-empty', t('backtest.st.need_trades', 'Grafik için kapanmış işlem gerekiyor.')));
      else {
        var wrap = el('div', 'bt-st-heat-wrap'), tbl = el('table', 'bt-st-heat'), thead = el('tr');
        thead.appendChild(el('th', '', ''));
        opts.monthNames.forEach(function (n) { thead.appendChild(el('th', '', n)); });
        thead.appendChild(el('th', '', t('backtest.st.year', 'Yıl')));
        tbl.appendChild(thead);
        var maxAbs = 0.5;
        mo.years.forEach(function (y) { for (var m = 1; m <= 12; m++) { var c = mo.cells[y][m]; if (c) maxAbs = Math.max(maxAbs, Math.abs(c.ret)); } });
        mo.years.forEach(function (y) {
          var tr = el('tr'); tr.appendChild(el('th', 'bt-num', y));
          for (var m = 1; m <= 12; m++) {
            var c = mo.cells[y][m], td = el('td', 'bt-num');
            if (c) { td.textContent = (c.ret >= 0 ? '+' : '') + c.ret.toFixed(1); td.style.background = hexA(c.ret >= 0 ? C.up : C.down, 0.12 + 0.55 * Math.min(1, Math.abs(c.ret) / maxAbs)); td.title = c.trades + ' · ' + opts.fmtUsd(c.pnl, true); }
            tr.appendChild(td);
          }
          var tot = mo.totals[y], tt = el('td', 'bt-num bt-st-total ' + (tot.ret > 0 ? 'bt-up' : tot.ret < 0 ? 'bt-down' : ''), (tot.ret >= 0 ? '+' : '') + tot.ret.toFixed(1));
          tr.appendChild(tt); tbl.appendChild(tr);
        });
        wrap.appendChild(tbl); c6.appendChild(wrap);
      }
    }
    function swatch(c) { var s = el('i', 'bt-st-sw'); s.style.background = c; return s; }
    return { render: render, destroy: destroy };
  }
  // the balance as a step line on the equity times (so both lines share the time axis); a candle shows the balance at its END
  // (span = candle length), like the equity next to it
  function stepTo(bal, eq, span) {
    if (!eq.length) return bal;
    var out = [], j = 0, cur = bal.length ? bal[0].value : 0;
    eq.forEach(function (p) { while (j < bal.length && bal[j].time <= p.time + (span || 0)) cur = bal[j++].value; out.push({ time: p.time, value: cur }); });
    return out;
  }
  function hexA(c, a) {
    var m = /^#([0-9a-f]{6})$/i.exec(c || ''); if (!m) return c;
    return 'rgba(' + parseInt(m[1].slice(0, 2), 16) + ',' + parseInt(m[1].slice(2, 4), 16) + ',' + parseInt(m[1].slice(4, 6), 16) + ',' + a + ')';
  }

  global.WwBtStats = {
    R_BINS: R_BINS, metricRows: metricRows, kpis: kpis, balanceSeries: balanceSeries, equitySeries: equitySeries, drawdownSeries: drawdownSeries,
    maxDrawdown: maxDrawdown, monthly: monthly, rDistribution: rDistribution, sessionStats: sessionStats, stepTo: stepTo, createView: createView
  };
})(typeof window !== 'undefined' ? window : globalThis);
