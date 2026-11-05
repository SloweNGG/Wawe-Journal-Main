// ============================================================
// WAWE JOURNAL - THEME FEATURE (bundle.js)
// Renkler, açık/koyu mod ve yazı boyutu tema motorunda: src/scripts/theme-engine.js (window.WWTheme, BaseHead'de
// satır içi). Buradaki fonksiyonlar eski çağrılar için motoru çağırır; kendi başlarına <html>'e değişken yazmazlar
// (yazsalardı satır içi stil motorun değerlerini ezerdi). Tema stüdyosu: public/settings/js/theme-studio.js.
// ============================================================

import { getUserPlanSilent } from '../services/user.js';

function engine() {
  return typeof window !== 'undefined' && window.WWTheme ? window.WWTheme : null;
}

// ============================================================
// ApexCharts renkleri (canvas CSS değişkeni okuyamaz: vurgu rengi o anki temadan)
// ============================================================

export function getApexThemeConfig() {
  const isLight = document.body.classList.contains('light-theme');
  return {
    mode: isLight ? 'light' : 'dark',
    palette: 'palette1',
    monochrome: { enabled: false }
  };
}

export function getApexColors() {
  const isLight = document.body.classList.contains('light-theme');
  const T = engine();
  return {
    textColor: isLight ? '#1e293b' : '#e8e8f0',
    mutedColor: isLight ? '#64748b' : '#8b8b9e',
    gridColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',
    accent: T ? T.accent() : '#8b5cf6',
    green: isLight ? '#10b981' : '#22c55e',
    red: isLight ? '#dc2626' : '#ef4444',
    surface: isLight ? '#ffffff' : '#0e0e16'
  };
}

export function getApexChartTheme() {
  return { theme: getApexThemeConfig(), colors: getApexColors() };
}

function triggerChartThemeUpdate() {
  try {
    window.dispatchEvent(new CustomEvent('chartsReset', { detail: { source: 'theme' } }));
  } catch (e) {}
}

// ============================================================
// Tema ayarları (motora yönlendirilir)
// ============================================================

export function getThemeSettings() {
  const T = engine();
  return T ? T.serialize(T.read()) : {};
}

// Eski düz biçim ({ backgroundColor, ..., fontSize }) ya da v2 kayıt
export function saveThemeSettings(settings) {
  const T = engine();
  if (!T || !settings) return;
  const st = T.read();
  const next = T.normalize(settings);
  if (next.dark) st.dark = next.dark;
  if (next.light) st.light = next.light;
  if (settings.fontSize) st.fontSize = T.setFont(settings.fontSize);
  T.save(st);
}

export function applyThemeSettings() {
  const T = engine();
  if (!T) return;
  T.apply();
  T.applyFont();
}

export function applyFontSize(size) {
  const T = engine();
  if (!T || !size) return;
  T.setFont(size);
  triggerChartThemeUpdate();
}

export function loadFontSize() {
  const T = engine();
  if (T) T.applyFont();
  return (T && T.fontSize()) || 16;
}

export async function canCustomizeTheme() {
  if (typeof window !== 'undefined' && window.location.search.includes('test=1')) return true;
  const { plan } = await getUserPlanSilent();
  return plan === 'premium';
}

// Tema stüdyosu yalnızca Ayarlar sayfasında (theme-studio.js); başka sayfada çağrılırsa bir şey yapmaz
export async function loadThemeCustomization() {
  const box = document.getElementById('theme-customization-container');
  if (box && window.WWThemeStudio) window.WWThemeStudio.mount(box);
}

// ============================================================
// window'a ata
// ============================================================

window.getThemeSettings = getThemeSettings;
window.saveThemeSettings = saveThemeSettings;
window.applyThemeSettings = applyThemeSettings;
window.applyFontSize = applyFontSize;
window.loadFontSize = loadFontSize;
window.loadThemeCustomization = loadThemeCustomization;
window.canCustomizeTheme = canCustomizeTheme;

window.getApexThemeConfig = getApexThemeConfig;
window.getApexColors = getApexColors;
window.getApexChartTheme = getApexChartTheme;
window.triggerChartThemeUpdate = triggerChartThemeUpdate;
