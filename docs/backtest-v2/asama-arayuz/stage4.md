# Backtest v2 — Stage 4 frontend plan: accounts, replay, trade engine, chart

Plan only; nothing is implemented. Branch `backtest-v2` at `f62f68c` (working tree clean, read-only survey).
Binding inputs: `inputs/requirements.md` (R-ids), `inputs/decisions.md` (D-ids), findings `inputs/w1|w2|w3`, live DB snapshots `db/`, prototypes `agents2/`, `agents3/symbols-scripts/`.

Citation style: `path:line` is a repo path. `scratch:` means `C:\Users\kadir\AppData\Local\Temp\claude\c--Users-kadir-OneDrive-Masa-st--Wawe-Journal-astro\97ee93d7-3b56-4094-909f-8a419fcb57d4\scratchpad\`.

Every concrete number in §7 was re-run in scratch (`scratch:plan/frontend/verify/stage4-proto.mjs` and `check-numbers.mjs`, both pass on Node v25; see Appendix A).

---

## 0. Scope, preconditions, deliverables

### 0.1 What Stage 4 ships (R22–R30, D2 "Stage 4", D8)
- `/backtest` becomes the real page:
  - account list with a quota indicator;
  - create/edit modal (name, symbol, timeframe, start date, starting balance, spread, commission, optional journal);
  - page-local delete confirmation;
  - replay screen with toolbar (timeframe, go-to-date, play/pause, step one candle, step one minute, speed);
  - candle chart with markers and entry/SL/TP price lines;
  - order panel (lot, optional SL/TP, SELL at bid, BUY at ask);
  - open-positions, history and statistics panels;
  - source label (`Arşiv · Dukascopy|Binance`) and the TradingView attribution.
- Two new pure libraries, `bt-candles.js` and `bt-engine.js`. The page also uses `bt-symbols.js` (created in Stage 3B) and `bt-data.js` (designed by the data track; §2.4 is the interface this page needs).
- `backtest.*` i18n keys in tr/en/de, `backtest.css`, and node:test tests.
- No migration in Stage 4: it uses Migration 02's tables (D3). No new npm packages (R2). No rows reach `public.trades`: journal sync is Stage 5 and ships together with Stage 6 (D2).

### 0.2 Preconditions
| From | Needed state |
|---|---|
| Stage 2 | `src/pages/backtest.astro` is a minimal shell. `public/styles.css:2832-2833` (`.bt-chart-card, .bt-trade-panel`) is removed. `SpaRouter.astro:71` and `page-transition.js:68-69` still list `/backtest`. |
| Stage 3A | Migration 02 is applied: `backtest_accounts`, `backtest_account_trades`, RLS, `trg_check_backtest_account_limit`, `trg_check_backtest_trade` (D3). |
| Stage 3B | Storage bucket `candles` exists with `manifest.json` and `<SYMBOL>/<YYYY-MM>.json.gz` (D7). `public/interface/backtest/js/bt-symbols.js` exists (D1/D2). |
| Data track | `public/interface/backtest/js/bt-data.js` implements §2.4. |

### 0.3 Files
| Path | Change | `?v` | Purpose |
|---|---|---|---|
| `src/pages/backtest.astro` | replace the Stage 2 shell | — | head slot and markup (§1) |
| `public/interface/backtest/css/backtest.css` | new | 1 | page styles (§6) |
| `public/interface/backtest/js/bt-symbols.js` | from 3B; add `tradingDayKey`, `priceFormat` if 3B did not (§2.1) | 1 (first page reference) | symbol config, market hours |
| `public/interface/backtest/js/bt-candles.js` | new | 1 | 1m → timeframe aggregation, cursor maths (pure) |
| `public/interface/backtest/js/bt-engine.js` | new | 1 | exact numbers, fills, triggers, account state, DB mapping (pure) |
| `public/interface/backtest/js/bt-data.js` | new (data-track design) | 1 | `CandleSource` (§2.4) |
| `public/interface/backtest/js/backtest.js` | new | 1 | page controller (`data-page-script`) |
| `public/i18n/locales/tr.js`, `en.js`, `de.js` | add `backtest.*` (§5) | via `public/i18n.js:126` | texts |
| `public/i18n.js:126` | bump the locale `?v=1791896800` | — | the SW serves root files cache-first (`public/sw.js:31-63`) |
| `public/sw.js:1` | bump `CACHE_VERSION` again (Stage 2 bumps it once) | — | the clean-URL `/backtest` HTML is SW-cached (verify_dependencies "missed" #1; `sw.js:42` only skips `*.html`) |
| `tests/bt-candles.test.js`, `tests/bt-engine.test.js`, `tests/bt-i18n.test.js`; `tests/bt-symbols.test.js` if 3B did not add it | new | — | §7 |
| `src/components/UpgradeModal.astro` | optional (owner decision O6) | — | a `backtest` notice text |
| `src/components/Navbar.astro`, `public/components/navbar/navbar.js`, `src/layouts/Layout.astro:76`, locales `nav.backtest` | optional (owner decision O1) | navbar.js `?v` | navbar link (§8.2) |
| `PROJECT_OVERVIEW.md:29,168,301,335,387` | docs | — | route row, LWC user, page protection, pure-black file list, tests |

All five `bt-*` scripts start at `?v=1`. No page references them before Stage 4, so no browser has cached them. Bump the number on every later change (`PROJECT_OVERVIEW.md:388`).

### 0.4 Not in Stage 4 (hooks only)
- Journal sync (Stage 5). §2.5.8 lists the hook points. Statistics filters (Stage 6).
- Pending orders, partial closes, swap, margin/stop-out, rewind. `bt-engine` leaves room for them; the research covers pending-order rules (`inputs/w3/symbols_readable.md` "PENDING ORDERS").
- Live data source (R46). `CandleSource.kind` is the hook.

---

## 1. `src/pages/backtest.astro`

### 1.1 Frontmatter and head slot (exact)
```astro
---
import Layout from '../layouts/Layout.astro';
---
<Layout lang="tr" spa={true} title="Backtest – Wawe Journal" bodyClass="backtest-page">
<Fragment slot="head">
  <link rel="stylesheet" href="/interface/backtest/css/backtest.css?v=1" />

  <link rel="preload" href="https://cdn.jsdelivr.net/npm/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js" as="script" />
  <link rel="preload" href="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3" as="script" />
  <script src="https://cdn.jsdelivr.net/npm/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js" is:inline defer></script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3" is:inline defer></script>
  <script src="/config.js" is:inline defer></script>
  <script src="/i18n.js?v=NEW_LOCALE_V" is:inline defer></script>
  <script type="module" src="/src/bundle.js" is:inline defer></script>

  <script src="/interface/backtest/js/bt-symbols.js?v=1" is:inline defer></script>
  <script src="/interface/backtest/js/bt-candles.js?v=1" is:inline defer></script>
  <script src="/interface/backtest/js/bt-engine.js?v=1" is:inline defer></script>
  <script src="/interface/backtest/js/bt-data.js?v=1" is:inline defer></script>
  <script src="/interface/backtest/js/backtest.js?v=1" is:inline defer data-page-script></script>
</Fragment>
  <!-- §1.2 body, §1.3 modals -->
</Layout>
```
Why each line is there:
- **Title.** It goes through the Layout `title` prop. `BaseHead.astro:120` prints Layout's title (`Layout.astro:27`) before the head slot, so a second `<title>` has no effect on the tab (conventions #1). The old page did exactly that at `backtest.astro:7`. The text is the same in all three languages, so it needs no `data-i18n`.
- **Head order.** Page CSS, then CDN libraries, then `/config.js`, `/i18n.js`, `bundle.js`, the page libraries, and the page script last. This matches `src/pages/strategies.astro:5-33` and `src/pages/dashboard.astro:437-461`.
  - supabase-js must load before `/config.js`, which creates `window.sb` (`public/config.js:32-37`).
- **Exact LWC URL.** It is byte-identical to `dashboard.astro:442` and `premium-dashboard.astro:23`. SpaRouter gives jsDelivr scripts the identity `npm:<pkg>`, and any other URL for that package forces a full reload (`SpaRouter.astro:92-101,127-140`).
- **Library scripts** have no `data-page-script`, so they run once per tab. `backtest.js` has it and re-runs on every SPA visit (`SpaRouter.astro:226-229,340-349`).
  - Every tag is `is:inline defer`.
  - All of them live under `/interface/`, which the SW never caches (`sw.js:34-39`).
- **`/i18n.js?v=NEW_LOCALE_V`.** Use the same number as the new locale version at `i18n.js:126`.
  - SpaRouter identifies local scripts by path, so a different `?v` never runs i18n.js twice (`SpaRouter.astro:87-100`).
  - A direct load of `/backtest` still gets a fresh i18n.js instead of the SW's stale copy.
- **No quick-add.** `showQuickAdd` stays false (`Layout.astro:19-20,35,51`): no "+ trade" FAB for real trades on a simulator page, and no quick-add assets.
- **Nothing else.** No `<meta charset>`, no second `/styles.css` and no legacy `<nav>` (the old `backtest.astro:6,8,189-204` had all three). No inline `<style>`: the CSS lives in `backtest.css`.

### 1.2 Body markup (default slot, so the SPA swap removes it; `Layout.astro:61-68`)
All ids start with `bt-` (ids are reused across pages: `dashboard.js:60-69`). Static text carries Turkish fallback text plus `data-i18n`. Text with children uses a child `<span data-i18n>`, because `apply()` sets `textContent` (conventions §13).
```html
<main class="bt-main" id="bt-root" data-state="boot">

  <!-- ================= LIST VIEW ================= -->
  <section id="bt-view-list" class="bt-view" aria-labelledby="bt-title" hidden>
    <div class="page-header">
      <div>
        <h1 id="bt-title" data-i18n="backtest.title">Backtest</h1>
        <p class="subtitle" data-i18n="backtest.subtitle">Geçmiş piyasa verisinde mum mum işlem pratiği yap.</p>
      </div>
      <div class="bt-list-actions">
        <span id="bt-quota" class="bt-quota bt-num" aria-live="polite"></span>
        <button type="button" id="bt-new-account-btn" class="btn btn-primary">
          <i data-lucide="plus" aria-hidden="true"></i><span data-i18n="backtest.new_account">Yeni hesap</span>
        </button>
      </div>
    </div>
    <p id="bt-quota-note" class="bt-hint" data-i18n="backtest.quota.over_limit" hidden>Plan limitinin üzerindesiniz; mevcut hesaplar çalışmaya devam eder.</p>

    <div id="bt-accounts" class="bt-accounts" aria-busy="true">
      <div class="bt-account-card bt-skeleton"></div>
      <div class="bt-account-card bt-skeleton"></div>
      <div class="bt-account-card bt-skeleton"></div>
    </div>

    <div id="bt-accounts-empty" class="bt-empty" hidden>
      <i data-lucide="history" aria-hidden="true"></i>
      <h2 data-i18n="backtest.empty_title">Henüz backtest hesabın yok</h2>
      <p data-i18n="backtest.empty_desc">Bir sembol ve başlangıç tarihi seç, geçmiş veride mum mum işlem yap.</p>
      <button type="button" id="bt-empty-create-btn" class="btn btn-primary"><span data-i18n="backtest.new_account">Yeni hesap</span></button>
    </div>

    <div id="bt-list-error" class="bt-banner bt-banner-error" role="alert" hidden>
      <span data-i18n="backtest.load_error">Hesaplar yüklenemedi.</span>
      <button type="button" id="bt-list-retry-btn" class="btn btn-ghost"><span data-i18n="backtest.retry">Tekrar dene</span></button>
    </div>
    <p id="bt-demo" class="bt-banner" data-i18n="backtest.demo_mode" hidden>Demo modunda backtest kullanılamaz. Lütfen giriş yapın.</p>
    <p id="bt-fatal" class="bt-banner bt-banner-error" role="alert" data-i18n="backtest.deps_error" hidden>Sayfa bileşenleri yüklenemedi. Lütfen sayfayı yenileyin.</p>
  </section>

  <!-- ================= REPLAY VIEW ================= -->
  <section id="bt-view-replay" class="bt-view" data-replay="idle" hidden>
    <header class="bt-replay-head">
      <button type="button" id="bt-back-btn" class="btn btn-ghost bt-back">
        <i data-lucide="arrow-left" aria-hidden="true"></i><span data-i18n="backtest.back">Hesaplar</span>
      </button>
      <div class="bt-replay-title">
        <h2 id="bt-acc-name"></h2>
        <span id="bt-acc-symbol" class="bt-chip"></span>
      </div>
      <button type="button" id="bt-acc-settings-btn" class="btn btn-ghost">
        <i data-lucide="settings-2" aria-hidden="true"></i><span data-i18n="backtest.card.settings">Ayarlar</span>
      </button>
    </header>

    <div class="bt-toolbar" role="toolbar">
      <label class="bt-sr" for="bt-tf" data-i18n="backtest.field.timeframe">Zaman dilimi</label>
      <select id="bt-tf" class="bt-select bt-num">
        <option value="1m">M1</option><option value="5m">M5</option><option value="15m">M15</option>
        <option value="30m">M30</option><option value="1h">H1</option><option value="4h">H4</option><option value="1d">D1</option>
      </select>

      <div class="bt-goto">
        <label class="bt-sr" for="bt-goto-input" data-i18n="backtest.goto.label">Tarihe git</label>
        <input id="bt-goto-input" class="bt-input bt-num" type="datetime-local" step="60" />
        <button type="button" id="bt-goto-btn" class="btn btn-ghost"><span data-i18n="backtest.goto.button">Git</span></button>
      </div>

      <div class="bt-transport">
        <button type="button" id="bt-play-btn" class="bt-icon-btn bt-play" aria-pressed="false" data-i18n-title="backtest.play" title="Oynat">
          <i data-lucide="play" aria-hidden="true"></i><span id="bt-play-label" class="bt-sr" data-i18n="backtest.play">Oynat</span>
        </button>
        <button type="button" id="bt-step-btn" class="bt-icon-btn" data-i18n-title="backtest.step" title="Bir mum ilerle">
          <i data-lucide="skip-forward" aria-hidden="true"></i><span class="bt-sr" data-i18n="backtest.step">Bir mum ilerle</span>
        </button>
        <button type="button" id="bt-step1m-btn" class="bt-icon-btn bt-num" data-i18n-title="backtest.step_1m" title="1 dakika ilerle">+1m</button>
        <label class="bt-sr" for="bt-speed" data-i18n="backtest.speed">Hız</label>
        <select id="bt-speed" class="bt-select bt-num" data-i18n-title="backtest.speed_hint" title="Saniyede mum">
          <option value="0.1">0.1×</option><option value="0.3">0.3×</option><option value="0.5">0.5×</option>
          <option value="1" selected>1×</option><option value="3">3×</option><option value="10">10×</option>
        </select>
      </div>

      <div class="bt-clock">
        <span class="bt-sr" data-i18n="backtest.card.replay_time">Replay zamanı</span>
        <span id="bt-clock-time" class="bt-num">—</span>
        <span id="bt-clock-tz" class="bt-clock-tz"></span>
        <span id="bt-market-chip" class="bt-chip bt-chip-muted" hidden></span>
      </div>
    </div>

    <div class="bt-layout">
      <div id="bt-chart-card" class="bt-chart-card">
        <div class="bt-chart-top">
          <div id="bt-legend" class="bt-legend bt-num" aria-hidden="true"></div>
          <span id="bt-source-label" class="bt-source"></span>
        </div>
        <div class="bt-chart-wrap">
          <div id="bt-chart" class="bt-chart"></div>
          <div id="bt-chart-overlay" class="bt-chart-overlay" hidden>
            <span id="bt-overlay-text">Mum verisi yükleniyor…</span>
          </div>
        </div>
        <div id="bt-data-banner" class="bt-banner" role="status" hidden>
          <span id="bt-data-banner-text"></span>
          <button type="button" id="bt-data-banner-btn" class="btn btn-ghost" hidden></button>
        </div>
        <footer class="bt-chart-foot">
          <span id="bt-gap-note" class="bt-hint"></span>
          <p class="bt-attribution">
            <span data-i18n="backtest.attribution_prefix">Grafikler:</span>
            <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView Lightweight Charts™</a>
            <span>Copyright (c) 2023 TradingView, Inc.</span>
          </p>
        </footer>
      </div>

      <aside class="bt-side">
        <div id="bt-stats" class="bt-card bt-stats">
          <div class="bt-stat"><span class="bt-stat-label" data-i18n="backtest.stat.balance">Bakiye</span><span id="bt-stat-balance" class="bt-num">—</span></div>
          <div class="bt-stat"><span class="bt-stat-label" data-i18n="backtest.stat.equity">Özsermaye</span><span id="bt-stat-equity" class="bt-num">—</span></div>
          <div class="bt-stat"><span class="bt-stat-label" data-i18n="backtest.stat.realized">Gerçekleşen K/Z</span><span id="bt-stat-realized" class="bt-num">—</span></div>
          <div class="bt-stat"><span class="bt-stat-label" data-i18n="backtest.stat.floating">Açık K/Z</span><span id="bt-stat-floating" class="bt-num">—</span></div>
        </div>

        <form id="bt-order-form" class="bt-card bt-order" novalidate autocomplete="off">
          <div class="bt-quote">
            <button type="button" id="bt-sell-btn" class="bt-btn-sell" data-dir="-1">
              <span data-i18n="backtest.order.sell">SAT</span><span id="bt-bid" class="bt-num">—</span>
            </button>
            <span id="bt-spread" class="bt-spread bt-num">—</span>
            <button type="button" id="bt-buy-btn" class="bt-btn-buy" data-dir="1">
              <span data-i18n="backtest.order.buy">AL</span><span id="bt-ask" class="bt-num">—</span>
            </button>
          </div>
          <div class="bt-field">
            <label for="bt-lot" data-i18n="backtest.order.lot">Lot</label>
            <input id="bt-lot" class="bt-input bt-num" type="text" inputmode="decimal" value="0.10" />
            <small id="bt-lot-hint" class="bt-hint bt-num"></small>
          </div>
          <div class="bt-field-row">
            <div class="bt-field">
              <label for="bt-sl" data-i18n="backtest.order.sl">Zarar durdur (SL)</label>
              <input id="bt-sl" class="bt-input bt-num" type="text" inputmode="decimal" data-i18n-placeholder="backtest.order.price_ph" placeholder="Fiyat (isteğe bağlı)" />
            </div>
            <div class="bt-field">
              <label for="bt-tp" data-i18n="backtest.order.tp">Kâr al (TP)</label>
              <input id="bt-tp" class="bt-input bt-num" type="text" inputmode="decimal" data-i18n-placeholder="backtest.order.price_ph" placeholder="Fiyat (isteğe bağlı)" />
            </div>
          </div>
          <p id="bt-order-risk" class="bt-hint bt-num"></p>
          <p id="bt-order-error" class="bt-error" role="alert" hidden></p>
        </form>
      </aside>
    </div>

    <div id="bt-save-banner" class="bt-banner bt-banner-error" role="alert" hidden>
      <span data-i18n="backtest.err.save_failed_final">Bazı değişiklikler kaydedilemedi.</span>
      <button type="button" id="bt-save-retry-btn" class="btn btn-ghost"><span data-i18n="backtest.retry">Tekrar dene</span></button>
    </div>

    <section class="bt-card bt-tables">
      <div class="bt-tabs" role="tablist">
        <button type="button" role="tab" id="bt-tab-open" aria-controls="bt-panel-open" aria-selected="true">
          <span data-i18n="backtest.pos.title">Açık pozisyonlar</span> <span id="bt-open-count" class="bt-count bt-num">0</span></button>
        <button type="button" role="tab" id="bt-tab-history" aria-controls="bt-panel-history" aria-selected="false">
          <span data-i18n="backtest.history.title">İşlem geçmişi</span> <span id="bt-history-count" class="bt-count bt-num">0</span></button>
        <button type="button" role="tab" id="bt-tab-stats" aria-controls="bt-panel-stats" aria-selected="false">
          <span data-i18n="backtest.stats.title">İstatistikler</span></button>
      </div>

      <div id="bt-panel-open" class="bt-panel" role="tabpanel" aria-labelledby="bt-tab-open">
        <div class="bt-table-wrap"><table class="bt-table">
          <thead><tr>
            <th data-i18n="backtest.col.dir">Yön</th><th data-i18n="backtest.col.lot">Lot</th>
            <th data-i18n="backtest.col.entry_time">Giriş zamanı</th><th data-i18n="backtest.col.entry">Giriş</th>
            <th>SL</th><th>TP</th><th data-i18n="backtest.col.price">Güncel fiyat</th>
            <th data-i18n="backtest.col.pnl">K/Z</th><th><span class="bt-sr" data-i18n="backtest.col.actions">İşlemler</span></th>
          </tr></thead>
          <tbody id="bt-open-body"></tbody>
        </table></div>
        <p id="bt-open-empty" class="bt-hint" data-i18n="backtest.pos.empty">Açık pozisyon yok.</p>
      </div>

      <div id="bt-panel-history" class="bt-panel" role="tabpanel" aria-labelledby="bt-tab-history" hidden>
        <div class="bt-table-wrap"><table class="bt-table">
          <thead><tr>
            <th data-i18n="backtest.col.dir">Yön</th><th data-i18n="backtest.col.lot">Lot</th>
            <th data-i18n="backtest.col.entry_time">Giriş zamanı</th><th data-i18n="backtest.col.entry">Giriş</th>
            <th data-i18n="backtest.col.exit_time">Çıkış zamanı</th><th data-i18n="backtest.col.exit">Çıkış</th>
            <th data-i18n="backtest.col.reason">Sebep</th><th data-i18n="backtest.col.commission">Komisyon</th>
            <th data-i18n="backtest.col.net">Net K/Z</th><th data-i18n="backtest.col.rr">R:R</th>
          </tr></thead>
          <tbody id="bt-history-body"></tbody>
        </table></div>
        <p id="bt-history-empty" class="bt-hint" data-i18n="backtest.history.empty">Henüz kapanan işlem yok.</p>
        <p id="bt-history-more" class="bt-hint" hidden></p>
      </div>

      <div id="bt-panel-stats" class="bt-panel" role="tabpanel" aria-labelledby="bt-tab-stats" hidden>
        <dl id="bt-stats-grid" class="bt-stats-grid"></dl>
        <p class="bt-hint" data-i18n="backtest.stat.currency_note">Tutarlar USD cinsindendir.</p>
      </div>
    </section>

    <p class="bt-hint bt-shortcuts" data-i18n="backtest.shortcuts">Kısayollar: Boşluk = oynat/duraklat, → = bir mum, Shift+→ = 1 dakika</p>
  </section>
