// ============================================================
// ARKA PLAN SAHNELERİ (Ayarlar > Görünüm > Arka plan) — SVG üreticisi
// ============================================================
// Kullanım: node scripts/gen-backgrounds.mjs
// public/images/backgrounds/*.svg dosyalarını üretir (repoya eklenir). Her sahne katmanlı sırt çizgileri, çam/yaprak
// siluetleri, sis bantları, gökyüzü geçişi ve (sahneye göre) güneş, ay ya da yıldızlardan oluşur. Rastgelelik sabit
// tohumlu: betik her çalıştırmada aynı dosyaları üretir. Sahne listesi ve renkleri aşağıda; uygulamadaki karşılıkları
// public/components/ambient/ambient.js içindeki CATALOG'da (dosya adı = sahne kimliği).
// ============================================================
import fs from 'node:fs';
import path from 'node:path';

const W = 1600, H = 900;
const OUT = path.resolve('public/images/backgrounds');

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 1B gürültü: birkaç sinüsün toplamı (rastgele faz/frekans). sharp: zirveli (dağ) sırt.
function noise(seed, octaves, sharp) {
  const r = rng(seed);
  const waves = Array.from({ length: octaves }, (_, i) => ({ f: (0.0016 + r() * 0.0012) * Math.pow(2.1, i), p: r() * Math.PI * 2, a: Math.pow(0.52, i) }));
  const norm = waves.reduce((s, w) => s + w.a, 0);
  return (x) => {
    let v = 0;
    for (const w of waves) {
      const s = Math.sin(x * w.f + w.p);
      v += w.a * (sharp ? 1 - Math.abs(s) * 2 : s);
    }
    return v / norm; // ~[-1, 1]
  };
}

const f = (n) => Math.round(n);

function ridgePath(y0, amp, seed, opt = {}) {
  const n = noise(seed, opt.octaves || 5, opt.sharp);
  const step = opt.step || 12;
  const pts = [];
  for (let x = -20; x <= W + 20; x += step) pts.push([x, y0 - amp * n(x)]);
  return { d: 'M-20 ' + H + ' L' + pts.map((p) => f(p[0]) + ' ' + f(p[1])).join(' L') + ' L' + (W + 20) + ' ' + H + 'Z', at: (x) => y0 - amp * n(x) };
}

// çam silueti: uç, sağda dişli kenar, gövde, solda geri
function pine(x, base, h, r) {
  const tiers = 4 + Math.floor(r() * 3), w = h * (0.34 + r() * 0.08), top = base - h, pts = [[x, top]];
  for (let i = 1; i <= tiers; i++) {
    const t = i / tiers, y = top + h * 0.92 * t, ww = (w / 2) * (0.35 + 0.65 * t);
    pts.push([x + ww, y], [x + ww * 0.42, y - h * 0.05]);
  }
  pts.pop();
  const tw = Math.max(2, w * 0.07);
  pts.push([x + tw, base - h * 0.08], [x + tw, base + 4], [x - tw, base + 4], [x - tw, base - h * 0.08]);
  const left = pts.slice(1, -4).map((p) => [2 * x - p[0], p[1]]).reverse();
  return 'M' + pts.concat(left).map((p) => f(p[0]) + ' ' + f(p[1])).join(' L') + 'Z';
}

// yapraklı ağaç: üst üste binen daireler
function broadleaf(x, base, h, r) {
  const parts = [], cr = h * 0.2;
  for (let i = 0; i < 6; i++) {
    const cx = x + (r() - 0.5) * cr * 1.6, cy = base - h * 0.62 - (r() - 0.4) * cr * 1.6, rr = cr * (0.6 + r() * 0.5);
    parts.push(`M${f(cx - rr)} ${f(cy)}a${f(rr)} ${f(rr)} 0 1 0 ${f(rr * 2)} 0a${f(rr)} ${f(rr)} 0 1 0 ${f(-rr * 2)} 0Z`);
  }
  parts.push(`M${f(x - 3)} ${f(base - h * 0.3)}h6v${f(h * 0.3 + 4)}h-6Z`);
  return parts.join('');
}

