// supabase/functions/mt5-bridge/index.ts
// WaweSync EA (kullanıcının kendi MT5'inde çalışır) ile Wawe Journal arasındaki köprü. Kullanıcıdan MT5 şifresi İSTENMEZ.
//   pair_start : EA 6 haneli eşleşme kodu alır (grafikte gösterir) + yalnızca EA'nın bildiği bir sorgu sırrı
//   pair_poll  : EA, kullanıcı kodu sitede girene kadar sorar; girilince cihaz token'ı BİR KEZ teslim edilir
//   sync       : EA, token ile kapanmış pozisyonları gönderir; bağlı deftere trades satırı olarak yazılır
// Protokol ve doğrulama: ../_shared/mt5.ts. Veritabanı: migration 202611090002_mt5_bridge.sql.
// verify_jwt KAPALI deploy edilir (EA'nın Supabase oturumu yoktur); kimlik doğrulama cihaz token'ı ile yapılır.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runCoachAlerts } from '../_shared/coach-alerts.ts';
import { loadPropContexts } from '../_shared/prop-context.ts';
import {
  HISTORY_DAYS, MAX_BODY_BYTES, POLL_SECRET_RE, bearerToken, buildSyncRows, formatCode, parseAccount, roundOffset,
  sha256Hex,
} from '../_shared/mt5.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const res = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => res({ ok: false, error, ...extra }, status);

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip')
    || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || 'unknown';
}

// ------------------------------------------------------------------ pair_start
async function pairStart(req: Request, body: any) {
  const acc = parseAccount(body.account);
  if (!acc.ok) return fail('BAD_INPUT', 400, { field: acc.reason });
  const a = acc.value;
  // IP adresi saklanmaz: gizli tuzlu SHA-256 (yalnızca "aynı IP'den saatte 10 kod" sınırı için)
  const ipHash = await sha256Hex('mt5ip:' + SUPABASE_SERVICE_ROLE_KEY.slice(-24) + ':' + clientIp(req));
  const { data, error } = await admin.rpc('mt5_pair_start', {
    p_login: a.login, p_server: a.server, p_broker: a.broker, p_currency: a.currency,
    p_is_live: a.isLive, p_balance: a.balance, p_ip_hash: ipHash,
  });
  if (error || !data) {
    console.error('mt5_pair_start failed:', error?.message);
    return fail('SERVER', 500);
  }
  if (data.ok !== true) return fail(String(data.error || 'SERVER'), data.error === 'RATE_LIMIT' ? 429 : 503);
  return res({
    ok: true, code: data.code, code_display: formatCode(data.code), poll_secret: data.poll_secret,
    expires_in: data.expires_in ?? 900, poll_interval: 3,
  });
}

// ------------------------------------------------------------------ pair_poll
async function pairPoll(body: any) {
  const secret = typeof body.poll_secret === 'string' ? body.poll_secret : '';
  if (!POLL_SECRET_RE.test(secret)) return res({ ok: true, status: 'unknown' });
  const { data, error } = await admin.rpc('mt5_pair_poll', { p_poll_secret: secret });
  if (error || !data) {
    console.error('mt5_pair_poll failed:', error?.message);
    return fail('SERVER', 500);
  }
  const out: Record<string, unknown> = { ok: true, status: data.status };
  if (data.status === 'paired') { out.token = data.token; out.journal = data.journal ?? ''; }
  if (data.status === 'pending') out.expires_in = data.expires_in;
  return res(out);
}

