// ============================================================
// Açılış / destek sayfası ekran görüntülerinin küçük sürümleri (srcset için)
// ============================================================
// Kullanım: node scripts/resize-images.mjs
// src/data/responsive-images.ts'teki her görselden `<ad>-<genişlik>w.webp` üretir (public/ içine, repoya
// eklenir). Kaynak görsel değişirse betiği yeniden çalıştırın. sharp, Astro'nun bağımlılığı olarak
// node_modules'ta zaten var. (Node 22.18+/24 .ts dosyasını doğrudan içe aktarabiliyor.)
// ============================================================

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { VARIANTS, variantPath } from '../src/data/responsive-images.ts';

const pub = path.resolve('public');
for (const [src, { width, sizes }] of Object.entries(VARIANTS)) {
  const input = path.join(pub, src);
  const meta = await sharp(input).metadata();
  if (meta.width !== width) throw new Error(`${src}: gerçek genişlik ${meta.width}, tabloda ${width}`);
  for (const w of sizes) {
    if (w >= width) throw new Error(`${src}: ${w}w kaynak genişliğinden (${width}) küçük olmalı`);
    const out = path.join(pub, variantPath(src, w));
    await sharp(input).resize({ width: w }).webp({ quality: 80, effort: 6 }).toFile(out);
    console.log(`${variantPath(src, w)}  ${(fs.statSync(out).size / 1024).toFixed(1)} KB  (kaynak ${(fs.statSync(input).size / 1024).toFixed(1)} KB)`);
  }
}
