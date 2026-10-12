/**
 * scripts/ctrader-probe.ts
 *
 * cTrader Open API Doğrulama ve İnceleme Script'i (FAZ 0)
 *
 * Çalıştırma (Deno ile):
 *   deno run --allow-net --allow-env scripts/ctrader-probe.ts
 *
 * Çalıştırma (Node 22+ ile - Deno yoksa):
 *   node scripts/ctrader-probe.ts
 *
 * Gerekli Ortam Değişkenleri:
 *   CTRADER_CLIENT_ID          (Open API Application Client ID)
 *   CTRADER_CLIENT_SECRET      (Open API Application Client Secret)
 *   CTRADER_ACCESS_TOKEN       (Playground veya yetkilendirilmiş Access Token)
 *   CTRADER_ACCOUNT_ID         (ctidTraderAccountId - Örn: 12345678)
 *
 * Opsiyonel Ortam Değişkenleri:
 *   CTRADER_ENV                (demo | live - Varsayılan: demo)
 *   CTRADER_REFRESH_TOKEN      (Refresh token denemesi için)
 *   TEST_REFRESH               (true ise refresh token GET/POST testi yapar)
 */

// Dual runtime (Deno & Node 22+) desteği
const getEnv = (key: string): string | undefined => {
  if (typeof (globalThis as any).Deno !== 'undefined') {
    return (globalThis as any).Deno.env.get(key);
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
};

const exitProc = (code = 0) => {
  if (typeof (globalThis as any).Deno !== 'undefined') {
    (globalThis as any).Deno.exit(code);
  } else if (typeof process !== 'undefined') {
    process.exit(code);
  }
};

interface OpenApiMessage {
  clientMsgId: string;
  payloadType: number;
  payload: Record<string, any>;
}

// cTrader Open API Payload Türleri
const PROTO = {
  HEARTBEAT_EVENT: 51,
  APPLICATION_AUTH_REQ: 2100,
  APPLICATION_AUTH_RES: 2101,
  ACCOUNT_AUTH_REQ: 2102,
  ACCOUNT_AUTH_RES: 2103,
  SYMBOLS_LIST_REQ: 2114,
  SYMBOLS_LIST_RES: 2115,
  SYMBOL_BY_ID_REQ: 2116,
  SYMBOL_BY_ID_RES: 2117,
  TRADER_REQ: 2121,
  TRADER_RES: 2122,
  DEAL_LIST_REQ: 2133,
  DEAL_LIST_RES: 2134,
  ERROR_RES: 2142,
  ACCOUNTS_TOKEN_INVALIDATED_EVENT: 2147,
  GET_ACCOUNTS_BY_TOKEN_REQ: 2149,
  GET_ACCOUNTS_BY_TOKEN_RES: 2150,
  REFRESH_TOKEN_REQ: 2173,
  REFRESH_TOKEN_RES: 2174,
};

// Basit sembol -> instrument tespiti (quick-add.js ile uyumlu)
function guessInstrument(symbol: string): string {
  const s = String(symbol || '').toUpperCase().trim();
  if (/(BTC|ETH|SOL|ADA|XRP|DOGE|BNB|USDT|USDC|LTC|TRX|MATIC|AVAX|DOT|LINK|SHIB|NEAR|FTM)/.test(s)) return 'crypto';
  if (/(XAU|GOLD|XAG|SILVER|XPT|PLATINUM|XPD)/.test(s)) return 'gold';
  if (/(US30|NAS|NAS100|SPX|SP500|DAX|UK100|JP225|USTEC|GER40|GER30|FRA40|DE40|DE30|DJ30|WS30|US100|US500|NIKKEI|FTSE)/.test(s)) return 'index';
  const clean = s.replace(/[^A-Z]/g, '');
  if (clean.length === 6) return 'forex';
  if (clean.length >= 6) {
    const prefix = clean.slice(0, 6);
    const forexCurrencies = /(EUR|USD|GBP|JPY|CHF|CAD|AUD|NZD|TRY|ZAR|MXN|SEK|NOK|PLN|SGD|HKD|CNH)/;
    if (forexCurrencies.test(prefix.slice(0, 3)) && forexCurrencies.test(prefix.slice(3, 6))) {
      return 'forex';
    }
  }
  return 'other';
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class CTraderClient {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, {
    resolve: (res: any) => void;
    reject: (err: any) => void;
    timer: number;
  }>();
  private heartbeatCount = 0;
  public connectedUrl = '';

  async connect(url: string, timeoutMs = 8000): Promise<void> {
    this.connectedUrl = url;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.ws) this.ws.close();
        reject(new Error(`WebSocket bağlantı zaman aşımı: ${url}`));
      }, timeoutMs);

      try {
        console.log(`🔌 Bağlanılıyor: ${url}...`);
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          clearTimeout(timer);
          console.log(`✅ WebSocket bağlantısı başarıyla açıldı (${url})`);
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (err) => {
          console.error(`❌ WebSocket hata:`, err);
        };

        this.ws.onclose = (ev) => {
          console.log(`🔌 WebSocket kapandı. Kod: ${ev.code}, Sebep: ${ev.reason || 'belirtilmedi'}`);
        };
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  private handleMessage(raw: any) {
    try {
      const data: OpenApiMessage = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));

      // Heartbeat kontrolü
      if (data.payloadType === PROTO.HEARTBEAT_EVENT) {
        this.heartbeatCount++;
        // Sunucuya yanıt dön (gerekiyorsa)
        this.sendRaw({
          clientMsgId: `hb-${Date.now()}`,
          payloadType: PROTO.HEARTBEAT_EVENT,
          payload: {},
        });
        return;
      }

      if (data.clientMsgId && this.pendingRequests.has(data.clientMsgId)) {
        const { resolve, reject, timer } = this.pendingRequests.get(data.clientMsgId)!;
        clearTimeout(timer);
        this.pendingRequests.delete(data.clientMsgId);

        if (data.payloadType === PROTO.ERROR_RES) {
          reject(data.payload);
        } else {
          resolve(data);
        }
      } else {
        // Asenkron olaylar (ör. token iptal eventi)
        if (data.payloadType === PROTO.ACCOUNTS_TOKEN_INVALIDATED_EVENT) {
          console.warn(`⚠️ Olay Alındı: AccountsTokenInvalidatedEvent`, data.payload);
        }
      }
    } catch (e) {
      console.error(`❌ Gelen mesaj parse edilemedi:`, e);
    }
  }

  private sendRaw(msg: OpenApiMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket açık değil!');
    }
    this.ws.send(JSON.stringify(msg));
  }

  async sendRequest(payloadType: number, payload: Record<string, any>, timeoutMs = 12000): Promise<OpenApiMessage> {
    const clientMsgId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const msg: OpenApiMessage = { clientMsgId, payloadType, payload };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(clientMsgId);
        reject(new Error(`İstek zaman aşımı (${payloadType}) - clientMsgId: ${clientMsgId}`));
      }, timeoutMs);

      this.pendingRequests.set(clientMsgId, { resolve, reject, timer });
      this.sendRaw(msg);
    });
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
    }
  }

  getHeartbeatCount() {
    return this.heartbeatCount;
  }
}

