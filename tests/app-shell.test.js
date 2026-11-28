// Uygulama kabuğu (src/layouts/Layout.astro) inceltme:
//  - yükseltme penceresi yalnızca uygulama sayfalarında; script ve stiller ayrı dosyada (public/components/upgrade-modal/)
//  - onboarding.js/.css yalnızca gerekiyorsa (public/interface/dashboard/js/onboarding-gate.js)
//  - note-tools yalnızca not alanı olan yerlerde (add-trade, Hızlı Ekle), prop-montecarlo yalnızca dashboard'da
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const layout = fs.readFileSync('src/layouts/Layout.astro', 'utf8');
const gateSrc = fs.readFileSync('public/interface/dashboard/js/onboarding-gate.js', 'utf8');
const onb = fs.readFileSync('public/interface/dashboard/js/onboarding.js', 'utf8');
const modalAstro = fs.readFileSync('src/components/UpgradeModal.astro', 'utf8');
const modalJs = fs.readFileSync('public/components/upgrade-modal/upgrade-modal.js', 'utf8');
const modalCss = fs.readFileSync('public/components/upgrade-modal/upgrade-modal.css', 'utf8');

const tick = () => new Promise((r) => setImmediate(r));

// ---------------------------------------------------------------- onboarding kapısı
// opts: user (oturumdaki kullanıcı), local / session (depolama), sb: false → window.sb hiç yok,
// sbLate → sb N. denemede gelir, reject → getSession hata verir
function runGate({ user = null, local = {}, session = {}, sb = true, sbLate = 0, reject = false, authError = false } = {}) {
  const loads = [];
  const links = [];
  const intervals = [];
  const sbObj = {
    auth: {
      getSession: () => (reject ? Promise.reject(new Error('x'))
        : authError ? Promise.resolve({ data: { session: null }, error: new Error('refresh failed') })
        : Promise.resolve({ data: { session: user ? { user } : null }, error: null })),
    },
  };
  const win = {
    localStorage: { getItem: (k) => (k in local ? local[k] : null) },
    sessionStorage: { getItem: (k) => (k in session ? session[k] : null) },
    WwLazy: {
      loadScriptOnce: (url) => {
        loads.push(url);
        return Promise.resolve().then(() => {
          // gerçek onboarding.js'in yaptığı gibi vekillerin üzerine yazar
          win.startOnboardingWizard = () => { win.__wizardOpened = (win.__wizardOpened || 0) + 1; };
          win.startOnboardingTour = () => { win.__tourOpened = (win.__tourOpened || 0) + 1; };
          win.refreshOnboardingTasks = () => {};
        });
      },
    },
    document: {
      head: { appendChild: (el) => links.push(el) },
      createElement: () => ({ setAttribute(k) { this['@' + k] = true; } }),
      querySelector: (s) => (s === 'link[data-wj-onboarding-css]' ? links.find((l) => l['@data-wj-onboarding-css']) || null : null),
    },
    setInterval: (fn) => { intervals.push(fn); return intervals.length; },
    clearInterval: (id) => { intervals[id - 1] = null; },
    Promise,
  };
  win.window = win;
  if (sb && !sbLate) win.sb = sbObj;
  vm.runInNewContext(gateSrc, win);
  // sahte zamanlayıcı: her çağrı bir deneme (120 ms)
  const poll = (n) => {
    for (let i = 1; i <= n; i++) {
      if (sbLate && i === sbLate) win.sb = sbObj;
      intervals.forEach((f) => f && f());
    }
  };
  return { win, loads, links, poll };
}

const UID = 'u-1';
const done = { ['wj_wizard_done_' + UID]: 'true', ['wj_tour_done_' + UID]: 'true', ['wj_tasks_all_done_' + UID]: 'true' };

