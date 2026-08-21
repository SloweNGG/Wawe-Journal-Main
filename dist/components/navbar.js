// ============================================================
// NAVBAR.JS - GÜVENLİK GÜNCELLEMESİ (XSS KORUMALI)
// FONT OYNAMALARI DÜZELTİLDİ - BATCH i18n GÜNCELLEMESİ
// ⭐ AKTİF LİNK FLASH ÖNLENDİ - requestAnimationFrame KULLANIMI
// LUCIDE ICONS + AVATAR DROPDOWN FİX
// ============================================================

console.log('🧭 Navbar yükleniyor (GÜVENLİK GÜNCELLENDİ - FONT SABİT - AKTİF LİNK HIZLI)...');

// ============================================================
// ⭐ GÜVENLİK: HTML SANITIZE
// ============================================================
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

// ============================================================
// ⭐ NAVBAR HTML - i18n ETİKETLERİ İLE + LUCIDE ICONS
// ============================================================
function getNavbarHTML(translations) {
  // ⭐ Eğer translations varsa, direkt kullan, yoksa i18n'den al
  var t = function(key) {
    if (translations && translations[key]) return translations[key];
    if (typeof i18n !== 'undefined' && typeof i18n.t === 'function') {
      return i18n.t(key);
    }
    return key;
  };

  return `
    <nav class="nav">
      <a href="/index.html" class="nav-logo" title="Wawe Journal - Ana Sayfa">
        <div class="logo-icon">
          <i data-lucide="trending-up" class="logo-icon-svg"></i>
        </div>
      </a>
      
      <div class="nav-links">
        <a href="/dashboard.html" data-i18n="nav.dashboard" data-page="dashboard">${t('nav.dashboard')}</a>
        <a href="/trades.html" data-i18n="nav.trades" data-page="trades">${t('nav.trades')}</a>
        <a href="/strategies.html" data-i18n="nav.strategies" data-page="strategies">${t('nav.strategies')}</a>
        <a href="/calendar.html" data-i18n="nav.calendar" data-page="calendar">${t('nav.calendar')}</a>
        <span id="admin-link" style="display:none;"><a href="/admin.html" data-i18n="nav.admin" data-page="admin">${t('nav.admin')}</a></span>
      </div>
      
      <div class="nav-right">
        <!-- ⭐ PREMIUM DROPDOWN -->
        <div class="nav-dropdown">
          <button class="nav-dropdown-btn" id="premium-dropdown-btn">
            <i data-lucide="crown" class="nav-icon" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.premium">${t('nav.premium')}</span>
            <i data-lucide="chevron-down" class="dropdown-arrow" style="width:12px;height:12px;"></i>
          </button>
          <div class="nav-dropdown-menu" id="premium-dropdown-menu">
            <div class="menu-label" data-i18n="nav.premium_features">✨ Premium Özellikler</div>
            <a href="/premium-dashboard.html">
              <i data-lucide="layout-dashboard" class="premium-icon" style="width:16px;height:16px;"></i>
              <span data-i18n="nav.premium_dashboard">${t('nav.premium_dashboard')}</span>
            </a>
            <a href="/settings/index.html#panel-appearance">
              <i data-lucide="palette" class="premium-icon" style="width:16px;height:16px;"></i>
              <span data-i18n="nav.theme_customization">${t('nav.theme_customization')}</span>
            </a>
            <a href="/settings/index.html#panel-overtrade">
              <i data-lucide="bell" class="premium-icon" style="width:16px;height:16px;"></i>
              <span data-i18n="nav.overtrade_alert">${t('nav.overtrade_alert')}</span>
            </a>
            <div class="dropdown-divider"></div>
            <a href="/settings/index.html#panel-plan" style="color:var(--accent); font-weight:700;">
              <i data-lucide="rocket" class="premium-icon" style="width:16px;height:16px;"></i>
              <span data-i18n="nav.upgrade_premium">${t('nav.upgrade_premium')}</span>
            </a>
          </div>
        </div>

        <!-- ⭐ BİLDİRİM ÇANI -->
        <div class="nav-bell-wrapper" id="nav-bell-wrapper">
          <button class="nav-bell-btn" id="overtrade-bell-btn" aria-label="Bildirimler" title="Bildirimler">
            <i data-lucide="bell" style="width:18px;height:18px;"></i>
            <span class="bell-dot" id="bell-dot" style="display:none;"></span>
          </button>
          <div class="bell-panel" id="bell-panel">
            <div class="bell-panel-header">
              <h3 data-i18n="nav.notifications">🔔 ${t('nav.notifications')}</h3>
              <div class="bell-panel-header-actions">
                <button class="bell-mark-read-btn" id="bell-mark-read-btn" style="display:none;" data-i18n="nav.mark_read">✓ ${t('nav.mark_read')}</button>
                <button class="bell-panel-close" id="bell-panel-close">✕</button>
              </div>
            </div>
            <div class="bell-panel-body" id="bell-panel-body">
              <div class="bell-panel-empty">
                <span class="empty-icon">🔕</span>
                <span data-i18n="nav.no_notifications">${t('nav.no_notifications')}</span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- ⭐ PLAN BADGE -->
        <div class="plan-badge" id="plan-badge">
          <span class="plan-dot"></span>
          <span class="plan-text" id="plan-text">${t('nav.free_badge') || 'Ücretsiz'}</span>
        </div>
        
        <!-- ⭐ USER AVATAR -->
        <div class="user-avatar" id="user-avatar">
          <span id="nav-avatar-text" style="font-size:13px;font-weight:600;">?</span>
        </div>
        
        <!-- ⭐ DROPDOWN MENU -->
        <div class="dropdown-menu" id="dropdown-menu">
          <a href="/settings/index.html#panel-profile" class="dropdown-item" data-i18n="nav.profile">
            <i data-lucide="user" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.profile">${t('nav.profile')}</span>
          </a>
          <a href="/settings/index.html" class="dropdown-item" data-i18n="nav.settings">
            <i data-lucide="settings" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.settings">${t('nav.settings')}</span>
          </a>
          <div class="dropdown-divider"></div>
          <a href="/settings/index.html#panel-plan" class="dropdown-item" style="color:var(--accent2);">
            <i data-lucide="crown" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.upgrade_premium">${t('nav.upgrade_premium')}</span>
          </a>
          <div class="dropdown-divider"></div>
          <button class="dropdown-item" id="logout-dropdown-btn" data-i18n="nav.logout">
            <i data-lucide="log-out" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.logout">${t('nav.logout')}</span>
          </button>
        </div>
        
        <!-- ⭐ MOBILE TOGGLE -->
        <button class="nav-toggle" id="nav-toggle" aria-label="Menüyü aç">
          <span class="bar"></span><span class="bar"></span><span class="bar"></span>
        </button>
      </div>
    </nav>

    <!-- ⭐ MOBILE MENU -->
    <div class="nav-backdrop" id="nav-backdrop"></div>
    <div class="nav-menu" id="nav-menu">
      <div class="nav-menu-inner">
        <a href="/index.html" data-i18n="nav.home">
          <i data-lucide="home" style="width:16px;height:16px;"></i> ${t('nav.home')}
        </a>
        <a href="/dashboard.html" data-i18n="nav.dashboard">
          <i data-lucide="layout-dashboard" style="width:16px;height:16px;"></i> ${t('nav.dashboard')}
        </a>
        <a href="/trades.html" data-i18n="nav.trades">
          <i data-lucide="list" style="width:16px;height:16px;"></i> ${t('nav.trades')}
        </a>
        <a href="/strategies.html" data-i18n="nav.strategies">
          <i data-lucide="target" style="width:16px;height:16px;"></i> ${t('nav.strategies')}
        </a>
        <a href="/calendar.html" data-i18n="nav.calendar">
          <i data-lucide="calendar" style="width:16px;height:16px;"></i> ${t('nav.calendar')}
        </a>
        
        <div class="nav-divider"></div>
        
        <div class="mobile-premium-label" data-i18n="nav.premium">💎 ${t('nav.premium')}</div>
        <a href="/premium-dashboard.html" data-i18n="nav.premium_dashboard">
          <i data-lucide="layout-dashboard" style="width:16px;height:16px;"></i> ${t('nav.premium_dashboard')}
        </a>
        <a href="/settings/index.html#panel-appearance" data-i18n="nav.theme_customization">
          <i data-lucide="palette" style="width:16px;height:16px;"></i> ${t('nav.theme_customization')}
        </a>
        <a href="/settings/index.html#panel-overtrade" data-i18n="nav.overtrade_alert">
          <i data-lucide="bell" style="width:16px;height:16px;"></i> ${t('nav.overtrade_alert')}
        </a>
        <a href="/settings/index.html#panel-plan" style="color:var(--accent); font-weight:700;" data-i18n="nav.upgrade_premium">
          <i data-lucide="rocket" style="width:16px;height:16px;"></i> ${t('nav.upgrade_premium')}
        </a>
        
        <span id="admin-link-mobile" style="display:none;"><a href="/admin.html" data-i18n="nav.admin">${t('nav.admin')}</a></span>
        <hr>
        
        <a href="/settings/index.html#panel-profile" data-i18n="nav.profile">
          <i data-lucide="user" style="width:16px;height:16px;"></i> ${t('nav.profile')}
        </a>
        <a href="/settings/index.html" data-i18n="nav.settings">
          <i data-lucide="settings" style="width:16px;height:16px;"></i> ${t('nav.settings')}
        </a>
        
        <hr>
        
        <button id="logout-btn-mobile" data-i18n="nav.logout">
          <i data-lucide="log-out" style="width:16px;height:16px;"></i> ${t('nav.logout')}
        </button>
      </div>
    </div>
  `;
}

