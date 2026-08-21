// ============================================================
// WAWE JOURNAL – script.js (SORUNSUZ - 0 HATA)
// ============================================================

// ── Global hata yakalama ─────────────────────────────────────
window.onerror = function(message, source, lineno, colno, error) {
  try {
    const errorMsg = error ? error.message : message;
    if (errorMsg && errorMsg.includes('localStorage')) {
      return true;
    }
  } catch (e) {}
  return false;
};

// ── localStorage yardımcısı ──────────────────────────────────
function safeLocalStorageGet(key, defaultValue) {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;
    return value;
  } catch (e) {
    return defaultValue;
  }
}

function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

function safeLocalStorageRemove(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    return false;
  }
}

// ── INSTRUMENT_MULTIPLIERS ──────────────────────────────────
if (typeof window.INSTRUMENT_MULTIPLIERS === 'undefined') {
  window.INSTRUMENT_MULTIPLIERS = {
    forex: 100000,
    gold: 100,
    index: 10,
    crypto: 1,
    other: 1
  };
}
const INSTRUMENT_MULTIPLIERS = window.INSTRUMENT_MULTIPLIERS;

// ── TEMA BAŞLANGIÇ ──────────────────────────────────────────
(function() {
  const saved = safeLocalStorageGet('ww_theme', null);
  if (saved === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }
})();

// ── SUPABASE BAĞLANTISI ─────────────────────────────────────
if (typeof WW_CONFIG === 'undefined') {
  console.error('❌ WW_CONFIG tanımlı değil! config.js yüklenmedi.');
  window.WW_CONFIG = {
    SUPABASE_URL: 'https://odasapyhtdopbnlfhwde.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kYXNhcHlodGRvcGJubGZod2RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NDk0NjgsImV4cCI6MjA5NDAyNTQ2OH0.AH7V9i61pFWj33sCy51khdYHZn34BNitXY9exJySmWg'
  };
}

// ⭐ sanitizeHTML fonksiyonu - EKSİK OLANI EKLEDİM!
function sanitizeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    if (m === '"') return '&quot;';
    if (m === "'") return '&#39;';
    return m;
  });
}

// ── SUPABASE CLIENT ──────────────────────────────────────────
// sb zaten config.js'de oluşturuldu, eğer yoksa burada oluştur
if (typeof window.sb === 'undefined') {
  const { createClient } = supabase;
  window.sb = createClient(WW_CONFIG.SUPABASE_URL, WW_CONFIG.SUPABASE_ANON_KEY);
}
const sb = window.sb;

// ── PARA BİRİMİ ──────────────────────────────────────────────
function getCurrencySymbol() {
  return safeLocalStorageGet('ww_currency', '$');
}

function setCurrencySymbol(symbol) {
  safeLocalStorageSet('ww_currency', symbol);
}

// ════════════════════════════════════════════════════════════════
// 🎨 TEMA ÖZELLEŞTİRME FONKSİYONLARI
// ════════════════════════════════════════════════════════════════

function getThemeSettings() {
  try {
    const saved = safeLocalStorageGet('ww_custom_theme', null);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {}
  return { ...WW_CONFIG.THEME };
}

function saveThemeSettings(settings) {
  try {
    safeLocalStorageSet('ww_custom_theme', JSON.stringify(settings));
    applyThemeSettings(settings);
  } catch (e) {}
}

function applyThemeSettings(settings) {
  const root = document.documentElement;
  if (settings.backgroundColor) root.style.setProperty('--bg', settings.backgroundColor);
  if (settings.surfaceColor) {
    root.style.setProperty('--surface', settings.surfaceColor);
    root.style.setProperty('--surface2', settings.surfaceColor);
  }
  if (settings.borderColor) root.style.setProperty('--border', settings.borderColor);
  if (settings.textColor) root.style.setProperty('--text', settings.textColor);
  if (settings.fontSize) {
    document.body.style.fontSize = settings.fontSize + 'px';
    safeLocalStorageSet('ww_font_size', settings.fontSize);
  }
}

function applyFontSize(size) {
  if (size) {
    document.body.style.fontSize = size + 'px';
    safeLocalStorageSet('ww_font_size', size);
  }
}

function loadFontSize() {
  const saved = safeLocalStorageGet('ww_font_size', null);
  if (saved) {
    document.body.style.fontSize = saved + 'px';
    return parseInt(saved);
  }
  // ⭐ Güvenli erişim - WW_CONFIG.THEME kontrolü
  if (WW_CONFIG && WW_CONFIG.THEME && WW_CONFIG.THEME.fontSize) {
    return WW_CONFIG.THEME.fontSize;
  }
  return 16;
}

async function canCustomizeTheme() {
  const { plan } = await getUserPlanSilent();
  return plan === 'premium';
}

// ⭐ Sessiz plan kontrolü - yönlendirme YAPMAZ
async function getUserPlanSilent() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return { plan: 'free', features: FEATURES.free };
    
    const { data, error } = await sb
      .from('user_profiles')
      .select('plan, plan_expires_at')
      .eq('id', session.user.id)
      .single();
    
    if (error || !data || data.plan === 'free') {
      return { plan: 'free', features: FEATURES.free };
    }
    
    if (data.plan === 'premium' && data.plan_expires_at) {
      const now = new Date();
      const expires = new Date(data.plan_expires_at);
      
      if (isNaN(expires.getTime()) || now > expires) {
        return { plan: 'free', features: FEATURES.free };
      }
    }
    
    return { plan: data.plan || 'free', features: data.plan === 'premium' ? FEATURES.premium : FEATURES.free };
  } catch (error) {
    return { plan: 'free', features: FEATURES.free };
  }
}

