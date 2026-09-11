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

  if (!isPremium) {
    container.innerHTML = `
      <div style="text-align:center;padding:2rem;background:var(--surface2);border-radius:var(--radius);border:1px solid var(--border);">
        <div style="font-size:2.5rem;margin-bottom:0.75rem;">💎</div>
        <h3 style="font-family:'Syne',sans-serif;font-size:1rem;color:var(--text);margin-bottom:0.5rem;">Tema Özelleştirme</h3>
        <p style="color:var(--muted);font-size:13px;max-width:400px;margin:0 auto 1rem;">Bu özellik sadece Premium üyelere özeldir.</p>
        <a href="settings.html#panel-plan" class="btn btn-primary" style="display:inline-flex;">Premium'a Geç →</a>
      </div>
    `;
    return;
  }

  const settings = getThemeSettings();
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1rem;">
      <div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.15);border-radius:8px;padding:0.6rem 0.9rem;font-size:12px;color:var(--text);">
        ⚠️ <strong>Not:</strong> Renk özelleştirme sadece <strong>Koyu Tema</strong> aktifken çalışır. Açık tema aktifken sadece font boyutu değiştirilebilir.
      </div>
      <div class="field">
        <label>Arka Plan Rengi</label>
        <div style="display:flex;align-items:center;gap:0.75rem;">
          <input type="color" id="custom-bg-color" value="${settings.backgroundColor || '#0a0a0f'}" style="width:50px;height:40px;border:none;cursor:pointer;background:transparent;padding:0;">
          <input type="text" id="custom-bg-color-text" value="${settings.backgroundColor || '#0a0a0f'}" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:0.5rem 0.75rem;color:var(--text);font-family:'DM Mono',monospace;font-size:12px;">
        </div>
      </div>
      <div class="field">
        <label>Kart Arka Plan Rengi</label>
        <div style="display:flex;align-items:center;gap:0.75rem;">
          <input type="color" id="custom-surface-color" value="${settings.surfaceColor || '#111118'}" style="width:50px;height:40px;border:none;cursor:pointer;background:transparent;padding:0;">
          <input type="text" id="custom-surface-color-text" value="${settings.surfaceColor || '#111118'}" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:0.5rem 0.75rem;color:var(--text);font-family:'DM Mono',monospace;font-size:12px;">
        </div>
      </div>
      <div class="field">
        <label>Kenarlık Rengi</label>
        <div style="display:flex;align-items:center;gap:0.75rem;">
          <input type="color" id="custom-border-color" value="${settings.borderColor || '#1e1e2e'}" style="width:50px;height:40px;border:none;cursor:pointer;background:transparent;padding:0;">
          <input type="text" id="custom-border-color-text" value="${settings.borderColor || '#1e1e2e'}" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:0.5rem 0.75rem;color:var(--text);font-family:'DM Mono',monospace;font-size:12px;">
        </div>
      </div>
      <div class="field">
        <label>Metin Rengi</label>
        <div style="display:flex;align-items:center;gap:0.75rem;">
          <input type="color" id="custom-text-color" value="${settings.textColor || '#e8e8f0'}" style="width:50px;height:40px;border:none;cursor:pointer;background:transparent;padding:0;">
          <input type="text" id="custom-text-color-text" value="${settings.textColor || '#e8e8f0'}" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:0.5rem 0.75rem;color:var(--text);font-family:'DM Mono',monospace;font-size:12px;">
        </div>
      </div>
      <div class="field">
        <label>Font Boyutu: <span id="font-size-display">${settings.fontSize || 16}px</span></label>
        <input type="range" id="custom-font-size" min="12" max="24" step="1" value="${settings.fontSize || 16}" style="width:100%;accent-color:var(--accent);">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);">
          <span>12px</span><span>18px</span><span>24px</span>
        </div>
      </div>
      <div style="display:flex;gap:0.75rem;margin-top:0.5rem;flex-wrap:wrap;">
        <button class="btn btn-primary" id="save-custom-theme-btn">💾 Temayı Kaydet</button>
        <button class="btn btn-ghost" id="reset-custom-theme-btn">↺ Varsayılana Dön</button>
      </div>
      <div id="theme-preview-box" style="margin-top:1rem;padding:1rem;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);">
        <p style="color:var(--text);font-size:${settings.fontSize || 16}px;margin:0;">
          <strong>Önizleme:</strong> Bu metin seçtiğiniz renk ve font boyutu ile görüntüleniyor.
        </p>
        <div style="display:flex;gap:0.5rem;margin-top:0.5rem;flex-wrap:wrap;">
          <span style="background:var(--accent);color:#fff;padding:4px 12px;border-radius:4px;font-size:12px;">Accent</span>
          <span style="background:var(--green);color:#fff;padding:4px 12px;border-radius:4px;font-size:12px;">Win</span>
          <span style="background:var(--red);color:#fff;padding:4px 12px;border-radius:4px;font-size:12px;">Loss</span>
        </div>
      </div>
    </div>
  `;

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

  function updatePreview() {
    const bg = bgColor.value;
    const surface = surfaceColor.value;
    const border = borderColor.value;
    const text = textColor.value;
    const size = fontSize.value;

    const preview = document.getElementById('theme-preview-box');
    if (preview) {
      preview.style.background = surface;
      preview.style.borderColor = border;
      preview.style.color = text;
      preview.style.fontSize = size + 'px';
      const strong = preview.querySelector('strong');
      if (strong) strong.style.color = text;
    }

    const root = document.documentElement;
    root.style.setProperty('--bg', bg);
    root.style.setProperty('--surface', surface);
    root.style.setProperty('--surface2', surface);
    root.style.setProperty('--border', border);
    root.style.setProperty('--text', text);
    document.body.style.fontSize = size + 'px';

    bgColorText.value = bg;
    surfaceColorText.value = surface;
    borderColorText.value = border;
    textColorText.value = text;
    if (fontSizeDisplay) fontSizeDisplay.textContent = size + 'px';
  }

  bgColor.addEventListener('input', updatePreview);
  bgColorText.addEventListener('input', function() {
    if (this.value.match(/^#[0-9a-fA-F]{6}$/)) {
      bgColor.value = this.value;
      updatePreview();
    }
  });
  surfaceColor.addEventListener('input', updatePreview);
  surfaceColorText.addEventListener('input', function() {
    if (this.value.match(/^#[0-9a-fA-F]{6}$/)) {
      surfaceColor.value = this.value;
      updatePreview();
    }
  });
  borderColor.addEventListener('input', updatePreview);
  borderColorText.addEventListener('input', function() {
    if (this.value.match(/^#[0-9a-fA-F]{6}$/)) {
      borderColor.value = this.value;
      updatePreview();
    }
  });
  textColor.addEventListener('input', updatePreview);
  textColorText.addEventListener('input', function() {
    if (this.value.match(/^#[0-9a-fA-F]{6}$/)) {
      textColor.value = this.value;
      updatePreview();
    }
  });
  fontSize.addEventListener('input', updatePreview);

  document.getElementById('save-custom-theme-btn').addEventListener('click', function() {
    const isLight = document.body.classList.contains('light-theme');
    
    if (isLight) {
      const fontOnly = { fontSize: parseInt(fontSize.value) };
      saveThemeSettings(fontOnly);
      showToast('✅ Font boyutu kaydedildi! (Renkler light tema ile sınırlıdır)', 'success');
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
    showToast('✅ Tema başarıyla kaydedildi!', 'success');
  });

  document.getElementById('reset-custom-theme-btn').addEventListener('click', function() {
    const defaultSettings = WW_CONFIG.THEME;
    bgColor.value = defaultSettings.backgroundColor;
    surfaceColor.value = defaultSettings.surfaceColor;
    borderColor.value = defaultSettings.borderColor;
    textColor.value = defaultSettings.textColor;
    fontSize.value = defaultSettings.fontSize;
    updatePreview();
    saveThemeSettings(defaultSettings);
    showToast('↺ Tema varsayılan ayarlara döndürüldü.', 'success');
  });

  document.addEventListener('themeChanged', function(e) {
    if (e.detail && e.detail.settings) {
      if (!document.body.classList.contains('light-theme')) {
        const s = e.detail.settings;
        if (s.backgroundColor) bgColor.value = s.backgroundColor;
        if (s.surfaceColor) surfaceColor.value = s.surfaceColor;
        if (s.borderColor) borderColor.value = s.borderColor;
        if (s.textColor) textColor.value = s.textColor;
        if (s.fontSize) fontSize.value = s.fontSize;
        updatePreview();
      }
    }
  });

  updatePreview();
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