// supabase/functions/ctrader-candles/index.ts
// Backtest v2, Faz 2: kullanıcının KENDİ cTrader hesabından M1 mum (trendbar) verisi.
//   action 'symbols'    { ctidAccount }                         -> hesabın sembol listesi
//   action 'symbolInfo' { ctidAccount, symbolId }               -> digits, pipPosition (hesap açılmadan önce doğrulama)
//   action 'coverage'   { ctidAccount, symbolId } | { backtestAccountId } -> verinin ilk ayı / ilk barı
//   action 'month'      { backtestAccountId, month: 'YYYY-MM' } -> o ayın M1 barları (sütunlu, 1e-5 tam sayı)
// Güvenlik:
//   - Kullanıcı JWT'si zorunlu. Token yalnızca ÇAĞIRANIN ctrader_tokens satırından okunur.
//   - Hesap, ctrader_accounts'ta (user_id + ctid) çağıranla eşleşmeli; 'month' ise backtestAccountId üzerinden gider ve
//     hesap/sembol veritabanındaki satırdan türetilir (istemcinin gönderdiği ctid/sembol yok sayılır).
//   - Sunucuda mum SAKLANMAZ (ne veritabanı ne Storage); yanıt Cache-Control: private.
// Token yenileme ctrader-sync ile ortak ve kilitli: _shared/ctrader.ts.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  CTraderWsClient, MIN_INTERVAL_MS, classifyCtraderError, findFirstMinuteBar, fetchMinuteBars, getAccessToken,
  getCorsHeaders, jsonRes, monthKeyOf, monthStartMs, addMonthsKey, supabaseTokenStore,
} from '../_shared/ctrader.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const CTRADER_CLIENT_ID = Deno.env.get('CTRADER_CLIENT_ID') || '';
const CTRADER_CLIENT_SECRET = Deno.env.get('CTRADER_CLIENT_SECRET') || '';

const MAX_BODY_BYTES = 2048;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MIN_MONTH = '2000-01';

// Basit, isolate başına kota (en iyi çaba): kullanıcı başına dakikada en çok 40 istek, aynı anda en çok 2 iş.
const RATE_PER_MIN = 40;
const MAX_CONCURRENT = 2;
const hits = new Map<string, number[]>();
const running = new Map<string, number>();

function rateOk(userId: string): boolean {
  const now = Date.now();
  const arr = (hits.get(userId) || []).filter((t) => now - t < 60_000);
  if (arr.length >= RATE_PER_MIN) { hits.set(userId, arr); return false; }
  arr.push(now); hits.set(userId, arr);
  return true;
}

function fail(code: string, message: string, status: number, cors: Record<string, string>, extra: Record<string, unknown> = {}) {
  return jsonRes({ ok: false, code, error: message, ...extra }, status, { ...cors, 'Cache-Control': 'no-store' });
}

