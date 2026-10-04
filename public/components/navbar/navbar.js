function closeAllNavDropdowns(except) {
  // 1. Premium dropdown
  if (except !== 'premium') {
    var pMenu = document.getElementById('premium-dropdown-menu');
    var pBtn = document.getElementById('premium-dropdown-btn');
    if (pMenu) pMenu.classList.remove('open');
    if (pBtn) pBtn.classList.remove('active');
  }

  // 2. Journal switcher
  if (except !== 'journal') {
    var js = document.getElementById('nav-journal-switcher');
    if (js) js.classList.remove('open');
  }

  // 3. Bell notification panel
  if (except !== 'bell') {
    var bell = document.getElementById('bell-panel');
    var bellBtn = document.getElementById('overtrade-bell-btn');
    if (bell) bell.classList.remove('open');
    if (bellBtn) bellBtn.classList.remove('active');
  }

  // 4. User avatar dropdown
  if (except !== 'avatar') {
    var av = document.getElementById('dropdown-menu');
    var avBtn = document.getElementById('user-avatar');
    if (av) av.classList.remove('show');
    if (avBtn) avBtn.classList.remove('active');
  }

  // 5. Mobile menu
  if (except !== 'mobile') {
    var toggle = document.getElementById('nav-toggle');
    var menu = document.getElementById('nav-menu');
    var backdrop = document.getElementById('nav-backdrop');
    if (toggle) toggle.classList.remove('open');
    if (menu) menu.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    document.body.style.overflow = '';
  }
}
window.closeAllNavDropdowns = closeAllNavDropdowns;

window.wwTogglePremium = function(e, btn) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  var m = document.getElementById('premium-dropdown-menu');
  var b = btn || document.getElementById('premium-dropdown-btn');
  var willOpen = m ? !m.classList.contains('open') : false;
  closeAllNavDropdowns(willOpen ? 'premium' : null);
  if (m) {
    m.classList.toggle('open', willOpen);
    if (b) b.classList.toggle('active', willOpen);
  }
};

window.wwToggleJournal = function(e, btn) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  var js = document.getElementById('nav-journal-switcher');
  var willOpen = js ? !js.classList.contains('open') : false;
  closeAllNavDropdowns(willOpen ? 'journal' : null);
  if (js) {
    js.classList.toggle('open', willOpen);
  }
};

window.wwToggleBell = function(e, btn) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  var p = document.getElementById('bell-panel');
  var b = btn || document.getElementById('overtrade-bell-btn');
  var willOpen = p ? !p.classList.contains('open') : false;
  closeAllNavDropdowns(willOpen ? 'bell' : null);
  if (p) {
    p.classList.toggle('open', willOpen);
    if (b) b.classList.toggle('active', willOpen);
    if (willOpen && typeof window.loadNotifications === 'function') {
      window.loadNotifications();
    }
  }
};

window.wwToggleAvatar = function(e, btn) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  var d = document.getElementById('dropdown-menu');
  var b = btn || document.getElementById('user-avatar');
  var willOpen = d ? !d.classList.contains('show') : false;
  closeAllNavDropdowns(willOpen ? 'avatar' : null);
  if (d) {
    d.classList.toggle('show', willOpen);
    if (b) b.classList.toggle('active', willOpen);
  }
};

window.wwNotifTab = 'all';
window._allNotifications = [];

window.wwGoToOvertradeSettings = function(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  var panel = document.getElementById('bell-panel');
  if (panel) panel.classList.remove('open');

  if (window.location.pathname.indexOf('settings') !== -1) {
    if (typeof window.switchPanel === 'function') {
      window.switchPanel('panel-overtrade');
    } else {
      window.location.hash = 'panel-overtrade';
    }
  } else {
    window.location.href = '/settings.html#panel-overtrade';
  }
};

window.wwSwitchNotifTab = function(tabName) {
  window.wwNotifTab = tabName || 'all';
  var buttons = document.querySelectorAll('.bell-tab-btn');
  buttons.forEach(function(btn) {
    if (btn.getAttribute('data-tab') === window.wwNotifTab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  if (typeof window.renderNotifications === 'function') {
    window.renderNotifications();
  }
};

function getDismissedClientNotifs() {
  try {
    return JSON.parse(localStorage.getItem('ww_dismissed_client_notifs') || '[]');
  } catch (e) {
    return [];
  }
}

function dismissClientNotif(id) {
  try {
    var list = getDismissedClientNotifs();
    if (!list.includes(id)) {
      list.push(id);
      localStorage.setItem('ww_dismissed_client_notifs', JSON.stringify(list));
    }
  } catch (e) {}
}

function isClientNotifDismissed(id) {
  return getDismissedClientNotifs().includes(id);
}

window.wwMarkAllAsRead = async function() {
  try {
    var sb = window.sb || window.supabase;
    var user = window.SETTINGS_STATE?.currentUser;
    if (!user || !user.id) {
      try {
        var sess = await sb?.auth?.getSession();
        user = sess?.data?.session?.user;
      } catch (sessErr) {}
    }

    if (sb && user && user.id) {
      try {
        var { error: rpcErr } = await sb.rpc('mark_notifications_as_read', { p_user_id: user.id });
        if (rpcErr) {
          await sb.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
        }
      } catch (eRpc) {
        try {
          await sb.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
        } catch (eUpd) {}
      }
    }

    // Overtrade ve yerel bildirimleri de okundu yap
    if (Array.isArray(window._allNotifications)) {
      window._allNotifications.forEach(function(item) {
        if (item.is_overtrade) {
          var otRaw = (item.rawId || item.id || '').toString();
          var otClean = otRaw.replace(/^ot_/, '');
          var otPref = 'ot_' + otClean;
          dismissClientNotif(otRaw);
          dismissClientNotif(otClean);
          dismissClientNotif(otPref);
          if (item.id) dismissClientNotif(item.id.toString());
          if (typeof window.dismissOvertradeWarning === 'function') {
            window.dismissOvertradeWarning(otClean);
            window.dismissOvertradeWarning(otPref);
          }
        }
        if (item.id && (item.id.toString().startsWith('prem_') || item.id.toString().startsWith('pay_'))) {
          dismissClientNotif(item.id.toString());
        }
        item.is_read = true;
      });
    }

    // Aktif overtrade uyarılarını da sıfırla
    window._activeOvertradeWarnings = [];

    if (typeof window.renderNotifications === 'function') {
      window.renderNotifications();
    }

    if (typeof showToast === 'function') {
      var lang = (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) ? i18n.getCurrentLanguage() : 'tr';
      var toastMsg = lang === 'en' ? 'All notifications marked as read' : lang === 'de' ? 'Alle Benachrichtigungen als gelesen markiert' : 'Tüm bildirimler okundu olarak işaretlendi';
      showToast(toastMsg, 'success');
    }
  } catch (err) {
    console.error('Mark all read error:', err);
  }
};

window.wwMarkAsRead = async function(e, id) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  try {
    var strId = id ? id.toString() : '';
    var item = (window._allNotifications || []).find(function(n) { 
      return n.id === id || n.rawId === id || (n.id && n.id.toString() === strId) || (n.rawId && n.rawId.toString() === strId); 
    });
    if (item) {
      item.is_read = true;
    }

    var isOt = strId.startsWith('ot_') || (item && item.is_overtrade);
    if (isOt) {
      var rawId = (item && item.rawId ? item.rawId : strId).toString();
      var cleanId = rawId.replace(/^ot_/, '');
      var prefixedId = 'ot_' + cleanId;

      dismissClientNotif(strId);
      dismissClientNotif(rawId);
      dismissClientNotif(cleanId);
      dismissClientNotif(prefixedId);

      if (typeof window.dismissOvertradeWarning === 'function') {
        window.dismissOvertradeWarning(cleanId);
        window.dismissOvertradeWarning(prefixedId);
        window.dismissOvertradeWarning(rawId);
      }

      if (Array.isArray(window._activeOvertradeWarnings)) {
        window._activeOvertradeWarnings = window._activeOvertradeWarnings.filter(function(w) {
          var wid = (w.id || w.type || '').toString();
          var wClean = wid.replace(/^ot_/, '');
          return wid !== strId && wid !== rawId && wid !== cleanId && wid !== prefixedId && wClean !== cleanId && w.type !== cleanId;
        });
      }
    } else if (strId.startsWith('prem_') || strId.startsWith('pay_')) {
      dismissClientNotif(strId);
    } else {
      var sb = window.sb || window.supabase;
      var user = window.SETTINGS_STATE?.currentUser;
      if (!user || !user.id) {
        try {
          var sess = await sb?.auth?.getSession();
          user = sess?.data?.session?.user;
        } catch (sessErr) {}
      }
      if (sb && user && user.id) {
        try {
          var { error: rpcErr } = await sb.rpc('mark_notification_as_read', { p_user_id: user.id, p_notification_id: id });
          if (rpcErr) {
            await sb.from('notifications').update({ is_read: true }).eq('id', id).eq('user_id', user.id);
          }
        } catch (eRpc) {
          try {
            await sb.from('notifications').update({ is_read: true }).eq('id', id).eq('user_id', user.id);
          } catch (eUpd) {}
        }
      }
    }

    if (typeof window.renderNotifications === 'function') {
      window.renderNotifications();
    }
  } catch (err) {
    console.error('Mark read error:', err);
  }
};

function formatNotifTime(dateInput) {
  try {
    var date = new Date(dateInput);
    if (isNaN(date.getTime())) return t('noti.just_now', 'Az önce');
    var diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSec < 60) return t('noti.just_now', 'Az önce');
    var diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
      var lang = (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) ? i18n.getCurrentLanguage() : 'tr';
      var minSuffix = lang === 'en' ? 'min ago' : lang === 'de' ? 'Min. zuvor' : 'dk önce';
      return diffMin + ' ' + minSuffix;
    }
    var diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return t('noti.hours_ago', '{h} saat önce', { h: diffHours });
    var diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return t('noti.days_ago', '{d} gün önce', { d: diffDays });
    var currentLang = (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) ? i18n.getCurrentLanguage() : 'tr';
    var locale = currentLang === 'en' ? 'en-US' : currentLang === 'de' ? 'de-DE' : 'tr-TR';
    return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  } catch(e) {
    return 'az önce';
  }
}

