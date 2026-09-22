// ============================================================
// ADMIN-DASHBOARD.JS - ANALYTICS & PRICES
// ⭐ MIGRATE: Chart.js → ApexCharts
//   - usersChart ve premiumChart artık ApexCharts instance'ı
//   - ApexCharts destroy() ve re-render aynı şekilde çalışır
//   - Tema (light/dark) desteği eklendi
// ============================================================

wwLog.log('🔥 admin-dashboard.js yukleniyor...');

// ============================================================
// APEXCHARTS TEMA YARDIMCISI
// ============================================================
function getAdminApexTheme() {
  var isLight = document.body.classList.contains('light-theme');
  return {
    mode: isLight ? 'light' : 'dark',
    textColor: isLight ? '#1e293b' : '#6b6b80',
    gridColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)',
    surface: isLight ? '#ffffff' : '#0e0e16'
  };
}

// ============================================================
// LOAD ANALYTICS DATA
// ============================================================
async function loadAnalyticsData() {
  wwLog.log('📊 loadAnalyticsData basladi...');
  
  try {
    var last7 = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      last7.push(d.toISOString().split('T')[0]);
    }

    var { data: profiles } = await sb.from('user_profiles').select('*');
    var profileList = profiles || [];

    var premiumUsers = profileList.filter(function(p) {
      return p.plan === 'premium' && p.plan_expires_at && new Date(p.plan_expires_at) > new Date();
    });
    var totalPremium = premiumUsers.length;
    
    var totalRevenue = 0;
    var revenue7Days = 0;
    var revenueByDay = {};
    var recentPremiumUsers = [];

    profileList.forEach(function(p) {
      if (p.plan === 'premium' && p.plan_expires_at) {
        var expiresAt = new Date(p.plan_expires_at);
        var startDate = new Date(expiresAt);
        startDate.setDate(startDate.getDate() - 30);
        
        var diffDays = Math.ceil((expiresAt - startDate) / (1000 * 60 * 60 * 24));
        var isYearly = diffDays > 31;
        var price = isYearly ? 79 : 9;
        var price = isYearly ? 99 : 12;
        
        totalRevenue += price;
        
        var dayKey = startDate.toISOString().split('T')[0];
        if (!revenueByDay[dayKey]) revenueByDay[dayKey] = 0;
        revenueByDay[dayKey] += price;
        
        var sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        if (startDate >= sevenDaysAgo) {
          revenue7Days += price;
          recentPremiumUsers.push({
            username: p.username || p.email || 'Isimsiz',
            email: p.email || '-',
            plan: isYearly ? 'Yillik' : 'Aylik',
            amount: price,
            date: startDate,
            avatar_url: p.avatar_url || null
          });
        }
      }
    });

    var revenueData = last7.map(function(d) { return revenueByDay[d] || 0; });
    var uCounts = last7.map(function(d) {
      return profileList.filter(function(p) { return p.created_at && p.created_at.split('T')[0] === d; }).length;
    });
    var premium7Days = recentPremiumUsers.length;

    var statsEls = {
      'stat-total-users': profileList.length,
      'stat-total-premium': totalPremium,
      'stat-premium-revenue': '$' + totalRevenue.toFixed(2),
      'stat-premium-7days': premium7Days
    };
    
    Object.keys(statsEls).forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.textContent = statsEls[id];
    });

    var recentContainer = document.getElementById('recent-premium-list');
    if (recentContainer) {
      if (recentPremiumUsers.length === 0) {
        recentContainer.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted);font-size:13px;">Henuz premium satisi yok.</div>';
      } else {
        var html = '';
        for (var j = 0; j < recentPremiumUsers.length && j < 10; j++) {
          var u = recentPremiumUsers[j];
          var avatarHtml = u.avatar_url
            ? '<img src="' + u.avatar_url + '" alt="avatar" style="width:100%;height:100%;object-fit:cover;">'
            : '<span style="font-weight:700;font-size:14px;">' + getInitials(u.username) + '</span>';
          
          html += '<div class="recent-premium-card">' +
            '<div class="avatar-small">' + avatarHtml + '</div>' +
            '<div class="info">' +
              '<div class="name">' + escapeHtml(u.username) + '</div>' +
              '<div class="email">' + escapeHtml(u.email) + '</div>' +
              '<div style="display:flex;align-items:center;gap:0.5rem;margin-top:2px;">' +
                '<span class="plan-type">' + u.plan + '</span>' +
                '<span style="font-size:10px;color:var(--muted);font-family:DM Mono,monospace;">' + formatDateFull(u.date) + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="amount">+$' + u.amount.toFixed(2) + '</div>' +
          '</div>';
        }
        recentContainer.innerHTML = html;
      }
    }

    var labels = last7.map(function(d) { return d.slice(5).replace('-', '/'); });
    var theme = getAdminApexTheme();
    
    // ⭐ Destroy eski grafikler (ApexCharts destroy() Chart.js ile aynı)
    if (adminState.charts.userChart) {
      try { adminState.charts.userChart.destroy(); } catch(e) {}
      adminState.charts.userChart = null;
    }
    if (adminState.charts.premiumChart) {
      try { adminState.charts.premiumChart.destroy(); } catch(e) {}
      adminState.charts.premiumChart = null;
    }

    // ⭐ KULLANICI GRAFİĞİ (Bar)
    var usersEl = document.getElementById('usersChart');
    if (usersEl) {
      usersEl.innerHTML = '';
      
      var usersOptions = {
        series: [{ name: 'Kullanıcı', data: uCounts }],
        chart: {
          type: 'bar',
          height: '100%',
          toolbar: { show: false },
          background: 'transparent',
          fontFamily: "'DM Sans', sans-serif",
          animations: { enabled: true, speed: 400 }
        },
        plotOptions: {
          bar: {
            borderRadius: 6,
            columnWidth: '60%',
            colors: {
              ranges: [
                { from: 0, to: Number.MAX_VALUE, color: '#34d399' }
              ]
            }
          }
        },
        colors: ['#34d399'],
        fill: {
          type: 'solid',
          opacity: 0.25
        },
        stroke: {
          show: true,
          width: 2,
          colors: ['#34d399']
        },
        dataLabels: { enabled: false },
        grid: {
          borderColor: theme.gridColor,
          strokeDashArray: 4,
          position: 'back'
        },
        xaxis: {
          categories: labels,
          labels: {
            style: {
              colors: theme.textColor,
              fontFamily: "'DM Mono', monospace",
              fontSize: '11px'
            }
          },
          axisBorder: { show: false },
          axisTicks: { show: false }
        },
        yaxis: {
          labels: {
            style: {
              colors: theme.textColor,
              fontFamily: "'DM Mono', monospace",
              fontSize: '11px'
            },
            formatter: function(val) { return Math.floor(val); }
          }
        },
        tooltip: {
          theme: theme.mode,
          style: { fontFamily: "'DM Sans', sans-serif", fontSize: '12px' }
        },
        legend: { show: false }
      };
      
      adminState.charts.userChart = new ApexCharts(usersEl, usersOptions);
      adminState.charts.userChart.render();
    }

    // ⭐ PREMIUM GRAFİĞİ (Bar)
    var premiumEl = document.getElementById('premiumChart');
    if (premiumEl) {
      premiumEl.innerHTML = '';
      
      var premiumOptions = {
        series: [{ name: 'Premium Gelir ($)', data: revenueData }],
        chart: {
          type: 'bar',
          height: '100%',
          toolbar: { show: false },
          background: 'transparent',
          fontFamily: "'DM Sans', sans-serif",
          animations: { enabled: true, speed: 400 }
        },
        plotOptions: {
          bar: {
            borderRadius: 6,
            columnWidth: '60%',
            colors: {
              ranges: [
                { from: 0, to: Number.MAX_VALUE, color: '#7c6dfa' }
              ]
            }
          }
        },
        colors: ['#7c6dfa'],
        fill: {
          type: 'solid',
          opacity: 0.25
        },
        stroke: {
          show: true,
          width: 2,
          colors: ['#7c6dfa']
        },
        dataLabels: { enabled: false },
        grid: {
          borderColor: theme.gridColor,
          strokeDashArray: 4,
          position: 'back'
        },
        xaxis: {
          categories: labels,
          labels: {
            style: {
              colors: theme.textColor,
              fontFamily: "'DM Mono', monospace",
              fontSize: '11px'
            }
          },
          axisBorder: { show: false },
          axisTicks: { show: false }
        },
        yaxis: {
          labels: {
            style: {
              colors: theme.textColor,
              fontFamily: "'DM Mono', monospace",
              fontSize: '11px'
            },
            formatter: function(val) { return '$' + val; }
          }
        },
        tooltip: {
          theme: theme.mode,
          y: {
            formatter: function(val) { return '$' + val.toFixed(2); }
          },
          style: { fontFamily: "'DM Sans', sans-serif", fontSize: '12px' }
        },
        legend: {
          show: true,
          position: 'bottom',
          labels: { colors: theme.textColor },
          fontFamily: "'DM Mono', monospace",
          fontSize: '10px'
        }
      };
      
      adminState.charts.premiumChart = new ApexCharts(premiumEl, premiumOptions);
      adminState.charts.premiumChart.render();
    }
    
    wwLog.log('✅ loadAnalyticsData tamamlandi!');
  } catch (e) {
    console.error('loadAnalyticsData hatasi:', e);
  }
}

