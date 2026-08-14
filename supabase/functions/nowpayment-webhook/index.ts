// supabase/functions/nowpayment-webhook/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// ⭐ Environment variables
const NOWPAYMENTS_IPN_SECRET = Deno.env.get('NOWPAYMENTS_IPN_SECRET') || '';
const NOWPAYMENTS_ENV = Deno.env.get('NOWPAYMENTS_ENV') || 'production';
const ALLOWED_IPS = Deno.env.get('NOWPAYMENTS_ALLOWED_IPS')?.split(',') || [];

// ⭐ Telegram ayarları
// FIX: hardcoded bot token / chat id fallback KALDIRILDI.
// O token artık bu konuşmada görünür durumda olduğu için sızmış sayılır —
// BotFather üzerinden /revoke ile derhal iptal edip yeni bir token üret,
// ardından Supabase project secrets içine TELEGRAM_BOT_TOKEN olarak ekle.
// UYARI: Buraya token'ı sabit (hardcoded) fallback olarak YAZMA — daha önce
// bu dosyada açıkta kalmış bir token vardı. Değer olmadan (boş string) bırak,
// gerçek token'ı sadece Supabase Dashboard > Edge Functions > Secrets
// içine TELEGRAM_BOT_TOKEN olarak ekle. Eski token hâlâ aktifse BotFather'da
// /revoke ile iptal edip yenisini oluştur.
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID') || '';

// ⭐ Supabase client
// FIX: ANON_KEY yerine SERVICE_ROLE_KEY kullanıyoruz.
// Bu fonksiyon, webhook'u çağıran kişi kim olursa olsun *başka* bir user_id'nin
// user_profiles satırını update etmesi gerekiyor. ANON key ile bu, RLS
// politikaları tarafından sessizce (veya hata ile) engellenir. SERVICE_ROLE_KEY
// RLS'i bypass eder ve sadece sunucu tarafında (bu edge function içinde)
// kullanılmalı — asla client koduna koyma.
// SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY, Supabase tarafından edge
// function'lara otomatik enjekte edilir; genelde ekstra secret set etmen gerekmez.
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ⭐ CORS headers
const ALLOWED_ORIGINS = [
  'https://your-domain.com',
  'https://wawejournal.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4200',
  'https://wawe-journal.pages.dev',
  'https://6d35b7d5.wawe-journal.pages.dev'
];

function getCorsHeaders(origin: string | null) {
  const isAllowed = origin && ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-nowpayments-sig, x-nowpayments-ipn',
    'Access-Control-Max-Age': '86400',
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

// ⭐ IP kontrolü — ARTIK BLOKLAMIYOR, sadece izliyor/logluyor.
// FIX: NOWPayments IPN bildirimlerini sabit/tek bir IP adresinden göndermiyor
// (gerçek prod loglarında 51.75.77.69 görüldü, başka entegratörlerde farklı
// IP'ler görülüyor). NOWPayments resmi olarak sabit bir IP listesi yayınlamıyor,
// bu yüzden IP whitelist'i sert bir blok (403) olarak kullanmak er ya da geç
// gerçek bir ödemeyi bloklar — tam olarak şimdi yaşadığın sorun bu.
// Gerçek güvenlik katmanı zaten x-nowpayments-sig imza doğrulaması (aşağıda).
// IP kontrolünü tamamen kaldırmak istemedim, sadece artık isteği reddetmiyor,
// beklenmedik bir IP geldiğinde sadece log'a düşürüyor — izlemek istersen orada.
function logUnexpectedIP(request: Request): void {
  if (ALLOWED_IPS.length === 0) return;

  const cfIp = request.headers.get('cf-connecting-ip');
  const forwardedIp = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');

  const clientIp = cfIp || forwardedIp?.split(',')[0] || realIp || 'unknown';

  if (!ALLOWED_IPS.includes(clientIp)) {
    console.warn(`ℹ️ Listede olmayan IP'den istek geldi (bloklanmadı): ${clientIp}`);
  }
}

// ⭐ Replay attack koruması
// NOT: Bu Map, function instance hafızasında tutuluyor. Edge function'lar
// birden fazla izole instance'da çalışabildiği ve soğuk başlangıçlarda
// sıfırlandığı için bu koruma "best effort"tur, %100 garanti değildir.
// Kalıcı/garantili koruma istersen invoice_id'yi bir DB tablosuna
// UNIQUE constraint ile yazmalısın.
const processedInvoices = new Map<string, { timestamp: number, status: string }>();

function isInvoiceProcessed(invoiceId: string, status: string): boolean {
  const now = Date.now();
  const record = processedInvoices.get(invoiceId);

  if (record && (now - record.timestamp) < 5 * 60 * 1000) {
    if (record.status === status) {
      console.warn(`⏳ Invoice ${invoiceId} already processed with status ${status} (within 5 min)`);
      return true;
    }
  }

  processedInvoices.set(invoiceId, { timestamp: now, status });
  return false;
}

// ⭐ Telegram bildirimi gönder
async function sendTelegramNotification(userId: string, email: string, planType: string, expiresAt: Date) {
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.warn('⚠️ Telegram ayarları eksik (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID secret olarak set edilmemiş)');
      return;
    }

    const formattedDate = expiresAt.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    const message = `🎉 YENİ PREMIUM KAYDI!
    
👤 Kullanıcı ID: ${userId}
📧 Email: ${email}
📅 Plan: ${planType}
🗓️ Bitiş Tarihi: ${formattedDate}
⏰ Ödeme Tarihi: ${new Date().toLocaleString('tr-TR')}

✅ Premium başarıyla aktifleştirildi!`;

    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'HTML'
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Telegram gönderilemedi:', error);
    } else {
      console.log('✅ Telegram bildirimi gönderildi!');
    }

  } catch (error) {
    console.error('❌ Telegram hatası:', error);
  }
}

