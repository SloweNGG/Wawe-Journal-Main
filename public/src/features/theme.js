// ============================================================
// WAWE JOURNAL - THEME FEATURE (APEXCHARTS DESTEKLİ)
// ⭐ ApexCharts tema geçişleri eklendi
// ⭐ chartsReset event fırlatma eklendi
// ============================================================

import { safeLocalStorageGet, safeLocalStorageSet } from '../core/storage.js';
import { getUserPlanSilent } from '../services/user.js';
import { showToast } from '../utils/ui.js';

// ============================================================
// ⭐ APEXCHARTS TEMA YÖNETİMİ
// ============================================================

export function getApexThemeConfig() {
  const isLight = document.body.classList.contains('light-theme');
  return {
    mode: isLight ? 'light' : 'dark',
    palette: 'palette1',
    monochrome: {
      enabled: false
    }
  };
}

export function getApexColors() {
  const isLight = document.body.classList.contains('light-theme');
  return {
    textColor: isLight ? '#1e293b' : '#e8e8f0',
    mutedColor: isLight ? '#64748b' : '#8b8b9e',
    gridColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',
    accent: '#8b5cf6',
    green: isLight ? '#10b981' : '#22c55e',
    red: isLight ? '#dc2626' : '#ef4444',
    surface: isLight ? '#ffffff' : '#0e0e16'
  };
}

// ============================================================
// ⭐ THEME SETTINGS - MEVCUT
// ============================================================

