# Backtest v2: Stages 5 and 6 (journal sync and statistics filters)

Implementation plan. Track: sync + stats. Branch `backtest-v2` @ f62f68c. Nothing in the repository was changed: the repo was read only and `git status` is still clean. No production access was used.

Binding inputs: `inputs/requirements.md` (R-ids) and `inputs/decisions.md` (D-ids). Where this plan adds to or questions a decision, the point is marked **[RAISED]** and repeated in section 8.

---

## 0. Status and verification

Stage 6 and the code side of Stage 5 are fully specified **and prototyped**. Every artefact below was executed (log: `verify.log`; re-run with `node proto/verify-all.mjs`):

| Check | Result |
|---|---|
| Patch generator applies every Stage 6 edit to scratch copies of the 29 affected files. Each anchor matches exactly once, line endings and BOM are preserved, `node --check` passes, and inline `<script>` blocks of edited `.astro` pages pass. | OK, 0 syntax failures |
| Prototype suites: `bt-sync` (29), `trades-source` (20, including a reproduction of today's cache leak), patched `prop-service` (16) | 65/65 |
| **Mirror run**: repo `public/` + `tests/` + `package.json`, overlaid with all patched files, the new files, the repo-ready tests and the Stage 3B `bt-symbols.js` prototype, then `node --test tests/*.test.js` | **206/206** (156 existing + 50 new) |
| `bundle.js` rebuilt with the repo's own esbuild (output in scratch) | builds; `WwTrades` is defined first; 5 `applyScope` call sites |
| Row-builder smoke test of the patched `trades.js` (desktop and mobile, mixed list) | backtest rows: badge, no checkbox, no delete; live/cTrader rows unchanged |

The exact Stage 6 edits are in `patches/stage6-readers.patch` (unified diff, 29 files). The final new files are in `repo-ready/`.

---

## 1. Ship rule: Stage 5 ships only together with Stage 6 (D2)

A backtest row must never reach a reader that has no live filter. How this is enforced:

1. **One release.** Stage 5 (`bt-sync.js`, its page hooks, tests) and Stage 6 (`trades-source.js`, every reader, `cache.js`, trades page, tests, `bundle.js`) are merged and deployed in the same PR/deploy. Stage 5 must not be merged on its own.
2. **DB first.** Migration 04 (cleanup triggers) and Migration 05 (stats SQL) are applied **before** the deploy. Both are no-ops on today's data (0 rows with `platform_source = 'backtest'`, `db/trades_platform_source_dist.json`).
3. **Runtime guard.** `WwBtSync` refuses every write when `window.WwTrades` is missing and returns `STATS_FILTER_MISSING` (unit-tested). A client without the Stage 6 helper can therefore never create backtest rows.
4. **No stale HTML gap** **[RAISED, addition to D1]**. The service worker serves clean-URL HTML cache-first (`public/sw.js:41-65`). So the first load after a deploy can run *new* `/interface/*.js` code inside *old* HTML whose BaseHead has no `trades-source.js` tag. To cover this, `trades-source.js` is also imported for side effects at the top of `public/src/script.js`, so it ends up in `bundle.js`:
   - `/src/` bypasses the SW, and `bundle.js` runs before every page script in all affected pages (verified head order).
   - The file has an idempotency guard (`if (global.WwTrades) return;`), so whichever copy loads first wins.
   - BaseHead still loads it synchronously, as D1 requires.

Rollout order: approval, then M04 and M05 in the SQL Editor (each with post-checks), then merge, then `npm run build` (regenerates `bundle.js`, a tracked file), then deploy, then the section 6 checklist.

R48: the mandatory full backup is tied to the **first** live write, which is M01 in Stage 2 (D0/D11). Taking a fresh backup again right before M04 and M05 is recommended and is listed as an owner decision.

**Rollback order** (backtest rows may exist by then):
1. Stop the writes: revert the Stage 5 hooks, or deploy with the page not calling `WwBtSync`.
2. Remove the mirrors with an owner-approved write: `DELETE FROM public.trades WHERE platform_source = 'backtest'`.
3. Revert the Stage 6 client.
4. Roll back M05, then M04.

Never revert Stage 6 or M05 while backtest rows exist: they would appear in live statistics.

---

## 2. Stage 5: `public/interface/backtest/js/bt-sync.js` (`window.WwBtSync`)

Final file: `repo-ready/public/interface/backtest/js/bt-sync.js`. It is an IIFE ending in `})(typeof window !== 'undefined' ? window : globalThis);` (D1).

- **Dependencies, read at call time:**
  - `WwBtSymbols` (Stage 3B): instrument and contract size per symbol.
  - `WwTrades` (Stage 6): the ship-rule guard.
  - `window.sb`, `window.wwCache`.
- **Load order in `src/pages/backtest.astro`:** `<script src="/interface/backtest/js/bt-sync.js?v=…" is:inline defer></script>`, after `bt-symbols.js` and before the page script.
  - It is a library, so it runs once per document and has **no** `data-page-script` attribute.
  - Its in-memory state (queues, timers) survives SPA navigations. `cancelPending()` cleans it up on leave.

### 2.1 Public API

All I/O functions return a Promise of a **result object**: `{ ok, code?, error?, inserted, removed, repaired, kept?, errors?, skipped?, account? }`. They never throw.

| Function | Purpose |
|---|---|
| `mapTrade(account, trade, opts?)` | **Pure.** Maps a `backtest_account_trades` row to a `public.trades` row. Throws an `Error` with `.code` on invalid input (section 2.2). |
| `planReconcile(account, closedTrades, existingRows, opts?)` | **Pure.** Returns `{insert[], remove[ids], repair[{id, patch}], kept, errors[]}`. |
| `rowsEqual(expectedRow, existingRow)` | **Pure.** Compares the engine-owned columns using exact decimal and timestamp comparison. |
| `importHash(accountId, tradeId)` / `hashPrefix(accountId)` / `parseHash(hash)` | Return `'backtest:<accountId>:<tradeId>'` and `'backtest:<accountId>:'`. `parseHash` returns `{accountId, tradeId}` or null. |
| `isClosed(trade)` | True when `exit_time`, `exit_price` and `pnl` are all non-null (D3 consistency rule). |
| `syncClosedTrade(account, trade, opts?)` | After a close, upserts **one** row. Returns `{skipped:'NOT_LINKED'}` when the account has no journal. |
| `reconcileAccount(account, opts?)` | Full idempotent reconcile: insert missing rows, delete orphans and rows in the wrong journal, repair drifted rows. Use `opts.closedTrades` to reuse an already loaded list, and `opts.repair=false` to skip repairs. |
| `linkAccount(account, journalId, opts?)` | Sets `backtest_accounts.journal_id`. M04 deletes the old journal's mirrors atomically; this function then backfills the new journal (R17). Returns `{account: freshRow}`. |
| `unlinkAccount(account, opts?)` | Same as `linkAccount(account, null)` (R18). |
| `deleteAccount(account, opts?)` | `DELETE backtest_accounts` (trades cascade). M04 deletes the mirrors (R18). |
| `sweepOrphans(userId, opts?)` | Re-reads the accounts, then deletes every `platform_source='backtest'` row whose account is gone, unlinked, or linked to a different journal. Heals cross-tab races. |
| `countMirrors(account, opts?)` | HEAD count of this account's mirrors in its journal. Used for the confirm dialogs. |
| `dirtyAccounts()` | Account ids whose last sync failed (localStorage `ww_bt_sync_dirty`, read and written inside try/catch). |
| `flush()` / `cancelPending()` | `flush` sends a pending `trade-saved` immediately. `cancelPending` also cancels retry timers; call it in `PAGE.onLeave`. |
| `_dec`, `_classify`, `_config` | Exposed for tests: exact decimals, error classes, retry and debounce settings. |

`opts.client` overrides `window.sb` (used by the tests). `opts.symbolInfo` overrides the symbol lookup.

### 2.2 `mapTrade` (D5 + R16; verified against the mapping prototype and the trigger review)

| `trades` column | Value | Rule |
|---|---|---|
| `user_id` | `account.user_id` | |
| `journal_id` | `account.journal_id` | **Always sent**, so `trg_trades_default_journal` never moves the row (`db/fn_set_default_journal.sql:8-11`). Throws `ACCOUNT_NOT_LINKED` if null. |
| `platform_source` | `'backtest'` | |
| `import_hash` | `'backtest:<accountId>:<tradeId>'` | Disjoint from `ctrader:` and CSV hashes. |
| `position_id` | `null` | Keeps `trades_platform_unique` and `idx_trades_journal_position` out of play (`db/trades_indexes.json`). |
| `status` / `is_quick_entry` | `'closed'` / `false` | |
| `symbol` / `direction` | upper-case symbol / `'LONG'` or `'SHORT'` | Symbol must equal `account.symbol`. `BUY`/`SELL` are rejected. |
| `instrument` / `multiplier` | `WwBtSymbols.get(sym).instrument` / `canon(contractSize)` | `forex|gold|crypto`; `'100000'`, `'100'`, `'1'`. Informational only, because `pnl` is always set. |
| `lot`, `entry_price`, `exit_price`, `stop_loss`, `take_profit` | canonical decimal strings | Scale must not exceed the symbol `digits` (prices) or the lot-step digits (lot), otherwise `PRICE_SCALE` / `LOT_INVALID`. This catches float artefacts such as `1.0842399999999999`. |
| `rr_ratio` | `ROUND(|tp−entry| / |entry−sl|, 2)` on the values actually sent, else `null` | Exactly the trigger's expression, so the trigger's overwrite is a no-op (D4/D5). |
| `pnl` | net USD, `'x.yy'` | Must already be whole cents, otherwise `MONEY_SCALE`; it is never rounded here. Being non-null keeps `trg_calc_pnl` in branch 1, which returns pnl untouched (`db/fn_calc_trade_pnl.sql:10-26`). |
| `gross_pnl` | the `gross_pnl` column if present (owner decision D3), else `pnl + commission` | Throws `MONEY_IDENTITY` unless `gross − commission = pnl` (swap is 0). |
| `commission` | positive cost, `'x.yy'` | Negative values throw `COMMISSION_NEGATIVE`. |
| `swap` | `'0.00'` | |
| `trade_date` | ISO UTC of `entry_time` | **R16:** entry time (replay market time). |
| `exit_date` | ISO UTC of `exit_time` | **R16:** exit time. `exit < entry` throws `TIME_ORDER`. |

**Never sent:** `notes`, `strategy_id`, `id`, `created_at`, `updated_at`, `last_deal_id`. They belong to the user or to the database. A test asserts the exact key set.

**Exact decimals.** Everything is BigInt, created with `BigInt()` calls rather than `1n` literals, so no tool target can choke on them.
- `plain` expands exponents (JSON shortest form) and `canon` strips trailing zeros.
- Comparisons and `ROUND(x, s)` round half away from zero, like Postgres. Negative zero is never produced.
- No `toFixed` or `Math.round` is used on stored values (D4).
- Values are sent as decimal strings. PostgREST casts them with the numeric input function.

**R34 summary** (reviewed and confirmed in `inputs/w2/review_pnl-trigger.json`):
- `trg_calc_pnl` writes only three columns: `pnl` (only when it is NULL), `rr_ratio` (only when SL, TP and entry are set and risk > 0), and `updated_at`. It never touches `gross_pnl`, `commission` or `swap`.
- Because the mirror always sends a 2-decimal `pnl` and the trigger's own `rr_ratio`, the trigger changes nothing except `updated_at`.
- The consistency invariant is therefore exact, and is unit-tested and checkable in SQL (section 6): Σ `trades.pnl` over the account prefix in `account.journal_id` = Σ net P&L of the account's closed backtest trades = balance − starting balance.

### 2.3 Writes

- **Upsert** (cTrader pattern, D5): `sb.from('trades').upsert(chunk, { onConflict: 'user_id,journal_id,import_hash', ignoreDuplicates: true }).select('id')`.
  - Chunks of **200** rows. Only rows missing from the current mirror set are sent.
  - `ignoreDuplicates` keeps concurrent inserts harmless. The returned ids give the insert count (DO NOTHING returns no skipped rows).
- **Delete:** `sb.from('trades').delete().in('id', chunk).eq('platform_source','backtest')`.
  - Chunks of **100** ids **[RAISED]**. D5 says 200, but ids travel in the URL; 100 UUIDs are about 3.8 KB.
  - The extra `platform_source` filter means a non-backtest row can never be deleted on this path.
- **Repair** **[RAISED, addition to D5]**: `sb.from('trades').update(enginePatch).eq('id', id).eq('platform_source','backtest')`.
  - Runs only when `rowsEqual` is false: a drifted mirror, or a mapping-version change that `ignoreDuplicates` can never propagate.
  - The patch contains only engine-owned columns. `notes` and `strategy_id` are never written, so user annotations survive.
  - It can be disabled per call with `{repair:false}`.

### 2.4 Reconcile algorithm (`reconcileAccount` → `planReconcile`)

1. Fetch the account's closed trades: `backtest_account_trades` `select('*')`, `.eq('backtest_account_id', id)`, `.not('exit_time','is',null)`, ordered by `exit_time, id`, in pages of 1000. `opts.closedTrades` can be passed instead.
2. Fetch **all** existing mirrors of this account in **any** journal: `trades` `select(MIRROR_COLS)`, `.eq('user_id', uid)`, `.eq('platform_source','backtest')`, `.like('import_hash', 'backtest:<id>:%')`. The UUID prefix contains no `_` or `%`, so LIKE is safe.
3. Plan:
   - Expected rows are `mapTrade` of every closed trade when the account is linked, and none when it is unlinked.
   - **Remove** existing rows with no expected twin, or that sit in a journal other than `account.journal_id`.
   - **Insert** expected rows that have no twin.
   - **Repair** twins that are not equal.
   - A trade that fails mapping is reported in `errors[]`; its existing mirror is kept and the other trades continue.
4. Execute in the order remove, insert, repair, stopping at the first failure.
5. If anything changed, notify (section 2.6). Clear the dirty flag only on full success.

Idempotency is tested: the second run plans 0, 0, 0 even though PostgREST returns numbers instead of strings.

### 2.5 Link, relink, unlink and delete with Migration 04 (R15, R17, R18)

| Flow | Client call | What happens |
|---|---|---|
| Create an account with a journal | Stage 4 insert | No closed trades yet, so nothing to sync. |
| **Link** (NULL → J) | `linkAccount(acc, J)` | `UPDATE … SET journal_id=J … RETURNING`. The M02 trigger checks journal ownership and raises `INVALID_JOURNAL` for a foreign journal. The client then reconciles: **all past closed trades are inserted** (R17). |
| **Relink** (J1 → J2) | `linkAccount(acc, J2)` | The M04 `AFTER UPDATE OF journal_id` trigger deletes the `backtest:<id>:` rows in J1 **in the same transaction**. The client then backfills J2. Notes and strategy tags on the J1 mirrors are lost, and the confirm dialog says so. |
| **Unlink** (J → NULL) | `unlinkAccount(acc)` | The M04 trigger deletes the J rows. The client notifies and does not reconcile. |
| **Delete account** | `deleteAccount(acc)` | `backtest_account_trades` cascade (D3). The M04 `AFTER DELETE` trigger deletes the mirrors. |
| Journal deleted | `delete_journal` RPC | Its line 26 deletes all trades of the journal, backtest included. M02 detaches the linked accounts (D3). The M04 trigger then fires on that detach as a no-op. |
| Account reset or trade delete, if Stage 4 offers them | Stage 4 delete, then `reconcileAccount(acc)` | Removes the now-orphaned mirrors (tested: 250 removed). The optional DB trigger is in section 2.8. |
| Another tab or device changed the link meanwhile | (automatic) | An insert fails with RLS/FK (STALE). The client re-reads the account, reconciles once, and returns `result.account`. `sweepOrphans` on the list screen removes anything left in a wrong journal. |

**Serialization.** Every call for one account goes through a per-account promise queue. "Close trade, then immediately unlink" therefore cannot leave a mirror behind (tested). Cross-tab races heal through `sweepOrphans` and the reconcile on entry; section 2.8 has the optional DB guard.

### 2.6 Errors, retries, notifications

- **Error classes** (`_classify`):
  - `TRANSIENT`: status 0 or network message, 408, 429, 5xx, or SQLSTATE 40001, 40P01, 57014, 53300.
  - `AUTH`: 401, PGRST301, PGRST303.
  - `STALE`: 23503, 42501, RLS or FK message.
  - `SCHEMA`: 42703, 42P01, PGRST20x.
  - `PERMANENT`: everything else, including trigger RAISEs (P0001) and 23514.
- **Retry:** TRANSIENT and AUTH are retried 3 times after 0.5 s, 1.5 s and 4 s. supabase-js refreshes the token in between. All write operations are idempotent. Other classes are not retried.
- **Failure handling:** on failure the account is marked dirty (localStorage `ww_bt_sync_dirty`, try/catch) and the page shows **one** toast per visit (`backtest.sync.error`). The next entry, or the list screen, reconciles. `CANCELLED` (leaving the page) stays silent and only marks the account dirty.
- **Cache and events (R19, D5):** after any change, `wwCache.invalidate('trades')` runs **immediately**, which clears `trades*`, including the new `trades@all`. Then `window` `CustomEvent('trade-saved', {detail:{source:'backtest'}})` is dispatched, debounced by 250 ms so fast replay closes coalesce.
  - `flush()` / `cancelPending()` send it at once on leave.
  - No event is sent when nothing changed.
  - Listeners: `public/cache.js:233`, `onboarding.js:1548`, plus page listeners that are only active on their own page.

### 2.7 Hook points in the Stage 4 page controller (`backtest.js`)

| Page moment | Call |
|---|---|
| Account list loaded | `WwBtSync.sweepOrphans(user.id)`, throttled to once per 10 min per tab (sessionStorage `ww_bt_sweep_at`, try/catch). Then `reconcileAccount(a)` for each `a` in `WwBtSync.dirtyAccounts()` that is in the list. |
| Replay screen opened for an account | After first paint, in the background: `WwBtSync.reconcileAccount(account, { closedTrades: loadedClosedRows })`. |
| A position closes (TP, SL or manual) | 1) `UPDATE backtest_account_trades SET exit_*, pnl, commission[, gross_pnl], exit_reason WHERE id=… AND exit_time IS NULL … .select().single()`. 2) If `account.journal_id` is set: `WwBtSync.syncClosedTrade(account, savedRow)`. Pass the **DB row**, not the engine object. If `r.account` comes back, replace the page's account state. |
| Settings: link, change or remove journal | Confirm with `countMirrors(account)` and `backtest.sync.relink_confirm` / `unlink_confirm`. Then `linkAccount` / `unlinkAccount`, use `r.account`, and toast `backtest.sync.linked` (`{count: r.inserted}`) or `backtest.sync.unlinked`. Map `INVALID_JOURNAL` in `r.error.message` to the Stage 4 error text. |
| Delete account | Page-local confirm, with `backtest.sync.delete_confirm_linked` when linked. Then `WwBtSync.deleteAccount(account)`. |
| `PAGE.onLeave` | `WwBtSync.cancelPending()`, next to the R26 timer cleanup. |

