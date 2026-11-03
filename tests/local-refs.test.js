// Sayfalardaki yerel <script src> / <link href> adresleri public/'te var olan bir dosyaya çıkmalı (perf 3d:
// quick-add-modal.astro yıllarca repoda hiç olmayan /js/quick-modal.js'i istiyordu → 404).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const f = path.join(d, e.name);
    return e.isDirectory() ? walk(f) : [f];
  });
}

const sources = walk('src').filter((f) => f.endsWith('.astro'));
const REF = /<(?:script|link)\b[^>]*?\s(?:src|href)=["'](\/[^"'?#{}]+\.(?:m?js|css))(?:[?#][^"']*)?["']/g;

describe('local script / stylesheet references', () => {
  it('every local .js / .css referenced from .astro files exists in public/', () => {
    const missing = [];
    for (const f of sources) {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(REF)) {
        if (m[1].startsWith('/_astro/') || m[1].startsWith('//')) continue;
        if (!fs.existsSync(path.join('public', m[1]))) missing.push(f + ' → ' + m[1]);
      }
    }
    assert.deepEqual(missing, []);
  });

  it('the quick add preview page no longer asks for /js/quick-modal.js', () => {
    assert.ok(!fs.readFileSync('src/pages/quick-add-modal.astro', 'utf8').includes('/js/quick-modal.js'));
  });
});