async function loadThemeCustomization() {
  const isPremium = await canCustomizeTheme();
  const container = document.getElementById('theme-customization-container');
  if (!container) return;

  if (!isPremium) {
    container.innerHTML = `
      <div style="text-align:center;padding:2rem;background:var(--surface2);border-radius:var(--radius);border:1px solid var(--border);">
        <div style="font-size:2.5rem;margin-bottom:0.75rem;">💎</div>
        <h3 style="font-family:'Syne',sans-serif;font-size:1rem;color:var(--text);margin-bottom:0.5rem;">Tema Özelleştirme</h3>
        <p style="color:var(--muted);font-size:13px;max-width:400px;margin:0 auto 1rem;">Bu özellik sadece Premium üyelere özeldir.</p>
        <a href="settings.html#panel-plan" class="btn btn-primary" style="display:inline-flex;">Premium'a Geç →</a>
      </div>
    `;
    return;
  }

  const settings = getThemeSettings();
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1rem;">
      <div class="field">
        <label>Arka Plan Rengi</label>
        <div style="display:flex;align-items:center;gap:0.75rem;">
          <input type="color" id="custom-bg-color" value="${settings.backgroundColor || '#0a0a0f'}" style="width:50px;height:40px;border:none;cursor:pointer;background:transparent;padding:0;">
          <input type="text" id="custom-bg-color-text" value="${settings.backgroundColor || '#0a0a0f'}" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:0.5rem 0.75rem;color:var(--text);font-family:'DM Mono',monospace;font-size:12px;">
        </div>
      </div>
      <div class="field">
        <label>Kart Arka Plan Rengi</label>
        <div style="display:flex;align-items:center;gap:0.75rem;">
          <input type="color" id="custom-surface-color" value="${settings.surfaceColor || '#111118'}" style="width:50px;height:40px;border:none;cursor:pointer;background:transparent;padding:0;">
          <input type="text" id="custom-surface-color-text" value="${settings.surfaceColor || '#111118'}" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:0.5rem 0.75rem;color:var(--text);font-family:'DM Mono',monospace;font-size:12px;">
        </div>
      </div>
      <div class="field">
        <label>Kenarlık Rengi</label>
        <div style="display:flex;align-items:center;gap:0.75rem;">
          <input type="color" id="custom-border-color" value="${settings.borderColor || '#1e1e2e'}" style="width:50px;height:40px;border:none;cursor:pointer;background:transparent;padding:0;">
          <input type="text" id="custom-border-color-text" value="${settings.borderColor || '#1e1e2e'}" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:0.5rem 0.75rem;color:var(--text);font-family:'DM Mono',monospace;font-size:12px;">
        </div>
      </div>
      <div class="field">
        <label>Metin Rengi</label>
        <div style="display:flex;align-items:center;gap:0.75rem;">
          <input type="color" id="custom-text-color" value="${settings.textColor || '#e8e8f0'}" style="width:50px;height:40px;border:none;cursor:pointer;background:transparent;padding:0;">
          <input type="text" id="custom-text-color-text" value="${settings.textColor || '#e8e8f0'}" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:0.5rem 0.75rem;color:var(--text);font-family:'DM Mono',monospace;font-size:12px;">
        </div>
      </div>
      <div class="field">
        <label>Font Boyutu: <span id="font-size-display">${settings.fontSize || 16}px</span></label>
        <input type="range" id="custom-font-size" min="12" max="24" step="1" value="${settings.fontSize || 16}" style="width:100%;accent-color:var(--accent);">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);">
          <span>12px</span><span>18px</span><span>24px</span>
        </div>
      </div>
      <div style="display:flex;gap:0.75rem;margin-top:0.5rem;flex-wrap:wrap;">
        <button class="btn btn-primary" id="save-custom-theme-btn">💾 Temayı Kaydet</button>
        <button class="btn btn-ghost" id="reset-custom-theme-btn">↺ Varsayılana Dön</button>
      </div>
      <div id="theme-preview-box" style="margin-top:1rem;padding:1rem;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);">
        <p style="color:var(--text);font-size:${settings.fontSize || 16}px;margin:0;">
          <strong>Önizleme:</strong> Bu metin seçtiğiniz renk ve font boyutu ile görüntüleniyor.
        </p>
        <div style="display:flex;gap:0.5rem;margin-top:0.5rem;flex-wrap:wrap;">
          <span style="background:var(--accent);color:#fff;padding:4px 12px;border-radius:4px;font-size:12px;">Accent</span>
          <span style="background:var(--green);color:#fff;padding:4px 12px;border-radius:4px;font-size:12px;">Win</span>
          <span style="background:var(--red);color:#fff;padding:4px 12px;border-radius:4px;font-size:12px;">Loss</span>
        </div>
      </div>
    </div>
  `;

  const bgColor = document.getElementById('custom-bg-color');
  const bgColorText = document.getElementById('custom-bg-color-text');
  const surfaceColor = document.getElementById('custom-surface-color');
  const surfaceColorText = document.getElementById('custom-surface-color-text');
  const borderColor = document.getElementById('custom-border-color');
  const borderColorText = document.getElementById('custom-border-color-text');
  const textColor = document.getElementById('custom-text-color');
  const textColorText = document.getElementById('custom-text-color-text');
  const fontSize = document.getElementById('custom-font-size');
  const fontSizeDisplay = document.getElementById('font-size-display');

  function updatePreview() {
    const bg = bgColor.value;
    const surface = surfaceColor.value;
    const border = borderColor.value;
    const text = textColor.value;
    const size = fontSize.value;

    const preview = document.getElementById('theme-preview-box');
    if (preview) {
      preview.style.background = surface;
      preview.style.borderColor = border;
      preview.style.color = text;
      preview.style.fontSize = size + 'px';
      const strong = preview.querySelector('strong');
      if (strong) strong.style.color = text;
    }

    const root = document.documentElement;
    root.style.setProperty('--bg', bg);
    root.style.setProperty('--surface', surface);
    root.style.setProperty('--surface2', surface);
    root.style.setProperty('--border', border);
    root.style.setProperty('--text', text);
    document.body.style.fontSize = size + 'px';

    bgColorText.value = bg;
    surfaceColorText.value = surface;
    borderColorText.value = border;
    textColorText.value = text;
    if (fontSizeDisplay) fontSizeDisplay.textContent = size + 'px';
  }

  bgColor.addEventListener('input', updatePreview);
  bgColorText.addEventListener('input', function() {
    if (this.value.match(/^#[0-9a-fA-F]{6}$/)) {
      bgColor.value = this.value;
      updatePreview();
    }
  });
  surfaceColor.addEventListener('input', updatePreview);
  surfaceColorText.addEventListener('input', function() {
    if (this.value.match(/^#[0-9a-fA-F]{6}$/)) {
      surfaceColor.value = this.value;
      updatePreview();
    }
  });
  borderColor.addEventListener('input', updatePreview);
  borderColorText.addEventListener('input', function() {
    if (this.value.match(/^#[0-9a-fA-F]{6}$/)) {
      borderColor.value = this.value;
      updatePreview();
    }
  });
  textColor.addEventListener('input', updatePreview);
  textColorText.addEventListener('input', function() {
    if (this.value.match(/^#[0-9a-fA-F]{6}$/)) {
      textColor.value = this.value;
      updatePreview();
    }
  });
  fontSize.addEventListener('input', updatePreview);

  document.getElementById('save-custom-theme-btn').addEventListener('click', function() {
    const settings = {
      backgroundColor: bgColor.value,
      surfaceColor: surfaceColor.value,
      borderColor: borderColor.value,
      textColor: textColor.value,
      fontSize: parseInt(fontSize.value)
    };
    saveThemeSettings(settings);
    showToast('✅ Tema başarıyla kaydedildi!', 'success');
  });

  document.getElementById('reset-custom-theme-btn').addEventListener('click', function() {
    const defaultSettings = WW_CONFIG.THEME;
    bgColor.value = defaultSettings.backgroundColor;
    surfaceColor.value = defaultSettings.surfaceColor;
    borderColor.value = defaultSettings.borderColor;
    textColor.value = defaultSettings.textColor;
    fontSize.value = defaultSettings.fontSize;
    updatePreview();
    saveThemeSettings(defaultSettings);
    showToast('↺ Tema varsayılan ayarlara döndürüldü.', 'success');
  });

  updatePreview();
}

document.addEventListener('DOMContentLoaded', function() {
  loadFontSize();
  const settings = getThemeSettings();
  applyThemeSettings(settings);
  
  // Sadece theme-customization-container varsa yükle
  if (document.getElementById('theme-customization-container')) {
    loadThemeCustomization();
  }
});

// ============================================================
// AUTH
// ============================================================

async function requireAuth() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { 
      window.location.href = 'login.html'; 
      return null; 
    }
    
    const { data: profile, error } = await sb
      .from('user_profiles')
      .select('is_active')
      .eq('id', session.user.id)
      .single();
    
    if (error || !profile || profile.is_active === false) {
      await sb.auth.signOut();
      safeLocalStorageRemove('ww_last_active_push');
      showToast(i18n.t('auth.account_disabled'), 'error');
      window.location.href = 'index.html';
      return null;
    }
    
    throttledUpdateLastActive(session.user.id);
    return session.user;
  } catch (error) {
    console.error('requireAuth hatası:', error);
    return null;
  }
}

// ⭐ Sessiz auth kontrolü - yönlendirme YAPMAZ
async function requireAuthSilent() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    
    const { data: profile, error } = await sb
      .from('user_profiles')
      .select('is_active')
      .eq('id', session.user.id)
      .single();
    
    if (error || !profile || profile.is_active === false) {
      await sb.auth.signOut();
      safeLocalStorageRemove('ww_last_active_push');
      return null;
    }
    
    throttledUpdateLastActive(session.user.id);
    return session.user;
  } catch (error) {
    return null;
  }
}

async function requireAdmin() {
  const user = await requireAuth();
  if (!user) return null;
  if (!isAdmin(user)) {
    window.location.href = 'dashboard.html';
    return null;
  }
  return user;
}

function isAdmin(user) {
  // app_metadata can only be changed with Supabase's server-side admin API.
  // user_metadata is user-editable and must never authorize an admin action.
  return user?.app_metadata?.role === 'admin';
}

const ACTIVE_THROTTLE_MS = 5 * 60 * 1000;

async function throttledUpdateLastActive(userId) {
  const key = 'ww_last_active_push';
  const lastPush = parseInt(safeLocalStorageGet(key, '0'), 10);
  const now = Date.now();
  if (now - lastPush < ACTIVE_THROTTLE_MS) return;
  safeLocalStorageSet(key, String(now));
  await sb
    .from('user_profiles')
    .upsert({ id: userId, last_active: new Date().toISOString() }, { onConflict: 'id' });
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('logout-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      safeLocalStorageRemove('ww_last_active_push');
      await sb.auth.signOut();
      window.location.href = 'index.html';
    });
  }
});

// ============================================================
// HESAPLAMA FONKSİYONLARI
// ============================================================

// ⭐ DÜZELTİLMİŞ calcPnL() - exitNum === 0 kontrolü kaldırıldı!
function calcPnL(entry, exit, lot, direction, instrument, customMultiplier) {
  const entryNum = parseFloat(entry);
  const exitNum = parseFloat(exit);
  const lotNum = parseFloat(lot);
  
  // Eğer exit null, undefined veya boş string ise 0 döndür (açık işlem)
  if (exit === null || exit === undefined || exit === '') return 0;
  
  // NaN kontrolleri
  if (isNaN(entryNum) || isNaN(exitNum) || isNaN(lotNum)) return 0;
  
  // Entry veya lot 0 ise 0 döndür
  if (entryNum === 0 || lotNum === 0) return 0;
  
  // Multiplier ve direction hesapla
  const multiplier = customMultiplier ?? INSTRUMENT_MULTIPLIERS[instrument] ?? 1;
  const dir = (direction?.toUpperCase() === 'LONG' || direction?.toUpperCase() === 'BUY') ? 1 : -1;
  
  return dir * (exitNum - entryNum) * lotNum * multiplier;
}

function calcRR(entry, sl, tp, direction) {
  const entryNum = parseFloat(entry);
  const slNum = parseFloat(sl);
  const tpNum = parseFloat(tp);
  
  if (isNaN(entryNum) || isNaN(slNum) || isNaN(tpNum)) return null;
  if (!entryNum || !slNum || !tpNum) return null;
  
  const risk = Math.abs(entryNum - slNum);
  const reward = Math.abs(tpNum - entryNum);
  if (risk === 0 || isNaN(risk) || isNaN(reward)) return null;
  return (reward / risk).toFixed(2);
}

// ── FORMATLAMA ──────────────────────────────────────────────
function formatCurrency(value) {
  const num = parseFloat(value) || 0;
  const currency = getCurrencySymbol();
  const formatted = Math.abs(num).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  if (num < 0) {
    return '-' + currency + formatted;
  }
  return '+' + currency + formatted;
}

function formatCurrencyPDF(value) {
  const num = parseFloat(value) || 0;
  const currency = getCurrencySymbol();
  const formatted = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  if (num < 0) {
    return '-' + currency + formatted;
  }
  return '+' + currency + formatted;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function directionBadge(direction) {
  if (!direction) return '';
  const up = direction.toUpperCase() === 'LONG' || direction.toUpperCase() === 'BUY';
  return up
    ? `<span class="badge badge-long">${direction.toUpperCase()}</span>`
    : `<span class="badge badge-short">${direction.toUpperCase()}</span>`;
}

// ── INPUT YARDIMCILARI ───────────────────────────────────────
function fixDecimalInput(el) {
  el.addEventListener('input', () => {
    const pos = el.selectionStart;
    el.value = el.value.replace(',', '.');
    try { el.setSelectionRange(pos, pos); } catch(_) {}
  });
}

function applyDecimalFix(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) fixDecimalInput(el);
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── TOAST ────────────────────────────────────────────────────
function showToast(message, type) {
  type = type || 'success';
  try {
    const old = document.querySelector('.ww-toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.className = 'ww-toast ww-toast--' + type;
    t.textContent = message;
    document.body.appendChild(t);
    requestAnimationFrame(function() {
      t.classList.add('ww-toast--visible');
    });
    setTimeout(function() {
      t.classList.remove('ww-toast--visible');
      setTimeout(function() { t.remove(); }, 400);
    }, 3200);
  } catch (e) {}
}

// ── CHART YARDIMCISI ─────────────────────────────────────────
function destroyChart(id) {
  const existing = Chart.getChart(id);
  if (existing) existing.destroy();
}

// ── RESİM YÜKLEME ────────────────────────────────────────────
async function uploadReferenceImage(file) {
  if (!file) return null;
  
  const fileExt = file.name.split('.').pop();
  const fileName = Date.now() + '_' + Math.random().toString(36).substring(7) + '.' + fileExt;
  const filePath = 'references/' + fileName;
  
  const { error: uploadError } = await sb.storage
    .from('references-images')
    .upload(filePath, file);
  
  if (uploadError) {
    showToast(i18n.t('toast.upload_error'), 'error');
    return null;
  }
  
  const { data: urlData } = sb.storage
    .from('references-images')
    .getPublicUrl(filePath);
  
  return urlData.publicUrl;
}

// ── REFERANSLARI YÜKLE ──────────────────────────────────────
async function loadReferencesToPage(containerId) {
  containerId = containerId || 'references-grid';
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const { data, error } = await sb
    .from('references')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });
  
  if (error) {
    container.innerHTML = '<p style="color:var(--muted);text-align:center;">' + i18n.t('references.error') + '</p>';
    return;
  }
  
  if (!data || data.length === 0) {
    container.innerHTML = '<p style="color:var(--muted);text-align:center;">' + i18n.t('references.empty') + '</p>';
    return;
  }
  
  container.innerHTML = data.map(function(ref) {
    return `
    <div class="reference-card">
      <div class="ref-image">
        <img src="${ref.image_url || 'https://placehold.co/100x100?text=Profile'}" alt="${escapeHtml(ref.name)}" onerror="this.src='https://placehold.co/100x100?text=Profile'">
      </div>
      <div class="ref-info">
        <h3>${escapeHtml(ref.name)}</h3>
        <p class="ref-title">${escapeHtml(ref.title || '')}</p>
        <p class="ref-desc">${escapeHtml(ref.description || '')}</p>
        <div class="ref-social">
          ${ref.instagram ? '<a href="' + ref.instagram + '" target="_blank" class="ref-social-link"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><circle cx="12" cy="12" r="5"></circle><line x1="17" y1="7" x2="17.01" y2="7"></line></svg></a>' : ''}
          ${ref.twitter ? '<a href="' + ref.twitter + '" target="_blank" class="ref-social-link"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"></path></svg></a>' : ''}
          ${ref.youtube ? '<a href="' + ref.youtube + '" target="_blank" class="ref-social-link"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon></svg></a>' : ''}
          ${ref.linkedin ? '<a href="' + ref.linkedin + '" target="_blank" class="ref-social-link"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg></a>' : ''}
        </div>
      </div>
    </div>
  `}).join('');
}

// ── ESCAPE HTML ──────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// ── PLATFORM İSTATİSTİKLERİ ──────────────────────────────────
async function loadPlatformStats() {
  try {
    const { data: totalUsers, error: e1 } = await sb.rpc('get_total_users_count');
    const { data: totalTrades, error: e2 } = await sb.rpc('get_total_trades_count');
    const { data: todayUsers, error: e3 } = await sb.rpc('get_today_users_count');
    const { data: todayTrades, error: e4 } = await sb.rpc('get_today_trades_count');

    const totalUsersEl = document.getElementById('stat-total-users');
    const totalTradesEl = document.getElementById('stat-total-trades');
    const todayUsersEl = document.getElementById('stat-today-users');
    const todayTradesEl = document.getElementById('stat-today-trades');
    
    if (totalUsersEl) totalUsersEl.textContent = totalUsers ?? 0;
    if (totalTradesEl) totalTradesEl.textContent = totalTrades ?? 0;
    if (todayUsersEl) todayUsersEl.textContent = todayUsers ?? 0;
    if (todayTradesEl) todayTradesEl.textContent = todayTrades ?? 0;
  } catch(e) {
    const totalUsersEl = document.getElementById('stat-total-users');
    const totalTradesEl = document.getElementById('stat-total-trades');
    const todayUsersEl = document.getElementById('stat-today-users');
    const todayTradesEl = document.getElementById('stat-today-trades');
    if (totalUsersEl) totalUsersEl.textContent = '0';
    if (totalTradesEl) totalTradesEl.textContent = '0';
    if (todayUsersEl) todayUsersEl.textContent = '0';
    if (todayTradesEl) todayTradesEl.textContent = '0';
  }
}

document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('stat-total-users')) {
    loadPlatformStats();
  }
});

// ============================================================
// STRATEJİ YÖNETİMİ (CACHE'Lİ)
// ============================================================

let strategiesCache = null;
let strategiesCacheTime = 0;
const STRATEGIES_CACHE_TTL = 5 * 60 * 1000;

async function getUserStrategies(forceRefresh) {
  forceRefresh = forceRefresh || false;
  const user = await requireAuth();
  if (!user) return [];
  
  const now = Date.now();
  if (!forceRefresh && strategiesCache && (now - strategiesCacheTime) < STRATEGIES_CACHE_TTL) {
    return strategiesCache;
  }
  
  const { data, error } = await sb
    .from('strategies')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('name', { ascending: true });
  
  if (error) {
    return strategiesCache || [];
  }
  
  strategiesCache = data || [];
  strategiesCacheTime = now;
  return strategiesCache;
}

function clearStrategiesCache() {
  strategiesCache = null;
  strategiesCacheTime = 0;
}

async function addStrategy(name, description, color) {
  color = color || '#7c6dfa';
  const user = await requireAuth();
  if (!user) return null;
  
  if (!name || name.trim() === '') {
    showToast(i18n.t('strategies.error_name_required'), 'error');
    return null;
  }
  
  const { data, error } = await sb
    .from('strategies')
    .insert([{
      user_id: user.id,
      name: name.trim(),
      description: description?.trim() || null,
      color: color,
      is_active: true
    }])
    .select()
    .single();
  
  if (error) {
    showToast(i18n.t('strategies.error_add') + error.message, 'error');
    return null;
  }
  
  clearStrategiesCache();
  showToast(i18n.t('strategies.added'));
  return data;
}

async function deleteStrategy(strategyId) {
  const { error } = await sb
    .from('strategies')
    .delete()
    .eq('id', strategyId);
  
  if (error) {
    showToast(i18n.t('strategies.error_delete') + error.message, 'error');
    return false;
  }
  
  clearStrategiesCache();
  showToast(i18n.t('strategies.deleted'));
  return true;
}

async function updateStrategy(strategyId, updates) {
  const { error } = await sb
    .from('strategies')
    .update(updates)
    .eq('id', strategyId);
  
  if (error) {
    showToast(i18n.t('strategies.error_update') + error.message, 'error');
    return false;
  }
  
  clearStrategiesCache();
  showToast(i18n.t('strategies.updated'));
  return true;
}

function calculateStrategyPerformance(trades, strategyId) {
  const strategyTrades = trades.filter(function(t) { 
    return t.strategy_id === strategyId && t.exit_price; 
  });
  if (strategyTrades.length === 0) return null;
  
  let totalPnL = 0;
  let wins = 0;
  let losses = 0;
  
  strategyTrades.forEach(function(t) {
    const mult = t.multiplier || INSTRUMENT_MULTIPLIERS[t.instrument] || 100000;
    const pnl = calcPnL(t.entry_price, t.exit_price, t.lot, t.direction, 'other', mult);
    totalPnL += pnl;
    if (pnl > 0) wins++;
    else if (pnl < 0) losses++;
  });
  
  const total = strategyTrades.length;
  const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : 0;
  
  return {
    totalTrades: total,
    wins: wins,
    losses: losses,
    totalPnL: totalPnL,
    winRate: parseFloat(winRate),
    avgPnL: total > 0 ? totalPnL / total : 0
  };
}

async function getStrategiesMap() {
  const strategies = await getUserStrategies();
  const map = {};
  strategies.forEach(function(s) { map[s.id] = s.name; });
  return map;
}

function colorizeTotalPnL(totalPnL) {
  const pnlElement = document.getElementById('stat-pnl');
  if (!pnlElement) return;
  if (totalPnL >= 0) {
    pnlElement.classList.add('positive');
    pnlElement.classList.remove('negative');
  } else {
    pnlElement.classList.add('negative');
    pnlElement.classList.remove('positive');
  }
}

// ============================================================
// 🚀 PLAN & PREMIUM SİSTEMİ
// ============================================================

const FEATURES = {
  free: {
    label: '🆓 Free',
    maxTrades: Infinity,
    maxStrategies: Infinity,
    premiumDashboard: false,
    dragDropPanels: false,
    advancedCharts: false,
    themeCustomization: false,
    detailedPdf: false,
    newsPage: false,
    advancedOvertrade: false,
    multiCurrency: false,
    lightTheme: false,
    prioritySupport: false,
    noAds: false,
    infiniteStorage: false,
    community: false,
    calendar: true,
    monthlyGoal: true,
    strategyComparison: true,
    csvImport: true,
    basicPdf: true,
    multiLanguage: true,
    basicOvertrade: true,
    trades: true,
    strategies: true,
    basicCharts: true
  },
  premium: {
    label: '💎 Premium',
    maxTrades: Infinity,
    maxStrategies: Infinity,
    premiumDashboard: true,
    dragDropPanels: true,
    advancedCharts: true,
    themeCustomization: true,
    detailedPdf: true,
    newsPage: true,
    advancedOvertrade: true,
    multiCurrency: true,
    lightTheme: true,
    prioritySupport: true,
    noAds: true,
    infiniteStorage: true,
    community: true,
    calendar: true,
    monthlyGoal: true,
    strategyComparison: true,
    csvImport: true,
    basicPdf: true,
    multiLanguage: true,
    basicOvertrade: true,
    trades: true,
    strategies: true,
    basicCharts: true
  }
};

async function getUserPlan() {
  try {
    const user = await requireAuth();
    if (!user) return { plan: 'free', features: FEATURES.free };
    
    const { data, error } = await sb
      .from('user_profiles')
      .select('plan, plan_expires_at')
      .eq('id', user.id)
      .single();
    
    if (error || !data || data.plan === 'free') {
      return { plan: 'free', features: FEATURES.free };
    }
    
    if (data.plan === 'premium' && data.plan_expires_at) {
      const now = new Date();
      const expires = new Date(data.plan_expires_at);
      
      if (isNaN(expires.getTime())) {
        return { plan: 'free', features: FEATURES.free };
      }
      
      if (now > expires) {
        showToast(i18n.t('premium.expired'), 'info');
        return { plan: 'free', features: FEATURES.free };
      }
    }
    
    if (data.plan !== 'premium') {
      return { plan: 'free', features: FEATURES.free };
    }
    
    return { plan: data.plan, features: FEATURES.premium };
    
  } catch (error) {
    console.warn('getUserPlan hatası, free döndürülüyor:', error);
    return { plan: 'free', features: FEATURES.free };
  }
}

async function hasFeature(featureName) {
  const { features } = await getUserPlan();
  return features[featureName] === true;
}

async function isPremium() {
  const { plan } = await getUserPlan();
  return plan === 'premium';
}

async function requirePremium() {
  try {
    const user = await requireAuth();
    if (!user) return null;
    
    const { plan } = await getUserPlan();
    if (plan !== 'premium') {
      showToast('💎 Bu özellik sadece Premium üyelere özeldir!', 'error');
      window.location.href = 'settings.html#panel-plan';
      return null;
    }
    
    return user;
  } catch (error) {
    console.error('requirePremium hatası:', error);
    showToast('Bir hata oluştu. Lütfen tekrar deneyin.', 'error');
    window.location.href = 'settings.html';
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
// 💳 ÖDEME METODU SEÇİMİ
// ════════════════════════════════════════════════════════════════

let selectedPayMethod = safeLocalStorageGet('ww_pay_method', 'BTC');

function getSystemSettings() {
  try {
    const saved = safeLocalStorageGet('ww_system_settings', null);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {}
  return {
    currency: 'USD',
    language: 'en',
    theme: 'dark',
    payMethod: 'BTC'
  };
}

window.setYearlyDiscount = function(discountPercent) {
  safeLocalStorageSet('ww_yearly_discount', String(discountPercent));
  if (window.updateHomePrices) {
    window.updateHomePrices();
  }
};

function selectPayMethod(method) {
  selectedPayMethod = method;
  safeLocalStorageSet('ww_pay_method', method);
  document.querySelectorAll('.pay-method-btn').forEach(function(btn) {
    if (btn.dataset.method === method) {
      btn.classList.add('active');
      btn.style.border = '2px solid var(--accent)';
      btn.style.background = 'var(--accent)';
      btn.style.color = '#fff';
    } else {
      btn.classList.remove('active');
      btn.style.border = '2px solid var(--border)';
      btn.style.background = 'transparent';
      btn.style.color = 'var(--muted)';
    }
  });
}

// ════════════════════════════════════════════════════════════════
// 💳 ÖDEME - Edge Function ile (GÜVENLİ)
// ════════════════════════════════════════════════════════════════

async function createNowPaymentInvoice(userId, planType, amount, currency, payCurrency) {
  currency = currency || 'USD';
  payCurrency = payCurrency || 'BTC';
  
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      showToast('Oturumunuz sona ermiş, lütfen tekrar giriş yapın.', 'error');
      return null;
    }

    console.log('📤 createNowPaymentInvoice çağrıldı:', { userId, planType, amount, currency, payCurrency });

    const response = await fetch(
      'https://odasapyhtdopbnlfhwde.supabase.co/functions/v1/create-payment',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({
          userId: userId,
          planType: planType,
          amount: amount,
          currency: currency,
          payCurrency: payCurrency,
          successUrl: window.location.origin + '/dashboard.html',
          cancelUrl: window.location.origin + '/settings.html'
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ create-payment API hatası:', response.status, data);
      throw new Error(data.error || 'Ödeme başlatılamadı');
    }

    console.log('✅ create-payment başarılı:', data);
    return data;
  } catch (error) {
    console.error('❌ createNowPaymentInvoice hatası:', error);
    showToast('Ödeme başlatılamadı: ' + error.message, 'error');
    return null;
  }
}

// ⭐ upgradeToPremium - Edge Function kullanıyor
async function upgradeToPremium(planType, amount, currency, payMethod) {
  currency = currency || 'USD';
  
  try {
    const user = await requireAuth();
    if (!user) {
      showToast('Lütfen önce giriş yapın.', 'error');
      return null;
    }
    
    const method = payMethod || selectedPayMethod || 'BTC';
    showToast('💳 ' + method + ' ile ödeme sayfasına yönlendiriliyorsunuz...', 'info');
    
    const result = await createNowPaymentInvoice(
      user.id,
      planType,
      amount,
      currency,
      method
    );
    
    if (result && result.invoiceUrl) {
      window.location.href = result.invoiceUrl;
      return result;
    } else {
      showToast('Ödeme linki oluşturulamadı. Lütfen tekrar deneyin.', 'error');
      return null;
    }
  } catch (error) {
    console.error('upgradeToPremium hatası:', error);
    showToast('Ödeme başlatılamadı: ' + error.message, 'error');
    return null;
  }
}

async function cancelPremium() {
  try {
    const user = await requireAuth();
    if (!user) {
      showToast('Lütfen önce giriş yapın.', 'error');
      return false;
    }
    
    const { plan } = await getUserPlan();
    if (plan !== 'premium') {
      showToast('Zaten premium aboneliğiniz yok.', 'info');
      return true;
    }
    
    // NOWPayments is a one-time crypto payment. There is no recurring
    // subscription to cancel, and the browser must never change plan fields.
    showToast('Otomatik yenileme yok. Premium erişiminiz bitiş tarihine kadar devam eder.', 'info');
    return true;
  } catch (error) {
    console.error('cancelPremium hatası:', error);
    showToast('Abonelik iptal edilemedi: ' + error.message, 'error');
    return false;
  }
}

// ============================================================
// 📰 PREMIUM HABERLER
// ============================================================

let newsCache = null;
let newsCacheTime = 0;
const NEWS_CACHE_TTL = 3 * 60 * 1000;

const EVENT_CATEGORIES = {
  'employment': '💼 İstihdam',
  'inflation': '📈 Enflasyon',
  'gdp': '📊 GSYİH',
  'interest': '🏦 Faiz',
  'trade': '📦 Ticaret',
  'retail': '🛍 Perakende',
  'manufacturing': '🏭 Üretim',
  'consumer': '👤 Tüketici',
  'housing': '🏠 Konut',
  'central': '🏛 Merkez Bankası',
  'speech': '🎤 Konuşma',
  'other': '📰 Diğer'
};

const CURRENCY_ICONS = {
  'USD': '🇺🇸', 'EUR': '🇪🇺', 'GBP': '🇬🇧', 'JPY': '🇯🇵',
  'CAD': '🇨🇦', 'AUD': '🇦🇺', 'NZD': '🇳🇿', 'CHF': '🇨🇭',
  'CNY': '🇨🇳', 'BTC': '₿'
};

async function fetchPremiumNews(forceRefresh) {
  forceRefresh = forceRefresh || false;
  const now = Date.now();
  
  if (!forceRefresh && newsCache && (now - newsCacheTime) < NEWS_CACHE_TTL) {
    return newsCache;
  }
  
  try {
    const apiKey = WW_CONFIG.NEWS_API_KEY;
    const baseUrl = WW_CONFIG.NEWS_API_BASE_URL;
    
    if (!apiKey || apiKey === 'YOUR_NEWSAPI_KEY_HERE') {
      return getMockNews();
    }
    
    const listResponse = await fetch(baseUrl + '/list/', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Api-Key ' + apiKey
      }
    });
    
    if (!listResponse.ok) {
      throw new Error('API Hatası: ' + listResponse.status);
    }
    
    const listData = await listResponse.json();
    if (!listData || listData.length === 0) {
      return getMockNews();
    }
    
    const eventPromises = listData.slice(0, 8).map(async function(event) {
      try {
        const detailResponse = await fetch(baseUrl + '/info/?id=' + event.id, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Api-Key ' + apiKey
          }
        });
        if (!detailResponse.ok) return null;
        const detailData = await detailResponse.json();
        return { ...event, ...detailData };
      } catch (e) {
        return null;
      }
    });
    
    const eventDetails = await Promise.all(eventPromises);
    const validEvents = eventDetails.filter(function(e) { return e !== null; });
    if (validEvents.length === 0) {
      return getMockNews();
    }
    
    const news = validEvents.map(function(event) {
      const category = event.category || 'other';
      const categoryName = EVENT_CATEGORIES[category.toLowerCase()] || '📰 Finans';
      const currencyIcon = CURRENCY_ICONS[event.currency] || '';
      const eventDate = event.date ? new Date(event.date) : new Date();
      const timeAgo = getTimeAgo(eventDate);
      let title = currencyIcon + ' ' + (event.name || 'Ekonomik Veri');
      if (event.currency) title += ' (' + event.currency + ')';
      let description = '';
      if (event.actual) description += 'Gerçekleşen: ' + event.actual + ' | ';
      if (event.forecast) description += 'Tahmin: ' + event.forecast + ' | ';
      if (event.previous) description += 'Önceki: ' + event.previous;
      let outcomeText = '';
      if (event.outcome) {
        const outcome = event.outcome.toLowerCase();
        if (outcome === 'bullish') outcomeText = '📈 Yükseliş';
        else if (outcome === 'bearish') outcomeText = '📉 Düşüş';
        else if (outcome === 'neutral') outcomeText = '⚖️ Nötr';
        else outcomeText = event.outcome;
      }
      let sentimentText = '';
      if (event.sentiment) {
        const sent = event.sentiment.toLowerCase();
        if (sent === 'bullish') sentimentText = '🤖 Yükseliş Eğilimi';
        else if (sent === 'bearish') sentimentText = '🤖 Düşüş Eğilimi';
        else sentimentText = '🤖 Nötr';
      }
      return {
        id: event.id || Math.random().toString(36).substring(7),
        title: title,
        source: 'Forex Factory',
        time: timeAgo,
        category: categoryName,
        url: 'https://www.forexfactory.com/calendar?event=' + event.id,
        description: description,
        currency: event.currency || '',
        actual: event.actual || '',
        forecast: event.forecast || '',
        previous: event.previous || '',
        outcome: outcomeText,
        sentiment: sentimentText,
        strength: event.strength || '',
        quality: event.quality || '',
        projection: event.projection || '',
        date: eventDate
      };
    });
    
    newsCache = news;
    newsCacheTime = now;
    return news;
  } catch (error) {
    console.warn('fetchPremiumNews hatası, mock veri kullanılıyor:', error);
    return getMockNews();
  }
}

function getMockNews() {
  return [
    { id: '1', title: '🇺🇸 Fed Faiz Kararını Açıkladı: Piyasalar Hareketlendi', source: 'Forex Factory', time: '2 saat önce', category: '🏛 Merkez Bankası', url: '#', description: 'Faiz oranı %5.50 seviyesinde sabit kaldı.', outcome: '📈 Yükseliş', sentiment: '🤖 Yükseliş Eğilimi' },
    { id: '2', title: '🇺🇸 ABD Tarım Dışı İstihdam Verisi Açıklandı', source: 'Forex Factory', time: '4 saat önce', category: '💼 İstihdam', url: '#', description: 'Beklenti: 180K | Gerçekleşen: 220K', outcome: '📈 Yükseliş', sentiment: '🤖 Yükseliş Eğilimi' },
    { id: '3', title: '🇪🇺 Euro Bölgesi Enflasyon Verisi Beklentilerin Üzerinde', source: 'Forex Factory', time: '6 saat önce', category: '📈 Enflasyon', url: '#', description: 'TÜFE: %2.6 | Beklenti: %2.4', outcome: '📈 Yükseliş', sentiment: '🤖 Nötr' },
    { id: '4', title: '🇬🇧 İngiltere Merkez Bankası Faiz Kararını Duyurdu', source: 'Forex Factory', time: '8 saat önce', category: '🏛 Merkez Bankası', url: '#', description: 'Faiz oranı %5.25 seviyesinde kaldı.', outcome: '⚖️ Nötr', sentiment: '🤖 Nötr' },
    { id: '5', title: '🇯🇵 Japonya TÜFE Verisi Açıklandı', source: 'Forex Factory', time: '10 saat önce', category: '📈 Enflasyon', url: '#', description: 'Yıllık TÜFE: %2.8 | Beklenti: %2.7', outcome: '📈 Yükseliş', sentiment: '🤖 Yükseliş Eğilimi' },
    { id: '6', title: '🇨🇦 Kanada İşsizlik Oranı Verisi', source: 'Forex Factory', time: '12 saat önce', category: '💼 İstihdam', url: '#', description: 'İşsizlik oranı: %5.8 | Beklenti: %5.7', outcome: '📉 Düşüş', sentiment: '🤖 Düşüş Eğilimi' }
  ];
}

function getCategoryName(category) {
  return EVENT_CATEGORIES[category.toLowerCase()] || '📰 Finans';
}

function getTimeAgo(date) {
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return 'az önce';
  if (diff < 3600) {
    const mins = Math.floor(diff / 60);
    return mins + ' dakika önce';
  }
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return hours + ' saat önce';
  }
  if (diff < 604800) {
    const days = Math.floor(diff / 86400);
    return days + ' gün önce';
  }
  const weeks = Math.floor(diff / 604800);
  return weeks + ' hafta önce';
}

window.fetchPremiumNews = fetchPremiumNews;

// ════════════════════════════════════════════════════════════════
// 🔔 OVER TRADE SİSTEMİ
// ════════════════════════════════════════════════════════════════

const OT_STORAGE_KEY = 'ww_overtrade_settings';
const OT_DISMISSED_KEY = 'ww_overtrade_dismissed_v2';

window.getOvertradeSettings = function() {
  try {
    const saved = safeLocalStorageGet(OT_STORAGE_KEY, null);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        dailyLimit: parsed.dailyLimit ?? 5,
        weeklyLimit: parsed.weeklyLimit ?? 20,
        dailyLossLimit: parsed.dailyLossLimit ?? 1000,
        warningLevel: parsed.warningLevel ?? 'warning',
        enabled: parsed.enabled ?? true
      };
    }
  } catch (e) {
    console.warn('OverTrade ayarları okunamadı:', e);
  }
  return { dailyLimit: 5, weeklyLimit: 20, dailyLossLimit: 1000, warningLevel: 'warning', enabled: true };
};

window.saveOvertradeSettings = function(settings) {
  try {
    const current = window.getOvertradeSettings();
    const merged = { ...current, ...settings };
    safeLocalStorageSet(OT_STORAGE_KEY, JSON.stringify(merged));
    return true;
  } catch (e) {
    console.error('OverTrade ayarları kaydedilemedi:', e);
    return false;
  }
};

window.getDismissedOvertradeWarnings = function() {
  try {
    const saved = safeLocalStorageGet(OT_DISMISSED_KEY, '[]');
    return JSON.parse(saved);
  } catch (e) {
    return [];
  }
};

window.setDismissedOvertradeWarnings = function(dismissedArray) {
  try {
    safeLocalStorageSet(OT_DISMISSED_KEY, JSON.stringify(dismissedArray));
    return true;
  } catch (e) {
    return false;
  }
};

window.dismissOvertradeWarning = function(warningId) {
  try {
    if (!warningId) return false;
    const dismissed = window.getDismissedOvertradeWarnings();
    if (!dismissed.includes(warningId)) {
      dismissed.push(warningId);
      window.setDismissedOvertradeWarnings(dismissed);
    }
    const element = document.getElementById('ot-warning-' + warningId);
    if (element) {
      element.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      element.style.opacity = '0';
      element.style.transform = 'translateX(30px)';
      setTimeout(function() {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      }, 350);
    }
    return true;
  } catch (e) {
    console.error('Uyarı kapatılamadı:', e);
    return false;
  }
};

window.isOvertradeWarningDismissed = function(warningId) {
  try {
    if (!warningId) return false;
    const dismissed = window.getDismissedOvertradeWarnings();
    return dismissed.includes(warningId);
  } catch (e) {
    return false;
  }
};

window.clearDismissedOvertradeWarnings = function() {
  try {
    safeLocalStorageRemove(OT_DISMISSED_KEY);
    return true;
  } catch (e) {
    return false;
  }
};

window.checkOvertrade = function(trades) {
  try {
    if (!trades || !Array.isArray(trades) || trades.length === 0) {
      return [];
    }
    
    const settings = window.getOvertradeSettings();
    
    if (settings.enabled === false) {
      return [];
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    const todayTrades = trades.filter(function(t) { 
      return t.trade_date && t.trade_date === today; 
    });
    const todayCount = todayTrades.length;
    
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekTrades = trades.filter(function(t) { 
      return t.trade_date && new Date(t.trade_date) >= weekAgo; 
    });
    const weekCount = weekTrades.length;
    
    let todayPnL = 0;
    todayTrades.forEach(function(t) {
      if (t.exit_price && t.entry_price && t.lot) {
        const multiplier = t.multiplier || INSTRUMENT_MULTIPLIERS[t.instrument] || 100000;
        const pnl = calcPnL(t.entry_price, t.exit_price, t.lot, t.direction, 'other', multiplier);
        if (!isNaN(pnl)) {
          todayPnL += pnl;
        }
      }
    });
    
    const warnings = [];
    const baseId = 'ot_' + Date.now() + '_';
    
    if (todayCount > settings.dailyLimit) {
      const id = baseId + 'daily_' + todayCount + '_' + settings.dailyLimit;
      if (!window.isOvertradeWarningDismissed(id)) {
        warnings.push({
          id: id,
          level: settings.warningLevel || 'warning',
          type: 'daily_trades',
          current: todayCount,
          limit: settings.dailyLimit,
          message: (typeof i18n !== 'undefined' && i18n.t) 
            ? i18n.t('overtrade.daily_limit_warning', { current: todayCount, limit: settings.dailyLimit }) 
            : 'Bugün ' + todayCount + ' işlem yaptın. Günlük limitin ' + settings.dailyLimit + '!'
        });
      }
    }
    
    if (weekCount > settings.weeklyLimit) {
      const id = baseId + 'weekly_' + weekCount + '_' + settings.weeklyLimit;
      if (!window.isOvertradeWarningDismissed(id)) {
        warnings.push({
          id: id,
          level: settings.warningLevel || 'warning',
          type: 'weekly_trades',
          current: weekCount,
          limit: settings.weeklyLimit,
          message: (typeof i18n !== 'undefined' && i18n.t) 
            ? i18n.t('overtrade.weekly_limit_warning', { current: weekCount, limit: settings.weeklyLimit }) 
            : 'Bu hafta ' + weekCount + ' işlem yaptın. Haftalık limitin ' + settings.weeklyLimit + '!'
        });
      }
    }
    
    if (todayPnL < -settings.dailyLossLimit) {
      const id = baseId + 'loss_' + Math.abs(Math.round(todayPnL)) + '_' + settings.dailyLossLimit;
      if (!window.isOvertradeWarningDismissed(id)) {
        warnings.push({
          id: id,
          level: 'danger',
          type: 'daily_loss',
          current: todayPnL,
          limit: settings.dailyLossLimit,
          message: (typeof i18n !== 'undefined' && i18n.t) 
            ? i18n.t('overtrade.daily_loss_warning', { loss: window.formatCurrency ? window.formatCurrency(todayPnL) : todayPnL, limit: settings.dailyLossLimit }) 
            : 'Bugün ' + (window.formatCurrency ? window.formatCurrency(todayPnL) : todayPnL) + ' kaybettin. Günlük kayıp limitin $' + settings.dailyLossLimit + '!'
        });
      }
    }
    
    return warnings;
    
  } catch (error) {
    console.error('checkOvertrade hatası:', error);
    return [];
  }
};

window.renderOvertradeWarning = function(warnings, containerId) {
  try {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn('renderOvertradeWarning: container bulunamadı:', containerId);
      return;
    }
    
    container.innerHTML = '';
    
    if (!warnings || !Array.isArray(warnings) || warnings.length === 0) {
      container.innerHTML = `
        <div class="ot-good" style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 1rem;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.15);border-radius:8px;animation:fadeIn 0.3s ease;">
          <span style="font-size:1.2rem;">✅</span>
          <div>
            <strong style="color:var(--green);">${(typeof i18n !== 'undefined' && i18n.t) ? i18n.t('overtrade.all_good') : 'Her şey yolunda!'}</strong>
            <p style="font-size:12px;color:var(--muted);margin:0;">${(typeof i18n !== 'undefined' && i18n.t) ? i18n.t('overtrade.all_good_desc') : 'Tüm limitlerin içindesin.'}</p>
          </div>
        </div>
      `;
      return;
    }
    
    const levelColors = {
      info: { bg: 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.15)', text: '#3b82f6', icon: 'ℹ️' },
      warning: { bg: 'rgba(251,191,36,0.06)', border: 'rgba(251,191,36,0.15)', text: '#f59e0b', icon: '⚠️' },
      danger: { bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.15)', text: '#ef4444', icon: '🚨' }
    };
    
    const levelLabels = { 
      info: (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('overtrade.info') : 'Bilgi', 
      warning: (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('overtrade.warning') : 'Uyarı', 
      danger: (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('overtrade.danger') : 'Tehlike' 
    };
    
    const typeLabels = { 
      daily_trades: (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('overtrade.daily_trades') : 'Günlük İşlem', 
      weekly_trades: (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('overtrade.weekly_trades') : 'Haftalık İşlem', 
      daily_loss: (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('overtrade.loss') : 'Kayıp' 
    };
    
    warnings.forEach(function(w) {
      const color = levelColors[w.level] || levelColors.warning;
      const warningId = w.id || 'ot_warning_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      
      const card = document.createElement('div');
      card.id = 'ot-warning-' + warningId;
      card.style.cssText = `
        display:flex;
        align-items:flex-start;
        gap:0.75rem;
        padding:0.75rem 1rem;
        background:${color.bg};
        border:1px solid ${color.border};
        border-radius:8px;
        margin-bottom:0.5rem;
        animation:slideDown 0.3s ease;
        transition:opacity 0.3s ease, transform 0.3s ease;
      `;
      
      card.innerHTML = `
        <span style="font-size:1.2rem;flex-shrink:0;margin-top:2px;">${color.icon || '⚠️'}</span>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
            <strong style="color:${color.text};font-size:13px;">${w.message || 'Uyarı'}</strong>
            <span style="font-size:9px;font-weight:600;font-family:'DM Mono',monospace;background:${color.bg};color:${color.text};padding:0.1rem 0.5rem;border-radius:10px;border:1px solid ${color.border};flex-shrink:0;">
              ${levelLabels[w.level] || 'Uyarı'}
            </span>
          </div>
          <div style="display:flex;gap:1rem;font-size:11px;color:var(--muted);margin-top:4px;flex-wrap:wrap;">
            <span>📊 ${w.current || 0} / ${w.limit || 0}</span>
            <span>📅 ${typeLabels[w.type] || w.type || 'Genel'}</span>
          </div>
        </div>
        <button onclick="window.dismissOvertradeWarning('${warningId}')" 
                style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;flex-shrink:0;padding:4px 6px;border-radius:4px;transition:background 0.2s;"
                onmouseover="this.style.background='var(--surface)'" 
                onmouseout="this.style.background='transparent'"
                aria-label="Uyarıyı kapat">
          ✕
        </button>
      `;
      
      container.appendChild(card);
    });
    
    if (!document.getElementById('ot-animations')) {
      const style = document.createElement('style');
      style.id = 'ot-animations';
      style.textContent = `
        @keyframes slideDown { 
          from { opacity: 0; transform: translateY(-10px); } 
          to { opacity: 1; transform: translateY(0); } 
        }
        @keyframes fadeIn { 
          from { opacity: 0; } 
          to { opacity: 1; } 
        }
      `;
      document.head.appendChild(style);
    }
    
  } catch (error) {
    console.error('renderOvertradeWarning hatası:', error);
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = `
        <div style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 1rem;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:8px;">
          <span style="font-size:1.2rem;">⚠️</span>
          <div>
            <strong style="color:var(--red);">Uyarı sistemi geçici olarak kullanılamıyor</strong>
            <p style="font-size:12px;color:var(--muted);margin:0;">Lütfen daha sonra tekrar deneyin.</p>
          </div>
        </div>
      `;
    }
  }
};

// ⭐ Sessiz OverTrade kontrolü - yönlendirme YAPMAZ
window.checkAndRenderOvertrade = async function(containerId) {
  try {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn('checkAndRenderOvertrade: container bulunamadı:', containerId);
      return;
    }
    
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      container.innerHTML = '';
      return;
    }
    
    // Sessiz plan kontrolü - yönlendirme yapmaz
    const { plan } = await getUserPlanSilent();
    if (plan !== 'premium') {
      container.innerHTML = '';
      return;
    }
    
    const { data: trades, error } = await sb
      .from('trades')
      .select('*')
      .eq('user_id', session.user.id)
      .order('trade_date', { ascending: false });
    
    if (error) {
      console.error('checkAndRenderOvertrade: işlemler alınamadı:', error);
      container.innerHTML = '';
      return;
    }
    
    const warnings = window.checkOvertrade(trades || []);
    window.renderOvertradeWarning(warnings, containerId);
    
  } catch (error) {
    console.error('checkAndRenderOvertrade hatası:', error);
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = '';
    }
  }
};

window.loadOvertradeSettingsUI = async function(containerId) {
  try {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Sessiz plan kontrolü - yönlendirme yapmaz
    const { plan } = await getUserPlanSilent();
    const isPremiumUser = plan === 'premium';
    
    if (!isPremiumUser) {
      container.innerHTML = `
        <div style="text-align:center;padding:2rem;background:var(--surface2);border-radius:var(--radius);border:1px solid var(--border);">
          <div style="font-size:2.5rem;margin-bottom:0.75rem;">💎</div>
          <h3 style="font-family:'Syne',sans-serif;font-size:1rem;color:var(--text);margin-bottom:0.5rem;">OverTrade Uyarıları</h3>
          <p style="color:var(--muted);font-size:13px;max-width:400px;margin:0 auto 1rem;">Bu özellik sadece Premium üyelere özeldir. İşlem limitlerini ve kayıp kontrollerini yaparak daha disiplinli ticaret yapın.</p>
          <a href="settings.html#panel-plan" class="btn btn-primary" style="display:inline-flex;">Premium'a Geç →</a>
        </div>
      `;
      return;
    }
    
    const settings = window.getOvertradeSettings();
    
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:1.25rem;">
        <div style="display:flex;align-items:center;gap:0.75rem;">
          <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;font-size:13px;color:var(--text);">
            <input type="checkbox" id="ot-enabled" ${settings.enabled !== false ? 'checked' : ''} style="accent-color:var(--accent);width:18px;height:18px;cursor:pointer;">
            OverTrade Uyarılarını Aktif Et
          </label>
        </div>
        
        <div class="field" style="margin:0;">
          <label style="font-size:13px;font-weight:500;color:var(--text);">Günlük İşlem Limiti</label>
          <div style="display:flex;align-items:center;gap:0.75rem;margin-top:4px;">
            <input type="number" id="ot-daily-limit" value="${settings.dailyLimit || 5}" min="1" max="100" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:0.5rem 0.75rem;color:var(--text);font-family:'DM Mono',monospace;font-size:13px;width:100px;">
            <span style="font-size:12px;color:var(--muted);">işlem</span>
          </div>
          <p style="font-size:11px;color:var(--muted);margin-top:4px;">Bu limiti aştığında uyarı alırsın.</p>
        </div>
        
        <div class="field" style="margin:0;">
          <label style="font-size:13px;font-weight:500;color:var(--text);">Haftalık İşlem Limiti</label>
          <div style="display:flex;align-items:center;gap:0.75rem;margin-top:4px;">
            <input type="number" id="ot-weekly-limit" value="${settings.weeklyLimit || 20}" min="1" max="500" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:0.5rem 0.75rem;color:var(--text);font-family:'DM Mono',monospace;font-size:13px;width:100px;">
            <span style="font-size:12px;color:var(--muted);">işlem</span>
          </div>
          <p style="font-size:11px;color:var(--muted);margin-top:4px;">Bu limiti aştığında uyarı alırsın.</p>
        </div>
        
        <div class="field" style="margin:0;">
          <label style="font-size:13px;font-weight:500;color:var(--text);">Günlük Kayıp Limiti</label>
          <div style="display:flex;align-items:center;gap:0.75rem;margin-top:4px;">
            <span style="font-size:12px;color:var(--muted);">$</span>
            <input type="number" id="ot-loss-limit" value="${settings.dailyLossLimit || 1000}" min="1" max="999999" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:0.5rem 0.75rem;color:var(--text);font-family:'DM Mono',monospace;font-size:13px;width:100px;">
          </div>
          <p style="font-size:11px;color:var(--muted);margin-top:4px;">Bu limiti aştığında uyarı alırsın.</p>
        </div>
        
        <div class="field" style="margin:0;">
          <label style="font-size:13px;font-weight:500;color:var(--text);">Uyarı Seviyesi</label>
          <select id="ot-warning-level" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:0.5rem 0.75rem;color:var(--text);font-family:'DM Mono',monospace;font-size:13px;margin-top:4px;">
            <option value="info" ${settings.warningLevel === 'info' ? 'selected' : ''}>ℹ️ Bilgi</option>
            <option value="warning" ${settings.warningLevel === 'warning' ? 'selected' : ''}>⚠️ Uyarı</option>
            <option value="danger" ${settings.warningLevel === 'danger' ? 'selected' : ''}>🚨 Tehlike</option>
          </select>
        </div>
        
        <button id="ot-save-settings" class="btn btn-primary" style="align-self:flex-start;display:inline-flex;gap:0.5rem;align-items:center;">
          💾 Ayarları Kaydet
        </button>
        
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-top:0.5rem;padding-top:0.75rem;border-top:1px solid var(--border);">
          <button id="ot-clear-dismissed" class="btn btn-ghost" style="font-size:12px;padding:0.4rem 0.8rem;">
            🗑️ Kapatılan Uyarıları Temizle
          </button>
          <button id="ot-reset-defaults" class="btn btn-ghost" style="font-size:12px;padding:0.4rem 0.8rem;">
            ↺ Varsayılana Dön
          </button>
        </div>
      </div>
    `;
    
    const enabledCheckbox = document.getElementById('ot-enabled');
    const dailyLimitInput = document.getElementById('ot-daily-limit');
    const weeklyLimitInput = document.getElementById('ot-weekly-limit');
    const lossLimitInput = document.getElementById('ot-loss-limit');
    const warningLevelSelect = document.getElementById('ot-warning-level');
    const saveBtn = document.getElementById('ot-save-settings');
    const clearBtn = document.getElementById('ot-clear-dismissed');
    const resetBtn = document.getElementById('ot-reset-defaults');
    
    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        const newSettings = {
          enabled: enabledCheckbox ? enabledCheckbox.checked : true,
          dailyLimit: parseInt(dailyLimitInput?.value) || 5,
          weeklyLimit: parseInt(weeklyLimitInput?.value) || 20,
          dailyLossLimit: parseFloat(lossLimitInput?.value) || 1000,
          warningLevel: warningLevelSelect?.value || 'warning'
        };
        
        window.saveOvertradeSettings(newSettings);
        showToast('✅ OverTrade ayarları kaydedildi!', 'success');
        
        const otContainer = document.getElementById('overtrade-container');
        if (otContainer) {
          window.checkAndRenderOvertrade('overtrade-container');
        }
      });
    }
    
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        window.clearDismissedOvertradeWarnings();
        showToast('🗑️ Kapatılan uyarılar temizlendi.', 'success');
        const otContainer = document.getElementById('overtrade-container');
        if (otContainer) {
          window.checkAndRenderOvertrade('overtrade-container');
        }
      });
    }
    
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        const defaultSettings = { dailyLimit: 5, weeklyLimit: 20, dailyLossLimit: 1000, warningLevel: 'warning', enabled: true };
        window.saveOvertradeSettings(defaultSettings);
        showToast('↺ Varsayılan ayarlara döndürüldü.', 'success');
        window.loadOvertradeSettingsUI(containerId);
        const otContainer = document.getElementById('overtrade-container');
        if (otContainer) {
          window.checkAndRenderOvertrade('overtrade-container');
        }
      });
    }
    
  } catch (error) {
    console.error('loadOvertradeSettingsUI hatası:', error);
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = `
        <div style="text-align:center;padding:1.5rem;background:var(--surface2);border-radius:var(--radius);border:1px solid var(--border);">
          <p style="color:var(--muted);font-size:13px;">Ayarlar yüklenirken bir hata oluştu.</p>
          <button onclick="window.loadOvertradeSettingsUI('${containerId}')" class="btn btn-ghost" style="margin-top:0.5rem;">🔄 Yeniden Dene</button>
        </div>
      `;
    }
  }
};