</main>
```

### 1.3 Modals (page slot, after `</main>`; pattern from `strategies.astro:198-223`)
`.modal-overlay` is the shell. It is fixed, hidden by default and shown with class `active` (`styles.css:2628-2668`). Every overlay also has `bt-modal`, which scopes the page CSS and the pure-black override (§6) so `UpgradeModal` and other overlays are untouched.
```html
<div id="bt-account-modal" class="modal-overlay bt-modal" role="dialog" aria-modal="true" aria-labelledby="bt-account-modal-title">
  <div class="modal-box">
    <div class="modal-header">
      <h3 id="bt-account-modal-title" data-i18n="backtest.modal.create_title">Yeni backtest hesabı</h3>
      <button type="button" id="bt-account-close" class="modal-close" data-i18n-title="common.close" title="Kapat">✕</button>
    </div>
    <form id="bt-account-form" class="modal-body" novalidate autocomplete="off">
      <div class="bt-field"><label for="bt-f-name" data-i18n="backtest.field.name">Hesap adı</label>
        <input id="bt-f-name" class="bt-input" type="text" maxlength="60" data-i18n-placeholder="backtest.field.name_ph" placeholder="Örn. EURUSD Londra seansı" /></div>
      <div class="bt-field-row">
        <div class="bt-field"><label for="bt-f-symbol" data-i18n="backtest.field.symbol">Sembol</label>
          <select id="bt-f-symbol" class="bt-select"></select>   <!-- optgroups built from WwBtSymbols.list() -->
          <small id="bt-f-symbol-hint" class="bt-hint" hidden></small></div>
        <div class="bt-field"><label for="bt-f-tf" data-i18n="backtest.field.timeframe">Zaman dilimi</label>
          <select id="bt-f-tf" class="bt-select bt-num"><!-- same 7 options as #bt-tf, default 1h (D3) --></select></div>
      </div>
      <div class="bt-field" id="bt-f-start-wrap"><label for="bt-f-start" data-i18n="backtest.field.start">Başlangıç tarihi ve saati</label>
        <input id="bt-f-start" class="bt-input bt-num" type="datetime-local" step="60" />
        <small id="bt-f-start-hint" class="bt-hint"></small></div>
      <div class="bt-field-row">
        <div class="bt-field" id="bt-f-balance-wrap"><label for="bt-f-balance" data-i18n="backtest.field.balance">Başlangıç bakiyesi (USD)</label>
          <input id="bt-f-balance" class="bt-input bt-num" type="text" inputmode="decimal" value="10000.00" /></div>
        <div class="bt-field"><label for="bt-f-spread" data-i18n="backtest.field.spread">Spread (pip)</label>
          <input id="bt-f-spread" class="bt-input bt-num" type="text" inputmode="decimal" />
          <small id="bt-f-spread-hint" class="bt-hint bt-num"></small></div>
      </div>
      <div class="bt-field"><label for="bt-f-commission" data-i18n="backtest.field.commission">Komisyon (lot başına, açılış+kapanış, USD)</label>
        <input id="bt-f-commission" class="bt-input bt-num" type="text" inputmode="decimal" value="0.00" />
        <small class="bt-hint" data-i18n="backtest.field.commission_hint">Pozisyon kapanınca bakiyeden düşülür.</small></div>
      <div class="bt-field"><label for="bt-f-journal" data-i18n="backtest.field.journal">Bağlı defter (isteğe bağlı)</label>
        <select id="bt-f-journal" class="bt-select"><option value="" data-i18n="backtest.field.journal_none">Bağlantı yok</option></select>
        <small id="bt-f-journal-hint" class="bt-hint"></small></div>
      <p id="bt-account-error" class="bt-error" role="alert" hidden></p>
    </form>
    <div class="modal-footer">
      <button type="button" id="bt-account-delete" class="bt-btn-danger-ghost" hidden><span data-i18n="backtest.modal.delete_account">Hesabı sil</span></button>
      <span class="bt-spacer"></span>
      <button type="button" id="bt-account-cancel" class="btn-modal-cancel"><span data-i18n="common.cancel">İptal</span></button>
      <button type="button" id="bt-account-submit" class="btn-modal-confirm"><span id="bt-account-submit-label" data-i18n="backtest.modal.create">Hesabı oluştur</span></button>
    </div>
  </div>
</div>

<div id="bt-delete-modal" class="modal-overlay bt-modal" role="alertdialog" aria-modal="true" aria-labelledby="bt-delete-title">
  <div class="modal-box modal-box-sm">
    <div class="modal-header">
      <h3 id="bt-delete-title" data-i18n="backtest.delete.title">Hesabı sil</h3>
      <button type="button" id="bt-delete-close" class="modal-close" data-i18n-title="common.close" title="Kapat">✕</button>
    </div>
    <div class="modal-body">
      <p id="bt-delete-text"></p>                     <!-- textContent = t('backtest.delete.message', {name, n}) -->
      <p id="bt-delete-note" class="bt-hint" data-i18n="backtest.delete.journal_note" hidden>Bağlı defterdeki kopyalanmış backtest işlemleri de silinir.</p>
    </div>
    <div class="modal-footer">
      <button type="button" id="bt-delete-cancel" class="btn-modal-cancel"><span data-i18n="common.cancel">İptal</span></button>
      <button type="button" id="bt-delete-confirm" class="bt-btn-danger"><span data-i18n="backtest.delete.confirm">Kalıcı olarak sil</span></button>
    </div>
  </div>
</div>

<div id="bt-pos-modal" class="modal-overlay bt-modal" role="dialog" aria-modal="true" aria-labelledby="bt-pos-title">
  <div class="modal-box modal-box-sm">
    <div class="modal-header">
      <h3 id="bt-pos-title" data-i18n="backtest.pos.modal_title">Pozisyonu düzenle</h3>
      <button type="button" id="bt-pos-close" class="modal-close" data-i18n-title="common.close" title="Kapat">✕</button>
    </div>
    <form id="bt-pos-form" class="modal-body" novalidate autocomplete="off">
      <p id="bt-pos-info" class="bt-hint bt-num"></p>   <!-- "AL 0.37 @ 1.08311 · Güncel 1.08400" -->
      <div class="bt-field-row">
        <div class="bt-field"><label for="bt-pos-sl" data-i18n="backtest.order.sl">Zarar durdur (SL)</label>
          <input id="bt-pos-sl" class="bt-input bt-num" type="text" inputmode="decimal" /></div>
        <div class="bt-field"><label for="bt-pos-tp" data-i18n="backtest.order.tp">Kâr al (TP)</label>
          <input id="bt-pos-tp" class="bt-input bt-num" type="text" inputmode="decimal" /></div>
      </div>
      <p id="bt-pos-error" class="bt-error" role="alert" hidden></p>
    </form>
    <div class="modal-footer">
      <button type="button" id="bt-pos-cancel" class="btn-modal-cancel"><span data-i18n="common.cancel">İptal</span></button>
      <button type="button" id="bt-pos-save" class="btn-modal-confirm"><span data-i18n="common.save">Kaydet</span></button>
    </div>
  </div>
