// ============================================================
// ADMIN-DATA.JS - USERS & REFERENCES
// ============================================================

async function loadUsers() {
  try {
    var { data: profiles, error } = await sb
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    adminState.users = (profiles || []).map(function(p) {
      return {
        id: p.id,
        email: p.email || '—',
        username: p.username || '—',
        user_metadata: { username: p.username || '—', role: p.role || 'user' },
        plan: p.plan || 'free',
        plan_expires_at: p.plan_expires_at || null,
        created_at: p.created_at,
        last_active: p.last_active,
        avatar_url: p.avatar_url || null
      };
    });
  } catch (e) {
    showToast('Kullanıcılar yüklenemedi!', 'error');
    adminState.users = [];
  }
}

async function loadReferences() {
  try {
    var { data, error } = await sb
      .from('references')
      .select('*')
      .order('display_order', { ascending: true });
    
    if (!error) adminState.references = data || [];
  } catch (e) {
    adminState.references = [];
  }
}

function filterUsers(term) {
  if (!term) return adminState.users;
  var t = term.toLowerCase();
  return adminState.users.filter(function(u) {
    return (u.email || '').toLowerCase().indexOf(t) !== -1 ||
      (u.id || '').toLowerCase().indexOf(t) !== -1 ||
      (u.username || '').toLowerCase().indexOf(t) !== -1;
  });
}

async function renderUsersTable() {
  var container = document.getElementById('users-table-container');
  if (!container) return;
  
  var term = '';
  var searchInput = document.getElementById('user-search');
  if (searchInput) term = searchInput.value || '';
  
  var filtered = filterUsers(term);
  var countEl = document.getElementById('user-count');
  if (countEl) countEl.textContent = filtered.length;

  try {
    var { data: trades } = await sb.from('trades').select('user_id');
    var tradeCounts = {};
    (trades || []).forEach(function(t) {
      tradeCounts[t.user_id] = (tradeCounts[t.user_id] || 0) + 1;
    });
  } catch(e) {
    var tradeCounts = {};
  }

  var now = new Date();
  var AW = 10 * 60 * 1000;

  var rows = filtered.map(function(u) {
    var online = u.last_active && (now - new Date(u.last_active)) < AW;
    var role = (u.user_metadata && u.user_metadata.role) || 'user';
    var tc = tradeCounts[u.id] || 0;
    var isPremium = u.plan === 'premium';
    var expiresAt = u.plan_expires_at ? new Date(u.plan_expires_at) : null;
    var isExpired = isPremium && expiresAt && new Date() > expiresAt;
    
    var expiryText = '—';
    var expiryClass = '';
    if (isPremium && expiresAt) {
      if (isExpired) {
        expiryText = '⏳ Süresi Doldu';
        expiryClass = 'expired';
      } else {
        var daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
        expiryText = daysLeft + ' gün';
        if (daysLeft < 3) expiryClass = 'soon';
      }
    }
    
    var avatarHtml = u.avatar_url
      ? '<img src="' + u.avatar_url + '" alt="avatar" style="width:28px;height:28px;border-radius:50%;object-fit:cover;">'
      : '<span style="font-size:11px;font-weight:700;">' + getInitials(u.username) + '</span>';
    
    return '<tr>\n          <td><span class="id-chip">' + (u.id || '').slice(0, 8) + '…</span></td>\n          <td>\n            <div style="display:flex;align-items:center;gap:8px;">\n              <div style="width:28px;height:28px;border-radius:50%;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">\n                ' + avatarHtml + '\n              </div>\n              <span style="font-weight:500;">' + escapeHtml(u.username || '—') + '</span>\n            </div>\n          </td>\n          <td style="color:var(--muted);font-size:12px;">' + escapeHtml(u.email || '—') + '</td>\n          <td>\n            <span class="plan-badge-user ' + (isPremium && !isExpired ? 'premium' : 'free') + '">\n              <span class="dot"></span>\n              ' + (isPremium && !isExpired ? 'Premium' : 'Free') + '\n            </span>\n          </td>\n          <td style="font-size:11px;font-family:\'DM Mono\',monospace;">\n            ' + (isPremium && !isExpired 
              ? '<span class="expiry-text ' + expiryClass + '">' + expiryText + '</span>'
              : '<span class="expiry-text">' + expiryText + '</span>') + '\n          </td>\n          <td style="font-size:12px;color:var(--muted);">\n            ' + (isPremium && expiresAt && !isExpired ? formatDate(expiresAt) : '—') + '\n          </td>\n          <td style="font-size:12px;color:var(--muted);">' + formatDate(u.created_at) + '</td>\n          <td>' + (online ? '<span class="status-online">Aktif</span>' : '<span class="status-offline">Çevrimdışı</span>') + '</td>\n          <td><span class="role-badge role-' + role + '">' + (role === 'admin' ? 'Admin' : 'User') + '</span></td>\n        </tr>';
  }).join('');

  container.innerHTML = '\n    <div class="table-wrap" style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;">\n      <div style="overflow-x:auto;">\n        <table class="ww-table">\n          <thead>\n            <tr><th>ID</th><th>Kullanıcı</th><th>E-posta</th><th>Plan</th><th>Kalan Süre</th><th>Bitiş Tarihi</th><th>Kayıt</th><th>Durum</th><th>Rol</th></tr>\n          </thead>\n          <tbody>\n            ' + (rows || '<tr><td colspan="9"><div style="text-align:center;padding:3rem 1rem;color:var(--muted);font-size:14px;">Kullanıcı bulunamadı.</div></td></tr>') + '\n          </tbody>\n        </table>\n      </div>\n    </div>\n  ';
}

