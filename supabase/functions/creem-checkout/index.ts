// supabase/functions/creem-checkout/index.ts
// Kart ile ödeme (Creem): giriş yapmış kullanıcı için Creem ödeme sayfası oluşturur ve adresini döner.
// Güvenlik:
//   - Kullanıcı JWT'si zorunlu; kullanıcı kimliği token'dan alınır (istemcinin gönderdiği userId yok sayılır).
//   - Ürün ve fiyat sunucuda seçilir: istemci yalnızca planType ('monthly' | 'yearly') gönderir. Fiyat Creem
//     panelindeki üründe tanımlıdır, istemciden gelen tutar hiçbir yerde kullanılmaz.
//   - Kullanıcı kimliği checkout metadata'sına yazılır; creem-webhook erişimi buna göre verir.
//   - Test anahtarıyla (creem_test_) yalnızca admin kullanıcılar ödeme sayfası açabilir.
//   - Hâlâ yenilenen bir kart aboneliği olan kullanıcıya ikinci abonelik açılmaz (ALREADY_SUBSCRIBED).
//   - Partner (referral) kodu: kripto akışındaki gibi validate_referral_code ile doğrulanır (aktif, süresi/limiti
//     dolmamış, kendi kodu değil, bu kullanıcı daha önce kullanmamış). Geçerliyse Creem'de aynı adlı indirim kodu yoksa açılır (yalnızca ilk ödeme,
//     duration=once) ve ödeme sayfasına önceden uygulanır; kod metadata.referral_code ile webhook'a taşınır.
//     Kod gönderilmiş ama uygulanamıyorsa ödeme sayfası açılmaz: kullanıcı indirimli tutarı görüp tam fiyat ödemesin.
// Ortam: CREEM_API_KEY (creem_test_ ile başlıyorsa test API'si kullanılır), CREEM_PRODUCT_MONTHLY, CREEM_PRODUCT_YEARLY,
//        SUPABASE_SERVICE_ROLE_KEY (referral doğrulaması).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, jsonRes } from '../_shared/ctrader.ts';
import {
  CREEM_API_BASE, CREEM_API_KEY, CREEM_PRODUCTS as PRODUCTS, RENEWING_STATUSES, ensureCreemDiscount, userCreemSubscriptions,
} from '../_shared/creem.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const DEFAULT_RETURN_ORIGIN = 'https://wawejournal.com';

const MAX_BODY_BYTES = 1024;

// Basit, isolate başına kota (en iyi çaba): kullanıcı başına dakikada en çok 5 ödeme sayfası.
const RATE_PER_MIN = 5;
const hits = new Map<string, number[]>();

function rateOk(userId: string): boolean {
  const now = Date.now();
  const arr = (hits.get(userId) || []).filter((t) => now - t < 60_000);
  if (arr.length >= RATE_PER_MIN) { hits.set(userId, arr); return false; }
  arr.push(now); hits.set(userId, arr);
  return true;
}

function fail(code: string, message: string, status: number, cors: Record<string, string>) {
  return jsonRes({ ok: false, code, error: message }, status, { ...cors, 'Cache-Control': 'no-store' });
}

serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const cors = getCorsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return fail('METHOD', 'Method not allowed', 405, cors);

  if (!CREEM_API_KEY) {
    console.error('❌ CREEM_API_KEY tanımlı değil');
    return fail('NOT_CONFIGURED', 'Kart ile ödeme şu anda kullanılamıyor.', 503, cors);
  }

  // 1) Kimlik
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return fail('UNAUTHORIZED', 'Unauthorized', 401, cors);
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser(authHeader.substring(7));
  if (authError || !user) return fail('UNAUTHORIZED', 'Geçersiz oturum.', 401, cors);

  // Test anahtarıyla yalnızca admin ödeme sayfası açabilir: test kartıyla yapılan ödeme de webhook'ta gerçek
  // Pro açtığı için, test döneminde herkese açık olsa herhangi bir kullanıcı API'yi çağırıp bedava Pro alabilirdi.
  if (CREEM_API_KEY.startsWith('creem_test_') && user.app_metadata?.role !== 'admin') {
    return fail('NOT_CONFIGURED', 'Kart ile ödeme şu anda kullanılamıyor.', 503, cors);
  }

  // 2) Gövde
  let body: any;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return fail('BAD_REQUEST', 'İstek çok büyük.', 413, cors);
    body = JSON.parse(text);
  } catch { return fail('BAD_REQUEST', 'Geçersiz JSON gövdesi', 400, cors); }

  const planType = String(body?.planType || '');
  const productId = PRODUCTS[planType];
  if (!productId) {
    if (planType === 'monthly' || planType === 'yearly') {
      console.error(`❌ ${planType} için Creem ürün ID'si tanımlı değil (CREEM_PRODUCT_${planType.toUpperCase()})`);
      return fail('NOT_CONFIGURED', 'Kart ile ödeme şu anda kullanılamıyor.', 503, cors);
    }
    return fail('BAD_REQUEST', 'Geçersiz plan.', 400, cors);
  }

  if (!rateOk(user.id)) return fail('RATE', 'Çok sık istek. Bir dakika bekleyip tekrar deneyin.', 429, cors);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  // 3) Hâlâ yenilenen bir kart aboneliği varken ikincisi açılmaz (müşteriden her dönem iki kez çekilirdi).
  //    Dönem sonunda iptal edilmiş abonelik engel değildir. Creem'e ulaşılamazsa satış engellenmez.
  try {
    const { subs } = await userCreemSubscriptions(admin, user.id);
    if (subs.some((s) => RENEWING_STATUSES.includes(s.status))) {
      return fail('ALREADY_SUBSCRIBED', 'Zaten otomatik yenilenen bir kart aboneliğiniz var; Pro süreniz her dönem kendiliğinden uzar.', 409, cors);
    }
  } catch (err) {
    console.warn('⚠️ Mevcut abonelik kontrol edilemedi, ödeme sayfası açılıyor:', err);
  }

  // 4) Partner kodu (isteğe bağlı)
  const rawCode = String(body?.referralCode || '').trim().toUpperCase();
  let referralCode: string | null = null;
  if (rawCode) {
    if (rawCode.length > 64) return fail('INVALID_CODE', 'Geçersiz kupon kodu.', 400, cors);
    try {
      const { data: v, error: vErr } = await admin.rpc('validate_referral_code', { p_code: rawCode, p_user_id: user.id });
      if (vErr) throw vErr;
      const percent = Number(v?.discount_percent);
      if (!v?.valid || !(percent > 0 && percent <= 100)) {
        console.log(`ℹ️ Kart ödemesinde kod reddedildi: ${rawCode}`, JSON.stringify(v));
        return fail('INVALID_CODE', 'Kupon kodu geçersiz ya da artık kullanılamıyor.', 400, cors);
      }
      const { data: row } = await admin.from('referral_codes').select('expires_at').eq('code', rawCode).maybeSingle();
      if (!(await ensureCreemDiscount(rawCode, percent, row?.expires_at || null))) {
        return fail('DISCOUNT', 'İndirim şu anda uygulanamadı. Lütfen tekrar deneyin.', 502, cors);
      }
      referralCode = rawCode;
    } catch (err) {
      console.error('❌ Kart ödemesinde kod doğrulanamadı:', err);
      return fail('DISCOUNT', 'İndirim şu anda uygulanamadı. Lütfen tekrar deneyin.', 502, cors);
    }
  }

  // 5) Dönüş adresi: yalnızca izin verilen bir kökenden çağrıldıysa o köken, aksi halde canlı site
  const returnOrigin = (origin && cors['Access-Control-Allow-Origin'] === origin) ? origin : DEFAULT_RETURN_ORIGIN;

  // 6) Creem ödeme sayfası
  try {
    const res = await fetch(CREEM_API_BASE + '/v1/checkouts', {
      method: 'POST',
      headers: { 'x-api-key': CREEM_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: productId,
        request_id: `wj_${user.id}_${Date.now()}`,
        success_url: returnOrigin + '/dashboard.html?payment=success',
        customer: user.email ? { email: user.email } : undefined,
        discount_code: referralCode || undefined,
        metadata: referralCode
          ? { user_id: user.id, plan_type: planType, referral_code: referralCode }
          : { user_id: user.id, plan_type: planType },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.checkout_url) {
      console.error('❌ Creem checkout hatası:', res.status, JSON.stringify(data));
      return fail('PROVIDER', 'Ödeme sayfası oluşturulamadı. Lütfen tekrar deneyin.', 502, cors);
    }
    console.log(`✅ Creem checkout ${data.id} oluşturuldu (user ${user.id}, ${planType}${referralCode ? ', kod ' + referralCode : ''})`);
    return jsonRes({ ok: true, checkoutUrl: data.checkout_url }, 200, { ...cors, 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('❌ Creem checkout isteği başarısız:', err);
    return fail('PROVIDER', 'Ödeme servisine ulaşılamadı. Lütfen tekrar deneyin.', 504, cors);
  }
});
