// supabase/functions/nowpayment-webhook/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ⭐ Environment variables
const NOWPAYMENTS_IPN_SECRET = Deno.env.get('NOWPAYMENTS_IPN_SECRET') || '';
const NOWPAYMENTS_ENV = Deno.env.get('NOWPAYMENTS_ENV') || 'production';
const ALLOWED_IPS = Deno.env.get('NOWPAYMENTS_ALLOWED_IPS')?.split(',') || [];

// ⭐ Telegram ayarları — sadece env'den okunuyor, hardcoded fallback YOK.
// Gerçek değerleri Supabase Dashboard > Edge Functions > Secrets içine
// TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID olarak ekle. Eğer bu token daha
// önce herhangi bir yerde (kod, log, ekran görüntüsü) açığa çıktıysa,
// BotFather'da /revoke ile iptal edip yenisini oluştur.
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID') || '';

// ⭐ Supabase client — SERVICE_ROLE_KEY kullanılıyor çünkü bu fonksiyon
// webhook'u çağıran kim olursa olsun *başka* bir user_id'nin user_profiles
// satırını update etmesi gerekiyor. ANON key RLS tarafından engellenirdi.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY genelde Supabase tarafından
// edge function'lara otomatik enjekte edilir.
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

function getCorsHeaders(origin: string | null): Record<string, string> {
  const isAllowed = !!(origin && ALLOWED_ORIGINS.includes(origin));
  return {
    'Access-Control-Allow-Origin': (isAllowed && origin) ? origin : ALLOWED_ORIGINS[0],
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
  if (planType === '6months' || planType === '6_months') return 180;
  if (planType === '3months' || planType === '3_months') return 90;
  if (planType === 'monthly' || planType === 'month') return 30;
  if (planType === 'test') return 1;   // geliştirici test planı: 1 gün
  return 30;
}

// ⭐ Sabit zamanlı (constant-time) string karşılaştırma.
// Normal === karşılaştırması karakter karakter erken çıkış yapabildiği için
// teorik olarak timing-attack ile imzanın tahmin edilmesine küçük bir zemin
// oluşturabilir. Bu, karşılaştırma süresini içerikten bağımsız hale getirir.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ⭐ Anahtarları alfabetik olarak özyinelemeli sıralar (NOWPayments IPN standardı)
function sortObjectKeys(obj: any): any {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }
  return Object.keys(obj)
    .sort()
    .reduce((acc: any, key: string) => {
      acc[key] = sortObjectKeys(obj[key]);
      return acc;
    }, {});
}

// ⭐ WebCrypto ile HMAC hesaplama
async function computeHmacHex(message: string, secret: string, algorithm: 'SHA-512' | 'SHA-256'): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const bodyData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign']
  );

  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    bodyData
  );

  return Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ⭐ NOWPayments IPN Doğrulama
// NOWPayments resmi şartnamesine göre:
// 1. Gelen parametrelerin anahtarları alfabetik olarak sıralanır.
// 2. JSON.stringify ile string'e dönüştürülür.
// 3. IPN Secret Key kullanılarak HMAC-SHA512 hesaplanır.
// 4. x-nowpayments-sig başlığındaki hex imza ile karşılaştırılır.
async function verifySignature(payloadObj: any, rawBody: string, signature: string, secret: string): Promise<boolean> {
  try {
    const cleanSig = signature.trim().toLowerCase();

    // 1. Resmi NOWPayments Yolu: Alfabetik sıralı JSON + HMAC-SHA512
    if (payloadObj && typeof payloadObj === 'object') {
      const sortedObj = sortObjectKeys(payloadObj);
      const sortedJson = JSON.stringify(sortedObj);
      const hmac512Sorted = await computeHmacHex(sortedJson, secret, 'SHA-512');
      if (timingSafeEqual(hmac512Sorted, cleanSig)) {
        return true;
      }

      // Flat sıralama kontrolü (sadece en üst düzey anahtarlar)
      const flatSortedJson = JSON.stringify(payloadObj, Object.keys(payloadObj).sort());
      if (flatSortedJson !== sortedJson) {
        const hmac512Flat = await computeHmacHex(flatSortedJson, secret, 'SHA-512');
        if (timingSafeEqual(hmac512Flat, cleanSig)) {
          return true;
        }
      }
    }

    // 2. Fallback: Ham body + HMAC-SHA512
    const hmac512Raw = await computeHmacHex(rawBody, secret, 'SHA-512');
    if (timingSafeEqual(hmac512Raw, cleanSig)) {
      return true;
    }

    // 3. Fallback: Test araçları veya eski simülasyonlar için SHA-256
    if (payloadObj && typeof payloadObj === 'object') {
      const sortedJson = JSON.stringify(sortObjectKeys(payloadObj));
      const hmac256 = await computeHmacHex(sortedJson, secret, 'SHA-256');
      if (timingSafeEqual(hmac256, cleanSig)) {
        return true;
      }
    }
    const hmac256Raw = await computeHmacHex(rawBody, secret, 'SHA-256');
    if (timingSafeEqual(hmac256Raw, cleanSig)) {
      return true;
    }

    console.warn('⚠️ NOWPayments signature mismatch. Received sig prefix:', cleanSig.slice(0, 10));
    return false;
  } catch (error) {
    console.error('❌ Signature verification error:', error);
    return false;
  }
}