// ============================================================
// RENDER PRICES CONTENT
// ============================================================
function renderPricesContent() {
  if (typeof renderPaymentSettingsUI === 'function') {
    renderPaymentSettingsUI();
  }
}
window.renderPricesContent = renderPricesContent;
window.addPaymentMethod = addPaymentMethod;
window.removePaymentMethod = removePaymentMethod;

wwLog.log('✅ admin-dashboard.js yuklendi!');

// ============================================================
// REFERANS KODLARI UI (REFERRAL CODES)
// ============================================================
function renderReferralCodesTable() {
  var c = document.getElementById('referral-codes-container');
  if (!c) return;
  var codes = adminState.referralCodes || [];
  if (codes.length === 0) {
    c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted);">Kayıtlı referans kodu yok.</div>';
    return;
  }

  var html = '<div class="table-responsive"><table class="admin-table"><thead><tr>' +
    '<th>Kod</th><th>İndirim</th><th>Kullanım</th><th>Sınır</th><th>Son Tarih</th><th>Durum</th><th style="text-align:right">İşlem</th>' +
    '</tr></thead><tbody>';

  codes.forEach(function(item) {
    var stat = item.is_active ? '<span class="status-badge status-active">Aktif</span>' : '<span class="status-badge status-inactive">Pasif</span>';
    var expiry = item.expires_at ? new Date(item.expires_at).toLocaleDateString() : 'Süresiz';
    var limit = item.max_usage ? item.max_usage : 'Sınırsız';
    
    html += '<tr>' +
      '<td><strong style="color:var(--text);">' + escapeHtml(item.code) + '</strong><br><span style="font-size:11px;color:var(--muted);">' + escapeHtml(item.referrer_name || '-') + '</span></td>' +
      '<td>%' + item.discount_percent + '</td>' +
      '<td>' + item.usage_count + '</td>' +
      '<td>' + limit + '</td>' +
      '<td>' + expiry + '</td>' +
      '<td>' + stat + '</td>' +
      '<td style="text-align:right;white-space:nowrap;">' +
        '<button class="btn btn-ghost btn-sm" onclick="editReferralCode(\'' + item.id + '\')" style="padding:4px 8px;margin-right:4px;">Düzenle</button>' +
        '<button class="btn btn-danger btn-sm" onclick="delReferralCode(\'' + item.id + '\')" style="padding:4px 8px;">Sil</button>' +
      '</td>' +
    '</tr>';
  });
  html += '</tbody></table></div>';
  c.innerHTML = html;
}

