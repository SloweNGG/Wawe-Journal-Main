// Yerel JS/CSS sürümleme (scripts/asset-version.mjs) — dosya başına içerik hash'i, immutable önbellek güvenliği
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { stampHtml, stampJs, stampCss, findUnversioned, versionDist, stampImages, findUnversionedImages, resolveRef, TOKEN } from '../scripts/asset-version.mjs';

const ID = '1790000000000';

describe('asset-version: HTML', () => {
  it('adds ?v=<id> to local scripts and styles, overriding hand-written versions', () => {
    const html =
      '<script src="/config.js" is:inline></script><script src="/i18n.js?v=15"></script>' +
      '<link rel="stylesheet" href="/interface/x/css/a.css?v=1792800100" /><script src="parser.js"></script>';
    const out = stampHtml(html, ID);
    assert.match(out, new RegExp('src="/config.js\\?v=' + ID + '"'));
    assert.match(out, new RegExp('src="/i18n.js\\?v=' + ID + '"'));
    assert.match(out, new RegExp('href="/interface/x/css/a.css\\?v=' + ID + '"'));
    assert.match(out, new RegExp('src="parser.js\\?v=' + ID + '"'));
    assert.deepEqual(findUnversioned(out, 'html', ID), []);
  });

  it('leaves CDN, /_astro/ (content-hashed), /sw.js and non-JS/CSS links alone', () => {
    const html =
      '<script src="https://cdn.jsdelivr.net/npm/lucide@0.441.0/dist/umd/lucide.min.js"></script>' +
      '<link rel="stylesheet" href="/_astro/about.DweLjApR.css" /><script src="//x.com/a.js"></script>' +
      '<link rel="icon" href="/resim.svg" /><a href="/dashboard.html">d</a>' +
      "<script>navigator.serviceWorker.register('/sw.js')</script>";
    assert.equal(stampHtml(html, ID), html);
    assert.deepEqual(findUnversioned(html, 'html', ID), []);
  });

  it('replaces the build token in inline scripts', () => {
    const out = stampHtml("<script>var u='/a.json?v=" + TOKEN + "'</script>", ID);
    assert.ok(out.includes('/a.json?v=' + ID) && !out.includes(TOKEN));
  });
});

describe('asset-version: JS modules and code-built URLs', () => {
  it('versions static, side-effect and dynamic imports (minified or not)', () => {
    const code =
      "import { a } from './helpers.js';\nimport './side.js';\nexport * from '../core/x.js';\n" +
      'const m = import("./lazy.js");import{b as c}from"./min.js";';
    const out = stampJs(code, ID);
    for (const f of ['./helpers.js', './side.js', '../core/x.js', './lazy.js', './min.js']) {
      assert.ok(out.includes(f + '?v=' + ID), f);
    }
    assert.deepEqual(findUnversioned(out, 'js', ID), []);
  });

  it('does not touch bare package specifiers or CDN imports', () => {
    const code = "import x from 'react';import y from 'https://esm.sh/z.js';";
    assert.equal(stampJs(code, ID), code);
  });

  it('replaces the token in code-built URLs', () => {
    const code = "fetch('/fonts/pdf/DMSans-' + w + '.ttf?v=" + TOKEN + "');var u=P+lang+'.js?v=" + TOKEN + "';";
    const out = stampJs(code, ID);
    assert.ok(!out.includes(TOKEN));
    assert.deepEqual(findUnversioned(out, 'js', ID), []);
  });

  it('flags unversioned local URLs that a build cannot fix', () => {
    const bad = "s.src='/interface/shared/demo-data.js';fetch('/fonts/pdf/A-'+w+'.ttf');fetch('/x.json?v=2')";
    const problems = findUnversioned(stampJs(bad, ID), 'js', ID);
    assert.ok(problems.some((p) => p.includes('/interface/shared/demo-data.js')), problems.join());
    assert.ok(problems.some((p) => p.includes(".ttf'")), problems.join());
    assert.ok(findUnversioned(TOKEN, 'js', ID).length === 1, 'leftover token is reported');
  });
});