// ⭐ Process payment
async function processPayment(userId: string, planType: string, invoiceId: string, payload: any) {
  // ⭐ FIX: Kalıcı idempotency kontrolü — bu invoice_id daha önce 'finished'
  // olarak işlenmiş mi diye DB'den bak. In-memory Map (processedInvoices)
  // sadece 5 dakikalık ve function instance'ı yeniden başlarsa sıfırlanıyor;
  // NOWPayments aynı 'finished' bildirimini birden fazla kez (recurrent
  // notification) gönderebildiği için, 5 dakikadan geç gelen veya instance
  // restart sonrası gelen tekrar bir çağrı süreyi bir daha uzatıyordu
  // (1 aylık planın 60 gün görünmesinin sebebi buydu).
  const { data: existingPayment } = await supabase
    .from('payments')
    .select('id')
    .eq('invoice_id', invoiceId)
    .eq('payment_status', 'finished')
    .maybeSingle();

  if (existingPayment) {
    console.warn(`⏳ Invoice ${invoiceId} zaten 'finished' olarak işlenmiş, plan tekrar uzatılmıyor.`);
    const { data: currentProfile } = await supabase
      .from('user_profiles')
      .select('plan_expires_at')
      .eq('id', userId)
      .single();
    return { success: true, expiresAt: new Date(currentProfile?.plan_expires_at ?? Date.now()), alreadyProcessed: true };
  }

  // ⭐ user_profiles tablosunu kullan
  const { data: profile, error: fetchError } = await supabase
    .from('user_profiles')
    .select('plan, plan_expires_at, email')
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
    expiresAt = new Date(profile.plan_expires_at);
    expiresAt.setDate(expiresAt.getDate() + durationDays);
  } else {
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);
  }

  console.log(`💎 Upgrading user ${userId}: ${isCurrentlyPremium ? 'EXTENDING' : 'NEW'} until ${expiresAt.toISOString()}`);

  // ⭐ Update user's plan
  const { error: updateError } = await supabase
    .from('user_profiles')
    .update({
      plan: 'premium',
      plan_expires_at: expiresAt.toISOString()
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
      created_at: new Date().toISOString()
    }]);

  // ⭐ Telegram bildirimi gönder
  const email = profile.email || 'Bilinmiyor';
  await sendTelegramNotification(userId, email, planType, expiresAt);

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

    // ⭐ 2. IP KONTROLÜ (SADECE PRODUCTION) — artık bloklamıyor, sadece logluyor.
    // Asıl doğrulama aşağıdaki x-nowpayments-sig imza kontrolünde yapılıyor.
    if (NOWPAYMENTS_ENV === 'production') {
      logUnexpectedIP(req);
    }

    // ⭐ 3. RAW BODY VE İMZA KONTROLÜ
    let rawBody = await req.text();

    // FIX: Bazı istemci/proxy zincirleri body'nin başına görünmez bir
    // UTF-8 BOM (\uFEFF) karakteri ekleyebiliyor. Bu karakter JSON
    // spesifikasyonunda geçerli bir boşluk sayılmadığı için JSON.parse
    // içerik tamamen doğru olsa bile "Unexpected token" hatası fırlatır.
    // Ayrıca baştaki/sondaki whitespace'i de temizliyoruz.
    if (rawBody.charCodeAt(0) === 0xFEFF) {
      rawBody = rawBody.slice(1);
    }
    rawBody = rawBody.trim();

    // FIX: Body'nin gerçekte ne geldiğini function log'larına yazıyoruz.
    // Bu satır sayesinde "Invalid JSON" hatası tekrar alınırsa, Supabase
    // Dashboard > Edge Functions > nowpayment-webhook > Logs kısmında
    // gerçek ham içeriği görüp kesin sebebi tespit edebilirsin.
    console.log(`📩 Raw body (len=${rawBody.length}):`, rawBody.slice(0, 1000));

    if (!rawBody) {
      console.error('❌ Empty body received');
      return new Response(JSON.stringify({ error: 'Empty body' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

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
      console.error('❌ Invalid JSON payload. Raw body was:', rawBody);
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
      console.log('📦 Full payload:', JSON.stringify(payload, null, 2));

      return new Response(JSON.stringify({
        success: false,
        error: 'Missing userId or planType',
        debug: { userId, planType, order_id }
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

        if (result.alreadyProcessed) {
          console.log(`ℹ️ Invoice ${invoiceId} zaten işlenmişti, tekrar uzatma yapılmadı.`);
        } else {
          console.log(`✅ User ${userId} upgraded successfully! Expires: ${result.expiresAt.toISOString()}`);
        }

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
          status: 200,
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
          created_at: new Date().toISOString()
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
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      }
    });
  }
});

