// supabase/functions/creem-discount-sync/index.ts
// Admin panelinde partner kodu eklenince, düzenlenince, pasif/aktif yapılınca ya da silinince çağrılır ve Creem'deki
// aynı adlı indirimi koda eşitler:
//   - kod kullanılabilir (aktif, süresi/limiti dolmamış)  -> indirim doğru yüzde ve son kullanma tarihiyle açık
//   - kod yok / kullanılamaz                               -> Creem'deki indirim kaldırılır
// Böylece pasif yapılan kod, müşteri Creem ödeme sayfasına kendisi yazsa da indirim vermez.
// Güvenlik: yalnızca admin (app_metadata.role, bkz. supabase/ADMIN_ROLE.md). Kod durumu her zaman veritabanından okunur;
// istemci yalnızca kodun adını gönderir.
// Ortam: CREEM_API_KEY, CREEM_PRODUCT_MONTHLY, CREEM_PRODUCT_YEARLY, SUPABASE_SERVICE_ROLE_KEY.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, jsonRes } from '../_shared/ctrader.ts';
import { CREEM_API_KEY, codeUsable, ensureCreemDiscount, removeCreemDiscount } from '../_shared/creem.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

serve(async (req: Request) => {
  const cors = { ...getCorsHeaders(req.headers.get('origin')), 'Cache-Control': 'no-store' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonRes({ ok: false, error: 'Method not allowed' }, 405, cors);
  if (!CREEM_API_KEY) return jsonRes({ ok: false, error: 'Creem yapılandırılmamış' }, 503, cors);

  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return jsonRes({ ok: false, error: 'Unauthorized' }, 401, cors);
  const { data: { user } } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY).auth.getUser(authHeader.substring(7));
  if (!user) return jsonRes({ ok: false, error: 'Unauthorized' }, 401, cors);
  if (user.app_metadata?.role !== 'admin') return jsonRes({ ok: false, error: 'Forbidden' }, 403, cors);

  let codes: string[];
  try {
    const body = await req.json();
    const list = Array.isArray(body?.codes) ? body.codes : [body?.code];
    codes = [...new Set(list.map((c: unknown) => String(c || '').trim().toUpperCase()).filter(Boolean))] as string[];
  } catch { return jsonRes({ ok: false, error: 'Geçersiz JSON' }, 400, cors); }
  if (!codes.length || codes.length > 50 || codes.some((c) => c.length > 64)) {
    return jsonRes({ ok: false, error: 'Geçersiz kod' }, 400, cors);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: rows, error } = await admin.from('referral_codes')
    .select('code, is_active, expires_at, max_usage, usage_count, discount_percent').in('code', codes);
  if (error) return jsonRes({ ok: false, error: 'Kodlar okunamadı' }, 500, cors);

  const results: Record<string, string> = {};
  for (const code of codes) {
    const row = (rows || []).find((r: any) => r.code === code);
    try {
      if (row && codeUsable(row)) {
        results[code] = (await ensureCreemDiscount(code, Number(row.discount_percent), row.expires_at || null)) ? 'active' : 'error';
      } else {
        results[code] = (await removeCreemDiscount(code)) ? 'removed' : 'error';
      }
    } catch (err) {
      console.error('❌ Creem indirimi eşitlenemedi:', code, err);
      results[code] = 'error';
    }
  }
  const ok = Object.values(results).every((r) => r !== 'error');
  return jsonRes({ ok, results }, ok ? 200 : 502, cors);
});
