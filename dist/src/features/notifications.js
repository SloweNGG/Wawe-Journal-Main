// ============================================================
// WAWE JOURNAL - NOTIFICATIONS
// ============================================================

import { sb } from '../core/supabase.js';
import { safeLocalStorageGet, safeLocalStorageSet } from '../core/storage.js';
import { NOTIFICATION_STORAGE_KEY, NOTIFICATION_TYPES } from '../core/config.js';
import { getUserPlanSilent } from '../services/user.js';
import { checkOvertrade } from './overtrade.js';

export function getTimeAgoSimple(timestamp) {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return days + ' gün önce';
  if (hours > 0) return hours + ' saat önce';
  if (minutes > 0) return minutes + ' dakika önce';
  return 'az önce';
}

export class NotificationManager {
  constructor() {
    this.notifications = [];
    this.listeners = [];
    this.loadFromStorage();
    this.startAutoCleanup();
  }

  loadFromStorage() {
    try {
      const saved = safeLocalStorageGet(NOTIFICATION_STORAGE_KEY, null);
      if (saved) {
        this.notifications = JSON.parse(saved);
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        this.notifications = this.notifications.filter(n => n.timestamp > sevenDaysAgo);
        this.saveToStorage();
      }
    } catch (e) {
      this.notifications = [];
    }
  }

  saveToStorage() {
    try {
      safeLocalStorageSet(NOTIFICATION_STORAGE_KEY, JSON.stringify(this.notifications));
    } catch (e) {}
  }

  add(notification) {
    const newNotif = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      timestamp: Date.now(),
      read: false,
      ...notification
    };
    this.notifications.unshift(newNotif);
    if (this.notifications.length > 100) {
      this.notifications = this.notifications.slice(0, 100);
    }
    this.saveToStorage();
    this.notifyListeners();
    return newNotif;
  }

  markAsRead(id) {
    const notif = this.notifications.find(n => n.id === id);
    if (notif) {
      notif.read = true;
      this.saveToStorage();
      this.notifyListeners();
    }
  }

  markAllAsRead() {
    this.notifications.forEach(n => n.read = true);
    this.saveToStorage();
    this.notifyListeners();
  }

  clearAll() {
    this.notifications = [];
    this.saveToStorage();
    this.notifyListeners();
  }

  getUnreadCount() {
    return this.notifications.filter(n => !n.read).length;
  }

  getAll() {
    return this.notifications;
  }

  getUnread() {
    return this.notifications.filter(n => !n.read);
  }

  onUpdate(callback) {
    this.listeners.push(callback);
  }

  notifyListeners() {
    this.listeners.forEach(cb => cb(this.notifications));
  }

  startAutoCleanup() {
    setInterval(() => {
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const before = this.notifications.length;
      this.notifications = this.notifications.filter(n => n.timestamp > sevenDaysAgo);
      if (before !== this.notifications.length) {
        this.saveToStorage();
        this.notifyListeners();
      }
    }, 10 * 60 * 1000);
  }

  addOvertradeWarning(warnings) {
    if (!warnings || warnings.length === 0) return;
    warnings.forEach(w => {
      this.add({
        type: w.level === 'danger' ? NOTIFICATION_TYPES.OVERTRADE_CRITICAL : NOTIFICATION_TYPES.OVERTRADE_WARNING,
        icon: w.level === 'danger' ? '🚨' : '⚠️',
        title: w.level === 'danger' ? 'Kritik Over Trade Uyarısı!' : 'Over Trade Uyarısı',
        description: w.message,
        data: w
      });
    });
  }

  addPremiumExpiring(daysLeft) {
    if (daysLeft <= 0) {
      this.add({
        type: NOTIFICATION_TYPES.PREMIUM_EXPIRED,
        icon: '⏳',
        title: 'Premium Aboneliğin Sona Erdi!',
        description: 'Premium aboneliğinin süresi doldu. Tekrar premium\'a geçmek için ayarları ziyaret et.',
        data: { daysLeft: daysLeft }
      });
    } else if (daysLeft <= 7) {
      this.add({
        type: NOTIFICATION_TYPES.PREMIUM_EXPIRING,
        icon: '⏰',
        title: 'Premium Aboneliğin Yakında Sona Eriyor!',
        description: `${daysLeft} gün içinde premium aboneliğin sona erecek. Yenilemek için ayarları ziyaret et.`,
        data: { daysLeft: daysLeft }
      });
    }
  }

  addPremiumUpgraded(planType) {
    this.add({
      type: NOTIFICATION_TYPES.PREMIUM_UPGRADED,
      icon: '🎉',
      title: 'Premium\'a Geçtin!',
      description: `Tebrikler! ${planType === 'yearly' ? 'Yıllık' : 'Aylık'} Premium planına başarıyla geçtin. Tüm premium özellikler aktif.`,
      data: { planType: planType }
    });
  }

  addSystemNotification(title, description, icon = 'ℹ️') {
    this.add({
      type: NOTIFICATION_TYPES.SYSTEM,
      icon: icon,
      title: title,
      description: description
    });
  }

  async checkAndNotifyOvertrade() {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      
      const { plan } = await getUserPlanSilent();
      if (plan !== 'premium') return;
      
      const { data: trades, error } = await sb
        .from('trades')
        .select('*')
        .eq('user_id', session.user.id)
        .order('trade_date', { ascending: false });
      
      if (error) return;
      
      const warnings = checkOvertrade(trades || []);
      if (warnings && warnings.length > 0) {
        this.addOvertradeWarning(warnings);
      }
    } catch (e) {}
  }

  async checkAndNotifyPremiumExpiry() {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      
      const { data, error } = await sb
        .from('user_profiles')
        .select('plan, plan_expires_at')
        .eq('id', session.user.id)
        .single();
      
      if (error || !data || data.plan !== 'premium' || !data.plan_expires_at) return;
      
      const expiresAt = new Date(data.plan_expires_at);
      const now = new Date();
      const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
      
      const existing = this.notifications.find(n => 
        n.type === NOTIFICATION_TYPES.PREMIUM_EXPIRING || 
        n.type === NOTIFICATION_TYPES.PREMIUM_EXPIRED
      );
      
      if (daysLeft <= 0) {
        if (!existing || existing.type !== NOTIFICATION_TYPES.PREMIUM_EXPIRED) {
          this.addPremiumExpiring(0);
        }
      } else if (daysLeft <= 7) {
        if (!existing) {
          this.addPremiumExpiring(daysLeft);
        }
      }
    } catch (e) {}
  }

  async checkAll() {
    await this.checkAndNotifyOvertrade();
    await this.checkAndNotifyPremiumExpiry();
  }
}

