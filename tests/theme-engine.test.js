// Tema motoru (src/scripts/theme-engine.js): kayıt biçimi, vurgu tonları, varsayılanın birebir korunması, hazır temalar
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function load(initial = {}) {
  const ls = new Map(Object.entries(initial));
  const css = { text: '' };
  const classes = new Set();
  const win = {
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
    sessionStorage: { getItem: () => null, setItem() {} },
    addEventListener() {}, dispatchEvent() {}, CustomEvent: function () {}, setTimeout,
    getComputedStyle: () => ({ getPropertyValue: () => '' })
  };
  const styleEl = { id: 'ww-theme-vars', get textContent() { return css.text; }, set textContent(v) { css.text = v; } };
  let created = false;
  win.document = {
    documentElement: { style: { removeProperty() {} }, classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } },
    getElementById: () => (created ? styleEl : null),
    createElement: () => { created = true; return styleEl; },
    head: { appendChild() {} }, body: null, readyState: 'complete'
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(fs.readFileSync('src/scripts/theme-engine.js', 'utf8'), win);
  return { T: win.WWTheme, ls, css, classes };
}
const plain = (o) => JSON.parse(JSON.stringify(o));

describe('theme engine', () => {
  it('RAMP matches the BaseHead #ww-accent-defaults tokens one to one', () => {
    const { T } = load();
    const head = fs.readFileSync('src/components/BaseHead.astro', 'utf8');
    const block = head.match(/id="ww-accent-defaults">:root\{([^}]*)\}/)[1];
    for (const [name, hex] of T.RAMP) {
      assert.ok(block.includes(`--${name}:${hex};`), name);
      const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');
      assert.ok(block.includes(`--${name}-rgb:${rgb};`), name + '-rgb');
    }
    assert.equal((block.match(/--ac[\w-]*:/g) || []).length, T.RAMP.length * 2, 'no extra tokens');
  });

  it('nothing is written for the defaults (site looks exactly the same)', () => {
    const { T, css } = load();
    assert.deepEqual(plain(T.ramp(T.BASE)), {});
    assert.equal(T.cssFor(T.PRESETS.dark[0], 'dark'), '');
    assert.equal(T.cssFor(T.PRESETS.light[0], 'light'), '');
    assert.equal(css.text, '');
  });

  it('accent ramp: base token is the accent, every token gets a hex and rgb value', () => {
    const { T } = load();
    const r = T.ramp('#3b82f6');
    assert.equal(r['--ac'], '#3b82f6');
    assert.equal(r['--ac-rgb'], '59,130,246');
    for (const [name] of T.RAMP) {
      assert.match(r['--' + name], /^#[0-9a-f]{6}$/, name);
      assert.match(r['--' + name + '-rgb'], /^\d{1,3},\d{1,3},\d{1,3}$/, name);
    }
    // lighter / darker tones stay lighter / darker than the accent
    const lum = (h) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
    assert.ok(lum(r['--ac-l2']) > lum(r['--ac']));
    assert.ok(lum(r['--ac-d3']) < lum(r['--ac']));
  });

  it('dark palette: cards follow the surface, but stay black on the default surface', () => {
    const { T } = load();
    const slate = T.PRESETS.dark.find((p) => p.id === 'slate');
    const v = T.vars(slate, 'dark');
    assert.equal(v['--card-bg'], '#0f172a');
    assert.equal(v['--surface'], '#0f172a');
    assert.equal(v['--ac'], '#3b82f6');
    const onlyText = T.vars({ ...T.PRESETS.dark[0], text: '#ffffff' }, 'dark');
    assert.equal(onlyText['--card-bg'], '#000');
    assert.equal(onlyText['--ac'], undefined, 'default accent writes no ramp');
  });

  it('reads the old (v1) format and keeps writing the legacy keys', () => {
    const v1 = { backgroundColor: '#090d14', surfaceColor: '#0f172a', borderColor: '#1e293b', textColor: '#f1f5f9', fontSize: 16 };
    const { T, css } = load({ ww_custom_theme: JSON.stringify(v1) });
    const st = T.read();
    assert.equal(st.dark.bg, '#090d14');
    assert.equal(st.dark.accent, T.BASE);
    assert.equal(st.light, null);
    assert.ok(css.text.includes('--card-bg:#0f172a'), 'applied on load');
    const o = T.serialize(st);
    assert.equal(o.v, 2);
    assert.equal(o.backgroundColor, '#090d14');
    assert.equal(o.surfaceColor, '#0f172a');
  });

  it('applies the palette of the active mode only', () => {
    const st = { v: 2, ts: 1, dark: null, light: { bg: '#f5f1e8', surface: '#fffdf8', border: '#e6dfcf', text: '#1f1a14', accent: '#b45309' } };
    const dark = load({ ww_custom_theme: JSON.stringify(st) });
    assert.equal(dark.css.text, '');
    const light = load({ ww_custom_theme: JSON.stringify(st), ww_theme: 'light' });
    assert.ok(light.css.text.startsWith('html:root,html:root body{'));
    assert.ok(light.css.text.includes('--bg:#f5f1e8'));
    assert.ok(light.classes.has('light-theme'));
  });

  it('save stores a timestamp, the reset leaves no key', () => {
    const { T, ls } = load();
    const st = T.save({ dark: T.PRESETS.dark[3], light: null }, { local: true });
    assert.ok(st.ts > 0);
    assert.equal(JSON.parse(ls.get('ww_custom_theme')).dark.surface, '#0f172a');
    T.save({ dark: null, light: null }, { local: true });
    assert.equal(ls.has('ww_custom_theme'), false);
  });

  it('share code round trip, preset recognised, garbage rejected', () => {
    const { T } = load();
    const p = T.PRESETS.dark.find((x) => x.id === 'amber');
    const code = T.encode(p, 'dark');
    assert.match(code, /^WAWE-D-[0-9A-F]{30}$/);
    const back = T.decode(code.toLowerCase());
    assert.equal(back.mode, 'dark');
    assert.equal(back.palette.preset, 'amber');
    assert.equal(back.palette.accent, '#d97706');
    assert.equal(T.decode('WAWE-X-123'), null);
    assert.equal(T.decode('<script>'), null);
  });

  it('presets: unique ids, valid colors, readable text and accents', () => {
    const { T } = load();
    for (const mode of ['dark', 'light']) {
      const ids = T.PRESETS[mode].map((p) => p.id);
      assert.equal(new Set(ids).size, ids.length);
      assert.equal(T.isDefault(T.PRESETS[mode][0], mode), true);
      for (const p of T.PRESETS[mode]) {
        for (const f of T.FIELDS) assert.match(p[f], /^#[0-9a-f]{6}$/, `${p.id}.${f}`);
        assert.equal(T.matchPreset(p, mode), p.id);
        const card = mode === 'dark' && p.surface === '#0e0e16' ? '#000000' : p.surface;
        assert.ok(T.contrast(p.text, card) >= 7, `${p.id} text`);
        assert.ok(T.contrast('#ffffff', p.accent) >= 3, `${p.id} white on accent`);
        assert.ok(T.contrast(p.accent, card) >= 3, `${p.id} accent on card`);
      }
    }
  });
});
