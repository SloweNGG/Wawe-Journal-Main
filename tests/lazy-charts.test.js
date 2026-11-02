// Grafik kütüphaneleri gecikmeli (perf 2b): dashboard / analytics / strategies açılışta ApexCharts ve
// lightweight-charts yüklemez; admin ve backtest dokunulmadan kalır; CDN sürümleri tek yerde.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(p, 'utf8');
const APEX = 'https://cdn.jsdelivr.net/npm/apexcharts@8.2.0';
const LWC = 'https://cdn.jsdelivr.net/npm/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js';

function loadLazy() {
  const ctx = { document: {}, location: { href: 'https://wawejournal.com/', origin: 'https://wawejournal.com' }, URL, Promise, setTimeout, clearTimeout };
  ctx.window = ctx;
  vm.runInNewContext(read('public/interface/shared/lazy-load.js'), ctx);
  return ctx;
}

describe('lazy chart libraries', () => {
  it('dashboard, analytics and strategies have no eager chart library tags', () => {
    for (const p of ['dashboard', 'analytics', 'strategies']) {
      const src = read(`src/pages/${p}.astro`);
      assert.ok(!/<script[^>]+apexcharts/.test(src) && !/<link[^>]+apexcharts/.test(src), p + ': apexcharts tag');
      assert.ok(!/<script[^>]+lightweight-charts/.test(src), p + ': lightweight-charts tag');
    }
  });

  it('admin and backtest keep their own tags (out of scope / main content)', () => {
    assert.ok(read('src/pages/admin.astro').includes(APEX));
    assert.ok(read('src/pages/backtest.astro').includes(LWC));
  });

  it('WwLazy.LIBS uses the same versions as the remaining page tags', () => {
    const { WwLazy } = loadLazy();
    assert.equal(WwLazy.LIBS.apexcharts.url, APEX);
    assert.equal(WwLazy.LIBS['lightweight-charts'].url, LWC);
    assert.ok(read('src/pages/backtest.astro').includes(WwLazy.LIBS.sortablejs.url));
  });

  it('loadLib resolves without loading when the global already exists', async () => {
    const ctx = loadLazy();
    ctx.ApexCharts = function () {};
    await ctx.WwLazy.loadLib('apexcharts');
    assert.equal(ctx.WwLazy.libReady('apexcharts'), true);
    await assert.rejects(ctx.WwLazy.loadLib('nope'), /bilinmeyen/);
  });

  it('dashboard starts without waiting for chart libraries and queues chart drawing', () => {
    const js = read('public/interface/dashboard/js/dashboard.js');
    const start = js.slice(js.indexOf('function startDashboard()'), js.indexOf('function startDashboard()') + 1200);
    assert.ok(!/isApexReady|isLwcReady/.test(start), 'startDashboard no longer waits for ApexCharts/LightweightCharts');
    assert.match(js, /if \(!chartLibsReady\(\)\) \{\s*pendingChartTrades = trades;\s*watchChartContainers\(\);\s*return;/);
    assert.match(js, /WwLazy\.loadLibs\(\['apexcharts', 'lightweight-charts'\]\)/);
  });

  it('analytics gates the three drawing entry points; library cards match EXPANDABLE_CHARTS', () => {
    const js = read('public/interface/analytics/js/chart-renderers.js');
    const lib = js.match(/var LIB_CHART_KEYS = (\[[^\]]+\])/)[1];
    const exp = js.match(/export var EXPANDABLE_CHARTS = (\[[^\]]+\])/)[1];
    assert.deepEqual(JSON.parse(lib.replace(/'/g, '"')), JSON.parse(exp.replace(/'/g, '"')));
    for (const fn of ['renderCharts(trades, opts)', 'renderChartFor(key, trades)', 'renderChartInto(key, trades, target)']) {
      const body = js.slice(js.indexOf('export function ' + fn), js.indexOf('export function ' + fn) + 900);
      assert.ok(body.includes('chartLibsReady()'), fn);
    }
  });

  it('strategies loads ApexCharts through whenApexReady and cleans up without the old poller', () => {
    const js = read('public/interface/strategies/js/strategies.js');
    assert.ok(!js.includes('_apexReadyPoller'));
    assert.match(js, /window\.WwLazy\.loadLib\('apexcharts'\)/);
    assert.match(js, /_apexWatchCancels\.forEach/);
  });
});