document.addEventListener('DOMContentLoaded', function() {
  const otContainer = document.getElementById('overtrade-container');
  if (otContainer) {
    setTimeout(function() {
      window.checkAndRenderOvertrade('overtrade-container');
    }, 500);
  }
  
  const otSettingsContainer = document.getElementById('overtrade-settings-container');
  if (otSettingsContainer) {
    setTimeout(function() {
      window.loadOvertradeSettingsUI('overtrade-settings-container');
    }, 600);
  }
});

window.selectPayMethod = selectPayMethod;
window.getOvertradeSettings = getOvertradeSettings;
window.saveOvertradeSettings = saveOvertradeSettings;
window.checkOvertrade = checkOvertrade;
window.renderOvertradeWarning = renderOvertradeWarning;
window.checkAndRenderOvertrade = checkAndRenderOvertrade;
window.dismissOvertradeWarning = dismissOvertradeWarning;
window.isOvertradeWarningDismissed = isOvertradeWarningDismissed;
window.clearDismissedOvertradeWarnings = clearDismissedOvertradeWarnings;
window.getDismissedOvertradeWarnings = getDismissedOvertradeWarnings;
window.setDismissedOvertradeWarnings = setDismissedOvertradeWarnings;
window.loadOvertradeSettingsUI = loadOvertradeSettingsUI;