function renderReferencesTable() {
  var container = document.getElementById('references-table-container');
  if (!container) return;
  
  var countEl = document.getElementById('ref-count');
  if (countEl) countEl.textContent = adminState.references.length;

  var rows = adminState.references.map(function(r) {
    var socialIcons = '';
    if (r.instagram) socialIcons += '<span title="Instagram"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><line x1="17" y1="7" x2="17.01" y2="7"/></svg></span>';
    if (r.twitter) socialIcons += '<span title="Twitter"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/></svg></span>';
    if (r.youtube) socialIcons += '<span title="YouTube"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/></svg></span>';
    if (r.linkedin) socialIcons += '<span title="LinkedIn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg></span>';
    if (!r.instagram && !r.twitter && !r.youtube && !r.linkedin) socialIcons = '<span style="color:var(--muted);font-size:12px;">—</span>';
    
    return '<tr>\n      <td>\n        <div style="width:40px;height:40px;border-radius:50%;overflow:hidden;border:2px solid var(--border2);background:var(--surface2);">\n          <img src="' + (r.image_url || 'https://placehold.co/40x40?text=?') + '" style="width:100%;height:100%;object-fit:cover;">\n        </div>\n      </td>\n      <td>\n        <div style="font-weight:600;color:var(--text);">' + escapeHtml(r.name) + '</div>\n        <div style="font-size:11px;color:var(--muted);margin-top:2px;">' + escapeHtml(r.title || '—') + '</div>\n      </td>\n      <td style="display:flex;gap:4px;align-items:center;">' + socialIcons + '</td>\n      <td>\n        ' + (r.is_active
          ? '<span style="background:rgba(34,197,94,0.1);color:var(--green);border:1px solid rgba(34,197,94,0.2);padding:3px 10px;border-radius:99px;font-size:10px;font-weight:600;">Aktif</span>'
          : '<span style="background:rgba(107,107,128,0.1);color:var(--muted);border:1px solid var(--border);padding:3px 10px;border-radius:99px;font-size:10px;font-weight:600;">Pasif</span>') + '\n      </td>\n      <td>\n        <div style="display:flex;gap:4px;">\n          <button class="btn btn-ghost btn-sm" onclick="editReference(\'' + r.id + '\')" style="display:inline-flex;align-items:center;gap:3px;">\n            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>\n            Düzenle\n          </button>\n          <button class="btn btn-danger btn-sm" onclick="deleteReference(\'' + r.id + '\')" style="display:inline-flex;align-items:center;gap:3px;">\n            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>\n            Sil\n          </button>\n        </div>\n      </td>\n    </tr>';
  }).join('');

  container.innerHTML = '\n    <div class="table-wrap" style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;">\n      <div style="overflow-x:auto;">\n        <table class="ww-table">\n          <thead><tr><th>Fotoğraf</th><th>Kişi / Kurum</th><th>Sosyal</th><th>Durum</th><th>İşlem</th></tr></thead>\n          <tbody>\n            ' + (rows || '<tr><td colspan="5"><div style="text-align:center;padding:3rem 1rem;color:var(--muted);font-size:14px;">Henüz referans eklenmemiş.</div></td></tr>') + '\n          </tbody>\n        </table>\n      </div>\n    </div>\n  ';
}

