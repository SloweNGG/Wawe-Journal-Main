// supabase/functions/creem-webhook/index.ts
// Creem (kart ile ödeme) webhook'u: ödeme gelince Pro süresini uzatır.
//   - checkout.completed + tek seferlik ürün  -> plan süresi kadar (yıllık: 365 gün)
//   - subscription.paid (yinelenen ürün)      -> ödenen dönemin sonuna kadar (+1 gün tolerans)
//   - İptal, iade, ters ibraz, ödeme hatası   -> erişime dokunulmaz, yöneticiye Telegram bildirimi gider.
//     Erişim zaten ödenen süre bitince kendiliğinden kapanır; iade/ters ibrazda geri alma elle yapılır.
// Plan uzatma + ödeme kaydı process_payment_finished RPC'sinde tek transaction'dır ve işlem (transaction/order)
// ID'sine kilitlidir: Creem aynı olayı tekrar gönderirse plan ikinci kez uzamaz.
// Güvenlik: creem-signature başlığı = ham gövdenin CREEM_WEBHOOK_SECRET ile HMAC-SHA256'sı (hex). Secret yoksa 503.
// Kullanıcı ve plan yalnızca imzalı olaydan okunur: kullanıcı creem-checkout'un yazdığı metadata.user_id,
// plan ise ürün ID'sinin CREEM_PRODUCT_* ile eşleşmesidir.
// Partner payı yalnızca ilk satışta yazılır (abonelik yenilemelerinde yazılmaz). Kod önce creem-checkout'un
// doğrulayıp yazdığı metadata.referral_code'dan, yoksa ödemedeki Creem indiriminin kodundan okunur (müşteri kodu
// Creem sayfasına kendisi yazmış olabilir); yalnızca referral_codes'ta olan ve hâlâ kullanılabilir (aktif, süresi
// ve limiti dolmamış) kodlar sayılır. Kendi koduyla ödeyen partnere ve kodu daha önce kullanmış alıcıya pay
// yazılmaz (process_payment_finished). Kod limitine ulaşınca Creem'deki indirimi kaldırılır.
// İade / ters ibraz: partner payı reverse_referral_commission ile geri alınır (Pro süresi yine elle geri alınır).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CREEM_API_BASE, CREEM_API_KEY, codeUsable, removeCreemDiscount } from '../_shared/creem.ts';

const CREEM_WEBHOOK_SECRET = Deno.env.get('CREEM_WEBHOOK_SECRET') || '';
const PRODUCT_PLANS: Record<string, string> = {};
if (Deno.env.get('CREEM_PRODUCT_MONTHLY')) PRODUCT_PLANS[Deno.env.get('CREEM_PRODUCT_MONTHLY')!] = 'monthly';
if (Deno.env.get('CREEM_PRODUCT_YEARLY')) PRODUCT_PLANS[Deno.env.get('CREEM_PRODUCT_YEARLY')!] = 'yearly';

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID') || '';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const DAY_MS = 24 * 60 * 60 * 1000;
const RENEWAL_GRACE_MS = DAY_MS;   // yenileme ödemesi dönem sonunda çekilir; arada erişim kopmasın

function planDays(planType: string): number {
  return planType === 'yearly' ? 365 : 30;
}

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sendTelegram(text: string) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    });
    if (!res.ok) console.error('❌ Telegram gönderilemedi:', await res.text());
  } catch (err) {
    console.error('❌ Telegram hatası:', err);
  }
}

// Yinelenen abonelik: erişim ödenen dönemin sonuna (+tolerans) kadar uzar. Süre her seferinde mevcut bitişten
// hesaplanır, sabit 30 gün eklenmez: aksi halde 31 günlük aylarda yenileme öncesi erişim kopar, toleransla
// eklenirse de her ay birikerek kayardı. Kullanıcının bu dönemin ötesine uzanan başka bir Pro'su varsa
// (ör. kriptoyla alınmış yıllık) ödenen dönemin uzunluğu kadar eklenir.
async function subscriptionDays(userId: string, sub: any): Promise<number> {
  const start = Date.parse(sub?.current_period_start_date);
  const end = Date.parse(sub?.current_period_end_date);
  if (!isFinite(start) || !isFinite(end) || end <= start) return planDays(PRODUCT_PLANS[sub?.product?.id] || 'monthly');

  const { data: prof } = await supabase.from('user_profiles').select('plan, plan_expires_at').eq('id', userId).maybeSingle();
  const cur = prof?.plan === 'premium' ? Date.parse(prof.plan_expires_at) : NaN;
  const base = Math.max(Date.now(), isFinite(cur) ? cur : 0);

  if (base > end) return Math.max(1, Math.round((end - start) / DAY_MS));
  return Math.max(1, Math.ceil((end + RENEWAL_GRACE_MS - base) / DAY_MS));
}

