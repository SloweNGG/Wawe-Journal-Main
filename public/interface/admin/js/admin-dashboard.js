// ============================================================
// ADMIN-DASHBOARD.JS - ANALYTICS & PRICES
// ⭐ MIGRATE: Chart.js → ApexCharts
//   - usersChart ve premiumChart artık ApexCharts instance'ı
//   - ApexCharts destroy() ve re-render aynı şekilde çalışır
//   - Tema (light/dark) desteği eklendi
// ============================================================
var wwLog = (typeof window !== 'undefined' && window.wwLog) ? window.wwLog : console;
if (typeof window !== 'undefined' && !window.wwLog) window.wwLog = wwLog;

function getSbClient() {
  return (typeof window !== 'undefined' && window.sb) ? window.sb : (typeof sb !== 'undefined' ? sb : null);
}

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

    var client = getSbClient();
    if (!client) {
      wwLog.warn('Supabase client not ready for analytics');
      return;
    }
    var { data: profiles } = await client.from('user_profiles').select('*');
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
                '<span style="font-size:11px;color:var(--muted);font-family:\'Inter\',sans-serif;">' + formatDateFull(u.date) + '</span>' +
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
          fontFamily: "'Inter', sans-serif",
          animations: { enabled: false }
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
              fontFamily: "'Inter', sans-serif",
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
              fontFamily: "'Inter', sans-serif",
              fontSize: '11px'
            },
            formatter: function(val) { return Math.floor(val); }
          }
        },
        tooltip: {
          theme: theme.mode,
          style: { fontFamily: "'Inter', sans-serif", fontSize: '12px' }
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
          fontFamily: "'Inter', sans-serif",
          animations: { enabled: false }
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
              fontFamily: "'Inter', sans-serif",
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
              fontFamily: "'Inter', sans-serif",
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
          style: { fontFamily: "'Inter', sans-serif", fontSize: '12px' }
        },
        legend: {
          show: true,
          position: 'bottom',
          labels: { colors: theme.textColor },
          fontFamily: "'Inter', sans-serif",
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
window.addPaymentMethod = function() {};
window.removePaymentMethod = function() {};

wwLog.log('✅ admin-dashboard.js yuklendi!');

// ============================================================
// REFERANS KODLARI UI (REFERRAL CODES)
// ============================================================
window.copyReferralCode = function(code) {
  if (!code) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(function() {
      if (typeof showToast === 'function') showToast('Referans kodu kopyalandı: ' + code, 'success');
    }).catch(function() {
      fallbackCopy(code);
    });
  } else {
    fallbackCopy(code);
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      if (typeof showToast === 'function') showToast('Referans kodu kopyalandı: ' + text, 'success');
    } catch(e) {
      if (typeof showToast === 'function') showToast('Kod kopyalanamadı', 'error');
    }
  }
};

window.handleToggleReferralCode = async function(id, newStatus) {
  var ok = await toggleReferralCodeStatus(id, newStatus);
  if (ok) {
    renderReferralCodesTable();
  }
};

