// ============================================================
// SETTINGS.JS - TAM SÜRÜM
// ⭐ Avatar cache - sadece değiştiğinde render
// ⭐ TEHLİKELİ BÖLGE AKTİF: deleteAllUserData + deactivateAccount
// ⭐ ÇAKIŞMA ÇÖZÜLDÜ: Ödeme fonksiyonları payment.js'te
// ⭐ FOWL FIX: SETTINGS_STATE.isPro null başlıyor
// ⭐ i18n: Hardcoded metinler i18n.t() çağrılarına dönüştürüldü
// ⭐ i18n FIX v5 (ASTRO SPA + TÜM init'lerde element-level guard)
// ⭐ FIX v6: checkAndActivatePro() sessionStorage kullanıyor
//           (navbar sessionStorage okuyordu, localStorage değil)
// ⭐ FIX v6: renderPlan() cancel callback'i window.updateNavbarBadge()
//           çağırıyor (badge anında güncellensin)
// ============================================================

wwLog.log('🔧 settings.js yükleniyor...');

// SPA: başka sayfaya geçilince SETTINGS_PAGE.on ile eklenen dinleyiciler kaldırılır,
// SETTINGS_PAGE.onLeave ile kaydedilenler çalışır (BaseHead.astro → wwPage).
// "Bir kez bağla" bayrakları da window yerine bu sayfa ziyaretine ait: sayfaya tekrar
// girildiğinde dinleyiciler yeniden bağlanabilsin.
var SETTINGS_PAGE = window.wwPage.current();

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

// Aktif pro: plan 'premium' VE süresi dolmamış (bitiş tarihi boş = süresiz/manuel). DB'de süresi dolan
// kullanıcının plan sütunu 'free'ye çekilmediği için yalnızca plan'a bakmak süresi dolanı pro gösteriyordu.
function isActivePro(profile) {
  if (!profile || profile.plan !== 'premium') return false;
  if (!profile.plan_expires_at) return true;
  var ms = Date.parse(profile.plan_expires_at);
  return isFinite(ms) && ms > Date.now();
}

function t(key, arg2, arg3) {
  var fallback = '';
  var params = {};

  if (typeof arg2 === 'string') {
    fallback = arg2;
    params = (typeof arg3 === 'object' && arg3 !== null) ? arg3 : {};
  } else if (typeof arg2 === 'object' && arg2 !== null) {
    params = arg2;
    fallback = typeof arg3 === 'string' ? arg3 : '';
  } else if (typeof arg3 === 'string') {
    fallback = arg3;
  }

  var text = '';
  if (window.i18n && typeof window.i18n.t === 'function') {
    try {
      text = window.i18n.t(key, params);
    } catch(e) {}
  }

  if (!text || text === key) {
    text = fallback || key;
  }

  if (typeof text === 'string' && params && typeof params === 'object') {
    for (var k in params) {
      text = text.replace(new RegExp('\\{+' + k + '\\}+', 'g'), params[k]);
    }
  }

  return (typeof text === 'string' && text !== '[object Object]') ? text : (fallback || key);
}

var THEME_FALLBACKS = {
  light_label: 'Açık Tema',
  light_desc: 'Aydınlık ve ferah arayüz',
  dark_label: 'Koyu Tema',
  dark_desc: 'Göz yormayan karanlık arayüz'
};

function themeLabel(isLight) {
  var key = isLight ? 'settings.light_theme' : 'settings.dark_theme';
  var fb = isLight ? THEME_FALLBACKS.light_label : THEME_FALLBACKS.dark_label;
  var v = t(key);
  return (v && v !== key) ? v : fb;
}

function themeDesc(isLight) {
  var key = isLight ? 'settings.light_theme_desc' : 'settings.dark_theme_desc';
  var fb = isLight ? THEME_FALLBACKS.light_desc : THEME_FALLBACKS.dark_desc;
  var v = t(key);
  return (v && v !== key) ? v : fb;
}

// ============================================================
// ⭐ TEMA DEĞİŞİMİNİ DİNLE (document-level, window guard)
// ============================================================

(function() {
  if (SETTINGS_PAGE._themeListenersBound) return;
  SETTINGS_PAGE._themeListenersBound = true;

  SETTINGS_PAGE.on(window, 'storage', function(e) {
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
      } else {
        if (icon) icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
      }
      if (label) label.textContent = themeLabel(isLight);
      if (desc) desc.textContent = themeDesc(isLight);

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

  SETTINGS_PAGE.on(document, 'themeChanged', function(e) {
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
// ⭐ TOGGLE THEME & THEME MODE CARDS
// ============================================================

window.updateThemeModeCards = function() {
  var isLight = document.body.classList.contains('light-theme');
  var darkCard = document.getElementById('theme-mode-dark');
  var lightCard = document.getElementById('theme-mode-light');
  if (darkCard) darkCard.classList.toggle('active', !isLight);
  if (lightCard) lightCard.classList.toggle('active', isLight);
  var cb = document.getElementById('theme-toggle');
  if (cb) cb.checked = isLight;
};

window.selectThemeMode = function(mode) {
  var isLight = mode === 'light';
  var cb = document.getElementById('theme-toggle');
  if (cb) {
    if (cb.checked !== isLight) {
      cb.checked = isLight;
      window.toggleTheme();
    }
  } else {
    document.body.classList.toggle('light-theme', isLight);
    localStorage.setItem('ww_theme', isLight ? 'light' : 'dark');
    try {
      window.dispatchEvent(new CustomEvent('themeChanged', {
        detail: { settings: { isLight: isLight } }
      }));
    } catch(e) {}
  }
  window.updateThemeModeCards();
};

window.toggleTheme = function() {
  var cb = document.getElementById('theme-toggle');
  if (!cb) return;

  var isLight = cb.checked;

  document.body.classList.toggle('light-theme', isLight);
  localStorage.setItem('ww_theme', isLight ? 'light' : 'dark');
  window.updateThemeModeCards();

  var icon = document.getElementById('theme-icon');
  var label = document.getElementById('theme-label');
  var desc = document.getElementById('theme-desc');

  if (isLight) {
    if (icon) icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  } else {
    if (icon) icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }
  if (label) label.textContent = themeLabel(isLight);
  if (desc) desc.textContent = themeDesc(isLight);

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
    isPro: null
  };
}

// (_langOnChangeBound artık SETTINGS_PAGE üzerinde tutuluyor)

// ============================================================
// PRO FEATURES
// ============================================================
var PRO_FEATURES = [
  { iconName: 'bar-chart-3', key: 'pro_features.dashboard' },
  { iconName: 'refresh-cw', key: 'pro_features.drag_drop' },
  { iconName: 'trending-up', key: 'pro_features.advanced_charts' },
  { iconName: 'palette', key: 'pro_features.theme_customization' },
  { iconName: 'file-text', key: 'pro_features.detailed_pdf' },
  { iconName: 'newspaper', key: 'pro_features.news' },
  { iconName: 'bell', key: 'pro_features.overtrade' },
  { iconName: 'gem', key: 'pro_features.priority_support' },
  { iconName: 'rocket', key: 'pro_features.no_ads' }
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
    toast.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:12px 24px;background:' + (type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#8b5cf6') + ';color:white;border-radius:10px;font-family:var(--font);font-size:14px;font-weight:500;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);animation:slideIn 0.3s ease;';
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
var PANEL_URLS = {
  'panel-profile': '/settings/panels/profile-info.html',
  'panel-plan': '/settings/panels/plan.html',
  'panel-password': '/settings/panels/password-change.html',
  'panel-appearance': '/settings/panels/appearance.html',
  'panel-overtrade': '/settings/panels/overtrade.html',
  'panel-advanced': '/settings/panels/advanced.html',
  'panel-danger': '/settings/panels/danger-area.html'
};

// Panel HTML'leri script çalışır çalışmaz paralel indirilir; sekmeye tıklayınca ağ beklenmez
var panelHtmlCache = {};
function fetchPanelHtml(url) {
  if (!panelHtmlCache[url]) {
    panelHtmlCache[url] = fetch(url).then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    });
    // Başarısız indirme önbellekte kalmasın, sonraki deneme yeniden çeksin
    panelHtmlCache[url].catch(function() { delete panelHtmlCache[url]; });
  }
  return panelHtmlCache[url];
}
Object.keys(PANEL_URLS).forEach(function(id) { fetchPanelHtml(PANEL_URLS[id]); });

// Aynı panel arka planda hazırlanırken tıklanırsa ikinci kez yüklenmesin
var panelMounts = {};
function mountPanel(panelId) {
  var el = document.getElementById(panelId);
  if (!el || el.dataset.loaded) return Promise.resolve(true);
  if (!panelMounts[panelId]) {
    panelMounts[panelId] = loadPanelContent(panelId, PANEL_URLS[panelId]).then(function(ok) {
      if (ok) el.dataset.loaded = 'true';
      delete panelMounts[panelId];
      return ok;
    });
  }
  return panelMounts[panelId];
}

// İlk panel açıldıktan sonra kalanlar tarayıcı boştayken görünmeden hazırlanır
// (HTML + verisi); kullanıcı sekmeye tıkladığında içerik zaten yerinde olur.
function preloadPanels() {
  var ids = Object.keys(PANEL_URLS);
  var idle = window.requestIdleCallback
    ? function(cb) { window.requestIdleCallback(cb, { timeout: 1000 }); }
    : function(cb) { setTimeout(cb, 50); };
  (function next() {
    if (!SETTINGS_PAGE.alive) return;
    var id = ids.shift();
    if (!id) return;
    var el = document.getElementById(id);
    if (!el || el.dataset.loaded) return next();
    idle(function() {
      if (!SETTINGS_PAGE.alive) return;
      mountPanel(id).then(function(ok) {
        // Bu arada tıklanıp açıldıysa initPanel'i switchPanel zaten çağırıyor
        if (ok && SETTINGS_PAGE.alive && !el.classList.contains('active')) initPanel(id);
        next();
      });
    });
  })();
}

async function loadPanelContent(panelId, url) {
  try {
    wwLog.log('📄 Panel yükleniyor: ' + panelId + ' -> ' + url);
    var html = await fetchPanelHtml(url);
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
      var fallbackMsg = t('settings.panel_load_error');
      if (fallbackMsg === 'settings.panel_load_error') fallbackMsg = 'Panel yüklenemedi. Lütfen sayfayı yenileyin.';
      panel.innerHTML = '<div class="s-card"><div class="s-card-body" style="padding:2rem;text-align:center;color:var(--muted);"><div style="font-size:2rem;margin-bottom:0.5rem;">' + getLucideIcon('alert-triangle', 32) + '</div><p>' + fallbackMsg + '</p><p style="font-size:11px;opacity:0.5;">' + sanitizeHTML(e.message) + '</p></div></div>';
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
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '#' + panelId);
    } else {
      window.location.hash = panelId;
    }
  }

  // Sekmeler arası geçişte tüm sekmeleri en üstten hizalı aç
  window.scrollTo({ top: 0, behavior: 'instant' });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  document.querySelectorAll('.settings-panel').forEach(function(p) { p.classList.remove('active'); });

  var target = document.getElementById(panelId);
  if (target) {
    target.classList.add('active');
    try { localStorage.setItem('ww_active_settings_panel', panelId); } catch(e) {}
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
      'panel-overtrade': 'overtrade-glow',
      'panel-advanced': 'overtrade-glow'
    };
    if (map[panelId]) glow.classList.add(map[panelId]);
  }

  function finishPanelSwitch() {
    initPanel(panelId);
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }

  if (!target.dataset.loaded) {
    if (PANEL_URLS[panelId]) mountPanel(panelId).then(finishPanelSwitch);
  } else {
    finishPanelSwitch();
  }
};

// ============================================================
// HASH DEĞİŞİKLİĞİNİ İZLE
// ============================================================
if (!SETTINGS_PAGE._hashChangeBound) {
  SETTINGS_PAGE._hashChangeBound = true;
  SETTINGS_PAGE.on(window, 'hashchange', function() {
    var hash = window.location.hash.replace('#', '');
    if (hash && hash.indexOf('panel-') === 0) {
      wwLog.log('📍 Hash değişti: ' + hash);
      var currentActive = document.querySelector('.settings-panel.active');
      if (!currentActive || currentActive.id !== hash) {
        window.switchPanel(hash);
      }
    }
  });
}

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
  if (panelId === 'panel-advanced') initAdvanced();
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
// ⭐ FİYAT FONKSİYONLARI
// ============================================================
window.getMonthlyPrice = function() {
  try {
    var saved = localStorage.getItem('ww_monthly_price');
    if (saved && parseFloat(saved) > 0 && parseFloat(saved) !== 9) return parseFloat(saved);
  } catch(e) {}
  return (window.WW_CONFIG && window.WW_CONFIG.DEFAULT_PRICES) ? window.WW_CONFIG.DEFAULT_PRICES.monthly : 12.00;
};

