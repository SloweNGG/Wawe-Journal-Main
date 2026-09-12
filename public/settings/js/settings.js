// ============================================================
// SETTINGS.JS - SADE VE ÇALIŞAN VERSİYON
// ⭐ Avatar cache - sadece değiştiğinde render
// ⭐ TEHLİKELİ BÖLGE AKTİF: deleteAllUserData + deactivateAccount
// ⭐ ÇAKIŞMA ÇÖZÜLDÜ: Ödeme fonksiyonları (upgradeToPremium, cancelPremium,
//      createNowPaymentInvoice, selectPayMethod) artık sadece payment.js'te.
//      Bu dosyada sadece fiyat verisi (getMonthlyPrice/getYearlyPrice) var.
// ⭐ DEĞİŞİKLİK: updateBadge() artık navbar.js'e delege ediyor (i18n race fix)
// ============================================================

wwLog.log('🔧 settings.js yükleniyor...');

// ============================================================
// ⭐ TEMA KONTROLÜ - EN BAŞTA ÇALIŞIR
// ============================================================

(function() {
  var savedTheme = localStorage.getItem('ww_theme');
  var savedFontSize = localStorage.getItem('ww_font_size');
  var customTheme = localStorage.getItem('ww_custom_theme');
  
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }
  
  if (savedFontSize) {
    document.body.style.fontSize = savedFontSize + 'px';
  }
  
  if (savedTheme !== 'light' && customTheme) {
    try {
      var settings = JSON.parse(customTheme);
      var root = document.documentElement;
      if (settings.backgroundColor) root.style.setProperty('--bg', settings.backgroundColor);
      if (settings.surfaceColor) {
        root.style.setProperty('--surface', settings.surfaceColor);
        root.style.setProperty('--surface2', settings.surfaceColor);
      }
      if (settings.borderColor) root.style.setProperty('--border', settings.borderColor);
      if (settings.textColor) root.style.setProperty('--text', settings.textColor);
      if (settings.fontSize) document.body.style.fontSize = settings.fontSize + 'px';
    } catch(e) {}
  }
  
  wwLog.log('🎨 [settings] Tema ayarlandı:', savedTheme || 'dark');
})();

// ============================================================
// ⭐ TEMA DEĞİŞİMİNİ DİNLE
// ============================================================

(function() {
  window.addEventListener('storage', function(e) {
    if (e.key === 'ww_theme') {
      var isLight = e.newValue === 'light';
      document.body.classList.toggle('light-theme', isLight);
      
      var cb = document.getElementById('theme-toggle');
      if (cb) cb.checked = isLight;
      
      var icon = document.getElementById('theme-icon');
      var label = document.getElementById('theme-label');
      var desc = document.getElementById('theme-desc');
      
      if (isLight) {
        if (icon) icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
        if (label) label.textContent = 'Açık Tema';
        if (desc) desc.textContent = 'Aydınlık ve ferah arayüz';
      } else {
        if (icon) icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
        if (label) label.textContent = 'Koyu Tema';
        if (desc) desc.textContent = 'Göz yormayan karanlık arayüz';
      }
      
      if (!isLight) {
        var ct = localStorage.getItem('ww_custom_theme');
        if (ct) {
          try {
            var s = JSON.parse(ct);
            var root = document.documentElement;
            if (s.backgroundColor) root.style.setProperty('--bg', s.backgroundColor);
            if (s.surfaceColor) {
              root.style.setProperty('--surface', s.surfaceColor);
              root.style.setProperty('--surface2', s.surfaceColor);
            }
            if (s.borderColor) root.style.setProperty('--border', s.borderColor);
            if (s.textColor) root.style.setProperty('--text', s.textColor);
            if (s.fontSize) document.body.style.fontSize = s.fontSize + 'px';
          } catch(e) {}
        }
      }
    }
  });
  
  document.addEventListener('themeChanged', function(e) {
    if (e.detail && e.detail.settings) {
      var isLight = document.body.classList.contains('light-theme');
      if (!isLight) {
        var s = e.detail.settings;
        var root = document.documentElement;
        if (s.backgroundColor) root.style.setProperty('--bg', s.backgroundColor);
        if (s.surfaceColor) {
          root.style.setProperty('--surface', s.surfaceColor);
          root.style.setProperty('--surface2', s.surfaceColor);
        }
        if (s.borderColor) root.style.setProperty('--border', s.borderColor);
        if (s.textColor) root.style.setProperty('--text', s.textColor);
        if (s.fontSize) document.body.style.fontSize = s.fontSize + 'px';
      }
    }
  });
  
  wwLog.log('✅ [settings] Tema izleyici yüklendi!');
})();

// ============================================================
// ⭐ TOGGLE THEME
// ============================================================

window.toggleTheme = function() {
  var cb = document.getElementById('theme-toggle');
  if (!cb) return;
  
  var isLight = cb.checked;
  
  document.body.classList.toggle('light-theme', isLight);
  localStorage.setItem('ww_theme', isLight ? 'light' : 'dark');
  
  var icon = document.getElementById('theme-icon');
  var label = document.getElementById('theme-label');
  var desc = document.getElementById('theme-desc');
  
  if (isLight) {
    if (icon) icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
    if (label) label.textContent = 'Açık Tema';
    if (desc) desc.textContent = 'Aydınlık ve ferah arayüz';
  } else {
    if (icon) icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    if (label) label.textContent = 'Koyu Tema';
    if (desc) desc.textContent = 'Göz yormayan karanlık arayüz';
  }
  
  if (!isLight) {
    var customTheme = localStorage.getItem('ww_custom_theme');
    if (customTheme) {
      try {
        var settings = JSON.parse(customTheme);
        var root = document.documentElement;
        if (settings.backgroundColor) root.style.setProperty('--bg', settings.backgroundColor);
        if (settings.surfaceColor) {
          root.style.setProperty('--surface', settings.surfaceColor);
          root.style.setProperty('--surface2', settings.surfaceColor);
        }
        if (settings.borderColor) root.style.setProperty('--border', settings.borderColor);
        if (settings.textColor) root.style.setProperty('--text', settings.textColor);
        if (settings.fontSize) document.body.style.fontSize = settings.fontSize + 'px';
      } catch(e) {}
    }
  } else {
    var savedFontSize = localStorage.getItem('ww_font_size');
    if (savedFontSize) {
      document.body.style.fontSize = savedFontSize + 'px';
    }
  }
  
  try {
    window.dispatchEvent(new CustomEvent('themeChanged', { 
      detail: { settings: { isLight: isLight } } 
    }));
  } catch(e) {}
  
  wwLog.log('🎨 Tema değiştirildi:', isLight ? 'light' : 'dark');
};

// ============================================================
// ⭐ LUCIDE SVG ICON HELPER
// ============================================================
function getLucideIcon(name, size) {
  size = size || 16;
  
  const VALID_ICONS = [
    'upload', 'edit', 'image', 'bar-chart-3', 'refresh-cw', 
    'trending-up', 'palette', 'file-text', 'newspaper', 'bell',
    'gem', 'rocket', 'clipboard', 'user', 'lock', 'alert-triangle',
    'credit-card', 'dollar-sign', 'check', 'rotate-ccw', 'globe',
    'target', 'settings', 'refresh'
  ];
  
  if (!VALID_ICONS.includes(name)) {
    return `<span style="color:var(--muted);font-size:${size}px;">◻</span>`;
  }
  
  var icons = {
    'upload': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    'edit': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    'image': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    'bar-chart-3': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    'refresh-cw': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    'trending-up': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    'palette': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10a2 2 0 0 0 2-2c0-.52-.2-1-.53-1.37-.33-.36-.47-.82-.47-1.28 0-1.1.9-2 2-2h1.17c2.21 0 4-1.79 4-4 0-4.96-4.04-9-9-9z"/></svg>',
    'file-text': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    'newspaper': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>',
    'bell': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    'gem': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 13L2 9l4-6z"/><path d="M12 22V9"/><path d="M2 9h20"/><path d="M6 3l6 6 6-6"/></svg>',
    'rocket': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
    'clipboard': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
    'user': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="12" r="4"/></svg>',
    'lock': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    'alert-triangle': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    'credit-card': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
    'dollar-sign': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    'check': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    'rotate-ccw': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
    'globe': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    'target': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    'settings': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    'refresh': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>'
  };
  
  return icons[name] || `<span style="color:var(--muted);font-size:${size}px;">◻</span>`;
}

// ============================================================
// STATE
// ============================================================
if (!window.SETTINGS_STATE) {
  window.SETTINGS_STATE = {
    currentUser: null,
    currentAvatarUrl: null,
    timerInterval: null,
    payMethod: 'BTC',
    isPremium: false
  };
}