// Güvenli yazdırma (token ve secret gizleme)
function sanitize(obj: any): any {
  if (!obj) return obj;
  const clone = JSON.parse(JSON.stringify(obj));
  function recurse(curr: any) {
    if (typeof curr !== 'object' || curr === null) return;
    for (const k of Object.keys(curr)) {
      if (/secret|token/i.test(k) && typeof curr[k] === 'string') {
        curr[k] = curr[k].slice(0, 4) + '***' + curr[k].slice(-4);
      } else if (typeof curr[k] === 'object') {
        recurse(curr[k]);
      }
    }
  }
  recurse(clone);
  return clone;
}

async function main() {
  console.log('='.repeat(65));
  console.log('🚀 CTRADER OPEN API PROBE SCRIPT (FAZ 0)');
  console.log('='.repeat(65));

  const clientId = getEnv('CTRADER_CLIENT_ID');
  const clientSecret = getEnv('CTRADER_CLIENT_SECRET');
  let accessToken = getEnv('CTRADER_ACCESS_TOKEN');
  const authCode = getEnv('CTRADER_AUTH_CODE');
  const redirectUri = getEnv('CTRADER_REDIRECT_URI') || 'http://localhost:4321/ctrader-callback.html';
  const accountIdStr = getEnv('CTRADER_ACCOUNT_ID');
  const envMode = (getEnv('CTRADER_ENV') || 'demo').toLowerCase();
  let refreshToken = getEnv('CTRADER_REFRESH_TOKEN');
  const testRefresh = getEnv('TEST_REFRESH') === 'true';

  if (!clientId || !clientSecret || (!accessToken && !authCode)) {
    console.error('❌ HATA: Eksik ortam değişkenleri!');
    console.error('Lütfen şunları tanımlayın:');
    console.error('  export CTRADER_CLIENT_ID="your_client_id"');
    console.error('  export CTRADER_CLIENT_SECRET="your_client_secret"');
    console.error('  export CTRADER_ACCESS_TOKEN="your_access_token" (veya CTRADER_AUTH_CODE="code_from_url")');
    console.error('  export CTRADER_ACCOUNT_ID="12345678"  (opsiyonel, otomatik listeden de seçilebilir)');
    console.error('  export CTRADER_ENV="demo"             (demo veya live)');
    exitProc(1);
    return;
  }

  // Eğer doğrudan code verildiyse token takası yap
  if (!accessToken && authCode) {
    console.log('\n--- 0. OAuth Authorization Code Takası Yapılıyor ---');
    console.log(`📌 Code: ${authCode.slice(0, 8)}...`);
    const tokenUrl = `https://openapi.ctrader.com/apps/token?grant_type=authorization_code&code=${encodeURIComponent(authCode)}&redirect_uri=${encodeURIComponent(redirectUri)}&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;

    const res = await fetch(tokenUrl, { method: 'GET' });
    const data = await res.json();
    if (!res.ok || data.errorCode || !data.accessToken) {
      console.error('❌ Token takası başarısız:', data);
      exitProc(1);
      return;
    }
    console.log('✅ Access Token ve Refresh Token başarıyla alındı!');
    console.log(`   Access Token: ${data.accessToken.slice(0, 8)}... (Geçerlilik: ${data.expiresIn} sn)`);
    accessToken = data.accessToken;
    if (data.refreshToken) {
      refreshToken = data.refreshToken;
    }
  }

  const host = envMode === 'live' ? 'live.ctraderapi.com' : 'demo.ctraderapi.com';
  const port = 5036;
  const wsUrl = `wss://${host}:${port}`;

  console.log(`📌 Hedef Ortam: ${envMode.toUpperCase()} (${wsUrl})`);
  console.log(`📌 Client ID: ${clientId.slice(0, 6)}...`);

  const client = new CTraderClient();

  try {
    // 1) WebSocket Bağlantısı
    console.log('\n--- 1. WebSocket Bağlantı Testi ---');
    await client.connect(wsUrl);
    console.log(`[a] Çalışan WebSocket URL: ${client.connectedUrl}`);

    // 2) 2100 ProtoOAApplicationAuthReq
    console.log('\n--- 2. Uygulama Yetkilendirme (2100 ProtoOAApplicationAuthReq) ---');
    const appAuthRes = await client.sendRequest(PROTO.APPLICATION_AUTH_REQ, {
      clientId,
      clientSecret,
    });
    console.log(`[b] 2101 Yanıtı:`, JSON.stringify(sanitize(appAuthRes.payload)));

    // 3) 2149 ProtoOAGetAccountListByAccessTokenReq
    console.log('\n--- 3. Hesap Listesi Alma (2149 ProtoOAGetAccountListByAccessTokenReq) ---');
    const accListRes = await client.sendRequest(PROTO.GET_ACCOUNTS_BY_TOKEN_REQ, {
      accessToken,
    });
    console.log(`[b] 2150 Yanıtı:`, JSON.stringify(sanitize(accListRes.payload)));

    const accounts: any[] = accListRes.payload?.ctidTraderAccount || [];
    console.log(`📊 Toplam Bulunan Hesap: ${accounts.length}`);
    for (const acc of accounts) {
      console.log(`   - ID: ${acc.ctidTraderAccountId} | Login: ${acc.traderLogin} | Broker: ${acc.brokerTitleShort} | Live: ${acc.isLive}`);
    }

    let targetAccountId = accountIdStr ? parseInt(accountIdStr, 10) : null;
    if (!targetAccountId && accounts.length > 0) {
      targetAccountId = accounts[0].ctidTraderAccountId;
      console.log(`ℹ️ CTRADER_ACCOUNT_ID belirtilmedi, ilk hesap seçildi: ${targetAccountId}`);
    }

    if (!targetAccountId) {
      throw new Error('Hesap listesinde hiç hesap bulunamadı ve CTRADER_ACCOUNT_ID verilmedi.');
    }

    // 4) 2102 ProtoOAAccountAuthReq
    console.log(`\n--- 4. Hesap Yetkilendirme (2102 ProtoOAAccountAuthReq) - Hesap: ${targetAccountId} ---`);
    const accAuthRes = await client.sendRequest(PROTO.ACCOUNT_AUTH_REQ, {
      ctidTraderAccountId: targetAccountId,
      accessToken,
    });
    console.log(`[b] 2103 Yanıtı:`, JSON.stringify(sanitize(accAuthRes.payload)));

    // 5) 2121 ProtoOATraderReq
    console.log('\n--- 5. Hesap / Trader Detayları (2121 ProtoOATraderReq) ---');
    const traderRes = await client.sendRequest(PROTO.TRADER_REQ, {
      ctidTraderAccountId: targetAccountId,
    });
    console.log(`[b] 2122 Yanıtı:`, JSON.stringify(sanitize(traderRes.payload)));
    const trader = traderRes.payload?.trader || {};
    const moneyDigits = trader.moneyDigits ?? 2;
    const regTimestamp = trader.registrationTimestamp ? Number(trader.registrationTimestamp) : 0;
    console.log(`   - Para Hassasiyeti (moneyDigits): ${moneyDigits} (Bölen: 10^${moneyDigits} = ${Math.pow(10, moneyDigits)})`);
    console.log(`   - Hesap Açılış Tarihi (regTimestamp): ${regTimestamp ? new Date(regTimestamp).toISOString() : 'Yok'}`);

    // 6) 2133 ProtoOADealListReq (7 günlük parçalarla son 30 gün)
    console.log('\n--- 6. Kapanmış İşlemleri Çekme (2133 ProtoOADealListReq - 7 Günlük Parçalarla) ---');
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const fromTime = regTimestamp > 0 && regTimestamp > thirtyDaysAgo ? regTimestamp : thirtyDaysAgo;

    let testIncorrectBoundaries = false;
    // 7 günlük aralık kontrolü
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    let currFrom = fromTime;
    const allDeals: any[] = [];
    let chunkCount = 0;

    while (currFrom < now) {
      const currTo = Math.min(currFrom + SEVEN_DAYS, now);
      chunkCount++;
      console.log(`   📦 Parça #${chunkCount}: ${new Date(currFrom).toISOString().slice(0, 10)} -> ${new Date(currTo).toISOString().slice(0, 10)}`);

      let hasMore = true;
      let dealFrom = currFrom;

      while (hasMore) {
        await sleep(250); // Hız sınırı koruması (maks 5 req/s)

        try {
          const dealRes = await client.sendRequest(PROTO.DEAL_LIST_REQ, {
            ctidTraderAccountId: targetAccountId,
            fromTimestamp: dealFrom,
            toTimestamp: currTo,
            maxRows: 100,
          });

          const deals = dealRes.payload?.deal || [];
          hasMore = dealRes.payload?.hasMore === true;
          console.log(`      -> ${deals.length} deal alındı (hasMore: ${hasMore})`);

          for (const d of deals) {
            allDeals.push(d);
          }

          if (hasMore && deals.length > 0) {
            const lastExecution = Number(deals[deals.length - 1].executionTimestamp);
            if (lastExecution > dealFrom) {
              dealFrom = lastExecution + 1;
            } else {
              break;
            }
          } else {
            break;
          }
        } catch (err: any) {
          if (err && err.errorCode === '35' || err?.description?.includes('BOUNDARIES')) {
            testIncorrectBoundaries = true;
            console.error(`      ⚠️ INCORRECT_BOUNDARIES hatası alındı!`, err);
          } else {
            console.error(`      ❌ Deal çekme hatası:`, err);
          }
          break;
        }
      }

      currFrom = currTo;
    }

    console.log(`\n📊 Toplam Çekilen Deal Sayısı: ${allDeals.length}`);

    // Kapanış deal'lerini filtrele: closePositionDetail dolu ve dealStatus: 2 (FILLED) veya 3 (PARTIALLY_FILLED)
    const closedDeals = allDeals.filter((d: any) => {
      const isStatusValid = d.dealStatus === 2 || d.dealStatus === 3;
      return isStatusValid && d.closePositionDetail != null;
    });

    console.log(`🎯 Kapanış Deal Sayısı (closePositionDetail dolu): ${closedDeals.length}`);

    // 7) 2116 ile Sembol Bilgilerini Çekme
    const uniqueSymbolIds = [...new Set(closedDeals.map((d: any) => d.symbolId))];
    const symbolMap = new Map<number, { symbolName: string; lotSize: number; digits: number }>();

    if (uniqueSymbolIds.length > 0) {
      console.log(`\n--- 7. Sembol Bilgilerini Çekme (2116 ProtoOASymbolByIdReq - ${uniqueSymbolIds.length} Sembol) ---`);
      await sleep(250);
      const symRes = await client.sendRequest(PROTO.SYMBOL_BY_ID_REQ, {
        ctidTraderAccountId: targetAccountId,
        symbolId: uniqueSymbolIds,
      });

      const symbols = symRes.payload?.symbol || [];
      for (const s of symbols) {
        // cTrader symbol formatı
        symbolMap.set(s.symbolId, {
          symbolName: s.symbolName || `SYM_${s.symbolId}`,
          lotSize: s.lotSize ? Number(s.lotSize) : 10000000, // lotSize cent cinsinden (örn 10,000,000 = 100,000 birim)
          digits: s.digits ?? 5,
        });
      }
      console.log(`   ✅ ${symbols.length} sembolün lotSize ve detayları kaydedildi.`);
    }

    // 8) Eşleme ve Karşılaştırma Analizi (En az 5 kapanış deal'i)
    console.log('\n' + '='.repeat(65));
    console.log('--- 8. [c, d, e] Kapanış Deal Eşleme ve Net PnL Karşılaştırması ---');
    console.log('='.repeat(65));

    const sampleDeals = closedDeals.slice(0, 10);
    if (sampleDeals.length === 0) {
      console.warn('⚠️ Son 30 günde hiç kapanmış pozisyon deal\'i bulunamadı!');
      console.warn('Hesapta geçmiş işlem yoksa veya son 30 gün boşsa lütfen cTrader üzerinden 1-2 demo işlem açıp kapatın.');
    }

    let pnlMismatchCount = 0;
    let conversionFeeObserved = false;

    sampleDeals.forEach((deal, idx) => {
      const cpd = deal.closePositionDetail;
      const symInfo = symbolMap.get(deal.symbolId) || { symbolName: `ID_${deal.symbolId}`, lotSize: 10000000, digits: 5 };
      const moneyDivisor = Math.pow(10, cpd.moneyDigits ?? moneyDigits);

      // Kapanış deal'inin tradeSide'ı: 1=BUY, 2=SELL
      // Formül varsayımı: Kapanış SELL ise pozisyon LONG, Kapanış BUY ise pozisyon SHORT
      const positionDirection = deal.tradeSide === 2 ? 'LONG' : (deal.tradeSide === 1 ? 'SHORT' : 'UNKNOWN');

      // Lot hesabı: closedVolume / lotSize
      // Not: closedVolume cent cinsinden, sembol lotSize da cent cinsinden
      const lot = Number(cpd.closedVolume) / symInfo.lotSize;

      // Para birimi değerleri
      const grossPnl = Number(cpd.grossProfit) / moneyDivisor;
      const commissionRaw = Number(cpd.commission);
      const commissionAbs = Math.abs(commissionRaw) / moneyDivisor;
      const swap = Number(cpd.swap) / moneyDivisor;

      // Formül 1: Bizim Journal tablosu formülü: pnl = gross_pnl - commission + swap
      const calculatedNetPnl = grossPnl - commissionAbs + swap;

      // Formül 2: cTrader'ın ham toplamı: (grossProfit + commission + swap) / 10^moneyDigits (işaretleriyle)
      const ctraderRawNet = (Number(cpd.grossProfit) + commissionRaw + Number(cpd.swap)) / moneyDivisor;

      const pnlDiff = Math.abs(calculatedNetPnl - ctraderRawNet);
      if (pnlDiff > 0.001) {
        pnlMismatchCount++;
      }

      if (cpd.pnlConversionFee != null && Number(cpd.pnlConversionFee) !== 0) {
        conversionFeeObserved = true;
      }

      const mappedTradeRow = {
        symbol: symInfo.symbolName,
        direction: positionDirection,
        instrument: guessInstrument(symInfo.symbolName),
        lot: Number(lot.toFixed(4)),
        entry_price: cpd.entryPrice,
        exit_price: deal.executionPrice,
        gross_pnl: Number(grossPnl.toFixed(2)),
        commission: Number(commissionAbs.toFixed(2)),
        swap: Number(swap.toFixed(2)),
        pnl: Number(calculatedNetPnl.toFixed(2)),
        trade_date: new Date(Number(deal.executionTimestamp)).toISOString(),
        import_hash: `ctrader:${targetAccountId}:${deal.dealId}`,
      };

      console.log(`\n🔹 [Örnek #${idx + 1}] Deal ID: ${deal.dealId} (Position ID: ${deal.positionId})`);
      console.log(`   HAM DEAL ÖZETİ:`);
      console.log(`     tradeSide: ${deal.tradeSide} (${deal.tradeSide === 1 ? 'BUY' : 'SELL'})`);
      console.log(`     executionPrice: ${deal.executionPrice}`);
      console.log(`     closedVolume: ${cpd.closedVolume} | lotSize: ${symInfo.lotSize} -> lot: ${lot}`);
      console.log(`     grossProfit: ${cpd.grossProfit} | commission: ${cpd.commission} | swap: ${cpd.swap}`);
      if (cpd.pnlConversionFee != null) {
        console.log(`     pnlConversionFee: ${cpd.pnlConversionFee}`);
      }
      console.log(`   EŞLENMİŞ TRADES SATIRI:`);
      console.log(`    `, JSON.stringify(mappedTradeRow, null, 2));
      console.log(`   NET PnL KARŞILAŞTIRMASI:`);
      console.log(`     Hesaplanan Net (gross - com + swap): ${calculatedNetPnl.toFixed(4)}`);
      console.log(`     cTrader Ham Net (gross + com + swap): ${ctraderRawNet.toFixed(4)}`);
      console.log(`     Fark: ${pnlDiff.toFixed(6)} ${pnlDiff <= 0.001 ? '✅ BİREBİR EŞİT' : '⚠️ FARK VAR'}`);
    });

    // 9) Doğrulama Raporu
    console.log('\n' + '='.repeat(65));
    console.log('--- 9. DOĞRULANAN VARSAYIMLAR RAPORU ---');
    console.log('='.repeat(65));
    console.log(`a) WebSocket URL: ${client.connectedUrl} (Sorunsuz bağlandı ✅)`);
    console.log(`b) 7 Günlük Aralık (INCORRECT_BOUNDARIES): ${testIncorrectBoundaries ? 'HATA VERDİ ❌ (aralık küçültülmeli)' : 'Sorunsuz çalıştı ✅'}`);
    console.log(`c) Heartbeat Olayları (51 ProtoHeartbeatEvent): Oturum süresince ${client.getHeartbeatCount()} adet heartbeat yakalandı.`);
    console.log(`d) Net PnL Uyuşumu: ${pnlMismatchCount === 0 ? 'Tüm örneklerde kuruşu kuruşuna eşit ✅' : `${pnlMismatchCount} işlemde fark görüldü ⚠️`}`);
    console.log(`e) pnlConversionFee: ${conversionFeeObserved ? 'Farklı para birimi dönüşüm ücreti görüldü ⚠️' : '0 veya tanımsız (aynı para birimi hesabı) ✅'}`);

    // 10) Refresh Token Testi (İsteğe bağlı)
    if (testRefresh && refreshToken) {
      console.log('\n--- 10. Refresh Token Testi (GET vs POST) ---');
      console.log('Test ediliyor: GET https://openapi.ctrader.com/apps/token ...');
      const getUrl = `https://openapi.ctrader.com/apps/token?grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;
      try {
        const getRes = await fetch(getUrl, { method: 'GET' });
        console.log(`   GET Yanıt Kodu: ${getRes.status}`);
        const getText = await getRes.text();
        console.log(`   GET Yanıtı: ${getText.slice(0, 200)}`);
      } catch (e: any) {
        console.error(`   GET Hatası:`, e.message);
      }

      console.log('Test ediliyor: POST https://openapi.ctrader.com/apps/token ...');
      try {
        const postRes = await fetch('https://openapi.ctrader.com/apps/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
          }),
        });
        console.log(`   POST Yanıt Kodu: ${postRes.status}`);
        const postText = await postRes.text();
        console.log(`   POST Yanıtı: ${postText.slice(0, 200)}`);
      } catch (e: any) {
        console.error(`   POST Hatası:`, e.message);
      }
    } else {
      console.log('\n--- 10. Refresh Token Testi: Atlandı (TEST_REFRESH=true ve CTRADER_REFRESH_TOKEN verilmedi) ---');
    }

  } catch (err) {
    console.error('\n❌ PROBE SIRASINDA HATA MEYDANA GELDİ:', err);
  } finally {
    client.close();
    console.log('\n🏁 Probe tamamlandı, bağlantı kapatıldı.');
  }
}

main();
