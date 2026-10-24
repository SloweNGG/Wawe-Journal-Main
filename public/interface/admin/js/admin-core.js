// ============================================================
// ADMIN-CORE.JS - STATE, UTILS, INIT
// Tema: localStorage'daki ww_theme / ww_custom_theme okunur, storage ve
// themeChanged olayları dinlenir; grafikler tema değişince yenilenir.
// ============================================================

var wwLog = window.wwLog || console;

// SPA: başka sayfaya geçilince ADMIN_PAGE.on ile eklenen dinleyiciler kaldırılır,
// ADMIN_PAGE.onLeave ile kaydedilenler çalışır (BaseHead.astro → wwPage)
var ADMIN_PAGE = window.wwPage.current();

// ------------------------------------------------------------
// TEMA
// ------------------------------------------------------------
function applyAdminCustomTheme(settings) {
  if (!settings) return;
  var root = document.documentElement;
  if (settings.backgroundColor) root.style.setProperty('--bg', settings.backgroundColor);
  if (settings.surfaceColor) {
    root.style.setProperty('--surface', settings.surfaceColor);
    root.style.setProperty('--surface2', settings.surfaceColor);
  }
  if (settings.borderColor) root.style.setProperty('--border', settings.borderColor);
  if (settings.textColor) root.style.setProperty('--text', settings.textColor);
  if (settings.fontSize) document.body.style.fontSize = settings.fontSize + 'px';
}

function applyAdminThemeFromStorage() {
  try {
    var isLight = localStorage.getItem('ww_theme') === 'light';
    document.body.classList.toggle('light-theme', isLight);

    var savedFontSize = localStorage.getItem('ww_font_size');
    if (savedFontSize) document.body.style.fontSize = savedFontSize + 'px';

    var customTheme = localStorage.getItem('ww_custom_theme');
    if (customTheme && !isLight) {
      try { applyAdminCustomTheme(JSON.parse(customTheme)); } catch (e) {}
    }
  } catch (e) {}
}

applyAdminThemeFromStorage();

(function listenAdminThemeChanges() {
  // Tema değişince açık olan paneldeki grafikleri yeniden çiz
  function refreshChartsIfNeeded() {
    if (adminState.currentTab === 'overview' && typeof renderOverviewContent === 'function') {
      setTimeout(function() { renderOverviewContent(adminState.overviewPeriod || 'week'); }, 150);
    }
    if (adminState.currentTab === 'analytics' && typeof loadAnalyticsData === 'function') {
      setTimeout(function() { loadAnalyticsData(); }, 150);
    }
  }

  ADMIN_PAGE.on(window, 'storage', function(e) {
    if (e.key === 'ww_theme' || e.key === 'ww_custom_theme' || e.key === 'ww_font_size') {
      applyAdminThemeFromStorage();
      refreshChartsIfNeeded();
    }
  });

  ADMIN_PAGE.on(document, 'themeChanged', function(e) {
    if (e.detail && e.detail.settings) applyAdminCustomTheme(e.detail.settings);
    refreshChartsIfNeeded();
  });
})();

// ------------------------------------------------------------
// STATE
// ------------------------------------------------------------
var adminState = window.adminState || {
  currentTab: 'overview',
  overviewPeriod: 'week',
  users: [],
  payments: [],
  references: [],
  referralCodes: [],
  payouts: [],
  partnerApplications: [],
  bugReports: [],
  supportBans: [],
  supportStatus: null,
  charts: {
    userChart: null,
    proChart: null,
    overviewUserChart: null,
    overviewRevenueChart: null,
    overviewPlanDonut: null
  },
  searchTimeout: null,
  currentImageFile: null
};
['referralCodes', 'payouts', 'partnerApplications', 'bugReports', 'supportBans'].forEach(function(key) {
  if (!adminState[key]) adminState[key] = [];
});
if (!adminState.supportStatus) adminState.supportStatus = null;
if (!adminState.charts) {
  adminState.charts = {
    userChart: null,
    proChart: null,
    overviewUserChart: null,
    overviewRevenueChart: null,
    overviewPlanDonut: null
  };
}
window.adminState = adminState;

// ------------------------------------------------------------
// YARDIMCILAR
// ------------------------------------------------------------
var ADMIN_TOAST_ICONS = {
  success: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
  error: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>',
  warning: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>',
  info: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'
};

