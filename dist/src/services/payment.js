// ============================================================
// WAWE JOURNAL - PAYMENT SERVICE
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

export async function cancelPremium() {
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
    
    showToast('Otomatik yenileme yok. Premium erişiminiz bitiş tarihine kadar devam eder.', 'info');
    return true;
  } catch (error) {
    console.error('cancelPremium hatası:', error);
    showToast('Abonelik iptal edilemedi: ' + error.message, 'error');
    return false;
  }
}