function renderReferralCodesTable() {
  var c = document.getElementById('referral-codes-container');
  if (!c) return;
  var codes = adminState.referralCodes || [];

  // 1. ÖZET İSTATİSTİKLERİ HESAPLA
  var totalCodes = codes.length;
  var activeCodes = codes.filter(function(item) { return item.is_active; }).length;
  var totalUsages = codes.reduce(function(acc, item) { return acc + (parseInt(item.usage_count, 10) || 0); }, 0);
  var avgDiscount = totalCodes > 0
    ? Math.round(codes.reduce(function(acc, item) { return acc + (parseInt(item.discount_percent, 10) || 0); }, 0) / totalCodes)
    : 0;

  var statsHtml = '\
    <div class="ref-stats-grid">\
      <div class="ref-stat-card">\
        <div class="ref-stat-icon icon-code">\
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>\
        </div>\
        <div class="ref-stat-meta">\
          <span class="ref-stat-label">Toplam Kod</span>\
          <div class="ref-stat-val">' + totalCodes + '</div>\
        </div>\
      </div>\
      <div class="ref-stat-card">\
        <div class="ref-stat-icon icon-active">\
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>\
        </div>\
        <div class="ref-stat-meta">\
          <span class="ref-stat-label">Aktif Kodlar</span>\
          <div class="ref-stat-val" style="color:#34d399;">' + activeCodes + '</div>\
        </div>\
      </div>\
      <div class="ref-stat-card">\
        <div class="ref-stat-icon icon-usage">\
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>\
        </div>\
        <div class="ref-stat-meta">\
          <span class="ref-stat-label">Toplam Kullanım</span>\
          <div class="ref-stat-val" style="color:#60a5fa;">' + totalUsages + '</div>\
        </div>\
      </div>\
      <div class="ref-stat-card">\
        <div class="ref-stat-icon icon-discount">\
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>\
        </div>\
        <div class="ref-stat-meta">\
          <span class="ref-stat-label">Ort. İndirim</span>\
          <div class="ref-stat-val" style="color:#fbbf24;">%' + avgDiscount + '</div>\
        </div>\
      </div>\
    </div>\
  ';

  if (codes.length === 0) {
    c.innerHTML = statsHtml + '\
      <div class="preview-video-placeholder" style="padding:3.5rem 1.5rem;">\
        <div style="width:48px;height:48px;border-radius:12px;background:rgba(124,109,250,0.12);display:flex;align-items:center;justify-content:center;color:#a78bfa;margin-bottom:0.5rem;">\
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>\
        </div>\
        <h3 style="font-size:15px;font-weight:600;color:var(--text);margin:0;">Henüz referans kodu tanımlanmadı</h3>\
        <p style="font-size:13px;color:var(--muted);max-width:340px;margin:0;">İş ortaklarınız veya kampanyalarınız için özel indirim kodları oluşturmaya başlayın.</p>\
        <button class="btn btn-primary btn-sm" onclick="if(window.openReferralModal) window.openReferralModal();" style="margin-top:0.75rem;display:inline-flex;align-items:center;gap:6px;">\
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>\
          İlk Kodu Oluştur\
        </button>\
      </div>\
    ';
    return;
  }

  var rows = codes.map(function(item) {
    var isExpired = item.expires_at && new Date() > new Date(item.expires_at);
    var expiryBadge = '';
    if (item.expires_at) {
      if (isExpired) {
        expiryBadge = '<span class="expiry-pill expired" title="Süresi Doldu">⏳ Doldu (' + formatDate(item.expires_at) + ')</span>';
      } else {
        expiryBadge = '<span class="expiry-pill valid" title="Son Geçerlilik">📅 ' + formatDate(item.expires_at) + '</span>';
      }
    } else {
      expiryBadge = '<span class="expiry-pill infinite" title="Süresiz Kod">♾️ Süresiz</span>';
    }

    var usageCount = parseInt(item.usage_count, 10) || 0;
    var maxUsage = item.max_usage ? parseInt(item.max_usage, 10) : null;
    var usagePct = maxUsage ? Math.min(100, Math.round((usageCount / maxUsage) * 100)) : 0;
    var usageText = '<strong>' + usageCount + '</strong> / ' + (maxUsage !== null ? maxUsage : '<span style="font-size:13px;">∞</span>');
    var progressBar = maxUsage
      ? '<div class="usage-track"><div class="usage-bar" style="width:' + usagePct + '%;"></div></div>'
      : '';

    var statusHtml = '\
      <button type="button" class="status-toggle-btn ' + (item.is_active ? 'active' : 'inactive') + '" onclick="handleToggleReferralCode(\'' + item.id + '\', ' + (!item.is_active) + ')" title="Durumu değiştirmek için tıklayın">\
        <span class="status-dot"></span>\
        ' + (item.is_active ? 'Aktif' : 'Pasif') + '\
      </button>\
    ';

    return '\
      <tr>\
        <td>\
          <div class="coupon-code-wrap">\
            <div class="coupon-code-chip" onclick="copyReferralCode(\'' + escapeHtml(item.code) + '\')" title="Kodu Kopyala">\
              <svg class="coupon-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>\
              <strong>' + escapeHtml(item.code) + '</strong>\
              <svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>\
            </div>\
            ' + (item.referrer_name ? '<div class="coupon-referrer">' + escapeHtml(item.referrer_name) + (item.referrer_email ? ' <span class="text-muted">(' + escapeHtml(item.referrer_email) + ')</span>' : '') + '</div>' : '<div class="coupon-referrer text-muted">Genel Kampanya</div>') + '\
          </div>\
        </td>\
        <td>\
          <span class="discount-pill">\
            <span class="discount-pct">%' + item.discount_percent + '</span>\
            <span class="discount-sub">İndirim</span>\
          </span>\
        </td>\
        <td>\
          <div class="usage-progress-wrap">\
            <div class="usage-text">' + usageText + '</div>\
            ' + progressBar + '\
          </div>\
        </td>\
        <td>' + expiryBadge + '</td>\
        <td>' + statusHtml + '</td>\
        <td>\
          <div class="table-action-btns">\
            <button class="btn btn-ghost btn-sm" onclick="editReferralCode(\'' + item.id + '\')" title="Kodu Düzenle" style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;">\
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>\
              Düzenle\
            </button>\
            <button class="btn btn-danger btn-sm" onclick="delReferralCode(\'' + item.id + '\')" title="Kodu Sil" style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;">\
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>\
              Sil\
            </button>\
          </div>\
        </td>\
      </tr>\
    ';
  }).join('');

  c.innerHTML = statsHtml + '\
    <div class="table-wrap" style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;">\
      <div style="overflow-x:auto;">\
        <table class="ww-table">\
          <thead>\
            <tr>\
              <th>Referans Kodu & Sahibi</th>\
              <th>İndirim</th>\
              <th>Kullanım Durumu</th>\
              <th>Son Geçerlilik</th>\
              <th>Durum</th>\
              <th style="text-align:right;">İşlem</th>\
            </tr>\
          </thead>\
          <tbody>\
            ' + rows + '\
          </tbody>\
        </table>\
      </div>\
    </div>\
  ';
}