function openReferenceModal(ref) {
  ref = ref || null;
  var m = document.getElementById('ref-modal');
  if (!m) return;
  
  var idEl = document.getElementById('ref-id');
  var nameEl = document.getElementById('ref-name');
  var titleEl = document.getElementById('ref-title');
  var descEl = document.getElementById('ref-desc');
  var orderEl = document.getElementById('ref-order');
  var activeEl = document.getElementById('ref-active');
  var instaEl = document.getElementById('ref-insta');
  var twitterEl = document.getElementById('ref-twitter');
  var youtubeEl = document.getElementById('ref-youtube');
  var linkedinEl = document.getElementById('ref-linkedin');
  var previewEl = document.getElementById('ref-image-preview-img');
  var imageEl = document.getElementById('ref-image');
  var titleModalEl = document.getElementById('ref-modal-title');
  
  if (idEl) idEl.value = ref && ref.id ? ref.id : '';
  if (nameEl) nameEl.value = ref && ref.name ? ref.name : '';
  if (titleEl) titleEl.value = ref && ref.title ? ref.title : '';
  if (descEl) descEl.value = ref && ref.description ? ref.description : '';
  if (orderEl) orderEl.value = ref && ref.display_order !== undefined ? ref.display_order : 0;
  if (activeEl) activeEl.value = ref && ref.is_active !== undefined ? ref.is_active : true;
  if (instaEl) instaEl.value = ref && ref.instagram ? ref.instagram : '';
  if (twitterEl) twitterEl.value = ref && ref.twitter ? ref.twitter : '';
  if (youtubeEl) youtubeEl.value = ref && ref.youtube ? ref.youtube : '';
  if (linkedinEl) linkedinEl.value = ref && ref.linkedin ? ref.linkedin : '';
  if (previewEl) previewEl.src = ref && ref.image_url ? ref.image_url : 'https://placehold.co/64x64?text=Photo';
  if (imageEl) imageEl.value = ref && ref.image_url ? ref.image_url : '';
  if (titleModalEl) titleModalEl.textContent = ref ? 'Referans Düzenle' : 'Yeni Referans Ekle';
  m.classList.add('open');
  adminState.currentImageFile = null;
}

function closeReferenceModal() {
  var m = document.getElementById('ref-modal');
  if (m) m.classList.remove('open');
  adminState.currentImageFile = null;
}

async function uploadImage(file) {
  if (!file) return null;
  try {
    var ext = file.name.split('.').pop();
    var path = 'references/' + Date.now() + '_' + Math.random().toString(36).slice(7) + '.' + ext;
    var { error } = await sb.storage.from('references-images').upload(path, file);
    if (error) return null;
    var publicUrl = sb.storage.from('references-images').getPublicUrl(path).data.publicUrl;
    return publicUrl;
  } catch(e) {
    return null;
  }
}

