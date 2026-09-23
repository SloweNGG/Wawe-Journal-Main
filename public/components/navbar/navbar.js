window.wwTogglePremium = function(e, btn) {
  e.preventDefault();
  e.stopPropagation();
  if (window.closeAllNavDropdowns) window.closeAllNavDropdowns('premium');
  var m = document.getElementById('premium-dropdown-menu');
  if(m) {
    btn.classList.toggle('active');
    m.classList.toggle('open');
  }
};

window.wwToggleBell = function(e, btn) {
  e.preventDefault();
  e.stopPropagation();
  if (window.closeAllNavDropdowns) window.closeAllNavDropdowns('bell');
  var p = document.getElementById('bell-panel');
  if(p) p.classList.toggle('open');
};

window.wwToggleJournal = function(e, btn) {
  e.preventDefault();
  e.stopPropagation();
  if (window.closeAllNavDropdowns) window.closeAllNavDropdowns('journal');
  var js = document.getElementById('nav-journal-switcher');
  if (js) js.classList.toggle('open');
};

window.closeMobileMenuAndNavigate = function(e, url) {
  if (e) e.preventDefault();
  var toggle = document.getElementById('nav-toggle');
  var menu = document.getElementById('nav-menu');
  var backdrop = document.getElementById('nav-backdrop');
  if (toggle) toggle.classList.remove('open');
  if (menu) menu.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
  document.body.style.overflow = '';
  if (url) window.location.href = url;
};

function t(key, fallback) {
  if (typeof i18n !== 'undefined' && i18n.t) {
    var val = i18n.t(key);
    return (val && val !== key) ? val : fallback;
  }
  return fallback;
}

wwLog.log('🧭 Navbar yükleniyor (CLIENT-SIDE RENDER)...');

var navbarRendered = false;
var cachedAvatarUrl = null;
var navEventsInitialized = false;

function sanitizeHTML(str) {
  if (!str) return '';
  var temp = document.createElement('div');
  temp.textContent = str;
  return temp.innerHTML;
}

function sanitizeURL(url) {
  if (!url) return '';
  try {
    var parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.href;
  } catch (e) {
    return '';
  }
}

function loadLucideIcons() {
  if (typeof lucide !== 'undefined') {
    try { lucide.createIcons(); } catch(e) {}
    return;
  }
  var script = document.createElement('script');
  script.src = 'https://unpkg.com/lucide@latest';
  script.defer = true;
  script.onload = function() {
    if (typeof lucide !== 'undefined') {
      try { lucide.createIcons(); } catch(e) {}
    }
  };
  document.head.appendChild(script);
}

