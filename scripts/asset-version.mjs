// ============================================================
// YEREL VARLIK SÜRÜMLEME — dosya başına İÇERİK HASH'i
// ============================================================
// Derleme bitince (astro:build:done, minify'dan SONRA) dist içindeki her yerel JS/CSS/font/ikon referansına
// `?v=<hedef dosyanın içerik hash'i>` (sha256, ilk 10 hex) yazılır. Değişmeyen dosyanın adresi deploy'lar arasında
// AYNI kalır: tarayıcı (1 yıl immutable) ve service worker önbelleği korunur, yalnızca değişen dosyalar yeniden iner.
// (Eskiden her deploy tek bir build ID yazıyordu: tek satırlık değişiklik bile herkese ~tüm JS/CSS'i yeniden indirtiyordu.)
//
// Kaynak dosyalarda elle sürüm numarası YAZILMAZ:
//   - .astro / .html:  <script src="/x.js">, <link href="/x.css">  →  ?v=<hash> eklenir (elle yazılmış ?v=... ezilir)
//   - ES modüller:     import ... from './x.js', import './x.js', import('./x.js')  →  ?v=<hash>
//   - Kodla kurulan adresler (fetch, script.src, dinamik import): kaynakta `?v=__WW_BUILD_ID__` yazılır.
//       '/tam/adres.js?v=__WW_BUILD_ID__'                → o dosyanın içerik hash'i
//       '/fonts/pdf/A-' + w + '.ttf?v=__WW_BUILD_ID__'   → '/fonts/pdf/A-*.ttf' ile eşleşen dosyaların ortak hash'i
//       önek bir değişkense (P + lang + '.js?v=...'): kaynakta `?v=__WW_GLOB(/i18n/locales/*.js)__` yazın
//     Çözülemeyen jeton build ID'ye düşer (güvenli ama her deploy'da değişir; derleme uyarı yazar).
//   - CSS:             url(/fonts/...), url(/icons/...), @import "/x.css"  →  ?v=<hash>
//   - Görseller:       HTML/JS/CSS/manifest içindeki her "/images/..." adresine ?v=<içerik hash'i> (önceden de böyleydi).
//                      Tam adresle yazılanlar (https://wawejournal.com/images/... — og:image, JSON-LD) damgalanmaz.
//
// Bağımlılık zinciri (Merkle): bir dosyanın hash'i DAMGALANMIŞ son içeriğinden hesaplanır. a.js './b.js'i import
// ediyorsa ve b.js değişirse, a.js'teki 'b.js?v=' de değişir → a.js'in hash'i de değişir. Bu yüzden dosyalar bağımlılık
// sırasıyla (Tarjan SCC, ters topolojik) işlenir; birbirini import eden döngülerdeki dosyalar ortak tek hash alır.
// Hedef dosya dist'te yoksa build ID yazılır ve uyarı verilir.
//
// Build ID yalnızca şunlarda kalır: SpaRouter'ın <meta name="ww-build"> etiketi (vite define: __WW_BUILD_ID__;
// açık sekmede deploy sonrası tam yükleme) ve sw.js (sayfa önbelleğinin adı). _headers'ta bu dosyalar 1 yıl "immutable".
//
// Sonra dist taranır; damgasız kalan yerel JS/CSS referansı, hash'i hedefle uyuşmayan sürüm, sürümsüz dinamik adres ya da
// değişmemiş jeton bulunursa derleme HATA verir (immutable önbellekte bayat dosya kalmasın).
// ============================================================

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOKEN = '__WW_BUILD_ID__';
// Önek bir değişken olduğunda (ör. i18n.js: I18N_PATH + lang + '.js?v=...') hangi dosyaların hash'inin kullanılacağı
const GLOB_TOKEN = /__WW_GLOB\(([^)\s"'`]+)\)__/g;

// Service worker'ın kendi adresi sabit kalmalı (kayıt adresi değişirse tarayıcı yeni SW sanar)
const NEVER_STAMP = new Set(['/sw.js']);

function isExternal(ref) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref);
}

// ?a=1&v=old → ?a=1&v=<ver>   (sorgu yoksa ?v=<ver>)
function withVersion(query, ver) {
  const params = new URLSearchParams(query ? query.slice(1) : '');
  params.set('v', ver);
  return '?' + params.toString();
}

export function contentHash(data) {
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 10);
}

