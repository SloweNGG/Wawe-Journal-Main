// ============================================================
// ADMIN-CORE.JS - STATE, UTILS, INIT
// ⭐ TEMA: Sayfa başında localStorage'dan tema yüklenir
// ⭐ TEMA: storage / themeChanged event'leri dinlenir
// ============================================================

// ============================================================
// ⭐ TEMA BAŞLATMA - SAYFA YÜKLENİRKEN (EN BAŞTA ÇALIŞIR)
// ============================================================

(function initAdminTheme() {
  try {
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
        if (settings.fontSize) {
          document.body.style.fontSize = settings.fontSize + 'px';
        }
      } catch (e) {}
    }

    console.log('🎨 [admin-core.js] Tema ayarlandı:', savedTheme || 'dark');
  } catch (e) {}
})();

// ============================================================
// ⭐ TEMA DEĞİŞİMİNİ DİNLE
// ============================================================

(function listenAdminThemeChanges() {
  function applyThemeFromStorage() {
    try {
      var savedTheme = localStorage.getItem('ww_theme');
      var isLight = savedTheme === 'light';
      document.body.classList.toggle('light-theme', isLight);

      var customTheme = localStorage.getItem('ww_custom_theme');
      if (customTheme && !isLight) {
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
        } catch (e) {}
      }
    } catch (e) {}
  }

  window.addEventListener('storage', function(e) {
    if (e.key === 'ww_theme' || e.key === 'ww_custom_theme' || e.key === 'ww_font_size') {
      console.log('🔄 [Admin] Tema değişikliği algılandı (storage):', e.key);
      applyThemeFromStorage();
    }
  });

  document.addEventListener('themeChanged', function(e) {
    console.log('🔄 [Admin] themeChanged event yakalandı');
    if (e.detail && e.detail.settings) {
      var settings = e.detail.settings;
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
  });

  console.log('✅ [Admin] Tema izleyici yüklendi!');
})();

console.log('🔥 admin-core.js YÜKLENDİ!');

var adminState = {
  currentTab: 'users',
  users: [],
  references: [],
  charts: {
    userChart: null,
    premiumChart: null
  },
  searchTimeout: null,
  currentImageFile: null
};

function showToast(msg, type) {
  type = type || 'success';
  try {
    var tc = document.getElementById('toast-container');
    if (!tc) return;
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    tc.appendChild(el);
    setTimeout(function() {
      if (el && el.parentNode) el.remove();
    }, 3500);
  } catch (e) {}
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    var d = new Date(iso);
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch(e) {
    return '—';
  }
}

function formatDateFull(iso) {
  if (!iso) return '—';
  try {
    var d = new Date(iso);
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch(e) {
    return '—';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"]/g, function(m) {
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
    return map[m] || m;
  });
}

function getInitials(name) {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
}

function switchPanel(panelId, clickedEl) {
  var panels = document.querySelectorAll('.admin-panel');
  panels.forEach(function(p) { p.classList.remove('active'); });
  
  var targetPanel = document.getElementById(panelId);
  if (targetPanel) targetPanel.classList.add('active');
  
  var sidebarItems = document.querySelectorAll('.sidebar-nav-item');
  sidebarItems.forEach(function(b) {
    b.classList.toggle('active', b.dataset.panel === panelId);
  });
  
  var tabItems = document.querySelectorAll('.admin-tab-btn');
  tabItems.forEach(function(b) {
    b.classList.toggle('active', b.dataset.panel === panelId);
  });
  
  var glow = document.getElementById('panel-glow');
  if (glow) {
    glow.className = 'panel-glow';
    if (panelId === 'panel-users') glow.classList.add('users-glow');
    else if (panelId === 'panel-references') glow.classList.add('references-glow');
    else if (panelId === 'panel-analytics') glow.classList.add('analytics-glow');
    else if (panelId === 'panel-prices') glow.classList.add('prices-glow');
  }
  
  if (panelId === 'panel-users' && typeof renderUsersTable === 'function') renderUsersTable();
  if (panelId === 'panel-references' && typeof renderReferencesTable === 'function') renderReferencesTable();
  if (panelId === 'panel-analytics' && typeof loadAnalyticsData === 'function') loadAnalyticsData();
  if (panelId === 'panel-prices' && typeof renderPricesContent === 'function') renderPricesContent();
}