// ============================================================
// ⭐ i18n METİNLERİNİ BATCH OLARAK GÜNCELLE - FONT OYNAMALARINI ÖNLE
// ============================================================
function updateNavbarI18n() {
  if (typeof i18n === 'undefined' || typeof i18n.t !== 'function') {
    console.warn('⚠️ i18n yüklenmemiş, metinler güncellenemiyor');
    return;
  }
  
  console.log('🌐 Navbar i18n metinleri batch olarak güncelleniyor... Mevcut dil:', i18n.getCurrentLanguage());
  
  // ⭐ Batch toplama - DOM değişikliklerini minimize et
  var textUpdates = [];
  var placeholderUpdates = [];
  var htmlUpdates = [];
  
  // ⭐ textContent güncellemeleri
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    var translation = i18n.t(key);
    if (translation && translation !== key && el.textContent !== translation) {
      textUpdates.push({ el: el, translation: translation });
    }
  });
  
  // ⭐ placeholder güncellemeleri
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
    var key = el.getAttribute('data-i18n-placeholder');
    var translation = i18n.t(key);
    if (translation && translation !== key && el.getAttribute('placeholder') !== translation) {
      placeholderUpdates.push({ el: el, translation: translation });
    }
  });
  
  // ⭐ innerHTML güncellemeleri (güvenli)
  document.querySelectorAll('[data-i18n-html]').forEach(function(el) {
    var key = el.getAttribute('data-i18n-html');
    var translation = i18n.t(key);
    if (translation && translation !== key && el.innerHTML !== translation) {
      htmlUpdates.push({ el: el, translation: sanitizeHTML(translation) });
    }
  });
  
  // ⭐ Tek seferde uygula - reflow'u minimize et
  if (textUpdates.length > 0) {
    textUpdates.forEach(function(item) {
      item.el.textContent = item.translation;
    });
  }
  
  if (placeholderUpdates.length > 0) {
    placeholderUpdates.forEach(function(item) {
      item.el.setAttribute('placeholder', item.translation);
    });
  }
  
  if (htmlUpdates.length > 0) {
    htmlUpdates.forEach(function(item) {
      item.el.innerHTML = item.translation;
    });
  }
  
  // ⭐ Badge'i güncelle (senkron)
  updateNavbarBadgeSync();
  
  var total = textUpdates.length + placeholderUpdates.length + htmlUpdates.length;
  console.log(`✅ Navbar i18n metinleri güncellendi! (${total} element, ${textUpdates.length} text, ${placeholderUpdates.length} placeholder, ${htmlUpdates.length} html)`);
}

