// Dist küçültme (scripts/minify-dist.mjs): JS/CSS dosyaları + HTML'deki satır içi klasik script'ler
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { minifyAssetCode, minifyInlineCode, minifyInlineScripts, minifyDist, parseAttrs, isInlineClassicScript } from '../scripts/minify-dist.mjs';
import { stampHtml, findUnversioned, TOKEN } from '../scripts/asset-version.mjs';

const ID = '1790000000000';

// Klasik script'in global'e bıraktığı adlar: var/function → global nesne, let/const/class → global sözcüksel kapsam
const TOP_LEVEL = `
// açıklama: küçültmede silinmeli
var PAGE_STATE = { count: 0 };
function onSaveClick(eventArgument) { var localValue = eventArgument + 1; PAGE_STATE.count += localValue; return localValue; }
function neverCalledFromScript() { return 'onclick="neverCalledFromScript()" ile çağrılır'; }
let lexicalCounter = 1;
const LEXICAL_LABEL = 'İşlemler ş ğ ı ö ü ç';
class WidgetThing { run() { return 42; } }
(function () { var hiddenInner = 5; window.exposedFromIife = function () { return hiddenInner; }; })();
`;

function globalsAfter(code) {
  const ctx = { window: null };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const names = ['PAGE_STATE', 'onSaveClick', 'neverCalledFromScript', 'lexicalCounter', 'LEXICAL_LABEL', 'WidgetThing', 'exposedFromIife'];
  return Object.fromEntries(names.map((n) => [n, vm.runInContext('typeof ' + n, ctx)]));
}

describe('minify-dist: inline classic scripts keep their global names', () => {
  it('does not rename or drop top-level var/function/let/const/class (onclick handlers rely on them)', () => {
    const { code, reason } = minifyInlineCode(TOP_LEVEL);
    assert.equal(reason, null);
    assert.ok(code.length < TOP_LEVEL.length);
    for (const name of ['PAGE_STATE', 'onSaveClick', 'neverCalledFromScript', 'lexicalCounter', 'LEXICAL_LABEL', 'WidgetThing', 'exposedFromIife']) {
      assert.ok(code.includes(name), name + ' kayboldu: ' + code);
    }
    // iç kapsamlar kısalır (küçültme gerçekten çalışıyor), yorumlar gider
    assert.ok(!code.includes('localValue') && !code.includes('hiddenInner') && !code.includes('eventArgument'));
    assert.ok(!code.includes('açıklama'));
    assert.deepEqual(globalsAfter(code), globalsAfter(TOP_LEVEL));
    // let/const türü korunur (SPA yeniden çalıştırmada davranış aynı kalsın)
    assert.match(code, /\blet lexicalCounter\b/);
    assert.match(code, /\bconst LEXICAL_LABEL\b/);
  });

  it('keeps non-ASCII characters as UTF-8 (charset utf8), not \\u escapes', () => {
    const { code } = minifyInlineCode(TOP_LEVEL);
    assert.ok(code.includes('İşlemler ş ğ ı ö ü ç'));
    assert.ok(!/\\u0130|\\u015F/.test(code));
  });

  it('is deterministic (SpaRouter matches head scripts by text; hashes depend on it)', () => {
    const a = minifyInlineScripts('<head><script>' + TOP_LEVEL + '</script></head>').html;
    const b = minifyInlineScripts('<head><script>' + TOP_LEVEL + '</script></head>', new Map()).html;
    assert.equal(a, b);
  });
});

