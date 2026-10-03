// ============================================================
// WAWE JOURNAL - SUPABASE
// ============================================================

import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from './storage.js';
import { ACTIVE_THROTTLE_MS } from './config.js';
import { showToast } from '../utils/ui.js';

// ── SUPABASE BAĞLANTISI ─────────────────────────────────────
if (typeof WW_CONFIG === 'undefined') {
  console.error('❌ WW_CONFIG tanımlı değil! config.js yüklenmedi.');
  window.WW_CONFIG = {
    SUPABASE_URL: 'https://odasapyhtdopbnlfhwde.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kYXNhcHlodGRvcGJubGZod2RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NDk0NjgsImV4cCI6MjA5NDAyNTQ2OH0.AH7V9i61pFWj33sCy51khdYHZn34BNitXY9exJySmWg'
  };
}

// ── SUPABASE CLIENT ──────────────────────────────────────────
if (typeof window.sb === 'undefined') {
  const { createClient } = supabase;
  window.sb = createClient(WW_CONFIG.SUPABASE_URL, WW_CONFIG.SUPABASE_ANON_KEY);
}
export const sb = window.sb;

// ── AUTH FONKSİYONLARI ──────────────────────────────────────
let _profilePromise = null;
export async function getUserProfileCached(userId, force = false) {
  if (!force && window.__wwUserProfile && window.__wwUserProfile.id === userId) {
    return window.__wwUserProfile;
  }
  if (!force) {
    try {
      const cached = sessionStorage.getItem('ww_cached_profile');
      const time = sessionStorage.getItem('ww_cached_profile_time');
      if (cached && time && (Date.now() - parseInt(time, 10)) < 180000) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.id === userId) {
          window.__wwUserProfile = parsed;
          return parsed;
        }
      }
    } catch(e) {}
  }

  if (_profilePromise) return _profilePromise;

  _profilePromise = (async () => {
    try {
      const { data, error } = await sb
        .from('user_profiles')
        .select('id, is_active, plan, plan_expires_at, avatar_url')
        .eq('id', userId)
        .single();
      if (!error && data) {
        window.__wwUserProfile = data;
        try {
          sessionStorage.setItem('ww_cached_profile', JSON.stringify(data));
          sessionStorage.setItem('ww_cached_profile_time', String(Date.now()));
          sessionStorage.setItem('ww_user_plan', data.plan || 'free');
          sessionStorage.setItem('ww_user_plan_time', String(Date.now()));
          sessionStorage.setItem('ww_avatar_url', data.avatar_url || 'none');
          sessionStorage.setItem('ww_avatar_time', String(Date.now()));
        } catch(e) {}
      }
      return data || null;
    } finally {
      _profilePromise = null;
    }
  })();

  return _profilePromise;
}

export async function requireAuth() {
  try {
    let session = null;
    const hasOAuthParams = typeof window !== 'undefined' && (
      window.location.hash.includes('access_token') ||
      window.location.search.includes('code=') ||
      window.location.hash.includes('type=recovery')
    );

    // ⭐ OAuth yönlendirmesi durumunda Supabase'in oturumu URL'den okuması için bekle
    if (hasOAuthParams) {
      for (let i = 0; i < 20; i++) {
        const { data } = await sb.auth.getSession();
        if (data?.session) {
          session = data.session;
          break;
        }
        await new Promise(r => setTimeout(r, 150));
      }
      // URL hash'ini temizle
      if (session && window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }

    if (!session) {
      const { data } = await sb.auth.getSession();
      session = data?.session;
    }

    if (!session) { 
      window.location.href = 'login.html'; 
      return null; 
    }
    
    let profile = await getUserProfileCached(session.user.id);
    
    // Yeni OAuth kayıtlarında DB trigger gecikmesine karşı tolerans
    if (!profile) {
      await new Promise(r => setTimeout(r, 500));
      profile = await getUserProfileCached(session.user.id, true);
    }
    
    // SADECE aktiflik açıkça false yapılmışsa hesabı kapat
    if (profile && profile.is_active === false) {
      await sb.auth.signOut();
      safeLocalStorageRemove('ww_last_active_push');
      showToast(i18n.t('auth.account_disabled'), 'error');
      window.location.href = 'index.html';
      return null;
    }
    
    throttledUpdateLastActive(session.user).catch(() => {});
    return session.user;
  } catch (error) {
    console.error('requireAuth hatası:', error);
    return null;
  }
}

export async function requireAuthSilent() {
  try {
    let session = null;
    const hasOAuthParams = typeof window !== 'undefined' && (
      window.location.hash.includes('access_token') ||
      window.location.search.includes('code=') ||
      window.location.hash.includes('type=recovery')
    );

    if (hasOAuthParams) {
      for (let i = 0; i < 20; i++) {
        const { data } = await sb.auth.getSession();
        if (data?.session) {
          session = data.session;
          break;
        }
        await new Promise(r => setTimeout(r, 150));
      }
      if (session && window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }

    if (!session) {
      const { data } = await sb.auth.getSession();
      session = data?.session;
    }

    if (!session) return null;
    
    const profile = await getUserProfileCached(session.user.id);
    
    if (profile && profile.is_active === false) {
      await sb.auth.signOut();
      safeLocalStorageRemove('ww_last_active_push');
      return null;
    }
    
    throttledUpdateLastActive(session.user).catch(() => {});
    return session.user;
  } catch (error) {
    return null;
  }
}

export async function requireAdmin() {
  const user = await requireAuth();
  if (!user) return null;
  if (!isAdmin(user)) {
    window.location.href = 'dashboard.html';
    return null;
  }
  return user;
}

export function isAdmin(user) {
  return user?.app_metadata?.role === 'admin';
}

export async function throttledUpdateLastActive(userOrId) {
  if (!userOrId) return;
  const user = typeof userOrId === 'object' ? userOrId : null;
  const userId = user ? user.id : userOrId;
  if (!userId) return;

  const key = 'ww_last_active_push';
  const lastPush = parseInt(safeLocalStorageGet(key, '0'), 10);
  const now = Date.now();
  if (now - lastPush < ACTIVE_THROTTLE_MS) return;
  safeLocalStorageSet(key, String(now));

  const updateData = { last_active: new Date().toISOString() };
  if (user && user.email) {
    updateData.email = user.email;
    const metaUsername = user.user_metadata?.username || user.user_metadata?.name || user.user_metadata?.full_name || (user.email ? user.email.split('@')[0] : null);
    if (metaUsername) updateData.username = metaUsername;
  }

  try {
    const { data, error } = await sb
      .from('user_profiles')
      .update(updateData)
      .eq('id', userId)
      .select('id');

    if (!error && (!data || data.length === 0) && user) {
      const username = user.user_metadata?.username || user.user_metadata?.name || user.user_metadata?.full_name || (user.email ? user.email.split('@')[0] : 'trader');
      await sb.from('user_profiles').insert([{
        id: userId,
        email: user.email || null,
        username: username,
        plan: 'free',
        role: 'user',
        is_active: true,
        last_active: new Date().toISOString()
      }]).catch(() => {});
    }
  } catch (e) {}
}

// ── LOGOUT ────────────────────────────────────────────────────
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