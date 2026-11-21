// Arka plan motoru (public/components/ambient/ambient.js): tercih, K/Z şiddeti, günün saati, stil çözümlemesi, katalog
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const code = fs.readFileSync(path.resolve('public/components/ambient/ambient.js'), 'utf8');
const mod = { exports: {} };
vm.runInNewContext(code, { module: mod, Math, JSON, Object, Array, String, Number, isFinite, parseInt, parseFloat, Intl, Date });
const A = mod.exports;
const plain = (o) => JSON.parse(JSON.stringify(o)); // vm bağlamının nesneleri (başka prototip)

const ctx = (o) => Object.assign({ pnl: 0, avgAbs: 0, hour: 12, light: false }, o);

describe('ambient: preferences', () => {
  it('defaults to the dynamic P&L glow, glow on, normal strength', () => {
    assert.deepEqual(plain(A.normalize(null)), { style: 'dynamic', presets: {}, glow: true, strength: 2 });
  });
  it('migrates the old three-way switch (ww_ambient_mode)', () => {
    assert.equal(A.normalize(null, 'off').style, 'off');
    const c = A.normalize(null, 'classic');
    assert.equal(c.style, 'gradient');
    assert.equal(c.presets.gradient, 'wawe');
    assert.equal(A.normalize(null, 'dynamic').style, 'dynamic');
  });
  it('drops unknown styles, presets and strengths', () => {
    const p = A.normalize({ style: 'lava', presets: { forest: 'jungle', solid: 'navy' }, glow: 'yes', strength: 9 });
    assert.equal(p.style, 'dynamic');
    assert.deepEqual(plain(p.presets), { solid: 'navy' });
    assert.equal(p.glow, true);
    assert.equal(p.strength, 2);
  });
});

describe('ambient: P&L strength', () => {
  it('flat or missing P&L is neutral', () => {
    assert.equal(A.tierOf(0, 50).state, 'neutral');
    assert.equal(A.tierOf(NaN, 50).state, 'neutral');
  });
  it('tiers by P&L against four average trades', () => {
    assert.deepEqual([A.tierOf(40, 100).tier, A.tierOf(150, 100).tier, A.tierOf(400, 100).tier], [0, 1, 2]);
    assert.equal(A.tierOf(-400, 100).state, 'loss');
    assert.equal(A.tierOf(-400, 100).tier, 2);
    assert.ok(A.tierOf(400, 100).k > A.tierOf(40, 100).k);
  });
  it('without a trade size the middle tier is used', () => {
    assert.equal(A.tierOf(123, 0).tier, 1);
  });
});

describe('ambient: time of day', () => {
  it('splits the day into dawn, day, sunset and night', () => {
    const parts = [0, 4, 5, 7, 8, 16, 17, 19, 20, 23].map(A.daypartOf);
    assert.deepEqual(parts, ['night', 'night', 'dawn', 'dawn', 'day', 'day', 'dusk', 'dusk', 'night', 'night']);
  });
});

