// supabase/functions/create-payment/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// ⭐ Environment variables
const NOWPAYMENTS_API_KEY = Deno.env.get('NOWPAYMENTS_API_KEY') || '';
const NOWPAYMENTS_ENV = Deno.env.get('NOWPAYMENTS_ENV') || 'production';
const NOWPAYMENTS_WEBHOOK_URL = Deno.env.get('NOWPAYMENTS_WEBHOOK_URL') || '';
const ALLOWED_ORIGINS = Deno.env.get('ALLOWED_ORIGINS')?.split(',') || [
  'https://your-domain.com',
  'https://wawejournal.com',
  'http://localhost:5173'
];

const API_URL = NOWPAYMENTS_ENV === 'sandbox'
  ? 'https://api-sandbox.nowpayments.io/v1'
  : 'https://api.nowpayments.io/v1';

// ⭐ Rate Limiting
const rateLimitStore = new Map<string, { count: number, resetTime: number }>();
const RATE_LIMIT_WINDOW = parseInt(Deno.env.get('RATE_LIMIT_WINDOW') || '60000');
const RATE_LIMIT_MAX = parseInt(Deno.env.get('RATE_LIMIT_MAX') || '10');

function getClientId(req: Request): string {
  const cfIp = req.headers.get('cf-connecting-ip');
  const forwardedIp = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const ip = cfIp || forwardedIp?.split(',')[0] || realIp || 'unknown';
  
  // Authorization header'dan user id al
  const auth = req.headers.get('authorization');
  let userId = 'anonymous';
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const token = auth.substring(7);
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        if (payload.sub) userId = payload.sub;
      }
    } catch (e) {}
  }
  
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
function getCorsHeaders(origin: string | null) {
  const isAllowed = origin && ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}

// ⭐ Plan validasyonu
const VALID_PLANS = ['monthly', 'yearly', 'premium'];
const VALID_CURRENCIES = ['USD', 'EUR', 'GBP', 'TRY'];
const VALID_PAY_CURRENCIES = ['BTC', 'LTC', 'ETH', 'XRP', 'BCH', 'DOGE'];

function validatePlanType(planType: string): boolean {
  return VALID_PLANS.includes(planType);
}

function validateAmount(amount: number): boolean {
  return amount > 0 && amount < 100000;
}

function validateCurrency(currency: string): boolean {
  return VALID_CURRENCIES.includes(currency) || VALID_PAY_CURRENCIES.includes(currency);
}

// ⭐ Price validation
function getPlanPrice(planType: string, currency: string): number {
  // Price'ları environment'dan al veya sabit değerler kullan
  const prices: Record<string, Record<string, number>> = {
    monthly: { USD: 9, EUR: 8, GBP: 7, TRY: 250 },
    yearly: { USD: 79, EUR: 70, GBP: 62, TRY: 2200 },
    premium: { USD: 9, EUR: 8, GBP: 7, TRY: 250 }
  };
  
  return prices[planType]?.[currency] || prices[planType]?.USD || 0;
}

// ⭐ Supabase client (opsiyonel)
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
let supabaseClient: any = null;

