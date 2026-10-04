// ============================================================
// WAWE JOURNAL - PROP ACCOUNT SERVICE LAYER
// File: public/src/services/prop-service.js
// Description: Supabase REST/RPC client wrapper for managing
//              prop firm accounts, phase advancement, quota checks,
//              and calculating live prop account status.
// Format: Pure Vanilla JS / UMD (Loads via classic <script> in browser and vm in tests)
// ============================================================

(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof root !== 'undefined') {
    root.PropService = api;
  }
  if (typeof window !== 'undefined') {
    window.PropService = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function getSbClient(throwIfMissing) {
    var client = null;
    if (typeof window !== 'undefined' && window.sb) {
      client = window.sb;
    } else if (typeof globalThis !== 'undefined' && globalThis.sb) {
      client = globalThis.sb;
    }
    if (!client && throwIfMissing !== false) {
      throw new Error('SUPABASE_NOT_READY: Supabase client is not initialized.');
    }
    return client;
  }

  function handlePropError(error) {
    if (!error) return;
    if (typeof window !== 'undefined' && window.wwLog && window.wwLog.error) {
      window.wwLog.error('PropService Error:', error);
    }
    var msg = error.message || '';
    var err = new Error(msg);
    err.original = error;

    if (msg.includes('PROP_LIMIT_EXCEEDED')) {
      err.code = 'PROP_LIMIT_EXCEEDED';
      err.limit = msg.includes(':10') ? 10 : 1;
    } else if (msg.includes('INVALID_JOURNAL')) {
      err.code = 'INVALID_JOURNAL';
    } else if (msg.includes('INVALID_TZ')) {
      err.code = 'INVALID_TZ';
    } else if (msg.includes('chk_prop_rules_size')) {
      err.code = 'RULES_SIZE_EXCEEDED';
    } else if (msg.includes('uq_prop_accounts_active_journal')) {
      err.code = 'ACTIVE_PROP_EXISTS';
    } else {
      err.code = 'GENERIC';
    }
    throw err;
  }

  /**
   * Fetches active prop account linked to a specific journal ID.
   *
   * @param {string} journalId
   * @returns {Promise<Object|null>}
   */
  async function getPropAccountByJournalId(journalId) {
    if (!journalId) return null;
    var sb = getSbClient();
    try {
      var res = await sb
        .from('prop_accounts')
        .select('*')
        .eq('journal_id', journalId)
        .eq('is_active', true)
        .maybeSingle();

      if (res.error) {
        handlePropError(res.error);
      }
      return res.data || null;
    } catch (err) {
      if (err.code) throw err;
      handlePropError(err);
    }
  }

  /**
   * Fetches all active prop accounts for the current authenticated user.
   * Returns empty array silently if not authenticated or client unavailable.
   *
   * @returns {Promise<Array>}
   */
  async function getActivePropAccounts() {
    var sb = getSbClient(false);
    if (!sb || !sb.auth) return [];

    try {
      var userRes = await sb.auth.getUser();
      var user = userRes && userRes.data ? userRes.data.user : null;
      if (!user) return [];

      var res = await sb
        .from('prop_accounts')
        .select('*, journals!inner(id, name, is_active, color, icon)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .eq('journals.is_active', true);

      if (res.error) {
        // Fallback without relation join if relation name differs
        var simpleRes = await sb
          .from('prop_accounts')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true);
        if (simpleRes.error) return [];
        return simpleRes.data || [];
      }
      return res.data || [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Checks current user's prop quota and capacity.
   *
   * @returns {Promise<Object>} { count, limit, canCreate, isPremium }
   */
  async function checkPropAccountQuota() {
    var sb = getSbClient();
    var userRes = await sb.auth.getUser();
    var user = userRes && userRes.data ? userRes.data.user : null;
    if (!user) return { count: 0, limit: 1, canCreate: false, isPremium: false };

    var profileRes = await sb
      .from('user_profiles')
      .select('plan, plan_expires_at')
      .eq('id', user.id)
      .single();

    var profile = profileRes.data || {};
    var isPremium = profile.plan === 'premium';
    if (isPremium && profile.plan_expires_at) {
      var exp = new Date(profile.plan_expires_at).getTime();
      if (!isNaN(exp) && Date.now() > exp) {
        isPremium = false;
      }
    }

    var limit = isPremium ? 10 : 1;
    var activeAccounts = await getActivePropAccounts();
    var count = activeAccounts.length;

    return {
      count: count,
      limit: limit,
      canCreate: count < limit,
      isPremium: isPremium
    };
  }

  /**
   * Creates a new prop account record.
   *
   * @param {Object} accountData
   * @returns {Promise<Object>}
   */
  async function createPropAccount(accountData) {
    if (!accountData) throw new Error('DATA_REQUIRED');
    if (!accountData.journal_id) throw new Error('JOURNAL_ID_REQUIRED');

    var sb = getSbClient();
    var userRes = await sb.auth.getUser();
    var user = userRes && userRes.data ? userRes.data.user : null;
    if (!user) throw new Error('AUTH_REQUIRED');

    var payload = {
      user_id: user.id,
      journal_id: accountData.journal_id,
      template_key: accountData.template_key || 'custom',
      template_version: accountData.template_version || '2026.1',
      rules: accountData.rules || {},
      starting_balance: Math.max(0, Number(accountData.starting_balance) || 100000),
      start_date: accountData.start_date || new Date().toISOString().slice(0, 10),
      phase_index: accountData.phase_index !== undefined ? Number(accountData.phase_index) : 0,
      reset_tz: accountData.reset_tz || 'UTC',
      time_shift_hours: (function() {
        var p = parseFloat(accountData.time_shift_hours);
        return isNaN(p) ? 0 : Math.min(14, Math.max(-14, p));
      })(),
      is_active: true,
      updated_at: new Date().toISOString()
    };

    var res = await sb
      .from('prop_accounts')
      .insert([payload])
      .select()
      .single();

    if (res.error) {
      handlePropError(res.error);
    }
    return res.data;
  }

  /**
   * Updates an existing prop account.
   *
   * @param {string} id
   * @param {Object} updateData
   * @returns {Promise<Object>}
   */
  async function updatePropAccount(id, updateData) {
    if (!id) throw new Error('ID_REQUIRED');
    var sb = getSbClient();

    var payload = Object.assign({}, updateData, {
      updated_at: new Date().toISOString()
    });
    if (payload.time_shift_hours !== undefined) {
      var pShift = parseFloat(payload.time_shift_hours);
      payload.time_shift_hours = isNaN(pShift) ? 0 : Math.min(14, Math.max(-14, pShift));
    }
    delete payload.id;
    delete payload.user_id;

    var res = await sb
      .from('prop_accounts')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (res.error) {
      handlePropError(res.error);
    }
    return res.data;
  }

  /**
   * Soft deletes a prop account (sets is_active = false).
   *
   * @param {string} id
   * @returns {Promise<Object>}
   */
  async function deletePropAccount(id) {
    if (!id) return null;
    var sb = getSbClient();

    var res = await sb
      .from('prop_accounts')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (res.error) {
      handlePropError(res.error);
    }
    return res.data;
  }

  // In-memory fallback for environments without storage
  var _memoryNotifCache = new Set();

  function getLocalStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
      if (typeof localStorage !== 'undefined') return localStorage;
      if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
    } catch (e) {}
    return null;
  }

  function getSessionStorage() {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) return window.sessionStorage;
      if (typeof sessionStorage !== 'undefined') return sessionStorage;
      if (typeof globalThis !== 'undefined' && globalThis.sessionStorage) return globalThis.sessionStorage;
    } catch (e) {}
    return null;
  }

  function safeSessionGet(key) {
    var ls = getLocalStorage();
    var ss = getSessionStorage();
    try {
      if (ls) {
        var lVal = ls.getItem(key);
        if (lVal) return lVal;
      }
      if (ss) {
        var sVal = ss.getItem(key);
        if (sVal) return sVal;
      }
    } catch (e) {}
    return _memoryNotifCache.has(key) ? '1' : null;
  }

  function safeSessionSet(key, val) {
    var ls = getLocalStorage();
    var ss = getSessionStorage();
    try {
      if (ls) ls.setItem(key, val);
      if (ss) ss.setItem(key, val);
    } catch (e) {}
    _memoryNotifCache.add(key);
  }

  /**
   * Clears notification session and persistent deduplication keys for a given prop account.
   *
   * @param {string} accId
   */
  function clearPropAccountNotifications(accId) {
    if (!accId) return;
    var prefix = 'ww_prop_notif_' + accId;
    var ls = getLocalStorage();
    var ss = getSessionStorage();
    try {
      if (ls) {
        var lToRemove = [];
        for (var i = 0; i < ls.length; i++) {
          var lk = ls.key(i);
          if (lk && lk.indexOf(prefix) === 0) {
            lToRemove.push(lk);
          }
        }
        lToRemove.forEach(function (k) { ls.removeItem(k); });
      }
    } catch (e) {}
    try {
      if (ss) {
        var toRemove = [];
        for (var j = 0; j < ss.length; j++) {
          var sk = ss.key(j);
          if (sk && sk.indexOf(prefix) === 0) {
            toRemove.push(sk);
          }
        }
        toRemove.forEach(function (k) { ss.removeItem(k); });
      }
    } catch (e) {}
    _memoryNotifCache.forEach(function (k) {
      if (k.indexOf(prefix) === 0) {
        _memoryNotifCache.delete(k);
      }
    });
  }

  /**
   * Advances the phase of an existing prop account.
   * Updates: phase_index, rules, start_date, and starting_balance.
   * Resets session/local breach/warning notifications for this account.
   *
   * @param {string} id
   * @param {number|Object} options newPhaseIndex or { newPhaseIndex, startDate, startingBalance, rules, keepCustomRules }
   * @returns {Promise<Object>}
   */
  async function advancePhase(id, options) {
    if (!id) throw new Error('ID_REQUIRED');
    var sb = getSbClient();

    var fetchRes = await sb
      .from('prop_accounts')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchRes.error || !fetchRes.data) {
      handlePropError(fetchRes.error || new Error('ACCOUNT_NOT_FOUND'));
    }

    var account = fetchRes.data;
    var targetIndex = 0;
    var startDate = null;
    var startingBalance = null;
    var customRules = null;
    var keepCustomRules = false;

    if (typeof options === 'number') {
      targetIndex = options;
    } else if (options && typeof options === 'object') {
      targetIndex = Number(options.newPhaseIndex !== undefined ? options.newPhaseIndex : (account.phase_index + 1)) || 0;
      startDate = options.startDate || null;
      startingBalance = options.startingBalance !== undefined ? Number(options.startingBalance) : null;
      customRules = options.rules || null;
      keepCustomRules = Boolean(options.keepCustomRules);
    } else {
      targetIndex = (account.phase_index || 0) + 1;
    }

    var resetTz = account.reset_tz || 'UTC';
    if (!startDate) {
      try {
        startDate = new Intl.DateTimeFormat('en-CA', { timeZone: resetTz }).format(new Date());
      } catch (e) {
        startDate = new Date().toISOString().split('T')[0];
      }
    }

    // Default starting balance resets to initial balance (or template default if available, else account.starting_balance)
    if (!startingBalance || startingBalance <= 0) {
      startingBalance = Number(account.starting_balance) || 100000;
    }

    var newRules = account.rules || {};
    var propTemplates = (typeof window !== 'undefined' && window.PropTemplates) ? window.PropTemplates : (typeof root !== 'undefined' ? root.PropTemplates : null);
    if (propTemplates && account.template_key) {
      var defaultRules = propTemplates.getDefaultRules(account.template_key, targetIndex);
      if (defaultRules) {
        if (keepCustomRules && account.rules && account.rules.is_customized) {
          // Preserve customized rules while setting new phase index and phase name
          newRules = Object.assign({}, defaultRules, account.rules, {
            phase_index: targetIndex,
            phase_name: defaultRules.phase_name || account.rules.phase_name,
            is_customized: true
          });
        } else {
          newRules = Object.assign({}, defaultRules, customRules || {}, {
            phase_index: targetIndex,
            is_customized: false
          });
        }
      }
    } else if (customRules) {
      newRules = Object.assign({}, account.rules, customRules, { phase_index: targetIndex });
    } else {
      newRules = Object.assign({}, account.rules, { phase_index: targetIndex });
    }

    // Reset notification/breach states in session & local storage for this account
    clearPropAccountNotifications(id);

    return updatePropAccount(id, {
      phase_index: targetIndex,
      rules: newRules,
      start_date: startDate,
      starting_balance: startingBalance
    });
  }

  /**
   * Syncs and calculates the live prop status for a given journal ID.
   * Reuses cachedTrades or window.wwCache before issuing Supabase query.
   *
   * @param {string} journalId
   * @param {Array<Object>} [cachedTrades] Optional pre-loaded trades array
   * @returns {Promise<{account: Object, status: Object}|null>}
   */
  async function syncPropAccountStatus(journalId, cachedTrades) {
    if (!journalId) return null;
    var propAccount = await getPropAccountByJournalId(journalId);
    if (!propAccount) return null;

    var trades = null;
    if (cachedTrades && Array.isArray(cachedTrades)) {
      trades = cachedTrades;
    } else if (typeof window !== 'undefined' && window.wwCache) {
      var uId = (window.currentUser && window.currentUser.id) ||
                (window.__wwUserProfile && window.__wwUserProfile.id) || null;
      if (uId) {
        trades = window.wwCache.get('trades_dashboard', uId, journalId) ||
                 window.wwCache.get('trades', uId, journalId);
      }
    }

    if (!trades || !Array.isArray(trades)) {
      var sb = getSbClient();
      var tradesRes = await sb
        .from('trades')
        .select('id, trade_date, pnl, entry_price, exit_price, lot, direction, instrument, multiplier')
        .eq('journal_id', journalId)
        .order('trade_date', { ascending: true })
        .limit(5000);

      if (tradesRes.error) {
        handlePropError(tradesRes.error);
      }
      trades = tradesRes.data || [];
    }

    var calcPnLFn = (typeof window !== 'undefined' && window.calcPnL) ? window.calcPnL : null;

    var computedTrades = trades.map(function (t) {
      var pnlVal = t.pnl;
      if (pnlVal === null || pnlVal === undefined || isNaN(Number(pnlVal))) {
        if (calcPnLFn) {
          pnlVal = calcPnLFn(t.entry_price, t.exit_price, t.lot, t.direction, t.instrument, t.multiplier);
        } else {
          pnlVal = 0;
        }
      }
      return {
        id: t.id,
        trade_date: t.trade_date,
        pnl: Number(pnlVal) || 0
      };
    });

    var propCalculator = (typeof window !== 'undefined' && window.PropCalculator) ? window.PropCalculator : (typeof root !== 'undefined' ? root.PropCalculator : null);
    if (!propCalculator) {
      throw new Error('PROP_CALCULATOR_NOT_LOADED: PropCalculator is required for status evaluation.');
    }

    var status = propCalculator.calculatePropStatus({
      account: propAccount,
      trades: computedTrades
    });

    try {
      checkAndNotifyPropAccount(propAccount, status);
    } catch (notifErr) {
      if (typeof window !== 'undefined' && window.wwLog && window.wwLog.warn) {
        window.wwLog.warn('checkAndNotifyPropAccount error:', notifErr);
      }
    }

    return {
      account: propAccount,
      status: status
    };
  }

  /**
   * Dispatches an in-app notification to notificationManager and showToast.
   */
  function dispatchPropNotification(type, title, desc, iconName) {
    if (typeof window !== 'undefined') {
      if (window.showToast) {
        var toastType = (type === 'prop_daily_warning') ? 'warning' : ((type === 'prop_target_passed') ? 'success' : 'error');
        window.showToast(title + (desc ? ' — ' + desc : ''), toastType);
      }
      if (window.notificationManager && typeof window.notificationManager.add === 'function') {
        window.notificationManager.add({
          type: type,
          title: title,
          description: desc,
          icon: iconName || 'shield-alert'
        });
      }
    }
  }

  /**
   * Evaluates prop account live status and triggers toasts and in-app notifications
   * for:
   * 1. Daily loss warning @80%
   * 2. Daily loss breach @100%
   * 3. Maximum loss breach
   * 4. Target passed (evaluation phase completed)
   *
   * Deduplicates per session/day to prevent alert fatigue.
   *
   * @param {Object} account
   * @param {Object} status
   * @returns {Array<string>} list of triggered notification types
   */
  function checkAndNotifyPropAccount(account, status) {
    if (!account || !status) return [];
    var triggered = [];

    var resetTz = (account && account.reset_tz) || (status && status.account && status.account.reset_tz) || 'UTC';
    var todayStr;
    try {
      todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: resetTz }).format(new Date());
    } catch (e) {
      todayStr = new Date().toISOString().split('T')[0];
    }

    var i18nFn = (typeof window !== 'undefined' && window.i18n && typeof window.i18n.t === 'function')
      ? function (key, params) { return window.i18n.t(key, params); }
      : function (key, params) {
          if (key === 'prop.notify_daily_80_title') return 'Günlük Kayıp Riski (%80)';
          if (key === 'prop.notify_daily_80_desc') return 'Bugünkü kaybınız günlük limitin %80\'ine ulaştı. Kalan marj: ' + (params && params.margin || '');
          if (key === 'prop.notify_daily_breach_title') return 'Günlük Kayıp Limiti Aşıldı!';
          if (key === 'prop.notify_daily_breach_desc') return 'Hesabınız günlük maksimum kayıp limitini aştı (' + (params && params.loss || '') + ').';
          if (key === 'prop.notify_max_breach_title') return 'Maksimum Kayıp Limiti Aşıldı!';
          if (key === 'prop.notify_max_breach_desc') return 'Hesap bakiyeniz maksimum kayıp tabanının altına indi. İhlal gerçekleşti.';
          if (key === 'prop.notify_target_passed_title') return 'Hedefe Ulaşıldı!';
          if (key === 'prop.notify_target_passed_desc') return 'Tüm kâr ve gün kuralları başarıyla tamamlandı. Sonraki aşamaya geçebilirsiniz.';
          return key;
        };

    var fmt = (typeof window !== 'undefined' && window.formatCurrency)
      ? window.formatCurrency
      : function (val) { return '$' + Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }); };

    var accId = account.id || 'current';
    var phaseIdx = account.phase_index || 0;

    // 1. Daily Loss Warning @80% (bugün-only)
    var dailyLimit = status.daily_loss ? Number(status.daily_loss.limit_amount) || 0 : 0;
    var todayPnl = status.daily_loss ? Number(status.daily_loss.today_pnl) || 0 : 0;
    var isTodayDailyViolated = Boolean(status.daily_loss && (status.daily_loss.today_violated || (dailyLimit > 0 && todayPnl < -dailyLimit - 0.0001)));

    if (dailyLimit > 0 && todayPnl < 0 && !isTodayDailyViolated) {
      var currentLoss = Math.abs(todayPnl);
      if (currentLoss >= (dailyLimit * 0.8) - 0.0001) {
        var notifKey80 = 'ww_prop_notif_' + accId + '_' + todayStr + '_daily_80';
        if (!safeSessionGet(notifKey80)) {
          safeSessionSet(notifKey80, '1');
          var remMargin = status.daily_loss.remaining_margin !== undefined ? fmt(status.daily_loss.remaining_margin) : fmt(dailyLimit - currentLoss);
          var title80 = i18nFn('prop.notify_daily_80_title');
          var desc80 = i18nFn('prop.notify_daily_80_desc', { margin: remMargin });
          dispatchPropNotification('prop_daily_warning', title80, desc80, 'triangle-alert');
          triggered.push('prop_daily_warning');
        }
      }
    }

    // 2. Daily Loss Breach @100% (bugün-only)
    if (isTodayDailyViolated) {
      var notifKeyDailyBreach = 'ww_prop_notif_' + accId + '_' + todayStr + '_daily_breach';
      if (!safeSessionGet(notifKeyDailyBreach)) {
        safeSessionSet(notifKeyDailyBreach, '1');
        var lossStr = fmt(Math.abs(todayPnl));
        var titleDB = i18nFn('prop.notify_daily_breach_title');
        var descDB = i18nFn('prop.notify_daily_breach_desc', { loss: lossStr });
        dispatchPropNotification('prop_daily_breach', titleDB, descDB, 'octagon-alert');
        triggered.push('prop_daily_breach');
      }
    }

    // 3. Maximum Loss Breach
    var isMaxViolated = Boolean(status.max_loss && (status.max_loss.is_violated || status.max_loss.distance_to_stop <= 0));
    if (isMaxViolated) {
      var notifKeyMaxBreach = 'ww_prop_notif_' + accId + '_max_breach';
      if (!safeSessionGet(notifKeyMaxBreach)) {
        safeSessionSet(notifKeyMaxBreach, '1');
        var titleMB = i18nFn('prop.notify_max_breach_title');
        var descMB = i18nFn('prop.notify_max_breach_desc');
        dispatchPropNotification('prop_max_breach', titleMB, descMB, 'octagon-alert');
        triggered.push('prop_max_breach');
      }
    }

    // 4. Target Passed
    var isOverallPassed = status.overall_status === 'passed';
    if (isOverallPassed) {
      var notifKeyPassed = 'ww_prop_notif_' + accId + '_phase_' + phaseIdx + '_passed';
      if (!safeSessionGet(notifKeyPassed)) {
        safeSessionSet(notifKeyPassed, '1');
        var titlePass = i18nFn('prop.notify_target_passed_title');
        var descPass = i18nFn('prop.notify_target_passed_desc');
        dispatchPropNotification('prop_target_passed', titlePass, descPass, 'circle-check');
        triggered.push('prop_target_passed');
      }
    }

    return triggered;
  }

  return {
    getPropAccountByJournalId: getPropAccountByJournalId,
    getActivePropAccounts: getActivePropAccounts,
    checkPropAccountQuota: checkPropAccountQuota,
    createPropAccount: createPropAccount,
    updatePropAccount: updatePropAccount,
    deletePropAccount: deletePropAccount,
    advancePhase: advancePhase,
    syncPropAccountStatus: syncPropAccountStatus,
    checkAndNotifyPropAccount: checkAndNotifyPropAccount,
    clearPropAccountNotifications: clearPropAccountNotifications
  };
});
