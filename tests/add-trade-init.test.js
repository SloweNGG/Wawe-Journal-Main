// add-trade: the page's inline script runs before bundle.js (a deferred module that defines requireAuth and
// applyDecimalFix). Opened directly (reload, bookmark) its init must wait for DOMContentLoaded; opened through the SPA
// router (event long gone) it must start at once. Since f0e153e the init called requireAuth at parse time, found it
// undefined and silently stopped: no session, journal, date or strategies; CSV / bulk failed with "currentUser null".
// End to end (direct + SPA × single trade, bulk paste, CSV): scripts/perf/verify-add-trade.mjs.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync('src/pages/add-trade.astro', 'utf8');
const fnSrc = src.slice(src.indexOf('function whenAppReady'), src.indexOf('}', src.indexOf('else fn();')) + 1);

function run(readyState) {
  const listeners = [];
  const ctx = { document: { readyState, addEventListener: (type, fn, opts) => listeners.push({ type, fn, opts }) }, calls: [] };
  vm.runInNewContext(fnSrc + '\nwhenAppReady(function () { calls.push("init"); });', ctx);
  return { ctx, listeners };
}

describe('add-trade init order', () => {
  it('direct open (document still loading): init waits for DOMContentLoaded, once', () => {
    const { ctx, listeners } = run('loading');
    assert.deepEqual(ctx.calls, []);
    assert.equal(listeners.length, 1);
    assert.equal(listeners[0].type, 'DOMContentLoaded');
    assert.equal(JSON.stringify(listeners[0].opts), '{"once":true}');
    listeners[0].fn();
    assert.deepEqual(ctx.calls, ['init']);
  });

  it('SPA navigation (document already loaded): init starts at once', () => {
    for (const state of ['interactive', 'complete']) {
      const { ctx, listeners } = run(state);
      assert.deepEqual(ctx.calls, ['init'], state);
      assert.equal(listeners.length, 0, state);
    }
  });

  it('requireAuth and applyDecimalFix are only reached through whenAppReady', () => {
    assert.ok(fnSrc.startsWith('function whenAppReady') && fnSrc.includes("document.readyState === 'loading'"));
    assert.ok(!/(?<!whenAppReady)\(async function\(\) \{\s*try \{\s*currentUser = await requireAuth\(\);/.test(src), 'no init IIFE that runs at parse time');
    assert.match(src, /whenAppReady\(async function\(\) \{\s*try \{\s*currentUser = await requireAuth\(\);/);
    assert.match(src, /whenAppReady\(function\(\) \{\s*applyDecimalFix\(/);
    assert.ok(!/document\.addEventListener\('DOMContentLoaded', function\(\) \{\s*applyDecimalFix/.test(src), 'decimal fix also runs after SPA navigation');
  });
});
