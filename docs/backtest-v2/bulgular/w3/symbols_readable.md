
=== FILECHOICE ===
RECOMMENDATION: use one commented plain-JS file, not JSON. Put it at public/interface/backtest/js/bt-symbols.js. In the browser it exposes window.WwBtSymbols and in Node globalThis.WwBtSymbols. It follows the same IIFE pattern as WwMetrics and WwTime (public/interface/shared/trade-metrics.js:14-221).

Why JS and not JSON:
1. Comments can explain the units next to each value (point vs pip, 100 oz, New York hours), so adding a symbol means copying one block. JSON cannot hold comments.
2. The global is available synchronously. The SPA router runs non-page scripts once per document (src/components/SpaRouter.astro:92-100, 340-348), so there is no fetch() race before the symbol picker renders.
3. The derived math lives in one place, shared by replay, engine, importer and tests, so they cannot drift. That covers point, pointsPerPip, lotDigits, pip value, isOpen/nextOpen/dayAnchor and validate().
4. No new dependencies.

A JSON file (public/interface/backtest/symbols.json) would need fetch() plus cache-busting in the browser, and a second JS file for the helpers anyway. Its advantages (data that cannot execute, readable by Deno or SQL tools) are not needed today.

File shape:
- Top: SCHEDULES and SYMBOLS object literals, using only JSON-compatible values. This is the only part a person edits.
- Below: pure helpers.
- Export: WwBtSymbols = { SYMBOLS, SCHEDULES, get(id), list(), validate(), isOpen(ms,id), nextOpen(ms,id), dayAnchor(ms,id), toPoints, fromPoints, spreadPoints, pipValueUsd }.
- Derived at load: point = 10^-digits, pointsPerPip = pipSize/point, lotDigits = decimals(lot.step).

validate() checks:
- id matches /^[A-Z0-9]{3,12}$/ and is unique.
- instrument is a journal class (forex|gold|crypto|index|other).
- toUsd matches base/quote ('quote' requires quote USD/USDT/USDC; 'base' requires base USD).
- pipSize sits on the point grid and is at least 1 point.
- lot min, step and max are consistent.
- The schedule exists, dataStart is 'YYYY-MM', and the sanity range is valid.
- Warning if contractSize differs from the journal multiplier for its class (forex 100000, gold 100, crypto 1: public/src/core/config.js:6-12; live calc_trade_pnl scratchpad/db/fn_calc_trade_pnl.sql:41-47).

Split of the other backtest code: engine math (fills, triggers, money, rr) goes in bt-engine.js (window.WwBtEngine). 1m-to-higher-timeframe aggregation goes in bt-candles.js (window.WwBtCandles). Both are used by the browser and the tests. The Node importer needs only bt-symbols.js.

REQUIRED footer: })(typeof window !== 'undefined' ? window : globalThis);
The repo's current footer `... ? window : this)` (trade-metrics.js:221, time-settings.js:415) fails when the file is imported as ESM, because package.json has "type":"module". I reproduced this on Node v25.2.1: "TypeError: Cannot set properties of undefined". The same footer works under vm.

A working, tested prototype is at C:\Users\kadir\AppData\Local\Temp\claude\c--Users-kadir-OneDrive-Masa-st--Wawe-Journal-astro\97ee93d7-3b56-4094-909f-8a419fcb57d4\scratchpad\agents3\symbols-scripts\bt-symbols.js

=== LOADERBROWSER ===
In src/pages/backtest.astro (head), load the libraries before the page script:

<script src="/interface/backtest/js/bt-symbols.js?v=1" is:inline defer></script>
<script src="/interface/backtest/js/bt-candles.js?v=1" is:inline defer></script>
<script src="/interface/backtest/js/bt-engine.js?v=1" is:inline defer></script>
<script src="/interface/backtest/js/backtest.js?v=1" is:inline defer data-page-script></script>

