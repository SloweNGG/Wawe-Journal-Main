// Sayfaların büyük satır içi script'leri ayrı dosyalarda (perf: HTML küçülür; kod küçültülür ve ?v=<içerik hash'i> ile
// kalıcı önbelleğe girer). Her dosya bloğun eski yerinde engelleyici (defer/async YOK) <script src> ile yüklenir,
// SPA sayfalarında data-page-script ŞART (router her girişte yeniden çalıştırır). SpaRouter bu dosyaları boşta /
// link üzerine gelince önceden çeker (src/scripts/spa-warm.js).
// Runner: node --test tests/*.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { lowDataMode, pageScriptsToWarm, isPageBlockScript } from '../src/scripts/spa-warm.js';

const read = (p) => fs.readFileSync(p, 'utf8');

// sayfa, yayın yolu, SPA sayfası mı, eskiden satır içi bloğun ilk kod satırı (artık yalnızca dosyada olmalı)
const PAGES = [
  ['journals', '/interface/journals/js/journals-page.js', true, 'var JOURNALS_PAGE = window.wwPage.current();'],
  ['dashboard', '/interface/dashboard/js/dashboard-page.js', true, 'var DASH_PAGE = window.wwPage.current();'],
  ['add-trade', '/interface/add-trade/js/add-trade-page.js', true, "if (typeof INSTRUMENT_MULTIPLIERS === 'undefined') {"],
  ['report-bug', '/interface/report-bug/js/report-bug-page.js', true, 'function escapeHtml(str) {'],
  ['my-earnings', '/interface/my-earnings/js/my-earnings-page.js', true, 'var EARNINGS_STATE = {'],
  ['analytics', '/interface/analytics/js/analytics-page.js', true, 'var PRO_BANNER_PAGE = window.wwPage.current();'],
  ['ctrader-callback', '/interface/ctrader-callback/js/ctrader-callback-page.js', false, '(async function initCallback() {'],
  ['index', '/interface/landing/js/landing-page.js', false, 'function waitForDeps(cb, maxMs) {'],
];

const router = read('src/components/SpaRouter.astro');
const SPA_PATHS = JSON.parse(router.match(/const SPA_PATHS = (\[[^\]]+\])/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));