Stage 4 requirement: SL, TP and prices must be stored on the symbol point grid (D4). Otherwise `mapTrade` refuses that trade with `PRICE_SCALE`; it is reported and not synced.

### 2.8 Migration 04: what the client relies on (the SQL track writes it)

Required (D5):
- **Trigger function** `public.backtest_mirror_cleanup()`: `SECURITY DEFINER`, `SET search_path = public`. Computes `v_prefix := 'backtest:' || OLD.id::text || ':'`, then:
  ```sql
  DELETE FROM public.trades
  WHERE user_id = OLD.user_id AND journal_id = OLD.journal_id
    AND platform_source = 'backtest' AND left(import_hash, length(v_prefix)) = v_prefix
  ```
  Use `left()`, not LIKE (D5). The `platform_source` predicate is an added safety. The function returns NULL.
- **Triggers:**
  - `AFTER UPDATE OF journal_id ON public.backtest_accounts FOR EACH ROW WHEN (OLD.journal_id IS NOT NULL AND OLD.journal_id IS DISTINCT FROM NEW.journal_id)`
  - `AFTER DELETE ON public.backtest_accounts FOR EACH ROW WHEN (OLD.journal_id IS NOT NULL)`
- **Rollback file:** drops both triggers and the function.

Optional hardening (owner decisions; recommendation in brackets):
- (a) **Insert-validity guard** [recommended]: a `BEFORE INSERT` trigger on `trades`. When `NEW.platform_source = 'backtest'` it requires that `split_part(import_hash, ':', 2)::uuid` is an account of `NEW.user_id` whose `journal_id = NEW.journal_id`; otherwise it raises. This turns stale cross-tab writes into errors instead of orphans. Cost: one primary-key lookup per backtest insert, and nothing for other rows.
- (b) **Per-trade cleanup** [only if Stage 4 offers reset or delete-trade]: `AFTER DELETE ON backtest_account_trades` deletes the one mirror by exact hash in the account's journal.
- (c) **Integrity CHECKs** on `trades` [optional, add as `NOT VALID` then `VALIDATE`; 0 rows today]:
  - `(platform_source IS NOT DISTINCT FROM 'backtest') = (COALESCE(import_hash,'') LIKE 'backtest:%')`
  - backtest rows have `position_id IS NULL`, non-NaN 2-decimal money, and `pnl = gross_pnl - commission + swap`