describe('minify-dist: which scripts are touched', () => {
  it('minifies only inline classic scripts and keeps attributes, order and surrounding bytes', () => {
    const html =
      '<!doctype html><html><head>\n' +
      '<script>  var a = 1;   // yorum\n  var b = a + 1; </script>\n' +
      '<script type="text/javascript" data-auth-script>var c = 1 ; </script>\n' +
      '<script type="application/javascript" id="x" class=\'y\'>var d = 1 ; </script>\n' +
      '<script type="application/ld+json">{ "@context": "https://schema.org",  "name": "a" }</script>\n' +
      '<script type="application/json" id="data">{ "a":  1 }</script>\n' +
      '<script type="module">import x from "/a.js";   var  e  = 1;</script>\n' +
      '<script type="importmap">{ "imports": {  } }</script>\n' +
      '<script type="text/x-template"><div>  </div></script>\n' +
      '<script src="/x.js?v=1"></script><script src="/y.js" defer data-page-script>   </script>\n' +
      '<!-- <script>var  commented  = 1;</script> -->\n' +
      '<SCRIPT TYPE="TEXT/JAVASCRIPT">var  upper = 1 ;</SCRIPT>\n' +
      '</head><body><p>  metin  </p><script>\n\n</script></body></html>';
    const r = minifyInlineScripts(html);
    assert.equal(r.scripts, 4);
    assert.equal(r.minified, 4);
    assert.ok(r.html.includes('<script>var a=1,b=a+1;</script>'));
    assert.ok(r.html.includes('<script type="text/javascript" data-auth-script>var c=1;</script>'));
    assert.ok(r.html.includes('<script type="application/javascript" id="x" class=\'y\'>var d=1;</script>'));
    assert.ok(r.html.includes('<SCRIPT TYPE="TEXT/JAVASCRIPT">var upper=1;</SCRIPT>'));
    for (const untouched of [
      '{ "@context": "https://schema.org",  "name": "a" }',
      '{ "a":  1 }',
      'import x from "/a.js";   var  e  = 1;',
      '{ "imports": {  } }',
      '<div>  </div>',
      '<script src="/x.js?v=1"></script><script src="/y.js" defer data-page-script>   </script>',
      '<!-- <script>var  commented  = 1;</script> -->',
      '<p>  metin  </p><script>\n\n</script>',
    ]) {
      assert.ok(r.html.includes(untouched), 'değişmemeliydi: ' + untouched);
    }
    // script dışında hiçbir bayt değişmez
    const strip = (s) => s.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, '$1$2');
    assert.equal(strip(r.html), strip(html));
  });

  it('parses attributes (quoted, unquoted, valueless, > inside a value)', () => {
    const a = parseAttrs(' type="text/javascript" data-x=\'a>b\' defer id=main');
    assert.equal(a.get('type'), 'text/javascript');
    assert.equal(a.get('data-x'), 'a>b');
    assert.equal(a.get('defer'), '');
    assert.equal(a.get('id'), 'main');
    assert.equal(isInlineClassicScript(parseAttrs('')), true);
    assert.equal(isInlineClassicScript(parseAttrs(' type=""')), true);
    assert.equal(isInlineClassicScript(parseAttrs(' type=" Text/JavaScript "')), true);
    assert.equal(isInlineClassicScript(parseAttrs(' src="/a.js"')), false);
    assert.equal(isInlineClassicScript(parseAttrs(' type="module"')), false);
    assert.equal(isInlineClassicScript(parseAttrs(' type="application/ld+json"')), false);
    const r = minifyInlineScripts('<script data-x=\'a>b\'>var  q = 1;</script>');
    assert.equal(r.html, '<script data-x=\'a>b\'>var q=1;</script>');
  });
});

describe('minify-dist: safety fallbacks keep the original', () => {
  it('keeps the original on a syntax error', () => {
    const html = '<script>var a = ;  // bozuk</script>';
    const r = minifyInlineScripts(html);
    assert.equal(r.html, html);
    assert.equal(r.minified, 0);
    assert.match(r.kept[0].reason, /esbuild/);
  });

  it("keeps the original when the output would contain '<!--'", () => {
    const html = "<script>var  tpl = '<!-- x -->' ;</script>";
    const r = minifyInlineScripts(html);
    assert.equal(r.html, html);
    assert.match(r.kept[0].reason, /<!--/);
  });

  it("never emits '</script' (esbuild escapes it; folded strings stay safe)", () => {
    const r = minifyInlineScripts("<script>var  s = '</scr' + 'ipt>' ;  var t = '<\\/script>';</script>");
    assert.equal(r.minified, 1);
    assert.ok(!/<\/script/i.test(r.html.slice(8, -9)));
    assert.equal(r.html.match(/<\/script>/gi).length, 1);
  });

  it('keeps the original when minifying does not make it shorter', () => {
    const { code, reason } = minifyInlineCode('var a=1;');
    assert.equal(code, 'var a=1;');
    assert.match(reason, /küçülmedi/);
  });
});

