// public/src/bundle.js repoya yazılan bir derleme çıktısı (public/src/script.js'ten). Kaynak değişip bundle yeniden
// üretilmezse sayfalar eski kodu çalıştırır (fix/live-traffic 2b: payment.js Realtime kanalı). `npm run build`
// (astro.config.mjs → bundleAppScript) onu yeniden üretir; ya da tek başına:
//   node_modules/.bin/esbuild public/src/script.js --bundle --format=esm --minify --legal-comments=none --outfile=public/src/bundle.js
// esbuild JS API'si kullanılır: node_modules/.bin/esbuild Windows'ta bir .cmd kabuğu, execFileSync onu çalıştıramıyordu (ENOENT).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildSync } from 'esbuild';

describe('public/src/bundle.js', () => {
  it('matches a fresh esbuild of public/src/script.js', () => {
    // astro.config.mjs → bundleAppScript ile aynı ayarlar
    const { outputFiles } = buildSync({
      entryPoints: ['public/src/script.js'],
      bundle: true,
      format: 'esm',
      minify: true,
      legalComments: 'none',
      outfile: 'public/src/bundle.js',
      write: false,
      logLevel: 'error',
    });
    const fresh = outputFiles[0].text;
    assert.ok(fresh === fs.readFileSync('public/src/bundle.js', 'utf8'), 'bundle.js is stale: rebuild it with the command above');
  });
});
