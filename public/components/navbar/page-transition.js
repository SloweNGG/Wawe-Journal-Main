// ============================================================
// PAGE-TRANSITION.JS - components/navbar/page-transition.js
// Sayfa Geçiş Animasyonu + DİL KORUMA
// ============================================================

console.log('🔄 Sayfa geçiş animasyonu yükleniyor...');

var PageTransition = {
  isTransitioning: false,
  timeoutId: null,
  currentLang: null,

  enter: function() {
    var main = document.querySelector('.main, .dashboard-main, .calendar-page-main, .strategies-main, .settings-wrap');
    if (!main) return;
    
    if (main.classList.contains('page-visible')) return;
    
    main.classList.remove('page-exit');
    main.classList.add('page-enter');
    
    main.style.opacity = '0';
    main.style.transform = 'translateY(16px)';
    main.style.transition = 'none';
    
    requestAnimationFrame(function() {
      main.style.transition = 'opacity 0.4s cubic-bezier(0.4,0,0.2,1), transform 0.4s cubic-bezier(0.4,0,0.2,1)';
      main.style.opacity = '1';
      main.style.transform = 'translateY(0)';
      main.classList.add('page-visible');
    });
    
    clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(function() {
      main.style.transition = '';
      main.classList.remove('page-enter');
    }, 500);
    
    this.restoreLanguage();
  },

  exit: function(callback) {
    var main = document.querySelector('.main, .dashboard-main, .calendar-page-main, .strategies-main, .settings-wrap');
    if (!main) {
      if (typeof callback === 'function') callback();
      return;
    }
    
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    
    main.classList.add('page-exit');
    main.classList.remove('page-visible');
    main.style.transition = 'opacity 0.25s ease, transform 0.3s ease';
    main.style.opacity = '0';
    main.style.transform = 'translateY(-10px)';
    
    this.saveLanguageBeforeExit();
    
    setTimeout(function() {
      main.style.transition = '';
      PageTransition.isTransitioning = false;
      if (typeof callback === 'function') callback();
    }, 350);
  },

  saveLanguageBeforeExit: function() {
    try {
      if (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) {
        var currentLang = i18n.getCurrentLanguage();
        localStorage.setItem('ww_language', currentLang);
        console.log('💾 [PageTransition] Dil kaydedildi (çıkış): ' + currentLang);
      }
    } catch (e) {
      console.warn('⚠️ [PageTransition] Dil kaydetme hatası:', e);
    }
  },

  restoreLanguage: function() {
    try {
      var savedLang = localStorage.getItem('ww_language');
      
      if (savedLang) {
        console.log('🌐 [PageTransition] localStorage\'dan dil okundu: ' + savedLang);
        
        if (typeof i18n !== 'undefined') {
          var currentLang = i18n.getCurrentLanguage();
          
          if (currentLang !== savedLang) {
            console.log('🔄 [PageTransition] Dil değiştiriliyor: ' + currentLang + ' → ' + savedLang);
            i18n.setLanguage(savedLang);
          } else {
            i18n.apply();
            console.log('✅ [PageTransition] Dil zaten doğru: ' + savedLang + ', sadece apply edildi');
          }
          
          if (typeof window.updateNavbarI18n === 'function') {
            window.updateNavbarI18n();
          } else if (typeof updateNavbarI18n === 'function') {
            updateNavbarI18n();
          }
          
          document.documentElement.setAttribute('data-lang', savedLang);
        }
      } else {
        console.log('🌐 [PageTransition] localStorage\'da dil bulunamadı, varsayılan kullanılıyor');
        if (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) {
          var defaultLang = i18n.getCurrentLanguage();
          localStorage.setItem('ww_language', defaultLang);
        }
      }
    } catch (e) {
      console.warn('⚠️ [PageTransition] Dil geri yükleme hatası:', e);
    }
  },

  init: function() {
    console.log('🔄 Sayfa geçiş başlatılıyor...');
    
    this.restoreLanguage();
    
    var navLinks = document.querySelectorAll('.nav-links a, .nav-menu-inner a');
    
    navLinks.forEach(function(link) {
      var href = link.getAttribute('href');
      
      if (href && 
          !href.startsWith('http') && 
          !href.startsWith('#') && 
          href !== '/' &&
          href !== '#' &&
          href !== '') {
        
        var newLink = link.cloneNode(true);
        link.parentNode.replaceChild(newLink, link);
        
        newLink.addEventListener('click', function(e) {
          e.preventDefault();
          var targetHref = this.getAttribute('href');
          
          if (targetHref === window.location.pathname) {
            return;
          }
          
          console.log('🔄 Sayfa geçişi:', targetHref);
          
          PageTransition.saveLanguageBeforeExit();
          
          PageTransition.exit(function() {
            window.location.href = targetHref;
          });
        });
      }
    });
    
    setTimeout(function() {
      PageTransition.enter();
    }, 80);
  },

  updateActiveLink: function() {
    var currentPath = window.location.pathname;
    var navLinks = document.querySelectorAll('.nav-links a, .nav-menu-inner a');
    
    navLinks.forEach(function(link) {
      var href = link.getAttribute('href');
      link.classList.remove('active');
      
      if (currentPath === '/' || currentPath === '/index.html') {
        if (href === '/index.html' || href === '/') {
          link.classList.add('active');
        }
      } else if (href && currentPath.includes(href.replace('/', ''))) {
        link.classList.add('active');
      } else if (href === currentPath) {
        link.classList.add('active');
      } else if (currentPath.includes('/settings/') && href === '/settings/index.html') {
        link.classList.add('active');
      }
    });
  },

  fullRefresh: function() {
    console.log('🔄 [PageTransition] Tam yenileme başlatılıyor...');
    this.restoreLanguage();
    this.enter();
    this.updateActiveLink();
    
    if (typeof window.updateNavbarI18n === 'function') {
      setTimeout(function() {
        window.updateNavbarI18n();
      }, 100);
    }
  }
};

