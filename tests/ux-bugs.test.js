// fix/ux-bugs: kullanıcı hataları (tarayıcı kontrolleri: scripts/perf/verify-ux-bugs.mjs)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');

describe('1 — Calendar: Quick Add reopens right after saving; saved trades show without reload', () => {
  it('on pages with the + button the toast sits above it (it covered the button and took the first click)', () => {
    const css = read('public/styles.css');
    assert.match(css, /body\[data-quick-add\] \.ww-toast-container \{ bottom: calc\(2rem \+ 54px \+ 0\.75rem\); \}/);
    assert.match(css, /@media \(max-width: 768px\) \{\s*body\[data-quick-add\] \.ww-toast-container \{ bottom: calc\(1\.25rem \+ 48px \+ 0\.5rem\); \}/);
    const qa = read('public/interface/quick-add/css/quick-add.css');
    // ölçüler FAB ile aynı kalmalı
    assert.match(qa, /\.quick-add-fab \{\s*position: fixed;\s*bottom: 2rem;\s*right: 2rem;[\s\S]*?width: 54px;\s*height: 54px;/);
    assert.match(qa, /@media \(max-width: 768px\) \{[\s\S]*?bottom: 1\.25rem;\s*right: 1\.25rem;\s*width: 48px;\s*height: 48px;/);
    assert.match(read('src/layouts/Layout.astro'), /data-quick-add=\{showQuickAdd \? '' : undefined\}/);
  });

  it('calendar listens to trade-saved once per page (scoped) and refetches', () => {
    const cal = read('public/interface/calendar/js/calendar.js');
    const init = cal.slice(cal.indexOf('async function initCalendar()'), cal.indexOf('async function startCalendar') > 0 ? cal.indexOf('async function startCalendar') : undefined);
    assert.match(init, /CAL_PAGE\.on\(window, 'trade-saved', function \(\) \{[\s\S]*?fetchFreshCalendarTrades\(user\.id, savedJid, false\);/);
    assert.equal((cal.match(/\.on\(window, 'trade-saved'|addEventListener\('trade-saved'/g) || []).length, 1, 'exactly one listener');
    assert.match(cal, /async function initCalendar\(\) \{\s*if \(isCalendarInitialized\) return;\s*isCalendarInitialized = true;/);
  });
});

describe('2 — notifications are not marked read on page open; profile heartbeat writes only what changed', () => {
  it('mark-read functions run only from user clicks (onclick), never programmatically', () => {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]));
    const files = [...walk('public'), ...walk('src')].filter((f) => /\.(m?js|astro|html)$/.test(f) && !f.endsWith('bundle.js'));
    const calls = [];
    for (const f of files) {
      for (const m of read(f).matchAll(/(.{0,40})\b(wwMarkAllAsRead|wwMarkAsRead)\s*\(/g)) {
        if (/function\s*$/.test(m[1]) || /window\.\w+\s*=\s*async\s*$/.test(m[1])) continue;
        if (/onclick=/.test(m[1]) || /&&\s*window\.$/.test(m[1])) continue;   // onclick="window.wwMarkAllAsRead && window.wwMarkAllAsRead()"
        calls.push(f + ': ' + m[0].trim());
      }
    }
    assert.deepEqual(calls, []);
    assert.match(read('public/components/navbar/navbar.js'), /if \(willOpen\) wwMarkBellSeen\(\);/);   // zil açılınca yalnızca "görüldü"
  });

  it('throttledUpdateLastActive: last_active every time, email/username only first time or when changed', async () => {
    const src = read('public/src/core/supabase.js');
    const fn = src.slice(src.indexOf('export async function throttledUpdateLastActive'), src.indexOf('// ── LOGOUT'));
    const store = {}, writes = [];
    const sb = { from: () => ({ update: (d) => ({ eq: () => ({ select: async () => { writes.push(Object.keys(d).sort().join('+')); return { data: [{ id: 'u1' }], error: null }; } }) }), insert: () => ({ catch() {} }) }) };
    const run = new Function('sb', 'safeLocalStorageGet', 'safeLocalStorageSet', 'ACTIVE_THROTTLE_MS', fn.replace('export async function', 'return async function'))(
      sb, (k, d) => (k in store ? store[k] : d), (k, v) => { store[k] = v; }, 5 * 60 * 1000);
    const user = { id: 'u1', email: 'a@b.c', user_metadata: { username: 'ali' } };
    await run(user); delete store.ww_last_active_push;
    await run(user); delete store.ww_last_active_push;
    await run({ ...user, user_metadata: { username: 'veli' } });
    await run(user);   // 5 dk içinde: hiç yazmaz
    assert.deepEqual(writes, ['email+last_active+username', 'last_active', 'email+last_active+username']);
  });
});
