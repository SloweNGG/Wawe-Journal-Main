// supabase/functions/_shared/ctrader.ts
// ctrader-sync ve ctrader-candles'in ORTAK kodu: CORS, cTrader WebSocket istemcisi, kilitli token yenileme ve
// trendbar (mum) çekme. Bu dosya URL'den içe aktarma yapmaz; Deno'da ve Node testlerinde (tests/ctrader-shared.test.js)
// aynen çalışır. Gizli değerler (token, secret) hiçbir log ya da yanıta yazılmaz.

// ------------------------------------------------------------------ genel
export const ALLOWED_ORIGINS = [
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

export function getCorsHeaders(origin: string | null): Record<string, string> {
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

export function jsonRes(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

export const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

// ------------------------------------------------------------------ WebSocket istemcisi
// cTrader geçmiş veri isteği sınırı: bağlantı başına saniyede 5. İstekler en az MIN_INTERVAL_MS arayla gider.
export const MIN_INTERVAL_MS = 250;

export class CTraderWsClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, { resolve: (res: any) => void; reject: (err: any) => void; timer: ReturnType<typeof setTimeout> }>();
  private lastSentAt = 0;
  private minIntervalMs: number;

  constructor(minIntervalMs = 0) { this.minIntervalMs = minIntervalMs; }

  async connect(host: string, port = 5036, timeoutMs = 8000): Promise<void> {
    const url = `wss://${host}:${port}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.ws) this.ws.close();
        reject(new Error(`WebSocket bağlantı zaman aşımı (${host})`));
      }, timeoutMs);

      try {
        this.ws = new WebSocket(url);
        this.ws.onopen = () => { clearTimeout(timer); resolve(); };
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
              if (data.payloadType === 2142) req.reject(data.payload);
              else req.resolve(data);
            }
          } catch (_) { /* bozuk çerçeve: yok say */ }
        };
        this.ws.onerror = () => { /* ayrıntı (token içerebilir) loglanmaz */ };
        this.ws.onclose = () => {
          // açık istekler sonsuza dek beklemesin
          for (const [id, req] of this.pending) {
            clearTimeout(req.timer);
            this.pending.delete(id);
            req.reject(new Error('WebSocket kapandı'));
          }
        };
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  async sendRequest(payloadType: number, payload: Record<string, any>, timeoutMs = 12000): Promise<any> {
    if (this.minIntervalMs > 0) {
      const wait = this.lastSentAt + this.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastSentAt = Date.now();
    }
    const clientMsgId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return reject(new Error('WebSocket açık değil'));
      const timer = setTimeout(() => {
        this.pending.delete(clientMsgId);
        reject(new Error(`İstek zaman aşımı (${payloadType})`));
      }, timeoutMs);
      this.pending.set(clientMsgId, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ clientMsgId, payloadType, payload }));
    });
  }

  close() { try { this.ws?.close(); } catch (_) { /* yok say */ } }
}

// cTrader hata yanıtı (2142) -> { code, message }. code: AUTH (token/oturum), RATE (hız sınırı), RANGE, MAINT, OTHER
export function classifyCtraderError(err: any): { code: string; message: string } {
  const raw = String(err?.errorCode ?? '');
  const desc = String(err?.description ?? err?.message ?? '');
  const up = (raw + ' ' + desc).toUpperCase();
  if (/TOKEN|ACCESS_DENIED|CH_CLIENT_AUTH|CANT_ROUTE|NOT_AUTH|ACCOUNT_NOT_AUTHORIZED|OA_AUTH/.test(up) || raw === '1' || raw === '104') {
    return { code: 'AUTH', message: 'cTrader oturumunun süresi dolmuş. Lütfen hesabı yeniden bağlayın.' };
  }
  if (/FREQUENCY|RATE|TOO_MANY/.test(up) || raw === '108') return { code: 'RATE', message: 'İstek sıklığı aşıldı. Lütfen birkaç saniye sonra tekrar deneyin.' };
  if (/RANGE|INVALID_REQUEST/.test(up) || raw === '35') return { code: 'RANGE', message: 'Tarih aralığı sınırları aşıldı.' };
  if (/MAINTENANCE|SERVER_IS_UNDER/.test(up) || raw === '109') return { code: 'MAINT', message: 'cTrader sunucuları şu anda bakımda. Lütfen daha sonra deneyin.' };
  return { code: 'OTHER', message: 'cTrader bağlantı hatası oluştu.' };
}

// ------------------------------------------------------------------ token yenileme (kilitli, ortak)
// Neden kilit: cTrader refresh token tek kullanımlıktır. ctrader-sync ve ctrader-candles aynı anda yenilerse
// ikincisi geçersiz refresh token ile gider, kullanıcının bağlantısı kopar. Kilit, ctrader_tokens.refreshing_since
// sütunundaki kısa ömürlü "kira"dır; tek bir UPDATE ile atomik alınır (koşul: boş ya da LEASE_MS'den eski).
export const REFRESH_SKEW_MS = 24 * 60 * 60 * 1000;   // bitime 1 günden az kaldıysa yenile
export const LEASE_MS = 60 * 1000;
export const LEASE_WAIT_MS = 20 * 1000;                // kira başkasındaysa en fazla bu kadar bekle

export interface TokenRow { access_token: string; refresh_token: string; expires_at: string; status?: string }
export interface TokenStore {
  read(userId: string): Promise<TokenRow | null>;
  /** Kirayı atomik almaya çalışır; aldıysa kilit altındaki GÜNCEL satırı döner, almadıysa null. */
  acquire(userId: string, nowIso: string, cutoffIso: string): Promise<TokenRow | null>;
  /** Yeni token'ları yazar ve kirayı bırakır. */
  save(userId: string, fields: { access_token: string; refresh_token: string; expires_at: string }): Promise<void>;
  /** Yalnızca kirayı bırakır (yenileme gerekmedi ya da geçici hata). */
  release(userId: string): Promise<void>;
  markNeedsReconnect(userId: string): Promise<void>;
}

export type AccessTokenResult =
  | { ok: true; accessToken: string; refreshed: boolean }
  | { ok: false; code: 'NO_TOKEN' | 'NEEDS_RECONNECT' | 'REFRESH_ERROR'; message: string };

export interface RefreshDeps {
  clientId: string;
  clientSecret: string;
  fetchFn?: typeof fetch;
  now?: () => number;
  sleepFn?: (ms: number) => Promise<void>;
}

export async function getAccessToken(store: TokenStore, userId: string, deps: RefreshDeps): Promise<AccessTokenResult> {
  const now = deps.now ?? (() => Date.now());
  const sleepFn = deps.sleepFn ?? sleep;
  const doFetch = deps.fetchFn ?? fetch;
  const deadline = now() + LEASE_WAIT_MS;

  for (;;) {
    const row = await store.read(userId);
    if (!row) return { ok: false, code: 'NO_TOKEN', message: 'cTrader bağlantısı bulunamadı. Lütfen hesabı bağlayın.' };
    const expMs = new Date(row.expires_at).getTime();
    if (expMs - now() > REFRESH_SKEW_MS) return { ok: true, accessToken: row.access_token, refreshed: false };

    const nowIso = new Date(now()).toISOString();
    const locked = await store.acquire(userId, nowIso, new Date(now() - LEASE_MS).toISOString());
    if (!locked) {
      if (now() >= deadline) {
        // kira çok uzun sürdü: süresi dolmadıysa eldeki token ile devam, dolduysa geçici hata
        if (expMs > now()) return { ok: true, accessToken: row.access_token, refreshed: false };
        return { ok: false, code: 'REFRESH_ERROR', message: 'Token yenileme şu an yapılamıyor, tekrar deneyin.' };
      }
      await sleepFn(500);
      continue;
    }

    // Kira bizde. Beklerken başkası yenilemiş olabilir: kilit altındaki satırı yeniden değerlendir.
    const lockedExp = new Date(locked.expires_at).getTime();
    if (lockedExp - now() > REFRESH_SKEW_MS) {
      await store.release(userId);
      return { ok: true, accessToken: locked.access_token, refreshed: false };
    }

    let definitive = false;
    try {
      const url = `https://openapi.ctrader.com/apps/token?grant_type=refresh_token&refresh_token=${encodeURIComponent(locked.refresh_token)}&client_id=${encodeURIComponent(deps.clientId)}&client_secret=${encodeURIComponent(deps.clientSecret)}`;
      const res = await doFetch(url, { method: 'GET' });
      let data: any = null;
      try { data = await res.json(); } catch (_) { data = null; }
      if (!res.ok || !data || data.errorCode || !data.accessToken) {
        // 4xx ya da açık hata kodu: refresh token geçersiz (kesin). 5xx / bozuk gövde: geçici.
        definitive = !!(data && (data.errorCode || (res.status >= 400 && res.status < 500)));
        throw new Error('refresh failed');
      }
      const newExpires = new Date(now() + parseInt(String(data.expiresIn || '2592000'), 10) * 1000).toISOString();
      const fields = {
        access_token: String(data.accessToken),
        refresh_token: String(data.refreshToken || locked.refresh_token),
        expires_at: newExpires,
      };
      // Yeni refresh token kaybolursa bağlantı kopar: yazmayı birkaç kez dene.
      let saved = false, lastErr: unknown = null;
      for (let i = 0; i < 4 && !saved; i++) {
        try { await store.save(userId, fields); saved = true; } catch (e) { lastErr = e; await sleepFn(300); }
      }
      if (!saved) throw lastErr ?? new Error('save failed');
      return { ok: true, accessToken: fields.access_token, refreshed: true };
    } catch (_) {
      if (definitive) {
        await store.markNeedsReconnect(userId).catch(() => {});
        await store.release(userId).catch(() => {});
        return { ok: false, code: 'NEEDS_RECONNECT', message: 'cTrader yetkilendirme süresi doldu. Lütfen yeniden bağlayın.' };
      }
      await store.release(userId).catch(() => {});
      // geçici hata: token hâlâ geçerliyse onunla devam
      if (lockedExp > now()) return { ok: true, accessToken: locked.access_token, refreshed: false };
      return { ok: false, code: 'REFRESH_ERROR', message: 'cTrader token yenilenemedi, birazdan tekrar deneyin.' };
    }
  }
}

// Supabase (service_role) üzerinden TokenStore. `admin`, createClient(...) sonucudur.
export function supabaseTokenStore(admin: any): TokenStore {
  const COLS = 'access_token, refresh_token, expires_at, status';
  return {
    async read(userId) {
      const { data } = await admin.from('ctrader_tokens').select(COLS).eq('user_id', userId).maybeSingle();
      return data ?? null;
    },
    async acquire(userId, nowIso, cutoffIso) {
      // tek UPDATE: satır kilidi sayesinde iki çağıranın yalnızca biri satır döndürür
      const { data, error } = await admin.from('ctrader_tokens')
        .update({ refreshing_since: nowIso })
        .eq('user_id', userId)
        .or(`refreshing_since.is.null,refreshing_since.lt.${cutoffIso}`)
        .select(COLS);
      if (error) throw error;
      return Array.isArray(data) && data.length === 1 ? data[0] : null;
    },
    async save(userId, fields) {
      const { error } = await admin.from('ctrader_tokens').update({
        ...fields, status: 'active', refreshing_since: null, updated_at: new Date().toISOString(),
      }).eq('user_id', userId);
      if (error) throw error;
    },
    async release(userId) {
      await admin.from('ctrader_tokens').update({ refreshing_since: null }).eq('user_id', userId);
    },
    async markNeedsReconnect(userId) {
      await admin.from('ctrader_tokens').update({ status: 'needs_reconnect' }).eq('user_id', userId);
    },
  };
}

// ------------------------------------------------------------------ trendbar (mum) çekme
export const PERIOD_M1 = 1;
export const PERIOD_W1 = 13;
export const CHUNK_MS = 9 * 24 * 60 * 60 * 1000;   // yanıt başına 14 000 bar tavanı: 9 gün M1 her zaman sığar
export const MAX_PAGES = 20;

export interface Bar { tMin: number; o: number; h: number; l: number; c: number }   // fiyatlar 1e-5 birimli tam sayı

// ProtoOATrendbar: low + deltalar (işaretsiz), fiyat birimi 1/100000
export function decodeTrendbar(tb: any): Bar | null {
  const low = Number(tb?.low), t = Number(tb?.utcTimestampInMinutes);
  const dO = Number(tb?.deltaOpen ?? 0), dC = Number(tb?.deltaClose ?? 0), dH = Number(tb?.deltaHigh ?? 0);
  if (![low, t, dO, dC, dH].every(Number.isFinite) || t <= 0) return null;
  return { tMin: t, o: low + dO, h: low + dH, l: low, c: low + dC };
}

// [fromMs, toMs] aralığının M1 barları. 9 günlük parçalar; hasMore gelirse (en SON 14 000 bar döner) geriye doğru sayfalar.
export async function fetchMinuteBars(client: { sendRequest: (t: number, p: any, ms?: number) => Promise<any> },
  ctid: number, symbolId: number, fromMs: number, toMs: number, opts: { chunkMs?: number } = {}): Promise<Bar[]> {
  const chunk = opts.chunkMs ?? CHUNK_MS;
  const byT = new Map<number, Bar>();
  for (let a = fromMs; a < toMs; a += chunk) {
    let to = Math.min(a + chunk, toMs);
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await client.sendRequest(2137, {
        ctidTraderAccountId: ctid, fromTimestamp: a, toTimestamp: to, period: PERIOD_M1, symbolId,
      });
      const list: any[] = res?.payload?.trendbar ?? [];
      let minT = Infinity;
      for (const tb of list) {
        const b = decodeTrendbar(tb);
        if (!b) continue;
        byT.set(b.tMin, b);
        if (b.tMin < minT) minT = b.tMin;
      }
      if (!res?.payload?.hasMore || !list.length || !Number.isFinite(minT)) break;
      const next = minT * 60000 - 1;
      if (next <= a || next >= to) break;   // ilerleme yok: sonsuz döngüye girme
      to = next;
    }
  }
  return [...byT.values()].sort((x, y) => x.tMin - y.tMin);
}

