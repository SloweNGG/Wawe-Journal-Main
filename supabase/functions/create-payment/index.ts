// supabase/functions/create-payment/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ⭐ Environment variables
const NOWPAYMENTS_API_KEY = Deno.env.get('NOWPAYMENTS_API_KEY') || '';
const NOWPAYMENTS_ENV = Deno.env.get('NOWPAYMENTS_ENV') || 'production';
const NOWPAYMENTS_WEBHOOK_URL = Deno.env.get('NOWPAYMENTS_WEBHOOK_URL') || '';

// ⭐ CORS - WILDCARD DESTEKLİ
const ALLOWED_ORIGINS = [
  'https://your-domain.com',
  'https://wawejournal.com',
  'https://wawe-journal.pages.dev',
  'https://*.wawe-journal.pages.dev',
  'https://*.pages.dev',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4200',
  'http://localhost:4173',
  'http://localhost:4321'
];

const API_URL = NOWPAYMENTS_ENV === 'sandbox'
  ? 'https://api-sandbox.nowpayments.io/v1'
  : 'https://api.nowpayments.io/v1';

// ⭐ Rate Limiting
const rateLimitStore = new Map<string, { count: number, resetTime: number }>();
const RATE_LIMIT_WINDOW = parseInt(Deno.env.get('RATE_LIMIT_WINDOW') || '60000');
const RATE_LIMIT_MAX = parseInt(Deno.env.get('RATE_LIMIT_MAX') || '10');

// ⭐ JWT'den kullanıcı kimliğini çıkarır
function getUserIdFromToken(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  try {
    const token = auth.substring(7);
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload.sub || null;
  } catch (e) {
    return null;
  }
}

function getClientId(req: Request): string {
  const cfIp = req.headers.get('cf-connecting-ip');
  const forwardedIp = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const ip = cfIp || forwardedIp?.split(',')[0] || realIp || 'unknown';
  const userId = getUserIdFromToken(req) || 'anonymous';
  return `${userId}:${ip}`;
}

function checkRateLimit(clientId: string): { allowed: boolean, remaining: number, resetIn: number } {
  const now = Date.now();
  const record = rateLimitStore.get(clientId);

  if (!record || now > record.resetTime) {
    const resetTime = now + RATE_LIMIT_WINDOW;
    rateLimitStore.set(clientId, { count: 1, resetTime });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetIn: RATE_LIMIT_WINDOW };
  }

  if (record.count >= RATE_LIMIT_MAX) {
    const resetIn = record.resetTime - now;
    return { allowed: false, remaining: 0, resetIn };
  }

  record.count++;
  rateLimitStore.set(clientId, record);
  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX - record.count,
    resetIn: record.resetTime - now
  };
}

// ⭐ CORS Headers
function getCorsHeaders(origin: string | null): Record<string, string> {
  let isAllowed = !!(origin && ALLOWED_ORIGINS.includes(origin));

  if (!isAllowed && origin) {
    for (let i = 0; i < ALLOWED_ORIGINS.length; i++) {
      const pattern = ALLOWED_ORIGINS[i];
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
        if (regex.test(origin)) {
          isAllowed = true;
          break;
        }
      }
    }
  }

  return {
    'Access-Control-Allow-Origin': (isAllowed && origin) ? origin : (ALLOWED_ORIGINS[0] || '*'),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}

// ⭐ Plan validasyonu
// 'test': yalnızca admin panelinden açılan geliştirici test modunda (dev_test_access_active) satın alınabilir.
const VALID_PLANS = ['monthly', 'yearly', 'premium', '3months', '6months', 'test'];
const TEST_PLAN_PRICE_USD = 1;   // sunucuda sabit: istemciden gelen tutar asla fiyatı belirlemez
// Satış yalnızca USD ile yapılır. (Eskiden EUR/GBP/TRY de kabul ediliyor ve elle yazılmış, güncel olmayan
// sabit kurla çevriliyordu: arayüz hep USD gönderse de, API'yi doğrudan çağıran biri kuru lehine olan
// para birimini seçip indirimle satın alabiliyordu.)
const VALID_CURRENCIES = ['USD'];
const VALID_PAY_CURRENCIES = ['BTC', 'LTC', 'ETH', 'XRP', 'BCH', 'DOGE', 'USDT', 'USDTTRC20'];