describe('onboarding gate: decision (mirrors initOnboarding + renderTasksWidget)', () => {
  const { win } = runGate({ sb: false });
  const need = (user, local = {}, session = {}) =>
    win.WwOnboardingGate.onboardingNeeded(user, (k) => (k in local ? local[k] : null), (k) => (k in session ? session[k] : null));

  it('skips only when wizard, tour and tasks are all done for THIS user', () => {
    assert.equal(need({ id: UID }, done), false);
    assert.equal(need({ id: UID }, { ...done, ['wj_tasks_all_done_' + UID]: undefined, ['wj_tasks_dismissed_' + UID]: 'true' }), false, 'dismissed tasks');
    assert.equal(need({ id: UID, user_metadata: { tasks_completed: true } }, { ['wj_wizard_done_' + UID]: 'true', ['wj_tour_done_' + UID]: 'true' }), false, 'tasks done on another device');
  });

  it('loads when anything is missing or unknown (worst case = old behaviour)', () => {
    assert.equal(need(null, done), true, 'no session');
    assert.equal(need({}, done), true, 'no user id');
    for (const k of Object.keys(done)) {
      const l = { ...done };
      delete l[k];
      assert.equal(need({ id: UID }, l), true, k + ' missing');
    }
    assert.equal(need({ id: 'other' }, done), true, 'flags of another account');
    assert.equal(need({ id: UID }, { ...done, ['wj_tour_done_' + UID]: '1' }), true, "only 'true' counts");
    assert.equal(need({ id: UID, user_metadata: { tasks_completed: false } }, { ['wj_wizard_done_' + UID]: 'true', ['wj_tour_done_' + UID]: 'true' }), true);
    assert.equal(win.WwOnboardingGate.onboardingNeeded({ id: UID }, () => { throw new Error('blocked'); }, () => null), true, 'storage error');
  });

  it('loads for the strategy-task success toast even when everything is done', () => {
    assert.equal(need({ id: UID }, done, { wj_strategy_just_completed: 'true' }), true);
  });

  it('onboarding.js still decides with the same keys (update onboardingNeeded when they change)', () => {
    const init = onb.slice(onb.indexOf('async function initOnboarding()'), onb.indexOf('// Yeni işlem kaydedildiğinde'));
    assert.match(init, /localStorage\.getItem\('wj_wizard_done_' \+ uid\) === 'true'/);
    assert.match(init, /localStorage\.getItem\('wj_tour_done_' \+ uid\) === 'true'/);
    assert.match(init, /sessionStorage\.getItem\('wj_strategy_just_completed'\) === 'true'/);
    assert.match(init, /if \(!isWizardDone\) \{/);
    assert.match(init, /if \(!isTourDone\) \{/);
    assert.match(init, /\/\/ 🚀 ADIM 3[^\n]*\n\s*renderTasksWidget\(\);\n\s*\}/);
    const tasks = onb.slice(onb.indexOf('function renderTasksWidget()'), onb.indexOf('var isAccountDone = true;'));
    assert.match(tasks, /localStorage\.getItem\('wj_tasks_dismissed_' \+ uid\) === 'true'/);
    assert.match(tasks, /localStorage\.getItem\('wj_tasks_all_done_' \+ uid\) === 'true'/);
    assert.match(tasks, /state\.user\.user_metadata && state\.user\.user_metadata\.tasks_completed/);
    assert.match(tasks, /if \(isAlreadyDismissed \|\| isAlreadyAllDone \|\| isMetaDone\) \{[^}]*return;/);
  });

  it('onboarding.js stores the database "done" flags locally, so the next load can skip', () => {
    const init = onb.slice(onb.indexOf('async function initOnboarding()'), onb.indexOf('// Yeni işlem kaydedildiğinde'));
    const query = init.indexOf(".select('onboarding_completed, onboarding_tour_completed, preferred_currency')");
    const persist = init.indexOf("if (dbWizardDone && !localWizardDone) localStorage.setItem('wj_wizard_done_' + uid, 'true');");
    assert.ok(query > 0 && persist > query, 'written after the profile query');
    assert.ok(init.indexOf("if (dbTourDone) localStorage.setItem('wj_tour_done_' + uid, 'true');") > query);
    assert.ok(persist < init.indexOf('var isWizardDone = localWizardDone || dbWizardDone;'));
  });
});

describe('onboarding gate: loading', () => {
  it('a finished user downloads nothing; console helpers are load-then-call shims; refreshOnboardingTasks stays undefined', async () => {
    const { win, loads, links } = runGate({ user: { id: UID }, local: done });
    await tick();
    assert.deepEqual(loads, []);
    assert.equal(links.length, 0);
    assert.equal(typeof win.startOnboardingWizard, 'function');
    assert.equal(win.startOnboardingWizard.__wjGate, true);
    assert.equal(win.startOnboardingTour.__wjGate, true);
    assert.equal(win.refreshOnboardingTasks, undefined);
    await win.startOnboardingWizard();
    assert.deepEqual(loads, ['/interface/dashboard/js/onboarding.js?v=__WW_BUILD_ID__']);
    assert.equal(win.__wizardOpened, 1, 'the real function ran after loading');
    assert.equal(links.length, 1, 'CSS came with it');
  });

  it('a user with something left gets onboarding.css + onboarding.js (build token in both URLs), once', async () => {
    const { win, loads, links } = runGate({ user: { id: UID }, local: { ['wj_wizard_done_' + UID]: 'true' } });
    await tick();
    assert.deepEqual(loads, ['/interface/dashboard/js/onboarding.js?v=__WW_BUILD_ID__']);
    assert.equal(links.length, 1);
    assert.equal(links[0].rel, 'stylesheet');
    assert.equal(links[0].href, '/interface/dashboard/css/onboarding.css?v=__WW_BUILD_ID__');
    win.WwOnboardingGate.load();
    await win.startOnboardingTour();
    assert.equal(loads.length, 1, 'no second request');
    assert.equal(links.length, 1);
    assert.equal(win.__tourOpened, 1);
  });

  it('no session at all (clean answer): nothing loads; the page is redirecting to login anyway', async () => {
    const r = runGate({ user: null });
    await tick();
    assert.equal(r.loads.length, 0, 'no session');
    assert.equal(r.links.length, 0, 'no onboarding.css either');
  });

  it('an auth error, a failing getSession, or no Supabase client at all → load (old behaviour)', async () => {
    let r = runGate({ user: null, local: done, authError: true });
    await tick();
    assert.equal(r.loads.length, 1, 'getSession answered with an error');
    r = runGate({ user: { id: UID }, local: done, reject: true });
    await tick();
    assert.equal(r.loads.length, 1, 'getSession rejected');
    r = runGate({ sb: false, local: done });
    r.poll(44);
    await tick();
    assert.equal(r.loads.length, 0, 'still waiting for window.sb (like onboarding.js: 45 × 120 ms)');
    r.poll(1);
    await tick();
    assert.equal(r.loads.length, 1, 'gave up waiting');
  });

  it('waits for window.sb when the client appears late', async () => {
    const r = runGate({ user: { id: UID }, local: done, sbLate: 3 });
    r.poll(3);
    await tick();
    assert.equal(r.loads.length, 0, 'decided with the session: nothing to load');
  });

  it('Layout loads only the gate (defer, where onboarding.js was); nothing else references onboarding.css/.js', () => {
    assert.ok(!layout.includes('/interface/dashboard/css/onboarding.css'));
    assert.ok(!layout.includes('/interface/dashboard/js/onboarding.js'));
    assert.match(layout, /\{isAppPage && \(\s*<script src="\/interface\/dashboard\/js\/onboarding-gate\.js" is:inline defer><\/script>\s*<script src="\/components\/ai-coach\/ai-coach\.js" is:inline defer><\/script>/);
    for (const p of fs.readdirSync('src/pages', { recursive: true })) {
      if (!String(p).endsWith('.astro')) continue;
      const src = fs.readFileSync('src/pages/' + p, 'utf8');
      assert.ok(!src.includes('onboarding.js') && !src.includes('onboarding.css'), p);
    }
  });
});

// ---------------------------------------------------------------- yükseltme penceresi
describe('upgrade modal: only on app pages, script and styles in their own files', () => {
  it('Layout renders it only when isAppPage and links its CSS as the last stylesheet of the app head block', () => {
    assert.match(layout, /\{isAppPage && <UpgradeModal \/>\}/);
    assert.ok(!/^\s*<UpgradeModal \/>/m.test(layout));
    const block = layout.slice(layout.indexOf('{isAppPage && (', layout.indexOf('<slot name="head" />')), layout.indexOf('{spa && <SpaRouter />}'));
    const sheets = [...block.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(sheets[sheets.length - 1], '/components/upgrade-modal/upgrade-modal.css');
  });

  it('the component keeps the markup and loads the script parser-blocking at the same place (no inline script, no style)', () => {
    assert.ok(!/<style[\s>]/.test(modalAstro), 'no scoped <style> (Astro would link it on every Layout page)');
    assert.equal((modalAstro.match(/<script\b/g) || []).length, 1);
    assert.match(modalAstro, /<\/div>\n\n\{\/\*[\s\S]*?\*\/\}\n<script src="\/components\/upgrade-modal\/upgrade-modal\.js" is:inline><\/script>\n$/);
    assert.ok(!/upgrade-modal\.js"[^>]*\b(defer|async)\b/.test(modalAstro), 'must run before parsing ends (callers check typeof openUpgradeModal)');
  });

  it('every ww-up-* element carries the stable scope attribute', () => {
    const classed = [...modalAstro.matchAll(/<[a-z0-9]+\b[^>]*?\bclass="ww-up-[^"]*"[^>]*>/g)];
    assert.ok(classed.length >= 25);
    for (const m of classed) assert.match(m[0], /\sdata-ww-up\s/, m[0]);
  });

  it('CSS: scoped with [data-ww-up] on every compound like Astro did (same specificity), no Astro leftovers', () => {
    const body = modalCss.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/data-astro-cid|:global\(/.test(body));
    const selectors = [...body.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim()).filter((s) => !s.startsWith('@'));
    assert.ok(selectors.length > 40);
    const created = /^\.ww-up-(feat-item|check-svg)$/;    // updateModalUI'nin kurduğu elemanlar: kapsamlı ızgaranın içinde
    for (const sel of selectors) {
      for (const part of sel.split(',')) {
        const compounds = part.trim().split(/\s+/);
        compounds.forEach((c, i) => {
          if (c.startsWith('body')) return;
          if (created.test(c)) return assert.match(compounds[i - 1], /^\.ww-up-features-grid\[data-ww-up\]$/, part);
          assert.match(c, /^\.ww-up-[a-z-]+(\.[a-z-]+)*\[data-ww-up\](:{1,2}[a-z-]+)?$/, part);
        });
      }
    }
    assert.match(modalCss, /\.ww-up-backdrop\.active\[data-ww-up\] \.ww-up-modal\[data-ww-up\] \{/);
    assert.match(modalCss, /body\.light-theme \.ww-up-btn-primary\[data-ww-up\]:hover \{/);
  });

  it('upgrade-modal.js defines open/close synchronously and binds its controls on DOMContentLoaded', () => {
    const listeners = {};
    const classes = new Set();
    const backdrop = {
      style: { display: 'none' },
      classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c), toggle() {} },
      addEventListener() {},
    };
    const timers = [];
    const raf = [];
    const doc = {
      body: { style: {} },
      documentElement: { getAttribute: () => null },
      getElementById: (id) => (id === 'ww-upgrade-modal-backdrop' ? backdrop : null),
      querySelectorAll: () => [],
      addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    };
    const win = { document: doc, location: { pathname: '/dashboard', href: '' }, localStorage: { getItem: () => null }, sessionStorage: { getItem: () => null },
      requestAnimationFrame: (f) => raf.push(f), setTimeout: (f) => timers.push(f) };
    win.window = win;
    vm.runInNewContext(modalJs, win);
    assert.equal(typeof win.openUpgradeModal, 'function', 'defined before DOMContentLoaded');
    assert.equal(typeof win.closeUpgradeModal, 'function');
    assert.equal(listeners.DOMContentLoaded.length, 1);
    win.openUpgradeModal({ feature: 'journal' });
    assert.equal(backdrop.style.display, 'flex');
    raf.forEach((f) => f());
    assert.ok(classes.has('active'));
    assert.equal(doc.body.style.overflow, 'hidden');
    listeners.DOMContentLoaded[0]();
    listeners.keydown.forEach((f) => f({ key: 'Escape' }));
    assert.ok(!classes.has('active'), 'Escape closes');
    timers.forEach((f) => f());
    assert.equal(backdrop.style.display, 'none');
    assert.equal(doc.body.style.overflow, '');
  });
});

// ---------------------------------------------------------------- note-tools, prop-montecarlo
describe('page-specific helpers left the shared layout', () => {
  it('note-tools: add-trade loads it itself (Quick Add loads it with the modal, see quick-add-lazy.test.js)', () => {
    const add = fs.readFileSync('src/pages/add-trade.astro', 'utf8');
    const head = add.slice(add.indexOf('<Fragment slot="head">'), add.indexOf('</Fragment>'));
    assert.match(head, /<link rel="stylesheet" href="\/components\/note-tools\/note-tools\.css" \/>/);
    assert.match(head, /<script src="\/components\/note-tools\/note-tools\.js" is:inline defer><\/script>/);
    assert.match(add, /<textarea id="notes"/);
    assert.ok(!layout.includes('/components/note-tools/'));
  });

  it('prop-montecarlo: only the dashboard loads it (the free tool page has its own copy)', () => {
    assert.ok(!layout.includes('/src/utils/prop-montecarlo.js'));
    assert.match(fs.readFileSync('src/pages/dashboard.astro', 'utf8'), /<script src="\/src\/utils\/prop-montecarlo\.js" is:inline defer><\/script>/);
    const users = [];
    // readdirSync({ recursive }) Windows'ta "tools\x.astro" verir: karşılaştırma için "/" ayracına çevrilir
    for (const p of fs.readdirSync('src/pages', { recursive: true }).map((x) => String(x).replace(/\\/g, '/'))) {
      if (p.endsWith('.astro') && fs.readFileSync('src/pages/' + p, 'utf8').includes('PropMonteCarlo')) users.push(p);
    }
    // Dashboard'ın sayfa script'i satır içinden public/interface/dashboard/js/dashboard-page.js'e taşındı
    const DASH_PAGE_JS = 'public/interface/dashboard/js/dashboard-page.js';
    assert.ok(users.every((u) => ['dashboard.astro', 'tools/prop-firm-pass-probability.astro'].includes(u)), users.join());
    assert.ok(users.includes('tools/prop-firm-pass-probability.astro'));
    assert.ok(users.includes('dashboard.astro') || fs.readFileSync(DASH_PAGE_JS, 'utf8').includes('PropMonteCarlo'), 'the dashboard still uses it');
    for (const p of ['public/components', 'public/interface', 'public/src']) {
      for (const f of fs.readdirSync(p, { recursive: true })) {
        const file = p + '/' + String(f).replace(/\\/g, '/');
        if (!file.endsWith('.js') || file.endsWith('prop-montecarlo.js') || file.endsWith('bundle.js') || file === DASH_PAGE_JS) continue;
        assert.ok(!fs.readFileSync(file, 'utf8').includes('PropMonteCarlo'), file + ' uses PropMonteCarlo: it is only on the dashboard now');
      }
    }
  });
});