function showToast(msg, type) {
  type = type ? String(type).toLowerCase() : 'success';
  if (!ADMIN_TOAST_ICONS[type]) type = 'info';

  try {
    var tc = document.getElementById('toast-container');
    if (!tc) {
      tc = document.createElement('div');
      tc.id = 'toast-container';
      tc.className = 'toast-container';
      document.body.appendChild(tc);
    }

    var raw = '';
    if (msg === null || msg === undefined) raw = '';
    else if (typeof msg === 'object') raw = msg.message || msg.error || JSON.stringify(msg);
    else raw = String(msg);

    // Emojileri ayıkla (uygulama genelinde bildirimlerde ikon kullanılır)
    var clean = raw.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{200D}\u{FE0F}]/gu, '').trim();
    if (!clean) clean = type === 'error' ? 'Hata oluştu' : 'İşlem tamamlandı';

    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML =
      '<span class="toast-icon">' + ADMIN_TOAST_ICONS[type] + '</span>' +
      '<span class="toast-msg"></span>' +
      '<button type="button" class="toast-close" aria-label="Kapat">&times;</button>';
    el.querySelector('.toast-msg').textContent = clean;

    var dismiss = function() {
      el.classList.add('hide');
      setTimeout(function() { if (el && el.parentNode) el.remove(); }, 250);
    };

    el.querySelector('.toast-close').onclick = dismiss;
    tc.appendChild(el);
    setTimeout(dismiss, type === 'error' ? 6000 : 3500);
  } catch (e) {}
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) {
    return '—';
  }
}

function formatDateFull(iso) {
  if (!iso) return '—';
  try {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '—';
  }
}

// HTML metni ve özniteliği için güvenli kaçış. Sayı/null/undefined da kabul eder
// (eskiden yalnızca string beklediği için sayı gelince tablo çizimi çöküyordu).
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
  });
}

// Yalnızca http(s) adreslerini (ve isteğe bağlı olarak resim data URL'lerini) kabul eder.
// Geçersizse '' döner; dönen değer öznitelik içinde doğrudan kullanılabilir.
function safeUrl(url, allowDataImage) {
  var u = String(url === null || url === undefined ? '' : url).trim();
  if (!u) return '';
  var ok = /^https?:\/\//i.test(u) || (allowDataImage && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(u));
  return ok ? escapeHtml(u) : '';
}

function getInitials(name) {
  if (!name) return '?';
  var first = Array.from(String(name).trim())[0];
  return first ? first.toUpperCase() : '?';
}

// Avatar: geçerli adres varsa resim, yoksa baş harf
function avatarMarkup(url, name) {
  var src = safeUrl(url);
  return src
    ? '<img src="' + src + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
    : '<span>' + escapeHtml(getInitials(name)) + '</span>';
}

// Yenilemede arama kutusu yeniden çizildiği için odak ve imleç kaybolmasın
function restoreInputFocus(inputId, hadFocus, caret) {
  if (!hadFocus) return;
  var el = document.getElementById(inputId);
  if (!el) return;
  el.focus();
  try { el.setSelectionRange(caret, caret); } catch (e) {}
}

function captureInputFocus(inputId) {
  var el = document.getElementById(inputId);
  var focused = !!el && document.activeElement === el;
  return { had: focused, caret: focused && el.selectionStart !== null ? el.selectionStart : 0 };
}

window.safeUrl = safeUrl;
window.avatarMarkup = avatarMarkup;
window.captureInputFocus = captureInputFocus;
window.restoreInputFocus = restoreInputFocus;

// ------------------------------------------------------------
// PANELLER (MENÜ TEK KAYNAKTAN ÜRETİLİR)
// ------------------------------------------------------------
var ADMIN_ICONS = {
  overview: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
  chart: '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  package: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/>',
  userCheck: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>',
  wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
  dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  bug: '<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'
};

function adminSvg(name, cls, size, strokeWidth) {
  return '<svg' + (cls ? ' class="' + cls + '"' : '') + (size ? ' width="' + size + '" height="' + size + '"' : '') +
    ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (strokeWidth || 2) +
    '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ADMIN_ICONS[name] + '</svg>';
}
window.adminSvg = adminSvg;