// ============================================================
// ⭐ PLAN BADGE GÜNCELLE - SENKRON (GÜVENLİ)
// ============================================================
function updateNavbarBadgeSync() {
  try {
    var badge = document.getElementById('plan-badge');
    var text = document.getElementById('plan-text');
    if (!badge || !text) return;
    
    var isPremium = window.SETTINGS_STATE?.isPremium || false;
    
    if (isPremium) {
      badge.classList.add('premium');
    } else {
      badge.classList.remove('premium');
    }
    
    // ⭐ GÜVENLİ: Çeviri bulunamazsa mevcut metni koru
    var premiumText = (typeof i18n !== 'undefined' && typeof i18n.t === 'function') 
      ? i18n.t('nav.premium_badge') 
      : null;
    var freeText = (typeof i18n !== 'undefined' && typeof i18n.t === 'function') 
      ? i18n.t('nav.free_badge') 
      : null;
    
    // ⭐ GÜVENLİ: textContent ile
    if (isPremium) {
      text.textContent = premiumText || text.textContent || 'Premium';
    } else {
      text.textContent = freeText || text.textContent || 'Ücretsiz';
    }
    
  } catch (e) {
    // Sessizce geç
  }
}

// ============================================================
// ⭐ PLAN BADGE GÜNCELLE - ASENKRON (GÜVENLİ)
// ============================================================
async function updateNavbarBadge() {
  try {
    var badge = document.getElementById('plan-badge');
    var text = document.getElementById('plan-text');
    if (!badge || !text) return;
    
    var sb = window.sb || window.supabase;
    if (!sb) {
      updateNavbarBadgeSync();
      return;
    }
    
    var { data: { user } } = await sb.auth.getUser();
    if (!user) {
      updateNavbarBadgeSync();
      return;
    }
    
    var { data: profile } = await sb
      .from('user_profiles')
      .select('plan')
      .eq('id', user.id)
      .single();
    
    var isPremium = profile?.plan === 'premium';
    
    if (window.SETTINGS_STATE) {
      window.SETTINGS_STATE.isPremium = isPremium;
    }
    
    if (isPremium) {
      badge.classList.add('premium');
    } else {
      badge.classList.remove('premium');
    }
    
    // ⭐ GÜVENLİ: textContent ile
    var premiumText = (typeof i18n !== 'undefined' && typeof i18n.t === 'function') 
      ? i18n.t('nav.premium_badge') 
      : null;
    var freeText = (typeof i18n !== 'undefined' && typeof i18n.t === 'function') 
      ? i18n.t('nav.free_badge') 
      : null;
    
    if (isPremium) {
      text.textContent = premiumText || text.textContent || 'Premium';
    } else {
      text.textContent = freeText || text.textContent || 'Ücretsiz';
    }
    
  } catch (e) {
    updateNavbarBadgeSync();
  }
}