function getNavbarHTML(translations) {
  var tt = function(key, fallback) {
    if (translations && translations[key] && translations[key] !== key) return translations[key];
    if (typeof i18n !== 'undefined' && typeof i18n.t === 'function') {
      var val = i18n.t(key);
      if (val && val !== key) return val;
    }
    return fallback || key;
  };

  var menuGeneral = tt('nav.menu_general') || 'GENEL';
  var menuPremium = tt('nav.menu_premium') || 'PREMIUM';
  var menuAccount = tt('nav.menu_account') || 'HESAP';

  return `
    <nav class="nav">
      <a href="/index.html" class="nav-logo" title="Wawe Journal - Ana Sayfa">
        <div class="logo-icon">
          <i data-lucide="trending-up" class="logo-icon-svg"></i>
        </div>
      </a>
      
      <div class="nav-links">
        <a href="/dashboard.html" data-i18n="nav.dashboard" data-page="dashboard">${tt('nav.dashboard', 'Dashboard')}</a>
        <a href="/trades.html" data-i18n="nav.trades" data-page="trades">${tt('nav.trades', 'İşlemler')}</a>
        <a href="/strategies.html" data-i18n="nav.strategies" data-page="strategies">${tt('nav.strategies', 'Stratejiler')}</a>
        <a href="/calendar.html" data-i18n="nav.calendar" data-page="calendar">${tt('nav.calendar', 'Takvim')}</a>
      </div>
      
      <div class="nav-right">
        <div class="nav-dropdown">
          <button class="nav-dropdown-btn" id="premium-dropdown-btn" onclick="wwTogglePremium(event, this)">
            <i data-lucide="crown" class="nav-icon" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.premium">${tt('nav.premium')}</span>
            <i data-lucide="chevron-down" class="dropdown-arrow" style="width:12px;height:12px;"></i>
          </button>
          <div class="nav-dropdown-menu" id="premium-dropdown-menu">
            <div class="menu-label" data-i18n="nav.premium_features">✨ Premium Özellikler</div>
            <a href="/premium-dashboard.html">
              <i data-lucide="layout-dashboard" class="premium-icon" style="width:16px;height:16px;"></i>
              <span data-i18n="nav.premium_dashboard">${tt('nav.premium_dashboard')}</span>
            </a>
            <a href="/settings.html#panel-appearance">
              <i data-lucide="palette" class="premium-icon" style="width:16px;height:16px;"></i>
              <span data-i18n="nav.theme_customization">${tt('nav.theme_customization')}</span>
            </a>
            <a href="/settings.html#panel-overtrade">
              <i data-lucide="bell" class="premium-icon" style="width:16px;height:16px;"></i>
              <span data-i18n="nav.overtrade_alert">${tt('nav.overtrade_alert')}</span>
            </a>
            <div class="dropdown-divider"></div>
            <a href="/settings.html#panel-plan" style="color:var(--accent); font-weight:700;">
              <i data-lucide="rocket" class="premium-icon" style="width:16px;height:16px;"></i>
              <span data-i18n="nav.upgrade_premium">${tt('nav.upgrade_premium')}</span>
            </a>
          </div>
        </div>

        <div class="nav-journal-switcher" id="nav-journal-switcher">
          <button class="journal-switch-btn" aria-haspopup="true" aria-expanded="false" onclick="wwToggleJournal(event, this)">
            <i data-lucide="folder" class="journal-icon"></i>
            <span class="journal-name">Ana Hesap</span>
            <svg class="journal-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="journal-dropdown" id="journal-dropdown"></div>
        </div>

        <div class="nav-bell-wrapper" id="nav-bell-wrapper">
          <button class="nav-bell-btn" id="overtrade-bell-btn" aria-label="Bildirimler" title="Bildirimler" onclick="wwToggleBell(event, this)">
            <i data-lucide="bell" style="width:18px;height:18px;"></i>
            <span class="bell-dot" id="bell-dot" style="display:none;"></span>
          </button>
          <div class="bell-panel" id="bell-panel">
            <div class="bell-panel-header">
              <h3 data-i18n="nav.notifications">🔔 ${tt('nav.notifications')}</h3>
              <div class="bell-panel-header-actions">
                <button class="bell-mark-read-btn" id="bell-mark-read-btn" style="display:none;" data-i18n="nav.mark_read">✓ ${tt('nav.mark_read')}</button>
                <button class="bell-panel-close" id="bell-panel-close">✕</button>
              </div>
            </div>
            <div class="bell-panel-body" id="bell-panel-body">
              <div class="bell-panel-empty">
                <span class="empty-icon">🔕</span>
                <span data-i18n="nav.no_notifications">${tt('nav.no_notifications')}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="plan-badge" id="plan-badge">
          <span class="plan-dot"></span>
          <span class="plan-text" id="plan-text">${tt('nav.free_badge') || 'Ücretsiz'}</span>
        </div>
        
        <div class="user-avatar" id="user-avatar">
          <span id="nav-avatar-text" style="font-size:13px;font-weight:600;">?</span>
        </div>
        
        <div class="dropdown-menu" id="dropdown-menu">
          <a href="/settings.html#panel-profile" class="dropdown-item" data-i18n="nav.profile">
            <i data-lucide="user" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.profile">${tt('nav.profile')}</span>
          </a>
          <a href="/settings.html" class="dropdown-item" data-i18n="nav.settings">
            <i data-lucide="settings" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.settings">${tt('nav.settings', 'Ayarlar')}</span>
          </a>
          <a href="/my-earnings.html" class="dropdown-item" data-i18n="nav.earnings">
            <i data-lucide="dollar-sign" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.earnings">${tt('nav.earnings', 'Kazançlarım')}</span>
          </a>
          <span id="admin-link" style="display:none;">
            <a href="/admin.html" class="dropdown-item" data-i18n="nav.admin">
              <i data-lucide="shield" style="width:16px;height:16px;"></i>
              <span data-i18n="nav.admin">${tt('nav.admin', 'Admin')}</span>
            </a>
          </span>
          <div class="dropdown-divider"></div>
          <a href="/settings.html#panel-plan" class="dropdown-item" style="color:var(--accent2);">
            <i data-lucide="crown" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.upgrade_premium">${tt('nav.upgrade_premium')}</span>
          </a>
          <div class="dropdown-divider"></div>
          <button class="dropdown-item" id="logout-dropdown-btn" data-i18n="nav.logout">
            <i data-lucide="log-out" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.logout">${tt('nav.logout', 'Çıkış Yap')}</span>
          </button>
        </div>
        
        <button class="nav-toggle" id="nav-toggle" aria-label="Menüyü aç">
          <span class="bar"></span><span class="bar"></span><span class="bar"></span>
        </button>
      </div>
    </nav>

    <div class="nav-backdrop" id="nav-backdrop"></div>
    <div class="nav-menu" id="nav-menu">
      <div class="nav-menu-inner">
        
        <div class="user-card" id="menu-user-card">
          <div class="user-card-avatar" id="menu-user-avatar">
            <span id="menu-avatar-text">?</span>
          </div>
          <div class="user-card-info">
            <div class="user-card-name" id="menu-user-name">Kullanıcı</div>
            <div class="user-card-plan" id="menu-user-plan">
              <span class="plan-dot"></span>
              <span class="plan-text">${tt('nav.free_badge') || 'Ücretsiz'}</span>
            </div>
          </div>
        </div>

        <a href="/journals.html" class="menu-journal-link" id="menu-journal-link" onclick="closeMobileMenuAndNavigate(event, '/journals.html')">
          <i data-lucide="folder" class="menu-journal-icon"></i>
          <span class="menu-journal-info">
            <span class="menu-journal-label">${tt('nav.current_account', 'Aktif Hesap')}</span>
            <span class="menu-journal-name" id="menu-journal-name">...</span>
          </span>
          <i data-lucide="chevron-right" class="menu-journal-arrow"></i>
        </a>

        <div class="menu-section">
          <div class="menu-section-title" data-i18n="nav.menu_general">${menuGeneral}</div>
          <a href="/index.html" data-i18n="nav.home">
            <i data-lucide="home" style="width:16px;height:16px;"></i> ${tt('nav.home')}
          </a>
          <a href="/dashboard.html" data-i18n="nav.dashboard">
            <i data-lucide="layout-dashboard" style="width:16px;height:16px;"></i> ${tt('nav.dashboard', 'Dashboard')}
          </a>
          <a href="/trades.html" data-i18n="nav.trades">
            <i data-lucide="list" style="width:16px;height:16px;"></i> ${tt('nav.trades', 'İşlemler')}
          </a>
          <a href="/strategies.html" data-i18n="nav.strategies">
            <i data-lucide="target" style="width:16px;height:16px;"></i> ${tt('nav.strategies', 'Stratejiler')}
          </a>
          <a href="/calendar.html" data-i18n="nav.calendar">
            <i data-lucide="calendar" style="width:16px;height:16px;"></i> ${tt('nav.calendar', 'Takvim')}
          </a>
        </div>

        <div class="menu-section">
          <div class="menu-section-title" data-i18n="nav.menu_premium">${menuPremium}</div>
          <a href="/premium-dashboard.html" data-i18n="nav.premium_dashboard">
            <i data-lucide="layout-dashboard" style="width:16px;height:16px;"></i> ${tt('nav.premium_dashboard')}
          </a>
          <a href="/settings.html#panel-appearance" data-i18n="nav.theme_customization">
            <i data-lucide="palette" style="width:16px;height:16px;"></i> ${tt('nav.theme_customization')}
          </a>
          <a href="/settings.html#panel-overtrade" data-i18n="nav.overtrade_alert">
            <i data-lucide="bell" style="width:16px;height:16px;"></i> ${tt('nav.overtrade_alert')}
          </a>
          <a href="/settings.html#panel-plan" class="go-premium" data-i18n="nav.upgrade_premium">
            <i data-lucide="rocket" style="width:16px;height:16px;"></i> ${tt('nav.upgrade_premium')}
          </a>
        </div>

        <div class="menu-section">
          <div class="menu-section-title" data-i18n="nav.menu_account">${menuAccount}</div>
          <a href="/settings.html#panel-profile" data-i18n="nav.profile">
            <i data-lucide="user" style="width:16px;height:16px;"></i> ${tt('nav.profile')}
          </a>
          <a href="/settings.html" data-i18n="nav.settings">
            <i data-lucide="settings" style="width:16px;height:16px;"></i> ${tt('nav.settings', 'Ayarlar')}
          </a>
          <a href="/my-earnings.html" data-i18n="nav.earnings">
            <i data-lucide="dollar-sign" style="width:16px;height:16px;"></i> ${tt('nav.earnings', 'Kazançlarım')}
          </a>
          <span id="admin-link-mobile" style="display:none;">
            <a href="/admin.html" data-i18n="nav.admin">
              <i data-lucide="shield" style="width:16px;height:16px;"></i> ${tt('nav.admin', 'Admin')}
            </a>
          </span>
          <button id="logout-btn-mobile" data-i18n="nav.logout">
            <i data-lucide="log-out" style="width:16px;height:16px;"></i> ${tt('nav.logout', 'Çıkış Yap')}
          </button>
        </div>

      </div>
    </div>
  `;
}