try {
  if (supabaseUrl && supabaseAnonKey) {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.39.0');
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
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

serve(async (req) => {
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

    // ⭐ 3. RATE LIMITING
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

    // ⭐ 4. REQUEST BODY PARSE
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    const { 
      userId, 
      planType, 
      amount, 
      currency, 
      payCurrency, 
      successUrl, 
      cancelUrl 
    } = body;

    // ⭐ 5. VALIDASYONLAR
    if (!userId || typeof userId !== 'string') {
      return new Response(JSON.stringify({ error: 'Valid userId is required' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    if (!planType || !validatePlanType(planType)) {
      return new Response(JSON.stringify({ 
        error: 'Invalid planType. Allowed: monthly, yearly, premium' 
      }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ⭐ 6. PRICE VALIDASYONU
    const priceCurrency = currency || 'USD';
    if (!validateCurrency(priceCurrency)) {
      return new Response(JSON.stringify({ 
        error: 'Invalid currency. Allowed: USD, EUR, GBP, TRY' 
      }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    const expectedPrice = getPlanPrice(planType, priceCurrency);
    const providedAmount = amount || expectedPrice;

    // Fiyat doğrulama (client tarafından gönderilen fiyatı kontrol et)
    if (providedAmount !== expectedPrice) {
      console.warn(`⚠️ Price mismatch: Expected ${expectedPrice}, got ${providedAmount}`);
      // Client'ın gönderdiği fiyatı kullanma, server tarafındaki fiyatı kullan
      // return new Response(JSON.stringify({ 
      //   error: 'Invalid amount',
      //   expected: expectedPrice
      // }), {
      //   status: 400,
      //   headers: { ...headers, 'Content-Type': 'application/json' }
      // });
    }

    const finalAmount = expectedPrice; // Server tarafındaki fiyatı kullan
    const payCurrencyFinal = payCurrency || 'BTC';
    
    if (!VALID_PAY_CURRENCIES.includes(payCurrencyFinal)) {
      return new Response(JSON.stringify({ 
        error: 'Invalid pay currency. Allowed: BTC, LTC, ETH, XRP, BCH, DOGE' 
      }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ⭐ 7. KULLANICI DOĞRULAMA (Opsiyonel)
    if (supabaseClient) {
      try {
        const { data: user, error } = await supabaseClient
          .from('user_profiles')
          .select('id, plan')
          .eq('id', userId)
          .single();
        
        if (error || !user) {
          console.warn(`⚠️ User ${userId} not found in database`);
          // Yine de devam et - belki yeni kullanıcı
        }
      } catch (e) {
        console.warn('⚠️ User validation failed:', e);
      }
    }

    console.log(`📝 Creating invoice: User ${userId}, Plan ${planType}, Amount ${finalAmount} ${priceCurrency}`);

    // ⭐ 8. WEBHOOK URL
    const webhookUrl = NOWPAYMENTS_WEBHOOK_URL || 
      'https://odasapyhtdopbnlfhwde.supabase.co/functions/v1/nowpayment-webhook';

    // ⭐ 9. ORDER ID
    const orderId = `${userId}_${planType}_${Date.now()}`;

    // ⭐ 10. NOWPAYMENTS API CALL
    const payload = {
      price_amount: finalAmount,
      price_currency: priceCurrency,
      pay_currency: payCurrencyFinal,
      ipn_callback_url: webhookUrl,
      success_url: successUrl || 'https://wawejournal.com/dashboard.html',
      cancel_url: cancelUrl || 'https://wawejournal.com/settings.html',
      order_id: orderId,
      order_description: `Wawe Journal - ${planType.charAt(0).toUpperCase() + planType.slice(1)} Plan Subscription`
    };

    console.log(`📤 Sending to NowPayments: ${JSON.stringify(payload)}`);

    const response = await fetchWithTimeout(
      API_URL + '/invoice',
      {
        method: 'POST',
        headers: {
          'x-api-key': NOWPAYMENTS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      },
      15000
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ NowPayments API error:', data);
      
      // Hata mesajını güvenli şekilde ilet
      const errorMessage = data.message || 'Payment creation failed';
      const errorCode = data.code || response.status;
      
      return new Response(JSON.stringify({ 
        error: errorMessage,
        code: errorCode,
        details: data.details || null
      }), {
        status: response.status,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    console.log(`✅ Invoice created: ${data.invoice_id}`);

    // ⭐ 11. PAYMENT LOG (opsiyonel)
    if (supabaseClient) {
      try {
        await supabaseClient
          .from('payments')
          .insert([{
            user_id: userId,
            invoice_id: data.invoice_id,
            order_id: orderId,
            amount: finalAmount,
            currency: priceCurrency,
            plan_type: planType,
            payment_status: 'pending',
            pay_currency: payCurrencyFinal,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]);
        console.log('📝 Payment log created');
      } catch (e) {
        console.warn('⚠️ Failed to log payment:', e);
        // Log hatası kritik değil, devam et
      }
    }

    // ⭐ 12. RESPONSE
    const rateHeaders = {
      'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
      'X-RateLimit-Remaining': String(rateLimit.remaining),
      'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetIn / 1000))
    };

    return new Response(JSON.stringify({
      success: true,
      invoiceId: data.invoice_id,
      invoiceUrl: data.invoice_url,
      orderId: data.order_id || orderId,
      payCurrency: payCurrencyFinal,
      amount: finalAmount,
      expiresAt: data.expiration_date || null
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
    
    if (error.name === 'AbortError') {
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