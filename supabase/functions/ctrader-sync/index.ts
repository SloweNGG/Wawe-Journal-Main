// supabase/functions/ctrader-sync/index.ts
// Belirtilen cTrader hesabından kapanmış işlemleri çeker ve trades tablosuna yükler.

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

const MULTIPLIER_MAP: Record<string, number> = {
  forex: 100000,
  gold: 100,
  index: 10,
  crypto: 1,
  other: 1,
};

const FIAT_CODES = 'EUR|USD|GBP|JPY|CHF|CAD|AUD|NZD|TRY|ZAR|MXN|SEK|NOK|PLN|SGD|HKD|CNH|CZK|HUF|DKK|THB|ILS|RUB|CNY';
const FOREX_PAIR_RE = new RegExp('^(' + FIAT_CODES + ')(' + FIAT_CODES + ')(?![A-Z]{4,})');
const CRYPTO_BASE_RE = /^(XBT|BTC|ETH|SOL|ADA|XRP|DOGE|BNB|LTC|TRX|MATIC|AVAX|DOT|LINK|SHIB|NEAR|FTM)/;
const CRYPTO_QUOTE_RE = /(USDT|USDC|BUSD)$/;

// Forex ÖNCE (USDCAD/USDTRY gibi çiftler kripto "USDC"/"USDT" alt-dizisiyle karışmasın),
// kripto başa/sona sabitlenmiş eşleşmeyle kontrol edilir. broker-dictionary.js ile aynı mantık.
function guessInstrument(symbol: string): string {
  const s = String(symbol || '').toUpperCase().trim();
  const letters = s.replace(/[^A-Z]/g, '');
  if (/(XAU|GOLD|XAG|SILVER|XPT|PLATINUM|XPD)/.test(s)) return 'gold';
  if (FOREX_PAIR_RE.test(letters)) return 'forex';
  if (CRYPTO_BASE_RE.test(letters) || CRYPTO_QUOTE_RE.test(letters)) return 'crypto';
  if (/(US30|NAS|NAS100|SPX|SP500|DAX|UK100|JP225|USTEC|GER40|GER30|FRA40|DE40|DE30|DJ30|WS30|US100|US500|NIKKEI|FTSE)/.test(s)) return 'index';
  if (letters.length === 6) return 'forex';
  return 'other';
}

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

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

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

  async sendRequest(payloadType: number, payload: Record<string, any>, timeoutMs = 12000): Promise<any> {
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

// 2142 Hata Kodu Çevirisi
function translateCtraderError(err: any): string {
  const code = err?.errorCode ? String(err.errorCode) : '';
  if (code === '1' || code === '104') return 'cTrader oturumunun süresi dolmuş. Lütfen hesabı yeniden bağlayın.';
  if (code === '108') return 'İstek sıklığı aşıldı. Lütfen birkaç saniye sonra tekrar deneyin.';
  if (code === '35') return 'Tarih aralığı sınırları aşıldı.';
  if (code === '109') return 'cTrader sunucuları şu anda bakımda. Lütfen daha sonra deneyin.';
  return err?.description || 'cTrader bağlantı hatası oluştu.';
}

serve(async (req: Request) => {
  const startTime = Date.now();
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

  const ctidTraderAccountId = body.ctidTraderAccountId ? Number(body.ctidTraderAccountId) : null;
  const journalId = typeof body.journalId === 'string' ? body.journalId.trim() : null;

  if (!ctidTraderAccountId) {
    return jsonRes({ error: 'ctidTraderAccountId gereklidir.' }, 400, cors);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 3) Hesap ve Token Bilgilerini Çek
  const { data: accountRow, error: accErr } = await admin
    .from('ctrader_accounts')
    .select('*')
    .eq('user_id', user.id)
    .eq('ctid_trader_account_id', ctidTraderAccountId)
    .single();

  if (accErr || !accountRow) {
    return jsonRes({ error: 'cTrader hesabı bulunamadı veya yetkisiz.' }, 404, cors);
  }

  // Hedef defter doğrulaması
  const targetJournalId = journalId || accountRow.journal_id;
  if (!targetJournalId) {
    return jsonRes({ error: 'Lütfen bu hesap için bir defter seçin.' }, 400, cors);
  }

  // Defterin kullanıcıya ait olduğunu doğrula
  const { data: journalRow, error: jErr } = await admin
    .from('journals')
    .select('id, name')
    .eq('id', targetJournalId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();

  if (jErr || !journalRow) {
    return jsonRes({ error: 'Hedef defter bulunamadı veya pasif.' }, 404, cors);
  }

  // Defter eşleşmesini güncelle. Defter değişince senkron imleci SIFIRLANIR: eskiden imleç korunuyor ve yeni defter
  // yalnızca son 2 günün işlemlerini alıyordu (import_hash defter başına tekil olduğu için tekrar riski yok).
  if (accountRow.journal_id !== targetJournalId) {
    await admin.from('ctrader_accounts').update({
      journal_id: targetJournalId,
      last_deal_timestamp: null,
      updated_at: new Date().toISOString(),
    }).eq('id', accountRow.id);
    accountRow.last_deal_timestamp = null;
  }

  // 4) Çift Tıklama / Concurrency Kontrolü
  if (accountRow.syncing_since) {
    const syncingTime = new Date(accountRow.syncing_since).getTime();
    const fiveMinutes = 5 * 60 * 1000;
    if (Date.now() - syncingTime < fiveMinutes) {
      return jsonRes({
        error: 'Bu hesap için bir senkronizasyon işlemi zaten devam ediyor.',
        is_syncing: true,
      }, 429, cors);
    }
  }

  // Senkron kilidi koy
  await admin.from('ctrader_accounts').update({
    syncing_since: new Date().toISOString(),
    last_error: null,
  }).eq('id', accountRow.id);

  // 5) Token'ı Al ve Gerekiyorsa Yenile
  const { data: tokenRow, error: tokErr } = await admin
    .from('ctrader_tokens')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (tokErr || !tokenRow) {
    await admin.from('ctrader_accounts').update({ syncing_since: null }).eq('id', accountRow.id);
    return jsonRes({ error: 'cTrader bağlantı token\'ı bulunamadı. Lütfen hesabı bağlayın.', needs_reconnect: true }, 400, cors);
  }

  let accessToken = tokenRow.access_token;
  const expiresAtMs = new Date(tokenRow.expires_at).getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;

  // 1 günden az kaldıysa token'ı yenile
  if (expiresAtMs - Date.now() < oneDayMs) {
    const refreshUrl = `https://openapi.ctrader.com/apps/token?grant_type=refresh_token&refresh_token=${encodeURIComponent(tokenRow.refresh_token)}&client_id=${encodeURIComponent(CTRADER_CLIENT_ID)}&client_secret=${encodeURIComponent(CTRADER_CLIENT_SECRET)}`;
    try {
      const refRes = await fetch(refreshUrl, { method: 'GET' });
      const refData = await refRes.json();
      if (!refRes.ok || refData.errorCode || !refData.accessToken) {
        throw new Error(refData.description || 'Token yenileme başarısız');
      }
      accessToken = refData.accessToken;
      const newRefreshToken = refData.refreshToken || tokenRow.refresh_token;
      const newExpiresAt = new Date(Date.now() + parseInt(refData.expiresIn || '2592000', 10) * 1000).toISOString();

      await admin.from('ctrader_tokens').update({
        access_token: accessToken,
        refresh_token: newRefreshToken,
        expires_at: newExpiresAt,
        status: 'active',
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id);
    } catch (refErr: any) {
      console.error('Token refresh error:', refErr);
      await admin.from('ctrader_tokens').update({ status: 'needs_reconnect' }).eq('user_id', user.id);
      await admin.from('ctrader_accounts').update({
        syncing_since: null,
        last_error: 'Oturum süresi doldu. Lütfen cTrader hesabınızı yeniden bağlayın.',
      }).eq('id', accountRow.id);
      return jsonRes({ error: 'cTrader yetkilendirme süresi doldu. Lütfen yeniden bağlayın.', needs_reconnect: true }, 401, cors);
    }
  }

  // 6) WebSocket Bağlantısı ve Senkron Döngüsü
  const wsHost = accountRow.is_live ? 'live.ctraderapi.com' : 'demo.ctraderapi.com';
  const wsClient = new CTraderWsClient();

  let insertedCount = 0;
  let skippedCount = 0;
  let totalFetched = 0;
  let isDone = true;
  let latestDealTimestamp = accountRow.last_deal_timestamp ? Number(accountRow.last_deal_timestamp) : 0;

  try {
    await wsClient.connect(wsHost, 5036);
    // 2100 App Auth
    await wsClient.sendRequest(2100, { clientId: CTRADER_CLIENT_ID, clientSecret: CTRADER_CLIENT_SECRET });
    // 2102 Account Auth
    await wsClient.sendRequest(2102, { ctidTraderAccountId, accessToken });

    // Para hassasiyeti (moneyDigits) ve başlangıç zamanı için 2121 TraderReq.
    // moneyDigits HER senkronda okunur (eskiden yalnızca ilk senkronda; sonraki senkronlarda varsayılan 2 kalıyor ve
    // closePositionDetail.moneyDigits alanı yoksa 8 haneli hesaplarda PnL 10^6 kat yanlış çıkıyordu).
    let moneyDigits = 2;
    let registrationTs = 0;
    let traderInfoOk = false;
    // Hesap bakiyesi (yalnızca kapanmış işlemleri içerir; açık pozisyonun anlık kâr/zararı dahil değildir) ve para birimi.
    // Kartta "Bakiye" olarak gösterilir. Alınamazsa (null) eski değer korunur.
    let accountBalance: number | null = null;
    let balanceCurrency: string | null = null;
    let balanceAsOf = new Date().toISOString();           // bakiyenin geçerli olduğu an
    let balanceSource: 'trader' | 'last_deal' | null = null;
    // YEDEK kaynak: 2121 bakiye vermezse, son kapanış işleminin "işlem sonrası bakiyesi" (closePositionDetail.balance)
    let fallbackBalance: number | null = null;
    let fallbackBalanceTs = 0;
    let traderDiag = 'istek yapılmadı';   // bakiye alınamazsa log'a yazılır (cevapta hangi alanlar vardı?)
    try {
      const traderRes = await wsClient.sendRequest(2121, { ctidTraderAccountId });
      const trader = traderRes.payload?.trader;
      traderDiag = 'payload alanları: [' + Object.keys(traderRes.payload || {}).join(',') + '], trader alanları: [' +
        Object.keys(trader || {}).join(',') + '], balance=' + String(trader?.balance) + ', moneyDigits=' + String(trader?.moneyDigits);
      if (trader?.moneyDigits != null && isFinite(Number(trader.moneyDigits))) moneyDigits = Number(trader.moneyDigits);
      registrationTs = trader?.registrationTimestamp ? Number(trader.registrationTimestamp) : 0;
      traderInfoOk = true;

      // trader.balance, 10^moneyDigits ile çarpılmış tam sayıdır (ör. 1234567 & moneyDigits=2 -> 12345.67)
      if (trader?.balance != null && isFinite(Number(trader.balance))) {
        const balDigits = Math.min(8, Math.max(2, moneyDigits));
        accountBalance = Number((Number(trader.balance) / Math.pow(10, moneyDigits)).toFixed(balDigits));
        balanceSource = 'trader';
      }
      // Para birimi: depositAssetId -> varlık listesinden ad (USD, EUR...). Alınamazsa yalnızca para birimi boş kalır.
      if (accountBalance !== null && trader?.depositAssetId != null) {
        try {
          const assetRes = await wsClient.sendRequest(2112, { ctidTraderAccountId }, 8000);
          const assets: any[] = assetRes.payload?.asset || [];
          const dep = assets.find((a) => String(a.assetId) === String(trader.depositAssetId));
          if (dep?.name) balanceCurrency = String(dep.name).toUpperCase().slice(0, 12);
        } catch (_) {}
      }
    } catch (e: any) {
      traderDiag = 'hata: ' + (e?.description || e?.message || JSON.stringify(e));
    }

    let fromTimestamp: number;
    if (accountRow.last_deal_timestamp) {
      // Önceki senkrondan 2 gün geriye git (çakışan pencere)
      fromTimestamp = Math.max(0, Number(accountRow.last_deal_timestamp) - (2 * 24 * 60 * 60 * 1000));
    } else if (traderInfoOk) {
      // İlk senkron: trader.registrationTimestamp al, en fazla 90 gün geriye git
      const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
      fromTimestamp = registrationTs > ninetyDaysAgo ? registrationTs : ninetyDaysAgo;
    } else {
      fromTimestamp = Date.now() - 30 * 24 * 60 * 60 * 1000;
    }

    // 1) Tüm sembollerin gerçek isimlerini 2114 (ProtoOASymbolsListReq) ile çek
    const symbolCache = new Map<number, { symbolName: string; lotSize: number; digits: number }>();
    const KNOWN_CTRADER_SYMBOLS: Record<number, string> = {
      1: 'EURUSD',
      2: 'GBPUSD',
      3: 'EURJPY',
      4: 'USDJPY',
      5: 'AUDUSD',
      6: 'USDCHF',
      7: 'GBPJPY',
      8: 'USDCAD',
      9: 'EURGBP',
      10: 'EURCHF',
      11: 'AUDJPY',
      12: 'NZDUSD',
      13: 'NZDJPY',
      14: 'CADJPY',
      15: 'AUDCAD',
      16: 'AUDNZD',
      17: 'CADCHF',
      18: 'CHFJPY',
      19: 'EURAUD',
      20: 'EURCAD',
      21: 'EURNZD',
      22: 'GBPAUD',
      23: 'GBPCAD',
      24: 'GBPCHF',
      25: 'GBPNZD',
      26: 'NZDCAD',
      27: 'NZDCHF',
      41: 'XAUUSD',
      42: 'XAGUSD',
      22395: 'BTCUSD',
      22396: 'ETHUSD',
    };

    try {
      await sleep(200);
      const symListRes = await wsClient.sendRequest(2114, {
        ctidTraderAccountId,
        includeArchivedSymbols: true,
      });
      const syms = symListRes.payload?.symbol || [];
      const archived = symListRes.payload?.archivedSymbol || [];
      for (const s of [...syms, ...archived]) {
        if (s.symbolId != null) {
          const rawName = String(s.symbolName || '').replace(/[\/\s_-]/g, '').toUpperCase();
          symbolCache.set(Number(s.symbolId), {
            symbolName: rawName || KNOWN_CTRADER_SYMBOLS[Number(s.symbolId)] || `SYM_${s.symbolId}`,
            lotSize: 10000000,
            digits: s.digits ?? 5,
          });
        }
      }
      console.log(`✅ ${symbolCache.size} sembol bilgisi cTrader'dan alındı.`);
    } catch (symListErr) {
      console.warn('⚠️ 2114 SymbolsListReq uyarısı:', symListErr);
    }

    const now = Date.now();
    const CHUNK_WINDOW = 6 * 24 * 60 * 60 * 1000; // 6 günlük pencereler (cTrader 7 gün sınırına takılmamak için güvenli marj)
    const MAX_RUN_TIME = 90 * 1000; // Edge function 90 saniye güvenlik süresi

    let currFrom = fromTimestamp;
    const pendingTradesToInsert: any[] = [];

    // Doğruluk izleme
    // processedUntil: bu zamana kadarki (dahil) tüm deal'ler işlendi. Zaman aşımında imleç buraya konur
    //   (eskiden hiç kapanış görülmemişse imleç "şimdi"ye atlıyor ve çekilmemiş geçmiş sonsuza dek kayboluyordu).
    // confirmedLot: lotSize'ı 2116 ile DOĞRULANMIŞ semboller. Doğrulanmamış sembolün deal'i uydurma lotla yazılmaz.
    // minSkippedTs: lot bilgisi alınamayıp atlanan en eski deal; imleç bunun gerisinde tutulur ki sonraki senkron yeniden denesin.
    let processedUntil = fromTimestamp;
    const confirmedLot = new Set<number>();
    let skippedUnknownLot = 0;
    let skippedInvalidVolume = 0;
    let minSkippedTs = Number.POSITIVE_INFINITY;
    const positionClosings = new Map<string, { swap: number; commission: number }[]>();

    // Zaman pencereleri döngüsü (6 günlük bloklar)
    while (currFrom < now) {
      // Zaman aşımı kontrolü (Edge function timeout olmasın diye)
      if (Date.now() - startTime > MAX_RUN_TIME) {
        console.warn('⚠️ Maksimum çalışma süresi yaklaştı, kaldığı yer kaydedilip devam edilecek.');
        isDone = false;
        break;
      }

      const currTo = Math.min(currFrom + CHUNK_WINDOW, now);
      let hasMore = true;
      let dealFrom = currFrom;

      while (hasMore) {
        if (Date.now() - startTime > MAX_RUN_TIME) {
          isDone = false;
          break;
        }

        await sleep(250); // Hız sınırı koruması (5 req/sn)
        const dealRes = await wsClient.sendRequest(2133, {
          ctidTraderAccountId,
          fromTimestamp: dealFrom,
          toTimestamp: currTo,
          maxRows: 100,
        });

        const deals: any[] = dealRes.payload?.deal || [];
        hasMore = dealRes.payload?.hasMore === true;
        totalFetched += deals.length;

        // Kapanmış işlemleri filtrele: closePositionDetail dolu ve FILLED/PARTIALLY_FILLED (2 veya 3)
        const closedDeals = deals.filter((d) => (d.dealStatus === 2 || d.dealStatus === 3) && d.closePositionDetail != null);

        // Lot büyüklüğü detayları için 2116 ile çek (yalnızca henüz doğrulanmamış semboller; bir deneme başarısız olursa 1 kez daha)
        const symIdsToInspect = [...new Set(closedDeals.map((d) => Number(d.symbolId)))].filter((id) => !confirmedLot.has(id));
        for (let attempt = 0; attempt < 2 && symIdsToInspect.some((id) => !confirmedLot.has(id)); attempt++) {
          await sleep(attempt === 0 ? 250 : 1000);
          try {
            const symRes = await wsClient.sendRequest(2116, {
              ctidTraderAccountId,
              symbolId: symIdsToInspect.filter((id) => !confirmedLot.has(id)),
            });
            for (const s of (symRes.payload?.symbol || [])) {
              const sid = Number(s.symbolId);
              const existing = symbolCache.get(sid);
              const resolvedName = existing?.symbolName || KNOWN_CTRADER_SYMBOLS[sid] || `SYM_${sid}`;
              const lotFromApi = s.lotSize ? Number(s.lotSize) : 0;
              symbolCache.set(sid, {
                symbolName: resolvedName,
                lotSize: lotFromApi > 0 ? lotFromApi : (existing?.lotSize || 10000000),
                digits: s.digits ?? (existing?.digits || 5),
              });
              if (lotFromApi > 0) confirmedLot.add(sid);
            }
          } catch (symErr) {
            console.error('Sembol 2116 detay çekme uyarısı:', symErr);
          }
        }

        // Deal'leri trades satırına dönüştür
        for (const deal of closedDeals) {
          const cpd = deal.closePositionDetail;

          // Yedek bakiye: en son kapanan işlemin sonrasındaki hesap bakiyesi
          if (cpd.balance != null && isFinite(Number(cpd.balance))) {
            const tsBal = Number(deal.executionTimestamp);
            if (tsBal >= fallbackBalanceTs) {
              const mdBal = Number(cpd.moneyDigits ?? moneyDigits);
              fallbackBalance = Number((Number(cpd.balance) / Math.pow(10, mdBal)).toFixed(Math.min(8, Math.max(2, mdBal))));
              fallbackBalanceTs = tsBal;
            }
          }

          const sid = Number(deal.symbolId);
          const symInfo = symbolCache.get(sid);

          let symbolName = symInfo?.symbolName || KNOWN_CTRADER_SYMBOLS[sid] || `SYM_${sid}`;
          if (symbolName.startsWith('SYM_') && KNOWN_CTRADER_SYMBOLS[sid]) {
            symbolName = KNOWN_CTRADER_SYMBOLS[sid];
          }
          symbolName = symbolName.replace(/[\/\s_-]/g, '').toUpperCase();

          const execTimeEarly = Number(deal.executionTimestamp);

          // Lot büyüklüğü doğrulanmadıysa (2116 başarısız) varsayılan 10.000.000 ile ÇARPIM/BÖLÜM yapılmaz:
          // altın/kripto/indekslerde lot 1000 kat ve üzeri yanlış çıkıyordu. Deal atlanır, imleç gerisinde tutulur,
          // sonraki senkron yeniden dener.
          if (!confirmedLot.has(sid)) {
            skippedUnknownLot++;
            if (execTimeEarly < minSkippedTs) minSkippedTs = execTimeEarly;
            continue;
          }
          const lotSize = symInfo!.lotSize;
          const moneyDigitsForDeal = Number(cpd.moneyDigits ?? moneyDigits);
          const divisor = Math.pow(10, moneyDigitsForDeal);
          const dec = Math.min(8, Math.max(2, moneyDigitsForDeal));   // 8 haneli (BTC) hesaplarda 2 haneye yuvarlanıp sıfırlanmasın

          // cTrader'da kapanış işlemi SELL (2) ise asıl pozisyon LONG; BUY (1) ise SHORT'tur.
          const isClosingSell = deal.tradeSide === 2 || deal.tradeSide === 'SELL' || String(deal.tradeSide).toLowerCase() === 'sell';
          const direction = isClosingSell ? 'LONG' : 'SHORT';
          const rawVolume = Number(cpd.closedVolume ?? deal.filledVolume ?? deal.volume ?? 0);
          // Hacim 0/geçersizse lot UYDURULMAZ (eskiden 0.01 yazılıyordu): deal atlanır
          if (!(rawVolume > 0) || !(lotSize > 0)) {
            skippedInvalidVolume++;
            continue;
          }
          const lot = Number((rawVolume / lotSize).toFixed(4));

          const grossProfitNum = Number(cpd.grossProfit ?? 0);
          const grossPnl = isNaN(grossProfitNum) ? 0 : (grossProfitNum / divisor);

          const commissionNum = Number(cpd.commission ?? deal.commission ?? 0);
          const commission = isNaN(commissionNum) ? 0 : (Math.abs(commissionNum) / divisor);

          const swapNum = Number(cpd.swap ?? 0);
          const swap = isNaN(swapNum) ? 0 : (swapNum / divisor);

          const netPnl = grossPnl - commission + swap;
          const instrument = guessInstrument(symbolName);
          const multiplier = MULTIPLIER_MAP[instrument] || 1;
          const execTime = Number(deal.executionTimestamp);

          if (execTime > latestDealTimestamp) {
            latestDealTimestamp = execTime;
          }

          // Teşhis: aynı pozisyonun birden fazla kapanışında swap/komisyon "pozisyon toplamı" mı yoksa "deal başına" mı?
          if (deal.positionId) {
            const pk = String(deal.positionId);
            const list = positionClosings.get(pk) || [];
            list.push({ swap: Number(cpd.swap ?? 0), commission: Number(cpd.commission ?? deal.commission ?? 0) });
            positionClosings.set(pk, list);
          }

          const entryPrice = Number(cpd.entryPrice) || Number(deal.executionPrice) || 0;
          const exitPrice = Number(deal.executionPrice) || entryPrice;

          pendingTradesToInsert.push({
            user_id: user.id,
            journal_id: targetJournalId,
            symbol: symbolName,
            direction,
            instrument,
            lot,
            entry_price: entryPrice,
            exit_price: exitPrice,
            gross_pnl: Number(grossPnl.toFixed(dec)),
            commission: Number(commission.toFixed(dec)),
            swap: Number(swap.toFixed(dec)),
            pnl: Number(netPnl.toFixed(dec)),
            trade_date: new Date(execTime).toISOString(),
            exit_date: new Date(execTime).toISOString(),
            multiplier,
            platform_source: 'ctrader',
            position_id: deal.positionId ? String(deal.positionId) : null,
            last_deal_id: deal.dealId ? Number(deal.dealId) : null,
            import_hash: `ctrader:${ctidTraderAccountId}:${deal.dealId}`,
            created_at: new Date().toISOString(),
          });
        }

        // Batch upsert (200'lük gruplar)
        if (pendingTradesToInsert.length >= 200) {
          const chunk = pendingTradesToInsert.splice(0, 200);
          const { data: upsertData, error: upErr } = await admin.from('trades').upsert(chunk, {
            onConflict: 'user_id,journal_id,import_hash',
            ignoreDuplicates: true,
          }).select('id');

          if (upErr) {
            console.error('❌ Trades chunk upsert error:', upErr);
            throw new Error('İşlemler veritabanına kaydedilirken hata oluştu: ' + (upErr.message || ''));
          }

          insertedCount += upsertData?.length || 0;
          skippedCount += (chunk.length - (upsertData?.length || 0));
        }

        if (hasMore && deals.length > 0) {
          const lastExec = Number(deals[deals.length - 1].executionTimestamp);
          // Bir sonraki sayfa SON deal'in zamanından BAŞLAR (eskiden +1 idi: aynı milisaniyedeki, sayfa sınırına
          // düşen deal'ler hiç çekilmiyordu). Tekrar gelenler import_hash ile atlanır. Sayfa tamamen aynı
          // milisaniyedeyse takılmamak için +1.
          processedUntil = Math.max(processedUntil, lastExec - 1);
          dealFrom = lastExec > dealFrom ? lastExec : dealFrom + 1;
          if (dealFrom >= currTo) break;
        } else {
          processedUntil = Math.max(processedUntil, currTo);
          break;
        }
      }

      if (!isDone) break;
      processedUntil = Math.max(processedUntil, currTo);
      currFrom = currTo + 1;
    }

    // Kalan son kayıtları upsert et
    if (pendingTradesToInsert.length > 0) {
      const { data: upsertData, error: upErr } = await admin.from('trades').upsert(pendingTradesToInsert, {
        onConflict: 'user_id,journal_id,import_hash',
        ignoreDuplicates: true,
      }).select('id');

      if (upErr) {
        console.error('❌ Trades final upsert error:', upErr);
        throw new Error('İşlemler veritabanına kaydedilirken hata oluştu: ' + (upErr.message || ''));
      }

      insertedCount += upsertData?.length || 0;
      skippedCount += (pendingTradesToInsert.length - (upsertData?.length || 0));
    }

    // Teşhis: aynı pozisyonun birden çok kapanışında aynı (sıfır olmayan) swap/komisyon tekrar ediyorsa bu değerler
    // büyük olasılıkla "pozisyon toplamı"dır ve her kısmi kapanış satırına tekrar yazılmış olabilir.
    const warnings: string[] = [];
    let repeatedCumulative = 0;
    for (const [, list] of positionClosings) {
      if (list.length < 2) continue;
      const sameSwap = list.every((x) => x.swap !== 0 && x.swap === list[0].swap);
      const sameComm = list.every((x) => x.commission !== 0 && x.commission === list[0].commission);
      if (sameSwap || sameComm) repeatedCumulative++;
    }
    if (repeatedCumulative > 0) {
      const w = `${repeatedCumulative} pozisyonda kısmi kapanış satırlarında aynı swap/komisyon değeri tekrar ediyor; cTrader bu alanları pozisyon toplamı olarak veriyor olabilir. Gerçek bir kısmi kapanışla toplam net PnL'i cTrader bakiyesiyle karşılaştırın.`;
      console.warn('⚠️', w);
      warnings.push(w);
    }
    if (skippedUnknownLot > 0) {
      warnings.push(`${skippedUnknownLot} işlem lot bilgisi alınamadığı için atlandı; bir sonraki senkronda yeniden denenecek.`);
    }
    if (skippedInvalidVolume > 0) {
      warnings.push(`${skippedInvalidVolume} işlem geçersiz hacim nedeniyle atlandı.`);
    }

    // Senkron imleci:
    //  - Tamamlandıysa: son kapanış zamanı (kapanış yoksa önceki imleç, o da yoksa şimdi)
    //  - Zaman aşımında: işlenen son noktaya kadar (eskiden "şimdi"ye atlıyor, çekilmemiş geçmişi kaybettiriyordu)
    //  - Lot bilgisi alınamayıp atlanan deal varsa imleç onun gerisinde tutulur (sonraki senkron yeniden dener)
    const prevCursor = accountRow.last_deal_timestamp ? Number(accountRow.last_deal_timestamp) : 0;
    let nextCursor = isDone
      ? (latestDealTimestamp > 0 ? latestDealTimestamp : (prevCursor || now))
      : Math.max(prevCursor, processedUntil);
    if (minSkippedTs !== Number.POSITIVE_INFINITY) {
      nextCursor = Math.min(nextCursor, Math.max(0, minSkippedTs - 1));
    }

    // Senkron durumunu güncelle
    await admin.from('ctrader_accounts').update({
      last_sync_at: new Date().toISOString(),
      last_deal_timestamp: nextCursor,
      syncing_since: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', accountRow.id);

    // Bakiye ayrı güncellenir: migration henüz çalıştırılmadıysa (sütun yok) senkron imleci/durumu etkilenmesin.
    if (accountBalance === null && fallbackBalance !== null && fallbackBalanceTs > 0) {
      accountBalance = fallbackBalance;
      balanceSource = 'last_deal';
      balanceAsOf = new Date(fallbackBalanceTs).toISOString();
      console.log('Bakiye 2121 cevabında yoktu; son kapanış işleminin bakiyesi kullanıldı:', accountBalance, balanceAsOf);
    }
    if (accountBalance !== null) {
      const { error: balErr } = await admin.from('ctrader_accounts').update({
        balance: accountBalance,
        balance_currency: balanceCurrency,
        balance_updated_at: balanceAsOf,
      }).eq('id', accountRow.id);
      if (balErr) {
        console.warn('Bakiye kaydedilemedi (202610150005 migration çalıştırıldı mı?):', balErr.message);
        warnings.push('Bakiye kaydedilemedi: veritabanı güncellemesi (202610150005) eksik olabilir.');
      }
    } else {
      // 2121 cevabında bakiye yoktu ya da istek başarısız oldu
      console.warn('cTrader bakiye bilgisi alınamadı (traderInfoOk=' + traderInfoOk + ') — ' + traderDiag);
      warnings.push('cTrader bakiye bilgisini döndürmedi; bakiye güncellenemedi.');
    }

    return jsonRes({
      success: true,
      done: isDone,
      balance: accountBalance,
      balance_currency: balanceCurrency,
      balance_source: balanceSource,
      balance_debug: accountBalance === null ? traderDiag : undefined,   // yalnızca bakiye alınamadıysa: nedenini göstermek için
      inserted: insertedCount,
      skipped: skippedCount,
      fetched: totalFetched,
      warnings,
      message: `${insertedCount} yeni işlem eklendi, ${skippedCount} mükerrer işlem atlandı.` +
        (skippedUnknownLot > 0 ? ` ${skippedUnknownLot} işlem lot bilgisi alınamadığı için atlandı (sonraki senkronda yeniden denenecek).` : ''),
    }, 200, cors);

  } catch (err: any) {
    console.error('Sync execution error:', err);
    const friendlyMsg = translateCtraderError(err);
    await admin.from('ctrader_accounts').update({
      syncing_since: null,
      last_error: friendlyMsg,
      updated_at: new Date().toISOString(),
    }).eq('id', accountRow.id);

    return jsonRes({
      error: friendlyMsg,
      rawError: err?.description || err?.message || 'Bilinmeyen hata',
    }, 400, cors);

  } finally {
    wsClient.close();
  }
});
