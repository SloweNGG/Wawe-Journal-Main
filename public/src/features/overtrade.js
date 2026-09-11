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
    const dismissed = getDismissedOvertradeWarnings();
    if (!dismissed.includes(warningId)) {
      dismissed.push(warningId);
      setDismissedOvertradeWarnings(dismissed);
    }
    const element = document.getElementById('ot-warning-' + warningId);
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
    const dismissed = getDismissedOvertradeWarnings();
    return dismissed.includes(warningId);
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
    
    const warnings = [];
    const baseId = 'ot_' + Date.now() + '_';
    
    if (todayCount > settings.dailyLimit) {
      const id = baseId + 'daily_' + todayCount + '_' + settings.dailyLimit;
      if (!isOvertradeWarningDismissed(id)) {
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
      const id = baseId + 'weekly_' + weekCount + '_' + settings.weeklyLimit;
      if (!isOvertradeWarningDismissed(id)) {
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
      const id = baseId + 'loss_' + Math.abs(Math.round(todayPnL)) + '_' + settings.dailyLossLimit;
      if (!isOvertradeWarningDismissed(id)) {
        warnings.push({
          id: id,
          level: 'danger',
          type: 'daily_loss',
          current: todayPnL,
          limit: settings.dailyLossLimit,
          message: (typeof i18n !== 'undefined' && i18n.t) 
            ? i18n.t('overtrade.daily_loss_warning', { loss: window.formatCurrency ? window.formatCurrency(todayPnL) : todayPnL, limit: settings.dailyLossLimit }) 
            : 'Bugün ' + (window.formatCurrency ? window.formatCurrency(todayPnL) : todayPnL) + ' kaybettin. Günlük kayıp limitin $' + settings.dailyLossLimit + '!'
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
      
      const isOverLimit = w.current > w.limit;
      const currentDisplay = w.current || 0;
      const limitDisplay = w.limit || 0;
      
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
            ${w.current > w.limit ? '<span style="font-size:9px;font-weight:600;color:var(--red);background:rgba(239,68,68,0.08);padding:0.05rem 0.4rem;border-radius:4px;border:1px solid rgba(239,68,68,0.15);">⚠️ LİMİT AŞIMI</span>' : ''}
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
    
    const { data: trades, error } = await sb
      .from('trades')
      .select('*')
      .eq('user_id', session.user.id)
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
    
    const { plan } = await getUserPlanSilent();
    const isPremiumUser = plan === 'premium';
    
    if (!isPremiumUser) {
      container.innerHTML = `
        <div style="text-align:center;padding:2rem;background:var(--surface2);border-radius:var(--radius);border:1px solid var(--border);">
          <div style="font-size:2.5rem;margin-bottom:0.75rem;">💎</div>
          <h3 style="font-family:'Syne',sans-serif;font-size:1rem;color:var(--text);margin-bottom:0.5rem;">OverTrade Uyarıları</h3>
          <p style="color:var(--muted);font-size:13px;max-width:400px;margin:0 auto 1rem;">Bu özellik sadece Premium üyelere özeldir. İşlem limitlerini ve kayıp kontrollerini yaparak daha disiplinli ticaret yapın.</p>
          <a href="settings.html#panel-plan" class="btn btn-primary" style="display:inline-flex;">Premium'a Geç →</a>
        </div>
      `;
      return;
    }
    
    const settings = getOvertradeSettings();
    
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:1.25rem;">
        <div style="display:flex;align-items:center;gap:0.75rem;">
          <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;font-size:13px;color:var(--text);">
            <input type="checkbox" id="ot-enabled" ${settings.enabled !== false ? 'checked' : ''} style="accent-color:var(--accent);width:18px;height:18px;cursor:pointer;">
            OverTrade Uyarılarını Aktif Et
          </label>
        </div>
        
        <div class="field" style="margin:0;">
          <label style="font-size:13px;font-weight:500;color:var(--text);">Günlük İşlem Limiti</label>
          <div style="display:flex;align-items:center;gap:0.75rem;margin-top:4px;">
            <input type="number" id="ot-daily-limit" value="${settings.dailyLimit || 5}" min="1" max="100" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:0.5rem 0.75rem;color:var(--text);font-family:'DM Mono',monospace;font-size:13px;width:100px;">
            <span style="font-size:12px;color:var(--muted);">işlem</span>
          </div>
          <p style="font-size:11px;color:var(--muted);margin-top:4px;">Bu limiti aştığında uyarı alırsın.</p>
        </div>
        
        <div class="field" style="margin:0;">
          <label style="font-size:13px;font-weight:500;color:var(--text);">Haftalık İşlem Limiti</label>
          <div style="display:flex;align-items:center;gap:0.75rem;margin-top:4px;">
            <input type="number" id="ot-weekly-limit" value="${settings.weeklyLimit || 20}" min="1" max="500" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:0.5rem 0.75rem;color:var(--text);font-family:'DM Mono',monospace;font-size:13px;width:100px;">
            <span style="font-size:12px;color:var(--muted);">işlem</span>
          </div>
          <p style="font-size:11px;color:var(--muted);margin-top:4px;">Bu limiti aştığında uyarı alırsın.</p>
        </div>
        
        <div class="field" style="margin:0;">
          <label style="font-size:13px;font-weight:500;color:var(--text);">Günlük Kayıp Limiti</label>
          <div style="display:flex;align-items:center;gap:0.75rem;margin-top:4px;">
            <span style="font-size:12px;color:var(--muted);">$</span>
            <input type="number" id="ot-loss-limit" value="${settings.dailyLossLimit || 1000}" min="1" max="999999" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:0.5rem 0.75rem;color:var(--text);font-family:'DM Mono',monospace;font-size:13px;width:100px;">
          </div>
          <p style="font-size:11px;color:var(--muted);margin-top:4px;">Bu limiti aştığında uyarı alırsın.</p>
        </div>
        
        <div class="field" style="margin:0;">
          <label style="font-size:13px;font-weight:500;color:var(--text);">Uyarı Seviyesi</label>
          <select id="ot-warning-level" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:0.5rem 0.75rem;color:var(--text);font-family:'DM Mono',monospace;font-size:13px;margin-top:4px;">
            <option value="info" ${settings.warningLevel === 'info' ? 'selected' : ''}>ℹ️ Bilgi</option>
            <option value="warning" ${settings.warningLevel === 'warning' ? 'selected' : ''}>⚠️ Uyarı</option>
            <option value="danger" ${settings.warningLevel === 'danger' ? 'selected' : ''}>🚨 Tehlike</option>
          </select>
        </div>
        
        <button id="ot-save-settings" class="btn btn-primary" style="align-self:flex-start;display:inline-flex;gap:0.5rem;align-items:center;">
          💾 Ayarları Kaydet
        </button>
        
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-top:0.5rem;padding-top:0.75rem;border-top:1px solid var(--border);">
          <button id="ot-clear-dismissed" class="btn btn-ghost" style="font-size:12px;padding:0.4rem 0.8rem;">
            🗑️ Kapatılan Uyarıları Temizle
          </button>
          <button id="ot-reset-defaults" class="btn btn-ghost" style="font-size:12px;padding:0.4rem 0.8rem;">
            ↺ Varsayılana Dön
          </button>
        </div>
      </div>
    `;
    
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
        showToast('✅ OverTrade ayarları kaydedildi!', 'success');
        
        const otContainer = document.getElementById('overtrade-container');
        if (otContainer) {
          checkAndRenderOvertrade('overtrade-container');
        }
      });
    }
    
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        clearDismissedOvertradeWarnings();
        showToast('🗑️ Kapatılan uyarılar temizlendi.', 'success');
        const otContainer = document.getElementById('overtrade-container');
        if (otContainer) {
          checkAndRenderOvertrade('overtrade-container');
        }
      });
    }
    
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        const defaultSettings = { dailyLimit: 5, weeklyLimit: 20, dailyLossLimit: 1000, warningLevel: 'warning', enabled: true };
        saveOvertradeSettings(defaultSettings);
        showToast('↺ Varsayılan ayarlara döndürüldü.', 'success');
        loadOvertradeSettingsUI(containerId);
        const otContainer = document.getElementById('overtrade-container');
        if (otContainer) {
          checkAndRenderOvertrade('overtrade-container');
        }
      });
    }
    
  } catch (error) {
    console.error('loadOvertradeSettingsUI hatası:', error);
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = `
        <div style="text-align:center;padding:1.5rem;background:var(--surface2);border-radius:var(--radius);border:1px solid var(--border);">
          <p style="color:var(--muted);font-size:13px;">Ayarlar yüklenirken bir hata oluştu.</p>
          <button onclick="window.loadOvertradeSettingsUI('${containerId}')" class="btn btn-ghost" style="margin-top:0.5rem;">🔄 Yeniden Dene</button>
        </div>
      `;
    }
  }
}

// ⭐ GLOBAL OVERTRADE BELL FONKSİYONU
export async function updateOvertradeBell() {
  try {
    // ⭐ DEBUG: Elementlerin var olup olmadığını kontrol et
    var body = document.getElementById('bell-panel-body');
    var dot = document.getElementById('bell-dot');
    var bellBtn = document.getElementById('overtrade-bell-btn');
    var markReadBtn = document.getElementById('bell-mark-read-btn');
    
    wwLog.log('🔔 updateOvertradeBell - Elementler:', {
      body: !!body,
      dot: !!dot,
      bellBtn: !!bellBtn,
      markReadBtn: !!markReadBtn
    });
    
    if (!body) {
      wwLog.warn('⚠️ bell-panel-body bulunamadı');
      return;
    }

    if (typeof checkAndRenderOvertrade === 'function') {
      await checkAndRenderOvertrade('bell-panel-body');
    }

    var rawContent = body.innerHTML || '';
    var tempDiv = document.createElement('div');
    tempDiv.innerHTML = rawContent;
    var textContent = tempDiv.textContent || tempDiv.innerText || '';
    var cleanText = textContent.replace(/\s/g, '').trim();
    var hasContent = cleanText.length > 0;

    if (!hasContent) {
      var emptyText = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('nav.no_notifications') : 'Yeni bildirim yok';
      body.innerHTML = '<div class="bell-panel-empty"><span class="empty-icon">🔕</span><span>' + emptyText + '</span></div>';
      if (dot) dot.style.display = 'none';
      if (bellBtn) bellBtn.classList.remove('has-alert');
      if (markReadBtn) markReadBtn.style.display = 'none';
      return;
    }

    var OVERTRADE_READ_KEY = 'ww_overtrade_read_signature';
    var currentOvertradeSignature = textContent.replace(/\s/g, '');
    var readSignature = localStorage.getItem(OVERTRADE_READ_KEY) || '';

    if (readSignature && readSignature === currentOvertradeSignature) {
      var emptyText2 = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('nav.no_notifications') : 'Yeni bildirim yok';
      body.innerHTML = '<div class="bell-panel-empty"><span class="empty-icon">🔕</span><span>' + emptyText2 + '</span></div>';
      if (dot) dot.style.display = 'none';
      if (bellBtn) bellBtn.classList.remove('has-alert');
      if (markReadBtn) markReadBtn.style.display = 'none';
      return;
    }

    if (dot) dot.style.display = 'block';
    if (bellBtn) bellBtn.classList.add('has-alert');
    if (markReadBtn) markReadBtn.style.display = 'inline-flex';

    // ⭐ BUG FIX: Okundu butonuna event listener bağla (onclick kullan - duplicate binding önler)
    if (markReadBtn) {
      markReadBtn.onclick = function(e) {
        e.stopPropagation();
        wwLog.log('✅ Okundu butonuna tıklandı, bildirimler kapatılıyor...');
        
        try {
          // 1. Mevcut uyarı imzasını localStorage'a kaydet
          if (currentOvertradeSignature) {
            localStorage.setItem(OVERTRADE_READ_KEY, currentOvertradeSignature);
            wwLog.log('💾 OVERTRADE_READ_KEY kaydedildi:', currentOvertradeSignature);
          }
          
          // 2. Panel içeriğini boşalt
          if (body) {
            var emptyText3 = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('nav.no_notifications') : 'Yeni bildirim yok';
            body.innerHTML = '<div class="bell-panel-empty"><span class="empty-icon">🔕</span><span>' + emptyText3 + '</span></div>';
          }
          
          // 3. Zil uyarı durumunu kaldır
          if (dot) dot.style.display = 'none';
          if (bellBtn) bellBtn.classList.remove('has-alert');
          if (markReadBtn) markReadBtn.style.display = 'none';
          
          // 4. Bell panelini kapat
          var bellPanel = document.getElementById('bell-panel');
          if (bellPanel) bellPanel.classList.remove('open');
          
          // 5. Toast göster
          if (typeof showToast === 'function') {
            showToast('✅ Bildirimler okundu olarak işaretlendi', 'success');
          }
          
          wwLog.log('✅ OverTrade bildirimleri okundu olarak işaretlendi');
        } catch(err) {
          wwLog.warn('Okundu işaretleme hatası:', err);
          if (typeof showToast === 'function') {
            showToast('❌ Bildirimler okundu işaretlenirken hata oluştu', 'error');
          }
        }
      };
    }

  } catch(e) {
    wwLog.warn('updateOvertradeBell hatası:', e);
  }
}

// ⭐ GLOBAL EXPORT - TÜM SAYFALARDAN ERİŞİLEBİLİR
window.updateOvertradeBell = updateOvertradeBell;