- Library files have no data-page-script attribute, so the SPA runs them once per document. Their identity is the path; ?v= only breaks the HTTP cache (SpaRouter.astro:87-100, 347). Bump ?v= on every edit (PROJECT_OVERVIEW.md:388). A new deploy already forces a full reload.
- Usage:
  var S = window.WwBtSymbols; var sym = S.get('XAUUSD');
  candleSeries.applyOptions({ priceFormat: { type: 'price', precision: sym.digits, minMove: sym.point } });
  LWC 4.1.3 supports precision and minMove (scratchpad/agents/lwc413/typings.d.ts:2592-2598); the default is 2 decimals (:2988). Today's page hardcodes toFixed(2) (src/pages/backtest.astro:582, 619-620), which is wrong for EURUSD's 5 digits.
- Build the symbol picker from S.list(), grouped by sym.instrument. It replaces the free-text symbol box and the asset-class select (backtest.astro:218-230).
- Storage path: 'candles/' + sym.id + '/' + 'YYYY-MM' + '.json.gz'. sym.id doubles as the folder name.
- Guard: if window.WwBtSymbols is missing (old cached HTML), show the status banner instead of crashing.

=== LOADERNODE ===
Importer: scripts/import-candles.js is ESM because package.json has "type":"module". Import the file for its side effect:

import '../public/interface/backtest/js/bt-symbols.js';   // IIFE sets globalThis.WwBtSymbols
const S = globalThis.WwBtSymbols;
const errs = S.validate();
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
for (const sym of S.list()) { /* sym.source.provider, sym.digits, sym.sanity, S.isOpen(...) */ }

This runs in the same realm, executes once and needs no fs or vm. Verified on Node v25.2.1 with a "type":"module" package.

Tests (tests/bt-symbols.test.js) use the existing vm pattern from tests/trade-metrics.test.js:15-36:

const code = fs.readFileSync(path.resolve('public/interface/backtest/js/bt-symbols.js'), 'utf8');
const win = { Intl, Date, Math, Number, String, Array, Object, RegExp, JSON, isNaN, isFinite, parseInt, parseFloat };
win.window = win; vm.runInNewContext(code, win); const S = win.WwBtSymbols;
// then load bt-candles.js and bt-engine.js into the same sandbox

Caveat: arrays and objects created inside the vm have that context's prototypes, so assert.deepStrictEqual against host literals fails. Copy them first ([...x] or {...x}). The repo already does this at tests/trade-metrics.test.js:156, and I hit the same issue with validate().

Both loaders were exercised in my scratch test (test-hours.mjs).

JSON alternative, for reference only:
- Node: import symbols from '../public/interface/backtest/symbols.json' with { type: 'json' } (Node 22+), or JSON.parse(fs.readFileSync(...)).
- Browser: await (await fetch('/interface/backtest/symbols.json?v=1')).json().

=== CONVENTIONS ===
UNITS
- point = 10^-digits. This is the grid for storage, fills and display: EURUSD/GBPUSD 0.00001, USDJPY 0.001, XAUUSD 0.01, BTC/ETH 0.01 (the Binance tick).
- pip = pipSize. It is the unit for UI distances and for spread_pips. Rule for FX and metals: pip = 10 points (EURUSD/GBPUSD 0.0001, USDJPY 0.01, XAUUSD 0.1). Rule for crypto: pip = 1 USDT = 100 points.
- 1.0 lot = contractSize units of the base: FX 100,000; XAUUSD 100 oz; BTC/ETH 1 coin.
- contractSize matches the journal multipliers (forex 100000, gold 100, crypto 1: public/src/core/config.js:6-12; calc_trade_pnl :41-47). Mirrored trades therefore carry instrument = sym.instrument and multiplier = contractSize consistently.

USD P&L
- gross_quote = dir × (exit − entry) × lot × contractSize.
- toUsd 'quote' (USD, or USDT treated as USD): × 1.
- toUsd 'base' (USDJPY): ÷ the exit fill price, or ÷ the mark price for floating P&L.
- Cross pairs later: add toUsd:{via:'GBPUSD',op:'mul'} and load that symbol's month file. validate() rejects this until it is implemented.
- Pip value per lot: EURUSD/GBPUSD $10, XAUUSD $10, USDJPY 1000/price, BTC/ETH $1.
- The journal's calcPnL does no quote conversion (public/src/utils/helpers.js:40-52; USDJPY comes out in JPY), so the engine must not reuse it. A stored pnl takes priority in WwMetrics (trade-metrics.js:37-38) and in the trigger (calc_trade_pnl :10).

