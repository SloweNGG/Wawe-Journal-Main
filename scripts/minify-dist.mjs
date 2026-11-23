// ============================================================
// DİST KÜÇÜLTME — statik JS/CSS dosyaları + HTML'deki satır içi klasik <script>'ler
// ============================================================
// astro:build:done'da çalışır; asset-version'dan ÖNCE olmalı (içerik hash'leri son baytlardan hesaplanır).
//
// 1) public/'ten kopyalanan .js/.css dosyaları esbuild ile küçültülür.
// 2) Her .html'deki satır içi KLASİK script (src yok; type yok / text/javascript / application/javascript)
//    küçültülür. JSON-LD, application/json, module, importmap ve tanınmayan türlere dokunulmaz.
//    - Klasik script'in üst düzey adları (var/function/let/const/class) global'dir: onclick="..." öznitelikleri ve
//      başka script'ler bunlara adıyla erişir. esbuild format verilmeden (transform modu) üst düzey adları
//      DEĞİŞTİRMEZ ve kullanılmayan üst düzey kodu SİLMEZ (tree shaking kapalı); yalnızca iç kapsamlar kısalır
//      (tests/minify-dist.test.js bunu sabitler).
//    - Öznitelikler ve sıra aynen kalır; yalnızca etiketin içi değişir. Çıktı belirlenimcidir (aynı girdi → aynı
//      çıktı): SpaRouter head'deki satır içi script'leri metinleriyle eşleştirir, asset-version hash'leri de buna bağlı.
//    - Güvenlik: esbuild hata verirse, çıktıda '</script' ya da '<!--' varsa (HTML ayrıştırıcısı script'i erken
//      kapatır / kaçış durumuna girer) ya da çıktı kısalmadıysa orijinal bırakılır ve uyarı yazılır.
//    - Kodla kurulan adresler ('/x/y.js?v=__WW_BUILD_ID__') küçültmede tırnak değiştirebilir (' → "); asset-version
//      her iki tırnağı da tanır.
//
// charset 'utf8': esbuild varsayılanı ASCII dışı karakterleri \uXXXX'e kaçırır (Türkçe tr.js kaynağından BÜYÜK çıkıyordu).
// UTF-8 bırakmak güvenli: her sayfa <meta charset="utf-8"> taşır; klasik script'ler (Content-Type'ta charset yoksa,
// Cloudflare "application/javascript" gönderir) sayfanın kodlamasıyla, ES modüller (dil dosyaları) ve service worker
// her zaman UTF-8 olarak okunur.
// ============================================================

import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MINIFY_OPTIONS = Object.freeze({ minify: true, legalComments: 'none', charset: 'utf8' });

/** Tek bir JS/CSS dosyasının içeriğini küçültür (hata fırlatabilir). */
export function minifyAssetCode(code, loader) {
  return esbuild.transformSync(code, { loader, ...MINIFY_OPTIONS }).code;
}

