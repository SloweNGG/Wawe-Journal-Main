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
    if (maxStop > 0 && startBal > maxStop) {
      var allowed = startBal - maxStop;
      meters += meter(t('prop.v2_max_loss'), Math.min(allowed, Math.max(0, startBal - balNow)), allowed,
        t('prop.stop_level') + ': ' + c.fmtPlain(maxStop) + '  |  ' + t('prop.v2_to_stop') + ': ' + c.fmtPlain(Math.max(0, c.maxDist)));
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

  /* Standard (non-prop) account card: monthly goal and four edge numbers.
     ctx holds ready-made strings so the page keeps its own formatting. */
  function renderStandard(c) {
    var esc = c.esc;
    var pct = Number(c.goalPct) || 0;
    var fill = Math.min(100, Math.max(0, pct));
    var goalCls = pct >= 100 ? 'passed' : '';
    var goalBtn =
      '<button type="button" id="standard-edit-goal-btn" class="pc2-btn" title="' + esc(c.goalBtnTitle) + '">' +
        '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>' +
        '<span>' + esc(c.goalBtnLabel) + '</span></button>';

    function stat(label, val, cls, sub) {
      return '<div class="pc2-stat"><span class="pc2-stat-label">' + esc(label) + '</span>' +
        '<span class="pc2-stat-val ' + cls + '">' + esc(val) + '</span>' +
        '<span class="pc2-stat-sub">' + esc(sub) + '</span></div>';
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
          stat(c.best.label, c.best.text, c.best.cls, c.best.sub) +
          stat(c.worst.label, c.worst.text, c.worst.cls, c.worst.sub) +
          stat(c.exp.label, c.exp.text, c.exp.cls, c.exp.sub) +
          stat(c.payoff.label, c.payoff.text, c.payoff.cls, c.payoff.sub) +
        '</div>' +
      '</div>';
  }

  window.WWPropCardV2 = { render: render, renderStandard: renderStandard };
})();
