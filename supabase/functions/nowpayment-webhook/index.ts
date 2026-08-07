// supabase/functions/nowpayment-webhook/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// ⭐ Environment variables
const NOWPAYMENTS_IPN_SECRET = Deno.env.get('NOWPAYMENTS_IPN_SECRET') || '';
const NOWPAYMENTS_ENV = Deno.env.get('NOWPAYMENTS_ENV') || 'production';
const ALLOWED_IPS = Deno.env.get('NOWPAYMENTS_ALLOWED_IPS')?.split(',') || [];

// ⭐ Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ⭐ CORS headers - SADECE kendi domain'inize izin verin!
const ALLOWED_ORIGINS = [
  'https://your-domain.com',
  'https://wawejournal.com',
  'http://localhost:5173', // Development için
];

function getCorsHeaders(origin: string | null) {
  const isAllowed = origin && ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-nowpayments-sig, x-nowpayments-ipn',
    'Access-Control-Max-Age': '86400',
    // ⭐ Güvenlik başlıkları
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };
}

// ⭐ Payment status mapping
const PAYMENT_STATUS = {
  CONFIRMING: 'confirming',
  CONFIRMED: 'confirmed',
  SENDING: 'sending',
  PARTIALLY_PAID: 'partially_paid',
  FINISHED: 'finished',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  EXPIRED: 'expired'
};

// ⭐ Plan mapping
const PLAN_MAPPING: Record<string, string> = {
  'monthly': 'premium',
  'yearly': 'premium',
  'premium': 'premium',
  'free': 'free'
};

// ⭐ Get plan duration in days
function getPlanDuration(planType: string): number {
  if (planType === 'yearly' || planType === 'year') return 365;
  if (planType === 'monthly' || planType === 'month') return 30;
  return 30;
}

// ⭐ Verify HMAC signature
async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const bodyData = encoder.encode(payload);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBytes = await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      bodyData
    );
    
    const computedSignature = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    const isValid = computedSignature === signature;
    
    if (!isValid) {
      console.warn('⚠️ Signature mismatch:', { computed: computedSignature.slice(0, 10), received: signature.slice(0, 10) });
    }
    
    return isValid;
  } catch (error) {
    console.error('❌ Signature verification error:', error);
    return false;
  }
}

// ⭐ IP Whitelist kontrolü
function isIPAllowed(request: Request): boolean {
  if (ALLOWED_IPS.length === 0) {
    console.warn('⚠️ No IP whitelist configured! Allowing all IPs (development mode)');
    return true;
  }
  
  const cfIp = request.headers.get('cf-connecting-ip');
  const forwardedIp = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  
  const clientIp = cfIp || forwardedIp?.split(',')[0] || realIp || 'unknown';
  
  const isAllowed = ALLOWED_IPS.includes(clientIp);
  
  if (!isAllowed) {
    console.warn(`⛔ IP blocked: ${clientIp}`);
  }
  
  return isAllowed;
}

// ⭐ Replay attack koruması
const processedInvoices = new Map<string, { timestamp: number, status: string }>();

function isInvoiceProcessed(invoiceId: string, status: string): boolean {
  const now = Date.now();
  const record = processedInvoices.get(invoiceId);
  
  // 5 dakika içinde aynı invoice ve status tekrar işlenemez
  if (record && (now - record.timestamp) < 5 * 60 * 1000) {
    if (record.status === status) {
      console.warn(`⏳ Invoice ${invoiceId} already processed with status ${status} (within 5 min)`);
      return true;
    }
  }
  
  // Eğer 5 dakika geçtiyse veya farklı status ise, güncelle
  processedInvoices.set(invoiceId, { timestamp: now, status });
  return false;
}