window.getYearlyPrice = function() {
  try {
    var saved = localStorage.getItem('ww_yearly_price');
    if (saved && parseFloat(saved) > 0 && parseFloat(saved) !== 79) return parseFloat(saved);
  } catch(e) {}
  return (window.WW_CONFIG && window.WW_CONFIG.DEFAULT_PRICES) ? window.WW_CONFIG.DEFAULT_PRICES.yearly : 99.00;
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
// ⭐ AVATAR FONKSİYONLARI
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
    showMsg(t('common.db_connection_error'), 'error');
    return null;
  }

  var progress = safeEl('upload-progress');
  if (progress) progress.style.display = 'flex';

  var user = window.SETTINGS_STATE.currentUser;
  if (!user) {
    showMsg(t('common.unexpected_error'), 'error');
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
// PROFİL PANEL — ELEMENT-LEVEL GUARD
// ============================================================
function initProfile() {
  wwLog.log('📋 Profil paneli başlatılıyor...');

  loadAvatar();

  var uploadBtn = safeEl('upload-avatar-btn');
  if (uploadBtn && !uploadBtn._uploadBound) {
    uploadBtn._uploadBound = true;
    uploadBtn.addEventListener('click', function() {
      var fileInput = safeEl('avatar-file');
      if (fileInput) fileInput.click();
    });
  }

  var fileInput = safeEl('avatar-file');
  if (fileInput && !fileInput._fileBound) {
    fileInput._fileBound = true;
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
  if (removeBtn && !removeBtn._removeBound) {
    removeBtn._removeBound = true;
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
    var lang = (window.i18n && typeof window.i18n.getCurrentLanguage === 'function') ? window.i18n.getCurrentLanguage() : 'tr';
    var locale = lang === 'tr' ? 'tr-TR' : (lang === 'de' ? 'de-DE' : 'en-US');
    profileCreated.textContent = new Date(user.created_at).toLocaleDateString(locale, {
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
    if (span) {
      span.style.whiteSpace = 'pre-line';
      var cleanWarning = String(warning).replace(/\\n/g, '\n');
      span.textContent = cleanWarning;
    }
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
    if (!sb) throw new Error(t('common.db_connection_error'));

    var result = await sb.from('user_profiles').select('plan, plan_expires_at').eq('id', user.id).single();
    var data = result.data;

    var isPro = isActivePro(data);

    // Fiyatlari DB'den canli cek
    try {
      var sbClient = window.sb || window.supabase;
      if (sbClient) {
        var { data: dbSettings } = await sbClient.from('system_settings').select('value').eq('key', 'payment_settings').single();
        if (dbSettings && dbSettings.value) {
          var mVal = parseFloat(dbSettings.value.monthly_price_usd);
          var yVal = parseFloat(dbSettings.value.yearly_price_usd);
          if (!isNaN(mVal) && mVal > 0) {
            localStorage.setItem('ww_monthly_price', mVal.toString());
            if (typeof window.setMonthlyPrice === 'function') window.setMonthlyPrice(mVal);
          }
          if (!isNaN(yVal) && yVal > 0) {
            localStorage.setItem('ww_yearly_price', yVal.toString());
            if (typeof window.setYearlyPrice === 'function') window.setYearlyPrice(yVal);
          }
        } else {
          var { data: dbPrices } = await sbClient.rpc('get_prices');
          if (dbPrices) {
            var mVal = parseFloat(dbPrices.monthly);
            var yVal = parseFloat(dbPrices.yearly);
            if (!isNaN(mVal) && mVal > 0) {
              localStorage.setItem('ww_monthly_price', mVal.toString());
              if (typeof window.setMonthlyPrice === 'function') window.setMonthlyPrice(mVal);
            }
            if (!isNaN(yVal) && yVal > 0) {
              localStorage.setItem('ww_yearly_price', yVal.toString());
              if (typeof window.setYearlyPrice === 'function') window.setYearlyPrice(yVal);
            }
          }
        }
      }
    } catch(err) { console.error('Plan prices fetch err:', err); }

    var expiresAt = data && data.plan_expires_at ? new Date(data.plan_expires_at) : null;
    var lang = (window.i18n && typeof window.i18n.getCurrentLanguage === 'function') ? window.i18n.getCurrentLanguage() : 'tr';
    var locale = lang === 'tr' ? 'tr-TR' : (lang === 'de' ? 'de-DE' : 'en-US');

    var tplId = isPro ? 'tpl-plan-pro' : 'tpl-plan-free';
    var tpl = document.getElementById(tplId);
    if (!tpl) {
      container.innerHTML = '<div style="padding:1rem;color:var(--red);">Template not found: ' + tplId + '</div>';
      return;
    }

    var clone = tpl.content.cloneNode(true);

    if (isPro) {
      // ⭐ PRO AKTİF GÖRÜNÜMÜ
      var daysLeft = expiresAt ? Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24)) : 0;
      var daysEl = clone.querySelector('[data-bind="days-left"]');
      if (daysEl) daysEl.textContent = Math.max(0, daysLeft) + ' ' + t('settings.plan_days', {}, 'gün');

      var expEl = clone.querySelector('[data-bind="expiry-date"]');
      if (expEl && expiresAt) {
        expEl.textContent = expiresAt.toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });
      }

      var progEl = clone.querySelector('[data-bind="progress"]');
      if (progEl) {
        var pct = Math.max(0, Math.min(100, ((30 - Math.min(30, daysLeft)) / 30) * 100));
        progEl.style.width = pct + '%';
      }

      var perksGrid = clone.querySelector('#plan-perks-grid');
      if (perksGrid) {
        PRO_FEATURES.forEach(function(f) {
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

      container.innerHTML = '';
      container.appendChild(clone);

      // İptal Butonu
      var cancelBtn = container.querySelector('#cancel-pro-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', async function(e) {
          e.preventDefault();
          e.stopPropagation();
          if (window.cancelPro) {
            var success = await window.cancelPro();
            if (success) {
              showMsg(t('settings.cancel_subscription_success', {}, 'Abonelik iptal edildi.'), 'success');
              await renderPlan();
              if (typeof window.updateNavbarBadge === 'function') await window.updateNavbarBadge();
              if (typeof window.updateBadge === 'function') await window.updateBadge();
            }
          }
        });
      }

      // Uzat / Yenile Butonu & Açılır Sihirbaz
      var extendBtn = container.querySelector('#extend-pro-btn');
      var extendWrapper = container.querySelector('#extend-wizard-wrapper');
      var closeExtendBtn = container.querySelector('#btn-close-extend-wizard');
      var extendContainer = container.querySelector('#extend-wizard-container');

      if (extendBtn && extendWrapper) {
        extendBtn.addEventListener('click', function(e) {
          e.preventDefault();
          if (extendWrapper.style.display === 'none' || !extendWrapper.style.display) {
            extendWrapper.style.display = 'block';
            if (extendContainer && !extendContainer.hasChildNodes()) {
              var freeTpl = document.getElementById('tpl-plan-free');
              if (freeTpl) {
                var freeClone = freeTpl.content.cloneNode(true);
                extendContainer.appendChild(freeClone);
                setupPlanWizard(extendContainer.querySelector('#plan-wizard'), true);
                if (window.lucide) window.lucide.createIcons();
                if (window.i18n && typeof window.i18n.apply === 'function') window.i18n.apply();
              }
            }
            extendWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } else {
            extendWrapper.style.display = 'none';
          }
        });
      }

      if (closeExtendBtn && extendWrapper) {
        closeExtendBtn.addEventListener('click', function(e) {
          e.preventDefault();
          extendWrapper.style.display = 'none';
        });
      }

      if (expiresAt) startTimer(expiresAt);

    } else {
      // ⭐ FREE KULLANICI — ADIM ADIM ÖDEME SİHİRBAZI
      container.innerHTML = '';
      container.appendChild(clone);

      var wizardEl = container.querySelector('#plan-wizard');
      if (wizardEl) {
        setupPlanWizard(wizardEl, false);
      }
    }

    // Lucide ikonları & i18n
    if (window.lucide) window.lucide.createIcons();
    if (window.i18n && typeof window.i18n.apply === 'function') {
      try { window.i18n.apply(); } catch(e) {}
    }

  } catch (e) {
    console.error('Plan hatası:', e);
    container.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--muted);">' + sanitizeHTML(e.message) + '</div>';
  }
}

// ============================================================
// ⭐ ADIM ADIM ÖDEME SİHİRBAZI MANTIĞI (CHECKOUT WIZARD)
// ============================================================
// ⭐ ADIM ADIM ÖDEME SİHİRBAZI MANTIĞI (CHECKOUT WIZARD)
// ============================================================
function setupPlanWizard(wizardRoot, isExtending) {
  if (!wizardRoot) return;

  var currentPaymentData = null;
  var directPayTimerInterval = null;
  var directPayPollInterval = null;

  var STORAGE_KEY = isExtending ? 'ww_plan_extend_state' : 'ww_plan_checkout_state';

  function saveWizardState() {
    try {
      var state = {
        step: currentStep,
        period: selectedPeriod,
        payMethod: selectedPayMethod,
        code: appliedReferralCode,
        discount: appliedDiscount,
        updatedAt: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch(e) {}
  }

  function loadWizardState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      // 7 günden eskiyse sıfırla
      if (Date.now() - (parsed.updatedAt || 0) > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch(e) {
      return null;
    }
  }

  var DIRECT_PAY_STORAGE_KEY = isExtending ? 'ww_active_crypto_payment_ext' : 'ww_active_crypto_payment';

  function saveActiveDirectPayment(data) {
    try {
      if (!data || !data.payAddress) {
        localStorage.removeItem(DIRECT_PAY_STORAGE_KEY);
        return;
      }
      localStorage.setItem(DIRECT_PAY_STORAGE_KEY, JSON.stringify(data));
    } catch(e) {}
  }

  function clearActiveDirectPayment() {
    try {
      localStorage.removeItem(DIRECT_PAY_STORAGE_KEY);
    } catch(e) {}
  }

  // --- Ödeme onayı: "plan === pro" TEK BAŞINA yeterli değildir ---
  // Süre uzatan (zaten pro) kullanıcıda ilk yoklamada "ödeme onaylandı" çıkıyor, QR/adres siliniyor ve
  // kullanıcı ödeme yapmadan panele yönlendiriliyordu. Ödeme başlatılırken pro bitiş tarihi
  // (baselineExpiryMs) kaydedilir; onay ancak bitiş tarihi bunun ÜSTÜNE çıkınca verilir.
  function planActiveExpiryMs(prof) {
    if (!prof || prof.plan !== 'premium' || !prof.plan_expires_at) return 0;
    var ms = Date.parse(prof.plan_expires_at);
    return (isFinite(ms) && ms > Date.now()) ? ms : 0;
  }

  function isPaymentConfirmed(prof) {
    var cur = planActiveExpiryMs(prof);
    var base = (currentPaymentData && typeof currentPaymentData.baselineExpiryMs === 'number')
      ? currentPaymentData.baselineExpiryMs : null;
    if (base === null) {
      // Referans kaydı olmayan (eski) ödeme: ilk okumayı referans al, bundan sonraki artışı onay say
      if (currentPaymentData) {
        currentPaymentData.baselineExpiryMs = cur;
        saveActiveDirectPayment(currentPaymentData);
      }
      return false;
    }
    return cur > 0 && cur > base;
  }

  function getActiveDirectPayment() {
    try {
      var raw = localStorage.getItem(DIRECT_PAY_STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.payAddress || !parsed.expiresAt) {
        clearActiveDirectPayment();
        return null;
      }
      if (Date.now() >= parsed.expiresAt) {
        clearActiveDirectPayment();
        return null;
      }
      return parsed;
    } catch(e) {
      return null;
    }
  }

  var savedState = loadWizardState();
  var minStep = isExtending ? 2 : 1;
  var currentStep = minStep;
  var selectedPeriod = 'yearly';
  var selectedPayMethod = 'LTC';
  var appliedReferralCode = null;
  var appliedDiscount = 0;

  if (savedState) {
    if (savedState.step && savedState.step >= minStep && savedState.step <= 4) {
      currentStep = savedState.step;
    }
    if (savedState.period === 'monthly' || savedState.period === 'yearly' || savedState.period === 'test') {
      selectedPeriod = savedState.period;
    }
    if (savedState.payMethod === 'BTC' || savedState.payMethod === 'LTC') {
      selectedPayMethod = savedState.payMethod;
    } else {
      selectedPayMethod = 'LTC';
    }
    if (savedState.code && typeof savedState.discount === 'number' && savedState.discount > 0) {
      appliedReferralCode = savedState.code;
      appliedDiscount = savedState.discount;
    }
  }

  // 🔒 Aktif ve süresi bitmemiş bir kripto ödeme oturumu varsa doğrudan Adım 5'e geç
  var activePay = getActiveDirectPayment();
  if (activePay) {
    currentPaymentData = activePay;
    currentStep = 5;
    if (activePay.period === 'monthly' || activePay.period === 'yearly' || activePay.period === 'test') {
      selectedPeriod = activePay.period;
    }
    if (activePay.payCurrency) {
      selectedPayMethod = activePay.payCurrency.toUpperCase();
    }
  }

  // 🔒 Yıllık olmayan abonelikte BTC ödeme yöntemi kullanılamaz - LTC'ye normalize et
  if (selectedPeriod !== 'yearly' && selectedPayMethod === 'BTC') {
    selectedPayMethod = 'LTC';
  }

  function getPlanPrices() {
    var m = (window.getMonthlyPrice ? window.getMonthlyPrice() : 12) || 12;
    var y = (window.getYearlyPrice ? window.getYearlyPrice() : 99) || 99;
    return {
      monthly: { base: m, monthlyRate: m.toFixed(2), days: 30, name: t('settings.plan_period_1m', {}, '1 Aylık') },
      yearly: { base: y, monthlyRate: (y / 12).toFixed(2), days: 365, name: t('settings.plan_period_1y', {}, '1 Yıllık') },
      // Geliştirici test planı: sunucuda sabit 1 USD / 1 gün (yalnızca test modunda satın alınabilir)
      test: { base: 1, monthlyRate: '1.00', days: 1, name: t('settings.plan_test_title', {}, '1 Günlük Test') }
    };
  }

  function updatePeriodCardsUI() {
    var prices = getPlanPrices();
    var periods = ['monthly', 'yearly'];
    periods.forEach(function(p) {
      var card = wizardRoot.querySelector('.duration-option-card[data-period="' + p + '"]');
      if (!card) return;
      var rateEl = card.querySelector('#period-rate-' + p);
      var totalEl = card.querySelector('#period-total-' + p);
      if (rateEl) rateEl.textContent = prices[p].monthlyRate;
      if (totalEl) totalEl.textContent = '$' + prices[p].base.toFixed(2);
    });

    var step1MonthlyEl = wizardRoot.querySelector('#step1-monthly-val');
    if (step1MonthlyEl) step1MonthlyEl.textContent = prices.monthly.base.toFixed(0);
    var step1YearlyHint = wizardRoot.querySelector('#step1-yearly-hint');
    if (step1YearlyHint) {
      step1YearlyHint.textContent = t('settings.plan_or_yearly_price', { yearly: prices.yearly.base.toFixed(0), monthlyRate: prices.yearly.monthlyRate }, 'veya Yıllık $' + prices.yearly.base.toFixed(0) + ' (aylık $' + prices.yearly.monthlyRate + ')');
    }
  }

  function closeQrModal() {
    var qrModal = wizardRoot.querySelector('#qr-zoom-modal');
    if (qrModal) {
      qrModal.style.display = 'none';
      document.body.style.overflow = '';
    }
  }

  function stopDirectPaymentWatch() {
    if (directPayTimerInterval) { clearInterval(directPayTimerInterval); directPayTimerInterval = null; }
    if (directPayPollInterval) { clearInterval(directPayPollInterval); directPayPollInterval = null; }
    closeQrModal();
  }

  function goToStep(step, isInitial) {
    currentStep = step;
    if (step <= 4) {
      saveWizardState();
      stopDirectPaymentWatch();
    }

    var stepNode5 = wizardRoot.querySelector('#step-node-5');
    var stepConn4 = wizardRoot.querySelector('#step-conn-4');

    if (step === 5) {
      if (stepNode5) stepNode5.style.display = 'flex';
      if (stepConn4) stepConn4.style.display = 'block';
    } else {
      if (stepNode5) stepNode5.style.display = 'none';
      if (stepConn4) stepConn4.style.display = 'none';
    }

    var panels = wizardRoot.querySelectorAll('.wizard-step-panel');
    panels.forEach(function(panel) {
      panel.classList.remove('active');
      panel.style.display = 'none';
    });
    var targetPanel = wizardRoot.querySelector('#wizard-step-' + step);
    if (targetPanel) {
      targetPanel.classList.add('active');
      targetPanel.style.display = 'block';
    }

    var stepNodes = wizardRoot.querySelectorAll('.step-node');
    stepNodes.forEach(function(node) {
      var s = parseInt(node.getAttribute('data-step'), 10);
      node.classList.remove('active', 'completed');
      if (s === step) {
        node.classList.add('active');
      } else if (s < step) {
        node.classList.add('completed');
      }
    });

    for (var c = 1; c <= 4; c++) {
      var conn = wizardRoot.querySelector('#step-conn-' + c);
      if (conn) {
        if (c < step) {
          conn.classList.add('active');
        } else {
          conn.classList.remove('active');
        }
      }
    }

    if (step === 4) {
      renderSummary();
    } else if (step === 5) {
      renderDirectPaymentUI();
    }

    if (!isInitial) {
      try {
        wizardRoot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch(e) {}
    }
  }

  // --- ADIM STEPPER TIKLAMA (ÖNCEKİ ADIMLARA DÖNÜŞ) ---
  var stepNodes = wizardRoot.querySelectorAll('.step-node');
  stepNodes.forEach(function(node) {
    node.addEventListener('click', function() {
      var targetS = parseInt(this.getAttribute('data-step'), 10);
      if (targetS && targetS < currentStep && targetS >= minStep) {
        if (currentStep === 5) {
          clearActiveDirectPayment();
          currentPaymentData = null;
        }
        goToStep(targetS);
      }
    });
  });

  // --- ADIM 1 ETKİNLİKLERİ ---
  var btnSelectPro1 = wizardRoot.querySelector('#btn-select-pro-step1');
  if (btnSelectPro1) {
    btnSelectPro1.addEventListener('click', function(e) {
      e.preventDefault();
      goToStep(2);
    });
  }

  var proTierCard1 = wizardRoot.querySelector('.plan-tier-card.pro-tier');
  if (proTierCard1) {
    proTierCard1.addEventListener('click', function(e) {
      if (e.target.closest('#btn-select-pro-step1')) return;
      goToStep(2);
    });
  }

  // --- ADIM 2 ETKİNLİKLERİ (SÜRE / DÖNEM) ---
  var durationCards = wizardRoot.querySelectorAll('.duration-option-card');
  durationCards.forEach(function(card) {
    var p = card.getAttribute('data-period');
    if (p === selectedPeriod) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
    card.addEventListener('click', function() {
      durationCards.forEach(function(c) { c.classList.remove('selected'); });
      this.classList.add('selected');
      selectedPeriod = this.getAttribute('data-period') || 'yearly';
      // 🔒 Yıllık seçilmediyse BTC geçersiz olacağı için LTC'ye geç
      if (selectedPeriod !== 'yearly' && selectedPayMethod === 'BTC') {
        selectedPayMethod = 'LTC';
      }
      saveWizardState();
    });
  });

  var btnBackTo1 = wizardRoot.querySelector('#btn-back-to-step1');
  if (btnBackTo1) {
    btnBackTo1.addEventListener('click', function(e) {
      e.preventDefault();
      goToStep(1);
    });
  }

  var btnTo3 = wizardRoot.querySelector('#btn-to-step3');
  if (btnTo3) {
    btnTo3.addEventListener('click', function(e) {
      e.preventDefault();
      goToStep(3);
    });
  }

  // --- ADIM 3 ETKİNLİKLERİ (İNDİRİM KUPONU / REFERANS) ---
  var couponInput = wizardRoot.querySelector('#wizard-coupon-input');
  var btnApplyCoupon = wizardRoot.querySelector('#btn-wizard-apply-coupon');
  var couponStatus = wizardRoot.querySelector('#wizard-coupon-status');
  var btnSkipCoupon = wizardRoot.querySelector('#btn-skip-coupon');
  var btnTo4 = wizardRoot.querySelector('#btn-to-step4');
  var btnBackTo2 = wizardRoot.querySelector('#btn-back-to-step2');

  // Kayıtlı kuponu geri yükle
  if (appliedReferralCode && appliedDiscount > 0) {
    if (couponInput) couponInput.value = appliedReferralCode;
    if (couponStatus) {
      couponStatus.style.display = 'block';
      couponStatus.className = 'coupon-status-box success';
      var discountMsg = t('settings.plan_referral_discount_applied', { discount: appliedDiscount }, '%' + appliedDiscount + ' indirim başarıyla uygulandı!')
        .replace(/\{+discount\}+/gi, appliedDiscount);
      couponStatus.innerHTML = '<strong>' + sanitizeHTML(appliedReferralCode) + '</strong> ' + discountMsg;
    }
    if (btnTo4) btnTo4.style.display = 'inline-flex';
    if (btnSkipCoupon) btnSkipCoupon.textContent = t('settings.plan_continue_with_discount', 'İndirimle Devam Et →');
  }

  if (btnBackTo2) {
    btnBackTo2.addEventListener('click', function(e) {
      e.preventDefault();
      goToStep(2);
    });
  }

  if (btnSkipCoupon) {
    btnSkipCoupon.addEventListener('click', function(e) {
      e.preventDefault();
      goToStep(4);
    });
  }

  if (btnTo4) {
    btnTo4.addEventListener('click', function(e) {
      e.preventDefault();
      goToStep(4);
    });
  }

  if (btnApplyCoupon && couponInput) {
    btnApplyCoupon.addEventListener('click', async function(e) {
      e.preventDefault();
      var code = (couponInput.value || '').trim().toUpperCase();
      if (!code) {
        if (couponStatus) {
          couponStatus.style.display = 'block';
          couponStatus.className = 'coupon-status-box error';
          couponStatus.textContent = t('settings.plan_referral_enter_code', {}, 'Lütfen bir kupon kodu girin.');
        }
        return;
      }

      btnApplyCoupon.disabled = true;
      btnApplyCoupon.textContent = '...';

      try {
        var sb = window.sb || window.supabase;
        if (!sb) throw new Error(t('common.db_connection_error', {}, 'Veritabanı bağlantı hatası'));

        var user = window.SETTINGS_STATE.currentUser;
        if (!user && typeof getCurrentUser === 'function') {
          try { user = await getCurrentUser(); } catch(e) {}
        }
        var userId = user ? user.id : null;

        // Çakışmayı önlemek için p_user_id ile çağırılır (public.validate_referral_code(text, uuid))
        var rpcRes = await sb.rpc('validate_referral_code', { 
          p_code: code,
          p_user_id: userId
        });

        if (rpcRes && rpcRes.error && rpcRes.error.message && rpcRes.error.message.includes('p_user_id')) {
          rpcRes = await sb.rpc('validate_referral_code', { p_code: code });
        }

        var data = rpcRes ? rpcRes.data : null;
        var error = rpcRes ? rpcRes.error : null;
        if (error) throw error;

        if (data && data.valid) {
          appliedReferralCode = code;
          appliedDiscount = Number(data.discount_percent) || 0;
          saveWizardState();
          if (couponStatus) {
            couponStatus.style.display = 'block';
            couponStatus.className = 'coupon-status-box success';
            var discountMsg = t('settings.plan_referral_discount_applied', { discount: appliedDiscount }, '%' + appliedDiscount + ' indirim başarıyla uygulandı!')
              .replace(/\{+discount\}+/gi, appliedDiscount);
            couponStatus.innerHTML = '<strong>' + sanitizeHTML(code) + '</strong> ' + discountMsg;
          }
          if (btnTo4) btnTo4.style.display = 'inline-flex';
          if (btnSkipCoupon) btnSkipCoupon.textContent = t('settings.plan_continue_with_discount', 'İndirimle Devam Et →');
        } else {
          var errMsg = t('settings.plan_referral_invalid', 'Geçersiz kupon veya promosyon kodu.');
          if (data && data.error) {
            if (data.error === 'expired_code') errMsg = t('settings.plan_referral_expired', 'Bu kodun süresi dolmuş.');
            else if (data.error === 'usage_limit_reached') errMsg = t('settings.plan_referral_limit', 'Bu kodun kullanım limiti dolmuş.');
            else if (data.error === 'inactive_code') errMsg = t('settings.plan_referral_inactive', 'Bu kod aktif değil.');
            else if (data.error === 'self_referral_not_allowed') errMsg = t('settings.plan_referral_self', 'Kendi referans kodunuzu kullanamazsınız.');
          }
          throw new Error(errMsg);
        }
      } catch (err) {
        appliedReferralCode = null;
        appliedDiscount = 0;
        saveWizardState();
        var errStr = (err && err.message) ? err.message : (typeof err === 'string' ? err : '');
        if (!errStr || errStr === '[object Object]') {
          errStr = t('settings.plan_referral_error', 'Kod doğrulanamadı.');
        }
        if (couponStatus) {
          couponStatus.style.display = 'block';
          couponStatus.className = 'coupon-status-box error';
          couponStatus.textContent = errStr;
        }
        if (btnTo4) btnTo4.style.display = 'none';
        if (btnSkipCoupon) btnSkipCoupon.textContent = t('settings.plan_skip_coupon', 'Kuponum Yok, Bu Adımı Atla →');
      } finally {
        btnApplyCoupon.disabled = false;
        btnApplyCoupon.textContent = t('settings.plan_apply_coupon', 'Uygula');
      }
    });

    couponInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        btnApplyCoupon.click();
      }
    });
  }

  // --- ADIM 4 ETKİNLİKLERİ & ÖZET (FATURA VE ÖDEME) ---
  function updateCryptoMethodsUI() {
    var btcChip = wizardRoot.querySelector('.crypto-chip[data-method="BTC"]');
    var ltcChip = wizardRoot.querySelector('.crypto-chip[data-method="LTC"]');
    var btcNotice = wizardRoot.querySelector('#crypto-btc-notice');
    var isYearly = (selectedPeriod === 'yearly');

    // 🔒 1. BTC yalnızca Yıllık abonelikte gösterilir, diğer dönemlerde gizlenir
    if (btcChip) {
      if (!isYearly) {
        btcChip.style.display = 'none';
        if (selectedPayMethod === 'BTC') {
          selectedPayMethod = 'LTC';
          saveWizardState();
        }
      } else {
        btcChip.style.display = 'flex';
      }
    }

    // 🔒 2. İndirim kuponu rozeti yalnızca LTC üzerinde gösterilir
    if (ltcChip) {
      var existingTag = ltcChip.querySelector('.chip-discount-tag');
      if (appliedDiscount > 0) {
        var discountTagText = t('settings.plan_discount_off', { pct: appliedDiscount }, '%' + appliedDiscount + ' indirim');
        if (!existingTag) {
          var tag = document.createElement('span');
          tag.className = 'chip-discount-tag';
          tag.textContent = discountTagText;
          ltcChip.appendChild(tag);
        } else {
          existingTag.textContent = discountTagText;
        }
      } else if (existingTag) {
        existingTag.remove();
      }
    }

    // 🔒 3. Chip active durumlarını güncelle
    var chips = wizardRoot.querySelectorAll('.crypto-chip');
    chips.forEach(function(chip) {
      var m = chip.getAttribute('data-method');
      if (m === selectedPayMethod) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });

    // 🔒 4. BTC seçildiğinde ve indirim kuponu varsa "İndirim sadece LTC'de geçerli" uyarısı göster
    if (btcNotice) {
      if (selectedPayMethod === 'BTC' && appliedDiscount > 0) {
        btcNotice.style.display = 'flex';
      } else {
        btcNotice.style.display = 'none';
      }
    }
  }

  function renderSummary() {
    updateCryptoMethodsUI();

    var prices = getPlanPrices();
    var planInfo = prices[selectedPeriod] || prices.yearly;
    var basePrice = planInfo.base;
    var isLtc = (selectedPayMethod === 'LTC') && selectedPeriod !== 'test';   // test planında indirim yok

    // 🔒 İndirim YALNIZCA LTC ödemelerinde uygulanır! BTC veya diğerlerinde indirim 0'dır
    var discountAmount = (isLtc && appliedDiscount > 0) ? (basePrice * (appliedDiscount / 100)) : 0;
    var netTotal = Math.max(0, basePrice - discountAmount);
    // 2 ondalık basamağa yuvarla
    netTotal = Number(netTotal.toFixed(2));

    var periodNameEl = wizardRoot.querySelector('#summary-period-name');
    var baseAmountEl = wizardRoot.querySelector('#summary-base-amount');
    var discountRow = wizardRoot.querySelector('#summary-discount-row');
    var discountAmountEl = wizardRoot.querySelector('#summary-discount-amount');
    var netTotalEl = wizardRoot.querySelector('#summary-net-total');
    var btnPayLabel = wizardRoot.querySelector('#btn-pay-label');

    if (periodNameEl) periodNameEl.textContent = planInfo.name + ' (' + planInfo.days + ' ' + t('settings.plan_days', {}, 'Gün') + ')';
    if (baseAmountEl) baseAmountEl.textContent = '$' + basePrice.toFixed(2);

    if (appliedDiscount > 0 && isLtc) {
      if (discountRow) discountRow.style.display = 'flex';
      if (discountAmountEl) discountAmountEl.textContent = '-$' + discountAmount.toFixed(2) + ' (-' + appliedDiscount + '%)';
    } else {
      if (discountRow) discountRow.style.display = 'none';
    }

    if (netTotalEl) netTotalEl.textContent = netTotal.toFixed(2);

    if (btnPayLabel) {
      btnPayLabel.textContent = t('settings.plan_pay_submit_simple', {}, 'Ödeme Yap');
    }
  }

  var cryptoChips = wizardRoot.querySelectorAll('.crypto-chip');
  cryptoChips.forEach(function(chip) {
    chip.addEventListener('click', function() {
      var m = this.getAttribute('data-method') || 'LTC';
      // Aylık planda BTC seçilemez
      if (m === 'BTC' && selectedPeriod === 'monthly') {
        return;
      }
      selectedPayMethod = m;
      saveWizardState();
      if (window.selectPayMethod) window.selectPayMethod(selectedPayMethod);
      renderSummary(); // Fiyatı, rozetleri ve BTC uyarısını ANINDA güncelle!
    });
  });

  var btnBackTo3 = wizardRoot.querySelector('#btn-back-to-step3');
  if (btnBackTo3) {
    btnBackTo3.addEventListener('click', function(e) {
      e.preventDefault();
      goToStep(3);
    });
  }

  // Ödeme Tamamlama Butonu
  var btnSubmitPayment = wizardRoot.querySelector('#btn-submit-payment');
  if (btnSubmitPayment) {
    btnSubmitPayment.addEventListener('click', async function(e) {
      e.preventDefault();
      var prices = getPlanPrices();
      var planInfo = prices[selectedPeriod] || prices.yearly;
      var basePrice = planInfo.base;
      var isLtc = (selectedPayMethod === 'LTC') && selectedPeriod !== 'test';   // test planında indirim/kupon yok

      // En son ekranda yazan net tutar
      var discountAmount = (isLtc && appliedDiscount > 0) ? (basePrice * (appliedDiscount / 100)) : 0;
      var netTotal = Number(Math.max(0, basePrice - discountAmount).toFixed(2));

      // Kupon kodu SADECE LTC ödemesinde geçerli ve backend'e gönderilir
      var codeToSend = (isLtc && appliedDiscount > 0) ? appliedReferralCode : null;

      btnSubmitPayment.disabled = true;
      var origContent = btnSubmitPayment.innerHTML;
      btnSubmitPayment.innerHTML = '<span>' + t('settings.plan_preparing_payment', {}, 'Ödeme Sayfası Hazırlanıyor...') + '</span>';

      try {
        if (window.upgradeToPro) {
          // Ödeme onayı için referans: ödeme başlamadan önceki pro bitiş zamanı (aktif pro yoksa 0)
          var baselineExpiryMs = 0;
          try {
            var sbBase = window.sb || window.supabase;
            var userBase = window.SETTINGS_STATE.currentUser;
            if (!userBase && typeof getCurrentUser === 'function') userBase = await getCurrentUser();
            if (sbBase && userBase) {
              var { data: profBase } = await sbBase.from('user_profiles').select('plan, plan_expires_at').eq('id', userBase.id).single();
              baselineExpiryMs = planActiveExpiryMs(profBase);
            }
          } catch (baseErr) {}

          var result = await window.upgradeToPro(selectedPeriod, netTotal, 'USD', selectedPayMethod, codeToSend);
          if (result && result.payAddress) {
            // ⭐ DOĞRUDAN ÖDEME (Direct Payment): Site içi ekrana geç!
            result.baselineExpiryMs = baselineExpiryMs;
            result.expiresAt = Date.now() + (20 * 60 * 1000);
            result.period = selectedPeriod;
            result.payCurrency = selectedPayMethod;
            currentPaymentData = result;
            saveActiveDirectPayment(result);
            goToStep(5);
            btnSubmitPayment.disabled = false;
            btnSubmitPayment.innerHTML = origContent;
          }
        } else {
          showMsg(t('payment.link_failed', {}, 'Ödeme servisi başlatılamadı.'), 'error');
          btnSubmitPayment.disabled = false;
          btnSubmitPayment.innerHTML = origContent;
        }
      } catch (err) {
        showMsg(err.message, 'error');
        btnSubmitPayment.disabled = false;
        btnSubmitPayment.innerHTML = origContent;
      }
    });
  }

  // ============================================================
  // ⭐ ADIM 5: DOĞRUDAN SİTE İÇİ ÖDEME MANTIĞI
  // ============================================================
  function renderDirectPaymentUI() {
    if (!currentPaymentData) return;

    var qrImg = wizardRoot.querySelector('#direct-pay-qr-img');
    var amountVal = wizardRoot.querySelector('#direct-pay-amount-val');
    var amountFiat = wizardRoot.querySelector('#direct-pay-amount-fiat');
    var currBadge = wizardRoot.querySelector('#direct-pay-curr-badge');
    var addressVal = wizardRoot.querySelector('#direct-pay-address-val');
    var networkTag = wizardRoot.querySelector('#direct-pay-network-tag');
    var timerEl = wizardRoot.querySelector('#direct-pay-countdown');
    var successBox = wizardRoot.querySelector('#direct-pay-success-box');
    var directCard = wizardRoot.querySelector('.direct-pay-card');

    if (successBox) successBox.style.display = 'none';
    if (directCard) directCard.style.display = 'grid';

    var payCur = (currentPaymentData.payCurrency || 'LTC').toUpperCase();
    var payAddr = currentPaymentData.payAddress || '';
    var payAmt = currentPaymentData.payAmount || '';
    var fiatAmt = Number(currentPaymentData.amount || 0).toFixed(2);

    if (amountVal) amountVal.textContent = payAmt;
    if (amountFiat) amountFiat.textContent = '($' + fiatAmt + ' USD)';
    if (currBadge) currBadge.textContent = payCur;
    if (addressVal) addressVal.textContent = payAddr;
    if (networkTag) {
      var netText = (payCur === 'LTC' ? t('settings.plan_network_ltc', {}, 'Litecoin (LTC) Ağı') : (payCur === 'BTC' ? t('settings.plan_network_btc', {}, 'Bitcoin Ağı') : payCur + ' Network'));
      networkTag.textContent = netText;
    }

    // QR Kod URI (Kripto cüzdanları için standart URI)
    var uri = payAddr;
    if (payCur === 'LTC') {
      uri = 'litecoin:' + payAddr + (payAmt ? '?amount=' + payAmt : '');
    } else if (payCur === 'BTC') {
      uri = 'bitcoin:' + payAddr + (payAmt ? '?amount=' + payAmt : '');
    }
    if (qrImg) {
      qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=' + encodeURIComponent(uri);
      qrImg.onerror = function() {
        this.onerror = null;
        this.src = 'https://chart.googleapis.com/chart?chs=220x220&cht=qr&chl=' + encodeURIComponent(uri);
      };
    }
    var qrBigImg = wizardRoot.querySelector('#qr-zoom-big-img');
    if (qrBigImg) {
      qrBigImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=12&data=' + encodeURIComponent(uri);
      qrBigImg.onerror = function() {
        this.onerror = null;
        this.src = 'https://chart.googleapis.com/chart?chs=400x400&cht=qr&chl=' + encodeURIComponent(uri);
      };
    }

    // 20 Dakika Geri Sayım (Bitiş zamanına göre gerçek zamanlı hesap)
    if (!currentPaymentData.expiresAt) {
      currentPaymentData.expiresAt = Date.now() + (20 * 60 * 1000);
    }
    currentPaymentData.period = selectedPeriod;
    currentPaymentData.payCurrency = payCur;
    saveActiveDirectPayment(currentPaymentData);

    if (directPayTimerInterval) clearInterval(directPayTimerInterval);

    function updateCountdown() {
      if (!document.body.contains(wizardRoot)) {
        clearInterval(directPayTimerInterval);
        directPayTimerInterval = null;
        return;
      }
      var rem = Math.max(0, Math.floor((currentPaymentData.expiresAt - Date.now()) / 1000));
      if (rem <= 0) {
        clearInterval(directPayTimerInterval);
        directPayTimerInterval = null;
        clearActiveDirectPayment();
        if (timerEl) timerEl.textContent = '00:00 ' + t('settings.plan_expired_time', {}, '(Süre Doldu)');
        return;
      }
      var m = Math.floor(rem / 60);
      var s = rem % 60;
      if (timerEl) {
        timerEl.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      }
    }

    updateCountdown();
    directPayTimerInterval = setInterval(updateCountdown, 1000);

    // Canlı Durum Polling
    startDirectPaymentWatch();
  }

  function startDirectPaymentWatch() {
    if (directPayPollInterval) clearInterval(directPayPollInterval);

    var attempts = 0;
    directPayPollInterval = setInterval(async function() {
      if (!document.body.contains(wizardRoot)) {
        clearInterval(directPayPollInterval);
        directPayPollInterval = null;
        return;
      }
      attempts++;
      if (attempts > 240) {
        clearInterval(directPayPollInterval);
        directPayPollInterval = null;
        return;
      }

      try {
        var sb = window.sb || window.supabase;
        if (!sb) return;

        var user = window.SETTINGS_STATE.currentUser;
        if (!user && typeof getCurrentUser === 'function') {
          try { user = await getCurrentUser(); } catch(e) {}
        }
        if (!user) return;

        var { data: profile } = await sb
          .from('user_profiles')
          .select('plan, plan_expires_at')
          .eq('id', user.id)
          .single();

        if (isPaymentConfirmed(profile)) {
          handleDirectPaymentSuccess();
        }
      } catch(e) {}
    }, 5000);
  }

  function handleDirectPaymentSuccess() {
    stopDirectPaymentWatch();
    clearActiveDirectPayment();

    var successBox = wizardRoot.querySelector('#direct-pay-success-box');
    var directCard = wizardRoot.querySelector('.direct-pay-card');
    var statusText = wizardRoot.querySelector('#direct-pay-status-text');

    if (statusText) statusText.textContent = t('settings.plan_status_confirmed', {}, 'Ödeme onaylandı! Pro aktif.');
    if (directCard) directCard.style.display = 'none';
    if (successBox) successBox.style.display = 'block';

    showMsg(t('settings.plan_upgraded_success', {}, '💎 Tebrikler! Pro üyeliğiniz başarıyla aktif edildi.'), 'success');

    try {
      sessionStorage.setItem('ww_user_plan', 'premium');
      localStorage.setItem('ww_user_plan', 'premium');
      sessionStorage.setItem('ww_pro_welcomed', 'true');
      sessionStorage.removeItem('ww_pending_payment');
      sessionStorage.removeItem('ww_pending_payment_time');
      localStorage.removeItem('ww_pending_payment');
      localStorage.removeItem('ww_pending_payment_time');
      localStorage.removeItem(STORAGE_KEY);
    } catch(e) {}

    setTimeout(function() {
      window.location.href = '/dashboard.html?payment=success';
    }, 3500);
  }

  // Kopyalama Butonları Dinleyicileri
  var btnCopyAmt = wizardRoot.querySelector('#btn-copy-pay-amount');
  if (btnCopyAmt) {
    btnCopyAmt.addEventListener('click', function() {
      if (!currentPaymentData || !currentPaymentData.payAmount) return;
      navigator.clipboard.writeText(String(currentPaymentData.payAmount)).then(function() {
        var textEl = btnCopyAmt.querySelector('.copy-text');
        if (textEl) textEl.textContent = t('settings.plan_copied', {}, 'Kopyalandı! ✓');
        btnCopyAmt.classList.add('copied');
        setTimeout(function() {
          if (textEl) textEl.textContent = t('settings.plan_copy', {}, 'Kopyala');
          btnCopyAmt.classList.remove('copied');
        }, 2000);
      });
    });
  }

  var btnCopyAddr = wizardRoot.querySelector('#btn-copy-pay-address');
  if (btnCopyAddr) {
    btnCopyAddr.addEventListener('click', function() {
      if (!currentPaymentData || !currentPaymentData.payAddress) return;
      navigator.clipboard.writeText(String(currentPaymentData.payAddress)).then(function() {
        var textEl = btnCopyAddr.querySelector('.copy-text');
        if (textEl) textEl.textContent = t('settings.plan_copied', {}, 'Kopyalandı! ✓');
        btnCopyAddr.classList.add('copied');
        setTimeout(function() {
          if (textEl) textEl.textContent = t('settings.plan_copy', {}, 'Kopyala');
          btnCopyAddr.classList.remove('copied');
        }, 2000);
      });
    });
  }

  // Geri Dön Butonu (Adım 5 -> Adım 4)
  var btnBackFromDirect = wizardRoot.querySelector('#btn-back-to-step4-from-direct');
  if (btnBackFromDirect) {
    btnBackFromDirect.addEventListener('click', function(e) {
      e.preventDefault();
      clearActiveDirectPayment();
      currentPaymentData = null;
      stopDirectPaymentWatch();
      goToStep(4);
    });
  }

  // Manuel Durum Kontrol Butonu
  var btnManualCheck = wizardRoot.querySelector('#btn-manual-check-status');
  if (btnManualCheck) {
    btnManualCheck.addEventListener('click', async function(e) {
      e.preventDefault();
      btnManualCheck.disabled = true;
      var origBtn = btnManualCheck.innerHTML;
      btnManualCheck.innerHTML = '<span>' + t('settings.plan_checking_status', {}, '⏳ Kontrol ediliyor...') + '</span>';
      try {
        var sb = window.sb || window.supabase;
        var user = window.SETTINGS_STATE.currentUser;
        if (!user && typeof getCurrentUser === 'function') {
          try { user = await getCurrentUser(); } catch(err) {}
        }
        if (user && sb) {
          var { data: prof } = await sb.from('user_profiles').select('plan, plan_expires_at').eq('id', user.id).single();
          if (isPaymentConfirmed(prof)) {
            handleDirectPaymentSuccess();
            return;
          }
        }
        showMsg(t('settings.plan_not_confirmed_yet', {}, 'İşlem henüz ağda onaylanmadı. Lütfen transferi yaptıktan sonra biraz bekleyin.'), 'info');
      } catch(err) {
        showMsg(t('settings.plan_check_error', {}, 'Kontrol edilirken bir hata oluştu.'), 'error');
      } finally {
        btnManualCheck.disabled = false;
        btnManualCheck.innerHTML = origBtn;
      }
    });
  }

  var btnGoDash = wizardRoot.querySelector('#btn-go-dashboard-after-pay');
  if (btnGoDash) {
    btnGoDash.addEventListener('click', function() {
      window.location.href = '/dashboard.html?payment=success';
    });
  }

  // ⭐ QR Kod Büyütme Modalı Olayları
  var qrFrame = wizardRoot.querySelector('#direct-qr-frame');
  var qrModal = wizardRoot.querySelector('#qr-zoom-modal');
  var btnCloseQrZoom = wizardRoot.querySelector('#btn-close-qr-zoom');

  function openQrModal() {
    if (qrModal) {
      qrModal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }
  }

  if (qrFrame) {
    qrFrame.addEventListener('click', function(e) {
      e.stopPropagation();
      openQrModal();
    });
    qrFrame.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openQrModal();
      }
    });
  }

  if (btnCloseQrZoom) {
    btnCloseQrZoom.addEventListener('click', function(e) {
      e.stopPropagation();
      closeQrModal();
    });
  }

  if (qrModal) {
    qrModal.addEventListener('click', function(e) {
      // Sadece arka plana veya modal dışına tıklandığında kapat (karta tıklandığında değil)
      if (e.target === qrModal) {
        closeQrModal();
      }
    });
  }

  SETTINGS_PAGE.on(document, 'keydown', function(e) {
    if (e.key === 'Escape' && qrModal && qrModal.style.display !== 'none') {
      closeQrModal();
    }
  });

  if (window.i18n && typeof window.i18n.onChange === 'function') {
    SETTINGS_PAGE.onI18nChange(function() {
      updatePeriodCardsUI();
      renderSummary();
    });
  }

  // Geliştirici test modu: erişim varsa 1 $'lık test planı kartı görünür (sunucu her ödemede yeniden doğrular)
  fetchDevTestStatus().then(function(st) {
    var testCard = wizardRoot.querySelector('.duration-option-card[data-period="test"]');
    if (testCard) testCard.style.display = (st && st.active) ? '' : 'none';
    // Erişim yokken test seçili kalmasın
    if (!(st && st.active) && selectedPeriod === 'test') {
      selectedPeriod = 'yearly';
      var yc = wizardRoot.querySelector('.duration-option-card[data-period="yearly"]');
      wizardRoot.querySelectorAll('.duration-option-card').forEach(function(c) { c.classList.remove('selected'); });
      if (yc) yc.classList.add('selected');
    }
  });

  goToStep(currentStep, true);
}