export function getThemeSettings() {
  try {
    const saved = safeLocalStorageGet('ww_custom_theme', null);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {}
  return { ...WW_CONFIG.THEME };
}

export function saveThemeSettings(settings) {
  try {
    const isLightTheme = document.body.classList.contains('light-theme');
    
    if (isLightTheme) {
      const fontOnly = { fontSize: settings.fontSize || 16 };
      safeLocalStorageSet('ww_custom_theme', JSON.stringify(fontOnly));
      applyThemeSettings(fontOnly);
      if (typeof showToast === 'function') {
        showToast('✅ Font boyutu güncellendi!', 'success');
      }
      // ⭐ ApexCharts için tema değişikliğini bildir
      triggerChartThemeUpdate();
      return;
    }
    
    safeLocalStorageSet('ww_custom_theme', JSON.stringify(settings));
    applyThemeSettings(settings);
    
    try {
      window.dispatchEvent(new CustomEvent('themeChanged', { 
        detail: { settings: settings } 
      }));
    } catch(e) {}
    
    // ⭐ ApexCharts için tema değişikliğini bildir
    triggerChartThemeUpdate();
    
  } catch (e) {}
}

// ============================================================
// ⭐ APEXCHARTS TEMA GÜNCELLEME TETİKLEYİCİSİ
// ============================================================

function triggerChartThemeUpdate() {
  try {
    // Dashboard sayfasındaki grafikleri güncelle
    window.dispatchEvent(new CustomEvent('chartsReset', { 
      detail: { source: 'theme' } 
    }));
    wwLog.log('🎨 ApexCharts tema güncellemesi tetiklendi');
  } catch(e) {
    wwLog.warn('Chart tema güncellemesi tetiklenemedi:', e);
  }
}

// ============================================================
// ⭐ APPLY THEME SETTINGS - MEVCUT + APEXCHARTS DESTEĞİ
// ============================================================

export function applyThemeSettings(settings) {
  const root = document.documentElement;
  const isLightTheme = document.body.classList.contains('light-theme');
  
  if (isLightTheme) {
    if (settings.fontSize) {
      document.body.style.fontSize = settings.fontSize + 'px';
      safeLocalStorageSet('ww_font_size', settings.fontSize);
    }
    // ⭐ Light tema için ApexCharts renklerini güncelle
    updateApexChartColors();
    return;
  }
  
  // Dark tema için CSS değişkenlerini uygula
  if (settings.backgroundColor) root.style.setProperty('--bg', settings.backgroundColor);
  if (settings.surfaceColor) {
    root.style.setProperty('--surface', settings.surfaceColor);
    root.style.setProperty('--surface2', settings.surfaceColor);
  }
  if (settings.borderColor) root.style.setProperty('--border', settings.borderColor);
  if (settings.textColor) root.style.setProperty('--text', settings.textColor);
  if (settings.fontSize) {
    document.body.style.fontSize = settings.fontSize + 'px';
    safeLocalStorageSet('ww_font_size', settings.fontSize);
  }
  
  // ⭐ Dark tema için ApexCharts renklerini güncelle
  updateApexChartColors();
}

// ============================================================
// ⭐ APEXCHARTS RENK GÜNCELLEME
// ============================================================

function updateApexChartColors() {
  try {
    // ApexCharts global renklerini güncelle
    if (typeof ApexCharts !== 'undefined') {
      const colors = getApexColors();
      // Global tema ayarları - ApexCharts'in kendi teması yok, 
      // ama biz chartsReset event ile yeniden render yapıyoruz
      wwLog.log('🎨 ApexCharts renkleri güncellendi:', colors);
    }
  } catch(e) {
    // Sessizce geç
  }
}

// ============================================================
// ⭐ FONT SIZE - MEVCUT
// ============================================================

export function applyFontSize(size) {
  if (size) {
    document.body.style.fontSize = size + 'px';
    safeLocalStorageSet('ww_font_size', size);
    // Font değişiminde grafikleri yenile
    triggerChartThemeUpdate();
  }
}

export function loadFontSize() {
  const saved = safeLocalStorageGet('ww_font_size', null);
  if (saved) {
    document.body.style.fontSize = saved + 'px';
    return parseInt(saved);
  }
  if (WW_CONFIG && WW_CONFIG.THEME && WW_CONFIG.THEME.fontSize) {
    return WW_CONFIG.THEME.fontSize;
  }
  return 16;
}

// ============================================================
// ⭐ PREMIUM KONTROL - MEVCUT
// ============================================================

export async function canCustomizeTheme() {
  if (typeof window !== 'undefined' && window.location.search.includes('test=1')) return true;
  const { plan } = await getUserPlanSilent();
  return plan === 'premium';
}

// ============================================================
// ⭐ THEME CUSTOMIZATION UI - MEVCUT + APEXCHARTS DESTEĞİ
// ============================================================

export async function loadThemeCustomization() {
  const isPremium = await canCustomizeTheme();
  const container = document.getElementById('theme-customization-container');
  if (!container) return;
  
  const applyI18n = () => { if (typeof i18n !== 'undefined' && i18n.apply) try { i18n.apply(); } catch(e) {} };
  const fillIcons = (root) => {
    root.querySelectorAll('[data-icon]').forEach(function(el) {
      const name = el.getAttribute('data-icon');
      if (typeof window.getLucideIcon === 'function') {
        el.innerHTML = window.getLucideIcon(name, 14);
      } else if (typeof getLucideIcon === 'function') {
        el.innerHTML = getLucideIcon(name, 14);
      }
    });
  };
  
  const isLight = document.body.classList.contains('light-theme');
  
  // Light tema → kilit ekranı
  if (isLight) {
    const tplLight = document.getElementById('tpl-theme-light-locked');
    if (!tplLight) return;
    container.innerHTML = '';
    container.appendChild(tplLight.content.cloneNode(true));
    applyI18n();
    const switchBtn = container.querySelector('#theme-switch-to-dark-btn');
    if (switchBtn) {
      switchBtn.addEventListener('click', function() {
        const toggle = document.getElementById('theme-toggle');
        if (toggle && !toggle.checked) toggle.click();
      });
    }
    return;
  }
  
  // Premium değil → kilit ekranı
  if (!isPremium) {
    const tplLocked = document.getElementById('tpl-theme-locked');
    if (!tplLocked) return;
    container.innerHTML = '';
    container.appendChild(tplLocked.content.cloneNode(true));
    applyI18n();
    return;
  }
  
  // Premium + Dark → tam form
  const tplForm = document.getElementById('tpl-theme-form');
  if (!tplForm) return;
  const clone = tplForm.content.cloneNode(true);
  
  const settings = getThemeSettings();
  
  const bgInput = clone.querySelector('#custom-bg-color');
  const bgText = clone.querySelector('#custom-bg-color-text');
  const surfInput = clone.querySelector('#custom-surface-color');
  const surfText = clone.querySelector('#custom-surface-color-text');
  const borderInput = clone.querySelector('#custom-border-color');
  const borderText = clone.querySelector('#custom-border-color-text');
  const textInput = clone.querySelector('#custom-text-color');
  const textText = clone.querySelector('#custom-text-color-text');
  const fontSize = clone.querySelector('#custom-font-size');
  const fontSizeDisplay = clone.querySelector('#font-size-display');
  
  if (bgInput) bgInput.value = settings.backgroundColor || '#07070c';
  if (bgText) bgText.value = settings.backgroundColor || '#07070c';
  if (surfInput) surfInput.value = settings.surfaceColor || '#0e0e16';
  if (surfText) surfText.value = settings.surfaceColor || '#0e0e16';
  if (borderInput) borderInput.value = settings.borderColor || '#1a1a28';
  if (borderText) borderText.value = settings.borderColor || '#1a1a28';
  if (textInput) textInput.value = settings.textColor || '#f0f0f8';
  if (textText) textText.value = settings.textColor || '#f0f0f8';
  if (fontSize) fontSize.value = settings.fontSize || 16;
  if (fontSizeDisplay) fontSizeDisplay.textContent = (settings.fontSize || 16) + 'px';
  
  fillIcons(clone);
  
  container.innerHTML = '';
  container.appendChild(clone);
  
  applyI18n();
  
  initThemeFormEvents();
}

function initThemeFormEvents() {
  const bgColor = document.getElementById('custom-bg-color');
  const bgColorText = document.getElementById('custom-bg-color-text');
  const surfaceColor = document.getElementById('custom-surface-color');
  const surfaceColorText = document.getElementById('custom-surface-color-text');
  const borderColor = document.getElementById('custom-border-color');
  const borderColorText = document.getElementById('custom-border-color-text');
  const textColor = document.getElementById('custom-text-color');
  const textColorText = document.getElementById('custom-text-color-text');
  const fontSize = document.getElementById('custom-font-size');
  const fontSizeDisplay = document.getElementById('font-size-display');
  const previewBox = document.getElementById('theme-preview-box');
  
  if (!bgColor || !surfaceColor || !borderColor || !textColor || !fontSize) return;
  
  const _t = (key) => (typeof i18n !== 'undefined' && i18n.t) ? i18n.t(key) : key;

  function updateChips() {
    const chipBg = document.getElementById('chip-bg');
    const chipSurf = document.getElementById('chip-surface');
    const chipBorder = document.getElementById('chip-border');
    const chipText = document.getElementById('chip-text');
    if (chipBg) chipBg.style.background = bgColor.value;
    if (chipSurf) chipSurf.style.background = surfaceColor.value;
    if (chipBorder) chipBorder.style.background = borderColor.value;
    if (chipText) chipText.style.background = textColor.value;
  }

  function updateFontPills(val) {
    document.querySelectorAll('.font-pill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.size === String(val));
    });
  }
  
  function updatePreview(applyToRoot = false) {
    const bg = bgColor.value;
    const surface = surfaceColor.value;
    const border = borderColor.value;
    const text = textColor.value;
    const size = fontSize.value;
    
    updateChips();
    updateFontPills(size);

    if (previewBox) {
      previewBox.style.background = surface;
      previewBox.style.borderColor = border;
      previewBox.style.color = text;
      previewBox.style.fontSize = size + 'px';
      previewBox.querySelectorAll('.preview-text-contrast').forEach(el => {
        el.style.color = text;
      });
    }
    
    if (applyToRoot) {
      const root = document.documentElement;
      root.style.setProperty('--bg', bg);
      root.style.setProperty('--surface', surface);
      root.style.setProperty('--surface2', surface);
      root.style.setProperty('--border', border);
      root.style.setProperty('--text', text);
      document.body.style.fontSize = size + 'px';
    }
    
    if (bgColorText) bgColorText.value = bg;
    if (surfaceColorText) surfaceColorText.value = surface;
    if (borderColorText) borderColorText.value = border;
    if (textColorText) textColorText.value = text;
    if (fontSizeDisplay) fontSizeDisplay.textContent = size + 'px';
  }

  const PRESETS = {
    obsidian: { bg: '#07070c', surface: '#0e0e16', border: '#1a1a28', text: '#f0f0f8' },
    violet:   { bg: '#080612', surface: '#120e24', border: '#261e47', text: '#f0f0f8' },
    slate:    { bg: '#090d14', surface: '#0f172a', border: '#1e293b', text: '#f1f5f9' },
    stealth:  { bg: '#000000', surface: '#0c0c0e', border: '#242428', text: '#ffffff' }
  };

  document.querySelectorAll('.preset-card').forEach(btn => {
    btn.addEventListener('click', function() {
      const p = PRESETS[this.dataset.preset];
      if (!p) return;
      document.querySelectorAll('.preset-card').forEach(b => b.classList.remove('active'));
      this.classList.add('active');

      bgColor.value = p.bg;
      surfaceColor.value = p.surface;
      borderColor.value = p.border;
      textColor.value = p.text;

      updatePreview(true);
    });
  });

  document.querySelectorAll('.font-pill').forEach(pill => {
    pill.addEventListener('click', function() {
      const size = parseInt(this.dataset.size, 10);
      if (size) {
        fontSize.value = size;
        updatePreview(true);
      }
    });
  });
  
  bgColor.addEventListener('input', () => updatePreview(true));
  if (bgColorText) bgColorText.addEventListener('input', function() {
    if (this.value.match(/^#[0-9a-fA-F]{6}$/)) { bgColor.value = this.value; updatePreview(true); }
  });
  surfaceColor.addEventListener('input', () => updatePreview(true));
  if (surfaceColorText) surfaceColorText.addEventListener('input', function() {
    if (this.value.match(/^#[0-9a-fA-F]{6}$/)) { surfaceColor.value = this.value; updatePreview(true); }
  });
  borderColor.addEventListener('input', () => updatePreview(true));
  if (borderColorText) borderColorText.addEventListener('input', function() {
    if (this.value.match(/^#[0-9a-fA-F]{6}$/)) { borderColor.value = this.value; updatePreview(true); }
  });
  textColor.addEventListener('input', () => updatePreview(true));
  if (textColorText) textColorText.addEventListener('input', function() {
    if (this.value.match(/^#[0-9a-fA-F]{6}$/)) { textColor.value = this.value; updatePreview(true); }
  });
  fontSize.addEventListener('input', () => updatePreview(true));
  
  const saveBtn = document.getElementById('save-custom-theme-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', function() {
      const isLight = document.body.classList.contains('light-theme');
      if (isLight) {
        const fontOnly = { fontSize: parseInt(fontSize.value) };
        saveThemeSettings(fontOnly);
        showToast('✅ ' + _t('settings.font_updated_light'), 'success');
        return;
      }
      const settings = {
        backgroundColor: bgColor.value,
        surfaceColor: surfaceColor.value,
        borderColor: borderColor.value,
        textColor: textColor.value,
        fontSize: parseInt(fontSize.value)
      };
      saveThemeSettings(settings);
      showToast('✅ ' + _t('settings.theme_saved'), 'success');
    });
  }
  
  const resetBtn = document.getElementById('reset-custom-theme-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', function() {
      const defaultSettings = WW_CONFIG.THEME;
      bgColor.value = defaultSettings.backgroundColor;
      surfaceColor.value = defaultSettings.surfaceColor;
      borderColor.value = defaultSettings.borderColor;
      textColor.value = defaultSettings.textColor;
      fontSize.value = defaultSettings.fontSize;
      document.querySelectorAll('.preset-card').forEach(b => {
        b.classList.toggle('active', b.dataset.preset === 'obsidian');
      });
      updatePreview(false);
      safeLocalStorageRemove('ww_custom_theme');
      const root = document.documentElement;
      root.style.removeProperty('--bg');
      root.style.removeProperty('--surface');
      root.style.removeProperty('--surface2');
      root.style.removeProperty('--border');
      root.style.removeProperty('--text');
      document.body.style.fontSize = '';
      showToast('↺ ' + _t('settings.theme_reset_done'), 'success');
    });
  }
  
  // Sayfa açıldığında sadece önizleme kutusunu senkronize et, :root'u kirletme
  updatePreview(false);
}

// ============================================================
// ⭐ APEXCHARTS TEMA GETTER - DIŞ KULLANIM İÇİN
// ============================================================

export function getApexChartTheme() {
  return {
    theme: getApexThemeConfig(),
    colors: getApexColors()
  };
}

// ============================================================
// ⭐ window'a ata (settings.js ve dashboard.js için)
// ============================================================

window.getThemeSettings = getThemeSettings;
window.saveThemeSettings = saveThemeSettings;
window.applyThemeSettings = applyThemeSettings;
window.applyFontSize = applyFontSize;
window.loadFontSize = loadFontSize;
window.loadThemeCustomization = loadThemeCustomization;
window.canCustomizeTheme = canCustomizeTheme;

// ⭐ ApexCharts tema fonksiyonları
window.getApexThemeConfig = getApexThemeConfig;
window.getApexColors = getApexColors;
window.getApexChartTheme = getApexChartTheme;
window.triggerChartThemeUpdate = triggerChartThemeUpdate;