// ════════════════════════════════════════════════════════════════
// ⭐ PLAN FİYATLARI
// ════════════════════════════════════════════════════════════════

window.getMonthlyPrice = function() {
  try {
    const saved = safeLocalStorageGet('ww_monthly_price', null);
    if (saved) return parseFloat(saved);
  } catch(e) {}
  return WW_CONFIG.DEFAULT_PRICES?.monthly || 9.00;
};

window.getYearlyPrice = function() {
  try {
    const saved = safeLocalStorageGet('ww_yearly_price', null);
    if (saved) return parseFloat(saved);
  } catch(e) {}
  return WW_CONFIG.DEFAULT_PRICES?.yearly || 79.00;
};

window.setMonthlyPrice = function(price) {
  safeLocalStorageSet('ww_monthly_price', String(price));
  window.updateHomePrices();
};

window.setYearlyPrice = function(price) {
  safeLocalStorageSet('ww_yearly_price', String(price));
  window.updateHomePrices();
};

let homePriceUpdateTimeout = null;

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

window.updateHomePrices = function() {
  if (homePriceUpdateTimeout) {
    cancelAnimationFrame(homePriceUpdateTimeout);
  }
  
  homePriceUpdateTimeout = requestAnimationFrame(function() {
    try {
      const monthlyPrice = window.getMonthlyPrice();
      const yearlyPrice = window.getYearlyPrice();
      
      const monthlyEl = document.getElementById('monthly-price-value');
      if (monthlyEl) {
        monthlyEl.textContent = monthlyPrice.toFixed(2);
        monthlyEl.style.fontSize = '2.8rem';
        monthlyEl.style.fontWeight = '700';
        monthlyEl.style.display = 'inline-block';
        monthlyEl.style.color = 'var(--text)';
      }
      
      const yearlyEl = document.getElementById('yearly-price-value');
      if (yearlyEl) {
        yearlyEl.textContent = yearlyPrice.toFixed(2);
        yearlyEl.style.fontSize = '2.8rem';
        yearlyEl.style.fontWeight = '700';
        yearlyEl.style.display = 'inline-block';
        yearlyEl.style.color = 'var(--text)';
      }
      
      const saveEl = document.getElementById('yearly-save-text');
      if (saveEl) {
        const monthlyFull = monthlyPrice * 12;
        if (monthlyFull > 0) {
          const discount = Math.round(((monthlyFull - yearlyPrice) / monthlyFull) * 100);
          let text = '';
          try {
            const lang = window.i18n ? i18n.getCurrentLanguage() : 'en';
            if (lang === 'tr') text = '🎯 %' + discount + ' tasarruf et!';
            else if (lang === 'de') text = '🎯 ' + discount + '% sparen!';
            else text = '🎯 Save ' + discount + '%!';
          } catch(e) {
            text = '🎯 Save ' + discount + '%!';
          }
          saveEl.textContent = text;
          saveEl.style.fontSize = '13px';
          saveEl.style.fontWeight = '600';
          saveEl.style.color = '#7c6dfa';
        }
      }
    } catch (error) {}
  });
};