// Aralıkta en az bir M1 barı var mı? (count: 1 -> yalnızca aralığın son barı gelir, yanıt küçüktür)
export async function hasMinuteBars(client: { sendRequest: (t: number, p: any, ms?: number) => Promise<any> },
  ctid: number, symbolId: number, fromMs: number, toMs: number): Promise<boolean> {
  const res = await client.sendRequest(2137, {
    ctidTraderAccountId: ctid, fromTimestamp: fromMs, toTimestamp: toMs, period: PERIOD_M1, symbolId, count: 1,
  });
  return (res?.payload?.trendbar ?? []).length > 0;
}

export function monthKeyOf(ms: number): string {
  const d = new Date(ms);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}
export function monthStartMs(key: string): number { return Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, 1); }
export function addMonthsKey(key: string, n: number): string { return monthKeyOf(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1 + n, 1)); }

// Hesapta bu sembolün M1 verisinin ilk ayı ve ilk barı. W1 ile alt sınır, aylık ikili aramayla ilk M1 ayı, sonra o ayın ilk barı.
// Varsayım: veri bir kez başladıktan sonra aylar boş değildir (Spotware ölçümünde 2020'den beri delik yok).
export async function findFirstMinuteBar(client: { sendRequest: (t: number, p: any, ms?: number) => Promise<any> },
  ctid: number, symbolId: number, nowMs: number): Promise<{ firstMonth: string; firstTMin: number; probes: number } | null> {
  let probes = 0;
  const EARLIEST = Date.UTC(2000, 0, 1);
  const lastMonth = monthKeyOf(nowMs - 24 * 60 * 60 * 1000);   // dünün ayı (uç noktada boş gelmesin)

  // alt sınır: haftalık barların en eskisi
  let loKey = monthKeyOf(EARLIEST);
  try {
    const w = await client.sendRequest(2137, {
      ctidTraderAccountId: ctid, fromTimestamp: EARLIEST, toTimestamp: nowMs, period: PERIOD_W1, symbolId,
    });
    probes++;
    const list: any[] = w?.payload?.trendbar ?? [];
    let minT = Infinity;
    for (const tb of list) { const b = decodeTrendbar(tb); if (b && b.tMin < minT) minT = b.tMin; }
    if (Number.isFinite(minT)) loKey = monthKeyOf(minT * 60000);
  } catch (e) {
    if (classifyCtraderError(e).code === 'AUTH') throw e;
    /* ipucu alınamadı: 2000'den ara */
  }

  const probeMonth = async (key: string) => {
    probes++;
    return hasMinuteBars(client, ctid, symbolId, monthStartMs(key), monthStartMs(addMonthsKey(key, 1)) - 1);
  };
  if (!(await probeMonth(lastMonth))) return null;     // M1 verisi yok ya da güncel değil
  let lo = loKey, hi = lastMonth;                       // hi: veri var (invariant)
  while (lo < hi) {
    // ay sayısı farkı
    const span = (+hi.slice(0, 4) - +lo.slice(0, 4)) * 12 + (+hi.slice(5, 7) - +lo.slice(5, 7));
    const mid = addMonthsKey(lo, Math.floor(span / 2));
    if (await probeMonth(mid)) hi = mid; else lo = addMonthsKey(mid, 1);
  }
  // ilk bar: ayın ilk bar içeren 9 günlük parçası
  const from = monthStartMs(hi), monthEnd = monthStartMs(addMonthsKey(hi, 1));
  for (let a = from; a < monthEnd; a += CHUNK_MS) {
    const bars = await fetchMinuteBars(client, ctid, symbolId, a, Math.min(a + CHUNK_MS, monthEnd - 1));
    probes++;
    if (bars.length) return { firstMonth: monthKeyOf(bars[0].tMin * 60000), firstTMin: bars[0].tMin, probes };
  }
  return { firstMonth: hi, firstTMin: from / 60000, probes };
}