window.renderNotifications = function() {
  var body = document.getElementById('bell-panel-body');
  var badge = document.getElementById('bell-badge');
  var dot = document.getElementById('bell-dot');
  var bellBtn = document.getElementById('overtrade-bell-btn');
  var markReadBtn = document.getElementById('bell-mark-read-btn');
  var unreadPill = document.getElementById('bell-unread-pill');

  var all = window._allNotifications || [];
  var unreadList = all.filter(function(n) { return !n.is_read; });
  var riskList = all.filter(function(n) { return n.category === 'risk'; });
  var systemList = all.filter(function(n) { return n.category !== 'risk'; });

  // Tab sayılarını güncelle
  var cAll = document.getElementById('bell-tab-all-count');
  var cUnread = document.getElementById('bell-tab-unread-count');
  var cRisk = document.getElementById('bell-tab-risk-count');
  var cSys = document.getElementById('bell-tab-system-count');

  if (cAll) cAll.textContent = all.length;
  if (cUnread) cUnread.textContent = unreadList.length;
  if (cRisk) cRisk.textContent = riskList.length;
  if (cSys) cSys.textContent = systemList.length;

  // Rozet ve sayaç güncelle
  var totalUnread = unreadList.length;
  if (totalUnread > 0) {
    if (badge) {
      badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
      badge.style.display = 'flex';
    }
    if (dot) dot.style.display = 'none';
    if (bellBtn) bellBtn.classList.add('has-alert');
    if (markReadBtn) markReadBtn.style.display = 'inline-flex';
    if (unreadPill) {
      unreadPill.textContent = totalUnread + ' ' + t('noti.new_suffix', 'yeni');
      unreadPill.style.display = 'inline-block';
    }
  } else {
    if (badge) badge.style.display = 'none';
    if (dot) dot.style.display = 'none';
    if (bellBtn) bellBtn.classList.remove('has-alert');
    if (markReadBtn) markReadBtn.style.display = 'none';
    if (unreadPill) {
      unreadPill.textContent = t('noti.up_to_date', 'Güncel');
      unreadPill.style.display = 'none';
    }
  }

  if (!body) return;

  // Filtreleme
  var filtered = all;
  var currentTab = window.wwNotifTab || 'all';
  if (currentTab === 'unread') {
    filtered = unreadList;
  } else if (currentTab === 'risk') {
    filtered = riskList;
  } else if (currentTab === 'system') {
    filtered = systemList;
  }

  if (filtered.length === 0) {
    var emptyIcon = 'bell-off';
    var emptyTitle = t('noti.empty_title', 'Yeni Bildirim Yok');
    var emptyDesc = t('noti.empty_desc', 'Şu an için her şey yolunda görünüyor.');

    if (currentTab === 'unread') {
      emptyIcon = 'check-circle-2';
      emptyTitle = t('noti.empty_unread_title', 'Tüm Bildirimler Okundu!');
      emptyDesc = t('noti.empty_unread_desc', 'Okunmamış herhangi bir bildirim veya risk uyarınız bulunmuyor.');
    } else if (currentTab === 'risk') {
      emptyIcon = 'shield-check';
      emptyTitle = t('noti.empty_risk_title', 'Risk Uyarısı Bulunmuyor');
      emptyDesc = t('noti.empty_risk_desc', 'Tüm işlemleriniz ve overtrade risk limitleriniz güvenli seviyede.');
    } else if (currentTab === 'system') {
      emptyIcon = 'bell-off';
      emptyTitle = t('noti.empty_system_title', 'Sistem Bildirimi Yok');
      emptyDesc = t('noti.empty_system_desc', 'Hesabınız veya platform duyurularıyla ilgili yeni bir bildirim yok.');
    }

    body.innerHTML = `
      <div class="bell-panel-empty">
        <div class="bell-empty-icon-wrap">
          <i data-lucide="${emptyIcon}"></i>
        </div>
        <div class="bell-empty-title">${emptyTitle}</div>
        <div class="bell-empty-desc">${emptyDesc}</div>
      </div>
    `;
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    return;
  }

  var html = '';
  filtered.forEach(function(n) {
    var timeStr = formatNotifTime(n.created_at);
    var otStatsHtml = '';

    if (n.stats) {
      var isLoss = n.stats.type === 'daily_loss';
      var isOver = false;
      var curDisplay = '';
      var limDisplay = '';

      if (isLoss) {
        var absLoss = Math.abs(Number(n.stats.current) || 0);
        var numLimit = Number(n.stats.limit) || 0;
        isOver = absLoss >= numLimit;
        var cSym = (typeof window.getCurrencySymbol === 'function') ? window.getCurrencySymbol() : (window.currencySymbol || '$');
        var fLoss = (absLoss % 1 === 0) ? absLoss.toLocaleString() : absLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        var fLim = (numLimit % 1 === 0) ? numLimit.toLocaleString() : numLimit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        curDisplay = cSym + fLoss;
        limDisplay = cSym + fLim;
      } else {
        var numCur = Math.round(Number(n.stats.current) || 0);
        var numLim = Math.round(Number(n.stats.limit) || 0);
        isOver = numCur >= numLim;
        curDisplay = numCur.toLocaleString();
        limDisplay = numLim.toLocaleString();
      }

      var typeTitle = n.stats.type === 'daily_trades' ? t('overtrade.daily_trades', 'Günlük İşlem') :
                      n.stats.type === 'weekly_trades' ? t('overtrade.weekly_trades', 'Haftalık İşlem') :
                      n.stats.type === 'daily_loss' ? t('overtrade.loss', 'Günlük Kayıp') : t('noti.tab_risk', 'Risk Limiti');
      var limitExceededText = t('noti.limit_exceeded', 'LİMİT AŞILDI');
      otStatsHtml = `
        <div class="noti-ot-stats">
          <div class="noti-stat-chip ${isOver ? 'limit-danger' : ''}">
            <span class="noti-stat-cur">${curDisplay}</span>
            <span class="noti-stat-sep" style="opacity:0.4;">/</span>
            <span class="noti-stat-lim" style="opacity:0.8;">${limDisplay}</span>
          </div>
          <span class="noti-stat-chip">${typeTitle}</span>
          ${isOver ? `<span class="noti-stat-chip limit-danger">${limitExceededText}</span>` : ''}
        </div>
      `;
    }

    var markReadText = t('noti.mark_read_single', 'Okundu');
    html += `
      <div class="noti-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}">
        ${!n.is_read ? '<span class="noti-unread-dot"></span>' : ''}
        <div class="noti-icon ${n.iconType || n.type}">
          <i data-lucide="${n.iconName}"></i>
        </div>
        <div class="noti-content">
          <div class="noti-header-row">
            <span class="noti-tag ${n.tagClass || n.type}">${n.tagText}</span>
            ${!n.is_read ? `
              <button class="noti-mark-read" onclick="window.wwMarkAsRead(event, '${n.id}')" title="${markReadText}">
                <i data-lucide="check"></i>
                <span>${markReadText}</span>
              </button>
            ` : ''}
          </div>
          <h4 class="noti-title">${window.sanitizeHTML ? sanitizeHTML(n.title) : n.title}</h4>
          <div class="noti-desc">${window.sanitizeHTML ? sanitizeHTML(n.message) : n.message}</div>
          ${otStatsHtml}
          <div class="noti-bottom-row">
            <span class="noti-time">
              <i data-lucide="clock"></i>
              <span>${timeStr}</span>
            </span>
          </div>
        </div>
      </div>
    `;
  });

  body.innerHTML = html;
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
};