// ⭐ IP kontrolü — bloklamıyor, sadece izliyor/logluyor.
// NOWPayments IPN bildirimlerini sabit/tek bir IP adresinden göndermiyor ve
// resmi olarak sabit bir IP listesi yayınlamıyor, bu yüzden IP whitelist'ini
// sert bir blok olarak kullanmak er ya da geç gerçek bir ödemeyi keser.
// Gerçek güvenlik katmanı x-nowpayments-sig imza doğrulamasıdır (aşağıda,
// ARTIK ZORUNLU).
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

// ⭐ Replay attack koruması (in-memory, best-effort — asıl garanti processPayment
// içindeki DB tabanlı idempotency kontrolüdür, aşağıda).
const processedInvoices = new Map<string, { timestamp: number, status: string }>();

function isInvoiceProcessed(invoiceId: string, status: string): boolean {
  const now = Date.now();
  const record = processedInvoices.get(invoiceId);

  if (record && (now - record.timestamp) < 5 * 60 * 1000 && record.status === status) {
    console.warn(`⏳ Invoice ${invoiceId} already processed with status ${status} (within 5 min)`);
    return true;
  }
  return false;
}

// Yalnızca işlem BAŞARIYLA bittikten sonra çağrılır. Eskiden kayıt işlemeden önce
// yazılıyordu; işleme hata verirse NOWPayments'ın yeniden denemesi "Already processed"
// ile boşa çıkıyordu.
function markInvoiceProcessed(invoiceId: string, status: string): void {
  processedInvoices.set(invoiceId, { timestamp: Date.now(), status });
}

// Yeniden denemenin anlamsız olduğu kalıcı ret (ör. tutar uyuşmazlığı).
class PaymentRejectedError extends Error {}

