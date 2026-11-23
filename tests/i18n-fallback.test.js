// i18n: İngilizce sözlük yalnızca aktif dil 'en' iken yüklenir (public/i18n.js); tr/de'de eksik kalan anahtarları
// derleme İngilizce değerleriyle doldurur (scripts/i18n-fill.mjs).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fillLocaleGaps, missingKeys, buildFilledModule, loadLocaleDict, FILL_LANGS } from '../scripts/i18n-fill.mjs';
import { minifyAssetCode } from '../scripts/minify-dist.mjs';

const URL_OF = (lang) => '/i18n/locales/' + lang + '.js?v=__WW_BUILD_ID__';

// public/i18n.js'i vm'de çalıştırır. Dinamik import yerine sahte yükleyici: istenen adresleri kaydeder.
function boot({ saved = null, dicts = {}, fail = [] } = {}) {
  let src = fs.readFileSync('public/i18n.js', 'utf8');
  const IMPORT = 'import(/* @vite-ignore */ url)';
  assert.ok(src.includes(IMPORT), 'i18n.js dinamik import satırı değişmiş; testi güncelleyin');
  src = src.replace(IMPORT, '__wwImport(url)');
  const requested = [];
  const ls = new Map(saved ? [['ww_language', saved]] : []);
  const attrs = new Map();
  const win = {
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)) },
    document: {
      readyState: 'complete',
      documentElement: { lang: '', getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null), setAttribute: (k, v) => attrs.set(k, v) },
      querySelectorAll: () => [],
      addEventListener() {},
    },
    __wwImport: (url) => {
      requested.push(url);
      const lang = Object.keys(dicts).find((l) => url === URL_OF(l));
      if (!lang || fail.includes(lang)) return Promise.reject(new Error('404 ' + url));
      return Promise.resolve({ default: dicts[lang] });
    },
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(src, win, { filename: 'i18n.js' });
  return { win, i18n: win.i18n, requested, ls };
}

const DICTS = {
  en: { 'a.only_en': 'English only', 'a.both': 'Both EN', 'nav.trades': 'Trades' },
  tr: { 'a.both': 'İkisi TR' },
  de: { 'a.both': 'Beide DE' },
};

describe('i18n.js: only the active language is loaded', () => {
  for (const lang of ['tr', 'de', 'en']) {
    it(`saved language ${lang} → requests only ${lang}.js`, async () => {
      const { win, requested } = boot({ saved: lang, dicts: DICTS });
      await win.i18nReady;
      assert.deepEqual(requested, [URL_OF(lang)]);
      assert.equal(win.i18n.isReady(), true);
    });
  }

  it('no saved language → English (default) only', async () => {
    const { win, requested, ls } = boot({ dicts: DICTS });
    await win.i18nReady;
    assert.deepEqual(requested, [URL_OF('en')]);
    assert.equal(ls.get('ww_language'), 'en');
  });

  it('falls back to en.js only when the active language fails to load', async () => {
    const { win, requested } = boot({ saved: 'tr', dicts: DICTS, fail: ['tr'] });
    await win.i18nReady;
    assert.deepEqual(requested, [URL_OF('tr'), URL_OF('en')]);
    assert.equal(win.i18n.t('a.both'), 'Both EN');
  });
});

describe('i18n.js: t() fallback order is unchanged', () => {
  it('active dict → en (if loaded) → critical fallback → key', async () => {
    const { win, i18n } = boot({ saved: 'tr', dicts: DICTS });
    await win.i18nReady;
    assert.equal(i18n.t('a.both'), 'İkisi TR');
    assert.equal(i18n.t('nav.trades'), 'İşlemler'); // kritik tr sözlüğü
    assert.equal(i18n.t('a.only_en'), 'a.only_en'); // en yüklü değil → anahtar
    assert.equal(i18n.t('missing.everywhere'), 'missing.everywhere');
    await i18n.loadLanguage('en'); // ör. settings.js dil değiştirirken önce yükler
    assert.equal(i18n.getCurrentLanguage(), 'tr');
    assert.equal(i18n.t('a.both'), 'İkisi TR'); // aktif sözlük hâlâ önce
    assert.equal(i18n.t('a.only_en'), 'English only');
  });

  it('setLanguage loads a missing language on demand', async () => {
    const { win, i18n, requested } = boot({ saved: 'tr', dicts: DICTS });
    await win.i18nReady;
    assert.equal(await i18n.setLanguage('de'), true);
    assert.equal(i18n.t('a.both'), 'Beide DE');
    assert.equal(await i18n.setLanguage('en'), true);
    assert.equal(i18n.t('a.only_en'), 'English only');
    assert.deepEqual(requested, [URL_OF('tr'), URL_OF('de'), URL_OF('en')]);
  });
});

