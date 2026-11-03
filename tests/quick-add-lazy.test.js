// Hızlı Ekle gecikmeli yükleme (perf 2a): sayfalar yalnızca quick-add-boot.js yükler; asıl modül ilk açılışta iner
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const PAGES = ['dashboard', 'analytics', 'calendar', 'strategies', 'trades'];
const HEAVY = ['broker-dictionary', 'broker-detector', 'fill-pairing', 'parser-v2', 'quick-modal-i18n', 'quick-add'];
const boot = fs.readFileSync('public/interface/quick-add/js/quick-add-boot.js', 'utf8');
const qa = fs.readFileSync('public/interface/quick-add/js/quick-add.js', 'utf8');

describe('quick-add lazy loading', () => {
  it('pages load only the boot file, after the shared lazy loader', () => {
    const head = fs.readFileSync('src/components/BaseHead.astro', 'utf8');
    assert.match(head, /<script src="\/interface\/shared\/lazy-load\.js" is:inline defer><\/script>/);
    for (const p of PAGES) {
      const src = fs.readFileSync(`src/pages/${p}.astro`, 'utf8');
      for (const f of HEAVY) assert.ok(!src.includes(`/interface/quick-add/js/${f}.js"`), `${p}: ${f}.js is loaded eagerly`);
      assert.ok(src.includes('/interface/quick-add/js/quick-add-boot.js'), `${p}: boot missing`);
      assert.ok(src.includes('/interface/quick-add/css/quick-add.css'), `${p}: FAB/modal CSS must stay eager`);
    }
  });

  it('the boot file lists every module in dependency order, all with the build token', () => {
    const files = [...boot.matchAll(/'(\/interface\/quick-add\/js\/([a-z0-9-]+)\.js)\?v=__WW_BUILD_ID__'/g)];
    assert.deepEqual(files.map((m) => m[2]), HEAVY);
    for (const m of files) assert.ok(fs.existsSync('public' + m[1]), m[1]);
  });

  it('the FAB looks exactly like the one quick-add.js used to create', () => {
    const plus = qa.match(/plus: '([^']+)'/)[1];
    assert.ok(boot.includes("var PLUS_ICON = '" + plus + "'"));
    for (const s of ["fab.id = 'quick-add-fab'", "fab.className = 'quick-add-fab'", "fab.setAttribute('aria-label', 'Add Trade')", "fab.title = 'Add Trade'"]) {
      assert.ok(boot.includes(s), s);
    }
  });

  it('page-load theme code moved to the boot file (runs once, not twice)', () => {
    assert.ok(boot.includes('(function initQuickAddTheme()') && boot.includes('(function listenQuickAddThemeChanges()'));
    assert.ok(!qa.includes('(function initQuickAddTheme()') && !qa.includes('(function listenQuickAddThemeChanges()'));
    assert.ok(qa.includes('window.quickAddInit = function() { initQuickAdd(); };'));
  });

  it('quickAddOpen is a lazy proxy that loads once, inits, then opens; real quick-add.js replaces it', async () => {
    const loaded = [];
    let initCalls = 0, opened = 0;
    const win = {};
    const ctx = {
      window: win,
      document: { readyState: 'complete', getElementById: () => null, createElement: () => ({}), body: { classList: { add() {}, remove() {}, toggle() {} }, style: {} }, documentElement: { style: { setProperty() {} } }, addEventListener() {} },
      localStorage: { getItem: () => null },
      setTimeout: () => 0,
      alert: () => {},
    };
    Object.assign(win, ctx, {
      addEventListener() {},
      WwLazy: {
        loadScriptsInOrder: (urls) => { loaded.push(urls); return Promise.resolve().then(() => {
          win.quickAddOpen = () => { opened++; };
          win.quickAddInit = () => { initCalls++; };
        }); },
        busy: (el, p) => p,
      },
    });
    vm.runInNewContext(boot.replace(/\}\)\(window\);\s*$/, '})(window);'), Object.assign(ctx, { window: win }));
    assert.equal(win.quickAddOpen.__wwLazy, true);
    const a = win.quickAddOpen();
    const b = win.quickAddOpen();
    await Promise.all([a, b]);
    assert.equal(loaded.length, 1, 'one load for concurrent calls');
    assert.equal(initCalls, 1);
    assert.equal(opened, 2, 'both callers get the modal opened');
  });

  it('navbar treats the lazy proxy as ready (opens Quick Add instead of going to /add-trade)', () => {
    const nav = fs.readFileSync('public/components/navbar/navbar.js', 'utf8');
    assert.match(nav, /if \(!open\.__wwLazy && !document\.getElementById\('quick-add-overlay'\)\) return false;/);
  });
});

describe('xlsx stays on demand (perf 2d, reference pattern)', () => {
  it('no page loads SheetJS; quick-add loads it only inside loadXLSX(), once, for .xlsx/.xls files', () => {
    for (const p of fs.readdirSync('src/pages')) assert.ok(!fs.readFileSync('src/pages/' + p, 'utf8').includes('xlsx.full.min.js'), p);
    const loader = qa.slice(qa.indexOf('function loadXLSX()'), qa.indexOf('async function fileToCsvText'));
    assert.match(loader, /if \(typeof XLSX !== 'undefined'\) return Promise\.resolve\(\);/);
    assert.match(loader, /if \(_xlsxLoading\) return _xlsxLoading;/);
    assert.equal((qa.match(/xlsx\.full\.min\.js/g) || []).length, 1);
    assert.match(qa, /if \(lowerName\.endsWith\('\.xlsx'\) \|\| lowerName\.endsWith\('\.xls'\)\) \{\s*await loadXLSX\(\);/);
  });
});
