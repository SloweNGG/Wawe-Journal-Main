# Backtest v2 — consolidated owner requirements (as of 2026-10-18)

Source: the owner's messages in this session (Turkish originals summarized in English). IDs are stable; later messages override earlier ones where noted.

## General
- R1 Rewrite /backtest from scratch: backtest accounts, bar replay, journal linkage.
- R2 Follow PROJECT_OVERVIEW.md: Astro page + plain browser JS under public/, CDN libraries with pinned versions. NO new npm packages.
- R7 Present a plan and wait for approval before removing/implementing anything.

## Recon (done)
- R3 Branch backtest-v2 created; current state committed (f62f68c).
- R4 Inventory of the old backtest (page script, CSS, i18n keys, backtest_trades and its users, get-candles) + check whether other pages depend on them.
- R5 backtest_trades row count / distinct users: 0 rows, 0 users (live query 2026-10-18).
- R6 Report get-candles data source + health (superseded by R36/R44, still report what it was).

## Stage 2 — removal (after approval)
- R8 Remove the old backtest UI and logic completely. KEEP the navbar Backtest link and the /backtest route; the page will be filled by the new system.
- R9/R32 Drop backtest_trades with a migration (owner approved: 0 rows). Update reset_user_data accordingly, and add the NEW backtest tables (backtest_accounts and the backtest trades table) to reset_user_data.

## Stage 3 — database (supabase/migrations, CREATE TABLE)
- R10 backtest_accounts: id, user_id, journal_id (→ journals, ON DELETE SET NULL, nullable), name (max 60 chars), symbol, timeframe, starting_balance (> 0), spread_pips, commission_per_lot, replay_time (timestamptz), is_active, created_at, updated_at.
- R11 Backtest trades table: id, user_id, backtest_account_id (→ backtest_accounts, ON DELETE CASCADE), symbol, direction (LONG/SHORT), lot, entry_price, exit_price, stop_loss, take_profit, entry_time, exit_time (market time in the replay), pnl (USD), commission, rr_ratio, exit_reason (tp / sl / manual), created_at.
- R12 RLS like the other tables: user_id = auth.uid() OR is_admin().
- R13 Trigger: when journal_id is set, verify the journal belongs to the same user (like check_prop_account_limit). Account quota: free 1, premium 10.
- R35 Each migration is a SEPARATE file, numbered in execution order, each with its own ROLLBACK SQL. Migrations are run manually in the SQL Editor.
- R35b NO write to the live database without the owner's approval.
- R48 Durable rule: immediately BEFORE the first write to the live DB (migrations included) take a FULL database backup and tell the owner where it is stored.

## Data archive (replaces the live API / Twelve Data)
- R36 Use our own historical archive instead of a live API.
- R37 Sources: Binance (data.binance.vision monthly 1m kline files) for crypto; Dukascopy 1m data for forex and gold (BID prices; spread applied from the account settings).
- R38 Initial symbols: EURUSD, GBPUSD, USDJPY, XAUUSD, BTCUSDT, ETHUSDT; from 2020 to today.
- R39 Node import script under scripts/: download and upload compressed files per symbol/month to Supabase Storage (e.g. candles/EURUSD/2026-09.json.gz). All timestamps UTC. Report missing or corrupt candles. Resumable; only download missing months.
- R40 Compact file format: arrays [time, open, high, low, close]; price precision per symbol.
- R41 Replay downloads the relevant month files from Storage, builds higher timeframes from 1m in the browser, preloads the neighbor month when needed.
- R42 Storage bucket readable ONLY by signed-in users.
- R43 Symbol list in ONE config file: pip value, contract size (e.g. XAUUSD 100 oz), price precision, market hours. Adding a symbol must be easy.
- R44 Remove get-candles and the Twelve Data dependency from backtest; report anything else that uses them (finding: nothing else in code; only PROJECT_OVERVIEW.md mentions it).
- R45 Archive updates: the import script runs as a DAILY scheduled GitHub Actions job (e.g. 02:00 UTC). Only new days: Binance daily 1m kline files, Dukascopy daily 1m data. The current month's file is updated with the new days on every run, and the manifest too. Supabase service role key in GitHub Secrets. On failure the job stops with a clear error message.
- R47 The repo (github.com/SloweNGG/Wawe-Journal-Main) will be made PRIVATE by the owner: plan GitHub Actions for a private repo (minutes quota, no 60-day public inactivity rule). No git-history scan.

