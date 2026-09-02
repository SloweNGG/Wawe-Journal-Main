// ============================================================
// notification-bell.js
// BİLDİRİM BELL - JAVASCRIPT (window.notificationManager kullanır)
// ============================================================

(function() {
  'use strict';

  console.log('🔔 Notification Bell başlatılıyor...');

  function getNotificationBellHTML() {
    return `
      <div class="notif-bell-wrapper">
        <button class="notif-btn" id="notifBell" aria-label="Bildirimler">
          <i data-lucide="bell"></i>
          <span class="notif-badge hidden" id="notifBadge">0</span>
        </button>
        <div class="notif-panel" id="notifPanel">
          <div class="notif-panel-header">
            <h4 data-i18n="nav.notifications">Bildirimler</h4>
            <button class="notif-clear-all" id="notifClearAll" data-i18n="nav.clear_all">Tümünü Temizle</button>
          </div>
          <div class="notif-panel-body" id="notifBody">
            <div class="notif-empty" data-i18n="nav.no_notifications">
              <span class="empty-icon">📭</span>
              Henüz bildirim yok.
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function getTimeAgoSimple(timestamp) {
    var diff = Date.now() - timestamp;
    var seconds = Math.floor(diff / 1000);
    var minutes = Math.floor(seconds / 60);
    var hours = Math.floor(minutes / 60);
    var days = Math.floor(hours / 24);

    if (days > 0) return days + ' gün önce';
    if (hours > 0) return hours + ' saat önce';
    if (minutes > 0) return minutes + ' dakika önce';
    return 'az önce';
  }

  function updateNotificationUI() {
    var badge = document.getElementById('notifBadge');
    var bell = document.getElementById('notifBell');
    var body = document.getElementById('notifBody');

    if (!badge || !bell) return;

    var nm = window.notificationManager;
    if (!nm) {
      console.warn('⚠️ notificationManager bulunamadı');
      return;
    }

    var count = nm.getUnreadCount();

    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.classList.remove('hidden');
      bell.classList.add('has-notif');
    } else {
      badge.classList.add('hidden');
      bell.classList.remove('has-notif');
    }

    if (body) {
      var notifications = nm.getAll();

      if (notifications.length === 0) {
        var emptyText = (typeof i18n !== 'undefined' && i18n.t && i18n.t('nav.no_notifications')) || 'Henüz bildirim yok.';
        body.innerHTML = `
          <div class="notif-empty">
            <span class="empty-icon">📭</span>
            ${emptyText}
          </div>
        `;
        
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
          lucide.createIcons();
        }
      } else {
        body.innerHTML = notifications.map(function(n) {
          var isRead = n.read ? '' : 'style="background:rgba(139,92,246,0.04);"';
          var timeAgo = getTimeAgoSimple(n.timestamp);

          var iconClass = 'info';
          var iconName = 'info';
          if (n.type === 'overtrade_critical') {
            iconClass = 'danger';
            iconName = 'octagon-alert';
          } else if (n.type === 'overtrade_warning') {
            iconClass = 'warning';
            iconName = 'triangle-alert';
          } else if (n.type === 'premium_expired') {
            iconClass = 'danger';
            iconName = 'octagon-alert';
          } else if (n.type === 'premium_upgraded') {
            iconClass = 'success';
            iconName = 'circle-check';
          }

          var icon = n.icon || 'info';
          var title = n.title || 'Bildirim';
          var description = n.description || '';

          // ⭐ OVERTRADE ÖZEL BİLGİLERİ GÖSTER
          var otStats = '';
          if (n.data && (n.type === 'overtrade_warning' || n.type === 'overtrade_critical')) {
            otStats = `
              <div class="notif-ot-stats">
                <span>${n.data.current || 0} / ${n.data.limit || 0}</span>
                <span>${n.data.type === 'daily_trades' ? 'Günlük' : n.data.type === 'weekly_trades' ? 'Haftalık' : 'Kayıp'}</span>
              </div>
            `;
          }

          return `
            <div class="notif-item" data-id="${n.id}" ${isRead}>
              <div class="notif-icon ${iconClass}">
                <i data-lucide="${iconName}"></i>
              </div>
              <div class="notif-content">
                <div class="notif-title">${title}</div>
                <div class="notif-desc">${description}</div>
                ${otStats}
                <span class="notif-time">${timeAgo}</span>
              </div>
              <button class="notif-close" onclick="window.dismissNotification('${n.id}')">
                <i data-lucide="x"></i>
              </button>
            </div>
          `;
        }).join('');
        
        // ⭐ Lucide ikonlarını render et
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
          lucide.createIcons();
        }
      }
    }
  }

  function setupEventListeners() {
    var bell = document.getElementById('notifBell');
    if (bell) {
      bell.addEventListener('click', function(e) {
        e.stopPropagation();
        var panel = document.getElementById('notifPanel');
        if (panel) {
          panel.classList.toggle('open');
          if (panel.classList.contains('open') && window.notificationManager) {
            window.notificationManager.markAllAsRead();
            updateNotificationUI();
          }
        }
      });
    }

    document.addEventListener('click', function(e) {
      var panel = document.getElementById('notifPanel');
      var bell = document.getElementById('notifBell');
      if (panel && panel.classList.contains('open')) {
        if (!panel.contains(e.target) && !bell.contains(e.target)) {
          panel.classList.remove('open');
        }
      }
    });

    var clearBtn = document.getElementById('notifClearAll');
    if (clearBtn) {
      clearBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var confirmText = (typeof i18n !== 'undefined' && i18n.t && i18n.t('nav.confirm_clear_all')) || 'Tüm bildirimleri temizlemek istediğinize emin misiniz?';
        if (confirm(confirmText) && window.notificationManager) {
          window.notificationManager.clearAll();
          updateNotificationUI();
        }
      });
    }

    if (typeof i18n !== 'undefined' && i18n.onChange) {
      i18n.onChange(function() {
        updateNotificationUI();
      });
    }

    if (window.notificationManager) {
      window.notificationManager.onUpdate(function() {
        updateNotificationUI();
      });
    }
  }

  function loadNotificationBell(containerId) {
    var container = document.getElementById(containerId);
    if (!container) {
      console.warn('⚠️ Notification bell container bulunamadı:', containerId);
      return;
    }

    container.innerHTML = getNotificationBellHTML();
    setupEventListeners();

    // ⭐ Lucide ikonlarını render et
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }

    setTimeout(updateNotificationUI, 500);

    console.log('✅ Notification bell yüklendi! (container:', containerId + ')');
  }

  window.loadNotificationBell = loadNotificationBell;
  window.updateNotificationUI = updateNotificationUI;

  document.addEventListener('DOMContentLoaded', function() {
    var container = document.getElementById('notification-bell-container');
    if (container) {
      loadNotificationBell('notification-bell-container');
    }
  });

  console.log('✅ Notification Bell modülü yüklendi!');
})();