XAUUSD PIP
- Recommend 0.1. It keeps "pip = 10 points" for every FX/metal symbol and gives $10 per pip per lot like EURUSD; this is the common MT4/MT5 retail usage.
- 0.01 (one MT "point") is used by some feeds.
- Decide before launch: changing it later silently rescales every stored spread_pips by ×10. P&L is unaffected, because the engine works in price units.
- digits 2 is the broker quoting standard. Dukascopy's 3rd decimal is dropped by the importer.

JPY: digits 3, pip 0.01, point 0.001.

spread_pips
- ask = bid + round(spread_pips × pointsPerPip) points, rounded half away from zero. Examples: EURUSD 0.2 → 2 points = 0.00002; XAUUSD 2 → 20 points = $0.20; BTCUSDT 10 → 1000 points = $10.00.
- For BTCUSDT/ETHUSDT, spread_pips is literally USDT (1 pip = 1 USDT), entered at 0.01 precision (1 point = 1 Binance tick).
- Binance klines are last-trade OHLC with no bid/ask. The engine treats them as BID, and the real spot spread is about 1 tick. So 0.01 roughly mimics the exchange, while 10 (BTC) or 1 (ETH) mimics a CFD broker.
- A fixed USDT spread does not scale with price: BTC was about $7k in 2020 and about $81.6k in the 2026-10-17 sample. A per-account spread_bps for crypto could be added later.

ACCOUNT SCOPE (owner decision)
- On a multi-symbol account, one scalar spread_pips (or commission_per_lot) cannot fit every symbol: 0.2 suits EURUSD but means $0.02 on XAUUSD and $0.20 on BTC.
- Options: single-symbol backtest accounts, or a per-symbol override map with the config's defaultSpreadPips as fallback.
- In every case, snapshot spread_points and commission_per_lot onto each backtest trade.

COMMISSION
- commission_per_lot = USD per 1.0 lot, ROUND-TURN (open plus close together).
- This matches Quick Add (lot × commPerLot: public/interface/quick-add/js/quick-add.js:1323, 1487; presets 1187-1189 e.g. Prop Firm $6) and the earlier mapping sketch ($7 RT: scratchpad/agents2/bt-mapping-sketch.mjs:71-83).
- Brokers that quote per side: the user enters 2× that amount.
- For crypto, "per lot" means per coin. Binance's percentage fees cannot be expressed this way; a later commission_pct field could cover them.

TIME AND DATA
- All timestamps are UTC epoch seconds. A bar's time is the open time of the 1m bar. For FX and gold, the trading day runs 17:00 NY → 17:00 NY.
- Dukascopy: integer prices ÷ priceScale. Record order is O,C,L,H, not O,H,L,C.
- Binance: decimal strings with 8 decimals, on the 0.01 grid. Timestamps are ms up to 2024 and µs from 2025; normalize by digit count.

=== MARKETHOURS ===
CONFIG (in bt-symbols.js; symbols point to a schedule with schedule:'fx'|'metal'|'crypto')

var SCHEDULES = {
  fx:     { tz:'America/New_York', weekOpen:'Sun 17:00', weekClose:'Fri 17:00', dailyBreak:null,
            dayStart:'17:00', holidays:['12-25','01-01'], thinDays:['12-24','12-31'], thinAfter:'12:00' },
  metal:  { tz:'America/New_York', weekOpen:'Sun 18:00', weekClose:'Fri 17:00', dailyBreak:['17:00','18:00'],
            dayStart:'17:00', holidays:['12-25','01-01'], thinDays:['12-24','12-31'], thinAfter:'12:00' },
  crypto: { tz:'UTC', alwaysOpen:true, dayStart:'00:00', weekStartDow:1 }
};

