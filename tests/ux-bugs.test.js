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