// ============================================================
// PREMIUM FEATURES
// ============================================================
const PREMIUM_FEATURES = [
  { iconName: 'bar-chart-3', key: 'premium_features.dashboard' },
  { iconName: 'refresh-cw', key: 'premium_features.drag_drop' },
  { iconName: 'trending-up', key: 'premium_features.advanced_charts' },
  { iconName: 'palette', key: 'premium_features.theme_customization' },
  { iconName: 'file-text', key: 'premium_features.detailed_pdf' },
  { iconName: 'newspaper', key: 'premium_features.news' },
  { iconName: 'bell', key: 'premium_features.overtrade' },
  { iconName: 'gem', key: 'premium_features.priority_support' },
  { iconName: 'rocket', key: 'premium_features.no_ads' }
];

// ============================================================
// HELPER FONKSİYONLAR
// ============================================================
function getSb() {
  return window.sb || window.supabase || null;
}

function showMsg(message, type) {
  type = type || 'info';
  if (window.showToast) {
    window.showToast(message, type);
  } else {
    wwLog.log('[' + type + ']', message);
    var toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:12px 24px;background:' + (type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#8b5cf6') + ';color:white;border-radius:10px;font-family:"DM Sans",sans-serif;font-size:14px;font-weight:500;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);animation:slideIn 0.3s ease;';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function() {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(function() { if (toast.parentNode) toast.remove(); }, 300);
    }, 3000);
  }
}

function isAdmin(user) {
  return !!(user && user.app_metadata && user.app_metadata.role === 'admin');
}

function safeEl(id) {
  return document.getElementById(id);
}

function t(key, params) {
  if (window.i18n && typeof i18n.t === 'function') {
    return i18n.t(key, params);
  }
  return key;
}

function sanitizeHTML(str) {
  if (!str) return '';
  const temp = document.createElement('div');
  temp.textContent = str;
  return temp.innerHTML;
}

// ============================================================
// AUTH
// ============================================================
async function getCurrentUser() {
  var sb = getSb();
  if (!sb) return null;
  try {
    var data = await sb.auth.getUser();
    return data && data.data ? data.data.user : null;
  } catch (e) {
    return null;
  }
}

async function getSession() {
  var sb = getSb();
  if (!sb) return null;
  try {
    var data = await sb.auth.getSession();
    return data && data.data ? data.data.session : null;
  } catch (e) {
    return null;
  }
}

// ============================================================
// PANEL LOADER
// ============================================================
async function loadPanelContent(panelId, url) {
  try {
    wwLog.log('📄 Panel yükleniyor: ' + panelId + ' -> ' + url);
    var res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var html = await res.text();
    var panel = document.getElementById(panelId);
    if (panel) {
      panel.innerHTML = html;
      wwLog.log('✅ Panel yüklendi: ' + panelId);
      
      var scripts = panel.querySelectorAll('script');
      scripts.forEach(function(script) {
        var newScript = document.createElement('script');
        newScript.textContent = script.textContent;
        document.body.appendChild(newScript);
        script.remove();
      });
      
      if (panelId === 'panel-profile') {
        setTimeout(function() {
          loadAvatar();
        }, 100);
      }
      
      if (window.i18n && typeof window.i18n.apply === 'function') {
        try { window.i18n.apply(); } catch(e) {}
      }
      
      return true;
    }
    return false;
  } catch (e) {
    console.error('❌ Panel yüklenemedi: ' + panelId, e);
    var panel = document.getElementById(panelId);
    if (panel) {
      panel.innerHTML = '<div class="s-card"><div class="s-card-body" style="padding:2rem;text-align:center;color:var(--muted);"><div style="font-size:2rem;margin-bottom:0.5rem;">' + getLucideIcon('alert-triangle', 32) + '</div><p>Panel yüklenemedi. Lütfen sayfayı yenileyin.</p><p style="font-size:11px;opacity:0.5;">' + sanitizeHTML(e.message) + '</p></div></div>';
    }
    return false;
  }
}

// ============================================================
// PANEL SWITCH - GLOBAL
// ============================================================
window.switchPanel = function(panelId) {
  wwLog.log('🔄 switchPanel: ' + panelId);
  
  if (!panelId) {
    wwLog.warn('Panel ID boş!');
    return;
  }
  
  if (panelId !== window.location.hash.replace('#', '')) {
    window.location.hash = panelId;
  }
  
  document.querySelectorAll('.settings-panel').forEach(function(p) { p.classList.remove('active'); });
  
  var target = document.getElementById(panelId);
  if (target) {
    target.classList.add('active');
    wwLog.log('✅ Panel aktif: ' + panelId);
  } else {
    wwLog.warn('❌ Panel bulunamadı: ' + panelId);
    return;
  }
  
  document.querySelectorAll('.sidebar-nav-item, .settings-tab-btn').forEach(function(el) {
    var isActive = el.dataset.panel === panelId;
    if (isActive) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });
  
  var glow = document.getElementById('panel-glow');
  if (glow) {
    glow.className = 'panel-glow';
    var map = {
      'panel-profile': 'profile-glow',
      'panel-password': 'password-glow',
      'panel-appearance': 'appearance-glow',
      'panel-danger': 'danger-glow',
      'panel-plan': 'plan-glow',
      'panel-overtrade': 'overtrade-glow'
    };
    if (map[panelId]) glow.classList.add(map[panelId]);
  }
  
  if (!target.dataset.loaded) {
    var map2 = {
      'panel-profile': '/settings/panels/profile-info.html',
      'panel-plan': '/settings/panels/plan.html',
      'panel-password': '/settings/panels/password-change.html',
      'panel-appearance': '/settings/panels/appearance.html',
      'panel-overtrade': '/settings/panels/overtrade.html',
      'panel-danger': '/settings/panels/danger-area.html'
    };
    var url = map2[panelId];
    if (url) {
      loadPanelContent(panelId, url).then(function() {
        target.dataset.loaded = 'true';
        initPanel(panelId);
      });
    }
  } else {
    initPanel(panelId);
  }
};

// ============================================================
// HASH DEĞİŞİKLİĞİNİ İZLE
// ============================================================
window.addEventListener('hashchange', function() {
  var hash = window.location.hash.replace('#', '');
  if (hash && hash.indexOf('panel-') === 0) {
    wwLog.log('📍 Hash değişti: ' + hash);
    window.switchPanel(hash);
  }
});

// ============================================================
// PANEL INIT
// ============================================================
function initPanel(panelId) {
  if (panelId === 'panel-profile') initProfile();
  if (panelId === 'panel-plan') renderPlan();
  if (panelId === 'panel-password') initPassword();
  if (panelId === 'panel-danger') initDanger();
  if (panelId === 'panel-appearance') initAppearance();
  if (panelId === 'panel-overtrade') initOvertrade();
}