Meaning of the fields:
- weekOpen/weekClose/dailyBreak are wall-clock times in tz. At load they expand to sorted half-open intervals in "local week-minutes" (dow*1440 + H*60 + M). fx = [Sun 17:00, Fri 17:00). metal = Sun 18:00 to Mon 17:00, Mon 18:00 to Tue 17:00, and so on through Fri 17:00.
- A holiday 'MM-DD' closes that whole trading day: from 17:00 NY on the previous calendar day to 17:00 NY on that day. This matches broker practice where server midnight = 17:00 NY.
- thinDays are used only by the importer: gaps after thinAfter New York time are labelled 'holiday-thin' instead of 'missing'.
- Not modelled: early closes, Good Friday for gold, and "observed" Monday holidays. Add them if the importer's gap report shows them.

ALGORITHM (Intl only, no library; the same code runs in browser and Node)

localParts(ms, tz):
- Get the zone offset with new Intl.DateTimeFormat('en-US', {timeZone, hourCycle:'h23', year, month, day, hour, minute, second}).formatToParts. Compute offset = Date.UTC(parts) − ms.
- Cache the offset per UTC hour (New York only changes offset on whole UTC hours), then derive y/m/d/H/Mi with getUTC* on ms + offset.
- dow = new Date(Date.UTC(y, m−1, d)).getUTCDay(), which is independent of the locale's weekday names.
- Keep the WwTime guard for hour 24 → 0 (time-settings.js:41-60).

zonedToUtc(y, m, d, H, Mi, tz): two-pass offset correction, identical to WwTime.zonedToUtcMs (time-settings.js:79).

isOpen(ms, id):
  if (sc.alwaysOpen) return true;
  p = localParts(ms, sc.tz); w = p.dow*1440 + p.H*60 + p.Mi;
  return intervals.some(iv => w >= iv[0] && w < iv[1])
      && !holidays.includes(MMDD(p.H*60+p.Mi >= dayStart ? date+1 : date));

