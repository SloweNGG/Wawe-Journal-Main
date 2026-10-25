// ============================================================
// WAWE JOURNAL - ORTAK GRAFİK TEMASI TEST SUITE
// File: tests/chart-theme.test.js
// Runner: node --test tests/*.test.js
// Kapsam: public/interface/shared/chart-theme.js (WwChart) — tüm sayfalardaki grafiklerin
// font, eksen, ızgara ve tooltip ayarları buradan gelir.
// ============================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const code = fs.readFileSync(path.resolve('public/interface/shared/chart-theme.js'), 'utf8');

function load({ light = false } = {}) {
  const window = { document: { body: { classList: { contains: (c) => light && c === 'light-theme' } } } };
  vm.runInNewContext(code, { window });
  return window.WwChart;
}

const plain = (o) => JSON.parse(JSON.stringify(o));

describe('WwChart.colors', () => {
  it('koyu temada siyah, açık temada beyaz yüzey', () => {
    assert.equal(load().colors().surface, '#000000');
    assert.equal(load({ light: true }).colors().surface, '#ffffff');
  });
});

describe('WwChart.apex', () => {
  it('her grafikte Geist ve 12px net eksen yazısı', () => {
    const o = load().apex({});
    assert.equal(o.chart.fontFamily, "'Geist', system-ui, sans-serif");
    assert.deepEqual(plain(o.xaxis.labels.style), { colors: '#c9c9d6', fontSize: '12px', fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 500 });
  });

  it('grafiğin kendi ayarları kazanır, diğer varsayılanlar korunur', () => {
    const fmt = (v) => '$' + v;
    const o = load().apex({ chart: { type: 'bar', height: 220 }, yaxis: { labels: { formatter: fmt } }, colors: ['#f00'] });
    assert.equal(o.chart.type, 'bar');
    assert.equal(o.chart.fontFamily, "'Geist', system-ui, sans-serif");
    assert.equal(o.yaxis.labels.formatter, fmt);
    assert.equal(o.yaxis.labels.style.fontSize, '12px');
    assert.deepEqual([...o.colors], ['#f00']);
  });

  it('birden çok y ekseninin her birine eksen stili verir', () => {
    const o = load().apex({ yaxis: [{ opposite: false }, { opposite: true }] });
    assert.equal(o.yaxis.length, 2);
    assert.equal(o.yaxis[1].opposite, true);
    assert.equal(o.yaxis[1].labels.style.fontFamily, "'Geist', system-ui, sans-serif");
  });

  it('temel nesneyi değiştirmez', () => {
    const W = load();
    W.apex({ chart: { height: 1 } });
    assert.equal(W.apexBase().chart.height, undefined);
  });
});

describe('WwChart.tipHtml', () => {
  it('başlık, değer ve satırları kaçışlı yazar', () => {
    const html = load().tipHtml({ title: '<b>x</b>', value: '+$10', valueCls: 'up', rows: [{ label: 'ICT', value: '33%', color: '#0f0' }] });
    assert.match(html, /^<div class="ww-tip">/);
    assert.match(html, /<div class="ww-tip-title">&lt;b&gt;x&lt;\/b&gt;<\/div>/);
    assert.match(html, /<div class="ww-tip-value up">\+\$10<\/div>/);
    assert.match(html, /<i class="ww-tip-swatch" style="background:#0f0"><\/i>ICT<\/span><b class="">33%<\/b>/);
  });

  it('boş alanları atlar', () => {
    assert.equal(load().tipHtml({}), '<div class="ww-tip"></div>');
  });
});

describe('WwChart.barSize', () => {
  it('az kategoride çubuğu 44px ile sınırlar', () => {
    assert.equal(load().barSize(880, 2), '10%');
  });
  it('çok kategoride varsayılan %45 kalır', () => {
    assert.equal(load().barSize(600, 30), '45%');
  });
  it('boyut bilinmiyorsa varsayılanı verir', () => {
    assert.equal(load().barSize(0, 3), '45%');
  });
});

describe('WwChart.lwc', () => {
  it('Lightweight Charts için aynı font ve siyah etiket zemini', () => {
    const o = load().lwc({ width: 300, layout: { fontSize: 12 } });
    assert.equal(o.width, 300);
    assert.equal(o.layout.fontFamily, "'Geist', system-ui, sans-serif");
    assert.equal(o.layout.fontSize, 12);
    assert.equal(o.crosshair.vertLine.labelBackgroundColor, '#000000');
  });
});
