// public/src/bundle.js repoya yazılan bir derleme çıktısı (public/src/script.js'ten). Kaynak değişip bundle yeniden
// üretilmezse sayfalar eski kodu çalıştırır (fix/live-traffic 2b: payment.js Realtime kanalı). Üretmek için:
//   node_modules/.bin/esbuild public/src/script.js --bundle --format=esm --minify --outfile=public/src/bundle.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

describe('public/src/bundle.js', () => {
  it('matches a fresh esbuild of public/src/script.js', () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ww-bundle-')), 'bundle.js');
    execFileSync(path.join('node_modules', '.bin', 'esbuild'), ['public/src/script.js', '--bundle', '--format=esm', '--minify', '--outfile=' + out, '--log-level=error']);
    const fresh = fs.readFileSync(out, 'utf8');
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
    assert.ok(fresh === fs.readFileSync('public/src/bundle.js', 'utf8'), 'bundle.js is stale: rebuild it with the command above');
  });
});
