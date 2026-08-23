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
export async function requireAuth() {
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

export async function requireAuthSilent() {
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

export async function throttledUpdateLastActive(userId) {
  const key = 'ww_last_active_push';
  const lastPush = parseInt(safeLocalStorageGet(key, '0'), 10);
  const now = Date.now();
  if (now - lastPush < ACTIVE_THROTTLE_MS) return;
  safeLocalStorageSet(key, String(now));
  await sb
    .from('user_profiles')
    .upsert({ id: userId, last_active: new Date().toISOString() }, { onConflict: 'id' });
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