// ============================================================
// GLOBAL FONKSİYONLAR
// ============================================================
window.checkStrength = function(val) {
  var bars = ['bar1', 'bar2', 'bar3', 'bar4'];
  var label = document.getElementById('pw-strength-label');
  
  bars.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.className = 'pw-strength-bar';
  });
  
  if (!val) {
    if (label) label.textContent = '';
    return;
  }
  
  var score = 0;
  if (val.length >= 6) score++;
  if (val.length >= 10) score++;
  if (/[A-Z]/.test(val) && /[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  
  var cls = score <= 1 ? 'weak' : score <= 2 ? 'medium' : 'strong';
  var labels = {
    weak: t('settings.pw_strength_weak') || 'Zayıf',
    medium: t('settings.pw_strength_medium') || 'Orta',
    strong: t('settings.pw_strength_strong') || 'Güçlü'
  };
  var colors = { weak: 'var(--red)', medium: '#facc15', strong: 'var(--green)' };
  
  for (var i = 0; i < Math.min(score, 4); i++) {
    var barEl = document.getElementById(bars[i]);
    if (barEl) barEl.classList.add(cls);
  }
  
  if (label) {
    label.textContent = labels[cls] || '';
    label.style.color = colors[cls] || '';
  }
};

window.togglePassword = function(inputId, btn) {
  var input = document.getElementById(inputId);
  if (!input) return;
  var isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  if (btn) {
    btn.innerHTML = isText
      ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
      : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  }
};

// ============================================================
// ⭐ FİYAT FONKSİYONLARI (SAF VERİ - payment.js kullanır)
// ============================================================
window.getMonthlyPrice = function() {
  try {
    var saved = localStorage.getItem('ww_monthly_price');
    if (saved) return parseFloat(saved);
  } catch(e) {}
  return (window.WW_CONFIG && window.WW_CONFIG.DEFAULT_PRICES) ? window.WW_CONFIG.DEFAULT_PRICES.monthly : 9.00;
};

window.getYearlyPrice = function() {
  try {
    var saved = localStorage.getItem('ww_yearly_price');
    if (saved) return parseFloat(saved);
  } catch(e) {}
  return (window.WW_CONFIG && window.WW_CONFIG.DEFAULT_PRICES) ? window.WW_CONFIG.DEFAULT_PRICES.yearly : 79.00;
};

window.getYearlyDiscount = function() {
  var monthly = window.getMonthlyPrice();
  var yearly = window.getYearlyPrice();
  var monthlyFull = monthly * 12;
  if (monthlyFull <= 0) return 0;
  return Math.round(((monthlyFull - yearly) / monthlyFull) * 100);
};

window.getPaymentMethods = function() {
  return ['BTC', 'LTC'];
};

// ============================================================
// ⭐ AVATAR FONKSİYONLARI - CACHE DESTEKLİ
// ============================================================
async function uploadAvatar(file) {
  if (!file || !file.type.startsWith('image/')) {
    showMsg(t('toast.invalid_image'), 'error');
    return null;
  }
  if (file.size > 2 * 1024 * 1024) {
    showMsg(t('toast.image_too_large'), 'error');
    return null;
  }
  
  var sb = getSb();
  if (!sb) {
    showMsg('Supabase bağlantısı yok!', 'error');
    return null;
  }
  
  var progress = safeEl('upload-progress');
  if (progress) progress.style.display = 'flex';
  
  var user = window.SETTINGS_STATE.currentUser;
  if (!user) {
    showMsg('Kullanıcı bilgisi yok!', 'error');
    if (progress) progress.style.display = 'none';
    return null;
  }
  
  var ext = file.name.split('.').pop();
  var fileName = 'avatars/' + user.id + '_' + Date.now() + '.' + ext;
  
  wwLog.log('📤 Avatar yükleniyor:', fileName);
  
  try {
    var listData = await sb.storage.from('avatars').list('avatars', { search: user.id });
    if (listData.data && listData.data.length > 0) {
      for (var i = 0; i < listData.data.length; i++) {
        var item = listData.data[i];
        if (item.name.indexOf(user.id) === 0) {
          await sb.storage.from('avatars').remove(['avatars/' + item.name]);
          wwLog.log('🗑️ Eski avatar silindi:', item.name);
        }
      }
    }
  } catch (e) {
    wwLog.log('Eski avatar silinemedi:', e);
  }
  
  var uploadResult = await sb.storage.from('avatars').upload(fileName, file, {
    cacheControl: '3600',
    upsert: true
  });
  
  if (uploadResult.error) {
    console.error('Yükleme hatası:', uploadResult.error);
    showMsg('Yükleme hatası: ' + uploadResult.error.message, 'error');
    if (progress) progress.style.display = 'none';
    return null;
  }
  
  var urlData = sb.storage.from('avatars').getPublicUrl(fileName);
  
  if (progress) progress.style.display = 'none';
  
  wwLog.log('✅ Avatar yüklendi:', urlData.data.publicUrl);
  return urlData.data.publicUrl;
}

async function updateAvatar(url) {
  var sb = getSb();
  if (!sb) return false;
  var user = window.SETTINGS_STATE.currentUser;
  if (!user) return false;
  
  wwLog.log('📝 Avatar güncelleniyor:', url);
  
  var result = await sb.from('user_profiles').update({ avatar_url: url }).eq('id', user.id);
  
  if (result.error) {
    console.error('Güncelleme hatası:', result.error);
    showMsg('Güncelleme hatası: ' + result.error.message, 'error');
    return false;
  }
  
  wwLog.log('✅ Avatar güncellendi!');
  return true;
}

async function loadAvatar() {
  var sb = getSb();
  if (!sb) return;
  
  var user = window.SETTINGS_STATE.currentUser;
  if (!user) return;
  
  try {
    var result = await sb.from('user_profiles').select('avatar_url').eq('id', user.id).single();
    
    if (result.error) {
      wwLog.warn('⚠️ Avatar sorgu hatası:', result.error);
      updateAvatarElements(null);
      return;
    }
    
    var url = (result.data && result.data.avatar_url) ? result.data.avatar_url : null;
    window.SETTINGS_STATE.currentAvatarUrl = url;
    updateAvatarElements(url);
    wwLog.log('🖼️ Avatar yüklendi:', url || 'varsayılan');
  } catch (e) {
    wwLog.warn('⚠️ Avatar yükleme hatası:', e);
    updateAvatarElements(null);
  }
}

function updateAvatarElements(url) {
  var user = window.SETTINGS_STATE.currentUser;
  var initial = '?';
  if (user) {
    if (user.user_metadata && user.user_metadata.username) {
      initial = user.user_metadata.username.charAt(0).toUpperCase();
    } else if (user.email) {
      initial = user.email.charAt(0).toUpperCase();
    }
  }
  
  sessionStorage.removeItem('ww_avatar_url');
  sessionStorage.removeItem('ww_avatar_time');
  
  if (typeof cachedAvatarUrl !== 'undefined') {
    cachedAvatarUrl = null;
  }
  if (typeof window.cachedAvatarUrl !== 'undefined') {
    window.cachedAvatarUrl = null;
  }
  
  var navAvatar = safeEl('user-avatar');
  if (navAvatar) {
    if (url) {
      navAvatar.innerHTML = '<img src="' + sanitizeHTML(url) + '?t=' + Date.now() + '" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
      navAvatar.style.background = 'transparent';
    } else {
      navAvatar.innerHTML = '<span id="nav-avatar-text" style="font-size:13px;font-weight:600;">' + sanitizeHTML(initial) + '</span>';
      navAvatar.style.background = 'var(--surface2)';
    }
  }
  
  var sbAvatar = safeEl('sb-avatar');
  if (sbAvatar) {
    if (url) {
      sbAvatar.innerHTML = '<img src="' + sanitizeHTML(url) + '?t=' + Date.now() + '" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:14px;">';
    } else {
      sbAvatar.innerHTML = '<span class="no-avatar" id="sb-avatar-text">' + sanitizeHTML(initial) + '</span>';
    }
  }
  
  var preview = safeEl('avatar-preview');
  var placeholder = safeEl('avatar-placeholder');
  var img = safeEl('avatar-img');
  if (preview) {
    if (url) {
      if (placeholder) placeholder.style.display = 'none';
      if (img) { 
        img.style.display = 'block'; 
        img.src = sanitizeHTML(url) + '?t=' + Date.now();
      }
    } else {
      if (placeholder) { 
        placeholder.style.display = 'flex'; 
        placeholder.textContent = sanitizeHTML(initial);
      }
      if (img) img.style.display = 'none';
    }
  }
  
  var popupPlaceholder = safeEl('popup-placeholder');
  var popupImg = safeEl('popup-avatar-img');
  if (url) {
    if (popupPlaceholder) popupPlaceholder.style.display = 'none';
    if (popupImg) { 
      popupImg.style.display = 'block'; 
      popupImg.src = sanitizeHTML(url) + '?t=' + Date.now();
    }
  } else {
    if (popupPlaceholder) {
      popupPlaceholder.style.display = 'flex';
      popupPlaceholder.textContent = sanitizeHTML(initial);
    }
    if (popupImg) popupImg.style.display = 'none';
  }
}

// ============================================================
// PROFİL PANEL
// ============================================================
function initProfile() {
  wwLog.log('📋 Profil paneli başlatılıyor...');
  
  loadAvatar();
  
  var uploadBtn = safeEl('upload-avatar-btn');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', function() {
      var fileInput = safeEl('avatar-file');
      if (fileInput) fileInput.click();
    });
  }
  
  var fileInput = safeEl('avatar-file');
  if (fileInput) {
    fileInput.addEventListener('change', async function(e) {
      var file = e.target.files[0];
      if (!file) return;
      
      var url = await uploadAvatar(file);
      if (url) {
        var success = await updateAvatar(url);
        if (success) {
          await loadAvatar();
          showMsg(t('settings.profile_photo_updated'), 'success');
        }
      }
      fileInput.value = '';
    });
  }
  
  var removeBtn = safeEl('remove-avatar-btn');
  if (removeBtn) {
    removeBtn.addEventListener('click', async function() {
      var success = await updateAvatar(null);
      if (success) {
        await loadAvatar();
        showMsg(t('settings.profile_photo_removed'), 'success');
      }
    });
  }
  
  loadProfileData();
}