window.loadNotifications = async function() {
  try {
    var sb = window.sb || window.supabase;
    if (!sb) return;

    var user = window.SETTINGS_STATE?.currentUser;
    if (!user || !user.id) {
      try {
        var sessionRes = await sb.auth.getSession();
        user = sessionRes?.data?.session?.user || null;
        if (user) {
          if (!window.SETTINGS_STATE) window.SETTINGS_STATE = {};
          window.SETTINGS_STATE.currentUser = user;
          if (user.id) sessionStorage.setItem('ww_user_id', user.id);
        }
      } catch (sessErr) {
        console.warn('🔔 [loadNotifications] getSession hatası:', sessErr);
      }
    }

    if (user && user.id) {
      console.log('🔔 [loadNotifications] Oturum açık kullanıcı ID:', user.id);

      // Gerçek zamanlı bildirim dinleyicisi (Supabase Realtime)
      if (!window._wwNotifSubscribed) {
        window._wwNotifSubscribed = true;
        try {
          sb.channel('realtime_user_notifications_' + user.id)
            .on('postgres_changes', {
              event: '*',
              schema: 'public',
              table: 'notifications',
              filter: 'user_id=eq.' + user.id
            }, function(payload) {
              console.log('🔔 [loadNotifications Realtime] Veritabanından bildirim değişikliği:', payload);
              if (typeof window.loadNotifications === 'function') {
                window.loadNotifications();
              }
            })
            .subscribe();
        } catch (rtErr) {
          console.warn('🔔 [loadNotifications] Realtime dinleyici hatası:', rtErr);
        }
      }
    } else {
      console.warn('🔔 [loadNotifications] Oturum açmış kullanıcı bulunamadı.');
    }

    var combined = [];

    // 1. OverTrade risk uyarılarını topla
    var otWarnings = window._activeOvertradeWarnings;
    if (otWarnings === undefined && typeof window.checkOvertrade === 'function' && sb && user && user.id) {
      try {
        var isPrem = true;
        if (typeof window.getUserPlanSilent === 'function') {
          var planRes = await window.getUserPlanSilent();
          if (planRes && planRes.plan !== 'premium') {
            isPrem = false;
          }
        }
        if (isPrem) {
          var weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          var weekAgoStr = weekAgo.toISOString().split('T')[0];
          var trades = null;

          // ⚡ Eğer sayfada işlemler zaten önbelleğe alındıysa Supabase'e ek istek atma
          if (typeof window.wwCache !== 'undefined') {
            var activeJid = (typeof window.getActiveJournalId === 'function') ? window.getActiveJournalId() : localStorage.getItem('ww_active_journal_id');
            var cached = window.wwCache.get('trades', user.id, activeJid) || window.wwCache.get('trades', user.id, 'all');
            if (cached && Array.isArray(cached) && cached.length > 0) {
              trades = cached.filter(function(t) { return t.trade_date && t.trade_date >= weekAgoStr; });
            }
          }

          if (!trades) {
            var { data: fetchedTrades } = await sb
              .from('trades')
              .select('trade_date,entry_price,exit_price,lot,direction,instrument,multiplier')
              .eq('user_id', user.id)
              .gte('trade_date', weekAgoStr)
              .order('trade_date', { ascending: false });
            trades = fetchedTrades;
          }

          if (trades) {
            otWarnings = window.checkOvertrade(trades) || [];
          } else {
            otWarnings = [];
          }
        } else {
          otWarnings = [];
        }
        window._activeOvertradeWarnings = otWarnings;
      } catch (otErr) {
        otWarnings = [];
        window._activeOvertradeWarnings = [];
      }
    }
    if (!otWarnings) otWarnings = [];

    if (Array.isArray(otWarnings)) {
      otWarnings.forEach(function(w) {
        var isDanger = w.level === 'danger';
        var otId = (w.id || w.type || 'warning').toString();
        var cleanOtId = otId.replace(/^ot_/, '');
        var prefixedOtId = 'ot_' + cleanOtId;

        var isDismissed = false;
        if (typeof window.isOvertradeWarningDismissed === 'function') {
          isDismissed = window.isOvertradeWarningDismissed(otId) ||
                        window.isOvertradeWarningDismissed(cleanOtId) ||
                        window.isOvertradeWarningDismissed(prefixedOtId);
        }
        if (!isDismissed && typeof isClientNotifDismissed === 'function') {
          isDismissed = isClientNotifDismissed(otId) ||
                        isClientNotifDismissed(cleanOtId) ||
                        isClientNotifDismissed(prefixedOtId);
        }

        var criticalText = t('noti.tag_critical', 'KRİTİK RİSK');
        var warningText = t('noti.tag_warning', 'RİSK UYARISI');
        var critTitle = t('noti.overtrade_warning_title', 'Kritik Risk Limiti Aşıldı!');
        var warnTitle = t('noti.overtrade_warning_title', 'Over Trade Uyarısı');

        var msg = w.message || 'Belirlenen işlem limitinize yaklaştınız.';
        if (w.type === 'daily_loss') {
          var cSym = (typeof window.getCurrencySymbol === 'function') ? window.getCurrencySymbol() : (window.currencySymbol || '$');
          var absCur = Math.abs(Number(w.current) || 0);
          var numLim = Number(w.limit) || 0;
          var fLoss = cSym + (absCur % 1 === 0 ? absCur.toLocaleString() : absCur.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
          var fLim = cSym + (numLim % 1 === 0 ? numLim.toLocaleString() : numLim.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
          msg = (typeof t === 'function')
            ? t('overtrade.daily_loss_warning', 'Bugün {{loss}} kaybettin. Günlük kayıp limitin {{limit}}!', { loss: fLoss, limit: fLim })
            : ('Bugün ' + fLoss + ' kaybettin. Günlük kayıp limitin ' + fLim + '!');
        }

        combined.push({
          id: prefixedOtId,
          rawId: otId,
          category: 'risk',
          type: isDanger ? 'danger' : 'warning',
          tagText: isDanger ? criticalText : warningText,
          iconName: isDanger ? 'octagon-alert' : 'triangle-alert',
          title: isDanger ? critTitle : warnTitle,
          message: msg,
          stats: { current: Math.abs(Number(w.current) || 0), limit: Number(w.limit) || 0, type: w.type },
          is_read: isDismissed,
          created_at: Date.now(),
          is_overtrade: true
        });
      });
    }

    // 2. Supabase sistem & kullanıcı bildirimlerini topla (notifications tablosu)
    if (sb && user && user.id) {
      var { data: notis, error } = await sb
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.warn('⚠️ [loadNotifications] notifications tablosu sorgu hatası:', error);
      } else {
        console.log('✅ [loadNotifications] notifications tablosundan çekilen kayıt sayısı:', notis ? notis.length : 0);
      }

      if (!error && Array.isArray(notis)) {
        notis.forEach(function(n) {
          var isPartner = (n.type === 'partner') || (n.title_key && n.title_key.indexOf('partner') !== -1);
          var isRisk = !isPartner && (n.type === 'error' || n.type === 'warning' || n.type === 'danger');
          var iconName = 'bell';
          var tagText = t('noti.tag_info', 'SİSTEM');
          var tagClass = isPartner ? 'partner' : (n.type || 'info');
          var iconType = n.type || 'info';

          if (isPartner) {
            tagText = t('noti.tag_partner', 'PARTNER');
            tagClass = 'partner';
            if (n.type === 'success' || (n.title_key && n.title_key.indexOf('approved') !== -1)) {
              iconName = 'award';
              iconType = 'success';
            } else {
              iconName = 'info';
              iconType = 'warning';
            }
          } else if (n.type === 'success') { iconName = 'check-circle-2'; tagText = t('noti.tag_success', 'BAŞARILI'); }
          else if (n.type === 'error' || n.type === 'danger') { iconName = 'alert-circle'; tagText = t('noti.tag_critical', 'KRİTİK RİSK'); tagClass = 'danger'; iconType = 'danger'; }
          else if (n.type === 'warning') { iconName = 'alert-triangle'; tagText = t('noti.tag_warning', 'RİSK UYARISI'); }
          else if (n.type === 'finance') { iconName = 'wallet'; tagText = t('noti.tag_finance', 'FİNANS'); }
          else if (n.type === 'premium' || (n.title_key && n.title_key.indexOf('premium') !== -1)) { iconName = 'crown'; tagText = t('noti.tag_premium', 'PREMİUM'); tagClass = 'premium'; iconType = 'premium'; }
          else { iconName = 'info'; tagText = t('noti.tag_info', 'SİSTEM'); }

          var helperT = typeof t === 'function' ? t : function(k, f, p) { return f || k; };
          var metaData = Object.assign({}, n.meta_data || {});
          if (!metaData.plan) {
            var curLangCode = (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) ? i18n.getCurrentLanguage() : 'tr';
            metaData.plan = curLangCode === 'en' ? '1-month' : (curLangCode === 'de' ? '1-monatiges' : '1 aylık');
          }

          var title = n.title || (n.title_key ? helperT(n.title_key, n.title_key, metaData) : null) || 'Bildirim';
          var desc = n.message || n.description || (n.message_key ? helperT(n.message_key, n.message_key, metaData) : '') || '';

          var createdTs = n.created_at ? (typeof n.created_at === 'number' ? n.created_at : new Date(n.created_at).getTime()) : Date.now();

          combined.push({
            id: n.id,
            rawId: n.id,
            category: isRisk ? 'risk' : 'system',
            type: n.type === 'error' ? 'danger' : (n.type || 'info'),
            tagClass: tagClass,
            iconType: iconType,
            tagText: tagText,
            iconName: iconName,
            title: title,
            message: desc,
            stats: null,
            is_read: !!n.is_read,
            created_at: isNaN(createdTs) ? Date.now() : createdTs,
            is_overtrade: false
          });
        });
      }
    }

    // 3. Premium süre & abonelik kontrolü
    if (sb && user && user.id) {
      try {
        var profile = window.__wwUserProfile;
        if (!profile || profile.id !== user.id) {
          var { data: pData } = await sb
            .from('user_profiles')
            .select('id, plan, plan_expires_at')
            .eq('id', user.id)
            .single();
          if (pData) profile = pData;
        }

        if (profile && profile.plan === 'premium' && profile.plan_expires_at) {
          var expDate = new Date(profile.plan_expires_at);
          var now = new Date();
          var diffMs = expDate.getTime() - now.getTime();
          var daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

          if (daysLeft <= 0) {
            var expId = 'prem_expired_' + user.id + '_' + expDate.toISOString().slice(0, 10);
            combined.push({
              id: expId,
              rawId: expId,
              category: 'system',
              type: 'warning',
              tagText: t('noti.tag_premium', 'PREMİUM'),
              iconName: 'hourglass',
              title: t('noti.premium_expired_title', 'Premium Süreniz Sona Erdi'),
              message: t('noti.premium_expired_desc', 'Premium üyeliğinizin süresi doldu. Özellikleri kesintisiz kullanmak için planınızı yenileyebilirsiniz.'),
              stats: null,
              is_read: isClientNotifDismissed(expId),
              created_at: expDate.getTime(),
              is_overtrade: false
            });
          } else if (daysLeft <= 7) {
            var expiringId = 'prem_expiring_' + user.id + '_' + daysLeft + '_' + expDate.toISOString().slice(0, 10);
            combined.push({
              id: expiringId,
              rawId: expiringId,
              category: 'system',
              type: 'warning',
              tagText: t('noti.tag_premium', 'PREMİUM'),
              iconName: 'crown',
              title: t('noti.premium_expiring_title', 'Premium Süresi Doluyor'),
              message: t('noti.premium_expiring_desc', 'Premium aboneliğinizin bitmesine {days} gün kaldı.', { days: daysLeft }),
              stats: null,
              is_read: isClientNotifDismissed(expiringId),
              created_at: Date.now() - 1800000,
              is_overtrade: false
            });
          }
        }
      } catch (premErr) {
        console.warn('Premium notification check error:', premErr);
      }
    }

    // 4. Finans & Ödeme bildirimleri (payments tablosundan)
    if (sb && user && user.id) {
      try {
        var { data: userPayments } = await sb
          .from('payments')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5);

        if (Array.isArray(userPayments)) {
          var existingRawIds = new Set(combined.map(function(c) { return c.rawId; }));

          userPayments.forEach(function(p) {
            if (existingRawIds.has(p.id) || (p.invoice_id && existingRawIds.has(p.invoice_id))) {
              return;
            }

            var pId = 'pay_' + p.id;
            var isRead = isClientNotifDismissed(pId);
            var pDate = p.created_at ? new Date(p.created_at).getTime() : Date.now();
            var isFinished = p.payment_status === 'finished' || p.payment_status === 'confirmed';
            var isFailed = p.payment_status === 'failed' || p.payment_status === 'expired';
            var isYearly = (p.plan_type === 'yearly' || p.plan_type === 'year');
            var curLang = (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) ? i18n.getCurrentLanguage() : 'tr';
            var planLabel = isYearly 
              ? (curLang === 'en' ? '1-year' : curLang === 'de' ? '1-jähriges' : '1 yıllık')
              : (curLang === 'en' ? '1-month' : curLang === 'de' ? '1-monatiges' : '1 aylık');
            var pAmt = p.paid_amount || p.amount || 0;
            var pCurr = p.paid_currency || p.currency || 'USD';

            if (isFinished) {
              combined.push({
                id: pId,
                rawId: p.id,
                category: 'system',
                type: 'premium',
                tagClass: 'premium',
                iconType: 'premium',
                tagText: t('noti.tag_premium', 'PREMİUM'),
                iconName: 'crown',
                title: t('noti.payment_success_title', 'Premiuma Hoş Geldin'),
                message: t('noti.payment_success_desc', '{plan} premium abonelik için teşekkürler', {
                  plan: planLabel,
                  amount: pAmt,
                  curr: pCurr
                }),
                stats: null,
                is_read: isRead,
                created_at: pDate,
                is_overtrade: false
              });
            } else if (isFailed) {
              combined.push({
                id: pId,
                rawId: p.id,
                category: 'system',
                type: 'warning',
                tagText: t('noti.tag_finance', 'FİNANS'),
                iconName: 'alert-circle',
                title: t('noti.payment_failed_title', 'Ödeme Tamamlanamadı'),
                message: t('noti.payment_failed_desc', '{plan} Premium ödeme işleminiz zaman aşımına uğradı veya tamamlanamadı.', {
                  plan: planLabel
                }),
                stats: null,
                is_read: isRead,
                created_at: pDate,
                is_overtrade: false
              });
            }
          });
        }
      } catch (payErr) {
        console.warn('Payments notification check error:', payErr);
      }
    }

    // Tarihe göre yeniden eskiye sırala (timestamp ms sayı karşılaştırması)
    combined.sort(function(a, b) {
      var timeA = typeof a.created_at === 'number' ? a.created_at : (new Date(a.created_at).getTime() || 0);
      var timeB = typeof b.created_at === 'number' ? b.created_at : (new Date(b.created_at).getTime() || 0);
      return timeB - timeA;
    });

    window._allNotifications = combined;
    window.renderNotifications();
  } catch (err) {
    console.error('Load notifications error:', err);
  }
};