// ⭐ NOTIFICATION_TYPES export ediliyor!
export { NOTIFICATION_TYPES };

export function updateNotificationUI() {
  const badge = document.getElementById('notifBadge');
  const bell = document.getElementById('notifBell');
  const body = document.getElementById('notifBody');
  
  if (!badge || !bell) return;
  
  const count = window.notificationManager.getUnreadCount();
  
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.remove('hidden');
    bell.classList.add('has-notif');
  } else {
    badge.classList.add('hidden');
    bell.classList.remove('has-notif');
  }
  
  if (body) {
    const notifications = window.notificationManager.getAll();
    if (notifications.length === 0) {
      body.innerHTML = `
        <div class="notif-empty">
          <span class="empty-icon">📭</span>
          Henüz bildirim yok.
        </div>
      `;
    } else {
      body.innerHTML = notifications.map(n => {
        const isRead = n.read ? '' : 'style="background:rgba(139,92,246,0.04);"';
        const timeAgo = getTimeAgoSimple(n.timestamp);
        const iconClass = n.type === NOTIFICATION_TYPES.OVERTRADE_CRITICAL ? 'danger' :
                          n.type === NOTIFICATION_TYPES.OVERTRADE_WARNING ? 'warning' :
                          n.type === NOTIFICATION_TYPES.PREMIUM_EXPIRING ? 'warning' :
                          n.type === NOTIFICATION_TYPES.PREMIUM_EXPIRED ? 'danger' :
                          n.type === NOTIFICATION_TYPES.PREMIUM_UPGRADED ? 'success' : 'info';
        
        return `
          <div class="notif-item" data-id="${n.id}" ${isRead}>
            <div class="notif-icon ${iconClass}">${n.icon || 'ℹ️'}</div>
            <div class="notif-content">
              <div class="notif-title">${n.title}</div>
              <div class="notif-desc">${n.description}</div>
              <span class="notif-time">${timeAgo}</span>
            </div>
            <button class="notif-close" onclick="window.dismissNotification('${n.id}')">✕</button>
          </div>
        `;
      }).join('');
    }
  }
}

export function dismissNotification(id) {
  window.notificationManager.markAsRead(id);
  updateNotificationUI();
}

export function clearAllNotifications() {
  window.notificationManager.clearAll();
  updateNotificationUI();
}

export function toggleNotificationPanel() {
  const panel = document.getElementById('notifPanel');
  if (panel) {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      window.notificationManager.markAllAsRead();
      updateNotificationUI();
    }
  }
}