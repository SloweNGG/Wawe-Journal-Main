// ============================================================
// PAGE-TRANSITION.JS - Sayfa Geçiş Animasyonu + DİL KORUMA
// ============================================================

console.log('🔄 Sayfa geçiş animasyonu yükleniyor...');

// ⭐ Sayfa geçiş yöneticisi
var PageTransition = {
  isTransitioning: false,
  timeoutId: null,
  currentLang: null,

  // ⭐ Sayfaya giriş animasyonu
  enter: function() {
    var main = document.querySelector('.main, .dashboard-main, .calendar-page-main, .strategies-main, .settings-wrap');
    if (!main) return;
    
    // Zaten görünürse tekrar animasyon yapma
    if (main.classList.contains('page-visible')) return;
    
    main.classList.remove('page-exit');
    main.classList.add('page-enter');
    
    // Önce opaklığı sıfırla
    main.style.opacity = '0';
    main.style.transform = 'translateY(16px)';
    main.style.transition = 'none';
    
    // Bir sonraki frame'de animasyonu başlat
    requestAnimationFrame(function() {
      main.style.transition = 'opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
      main.style.opacity = '1';
      main.style.transform = 'translateY(0)';
      
      main.classList.add('page-visible');
    });
    
    // Animasyon bittiğinde temizlik
    clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(function() {
      main.style.transition = '';
      main.classList.remove('page-enter');
    }, 500);
    
    // 🔥 YENİ: Sayfa girişinde dil kontrolü
    this.restoreLanguage();
  },

  // ⭐ Sayfadan çıkış animasyonu (tıklama anında)
  exit: function(callback) {
    var main = document.querySelector('.main, .dashboard-main, .calendar-page-main, .strategies-main, .settings-wrap');
    if (!main) {
      if (typeof callback === 'function') callback();
      return;
    }
    
    // Zaten çıkış yapıyorsa tekrarlama
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    
    main.classList.add('page-exit');
    main.classList.remove('page-visible');
    main.style.transition = 'opacity 0.25s ease, transform 0.3s ease';
    main.style.opacity = '0';
    main.style.transform = 'translateY(-10px)';
    
    // 🔥 YENİ: Çıkış öncesi dili localStorage'a kaydet
    this.saveLanguageBeforeExit();
    
    setTimeout(function() {
      main.style.transition = '';
      PageTransition.isTransitioning = false;
      if (typeof callback === 'function') callback();
    }, 350);
  },

  // 🔥 YENİ: Dili localStorage'a kaydet (çıkış öncesi)
  saveLanguageBeforeExit: function() {
    try {
      if (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) {
        const currentLang = i18n.getCurrentLanguage();
        localStorage.setItem('ww_language', currentLang);
        console.log(`💾 [PageTransition] Dil kaydedildi (çıkış): ${currentLang}`);
      }
    } catch (e) {
      console.warn('⚠️ [PageTransition] Dil kaydetme hatası:', e);
    }
  },

  // 🔥 YENİ: Dili geri yükle (girişte)
  restoreLanguage: function() {
    try {
      // 1. localStorage'dan dili oku
      const savedLang = localStorage.getItem('ww_language');
      
      if (savedLang) {
        console.log(`🌐 [PageTransition] localStorage'dan dil okundu: ${savedLang}`);
        
        // 2. i18n'deki dili güncelle
        if (typeof i18n !== 'undefined') {
          const currentLang = i18n.getCurrentLanguage();
          
          if (currentLang !== savedLang) {
            console.log(`🔄 [PageTransition] Dil değiştiriliyor: ${currentLang} → ${savedLang}`);
            i18n.setLanguage(savedLang);
          } else {
            // Dil zaten doğru, sadece apply et
            i18n.apply();
            console.log(`✅ [PageTransition] Dil zaten doğru: ${savedLang}, sadece apply edildi`);
          }
          
          // 3. Navbar'ı güncelle
          if (typeof window.updateNavbarI18n === 'function') {
            window.updateNavbarI18n();
          } else if (typeof updateNavbarI18n === 'function') {
            updateNavbarI18n();
          }
          
          // 4. data-lang attribute'unu güncelle
          document.documentElement.setAttribute('data-lang', savedLang);
        }
      } else {
        // Kayıtlı dil yoksa varsayılanı kullan
        console.log('🌐 [PageTransition] localStorage\'da dil bulunamadı, varsayılan kullanılıyor');
        if (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) {
          const defaultLang = i18n.getCurrentLanguage();
          localStorage.setItem('ww_language', defaultLang);
        }
      }
    } catch (e) {
      console.warn('⚠️ [PageTransition] Dil geri yükleme hatası:', e);
    }
  },

  // ⭐ Nav link'lerine tıklama yakalayıcı (GELİŞTİRİLMİŞ)
  init: function() {
    console.log('🔄 Sayfa geçiş başlatılıyor...');
    
    // 🔥 ÖNCE: Dili geri yükle (sayfa yüklenirken)
    this.restoreLanguage();
    
    // ⭐ Tüm nav link'lerini bul (hem desktop hem mobile)
    var navLinks = document.querySelectorAll('.nav-links a, .nav-menu-inner a');
    
    navLinks.forEach(function(link) {
      var href = link.getAttribute('href');
      
      // Sadece internal linkler (http ile başlamayanlar, # olmayanlar, / olmayanlar)
      if (href && 
          !href.startsWith('http') && 
          !href.startsWith('#') && 
          href !== '/' &&
          href !== '#' &&
          href !== '') {
        
        // Eski event'leri temizlemek için clone
        var newLink = link.cloneNode(true);
        link.parentNode.replaceChild(newLink, link);
        
        newLink.addEventListener('click', function(e) {
          e.preventDefault();
          var targetHref = this.getAttribute('href');
          
          // Mevcut sayfaya tıklanıyorsa geçiş yapma
          if (targetHref === window.location.pathname) {
            return;
          }
          
          console.log('🔄 Sayfa geçişi:', targetHref);
          
          // 🔥 YENİ: Geçiş öncesi dili kaydet
          PageTransition.saveLanguageBeforeExit();
          
          // Çıkış animasyonu yap, sonra sayfaya git
          PageTransition.exit(function() {
            window.location.href = targetHref;
          });
        });
      }
    });
    
    // ⭐ Sayfa yüklendiğinde giriş animasyonu
    setTimeout(function() {
      PageTransition.enter();
    }, 80);
  },

  // ⭐ Sayfa değişiminde aktif linki güncelle
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

  // 🔥 YENİ: Dil ve navbar'ı tamamen yenile
  fullRefresh: function() {
    console.log('🔄 [PageTransition] Tam yenileme başlatılıyor...');
    this.restoreLanguage();
    this.enter();
    this.updateActiveLink();
    
    // Navbar'ı da güncelle
    if (typeof window.updateNavbarI18n === 'function') {
      setTimeout(function() {
        window.updateNavbarI18n();
      }, 100);
    }
  }
};

