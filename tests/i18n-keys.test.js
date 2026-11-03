// TR / EN / DE carry exactly the same keys in the main dictionary (public/i18n/locales) and in the Quick Add dictionary
// (quick-modal-i18n.js): a key missing in one language shows the raw key or another language's text on that page
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const LANGS = ['tr', 'en', 'de'];
const main = {};
for (const l of LANGS) main[l] = (await import(pathToFileURL(path.resolve(`public/i18n/locales/${l}.js`)).href)).default;

// quick-modal-i18n.js is a classic script: the `quickTranslations` literal is evaluated on its own
const src = fs.readFileSync('public/interface/quick-add/js/quick-modal-i18n.js', 'utf8');
const start = src.indexOf('{', src.indexOf('const quickTranslations ='));
const end = src.lastIndexOf('};', src.indexOf('class QuickI18n'));
const quick = vm.runInNewContext('(' + src.slice(start, end + 1) + ')');

function sameKeys(dict, name) {
  const keys = (l) => Object.keys(dict[l]).filter((k) => typeof dict[l][k] === 'string');
  for (const a of LANGS) {
    for (const b of LANGS) {
      if (a === b) continue;
      const missing = keys(b).filter((k) => !(k in dict[a]));
      assert.deepEqual(missing, [], `${name}: ${missing.length} key(s) in ${b} but missing in ${a}: ${missing.join(', ')}`);
    }
  }
  for (const l of LANGS) for (const k of keys(l)) assert.ok(dict[l][k].trim().length > 0, `${name}: ${l} ${k} is empty`);
}

describe('i18n-keys', () => {
  it('the main dictionary has the same keys in TR / EN / DE', () => {
    assert.ok(Object.keys(main.tr).length > 1000);
    sameKeys(main, 'locales');
  });
  it('the Quick Add dictionary has the same keys in TR / EN / DE', () => {
    assert.ok(Object.keys(quick.tr).length > 100);
    sameKeys(quick, 'quick-modal-i18n');
  });
});