window.editReferralCode = function(id) {
  var item = (adminState.referralCodes || []).find(function(x) { return String(x.id) === String(id); });
  if (!item) return;
  var idEl = document.getElementById('rc-id');
  if (idEl) idEl.value = item.id;
  var codeEl = document.getElementById('rc-code');
  if (codeEl) codeEl.value = item.code;
  var discEl = document.getElementById('rc-discount');
  if (discEl) discEl.value = item.discount_percent;
  var nameEl = document.getElementById('rc-name');
  if (nameEl) nameEl.value = item.referrer_name || '';
  var emailEl = document.getElementById('rc-email');
  if (emailEl) emailEl.value = item.referrer_email || '';
  var maxEl = document.getElementById('rc-max-usage');
  if (maxEl) maxEl.value = item.max_usage || '';
  var expEl = document.getElementById('rc-expires');
  if (expEl) expEl.value = item.expires_at ? item.expires_at.split('T')[0] : '';
  var actEl = document.getElementById('rc-active');
  if (actEl) actEl.value = item.is_active ? 'true' : 'false';

  var infEmailEl = document.getElementById('rc-influencer-email');
  var infEmail = '';
  if (item.user_profiles) {
    infEmail = Array.isArray(item.user_profiles) ? (item.user_profiles[0]?.email || '') : (item.user_profiles.email || '');
  }
  if (infEmailEl) infEmailEl.value = infEmail;
  
  var commEl = document.getElementById('rc-commission');
  if (commEl) commEl.value = item.commission_rate || '0';
  
  var titleEl = document.getElementById('rc-modal-title');
  if (titleEl) titleEl.textContent = 'Referans Kodunu Düzenle';
  var modalEl = document.getElementById('referral-code-modal');
  if (modalEl) modalEl.classList.add('open');
};

window.delReferralCode = async function(id) {
  if (!confirm('Bu referans kodunu kalıcı olarak silmek istediğinizden emin misiniz?')) return;
  if (typeof deleteReferralCode === 'function') {
    var ok = await deleteReferralCode(id);
    if (ok) {
      if (typeof showToast === 'function') showToast('Referans kodu silindi', 'success');
      renderReferralCodesTable();
    }
  }
};