// ============================================================
// ⭐ AKTİF SAYFA LİNKİNİ BELİRLE - HIZLI VE OPTİMİZE
// ============================================================
function setActiveNavLink() {
  var currentPath = window.location.pathname;
  
  // ⭐ SADECE görünür linkleri bul (navbar içinde)
  var navLinks = document.querySelectorAll('.nav-links a, .nav-menu-inner a');
  
  // ⭐ Önce TÜM linklerden active sınıfını kaldır (hızlı)
  navLinks.forEach(function(link) {
    link.classList.remove('active');
  });
  
  // ⭐ Sonra DOĞRU linke active ekle
  var found = false;
  
  navLinks.forEach(function(link) {
    if (found) return;
    var href = link.getAttribute('href');
    if (!href) return;
    
    // Ana sayfa kontrolü
    if (currentPath === '/' || currentPath === '/index.html') {
      if (href === '/index.html' || href === '/') {
        link.classList.add('active');
        found = true;
        return;
      }
    }
    
    // Dashboard kontrolü
    if (currentPath === '/dashboard.html' || currentPath.includes('/dashboard')) {
      if (href === '/dashboard.html') {
        link.classList.add('active');
        found = true;
        return;
      }
    }
    
    // Trades kontrolü
    if (currentPath === '/trades.html' || currentPath.includes('/trades')) {
      if (href === '/trades.html') {
        link.classList.add('active');
        found = true;
        return;
      }
    }
    
    // Strategies kontrolü
    if (currentPath === '/strategies.html' || currentPath.includes('/strategies')) {
      if (href === '/strategies.html') {
        link.classList.add('active');
        found = true;
        return;
      }
    }
    
    // Calendar kontrolü
    if (currentPath === '/calendar.html' || currentPath.includes('/calendar')) {
      if (href === '/calendar.html') {
        link.classList.add('active');
        found = true;
        return;
      }
    }
    
    // Settings kontrolü
    if (currentPath.includes('/settings/')) {
      if (href === '/settings/index.html') {
        link.classList.add('active');
        found = true;
        return;
      }
    }
    
    // Premium Dashboard kontrolü
    if (currentPath === '/premium-dashboard.html' || currentPath.includes('/premium-dashboard')) {
      if (href === '/premium-dashboard.html') {
        link.classList.add('active');
        found = true;
        return;
      }
    }
    
    // Admin kontrolü
    if (currentPath === '/admin.html' || currentPath.includes('/admin')) {
      if (href === '/admin.html') {
        link.classList.add('active');
        found = true;
        return;
      }
    }
    
    // Fallback: href currentPath ile eşleşiyorsa
    if (href === currentPath) {
      link.classList.add('active');
      found = true;
      return;
    }
    
    // Fallback: href currentPath'in son kısmıyla eşleşiyorsa
    if (href !== '/' && currentPath.includes(href.replace('/', ''))) {
      link.classList.add('active');
      found = true;
      return;
    }
  });
}