describe('ambient: resolve', () => {
  it('dynamic: orbs and glow in the palette color of the tier', () => {
    const r = A.resolve({ style: 'dynamic', presets: { dynamic: 'ocean' } }, ctx({ pnl: 500, avgAbs: 100 }));
    assert.equal(r.enabled, true);
    assert.equal(r.attrs['data-ww-orbs'], 'on');
    assert.equal(r.attrs['data-ww-glow'], 'on');
    assert.equal(r.attrs['data-ambient-state'], 'profit');
    assert.equal(r.attrs['data-ambient-tier'], 'strong');
    assert.equal(r.vars['--amb-c1'], A.PNL.ocean.profit[2][0]);
  });
  it('small and big losses get different colors', () => {
    const small = A.resolve({}, ctx({ pnl: -10, avgAbs: 100 })), big = A.resolve({}, ctx({ pnl: -900, avgAbs: 100 }));
    assert.notEqual(small.vars['--pnl-c1'], big.vars['--pnl-c1']);
  });
  it('solid: plain base, no orbs; the P&L glow follows the switch', () => {
    const on = A.resolve({ style: 'solid', presets: { solid: 'navy' } }, ctx({ pnl: 5 }));
    assert.equal(on.vars['--wwbg-base'], '#0a1022');
    assert.equal(on.attrs['data-ww-orbs'], 'off');
    assert.equal(on.attrs['data-ww-glow'], 'on');
    assert.equal(A.resolve({ style: 'solid', glow: false }, ctx()).attrs['data-ww-glow'], 'off');
  });
  it('off disables the backdrop', () => {
    assert.equal(A.resolve({ style: 'off' }, ctx()).enabled, false);
  });
  it('daytime auto follows the hour; a fixed part ignores it', () => {
    assert.equal(A.resolve({ style: 'daytime' }, ctx({ hour: 6 })).attrs['data-ww-daypart'], 'dawn');
    assert.match(A.resolve({ style: 'daytime' }, ctx({ hour: 22 })).vars['--wwbg-scene'], /daytime-night\.svg/);
    assert.equal(A.resolve({ style: 'daytime', presets: { daytime: 'day' } }, ctx({ hour: 22 })).attrs['data-ww-daypart'], 'day');
  });
  it('the P&L peak turns with the direction', () => {
    const f = (pnl) => A.resolve({ style: 'mountain', presets: { mountain: 'pnl' } }, ctx({ pnl })).vars['--wwbg-scene-filter'];
    assert.match(f(100), /hue-rotate\(-/);
    assert.match(f(-100), /hue-rotate\(1/);
    assert.equal(f(0), 'none');
  });
  it('light theme: softer glow, faint scenes, light solids', () => {
    const dark = A.resolve({}, ctx({ pnl: 100, avgAbs: 100 })), light = A.resolve({}, ctx({ pnl: 100, avgAbs: 100, light: true }));
    assert.ok(+light.vars['--pnl-k'] < +dark.vars['--pnl-k']);
    assert.equal(A.resolve({ style: 'forest' }, ctx({ light: true })).vars['--wwbg-scene-o'], '0.22');
    assert.equal(A.resolve({ style: 'solid', presets: { solid: 'black' } }, ctx({ light: true })).vars['--wwbg-base'], '#ffffff');
  });
  it('strength scales the glow', () => {
    const k = (s) => +A.resolve({ strength: s }, ctx({ pnl: 100, avgAbs: 100 })).vars['--pnl-k'];
    assert.ok(k(1) < k(2) && k(2) < k(3));
  });
});

describe('ambient: catalog', () => {
  const scenes = new Set();
  for (const style of A.STYLES) for (const p of A.CATALOG[style]) if (p.scene) scenes.add(p.scene.startsWith('/') ? p.scene : '/images/backgrounds/' + p.scene);
  for (const part of Object.values(A.DAYPART)) scenes.add('/images/backgrounds/' + part.scene);

  it('every scene image exists (generated by scripts/gen-backgrounds.mjs or the brand images)', () => {
    for (const s of scenes) assert.ok(fs.existsSync(path.join('public', s)), s);
  });
  it('every style, preset and description is translated in tr, en and de', async () => {
    const keys = ['settings.bg_title', 'settings.bg_glow', 'settings.bg_strength'];
    for (const style of A.STYLES) {
      keys.push('settings.bg_s_' + style, 'settings.bg_d_' + style);
      for (const p of A.CATALOG[style]) keys.push('settings.bg_p_' + style + '_' + p.id);
    }
    for (const part of Object.keys(A.DAYPART)) keys.push('settings.bg_p_daytime_' + part);
    for (const lang of ['tr', 'en', 'de']) {
      const d = (await import(path.resolve('public/i18n/locales/' + lang + '.js'))).default;
      for (const k of keys) assert.ok(typeof d[k] === 'string' && d[k].length, lang + ': ' + k);
    }
  });
  it('the settings panel offers a tab for every style', () => {
    const html = fs.readFileSync('public/settings/panels/appearance.html', 'utf8');
    for (const style of A.STYLES) assert.ok(html.includes('data-bg-style="' + style + '"'), style);
  });
});
