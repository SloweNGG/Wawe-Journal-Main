// public/interface/shared/lazy-load.js — WwLazy.loadScriptOnce / loadScriptsInOrder / whenVisible / busy
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync('public/interface/shared/lazy-load.js', 'utf8');

// Sahte DOM: head.appendChild(script) → bir sonraki turda onload/onerror
function env({ fail = () => false, io = true } = {}) {
  const added = [];
  const observers = [];
  const classList = () => {
    const set = new Set();
    return { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) };
  };
  const document = {
    createElement: (tag) => ({ tag, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, remove() { this.removed = true; } }),
    head: {
      appendChild(el) {
        added.push(el);
        if (el.tag === 'script') setImmediate(() => (fail(el.src) ? el.onerror() : el.onload()));
      },
    },
  };
  const ctx = {
    window: {},
    document,
    location: { href: 'https://wawejournal.com/dashboard', origin: 'https://wawejournal.com' },
    URL,
    Promise,
    setTimeout,
    clearTimeout,
    setImmediate,
  };
  if (io) {
    ctx.IntersectionObserver = class {
      constructor(cb, opts) { this.cb = cb; this.opts = opts; this.els = []; observers.push(this); }
      observe(el) { this.els.push(el); }
      disconnect() { this.off = true; }
      fire(el) { if (!this.off) this.cb([{ target: el, isIntersecting: true }]); }
    };
  }
  ctx.window = ctx;
  vm.runInNewContext(SRC, ctx);
  return { W: ctx.WwLazy, ctx, added, observers, classList };
}

describe('WwLazy.loadScriptOnce', () => {
  it('loads a URL once; concurrent and later calls share the same Promise (?v= ignored)', async () => {
    const { W, added } = env();
    const a = W.loadScriptOnce('/interface/quick-add/js/quick-add.js?v=1');
    const b = W.loadScriptOnce('/interface/quick-add/js/quick-add.js?v=1');
    const c = W.loadScriptOnce('https://wawejournal.com/interface/quick-add/js/quick-add.js?v=2');
    assert.equal(a, b);
    assert.equal(a, c);
    await a;
    assert.equal(added.filter((e) => e.tag === 'script').length, 1);
    assert.equal(W.loadScriptOnce('/interface/quick-add/js/quick-add.js?v=1'), a);
  });

  it('skips loading when test() says the library is already there', async () => {
    const { W, added } = env();
    await W.loadScriptOnce('https://cdn.jsdelivr.net/npm/apexcharts@8.2.0', { test: () => true });
    assert.equal(added.length, 0);
  });

  it('a failed load rejects, removes its tag and can be retried', async () => {
    let broken = true;
    const { W, added } = env({ fail: () => broken });
    await assert.rejects(W.loadScriptOnce('/x.js'), /yüklenemedi/);
    assert.ok(added[0].removed);
    broken = false;
    await W.loadScriptOnce('/x.js');
    assert.equal(added.length, 2);
  });

  it('loadScriptsInOrder inserts all with async=false (parallel download, ordered run)', async () => {
    const { W, added } = env();
    await W.loadScriptsInOrder(['/a.js', '/b.js', { url: '/c.js', test: () => true }]);
    assert.deepEqual(added.map((e) => e.src), ['/a.js', '/b.js']);
    assert.ok(added.every((e) => e.async === false && 'data-ww-lazy' in e.attrs));
    assert.equal(window_global(W), true);
  });
});

function window_global(W) {
  return typeof W.loadScriptOnce === 'function' && typeof W.whenVisible === 'function';
}

describe('WwLazy.whenVisible', () => {
  it('runs once when any element comes near, with the 300px margin', () => {
    const { W, observers } = env();
    let n = 0;
    const el1 = {}, el2 = {};
    W.whenVisible([el1, el2], () => n++);
    assert.equal(observers[0].opts.rootMargin, '300px');
    observers[0].fire(el2);
    observers[0].fire(el1);
    assert.equal(n, 1);
  });

  it('runs immediately without IntersectionObserver or elements; cancel stops it', () => {
    const noIo = env({ io: false });
    let n = 0;
    noIo.W.whenVisible({}, () => n++);
    assert.equal(n, 1);
    const withIo = env();
    const cancel = withIo.W.whenVisible({}, () => n++);
    cancel();
    withIo.observers[0].fire({});
    assert.equal(n, 1);
  });
});

describe('WwLazy.busy', () => {
  it('marks the trigger only if loading takes longer than 120 ms, then clears it', async () => {
    const { W, classList } = env();
    const mk = () => ({ classList: classList(), attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } });
    const fast = mk();
    await W.busy(fast, Promise.resolve());
    await new Promise((r) => setTimeout(r, 150));
    assert.ok(!fast.classList.contains('ww-lazy-busy'));
    const slow = mk();
    let done;
    const p = W.busy(slow, new Promise((r) => (done = r)));
    await new Promise((r) => setTimeout(r, 150));
    assert.ok(slow.classList.contains('ww-lazy-busy') && slow.attrs['aria-busy'] === 'true');
    done();
    await p;
    assert.ok(!slow.classList.contains('ww-lazy-busy') && !('aria-busy' in slow.attrs));
  });
});
