// ============================================================
// WAWE JOURNAL - OVERTRADE FEATURE
// ============================================================

import { sb } from '../core/supabase.js';
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from '../core/storage.js';
import { OT_STORAGE_KEY, OT_DISMISSED_KEY } from '../core/config.js';
import { calcPnL } from '../utils/helpers.js';
import { getUserPlanSilent } from '../services/user.js';
import { showToast } from '../utils/ui.js';

export function getOvertradeSettings() {
  try {
    const saved = safeLocalStorageGet(OT_STORAGE_KEY, null);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        dailyLimit: parsed.dailyLimit ?? 5,
        weeklyLimit: parsed.weeklyLimit ?? 20,
        dailyLossLimit: parsed.dailyLossLimit ?? 1000,
        warningLevel: parsed.warningLevel ?? 'warning',
        enabled: parsed.enabled ?? true
      };
    }
  } catch (e) {
    wwLog.warn('OverTrade ayarları okunamadı:', e);
  }
  return { dailyLimit: 5, weeklyLimit: 20, dailyLossLimit: 1000, warningLevel: 'warning', enabled: true };
}

export function saveOvertradeSettings(settings) {
  try {
    const current = getOvertradeSettings();
    const merged = { ...current, ...settings };
    safeLocalStorageSet(OT_STORAGE_KEY, JSON.stringify(merged));
    return true;
  } catch (e) {
    console.error('OverTrade ayarları kaydedilemedi:', e);
    return false;
  }
}

export function getDismissedOvertradeWarnings() {
  try {
    const saved = safeLocalStorageGet(OT_DISMISSED_KEY, '[]');
    return JSON.parse(saved);
  } catch (e) {
    return [];
  }
}

export function setDismissedOvertradeWarnings(dismissedArray) {
  try {
    safeLocalStorageSet(OT_DISMISSED_KEY, JSON.stringify(dismissedArray));
    return true;
  } catch (e) {
    return false;
  }
}

export function dismissOvertradeWarning(warningId) {
  try {
    if (!warningId) return false;
    const strId = warningId.toString();
    const cleanId = strId.replace(/^ot_/, '');
    const prefixedId = 'ot_' + cleanId;
    const dismissed = getDismissedOvertradeWarnings();

    if (!dismissed.includes(strId)) dismissed.push(strId);
    if (!dismissed.includes(cleanId)) dismissed.push(cleanId);
    if (!dismissed.includes(prefixedId)) dismissed.push(prefixedId);
    setDismissedOvertradeWarnings(dismissed);

    // Aktif bellek içi uyarıları da anında filtrele
    if (typeof window !== 'undefined' && Array.isArray(window._activeOvertradeWarnings)) {
      window._activeOvertradeWarnings = window._activeOvertradeWarnings.filter(w => {
        const wid = (w.id || w.type || '').toString();
        const wClean = wid.replace(/^ot_/, '');
        return wid !== strId && wid !== cleanId && wid !== prefixedId && wClean !== cleanId && w.type !== cleanId;
      });
    }

    const element = document.getElementById('ot-warning-' + strId) ||
                    document.getElementById('ot-warning-' + cleanId) ||
                    document.getElementById('ot-warning-' + prefixedId);
    if (element) {
      element.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      element.style.opacity = '0';
      element.style.transform = 'translateX(30px)';
      setTimeout(function() {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      }, 350);
    }
    return true;
  } catch (e) {
    console.error('Uyarı kapatılamadı:', e);
    return false;
  }
}

export function isOvertradeWarningDismissed(warningId) {
  try {
    if (!warningId) return false;
    const strId = warningId.toString();
    const cleanId = strId.replace(/^ot_/, '');
    const prefixedId = 'ot_' + cleanId;
    const dismissed = getDismissedOvertradeWarnings();
    return dismissed.includes(strId) || dismissed.includes(cleanId) || dismissed.includes(prefixedId);
  } catch (e) {
    return false;
  }
}

export function clearDismissedOvertradeWarnings() {
  try {
    safeLocalStorageRemove(OT_DISMISSED_KEY);
    return true;
  } catch (e) {
    return false;
  }
}

