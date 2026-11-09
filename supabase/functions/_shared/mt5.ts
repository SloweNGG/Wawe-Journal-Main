// supabase/functions/_shared/mt5.ts
// MetaTrader 5 köprüsünün (mt5-bridge Edge Function + WaweSync EA) SAF mantığı: istek doğrulama, sunucu saati -> UTC,
// sembol normalleştirme, kapanmış pozisyon -> trades satırı. URL'den içe aktarma yapmaz; Deno'da ve Node testlerinde
// (tests/mt5-shared.test.js) aynen çalışır. Gizli değerler (token, eşleşme sırrı) hiçbir log ya da yanıta yazılmaz.
//
// Protokol (EA <-> mt5-bridge), hepsi POST JSON, yanıtlar DÜZ (iç içe nesne yok: MQL5'te JSON ayrıştırıcı yok):
//   pair_start  {action, account}                      -> {ok, code, poll_secret, expires_in}
//   pair_poll   {action, poll_secret}                  -> {ok, status: pending|paired|expired|used|unknown, token?}
//   sync        {action, account, server_offset_sec, positions[]}  + Authorization: Bearer <token>
//               -> {ok, linked, inserted, duplicates, rejected, since, history_days, journal}
// Zamanlar EA'dan MT5 SUNUCU SAATİ (saniye) olarak gelir; `since` da aynı birimde döner.

export const MAX_POSITIONS_PER_REQUEST = 500;
export const MAX_BODY_BYTES = 1_000_000;
export const HISTORY_DAYS = 90;
export const TOKEN_RE = /^wwm5_[0-9a-f]{64}$/;
export const POLL_SECRET_RE = /^[0-9a-f]{64}$/;

// ------------------------------------------------------------------ enstrüman (ctrader-sync ile aynı mantık)
export const MULTIPLIER_MAP: Record<string, number> = { forex: 100000, gold: 100, index: 10, crypto: 1, other: 1 };

const FIAT_CODES = 'EUR|USD|GBP|JPY|CHF|CAD|AUD|NZD|TRY|ZAR|MXN|SEK|NOK|PLN|SGD|HKD|CNH|CZK|HUF|DKK|THB|ILS|RUB|CNY';
const FOREX_PAIR_RE = new RegExp('^(' + FIAT_CODES + ')(' + FIAT_CODES + ')(?![A-Z]{4,})');
const CRYPTO_BASE_RE = /^(XBT|BTC|ETH|SOL|ADA|XRP|DOGE|BNB|LTC|TRX|MATIC|AVAX|DOT|LINK|SHIB|NEAR|FTM)/;
const CRYPTO_QUOTE_RE = /(USDT|USDC|BUSD)$/;

export function guessInstrument(symbol: string): string {
  const s = String(symbol || '').toUpperCase().trim();
  const letters = s.replace(/[^A-Z]/g, '');
  if (/(XAU|GOLD|XAG|SILVER|XPT|PLATINUM|XPD)/.test(s)) return 'gold';
  if (FOREX_PAIR_RE.test(letters)) return 'forex';
  if (CRYPTO_BASE_RE.test(letters) || CRYPTO_QUOTE_RE.test(letters)) return 'crypto';
  if (/(US30|NAS|NAS100|SPX|SP500|DAX|UK100|JP225|USTEC|GER40|GER30|FRA40|DE40|DE30|DJ30|WS30|US100|US500|NIKKEI|FTSE)/.test(s)) return 'index';
  if (letters.length === 6) return 'forex';
  return 'other';
}

