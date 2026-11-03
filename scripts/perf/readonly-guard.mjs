// ============================================================
// SALT OKUMA KORUMASI (gerçek hesapla ölçüm) — scripts/perf/readonly-guard.mjs
// ============================================================
// Gerçek test hesabıyla sayfa açarken canlı veritabanına yazılmasın: *.supabase.co'ya giden istekler tarayıcıda
// süzülür. Geçenler: GET/HEAD/OPTIONS, oturum (POST /auth/v1/token: giriş ve token yenileme) ve adı get_ / list_ ile
// başlayan RPC'ler (istemcide hepsi okuma: list_journals, get_prices, get_ctrader_status …). Diğer her şey
// (tablo POST/PATCH/DELETE, yazan RPC'ler, edge function çağrıları, çıkış) ENGELLENİR ve `blocked` listesine yazılır.
// { allowLogin: true } (yalnızca giriş penceresi): giriş isteği POST /functions/v1/verify-auth {action:"login"} geçer
// (oturum açar; sunucu güvenlik kaydı olarak login_attempts'e bir satır yazar, her normal girişte olduğu gibi).
// ============================================================
const READ_RPC = /^\/rest\/v1\/rpc\/(?:get|list)_[a-z0-9_]+$/;

export function isAllowed(method, url, body = '', { allowLogin = false } = {}) {
  const u = new URL(url);
  if (!u.hostname.endsWith('.supabase.co')) return true;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  if (method === 'POST' && u.pathname === '/auth/v1/token') return true;
  if (method === 'POST' && READ_RPC.test(u.pathname)) return true;
  if (allowLogin && method === 'POST' && u.pathname === '/functions/v1/verify-auth') {
    try { return JSON.parse(body || '{}').action === 'login'; } catch (e) { return false; }
  }
  return false;
}

/** page: Puppeteer sayfası. Dönen { blocked } ölçüm sonunda raporlanır (boş olmalı ya da yalnızca engellenmiş yazmalar). */
export async function guardReadOnly(page, opts = {}) {
  const blocked = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.isInterceptResolutionHandled()) return;
    if (isAllowed(req.method(), req.url(), req.postData() || '', opts)) return req.continue();
    const u = new URL(req.url());
    blocked.push(req.method() + ' ' + u.pathname);
    return req.abort('blockedbyclient');
  });
  return { blocked };
}