// tab: adminState.currentTab değeri, glow: .panel-glow renk varyantı
var ADMIN_NAV = [
  { panel: 'panel-overview', tab: 'overview', glow: 'overview-glow', icon: 'overview', label: 'Genel' },
  { panel: 'panel-users', tab: 'users', glow: 'users-glow', icon: 'users', label: 'Kullanıcılar' },
  { panel: 'panel-references', tab: 'references', glow: 'references-glow', icon: 'clipboard', label: 'Referanslar' },
  { panel: 'panel-analytics', tab: 'analytics', glow: 'analytics-glow', icon: 'chart', label: 'İstatistikler' },
  { panel: 'panel-referral-codes', tab: 'referral-codes', glow: 'overview-glow', icon: 'package', label: 'Referans Kodları' },
  { panel: 'panel-partner-applications', tab: 'partner-applications', glow: 'overview-glow', icon: 'userCheck', label: 'Partner Başvuruları' },
  { panel: 'panel-payouts', tab: 'payouts', glow: 'overview-glow', icon: 'wallet', label: 'Çekim Talepleri' },
  { divider: true },
  { panel: 'panel-prices', tab: 'prices', glow: 'prices-glow', icon: 'dollar', label: 'Fiyat Yönetimi' },
  { panel: 'panel-bug-reports', tab: 'bug-reports', glow: 'users-glow', icon: 'bug', label: 'Hata Bildirimleri' }
];