// ============================================================
// ⭐ AVATAR YÜKLE (GÜVENLİ)
// ============================================================
async function loadNavbarAvatar() {
  try {
    var sb = window.sb || window.supabase;
    if (!sb) return;
    
    var { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    
    var { data: profile } = await sb
      .from('user_profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .single();
    
    var navAvatar = document.getElementById('user-avatar');
    if (!navAvatar) return;
    
    if (profile && profile.avatar_url) {
      // ⭐ GÜVENLİ: sanitizeURL ile URL temizle
      var safeUrl = sanitizeURL(profile.avatar_url);
      if (safeUrl) {
        navAvatar.innerHTML = '<img src="' + safeUrl + '?t=' + Date.now() + '" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
        navAvatar.style.background = 'transparent';
      } else {
        var initial = user.user_metadata?.username?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || '?';
        navAvatar.innerHTML = '<span id="nav-avatar-text" style="font-size:13px;font-weight:600;">' + sanitizeHTML(initial) + '</span>';
        navAvatar.style.background = 'var(--surface2)';
      }
    } else {
      var initial2 = user.user_metadata?.username?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || '?';
      navAvatar.innerHTML = '<span id="nav-avatar-text" style="font-size:13px;font-weight:600;">' + sanitizeHTML(initial2) + '</span>';
      navAvatar.style.background = 'var(--surface2)';
    }
    
  } catch (e) {}
}

// ============================================================
// ⭐ AVATAR DROPDOWN - EVENT DELEGATION (GÜVENLİ)
// ============================================================
var avatarDropdownInitialized = false;

function setupAvatarDropdown() {
  if (avatarDropdownInitialized) return;
  avatarDropdownInitialized = true;
  
  console.log('👤 Avatar dropdown event delegation kuruluyor...');
  
  // ⭐ Event Delegation - document seviyesinde
  document.addEventListener('click', function(e) {
    var avatar = document.getElementById('user-avatar');
    var dropdown = document.getElementById('dropdown-menu');
    
    if (!avatar || !dropdown) return;
    
    // Avatar'a tıklandı mı?
    if (e.target && e.target.closest && e.target.closest('#user-avatar')) {
      e.stopPropagation();
      e.preventDefault();
      dropdown.classList.toggle('show');
      return;
    }
    
    // Dropdown dışına tıklandı mı?
    if (e.target && e.target.closest && !e.target.closest('#dropdown-menu')) {
      dropdown.classList.remove('show');
      return;
    }
    
    // Dropdown içine tıklandıysa kapatma
    if (e.target && e.target.closest && e.target.closest('#dropdown-menu')) {
      return;
    }
  }, true);
  
  // ⭐ ESC tuşu ile kapat
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var dropdown = document.getElementById('dropdown-menu');
      if (dropdown) dropdown.classList.remove('show');
    }
  });
  
  console.log('✅ Avatar dropdown event delegation kuruldu!');
}