// ⭐ Process payment - Transaction ile
async function processPayment(userId: string, planType: string, invoiceId: string, payload: any) {
  // Transaction başlat
  const { data: profile, error: fetchError } = await supabase
    .from('user_profiles')
    .select('plan, plan_expires_at')
    .eq('id', userId)
    .single();
  
  if (fetchError) {
    throw new Error(`User not found: ${fetchError.message}`);
  }
  
  // ⭐ Zaten premium mu kontrol et
  const isCurrentlyPremium = profile.plan === 'premium' && 
                            profile.plan_expires_at && 
                            new Date(profile.plan_expires_at) > new Date();
  
  let expiresAt: Date;
  const durationDays = getPlanDuration(planType);
  
  if (isCurrentlyPremium) {
    // Premium zaten aktifse, süresini uzat
    expiresAt = new Date(profile.plan_expires_at);
    expiresAt.setDate(expiresAt.getDate() + durationDays);
  } else {
    // Değilse, bugünden itibaren başlat
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);
  }
  
  console.log(`💎 Upgrading user ${userId}: ${isCurrentlyPremium ? 'EXTENDING' : 'NEW'} until ${expiresAt.toISOString()}`);
  
  // ⭐ Update user's plan
  const { error: updateError } = await supabase
    .from('user_profiles')
    .update({
      plan: 'premium',
      plan_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);
  
  if (updateError) {
    throw new Error(`Failed to update user plan: ${updateError.message}`);
  }
  
  // ⭐ Log the payment
  await supabase
    .from('payments')
    .insert([{
      user_id: userId,
      invoice_id: invoiceId,
      amount: payload.price_amount || payload.pay_amount || 0,
      currency: payload.price_currency || payload.pay_currency || 'USD',
      plan_type: planType,
      payment_status: payload.payment_status,
      paid_amount: payload.actually_paid || payload.pay_amount || 0,
      paid_currency: payload.pay_currency || 'USD',
      pay_address: payload.pay_address || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }]);
  
  return { success: true, expiresAt };
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

    // ⭐ 2. IP WHITELIST KONTROLÜ
    if (!isIPAllowed(req)) {
      console.warn('⛔ Blocked request from unauthorized IP');
      return new Response(JSON.stringify({ error: 'Forbidden' }), { 
        status: 403,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ⭐ 3. RAW BODY VE İMZA KONTROLÜ
    const rawBody = await req.text();
    const signature = req.headers.get('x-nowpayments-sig');
    
    if (NOWPAYMENTS_IPN_SECRET) {
      if (!signature) {
        console.error('❌ Signature missing');
        return new Response(JSON.stringify({ error: 'Signature required' }), { 
          status: 401,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      
      const isValid = await verifySignature(rawBody, signature, NOWPAYMENTS_IPN_SECRET);
      if (!isValid) {
        console.error('❌ Invalid signature');
        return new Response(JSON.stringify({ error: 'Invalid signature' }), { 
          status: 401,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
      console.log('✅ Signature verified');
    }

    // ⭐ 4. JSON PARSE
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      console.error('❌ Invalid JSON payload');
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { 
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    console.log('📨 Webhook received:', JSON.stringify({
      invoice_id: payload.invoice_id,
      order_id: payload.order_id,
      payment_status: payload.payment_status,
      price_amount: payload.price_amount,
      pay_amount: payload.pay_amount
    }, null, 2));

    // ⭐ 5. VERİ ÇIKARMA
    const {
      invoice_id,
      order_id,
      payment_status,
      price_amount,
      price_currency,
      pay_currency,
      actually_paid,
      pay_address,
      ipn_type
    } = payload;

    const invoiceId = invoice_id || order_id || 'unknown';
    const status = payment_status || ipn_type || 'unknown';

    // ⭐ 6. REPLAY ATTACK KONTROLÜ
    if (isInvoiceProcessed(invoiceId, status)) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Already processed' 
      }), {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ⭐ 7. USER ID VE PLAN TYPE ÇIKARMA
    let userId: string | null = null;
    let planType: string | null = null;
    
    if (order_id) {
      const parts = order_id.split('_');
      if (parts.length >= 2) {
        userId = parts[0];
        planType = parts[1];
      }
    }

    if (!userId && payload.user_id) {
      userId = payload.user_id;
    }

    // ⭐ 8. VALİDASYON
    if (!userId || !planType) {
      console.warn('⚠️ Missing userId or planType:', { userId, planType, order_id });
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing userId or planType' 
      }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ⭐ 9. STATUS KONTROLÜ
    const isFinished = status === PAYMENT_STATUS.FINISHED;
    const isFailed = status === PAYMENT_STATUS.FAILED || 
                     status === PAYMENT_STATUS.EXPIRED || 
                     status === PAYMENT_STATUS.REFUNDED;

    // ⭐ 10. İŞLEME
    if (isFinished && userId && planType) {
      try {
        const result = await processPayment(userId, planType, invoiceId, payload);
        
        console.log(`✅ User ${userId} upgraded successfully! Expires: ${result.expiresAt.toISOString()}`);
        
        return new Response(JSON.stringify({ 
          success: true, 
          message: `User ${userId} upgraded to premium`,
          expires_at: result.expiresAt.toISOString()
        }), {
          status: 200,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('❌ Error processing payment:', error);
        return new Response(JSON.stringify({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Processing failed'
        }), {
          status: 200, // Still 200 to avoid retries
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // ⭐ 11. FAILED/EXPIRED
    if (isFailed) {
      console.warn(`⚠️ Payment ${invoiceId} ${status}`);
      
      await supabase
        .from('payments')
        .insert([{
          user_id: userId,
          invoice_id: invoiceId,
          amount: price_amount || 0,
          currency: price_currency || pay_currency || 'USD',
          plan_type: planType,
          payment_status: status,
          pay_address: pay_address || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }]);

      return new Response(JSON.stringify({ 
        success: false, 
        message: `Payment ${status}` 
      }), {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ⭐ 12. CONFIRMING/CONFIRMED
    console.log(`⏳ Payment ${invoiceId} is ${status}, waiting for finalization...`);
    return new Response(JSON.stringify({ 
      success: true, 
      message: `Payment ${status}, waiting for finalization` 
    }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Webhook error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { 
        ...headers, 
        'Content-Type': 'application/json' 
      }
    });
  }
});