- (d) **Read-only guard trigger** for edits [D5: default no]. The UI already restricts edits.

### 2.9 `tests/bt-sync.test.js` (29 tests; `repo-ready/tests/bt-sync.test.js`, helper `repo-ready/tests/helpers/fake-supabase.js`)

The tests load `bt-symbols.js`, `trades-source.js`, `bt-sync.js`, `time-settings.js` and `trade-metrics.js` into a `node:vm` window, following the repo pattern (`tests/trade-metrics.test.js:15-35`). The helper's `FakeDb` emulates the live behaviour: the unique import_hash upsert with DO NOTHING, `trg_calc_pnl` branch 1, the default-journal trigger, RLS on the insert journal, atomic statements, and the M04 cleanup with ON DELETE CASCADE.

- **Mapping (7 tests):**
  - exact EURUSD row, with `trade_date`/`exit_date` per R16
  - exact key set
  - `gross_pnl` derived when the column is absent
  - byte-identical output for string and JSON-number inputs
  - 2-decimal money strings
  - XAUUSD, BTCUSDT and USDJPY instrument/multiplier, with the USDJPY USD conversion (163.59 / 7.00 / 156.59)
  - 14 rejection codes
- **import_hash (1 test):** round trip; rejects `ctrader:` and malformed values.
- **Rounding parity (4 tests):**
  - `round2` against Postgres on 14 vectors, including −0.0049 → `0.00`, −1.255 → `−1.26` and 12345678.995 → `12345679.00`.
  - A documentation test asserting the *corrected* failure modes from the review: `toFixed` gives 1.00 / −1.00 / 2.67 / 1.04 / −1.25 / 12345678.99 and `'-0.00'`; `Math.round` gives 1 / −1 / −0.12 / −1.25 and `-0`.
  - rr parity, including the tie 2000.00 / 1998.00 / 2002.01 → `1.01`.
  - A JS port of `calc_trade_pnl` branch 1 leaves `pnl` and `rr_ratio` unchanged on mapped rows.
