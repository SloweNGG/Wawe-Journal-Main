// ============================================================
// ADMIN-DASHBOARD.JS - ANALYTICS & PRICES
// ============================================================

console.log('🔥 admin-dashboard.js yukleniyor...');

// ============================================================
// LOAD ANALYTICS DATA
// ============================================================
async function loadAnalyticsData() {
  console.log('📊 loadAnalyticsData basladi...');
  
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
    var chartDefaults = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(17,17,24,0.95)',
          borderColor: 'rgba(139,92,246,0.3)',
          borderWidth: 1,
          padding: 10,
          titleFont: { family: 'DM Mono', size: 11 },
          bodyFont: { family: 'DM Sans', size: 13 }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b6b80', font: { family: 'DM Mono', size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b6b80', font: { family: 'DM Mono', size: 11 } }, beginAtZero: true }
      }
    };

    if (adminState.charts.userChart) {
      try { adminState.charts.userChart.destroy(); } catch(e) {}
      adminState.charts.userChart = null;
    }
    if (adminState.charts.premiumChart) {
      try { adminState.charts.premiumChart.destroy(); } catch(e) {}
      adminState.charts.premiumChart = null;
    }

    var usersCtx = document.getElementById('usersChart');
    if (usersCtx) {
      adminState.charts.userChart = new Chart(usersCtx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Kullanici',
            data: uCounts,
            backgroundColor: 'rgba(34,197,94,0.2)',
            borderColor: '#34d399',
            borderWidth: 2,
            borderRadius: 6
          }]
        },
        options: chartDefaults
      });
    }

    var premiumCtx = document.getElementById('premiumChart');
    if (premiumCtx) {
      adminState.charts.premiumChart = new Chart(premiumCtx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Premium Gelir ($)',
            data: revenueData,
            backgroundColor: 'rgba(139,92,246,0.25)',
            borderColor: '#7c6dfa',
            borderWidth: 2,
            borderRadius: 6
          }]
        },
        options: {
          plugins: {
            legend: { display: true, labels: { color: '#6b6b80', font: { family: 'DM Mono', size: 10 } } },
            tooltip: chartDefaults.plugins.tooltip
          },
          scales: {
            x: chartDefaults.scales.x,
            y: {
              grid: chartDefaults.scales.y.grid,
              ticks: {
                color: '#6b6b80',
                font: { family: 'DM Mono', size: 11 },
                callback: function(value) { return '$' + value; }
              },
              beginAtZero: true
            }
          },
          responsive: true,
          maintainAspectRatio: false
        }
      });
    }
    
    console.log('✅ loadAnalyticsData tamamlandi!');
  } catch (e) {
    console.error('loadAnalyticsData hatasi:', e);
  }
}

