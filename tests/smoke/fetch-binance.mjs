// Real BTCUSDT 1m candles (Binance public klines) per month in the ctrader-candles 'month' format (1e-5 integers, minute offsets),
// for the btc-repro smoke scenarios. Usage: node tests/smoke/fetch-binance.mjs <out dir> 2019-05 2019-06 ...  (files stay outside the repo)
import fs from 'node:fs';
const out = process.argv[2], months = process.argv.slice(3);
for (const key of months) {
  const f = `${out}/${key}.json`; if (fs.existsSync(f)) { console.log('have', key); continue; }
  const y = +key.slice(0, 4), m = +key.slice(5, 7);
  const from = Date.UTC(y, m - 1, 1), to = Math.min(Date.UTC(y, m, 1), Math.floor(Date.now() / 86400000) * 86400000);
  const o = { ok: true, month: key, scale: 100000, n: 0, tm: [], o: [], h: [], l: [], c: [] };
  for (let t = from; t < to;) {
    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&startTime=${t}&endTime=${to - 1}&limit=1000`);
    const j = await r.json(); if (!Array.isArray(j) || !j.length) break;
    for (const k of j) { o.tm.push((k[0] - from) / 60000); for (const [a, i] of [['o', 1], ['h', 2], ['l', 3], ['c', 4]]) o[a].push(Math.round(parseFloat(k[i]) * 1e5)); }
    t = j[j.length - 1][0] + 60000;
  }
  o.n = o.tm.length; fs.writeFileSync(f, JSON.stringify(o)); console.log(key, o.n);
}
