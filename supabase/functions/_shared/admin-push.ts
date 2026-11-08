// Yöneticinin telefonuna / tarayıcısına Web Push bildirimi.
// Abonelikler public.admin_push_subscriptions'ta (yalnızca service role erişir; kayıt admin-notify üzerinden).
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (scripts/admin-push-setup.mjs üretir), isteğe bağlı VAPID_SUBJECT.
// Bildirim hiçbir zaman çağıranı (ödeme webhook'u vb.) bozmaz: tüm hatalar yutulur ve loglanır.

import { sendWebPush } from './webpush.js';

export const VAPID = {
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY') || '',
  privateKey: Deno.env.get('VAPID_PRIVATE_KEY') || '',
  subject: Deno.env.get('VAPID_SUBJECT') || 'https://wawejournal.com',
};

export function adminPushConfigured(): boolean {
  return !!(VAPID.publicKey && VAPID.privateKey);
}

export interface AdminPush {
  title: string;
  body: string;
  url?: string;   // bildirime dokununca açılacak yerel adres (ör. /admin?panel=payouts)
  tag?: string;   // aynı tag'li bildirim telefonda öncekinin yerine geçer
}

function clip(s: string, n: number): string {
  s = String(s ?? '').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// Hâlâ admin olan kullanıcıların id'leri (rolü alınan birinin eski telefonuna bildirim gitmesin).
async function stillAdmins(supabase: any, userIds: string[]): Promise<Set<string>> {
  const ok = new Set<string>();
  await Promise.all(userIds.map(async (id) => {
    try {
      const { data } = await supabase.auth.admin.getUserById(id);
      if (data?.user?.app_metadata?.role === 'admin') ok.add(id);
    } catch (_) { /* ulaşılamazsa bu turda atla */ }
  }));
  return ok;
}

// Tüm admin cihazlarına (ya da onlyUserId verilirse yalnızca onunkilere) gönderir.
export async function notifyAdmins(supabase: any, msg: AdminPush, onlyUserId?: string) {
  const result = { sent: 0, failed: 0, removed: 0, devices: 0 };
  if (!adminPushConfigured()) {
    console.warn('⚠️ Admin push: VAPID anahtarları tanımlı değil, bildirim gönderilmedi');
    return result;
  }
  try {
    let q = supabase.from('admin_push_subscriptions').select('id, user_id, endpoint, p256dh, auth');
    if (onlyUserId) q = q.eq('user_id', onlyUserId);
    const { data: subs, error } = await q;
    if (error) throw error;
    if (!subs?.length) return result;

    const admins = await stillAdmins(supabase, [...new Set<string>(subs.map((s: any) => s.user_id))]);
    const targets = subs.filter((s: any) => admins.has(s.user_id));
    result.devices = targets.length;

    const payload = {
      title: clip(msg.title, 80),
      body: clip(msg.body, 300),
      url: msg.url && msg.url.startsWith('/') ? msg.url : '/admin',
      tag: msg.tag ? clip(msg.tag, 64) : undefined,
    };

    await Promise.all(targets.map(async (s: any) => {
      const r = await sendWebPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, VAPID);
      if (r.ok) {
        result.sent++;
        await supabase.from('admin_push_subscriptions').update({ last_success_at: new Date().toISOString() }).eq('id', s.id);
      } else if (r.gone) {
        result.removed++;
        await supabase.from('admin_push_subscriptions').delete().eq('id', s.id);
      } else {
        result.failed++;
        console.error(`❌ Admin push gönderilemedi (${r.status}): ${r.error}`);
      }
    }));
  } catch (err) {
    console.error('❌ Admin push hatası:', err);
  }
  return result;
}