function updateNavbarI18n() {
  if (typeof i18n === 'undefined' || typeof i18n.t !== 'function') {
    return;
  }
  var textUpdates = [];
  var placeholderUpdates = [];
  var htmlUpdates = [];

  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    var translation = i18n.t(key);
    if (translation && translation !== key && el.textContent !== translation) {
      textUpdates.push({ el: el, translation: translation });
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
    var key = el.getAttribute('data-i18n-placeholder');
    var translation = i18n.t(key);
    if (translation && translation !== key && el.getAttribute('placeholder') !== translation) {
      placeholderUpdates.push({ el: el, translation: translation });
    }
  });

  document.querySelectorAll('[data-i18n-html]').forEach(function(el) {
    var key = el.getAttribute('data-i18n-html');
    var translation = i18n.t(key);
    if (translation && translation !== key && el.innerHTML !== translation) {
      htmlUpdates.push({ el: el, translation: sanitizeHTML(translation) });
    }
  });

  textUpdates.forEach(function(item) { item.el.textContent = item.translation; });
  placeholderUpdates.forEach(function(item) { item.el.setAttribute('placeholder', item.translation); });
  htmlUpdates.forEach(function(item) { item.el.innerHTML = item.translation; });

  updateNavbarBadgeSync();
}

function applyAvatarToNav(url) {
  var navAvatar = document.getElementById('user-avatar');
  var menuAvatar = document.getElementById('menu-user-avatar');
  var menuName = document.getElementById('menu-user-name');
  var user = window.SETTINGS_STATE?.currentUser || null;
  var fullName = user?.user_metadata?.username || user?.email || sessionStorage.getItem('ww_user_display_name') || 'Kullanıcı';
  var initial = fullName.charAt(0)?.toUpperCase() || '?';

  if (navAvatar) {
    if (url) {
      var safeUrl = sanitizeURL(url);
      if (safeUrl) {
        navAvatar.innerHTML = '<img src="' + safeUrl + '?t=' + Date.now() + '" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
        navAvatar.style.background = 'transparent';
      } else {
        navAvatar.innerHTML = '<span id="nav-avatar-text" style="font-size:13px;font-weight:600;">' + sanitizeHTML(initial) + '</span>';
        navAvatar.style.background = 'var(--surface2)';
      }
    } else {
      navAvatar.innerHTML = '<span id="nav-avatar-text" style="font-size:13px;font-weight:600;">' + sanitizeHTML(initial) + '</span>';
      navAvatar.style.background = 'var(--surface2)';
    }
  }

  if (menuAvatar) {
    if (url) {
      var safeUrl2 = sanitizeURL(url);
      if (safeUrl2) {
        menuAvatar.innerHTML = '<img src="' + safeUrl2 + '?t=' + Date.now() + '" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
        menuAvatar.style.background = 'transparent';
      } else {
        menuAvatar.innerHTML = '<span id="menu-avatar-text" style="font-size:20px;font-weight:600;">' + sanitizeHTML(initial) + '</span>';
        menuAvatar.style.background = 'var(--surface2)';
      }
    } else {
      menuAvatar.innerHTML = '<span id="menu-avatar-text" style="font-size:20px;font-weight:600;">' + sanitizeHTML(initial) + '</span>';
      menuAvatar.style.background = 'var(--surface2)';
    }
  }

  if (menuName) {
    var displayName = fullName;
    if (displayName && displayName.includes('@')) displayName = displayName.split('@')[0];
    menuName.textContent = displayName || 'Kullanıcı';
  }
}

