// ============================================================
// WAWE JOURNAL - PAYMENT SERVICE (GÜNCELLENDİ)
// ============================================================

import { sb, requireAuth } from '../core/supabase.js';
import { safeLocalStorageGet, safeLocalStorageSet } from '../core/storage.js';
import { showToast } from '../utils/ui.js';
import { getUserPlan } from './user.js';

function t(key, params, fallback) {
  if (typeof window !== 'undefined' && window.i18n && typeof window.i18n.t === 'function') {
    var res = window.i18n.t(key, params);
    if (res && res !== key) return res;
  }
  return fallback || key;
}

let selectedPayMethod = safeLocalStorageGet('ww_pay_method', 'BTC');

export function getSystemSettings() {
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

export function selectPayMethod(method) {
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

export async function createNowPaymentInvoice(userId, planType, amount, currency, payCurrency, referralCode = null) {
  currency = currency || 'USD';
  payCurrency = payCurrency || 'BTC';
  
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      showToast(t('payment.session_expired', {}, 'Oturumunuz sona ermiş, lütfen tekrar giriş yapın.'), 'error');
      return null;
    }

    wwLog.log('📤 createNowPaymentInvoice çağrıldı:', { userId, planType, amount, currency, payCurrency, referralCode });

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
          referralCode: referralCode,
          successUrl: window.location.origin + '/dashboard.html?payment=success',
          cancelUrl: window.location.origin + '/settings.html'
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ create-payment API hatası:', response.status, data);
      throw new Error(data.error || t('payment.link_failed', {}, 'Ödeme başlatılamadı'));
    }

    try {
      sessionStorage.setItem('ww_pending_payment', 'true');
      sessionStorage.setItem('ww_pending_payment_time', String(Date.now()));
      localStorage.setItem('ww_pending_payment', 'true');
    } catch(e) {}

    wwLog.log('✅ create-payment başarılı:', data);
    return data;
  } catch (error) {
    console.error('❌ createNowPaymentInvoice hatası:', error);
    showToast((t('payment.link_failed', {}, 'Ödeme başlatılamadı') + ': ' + error.message), 'error');
    return null;
  }
}

export async function upgradeToPremium(planType, amount, currency, payMethod, referralCode = null) {
  currency = currency || 'USD';
  
  try {
    const user = await requireAuth();
    if (!user) {
      showToast(t('payment.login_required', {}, 'Lütfen önce giriş yapın.'), 'error');
      return null;
    }
    
    const method = payMethod || selectedPayMethod || 'BTC';
    showToast(t('settings.redirecting_to_payment', { method: method }, method + ' ile ödeme sayfasına yönlendiriliyorsunuz...'), 'info');
    
    const result = await createNowPaymentInvoice(
      user.id,
      planType,
      amount,
      currency,
      method,
      referralCode
    );
    
    if (result && result.invoiceUrl) {
      window.location.href = result.invoiceUrl;
      return result;
    } else {
      showToast(t('payment.link_failed', {}, 'Ödeme linki oluşturulamadı. Lütfen tekrar deneyin.'), 'error');
      return null;
    }
  } catch (error) {
    console.error('upgradeToPremium hatası:', error);
    showToast(t('payment.link_failed', {}, 'Ödeme başlatılamadı: ') + error.message, 'error');
    return null;
  }
}

