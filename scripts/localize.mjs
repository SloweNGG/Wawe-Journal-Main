// ============================================================
// YERELLEŞTİRİLMİŞ STATİK SAYFALAR (/tr/, /de/) — arama motorlarının Türkçe/Almanca içeriği görebilmesi için
// ============================================================
// Sorun: landing / about / contact metinleri İngilizce derlenir, TR/DE yalnızca tarayıcıda index-i18n.js ile
// değişiyordu → Google Türkçe sayfa görmüyordu. Çözüm: derleme bitince (asset-version'dan SONRA, sitemap'ten ÖNCE)
// dist'teki İngilizce HTML'den her dil için bir kopya üretilir:
//   - [data-i18n] öğelerinin içeriği o dilin metniyle (metin olarak), [data-i18n-html] öğeleri HTML olarak değişir.
//     Metinlerin TEK kaynağı public/index-i18n.js (vm'de çalıştırılır); burada ayrıca çeviri tutulmaz.
//   - <html lang> + data-locale-page, <title>, description, og/twitter başlıkları, canonical, og:url
//   - hreflang: her sürümde (EN dahil) en / tr / de / x-default bağlantıları <head>'in en başına eklenir
//     (BaseHead'deki dil ön yükleme script'i bunları okuyup kayıtlı dile yönlendirir, bu yüzden en başta olmalı).
//   - Yerelleştirilen sayfalar arası iç linkler o dile çevrilir (/about → /tr/about); diğer linkler aynen kalır.
// Yeni sayfa eklemek: PAGES'e ekle ve META'ya başlık/açıklama yaz. Sayfanın görünen metni data-i18n ile işaretli
// olmalı; işaretsiz İngilizce metin TR sayfada İngilizce kalır (derleme bunu sayıp uyarır).
//
// İKİNCİ TÜR: Astro'nun doğrudan dil klasörüne ürettiği sayfalar (ör. blog: src/pages/[lang]/blog → dist/tr/blog/...).
// İçerikleri, lang/data-locale-page/hreflang/canonical'ları zaten doğru; burada yalnızca ortak çerçevenin (menü,
// footer) data-i18n metinleri ve yerelleştirilmiş sayfalara giden linkler o dile çevrilir.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SITE = 'https://wawejournal.com';
export const LANGS = ['tr', 'de'];
// dist dosyası → temiz yol
export const PAGES = [
  { file: 'index.html', path: '/' },
  { file: 'about.html', path: '/about' },
  { file: 'contact.html', path: '/contact' },
];

const META = {
  '/': {
    tr: {
      title: 'Wawe Journal – Ücretsiz İşlem Günlüğü ve Backtest Uygulaması',
      description: "Forex, kripto ve prop firma trader'ları için ücretsiz işlem günlüğü. Her işlemi kaydet, AI koça neyin işe yaradığını sor, piyasayı mum mum yeniden oynat.",
    },
    de: {
      title: 'Wawe Journal – Kostenloses Trading-Journal & Backtesting-App',
      description: 'Kostenloses Trading-Journal für Forex-, Krypto- und Prop-Firm-Trader: Trades erfassen, den KI-Coach fragen und den Markt Kerze für Kerze abspielen.',
    },
  },
  '/about': {
    tr: {
      title: "Hakkımızda – Wawe Journal, Trader'lar için İşlem Günlüğü",
      description: 'Wawe Journal, bağımsız bir geliştiricinin kurduğu işlem günlüğü. İşlemlerini kaydet, performansını analiz et ve piyasayı mum mum yeniden oynat.',
    },
    de: {
      title: 'Über uns – Wawe Journal, das Trading-Journal für Trader',
      description: 'Wawe Journal ist ein unabhängiges Trading-Journal eines Solo-Entwicklers. Trades erfassen, Performance analysieren und den Markt Kerze für Kerze abspielen.',
    },
  },
  '/contact': {
    tr: {
      title: 'İletişim – Wawe Journal Destek ve Geri Bildirim',
      description: 'Hesabın, içe aktarma, cTrader senkronu veya ödeme konusunda yardım için support@wawejournal.com adresine yaz. Hafta içi 24 saat içinde yanıtlıyoruz.',
    },
    de: {
      title: 'Kontakt – Wawe Journal Support und Feedback',
      description: 'Hilfe zu Konto, Import, cTrader-Sync oder Abrechnung: schreib an support@wawejournal.com. Wir antworten werktags innerhalb von 24 Stunden.',
    },
  },
};