</div>
```

### 1.4 Markup rules
- **No `confirm-dialog.js`.** It is never loaded and it injects unescaped HTML (conventions §12). Use the page-local delete modal.
- **Escaping.** Dynamic text (account and journal names, numbers) goes in through `textContent`, or through `WwChart.esc()` when HTML is built (`chart-theme.js:36-40`).
- **After injecting HTML** that holds `data-lucide`, call `lucide.createIcons()`. After injecting HTML with `data-i18n`, call `i18n.apply()` (`strategies.js:605-607`). Prefer building strings with `_t()` (§2.5.1).
- **Lock icons.** None anywhere, including in the quota UI (owner preference).
- **Market terms.** `SL`, `TP` and the M1…D1 timeframe labels are the same in every language and carry no `data-i18n`.

---

## 2. Modules and APIs

### 2.0 Load order, globals, purity
| File | Global | Depends on | Pure? | Test |
|---|---|---|---|---|
| `bt-symbols.js` | `window.WwBtSymbols` | `Intl` | yes | `tests/bt-symbols.test.js` |
| `bt-candles.js` | `window.WwBtCandles` | WwBtSymbols (`dayAnchor`, `nextOpen`) | yes | `tests/bt-candles.test.js` |
| `bt-engine.js` | `window.WwBtEngine` | WwBtSymbols (symbol objects) | yes | `tests/bt-engine.test.js` |
| `bt-data.js` | `window.WwBtData` | `window.sb`, `DecompressionStream`, IndexedDB | no (I/O) | data-track tests |
| `backtest.js` | none (IIFE; hooks only through `PAGE.expose` if ever needed) | all of the above plus LWC, `sb`, `i18n`, `WwTime`, `WwChart`, `WwMetrics`, `requireAuth`, `journal` | no (DOM) | manual checklist §8 |

- Library files are IIFEs ending with `})(typeof window !== 'undefined' ? window : globalThis);` (D1). The repo's `this` footer (`trade-metrics.js:221`, `time-settings.js:415`) throws when the file is imported as ESM under `"type":"module"` (`package.json:5`; reproduced in the symbols research).
- Library files use `var`. They must not read the DOM or `window.sb` at load time, and they keep no per-page state. They run once per tab, while the page script runs once per visit.
- `bt-candles` and `bt-engine` take symbol ids or symbol objects. Their internal `sym(x)` does `typeof x === 'string' ? WwBtSymbols.get(x) : x`.

### 2.1 `bt-symbols.js` (WwBtSymbols): created in 3B from the prototype
Source: `scratch:agents3/symbols-scripts/bt-symbols.js` (verified: `test-hours.mjs`, 490,944 grid points and 3,000 `nextOpen` samples). Stage 4 uses:
- **Config.** `get(id)`, `list()`, `validate()`, plus the symbol fields `id`, `name`, `instrument`, `toUsd`, `digits`, `point`, `pipSize`, `pointsPerPip`, `contractSize`, `lot{min,step,max}`, `lotDigits`, `schedule`, `dataStart`, `defaultSpreadPips`, `source.provider`.
- **Market hours.** `isOpen(ms,id)`, `nextOpen(ms,id)` (ms in, ms or null out), `dayAnchor(ms,id)`.
- **Helpers.** `pipValueUsd(id, lot, price)` for the lot hint (float, display only). `spreadPoints` stays for the importer; the engine computes spread points exactly from hundredths of a pip (§2.3).

Add these two pure helpers (in 3B or in Stage 4):
```js
// 'YYYY-MM-DD' trading day of instant ms. FX/gold: the day that ENDS at 17:00 New York (MT4/MT5 convention);
// crypto: the UTC calendar day. offset = (1440 - dayStartMin) % 1440 — the % matters for dayStart '00:00'.
function tradingDayKey(ms, id) {
  var sc = BY_ID[id]._sc, off = (1440 - hm(sc.dayStart)) % 1440;
  var p = localParts(ms + off * 60000, sc.tz);
  return p.y + '-' + pad(p.m) + '-' + pad(p.d);
}
function priceFormat(id) { var s = BY_ID[id]; return { type: 'price', precision: s.digits, minMove: s.point }; }
```
Do not reuse the prototype's internal `tradingDate()` (`bt-symbols.js:179-181`) for crypto: with `dayStart '00:00'` it always adds a day. It is only correct inside `isHoliday` for fx/metal.

### 2.2 `bt-candles.js` (WwBtCandles): pure aggregation and cursor maths
Ported from `scratch:agents3/symbols-scripts/bt-math.js:78-108` (verified by `test-math.mjs`), working on columnar data.

**Data types.**
- `Minutes`: `{ n, t: Float64Array, o, h, l, c: Int32Array }`. `t` is UTC epoch seconds of the 1m bar open. Prices are integer points (`round(price × 10^digits)`).
- `Candle`: `{ time, open, high, low, close, n }`, in points, where `time` is the bucket start in UTC seconds.

| Function | Contract |
|---|---|
| `TF_IDS` | `['1m','5m','15m','30m','1h','4h','1d']` (the DB CHECK values, D3) |
| `TF_MIN` | `{ '1m':1, '5m':5, '15m':15, '30m':30, '1h':60, '4h':240, '1d':1440 }` |
| `TF_LABEL` | `{ '1m':'M1', … '1d':'D1' }` |
| `historyMonths(tfMin)` | Months of warm-up history before the window: 1→1, 5→1, 15→1, 30→2, 60→2, 240→4, 1440→10 (about 200 candles; `symbols_readable.md` "MONTH FILES"). |
| `monthKey(tSec)` | `'YYYY-MM'` (UTC) |
| `monthStart(key)` | UTC seconds of day 1, 00:00 |
| `nextMonth(key)`, `prevMonth(key)`, `addMonths(key, n)` | Key arithmetic. `'2024-12'→'2025-01'`, `'2020-01'→'2019-12'`. |
| `toMinutes(rows, digits, {points})` | Rows `[t,o,h,l,c]` (decimal numbers from bt-data; `points:true` when they are already points) become `Minutes`. Prices use `Math.round(x × 10^digits)`. Rows with a non-increasing `t`, non-finite values, or `|x·10^d − round(x·10^d)| > 1e-6` (off grid) are dropped and counted in `.bad`. |
| `concatMinutes(a, b)` | New `Minutes`. Requires `a.t[a.n-1] < b.t[0]`, else throws `BT_NON_MONOTONIC`. |
| `sliceMinutes(m, from)` | View from index `from` (`subarray`), used to trim the window. |
| `indexAtOrAfter(m, tSec)` | Binary search for the first `i` with `t[i] ≥ tSec`, or `m.n`. |
| `indexAtOrBefore(m, tSec)` | Last `i` with `t[i] ≤ tSec`, or `-1`. |
| `resumeIndex(m, replaySec)` | `indexAtOrBefore(m, replaySec - 60)` (D4: replay_time = last revealed open + 60 s). |
| `bucketStart(tSec, tfMin, symId)` | Up to H1: the UTC grid. H4/D1: anchored at `dayAnchor` (17:00 New York for FX/gold, 00:00 UTC for crypto). Prototype `bt-math.js:80-92`, without W1. |
| `aggregate(m, tfMin, symId, from=0, to=n-1)` | Candles from the existing 1m bars only, with no synthetic bars (prototype `bt-math.js:94-102`). |
| `partialAt(m, k, tfMin, symId)` | The in-progress candle at the cursor (prototype `bt-math.js:104-108`). |
| `merge(a, b)` | Concatenation that merges a boundary bucket with an equal `time` (`high=max`, `low=min`, `close=b.close`, `n+=`). Throws if `b` starts before `a` ends. Needed because FX D1/H4 buckets cross month boundaries: Tue 2026-09-01 D1 starts 2026-08-31T21:00Z (`test-math.mjs:115`). |
| `createBuilder(tfMin, symId, candles)` | Returns `{ candles, push(t,o,h,l,c) → index }`. Incremental: same bucket updates `high/low/close/n`, a new bucket appends. Returns the index of the changed candle. |
| `bucketEndIndex(m, k, tfMin, symId)` | Last index `j ≥ k` in the same bucket as `k`. `j === m.n-1` means the bucket may continue in data that is not loaded yet. |
| `stepTarget(m, k, tfMin, symId)` | Returns `{ j, open }`. If `k` is not the last bar of its bucket, `j = bucketEndIndex(k)` (complete the current candle). Otherwise `j = bucketEndIndex(k+1)` (complete the next one). `open = (j === m.n-1)`, so the caller must load the next month and recompute. If `k === m.n-1`, it returns `{ j: k, open: true }`. |
| `gapKind(prevT, t, symId)` | `null` when `t − prevT ≤ 60`. Otherwise, with `no = WwBtSymbols.nextOpen((prevT+60)·1000)`: `{kind:'closed', minutes}` if `no === null` or `no ≥ t·1000` (weekend, break, holiday), else `{kind:'missing', minutes: (t·1000 − no)/60000}`. |
| `framePlan(acc, dtMs, speed, tfMin, maxBars)` | Play accumulator: `acc' = acc + min(dtMs,250)/1000 × speed × tfMin`; `n = min(floor(acc'), maxBars)`; returns `{ n, acc: acc'−n }` (backlog above `maxBars` is dropped to 0). Speed is chart candles per second. |
| `toChartBar(c, scale)` | `{ time, open: c.open/scale, … }` for LWC (floats, display only). |

### 2.3 `bt-engine.js` (WwBtEngine): pure exact-money engine
Ported from `scratch:agents3/symbols-scripts/bt-math.js:10-76`: `roundDiv`, `grossCents`, `commissionCents`, `rrRatio`, `marketFill`, `closeFill` and `exitOnBar` (200,000 fuzz trades match a BigInt reference). The decimal helpers come from `scratch:agents2/bt-mapping-compact.mjs:4-35`. Units:
- prices are integer **points** (`10^-digits`);
- lots are integer **steps** (`lot.step`);
- money is integer **cents**;
- rr is integer **hundredths**;
- times are UTC **seconds**.

Rounding is Postgres `ROUND(numeric, 2)` (ties away from zero). There is never a `-0`, and `toFixed`/`Math.round` are never used on stored values (D4).

| Group | Function | Contract |
|---|---|---|
| numbers | `roundDiv(num, den)` | Exact integer division rounded half away from zero, with a BigInt fallback and no `-0` (prototype 12-24). |
| | `toPlainDecimalString(x)` | Number to plain decimal string with no exponent (`1e-7 → '0.0000001'`). |
| | `parseScaled(input, scale, mode)` | Decimal string or number to `{ok, value, snapped, code}`. A single `,` is accepted as the decimal separator. `mode 'exact'` rejects extra decimals (`code 'DECIMALS'`); `'round'` snaps half away from zero (`snapped:true`). Codes: `FORMAT`, `DECIMALS`, `RANGE`. |
| | `scaledToStr(v, scale)` | Exact decimal string (`108311,5 → '1.08311'`; `-5,2 → '-0.05'`; `-0 → '0.00'`). |
| | `centsToStr`, `ptsToStr(p,digits)`, `stepsToStr(n,lotDigits)`, `hundredthsToStr` | Thin wrappers. |
| | `toCents(v)`, `toPts(v,digits)`, `toSteps(v,lotDigits)`, `toHundredths(v)` | DB value (PostgREST returns `numeric` as a JSON number or string) to integer through `parseScaled(…,'round')`. |
| money | `spreadPts(sym, spreadH)` | `roundDiv(spreadH × pointsPerPip, 100)`, where `spreadH` is hundredths of a pip from `spread_pips numeric(10,2)`. 0.20 EURUSD → 2, 0.15 → 2, XAU 2.00 → 20, BTC 10.00 → 1000. |
| | `grossCents(sym, dir, entryPts, exitPts, steps)` | Prototype 28-41. `toUsd 'base'` (USDJPY) divides by `exitPts`. |
| | `commissionCents(sym, cplCents, steps)` | `roundDiv(cplCents × steps, 10^lotDigits)`. Round-turn, rounded once. Takes **cents** (the prototype took dollars). |
| | `rrHundredths(entryPts, slPts, tpPts)` | `roundDiv(abs(tp−entry)·100, abs(entry−sl))`. `null` if either level is missing or the risk is 0. Same as `calc_trade_pnl` (`db/fn_calc_trade_pnl.sql:9-26`). |
| fills | `marketFill(dir, bid, sp)`, `closeFill(dir, bid, sp)` | Open LONG at ask, open SHORT at bid. Close LONG at bid, close SHORT at ask (D4). |
| | `exitOnBar(pos, bar, sp)` | `null` or `{reason:'sl'|'tp', pts, ambiguous}`. Lower-case reasons are the DB values (D3). Rules in §3.4. |
| state | `createState({sym, startCents, spreadPts, cplCents})` | `{sym, sp, startCents, cplCents, open:[], closed:[], realizedCents:0, quote:null}` |
| | `setQuote(st, bar)` / `quote(st)` | Copies `t` and `bid = bar[4]` (it never keeps the bar array, which the controller reuses). `quote` returns `{t, bid, ask}`. |
| | `restore(st, rows)` | DB rows (any order) become open positions and closed trades. Missing `gross_pnl` is rebuilt as `pnl + commission` (swap is 0). |
| | `validateOrder(st, o)` | `{ok}` or `{ok:false, code, field}`. Codes: `NO_QUOTE`, `LOT_RANGE`, `PRICE`, `SL_LONG`, `TP_LONG`, `SL_SHORT`, `TP_SHORT`, `MAX_POSITIONS` (20), `NO_EQUITY` (§4.2). |
| | `openPosition(st, {id, dir, steps, sl, tp})` | Validates, fills at the current quote and returns `Position` (§3.5). Throws `Error` with `.code`. |
| | `validateModify(st, id, sl, tp)` / `modifyPosition(...)` | Checks against the live quote (§4.2). Changes `sl`/`tp` only; `sl0`/`tp0`/`rr` stay. |
| | `closePosition(st, id)` | Manual close at the current quote. Returns `Trade`. |
| | `onBar(st, bar)` | Processes one newly revealed 1m bar: TP/SL for positions opened before it, then `setQuote`. Returns the closed `Trade[]`. |
| | `floating(st)` | `{ total, byId: {id: {mark, gross, net}} }` |
| | `summary(st)` | `{startCents, realizedCents, balanceCents, floatingCents, equityCents, closedCount, openCount, wins, losses, breakeven, ambiguous, commissionCents, maxDdCents, maxDdBp}`. DD is measured on the closed-trade balance curve from `startCents`. |
| | `preview(st, {dir, steps, sl, tp})` | `{entry, riskCents (gross loss to SL + commission), rewardCents (gross to TP − commission), rr}` for the order hint. |
| DB mapping | `accountFromRow(row)` | `{id, userId, journalId, name, symbol, tf, startCents, spreadH, cplCents, replaySec, isActive, createdAt, updatedAt}` |
| | `accountInsertRow(a)` / `accountPatch(fields)` | Decimal strings (`starting_balance '10000.00'`, `spread_pips '0.20'`, `commission_per_lot '7.00'`) and ISO `replay_time`. |
| | `tradeInsertRow(st, pos, ctx)` | `{id, user_id, backtest_account_id, symbol, direction 'LONG'/'SHORT', lot, entry_price, stop_loss, take_profit, entry_time, commission, rr_ratio}` as strings, plus `initial_*` if O2 is approved. |
| | `tradeClosePatch(st, trade, opts)` | `{exit_price, exit_time, exit_reason, pnl}`, plus `gross_pnl, exit_ambiguous` when `opts.extraColumns` (D3 owner decision). |
| | `tradeModifyPatch(st, pos)` | `{stop_loss, take_profit}` |
| | `metricsRow(st, trade)` | `{exit_price, pnl, trade_date: exit ISO, rr_ratio, entry_price, lot, direction}` for `WwMetrics.summarize` (conventions §12; `trade-metrics.js:167-195`). |

`Position` = `{id, dir (+1/−1), steps, entry, entryT, entryBarT, sl, tp, sl0, tp0, comm, rr, unsaved?}`
`Trade` = `Position` plus `{exit, exitT, exitBarT, reason, ambiguous, gross, net}`

Time fields:
- `entryT = quote.t + 60`, the DB `entry_time` (D4).
- `entryBarT = quote.t`, the bar the order was placed on. TP/SL checks start after it.
- TP/SL exits: `exitT = exitBarT = trigger bar open`.
- Manual exits: `exitT = quote.t + 60`, `exitBarT = quote.t`.

After a reload, `exitBarT` is rebuilt as `exit_reason === 'manual' ? exit_time − 60 : exit_time`.

### 2.4 `bt-data.js`: the interface this page needs (data track designs the implementation)
```js
window.WwBtData = {
  // one source per page visit; the cache behind it is shared per tab
  createArchiveSource(opts /* { sb: window.sb, bucket: 'candles' } */) -> CandleSource
};
CandleSource = {
  kind: 'archive',                                   // R46 later: 'live'
  provider(symbolId) -> 'Dukascopy' | 'Binance',      // display name (brand, not translated)
  label(symbolId) -> string,                          // i18n.t('backtest.source.archive', {provider}) → "Arşiv · Dukascopy"
  coverage(symbolId) -> Promise<{
    symbol, firstT, lastT,                            // first/last 1m bar open (UTC s) in the archive
    months: ['2020-01', …],                           // present months, ascending
    partial: ['2026-10'],                             // months still growing (current month)
    updatedAt                                         // manifest timestamp
  }>,                                                 // reads manifest.json once per session
  getMonth(symbolId, 'YYYY-MM', { signal }) -> Promise<Rows>,
       // Rows = [[t, o, h, l, c], …] ascending, t = UTC epoch s (bar open),
       // prices = numbers rounded to the symbol digits (D7 month file `rows`)
       // rejects Error{code: 'NOT_FOUND' | 'AUTH' | 'NETWORK' | 'CORRUPT' | 'ABORTED'}
  prefetch(symbolId, 'YYYY-MM') -> void,              // best effort, never rejects (next month near its end)
  isCached(symbolId, 'YYYY-MM') -> boolean            // memory LRU hit, sync
};
```
Constraints the page relies on. The data track must confirm them; each is also an open issue in §9.
1. **Storage.** Never use `localStorage`/`sessionStorage` for candle data.
   - Size is one reason.
   - The other is `page-transition.js:35-50`: it fingerprints both stores, and every change makes the bfcache reload the page.
2. **Persistent cache location.** Not in Cache Storage under a separate name: `sw.js:13-21` deletes every cache except `CACHE_VERSION` on each SW update. Use IndexedDB (D7 allows either, wrapped in try/catch).
3. **Freshness.** A `partial` month is never served from a persistent copy older than `coverage.updatedAt`. Past months are immutable.
4. **De-duplication.** Duplicate `getMonth` calls share one in-flight promise. `signal` aborts only that caller's wait.
5. **Immutability.** Returned rows are shared and the page never mutates them; it converts them with `WwBtCandles.toMinutes`.
6. **Label text.** `backtest.source.archive` = `Arşiv · {provider}` / `Archive · {provider}` / `Archiv · {provider}`. Tooltip keys are `backtest.source.title_dukascopy` and `backtest.source.title_binance` (§5).

### 2.5 `backtest.js`: page controller (`data-page-script`)
One IIFE, `'use strict'`, `var` only (no top-level `const`/`let`/`class`: it re-runs per visit, `SpaRouter.astro:340-349`). It starts with `var PAGE = window.wwPage.current();` (`BaseHead.astro:52-113`).

#### 2.5.1 Constants, helpers, state
```js
var S, C, E;                                     // WwBtSymbols, WwBtCandles, WwBtEngine (bound after boot polling)
var SPEEDS = [0.1, 0.3, 0.5, 1, 3, 10], SPEED_DEFAULT = 1;      // chart candles per second
var MAX_BARS_PER_FRAME = 3000, SAVE_EVERY_MS = 5000, LIVE_UI_MS = 100;   // live UI ≤ 10 Hz
var PREFETCH_AHEAD_SEC = 2 * 86400;              // prefetch next month within 2 days of the loaded end (D7)
var MAX_CHART_CANDLES = 25000, TRIM_TO = 20000, MAX_MARKER_TRADES = 300, MAX_HISTORY_ROWS = 200;
var BOOT_POLL_MS = 50, BOOT_MAX_TRIES = 160;     // dashboard.js:3318-3352
var RETRY_BACKOFF = [1000, 3000, 10000];
var FREE_LIMIT = 1, PREMIUM_LIMIT = 10;          // R13; the DB trigger is authoritative
var EXTRA_COLUMNS = true;                        // gross_pnl + exit_ambiguous exist (D3 owner decision); false → omit
var INITIAL_LEVEL_COLUMNS = false;               // owner decision O2
var SPEED_KEY = 'ww_bt_speed';                   // localStorage, try/catch

function _t(key, fb, params) { /* i18n.t; if it returns the key, use fb (Turkish), then fill {params} */ }
function toast(msg, type) { if (typeof window.showToast === 'function') window.showToast(msg, type); else wwLog.log(msg); } // dashboard.js:205-211
function lang() { try { return window.i18n.getCurrentLanguage(); } catch (e) { return 'tr'; } }
function localeTag() { return { tr: 'tr-TR', de: 'de-DE' }[lang()] || 'en-US'; }            // time-settings.js:311-313
function newId() { return crypto.randomUUID ? crypto.randomUUID() : uuid4FromGetRandomValues(); }
```
State: `L` is the list view and `R` is the replay, which is `null` outside replay.
```js
var L = { user: null, plan: 'free', accounts: [], summaries: {}, journals: [], src: null, cov: {} };
R = {
  acc, sym, scale /*10^digits*/, tfId, tfMin, speed,
  cov,                                     // coverage of acc.symbol
  win /*Minutes*/, winMonths: [], k,      // 1m window + cursor index (last revealed bar)
  candles: [], builder,                   // current-TF candles (history + window ≤ k); builder shares the array
  histMonths: [],                         // months aggregated as history for the current TF
  eng,                                    // WwBtEngine state
  token: 0,                               // bumped by every reload/goTo/TF switch/close; stale async work stops
  playing: false, rafId: 0, lastTs: null, accum: 0, buffering: false, busy: false,
  loadingNext: null,                      // Promise while the next month loads
  nextState: null,                        // what lies AFTER the loaded window: null | {kind:'missing', month, next} | {kind:'end'} | {kind:'error', err}
                                          // (set by loadNext; shown only when the cursor actually reaches the window end)
  dirtyFrom: -1, closedQueue: [], gap: null,
  chart, series, askLine, lines: {},      // lines[posId] = {entry, sl, tp}
  dirty: false, lastSavedReplaySec: null, lastSaveAt: 0, lastLiveAt: 0,
  abort: new AbortController()
};
```

#### 2.5.2 Boot sequence (conventions §1/§4; `dashboard.js:3318-3375`)
```js
var tries = 0;
function start() {
  if (!PAGE.alive) return;
  var ok = window.LightweightCharts && window.sb && typeof window.requireAuth === 'function' && window.journal
        && window.WwBtSymbols && window.WwBtCandles && window.WwBtEngine && window.WwBtData && window.WwTime && window.WwChart;
  if (!ok) { if (++tries >= BOOT_MAX_TRIES) return setPageState('fatal'); bootTimer = setTimeout(start, BOOT_POLL_MS); return; }
  S = window.WwBtSymbols; C = window.WwBtCandles; E = window.WwBtEngine;
  init();
}
async function init() {
  bindStaticUi();                                      // element listeners only; window/document listeners via PAGE.on
  var user = await requireAuth();                      // public/src/core/supabase.js:78-139
  if (!PAGE.alive || !user) return;                    // requireAuth already redirected
  if (user.id === 'demo-user-id') return setPageState('demo');   // ?test=1 fake user: never read or write (supabase.js:109-111)
  L.user = user;
  await window.journal.ensureActiveJournal(user.id);   // journal.js:91-121 (navbar consistency)
  if (!PAGE.alive) return;
  L.src = window.WwBtData.createArchiveSource({ sb: window.sb, bucket: 'candles' });
  setupThemeObserver(); setupI18n(); setupKeyboard(); setupVisibility();
  var ok = await loadList();                           // reads only
  if (!PAGE.alive || !ok) return;
  var deep = new URLSearchParams(location.search).get('account');
  if (deep && findAccount(deep)) { await whenActivated(); if (PAGE.alive) openAccount(deep); }
  else showList();
}
function whenActivated() {                             // speculation-rules prerender (page-transition.js:96-140): no heavy downloads, no writes
  return document.prerendering ? new Promise(function (r) { document.addEventListener('prerenderingchange', r, { once: true }); }) : Promise.resolve();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
```
- **Prerender.** The boot never writes. The first write is always a user action (create, order, play/step). Opening an account also waits for `whenActivated()`.
- **`PAGE.alive` checks.** After every `await`, check `PAGE.alive`, and in replay code also `tok === R.token`.

#### 2.5.3 Page state machine
`#bt-root[data-state]` is `boot | list | replay | demo | fatal`. Replay sub-state `#bt-view-replay[data-replay]` is `loading | ready | playing | buffering | missing | end | error`.

| From | Event | To | Effect |
|---|---|---|---|
| boot | dependencies missing after 8 s | fatal | show `#bt-fatal` |
| boot | demo user | demo | show `#bt-demo` |
| boot | list loaded | list, or replay via `?account=` | render cards; `history.replaceState(history.state, '', url)` keeps Astro's state object |
| list | card click/Enter, or create success | replay(loading) | `openAccount(id)` |
| replay | Back button | list | `closeReplay()`, refresh summaries, drop `?account` |
| replay | account deleted | list | `closeReplay()`, remove the card |
| loading | window loaded | ready | chart rendered, then history loads in the background |
| ready | Play | playing | RAF loop (§3.2) |
| playing | Pause, modal opened, tab hidden, Step, go-to, TF change | ready | flush replay_time |
| playing | cursor at loaded end, next month present | buffering | `loadNext()` → playing |
| playing/step | next month absent but a later one present | missing | banner + "Skip to {month}" |
| playing/step | no later month | end | banner `data.end_reached`; trading stays allowed at the last price |
| any | `getMonth` NETWORK/CORRUPT | error | banner + Retry |
| any | `getMonth` AUTH | error | banner `data.session_expired` + link `login.html` |

#### 2.5.4 Account CRUD through `window.sb` (RLS: `user_id = auth.uid() OR is_admin()`, D3)
Every read filters `user_id` explicitly. RLS also lets admins see every user's rows, so without the filter an admin would see everyone's accounts (conventions §6; `dashboard.js:3084-3123`).
```js
var ACC_COLS = 'id,user_id,journal_id,name,symbol,timeframe,starting_balance,spread_pips,commission_per_lot,replay_time,is_active,created_at,updated_at';
sb.from('backtest_accounts').select(ACC_COLS).eq('user_id', uid).eq('is_active', true).order('updated_at', { ascending: false });
// per-account summaries (paged by 1000, ordered by id for stable paging):
sb.from('backtest_account_trades').select('backtest_account_id,pnl,exit_time').eq('user_id', uid).order('id').range(from, from + 999);
//   → per account {closed: count(exit_time != null), open: count(exit_time == null), realizedCents: Σ toCents(pnl)}
sb.from('backtest_accounts').insert(E.accountInsertRow(a)).select(ACC_COLS).single();
sb.from('backtest_accounts').update(patch).eq('id', id).eq('user_id', uid).select(ACC_COLS).single();
sb.from('backtest_accounts').delete().eq('id', id).eq('user_id', uid);    // trades cascade (D3); Stage 5 trigger cleans mirrors
sb.from('backtest_account_trades').select('*').eq('user_id', uid).eq('backtest_account_id', id)
  .order('entry_time', { ascending: true }).order('id').range(from, from + 999);   // loop until < 1000 rows
```
**Journals.** `window.journal.listJournals()` (`journal.js:59-89`; it returns `id, name, color, is_default …`, `db/fn_list_journals.sql:2`) fills `#bt-f-journal` and the card's journal name.

**Create** (§4.1 validation first):
1. `await src.coverage(symbol)` gives the bounds.
2. Insert with `replay_time = nextOpen(X) + 60 s` (X is the chosen start in the user's time zone).
3. `openAccount(id, { startAt: X })` puts the cursor with go-to semantics (`first bar ≥ nextOpen(X)`, D4) and saves `replay_time` right away. This is a user action, so a write is allowed.

**Edit:**
- Fields are name, spread, commission and journal (D8).
- Symbol and starting balance are read-only after creation (hints `field.symbol_locked`, and the balance input disabled when the account has trades). Timeframe changes from the toolbar.
- Spread is disabled while positions are open (`field.locked_open_positions`): there is no per-trade spread snapshot column, and a spread change would move open SHORT exits.
- Commission is always editable: each trade snapshots its own round-turn commission at insert (§3.5).

**Delete:** the confirm modal shows `delete.message` with the trade count from the summaries. `delete.journal_note` appears only when `journal_id` is set and `window.WwBtSync` exists (Stage 5).

**Quota** (R13; no lock icons):
- The plan comes from `window.getUserPlanSilent()` (`user.js:86-130`, no toast; exported at `script.js:199`). The limit is `premium ? 10 : 1`.
- Chip text: `quota` plus `plan_free|plan_premium`.
- When `active ≥ limit`, `#bt-new-account-btn` stays a normal button. Clicking it:
  - free: `toast(quota.free_reached, 'info')`, then `window.openUpgradeModal({ feature: 'backtest' })` (`UpgradeModal.astro:811-827`). This feature has no notice text today, so the default text appears (`UpgradeModal.astro:771-793`); see owner decision O6.
  - premium: `toast(quota.premium_reached, 'warning')`.
- When the plan is free but `active > 1` (a downgraded user), show `#bt-quota-note`. Existing accounts keep working, because the DB checks the quota only on insert or reactivation (D3).
- A DB error containing the quota code behaves the same way (§4.5).

#### 2.5.5 Replay control (details in §3)
`openAccount(id, opts)`, `closeReplay()`, `placeCursor(targetSec, mode)`, `loadHistory(tok)`, `loadNext(tok)`, `maybePrefetch()`, `maybeTrim()`, `play()`, `pause()`, `tick(ts)`, `advance1()`, `afterFrame()`, `stepCandle()`, `stepMinute()`, `goTo(ms)`, `setTimeframe(tfId)`, `setSpeed(v)`, `submitOrder(dir)`, `closePos(id)`, `openEditPos(id)`, `submitEditPos()`, `handleClosed(trades)`, `buildChart()`, `destroyChart()`, `rebuildChart()`, `renderChartData()`, `flushChart()`, `rebuildMarkers()`, `syncPriceLines()`, `updateAskLine()`, `renderLegend(param)`, `renderClock()`, `renderLive(force)`, `renderTables()`, `renderStats()`.

`openAccount`:
1. Read the account and its trades, then `E.createState` and `E.restore`.
2. `R.cov = await src.coverage(sym)`.
3. Safety: `replaySec = max(acc.replay_time, max(open.entryT), max(closed: manual ? exitT : exitT + 60))`. A persisted trade can then never sit "in the future". This covers a crash after a close write but before the `replay_time` write.
4. `placeCursor(replaySec, 'resume')`, or `goto` for `opts.startAt`.
5. Show the source label, set `#bt-tf`, run the Stage 5 hook.

#### 2.5.6 Persistence (write queue + replay_time debounce)
- **One sequential FIFO for all writes.** Per-trade order (insert before close) is guaranteed. A `replay_time` (or `timeframe`) job replaces a pending, not-yet-running job with the same key, so a stale time is never written after a newer one.
- **Retries.** Retry only "transient" errors: no `code` or status (`TypeError: Failed to fetch`), HTTP ≥ 500, 408 or 429. Back off 1 s, 3 s, 10 s.
  - The first transient failure shows `err.save_failed` once.
  - The final failure shows `#bt-save-banner` with Retry, pauses playback, and marks the position `unsaved` (badge `pos.unsaved`).
- **Treated as success.** `23505` on a trade insert means the earlier attempt landed.
- **Leaving the page.** On `PAGE.onLeave`, the queue drops its back-off timers and makes one immediate attempt per pending job (fire and forget, no DOM). Pending writes still land, and no timer outlives the page (R26).
- **`replay_time` saves.**
  - While playing: every `SAVE_EVERY_MS`, checked in `afterFrame`.
  - Immediately on pause, step, go-to, TF change, order/close/modify, account switch, `visibilitychange` (hidden), `pagehide` and `PAGE.onLeave` (D4).
  - Only when the value differs from the last successful save.
- **DB write contract.** This is everything the client writes. The immutable columns of the DB track's `trg_check_backtest_trade` (D3) must allow these and nothing else.

| Operation | Columns written | Guard |
|---|---|---|
| create account | `user_id, journal_id, name, symbol, timeframe, starting_balance, spread_pips, commission_per_lot, replay_time` | quota and journal-ownership trigger |
| edit account | `name, journal_id, spread_pips, commission_per_lot` | — |
| toolbar | `timeframe` (coalesced) and `replay_time` (debounced) | — |
| delete account | — | cascade |
| open position | `id` (client UUID), `user_id, backtest_account_id, symbol, direction, lot, entry_price, stop_loss, take_profit, entry_time, commission, rr_ratio` (+ `initial_stop_loss, initial_take_profit` if O2) | exit_*/pnl NULL (D3 consistency CHECK) |
| modify position | `stop_loss, take_profit` | `.is('exit_time', null)` |
| close position | `exit_price, exit_time, exit_reason, pnl` (+ `gross_pnl, exit_ambiguous`) | `.is('exit_time', null).select('id')`; 0 rows means it was closed elsewhere (`err.closed_elsewhere`) and the trades reload |

Never updated: `user_id, backtest_account_id, symbol, direction, lot, entry_price, entry_time, commission, rr_ratio`, or any column of a closed row.

#### 2.5.7 Lifecycle: `PAGE.onLeave`, theme, resize, i18n, keyboard, visibility
`PAGE.onLeave` registers a single `cleanup()`, which runs once. `PAGE` runs cleanups in reverse order (`BaseHead.astro:92-100`). In order:
1. `pause()`: `cancelAnimationFrame(R.rafId)`, `R.playing = false`.
2. `clearTimeout(bootTimer)`. Clear the chip, gap-note and debounce timers, and the queue's back-off timers (each one is tracked in `TIMERS`).
3. Flush `replay_time` if it is dirty (fire and forget through the queue's leave mode).
4. `R.abort.abort()` aborts `getMonth` waits and bumps `R.token`, so late promises return early.
5. `themeObserver.disconnect()`, plus the fallback `ResizeObserver` if one was created.
6. Price lines are not removed one by one: `chart.remove()` disposes the series, lines, markers and LWC's internal autoSize observer.
7. `if (window.WwChartViewer) WwChartViewer.close()`. It is not opened in v1 (O8) but this is harmless (`dashboard.js:3322-3325`).
8. Modals live in the page slot, which SpaRouter removes. Nothing is ever appended to `document.body`: the legend and the hover card live inside `.bt-chart-wrap`.
9. Set `R = null` and drop the `L` arrays so typed arrays are garbage-collected. The bt-data LRU keeps what its own policy keeps.

Window and document listeners are added only through `PAGE.on`, so they are removed automatically (`BaseHead.astro:65-69`): `keydown`, `visibilitychange`, `pagehide`, the resize fallback.

| Concern | Rule |
|---|---|
| Theme | A `MutationObserver` on `body.class`. When `light-theme` really changes, call `rebuildChart()`: keep the visible logical range, `chart.remove()`, recreate it with fresh `WwChart.lwc()` and `WwChart.colors()`, then reapply data, markers, lines and range. Same pattern as `dashboard.js:3183-3195,351-367`. Charts are built only after `await requireAuth()`, when `body.light-theme` is already set (`BaseHead.astro:276-293`; `chart-theme.js:13-16`). |
| Resize | `autoSize: true` (LWC 4.1.3 `typings.d.ts:739-749`). The container gets its height from CSS. If `chart.autoSizeActive()` is false (`typings.d.ts:1422`), fall back to `PAGE.on(window,'resize')` with an 80 ms debounce and `applyOptions({width,height})` (`dashboard.js:424-494`). |
| i18n | `PAGE.onI18nChange(fn)` (`BaseHead.astro:78-91`). Inside it, `requestAnimationFrame` (`dashboard.js:3295-3303`) re-renders cards, quota, tables, stats, clock, legend, source label and modal hints. Then `chart.applyOptions({ localization: {locale, timeFormatter}, timeScale: {tickMarkFormatter} })` and `rebuildMarkers()` (marker texts are localized). Static `[data-i18n]` nodes are handled by `i18n.setLanguage` → `apply()`. |
| Keyboard | `PAGE.on(document,'keydown')`. Ignored when the target is an input, select or textarea, or when any `.bt-modal.active` is open. Space = play/pause, → = step one candle, Shift+→ = step one minute, Esc = close the open modal. |
| Visibility | On `document.hidden`: `pause()` and flush (RAF would stop anyway; this makes the user come back to a paused state). On `pagehide`: flush. |
| Modals | Opening any modal pauses playback. They close on backdrop click (`e.target === overlay`, `dashboard.js:2823-2825`), ✕, Cancel or Esc. Focus moves to the first field and returns to the opener on close. |

#### 2.5.8 Stage 5 hooks (no-ops in Stage 4)
```js
var SYNC = window.WwBtSync || null;                   // bt-sync.js is not loaded in Stage 4
function hook(name, payload) { if (!SYNC || typeof SYNC[name] !== 'function') return;
  try { Promise.resolve(SYNC[name](payload)).catch(function (e) { wwLog.warn('[bt] sync', e); }); } catch (e) { wwLog.warn('[bt] sync', e); } }
// after the close write succeeded:      hook('onTradeClosed',   { sb, userId, account, trade: closedRow })
// after entering an account:            hook('onAccountEntered', { sb, userId, account, trades })
// after journal_id changed in settings: hook('onJournalChanged', { sb, userId, account, oldJournalId })
```
`#bt-f-journal-hint` shows `field.journal_hint` when `SYNC` exists and `field.journal_hint_pending` otherwise (owner decision O4).

---

## 3. Pseudo-code for the hard parts

### 3.1 Placing the cursor and the month window (resume, go-to, start)
The window is the 1m data of the cursor month, plus the next month once prefetched (at most two months). Older months are aggregated history only: they live in `R.candles`, and their 1m arrays are dropped. Rules:
- **Future never visible.** The chart and the engine only ever receive bars `0..k`. Bars after `k` are read only to find bucket ends (`stepTarget`), never drawn.
- **Closed sessions skipped.** The cursor moves over existing 1m bars only, so weekends, the gold 17–18 break, holidays and missing minutes cost no time (D4).
- **Known limit (§9 I-7).** Month files arrive whole (R41), so future rows sit in browser memory. The rule is enforced in the UI, not against devtools.
```js
async function placeCursor(targetSec, mode /* 'resume' | 'goto' */) {
  var tok = ++R.token; pause(); setReplay('loading'); overlay('backtest.chart.loading');
  resetLoads();                                         // R.loadingNext = null; R.nextState = null; R.buffering = false; hideDataBanner()
  var cov = R.cov, id = R.sym.id;
  var want = mode === 'goto'
    ? Math.floor((S.nextOpen(targetSec * 1000, id) || cov.lastT * 1000) / 1000)   // D4: nextOpen, then first bar ≥
    : targetSec - 60;                                                             // resume: last bar with t ≤ replay−60
  want = Math.min(Math.max(want, cov.firstT), cov.lastT);
  var key = nearestPresent(cov.months, C.monthKey(want), mode === 'goto' ? +1 : -1);
  var m = await monthMinutes(key, tok); if (stale(tok)) return;
  var k = mode === 'goto' ? C.indexAtOrAfter(m, want) : C.indexAtOrBefore(m, want);
  if (mode === 'goto' && k >= m.n) {                    // target after this month's last bar
    var nk = nextPresent(cov.months, key);
    if (nk) { m = await monthMinutes(nk, tok); if (stale(tok)) return; key = nk; k = 0; } else k = m.n - 1;
  }
  if (mode === 'resume' && k < 0) {                     // e.g. replay time on the weekend that opens a month
    var pk = prevPresent(cov.months, key);
    if (pk) { var pm = await monthMinutes(pk, tok); if (stale(tok)) return; m = C.concatMinutes(pm, m); k = pm.n - 1; R.winMonths = [pk, key]; }
    else { k = 0; R.winMonths = [key]; }
  } else R.winMonths = [key];
  R.win = m; R.k = k;
  E.setQuote(R.eng, barAt(k));
  R.candles = C.aggregate(m, R.tfMin, id, 0, k);       // partial last candle = 1m bars ≤ k of its bucket
  R.builder = C.createBuilder(R.tfMin, id, R.candles);
  renderChartData(); rebuildMarkers(); syncPriceLines(); renderLive(true); renderTables(); renderStats();
  hideOverlay(); setReplay('ready');
  loadHistory(tok);                                     // background: never blocks trading
  maybePrefetch();
}
async function monthMinutes(key, tok) {                 // NOT_FOUND → null (handled by callers via coverage)
  var rows = await R.src.getMonth(R.sym.id, key, { signal: R.abort.signal });
  if (stale(tok)) return null;
  return C.toMinutes(rows, R.sym.digits);
}
async function loadHistory(tok) {
  var first = R.winMonths[0], need = C.historyMonths(R.tfMin), keys = [];
  for (var i = 1; i <= need; i++) { var k2 = C.addMonths(first, -i); if (R.cov.months.indexOf(k2) >= 0) keys.unshift(k2); }
  var hist = [];
  for (var j = 0; j < keys.length; j++) {               // sequential: bounded memory; overlay shows loading_n {done}/{total}
    var mm = await monthMinutes(keys[j], tok); if (stale(tok) || !mm) return;
    hist = C.merge(hist, C.aggregate(mm, R.tfMin, R.sym.id));   // merge joins month-crossing D1/H4 buckets
  }
  var before = R.candles.length, range = R.chart.timeScale().getVisibleLogicalRange();
  R.candles = C.merge(hist, R.candles);                 // a month-crossing boundary bucket merges into ONE candle,
  var added = R.candles.length - before;                // so count what was really prepended (not hist.length)
  R.builder = C.createBuilder(R.tfMin, R.sym.id, R.candles); R.histMonths = keys;
  renderChartData();
  if (range) R.chart.timeScale().setVisibleLogicalRange({ from: range.from + added, to: range.to + added });  // keep the right edge
  rebuildMarkers();
}
// nearestPresent(months, key, dir): key if present, else the closest present month in direction dir (then the other one);
// nextPresent(months, key) / prevPresent(months, key): closest present month strictly after / before key, or null.
// stale(tok) = !PAGE.alive || !R || tok !== R.token.   barAt(k) = [win.t[k], win.o[k], win.h[k], win.l[k], win.c[k]].
function maybePrefetch() {                              // D7: next month near its end
  if (R.nextState || R.loadingNext) return;             // already known what follows (or loading)
  var lastT = R.win.t[R.win.n - 1];
  if (lastT - R.win.t[R.k] < PREFETCH_AHEAD_SEC) loadNext(R.token);
}
function loadNext(tok) {                                // appends the next month; k is unchanged
  if (R.loadingNext) return R.loadingNext;
  if (R.nextState) return Promise.resolve(false);
  var lastKey = R.winMonths[R.winMonths.length - 1], nk = C.nextMonth(lastKey);
  if (R.cov.months.indexOf(nk) < 0) {                   // absent: missing month or end of archive
    var later = nextPresent(R.cov.months, lastKey);
    R.nextState = later ? { kind: 'missing', month: nk, next: later } : { kind: 'end' };
    return Promise.resolve(false);                      // NOT shown yet: the cursor may still have bars left
  }
  R.loadingNext = monthMinutes(nk, tok).then(function (m) {
    R.loadingNext = null; if (stale(tok) || !m) return false;
    R.win = C.concatMinutes(R.win, m); R.winMonths.push(nk); return true;
  }, function (e) { R.loadingNext = null; if (!stale(tok)) R.nextState = { kind: 'error', err: e }; return false; });
  return R.loadingNext;
}
async function skipMissing() {                          // banner button "Skip to {month}"
  var ns = R.nextState; if (!ns || ns.kind !== 'missing') return;
  var tok = R.token, m = await monthMinutes(ns.next, tok); if (stale(tok) || !m) return;
  R.win = C.concatMinutes(R.win, m); R.winMonths.push(ns.next); R.nextState = null; hideDataBanner();
  stepMinute();                                         // reveals the first bar of that month THROUGH the engine,
}                                                       // so open positions get the normal gap rules (§3.4)
function retryNext() { R.nextState = null; hideDataBanner(); stepMinute(); }   // banner "Retry" after kind 'error'
function maybeTrim() {                                  // once the cursor is inside the 2nd month, drop the 1st month's 1m data
  if (R.winMonths.length < 2) return;
  var firstLen = C.indexAtOrAfter(R.win, C.monthStart(R.winMonths[1]));
  if (R.k >= firstLen) { R.win = C.sliceMinutes(R.win, firstLen); R.k -= firstLen; R.winMonths.shift(); }  // R.candles untouched
}
```
**Missing month.** When the cursor reaches the window end and `R.nextState.kind === 'missing'`, the banner `data.month_missing` appears with the button `data.skip_to` (`skipMissing()`). The later month is appended and its first bar is revealed through `advance1()`, so open positions see it with the normal gap rules (§3.4), like a weekend. `placeCursor` is deliberately not used here: it would place the quote without passing the bar through the engine.

**End.** When the cursor reaches the window end and `R.nextState.kind === 'end'`, the banner `data.end_reached {time = cov.lastT}` appears. Play and Step are disabled. Orders and closes stay allowed at the last price.

**Error.** For `kind: 'error'`, the banner shows `data.load_failed` with a Retry button (`retryNext()`).

**Reset.** `placeCursor`, `setTimeframe` and `skipMissing` reset `R.nextState`.

### 3.2 Cursor advance, frame and play loop (RAF accumulator)
```js
var BAR = [0, 0, 0, 0, 0];                       // reused; the engine copies what it keeps
function advance1() {                            // reveal bar k+1; caller guarantees k+1 < win.n
  var W = R.win, k = ++R.k;
  BAR[0] = W.t[k]; BAR[1] = W.o[k]; BAR[2] = W.h[k]; BAR[3] = W.l[k]; BAR[4] = W.c[k];
  var closed = E.onBar(R.eng, BAR);              // 1) TP/SL on this 1m bar (bar magnifier), then quote = bar
  var idx = R.builder.push(BAR[0], BAR[1], BAR[2], BAR[3], BAR[4]);   // 2) HTF candle forms from 1m
  if (R.dirtyFrom < 0 || idx < R.dirtyFrom) R.dirtyFrom = idx;
  if (closed.length) Array.prototype.push.apply(R.closedQueue, closed);
  if (k > 0 && BAR[0] - W.t[k - 1] > 60) R.gap = C.gapKind(W.t[k - 1], BAR[0], R.sym.id);
  R.dirty = true;
}
function play() {
  if (!R || R.playing || R.busy) return;
  if (R.k + 1 >= R.win.n && R.nextState) return showDataBanner(R.nextState);   // nothing left to play
  R.playing = true; R.lastTs = null; R.accum = 0; setPlayUi(true); setReplay('playing');
  R.rafId = requestAnimationFrame(tick);
}
function pause() {
  if (!R) return;
  if (R.rafId) cancelAnimationFrame(R.rafId); R.rafId = 0;
  if (R.playing) { R.playing = false; setPlayUi(false); setReplay('ready'); saveReplayTime(true); }
}
function tick(ts) {
  R && (R.rafId = 0);
  if (!PAGE.alive || !R || !R.playing) return;
  var dt = R.lastTs === null ? 16 : ts - R.lastTs; R.lastTs = ts;
  var plan = C.framePlan(R.accum, dt, R.speed, R.tfMin, MAX_BARS_PER_FRAME);   // dt clamped to 250 ms inside
  R.accum = plan.acc;
  for (var i = 0; i < plan.n; i++) {
    if (R.k + 1 >= R.win.n) { needMore(); break; }
    advance1();
  }
  afterFrame();
  if (R.playing && !R.buffering) R.rafId = requestAnimationFrame(tick);
}
function needMore() {
  if (R.buffering) return;                         // exactly one waiter, otherwise pause→play during buffering
  var tok = R.token; R.buffering = true;           // would attach a 2nd handler and start a 2nd RAF loop
  setReplay('buffering'); overlay('backtest.chart.buffering', /*soft*/ true);
  loadNext(tok).then(function (ok) {
    if (!PAGE.alive || stale(tok)) return;         // resetLoads() already cleared buffering
    R.buffering = false; hideOverlay();
    if (!ok) { pause(); showDataBanner(R.nextState); return; }     // cursor IS at the window end here
    if (R.playing && !R.rafId) { R.lastTs = null; R.rafId = requestAnimationFrame(tick); }
  });
}
function afterFrame() {
  flushChart();                                   // §3.6
  if (R.closedQueue.length) handleClosed(R.closedQueue.splice(0));
  updateAskLine();
  var now = performance.now();
  if (now - R.lastLiveAt >= LIVE_UI_MS) { R.lastLiveAt = now; renderLive(false); }   // prices, floating, equity, clock
  if (R.gap) { showGapChip(R.gap); R.gap = null; }   // "Piyasa kapalı: 2g 0s atlandı" / "Veri boşluğu: 14 dk"
  maybeTrim(); maybePrefetch();
  if (R.dirty && now - R.lastSaveAt >= SAVE_EVERY_MS) saveReplayTime(false);
}
```
- **Speed.** Chart candles per second, from the options `0.1×, 0.3×, 0.5×, 1× (default), 3×, 10×`. Play advances `speed × tfMin` 1m bars per second, so an H4 candle at 1× grows from 240 one-minute steps within about one second (R23).
- **Hidden tabs.** RAF does not run in hidden tabs. The 250 ms `dt` clamp stops a jump when the tab becomes visible again; the visibility handler also pauses (§2.5.7).
- **Cost.** At most 3,000 bars per frame. Each bar does `onBar` over ≤ 20 positions plus one `builder.push`, and `bucketStart` for H4/D1 uses the per-hour cached `dayAnchor`. The aggregation research measured 31,860 bars at about 30–40 ms for four timeframes (`symbols_readable.md` "AGGREGATION").

### 3.3 Step one candle, step one minute, go-to-date, timeframe switch
```js
async function stepCandle() {
  if (!R || R.busy) return;
  pause(); R.busy = true; var tok = R.token;
  try {
    for (;;) {
      var st = C.stepTarget(R.win, R.k, R.tfMin, R.sym.id);
      if (!st.open) break;                         // bucket end known
      var more = await loadNext(tok);               // bucket may continue in the next month (FX D1 crosses months)
      if (stale(tok)) return;
      if (!more) break;                             // end of data/missing: complete as far as data goes
    }
    st = C.stepTarget(R.win, R.k, R.tfMin, R.sym.id);
    if (st.j === R.k) { showDataBanner(R.nextState); return; }    // cursor at the window end, nothing after it
    while (R.k < st.j) advance1();
    afterFrame(); saveReplayTime(true);
  } finally { if (R) R.busy = false; }
}
async function stepMinute() {                       // lets the user watch an HTF candle form manually (R23)
  if (!R || R.busy) return; pause();
  var tok = R.token;
  if (R.k + 1 >= R.win.n && !(await loadNext(tok))) { if (!stale(tok)) showDataBanner(R.nextState); return; }
  if (stale(tok)) return;
  advance1(); afterFrame(); saveReplayTime(true);
}
async function goTo(ms) {                           // datetime-local in the user's time zone → UTC ms (WwTime.zonedToUtcMs)
  if (R.eng.open.length) return toast(_t('backtest.err.goto_open_positions'), 'warning');
  var target = Math.floor(ms / 1000), nowSec = R.win.t[R.k] + 60;
  if (R.eng.closed.length && target < nowSec) return toast(_t('backtest.err.goto_forward_only'), 'warning');
  if (target > R.cov.lastT) return toast(_t('backtest.err.no_data_after'), 'warning');
  await placeCursor(Math.max(target, R.cov.firstT), 'goto'); saveReplayTime(true);
}
function setTimeframe(tfId) {
  if (!C.TF_MIN[tfId] || tfId === R.tfId) return;
  pause(); R.tfId = tfId; R.tfMin = C.TF_MIN[tfId]; var tok = ++R.token;
  resetLoads(); hideOverlay();                        // the token bump makes in-flight loadNext/needMore return early,
                                                      // so buffering MUST be cleared here or play() would never re-arm RAF
  R.candles = C.aggregate(R.win, R.tfMin, R.sym.id, 0, R.k);
  R.builder = C.createBuilder(R.tfMin, R.sym.id, R.candles);
  renderChartData(); rebuildMarkers();             // marker times re-bucket for the new TF
  loadHistory(tok);                                 // merge() repairs a bucket that started before the window
  enqueueAccountPatch({ timeframe: tfId }, 'tf');   // coalesced write
}
```

### 3.4 Trigger evaluation per 1m bar per side; the same-bar rule
Port of `bt-math.js:60-76`, with lower-case reasons (DB values):
```js
// pos: {dir, sl, tp} in points (sl/tp may be null); bar = [t, o, h, l, c] BID points; sp = spread points
function exitOnBar(pos, bar, sp) {
  var adj = pos.dir > 0 ? 0 : sp;                  // LONG triggers on BID, SHORT on ASK = BID + sp (D4)
  var o = bar[1] + adj, h = bar[2] + adj, l = bar[3] + adj, slHit, tpHit, slGap, tpGap;
  if (pos.dir > 0) { slHit = pos.sl != null && l <= pos.sl; tpHit = pos.tp != null && h >= pos.tp;
                     slGap = slHit && o <= pos.sl;     tpGap = tpHit && o >= pos.tp; }
  else             { slHit = pos.sl != null && h >= pos.sl; tpHit = pos.tp != null && l <= pos.tp;
                     slGap = slHit && o >= pos.sl;     tpGap = tpHit && o <= pos.tp; }
  if (slGap) return { reason: 'sl', pts: o, ambiguous: false };        // opened beyond SL: fill at the open (slippage)
  if (tpGap) return { reason: 'tp', pts: pos.tp, ambiguous: false };   // opened beyond TP: fill at TP (no improvement)
  if (slHit) return { reason: 'sl', pts: pos.sl, ambiguous: !!tpHit }; // TP and SL inside ONE 1m bar → SL first, flagged
  if (tpHit) return { reason: 'tp', pts: pos.tp, ambiguous: false };
  return null;
}
function onBar(st, bar) {                          // called by advance1 for every revealed 1m bar
  var out = [];
  for (var i = 0; i < st.open.length; ) {
    var p = st.open[i];
    if (p.entryBarT < bar[0]) {                    // TP/SL start on the bar AFTER the fill bar (D4)
      var hit = exitOnBar(p, bar, st.sp);
      if (hit) { out.push(settle(st, i, hit.pts, bar[0], bar[0], hit.reason, hit.ambiguous)); continue; }  // exit time = trigger bar open
    }
    i++;
  }
  setQuote(st, bar);                               // marks for floating P&L use this bar's close
  return out;
}
```
**Smaller-timeframe rule (R24).**
- Candles of every chart timeframe are resolved through their 1m bars, because `advance1` feeds every 1m bar to `onBar`. TP and SL inside one H1 candle are therefore decided by the 1m bar order.
- The residual case is TP and SL inside the same 1m bar. 1m is the smallest archived timeframe, so the rule there is SL first (worst case) with `exit_ambiguous = true` (D4). This is owner decision O3 (in D10).
- The UI shows a ⚠ next to the reason (`reason.ambiguous`), raises the toast `toast.ambiguous`, and counts the case in `stat.ambiguous`.

### 3.5 Money: integer points, steps and cents; unrealized P&L
```js
function openPosition(st, o) {                     // o = {id, dir, steps, sl, tp} (points/steps)
  var v = validateOrder(st, o); if (!v.ok) throw codeError(v);
  var entry = marketFill(o.dir, st.quote.bid, st.sp);              // LONG = ask = bid + sp, SHORT = bid
  var p = { id: o.id, dir: o.dir, steps: o.steps, entry: entry,
            entryT: st.quote.t + 60, entryBarT: st.quote.t,         // entry time = last revealed open + 60 s (D4)
            sl: o.sl, tp: o.tp, sl0: o.sl, tp0: o.tp,
            comm: commissionCents(st.sym, st.cplCents, o.steps),     // round-turn, snapshotted at open, booked at close
            rr: rrHundredths(entry, o.sl, o.tp) };                   // initial levels, real fill (D4)
  st.open.push(p); return p;
}
function settle(st, i, exit, exitT, exitBarT, reason, ambiguous) {
  var p = st.open.splice(i, 1)[0];
  var gross = grossCents(st.sym, p.dir, p.entry, exit, p.steps);     // USDJPY: ÷ exit fill
  var t = Object.assign({}, p, { exit: exit, exitT: exitT, exitBarT: exitBarT, reason: reason,
                                 ambiguous: !!ambiguous, gross: gross, net: gross - p.comm });   // exact cents, no 2nd rounding
  st.closed.push(t); st.realizedCents += t.net; return t;
}
function closePosition(st, id) {                   // manual: at the current quote (LONG at bid, SHORT at ask)
  var i = indexOfId(st.open, id); if (i < 0) return null;
  return settle(st, i, closeFill(st.open[i].dir, st.quote.bid, st.sp), st.quote.t + 60, st.quote.t, 'manual', false);
}
function floating(st) {                            // marked at what closing now would get (D4)
  var total = 0, byId = {};
  st.open.forEach(function (p) {
    var mark = closeFill(p.dir, st.quote.bid, st.sp);
    var g = grossCents(st.sym, p.dir, p.entry, mark, p.steps);       // USDJPY: ÷ mark
    byId[p.id] = { mark: mark, gross: g, net: g - p.comm }; total += g - p.comm;
  });
  return { total: total, byId: byId };
}
// balance = startCents + realizedCents;  equity = balance + floating.total   (D4)
// maxDd: walk closed trades by exitT from startCents; peak = max; dd = peak − bal; ddBp = roundDiv(dd·10000, peak)
```
Display: `fmtUsd(cents)` uses `Intl.NumberFormat(localeTag(), {style:'currency', currency:'USD'})` on `cents/100`. This is a float conversion for display only. Signed P&L is shown as `+$1.23` / `−$1.23`. Win rate, profit factor, expectancy and average R:R come from `WwMetrics.summarize(closed.map(E.metricsRow))`, the app-wide definitions (`trade-metrics.js:162-195`). Balance, equity and drawdown come from `E.summary` (exact cents, drawdown in % of the peak balance).

### 3.6 Chart: creation, incremental updates, markers, price lines
```js
function buildChart() {
  var c = WwChart.colors();                                          // chart-theme.js:19-32 (read at call time)
  R.chart = LightweightCharts.createChart($('bt-chart'), WwChart.lwc({ // chart-theme.js:154-177
    autoSize: true,
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },
    timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 8,
                 shiftVisibleRangeOnNewBar: true, lockVisibleTimeRangeOnResize: true, tickMarkFormatter: tickLabel },
    localization: { locale: localeTag(), timeFormatter: crosshairTime },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true }
  }));
  R.series = R.chart.addCandlestickSeries({
    upColor: c.up, downColor: c.down, borderUpColor: c.up, borderDownColor: c.down, wickUpColor: c.up, wickDownColor: c.down,
    priceFormat: S.priceFormat(R.sym.id)                              // precision = digits, minMove = point (typings 2578-2598)
  });
  R.chart.subscribeCrosshairMove(renderLegend);                       // O/H/L/C + time of the hovered candle (else last)
  if (!R.chart.autoSizeActive || !R.chart.autoSizeActive()) installResizeFallback();
}
function renderChartData() {
  if (R.candles.length > MAX_CHART_CANDLES) { R.candles.splice(0, R.candles.length - TRIM_TO); R.builder = C.createBuilder(R.tfMin, R.sym.id, R.candles); }
  R.series.setData(R.candles.map(function (x) { return C.toChartBar(x, R.scale); }));
  R.dirtyFrom = -1;
}
function flushChart() {                         // one series.update per changed candle per frame (typings 1747-1770)
  if (R.dirtyFrom < 0) return;
  for (var i = R.dirtyFrom; i < R.candles.length; i++) R.series.update(C.toChartBar(R.candles[i], R.scale));
  R.dirtyFrom = -1;
}
function rebuildMarkers() {                     // setMarkers replaces all and needs time order (typings 1819-1859)
  var c = WwChart.colors(), first = R.candles.length ? R.candles[0].time : 0, last = R.candles.length ? R.candles[R.candles.length - 1].time : 0, m = [];
  R.eng.closed.slice(-MAX_MARKER_TRADES).concat(R.eng.open).forEach(function (t) {
    var long = t.dir > 0, lot = E.stepsToStr(t.steps, R.sym.lotDigits);
    m.push({ id: 'e:' + t.id, time: C.bucketStart(t.entryBarT, R.tfMin, R.sym.id),
             position: long ? 'belowBar' : 'aboveBar', shape: long ? 'arrowUp' : 'arrowDown',
             color: long ? c.up : c.down, text: dirLabel(t.dir) + ' ' + lot });
    if (t.exitT != null) m.push({ id: 'x:' + t.id, time: C.bucketStart(t.exitBarT, R.tfMin, R.sym.id),
             position: long ? 'aboveBar' : 'belowBar', shape: 'circle', color: t.net >= 0 ? c.up : c.down,
             text: reasonLabel(t.reason) });
  });
  m = m.filter(function (x) { return x.time >= first && x.time <= last; }).sort(function (a, b) { return a.time - b.time; });
  R.series.setMarkers(m);
}
function syncPriceLines() {                     // createPriceLine / applyOptions({price}) / removePriceLine (typings 1866-1891)
  var c = WwChart.colors(), keep = {};
  R.eng.open.forEach(function (p) {
    var L = R.lines[p.id] || (R.lines[p.id] = {}); keep[p.id] = true;
    line(L, 'entry', p.entry, { color: p.dir > 0 ? c.up : c.down, lineStyle: LightweightCharts.LineStyle.Solid,
                               title: dirLabel(p.dir) + ' ' + E.stepsToStr(p.steps, R.sym.lotDigits) });
    line(L, 'sl', p.sl, { color: c.down, lineStyle: LightweightCharts.LineStyle.Dashed, title: 'SL' });
    line(L, 'tp', p.tp, { color: c.up,   lineStyle: LightweightCharts.LineStyle.Dashed, title: 'TP' });
  });
  Object.keys(R.lines).forEach(function (id) { if (!keep[id]) { ['entry','sl','tp'].forEach(function (k) { line(R.lines[id], k, null); }); delete R.lines[id]; } });
}
function line(L, key, pts, opts) {
  if (pts == null) { if (L[key]) { R.series.removePriceLine(L[key]); L[key] = null; } return; }
  var price = pts / R.scale;
  if (L[key]) L[key].applyOptions({ price: price });
  else L[key] = R.series.createPriceLine(Object.assign({ price: price, lineWidth: 1, axisLabelVisible: true }, opts));
}
function updateAskLine() {                      // dotted "Ask" line only when spread > 0
  if (!R.eng.sp) { if (R.askLine) { R.series.removePriceLine(R.askLine); R.askLine = null; } return; }
  var ask = (R.eng.quote.bid + R.eng.sp) / R.scale;
  if (R.askLine) R.askLine.applyOptions({ price: ask });
  else R.askLine = R.series.createPriceLine({ price: ask, color: WwChart.colors().muted, lineWidth: 1,
                    lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: true, title: 'Ask' });
}
function handleClosed(trades) {                 // after a frame/step/close
  trades.forEach(function (t) { persistClose(t); });           // queue (§2.5.6), then hook('onTradeClosed')
  syncPriceLines(); rebuildMarkers(); renderTables(); renderStats();
  toast(trades.length === 1 ? closedText(trades[0]) : _t('backtest.toast.closed_many', '', { n: trades.length, pnl: fmtUsd(sumNet(trades), true) }),
        sumNet(trades) >= 0 ? 'success' : 'info');
  if (trades.some(function (t) { return t.ambiguous; })) toast(_t('backtest.toast.ambiguous'), 'warning');
}
```
- **Marker times map to candles of the current timeframe.** Entries use `bucketStart(entryBarT)`. The entry timestamp itself (`entryBarT + 60`) can be the first second of the next, not yet revealed, bucket.
- **Theme rebuild** (§2.5.7) calls `buildChart()`, `renderChartData()`, `rebuildMarkers()`, resets `R.lines = {}` and `R.askLine = null`, then `syncPriceLines()`, `updateAskLine()` and restores the range. `chart.remove()` already disposed the old lines.

### 3.7 Time display and `priceFormat`
Series times stay true UTC seconds (D4). Labels are produced in the user's time zone by formatters:
- No pseudo-UTC shifting. `WwTime.pseudoUtcSeconds` (`time-settings.js:275-286`) would create duplicate times at the DST fall-back hour for 24/7 crypto, and LWC rejects them.
- Never `WwTime.formatDateTime`/`formatDate` on bar or trade times. `classify()` treats any exact UTC-midnight timestamp as date-only (`time-settings.js:186-189`), so `00:00:00Z` bars (crypto) and entries at `23:59 + 60 s` would lose their time.
```js
var MONTHS = { tr: ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'],
               en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
               de: ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'] };   // = dashboard.js:580-585
function tz() { return WwTime.getTz(); }                                   // time-settings.js:131-134
function h12() { return !!WwTime.getSettings().hour12; }
var fmtCache = {};                                                         // key: kind|locale|tz|h12
function fmtDateTime(sec) { /* Intl.DateTimeFormat(localeTag(), {timeZone: tz(), weekday:'short', day:'2-digit',
                               month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12: h12()}) */ }
function fmtTime(sec)     { /* {timeZone, hour:'2-digit', minute:'2-digit', hour12} → ≤ 8 chars for ticks */ }
function fmtTradingDay(sec) {                                             // D1 labels: trading date, not the 21:00Z open
  var key = S.tradingDayKey(sec * 1000, R.sym.id);                         // §2.1
  return new Intl.DateTimeFormat(localeTag(), { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
    .format(new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10))));
}
function crosshairTime(time) { return R.tfMin >= 1440 ? fmtTradingDay(time) : fmtDateTime(time); }   // localization.timeFormatter (typings 2424)
function tickLabel(time, type) {                                           // timeScale.tickMarkFormatter (typings 3650; enum 146-167)
  if (typeof time !== 'number') return null;
  var mo = MONTHS[lang()] || MONTHS.tr;
  if (R.tfMin >= 1440) {
    var key = S.tradingDayKey(time * 1000, R.sym.id), y = +key.slice(0, 4), m = +key.slice(5, 7), d = +key.slice(8, 10);
    return type === 0 ? String(y) : type === 1 ? mo[m - 1] : d + ' ' + mo[m - 1];
  }
  var p = WwTime.partsInTz(time * 1000, tz());                             // time-settings.js:53-61
  if (type === 0) return String(p.y);
  if (type === 1) return mo[p.m - 1];
  if (type === 2 || (p.H === 0 && p.Mi === 0)) return p.d + ' ' + mo[p.m - 1];
  return fmtTime(time);
}
```
- **Clock.** `fmtDateTime(R.win.t[R.k] + 60)` plus `WwTime.offsetLabel(tz(), ms)` (`time-settings.js:363-365`), e.g. `Sal 05 Oca 2026 10:00 · UTC+3`.
- **Go-to and start inputs.** `datetime-local` values are wall time in `WwTime.getTz()`, converted with `WwTime.zonedToUtcMs(y,m,d,H,Mi,0,tz)` (`time-settings.js:79-86`). `min`/`max` come from `partsInTz(coverage)`. The hint shows the time zone (`field.start_hint`).
- **Known limitation (§9 I-6).** LWC 4.1.3 places tick marks by UTC boundaries. For a non-UTC user, a "day" tick can sit at local 03:00 while its label shows the local date. Crosshair and legend times are exact.

**Price formatting.** The axis and crosshair use the series `priceFormat` (precision = `digits`, minMove = `point`, `typings.d.ts:2578-2598`). No `priceFormatter` is set, so the series precision applies (the LWC default is 2 decimals, `typings.d.ts:2988`). Panels and tables use `E.ptsToStr(pts, digits)`: `.` as the decimal separator and no grouping in every language, so they read the same as the chart axis. Money uses locale formatting (§4.6).

### 3.8 Persistence pseudo-code
```js
function submitOrder(dir) {
  var o = readOrderForm(dir); if (!o.ok) return showOrderError(o);              // §4.2
  var pos; try { pos = E.openPosition(R.eng, { id: newId(), dir: dir, steps: o.steps, sl: o.sl, tp: o.tp }); }
  catch (e) { return showOrderError(e); }
  enqueue({ label: 'open', run: function () { return sb.from('backtest_account_trades').insert(E.tradeInsertRow(R.eng, pos, ctx())); },
            okCodes: ['23505'], onFail: function () { pos.unsaved = true; renderTables(); } });
  clearSlTpInputs(); syncPriceLines(); rebuildMarkers(); renderTables(); renderLive(true); saveReplayTime(true);
}
function persistClose(t) {
  enqueue({ label: 'close', run: function () {
      return sb.from('backtest_account_trades').update(E.tradeClosePatch(R.eng, t, { extraColumns: EXTRA_COLUMNS }))
        .eq('id', t.id).eq('user_id', L.user.id).is('exit_time', null).select('id'); },
    onOk: function (res) { if (res.data && !res.data.length) return reloadTradesClosedElsewhere(); hook('onTradeClosed', { sb: sb, userId: L.user.id, account: R.acc, trade: t }); } });
}
function saveReplayTime(force) {
  if (!R || !R.dirty && !force) return;
  var sec = R.win.t[R.k] + 60; if (sec === R.lastSavedReplaySec) { R.dirty = false; return; }
  R.lastSaveAt = performance.now(); R.dirty = false;
  enqueue({ key: 'replay:' + R.acc.id, label: 'replay',
            run: function () { return sb.from('backtest_accounts').update({ replay_time: new Date(sec * 1000).toISOString() })
                                 .eq('id', R.acc.id).eq('user_id', L.user.id); },
            onOk: function () { if (R) R.lastSavedReplaySec = sec; } });
}
```

---

## 4. Validation and UX rules

### 4.1 Account form (`#bt-account-form`); DB CHECKs from D3
| Field | Rule | Message |
|---|---|---|
| name | `Array.from(v.trim()).length` in 1..60 (code points, like `char_length(btrim(name))`); the trimmed value is sent | `err.name` |
| symbol | in `WwBtSymbols.list()` and present in `coverage` (`months.length > 0`); options without data are disabled with the suffix `field.symbol_no_data`; locked in edit mode | `err.symbol` |
| timeframe | one of `TF_IDS` | `err.timeframe` |
| start (create only) | required. `X = zonedToUtcMs(...)` must lie in `[max(coverage.firstT, monthStart(sym.dataStart)), coverage.lastT]`, and `nextOpen(X) ≤ coverage.lastT`. Default: day 1 of `addMonths(monthKey(lastT), −3)` at 00:00 in the user's zone. | `err.start_required` / `err.start_range {from,to}` / `err.no_data_after` |
| starting balance | `parseScaled(v,2,'exact')`, `0 < v ≤ 100000000.00`; locked when the account has trades | `err.balance` |
| spread (pips) | `parseScaled(v,2,'exact')`, `0 ≤ v ≤ 10000.00`. Default: `sym.defaultSpreadPips` as `0.20`. Hint `field.spread_hint {points, price, def}`; for example EURUSD 0.20 shows "2 puan = 0.00002". Locked while positions are open. | `err.spread` |
| commission per lot (USD, round turn) | `parseScaled(v,2,'exact')`, `0 ≤ v ≤ 10000.00` | `err.commission` |
| journal | `''` or an id from `listJournals()` | DB `INVALID_JOURNAL` → `err.invalid_journal` |

The submit button is disabled while a request is in flight. Coverage loading disables only the start field and the submit button.

### 4.2 Orders and position edits
Lot:
- `parseScaled(v, lotDigits, 'exact')`, then steps.
- More decimals than the step allows → `err.lot_format {step}`.
- Outside `lot.min..lot.max` → `err.lot_range {min,max}` (EURUSD 0.01–100, ETHUSDT 0.01–1000).
- `#bt-lot-hint` shows `order.lot_hint {step,min,max,pip}`, where `pip = S.pipValueUsd(id, lot, price)` (display only).

SL/TP:
- Optional. `parseScaled(v, digits, 'round')`. A snapped value is written back to the input with the note `order.price_snapped`.
- Not a number → `err.price_format`.
- A value ≤ 0 → `err.price_format`.

Side checks at the current quote `bid = c_k`, `ask = c_k + sp`:

| Side | SL | TP |
|---|---|---|
| BUY (LONG) | `SL < bid` → else `err.sl_long {bid}` | `TP > ask` → else `err.tp_long {ask}` |
| SELL (SHORT) | `SL > ask` → else `err.sl_short {ask}` | `TP < bid` → else `err.tp_short {bid}` |

This is stricter than the research's `TP < c + s` for SELL and `TP > c` for BUY. It forbids a "TP" that would fill at a loss inside the spread. Verified in Appendix A.

Other order rules:
- **Edit SL/TP of an open position.** Only against the live market: LONG `SL < bid`, `TP > bid` (`err.modify_long`); SHORT `SL > ask`, `TP < ask` (`err.modify_short`). The entry, `sl0/tp0` and `rr` stay.
- **Limits.** At most 20 open positions (`err.max_positions`). If equity ≤ 0, no new orders (`err.no_equity`). There is no margin or stop-out model in v1.
- **Disabled states.** The buy and sell buttons are disabled while `data-replay` is `loading` or `error`, or before the first quote (`err.no_quote`). Buffering, missing and end still allow orders at the last price.
- **After a successful order** the SL/TP inputs are cleared and the lot stays. `#bt-order-risk` updates on input and on each live tick: `order.risk {risk, reward, rr}` from `E.preview`.

### 4.3 Replay controls
- **Step.** Completes the current candle, or the next one (§3.3). +1m advances one 1m bar. Both pause playback first.
- **Go-to.**
  - Blocked while positions are open (`err.goto_open_positions`). This avoids skipping TP/SL checks across a jump.
  - With closed trades, only forward (`err.goto_forward_only`), so history never contains future trades.
  - Bounds come from coverage. The target lands on the first bar `≥ nextOpen(target)` (D4).
- **Timeframe.** Changing it pauses, rebuilds and saves `timeframe`.
- **Speed.** Saved per browser in `localStorage.ww_bt_speed` (try/catch). This changes the bfcache fingerprint (`page-transition.js:35-50`), so returning via Back reloads once. That is acceptable.
- **Play** is disabled in the `end` state and while a modal is open.

### 4.4 Data states
| State | Trigger | UI |
|---|---|---|
| loading | `placeCursor`/`loadHistory` | overlay `chart.loading`, or `chart.loading_n {done,total}` during history; trading is blocked until the window is ready |
| buffering | play reached the loaded end and the next month is in coverage | soft overlay `chart.buffering`; resumes by itself |
| missing month | the next month is not in `coverage.months` but a later month is | banner `data.month_missing {month}` with button `data.skip_to {month}` |
| end of archive | no later month | banner `data.end_reached {time}`; Play/Step disabled |
| load error | `NETWORK`/`CORRUPT` | banner `data.load_failed` with Retry (repeats the failed call with a new token) |
| auth | `AUTH` | banner `data.session_expired` with a link to `login.html` |
| archive unavailable | `coverage()` rejects | create modal: `data.unavailable`, submit disabled; replay: error banner |
| gap crossed | `gapKind` | chip for 4 s: `market.closed_skipped {dur}` or `market.data_gap {min}` |

### 4.5 Errors → messages
| Source | Detection | Message / action |
|---|---|---|
| quota trigger (M02) | `error.message` contains the M02 code (assumed `BACKTEST_LIMIT_EXCEEDED`, by analogy with `PROP_LIMIT_EXCEEDED:%` at `db/fn_check_prop_account_limit.sql:76-77`) | free: `quota.free_reached` + `openUpgradeModal({feature:'backtest'})`; premium: `quota.premium_reached` |
| journal ownership | contains `INVALID_JOURNAL` | `err.invalid_journal`, then reload journals |
| CHECK | `code === '23514'` | `err.invalid_value`; details through `wwLog.error` |
| FK | `code === '23503'` | `err.generic`; if the account is gone, go back to the list |
| duplicate trade id | `code === '23505'` on insert | success (idempotent retry) |
| RLS / auth | `code === '42501'`, or status 401/403 | `err.permission` / `data.session_expired` |
| transient | no status, 5xx, 408, 429 | `err.save_failed` once, retry (§2.5.6) |
| anything else | — | `err.generic` |

### 4.6 Display conventions
- **Prices.** `ptsToStr` gives exactly `digits` decimals with a `.` separator, matching the chart axis.
- **Lots.** `stepsToStr`, e.g. `0.37`.
- **R:R.** `2.00`, or `—` when there is none.
- **Money.** USD through Intl currency formatting in `tr-TR`/`en-US`/`de-DE`. P&L gets a `+`/`−` sign and the `.bt-pos`/`.bt-neg` colour. The amounts are USD by design (D5 currency note).
- **Times.** User time zone and 12/24 h from `WwTime.getSettings()`. D1 candles show the trading date.
- **Numbers.** `.bt-num` everywhere: DM Sans, `tabular-nums`, 600 weight.

---

## 5. i18n keys (`backtest.*`, flat, tr / en / de)
- Add to `public/i18n/locales/{tr,en,de}.js` as one `// ⭐ BACKTEST` block each (`en.js:6` style), then bump `i18n.js:126` (§0.3).
- Reused existing keys: `common.cancel`, `common.save`, `common.close` (`tr.js:644-647`, `en.js:687-690`, `de.js:665-668`).
- German uses formal "Sie" (144 vs 49 uses in `de.js`). Statistics names follow the app vocabulary: `dashboard.stats.win_rate`, `dashboard.kpi.profit_factor`, `dashboard.kpi.max_drawdown`.
- `{x}` are `i18n.t` params (`i18n.js:177-201`).
- The locale files use double-quoted values, so escape the quotes inside `backtest.delete.message` (tr/en) as `\"`. German uses „…“, which needs no escaping.
- After any `i18n.setLanguage`, `apply()` re-translates static nodes. Dynamic nodes are rebuilt in `PAGE.onI18nChange` (§2.5.7).

| Key | tr | en | de |
|---|---|---|---|
| backtest.title | Backtest | Backtest | Backtest |
| backtest.subtitle | Geçmiş piyasa verisinde mum mum işlem pratiği yap. | Practice trading candle by candle on historical market data. | Üben Sie den Handel Kerze für Kerze mit historischen Marktdaten. |
| backtest.new_account | Yeni hesap | New account | Neues Konto |
| backtest.quota | {used} / {limit} hesap | {used} / {limit} accounts | {used} / {limit} Konten |
| backtest.plan_free | Ücretsiz | Free | Free |
| backtest.plan_premium | Premium | Premium | Premium |
| backtest.quota.over_limit | Plan limitinin üzerindesiniz; mevcut hesaplar çalışmaya devam eder. | You are over your plan limit; existing accounts keep working. | Sie liegen über Ihrem Planlimit; bestehende Konten funktionieren weiter. |
| backtest.quota.free_reached | Ücretsiz planda 1 aktif backtest hesabı açabilirsiniz. | The Free plan includes 1 active backtest account. | Der Free-Plan umfasst 1 aktives Backtest-Konto. |
| backtest.quota.premium_reached | Premium planda en fazla 10 aktif backtest hesabı açabilirsiniz. | Premium includes up to 10 active backtest accounts. | Premium umfasst bis zu 10 aktive Backtest-Konten. |
| backtest.empty_title | Henüz backtest hesabın yok | You don't have any backtest accounts yet | Sie haben noch keine Backtest-Konten |
| backtest.empty_desc | Bir sembol ve başlangıç tarihi seç, geçmiş veride mum mum işlem yap. | Pick a symbol and a start date, then trade candle by candle on past data. | Wählen Sie ein Symbol und ein Startdatum und handeln Sie Kerze für Kerze mit vergangenen Daten. |
| backtest.load_error | Hesaplar yüklenemedi. | Could not load your accounts. | Konten konnten nicht geladen werden. |
| backtest.retry | Tekrar dene | Retry | Erneut versuchen |
| backtest.demo_mode | Demo modunda backtest kullanılamaz. Lütfen giriş yapın. | Backtest is not available in demo mode. Please sign in. | Backtest ist im Demo-Modus nicht verfügbar. Bitte melden Sie sich an. |
| backtest.deps_error | Sayfa bileşenleri yüklenemedi. Lütfen sayfayı yenileyin. | Page components failed to load. Please refresh the page. | Seitenkomponenten konnten nicht geladen werden. Bitte laden Sie die Seite neu. |
| backtest.card.balance | Bakiye | Balance | Saldo |
| backtest.card.realized | Gerçekleşen K/Z | Realized P&L | Realisierter G/V |
| backtest.card.trades | İşlem | Trades | Trades |
| backtest.card.open_positions | {n} açık | {n} open | {n} offen |
| backtest.card.replay_time | Replay zamanı | Replay time | Replay-Zeit |
| backtest.card.journal | Defter: {name} | Journal: {name} | Journal: {name} |
| backtest.card.no_journal | Deftere bağlı değil | Not linked to a journal | Mit keinem Journal verknüpft |
| backtest.card.settings | Ayarlar | Settings | Einstellungen |
| backtest.card.open_aria | {name} hesabını aç | Open account {name} | Konto {name} öffnen |
| backtest.card.symbol_unavailable | Bu sembol artık desteklenmiyor. | This symbol is no longer supported. | Dieses Symbol wird nicht mehr unterstützt. |
| backtest.modal.create_title | Yeni backtest hesabı | New backtest account | Neues Backtest-Konto |
| backtest.modal.edit_title | Hesap ayarları | Account settings | Kontoeinstellungen |
| backtest.modal.create | Hesabı oluştur | Create account | Konto erstellen |
| backtest.modal.delete_account | Hesabı sil | Delete account | Konto löschen |
| backtest.field.name | Hesap adı | Account name | Kontoname |
| backtest.field.name_ph | Örn. EURUSD Londra seansı | e.g. EURUSD London session | z. B. EURUSD London-Session |
| backtest.field.symbol | Sembol | Symbol | Symbol |
| backtest.field.symbol_no_data | veri yok | no data | keine Daten |
| backtest.field.symbol_locked | Sembol hesap oluşturulduktan sonra değiştirilemez. | The symbol can't be changed after the account is created. | Das Symbol kann nach dem Erstellen des Kontos nicht geändert werden. |
| backtest.field.timeframe | Zaman dilimi | Timeframe | Zeiteinheit |
| backtest.field.start | Başlangıç tarihi ve saati | Start date and time | Startdatum und -uhrzeit |
| backtest.field.start_hint | Saat diliminiz: {tz}. Veri aralığı: {from} – {to} | Your time zone: {tz}. Data range: {from} – {to} | Ihre Zeitzone: {tz}. Datenbereich: {from} – {to} |
| backtest.field.balance | Başlangıç bakiyesi (USD) | Starting balance (USD) | Startguthaben (USD) |
| backtest.field.balance_locked | İşlem yapılmış hesapta değiştirilemez. | Can't be changed once the account has trades. | Kann nicht geändert werden, sobald das Konto Trades hat. |
| backtest.field.spread | Spread (pip) | Spread (pips) | Spread (Pips) |
| backtest.field.spread_hint | {points} puan = {price}. Varsayılan: {def} pip | {points} points = {price}. Default: {def} pips | {points} Punkte = {price}. Standard: {def} Pips |
| backtest.field.commission | Komisyon (lot başına, açılış+kapanış, USD) | Commission (per lot, round turn, USD) | Kommission (pro Lot, Round Turn, USD) |
| backtest.field.commission_hint | Pozisyon kapanınca bakiyeden düşülür. | Deducted from the balance when the position closes. | Wird beim Schließen der Position vom Saldo abgezogen. |
| backtest.field.journal | Bağlı defter (isteğe bağlı) | Linked journal (optional) | Verknüpftes Journal (optional) |
| backtest.field.journal_none | Bağlantı yok | Not linked | Nicht verknüpft |
| backtest.field.journal_hint | Kapanan işlemler bu deftere kopyalanır. | Closed trades are copied to this journal. | Geschlossene Trades werden in dieses Journal kopiert. |
| backtest.field.journal_hint_pending | Bağlantı kaydedilir; işlemlerin deftere kopyalanması bir sonraki güncellemeyle açılacak. | The link is saved; copying trades to the journal arrives with the next update. | Die Verknüpfung wird gespeichert; das Kopieren ins Journal folgt mit dem nächsten Update. |
| backtest.field.locked_open_positions | Açık pozisyon varken değiştirilemez. | Can't be changed while positions are open. | Kann bei offenen Positionen nicht geändert werden. |
| backtest.delete.title | Hesabı sil | Delete account | Konto löschen |
| backtest.delete.message | "{name}" hesabı ve {n} işlemi kalıcı olarak silinecek. Bu işlem geri alınamaz. | The account "{name}" and its {n} trades will be deleted permanently. This can't be undone. | Das Konto „{name}“ und seine {n} Trades werden dauerhaft gelöscht. Das kann nicht rückgängig gemacht werden. |
| backtest.delete.journal_note | Bağlı defterdeki kopyalanmış backtest işlemleri de silinir. | Backtest trades copied to the linked journal are removed as well. | In das verknüpfte Journal kopierte Backtest-Trades werden ebenfalls entfernt. |
| backtest.delete.confirm | Kalıcı olarak sil | Delete permanently | Endgültig löschen |
| backtest.back | Hesaplar | Accounts | Konten |
| backtest.source.archive | Arşiv · {provider} | Archive · {provider} | Archiv · {provider} |
| backtest.source.title_dukascopy | Dukascopy BID 1 dakikalık geçmiş fiyatlar; alış (ask) fiyatı spread ayarınızla hesaplanır. | Dukascopy BID 1-minute historical prices; the ask is the bid plus your spread. | Historische Dukascopy-BID-1-Minuten-Kurse; der Ask ist der Bid plus Ihr Spread. |
| backtest.source.title_binance | Binance spot 1 dakikalık mumlar (son işlem fiyatı); spread hesap ayarınızdan eklenir. | Binance spot 1-minute candles (last trade price); your account spread is added. | Binance-Spot-1-Minuten-Kerzen (letzter Handelspreis); Ihr Konto-Spread wird addiert. |
| backtest.goto.label | Tarihe git | Go to date | Zu Datum springen |
| backtest.goto.button | Git | Go | Los |
| backtest.play | Oynat | Play | Abspielen |
| backtest.pause | Duraklat | Pause | Pausieren |
| backtest.step | Bir mum ilerle | Step one candle | Eine Kerze vor |
| backtest.step_1m | 1 dakika ilerle | Step one minute | Eine Minute vor |
| backtest.speed | Hız | Speed | Geschwindigkeit |
| backtest.speed_hint | Saniyede mum | Candles per second | Kerzen pro Sekunde |
| backtest.market.closed_skipped | Piyasa kapalı: {dur} atlandı | Market closed: skipped {dur} | Markt geschlossen: {dur} übersprungen |
| backtest.market.data_gap | Veri boşluğu: {min} dk | Data gap: {min} min | Datenlücke: {min} Min. |
| backtest.duration.dh | {d}g {h}s | {d}d {h}h | {d} T {h} Std. |
| backtest.duration.hm | {h}s {m}dk | {h}h {m}m | {h} Std. {m} Min. |
| backtest.shortcuts | Kısayollar: Boşluk = oynat/duraklat, → = bir mum, Shift+→ = 1 dakika | Shortcuts: Space = play/pause, → = one candle, Shift+→ = one minute | Tastenkürzel: Leertaste = Abspielen/Pause, → = eine Kerze, Umschalt+→ = eine Minute |
| backtest.chart.loading | Mum verisi yükleniyor… | Loading candle data… | Kerzendaten werden geladen… |
| backtest.chart.loading_n | Mum verisi yükleniyor… ({done}/{total}) | Loading candle data… ({done}/{total}) | Kerzendaten werden geladen… ({done}/{total}) |
| backtest.chart.buffering | Sonraki ay yükleniyor… | Loading the next month… | Nächster Monat wird geladen… |
| backtest.data.month_missing | {month} verisi arşivde yok. | Data for {month} is missing from the archive. | Für {month} fehlen Daten im Archiv. |
| backtest.data.skip_to | {month} ayına geç | Skip to {month} | Weiter zu {month} |
| backtest.data.load_failed | Mum verisi yüklenemedi. | Could not load candle data. | Kerzendaten konnten nicht geladen werden. |
| backtest.data.end_reached | Arşivin sonuna ulaşıldı (son veri: {time}). | You reached the end of the archive (last data: {time}). | Sie haben das Ende des Archivs erreicht (letzte Daten: {time}). |
| backtest.data.unavailable | Veri arşivi şu an kullanılamıyor. | The data archive is not available right now. | Das Datenarchiv ist derzeit nicht verfügbar. |
| backtest.data.session_expired | Oturumunuz sona erdi. Lütfen tekrar giriş yapın. | Your session has expired. Please sign in again. | Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an. |
| backtest.attribution_prefix | Grafikler: | Charts: | Charts: |
| backtest.order.buy | AL | BUY | KAUFEN |
| backtest.order.sell | SAT | SELL | VERKAUFEN |
| backtest.order.lot | Lot | Lot | Lot |
| backtest.order.lot_hint | Adım {step} · {min}–{max} · 1 pip = {pip} | Step {step} · {min}–{max} · 1 pip = {pip} | Schritt {step} · {min}–{max} · 1 Pip = {pip} |
| backtest.order.sl | Zarar durdur (SL) | Stop loss (SL) | Stop-Loss (SL) |
| backtest.order.tp | Kâr al (TP) | Take profit (TP) | Take-Profit (TP) |
| backtest.order.price_ph | Fiyat (isteğe bağlı) | Price (optional) | Preis (optional) |
| backtest.order.spread | Spread {pips} pip | Spread {pips} pips | Spread {pips} Pips |
| backtest.order.risk | Risk {risk} · Hedef {reward} · R:R {rr} | Risk {risk} · Target {reward} · R:R {rr} | Risiko {risk} · Ziel {reward} · CRV {rr} |
| backtest.order.price_snapped | {field} {digits} ondalığa yuvarlandı: {price} | {field} rounded to {digits} decimals: {price} | {field} auf {digits} Nachkommastellen gerundet: {price} |
| backtest.err.name | Hesap adı 1–60 karakter olmalı. | The account name must be 1–60 characters. | Der Kontoname muss 1–60 Zeichen lang sein. |
| backtest.err.symbol | Geçerli bir sembol seçin. | Choose a valid symbol. | Wählen Sie ein gültiges Symbol. |
| backtest.err.timeframe | Geçerli bir zaman dilimi seçin. | Choose a valid timeframe. | Wählen Sie eine gültige Zeiteinheit. |
| backtest.err.balance | Bakiye 0'dan büyük, en fazla 100.000.000 olmalı ve en fazla 2 ondalık içermeli. | The balance must be above 0, at most 100,000,000, with at most 2 decimals. | Der Saldo muss über 0 und höchstens 100.000.000 liegen, mit höchstens 2 Nachkommastellen. |
| backtest.err.spread | Spread 0 ile 10.000 pip arasında olmalı (en fazla 2 ondalık). | Spread must be between 0 and 10,000 pips (at most 2 decimals). | Der Spread muss zwischen 0 und 10.000 Pips liegen (höchstens 2 Nachkommastellen). |
| backtest.err.commission | Komisyon 0 ile 10.000 USD arasında olmalı (en fazla 2 ondalık). | Commission must be between 0 and 10,000 USD (at most 2 decimals). | Die Kommission muss zwischen 0 und 10.000 USD liegen (höchstens 2 Nachkommastellen). |
| backtest.err.start_required | Başlangıç tarihi seçin. | Choose a start date. | Wählen Sie ein Startdatum. |
| backtest.err.start_range | Başlangıç {from} ile {to} arasında olmalı. | The start must be between {from} and {to}. | Der Start muss zwischen {from} und {to} liegen. |
| backtest.err.no_data_after | Bu tarihten sonra arşivde veri yok. | There is no archive data after this date. | Nach diesem Datum gibt es keine Archivdaten. |
| backtest.err.lot_format | Lot {step} adımlarıyla girilmeli. | Lot must be a multiple of {step}. | Lot muss ein Vielfaches von {step} sein. |
| backtest.err.lot_range | Lot {min} ile {max} arasında olmalı. | Lot must be between {min} and {max}. | Lot muss zwischen {min} und {max} liegen. |
| backtest.err.price_format | Geçerli bir fiyat girin. | Enter a valid price. | Geben Sie einen gültigen Preis ein. |
| backtest.err.sl_long | AL işleminde SL, satış fiyatının ({bid}) altında olmalı. | For a BUY, SL must be below the bid ({bid}). | Bei KAUFEN muss der SL unter dem Bid ({bid}) liegen. |
| backtest.err.tp_long | AL işleminde TP, alış fiyatının ({ask}) üstünde olmalı. | For a BUY, TP must be above the ask ({ask}). | Bei KAUFEN muss der TP über dem Ask ({ask}) liegen. |
| backtest.err.sl_short | SAT işleminde SL, alış fiyatının ({ask}) üstünde olmalı. | For a SELL, SL must be above the ask ({ask}). | Bei VERKAUFEN muss der SL über dem Ask ({ask}) liegen. |
| backtest.err.tp_short | SAT işleminde TP, satış fiyatının ({bid}) altında olmalı. | For a SELL, TP must be below the bid ({bid}). | Bei VERKAUFEN muss der TP unter dem Bid ({bid}) liegen. |
| backtest.err.modify_long | AL pozisyonunda SL satış fiyatının ({bid}) altında, TP üstünde olmalı. | For a BUY position, SL must be below and TP above the bid ({bid}). | Bei einer KAUF-Position muss der SL unter und der TP über dem Bid ({bid}) liegen. |
| backtest.err.modify_short | SAT pozisyonunda SL alış fiyatının ({ask}) üstünde, TP altında olmalı. | For a SELL position, SL must be above and TP below the ask ({ask}). | Bei einer VERKAUF-Position muss der SL über und der TP unter dem Ask ({ask}) liegen. |
| backtest.err.no_equity | Özsermaye sıfır veya altında; yeni işlem açılamaz. | Equity is zero or below; you can't open new trades. | Das Eigenkapital ist null oder negativ; neue Trades sind nicht möglich. |
| backtest.err.max_positions | En fazla {n} açık pozisyon olabilir. | You can have at most {n} open positions. | Es sind höchstens {n} offene Positionen möglich. |
| backtest.err.no_quote | Fiyat verisi henüz hazır değil. | Price data isn't ready yet. | Kursdaten sind noch nicht bereit. |
| backtest.err.goto_open_positions | Tarihe gitmeden önce açık pozisyonları kapatın. | Close your open positions before jumping to a date. | Schließen Sie offene Positionen, bevor Sie zu einem Datum springen. |
| backtest.err.goto_forward_only | İşlem yapılmış bir hesapta yalnızca ileri bir tarihe gidebilirsiniz. | An account with trades can only jump forward in time. | Ein Konto mit Trades kann nur vorwärts springen. |
| backtest.err.save_failed | Kaydedilemedi, yeniden deneniyor… | Couldn't save, retrying… | Speichern fehlgeschlagen, neuer Versuch… |
| backtest.err.save_failed_final | Bazı değişiklikler kaydedilemedi. | Some changes couldn't be saved. | Einige Änderungen konnten nicht gespeichert werden. |
| backtest.err.invalid_journal | Seçilen defter kullanılamıyor. | The selected journal can't be used. | Das gewählte Journal kann nicht verwendet werden. |
| backtest.err.permission | Bu işlem için yetkiniz yok. | You don't have permission for this action. | Für diese Aktion fehlt Ihnen die Berechtigung. |
| backtest.err.invalid_value | Geçersiz bir değer gönderildi. | An invalid value was sent. | Ein ungültiger Wert wurde gesendet. |
| backtest.err.closed_elsewhere | Bu pozisyon başka bir oturumda kapatılmış; liste yenilendi. | This position was closed in another session; the list was refreshed. | Diese Position wurde in einer anderen Sitzung geschlossen; die Liste wurde aktualisiert. |
| backtest.err.generic | Bir hata oluştu. Lütfen tekrar deneyin. | Something went wrong. Please try again. | Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut. |
| backtest.toast.created | Hesap oluşturuldu. | Account created. | Konto erstellt. |
| backtest.toast.saved | Ayarlar kaydedildi. | Settings saved. | Einstellungen gespeichert. |
| backtest.toast.deleted | Hesap silindi. | Account deleted. | Konto gelöscht. |
| backtest.toast.closed | {dir} {lot} {reason} ile kapandı: {pnl} | {dir} {lot} closed by {reason}: {pnl} | {dir} {lot} durch {reason} geschlossen: {pnl} |
| backtest.toast.closed_many | {n} pozisyon kapandı: {pnl} | {n} positions closed: {pnl} | {n} Positionen geschlossen: {pnl} |
| backtest.toast.ambiguous | TP ve SL aynı 1 dakikalık mumda tetiklendi; SL varsayıldı. | TP and SL were both hit inside the same 1-minute candle; SL was assumed. | TP und SL wurden in derselben 1-Minuten-Kerze erreicht; SL wurde angenommen. |
| backtest.pos.title | Açık pozisyonlar | Open positions | Offene Positionen |
| backtest.history.title | İşlem geçmişi | Trade history | Handelshistorie |
| backtest.stats.title | İstatistikler | Statistics | Statistiken |
| backtest.col.dir | Yön | Side | Richtung |
| backtest.col.lot | Lot | Lot | Lot |
| backtest.col.entry | Giriş | Entry | Einstieg |
| backtest.col.entry_time | Giriş zamanı | Entry time | Einstiegszeit |
| backtest.col.exit | Çıkış | Exit | Ausstieg |
| backtest.col.exit_time | Çıkış zamanı | Exit time | Ausstiegszeit |
| backtest.col.price | Güncel fiyat | Current price | Aktueller Kurs |
| backtest.col.pnl | K/Z | P&L | G/V |
| backtest.col.net | Net K/Z | Net P&L | Netto-G/V |
| backtest.col.commission | Komisyon | Commission | Kommission |
| backtest.col.reason | Sebep | Reason | Grund |
| backtest.col.rr | R:R | R:R | CRV |
| backtest.col.actions | İşlemler | Actions | Aktionen |
| backtest.dir.long | AL | BUY | KAUF |
| backtest.dir.short | SAT | SELL | VERKAUF |
| backtest.reason.tp | TP | TP | TP |
| backtest.reason.sl | SL | SL | SL |
| backtest.reason.manual | Manuel | Manual | Manuell |
| backtest.reason.ambiguous | Aynı 1 dakikalık mumda TP ve SL (SL varsayıldı) | TP and SL in the same 1-minute candle (SL assumed) | TP und SL in derselben 1-Minuten-Kerze (SL angenommen) |
| backtest.pos.close | Kapat | Close | Schließen |
| backtest.pos.edit | SL/TP düzenle | Edit SL/TP | SL/TP bearbeiten |
| backtest.pos.empty | Açık pozisyon yok. | No open positions. | Keine offenen Positionen. |
| backtest.pos.modal_title | Pozisyonu düzenle | Edit position | Position bearbeiten |
| backtest.pos.unsaved | Kaydedilmedi | Not saved | Nicht gespeichert |
| backtest.history.empty | Henüz kapanan işlem yok. | No closed trades yet. | Noch keine geschlossenen Trades. |
| backtest.history.more | Son {n} işlem gösteriliyor. | Showing the last {n} trades. | Die letzten {n} Trades werden angezeigt. |
| backtest.stat.balance | Bakiye | Balance | Saldo |
| backtest.stat.equity | Özsermaye | Equity | Eigenkapital |
| backtest.stat.realized | Gerçekleşen K/Z | Realized P&L | Realisierter G/V |
| backtest.stat.floating | Açık K/Z | Open P&L | Offener G/V |
| backtest.stat.return | Getiri | Return | Rendite |
| backtest.stat.trades | Kapanan işlem | Closed trades | Geschlossene Trades |
| backtest.stat.win_rate | Win Rate | Win Rate | Win-Rate |
| backtest.stat.profit_factor | Profit Factor | Profit Factor | Profit Faktor |
| backtest.stat.expectancy | Beklenti | Expectancy | Erwartungswert |
| backtest.stat.max_dd | Max Drawdown | Max Drawdown | Max. Drawdown |
| backtest.stat.avg_rr | Ort. planlanan R:R | Avg planned R:R | Ø geplantes CRV |
| backtest.stat.commission | Toplam komisyon | Total commission | Kommission gesamt |
| backtest.stat.ambiguous | Belirsiz çıkış | Ambiguous exits | Mehrdeutige Ausstiege |
| backtest.stat.currency_note | Tutarlar USD cinsindendir. | Amounts are in USD. | Beträge in USD. |
| backtest.group.forex | Forex | Forex | Devisen |
| backtest.group.gold | Metaller | Metals | Metalle |
| backtest.group.crypto | Kripto | Crypto | Krypto |

Owner-decision keys:
- `nav.backtest` = `Backtest` in all three languages (O1).
- The `UpgradeModal` own dictionary (`UpgradeModal.astro:537-640`; not the locale files), O6:
  - `notice_backtest_title`: `Backtest hesap limitine ulaşıldı` / `Backtest account limit reached` / `Backtest-Kontolimit erreicht`;
  - `notice_backtest_desc`: the `quota.free_reached` texts;
  - `notice_backtest_sub`: `Premium ile 10 hesaba kadar test yapın.` / `Upgrade to Premium to run up to 10 accounts.` / `Mit Premium nutzen Sie bis zu 10 Konten.`

---

## 6. `public/interface/backtest/css/backtest.css`
Rules:
- **Page-scoped.** The file loads only on `/backtest`. Modal rules are scoped to `.bt-modal`, so `UpgradeModal` (its own `ww-up-*` classes, `UpgradeModal.astro:5`) and other overlays are untouched.
- **Theme selectors.** Light-theme rules use a `.light-theme` ancestor (html gets the class before paint, `BaseHead.astro:206-218`; body gets it on DOMContentLoaded). Dark-only rules use `:root:not(.light-theme) body:not(.light-theme)` (`styles.css:2806`).
- **No custom-theme surfaces.** Premium custom themes rewrite `--surface/--border` (`BaseHead.astro:220-235`). The dark page therefore uses `#000` and neutral hairlines rather than the tinted variables (PROJECT_OVERVIEW.md:335; owner preference).

### 6.1 Class inventory
| Class | Element / role |
|---|---|
| `.bt-main` | page root; tokens; padding as `.dashboard-main` (`styles.css:294-300`) |
| `.bt-view` | list or replay section |
| `.bt-list-actions`, `.bt-quota` | quota chip + "Yeni hesap" |
| `.bt-accounts` | card grid `repeat(auto-fill, minmax(280px,1fr))` |
| `.bt-account-card` (+`.bt-card-head`, `.bt-card-title`, `.bt-card-chips`, `.bt-card-metrics`, `.bt-card-foot`, `.bt-card-journal`, `.bt-card-actions`) | account card (black in dark) |
| `.bt-skeleton` | card placeholder (black + shimmer; `styles.css:1880` `.skeleton` is `--surface2`, which is not pure black) |
| `.bt-empty`, `.bt-banner`, `.bt-banner-error`, `.bt-hint`, `.bt-error` | states and messages |
| `.bt-replay-head`, `.bt-back`, `.bt-replay-title`, `.bt-chip`, `.bt-chip-muted` | replay header |
| `.bt-toolbar`, `.bt-goto`, `.bt-transport`, `.bt-icon-btn`, `.bt-play`, `.bt-select`, `.bt-input`, `.bt-clock`, `.bt-clock-tz` | toolbar |
| `.bt-layout` | grid `minmax(0,1fr) 320px` |
| `.bt-chart-card`, `.bt-chart-top`, `.bt-legend`, `.bt-source`, `.bt-chart-wrap`, `.bt-chart`, `.bt-chart-overlay`, `.bt-chart-foot`, `.bt-attribution` | chart card (black, transparent canvas) |
| `.bt-side`, `.bt-card`, `.bt-stats`, `.bt-stat`, `.bt-stat-label` | side panel |
| `.bt-order`, `.bt-quote`, `.bt-btn-buy`, `.bt-btn-sell`, `.bt-spread`, `.bt-field`, `.bt-field-row` | order panel |
| `.bt-tables`, `.bt-tabs`, `.bt-panel`, `.bt-table-wrap`, `.bt-table`, `.bt-count`, `.bt-pos`, `.bt-neg`, `.bt-warn` | tables; side badges reuse `.badge.badge-long/.badge-short` (`styles.css:1568-1585`) |
| `.bt-modal` (+`.modal-header/.modal-body/.modal-footer/.modal-close`, `.modal-box-sm`, `.bt-spacer`, `.bt-btn-danger`, `.bt-btn-danger-ghost`) | modals; the inner parts are page CSS as in `strategies.css:766-830` |
| `.bt-num` | DM Sans tabular numbers |
| `.bt-sr` | visually hidden text (the app has no shared `.sr-only`) |

### 6.2 Critical rules (verbatim intent)
```css
/* tokens: dark = pure black (default), light = white. Modals sit outside .bt-main, so both carry the tokens. */
.bt-main, .bt-modal {
  --bt-surface: #000; --bt-field: #000;
  --bt-line: rgba(255,255,255,0.08); --bt-line-strong: rgba(255,255,255,0.14);
  --bt-up: #22c55e; --bt-down: #ef4444;              /* = WwChart.colors() dark (chart-theme.js:27-28) */
  color-scheme: dark;                                  /* native datetime picker readable on black */
}
.light-theme .bt-main, .light-theme .bt-modal {
  --bt-surface: #fff; --bt-field: #fff; --bt-line: #e2e8f0; --bt-line-strong: #cbd5e1;
  --bt-up: #16a34a; --bt-down: #dc2626;               /* = WwChart.colors() light */
  color-scheme: light;
}
.bt-main [hidden], .bt-modal [hidden] { display: none !important; }

/* surfaces */
.bt-account-card, .bt-chart-card, .bt-card, .bt-toolbar, .bt-tables {
  background: var(--bt-surface); border: 1px solid var(--bt-line); border-radius: var(--radius, 12px);
}
.bt-skeleton { min-height: 148px; background: var(--bt-surface); border: 1px solid var(--bt-line); position: relative; overflow: hidden; }

/* modal: the same intent as strategies.css:1067-1072, scoped to the backtest overlays */
.bt-modal .modal-box { background: var(--bt-surface); border-color: var(--bt-line); box-shadow: 0 24px 70px rgba(0,0,0,0.6); }
.light-theme .bt-modal .modal-box { box-shadow: 0 24px 60px -12px rgba(15,23,42,0.16); }
.bt-modal .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1.1rem 1.35rem; border-bottom: 1px solid var(--bt-line); }
.bt-modal .modal-body { padding: 1.25rem 1.35rem; overflow-y: auto; }
.bt-modal .modal-footer { display: flex; gap: 0.6rem; align-items: center; padding: 0.9rem 1.35rem 1.25rem; }
.bt-modal .modal-box-sm { max-width: 440px; }
.bt-spacer { flex: 1; }

/* inputs: black fields, neutral lines; DM Sans tabular */
.bt-input, .bt-select {
  background: var(--bt-field); border: 1px solid var(--bt-line-strong); border-radius: 8px; color: var(--text);
  font: 600 14px/1.2 'DM Sans', sans-serif; font-variant-numeric: tabular-nums; padding: 0.55rem 0.7rem; min-height: 38px;
}
.bt-select option { background: var(--bt-surface); }
.bt-input:focus, .bt-select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); }
.bt-field label { display: block; font: 600 11px 'DM Sans', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); margin-bottom: 0.35rem; }

/* numbers: DM Sans + tabular (never .stat-value: it asks for an unloaded 'Inter', styles.css:250-259; never JetBrains/DM Mono) */
.bt-num { font-family: 'DM Sans', sans-serif; font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; font-weight: 600; letter-spacing: -0.01em; }

/* headings: Syne, solid colour (reset the global gradient text fill, styles.css:232-248) */
.bt-replay-title h2, .bt-card-title, .bt-empty h2, .bt-modal .modal-header h3 {
  font-family: 'Syne', sans-serif; font-weight: 700; background: none; -webkit-text-fill-color: currentColor; color: var(--text); margin: 0;
}

/* chart */
.bt-chart-card { padding: 10px 10px 6px; }
.bt-chart-wrap { position: relative; }
.bt-chart { height: clamp(360px, 58vh, 720px); }          /* autoSize reads this box */
.bt-chart-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--bt-surface) 72%, transparent); font: 600 13px 'DM Sans', sans-serif; color: var(--muted); z-index: 3; }
.bt-legend { font-size: 12px; color: var(--muted); min-height: 18px; }
.bt-source { font-size: 11px; padding: 2px 8px; border: 1px solid var(--bt-line-strong); border-radius: 999px; color: var(--muted); white-space: nowrap; }
.bt-attribution { margin: 0; font-size: 11px; color: var(--muted); }
.bt-attribution a { color: inherit; text-decoration: underline; }

/* trading colours (buttons.css deliberately leaves sell/danger alone, buttons.css:5-6) */
.bt-btn-buy, .bt-btn-sell { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  min-height: 48px; border-radius: 10px; border: 1px solid; font: 700 13px 'DM Sans', sans-serif; cursor: pointer; }
.bt-btn-buy  { color: var(--bt-up);   background: color-mix(in srgb, var(--bt-up) 12%, transparent);   border-color: color-mix(in srgb, var(--bt-up) 55%, transparent); }
.bt-btn-sell { color: var(--bt-down); background: color-mix(in srgb, var(--bt-down) 12%, transparent); border-color: color-mix(in srgb, var(--bt-down) 55%, transparent); }
.bt-btn-buy:disabled, .bt-btn-sell:disabled { opacity: 0.45; cursor: not-allowed; }
.bt-pos { color: var(--bt-up); } .bt-neg { color: var(--bt-down); }

/* tables: neutral hairlines (not the purple --border of .ww-table, styles.css:1264-1286) */
.bt-table { width: 100%; border-collapse: collapse; }
.bt-table th { font: 600 11px 'DM Sans', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted);
  text-align: left; padding: 0.55rem 0.7rem; border-bottom: 1px solid var(--bt-line); white-space: nowrap; }
.bt-table td { font-size: 13px; padding: 0.55rem 0.7rem; border-bottom: 1px solid var(--bt-line); white-space: nowrap; }
:root:not(.light-theme) body:not(.light-theme) .bt-table tbody tr:hover td { background: rgba(255,255,255,0.03); }

.bt-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.bt-main :focus-visible, .bt-modal :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* layout */
.bt-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 12px; align-items: start; }
.bt-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 10px; margin: 10px 0; }
@media (max-width: 1100px) { .bt-layout { grid-template-columns: minmax(0, 1fr) 280px; } }
@media (max-width: 900px)  { .bt-layout { grid-template-columns: 1fr; } .bt-side { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } }
@media (max-width: 600px)  {
  .bt-side { grid-template-columns: 1fr; }
  .bt-chart { height: clamp(280px, 50vh, 460px); }
  .bt-goto, .bt-clock { flex: 1 1 100%; }
  .bt-accounts { grid-template-columns: 1fr; }
  .bt-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .bt-quote .bt-btn-buy, .bt-quote .bt-btn-sell { min-height: 52px; }
  .bt-icon-btn, .bt-select, .bt-input { min-height: 40px; }      /* touch targets */
  .bt-modal { align-items: flex-end; padding: 0; }
  .bt-modal .modal-box { border-radius: 16px 16px 0 0; max-height: 92dvh; }
}
@media (prefers-reduced-motion: reduce) { .bt-main *, .bt-modal * { animation: none !important; transition: none !important; } }
```
- **Tooltips.** Any hover card uses `.ww-tip`, which is already black in dark and white in light (`chart-theme.css:8-27,30-65`). The OHLC legend is plain text over the black card.
- **Chart canvas.** `WwChart.lwc()` keeps the canvas transparent (`chart-theme.js:157-158`), so the chart shows the black or white card.
- **Buttons.** `btn-primary`, `btn-ghost`, `btn-modal-*` take `buttons.css` (`#000` fill, `#7c3aed` 1 px outline; light: white, `buttons.css:10-45,105+`). `.bt-btn-danger` uses `var(--bt-down)`. `.bt-btn-danger-ghost` is red text on a transparent background.

---

## 7. Tests (node:test, vm pattern of `tests/trade-metrics.test.js:15-35`; run `node --test tests/*.test.js`)
Common loader (in each file):
```js
import { describe, it } from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const read = (p) => fs.readFileSync(path.resolve(p), 'utf8');
function load(files) {
  const win = { Intl, Date, Math, Number, String, Array, Object, RegExp, JSON, isNaN, isFinite, parseInt, parseFloat };
  win.window = win;
  for (const f of files) vm.runInNewContext(read('public/interface/backtest/js/' + f), win, { filename: f });
  return win;
}
const W = load(['bt-symbols.js', 'bt-candles.js', 'bt-engine.js']);
const S = W.WwBtSymbols, C = W.WwBtCandles, E = W.WwBtEngine;
const plain = (x) => JSON.parse(JSON.stringify(x));    // vm objects have foreign prototypes (deepStrictEqual)
```
Run time: the full new set targets under 2 s. The 156 baseline tests take about 0.45 s (conventions testBaseline).

### 7.1 `tests/bt-symbols.test.js` (cases from `scratch:agents3/symbols-scripts/test-hours.mjs`)
1. **Loaders.**
   - `[...S.validate()]` deep-equals `[]` (vm).
   - `await import(pathToFileURL(path.resolve('public/interface/backtest/js/bt-symbols.js')).href)` sets `globalThis.WwBtSymbols`, which proves the `globalThis` footer works.
2. **Derived fields.**
   - EURUSD: `point 0.00001`, `pointsPerPip 10`, `lotDigits 2`.
   - USDJPY: `point 0.001`, `pointsPerPip 10`.
   - XAUUSD: `point 0.01`, `pointsPerPip 10`.
   - BTCUSDT: `point 0.01`, `pointsPerPip 100`.
3. **`isOpen`** (UTC). EURUSD:
   - `2026-03-06T21:59Z` true, `22:00Z` false;
   - `2026-03-08T20:59Z` false, `21:00Z` true;
   - `2026-10-30T20:59Z` true, `21:00Z` false;
   - `2026-11-01T21:59Z` false, `22:00Z` true;
   - `2026-12-24T21:59Z` true, `22:00Z` false;
   - `2026-12-25T21:59Z` false; `2026-12-27T22:00Z` true.

   XAUUSD:
   - `2026-07-14T20:59Z` true, `21:00Z` false, `21:59Z` false, `22:00Z` true;
   - `2026-07-12T21:30Z` false, `22:00Z` true.

   BTCUSDT: `2026-12-25T12:00Z` true.
4. **`nextOpen`.**
   - EURUSD `2026-03-07T12:00Z` → `2026-03-08T21:00Z`;
   - EURUSD `2026-10-31T12:00Z` → `2026-11-01T22:00Z`;
   - XAUUSD `2026-07-14T21:10Z` → `22:00Z`;
   - EURUSD `2026-12-24T22:00Z` → `2026-12-27T22:00Z`;
   - EURUSD `2023-12-24T22:30Z` → `2023-12-25T22:00Z`;
   - XAUUSD `2023-12-24T23:30Z` → `2023-12-25T23:00Z`;
   - EURUSD `2024-01-01T10:00Z` → `2024-01-01T22:00Z`;
   - EURUSD `2026-03-10T10:00Z` → the same instant;
   - BTCUSDT `2026-03-07T12:00:30Z` → `12:01:00Z`.
5. **Reference grid.** A 60-minute grid from 2020-01-01 to 2027-01-01, for fx and metal, against the arithmetic US-DST reference copied from `test-hours.mjs:26-42` (about 123k points, about 0.6 s; the research ran a 15-minute grid).
6. **`nextOpen` property.** 300 seeded random minutes: the result is open, and every minute in between is closed.
7. **`dayAnchor`.**
   - EURUSD `2026-07-15T03:00Z` → `2026-07-14T21:00Z`; `2026-01-15T03:00Z` → `2026-01-14T22:00Z`; `2026-01-15T22:00Z` → itself; `2026-01-15T21:59Z` → `2026-01-14T22:00Z`.
   - BTCUSDT `2026-01-15T03:00Z` → `2026-01-15T00:00Z`.
8. **`pipValueUsd`.** EURUSD (1 lot, 1.1) = 10; XAUUSD (1, 4000) = 10; USDJPY (1, 150) = 1000/150; BTCUSDT (1, 1e5) = 1 (all within 1e-9). **`spreadPoints`:** (0.2, EURUSD) = 2, (2, XAUUSD) = 20, (10, BTCUSDT) = 1000, (0.15, EURUSD) = 2.
9. **New `tradingDayKey`** (verified in `check-numbers.mjs`).
   - EURUSD: `2026-08-31T21:00Z` → `'2026-09-01'`; `2026-09-01T03:00Z` → `'2026-09-01'`; `2026-09-01T20:59Z` → `'2026-09-01'`.
   - BTCUSDT `2026-09-01T23:59Z` → `'2026-09-01'`. This is the crypto `%1440` case.
10. **New `priceFormat`.** EURUSD → `{type:'price', precision:5, minMove:0.00001}`; XAUUSD → `precision 2, minMove 0.01`.

### 7.2 `tests/bt-candles.test.js` (cases from `test-math.mjs:80-124` + `stage4-proto.mjs`)
Synthetic data comes from the seeded generator `synth(id, fromIso, toIso, start)`, which emits a bar only where `isOpen` (`test-math.mjs:82-90`), converted with `toMinutes(rows, digits, {points:true})`.
1. **Tables.** `TF_MIN['4h'] === 240`; `TF_LABEL['1d'] === 'D1'`; `historyMonths` = `{1:1,5:1,15:1,30:2,60:2,240:4,1440:10}`.
2. **Month keys.** `monthKey(1706745600) === '2024-02'`; `monthStart('2024-02') === 1706745600`; `nextMonth('2024-12') === '2025-01'`; `prevMonth('2020-01') === '2019-12'`.
3. **`toMinutes`.** `[1704067200, 1.08311, 1.0832, 1.083, 1.08315]` with digits 5 → `o 108311, h 108320, l 108300, c 108315`. `81600.25` with digits 2 → `8160025`. `150.987` with digits 3 → `150987`. A repeated or decreasing `t` is dropped and counted in `.bad`.
4. **D1 across the DST end** (EURUSD, 2026-10-25..11-08): 10 candles at `2026-10-25T21:00, 10-26T21:00, 10-27T21:00, 10-28T21:00, 10-29T21:00, 11-01T22:00, 11-02T22:00, 11-03T22:00, 11-04T22:00, 11-05T22:00`, every `n === 1440`.
5. **H4.** 60 candles of `n === 240`; `slice(30,36)` times are `22:00, 02:00, 06:00, 10:00, 14:00, 18:00`.
6. **Gaps.** Remove 2026-10-27 10:00–10:30 and 12:00–13:00. H1 `n` at 10 = 30, 11 = 60, and there is no candle at 12.
7. **`partialAt`** at k=3000 for H4 equals the filtered aggregate: same `time`, `n`, `open`, `close = c_k`, `high` and `low`.
8. **Month boundary.** `bucketStart(2026-09-01T03:00Z, 1440, 'EURUSD')` → `2026-08-31T21:00Z`. For every TF in `TF_MIN`, splitting the 2026-08-28..09-04 data at `2026-09-01T00:00Z` gives `merge(aggregate(a), aggregate(b))` deep-equal to `aggregate(a∪b)`.
9. **Crypto and gold.**
   - BTCUSDT `2026-11-04T13:37Z`: D1 → `2026-11-04T00:00Z`, H4 → `12:00Z`.
   - XAUUSD 2026-11-01..04: first D1 = `2026-11-01T22:00Z` with `n === 1380`; first H4 `n === 180`.
10. **Builder equals batch.** For each TF and each k in `[0, 17, 1439, 2000, cut−1, cut, n−1]`, pushing bars `0..k` gives `aggregate(0..k)`.
11. **No future.** Every candle time is ≤ `t_k`, the last close equals `c_k`, and bars after `k` change nothing: aggregate the sliced data and compare.
12. **`bucketEndIndex` / `stepTarget`.**
    - H1 at `2026-09-02T10:17Z` → `10:59Z`.
    - At the last bar → `n−1` with `open: true`.
    - At `10:59` → the next bucket's last bar (`11:59`).
    - D1 from Friday's last bar `2026-08-28T20:59Z` → `2026-08-31T20:59Z`. The weekend is skipped and Monday's trading day starts Sunday 21:00Z.
13. **`gapKind`.**
    - EURUSD `2026-08-28T20:59Z` → `2026-08-30T21:00Z` = `{kind:'closed'}`.
    - `2026-09-01T09:59Z` → `10:30Z` = `{kind:'missing', minutes:30}`.
    - 60 s → `null`.
14. **`framePlan`.**
    - `(0, 16.67, 1, 60, 3000)` → `n 1`.
    - `(0, 16, 0.1, 1, 3000)` → `n 0`, `acc ≈ 0.0016`.
    - `(0, 1000, 10, 1440, 3000)`: dt is clamped to 250 ms, giving 3600 → `n 3000`, `acc 600`.
    - `(2900, 250, 10, 1440, 3000)` → `n 3000`, and the rest 3500 > max is dropped → `acc 0`.
    - `dt` 5000 equals `dt` 250.

### 7.3 `tests/bt-engine.test.js` (verified numbers; `check-numbers.mjs`, `stage4-proto.mjs`, `bt-mapping-compact.mjs`)
1. **Decimal helpers.**
   - `parseScaled('1.083115',5,'round')` → `{value:108312, snapped:true}`.
   - `parseScaled('1,08311',5,'exact')` → `108311`.
   - `parseScaled('0.375',2,'exact').ok === false`; `('0,5',2,'exact')` → `50`; `'abc'` → `FORMAT`.
   - `scaledToStr(108311,5) === '1.08311'`, `(-5,2) === '-0.05'`, `(-0,2) === '0.00'`, `(8160025,2) === '81600.25'`.
   - `toPlainDecimalString(1e-7) === '0.0000001'`.
2. **Postgres `ROUND(·,2)` parity** (decimal strings → cents → string):
   - `1.005→1.01`, `-1.005→-1.01`, `2.675→2.68`, `1.045→1.05`;
   - `0.125→0.13`, `-0.125→-0.13`, `-0.005→-0.01`, `-0.0049→0.00`;
   - `41.44000000000037→41.44`, `1e-7→0.00`, `12345678.995→12345679.00`, number `41.44→41.44`.

   Also assert why `toFixed`/`Math.round` are banned (review correction, `inputs/w2/review_pnl-trigger.json` "corrections"):
   - `[1.005,-1.005,2.675,1.045].map(x=>x.toFixed(2))` → `['1.00','-1.00','2.67','1.04']`;
   - `Math.round(x*100)/100` → `[1,-1,2.68,1.05]`;
   - `Math.round(-0.125*100)/100 === -0.12`; `Object.is(Math.round(-0.005*100)/100, -0)`;
   - `(-1.255).toFixed(2) === '-1.25'` (PG gives -1.26).
3. **`roundDiv`.** `(5,10)=1`, `(-5,10)=-1`, `Object.is(roundDiv(-4,10),0)`, `(25,10)=3`, `(-25,10)=-3`, and the BigInt path `(2**60, 3)`.
4. **Money fixed cases.**
   - `grossCents('EURUSD',1,108311,108423,37) = 4144` and `commissionCents('EURUSD',700,37) = 259`: net 3885.
   - `grossCents('USDJPY',-1,151234,150987,100) = 16359`; commission 700; net `156.59`.
   - `grossCents('XAUUSD',1,200000,200005,1) = 5`; `commissionCents('XAUUSD',50,1) = 1` (a 0.005 tie goes away from zero).
   - `grossCents('BTCUSDT',1,10000000,10012345,1) = 123`; `(-1,…,10012350) = -124`.
   - EURUSD SHORT 1.10000→1.10123, 50 steps: `-6150`, commission `350`, net `-6500`.
5. **`rrHundredths`.** `(108311,108111,108711) = 200`; `(110000,109992,110011) = 138` (float+`toFixed` gives 1.37); `(100000,99000,101005) = 101` (tie 1.005); `(100000,100000,100400) = null`.
6. **`spreadPts`** from hundredths: `(EURUSD,20)=2`, `(EURUSD,15)=2`, `(XAUUSD,200)=20`, `(BTCUSDT,1000)=1000`, `(USDJPY,30)=3`.
7. **Fills and triggers** (`test-math.mjs:62-77`, lower-case reasons, spread 2):
   - `marketFill(1,108300,2)=108302`, `(-1)=108300`; `closeFill(1)=108300`, `(-1)=108302`.
   - LONG `{sl:108200,tp:108500}`:
     - `[0,108300,108499,108201,108300]` → null;
     - `[…,108500,108250,…]` → tp 108500;
     - `[0,108300,108550,108150,108300]` → `{reason:'sl', pts:108200, ambiguous:true}`;
     - gap `[0,108150,108160,108100,108120]` → sl at 108150;
     - gap over TP `[0,108600,…]` → tp at 108500.
   - SHORT `{sl:108400,tp:108100}`:
     - `[0,108300,108397,108099,108300]` → null;
     - high 108398 → sl 108400;
     - low 108098 → tp 108100;
     - gap `[0,108450,108460,108440,108450]` → sl at **108452** (ask open).
8. **Scenario: manual close.** EURUSD, start 10,000.00, spread 2, commission 7.00. Quote `[T0,108300,108312,108295,108309]`. BUY 37 steps with SL 108111 and TP 108711:
   - entry 108311, comm 259, rr 200, entryT `T0+60`;
   - `onBar` on the entry bar is skipped (entry-bar exclusion), even with low 108100;
   - the next bar closes at 108423: floating gross 4144, net 3885;
   - manual close: exit 108423, net 3885, exitT `T0+120`, exitBarT `T0+60`;
   - balance `'10038.85'`.
9. **Scenario: TP on the next bar.** Bar `[T0+60,108320,108720,108300,108700]` → `tp` at 108711, exitT `T0+60`, gross 14800, net `'145.41'`.
10. **Scenario: same bar.** Spread 2, commission 0, 100 steps, SL 108200, TP 108500. Bar `[T0+60,108300,108550,108150,108300]` → `sl`, `ambiguous:true`, gross `-10200`.
11. **Scenario: SHORT gap after a weekend.** Bar at `T0+3d` opening 108450 → `sl` at 108452, exitT = bar open.
12. **`validateOrder`** (bid 108300 / ask 108302):
    - BUY TP 108302 → `TP_LONG`, 108303 → ok; BUY SL 108300 → `SL_LONG`, 108299 → ok;
    - SELL TP 108300 → `TP_SHORT`, 108299 → ok; SELL SL 108302 → `SL_SHORT`, 108303 → ok;
    - steps 0 / 10001 → `LOT_RANGE`, 10000 → ok;
    - a 21st position → `MAX_POSITIONS`;
    - equity ≤ 0 → `NO_EQUITY`.
13. **`preview`.** BUY 37 steps, SL 108111, TP 108711, commission 7 → `{entry:108311, riskCents:7659, rewardCents:14541, rr:200}`.
14. **`summary` drawdown.** Start 1,000.00 with nets `+100, −300, +50, −100` → balance 750.00, `maxDdCents 35000`, `maxDdBp 3182` (31.82 %).
15. **DB mapping.**
    - `tradeInsertRow` for scenario 8: `{direction:'LONG', lot:'0.37', entry_price:'1.08311', stop_loss:'1.08111', take_profit:'1.08711', commission:'2.59', rr_ratio:'2.00', entry_time: ISO(T0+60)}` with no `exit_*` and no `pnl`.
    - `tradeClosePatch` → `{exit_price:'1.08423', exit_reason:'manual', pnl:'38.85', gross_pnl:'41.44', exit_ambiguous:false}`.
    - `restore()` from PostgREST-style numbers (`lot 0.37, entry_price 1.08311, pnl 38.85, commission 2.59`) round-trips to the same points, steps and cents.
    - `accountInsertRow` produces strings `'10000.00'`, `'0.20'`, `'7.00'`.
16. **Fuzz.** 20,000 seeded random trades across all six symbols. `grossCents` and `rrHundredths` equal the BigInt decimal reference ported from `test-math.mjs:8-25`. The research ran 200,000.

### 7.4 `tests/bt-i18n.test.js` (small; protects every page)
- `import()` each of `public/i18n/locales/{tr,en,de}.js`. A syntax error there would break i18n on all pages.
- The `backtest.*` key sets of the three locales are equal, and no value is empty.
- Every `data-i18n|data-i18n-placeholder|data-i18n-title="backtest.…"` in `src/pages/backtest.astro` exists in all three. Extract them with a regex.

---

## 8. Stage 4 "app still works" checklist and the navbar option

### 8.1 Checklist (before handing the branch to the owner)
| # | Check | How |
|---|---|---|
| 1 | Unit tests | `node --test tests/*.test.js`: baseline 156 plus the new tests, 0 failing (not `node --test tests/`, which fails on Node 25) |
| 2 | Build | `npx astro build` with no new dependency (`package.json` unchanged) |
| 3 | Locales load | covered by `tests/bt-i18n.test.js`; also a manual language switch tr → en → de on `/dashboard` and `/backtest` |
| 4 | Direct load | `/backtest` and `/backtest.html` with a hard reload: list renders, no console errors, `requireAuth` redirects when logged out |
| 5 | SPA in/out | dashboard → backtest → trades → backtest → premium-dashboard → backtest with no full reload (same LWC URL), no "already declared" errors, list re-initialises on each visit (`data-page-script`) |
| 6 | R26 | start Play, navigate away through the navbar; DevTools Performance shows no RAF or timer callbacks from backtest.js; nothing is appended to `body`; `wwPage` cleanups ran |
| 7 | Theme | toggle light/dark in Settings, come back: cards, modals, chart, tooltips and inputs are `#000` in dark and white in light; the chart rebuilds on a live toggle |
| 8 | Accounts | create (free user) → open → back. A second create as a free user shows the toast and the upgrade modal, with no lock icon. Edit name, spread and commission; spread is locked with an open position. Delete → cascade, card gone. |
| 9 | Replay | resume at the saved time after a reload. Step (H1, H4, D1 across a weekend and a month end), +1m, Play at each speed, go-to forward/backward rules, TF switch keeps the cursor. A D1 candle forms over 1m steps. |
| 10 | Engine | BUY/SELL with SL/TP; TP and SL auto-close during Play (markers, lines, toasts); edit SL/TP; manual close; the balance equals the start plus Σ net (history table); reload keeps open positions |
| 11 | Data states | a month missing from the manifest (staging/mock) shows the banner and skip; end of archive; offline (DevTools) shows load error and retry; a write failure shows the save banner and recovers |
| 12 | Mobile | 375 px and 768 px: toolbar wraps, chart ≥ 280 px, order buttons ≥ 48 px, tables scroll, bottom-sheet modals |
| 13 | Other pages | dashboard and premium-dashboard charts unchanged. No backtest data appears in trades, dashboard, calendar or journals (Stage 4 never writes `trades`). UpgradeModal unchanged unless O6. |
| 14 | Demo / prerender | `?test=1` logged out shows the demo notice with no requests to backtest tables or Storage. Hovering a `/backtest` link (speculation rules) causes no writes. |
| 15 | Cache | `sw.js` `CACHE_VERSION` bumped; the first visit after deploy serves the new HTML; `i18n.js:126` bumped |
| 16 | Attribution | `TradingView Lightweight Charts™` link and copyright visible under the replay chart (R27) |

### 8.2 Navbar link (owner decision O1; none exists today)
Facts:
- The shared navbar never had a Backtest link (`git log -S backtest` on the nav files is empty).
- `nav.backtest` does not exist.
- The only link was inside the old page's duplicate `<nav>` (`backtest.astro:199`), which Stage 2 removes.

So R8's "keep the navbar Backtest link" cannot be met literally. Without a link, `/backtest` is reachable only by URL. If approved:
1. `src/components/Navbar.astro:4-16`: add `if (page === 'backtest' && pathname.includes('/backtest')) return true;` to `isActive`.
2. `src/components/Navbar.astro:71-77`: after the calendar link (75), add `<a href="/backtest.html" data-page="backtest" class={`loaded ${isActive('backtest') ? 'active' : ''}`}><span data-i18n="nav.backtest">Backtest</span></a>`. No PRO tag: free users get one account.
3. `src/components/Navbar.astro:207-210`: add `'nav.backtest': 'Backtest'` to the en and de pre-hydration dictionaries.
4. `src/components/Navbar.astro:293-310`: in the mobile "GENEL" section, add a link with `<i data-lucide="history">` (confirm the icon name exists in lucide 0.441.0).
5. `public/components/navbar/navbar.js`:
   - the same desktop link in the fallback `getNavbarHTML` (`1127-1133`);
   - the same mobile link (`1286-1297`, with `closeMobileMenuAndNavigate`);
   - in `setActiveNavLink` (`1722-1729`): `if (currentPath.includes('/backtest') && href === '/backtest.html') return true;`.
6. Locales: `"nav.backtest": "Backtest"` in tr, en and de. Bump `navbar.js?v=` at `Layout.astro:76`.
7. Visual check at 768–980 px, where links are already compact (`navbar.css:3507-3510`). A sixth link may crowd that width.

`/backtest` is already in `SPA_PATHS` (`SpaRouter.astro:71`) and `APP_PATHS` (`page-transition.js:68-69`, prefetch plus the bfcache logout guard at `651-663`).

---

## 9. Open issues and cross-track contracts (for the lead)
- **I-1 TP/SL edit versus "initial levels" (D4/D5 vs D8).**
  - The conflict:
    - D8 wants TP/SL editing on open positions.
    - D4/D5 want `rr_ratio` and the Stage 5 mirror based on the initial SL/TP.
    - D3 has only `stop_loss/take_profit`. Those must hold the current levels so triggers resume after a reload.
  - This plan:
    - writes `rr_ratio` once at insert from the initial levels;
    - never recomputes it;
    - updates only `stop_loss/take_profit` on edit.
  - Consequence: after an edit, the initial levels are lost from the DB. Stage 5 would then mirror the final levels, and `trg_calc_pnl` would recompute `trades.rr_ratio` from them (`db/fn_calc_trade_pnl.sql:9-26`), so it can differ from the backtest row's `rr_ratio`. P&L is unaffected.
  - Fixes: owner decision O2.
- **I-2 Write contract for `trg_check_backtest_trade` immutables (D3).**
  - The client writes exactly the table in §2.5.6, with a client-generated `id` on insert. It stores `commission` (snapshot) and `rr_ratio` on the open row, then updates `stop_loss/take_profit` on open rows and `exit_*`, `pnl` (+ `gross_pnl`, `exit_ambiguous`) once at close.
  - The DB track must allow exactly these. If it requires `commission = 0` while open, the alternative is to compute commission at close and lock commission edits while positions are open, like spread.
- **I-3 Error codes from Migration 02.** The client maps the quota error by substring (assumed `BACKTEST_LIMIT_EXCEEDED`, following `PROP_LIMIT_EXCEEDED:%`) and `INVALID_JOURNAL`. The DB track must confirm the exact strings.
- **I-4 UTC-midnight timestamps** (affects Stage 5/6).
  - The problem:
    - `WwTime.classify` treats any `ms % 86400000 === 0` as date-only (`time-settings.js:186-189`).
    - Crypto bars open at 00:00Z daily, so TP/SL exit times there are exactly midnight.
    - Entries placed on a 23:59 bar get `entry_time = 00:00:00Z`.
  - The backtest page formats every bar or trade time with Intl directly (§3.7).
  - Stage 5/6 consequence: such mirrored `trade_date`/`exit_date` values appear in the journal without a time and are keyed to the UTC date (`WwTime.dateKey`). Stage 6 must decide how to handle them (for example, never classify `platform_source='backtest'` rows as date-only).
- **I-5 bt-data constraints** (§2.4 items 1–6).
  - Persistent cache in IndexedDB, not Cache Storage: `sw.js:13-21` deletes foreign caches on each SW update.
  - No web storage: size, and the bfcache fingerprint at `page-transition.js:35-50`.
  - Partial-month freshness, shared in-flight promises, and a `coverage()` that returns `firstT/lastT/months/partial/updatedAt`.
- **I-6 Tick placement.** LWC 4.1.3 computes tick weights from UTC boundaries, so for non-UTC users a day tick can sit at local 03:00 with a local-date label. Crosshair, legend and clock are exact. Pseudo-UTC shifting fixes ticks but breaks 24/7 crypto at the DST fall-back (D4), so this is accepted as cosmetic. Moving to LWC 5 later (with `horzScaleBehavior`) would mean changing all three chart pages at once (`SpaRouter.astro:127-140`).
- **I-7 "Future never visible" is enforced in the UI only.** Month files come down whole (R41). Future rows sit in memory and are never drawn or used by the engine. A user with devtools can read them. That is acceptable for a self-training tool; a strict cut-off would need a server API (`inputs/w1/inventory_get-candles.json` replayFit (g)).
- **I-8 Spread is not snapshotted per trade.** D3 has no column, so spread edits are locked while positions are open. Commission is snapshotted through `commission` at insert.
- **I-9 Account summaries are computed client-side** from all trade rows, paged by 1000. Fine for hundreds to low thousands of trades. Beyond that, the DB track could add a per-account summary view or RPC (optional).
- **I-10 Journal select in Stage 4 is inert until Stage 5** (honest hint text). It is visible by default to satisfy R22; owner decision O4 can hide it.
- **I-11 i18n staleness.**
  - Root-level `i18n.js` and locale files are SW cache-first (`sw.js:50-65`). The first visit after a deploy can run the old i18n.js, so the new `backtest.*` keys are missing.
  - Mitigations:
    - `_t(key, fallbackTR)` shows the Turkish fallback instead of the key;
    - the page's own `/i18n.js?v=` is bumped;
    - `i18n.js:126` is bumped.
- **I-12 Same account in two tabs.** `replay_time` is last-write-wins. Double closes are prevented by `.is('exit_time', null)` plus the reload (`err.closed_elsewhere`). Concurrent opens in two tabs are not reconciled live (out of scope).
- **I-13 Order validation is stricter than the research.** BUY needs `TP > ask`; SELL needs `TP < bid`. This avoids "TP at a loss" inside the spread (§4.2).
- **I-14 bt-symbols additions** (`tradingDayKey`, `priceFormat`) belong in 3B if 3B ships first. The prototype's private `tradingDate()` is wrong for crypto `dayStart '00:00'`; it is used only in `isHoliday` for fx/metal, so the importer is unaffected.
- **I-15 TradingView attribution is still missing on dashboard and premium-dashboard** (D10 item; same license). Not in Stage 4 scope.
- **I-16 `PROJECT_OVERVIEW.md:301`** says every page calls `requireAuth()`. After Stage 4 this is true for `/backtest` again. Update the route row at line 168 ("sayfa içi script / Edge Function").

---

## 10. Owner decisions (with recommendations)
| # | Question | Recommendation |
|---|---|---|
| O1 | Add a Backtest link to the shared navbar? (none exists; §8.2) | **Yes.** It meets the intent of R8. No PRO tag, no lock icon. |
| O2 | TP/SL editing versus initial levels (I-1): (a) add `initial_stop_loss/initial_take_profit` to `backtest_account_trades` (one more column pair in M02); (b) no TP/SL editing after open; (c) accept final-level mirroring in Stage 5 | **(a).** Cheap, keeps D4/D5 exact, keeps editing (D8). |
| O3 | Same-1m-bar TP+SL rule: SL first + `exit_ambiguous` flag (D4/D10) | Keep **SL first + flag**. |
| O4 | Journal select in Stage 4: visible but inert until Stage 5 (hint says so), or hidden until bt-sync ships | **Visible** (R22 lists it in Stage 4), with the honest hint. |
| O5 | Archive (`is_active=false`) UI: "Archive / Activate" on cards so free users can keep history and start another account | Optional. **Not in Stage 4** (D8 does not list it). The schema already supports it (D3). |
| O6 | Upgrade prompt text for the backtest quota: add a `backtest` notice to `UpgradeModal.astro` (its own tr/en/de dictionary, §5), or use the generic "Feature not included" text | **Add it** (small edit to a shared component; recheck on dashboard). |
| O7 | Go-to-date rules: blocked with open positions; forward-only once the account has trades | **Approve** as specified. |
| O8 | Expanded chart (centered modal through `WwChartViewer`) for the replay chart | **Not in v1.** The replay chart already fills the page; if wanted later, use `WwChartViewer` (owner preference: centered modal, not full screen). |
| O9 | Extra columns `gross_pnl` and `exit_ambiguous` (D3/D10) | **Yes.** The page writes them when `EXTRA_COLUMNS = true`; otherwise those two keys are omitted. |

---

## Appendix A: verification scratch
- **`scratch:plan/frontend/verify/check-numbers.mjs`.** Re-runs the verified prototypes (`bt-symbols.js`, `bt-math.js`, copied next to it) for every money, rr, spread, tradingDay, dayAnchor, drawdown and `toMinutes` number used in §7. It prints the JS `toFixed`/`Math.round` behaviours. Passes.
- **`scratch:plan/frontend/verify/stage4-proto.mjs`.** A scratch implementation of the APIs specified here:
  - `parseScaled`, `scaledToStr`, Postgres rounding parity, DB strings and the restore round trip;
  - engine state (`openPosition`, `onBar`, `closePosition`, `floating`, `summary`, `preview`, `validateOrder` side checks, `MAX_POSITIONS`, `NO_EQUITY`);
  - `merge`, `createBuilder` (equals `aggregate` for all 7 TFs at 7 cursors), `bucketEndIndex`, `stepTarget` (including the D1 weekend step), `gapKind`, `framePlan`.

  It asserts every scenario in §7.3 items 1, 2 and 8–15 and §7.2 items 3, 8, 10, 12, 13 and 14. Passes in about 0.3 s on Node v25.

Neither file is repo code; both live outside the repository.