function initReferralModal() {
  if (window._referralModalInitialized) return;
  window._referralModalInitialized = true;

  var modal = document.getElementById('referral-code-modal');
  var btnAdd = document.getElementById('add-referral-code-btn');
  var btnClose = document.getElementById('close-rc-modal');
  var btnCancel = document.getElementById('cancel-rc-btn');
  var btnSave = document.getElementById('save-rc-btn');

  if (btnAdd) {
    btnAdd.addEventListener('click', function() {
      document.getElementById('rc-id').value = '';
      document.getElementById('rc-code').value = '';
      document.getElementById('rc-discount').value = '20';
      document.getElementById('rc-name').value = '';
      document.getElementById('rc-email').value = '';
      document.getElementById('rc-max-usage').value = '';
      document.getElementById('rc-expires').value = '';
      document.getElementById('rc-active').value = 'true';
      document.getElementById('rc-influencer-email').value = '';
      document.getElementById('rc-commission').value = '';
      document.getElementById('rc-modal-title').textContent = 'Yeni Referans Kodu Ekle';
      modal.classList.add('open');
    });
  }

  function close() { if (modal) modal.classList.remove('open'); }
  if (btnClose) btnClose.addEventListener('click', close);
  if (btnCancel) btnCancel.addEventListener('click', close);

  if (btnSave) {
    btnSave.addEventListener('click', async function() {
      var code = document.getElementById('rc-code').value.trim().toUpperCase();
      var discount = parseInt(document.getElementById('rc-discount').value, 10);
      if (!code) {
        if (typeof showToast === 'function') showToast('Lütfen referans kodunu girin.', 'error');
        else alert('Lütfen referans kodunu girin.');
        return;
      }
      if (isNaN(discount) || discount < 0 || discount > 100) {
        if (typeof showToast === 'function') showToast('İndirim yüzdesi 0 ile 100 arasında olmalıdır.', 'error');
        else alert('İndirim yüzdesi 0 ile 100 arasında olmalıdır.');
        return;
      }
      
      var maxUsageVal = document.getElementById('rc-max-usage').value.trim();
      var expiresVal = document.getElementById('rc-expires').value.trim();
      
      var influencerEmail = document.getElementById('rc-influencer-email').value.trim().toLowerCase();
      var commissionRate = parseFloat(document.getElementById('rc-commission').value);
      
      var influencerUserId = null;
      if (influencerEmail) {
        var client = window.sb; // Get supabase client
        try {
          var { data, error } = await client.from('user_profiles').select('id').eq('email', influencerEmail).single();
          if (error) throw error;
          if (data && data.id) {
            influencerUserId = data.id;
          }
        } catch (e) {
          console.error("Influencer email not found:", e);
          if (typeof showToast === 'function') showToast('Influencer e-postası bulunamadı, lütfen kontrol edin.', 'error');
          else alert('Influencer e-postası bulunamadı.');
          return;
        }
      }

      var payload = {
        code: code,
        discount_percent: discount,
        referrer_name: document.getElementById('rc-name').value.trim() || null,
        referrer_email: document.getElementById('rc-email').value.trim() || null,
        influencer_user_id: influencerUserId,
        commission_rate: isNaN(commissionRate) ? 0 : commissionRate,
        max_usage: maxUsageVal ? parseInt(maxUsageVal, 10) : null,
        expires_at: expiresVal ? new Date(expiresVal).toISOString() : null,
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
// PAYMENT SETTINGS UI (SAAS PRICING & CONFIG HUB)
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
      ltc_discount_enabled: true,
      yearly_discount_percent: 31,
      days_per_monthly: 30,
      days_per_yearly: 365,
      referral_note: 'Referans kodu sadece Litecoin (LTC) ödemelerinde geçerlidir.'
    };
  }

  var monthlyVal = current.monthly_price_usd || 12;
  var yearlyVal = current.yearly_price_usd || 99;
  var videoUrlVal = current.video_embed_url || '';
  var videoEnabledVal = !!current.video_embed_enabled;
  var ltcDiscountVal = current.ltc_discount_enabled !== false;

  c.innerHTML = '\
    <div class="pricing-mgmt-container">\
      <!-- SOL PANEL: FİYAT VE PARAMETRE AYARLARI -->\
      <div class="pricing-config-card">\
        <div class="pricing-config-header">\
          <div class="icon-bubble">\
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>\
          </div>\
          <div>\
            <h3>Fiyatlandırma & Paket Yönetimi</h3>\
            <p>Platform abonelik fiyatlarını, indirimleri ve ödeme seçeneklerini belirleyin</p>\
          </div>\
        </div>\
\
        <!-- Bölüm 1: Plan Ücretleri -->\
        <div class="pricing-form-section">\
          <h4 class="section-title">\
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>\
            Abonelik Plan Ücretleri\
          </h4>\
          <div class="field-row">\
            <div class="field">\
              <label>Aylık Plan Ücreti ($ USD) *</label>\
              <div class="input-with-icon">\
                <span class="input-prefix">$</span>\
                <input type="number" id="ps-monthly" value="' + monthlyVal + '" min="1" step="0.5" />\
                <span class="input-suffix">/ ay</span>\
              </div>\
            </div>\
            <div class="field">\
              <label>Yıllık Plan Ücreti ($ USD) *</label>\
              <div class="input-with-icon">\
                <span class="input-prefix">$</span>\
                <input type="number" id="ps-yearly" value="' + yearlyVal + '" min="1" step="1" />\
                <span class="input-suffix">/ yıl</span>\
              </div>\
            </div>\
          </div>\
          <div class="pricing-calc-info" id="pricing-calc-badge">\
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>\
            <span id="pricing-calc-text">Hesaplanıyor...</span>\
          </div>\
        </div>\
\
        <!-- Bölüm 2: Kripto & Promosyon Ayarları -->\
        <div class="pricing-form-section">\
          <h4 class="section-title">\
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>\
            Promosyon & Kripto Ödemeleri\
          </h4>\
          <div class="toggle-card">\
            <div class="toggle-info">\
              <strong>Litecoin (LTC) Referans İndirimi</strong>\
              <p>Referans indirim kuponları LTC ile ödeme yapan kullanıcılara anında indirim sağlar.</p>\
            </div>\
            <label class="ios-switch">\
              <input type="checkbox" id="ps-ltc-discount" ' + (ltcDiscountVal ? 'checked' : '') + ' />\
              <span class="slider"></span>\
            </label>\
          </div>\
        </div>\
\
        <!-- Bölüm 3: Tanıtım / Rehber Videosu -->\
        <div class="pricing-form-section">\
          <h4 class="section-title">\
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>\
            Ödeme Sayfası Tanıtım Videosu\
          </h4>\
          <div class="toggle-card" style="margin-bottom:0.75rem;">\
            <div class="toggle-info">\
              <strong>Video Gösterimi Aktif</strong>\
              <p>Ödeme ekranında kullanıcılara adım adım rehber veya tanıtım videosu gösterilsin.</p>\
            </div>\
            <label class="ios-switch">\
              <input type="checkbox" id="ps-video-enabled" ' + (videoEnabledVal ? 'checked' : '') + ' />\
              <span class="slider"></span>\
            </label>\
          </div>\
          <div class="field" id="video-url-field-wrap">\
            <label>YouTube Embed Video URL</label>\
            <div class="input-with-icon">\
              <span class="input-prefix" style="font-size:12px;">🔗</span>\
              <input type="text" id="ps-video-url" value="' + escapeHtml(videoUrlVal) + '" placeholder="https://www.youtube.com/embed/..." />\
            </div>\
            <p class="field-hint">Format: <code>https://www.youtube.com/embed/VIDEO_ID</code></p>\
          </div>\
        </div>\
\
        <!-- Kaydet Butonu -->\
        <div class="pricing-form-actions" style="margin-top:0.5rem;">\
          <button class="btn btn-primary" id="save-ps-btn" style="display:inline-flex;align-items:center;gap:8px;padding:0.75rem 1.75rem;font-size:14px;">\
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>\
            <span>Ayarları Kaydet</span>\
          </button>\
        </div>\
      </div>\
\
      <!-- SAĞ PANEL: CANLI KULLANICI ÖNİZLEMESİ -->\
      <div class="pricing-preview-panel">\
        <div class="preview-header">\
          <div class="preview-badge">\
            <span class="live-dot"></span> Canlı Kullanıcı Önizlemesi\
          </div>\
          <p>Kullanıcıların satın alma ekranında göreceği fiyatlandırma kartları</p>\
        </div>\
\
        <div class="preview-cards-container">\
          <!-- Aylık Plan Önizleme -->\
          <div class="preview-plan-card" id="prev-monthly-card">\
            <div class="preview-plan-name">Aylık Plan</div>\
            <div class="preview-price-row">\
              <span class="preview-price-val" id="prev-monthly-price">$' + monthlyVal + '</span>\
              <span class="preview-price-cycle">/ ay</span>\
            </div>\
            <div class="preview-price-sub">Her ay otomatik yenilenir</div>\
            <ul class="preview-features-list">\
              <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Sınırsız İşlem Günlüğü</li>\
              <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Detaylı Analitik & İstatistik</li>\
              <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Otomatik Metrik Hesaplama</li>\
            </ul>\
          </div>\
\
          <!-- Yıllık Plan Önizleme (Featured) -->\
          <div class="preview-plan-card featured" id="prev-yearly-card">\
            <span class="preview-plan-badge" id="prev-yearly-savings-badge">%31 Tasarruf</span>\
            <div class="preview-plan-name" style="color:#a78bfa;">Yıllık Plan</div>\
            <div class="preview-price-row">\
              <span class="preview-price-val" id="prev-yearly-price">$' + yearlyVal + '</span>\
              <span class="preview-price-cycle">/ yıl</span>\
            </div>\
            <div class="preview-price-sub" id="prev-yearly-equiv" style="color:#34d399;">Ayda ~$8.25</div>\
            <ul class="preview-features-list">\
              <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> 365 Gün Kesintisiz Erişim</li>\
              <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Tüm Premium Özellikler</li>\
              <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Öncelikli VIP Destek</li>\
            </ul>\
          </div>\
        </div>\
\
        <!-- Video Canlı Önizleme Kutusu -->\
        <div class="preview-video-box" id="prev-video-box">\
          <div class="video-label">\
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>\
            Video Canlı Önizlemesi\
          </div>\
          <div id="prev-video-player-container"></div>\
        </div>\
      </div>\
    </div>\
  ';

  // Live Preview & Calculation Engine
  function updateLivePricingPreview() {
    var m = parseFloat(document.getElementById('ps-monthly').value) || 0;
    var y = parseFloat(document.getElementById('ps-yearly').value) || 0;
    var vUrl = (document.getElementById('ps-video-url').value || '').trim();
    var vEnabled = document.getElementById('ps-video-enabled').checked;

    // Fiyat etiketlerini güncelle
    var mPriceEl = document.getElementById('prev-monthly-price');
    var yPriceEl = document.getElementById('prev-yearly-price');
    var yEquivEl = document.getElementById('prev-yearly-equiv');
    var yBadgeEl = document.getElementById('prev-yearly-savings-badge');
    var calcTextEl = document.getElementById('pricing-calc-text');

    if (mPriceEl) mPriceEl.textContent = '$' + (m % 1 === 0 ? m : m.toFixed(2));
    if (yPriceEl) yPriceEl.textContent = '$' + (y % 1 === 0 ? y : y.toFixed(2));

    var regularYearly = m * 12;
    var savingsPct = 0;
    var savingsDollars = 0;

    if (regularYearly > 0 && y > 0 && regularYearly > y) {
      savingsPct = Math.round(((regularYearly - y) / regularYearly) * 100);
      savingsDollars = Math.round(regularYearly - y);
    }

    var monthlyEquiv = (y / 12).toFixed(2);
    if (yEquivEl) yEquivEl.textContent = 'Ayda ~$' + monthlyEquiv + ' ($' + regularYearly + ' yerine)';
    if (yBadgeEl) yBadgeEl.textContent = '%' + (savingsPct > 0 ? savingsPct : 0) + ' Tasarruf';

    if (calcTextEl) {
      if (savingsPct > 0) {
        calcTextEl.innerHTML = 'Kullanıcılar yıllık planda <strong>%' + savingsPct + ' indirim</strong> (yılda <strong>$' + savingsDollars + '</strong> tasarruf) elde ediyor.';
      } else {
        calcTextEl.innerHTML = 'Aylık 12 ay toplamı: <strong>$' + regularYearly + '</strong>. Yıllık fiyat: <strong>$' + y + '</strong>.';
      }
    }

    // Video Player Önizlemesini Güncelle
    var vContainer = document.getElementById('prev-video-player-container');
    if (vContainer) {
      if (vEnabled && vUrl) {
        // Sanitize YouTube URL for embed
        var safeEmbedUrl = vUrl;
        if (vUrl.indexOf('youtube.com/watch?v=') !== -1) {
          var vidId = vUrl.split('v=')[1].split('&')[0];
          safeEmbedUrl = 'https://www.youtube.com/embed/' + vidId;
        } else if (vUrl.indexOf('youtu.be/') !== -1) {
          var vidId2 = vUrl.split('youtu.be/')[1].split('?')[0];
          safeEmbedUrl = 'https://www.youtube.com/embed/' + vidId2;
        }

        vContainer.innerHTML = '\
          <div class="preview-video-iframe-wrap">\
            <iframe src="' + escapeHtml(safeEmbedUrl) + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>\
          </div>\
        ';
      } else if (vEnabled && !vUrl) {
        vContainer.innerHTML = '\
          <div class="preview-video-placeholder">\
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>\
            <span>Video aktif edildi fakat henüz URL girilmedi.</span>\
          </div>\
        ';
      } else {
        vContainer.innerHTML = '\
          <div class="preview-video-placeholder">\
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56"/></svg>\
            <span>Tanıtım videosu gösterimi şu anda pasif durumda.</span>\
          </div>\
        ';
      }
    }
  }

  // Bind live change listeners
  var mInput = document.getElementById('ps-monthly');
  var yInput = document.getElementById('ps-yearly');
  var vUrlInput = document.getElementById('ps-video-url');
  var vEnabledInput = document.getElementById('ps-video-enabled');

  if (mInput) mInput.addEventListener('input', updateLivePricingPreview);
  if (yInput) yInput.addEventListener('input', updateLivePricingPreview);
  if (vUrlInput) vUrlInput.addEventListener('input', updateLivePricingPreview);
  if (vEnabledInput) vEnabledInput.addEventListener('change', updateLivePricingPreview);

  // Initial calculation
  updateLivePricingPreview();

  // Save button action
  var saveBtn = document.getElementById('save-ps-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async function() {
      var m = parseFloat(document.getElementById('ps-monthly').value) || 12;
      var y = parseFloat(document.getElementById('ps-yearly').value) || 99;
      var vUrl = document.getElementById('ps-video-url').value.trim();
      var vEnabled = document.getElementById('ps-video-enabled').checked;
      var ltcDisc = document.getElementById('ps-ltc-discount').checked;

      var regYear = m * 12;
      var discPct = regYear > 0 && y < regYear ? Math.round(((regYear - y) / regYear) * 100) : 0;

      var payload = {
        monthly_price_usd: m,
        yearly_price_usd: y,
        yearly_discount_percent: discPct,
        video_embed_url: vUrl,
        video_embed_enabled: vEnabled,
        ltc_discount_enabled: ltcDisc,
        days_per_monthly: 30,
        days_per_yearly: 365,
        referral_note: 'Referans kodu sadece Litecoin (LTC) ödemelerinde geçerlidir.'
      };

      saveBtn.disabled = true;
      saveBtn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;"></div><span> Kaydediliyor...</span>';
      
      var ok = await savePaymentSettings(payload);
      
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span>Ayarları Kaydet</span>';

      if (ok) {
        updateLivePricingPreview();
      }
    });
  }
}