describe('minify-dist: asset-version still stamps code-built URLs after minify', () => {
  it("resolves ?v=__WW_BUILD_ID__ even when quotes change from ' to \"", () => {
    const html =
      "<script>\n  var MC_URL = '/components/prop/prop-montecarlo.js?v=" + TOKEN + "';\n" +
      "  var FONT = '/fonts/pdf/A-' + w + '.ttf?v=" + TOKEN + "';\n</script>";
    const min = minifyInlineScripts(html).html;
    assert.ok(min.includes('"/components/prop/prop-montecarlo.js?v=' + TOKEN + '"'), min);
    const out = stampHtml(min, ID);
    assert.ok(out.includes('"/components/prop/prop-montecarlo.js?v=' + ID + '"'), out);
    assert.ok(out.includes('"/fonts/pdf/A-"+w+".ttf?v=' + ID + '"'), out);
    assert.deepEqual(findUnversioned(out, 'html', ID), []);
  });
});

describe('minify-dist: files', () => {
  it('minifies JS/CSS with charset utf8 (Turkish stays readable and smaller)', () => {
    const js = minifyAssetCode('export default {\n  "a": "işlem düşüş ğ İ",\n};\n', 'js');
    assert.ok(js.includes('işlem düşüş ğ İ'), js);
    assert.ok(!js.includes('\\u'));
    const css = minifyAssetCode('.a::after { content: "→ ş"; }\n', 'css');
    assert.ok(css.includes('"→ ş"'), css);
  });

  it('minifyDist processes files and inline scripts in a dist folder', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-minify-'));
    try {
      fs.mkdirSync(path.join(dir, 'sub'));
      fs.writeFileSync(path.join(dir, 'a.js'), 'var  longName = "ş";  // c\n');
      fs.writeFileSync(path.join(dir, 'b.css'), '.x {  color: red;  }\n');
      fs.writeFileSync(path.join(dir, 'sub', 'p.html'), '<script>var  x = 1 ;</script><script type="application/ld+json">{ "a": 1 }</script>');
      fs.writeFileSync(path.join(dir, 'q.html'), '<p>yok</p>');
      fs.writeFileSync(path.join(dir, 'bad.html'), '<script>var = ;</script>');
      const r = minifyDist(dir);
      assert.equal(fs.readFileSync(path.join(dir, 'a.js'), 'utf8'), 'var longName="ş";\n');
      assert.equal(fs.readFileSync(path.join(dir, 'b.css'), 'utf8'), '.x{color:red}\n');
      assert.equal(fs.readFileSync(path.join(dir, 'sub', 'p.html'), 'utf8'), '<script>var x=1;</script><script type="application/ld+json">{ "a": 1 }</script>');
      assert.equal(fs.readFileSync(path.join(dir, 'q.html'), 'utf8'), '<p>yok</p>');
      assert.equal(fs.readFileSync(path.join(dir, 'bad.html'), 'utf8'), '<script>var = ;</script>');
      assert.equal(r.files, 2);
      assert.equal(r.pages, 1);
      assert.equal(r.scripts, 2);
      assert.equal(r.minified, 1);
      assert.equal(r.warnings.length, 1);
      assert.match(r.warnings[0], /bad\.html/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('astro.config.mjs: build:done step order', () => {
  it('minify → i18n fill → asset-version (content hashes are computed from the final bytes)', () => {
    const cfg = fs.readFileSync('astro.config.mjs', 'utf8');
    const list = cfg.slice(cfg.indexOf('integrations: ['));
    const at = (name) => list.indexOf(name + '(');
    for (const n of ['minifyDistAssets', 'i18nFallbackFill', 'assetVersionIntegration', 'localizeIntegration']) assert.ok(at(n) > 0, n + ' listede yok');
    assert.ok(at('minifyDistAssets') < at('i18nFallbackFill'));
    assert.ok(at('i18nFallbackFill') < at('assetVersionIntegration'));
    assert.ok(at('assetVersionIntegration') < at('localizeIntegration'));
  });
});