// ⭐⭐⭐ CANCEL PREMIUM - GERÇEKTEN İPTAL EDEN VERSİYON ⭐⭐⭐
export async function cancelPremium() {
  wwLog.log('💎 [cancelPremium] ÇAĞRILDI!');
  
  try {
    const user = await requireAuth();
    if (!user) {
      showToast(t('payment.login_required', {}, 'Lütfen önce giriş yapın.'), 'error');
      return false;
    }
    
    // Kullanıcının plan bilgisini al
    const { data: profile, error: profileError } = await sb
      .from('user_profiles')
      .select('plan, plan_expires_at')
      .eq('id', user.id)
      .single();
    
    if (profileError) {
      console.error('❌ Profil sorgusu hatası:', profileError);
      showToast(t('settings.profile_fetch_error', {}, 'Profil bilgileri alınamadı.'), 'error');
      return false;
    }
    
    wwLog.log('📊 Mevcut plan:', profile ? profile.plan : 'yok');
    
    // Zaten premium değilse
    if (!profile || profile.plan !== 'premium') {
      showToast(t('settings.cancel_no_premium', {}, 'Zaten premium aboneliğiniz yok.'), 'info');
      return true;
    }
    
    var lang = (typeof window !== 'undefined' && window.i18n && typeof window.i18n.getCurrentLanguage === 'function') ? window.i18n.getCurrentLanguage() : 'tr';
    var locale = lang === 'tr' ? 'tr-TR' : (lang === 'de' ? 'de-DE' : 'en-US');

    // Onay mesajı
    const expiryDate = profile.plan_expires_at ? 
      new Date(profile.plan_expires_at).toLocaleDateString(locale, { 
        day: '2-digit', 
        month: 'long', 
        year: 'numeric' 
      }) : '—';
    
    const confirmTitle = t('settings.cancel_premium_title', {}, 'Premium Aboneliğini İptal Et');
    const confirmMessage = t('settings.cancel_premium_message', {}, 'Premium aboneliğinizi iptal etmek istediğinize emin misiniz?');
    const confirmWarning = t('settings.cancel_premium_warning', { date: expiryDate }, 'Bitiş tarihi: ' + expiryDate + '\n\nBu işlem geri alınamaz!');
    
    // Confirm modal'ı göster
    const confirmed = await new Promise(function(resolve) {
      // showConfirmModal zaten window'da tanımlı
      if (typeof window.showConfirmModal === 'function') {
        window.showConfirmModal(
          confirmTitle,
          confirmMessage,
          confirmWarning,
          function() { resolve(true); },
          function() { resolve(false); }
        );
      } else {
        // Fallback
        resolve(confirm(confirmTitle + '\n\n' + confirmMessage + '\n\n' + confirmWarning));
      }
    });
    
    if (!confirmed) {
      wwLog.log('❌ İptal işlemi kullanıcı tarafından iptal edildi.');
      return false;
    }
    
    // ⭐⭐⭐ PLANI ÜCRETSİZ YAP - ASIL İPTAL BURADA! ⭐⭐⭐
    wwLog.log('🔄 Plan free\'e düşürülüyor...');
    
    const { error: updateError } = await sb
      .from('user_profiles')
      .update({ 
        plan: 'free',
        plan_expires_at: null
      })
      .eq('id', user.id);
    
    if (updateError) {
      console.error('❌ Plan güncelleme hatası:', updateError);
      showToast(t('settings.cancel_error', {}, 'Abonelik iptal edilemedi: ') + updateError.message, 'error');
      return false;
    }
    
    wwLog.log('✅ Abonelik iptal edildi!');
    
    // Storage'ı temizle
    try {
      localStorage.removeItem('ww_user_plan');
      sessionStorage.removeItem('ww_user_plan');
      sessionStorage.removeItem('ww_user_plan_time');
      sessionStorage.removeItem('ww_cached_profile');
      sessionStorage.removeItem('ww_cached_profile_time');
      window.__wwUserProfile = null;
    } catch(e) {}
    
    showToast(t('settings.cancel_subscription_success', {}, 'Premium aboneliğiniz iptal edildi.'), 'success');
    
    // ⭐ Plan panelini yenile (settings.js'deki renderPlan fonksiyonunu çağır)
    setTimeout(function() {
      if (typeof window.renderPlan === 'function') {
        window.renderPlan();
      }
      if (typeof window.updateBadge === 'function') {
        window.updateBadge();
      }
      // Sayfayı yenile
      location.reload();
    }, 500);
    
    return true;
    
  } catch (error) {
    console.error('❌ Abonelik iptal hatası:', error);
    showToast(t('settings.cancel_error', {}, 'Abonelik iptal edilemedi: ') + error.message, 'error');
    return false;
  }
}

// ============================================================
// ⭐ POST-PAYMENT SYNC & REALTIME PREMIUM AKTİVASYON YÖNETİCİSİ
// Ödeme yapıldıktan sonra tarayıcıya dönüldüğünde veya arka planda
// blokzincir/webhook onayı geldiğinde anında 0ms Premium'a geçirir.
// ============================================================
let _planSyncStarted = false;