// Broker son ekleri atılır: "EURUSD.r", "EURUSD#", "XAUUSD+", "GBPJPY_i" -> ayraçtan öncesi;
// "EURUSDm", "XAUUSDc" (6+ büyük harf + küçük harf eki) -> büyük harf kısmı. "Ger40", "US30Cash" gibi adlar korunur.
export function normalizeSymbol(raw: unknown): string {
  let s = String(raw ?? '').trim();
  const sep = s.search(/[.#+!_\-]/);
  if (sep >= 3) s = s.slice(0, sep);
  const m = /^([A-Z]{6,})[a-z]+$/.exec(s);
  if (m) s = m[1];
  return s.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 32);
}

// ------------------------------------------------------------------ sunucu saati -> UTC
// MT5 işlem zamanları broker sunucusunun saatindedir. EA şu anki farkı (TimeTradeServer() - TimeGMT()) gönderir.
// Forex brokerlarının çoğu "New York kapanışı" düzenini kullanır: kışın GMT+2, ABD yaz saatinde GMT+3. Fark +2/+3 ise
// geçmiş işlemler için o tarihteki ABD yaz saati durumuna göre +2 ya da +3 uygulanır; diğer farklar sabit kabul edilir.

// ABD yaz saati: Mart'ın 2. pazarı 02:00 yerel (07:00 UTC) -> Kasım'ın 1. pazarı 02:00 yerel (06:00 UTC)
export function usDstActive(utcMs: number): boolean {
  const y = new Date(utcMs).getUTCFullYear();
  const nthSunday = (month: number, n: number) => {
    const first = new Date(Date.UTC(y, month, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + (n - 1) * 7;
  };
  const start = Date.UTC(y, 2, nthSunday(2, 2), 7);
  const end = Date.UTC(y, 10, nthSunday(10, 1), 6);
  return utcMs >= start && utcMs < end;
}

export function roundOffset(offsetSec: unknown): number {
  const n = Number(offsetSec);
  if (!Number.isFinite(n) || Math.abs(n) > 14 * 3600) return 0;
  return Math.round(n / 900) * 900;
}

export function serverToUtcMs(serverSec: number, offsetSec: number): number {
  const off = roundOffset(offsetSec);
  if (off === 7200 || off === 10800) {
    const guess = (serverSec - 7200) * 1000;            // kış farkıyla tahmin; sınırda 1 saatlik belirsizlik kabul edilir
    return (serverSec - (usDstActive(guess) ? 10800 : 7200)) * 1000;
  }
  return (serverSec - off) * 1000;
}

// ------------------------------------------------------------------ doğrulama
const finite = (v: unknown) => typeof v === 'number' ? Number.isFinite(v) : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
const num = (v: unknown) => Number(v);
const MIN_TS = 946684800;            // 2000-01-01

export type AccountInfo = {
  login: number; server: string; broker: string | null; currency: string | null;
  isLive: boolean | null; balance: number | null; equity: number | null;
};

export function parseAccount(a: any): { ok: true; value: AccountInfo } | { ok: false; reason: string } {
  if (!a || typeof a !== 'object') return { ok: false, reason: 'account' };
  const login = num(a.login);
  if (!Number.isSafeInteger(login) || login <= 0) return { ok: false, reason: 'account.login' };
  const server = String(a.server ?? '').trim();
  if (server.length < 1 || server.length > 128) return { ok: false, reason: 'account.server' };
  const broker = a.company != null ? String(a.company).trim().slice(0, 128) || null : null;
  const currency = a.currency != null ? String(a.currency).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || null : null;
  // ACCOUNT_TRADE_MODE: 0 demo, 1 contest, 2 real
  const tm = a.trade_mode != null ? num(a.trade_mode) : NaN;
  const isLive = tm === 2 ? true : (tm === 0 || tm === 1) ? false : null;
  const money = (v: unknown) => finite(v) && Math.abs(num(v)) < 1e15 ? Number(num(v).toFixed(8)) : null;
  return { ok: true, value: { login, server, broker, currency, isLive, balance: money(a.balance), equity: money(a.equity) } };
}

export type Mt5Position = {
  id: string; symbol: string; side: 'buy' | 'sell'; volume: number;
  open_ts: number; close_ts: number; open_price: number; close_price: number;
  sl: number | null; tp: number | null; profit: number; commission: number; swap: number; fee: number;
};

export function validatePosition(p: any, nowServerSec: number): { ok: true; value: Mt5Position } | { ok: false; reason: string } {
  if (!p || typeof p !== 'object') return { ok: false, reason: 'position' };
  const id = String(p.id ?? '').trim();
  if (!/^\d{1,20}$/.test(id) || /^0+$/.test(id)) return { ok: false, reason: 'id' };
  const symbol = normalizeSymbol(p.symbol);
  if (!symbol) return { ok: false, reason: 'symbol' };
  const side = String(p.side ?? '').toLowerCase();
  if (side !== 'buy' && side !== 'sell') return { ok: false, reason: 'side' };
  if (!finite(p.volume) || !(num(p.volume) > 0) || num(p.volume) >= 1e6) return { ok: false, reason: 'volume' };
  for (const k of ['open_ts', 'close_ts']) {
    if (!finite(p[k]) || !Number.isInteger(num(p[k])) || num(p[k]) < MIN_TS || num(p[k]) > nowServerSec + 2 * 86400) {
      return { ok: false, reason: k };
    }
  }
  if (num(p.close_ts) < num(p.open_ts)) return { ok: false, reason: 'close_ts' };
  for (const k of ['open_price', 'close_price']) {
    if (!finite(p[k]) || !(num(p[k]) > 0) || num(p[k]) >= 1e9) return { ok: false, reason: k };
  }
  const level = (v: unknown) => finite(v) && num(v) > 0 && num(v) < 1e9 ? num(v) : null;
  const money: Record<string, number> = {};
  for (const k of ['profit', 'commission', 'swap', 'fee']) {
    const v = p[k] == null ? 0 : p[k];
    if (!finite(v) || Math.abs(num(v)) >= 1e12) return { ok: false, reason: k };
    money[k] = num(v);
  }
  return {
    ok: true,
    value: {
      id, symbol, side: side as 'buy' | 'sell', volume: num(p.volume),
      open_ts: num(p.open_ts), close_ts: num(p.close_ts),
      open_price: num(p.open_price), close_price: num(p.close_price),
      sl: level(p.sl), tp: level(p.tp),
      profit: money.profit, commission: money.commission, swap: money.swap, fee: money.fee,
    },
  };
}

// ------------------------------------------------------------------ pozisyon -> trades satırı
export function importHash(server: string, login: number, positionId: string): string {
  return `mt5:${String(server).trim().toLowerCase()}:${login}:${positionId}`;
}

const round = (v: number, d: number) => Number((Math.round(v * 10 ** d) / 10 ** d).toFixed(d));

// MT5'te komisyon ve ücret (fee) genelde NEGATİF gelir; trades.commission maliyet olarak POZİTİF tutulur
// (iade/rebate varsa negatif kalabilir). Net: pnl = gross_pnl - commission + swap  (ctrader-sync ile aynı).
// position_id NULL: trades_platform_unique / idx_trades_journal_position çakışmasın (hesap başka deftere taşınınca
// aynı pozisyon yeni deftere de yazılabilmeli). Pozisyon numarası import_hash içinde.
export function positionToTrade(p: Mt5Position, ctx: { userId: string; journalId: string; login: number; server: string; offsetSec: number }) {
  const instrument = guessInstrument(p.symbol);
  const commission = -(p.commission + p.fee);
  const closeIso = new Date(serverToUtcMs(p.close_ts, ctx.offsetSec)).toISOString();
  return {
    user_id: ctx.userId,
    journal_id: ctx.journalId,
    symbol: p.symbol,
    direction: p.side === 'buy' ? 'LONG' : 'SHORT',
    instrument,
    lot: round(p.volume, 4),
    entry_price: p.open_price,
    exit_price: p.close_price,
    stop_loss: p.sl,
    take_profit: p.tp,
    gross_pnl: round(p.profit, 2),
    commission: round(commission, 2),
    swap: round(p.swap, 2),
    pnl: round(p.profit - commission + p.swap, 2),
    trade_date: closeIso,             // ctrader-sync ve dosya içe aktarma ile aynı: işlem günü = kapanış
    exit_date: closeIso,
    multiplier: MULTIPLIER_MAP[instrument] || 1,
    platform_source: 'mt5',
    position_id: null,
    import_hash: importHash(ctx.server, ctx.login, p.id),
    is_quick_entry: false,
  };
}

// Bir senkron isteğindeki pozisyonları satırlara çevirir. Geçersiz pozisyonlar KALICI olarak atlanır (EA tekrar
// gönderse de geçersiz kalır), bu yüzden imleç (maxCloseTs) onları da kapsar; aksi halde EA aynı partiyi sonsuza dek yollar.
export function buildSyncRows(positions: unknown, ctx: { userId: string; journalId: string; login: number; server: string; offsetSec: number; nowServerSec: number }) {
  const list = Array.isArray(positions) ? positions : [];
  const rows: ReturnType<typeof positionToTrade>[] = [];
  const rejected: { id: string; reason: string }[] = [];
  const seen = new Set<string>();
  let maxCloseTs = 0;
  for (const raw of list.slice(0, MAX_POSITIONS_PER_REQUEST)) {
    const ct = Number((raw as any)?.close_ts);
    if (Number.isInteger(ct) && ct >= MIN_TS && ct <= ctx.nowServerSec + 2 * 86400 && ct > maxCloseTs) maxCloseTs = ct;
    const v = validatePosition(raw, ctx.nowServerSec);
    if (!v.ok) { rejected.push({ id: String((raw as any)?.id ?? '').slice(0, 24), reason: v.reason }); continue; }
    if (seen.has(v.value.id)) continue;
    seen.add(v.value.id);
    rows.push(positionToTrade(v.value, ctx));
  }
  return { rows, rejected, maxCloseTs, truncated: list.length > MAX_POSITIONS_PER_REQUEST };
}

// ------------------------------------------------------------------ yardımcılar
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m && TOKEN_RE.test(m[1]) ? m[1] : null;
}

// Kod "482913" -> "482 913" (EA ve site aynı biçimi gösterir)
export function formatCode(code: string): string {
  const c = String(code || '').replace(/\D/g, '');
  return c.length === 6 ? c.slice(0, 3) + ' ' + c.slice(3) : c;
}