function tmpLocales(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-i18n-fill-'));
  const src = path.join(root, 'src');
  const dist = path.join(root, 'dist');
  fs.mkdirSync(src);
  fs.mkdirSync(dist);
  for (const [lang, obj] of Object.entries(files)) {
    const text = '// ' + lang + '\nexport default ' + JSON.stringify(obj, null, 2) + ';\n';
    fs.writeFileSync(path.join(src, lang + '.js'), text);
    fs.writeFileSync(path.join(dist, lang + '.js'), minifyAssetCode(text, 'js'));
  }
  return { root, src, dist };
}

describe('i18n-fill: build step fills keys missing in tr/de with English', () => {
  it('missingKeys: absent or empty in the language, non-empty in en', () => {
    const en = { a: 'A', b: 'B', c: 'C', d: '', e: ['x'] };
    assert.deepEqual(missingKeys(en, { a: 'a', c: '' }), ['b', 'c', 'e']);
    assert.deepEqual(missingKeys(en, { a: 'a', b: 'b', c: 'c', e: ['y'] }), []);
  });

  it('leaves dist files byte-identical when nothing is missing', async () => {
    const t = tmpLocales({ en: { a: 'A', b: 'B' }, tr: { a: 'Â', b: 'Ş', extra: 'x' }, de: { a: 'Ä', b: 'ß' } });
    try {
      const before = FILL_LANGS.map((l) => fs.readFileSync(path.join(t.dist, l + '.js')));
      const r = await fillLocaleGaps({ sourceDir: t.src, distDir: t.dist });
      assert.deepEqual(r.filled, { tr: [], de: [] });
      assert.deepEqual(r.warnings, []);
      FILL_LANGS.forEach((l, i) => assert.ok(before[i].equals(fs.readFileSync(path.join(t.dist, l + '.js'))), l + ' değişti'));
    } finally {
      fs.rmSync(t.root, { recursive: true, force: true });
    }
  });

  it('injects missing en values into dist tr.js/de.js and keeps existing translations', async () => {
    const t = tmpLocales({
      en: { a: 'A', 'new.key': 'New text {n}', quotes: ['q1', 'q2'], 'x.y': 'XY' },
      tr: { a: 'Ağaç', quotes: ['s1'], 'x.y': '' },
      de: { a: 'Ä', 'new.key': 'Neu {n}', quotes: ['z'], 'x.y': 'XY de' },
    });
    try {
      const deBefore = fs.readFileSync(path.join(t.dist, 'de.js'));
      const r = await fillLocaleGaps({ sourceDir: t.src, distDir: t.dist });
      assert.deepEqual(r.filled, { tr: ['new.key', 'x.y'], de: [] });
      assert.equal(r.warnings.length, 1);
      assert.match(r.warnings[0], /tr\.js: .* 2 anahtar .*new\.key, x\.y/);
      const tr = await loadLocaleDict(path.join(t.dist, 'tr.js'));
      assert.deepEqual(tr, { a: 'Ağaç', quotes: ['s1'], 'x.y': 'XY', 'new.key': 'New text {n}' });
      assert.ok(deBefore.equals(fs.readFileSync(path.join(t.dist, 'de.js'))));
      // küçültülmüş, UTF-8, tek bir default export
      const text = fs.readFileSync(path.join(t.dist, 'tr.js'), 'utf8');
      assert.match(text, /^export default\{/);
      assert.ok(text.includes('Ağaç'));
    } finally {
      fs.rmSync(t.root, { recursive: true, force: true });
    }
  });

  it('buildFilledModule output is a valid module with the merged dictionary', async () => {
    const code = buildFilledModule({ b: 'B', 'a.b': 'çğ' }, { z: 'Z', '__weird"key': 'q"\n' }, ['z', '__weird"key']);
    const mod = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
    assert.deepEqual(mod.default, { b: 'B', 'a.b': 'çğ', z: 'Z', '__weird"key': 'q"\n' });
  });
});

describe('i18n parity report (informative; the build fills gaps, so this never fails)', () => {
  it('lists en keys missing in tr/de', async (t) => {
    const dir = path.resolve('public/i18n/locales');
    const en = await loadLocaleDict(path.join(dir, 'en.js'));
    for (const lang of FILL_LANGS) {
      const keys = missingKeys(en, await loadLocaleDict(path.join(dir, lang + '.js')));
      t.diagnostic(
        `${lang}: ${keys.length} en anahtarı eksik` +
          (keys.length ? ' (derleme İngilizce değerle dolduracak): ' + keys.slice(0, 20).join(', ') : '')
      );
    }
  });
});
