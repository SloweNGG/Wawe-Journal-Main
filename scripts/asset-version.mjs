// ============================================================
// YEREL JS/CSS SÜRÜMLEME — tek kaynak: build ID
// ============================================================
// Derleme bitince (astro:build:done, minify'dan SONRA) dist içindeki her yerel JS/CSS
// referansına aynı `?v=<buildId>` yazılır. Kaynak dosyalarda elle sürüm numarası YAZILMAZ:
//   - .astro / .html:  <script src="/x.js">, <link href="/x.css">  →  ?v=<buildId> eklenir
//                      (elle yazılmış ?v=... varsa ezilir)
//   - ES modüller:     import ... from './x.js', import './x.js', import('./x.js')  →  ?v=<buildId>
//   - Kodla kurulan adresler (fetch, script.src, dinamik import): kaynakta `?v=__WW_BUILD_ID__`
//     yazılır, derlemede gerçek ID ile değiştirilir (geliştirmede olduğu gibi kalır; zararsız).
//   - CSS:             url(/fonts/...), url(/icons/...), @import "/x.css"  →  ?v=<buildId>
// Aynı ID, SpaRouter'ın <meta name="ww-build"> etiketine (vite define: __WW_BUILD_ID__) ve
// sw.js'e de yazılır. Böylece _headers'ta bu dosyalar 1 yıl "immutable" önbelleklenebilir:
// her deploy yeni ID = yeni adres.
//
// Sonra dist taranır; damgasız kalan yerel JS/CSS referansı, sürümsüz dinamik adres ya da
// değişmemiş __WW_BUILD_ID__ bulunursa derleme HATA verir (immutable önbellekte bayat dosya kalmasın).
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOKEN = '__WW_BUILD_ID__';

// Service worker'ın kendi adresi sabit kalmalı (kayıt adresi değişirse tarayıcı yeni SW sanar)
const NEVER_STAMP = new Set(['/sw.js']);

function isExternal(ref) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref);
}

// ?a=1&v=old → ?a=1&v=<id>   (sorgu yoksa ?v=<id>)
function withVersion(query, id) {
  const params = new URLSearchParams(query ? query.slice(1) : '');
  params.set('v', id);
  return '?' + params.toString();
}

function replaceToken(text, id) {
  return text.split(TOKEN).join(id);
}