window.openReferralModal = function() {
  document.getElementById('rc-id').value = '';
  document.getElementById('rc-code').value = '';
  document.getElementById('rc-discount').value = '20';
  document.getElementById('rc-name').value = '';
  document.getElementById('rc-email').value = '';
  document.getElementById('rc-max-usage').value = '';
  document.getElementById('rc-expires').value = '';
  document.getElementById('rc-active').value = 'true';
  document.getElementById('rc-influencer-email').value = '';
  document.getElementById('rc-commission').value = '';
  document.getElementById('rc-modal-title').textContent = 'Yeni Referans Kodu Ekle';
  var m = document.getElementById('referral-code-modal');
  if (m) m.classList.add('open');
};

// ============================================================
// GENEL (OVERVIEW) DASHBOARD
// ============================================================

function destroyOverviewCharts() {
  if (!window.adminState) return;
  if (!window.adminState.charts) {
    window.adminState.charts = {};
    return;
  }
  var c = window.adminState.charts;
  if (c.overviewUserChart) {
    try { c.overviewUserChart.destroy(); } catch(e) {}
    c.overviewUserChart = null;
  }
  if (c.overviewRevenueChart) {
    try { c.overviewRevenueChart.destroy(); } catch(e) {}
    c.overviewRevenueChart = null;
  }
  if (c.overviewPlanDonut) {
    try { c.overviewPlanDonut.destroy(); } catch(e) {}
    c.overviewPlanDonut = null;
  }
}