// ------------------------------------------------------------------ sync
async function sync(req: Request, body: any) {
  const token = bearerToken(req.headers.get('authorization'));
  if (!token) return fail('UNAUTHORIZED', 401);
  const { data: account, error: accErr } = await admin
    .from('mt5_accounts')
    .select('id, user_id, journal_id, login, server, cursor_server_ts')
    .eq('token_hash', await sha256Hex(token))
    .maybeSingle();
  if (accErr) {
    console.error('mt5 account lookup failed:', accErr.message);
    return fail('SERVER', 500);
  }
  if (!account) return fail('UNAUTHORIZED', 401);   // bağlantı kesildi ya da hesap başka cihazla yeniden eşlendi

  const acc = parseAccount(body.account);
  if (!acc.ok) return fail('BAD_INPUT', 400, { field: acc.reason });
  const a = acc.value;
  if (a.login !== Number(account.login) || a.server !== account.server) {
    // EA başka bir MT5 hesabına geçirilmiş: bu token o hesaba ait değil
    return fail('ACCOUNT_MISMATCH', 409);
  }

  const offsetSec = roundOffset(body.server_offset_sec);
  const nowIso = new Date().toISOString();
  const nowServerSec = Math.floor(Date.now() / 1000) + offsetSec;
  const eaVersion = typeof body.ea_version === 'string' ? body.ea_version.replace(/[^\w.\-]/g, '').slice(0, 16) || null : null;

  const heartbeat: Record<string, unknown> = { last_seen_at: nowIso };
  if (eaVersion) heartbeat.ea_version = eaVersion;
  if (a.broker) heartbeat.broker_name = a.broker;
  if (a.currency) heartbeat.currency = a.currency;
  if (a.isLive !== null) heartbeat.is_live = a.isLive;
  if (a.balance !== null) { heartbeat.balance = a.balance; heartbeat.balance_updated_at = nowIso; }
  if (a.equity !== null) heartbeat.equity = a.equity;

  // Bağlı ve aktif defter
  let journal: { id: string; name: string } | null = null;
  if (account.journal_id) {
    const { data: j } = await admin.from('journals').select('id, name')
      .eq('id', account.journal_id).eq('user_id', account.user_id).eq('is_active', true).maybeSingle();
    journal = j || null;
  }
  if (!journal) {
    await admin.from('mt5_accounts').update(heartbeat).eq('id', account.id);
    return res({ ok: true, linked: false, journal: '', inserted: 0, duplicates: 0, rejected: 0, since: 0, history_days: HISTORY_DAYS });
  }

  const built = buildSyncRows(body.positions, {
    userId: account.user_id, journalId: journal.id, login: a.login, server: a.server, offsetSec, nowServerSec,
  });

  let inserted = 0;
  for (let i = 0; i < built.rows.length; i += 200) {
    const chunk = built.rows.slice(i, i + 200);
    const { data: up, error: upErr } = await admin.from('trades')
      .upsert(chunk, { onConflict: 'user_id,journal_id,import_hash', ignoreDuplicates: true })
      .select('id');
    if (upErr) {
      console.error('mt5 trades upsert failed:', upErr.message);
      await admin.from('mt5_accounts').update({ ...heartbeat, last_error: 'İşlemler kaydedilemedi, EA birazdan tekrar deneyecek.' })
        .eq('id', account.id);
      return fail('DB', 500);            // imleç ilerlemez: EA aynı partiyi tekrar gönderir
    }
    inserted += up?.length || 0;
  }

  // İmleç: kaydedilen (ya da kalıcı olarak geçersiz) en yeni kapanış. EA taramasını eksiksiz bitirdiyse (`complete`),
  // taradığı ana kadar ilerletilir (10 dk pay: bu arada kapanan pozisyon bir sonraki taramada yine gelir).
  let cursor = Number(account.cursor_server_ts) || 0;
  if (built.maxCloseTs > cursor) cursor = built.maxCloseTs;
  const scannedTo = Number(body.scanned_to);
  if (body.complete === true && !built.truncated && Number.isInteger(scannedTo)) {
    const safe = Math.min(scannedTo, nowServerSec) - 600;
    if (safe > cursor) cursor = safe;
  }

  // Yalnızca defter hâlâ aynıysa yaz (bu arada başka deftere taşındıysa tetikleyici imleci sıfırlamıştır)
  await admin.from('mt5_accounts').update({
    ...heartbeat,
    last_sync_at: nowIso,
    last_error: null,
    cursor_server_ts: cursor || null,
  }).eq('id', account.id).eq('journal_id', journal.id);

  // live coach alerts on what just arrived (never fails the sync; nothing for a history backfill)
  if (inserted > 0) {
    await runCoachAlerts(admin, account.user_id, journal.id, {
      propContextFor: async (j: string) => (await loadPropContexts(admin, account.user_id, j))[0] || null,
    });
  }

  if (built.rejected.length) {
    console.warn(`mt5 sync ${account.id}: ${built.rejected.length} pozisyon atlandı, ilk neden: ${built.rejected[0].reason}`);
  }
  return res({
    ok: true, linked: true, journal: journal.name,
    inserted, duplicates: built.rows.length - inserted, rejected: built.rejected.length,
    rejected_reason: built.rejected[0]?.reason || '',
    since: cursor, history_days: HISTORY_DAYS,
  });
}

// ------------------------------------------------------------------ giriş
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return fail('METHOD', 405);

  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY_BYTES) return fail('TOO_LARGE', 413);
  let body: any;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return fail('TOO_LARGE', 413);
    body = JSON.parse(text);
  } catch {
    return fail('BAD_JSON', 400);
  }
  if (!body || typeof body !== 'object') return fail('BAD_JSON', 400);

  try {
    switch (body.action) {
      case 'pair_start': return await pairStart(req, body);
      case 'pair_poll': return await pairPoll(body);
      case 'sync': return await sync(req, body);
      case 'ping': return res({ ok: true, status: 'up' });
      default: return fail('BAD_ACTION', 400);
    }
  } catch (e: any) {
    console.error('mt5-bridge error:', e?.message || e);
    return fail('SERVER', 500);
  }
});
