// ============================================================
// ADMIN-DASHBOARD.JS - GENEL BAKIŞ, İSTATİSTİK, FİYAT, REFERANS KODU,
// PARTNER, ÇEKİM VE HATA BİLDİRİMİ PANELLERİ
// Grafikler ApexCharts ile çizilir; renk ve yazı tipi ortak tema
// (window.WwChart) ile uygulamanın CSS değişkenlerinden gelir.
// Tablolardaki düğmeler satır içi onclick yerine veri öznitelikleri +
// tek bir olay dinleyicisiyle çalışır (kimlik/metinler HTML'e gömülmez).
// ============================================================
var wwLog = (typeof window !== 'undefined' && window.wwLog) ? window.wwLog : console;
if (typeof window !== 'undefined' && !window.wwLog) window.wwLog = wwLog;

// SPA: başka sayfaya geçilince ADMIN_PAGE.on ile eklenen dinleyiciler kaldırılır,
// ADMIN_PAGE.onLeave ile kaydedilenler çalışır (BaseHead.astro → wwPage)
var ADMIN_PAGE = window.wwPage.current();

// Sayfadan çıkarken grafikleri yok et
ADMIN_PAGE.onLeave(function() {
  var charts = (window.adminState && window.adminState.charts) || {};
  Object.keys(charts).forEach(function(key) {
    if (charts[key] && typeof charts[key].destroy === 'function') {
      try { charts[key].destroy(); } catch (e) {}
    }
    charts[key] = null;
  });
});

function getSbClient() {
  return (typeof window !== 'undefined' && window.sb) ? window.sb : (typeof sb !== 'undefined' ? sb : null);
}

// ============================================================
// GRAFİK YARDIMCILARI
// ============================================================
function adminCssVar(name, fallback) {
  try {
    var v = getComputedStyle(document.body).getPropertyValue(name).trim();
    return v || fallback;
  } catch (e) {
    return fallback;
  }
}

function getAdminApexTheme() {
  var isLight = document.body.classList.contains('light-theme');
  return {
    mode: isLight ? 'light' : 'dark',
    textColor: isLight ? '#475569' : '#a8a8c0',
    gridColor: isLight ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.05)',
    accent: adminCssVar('--accent', '#8b5cf6'),
    accent2: adminCssVar('--accent2', '#c084fc'),
    green: adminCssVar('--green', '#22c55e'),
    muted: adminCssVar('--muted', '#a0a0b8')
  };
}

// WwChart (shared/chart-theme.js) yüklenmemişse (eski önbellekli sayfa) sade bir yedek kullanılır
var ADMIN_CHART_FALLBACK_FONT = "'Geist', system-ui, sans-serif";

function adminChartColors(theme) {
  if (window.WwChart) return WwChart.colors();
  return { text: theme.mode === 'dark' ? '#e8e8f0' : '#0f172a', muted: theme.textColor, grid: theme.gridColor };
}

function adminChartFont() {
  return window.WwChart ? WwChart.FONT : ADMIN_CHART_FALLBACK_FONT;
}

function adminAxisLabels(theme) {
  if (window.WwChart) return WwChart.axisLabels();
  return { colors: theme.textColor, fontFamily: ADMIN_CHART_FALLBACK_FONT, fontSize: '12px' };
}

function adminBarRadius() {
  return window.WwChart ? WwChart.BAR.borderRadius : 6;
}

// Bar kalınlığı: kap genişliği / kategori sayısı, en fazla 44px (2-3 bar dev blok olmasın)
function adminBarWidth(el, count, fallback) {
  if (!window.WwChart) return fallback;
  return WwChart.barSize(el ? el.clientWidth : 0, count);
}

function adminApex(theme, opts) {
  if (window.WwChart) return WwChart.apex(opts);
  opts.chart = opts.chart || {};
  opts.chart.fontFamily = ADMIN_CHART_FALLBACK_FONT;
  opts.chart.background = 'transparent';
  opts.chart.toolbar = { show: false };
  opts.grid = opts.grid || {};
  opts.grid.borderColor = theme.gridColor;
  opts.tooltip = opts.tooltip || {};
  opts.tooltip.theme = theme.mode;
  opts.tooltip.style = { fontFamily: ADMIN_CHART_FALLBACK_FONT, fontSize: '12px' };
  return opts;
}

// Sayı (adet) grafiği için Y ekseni: yalnızca tam sayı basamakları.
// Eskiden ApexCharts 0.2'lik adımlar üretip etiketleri yuvarladığı için "1 1 1 0 0 0" görünüyordu.
function adminCountAxis(values, theme) {
  var top = Math.max.apply(null, (values || []).concat([1]));
  var step = Math.max(1, Math.ceil(top / 4));
  var ticks = Math.ceil(top / step);
  return {
    min: 0,
    max: step * ticks,
    tickAmount: ticks,
    forceNiceScale: false,
    labels: { style: adminAxisLabels(theme), formatter: function(v) { return Math.round(v); } }
  };
}

// Dolar grafiği için Y ekseni (veri yoksa $0–$10 gösterilir, negatif eksen oluşmaz)
function adminMoneyAxis(values, theme) {
  var top = Math.max.apply(null, (values || []).concat([0]));
  var axis = {
    min: 0,
    labels: { style: adminAxisLabels(theme), formatter: function(v) { return '$' + Math.round(v).toLocaleString('en-US'); } }
  };
  if (top <= 0) {
    axis.max = 10;
    axis.tickAmount = 2;
  } else {
    axis.forceNiceScale = true;
  }
  return axis;
}

function adminCategoryAxis(labels, theme) {
  return {
    categories: labels,
    labels: { style: adminAxisLabels(theme), rotate: 0, hideOverlappingLabels: true, trim: false },
    axisBorder: { show: false },
    axisTicks: { show: false },
    tooltip: { enabled: false }
  };
}

// ============================================================
// GELİR = yalnızca GERÇEK ödemeler (payments: finished/confirmed)
// ============================================================
// Eskiden gelir, kullanıcının "kalan gün sayısına" bakılarak tahmin ediliyordu (65 günden fazla = yıllık):
// yıllık aboneliğin son 65 gününde "aylık" sanılıp uydurma 12 $'lık satış ekleniyor, art arda aylık
// yenilemeler "yıllık" sanılıp 99 $ ekleniyor, admin'in verdiği pro da gelir sayılıyordu.
// Artık yalnızca payments tablosundaki tamamlanmış ödemeler toplanır.

// Fiyat para birimi dışındaki ödemeler USD'ye çevrilir (create-payment ile aynı sabit kurlar)
var ADMIN_FX_TO_USD = { USD: 1, EUR: 1 / 0.92, GBP: 1 / 0.79, TRY: 1 / 33.5 };

function paymentAmountUsd(p) {
  var amount = Number(p.amount);
  if (!isFinite(amount) || amount <= 0) return 0;
  var cur = String(p.currency || 'USD').toUpperCase();
  var rate = ADMIN_FX_TO_USD[cur];
  return amount * (rate === undefined ? 1 : rate);
}

function paymentPlanLabel(p) {
  var t = String(p.plan_type || '').toLowerCase();
  if (t === 'yearly' || t === 'year') return 'Yıllık';
  if (t === '6months' || t === '6_months') return '6 Aylık';
  if (t === '3months' || t === '3_months') return '3 Aylık';
  if (!t && paymentAmountUsd(p) > 30) return 'Yıllık';
  return 'Aylık';
}

function paymentToSubscription(p) {
  var plan = paymentPlanLabel(p);
  var start = p.created_at ? new Date(p.created_at) : new Date();
  return {
    isYearly: plan === 'Yıllık',
    planLabel: plan,
    price: paymentAmountUsd(p),
    startDate: isNaN(start.getTime()) ? new Date() : start,
    referralCode: p.referral_code || null,
    isRealPayment: true,
    paymentId: p.id || null
  };
}

// Geliştirici test planı (plan_type 'test') gelir/satış istatistiklerine dahil edilmez
function adminCompletedPayments() {
  return (adminState.payments || []).filter(function(p) {
    return (p.payment_status === 'finished' || p.payment_status === 'confirmed') && p.plan_type !== 'test';
  });
}

// Yerel takvim günü anahtarı (YYYY-MM-DD): "İstatistikler" ve "Genel" panelleri aynı günlük kovayı kullanır
function adminDayKey(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

// ============================================================
// İSTATİSTİKLER PANELİ
// ============================================================
async function loadAnalyticsData() {
  try {
    var last7 = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      last7.push(adminDayKey(d));
    }

    var client = getSbClient();
    if (!client) {
      wwLog.warn('Supabase client not ready for analytics');
      return;
    }
    var profilesRes = await adminFetchAll('user_profiles', '*', 'created_at', false);
    var profileList = profilesRes.data || [];
    var profileById = {};
    profileList.forEach(function(p) { profileById[p.id] = p; });

    // Bitiş tarihi boş pro (manuel verilen) de aktiftir; kullanıcı tablosu/erişimle tutarlı
    var totalPro = profileList.filter(function(p) {
      return p.plan === 'premium' && (!p.plan_expires_at || new Date(p.plan_expires_at) > new Date());
    }).length;

    var totalRevenue = 0;
    var revenueByDay = {};
    var recentProUsers = [];

    var sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Gelir ve "son satışlar" yalnızca gerçek ödemelerden hesaplanır
    adminCompletedPayments().forEach(function(p) {
      var sub = paymentToSubscription(p);
      if (sub.price <= 0) return;
      totalRevenue += sub.price;

      var dayKey = adminDayKey(sub.startDate);
      revenueByDay[dayKey] = (revenueByDay[dayKey] || 0) + sub.price;

      var matchedUser = profileById[p.user_id];
      recentProUsers.push({
        username: (matchedUser && (matchedUser.username || matchedUser.email)) || 'Kullanıcı',
        email: (matchedUser && matchedUser.email) || '—',
        plan: sub.planLabel,
        amount: sub.price,
        date: sub.startDate,
        referralCode: sub.referralCode,
        avatar_url: (matchedUser && matchedUser.avatar_url) || null
      });
    });

    recentProUsers.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });

    var revenueData = last7.map(function(day) { return Math.round((revenueByDay[day] || 0) * 100) / 100; });
    var userCountByDay = {};
    profileList.forEach(function(p) {
      if (!p.created_at) return;
      var cd = new Date(p.created_at);
      if (isNaN(cd.getTime())) return;
      var key = adminDayKey(cd);
      userCountByDay[key] = (userCountByDay[key] || 0) + 1;
    });
    var uCounts = last7.map(function(day) { return userCountByDay[day] || 0; });

    // "Son 7 Gün Pro": yalnızca son 7 günde gerçekleşen satışlar
    var pro7Days = recentProUsers.filter(function(r) { return new Date(r.date) >= sevenDaysAgo; }).length;

    var statsEls = {
      'stat-total-users': profileList.length,
      'stat-total-pro': totalPro,
      'stat-pro-revenue': '$' + totalRevenue.toFixed(2),
      'stat-pro-7days': pro7Days
    };
    Object.keys(statsEls).forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.textContent = statsEls[id];
    });

    var recentContainer = document.getElementById('recent-pro-list');
    if (recentContainer) {
      if (recentProUsers.length === 0) {
        recentContainer.innerHTML = '<div class="empty-state">Henüz Pro satışı yok.</div>';
      } else {
        recentContainer.innerHTML = recentProUsers.slice(0, 10).map(function(u) {
          var refBadge = u.referralCode
            ? '<span class="kpi-badge badge-purple">' + escapeHtml(u.referralCode) + '</span>'
            : '';
          return '<div class="recent-pro-card">' +
            '<div class="avatar-small">' + avatarMarkup(u.avatar_url, u.username) + '</div>' +
            '<div class="info">' +
              '<div class="name">' + escapeHtml(u.username) + '</div>' +
              '<div class="email">' + escapeHtml(u.email) + '</div>' +
              '<div class="meta"><span class="chip">' + escapeHtml(u.plan) + '</span>' + refBadge + '<span>' + formatDateFull(u.date) + '</span></div>' +
            '</div>' +
            '<div class="amount">+$' + u.amount.toFixed(2) + '</div>' +
          '</div>';
        }).join('');
      }
    }

    var labels = last7.map(function(day) { return day.slice(5).replace('-', '/'); });
    var theme = getAdminApexTheme();

    ['userChart', 'proChart'].forEach(function(key) {
      if (adminState.charts[key]) {
        try { adminState.charts[key].destroy(); } catch (e) {}
        adminState.charts[key] = null;
      }
    });

    if (typeof ApexCharts === 'undefined') return;

    function barChart(el, name, data, color, yaxis, tooltipFormatter) {
      el.innerHTML = '';
      return new ApexCharts(el, adminApex(theme, {
        series: [{ name: name, data: data }],
        chart: { type: 'bar', height: '100%', animations: { enabled: false } },
        plotOptions: {
          bar: {
            borderRadius: adminBarRadius(),
            borderRadiusApplication: 'end',
            columnWidth: adminBarWidth(el, labels.length, '45%')
          }
        },
        colors: [color],
        fill: { type: 'solid', opacity: 0.28 },
        stroke: { show: true, width: 2, colors: [color] },
        grid: { position: 'back' },
        xaxis: adminCategoryAxis(labels, theme),
        yaxis: yaxis,
        tooltip: tooltipFormatter ? { y: { formatter: tooltipFormatter } } : {},
        legend: { show: false }
      }));
    }

    var usersEl = document.getElementById('usersChart');
    if (usersEl) {
      adminState.charts.userChart = barChart(usersEl, 'Kullanıcı', uCounts, theme.green, adminCountAxis(uCounts, theme));
      adminState.charts.userChart.render();
    }

    var proEl = document.getElementById('proChart');
    if (proEl) {
      adminState.charts.proChart = barChart(proEl, 'Pro Gelir ($)', revenueData, theme.accent, adminMoneyAxis(revenueData, theme),
        function(val) { return '$' + Number(val).toFixed(2); });
      adminState.charts.proChart.render();
    }
  } catch (e) {
    console.error('loadAnalyticsData hatası:', e);
  }
}