window.changeOverviewPeriod = function(period) {
  if (window.adminState) window.adminState.overviewPeriod = period;
  if (typeof renderOverviewContent === 'function') {
    renderOverviewContent(period);
  }
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
          '<h2 style="font-size:1.25rem;font-weight:700;letter-spacing:-0.02em;margin:0 0 4px 0;color:var(--text);display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
            'Platform Genel Bakış ' +
            '<span class="live-connection-badge ' + (navigator.onLine ? 'online' : 'offline') + '" id="overview-live-badge">' +
              '<span class="live-status-dot ' + (navigator.onLine ? 'pulse' : '') + '"></span>' +
              '<span class="live-status-text">' + (navigator.onLine ? 'Güncellenme : Şuan Canlı' : 'İnternet bağlantısı kesildi') + '</span>' +
            '</span>' +
          '</h2>' +
          '<p style="font-size:13px;color:var(--muted);margin:0;">Sistem geneli kullanıcı, abonelik ve gelir metrikleri</p>' +
        '</div>' +
        '<div class="period-switcher-pill">' +
          '<button type="button" class="period-pill-btn ' + (period === 'week' ? 'active' : '') + '" onclick="window.changeOverviewPeriod(\'week\')">1 Hafta</button>' +
          '<button type="button" class="period-pill-btn ' + (period === 'month' ? 'active' : '') + '" onclick="window.changeOverviewPeriod(\'month\')">1 Ay</button>' +
          '<button type="button" class="period-pill-btn ' + (period === 'year' ? 'active' : '') + '" onclick="window.changeOverviewPeriod(\'year\')">1 Yıl</button>' +
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
          fontFamily: "'Inter', sans-serif",
          animations: { enabled: false }
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
            style: { colors: theme.textColor, fontSize: '11px', fontFamily: "'Inter', sans-serif" }
          },
          axisBorder: { show: false },
          axisTicks: { show: false }
        },
        yaxis: {
          labels: {
            style: { colors: theme.textColor, fontSize: '11px', fontFamily: "'Inter', sans-serif" },
            formatter: function(val) { return Math.round(val); }
          }
        },
        grid: { borderColor: theme.gridColor, strokeDashArray: 4 },
        tooltip: {
          theme: theme.mode,
          style: { fontFamily: "'Inter', sans-serif" },
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
          fontFamily: "'Inter', sans-serif",
          animations: { enabled: false }
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
            style: { colors: theme.textColor, fontSize: '11px', fontFamily: "'Inter', sans-serif" }
          },
          axisBorder: { show: false },
          axisTicks: { show: false }
        },
        yaxis: {
          labels: {
            style: { colors: theme.textColor, fontSize: '11px', fontFamily: "'Inter', sans-serif" },
            formatter: function(val) { return '$' + Math.round(val); }
          }
        },
        grid: { borderColor: theme.gridColor, strokeDashArray: 4 },
        tooltip: {
          theme: theme.mode,
          style: { fontFamily: "'Inter', sans-serif" },
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
          fontFamily: "'Inter', sans-serif",
          animations: { enabled: false }
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
                name: { show: true, fontSize: '12px', fontFamily: "'Inter', sans-serif", color: theme.textColor },
                value: { show: true, fontSize: '20px', fontFamily: "'Inter', sans-serif", fontWeight: 700, color: theme.mode === 'dark' ? '#fff' : '#0f172a' },
                total: {
                  show: true,
                  label: 'Toplam',
                  fontSize: '12px',
                  fontFamily: "'Inter', sans-serif",
                  color: theme.textColor,
                  formatter: function() { return totalUsers; }
                }
              }
            }
          }
        },
        tooltip: {
          theme: theme.mode,
          style: { fontFamily: "'Inter', sans-serif" },
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
window.changeOverviewPeriod = window.changeOverviewPeriod || changeOverviewPeriod;
window.destroyOverviewCharts = destroyOverviewCharts;
window.loadAnalyticsData = loadAnalyticsData;
window.renderPricesContent = renderPricesContent;
window.renderPaymentSettingsUI = renderPaymentSettingsUI;
window.initReferralModal = initReferralModal;
window.renderReferralCodesTable = renderReferralCodesTable;
