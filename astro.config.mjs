import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { assetVersionIntegration } from './scripts/asset-version.mjs';
import { minifyDistAssets } from './scripts/minify-dist.mjs';
import { sitemapIntegration } from './scripts/sitemap.mjs';
import { localizeIntegration } from './scripts/localize.mjs';

// Her derlemeye özel TEK kimlik. Kullanıldığı yerler:
//  - SpaRouter <meta name="ww-build">: açık sekmede deploy sonrası eski/yeni script karışmasın diye tam yükleme
//  - yalnızca çözülemeyen ?v=__WW_BUILD_ID__ jetonlarının yedeği; yerel JS/CSS/font referansları dosya başına içerik
//    hash'i alır (bkz. scripts/asset-version.mjs) → _headers'ta immutable önbellek, değişmeyen dosya deploy'da yeniden inmez
//  - sw.js önbellek adı (her deploy'da eski SW önbelleği silinir)
// Yalnızca rakam olmalı. WW_BUILD_ID ortam değişkeni ile sabitlenebilir (ör. aynı commit'i yeniden derlerken).
const BUILD_ID = process.env.WW_BUILD_ID || String(Date.now());

function bundleAppScript() {
  const buildBundle = () => {
    try {
      const entry = path.resolve('public/src/script.js');
      const outfile = path.resolve('public/src/bundle.js');
      if (fs.existsSync(entry)) {
        esbuild.buildSync({
          entryPoints: [entry],
          bundle: true,
          format: 'esm',
          outfile: outfile,
          minify: true,
          legalComments: 'none',
        });
        console.log('⚡ [bundle-app-script] Built public/src/bundle.js successfully.');
      }
    } catch (err) {
      console.error('[bundle-app-script] Error bundling public/src/script.js:', err.message);
    }
  };

  return {
    name: 'bundle-app-script',
    hooks: {
      'astro:config:setup': () => {
        buildBundle();
      },
      'astro:build:start': () => {
        buildBundle();
      },
    },
  };
}

export default defineConfig({
  site: 'https://wawejournal.com',
  outDir: 'dist',
  // Geliştirme araç çubuğu localhost'ta alt paneldeki tabloların üstünü kapatıyordu
  devToolbar: { enabled: false },
  // build:done kancaları sırayla çalışır. asset-version son baytlardan içerik hash'i hesaplar, bu yüzden dist'i
  // değiştiren her adım ondan ÖNCE: minify (JS/CSS dosyaları + HTML'deki satır içi script'ler, scripts/minify-dist.mjs)
  // → asset-version.
  // localize (/tr/, /de/ kopyaları) damgalanmış HTML'den üretir → asset-version'dan sonra; sitemap onları da görsün → sitemap'ten önce.
  integrations: [
    react(),
    bundleAppScript(),
    minifyDistAssets(),
    assetVersionIntegration(BUILD_ID),
    localizeIntegration(),
    sitemapIntegration(),
  ],
  vite: {
    build: {
      // Astro derleme hedefini "esnext" yapıyor; bu durumda CSS küçültücü (lightningcss) tarayıcı hedefi olmadan
      // çalışıp önekli/öneksiz çiftlerden birini siliyor ve önek eklemiyordu (ör. backdrop-filter Chrome'da
      // ya da 18 öncesi Safari'de kayboluyordu). Vite'ın kendi varsayılanı (baseline widely available) ile sabitlenir.
      cssTarget: ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'],
    },
    define: {
      // Derleme kimliği (yukarıdaki BUILD_ID): SPA router, açık sekmede deploy sonrası eski ve yeni
      // sürüm script'lerinin karışmaması için sürüm değişince tam sayfa yüklemesi yapar
      __WW_BUILD_ID__: JSON.stringify(BUILD_ID),
    },
  },
  build: {
    // Orijinal siteyle birebir aynı URL yapısını (dashboard.html, trades.html, ...)
    // korumak için 'file' formatını kullanıyoruz. Böylece navbar.js, script.js
    // ve diğer JS dosyalarındaki tüm "location.href = 'xxx.html'" ve
    // href="xxx.html" bağlantıları hiç dokunulmadan çalışmaya devam ediyor.
    format: 'file',
  },
});