// ============================================================
// ⭐ NAVBAR EVENT'LERİ (GÜVENLİ)
// ============================================================
function initNavEvents() {
  console.log('🔗 Navbar event\'leri bağlanıyor...');
  
  // ⭐ LUCIDE ICONS'ları yeniden oluştur
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
    console.log('✅ Lucide icons re-created!');
  }
  
  // ⭐ AVATAR DROPDOWN - Event Delegation (SADECE 1 KERE)
  setupAvatarDropdown();
  
  // Premium Dropdown
  var ddBtn = document.getElementById('premium-dropdown-btn');
  var ddMenu = document.getElementById('premium-dropdown-menu');
  
  if (ddBtn && ddMenu) {
    var newDdBtn = ddBtn.cloneNode(true);
    ddBtn.parentNode.replaceChild(newDdBtn, ddBtn);
    
    newDdBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      e.preventDefault();
      this.classList.toggle('active');
      ddMenu.classList.toggle('open');
    });
    
    document.addEventListener('click', function(e) {
      if (e.target && ddMenu.contains(e.target) === false && 
          e.target !== newDdBtn && 
          (newDdBtn.contains && newDdBtn.contains(e.target) === false)) {
        newDdBtn.classList.remove('active');
        ddMenu.classList.remove('open');
      }
    });
  }
  
  // Bell Panel
  var bellBtn = document.getElementById('overtrade-bell-btn');
  var bellPanel = document.getElementById('bell-panel');
  
  if (bellBtn && bellPanel) {
    var newBellBtn = bellBtn.cloneNode(true);
    bellBtn.parentNode.replaceChild(newBellBtn, bellBtn);
    
    newBellBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      e.preventDefault();
      bellPanel.classList.toggle('open');
    });
    
    document.addEventListener('click', function(e) {
      if (e.target && bellPanel.contains(e.target) === false && 
          e.target !== newBellBtn && 
          (newBellBtn.contains && newBellBtn.contains(e.target) === false)) {
        bellPanel.classList.remove('open');
      }
    });
  }
  
  // Bell Close
  var bellClose = document.getElementById('bell-panel-close');
  if (bellClose) {
    var newBellClose = bellClose.cloneNode(true);
    bellClose.parentNode.replaceChild(newBellClose, bellClose);
    
    newBellClose.addEventListener('click', function(e) {
      e.stopPropagation();
      var panel = document.getElementById('bell-panel');
      if (panel) panel.classList.remove('open');
    });
  }
  
  // Logout
  var logoutBtn = document.getElementById('logout-dropdown-btn');
  if (logoutBtn) {
    var newLogoutBtn = logoutBtn.cloneNode(true);
    logoutBtn.parentNode.replaceChild(newLogoutBtn, logoutBtn);
    
    newLogoutBtn.addEventListener('click', async function(e) {
      e.preventDefault();
      var sb = window.sb || window.supabase;
      if (sb) await sb.auth.signOut();
      localStorage.removeItem('ww_last_active_push');
      window.location.href = '/index.html';
    });
  }
  
  // Mobile Toggle
  var toggle = document.getElementById('nav-toggle');
  var menu = document.getElementById('nav-menu');
  var backdrop = document.getElementById('nav-backdrop');
  
  if (toggle && menu && backdrop) {
    var newToggle = toggle.cloneNode(true);
    toggle.parentNode.replaceChild(newToggle, toggle);
    
    newToggle.addEventListener('click', function(e) {
      e.preventDefault();
      this.classList.toggle('open');
      menu.classList.toggle('open');
      backdrop.classList.toggle('open');
      document.body.style.overflow = menu.classList.contains('open') ? 'hidden' : '';
    });
    
    if (backdrop) {
      backdrop.addEventListener('click', function() {
        newToggle.classList.remove('open');
        menu.classList.remove('open');
        backdrop.classList.remove('open');
        document.body.style.overflow = '';
      });
    }
  }
  
  // Mobile Logout
  var logoutMobile = document.getElementById('logout-btn-mobile');
  if (logoutMobile) {
    var newLogoutMobile = logoutMobile.cloneNode(true);
    logoutMobile.parentNode.replaceChild(newLogoutMobile, logoutMobile);
    
    newLogoutMobile.addEventListener('click', function(e) {
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
  
  console.log('✅ Navbar event\'leri bağlandı!');
}

// ============================================================
// ⭐ NAVBAR'YI YÜKLE - FONT OYNAMALARINI ÖNLE - AKTİF LİNK HEMEN
// ============================================================
function loadNavbar(containerId) {
  var container = document.getElementById(containerId);
  if (!container) {
    console.error('❌ Navbar container bulunamadı:', containerId);
    return;
  }
  
  console.log('📦 Navbar yükleniyor...');
  
  // ⭐ 1. Önce i18n metinlerini hazırla (batch)
  var translations = {};
  if (typeof i18n !== 'undefined' && typeof i18n.t === 'function') {
    var keys = new Set();
    document.querySelectorAll('[data-i18n], [data-i18n-placeholder], [data-i18n-html]').forEach(function(el) {
      var key = el.getAttribute('data-i18n') || el.getAttribute('data-i18n-placeholder') || el.getAttribute('data-i18n-html');
      if (key) keys.add(key);
    });
    
    var navbarKeys = [
      'nav.dashboard', 'nav.trades', 'nav.strategies', 'nav.calendar', 'nav.admin',
      'nav.premium', 'nav.premium_dashboard', 'nav.theme_customization', 'nav.overtrade_alert',
      'nav.upgrade_premium', 'nav.notifications', 'nav.mark_read', 'nav.no_notifications',
      'nav.profile', 'nav.settings', 'nav.logout', 'nav.home', 'nav.premium_badge', 
      'nav.free_badge'
    ];
    navbarKeys.forEach(function(key) { keys.add(key); });
    
    keys.forEach(function(key) {
      translations[key] = i18n.t(key);
    });
  }
  
  // ⭐ 2. HTML'i hazırlanmış çevirilerle birlikte enjekte et
  container.innerHTML = getNavbarHTML(translations);
  console.log('✅ Navbar HTML yüklendi! (çevirilerle birlikte)');
  
  // ⭐ 3. HEMEN aktif linki ayarla (DOM değişiminden hemen sonra)
  // ⭐ requestAnimationFrame ile bir sonraki paint'ten önce çalıştır
  if (window.requestAnimationFrame) {
    requestAnimationFrame(function() {
      setActiveNavLink();
      console.log('✅ Aktif link HEMEN ayarlandı!');
    });
  } else {
    setTimeout(function() {
      setActiveNavLink();
      console.log('✅ Aktif link HEMEN ayarlandı!');
    }, 0);
  }
  
  // ⭐ 4. Tüm linklere 'loaded' sınıfını ekle (görünür yap)
  requestAnimationFrame(function() {
    document.querySelectorAll('.nav-links a').forEach(function(link) {
      link.classList.add('loaded');
    });
  });
  
  // ⭐ 5. Geri kalan işlemleri sırayla yap (hafif gecikmeli)
  setTimeout(function() {
    // Event'leri bağla
    initNavEvents();
    
    // Avatar'ı yükle
    loadNavbarAvatar();
    
    // Badge'i güncelle
    updateNavbarBadge();
    
    console.log('✅ Navbar tamamen yüklendi!');
  }, 50);
}

// ============================================================
// ⭐ OTOMATİK BAŞLAT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  var container = document.getElementById('navbar-container');
  if (container) {
    loadNavbar('navbar-container');
  }
  
  window.addEventListener('hashchange', function() {
    setTimeout(setActiveNavLink, 50);
  });
  
  window.addEventListener('popstate', function() {
    setTimeout(setActiveNavLink, 50);
  });
  
  window.addEventListener('load', function() {
    setTimeout(setActiveNavLink, 100);
    setTimeout(updateNavbarBadge, 150);
    // Lucide icons'ları yeniden oluştur
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  });
  
  // ⭐ Storage event ile diğer sekmelerdeki dil değişikliklerini yakala
  window.addEventListener('storage', function(e) {
    if (e.key === 'ww_language' && e.newValue) {
      console.log(`🔄 Storage event: Dil değişti (${e.oldValue} → ${e.newValue})`);
      setTimeout(function() {
        updateNavbarI18n();
        updateNavbarBadgeSync();
        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
      }, 100);
    }
  });
});

// ============================================================
// ⭐ GLOBAL FONKSİYONLAR
// ============================================================
window.setActiveNavLink = setActiveNavLink;
window.updateNavbarI18n = updateNavbarI18n;
window.updateNavbarBadge = updateNavbarBadge;
window.updateNavbarBadgeSync = updateNavbarBadgeSync;
window.loadNavbar = loadNavbar;
window.sanitizeHTML = sanitizeHTML;
window.sanitizeURL = sanitizeURL;

window.refreshNavbar = function() {
  updateNavbarI18n();
  updateNavbarBadgeSync();
  setActiveNavLink();
  loadNavbarAvatar();
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
};

console.log('✅ navbar.js yüklendi! (FONT SABİT - BATCH i18n - AKTİF LİNK HIZLI - LUCIDE ICONS - AVATAR DROPDOWN FİX)');