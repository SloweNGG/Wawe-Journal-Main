import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://wawejournal.com',
  outDir: 'dist',
  build: {
    // Orijinal siteyle birebir aynı URL yapısını (dashboard.html, trades.html, ...)
    // korumak için 'file' formatını kullanıyoruz. Böylece navbar.js, script.js
    // ve diğer JS dosyalarındaki tüm "location.href = 'xxx.html'" ve
    // href="xxx.html" bağlantıları hiç dokunulmadan çalışmaya devam ediyor.
    format: 'file',
  },
});
