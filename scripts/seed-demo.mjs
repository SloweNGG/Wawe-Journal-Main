#!/usr/bin/env node
// ============================================================
// WAWE JOURNAL - DEMO HESAP SEED'İ (yalnızca yerel; canlı veritabanına bağlanmaz)
// File: scripts/seed-demo.mjs
// ============================================================
// Yerel sahte Supabase'in (scripts/demo/backend.mjs) okuduğu .demo-data/db.json dosyasını üretir:
//   - demo kullanıcı (premium, onboarding tamam) + "Wawe Demo" defteri (demo / kâğıt hesap)
//   - 5 strateji (açıklama + etiketler), 1 Ağu – 27 Kas 2026 arası ~180 kapanmış işlem
//   - EURUSD H1 sentetik backtest hesabı (mumlar tarayıcıda üretilir, internet gerekmez)
// Giriş bilgileri .demo-data/credentials.json'a yazılır (.gitignore'da; repoya girmez).
// E-posta/şifre: DEMO_EMAIL / DEMO_PASSWORD ortam değişkenleri, yoksa rastgele şifre üretilir.
//
//   node scripts/seed-demo.mjs            # üret + istatistikleri yazdır
//   node scripts/seed-demo.mjs --check    # yalnızca istatistik (dosya yazmaz)
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './demo/backend.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, '.demo-data');
const CHECK_ONLY = process.argv.includes('--check');

// Sabit kimlikler: tarayıcı tarafı (localStorage anahtarları) bunlara güvenebilir
const USER_ID = '0de30000-0000-4000-8000-00000000d001';
const JOURNAL_ID = '0de30000-0000-4000-8000-00000000a001';
const BT_ACCOUNT_ID = '0de30000-0000-4000-8000-00000000b001';
const FROM = '2026-08-01', TO = '2026-11-27';
const RISK = 75;                    // işlem başına ~$75 risk (10.000$ hesapta ~%0,75)

// ── rastgelelik (mulberry32, tekrarlanabilir) ─────────────
function rng(seed) {
  let s = seed >>> 0;
  const rand = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const r = { rand };
  r.between = (a, b) => a + rand() * (b - a);
  r.int = (a, b) => Math.floor(r.between(a, b + 1));
  r.pick = (arr) => arr[Math.floor(rand() * arr.length)];
  r.gauss = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
  r.weighted = (items, w) => { const tot = items.reduce((s, it) => s + w(it), 0); let x = rand() * tot; for (const it of items) { x -= w(it); if (x <= 0) return it; } return items[items.length - 1]; };
  return r;
}
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

// ── semboller: 2026 sonbaharı için gerçekçi seviyeler, doğal stop mesafeleri ──
// mult = uygulamadaki INSTRUMENT_MULTIPLIERS (public/config.js)
const SYMBOLS = {
  EURUSD: { instrument: 'forex', mult: 100000, price: 1.1650, drift: 0.00004, vol: 0.0042, dec: 5, stop: [0.0012, 0.0028], comm: 7 },
  GBPUSD: { instrument: 'forex', mult: 100000, price: 1.3420, drift: -0.00003, vol: 0.0050, dec: 5, stop: [0.0015, 0.0034], comm: 7 },
  AUDUSD: { instrument: 'forex', mult: 100000, price: 0.6560, drift: 0.00003, vol: 0.0040, dec: 5, stop: [0.0010, 0.0022], comm: 7 },
  XAUUSD: { instrument: 'gold', mult: 100, price: 3380, drift: 0.0010, vol: 0.0090, dec: 2, stop: [5.5, 14], comm: 7 },
  NAS100: { instrument: 'index', mult: 10, price: 23350, drift: 0.0006, vol: 0.0100, dec: 1, stop: [35, 90], comm: 0 },
  US30: { instrument: 'index', mult: 10, price: 44200, drift: 0.0003, vol: 0.0080, dec: 1, stop: [55, 140], comm: 0 },
  BTCUSD: { instrument: 'crypto', mult: 1, price: 114500, drift: -0.0002, vol: 0.0220, dec: 1, stop: [650, 1600], comm: 0 }
};