- **Planner (6 tests):** first run inserts in date order; second run is a no-op on wire numbers; orphan, wrong-journal and drift cases (repair patch without notes, strategy or journal); unlinked account removes everything; other accounts' rows untouched; one bad trade does not block the rest.
- **Sum invariant and reader parity (1 test):** 120 exact-money trades. Σ trades.pnl = Σ net = balance − start, and `WwMetrics.summarize().totalPnL`, `equityCurve` and `isClosed` agree with it.
- **I/O flows (10 tests):**
  - upsert options exactly as in cTrader; `invalidate('trades')` and `trade-saved`; no event on a no-op
  - unlinked account makes no requests; `STATS_FILTER_MISSING` makes no requests and marks the account dirty
  - chunking 200/200/50 for inserts and 100/100/50 for deletes, with the `platform_source` filter on deletes
  - transient error retried; permanent error not retried, dirty flag set, then cleared by reconcile
  - stale-account refresh
  - link → relink → unlink → delete
  - same-tab ordering
  - `sweepOrphans` (live rows untouched)
  - `cancelPending`
  - `countMirrors` HEAD request

### 2.10 Stage 5 i18n keys (for the Stage 4 `backtest.*` block, tr / en / de)

| Key | tr | en | de |
|---|---|---|---|
| `backtest.sync.linked` | {count} işlem bağlı hesaba aktarıldı. | {count} trades copied to the linked account. | {count} Trades in das verknüpfte Konto übernommen. |
| `backtest.sync.unlinked` | Bağlantı kaldırıldı; aktarılan işlemler hesaptan silindi. | Unlinked; the copied trades were removed from the account. | Verknüpfung getrennt; die übernommenen Trades wurden aus dem Konto entfernt. |
| `backtest.sync.error` | Backtest işlemleri bağlı hesaba aktarılamadı. Bu backtest hesabına tekrar girdiğinde yeniden denenecek. | Couldn't copy backtest trades to the linked account. It will retry the next time you open this backtest account. | Backtest-Trades konnten nicht in das verknüpfte Konto übernommen werden. Beim nächsten Öffnen dieses Backtest-Kontos wird es erneut versucht. |
| `backtest.sync.relink_confirm` | Backtest hesabı başka bir hesaba bağlanacak. Eski hesaba aktarılan {count} işlem (notları ve strateji atamalarıyla birlikte) oradan silinip yeni hesaba aktarılacak. Devam edilsin mi? | This backtest account will be linked to another account. The {count} trades copied to the old account (with their notes and strategy tags) will be removed there and copied to the new one. Continue? | Dieses Backtest-Konto wird mit einem anderen Konto verknüpft. Die {count} in das alte Konto übernommenen Trades (inklusive Notizen und Strategie-Zuordnungen) werden dort entfernt und in das neue übernommen. Fortfahren? |
| `backtest.sync.unlink_confirm` | Bağlantı kaldırılsın mı? Bu backtest hesabından aktarılan {count} işlem (notları ve strateji atamalarıyla birlikte) bağlı hesaptan silinecek. Backtest hesabındaki işlemler korunur. | Unlink? The {count} trades copied from this backtest account (with their notes and strategy tags) will be removed from the linked account. The trades in the backtest account are kept. | Verknüpfung trennen? Die {count} aus diesem Backtest-Konto übernommenen Trades (inklusive Notizen und Strategie-Zuordnungen) werden aus dem verknüpften Konto entfernt. Die Trades im Backtest-Konto bleiben erhalten. |
| `backtest.sync.delete_confirm_linked` | Backtest hesabı ve tüm işlemleri silinecek; bağlı hesaba aktarılan {count} işlem de silinecek. Bu işlem geri alınamaz. | The backtest account and all its trades will be deleted, including the {count} trades copied to the linked account. This can't be undone. | Das Backtest-Konto und alle seine Trades werden gelöscht, einschließlich der {count} in das verknüpfte Konto übernommenen Trades. Dies kann nicht rückgängig gemacht werden. |
| `backtest.sync.link_hint` | Bağlı hesaba yalnızca kapanan işlemler aktarılır; canlı istatistiklere girmezler. | Only closed trades are copied to the linked account; they never count in live statistics. | Nur geschlossene Trades werden übernommen; sie zählen nie zu den Live-Statistiken. |

In the UI, a journal is called "hesap" / "account" / "Konto" (`journal.delete_title`), so the strings say "bağlı hesap" (linked account) and "backtest hesabı" (backtest account).

---

## 3. Stage 6: `public/interface/shared/trades-source.js` (`window.WwTrades`)

Final file: `repo-ready/public/interface/shared/trades-source.js` (2.6 KB minified in the bundle).

```js
WwTrades.BACKTEST          // 'backtest'
WwTrades.LIVE_OR           // 'platform_source.is.null,platform_source.neq.backtest'   (NULL-safe; .neq alone keeps 13/114 live rows)
WwTrades.SCOPES            // ['live','backtest','all']
WwTrades.normScope(s)      // unknown -> 'live'
WwTrades.isBacktest(t)     // t.platform_source === 'backtest'  (NULL / '' / 'ctrader' = live)
WwTrades.inScope(t, scope)
WwTrades.filterScope(list, scope='live')     // new array; defensive second layer
WwTrades.applyScope(query, scope='live')     // live -> .or(LIVE_OR); backtest -> .eq('platform_source','backtest'); all -> unchanged
WwTrades.withSourceCol(cols)                 // appends platform_source (lists describe themselves)
WwTrades.cacheKey(base, scope)               // 'trades' | 'trades@all' | 'trades_dashboard@backtest' ...
WwTrades.fetchAll({ columns, userId, journalId, scope='live', ascending=false, since, pageSize=1000,
                   unassignedFallback=false, client=window.sb })  -> Promise<{ data, error }>
   // chain: from('trades').select(cols+platform_source).eq(user_id).eq(journal_id)|is(journal_id,null).gte(trade_date,since)
   //        .<scope>.order(trade_date,{ascending}).order(id,asc).range(...)   — 1000-row pages; on error: rows so far + error
   // unassignedFallback: if the scoped result is empty, fetch journal_id IS NULL rows (same scope) ONLY when the
   //   journal has no rows in ANY scope (HEAD count, skipped for scope 'all'). A backtest-only journal no longer
   //   pulls unrelated unassigned trades (inventory pitfall). Live today: 0 NULL-journal rows.
WwTrades.count({ userId, journalId, since, sinceColumn='created_at', scope='live', client })  -> Promise<{ count, error }>  (HEAD)
```

SQL equivalent, used by Migration 05: `platform_source IS DISTINCT FROM 'backtest'`.

**Load order:**
- `src/components/BaseHead.astro:179`, synchronously, right after `trade-metrics.js` (D1): `<script src="/interface/shared/trades-source.js?v=<stamp>" is:inline></script>`.
- Also a side-effect import, `import '../interface/shared/trades-source.js';`, as the first import in `public/src/script.js:1` (section 1.4).

### 3.1 `public/cache.js` contract (D6)

- Header comment (line 16+): the keys `trades` and `trades_<page>` hold **live rows only**. Mixed or backtest lists use `trades@all` / `trades@backtest`.
- New helper (line 28+): `isLiveTradePrefix(p) = typeof p === 'string' && /^trades(_[a-z]+)?$/.test(p)`. It replaces `prefix.indexOf('trades') === 0` at `:121` (get) and `:189` (set).
- `invalidate('trades')` still clears `ww_cache_trades@…`, because it uses a sessionStorage prefix match and clears the whole memory cache.
- Tested: today's file reproduces the leak (`trades@all` is copied into `trades_dashboard`); the new file does not.
- `BaseHead.astro:171`: `/cache.js` → `/cache.js?v=<stamp>`. Root files are SW stale-while-revalidate (`sw.js:31-63`).

