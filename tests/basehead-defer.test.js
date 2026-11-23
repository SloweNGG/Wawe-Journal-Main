// ============================================================
// WAWE JOURNAL - BASEHEAD ORTAK SCRIPT'LER defer
// File: tests/basehead-defer.test.js
// Runner: node --test tests/*.test.js
// Kapsam: src/components/BaseHead.astro'daki 10 ortak script defer (ilk çizimi bekletmez), sıraları korunur,
// ambient.js WwTime'dan sonra çalışır. journal-mark.js'in stili statik (navbar.css); script'teki kopya yalnızca
// yedek: statik stil varsa eklenmez, yoksa bir kez eklenir; iki kopya aynı kalır.
// ============================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const head = fs.readFileSync('src/components/BaseHead.astro', 'utf8');
const navbarCss = fs.readFileSync('public/components/navbar/navbar.css', 'utf8');
const markSrc = fs.readFileSync('public/interface/shared/journal-mark.js', 'utf8');

const SHARED = [
  '/cache.js',
  '/interface/shared/time-settings.js',
  '/interface/shared/trade-metrics.js',
  '/interface/shared/trades-source.js',
  '/interface/shared/realtime-guard.js',
  '/interface/shared/chart-theme.js',
  '/interface/shared/chart-viewer.js',
  '/interface/shared/journal-mark.js',
  '/interface/shared/ww-date-picker.js',
  '/interface/shared/ww-range-picker.js'
];

// BaseHead'deki tüm <script src="..."> etiketleri (sırasıyla)
function scriptTags(src) {
  const out = [];
  const re = /<script\b([^>]*)\bsrc="([^"]+)"([^>]*)>/g;
  let m;
  while ((m = re.exec(src))) out.push({ src: m[2], attrs: (m[1] + ' ' + m[3]).trim().split(/\s+/), index: m.index });
  return out;
}

describe('BaseHead: ortak script\'ler ilk çizimi bekletmez', () => {
  const tags = scriptTags(head);

  it('10 ortak script\'in hepsi defer (async değil, sıra korunur)', () => {
    for (const s of SHARED) {
      const tag = tags.find((t) => t.src === s);
      assert.ok(tag, s + ' BaseHead\'de yüklenir');
      assert.ok(tag.attrs.includes('defer'), s + ' defer olmalı');
      assert.ok(!tag.attrs.includes('async'), s + ' async olmamalı (sıra önemli)');
    }
    const order = SHARED.map((s) => tags.findIndex((t) => t.src === s));
    assert.deepEqual(order, [...order].sort((a, b) => a - b), 'eski sıra korunur: ' + SHARED.join(' → '));
  });

  it('uygulama sayfası bloğunda defer\'siz dış script kalmadı', () => {
    for (const t of tags) assert.ok(t.attrs.includes('defer') || t.attrs.includes('async'), t.src + ' ayrıştırmayı bekletiyor');
  });

  it('ambient.js time-settings.js\'ten sonra (açılışta WwTime.getTz ile günün saatini seçer)', () => {
    const amb = tags.findIndex((t) => t.src === '/components/ambient/ambient.js');
    const time = tags.findIndex((t) => t.src === '/interface/shared/time-settings.js');
    assert.ok(amb !== -1 && time !== -1);
    assert.ok(amb > time, 'ambient.js time-settings.js\'ten sonra gelmeli');
    assert.ok(tags[amb].attrs.includes('defer'));
  });

  it('stil dosyaları defer script\'lerden önce (önden iner, ilk çizimde hazır)', () => {
    const firstScript = tags.find((t) => t.src === '/cache.js').index;
    for (const href of ['/styles.css', '/components/navbar/navbar.css', '/components/ambient/ambient.css', '/interface/shared/chart-theme.css']) {
      const at = head.indexOf('href="' + href + '"');
      assert.ok(at !== -1 && at < firstScript, href + ' script\'lerden önce');
    }
  });
});

