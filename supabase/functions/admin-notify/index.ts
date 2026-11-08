// Yönetici telefon bildirimleri (Web Push).
//
// 1) Veritabanı tetikleyicileri (migration 202611080001, pg_net) her yeni kayıtta { event, id } gönderir:
//      signup  -> user_profiles   (yeni üye)
//      report  -> bug_reports     (hata bildirimi / öneri)
//      payout  -> payout_requests (para çekme isteği)
//    Bu çağrı kimliksizdir (--no-verify-jwt). Gövdeye güvenilmez: satır service role ile yeniden okunur, yalnızca
//    son 15 dakikada oluşmuşsa ve daha önce bildirilmemişse (admin_push_events) gönderilir. Kötü niyetli bir çağrı
//    en fazla gerçek ve yeni bir kaydın bildirimini bir kez tetikleyebilir.
// 2) Admin paneli (oturum JWT'si, app_metadata.role = 'admin') { action } gönderir:
//      config      -> VAPID public key + bu cihaz kayıtlı mı + kayıtlı cihaz sayısı
//      subscribe   -> { subscription } bu cihazı kaydeder
//      unsubscribe -> { endpoint } bu cihazın kaydını siler
//      test        -> çağıran adminin cihazlarına deneme bildirimi
// Premium satışlarının bildirimi doğrudan ödeme webhook'larından gider (_shared/admin-push.ts).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, jsonRes } from '../_shared/ctrader.ts';
import { VAPID, adminPushConfigured, notifyAdmins, type AdminPush } from '../_shared/admin-push.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MAX_BODY_BYTES = 4096;
const FRESH_MS = 15 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REPORT_CATEGORIES: Record<string, string> = {
  ui: 'Arayüz', chart: 'Grafik & Hesap', trade: 'İşlem & Veri', perf: 'Performans', other: 'Diğer',
};
const PRIORITIES: Record<string, string> = { low: 'düşük', medium: 'orta', high: 'yüksek' };

function isFresh(createdAt: string | null | undefined): boolean {
  const t = Date.parse(String(createdAt || ''));
  return isFinite(t) && Math.abs(Date.now() - t) < FRESH_MS;
}

// Bildirilmemişse işaretler ve true döner (aynı olay ikinci kez gelirse false).
async function claimEvent(key: string): Promise<boolean> {
  const { error } = await supabase.from('admin_push_events').insert({ event_key: key });
  if (!error) {
    // Ara sıra eski anahtarları temizle (FRESH_MS'den eski olaylar zaten bildirilmez)
    if (Math.random() < 0.05) {
      await supabase.from('admin_push_events').delete().lt('created_at', new Date(Date.now() - 7 * 86400000).toISOString());
    }
    return true;
  }
  if (error.code !== '23505') console.error('❌ admin_push_events yazılamadı:', error.message);
  return false;
}

async function buildMessage(event: string, id: string): Promise<AdminPush | null> {
  if (event === 'signup') {
    const { data: p } = await supabase.from('user_profiles').select('email, username, created_at').eq('id', id).maybeSingle();
    if (!p || !isFresh(p.created_at)) return null;
    const { count } = await supabase.from('user_profiles').select('id', { count: 'exact', head: true });
    return {
      title: '🆕 Yeni üye',
      body: [p.username, p.email].filter(Boolean).join(' · ') + (count ? `\nToplam üye: ${count}` : ''),
      url: '/admin?panel=users',
      tag: 'signup-' + id,
    };
  }

  if (event === 'report') {
    const { data: r } = await supabase.from('bug_reports')
      .select('category, priority, subject, user_name, user_email, created_at').eq('id', id).maybeSingle();
    if (!r || !isFresh(r.created_at)) return null;
    const isIdea = r.category === 'feature';
    const who = r.user_name || r.user_email || 'Misafir';
    const meta = isIdea ? who : `${REPORT_CATEGORIES[r.category] || r.category} · öncelik ${PRIORITIES[r.priority] || r.priority} · ${who}`;
    return {
      title: isIdea ? '💡 Yeni öneri' : '🐞 Yeni hata bildirimi',
      body: `${r.subject}\n${meta}`,
      url: '/admin?panel=bug-reports',
      tag: 'report-' + id,
    };
  }

  if (event === 'payout') {
    const { data: q } = await supabase.from('payout_requests')
      .select('amount, currency, user_id, created_at').eq('id', id).maybeSingle();
    if (!q || !isFresh(q.created_at)) return null;
    const { data: p } = await supabase.from('user_profiles').select('email, username').eq('id', q.user_id).maybeSingle();
    return {
      title: '💸 Para çekme isteği',
      body: `$${Number(q.amount).toFixed(2)} · ${q.currency}\n${[p?.username, p?.email].filter(Boolean).join(' · ') || q.user_id}`,
      url: '/admin?panel=payouts',
      tag: 'payout-' + id,
    };
  }
  return null;
}