nextOpen(ms, id): returns the smallest open minute ≥ ms.
  t = ceil to minute; if crypto return t;
  repeat (guard 32):
    p = localParts(t);
    if regularOpen and not holiday → return t;
    if regularOpen but holiday → t = zonedToUtc(tradingDate, dayStart);   // e.g. Dec 25 17:00 NY
    else → find the next interval start after w (or this week's first one + 7 days)
           → t = zonedToUtc(local Sunday + floor(start/1440) days, start % 1440);

dayAnchor(ms, id): the latest dayStart ≤ ms (17:00 NY, or 00:00 UTC for crypto), cached per UTC hour. Used for D1, H4 and W1.

DST
- Every session boundary is at 17:00 or 18:00 NY. The DST switch happens at 02:00 on a Sunday, while the market is closed, so no local time is ever skipped or duplicated.
- The UTC times follow automatically: Friday close and Sunday open are 22:00Z in winter and 21:00Z in summer. The weeks where US and EU DST differ do not matter, because only New York is used.

VERIFIED (scratch test-hours.mjs, Node v25.2.1, ICU 77.1)
- isOpen agreed with an independent arithmetic US-DST rule (2nd Sunday of March / 1st Sunday of November, holidays included) on all 490,944 points of a 15-minute grid from 2020-01-01 to 2026-12-31, for both fx and metal.
- Spot checks: 2026-03-06 22:00Z closed; 2026-03-08 21:00Z open; 2026-11-01 22:00Z open; gold 2026-07-14 21:00–21:59Z closed (break).
- nextOpen: Christmas 2023 (Monday) reopens 2023-12-25 22:00Z (FX) and 23:00Z (gold). On 3,000 random instants it returned the first open minute, and every minute between was closed.
- Speed: about 5 µs per isOpen call.

=== AGGREGATION ===
TIMEFRAMES: M1, M5, M15, M30, H1, H4, D1. W1 is optional (later, or with a bounded lookback).

BUCKETS (t = UTC seconds)
- M1–H1 use the UTC grid: start = t − t mod tf. This is identical to session alignment because New York's offsets are whole hours.
- H4 and D1 are anchored to the symbol's dayStart: a = dayAnchor(t); start = a + floor((t − a)/tf) × tf.

D1 RECOMMENDATION: per symbol. 17:00 New York for FX and gold; 00:00 UTC for crypto (as Binance daily klines).
- Gives 5 daily bars per week with no 2-3 hour Sunday stub.
- Matches MT4/MT5 servers on NY-close time (GMT+2/+3).
- The Sunday-evening session belongs to Monday's bar.

H4 RECOMMENDATION: the same anchor.
- FX/gold H4 bars start at 17/21/01/05/09/13 NY, which is 21/01/…Z in summer and 22/02/06/10/14/18Z in winter.
- With strict UTC H4 (00/04/…Z), every Friday close and Sunday open falls inside the 20:00Z bucket, creating stub bars.
- Switching to UTC is a one-line change if you prefer it. Crypto H4 is on the UTC grid either way.

W1: FX/gold weeks start at the Sunday 17:00 NY anchor of Monday's trading day; crypto weeks start Monday 00:00 UTC.

GAPS: aggregate only the 1m bars that exist. A bucket with no 1m bars produces no candle, and a partially filled bucket is a normal candle with fewer minutes (keep n, the 1m count, for diagnostics). Never forward-fill or invent synthetic bars.

IN-PROGRESS CANDLE
- cursor = index k into the time-ordered 1m array (loaded months concatenated).
- Current higher-timeframe candle = aggregate(bars[i0..k]), where i0 is the first bar with bucketStart = bucketStart(t_k). Bars after k are never used, so there is no look-ahead.
- Incremental per 1m step: same bucket → high = max, low = min, close = c, n++ and series.update(); new bucket → append a candle.

REPLAY STEPPING
- The cursor moves only over existing 1m bars, so weekends, the gold 17–18 break, holidays and missing minutes are skipped automatically, and autoplay has no dead time.
- "1 bar" in timeframe X advances to the last 1m bar of the next bucket, completing the current partial bar first.
- The engine processes every 1m bar it passes (TP/SL), so a higher-timeframe step never skips a trigger. This is "bar magnifier" behaviour.
- Gaps (Δt > 60 s between bars) are labelled with isOpen: closed → session separator "Piyasa kapalı"; open → "veri eksik (n dk)".
- Jump to a date: t' = nextOpen(t), then the first bar with time ≥ t'.

MONTH FILES
- Load the previous month when a bucket starts before the month start. FX/gold D1, H4 and W1 anchors fall on the previous UTC day: for example, D1 for Tue 2026-09-01 starts 2026-08-31T21:00Z, which is in the August file (tested).
- Load previous months for warm-up history: roughly 200 bars means about 1 month for M1–M15, 2 for H1, 4 for H4 and about 10 for D1. The storage track measured an FX month at about 290 KB gzip (agents3/storage/results.json).
- Prefetch the next month when the cursor is within about 2 trading days of the end of the loaded data.

DISPLAY: keep series times as true UTC. Show labels in the user's timezone with LWC localization.timeFormatter and timeScale.tickMarkFormatter (lwc413/typings.d.ts:2424, 3203). Shifting the data itself, as WwTime.pseudoUtcSeconds does (time-settings.js:275), would create duplicate times during the DST fall-back hour for 24/7 crypto, and LWC rejects them.

VERIFIED (test-math.mjs, synthetic open-minute data)
- Across the 2026-11-01 DST end: D1 = 5 bars per week of 1440 minutes each, at 21:00Z then 22:00Z.
- H4 = 6 bars of 240 minutes per day, at 22/02/06/10/14/18Z in winter.
- W1 = Sunday 17:00 NY.
- Gold: the first H4 bar has 180 minutes, and Sunday's 18:00 open goes into Monday's D1 bar (1380 minutes).
- Removed minutes produce no synthetic bars.
- The partial candle equals the aggregate of bars ≤ cursor.
- Speed: 31,860 bars aggregated to M5/H1/H4/D1 in about 30–40 ms.

=== ENGINEMATH ===
REPRESENTATION
- Prices are integer points: P = round(price × 10^digits). Int32 is enough for all six symbols.
- Lots are integer steps: n = round(lot / step).
- Money is integer cents.
- Spread in points: s = round(spread_pips × pointsPerPip); ask = bid + s.

FILLS (cursor = last revealed 1m bar k; c = its BID close)
- Open LONG = BUY at ask c + s. Open SHORT = SELL at bid c.
- Close LONG = SELL at bid c. Close SHORT = BUY at ask c + s.
- Entry time = t_k + 60 s. TP/SL checks start at bar k+1, because bar k's range happened before the fill. (Today's page checks the displayed timeframe bar: backtest.astro:539-548.)
- Order checks: LONG requires SL < c < TP. SHORT requires TP < c + s < SL. Levels snap to the point grid; lot must be on the step grid and within min/max.