function switchPanel(panelId, clickedEl) {
  document.querySelectorAll('.admin-panel').forEach(function(p) { p.classList.remove('active'); });

  var targetPanel = document.getElementById(panelId);
  if (targetPanel) targetPanel.classList.add('active');

  document.querySelectorAll('.sidebar-nav-item, .admin-tab-btn').forEach(function(b) {
    var isActive = b.dataset.panel === panelId;
    b.classList.toggle('active', isActive);
    if (b.classList.contains('sidebar-nav-item')) {
      if (isActive) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
  });

  var nav = ADMIN_NAV.filter(function(n) { return n.panel === panelId; })[0];
  if (nav) adminState.currentTab = nav.tab;

  var glow = document.getElementById('panel-glow');
  if (glow) {
    glow.className = 'panel-glow';
    if (nav) glow.classList.add(nav.glow);
  }

  // Mobil sekme çubuğunda seçili sekmeyi görünür tut
  var activeTab = document.querySelector('.admin-tab-btn.active');
  if (activeTab && activeTab.scrollIntoView) {
    try { activeTab.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) {}
  }

  function reload(loader, render) {
    if (typeof loader === 'function') {
      return loader().then(function() { if (typeof render === 'function') render(); });
    }
    if (typeof render === 'function') render();
  }

  try {
    if (panelId === 'panel-overview' && typeof renderOverviewContent === 'function') renderOverviewContent(adminState.overviewPeriod || 'week');
    if (panelId === 'panel-users') {
      if (typeof renderUsersTable === 'function') renderUsersTable();
      reload(window.loadUsers, window.renderUsersTable);
    }
    if (panelId === 'panel-references' && typeof renderReferencesTable === 'function') renderReferencesTable();
    if (panelId === 'panel-analytics' && typeof loadAnalyticsData === 'function') setTimeout(loadAnalyticsData, 50);
    if (panelId === 'panel-referral-codes' && typeof renderReferralCodesTable === 'function') renderReferralCodesTable();
    if (panelId === 'panel-partner-applications') reload(window.loadPartnerApplications, window.renderPartnerApplicationsTable);
    if (panelId === 'panel-payouts') reload(window.loadPayoutRequests, window.renderPayoutsTable);
    if (panelId === 'panel-prices' && typeof renderPricesContent === 'function') renderPricesContent();
    if (panelId === 'panel-bug-reports') {
      if (typeof loadBugReports === 'function') {
        Promise.all([
          loadBugReports(),
          typeof loadSupportStatus === 'function' ? loadSupportStatus() : Promise.resolve(),
          typeof loadSupportBans === 'function' ? loadSupportBans() : Promise.resolve()
        ]).then(function() {
          if (typeof renderBugReportsPanel === 'function') renderBugReportsPanel();
        });
      } else if (typeof renderBugReportsPanel === 'function') {
        renderBugReportsPanel();
      }
    }
  } catch (e) {
    console.error('switchPanel render error:', e);
  }
}

function adminSidebarMarkup() {
  var items = ADMIN_NAV.map(function(n) {
    if (n.divider) return '<div class="sidebar-nav-divider"></div>';
    return '<button type="button" class="sidebar-nav-item' + (n.panel === 'panel-overview' ? ' active' : '') + '" data-panel="' + n.panel +
      '" onclick="switchPanel(\'' + n.panel + '\', this)">' + adminSvg(n.icon, 'nav-icon') + escapeHtml(n.label) + '</button>';
  }).join('');

  return '<aside class="admin-sidebar" aria-label="Admin menüsü">' +
    '<div class="sidebar-header">' +
      '<div class="sidebar-avatar" id="admin-sidebar-avatar"><span class="no-avatar">A</span></div>' +
      '<div class="sidebar-username" id="admin-sidebar-username">Admin</div>' +
      '<div class="sidebar-email" id="admin-sidebar-email">—</div>' +
    '</div>' +
    '<nav class="sidebar-nav">' + items + '</nav>' +
  '</aside>';
}

function adminMobileTabsMarkup() {
  var tabs = ADMIN_NAV.filter(function(n) { return !n.divider; }).map(function(n) {
    return '<button type="button" class="admin-tab-btn' + (n.panel === 'panel-overview' ? ' active' : '') + '" data-panel="' + n.panel +
      '" onclick="switchPanel(\'' + n.panel + '\', this)">' + adminSvg(n.icon, 'tab-icon') + ' ' + escapeHtml(n.label) + '</button>';
  }).join('');
  return '<div class="admin-tabs-mobile" id="mobile-tabs">' + tabs + '</div>';
}

function adminCardHeader(icon, title, subtitleHtml, actionsHtml, tone) {
  return '<div class="s-card-header">' +
    '<div class="header-icon' + (tone ? ' tone-' + tone : '') + '">' + adminSvg(icon, '', 0, 1.8) + '</div>' +
    '<div><h2>' + title + '</h2><p>' + subtitleHtml + '</p></div>' +
    (actionsHtml ? '<div class="header-actions">' + actionsHtml + '</div>' : '') +
  '</div>';
}

function adminPanelsMarkup() {
  var refreshBtn = function(id, onclick) {
    return '<button type="button" class="btn btn-ghost btn-sm" id="' + id + '" onclick="' + onclick + '">' + adminSvg('refresh', '', 14) + 'Yenile</button>';
  };
  var loading = function(text) {
    return '<div class="admin-loading"><div class="spinner"></div><span>' + text + '</span></div>';
  };

  return '<div class="admin-panels">' +
    '<div class="panel-glow overview-glow" id="panel-glow"></div>' +

    '<div class="admin-panel active" id="panel-overview">' +
      '<div id="overview-content">' + loading('Genel bakış yükleniyor...') + '</div>' +
    '</div>' +

    '<div class="admin-panel" id="panel-users"><div class="s-card">' +
      adminCardHeader('users', 'Kullanıcı Listesi',
        'Platformdaki tüm kullanıcılar — <strong id="user-count">…</strong> kayıt',
        '<div class="search-wrap">' + adminSvg('search', '', 14) +
          '<input type="text" id="user-search" class="search-input" placeholder="Ara..." aria-label="Kullanıcı ara" /></div>' +
        refreshBtn('refresh-users-btn', '')) +
      '<div class="s-card-body"><div id="users-table-container"></div></div>' +
    '</div></div>' +

    '<div class="admin-panel" id="panel-references"><div class="s-card">' +
      adminCardHeader('star', 'Referans Yönetimi',
        'Anlaşma yapılan kişi ve kurumlar — <strong id="ref-count">' + adminState.references.length + '</strong> kayıt',
        '<button type="button" class="btn btn-primary btn-sm" id="add-reference-btn">' + adminSvg('plus', '', 14) + 'Yeni</button>') +
      '<div class="s-card-body"><div id="references-table-container"></div></div>' +
    '</div></div>' +

    '<div class="admin-panel" id="panel-analytics"><div class="s-card">' +
      adminCardHeader('chart', 'Platform İstatistikleri', 'Son 7 günlük aktivite verileri ve pro satışları') +
      '<div class="s-card-body">' +
        '<div class="stats-grid" id="analytics-stats">' +
          '<div class="stat-card"><div class="stat-label">Toplam Kullanıcı</div><div class="stat-value" id="stat-total-users">—</div></div>' +
          '<div class="stat-card"><div class="stat-label">Toplam Pro</div><div class="stat-value" id="stat-total-pro">—</div></div>' +
          '<div class="stat-card"><div class="stat-label">Pro Gelir (Toplam)</div><div class="stat-value" id="stat-pro-revenue">—</div></div>' +
          '<div class="stat-card"><div class="stat-label">Son 7 Gün Pro</div><div class="stat-value" id="stat-pro-7days">—</div></div>' +
        '</div>' +
        '<div class="charts-grid">' +
          '<div class="chart-card"><h3>Günlük Yeni Kullanıcılar (Son 7 Gün)</h3><div class="chart-wrap" id="usersChart"></div></div>' +
          '<div class="chart-card"><h3>Günlük Pro Satışları (Son 7 Gün) - $</h3><div class="chart-wrap" id="proChart"></div></div>' +
          '<div class="chart-card charts-grid-full">' +
            '<h3>' + adminSvg('package', '', 16) + 'Son Pro Alan Kullanıcılar</h3>' +
            '<div id="recent-pro-list" class="recent-pro-list"><div class="empty-state">Yükleniyor...</div></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div></div>' +

    '<div class="admin-panel" id="panel-referral-codes"><div class="s-card">' +
      adminCardHeader('package', 'Referans Kodları', 'İndirim kodlarını oluşturun ve yönetin.',
        '<button type="button" class="btn btn-primary btn-sm" id="add-referral-code-btn">' + adminSvg('plus', '', 14) + 'Yeni Kod</button>') +
      '<div class="s-card-body"><div id="referral-codes-container"></div></div>' +
    '</div></div>' +

    '<div class="admin-panel" id="panel-partner-applications"><div class="s-card">' +
      adminCardHeader('userCheck', 'WJ Partner Başvuruları', 'Topluluk ve influencer partnerlik taleplerini inceleyin ve kod tanımlayın.',
        refreshBtn('refresh-partner-apps-btn', "if(typeof loadPartnerApplications==='function') loadPartnerApplications().then(function(){ if(typeof renderPartnerApplicationsTable==='function') renderPartnerApplicationsTable(); });")) +
      '<div class="s-card-body"><div id="partner-applications-container"></div></div>' +
    '</div></div>' +

    '<div class="admin-panel" id="panel-payouts"><div class="s-card">' +
      adminCardHeader('wallet', 'Para Çekme Talepleri', 'Influencer ve kullanıcıların LTC/BTC çekim taleplerini yönetin.',
        refreshBtn('refresh-payouts-btn', "if(typeof loadPayoutRequests==='function') loadPayoutRequests().then(function(){ if(typeof renderPayoutsTable==='function') renderPayoutsTable(); });")) +
      '<div class="s-card-body"><div id="payouts-admin-container"></div></div>' +
    '</div></div>' +

    '<div class="admin-panel" id="panel-prices"><div class="s-card">' +
      adminCardHeader('dollar', 'Fiyat Yönetimi', 'Pro plan fiyatlarını, indirimleri ve ödeme seçeneklerini yönetin.') +
      '<div class="s-card-body"><div id="prices-container"></div></div>' +
    '</div></div>' +

    '<div class="admin-panel" id="panel-bug-reports">' +
      '<div id="bug-reports-admin-container">' + loading('Hata bildirimleri ve destek verileri yükleniyor...') + '</div>' +
    '</div>' +
  '</div>';
}

// Paneller (modal) scroll kapsayıcısının içinde sıkışmasın diye body'ye taşınır.
// Taşınan düğümler olay dinleyicilerini korur; SPA geçişinde body zaten değiştirilir.
// Taşınan paneller SPA geçişinde body'de kalır (yalnızca sayfa kapsayıcısı değişir); bu yüzden
// işaretlenir, sayfadan çıkarken kaldırılır ve yeniden girişte aynı kimlikli eski kopyalar silinir.
// Aksi halde getElementById eski (bağlantısız) kopyayı bulur ve düğmeler çalışmaz.
function removeStaleAdminModals(onlyIds) {
  document.querySelectorAll('.modal-overlay[data-admin-modal]').forEach(function(old) {
    if (!onlyIds || onlyIds.indexOf(old.id) !== -1) old.remove();
  });
}

function mountAdminModals() {
  var fresh = Array.prototype.slice.call(document.querySelectorAll('.modal-overlay:not([data-admin-modal])'));
  removeStaleAdminModals(fresh.map(function(m) { return m.id; }));
  fresh.forEach(function(m) {
    m.setAttribute('data-admin-modal', '');
    if (m.parentElement !== document.body) document.body.appendChild(m);
  });
}

ADMIN_PAGE.onLeave(function() { removeStaleAdminModals(); });

function closeAdminModals() {
  document.querySelectorAll('.modal-overlay.open, .modal-overlay.active').forEach(function(m) {
    m.classList.remove('open', 'active');
  });
}

// Esc ile ve panelin dışına (karartılmış alana) tıklayarak kapatma
(function bindAdminModalDismiss() {
  var downOnOverlay = null;

  ADMIN_PAGE.on(document, 'keydown', function(e) {
    if (e.key === 'Escape') closeAdminModals();
  });
  ADMIN_PAGE.on(document, 'mousedown', function(e) {
    downOnOverlay = (e.target && e.target.classList && e.target.classList.contains('modal-overlay')) ? e.target : null;
  });
  ADMIN_PAGE.on(document, 'click', function(e) {
    // Metin seçerken fare panelin dışında bırakılırsa pencere kapanmasın:
    // yalnızca basma ve bırakma aynı karartılmış alanda olduysa kapat
    if (downOnOverlay && e.target === downOnOverlay) {
      downOnOverlay.classList.remove('open', 'active');
    }
    downOnOverlay = null;
  });
})();

function renderAdminPanel() {
  var main = document.getElementById('main-content');
  if (!main) {
    console.error('main-content bulunamadı!');
    return;
  }

  main.innerHTML =
    '<div class="page-header">' +
      '<div><h1>Admin Panel</h1><p class="subtitle">Platform yönetimi ve analiz araçları</p></div>' +
      '<span class="admin-badge">' + adminSvg('zap', '', 12, 2.5) + 'ADMİN</span>' +
    '</div>' +
    adminMobileTabsMarkup() +
    '<div class="admin-wrap">' + adminSidebarMarkup() + adminPanelsMarkup() + '</div>';

  mountAdminModals();

  [
    ['initReferralModal'], ['initReferenceModal'], ['renderReferralCodesTable'], ['renderPaymentSettingsUI']
  ].forEach(function(entry) {
    var fn = window[entry[0]];
    if (typeof fn === 'function') {
      try { fn(); } catch (e) { console.error(entry[0] + ' hatası:', e); }
    }
  });

  var addRefBtn = document.getElementById('add-reference-btn');
  if (addRefBtn) {
    addRefBtn.addEventListener('click', function() {
      if (typeof openReferenceModal === 'function') openReferenceModal();
    });
  }

  var userSearch = document.getElementById('user-search');
  if (userSearch) {
    userSearch.addEventListener('input', function() {
      clearTimeout(adminState.searchTimeout);
      adminState.searchTimeout = setTimeout(function() {
        if (typeof renderUsersTable === 'function') renderUsersTable();
      }, 300);
    });
  }

  var refreshBtn = document.getElementById('refresh-users-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async function() {
      if (typeof loadUsers === 'function') await loadUsers();
      if (typeof renderUsersTable === 'function') renderUsersTable();
    });
  }

  (async function() {
    try {
      var client = window.sb || (typeof sb !== 'undefined' ? sb : null);
      if (!client) return;
      var userRes = await client.auth.getUser();
      var user = userRes && userRes.data && userRes.data.user;
      if (!user) return;

      var username = (user.user_metadata && user.user_metadata.username) || (user.email ? user.email.split('@')[0] : 'Admin');
      var usernameEl = document.getElementById('admin-sidebar-username');
      var emailEl = document.getElementById('admin-sidebar-email');
      if (usernameEl) usernameEl.textContent = username;
      if (emailEl) emailEl.textContent = user.email || '—';

      var profileRes = await client.from('user_profiles').select('avatar_url').eq('id', user.id).single();
      var profile = profileRes && profileRes.data;
      var avatarEl = document.getElementById('admin-sidebar-avatar');
      if (avatarEl) {
        var avatarSrc = safeUrl(profile && profile.avatar_url);
        avatarEl.innerHTML = avatarSrc
          ? '<img src="' + avatarSrc + '" alt="" referrerpolicy="no-referrer">'
          : '<span class="no-avatar">' + escapeHtml(getInitials(username)) + '</span>';
      }
    } catch (e) {}
  })();

  [
    ['renderOverviewContent', [adminState.overviewPeriod || 'week']],
    ['renderUsersTable', []],
    ['renderReferencesTable', []],
    ['renderPricesContent', []],
    ['renderPayoutsTable', []],
    ['renderPartnerApplicationsTable', []]
  ].forEach(function(entry) {
    var fn = window[entry[0]];
    if (typeof fn === 'function') {
      try { fn.apply(null, entry[1]); } catch (e) { console.error(entry[0] + ' hatası:', e); }
    }
  });

  setTimeout(function() {
    if (typeof loadAnalyticsData === 'function') {
      try { loadAnalyticsData(); } catch (e) { console.error('loadAnalyticsData hatası:', e); }
    }
  }, 500);
}