### 3.2 Per-site edit list: every reader in `inputs/w1/inventory_trades-queries.json`

Line numbers are at f62f68c. The exact text is in `patches/stage6-readers.patch`. Stages 2 to 4 can shift lines (sw.js, locales, navbar link). The generator `proto/make-stage6-patches.mjs` anchors on content, so re-running it on the Stage 4 head refreshes the patch.

| # | Site (path:line) | Feature | Exact change |
|---|---|---|---|
| 1 | `public/src/services/prop-service.js:462` (new helpers before `syncPropAccountStatus`), `:474-475`, `:488-491`, `:506` | Prop rules + prop notifications (callers `dashboard.astro:523`, `premium-dashboard.astro:324`, `add-trade.astro:1658`) | Add `liveQuery()`/`liveOnly()`, using `WwTrades` with an inline `.or(LIVE_OR)` fallback because this is a UMD lib that tests load. The cache `needCols` gains `'platform_source'`. The select adds `platform_source`. The paged query uses `liveQuery(q)` between `.eq('journal_id')` and `.order()`. `trades = liveOnly(trades)` runs on **every** source (passed list, cache, DB) before the closed-trade filter. |
| 2 | `public/interface/dashboard/js/dashboard.js:3076-3159` (loadTrades) | Dashboard KPIs, charts, goal, ambient P&L, CSV/PDF | `DASH_COLS` + `platform_source`; on a cache hit, `WT.filterScope(…,'live')`. The loop and NULL fallback become `WT.fetchAll({userId, journalId: jid, columns, scope:'live', ascending:false, unassignedFallback: !!jid})`, then `.reverse()`. The `trades_dashboard` cache (live) and the error toast are unchanged. Consumers at 777-779, 787, 2475, 2511, 3000-3001, 3040/3053 and 3278-3281 are unchanged. |
| 3 | `src/pages/dashboard.astro:479-560, 835-904, 1151-1163` | Prop banner, standard card, phase warning | **No change.** It consumes dashboard.js arrays, which are live, and prop-service output, which is filtered. |
| 4 | `public/interface/premium-dashboard/js/premium-dashboard.js:567-623`, `:759-761` | Analytics, insights, strategy cards, PDF, CSV | `PREMIUM_TRADE_COLS` (+`platform_source`). The loop and fallback become `fetchAll` with scope live and `unassignedFallback:true`, with the same error and reveal path. The three cache reads use `PREMIUM_TRADE_COLS` followed by `filterScope(…,'live')`. |
| 5 | `export-dialog.js:62-200`, `pdf-report.js:118-363`, `dashboard-manager.js:893-955` | PDF report, CSV | **No change.** They inherit `allTrades`/`currentFilteredTrades`. A "live trades only" caption is optional (not done). |
| 6 | `src/pages/premium-dashboard.astro:235-330, 520-527` | Premium prop banner, phase advance | **No change.** It reads live caches, and prop-service filters what it is given. |
| 7 | `public/interface/trades/js/trades.js` (details in section 3.3) | Trade list, filters, stats, edit, delete | 191 (scope state + helpers), 585 (scope filter first), 669-670 (desktop row), 711-714/741 (mobile card), 765 (backtest empty state), 790/798 (delete guard + live filter), 836/850/861 (bulk delete), 929 (limited edit mode + `saveBacktestMeta`), 966-1045 (loadTrades: scope `all`, `trades@all` + live `trades`), 1068/1141 (mobile sheet), 1266 (scope binding), 1321 (save branch for backtest rows), 1418-1424 (merge keeps `platform_source`). The 1494-1512 reload listener is unchanged. |
| 8 | `src/pages/trades.astro:15,21,30,32` (?v), `:79` (scope select), `:101` (scope chip), `:200` (edit note) | Trades markup | See section 3.3. |
| 9 | `public/interface/calendar/js/calendar.js:866-873`, `:889-917` | Calendar, day modal, day CSV/PDF | `calCols` + `platform_source`; on a cache hit, `filterScope`. The fetch loop becomes `fetchAll` scope live (no NULL fallback existed here). The cache key `trades_calendar` is unchanged. |
| 10 | `public/interface/strategies/js/strategies.js:1573`, `:1597-1628` | Strategy cards, comparisons, CSV/PDF | `STRAT_TRADE_COLS` + `filterScope` on the cache. The IIFE loop becomes `fetchAll` scope live and keeps the partial-data-on-error behaviour. |
| 11 | `public/components/navbar/navbar.js:632-644` | Bell overtrade warnings | `otCols` + `platform_source`; `filterScope` on the cache. The 7-day query is built as `otQuery`, then `WwTrades.applyScope(otQuery,'live').order(…)`. A pre-existing inconsistency is unchanged: the cache path covers the active journal while the DB path covers all journals. |
| 12 | `navbar.js:2105-2190, 2284, 2339-2341, 2593-2598` | Journal switcher `trade_count` | **No client change.** It becomes live-only through M05 `list_journals`. |
| 13 | `public/src/features/overtrade.js:387-392`, `:568-573` (**bundled**) | Overtrade container + bell | `window.WwTrades.applyScope(sb.from('trades').select(…,platform_source).eq(user).gte(date), 'live').order(…)` at both sites. |
| 14 | `public/src/features/notifications.js:185-190` (**bundled**) | In-app overtrade notification | Same pattern. |
| 15 | `public/src/services/stats.js:45-49` (**bundled**) | Landing counters fallback | Both `trades` HEAD counts wrapped in `applyScope(…,'live')`. The primary path is the M05 `get_platform_stats`. |
| 16 | `src/pages/journals.astro:738-750` | Prop wizard time-shift preview | `previewCols` + `platform_source`; on the cache, `filterScope` and then sort newest-first and take 3. This also fixes the existing bug where `slice(-3)` on the DESC list returned the oldest 3. The query is built as `previewQuery`, then `applyScope(…,'live').order().limit(3)`. |
| 17 | `src/pages/journals.astro:1670-1671` (cards at 1461-1466 and the cached render at 49-80 go through M05) | Delete confirmation | The message uses `j.strategy_count` instead of the hard-coded `'0'`. After the modal opens, `WwTrades.count({journalId, scope:'backtest'})` runs; when it is > 0, `journal.delete_message_backtest` (`{count}`) is appended. Stale replies are ignored (`deleteId !== askedFor`). |
| 18 | `public/src/core/journal.js:60-88, 100, 148-155` | RPC wrappers | **No change.** |
| 19 | `public/interface/dashboard/js/onboarding.js:984` | "Add your first trade" task | The count is wrapped in `applyScope(…,'live')`. |
| 20 | `onboarding.js:1649, 1684` | Dev-only resets (`window.resetOnboarding`, `resetTasksOnly`) | **No change** (deletes all scopes). Optional: scope them to live (owner decision). |
| 21 | `src/pages/add-trade.astro:1114-1117`, `:1343-1346` | CSV / bulk import dedupe | The signature read becomes `applyScope(sb.from('trades').select(…).eq('journal_id', …), 'live').order().order().range()`. Without it, a real trade that matches a backtest signature would be skipped as a duplicate. The inserts at 1229/1235/1486/1492/1632 and the prop sync at 1656-1662 are unchanged. |
| 22 | `public/interface/quick-add/js/quick-add.js:2020-2023` | Quick Add CSV/XLSX dedupe | Same pattern. The inserts at 2150/2158/2355/2524 are unchanged. |
| 23 | `public/settings/js/settings.js:2342, 2354-2362` | Delete all my data | **No change in Stage 6** (unfiltered on purpose). Stage 2/3 own the backtest-table lines (D2/D3). |
| 24 | `supabase/functions/ctrader-sync/index.ts:590-668` | cTrader write path | **No change.** Its namespaces stay disjoint (`ctrader:` vs `backtest:`). |
| 25 | `public/cache.js:16, 28, 121, 189` | Cache contract | Section 3.1. |
| 26 | `src/components/BaseHead.astro:170-171, 179` | Shared scripts | `cache.js?v`; the `trades-source.js` tag. |
| 27 | `tests/prop-service.test.js:40-47, 228-238, 277-280, 306` | Unit tests | Section 3.6. |
| 28 | `src/components/quick-add/QuickAddModal.tsx:207-224` | Unused React modal | **No change.** |
| 29 | `src/pages/backtest.astro:450-666` | Legacy page | Replaced in Stages 2 and 4. The new writer is `WwBtSync`. |
| RPC | `list_journals`, `get_platform_stats` | Navbar, journals cards, landing | **Migration 05** (section 3.7). |
| RPC | `delete_journal`, `reset_user_data` | Deletion | Stay unfiltered. Their backtest-table steps are in M01/M02 (D3). |
| RPC | `evaluate_prop_firm_rules`, `sync_journal_trades`, `get_journals_equity_data`, `get_strategy_performance`, `get_today_trades_count`, `get_total_trades_count` | Unused | **Migration 06:** drop (recommended) or patch. Owner decision (D6/D10). |

