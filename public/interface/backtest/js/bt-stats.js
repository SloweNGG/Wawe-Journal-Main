// Backtest v2: statistics tab (window.WwBtStats). The numbers come from WwMetrics (net P&L, win rate, profit factor, expectancy,
// equity curve) on the account's closed trades; the backtest-only parts (equity with open positions, drawdown, monthly returns,
// R multiples, sessions) are computed here. Pure functions are unit tested; render() needs the DOM and LightweightCharts.
// Free plan: the key figures and the balance curve. Premium: everything. Each card is a widget (move, resize, hide, enlarge); the
// arrangement is stored by the page (bt-desk.js layout).
// Order: trades count in the order they were OPENED (seq), not by market time: the replay can go back in time (account sections),
// so the balance, the drawdown and the streaks follow the trade sequence; the balance curve's axis is the trade number.
(function (global) {
  'use strict';

  function M() { return global.WwMetrics; }
  var R_BINS = [[-Infinity, -2], [-2, -1], [-1, 0], [0, 1], [1, 2], [2, 3], [3, Infinity]];
  var R_FEW = 5;                       // fewer R trades than this: the R figures are marked as unreliable
  // the trade-number axis: trade n sits at n * SEQ_STEP seconds (3 minutes), so the chart's tick weights rank the trade numbers
  // #120 > #60 > #20 > #10 > #5 (12 h, 3 h, hour, half hour, 5 min): a narrow chart shows #20, #40 ..., a wide one #10, #20 ...
  var SEQ_STEP = 180;

  // trades: [{ seq, entryT, exitT, net (cents), comm, riskCents|null, dir, section }], closed only.
  function bySeq(a, b) { return ((a.seq || 0) - (b.seq || 0)) || (a.entryT - b.entryT); }
  function ordered(trades) { return trades.slice().sort(bySeq); }
  // Rows for WwMetrics (USD). trade_date is the position in the opening order (WwMetrics orders by it), not a market time.
  var SEQ_BASE = Date.UTC(2000, 0, 1);
  function metricRows(trades) {
    return ordered(trades).map(function (t, i) { return { exit_price: 1, pnl: t.net / 100, trade_date: new Date(SEQ_BASE + (i + 1) * 60000).toISOString(), rr_ratio: t.rr == null ? null : t.rr, _n: i + 1 }; });
  }
  // key figures (free): net P&L, win rate, profit factor, trade count; plus expectancy and drawdown for Premium
  function kpis(trades, startCents) {
    var s = M().summarize(metricRows(trades)), rs = trades.filter(function (t) { return t.riskCents > 0; });
    var avgR = rs.length ? rs.reduce(function (a, t) { return a + t.net / t.riskCents; }, 0) / rs.length : null;
    var dd = maxDrawdown(balanceSeries(trades, startCents));
    return { net: s.totalPnL, winRate: s.winRate, profitFactor: s.profitFactor, count: s.total, wins: s.wins, losses: s.losses,
      expectancy: s.expectancy, expectancyR: avgR, rCount: rs.length, avgWin: s.avgWin, avgLoss: s.avgLoss, maxDd: dd.amount, maxDdPct: dd.pct };
  }
  // balance after every closed trade in the opening order (WwMetrics.equityCurve), in USD. time = trade number (0 = start),
  // the chart labels it "#n".
  function balanceSeries(trades, startCents) {
    var curve = M().equityCurve(metricRows(trades)), start = startCents / 100, out = [{ time: 0, value: start }];
    curve.forEach(function (p) { out.push({ time: p.trade._n, value: Math.round((start + p.equity) * 100) / 100 }); });
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
  // monthly returns by the market month of the exit: P&L of those trades / the balance before the first of them (opening order).
  // monthOf(sec) -> 'YYYY-MM'.
  function monthly(trades, startCents, monthOf) {
    var sorted = ordered(trades), bal = startCents, cells = {}, years = [];
    sorted.forEach(function (t) {
      var key = monthOf(t.exitT), y = key.slice(0, 4), m = +key.slice(5, 7);
      if (!cells[y]) { cells[y] = {}; years.push(y); }
      var c = cells[y][m] || (cells[y][m] = { pnl: 0, base: bal, trades: 0 });
      c.pnl += t.net; c.trades++; bal += t.net;
    });
    var totals = {};
    years.sort();
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

  // ---------------------------------------------------------------- widgets (pure layout model)
  // Every card of the tab is a widget: id, default width in quarters of the row (w 1..4) and height in px (0 = its content).
  // free: shown on the free plan; pro: Premium only; chart: has a "enlarge" button (WwChartViewer).
  var WIDGETS = [
    { id: 'kpis', w: 4, h: 0, free: true },
    { id: 'balance', w: 4, h: 240, free: true, chart: true },
    { id: 'teaser', w: 4, h: 0, free: true, freeOnly: true },
    { id: 'drawdown', w: 2, h: 240, pro: true, chart: true },
    { id: 'rdist', w: 2, h: 240, pro: true, chart: true },
    { id: 'equity', w: 4, h: 240, pro: true, chart: true },
    { id: 'sessions', w: 2, h: 220, pro: true, chart: true },
    { id: 'monthly', w: 4, h: 0, pro: true, chart: true }
  ];
  var W_BY = {}; WIDGETS.forEach(function (w) { W_BY[w.id] = w; });
  var H_MIN = 140, H_MAX = 760;
  function widgetIds(pro) { return WIDGETS.filter(function (w) { return pro ? !w.freeOnly : w.free; }).map(function (w) { return w.id; }); }
  // { order: [ids], hidden: [ids], size: { id: { w, h } } } with every known widget once (new ones at their default place)
  function normalizeWidgets(l) {
    l = l && typeof l === 'object' ? l : {};
    var order = (Array.isArray(l.order) ? l.order : []).filter(function (id, i, a) { return W_BY[id] && a.indexOf(id) === i; });
    WIDGETS.forEach(function (w, i) {
      if (order.indexOf(w.id) >= 0) return;
      var prev = null; for (var k = i - 1; k >= 0; k--) if (order.indexOf(WIDGETS[k].id) >= 0) { prev = WIDGETS[k].id; break; }
      order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, w.id);
    });
    var hidden = (Array.isArray(l.hidden) ? l.hidden : []).filter(function (id, i, a) { return W_BY[id] && a.indexOf(id) === i; });
    var size = {};
    WIDGETS.forEach(function (w) {
      var s = l.size && l.size[w.id], ww = s ? Math.round(Number(s.w)) : w.w, hh = s ? Math.round(Number(s.h)) : w.h;
      size[w.id] = { w: ww >= 1 && ww <= 4 ? ww : w.w, h: hh === 0 ? 0 : (isFinite(hh) ? Math.max(H_MIN, Math.min(H_MAX, hh)) : w.h) };
    });
    return { order: order, hidden: hidden, size: size };
  }
  // columns of the widget grid for a width (px): 4 on a wide panel, 2, 1 on a phone
  function columnsFor(width) { return width >= 900 ? 4 : width >= 520 ? 2 : 1; }
  function spanFor(w, cols) { return Math.max(1, Math.min(cols, Math.round(w * cols / 4))); }

  // ---------------------------------------------------------------- render (browser)
  // opts: { box, t, pro, fmtUsd(cents, signed), monthNames[], upgrade(), data: { trades, open, candles, startCents, floatCents, monthOf,
  //         sessionsAt, section, sectionTrades, sectionStartCents }, colors (WwChart.colors()), lwc (WwChart.lwc),
  //         layout (widget layout, normalizeWidgets), onLayout(layout), drag (true: widgets can be moved and resized) }
  //   trades: every closed trade (key figures, balance by trade number, R, sessions, months); sectionTrades/open/candles: the
  //   current section for the equity curve in market time, starting at sectionStartCents.
  function createView() {
    var charts = [], sortable = null, ro = null, last = null, fits = [];
    function destroy() {
      charts.forEach(function (c) { try { c.remove(); } catch (e) { /* removed with the page */ } }); charts = [];
      fits.forEach(function (o) { o.disconnect(); }); fits = [];
      if (sortable) { try { sortable.destroy(); } catch (e) { /* ignore */ } sortable = null; }
      if (ro) { ro.disconnect(); ro = null; }
    }
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    // axis: 'time' (market time) or 'seq' (trade number: "#n", 0 = start); `own` charts are the viewer's (not destroyed here)
    function lineChart(host, series, opts, kind, axis, own) {
      var seq = axis === 'seq';
      var seqLabel = function (t) { var n = Math.round(t / SEQ_STEP); return n === 0 ? opts.t('backtest.st.start', 'Başlangıç') : '#' + n; };
      var c = global.LightweightCharts.createChart(host, opts.lwc({
        autoSize: true, rightPriceScale: { borderVisible: false, entireTextOnly: true, scaleMargins: { top: 0.12, bottom: 0.08 } },
        timeScale: seq ? { borderVisible: false, timeVisible: false, tickMarkFormatter: seqLabel, fixLeftEdge: true, fixRightEdge: true, rightOffset: 0 }
          : { borderVisible: false, timeVisible: true, secondsVisible: false },
        handleScroll: false, handleScale: false,
        localization: Object.assign({ locale: opts.locale, priceFormatter: kind === 'pct' ? function (v) { return v.toFixed(1) + '%'; } : function (v) { return opts.fmtUsd(Math.round(v * 100)); } },
          axis === 'seq' ? { timeFormatter: seqLabel } : {})
      }));
      if (!own) charts.push(c);
      series.forEach(function (s) {
        var api = s.area ? c.addAreaSeries({ lineColor: s.color, topColor: s.top, bottomColor: s.bottom, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, invertFilledArea: !!s.invert })
          : c.addLineSeries({ color: s.color, lineWidth: s.width || 2, lineStyle: s.dashed ? 2 : 0, priceLineVisible: false, lastValueVisible: true });
        api.setData(seq ? s.data.map(function (p) { return { time: p.time * SEQ_STEP, value: p.value }; }) : s.data);
      });
      c.timeScale().fitContent();
      // the widget may get its real width after the chart (hidden window, new layout): fit again on every size change, so the
      // curve always uses the whole width (it stayed squeezed at the right edge)
      if (global.ResizeObserver) {
        var fr = 0, o = new global.ResizeObserver(function () {
          cancelAnimationFrame(fr);
          fr = requestAnimationFrame(function () { if (!host.isConnected) { o.disconnect(); return; } try { c.timeScale().fitContent(); } catch (e) { o.disconnect(); } });
        });
        o.observe(host); fits.push(o);
      }
      return c;
    }
    function empty(host, text) { host.appendChild(el('p', 'bt-hint bt-st-empty', text)); return null; }
    // widget bodies: build(id, host, opts, own) -> a Lightweight chart, or null
    function build(id, host, opts, own) {
      var t = opts.t, d = opts.data, C = opts.colors, k = kpis(d.trades, d.startCents), bal = balanceSeries(d.trades, d.startCents);
      function chartHost() { var h = el('div', 'bt-st-chart'); host.appendChild(h); return h; }
      if (id === 'kpis') {
        var row = el('div', 'bt-st-kpis');
        var kpi = function (label, value, cls, pro) {
          var e = el('div', 'bt-st-kpi' + (pro && !opts.pro ? ' bt-st-locked' : ''));
          var l = el('span', 'bt-st-label', label); if (pro && !opts.pro) l.appendChild(el('span', 'bt-pro', 'PRO'));
          e.appendChild(l); e.appendChild(el('span', 'bt-num bt-st-value ' + (cls || ''), pro && !opts.pro ? '—' : value));
          if (pro && !opts.pro) e.setAttribute('data-pro', '1');
          row.appendChild(e);
        };
        var pf = M().formatProfitFactor(k.profitFactor);
        kpi(t('backtest.st.net', 'Net K/Z'), opts.fmtUsd(Math.round(k.net * 100), true), k.net > 0 ? 'bt-up' : k.net < 0 ? 'bt-down' : '');
        kpi(t('backtest.st.win_rate', 'Kazanma oranı'), k.count ? k.winRate.toFixed(1) + '%' : '—');
        kpi(t('backtest.st.profit_factor', 'Profit factor'), k.count ? pf : '—');
        kpi(t('backtest.st.trades', 'İşlem sayısı'), String(k.count) + (k.count ? ' (' + k.wins + '/' + k.losses + ')' : ''));
        kpi(t('backtest.st.expectancy', 'Beklenen değer'), k.count ? opts.fmtUsd(Math.round(k.expectancy * 100), true) : '—', k.expectancy > 0 ? 'bt-up' : k.expectancy < 0 ? 'bt-down' : '', true);
        if (k.count && opts.pro) {
          var ev = row.lastChild, sub = el('span', 'bt-st-sub');
          sub.appendChild(el('span', '', t('backtest.st.per_trade_usd', 'Tüm {n} işlem', { n: k.count })));
          var rl = el('span', 'bt-num ' + (k.expectancyR > 0 ? 'bt-up' : k.expectancyR < 0 ? 'bt-down' : ''),
            k.rCount ? t('backtest.st.expectancy_r', 'R: {r} · {n}/{total} işlem (stop loss\'lu)', { r: (k.expectancyR >= 0 ? '+' : '') + k.expectancyR.toFixed(2) + 'R', n: k.rCount, total: k.count })
              : t('backtest.st.r_none', 'R: — (stop loss ile açılan işlem yok)'));
          sub.appendChild(rl);
          if (k.rCount && k.rCount < R_FEW) sub.appendChild(el('span', 'bt-st-warn', t('backtest.st.r_few_short', 'R verisi az; güvenilir değil.')));
          ev.appendChild(sub);
        }
        kpi(t('backtest.st.max_dd', 'Maks. düşüş'), k.count ? opts.fmtUsd(Math.round(k.maxDd * 100)) + ' (' + k.maxDdPct.toFixed(2) + '%)' : '—', '', true);
        host.appendChild(row);
        return null;
      }
      if (id === 'balance') {
        var h1 = chartHost();
        return bal.length >= 2 ? lineChart(h1, [{ data: bal, color: C.up, area: true, top: hexA(C.up, 0.25), bottom: hexA(C.up, 0) }], opts, 'usd', 'seq', own)
          : empty(h1, t('backtest.st.need_trades', 'Grafik için kapanmış işlem gerekiyor.'));
      }
      if (id === 'teaser') {
        host.setAttribute('data-pro', '1');
        host.appendChild(el('p', 'bt-hint', t('backtest.st.more_desc', 'Varlık eğrisi (açık pozisyonlarla), drawdown grafiği, aylık getiri ısı haritası, R dağılımı, seanslara göre kazanma oranı ve beklenen değer Premium\'da.')));
        var up = el('button', 'btn btn-primary', t('backtest.st.upgrade', 'Premium\'a geç')); up.type = 'button'; host.appendChild(up);
        return null;
      }
      if (id === 'drawdown') {
        var dd = drawdownSeries(bal), h3 = chartHost();
        return dd.length >= 2 ? lineChart(h3, [{ data: dd, color: C.down, area: true, top: hexA(C.down, 0), bottom: hexA(C.down, 0.3), invert: true }], opts, 'pct', 'seq', own)
          : empty(h3, t('backtest.st.need_trades', 'Grafik için kapanmış işlem gerekiyor.'));
      }
      if (id === 'rdist') {
        var rd = rDistribution(d.trades), total = rd.count + rd.skipped;
        host.appendChild(el('p', 'bt-hint bt-st-rnote', t('backtest.st.r_count', 'R hesaplanan işlem: {n} / {total} (açılışta stop loss olan işlemler)', { n: rd.count, total: total })));
        if (!rd.count) return empty(host, t('backtest.st.r_empty', 'R hesaplanacak işlem yok. R = kâr/zarar ÷ ilk risk; ilk risk, işlem açılırken konan stop loss\'tan gelir.'));
        if (rd.count < R_FEW) host.appendChild(el('p', 'bt-st-warn', t('backtest.st.r_few', 'R verisi az ({n} işlem): dağılım ve ortalama güvenilir değil. İşlemleri stop loss ile açarsan R hesaplanır.', { n: rd.count })));
        var maxC = Math.max.apply(null, rd.bins.map(function (b) { return b.count; }).concat([1])), bars = el('div', 'bt-st-bars');
        rd.bins.forEach(function (b) {
          var lab = b.from === -Infinity ? '< ' + b.to + 'R' : b.to === Infinity ? '≥ ' + b.from + 'R' : b.from + '…' + b.to + 'R';
          var col = el('div', 'bt-st-bar'), fill = el('span', 'bt-st-fill ' + (b.to <= 0 ? 'bt-st-neg' : 'bt-st-pos'));
          fill.style.height = Math.round(b.count / maxC * 100) + '%'; fill.title = lab + ': ' + b.count;
          col.appendChild(el('span', 'bt-num bt-st-count', String(b.count))); col.appendChild(fill); col.appendChild(el('span', 'bt-st-blabel', lab));
          bars.appendChild(col);
        });
        host.appendChild(bars);
        host.appendChild(el('p', 'bt-hint', t('backtest.st.avg_r', 'Ortalama {r}R', { r: (rd.avg >= 0 ? '+' : '') + rd.avg.toFixed(2) }) + ' · ' +
          t('backtest.st.no_sl', 'Zarar durdursuz {n} işlem R hesabına girmez.', { n: rd.skipped })));
        return null;
      }
      if (id === 'equity') {
        var eq = equitySeries(d.sectionTrades || d.trades, d.open, d.candles, d.sectionStartCents == null ? d.startCents : d.sectionStartCents, d.floatCents), h2 = chartHost();
        return eq.length >= 2 ? lineChart(h2, [{ data: eq, color: '#38bdf8', width: 1.5 }], opts, 'usd', 'time', own)
          : empty(h2, t('backtest.st.need_trades_section', 'Bu bölümde henüz işlem yok.'));
      }
      if (id === 'sessions') {
        var ss = sessionStats(d.trades, d.sessionsAt), tb = el('div', 'bt-st-sess');
        ss.forEach(function (x) {
          var r = el('div', 'bt-st-srow');
          r.appendChild(el('span', 'bt-st-sname', t('backtest.st.session_' + x.id, x.id)));
          var track = el('span', 'bt-st-track'), f = el('span', 'bt-st-sfill'); f.style.width = (x.winRate == null ? 0 : x.winRate) + '%'; track.appendChild(f); r.appendChild(track);
          r.appendChild(el('span', 'bt-num bt-st-sval', x.winRate == null ? '—' : x.winRate.toFixed(0) + '%'));
          r.appendChild(el('span', 'bt-num bt-st-smeta ' + (x.pnl > 0 ? 'bt-up' : x.pnl < 0 ? 'bt-down' : ''), x.trades + ' · ' + opts.fmtUsd(x.pnl, true)));
          tb.appendChild(r);
        });
        host.appendChild(tb);
        return null;
      }
      if (id === 'monthly') {
        var mo = monthly(d.trades, d.startCents, d.monthOf);
        if (!mo.years.length) return empty(host, t('backtest.st.need_trades', 'Grafik için kapanmış işlem gerekiyor.'));
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
          var tot = mo.totals[y];
          tr.appendChild(el('td', 'bt-num bt-st-total ' + (tot.ret > 0 ? 'bt-up' : tot.ret < 0 ? 'bt-down' : ''), (tot.ret >= 0 ? '+' : '') + tot.ret.toFixed(1)));
          tbl.appendChild(tr);
        });
        wrap.appendChild(tbl); host.appendChild(wrap);
        return null;
      }
      return null;
    }
    function title(id, opts) {
      var t = opts.t;
      switch (id) {
        case 'kpis': return t('backtest.st.w_kpis', 'Temel rakamlar');
        case 'balance': return t('backtest.st.balance_curve_seq', 'Bakiye eğrisi (işlem sırasıyla)');
        case 'teaser': return t('backtest.st.more', 'Gelişmiş analiz');
        case 'drawdown': return t('backtest.st.drawdown', 'Drawdown (zirveden düşüş, %)');
        case 'rdist': return t('backtest.st.r_dist', 'R dağılımı');
        case 'equity': return t('backtest.st.equity_section', 'Varlık eğrisi · bölüm {n} (açık pozisyonlar dahil)', { n: opts.data.section || 1 });
        case 'sessions': return t('backtest.st.sessions', 'Seanslara göre kazanma oranı (giriş saati)');
        case 'monthly': return t('backtest.st.monthly', 'Aylık getiri (%)');
      }
      return id;
    }
    function iconBtn(cls, icon, label, attrs) {
      var b = el('button', 'bt-pbox-btn ' + cls); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label);
      var i = el('i'); i.setAttribute('data-lucide', icon); i.setAttribute('aria-hidden', 'true'); b.appendChild(i);
      Object.keys(attrs || {}).forEach(function (k) { b.setAttribute(k, attrs[k]); });
      return b;
    }
    // the enlarged chart (WwChartViewer): every visible chart widget, previous / next
    function expand(id, opts, list) {
      var V = global.WwChartViewer; if (!V) return;
      var items = list.map(function (x) { return { key: x, title: title(x, opts) }; });
      V.open({ items: items, index: Math.max(0, list.indexOf(id)), render: function (host, item) {
        host.classList.add('bt-st-viewer');
        var c = build(item.key, host, opts, true);
        if (c) return c;
        return { resize: function () {}, destroy: function () { host.textContent = ''; } };
      } });
    }
    function render(opts) {
      destroy();
      last = opts;
      var box = opts.box, lay = normalizeWidgets(opts.layout), ids = widgetIds(opts.pro);
      box.textContent = '';
      box.onclick = function (e) {
        if (!opts.pro && e.target.closest('[data-pro]') && !e.target.closest('.bt-st-whead')) return opts.upgrade();
        var b = e.target.closest('[data-w-act]'); if (!b) return;
        var w = b.closest('[data-w]').getAttribute('data-w'), act = b.getAttribute('data-w-act');
        if (act === 'hide') { lay.hidden.push(w); opts.layout = lay; if (opts.onLayout) opts.onLayout(lay); render(opts); }
        else if (act === 'expand') expand(w, opts, lay.order.filter(function (x) { return ids.indexOf(x) >= 0 && lay.hidden.indexOf(x) < 0 && W_BY[x].chart; }));
      };
      var grid = el('div', 'bt-st-widgets'); box.appendChild(grid);
      var cols = columnsFor(box.clientWidth || 1000);
      grid.style.setProperty('--bt-st-cols', cols);
      lay.order.forEach(function (id) {
        if (ids.indexOf(id) < 0 || lay.hidden.indexOf(id) >= 0) return;
        var def = W_BY[id], sz = lay.size[id];
        var w = el('section', 'bt-st-w' + (id === 'teaser' ? ' bt-st-teaser' : '') + (def.pro ? ' bt-st-pro' : ''));
        w.setAttribute('data-w', id); w.setAttribute('data-wspan', sz.w);
        w.style.gridColumn = 'span ' + spanFor(sz.w, cols);
        if (sz.h) { w.style.height = sz.h + 'px'; w.classList.add('bt-st-fixed'); }
        var head = el('div', 'bt-st-whead');
        if (opts.drag) head.appendChild(iconBtn('bt-st-grip', 'grip-vertical', opts.t('backtest.st.w_move', 'Widget\'ı taşı (sürükle)')));
        var h4 = el('h4', 'bt-st-h', title(id, opts)); if (id === 'teaser') h4.appendChild(el('span', 'bt-pro', 'PRO'));
        head.appendChild(h4);
        if (def.chart) head.appendChild(iconBtn('', 'maximize-2', opts.t('backtest.st.w_expand', 'Büyüt'), { 'data-w-act': 'expand' }));
        head.appendChild(iconBtn('', 'eye-off', opts.t('backtest.st.w_hide', 'Gizle'), { 'data-w-act': 'hide' }));
        w.appendChild(head);
        var body = el('div', 'bt-st-wbody'); w.appendChild(body);
        build(id, body, opts, false);
        if (opts.drag) { var rz = el('span', 'bt-st-rsz'); rz.title = opts.t('backtest.st.w_resize', 'Boyutlandır (sürükle)'); rz.setAttribute('aria-hidden', 'true'); w.appendChild(rz); }
        grid.appendChild(w);
      });
      if (!grid.children.length) grid.appendChild(el('p', 'bt-hint', opts.t('backtest.st.w_none', 'Tüm widget\'lar gizli. «Widget\'lar» menüsünden geri açabilirsin.')));
      if (global.lucide) try { global.lucide.createIcons(); } catch (e) { /* optional */ }
      // reorder like the Premium dashboard (SortableJS, handle, ghost, animation); pointer fallback so touch and mouse behave the same
      if (opts.drag && global.Sortable) {
        sortable = new global.Sortable(grid, { animation: 300, handle: '.bt-st-grip', ghostClass: 'sortable-ghost', draggable: '.bt-st-w', forceFallback: true, fallbackOnBody: true,
          onEnd: function () {
            var shown = Array.prototype.map.call(grid.querySelectorAll('.bt-st-w'), function (x) { return x.getAttribute('data-w'); });
            var rest = lay.order.filter(function (x) { return shown.indexOf(x) < 0; });
            lay.order = shown.concat(rest); opts.layout = lay;
            if (opts.onLayout) opts.onLayout(lay);
          } });
      }
      // capture phase: the corner must not reach SortableJS (it would take the press as the start of a move)
      if (opts.drag) grid.addEventListener('pointerdown', function (e) { var r = e.target.closest('.bt-st-rsz'); if (r) startResize(e, r.parentNode, lay, opts, grid); }, true);
      // fewer columns on a narrow panel: re-render when the column count changes
      if (global.ResizeObserver) {
        var raf = 0;
        ro = new global.ResizeObserver(function () {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(function () { var c = columnsFor(box.clientWidth || 1000); if (c !== cols && box.isConnected && last) render(last); });
        });
        ro.observe(box);
      }
    }
    // corner handle: width in columns (snaps), height in 10 px steps; the charts follow by themselves (autoSize)
    function startResize(e, w, lay, opts, grid) {
      e.preventDefault(); e.stopPropagation();
      var id = w.getAttribute('data-w'), r = w.getBoundingClientRect(), cols = columnsFor(opts.box.clientWidth || 1000), gap = 12;
      var colW = (grid.clientWidth - gap * (cols - 1)) / cols, x0 = e.clientX, y0 = e.clientY, h0 = r.height, s0 = spanFor(lay.size[id].w, cols);
      w.classList.add('bt-st-resizing');
      function move(ev) {
        var span = Math.max(1, Math.min(cols, Math.round((r.width + ev.clientX - x0 + gap) / (colW + gap))));
        var h = Math.max(H_MIN, Math.min(H_MAX, Math.round((h0 + ev.clientY - y0) / 10) * 10));
        w.style.gridColumn = 'span ' + span; w.style.height = h + 'px'; w.classList.add('bt-st-fixed');
        lay.size[id] = { w: Math.max(1, Math.min(4, Math.round(span * 4 / cols))), h: h };
        void s0;
      }
      function up() {
        document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
        w.classList.remove('bt-st-resizing'); opts.layout = lay;
        if (opts.onLayout) opts.onLayout(lay);
      }
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
    }
    return { render: render, destroy: destroy, charts: function () { return charts; } };
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
    R_BINS: R_BINS, bySeq: bySeq, metricRows: metricRows, kpis: kpis, balanceSeries: balanceSeries, equitySeries: equitySeries, drawdownSeries: drawdownSeries,
    maxDrawdown: maxDrawdown, R_FEW: R_FEW, SEQ_STEP: SEQ_STEP, monthly: monthly, rDistribution: rDistribution, sessionStats: sessionStats, stepTo: stepTo, createView: createView,
    WIDGETS: WIDGETS, widgetIds: widgetIds, normalizeWidgets: normalizeWidgets, columnsFor: columnsFor, spanFor: spanFor
  };
})(typeof window !== 'undefined' ? window : globalThis);