window.renderPlan = renderPlan;

// ============================================================
// ⭐ SÜRE SAYACI & CANLI GERİ SAYIM
// ============================================================
function startTimer(expiresAt) {
  if (window.SETTINGS_STATE.timerInterval) {
    clearInterval(window.SETTINGS_STATE.timerInterval);
  }

  function update() {
    try {
      var now = new Date();
      var diff = expiresAt - now;

      var daysEl = document.querySelector('[data-bind="days-left"]');
      var timerEl = document.getElementById('timer-days');
      var progEl = document.querySelector('[data-bind="progress"]');

      if (diff <= 0) {
        clearInterval(window.SETTINGS_STATE.timerInterval);
        var expiredText = t('settings.plan_expired', {}, 'Süresi Doldu');
        if (daysEl) daysEl.textContent = expiredText;
        if (timerEl) timerEl.textContent = expiredText;
        if (progEl) progEl.style.width = '100%';
        return;
      }

      var days = Math.floor(diff / (1000 * 60 * 60 * 24));
      var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      var mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      var timeText = '';
      if (days > 0) {
        timeText = days + ' ' + t('settings.plan_days', {}, 'gün') + ' ' + hours + ' ' + t('settings.plan_hours', {}, 'saat');
      } else if (hours > 0) {
        timeText = hours + ' ' + t('settings.plan_hours', {}, 'saat') + ' ' + mins + ' dk';
      } else {
        timeText = mins + ' dk';
      }

      if (daysEl) daysEl.textContent = timeText;
      if (timerEl) timerEl.textContent = timeText;

      var totalDays = Math.max(30, days + 1);
      var pct = Math.max(0, Math.min(100, ((totalDays - days) / totalDays) * 100));
      if (progEl) progEl.style.width = pct + '%';
    } catch (e) {}
  }

  update();
  window.SETTINGS_STATE.timerInterval = setInterval(update, 10000);
}