serve(async (req: Request) => {
  const cors = getCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return fail('METHOD', 'Method not allowed', 405, cors);

  // 1) Kimlik
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return fail('UNAUTHORIZED', 'Unauthorized', 401, cors);
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser(authHeader.substring(7));
  if (authError || !user) return fail('UNAUTHORIZED', 'Geçersiz oturum.', 401, cors);

  // 2) Gövde
  let body: any;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return fail('BAD_REQUEST', 'İstek çok büyük.', 413, cors);
    body = JSON.parse(text);
  } catch { return fail('BAD_REQUEST', 'Geçersiz JSON gövdesi', 400, cors); }
  const action = String(body?.action || '');
  if (!['symbols', 'symbolInfo', 'coverage', 'month'].includes(action)) return fail('BAD_REQUEST', 'Bilinmeyen işlem.', 400, cors);

  if (!rateOk(user.id)) return fail('RATE', 'Çok sık istek. Birkaç saniye bekleyip tekrar deneyin.', 429, cors);
  if ((running.get(user.id) || 0) >= MAX_CONCURRENT) return fail('RATE', 'Önceki istekler sürüyor. Birkaç saniye bekleyin.', 429, cors);
  running.set(user.id, (running.get(user.id) || 0) + 1);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const client = new CTraderWsClient(MIN_INTERVAL_MS);
  try {
    // 3) Hesap ve sembolü çöz (sahiplik burada doğrulanır)
    let ctid: number | null = null;
    let symbolId: number | null = null;
    const btId = typeof body.backtestAccountId === 'string' ? body.backtestAccountId : null;
    if (btId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(btId)) return fail('BAD_REQUEST', 'Geçersiz hesap.', 400, cors);
      const { data: bt } = await admin.from('backtest_accounts')
        .select('source_ctid_account, source_symbol_id, data_source')
        .eq('id', btId).eq('user_id', user.id).maybeSingle();
      if (!bt || bt.data_source !== 'ctrader') return fail('NOT_FOUND', 'Backtest hesabı bulunamadı.', 404, cors);
      ctid = Number(bt.source_ctid_account);
      symbolId = Number(bt.source_symbol_id);
    } else {
      if (action === 'month') return fail('BAD_REQUEST', 'backtestAccountId gerekli.', 400, cors);
      ctid = Number(body.ctidAccount);
      symbolId = body.symbolId == null ? null : Number(body.symbolId);
    }
    if (!Number.isSafeInteger(ctid) || (ctid as number) <= 0) return fail('BAD_REQUEST', 'Geçersiz cTrader hesabı.', 400, cors);
    if (action !== 'symbols' && (!Number.isSafeInteger(symbolId) || (symbolId as number) <= 0)) return fail('BAD_REQUEST', 'Geçersiz sembol.', 400, cors);

    const { data: acc } = await admin.from('ctrader_accounts')
      .select('id, is_live').eq('user_id', user.id).eq('ctid_trader_account_id', ctid).maybeSingle();
    if (!acc) return fail('NO_ACCOUNT', 'Bu cTrader hesabı bağlı değil. Lütfen hesabı yeniden bağlayın.', 404, cors, { needs_reconnect: true });

    // ay doğrulaması (bağlanmadan önce)
    let month = '';
    if (action === 'month') {
      month = String(body.month || '');
      const thisMonth = monthKeyOf(Date.now());
      if (!MONTH_RE.test(month) || month < MIN_MONTH || month > thisMonth) return fail('BAD_REQUEST', 'Geçersiz ay.', 400, cors);
    }

    // 4) Token (ortak, kilitli yenileme)
    const tk = await getAccessToken(supabaseTokenStore(admin), user.id, { clientId: CTRADER_CLIENT_ID, clientSecret: CTRADER_CLIENT_SECRET });
    if (!tk.ok) {
      if (tk.code === 'REFRESH_ERROR') return fail('UPSTREAM', tk.message, 502, cors);
      return fail('AUTH', tk.message, 401, cors, { needs_reconnect: true });
    }

    // 5) cTrader oturumu
    try {
      await client.connect(acc.is_live ? 'live.ctraderapi.com' : 'demo.ctraderapi.com', 5036);
      await client.sendRequest(2100, { clientId: CTRADER_CLIENT_ID, clientSecret: CTRADER_CLIENT_SECRET });
      await client.sendRequest(2102, { ctidTraderAccountId: ctid, accessToken: tk.accessToken });
    } catch (e: any) {
      const c = classifyCtraderError(e);
      if (c.code === 'AUTH') return fail('AUTH', c.message, 401, cors, { needs_reconnect: true });
      return fail('UPSTREAM', 'cTrader sunucusuna bağlanılamadı. Birazdan tekrar deneyin.', 502, cors);
    }

    // 6) İşlem
    const okHeaders = { ...cors, 'Cache-Control': 'private, max-age=0' };

    if (action === 'symbols') {
      const r = await client.sendRequest(2114, { ctidTraderAccountId: ctid, includeArchivedSymbols: false });
      const list: any[] = r?.payload?.symbol ?? [];
      const out = list
        .filter((s) => s?.symbolId != null && s?.symbolName && s.enabled !== false)
        .map((s) => [Number(s.symbolId), String(s.symbolName).slice(0, 40)])
        .sort((a, b) => String(a[1]).localeCompare(String(b[1])));
      return jsonRes({ ok: true, symbols: out }, 200, okHeaders);
    }

    if (action === 'symbolInfo') {
      const r = await client.sendRequest(2116, { ctidTraderAccountId: ctid, symbolId: [symbolId] });
      const s = (r?.payload?.symbol ?? []).find((x: any) => Number(x.symbolId) === symbolId);
      if (!s) return fail('NOT_FOUND', 'Sembol bu hesapta bulunamadı.', 404, cors);
      return jsonRes({ ok: true, symbolId, digits: Number(s.digits), pipPosition: Number(s.pipPosition), lotSize: s.lotSize != null ? Number(s.lotSize) : null }, 200, okHeaders);
    }

    if (action === 'coverage') {
      const found = await findFirstMinuteBar(client, ctid as number, symbolId as number, Date.now());
      if (!found) return jsonRes({ ok: true, firstMonth: null, firstT: null }, 200, okHeaders);
      return jsonRes({ ok: true, firstMonth: found.firstMonth, firstT: found.firstTMin * 60, probes: found.probes }, 200, okHeaders);
    }

    // month: ayın M1 barları. Gelecek ve bugün dışarıda kalır (istemci "dünün sonuna kadar tam günler" bekler).
    const from = monthStartMs(month);
    const nextStart = monthStartMs(addMonthsKey(month, 1));
    const todayStart = Math.floor(Date.now() / 86400000) * 86400000;
    const to = Math.min(nextStart - 1, todayStart - 1);
    if (to <= from) return jsonRes({ ok: true, month, n: 0, tm: [], o: [], h: [], l: [], c: [] }, 200, okHeaders);
    const bars = await fetchMinuteBars(client, ctid as number, symbolId as number, from, to);
    const t0 = from / 60000;
    const out = { ok: true, month, scale: 100000, n: 0, tm: [] as number[], o: [] as number[], h: [] as number[], l: [] as number[], c: [] as number[] };
    for (const b of bars) {
      if (b.tMin < t0 || b.tMin * 60000 > to) continue;
      out.tm.push(b.tMin - t0); out.o.push(b.o); out.h.push(b.h); out.l.push(b.l); out.c.push(b.c);
    }
    out.n = out.tm.length;
    return jsonRes(out, 200, okHeaders);
  } catch (e: any) {
    const c = classifyCtraderError(e);
    if (c.code === 'AUTH') return fail('AUTH', c.message, 401, cors, { needs_reconnect: true });
    if (c.code === 'RATE') return fail('RATE', c.message, 429, cors);
    // ham hata yazılmaz (token içerebilir); yalnızca işlem, sınıf ve cTrader'ın sabit hata kodu (BÜYÜK_HARF enum)
    const ec = /^[A-Z0-9_]{1,60}$/.test(String(e?.errorCode ?? '')) ? String(e.errorCode) : '-';
    console.error('ctrader-candles error:', action, c.code, ec);
    return fail('UPSTREAM', 'Mum verisi alınamadı. Birazdan tekrar deneyin.', 502, cors);
  } finally {
    client.close();
    running.set(user.id, Math.max(0, (running.get(user.id) || 1) - 1));
  }
});