TRIGGERS (per 1m bar j, BID o/h/l)
- LONG triggers on BID: SL if l ≤ SL; TP if h ≥ TP.
- SHORT triggers on ASK: SL if h + s ≥ SL; TP if l + s ≤ TP.
- Gap at the open: if the bar opens beyond SL, fill at the open (o for LONG, o + s for SHORT) as slippage. If it opens beyond TP, fill at TP with no price improvement (conservative). The side the bar opens beyond decides first.

SAME 1m BAR HITS BOTH TP AND SL
- 1m is the smallest timeframe in our archive, so no lower timeframe can decide. Resolving it would need tick data (Dukascopy tick files or Binance aggTrades), which the archive does not include.
- Proposed rule: SL first (worst case), filled at SL, and the trade is flagged exit_ambiguous=true so the UI and reports can count these cases.
- A TradingView-style open-proximity path can be added later as a setting.

P&L (exact, rounded once)
- gross cents = roundHalfAway(dir × ΔP × n × Fn, Fd), with F = contractSize × 100 / 10^(digits + lotDigits) reduced by gcd. For EURUSD/GBPUSD/XAUUSD F = 1; for BTC/ETH F = 1/100.
- toUsd 'base' (USDJPY): multiply by 10^digits / exitP. For USDJPY this gives cents = ΔP × n × 10^5 / exitP.
- Use a BigInt fallback if a value is not a safe integer.
- Tested: EURUSD LONG 0.37 lot 1.08311→1.08423 = 41.44; USDJPY SHORT 1 lot 151.234→150.987 = 163.59; BTC 0.01 lot +123.45 = 1.23; −1.235 → −1.24.

COMMISSION: roundHalfAway(round(cpl × 100) × n, 10^lotDigits), round-turn, booked once at close. For partial closes, book C(closed so far) − C(closed before) so the pieces sum exactly to the full amount.

NET: gross − commission + swap. Swap is 0 in v1. Net is exact cents with no second rounding. Balance = start + Σ net.

ROUNDING
- Ties go away from zero, which is Postgres ROUND(numeric, 2).
- Normalize −0 to 0. A tiny loss otherwise prints as "-0.00"; this happened in my fuzz test.
- Never use toFixed() on floats for stored values.
- Send money to the database as decimal strings built from cents, and prices as strings with `digits` decimals.

rr_ratio
- ROUND(|tp − entry| / |entry − sl|, 2), computed on integer points as roundDiv(reward × 100, risk)/100. entry is the real fill (ask for LONG); SL and TP are the initial levels. Null if SL or TP is missing or risk = 0.
- This is identical to calc_trade_pnl (scratchpad/db/fn_calc_trade_pnl.sql:20, 64) when prices are stored with `digits` decimals.
- Float pitfall: entry 1.10000, SL 1.09992, TP 1.10011 is 11/8 = 1.375. Float plus toFixed gives 1.37; Postgres gives 1.38. The journal's calcRR has this issue (public/src/utils/helpers.js:66).

UNREALIZED P&L: mark a LONG at bid c and a SHORT at ask c + s. For USDJPY, convert with that mark. Floating net = gross(mark) − full round-turn commission, which is what closing now would book. Equity = balance + Σ floating net, updated every 1m step.

TIMES: a TP/SL exit time is the open time of the trigger bar (1-minute precision). A manual close happens at cursor time.

PENDING ORDERS (optional)
- BUY LIMIT: triggers if l + s ≤ L; fill L.
- BUY STOP: triggers if h + s ≥ S; fill max(S, o + s).
- SELL LIMIT: triggers if h ≥ L; fill L.
- SELL STOP: triggers if l ≤ S; fill min(S, o).
- TP/SL are checked from the next bar.

VERIFIED: 200,000 random trades across all six symbols matched an independent BigInt decimal reference for both gross and rr; plus unit tests for every trigger and gap case.