// Ödemenin partner kodu.
//   code: komisyon yazılacak kod (yoksa null)
//   unresolved: indirim var ama kodu okunamadı (Creem API'ye ulaşılamadı) → Pro yine açılır, yönetici elle bakar
//   rejected: kod artık kullanılamıyor (pasif / süresi ya da limiti dolmuş) ama müşteri Creem sayfasına yazmış
interface Referral { code: string | null; unresolved?: boolean; rejected?: string }

async function resolveReferral(obj: any): Promise<Referral> {
  let code = String(obj.metadata?.referral_code || '').trim().toUpperCase();
  const fromMetadata = !!code;

  if (!code) {
    const d = obj.discount ?? obj.order?.discount;
    if (!d) return { code: null };
    // Abonelik/checkout nesnesinde indirim { id, discountCode, ... } olarak gelir; order.discount yalnızca ID'dir
    code = String((typeof d === 'object' && (d.discountCode || d.code)) || '').trim().toUpperCase();
    const discountId = typeof d === 'string' ? d : d.id;
    if (!code && discountId && CREEM_API_KEY) {
      try {
        const res = await fetch(CREEM_API_BASE + '/v1/discounts?discount_id=' + encodeURIComponent(discountId), {
          headers: { 'x-api-key': CREEM_API_KEY },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        code = String((await res.json())?.code || '').trim().toUpperCase();
      } catch (err) {
        console.error(`❌ Creem indirimi (${discountId}) okunamadı:`, err);
        return { code: null, unresolved: true };
      }
    }
    if (!code) return { code: null, unresolved: true };
  }

  // Creem panelinden açılmış, partnere ait olmayan bir indirim kodu da olabilir
  const { data: row, error } = await supabase.from('referral_codes')
    .select('code, is_active, expires_at, max_usage, usage_count, discount_percent').eq('code', code).maybeSingle();
  if (error) throw new Error(`referral_codes okunamadı: ${error.message}`);
  if (!row) return { code: null };
  // creem-checkout kodu ödeme sayfası açılırken doğruladı; o andan sonra pasif yapılmış olsa da satış geçerlidir.
  // Creem sayfasına elle yazılan kod ise şu an kullanılabilir olmalı.
  if (!fromMetadata && !codeUsable(row)) return { code: null, rejected: code };
  return { code };
}

// Satıştan sonra kod limitine ulaştıysa Creem'deki indirim kaldırılır (Creem sayfasına yazılarak da kullanılamasın)
async function retireCodeIfUsedUp(code: string) {
  try {
    const { data: row } = await supabase.from('referral_codes')
      .select('code, is_active, expires_at, max_usage, usage_count, discount_percent').eq('code', code).maybeSingle();
    if (row && !codeUsable(row)) await removeCreemDiscount(code);
  } catch (err) {
    console.warn('⚠️ Kod limiti kontrol edilemedi:', code, err);
  }
}

// İade / ters ibraz: ödemenin partner payını geri alır. Bizdeki ödeme kimliği abonelikte 'creem_' + işlem (tran_) ID'si,
// tek seferlik üründe 'creem_' + sipariş (ord_) ID'sidir; ikisi de aday olarak gönderilir.
async function reverseCommission(obj: any): Promise<string> {
  const idOf = (v: any) => (typeof v === 'string' ? v : v?.id) || null;
  const ids = [idOf(obj.transaction), idOf(obj.order), idOf(obj.subscription?.last_transaction)]
    .filter(Boolean).map((id) => 'creem_' + id);
  if (!ids.length) return 'Partner payı: ödeme kimliği bulunamadı, elle kontrol edin.';
  const { data, error } = await supabase.rpc('reverse_referral_commission', { p_invoice_ids: ids });
  if (error) {
    console.error('❌ reverse_referral_commission:', error.message);
    return `Partner payı geri alınamadı (${error.message}), elle kontrol edin.`;
  }
  return Number(data?.reversed) > 0
    ? `Partner payı geri alındı: -$${data.amount} (${(data.codes || []).join(', ')})`
    : 'Bu ödemede geri alınacak partner payı yok.';
}

// Abonelikte yalnızca ilk ödeme partner payı alır: aynı abonelik (order_id = abonelik ID'si) için daha önce
// tamamlanmış bir ödeme varsa bu bir yenilemedir.
async function isRenewal(subscriptionId: string): Promise<boolean> {
  const { data, error } = await supabase.from('payments').select('id')
    .eq('order_id', subscriptionId).eq('payment_status', 'finished').limit(1);
  if (error) throw new Error(`payments okunamadı: ${error.message}`);
  return (data || []).length > 0;
}

interface Grant {
  userId: string;
  planType: string;
  invoiceId: string;
  orderId: string | null;
  amount: number;
  currency: string;
  paidAmount: number;
  durationDays: number;
  referralCode: string | null;
}

async function grantPro(g: Grant): Promise<'ok' | 'duplicate' | 'user_not_found'> {
  const { data: result, error } = await supabase.rpc('process_payment_finished', {
    p_user_id: g.userId,
    p_plan_type: g.planType,
    p_invoice_id: g.invoiceId,
    p_order_id: g.orderId,
    p_amount: g.amount,
    p_currency: g.currency,
    p_paid_amount: g.paidAmount,
    p_paid_currency: g.currency,
    p_pay_address: null,
    p_referral_code: g.referralCode,
    p_duration_days: g.durationDays,
  });

  if (error) {
    if (String(error.message).includes('USER_NOT_FOUND')) return 'user_not_found';
    // Geçici hata: 5xx dönülür, Creem yeniden dener
    throw new Error(`process_payment_finished failed: ${error.message}`);
  }
  if (result?.already_processed) {
    console.warn(`⏳ ${g.invoiceId} zaten işlenmiş, plan tekrar uzatılmadı.`);
    return 'duplicate';
  }

  const expiresAt = new Date(result.expires_at);
  console.log(`💎 Creem: user ${g.userId} Pro ${expiresAt.toISOString()} tarihine kadar (${g.invoiceId})`);

  // Kullanıcıya sistem bildirimi (başarısızlığı ödemeyi etkilemez)
  try {
    await supabase.from('notifications').insert([{
      user_id: g.userId,
      type: 'premium',
      title_key: 'noti.payment_success_title',
      message_key: 'noti.payment_success_desc',
      meta_data: { plan: g.planType === 'yearly' ? '1 yıllık' : '1 aylık', amount: g.paidAmount, curr: g.currency },
      is_read: false,
      created_at: new Date().toISOString(),
    }]);
  } catch (err) {
    console.warn('⚠️ Ödeme bildirimi eklenemedi:', err);
  }

  await sendTelegram(`🎉 YENİ PRO KAYDI (Kart / Creem)

👤 Kullanıcı ID: ${g.userId}
📧 Email: ${result.email || 'Bilinmiyor'}
📅 Plan: ${g.planType}
💳 Tutar: ${g.paidAmount} ${g.currency}${g.referralCode ? `
🤝 Partner kodu: ${g.referralCode}` : ''}
🗓️ Bitiş Tarihi: ${expiresAt.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}`);

  return 'ok';
}

serve(async (req: Request) => {
  if (req.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);

  if (!CREEM_WEBHOOK_SECRET) {
    console.error('❌ CREEM_WEBHOOK_SECRET tanımlı değil — webhook işlenmiyor');
    return respond({ error: 'Webhook not configured' }, 503);
  }

  // İmza ham gövde üzerinden hesaplanır: gövde değiştirilmeden (trim vb. yapmadan) okunur
  const rawBody = await req.text();
  const signature = (req.headers.get('creem-signature') || '').trim().toLowerCase();
  const expected = await hmacSha256Hex(rawBody, CREEM_WEBHOOK_SECRET);
  if (!signature || !timingSafeEqual(expected, signature)) {
    console.error('❌ Creem imzası geçersiz');
    return respond({ error: 'Invalid signature' }, 401);
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return respond({ error: 'Invalid JSON' }, 400);
  }

  const type = String(event?.eventType || '');
  const obj = event?.object || {};
  console.log(`📩 Creem olayı: ${type} (${event?.id})`);

  try {
    if (type === 'checkout.completed' || type === 'subscription.paid') {
      const isCheckout = type === 'checkout.completed';
      const product = obj.product || {};

      // Yinelenen üründe checkout.completed ile subscription.paid aynı ödeme için birlikte gelir:
      // erişim yalnızca subscription.paid ile verilir (çift uzatma olmasın).
      if (isCheckout && product.billing_type !== 'onetime') return respond({ ok: true, ignored: 'recurring checkout' });

      const userId = String(obj.metadata?.user_id || '');
      const planType = PRODUCT_PLANS[product.id];
      const ref = isCheckout ? obj.order?.id : obj.last_transaction_id;

      if (!userId || !planType || !ref) {
        // Yeniden denemek düzeltmez: 200 dön, yöneticiye haber ver
        console.error(`❌ Creem ödemesi eşleştirilemedi: user=${userId} product=${product.id} ref=${ref}`);
        await sendTelegram(`⚠️ Creem ödemesi eşleştirilemedi, elle kontrol edin.
Olay: ${type} (${event?.id})
Ürün: ${product.id || '-'}
Kullanıcı: ${userId || '-'}
Müşteri: ${obj.customer?.email || '-'}`);
        return respond({ ok: true, unmatched: true });
      }

      const cents = Number((isCheckout ? obj.order?.amount : product.price) ?? 0);
      const paidCents = Number((isCheckout
        ? (obj.order?.amount_paid ?? obj.order?.amount)
        : (obj.last_transaction?.amount_paid ?? product.price)) ?? 0);

      // Partner payı: tek seferlik üründe her checkout ilk satıştır; abonelikte yalnızca ilk subscription.paid
      const firstSale = isCheckout || !(await isRenewal(String(obj.id || '')));
      const referral: Referral = firstSale ? await resolveReferral(obj) : { code: null };

      const outcome = await grantPro({
        userId,
        planType,
        invoiceId: 'creem_' + ref,
        orderId: isCheckout ? (obj.order?.id || null) : (obj.id || null),
        amount: cents / 100,
        currency: String((isCheckout ? obj.order?.currency : product.currency) || 'USD').toUpperCase(),
        paidAmount: paidCents / 100,
        durationDays: isCheckout ? planDays(planType) : await subscriptionDays(userId, obj),
        referralCode: referral.code,
      });

      if (outcome === 'ok' && referral.code) await retireCodeIfUsedUp(referral.code);
      if (outcome === 'ok' && referral.unresolved) {
        await sendTelegram(`⚠️ Creem ödemesinde indirim kodu var ama partneri çözülemedi; partner payını elle kontrol edin.
Olay: ${type} (${event?.id})
Kullanıcı: ${userId}
İndirim: ${JSON.stringify(obj.discount ?? obj.order?.discount ?? null)}`);
      }
      if (outcome === 'ok' && referral.rejected) {
        await sendTelegram(`⚠️ Kullanılamayan partner kodu (${referral.rejected}) Creem sayfasında girilmiş: müşteri indirimi aldı, partnere pay yazılmadı.
Kodun Creem indirimi kaldırılıyor.
Olay: ${type} (${event?.id})
Kullanıcı: ${userId}`);
        await removeCreemDiscount(referral.rejected).catch(() => false);
      }
      if (outcome === 'user_not_found') {
        await sendTelegram(`⚠️ Creem ödemesi geldi ama kullanıcı bulunamadı: ${userId} (${obj.customer?.email || '-'})`);
      }
      return respond({ ok: true, outcome });
    }

    const alerts: Record<string, string> = {
      'refund.created': '↩️ Creem iadesi yapıldı. Pro süresini elle geri almayı unutmayın.',
      'dispute.created': '🚨 Creem ters ibraz (chargeback) açıldı. Pro süresini elle geri almayı unutmayın.',
      'subscription.past_due': '⚠️ Creem aboneliğinde ödeme alınamadı (yeniden deneniyor).',
      'subscription.canceled': 'ℹ️ Creem aboneliği iptal edildi (erişim ödenen süre bitince kapanır).',
      'subscription.scheduled_cancel': 'ℹ️ Creem aboneliği dönem sonunda iptal edilecek.',
    };
    if (alerts[type]) {
      const sub = obj.subscription || obj;
      const refundNote = (type === 'refund.created' || type === 'dispute.created') ? '\n' + await reverseCommission(obj) : '';
      await sendTelegram(`${alerts[type]}
Kullanıcı: ${sub.metadata?.user_id || obj.metadata?.user_id || '-'}
Müşteri: ${obj.customer?.email || sub.customer?.email || '-'}
Olay: ${event?.id}${refundNote}`);
    }
    return respond({ ok: true });
  } catch (err) {
    console.error('❌ Creem webhook hatası:', err);
    return respond({ error: 'Internal error' }, 500);
  }
});