// HTML: src/href değeri yerel bir .js/.mjs/.css ise sürümle. /_astro/ zaten içerik hash'li.
const HTML_REF = /(\s(?:src|href)\s*=\s*)(["'])([^"'\s?#]+\.(?:m?js|css))(\?[^"'#]*)?(#[^"']*)?\2/gi;

function stampableRef(ref) {
  return !isExternal(ref) && !ref.startsWith('/_astro/') && !NEVER_STAMP.has(ref);
}

// JS: statik/dinamik import belirteçleri (yalnızca yerel: ./ ../ /)
const JS_IMPORT = /(\bimport\s*\(\s*|\bimport\s*|\bfrom\s*)(["'])((?:\.{1,2}\/|\/(?!\/))[^"'\s?#]+\.m?js)(\?[^"'#]*)?\2/g;

function stampImports(code, id) {
  return code.replace(JS_IMPORT, (m, pre, q, ref, query) => (NEVER_STAMP.has(ref) ? m : pre + q + ref + withVersion(query, id) + q));
}

export function stampJs(code, id) {
  return stampImports(replaceToken(code, id), id);
}

// HTML: attribute referansları + satır içi module script'lerdeki import'lar
export function stampHtml(html, id) {
  const refs = replaceToken(html, id).replace(HTML_REF, (m, pre, q, ref, query, hash) =>
    stampableRef(ref) ? pre + q + ref + withVersion(query, id) + (hash || '') + q : m
  );
  return stampImports(refs, id);
}

// CSS: kalıcı önbelleklenen klasörlerdeki url()'ler ve yerel @import
const CSS_URL = /url\(\s*(["']?)((?:\/(?:fonts|icons)\/|[^"')\s]*\.(?:woff2?|ttf|otf)(?=[?#"')\s]))[^"')\s?#]*)(\?[^"')#\s]*)?(#[^"')\s]*)?\1\s*\)/gi;
const CSS_IMPORT = /(@import\s+)(["'])([^"'\s?#]+\.css)(\?[^"'#]*)?\2/gi;

export function stampCss(css, id) {
  return replaceToken(css, id)
    .replace(CSS_URL, (m, q, ref, query, hash) =>
      isExternal(ref) || ref.startsWith('data:') ? m : 'url(' + q + ref + withVersion(query, id) + (hash || '') + q + ')'
    )
    .replace(CSS_IMPORT, (m, pre, q, ref, query) => (isExternal(ref) ? m : pre + q + ref + withVersion(query, id) + q));
}

// ── Doğrulama ────────────────────────────────────────────────
// Damgalanmış bir dosyada hâlâ sürümsüz kalan yerel varlık referanslarını döndürür.
const ASSET_EXT = '(?:m?js|css|json|ttf|otf|woff2?)';
// '/interface/x.js'  gibi tırnakla biten (sorgusuz) yerel adres
const BARE_PATH = new RegExp('["\'`]((?:\\.{1,2})?/(?!/)[A-Za-z0-9_\\-./]+\\.' + ASSET_EXT + ')["\'`]', 'g');
// ... + '.ttf'  gibi kodla kurulan, sonu sürümsüz biten adres
const BARE_SUFFIX = new RegExp('\\+\\s*["\'`](\\.' + ASSET_EXT + ')["\'`]', 'g');

function versionOk(query, id) {
  return !!query && new URLSearchParams(query.slice(1)).get('v') === id;
}

export function findUnversioned(text, kind, id) {
  const out = [];
  if (text.includes(TOKEN)) out.push(TOKEN + ' değiştirilmemiş');
  if (kind === 'html') {
    for (const m of text.matchAll(HTML_REF)) {
      if (stampableRef(m[3]) && !versionOk(m[4], id)) out.push(m[3] + (m[4] || ''));
    }
  }
  if (kind === 'js' || kind === 'html') {
    for (const m of text.matchAll(JS_IMPORT)) {
      if (!NEVER_STAMP.has(m[3]) && !versionOk(m[4], id)) out.push('import ' + m[3] + (m[4] || ''));
    }
    for (const m of text.matchAll(BARE_PATH)) {
      if (stampableRef(m[1])) out.push('sürümsüz adres ' + m[1]);
    }
    for (const m of text.matchAll(BARE_SUFFIX)) out.push("sürümsüz dinamik adres ...+'" + m[1] + "'");
  }
  if (kind === 'css') {
    for (const m of text.matchAll(CSS_URL)) {
      if (!isExternal(m[2]) && !versionOk(m[3], id)) out.push('url(' + m[2] + (m[3] || '') + ')');
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
  return null;
}

/**
 * dist'teki tüm HTML/JS/CSS dosyalarını build ID ile damgalar ve doğrular.
 * isCurrent(rel): dosya bu derlemenin çıktısı mı? Değilse (yerelde dist'te eski derlemeden kalmış dosya;
 * Cloudflare her derlemeyi temiz checkout'ta yaptığı için canlıda olmaz) sorunları hata değil `stale` olarak döner.
 * @returns {{ files: number, changed: number, problems: string[], stale: string[] }}
 */
export function versionDist(distDir, id, isCurrent = () => true) {
  if (!/^[0-9]+$/.test(String(id))) throw new Error('[asset-version] build ID yalnızca rakam olmalı: ' + id);
  const problems = [];
  const stale = [];
  let files = 0;
  let changed = 0;
  for (const file of walk(distDir)) {
    const kind = kindOf(file);
    if (!kind) continue;
    const rel = '/' + path.relative(distDir, file).split(path.sep).join('/');
    // /_astro/: Astro'nun içerik hash'li çıktısı; dokunulmaz (yalnızca jeton kalmış mı bakılır)
    const isAstro = rel.startsWith('/_astro/');
    const src = fs.readFileSync(file, 'utf8');
    let out = src;
    if (isAstro) out = replaceToken(src, id);
    else if (kind === 'html') out = stampHtml(src, id);
    else if (kind === 'js') out = stampJs(src, id);
    else out = stampCss(src, id);
    if (out !== src) {
      fs.writeFileSync(file, out, 'utf8');
      changed++;
    }
    files++;
    const found = isAstro ? (out.includes(TOKEN) ? [TOKEN + ' değiştirilmemiş'] : []) : findUnversioned(out, kind, id);
    if (kind === 'html') {
      const meta = out.match(/<meta name="ww-build" content="([^"]*)"/);
      if (meta && meta[1] !== String(id)) found.push('ww-build meta (' + meta[1] + ') build ID ile aynı değil (' + id + ')');
    }
    const target = isAstro || isCurrent(rel) ? problems : stale;
    for (const p of found) target.push(rel + ': ' + p);
  }
  return { files, changed, problems, stale };
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
        const { files, changed, problems, stale } = versionDist(distDir, id, isCurrent);
        console.log(`🏷️  [asset-version] build ${id}: ${files} dosya tarandı, ${changed} dosyada sürüm yazıldı.`);
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