window.addEventListener('storage', function(e) {
  if (e.key === 'ww_monthly_price' || e.key === 'ww_yearly_price' || e.key === 'ww_prices') {
    if (window.updateHomePrices) {
      window.updateHomePrices();
    }
  }
});

document.addEventListener('DOMContentLoaded', function() {
  setTimeout(window.updateHomePrices, 300);
});

if (window.i18n && i18n.onChange) {
  i18n.onChange(function() {
    setTimeout(window.updateHomePrices, 200);
  });
}

window.adminUpdatePrices = function(monthly, yearly) {
  window.setMonthlyPrice(monthly);
  window.setYearlyPrice(yearly);
  window.updateHomePrices();
  showToast('✅ Fiyatlar güncellendi!', 'success');
};

window.resetPrices = function() {
  window.setMonthlyPrice(WW_CONFIG.DEFAULT_PRICES?.monthly || 9.00);
  window.setYearlyPrice(WW_CONFIG.DEFAULT_PRICES?.yearly || 79.00);
  window.updateHomePrices();
  showToast('↺ Fiyatlar varsayılana döndürüldü!', 'success');
};

window.debounce = debounce;
window.throttle = throttle;

window.getInstrumentMultiplier = function(instrument) {
  return INSTRUMENT_MULTIPLIERS[instrument] || 1;
};

