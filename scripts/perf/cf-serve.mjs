// ============================================================
// CLOUDFLARE PAGES BENZERİ YEREL SUNUCU (yalnızca ölçüm) — scripts/perf/cf-serve.mjs
// ============================================================
// `astro preview` sıkıştırma yapmaz ve public/_headers'ı uygulamaz; tekrar ziyaret / önbellek ölçümü için bu sunucu:
//   - dist/_headers kurallarını uygular (tek splat; aynı dosyaya uyan kurallar virgülle birleşir, Cloudflare gibi)
//   - kural yoksa Cache-Control: public, max-age=0, must-revalidate + ETag (304)
//   - /dashboard → dashboard.html, gzip
// Kullanım: node scripts/perf/cf-serve.mjs [dist] [port]
// ============================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const root = path.resolve(process.argv[2] || 'dist');
const port = +process.argv[3] || 8788;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.xml': 'application/xml' };

const rules = [];
let cur = null;
const hf = path.join(root, '_headers');
for (const line of fs.existsSync(hf) ? fs.readFileSync(hf, 'utf8').split(/\r?\n/) : []) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  if (!/^\s/.test(line)) { cur = { re: new RegExp('^' + line.trim().split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'), h: {} }; rules.push(cur); continue; }
  const m = line.trim().match(/^([^:]+):\s*(.*)$/);
  if (m && cur) cur.h[m[1].toLowerCase()] = m[2];
}

http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(root, p);
  if (p.endsWith('/')) file = path.join(file, 'index.html');
  else if (!path.extname(p) && fs.existsSync(file + '.html')) file += '.html';
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('404'); }
  const body = fs.readFileSync(file);
  const etag = '"' + crypto.createHash('md5').update(body).digest('hex') + '"';
  const headers = { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', ETag: etag };
  const merged = {};
  for (const r of rules) if (r.re.test(p)) for (const [k, v] of Object.entries(r.h)) merged[k] = merged[k] ? merged[k] + ', ' + v : v;
  headers['Cache-Control'] = merged['cache-control'] || 'public, max-age=0, must-revalidate';
  for (const [k, v] of Object.entries(merged)) if (k !== 'cache-control') headers[k] = v;
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
  const gz = /gzip/.test(req.headers['accept-encoding'] || '') && /text|javascript|json|svg|xml|manifest/.test(headers['Content-Type']);
  if (gz) headers['Content-Encoding'] = 'gzip';
  res.writeHead(200, headers);
  res.end(gz ? zlib.gzipSync(body) : body);
}).listen(port, '127.0.0.1', () => console.log(`cf-serve ${root} → http://127.0.0.1:${port} (_headers kuralı: ${rules.length})`));
