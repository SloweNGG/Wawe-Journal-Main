// TR / EN / DE carry exactly the same keys in the main dictionary (public/i18n/locales) and in the Quick Add dictionary
// (quick-modal-i18n.js): a key missing in one language shows the raw key or another language's text on that page.
// Every constant key the code looks up (t('…') / data-i18n="…") must also exist in its dictionary: a key missing in all
// languages would pass the parity check but still show the raw key (or a hardcoded Turkish fallback) to everyone.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const LANGS = ['tr', 'en', 'de'];
const main = {};
for (const l of LANGS) main[l] = (await import(pathToFileURL(path.resolve(`public/i18n/locales/${l}.js`)).href)).default;

// quick-modal-i18n.js, index-i18n.js and auth-i18n.js are classic scripts: their dictionary literal is evaluated on its own
function literalAfter(file, marker) {
  const s = fs.readFileSync(file, 'utf8');
  let i = s.indexOf('{', s.indexOf(marker)), depth = 0, k = i;
  for (; k < s.length; k++) {
    const c = s[k];
    if (c === '{') depth++;
    else if (c === '}') { if (!--depth) break; }
    else if (c === '"' || c === "'" || c === '`') { for (k++; s[k] !== c; k++) if (s[k] === '\\') k++; }
    else if (c === '/' && s[k + 1] === '/') k = s.indexOf('\n', k);
  }
  return vm.runInNewContext('(' + s.slice(i, k + 1) + ')');
}
const flatten = (o, prefix = '', out = {}) => {
  for (const [k, v] of Object.entries(o || {})) {
    const key = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out); else out[key] = v;
  }
  return out;
};
const perLang = (o) => Object.fromEntries(Object.entries(o).map(([l, v]) => [l, flatten(v)]));
const quick = literalAfter('public/interface/quick-add/js/quick-modal-i18n.js', 'const quickTranslations =');
const landing = perLang(literalAfter('public/index-i18n.js', 'const translations ='));
const auth = perLang(literalAfter('public/auth-i18n.js', 'var translations ='));

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

// ---- constant keys used in the code ----
function sourceFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && p !== path.join('public', 'i18n', 'locales')) sourceFiles(p, out); }
    else if (/\.(astro|html|m?js)$/.test(e.name) && e.name !== 'bundle.js') out.push(p.split(path.sep).join('/'));
  }
  return out;
}
const KEY = '([a-z][\\w-]*(?:\\.[\\w-]+)+)';
// a quoted key followed by `+` is a prefix of a dynamic key ('backtest.group.' + id), as is one ending in . or _
const CALL = new RegExp("\\b(?:t|_t|calT|tt|qt|helperT|i18n\\.t|quickI18n\\.t|AuthI18n\\.t|translate)\\(\\s*(['\"])" + KEY + '\\1(?!\\s*\\+)', 'g');
const ATTR = { main: /data-i18n(?:-html|-placeholder|-title)?=(["'])([a-z][\w-]*(?:\.[\w-]+)+)\1/g,
  auth: /data-at(?:-html|-ph|-aria|-title)?=(["'])([a-z][\w-]*(?:\.[\w-]+)+)\1/g,
  quick: /data-quick-i18n(?:-[a-z]+)?=(["'])([a-z][\w-]*(?:\.[\w-]+)+)\1/g };
const AUTH_PAGE = /^src\/pages\/(login|register|forgot-password|update-password)\.astro$|^public\/auth-i18n\.js$/;
const LANDING_PAGE = /^src\/pages\/(index|about|contact|privacy|terms)\.astro$|^src\/layouts\/PageLayout\.astro$|^public\/index-i18n\.js$/;

function usedKeys() {
  const used = { main: new Map(), landing: new Map(), auth: new Map(), quick: new Map() };
  const add = (d, k, f) => { if (!used[d].has(k)) used[d].set(k, new Set()); used[d].get(k).add(f); };
  for (const f of [...sourceFiles('src'), ...sourceFiles('public')]) {
    const s = fs.readFileSync(f, 'utf8');
    const isLanding = LANDING_PAGE.test(f), isAuth = AUTH_PAGE.test(f), isQuick = f.startsWith('public/interface/quick-add/');
    for (const m of s.matchAll(ATTR.main)) add(m[2].startsWith('lp.') || isLanding ? 'landing' : 'main', m[2], f);
    for (const m of s.matchAll(ATTR.auth)) add('auth', m[2], f);
    for (const m of s.matchAll(ATTR.quick)) add('quick', m[2], f);
    for (const m of s.matchAll(CALL)) {
      const k = m[2];
      if (/[._]$/.test(k)) continue;
      if (/^(https?|www|ww_|wj_)/.test(k) || /\.(js|css|html|png|webp|svg|json)$/.test(k)) continue;   // not a translation key
      if (k.startsWith('lp.') || isLanding) add('landing', k, f);
      else if (k.startsWith('quickmodal.') || (isQuick && k in quick.en)) add('quick', k, f);
      else if (isAuth && k in auth.en) add('auth', k, f);
      else add('main', k, f);
    }
  }
  return used;
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
  it('every constant key used in the code exists in its dictionary', () => {
    const dicts = { main, landing, auth, quick };
    const used = usedKeys();
    assert.ok(used.main.size > 1000 && used.landing.size > 100 && used.auth.size > 30 && used.quick.size > 50);
    for (const [name, keys] of Object.entries(used)) {
      const d = dicts[name];
      const all = new Set(LANGS.flatMap((l) => Object.keys(d[l] || {})));
      // a key that is only the parent of nested keys (landing / auth objects) is not a lookup target either
      const missing = [...keys.keys()].filter((k) => !all.has(k) && ![...all].some((x) => x.startsWith(k + '.')));
      assert.deepEqual(missing.map((k) => k + ' (' + [...keys.get(k)].slice(0, 2).join(', ') + ')'), [], `${name}: ${missing.length} key(s) used in the code but in no language`);
    }
  });
});