/**
 * Sürüm çözücü. Dışarıdan iki biçimde verilebilir:
 *   - dizgi: her referansa aynı sürüm (eski tek-ID davranışı; testler ve basit kullanım)
 *   - { ver(ref), glob(pattern), fallback }: ref → hedefin sürümü; glob('/a/*.js') → eşleşenlerin ortak sürümü
 */
function ctxOf(v) {
  if (v && typeof v === 'object') return v;
  const id = String(v);
  return { ver: () => id, glob: () => id, fallback: id };
}

// Kodla kurulan adresler: jeton → sürüm. Sıra önemli: önce tam adres, sonra önek+değişken+sonek, sonra açık glob, kalan → fallback
// '/x/a.js?v=TOKEN'  (tırnak + yerel yol + ?v=TOKEN + aynı tırnak)
const LIT_TOKEN = new RegExp('(["\'`])((?:\\.{1,2}\\/|\\/(?!\\/))[^"\'`\\s?#${}]+\\.[A-Za-z0-9]+)\\?v=' + TOKEN + '(?=\\1)', 'g');
// '/fonts/pdf/A-' + w + '.ttf?v=TOKEN'   (minify sonrası: "/fonts/pdf/A-"+t+".ttf?v=TOKEN")
const CONCAT_TOKEN = new RegExp(
  '(["\'`])(\\/(?!\\/)[^"\'`\\s?#]*)\\1(\\s*\\+\\s*[A-Za-z_$][\\w$.]*\\s*\\+\\s*)(["\'`])([^"\'`\\s?#/]*\\.[A-Za-z0-9]+)\\?v=' + TOKEN + '(?=\\4)',
  'g'
);
// `/fonts/pdf/A-${w}.ttf?v=TOKEN`
const TPL_TOKEN = new RegExp('`(\\/(?!\\/)[^`$\\s?#]*)\\$\\{([^}`]+)\\}([^`$\\s?#/]*\\.[A-Za-z0-9]+)\\?v=' + TOKEN + '`', 'g');

function replaceTokens(text, ctx) {
  const rest = text
    .replace(LIT_TOKEN, (m, q, ref) => q + ref + '?v=' + ctx.ver(ref))
    .replace(CONCAT_TOKEN, (m, q, pre, plus, q2, suf) => q + pre + q + plus + q2 + suf + '?v=' + ctx.glob(pre + '*' + suf))
    .replace(TPL_TOKEN, (m, pre, expr, suf) => '`' + pre + '${' + expr + '}' + suf + '?v=' + ctx.glob(pre + '*' + suf) + '`')
    .replace(GLOB_TOKEN, (m, pattern) => ctx.glob(pattern));
  // Çözülemeyen jeton: build ID (ctx.fallback bir getter olabilir: kullanıldığını kaydeder)
  return rest.includes(TOKEN) ? rest.split(TOKEN).join(ctx.fallback) : rest;
}