async function saveReference() {
  var idEl = document.getElementById('ref-id');
  var id = idEl ? idEl.value : '';
  var imageEl = document.getElementById('ref-image');
  var imageUrl = imageEl ? imageEl.value : '';
  
  if (adminState.currentImageFile) {
    var url = await uploadImage(adminState.currentImageFile);
    if (url) imageUrl = url;
  }
  
  var nameEl = document.getElementById('ref-name');
  var titleEl = document.getElementById('ref-title');
  var descEl = document.getElementById('ref-desc');
  var orderEl = document.getElementById('ref-order');
  var activeEl = document.getElementById('ref-active');
  var instaEl = document.getElementById('ref-insta');
  var twitterEl = document.getElementById('ref-twitter');
  var youtubeEl = document.getElementById('ref-youtube');
  var linkedinEl = document.getElementById('ref-linkedin');
  
  var payload = {
    name: nameEl ? nameEl.value.trim() : '',
    title: titleEl ? titleEl.value.trim() : '',
    description: descEl ? descEl.value.trim() : '',
    image_url: imageUrl,
    display_order: parseInt(orderEl ? orderEl.value : 0) || 0,
    is_active: activeEl ? activeEl.value === 'true' : true,
    instagram: instaEl ? instaEl.value.trim() : '',
    twitter: twitterEl ? twitterEl.value.trim() : '',
    youtube: youtubeEl ? youtubeEl.value.trim() : '',
    linkedin: linkedinEl ? linkedinEl.value.trim() : ''
  };
  
  if (!payload.name) {
    showToast('İsim alanı zorunludur!', 'error');
    return;
  }

  var result;
  if (id) {
    result = await sb.from('references').update(payload).eq('id', id);
  } else {
    result = await sb.from('references').insert([payload]);
  }

  if (result && result.error) {
    showToast('Kayıt hatası: ' + result.error.message, 'error');
    return;
  }
  
  showToast(id ? 'Referans güncellendi!' : 'Referans eklendi!');
  closeReferenceModal();
  await loadReferences();
  renderReferencesTable();
}

async function editReference(id) {
  var ref = adminState.references.find(function(r) { return r.id === id; });
  if (ref) openReferenceModal(ref);
}

async function deleteReference(id) {
  if (!confirm('Bu referansı silmek istediğinizden emin misiniz?')) return;
  var { error } = await sb.from('references').delete().eq('id', id);
  if (error) {
    showToast('Silme hatası: ' + error.message, 'error');
    return;
  }
  showToast('Referans silindi!');
  await loadReferences();
  renderReferencesTable();
}

// Event bindings
document.addEventListener('DOMContentLoaded', function() {
  var uploadBtn = document.getElementById('upload-image-btn');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', function() {
      var fileInput = document.getElementById('ref-image-file');
      if (fileInput) fileInput.click();
    });
  }

  var fileInput = document.getElementById('ref-image-file');
  if (fileInput) {
    fileInput.addEventListener('change', function(e) {
      var f = e.target.files[0];
      if (!f) return;
      if (!f.type.startsWith('image/')) {
        showToast('Geçerli bir resim seçin!', 'error');
        return;
      }
      if (f.size > 2 * 1024 * 1024) {
        showToast('Resim 2MB\'dan küçük olmalı!', 'error');
        return;
      }
      var r = new FileReader();
      r.onload = function(ev) {
        var preview = document.getElementById('ref-image-preview-img');
        if (preview) preview.src = ev.target.result;
      };
      r.readAsDataURL(f);
      adminState.currentImageFile = f;
    });
  }

  var removeImageBtn = document.getElementById('remove-image-btn');
  if (removeImageBtn) {
    removeImageBtn.addEventListener('click', function() {
      var preview = document.getElementById('ref-image-preview-img');
      if (preview) preview.src = 'https://placehold.co/64x64?text=Photo';
      var refImage = document.getElementById('ref-image');
      if (refImage) refImage.value = '';
      adminState.currentImageFile = null;
    });
  }

  var cancelRefBtn = document.getElementById('cancel-ref-btn');
  if (cancelRefBtn) cancelRefBtn.addEventListener('click', closeReferenceModal);
  
  var saveRefBtn = document.getElementById('save-ref-btn');
  if (saveRefBtn) saveRefBtn.addEventListener('click', saveReference);
  
  var closeRefModal = document.getElementById('close-ref-modal');
  if (closeRefModal) closeRefModal.addEventListener('click', closeReferenceModal);
  
  var refModal = document.getElementById('ref-modal');
  if (refModal) {
    refModal.addEventListener('click', function(e) {
      if (e.target.id === 'ref-modal') closeReferenceModal();
    });
  }
});

window.loadUsers = loadUsers;
window.loadReferences = loadReferences;
window.filterUsers = filterUsers;
window.renderUsersTable = renderUsersTable;
window.renderReferencesTable = renderReferencesTable;
window.openReferenceModal = openReferenceModal;
window.closeReferenceModal = closeReferenceModal;
window.saveReference = saveReference;
window.editReference = editReference;
window.deleteReference = deleteReference;
window.uploadImage = uploadImage;