// ============================================================
// FİYAT YÖNETİMİ (içerik aşağıda: renderPaymentSettingsUI)
// ============================================================
function renderPricesContent() {
  if (typeof renderPaymentSettingsUI === 'function') {
    renderPaymentSettingsUI();
  }
}
window.renderPricesContent = renderPricesContent;
window.addPaymentMethod = function() {};
window.removePaymentMethod = function() {};

// Panoya kopyala (güvenli bağlamda Clipboard API, değilse textarea yedeği)
function adminCopyText(text, successMessage) {
  if (!text) return;
  function fallback() {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    showToast(ok ? successMessage : 'Kopyalanamadı', ok ? 'success' : 'error');
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() { showToast(successMessage, 'success'); }).catch(fallback);
  } else {
    fallback();
  }
}

window.copyReferralCode = function(code) { adminCopyText(code, 'Referans kodu kopyalandı: ' + code); };
function copyPayoutAddress(addr) { adminCopyText(addr, 'Cüzdan adresi kopyalandı'); }

// ============================================================
// REFERANS KODLARI
// ============================================================
var ADMIN_REF_ICONS = {
  code: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/>',
  active: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  usage: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  discount: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>'
};

function adminIconSvg(inner, size) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' +
    (size ? ' width="' + size + '" height="' + size + '"' : '') + ' aria-hidden="true">' + inner + '</svg>';
}

function renderReferralCodesTable() {
  var c = document.getElementById('referral-codes-container');
  if (!c) return;
  var codes = adminState.referralCodes || [];

  var totalCodes = codes.length;
  var activeCodes = codes.filter(function(item) { return item.is_active; }).length;
  var totalUsages = codes.reduce(function(acc, item) { return acc + (parseInt(item.usage_count, 10) || 0); }, 0);
  var avgDiscount = totalCodes > 0
    ? Math.round(codes.reduce(function(acc, item) { return acc + (parseInt(item.discount_percent, 10) || 0); }, 0) / totalCodes)
    : 0;

  function statCard(icon, tone, label, value, valueClass) {
    return '<div class="ref-stat-card">' +
      '<div class="ref-stat-icon ' + tone + '">' + adminIconSvg(ADMIN_REF_ICONS[icon]) + '</div>' +
      '<div class="ref-stat-meta"><span class="ref-stat-label">' + label + '</span>' +
      '<div class="ref-stat-val ' + (valueClass || '') + '">' + value + '</div></div>' +
    '</div>';
  }

  var statsHtml = '<div class="ref-stats-grid">' +
    statCard('code', 'icon-code', 'Toplam Kod', totalCodes) +
    statCard('active', 'icon-active', 'Aktif Kodlar', activeCodes, 'green') +
    statCard('usage', 'icon-usage', 'Toplam Kullanım', totalUsages, 'blue') +
    statCard('discount', 'icon-discount', 'Ort. İndirim', '%' + avgDiscount, 'amber') +
  '</div>';

  if (codes.length === 0) {
    c.innerHTML = statsHtml +
      '<div class="empty-state">' +
        '<div class="empty-state-icon">' + adminIconSvg(ADMIN_REF_ICONS.code) + '</div>' +
        '<strong>Henüz referans kodu tanımlanmadı</strong>' +
        '<p>İş ortaklarınız veya kampanyalarınız için özel indirim kodları oluşturmaya başlayın.</p>' +
        '<button type="button" class="btn btn-primary btn-sm" data-add-code>' + adminSvg('plus', '', 14) + 'İlk Kodu Oluştur</button>' +
      '</div>';
    bindReferralCodesTable(c);
    return;
  }

  var now = new Date();
  var rows = codes.map(function(item) {
    var expiryBadge;
    if (item.expires_at) {
      expiryBadge = now > new Date(item.expires_at)
        ? '<span class="expiry-pill expired">Doldu (' + formatDate(item.expires_at) + ')</span>'
        : '<span class="expiry-pill valid">' + formatDate(item.expires_at) + '</span>';
    } else {
      expiryBadge = '<span class="expiry-pill infinite">Süresiz</span>';
    }

    var usageCount = parseInt(item.usage_count, 10) || 0;
    var maxUsage = item.max_usage ? parseInt(item.max_usage, 10) : null;
    var usagePct = maxUsage ? Math.min(100, Math.round((usageCount / maxUsage) * 100)) : 0;
    var usageText = '<strong>' + usageCount + '</strong> / ' + (maxUsage !== null ? maxUsage : '∞');
    var progressBar = maxUsage ? '<div class="usage-track"><div class="usage-bar" style="width:' + usagePct + '%"></div></div>' : '';

    var id = escapeHtml(item.id);
    var code = escapeHtml(item.code);
    var owner = item.referrer_name
      ? '<div class="coupon-referrer">' + escapeHtml(item.referrer_name) +
        (item.referrer_email ? ' <span class="text-muted">(' + escapeHtml(item.referrer_email) + ')</span>' : '') + '</div>'
      : '<div class="coupon-referrer is-muted">Genel Kampanya</div>';

    return '<tr>' +
      '<td><div class="coupon-code-wrap">' +
        '<div class="coupon-code-chip" role="button" tabindex="0" data-copy-code="' + code + '" title="Kodu kopyala">' +
          adminIconSvg(ADMIN_REF_ICONS.code, 14).replace('<svg ', '<svg class="coupon-icon" ') +
          '<strong>' + code + '</strong>' +
          '<svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
        '</div>' + owner +
        '<div class="coupon-commission">Komisyon: <b class="text-green">$' + escapeHtml(item.commission_rate || 0) + ' (Aylık)</b> / <b class="text-accent">$' + escapeHtml(item.commission_rate_yearly || 0) + ' (Yıllık)</b></div>' +
      '</div></td>' +
      '<td><span class="discount-pill"><span class="discount-pct">%' + escapeHtml(item.discount_percent) + '</span><span class="discount-sub">İndirim</span></span></td>' +
      '<td><div class="usage-progress-wrap"><div class="usage-text">' + usageText + '</div>' + progressBar + '</div></td>' +
      '<td>' + expiryBadge + '</td>' +
      '<td><button type="button" class="status-toggle-btn ' + (item.is_active ? 'active' : 'inactive') + '" data-toggle-code="' + id + '" data-next="' + (item.is_active ? 'false' : 'true') + '" title="Durumu değiştirmek için tıklayın"><span class="status-dot"></span>' + (item.is_active ? 'Aktif' : 'Pasif') + '</button></td>' +
      '<td class="right"><div class="table-action-btns">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-edit-code="' + id + '" title="Kodu düzenle">Düzenle</button>' +
        '<button type="button" class="btn btn-danger btn-sm" data-del-code="' + id + '" title="Kodu sil">Sil</button>' +
      '</div></td>' +
    '</tr>';
  }).join('');

  c.innerHTML = statsHtml +
    '<div class="table-wrap"><div class="table-scroll"><table class="ww-table">' +
      '<thead><tr><th>Referans Kodu &amp; Sahibi</th><th>İndirim</th><th>Kullanım Durumu</th><th>Son Geçerlilik</th><th>Durum</th><th class="right">İşlem</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table></div></div>';

  bindReferralCodesTable(c);
}

function bindReferralCodesTable(c) {
  c.onclick = function(e) {
    var copy = e.target.closest('[data-copy-code]');
    if (copy) { window.copyReferralCode(copy.getAttribute('data-copy-code')); return; }
    var toggle = e.target.closest('[data-toggle-code]');
    if (toggle) { window.handleToggleReferralCode(toggle.getAttribute('data-toggle-code'), toggle.getAttribute('data-next') === 'true'); return; }
    var edit = e.target.closest('[data-edit-code]');
    if (edit) { window.editReferralCode(edit.getAttribute('data-edit-code')); return; }
    var del = e.target.closest('[data-del-code]');
    if (del) { window.delReferralCode(del.getAttribute('data-del-code')); return; }
    if (e.target.closest('[data-add-code]')) window.openReferralModal();
  };
  c.onkeydown = function(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var copy = e.target.closest('[data-copy-code]');
    if (copy) { e.preventDefault(); window.copyReferralCode(copy.getAttribute('data-copy-code')); }
  };
}

window.handleToggleReferralCode = async function(id, newStatus) {
  var ok = await toggleReferralCodeStatus(id, newStatus);
  if (ok) renderReferralCodesTable();
};

var ADMIN_RC_FIELDS = [
  'rc-id', 'rc-code', 'rc-discount', 'rc-name', 'rc-email', 'rc-max-usage',
  'rc-expires', 'rc-active', 'rc-influencer-email', 'rc-commission', 'rc-commission-yearly'
];

function adminSetField(id, value) {
  var el = document.getElementById(id);
  if (el) el.value = value;
}

// Referans kodu penceresini boş/varsayılan değerlerle açar
window.openReferralModal = function() {
  var defaults = { 'rc-discount': '20', 'rc-active': 'true' };
  ADMIN_RC_FIELDS.forEach(function(id) { adminSetField(id, defaults[id] !== undefined ? defaults[id] : ''); });
  var title = document.getElementById('rc-modal-title');
  if (title) title.textContent = 'Yeni Referans Kodu Ekle';
  var m = document.getElementById('referral-code-modal');
  if (m) m.classList.add('open');
};

window.editReferralCode = function(id) {
  var item = (adminState.referralCodes || []).find(function(x) { return String(x.id) === String(id); });
  if (!item) return;

  var influencerEmail = '';
  if (item.user_profiles) {
    influencerEmail = Array.isArray(item.user_profiles)
      ? ((item.user_profiles[0] && item.user_profiles[0].email) || '')
      : (item.user_profiles.email || '');
  }

  adminSetField('rc-id', item.id);
  adminSetField('rc-code', item.code);
  adminSetField('rc-discount', item.discount_percent);
  adminSetField('rc-name', item.referrer_name || '');
  adminSetField('rc-email', item.referrer_email || '');
  adminSetField('rc-max-usage', item.max_usage || '');
  adminSetField('rc-expires', item.expires_at ? adminDayKey(new Date(item.expires_at)) : '');
  adminSetField('rc-active', item.is_active ? 'true' : 'false');
  adminSetField('rc-influencer-email', influencerEmail);
  adminSetField('rc-commission', item.commission_rate || '0');
  adminSetField('rc-commission-yearly', item.commission_rate_yearly || '0');

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
      showToast('Referans kodu silindi', 'success');
      renderReferralCodesTable();
    }
  }
};

