// public/_headers önbellek kuralları — immutable yalnızca sürümlü (?v=<buildId>) yüklenen dosyalarda
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const IMMUTABLE = 'public, max-age=31536000, immutable';

function parseHeaders(text) {
  const rules = [];
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      cur = { pattern: line.trim(), headers: {} };
      rules.push(cur);
    } else if (cur) {
      const m = line.trim().match(/^([^:]+):\s*(.*)$/);
      if (m) cur.headers[m[1].toLowerCase()] = m[2];
    }
  }
  return rules;
}

// Cloudflare: tek splat (*) her şeyi eşler
function matches(pattern, p) {
  const re = new RegExp('^' + pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return re.test(p);
}

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const f = path.join(d, e.name);
    return e.isDirectory() ? walk(f) : [f];
  });
}

const rules = parseHeaders(fs.readFileSync('public/_headers', 'utf8'));
const publicFiles = walk('public').map((f) => '/' + path.relative('public', f).split(path.sep).join('/'));
const immutableFor = (p) => rules.some((r) => r.headers['cache-control'] === IMMUTABLE && matches(r.pattern, p));

// Uygulamanın açmadığı geliştirici test sayfası (quick-add parser denemesi)
const DEV_ONLY_HTML = new Set(['/interface/quick-add/js/test-broker-formats.html']);

describe('_headers cache rules', () => {
  it('has no catch-all or extension rule (Cloudflare merges every matching rule)', () => {
    for (const r of rules) {
      assert.notEqual(r.pattern, '/*', 'catch-all /* rule');
      assert.ok(!/^\*|\/\*\.[a-z]+$/i.test(r.pattern), 'extension rule ' + r.pattern);
    }
  });

  it('every rule has a single splat at most and no two Cache-Control rules overlap on a real file', () => {
    for (const r of rules) assert.ok((r.pattern.match(/\*/g) || []).length <= 1, r.pattern);
    for (const p of publicFiles) {
      const hits = rules.filter((r) => r.headers['cache-control'] && matches(r.pattern, p));
      assert.ok(hits.length <= 1, p + ' matches ' + hits.map((h) => h.pattern).join(', '));
    }
  });

  it('root JS/CSS files are immutable, except the service worker', () => {
    const root = publicFiles.filter((p) => /^\/[^/]+\.(js|css)$/.test(p));
    assert.ok(root.length > 5);
    for (const p of root) {
      if (p === '/sw.js') assert.ok(!rules.some((r) => matches(r.pattern, p)), '/sw.js must keep the default revalidation');
      else assert.ok(immutableFor(p), p + ' needs an immutable rule in public/_headers');
    }
  });

  it('page scripts, styles, translations and PDF fonts are immutable', () => {
    for (const p of [
      '/interface/dashboard/js/dashboard.js',
      '/interface/analytics/js/helpers.js',
      '/components/navbar/navbar.css',
      '/src/bundle.js',
      '/settings/js/settings.js',
      '/settings/css/settings.css',
      '/i18n/locales/tr.js',
      '/fonts/pdf/DMSans-Bold.ttf',
    ]) {
      assert.ok(immutableFor(p), p);
    }
  });

  it('HTML is never immutable (pages, settings panels, notification partial)', () => {
    const html = publicFiles.filter((p) => p.endsWith('.html') && !DEV_ONLY_HTML.has(p));
    assert.ok(html.some((p) => p.startsWith('/settings/panels/')));
    for (const p of [...html, '/dashboard.html', '/dashboard', '/', '/index.html']) {
      assert.ok(!immutableFor(p), p + ' must not be immutable');
    }
  });

  it('Astro hashed assets stay immutable', () => {
    assert.ok(immutableFor('/_astro/hoisted.abc123.js'));
  });
});