// ============================================================
// RENDER PRICES CONTENT
// ============================================================
function renderPricesContent() {
  console.log('💰 renderPricesContent basladi...');
  
  var container = document.getElementById('prices-container');
  if (!container) {
    console.error('❌ prices-container bulunamadi!');
    return;
  }
  
  try {
    var monthly = 9;
    var yearly = 79;
    var methods = ['BTC', 'LTC'];
    var discount = 27;
    
    if (window.getMonthlyPrice) monthly = window.getMonthlyPrice();
    if (window.getYearlyPrice) yearly = window.getYearlyPrice();
    if (window.getPaymentMethods) methods = window.getPaymentMethods();
    if (window.getYearlyDiscount) discount = window.getYearlyDiscount();
    
    var html = '';
    
    // 1. Aylik Plan
    html += '<div class="price-card">';
    html += '<div class="price-title">';
    html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>';
    html += 'Aylik Plan Fiyati';
    html += '</div>';
    html += '<div class="price-desc">Premium aylik abonelik fiyatini belirleyin.</div>';
    html += '<div class="price-input-group">';
    html += '<label>Aylik Fiyat</label>';
    html += '<input type="number" id="price-monthly-input" value="' + monthly + '" min="0.5" step="0.5" />';
    html += '<span class="currency-label">USD</span>';
    html += '<span style="font-size:11px;color:var(--muted);margin-left:0.5rem;">Mevcut: $' + monthly.toFixed(2) + '</span>';
    html += '</div>';
    html += '</div>';
    
    // 2. Yillik Plan
    html += '<div class="price-card">';
    html += '<div class="price-title">';
    html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
    html += 'Yillik Plan Fiyati';
    html += '</div>';
    html += '<div class="price-desc">Premium yillik abonelik fiyatini belirleyin.</div>';
    html += '<div class="price-input-group">';
    html += '<label>Yillik Fiyat</label>';
    html += '<input type="number" id="price-yearly-input" value="' + yearly + '" min="0.5" step="0.5" />';
    html += '<span class="currency-label">USD</span>';
    html += '<span style="font-size:11px;color:var(--muted);margin-left:0.5rem;">Mevcut: $' + yearly.toFixed(2) + '</span>';
    html += '</div>';
    html += '<div style="margin-top:0.5rem;font-size:11px;color:var(--muted);">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>';
    html += 'Mevcut indirim: <span id="discount-display">' + discount + '%</span>';
    if (discount > 0) {
      html += ' <span style="color:var(--green);margin-left:0.5rem;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Aktif</span>';
    }
    html += '</div>';
    html += '</div>';
    
    // 3. Odeme Secenekleri
    html += '<div class="price-card">';
    html += '<div class="price-title">';
    html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>';
    html += 'Odeme Secenekleri';
    html += '</div>';
    html += '<div class="price-desc">Kullanicilarin odeme yapabilecegi kripto para birimlerini secin.</div>';
    html += '<div class="payment-methods-grid" id="payment-methods-container">';
    for (var k = 0; k < methods.length; k++) {
      html += '<span class="payment-method-chip">';
      html += methods[k];
      html += '<button class="remove-method" onclick="removePaymentMethod(\'' + methods[k] + '\')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:12px;padding:0 2px;">✕</button>';
      html += '</span>';
    }
    html += '</div>';
    html += '<div class="add-method-input" style="margin-top:0.75rem;">';
    html += '<input type="text" id="new-method-input" placeholder="ETH" maxlength="10" />';
    html += '<button onclick="addPaymentMethod()">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    html += 'Ekle';
    html += '</button>';
    html += '</div>';
    html += '</div>';
    
    // 4. Indirim Orani
    html += '<div class="price-card">';
    html += '<div class="price-title">';
    html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>';
    html += 'Indirim Orani';
    html += '</div>';
    html += '<div class="price-desc">Yillik plan icin indirim oranini belirleyin (yuzde).</div>';
    html += '<div class="price-input-group">';
    html += '<label>Indirim %</label>';
    html += '<input type="number" id="discount-input" value="' + discount + '" min="0" max="90" step="1" />';
    html += '<span class="currency-label">%</span>';
    html += '<span style="font-size:11px;color:var(--muted);margin-left:0.5rem;">Oneri: %27-40</span>';
    html += '</div>';
    html += '</div>';
    
    // 5. Butonlar
    html += '<div class="price-actions">';
    html += '<button class="btn btn-primary" id="save-prices-btn" style="display:inline-flex;align-items:center;gap:4px;">';
    html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';
    html += 'Fiyatlari Kaydet';
    html += '</button>';
    html += '<button class="btn btn-ghost" id="reset-prices-btn" style="display:inline-flex;align-items:center;gap:4px;">';
    html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
    html += 'Varsayilana Don';
    html += '</button>';
    html += '</div>';
    
    // 6. Not
    html += '<div style="margin-top:1rem;padding:1rem;background:rgba(139,92,246,0.04);border-radius:var(--radius);border:1px solid var(--border);">';
    html += '<p style="font-size:12px;color:var(--muted);margin:0;display:flex;align-items:center;gap:6px;">';
    html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    html += '<strong>Not:</strong> Fiyat degisiklikleri tum kullanicilar icin gecerli olacaktir. ';
    html += 'Yeni fiyatlar otomatik olarak ana sayfa, ayarlar sayfasi ve NowPayment entegrasyonuna yansiyacaktir.';
    html += '</p>';
    html += '</div>';
    
    container.innerHTML = html;
    console.log('✅ renderPricesContent tamamlandi!');
    
    // Event bindings
    var saveBtn = document.getElementById('save-prices-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        var monthlyInput = document.getElementById('price-monthly-input');
        var yearlyInput = document.getElementById('price-yearly-input');
        var discountInput = document.getElementById('discount-input');
        
        var monthlyVal = parseFloat(monthlyInput ? monthlyInput.value : 0);
        var yearlyVal = parseFloat(yearlyInput ? yearlyInput.value : 0);
        var discountVal = parseFloat(discountInput ? discountInput.value : 0);
        
        if (!monthlyVal || monthlyVal < 0 || !yearlyVal || yearlyVal < 0 || discountVal < 0 || discountVal > 90) {
          showToast('Gecerli degerler giriniz!', 'error');
          return;
        }

        if (window.setMonthlyPrice) window.setMonthlyPrice(monthlyVal);
        if (window.setYearlyPrice) window.setYearlyPrice(yearlyVal);
        
        if (window.setYearlyDiscount) {
          window.setYearlyDiscount(discountVal);
        } else {
          try {
            localStorage.setItem('ww_yearly_discount', String(discountVal));
          } catch (e) {}
        }
        
        var methods2 = [];
        var chips = document.querySelectorAll('.payment-method-chip');
        chips.forEach(function(chip) {
          var text = chip.textContent.trim().replace('✕', '').trim();
          if (text) methods2.push(text);
        });
        if (methods2.length > 0 && window.setPaymentMethods) window.setPaymentMethods(methods2);
        
        showToast('Fiyatlar basariyla kaydedildi!', 'success');
        var discountDisplay = document.getElementById('discount-display');
        if (discountDisplay) discountDisplay.textContent = discountVal + '%';
        if (window.updateHomePrices) window.updateHomePrices();
      });
    }

    var resetBtn = document.getElementById('reset-prices-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        if (confirm('Varsayilan fiyatlara donmek istediginizden emin misiniz?')) {
          if (window.resetPrices) window.resetPrices();
          showToast('Varsayilan fiyatlara donuldu.', 'success');
          renderPricesContent();
        }
      });
    }
    
  } catch (e) {
    console.error('renderPricesContent hatasi:', e);
    container.innerHTML = '<div style="padding:2rem;color:var(--red);text-align:center;">Fiyat yonetimi yuklenirken hata olustu: ' + e.message + '</div>';
  }
}