describe('page scripts moved out of the HTML', () => {
  it('each page loads its script once, blocking, with data-page-script exactly on SPA pages', () => {
    for (const [page, pub, spa] of PAGES) {
      const src = read(`src/pages/${page}.astro`);
      const tags = [...src.matchAll(/<script\b([^>]*)>\s*<\/script>/g)].filter((m) => m[1].includes(`src="${pub}"`));
      assert.equal(tags.length, 1, page + ': one tag for ' + pub);
      const attrs = tags[0][1];
      assert.match(attrs, /\sis:inline\b/, page + ': is:inline (Astro must not bundle it)');
      assert.ok(!/\s(defer|async)\b|type=/.test(attrs), page + ': must stay a blocking classic script (same order as the inline block)');
      assert.equal(/\sdata-page-script\b/.test(attrs), spa, page + ': data-page-script');
      assert.equal(SPA_PATHS.includes('/' + page), spa, page + ': SPA flag matches SpaRouter SPA_PATHS');
    }
  });

  it('the code lives only in the external file, under an immutable folder', () => {
    for (const [page, pub, , first] of PAGES) {
      assert.ok(pub.startsWith('/interface/'), pub + ': /interface/* is immutable in public/_headers');
      const code = read('public' + pub);
      assert.ok(code.includes(first), pub + ': moved code');
      assert.ok(!read(`src/pages/${page}.astro`).includes(first), page + ': inline copy left behind');
    }
  });

  it('the files are classic scripts that can run twice in one document (no top-level const/let/class)', () => {
    for (const [, pub] of PAGES) {
      const code = read('public' + pub);
      // Sınıf script olarak derlenmeli (import/export olsa burada SyntaxError)
      new vm.Script(code, { filename: pub });
      // İkinci çalıştırmada üst seviye let/const/class "already declared" verir. Script'in başına konan `throw 0`
      // kodu çalıştırmaz; tanımlar (GlobalDeclarationInstantiation) yine de yapılır.
      const ctx = vm.createContext({});
      const script = new vm.Script('throw 0;\n' + code, { filename: pub });
      for (let run = 0; run < 2; run++) {
        try {
          script.runInContext(ctx);
          assert.fail(pub + ': expected the guard throw');
        } catch (err) {
          assert.equal(err, 0, pub + ' run ' + (run + 1) + ': ' + (err && err.message));
        }
      }
    }
  });

  it('full load: code that needs bundle.js / i18n.js (both defer) waits for DOMContentLoaded', () => {
    // Bu dosyalar engelleyici: tam yüklemede defer/modül script'lerden ÖNCE çalışırlar. requireAuth (bundle.js) ve
    // window.i18n (i18n.js) o an yok; üst seviyede kullanılırsa sessizce atlanır (add-trade'de kaydet bozuluyordu).
    const reg = (fn) => new RegExp("if \\(document\\.readyState === 'loading'\\) document\\.addEventListener\\('DOMContentLoaded', " + fn + "\\);\\s*else " + fn + "\\(\\);");
    const inFn = (code, fn, needle) => {
      const start = code.indexOf('function ' + fn + '() {');
      assert.ok(start >= 0, fn);
      const at = code.indexOf(needle);
      assert.ok(at > start && at < code.search(reg(fn)), needle + ' runs inside ' + fn);
      assert.equal(code.split(needle).length - 1, 1, needle + ' appears once');
    };
    const add = read('public/interface/add-trade/js/add-trade-page.js');
    assert.match(add, reg('initAddTradePage'));
    inFn(add, 'initAddTradePage', 'currentUser = await requireAuth();');
    const dash = read('public/interface/dashboard/js/dashboard-page.js');
    assert.match(dash, reg('bindDashboardI18n'));
    inFn(dash, 'bindDashboardI18n', 'DASH_PAGE.onI18nChange(');
    const an = read('public/interface/analytics/js/analytics-page.js');
    assert.match(an, reg('bindProBannerI18n'));
    inFn(an, 'bindProBannerI18n', 'PRO_BANNER_PAGE.onI18nChange(');
  });

  it('the small pre-paint scripts stay inline', () => {
    const journals = read('src/pages/journals.astro');
    assert.match(journals, /<script is:inline>[\s\S]{0,4000}?<\/script>/, 'journals skeleton block');
    assert.ok(journals.indexOf('<script is:inline>') < journals.indexOf('journals-page.js'));
  });
});

