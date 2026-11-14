// ============================================================
// WAWE JOURNAL - PROP CHALLENGE PASS PROBABILITY (MONTE CARLO)
// File: public/src/utils/prop-montecarlo.js  (byte-identical copy: supabase/functions/_shared/prop-montecarlo.js, kept equal
//       by tests/prop-montecarlo.test.js; the AI coach and the dashboard prop card use the same numbers)
// From the challenge's current state (PropCalculator.calculatePropStatus) the rest of the challenge is played many times with
// the trader's OWN results: every simulated day draws a number of trades from the trader's real trades-per-day and each trade
// from the trader's real closed trades (as a share of the starting balance). The day rules are the calculator's: daily loss
// on the running intraday result (base: starting or day-start balance), static or end-of-day trailing max loss (with the
// lock at the starting balance), profit target, min / max trading days and the consistency rule.
// Pure, deterministic (seeded): the same input gives the same answer.
// Assumption: once the target is reached the trader only places the minimum trades still needed for the minimum trading
// days (counted as passed). Each run is capped at the remaining max trading days, or 60 trading days without such a rule.
// ============================================================
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.PropMonteCarlo = api;
  if (typeof window !== 'undefined') window.PropMonteCarlo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MIN_TRADES = 20;
  var HORIZON_DAYS = 60;
  var RISK_SCALES = [0.5, 0.75, 1, 1.25];

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function num(v, d) { var n = Number(v); return v === null || v === undefined || v === '' || isNaN(n) ? d : n; }

  // trades: the journal's live closed trades { trade_date, pnl }; status: calculatePropStatus(...) for the account now
  // -> null when there is nothing to simulate, else { kind, runs, pass_pct, fail_pct, open_pct, ... }
  function simulate(params) {
    var account = params.account || {}, status = params.status, rules = account.rules || {};
    var runs = params.runs || 2000;
    if (!status || status.overall_status === 'invalid_rules' || !status.account) return null;
    if (status.overall_status === 'failed') return { kind: 'failed' };
    if (status.overall_status === 'passed') return { kind: 'passed' };

    var start = num(status.account.starting_balance, 0);
    if (!(start > 0)) return null;
    var closed = (params.trades || []).filter(function (t) { return t && t.trade_date && isFinite(Number(t.pnl)); });
    if (closed.length < MIN_TRADES) return { kind: 'not_enough_trades', trades: closed.length, needed: MIN_TRADES };

    // the trader's results as a share of the starting balance, and trades per trading day
    var returns = closed.map(function (t) { return Number(t.pnl) / start; });
    var perDay = {};
    closed.forEach(function (t) { var d = String(t.trade_date).slice(0, 10); perDay[d] = (perDay[d] || 0) + 1; });
    var dayCounts = Object.keys(perDay).map(function (k) { return perDay[k]; });

    var dailyPct = num(rules.daily_loss_limit_pct, 5), maxPct = num(rules.max_loss_limit_pct, 10);
    var dailyBase = rules.daily_loss_amount_base || 'initial_balance';
    var maxType = rules.max_loss_type || 'static';
    var trailing = maxType === 'eod_trailing' || maxType === 'trailing_eod';
    var trailLock = rules.max_loss_trail_lock || rules.trail_lock || 'none';
    var target = status.profit_target && status.profit_target.target_amount != null ? status.profit_target.target_amount : null;
    var minDays = status.trading_days && status.trading_days.min_required != null ? status.trading_days.min_required : 0;
    var maxDays = status.trading_days && status.trading_days.max_allowed != null ? status.trading_days.max_allowed : null;
    var cons = status.consistency && status.consistency.enabled ? Number(status.consistency.max_allowed_pct) : null;

    // where the challenge stands now
    var history = status.daily_history || [];
    var peak0 = start, best0 = 0, posSum0 = 0;
    history.forEach(function (d) { if (d.balance_eod > peak0) peak0 = d.balance_eod; if (d.pnl > 0) { posSum0 += d.pnl; if (d.pnl > best0) best0 = d.pnl; } });
    var bal0 = num(status.current_balance, start), days0 = history.length;
    var stop0 = status.max_loss && status.max_loss.hard_stop_level != null ? status.max_loss.hard_stop_level : start * (1 - maxPct / 100);
    var horizon = maxDays != null ? Math.max(0, maxDays - days0) : HORIZON_DAYS;
    var trailDist = start * (maxPct / 100);

    function one(rand, scale) {
      var bal = bal0, peak = peak0, stop = stop0, days = days0, best = best0, pos = posSum0;
      for (var d = 0; d < horizon; d++) {
        var reached = target !== null && bal - start >= target - 0.0001 && (cons === null || pos <= 0 || best / pos * 100 <= cons + 0.0001);
        if (reached) return { r: 'pass', days: d };   // the remaining minimum days are placed with minimal trades
        var n = dayCounts[Math.floor(rand() * dayCounts.length)];
        var dayStart = bal, dayLimit = (dailyBase === 'day_start_balance' ? dayStart : start) * (dailyPct / 100), dayPnl = 0;
        for (var i = 0; i < n; i++) {
          var p = returns[Math.floor(rand() * returns.length)] * start * scale;
          dayPnl += p; bal += p;
          if (dayPnl < -dayLimit - 0.0001) return { r: 'fail', why: 'daily', days: d + 1 };
          if (bal < stop - 0.0001) return { r: 'fail', why: 'max', days: d + 1 };
        }
        days++;
        if (dayPnl > 0) { pos += dayPnl; if (dayPnl > best) best = dayPnl; }
        if (bal > peak) peak = bal;
        if (trailing) {
          var cand = peak - trailDist;
          if (trailLock === 'at_starting_balance' && cand > start) cand = start;
          if (cand > stop) stop = cand;
          if (bal < stop - 0.0001) return { r: 'fail', why: 'max', days: d + 1 };
        }
        if (maxDays !== null && days > maxDays) return { r: 'fail', why: 'time', days: d + 1 };
      }
      var done = target !== null && bal - start >= target - 0.0001 && (cons === null || pos <= 0 || best / pos * 100 <= cons + 0.0001);
      return done ? { r: 'pass', days: horizon } : { r: 'open' };
    }

    function batch(scale) {
      var rand = mulberry32(hash(String(account.id || '') + ':' + closed.length + ':' + scale));
      var pass = 0, fail = 0, daily = 0, max = 0, time = 0, passDays = [];
      for (var k = 0; k < runs; k++) {
        var o = one(rand, scale);
        if (o.r === 'pass') { pass++; passDays.push(o.days); }
        else if (o.r === 'fail') { fail++; if (o.why === 'daily') daily++; else if (o.why === 'max') max++; else time++; }
      }
      passDays.sort(function (a, b) { return a - b; });
      return {
        risk_scale: scale, pass_pct: r2(pass / runs * 100), fail_pct: r2(fail / runs * 100), open_pct: r2((runs - pass - fail) / runs * 100),
        fail_daily_pct: r2(daily / runs * 100), fail_max_pct: r2(max / runs * 100), fail_time_pct: r2(time / runs * 100),
        median_days_to_pass: passDays.length ? passDays[passDays.length >> 1] : null,
      };
    }

    var base = batch(1);
    var scales = RISK_SCALES.map(function (s) { return s === 1 ? base : batch(s); });
    var best = scales.slice().sort(function (a, b) { return b.pass_pct - a.pass_pct || a.fail_pct - b.fail_pct; })[0];
    var avgLoss = returns.filter(function (x) { return x < 0; });
    return {
      kind: target === null ? 'survival' : 'challenge',
      runs: runs, horizon_days: horizon, sample_trades: closed.length,
      pass_pct: base.pass_pct, fail_pct: base.fail_pct, open_pct: base.open_pct,
      fail_daily_pct: base.fail_daily_pct, fail_max_pct: base.fail_max_pct, fail_time_pct: base.fail_time_pct,
      median_days_to_pass: base.median_days_to_pass,
      avg_loss_pct_of_balance: avgLoss.length ? r2(-avgLoss.reduce(function (s, x) { return s + x; }, 0) / avgLoss.length * 100) : null,
      by_risk: scales,
      best_risk_scale: best.risk_scale !== 1 && best.pass_pct >= base.pass_pct + 5 ? best.risk_scale : 1,
    };
  }

  return { simulate: simulate, MIN_TRADES: MIN_TRADES, RISK_SCALES: RISK_SCALES };
});