// Doğrulama ve test için konsoldan çağrılabilir yardımcı
window.testSendNotification = async function(type, title, message) {
  var sb = window.sb || window.supabase;
  var user = window.SETTINGS_STATE?.currentUser;
  if (!user || !user.id) {
    var s = await sb?.auth?.getSession();
    user = s?.data?.session?.user;
  }
  if (!sb || !user || !user.id) {
    console.error('❌ Oturum açmış kullanıcı bulunamadı! Lütfen önce giriş yapın.');
    return;
  }
  var { data, error } = await sb.from('notifications').insert([{
    user_id: user.id,
    type: type || 'info',
    title_key: title || 'Test Bildirimi',
    message_key: message || 'Bu bir test sistem bildirimidir.',
    meta_data: {},
    is_read: false
  }]).select();
  if (error) {
    console.error('❌ Bildirim eklenirken hata oluştu:', error);
  } else {
    console.log('✅ Bildirim veritabanına eklendi:', data);
    await window.loadNotifications();
  }
};

var _lastBadgeFetch = 0;
var _isFetchingBadge = false;

window.updateNotificationBadge = async function(force) {
  try {
    var now = Date.now();
    if (!force && (now - _lastBadgeFetch < 4000 || _isFetchingBadge)) {
      return;
    }
    _isFetchingBadge = true;
    _lastBadgeFetch = now;

    await window.loadNotifications();
  } catch (err) {
    // Graceful error handling
  } finally {
    _isFetchingBadge = false;
  }
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

function t(key, fallback, params) {
  var val = fallback || key || '';
  if (typeof i18n !== 'undefined' && i18n.t && key) {
    var translated = i18n.t(key, params);
    if (translated && translated !== key) val = translated;
  }
  if (typeof val === 'string' && params && typeof params === 'object') {
    for (var k in params) {
      val = val.replace(new RegExp('\\{+' + k + '\\}+', 'g'), params[k]);
    }
  }
  return typeof val === 'string' ? val : String(val || '');
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

  var menuGeneral = tt('nav.menu_general', 'GENEL');
  var menuPremium = tt('nav.menu_premium', 'PREMIUM');
  var menuAccount = tt('nav.menu_account', 'HESAP');

  return `
    <nav class="nav">
      <a href="/index.html" class="nav-logo" title="Wawe Journal - Ana Sayfa">
        <div class="logo-icon">
          <i data-lucide="trending-up" class="logo-icon-svg"></i>
        </div>
      </a>
      
      <div class="nav-links">
        <a href="/dashboard.html" data-page="dashboard"><span data-i18n="nav.dashboard">${tt('nav.dashboard', 'Dashboard')}</span></a>
        <a href="/trades.html" data-page="trades"><span data-i18n="nav.trades">${tt('nav.trades', 'İşlemler')}</span></a>
        <a href="/strategies.html" data-page="strategies"><span data-i18n="nav.strategies">${tt('nav.strategies', 'Stratejiler')}</span></a>
        <a href="/calendar.html" data-page="calendar"><span data-i18n="nav.calendar">${tt('nav.calendar', 'Takvim')}</span></a>
      </div>
      
      <div class="nav-right">
        <div class="nav-dropdown">
          <button class="nav-dropdown-btn" id="premium-dropdown-btn" aria-haspopup="true" aria-expanded="false" onclick="wwTogglePremium(event, this)">
            <i data-lucide="crown" class="nav-icon" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.premium">${tt('nav.premium', 'Premium')}</span>
            <i data-lucide="chevron-down" class="dropdown-arrow" style="width:12px;height:12px;"></i>
          </button>
          <div class="nav-dropdown-menu premium-menu-glass" id="premium-dropdown-menu" role="menu">
            <div class="premium-menu-header">
              <span class="premium-menu-title" data-i18n="nav.premium_features">${tt('nav.premium_features', 'Premium Özellikler')}</span>
              <span class="premium-menu-tag">PRO</span>
            </div>
            <div class="premium-menu-items">
              <a href="/premium-dashboard.html" class="premium-menu-item" role="menuitem">
                <div class="p-item-icon">
                  <i data-lucide="layout-dashboard"></i>
                </div>
                <div class="p-item-content">
                  <span class="p-item-title" data-i18n="nav.premium_dashboard">${tt('nav.premium_dashboard', 'Premium Dashboard')}</span>
                </div>
              </a>
              <a href="/settings.html#panel-appearance" class="premium-menu-item" role="menuitem">
                <div class="p-item-icon">
                  <i data-lucide="palette"></i>
                </div>
                <div class="p-item-content">
                  <span class="p-item-title" data-i18n="nav.theme_customization">${tt('nav.theme_customization', 'Tema Özelleştirme')}</span>
                </div>
              </a>
              <a href="/settings.html#panel-overtrade" class="premium-menu-item" role="menuitem">
                <div class="p-item-icon">
                  <i data-lucide="shield-alert"></i>
                </div>
                <div class="p-item-content">
                  <span class="p-item-title" data-i18n="nav.overtrade_alert">${tt('nav.overtrade_alert', 'Over Trade Uyarısı')}</span>
                </div>
              </a>
            </div>
            <div class="premium-menu-footer">
              <a href="/settings.html#panel-plan" class="premium-upgrade-cta" role="menuitem">
                <i data-lucide="sparkles" class="cta-sparkle"></i>
                <span data-i18n="nav.upgrade_premium">${tt('nav.upgrade_premium', "Premium'a Geç →")}</span>
              </a>
            </div>
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
            <i data-lucide="bell" class="nav-bell-icon"></i>
            <span class="bell-badge" id="bell-badge" style="display:none;">0</span>
          </button>
          <div class="bell-panel" id="bell-panel" role="dialog" aria-label="Bildirim Paneli">
            <div class="bell-panel-header">
              <div class="bell-panel-title-wrap">
                <div class="bell-panel-title-text">
                  <h3 data-i18n="nav.notifications">${tt('nav.notifications', 'Bildirimler')}</h3>
                  <span class="bell-unread-pill" id="bell-unread-pill" style="display:none;">0 yeni</span>
                </div>
              </div>
              <div class="bell-panel-header-actions">
                <button class="bell-mark-read-btn" id="bell-mark-read-btn" style="display:none;" onclick="window.wwMarkAllAsRead()" title="Tümünü Okundu İşaretle">
                  <i data-lucide="check-check"></i>
                  <span data-i18n="nav.mark_read">${tt('nav.mark_read', 'Tümünü Oku')}</span>
                </button>
                <button class="bell-panel-close" id="bell-panel-close" title="Kapat" aria-label="Kapat">
                  <i data-lucide="x"></i>
                </button>
              </div>
            </div>
            <div class="bell-filter-tabs" id="bell-filter-tabs">
              <button type="button" class="bell-tab-btn active" data-tab="all" onclick="window.wwSwitchNotifTab('all')">
                <span data-i18n="noti.tab_all">${tt('noti.tab_all', 'Tümü')}</span>
                <span class="tab-count" id="bell-tab-all-count">0</span>
              </button>
              <button type="button" class="bell-tab-btn" data-tab="unread" onclick="window.wwSwitchNotifTab('unread')">
                <span data-i18n="noti.tab_unread">${tt('noti.tab_unread', 'Okunmamış')}</span>
                <span class="tab-count" id="bell-tab-unread-count">0</span>
              </button>
              <button type="button" class="bell-tab-btn" data-tab="risk" onclick="window.wwSwitchNotifTab('risk')">
                <span data-i18n="noti.tab_risk">${tt('noti.tab_risk', 'Risk & Limit')}</span>
                <span class="tab-count" id="bell-tab-risk-count">0</span>
              </button>
              <button type="button" class="bell-tab-btn" data-tab="system" onclick="window.wwSwitchNotifTab('system')">
                <span data-i18n="noti.tab_system">${tt('noti.tab_system', 'Sistem')}</span>
                <span class="tab-count" id="bell-tab-system-count">0</span>
              </button>
            </div>
            <div class="bell-panel-body" id="bell-panel-body">
              <div class="bell-panel-empty">
                <div class="bell-empty-icon-wrap">
                  <i data-lucide="bell-off"></i>
                </div>
                <div class="bell-empty-title" data-i18n="noti.empty_title">${tt('noti.empty_title', 'Yeni Bildirim Yok')}</div>
                <div class="bell-empty-desc" data-i18n="noti.empty_desc">${tt('noti.empty_desc', 'Şu an için her şey yolunda görünüyor.')}</div>
              </div>
            </div>
            <div class="bell-panel-footer">
              <a href="/settings.html#panel-overtrade" class="bell-footer-link" onclick="window.wwGoToOvertradeSettings(event)">
                <i data-lucide="sliders-horizontal"></i>
                <span data-i18n="noti.overtrade_settings">${tt('noti.overtrade_settings', 'Overtrade ve Risk Ayarları')}</span>
              </a>
            </div>
          </div>
        </div>
        
        <div class="plan-badge" id="plan-badge" role="button" tabindex="0" aria-label="Abonelik Planı">
          <span class="plan-dot"></span>
          <span class="plan-text" id="plan-text">${tt('nav.free_badge', 'Ücretsiz')}</span>
          <div class="plan-badge-tooltip" id="plan-badge-tooltip" role="tooltip">
            <div class="plan-tooltip-title" id="plan-tooltip-title">${tt('nav.plan_tooltip_free', 'Ücretsiz Plan')}</div>
            <div class="plan-tooltip-sub" id="plan-tooltip-sub">${tt('nav.plan_tooltip_free_desc', 'Sınırsız Süre')}</div>
          </div>
        </div>
        
        <div class="user-avatar" id="user-avatar" role="button" tabindex="0" aria-haspopup="true" aria-expanded="false" onclick="window.wwToggleAvatar(event, this)">
          <span id="nav-avatar-text" style="font-size:13px;font-weight:600;">?</span>
        </div>
        
        <div class="dropdown-menu" id="dropdown-menu">
          <a href="/settings.html#panel-profile" class="dropdown-item">
            <i data-lucide="user" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.profile">${tt('nav.profile', 'Profil')}</span>
          </a>
          <a href="/settings.html" class="dropdown-item">
            <i data-lucide="settings" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.settings">${tt('nav.settings', 'Ayarlar')}</span>
          </a>
          <a href="/my-earnings.html" class="dropdown-item">
            <i data-lucide="dollar-sign" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.earnings">${tt('nav.earnings', 'Kazançlarım')}</span>
          </a>
          <span id="admin-link" style="display:none;">
            <a href="/admin.html" class="dropdown-item">
              <i data-lucide="shield" style="width:16px;height:16px;"></i>
              <span data-i18n="nav.admin">${tt('nav.admin', 'Admin')}</span>
            </a>
          </span>
          <div class="dropdown-divider"></div>
          <a href="/settings.html#panel-plan" class="dropdown-item" style="color:var(--accent2);">
            <i data-lucide="crown" style="width:16px;height:16px;"></i>
            <span data-i18n="nav.upgrade_premium">${tt('nav.upgrade_premium', "Premium'a Geç →")}</span>
          </a>
          <div class="dropdown-divider"></div>
          <button class="dropdown-item" id="logout-dropdown-btn">
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
              <span class="plan-text">${tt('nav.free_badge', 'Ücretsiz')}</span>
            </div>
          </div>
        </div>

        <a href="/journals.html" class="menu-journal-link" id="menu-journal-link" onclick="closeMobileMenuAndNavigate(event, '/journals.html')">
          <i data-lucide="folder" class="menu-journal-icon"></i>
          <span class="menu-journal-info">
            <span class="menu-journal-label" data-i18n="nav.current_account">${tt('nav.current_account', 'Aktif Hesap')}</span>
            <span class="menu-journal-name" id="menu-journal-name">Ana Hesap</span>
          </span>
          <i data-lucide="chevron-right" class="menu-journal-arrow"></i>
        </a>

        <div class="menu-section">
          <div class="menu-section-title" data-i18n="nav.menu_general">${menuGeneral}</div>
          <a href="/index.html" onclick="closeMobileMenuAndNavigate(event, '/index.html')">
            <i data-lucide="home" style="width:16px;height:16px;"></i> <span data-i18n="nav.home">${tt('nav.home', 'Ana Sayfa')}</span>
          </a>
          <a href="/dashboard.html" onclick="closeMobileMenuAndNavigate(event, '/dashboard.html')">
            <i data-lucide="layout-dashboard" style="width:16px;height:16px;"></i> <span data-i18n="nav.dashboard">${tt('nav.dashboard', 'Dashboard')}</span>
          </a>
          <a href="/trades.html" onclick="closeMobileMenuAndNavigate(event, '/trades.html')">
            <i data-lucide="list" style="width:16px;height:16px;"></i> <span data-i18n="nav.trades">${tt('nav.trades', 'İşlemler')}</span>
          </a>
          <a href="/strategies.html" onclick="closeMobileMenuAndNavigate(event, '/strategies.html')">
            <i data-lucide="target" style="width:16px;height:16px;"></i> <span data-i18n="nav.strategies">${tt('nav.strategies', 'Stratejiler')}</span>
          </a>
          <a href="/calendar.html" onclick="closeMobileMenuAndNavigate(event, '/calendar.html')">
            <i data-lucide="calendar" style="width:16px;height:16px;"></i> <span data-i18n="nav.calendar">${tt('nav.calendar', 'Takvim')}</span>
          </a>
        </div>

        <div class="menu-section">
          <div class="menu-section-title" data-i18n="nav.menu_premium">${menuPremium}</div>
          <a href="/premium-dashboard.html" onclick="closeMobileMenuAndNavigate(event, '/premium-dashboard.html')">
            <i data-lucide="layout-dashboard" style="width:16px;height:16px;"></i> <span data-i18n="nav.premium_dashboard">${tt('nav.premium_dashboard', 'Premium Dashboard')}</span>
          </a>
          <a href="/settings.html#panel-appearance" onclick="closeMobileMenuAndNavigate(event, '/settings.html#panel-appearance')">
            <i data-lucide="palette" style="width:16px;height:16px;"></i> <span data-i18n="nav.theme_customization">${tt('nav.theme_customization', 'Tema Özelleştirme')}</span>
          </a>
          <a href="/settings.html#panel-overtrade" onclick="closeMobileMenuAndNavigate(event, '/settings.html#panel-overtrade')">
            <i data-lucide="bell" style="width:16px;height:16px;"></i> <span data-i18n="nav.overtrade_alert">${tt('nav.overtrade_alert', 'Over Trade Uyarısı')}</span>
          </a>
          <a href="/settings.html#panel-plan" class="go-premium" onclick="closeMobileMenuAndNavigate(event, '/settings.html#panel-plan')">
            <i data-lucide="rocket" style="width:16px;height:16px;"></i> <span data-i18n="nav.upgrade_premium">${tt('nav.upgrade_premium', "Premium'a Geç →")}</span>
          </a>
        </div>

        <div class="menu-section">
          <div class="menu-section-title" data-i18n="nav.menu_account">${menuAccount}</div>
          <a href="/settings.html#panel-profile" onclick="closeMobileMenuAndNavigate(event, '/settings.html#panel-profile')">
            <i data-lucide="user" style="width:16px;height:16px;"></i> <span data-i18n="nav.profile">${tt('nav.profile', 'Profil')}</span>
          </a>
          <a href="/settings.html" onclick="closeMobileMenuAndNavigate(event, '/settings.html')">
            <i data-lucide="settings" style="width:16px;height:16px;"></i> <span data-i18n="nav.settings">${tt('nav.settings', 'Ayarlar')}</span>
          </a>
          <a href="/my-earnings.html" onclick="closeMobileMenuAndNavigate(event, '/my-earnings.html')">
            <i data-lucide="dollar-sign" style="width:16px;height:16px;"></i> <span data-i18n="nav.earnings">${tt('nav.earnings', 'Kazançlarım')}</span>
          </a>
          <span id="admin-link-mobile" style="display:none;">
            <a href="/admin.html" onclick="closeMobileMenuAndNavigate(event, '/admin.html')">
              <i data-lucide="shield" style="width:16px;height:16px;"></i> <span data-i18n="nav.admin">${tt('nav.admin', 'Admin')}</span>
            </a>
          </span>
          <button id="logout-btn-mobile">
            <i data-lucide="log-out" style="width:16px;height:16px;"></i> <span data-i18n="nav.logout">${tt('nav.logout', 'Çıkış Yap')}</span>
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

  if (typeof window.renderNotifications === 'function') {
    try { window.renderNotifications(); } catch(e) {}
  }

  if (typeof updateNavbarJournal === 'function') {
    try { updateNavbarJournal(0); } catch(e) {}
  }

  updateNavbarBadgeSync();
}

if (typeof window !== 'undefined') {
  if (window.i18n && typeof window.i18n.onChange === 'function') {
    window.i18n.onChange(function() {
      updateNavbarI18n();
    });
  } else if (window.i18nReady && typeof window.i18nReady.then === 'function') {
    window.i18nReady.then(function() {
      if (window.i18n && typeof window.i18n.onChange === 'function') {
        window.i18n.onChange(function() {
          updateNavbarI18n();
        });
      }
    });
  }
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

    var storedUserId = sessionStorage.getItem('ww_user_id');
    var storedDisplayName = sessionStorage.getItem('ww_user_display_name');
    var storedAvatar = sessionStorage.getItem('ww_avatar_url');
    var storedTime = sessionStorage.getItem('ww_avatar_time');
    var storedIsAdmin = sessionStorage.getItem('ww_user_is_admin');
    var now = Date.now();

    if (storedDisplayName || storedUserId) {
      if (!window.SETTINGS_STATE) window.SETTINGS_STATE = {};
      if (!window.SETTINGS_STATE.currentUser) {
        window.SETTINGS_STATE.currentUser = {
          id: storedUserId || null,
          user_metadata: { username: storedDisplayName || '' }
        };
      } else if (!window.SETTINGS_STATE.currentUser.id && storedUserId) {
        window.SETTINGS_STATE.currentUser.id = storedUserId;
      }
    }

    if (storedTime && (now - parseInt(storedTime, 10)) < 300000 && storedUserId) {
      var av = (storedAvatar && storedAvatar !== 'none') ? storedAvatar : null;
      cachedAvatarUrl = av;
      applyAvatarToNav(av);
      if (storedIsAdmin === 'true') {
        var al = document.getElementById('admin-link');
        var alm = document.getElementById('admin-link-mobile');
        if (al) al.style.display = 'inline';
        if (alm) alm.style.display = 'block';
      }
      return;
    }

    var sessionRes = await sb.auth.getSession();
    var user = sessionRes?.data?.session?.user;
    if (!user) return;

    if (!window.SETTINGS_STATE) window.SETTINGS_STATE = {};
    window.SETTINGS_STATE.currentUser = user;
    if (user.id) sessionStorage.setItem('ww_user_id', user.id);
    
    var isAdminUser = (user?.app_metadata?.role === 'admin');
    sessionStorage.setItem('ww_user_is_admin', isAdminUser ? 'true' : 'false');
    if (isAdminUser) {
      var al = document.getElementById('admin-link');
      var alm = document.getElementById('admin-link-mobile');
      if (al) al.style.display = 'inline';
      if (alm) alm.style.display = 'block';
    }

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

function updateBadgeUI(isPremium, expiresAt) {
  var badge = document.getElementById('plan-badge');
  var text = document.getElementById('plan-text');
  var menuPlan = document.getElementById('menu-user-plan');
  var tipTitle = document.getElementById('plan-tooltip-title');
  var tipSub = document.getElementById('plan-tooltip-sub');

  if (window.SETTINGS_STATE) window.SETTINGS_STATE.isPremium = isPremium;

  if (badge) {
    if (isPremium) badge.classList.add('premium');
    else badge.classList.remove('premium');
  }

  var premiumText = t('nav.premium_badge', 'Premium');
  var freeText = t('nav.free_badge', 'Free');

  if (text) text.textContent = isPremium ? premiumText : freeText;

  // Tooltip içeriğini güncelle (kalan süre ve bitiş tarihi)
  if (tipTitle && tipSub) {
    var currentLang = (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) ? i18n.getCurrentLanguage() : 'tr';
    var locale = currentLang === 'en' ? 'en-US' : currentLang === 'de' ? 'de-DE' : 'tr-TR';

    if (!isPremium) {
      tipTitle.textContent = t('nav.plan_tooltip_free', 'Ücretsiz Plan');
      tipSub.textContent = t('nav.plan_tooltip_free_desc', 'Sınırsız Süre');
    } else if (!expiresAt) {
      tipTitle.textContent = t('nav.plan_tooltip_premium', 'Premium Üyelik');
      tipSub.textContent = t('nav.plan_tooltip_lifetime', 'Sınırsız Erişim');
    } else {
      var exp = new Date(expiresAt);
      if (isNaN(exp.getTime())) {
        tipTitle.textContent = t('nav.plan_tooltip_premium', 'Premium Üyelik');
        tipSub.textContent = t('nav.plan_tooltip_lifetime', 'Sınırsız Erişim');
      } else {
        var diffMs = exp.getTime() - Date.now();
        if (diffMs <= 0) {
          tipTitle.textContent = t('nav.plan_tooltip_expired', 'Süresi Doldu');
          tipSub.textContent = t('nav.plan_tooltip_expires', 'Bitiş: {date}', {
            date: exp.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
          });
        } else {
          var daysLeft = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          var dateStr = exp.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
          if (daysLeft > 0) {
            tipTitle.textContent = t('nav.plan_tooltip_days_left', '{d} gün kaldı', { d: daysLeft });
            tipSub.textContent = t('nav.plan_tooltip_expires', 'Bitiş: {date}', { date: dateStr });
          } else {
            var hoursLeft = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60)));
            tipTitle.textContent = t('nav.plan_tooltip_hours_left', '{h} saat kaldı', { h: hoursLeft });
            tipSub.textContent = t('nav.plan_tooltip_expires', 'Bitiş: {date}', {
              date: exp.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
            });
          }
        }
      }
    }
  }

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
    var storedExp = sessionStorage.getItem('ww_user_plan_expires_at');
    var storedPlanTime = sessionStorage.getItem('ww_user_plan_time');
    if (storedPlan && storedPlanTime && (now - parseInt(storedPlanTime, 10)) < 300000) {
      updateBadgeUI(storedPlan === 'premium', storedExp || null);
      return;
    }

    if (window.__wwUserProfile && window.__wwUserProfile.plan) {
      var isPrem = window.__wwUserProfile.plan === 'premium';
      var expVal = window.__wwUserProfile.plan_expires_at || null;
      sessionStorage.setItem('ww_user_plan', isPrem ? 'premium' : 'free');
      sessionStorage.setItem('ww_user_plan_expires_at', expVal || '');
      sessionStorage.setItem('ww_user_plan_time', String(now));
      updateBadgeUI(isPrem, expVal);
      return;
    }

    var sb = window.sb || window.supabase;
    if (!sb) { updateNavbarBadgeSync(); return; }

    var sessionRes = await sb.auth.getSession();
    var user = sessionRes?.data?.session?.user;
    if (!user) { updateNavbarBadgeSync(); return; }

    var { data: profile } = await sb.from('user_profiles').select('plan, plan_expires_at').eq('id', user.id).single();
    var isPremium = profile?.plan === 'premium';
    var expiresAt = profile?.plan_expires_at || null;

    try {
      sessionStorage.setItem('ww_user_plan', isPremium ? 'premium' : 'free');
      sessionStorage.setItem('ww_user_plan_expires_at', expiresAt || '');
      sessionStorage.setItem('ww_user_plan_time', String(Date.now()));
    } catch (e) {}

    updateBadgeUI(isPremium, expiresAt);
  } catch (e) {
    var fallbackPlan = sessionStorage.getItem('ww_user_plan');
    var fallbackExp = sessionStorage.getItem('ww_user_plan_expires_at');
    if (fallbackPlan) updateBadgeUI(fallbackPlan === 'premium', fallbackExp || null);
    else updateNavbarBadgeSync();
  }
}

function updateNavbarBadgeSync() {
  try {
    var badge = document.getElementById('plan-badge');
    var text = document.getElementById('plan-text');
    if (!badge || !text) return;
    var isPremium = window.SETTINGS_STATE?.isPremium || false;
    var exp = sessionStorage.getItem('ww_user_plan_expires_at') || null;
    updateBadgeUI(isPremium, exp);
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
}

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

  // Global dropdown listener: outside-click, internal link click, and Escape
  if (!window._navGlobalListenersBound) {
    window._navGlobalListenersBound = true;

    // 1. Dışarı tıklanınca tüm açık dropdown'ları kapat
    document.addEventListener('click', function(e) {
      if (!e.target || !e.target.closest) return;
      var isInsideNav = e.target.closest(
        '#premium-dropdown-btn, #premium-dropdown-menu, ' +
        '#overtrade-bell-btn, #bell-panel, ' +
        '#nav-journal-switcher, ' +
        '#user-avatar, #dropdown-menu, ' +
        '#nav-toggle, #nav-menu'
      );
      if (!isInsideNav) {
        closeAllNavDropdowns();
      }
    });

    // 2. Menü içindeki linklere tıklandığında menüleri kapat & panel yönlendirmesini sağla
    document.addEventListener('click', function(e) {
      if (!e.target || !e.target.closest) return;
      var a = e.target.closest('#premium-dropdown-menu a, #journal-dropdown a, #journal-dropdown button, #bell-panel a, #dropdown-menu a');
      if (a) {
        var href = a.getAttribute('href') || '';
        if (href.indexOf('#panel-') !== -1 && window.location.pathname.indexOf('settings') !== -1) {
          var panelId = href.split('#')[1];
          if (panelId && typeof window.switchPanel === 'function') {
            e.preventDefault();
            window.switchPanel(panelId);
          }
        }
        setTimeout(function() {
          closeAllNavDropdowns();
        }, 60);
      }
    });

    // 3. ESC tuşuna basılınca tüm dropdown'ları kapat
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        closeAllNavDropdowns();
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
      updateNotificationBadge();
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
    updateNotificationBadge();
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
      updateNotificationBadge();
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
    setTimeout(function() { updateNavbarBadge(); updateNotificationBadge(); }, 150);
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

    // Prop accounts map
    var propMap = {};
    if (window.PropService && typeof window.PropService.getActivePropAccounts === 'function') {
      try {
        var activeProps = await window.PropService.getActivePropAccounts();
        (activeProps || []).forEach(function(pa) { propMap[pa.journal_id] = pa; });
      } catch (pErr) {}
    }

    function safeEscape(str) {
      if (typeof window !== 'undefined' && typeof window.sanitizeHTML === 'function') {
        return window.sanitizeHTML(str);
      }
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    var swName = document.querySelector('.nav-journal-switcher .journal-name');
    var swIcon = document.querySelector('.nav-journal-switcher .journal-icon');
    if (swName) {
      var isPropActive = Boolean(propMap[activeJ.id]);
      swName.innerHTML = safeEscape(activeJ.name) + (isPropActive ? '<span class="nav-prop-tag">PROP</span>' : '');
    }
    if (swIcon) swIcon.setAttribute('data-lucide', activeJ.icon || 'folder');

    // Mobil menü göstergesi
    var menuJournalName = document.getElementById('menu-journal-name');
    if (menuJournalName && activeJ) {
      var isPropActive = Boolean(propMap[activeJ.id]);
      menuJournalName.innerHTML = safeEscape(activeJ.name) + (isPropActive ? '<span class="nav-prop-tag">PROP</span>' : '');
    }
    
    var menuJournalIcon = document.querySelector('.menu-journal-icon');
    if (menuJournalIcon && activeJ) {
      menuJournalIcon.setAttribute('data-lucide', activeJ.icon || 'folder');
      menuJournalIcon.style.color = activeJ.color || 'var(--accent)';
    }

    var dropdown = document.getElementById('journal-dropdown');
    if (dropdown) {
      var swTitle = t('journal.switcher_title', 'Hesaplar');
      var html = '<div class="journal-menu-header">' +
        '<span class="journal-menu-title">' + swTitle + '</span>' +
        '<span class="journal-menu-count">' + journals.length + '</span>' +
      '</div>';

      html += '<div class="journal-menu-list">';
      journals.forEach(function(j) {
        var isActive = (j.id === activeJ.id) ? 'active' : '';
        var tradesTxt = (j.trade_count || 0) + ' ' + (t('nav.trades', 'işlem') || 'işlem');
        var itemColor = j.color || '#7c6dfa';
        var hasProp = Boolean(propMap[j.id]);
        var propItemBadge = hasProp ? '<span class="nav-prop-tag">PROP</span>' : '';
        html += '<button class="journal-item ' + isActive + '" data-id="' + j.id + '" type="button">' +
          '<div class="journal-icon-wrap" style="background:' + itemColor + '22; color:' + itemColor + '; border-color:' + itemColor + '40;">' +
            '<i data-lucide="' + (j.icon || 'folder') + '"></i>' +
          '</div>' +
          '<div class="journal-info">' +
            '<span class="journal-name">' + safeEscape(j.name) + propItemBadge + '</span>' +
            '<span class="journal-count">' + tradesTxt + '</span>' +
          '</div>' +
          '<i data-lucide="check" class="journal-check"></i>' +
        '</button>';
      });
      html += '</div>';

      var manageTxt = t('journal.manage', 'Hesapları Yönet');
      html += '<div class="journal-menu-footer"><a href="/journals.html" class="journal-manage-link"><i data-lucide="settings"></i> <span>' + manageTxt + ' →</span></a></div>';
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