function treeLine(ridge, seed, o) {
  const r = rng(seed);
  const out = [];
  for (let x = -10; x < W + 10; x += o.gap * (0.55 + r() * 0.9)) {
    if (o.clearings && r() < o.clearings) continue;
    const h = o.h * (0.6 + r() * 0.7);
    const base = ridge.at(x) + 6 + r() * 6;
    out.push(o.kind === 'broad' || (o.kind === 'mixed' && r() < 0.45) ? broadleaf(x, base, h * 0.8, r) : pine(x, base, h, r));
  }
  return out.join('');
}

function stars(seed, count, maxY, color) {
  const r = rng(seed);
  let s = '';
  for (let i = 0; i < count; i++) {
    const y = Math.pow(r(), 1.6) * maxY, rad = r() < 0.08 ? 1.6 : 0.6 + r() * 0.7;
    s += `<circle cx="${f(r() * W)}" cy="${f(y)}" r="${rad.toFixed(1)}" opacity="${(0.35 + r() * 0.65).toFixed(2)}"/>`;
  }
  return `<g fill="${color}">${s}</g>`;
}

function svg(id, sky, body, defs = '') {
  const stops = sky.map((c, i) => `<stop offset="${(i / (sky.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient>${defs}</defs><rect width="${W}" height="${H}" fill="url(#sky)"/>${body}</svg>\n`;
}

// yatay sis bandı (alttan üste solan)
function fog(id, color, y, h, op) {
  return { def: `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0"/><stop offset=".55" stop-color="${color}" stop-opacity="${op}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient>`, el: `<rect y="${y}" width="${W}" height="${h}" fill="url(#${id})"/>` };
}

function glowDef(id, color, op) {
  return `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${op}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
}

// ── Orman sahneleri ──────────────────────────────────────────
function forest(id, o) {
  let defs = '', body = '';
  if (o.stars) body += stars(o.seed + 1, o.stars, H * 0.5, '#e6ecff');
  if (o.moon) {
    defs += glowDef('mg', o.moon.glow, 0.45);
    body += `<circle cx="${o.moon.x}" cy="${o.moon.y}" r="170" fill="url(#mg)"/><circle cx="${o.moon.x}" cy="${o.moon.y}" r="34" fill="${o.moon.color}"/>`;
  }
  o.layers.forEach((L, i) => {
    const ridge = ridgePath(L.y, L.amp, o.seed + i * 17, { octaves: 4 });
    const fg = fog('f' + i, o.fog, L.y - 120, 260, L.fog);
    defs += fg.def;
    body += `<g fill="${L.color}"><path d="${ridge.d}"/><path d="${treeLine(ridge, o.seed + i * 31, { gap: L.gap, h: L.h, kind: o.kind, clearings: 0.08 })}"/></g>` + fg.el;
  });
  return svg(id, o.sky, body, defs);
}

// ── Dağ / günün saati sahneleri ─────────────────────────────
function landscape(id, o) {
  let defs = '', body = '';
  if (o.stars) body += stars(o.seed + 1, o.stars, H * 0.55, o.starColor || '#ffffff');
  if (o.sun) {
    defs += glowDef('sg', o.sun.glow, o.sun.glowOp || 0.6);
    body += `<circle cx="${o.sun.x}" cy="${o.sun.y}" r="${o.sun.halo || 260}" fill="url(#sg)"/><circle cx="${o.sun.x}" cy="${o.sun.y}" r="${o.sun.r}" fill="${o.sun.color}"/>`;
  }
  if (o.clouds) {
    const r = rng(o.seed + 5);
    let c = '';
    for (let i = 0; i < o.clouds.n; i++) {
      const cx = r() * W, cy = 80 + r() * 220, w = 120 + r() * 220;
      c += `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(w)}" ry="${f(w * 0.16)}"/><ellipse cx="${f(cx + w * 0.3)}" cy="${f(cy - w * 0.08)}" rx="${f(w * 0.5)}" ry="${f(w * 0.14)}"/>`;
    }
    body += `<g fill="${o.clouds.color}" opacity="${o.clouds.op}">${c}</g>`;
  }
  o.ridges.forEach((L, i) => {
    const ridge = ridgePath(L.y, L.amp, o.seed + i * 13, { octaves: 6, sharp: true, step: 8 });
    let layer = `<path d="${ridge.d}"/>`;
    if (L.trees) layer += `<path d="${treeLine(ridge, o.seed + i * 29, { gap: L.trees.gap, h: L.trees.h, kind: 'pine', clearings: 0.2 })}"/>`;
    body += `<g fill="${L.color}">${layer}</g>`;
    if (L.mist) { const m = fog('m' + i, o.mist, L.y - 60, 200, L.mist); defs += m.def; body += m.el; }
  });
  return svg(id, o.sky, body, defs);
}

