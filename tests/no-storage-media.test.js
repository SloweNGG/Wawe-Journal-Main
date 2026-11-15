// Supabase Storage'dan sabit adresle medya verilmez (fix/live-traffic 1a). 10–23 Ekim 2026'da landing'deki iki video
// (landing-assets/*.mp4, autoplay + preload=auto) her ziyaretçide Storage'dan iniyordu → cached egress kotası.
// Herkese açık / büyük dosyalar public/ altından (Cloudflare) verilir; Storage yalnızca kullanıcı yüklemeleri içindir.
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

describe('no hard-coded Supabase Storage media', () => {
  it('src/ and public/ contain no supabase.co/storage URL', () => {
    const files = [...walk('src'), ...walk('public')].filter((f) => /\.(astro|html|css|m?js|tsx?|json|webmanifest|xml)$/.test(f));
    const hits = files.filter((f) => /supabase\.co\/storage\//.test(fs.readFileSync(f, 'utf8')));
    assert.deepEqual(hits, []);
  });

  it('no <video> / <audio> source points to another origin', () => {
    const files = walk('src').filter((f) => f.endsWith('.astro'));
    const hits = [];
    for (const f of files) {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/<(?:video|audio|source)\b[^>]*\ssrc=["'](https?:)?\/\/[^"']+/gi)) hits.push(f + ': ' + m[0].slice(0, 120));
    }
    assert.deepEqual(hits, []);
  });
});
