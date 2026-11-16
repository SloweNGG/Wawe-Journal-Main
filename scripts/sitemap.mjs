// ============================================================
// OTOMATİK SITEMAP — her derlemede dist'teki sayfalardan üretilir
// ============================================================
// Elle sitemap tutulmaz (public/sitemap.xml YOK). Derleme bitince dist'teki her .html okunur:
//   - <meta name="robots" content="...noindex..."> olan sayfa ALINMAZ (uygulama sayfaları, giriş, 404)
//   - <link rel="canonical"> yoksa ya da başka bir adresi gösteriyorsa ALINMAZ (kopya sayfa)
//   - Adres = canonical (Cloudflare /x.html'i /x'e yönlendirdiği için temiz adres)
//   - <link rel="alternate" hreflang="..."> varsa sitemap'e xhtml:link olarak eklenir (/tr/, /de/ sayfaları için)
//   - lastmod = sayfanın kaynak dosyasının (src/pages/...) son commit tarihi. Git geçmişi yoksa ya da
//     sığ (shallow) klonsa lastmod YAZILMAZ: yanlış tarih (her sayfa "bugün değişti") Google'ın lastmod'a
//     güvenini bozar, hiç yazmamak daha iyi.
// Yeni bir dizine eklenebilir sayfa eklendiğinde (canonical'ı olan, noindex olmayan) sitemap'e kendiliğinden girer.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[1] ?? m[2]) : null;
};

/** Bir sayfanın HTML'inden sitemap bilgisi: dizine eklenemezse null. */
export function pageEntry(html, selfUrl) {
  const head = html.slice(0, html.search(/<\/head>/i) + 1 || html.length);
  const tags = head.match(/<(meta|link)\b[^>]*>/gi) || [];
  let canonical = null;
  const alternates = [];
  for (const tag of tags) {
    const isMeta = /^<meta/i.test(tag);
    if (isMeta && /^(robots|googlebot)$/i.test(attr(tag, 'name') || '') && /noindex/i.test(attr(tag, 'content') || '')) return null;
    if (!isMeta) {
      const rel = (attr(tag, 'rel') || '').toLowerCase().split(/\s+/);
      if (rel.includes('canonical')) canonical = attr(tag, 'href');
      else if (rel.includes('alternate') && attr(tag, 'hreflang') && attr(tag, 'href')) {
        alternates.push({ hreflang: attr(tag, 'hreflang'), href: attr(tag, 'href') });
      }
    }
  }
  if (!canonical) return null;
  // Kendini göstermeyen canonical: bu sayfa başka bir adresin kopyası, sitemap'e o adres girer
  if (selfUrl && canonical.replace(/\/$/, '') !== selfUrl.replace(/\/$/, '')) return null;
  return { loc: canonical, alternates };
}

const xmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** entries: [{ loc, lastmod?, alternates: [{hreflang, href}] }] → sitemap XML */
export function renderSitemap(entries) {
  const hasAlt = entries.some((e) => e.alternates.length);
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${hasAlt ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : ''}>`,
  ];
  for (const e of entries) {
    out.push('  <url>', `    <loc>${xmlEscape(e.loc)}</loc>`);
    if (e.lastmod) out.push(`    <lastmod>${e.lastmod}</lastmod>`);
    for (const a of e.alternates) {
      out.push(`    <xhtml:link rel="alternate" hreflang="${xmlEscape(a.hreflang)}" href="${xmlEscape(a.href)}"/>`);
    }
    out.push('  </url>');
  }
  out.push('</urlset>', '');
  return out.join('\n');
}

function gitDates() {
  try {
    if (execFileSync('git', ['rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).trim() !== 'false') return null;
    return (file) => {
      try {
        const d = execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { encoding: 'utf8' }).trim();
        return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
      } catch {
        return null;
      }
    };
  } catch {
    return null;
  }
}

function walk(dir, list = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, list);
    else if (e.name.endsWith('.html')) list.push(full);
  }
  return list;
}

export function sitemapIntegration() {
  let site = 'https://wawejournal.com';
  let pagesDir = path.resolve('src/pages');
  return {
    name: 'ww-sitemap',
    hooks: {
      'astro:config:done': ({ config }) => {
        if (config.site) site = config.site.replace(/\/$/, '');
        pagesDir = fileURLToPath(new URL('pages/', config.srcDir));
      },
      'astro:build:done': async ({ dir }) => {
        const distDir = typeof dir === 'string' ? dir : fileURLToPath(dir);
        const dateOf = gitDates();
        const entries = [];
        for (const file of walk(distDir)) {
          const rel = path.relative(distDir, file).split(path.sep).join('/');
          // format: 'file' → about.html = /about, index.html = /, tr/index.html = /tr/
          const cleanPath = '/' + rel.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');
          const entry = pageEntry(fs.readFileSync(file, 'utf8'), site + cleanPath);
          if (!entry) continue;
          if (dateOf) {
            const base = rel.replace(/\.html$/, '');
            const src = ['.astro', '.md', '.mdx', '.html'].map((ext) => path.join(pagesDir, base + ext)).find((f) => fs.existsSync(f));
            entry.lastmod = src ? dateOf(src) : null;
          }
          entries.push(entry);
        }
        if (!entries.length) throw new Error('[ww-sitemap] Dizine eklenebilir sayfa bulunamadı; boş sitemap yayınlanmaz.');
        // Ana sayfa önce, sonra alfabetik (deterministik çıktı)
        entries.sort((a, b) => (a.loc === site + '/' ? -1 : b.loc === site + '/' ? 1 : a.loc.localeCompare(b.loc)));
        fs.writeFileSync(path.join(distDir, 'sitemap.xml'), renderSitemap(entries));
        console.log(`🗺️  [ww-sitemap] ${entries.length} sayfa: ${entries.map((e) => e.loc.replace(site, '') || '/').join(' ')}${dateOf ? '' : ' (git geçmişi yok/sığ: lastmod yazılmadı)'}`);
      },
    },
  };
}