describe('asset-version: CSS', () => {
  it('versions url() in /fonts/ and /icons/ and font files, leaves images and data: alone', () => {
    const css =
      "@font-face{src:url(/fonts/geist.woff2) format('woff2'),url('/fonts/a.ttf?v=1')}" +
      '.i{background:url("/icons/x.svg")}.h{background:url(/images/brand/hero.webp)}' +
      ".d{background:url(data:image/svg+xml;base64,AAA=)}@import '/vendor/x.css';";
    const out = stampCss(css, ID);
    assert.ok(out.includes('url(/fonts/geist.woff2?v=' + ID + ')'));
    assert.ok(out.includes("url('/fonts/a.ttf?v=" + ID + "')"));
    assert.ok(out.includes('url("/icons/x.svg?v=' + ID + '")'));
    assert.ok(out.includes('url(/images/brand/hero.webp)'));
    assert.ok(out.includes('url(data:image/svg+xml;base64,AAA=)'));
    assert.ok(out.includes("@import '/vendor/x.css?v=" + ID + "'"));
    assert.deepEqual(findUnversioned(out, 'css', ID), []);
  });
});

describe('asset-version: dist pass (content hashes)', () => {
  const H = /^[0-9a-f]{10}$/;
  function tree(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wj-av-'));
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text);
    }
    return dir;
  }
  const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
  const verIn = (text, ref) => (text.match(new RegExp(ref.replace(/[.]/g, '\\.') + '\\?v=([^"\'`)&]+)')) || [])[1];

  it('stamps a dist tree and reports stale (not current) files separately', () => {
    const dir = tree({
      'page.html': '<meta name="ww-build" content="' + ID + '"><script src="/js/a.js?v=3"></script>',
      'js/a.js': "import './b.js';",
      'js/b.js': 'export const b = 1;',
      'old.html': '<meta name="ww-build" content="1"><script>s.src="/js/c.js"</script>',
    });
    const r = versionDist(dir, ID, (rel) => rel !== '/old.html');
    assert.deepEqual(r.problems, []);
    assert.equal(r.stale.length, 2, r.stale.join());
    assert.match(verIn(read(dir, 'page.html'), '/js/a.js'), H);
    assert.match(verIn(read(dir, 'js/a.js'), './b.js'), H);
    assert.throws(() => versionDist(dir, 'abc'), /rakam/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('an unchanged file keeps its address across builds; a change ripples up the import chain only', () => {
    const files = {
      'p.html': '<script src="/js/main.js"></script><script src="/js/other.js"></script><link rel="stylesheet" href="/css/s.css">',
      'js/main.js': "import { b } from './lib/b.js'; console.log(b);",
      'js/lib/b.js': "import '../../shared/c.js'; export const b = 1;",
      'shared/c.js': 'export const c = 1;',
      'js/other.js': 'console.log(2);',
      'css/s.css': "@font-face{src:url(/fonts/f.woff2)}@import '/css/t.css';",
      'css/t.css': '.t{color:red}',
      'fonts/f.woff2': 'FONT1',
    };
    const d1 = tree(files);
    const d2 = tree(files);
    const r1 = versionDist(d1, '1790000000001');
    const r2 = versionDist(d2, '1790000000002');
    assert.deepEqual([r1.problems, r2.problems], [[], []]);
    assert.equal(read(d1, 'p.html'), read(d2, 'p.html'), 'different build IDs, same content → identical output');
    // c.js değişir → b.js ve main.js'in adresi değişir; other.js ve CSS aynı kalır
    const d3 = tree({ ...files, 'shared/c.js': 'export const c = 2;' });
    versionDist(d3, '1790000000003');
    const p1 = read(d1, 'p.html');
    const p3 = read(d3, 'p.html');
    assert.notEqual(verIn(p3, '/js/main.js'), verIn(p1, '/js/main.js'));
    assert.notEqual(verIn(read(d3, 'js/main.js'), './lib/b.js'), verIn(read(d1, 'js/main.js'), './lib/b.js'));
    assert.equal(verIn(p3, '/js/other.js'), verIn(p1, '/js/other.js'));
    assert.equal(verIn(p3, '/css/s.css'), verIn(p1, '/css/s.css'));
    // font değişir → onu kullanan CSS'in adresi de değişir
    const d4 = tree({ ...files, 'fonts/f.woff2': 'FONT2' });
    versionDist(d4, '1790000000004');
    assert.notEqual(verIn(read(d4, 'p.html'), '/css/s.css'), verIn(p1, '/css/s.css'));
    for (const d of [d1, d2, d3, d4]) fs.rmSync(d, { recursive: true, force: true });
  });

  it('import cycles get one shared hash and still change when a member changes', () => {
    const files = {
      'p.html': '<script type="module" src="/m/a.js"></script>',
      'm/a.js': "import './b.js'; export const a = 1;",
      'm/b.js': "import './a.js'; export const b = 1;",
    };
    const d1 = tree(files);
    const r = versionDist(d1, ID);
    assert.deepEqual(r.problems, []);
    const va = verIn(read(d1, 'm/b.js'), './a.js');
    assert.match(va, H);
    assert.equal(va, verIn(read(d1, 'm/a.js'), './b.js'));
    assert.equal(va, verIn(read(d1, 'p.html'), '/m/a.js'));
    const d2 = tree({ ...files, 'm/b.js': "import './a.js'; export const b = 2;" });
    versionDist(d2, ID);
    assert.notEqual(verIn(read(d2, 'p.html'), '/m/a.js'), va);
    for (const d of [d1, d2]) fs.rmSync(d, { recursive: true, force: true });
  });

  it('code-built URLs: literal → file hash, prefix+var+suffix → hash of the matching files, __WW_GLOB(...)__ → hash of the glob', () => {
    const files = {
      'p.html': '<link rel="preload" href="/fonts/a.woff2?v=' + TOKEN + '"><script src="/x.js"></script>',
      'x.js':
        "s.src='/lazy/l.js?v=" + TOKEN + "';fetch(\"/fonts/pdf/D-\"+w+\".ttf?v=" + TOKEN + "\");" +
        'fetch(`/fonts/pdf/D-${w}.ttf?v=' + TOKEN + '`);var u=P+lang+".js?v=__WW_GLOB(/i18n/*.js)__";',
      'lazy/l.js': 'console.log(1)',
      'fonts/a.woff2': 'A',
      'fonts/pdf/D-Bold.ttf': 'B',
      'fonts/pdf/D-Regular.ttf': 'R',
      'i18n/en.js': 'export default {}',
      'i18n/tr.js': 'export default {}',
    };
    const d1 = tree(files);
    const r = versionDist(d1, ID);
    assert.deepEqual([r.problems, r.warnings], [[], []]);
    const x1 = read(d1, 'x.js');
    assert.ok(!x1.includes(TOKEN) && !x1.includes('__WW_GLOB'), x1);
    assert.match(verIn(x1, '/lazy/l.js'), H);
    assert.ok(x1.includes('"/fonts/pdf/D-"+w+".ttf?v='), x1);
    assert.ok(/`\/fonts\/pdf\/D-\$\{w\}\.ttf\?v=[0-9a-f]{10}`/.test(x1), x1);
    assert.match(verIn(x1, '".js'), H);
    assert.match(verIn(read(d1, 'p.html'), '/fonts/a.woff2'), H);
    // tr.js değişir → glob hash'i (ve x.js'in adresi) değişir; font hash'leri aynı kalır
    const d2 = tree({ ...files, 'i18n/tr.js': 'export default {a:1}' });
    versionDist(d2, ID);
    const x2 = read(d2, 'x.js');
    assert.notEqual(verIn(x2, '".js'), verIn(x1, '".js'));
    assert.equal(verIn(x2, '/lazy/l.js'), verIn(x1, '/lazy/l.js'));
    assert.equal(x2.match(/D-"\+w\+"\.ttf\?v=([0-9a-f]+)/)[1], x1.match(/D-"\+w\+"\.ttf\?v=([0-9a-f]+)/)[1]);
    for (const d of [d1, d2]) fs.rmSync(d, { recursive: true, force: true });
  });

  it('a reference to a file that is not in dist falls back to the build ID with a warning', () => {
    const dir = tree({ 'p.html': '<script src="/gone.js"></script>', 'y.js': "var t='" + TOKEN + "';" });
    const r = versionDist(dir, ID);
    assert.deepEqual(r.problems, []);
    assert.ok(read(dir, 'p.html').includes('/gone.js?v=' + ID));
    assert.ok(r.warnings.some((w) => w.includes('/gone.js')), r.warnings.join());
    assert.ok(r.warnings.some((w) => w.includes('/y.js')), 'leftover token is reported as a build-ID fallback');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('a hand-written wrong version is caught by the check', () => {
    assert.deepEqual(findUnversioned('<script src="/a.js?v=1111111111"></script>', 'html', { ver: () => 'abcdef0123', glob: () => '', fallback: ID }), [
      '/a.js?v=1111111111',
    ]);
  });

  it('resolves relative references against the referencing file', () => {
    assert.equal(resolveRef('./b.js', '/interface/x/a.js'), '/interface/x/b.js');
    assert.equal(resolveRef('../core/c.js?v=1', '/src/services/a.js'), '/src/core/c.js');
    assert.equal(resolveRef('parser.js', '/add-trade.html'), '/parser.js');
    assert.equal(resolveRef('/abs.css', '/deep/er/p.html'), '/abs.css');
  });
});

describe('asset-version: images (content hash)', () => {
  const hashOf = (ref) => (ref.includes('gone') ? null : 'h_' + ref.length);

  it('stamps src, srcset, CSS url() and JS strings with the file hash; leaves absolute URLs alone', () => {
    const text =
      '<img src="/images/a.webp" srcset="/images/a-600w.webp 600w, /images/a.webp 1800w">' +
      '<i style="background:url(/images/b.png)"></i><b style=\'background:url("/images/b.png?v=old")\'></b>' +
      '<meta property="og:image" content="https://wawejournal.com/images/a.webp">' +
      "<script>var p={x:'/images/c.svg'};</script>";
    const out = stampImages(text, hashOf);
    const v = (ref) => ref + '?v=' + hashOf(ref);
    assert.ok(out.includes('src="' + v('/images/a.webp') + '"'));
    assert.ok(out.includes(v('/images/a-600w.webp') + ' 600w, ' + v('/images/a.webp') + ' 1800w'));
    assert.ok(out.includes('url(' + v('/images/b.png') + ')') && out.includes('url("' + v('/images/b.png') + '")'));
    assert.ok(out.includes('content="https://wawejournal.com/images/a.webp"'));
    assert.ok(out.includes("'" + v('/images/c.svg') + "'"));
    assert.deepEqual(findUnversionedImages(out, hashOf), []);
  });

  it('reports references to missing images and stale hashes', () => {
    const found = findUnversionedImages('<img src="/images/gone.webp"><img src="/images/a.webp?v=old">', hashOf);
    assert.deepEqual(found, ['olmayan görsel /images/gone.webp', 'sürümsüz görsel /images/a.webp?v=old']);
  });

  it('the dist pass hashes real files and fails on a missing one', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-img-'));
    fs.mkdirSync(path.join(dir, 'images'));
    fs.writeFileSync(path.join(dir, 'images', 'x.webp'), 'one');
    fs.writeFileSync(path.join(dir, 'page.html'), '<img src="/images/x.webp"><img src="/images/nope.webp">');
    fs.writeFileSync(path.join(dir, 'site.webmanifest'), '{"icons":[{"src":"/images/x.webp"}]}');
    const r = versionDist(dir, ID);
    const page = fs.readFileSync(path.join(dir, 'page.html'), 'utf8');
    const v = page.match(/x\.webp\?v=([0-9a-f]{10})"/)[1];
    assert.ok(fs.readFileSync(path.join(dir, 'site.webmanifest'), 'utf8').includes('/images/x.webp?v=' + v));
    assert.deepEqual(r.problems, ['/page.html: olmayan görsel /images/nope.webp']);
    fs.writeFileSync(path.join(dir, 'images', 'x.webp'), 'two');
    fs.writeFileSync(path.join(dir, 'page.html'), '<img src="/images/x.webp">');
    versionDist(dir, ID);
    assert.ok(!fs.readFileSync(path.join(dir, 'page.html'), 'utf8').includes('?v=' + v), 'a changed image gets a new address');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('asset-version: sources keep no hand-written versions', () => {
  function walk(d, exts) {
    return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const f = path.join(d, e.name);
      return e.isDirectory() ? walk(f, exts) : exts.includes(path.extname(f)) ? [f] : [];
    });
  }
  it('no ?v=<number> on local JS/CSS in src/ or public/ (the build writes content hashes)', () => {
    const bad = [];
    const files = [...walk('src', ['.astro', '.ts', '.tsx']), ...walk('public', ['.js', '.html', '.css'])].filter(
      (f) => !f.endsWith(path.join('src', 'bundle.js'))
    );
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/[A-Za-z0-9_\-/]+\.(?:m?js|css|json|ttf|woff2?)\?v=\d+/g)) bad.push(f + ': ' + m[0]);
    }
    assert.deepEqual(bad, []);
  });
});
