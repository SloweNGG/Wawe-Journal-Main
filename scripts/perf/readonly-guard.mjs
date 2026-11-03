// ============================================================
// SALT OKUMA KORUMASI (gerçek hesapla ölçüm) — scripts/perf/readonly-guard.mjs
// ============================================================
// Gerçek test hesabıyla sayfa açarken canlı veritabanına yazılmasın: *.supabase.co'ya giden istekler tarayıcıda
// süzülür. Geçenler: GET/HEAD/OPTIONS, oturum (POST /auth/v1/token: giriş ve token yenileme) ve adı get_ / list_ ile
// başlayan RPC'ler (istemcide hepsi okuma: list_journals, get_prices, get_ctrader_status …). Diğer her şey
// (tablo POST/PATCH/DELETE, yazan RPC'ler, edge function çağrıları, çıkış) ENGELLENİR ve `blocked` listesine yazılır.
// ============================================================
const READ_RPC = /^\/rest\/v1\/rpc\/(?:get|list)_[a-z0-9_]+$/;

export function isAllowed(method, url) {
  const u = new URL(url);
  if (!u.hostname.endsWith('.supabase.co')) return true;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  if (method === 'POST' && u.pathname === '/auth/v1/token') return true;
  if (method === 'POST' && READ_RPC.test(u.pathname)) return true;
  return false;
}

/** page: Puppeteer sayfası. Dönen { blocked } ölçüm sonunda raporlanır (boş olmalı ya da yalnızca engellenmiş yazmalar). */
export async function guardReadOnly(page) {
  const blocked = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.isInterceptResolutionHandled()) return;
    if (isAllowed(req.method(), req.url())) return req.continue();
    const u = new URL(req.url());
    blocked.push(req.method() + ' ' + u.pathname);
    return req.abort('blockedbyclient');
  });
  return { blocked };
}
