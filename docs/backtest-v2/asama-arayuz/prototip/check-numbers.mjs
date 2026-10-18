import assert from 'node:assert/strict';
await import('./bt-symbols.js');
await import('./bt-math.js');
const S = globalThis.WwBtSymbols, M = globalThis.WwBtMath;
// JS float behaviours documented in the test spec (review corrections)
console.log('toFixed', [1.005, -1.005, 2.675, 1.045].map(x => x.toFixed(2)));
console.log('Math.round', [1.005, -1.005, 2.675, 1.045].map(x => Math.round(x * 100) / 100));
console.log('Math.round neg ties', Math.round(-0.125 * 100) / 100, Object.is(Math.round(-0.005 * 100) / 100, -0));
console.log('toFixed -1.255', (-1.255).toFixed(2));
// scenario numbers
assert.equal(M.grossCents('EURUSD', 1, 108311, 108423, 37), 4144);
assert.equal(M.commissionCents('EURUSD', 7, 37), 259);
assert.equal(M.grossCents('EURUSD', 1, 108311, 108711, 37), 14800);   // TP
assert.equal(M.grossCents('EURUSD', 1, 108311, 108111, 37), -7400);   // SL
assert.equal(M.grossCents('EURUSD', 1, 108311, 108400, 37), 3293);    // floating at bid 1.08400
assert.equal(M.grossCents('USDJPY', -1, 151234, 150987, 100), 16359);
assert.equal(M.commissionCents('USDJPY', 7, 100), 700);
assert.equal(M.grossCents('EURUSD', -1, 110000, 110123, 50), -6150);
assert.equal(M.commissionCents('EURUSD', 7, 50), 350);
assert.equal(M.rrRatio(108311, 108111, 108711), 2);
assert.equal(M.rrRatio(100000, 99000, 101005), 1.01);   // USDJPY grid: 100.000 / 99.000 / 101.005 -> tie 1.005 -> 1.01
assert.equal(M.rrRatio(110000, 109992, 110011), 1.38);
assert.equal(M.rrRatio(100000, 100000, 100400), null);
// spread from hundredths of a pip, half away from zero
const sp = (h, id) => M.roundDiv(h * S.get(id).pointsPerPip, 100);
assert.equal(sp(20, 'EURUSD'), 2); assert.equal(sp(15, 'EURUSD'), 2); assert.equal(sp(200, 'XAUUSD'), 20); assert.equal(sp(1000, 'BTCUSDT'), 1000); assert.equal(sp(30, 'USDJPY'), 3);
// side checks with spread 2: bid 108300, ask 108302
// trigger examples (prototype returns uppercase reasons)
const L = { dir: 1, sl: 108200, tp: 108500 };
console.log(M.exitOnBar(L, [0, 108300, 108550, 108150, 108300], 2));
// trading day keys via dayAnchor + 1 day logic
const iso = s => Date.parse(s);
const td = (ms, id) => { const sc = S.get(id)._sc; const p = S._localParts(ms, sc.tz); const ds = 17*60; const add = (sc.alwaysOpen ? 0 : ((p.H*60+p.Mi) >= ds ? 1 : 0)); const d = new Date(Date.UTC(p.y, p.m-1, p.d + add)); return d.toISOString().slice(0,10); };
console.log('tradingDay', td(iso('2026-08-31T21:00:00Z'),'EURUSD'), td(iso('2026-09-01T03:00:00Z'),'EURUSD'), td(iso('2026-09-01T20:59:00Z'),'EURUSD'), td(iso('2026-09-01T23:59:00Z'),'BTCUSDT'));
console.log('dayAnchor D1 Tue 2026-09-01', new Date(M.bucketStart(iso('2026-09-01T03:00:00Z')/1000, 1440, 'EURUSD')*1000).toISOString());
// max drawdown example: start 1000.00, nets +100, -300, +50, -100
let bal = 100000, peak = bal, dd = 0, ddPctBp = 0;
for (const n of [10000, -30000, 5000, -10000]) { bal += n; if (bal > peak) peak = bal; const d = peak - bal; if (d > dd) { dd = d; ddPctBp = M.roundDiv(d * 10000, peak); } }
console.log('maxDd cents', dd, 'pct bp', ddPctBp);
// monthStart 2024-02
console.log('monthStart 2024-02', Date.UTC(2024, 1, 1) / 1000);
console.log('toMinutes sample', Math.round(1.08311 * 1e5), Math.round(1.08320 * 1e5), Math.round(81600.25 * 100), Math.round(150.987 * 1000));
console.log('ALL OK');