export function checkOvertrade(trades) {
  try {
    if (!trades || !Array.isArray(trades) || trades.length === 0) {
      return [];
    }
    
    const settings = getOvertradeSettings();
    
    if (settings.enabled === false) {
      return [];
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    const todayTrades = trades.filter(function(t) { 
      return t.trade_date && t.trade_date === today; 
    });
    const todayCount = todayTrades.length;
    
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekTrades = trades.filter(function(t) { 
      return t.trade_date && new Date(t.trade_date) >= weekAgo; 
    });
    const weekCount = weekTrades.length;
    
    let todayPnL = 0;
    todayTrades.forEach(function(t) {
      if (t.exit_price && t.entry_price && t.lot) {
        const multiplier = t.multiplier || INSTRUMENT_MULTIPLIERS[t.instrument] || 100000;
        const pnl = calcPnL(t.entry_price, t.exit_price, t.lot, t.direction, 'other', multiplier);
        if (!isNaN(pnl)) {
          todayPnL += pnl;
        }
      }
    });
    todayPnL = Math.round(todayPnL * 100) / 100;
    
    const warnings = [];
    
    if (todayCount > settings.dailyLimit) {
      const id = 'ot_daily_' + today;
      if (!isOvertradeWarningDismissed(id) && !isOvertradeWarningDismissed('daily_trades')) {
        warnings.push({
          id: id,
          level: settings.warningLevel || 'warning',
          type: 'daily_trades',
          current: todayCount,
          limit: settings.dailyLimit,
          message: (typeof i18n !== 'undefined' && i18n.t) 
            ? i18n.t('overtrade.daily_limit_warning', { current: todayCount, limit: settings.dailyLimit }) 
            : 'Bugün ' + todayCount + ' işlem yaptın. Günlük limitin ' + settings.dailyLimit + '!'
        });
      }
    }
    
    if (weekCount > settings.weeklyLimit) {
      const id = 'ot_weekly_' + today;
      if (!isOvertradeWarningDismissed(id) && !isOvertradeWarningDismissed('weekly_trades')) {
        warnings.push({
          id: id,
          level: settings.warningLevel || 'warning',
          type: 'weekly_trades',
          current: weekCount,
          limit: settings.weeklyLimit,
          message: (typeof i18n !== 'undefined' && i18n.t) 
            ? i18n.t('overtrade.weekly_limit_warning', { current: weekCount, limit: settings.weeklyLimit }) 
            : 'Bu hafta ' + weekCount + ' işlem yaptın. Haftalık limitin ' + settings.weeklyLimit + '!'
        });
      }
    }
    
    if (todayPnL < -settings.dailyLossLimit) {
      const roundedLoss = Math.abs(todayPnL);
      const id = 'ot_loss_' + today;
      if (!isOvertradeWarningDismissed(id) && !isOvertradeWarningDismissed('daily_loss')) {
        const cSymbol = (typeof getCurrencySymbol === 'function') ? getCurrencySymbol() : (window.currencySymbol || '$');
        const fmtLoss = cSymbol + (roundedLoss % 1 === 0 ? roundedLoss.toLocaleString() : roundedLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        const fmtLimit = cSymbol + (Number(settings.dailyLossLimit) % 1 === 0 ? Number(settings.dailyLossLimit).toLocaleString() : Number(settings.dailyLossLimit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

        warnings.push({
          id: id,
          level: 'danger',
          type: 'daily_loss',
          current: roundedLoss,
          limit: settings.dailyLossLimit,
          message: (typeof i18n !== 'undefined' && i18n.t) 
            ? i18n.t('overtrade.daily_loss_warning', { loss: fmtLoss, limit: fmtLimit }) 
            : ('Bugün ' + fmtLoss + ' kaybettin. Günlük kayıp limitin ' + fmtLimit + '!')
        });
      }
    }
    
    return warnings;
    
  } catch (error) {
    console.error('checkOvertrade hatası:', error);
    return [];
  }
}

// ============================================================
// ⭐ RENDER OVERTRADE WARNING - GELİŞTİRİLMİŞ TASARIM
// ============================================================

export function renderOvertradeWarning(warnings, containerId) {
  try {
    const container = document.getElementById(containerId);
    if (!container) {
      wwLog.warn('renderOvertradeWarning: container bulunamadı:', containerId);
      return;
    }
    
    container.innerHTML = '';
    
    if (!warnings || !Array.isArray(warnings) || warnings.length === 0) {
      container.innerHTML = `
        <div class="notif-item ot-good">
          <div class="notif-icon success">
            <i data-lucide="circle-check"></i>
          </div>
          <div class="notif-content">
            <div class="notif-title" style="color:var(--green);">${(typeof i18n !== 'undefined' && i18n.t) ? i18n.t('overtrade.all_good') : 'Her şey yolunda!'}</div>
            <div class="notif-desc">${(typeof i18n !== 'undefined' && i18n.t) ? i18n.t('overtrade.all_good_desc') : 'Tüm limitlerin içindesin.'}</div>
          </div>
        </div>
      `;
      
      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
      }
      return;
    }
    
    const levelConfigs = {
      info: { 
        iconClass: 'info',
        icon: 'info',
        label: (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('overtrade.info') : 'Bilgi'
      },
      warning: { 
        iconClass: 'warning',
        icon: 'triangle-alert',
        label: (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('overtrade.warning') : 'Uyarı'
      },
      danger: { 
        iconClass: 'danger',
        icon: 'octagon-alert',
        label: (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('overtrade.danger') : 'Tehlike'
      }
    };
    
    const typeLabels = {
      daily_trades: (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('overtrade.daily_trades') : 'Günlük İşlem',
      weekly_trades: (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('overtrade.weekly_trades') : 'Haftalık İşlem',
      daily_loss: (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('overtrade.loss') : 'Kayıp'
    };
    
    warnings.forEach(function(w) {
      const config = levelConfigs[w.level] || levelConfigs.warning;
      const warningId = w.id || 'ot_warning_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      
      const card = document.createElement('div');
      card.id = 'ot-warning-' + warningId;
      card.className = 'notif-item';
      
      const isLossType = w.type === 'daily_loss';
      const cSymbol = (typeof getCurrencySymbol === 'function') ? getCurrencySymbol() : (window.currencySymbol || '$');
      let isOverLimit = false;
      let currentDisplay = '';
      let limitDisplay = '';

      if (isLossType) {
        const absVal = Math.abs(Number(w.current) || 0);
        const limVal = Number(w.limit) || 0;
        isOverLimit = absVal >= limVal;
        const fCur = absVal % 1 === 0 ? absVal.toLocaleString() : absVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const fLim = limVal % 1 === 0 ? limVal.toLocaleString() : limVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        currentDisplay = cSymbol + fCur;
        limitDisplay = cSymbol + fLim;
      } else {
        const numCur = Math.round(Number(w.current) || 0);
        const numLim = Math.round(Number(w.limit) || 0);
        isOverLimit = numCur >= numLim;
        currentDisplay = numCur.toLocaleString();
        limitDisplay = numLim.toLocaleString();
      }
      
      card.innerHTML = `
        <div class="notif-icon ${config.iconClass}">
          <i data-lucide="${config.icon}"></i>
        </div>
        <div class="notif-content">
          <div class="notif-title">${w.message || 'Uyarı'}</div>
          <div class="notif-desc">
            <span style="display:inline-flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-top:2px;">
              <span style="font-size:9px;font-weight:600;font-family:'DM Mono',monospace;background:${config.iconClass === 'danger' ? 'rgba(239,68,68,0.12)' : config.iconClass === 'warning' ? 'rgba(251,191,36,0.12)' : 'rgba(59,130,246,0.12)'};color:${config.iconClass === 'danger' ? '#ef4444' : config.iconClass === 'warning' ? '#f59e0b' : '#3b82f6'};padding:0.15rem 0.6rem;border-radius:10px;border:1px solid ${config.iconClass === 'danger' ? 'rgba(239,68,68,0.2)' : config.iconClass === 'warning' ? 'rgba(251,191,36,0.2)' : 'rgba(59,130,246,0.2)'};">
                ${config.label}
              </span>
            </span>
          </div>
          <div class="notif-ot-stats" style="display:flex;gap:1rem;font-size:11px;color:var(--muted);margin-top:4px;flex-wrap:wrap;align-items:center;">
            <span style="display:inline-flex;align-items:center;gap:4px;background:rgba(255,255,255,0.04);padding:0.15rem 0.6rem;border-radius:4px;font-family:'DM Mono',monospace;">
              <span style="font-weight:700;color:${isOverLimit ? 'var(--red)' : 'var(--text)'};">${currentDisplay}</span>
              <span style="opacity:0.4;">/</span>
              <span style="opacity:0.7;">${limitDisplay}</span>
            </span>
            <span style="opacity:0.6;">${typeLabels[w.type] || w.type || 'Genel'}</span>
            ${isOverLimit ? '<span style="font-size:9px;font-weight:600;color:var(--red);background:rgba(239,68,68,0.08);padding:0.05rem 0.4rem;border-radius:4px;border:1px solid rgba(239,68,68,0.15);">⚠️ LİMİT AŞIMI</span>' : ''}
          </div>
        </div>
        <button class="notif-close" onclick="window.dismissOvertradeWarning('${warningId}')">
          <i data-lucide="x"></i>
        </button>
      `;
      
      container.appendChild(card);
    });
    
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
    
  } catch (error) {
    console.error('renderOvertradeWarning hatası:', error);
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = `
        <div class="notif-item">
          <div class="notif-icon danger">
            <i data-lucide="octagon-alert"></i>
          </div>
          <div class="notif-content">
            <div class="notif-title" style="color:var(--red);">Uyarı sistemi geçici olarak kullanılamıyor</div>
            <div class="notif-desc">Lütfen daha sonra tekrar deneyin.</div>
          </div>
        </div>
      `;
      
      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
      }
    }
  }
}

export async function checkAndRenderOvertrade(containerId) {
  try {
    const container = document.getElementById(containerId);
    if (!container) {
      wwLog.warn('checkAndRenderOvertrade: container bulunamadı:', containerId);
      return;
    }
    
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      container.innerHTML = '';
      return;
    }
    
    const { plan } = await getUserPlanSilent();
    if (plan !== 'premium') {
      container.innerHTML = '';
      return;
    }
    
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];

    const { data: trades, error } = await sb
      .from('trades')
      .select('trade_date,entry_price,exit_price,lot,direction,instrument,multiplier')
      .eq('user_id', session.user.id)
      .gte('trade_date', weekAgoStr)
      .order('trade_date', { ascending: false });
    
    if (error) {
      console.error('checkAndRenderOvertrade: işlemler alınamadı:', error);
      container.innerHTML = '';
      return;
    }
    
    const warnings = checkOvertrade(trades || []);
    renderOvertradeWarning(warnings, containerId);
    
  } catch (error) {
    console.error('checkAndRenderOvertrade hatası:', error);
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = '';
    }
  }
}

export async function loadOvertradeSettingsUI(containerId) {
  try {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const t = (key, params) => (typeof i18n !== 'undefined' && i18n.t) ? i18n.t(key, params) : key;
    const applyI18n = () => { if (typeof i18n !== 'undefined' && i18n.apply) try { i18n.apply(); } catch(e) {} };
    
    const { plan } = await getUserPlanSilent();
    const isPremiumUser = plan === 'premium';
    
    if (!isPremiumUser) {
      const tpl = document.getElementById('tpl-overtrade-locked');
      if (!tpl) return;
      container.innerHTML = '';
      container.appendChild(tpl.content.cloneNode(true));
      applyI18n();
      return;
    }
    
    const settings = getOvertradeSettings();
    
    const tpl = document.getElementById('tpl-overtrade-premium');
    if (!tpl) return;
    const clone = tpl.content.cloneNode(true);
    
    const enabledCb = clone.querySelector('#ot-enabled');
    if (enabledCb) enabledCb.checked = settings.enabled !== false;
    
    const dailyEl = clone.querySelector('#ot-daily-limit');
    if (dailyEl) dailyEl.value = settings.dailyLimit || 5;
    
    const weeklyEl = clone.querySelector('#ot-weekly-limit');
    if (weeklyEl) weeklyEl.value = settings.weeklyLimit || 20;
    
    const lossEl = clone.querySelector('#ot-loss-limit');
    if (lossEl) lossEl.value = settings.dailyLossLimit || 1000;
    
    const levelEl = clone.querySelector('#ot-warning-level');
    if (levelEl) levelEl.value = settings.warningLevel || 'warning';
    
    // data-icon placeholder'ları doldur
    clone.querySelectorAll('[data-icon]').forEach(function(el) {
      const name = el.getAttribute('data-icon');
      if (typeof window.getLucideIcon === 'function') {
        el.innerHTML = window.getLucideIcon(name, 14);
      } else if (typeof getLucideIcon === 'function') {
        el.innerHTML = getLucideIcon(name, 14);
      }
    });
    
    container.innerHTML = '';
    container.appendChild(clone);
    
    applyI18n();
    
    const enabledCheckbox = document.getElementById('ot-enabled');
    const dailyLimitInput = document.getElementById('ot-daily-limit');
    const weeklyLimitInput = document.getElementById('ot-weekly-limit');
    const lossLimitInput = document.getElementById('ot-loss-limit');
    const warningLevelSelect = document.getElementById('ot-warning-level');
    const saveBtn = document.getElementById('ot-save-settings');
    const clearBtn = document.getElementById('ot-clear-dismissed');
    const resetBtn = document.getElementById('ot-reset-defaults');
    
    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        const newSettings = {
          enabled: enabledCheckbox ? enabledCheckbox.checked : true,
          dailyLimit: parseInt(dailyLimitInput?.value) || 5,
          weeklyLimit: parseInt(weeklyLimitInput?.value) || 20,
          dailyLossLimit: parseFloat(lossLimitInput?.value) || 1000,
          warningLevel: warningLevelSelect?.value || 'warning'
        };
        saveOvertradeSettings(newSettings);
        showToast('✅ ' + t('overtrade.settings_saved'), 'success');
        const otContainer = document.getElementById('overtrade-container');
        if (otContainer) checkAndRenderOvertrade('overtrade-container');
      });
    }
    
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        clearDismissedOvertradeWarnings();
        showToast('🗑️ ' + t('overtrade.dismissed_cleared'), 'success');
        const otContainer = document.getElementById('overtrade-container');
        if (otContainer) checkAndRenderOvertrade('overtrade-container');
      });
    }
    
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        const defaultSettings = { dailyLimit: 5, weeklyLimit: 20, dailyLossLimit: 1000, warningLevel: 'warning', enabled: true };
        saveOvertradeSettings(defaultSettings);
        showToast('↺ ' + t('overtrade.reset_success'), 'success');
        loadOvertradeSettingsUI(containerId);
        const otContainer = document.getElementById('overtrade-container');
        if (otContainer) checkAndRenderOvertrade('overtrade-container');
      });
    }
    
  } catch (error) {
    console.error('loadOvertradeSettingsUI hatası:', error);
    const container = document.getElementById(containerId);
    if (container) {
      const tplErr = document.getElementById('tpl-overtrade-error');
      if (tplErr) {
        container.innerHTML = '';
        container.appendChild(tplErr.content.cloneNode(true));
        if (typeof i18n !== 'undefined' && i18n.apply) try { i18n.apply(); } catch(e) {}
      }
    }
  }
}