async function loadNavbarAvatar() {
  try {
    var sb = window.sb || window.supabase;
    if (!sb) return;

    var storedDisplayName = sessionStorage.getItem('ww_user_display_name');
    var storedAvatar = sessionStorage.getItem('ww_avatar_url');
    var storedTime = sessionStorage.getItem('ww_avatar_time');
    var now = Date.now();

    if (storedDisplayName) {
      if (!window.SETTINGS_STATE) window.SETTINGS_STATE = {};
      if (!window.SETTINGS_STATE.currentUser) {
        window.SETTINGS_STATE.currentUser = { user_metadata: { username: storedDisplayName } };
      }
    }

    if (storedTime && (now - parseInt(storedTime, 10)) < 300000) {
      var av = (storedAvatar && storedAvatar !== 'none') ? storedAvatar : null;
      cachedAvatarUrl = av;
      applyAvatarToNav(av);
      return;
    }

    var sb = window.sb || window.supabase;
    if (!sb) return;

    var sessionRes = await sb.auth.getSession();
    var user = sessionRes?.data?.session?.user;
    if (!user) return;

    if (!window.SETTINGS_STATE) window.SETTINGS_STATE = {};
    window.SETTINGS_STATE.currentUser = user;

    var displayName = user?.user_metadata?.username || user?.email || 'Kullanıcı';
    if (displayName) sessionStorage.setItem('ww_user_display_name', displayName);

    var avatarUrl = null;
    if (window.__wwUserProfile && window.__wwUserProfile.id === user.id) {
      avatarUrl = window.__wwUserProfile.avatar_url || null;
    } else {
      var { data: profile } = await sb.from('user_profiles').select('avatar_url').eq('id', user.id).single();
      avatarUrl = profile?.avatar_url || null;
    }

    cachedAvatarUrl = avatarUrl;
    sessionStorage.setItem('ww_avatar_url', avatarUrl || 'none');
    sessionStorage.setItem('ww_avatar_time', String(now));
    applyAvatarToNav(avatarUrl);
  } catch (e) {
    var fallbackAvatar = sessionStorage.getItem('ww_avatar_url');
    applyAvatarToNav((fallbackAvatar && fallbackAvatar !== 'none') ? fallbackAvatar : null);
  }
}

