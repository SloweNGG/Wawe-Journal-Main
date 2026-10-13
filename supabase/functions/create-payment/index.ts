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

// ⭐ Fiyat Cache (60 saniye)
let pricesCache: { data: any, timestamp: number } | null = null;
const PRICES_CACHE_TTL = 60000;

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
const VALID_PLANS = ['monthly', 'yearly', 'premium', '3months', '6months'];
const VALID_CURRENCIES = ['USD', 'EUR', 'GBP', 'TRY'];
const VALID_PAY_CURRENCIES = ['BTC', 'LTC', 'ETH', 'XRP', 'BCH', 'DOGE', 'USDT', 'USDTTRC20'];

function validatePlanType(planType: string): boolean {
  return VALID_PLANS.includes(planType);
}

function validateCurrency(currency: string): boolean {
  return VALID_CURRENCIES.includes(currency) || VALID_PAY_CURRENCIES.includes(currency);
}

// ⭐ Sabit fallback fiyatlar (DB erişimi başarısız olursa)
function getFallbackPlanPrice(planType: string, currency: string): number {
  const prices: Record<string, Record<string, number>> = {
    monthly: { USD: 9, EUR: 8, GBP: 7, TRY: 250 },
    yearly: { USD: 79, EUR: 70, GBP: 62, TRY: 2200 },
    premium: { USD: 9, EUR: 8, GBP: 7, TRY: 250 }
  };
  return prices[planType]?.[currency] || prices[planType]?.USD || 0;
}

// ⭐ Fiyat nesnesinden plan/currency bazlı fiyat çöz
function resolvePrice(prices: any, planType: string, currency: string): number {
  let basePrice = 0;

  if (planType === 'monthly' || planType === 'premium') {
    basePrice = Number(prices.monthly) || 12;
  } else if (planType === '3months') {
    const m = Number(prices.monthly) || 12;
    basePrice = Math.round(m * 3 * 0.86);
  } else if (planType === '6months') {
    const m = Number(prices.monthly) || 12;
    basePrice = Math.round(m * 6 * 0.80);
  } else if (planType === 'yearly') {
    basePrice = Number(prices.yearly) || 99;
  } else {
    return getFallbackPlanPrice(planType, currency);
  }

  // USD ise direkt dön
  if (currency === 'USD') {
    return basePrice;
  }

  // USD dışı currency — basit dönüşüm
  const conversionRates: Record<string, number> = {
    'USD': 1,
    'EUR': 0.92,
    'GBP': 0.79,
    'TRY': 34.5
  };
  const rate = conversionRates[currency] || 1;
  return Math.round(basePrice * rate * 100) / 100;
}

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

// ⭐ DB'den güncel fiyatı al (cache'li)
async function getPlanPriceFromDB(planType: string, currency: string): Promise<number> {
  const now = Date.now();

  // Cache kontrolü
  if (pricesCache && (now - pricesCache.timestamp) < PRICES_CACHE_TTL) {
    return resolvePrice(pricesCache.data, planType, currency);
  }

  // DB'den oku — önce service role client, yoksa RPC dene
  try {
    const client = supabaseAdminClient || supabaseClient;
    if (client) {
      // system_settings tablosundan 'prices' key'ini oku
      const { data, error } = await client
        .from('system_settings')
        .select('value')
        .eq('key', 'prices')
        .single();

      if (!error && data?.value) {
        pricesCache = { data: data.value, timestamp: now };
        console.log('💰 Prices loaded from DB:', JSON.stringify(data.value));
        return resolvePrice(data.value, planType, currency);
      }

      if (error) {
        console.warn('⚠️ system_settings query error:', error.message);
      }
    }
  } catch (e) {
    console.warn('⚠️ Failed to fetch prices from DB:', e);
  }

  // Fallback
  console.warn('⚠️ Using fallback hardcoded prices');
  return getFallbackPlanPrice(planType, currency);
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
        error: 'Invalid currency. Allowed: USD, EUR, GBP, TRY'
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

    if (priceCurrency !== 'USD') {
      const conversionRates: Record<string, number> = { 'USD': 1, 'EUR': 0.92, 'GBP': 0.79, 'TRY': 33.50 };
      const rate = conversionRates[priceCurrency] || 1;
      baseAmount = Number((baseAmount * rate).toFixed(2));
    }

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
    const cleanRefCode = referralCode ? String(referralCode).trim().toUpperCase() : null;
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

    // ⭐ İstemciden gelen miktar (en son ekranda yazan fiyat) ile senkronize et
    const clientAmount = Number(body.amount);
    if (!isNaN(clientAmount) && clientAmount > 0) {
      if (Math.abs(clientAmount - finalAmount) <= 0.15) {
        finalAmount = Number(clientAmount.toFixed(2));
      } else if (isLtc && cleanRefCode && clientAmount >= (baseAmount * 0.5) && clientAmount <= baseAmount) {
        finalAmount = Number(clientAmount.toFixed(2));
        console.log(`✅ Synced with client discounted amount: ${finalAmount}`);
      }
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
    try {
      const recordInvoiceId = paymentData.payment_id ? String(paymentData.payment_id) : (paymentData.invoice_id ? String(paymentData.invoice_id) : orderId);
      await writerClient
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
      console.log('📝 Payment log created');
    } catch (e) {
      console.warn('⚠️ Failed to log payment:', e);
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