// 🔒 Ödenen tutar/para birimi, create-payment'ın kaydettiği beklenen değerle eşleşmeli.
// Eşleşmezse (ör. istemci fiyatı kurcaladıysa) premium AKTİFLEŞTİRİLMEZ.
async function verifyExpectedAmount(orderId: string | undefined, payload: any): Promise<{ referral_code: string | null }> {
  if (!orderId) {
    throw new PaymentRejectedError('Missing order_id, cannot verify expected amount');
  }

  const { data: initial, error } = await supabase
    .from('payments')
    .select('amount, currency, referral_code')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Geçici DB hatası: 5xx dönülsün ki NOWPayments tekrar denesin
    throw new Error(`Could not load expected amount: ${error.message}`);
  }
  if (!initial) {
    // Kayıt henüz yazılmamış olabilir: tekrar denensin
    throw new Error(`No initial payment record for order ${orderId}`);
  }

  const expectedAmount = Number(initial.amount);
  const paidPrice = Number(payload.price_amount);
  const expectedCurrency = String(initial.currency || '').toLowerCase();
  const paidCurrency = String(payload.price_currency || '').toLowerCase();

  if (!Number.isFinite(paidPrice) || Math.abs(paidPrice - expectedAmount) > 0.01) {
    throw new PaymentRejectedError(`Amount mismatch for order ${orderId}: expected ${expectedAmount}, got ${payload.price_amount}`);
  }
  if (expectedCurrency !== paidCurrency) {
    throw new PaymentRejectedError(`Currency mismatch for order ${orderId}: expected ${expectedCurrency}, got ${paidCurrency}`);
  }

  return { referral_code: initial.referral_code ? String(initial.referral_code) : null };
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
// Plan uzatma + ödeme kaydı + referral sayacı TEK TRANSACTION'da (process_payment_finished RPC) yapılır.
// Eskiden "kontrol et sonra uygula" idi: aynı 'finished' bildirimi iki kez gelirse (yeniden deneme ya da
// aynı anda iki istek) plan iki kez uzuyor ve influencer komisyonu iki kez yazılıyordu.
async function processPayment(userId: string, planType: string, invoiceId: string, payload: any) {
  // 🔒 Ödenen tutar/para birimi, ödeme başlatılırken kaydedilen beklenen değerle eşleşmeli (yan etkisiz kontrol)
  const initial = await verifyExpectedAmount(payload.order_id, payload);

  // Referral kodu: sunucunun doğrulayıp ilk ödeme kaydına yazdığı değer esastır (site içi/QR ödemelerde de çalışır).
  // Yedek: açıklama metnindeki "(Ref: KOD -%10)" (eski regex "-%10" ekini yakalayamıyordu).
  let appliedReferral: string | null = initial.referral_code ? initial.referral_code.toUpperCase() : null;
  if (!appliedReferral && payload.order_description) {
    const refMatch = String(payload.order_description).match(/\(Ref:\s*([A-Z0-9_-]+)(?:\s+-%[\d.]+)?\s*\)/i);
    if (refMatch && refMatch[1]) appliedReferral = refMatch[1].toUpperCase();
  }

  const durationDays = getPlanDuration(planType);

  const { data: result, error: rpcError } = await supabase.rpc('process_payment_finished', {
    p_user_id: userId,
    p_plan_type: planType,
    p_invoice_id: invoiceId,
    p_order_id: payload.order_id || null,
    p_amount: Number(payload.price_amount ?? payload.pay_amount ?? 0),
    p_currency: String(payload.price_currency || payload.pay_currency || 'USD'),
    p_paid_amount: Number(payload.actually_paid ?? payload.pay_amount ?? 0),
    p_paid_currency: String(payload.pay_currency || 'USD'),
    p_pay_address: payload.pay_address || null,
    p_referral_code: appliedReferral,
    p_duration_days: durationDays
  });

  if (rpcError) {
    // Geçici hata (ya da migration uygulanmamış): 5xx dönülür, NOWPayments yeniden dener
    throw new Error(`process_payment_finished failed: ${rpcError.message}`);
  }

  if (result?.already_processed) {
    console.warn(`⏳ Invoice ${invoiceId} zaten işlenmiş, plan tekrar uzatılmadı.`);
    return { success: true, expiresAt: new Date(result.expires_at ?? Date.now()), alreadyProcessed: true };
  }

  const expiresAt = new Date(result.expires_at);
  console.log(`💎 Upgraded user ${userId} until ${expiresAt.toISOString()}${appliedReferral ? ` (ref: ${appliedReferral})` : ''}`);

  // ⭐ Kullanıcıya sistem bildirimi ekle (başarısızlığı ödemeyi etkilemez)
  try {
    const planLabel = (planType === 'test') ? '1 günlük test' :
      (planType === 'yearly' || planType === 'year') ? '1 yıllık' :
      (planType === '6months' || planType === '6_months') ? '6 aylık' :
      (planType === '3months' || planType === '3_months') ? '3 aylık' : '1 aylık';
    const amt = payload.actually_paid || payload.pay_amount || payload.price_amount || 0;
    const cur = payload.pay_currency || payload.price_currency || 'USD';
    await supabase.from('notifications').insert([{
      user_id: userId,
      type: 'premium',
      title_key: 'noti.payment_success_title',
      message_key: 'noti.payment_success_desc',
      meta_data: { plan: planLabel, amount: amt, curr: cur },
      is_read: false,
      created_at: new Date().toISOString()
    }]);
  } catch (notifErr) {
    console.warn('⚠️ Could not insert payment notification into notifications table:', notifErr);
  }

  // ⭐ Telegram bildirimi gönder
  await sendTelegramNotification(userId, result.email || 'Bilinmiyor', planType, expiresAt);

  return { success: true, expiresAt };
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

    // ⭐ 2. IP KONTROLÜ (SADECE PRODUCTION) — bloklamıyor, sadece logluyor.
    // Asıl doğrulama aşağıdaki imza kontrolünde yapılıyor.
    if (NOWPAYMENTS_ENV === 'production') {
      logUnexpectedIP(req);
    }

    // ⭐ 3. IPN SECRET ZORUNLU — FAIL CLOSED.
    // Önceki halde "if (NOWPAYMENTS_IPN_SECRET) { ...imza kontrolü... }"
    // şeklindeydi: secret env'de tanımlı değilse imza kontrolü tamamen
    // atlanıyor ve webhook imzasız her isteği kabul ediyordu. IP kontrolü
    // artık bloklamadığına göre bu, tek gerçek güvenlik katmanının
    // yanlışlıkla kapanabilmesi demekti. Şimdi secret yoksa fonksiyon
    // hemen 503 ile duruyor, güvensiz moda asla düşmüyor.
    if (!NOWPAYMENTS_IPN_SECRET) {
      console.error('❌ NOWPAYMENTS_IPN_SECRET not configured — refusing to process webhook');
      return new Response(JSON.stringify({ error: 'Webhook not configured' }), {
        status: 503,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ⭐ 4. RAW BODY
    let rawBody = await req.text();

    // Bazı istemci/proxy zincirleri body'nin başına görünmez bir UTF-8 BOM
    // (\uFEFF) karakteri ekleyebiliyor; bu JSON.parse'ı bozabilir.
    if (rawBody.charCodeAt(0) === 0xFEFF) {
      rawBody = rawBody.slice(1);
    }
    rawBody = rawBody.trim();

    console.log(`📩 Raw body (len=${rawBody.length}):`, rawBody.slice(0, 1000));

    if (!rawBody) {
      console.error('❌ Empty body received');
      return new Response(JSON.stringify({ error: 'Empty body' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ⭐ 5. JSON PARSE
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      console.error('❌ Invalid JSON payload. Raw body was:', rawBody);
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ⭐ 6. İMZA KONTROLÜ — ARTIK KOŞULSUZ ZORUNLU (secret'ın varlığı 3. adımda
    // zaten garanti edildi).
    const signature = req.headers.get('x-nowpayments-sig');

    if (!signature) {
      console.error('❌ Signature missing');
      return new Response(JSON.stringify({ error: 'Signature required' }), {
        status: 401,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    const isValid = await verifySignature(payload, rawBody, signature, NOWPAYMENTS_IPN_SECRET);
    if (!isValid) {
      console.error('❌ Invalid signature');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    console.log('✅ Signature verified');

    console.log('📨 Webhook received:', JSON.stringify({
      invoice_id: payload.invoice_id,
      order_id: payload.order_id,
      payment_status: payload.payment_status,
      price_amount: payload.price_amount,
      pay_amount: payload.pay_amount
    }, null, 2));

    // ⭐ 7. VERİ ÇIKARMA
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

    // ⭐ 8. REPLAY ATTACK KONTROLÜ
    if (isInvoiceProcessed(invoiceId, status)) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Already processed'
      }), {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ⭐ 9. USER ID VE PLAN TYPE ÇIKARMA
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

    // Fallback: order_id eksikse payments tablosundan invoice_id ile eşleştir
    if ((!userId || !planType) && invoiceId && invoiceId !== 'unknown') {
      try {
        const { data: dbPayment } = await supabase
          .from('payments')
          .select('user_id, plan_type')
          .eq('invoice_id', String(invoiceId))
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (dbPayment) {
          userId = dbPayment.user_id;
          planType = dbPayment.plan_type;
          console.log(`ℹ️ Recovered userId (${userId}) and planType (${planType}) from payments table`);
        }
      } catch (dbErr) {
        console.warn('⚠️ Could not lookup payment by invoice_id:', dbErr);
      }
    }

    // ⭐ 10. VALİDASYON
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

    // ⭐ 11. STATUS KONTROLÜ
    const isFinished = status === PAYMENT_STATUS.FINISHED;
    const isFailed = status === PAYMENT_STATUS.FAILED ||
      status === PAYMENT_STATUS.EXPIRED ||
      status === PAYMENT_STATUS.REFUNDED;

    // ⭐ 12. İŞLEME
    if (isFinished && userId && planType) {
      try {
        const result = await processPayment(userId, planType, invoiceId, payload);

        if (result.alreadyProcessed) {
          console.log(`ℹ️ Invoice ${invoiceId} zaten işlenmişti, tekrar uzatma yapılmadı.`);
        } else {
          console.log(`✅ User ${userId} upgraded successfully! Expires: ${result.expiresAt.toISOString()}`);
        }

        markInvoiceProcessed(invoiceId, status);
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

        // Kalıcı ret (tutar/para birimi uyuşmazlığı): tekrar denemenin faydası yok, 200 dön.
        if (error instanceof PaymentRejectedError) {
          markInvoiceProcessed(invoiceId, status);
          return new Response(JSON.stringify({
            success: false,
            error: 'Payment rejected'
          }), {
            status: 200,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }

        // Geçici hata: 5xx dön ki NOWPayments bildirimi yeniden göndersin.
        return new Response(JSON.stringify({
          success: false,
          error: 'Processing failed, will retry'
        }), {
          status: 500,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    // ⭐ 13. FAILED/EXPIRED
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
      markInvoiceProcessed(invoiceId, status);

      return new Response(JSON.stringify({
        success: false,
        message: `Payment ${status}`
      }), {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    // ⭐ 14. CONFIRMING/CONFIRMED
    console.log(`⏳ Payment ${invoiceId} is ${status}, waiting for finalization...`);
    markInvoiceProcessed(invoiceId, status);
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