// HTML yorumu ya da tam bir <script ...>...</script> öğesi. Yorumlar olduğu gibi geçer (içlerindeki script'lere dokunulmaz).
// Öznitelik: ad, isteğe bağlı = ve tırnaklı/tırnaksız değer (değer içindeki '>' etiketi bitirmez).
const SCRIPT_OR_COMMENT =
  /<!--[\s\S]*?-->|(<script\b((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>)([\s\S]*?)(<\/script\s*>)/gi;
const ATTR = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

export function parseAttrs(attrText) {
  const out = new Map();
  for (const m of (attrText || '').matchAll(ATTR)) {
    const name = m[1].toLowerCase();
    if (!out.has(name)) out.set(name, m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

// Klasik script türleri (HTML: type yok ya da boşsa klasik). Diğer her şey (module, ld+json, json, importmap, ...) atlanır.
const CLASSIC_TYPES = new Set(['', 'text/javascript', 'application/javascript']);

/** Öğe küçültülecek bir satır içi klasik script mi? */
export function isInlineClassicScript(attrs) {
  if (attrs.has('src')) return false;
  const type = (attrs.get('type') ?? '').trim().toLowerCase();
  return CLASSIC_TYPES.has(type);
}

/**
 * Tek bir satır içi script'in küçültülmüş hali. { code, reason }: reason doluysa orijinal korunmuştur.
 * Sonuç önbelleğe alınır (aynı blok onlarca sayfada tekrar ediyor; aynı girdi → aynı çıktı).
 */
export function minifyInlineCode(code, cache = null) {
  if (cache && cache.has(code)) return cache.get(code);
  let result;
  try {
    const out = esbuild.transformSync(code, { loader: 'js', ...MINIFY_OPTIONS }).code.trimEnd();
    if (/<\/script/i.test(out)) result = { code, reason: "çıktıda '</script' var" };
    else if (out.includes('<!--')) result = { code, reason: "çıktıda '<!--' var" };
    else if (Buffer.byteLength(out, 'utf8') >= Buffer.byteLength(code, 'utf8')) result = { code, reason: 'küçülmedi' };
    else result = { code: out, reason: null };
  } catch (err) {
    result = { code, reason: 'esbuild hatası: ' + String((err && err.message) || err).split('\n')[0] };
  }
  if (cache) cache.set(code, result);
  return result;
}

/**
 * HTML'deki satır içi klasik script'leri küçültür. Öznitelikler, sıra ve script dışındaki her bayt aynen kalır.
 * @returns {{ html: string, scripts: number, minified: number, before: number, after: number, kept: {reason: string, snippet: string, body: string}[] }}
 */
export function minifyInlineScripts(html, cache = new Map()) {
  const stats = { scripts: 0, minified: 0, before: 0, after: 0, kept: [] };
  const out = html.replace(SCRIPT_OR_COMMENT, (whole, open, attrText, body, close) => {
    if (open === undefined) return whole; // HTML yorumu
    if (!isInlineClassicScript(parseAttrs(attrText)) || !body.trim()) return whole;
    stats.scripts++;
    const { code, reason } = minifyInlineCode(body, cache);
    stats.before += Buffer.byteLength(body, 'utf8');
    if (reason) {
      stats.after += Buffer.byteLength(body, 'utf8');
      stats.kept.push({ reason, snippet: body.trim().slice(0, 60).replace(/\s+/g, ' '), body });
      return whole;
    }
    stats.after += Buffer.byteLength(code, 'utf8');
    stats.minified++;
    // Yalnızca içerik değişir: açılış etiketi (öznitelikleriyle) ve kapanış aynen kalır
    return open + code + close;
  });
  return { html: out, ...stats };
}

function walk(dir, list = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, list);
    else if (e.isFile()) list.push(full);
  }
  return list;
}

/**
 * dist'i küçültür (dosyalar + satır içi script'ler). Testler ve entegrasyon ortak kullanır.
 * @returns {{ files: number, fileBefore: number, fileAfter: number, pages: number, scripts: number, minified: number,
 *            inlineBefore: number, inlineAfter: number, warnings: string[] }}
 */
export function minifyDist(distDir) {
  const r = { files: 0, fileBefore: 0, fileAfter: 0, pages: 0, scripts: 0, minified: 0, inlineBefore: 0, inlineAfter: 0, warnings: [] };
  const cache = new Map();
  const keptBy = new Map(); // script metni → { neden, sayfalar } (aynı blok her sayfada ayrı uyarı yazmasın)
  for (const full of walk(distDir).sort()) {
    const ext = path.extname(full).toLowerCase();
    if (ext === '.js' || ext === '.css') {
      try {
        const content = fs.readFileSync(full, 'utf8');
        const code = minifyAssetCode(content, ext === '.js' ? 'js' : 'css');
        if (code) {
          fs.writeFileSync(full, code, 'utf8');
          r.fileBefore += Buffer.byteLength(content, 'utf8');
          r.fileAfter += Buffer.byteLength(code, 'utf8');
          r.files++;
        }
      } catch (err) {
        r.warnings.push(`${path.relative(distDir, full)} küçültülemedi: ${err.message}`);
      }
    } else if (ext === '.html') {
      const html = fs.readFileSync(full, 'utf8');
      const res = minifyInlineScripts(html, cache);
      r.scripts += res.scripts;
      r.minified += res.minified;
      r.inlineBefore += res.before;
      r.inlineAfter += res.after;
      for (const k of res.kept) {
        if (!keptBy.has(k.body)) keptBy.set(k.body, { reason: k.reason, snippet: k.snippet, pages: [] });
        keptBy.get(k.body).pages.push(path.relative(distDir, full));
      }
      if (res.html !== html) {
        fs.writeFileSync(full, res.html, 'utf8');
        r.pages++;
      }
    }
  }
  for (const { reason, snippet, pages } of keptBy.values()) {
    const where = pages.slice(0, 3).join(', ') + (pages.length > 3 ? ` (+${pages.length - 3} sayfa)` : '');
    r.warnings.push(`satır içi script küçültülmedi (${reason}) — ${where}: ${snippet}`);
  }
  return r;
}

const kb = (n) => (n / 1024).toFixed(1);
const pct = (a, b) => (a > 0 ? (((a - b) / a) * 100).toFixed(1) : '0');

export function minifyDistAssets() {
  return {
    name: 'minify-dist-assets',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        const distDir = typeof dir === 'string' ? dir : fileURLToPath(dir);
        console.log('⚡ [minify-dist-assets] Minifying static JS & CSS and inline scripts in dist...');
        const r = minifyDist(distDir);
        console.log(
          `✅ [minify-dist-assets] Minified ${r.files} files. Saved ${kb(r.fileBefore - r.fileAfter)} KB (-${pct(r.fileBefore, r.fileAfter)}%).`
        );
        console.log(
          `✅ [minify-dist-assets] Inline scripts: ${r.minified}/${r.scripts} minified in ${r.pages} HTML files. ` +
            `Saved ${kb(r.inlineBefore - r.inlineAfter)} KB (-${pct(r.inlineBefore, r.inlineAfter)}%).`
        );
        if (r.warnings.length) console.warn('⚠️  [minify-dist-assets] ' + r.warnings.join('\n  '));
      },
    },
  };
}