// HTML: src/href değeri yerel bir .js/.mjs/.css ise sürümle. /_astro/ zaten içerik hash'li.
const HTML_REF = /(\s(?:src|href)\s*=\s*)(["'])([^"'\s?#]+\.(?:m?js|css))(\?[^"'#]*)?(#[^"']*)?\2/gi;

function stampableRef(ref) {
  return !isExternal(ref) && !ref.startsWith('/_astro/') && !NEVER_STAMP.has(ref);
}

// JS: statik/dinamik import belirteçleri (yalnızca yerel: ./ ../ /)
const JS_IMPORT = /(\bimport\s*\(\s*|\bimport\s*|\bfrom\s*)(["'])((?:\.{1,2}\/|\/(?!\/))[^"'\s?#]+\.m?js)(\?[^"'#]*)?\2/g;

function stampImports(code, ctx) {
  return code.replace(JS_IMPORT, (m, pre, q, ref, query) => (NEVER_STAMP.has(ref) ? m : pre + q + ref + withVersion(query, ctx.ver(ref)) + q));
}

export function stampJs(code, v) {
  const ctx = ctxOf(v);
  return stampImports(replaceTokens(code, ctx), ctx);
}

// HTML: attribute referansları + satır içi module script'lerdeki import'lar + kodla kurulan adresler
export function stampHtml(html, v) {
  const ctx = ctxOf(v);
  const refs = replaceTokens(html, ctx).replace(HTML_REF, (m, pre, q, ref, query, hash) =>
    stampableRef(ref) ? pre + q + ref + withVersion(query, ctx.ver(ref)) + (hash || '') + q : m
  );
  return stampImports(refs, ctx);
}

// CSS: kalıcı önbelleklenen klasörlerdeki url()'ler ve yerel @import
const CSS_URL = /url\(\s*(["']?)((?:\/(?:fonts|icons)\/|[^"')\s]*\.(?:woff2?|ttf|otf)(?=[?#"')\s]))[^"')\s?#]*)(\?[^"')#\s]*)?(#[^"')\s]*)?\1\s*\)/gi;
const CSS_IMPORT = /(@import\s+)(["'])([^"'\s?#]+\.css)(\?[^"'#]*)?\2/gi;

export function stampCss(css, v) {
  const ctx = ctxOf(v);
  return replaceTokens(css, ctx)
    .replace(CSS_URL, (m, q, ref, query, hash) =>
      isExternal(ref) || ref.startsWith('data:') ? m : 'url(' + q + ref + withVersion(query, ctx.ver(ref)) + (hash || '') + q + ')'
    )
    .replace(CSS_IMPORT, (m, pre, q, ref, query) => (isExternal(ref) ? m : pre + q + ref + withVersion(query, ctx.ver(ref)) + q));
}

// Görseller: içerik hash'i. Önünde tırnak/boşluk/parantez/virgül olan kök-göreli "/images/..." adresleri
// (HTML öznitelikleri, srcset, CSS url(), JS dizgileri). Tam adresler (…com/images/…) eşleşmez.
const IMG_REF = /(^|[\s"'(`,])(\/images\/[A-Za-z0-9_\-./]+\.(?:webp|png|jpe?g|gif|svg|avif|ico))(\?[^"'`)\s,]*)?(?=[\s"'`),]|$)/g;

/** hashOf(ref): dist'teki dosyanın içerik hash'i; dosya yoksa null (o adres olduğu gibi bırakılır ve hata sayılır). */
export function stampImages(text, hashOf) {
  return text.replace(IMG_REF, (m, pre, ref, query) => {
    const hash = hashOf(ref);
    return hash ? pre + ref + withVersion(query, hash) : m;
  });
}

export function findUnversionedImages(text, hashOf) {
  const out = [];
  for (const m of text.matchAll(IMG_REF)) {
    const hash = hashOf(m[2]);
    if (!hash) out.push('olmayan görsel ' + m[2]);
    else if (!versionOk(m[3], hash)) out.push('sürümsüz görsel ' + m[2] + (m[3] || ''));
  }
  return out;
}

export function imageHasher(distDir) {
  const cache = new Map();
  return (ref) => {
    if (!cache.has(ref)) {
      const file = path.join(distDir, ref);
      cache.set(ref, fs.existsSync(file) && fs.statSync(file).isFile() ? contentHash(fs.readFileSync(file)) : null);
    }
    return cache.get(ref);
  };
}

// ── Doğrulama ────────────────────────────────────────────────
// Damgalanmış bir dosyada hâlâ sürümsüz (ya da yanlış sürümlü) kalan yerel varlık referanslarını döndürür.
const ASSET_EXT = '(?:m?js|css|json|ttf|otf|woff2?)';
// '/interface/x.js'  gibi tırnakla biten (sorgusuz) yerel adres
const BARE_PATH = new RegExp('["\'`]((?:\\.{1,2})?/(?!/)[A-Za-z0-9_\\-./]+\\.' + ASSET_EXT + ')["\'`]', 'g');
// ... + '.ttf'  gibi kodla kurulan, sonu sürümsüz biten adres
const BARE_SUFFIX = new RegExp('\\+\\s*["\'`](\\.' + ASSET_EXT + ')["\'`]', 'g');

function versionOk(query, expected) {
  return !!query && new URLSearchParams(query.slice(1)).get('v') === expected;
}

export function findUnversioned(text, kind, v) {
  const ctx = ctxOf(v);
  const out = [];
  if (text.includes(TOKEN)) out.push(TOKEN + ' değiştirilmemiş');
  if (/__WW_GLOB\(/.test(text)) out.push('__WW_GLOB(...)__ değiştirilmemiş');
  if (kind === 'html') {
    for (const m of text.matchAll(HTML_REF)) {
      if (stampableRef(m[3]) && !versionOk(m[4], ctx.ver(m[3]))) out.push(m[3] + (m[4] || ''));
    }
  }
  if (kind === 'js' || kind === 'html') {
    for (const m of text.matchAll(JS_IMPORT)) {
      if (!NEVER_STAMP.has(m[3]) && !versionOk(m[4], ctx.ver(m[3]))) out.push('import ' + m[3] + (m[4] || ''));
    }
    for (const m of text.matchAll(BARE_PATH)) {
      if (stampableRef(m[1])) out.push('sürümsüz adres ' + m[1]);
    }
    for (const m of text.matchAll(BARE_SUFFIX)) out.push("sürümsüz dinamik adres ...+'" + m[1] + "'");
  }
  if (kind === 'css') {
    for (const m of text.matchAll(CSS_URL)) {
      if (!isExternal(m[2]) && !m[2].startsWith('data:') && !versionOk(m[3], ctx.ver(m[2]))) out.push('url(' + m[2] + (m[3] || '') + ')');
    }
  }
  return out;
}

// ── dist işleme ──────────────────────────────────────────────
function walk(dir, list = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, list);
    else list.push(full);
  }
  return list;
}

function kindOf(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.html') return 'html';
  if (ext === '.js' || ext === '.mjs') return 'js';
  if (ext === '.css') return 'css';
  if (ext === '.webmanifest') return 'manifest';
  return null;
}

/** Referansı (kök-göreli '/a/b.js', göreli './b.js' '../c.js' 'd.js') dosyanın konumuna göre dist yoluna çevirir. */
export function resolveRef(ref, fromRel) {
  const clean = ref.split(/[?#]/)[0];
  if (clean.startsWith('/')) return path.posix.normalize(clean);
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromRel || '/'), clean));
}

// '/a/b-*.ttf' → RegExp ('*' bir yol parçası içinde herhangi bir dizi)
function globRe(pattern) {
  return new RegExp('^' + pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');
}

// Bir metin dosyasının (JS/CSS) sürümlenecek bağımlılıkları: çözümlenmiş dist yolları (glob'lar açılmış)
function depsOf(text, kind, rel, relSet) {
  const refs = new Set();
  const globs = new Set();
  const capture = {
    ver: (ref) => { refs.add(resolveRef(ref, rel)); return 'x'; },
    glob: (pattern) => { globs.add(pattern); return 'x'; },
    fallback: 'x',
  };
  if (kind === 'js') stampJs(text, capture);
  else if (kind === 'css') stampCss(text, capture);
  else if (kind === 'html') stampHtml(text, capture);
  const out = new Set();
  for (const r of refs) if (relSet.has(r)) out.add(r);
  for (const g of globs) {
    const re = globRe(g);
    for (const r of relSet) if (re.test(r)) out.add(r);
  }
  return out;
}

/**
 * dist'teki tüm HTML/JS/CSS dosyalarını içerik hash'leriyle damgalar ve doğrular.
 * id: build ID (yalnızca rakam). Çözülemeyen referanslar ve kalan jetonlar buna düşer.
 * isCurrent(rel): dosya bu derlemenin çıktısı mı? Değilse (yerelde dist'te eski derlemeden kalmış dosya;
 * Cloudflare her derlemeyi temiz checkout'ta yaptığı için canlıda olmaz) sorunları hata değil `stale` olarak döner.
 * @returns {{ files: number, changed: number, problems: string[], stale: string[], warnings: string[], versions: Map<string,string> }}
 */
export function versionDist(distDir, id, isCurrent = () => true) {
  if (!/^[0-9]+$/.test(String(id))) throw new Error('[asset-version] build ID yalnızca rakam olmalı: ' + id);
  id = String(id);
  const problems = [];
  const stale = [];
  const warnings = [];
  const hashOf = imageHasher(distDir);

  // 1) Dosya listesi ve ham içerikler
  const all = walk(distDir).map((full) => ({ full, rel: '/' + path.relative(distDir, full).split(path.sep).join('/') }));
  const relSet = new Set(all.map((f) => f.rel));
  const byRel = new Map(all.map((f) => [f.rel, f]));
  const isAstro = (rel) => rel.startsWith('/_astro/');
  const src = new Map(); // metin dosyaları: rel → ham içerik
  for (const f of all) {
    f.kind = kindOf(f.full);
    if (f.kind) src.set(f.rel, fs.readFileSync(f.full, 'utf8'));
  }
  // Bağımlılık grafiğindeki düğümler: sürümlenen yerel JS/CSS (/_astro/ hariç; onlar zaten içerik hash'li)
  const isNode = (rel) => {
    const f = byRel.get(rel);
    return !!f && (f.kind === 'js' || f.kind === 'css') && !isAstro(rel) && !NEVER_STAMP.has(rel);
  };

  const versions = new Map(); // rel → sürüm (düğümler: damgalı son içeriğin hash'i; yapraklar: ham bayt hash'i)
  const leafCache = new Map();
  const leafVersion = (rel) => {
    if (!leafCache.has(rel)) leafCache.set(rel, contentHash(fs.readFileSync(byRel.get(rel).full)));
    return leafCache.get(rel);
  };
  const missing = new Set();
  const fallbacks = new Set();
  const globCache = new Map();

  // rel'deki dosya için çözücü. pending: henüz hesaplanmamış (aynı döngüdeki) düğümler için yer tutucu
  function ctxFor(rel, pending = null) {
    const verOfTarget = (target) => {
      if (pending && pending.has(target)) return pending.get(target);
      if (versions.has(target)) return versions.get(target);
      if (relSet.has(target)) {
        if (isNode(target)) throw new Error('[asset-version] sıralama hatası: ' + target + ' (' + rel + ')');
        return leafVersion(target);
      }
      missing.add(rel + ' → ' + target);
      return id;
    };
    return {
      ver: (ref) => verOfTarget(resolveRef(ref, rel)),
      glob: (pattern) => {
        const re = globRe(pattern);
        const matches = [...relSet].filter((r) => re.test(r)).sort();
        if (!matches.length) {
          missing.add(rel + ' → ' + pattern);
          return id;
        }
        const key = pattern + '|' + (pending ? 'p' : '');
        if (!pending && globCache.has(key)) return globCache.get(key);
        const v = contentHash(matches.map((m) => m + '=' + verOfTarget(m)).join('\n'));
        if (!pending) globCache.set(key, v);
        return v;
      },
      get fallback() {
        // sw.js'teki BUILD_ID bilerek build ID'dir; başka yerde kalan jeton o dosyanın her deploy'da değişmesi demek
        if (!NEVER_STAMP.has(rel) && !isAstro(rel)) fallbacks.add(rel);
        return id;
      },
    };
  }

  // Tek dosyanın damgalanmış son hali (görseller dahil)
  function finalize(rel, ctx) {
    const kind = byRel.get(rel).kind;
    const text = src.get(rel);
    let out;
    if (isAstro(rel) || kind === 'manifest') out = text.split(TOKEN).join(id);
    else if (kind === 'html') out = stampHtml(text, ctx);
    else if (kind === 'js') out = stampJs(text, ctx);
    else out = stampCss(text, ctx);
    return stampImages(out, hashOf);
  }

  // 2) Grafik + Tarjan SCC (bağımlılıklar önce)
  const nodes = [...src.keys()].filter(isNode).sort();
  const deps = new Map(nodes.map((rel) => [rel, [...depsOf(src.get(rel), byRel.get(rel).kind, rel, relSet)].filter(isNode).sort()]));
  const finals = new Map();
  let index = 0;
  const idx = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  function processScc(scc) {
    if (scc.length === 1 && !deps.get(scc[0]).includes(scc[0])) {
      const rel = scc[0];
      const out = finalize(rel, ctxFor(rel));
      finals.set(rel, out);
      versions.set(rel, contentHash(out));
      return;
    }
    // Döngü: üyeler birbirini yer tutucuyla görür → ortak hash → gerçek sürümle yeniden damgala
    scc.sort();
    const placeholder = new Map(scc.map((r) => [r, 'scc']));
    const shared = contentHash(scc.map((r) => r + '\n' + finalize(r, ctxFor(r, placeholder))).join('\n\0'));
    const real = new Map(scc.map((r) => [r, shared]));
    for (const r of scc) {
      finals.set(r, finalize(r, ctxFor(r, real)));
      versions.set(r, shared);
    }
  }
  // Özyinelemesiz Tarjan (derin import zincirlerinde yığın taşmasın)
  for (const start of nodes) {
    if (idx.has(start)) continue;
    const work = [[start, 0]];
    idx.set(start, index); low.set(start, index); index++;
    stack.push(start); onStack.add(start);
    while (work.length) {
      const frame = work[work.length - 1];
      const [v, i] = frame;
      const ds = deps.get(v);
      if (i < ds.length) {
        frame[1]++;
        const w = ds[i];
        if (!idx.has(w)) {
          idx.set(w, index); low.set(w, index); index++;
          stack.push(w); onStack.add(w);
          work.push([w, 0]);
        } else if (onStack.has(w)) {
          low.set(v, Math.min(low.get(v), idx.get(w)));
        }
      } else {
        work.pop();
        if (work.length) {
          const parent = work[work.length - 1][0];
          low.set(parent, Math.min(low.get(parent), low.get(v)));
        }
        if (low.get(v) === idx.get(v)) {
          const scc = [];
          let w;
          do { w = stack.pop(); onStack.delete(w); scc.push(w); } while (w !== v);
          processScc(scc);
        }
      }
    }
  }

  // 3) Geri kalan metin dosyaları (HTML, /_astro/, manifest) + yazma + doğrulama
  let files = 0;
  let changed = 0;
  for (const [rel, text] of src) {
    const f = byRel.get(rel);
    const ctx = ctxFor(rel);
    const out = finals.has(rel) ? finals.get(rel) : finalize(rel, ctx);
    if (out !== text) {
      fs.writeFileSync(f.full, out, 'utf8');
      changed++;
    }
    files++;
    const found =
      isAstro(rel) || f.kind === 'manifest' ? (out.includes(TOKEN) ? [TOKEN + ' değiştirilmemiş'] : []) : findUnversioned(out, f.kind, ctx);
    found.push(...findUnversionedImages(out, hashOf));
    if (f.kind === 'html') {
      const meta = out.match(/<meta name="ww-build" content="([^"]*)"/);
      if (meta && meta[1] !== id) found.push('ww-build meta (' + meta[1] + ') build ID ile aynı değil (' + id + ')');
    }
    const target = isAstro(rel) || isCurrent(rel) ? problems : stale;
    for (const p of found) target.push(rel + ': ' + p);
  }
  for (const m of missing) warnings.push('dist\'te olmayan hedef (build ID yazıldı): ' + m);
  for (const f of fallbacks) warnings.push('çözülemeyen ' + TOKEN + ' (build ID yazıldı, dosya her deploy\'da değişir): ' + f);
  return { files, changed, problems, stale, warnings, versions };
}

export function assetVersionIntegration(id) {
  let publicDir = path.resolve('public');
  let pagesDir = path.resolve('src/pages');
  return {
    name: 'asset-version',
    hooks: {
      'astro:config:done': ({ config }) => {
        publicDir = fileURLToPath(config.publicDir);
        pagesDir = fileURLToPath(new URL('pages/', config.srcDir));
      },
      'astro:build:done': async ({ dir }) => {
        const distDir = typeof dir === 'string' ? dir : fileURLToPath(dir);
        // Bu derlemenin çıktısı: public/ kopyaları ve src/pages'ten üretilen sayfalar (format: 'file' → ad.html)
        const isCurrent = (rel) => {
          if (fs.existsSync(path.join(publicDir, rel))) return true;
          const page = rel.replace(/\.html$/, '');
          return rel.endsWith('.html') && ['.astro', '.md', '.mdx', '.html'].some((ext) => fs.existsSync(path.join(pagesDir, page + ext)));
        };
        const { files, changed, problems, stale, warnings, versions } = versionDist(distDir, id, isCurrent);
        console.log(`🏷️  [asset-version] build ${id}: ${files} dosya tarandı, ${changed} dosyada sürüm yazıldı, ${versions.size} dosyaya içerik hash'i verildi.`);
        if (warnings.length) console.warn('⚠️  [asset-version] ' + warnings.join('\n  '));
        if (stale.length) {
          console.warn(
            "⚠️  [asset-version] dist'te bu derlemeye ait olmayan eski dosyalar var (yerelden deploy edecekseniz önce dist'i silip yeniden derleyin):\n  " +
              stale.join('\n  ')
          );
        }
        if (problems.length) {
          throw new Error(
            '[asset-version] Sürümsüz yerel varlık referansı bulundu (immutable önbellekte bayat kalır):\n  ' +
              problems.join('\n  ') +
              '\nÇözüm: HTML/import referansları otomatik damgalanır; kodla kurulan adreslere `?v=' + TOKEN + '` ekleyin.'
          );
        }
      },
    },
  };
}
