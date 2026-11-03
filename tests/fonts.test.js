// Kendi sunucumuzdan fontlar (parça 3a) — Google Fonts'a istek yok, yalnızca latin + latin-ext,
// font-display: swap, kritik dosyalar preload, yedek yüzler ölçülmüş metriklerle (yerleşim kaymasın)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const f = path.join(d, e.name);
    return e.isDirectory() ? walk(f) : [f];
  });
}

const css = fs.readFileSync('public/fonts/fonts.css', 'utf8');
const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => {
  const body = m[1];
  const get = (k) => ((body.match(new RegExp('(?:^|;|\\s)' + k + ':\\s*([^;]+);')) || [])[1] || '').trim();
  return { family: get('font-family').replace(/['"]/g, ''), weight: get('font-weight'), display: get('font-display'), src: get('src'), range: get('unicode-range'), body };
});
const webFaces = faces.filter((f) => /url\(/.test(f.src));
const fallbackFaces = faces.filter((f) => /local\(/.test(f.src));
const baseHead = fs.readFileSync('src/components/BaseHead.astro', 'utf8');

describe('fontlar: Google Fonts yok', () => {
  it('src/ ve public/ içinde fonts.googleapis.com / fonts.gstatic.com geçmiyor', () => {
    const files = [...walk('src'), ...walk('public')].filter((f) => /\.(astro|html|css|m?js|tsx?)$/.test(f));
    const hits = files.filter((f) => /fonts\.(googleapis|gstatic)\.com/.test(fs.readFileSync(f, 'utf8')));
    assert.deepEqual(hits, []);
  });

  it('fonts.css yalnızca BaseHead\'den yükleniyor (her sayfa Layout → BaseHead)', () => {
    assert.match(baseHead, /<link rel="stylesheet" href="\/fonts\/fonts\.css" \/>/);
    // koşullu dalın (isAppPage) dışında: tanıtım, giriş ve uygulama sayfalarının hepsi alır
    assert.ok(baseHead.indexOf('/fonts/fonts.css') < baseHead.indexOf('{isAppPage &&'));
  });
});

describe('fontlar: fonts.css', () => {
  it('Geist, Geist Mono ve Syne için latin + latin-ext yüzleri, ağırlıklar önceki Google isteğiyle aynı', () => {
    const got = webFaces.map((f) => `${f.family}|${f.weight}|${f.src.match(/\/fonts\/([^)?]+)/)[1]}`).sort();
    assert.deepEqual(got, [
      'Geist Mono|400 700|geist-mono-latin-ext.woff2', 'Geist Mono|400 700|geist-mono-latin.woff2',
      'Geist|400 800|geist-latin-ext.woff2', 'Geist|400 800|geist-latin.woff2',
      'Syne|600 800|syne-latin-ext.woff2', 'Syne|600 800|syne-latin.woff2',
    ].sort());
  });

  it('her web fontu font-display: swap, woff2 ve unicode-range taşıyor; dosyalar var ve gerçekten woff2', () => {
    for (const f of webFaces) {
      assert.equal(f.display, 'swap', f.family);
      assert.match(f.src, /format\('woff2'\)/);
      assert.ok(f.range.length > 0, f.family + ' unicode-range');
      const file = 'public' + f.src.match(/url\(([^)?]+)/)[1];
      assert.equal(fs.readFileSync(file).subarray(0, 4).toString('latin1'), 'wOF2', file);
    }
  });

  it('url() adresleri sürümsüz yazılıyor (derleme ?v=<build> ekler) ve yalnızca /fonts/ altını gösteriyor', () => {
    for (const m of css.matchAll(/url\(([^)]+)\)/g)) assert.match(m[1], /^\/fonts\/[a-z-]+\.woff2$/);
  });

  it('latin-ext Türkçe harfleri (ğ ş İ), latin Almanca harfleri (ä ö ü ß) kapsıyor', () => {
    const inRange = (range, cp) => range.split(',').some((r) => {
      const [a, b] = r.trim().replace(/^U\+/i, '').split('-').map((h) => parseInt(h, 16));
      return cp >= a && cp <= (b ?? a);
    });
    for (const fam of ['Geist', 'Geist Mono', 'Syne']) {
      const ranges = webFaces.filter((f) => f.family === fam).map((f) => f.range).join(',');
      for (const ch of 'çğıİöşüÇĞÖŞÜäöüßÄÖÜẞ') assert.ok(inRange(ranges, ch.codePointAt(0)), fam + ' ' + ch);
    }
  });

  it('her aile için ölçülmüş yedek yüz: size-adjust, ascent/descent/line-gap override, unicode-range', () => {
    for (const fam of ['Geist Fallback', 'Geist Mono Fallback', 'Syne Fallback']) {
      const list = fallbackFaces.filter((f) => f.family === fam);
      assert.ok(list.length > 0, fam);
      for (const f of list) {
        for (const k of ['size-adjust', 'ascent-override', 'descent-override', 'line-gap-override']) assert.match(f.body, new RegExp(k + ':\\s*[0-9.]+%'), fam + ' ' + k);
        assert.match(f.src, fam === 'Geist Mono Fallback' ? /local\('Courier New'\)/ : /local\('Arial/, fam);
        assert.ok(f.range.length > 0, fam + ' unicode-range');
        assert.equal(f.display, '', 'yedek yüz yerel, font-display gerekmez');
      }
    }
  });

  it('yedek yüzlerin unicode-range\'i web fontunda olmayan karakterleri (→ ₺) almıyor (onlar eskisi gibi sistem fontuna düşer)', () => {
    for (const f of fallbackFaces) {
      for (const cp of [0x2192, 0x20BA]) {
        const hit = f.range.split(',').some((r) => {
          const [a, b] = r.trim().replace(/^U\+/i, '').split('-').map((h) => parseInt(h, 16));
          return cp >= a && cp <= (b ?? a);
        });
        assert.equal(hit, false, f.family + ' U+' + cp.toString(16));
      }
    }
  });

  it('yedek ağırlık aralıkları boşluksuz ve çakışmasız 100–900\'ü kapsıyor', () => {
    for (const fam of ['Geist Fallback', 'Geist Mono Fallback', 'Syne Fallback']) {
      const ranges = fallbackFaces.filter((f) => f.family === fam).map((f) => f.weight.split(/\s+/).map(Number)).sort((a, b) => a[0] - b[0]);
      assert.equal(ranges[0][0], 100, fam);
      assert.equal(ranges[ranges.length - 1][1], 900, fam);
      for (let i = 1; i < ranges.length; i++) assert.equal(ranges[i][0], ranges[i - 1][1] + 1, fam);
    }
  });
});

describe('fontlar: preload ve font yığınları', () => {
  it('kritik Geist dosyaları preload ediliyor (as=font, crossorigin, ?v=__WW_BUILD_ID__) ve fonts.css\'te kullanılıyor', () => {
    const preloads = [...baseHead.matchAll(/<link rel="preload" href="([^"]+)" as="font" type="font\/woff2" crossorigin \/>/g)].map((m) => m[1]);
    assert.deepEqual(preloads, ['/fonts/geist-latin.woff2?v=__WW_BUILD_ID__', '/fonts/geist-latin-ext.woff2?v=__WW_BUILD_ID__']);
    for (const p of preloads) assert.ok(css.includes('url(' + p.replace(/\?.*$/, '') + ')'), p);
  });

  it('font değişkenlerinde yedek aile web fontunun hemen arkasında', () => {
    const stacks = [
      ['public/styles.css', /--font:\s*'Geist', 'Geist Fallback',/],
      ['public/styles.css', /--font-mono:\s*'Geist Mono', 'Geist Mono Fallback',/],
      ['public/styles.css', /--font-display:\s*'Syne', 'Syne Fallback', 'Geist',/],
      ['public/landing-glass.css', /--sans:\s*'Geist', 'Geist Fallback',/],
      ['public/landing-preview.css', /--sans:\s*'Geist', 'Geist Fallback',/],
      ['public/page-chrome.css', /--sans:\s*'Geist', 'Geist Fallback',/],
    ];
    for (const page of ['login', 'register', 'forgot-password', 'update-password']) {
      stacks.push(['src/pages/' + page + '.astro', /--font:\s*'Geist', 'Geist Fallback',/]);
      stacks.push(['src/pages/' + page + '.astro', /--font-display:\s*'Syne', 'Syne Fallback', 'Geist',/]);
    }
    for (const [file, re] of stacks) assert.match(fs.readFileSync(file, 'utf8'), re, file);
  });

  it('OFL lisansları fontların yanında', () => {
    for (const f of ['OFL-Geist.txt', 'OFL-GeistMono.txt', 'OFL-Syne.txt']) assert.match(fs.readFileSync('public/fonts/' + f, 'utf8'), /SIL Open Font License/);
  });
});
