// ============================================================
// NAVBAR.JS - GÜVENLİK GÜNCELLEMESİ (XSS KORUMALI)
// LUCIDE ICONS + AVATAR DROPDOWN FİX
// ============================================================

console.log('🧭 Navbar yükleniyor (GÜVENLİK GÜNCELLENDİ)...');

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
// NAVBAR HTML - i18n ETİKETLERİ İLE + LUCIDE ICONS
// ============================================================
function getNavbarHTML() {
  return `
    <nav class="nav">
      <a href="/index.html" class="nav-logo" title="Wawe Journal - Ana Sayfa">
        <div class="logo-icon">
          <i data-lucide="trending-up" class="logo-icon-svg"></i>
        </div>
      </a>
      
      <div class="nav-links">
        <a href="/dashboard.html" data-i18n="nav.dashboard" data-page="dashboard">Dashboard</a>
        <a href="/trades.html" data-i18n="nav.trades" data-page="trades">İşlemler</a>
        <a href="/strategies.html" data-i18n="nav.strategies" data-page="strategies">Stratejiler</a>
        <a href="/calendar.html" data-i18n="nav.calendar" data-page="calendar">Takvim</a>
        <span id="admin-link" style="display:none;"><a href="/admin.html" data-i18n="nav.admin" data-page="admin">Admin</a></span>
      </div>
      
      <div class="nav-right">
        <!-- ⭐ PREMIUM DROPDOWN -->
        <div class="nav-dropdown">
          <button class="nav-dropdown-btn" id="premium-dropdown-btn">
            <i data-lucide="crown" class="nav-icon" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.premium">Premium</span>
            <i data-lucide="chevron-down" class="dropdown-arrow" style="width:12px;height:12px;"></i>
          </button>
          <div class="nav-dropdown-menu" id="premium-dropdown-menu">
            <div class="menu-label" data-i18n="nav.premium_features">✨ Premium Özellikler</div>
            <a href="/premium-dashboard.html">
              <i data-lucide="layout-dashboard" class="premium-icon" style="width:16px;height:16px;"></i>
              <span data-i18n="nav.premium_dashboard">Premium Dashboard</span>
            </a>
            <a href="/settings/index.html#panel-appearance">
              <i data-lucide="palette" class="premium-icon" style="width:16px;height:16px;"></i>
              <span data-i18n="nav.theme_customization">Tema Özelleştirme</span>
            </a>
            <a href="/settings/index.html#panel-overtrade">
              <i data-lucide="bell" class="premium-icon" style="width:16px;height:16px;"></i>
              <span data-i18n="nav.overtrade_alert">Over Trade Uyarısı</span>
            </a>
            <div class="dropdown-divider"></div>
            <a href="/settings/index.html#panel-plan" style="color:var(--accent); font-weight:700;">
              <i data-lucide="rocket" class="premium-icon" style="width:16px;height:16px;"></i>
              <span data-i18n="nav.upgrade_premium">Premium'a Geç →</span>
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
              <h3 data-i18n="nav.notifications">🔔 Bildirimler</h3>
              <div class="bell-panel-header-actions">
                <button class="bell-mark-read-btn" id="bell-mark-read-btn" style="display:none;" data-i18n="nav.mark_read">✓ Okundu</button>
                <button class="bell-panel-close" id="bell-panel-close">✕</button>
              </div>
            </div>
            <div class="bell-panel-body" id="bell-panel-body">
              <div class="bell-panel-empty">
                <span class="empty-icon">🔕</span>
                <span data-i18n="nav.no_notifications">Yeni bildirim yok</span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- ⭐ PLAN BADGE -->
        <div class="plan-badge" id="plan-badge">
          <span class="plan-dot"></span>
          <span class="plan-text" id="plan-text">Ücretsiz</span>
        </div>
        
        <!-- ⭐ USER AVATAR -->
        <div class="user-avatar" id="user-avatar">
          <span id="nav-avatar-text" style="font-size:13px;font-weight:600;">?</span>
        </div>
        
        <!-- ⭐ DROPDOWN MENU -->
        <div class="dropdown-menu" id="dropdown-menu">
          <a href="/settings/index.html#panel-profile" class="dropdown-item" data-i18n="nav.profile">
            <i data-lucide="user" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.profile">Profil</span>
          </a>
          <a href="/settings/index.html" class="dropdown-item" data-i18n="nav.settings">
            <i data-lucide="settings" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.settings">Ayarlar</span>
          </a>
          <div class="dropdown-divider"></div>
          <a href="/settings/index.html#panel-plan" class="dropdown-item" style="color:var(--accent2);">
            <i data-lucide="crown" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.upgrade_premium">Premium'a Geç</span>
          </a>
          <div class="dropdown-divider"></div>
          <button class="dropdown-item" id="logout-dropdown-btn" data-i18n="nav.logout">
            <i data-lucide="log-out" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.logout">Çıkış Yap</span>
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
          <i data-lucide="home" style="width:16px;height:16px;"></i> Ana Sayfa
        </a>
        <a href="/dashboard.html" data-i18n="nav.dashboard">
          <i data-lucide="layout-dashboard" style="width:16px;height:16px;"></i> Dashboard
        </a>
        <a href="/trades.html" data-i18n="nav.trades">
          <i data-lucide="list" style="width:16px;height:16px;"></i> İşlemler
        </a>
        <a href="/strategies.html" data-i18n="nav.strategies">
          <i data-lucide="target" style="width:16px;height:16px;"></i> Stratejiler
        </a>
        <a href="/calendar.html" data-i18n="nav.calendar">
          <i data-lucide="calendar" style="width:16px;height:16px;"></i> Takvim
        </a>
        
        <div class="nav-divider"></div>
        
        <div class="mobile-premium-label" data-i18n="nav.premium">💎 Premium</div>
        <a href="/premium-dashboard.html" data-i18n="nav.premium_dashboard">
          <i data-lucide="layout-dashboard" style="width:16px;height:16px;"></i> Premium Dashboard
        </a>
        <a href="/settings/index.html#panel-appearance" data-i18n="nav.theme_customization">
          <i data-lucide="palette" style="width:16px;height:16px;"></i> Tema Özelleştirme
        </a>
        <a href="/settings/index.html#panel-overtrade" data-i18n="nav.overtrade_alert">
          <i data-lucide="bell" style="width:16px;height:16px;"></i> Over Trade Uyarısı
        </a>
        <a href="/settings/index.html#panel-plan" style="color:var(--accent); font-weight:700;" data-i18n="nav.upgrade_premium">
          <i data-lucide="rocket" style="width:16px;height:16px;"></i> Premium'a Geç →
        </a>
        
        <span id="admin-link-mobile" style="display:none;"><a href="/admin.html" data-i18n="nav.admin">Admin</a></span>
        <hr>
        
        <a href="/settings/index.html#panel-profile" data-i18n="nav.profile">
          <i data-lucide="user" style="width:16px;height:16px;"></i> Profil
        </a>
        <a href="/settings/index.html" data-i18n="nav.settings">
          <i data-lucide="settings" style="width:16px;height:16px;"></i> Ayarlar
        </a>
        
        <hr>
        
        <button id="logout-btn-mobile" data-i18n="nav.logout">
          <i data-lucide="log-out" style="width:16px;height:16px;"></i> Çıkış Yap
        </button>
      </div>
    </div>
  `;
}