export async function checkAndSyncPaymentStatus() {
  if (typeof window === 'undefined') return;

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const hasPaymentSuccess = urlParams.has('payment') && urlParams.get('payment') === 'success';
    const hasPendingFlag = sessionStorage.getItem('ww_pending_payment') === 'true' || localStorage.getItem('ww_pending_payment') === 'true';

    const { data: { session } } = await sb.auth.getSession();
    const user = session?.user;
    if (!user) return;

    // Realtime Postgres Changes dinleyicisi başlat (her kullanıcı için arka planda çalışır)
    if (!_planSyncStarted && sb && typeof sb.channel === 'function') {
      _planSyncStarted = true;
      try {
        const channelName = 'ww_plan_listener_' + user.id.slice(0, 8);
        sb.channel(channelName)
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'user_profiles',
            filter: 'id=eq.' + user.id
          }, (payload) => {
            if (payload && payload.new && payload.new.plan === 'premium') {
              applyLivePremium(payload.new);
            }
          })
          .subscribe();
      } catch(chanErr) {
        console.warn('Realtime plan channel warning:', chanErr);
      }
    }

    if (!hasPaymentSuccess && !hasPendingFlag) return;

    // 1. Bayat önbellekleri sil ve veritabanını zorla sorgula
    sessionStorage.removeItem('ww_user_plan');
    sessionStorage.removeItem('ww_user_plan_time');
    sessionStorage.removeItem('ww_cached_profile');
    sessionStorage.removeItem('ww_cached_profile_time');
    window.__wwUserProfile = null;

    const { data: profile, error } = await sb
      .from('user_profiles')
      .select('plan, plan_expires_at')
      .eq('id', user.id)
      .single();

    if (!error && profile && profile.plan === 'premium') {
      applyLivePremium(profile, true);
      return;
    }

    // Henüz onay gelmediyse kullanıcıya bilgi ver ve akıllı polling başlat
    if (hasPaymentSuccess) {
      showToast(t('settings.plan_confirming', {}, '⏳ Ödemeniz işleniyor, blokzincir onayı bekleniyor. Sayfada kalın, otomatik güncellenecektir...'), 'info');
    }

    let pollAttempts = 0;
    const maxAttempts = 25; // ~100 saniye
    const pollInterval = setInterval(async () => {
      pollAttempts++;
      if (pollAttempts >= maxAttempts) {
        clearInterval(pollInterval);
        return;
      }

      try {
        const { data: liveProfile } = await sb
          .from('user_profiles')
          .select('plan, plan_expires_at')
          .eq('id', user.id)
          .single();

        if (liveProfile && liveProfile.plan === 'premium') {
          clearInterval(pollInterval);
          applyLivePremium(liveProfile, true);
        }
      } catch(e) {}
    }, 4000);

  } catch(err) {
    console.error('checkAndSyncPaymentStatus err:', err);
  }
}

function applyLivePremium(profile, isExplicitSync = false) {
  try {
    sessionStorage.setItem('ww_user_plan', 'premium');
    try { localStorage.setItem('ww_user_plan', 'premium'); } catch(e) {}
    if (profile.plan_expires_at) {
      sessionStorage.setItem('ww_user_plan_expires_at', profile.plan_expires_at);
      try { localStorage.setItem('ww_user_plan_expires_at', profile.plan_expires_at); } catch(e) {}
    }
    sessionStorage.setItem('ww_user_plan_time', String(Date.now()));
    sessionStorage.removeItem('ww_pending_payment');
    try { localStorage.removeItem('ww_pending_payment'); } catch(e) {}

    // URL'deki ?payment=success parametresini temizle
    if (window.location.search.includes('payment=success')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('payment');
      window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : '') + url.hash);
    }

    // Navbar rozetini 0ms Premium stiline çevir
    const badge = document.getElementById('plan-badge');
    const text = document.getElementById('plan-text');
    if (badge) badge.classList.add('premium');
    if (text) text.textContent = 'Premium';

    if (typeof window.updateBadgeUI === 'function') {
      window.updateBadgeUI(true, profile.plan_expires_at);
    }
    if (typeof window.updateNavbarBadge === 'function') {
      window.updateNavbarBadge();
    }

    // Kutlama bildirimi
    showToast(t('settings.plan_upgraded_success', {}, '🎉 Tebrikler! Premium hesabınız başarıyla aktifleştirildi.'), 'success');

    // Eğer ayarlar plan panelindeyse orayı yenile
    if (typeof window.renderPlan === 'function') {
      window.renderPlan();
    }
  } catch(e) {
    console.error('applyLivePremium err:', e);
  }
}

// Otomatik kontrolü sayfa yüklendiğinde başlat
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAndSyncPaymentStatus);
  } else {
    setTimeout(checkAndSyncPaymentStatus, 300);
  }
}

window.checkAndSyncPaymentStatus = checkAndSyncPaymentStatus;