// Navbar'daki plan rozetini güncelle (navbar.js ile aynı id'ler)
async function updatePlanBadge() {
  try {
    var badge = document.getElementById('plan-badge');
    var text = document.getElementById('plan-text');
    if (!badge || !text) return;

    var planData = await getUserPlan();
    var isPro = planData.plan === 'premium';

    badge.classList.toggle('pro', isPro);
    text.textContent = isPro ? 'Pro' : 'Ücretsiz';
  } catch (e) {}
}

function adminFailMessage(title, retryLabel) {
  var mc = document.getElementById('main-content');
  if (!mc) return;
  mc.innerHTML = '<div class="admin-loading"><p class="admin-error-title">' + escapeHtml(title) + '</p>' +
    '<button type="button" class="btn btn-primary" onclick="location.reload()">' + escapeHtml(retryLabel) + '</button></div>';
}

async function initAdmin() {
  try {
    var client = window.sb || (typeof sb !== 'undefined' ? sb : null);

    function tryCreateClient() {
      if (!client && typeof window.supabase !== 'undefined' && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
        try {
          client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
          window.sb = client;
        } catch (e) {}
      }
    }

    tryCreateClient();
    for (var i = 0; !client && i < 40; i++) {
      await new Promise(function(r) { setTimeout(r, 100); });
      client = window.sb || (typeof sb !== 'undefined' ? sb : null);
      tryCreateClient();
    }

    if (!client) {
      console.error('Supabase client (sb) bulunamadı!');
      adminFailMessage('Veritabanı bağlantısı kurulamadı.', 'Tekrar Dene');
      return;
    }
    window.sb = client;

    var sessionRes = await client.auth.getSession();
    var session = sessionRes && sessionRes.data && sessionRes.data.session;
    if (!session) {
      wwLog.warn('Oturum yok, login sayfasına yönlendiriliyor...');
      window.location.href = 'login.html';
      return;
    }

    // Yetki yalnızca app_metadata.role'den okunur (navbar ile aynı kural).
    // user_metadata kullanıcı tarafından değiştirilebildiği için yetki kaynağı değildir
    // (bkz. supabase/ADMIN_ROLE.md). Asıl koruma veritabanındaki RLS / RPC kurallarıdır.
    var role = session.user && session.user.app_metadata && session.user.app_metadata.role;
    if (role !== 'admin') {
      wwLog.warn('Admin yetkisi yok! role:', role);
      window.location.href = 'dashboard.html';
      return;
    }

    var loaders = ['loadUsers', 'loadPayments', 'loadReferences', 'loadReferralCodes', 'loadPartnerApplications', 'loadPayoutRequests'];
    for (var li = 0; li < loaders.length; li++) {
      try {
        if (typeof window[loaders[li]] === 'function') await window[loaders[li]]();
      } catch (e) {
        console.error(loaders[li] + ' hatası:', e);
      }
    }

    renderAdminPanel();
    try { if (typeof initUsersRealtime === 'function') initUsersRealtime(); } catch (e) {}

    setTimeout(updatePlanBadge, 500);

    if (typeof i18n !== 'undefined' && i18n.onChange) {
      ADMIN_PAGE.onI18nChange(function() { updatePlanBadge(); });
    }
  } catch (e) {
    console.error('Admin init hatası:', e);
    adminFailMessage('Admin panel başlatılamadı.', 'Sayfayı Yenile');
  }
}

window.adminState = adminState;
window.switchPanel = switchPanel;
window.showToast = showToast;
window.formatDate = formatDate;
window.formatDateFull = formatDateFull;
window.escapeHtml = escapeHtml;
window.getInitials = getInitials;
window.updatePlanBadge = updatePlanBadge;
window.initAdmin = initAdmin;
window.renderAdminPanel = renderAdminPanel;
window.closeAdminModals = closeAdminModals;