// ============================================================
// ⭐ i18n METİNLERİNİ GÜNCELLE - GÜVENLİ
// ============================================================
function updateNavbarI18n() {
  if (typeof i18n === 'undefined' || typeof i18n.t !== 'function') {
    console.warn('⚠️ i18n yüklenmemiş, metinler güncellenemiyor');
    return;
  }
  
  console.log('🌐 Navbar i18n metinleri güncelleniyor... Mevcut dil:', i18n.getCurrentLanguage());
  
  const elements = document.querySelectorAll('[data-i18n]');
  let updatedCount = 0;
  
  elements.forEach(function(el) {
    const key = el.getAttribute('data-i18n');
    const translation = i18n.t(key);
    // ⭐ GÜVENLİ: sadece çeviri varsa ve farklıysa güncelle
    if (translation && translation !== key) {
      // ⭐ textContent ile güvenli
      el.textContent = translation;
      updatedCount++;
    }
  });
  
  const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
  placeholders.forEach(function(el) {
    const key = el.getAttribute('data-i18n-placeholder');
    const translation = i18n.t(key);
    if (translation && translation !== key) {
      el.setAttribute('placeholder', translation);
      updatedCount++;
    }
  });
  
  const htmlElements = document.querySelectorAll('[data-i18n-html]');
  htmlElements.forEach(function(el) {
    const key = el.getAttribute('data-i18n-html');
    const translation = i18n.t(key);
    if (translation && translation !== key) {
      // ⭐ GÜVENLİ: sanitize ile temizle
      el.innerHTML = sanitizeHTML(translation);
      updatedCount++;
    }
  });
  
  updateNavbarBadgeSync();
  
  console.log(`✅ Navbar i18n metinleri güncellendi! (${updatedCount} element)`);
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
// ⭐ AKTİF SAYFA LİNKİNİ BELİRLE (GÜVENLİ)
// ============================================================
function setActiveNavLink() {
  var currentPath = window.location.pathname;
  
  var navLinks = document.querySelectorAll('.nav-links a, .nav-menu-inner a');
  
  navLinks.forEach(function(link) {
    var href = link.getAttribute('href');
    link.classList.remove('active');
    
    // ⭐ GÜVENLİ: href null veya geçersiz olabilir
    if (!href) return;
    
    if (currentPath === '/' || currentPath === '/index.html') {
      if (href === '/index.html' || href === '/') {
        link.classList.add('active');
      }
    }
    else if (currentPath === '/dashboard.html' || currentPath.includes('/dashboard')) {
      if (href === '/dashboard.html') {
        link.classList.add('active');
      }
    }
    else if (currentPath === '/trades.html' || currentPath.includes('/trades')) {
      if (href === '/trades.html') {
        link.classList.add('active');
      }
    }
    else if (currentPath === '/strategies.html' || currentPath.includes('/strategies')) {
      if (href === '/strategies.html') {
        link.classList.add('active');
      }
    }
    else if (currentPath === '/calendar.html' || currentPath.includes('/calendar')) {
      if (href === '/calendar.html') {
        link.classList.add('active');
      }
    }
    else if (currentPath.includes('/settings/')) {
      if (href === '/settings/index.html') {
        link.classList.add('active');
      }
    }
    else if (currentPath === '/premium-dashboard.html' || currentPath.includes('/premium-dashboard')) {
      if (href === '/premium-dashboard.html') {
        link.classList.add('active');
      }
    }
    else if (currentPath === '/admin.html' || currentPath.includes('/admin')) {
      if (href === '/admin.html') {
        link.classList.add('active');
      }
    }
    else if (href !== '/' && currentPath.includes(href.replace('/', ''))) {
      link.classList.add('active');
    }
    else if (href === currentPath) {
      link.classList.add('active');
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
// ⭐ NAVBAR'YI YÜKLE (GÜVENLİ)
// ============================================================
function loadNavbar(containerId) {
  var container = document.getElementById(containerId);
  if (!container) {
    console.error('❌ Navbar container bulunamadı:', containerId);
    return;
  }
  
  container.innerHTML = getNavbarHTML();
  console.log('✅ Navbar HTML yüklendi!');
  
  // ⭐ SIRALAMA ÖNEMLİ!
  // 1. Önce i18n metinlerini güncelle
  updateNavbarI18n();
  
  // 2. Badge'i hemen güncelle (state'ten)
  updateNavbarBadgeSync();
  
  // 3. Event'leri bağla (avatar dahil - delegation ile çalışır)
  setTimeout(function() {
    initNavEvents();
  }, 50);
  
  // 4. Aktif linki ayarla
  setTimeout(function() {
    setActiveNavLink();
  }, 80);
  
  // 5. Avatar'ı yükle (içerik değişse bile event delegation çalışır)
  setTimeout(function() {
    loadNavbarAvatar();
  }, 120);
  
  // 6. Badge'i DB'den güncelle (arka planda)
  setTimeout(function() {
    updateNavbarBadge();
  }, 200);
  
  // 7. i18n değişimlerini dinle
  if (typeof i18n !== 'undefined' && i18n.onChange) {
    i18n.onChange(function(lang) {
      console.log(`🌐 [Navbar] Dil değişti: ${lang}, navbar güncelleniyor...`);
      updateNavbarI18n();
      updateNavbarBadgeSync();
      setTimeout(setActiveNavLink, 50);
      // Lucide icons'ları yeniden oluştur
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    });
  }
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

console.log('✅ navbar.js yüklendi! (GÜVENLİK GÜNCELLENDİ + LUCIDE ICONS + AVATAR DROPDOWN FİX)');