document.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    PageTransition.restoreLanguage();
  }, 0);
  
  PageTransition.init();
  PageTransition.updateActiveLink();
});

window.addEventListener('load', function() {
  setTimeout(function() {
    var savedLang = localStorage.getItem('ww_language');
    if (savedLang && typeof i18n !== 'undefined') {
      var currentLang = i18n.getCurrentLanguage();
      if (currentLang !== savedLang) {
        console.log('🔄 [PageTransition] load event: dil güncelleniyor ' + currentLang + ' → ' + savedLang);
        i18n.setLanguage(savedLang);
        if (typeof window.updateNavbarI18n === 'function') {
          window.updateNavbarI18n();
        }
      }
    }
    
    PageTransition.enter();
    PageTransition.updateActiveLink();
  }, 100);
});

window.addEventListener('popstate', function() {
  setTimeout(function() {
    PageTransition.restoreLanguage();
    PageTransition.enter();
    PageTransition.updateActiveLink();
    
    if (typeof window.updateNavbarI18n === 'function') {
      setTimeout(function() {
        window.updateNavbarI18n();
      }, 50);
    }
  }, 150);
});

window.addEventListener('hashchange', function() {
  setTimeout(function() {
    PageTransition.restoreLanguage();
    PageTransition.updateActiveLink();
  }, 100);
});

window.addEventListener('storage', function(e) {
  if (e.key === 'ww_language' && e.newValue) {
    console.log('🔄 [PageTransition] Storage event: Dil değişti (' + e.oldValue + ' → ' + e.newValue + ')');
    
    if (typeof i18n !== 'undefined') {
      i18n.setLanguage(e.newValue);
      
      if (typeof window.updateNavbarI18n === 'function') {
        setTimeout(function() {
          window.updateNavbarI18n();
        }, 50);
      }
      
      document.documentElement.setAttribute('data-lang', e.newValue);
    }
  }
});

document.addEventListener('visibilitychange', function() {
  if (!document.hidden) {
    var savedLang = localStorage.getItem('ww_language');
    if (savedLang && typeof i18n !== 'undefined') {
      var currentLang = i18n.getCurrentLanguage();
      if (currentLang !== savedLang) {
        console.log('🔄 [PageTransition] Sayfa görünür oldu, dil güncelleniyor: ' + currentLang + ' → ' + savedLang);
        i18n.setLanguage(savedLang);
        if (typeof window.updateNavbarI18n === 'function') {
          window.updateNavbarI18n();
        }
      }
    }
  }
});

window.addEventListener('beforeunload', function() {
  try {
    if (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) {
      var currentLang = i18n.getCurrentLanguage();
      localStorage.setItem('ww_language', currentLang);
      console.log('💾 [PageTransition] Sayfa yenileme öncesi dil kaydedildi: ' + currentLang);
    }
  } catch (e) {
    // Sessizce hata
  }
});

window.PageTransition = PageTransition;
window.restoreLanguage = PageTransition.restoreLanguage;
window.saveLanguageBeforeExit = PageTransition.saveLanguageBeforeExit;

console.log('✅ page-transition.js yüklendi! (Dil koruma + localStorage)');