// ⭐ Otomatik başlat
document.addEventListener('DOMContentLoaded', function() {
  // 🔥 ÖNCE: Dili geri yükle (en erken)
  setTimeout(function() {
    PageTransition.restoreLanguage();
  }, 0);
  
  PageTransition.init();
  PageTransition.updateActiveLink();
});

// ⭐ Sayfa tam yüklendiğinde tekrar dene
window.addEventListener('load', function() {
  setTimeout(function() {
    // 🔥 YENİ: Dil kontrolü yap ve gerekirse güncelle
    const savedLang = localStorage.getItem('ww_language');
    if (savedLang && typeof i18n !== 'undefined') {
      const currentLang = i18n.getCurrentLanguage();
      if (currentLang !== savedLang) {
        console.log(`🔄 [PageTransition] load event: dil güncelleniyor ${currentLang} → ${savedLang}`);
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

// ⭐ Popstate ile geri/ileri tuşlarında
window.addEventListener('popstate', function() {
  setTimeout(function() {
    // 🔥 YENİ: Geri/ileri tuşlarında dili kontrol et
    PageTransition.restoreLanguage();
    PageTransition.enter();
    PageTransition.updateActiveLink();
    
    // Navbar'ı güncelle
    if (typeof window.updateNavbarI18n === 'function') {
      setTimeout(function() {
        window.updateNavbarI18n();
      }, 50);
    }
  }, 150);
});

// ⭐ Hashchange ile
window.addEventListener('hashchange', function() {
  setTimeout(function() {
    // 🔥 YENİ: Hash değişiminde dili kontrol et
    PageTransition.restoreLanguage();
    PageTransition.updateActiveLink();
  }, 100);
});

// 🔥 YENİ: Storage event ile diğer sekmelerdeki dil değişikliklerini yakala
window.addEventListener('storage', function(e) {
  if (e.key === 'ww_language' && e.newValue) {
    console.log(`🔄 [PageTransition] Storage event: Dil değişti (${e.oldValue} → ${e.newValue})`);
    
    if (typeof i18n !== 'undefined') {
      // Dili güncelle
      i18n.setLanguage(e.newValue);
      
      // Navbar'ı güncelle
      if (typeof window.updateNavbarI18n === 'function') {
        setTimeout(function() {
          window.updateNavbarI18n();
        }, 50);
      }
      
      // data-lang attribute'unu güncelle
      document.documentElement.setAttribute('data-lang', e.newValue);
    }
  }
});

// 🔥 YENİ: Visibility change ile sayfa tekrar görünür olduğunda
document.addEventListener('visibilitychange', function() {
  if (!document.hidden) {
    // Sayfa tekrar görünür olduğunda dil kontrol et
    const savedLang = localStorage.getItem('ww_language');
    if (savedLang && typeof i18n !== 'undefined') {
      const currentLang = i18n.getCurrentLanguage();
      if (currentLang !== savedLang) {
        console.log(`🔄 [PageTransition] Sayfa görünür oldu, dil güncelleniyor: ${currentLang} → ${savedLang}`);
        i18n.setLanguage(savedLang);
        if (typeof window.updateNavbarI18n === 'function') {
          window.updateNavbarI18n();
        }
      }
    }
  }
});

// 🔥 YENİ: Sayfa yenileme öncesi dili kaydet
window.addEventListener('beforeunload', function() {
  try {
    if (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) {
      const currentLang = i18n.getCurrentLanguage();
      localStorage.setItem('ww_language', currentLang);
      console.log(`💾 [PageTransition] Sayfa yenileme öncesi dil kaydedildi: ${currentLang}`);
    }
  } catch (e) {
    // Sessizce hata
  }
});

// 🔥 YENİ: Window'a PageTransition fonksiyonlarını ekle
window.PageTransition = PageTransition;
window.restoreLanguage = PageTransition.restoreLanguage;
window.saveLanguageBeforeExit = PageTransition.saveLanguageBeforeExit;

console.log('✅ page-transition.js yüklendi! (Dil koruma + localStorage)');