/** index-i18n.js'i vm'de çalıştırıp o dilin t() fonksiyonunu döndürür. */
export function loadTranslator(i18nSource, lang) {
  const store = { ww_language: lang };
  const sandbox = {
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } },
    document: {
      readyState: 'complete',
      documentElement: { lang: 'en', getAttribute: () => null, setAttribute() {} },
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener() {},
    },
    location: { pathname: '/', replace() {}, assign() {} },
    console,
  };
  sandbox.window = sandbox;
  vm.runInNewContext(i18nSource, sandbox, { filename: 'index-i18n.js' });
  const i18n = sandbox.window.i18n;
  if (!i18n || i18n.getCurrentLanguage() !== lang) throw new Error(`[localize] index-i18n.js ${lang} dilinde yüklenemedi`);
  return i18n.t;
}

const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => escText(s).replace(/"/g, '&quot;');

/**
 * [data-i18n] / [data-i18n-html] taşıyan her öğenin İÇERİĞİNİ t(key) ile değiştirir (öğenin kendisi ve öznitelikleri kalır).
 * İç içe aynı adlı etiketler sayılarak eşleşen kapanış bulunur. Dönüş: { html, replaced, missing[] }
 */
export function translateMarkup(html, t, enT) {
  const OPEN = /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*?)\sdata-i18n(-html)?="([^"]+)"([^>]*)>/g;
  let out = '';
  let pos = 0;
  let replaced = 0;
  const missing = [];
  OPEN.lastIndex = 0;
  let m;
  while ((m = OPEN.exec(html))) {
    const [openTag, tag, , isHtml, key] = m;
    const contentStart = m.index + openTag.length;
    // eşleşen kapanış etiketi
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
    re.lastIndex = contentStart;
    let depth = 1;
    let close = null;
    let x;
    while ((x = re.exec(html))) {
      if (x[0].endsWith('/>')) continue;
      depth += x[1] ? -1 : 1;
      if (depth === 0) { close = x; break; }
    }
    if (!close) continue; // kapanışsız (bozuk) öğe: dokunma
    const v = t(key);
    if (typeof v !== 'string' || v === key) { missing.push(key); continue; }
    if (enT && enT(key) === v) missing.push(key); // çevrilmemiş (İngilizceye düşmüş) anahtar
    out += html.slice(pos, contentStart) + (isHtml ? v : escText(v));
    pos = close.index;
    OPEN.lastIndex = close.index;
    replaced++;
  }
  out += html.slice(pos);
  return { html: out, replaced, missing };
}

function setMeta(html, { lang, title, description, url }) {
  let h = html;
  h = h.replace(/<html\b([^>]*)\slang="[^"]*"/, `<html$1 lang="${lang}" data-locale-page="${lang}"`);
  if (title) {
    h = h.replace(/<title>[^<]*<\/title>/, `<title>${escText(title)}</title>`);
    h = h.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escAttr(title)}$2`);
    h = h.replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${escAttr(title)}$2`);
  }
  if (description) {
    h = h.replace(/(<meta name="description" content=")[^"]*(")/, `$1${escAttr(description)}$2`);
    h = h.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escAttr(description)}$2`);
    h = h.replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${escAttr(description)}$2`);
  }
  if (url) {
    h = h.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`);
    h = h.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`);
  }
  if (lang !== 'en') {
    const locale = { tr: 'tr_TR', de: 'de_DE' }[lang];
    h = h.replace(/(<meta property="og:site_name"[^>]*>)/, `$1<meta property="og:locale" content="${locale}" />`);
  }
  return h;
}