// ════════════════════════════════════════════════════════════════
// 🔔 BİLDİRİM SİSTEMİ
// ════════════════════════════════════════════════════════════════

const NOTIFICATION_STORAGE_KEY = 'ww_notifications';

// Bildirim tipleri
const NOTIFICATION_TYPES = {
  OVERTRADE_WARNING: 'overtrade_warning',
  OVERTRADE_CRITICAL: 'overtrade_critical',
  PREMIUM_EXPIRING: 'premium_expiring',
  PREMIUM_EXPIRED: 'premium_expired',
  PREMIUM_UPGRADED: 'premium_upgraded',
  SYSTEM: 'system'
};

// Bildirim sınıfı
class NotificationManager {
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
        // Eski bildirimleri temizle (7 günden eski)
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
    // Maksimum 100 bildirim tut
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
    // Her 10 dakikada bir eski bildirimleri temizle
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

  // ⭐ Özel bildirim oluşturucular
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

  // ⭐ Over Trade uyarılarını kontrol et ve bildirim ekle (SESSİZ - yönlendirme yapmaz)
  async checkAndNotifyOvertrade() {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      
      // Sessiz plan kontrolü
      const { plan } = await getUserPlanSilent();
      if (plan !== 'premium') return;
      
      const { data: trades, error } = await sb
        .from('trades')
        .select('*')
        .eq('user_id', session.user.id)
        .order('trade_date', { ascending: false });
      
      if (error) return;
      
      const warnings = window.checkOvertrade(trades || []);
      if (warnings && warnings.length > 0) {
        this.addOvertradeWarning(warnings);
      }
    } catch (e) {
      // Sessizce geç
    }
  }

  // ⭐ Premium süresini kontrol et ve bildirim ekle (SESSİZ - yönlendirme yapmaz)
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
      
      // Bildirim zaten var mı kontrol et
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
    } catch (e) {
      // Sessizce geç
    }
  }

  // ⭐ Tüm bildirimleri kontrol et (periyodik) - SESSİZ
  async checkAll() {
    await this.checkAndNotifyOvertrade();
    await this.checkAndNotifyPremiumExpiry();
  }
}