describe('spa-warm: which page scripts are fetched ahead of time', () => {
  const base = 'https://wawejournal.com/dashboard';

  it('only same-origin, versioned scripts; resolved, de-duplicated', () => {
    const got = pageScriptsToWarm(
      [
        '/interface/journals/js/journals-page.js?v=0123456789',
        '/interface/journals/js/journals-page.js?v=0123456789',
        'https://cdn.jsdelivr.net/npm/x@1/x.js?v=1',
        '/interface/dashboard/js/dashboard.js',
        'interface/report-bug/js/report-bug-page.js?v=abcdefabcd',
        null,
        '',
      ],
      { base }
    );
    assert.deepEqual(got, [
      'https://wawejournal.com/interface/journals/js/journals-page.js?v=0123456789',
      'https://wawejournal.com/interface/report-bug/js/report-bug-page.js?v=abcdefabcd',
    ]);
  });

  it('skips scripts already in the document or already warmed', () => {
    const a = 'https://wawejournal.com/interface/a.js?v=1111111111';
    const b = 'https://wawejournal.com/interface/b.js?v=2222222222';
    const c = 'https://wawejournal.com/interface/c.js?v=3333333333';
    const got = pageScriptsToWarm(['/interface/a.js?v=1111111111', '/interface/b.js?v=2222222222', '/interface/c.js?v=3333333333'], {
      base,
      loaded: new Set([a]),
      warmed: new Set([b]),
    });
    assert.deepEqual(got, [c]);
    // aynı dosyanın yeni sürümü (başka ?v=) yeniden çekilir
    assert.deepEqual(pageScriptsToWarm(['/interface/a.js?v=9999999999'], { base, loaded: new Set([a]) }), [
      'https://wawejournal.com/interface/a.js?v=9999999999',
    ]);
  });

  it('nothing in data-saver / 2g mode or with a bad base', () => {
    assert.deepEqual(pageScriptsToWarm(['/interface/a.js?v=1111111111'], { base, lowData: true }), []);
    assert.deepEqual(pageScriptsToWarm(['/interface/a.js?v=1111111111'], { base: 'not a url' }), []);
    assert.equal(lowDataMode(undefined), false);
    assert.equal(lowDataMode({}), false);
    assert.equal(lowDataMode({ connection: { saveData: false, effectiveType: '4g' } }), false);
    assert.equal(lowDataMode({ connection: { saveData: true, effectiveType: '4g' } }), true);
    assert.equal(lowDataMode({ connection: { effectiveType: '2g' } }), true);
    assert.equal(lowDataMode({ connection: { effectiveType: 'slow-2g' } }), true);
    assert.equal(lowDataMode({ connection: { effectiveType: '3g' } }), false);
  });

  it('idle warming only takes the moved *-page.js blocks; hover takes every page script', () => {
    const srcs = ['/interface/journals/js/journals-page.js?v=1111111111', '/interface/backtest/js/backtest.js?v=2222222222'];
    assert.deepEqual(pageScriptsToWarm(srcs, { base, onlyPageBlocks: true }), ['https://wawejournal.com/interface/journals/js/journals-page.js?v=1111111111']);
    assert.equal(pageScriptsToWarm(srcs, { base }).length, 2);
    assert.equal(isPageBlockScript('/interface/x/js/dashboard-page.js?v=1'), true);
    assert.equal(isPageBlockScript('/interface/dashboard/js/dashboard.js?v=1'), false);
    assert.equal(isPageBlockScript('/interface/x/js/page.js'), false);
  });

  it('SpaRouter warms page scripts on idle (navbar pages) and on hover (wwSpa.prefetch)', () => {
    assert.match(router, /import \{ isPageBlockScript, lowDataMode, pageScriptsToWarm \} from '\.\.\/scripts\/spa-warm\.js';/);
    assert.match(router, /querySelectorAll\('script\[src\]\[data-page-script\]'\)/);
    assert.match(router, /onlyPageBlocks: !allScripts/);
    assert.match(router, /function warmNavLinks\(\) \{[\s\S]*?warmPage\(a\.href, false\);[\s\S]*?\n {4}\}/);
    assert.match(router, /prefetch: \(href: string\) => warmPage\(href, true\),/);
    // Geçişteki asıl yükleme kuralı değişmedi: data-page-script her girişte çalışır
    assert.match(router, /if \(s\.src\) return s\.hasAttribute\('data-page-script'\) \|\| !isActive\(s\.src\);/);
  });

  it('SPA entry: a moved *-page.js runs inline and only if the navigation was not left while it downloaded', () => {
    // Eskiden satır içi blok eklendiği anda çalışırdı. <script src> DOM'dan kaldırılsa da inince çalışır; kullanıcı
    // o arada başka sayfaya geçerse kod yeni sayfada çalışırdı (ör. journals-page.js window.loadTrades'i ezerdi).
    assert.match(router, /if \(src && signal && old\.type !== 'module' && old\.hasAttribute\('data-page-script'\) && isPageBlockScript\(src\)\) \{\s*return executePageBlock\(old, src, signal\);/);
    const fn = router.match(/async function executePageBlock\([\s\S]*?\n {4}\}\n/)[0];
    assert.match(fn, /await fetch\(src, \{ credentials: 'same-origin', signal \}\)/);
    assert.match(fn, /if \(signal\.aborted \|\| !old\.isConnected\) return;/);
    assert.ok(fn.indexOf('signal.aborted') < fn.indexOf('old.replaceWith(s)'), 'abort check before insert');
    assert.match(fn, /if \(text === null\) return execute\(old\);/, 'fetch failed: falls back to <script src>');
    assert.match(fn, /s\.textContent = text \+ '\\n\/\/# sourceURL=' \+/);
    // Geçiş iptal edilince çekme de iptal; her iki döngü ve async script'ler sinyali taşır
    assert.match(router, /abortRun = \(\) => \{\s*aborted = true;\s*ctrl\.abort\(\);/);
    assert.equal((router.match(/await Promise\.race\(\[execute\(s, ctrl\.signal\), abortSignal\]\);/g) || []).length, 2);
    assert.match(router, /toRun\.filter\(isAsync\)\.forEach\(\(s\) => execute\(s, ctrl\.signal\)\);/);
    assert.ok(!/\.forEach\(execute\)/.test(router), 'forEach would pass the index as the signal');
  });
});