// ============================================================
// PROFİL BİLGİLERİNİ YÜKLE
// ============================================================
async function loadProfileData() {
  wwLog.log('👤 Profil verileri yükleniyor...');
  
  var user = window.SETTINGS_STATE.currentUser;
  if (!user) {
    wwLog.warn('Kullanıcı yok');
    return;
  }
  
  var username = (user.user_metadata && user.user_metadata.username) ? user.user_metadata.username : user.email.split('@')[0];
  
  var sbUsername = safeEl('sb-username');
  if (sbUsername) sbUsername.textContent = sanitizeHTML(username);
  
  var sbEmail = safeEl('sb-email');
  if (sbEmail) sbEmail.textContent = sanitizeHTML(user.email);
  
  var profileUsername = safeEl('profile-username');
  if (profileUsername) profileUsername.textContent = sanitizeHTML(username);
  
  var profileEmail = safeEl('profile-email');
  if (profileEmail) profileEmail.textContent = sanitizeHTML(user.email);
  
  var profileCreated = safeEl('profile-created');
  if (profileCreated) {
    profileCreated.textContent = new Date(user.created_at).toLocaleDateString('tr-TR', {
      day: '2-digit', month: 'long', year: 'numeric'
    });
  }
  
  if (isAdmin(user)) {
    var adminLink = safeEl('admin-link');
    if (adminLink) adminLink.style.display = 'inline';
    var adminLinkMobile = safeEl('admin-link-mobile');
    if (adminLinkMobile) adminLinkMobile.style.display = 'block';
  }
  
  wwLog.log('✅ Profil verileri yüklendi!');
}

// ============================================================
// ⭐ CONFIRM MODAL
// ============================================================
function showConfirmModal(title, message, warning, onConfirm, onCancel) {
  var modal = document.getElementById('confirm-modal');
  var titleEl = document.getElementById('confirm-title');
  var messageEl = document.getElementById('confirm-message');
  var warningEl = document.getElementById('confirm-warning');
  var okBtn = document.getElementById('confirm-ok');
  var cancelBtn = document.getElementById('confirm-cancel');
  
  if (!modal || !titleEl || !messageEl) return;
  
  titleEl.textContent = sanitizeHTML(title) || '⚠️ Dikkat!';
  messageEl.textContent = sanitizeHTML(message) || 'Bu işlem geri alınamaz. Devam etmek istediğinize emin misiniz?';
  
  if (warningEl && warning) {
    warningEl.style.display = 'flex';
    var span = warningEl.querySelector('span');
    if (span) span.textContent = sanitizeHTML(warning);
  } else if (warningEl) {
    warningEl.style.display = 'none';
  }
  
  modal.classList.add('active');
  
  var newOk = okBtn.cloneNode(true);
  var newCancel = cancelBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(newOk, okBtn);
  cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
  
  newOk.addEventListener('click', function() {
    modal.classList.remove('active');
    if (typeof onConfirm === 'function') onConfirm();
  });
  
  newCancel.addEventListener('click', function() {
    modal.classList.remove('active');
    if (typeof onCancel === 'function') onCancel();
  });
  
  modal.addEventListener('click', function(e) {
    if (e.target === this) {
      modal.classList.remove('active');
      if (typeof onCancel === 'function') onCancel();
    }
  });
}

window.showConfirmModal = showConfirmModal;

// ============================================================
// ⭐ PLAN PANEL
// ============================================================
async function renderPlan() {
  var container = safeEl('plan-container');
  if (!container) return;
  
  try {
    var user = await getCurrentUser();
    if (!user) {
      container.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--muted);">' + t('settings.plan_load_error') + '</div>';
      return;
    }
    
    window.SETTINGS_STATE.currentUser = user;
    
    var sb = getSb();
    if (!sb) throw new Error('Supabase');
    
    var result = await sb.from('user_profiles').select('plan, plan_expires_at').eq('id', user.id).single();
    var data = result.data;
    
    var isPremium = data && data.plan === 'premium';
    var expiresAt = data && data.plan_expires_at ? new Date(data.plan_expires_at) : null;
    
    window.SETTINGS_STATE.isPremium = isPremium;
    
    if (isPremium && expiresAt && new Date() > expiresAt) {
      window.SETTINGS_STATE.isPremium = false;
      renderPlan();
      return;
    }
    
    var monthly = window.getMonthlyPrice ? window.getMonthlyPrice() : 9;
    var yearly = window.getYearlyPrice ? window.getYearlyPrice() : 79;
    var methods = window.getPaymentMethods ? window.getPaymentMethods() : ['BTC', 'LTC'];
    
    var lang = (window.i18n && typeof window.i18n.getCurrentLanguage === 'function') ? window.i18n.getCurrentLanguage() : 'tr';
    var locale = lang === 'tr' ? 'tr-TR' : (lang === 'de' ? 'de-DE' : 'en-US');
    
    var tplId = isPremium ? 'tpl-plan-premium' : 'tpl-plan-free';
    var tpl = document.getElementById(tplId);
    if (!tpl) {
      container.innerHTML = '<div style="padding:1rem;color:var(--red);">Template not found: ' + tplId + '</div>';
      return;
    }
    
    var clone = tpl.content.cloneNode(true);
    
    if (isPremium) {
      var daysLeft = expiresAt ? Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24)) : 0;
      var pct = Math.max(0, Math.min(100, ((30 - daysLeft) / 30) * 100));
      
      var daysEl = clone.querySelector('[data-bind="days-left"]');
      if (daysEl) daysEl.textContent = daysLeft + ' ' + t('settings.plan_days');
      
      var progEl = clone.querySelector('[data-bind="progress"]');
      if (progEl) progEl.style.width = pct + '%';
      
      var expEl = clone.querySelector('[data-bind="expiry-date"]');
      if (expEl && expiresAt) expEl.textContent = expiresAt.toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });
      
      var perksGrid = clone.querySelector('#plan-perks-grid');
      if (perksGrid) {
        PREMIUM_FEATURES.forEach(function(f) {
          var item = document.createElement('div');
          item.className = 'perk-item';
          var iconSpan = document.createElement('span');
          iconSpan.className = 'perk-icon';
          iconSpan.innerHTML = getLucideIcon(f.iconName, 16);
          var textSpan = document.createElement('span');
          textSpan.className = 'perk-text';
          textSpan.setAttribute('data-i18n', f.key);
          item.appendChild(iconSpan);
          item.appendChild(textSpan);
          perksGrid.appendChild(item);
        });
      }
    } else {
      var methodsContainer = clone.querySelector('#plan-payment-methods');
      if (methodsContainer) {
        methods.forEach(function(m, idx) {
          var btn = document.createElement('button');
          btn.className = 'pay-method-btn' + (idx === 0 ? ' active' : '');
          btn.setAttribute('data-method', m);
          btn.textContent = m;
          methodsContainer.appendChild(btn);
        });
        if (methods.length > 0) window.SETTINGS_STATE.payMethod = methods[0];
      }
      
      var monthlyBtnSpan = clone.querySelector('#upgrade-monthly [data-i18n="settings.plan_monthly_btn"]');
      if (monthlyBtnSpan) monthlyBtnSpan.setAttribute('data-i18n-params', JSON.stringify({ price: String(monthly) }));
      
      var yearlyBtnSpan = clone.querySelector('#upgrade-yearly [data-i18n="settings.plan_yearly_btn"]');
      if (yearlyBtnSpan) yearlyBtnSpan.setAttribute('data-i18n-params', JSON.stringify({ price: String(yearly) }));
      
      var secureSpan = clone.querySelector('[data-i18n="settings.plan_secure_payment"]');
      if (secureSpan) secureSpan.setAttribute('data-i18n-params', JSON.stringify({ methods: methods.join(' / ') }));
    }
    
    clone.querySelectorAll('[data-icon]').forEach(function(el) {
      el.innerHTML = getLucideIcon(el.getAttribute('data-icon'), 14);
    });
    
    container.innerHTML = '';
    container.appendChild(clone);
    
    if (window.i18n && typeof window.i18n.apply === 'function') {
      try { window.i18n.apply(); } catch(e) {}
    }
    
    var monthlyBtn = container.querySelector('#upgrade-monthly');
    if (monthlyBtn) {
      monthlyBtn.addEventListener('click', async function() {
        var payMethod = window.SETTINGS_STATE.payMethod || 'BTC';
        var price = window.getMonthlyPrice ? window.getMonthlyPrice() : 9;
        if (window.upgradeToPremium) {
          await window.upgradeToPremium('monthly', price, 'USD', payMethod);
        } else {
          showMsg(t('payment.link_failed'), 'error');
        }
      });
    }
    
    var yearlyBtn = container.querySelector('#upgrade-yearly');
    if (yearlyBtn) {
      yearlyBtn.addEventListener('click', async function() {
        var payMethod = window.SETTINGS_STATE.payMethod || 'BTC';
        var price = window.getYearlyPrice ? window.getYearlyPrice() : 79;
        if (window.upgradeToPremium) {
          await window.upgradeToPremium('yearly', price, 'USD', payMethod);
        } else {
          showMsg(t('payment.link_failed'), 'error');
        }
      });
    }
    
    var cancelBtn = container.querySelector('#cancel-premium-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', async function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (window.cancelPremium) {
          var success = await window.cancelPremium();
          if (success) {
            showMsg(t('settings.cancel_subscription_success'), 'success');
            await renderPlan();
            if (typeof updateBadge === 'function') await updateBadge();
          }
        }
      });
    }
    
    container.querySelectorAll('.pay-method-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        container.querySelectorAll('.pay-method-btn').forEach(function(b) { b.classList.remove('active'); });
        this.classList.add('active');
        window.SETTINGS_STATE.payMethod = this.getAttribute('data-method');
        if (window.selectPayMethod) window.selectPayMethod(this.getAttribute('data-method'));
      });
    });
    
    if (isPremium && expiresAt) startTimer(expiresAt);
    
  } catch (e) {
    console.error('Plan hatası:', e);
    container.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--muted);">' + sanitizeHTML(e.message) + '</div>';
  }
}