// Global notification manager
window.notificationManager = new NotificationManager();

// ⭐ Bildirim UI güncellemesi - notification-bell.html ile entegrasyon
window.updateNotificationUI = function() {
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
  
  // Panel içeriğini güncelle
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
};

// ⭐ Zaman formatı yardımcısı
function getTimeAgoSimple(timestamp) {
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

// ⭐ Bildirimleri kapat
window.dismissNotification = function(id) {
  window.notificationManager.markAsRead(id);
  window.updateNotificationUI();
};

// ⭐ Tüm bildirimleri temizle
window.clearAllNotifications = function() {
  window.notificationManager.clearAll();
  window.updateNotificationUI();
};

// ⭐ Bildirim panelini aç/kapat
window.toggleNotificationPanel = function() {
  const panel = document.getElementById('notifPanel');
  if (panel) {
    panel.classList.toggle('open');
    // Açıldığında tüm bildirimleri okundu işaretle
    if (panel.classList.contains('open')) {
      window.notificationManager.markAllAsRead();
      window.updateNotificationUI();
    }
  }
};

// ⭐ Bildirim butonuna tıkla
document.addEventListener('DOMContentLoaded', function() {
  const bell = document.getElementById('notifBell');
  if (bell) {
    bell.addEventListener('click', function(e) {
      e.stopPropagation();
      window.toggleNotificationPanel();
    });
  }
  
  // Dışarı tıklandığında paneli kapat
  document.addEventListener('click', function(e) {
    const panel = document.getElementById('notifPanel');
    const bell = document.getElementById('notifBell');
    if (panel && panel.classList.contains('open')) {
      if (!panel.contains(e.target) && !bell.contains(e.target)) {
        panel.classList.remove('open');
      }
    }
  });
  
  // Temizle butonu
  const clearBtn = document.getElementById('notifClearAll');
  if (clearBtn) {
    clearBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (confirm('Tüm bildirimleri temizlemek istediğinize emin misiniz?')) {
        window.clearAllNotifications();
      }
    });
  }
  
  // İlk UI güncellemesi
  setTimeout(window.updateNotificationUI, 300);
  
  // Bildirim değişikliklerini dinle
  window.notificationManager.onUpdate(function() {
    window.updateNotificationUI();
  });
  
  // Periyodik bildirim kontrolü (her 5 dakika) - SESSİZ
  setInterval(() => {
    window.notificationManager.checkAll();
  }, 5 * 60 * 1000);
  
  // İlk kontrol (3 saniye sonra) - SESSİZ
  setTimeout(() => {
    window.notificationManager.checkAll();
  }, 3000);
});