function initReferralModal() {
  var modal = document.getElementById('referral-code-modal');
  if (!modal) return;
  // Bayrak window'da değil düğümde: SPA'da sayfaya tekrar girilince DOM yenilenir, dinleyiciler yeniden bağlanmalı
  if (modal.dataset.bound === '1') return;
  modal.dataset.bound = '1';

  var btnAdd = document.getElementById('add-referral-code-btn');
  var btnClose = document.getElementById('close-rc-modal');
  var btnCancel = document.getElementById('cancel-rc-btn');
  var btnSave = document.getElementById('save-rc-btn');

  function close() { modal.classList.remove('open'); }
  if (btnAdd) btnAdd.addEventListener('click', window.openReferralModal);
  if (btnClose) btnClose.addEventListener('click', close);
  if (btnCancel) btnCancel.addEventListener('click', close);

  if (!btnSave) return;
  btnSave.addEventListener('click', async function() {
    var code = document.getElementById('rc-code').value.trim().toUpperCase();
    var discount = parseInt(document.getElementById('rc-discount').value, 10);
    if (!code) {
      showToast('Lütfen referans kodunu girin.', 'error');
      return;
    }
    if (isNaN(discount) || discount < 0 || discount > 100) {
      showToast('İndirim yüzdesi 0 ile 100 arasında olmalıdır.', 'error');
      return;
    }

    var maxUsageVal = document.getElementById('rc-max-usage').value.trim();
    var expiresVal = document.getElementById('rc-expires').value.trim();
    var influencerEmail = document.getElementById('rc-influencer-email').value.trim().toLowerCase();
    var commissionRate = parseFloat(document.getElementById('rc-commission').value);
    var commissionRateYearly = parseFloat(document.getElementById('rc-commission-yearly').value);

    var influencerUserId = null;
    if (influencerEmail) {
      var client = getSbClient();
      try {
        var res = await client.from('user_profiles').select('id').eq('email', influencerEmail).maybeSingle();
        if (res.error) throw res.error;
        if (!res.data || !res.data.id) {
          showToast('Influencer e-postası bulunamadı, lütfen kontrol edin.', 'error');
          return;
        }
        influencerUserId = res.data.id;
      } catch (e) {
        console.error('Influencer araması başarısız:', e);
        showToast('Influencer e-postası doğrulanamadı: ' + (e.message || e), 'error');
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
      commission_rate_yearly: isNaN(commissionRateYearly) ? 0 : commissionRateYearly,
      // 0 / boş / geçersiz = limitsiz (tablo ∞ gösterir). Eskiden 0 kaydedilip sunucuda her kullanımı reddediyordu.
      max_usage: (parseInt(maxUsageVal, 10) > 0) ? parseInt(maxUsageVal, 10) : null,
      // Son geçerlilik GÜNÜN SONUNA kadar geçerlidir (eskiden 00:00 UTC: seçilen gün başlar başlamaz süresi doluyordu)
      expires_at: expiresVal ? new Date(expiresVal + 'T23:59:59').toISOString() : null,
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

// ============================================================
// FİYAT YÖNETİMİ: ÖDEME AYARLARI
// ============================================================
// Fiyatlar sistem yapılandırmasında sabittir (savePaymentSettings aynı değerleri yazar);
// kampanyalar Referans Kodları sekmesinden yönetilir.
var ADMIN_LOCKED_PRICES = { monthly: 12, yearly: 99 };

// YouTube adresini embed biçimine çevirir; YouTube dışı adresleri reddeder ('' döner).
// Ödeme sayfasında iframe olarak gösterildiği için rastgele adres kabul edilmez.
function normalizeYoutubeEmbed(url) {
  var u = String(url || '').trim();
  if (!u) return '';
  var m = u.match(/^https:\/\/(?:www\.)?(?:youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/)([\w-]{6,})(?:[?&#].*)?$/i) ||
    u.match(/^https:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:.*&)?v=([\w-]{6,})(?:[&#].*)?$/i) ||
    u.match(/^https:\/\/youtu\.be\/([\w-]{6,})(?:[?#].*)?$/i);
  return m ? 'https://www.youtube.com/embed/' + m[1] : '';
}
window.normalizeYoutubeEmbed = normalizeYoutubeEmbed;

function adminToggleCard(title, desc, inputId, checked, extraClass) {
  return '<div class="toggle-card' + (extraClass ? ' ' + extraClass : '') + '">' +
    '<div class="toggle-info"><strong>' + title + '</strong><p>' + desc + '</p></div>' +
    '<label class="ios-switch"><input type="checkbox" id="' + inputId + '"' + (checked ? ' checked' : '') + ' /><span class="slider"></span></label>' +
  '</div>';
}

function adminSectionTitle(iconInner, text) {
  return '<h4 class="section-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' + iconInner + '</svg>' + text + '</h4>';
}

async function renderPaymentSettingsUI() {
  var c = document.getElementById('prices-container');
  if (!c) return;

  var current = await loadPaymentSettings();
  if (!current) {
    current = { video_embed_url: '', video_embed_enabled: false, ltc_discount_enabled: true };
  }

  var monthlyVal = ADMIN_LOCKED_PRICES.monthly;
  var yearlyVal = ADMIN_LOCKED_PRICES.yearly;
  var videoUrlVal = current.video_embed_url || '';
  var videoEnabledVal = !!current.video_embed_enabled;
  var ltcDiscountVal = current.ltc_discount_enabled !== false;
  var check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

  c.innerHTML =
    '<div class="pricing-mgmt-container">' +
      '<div class="pricing-config-card">' +
        '<div class="pricing-config-header">' +
          '<div class="icon-bubble">' + adminSvg('dollar') + '</div>' +
          '<div><h3>Fiyatlandırma &amp; Paket Yönetimi</h3><p>Platform abonelik fiyatlarını, indirimleri ve ödeme seçeneklerini belirleyin</p></div>' +
        '</div>' +

        '<div class="pricing-form-section">' +
          adminSectionTitle('<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>', 'Abonelik Plan Ücretleri') +
          '<div class="field-row">' +
            '<div class="field"><label for="ps-monthly">Aylık Plan Ücreti (Sabit)</label>' +
              '<div class="input-with-icon"><span class="input-prefix">$</span><input type="number" id="ps-monthly" value="' + monthlyVal + '" disabled /><span class="input-suffix">/ ay</span></div></div>' +
            '<div class="field"><label for="ps-yearly">Yıllık Plan Ücreti (Sabit)</label>' +
              '<div class="input-with-icon"><span class="input-prefix">$</span><input type="number" id="ps-yearly" value="' + yearlyVal + '" disabled /><span class="input-suffix">/ yıl</span></div></div>' +
          '</div>' +
          '<div class="pricing-calc-info" id="pricing-calc-badge">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
            '<span id="pricing-calc-text"></span>' +
          '</div>' +
          '<small class="field-hint">Fiyatlar sistem yapılandırmasında sabitlenmiştir ($' + monthlyVal + '/ay &amp; $' + yearlyVal + '/yıl). Kampanyalar Referans Kodları sekmesinden yönetilir.</small>' +
        '</div>' +

        '<div class="pricing-form-section">' +
          adminSectionTitle('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', 'Promosyon &amp; Kripto Ödemeleri') +
          adminToggleCard('Litecoin (LTC) Referans İndirimi', 'Referans indirim kuponları LTC ile ödeme yapan kullanıcılara anında indirim sağlar.', 'ps-ltc-discount', ltcDiscountVal) +
        '</div>' +

        '<div class="pricing-form-section">' +
          adminSectionTitle('<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>', 'Ödeme Sayfası Tanıtım Videosu') +
          adminToggleCard('Video Gösterimi Aktif', 'Ödeme ekranında kullanıcılara adım adım rehber veya tanıtım videosu gösterilsin.', 'ps-video-enabled', videoEnabledVal, 'spaced') +
          '<div class="field" id="video-url-field-wrap"><label for="ps-video-url">YouTube Embed Video URL</label>' +
            '<input type="text" id="ps-video-url" value="' + escapeHtml(videoUrlVal) + '" placeholder="https://www.youtube.com/embed/..." />' +
            '<small class="field-hint">Format: <code>https://www.youtube.com/embed/VIDEO_ID</code> (watch ve youtu.be bağlantıları otomatik çevrilir)</small></div>' +
        '</div>' +

        '<div class="pricing-form-section">' +
          adminSectionTitle('<path d="M10 2v7.31"/><path d="M14 9.3V2"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/>', 'Geliştirici Test Modu') +
          '<p class="field-hint">Sandbox çalışmadığında gerçek ödeme akışını denemek için. Kodu bilen kullanıcı Ayarlar &gt; Gelişmiş sekmesinde girince Plan ekranında <strong>1 $ / 1 günlük</strong> bir test planı görür. Kod sunucuda yalnızca hash olarak saklanır, sonradan görüntülenemez. Test ödemeleri gelir istatistiklerine dahil edilmez.</p>' +
          '<div class="pricing-calc-info" id="dev-test-status"><span>Durum yükleniyor...</span></div>' +
          '<div class="field"><label for="dev-test-code">Geliştirici kodu (en az 8 karakter)</label>' +
            '<input type="password" id="dev-test-code" autocomplete="new-password" placeholder="Yeni kod belirleyin" maxlength="128" />' +
            '<small class="field-hint">Yeni kod kaydetmek, eski kodla alınmış tüm test erişimlerini iptal eder.</small></div>' +
          '<div class="dev-test-actions">' +
            '<button type="button" class="btn btn-primary" id="dev-test-save-btn">Kodu Kaydet ve Aç</button>' +
            '<button type="button" class="btn btn-ghost" id="dev-test-toggle-btn" disabled>Test Modunu Kapat</button>' +
          '</div>' +
        '</div>' +

        '<div class="pricing-form-actions">' +
          '<button type="button" class="btn btn-primary" id="save-ps-btn"><span>Ayarları Kaydet</span></button>' +
        '</div>' +
      '</div>' +

      '<div class="pricing-preview-panel">' +
        '<div class="preview-header">' +
          '<div class="preview-badge"><span class="live-dot"></span> Canlı Kullanıcı Önizlemesi</div>' +
          '<p>Kullanıcıların satın alma ekranında göreceği fiyatlandırma kartları</p>' +
        '</div>' +
        '<div class="preview-cards-container">' +
          '<div class="preview-plan-card" id="prev-monthly-card">' +
            '<div class="preview-plan-name">Aylık Plan</div>' +
            '<div class="preview-price-row"><span class="preview-price-val" id="prev-monthly-price">$' + monthlyVal + '</span><span class="preview-price-cycle">/ ay</span></div>' +
            '<div class="preview-price-sub">Her ay otomatik yenilenir</div>' +
            '<ul class="preview-features-list">' +
              '<li>' + check + ' Sınırsız İşlem Günlüğü</li>' +
              '<li>' + check + ' Detaylı Analitik &amp; İstatistik</li>' +
              '<li>' + check + ' Otomatik Metrik Hesaplama</li>' +
            '</ul>' +
          '</div>' +
          '<div class="preview-plan-card featured" id="prev-yearly-card">' +
            '<span class="preview-plan-badge" id="prev-yearly-savings-badge">%31 Tasarruf</span>' +
            '<div class="preview-plan-name">Yıllık Plan</div>' +
            '<div class="preview-price-row"><span class="preview-price-val" id="prev-yearly-price">$' + yearlyVal + '</span><span class="preview-price-cycle">/ yıl</span></div>' +
            '<div class="preview-price-sub" id="prev-yearly-equiv">Ayda ~$8.25</div>' +
            '<ul class="preview-features-list">' +
              '<li>' + check + ' 365 Gün Kesintisiz Erişim</li>' +
              '<li>' + check + ' Tüm Pro Özellikler</li>' +
              '<li>' + check + ' Öncelikli VIP Destek</li>' +
            '</ul>' +
          '</div>' +
        '</div>' +
        '<div class="preview-video-box" id="prev-video-box">' +
          '<div class="video-label"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>Video Canlı Önizlemesi</div>' +
          '<div id="prev-video-player-container"></div>' +
        '</div>' +
      '</div>' +
    '</div>';

  var videoPlaceholder = function(iconInner, text) {
    return '<div class="preview-video-placeholder"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">' + iconInner + '</svg><span>' + text + '</span></div>';
  };
  var PLAY_ICON = '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>';
  var OFF_ICON = '<line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56"/>';

  // Canlı önizleme + hesaplama
  function updateLivePricingPreview() {
    var m = parseFloat(document.getElementById('ps-monthly').value) || 0;
    var y = parseFloat(document.getElementById('ps-yearly').value) || 0;
    var vUrl = (document.getElementById('ps-video-url').value || '').trim();
    var vEnabled = document.getElementById('ps-video-enabled').checked;

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

    if (yEquivEl) yEquivEl.textContent = 'Ayda ~$' + (y / 12).toFixed(2) + ' ($' + regularYearly + ' yerine)';
    if (yBadgeEl) yBadgeEl.textContent = '%' + savingsPct + ' Tasarruf';

    if (calcTextEl) {
      calcTextEl.innerHTML = savingsPct > 0
        ? 'Kullanıcılar yıllık planda <strong>%' + savingsPct + ' indirim</strong> (yılda <strong>$' + savingsDollars + '</strong> tasarruf) elde ediyor.'
        : 'Aylık 12 ay toplamı: <strong>$' + regularYearly + '</strong>. Yıllık fiyat: <strong>$' + y + '</strong>.';
    }

    var vContainer = document.getElementById('prev-video-player-container');
    if (!vContainer) return;
    if (vEnabled && vUrl) {
      var embed = normalizeYoutubeEmbed(vUrl);
      vContainer.innerHTML = embed
        ? '<div class="preview-video-iframe-wrap"><iframe src="' + escapeHtml(embed) + '" title="Tanıtım videosu" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>'
        : videoPlaceholder(PLAY_ICON, 'Geçerli bir YouTube bağlantısı girin (youtube.com/embed/…).');
    } else if (vEnabled) {
      vContainer.innerHTML = videoPlaceholder(PLAY_ICON, 'Video aktif edildi fakat henüz URL girilmedi.');
    } else {
      vContainer.innerHTML = videoPlaceholder(OFF_ICON, 'Tanıtım videosu gösterimi şu anda pasif durumda.');
    }
  }

  document.getElementById('ps-video-url').addEventListener('input', updateLivePricingPreview);
  document.getElementById('ps-video-enabled').addEventListener('change', updateLivePricingPreview);
  updateLivePricingPreview();

  // ---- Geliştirici Test Modu (kod sunucuda hash olarak saklanır; admin_set_dev_test_code RPC) ----
  var devState = { configured: false, enabled: false };
  async function refreshDevTestStatus() {
    var statusEl = document.getElementById('dev-test-status');
    var toggleBtn = document.getElementById('dev-test-toggle-btn');
    var client = getSbClient();
    if (!statusEl || !client) return;
    try {
      var res = await client.rpc('admin_get_dev_test_status');
      var data = res.data;
      if (res.error || !data || data.success === false) throw new Error((res.error && res.error.message) || (data && data.error) || 'Durum alınamadı');
      devState.configured = !!data.configured;
      devState.enabled = !!data.enabled;
      var text;
      if (!data.configured) text = 'Henüz kod belirlenmemiş. Test modu kapalı.';
      else if (data.enabled) text = '<strong class="text-green">Test modu AÇIK.</strong> Şu an test erişimi olan kullanıcı sayısı: <strong>' + escapeHtml(data.active_users || 0) + '</strong>';
      else text = '<strong>Test modu KAPALI</strong> (kod kayıtlı, kimse test planını göremez).';
      statusEl.innerHTML = '<span>' + text + '</span>';
      if (toggleBtn) {
        toggleBtn.disabled = !data.configured;
        toggleBtn.textContent = data.enabled ? 'Test Modunu Kapat' : 'Test Modunu Aç';
      }
    } catch (e) {
      statusEl.innerHTML = '<span>Durum alınamadı: ' + escapeHtml(e.message || String(e)) + ' (migration 202610150004 uygulandı mı?)</span>';
    }
  }

  var devSaveBtn = document.getElementById('dev-test-save-btn');
  devSaveBtn.addEventListener('click', async function() {
    var input = document.getElementById('dev-test-code');
    var code = input ? input.value.trim() : '';
    if (code.length < 8) {
      showToast('Kod en az 8 karakter olmalıdır.', 'error');
      return;
    }
    devSaveBtn.disabled = true;
    try {
      var res = await getSbClient().rpc('admin_set_dev_test_code', { p_code: code, p_enabled: true });
      if (res.error || !res.data || res.data.success === false) throw new Error((res.error && res.error.message) || (res.data && res.data.error) || 'Kod kaydedilemedi');
      if (input) input.value = '';
      showToast('Geliştirici kodu kaydedildi, test modu açıldı.', 'success');
    } catch (e) {
      showToast('Kaydedilemedi: ' + (e.message || e), 'error');
    } finally {
      devSaveBtn.disabled = false;
      refreshDevTestStatus();
    }
  });

  var devToggleBtn = document.getElementById('dev-test-toggle-btn');
  devToggleBtn.addEventListener('click', async function() {
    devToggleBtn.disabled = true;
    try {
      var res = await getSbClient().rpc('admin_set_dev_test_code', { p_code: null, p_enabled: !devState.enabled });
      if (res.error || !res.data || res.data.success === false) throw new Error((res.error && res.error.message) || (res.data && res.data.error) || 'İşlem başarısız');
      showToast(res.data.enabled ? 'Test modu açıldı.' : 'Test modu kapatıldı.', 'success');
    } catch (e) {
      showToast('İşlem başarısız: ' + (e.message || e), 'error');
    } finally {
      refreshDevTestStatus();
    }
  });
  refreshDevTestStatus();

  var SAVE_LABEL = '<span>Ayarları Kaydet</span>';
  var saveBtn = document.getElementById('save-ps-btn');
  saveBtn.addEventListener('click', async function() {
    var vUrl = document.getElementById('ps-video-url').value.trim();
    var vEnabled = document.getElementById('ps-video-enabled').checked;
    var ltcDisc = document.getElementById('ps-ltc-discount').checked;

    // Ödeme sayfasında iframe olarak gösterilir: yalnızca YouTube embed adresi kaydedilir
    var embedUrl = normalizeYoutubeEmbed(vUrl);
    if (vUrl && !embedUrl) {
      showToast('Video adresi geçerli bir YouTube bağlantısı olmalıdır.', 'error');
      return;
    }
    if (vEnabled && !embedUrl) {
      showToast('Videoyu göstermek için bir YouTube bağlantısı girin.', 'error');
      return;
    }

    var m = ADMIN_LOCKED_PRICES.monthly;
    var y = ADMIN_LOCKED_PRICES.yearly;
    var regYear = m * 12;
    var payload = {
      monthly_price_usd: m,
      yearly_price_usd: y,
      yearly_discount_percent: regYear > 0 && y < regYear ? Math.round(((regYear - y) / regYear) * 100) : 0,
      video_embed_url: embedUrl,
      video_embed_enabled: vEnabled,
      ltc_discount_enabled: ltcDisc,
      days_per_monthly: 30,
      days_per_yearly: 365,
      referral_note: 'Referans kodu sadece Litecoin (LTC) ödemelerinde geçerlidir.'
    };

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner sm"></span><span>Kaydediliyor...</span>';
    var ok = await savePaymentSettings(payload);
    saveBtn.disabled = false;
    saveBtn.innerHTML = SAVE_LABEL;

    if (ok) {
      document.getElementById('ps-video-url').value = embedUrl;
      updateLivePricingPreview();
    }
  });
}

// ============================================================
// GENEL (OVERVIEW) PANELİ
// ============================================================
function destroyOverviewCharts() {
  if (!window.adminState) return;
  if (!window.adminState.charts) {
    window.adminState.charts = {};
    return;
  }
  var c = window.adminState.charts;
  ['overviewUserChart', 'overviewRevenueChart', 'overviewPlanDonut'].forEach(function(key) {
    if (c[key]) {
      try { c[key].destroy(); } catch (e) {}
      c[key] = null;
    }
  });
}

window.changeOverviewPeriod = function(period) {
  if (window.adminState) window.adminState.overviewPeriod = period;
  if (typeof renderOverviewContent === 'function') renderOverviewContent(period);
};

var ADMIN_TR_DAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
var ADMIN_TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

// Seçilen döneme göre grafik kovalarını (gün ya da ay) üretir
function adminPeriodBuckets(period, now) {
  var buckets = [];
  var i;
  if (period === 'year') {
    for (i = 11; i >= 0; i--) {
      var mStart = new Date(now.getFullYear(), now.getMonth() - i, 1, 0, 0, 0, 0);
      var mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      buckets.push({ start: mStart, end: mEnd, label: ADMIN_TR_MONTHS[mStart.getMonth()] + ' ' + mStart.getFullYear() });
    }
    return { buckets: buckets, labelText: 'Son 12 Ay', pillText: '1 Yıl' };
  }

  var days = period === 'month' ? 30 : 7;
  for (i = days - 1; i >= 0; i--) {
    var start = new Date(now);
    start.setDate(start.getDate() - i);
    start.setHours(0, 0, 0, 0);
    var end = new Date(start);
    end.setHours(23, 59, 59, 999);
    // Haftalık görünümde etiket iki satır (tarih + gün) olur; böylece eksen etiketleri eğilip kırpılmaz
    var label = days === 7
      ? [start.getDate() + ' ' + ADMIN_TR_MONTHS[start.getMonth()], ADMIN_TR_DAYS[start.getDay()]]
      : start.getDate() + ' ' + ADMIN_TR_MONTHS[start.getMonth()];
    buckets.push({ start: start, end: end, label: label });
  }
  return period === 'month'
    ? { buckets: buckets, labelText: 'Son 30 Gün', pillText: '1 Ay' }
    : { buckets: buckets, labelText: 'Son 7 Gün', pillText: '1 Hafta' };
}

function adminMoney0(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function renderOverviewContent(period) {
  period = period || adminState.overviewPeriod || 'week';
  adminState.overviewPeriod = period;

  var container = document.getElementById('overview-content');
  if (!container) return;

  // Kapsayıcıyı değiştirmeden önce eski grafikleri yok et (sızıntı/çakışma olmasın)
  destroyOverviewCharts();

  var theme = getAdminApexTheme();
  var usersList = adminState.users || [];
  var totalUsers = usersList.length;
  var now = new Date();

  var proCount = usersList.filter(function(u) {
    return u.plan === 'premium' && (!u.plan_expires_at || new Date(u.plan_expires_at) > now);
  }).length;
  var freeCount = Math.max(0, totalUsers - proCount);
  var proPct = totalUsers > 0 ? (proCount / totalUsers) * 100 : 0;
  var conversionRate = proPct.toFixed(1);

  var startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  var todayUsers = usersList.filter(function(u) {
    if (!u.created_at) return false;
    var d = new Date(u.created_at);
    return !isNaN(d.getTime()) && d >= startOfToday;
  }).length;

  // Gelir: yalnızca gerçek (tamamlanmış) ödemeler. Admin'in verdiği ya da ödemesi olmayan pro gelir sayılmaz.
  var sales = [];
  var totalRevenue = 0;
  adminCompletedPayments().forEach(function(p) {
    var sub = paymentToSubscription(p);
    if (sub.price <= 0) return;
    sales.push(sub);
    totalRevenue += sub.price;
  });

  var spec = adminPeriodBuckets(period, now);
  var bucketLabels = [];
  var userCounts = [];
  var revenueAmounts = [];
  var periodUsers = 0;
  var periodRevenue = 0;

  spec.buckets.forEach(function(b) {
    bucketLabels.push(b.label);

    var uCount = usersList.filter(function(u) {
      if (!u.created_at) return false;
      var ud = new Date(u.created_at);
      return !isNaN(ud.getTime()) && ud >= b.start && ud <= b.end;
    }).length;
    userCounts.push(uCount);
    periodUsers += uCount;

    var rSum = 0;
    sales.forEach(function(s) {
      if (s.startDate >= b.start && s.startDate <= b.end) rSum += s.price;
    });
    rSum = Math.round(rSum * 100) / 100;
    revenueAmounts.push(rSum);
    periodRevenue += rSum;
  });

  var sortedUsers = usersList.slice().sort(function(a, b) {
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  }).slice(0, 8);

  var recentUsersHtml = sortedUsers.length === 0
    ? '<div class="empty-state">Henüz kullanıcı bulunmuyor.</div>'
    : sortedUsers.map(function(u) {
        var name = u.username || (u.email ? u.email.split('@')[0] : 'Kullanıcı');
        var isPro = u.plan === 'premium';
        return '<div class="overview-user-row">' +
          '<div class="user-mini-avatar">' + avatarMarkup(u.avatar_url, name) + '</div>' +
          '<div class="user-mini-info"><div class="user-mini-name">' + escapeHtml(name) + '</div><div class="user-mini-email">' + escapeHtml(u.email || '—') + '</div></div>' +
          '<span class="user-mini-badge ' + (isPro ? 'badge-sub-pro' : 'badge-sub-free') + '">' + (isPro ? 'Pro' : 'Ücretsiz') + '</span>' +
          '<div class="user-mini-date">' + formatDate(u.created_at) + '</div>' +
        '</div>';
      }).join('');

  var online = navigator.onLine !== false;
  var periodBtn = function(key, text) {
    return '<button type="button" class="period-pill-btn' + (period === key ? ' active' : '') + '" aria-pressed="' + (period === key) + '" data-period="' + key + '">' + text + '</button>';
  };
  var kpi = function(opts) {
    return '<div class="kpi-card' + (opts.highlight ? ' highlight-card' : '') + '"><div class="kpi-card-inner">' +
      '<div class="kpi-icon-wrap ' + opts.iconClass + '">' + (opts.pulse ? '<div class="live-pulse"></div>' : '') + adminIconSvg(opts.icon) + '</div>' +
      '<div class="kpi-meta"><span class="kpi-label">' + opts.label + '</span>' +
        '<div class="kpi-value-row"><span class="kpi-val ' + (opts.valClass || '') + '">' + opts.value + '</span>' +
        '<span class="kpi-badge ' + opts.badgeClass + '">' + opts.badge + '</span></div></div>' +
    '</div></div>';
  };
  var chartHeader = function(icon, tone, title, sub, cornerClass, cornerVal) {
    return '<div class="s-card-header"><div class="header-icon ' + tone + '">' + adminIconSvg(icon, 16) + '</div>' +
      '<div><h2>' + title + '</h2><p>' + sub + '</p></div>' +
      '<div class="chart-corner-stat"><span class="corner-val ' + cornerClass + '">' + cornerVal + '</span><span class="corner-lbl">' + spec.pillText + '</span></div></div>';
  };

  container.innerHTML =
    '<div class="overview-container">' +
      '<div class="overview-header-bar">' +
        '<div>' +
          '<h2 class="overview-main-title">Platform Genel Bakış ' +
            '<span class="live-connection-badge ' + (online ? 'online' : 'offline') + '" id="overview-live-badge">' +
              '<span class="live-status-dot"></span>' +
              '<span class="live-status-text">' + (online ? 'Güncellenme : Şuan Canlı' : 'İnternet bağlantısı kesildi') + '</span>' +
            '</span>' +
          '</h2>' +
          '<p class="overview-main-sub">Sistem geneli kullanıcı, abonelik ve gelir metrikleri</p>' +
        '</div>' +
        '<div class="period-switcher-pill" role="group" aria-label="Dönem">' + periodBtn('week', '1 Hafta') + periodBtn('month', '1 Ay') + periodBtn('year', '1 Yıl') + '</div>' +
      '</div>' +

      '<div class="overview-kpi-grid">' +
        kpi({ iconClass: 'icon-users', icon: ADMIN_ICONS.users, label: 'Toplam Kullanıcılar', value: totalUsers, badge: 'Tüm Zamanlar', badgeClass: 'badge-green' }) +
        kpi({ iconClass: 'icon-today', icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', pulse: true, highlight: true, label: 'Bugün Gelen Kullanıcılar', value: '+' + todayUsers, valClass: 'green', badge: 'Bugün', badgeClass: 'badge-pulse' }) +
        kpi({ iconClass: 'icon-users', icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>', label: spec.labelText + ' Yeni Kayıt', value: '+' + periodUsers, badge: spec.pillText, badgeClass: 'badge-purple' }) +
        kpi({ iconClass: 'icon-revenue', icon: ADMIN_ICONS.dollar, label: 'Toplam Gelir', value: '$' + adminMoney0(totalRevenue), valClass: 'green', badge: 'Dönem: $' + adminMoney0(periodRevenue), badgeClass: 'badge-emerald' }) +
        kpi({ iconClass: 'icon-pro', icon: ADMIN_ICONS.star, label: 'Pro Üyeler', value: proCount, valClass: 'accent', badge: '%' + conversionRate + ' Dönüşüm', badgeClass: 'badge-purple' }) +
      '</div>' +

      '<div class="overview-charts-row">' +
        '<div class="s-card">' +
          chartHeader('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>', '', 'Kullanıcı Büyümesi', spec.labelText + ' kayıt olan yeni kullanıcı trendi', '', '+' + periodUsers) +
          '<div class="s-card-body"><div id="overviewUserGrowthChart"></div></div>' +
        '</div>' +
        '<div class="s-card">' +
          chartHeader(ADMIN_ICONS.chart, 'tone-green', 'Gelir İstatistiği ($)', spec.labelText + ' elde edilen Pro abonelik gelirleri', 'text-emerald', '$' + adminMoney0(periodRevenue)) +
          '<div class="s-card-body"><div id="overviewRevenueChart"></div></div>' +
        '</div>' +
      '</div>' +

      '<div class="overview-bottom-row">' +
        '<div class="s-card">' +
          '<div class="s-card-header"><div class="header-icon">' + adminIconSvg('<circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 10 10h-10z"/>', 16) + '</div>' +
            '<div><h2>Plan Dağılımı</h2><p>Kullanıcıların abonelik türü oranı</p></div></div>' +
          '<div class="s-card-body">' +
            '<div id="overviewPlanDonutChart"></div>' +
            '<div class="plan-summary-bars">' +
              '<div class="plan-summary-item"><span class="plan-dot dot-pro"></span><span class="plan-name">Pro Plan</span><span class="plan-count">' + proCount + ' üye</span><span class="plan-pct pro">%' + conversionRate + '</span></div>' +
              '<div class="plan-summary-item"><span class="plan-dot dot-free"></span><span class="plan-name">Ücretsiz Plan</span><span class="plan-count">' + freeCount + ' üye</span><span class="plan-pct free">%' + (totalUsers > 0 ? (100 - proPct).toFixed(1) : '0.0') + '</span></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="s-card">' +
          '<div class="s-card-header"><div class="header-icon tone-blue">' + adminIconSvg('<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>', 16) + '</div>' +
            '<div><h2>Son Kayıt Olan Kullanıcılar</h2><p>Platforma en son katılan ' + sortedUsers.length + ' üye</p></div>' +
            '<div class="header-actions"><button type="button" class="btn btn-ghost btn-sm" data-goto-panel="panel-users">Tümünü Gör →</button></div></div>' +
          '<div class="s-card-body flush"><div class="overview-user-list">' + recentUsersHtml + '</div></div>' +
        '</div>' +
      '</div>' +
    '</div>';

  // Dönem düğmeleri ve "Tümünü Gör" için tek dinleyici
  container.onclick = function(e) {
    var pbtn = e.target.closest('[data-period]');
    if (pbtn) { window.changeOverviewPeriod(pbtn.getAttribute('data-period')); return; }
    var go = e.target.closest('[data-goto-panel]');
    if (go) switchPanel(go.getAttribute('data-goto-panel'));
  };

  if (typeof ApexCharts === 'undefined') {
    wwLog.warn('ApexCharts henüz yüklenmedi');
    return;
  }

  // DOM boyutları çözülsün diye bir sonraki karede çiz
  setTimeout(function() {
    // Panel/dönem hızlıca değişirse eski çağrı yeni DOM'u çizmesin
    if (document.getElementById('overview-content') !== container) return;
    if (adminState.overviewPeriod !== period) return;

    var userChartEl = document.getElementById('overviewUserGrowthChart');
    if (userChartEl) {
      adminState.charts.overviewUserChart = new ApexCharts(userChartEl, adminApex(theme, {
        series: [{ name: 'Yeni Kullanıcı', data: userCounts }],
        chart: { type: 'area', height: 280, zoom: { enabled: false }, animations: { enabled: false } },
        colors: [theme.accent],
        fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.03, stops: [0, 95, 100] } },
        stroke: { curve: 'smooth', width: 2.5 },
        xaxis: adminCategoryAxis(bucketLabels, theme),
        yaxis: adminCountAxis(userCounts, theme),
        tooltip: { y: { formatter: function(val) { return val + ' kullanıcı'; } } }
      }));
      adminState.charts.overviewUserChart.render();
    }

    var revenueChartEl = document.getElementById('overviewRevenueChart');
    if (revenueChartEl) {
      adminState.charts.overviewRevenueChart = new ApexCharts(revenueChartEl, adminApex(theme, {
        series: [{ name: 'Gelir ($)', data: revenueAmounts }],
        chart: { type: 'bar', height: 280, animations: { enabled: false } },
        plotOptions: {
          bar: {
            borderRadius: adminBarRadius(),
            borderRadiusApplication: 'end',
            columnWidth: adminBarWidth(revenueChartEl, bucketLabels.length, period === 'month' ? '60%' : (period === 'year' ? '50%' : '38%'))
          }
        },
        colors: [theme.green],
        fill: { type: 'solid', opacity: 0.85 },
        xaxis: adminCategoryAxis(bucketLabels, theme),
        yaxis: adminMoneyAxis(revenueAmounts, theme),
        tooltip: { y: { formatter: function(val) { return '$' + Number(val).toFixed(2); } } }
      }));
      adminState.charts.overviewRevenueChart.render();
    }

    var donutChartEl = document.getElementById('overviewPlanDonutChart');
    if (donutChartEl) {
      var donutColors = adminChartColors(theme);
      var donutFont = adminChartFont();
      adminState.charts.overviewPlanDonut = new ApexCharts(donutChartEl, adminApex(theme, {
        series: [freeCount, proCount],
        labels: ['Ücretsiz', 'Pro'],
        chart: { type: 'donut', height: 220, animations: { enabled: false } },
        colors: [theme.muted, theme.accent],
        stroke: { width: 0 },
        legend: { show: false },
        plotOptions: {
          pie: {
            donut: {
              size: '72%',
              labels: {
                show: true,
                name: { show: true, fontSize: '12px', fontFamily: donutFont, color: donutColors.muted },
                value: { show: true, fontSize: '20px', fontFamily: donutFont, fontWeight: 700, color: donutColors.text },
                total: { show: true, label: 'Toplam', fontSize: '12px', fontFamily: donutFont, color: donutColors.muted, formatter: function() { return totalUsers; } }
              }
            }
          }
        },
        tooltip: { y: { formatter: function(val) { return val + ' kullanıcı (%' + ((val / (totalUsers || 1)) * 100).toFixed(1) + ')'; } } }
      }));
      adminState.charts.overviewPlanDonut.render();
    }
  }, 50);
}

window.renderOverviewContent = renderOverviewContent;
window.destroyOverviewCharts = destroyOverviewCharts;
window.loadAnalyticsData = loadAnalyticsData;
window.renderPaymentSettingsUI = renderPaymentSettingsUI;
window.initReferralModal = initReferralModal;
window.renderReferralCodesTable = renderReferralCodesTable;

// ============================================================
// ORTAK: durum rozeti, arama kutusu, panel yeniden çizimi
// ============================================================
var ADMIN_CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
var ADMIN_CLOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
var ADMIN_X_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';

// status: 'pending' | 'approved' | 'rejected'; labels: { pending, approved, rejected }
function adminStatusPill(status, labels) {
  if (status === 'approved') return '<span class="status-pill approved">' + ADMIN_CHECK_SVG + escapeHtml(labels.approved) + '</span>';
  if (status === 'rejected') return '<span class="status-pill rejected">' + ADMIN_X_SVG + escapeHtml(labels.rejected) + '</span>';
  return '<span class="status-pill pending">' + ADMIN_CLOCK_SVG + escapeHtml(labels.pending) + '</span>';
}

function adminFilterButtons(items, current, attr) {
  return '<div class="filter-group">' + items.map(function(it) {
    return '<button type="button" class="filter-btn' + (current === it.key ? ' active' : '') + '" aria-pressed="' + (current === it.key) + '" ' + attr + '="' + it.key + '">' +
      escapeHtml(it.label) + ' (' + it.count + ')</button>';
  }).join('') + '</div>';
}

function adminStatCard(label, valueHtml, valueClass) {
  return '<div class="stat-card"><div class="stat-label">' + label + '</div><div class="stat-value ' + (valueClass || '') + '">' + valueHtml + '</div></div>';
}

function adminSearchBox(id, value, placeholder, width) {
  return '<div class="search-wrap">' + adminSvg('search', '', 14) +
    '<input type="text" id="' + id + '" class="search-input" placeholder="' + escapeHtml(placeholder) + '" value="' + escapeHtml(value) + '" aria-label="' + escapeHtml(placeholder) + '" style="width:' + (width || 230) + 'px" /></div>';
}

// Arama kutusu yazarken panel yeniden çizilir; odak ve imleç korunur
function adminRerenderKeepingFocus(inputId, render) {
  var f = captureInputFocus(inputId);
  render();
  restoreInputFocus(inputId, f.had, f.caret);
}

function adminInstagramUrl(instagram) {
  var raw = String(instagram || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  var handle = raw.replace(/^@/, '').replace(/[^\w.]/g, '');
  return handle ? 'https://instagram.com/' + handle : '';
}

function adminInstagramHandle(instagram) {
  return String(instagram || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/+$/, '').trim();
}

// ============================================================
// PARTNER BAŞVURULARI
// ============================================================
var currentPartnerAppFilter = 'all';
var partnerAppSearchTerm = '';
var PARTNER_STATUS_LABELS = { pending: 'Beklemede', approved: 'Onaylandı', rejected: 'Reddedildi' };

function renderPartnerApplicationsTable() {
  var container = document.getElementById('partner-applications-container');
  if (!container) return;

  var apps = adminState.partnerApplications || [];
  var pendingCount = apps.filter(function(a) { return a.status === 'pending'; }).length;
  var approvedCount = apps.filter(function(a) { return a.status === 'approved'; }).length;
  var rejectedCount = apps.filter(function(a) { return a.status === 'rejected'; }).length;

  var term = partnerAppSearchTerm.toLowerCase();
  var filtered = apps.filter(function(a) {
    if (currentPartnerAppFilter !== 'all' && a.status !== currentPartnerAppFilter) return false;
    if (!term) return true;
    return [(a.user && a.user.email), a.instagram, a.note].some(function(v) {
      return String(v || '').toLowerCase().indexOf(term) !== -1;
    });
  });

  var rows = filtered.map(function(item) {
    var userEmail = (item.user && item.user.email) || '—';
    var handle = adminInstagramHandle(item.instagram);
    var igUrl = safeUrl(adminInstagramUrl(item.instagram));
    var id = escapeHtml(item.id);
    var note = String(item.note || '');
    var noteShort = note ? (note.length > 40 ? note.substring(0, 40) + '…' : note) : '—';

    var deleteBtn = '<button type="button" class="btn btn-danger btn-sm" data-pa-delete="' + id + '" data-user-id="' + escapeHtml(item.user_id || '') + '" data-user-email="' + escapeHtml((item.user && item.user.email) || '') + '" title="Başvuruyu ve kazanç kaydını sil">Sil</button>';

    var actions;
    if (item.status === 'pending') {
      actions = '<button type="button" class="btn btn-success btn-sm" data-pa-open="' + id + '" data-action="approve">' + ADMIN_CHECK_SVG.replace('<svg ', '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" ') + 'Onayla &amp; Kod Ata</button>' +
        '<button type="button" class="btn btn-danger btn-sm" data-pa-open="' + id + '" data-action="reject">Reddet</button>' + deleteBtn;
    } else if (item.status === 'approved') {
      actions = '<span class="inline-note text-green">' + ADMIN_CHECK_SVG + 'Kod Tanımlandı</span>' + deleteBtn;
    } else {
      actions = '<span class="inline-note text-red"' + (item.admin_note ? ' title="' + escapeHtml(item.admin_note) + '"' : '') + '>Reddedildi</span>' + deleteBtn;
    }

    return '<tr>' +
      '<td class="muted nowrap">' + formatDateFull(item.created_at) + '</td>' +
      '<td><strong>' + escapeHtml(userEmail) + '</strong></td>' +
      '<td>' + (igUrl ? '<a href="' + igUrl + '" target="_blank" rel="noopener noreferrer" class="info-link">@' + escapeHtml(handle) + ' ↗</a>' : '<span class="text-muted">—</span>') + '</td>' +
      '<td><strong>' + escapeHtml(item.follower_count || '—') + '</strong></td>' +
      '<td>' + (item.uses_crypto ? '<span class="inline-note text-green">' + ADMIN_CHECK_SVG + 'Evet</span>' : '<span class="text-muted">Hayır</span>') + '</td>' +
      '<td class="muted clip" title="' + escapeHtml(note) + '">' + escapeHtml(noteShort) + '</td>' +
      '<td>' + adminStatusPill(item.status, PARTNER_STATUS_LABELS) + '</td>' +
      '<td class="right"><div class="table-action-btns">' + actions + '</div></td>' +
    '</tr>';
  }).join('');

  container.innerHTML =
    '<div class="stats-grid stats-grid-lg">' +
      adminStatCard('Toplam Başvuru', apps.length) +
      adminStatCard('Bekleyen', pendingCount, 'amber') +
      adminStatCard('Onaylanan', approvedCount, 'green') +
      adminStatCard('Reddedilen', rejectedCount, 'red') +
    '</div>' +
    '<div class="toolbar">' +
      adminFilterButtons([
        { key: 'all', label: 'Tümü', count: apps.length },
        { key: 'pending', label: 'Bekleyen', count: pendingCount },
        { key: 'approved', label: 'Onaylanan', count: approvedCount },
        { key: 'rejected', label: 'Reddedilen', count: rejectedCount }
      ], currentPartnerAppFilter, 'data-pa-filter') +
      adminSearchBox('partner-app-search', partnerAppSearchTerm, 'Kullanıcı veya Instagram ara...') +
    '</div>' +
    '<div class="table-wrap"><div class="table-scroll"><table class="ww-table">' +
      '<thead><tr><th>Tarih</th><th>Kullanıcı</th><th>Instagram</th><th>Kitle Boyutu</th><th>Kripto</th><th>Tanıtım Notu</th><th>Durum</th><th class="right">İşlem</th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="8" class="empty-cell"><div class="empty-state">Eşleşen partner başvurusu bulunamadı.</div></td></tr>') + '</tbody>' +
    '</table></div></div>';

  container.onclick = function(e) {
    var f = e.target.closest('[data-pa-filter]');
    if (f) { setPartnerAppFilter(f.getAttribute('data-pa-filter')); return; }
    var open = e.target.closest('[data-pa-open]');
    if (open) { openPartnerAppModal(open.getAttribute('data-pa-open'), open.getAttribute('data-action')); return; }
    var del = e.target.closest('[data-pa-delete]');
    if (del) confirmDeletePartnerApp(del.getAttribute('data-pa-delete'), del.getAttribute('data-user-id'), del.getAttribute('data-user-email'));
  };
  var search = document.getElementById('partner-app-search');
  if (search) search.oninput = function() { handlePartnerAppSearch(search.value); };
}

function setPartnerAppFilter(filter) {
  currentPartnerAppFilter = filter;
  renderPartnerApplicationsTable();
}

function handlePartnerAppSearch(val) {
  partnerAppSearchTerm = val;
  clearTimeout(window._partnerAppSearchTimeout);
  window._partnerAppSearchTimeout = setTimeout(function() {
    adminRerenderKeepingFocus('partner-app-search', renderPartnerApplicationsTable);
  }, 250);
}

function findPartnerApp(appId) {
  return (adminState.partnerApplications || []).find(function(a) { return String(a.id) === String(appId); });
}

function openPartnerAppModal(appId, actionType) {
  var app = findPartnerApp(appId);
  if (!app) return;

  var modal = document.getElementById('partner-app-modal');
  if (!modal) return;

  document.getElementById('pa-modal-id').value = app.id;
  document.getElementById('pa-modal-type').value = actionType;
  document.getElementById('pa-modal-user').textContent = (app.user && app.user.email) || '—';

  var handle = adminInstagramHandle(app.instagram);
  var igUrl = adminInstagramUrl(app.instagram);
  var instaEl = document.getElementById('pa-modal-instagram');
  instaEl.textContent = handle ? '@' + handle : '—';
  if (/^https?:\/\//i.test(igUrl)) {
    instaEl.href = igUrl;
  } else {
    instaEl.removeAttribute('href');
  }

  document.getElementById('pa-modal-followers').textContent = app.follower_count || '—';
  var cryptoEl = document.getElementById('pa-modal-crypto');
  cryptoEl.textContent = app.uses_crypto ? 'Evet (BTC/LTC)' : 'Hayır';
  cryptoEl.classList.toggle('text-green', !!app.uses_crypto);
  cryptoEl.classList.toggle('text-muted', !app.uses_crypto);
  document.getElementById('pa-modal-user-note').textContent = app.note || 'Not girilmemiş';

  var approveFields = document.getElementById('pa-approve-fields');
  var confirmBtn = document.getElementById('confirm-partner-app-btn');
  var titleEl = document.getElementById('partner-app-modal-title');
  var noteLabel = document.getElementById('pa-note-label');
  var noteHelp = document.getElementById('pa-note-help');
  document.getElementById('pa-modal-admin-note').value = '';

  var approving = actionType === 'approve';
  approveFields.hidden = !approving;
  titleEl.textContent = approving ? 'Partner Başvurusunu Onayla & Kod Tanımla' : 'Partner Başvurusunu Reddet';
  confirmBtn.textContent = approving ? 'Onayla & Kodu Oluştur' : 'Başvuruyu Reddet';
  confirmBtn.className = approving ? 'btn btn-primary' : 'btn btn-danger btn-danger-solid';
  noteLabel.textContent = approving ? 'Admin Notu (Opsiyonel)' : 'Reddetme Gerekçesi (Kullanıcıya gösterilir) *';
  if (noteHelp) noteHelp.textContent = 'Bu açıklama kullanıcının panelinde gösterilir.';

  if (approving) {
    document.getElementById('pa-code-input').value = handle.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8) + '10';
    document.getElementById('pa-discount-input').value = '10';
    document.getElementById('pa-commission-input').value = '4';
    document.getElementById('pa-commission-yearly-input').value = '25';
  }

  modal.classList.add('open');
}

function closePartnerAppModal() {
  var modal = document.getElementById('partner-app-modal');
  if (modal) modal.classList.remove('open');
}

async function confirmPartnerAppAction() {
  var appId = document.getElementById('pa-modal-id').value;
  var actionType = document.getElementById('pa-modal-type').value;
  var adminNote = document.getElementById('pa-modal-admin-note').value.trim();

  var code = null;
  var discount = 10;
  var commission = 4;
  var commissionYearly = 25;

  if (actionType === 'approve') {
    code = document.getElementById('pa-code-input').value.trim().toUpperCase();
    // 0 geçerli bir değerdir (ör. komisyonsuz promosyon kodu); yalnızca boş/geçersizse varsayılan kullanılır
    discount = window.adminNumOr(document.getElementById('pa-discount-input').value, 10, 0, 100);
    commission = window.adminNumOr(document.getElementById('pa-commission-input').value, 4, 0);
    commissionYearly = window.adminNumOr(document.getElementById('pa-commission-yearly-input').value, 25, 0);

    if (!code) {
      showToast('Lütfen referans kodu girin.', 'error');
      return;
    }
  } else if (!adminNote) {
    showToast('Lütfen ret gerekçesi giriniz (kullanıcı bilgilendirmesi için zorunludur).', 'error');
    return;
  }

  var btn = document.getElementById('confirm-partner-app-btn');
  var label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'İşleniyor...';

  try {
    var ok = await reviewPartnerApplication(appId, actionType === 'approve' ? 'approved' : 'rejected', adminNote, code, discount, commission, commissionYearly);
    if (ok) closePartnerAppModal();
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

function confirmDeletePartnerApp(appId, userId, userEmail) {
  var userText = userEmail ? ('"' + userEmail + '" kullanıcısının ') : 'Bu ';
  var msg = userText + 'partner başvurusunu ve bağlı tüm kazanç/referans kodu kayıtlarını silmek istediğinize emin misiniz?\n\n' +
    'Dikkat:\n' +
    '1. Kullanıcının tanımlanmış referans kodu ve kazanç tablosu silinecektir.\n' +
    '2. Kullanıcı /my-earnings sayfasından tekrar sıfırdan başvuru yapabilecek konuma gelecektir.';

  if (!confirm(msg)) return;

  if (typeof window.deletePartnerApplication === 'function') {
    window.deletePartnerApplication(appId, userId || null);
  }
}

window.renderPartnerApplicationsTable = renderPartnerApplicationsTable;
window.setPartnerAppFilter = setPartnerAppFilter;
window.handlePartnerAppSearch = handlePartnerAppSearch;
window.openPartnerAppModal = openPartnerAppModal;
window.closePartnerAppModal = closePartnerAppModal;
window.confirmPartnerAppAction = confirmPartnerAppAction;
window.confirmDeletePartnerApp = confirmDeletePartnerApp;

// ============================================================
// ÇEKİM TALEPLERİ
// ============================================================
var currentPayoutFilter = 'all';
var payoutSearchTerm = '';
var PAYOUT_STATUS_LABELS = { pending: 'Beklemede', approved: 'Ödendi', rejected: 'Reddedildi' };

function payoutUser(item) {
  return item.user_profiles || (adminState.users || []).find(function(u) { return u.id === item.user_id; }) || {};
}

function renderPayoutsTable() {
  var container = document.getElementById('payouts-admin-container');
  if (!container) return;

  var payouts = adminState.payouts || [];
  var pendingList = payouts.filter(function(p) { return p.status === 'pending'; });
  var approvedList = payouts.filter(function(p) { return p.status === 'approved'; });
  var rejectedList = payouts.filter(function(p) { return p.status === 'rejected'; });
  var sum = function(list) { return list.reduce(function(acc, p) { return acc + (parseFloat(p.amount) || 0); }, 0); };

  var term = payoutSearchTerm.toLowerCase();
  var filtered = payouts.filter(function(item) {
    if (currentPayoutFilter !== 'all' && item.status !== currentPayoutFilter) return false;
    if (!term) return true;
    var user = payoutUser(item);
    return [user.email, item.payout_address, item.admin_note, item.currency].some(function(v) {
      return String(v || '').toLowerCase().indexOf(term) !== -1;
    });
  });

  var rows = filtered.map(function(item) {
    var user = payoutUser(item);
    var amountVal = parseFloat(item.amount) || 0;
    var curr = String(item.currency || 'LTC').toUpperCase();
    var id = escapeHtml(item.id);
    var addr = String(item.payout_address || '');
    var note = String(item.admin_note || '');
    var noteShort = note ? (note.length > 35 ? note.substring(0, 35) + '…' : note) : '—';

    var actions;
    if (item.status === 'pending') {
      actions = '<button type="button" class="btn btn-success btn-sm" data-payout-open="' + id + '" data-action="approve">' + ADMIN_CHECK_SVG.replace('<svg ', '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" ') + 'Öde &amp; Onayla</button>' +
        '<button type="button" class="btn btn-danger btn-sm" data-payout-open="' + id + '" data-action="reject">Reddet</button>';
    } else if (item.status === 'approved') {
      actions = '<span class="inline-note text-green">' + ADMIN_CHECK_SVG + 'Ödeme Yapıldı</span>';
    } else {
      actions = '<span class="inline-note text-red">Talep Reddedildi</span>';
    }

    return '<tr>' +
      '<td class="muted nowrap">' + formatDateFull(item.created_at) + '</td>' +
      '<td><strong>' + escapeHtml(user.email || user.username || '—') + '</strong></td>' +
      '<td><strong class="text-green">$' + amountVal.toFixed(2) + '</strong></td>' +
      '<td><span class="crypto-badge ' + (curr === 'BTC' ? 'crypto-btc' : 'crypto-ltc') + '">' + escapeHtml(curr) + '</span></td>' +
      '<td>' + (addr
        ? '<div class="address-chip" role="button" tabindex="0" data-copy-address="' + escapeHtml(addr) + '" title="Kopyalamak için tıklayın"><span class="addr-text">' + escapeHtml(addr) + '</span>' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></div>'
        : '—') + '</td>' +
      '<td>' + adminStatusPill(item.status, PAYOUT_STATUS_LABELS) + '</td>' +
      '<td class="muted clip" title="' + escapeHtml(note) + '">' + escapeHtml(noteShort) + '</td>' +
      '<td class="right"><div class="table-action-btns">' + actions + '</div></td>' +
    '</tr>';
  }).join('');

  container.innerHTML =
    '<div class="stats-grid stats-grid-lg">' +
      adminStatCard('Toplam Çekim Talebi', payouts.length) +
      adminStatCard('Bekleyen Ödemeler', '$' + sum(pendingList).toFixed(2) + ' <small>(' + pendingList.length + ')</small>', 'amber') +
      adminStatCard('Tamamlanan Ödemeler', '$' + sum(approvedList).toFixed(2) + ' <small>(' + approvedList.length + ')</small>', 'green') +
      adminStatCard('Reddedilen Talepler', rejectedList.length, 'red') +
    '</div>' +
    '<div class="toolbar">' +
      adminFilterButtons([
        { key: 'all', label: 'Tümü', count: payouts.length },
        { key: 'pending', label: 'Bekleyen', count: pendingList.length },
        { key: 'approved', label: 'Ödenen', count: approvedList.length },
        { key: 'rejected', label: 'Reddedilen', count: rejectedList.length }
      ], currentPayoutFilter, 'data-payout-filter') +
      adminSearchBox('payout-search-input', payoutSearchTerm, 'Kullanıcı veya cüzdan ara...') +
    '</div>' +
    '<div class="table-wrap"><div class="table-scroll"><table class="ww-table">' +
      '<thead><tr><th>Tarih</th><th>Kullanıcı</th><th>Tutar</th><th>Kripto</th><th>Çekim Adresi</th><th>Durum</th><th>TxID / Admin Notu</th><th class="right">İşlem</th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="8" class="empty-cell"><div class="empty-state">Herhangi bir para çekme talebi bulunamadı.</div></td></tr>') + '</tbody>' +
    '</table></div></div>';

  container.onclick = function(e) {
    var f = e.target.closest('[data-payout-filter]');
    if (f) { setPayoutFilter(f.getAttribute('data-payout-filter')); return; }
    var open = e.target.closest('[data-payout-open]');
    if (open) { openPayoutModal(open.getAttribute('data-payout-open'), open.getAttribute('data-action')); return; }
    var copy = e.target.closest('[data-copy-address]');
    if (copy) copyPayoutAddress(copy.getAttribute('data-copy-address'));
  };
  container.onkeydown = function(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var copy = e.target.closest('[data-copy-address]');
    if (copy) { e.preventDefault(); copyPayoutAddress(copy.getAttribute('data-copy-address')); }
  };
  var search = document.getElementById('payout-search-input');
  if (search) search.oninput = function() { handlePayoutSearch(search.value); };
}

function setPayoutFilter(filter) {
  currentPayoutFilter = filter;
  renderPayoutsTable();
}

function handlePayoutSearch(val) {
  payoutSearchTerm = val;
  clearTimeout(window._payoutSearchTimeout);
  window._payoutSearchTimeout = setTimeout(function() {
    adminRerenderKeepingFocus('payout-search-input', renderPayoutsTable);
  }, 250);
}

function openPayoutModal(payoutId, actionType) {
  var payout = (adminState.payouts || []).find(function(p) { return String(p.id) === String(payoutId); });
  if (!payout) return;

  var modal = document.getElementById('payout-action-modal');
  if (!modal) return;

  document.getElementById('payout-action-id').value = payout.id;
  document.getElementById('payout-action-type').value = actionType;

  var user = payoutUser(payout);
  document.getElementById('payout-modal-user').textContent = user.email || user.username || '—';
  document.getElementById('payout-modal-amount').textContent = '$' + (parseFloat(payout.amount) || 0).toFixed(2);
  document.getElementById('payout-modal-currency').textContent = String(payout.currency || 'LTC').toUpperCase();
  document.getElementById('payout-modal-address').textContent = payout.payout_address || '—';

  var noteInput = document.getElementById('payout-modal-note');
  noteInput.value = '';

  var approving = actionType === 'approve';
  document.getElementById('payout-modal-title').textContent = approving ? 'Çekim Talebini Onayla (Ödeme Yapıldı)' : 'Çekim Talebini Reddet';
  document.getElementById('payout-note-label').textContent = approving ? 'Admin Notu / İşlem Referansı (TxID)' : 'Reddetme Gerekçesi (Zorunlu) *';
  noteInput.placeholder = approving ? 'Örn: LTC TXID: 3a2c5f... veya Transfer tamamlandı' : 'Örn: Cüzdan adresi hatalı veya bakiye şartı sağlanamadı.';
  document.getElementById('payout-note-help').textContent = approving
    ? 'Girilen TxID veya not kullanıcının çekim geçmişinde gösterilir.'
    : 'Bu açıklama kullanıcıya gösterilecek ve çekim tutarı iade edilecektir.';

  var confirmBtn = document.getElementById('confirm-payout-btn');
  confirmBtn.textContent = approving ? 'Onayla & Ödendi Olarak İşaretle' : 'Talebi Reddet';
  confirmBtn.className = approving ? 'btn btn-primary' : 'btn btn-danger btn-danger-solid';

  modal.classList.add('open');
}

function closePayoutModal() {
  var modal = document.getElementById('payout-action-modal');
  if (modal) modal.classList.remove('open');
}

async function confirmPayoutAction() {
  var payoutId = document.getElementById('payout-action-id').value;
  var actionType = document.getElementById('payout-action-type').value;
  var note = document.getElementById('payout-modal-note').value.trim();

  if (actionType === 'reject' && !note) {
    showToast('Lütfen çekim talebinin reddedilme gerekçesini belirtin.', 'error');
    return;
  }

  var btn = document.getElementById('confirm-payout-btn');
  var label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'İşleniyor...';

  try {
    var ok = await processPayoutRequest(payoutId, actionType === 'approve' ? 'approved' : 'rejected', note);
    if (ok) closePayoutModal();
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

window.renderPayoutsTable = renderPayoutsTable;
window.setPayoutFilter = setPayoutFilter;
window.handlePayoutSearch = handlePayoutSearch;
window.copyPayoutAddress = copyPayoutAddress;
window.openPayoutModal = openPayoutModal;
window.closePayoutModal = closePayoutModal;
window.confirmPayoutAction = confirmPayoutAction;

// ============================================================
// HATA BİLDİRİMLERİ, DESTEK VE KULLANICI ENGELLEME
// ============================================================
var currentBugFilter = 'all';
var bugSearchTerm = '';
var currentBugSubTab = 'reports'; // 'reports' | 'bans'

var BUG_CATEGORY_LABELS = {
  ui: 'Arayüz / Tasarım',
  chart: 'Grafik & Hesaplama',
  trade: 'İşlem / Veri',
  perf: 'Performans / Yavaşlık',
  feature: 'Öneri / Fikir',
  other: 'Diğer'
};

var BUG_PRIORITY = {
  high: { cls: 'prio-high', text: 'Yüksek (Kritik)' },
  medium: { cls: 'prio-medium', text: 'Orta' },
  low: { cls: 'prio-low', text: 'Düşük' }
};

var SUPPORT_MODES = [
  { key: 'online', option: 'Aktif & Çevrim İçi', label: 'Teknik Destek: Aktif & Çevrim İçi' },
  { key: 'busy', option: 'Yoğunluk Nedeniyle Gecikmeli', label: 'Teknik Destek: Yoğunluk Nedeniyle Gecikmeli' },
  { key: 'offline', option: 'Mesai Dışı / Çevrim Dışı', label: 'Teknik Destek: Çevrim Dışı' },
  { key: 'maintenance', option: 'Bakım Modu', label: 'Teknik Destek: Sistem Bakımda' }
];

function setBugFilter(filter) {
  currentBugFilter = filter;
  renderBugReportsPanel();
}
window.setBugFilter = setBugFilter;

function setBugSubTab(tab) {
  currentBugSubTab = tab;
  renderBugReportsPanel();
}
window.setBugSubTab = setBugSubTab;

function handleBugSearch(val) {
  bugSearchTerm = val;
  adminRerenderKeepingFocus('bug-search-input', renderBugReportsPanel);
}
window.handleBugSearch = handleBugSearch;

function adminFindBugReport(reportId) {
  return (window.bugReportsMap && window.bugReportsMap[String(reportId)]) ||
    (adminState.bugReports || []).find(function(item) { return String(item.id) === String(reportId); });
}

function adminShortDateTime(value) {
  if (!value) return '—';
  var d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function bugReportCard(r, bans) {
  var isAnswered = r.status === 'answered' || r.status === 'closed';
  var isRejected = r.status === 'rejected';
  var userBanned = bans.some(function(b) {
    return (r.user_id && b.user_id === r.user_id) || (r.user_email && b.user_email === r.user_email);
  });
  var prio = BUG_PRIORITY[r.priority] || BUG_PRIORITY.low;
  var rid = escapeHtml(r.id || '');

  var statusPill;
  if (isRejected) statusPill = '<span class="status-pill rejected">' + ADMIN_X_SVG + 'Reddedildi</span>';
  else if (isAnswered) statusPill = '<span class="status-pill ' + (r.status === 'closed' ? 'closed' : 'answered') + '">' + ADMIN_CHECK_SVG + (r.status === 'closed' ? 'Çözüldü &amp; Kapatıldı' : 'Yanıtlandı') + '</span>';
  else statusPill = '<span class="status-pill ' + (r.status === 'in_progress' ? 'in-progress' : 'pending') + '">' + ADMIN_CLOCK_SVG + (r.status === 'in_progress' ? 'İnceleniyor' : 'Beklemede') + '</span>';

  var actions =
    '<button type="button" class="btn btn-primary btn-sm" data-action="reply-bug" data-report-id="' + rid + '">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>' +
      (isAnswered ? 'Cevabı Düzenle' : 'Cevapla') + '</button>' +
    (isRejected ? '' : '<button type="button" class="btn btn-danger btn-sm" data-action="reject-bug" data-report-id="' + rid + '">Reddet</button>') +
    (!userBanned && (r.user_id || r.user_email)
      ? '<button type="button" class="btn btn-ghost btn-sm" data-action="ban-bug-user" data-report-id="' + rid + '">Engelle</button>'
      : '');

  var imgUrl = safeUrl(r.screenshot_url, true);
  var sys = (r.system_info && typeof r.system_info === 'object') ? r.system_info : {};
  var attach = '';
  if (imgUrl) {
    attach += '<a href="' + imgUrl + '" target="_blank" rel="noopener noreferrer" class="attach-link">' +
      '<img src="' + imgUrl + '" alt="Ekran görüntüsü" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'">' +
      'Ekran Görüntüsü <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>';
  }
  [['browser', 'Browser'], ['os', 'OS'], ['resolution', 'Res']].forEach(function(pair) {
    if (sys[pair[0]]) attach += '<span class="sys-chip">' + pair[1] + ': ' + escapeHtml(sys[pair[0]]) + '</span>';
  });

  var reply = '';
  if (r.admin_reply) {
    var label = isRejected ? 'Reddetme Gerekçesi (Admin)' : (r.replied_by || 'Wawe Journal Ekibi (Admin)');
    reply = '<div class="report-reply' + (isRejected ? ' is-rejected' : '') + '">' +
      '<div class="report-reply-head"><span class="who"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>' + escapeHtml(label) + '</span>' +
      '<span class="when">' + adminShortDateTime(r.replied_at) + '</span></div>' +
      '<p>' + escapeHtml(r.admin_reply) + '</p></div>';
  }

  return '<div class="s-card report-card' + (isRejected ? ' is-rejected' : (isAnswered ? ' is-answered' : '')) + '">' +
    '<div class="report-head"><div>' +
      '<div class="report-tags">' +
        '<span class="chip upper">' + escapeHtml(BUG_CATEGORY_LABELS[r.category] || r.category || 'Bildirim') + '</span>' +
        '<span class="chip ' + prio.cls + '"><span class="chip-dot"></span>' + prio.text + '</span>' +
        statusPill +
        (userBanned ? '<span class="chip is-danger">Bu kullanıcı engelli</span>' : '') +
      '</div>' +
      '<h3 class="report-title">' + escapeHtml(r.subject || 'Konusuz') + '</h3>' +
      '<div class="report-meta">Gönderen: <strong>' + escapeHtml(r.user_name || 'Kullanıcı') + '</strong> (' + escapeHtml(r.user_email || '—') + ')' +
        '<span class="sep">•</span>' + adminShortDateTime(r.created_at) + '</div>' +
    '</div><div class="report-actions">' + actions + '</div></div>' +
    '<div class="report-desc">' + escapeHtml(r.description || '') + '</div>' +
    (attach ? '<div class="report-attach">' + attach + '</div>' : '') +
    reply +
  '</div>';
}

function supportCardMarkup(statusData) {
  var mode = SUPPORT_MODES.filter(function(m) { return m.key === statusData.status; })[0] || SUPPORT_MODES[0];
  var indicator = mode.key;

  return '<div class="s-card support-card">' +
    '<div class="s-card-header"><div class="header-icon">' + adminIconSvg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', 18) + '</div>' +
      '<div><h2>Teknik Destek Canlı Durum Ayarı</h2><p>Kullanıcıların /report-bug sayfasında gördüğü destek rozetini ve durum mesajını canlı ayarlayın.</p></div>' +
      '<div class="header-actions"><span class="status-indicator ' + indicator + '">' + escapeHtml(statusData.label || mode.label) + '</span></div></div>' +
    '<div class="s-card-body"><div class="support-form-grid">' +
      '<div class="field"><label for="admin-support-status-select">Destek Modu</label>' +
        '<select id="admin-support-status-select" class="ww-select">' + SUPPORT_MODES.map(function(m) {
          return '<option value="' + m.key + '"' + (statusData.status === m.key ? ' selected' : '') + '>' + m.option + '</option>';
        }).join('') + '</select></div>' +
      '<div class="field"><label for="admin-support-status-label">Görüntülenen Durum Metni</label>' +
        '<input type="text" id="admin-support-status-label" class="ww-input" value="' + escapeHtml(statusData.label || mode.label) + '" /></div>' +
      '<div class="field"><label for="admin-support-status-note">Ortalama Yanıt Süresi Notu</label>' +
        '<input type="text" id="admin-support-status-note" class="ww-input" placeholder="Örn: Ortalama yanıt süresi 15 dakika." value="' + escapeHtml(statusData.note || '') + '" /></div>' +
      '<div><button type="button" class="btn btn-primary" data-action="save-support-status">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>Durumu Güncelle</button></div>' +
    '</div></div></div>';
}

function bansSectionMarkup(bans) {
  var form = '<div class="s-card"><div class="s-card-header"><div class="header-icon tone-red">' +
      adminIconSvg('<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>', 18) + '</div>' +
    '<div><h2>Hızlı Manuel Kullanıcı Engelleme</h2><p>Bir kullanıcıyı e-posta adresiyle doğrudan engelleyebilir ve nedenini belirtebilirsiniz.</p></div></div>' +
    '<div class="s-card-body"><div class="ban-form-grid">' +
      '<div class="field"><label for="manual-ban-email">Kullanıcı E-Postası *</label><input type="email" id="manual-ban-email" class="ww-input" placeholder="user@example.com" /></div>' +
      '<div class="field"><label for="manual-ban-reason">Engelleme Gerekçesi *</label><input type="text" id="manual-ban-reason" class="ww-input" placeholder="Örn: Sürekli anlamsız spam ve uygunsuz bildirimler" /></div>' +
      '<button type="button" class="btn btn-danger btn-danger-solid" data-action="manual-ban">Engelle</button>' +
    '</div></div></div>';

  if (bans.length === 0) {
    return form + '<div class="s-card"><div class="empty-state">Şu anda engellenmiş hiçbir kullanıcı yok.</div></div>';
  }

  var rows = bans.map(function(b) {
    return '<tr>' +
      '<td><strong>' + escapeHtml(b.user_name || 'Kullanıcı') + '</strong><div class="muted mono">' + escapeHtml(b.user_email || '—') + '</div></td>' +
      '<td class="ban-reason">' + escapeHtml(b.reason || '—') + '</td>' +
      '<td class="muted nowrap">' + adminShortDateTime(b.created_at) + '</td>' +
      '<td class="right"><button type="button" class="btn btn-success btn-sm" data-action="unban" data-ban-id="' + escapeHtml(b.id) + '" data-ban-email="' + escapeHtml(b.user_email || '') + '">Engeli Kaldır</button></td>' +
    '</tr>';
  }).join('');

  return form + '<div class="s-card"><div class="s-card-body flush"><div class="table-scroll"><table class="ww-table">' +
    '<thead><tr><th>Kullanıcı / E-posta</th><th>Engelleme Gerekçesi (Kullanıcıya Gösterilen)</th><th>Tarih</th><th class="right">İşlem</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div></div></div>';
}

async function renderBugReportsPanel() {
  var container = document.getElementById('bug-reports-admin-container');
  if (!container) return;

  var reports = adminState.bugReports || [];
  var bans = adminState.supportBans || [];
  var statusData = adminState.supportStatus || {
    status: 'online',
    label: 'Teknik Destek: Aktif & Çevrim İçi',
    note: 'Ortalama yanıt süresi 15 dakika.'
  };

  var isPending = function(r) { return r.status === 'pending' || r.status === 'in_progress'; };
  var isDone = function(r) { return r.status === 'answered' || r.status === 'closed'; };
  var pendingReports = reports.filter(isPending);
  var answeredReports = reports.filter(isDone);
  var rejectedReports = reports.filter(function(r) { return r.status === 'rejected'; });

  window.bugReportsMap = {};
  reports.forEach(function(r) { if (r && r.id) window.bugReportsMap[String(r.id)] = r; });

  var term = bugSearchTerm.toLowerCase();
  var filteredReports = reports.filter(function(r) {
    if (currentBugFilter === 'pending' && !isPending(r)) return false;
    if (currentBugFilter === 'answered' && !isDone(r)) return false;
    if (currentBugFilter === 'rejected' && r.status !== 'rejected') return false;
    if (!term) return true;
    return [r.subject, r.description, r.user_email, r.user_name].some(function(v) {
      return String(v || '').toLowerCase().indexOf(term) !== -1;
    });
  });

  var html = supportCardMarkup(statusData);

  html += '<div class="stats-grid stats-grid-lg">' +
    adminStatCard('Toplam Bildirim', reports.length) +
    adminStatCard('İncelenen / Bekleyen', pendingReports.length, 'amber') +
    adminStatCard('Yanıtlanan Bildirimler', answeredReports.length, 'green') +
    adminStatCard('Reddedilen Bildirimler', rejectedReports.length, 'red') +
    adminStatCard('Engellenen Kullanıcılar', bans.length, 'red') +
  '</div>';

  html += '<div class="toolbar">' +
    '<div class="subtabs">' +
      '<button type="button" class="filter-btn' + (currentBugSubTab === 'reports' ? ' active' : '') + '" aria-pressed="' + (currentBugSubTab === 'reports') + '" data-bug-subtab="reports">Bildirim Akışı &amp; Yanıtlama (' + reports.length + ')</button>' +
      '<button type="button" class="filter-btn' + (currentBugSubTab === 'bans' ? ' active' : '') + '" aria-pressed="' + (currentBugSubTab === 'bans') + '" data-bug-subtab="bans">Engellenen Kullanıcılar (' + bans.length + ')</button>' +
    '</div>' +
    (currentBugSubTab === 'reports'
      ? '<div class="toolbar-group">' + adminFilterButtons([
          { key: 'all', label: 'Tümü', count: reports.length },
          { key: 'pending', label: 'Bekleyenler', count: pendingReports.length },
          { key: 'answered', label: 'Yanıtlananlar', count: answeredReports.length },
          { key: 'rejected', label: 'Reddedilenler', count: rejectedReports.length }
        ], currentBugFilter, 'data-bug-filter') + adminSearchBox('bug-search-input', bugSearchTerm, 'Konu, kullanıcı veya içerik...', 220) + '</div>'
      : '') +
  '</div>';

  if (currentBugSubTab === 'reports') {
    html += filteredReports.length === 0
      ? '<div class="s-card"><div class="empty-state"><strong>Kayıtlı bildirim bulunamadı.</strong></div></div>'
      : '<div class="report-list">' + filteredReports.map(function(r) { return bugReportCard(r, bans); }).join('') + '</div>';
  } else {
    html += bansSectionMarkup(bans);
  }

  container.innerHTML = html;
  bindBugReportsPanel(container);
}
window.renderBugReportsPanel = renderBugReportsPanel;

// Panel içindeki tüm düğmeler tek yerden yönetilir (eskiden satır içi onclick + düğme başına dinleyici + belge
// dinleyicisi aynı tıklamayı üç kez işliyordu).
function bindBugReportsPanel(container) {
  container.onclick = function(e) {
    var sub = e.target.closest('[data-bug-subtab]');
    if (sub) { setBugSubTab(sub.getAttribute('data-bug-subtab')); return; }
    var filter = e.target.closest('[data-bug-filter]');
    if (filter) { setBugFilter(filter.getAttribute('data-bug-filter')); return; }
    var btn = e.target.closest('[data-action]');
    if (btn && container.contains(btn)) handleBugActionClick(e, btn);
  };
  container.onchange = function(e) {
    if (e.target && e.target.id === 'admin-support-status-select') onSupportModeChange(e.target.value);
  };
  var search = document.getElementById('bug-search-input');
  if (search) search.oninput = function() { handleBugSearch(search.value); };
}

function handleBugActionClick(e, btn) {
  if (!btn) return;
  var action = btn.getAttribute('data-action');
  var reportId = btn.getAttribute('data-report-id');

  if (action === 'reply-bug') openBugReplyModal(reportId);
  else if (action === 'reject-bug') openBugRejectModal(reportId);
  else if (action === 'ban-bug-user') openSupportBanModalByReport(reportId);
  else if (action === 'save-support-status') saveSupportStatusFromUI();
  else if (action === 'manual-ban') submitManualBan();
  else if (action === 'unban') {
    unbanUserFromSupport(btn.getAttribute('data-ban-id'), btn.getAttribute('data-ban-email')).then(function() { renderBugReportsPanel(); });
  }
}
window.handleBugActionClick = handleBugActionClick;

// ------------------------------------------------------------
// Destek durumu
// ------------------------------------------------------------
function onSupportModeChange(val) {
  var labelInput = document.getElementById('admin-support-status-label');
  var mode = SUPPORT_MODES.filter(function(m) { return m.key === val; })[0];
  if (labelInput && mode) labelInput.value = mode.label;
}
window.onSupportModeChange = onSupportModeChange;

async function saveSupportStatusFromUI() {
  var select = document.getElementById('admin-support-status-select');
  var labelInput = document.getElementById('admin-support-status-label');
  var noteInput = document.getElementById('admin-support-status-note');

  var ok = await saveSupportStatus({
    status: select ? select.value : 'online',
    label: labelInput ? labelInput.value.trim() : '',
    note: noteInput ? noteInput.value.trim() : ''
  });
  if (ok) renderBugReportsPanel();
}
window.saveSupportStatusFromUI = saveSupportStatusFromUI;

// ------------------------------------------------------------
// Paneller (modal): yalnızca sınıf ile açılıp kapanır (styles.css PANEL bloğu)
// ------------------------------------------------------------
function adminOpenModal(id, focusId) {
  var modal = document.getElementById(id);
  if (!modal) {
    console.error('#' + id + ' bulunamadı.');
    return null;
  }
  if (modal.parentElement !== document.body) document.body.appendChild(modal);
  modal.classList.add('open');
  if (focusId) {
    setTimeout(function() {
      var el = document.getElementById(focusId);
      if (el) el.focus();
    }, 100);
  }
  return modal;
}

function adminCloseModal(id) {
  var modal = document.getElementById(id);
  if (modal) modal.classList.remove('open', 'active');
}

// 1. Engelleme paneli
function openSupportBanModal(userId, email, name) {
  if (!adminOpenModal('support-ban-modal', 'ban-modal-reason')) return;

  adminSetField('ban-modal-user-id', userId || '');
  adminSetField('ban-modal-user-email', email || '');
  adminSetField('ban-modal-user-name', name || email || '');
  var dispName = document.getElementById('ban-modal-display-name');
  var dispEmail = document.getElementById('ban-modal-display-email');
  if (dispName) dispName.textContent = name || email || 'Kullanıcı';
  if (dispEmail) dispEmail.textContent = email || '—';
  adminSetField('ban-modal-reason', 'Uygunsuz üslup ve asılsız bildirim gönderimi sebebiyle destek erişiminiz askıya alınmıştır.');
}
window.openSupportBanModal = openSupportBanModal;

function closeBanModal() { adminCloseModal('support-ban-modal'); }
window.closeBanModal = closeBanModal;

async function confirmSupportBan() {
  var reasonEl = document.getElementById('ban-modal-reason');
  var reason = reasonEl ? reasonEl.value.trim() : '';
  if (!reason) {
    showToast('Lütfen engelleme nedenini belirtin.', 'error');
    return;
  }

  var btn = document.getElementById('confirm-ban-btn');
  var label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Engelleniyor...'; }

  try {
    var ok = await banUserFromSupport(
      document.getElementById('ban-modal-user-id').value,
      document.getElementById('ban-modal-user-email').value,
      document.getElementById('ban-modal-user-name').value,
      reason
    );
    if (ok) {
      closeBanModal();
      renderBugReportsPanel();
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}
window.confirmSupportBan = confirmSupportBan;

async function submitManualBan() {
  var emailInput = document.getElementById('manual-ban-email');
  var reasonInput = document.getElementById('manual-ban-reason');
  var email = emailInput ? emailInput.value.trim() : '';
  var reason = reasonInput ? reasonInput.value.trim() : '';

  if (!email || !reason) {
    showToast('Lütfen e-posta ve gerekçe alanlarını doldurunuz.', 'error');
    return;
  }

  var ok = await banUserFromSupport(null, email, email, reason);
  if (ok) {
    if (emailInput) emailInput.value = '';
    if (reasonInput) reasonInput.value = '';
    renderBugReportsPanel();
  }
}
window.submitManualBan = submitManualBan;

function openSupportBanModalByReport(reportId, fallbackUserId, fallbackEmail, fallbackName) {
  var r = adminFindBugReport(reportId);
  var email = (r && r.user_email) || fallbackEmail || '';
  openSupportBanModal((r && r.user_id) || fallbackUserId || null, email, (r && r.user_name) || fallbackName || email || 'Kullanıcı');
}
window.openSupportBanModalByReport = openSupportBanModalByReport;

// 2. Yanıt paneli
function openBugReplyModal(reportId, subject, sender, currentReply, currentStatus) {
  if (!adminOpenModal('bug-reply-modal', 'reply-modal-text')) return;

  var r = adminFindBugReport(reportId);
  var finalSender = r ? ((r.user_name || 'Kullanıcı') + ' (' + (r.user_email || '—') + ')') : (sender || '—');

  adminSetField('reply-modal-report-id', reportId || (r ? r.id : ''));
  var subjEl = document.getElementById('reply-modal-subject');
  var senderEl = document.getElementById('reply-modal-sender');
  if (subjEl) subjEl.textContent = (r && r.subject) || subject || '—';
  if (senderEl) senderEl.textContent = finalSender;
  adminSetField('reply-modal-text', (r && r.admin_reply) || currentReply || '');
  adminSetField('reply-modal-status', (r && (r.status === 'pending' ? 'answered' : r.status)) || currentStatus || 'answered');
}
window.openBugReplyModal = openBugReplyModal;

function closeBugReplyModal() { adminCloseModal('bug-reply-modal'); }
window.closeBugReplyModal = closeBugReplyModal;

async function confirmBugReply() {
  var reportId = document.getElementById('reply-modal-report-id').value;
  var replyText = document.getElementById('reply-modal-text').value.trim();
  var status = document.getElementById('reply-modal-status').value || 'answered';

  if (!replyText) {
    showToast('Lütfen bir yanıt metni girin.', 'error');
    return;
  }

  var btn = document.getElementById('confirm-reply-btn');
  var label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Gönderiliyor...'; }

  try {
    var ok = await replyBugReport(reportId, replyText, status);
    if (ok) {
      closeBugReplyModal();
      renderBugReportsPanel();
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}
window.confirmBugReply = confirmBugReply;

// 3. Ret paneli + hazır gerekçeler
var BUG_REJECT_PRESETS = {
  invalid: 'İnceleme sonucunda bildirilen durum sistem genelinde veya belirtilen akışta doğrulanamamıştır. Eğer sorun devam ediyorsa lütfen tekrarlama adımlarını daha detaylı belirterek yeni bir bildirim iletiniz.',
  user_error: 'İncelenen durum sistemsel bir yazılım hatası değil, tarayıcı/cihaz ayarları veya hesap yapılandırması kaynaklıdır.',
  duplicate: 'Bu konu hakkında daha önce açılmış aktif bir bildirim veya devam eden bir geliştirme bulunmaktadır. Tekrar bildirim oluşturmanıza gerek yoktur.',
  missing_info: 'Bildirilen sorunu tespit edebilmek için yeterli detay veya tekrarlama adımı bulunmamaktadır. Ekran görüntüsü ve detaylı adımlarla tekrar iletebilirsiniz.',
  spam: 'Bildirim içeriği anlamsız, spam veya destek kurallarına aykırı olarak değerlendirilmiştir.',
  custom: ''
};
window.BUG_REJECT_PRESETS = BUG_REJECT_PRESETS;

function openBugRejectModal(reportId, fallbackSubject, fallbackSender) {
  if (!adminOpenModal('bug-reject-modal', 'reject-modal-reason')) return;

  var r = adminFindBugReport(reportId);
  var subjEl = document.getElementById('reject-modal-subject');
  var senderEl = document.getElementById('reject-modal-sender');
  if (subjEl) subjEl.textContent = (r && r.subject) || fallbackSubject || '—';
  if (senderEl) senderEl.textContent = r ? ((r.user_name || 'Kullanıcı') + ' (' + (r.user_email || '—') + ')') : (fallbackSender || '—');

  adminSetField('reject-modal-report-id', reportId || (r ? r.id : ''));
  adminSetField('reject-preset-select', 'invalid');
  adminSetField('reject-modal-reason', BUG_REJECT_PRESETS.invalid);
}
window.openBugRejectModal = openBugRejectModal;

function closeBugRejectModal() { adminCloseModal('bug-reject-modal'); }
window.closeBugRejectModal = closeBugRejectModal;

function onBugRejectPresetChange(presetKey) {
  var reasonEl = document.getElementById('reject-modal-reason');
  if (!reasonEl) return;
  if (presetKey === 'custom') {
    reasonEl.value = '';
    reasonEl.focus();
  } else if (BUG_REJECT_PRESETS[presetKey] !== undefined) {
    reasonEl.value = BUG_REJECT_PRESETS[presetKey];
  }
}
window.onBugRejectPresetChange = onBugRejectPresetChange;

async function confirmBugReject() {
  var reportId = document.getElementById('reject-modal-report-id').value;
  var reason = document.getElementById('reject-modal-reason').value.trim();

  if (!reason) {
    showToast('Lütfen bir ret gerekçesi belirtin.', 'error');
    return;
  }

  var btn = document.getElementById('confirm-reject-btn');
  var label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Reddediliyor...'; }

  try {
    var ok = await replyBugReport(reportId, reason, 'rejected');
    if (ok) {
      closeBugRejectModal();
      renderBugReportsPanel();
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}
window.confirmBugReject = confirmBugReject;