window.renderPlan = renderPlan;

// ============================================================
// ⭐ SÜRE SAYACI
// ============================================================
function startTimer(expiresAt) {
  if (window.SETTINGS_STATE.timerInterval) {
    clearInterval(window.SETTINGS_STATE.timerInterval);
  }
  
  window.SETTINGS_STATE.timerInterval = setInterval(function() {
    try {
      var now = new Date();
      var diff = expiresAt - now;
      
      if (diff <= 0) {
        clearInterval(window.SETTINGS_STATE.timerInterval);
        var timerEl = document.getElementById('timer-days');
        if (timerEl) timerEl.textContent = t('settings.plan_expired');
        return;
      }
      
      var days = Math.floor(diff / (1000 * 60 * 60 * 24));
      var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      
      var timerEl = document.getElementById('timer-days');
      if (timerEl) {
        if (days > 0) {
          timerEl.textContent = days + ' ' + t('settings.plan_days') + ' ' + hours + ' ' + t('settings.plan_hours');
        } else if (hours > 0) {
          timerEl.textContent = hours + ' ' + t('settings.plan_hours');
        } else {
          timerEl.textContent = t('settings.plan_less_than_hour');
        }
      }
    } catch (e) {}
  }, 10000);
}

// ============================================================
// ŞİFRE PANEL
// ============================================================
function initPassword() {
  wwLog.log('🔐 Şifre paneli başlatılıyor...');
  
  var btn = safeEl('change-password-btn');
  if (btn) {
    btn.addEventListener('click', async function() {
      var current = safeEl('current-password');
      var next = safeEl('new-password');
      var confirm = safeEl('confirm-password');
      var err = safeEl('password-error');
      var ok = safeEl('password-success');
      
      if (!current || !next || !confirm) return;
      
      if (err) err.style.display = 'none';
      if (ok) ok.style.display = 'none';
      
      if (!current.value || !next.value || !confirm.value) {
        if (err) { err.textContent = t('settings.password_fill_all'); err.style.display = 'block'; }
        return;
      }
      if (next.value.length < 6) {
        if (err) { err.textContent = t('settings.password_min_chars'); err.style.display = 'block'; }
        return;
      }
      if (next.value !== confirm.value) {
        if (err) { err.textContent = t('settings.password_mismatch'); err.style.display = 'block'; }
        return;
      }
      
      var sb = getSb();
      if (!sb) {
        if (err) { err.textContent = 'Supabase bağlantısı yok!'; err.style.display = 'block'; }
        return;
      }
      
      btn.disabled = true;
      btn.textContent = t('settings.updating');
      
      var user = window.SETTINGS_STATE.currentUser;
      var signResult = await sb.auth.signInWithPassword({
        email: user.email,
        password: current.value
      });
      
      if (signResult.error) {
        if (err) { err.textContent = t('settings.password_wrong_current'); err.style.display = 'block'; }
        btn.disabled = false;
        btn.textContent = t('settings.update_password_btn');
        return;
      }
      
      var updateResult = await sb.auth.updateUser({ password: next.value });
      if (updateResult.error) {
        if (err) { err.textContent = sanitizeHTML(updateResult.error.message); err.style.display = 'block'; }
      } else {
        if (ok) { ok.textContent = t('settings.password_updated'); ok.style.display = 'block'; }
        current.value = '';
        next.value = '';
        confirm.value = '';
        window.checkStrength('');
      }
      
      btn.disabled = false;
      btn.textContent = t('settings.update_password_btn');
    });
  }
}

// ============================================================
// TEHLİKELİ BÖLGE
// ============================================================
function initDanger() {
  wwLog.log('⚠️ Tehlikeli bölge başlatılıyor...');
  
  var deleteBtn = safeEl('delete-data-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', deleteAllUserData);
  }
  
  var deactivateBtn = safeEl('deactivate-account-btn');
  if (deactivateBtn) {
    deactivateBtn.addEventListener('click', deactivateAccount);
  }
}

