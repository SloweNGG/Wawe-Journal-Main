// Yerel JS/CSS sürümleme (scripts/asset-version.mjs) — tek build ID, immutable önbellek güvenliği
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { stampHtml, stampJs, stampCss, findUnversioned, versionDist, TOKEN } from '../scripts/asset-version.mjs';

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

describe('asset-version: dist pass', () => {
  it('stamps a dist tree and reports stale (not current) files separately', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wj-av-'));
    fs.mkdirSync(path.join(dir, 'js'));
    fs.writeFileSync(path.join(dir, 'page.html'), '<meta name="ww-build" content="' + ID + '"><script src="/js/a.js?v=3"></script>');
    fs.writeFileSync(path.join(dir, 'js', 'a.js'), "import './b.js';");
    fs.writeFileSync(path.join(dir, 'old.html'), '<meta name="ww-build" content="1"><script>s.src="/js/c.js"</script>');
    const r = versionDist(dir, ID, (rel) => rel !== '/old.html');
    assert.deepEqual(r.problems, []);
    assert.equal(r.stale.length, 2, r.stale.join());
    assert.ok(fs.readFileSync(path.join(dir, 'page.html'), 'utf8').includes('/js/a.js?v=' + ID));
    assert.ok(fs.readFileSync(path.join(dir, 'js', 'a.js'), 'utf8').includes("./b.js?v=" + ID));
    assert.throws(() => versionDist(dir, 'abc'), /rakam/);
  });
});

describe('asset-version: sources keep no hand-written versions', () => {
  function walk(d, exts) {
    return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const f = path.join(d, e.name);
      return e.isDirectory() ? walk(f, exts) : exts.includes(path.extname(f)) ? [f] : [];
    });
  }
  it('no ?v=<number> on local JS/CSS in src/ or public/ (the build writes the single build ID)', () => {
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