const SCENES = {
  // orman
  'forest-pine': () => forest('forest-pine', { seed: 11, kind: 'pine', sky: ['#050d0a', '#0a1c16', '#163a2e'], fog: '#6fbf9d',
    layers: [{ y: 520, amp: 60, color: '#123329', gap: 16, h: 70, fog: 0.16 }, { y: 610, amp: 50, color: '#0d281f', gap: 22, h: 110, fog: 0.12 },
      { y: 700, amp: 40, color: '#081b15', gap: 30, h: 160, fog: 0.08 }, { y: 800, amp: 30, color: '#040e0a', gap: 42, h: 230, fog: 0 }] }),
  'forest-mist': () => forest('forest-mist', { seed: 23, kind: 'pine', sky: ['#0b1214', '#1a2a2d', '#3a5257'], fog: '#b9d3d4',
    layers: [{ y: 500, amp: 50, color: '#2c4246', gap: 15, h: 60, fog: 0.32 }, { y: 590, amp: 45, color: '#20343a', gap: 20, h: 100, fog: 0.28 },
      { y: 690, amp: 40, color: '#15252a', gap: 28, h: 150, fog: 0.22 }, { y: 800, amp: 30, color: '#0a1417', gap: 40, h: 220, fog: 0 }] }),
  'forest-autumn': () => forest('forest-autumn', { seed: 37, kind: 'mixed', sky: ['#150a07', '#3a1a0c', '#8a4318'], fog: '#ffb066',
    layers: [{ y: 520, amp: 55, color: '#8a4a1c', gap: 14, h: 70, fog: 0.18 }, { y: 610, amp: 45, color: '#6b3014', gap: 18, h: 110, fog: 0.12 },
      { y: 700, amp: 40, color: '#45200d', gap: 24, h: 160, fog: 0.08 }, { y: 800, amp: 30, color: '#1c0d06', gap: 34, h: 230, fog: 0 }] }),
  'forest-night': () => forest('forest-night', { seed: 41, kind: 'pine', sky: ['#03050f', '#081028', '#142045'], fog: '#5f7bd6', stars: 170,
    moon: { x: 1180, y: 190, color: '#eef1ff', glow: '#9fb3ff' },
    layers: [{ y: 540, amp: 55, color: '#101a36', gap: 16, h: 70, fog: 0.14 }, { y: 630, amp: 45, color: '#0b1329', gap: 22, h: 110, fog: 0.1 },
      { y: 720, amp: 40, color: '#070c1c', gap: 30, h: 160, fog: 0.06 }, { y: 810, amp: 30, color: '#03060f', gap: 42, h: 230, fog: 0 }] }),
  // dağ
  'mountain-ridges': () => landscape('mountain-ridges', { seed: 53, sky: ['#060a16', '#0f1a33', '#2a3f66'], mist: '#9bb4e6',
    ridges: [{ y: 470, amp: 210, color: '#2b3d63', mist: 0.2 }, { y: 560, amp: 170, color: '#1f2e4d', mist: 0.15 }, { y: 650, amp: 130, color: '#152139', mist: 0.1 },
      { y: 740, amp: 90, color: '#0d1526', mist: 0.06 }, { y: 830, amp: 55, color: '#060b15' }] }),
  // günün saati (aynı vadi, dört ışık)
  'daytime-dawn': () => landscape('daytime-dawn', { seed: 61, sky: ['#141933', '#4b3a66', '#c9708a', '#f6b38a'], mist: '#ffd2b3',
    sun: { x: 560, y: 560, r: 46, color: '#ffe2b8', glow: '#ffb38a', halo: 380, glowOp: 0.7 }, stars: 40, starColor: '#ffe9f0',
    ridges: [{ y: 520, amp: 110, color: '#6b4a7a', mist: 0.22 }, { y: 610, amp: 90, color: '#4a3560', mist: 0.16 },
      { y: 700, amp: 70, color: '#2e2244', trees: { gap: 26, h: 90 }, mist: 0.08 }, { y: 810, amp: 45, color: '#171226', trees: { gap: 40, h: 170 } }] }),
  'daytime-day': () => landscape('daytime-day', { seed: 61, sky: ['#2d6fb8', '#5a9fd8', '#a9d6f2', '#dcefff'], mist: '#ffffff',
    sun: { x: 1220, y: 150, r: 40, color: '#fffbe8', glow: '#fff4c2', halo: 300, glowOp: 0.55 }, clouds: { n: 7, color: '#ffffff', op: 0.55 },
    ridges: [{ y: 520, amp: 110, color: '#7ea3c8', mist: 0.25 }, { y: 610, amp: 90, color: '#5c8a7a', mist: 0.16 },
      { y: 700, amp: 70, color: '#3d6b4f', trees: { gap: 26, h: 90 }, mist: 0.08 }, { y: 810, amp: 45, color: '#1f4430', trees: { gap: 40, h: 170 } }] }),
  'daytime-dusk': () => landscape('daytime-dusk', { seed: 61, sky: ['#1a1033', '#5b2a5e', '#d4573a', '#f59e47'], mist: '#ff9f6b',
    sun: { x: 1040, y: 560, r: 56, color: '#ffcf7a', glow: '#ff7a3d', halo: 420, glowOp: 0.75 },
    ridges: [{ y: 520, amp: 110, color: '#7a3550', mist: 0.2 }, { y: 610, amp: 90, color: '#56264a', mist: 0.14 },
      { y: 700, amp: 70, color: '#351a36', trees: { gap: 26, h: 90 }, mist: 0.06 }, { y: 810, amp: 45, color: '#1a0d1c', trees: { gap: 40, h: 170 } }] }),
  'daytime-night': () => landscape('daytime-night', { seed: 61, sky: ['#02040c', '#060c22', '#101c40'], mist: '#6f86d9', stars: 220, starColor: '#eef2ff',
    sun: { x: 1180, y: 170, r: 30, color: '#f1f4ff', glow: '#9fb3ff', halo: 220, glowOp: 0.45 },
    ridges: [{ y: 520, amp: 110, color: '#18234a', mist: 0.14 }, { y: 610, amp: 90, color: '#111a38', mist: 0.1 },
      { y: 700, amp: 70, color: '#0b1128', trees: { gap: 26, h: 90 }, mist: 0.05 }, { y: 810, amp: 45, color: '#050816', trees: { gap: 40, h: 170 } }] }),
};

fs.mkdirSync(OUT, { recursive: true });
for (const [id, make] of Object.entries(SCENES)) {
  const file = path.join(OUT, id + '.svg');
  fs.writeFileSync(file, make());
  console.log(id.padEnd(18), (fs.statSync(file).size / 1024).toFixed(1) + ' KB');
}