window.editReferralCode = function(id) {
  var item = adminState.referralCodes.find(x => x.id === id);
  if (!item) return;
  document.getElementById('rc-id').value = item.id;
  document.getElementById('rc-code').value = item.code;
  document.getElementById('rc-discount').value = item.discount_percent;
  document.getElementById('rc-name').value = item.referrer_name || '';
  document.getElementById('rc-email').value = item.referrer_email || '';
  document.getElementById('rc-max-usage').value = item.max_usage || '';
  document.getElementById('rc-expires').value = item.expires_at ? item.expires_at.split('T')[0] : '';
  document.getElementById('rc-active').value = item.is_active ? 'true' : 'false';
  
  document.getElementById('rc-modal-title').textContent = 'Kodu Düzenle';
  document.getElementById('referral-code-modal').classList.add('open');
};

window.delReferralCode = async function(id) {
  if (confirm('Bu kodu silmek istediğinize emin misiniz?')) {
    await deleteReferralCode(id);
    renderReferralCodesTable();
  }
};

function initReferralModal() {
  var modal = document.getElementById('referral-code-modal');
  var btnAdd = document.getElementById('add-referral-code-btn');
  var btnClose = document.getElementById('close-rc-modal');
  var btnCancel = document.getElementById('cancel-rc-btn');
  var btnSave = document.getElementById('save-rc-btn');

  if (btnAdd) {
    btnAdd.addEventListener('click', function() {
      document.getElementById('rc-id').value = '';
      document.getElementById('rc-code').value = '';
      document.getElementById('rc-discount').value = '';
      document.getElementById('rc-name').value = '';
      document.getElementById('rc-email').value = '';
      document.getElementById('rc-max-usage').value = '';
      document.getElementById('rc-expires').value = '';
      document.getElementById('rc-active').value = 'true';
      document.getElementById('rc-modal-title').textContent = 'Yeni Referans Kodu Ekle';
      modal.classList.add('open');
    });
  }

  function close() { modal.classList.remove('open'); }
  if (btnClose) btnClose.addEventListener('click', close);
  if (btnCancel) btnCancel.addEventListener('click', close);

  if (btnSave) {
    btnSave.addEventListener('click', async function() {
      var code = document.getElementById('rc-code').value.trim().toUpperCase();
      var discount = parseInt(document.getElementById('rc-discount').value, 10);
      if (!code || isNaN(discount)) return alert('Lütfen kod ve indirim yüzdesini doldurun.');
      
      var payload = {
        code: code,
        discount_percent: discount,
        referrer_name: document.getElementById('rc-name').value.trim() || null,
        referrer_email: document.getElementById('rc-email').value.trim() || null,
        max_usage: parseInt(document.getElementById('rc-max-usage').value, 10) || null,
        expires_at: document.getElementById('rc-expires').value || null,
        is_active: document.getElementById('rc-active').value === 'true'
      };

      var id = document.getElementById('rc-id').value;
      
      btnSave.disabled = true;
      btnSave.textContent = 'Kaydediliyor...';
      var ok = await saveReferralCode(id, payload);
      btnSave.disabled = false;
      btnSave.textContent = 'Kaydet';
      
      if (ok) {
        close();
        renderReferralCodesTable();
      }
    });
  }
}