// hours: UTC işlem saatleri; wr: kazanma oranı, rr: planlanan R:R aralığı
const STRATEGIES = [
  { key: 'lb', name: 'London Breakout', color: '#22c55e', weight: 0.27, wr: 0.62, rr: [2.0, 2.8], hours: [7, 9.5], symbols: ['EURUSD', 'GBPUSD', 'XAUUSD'],
    tags: ['Breakout', 'London Session'],
    desc: 'Marks the Asian session high/low and trades the first clean break at the London open. Entry on the retest of the range edge, stop behind the opposite side of the retest candle, target 2–2.5R.' },
  { key: 'ny', name: 'NY Open Momentum', color: '#3b82f6', weight: 0.23, wr: 0.56, rr: [2.2, 3.0], hours: [13.5, 15.5], symbols: ['NAS100', 'US30', 'XAUUSD', 'BTCUSD'],
    tags: ['Momentum', 'NY Session'],
    desc: 'Rides the dominant direction of the first 30 minutes after the New York cash open. Only taken when the 5m structure agrees with the 1H trend; no entries 10 minutes either side of red-folder news.' },
  { key: 'sd', name: 'Supply & Demand', color: '#f59e0b', weight: 0.20, wr: 0.58, rr: [2.0, 2.8], hours: [8, 16], symbols: ['EURUSD', 'GBPUSD', 'XAUUSD', 'US30', 'BTCUSD'],
    tags: ['Zones', 'Reversal'],
    desc: 'Fresh 4H supply and demand zones that caused a strong departure. Waits for price to return, then needs a 15m change of character inside the zone before entering. First touch only.' },
  { key: 'tp', name: 'Trend Pullback', color: '#14b8a6', weight: 0.19, wr: 0.57, rr: [1.8, 2.6], hours: [7, 18], symbols: ['EURUSD', 'GBPUSD', 'AUDUSD', 'XAUUSD', 'NAS100', 'BTCUSD'],
    tags: ['Trend', '50 EMA'],
    desc: 'Trades with the daily trend after a pullback into the 50 EMA on the 1H chart. Needs a higher low (or lower high) and a rejection candle at the EMA. Partial at 1R, runner to the previous swing.' },
  { key: 'as', name: 'Asia Range Fade', color: '#ec4899', weight: 0.11, wr: 0.47, rr: [1.6, 2.2], hours: [0.5, 5], symbols: ['AUDUSD', 'EURUSD', 'XAUUSD'],
    tags: ['Mean Reversion', 'Asian Session'],
    desc: 'Fades sweeps of the Asian range edges during the quiet session, targeting the range midpoint and the opposite side. Smaller size; skipped on days with high-impact news in Asia.' }
];

const NOTES = {
  win: ['Stuck to the plan and held to target.', 'Clean breakout, entered on the retest. Textbook.', 'Strong reversal after the liquidity grab, waited patiently.',
    'Took half at 1R, the rest ran to target.', 'With the higher-timeframe trend, 15m confirmation candle.', 'Post-news volatility worked in my favour.',
    'Sniper entry, the stop was never threatened.', 'Patient entry at the zone, let it play out.', 'A+ setup, sized normally and followed the rules.',
    'Trailed the stop under structure, exited at TP.'],
  partial: ['Momentum faded before TP, closed manually in profit.', 'Took profit early ahead of the news release.', 'Closed at the previous swing, did not want to give it back.',
    'Moved the stop to breakeven, scaled out into strength.'],
  loss: ['Stopped out but followed the rules, all good.', 'Entered a little early, should have waited for the close.', 'Level did not hold, the stop did its job.',
    'Spread widened at the open, stop got wicked.', 'Counter-trend idea, valid setup, just did not work.', 'News spike took the stop. Accepted.'],
  cut: ['Setup was invalidated, exited before the stop.', 'Price did not react as expected, kept the loss small.', 'Structure broke against me, cut it at half risk.']
};