function validatePlanType(planType: string): boolean {
  return VALID_PLANS.includes(planType);
}

// Fiyat para birimi yalnızca fiat olabilir. Kripto ticker'ları (DOGE, LTC...) sadece
// ödeme (pay) para birimi olarak geçerli; aksi halde 12 USD yerine 12 DOGE faturalanır.
function validateCurrency(currency: string): boolean {
  return VALID_CURRENCIES.includes(currency);
}

// (Eskiden burada kullanılmayan, USD dışı sabit kurlar içeren fiyat yardımcıları vardı; kaldırıldı. Fiyat
// ana handler'da system_settings'ten USD olarak okunur.)

// ⭐ Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
let supabaseClient: any = null;
let supabaseAdminClient: any = null;

try {
  if (supabaseUrl && supabaseAnonKey) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    if (supabaseServiceKey) {
      supabaseAdminClient = createClient(supabaseUrl, supabaseServiceKey);
    }
  }
} catch (e) {
  console.warn('⚠️ Supabase client initialization failed:', e);
}

// ⭐ Fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit, timeout: number = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const headers = getCorsHeaders(origin);

  // ⭐ CORS - OPTIONS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers
    });
  }

  try {
    // ⭐ 1. METHOD KONTROLÜ
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ⭐ 2. API KEY KONTROLÜ
    if (!NOWPAYMENTS_API_KEY) {
      console.error('❌ NOWPAYMENTS_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Payment service not configured' }), {
        status: 503,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ⭐ 3. GERÇEK KİMLİK DOĞRULAMA
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    if (!supabaseClient) {
      console.error('❌ Supabase client not configured');
      return new Response(JSON.stringify({ error: 'Auth service not configured' }), {
        status: 503,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    const jwt = authHeader.substring(7);
    const { data: authData, error: authError } = await supabaseClient.auth.getUser(jwt);

    if (authError || !authData?.user) {
      console.warn('⛔ Invalid or expired token');
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    const userId = authData.user.id;

    // ⭐ User-scoped client for RLS
    const userScopedClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } }
    });

    // ⭐ 4. RATE LIMITING
    const clientId = getClientId(req);
    const rateLimit = checkRateLimit(clientId);

    if (!rateLimit.allowed) {
      console.warn(`⛔ Rate limit exceeded for ${clientId}`);
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded',
        retry_after: Math.ceil(rateLimit.resetIn / 1000)
      }), {
        status: 429,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(rateLimit.resetIn)
        }
      });
    }

    // ⭐ 5. REQUEST BODY PARSE
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    const { planType, currency, payCurrency, successUrl, cancelUrl, referralCode } = body;

    // ⭐ 6. VALIDASYONLAR
    if (!planType || !validatePlanType(planType)) {
      return new Response(JSON.stringify({
        error: 'Invalid planType. Allowed: monthly, yearly, premium'
      }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    const priceCurrency = currency || 'USD';
    if (!validateCurrency(priceCurrency)) {
      return new Response(JSON.stringify({
        error: 'Invalid currency. Allowed: USD'
      }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ⭐ Fiyatı ve ayarları DB'den al
    const adminClient = supabaseAdminClient || supabaseClient;
    
    // Varsayılan ayarlar
    let paymentSettings = {
      monthly_price_usd: 12,
      yearly_price_usd: 99,
      ltc_discount_enabled: true
    };
    
    let baseAmount = (planType === 'yearly') ? 99 : 12;

    // 🧪 Test planı: yalnızca test modu erişimi olan kullanıcılar (sunucu tarafı doğrulama; arayüze güvenilmez)
    if (planType === 'test') {
      let testAllowed = false;
      if (adminClient) {
        const { data: accessOk, error: accessErr } = await adminClient.rpc('dev_test_access_active', { p_user_id: userId });
        testAllowed = !accessErr && accessOk === true;
      }
      if (!testAllowed) {
        return new Response(JSON.stringify({ error: 'Test planı şu anda kullanılamıyor.' }), {
          status: 403,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    if (adminClient) {
      try {
        const { data: psData } = await adminClient.from('system_settings').select('value').eq('key', 'payment_settings').single();
        if (psData?.value) paymentSettings = { ...paymentSettings, ...psData.value };

        const { data: prData } = await adminClient.from('system_settings').select('value').eq('key', 'prices').single();

        const mPrice = Number(prData?.value?.monthly) || Number(paymentSettings.monthly_price_usd) || 12;
        const yPrice = Number(prData?.value?.yearly) || Number(paymentSettings.yearly_price_usd) || 99;

        if (planType === 'monthly' || planType === 'premium') {
          baseAmount = mPrice;
        } else if (planType === '3months') {
          baseAmount = Math.round(mPrice * 3 * 0.86);
        } else if (planType === '6months') {
          baseAmount = Math.round(mPrice * 6 * 0.80);
        } else if (planType === 'yearly') {
          baseAmount = yPrice;
        }
      } catch (e) {
        console.warn('⚠️ Error fetching price settings:', e);
      }
    }

    // Fiyat zaten USD cinsinden (priceCurrency yalnızca 'USD' olabilir); kur çevirimi yoktur.
    if (planType === 'test') baseAmount = TEST_PLAN_PRICE_USD;

    const payCurrencyFinal = (payCurrency || 'LTC').toUpperCase();

    // 🔒 BTC Yalnızca Yıllık Planda Geçerlidir
    if (payCurrencyFinal === 'BTC' && planType !== 'yearly') {
      return new Response(JSON.stringify({
        error: 'Bitcoin (BTC) ödeme yöntemi yalnızca yıllık aboneliklerde geçerlidir.'
      }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    let finalAmount = baseAmount;
    let appliedReferralCode = null;
    let orderDesc = `Wawe Journal - ${planType.charAt(0).toUpperCase() + planType.slice(1)} Plan Subscription`;

    // ⭐ Referans İndirimi Hesaplama - YALNIZCA LTC İÇİN GEÇERLİ (BTC'de indirim olmaz)
    // Test planında referral/indirim uygulanmaz (komisyon ve fiyat akışı karışmasın)
    const cleanRefCode = (referralCode && planType !== 'test') ? String(referralCode).trim().toUpperCase() : null;
    const isLtc = payCurrencyFinal === 'LTC';
    const isLtcDiscountEnabled = paymentSettings.ltc_discount_enabled !== false && String(paymentSettings.ltc_discount_enabled) !== 'false';

    if (cleanRefCode && isLtc && isLtcDiscountEnabled && adminClient) {
      try {
        // 🛡️ SELF-REFERRAL BLOCK: Kullanıcı kendi kodunu kullanamaz!
        const { data: refOwner } = await adminClient
          .from('referral_codes')
          .select('influencer_user_id')
          .eq('code', cleanRefCode)
          .maybeSingle();

        if (refOwner?.influencer_user_id && refOwner.influencer_user_id === userId) {
          console.warn(`⛔ Self-referral attempt blocked: User ${userId} tried to use their own code ${cleanRefCode}`);
        } else {
          // RPC çağrısı: Overload çakışmalarını önlemek için try/fallback
          let refData = null;
          let refErr = null;

          const rpc1 = await adminClient.rpc('validate_referral_code', { 
            p_code: cleanRefCode,
            p_user_id: userId || null 
          });
          refData = rpc1.data;
          refErr = rpc1.error;

          if (refErr && refErr.message && refErr.message.includes('Could not choose')) {
            const rpc2 = await adminClient.rpc('validate_referral_code', { p_code: cleanRefCode });
            refData = rpc2.data;
            refErr = rpc2.error;
          }

          // Eğer RPC hala hata verirse doğrudan referral_codes tablosunu kontrol et
          if ((refErr || !refData) && adminClient) {
            const { data: directCode } = await adminClient
              .from('referral_codes')
              .select('discount_percent, is_active, influencer_user_id')
              .eq('code', cleanRefCode)
              .maybeSingle();

            if (directCode && directCode.is_active && (!directCode.influencer_user_id || directCode.influencer_user_id !== userId)) {
              refData = { valid: true, discount_percent: directCode.discount_percent || 10 };
              refErr = null;
            }
          }

          if (refData && refData.valid) {
            const discountPct = Number(refData.discount_percent) || 0;
            if (discountPct > 0 && discountPct <= 100) {
              finalAmount = Number((baseAmount * (1 - (discountPct / 100))).toFixed(2));
              appliedReferralCode = cleanRefCode;
              orderDesc += ` (Ref: ${appliedReferralCode} -%${discountPct})`;
              console.log(`✅ Applied referral discount ${discountPct}% with code ${appliedReferralCode}. New price: ${finalAmount}`);
            }
          } else {
            console.log(`ℹ️ Referral code ${cleanRefCode} invalid:`, refData || refErr);
          }
        }
      } catch (e) {
        console.warn('⚠️ Referral validation failed:', e);
      }
    } else if (cleanRefCode && !isLtc) {
      console.log(`ℹ️ Referral code ignored because currency is ${payCurrencyFinal} (discount only allowed for LTC)`);
    }

    // 🔒 Fiyat YALNIZCA sunucuda hesaplanır. İstemciden gelen `amount` asla fiyatı
    // belirlemez (eskiden %50'ye kadar indirim yaptırabiliyordu); gerçek tutar
    // yanıttaki `amount` alanıyla istemciye geri döner.
    if (!(finalAmount > 0)) {
      return new Response(JSON.stringify({ error: 'Price could not be determined' }), {
        status: 500,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }


    if (!VALID_PAY_CURRENCIES.includes(payCurrencyFinal)) {
      return new Response(JSON.stringify({
        error: 'Invalid pay currency. Allowed: BTC, LTC, ETH, XRP, BCH, DOGE'
      }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ⭐ 7. KULLANICI KONTROLÜ
    const { data: userProfile, error: userError } = await userScopedClient
      .from('user_profiles')
      .select('id, plan')
      .eq('id', userId)
      .single();

    if (userError || !userProfile) {
      console.warn(`⛔ User ${userId} not found in database`);
      return new Response(JSON.stringify({ error: 'User profile not found' }), {
        status: 404,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    console.log(`📝 Creating invoice: User ${userId}, Plan ${planType}, Amount ${finalAmount} ${priceCurrency}`);

    // ⭐ 8. WEBHOOK URL
    const webhookUrl = NOWPAYMENTS_WEBHOOK_URL ||
      'https://odasapyhtdopbnlfhwde.supabase.co/functions/v1/nowpayment-webhook';

    // ⭐ 9. ORDER ID
    const orderId = `${userId}_${planType}_${Date.now()}`;

    // ⭐ 10. NOWPAYMENTS API CALL (Önce Direct Payment /payment dene, olmazsa /invoice fallback)
    let paymentData: any = null;
    let paymentType = 'invoice';

    // 10A. DIRECT PAYMENT CALL (/v1/payment - Site içi QR & Cüzdan)
    try {
      const directPayload = {
        price_amount: finalAmount,
        price_currency: priceCurrency.toLowerCase(),
        pay_currency: payCurrencyFinal.toLowerCase(),
        ipn_callback_url: webhookUrl,
        order_id: orderId,
        order_description: orderDesc
      };

      console.log(`📤 Attempting Direct Payment: ${JSON.stringify(directPayload)}`);
      const directRes = await fetchWithTimeout(
        API_URL + '/payment',
        {
          method: 'POST',
          headers: {
            'x-api-key': NOWPAYMENTS_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(directPayload)
        },
        12000
      );

      const directJson = await directRes.json();
      if (directRes.ok && directJson && directJson.pay_address) {
        paymentData = directJson;
        paymentType = 'direct';
        console.log(`✅ Direct Payment created: Address ${directJson.pay_address}, Amount ${directJson.pay_amount} ${directJson.pay_currency}`);
      } else {
        console.warn('⚠️ Direct Payment not available, falling back to invoice:', directJson);
      }
    } catch (e) {
      console.warn('⚠️ Direct Payment call error, falling back to invoice:', e);
    }

    // 10B. INVOICE FALLBACK (/v1/invoice)
    if (!paymentData) {
      const invoicePayload = {
        price_amount: finalAmount,
        price_currency: priceCurrency,
        pay_currency: payCurrencyFinal,
        ipn_callback_url: webhookUrl,
        success_url: successUrl || 'https://wawejournal.com/dashboard.html',
        cancel_url: cancelUrl || 'https://wawejournal.com/settings.html',
        order_id: orderId,
        order_description: orderDesc
      };

      console.log(`📤 Sending to NowPayments Invoice: ${JSON.stringify(invoicePayload)}`);
      const invoiceRes = await fetchWithTimeout(
        API_URL + '/invoice',
        {
          method: 'POST',
          headers: {
            'x-api-key': NOWPAYMENTS_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(invoicePayload)
        },
        15000
      );

      const invoiceJson = await invoiceRes.json();
      if (!invoiceRes.ok) {
        console.error('❌ NowPayments API error:', invoiceJson);
        return new Response(JSON.stringify({
          error: invoiceJson.message || 'Payment creation failed',
          code: invoiceJson.code || invoiceRes.status,
          details: invoiceJson.details || null
        }), {
          status: invoiceRes.status,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }

      paymentData = invoiceJson;
      paymentType = 'invoice';
    }

    console.log(`✅ Payment created (${paymentType}): ${paymentData.payment_id || paymentData.invoice_id}`);

    // ⭐ 11. PAYMENT LOG
    const writerClient = supabaseAdminClient || supabaseClient;
    // Bu kayıt webhook'un beklenen tutarı/para birimini doğrulaması için gereklidir;
    // yazılamazsa kullanıcıya ödeme adresi verilmez (ödeme alınıp işlenemezdi).
    try {
      const recordInvoiceId = paymentData.payment_id ? String(paymentData.payment_id) : (paymentData.invoice_id ? String(paymentData.invoice_id) : orderId);
      const { error: logError } = await writerClient
        .from('payments')
        .insert([{
          user_id: userId,
          invoice_id: recordInvoiceId,
          order_id: orderId,
          amount: finalAmount,
          currency: priceCurrency,
          plan_type: planType,
          payment_status: paymentData.payment_status || 'waiting',
          pay_currency: payCurrencyFinal,
          referral_code: appliedReferralCode,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }]);
      if (logError) throw logError;
      console.log('📝 Payment log created');
    } catch (e) {
      console.error('❌ Failed to log payment, aborting before handing out pay address:', e);
      return new Response(JSON.stringify({ error: 'Payment could not be recorded. Please try again.' }), {
        status: 500,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ⭐ 12. RESPONSE
    const rateHeaders = {
      'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
      'X-RateLimit-Remaining': String(rateLimit.remaining),
      'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetIn / 1000))
    };

    return new Response(JSON.stringify({
      success: true,
      paymentType: paymentType,
      paymentId: paymentData.payment_id ? String(paymentData.payment_id) : (paymentData.invoice_id ? String(paymentData.invoice_id) : null),
      payAddress: paymentData.pay_address || null,
      payAmount: paymentData.pay_amount || null,
      payCurrency: (paymentData.pay_currency || payCurrencyFinal).toUpperCase(),
      invoiceId: paymentData.invoice_id || null,
      invoiceUrl: paymentData.invoice_url || null,
      orderId: paymentData.order_id || orderId,
      amount: finalAmount,
      expiresAt: paymentData.expiration_date || null
    }), {
      status: 200,
      headers: {
        ...headers,
        ...rateHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('❌ create-payment error:', error);

    if (error instanceof Error && error.name === 'AbortError') {
      return new Response(JSON.stringify({
        error: 'Request timeout',
        details: 'Payment service took too long to respond'
      }), {
        status: 504,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
});