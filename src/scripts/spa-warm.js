// ============================================================
// SPA ÖN ISITMA: hangi sayfa script'leri önceden çekilir — src/scripts/spa-warm.js
// ============================================================
// SpaRouter.astro bunu kullanır (Vite derlemede router script'ine paketler). Testler: tests/page-scripts.test.js
//
// Router, navbar sayfalarının HTML'ini ve CSS'ini boşta, diğer SPA sayfalarınınkini link üzerine gelince önceden
// çeker. Sayfaların büyük satır içi script'leri ayrı dosyalara taşındı (ör. /interface/journals/js/journals-page.js):
// önceden çekilmezlerse SPA ile o sayfaya ilk girişte script tıklama anında iner. Burada yalnızca gerçekten ihtiyaç
// olacak ve kalıcı önbelleğe düşecek dosyalar seçilir (temkinli):
//   - yalnızca data-page-script'li olanlar (sayfaya özel; ortak kütüphaneler zaten yüklü, backtest'in bt-*.js
//     dosyaları gibi büyük ama nadir kullanılanlar çekilmez)
//   - yalnızca aynı origin ve ?v=<sürüm> taşıyanlar (immutable + SW sürümlü önbelleği; geliştirmede sürüm yok → çekilmez)
//   - bu dokümanda zaten yüklü ya da daha önce çekilmiş adresler tekrar çekilmez
//   - veri tasarrufu (Save-Data) açıksa ya da bağlantı 2g ise hiç çekilmez (tıklayınca yine iner, yalnızca gecikir)
//   - BOŞTA (navbar sayfaları, kullanıcı henüz niyet göstermedi) yalnızca satır içinden taşınan *-page.js dosyaları:
//     bu kod eskiden zaten önceden çekilen HTML'in içindeydi, yani ek bayt yok. Diğer sayfa script'leri (trades.js,
//     backtest.js...) yalnızca link ÜZERİNE GELİNCE çekilir (ilk ziyarette boşta ~100 KB gz fazladan inmesin).
// ============================================================

/** Satır içi sayfa bloğundan taşınan dosya mı? (ör. /interface/journals/js/journals-page.js) */
export function isPageBlockScript(src) {
  return /-page\.js(?:[?#]|$)/.test(String(src || ''));
}

/** Veri tasarrufu modu ya da çok yavaş bağlantı: büyük dosyaları önceden çekme. */
export function lowDataMode(nav) {
  const c = nav && nav.connection;
  if (!c) return false;
  return c.saveData === true || c.effectiveType === '2g' || c.effectiveType === 'slow-2g';
}

/**
 * Önceden çekilecek sayfa script adresleri (mutlak, tekrarsız).
 * @param {Iterable<string|null>} srcs   yeni sayfadaki <script src data-page-script> değerleri (getAttribute('src'))
 * @param {{ base: string, loaded?: Set<string>, warmed?: Set<string>, lowData?: boolean, onlyPageBlocks?: boolean }} opts
 *   base: şu anki sayfa adresi (location.href); loaded: bu dokümanda zaten olan script'lerin mutlak adresleri;
 *   warmed: daha önce çekilenler (çağıran ekler); onlyPageBlocks: yalnızca *-page.js (boşta ısıtma)
 * @returns {string[]}
 */
export function pageScriptsToWarm(srcs, { base, loaded = new Set(), warmed = new Set(), lowData = false, onlyPageBlocks = false }) {
  if (lowData) return [];
  let origin;
  try {
    origin = new URL(base).origin;
  } catch {
    return [];
  }
  const out = [];
  for (const src of srcs) {
    if (!src) continue;
    let url;
    try {
      url = new URL(src, base);
    } catch {
      continue;
    }
    if (url.origin !== origin || !url.searchParams.get('v')) continue;
    if (onlyPageBlocks && !isPageBlockScript(url.pathname)) continue;
    const href = url.href;
    if (loaded.has(href) || warmed.has(href) || out.includes(href)) continue;
    out.push(href);
  }
  return out;
}