// ============================================================
// ŞİFRE PANEL — ELEMENT-LEVEL GUARD
// ============================================================
function initPassword() {
  wwLog.log('🔐 Şifre paneli başlatılıyor...');

  var btn = safeEl('change-password-btn');
  if (btn && !btn._passwordBound) {
    btn._passwordBound = true;
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
        if (err) { err.textContent = t('common.db_connection_error'); err.style.display = 'block'; }
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
// TEHLİKELİ BÖLGE — ELEMENT-LEVEL GUARD
// ============================================================
function initDanger() {
  wwLog.log('⚠️ Tehlikeli bölge başlatılıyor...');

  var deleteBtn = safeEl('delete-data-btn');
  if (deleteBtn && !deleteBtn._dangerBound) {
    deleteBtn._dangerBound = true;
    deleteBtn.addEventListener('click', deleteAllUserData);
  }

  var deactivateBtn = safeEl('deactivate-account-btn');
  if (deactivateBtn && !deactivateBtn._dangerBound) {
    deactivateBtn._dangerBound = true;
    deactivateBtn.addEventListener('click', deactivateAccount);
  }
}

async function deleteAllUserData() {
  var user = window.SETTINGS_STATE.currentUser;
  if (!user) {
    showMsg(t('common.unexpected_error'), 'error');
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
    if (!sb) throw new Error(t('common.db_connection_error'));

    wwLog.log('🗑️ Kapsamlı kullanıcı verisi sıfırlama başlatılıyor...');

    // 1. Önce güvenli ve atomik RPC fonksiyonunu dene
    var rpcDone = false;
    try {
      var rpcResult = await sb.rpc('reset_user_data');
      if (!rpcResult.error) {
        rpcDone = true;
        wwLog.log('✅ reset_user_data RPC başarıyla tamamlandı');
      } else {
        wwLog.warn('reset_user_data RPC hatası, tablo bazlı silmeye geçiliyor:', rpcResult.error.message);
      }
    } catch (rpcErr) {
      wwLog.warn('reset_user_data RPC çağrılamadı:', rpcErr);
    }

    // 2. RPC yoksa veya hata verdiyse tablo bazlı kapsamlı temizlik yap
    if (!rpcDone) {
      wwLog.log('🗑️ 1/5 Trade verileri siliniyor...');
      var tradesResult = await sb.from('trades').delete().eq('user_id', user.id);
      if (tradesResult.error) throw tradesResult.error;

      wwLog.log('🗑️ 2/5 Backtest verileri siliniyor...');
      try {
        await sb.from('backtest_trades').delete().eq('user_id', user.id);
      } catch (e) { wwLog.warn('backtest_trades silinemedi:', e); }

      wwLog.log('🗑️ 3/5 Stratejiler siliniyor...');
      try {
        await sb.from('strategies').delete().eq('user_id', user.id);
      } catch (e) { wwLog.warn('strategies silinemedi:', e); }

      wwLog.log('🗑️ 4/5 Bildirimler ve onboarding siliniyor...');
      try {
        await sb.from('notifications').delete().eq('user_id', user.id);
      } catch (e) { wwLog.warn('notifications silinemedi:', e); }
      try {
        await sb.from('user_onboarding').delete().eq('user_id', user.id);
      } catch (e) { wwLog.warn('user_onboarding silinemedi:', e); }

      wwLog.log('🗑️ 5/5 Defterler (özel günlükler) temizleniyor...');
      try {
        await sb.from('journals').delete().eq('user_id', user.id).eq('is_default', false);
      } catch (e) { wwLog.warn('özel journals silinemedi:', e); }
    }

    // 3. Yerel tarayıcı önbelleklerini temizle
    try {
      localStorage.removeItem('ww_active_journal_id');
      localStorage.removeItem('ww_overtrade_dismissed_v2');
      localStorage.removeItem('ww_notifications');
      sessionStorage.removeItem('ww_cached_profile');
      sessionStorage.removeItem('ww_cached_profile_time');
    } catch (cacheErr) {
      wwLog.warn('Yerel depolama temizlenirken uyarı:', cacheErr);
    }

    wwLog.log('✅ Kapsamlı veri silme başarıyla tamamlandı');
    showMsg('✅ ' + t('settings.delete_success'), 'success');

    setTimeout(function() {
      window.location.reload();
    }, 1500);

  } catch (e) {
    console.error('❌ Veri silme hatası:', e);
    showMsg('❌ ' + t('settings.delete_error') + (e.message || ''), 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}

async function deactivateAccount() {
  var user = window.SETTINGS_STATE.currentUser;
  if (!user) {
    showMsg(t('common.unexpected_error'), 'error');
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
    if (!sb) throw new Error(t('common.db_connection_error'));

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
      try {
        sessionStorage.removeItem('ww_user_plan');
        sessionStorage.removeItem('ww_user_plan_time');
      } catch(e) {}
      window.location.href = '/login.html';
    }, 1500);

  } catch (e) {
    console.error('❌ Hesap devre dışı bırakma hatası:', e);
    var errMsg = e.message || '';

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
// ⭐ GÖRÜNÜM PANEL
// ============================================================
function initAppearance() {
  wwLog.log('🎨 Görünüm paneli başlatılıyor...');
  initLanguageSelector();
  initCurrencySelector();
  initTimeSettings();
  initAmbientSelector();
  if (typeof window.updateThemeModeCards === 'function') {
    window.updateThemeModeCards();
  }

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
    var isPro = result.plan === 'premium';

    if (!isPro) {
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
      backgroundColor: '#07070c', surfaceColor: '#0e0e16', borderColor: '#1a1a28', textColor: '#f0f0f8', fontSize: 16
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

    cloneForm.querySelectorAll('[data-icon]').forEach(function(el) {
      el.innerHTML = getLucideIcon(el.getAttribute('data-icon'), 14);
    });

    container.innerHTML = '';
    container.appendChild(cloneForm);

    if (window.i18n && typeof window.i18n.apply === 'function') window.i18n.apply();

    setupThemeEventsFallback();

  }).catch(function(err) {
    console.error('❌ Pro kontrol hatası:', err);
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

  function updateChips() {
    var chipBg = document.getElementById('chip-bg');
    var chipSurf = document.getElementById('chip-surface');
    var chipBorder = document.getElementById('chip-border');
    var chipText = document.getElementById('chip-text');
    if (chipBg && bgColor) chipBg.style.background = bgColor.value;
    if (chipSurf && surfaceColor) chipSurf.style.background = surfaceColor.value;
    if (chipBorder && borderColor) chipBorder.style.background = borderColor.value;
    if (chipText && textColor) chipText.style.background = textColor.value;
  }

  function updateFontPills(val) {
    document.querySelectorAll('.font-pill').forEach(function(pill) {
      pill.classList.toggle('active', pill.dataset.size === String(val));
    });
  }

  function updatePreview(applyToRoot) {
    updateChips();
    if (fontSize) updateFontPills(fontSize.value);

    if (applyToRoot) {
      var root = document.documentElement;
      if (bgColor) root.style.setProperty('--bg', bgColor.value);
      if (surfaceColor) {
        root.style.setProperty('--surface', surfaceColor.value);
        root.style.setProperty('--surface2', surfaceColor.value);
      }
      if (borderColor) root.style.setProperty('--border', borderColor.value);
      if (textColor) root.style.setProperty('--text', textColor.value);
      if (fontSize) {
        var size = fontSize.value + 'px';
        document.body.style.fontSize = size;
        if (fontSizeDisplay) fontSizeDisplay.textContent = size;
      }
    } else {
      if (fontSize && fontSizeDisplay) {
        fontSizeDisplay.textContent = fontSize.value + 'px';
      }
    }
    if (previewBox) {
      if (surfaceColor) previewBox.style.background = surfaceColor.value;
      if (borderColor) previewBox.style.borderColor = borderColor.value;
      if (textColor) {
        previewBox.style.color = textColor.value;
        previewBox.querySelectorAll('.preview-text-contrast').forEach(function(el) {
          el.style.color = textColor.value;
        });
      }
    }
  }

  var PRESETS = {
    obsidian: { bg: '#07070c', surface: '#0e0e16', border: '#1a1a28', text: '#f0f0f8' },
    violet:   { bg: '#080612', surface: '#120e24', border: '#261e47', text: '#f0f0f8' },
    slate:    { bg: '#090d14', surface: '#0f172a', border: '#1e293b', text: '#f1f5f9' },
    stealth:  { bg: '#000000', surface: '#0c0c0e', border: '#242428', text: '#ffffff' }
  };

  document.querySelectorAll('.preset-card').forEach(function(btn) {
    if (btn._presetBound) return;
    btn._presetBound = true;
    btn.addEventListener('click', function() {
      var p = PRESETS[this.dataset.preset];
      if (!p) return;
      document.querySelectorAll('.preset-card').forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');

      if (bgColor) bgColor.value = p.bg;
      if (surfaceColor) surfaceColor.value = p.surface;
      if (borderColor) borderColor.value = p.border;
      if (textColor) textColor.value = p.text;

      var bgText = document.getElementById('custom-bg-color-text');
      var surfText = document.getElementById('custom-surface-color-text');
      var borderText = document.getElementById('custom-border-color-text');
      var textText = document.getElementById('custom-text-color-text');
      if (bgText) bgText.value = p.bg;
      if (surfText) surfText.value = p.surface;
      if (borderText) borderText.value = p.border;
      if (textText) textText.value = p.text;

      updatePreview(true);
    });
  });

  document.querySelectorAll('.font-pill').forEach(function(pill) {
    if (pill._pillBound) return;
    pill._pillBound = true;
    pill.addEventListener('click', function() {
      var size = parseInt(this.dataset.size, 10);
      if (size && fontSize) {
        fontSize.value = size;
        updatePreview(true);
      }
    });
  });

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
      backgroundColor: bgColor ? bgColor.value : '#07070c',
      surfaceColor: surfaceColor ? surfaceColor.value : '#0e0e16',
      borderColor: borderColor ? borderColor.value : '#1a1a28',
      textColor: textColor ? textColor.value : '#f0f0f8',
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
      backgroundColor: '#07070c',
      surfaceColor: '#0e0e16',
      borderColor: '#1a1a28',
      textColor: '#f0f0f8',
      fontSize: 16
    };
    if (bgColor) bgColor.value = defaultSettings.backgroundColor;
    if (surfaceColor) surfaceColor.value = defaultSettings.surfaceColor;
    if (borderColor) borderColor.value = defaultSettings.borderColor;
    if (textColor) textColor.value = defaultSettings.textColor;
    if (fontSize) fontSize.value = defaultSettings.fontSize;
    document.querySelectorAll('.preset-card').forEach(function(b) {
      b.classList.toggle('active', b.dataset.preset === 'obsidian');
    });
    updatePreview(false);
    try { localStorage.removeItem('ww_custom_theme'); } catch(e) {}
    var root = document.documentElement;
    root.style.removeProperty('--bg');
    root.style.removeProperty('--surface');
    root.style.removeProperty('--surface2');
    root.style.removeProperty('--border');
    root.style.removeProperty('--text');
    document.body.style.fontSize = '';
    showMsg('↺ ' + t('settings.theme_reset_done'), 'success');
  }

  if (bgColor && !bgColor._themeBound) {
    bgColor._themeBound = true;
    bgColor.addEventListener('input', function() { updatePreview(true); });
  }
  if (surfaceColor && !surfaceColor._themeBound) {
    surfaceColor._themeBound = true;
    surfaceColor.addEventListener('input', function() { updatePreview(true); });
  }
  if (borderColor && !borderColor._themeBound) {
    borderColor._themeBound = true;
    borderColor.addEventListener('input', function() { updatePreview(true); });
  }
  if (textColor && !textColor._themeBound) {
    textColor._themeBound = true;
    textColor.addEventListener('input', function() { updatePreview(true); });
  }
  if (fontSize && !fontSize._themeBound) {
    fontSize._themeBound = true;
    fontSize.addEventListener('input', function() { updatePreview(true); });
  }

  var saveBtn = document.getElementById('save-custom-theme-btn');
  if (saveBtn && !saveBtn._themeBound) {
    saveBtn._themeBound = true;
    saveBtn.addEventListener('click', saveTheme);
  }

  var resetBtn = document.getElementById('reset-custom-theme-btn');
  if (resetBtn && !resetBtn._themeBound) {
    resetBtn._themeBound = true;
    resetBtn.addEventListener('click', resetTheme);
  }

  // İlk açılışta :root'u değiştirme, sadece preview kutusunu güncelle
  updatePreview(false);
}

// ============================================================
// ⭐ DİL SEÇİCİ v5 - ELEMENT-LEVEL GUARD (SPA-AWARE)
// ============================================================

async function switchLanguageSafe(lang) {
  if (window.i18nReady) {
    try { await window.i18nReady; } catch (e) {}
  }

  if (!window.i18n) {
    throw new Error('i18n not available');
  }

  if (typeof window.i18n.loadLanguage === 'function') {
    try {
      await window.i18n.loadLanguage(lang);
    } catch (e) {
      wwLog.warn('loadLanguage failed:', e);
    }
  }

  if (typeof window.i18n.setLanguage === 'function') {
    try {
      var result = window.i18n.setLanguage(lang);
      if (result && typeof result.then === 'function') {
        await result;
      }
    } catch (e) {
      wwLog.warn('setLanguage threw:', e);
    }
  }

  if (window.i18n.currentLang !== lang) {
    window.i18n.currentLang = lang;
  }

  try { localStorage.setItem('ww_language', lang); } catch (e) {}
  document.documentElement.setAttribute('data-lang', lang);

  if (typeof window.i18n.apply === 'function') {
    try { window.i18n.apply(); } catch (e) {}
  }

  if (window.i18n.listeners && Array.isArray(window.i18n.listeners)) {
    window.i18n.listeners.forEach(function(cb) {
      try { cb(lang); } catch (e) {}
    });
  }
}

function initLanguageSelector() {
  wwLog.log('🌐 Dil seçici başlatılıyor...');

  var btns = document.querySelectorAll('.lang-compact-btn');

  if (btns.length === 0) {
    wwLog.warn('⚠️ Dil butonları bulunamadı! (panel henüz yüklenmemiş olabilir)');
    return;
  }

  var savedLang = localStorage.getItem('ww_language') || 'en';
  var currentLang = (window.i18n && typeof window.i18n.getCurrentLanguage === 'function')
    ? window.i18n.getCurrentLanguage() : savedLang;

  wwLog.log('🌐 Mevcut dil: ' + currentLang + ' (kayıtlı: ' + savedLang + ')');

  function updateButtonStates(lang) {
    document.querySelectorAll('.lang-compact-btn').forEach(function(b) {
      var isActive = b.dataset.lang === lang;
      b.classList.toggle('active', isActive);
      if (isActive) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
  }

  if (window.i18n && typeof window.i18n.onChange === 'function' && !SETTINGS_PAGE._langOnChangeBound) {
    SETTINGS_PAGE._langOnChangeBound = true;
    SETTINGS_PAGE.onI18nChange(function(newLang) {
      updateButtonStates(newLang);
      wwLog.log('🔄 Buton state güncellendi (onChange): ' + newLang);
    });
  }

  updateButtonStates(currentLang);

  btns.forEach(function(btn) {
    if (btn._langBound) return;
    btn._langBound = true;

    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();

      var lang = this.dataset.lang;
      var langName = this.textContent.trim();

      wwLog.log('🖱️ Dil seçildi: ' + lang);

      updateButtonStates(lang);

      (async function() {
        try {
          await switchLanguageSafe(lang);

          if (typeof window.updateNavbarI18n === 'function') {
            try { window.updateNavbarI18n(); } catch (e) {}
          } else if (typeof updateNavbarI18n === 'function') {
            try { updateNavbarI18n(); } catch (e) {}
          }

          updateButtonStates(lang);

          var msg = window.i18n.t('settings.language_selected', { name: langName });
          if (msg && msg !== 'settings.language_selected') {
            showMsg(msg, 'success');
          } else {
            showMsg('✓ ' + langName, 'success');
          }

          wwLog.log('✅ Dil değişimi tamamlandı: ' + lang);

        } catch (err) {
          wwLog.warn('❌ Dil değişimi hatası:', err);
          showMsg('Dil değiştirilemedi. Lütfen sayfayı yenileyin.', 'error');
        }
      })();
    });
  });

  wwLog.log('✅ Dil seçici başlatıldı! (' + btns.length + ' buton)');
}

// ============================================================
// ⭐ PARA BİRİMİ SEÇİCİ - ELEMENT-LEVEL GUARD
// ============================================================
function initCurrencySelector() {
  wwLog.log('💰 Para birimi seçici başlatılıyor...');

  var current = localStorage.getItem('ww_currency') || '$';
  var btns = document.querySelectorAll('.currency-btn');

  if (btns.length === 0) {
    wwLog.warn('⚠️ Para birimi butonları bulunamadı!');
    return;
  }

  btns.forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.currency === current);

    if (btn._currencyBound) return;
    btn._currencyBound = true;

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

  // Lot Başına Komisyon ayarı
  var commInput = safeEl('settings-commission-per-lot');
  if (commInput) {
    commInput.value = localStorage.getItem('ww_commission_per_lot') || '';
    if (!commInput._bound) {
      commInput._bound = true;
      commInput.addEventListener('change', function() {
        var val = parseFloat(this.value.replace(',', '.'));
        if (!isNaN(val) && val >= 0) {
          localStorage.setItem('ww_commission_per_lot', String(val));
          showMsg('Lot başına komisyon kaydedildi!', 'success');
        } else {
          localStorage.removeItem('ww_commission_per_lot');
          this.value = '';
          showMsg('Lot başına komisyon sıfırlandı.', 'info');
        }
      });
    }
  }

  wwLog.log('✅ Para birimi ve komisyon ayarları başlatıldı!');
}

// ============================================================
// ⭐ SAAT VE GÜN AYARLARI (Görünüm paneli)
// Mantık: /interface/shared/time-settings.js (window.WwTime)
// ============================================================
var TIME_POPULAR_TZ = [
  ['Europe/Istanbul', 'İstanbul'], ['UTC', 'UTC'], ['Europe/London', 'London'],
  ['Europe/Berlin', 'Berlin / Frankfurt'], ['Europe/Moscow', 'Moscow'], ['Asia/Dubai', 'Dubai'],
  ['Asia/Kolkata', 'Mumbai / Delhi'], ['Asia/Singapore', 'Singapore'], ['Asia/Hong_Kong', 'Hong Kong'],
  ['Asia/Tokyo', 'Tokyo'], ['Australia/Sydney', 'Sydney'], ['Pacific/Auckland', 'Auckland'],
  ['America/New_York', 'New York'], ['America/Chicago', 'Chicago'], ['America/Denver', 'Denver'],
  ['America/Los_Angeles', 'Los Angeles'], ['America/Sao_Paulo', 'São Paulo'], ['Africa/Johannesburg', 'Johannesburg']
];
// Broker/dosya saatleri için sabit farklar (dakika): tam saatler + yaygın yarım/çeyrek saatler
var TIME_IMPORT_OFFSETS = (function () {
  var list = [];
  for (var h = -12; h <= 14; h++) list.push(h * 60);
  [-570, -210, 210, 270, 330, 345, 570, 630].forEach(function (m) { list.push(m); });
  return list.sort(function (a, b) { return a - b; });
})();
var _timeI18nBound = false;

function initTimeSettings() {
  var WT = window.WwTime;
  var tzSel = safeEl('time-tz');
  var dsSel = safeEl('time-day-start');
  var impSel = safeEl('time-import-tz');
  var fmtWrap = safeEl('time-format-selector');
  if (!WT || !tzSel || !dsSel || !impSel || !fmtWrap) {
    wwLog.warn('⚠️ Saat ayarları başlatılamadı (WwTime veya elemanlar yok)');
    return;
  }

  function addOption(parent, value, label) {
    var o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    parent.appendChild(o);
    return o;
  }
  function addGroup(select, label) {
    var g = document.createElement('optgroup');
    g.label = label;
    select.appendChild(g);
    return g;
  }
  function offsetText(minutes) {
    var sign = minutes < 0 ? '-' : '+';
    var abs = Math.abs(minutes);
    var h = Math.floor(abs / 60), m = abs % 60;
    return 'GMT' + sign + h + (m ? ':' + (m < 10 ? '0' + m : m) : '');
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function lang() { return (window.i18n && typeof window.i18n.getCurrentLanguage === 'function') ? window.i18n.getCurrentLanguage() : 'tr'; }

  function buildTzOptions() {
    tzSel.innerHTML = '';
    addOption(tzSel, 'auto', t('settings.time_tz_auto', { tz: WT.deviceTz().replace(/_/g, ' ') }));
    var popular = addGroup(tzSel, t('settings.time_tz_popular'));
    var seen = {};
    TIME_POPULAR_TZ.forEach(function (z) {
      seen[z[0]] = true;
      addOption(popular, z[0], z[1] + ' (' + WT.offsetLabel(z[0]) + ')');
    });
    var all = [];
    try { if (typeof Intl.supportedValuesOf === 'function') all = Intl.supportedValuesOf('timeZone'); } catch (e) {}
    var current = WT.getSettings().tz;
    if (current !== 'auto' && !seen[current] && all.indexOf(current) < 0) all.push(current);
    if (all.length) {
      var allGroup = addGroup(tzSel, t('settings.time_tz_all'));
      all.forEach(function (z) {
        if (seen[z]) return;
        addOption(allGroup, z, z.replace(/_/g, ' ') + ' (' + WT.offsetLabel(z) + ')');
      });
    }
  }

  function buildDayStartOptions() {
    dsSel.innerHTML = '';
    for (var h = 0; h < 24; h++) {
      addOption(dsSel, String(h), h === 0 ? t('settings.time_daystart_midnight') : pad2(h) + ':00');
    }
  }

  function buildImportOptions() {
    impSel.innerHTML = '';
    addOption(impSel, 'same', t('settings.time_import_same'));
    addOption(impSel, 'utc', t('settings.time_import_utc'));
    var g = addGroup(impSel, t('settings.time_import_offset'));
    TIME_IMPORT_OFFSETS.forEach(function (m) { addOption(g, 'offset:' + m, offsetText(m)); });
  }

  // New York 17:00'nin kullanıcının saat dilimindeki karşılığı (forex günü başlangıcı)
  function forexDayStart() {
    var now = Date.now();
    var ny = WT.partsInTz(now, 'America/New_York');
    var ms = WT.zonedToUtcMs(ny.y, ny.m, ny.d, 17, 0, 0, 'America/New_York');
    var p = WT.partsInTz(ms, WT.getTz());
    return { hour: p.H, minute: p.Mi };
  }

  function syncControls() {
    var s = WT.getSettings();
    var tzValue = s.tz;
    if (!tzSel.querySelector('option[value="' + tzValue + '"]')) tzValue = 'auto';
    tzSel.value = tzValue;
    dsSel.value = String(s.dayStart);
    impSel.value = s.importTz;
    fmtWrap.querySelectorAll('[data-hour12]').forEach(function (b) {
      b.classList.toggle('active', (b.dataset.hour12 === '1') === !!s.hour12);
    });
  }

  function renderPreview() {
    var nowEl = safeEl('time-preview-now');
    var dayEl = safeEl('time-preview-day');
    var exEl = safeEl('time-preview-example');
    var hintEl = safeEl('time-day-forex-hint');
    var L = lang();
    var tz = WT.getTz();
    try {
      var nowIso = new Date().toISOString();
      if (nowEl) {
        nowEl.textContent = WT.formatDateTime(nowIso, L, { weekday: 'short', second: '2-digit' }) +
          ' · ' + WT.offsetLabel(tz) + ' (' + tz.replace(/_/g, ' ') + ')';
      }
      var today = WT.todayKey();
      if (dayEl) dayEl.textContent = WT.formatDate(today, L, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      if (exEl) {
        var utcDay = nowIso.slice(0, 10);
        var sampleIso = utcDay + 'T21:30:00Z';
        exEl.textContent = t('settings.time_preview_example_text', {
          utc: '21:30',
          local: WT.formatDateTime(sampleIso, L, { weekday: 'short', day: 'numeric', month: 'short', year: undefined }),
          day: WT.formatDate(WT.dateKey(sampleIso), L, { weekday: 'short', day: 'numeric', month: 'long', year: undefined })
        });
      }
      if (hintEl) {
        var fx = forexDayStart();
        hintEl.textContent = t('settings.time_daystart_forex_hint', { time: pad2(fx.hour) + ':' + pad2(fx.minute) });
      }
    } catch (e) { wwLog.warn('Saat önizlemesi hesaplanamadı:', e); }
  }

  function buildAll() {
    buildTzOptions();
    buildDayStartOptions();
    buildImportOptions();
    syncControls();
    renderPreview();
  }

  function saved() {
    syncControls();
    renderPreview();
    showMsg(t('settings.time_saved'), 'success');
  }

  buildAll();

  if (!tzSel._timeBound) {
    tzSel._timeBound = true;
    tzSel.addEventListener('change', function () { WT.setSettings({ tz: this.value }); buildTzOptions(); saved(); });
  }
  if (!dsSel._timeBound) {
    dsSel._timeBound = true;
    dsSel.addEventListener('change', function () { WT.setSettings({ dayStart: parseInt(this.value, 10) }); saved(); });
  }
  if (!impSel._timeBound) {
    impSel._timeBound = true;
    impSel.addEventListener('change', function () { WT.setSettings({ importTz: this.value }); saved(); });
  }
  if (!fmtWrap._timeBound) {
    fmtWrap._timeBound = true;
    fmtWrap.querySelectorAll('[data-hour12]').forEach(function (b) {
      b.addEventListener('click', function () { WT.setSettings({ hour12: this.dataset.hour12 === '1' }); saved(); });
    });
  }
  var forexBtn = safeEl('time-day-forex-btn');
  if (forexBtn && !forexBtn._timeBound) {
    forexBtn._timeBound = true;
    forexBtn.addEventListener('click', function () {
      WT.setSettings({ dayStart: forexDayStart().hour });
      saved();
    });
  }
  var resetBtn = safeEl('time-reset-btn');
  if (resetBtn && !resetBtn._timeBound) {
    resetBtn._timeBound = true;
    resetBtn.addEventListener('click', function () {
      WT.resetSettings();
      buildAll();
      showMsg(t('settings.time_reset_done'), 'info');
    });
  }

  // Önizleme canlı kalsın (saniye göstergesi) ve dil değişince etiketler yenilensin
  if (window._wwTimePreviewTimer) clearInterval(window._wwTimePreviewTimer);
  window._wwTimePreviewTimer = setInterval(function () {
    if (!document.getElementById('time-preview-now')) { clearInterval(window._wwTimePreviewTimer); window._wwTimePreviewTimer = null; return; }
    renderPreview();
  }, 1000);
  if (!_timeI18nBound && window.i18n && typeof window.i18n.onChange === 'function') {
    _timeI18nBound = true;
    window.i18n.onChange(function () {
      if (document.getElementById('time-tz')) buildAll();
    });
  }

  wwLog.log('✅ Saat ve gün ayarları başlatıldı!');
}

// ============================================================
// ⭐ GELİŞTİRİCİ TEST MODU (Ayarlar > Gelişmiş)
// Kod admin panelinden belirlenir ve sunucuda hash olarak saklanır. Doğrulama redeem_dev_test_code RPC'sinde
// yapılır (hız sınırlı); erişim 24 saat sürer. Test planı satın alınırken create-payment erişimi yeniden doğrular.
// ============================================================
async function fetchDevTestStatus() {
  try {
    var sbc = getSb();
    if (!sbc) return { active: false };
    var res = await sbc.rpc('get_dev_test_status');
    if (res.error || !res.data) return { active: false };
    return res.data;
  } catch (e) {
    return { active: false };
  }
}
window.fetchDevTestStatus = fetchDevTestStatus;

function initAdvanced() {
  var stateText = safeEl('dev-test-state-text');
  var dot = safeEl('dev-test-dot');
  var enterRow = safeEl('dev-test-enter-row');
  var activeRow = safeEl('dev-test-active-row');
  var input = safeEl('dev-test-code-input');
  var activateBtn = safeEl('dev-test-activate-btn');
  var exitBtn = safeEl('dev-test-exit-btn');
  var gotoPlanBtn = safeEl('dev-test-goto-plan-btn');
  if (!stateText || !enterRow || !activeRow) return;

  async function refresh() {
    var st = await fetchDevTestStatus();
    var active = !!(st && st.active);
    enterRow.style.display = active ? 'none' : '';
    activeRow.style.display = active ? '' : 'none';
    if (dot) dot.className = 'dev-test-dot' + (active ? ' on' : '');
    if (active) {
      var ms = Date.parse(st.expires_at) - Date.now();
      var hours = Math.max(0, Math.floor(ms / 3600000));
      var mins = Math.max(0, Math.floor((ms % 3600000) / 60000));
      stateText.textContent = t('settings.devtest_state_on', { time: hours + ' sa ' + mins + ' dk' }, 'Test modu AÇIK (kalan süre: ' + hours + ' sa ' + mins + ' dk)');
    } else {
      stateText.textContent = t('settings.devtest_state_off', {}, 'Test modu kapalı');
    }
  }

  if (activateBtn && !activateBtn._devBound) {
    activateBtn._devBound = true;
    activateBtn.addEventListener('click', async function() {
      var code = input ? input.value : '';
      if (!code) {
        showMsg(t('settings.devtest_code_required', {}, 'Lütfen kodu girin.'), 'error');
        return;
      }
      activateBtn.disabled = true;
      try {
        var res = await getSb().rpc('redeem_dev_test_code', { p_code: code });
        if (res.error) throw res.error;
        if (!res.data || res.data.success === false) {
          showMsg((res.data && res.data.error) || t('settings.devtest_invalid', {}, 'Geçersiz kod.'), 'error');
        } else {
          if (input) input.value = '';
          showMsg(t('settings.devtest_enabled', {}, 'Test modu etkinleştirildi.'), 'success');
        }
      } catch (e) {
        showMsg((e && e.message) || t('settings.devtest_error', {}, 'İşlem başarısız.'), 'error');
      } finally {
        activateBtn.disabled = false;
        refresh();
      }
    });
    if (input) {
      input.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') activateBtn.click(); });
    }
  }
  if (exitBtn && !exitBtn._devBound) {
    exitBtn._devBound = true;
    exitBtn.addEventListener('click', async function() {
      exitBtn.disabled = true;
      try { await getSb().rpc('exit_dev_test_mode'); } catch (e) {}
      exitBtn.disabled = false;
      showMsg(t('settings.devtest_exited', {}, 'Test modundan çıkıldı.'), 'info');
      refresh();
    });
  }
  if (gotoPlanBtn && !gotoPlanBtn._devBound) {
    gotoPlanBtn._devBound = true;
    gotoPlanBtn.addEventListener('click', function() { window.switchPanel('panel-plan'); });
  }

  refresh();
}


// ============================================================
// ⭐ DİNAMİK ARKA PLAN AMBİYANSI SEÇİCİ
// ============================================================
function initAmbientSelector() {
  var currentMode = localStorage.getItem('ww_ambient_mode') || 'dynamic';
  var btns = document.querySelectorAll('.ambient-mode-btn');
  if (btns.length === 0) return;

  function updateBtnStates(m) {
    btns.forEach(function(b) {
      b.classList.toggle('active', b.dataset.mode === m);
    });
    var dot = document.getElementById('ambient-current-indicator');
    if (dot) {
      if (m === 'off') {
        dot.style.display = 'none';
      } else {
        dot.style.display = 'inline-block';
        var state = document.body.getAttribute('data-ambient-state') || 'neutral';
        dot.className = 'ambient-indicator-dot ' + state;
      }
    }
  }

  updateBtnStates(currentMode);

  btns.forEach(function(btn) {
    if (btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', function() {
      var mode = this.dataset.mode;
      localStorage.setItem('ww_ambient_mode', mode);
      updateBtnStates(mode);
      if (typeof window.syncAmbientGlow === 'function') {
        window.syncAmbientGlow();
      }
      var label = mode === 'dynamic' ? 'Dinamik PnL' : (mode === 'classic' ? 'Klasik Mor' : 'Kapalı');
      showMsg('Ambiyans modu güncellendi: ' + label, 'success');
    });
  });

  if (typeof window.syncAmbientGlow === 'function') {
    window.syncAmbientGlow();
  }

  wwLog.log('✅ Dinamik ambiyans seçici başlatıldı!');
}

window.testAmbientState = function(state) {
  var body = document.body;
  if (!body) return;
  body.classList.remove('ambient-disabled');
  body.classList.add('ambient-enabled');
  body.setAttribute('data-ambient-state', state);

  var chips = document.querySelectorAll('.ambient-test-chip');
  chips.forEach(function(chip) {
    chip.classList.toggle('active', chip.classList.contains(state));
  });

  var dot = document.getElementById('ambient-current-indicator');
  if (dot) {
    dot.style.display = 'inline-block';
    dot.className = 'ambient-indicator-dot ' + state;
  }

  var msg = state === 'profit' ? 'Kâr Ambiyansı Aktif (Yeşil)' : (state === 'loss' ? 'Zarar Ambiyansı Aktif (Kırmızı)' : 'Nötr Ambiyans Aktif (Mor)');
  if (typeof showMsg === 'function') showMsg(msg, 'success');
  else if (typeof showToast === 'function') showToast(msg, 'success');
};

window.syncAmbientGlow = function(overridePnl) {
  var mode = localStorage.getItem('ww_ambient_mode') || 'dynamic';
  var body = document.body;
  if (!body) return;

  if (mode === 'off') {
    body.classList.add('ambient-disabled');
    return;
  }

  body.classList.remove('ambient-disabled');

  if (mode === 'classic') {
    body.setAttribute('data-ambient-state', 'neutral');
    return;
  }

  var pnl = overridePnl;
  if (pnl === undefined || pnl === null) {
    var raw = localStorage.getItem('ww_cached_pnl');
    pnl = raw !== null ? parseFloat(raw) : 0;
  }

  if (isNaN(pnl) || pnl === 0) {
    body.setAttribute('data-ambient-state', 'neutral');
  } else if (pnl > 0) {
    body.setAttribute('data-ambient-state', 'profit');
  } else {
    body.setAttribute('data-ambient-state', 'loss');
  }

  var dot = document.getElementById('ambient-current-indicator');
  if (dot) {
    dot.className = 'ambient-indicator-dot ' + (body.getAttribute('data-ambient-state') || 'neutral');
  }
};

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
// PLAN BADGE GÜNCELLE (lokal fallback - navbar.js asıl sorumlu)
// ============================================================
async function updateBadge() {
  var badge = safeEl('plan-badge');
  var text = safeEl('plan-text');
  if (!badge || !text) return;

  try {
    var user = await getCurrentUser();
    if (!user) return;
    var sb = getSb();
    if (!sb) return;
    var result = await sb.from('user_profiles').select('plan, plan_expires_at').eq('id', user.id).single();
    var isPro = isActivePro(result.data);
    window.SETTINGS_STATE.isPro = isPro;

    if (isPro) {
      badge.classList.add('pro');
      text.textContent = t('nav.pro_badge');
    } else {
      badge.classList.remove('pro');
      text.textContent = t('nav.free_badge');
    }
  } catch (e) {}
}

window.updateBadge = updateBadge;

// ============================================================

// ============================================================
// PANEL CLICK EVENTLERİ — ELEMENT-LEVEL GUARD
// ============================================================
function initPanelClickEvents() {
  wwLog.log('📋 Panel click eventleri başlatılıyor...');

  document.querySelectorAll('.sidebar-nav-item').forEach(function(btn) {
    if (btn._panelBound) return;
    btn._panelBound = true;
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
    if (btn._panelBound) return;
    btn._panelBound = true;
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
// AVATAR POPUP — ELEMENT-LEVEL GUARD
// ============================================================
function initAvatarPopup() {
  wwLog.log('🖼️ Avatar popup başlatılıyor...');

  var sidebarProfile = document.getElementById('sidebar-profile');
  if (sidebarProfile && !sidebarProfile._avatarBound) {
    sidebarProfile._avatarBound = true;
    sidebarProfile.addEventListener('click', function() {
      var popup = document.getElementById('avatar-popup');
      if (popup) {
        popup.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
    });
  }

  var closeBtn = document.getElementById('avatar-popup-close');
  if (closeBtn && !closeBtn._avatarBound) {
    closeBtn._avatarBound = true;
    closeBtn.addEventListener('click', closePopup);
  }

  var popup = document.getElementById('avatar-popup');
  if (popup && !popup._avatarBound) {
    popup._avatarBound = true;
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
// CONFIRM MODAL - INIT — ELEMENT-LEVEL GUARD
// ============================================================
function initConfirmModal() {
  wwLog.log('📦 Confirm modal başlatılıyor...');

  var modal = document.getElementById('confirm-modal');
  if (modal && !modal._confirmBound) {
    modal._confirmBound = true;
    modal.addEventListener('click', function(e) {
      if (e.target === this) this.classList.remove('active');
    });
    SETTINGS_PAGE.on(document, 'keydown', function(e) {
      if (e.key === 'Escape' && modal.classList.contains('active')) {
        modal.classList.remove('active');
      }
    });
  }
}

// ============================================================
// PRO KONTROL
// ============================================================
async function checkAndActivatePro() {
  wwLog.log('🔍 Pro kontrol ediliyor...');

  var user = window.SETTINGS_STATE.currentUser;
  if (!user) {
    wwLog.warn('Kullanıcı yok');
    return;
  }
  if (user.id === 'test-user-id') {
    window.SETTINGS_STATE.isPro = true;
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
    var isPro = isActivePro(data);

    // Fiyatlari DB'den canli cek
    try {
      var sbClient2 = window.sb || window.supabase;
      if (sbClient2) {
        var { data: dbPrices2 } = await sbClient2.rpc('get_prices');
        if (dbPrices2) {
          var mVal2 = parseFloat(dbPrices2.monthly);
          var yVal2 = parseFloat(dbPrices2.yearly);
          if (!isNaN(mVal2) && mVal2 > 0) {
            localStorage.setItem('ww_monthly_price', mVal2.toString());
          }
          if (!isNaN(yVal2) && yVal2 > 0) {
            localStorage.setItem('ww_yearly_price', yVal2.toString());
          }
        }
      }
    } catch(err) { console.error('Plan prices fetch err:', err); }

    var expiresAt = data && data.plan_expires_at ? new Date(data.plan_expires_at) : null;

    if (isPro && expiresAt && new Date() > expiresAt) {
      wwLog.log('⏰ Pro süresi dolmuş.');
      window.SETTINGS_STATE.isPro = false;
      // ⭐ FIX v6: sessionStorage'a yaz (navbar ile aynı storage)
      try {
        sessionStorage.setItem('ww_user_plan', 'free');
        sessionStorage.setItem('ww_user_plan_time', String(Date.now()));
      } catch(e) {}
      return;
    }

    window.SETTINGS_STATE.isPro = isPro;

    // ⭐ FIX v6: localStorage yerine sessionStorage kullan (navbar.js ile senkron)
    try {
      sessionStorage.setItem('ww_user_plan', isPro ? 'premium' : 'free');
      sessionStorage.setItem('ww_user_plan_time', String(Date.now()));
    } catch(e) {}

    if (isPro) {
      wwLog.log('✅ Pro aktif! Bitiş:', expiresAt);
    } else {
      wwLog.log('📌 Ücretsiz plan');
    }

  } catch (e) {
    console.error('Pro kontrol hatası:', e);
  }
}

// ============================================================
// ⭐ SAYFA BAŞLATMA (ASTRO SPA-AWARE)
// ============================================================
async function bootSettings() {
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
      if (window.location.search.indexOf('test=1') !== -1) {
        user = { email: 'demo@wawejournal.com', id: 'demo-user-id' };
        window.SETTINGS_STATE.isPro = true;
      } else {
        wwLog.warn('⚠️ Giriş yapılmamış, ana sayfaya yönlendiriliyor...');
        window.location.href = '/index.html';
        return;
      }
    }

    wwLog.log('👤 Kullanıcı:', user.email);
    window.SETTINGS_STATE.currentUser = user;

    await checkAndActivatePro();

    var cb = document.getElementById('theme-toggle');
    if (cb) {
      var savedTheme = localStorage.getItem('ww_theme');
      cb.checked = savedTheme === 'light';

      var isLightTheme = savedTheme === 'light';
      var icon = document.getElementById('theme-icon');
      var label = document.getElementById('theme-label');
      var desc = document.getElementById('theme-desc');

      if (isLightTheme) {
        if (icon) icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
      } else {
        if (icon) icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
      }
      if (label) label.textContent = themeLabel(isLightTheme);
      if (desc) desc.textContent = themeDesc(isLightTheme);
    }

    if (typeof window.initNavEvents === 'function') window.initNavEvents();
    initPanelClickEvents();
    initAvatarPopup();
    initConfirmModal();

    var glow = document.getElementById('panel-glow');
    if (glow) glow.className = 'panel-glow profile-glow';

    if ('scrollRestoration' in history) {
      try { history.scrollRestoration = 'manual'; } catch(e) {}
    }
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    var hash = window.location.hash.replace('#', '');
    var savedPanel = null;
    try { savedPanel = localStorage.getItem('ww_active_settings_panel'); } catch(e) {}
    var targetPanelId = 'panel-profile';

    if (hash && hash.indexOf('panel-') === 0) {
      targetPanelId = hash;
      wwLog.log('📍 URL\'den panel hedefleniyor: ' + targetPanelId);
    } else if (savedPanel && document.getElementById(savedPanel)) {
      targetPanelId = savedPanel;
      wwLog.log('📍 Hafızadan panel hedefleniyor: ' + targetPanelId);
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
          'panel-overtrade': 'overtrade-glow',
      'panel-advanced': 'overtrade-glow'
        };
        if (map[targetPanelId]) glow.classList.add(map[targetPanelId]);
      }

      if (PANEL_URLS[targetPanelId]) {
        await mountPanel(targetPanelId);
        initPanel(targetPanelId);
      }
      preloadPanels();

      // Tarayıcının hash yüzünden aşağı kaymasını kesin olarak engelle, tepeye hizala
      window.scrollTo({ top: 0, behavior: 'instant' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      requestAnimationFrame(function() {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      });
      setTimeout(function() {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }, 50);
      setTimeout(function() {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }, 150);
    }

    // ⭐ FIX v6: Navbar badge'ini settings.js boot'ta güncelle
    if (typeof window.updateNavbarBadge === 'function') {
      await window.updateNavbarBadge();
    }
    await updateBadge();

    await loadAvatar();
    await loadProfileData();

    wwLog.log('✅ Settings başarıyla başlatıldı! 🎉');

  } catch (e) {
    console.error('❌ Settings hatası:', e);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootSettings);
} else {
  bootSettings();
}

// Not: Eskiden burada astro:page-load dinleniyordu. SPA router bu olayı HER sayfa
// geçişinde tetiklediği için Settings dışındaki sayfalarda da bootSettings çalışırdı.
// Sayfaya SPA ile girildiğinde bu script zaten yeniden çalışıyor (data-page-script).

// Sayfadan çıkarken plan geri sayımını durdur
SETTINGS_PAGE.onLeave(function() {
  if (window.SETTINGS_STATE && window.SETTINGS_STATE.timerInterval) {
    clearInterval(window.SETTINGS_STATE.timerInterval);
    window.SETTINGS_STATE.timerInterval = null;
  }
});

wwLog.log('✅ settings.js GÜNCELLENDİ ve yüklendi! (i18n v5 - ASTRO SPA + tüm guard)');

// ============================================================
// ⭐ GLOBAL EXPORT
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