// ============================================================
// WAWE JOURNAL - PROP FIRM TEMPLATES
// File: public/src/core/prop-templates.js
// Description: Predefined templates for verified prop firm models.
// Format: Pure Vanilla JS / UMD (Loads via classic <script> in browser and vm in tests)
// Last Verified: 2026-10-04
// ============================================================

(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof root !== 'undefined') {
    root.PropTemplates = api;
  }
  if (typeof window !== 'undefined') {
    window.PropTemplates = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULT_STARTING_BALANCES = [5000, 10000, 25000, 50000, 100000, 200000];

  var PROP_TEMPLATES = {
    'ftmo-2step': {
      key: 'ftmo-2step',
      name: 'FTMO (2-Step)',
      firm: 'FTMO',
      version: '2026.1',
      last_verified: '2026-10-04',
      source_url: 'https://ftmo.com/en/how-to-pass-ftmo-challenge/',
      notes: 'CE(S)T midnight reset (Europe/Prague). Günlük limit tutarı başlangıç bakiyesine göre sabittir (100K için 5.000$). Referans noktası gün başı bakiyesidir. Maksimum kayıp %10 sabit (static) zeminlidir.',
      estimated_rules: ['daily_loss'],
      reset_tz: 'Europe/Prague',
      reset_tz_required: false,
      starting_balances: DEFAULT_STARTING_BALANCES,
      phases: [
        {
          phase_index: 0,
          phase_name: 'Phase 1 (Challenge)',
          verified: true,
          profit_target_pct: 10,
          daily_loss_limit_pct: 5,
          daily_loss_amount_base: 'initial_balance',
          daily_loss_basis: 'day_start_balance',
          daily_loss_type: 'equity_based',
          max_loss_limit_pct: 10,
          max_loss_type: 'static',
          max_loss_trail_lock: 'none',
          min_trading_days: 4,
          max_trading_days: null,
          consistency_rule: { enabled: false, max_single_day_profit_pct: null },
          reset_tz: 'Europe/Prague',
          default_time_shift_hours: 0,
          allow_custom: true
        },
        {
          phase_index: 1,
          phase_name: 'Phase 2 (Verification)',
          verified: true,
          profit_target_pct: 5,
          daily_loss_limit_pct: 5,
          daily_loss_amount_base: 'initial_balance',
          daily_loss_basis: 'day_start_balance',
          daily_loss_type: 'equity_based',
          max_loss_limit_pct: 10,
          max_loss_type: 'static',
          max_loss_trail_lock: 'none',
          min_trading_days: 4,
          max_trading_days: null,
          consistency_rule: { enabled: false, max_single_day_profit_pct: null },
          reset_tz: 'Europe/Prague',
          default_time_shift_hours: 0,
          allow_custom: true
        },
        {
          phase_index: 2,
          phase_name: 'Funded (FTMO Trader)',
          verified: true,
          profit_target_pct: null,
          daily_loss_limit_pct: 5,
          daily_loss_amount_base: 'initial_balance',
          daily_loss_basis: 'day_start_balance',
          daily_loss_type: 'equity_based',
          max_loss_limit_pct: 10,
          max_loss_type: 'static',
          max_loss_trail_lock: 'none',
          min_trading_days: 0,
          max_trading_days: null,
          consistency_rule: { enabled: false, max_single_day_profit_pct: null },
          reset_tz: 'Europe/Prague',
          default_time_shift_hours: 0,
          allow_custom: true
        }
      ]
    },

    'ftmo-1step': {
      key: 'ftmo-1step',
      name: 'FTMO (1-Step)',
      firm: 'FTMO',
      version: '2026.1',
      last_verified: '2026-10-04',
      source_url: 'https://ftmo.com/en/1-step-challenge/',
      notes: 'Kaynaklar kilit noktasını belirtmediği için max_loss.trail_lock="none" olarak uygulanır. CE(S)T midnight reset (Europe/Prague). Günlük limit tutarı başlangıç bakiyesine göredir (100K için 3.000$). Consistency: En iyi gün <= pozitif günlerin kâr toplamının %50\'si.',
      estimated_rules: ['daily_loss'],
      reset_tz: 'Europe/Prague',
      reset_tz_required: false,
      starting_balances: DEFAULT_STARTING_BALANCES,
      phases: [
        {
          phase_index: 0,
          phase_name: 'Phase 1 (Single Phase)',
          verified: true,
          profit_target_pct: 10,
          daily_loss_limit_pct: 3,
          daily_loss_amount_base: 'initial_balance',
          daily_loss_basis: 'day_start_balance',
          daily_loss_type: 'equity_based',
          max_loss_limit_pct: 10,
          max_loss_type: 'eod_trailing',
          max_loss_trail_lock: 'none',
          min_trading_days: null,
          max_trading_days: null,
          consistency_rule: { enabled: true, max_single_day_profit_pct: 50 },
          reset_tz: 'Europe/Prague',
          default_time_shift_hours: 0,
          allow_custom: true
        },
        {
          phase_index: 1,
          phase_name: 'Funded (FTMO Trader)',
          verified: true,
          profit_target_pct: null,
          daily_loss_limit_pct: 3,
          daily_loss_amount_base: 'initial_balance',
          daily_loss_basis: 'day_start_balance',
          daily_loss_type: 'equity_based',
          max_loss_limit_pct: 10,
          max_loss_type: 'eod_trailing',
          max_loss_trail_lock: 'none',
          min_trading_days: 0,
          max_trading_days: null,
          consistency_rule: { enabled: true, max_single_day_profit_pct: 50 },
          reset_tz: 'Europe/Prague',
          default_time_shift_hours: 0,
          allow_custom: true
        }
      ]
    },

    'fundednext-stellar-2step': {
      key: 'fundednext-stellar-2step',
      name: 'FundedNext (Stellar 2-Step)',
      firm: 'FundedNext',
      version: '2026.1',
      last_verified: '2026-10-04',
      source_url: 'https://fundednext.com/cfds/stellar-2-step',
      notes: 'FundedNext günü server saatine göre bitirir; MT5\'inin server saatini seç, ör. Europe/Athens. Günlük tutar başlangıç bakiyesine göredir (100K için 5.000$).',
      estimated_rules: ['daily_loss'],
      reset_tz: null,
      reset_tz_required: true,
      starting_balances: DEFAULT_STARTING_BALANCES,
      phases: [
        {
          phase_index: 0,
          phase_name: 'Phase 1',
          verified: true,
          profit_target_pct: 8,
          daily_loss_limit_pct: 5,
          daily_loss_amount_base: 'initial_balance',
          daily_loss_basis: 'day_start_balance',
          daily_loss_type: 'equity_based',
          max_loss_limit_pct: 10,
          max_loss_type: 'static',
          max_loss_trail_lock: 'none',
          min_trading_days: 5,
          max_trading_days: null,
          consistency_rule: { enabled: false, max_single_day_profit_pct: null },
          reset_tz: null,
          reset_tz_required: true,
          default_time_shift_hours: 0,
          allow_custom: true
        },
        {
          phase_index: 1,
          phase_name: 'Phase 2',
          verified: true,
          profit_target_pct: 5,
          daily_loss_limit_pct: 5,
          daily_loss_amount_base: 'initial_balance',
          daily_loss_basis: 'day_start_balance',
          daily_loss_type: 'equity_based',
          max_loss_limit_pct: 10,
          max_loss_type: 'static',
          max_loss_trail_lock: 'none',
          min_trading_days: 5,
          max_trading_days: null,
          consistency_rule: { enabled: false, max_single_day_profit_pct: null },
          reset_tz: null,
          reset_tz_required: true,
          default_time_shift_hours: 0,
          allow_custom: true
        },
        {
          phase_index: 2,
          phase_name: 'Funded',
          verified: false,
          profit_target_pct: null,
          daily_loss_limit_pct: 5,
          daily_loss_amount_base: 'initial_balance',
          daily_loss_basis: 'day_start_balance',
          daily_loss_type: 'equity_based',
          max_loss_limit_pct: 10,
          max_loss_type: 'static',
          max_loss_trail_lock: 'none',
          min_trading_days: 0,
          max_trading_days: null,
          consistency_rule: { enabled: false, max_single_day_profit_pct: null },
          reset_tz: null,
          reset_tz_required: true,
          default_time_shift_hours: 0,
          allow_custom: true
        }
      ]
    },

    'fundednext-stellar-1step': {
      key: 'fundednext-stellar-1step',
      name: 'FundedNext (Stellar 1-Step)',
      firm: 'FundedNext',
      version: '2026.1',
      last_verified: '2026-10-04',
      source_url: 'https://fundednext.com/cfds/stellar-1-step',
      notes: 'FundedNext günü server saatine göre bitirir; MT5\'inin server saatini seç, ör. Europe/Athens. Max %6 STATIC; consistency YOK. Günlük tutar başlangıç bakiyesine göredir (100K için 3.000$).',
      estimated_rules: ['daily_loss'],
      reset_tz: null,
      reset_tz_required: true,
      starting_balances: DEFAULT_STARTING_BALANCES,
      phases: [
        {
          phase_index: 0,
          phase_name: 'Phase 1 (Single Phase)',
          verified: true,
          profit_target_pct: 10,
          daily_loss_limit_pct: 3,
          daily_loss_amount_base: 'initial_balance',
          daily_loss_basis: 'day_start_balance',
          daily_loss_type: 'equity_based',
          max_loss_limit_pct: 6,
          max_loss_type: 'static',
          max_loss_trail_lock: 'none',
          min_trading_days: 2,
          max_trading_days: null,
          consistency_rule: { enabled: false, max_single_day_profit_pct: null },
          reset_tz: null,
          reset_tz_required: true,
          default_time_shift_hours: 0,
          allow_custom: true
        },
        {
          phase_index: 1,
          phase_name: 'Funded',
          verified: false,
          profit_target_pct: null,
          daily_loss_limit_pct: 3,
          daily_loss_amount_base: 'initial_balance',
          daily_loss_basis: 'day_start_balance',
          daily_loss_type: 'equity_based',
          max_loss_limit_pct: 6,
          max_loss_type: 'static',
          max_loss_trail_lock: 'none',
          min_trading_days: 0,
          max_trading_days: null,
          consistency_rule: { enabled: false, max_single_day_profit_pct: null },
          reset_tz: null,
          reset_tz_required: true,
          default_time_shift_hours: 0,
          allow_custom: true
        }
      ]
    },

    'fundednext-stellar-lite': {
      key: 'fundednext-stellar-lite',
      name: 'FundedNext (Stellar Lite)',
      firm: 'FundedNext',
      version: '2026.1',
      last_verified: '2026-10-04',
      source_url: 'https://fundednext.com/cfds/stellar-lite',
      notes: 'FundedNext günü server saatine göre bitirir; MT5\'inin server saatini seç, ör. Europe/Athens. Min gün şartı doğrulanmadı (null). Günlük %4, maksimum %8 static. Günlük tutar başlangıç bakiyesine göredir.',
      estimated_rules: ['daily_loss'],
      reset_tz: null,
      reset_tz_required: true,
      starting_balances: DEFAULT_STARTING_BALANCES,
      phases: [
        {
          phase_index: 0,
          phase_name: 'Phase 1',
          verified: false,
          profit_target_pct: 8,
          daily_loss_limit_pct: 4,
          daily_loss_amount_base: 'initial_balance',
          daily_loss_basis: 'day_start_balance',
          daily_loss_type: 'equity_based',
          max_loss_limit_pct: 8,
          max_loss_type: 'static',
          max_loss_trail_lock: 'none',
          min_trading_days: null,
          max_trading_days: null,
          consistency_rule: { enabled: false, max_single_day_profit_pct: null },
          reset_tz: null,
          reset_tz_required: true,
          default_time_shift_hours: 0,
          allow_custom: true
        },
        {
          phase_index: 1,
          phase_name: 'Phase 2',
          verified: false,
          profit_target_pct: 4,
          daily_loss_limit_pct: 4,
          daily_loss_amount_base: 'initial_balance',
          daily_loss_basis: 'day_start_balance',
          daily_loss_type: 'equity_based',
          max_loss_limit_pct: 8,
          max_loss_type: 'static',
          max_loss_trail_lock: 'none',
          min_trading_days: null,
          max_trading_days: null,
          consistency_rule: { enabled: false, max_single_day_profit_pct: null },
          reset_tz: null,
          reset_tz_required: true,
          default_time_shift_hours: 0,
          allow_custom: true
        },
        {
          phase_index: 2,
          phase_name: 'Funded',
          verified: false,
          profit_target_pct: null,
          daily_loss_limit_pct: 4,
          daily_loss_amount_base: 'initial_balance',
          daily_loss_basis: 'day_start_balance',
          daily_loss_type: 'equity_based',
          max_loss_limit_pct: 8,
          max_loss_type: 'static',
          max_loss_trail_lock: 'none',
          min_trading_days: 0,
          max_trading_days: null,
          consistency_rule: { enabled: false, max_single_day_profit_pct: null },
          reset_tz: null,
          reset_tz_required: true,
          default_time_shift_hours: 0,
          allow_custom: true
        }
      ]
    },

    'fundingpips-2step-standard': {
      key: 'fundingpips-2step-standard',
      name: 'FundingPips (2-Step Standard)',
      firm: 'FundingPips',
      version: '2026.1',
      last_verified: '2026-10-04',
      source_url: 'https://fundingpips.com/2-step-standard',
      notes: 'Günlük limit tutarı GÜN BAŞI BAKİYESİNE dayanır (107K açılışta %5 × 107K = 5.350$). Kapanmış işlem verisiyle başlangıç gün bakiyesi kullanılır, tahmini hesaplama uyarısı üretilir. reset_tz Etc/GMT-3 (UTC+3).',
      estimated_rules: ['daily_loss'],
      reset_tz: 'Etc/GMT-3',
      reset_tz_required: false,
      starting_balances: DEFAULT_STARTING_BALANCES,
      phases: [
        {
          phase_index: 0,
          phase_name: 'Phase 1 (Student)',
          verified: true,
          profit_target_pct: 8,
          daily_loss_limit_pct: 5,
          daily_loss_amount_base: 'day_start_balance',
          daily_loss_basis: 'day_start_balance',
          daily_loss_type: 'equity_based',
          max_loss_limit_pct: 10,
          max_loss_type: 'static',
          max_loss_trail_lock: 'none',
          min_trading_days: 3,
          max_trading_days: null,
          consistency_rule: { enabled: false, max_single_day_profit_pct: null },
          reset_tz: 'Etc/GMT-3',
          default_time_shift_hours: 0,
          allow_custom: true
        },
        {
          phase_index: 1,
          phase_name: 'Phase 2 (Practitioner)',
          verified: true,
          profit_target_pct: 5,
          daily_loss_limit_pct: 5,
          daily_loss_amount_base: 'day_start_balance',
          daily_loss_basis: 'day_start_balance',
          daily_loss_type: 'equity_based',
          max_loss_limit_pct: 10,
          max_loss_type: 'static',
          max_loss_trail_lock: 'none',
          min_trading_days: 3,
          max_trading_days: null,
          consistency_rule: { enabled: false, max_single_day_profit_pct: null },
          reset_tz: 'Etc/GMT-3',
          default_time_shift_hours: 0,
          allow_custom: true
        },
        {
          phase_index: 2,
          phase_name: 'Funded (Master)',
          verified: true,
          profit_target_pct: null,
          daily_loss_limit_pct: 5,
          daily_loss_amount_base: 'day_start_balance',
          daily_loss_basis: 'day_start_balance',
          daily_loss_type: 'equity_based',
          max_loss_limit_pct: 10,
          max_loss_type: 'static',
          max_loss_trail_lock: 'none',
          min_trading_days: 0,
          max_trading_days: null,
          consistency_rule: { enabled: false, max_single_day_profit_pct: null },
          reset_tz: 'Etc/GMT-3',
          default_time_shift_hours: 0,
          allow_custom: true
        }
      ]
    },

    'fundingpips-2step-pro': {
      key: 'fundingpips-2step-pro',
      name: 'FundingPips (2-Step Pro)',
      firm: 'FundingPips',
      version: '2026.1',
      last_verified: '2026-10-04',
      source_url: '',
      notes: 'resmi sayfa doğrulanmadı. Günlük limit tutarı gün başı bakiyesine dayanır. reset_tz Etc/GMT-3 (UTC+3).',
      estimated_rules: ['daily_loss'],
      reset_tz: 'Etc/GMT-3',
      reset_tz_required: false,
      starting_balances: DEFAULT_STARTING_BALANCES,
      phases: [
        {
          phase_index: 0,
          phase_name: 'Phase 1',
          verified: false,
          profit_target_pct: 6,
          daily_loss_limit_pct: 3,
          daily_loss_amount_base: 'day_start_balance',
          daily_loss_basis: 'day_start_balance',
          daily_loss_type: 'equity_based',
          max_loss_limit_pct: 6,
          max_loss_type: 'static',
          max_loss_trail_lock: 'none',
          min_trading_days: 1,
          max_trading_days: null,
          consistency_rule: { enabled: false, max_single_day_profit_pct: null },
          reset_tz: 'Etc/GMT-3',
          default_time_shift_hours: 0,
          allow_custom: true
        },
        {
          phase_index: 1,
          phase_name: 'Phase 2',
          verified: false,
          profit_target_pct: 6,
          daily_loss_limit_pct: 3,
          daily_loss_amount_base: 'day_start_balance',
          daily_loss_basis: 'day_start_balance',
          daily_loss_type: 'equity_based',
          max_loss_limit_pct: 6,
          max_loss_type: 'static',
          max_loss_trail_lock: 'none',
          min_trading_days: 1,
          max_trading_days: null,
          consistency_rule: { enabled: false, max_single_day_profit_pct: null },
          reset_tz: 'Etc/GMT-3',
          default_time_shift_hours: 0,
          allow_custom: true
        },
        {
          phase_index: 2,
          phase_name: 'Funded',
          verified: false,
          profit_target_pct: null,
          daily_loss_limit_pct: 3,
          daily_loss_amount_base: 'day_start_balance',
          daily_loss_basis: 'day_start_balance',
          daily_loss_type: 'equity_based',
          max_loss_limit_pct: 6,
          max_loss_type: 'static',
          max_loss_trail_lock: 'none',
          min_trading_days: 0,
          max_trading_days: null,
          consistency_rule: { enabled: false, max_single_day_profit_pct: null },
          reset_tz: 'Etc/GMT-3',
          default_time_shift_hours: 0,
          allow_custom: true
        }
      ]
    },

    'custom': {
      key: 'custom',
      name: 'Özel Şablon (Custom)',
      firm: 'Custom',
      version: '2026.1',
      last_verified: '2026-10-04',
      source_url: '',
      notes: 'Kullanıcı tarafından tamamen özelleştirilebilir prop hesabı şablonu.',
      estimated_rules: [],
      reset_tz: 'UTC',
      reset_tz_required: false,
      starting_balances: DEFAULT_STARTING_BALANCES,
      phases: [
        {
          phase_index: 0,
          phase_name: 'Phase 1',
          verified: true,
          profit_target_pct: 10,
          daily_loss_limit_pct: 5,
          daily_loss_amount_base: 'initial_balance',
          daily_loss_basis: 'day_start_balance',
          daily_loss_type: 'balance_based',
          max_loss_limit_pct: 10,
          max_loss_type: 'static',
          max_loss_trail_lock: 'at_starting_balance',
          min_trading_days: 4,
          max_trading_days: null,
          consistency_rule: { enabled: false, max_single_day_profit_pct: null },
          reset_tz: 'UTC',
          default_time_shift_hours: 0,
          allow_custom: true
        }
      ]
    }
  };

  /**
   * Returns a list of all prop firm templates.
   */
  function getPropTemplates() {
    return Object.values(PROP_TEMPLATES);
  }

  /**
   * Returns a single template by key or null.
   */
  function getPropTemplate(key) {
    return PROP_TEMPLATES[key] || null;
  }

  /**
   * Returns default rule config for given template key and phase index.
   */
  function getDefaultRules(templateKey, phaseIndex) {
    if (phaseIndex === undefined || phaseIndex === null) phaseIndex = 0;
    var template = getPropTemplate(templateKey);
    if (!template || !template.phases) return null;
    var phase = template.phases.find(function (p) { return p.phase_index === phaseIndex; }) || template.phases[0];
    return {
      template_key: template.key,
      template_version: template.version,
      firm: template.firm,
      last_verified: template.last_verified,
      source_url: template.source_url,
      notes: template.notes,
      estimated_rules: (template.estimated_rules || []).slice(),
      reset_tz: phase.reset_tz !== undefined ? phase.reset_tz : (template.reset_tz || null),
      reset_tz_required: Boolean(phase.reset_tz_required !== undefined ? phase.reset_tz_required : template.reset_tz_required),
      phase_index: phase.phase_index,
      phase_name: phase.phase_name,
      verified: Boolean(phase.verified),
      profit_target_pct: phase.profit_target_pct,
      daily_loss_limit_pct: phase.daily_loss_limit_pct,
      daily_loss_amount_base: phase.daily_loss_amount_base || 'initial_balance',
      daily_loss_basis: phase.daily_loss_basis || 'day_start_balance',
      daily_loss_type: phase.daily_loss_type || 'balance_based',
      max_loss_limit_pct: phase.max_loss_limit_pct,
      max_loss_type: phase.max_loss_type || 'static',
      max_loss_trail_lock: phase.max_loss_trail_lock || 'none',
      min_trading_days: phase.min_trading_days,
      max_trading_days: phase.max_trading_days,
      consistency_rule: Object.assign({}, phase.consistency_rule),
      default_time_shift_hours: phase.default_time_shift_hours || 0,
      allow_custom: phase.allow_custom !== undefined ? phase.allow_custom : true
    };
  }

  return {
    DEFAULT_STARTING_BALANCES: DEFAULT_STARTING_BALANCES,
    PROP_TEMPLATES: PROP_TEMPLATES,
    getPropTemplates: getPropTemplates,
    getPropTemplate: getPropTemplate,
    getDefaultRules: getDefaultRules
  };
});