## Stage 5 — journal link (cTrader sync pattern)
- R15 The link is backtest_accounts.journal_id.
- R16 The linked account's CLOSED trades are written to trades: journal_id = the account's journal, platform_source = 'backtest', import_hash = 'backtest:<accountId>:<tradeId>', trade_date = entry time, exit_date = exit time (both replay market time). Upsert with the existing UNIQUE (user_id, journal_id, import_hash).
- R17 When an account gets linked to a journal, its past closed trades are transferred too.
- R18 When the link changes, is removed, or the account is deleted, the 'backtest:<accountId>:%' rows in the related journal are deleted.
- R19 After sync, clear the related trades cache in wwCache.
- R34 Report exactly what trg_calc_pnl computes; if it changes pnl / gross_pnl / commission, propose how backtest trades in trades stay consistent with the backtest account's P&L.

## Stage 6 — statistics
- R20 Everywhere trades is queried (dashboard, premium-dashboard, trades, calendar, strategies, PDF report, list_journals RPC) live statistics EXCLUDE platform_source = 'backtest' by default.
- R21 Trade list: All / Live / Backtest filter and a "Backtest" badge.

## Stage 4 — backtest page
- R22 Account list, new-account form (optional journal select), and the replay screen that opens when entering an account. Each account resumes from its saved replay time.
- R23 Replay: go to date, play/pause, step forward one bar, speed control. Future candles are NEVER visible. A higher-timeframe candle forms step by step from lower-timeframe data.
- R24 Trade engine: market buy/sell, lot, optional TP/SL, spread and commission. If TP and SL trigger in the same candle, decide which came first using a smaller timeframe. Balance, realized and open P&L.
- R25 Chart: the existing Lightweight Charts 4.1.3 through WwChart.lwc(). setMarkers for entries/exits; createPriceLine for entry/TP/SL levels.
- R26 Clear the replay playback timer in PAGE.onLeave; nothing runs in the background after an SPA navigation.
- R27 A TradingView attribution link on the page (Lightweight Charts license).
- R28 Design: pure-black background rule for charts and modals, existing CSS variables, DM Sans / Syne / JetBrains Mono.
- R29 New texts added to tr, en, de (data-i18n). Bump the ?v= number of changed files.

## Tests
- R30 node:test tests under tests/ for the backtest engine (TP/SL, P&L) and the sync mapping.

## Order
- R31 Stages: 1) recon + report, 2) remove old system, 3) database, 4) accounts + replay + trade engine, 5) journal sync, 6) statistics filters. The app must be working after EVERY stage.

## Next phase — NOT now (keep hooks only)
- R46 Users' live-data API keys stored server-side, encrypted (Supabase Vault or Edge Function encryption); only an Edge Function can decrypt; never sent back to the browser; the UI shows only the last 4 characters; RLS so each user only reaches their own record. The chart clearly shows the data source (Archive / Live · provider name).

## Data-source and access update (owner, 2026-10-18, after the licensing findings)
- R53 Option chosen: the archive is SOURCE-AGNOSTIC. Forex and gold stay disabled until a licensed source exists. Licensed forex/gold providers are researched with prices.
- R49 The backtest page is open ONLY to the owner's admin account for development and testing; it must not be shown to other users until the licence is clear.
- R50 Do not try to get around Dukascopy's bot protection, and do NOT write a Dukascopy adapter.
- R51 Add to the data-source research: (1) data through the user's own account: can historical candles (trendbars) be fetched via the cTrader Open API through our existing cTrader integration? Report how far back 1m goes, the limits, and whether the cTrader Open API terms allow this use. Evaluate other providers where the user enters their own API key (e.g. OANDA, Twelve Data) from the same angle. (2) Licensed commercial providers that allow showing forex and gold data to users in our app, with prices.
- R52 Write the Binance adapter, but keep it DISABLED until the owner makes the licence decision.

## Owner preferences (from memory)
- Dark mode: pure black (#000) surfaces for charts/tooltips/modals, no purple/gray tints; numbers in DM Sans; an expanded chart opens as a centered modal, not full screen.
- The owner disliked merging separate pages into one and disliked lock-icon gating.