export const urlFor = (lang, p) => SITE + (lang === 'en' ? p : `/${lang}${p === '/' ? '/' : p}`);

function hreflangLinks(p) {
  return (
    ['en', ...LANGS].map((l) => `<link rel="alternate" hreflang="${l}" href="${urlFor(l, p)}" />`).join('') +
    `<link rel="alternate" hreflang="x-default" href="${urlFor('en', p)}" />`
  );
}

/** dist/<lang>/ altındaki gerçek sayfaların İngilizce karşılık yolları: tr/blog.html → /blog, tr/index.html → / */
function localizedPaths(distDir, lang) {
  const out = new Set(PAGES.map((pg) => pg.path));
  const root = path.join(distDir, lang);
  const walk = (dir, rel = '') => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (e.name.endsWith('.html')) out.add(('/' + r.replace(/\.html$/, '')).replace(/(^|\/)index$/, '$1') || '/');
    }
  };
  walk(root);
  return out;
}

/** Astro'nun dil klasörüne kendisi ürettiği sayfalar (PAGES'in kopyaları hariç): ['tr/blog.html', 'tr/blog/x.html'] */
function nativePages(distDir, lang) {
  const copies = new Set(PAGES.map((pg) => (pg.path === '/' ? `${lang}/index.html` : `${lang}${pg.path}.html`)));
  const list = [];
  const walk = (dir, rel) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (e.name.endsWith('.html') && !copies.has(r)) list.push(r);
    }
  };
  walk(path.join(distDir, lang), lang);
  return list;
}

/** Bu dilde karşılığı olan sayfalara giden iç linkleri dile çevirir: href="/about" → href="/tr/about" */
function localizeLinks(html, lang, targets = new Set(PAGES.map((pg) => pg.path))) {
  return html.replace(/href="(\/[^"#?]*)((?:[#?][^"]*)?)"/g, (all, p, rest) => {
    const clean = p.replace(/\.html$/, '').replace(/^\/index$/, '/');
    if (!targets.has(clean)) return all;
    return `href="${clean === '/' ? `/${lang}/` : `/${lang}${clean}`}${rest}"`;
  });
}

const insertHead = (html, snippet) => html.replace(/<head>/i, `<head>${snippet}`);

export function localizeDist(distDir, i18nSource, log = console.log) {
  const enT = loadTranslator(i18nSource, 'en');
  const report = [];
  for (const lang of LANGS) {
    const t = loadTranslator(i18nSource, lang);
    // Astro'nun ürettiği dil sayfaları önce listelenir (PAGES kopyaları yazılmadan; ikinci derlemede de doğru kalsın)
    const native = nativePages(distDir, lang);
    const targets = localizedPaths(distDir, lang);
    for (const pg of PAGES) {
      const src = path.join(distDir, pg.file);
      if (!fs.existsSync(src)) throw new Error(`[localize] ${pg.file} yok`);
      const en = fs.readFileSync(src, 'utf8');
      const { html: body, replaced, missing } = translateMarkup(en, t, enT);
      const meta = (META[pg.path] || {})[lang] || {};
      let h = setMeta(body, { lang, ...meta, url: urlFor(lang, pg.path) });
      h = localizeLinks(h, lang, targets);
      h = insertHead(h, hreflangLinks(pg.path));
      const outRel = pg.path === '/' ? `${lang}/index.html` : `${lang}${pg.path}.html`;
      fs.mkdirSync(path.dirname(path.join(distDir, outRel)), { recursive: true });
      fs.writeFileSync(path.join(distDir, outRel), h);
      report.push(`${outRel} (${replaced} metin${missing.length ? `, çevirisi eksik: ${[...new Set(missing)].length}` : ''})`);
    }
    let nativeMissing = new Set();
    for (const rel of native) {
      const f = path.join(distDir, rel);
      const { html, missing } = translateMarkup(fs.readFileSync(f, 'utf8'), t, enT);
      missing.forEach((k) => nativeMissing.add(k));
      fs.writeFileSync(f, localizeLinks(html, lang, targets));
    }
    if (native.length) report.push(`${lang}/ altında Astro sayfası: ${native.length}${nativeMissing.size ? ` (çevirisi eksik: ${[...nativeMissing].join(', ')})` : ''}`);
  }
  // İngilizce sürümlere de hreflang (bir kez; tekrar derlemede çift eklenmesin)
  for (const pg of PAGES) {
    const f = path.join(distDir, pg.file);
    const en = fs.readFileSync(f, 'utf8');
    if (!en.includes('hreflang="x-default"')) fs.writeFileSync(f, insertHead(en, hreflangLinks(pg.path)));
  }
  const extra = writeLangRedirects(distDir);
  log(`🌍 [localize] ${report.join(' · ')} · _redirects +${extra}`);
}

