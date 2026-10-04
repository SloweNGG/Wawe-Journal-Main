// ============================================================
// WAWE JOURNAL - PROP FIRM CALCULATOR ENGINE
// File: public/src/utils/prop-calculator.js
// Description: Pure, UI-independent calculation engine for
//              evaluating prop account rules, drawdown,
//              daily limits, consistency, and targets.
// Format: Pure Vanilla JS / UMD (Loads via classic <script> in browser and vm in tests)
// ============================================================

(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof root !== 'undefined') {
    root.PropCalculator = api;
  }
  if (typeof window !== 'undefined') {
    window.PropCalculator = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Checks if a date string has an explicit time component.
   * Format handling:
   * - 'YYYY-MM-DD' -> false
   * - 'YYYY-MM-DDT00:00:00+00:00', 'YYYY-MM-DDT00:00:00.000Z', 'YYYY-MM-DD 00:00:00' -> false (exact midnight UTC is treated as date-only)
   * - 'YYYY-MM-DDTHH:mm:ss+00:00' or 'YYYY-MM-DD HH:mm:ss' (non-midnight) -> true (timed trade)
   */
  function hasTimeComponent(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return false;
    var str = dateStr.trim();

    // Pure date 'YYYY-MM-DD'
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return false;
    }

    // Exact midnight timestamps (e.g. 00:00:00, 00:00:00.000Z, 00:00:00+00:00)
    // These represent date-only data stored in Postgres or imported without clock time.
    var midnightMatch = /^\d{4}-\d{2}-\d{2}[T\s]00:00(?::00(?:\.0+)?)?(?:Z|[+-]00:?00)?$/.test(str);
    if (midnightMatch) {
      return false;
    }

    // Check if it contains an actual non-midnight time component
    return /[T\s]\d{1,2}:\d{2}/.test(str);
  }

  /**
   * Parses a date/time string reliably into milliseconds UTC.
   */
  function parseTradeDateTime(dateStr) {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return dateStr.getTime();
    if (typeof dateStr !== 'string') return null;

    var str = dateStr.trim();

    // If already standard ISO with Z or offset:
    if (str.includes('T') && (str.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(str))) {
      var ms = Date.parse(str);
      if (!isNaN(ms)) return ms;
    }

    // Handle "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss" without offset as UTC
    var match = str.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?/);
    if (match) {
      return Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +(match[6] || 0), +(match[7] ? match[7].slice(0, 3) : 0));
    }

    var parsed = Date.parse(str);
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * Formats a millisecond timestamp to 'YYYY-MM-DD' in specified IANA timezone.
   */
  function formatYMDInTz(ms, timeZone) {
    if (!timeZone) {
      throw new Error('MISSING_RESET_TZ: Timezone is required for date calculation.');
    }
    var formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(new Date(ms));
  }

  /**
   * Computes the prop trading day ('YYYY-MM-DD') for a trade.
   * CRITICAL RULE:
   * If trade_date does NOT have a time component (pure date or midnight UTC),
   * time_shift_hours is NOT applied; the date is preserved directly to prevent incorrect date jumps.
   */
  function getPropTradeDate(trade, timeShiftHours, resetTz) {
    if (timeShiftHours === undefined || timeShiftHours === null) timeShiftHours = 0;
    if (!resetTz) {
      throw new Error('MISSING_RESET_TZ: reset_tz is required and cannot be null.');
    }
    var rawDate = trade ? (trade.close_time || trade.trade_date || trade.open_time) : null;
    if (!rawDate) return null;

    var dateStr = String(rawDate).trim();

    // Date-only without time (or exact midnight UTC): DO NOT shift hours
    if (!hasTimeComponent(dateStr)) {
      var match = dateStr.match(/^\d{4}-\d{2}-\d{2}/);
      return match ? match[0] : dateStr.slice(0, 10);
    }

    // Has time component: parse UTC ms, apply timeShiftHours, then format in resetTz
    var ms = parseTradeDateTime(dateStr);
    if (ms == null) return dateStr.slice(0, 10);

    var shiftedMs = ms + (Number(timeShiftHours) || 0) * 3600 * 1000;
    return formatYMDInTz(shiftedMs, resetTz);
  }

  /**
   * Main calculation engine. Pure function, UI-independent.
   *
   * @param {Object} params
   * @param {Object} params.account - Prop account record { starting_balance, start_date, rules, reset_tz, ... }
   * @param {Array}  params.trades  - List of trades { trade_date, pnl, close_time, open_time }
   * @param {string} [params.timezone] - Timezone override (optional preview)
   * @param {Date|string} [params.currentDate] - Current date reference (defaults to now)
   * @returns {Object} Comprehensive prop status object
   */
  function calculatePropStatus(params) {
    if (!params) params = {};
    var account = params.account || {};
    var trades = params.trades || [];
    var rules = account.rules || {};
    
    // reset_tz strictly required: NO silent UTC fallback!
    var resetTz = account.reset_tz || rules.reset_tz || params.timezone;
    if (!resetTz) {
      throw new Error('MISSING_RESET_TZ: Prop account reset_tz is required and cannot be null.');
    }

    // Input Validation: starting_balance (> 0)
    var startingBalance = 100000;
    if (account.starting_balance !== undefined) {
      var rawBalance = account.starting_balance;
      if (rawBalance === null || rawBalance === '') {
        return { overall_status: 'invalid_rules', error_code: 'INVALID_STARTING_BALANCE', error_message: 'starting_balance is required' };
      }
      startingBalance = Number(rawBalance);
      if (isNaN(startingBalance) || startingBalance <= 0) {
        return { overall_status: 'invalid_rules', error_code: 'INVALID_STARTING_BALANCE', error_message: 'starting_balance must be greater than 0' };
      }
    }

    // Input Validation: daily_loss_limit_pct (0 - 100)
    var dailyLossLimitPct = 5;
    if (rules.daily_loss_limit_pct !== undefined) {
      var rawDailyLoss = rules.daily_loss_limit_pct;
      if (rawDailyLoss === null || rawDailyLoss === '') {
        return { overall_status: 'invalid_rules', error_code: 'INVALID_DAILY_LOSS_PCT', error_message: 'daily_loss_limit_pct is required' };
      }
      dailyLossLimitPct = Number(rawDailyLoss);
      if (isNaN(dailyLossLimitPct) || dailyLossLimitPct <= 0 || dailyLossLimitPct > 100) {
        return { overall_status: 'invalid_rules', error_code: 'INVALID_DAILY_LOSS_PCT', error_message: 'daily_loss_limit_pct must be between 0 and 100' };
      }
    }

    // Input Validation: max_loss_limit_pct (0 - 100)
    var maxLossLimitPct = 10;
    if (rules.max_loss_limit_pct !== undefined) {
      var rawMaxLoss = rules.max_loss_limit_pct;
      if (rawMaxLoss === null || rawMaxLoss === '') {
        return { overall_status: 'invalid_rules', error_code: 'INVALID_MAX_LOSS_PCT', error_message: 'max_loss_limit_pct is required' };
      }
      maxLossLimitPct = Number(rawMaxLoss);
      if (isNaN(maxLossLimitPct) || maxLossLimitPct <= 0 || maxLossLimitPct > 100) {
        return { overall_status: 'invalid_rules', error_code: 'INVALID_MAX_LOSS_PCT', error_message: 'max_loss_limit_pct must be between 0 and 100' };
      }
    }

    // Input Validation: profit_target_pct (0 - 100 if present)
    var profitTargetPct = null;
    if (rules.profit_target_pct !== undefined && rules.profit_target_pct !== null && rules.profit_target_pct !== '') {
      profitTargetPct = Number(rules.profit_target_pct);
      if (isNaN(profitTargetPct) || profitTargetPct <= 0 || profitTargetPct > 100) {
        return { overall_status: 'invalid_rules', error_code: 'INVALID_PROFIT_TARGET_PCT', error_message: 'profit_target_pct must be between 0 and 100' };
      }
    }

    // Input Validation: min_trading_days (non-negative if present)
    var minTradingDays = null;
    if (rules.min_trading_days !== undefined && rules.min_trading_days !== null && rules.min_trading_days !== '') {
      minTradingDays = Number(rules.min_trading_days);
      if (isNaN(minTradingDays) || minTradingDays < 0) {
        return { overall_status: 'invalid_rules', error_code: 'INVALID_MIN_TRADING_DAYS', error_message: 'min_trading_days must be non-negative' };
      }
    }

    // Input Validation: consistency rule
    var consistencyRule = rules.consistency_rule || { enabled: false, max_single_day_profit_pct: null };
    if (consistencyRule && consistencyRule.enabled) {
      var rawCon = consistencyRule.max_single_day_profit_pct;
      var conPct = Number(rawCon);
      if (isNaN(conPct) || conPct <= 0 || conPct > 100) {
        return { overall_status: 'invalid_rules', error_code: 'INVALID_CONSISTENCY_PCT', error_message: 'consistency max_single_day_profit_pct must be between 0 and 100' };
      }
    }

    var rawStartDate = account.start_date ? String(account.start_date).slice(0, 10) : '1970-01-01';
    
    // Time shift hours: parseFloat support (-14 .. 14, NaN safe)
    var rawShift = account.time_shift_hours !== undefined ? account.time_shift_hours : (rules.default_time_shift_hours || 0);
    var parsedShift = parseFloat(rawShift);
    if (isNaN(parsedShift)) parsedShift = 0;
    var timeShiftHours = Math.min(14, Math.max(-14, parsedShift));

    // Rule parameters
    var dailyLossAmountBase = rules.daily_loss_amount_base || 'initial_balance';
    var maxLossType = rules.max_loss_type || 'static';
    var trailLock = rules.max_loss_trail_lock || rules.trail_lock || 'none';
    var maxTradingDays = rules.max_trading_days !== undefined && rules.max_trading_days !== null ? Number(rules.max_trading_days) : null;

    // 1. Trade Filtering: ONLY trades where propDate >= account.start_date
    var validTrades = [];
    for (var i = 0; i < trades.length; i++) {
      var trade = trades[i];
      if (!trade) continue;
      var propDate = getPropTradeDate(trade, timeShiftHours, resetTz);
      if (!propDate) continue;
      if (propDate >= rawStartDate) {
        var rawD = trade.close_time || trade.trade_date || trade.open_time;
        validTrades.push({
          rawTrade: trade,
          trade_date: trade.trade_date,
          close_time: trade.close_time,
          open_time: trade.open_time,
          _propDate: propDate,
          _pnl: Number(trade.pnl) || 0,
          _hasTime: hasTimeComponent(String(rawD)),
          _timeMs: parseTradeDateTime(rawD) || 0
        });
      }
    }

    // 2. Sort trades chronologically
    validTrades.sort(function (a, b) {
      if (a._timeMs !== b._timeMs) return a._timeMs - b._timeMs;
      return (a._propDate || '').localeCompare(b._propDate || '');
    });

    // 3. Group trades by prop trading day
    var dailyMap = new Map();
    for (var j = 0; j < validTrades.length; j++) {
      var vt = validTrades[j];
      var dKey = vt._propDate;
      if (!dailyMap.has(dKey)) {
        dailyMap.set(dKey, { date: dKey, pnl: 0, trades: [] });
      }
      var group = dailyMap.get(dKey);
      group.pnl = Math.round((group.pnl + vt._pnl) * 100) / 100;
      group.trades.push(vt);
    }

    var sortedDays = Array.from(dailyMap.keys()).sort();

    // 4. Daily Progression & Historical Drawdown Evaluation
    var runningBalance = startingBalance;
    var peakEodBalance = startingBalance;
    
    // Initial hard stop level (zemin)
    var initialStopLevel = Math.round(startingBalance * (1 - maxLossLimitPct / 100) * 100) / 100;
    var stopLevel = initialStopLevel;
    
    var worstDailyLoss = 0; // Negative or 0
    var worstDailyLossDay = null;
    var closedDailyBreach = false;
    var closedBalanceBreach = false;
    var intradayOrderUnknown = false;
    var dailyHistory = [];

    for (var k = 0; k < sortedDays.length; k++) {
      var day = sortedDays[k];
      var dayGroup = dailyMap.get(day);
      var startOfDayBalance = runningBalance;
      var dayPnl = dayGroup.pnl;

      // Check if any trade on this day is date-only (or exact midnight UTC)
      var hasAnyDateOnly = dayGroup.trades.some(function (t) { return !t._hasTime; });
      if (hasAnyDateOnly && dayGroup.trades.length > 1) {
        intradayOrderUnknown = true;
      }

      // Daily limit calculation:
      // - 'day_start_balance': % * startOfDayBalance (e.g. FundingPips 107K * 3% = 3,210)
      // - 'initial_balance': % * startingBalance (e.g. FTMO 100K * 5% = 5,000 always)
      var dayLimitBase = startingBalance;
      if (dailyLossAmountBase === 'day_start_balance') {
        dayLimitBase = startOfDayBalance;
      } else {
        dayLimitBase = startingBalance;
      }
      var dayLimitAmount = Math.round(dayLimitBase * (dailyLossLimitPct / 100) * 100) / 100;
      var dayLossFloor = Math.round((startOfDayBalance - dayLimitAmount) * 100) / 100;

      // INTRADAY SEQUENTIAL EVALUATION (Günün içi sıralı değerlendirme)
      if (!hasAnyDateOnly) {
        // All trades on this day have clock timestamps: evaluate running low point
        var runningIntradayBalance = startOfDayBalance;
        var runningIntradayPnl = 0;
        var dayWorstIntradayPnl = 0;

        for (var m = 0; m < dayGroup.trades.length; m++) {
          var tr = dayGroup.trades[m];
          runningIntradayBalance = Math.round((runningIntradayBalance + tr._pnl) * 100) / 100;
          runningIntradayPnl = Math.round((runningIntradayPnl + tr._pnl) * 100) / 100;

          if (runningIntradayPnl < dayWorstIntradayPnl) {
            dayWorstIntradayPnl = runningIntradayPnl;
          }

          // Daily loss breach at this exact trade moment:
          if (runningIntradayPnl < -dayLimitAmount - 0.0001) {
            closedDailyBreach = true;
          }
          // Max loss breach at this exact trade moment:
          if (runningIntradayBalance < stopLevel - 0.0001) {
            closedBalanceBreach = true;
          }
        }

        if (dayWorstIntradayPnl < worstDailyLoss) {
          worstDailyLoss = dayWorstIntradayPnl;
          worstDailyLossDay = day;
        }
      } else {
        // Date-only trades: sequence is unknown, evaluate only net EOD result
        if (dayPnl < -dayLimitAmount - 0.0001) {
          closedDailyBreach = true;
        }
        if (dayPnl < worstDailyLoss) {
          worstDailyLoss = dayPnl;
          worstDailyLossDay = day;
        }
      }

      runningBalance = Math.round((runningBalance + dayPnl) * 100) / 100;

      // Max loss EOD check and stop level update for next day
      if (maxLossType === 'eod_trailing' || maxLossType === 'trailing_eod') {
        if (runningBalance > peakEodBalance) {
          peakEodBalance = runningBalance;
        }
        var trailDistance = Math.round(startingBalance * (maxLossLimitPct / 100) * 100) / 100;
        var candidateStop = Math.round((peakEodBalance - trailDistance) * 100) / 100;

        if (trailLock === 'at_starting_balance' && candidateStop > startingBalance) {
          candidateStop = startingBalance;
        }
        stopLevel = Math.max(stopLevel, candidateStop);

        if (runningBalance < stopLevel - 0.0001) {
          closedBalanceBreach = true;
        }
      } else {
        // Static max loss
        stopLevel = Math.round(startingBalance * (1 - maxLossLimitPct / 100) * 100) / 100;
        if (runningBalance < stopLevel - 0.0001) {
          closedBalanceBreach = true;
        }
      }

      var dayMarginEod = Math.max(0, Math.round((runningBalance - dayLossFloor) * 100) / 100);

      dailyHistory.push({
        date: day,
        pnl: dayPnl,
        trades_count: dayGroup.trades.length,
        balance_start: startOfDayBalance,
        balance_eod: runningBalance,
        daily_loss_limit: dayLimitAmount,
        daily_loss_floor: dayLossFloor,
        margin_eod: dayMarginEod,
        stop_level_eod: stopLevel,
        daily_loss_pct: Math.round((Math.abs(Math.min(0, dayPnl)) / startingBalance) * 10000) / 100,
        is_violation: dayPnl < -dayLimitAmount - 0.0001
      });
    }

    // 5. Total Balance & Profit Metrics
    var currentBalance = runningBalance;
    var totalPnl = Math.round((currentBalance - startingBalance) * 100) / 100;
    var totalPnlPct = Math.round((totalPnl / startingBalance) * 10000) / 100;

    var targetAmount = null;
    var targetBalance = null;
    var profitTargetReached = true;
    var profitTargetRemaining = 0;
    var profitTargetProgressPct = 100;

    if (profitTargetPct !== null) {
      targetAmount = Math.round(startingBalance * (profitTargetPct / 100) * 100) / 100;
      targetBalance = Math.round((startingBalance + targetAmount) * 100) / 100;
      profitTargetReached = totalPnl >= targetAmount - 0.0001;
      profitTargetRemaining = Math.max(0, Math.round((targetAmount - totalPnl) * 100) / 100);
      profitTargetProgressPct = targetAmount > 0
        ? Math.min(100, Math.max(0, Math.round((totalPnl / targetAmount) * 10000) / 100))
        : 0;
    }

    // 6. Trading Days
    var tradingDaysCount = dailyHistory.length;
    var minTradingDaysReached = minTradingDays === null || tradingDaysCount >= minTradingDays;
    var tradingDaysRemaining = minTradingDays !== null ? Math.max(0, minTradingDays - tradingDaysCount) : 0;
    var maxTradingDaysExceeded = maxTradingDays !== null && tradingDaysCount > maxTradingDays;

    // 7. Today's Daily Loss Status (Bugünün marj hesabı)
    var todayStr;
    if (typeof params.currentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.currentDate)) {
      todayStr = params.currentDate;
    } else {
      var cDate = params.currentDate ? new Date(params.currentDate) : new Date();
      todayStr = formatYMDInTz(cDate.getTime(), resetTz);
    }

    var todayRecord = dailyHistory.find(function (d) { return d.date === todayStr; });
    var todayPnl = todayRecord ? todayRecord.pnl : 0;

    var todayStartBalance = startingBalance;
    if (todayRecord) {
      todayStartBalance = todayRecord.balance_start;
    } else {
      todayStartBalance = currentBalance;
    }

    var todayLimitBase = startingBalance;
    if (dailyLossAmountBase === 'day_start_balance') {
      todayLimitBase = todayStartBalance;
    } else {
      todayLimitBase = startingBalance;
    }
    var todayLimitAmount = Math.round(todayLimitBase * (dailyLossLimitPct / 100) * 100) / 100;

    // Marj = anlık_kapanmış_bakiye - zemin = (todayStartBalance + todayPnl) - (todayStartBalance - todayLimitAmount) = todayLimitAmount + todayPnl
    // Math.min(limit, ...) sınırlaması YOKTUR: gün içi kâr marjı genişletir!
    var todayRemainingMargin = Math.max(0, Math.round((todayLimitAmount + todayPnl) * 100) / 100);
    var todayDailyLossViolated = todayPnl < -todayLimitAmount - 0.0001;

    // 8. Consistency Rule Check
    // Formula: en_iyi_gün_kâr / (pozitif günlerin kâr toplamı)
    // CRITICAL SPEC: Exceeding ratio is NOT a failure!
    var consistencyRuleExceeded = false;
    var bestDayProfit = 0;
    var positiveDaysProfitSum = 0;
    var bestDayProfitPct = 0;
    var requiredAdditionalProfit = 0;

    if (consistencyRule.enabled && consistencyRule.max_single_day_profit_pct !== null) {
      var maxAllowedPct = Number(consistencyRule.max_single_day_profit_pct);
      for (var p = 0; p < dailyHistory.length; p++) {
        var dHist = dailyHistory[p];
        if (dHist.pnl > 0) {
          positiveDaysProfitSum = Math.round((positiveDaysProfitSum + dHist.pnl) * 100) / 100;
          if (dHist.pnl > bestDayProfit) {
            bestDayProfit = dHist.pnl;
          }
        }
      }

      if (positiveDaysProfitSum > 0) {
        bestDayProfitPct = Math.round((bestDayProfit / positiveDaysProfitSum) * 10000) / 100;
        if (bestDayProfitPct > maxAllowedPct + 0.0001) {
          consistencyRuleExceeded = true;
          var limitFraction = maxAllowedPct / 100;
          if (limitFraction > 0) {
            requiredAdditionalProfit = Math.round(((bestDayProfit / limitFraction) - positiveDaysProfitSum) * 100) / 100;
            if (requiredAdditionalProfit < 0) requiredAdditionalProfit = 0;
          }
        }
      }
    }

    // 9. Fail Reasons & Warnings
    var failReasons = [];
    if (closedDailyBreach || todayDailyLossViolated) {
      failReasons.push('DAILY_LOSS_EXCEEDED');
    }
    if (closedBalanceBreach) {
      failReasons.push('MAX_LOSS_EXCEEDED');
    }
    if (maxTradingDaysExceeded) {
      failReasons.push('MAX_TRADING_DAYS_EXCEEDED');
    }

    var hasEquityBasedDailyLoss = (
      rules.daily_loss_type === 'equity_based' ||
      (rules.estimated_rules && rules.estimated_rules.includes('daily_loss'))
    );
    var hasEquityBasedMaxLoss = (
      rules.max_loss_type === 'trailing_equity' ||
      (rules.estimated_rules && rules.estimated_rules.includes('max_loss'))
    );

    var intradayBreachPossible = !closedBalanceBreach && Boolean(hasEquityBasedDailyLoss || hasEquityBasedMaxLoss) && (validTrades.length > 0);

    var warnings = [];
    if (hasEquityBasedDailyLoss || hasEquityBasedMaxLoss) {
      warnings.push('EQUITY_BASED_ESTIMATED');
    }
    if (intradayBreachPossible) {
      warnings.push('INTRADAY_BREACH_POSSIBLE');
    }
    if (intradayOrderUnknown) {
      warnings.push('INTRADAY_ORDER_UNKNOWN');
    }
    if (consistencyRule.enabled && consistencyRuleExceeded) {
      warnings.push('CONSISTENCY_NOT_MET');
    }

    // 10. Overall Status Determination
    var overallStatus = 'in_progress';
    if (failReasons.length > 0) {
      overallStatus = 'failed';
    } else if (
      profitTargetReached &&
      minTradingDaysReached &&
      (!consistencyRule.enabled || !consistencyRuleExceeded)
    ) {
      overallStatus = 'passed';
    }

    var distanceToStop = Math.round((currentBalance - stopLevel) * 100) / 100;
    var distanceToStopPct = Math.round((distanceToStop / startingBalance) * 10000) / 100;
    var currentDrawdownAmount = Math.max(0, Math.round((peakEodBalance - currentBalance) * 100) / 100);

    return {
      account: {
        starting_balance: startingBalance,
        start_date: rawStartDate,
        reset_tz: resetTz,
        time_shift_hours: timeShiftHours,
        phase_index: rules.phase_index !== undefined ? rules.phase_index : 0
      },
      current_balance: currentBalance,
      total_pnl: totalPnl,
      total_pnl_pct: totalPnlPct,
      profit_target: {
        target_pct: profitTargetPct,
        target_amount: targetAmount,
        target_balance: targetBalance,
        remaining_amount: profitTargetRemaining,
        progress_pct: profitTargetProgressPct,
        is_reached: profitTargetReached
      },
      daily_loss: {
        limit_pct: dailyLossLimitPct,
        amount_base: dailyLossAmountBase,
        limit_amount: todayLimitAmount,
        today_pnl: todayPnl,
        remaining_margin: todayRemainingMargin,
        is_violated: closedDailyBreach || todayDailyLossViolated,
        today_violated: todayDailyLossViolated,
        worst_daily_loss: worstDailyLoss,
        worst_daily_loss_pct: Math.round((Math.abs(worstDailyLoss) / startingBalance) * 10000) / 100,
        worst_daily_loss_day: worstDailyLossDay
      },
      max_loss: {
        type: maxLossType,
        trail_lock: trailLock,
        limit_pct: maxLossLimitPct,
        hard_stop_level: stopLevel,
        distance_to_stop: distanceToStop,
        distance_to_stop_pct: distanceToStopPct,
        current_drawdown: currentDrawdownAmount,
        closed_balance_breach: closedBalanceBreach,
        intraday_breach_possible: intradayBreachPossible,
        is_violated: closedBalanceBreach
      },
      trading_days: {
        count: tradingDaysCount,
        min_required: minTradingDays,
        remaining: tradingDaysRemaining,
        is_reached: minTradingDaysReached,
        max_allowed: maxTradingDays
      },
      consistency: {
        enabled: Boolean(consistencyRule.enabled),
        max_allowed_pct: consistencyRule.max_single_day_profit_pct,
        best_day_profit: bestDayProfit,
        positive_days_profit_sum: positiveDaysProfitSum,
        best_day_profit_pct: bestDayProfitPct,
        is_met: !consistencyRuleExceeded,
        required_additional_profit: requiredAdditionalProfit
      },
      overall_status: overallStatus,
      fail_reasons: failReasons,
      warnings: warnings,
      daily_history: dailyHistory
    };
  }

  return {
    hasTimeComponent: hasTimeComponent,
    parseTradeDateTime: parseTradeDateTime,
    formatYMDInTz: formatYMDInTz,
    getPropTradeDate: getPropTradeDate,
    calculatePropStatus: calculatePropStatus
  };
});