=== VALIDATION ===
Checks the importer runs per symbol and per month. All thresholds come from sym.sanity and the schedule.

1. FORMAT
- Dukascopy: decompressed size is a multiple of 24 bytes; a day file has 1440 records with offsets 0…86340 in steps of 60. The record is [offset, O, C, L, H, vol], big-endian. The URL month is 0-based (to be confirmed by the dukascopy track).
- Binance: 12 columns, no header. Normalize open_time: 13 digits = ms (up to 2024), 16 digits = µs (from 2025; verified on samples). close_time = open + 59,999 ms (or 59,999,999 µs).

2. TIMES: UTC seconds, a multiple of 60, inside [month start, next month start), strictly increasing. Exact duplicates are removed; conflicting duplicates are corrupt.

3. PRICES (hard; drop the bar and report it)
- Finite and > 0.
- Inside [sanity.min, sanity.max]. This catches a wrong scale or field order immediately; for example, USDJPY read at 1e5 gives 1.5.
- On the point grid after scaling.
- OHLC consistent: l ≤ min(o, c), h ≥ max(o, c).

4. DUKASCOPY FILLERS: bars with o = h = l = c and volume 0 are dropped as no-tick minutes. They are counted separately inside and outside market hours. Weekend filler candles are the reason dukascopy-node ignores flat candles by default; confirm on the first import.

5. SUSPECT BARS (report only, never auto-delete; real flash crashes such as gold on 2021-08-09 must stay)
- range (h − l)/c > barPct;
- |o − prevClose|/prevClose > jumpPct when bars are consecutive (Δt = 60 s); allow 3× across a closed gap;
- an isolated wick: h − max(o, c, prevClose, nextOpen) > spikePct% of price (mirror for the low).
- Confirmed bad bars go into an optional manual exclusion file, not into the config.

6. GAPS: for every Δt > 60 s, check each missing minute with isOpen.
- Closed (weekend, gold break, holiday): expected.
- Open: a missing run with start, end and length. Up to 5 minutes is "thin" (normal for Dukascopy around the 17:00 NY rollover and the Sunday open); more is "missing"; 60 minutes or more is an "outage". After thinAfter on thinDays the label is "holiday-thin".
- Crypto is 24/7, so every gap is missing. Example: ETHUSDT 2020-06-28 02:00–05:29 UTC, 210 minutes (Binance maintenance), found in the binance track's sample.
- Bars present during configured closed hours are kept and counted as outside_hours. If the count is consistently non-zero (for example, gold Sun 17–18), the schedule in the config is wrong.

7. MONTH LEVEL
- coverage = bars ÷ expected open minutes (counted with isOpen); flag below about 98% for FX.
- Continuity: |first open of a month − last close of the previous month| within jumpPct × 3.
- Only store a month once it has fully passed; a current month is "partial" in the manifest and fetched again later.

8. REPORT (one JSON line per symbol and month): {symbol, month, bars, expectedOpen, coverage, dropped:{flat0In, flat0Out, dup, outOfMonth}, corrupt:[{t, why}], suspects:[{t, kind, value}], gaps:{missing:[{from, to, min}], thin, holidayThin, closedMin}, outsideHours}.

=== SYMBOLS ===

# EURUSD
{ id:'EURUSD', name:'EUR/USD', instrument:'forex', base:'EUR', quote:'USD', toUsd:'quote', source:{ provider:'dukascopy', symbol:'EURUSD', side:'BID', priceScale:100000 }, digits:5, pipSize:0.0001, contractSize:100000, lot:{ min:0.01, step:0.01, max:100 }, schedule:'fx', dataStart:'2020-01', defaultSpreadPips:0.2, sanity:{ min:0.5, max:2.5, barPct:1.5, jumpPct:1, spikePct:0.3 } }
Derived: point 0.00001, 10 points per pip, pip value $10 per lot.
Verified: on a decoded Dukascopy EURUSD 1m day file, raw 114543 = 1.14543. Each record is 24 bytes, big-endian [offsetSec, open, close, low, high, volume(float32)]; reading it as O,C,L,H fits 1440/1440 records, while O,H,L,C fits only 145/1440.

