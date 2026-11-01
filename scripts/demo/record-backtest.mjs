#!/usr/bin/env node
// ============================================================
// WAWE JOURNAL - BACKTEST TANITIM KAYITLARI
// File: scripts/demo/record-backtest.mjs
// ============================================================
//   PW_DIR=<playwright klasörü> node scripts/demo/record-backtest.mjs [replay] [trading] [fullscreen]
// Çıktı: promo-captures/bt-replay.mp4, bt-trading.mp4, bt-fullscreen.mp4 (1920x1080, 30 fps, ses yok)
// Önkoşul: npx astro build && node scripts/seed-demo.mjs. Canlıya istek çıkmaz (scripts/demo/browser.mjs).
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { launch, login, credentials, settle, ROOT } from './browser.mjs';
import { installCursor, mouse, startScreencast, encode, probe } from './recorder.mjs';

const OUT = path.join(ROOT, 'promo-captures');
const TMP = process.env.FRAMES_DIR || path.join(os.tmpdir(), 'wawe-promo-frames');
const VIEW = { width: 1920, height: 1080 };
const DURATION = 15000;
const which = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const runs = which.length ? which : ['replay', 'trading', 'fullscreen'];
fs.mkdirSync(OUT, { recursive: true });

async function openReplay(page, env, speed) {
  await page.goto(env.origin + '/backtest.html', { waitUntil: 'load' });
  await settle(page, 600);
  await page.locator('#bt-accounts button[data-act="open"]').first().click();
  await page.waitForSelector('#bt-view-replay:not([hidden])', { timeout: 20000 }).catch(() => {});
  await settle(page, 1500);
  // grafik ilk açılışta geçmişte kalabiliyor: güncel muma dön (replay sırasında grafik onu izler)
  const back = page.getByText('Back to the current candle');
  if (await back.isVisible().catch(() => false)) { await back.click(); await page.waitForTimeout(500); }
  if (speed) await page.selectOption('#bt-speed', String(speed));
}
const price = async (page, id) => parseFloat((await page.textContent(id)).replace(/[^\d.]/g, ''));
const fx = (v) => v.toFixed(5);

async function typeInto(page, m, sel, text) {
  await m.clickEl(page.locator(sel), 520);
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text, { delay: 38 });
}

async function record(name, setup, scene) {
  const env = await launch({ viewport: VIEW, deviceScaleFactor: 1, hideToasts: false });
  await installCursor(env.context);
  const page = await env.context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await login(page, env.origin, credentials());
    const m = mouse(page, { x: 1180, y: 620 });
    await setup(page, env, m);
    await page.mouse.move(m.x, m.y);
    await page.waitForTimeout(200);
    const dir = path.join(TMP, name);
    const rec = await startScreencast(page, dir, VIEW);
    const t0 = Date.now();
    await scene(page, m, () => Date.now() - t0);
    const left = DURATION - (Date.now() - t0);
    if (left > 0) await m.drift(left);
    const res = await rec.stop();
    const file = path.join(OUT, name + '.mp4');
    const enc = encode(res, file, { fps: 30, crf: 14 });
    const info = probe(file);
    console.log(`${name}.mp4: ${info.width}x${info.height} ${info.fps}fps ${info.duration?.toFixed(2)}s, ${enc.frames} kare, en uzun durağan aralık ${enc.maxGap.toFixed(2)}s${info.audio ? ' (SES VAR!)' : ''}`);
    if (enc.maxGap > 0.5) console.warn(`  uyarı: ${name} içinde ${enc.maxGap.toFixed(2)}s hiçbir şeyin değişmediği an var`);
    if (errors.length) console.warn('  sayfa hataları:', errors.slice(0, 3).join(' | '));
    if (!process.env.KEEP_FRAMES) fs.rmSync(dir, { recursive: true, force: true });
    return { page };
  } finally {
    await env.close();
  }
}

// 1) Replay: 10x seç, play'e bas, mumlar aksın
async function replay() {
  await record('bt-replay', async (page, env) => { await openReplay(page, env, null); }, async (page, m) => {
    await m.moveTo(900, 420, 700);
    await m.moveToEl(page.locator('#bt-speed'), 700);
    await page.waitForTimeout(120);
    await m.click();
    await page.selectOption('#bt-speed', '10');
    await m.drift(300, 6);
    await m.clickEl(page.locator('#bt-play-btn'), 650);
    // mumlar akarken imleç grafiğe gezinir (artı imleci + OHLC göstergesi canlı)
    const chart = await page.locator('#bt-chart').boundingBox();
    await m.moveTo(chart.x + chart.width * 0.55, chart.y + chart.height * 0.45, 1400);
    await m.drift(1800, 30);
    await m.moveTo(chart.x + chart.width * 0.8, chart.y + chart.height * 0.35, 1600);
    await m.drift(2000, 26);
    await m.moveTo(chart.x + chart.width * 0.68, chart.y + chart.height * 0.6, 1500);
  });
}

