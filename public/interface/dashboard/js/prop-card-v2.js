/* Prop account card v2.
   Pure renderer: window.WWPropCardV2.render(ctx) returns the card's inner HTML.
   dashboard.astro computes the numbers and passes them in, so this file can be
   tested with plain objects. Styles live in css/prop-card-v2.css.
   Layout: header, one big balance, one goal line, two risk bars, one footer. */
(function () {
  'use strict';

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function riskClass(p) { return p >= 0.9 ? 'bad' : (p >= 0.7 ? 'warn' : 'ok'); }

  function render(c) {
    var t = c.t, esc = c.esc;
    var startBal = Number(c.startBal) || 0;
    var balNow = Number(c.balNow);
    if (!isFinite(balNow)) balNow = startBal;
    var delta = balNow - startBal;
    var deltaPct = startBal > 0 ? (delta / startBal) * 100 : 0;
    var deltaCls = delta > 0 ? 'up' : (delta < 0 ? 'down' : 'flat');

    function signedPct(p) {
      var n = Number(p) || 0;
      var sign = n > 0 ? '+' : (n < 0 ? '-' : '');
      var num = Math.abs(n).toLocaleString(c.localeStr, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      return c.curLang === 'tr' ? sign + '%' + num : sign + num + '%';
    }

    /* header: firm, phase, notices, advance */
    var steps = '';
    var phaseCount = Math.max(1, Number(c.phaseCount) || 1);
    if (phaseCount > 1) {
      steps = '<span class="pc2-steps" aria-hidden="true">';
      for (var i = 0; i < phaseCount; i++) {
        steps += '<i class="' + (i < c.phaseIndex ? 'done' : (i === c.phaseIndex ? 'now' : '')) + '"></i>';
      }
      steps += '</span>';
    }
    var notices = c.warningsCount > 0
      ? '<button type="button" id="prop-card-notices-btn" class="prop-card-btn-notices pc2-notices" title="' + esc(c.noticesTitle) + '">' +
          '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
          '<span>' + c.warningsCount + '</span></button>'
      : '';
    var advance = c.showAdvance
      ? '<button type="button" id="prop-card-advance-btn" class="prop-card-btn-advance pc2-advance">' + esc(c.advanceLabel) + '</button>'
      : '';

    /* goal line: one status sentence, one percentage, one thin bar */
    var hasTarget = Number(c.targetAmount) > 0;
    var goalFill = hasTarget ? clamp01(Number(c.targetPct) / 100) * 100 : 0;
    var goal =
      '<div class="pc2-goal ' + esc(c.st) + '">' +
        '<div class="pc2-goal-top">' + c.statusIcon + '<span>' + esc(c.statusText) + '</span>' +
          (hasTarget ? '<b>' + esc(c.fmtPct(c.targetPct)) + '</b>' : '') + '</div>' +
        (hasTarget ? '<div class="pc2-bar"><span style="width:' + goalFill.toFixed(1) + '%"></span></div>' : '') +
      '</div>';

    /* risk bars: used / allowed. Detail goes into the tooltip. */
    function meter(label, used, allowed, tip) {
      var p = allowed > 0 ? used / allowed : 0;
      return '<div class="pc2-meter ' + riskClass(p) + '" role="progressbar" aria-label="' + esc(label) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(clamp01(p) * 100) + '" title="' + esc(tip) + '">' +
        '<div class="pc2-meter-top"><span>' + esc(label) + '</span><span class="pc2-meter-val"><b>' + esc(c.fmtPlain(used)) + '</b> / ' + esc(c.fmtPlain(allowed)) + '</span></div>' +
        '<div class="pc2-bar"><span style="width:' + (clamp01(p) * 100).toFixed(1) + '%"></span></div></div>';
    }

    var meters = '';
    var dailyLimit = Number(c.dailyLimit) || 0, dailyRem = Number(c.dailyRem) || 0;
    if (dailyLimit > 0) {
      var dUsed = Math.min(dailyLimit, Math.max(0, dailyLimit - dailyRem));
      meters += meter(t('prop.v2_daily_loss'), dUsed, dailyLimit,
        t('prop.today') + ': ' + c.fmtDelta(c.dailyToday) + '  |  ' + t('prop.v2_left') + ': ' + c.fmtPlain(Math.min(dailyLimit, Math.max(0, dailyRem))));
    }
    var maxStop = Number(c.maxStop) || 0;
    /* Max loss göstergesi: kullanılan = izin verilen - stop'a kalan mesafe.
       Statik hesapta start - balance ile aynıdır; trailing drawdown'da stop zirveyle birlikte yükseldiği için
       mesafe esas alınır (eskiden başlangıç bakiyesinden ölçülüyor, 104k bakiyede %0 gösteriyor ve stop
       başlangıcın üstüne çıkınca gösterge tamamen kayboluyordu). */
    var allowed = Number(c.maxAllowed) || 0;
    if (!(allowed > 0) && maxStop > 0 && startBal > maxStop) allowed = startBal - maxStop; // eski çağıranlar için
    if (allowed > 0) {
      var dist = Number(c.maxDist);
      var used = isFinite(dist) ? Math.min(allowed, Math.max(0, allowed - dist)) : 0;
      meters += meter(t('prop.v2_max_loss'), used, allowed,
        t('prop.stop_level') + ': ' + c.fmtPlain(maxStop) + '  |  ' + t('prop.v2_to_stop') + ': ' + c.fmtPlain(Math.max(0, dist || 0)));
    }

    /* footer: three small facts */
    var dayMin = Number(c.dayMin) || 0, dayCount = Number(c.dayCount) || 0;
    var foot =
      '<div class="pc2-foot">' +
        '<span class="pc2-chip' + (dayMin > 0 && dayCount >= dayMin ? ' done' : '') + '"><em>' + esc(t('prop.day')) + '</em> ' + dayCount + (dayMin > 0 ? ' / ' + dayMin : '') + '</span>' +
        '<span class="pc2-chip"><em>' + esc(t('prop.win_rate')) + '</em> ' + esc(c.fmtPct(c.wrPct)) + '</span>' +
        '<span class="pc2-chip"><em>' + esc(c.tradesLabel) + '</em> ' + (Number(c.totalTrades) || 0) + '</span>' +
      '</div>';

    return '' +
      '<div class="pc2">' +
        '<div class="pc2-head">' +
          '<div class="pc2-title"><span class="pc2-firm">' + esc(c.firmName) + '</span>' +
            '<span class="pc2-phase">' + steps + '<span>' + esc(c.phaseName) + '</span></span></div>' +
          '<div class="pc2-actions">' + notices + advance + '</div>' +
        '</div>' +
        '<div class="pc2-balance"><span class="pc2-balance-num">' + esc(c.fmtPlain(balNow)) + '</span>' +
          '<span class="pc2-delta ' + deltaCls + '">' + esc(c.fmtDelta(delta)) + ' <i>' + esc(signedPct(deltaPct)) + '</i></span></div>' +
        goal +
        (meters ? '<div class="pc2-meters">' + meters + '</div>' : '') +
        foot +
      '</div>';
  }

  /* Sparklines for the standard card, drawn from trade P&Ls oldest first.
     Long histories are grouped into at most SPARK_MAX buckets. */
  var SPARK_W = 104, SPARK_H = 36, SPARK_PAD = 3, SPARK_MAX = 60, SPARK_MIN_TRADES = 5, SPARK_BAR_MAX = 7;

  function buckets(n, max) {
    var size = Math.max(1, Math.ceil(n / max)), out = [];
    for (var s = 0; s < n; s += size) out.push([s, Math.min(n, s + size)]);
    return out;
  }

  // Expectancy (average P&L) and payoff ratio after each trade.
  // Payoff stays null until there is at least one win and one loss.
  function runningEdge(pnls) {
    var sum = 0, win = 0, wn = 0, loss = 0, ln = 0, exp = [], payoff = [];
    pnls.forEach(function (p, i) {
      sum += p;
      if (p > 0) { win += p; wn++; } else if (p < 0) { loss -= p; ln++; }
      exp.push(sum / (i + 1));
      payoff.push(wn && ln ? (win / wn) / (loss / ln) : null);
    });
    return { exp: exp, payoff: payoff };
  }

  function sparkOpen(cls, label) {
    return '<svg class="pc2-spark ' + cls + '" viewBox="0 0 ' + SPARK_W + ' ' + SPARK_H + '" role="img" aria-label="' + label + '">';
  }

  // Best box: one bar per winning trade, standing up. Worst box: one per losing
  // trade, hanging down. The biggest one is highlighted. Heights use a square root
  // so one huge trade does not flatten the rest; exact values are in the tooltips.
  // Few bars stay narrow and sit at the right edge (the most recent trade).
  function sparkBars(pnls, pick, s) {
    var esc = s.esc, up = pick === 'max', pts = [];
    pnls.forEach(function (p, i) { if (up ? p > 0 : p < 0) pts.push({ i: i, p: p, v: Math.abs(p) }); });
    if (!pts.length) return '';

    var peak = Math.max.apply(null, pts.map(function (q) { return q.v; }));
    var target = -1;
    pts.forEach(function (q, k) { if (target < 0 && q.v === peak) target = k; });
    var span = SPARK_H - 2 * SPARK_PAD;
    function h(v) { return Math.max(1.5, Math.sqrt(v / peak) * span); }
    var groups = buckets(pts.length, SPARK_MAX);
    var bw = Math.min(SPARK_BAR_MAX, SPARK_W / groups.length);
    var left = SPARK_W - bw * groups.length;
    var gap = bw >= 4 ? 1.5 : (bw >= 2 ? 1 : 0);
    var out = '', hiOut = '';

    groups.forEach(function (g, i) {
      var part = pts.slice(g[0], g[1]);
      var big = part[0];
      part.forEach(function (q) { if (q.v > big.v) big = q; });
      var isTarget = target >= g[0] && target < g[1];
      var w = bw - gap, x = left + i * bw + gap / 2;
      if (isTarget && w < 2) { x -= (2 - w) / 2; w = 2; }
      var bh = h(big.v);
      var title = part.length === 1
        ? s.tradeLabel + ' ' + (big.i + 1) + ': ' + s.fmtMoney(big.p)
        : s.tradeLabel + ' ' + (part[0].i + 1) + '–' + (part[part.length - 1].i + 1) + ': ' + s.fmtMoney(big.p);
      var cell = '<g class="pt"><title>' + esc(title) + '</title>' +
        '<rect class="hit" x="' + (left + i * bw).toFixed(2) + '" y="0" width="' + bw.toFixed(2) + '" height="' + SPARK_H + '"/>' +
        '<rect class="bar ' + (up ? 'up' : 'down') + (isTarget ? ' hi' : '') + '" x="' + x.toFixed(2) +
          '" y="' + (up ? SPARK_H - SPARK_PAD - bh : SPARK_PAD).toFixed(2) +
          '" width="' + w.toFixed(2) + '" height="' + bh.toFixed(2) + '" rx="1"/></g>';
      // drawn last so a widened highlight sits above its neighbours
      if (isTarget) hiOut = cell; else out += cell;
    });

    return out + hiOut;
  }

  // Line through a running series; null values before it is defined are skipped.
  function sparkLine(values, fmt, zero, id, s) {
    var esc = s.esc, pts = [];
    values.forEach(function (v, i) { if (v !== null && isFinite(v)) pts.push({ i: i, v: v }); });
    if (pts.length < 2) return '';
    pts = buckets(pts.length, SPARK_MAX).map(function (g) { return pts[g[1] - 1]; });
    if (pts.length < 2) return '';

    var vals = pts.map(function (p) { return p.v; });
    var max = Math.max.apply(null, vals), min = Math.min.apply(null, vals);
    var showZero = zero && max > 0 && min < 0;
    var range = (max - min) || 1;
    var span = SPARK_H - 2 * SPARK_PAD;
    var step = (SPARK_W - 2 * SPARK_PAD) / (pts.length - 1);
    function x(k) { return SPARK_PAD + k * step; }
    function y(v) { return SPARK_PAD + (max - v) / range * span; }

    var d = pts.map(function (p, k) { return (k ? 'L' : 'M') + x(k).toFixed(2) + ' ' + y(p.v).toFixed(2); }).join('');
    var last = pts.length - 1;
    var gid = 'pc2-fade-' + id;
    var out = '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="currentColor" stop-opacity="0.24"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/>' +
      '</linearGradient></defs>' +
      '<path class="area" fill="url(#' + gid + ')" d="' + d + 'L' + x(last).toFixed(2) + ' ' + SPARK_H + 'L' + x(0).toFixed(2) + ' ' + SPARK_H + 'Z"/>';
    if (showZero) out += '<line class="zero" x1="0" x2="' + SPARK_W + '" y1="' + y(0).toFixed(2) + '" y2="' + y(0).toFixed(2) + '"/>';
    out += '<path class="line" d="' + d + '"/>';
    out += '<circle class="dot" cx="' + x(last).toFixed(2) + '" cy="' + y(pts[last].v).toFixed(2) + '" r="2.5"/>';
    pts.forEach(function (p, k) {
      out += '<g class="pt"><title>' + esc(s.tradeLabel + ' ' + (p.i + 1) + ': ' + fmt(p.v)) + '</title>' +
        '<rect class="hit" x="' + (x(k) - step / 2).toFixed(2) + '" y="0" width="' + step.toFixed(2) + '" height="' + SPARK_H + '"/>' +
        '<circle class="mk" cx="' + x(k).toFixed(2) + '" cy="' + y(p.v).toFixed(2) + '" r="3"/></g>';
    });
    return out;
  }

  // Sparkline SVG for one stat box, or '' when there is too little history.
  function statSpark(kind, cls, label, s) {
    if (!s || !s.pnls || s.pnls.length < SPARK_MIN_TRADES) return '';
    var body;
    if (kind === 'best') body = sparkBars(s.pnls, 'max', s);
    else if (kind === 'worst') body = sparkBars(s.pnls, 'min', s);
    else {
      var edge = runningEdge(s.pnls);
      body = kind === 'exp'
        ? sparkLine(edge.exp, s.fmtMoney, true, kind, s)
        : sparkLine(edge.payoff, s.fmtRatio, false, kind, s);
    }
    if (!body) return '';
    return sparkOpen((kind === 'best' || kind === 'worst') ? 'bars' : cls, s.esc(label)) + body + '</svg>';
  }

  /* Standard (non-prop) account card: monthly goal and four edge numbers.
     ctx holds ready-made strings so the page keeps its own formatting.
     ctx.spark (optional): { pnls, fmtMoney, fmtRatio, tradeLabel } for the sparklines. */
  function renderStandard(c) {
    var esc = c.esc;
    var spark = c.spark ? Object.assign({ esc: esc }, c.spark) : null;
    var pct = Number(c.goalPct) || 0;
    var fill = Math.min(100, Math.max(0, pct));
    var goalCls = pct >= 100 ? 'passed' : '';
    var goalBtn =
      '<button type="button" id="standard-edit-goal-btn" class="pc2-btn" title="' + esc(c.goalBtnTitle) + '">' +
        '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>' +
        '<span>' + esc(c.goalBtnLabel) + '</span></button>';

    function stat(kind, label, val, cls, sub) {
      return '<div class="pc2-stat"><span class="pc2-stat-label">' + esc(label) + '</span>' +
        '<span class="pc2-stat-val ' + cls + '">' + esc(val) + '</span>' +
        '<span class="pc2-stat-sub">' + esc(sub) + '</span>' +
        statSpark(kind, cls, label, spark) + '</div>';
    }

    return '' +
      '<div class="pc2">' +
        '<div class="pc2-head"><div class="pc2-title"><span class="pc2-firm">' + esc(c.title) + '</span></div>' +
          '<div class="pc2-actions">' + goalBtn + '</div></div>' +
        '<div class="pc2-goal ' + goalCls + '">' +
          '<div class="pc2-goal-meta"><span>' + esc(c.goalLabel) + '</span><b class="' + (pct > 0 ? 'on' : '') + '">' + esc(c.goalPctText) + '</b></div>' +
          '<div class="pc2-goal-figures"><span class="pc2-balance-num">' + esc(c.pnlText) + '</span><span class="pc2-delta">/ ' + esc(c.targetText) + '</span></div>' +
          '<div class="pc2-bar"><span style="width:' + fill.toFixed(1) + '%"></span></div>' +
        '</div>' +
        '<div class="pc2-stats">' +
          stat('best', c.best.label, c.best.text, c.best.cls, c.best.sub) +
          stat('worst', c.worst.label, c.worst.text, c.worst.cls, c.worst.sub) +
          stat('exp', c.exp.label, c.exp.text, c.exp.cls, c.exp.sub) +
          stat('payoff', c.payoff.label, c.payoff.text, c.payoff.cls, c.payoff.sub) +
        '</div>' +
      '</div>';
  }

  window.WWPropCardV2 = { render: render, renderStandard: renderStandard, runningEdge: runningEdge };
})();
