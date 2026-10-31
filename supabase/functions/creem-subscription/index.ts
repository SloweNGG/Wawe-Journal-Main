// supabase/functions/creem-subscription/index.ts
// Kullanıcının kart (Creem) aboneliği:
//   { action: 'status' } -> abonelikler ve durumları
//   { action: 'cancel' } -> yenilenen abonelikleri dönem sonunda iptal eder (Creem mode=scheduled). Ödenmiş süre
//                           korunur, sonraki dönem ücret çekilmez. Pro erişimi zaten ödenen dönemin sonunda biter.
// Kripto ödemeler tek seferliktir, iptal edilecek bir şey yoktur (canceled = 0 döner).
// Güvenlik: kullanıcı JWT'si zorunlu; abonelikler yalnızca bu kullanıcının ödemelerinden bulunur.
// Ortam: CREEM_API_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, jsonRes } from '../_shared/ctrader.ts';
import { CREEM_API_KEY, RENEWING_STATUSES, creemApi, userCreemSubscriptions } from '../_shared/creem.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function periodEnd(subs: any[]): string | null {
  const ends = subs.map((s) => Date.parse(s.current_period_end_date)).filter((t) => isFinite(t));
  return ends.length ? new Date(Math.max(...ends)).toISOString() : null;
}

serve(async (req: Request) => {
  const cors = { ...getCorsHeaders(req.headers.get('origin')), 'Cache-Control': 'no-store' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonRes({ ok: false, error: 'Method not allowed' }, 405, cors);
  if (!CREEM_API_KEY) return jsonRes({ ok: false, error: 'Kart ödemesi yapılandırılmamış.' }, 503, cors);

  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return jsonRes({ ok: false, error: 'Unauthorized' }, 401, cors);
  const { data: { user } } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY).auth.getUser(authHeader.substring(7));
  if (!user) return jsonRes({ ok: false, error: 'Unauthorized' }, 401, cors);

  let action = '';
  try { action = String((await req.json())?.action || ''); } catch { /* boş gövde */ }
  if (action !== 'status' && action !== 'cancel') return jsonRes({ ok: false, error: 'Geçersiz işlem' }, 400, cors);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  let subs: any[];
  let failed: number;
  try {
    ({ subs, failed } = await userCreemSubscriptions(admin, user.id));
  } catch (err) {
    console.error('❌ Abonelikler okunamadı:', err);
    return jsonRes({ ok: false, error: 'Abonelik bilgisi alınamadı. Lütfen tekrar deneyin.' }, 502, cors);
  }
  const renewing = subs.filter((s) => RENEWING_STATUSES.includes(s.status));

  if (action === 'status') {
    return jsonRes({
      ok: failed === 0,
      renewing: renewing.length > 0,
      period_end: periodEnd(subs),
      subscriptions: subs.map((s) => ({ id: s.id, status: s.status, period_end: s.current_period_end_date })),
    }, 200, cors);
  }

  // cancel
  let canceled = 0;
  let errors = failed;
  for (const s of renewing) {
    const r = await creemApi(`/v1/subscriptions/${encodeURIComponent(s.id)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ mode: 'scheduled' }),
    });
    if (r.status === 200 && (r.data?.status === 'scheduled_cancel' || r.data?.status === 'canceled')) {
      canceled++;
      console.log(`🛑 Creem aboneliği dönem sonunda iptal: ${s.id} (user ${user.id})`);
    } else {
      errors++;
      console.error('❌ Creem aboneliği iptal edilemedi:', s.id, r.status, JSON.stringify(r.data));
    }
  }

  return jsonRes({
    ok: errors === 0,
    canceled,
    period_end: periodEnd(renewing.length ? renewing : subs),
    error: errors ? 'Abonelik iptal edilemedi. Lütfen tekrar deneyin ya da destekle iletişime geçin.' : undefined,
  }, errors && !canceled ? 502 : 200, cors);
});