async function deleteAllUserData() {
  var user = window.SETTINGS_STATE.currentUser;
  if (!user) {
    showMsg('Kullanıcı bilgisi bulunamadı!', 'error');
    return;
  }
  
  var confirmed = await new Promise(function(resolve) {
    showConfirmModal(
      '🗑️ ' + t('settings.delete_confirm_title'),
      t('settings.delete_confirm_message'),
      '⚠️ ' + t('settings.delete_confirm_warning'),
      function() { resolve(true); },
      function() { resolve(false); }
    );
  });
  
  if (!confirmed) return;
  
  var btn = safeEl('delete-data-btn');
  var originalText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = t('settings.deleting');
  }
  
  try {
    var sb = getSb();
    if (!sb) throw new Error('Supabase bağlantısı yok');
    
    wwLog.log('🗑️ Trade verileri siliniyor...');
    var tradesResult = await sb.from('trades').delete().eq('user_id', user.id);
    if (tradesResult.error) throw tradesResult.error;
    
    wwLog.log('🗑️ Backtest verileri siliniyor...');
    try {
      var backtestResult = await sb.from('backtest_trades').delete().eq('user_id', user.id);
      if (backtestResult.error) {
        wwLog.warn('Backtest trades silinemedi:', backtestResult.error.message);
      }
    } catch (btErr) {
      wwLog.warn('Backtest tablosu yok olabilir:', btErr);
    }
    
    wwLog.log('✅ Veri silme tamamlandı');
    showMsg('✅ ' + t('settings.delete_success'), 'success');
    
    setTimeout(function() {
      window.location.reload();
    }, 1500);
    
  } catch (e) {
    console.error('❌ Veri silme hatası:', e);
    showMsg('❌ ' + t('settings.delete_error') + (e.message || 'Unknown'), 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}

async function deactivateAccount() {
  var user = window.SETTINGS_STATE.currentUser;
  if (!user) {
    showMsg('Kullanıcı bilgisi bulunamadı!', 'error');
    return;
  }
  
  var confirmed = await new Promise(function(resolve) {
    showConfirmModal(
      '⚠️ ' + t('settings.deactivate_confirm_title'),
      t('settings.deactivate_confirm_message'),
      '⚠️ ' + t('settings.deactivate_confirm_warning'),
      function() { resolve(true); },
      function() { resolve(false); }
    );
  });
  
  if (!confirmed) return;
  
  var btn = safeEl('deactivate-account-btn');
  var originalText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = t('settings.deactivating');
  }
  
  try {
    var sb = getSb();
    if (!sb) throw new Error('Supabase bağlantısı yok');
    
    wwLog.log('🔒 Hesap devre dışı bırakılıyor...');
    var result = await sb.rpc('deactivate_own_account');
    
    if (result.error) throw result.error;
    
    wwLog.log('✅ Hesap devre dışı bırakıldı');
    showMsg('✅ ' + t('settings.deactivate_success'), 'success');
    
    setTimeout(async function() {
      try {
        await sb.auth.signOut();
      } catch (e) {}
      try { localStorage.removeItem('ww_last_active_push'); } catch(e) {}
      window.location.href = '/login.html';
    }, 1500);
    
  } catch (e) {
    console.error('❌ Hesap devre dışı bırakma hatası:', e);
    var errMsg = e.message || 'Bilinmeyen hata';
    
    if (errMsg.indexOf('function') !== -1 || errMsg.indexOf('does not exist') !== -1) {
      errMsg = t('settings.deactivate_server_update');
    }
    
    showMsg('❌ ' + t('settings.deactivate_error') + errMsg, 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}

// ============================================================
// ⭐ GÖRÜNÜM PANEL - TEMA ÖZELLEŞTİRME AKTİF
// ============================================================
function initAppearance() {
  wwLog.log('🎨 Görünüm paneli başlatılıyor...');
  initLanguageSelector();
  initCurrencySelector();
  
  var container = safeEl('theme-customization-container');
  if (!container) {
    wwLog.warn('⚠️ theme-customization-container bulunamadı!');
    return;
  }
  
  if (typeof window.loadThemeCustomization === 'function') {
    wwLog.log('✅ loadThemeCustomization fonksiyonu bulundu, çağrılıyor...');
    window.loadThemeCustomization();
  } else if (typeof loadThemeCustomization === 'function') {
    wwLog.log('✅ loadThemeCustomization (global) çağrılıyor...');
    loadThemeCustomization();
  } else {
    wwLog.warn('⚠️ loadThemeCustomization fonksiyonu bulunamadı, fallback UI kullanılıyor...');
    loadThemeCustomizationFallback();
  }
}

function loadThemeCustomizationFallback() {
  var container = document.getElementById('theme-customization-container');
  if (!container) return;
  
  var isLight = document.body.classList.contains('light-theme');
  
  if (isLight) {
    var tplLight = document.getElementById('tpl-theme-light-locked');
    if (!tplLight) return;
    var cloneLight = tplLight.content.cloneNode(true);
    container.innerHTML = '';
    container.appendChild(cloneLight);
    if (window.i18n && typeof window.i18n.apply === 'function') window.i18n.apply();
    
    var switchBtn = container.querySelector('#theme-switch-to-dark-btn');
    if (switchBtn) {
      switchBtn.addEventListener('click', function() {
        var toggle = document.getElementById('theme-toggle');
        if (toggle && !toggle.checked) toggle.click();
      });
    }
    return;
  }
  
  getUserPlanSilent().then(function(result) {
    var isPremium = result.plan === 'premium';
    
    if (!isPremium) {
      var tplLocked = document.getElementById('tpl-theme-locked');
      if (!tplLocked) return;
      container.innerHTML = '';
      container.appendChild(tplLocked.content.cloneNode(true));
      if (window.i18n && typeof window.i18n.apply === 'function') window.i18n.apply();
      return;
    }
    
    var tplForm = document.getElementById('tpl-theme-form');
    if (!tplForm) return;
    var cloneForm = tplForm.content.cloneNode(true);
    
    var settings = typeof getThemeSettings === 'function' ? getThemeSettings() : {
      backgroundColor: '#0a0a0f', surfaceColor: '#111118', borderColor: '#1e1e2e', textColor: '#e8e8f0', fontSize: 16
    };
    
    var bgInput = cloneForm.querySelector('#custom-bg-color');
    var bgText = cloneForm.querySelector('#custom-bg-color-text');
    var surfInput = cloneForm.querySelector('#custom-surface-color');
    var surfText = cloneForm.querySelector('#custom-surface-color-text');
    var borderInput = cloneForm.querySelector('#custom-border-color');
    var borderText = cloneForm.querySelector('#custom-border-color-text');
    var textInput = cloneForm.querySelector('#custom-text-color');
    var textText = cloneForm.querySelector('#custom-text-color-text');
    var fontSize = cloneForm.querySelector('#custom-font-size');
    var fontSizeDisplay = cloneForm.querySelector('#font-size-display');
    
    if (bgInput) bgInput.value = settings.backgroundColor || '#0a0a0f';
    if (bgText) bgText.value = settings.backgroundColor || '#0a0a0f';
    if (surfInput) surfInput.value = settings.surfaceColor || '#111118';
    if (surfText) surfText.value = settings.surfaceColor || '#111118';
    if (borderInput) borderInput.value = settings.borderColor || '#1e1e2e';
    if (borderText) borderText.value = settings.borderColor || '#1e1e2e';
    if (textInput) textInput.value = settings.textColor || '#e8e8f0';
    if (textText) textText.value = settings.textColor || '#e8e8f0';
    if (fontSize) fontSize.value = settings.fontSize || 16;
    if (fontSizeDisplay) fontSizeDisplay.textContent = (settings.fontSize || 16) + 'px';
    
    cloneForm.querySelectorAll('[data-icon]').forEach(function(el) {
      el.innerHTML = getLucideIcon(el.getAttribute('data-icon'), 14);
    });
    
    container.innerHTML = '';
    container.appendChild(cloneForm);
    
    if (window.i18n && typeof window.i18n.apply === 'function') window.i18n.apply();
    
    setupThemeEventsFallback();
    
  }).catch(function(err) {
    console.error('❌ Premium kontrol hatası:', err);
    container.innerHTML = '<div style="text-align:center;padding:1.5rem;background:var(--surface2);border-radius:var(--radius);border:1px solid var(--border);"><p style="color:var(--muted);">⚠️ ' + t('settings.theme_load_error') + '</p><button onclick="location.reload()" class="btn btn-ghost" style="margin-top:0.5rem;">🔄 ' + t('overtrade.retry') + '</button></div>';
  });
}

function setupThemeEventsFallback() {
  var bgColor = document.getElementById('custom-bg-color');
  var surfaceColor = document.getElementById('custom-surface-color');
  var borderColor = document.getElementById('custom-border-color');
  var textColor = document.getElementById('custom-text-color');
  var fontSize = document.getElementById('custom-font-size');
  var fontSizeDisplay = document.getElementById('font-size-display');
  var previewBox = document.getElementById('theme-preview-box');
  
  function updatePreview() {
    var root = document.documentElement;
    if (bgColor) root.style.setProperty('--bg', bgColor.value);
    if (surfaceColor) root.style.setProperty('--surface', surfaceColor.value);
    if (borderColor) root.style.setProperty('--border', borderColor.value);
    if (textColor) root.style.setProperty('--text', textColor.value);
    if (fontSize) {
      var size = fontSize.value + 'px';
      document.body.style.fontSize = size;
      if (fontSizeDisplay) fontSizeDisplay.textContent = size;
    }
    if (previewBox) {
      if (surfaceColor) previewBox.style.background = surfaceColor.value;
      if (borderColor) previewBox.style.borderColor = borderColor.value;
      if (textColor) previewBox.style.color = textColor.value;
    }
  }
  
  function saveTheme() {
    var isLight = document.body.classList.contains('light-theme');
    
    if (isLight) {
      var fontOnly = { fontSize: parseInt(fontSize.value) };
      if (typeof saveThemeSettings === 'function') {
        saveThemeSettings(fontOnly);
      } else if (typeof window.saveThemeSettings === 'function') {
        window.saveThemeSettings(fontOnly);
      }
      showMsg('✅ ' + t('settings.font_updated_light'), 'success');
      return;
    }
    
    var settings = {
      backgroundColor: bgColor ? bgColor.value : '#0a0a0f',
      surfaceColor: surfaceColor ? surfaceColor.value : '#111118',
      borderColor: borderColor ? borderColor.value : '#1e1e2e',
      textColor: textColor ? textColor.value : '#e8e8f0',
      fontSize: fontSize ? parseInt(fontSize.value) : 16
    };
    if (typeof saveThemeSettings === 'function') {
      saveThemeSettings(settings);
    } else if (typeof window.saveThemeSettings === 'function') {
      window.saveThemeSettings(settings);
    }
    showMsg('✅ ' + t('settings.theme_saved'), 'success');
  }
  
  function resetTheme() {
    var defaultSettings = {
      backgroundColor: '#0a0a0f',
      surfaceColor: '#111118',
      borderColor: '#1e1e2e',
      textColor: '#e8e8f0',
      fontSize: 16
    };
    if (bgColor) bgColor.value = defaultSettings.backgroundColor;
    if (surfaceColor) surfaceColor.value = defaultSettings.surfaceColor;
    if (borderColor) borderColor.value = defaultSettings.borderColor;
    if (textColor) textColor.value = defaultSettings.textColor;
    if (fontSize) fontSize.value = defaultSettings.fontSize;
    updatePreview();
    if (typeof saveThemeSettings === 'function') {
      saveThemeSettings(defaultSettings);
    } else if (typeof window.saveThemeSettings === 'function') {
      window.saveThemeSettings(defaultSettings);
    }
    showMsg('↺ ' + t('settings.theme_reset_done'), 'success');
  }
  
  if (bgColor) bgColor.addEventListener('input', updatePreview);
  if (surfaceColor) surfaceColor.addEventListener('input', updatePreview);
  if (borderColor) borderColor.addEventListener('input', updatePreview);
  if (textColor) textColor.addEventListener('input', updatePreview);
  if (fontSize) fontSize.addEventListener('input', updatePreview);
  
  var saveBtn = document.getElementById('save-custom-theme-btn');
  if (saveBtn) saveBtn.addEventListener('click', saveTheme);
  
  var resetBtn = document.getElementById('reset-custom-theme-btn');
  if (resetBtn) resetBtn.addEventListener('click', resetTheme);
  
  updatePreview();
}

// ============================================================
// ⭐ DİL SEÇİCİ
// ============================================================
function initLanguageSelector() {
  wwLog.log('🌐 Dil seçici başlatılıyor...');
  
  var savedLang = localStorage.getItem('ww_language') || 'en';
  var currentLang = (window.i18n && typeof window.i18n.getCurrentLanguage === 'function') ? window.i18n.getCurrentLanguage() : savedLang;
  
  wwLog.log('🌐 Mevcut dil: ' + currentLang + ' (kayıtlı: ' + savedLang + ')');
  
  var btns = document.querySelectorAll('.lang-compact-btn');
  
  if (btns.length === 0) {
    wwLog.warn('⚠️ Dil butonları bulunamadı!');
    return;
  }
  
  btns.forEach(function(btn) {
    var lang = btn.dataset.lang;
    if (lang === currentLang) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
    
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      var lang = this.dataset.lang;
      wwLog.log('🖱️ Dil seçildi: ' + lang);
      
      document.querySelectorAll('.lang-compact-btn').forEach(function(b) {
        b.classList.remove('active');
      });
      this.classList.add('active');
      
      localStorage.setItem('ww_language', lang);
      document.documentElement.setAttribute('data-lang', lang);
      
      if (window.i18n && typeof window.i18n.setLanguage === 'function') {
        i18n.currentLang = lang;
        var success = i18n.setLanguage(lang);
        
        if (success) {
          wwLog.log('✅ Dil değiştirildi: ' + lang);
          if (typeof window.i18n.apply === 'function') {
            window.i18n.apply();
          }
          if (typeof window.updateNavbarI18n === 'function') {
            window.updateNavbarI18n();
          } else if (typeof updateNavbarI18n === 'function') {
            updateNavbarI18n();
          }
          document.querySelectorAll('[data-i18n]').forEach(function(el) {
            var key = el.getAttribute('data-i18n');
            if (key) {
              var translated = i18n.t(key);
              if (translated && translated !== key) {
                el.textContent = translated;
              }
            }
          });
          showMsg(t('settings.language_selected', { name: this.textContent.trim() }), 'success');
          wwLog.log('✅ Dil değişimi tamamlandı (' + lang + ')');
        } else {
          showMsg('Dil değiştirilemedi, sayfa yenileniyor...', 'info');
          setTimeout(function() { location.reload(); }, 500);
        }
      } else {
        showMsg('Dil kaydedildi, sayfa yenileniyor...', 'info');
        setTimeout(function() { location.reload(); }, 500);
      }
    });
  });
  
  wwLog.log('✅ Dil seçici başlatıldı!');
}