function updateBadgeUI(isPremium) {
  var badge = document.getElementById('plan-badge');
  var text = document.getElementById('plan-text');
  var menuPlan = document.getElementById('menu-user-plan');

  if (window.SETTINGS_STATE) window.SETTINGS_STATE.isPremium = isPremium;

  if (badge) {
    if (isPremium) badge.classList.add('premium');
    else badge.classList.remove('premium');
  }

  var premiumText = t('nav.premium_badge', 'Premium');
  var freeText = t('nav.free_badge', 'Free');

  if (text) text.textContent = isPremium ? premiumText : freeText;

  if (menuPlan) {
    var dot = menuPlan.querySelector('.plan-dot');
    var planTextEl = menuPlan.querySelector('.plan-text');
    if (dot) {
      if (isPremium) {
        dot.style.background = 'var(--accent2)';
        dot.style.boxShadow = '0 0 8px rgba(139,92,246,0.4)';
      } else {
        dot.style.background = 'var(--green)';
        dot.style.boxShadow = 'none';
      }
    }
    if (planTextEl) {
      planTextEl.textContent = isPremium ? premiumText : freeText;
      planTextEl.style.color = isPremium ? 'var(--accent2)' : 'var(--green)';
    }
  }
}

async function updateNavbarBadge() {
  try {
    var badge = document.getElementById('plan-badge');
    var text = document.getElementById('plan-text');
    if (!badge || !text) return;

    var now = Date.now();
    var storedPlan = sessionStorage.getItem('ww_user_plan');
    var storedPlanTime = sessionStorage.getItem('ww_user_plan_time');
    if (storedPlan && storedPlanTime && (now - parseInt(storedPlanTime, 10)) < 300000) {
      updateBadgeUI(storedPlan === 'premium');
      return;
    }

    if (window.__wwUserProfile && window.__wwUserProfile.plan) {
      var isPrem = window.__wwUserProfile.plan === 'premium';
      sessionStorage.setItem('ww_user_plan', isPrem ? 'premium' : 'free');
      sessionStorage.setItem('ww_user_plan_time', String(now));
      updateBadgeUI(isPrem);
      return;
    }

    var sb = window.sb || window.supabase;
    if (!sb) { updateNavbarBadgeSync(); return; }

    var sessionRes = await sb.auth.getSession();
    var user = sessionRes?.data?.session?.user;
    if (!user) { updateNavbarBadgeSync(); return; }

    var { data: profile } = await sb.from('user_profiles').select('plan').eq('id', user.id).single();
    var isPremium = profile?.plan === 'premium';

    try {
      sessionStorage.setItem('ww_user_plan', isPremium ? 'premium' : 'free');
      sessionStorage.setItem('ww_user_plan_time', String(Date.now()));
    } catch (e) {}

    updateBadgeUI(isPremium);
  } catch (e) {
    var fallbackPlan = sessionStorage.getItem('ww_user_plan');
    if (fallbackPlan) updateBadgeUI(fallbackPlan === 'premium');
    else updateNavbarBadgeSync();
  }
}

function updateNavbarBadgeSync() {
  try {
    var badge = document.getElementById('plan-badge');
    var text = document.getElementById('plan-text');
    if (!badge || !text) return;
    var isPremium = window.SETTINGS_STATE?.isPremium || false;
    updateBadgeUI(isPremium);
  } catch (e) {}
}