// Dışa aktarılan fonksiyonlar
window.NotificationManager = NotificationManager;
window.NOTIFICATION_TYPES = NOTIFICATION_TYPES;

console.log('✅ Wawe Journal script loaded! (Bildirim sistemi aktif)');


// ============================================================
// ⭐ GLOBAL FONKSİYONLARI window'a ATA - dashboard.js için
// ============================================================
window.requireAuth = requireAuth;
window.requireAuthSilent = requireAuthSilent;
window.requireAdmin = requireAdmin;
window.isAdmin = isAdmin;
window.calcPnL = calcPnL;
window.calcRR = calcRR;
window.formatCurrency = formatCurrency;
window.formatCurrencyPDF = formatCurrencyPDF;
window.showToast = showToast;
window.getUserPlan = getUserPlan;
window.getUserPlanSilent = getUserPlanSilent;
window.getStrategiesMap = getStrategiesMap;
window.sanitizeHTML = sanitizeHTML; // ⭐ ARTIK TANIMLI!
window.escapeHtml = escapeHtml;
window.getCurrencySymbol = getCurrencySymbol;
window.setCurrencySymbol = setCurrencySymbol;
window.applyDecimalFix = applyDecimalFix;
window.selectPayMethod = selectPayMethod;
window.checkOvertrade = checkOvertrade;
window.renderOvertradeWarning = renderOvertradeWarning;
window.dismissOvertradeWarning = dismissOvertradeWarning;
window.checkAndRenderOvertrade = checkAndRenderOvertrade;
window.loadOvertradeSettingsUI = loadOvertradeSettingsUI;
window.getOvertradeSettings = getOvertradeSettings;
window.saveOvertradeSettings = saveOvertradeSettings;
window.clearDismissedOvertradeWarnings = clearDismissedOvertradeWarnings;
window.isOvertradeWarningDismissed = isOvertradeWarningDismissed;
window.dismissNotification = dismissNotification;
window.clearAllNotifications = clearAllNotifications;
window.toggleNotificationPanel = toggleNotificationPanel;
window.updateNotificationUI = updateNotificationUI;
window.debounce = debounce;
window.throttle = throttle;
window.upgradeToPremium = upgradeToPremium;
window.cancelPremium = cancelPremium;
window.isPremium = isPremium;
window.hasFeature = hasFeature;
window.createNowPaymentInvoice = createNowPaymentInvoice;
window.loadReferencesToPage = loadReferencesToPage;
window.uploadReferenceImage = uploadReferenceImage;
window.fetchPremiumNews = fetchPremiumNews;
window.getSystemSettings = getSystemSettings;
window.getThemeSettings = getThemeSettings;
window.saveThemeSettings = saveThemeSettings;
window.applyThemeSettings = applyThemeSettings;
window.loadFontSize = loadFontSize;
window.applyFontSize = applyFontSize;
window.loadThemeCustomization = loadThemeCustomization;
window.canCustomizeTheme = canCustomizeTheme;
window.getUserStrategies = getUserStrategies;
window.clearStrategiesCache = clearStrategiesCache;
window.addStrategy = addStrategy;
window.deleteStrategy = deleteStrategy;
window.updateStrategy = updateStrategy;
window.calculateStrategyPerformance = calculateStrategyPerformance;
window.getInstrumentMultiplier = getInstrumentMultiplier;
window.loadPlatformStats = loadPlatformStats;
window.NotificationManager = NotificationManager;
window.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
window.sb = sb;
window.WW_CONFIG = WW_CONFIG;

console.log('✅ Tüm global fonksiyonlar window\'a atandı!');
console.log('📦 requireAuth:', typeof window.requireAuth === 'function' ? '✅' : '❌');
console.log('🔑 sb:', window.sb ? '✅' : '❌');
console.log('🧹 sanitizeHTML:', typeof window.sanitizeHTML === 'function' ? '✅' : '❌');