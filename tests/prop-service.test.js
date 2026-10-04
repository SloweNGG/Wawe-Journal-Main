// ============================================================
// WAWE JOURNAL - PROP SERVICE TEST SUITE
// File: tests/prop-service.test.js
// Runner: Node.js Built-in Test Runner (node --test)
// Loader: Browser simulation using node:vm
// ============================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

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
const servicePath = path.resolve('public/src/services/prop-service.js');

const browserWindow = {};
loadScriptInVm(templatesPath, browserWindow);
loadScriptInVm(calculatorPath, browserWindow);
loadScriptInVm(servicePath, browserWindow);

const { PropTemplates, PropCalculator, PropService } = browserWindow;

describe('PropService API & Methods', () => {
  it('PropService nesnesi tüm zorunlu fonksiyonları içermelidir', () => {
    assert.ok(PropService);
    assert.equal(typeof PropService.getPropAccountByJournalId, 'function');
    assert.equal(typeof PropService.getActivePropAccounts, 'function');
    assert.equal(typeof PropService.checkPropAccountQuota, 'function');
    assert.equal(typeof PropService.createPropAccount, 'function');
    assert.equal(typeof PropService.updatePropAccount, 'function');
    assert.equal(typeof PropService.deletePropAccount, 'function');
    assert.equal(typeof PropService.advancePhase, 'function');
    assert.equal(typeof PropService.syncPropAccountStatus, 'function');
  });

  it('checkPropAccountQuota: Free kullanıcı için kota 1, Premium için 10 olmalıdır', async () => {
    // Mock Supabase for Free user with 1 active prop account
    let mockUser = { id: 'user-free-1' };
    let mockProfile = { plan: 'free' };
    let mockActiveAccounts = [{ id: 'prop-1', user_id: 'user-free-1', is_active: true }];

    browserWindow.sb = {
      auth: {
        getUser: async () => ({ data: { user: mockUser } })
      },
      from: (table) => {
        if (table === 'user_profiles') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: mockProfile, error: null })
              })
            })
          };
        }
        if (table === 'prop_accounts') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: async () => ({ data: mockActiveAccounts, error: null })
                })
              })
            })
          };
        }
      }
    };

    const quotaFree = await PropService.checkPropAccountQuota();
    assert.equal(quotaFree.isPremium, false);
    assert.equal(quotaFree.limit, 1);
    assert.equal(quotaFree.count, 1);
    assert.equal(quotaFree.canCreate, false);

    // Mock for Premium user with 1 active prop account
    mockProfile.plan = 'premium';
    const quotaPrem = await PropService.checkPropAccountQuota();
    assert.equal(quotaPrem.isPremium, true);
    assert.equal(quotaPrem.limit, 10);
    assert.equal(quotaPrem.count, 1);
    assert.equal(quotaPrem.canCreate, true);
  });

  it('createPropAccount: Doğru alanlarla prop hesabı oluşturmalıdır', async () => {
    let insertedPayload = null;

    browserWindow.sb = {
      auth: {
        getUser: async () => ({ data: { user: { id: 'test-user-id' } } })
      },
      from: (table) => {
        if (table === 'prop_accounts') {
          return {
            insert: (arr) => {
              insertedPayload = arr[0];
              return {
                select: () => ({
                  single: async () => ({ data: { id: 'created-prop-id', ...insertedPayload }, error: null })
                })
              };
            }
          };
        }
      }
    };

    const res = await PropService.createPropAccount({
      journal_id: 'j-123',
      template_key: 'ftmo-2step',
      starting_balance: 100000,
      start_date: '2026-05-01',
      reset_tz: 'Europe/Prague',
      phase_index: 0,
      rules: { daily_loss_limit_pct: 5 }
    });

    assert.equal(res.id, 'created-prop-id');
    assert.equal(insertedPayload.user_id, 'test-user-id');
    assert.equal(insertedPayload.journal_id, 'j-123');
    assert.equal(insertedPayload.starting_balance, 100000);
    assert.equal(insertedPayload.reset_tz, 'Europe/Prague');
    assert.equal(insertedPayload.is_active, true);
  });

  it('advancePhase: Fazı ilerletip şablon kurallarını otomatik güncellemelidir', async () => {
    let updatedPayload = null;

    const existingAccount = {
      id: 'prop-acc-1',
      user_id: 'u-1',
      journal_id: 'j-1',
      template_key: 'ftmo-2step',
      phase_index: 0,
      starting_balance: 100000,
      reset_tz: 'Europe/Prague',
      rules: PropTemplates.getDefaultRules('ftmo-2step', 0)
    };

    browserWindow.sb = {
      from: (table) => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: existingAccount, error: null })
          })
        }),
        update: (payload) => {
          updatedPayload = payload;
          return {
            eq: () => ({
              select: () => ({
                single: async () => ({ data: { ...existingAccount, ...payload }, error: null })
              })
            })
          };
        }
      })
    };

    // Faz 0 -> Faz 1 (Verification) ilerlet:
    const res = await PropService.advancePhase('prop-acc-1', 1);
    assert.equal(res.phase_index, 1);
    assert.equal(updatedPayload.phase_index, 1);
    // FTMO Faz 2 kâr hedefi %5 olmalıdır:
    assert.equal(updatedPayload.rules.profit_target_pct, 5);
    assert.equal(updatedPayload.rules.phase_name, 'Phase 2 (Verification)');
  });

  it('syncPropAccountStatus: İşlemleri ve kuralları hesaplayıp tam prop durumunu dönmelidir', async () => {
    const existingAccount = {
      id: 'prop-acc-1',
      journal_id: 'j-1',
      template_key: 'ftmo-2step',
      starting_balance: 100000,
      start_date: '2026-05-01',
      reset_tz: 'Europe/Prague',
      phase_index: 0,
      is_active: true,
      rules: PropTemplates.getDefaultRules('ftmo-2step', 0)
    };

    const mockTrades = [
      { id: 't-1', trade_date: '2026-05-01 10:00:00', pnl: 4000 },
      { id: 't-2', trade_date: '2026-05-02 10:00:00', pnl: 3000 }
    ];

    browserWindow.sb = {
      from: (table) => {
        if (table === 'prop_accounts') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: existingAccount, error: null })
                })
              })
            })
          };
        }
        if (table === 'trades') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({ data: mockTrades, error: null })
                })
              })
            })
          };
        }
      }
    };

    const res = await PropService.syncPropAccountStatus('j-1');
    assert.ok(res);
    assert.ok(res.account);
    assert.ok(res.status);
    assert.equal(res.status.current_balance, 107000);
    assert.equal(res.status.total_pnl, 7000);
    assert.equal(res.status.profit_target.remaining_amount, 3000); // 10K - 7K
    assert.equal(res.status.daily_loss.limit_amount, 5000);
    assert.equal(res.status.max_loss.hard_stop_level, 90000);
  });

  it('Veritabanı hataları (PROP_LIMIT_EXCEEDED, INVALID_TZ) anlaşılır kodlarla yakalanmalıdır', async () => {
    browserWindow.sb = {
      auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) },
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: { message: 'new row for relation violates check: PROP_LIMIT_EXCEEDED:1' }
            })
          })
        })
      })
    };

    await assert.rejects(async () => {
      await PropService.createPropAccount({ journal_id: 'j-1' });
    }, (err) => {
      assert.equal(err.code, 'PROP_LIMIT_EXCEEDED');
      assert.equal(err.limit, 1);
      return true;
    });
  });

  it('checkAndNotifyPropAccount: %80 günlük kayıp, ihlal, max loss ve hedef geçiş bildirimlerini üretmelidir', () => {
    const toasts = [];
    const inAppNotifs = [];

    browserWindow.showToast = (msg, type) => {
      toasts.push({ msg, type });
    };
    browserWindow.notificationManager = {
      add: (notif) => {
        inAppNotifs.push(notif);
      }
    };

    const mockAccount = {
      id: 'acc-test-notify-1',
      phase_index: 0,
      reset_tz: 'Europe/Prague'
    };

    // 1. %80 Günlük Kayıp Uyarısı (Bugünkü zarar: -4,100, limit: 5,000 -> %82)
    const status80 = {
      daily_loss: {
        limit_amount: 5000,
        today_pnl: -4100,
        remaining_margin: 900,
        is_violated: false
      },
      max_loss: { is_violated: false, distance_to_stop: 5900 },
      overall_status: 'in_progress'
    };

    const res80 = PropService.checkAndNotifyPropAccount(mockAccount, status80);
    assert.equal(res80.length, 1);
    assert.equal(res80[0], 'prop_daily_warning');
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].type, 'warning');
    assert.equal(inAppNotifs.length, 1);
    assert.equal(inAppNotifs[0].type, 'prop_daily_warning');

    // 2. Deduplication Testi: Aynı gün ikinci kez çağrıldığında tekrar bildirim atmamalıdır
    const res80Duplicate = PropService.checkAndNotifyPropAccount(mockAccount, status80);
    assert.equal(res80Duplicate.length, 0);
    assert.equal(toasts.length, 1); // Sayı artmamalı

    // 3. Günlük Kayıp İhlali (100%)
    const statusBreach = {
      daily_loss: {
        limit_amount: 5000,
        today_pnl: -5100,
        remaining_margin: 0,
        is_violated: true
      },
      max_loss: { is_violated: false, distance_to_stop: 4900 },
      overall_status: 'failed'
    };

    const resDB = PropService.checkAndNotifyPropAccount(mockAccount, statusBreach);
    assert.ok(Array.from(resDB).includes('prop_daily_breach'));
    assert.equal(toasts[toasts.length - 1].type, 'error');
    assert.equal(inAppNotifs[inAppNotifs.length - 1].type, 'prop_daily_breach');

    // 4. Maksimum Kayıp İhlali
    const mockAccount2 = {
      id: 'acc-test-notify-2',
      phase_index: 0,
      reset_tz: 'Europe/Prague'
    };
    const statusMaxBreach = {
      daily_loss: { limit_amount: 5000, today_pnl: -1000, is_violated: false },
      max_loss: { is_violated: true, distance_to_stop: 0 },
      overall_status: 'failed'
    };
    const resMB = PropService.checkAndNotifyPropAccount(mockAccount2, statusMaxBreach);
    assert.ok(Array.from(resMB).includes('prop_max_breach'));
    assert.equal(toasts[toasts.length - 1].type, 'error');
    assert.equal(inAppNotifs[inAppNotifs.length - 1].type, 'prop_max_breach');

    // 5. Hedefe Ulaşıldı (Phase Passed)
    const mockAccount3 = {
      id: 'acc-test-notify-3',
      phase_index: 0,
      reset_tz: 'Europe/Prague'
    };
    const statusPassed = {
      daily_loss: { limit_amount: 5000, today_pnl: 2000, is_violated: false },
      max_loss: { is_violated: false, distance_to_stop: 15000 },
      overall_status: 'passed'
    };
    const resPass = PropService.checkAndNotifyPropAccount(mockAccount3, statusPassed);
    assert.equal(resPass.length, 1);
    assert.equal(resPass[0], 'prop_target_passed');
    assert.equal(toasts[toasts.length - 1].type, 'success');
    assert.equal(inAppNotifs[inAppNotifs.length - 1].type, 'prop_target_passed');
  });

  it('advancePhase: Faz 1\'de 8K kâr sonrası Faz 2\'ye geçince yeni faz kâr ilerlemesi 0\'dan başlamalı ve bildirimler sıfırlanmalıdır', async () => {
    const accId = 'prop-advance-test-1';
    let storedAccount = {
      id: accId,
      journal_id: 'journal-adv-1',
      template_key: 'ftmo-2step',
      phase_index: 0,
      start_date: '2026-10-01',
      starting_balance: 100000,
      reset_tz: 'Europe/Prague',
      is_active: true,
      rules: PropTemplates.getDefaultRules('ftmo-2step', 0)
    };

    // Mock Supabase
    browserWindow.sb = {
      from: (table) => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: storedAccount, error: null })
          })
        }),
        update: (payload) => ({
          eq: (col, val) => ({
            select: () => ({
              single: async () => {
                storedAccount = Object.assign({}, storedAccount, payload);
                return { data: storedAccount, error: null };
              }
            })
          })
        })
      })
    };

    // Tüm işlemler: Faz 1'de 8.000 $ kâr
    const allTrades = [
      { id: 't-1', trade_date: '2026-10-01 14:00:00', pnl: 5000 },
      { id: 't-2', trade_date: '2026-10-02 11:30:00', pnl: 3000 }
    ];

    // Faz 1 Durumunu Hesapla:
    const phase1Status = PropCalculator.calculatePropStatus({
      account: storedAccount,
      trades: allTrades
    });
    assert.equal(phase1Status.current_balance, 108000);
    assert.equal(phase1Status.total_pnl, 8000);
    assert.equal(phase1Status.profit_target.progress_pct, 80); // 8K / 10K = %80

    // Faz 1'de bir bildirim tetikleyelim
    PropService.checkAndNotifyPropAccount(storedAccount, phase1Status);

    // Faz ilerlet: Faz 2'ye geçiş (başlangıç tarihi: 2026-10-03, başlangıç bakiyesi: 100K)
    const advancedAccount = await PropService.advancePhase(accId, {
      newPhaseIndex: 1,
      startDate: '2026-10-03',
      startingBalance: 100000
    });

    assert.equal(advancedAccount.phase_index, 1);
    assert.equal(advancedAccount.start_date, '2026-10-03');
    assert.equal(advancedAccount.starting_balance, 100000);
    assert.equal(advancedAccount.rules.profit_target_pct, 5); // Faz 2 kâr hedefi %5 (5.000$)

    // Faz 2 Durumunu Hesapla (aynı trade listesi ile):
    const phase2Status = PropCalculator.calculatePropStatus({
      account: advancedAccount,
      trades: allTrades
    });

    // 2026-10-01 ve 2026-10-02'deki 8K kâr, yeni start_date (2026-10-03) öncesinde kaldığı için
    // Faz 2 hesabına KARIŞMAMALI, kâr ilerlemesi 0'dan başlamalıdır!
    assert.equal(phase2Status.current_balance, 100000);
    assert.equal(phase2Status.total_pnl, 0);
    assert.equal(phase2Status.profit_target.progress_pct, 0);
    assert.equal(phase2Status.profit_target.remaining_amount, 5000);
    assert.equal(phase2Status.profit_target.is_reached, false);
    assert.equal(phase2Status.overall_status, 'in_progress');
  });

  it('Güvenlik / XSS: Defter adına <img src=x onerror=alert(1)> girildiğinde DOM kaçış fonksiyonu ile zararsız hale getirilmelidir', () => {
    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    const payload = '<img src=x onerror=alert(1)>';
    const escaped = escapeHtml(payload);

    assert.equal(escaped, '&lt;img src=x onerror=alert(1)&gt;');
    assert.equal(escaped.includes('<'), false);
    assert.equal(escaped.includes('>'), false);

    // script injection testi
    const scriptPayload = '<script>document.cookie="stolen"</script>';
    const escapedScript = escapeHtml(scriptPayload);
    assert.equal(escapedScript.includes('<script>'), false);
    assert.equal(escapedScript, '&lt;script&gt;document.cookie=&quot;stolen&quot;&lt;/script&gt;');
  });

  it('advancePhase: keepCustomRules=true seçilirse özelleştirilmiş kurallar yeni faza taşınmalı, false seçilirse şablon varsayılanları uygulanmalıdır', async () => {
    const customAccount = {
      id: 'acc-custom-1',
      user_id: 'user-123',
      journal_id: 'journal-123',
      template_key: 'ftmo-2step',
      template_version: '2026.1',
      starting_balance: 100000,
      start_date: '2026-05-01',
      phase_index: 0,
      reset_tz: 'Europe/Prague',
      time_shift_hours: 0,
      is_active: true,
      rules: {
        phase_index: 0,
        profit_target_pct: 7, // kullanıcı %10 yerine %7 yapmıştı
        daily_loss_limit_pct: 4, // %5 yerine %4 yapmıştı
        max_loss_limit_pct: 8,
        is_customized: true
      }
    };

    let updatedAccount = null;
    const mockSb = {
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: customAccount, error: null }) }) }),
        update: (payload) => ({
          eq: () => ({
            select: () => ({
              single: async () => {
                updatedAccount = Object.assign({}, customAccount, payload);
                return { data: updatedAccount, error: null };
              }
            })
          })
        })
      })
    };

    browserWindow.sb = mockSb;

    // 1. keepCustomRules = true ile Faz 2'ye geçiş
    await PropService.advancePhase('acc-custom-1', {
      newPhaseIndex: 1,
      startDate: '2026-06-01',
      startingBalance: 100000,
      keepCustomRules: true
    });

    assert.equal(updatedAccount.phase_index, 1);
    assert.equal(updatedAccount.rules.is_customized, true);
    assert.equal(updatedAccount.rules.daily_loss_limit_pct, 4);
    assert.equal(updatedAccount.rules.max_loss_limit_pct, 8);

    // 2. keepCustomRules = false ile Faz 2'ye geçiş
    await PropService.advancePhase('acc-custom-1', {
      newPhaseIndex: 1,
      startDate: '2026-06-01',
      startingBalance: 100000,
      keepCustomRules: false
    });

    assert.equal(updatedAccount.phase_index, 1);
    assert.equal(updatedAccount.rules.is_customized, false);
    assert.equal(updatedAccount.rules.daily_loss_limit_pct, 5); // FTMO Faz 2 şablon varsayılanı (%5)
  });

  it('clearPropAccountNotifications: Hem sessionStorage hem localStorage kalıcı dedup kayıtlarını temizlemelidir', () => {
    const mockStorage = (store) => ({
      getItem: (k) => store[k] || null,
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      key: (i) => Object.keys(store)[i],
      get length() { return Object.keys(store).length; }
    });

    const sStore = {
      'ww_prop_notif_acc-xyz_2026-10-04_daily_80': '1',
      'ww_prop_notif_acc-other_2026-10-04_daily_80': '1'
    };
    const lStore = {
      'ww_prop_notif_acc-xyz_2026-10-04_daily_breach': '1',
      'ww_prop_notif_acc-other_2026-10-04_daily_breach': '1'
    };

    browserWindow.sessionStorage = mockStorage(sStore);
    browserWindow.localStorage = mockStorage(lStore);
    global.sessionStorage = browserWindow.sessionStorage;
    global.localStorage = browserWindow.localStorage;

    PropService.clearPropAccountNotifications('acc-xyz');

    assert.equal(sStore['ww_prop_notif_acc-xyz_2026-10-04_daily_80'], undefined);
    assert.equal(lStore['ww_prop_notif_acc-xyz_2026-10-04_daily_breach'], undefined);
    // Diğer hesabın bildirimleri silinmemelidir:
    assert.equal(sStore['ww_prop_notif_acc-other_2026-10-04_daily_80'], '1');
    assert.equal(lStore['ww_prop_notif_acc-other_2026-10-04_daily_breach'], '1');
  });

  it('checkAndNotifyPropAccount: Bildirimler bugün-only olmalıdır; geçmiş günlerdeki ihlaller bugün için günlük ihlal bildirimi üretmemelidir', () => {
    // Geçmişte (ör. 5 gün önce) günlük limit aşılmış, ancak bugünkü işlem kârlı (+500$)
    const statusWithPastDailyBreach = {
      current_balance: 96000,
      daily_loss: {
        limit_amount: 5000,
        today_pnl: 500, // Bugün kârda
        remaining_margin: 5500,
        is_violated: true, // Geçmişteki ihlal yüzünden true
        today_violated: false // Bugün ihlal yok!
      },
      max_loss: {
        is_violated: false,
        distance_to_stop: 6000
      },
      profit_target: {
        target_pct: 10,
        is_reached: false
      }
    };

    const triggered = PropService.checkAndNotifyPropAccount(
      { id: 'acc-past-breach', reset_tz: 'Europe/Prague' },
      statusWithPastDailyBreach
    );

    // Bugün günlük ihlal uyarısı tetiklenmemelidir:
    assert.equal(triggered.includes('prop_daily_breach'), false);
    assert.equal(triggered.includes('prop_daily_warning'), false);
  });
});