// 2) İşlem: replay akarken SL/TP + BUY, ardından SELL, sonra pozisyonları kapat
async function trading() {
  await record('bt-trading', async (page, env) => {
    await openReplay(page, env, 3);
    await page.click('#bt-play-btn');
    await page.waitForTimeout(1200);
  }, async (page, m, t) => {
    await m.moveTo(1500, 640, 600);
    let bid = await price(page, '#bt-bid');
    await typeInto(page, m, '#bt-sl', fx(bid - 0.0045));
    bid = await price(page, '#bt-bid');
    await typeInto(page, m, '#bt-tp', fx(bid + 0.0085));
    await m.clickEl(page.locator('#bt-buy-btn'), 600);
    await m.drift(700, 14);
    let ask = await price(page, '#bt-ask');
    await typeInto(page, m, '#bt-sl', fx(ask + 0.0075));
    ask = await price(page, '#bt-ask');
    await typeInto(page, m, '#bt-tp', fx(ask - 0.0095));
    await m.clickEl(page.locator('#bt-sell-btn'), 600);
    // SL/TP çizgileri grafikte: imleç grafiğe geçer
    const chart = await page.locator('#bt-chart').boundingBox();
    await m.moveTo(chart.x + chart.width * 0.72, chart.y + chart.height * 0.42, 1000);
    await m.drift(Math.max(600, 10600 - t()), 22);
    // açık pozisyonları tek tek kapat
    for (let i = 0; i < 2; i++) {
      const btn = page.locator('#bt-open-body button[data-act="close"]').first();
      if (!(await btn.isVisible().catch(() => false))) break;
      await m.clickEl(btn, 650);
      await m.drift(350, 6);
    }
  });
}

// 3) Tam ekran: Büyüt + Full screen, açık pozisyon, 10x replay
async function fullscreen() {
  await record('bt-fullscreen', async (page, env, m) => {
    await openReplay(page, env, 10);
    const bid = await price(page, '#bt-bid');
    // sentetik veri sabit (seed 1): bu aralıkta fiyat ~170 pip yükseliyor; SL/TP kayıt boyunca tetiklenmez
    await page.fill('#bt-sl', fx(bid - 0.0060));
    await page.fill('#bt-tp', fx(bid + 0.0250));
    await page.click('#bt-buy-btn');
    await page.waitForTimeout(400);
    await page.click('#bt-fs-btn');           // Büyüt (F)
    await page.waitForTimeout(600);
    // Headless'ta Fullscreen API, screencast karesini küçültüyor (içerik sol üst çeyrekte kalıyordu). Uygulama API
    // reddedilince aynı tam ekran düzenine CSS ile geçiyor (bt-layout.js "CSS mode is enough"): görüntü birebir aynı.
    await page.evaluate(() => { Element.prototype.requestFullscreen = () => Promise.reject(new Error('headless')); });
    await page.click('#bt-fs-real');          // tam ekran: üst menü de gizlenir
    await page.waitForTimeout(800);
    const back = page.getByText('Back to the current candle');
    if (await back.isVisible().catch(() => false)) { await back.click(); await page.waitForTimeout(300); }
    await page.click('#bt-play-btn');
    await page.waitForTimeout(1500);      // tam ekran geçişi ve olası uyarı bittikten sonra kayıt başlar
    const chart = await page.locator('#bt-chart').boundingBox();
    m.x = chart.x + chart.width * 0.5; m.y = chart.y + chart.height * 0.55;
  }, async (page, m) => {
    const chart = await page.locator('#bt-chart').boundingBox();
    await m.moveTo(chart.x + chart.width * 0.7, chart.y + chart.height * 0.4, 1500);
    await m.drift(2200, 28);
    await m.moveTo(chart.x + chart.width * 0.82, chart.y + chart.height * 0.55, 1500);
    await m.drift(2400, 24);
    await m.moveTo(chart.x + chart.width * 0.6, chart.y + chart.height * 0.35, 1600);
    await m.drift(2200, 26);
    const open = await page.locator('#bt-open-body tr[data-id]').count().catch(() => 0);
    if (!open) console.warn('  uyarı: tam ekran kaydında pozisyon kayıt bitmeden kapandı');
  });
}

for (const r of runs) {
  if (r === 'replay') await replay();
  else if (r === 'trading') await trading();
  else if (r === 'fullscreen') await fullscreen();
  else console.warn('bilinmeyen kayıt: ' + r);
}
