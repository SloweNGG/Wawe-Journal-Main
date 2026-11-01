// ============================================================
// WAWE JOURNAL - EKRAN KAYDI YARDIMCILARI (CDP screencast + görünür imleç + yumuşak fare)
// File: scripts/demo/recorder.mjs
// ============================================================
// Headless Chrome imleç çizmez: sayfaya fareyi izleyen bir ok imleci eklenir (pointer-events: none).
// Kayıt: Page.startScreencast (png, her kare) -> kareler zaman damgalarıyla diske -> ffmpeg concat ile
// sabit 30 fps H.264 (crf 14, yuv420p, ses yok).
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

// ── imleç ──────────────────────────────────────────────────
const CURSOR_SCRIPT = () => {
  if (window.__demoCursor) return;
  window.__demoCursor = true;
  const make = () => {
    if (document.getElementById('demo-cursor')) return;
    const el = document.createElement('div');
    el.id = 'demo-cursor';
    el.innerHTML = '<svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M4 2.5 L4 20.5 L8.6 16.3 L11.7 23.2 L15 21.7 L11.9 14.9 L18.2 14.9 Z" fill="#ffffff" stroke="#0b0b0b" stroke-width="1.6" stroke-linejoin="round"/></svg>' +
      '<span class="demo-ring"></span>';
    const st = document.createElement('style');
    st.textContent = '#demo-cursor{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;' +
      'transform:translate(-100px,-100px);filter:drop-shadow(0 1px 2px rgba(0,0,0,.55));will-change:transform}' +
      '#demo-cursor svg{position:absolute;left:-4px;top:-2.5px;transition:transform .12s ease}' +
      '#demo-cursor.down svg{transform:scale(.86)}' +
      '#demo-cursor .demo-ring{position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:50%;border:2px solid rgba(255,255,255,.85);opacity:0;transform:scale(.4)}' +
      '#demo-cursor.click .demo-ring{animation:demoRing .45s ease-out}' +
      '@keyframes demoRing{0%{opacity:.9;transform:scale(.4)}100%{opacity:0;transform:scale(1.5)}}';
    document.documentElement.appendChild(st);
    document.documentElement.appendChild(el);
    const pos = window.__demoCursorPos || { x: -100, y: -100 };
    el.style.transform = 'translate(' + pos.x + 'px,' + pos.y + 'px)';
  };
  const move = (e) => {
    window.__demoCursorPos = { x: e.clientX, y: e.clientY };
    const el = document.getElementById('demo-cursor');
    if (el) el.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)';
  };
  window.addEventListener('mousemove', move, true);
  window.addEventListener('mousedown', () => { const el = document.getElementById('demo-cursor'); if (!el) return; el.classList.add('down'); el.classList.remove('click'); void el.offsetWidth; el.classList.add('click'); }, true);
  window.addEventListener('mouseup', () => { const el = document.getElementById('demo-cursor'); if (el) el.classList.remove('down'); }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', make); else make();
  // tam ekran kökü değişirse imleç görünür kalsın
  document.addEventListener('fullscreenchange', () => { const el = document.getElementById('demo-cursor'); if (el) document.documentElement.appendChild(el); });
};
export async function installCursor(context) { await context.addInitScript(CURSOR_SCRIPT); }