function setActiveNavLink() {
  var currentPath = window.location.pathname;
  var navLinks = document.querySelectorAll('.nav-links a, .nav-menu-inner a');

  navLinks.forEach(function(link) { link.classList.remove('active'); });

  navLinks.forEach(function(link) {
    var href = link.getAttribute('href');
    if (!href) return;

    if (currentPath === '/' || currentPath === '/index.html') {
      if (href === '/index.html' || href === '/') { link.classList.add('active'); return; }
    }
    if (currentPath.includes('/dashboard') && href === '/dashboard.html') { link.classList.add('active'); return; }
    if (currentPath.includes('/trades') && href === '/trades.html') { link.classList.add('active'); return; }
    if (currentPath.includes('/strategies') && href === '/strategies.html') { link.classList.add('active'); return; }
    if (currentPath.includes('/calendar') && href === '/calendar.html') { link.classList.add('active'); return; }
    if (currentPath.includes('/journals') && href === '/journals.html') { link.classList.add('active'); return; }
    if (currentPath.includes('/settings') && href === '/settings.html') { link.classList.add('active'); return; }
    if (currentPath.includes('/premium-dashboard') && href === '/premium-dashboard.html') { link.classList.add('active'); return; }
    if (currentPath.includes('/admin') && href === '/admin.html') { link.classList.add('active'); return; }
    if (href === currentPath) { link.classList.add('active'); return; }
  });
}

var avatarDropdownInitialized = false;

function setupAvatarDropdown() {
  if (avatarDropdownInitialized) return;
  avatarDropdownInitialized = true;

  document.addEventListener('click', function(e) {
    var avatar = document.getElementById('user-avatar');
    var dropdown = document.getElementById('dropdown-menu');
    if (!avatar || !dropdown) return;

    if (e.target && e.target.closest && e.target.closest('#user-avatar')) {
      e.preventDefault();
      if (window.closeAllNavDropdowns) window.closeAllNavDropdowns('avatar');
      dropdown.classList.toggle('show');
      return;
    }
    if (e.target && e.target.closest && !e.target.closest('#dropdown-menu')) {
      dropdown.classList.remove('show');
    }
  }, true);

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var dropdown = document.getElementById('dropdown-menu');
      if (dropdown) dropdown.classList.remove('show');
    }
  });
}

function closeAllNavDropdowns(except) {
  // Premium dropdown
  if (except !== 'premium') {
    var p = document.getElementById('premium-dropdown-menu');
    var pb = document.getElementById('premium-dropdown-btn');
    if (p) p.classList.remove('open');
    if (pb) pb.classList.remove('active');
  }
  // Bell panel
  if (except !== 'bell') {
    var bell = document.getElementById('bell-panel');
    if (bell) bell.classList.remove('open');
  }
  // Journal switcher
  if (except !== 'journal') {
    var js = document.getElementById('nav-journal-switcher');
    if (js) js.classList.remove('open');
  }
  // Avatar dropdown
  if (except !== 'avatar') {
    var av = document.getElementById('dropdown-menu');
    if (av) av.classList.remove('show');
  }
}
window.closeAllNavDropdowns = closeAllNavDropdowns;