/**
 * Güvenlik ağı: /tr/ ve /de/ altında yalnızca PAGES ve Astro'nun ürettiği dil sayfaları (blog) var. Göreli bir link ya da eski bir adres /tr/dashboard.html
 * gibi bir yere giderse 404 yerine sayfanın ana sürümüne 301. dist'teki (dil klasörleri dışındaki) her sayfa için
 * hem temiz hem .html adresi yazılır; yerelleştirilmiş sayfalar listeye girmez (onlar gerçek dosya).
 * Cloudflare Pages: _redirects statik dosyadan önce uygulanır → var olan /tr/about'a kural YAZILMAMALI.
 */
function writeLangRedirects(distDir) {
  const pages = [];
  const walk = (dir, rel = '') => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!rel && (LANGS.includes(e.name) || e.name.startsWith('_') || e.name.startsWith('.'))) continue;
        walk(path.join(dir, e.name), r);
      } else if (e.name.endsWith('.html')) {
        pages.push('/' + r.replace(/\.html$/, ''));
      }
    }
  };
  walk(distDir);
  const lines = ['', '# --- scripts/localize.mjs: /tr/ ve /de/ altında olmayan sayfalar ana sürüme (otomatik) ---'];
  for (const lang of LANGS) {
    const localized = localizedPaths(distDir, lang);
    for (const p of pages.sort()) {
      const clean = p === '/index' ? '/' : p;
      if (localized.has(clean) || p === '/404') continue;
      // Sayfanın bu dilde başka adlı bir sürümü varsa (çevrilmiş blog slug'ı) oraya: /tr/blog/how-to-x → /tr/blog/x-nasil
      const en = fs.readFileSync(path.join(distDir, `${p.slice(1)}.html`), 'utf8');
      const alt = en.match(new RegExp(`<link rel="alternate" hreflang="${lang}" href="https?://[^/"]+(/[^"]*)"`));
      if (alt && alt[1] !== `/${lang}${clean}`) {
        lines.push(`/${lang}${p}.html ${alt[1]} 301`, `/${lang}${p} ${alt[1]} 301`);
        continue;
      }
      // Hedef temiz adres: "/x.html" hedefi Cloudflare'de bir 308 daha ekliyordu (Search Console "Yönlendirmeli sayfa")
      lines.push(`/${lang}${p}.html ${clean} 301`, `/${lang}${p} ${clean} 301`);
    }
  }
  const file = path.join(distDir, '_redirects');
  const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const marker = lines[1];
  const base = prev.includes(marker) ? prev.slice(0, prev.indexOf(marker)).replace(/\n+$/, '') : prev.replace(/\n+$/, '');
  fs.writeFileSync(file, base + '\n' + lines.join('\n') + '\n');
  return lines.length - 2;
}

export function localizeIntegration() {
  let publicDir = path.resolve('public');
  return {
    name: 'ww-localize',
    hooks: {
      'astro:config:done': ({ config }) => { publicDir = fileURLToPath(config.publicDir); },
      'astro:build:done': async ({ dir }) => {
        const distDir = typeof dir === 'string' ? dir : fileURLToPath(dir);
        localizeDist(distDir, fs.readFileSync(path.join(publicDir, 'index-i18n.js'), 'utf8'));
      },
    },
  };
}