// ── takvim ────────────────────────────────────────────────
function weekdays() {
  const out = [];
  for (let d = new Date(FROM + 'T00:00:00Z'); d <= new Date(TO + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
// Kasım: kırmızı günler sabit (takvimde birkaç kırmızı gün), 1-2 gün işlem yok
const NOV_RED = new Set(['2026-11-05', '2026-11-17', '2026-11-24']);
const NOV_OFF = new Set(['2026-11-11']);
// Zor dönemler (drawdown): Eylül ortası ve Ekim sonu
const ROUGH = [['2026-09-08', '2026-09-18', -0.30], ['2026-10-21', '2026-10-27', -0.24]];

function build(seed) {
  const r = rng(seed);
  const level = {};
  for (const k of Object.keys(SYMBOLS)) level[k] = SYMBOLS[k].price;
  const trades = [];
  for (const day of weekdays()) {
    for (const k of Object.keys(level)) level[k] *= 1 + SYMBOLS[k].drift + r.gauss() * SYMBOLS[k].vol * 0.55;
    const nov = day >= '2026-11-01';
    if (nov ? NOV_OFF.has(day) : r.rand() < 0.15) continue;
    const shift = ROUGH.reduce((s, [a, b, v]) => (day >= a && day <= b ? v : s), 0) + (nov ? 0.03 : 0);
    const want = nov ? (NOV_RED.has(day) ? -1 : 1) : 0;    // Kasım: günün işareti zorunlu

    let dayTrades = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      const n = r.weighted([[1, 26], [2, 38], [3, 24], [4, 10], [5, 2]], (x) => x[1])[0];
      const list = [], used = new Set();
      for (let i = 0; i < n; i++) list.push(makeTrade(r, day, i, shift, level, used));
      const sum = list.reduce((s, t) => s + t.pnl, 0);
      if (!want || Math.sign(sum) === want) { dayTrades = list; break; }
    }
    if (dayTrades) trades.push(...dayTrades);
  }
  return trades.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
}

function makeTrade(r, day, i, shift, level, used) {
  const st = r.weighted(STRATEGIES, (s) => s.weight);
  const symKey = r.pick(st.symbols), sym = SYMBOLS[symKey];
  const dir = r.rand() < 0.52 ? 1 : -1;
  let mins;
  do { mins = Math.round(r.between(st.hours[0], st.hours[1]) * 60); } while (used.has(Math.floor(mins / 5)));
  used.add(Math.floor(mins / 5));
  const date = new Date(day + 'T00:00:00Z'); date.setUTCMinutes(mins); date.setUTCSeconds(r.int(0, 59));

  const tick = 10 ** -sym.dec;
  const stop = round(r.between(sym.stop[0], sym.stop[1]), sym.dec);
  const risk = RISK * r.between(0.8, 1.2) * (st.key === 'as' ? 0.7 : 1);
  const lot = Math.max(0.01, round(risk / (stop * sym.mult), 2));
  const entry = round(level[symKey] * (1 + r.gauss() * sym.vol * 0.2), sym.dec);
  const rr = round(r.between(st.rr[0], st.rr[1]), 1);

  let R, kind;
  const p = r.rand();
  if (p < Math.min(0.85, Math.max(0.2, st.wr + shift))) {
    const w = r.rand();
    if (w < 0.66) { R = rr; kind = 'win'; }                                    // TP
    else { R = round(r.between(0.7, rr * 0.75), 2); kind = 'partial'; }         // erken / kısmi kâr
  } else if (r.rand() < 0.84) { R = -1; kind = 'loss'; }                        // SL
  else { R = -round(r.between(0.35, 0.75), 2); kind = 'cut'; }                  // stop beklenmeden çıkış

  const sl = round(entry - dir * stop, sym.dec);
  const tp = round(entry + dir * rr * stop, sym.dec);
  const slip = kind === 'loss' ? r.int(0, 2) * tick * -1 : 0;                   // SL'de küçük kayma
  const exit = kind === 'win' ? tp : kind === 'loss' ? round(sl + dir * slip, sym.dec) : round(entry + dir * R * stop, sym.dec);
  const gross = round(dir * (exit - entry) * lot * sym.mult, 2);
  const commission = round(lot * sym.comm, 2);
  const swap = (sym.instrument === 'forex' || sym.instrument === 'gold') && r.rand() < 0.08 ? -round(lot * r.between(2, 9), 2) : 0;
  return {
    strategy: st.key, symbol: symKey, direction: dir === 1 ? 'LONG' : 'SHORT', instrument: sym.instrument,
    lot, entry_price: entry, exit_price: exit, stop_loss: sl, take_profit: tp,
    gross_pnl: gross, commission, swap, pnl: round(gross - commission + swap, 2),
    rr_ratio: round(Math.abs(tp - entry) / Math.abs(entry - sl), 2), multiplier: sym.mult,
    trade_date: date.toISOString(), notes: r.pick(NOTES[kind]), kind
  };
}

// ── istatistikler / hedef aralıklar ─────────────────────────
function stats(trades) {
  const wins = trades.filter((t) => t.pnl > 0), losses = trades.filter((t) => t.pnl < 0);
  const gw = wins.reduce((s, t) => s + t.pnl, 0), gl = -losses.reduce((s, t) => s + t.pnl, 0);
  let eq = 0, peak = 0, maxDD = 0;
  const byDay = {}, byMonth = {};
  for (const t of trades) {
    eq += t.pnl; peak = Math.max(peak, eq); maxDD = Math.max(maxDD, peak - eq);
    byDay[t.trade_date.slice(0, 10)] = (byDay[t.trade_date.slice(0, 10)] || 0) + t.pnl;
    byMonth[t.trade_date.slice(0, 7)] = (byMonth[t.trade_date.slice(0, 7)] || 0) + t.pnl;
  }
  const novDays = Object.entries(byDay).filter(([d]) => d >= '2026-11-01');
  return {
    n: trades.length, winRate: wins.length / trades.length, pf: gw / gl,
    avgRR: trades.reduce((s, t) => s + t.rr_ratio, 0) / trades.length,
    avgWinLoss: (gw / wins.length) / (gl / losses.length),
    total: eq, maxDD, byMonth,
    novDays: novDays.length, novRed: novDays.filter(([, v]) => v < 0).length
  };
}
function ok(s) {
  return s.n >= 165 && s.n <= 195 && s.winRate >= 0.555 && s.winRate <= 0.595 && s.pf >= 2.35 && s.pf <= 2.65
    && s.avgRR >= 2.2 && s.avgRR <= 2.4 && Object.values(s.byMonth).every((v) => v > 0)
    && s.maxDD >= 450 && s.maxDD <= 1100 && s.novDays >= 18 && s.novRed >= 2 && s.novRed <= 3;
}

// ── çalıştır ──────────────────────────────────────────────
let seed = 1, trades, s;
for (; seed < 5000; seed++) { trades = build(seed); s = stats(trades); if (ok(s)) break; }
if (!ok(s)) { console.error('Hedef aralıkları tutturan seed bulunamadı'); process.exit(1); }

const fmt = (v) => (v >= 0 ? '+' : '-') + '$' + Math.abs(v).toFixed(2);
console.log(`seed ${seed}: ${s.n} işlem | kazanma %${(s.winRate * 100).toFixed(1)} | PF ${s.pf.toFixed(2)} | ort. R:R 1:${s.avgRR.toFixed(2)} | kazanç/kayıp ${s.avgWinLoss.toFixed(2)}`);
console.log(`toplam ${fmt(s.total)} | maks. düşüş -$${s.maxDD.toFixed(0)} | aylar ${Object.entries(s.byMonth).map(([m, v]) => m + ' ' + fmt(v)).join(', ')}`);
console.log(`Kasım: ${s.novDays} işlem günü, ${s.novRed} kırmızı gün`);
if (CHECK_ONLY) process.exit(0);

// ── db.json ───────────────────────────────────────────────
const created = '2026-07-28T09:00:00.000Z';
const BT_START = '2026-09-14T06:00:00.000Z';   // backtest replay başlangıcı (Pazartesi, Londra öncesi)
const stratRows = STRATEGIES.map((st, i) => ({
  id: `0de30000-0000-4000-8000-00000000c00${i + 1}`, user_id: USER_ID, journal_id: JOURNAL_ID, name: st.name,
  description: st.desc + ' Tags: ' + st.tags.map((t) => '#' + t).join(' '), tags: st.tags, color: st.color, is_active: true,
  created_at: created, updated_at: created
}));
const stratId = Object.fromEntries(STRATEGIES.map((st, i) => [st.key, stratRows[i].id]));
const tradeRows = trades.map((t, i) => {
  const { strategy, kind, ...row } = t;
  const closed = new Date(Date.parse(t.trade_date) + (20 + (i * 37) % 240) * 60000).toISOString();
  return { id: `0de30000-0000-4000-8000-${String(100000000000 + i)}`, user_id: USER_ID, journal_id: JOURNAL_ID, strategy_id: stratId[strategy],
    ...row, platform_source: null, import_hash: 'demo-' + t.trade_date.slice(0, 10) + '-' + i, created_at: closed, updated_at: closed };
});
const novPnl = s.byMonth['2026-11'];
const monthlyTarget = Math.ceil(novPnl / 0.82 / 500) * 500;     // Kasım ~%80 dolu hedef çubuğu

const email = process.env.DEMO_EMAIL || 'demo@wawejournal.local';
const password = process.env.DEMO_PASSWORD || ('Wawe-' + crypto.randomBytes(6).toString('base64url'));
const salt = crypto.randomBytes(16).toString('hex');

const db = {
  meta: { generatedBy: 'scripts/seed-demo.mjs', seed, journalId: JOURNAL_ID, backtestAccountId: BT_ACCOUNT_ID, monthlyTarget, now: '2026-11-27T18:30:00.000Z' },
  users: [{ id: USER_ID, email, salt, password_hash: hashPassword(password, salt), created_at: created,
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { username: 'Wawe Demo', full_name: 'Wawe Demo' } }],
  tables: {
    user_profiles: [{ id: USER_ID, email, username: 'Wawe Demo', plan: 'premium', plan_expires_at: null, role: 'user', is_active: true,
      avatar_url: null, max_journals: 10, onboarding_completed: true, onboarding_tour_completed: true, preferred_currency: 'USD',
      created_at: created, updated_at: created, last_active: created }],
    user_onboarding: [{ user_id: USER_ID, completed: true, tour_completed: true, created_at: created }],
    journals: [{ id: JOURNAL_ID, user_id: USER_ID, name: 'Wawe Demo', description: 'Demo / paper trading account', color: '#22c55e', icon: 'folder',
      is_default: true, is_active: true, trade_scope: 'live', platform: 'manual', created_at: created, updated_at: created }],
    strategies: stratRows,
    trades: tradeRows,
    backtest_accounts: [{ id: BT_ACCOUNT_ID, user_id: USER_ID, journal_id: null, name: 'EURUSD H1 Replay', symbol: 'EURUSD', timeframe: '1h',
      starting_balance: 10000, spread_pips: 0.6, commission_per_lot: 7, replay_time: BT_START, is_active: true,
      data_source: 'synthetic', source_ctid_account: null, source_broker_name: null, source_is_live: null, source_symbol_id: null,
      source_symbol_name: null, source_digits: null, section_no: 1, sections: [{ no: 1, start: BT_START, at: created }], created_at: created, updated_at: created }],
    backtest_account_trades: [], backtest_drawings: [], notifications: [], references: [], prop_accounts: [],
    system_settings: []
  }
};
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'db.json'), JSON.stringify(db, null, 1));
fs.writeFileSync(path.join(OUT_DIR, 'credentials.json'), JSON.stringify({ email, password }, null, 2));
console.log(`yazıldı: .demo-data/db.json (${tradeRows.length} işlem, ${stratRows.length} strateji), aylık hedef $${monthlyTarget}`);
console.log('giriş bilgileri: .demo-data/credentials.json');
