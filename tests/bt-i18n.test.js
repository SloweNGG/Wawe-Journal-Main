// Backtest v2: locale files stay valid and complete (a syntax error in a locale breaks i18n on every page)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const LANGS = ['tr', 'en', 'de'];
const loc = {};
for (const l of LANGS) loc[l] = (await import(pathToFileURL(path.resolve(`public/i18n/locales/${l}.js`)).href)).default;
const keysOf = (l) => Object.keys(loc[l]).filter((k) => k.startsWith('backtest.') || k === 'nav.backtest').sort();

describe('bt-i18n', () => {
  it('the three locales load and have the same backtest keys', () => {
    assert.ok(keysOf('tr').length > 100);
    assert.deepEqual(keysOf('en'), keysOf('tr')); assert.deepEqual(keysOf('de'), keysOf('tr'));
  });
  it('no empty values; the same {placeholders} in every language', () => {
    const ph = (s) => (String(s).match(/\{[a-z0-9_]+\}/gi) || []).sort().join(',');
    for (const k of keysOf('tr')) {
      for (const l of LANGS) assert.ok(String(loc[l][k]).trim().length > 0, `${l} ${k} is empty`);
      assert.equal(ph(loc.en[k]), ph(loc.tr[k]), `placeholders differ in en for ${k}`);
      assert.equal(ph(loc.de[k]), ph(loc.tr[k]), `placeholders differ in de for ${k}`);
    }
  });
  it('every key used by the page and the controller exists', () => {
    const src = fs.readFileSync('src/pages/backtest.astro', 'utf8') + fs.readFileSync('public/interface/backtest/js/backtest.js', 'utf8');
    const used = new Set();
    for (const m of src.matchAll(/(?:data-i18n(?:-placeholder|-title)?="|_t\(')((?:backtest|nav|common)\.[a-z0-9_.]+)/g)) if (!m[1].endsWith('.')) used.add(m[1]);   // dynamic keys (backtest.group.<id>) are checked below
    assert.ok(used.size > 100);
    for (const k of used) for (const l of LANGS) assert.ok(k in loc[l], `${k} missing in ${l}`);
    for (const g of ['forex', 'gold', 'crypto']) for (const l of LANGS) assert.ok(`backtest.group.${g}` in loc[l]);
  });
  it('the new modules (layout, look, drawings, stats, charts) only use existing keys', async () => {
    const files = fs.readdirSync('public/interface/backtest/js').filter((f) => /^bt-(layout|look|draw|stats|multi)/.test(f));
    const used = new Set();
    for (const f of files) {
      const src = fs.readFileSync('public/interface/backtest/js/' + f, 'utf8');
      for (const m of src.matchAll(/\bt\('((?:backtest|common)\.[a-z0-9_.]+)'/g)) if (!/[._]$/.test(m[1])) used.add(m[1]);   // dynamic prefixes are listed below
    }
    await import('../public/interface/backtest/js/bt-layout.js');
    await import('../public/interface/backtest/js/bt-look.js');
    for (const s of globalThis.WwBtLayout.SHORTCUTS) used.add('backtest.keys.' + s.id);
    const LK = globalThis.WwBtLook;
    for (const id of LK.STYLES) used.add('backtest.look.style_' + id);
    for (const id of LK.COLOR_KEYS) used.add('backtest.look.color_' + id);
    for (const id of LK.SWITCHES) used.add('backtest.look.' + id);
    for (const id of LK.PRESET_IDS) used.add('backtest.look.preset.' + id);
    await import('../public/interface/backtest/js/bt-draw.js');
    for (const id of globalThis.WwBtDraw.TOOLS) used.add('backtest.draw.tool_' + id);
    for (const k of used) for (const l of LANGS) assert.ok(k in loc[l], `${k} missing in ${l}`);
  });
  it('no lock icon anywhere in the page (owner preference)', () => {
    const src = fs.readFileSync('src/pages/backtest.astro', 'utf8') + fs.readFileSync('public/interface/backtest/js/backtest.js', 'utf8');
    assert.ok(!/data-lucide="(lock|shield-lock|key)"/.test(src));
  });
  it('practice mode: synthetic label and source choice exist, no admin gate left in the page', () => {
    const page = fs.readFileSync('src/pages/backtest.astro', 'utf8');
    const ctl = fs.readFileSync('public/interface/backtest/js/backtest.js', 'utf8');
    assert.match(page, /id="bt-f-source-synthetic"[^>]*checked/);
    assert.match(page, /id="bt-f-source-ctrader"[^>]*disabled/, 'cTrader option starts disabled; the controller enables it for users with a connected cTrader account');
    assert.ok(!/backtest\.source\.soon/.test(page + ctl), 'no "coming soon" chip any more');
    assert.match(page, /id="bt-f-source-connect-link"[^>]*href="\/journals"/, 'not connected: link to connect the cTrader account');
    assert.match(page, /id="bt-f-ct-account"/); assert.match(page, /id="bt-f-ct-symbol"/); assert.match(page, /id="bt-f-ct-depth"/);
    assert.match(page, /id="bt-ctrader-needed"/, 'connection lost banner');
    assert.match(page, /bt-ctrader\.js/, 'cTrader source script is loaded');
    assert.match(ctl, /setSourceLabel\(acc\)/, 'chart source label is set per account');
    assert.match(ctl, /'cTrader · '/, 'label format: cTrader · broker name');
    assert.match(page, /id="bt-source-label"[^>]*data-i18n="backtest\.source\.synthetic"/, 'chart label');
    assert.match(ctl, /sourceBadge\(a\)/, 'account card label');
    assert.ok(!/bt-view-soon|'soon'|backtest\.gate\./.test(page + ctl), 'no "soon" gate for non-admins');
    assert.ok(!/storage|saved in this browser|bu tarayıcıda saklan/i.test(loc.tr['backtest.list_banner'] + loc.en['backtest.list_banner'] + loc.de['backtest.list_banner']), 'old browser-storage warning gone');
    for (const l of LANGS) for (const k of ['backtest.source.synthetic', 'backtest.source.option_synthetic', 'backtest.source.option_ctrader', 'backtest.list_banner']) {
      assert.ok(/./.test(loc[l][k]), `${l} ${k}`);
    }
    assert.match(loc.tr['backtest.source.synthetic'], /gerçek piyasa verisi değildir/);
  });
});
