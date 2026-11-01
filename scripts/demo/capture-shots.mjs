#!/usr/bin/env node
// ============================================================
// WAWE JOURNAL - TANITIM EKRAN GÖRÜNTÜLERİ
// File: scripts/demo/capture-shots.mjs
// ============================================================
//   PW_DIR=<playwright klasörü> node scripts/demo/capture-shots.mjs [dashboard trades ...]
// Çıktı: promo-captures/<sayfa>@2x.png — 1920x945 görüntü alanı, deviceScaleFactor 2 (3840x1890), koyu tema,
// yalnızca görünen alan. Toast, kaydırma çubuğu, "+" butonu gizli; ağ boşta + 1,5 sn beklenir.
// Önkoşul: npx astro build && node scripts/seed-demo.mjs. Canlıya istek çıkmaz (scripts/demo/browser.mjs).
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { launch, login, credentials, settle, ROOT } from './browser.mjs';

const OUT = path.join(ROOT, 'promo-captures');
const ALL = ['dashboard', 'trades', 'strategies', 'calendar', 'backtest', 'analytics'];
const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const pages = args.length ? args : ALL;
fs.mkdirSync(OUT, { recursive: true });

const price = async (page, id) => parseFloat((await page.textContent(id)).replace(/[^\d.]/g, ''));

// Sayfaya özel hazırlık (hepsi ağ boşta + 1,5 sn beklemesinden önce)
const PREP = {
  async calendar(page) {
    // demo "bugün"ü 27 Kasım 2026: takvim Kasım'da açılır; değilse ileri/geri ile Kasım'a gelinir
    for (let i = 0; i < 24; i++) {
      const title = (await page.textContent('body')).match(/(January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d/);
      if (title && title[0] === 'November 2026') return;
      const dir = title && new Date(title[0] + ' 1') < new Date('2026-11-01') ? 'next' : 'prev';
      const btn = page.locator(dir === 'next' ? '#next-month, [data-cal-next], .cal-next' : '#prev-month, [data-cal-prev], .cal-prev').first();
      if (!(await btn.count())) return;
      await btn.click();
      await page.waitForTimeout(300);
    }
  },
  async backtest(page) {
    await page.locator('#bt-accounts button[data-act="open"]').first().click();
    await page.waitForTimeout(2000);
    const back = page.getByText('Back to the current candle');
    if (await back.isVisible().catch(() => false)) { await back.click(); await page.waitForTimeout(400); }
    await page.selectOption('#bt-speed', '10');
    await page.click('#bt-play-btn');
    await page.waitForTimeout(700);
    // kapanmış bir işlem (gerçekleşen K/Z + geçmiş) ve SL/TP'li açık bir pozisyon
    await page.click('#bt-buy-btn');
    await page.waitForTimeout(1600);
    await page.locator('#bt-open-body button[data-act="close"]').first().click();
    await page.waitForTimeout(500);
    const bid = await price(page, '#bt-bid');
    await page.fill('#bt-sl', (bid - 0.0050).toFixed(5));
    await page.fill('#bt-tp', (bid + 0.0150).toFixed(5));
    await page.click('#bt-buy-btn');
    await page.waitForTimeout(2600);
    await page.click('#bt-play-btn');           // duraklat: kare sabit kalsın
    await page.fill('#bt-sl', '');
    await page.fill('#bt-tp', '');
    await page.mouse.move(1900, 940);           // fare grafiğin dışında (artı imleci görünmesin)
  },
  async analytics(page) {
    // içgörü kartları dönüyorsa ilk karttan başlasın
    await page.mouse.move(1900, 940);
  }
};

const env = await launch({ viewport: { width: 1920, height: 945 }, deviceScaleFactor: 2, hideToasts: true });
const page = await env.context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await login(page, env.origin, credentials());
  for (const name of pages) {
    errors.length = 0;
    await page.goto(env.origin + '/' + name + '.html', { waitUntil: 'load' });
    await settle(page, 600);
    if (PREP[name]) await PREP[name](page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page, 1500);                   // ağ boşta + 1,5 sn (grafik / sayı animasyonları biter)
    const file = path.join(OUT, name + '@2x.png');
    await page.screenshot({ path: file, fullPage: false, animations: 'disabled', caret: 'hide' });
    const png = fs.readFileSync(file);
    console.log(`${name}@2x.png: ${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`);
    if (errors.length) console.warn('  sayfa hataları:', errors.slice(0, 3).join(' | '));
  }
  if (env.blocked.size) console.log('engellenen dış istekler:', [...env.blocked].join(', '));
} finally {
  await env.close();
}