function renderAdminPanel() {
  console.log('🔄 renderAdminPanel başladı...');
  var main = document.getElementById('main-content');
  if (!main) {
    console.error('❌ main-content bulunamadı!');
    return;
  }

  var icons = {
    users: '<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    clipboard: '<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
    'bar-chart-3': '<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    'dollar-sign': '<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    'refresh-cw': '<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    'package': '<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>',
    'zap': '<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'
  };

  var mobileTabs = '\n    <div class="admin-tabs-mobile" id="mobile-tabs">\n      <button class="admin-tab-btn active" data-panel="panel-users" onclick="switchPanel(\'panel-users\', this)">' + icons.users + ' Kullanıcılar</button>\n      <button class="admin-tab-btn" data-panel="panel-references" onclick="switchPanel(\'panel-references\', this)">' + icons.clipboard + ' Referanslar</button>\n      <button class="admin-tab-btn" data-panel="panel-analytics" onclick="switchPanel(\'panel-analytics\', this)">' + icons['bar-chart-3'] + ' İstatistikler</button>\n      <button class="admin-tab-btn" data-panel="panel-prices" onclick="switchPanel(\'panel-prices\', this)">' + icons['dollar-sign'] + ' Fiyat Yönetimi</button>\n    </div>\n  ';

  var sidebar = '\n    <aside class="admin-sidebar">\n      <div class="sidebar-header">\n        <div class="sidebar-avatar" id="admin-sidebar-avatar">\n          <span class="no-avatar">A</span>\n        </div>\n        <div class="sidebar-username" id="admin-sidebar-username">Admin</div>\n        <div class="sidebar-email" id="admin-sidebar-email">admin@example.com</div>\n      </div>\n      <nav class="sidebar-nav">\n        <button class="sidebar-nav-item active" data-panel="panel-users" onclick="switchPanel(\'panel-users\', this)">\n          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>\n          Kullanıcılar\n        </button>\n        <button class="sidebar-nav-item" data-panel="panel-references" onclick="switchPanel(\'panel-references\', this)">\n          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>\n          Referanslar\n        </button>\n        <button class="sidebar-nav-item" data-panel="panel-analytics" onclick="switchPanel(\'panel-analytics\', this)">\n          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>\n          İstatistikler\n        </button>\n        <div class="sidebar-nav-divider"></div>\n        <button class="sidebar-nav-item" data-panel="panel-prices" onclick="switchPanel(\'panel-prices\', this)">\n          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>\n          Fiyat Yönetimi\n        </button>\n      </nav>\n    </aside>\n  ';

  var panels = '\n    <div class="admin-panels">\n      <div class="panel-glow users-glow" id="panel-glow"></div>\n      \n      <div class="admin-panel active" id="panel-users">\n        <div class="s-card">\n          <div class="s-card-header">\n            <div class="header-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>\n            <div><h2>Kullanıcı Listesi</h2><p>Platformdaki tüm kullanıcılar — <strong id="user-count" style="color:var(--text);">…</strong> kayıt</p></div>\n            <div style="margin-left:auto;display:flex;gap:0.5rem;align-items:center;">\n              <div class="search-wrap">\n                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>\n                <input type="text" id="user-search" class="search-input" placeholder="Ara..." style="width:160px;" />\n              </div>\n              <button id="refresh-users-btn" class="btn btn-ghost btn-sm" onclick="loadUsers(); renderUsersTable();" style="display:inline-flex;align-items:center;gap:4px;">\n                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>\n                Yenile\n              </button>\n            </div>\n          </div>\n          <div class="s-card-body">\n            <div id="users-table-container"></div>\n          </div>\n        </div>\n      </div>\n\n      <div class="admin-panel" id="panel-references">\n        <div class="s-card">\n          <div class="s-card-header">\n            <div class="header-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>\n            <div><h2>Referans Yönetimi</h2><p>Anlaşma yapılan kişi ve kurumlar — <strong id="ref-count" style="color:var(--text);">' + adminState.references.length + '</strong> kayıt</p></div>\n            <button class="btn btn-primary btn-sm" id="add-reference-btn" style="margin-left:auto;padding:0.35rem 0.9rem;font-size:11px;display:inline-flex;align-items:center;gap:4px;">\n              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>\n              Yeni\n            </button>\n          </div>\n          <div class="s-card-body">\n            <div id="references-table-container"></div>\n          </div>\n        </div>\n      </div>\n\n      <div class="admin-panel" id="panel-analytics">\n        <div class="s-card">\n          <div class="s-card-header">\n            <div class="header-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div>\n            <div><h2>Platform İstatistikleri</h2><p>Son 7 günlük aktivite verileri ve premium satışları</p></div>\n          </div>\n          <div class="s-card-body">\n            <div class="stats-grid" id="analytics-stats">\n              <div class="stat-card"><div class="stat-label">Toplam Kullanıcı</div><div class="stat-value" id="stat-total-users">—</div></div>\n              <div class="stat-card"><div class="stat-label">Toplam Premium</div><div class="stat-value" id="stat-total-premium">—</div></div>\n              <div class="stat-card"><div class="stat-label">Premium Gelir (Toplam)</div><div class="stat-value" id="stat-premium-revenue">—</div></div>\n              <div class="stat-card"><div class="stat-label">Son 7 Gün Premium</div><div class="stat-value" id="stat-premium-7days">—</div></div>\n            </div>\n            <div class="charts-grid">\n              <div class="chart-card"><h3>Günlük Yeni Kullanıcılar (Son 7 Gün)</h3><div class="chart-wrap"><canvas id="usersChart"></canvas></div></div>\n              <div class="chart-card"><h3>Günlük Premium Satışları (Son 7 Gün) - $</h3><div class="chart-wrap"><canvas id="premiumChart"></canvas></div></div>\n              <div class="chart-card charts-grid-full">\n                <h3 style="display:flex;align-items:center;gap:6px;">\n                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>\n                  Son Premium Alan Kullanıcılar\n                </h3>\n                <div id="recent-premium-list" style="display:flex;flex-direction:column;gap:0.5rem;padding:0.5rem 0;"><div style="text-align:center;padding:1rem;color:var(--muted);font-size:13px;">Yükleniyor...</div></div>\n              </div>\n            </div>\n          </div>\n        </div>\n      </div>\n\n      <div class="admin-panel" id="panel-prices">\n        <div class="s-card">\n          <div class="s-card-header">\n            <div class="header-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>\n            <div><h2>Fiyat Yönetimi</h2><p>Premium plan fiyatlarını, indirimleri ve ödeme seçeneklerini yönetin.</p></div>\n          </div>\n          <div class="s-card-body">\n            <div id="prices-container"></div>\n          </div>\n        </div>\n      </div>\n    </div>\n  ';

  main.innerHTML = '\n    <div class="page-header">\n      <div>\n        <h1>Admin Panel</h1>\n        <p class="subtitle">Platform yönetimi ve analiz araçları</p>\n      </div>\n      <span class="admin-badge">\n        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>\n        ADMİN\n      </span>\n    </div>\n    ' + mobileTabs + '\n    <div class="admin-wrap">\n      ' + sidebar + '\n      ' + panels + '\n    </div>\n  ';

  console.log('✅ renderAdminPanel tamamlandı!');
  
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
      var { data: { user } } = await sb.auth.getUser();
      if (user) {
        var username = (user.user_metadata && user.user_metadata.username) || (user.email ? user.email.split('@')[0] : 'Admin');
        var usernameEl = document.getElementById('admin-sidebar-username');
        var emailEl = document.getElementById('admin-sidebar-email');
        if (usernameEl) usernameEl.textContent = username;
        if (emailEl) emailEl.textContent = user.email || '—';
        var { data: profile } = await sb.from('user_profiles').select('avatar_url').eq('id', user.id).single();
        var avatarEl = document.getElementById('admin-sidebar-avatar');
        if (avatarEl) {
          if (profile && profile.avatar_url) {
            avatarEl.innerHTML = '<img src="' + profile.avatar_url + '" alt="avatar">';
          } else {
            avatarEl.innerHTML = '<span class="no-avatar">' + username.charAt(0).toUpperCase() + '</span>';
          }
        }
      }
    } catch (e) {}
  })();

  if (typeof renderUsersTable === 'function') renderUsersTable();
  if (typeof renderReferencesTable === 'function') renderReferencesTable();
  if (typeof renderPricesContent === 'function') renderPricesContent();
  setTimeout(function() {
    if (typeof loadAnalyticsData === 'function') loadAnalyticsData();
  }, 500);
}

