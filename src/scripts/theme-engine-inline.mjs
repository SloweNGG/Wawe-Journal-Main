// BaseHead.astro'nun her sayfaya satır içi gömdüğü tema motoru, derlemede küçültülmüş hali (~19 KB -> ~10 KB).
// Bir kez (modül yüklenirken) küçültülür; esbuild Astro/Vite ile birlikte gelir (tests/bundle-sync.test.js de kullanır).
import { transformSync } from 'esbuild';
import raw from './theme-engine.js?raw';

let code = raw;
try {
  code = transformSync(raw, { minify: true, target: 'es2017', legalComments: 'none' }).code.trim();
} catch (e) {
  // küçültme başarısız olursa kaynak olduğu gibi gömülür (site yine çalışır)
  console.warn('[theme-engine] minify failed, inlining source:', e && e.message);
}
export default code;