// journal-mark.js'i sahte document ile çalıştırır. markerOn: navbar.css yüklü mü (--ww-mark-css: 1)
function loadMark({ markerOn }) {
  const head = { children: [], appendChild(el) { el.parentNode = head; head.children.push(el); return el; } };
  let computedCalls = 0;
  const document = {
    head,
    documentElement: {},
    getElementById(id) { return head.children.find((el) => el.id === id) || null; },
    createElement(tag) {
      return { tagName: tag.toUpperCase(), id: '', attrs: {}, textContent: '', setAttribute(k, v) { this.attrs[k] = v; } };
    }
  };
  const window = {
    document,
    localStorage: { getItem: () => null },
    getComputedStyle() {
      computedCalls++;
      return { getPropertyValue: (name) => (markerOn && name === '--ww-mark-css' ? ' 1' : '') };
    }
  };
  vm.runInNewContext(markSrc, { window, document, localStorage: window.localStorage, JSON, String });
  const styles = () => head.children.filter((el) => el.id === 'ww-journal-mark-style');
  return { api: window.WwJournalMark, head, styles, computedCalls: () => computedCalls };
}

// Karşılaştırma için CSS'i sadeleştir: yorumlar, boşluklar, son noktalı virgül
const minCss = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')
  .replace(/\s*([{}:;,()])\s*/g, '$1').replace(/;}/g, '}').trim();

describe('journal-mark.js: stil statik, script\'teki yalnızca yedek', () => {
  it('navbar.css yüklüyse (işaret var) <style> eklenmez; işaret bir kez sorulur', () => {
    const m = loadMark({ markerOn: true });
    assert.equal(m.styles().length, 0);
    const html = m.api.html({ color: '#ff0000', broker: true });
    assert.match(html, /class="ww-mark ww-mark--dot ww-mark--live"/);
    m.api.html({ color: '#00ff00' });
    m.api.forJournal({ id: 'j1', color: '#123456' });
    assert.equal(m.styles().length, 0);
    assert.equal(m.computedCalls(), 1, 'bulunduktan sonra getComputedStyle tekrar çağrılmaz');
  });

  it('navbar.css yoksa yedek stil bir kez eklenir (id + data-runtime), tekrar eklenmez', () => {
    const m = loadMark({ markerOn: false });
    assert.equal(m.styles().length, 1);
    const st = m.styles()[0];
    assert.equal(st.tagName, 'STYLE');
    assert.ok('data-runtime' in st.attrs, 'SPA router silmesin');
    m.api.html({});
    m.api.html({ color: '#abc' });
    assert.equal(m.styles().length, 1, 'kurallar iki kez yazılmaz');
  });

  it('yedek stil silinirse (SPA) sonraki çağrıda geri eklenir', () => {
    const m = loadMark({ markerOn: false });
    m.head.children.length = 0;
    m.api.html({});
    assert.equal(m.styles().length, 1);
  });

  it('navbar.css ile script\'teki yedek aynı kuralları taşır; işaret navbar.css\'te', () => {
    const fallback = loadMark({ markerOn: false }).styles()[0].textContent;
    assert.ok(fallback.includes('.ww-mark-dot') && fallback.includes('@keyframes ww-mark-blink'));
    const css = minCss(navbarCss);
    assert.ok(css.includes(minCss(fallback)), 'navbar.css "HESAP İŞARETİ" bölümü journal-mark.js CSS\'inin aynısı olmalı');
    assert.ok(css.includes(':root{--ww-mark-css:1}'), 'navbar.css işaret değişkenini tanımlar');
    assert.ok(css.indexOf('@keyframes ww-mark-blink') < css.indexOf('.nav .ww-mark--live .ww-mark-dot{animation:ww-mark-blink'),
      'keyframes .nav istisnasıyla aynı dosyada');
  });
});

describe('hesaplar sayfası: önbellekten ilk çizim', () => {
  it('WwJournalMark henüz yokken (defer) boş değil düz renk noktası çizer', () => {
    const page = fs.readFileSync('src/pages/journals.astro', 'utf8');
    assert.match(page, /window\.WwJournalMark \? window\.WwJournalMark\.forJournal\(j, \{ dotSize: 14 \}\) : '<span class="ww-mark ww-mark--dot"/);
  });
});