// ── yumuşak fare ───────────────────────────────────────────
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export function mouse(page, start = { x: 960, y: 540 }) {
  const m = { x: start.x, y: start.y };
  // hedefe en az 25 adımda, ease-in-out ile
  m.moveTo = async (x, y, ms = 650) => {
    const steps = Math.max(28, Math.round(ms / 18)), x0 = m.x, y0 = m.y, t0 = Date.now();
    // hafif yay: düz çizgi yerine doğal el hareketi
    const nx = -(y - y0), ny = x - x0, len = Math.hypot(nx, ny) || 1, bow = Math.min(40, Math.hypot(x - x0, y - y0) * 0.08);
    for (let i = 1; i <= steps; i++) {
      const t = ease(i / steps), arc = Math.sin(Math.PI * (i / steps)) * bow;
      await page.mouse.move(x0 + (x - x0) * t + (nx / len) * arc, y0 + (y - y0) * t + (ny / len) * arc);
      const ahead = t0 + (ms * i) / steps - Date.now();          // duvar saatine göre: adım gecikmesi süreyi uzatmaz
      if (ahead > 0) await page.waitForTimeout(ahead);
    }
    m.x = x; m.y = y;
  };
  m.moveToEl = async (locator, ms = 650, fx = 0.5, fy = 0.5) => {
    const b = await locator.boundingBox();
    if (!b) throw new Error('öğe görünür değil: ' + locator);
    await m.moveTo(b.x + b.width * fx, b.y + b.height * fy, ms);
    return b;
  };
  m.click = async () => { await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up(); };
  m.clickEl = async (locator, ms = 650) => { await m.moveToEl(locator, ms); await page.waitForTimeout(90); await m.click(); };
  // hiçbir şeyin durmadığı bekleme: imleç küçük, yavaş bir yay çizer
  m.drift = async (ms, r = 18) => {
    const cx = m.x, cy = m.y, phase = Math.random() * Math.PI * 2, t0 = Date.now();
    for (;;) {
      const p = (Date.now() - t0) / ms;
      if (p >= 1) break;
      const a = phase + p * Math.PI * 1.2, k = Math.sin(Math.PI * p);
      await page.mouse.move(cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * 0.6 * k);
      await page.waitForTimeout(16);
    }
    await page.mouse.move(cx, cy);
  };
  return m;
}

// ── CDP screencast ─────────────────────────────────────────
export async function startScreencast(page, dir, { width, height }) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [], writes = [];
  let n = 0;
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = path.join(dir, 'f' + String(++n).padStart(6, '0') + '.png');
    frames.push({ file, t: metadata.timestamp });
    writes.push(fs.promises.writeFile(file, Buffer.from(data, 'base64')));
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'png', maxWidth: width, maxHeight: height, everyNthFrame: 1 });
  const startedAt = Date.now() / 1000;
  return {
    async stop() {
      const stoppedAt = Date.now() / 1000;
      await cdp.send('Page.stopScreencast');
      await Promise.all(writes);
      await cdp.detach().catch(() => {});
      return { frames, startedAt, stoppedAt };
    }
  };
}

export function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  if (process.env.PW_DIR) {
    try { return createRequire(path.join(path.resolve(process.env.PW_DIR), 'noop.js'))('ffmpeg-static'); } catch (e) {}
  }
  return 'ffmpeg';
}

// Kareler gerçek zaman damgalarıyla (değişken aralık) -> sabit 30 fps MP4
export function encode({ frames, stoppedAt }, out, { fps = 30, crf = 14 } = {}) {
  if (frames.length < 2) throw new Error('yeterli kare yok: ' + frames.length);
  const dir = path.dirname(frames[0].file);
  const t0 = frames[0].t, lines = ['ffconcat version 1.0'];
  let maxGap = 0;
  frames.forEach((f, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].t : Math.max(f.t + 1 / fps, stoppedAt);
    const d = Math.max(0.001, next - f.t);
    if (i + 1 < frames.length) maxGap = Math.max(maxGap, d);
    lines.push("file '" + path.basename(f.file) + "'", 'duration ' + d.toFixed(6));
  });
  lines.push("file '" + path.basename(frames[frames.length - 1].file) + "'");      // concat: son süre için tekrar
  const list = path.join(dir, 'frames.ffconcat');
  fs.writeFileSync(list, lines.join('\n'));
  const args = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', `fps=${fps},format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf),
    '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', out];
  const r = spawnSync(ffmpegPath(), args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg başarısız (' + r.status + ')');
  return { duration: Math.max(stoppedAt, frames[frames.length - 1].t) - t0, frames: frames.length, maxGap };
}

export function probe(file) {
  const r = spawnSync(ffmpegPath(), ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const s = r.stderr || '';
  const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(s), vid = /Video: .*?(\d{3,5})x(\d{3,5}).*?([\d.]+) fps/.exec(s);
  return {
    duration: dur ? (+dur[1]) * 3600 + (+dur[2]) * 60 + parseFloat(dur[3]) : null,
    width: vid ? +vid[1] : null, height: vid ? +vid[2] : null, fps: vid ? +vid[3] : null, audio: /Audio:/.test(s)
  };
}
