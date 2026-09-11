// ============================================================
// WAWE JOURNAL - PAYMENT SERVICE (GÜNCELLENDİ)
// ============================================================

import { sb, requireAuth } from '../core/supabase.js';
import { safeLocalStorageGet, safeLocalStorageSet } from '../core/storage.js';
import { showToast } from '../utils/ui.js';
import { getUserPlan } from './user.js';

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

export async function createNowPaymentInvoice(userId, planType, amount, currency, payCurrency) {
  currency = currency || 'USD';
  payCurrency = payCurrency || 'BTC';
  
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      showToast('Oturumunuz sona ermiş, lütfen tekrar giriş yapın.', 'error');
      return null;
    }

    wwLog.log('📤 createNowPaymentInvoice çağrıldı:', { userId, planType, amount, currency, payCurrency });

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

    wwLog.log('✅ create-payment başarılı:', data);
    return data;
  } catch (error) {
    console.error('❌ createNowPaymentInvoice hatası:', error);
    showToast('Ödeme başlatılamadı: ' + error.message, 'error');
    return null;
  }
}

export async function upgradeToPremium(planType, amount, currency, payMethod) {
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

// ⭐⭐⭐ CANCEL PREMIUM - GERÇEKTEN İPTAL EDEN VERSİYON ⭐⭐⭐
export async function cancelPremium() {
  wwLog.log('💎 [cancelPremium] ÇAĞRILDI!');
  
  try {
    const user = await requireAuth();
    if (!user) {
      showToast('Lütfen önce giriş yapın.', 'error');
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
      showToast('Profil bilgileri alınamadı.', 'error');
      return false;
    }
    
    wwLog.log('📊 Mevcut plan:', profile ? profile.plan : 'yok');
    
    // Zaten premium değilse
    if (!profile || profile.plan !== 'premium') {
      showToast('Zaten premium aboneliğiniz yok.', 'info');
      return true;
    }
    
    // Onay mesajı
    const expiryDate = profile.plan_expires_at ? 
      new Date(profile.plan_expires_at).toLocaleDateString('tr-TR', { 
        day: '2-digit', 
        month: 'long', 
        year: 'numeric' 
      }) : 'belirsiz';
    
    const confirmTitle = '⚠️ Premium Aboneliğini İptal Et';
    const confirmMessage = 'Premium aboneliğinizi iptal etmek istediğinize emin misiniz?';
    const confirmWarning = '📅 Bitiş tarihi: ' + expiryDate + '\n\nBu işlem geri alınamaz!';
    
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
      showToast('Abonelik iptal edilemedi: ' + updateError.message, 'error');
      return false;
    }
    
    wwLog.log('✅ Abonelik iptal edildi!');
    
    // LocalStorage'ı temizle
    try {
      localStorage.removeItem('ww_user_plan');
    } catch(e) {}
    
    showToast('✅ Premium aboneliğiniz iptal edildi.', 'success');
    
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
    showToast('Abonelik iptal edilemedi: ' + error.message, 'error');
    return false;
  }
}