async function adminFromRequest(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const { data: { user } } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY).auth.getUser(authHeader.substring(7));
  return user && user.app_metadata?.role === 'admin' ? user : null;
}

function validSubscription(s: any): s is { endpoint: string; keys: { p256dh: string; auth: string } } {
  return !!s && typeof s.endpoint === 'string' && s.endpoint.startsWith('https://') && s.endpoint.length <= 1024 &&
    typeof s.keys?.p256dh === 'string' && s.keys.p256dh.length <= 200 &&
    typeof s.keys?.auth === 'string' && s.keys.auth.length <= 100;
}

serve(async (req: Request) => {
  const cors = { ...getCorsHeaders(req.headers.get('origin')), 'Cache-Control': 'no-store' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonRes({ ok: false, error: 'Method not allowed' }, 405, cors);

  let body: any;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return jsonRes({ ok: false, error: 'Too large' }, 413, cors);
    body = JSON.parse(text);
  } catch {
    return jsonRes({ ok: false, error: 'Invalid JSON' }, 400, cors);
  }

  try {
    // 1) Veritabanı tetikleyicisi
    if (body?.event) {
      const event = String(body.event);
      const id = String(body.id || '');
      if (!['signup', 'report', 'payout'].includes(event) || !UUID_RE.test(id)) return jsonRes({ ok: true }, 200, cors);
      const msg = await buildMessage(event, id);
      if (msg && await claimEvent(event + ':' + id)) {
        const r = await notifyAdmins(supabase, msg);
        console.log(`🔔 ${event} ${id}: ${r.sent}/${r.devices} cihaz`);
      }
      return jsonRes({ ok: true }, 200, cors);
    }

    // 2) Admin paneli
    const user = await adminFromRequest(req);
    if (!user) return jsonRes({ ok: false, error: 'Unauthorized' }, 401, cors);
    const action = String(body?.action || '');

    if (action === 'config') {
      const { data: subs } = await supabase.from('admin_push_subscriptions').select('endpoint').eq('user_id', user.id);
      const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
      return jsonRes({
        ok: true,
        configured: adminPushConfigured(),
        publicKey: VAPID.publicKey,
        devices: subs?.length || 0,
        thisDevice: !!endpoint && !!subs?.some((s: any) => s.endpoint === endpoint),
      }, 200, cors);
    }

    if (action === 'subscribe') {
      const s = body.subscription;
      if (!validSubscription(s)) return jsonRes({ ok: false, error: 'Invalid subscription' }, 400, cors);
      const { error } = await supabase.from('admin_push_subscriptions').upsert({
        user_id: user.id,
        endpoint: s.endpoint,
        p256dh: s.keys.p256dh,
        auth: s.keys.auth,
        user_agent: String(req.headers.get('user-agent') || '').slice(0, 300),
      }, { onConflict: 'endpoint' });
      if (error) throw error;
      return jsonRes({ ok: true }, 200, cors);
    }

    if (action === 'unsubscribe') {
      const endpoint = String(body.endpoint || '');
      if (endpoint) await supabase.from('admin_push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', endpoint);
      return jsonRes({ ok: true }, 200, cors);
    }

    if (action === 'test') {
      const r = await notifyAdmins(supabase, {
        title: '🔔 Wawe bildirimleri çalışıyor',
        body: 'Yeni üye, Pro satışı, hata/öneri ve para çekme isteklerinde bu cihaza bildirim gelecek.',
        url: '/admin?panel=push',
        tag: 'test',
      }, user.id);
      return jsonRes({ ok: true, ...r }, 200, cors);
    }

    return jsonRes({ ok: false, error: 'Unknown action' }, 400, cors);
  } catch (err) {
    console.error('❌ admin-notify hatası:', err);
    return jsonRes({ ok: false, error: 'Internal error' }, 500, cors);
  }
});