**Supporting edits:**
- `public/src/script.js:1`: the side-effect import.
- `public/sw.js:1`: `CACHE_VERSION` +1 relative to the value at deploy time (the patch shows `wawe-v11` → `wawe-v12`).
- `public/i18n.js:126`: locale `?v`.
- `?v` bumps:
  - `Layout.astro:47` (prop-service), `:73` (onboarding), `:76` (navbar)
  - `dashboard.astro:457,460`
  - `premium-dashboard.astro:163,166`
  - `calendar.astro:29,30`
  - `strategies.astro:31,32`
  - `trades.astro:15,21,30,32`
  - `journals.astro:14` (adds `?v` to `/i18n.js`)
  - quick-add.js now carries the same `?v` on every page.
- **Bundle:** `overtrade.js`, `notifications.js`, `stats.js` and `script.js` only take effect after `public/src/bundle.js` is rebuilt. Run `npm run build` (the `bundleAppScript` hook in `astro.config.mjs:58-89` runs at `astro:config:setup` and `astro:build:start`) and **commit the regenerated `bundle.js`**, because it is tracked. No new packages: esbuild ships with Astro.
- **Audit greps before merge:**
  - `rg "from\('trades'\)" public src -g '!public/src/bundle.js'`: every read site uses WwTrades; the rest are writers or resets.
  - `rg "neq\('platform_source'" public src`: must be empty.

### 3.3 Trades page (R21, D6)

- **Data:**
  - Fetch with scope **`all`** through `fetchAll`, so edit and lookup can find every row.
  - Cache the mixed list under `trades@all` (never cross-fed). Write `filterScope(list,'live')` to `trades`, so other pages keep the instant-navigation benefit.
  - This is not a regression: the trades page's `needCols` already includes `gross_pnl`/`commission`/`swap`, so today it only ever hits its own writes (`trades.js:968`).
- **Scope select** `#scope-filter`:
  - First in the toolbar, with options in the owner's order **Tümü / Canlı / Backtest**, default **Canlı**.
  - `data-i18n` options; `data-i18n-title="trades.scope_title"`.
  - JS applies the scope **before** the direction/result filters, so totals, pagination and the stat cards follow the scope (D6).
  - The choice is kept for the browser session in `sessionStorage` (`ww_trades_scope`, inside try/catch), so every new session opens on Canlı **[RAISED: owner decision; the inventory proposed localStorage]**.
- **Mobile:**
  - A `data-filter="scope"` chip comes first. Its span has **no** `data-i18n`, because `i18n.apply()` runs on every render (`trades.js:781`) and would reset it to "Canlı". `syncChipLabels` writes the label from the selected option.
  - `FILTER_MAP` gains `scope` (title `trades.scope_title`), and the change listeners include `scope-filter`.
- **Badge:**
  - Desktop: `<span class="badge-backtest" data-i18n="trades.badge_backtest" title="…readonly_hint">Backtest</span>` after `.symbol-text`.
  - Mobile: the same badge after `.symbol-text` in the card header.
  - CSS (`trades.css:126`): amber `var(--yellow)` on `var(--yellow-bg)`, so the light theme turns dark amber automatically. No purple or gray (user preference).
- **Read-only backtest rows (D5):**
  - No checkbox (desktop cell left empty, mobile checkbox omitted), so select-all and bulk delete cannot include them.
  - No delete button.
  - `deleteTrade` refuses with a toast (`trades.backtest_delete_blocked`).
  - Both delete queries carry `applyScope(…,'live')` as a server-side safety net.
  - `confirmBulkDelete` filters ids, and the local state only removes the ids that were actually deleted.
- **Limited edit:**
  - `openEdit` calls `setEditLimited(isBacktest)`. It disables instrument, multiplier, symbol, direction, lot, entry, exit, SL, TP, commission, swap and date; shows `#edit-bt-note`; and adds `.is-backtest` to the modal.
  - Saving a backtest row goes to `saveBacktestMeta`: `update({notes, strategy_id}).eq('id').eq('platform_source','backtest')`. Money and prices are untouched, and `trg_calc_pnl` rewrites the same `rr_ratio`.
  - Live rows use the existing path, but the local merge becomes `Object.assign({}, old, edited)`, which keeps `platform_source` for `ctrader` rows too (pre-existing bug, `trades.js:1418-1424`).
- **Empty Backtest scope:** shows `trades.no_backtest_trades` plus a link to `/backtest.html` (`trades.go_backtest`).

### 3.4 Journals delete dialog (D6)

`trade_count` (live after M05) and `strategy_count` are shown. The backtest count is read at click time with a HEAD count, because `delete_journal` also deletes the backtest mirrors (`db/fn_delete_journal.sql:26`). The existing text claims trades are "moved to your default account", which is wrong: `delete_journal` **deletes** trades and strategies. The text is corrected in all three languages **[RAISED: owner-visible text change]**.

### 3.5 i18n keys (Stage 6; in the patch, after `trades.result_title` in each locale: tr.js:988, en.js:1043, de.js:1010)

| Key | tr | en | de |
|---|---|---|---|
| `trades.filter.scope_all` | Tümü | All | Alle |
| `trades.filter.scope_live` | Canlı | Live | Live |
| `trades.filter.scope_backtest` | Backtest | Backtest | Backtest |
| `trades.scope_title` | Kaynak | Source | Quelle |
| `trades.badge_backtest` | Backtest | Backtest | Backtest |
| `trades.backtest_readonly_hint` | Backtest hesabından aktarıldı. Yalnızca not ve strateji düzenlenebilir. | Copied from a backtest account. Only notes and strategy can be edited. | Aus einem Backtest-Konto übernommen. Nur Notizen und Strategie sind bearbeitbar. |
| `trades.backtest_edit_note` | Backtest işlemi: yalnızca not ve strateji değiştirilebilir. | Backtest trade: only notes and strategy can be changed. | Backtest-Trade: Nur Notizen und Strategie können geändert werden. |
| `trades.backtest_delete_blocked` | Backtest işlemleri buradan silinemez. Backtest sayfasında backtest hesabının bağlantısını kaldırabilir veya hesabı silebilirsin. | Backtest trades can't be deleted here. Unlink or delete the backtest account on the Backtest page. | Backtest-Trades können hier nicht gelöscht werden. Trenne oder lösche das Backtest-Konto auf der Backtest-Seite. |
| `trades.no_backtest_trades` | Bu hesapta backtest işlemi yok. | No backtest trades in this account. | Keine Backtest-Trades in diesem Konto. |
| `trades.go_backtest` | Backtest sayfasına git → | Go to Backtest → | Zur Backtest-Seite → |
| `journal.delete_message` (**changed**, tr:1333, en:1387, de:1354) | Bu hesabı silmek istediğine emin misin? İçindeki {tradeCount} işlem ve {strategyCount} strateji kalıcı olarak silinecek. | … Its {tradeCount} trades and {strategyCount} strategies will be permanently deleted. | … Die {tradeCount} Trades und {strategyCount} Strategien werden dauerhaft gelöscht. |
| `journal.delete_message_backtest` | Ayrıca {count} backtest işlemi silinecek. Bu hesaba bağlı backtest hesapları ayrılır, kendileri silinmez. | {count} backtest trades will also be deleted. Backtest accounts linked to this account are unlinked, not deleted. | Außerdem werden {count} Backtest-Trades gelöscht. Mit diesem Konto verknüpfte Backtest-Konten werden getrennt, aber nicht gelöscht. |