// ============================================================
// ⭐ PARA BİRİMİ SEÇİCİ
// ============================================================
function initCurrencySelector() {
  wwLog.log('💰 Para birimi seçici başlatılıyor...');
  
  var current = localStorage.getItem('ww_currency') || '$';
  var btns = document.querySelectorAll('.currency-btn');
  
  btns.forEach(function(btn) {
    if (btn.dataset.currency === current) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
    
    btn.addEventListener('click', function() {
      var currency = this.dataset.currency;
      
      localStorage.setItem('ww_currency', currency);
      
      if (typeof window.setCurrencySymbol === 'function') {
        window.setCurrencySymbol(currency);
      }
      
      btns.forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      
      try {
        window.dispatchEvent(new CustomEvent('currencyChanged', { 
          detail: { symbol: currency } 
        }));
      } catch(e) {}
      
      document.querySelectorAll('.currency-display, .currency-symbol, [data-currency-display]').forEach(function(el) {
        el.textContent = currency;
      });
      
      showMsg(t('settings.currency_changed_success'), 'success');
      
      setTimeout(function() { location.reload(); }, 800);
    });
  });
  
  wwLog.log('✅ Para birimi seçici başlatıldı!');
}

// ============================================================
// ⭐ OVER TRADE
// ============================================================
function initOvertrade() {
  wwLog.log('📊 Over Trade paneli başlatılıyor...');
  
  var container = safeEl('overtrade-settings-container');
  if (!container) {
    wwLog.warn('⚠️ Over Trade container bulunamadı!');
    return;
  }
  
  if (typeof window.loadOvertradeSettingsUI === 'function') {
    wwLog.log('✅ loadOvertradeSettingsUI fonksiyonu bulundu, çağrılıyor...');
    window.loadOvertradeSettingsUI('overtrade-settings-container');
  } else {
    console.error('❌ loadOvertradeSettingsUI fonksiyonu bulunamadı!');
    var tplErr = document.getElementById('tpl-overtrade-error');
    if (tplErr) {
      container.innerHTML = '';
      container.appendChild(tplErr.content.cloneNode(true));
      if (window.i18n && typeof window.i18n.apply === 'function') window.i18n.apply();
    }
  }
}

// ============================================================
// PLAN BADGE GÜNCELLE
// ⭐ DEĞİŞTİ: Plan rozeti sorumluluğu navbar.js'e taşındı (DRY + race fix)
// ============================================================
async function updateBadge() {
  if (typeof window.updateNavbarBadge === 'function') {
    await window.updateNavbarBadge();
  }
}

window.updateBadge = updateBadge;

// ============================================================
// NAV EVENT LISTENER
// ============================================================
function initNavEvents() {
  wwLog.log('🧭 Nav event listener başlatılıyor...');
  
  var ddBtn = document.getElementById('premium-dropdown-btn');
  var ddMenu = document.getElementById('premium-dropdown-menu');
  if (ddBtn && ddMenu) {
    ddBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      this.classList.toggle('active');
      ddMenu.classList.toggle('open');
    });
    document.addEventListener('click', function() {
      ddBtn.classList.remove('active');
      ddMenu.classList.remove('open');
    });
  }
  
  var bellBtn = document.getElementById('overtrade-bell-btn');
  var bellPanel = document.getElementById('bell-panel');
  if (bellBtn && bellPanel) {
    bellBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      bellPanel.classList.toggle('open');
    });
    document.addEventListener('click', function(e) {
      if (!bellPanel.contains(e.target) && !bellBtn.contains(e.target)) {
        bellPanel.classList.remove('open');
      }
    });
  }
  
  var bellClose = document.getElementById('bell-panel-close');
  if (bellClose) {
    bellClose.addEventListener('click', function() {
      var panel = document.getElementById('bell-panel');
      if (panel) panel.classList.remove('open');
    });
  }
  
  var avatar = document.getElementById('user-avatar');
  var dropdown = document.getElementById('dropdown-menu');
  if (avatar && dropdown) {
    avatar.addEventListener('click', function(e) {
      e.stopPropagation();
      dropdown.classList.toggle('show');
    });
    document.addEventListener('click', function() {
      dropdown.classList.remove('show');
    });
  }
  
  var logoutBtn = document.getElementById('logout-dropdown-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async function() {
      var sb = getSb();
      if (sb) await sb.auth.signOut();
      localStorage.removeItem('ww_last_active_push');
      window.location.href = '/index.html';
    });
  }
  
  var toggle = document.getElementById('nav-toggle');
  var menu = document.getElementById('nav-menu');
  var backdrop = document.getElementById('nav-backdrop');
  if (toggle && menu && backdrop) {
    toggle.addEventListener('click', function() {
      this.classList.toggle('open');
      menu.classList.toggle('open');
      backdrop.classList.toggle('open');
      document.body.style.overflow = menu.classList.contains('open') ? 'hidden' : '';
    });
    backdrop.addEventListener('click', function() {
      toggle.classList.remove('open');
      menu.classList.remove('open');
      backdrop.classList.remove('open');
      document.body.style.overflow = '';
    });
  }
  
  var logoutMobile = document.getElementById('logout-btn-mobile');
  if (logoutMobile) {
    logoutMobile.addEventListener('click', function() {
      var toggleEl = document.getElementById('nav-toggle');
      if (toggleEl) toggleEl.classList.remove('open');
      var menuEl = document.getElementById('nav-menu');
      if (menuEl) menuEl.classList.remove('open');
      var backdropEl = document.getElementById('nav-backdrop');
      if (backdropEl) backdropEl.classList.remove('open');
      document.body.style.overflow = '';
      var logoutBtnEl = document.getElementById('logout-dropdown-btn');
      if (logoutBtnEl) logoutBtnEl.click();
    });
  }
  
  wwLog.log('✅ Nav event listener başlatıldı!');
}

