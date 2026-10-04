// ============================================================
// WAWE JOURNAL - PROP CALCULATOR TEST SUITE
// File: tests/prop-calculator.test.js
// Runner: Node.js Built-in Test Runner (node --test)
// Loader: Browser simulation using node:vm (No CommonJS / No export)
// ============================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

// Browser context simulation via node:vm
function loadScriptInVm(filePath, windowMock = {}) {
  const code = fs.readFileSync(filePath, 'utf8');
  const sandbox = {
    window: windowMock,
    globalThis: windowMock,
    module: undefined,
    exports: undefined,
    Intl,
    Date,
    Math,
    Number,
    String,
    Array,
    Map,
    Error,
    TypeError,
    RegExp,
    Boolean,
    console
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.globalThis = sandbox.window;
  vm.runInNewContext(code, sandbox);
  return sandbox.window;
}

const templatesPath = path.resolve('public/src/core/prop-templates.js');
const calculatorPath = path.resolve('public/src/utils/prop-calculator.js');

const browserWindow = {};
loadScriptInVm(templatesPath, browserWindow);
loadScriptInVm(calculatorPath, browserWindow);

const {
  PROP_TEMPLATES,
  getPropTemplates,
  getPropTemplate,
  getDefaultRules
} = browserWindow.PropTemplates;

const {
  hasTimeComponent,
  parseTradeDateTime,
  formatYMDInTz,
  getPropTradeDate,
  calculatePropStatus
} = browserWindow.PropCalculator;

describe('1. Şablon Doğrulaması (Prop Templates - Browser VM)', () => {
  it('Yalnızca belirtilen 8 şablon mevcut olmalı, eski şablonlar bulunmamalıdır', () => {
    const templates = getPropTemplates();
    assert.equal(templates.length, 8);

    const expectedKeys = [
      'ftmo-2step',
      'ftmo-1step',
      'fundednext-stellar-2step',
      'fundednext-stellar-1step',
      'fundednext-stellar-lite',
      'fundingpips-2step-standard',
      'fundingpips-2step-pro',
      'custom'
    ];

    const actualKeys = Object.keys(PROP_TEMPLATES).sort();
    assert.deepEqual(actualKeys, [...expectedKeys].sort());

    for (const key of expectedKeys) {
      assert.ok(PROP_TEMPLATES[key], `Şablon eksik: ${key}`);
      assert.equal(PROP_TEMPLATES[key].key, key);
      assert.equal(PROP_TEMPLATES[key].last_verified, '2026-10-04');
      assert.ok(typeof PROP_TEMPLATES[key].notes === 'string');
      assert.ok(Array.isArray(PROP_TEMPLATES[key].estimated_rules));
    }

    assert.equal(PROP_TEMPLATES['fundingpips-1step'], undefined);
    assert.equal(PROP_TEMPLATES['fundingpips-3step'], undefined);
    assert.equal(PROP_TEMPLATES['ftmo_aggressive_2step'], undefined);
    assert.equal(PROP_TEMPLATES['fundednext_express'], undefined);
    assert.equal(PROP_TEMPLATES['tft_standard'], undefined);
  });

  it('ftmo-1step: max_loss_type=eod_trailing, trail_lock=none, consistency=%50, verified=true', () => {
    const rules = getDefaultRules('ftmo-1step', 0);
    assert.ok(rules);
    assert.equal(rules.max_loss_type, 'eod_trailing');
    assert.equal(rules.max_loss_trail_lock, 'none');
    assert.equal(rules.daily_loss_amount_base, 'initial_balance');
    assert.equal(rules.consistency_rule.enabled, true);
    assert.equal(rules.consistency_rule.max_single_day_profit_pct, 50);
    assert.equal(rules.verified, true);
    assert.equal(rules.source_url, 'https://ftmo.com/en/1-step-challenge/');
    assert.deepEqual([...rules.estimated_rules], ['daily_loss']);
  });

  it('fundednext-stellar-1step: max_loss_type=static (%6), consistency YOK, reset_tz=null', () => {
    const rules = getDefaultRules('fundednext-stellar-1step', 0);
    assert.ok(rules);
    assert.equal(rules.max_loss_type, 'static');
    assert.equal(rules.max_loss_limit_pct, 6);
    assert.equal(rules.daily_loss_amount_base, 'initial_balance');
    assert.equal(rules.consistency_rule.enabled, false);
    assert.equal(rules.reset_tz, null);
    assert.equal(rules.reset_tz_required, true);
    assert.equal(rules.source_url, 'https://fundednext.com/cfds/stellar-1-step');
    assert.deepEqual([...rules.estimated_rules], ['daily_loss']);
  });

  it('fundednext-stellar-lite: daily_loss_type=equity_based, verified=false', () => {
    const rules = getDefaultRules('fundednext-stellar-lite', 0);
    assert.equal(rules.daily_loss_type, 'equity_based');
    assert.equal(rules.daily_loss_amount_base, 'initial_balance');
    assert.equal(rules.verified, false);
    assert.equal(rules.source_url, 'https://fundednext.com/cfds/stellar-lite');
  });

  it('FundedNext funded fazları verified=false, FTMO ve FundingPips Master verified=true olmalıdır', () => {
    const fn2Funded = getDefaultRules('fundednext-stellar-2step', 2);
    assert.equal(fn2Funded.verified, false);

    const ftmoFunded = getDefaultRules('ftmo-2step', 2);
    assert.equal(ftmoFunded.verified, true);

    const fpMaster = getDefaultRules('fundingpips-2step-standard', 2);
    assert.equal(fpMaster.verified, true);

    const fpPro = getDefaultRules('fundingpips-2step-pro', 0);
    assert.equal(fpPro.verified, false);
    assert.equal(fpPro.source_url, '');
  });
});

describe('2. Gerçek Veri Formatları & hasTimeComponent Doğrulaması', () => {
  it('hasTimeComponent gece yarısı UTC formatlarını tarih-only, saatli formatları saatli tanımalıdır', () => {
    // Tarih-only (gece yarısı UTC veya saatsiz):
    assert.equal(hasTimeComponent('2026-05-10'), false);
    assert.equal(hasTimeComponent('2026-05-10T00:00:00+00:00'), false);
    assert.equal(hasTimeComponent('2026-05-10T00:00:00.000Z'), false);
    assert.equal(hasTimeComponent('2026-05-10 00:00:00'), false);
    assert.equal(hasTimeComponent('2026-05-10T00:00:00Z'), false);

    // Saatli işlemler:
    assert.equal(hasTimeComponent('2026-05-10THH:mm:ss+00:00'), false); // Geçersiz string
    assert.equal(hasTimeComponent('2026-05-10T14:30:00+00:00'), true);
    assert.equal(hasTimeComponent('2026-05-10 14:30:00'), true);
    assert.equal(hasTimeComponent('2026-05-10T09:15:00.000Z'), true);
    assert.equal(hasTimeComponent('2026-05-10 00:01:00'), true);
    assert.equal(hasTimeComponent('2026-05-10 23:59:00'), true);
  });
});

describe('3. Zaman Dilimi, DST Geçişi & Gün Sınırı Doğruluğu', () => {
  it('Europe/Prague 2026-10-25 DST geçiş gecesinde 23:30 UTC öncesi ve sonrası doğru güne düşmelidir', () => {
    const tBeforeMidnight = { trade_date: '2026-10-25T22:30:00Z' };
    const tAfterMidnight = { trade_date: '2026-10-25T23:30:00Z' };

    assert.equal(getPropTradeDate(tBeforeMidnight, 0, 'Europe/Prague'), '2026-10-25');
    assert.equal(getPropTradeDate(tAfterMidnight, 0, 'Europe/Prague'), '2026-10-26');
  });

  it('23:59 / 00:01 gün sınırı hem Europe/Prague hem Etc/GMT-3 için doğru çalışmalıdır', () => {
    // Europe/Prague (kışın CET = UTC+1)
    // 22:59 UTC = 23:59 Prag (10 Ocak)
    // 23:01 UTC = 00:01 Prag (11 Ocak)
    assert.equal(getPropTradeDate({ trade_date: '2026-01-10T22:59:00Z' }, 0, 'Europe/Prague'), '2026-01-10');
    assert.equal(getPropTradeDate({ trade_date: '2026-01-10T23:01:00Z' }, 0, 'Europe/Prague'), '2026-01-11');

    // Etc/GMT-3 (UTC+3; IANA standardında işaret tersidir)
    // 20:59 UTC = 23:59 Etc/GMT-3 (10 Ocak)
    // 21:01 UTC = 00:01 Etc/GMT-3 (11 Ocak)
    assert.equal(getPropTradeDate({ trade_date: '2026-01-10T20:59:00Z' }, 0, 'Etc/GMT-3'), '2026-01-10');
    assert.equal(getPropTradeDate({ trade_date: '2026-01-10T21:01:00Z' }, 0, 'Etc/GMT-3'), '2026-01-11');
  });

  it('Calculator reset_tz null gelirse sessizce UTCye düşmemeli, MISSING_RESET_TZ hatası fırlatmalıdır', () => {
    const account = {
      starting_balance: 100000,
      start_date: '2026-05-01',
      reset_tz: null,
      rules: { reset_tz: null }
    };

    assert.throws(() => {
      calculatePropStatus({ account, trades: [{ trade_date: '2026-05-01 10:00:00', pnl: 100 }] });
    }, /MISSING_RESET_TZ/);
  });
});

describe('4. Tarih Filtreleme & Saatsiz Veri Güvenliği', () => {
  it('(d) Saatli işlemde time_shift_hours uygulanıyor, saatsizde uygulanmıyor', () => {
    // Saatsiz işlem: shift ne olursa olsun gün aynı kalır
    const tradeDateOnly = { trade_date: '2026-05-10' };
    assert.equal(getPropTradeDate(tradeDateOnly, 6, 'Europe/Prague'), '2026-05-10');
    assert.equal(getPropTradeDate(tradeDateOnly, -8, 'Europe/Prague'), '2026-05-10');

    // Tam gece yarısı UTC (tarih-only): shift uygulanmaz
    const tradeMidnight = { trade_date: '2026-05-10T00:00:00+00:00' };
    assert.equal(getPropTradeDate(tradeMidnight, 5, 'Europe/Prague'), '2026-05-10');

    // Saatli işlem: shift uygulanır (22:00 UTC + 4 saat = ertesi gün 02:00)
    const tradeTimed = { trade_date: '2026-05-10 22:00:00' };
    assert.equal(getPropTradeDate(tradeTimed, 4, 'UTC'), '2026-05-11');
  });

  it('start_date öncesi işlemler bakiye ve kurallardan tamamen dışlanmalıdır', () => {
    const account = {
      starting_balance: 100000,
      start_date: '2026-05-10',
      reset_tz: 'Europe/Prague',
      rules: { profit_target_pct: 10, min_trading_days: 1 }
    };

    const trades = [
      { trade_date: '2026-05-08 14:00:00', pnl: -6000 }, // start_date öncesi
      { trade_date: '2026-05-10 10:00:00', pnl: 1000 }
    ];

    const res = calculatePropStatus({ account, trades });
    assert.equal(res.current_balance, 101000);
    assert.equal(res.total_pnl, 1000);
    assert.equal(res.trading_days.count, 1);
  });
});

describe('5. Günlük Limit Modeli & Marj Hesabı (FTMO vs FundingPips)', () => {
  it('FTMO 100Kda hesap 110Kya çıktıktan sonraki gün limit tutarı hâlâ 5000 olmalıdır (initial_balance)', () => {
    const account = {
      starting_balance: 100000,
      start_date: '2026-05-01',
      reset_tz: 'Europe/Prague',
      rules: {
        daily_loss_limit_pct: 5,
        daily_loss_amount_base: 'initial_balance'
      }
    };

    const trades = [
      // 1. Gün: +10,000$ -> Bakiye 110,000$ oldu
      { trade_date: '2026-05-01 10:00:00', pnl: 10000 },
      // 2. Gün: İşlem yapıldı
      { trade_date: '2026-05-02 10:00:00', pnl: 0 }
    ];

    const res = calculatePropStatus({ account, trades, currentDate: '2026-05-02' });
    const day2 = res.daily_history.find(d => d.date === '2026-05-02');
    assert.equal(day2.balance_start, 110000);
    // FTMO'da limit tutarı başlangıç bakiyesine göre sabittir: 5,000$
    assert.equal(day2.daily_loss_limit, 5000);
    assert.equal(day2.daily_loss_floor, 105000);
  });

  it('FundingPips 100Kda hesap 110Kya çıktıktan sonraki gün limit tutarı 5% x 110K = 5500 olmalıdır (day_start_balance)', () => {
    const account = {
      starting_balance: 100000,
      start_date: '2026-05-01',
      reset_tz: 'Etc/GMT-3',
      rules: {
        daily_loss_limit_pct: 5,
        daily_loss_amount_base: 'day_start_balance'
      }
    };

    const trades = [
      // 1. Gün: +10,000$ -> Bakiye 110,000$ oldu
      { trade_date: '2026-05-01 10:00:00', pnl: 10000 },
      // 2. Gün: İşlem yapıldı
      { trade_date: '2026-05-02 10:00:00', pnl: 0 }
    ];

    const res = calculatePropStatus({ account, trades, currentDate: '2026-05-02' });
    const day2 = res.daily_history.find(d => d.date === '2026-05-02');
    assert.equal(day2.balance_start, 110000);
    // FundingPips'te limit tutarı gün başı bakiyesine göredir: 5% * 110,000 = 5,500$
    assert.equal(day2.daily_loss_limit, 5500);
    assert.equal(day2.daily_loss_floor, 104500);
  });

  it('(c) fundednext-2step 100Kda gün içi +2K kâr sonrası o günün kullanılabilir zarar limiti 7K olmalıdır', () => {
    const account = {
      starting_balance: 100000,
      start_date: '2026-05-01',
      reset_tz: 'Europe/Athens',
      rules: {
        daily_loss_limit_pct: 5,
        daily_loss_amount_base: 'initial_balance',
        max_loss_limit_pct: 10
      }
    };

    const trades = [
      { trade_date: '2026-05-01 14:00:00', pnl: 2000 }
    ];

    const res = calculatePropStatus({ account, trades, currentDate: '2026-05-01' });
    // Marj = bakiye - zemin = (100K + 2K) - (100K - 5K) = 102K - 95K = 7,000$
    assert.equal(res.daily_loss.limit_amount, 5000);
    assert.equal(res.daily_loss.today_pnl, 2000);
    assert.equal(res.daily_loss.remaining_margin, 7000);
    assert.equal(res.daily_loss.is_violated, false);
  });

  it('(f) Günlük zarar -5000 ihlal değil, -5001 ihlal olmalıdır', () => {
    const account = {
      starting_balance: 100000,
      start_date: '2026-05-01',
      reset_tz: 'Europe/Prague',
      rules: {
        profit_target_pct: 10,
        min_trading_days: 1,
        daily_loss_limit_pct: 5,
        daily_loss_amount_base: 'initial_balance',
        max_loss_limit_pct: 10
      }
    };

    const resLimit = calculatePropStatus({
      account,
      trades: [{ trade_date: '2026-05-01 10:00:00', pnl: -5000 }],
      currentDate: '2026-05-01'
    });
    assert.equal(resLimit.daily_loss.is_violated, false);
    assert.equal(resLimit.daily_loss.remaining_margin, 0);

    const resBreach = calculatePropStatus({
      account,
      trades: [{ trade_date: '2026-05-01 10:00:00', pnl: -5001 }],
      currentDate: '2026-05-01'
    });
    assert.equal(resBreach.daily_loss.is_violated, true);
    assert.ok(resBreach.fail_reasons.includes('DAILY_LOSS_EXCEEDED'));
    assert.equal(resBreach.overall_status, 'failed');
  });
});

describe('6. Günün İçi Sıralı Değerlendirme (Intraday Sequential Low vs Date-Only)', () => {
  it('Saatli işlemlerde -6000 sonra +4000 (aynı gün): gün sonu toparlasa bile gün içi dip patladığı için ihlal olmalıdır', () => {
    const account = {
      starting_balance: 100000,
      start_date: '2026-05-01',
      reset_tz: 'Europe/Prague',
      rules: {
        daily_loss_limit_pct: 5, // 5,000$ limit
        daily_loss_amount_base: 'initial_balance'
      }
    };

    // 10:00'da -6000$ (limit patladı!) -> 14:00'te +4000$ -> Gün sonu net: -2000$
    const tradesTimed = [
      { trade_date: '2026-05-01 10:00:00', pnl: -6000 },
      { trade_date: '2026-05-01 14:00:00', pnl: 4000 }
    ];

    const res = calculatePropStatus({ account, trades: tradesTimed });
    assert.equal(res.total_pnl, -2000);
    assert.equal(res.daily_loss.worst_daily_loss, -6000);
    assert.equal(res.daily_loss.is_violated, true);
    assert.ok(res.fail_reasons.includes('DAILY_LOSS_EXCEEDED'));
    assert.equal(res.overall_status, 'failed');
  });

  it('Saatsiz (tarih-only) işlemlerde sıra bilinemediği için net -2000 ihlal sayılmamalı, INTRADAY_ORDER_UNKNOWN uyarısı eklenmelidir', () => {
    const account = {
      starting_balance: 100000,
      start_date: '2026-05-01',
      reset_tz: 'Europe/Prague',
      rules: {
        profit_target_pct: 10,
        min_trading_days: 1,
        daily_loss_limit_pct: 5,
        daily_loss_amount_base: 'initial_balance'
      }
    };

    // Aynı işlemler saatsiz (tarih-only)
    const tradesDateOnly = [
      { trade_date: '2026-05-01', pnl: -6000 },
      { trade_date: '2026-05-01', pnl: 4000 }
    ];

    const res = calculatePropStatus({ account, trades: tradesDateOnly });
    assert.equal(res.total_pnl, -2000);
    assert.equal(res.daily_loss.is_violated, false);
    assert.equal(res.overall_status, 'in_progress');
    assert.ok(res.warnings.includes('INTRADAY_ORDER_UNKNOWN'));
  });
});

describe('7. Maksimum Kayıp & Zemin Testleri (4a, 4b & Kapanmış/Intraday Ayrımı)', () => {
  it('(a) ftmo-1step 100K: 1. gün sonu 104K ise zemin 94K, sonra 102K düşüp 106K bitirirse zemin 96K', () => {
    const account = {
      starting_balance: 100000,
      start_date: '2026-05-01',
      reset_tz: 'Europe/Prague',
      rules: {
        max_loss_type: 'eod_trailing',
        max_loss_limit_pct: 10,
        max_loss_trail_lock: 'none'
      }
    };

    // 1. Gün: +4K -> Kapanış 104K. Zemin = 104K - 10K = 94K
    const tradesDay1 = [{ trade_date: '2026-05-01 10:00:00', pnl: 4000 }];
    const res1 = calculatePropStatus({ account, trades: tradesDay1 });
    assert.equal(res1.current_balance, 104000);
    assert.equal(res1.max_loss.hard_stop_level, 94000);

    // 2. Gün: -2K -> Kapanış 102K. Zemin 94K'da kalır (ratchet)
    const tradesDay2 = [...tradesDay1, { trade_date: '2026-05-02 10:00:00', pnl: -2000 }];
    const res2 = calculatePropStatus({ account, trades: tradesDay2 });
    assert.equal(res2.current_balance, 102000);
    assert.equal(res2.max_loss.hard_stop_level, 94000);

    // 3. Gün: +4K -> Kapanış 106K. En yüksek gün sonu 106K, zemin = 106K - 10K = 96K
    const tradesDay3 = [...tradesDay2, { trade_date: '2026-05-03 10:00:00', pnl: 4000 }];
    const res3 = calculatePropStatus({ account, trades: tradesDay3 });
    assert.equal(res3.current_balance, 106000);
    assert.equal(res3.max_loss.hard_stop_level, 96000);
    assert.equal(res3.max_loss.closed_balance_breach, false);
    assert.equal(res3.max_loss.is_violated, false);
  });

  it('(b) ftmo-2step zemin hep 90K olmalıdır (static max loss)', () => {
    const account = {
      starting_balance: 100000,
      start_date: '2026-05-01',
      reset_tz: 'Europe/Prague',
      rules: {
        max_loss_type: 'static',
        max_loss_limit_pct: 10
      }
    };

    const trades = [
      { trade_date: '2026-05-01 10:00:00', pnl: 4000 },
      { trade_date: '2026-05-02 10:00:00', pnl: -2000 },
      { trade_date: '2026-05-03 10:00:00', pnl: 4000 }
    ];

    const res = calculatePropStatus({ account, trades });
    assert.equal(res.current_balance, 106000);
    assert.equal(res.max_loss.hard_stop_level, 90000);
    for (const d of res.daily_history) {
      assert.equal(d.stop_level_eod, 90000);
    }
  });

  it('Max loss için closed_balance_breach ve intraday_breach_possible ayrımı doğru çalışmalıdır', () => {
    const accountEquity = {
      starting_balance: 100000,
      start_date: '2026-05-01',
      reset_tz: 'Europe/Prague',
      rules: {
        daily_loss_type: 'equity_based',
        estimated_rules: ['daily_loss'],
        max_loss_type: 'static',
        max_loss_limit_pct: 10
      }
    };

    // Zemin delinmedi (98K > 90K) ama equity kuralı var:
    const resSafe = calculatePropStatus({
      account: accountEquity,
      trades: [{ trade_date: '2026-05-01 10:00:00', pnl: -2000 }]
    });
    assert.equal(resSafe.max_loss.closed_balance_breach, false);
    assert.equal(resSafe.max_loss.intraday_breach_possible, true);
    assert.equal(resSafe.max_loss.is_violated, false);
    assert.ok(resSafe.warnings.includes('INTRADAY_BREACH_POSSIBLE'));

    // Zemin delindi (89K < 90K):
    const resBreach = calculatePropStatus({
      account: accountEquity,
      trades: [{ trade_date: '2026-05-01 10:00:00', pnl: -11000 }]
    });
    assert.equal(resBreach.max_loss.closed_balance_breach, true);
    assert.equal(resBreach.max_loss.intraday_breach_possible, false);
    assert.equal(resBreach.max_loss.is_violated, true);
    assert.ok(resBreach.fail_reasons.includes('MAX_LOSS_EXCEEDED'));
  });
});

describe('8. Temel Hedef ve Min Gün Senaryoları', () => {
  const baseAccount = {
    starting_balance: 100000,
    start_date: '2026-05-01',
    reset_tz: 'Europe/Prague',
    rules: {
      profit_target_pct: 10, // 10,000$
      daily_loss_limit_pct: 5,
      max_loss_limit_pct: 10,
      min_trading_days: 4
    }
  };

  it('(a) Hedef ulaşıldı + min gün sağlandı -> passed olmalıdır', () => {
    const trades = [
      { trade_date: '2026-05-01 10:00:00', pnl: 2500 },
      { trade_date: '2026-05-02 10:00:00', pnl: 2500 },
      { trade_date: '2026-05-03 10:00:00', pnl: 2500 },
      { trade_date: '2026-05-04 10:00:00', pnl: 2500 }
    ];

    const res = calculatePropStatus({ account: baseAccount, trades });
    assert.equal(res.current_balance, 110000);
    assert.equal(res.total_pnl, 10000);
    assert.equal(res.profit_target.is_reached, true);
    assert.equal(res.trading_days.is_reached, true);
    assert.equal(res.overall_status, 'passed');
  });

  it('(b) Hedefe 500$ kaldıysa -> in_progress, kalan 500 olmalıdır', () => {
    const trades = [
      { trade_date: '2026-05-01 10:00:00', pnl: 3000 },
      { trade_date: '2026-05-02 10:00:00', pnl: 3000 },
      { trade_date: '2026-05-03 10:00:00', pnl: 3500 }
    ];

    const res = calculatePropStatus({ account: baseAccount, trades });
    assert.equal(res.total_pnl, 9500);
    assert.equal(res.profit_target.is_reached, false);
    assert.equal(res.profit_target.remaining_amount, 500);
    assert.equal(res.overall_status, 'in_progress');
  });

  it('(c) Hedef tamam ama min gün eksik -> in_progress olmalıdır', () => {
    const trades = [
      { trade_date: '2026-05-01 10:00:00', pnl: 5000 },
      { trade_date: '2026-05-02 10:00:00', pnl: 5000 }
    ];

    const res = calculatePropStatus({ account: baseAccount, trades });
    assert.equal(res.profit_target.is_reached, true);
    assert.equal(res.trading_days.is_reached, false);
    assert.equal(res.trading_days.remaining, 2);
    assert.equal(res.overall_status, 'in_progress');
  });
});

describe('9. Tutarlılık Kuralı (Consistency: Pozitif Günler & İhlal Olmayan Uyarı) (4d & 4g)', () => {
  it('(d) Consistency oranı aşılınca BU BİR İHLAL DEĞİLDİR: in_progress kalır, CONSISTENCY_NOT_MET uyarısı üretir', () => {
    const account = {
      starting_balance: 100000,
      start_date: '2026-05-01',
      reset_tz: 'Europe/Prague',
      rules: {
        profit_target_pct: 10,
        min_trading_days: 3,
        consistency_rule: {
          enabled: true,
          max_single_day_profit_pct: 50
        }
      }
    };

    // Pozitif günler toplamı: 6000 + 2000 + 2000 = 10,000$. En iyi gün: 6,000$ (%60 > %50)
    const trades = [
      { trade_date: '2026-05-01 10:00:00', pnl: 6000 },
      { trade_date: '2026-05-02 10:00:00', pnl: -1000 },
      { trade_date: '2026-05-03 10:00:00', pnl: 2000 },
      { trade_date: '2026-05-04 10:00:00', pnl: 2000 }
    ];

    const res = calculatePropStatus({ account, trades });
    assert.equal(res.consistency.best_day_profit, 6000);
    assert.equal(res.consistency.positive_days_profit_sum, 10000);
    assert.equal(res.consistency.best_day_profit_pct, 60);
    assert.equal(res.consistency.is_met, false);
    assert.equal(res.consistency.required_additional_profit, 2000);

    // İhlal DEĞİLDİR: fail_reasons boş olmalı
    assert.equal(res.fail_reasons.length, 0);
    assert.notEqual(res.overall_status, 'failed');
    assert.equal(res.overall_status, 'in_progress');
    assert.ok(res.warnings.includes('CONSISTENCY_NOT_MET'));
  });

  it('(g) Consistency ihlali sonrası ek kârla oran düzelince passed olabilir', () => {
    const account = {
      starting_balance: 100000,
      start_date: '2026-05-01',
      reset_tz: 'Europe/Prague',
      rules: {
        profit_target_pct: 10,
        min_trading_days: 3,
        consistency_rule: {
          enabled: true,
          max_single_day_profit_pct: 50
        }
      }
    };

    // 2000$ ek kâr yapıldı -> Pozitif toplam: 12,000$, En iyi gün: 6,000$ (%50 <= %50)
    const trades = [
      { trade_date: '2026-05-01 10:00:00', pnl: 6000 },
      { trade_date: '2026-05-02 10:00:00', pnl: -1000 },
      { trade_date: '2026-05-03 10:00:00', pnl: 2000 },
      { trade_date: '2026-05-04 10:00:00', pnl: 2000 },
      { trade_date: '2026-05-05 10:00:00', pnl: 2000 }
    ];

    const res = calculatePropStatus({ account, trades });
    assert.equal(res.consistency.is_met, true);
    assert.equal(res.consistency.best_day_profit_pct, 50);
    assert.equal(res.consistency.required_additional_profit, 0);
    assert.equal(res.overall_status, 'passed');
    assert.equal(res.warnings.includes('CONSISTENCY_NOT_MET'), false);
  });
});

describe('10. FundingPips Estimated Uyarısı (4e)', () => {
  it('(e) fundingpips higher_of_open_balance_equity referansı EQUITY_BASED_ESTIMATED uyarısı üretmelidir', () => {
    const account = {
      starting_balance: 100000,
      start_date: '2026-05-01',
      reset_tz: 'Etc/GMT-3',
      rules: getDefaultRules('fundingpips-2step-standard', 0)
    };

    const res = calculatePropStatus({
      account,
      trades: [{ trade_date: '2026-05-01 10:00:00', pnl: 1000 }]
    });
    assert.ok(res.warnings.includes('EQUITY_BASED_ESTIMATED'));
  });
});

describe('11. Girdi Doğrulama & Bozuk Rules Güvenliği (Aşama 4 Madde 4 & 1)', () => {
  it('starting_balance <= 0 veya geçersiz string gelirse throw etmemeli, invalid_rules dönmelidir', () => {
    const resNegative = calculatePropStatus({
      account: {
        starting_balance: -100000,
        reset_tz: 'Europe/Prague',
        rules: getDefaultRules('ftmo-2step', 0)
      },
      trades: []
    });
    assert.equal(resNegative.overall_status, 'invalid_rules');
    assert.equal(resNegative.error_code, 'INVALID_STARTING_BALANCE');

    const resNaN = calculatePropStatus({
      account: {
        starting_balance: 'gecersiz',
        reset_tz: 'Europe/Prague',
        rules: getDefaultRules('ftmo-2step', 0)
      },
      trades: []
    });
    assert.equal(resNaN.overall_status, 'invalid_rules');
    assert.equal(resNaN.error_code, 'INVALID_STARTING_BALANCE');
  });

  it('daily_loss_limit_pct negatif, NaN veya >100 gelirse invalid_rules dönmelidir', () => {
    const badDailyRules = Object.assign({}, getDefaultRules('ftmo-2step', 0), { daily_loss_limit_pct: -5 });
    const res = calculatePropStatus({
      account: {
        starting_balance: 100000,
        reset_tz: 'Europe/Prague',
        rules: badDailyRules
      },
      trades: []
    });
    assert.equal(res.overall_status, 'invalid_rules');
    assert.equal(res.error_code, 'INVALID_DAILY_LOSS_PCT');

    const badDailyOver100 = Object.assign({}, getDefaultRules('ftmo-2step', 0), { daily_loss_limit_pct: 120 });
    const res2 = calculatePropStatus({
      account: {
        starting_balance: 100000,
        reset_tz: 'Europe/Prague',
        rules: badDailyOver100
      },
      trades: []
    });
    assert.equal(res2.overall_status, 'invalid_rules');
    assert.equal(res2.error_code, 'INVALID_DAILY_LOSS_PCT');
  });

  it('max_loss_limit_pct veya profit_target_pct bozuk girilirse throw etmemeli, invalid_rules dönmelidir', () => {
    const badMax = Object.assign({}, getDefaultRules('ftmo-2step', 0), { max_loss_limit_pct: 'bozuk' });
    const resMax = calculatePropStatus({
      account: { starting_balance: 100000, reset_tz: 'Europe/Prague', rules: badMax },
      trades: []
    });
    assert.equal(resMax.overall_status, 'invalid_rules');
    assert.equal(resMax.error_code, 'INVALID_MAX_LOSS_PCT');

    const badTarget = Object.assign({}, getDefaultRules('ftmo-2step', 0), { profit_target_pct: -15 });
    const resTarget = calculatePropStatus({
      account: { starting_balance: 100000, reset_tz: 'Europe/Prague', rules: badTarget },
      trades: []
    });
    assert.equal(resTarget.overall_status, 'invalid_rules');
    assert.equal(resTarget.error_code, 'INVALID_PROFIT_TARGET_PCT');
  });

  it('time_shift_hours yarım saatlik (parseFloat: 3.5, -4.5) değerleri desteklemeli ve NaN durumunda 0a düşmelidir', () => {
    const account = {
      starting_balance: 100000,
      reset_tz: 'UTC',
      time_shift_hours: 3.5,
      rules: getDefaultRules('ftmo-2step', 0)
    };
    const trade = { trade_date: '2026-05-01 21:00:00', pnl: 500 };
    // 21:00 + 3.5 saat = ertesi gün 00:30 UTC
    const tradeDate = getPropTradeDate(trade, account.time_shift_hours, 'UTC');
    assert.equal(tradeDate, '2026-05-02');

    // NaN time shift -> 0 kabul edilmeli
    const nanAccount = {
      starting_balance: 100000,
      reset_tz: 'UTC',
      time_shift_hours: 'abc',
      rules: getDefaultRules('ftmo-2step', 0)
    };
    const res = calculatePropStatus({ account: nanAccount, trades: [trade] });
    assert.equal(res.account.time_shift_hours, 0);
  });
});