// ============================================================
// ⭐ FIX: initNavEvents — butonlara event listener EKLEMİYORUZ.
// Inline onclick (HTML'de) tek handler olarak kalıyor.
// Böylece çift fire problemi çözüldü.
// ============================================================
function initNavEvents() {
  wwLog.log('🔗 Navbar event\'leri bağlanıyor...');

  // Journal change → dropdown'u yenile
  if (!window._journalChangedBound) {
    window._journalChangedBound = true;
    document.addEventListener('journal-changed', function() { updateNavbarJournal(0); });
  }

  // Global: Journal switcher dışına tıklanınca kapat
  if (!window._journalSwitcherDocBound) {
    window._journalSwitcherDocBound = true;
    document.addEventListener('click', function(e) {
      var js = document.getElementById('nav-journal-switcher');
      if (js && e.target && !e.target.closest('#nav-journal-switcher')) {
        js.classList.remove('open');
      }
    });
  }

  // Global: Premium dropdown dışına tıklanınca kapat
  if (!window._premiumDdGlobalBound) {
    window._premiumDdGlobalBound = true;
    document.addEventListener('click', function(e) {
      var m = document.getElementById('premium-dropdown-menu');
      var b = document.getElementById('premium-dropdown-btn');
      if (m && b && e.target) {
        if (!e.target.closest('#premium-dropdown-menu') && !e.target.closest('#premium-dropdown-btn')) {
          b.classList.remove('active');
          m.classList.remove('open');
        }
      }
    });
  }

  // Global: Bell panel dışına tıklanınca kapat
  if (!window._bellGlobalBound) {
    window._bellGlobalBound = true;
    document.addEventListener('click', function(e) {
      var panel = document.getElementById('bell-panel');
      var b = document.getElementById('overtrade-bell-btn');
      if (panel && b && e.target) {
        if (!e.target.closest('#bell-panel') && !e.target.closest('#overtrade-bell-btn')) {
          panel.classList.remove('open');
        }
      }
    });
  }

  loadLucideIcons();
  setupAvatarDropdown();

  // Bell kapatma butonu
  var bellClose = document.getElementById('bell-panel-close');
  if (bellClose && !bellClose._bound) {
    bellClose._bound = true;
    bellClose.addEventListener('click', function(e) {
      e.stopPropagation();
      var panel = document.getElementById('bell-panel');
      if (panel) panel.classList.remove('open');
    });
  }

  // Logout dropdown butonu
  var logoutBtn = document.getElementById('logout-dropdown-btn');
  if (logoutBtn && !logoutBtn._bound) {
    logoutBtn._bound = true;
    logoutBtn.addEventListener('click', async function(e) {
      e.preventDefault();
      var sb = window.sb || window.supabase;
      if (sb) await sb.auth.signOut();
      localStorage.removeItem('ww_last_active_push');
      try {
        sessionStorage.removeItem('ww_user_plan');
        sessionStorage.removeItem('ww_avatar_url');
        sessionStorage.removeItem('ww_user_display_name');
        sessionStorage.removeItem('ww_active_journal_id');
      } catch(e) {}
      window.location.href = '/index.html';
    });
  }

  // Hamburger menü
  var toggle = document.getElementById('nav-toggle');
  var menu = document.getElementById('nav-menu');
  var backdrop = document.getElementById('nav-backdrop');

  if (toggle && menu && backdrop && !toggle._bound) {
    toggle._bound = true;
    toggle.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var isOpen = this.classList.toggle('open');
      menu.classList.toggle('open');
      backdrop.classList.toggle('open');
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    backdrop.addEventListener('click', function() {
      toggle.classList.remove('open');
      menu.classList.remove('open');
      backdrop.classList.remove('open');
      document.body.style.overflow = '';
    });
  }

  // Mobil logout
  var logoutMobile = document.getElementById('logout-btn-mobile');
  if (logoutMobile && !logoutMobile._bound) {
    logoutMobile._bound = true;
    logoutMobile.addEventListener('click', function(e) {
      e.preventDefault();
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

  navEventsInitialized = true;
  wwLog.log('✅ Navbar event\'leri bağlandı!');
}

function loadNavbar(containerId) {
  var container = document.getElementById(containerId);
  if (!container) {
    console.error('❌ Navbar container bulunamadı:', containerId);
    return;
  }

  if (navbarRendered) {
    setTimeout(function() {
      updateNavbarI18n();
      loadNavbarAvatar();
      updateNavbarBadge();
      setActiveNavLink();
      loadLucideIcons();
      initNavEvents();
      updateNavbarJournal(0);
    }, 50);
    return;
  }

  var translations = {};
  if (typeof i18n !== 'undefined' && typeof i18n.t === 'function') {
    var navbarKeys = [
      'nav.dashboard', 'nav.trades', 'nav.strategies', 'nav.calendar', 'nav.admin', 'nav.journals',
      'nav.premium', 'nav.premium_dashboard', 'nav.theme_customization', 'nav.overtrade_alert',
      'nav.upgrade_premium', 'nav.notifications', 'nav.mark_read', 'nav.no_notifications',
      'nav.profile', 'nav.settings', 'nav.logout', 'nav.home', 'nav.premium_badge',
      'nav.free_badge', 'nav.menu_general', 'nav.menu_premium', 'nav.menu_account'
    ];
    navbarKeys.forEach(function(key) { translations[key] = i18n.t(key); });
  }

  container.innerHTML = getNavbarHTML(translations);
  navbarRendered = true;

  requestAnimationFrame(function() {
    setActiveNavLink();
    document.querySelectorAll('.nav-links a').forEach(function(link) {
      link.classList.add('loaded');
    });
  });

  setTimeout(function() {
    initNavEvents();
    loadNavbarAvatar();
    updateNavbarBadge();
    updateNavbarJournal(0);
    wwLog.log('✅ Navbar tamamen yüklendi!');
  }, 50);
}

document.addEventListener('DOMContentLoaded', function() {
  var container = document.getElementById('navbar-container');
  if (container && container.children.length > 0) {
    navbarRendered = true;
    setTimeout(function() {
      initNavEvents();
      loadNavbarAvatar();
      updateNavbarBadge();
      setActiveNavLink();
      loadLucideIcons();
      updateNavbarJournal(0);
    }, 50);
  } else if (container) {
    loadNavbar('navbar-container');
  }

  window.addEventListener('hashchange', function() {
    var toggle = document.getElementById('nav-toggle');
    var menu = document.getElementById('nav-menu');
    var backdrop = document.getElementById('nav-backdrop');
    if (toggle) toggle.classList.remove('open');
    if (menu) menu.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(setActiveNavLink, 50);
  });

  window.addEventListener('popstate', function() {
    setTimeout(setActiveNavLink, 50);
  });

  window.addEventListener('load', function() {
    setTimeout(setActiveNavLink, 100);
    setTimeout(updateNavbarBadge, 150);
    loadLucideIcons();
    setTimeout(initNavEvents, 200);
  });

  window.addEventListener('storage', function(e) {
    if (e.key === 'ww_language' && e.newValue) {
      setTimeout(function() {
        updateNavbarI18n();
        updateNavbarBadgeSync();
        loadLucideIcons();
        initNavEvents();
      }, 100);
    }
  });
});

window.setActiveNavLink = setActiveNavLink;
window.updateNavbarI18n = updateNavbarI18n;
window.updateNavbarBadge = updateNavbarBadge;
window.updateNavbarBadgeSync = updateNavbarBadgeSync;
window.loadNavbar = loadNavbar;
window.sanitizeHTML = sanitizeHTML;
window.sanitizeURL = sanitizeURL;
window.loadLucideIcons = loadLucideIcons;
window.initNavEvents = initNavEvents;

window.refreshNavbar = function() {
  updateNavbarI18n();
  updateNavbarBadgeSync();
  setActiveNavLink();
  loadNavbarAvatar();
  loadLucideIcons();
  initNavEvents();
};

wwLog.log('✅ navbar.js yüklendi! (CLIENT-SIDE RENDER + AVATAR CACHE + FRESH BADGE)');

// ============================================================
// updateNavbarJournal — retry mekanizması + window.journal guard
// ============================================================
async function updateNavbarJournal(retries) {
  retries = retries || 0;
  try {
    if (!window.journal) {
      if (retries < 15) {
        setTimeout(function() { updateNavbarJournal(retries + 1); }, 200);
      }
      return;
    }

    var switcher = document.getElementById('nav-journal-switcher');
    var wasOpen = switcher ? switcher.classList.contains('open') : false;
    var activeId = window.journal.getActiveJournalId();
    var journals = await window.journal.listJournals();
    if (!journals || journals.length === 0) return;

    var activeJ = journals.find(function(j) { return j.id === activeId; });
    if (!activeJ) activeJ = journals.find(function(j) { return j.is_default; }) || journals[0];

    var swName = document.querySelector('.nav-journal-switcher .journal-name');
    var swIcon = document.querySelector('.nav-journal-switcher .journal-icon');
    if (swName) swName.textContent = activeJ.name;
    if (swIcon) swIcon.setAttribute('data-lucide', activeJ.icon || 'folder');

    // Mobil menü göstergesi
    var menuJournalName = document.getElementById('menu-journal-name');
    if (menuJournalName && activeJ) menuJournalName.textContent = activeJ.name;
    
    var menuJournalIcon = document.querySelector('.menu-journal-icon');
    if (menuJournalIcon && activeJ) {
      menuJournalIcon.setAttribute('data-lucide', activeJ.icon || 'folder');
      menuJournalIcon.style.color = activeJ.color || 'var(--accent)';
    }

    var dropdown = document.getElementById('journal-dropdown');
    if (dropdown) {
      var swTitle = t('journal.switcher_title', 'Hesaplar');
      var html = '<div class="journal-dropdown-header">' + swTitle + '</div>';

      journals.forEach(function(j) {
        var isActive = (j.id === activeJ.id) ? 'active' : '';
        var tradesTxt = (j.trade_count || 0) + ' işlem';
        html += '<button class="journal-item ' + isActive + '" data-id="' + j.id + '">' +
          '<i data-lucide="' + (j.icon || 'folder') + '" class="journal-icon" style="color:' + (j.color || '#7c6dfa') + '"></i>' +
          '<span class="journal-info">' +
            '<span class="journal-name" style="font-family:\'Syne\',sans-serif;font-weight:600;">' + j.name + '</span>' +
            '<span class="journal-count">' + tradesTxt + '</span>' +
          '</span>' +
          '<i data-lucide="check" class="journal-check"></i>' +
        '</button>';
      });

      var manageTxt = t('journal.manage', 'Hesapları Yönet');
      html += '<div class="journal-dropdown-footer"><a href="/journals.html"><i data-lucide="settings" style="width:14px;height:14px;margin-right:6px;"></i> ' + manageTxt + ' →</a></div>';
      dropdown.innerHTML = html;

      dropdown.querySelectorAll('.journal-item').forEach(function(btn) {
        btn.onclick = function(e) {
          e.stopPropagation();
          var id = btn.dataset.id;
          if (id !== activeJ.id) {
            window.journal.setActiveJournalId(id);
            if (window.location.pathname.includes('/journals')) {
              window.location.href = '/dashboard.html';
            } else {
              window.location.reload();
            }
          }
          var sw = document.getElementById('nav-journal-switcher');
          if (sw) sw.classList.remove('open');
        };
      });
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
    if (wasOpen && switcher) switcher.classList.add('open');
  } catch (err) {
    if (typeof wwLog !== 'undefined') wwLog.error('updateNavbarJournal err', err);
  }
}

window.updateNavbarJournal = updateNavbarJournal;