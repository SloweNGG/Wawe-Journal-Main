// supabase/functions/ctrader-connect/index.ts
// cTrader OAuth kodunu token'a çevirir, hesapları listeler ve kaydeder.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const CTRADER_CLIENT_ID = Deno.env.get('CTRADER_CLIENT_ID') || '';
const CTRADER_CLIENT_SECRET = Deno.env.get('CTRADER_CLIENT_SECRET') || '';

const ALLOWED_ORIGINS = [
  'https://wawejournal.com',
  'https://www.wawejournal.com',
  'https://wawe-journal.pages.dev',
  'https://*.wawe-journal.pages.dev',
  'https://*.pages.dev',
  'http://localhost:4321',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:*',
  'http://127.0.0.1:*',
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  let isAllowed = !!(origin && ALLOWED_ORIGINS.includes(origin));
  if (!isAllowed && origin) {
    for (const pattern of ALLOWED_ORIGINS) {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
        if (regex.test(origin)) { isAllowed = true; break; }
      }
    }
  }
  return {
    'Access-Control-Allow-Origin': (isAllowed && origin) ? origin : (ALLOWED_ORIGINS[0] || '*'),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
  };
}

function jsonRes(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

// Basit cTrader WebSocket İstemcisi
class CTraderWsClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, { resolve: (res: any) => void; reject: (err: any) => void; timer: number }>();

  async connect(host: string, port = 5036, timeoutMs = 8000): Promise<void> {
    const url = `wss://${host}:${port}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.ws) this.ws.close();
        reject(new Error(`WebSocket bağlantı zaman aşımı (${url})`));
      }, timeoutMs);

      try {
        this.ws = new WebSocket(url);
        this.ws.onopen = () => {
          clearTimeout(timer);
          resolve();
        };
        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data));
            if (data.payloadType === 51) {
              // Heartbeat
              this.ws?.send(JSON.stringify({ clientMsgId: `hb-${Date.now()}`, payloadType: 51, payload: {} }));
              return;
            }
            if (data.clientMsgId && this.pending.has(data.clientMsgId)) {
              const req = this.pending.get(data.clientMsgId)!;
              clearTimeout(req.timer);
              this.pending.delete(data.clientMsgId);
              if (data.payloadType === 2142) {
                req.reject(data.payload);
              } else {
                req.resolve(data);
              }
            }
          } catch (_) {}
        };
        this.ws.onerror = (e) => console.error('WS Error:', e);
        this.ws.onclose = () => {};
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  async sendRequest(payloadType: number, payload: Record<string, any>, timeoutMs = 10000): Promise<any> {
    const clientMsgId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('WebSocket açık değil'));
      }
      const timer = setTimeout(() => {
        this.pending.delete(clientMsgId);
        reject(new Error(`İstek zaman aşımı (${payloadType})`));
      }, timeoutMs);

      this.pending.set(clientMsgId, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ clientMsgId, payloadType, payload }));
    });
  }

  close() {
    try { this.ws?.close(); } catch (_) {}
  }
}

serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const cors = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonRes({ error: 'Method not allowed' }, 405, cors);

  // 1) Auth Doğrulama
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonRes({ error: 'Unauthorized' }, 401, cors);
  }
  const token = authHeader.substring(7);

  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser(token);
  if (authError || !user) {
    return jsonRes({ error: 'Geçersiz oturum.' }, 401, cors);
  }

  // 2) Body Parse
  let body: any;
  try { body = await req.json(); }
  catch { return jsonRes({ error: 'Geçersiz JSON gövdesi' }, 400, cors); }

  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const redirectUri = typeof body.redirectUri === 'string' ? body.redirectUri.trim() : '';

  if (!code) {
    return jsonRes({ error: 'Authorization code gereklidir.' }, 400, cors);
  }

  if (!CTRADER_CLIENT_ID || !CTRADER_CLIENT_SECRET) {
    console.error('Missing CTRADER_CLIENT_ID or CTRADER_CLIENT_SECRET');
    return jsonRes({ error: 'cTrader entegrasyonu sunucu tarafında yapılandırılmamış.' }, 503, cors);
  }

  // 3) Token Takası (OAuth Authorization Code -> Tokens)
  const tokenUrl = `https://openapi.ctrader.com/apps/token?grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}&client_id=${encodeURIComponent(CTRADER_CLIENT_ID)}&client_secret=${encodeURIComponent(CTRADER_CLIENT_SECRET)}`;

  let tokenData: any;
  try {
    const tokenRes = await fetch(tokenUrl, { method: 'GET' });
    tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.errorCode || !tokenData.accessToken) {
      console.error('cTrader Token Exchange Failed:', tokenData);
      const desc = tokenData.description || 'Yetkilendirme kodu geçersiz veya süresi dolmuş.';
      return jsonRes({ error: desc }, 400, cors);
    }
  } catch (err: any) {
    console.error('Token fetch error:', err);
    return jsonRes({ error: 'cTrader token sunucusuna erişilemedi.' }, 502, cors);
  }

  const accessToken = tokenData.accessToken;
  const refreshToken = tokenData.refreshToken;
  const expiresIn = parseInt(tokenData.expiresIn || '2592000', 10);
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 4) ctrader_tokens tablosuna atomik kaydet
  const { error: saveTokenErr } = await admin.from('ctrader_tokens').upsert({
    user_id: user.id,
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    scope: 'accounts',
    status: 'active',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  if (saveTokenErr) {
    console.error('Error saving ctrader token:', saveTokenErr);
    return jsonRes({ error: 'Token kaydedilemedi.' }, 500, cors);
  }

  // 5) cTrader WebSocket ile hesapları çek
  // Demo host üzerinden hesap listesini sorabiliriz (2149 hem live hem demo hesapları döner)
  const wsClient = new CTraderWsClient();
  let accountsList: any[] = [];

  try {
    await wsClient.connect('demo.ctraderapi.com', 5036);
    // 2100 App Auth
    await wsClient.sendRequest(2100, {
      clientId: CTRADER_CLIENT_ID,
      clientSecret: CTRADER_CLIENT_SECRET,
    });
    // 2149 GetAccountListByAccessTokenReq
    const accRes = await wsClient.sendRequest(2149, { accessToken });
    accountsList = accRes.payload?.ctidTraderAccount || [];
  } catch (wsErr: any) {
    console.error('cTrader account fetch error:', wsErr);
    // Demo başarısız olursa live üzerinden dene
    try {
      wsClient.close();
      const wsLive = new CTraderWsClient();
      await wsLive.connect('live.ctraderapi.com', 5036);
      await wsLive.sendRequest(2100, { clientId: CTRADER_CLIENT_ID, clientSecret: CTRADER_CLIENT_SECRET });
      const accRes = await wsLive.sendRequest(2149, { accessToken });
      accountsList = accRes.payload?.ctidTraderAccount || [];
      wsLive.close();
    } catch (liveErr) {
      console.error('cTrader live account fetch error:', liveErr);
    }
  } finally {
    wsClient.close();
  }

  // 6) Hesapları ctrader_accounts tablosuna upsert et
  const savedAccounts = [];
  for (const acc of accountsList) {
    const accountRow = {
      user_id: user.id,
      ctid_trader_account_id: acc.ctidTraderAccountId,
      is_live: !!acc.isLive,
      trader_login: acc.traderLogin || null,
      broker_name: acc.brokerTitleShort || 'cTrader Broker',
      updated_at: new Date().toISOString(),
    };

    const { data: upsertedAcc, error: accErr } = await admin
      .from('ctrader_accounts')
      .upsert(accountRow, { onConflict: 'user_id,ctid_trader_account_id' })
      .select('id, ctid_trader_account_id, is_live, trader_login, broker_name, journal_id, last_sync_at')
      .single();

    if (!accErr && upsertedAcc) {
      savedAccounts.push(upsertedAcc);
    }
  }

  // 7) Başarılı yanıt (Token asla dönülmez)
  return jsonRes({
    success: true,
    message: 'cTrader başarıyla bağlandı!',
    accounts: savedAccounts,
  }, 200, cors);
});