# GBPUSD
{ id:'GBPUSD', name:'GBP/USD', instrument:'forex', base:'GBP', quote:'USD', toUsd:'quote', source:{ provider:'dukascopy', symbol:'GBPUSD', side:'BID', priceScale:100000 }, digits:5, pipSize:0.0001, contractSize:100000, lot:{ min:0.01, step:0.01, max:100 }, schedule:'fx', dataStart:'2020-01', defaultSpreadPips:0.4, sanity:{ min:0.7, max:3, barPct:1.5, jumpPct:1, spikePct:0.3 } }
Derived: point 0.00001, 10 points per pip, pip value $10 per lot.

# USDJPY
{ id:'USDJPY', name:'USD/JPY', instrument:'forex', base:'USD', quote:'JPY', toUsd:'base', source:{ provider:'dukascopy', symbol:'USDJPY', side:'BID', priceScale:1000 }, digits:3, pipSize:0.01, contractSize:100000, lot:{ min:0.01, step:0.01, max:100 }, schedule:'fx', dataStart:'2020-01', defaultSpreadPips:0.3, sanity:{ min:60, max:300, barPct:1.5, jumpPct:1, spikePct:0.3 } }
Derived: point 0.001, 10 points per pip. Pip value is 1,000 JPY per lot, which is 1000/price USD (about $6.67 at 150.000). P&L is divided by the exit price.
priceScale 1000 is expected but not yet confirmed on a sample. If it is wrong, the sanity range [60, 300] fails immediately.

# XAUUSD
{ id:'XAUUSD', name:'XAU/USD', instrument:'gold', base:'XAU', quote:'USD', toUsd:'quote', source:{ provider:'dukascopy', symbol:'XAUUSD', side:'BID', priceScale:1000 }, digits:2, pipSize:0.1, contractSize:100, lot:{ min:0.01, step:0.01, max:100 }, schedule:'metal', dataStart:'2020-01', defaultSpreadPips:2, sanity:{ min:500, max:20000, barPct:2.5, jumpPct:2, spikePct:0.5 } }
Derived: point 0.01, 10 points per pip, pip value $10 per lot (100 oz). defaultSpreadPips 2 means $0.20.
Dukascopy quotes 3 decimals; the importer rounds to 2 with integer half-up on raw/10. Rounding is monotonic, so OHLC order is preserved.
priceScale 1000 is expected but not yet confirmed. If it is wrong, the sanity range [500, 20000] fails.

# BTCUSDT
{ id:'BTCUSDT', name:'BTC/USDT', instrument:'crypto', base:'BTC', quote:'USDT', toUsd:'quote', source:{ provider:'binance', market:'spot', symbol:'BTCUSDT', interval:'1m', priceScale:null /* decimal strings */ }, digits:2, pipSize:1, contractSize:1, lot:{ min:0.01, step:0.01, max:100 }, schedule:'crypto', dataStart:'2020-01', defaultSpreadPips:10, sanity:{ min:1000, max:2000000, barPct:8, jumpPct:5, spikePct:2 } }
Derived: point 0.01 (the Binance tick), 100 points per pip, 1 pip = 1 USDT, pip value $1 per lot (1 BTC). defaultSpreadPips 10 means $10, which is CFD-like; the real Binance spread is about 1 tick.
Verified: prices sit on the 0.01 grid. open_time is in ms (13 digits) in the 2024-12-31 file and in µs (16 digits) in the 2026-10-17 file.

# ETHUSDT
{ id:'ETHUSDT', name:'ETH/USDT', instrument:'crypto', base:'ETH', quote:'USDT', toUsd:'quote', source:{ provider:'binance', market:'spot', symbol:'ETHUSDT', interval:'1m', priceScale:null }, digits:2, pipSize:1, contractSize:1, lot:{ min:0.01, step:0.01, max:1000 }, schedule:'crypto', dataStart:'2020-01', defaultSpreadPips:1, sanity:{ min:50, max:200000, barPct:10, jumpPct:6, spikePct:3 } }
Derived: point 0.01, 1 pip = 1 USDT, pip value $1 per lot (1 ETH).
Verified on the 2020-06 sample: 42,990 rows, 0.01 grid, no OHLC violations, largest 1m range 4.889%.