let _overtradePromise = null;
let _lastOvertradeCheck = 0;

// ⭐ GLOBAL OVERTRADE BELL FONKSİYONU
export async function updateOvertradeBell(force = false) {
  try {
    const now = Date.now();
    if (!force && _overtradePromise) return _overtradePromise;
    if (!force && now - _lastOvertradeCheck < 60000 && window._activeOvertradeWarnings !== undefined) {
      return;
    }

    _overtradePromise = (async () => {
      try {
        const sbClient = window.sb || sb;
        if (!sbClient) return;

        const { data: { session } } = await sbClient.auth.getSession();
        if (!session) {
          window._activeOvertradeWarnings = [];
          if (typeof window.loadNotifications === 'function') {
            window.loadNotifications();
          }
          return;
        }

        const { plan } = await getUserPlanSilent();
        if (plan !== 'premium') {
          window._activeOvertradeWarnings = [];
          _lastOvertradeCheck = Date.now();
          if (typeof window.loadNotifications === 'function') {
            window.loadNotifications();
          }
          return;
        }

        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().split('T')[0];

        const { data: trades, error } = await sbClient
          .from('trades')
          .select('trade_date,entry_price,exit_price,lot,direction,instrument,multiplier')
          .eq('user_id', session.user.id)
          .gte('trade_date', weekAgoStr)
          .order('trade_date', { ascending: false });

        if (error || !trades) {
          window._activeOvertradeWarnings = [];
          _lastOvertradeCheck = Date.now();
          if (typeof window.loadNotifications === 'function') {
            window.loadNotifications();
          }
          return;
        }

        const warnings = checkOvertrade(trades || []) || [];
        window._activeOvertradeWarnings = warnings;
        _lastOvertradeCheck = Date.now();

        if (typeof window.loadNotifications === 'function') {
          await window.loadNotifications();
        }
      } finally {
        _overtradePromise = null;
      }
    })();

    return _overtradePromise;
  } catch(e) {
    wwLog.warn('updateOvertradeBell hatası:', e);
  }
}

// ⭐ GLOBAL EXPORT - TÜM SAYFALARDAN ERİŞİLEBİLİR
window.updateOvertradeBell = updateOvertradeBell;