// ============================================================
// PAYMENT METHODS
// ============================================================
function addPaymentMethod() {
  var input = document.getElementById('new-method-input');
  if (!input) return;
  var method = input.value.trim().toUpperCase();
  if (!method) {
    showToast('Lutfen bir kripto para birimi girin (orn: ETH)', 'error');
    return;
  }
  
  var methods = [];
  var chips = document.querySelectorAll('.payment-method-chip');
  chips.forEach(function(chip) {
    var text = chip.textContent.trim().replace('✕', '').trim();
    if (text) methods.push(text);
  });
  
  if (methods.indexOf(method) !== -1) {
    showToast('Bu odeme metodu zaten ekli!', 'error');
    return;
  }
  
  methods.push(method);
  if (window.setPaymentMethods) window.setPaymentMethods(methods);
  renderPricesContent();
  showToast(method + ' eklendi!', 'success');
}

function removePaymentMethod(method) {
  var methods = [];
  var chips = document.querySelectorAll('.payment-method-chip');
  chips.forEach(function(chip) {
    var text = chip.textContent.trim().replace('✕', '').trim();
    if (text && text !== method) methods.push(text);
  });
  
  if (methods.length === 0) {
    showToast('En az bir odeme metodu olmalidir!', 'error');
    return;
  }
  
  if (window.setPaymentMethods) window.setPaymentMethods(methods);
  renderPricesContent();
  showToast(method + ' kaldirildi.', 'success');
}

// ⭐ Global
window.loadAnalyticsData = loadAnalyticsData;
window.renderPricesContent = renderPricesContent;
window.addPaymentMethod = addPaymentMethod;
window.removePaymentMethod = removePaymentMethod;

console.log('✅ admin-dashboard.js yuklendi!');