// ============================================================
// PAYMENT SETTINGS UI
// ============================================================
async function renderPaymentSettingsUI() {
  var c = document.getElementById('prices-container');
  if (!c) return;

  var current = await loadPaymentSettings();
  if (!current) {
    current = {
      monthly_price_usd: 12,
      yearly_price_usd: 99,
      video_embed_url: '',
      video_embed_enabled: false,
      ltc_discount_enabled: true
    };
  }

  c.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1rem;max-width:500px;">
      <div class="field">
        <label>Aylık Fiyat (USD)</label>
        <input type="number" id="ps-monthly" value="${current.monthly_price_usd || 12}">
      </div>
      <div class="field">
        <label>Yıllık Fiyat (USD)</label>
        <input type="number" id="ps-yearly" value="${current.yearly_price_usd || 99}">
      </div>
      <div class="field">
        <label>YouTube Embed URL</label>
        <input type="text" id="ps-video-url" value="${current.video_embed_url || ''}" placeholder="https://www.youtube.com/embed/...">
      </div>
      <div class="field" style="display:flex;align-items:center;gap:0.5rem;">
        <input type="checkbox" id="ps-video-enabled" ${current.video_embed_enabled ? 'checked' : ''}>
        <label for="ps-video-enabled" style="margin:0;">Video Ödeme Sayfasında Gösterilsin mi?</label>
      </div>
      <div class="field" style="display:flex;align-items:center;gap:0.5rem;margin-top:1rem;">
        <input type="checkbox" id="ps-ltc-discount" ${current.ltc_discount_enabled !== false ? 'checked' : ''}>
        <label for="ps-ltc-discount" style="margin:0;">Referans İndirimi LTC Ödemelerinde Geçerli Olsun</label>
      </div>
      <div style="margin-top:1rem;">
        <button class="btn btn-primary" id="save-ps-btn">Ayarları Kaydet</button>
      </div>
    </div>
  `;

  document.getElementById('save-ps-btn').addEventListener('click', async function() {
    var payload = {
      monthly_price_usd: parseFloat(document.getElementById('ps-monthly').value) || 12,
      yearly_price_usd: parseFloat(document.getElementById('ps-yearly').value) || 99,
      video_embed_url: document.getElementById('ps-video-url').value.trim(),
      video_embed_enabled: document.getElementById('ps-video-enabled').checked,
      ltc_discount_enabled: document.getElementById('ps-ltc-discount').checked,
      yearly_discount_percent: 31, // hesaplama eklenebilir
      days_per_monthly: 30,
      days_per_yearly: 365
    };
    this.disabled = true;
    this.textContent = 'Kaydediliyor...';
    await savePaymentSettings(payload);
    this.disabled = false;
    this.textContent = 'Ayarları Kaydet';
  });
}


window.openReferralModal = function() {
  document.getElementById('rc-id').value = '';
  document.getElementById('rc-code').value = '';
  document.getElementById('rc-discount').value = '';
  document.getElementById('rc-name').value = '';
  document.getElementById('rc-email').value = '';
  document.getElementById('rc-max-usage').value = '';
  document.getElementById('rc-expires').value = '';
  document.getElementById('rc-active').value = 'true';
  document.getElementById('rc-modal-title').textContent = 'Yeni Referans Kodu Ekle';
  document.getElementById('referral-code-modal').classList.add('open');
};

// ============================================================
// GENEL (OVERVIEW) DASHBOARD
// ============================================================

function destroyOverviewCharts() {
  if (adminState.charts.overviewUserChart) {
    try { adminState.charts.overviewUserChart.destroy(); } catch(e) {}
    adminState.charts.overviewUserChart = null;
  }
  if (adminState.charts.overviewRevenueChart) {
    try { adminState.charts.overviewRevenueChart.destroy(); } catch(e) {}
    adminState.charts.overviewRevenueChart = null;
  }
  if (adminState.charts.overviewPlanDonut) {
    try { adminState.charts.overviewPlanDonut.destroy(); } catch(e) {}
    adminState.charts.overviewPlanDonut = null;
  }
}

window.changeOverviewPeriod = function(period) {
  adminState.overviewPeriod = period;
  renderOverviewContent(period);
};

function getSubscriptionDetails(user) {
  if (user.plan !== 'premium' || !user.plan_expires_at) {
    return null;
  }
  var expiresAt = new Date(user.plan_expires_at);
  if (isNaN(expiresAt.getTime())) return null;

  var createdAt = user.created_at ? new Date(user.created_at) : new Date();
  var totalDays = Math.round((expiresAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  var isYearly = totalDays > 60;
  var durationDays = isYearly ? 365 : 30;

  var startDate = new Date(expiresAt.getTime() - durationDays * 24 * 60 * 60 * 1000);
  if (startDate > new Date()) {
    startDate = createdAt;
  }

  return {
    isYearly: isYearly,
    price: isYearly ? 99 : 12,
    startDate: startDate,
    expiresAt: expiresAt
  };
}

function renderOverviewContent(period) {
  period = period || adminState.overviewPeriod || 'week';
  adminState.overviewPeriod = period;

  var container = document.getElementById('overview-content');
  if (!container) return;

  // Destroy previous charts before modifying DOM to prevent leaks or conflicts
  destroyOverviewCharts();

  var theme = getAdminApexTheme();
  var usersList = adminState.users || [];
  var totalUsers = usersList.length;

  // Active Premium & Free counts
  var now = new Date();
  var activePremiumUsers = usersList.filter(function(u) {
    return u.plan === 'premium' && u.plan_expires_at && new Date(u.plan_expires_at) > now;
  });
  var premiumCount = activePremiumUsers.length;
  var freeCount = Math.max(0, totalUsers - premiumCount);
  var conversionRate = totalUsers > 0 ? ((premiumCount / totalUsers) * 100).toFixed(1) : '0.0';

  // Today Users (local start of day)
  var startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  var todayUsers = usersList.filter(function(u) {
    if (!u.created_at) return false;
    var d = new Date(u.created_at);
    return !isNaN(d.getTime()) && d >= startOfToday;
  }).length;

  // Subscriptions & Total Revenue calculation
  var subscriptions = [];
  var totalRevenue = 0;

  usersList.forEach(function(u) {
    var sub = getSubscriptionDetails(u);
    if (sub) {
      totalRevenue += sub.price;
      subscriptions.push(sub);
    }
  });

  // Period Buckets & Labels
  var bucketLabels = [];
  var userCounts = [];
  var revenueAmounts = [];
  var periodUsers = 0;
  var periodRevenue = 0;

  var trDays = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  var trMonths = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

  var periodLabelText = 'Son 7 Gün';
  var periodPillText = '1 Hafta';

  if (period === 'week') {
    periodLabelText = 'Son 7 Gün';
    periodPillText = '1 Hafta';

    for (var i = 6; i >= 0; i--) {
      var dayStart = new Date();
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);

      var dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      var label = dayStart.getDate() + ' ' + trMonths[dayStart.getMonth()] + ' (' + trDays[dayStart.getDay()] + ')';
      bucketLabels.push(label);

      var uCount = usersList.filter(function(u) {
        if (!u.created_at) return false;
        var ud = new Date(u.created_at);
        return !isNaN(ud.getTime()) && ud >= dayStart && ud <= dayEnd;
      }).length;
      userCounts.push(uCount);
      periodUsers += uCount;

      var rSum = subscriptions.filter(function(s) {
        return s.startDate >= dayStart && s.startDate <= dayEnd;
      }).reduce(function(acc, s) { return acc + s.price; }, 0);
      revenueAmounts.push(rSum);
      periodRevenue += rSum;
    }
  } else if (period === 'month') {
    periodLabelText = 'Son 30 Gün';
    periodPillText = '1 Ay';

    for (var i = 29; i >= 0; i--) {
      var dayStart = new Date();
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);

      var dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      var label = dayStart.getDate() + ' ' + trMonths[dayStart.getMonth()];
      bucketLabels.push(label);

      var uCount = usersList.filter(function(u) {
        if (!u.created_at) return false;
        var ud = new Date(u.created_at);
        return !isNaN(ud.getTime()) && ud >= dayStart && ud <= dayEnd;
      }).length;
      userCounts.push(uCount);
      periodUsers += uCount;

      var rSum = subscriptions.filter(function(s) {
        return s.startDate >= dayStart && s.startDate <= dayEnd;
      }).reduce(function(acc, s) { return acc + s.price; }, 0);
      revenueAmounts.push(rSum);
      periodRevenue += rSum;
    }
  } else if (period === 'year') {
    periodLabelText = 'Son 12 Ay';
    periodPillText = '1 Yıl';

    for (var i = 11; i >= 0; i--) {
      var mStart = new Date(now.getFullYear(), now.getMonth() - i, 1, 0, 0, 0, 0);
      var mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);

      var label = trMonths[mStart.getMonth()] + ' ' + mStart.getFullYear();
      bucketLabels.push(label);

      var uCount = usersList.filter(function(u) {
        if (!u.created_at) return false;
        var ud = new Date(u.created_at);
        return !isNaN(ud.getTime()) && ud >= mStart && ud <= mEnd;
      }).length;
      userCounts.push(uCount);
      periodUsers += uCount;

      var rSum = subscriptions.filter(function(s) {
        return s.startDate >= mStart && s.startDate <= mEnd;
      }).reduce(function(acc, s) { return acc + s.price; }, 0);
      revenueAmounts.push(rSum);
      periodRevenue += rSum;
    }
  }

  // Recent Users List (Latest 8)
  var sortedUsers = usersList.slice().sort(function(a, b) {
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  }).slice(0, 8);

  var recentUsersHtml = '';
  if (sortedUsers.length === 0) {
    recentUsersHtml = '<div style="text-align:center;padding:2rem;color:var(--muted);font-size:13px;">Henüz kullanıcı bulunmuyor.</div>';
  } else {
    sortedUsers.forEach(function(u) {
      var name = escapeHtml(u.username || (u.email ? u.email.split('@')[0] : 'Kullanıcı'));
      var email = escapeHtml(u.email || '—');
      var avatarContent = u.avatar_url
        ? '<img src="' + u.avatar_url + '" alt="avatar" style="width:100%;height:100%;object-fit:cover;">'
        : '<span>' + getInitials(name) + '</span>';
      var isPrem = u.plan === 'premium';
      var badgeHtml = isPrem
        ? '<span class="user-mini-badge badge-sub-premium">⭐ Premium</span>'
        : '<span class="user-mini-badge badge-sub-free">Ücretsiz</span>';

      recentUsersHtml += 
        '<div class="overview-user-row">' +
          '<div class="user-mini-avatar">' + avatarContent + '</div>' +
          '<div class="user-mini-info">' +
            '<div class="user-mini-name">' + name + '</div>' +
            '<div class="user-mini-email">' + email + '</div>' +
          '</div>' +
          badgeHtml +
          '<div class="user-mini-date">' + formatDate(u.created_at) + '</div>' +
        '</div>';
    });
  }

  // Build HTML
  container.innerHTML = 
    '<div class="overview-container">' +
      '<div class="overview-header-bar">' +
        '<div>' +
          '<h2 style="font-size:1.25rem;font-weight:700;letter-spacing:-0.02em;margin:0 0 4px 0;color:var(--text);display:flex;align-items:center;gap:8px;">' +
            'Platform Genel Bakış ' +
            '<span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;background:rgba(124,109,250,0.15);color:#a78bfa;border:1px solid rgba(124,109,250,0.3);">' +
              'Canlı Veriler' +
            '</span>' +
          '</h2>' +
          '<p style="font-size:13px;color:var(--muted);margin:0;">Sistem geneli kullanıcı, abonelik ve gelir metrikleri</p>' +
        '</div>' +
        '<div class="period-switcher-pill">' +
          '<button type="button" class="period-pill-btn ' + (period === 'week' ? 'active' : '') + '" data-period="week" onclick="changeOverviewPeriod(\'week\')">1 Hafta</button>' +
          '<button type="button" class="period-pill-btn ' + (period === 'month' ? 'active' : '') + '" data-period="month" onclick="changeOverviewPeriod(\'month\')">1 Ay</button>' +
          '<button type="button" class="period-pill-btn ' + (period === 'year' ? 'active' : '') + '" data-period="year" onclick="changeOverviewPeriod(\'year\')">1 Yıl</button>' +
        '</div>' +
      '</div>' +

      '<div class="overview-kpi-grid">' +
        '<div class="kpi-card">' +
          '<div class="kpi-card-inner">' +
            '<div class="kpi-icon-wrap icon-users">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' +
            '</div>' +
            '<div class="kpi-meta">' +
              '<span class="kpi-label">Toplam Kullanıcılar</span>' +
              '<div class="kpi-value-row">' +
                '<span class="kpi-val">' + totalUsers + '</span>' +
                '<span class="kpi-badge badge-green">Tüm Zamanlar</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="kpi-card highlight-card">' +
          '<div class="kpi-card-inner">' +
            '<div class="kpi-icon-wrap icon-today">' +
              '<div class="live-pulse"></div>' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
            '</div>' +
            '<div class="kpi-meta">' +
              '<span class="kpi-label">Bugün Gelen Kullanıcılar</span>' +
              '<div class="kpi-value-row">' +
                '<span class="kpi-val" style="color:#22c55e;">+' + todayUsers + '</span>' +
                '<span class="kpi-badge badge-pulse">Bugün</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="kpi-card">' +
          '<div class="kpi-card-inner">' +
            '<div class="kpi-icon-wrap icon-users">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>' +
            '</div>' +
            '<div class="kpi-meta">' +
              '<span class="kpi-label">' + periodLabelText + ' Yeni Kayıt</span>' +
              '<div class="kpi-value-row">' +
                '<span class="kpi-val">+' + periodUsers + '</span>' +
                '<span class="kpi-badge badge-purple">' + periodPillText + '</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="kpi-card">' +
          '<div class="kpi-card-inner">' +
            '<div class="kpi-icon-wrap icon-revenue">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' +
            '</div>' +
            '<div class="kpi-meta">' +
              '<span class="kpi-label">Toplam Gelir</span>' +
              '<div class="kpi-value-row">' +
                '<span class="kpi-val" style="color:#10b981;">$' + totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + '</span>' +
                '<span class="kpi-badge badge-emerald">Dönem: $' + periodRevenue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + '</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="kpi-card">' +
          '<div class="kpi-card-inner">' +
            '<div class="kpi-icon-wrap icon-premium">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
            '</div>' +
            '<div class="kpi-meta">' +
              '<span class="kpi-label">Premium Üyeler</span>' +
              '<div class="kpi-value-row">' +
                '<span class="kpi-val" style="color:#a78bfa;">' + premiumCount + '</span>' +
                '<span class="kpi-badge badge-purple">%' + conversionRate + ' Dönüşüm</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="overview-charts-row">' +
        '<div class="s-card">' +
          '<div class="s-card-header">' +
            '<div class="header-icon" style="background:rgba(124,109,250,0.12);color:#a78bfa;">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' +
            '</div>' +
            '<div><h2>Kullanıcı Büyümesi</h2><p>' + periodLabelText + ' kayıt olan yeni kullanıcı trendi</p></div>' +
            '<div class="chart-corner-stat">' +
              '<span class="corner-val">+' + periodUsers + '</span>' +
              '<span class="corner-lbl">' + periodPillText + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="s-card-body" style="padding-top:0.5rem;">' +
            '<div id="overviewUserGrowthChart"></div>' +
          '</div>' +
        '</div>' +

        '<div class="s-card">' +
          '<div class="s-card-header">' +
            '<div class="header-icon" style="background:rgba(16,185,129,0.12);color:#34d399;">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>' +
            '</div>' +
            '<div><h2>Gelir İstatistiği ($)</h2><p>' + periodLabelText + ' elde edilen premium abonelik gelirleri</p></div>' +
            '<div class="chart-corner-stat">' +
              '<span class="corner-val text-emerald">$' + periodRevenue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + '</span>' +
              '<span class="corner-lbl">' + periodPillText + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="s-card-body" style="padding-top:0.5rem;">' +
            '<div id="overviewRevenueChart"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="overview-bottom-row">' +
        '<div class="s-card">' +
          '<div class="s-card-header">' +
            '<div class="header-icon" style="background:rgba(168,85,247,0.12);color:#c084fc;">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 10 10h-10z"/></svg>' +
            '</div>' +
            '<div><h2>Plan Dağılımı</h2><p>Kullanıcıların abonelik türü oranı</p></div>' +
          '</div>' +
          '<div class="s-card-body">' +
            '<div id="overviewPlanDonutChart"></div>' +
            '<div class="plan-summary-bars">' +
              '<div class="plan-summary-item">' +
                '<span class="plan-dot dot-premium"></span>' +
                '<span class="plan-name">Premium Plan</span>' +
                '<span class="plan-count">' + premiumCount + ' üye</span>' +
                '<span class="plan-pct" style="color:#a78bfa;">%' + conversionRate + '</span>' +
              '</div>' +
              '<div class="plan-summary-item">' +
                '<span class="plan-dot dot-free"></span>' +
                '<span class="plan-name">Ücretsiz Plan</span>' +
                '<span class="plan-count">' + freeCount + ' üye</span>' +
                '<span class="plan-pct" style="color:#94a3b8;">%' + (100 - parseFloat(conversionRate)).toFixed(1) + '</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="s-card">' +
          '<div class="s-card-header">' +
            '<div class="header-icon" style="background:rgba(59,130,246,0.12);color:#60a5fa;">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>' +
            '</div>' +
            '<div><h2>Son Kayıt Olan Kullanıcılar</h2><p>Platforma en son katılan ' + sortedUsers.length + ' üye</p></div>' +
            '<button class="btn btn-ghost btn-sm" onclick="switchPanel(\'panel-users\')" style="margin-left:auto;font-size:11px;padding:4px 10px;">' +
              'Tümünü Gör →' +
            '</button>' +
          '</div>' +
          '<div class="s-card-body" style="padding:0;">' +
            '<div class="overview-user-list">' +
              recentUsersHtml +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  // Attach explicit click events to period pill buttons
  var pillBtns = container.querySelectorAll('.period-pill-btn');
  pillBtns.forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      var p = this.getAttribute('data-period');
      if (p) window.changeOverviewPeriod(p);
    });
  });

  if (typeof ApexCharts === 'undefined') {
    wwLog.warn('⚠️ ApexCharts henüz yüklenmedi');
    return;
  }

  // Render ApexCharts after next paint frame so DOM container dimensions are resolved
  setTimeout(function() {
    // 1. User Growth Area Chart
    var userChartEl = document.getElementById('overviewUserGrowthChart');
    if (userChartEl) {
      var userChartOptions = {
        series: [{ name: 'Yeni Kullanıcı', data: userCounts }],
        chart: {
          type: 'area',
          height: 280,
          toolbar: { show: false },
          zoom: { enabled: false },
          background: 'transparent',
          fontFamily: 'Inter, sans-serif'
        },
        colors: ['#7c6dfa'],
        fill: {
          type: 'gradient',
          gradient: {
            shadeIntensity: 1,
            opacityFrom: 0.45,
            opacityTo: 0.05,
            stops: [0, 95, 100]
          }
        },
        stroke: { curve: 'smooth', width: 2.5 },
        dataLabels: { enabled: false },
        xaxis: {
          categories: bucketLabels,
          tickAmount: period === 'month' ? 6 : undefined,
          labels: {
            style: { colors: theme.textColor, fontSize: '11px', fontFamily: 'DM Mono, monospace' }
          },
          axisBorder: { show: false },
          axisTicks: { show: false }
        },
        yaxis: {
          labels: {
            style: { colors: theme.textColor, fontSize: '11px', fontFamily: 'DM Mono, monospace' },
            formatter: function(val) { return Math.round(val); }
          }
        },
        grid: { borderColor: theme.gridColor, strokeDashArray: 4 },
        tooltip: {
          theme: theme.mode,
          y: { formatter: function(val) { return val + ' kullanıcı'; } }
        }
      };
      adminState.charts.overviewUserChart = new ApexCharts(userChartEl, userChartOptions);
      adminState.charts.overviewUserChart.render();
    }

    // 2. Revenue Column Chart
    var revenueChartEl = document.getElementById('overviewRevenueChart');
    if (revenueChartEl) {
      var revChartOptions = {
        series: [{ name: 'Gelir ($)', data: revenueAmounts }],
        chart: {
          type: 'bar',
          height: 280,
          toolbar: { show: false },
          background: 'transparent',
          fontFamily: 'Inter, sans-serif'
        },
        plotOptions: {
          bar: {
            borderRadius: period === 'month' ? 3 : 6,
            columnWidth: period === 'month' ? '60%' : (period === 'year' ? '50%' : '38%'),
            distributed: false
          }
        },
        colors: ['#10b981'],
        fill: {
          type: 'gradient',
          gradient: {
            shade: 'light',
            type: 'vertical',
            shadeIntensity: 0.25,
            gradientToColors: ['#34d399'],
            inverseColors: true,
            opacityFrom: 0.95,
            opacityTo: 0.75,
            stops: [0, 100]
          }
        },
        dataLabels: { enabled: false },
        xaxis: {
          categories: bucketLabels,
          tickAmount: period === 'month' ? 6 : undefined,
          labels: {
            style: { colors: theme.textColor, fontSize: '11px', fontFamily: 'DM Mono, monospace' }
          },
          axisBorder: { show: false },
          axisTicks: { show: false }
        },
        yaxis: {
          labels: {
            style: { colors: theme.textColor, fontSize: '11px', fontFamily: 'DM Mono, monospace' },
            formatter: function(val) { return '$' + Math.round(val); }
          }
        },
        grid: { borderColor: theme.gridColor, strokeDashArray: 4 },
        tooltip: {
          theme: theme.mode,
          y: { formatter: function(val) { return '$' + Number(val).toFixed(2); } }
        }
      };
      adminState.charts.overviewRevenueChart = new ApexCharts(revenueChartEl, revChartOptions);
      adminState.charts.overviewRevenueChart.render();
    }

    // 3. Plan Donut Chart
    var donutChartEl = document.getElementById('overviewPlanDonutChart');
    if (donutChartEl) {
      var donutOptions = {
        series: [freeCount, premiumCount],
        labels: ['Ücretsiz', 'Premium'],
        chart: {
          type: 'donut',
          height: 220,
          background: 'transparent',
          fontFamily: 'Inter, sans-serif'
        },
        colors: ['#475569', '#7c6dfa'],
        stroke: { width: 0 },
        dataLabels: { enabled: false },
        legend: { show: false },
        plotOptions: {
          pie: {
            donut: {
              size: '72%',
              labels: {
                show: true,
                name: { show: true, fontSize: '12px', color: theme.textColor },
                value: { show: true, fontSize: '20px', fontWeight: 700, color: theme.mode === 'dark' ? '#fff' : '#0f172a' },
                total: {
                  show: true,
                  label: 'Toplam',
                  fontSize: '12px',
                  color: theme.textColor,
                  formatter: function() { return totalUsers; }
                }
              }
            }
          }
        },
        tooltip: {
          theme: theme.mode,
          y: {
            formatter: function(val) {
              return val + ' kullanıcı (%' + ((val / (totalUsers || 1)) * 100).toFixed(1) + ')';
            }
          }
        }
      };
      adminState.charts.overviewPlanDonut = new ApexCharts(donutChartEl, donutOptions);
      adminState.charts.overviewPlanDonut.render();
    }
  }, 50);
}

window.renderOverviewContent = renderOverviewContent;