// ============================================================
// PANEL CLICK EVENTLERİ
// ============================================================
function initPanelClickEvents() {
  wwLog.log('📋 Panel click eventleri başlatılıyor...');
  
  document.querySelectorAll('.sidebar-nav-item').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      var panelId = this.dataset.panel;
      if (panelId) {
        wwLog.log('🖱️ Sidebar tıklandı: ' + panelId);
        window.switchPanel(panelId);
      }
    });
  });
  
  document.querySelectorAll('.settings-tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      var panelId = this.dataset.panel;
      if (panelId) {
        wwLog.log('🖱️ Tab tıklandı: ' + panelId);
        window.switchPanel(panelId);
      }
    });
  });
  
  wwLog.log('✅ Panel click eventleri başlatıldı!');
}

// ============================================================
// AVATAR POPUP
// ============================================================
function initAvatarPopup() {
  wwLog.log('🖼️ Avatar popup başlatılıyor...');
  
  var sidebarProfile = document.getElementById('sidebar-profile');
  if (sidebarProfile) {
    sidebarProfile.addEventListener('click', function() {
      var popup = document.getElementById('avatar-popup');
      if (popup) {
        popup.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
    });
  }
  
  var closeBtn = document.getElementById('avatar-popup-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', closePopup);
  }
  
  var popup = document.getElementById('avatar-popup');
  if (popup) {
    popup.addEventListener('click', function(e) {
      if (e.target === this) closePopup();
    });
  }
}

function closePopup() {
  var popup = document.getElementById('avatar-popup');
  if (popup) popup.classList.remove('active');
  document.body.style.overflow = '';
}

// ============================================================
// CONFIRM MODAL - INIT
// ============================================================
function initConfirmModal() {
  wwLog.log('📦 Confirm modal başlatılıyor...');
  
  var modal = document.getElementById('confirm-modal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === this) this.classList.remove('active');
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && modal.classList.contains('active')) {
        modal.classList.remove('active');
      }
    });
  }
}

// ============================================================
// PREMIUM KONTROL
// ============================================================
async function checkAndActivatePremium() {
  wwLog.log('🔍 Premium kontrol ediliyor...');
  
  var user = window.SETTINGS_STATE.currentUser;
  if (!user) {
    wwLog.warn('Kullanıcı yok');
    return;
  }
  
  var sb = getSb();
  if (!sb) {
    console.error('Supabase bağlantısı yok');
    return;
  }
  
  try {
    var result = await sb.from('user_profiles').select('plan, plan_expires_at').eq('id', user.id).single();
    
    if (result.error) throw result.error;
    
    var data = result.data;
    var isPremium = data && data.plan === 'premium';
    var expiresAt = data && data.plan_expires_at ? new Date(data.plan_expires_at) : null;
    
    if (isPremium && expiresAt && new Date() > expiresAt) {
      wwLog.log('⏰ Premium süresi dolmuş; erişim yerelde ücretsiz olarak değerlendiriliyor.');
      window.SETTINGS_STATE.isPremium = false;
      return;
    }
    
    window.SETTINGS_STATE.isPremium = isPremium;
    
    if (isPremium) {
      try {
        localStorage.setItem('ww_user_plan', JSON.stringify({ 
          plan: 'premium', 
          expires_at: expiresAt ? expiresAt.toISOString() : null 
        }));
      } catch(e) {}
      wwLog.log('✅ Premium aktif! Bitiş:', expiresAt);
    } else {
      wwLog.log('📌 Ücretsiz plan');
    }
    
  } catch (e) {
    console.error('Premium kontrol hatası:', e);
  }
}

// ============================================================
// ⭐ SAYFA BAŞLATMA
// ============================================================
document.addEventListener('DOMContentLoaded', async function() {
  wwLog.log('🚀 Settings başlatılıyor...');
  
  try {
    var savedLang = localStorage.getItem('ww_language');
    if (savedLang && window.i18n) {
      var currentLang = window.i18n.getCurrentLanguage();
      if (currentLang !== savedLang) {
        wwLog.log('🔄 Dil geri yükleniyor: ' + currentLang + ' → ' + savedLang);
        window.i18n.setLanguage(savedLang);
      }
      document.documentElement.setAttribute('data-lang', savedLang);
    }
    
    var sb = getSb();
    if (!sb && window.supabase && typeof window.supabase.createClient === 'function') {
      var url = window.SUPABASE_URL || 'https://odasapyhtdopbnlfhwde.supabase.co';
      var key = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kYXNhcHlodGRvcGJubGZod2RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NDk0NjgsImV4cCI6MjA5NDAyNTQ2OH0.AH7V9i61pFWj33sCy51khdYHZn34BNitXY9exJySmWg';
      window.sb = window.supabase.createClient(url, key);
      sb = window.sb;
      wwLog.log('✅ Supabase client oluşturuldu');
    }
    
    if (!sb) {
      console.error('❌ Supabase bağlantısı yok!');
      return;
    }
    
    var user = await getCurrentUser();
    if (!user) {
      wwLog.warn('⚠️ Giriş yapılmamış, ana sayfaya yönlendiriliyor...');
      window.location.href = '/index.html';
      return;
    }
    
    wwLog.log('👤 Kullanıcı:', user.email);
    window.SETTINGS_STATE.currentUser = user;
    
    await checkAndActivatePremium();
    
    var cb = document.getElementById('theme-toggle');
    if (cb) {
      var savedTheme = localStorage.getItem('ww_theme');
      cb.checked = savedTheme === 'light';
      
      var icon = document.getElementById('theme-icon');
      var label = document.getElementById('theme-label');
      var desc = document.getElementById('theme-desc');
      
      if (savedTheme === 'light') {
        if (icon) icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
        if (label) label.textContent = 'Açık Tema';
        if (desc) desc.textContent = 'Aydınlık ve ferah arayüz';
      } else {
        if (icon) icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
        if (label) label.textContent = 'Koyu Tema';
        if (desc) desc.textContent = 'Göz yormayan karanlık arayüz';
      }
    }
    
    initNavEvents();
    initPanelClickEvents();
    initAvatarPopup();
    initConfirmModal();
    
    var glow = document.getElementById('panel-glow');
    if (glow) glow.className = 'panel-glow profile-glow';
    
    var hash = window.location.hash.replace('#', '');
    var targetPanelId = 'panel-profile';
    
    if (hash && hash.indexOf('panel-') === 0) {
      targetPanelId = hash;
      wwLog.log('📍 URL\'den panel hedefleniyor: ' + targetPanelId);
    }
    
    var firstPanel = document.getElementById(targetPanelId);
    if (firstPanel) {
      document.querySelectorAll('.settings-panel').forEach(function(p) { p.classList.remove('active'); });
      firstPanel.classList.add('active');
      
      document.querySelectorAll('.sidebar-nav-item, .settings-tab-btn').forEach(function(el) {
        var isActive = el.dataset.panel === targetPanelId;
        if (isActive) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      });
      
      if (glow) {
        glow.className = 'panel-glow';
        var map = {
          'panel-profile': 'profile-glow',
          'panel-password': 'password-glow',
          'panel-appearance': 'appearance-glow',
          'panel-danger': 'danger-glow',
          'panel-plan': 'plan-glow',
          'panel-overtrade': 'overtrade-glow'
        };
        if (map[targetPanelId]) glow.classList.add(map[targetPanelId]);
      }
      
      var map2 = {
        'panel-profile': '/settings/panels/profile-info.html',
        'panel-plan': '/settings/panels/plan.html',
        'panel-password': '/settings/panels/password-change.html',
        'panel-appearance': '/settings/panels/appearance.html',
        'panel-overtrade': '/settings/panels/overtrade.html',
        'panel-danger': '/settings/panels/danger-area.html'
      };
      var url = map2[targetPanelId];
      if (url) {
        await loadPanelContent(targetPanelId, url);
        firstPanel.dataset.loaded = 'true';
        initPanel(targetPanelId);
      }
    }
    
    initLanguageSelector();
    initCurrencySelector();
    await updateBadge();
    
    await loadAvatar();
    await loadProfileData();
    
    wwLog.log('✅ Settings başarıyla başlatıldı! 🎉');
    
  } catch (e) {
    console.error('❌ Settings hatası:', e);
  }
});

wwLog.log('✅ settings.js GÜNCELLENDİ ve yüklendi! (çakışma temizlendi)');

// ============================================================
// ⭐ GLOBAL EXPORT (ödeme fonksiyonları payment.js'te)
// ============================================================
window.settings = {
  getMonthlyPrice: window.getMonthlyPrice,
  getYearlyPrice: window.getYearlyPrice,
  getPaymentMethods: window.getPaymentMethods,
  renderPlan: renderPlan,
  updateBadge: updateBadge,
  initLanguageSelector: initLanguageSelector,
  loadAvatar: loadAvatar,
  sanitizeHTML: sanitizeHTML,
  toggleTheme: window.toggleTheme
};