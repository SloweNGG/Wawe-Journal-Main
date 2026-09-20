import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function minifyDistAssets() {
  return {
    name: 'minify-dist-assets',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        const outDirPath = typeof dir === 'string' ? dir : fileURLToPath(dir);
        let count = 0;
        let originalBytes = 0;
        let minifiedBytes = 0;

        function processDir(currentDir) {
          const entries = fs.readdirSync(currentDir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
              processDir(fullPath);
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              if (ext === '.js' || ext === '.css') {
                try {
                  const content = fs.readFileSync(fullPath, 'utf8');
                  originalBytes += Buffer.byteLength(content, 'utf8');
                  const result = esbuild.transformSync(content, {
                    loader: ext === '.js' ? 'js' : 'css',
                    minify: true,
                    legalComments: 'none',
                  });
                  if (result.code) {
                    fs.writeFileSync(fullPath, result.code, 'utf8');
                    minifiedBytes += Buffer.byteLength(result.code, 'utf8');
                    count++;
                  }
                } catch (err) {
                  console.warn(`[minify-dist-assets] Could not minify ${fullPath}:`, err.message);
                }
              }
            }
          }
        }

        console.log('⚡ [minify-dist-assets] Minifying static JS & CSS in dist...');
        processDir(outDirPath);
        const savedKb = ((originalBytes - minifiedBytes) / 1024).toFixed(1);
        const ratio = originalBytes > 0 ? (((originalBytes - minifiedBytes) / originalBytes) * 100).toFixed(1) : '0';
        console.log(`✅ [minify-dist-assets] Minified ${count} files. Saved ${savedKb} KB (-${ratio}%).`);
      },
    },
  };
}

export default defineConfig({
  site: 'https://wawejournal.com',
  outDir: 'dist',
  integrations: [react(), minifyDistAssets()],
  build: {
    // Orijinal siteyle birebir aynı URL yapısını (dashboard.html, trades.html, ...)
    // korumak için 'file' formatını kullanıyoruz. Böylece navbar.js, script.js
    // ve diğer JS dosyalarındaki tüm "location.href = 'xxx.html'" ve
    // href="xxx.html" bağlantıları hiç dokunulmadan çalışmaya devam ediyor.
    format: 'file',
  },
});