async function updatePlanBadge() {
  try {
    var badge = document.querySelector('.plan-badge');
    var text = document.querySelector('.plan-text');
    if (!badge || !text) return;
    
    var planData = await getUserPlan();
    var isPremium = planData.plan === 'premium';
    
    if (isPremium) {
      badge.classList.add('premium');
      text.textContent = 'Premium';
    } else {
      badge.classList.remove('premium');
      text.textContent = 'Ücretsiz';
    }
  } catch (e) {}
}

async function initAdmin() {
  try {
    console.log('🚀 Admin panel başlatılıyor...');
    
    if (typeof sb === 'undefined' || !sb) {
      console.error('❌ Supabase client (sb) tanımlı değil!');
      return;
    }
    
    var { data: { session } } = await sb.auth.getSession();
    if (!session) {
      console.warn('⚠️ Oturum yok, login sayfasına yönlendiriliyor...');
      window.location.href = 'login.html';
      return;
    }
    
    var user = session.user;
    console.log('👤 Kullanıcı:', user.email);
    
    var role = user.app_metadata?.role || user.user_metadata?.role;
    console.log('🎯 Rol:', role);
    
    if (role !== 'admin') {
      console.warn('⚠️ Admin yetkisi yok! role:', role);
      window.location.href = 'dashboard.html';
      return;
    }
    
    console.log('✅ Admin girişi başarılı:', user.email);

    await loadUsers();
    console.log('✅ Kullanıcılar yüklendi:', adminState.users.length);
    
    await loadReferences();
    console.log('✅ Referanslar yüklendi:', adminState.references.length);
    
    renderAdminPanel();
    
    setTimeout(updatePlanBadge, 500);
    
    if (typeof i18n !== 'undefined' && i18n.onChange) {
      i18n.onChange(function() {
        updatePlanBadge();
      });
    }
    
    console.log('✅ Admin panel başarıyla başlatıldı!');
  } catch (e) {
    console.error('❌ Admin init hatası:', e);
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

console.log('✅ admin-core.js yüklendi! initAdmin:', typeof window.initAdmin === 'function' ? '✅' : '❌');