`_t()` returns the key itself when a key is missing (`trades.js:32-42`). JS-built strings therefore go through `_tf(key, turkishFallback)`, and markup keeps its Turkish fallback text. Bump `i18n.js:126` (done in the patch).

### 3.6 Tests

- **`tests/trades-source.test.js`** (19 in the repo; the prototype has 20, the extra one being the leak reproduction against today's cache.js):
  - constants
  - `filterScope` NULL/missing/''/ctrader semantics, default and invalid scope, no mutation
  - `isBacktest`/`inScope`
  - `applyScope` per scope
  - `withSourceCol`
  - `cacheKey`
  - the double-load guard
  - `fetchAll`: paging 1000, column injection, filter-chain order, `since`/ascending/backtest, a page-2 error returns partial rows plus the error, the NULL-journal fallback rule (runs only when the any-scope count is 0, skipped for scope `all`)
  - `count` HEAD with exact count and filters
  - a missing client
  - **cache.js contract:** scoped keys are not cross-fed, live keys still are, and `invalidate('trades')` clears scoped keys.
- **`tests/prop-service.test.js`:**
  - Load `public/interface/shared/trades-source.js` into the vm between the calculator and the service.
  - Insert `or: () => ({ order: …` after `eq` in the three trades mocks (228-238, 277-280, 306).
  - Two new tests: the DB query passes exactly `LIVE_OR` and selects `platform_source`; a cached list with a `backtest` row (−9000) is excluded (total 300 = 250 + 50 cTrader).
  - Result: 16/16.
- **Totals:** the baseline is 156. Stage 5+6 add 50, for **206**, verified on the mirror. Run with `node --test tests/*.test.js` (the directory form does not work on Node 25, per the inventory).

### 3.7 Migration 05: SQL changes (the SQL track writes the file and its rollback; base everything on the LIVE bodies, D0)

- `list_journals()` (`db/fn_list_journals.sql:61`): change `FROM public.trades tr WHERE tr.journal_id = j.id` to `… WHERE tr.journal_id = j.id AND tr.platform_source IS DISTINCT FROM 'backtest'`.
  - The signature is unchanged, so `CREATE OR REPLACE` keeps the grants.
  - `trade_count`, `total_pnl`, `win_rate` and `last_trade_date` become live-only.
  - No new column: the delete dialog uses the client HEAD count (D6).
- `get_platform_stats()` (`db/fn_get_platform_stats.sql:9`, `:11`): add `where platform_source is distinct from 'backtest'` / `and platform_source is distinct from 'backtest'`. `CREATE OR REPLACE`.
- **Post-checks** (read-only, commented in the file): `pg_get_functiondef` of both contains `IS DISTINCT FROM 'backtest'`, and `SELECT * FROM list_journals()` still returns 22 columns.
- **Rollback:** the verbatim live bodies.
- **Apply before the deploy.** It is a no-op on today's data.
- **Migration 06** (owner decision): drop the six unused functions, recommended because `evaluate_prop_firm_rules` is an anon-executable SECURITY DEFINER IDOR. The alternative is to patch each with the predicate; for `get_strategy_performance` the predicate must go in the `LEFT JOIN … ON`.

---

## 4. Known behaviour and limitations

- **Currency.** Backtest P&L is USD. The app prints amounts with the user's currency symbol and no conversion (pre-existing, D5). This is visible only in the trades page Backtest and Tümü scopes and in the Stage 4 page.
- **Dates (R16).** For backtest rows, `trade_date` is the **entry** time, so they sort by entry. cTrader rows use the close time for both dates. Backtest rows never reach the calendar or overtrade checks, which are live-only.
- **Trades page volume.** It loads all scopes and filters on the client. If backtest volumes grow very large, switch to per-scope server fetches; the helper already supports `scope` and `cacheKey`.
- **Old open tabs.** A tab loaded before the deploy runs the old readers until it navigates. SpaRouter's build-id check forces a full load on the next SPA hop. This is transient.

---

## 5. Files in this area

| Path | Purpose |
|---|---|
| `stage5-6.md` | This plan. |
| `patches/stage6-readers.patch` | Exact Stage 6 edits to 29 existing files (LF diff, labels a/ b/). |
| `repo-ready/public/interface/shared/trades-source.js` | New file `WwTrades` (final). |
| `repo-ready/public/interface/backtest/js/bt-sync.js` | New file `WwBtSync` (final). |
| `repo-ready/tests/bt-sync.test.js`, `trades-source.test.js`, `prop-service.test.js`, `helpers/fake-supabase.js` | Final test files with repo paths. |
| `proto/make-stage6-patches.mjs` | Applies the edits to scratch copies, syntax-checks them, and writes the patch. |
| `proto/verify-all.mjs` | One-shot verification (patch, proto tests, 206-test mirror run, bundle rebuild, row smoke test). |
| `proto/smoke-trades-rows.mjs` | Behavioural check of the patched trades row builders. |
| `proto/tests/*`, `proto/public/*`, `proto/orig/*`, `proto/patched/*` | Prototypes, pristine copies used for diffs, generated patched copies. |
| `verify.log` | Output of the last `verify-all.mjs` run. |

---

## 6. "The app still works" checklist (R31)

**Before merge (automated):**
1. `node --test tests/*.test.js` gives 206+ passing and 0 failing. Other stages' tests add to this.
2. `npm run build` succeeds. `public/src/bundle.js` changed and contains `platform_source.is.null,platform_source.neq.backtest`. dist minify reports no warnings for the edited files.
3. The audit greps from section 3.2 pass. `?v` stamps are bumped, and `sw.js` `CACHE_VERSION` is +1.
4. M04 and M05 are applied and their post-checks pass. Rollback files are in `supabase/rollbacks/`.

**Right after deploy, with live data and no backtest rows yet** (numbers must equal the values noted before the deploy):
5. Dashboard: KPIs, every chart, mini calendar, monthly goal, ambient P&L, CSV/PDF export. Premium dashboard: widgets, insights, strategy section, PDF dialog, CSV.
6. Calendar month totals, day modal, day CSV/PDF. Strategies cards and detail.
7. Trades page:
   - Opens on **Canlı**; the count equals the old count. **Tümü** shows the same list. **Backtest** shows the empty state with its link.
   - Sort, direction and result filters and pagination work. Editing and deleting live trades works (single and bulk).
   - Editing a cTrader row keeps it after save without a reload.
   - Mobile: the scope chip comes first, the sheet shows 3 options, and the chip label stays correct after paging.
8. Journals page: card counts unchanged; the delete dialog shows the new wording, real strategy count, and no backtest line when there are 0; the prop time-shift preview shows the **newest** 3 trades.
9. Navbar journal switcher counts; the overtrade bell (premium) still warns on live data; landing counters load (logged out).
10. add-trade CSV import and Quick Add CSV import still detect duplicates. The prop banner/card and notifications are unchanged. The onboarding tasks widget is unchanged.
11. Language tr/en/de on the trades and journals pages shows no raw keys. Light and dark themes: the badge is readable. SPA hops, hard reloads and the **first load after deploy** (stale SW HTML) produce no `WwTrades is undefined` errors.

**With backtest data (test user):**
12. Link an account with N closed trades to journal A:
    - Trades page: Backtest = N rows with the badge; Canlı is unchanged; Tümü = live + N; stats follow the scope.
    - Dashboard, premium, calendar, strategies, prop, navbar counts, journal cards and landing counters are **unchanged**.
    - The journal delete dialog shows "+N".
13. Edit a backtest row: only notes and strategy are enabled; the save persists; P&L is unchanged; the badge stays. There is no delete button, and bulk select cannot include the row.
14. Close a new trade in the replay: it appears on the trades page on the next visit (cache invalidated).
15. Relink to B: A has 0 backtest rows and B has N. Unlink: 0. Delete the account: 0 mirrors and 0 account trades. Replaying recent dates triggers no overtrade warning.
16. **SQL read-only checks** (owner-run, after approval):
    ```sql
    -- per-account sum invariant (expect bt_sum = tr_sum and equal counts)
    SELECT a.id,
      (SELECT COALESCE(SUM(b.pnl),0) FROM public.backtest_account_trades b WHERE b.backtest_account_id = a.id AND b.exit_time IS NOT NULL) AS bt_sum,
      (SELECT COALESCE(SUM(t.pnl),0) FROM public.trades t WHERE t.user_id = a.user_id AND t.journal_id = a.journal_id
         AND t.platform_source = 'backtest' AND left(t.import_hash, 46) = 'backtest:' || a.id || ':') AS tr_sum
    FROM public.backtest_accounts a WHERE a.journal_id IS NOT NULL;
    -- orphans and shape (expect 0 / 0)
    SELECT count(*) FROM public.trades t WHERE t.platform_source = 'backtest' AND NOT EXISTS (
      SELECT 1 FROM public.backtest_accounts a WHERE a.journal_id = t.journal_id AND left(t.import_hash, 46) = 'backtest:' || a.id || ':');
    SELECT count(*) FROM public.trades WHERE platform_source = 'backtest' AND (position_id IS NOT NULL OR pnl IS NULL OR exit_price IS NULL);
    ```
    `46` = `length('backtest:') + 36 + 1`.

---

## 7. Notes for the other tracks

- **Stage 3A (schema):** `mapTrade` reads `stop_loss`/`take_profit` as the **initial** levels (D5). D8 allows editing TP/SL on open positions. If those edits overwrite the same columns, the mirror's levels and `rr_ratio` follow the edited values while the backtest table's `rr_ratio` (computed at entry, D4) does not. Keep `stop_loss`/`take_profit` immutable after insert and store the current levels separately (for example `current_sl`/`current_tp`), or tell this track to switch `mapTrade` to `initial_*` columns (a one-line change).
- **Stage 3A:** if `gross_pnl` is declined, `mapTrade` derives it. Closed trades should be immutable (the D3 "immutables" trigger), so `ignoreDuplicates` remains correct and repair stays rare.
- **Stage 4:**
  - Hook points are in section 2.7.
  - Load `bt-sync.js` after `bt-symbols.js`.
  - Store prices, SL and TP on the point grid.
  - Any reset or trade-delete flow must call `reconcileAccount` (or M04 option (b)).
  - The Stage 5 i18n keys belong in the `backtest.*` block.
- **SQL track:** M04 contract in section 2.8; M05 in section 3.7. Rebuild from the `db/fn_*.sql` live bodies.

---

## 8. Open issues and points raised against decisions

1. **[Addition to D1]** `trades-source.js` is also imported into `bundle.js`, because SW-cached stale HTML can run new page scripts without the BaseHead tag (section 1.4). This needs the lead's acceptance. Without it, every reader needs an inline fallback.
2. **[Addition to D5]** The reconcile also *repairs* drifted mirrors with an engine-columns-only UPDATE, because `ignoreDuplicates` can never correct a row. It can be disabled with `{repair:false}`.
3. **[Change to D5]** Deletes use chunks of 100 ids (URL length), not 200. Upserts stay at 200.
4. **[Addition to D5]** `sweepOrphans` plus a per-account write queue handle cross-tab and SPA races that the M04 triggers cannot see. Option: the M04 insert-validity guard (section 2.8 a).
5. **[Concern about D6]** "Stats follow the selected scope" means **Tümü** totals mix real and simulated P&L, and USD with the user's currency symbol. This is kept as D6 says; see owner decision 2.
6. **Schema coordination:** initial versus edited SL/TP (section 7). This must be settled before Stage 4 persists TP/SL edits.
7. **Account reset or trade delete in Stage 4:** these need `reconcileAccount` afterwards, or M04 option (b). Otherwise stale mirrors remain until the next entry into that account.
8. **Pre-existing bugs fixed as a side effect of touched lines:**
   - `journals.astro` `slice(-3)` showed the oldest trades.
   - The delete dialog hard-coded `{strategyCount}` = 0 and had wrong "moved to default account" wording.
   - The trades edit merge dropped `platform_source`.
   - Bulk delete filtered local state by selection instead of by the ids actually deleted.
9. **Pre-existing bugs left alone:**
   - The navbar overtrade cache path is active-journal-only while its DB path covers all journals.
   - Existing mobile chips lose their label after `i18n.apply()` on re-render; only the new scope chip is immune.
   - The cTrader partial-close unique-index failure is out of scope.
10. **Not verifiable offline:** PostgREST behaviour against the hosted project (the `or=` filter on DELETE/HEAD, numeric string casts, upsert + `select('id')` with `ignoreDuplicates`). These match postgrest-js 2.117.3 and the cTrader function's identical usage. They should still be confirmed on the Cloudflare preview with a test user before prod.
11. **Line drift:** line numbers are at f62f68c. Re-run `proto/make-stage6-patches.mjs` on the Stage 4 head to refresh the patch; it anchors on content and fails loudly if an anchor moved.
12. **`fs.cpSync` crashes Node 25 on this machine** when paths contain "Masaüstü". This matters only for tooling (the verification script uses a manual copy); there is no app impact.

---

## 9. Owner decisions needed (recommendation first)

1. **Trades page default scope:** **Canlı** (R20). The choice is remembered **only for the browser session** (recommended), not across sessions (localStorage, the inventory's proposal).
2. **Stats in "Tümü":** follow the scope as D6 says (recommended, simplest), knowing they mix real and simulated P&L and USD with the local symbol. The alternative is to always show live-only stats in Tümü with a caption.
3. **Journal delete text:** fix the existing wrong sentence ("moved to your default account" becomes "permanently deleted") in tr/en/de. Recommended.
4. **M04 hardening:** (a) insert-validity guard, recommended; (b) per-trade cleanup trigger, only if Stage 4 has reset or delete-trade; (c) integrity CHECKs, optional; (d) read-only guard trigger, D5 default no.
5. **Backup before M04+M05:** R48 strictly covers the first write (M01). A fresh full backup right before M04+M05, using the D11 procedure and reporting its location, is recommended.
6. **Migration 06:** drop the six unused trade functions (recommended) or patch them with the predicate (already in D10).
7. **Onboarding dev resets** (`resetOnboarding`/`resetTasksOnly`): keep deleting all trades, or delete only live trades so backtest mirrors stay consistent with their accounts. Low priority; recommended: live-only.
8. **Notes on mirrored rows are lost on relink or unlink** (R18 deletes the rows). Accept this, as recommended (the confirm text warns), or ask for a future "move instead of delete" variant. That would change R18 and the unique-key design, so it is not recommended now.
