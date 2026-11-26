# Wawe Journal

Wawe Journal is a web-based trading journal with an AI coach. Traders log their trades or sync them automatically from cTrader, MetaTrader 5 and MetaTrader 4, group them into journals (accounts), analyse their performance, track prop firm challenges, practise in a candle-by-candle backtest replay, and ask an AI coach about their own data.

Live at [wawejournal.com](https://wawejournal.com). The UI is available in English, Turkish and German.

## Features

- **Journal** – multiple journals per user, manual and quick-add trade entry, CSV/XLSX import (MetaTrader, cTrader, TradingView, Binance, Bybit, IBKR, XTB, OANDA and generic files), strategies, emotion tags, notes with voice dictation, CSV/PDF export. Each journal chooses which trades it shows (live, backtest or all).
- **Analytics** – dashboard and the Pro analytics page: equity curve, win rate, profit factor, expectancy, drawdown, R multiples, per-strategy and per-session performance, a trading calendar and overtrading warnings. Statistics use closed trades only.
- **Broker auto-sync**
  - **cTrader** – OAuth connection; the user picks which accounts to link, optional sync on every visit, balance kept up to date.
  - **MetaTrader 5 and 4** – the free, read-only **WaweSync** Expert Advisor (`integrations/mt5`, `integrations/mt4`) runs in the user's own terminal. It shows a 6-digit pairing code on the chart; after the code is entered on the site, closed positions (partial closes merged into one trade, broker server time converted to UTC) arrive automatically. No MetaTrader password is ever asked for.
- **Prop firm tracking** – challenge rules (profit target, daily and max drawdown, consistency), progress cards, notifications and the chance to pass a challenge (Monte Carlo simulation with the trader's own trades).
- **Backtest** – candle-by-candle replay on virtual accounts with orders, drawing tools, multi-chart layouts and statistics. Candles are synthetic or come from the user's own cTrader account (cached in the browser). Closed backtest trades can be mirrored into a journal and never mix with live statistics.
- **AI coach** – a chat on every app page that answers from the trader's own journal, strategies, prop challenges and backtest accounts, and reads chart screenshots. Five coach personas chosen by the trader's main problem (psychology, overtrading, discipline, risk, general) with a selectable tone; charts in answers built from the app's numbers; a trading plan with a discipline score; weekly review and weekly goal; daily commitments; confirm-to-apply action cards; live rule-based alerts after new trades. Google Gemini with free OpenRouter models as fallback. Daily message limits per plan (Free 5, Pro 50), reset at 00:00 UTC.
- **Economic calendar** – Forex Factory, CryptoCraft, MetalsMine and EnergyExch events in the navbar and on the calendar page, filtered by the trader's pairs and available to the coach.
- **Help and content** – help center (`/support`), blog guides, a trading glossary, position size and risk of ruin calculators, platform integration and comparison pages.
- **Accounts and billing** – Supabase Auth with Cloudflare Turnstile, Free and Pro plans, card payments through Creem and crypto payments through NOWPayments, a partner programme with discount codes and an earnings page, a theme studio with accent colours and light palettes.
- **Admin** – admin panel with users, payouts and reports, and phone notifications (Web Push) for new members, Pro sales, bug reports and payout requests.

## Tech stack

- **Frontend:** [Astro](https://astro.build) 7 (static output) with vanilla JavaScript modules and a small SPA router. Charts use ApexCharts and Lightweight Charts, loaded from a CDN. PWA with a service worker.
- **Backend:** [Supabase](https://supabase.com) – Postgres with row level security, Auth, Storage, Realtime and Edge Functions (Deno) in `supabase/functions`.
- **AI:** Google Gemini (streaming) with OpenRouter fallback models, called only from the `ai-coach` Edge Function.
- **Hosting:** Cloudflare Pages (`wrangler.toml`); production deploys from the `master` branch.
- **Tests:** Node's built-in test runner (`tests/`), plus headless-Chrome smoke tests for the backtest page (`tests/smoke`).

## Running locally

Requirements: Node.js 22.23.4 or newer (`engines` in `package.json`).

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static site in dist/
npm test           # node --test tests/*.test.js
```

### Use your own Supabase project

Out of the box the app points at the hosted Wawe Journal backend. To run your own copy:

1. Create a Supabase project.
2. Apply the SQL files in `supabase/migrations/` in filename order (SQL Editor or `psql`). Do not use `supabase db push`: the migrations were applied by hand and the history table is not maintained. Rollbacks for the newer migrations are in `supabase/rollbacks/`.
3. Set your project URL and anon key. Copy `.env.example` to `.env`, then also update the defaults in `public/config.js` and `public/src/core/config.js`, which are what the browser actually reads.
4. Optionally deploy the Edge Functions:
   ```bash
   npx supabase functions deploy <name> --project-ref <ref> --use-api
   ```
   `mt5-bridge`, `create-payment`, `nowpayment-webhook`, `admin-notify` and the `ctrader-*` and `creem-*` functions must be deployed with `--no-verify-jwt`; they do their own authentication.
5. Set the function secrets (`supabase secrets set ...`):
   - cTrader: `CTRADER_CLIENT_ID`, `CTRADER_CLIENT_SECRET`
   - AI coach: `GEMINI_API_KEY`, `OPENROUTER_API_KEY` (optional model lists: `GEMINI_MODELS`, `OPENROUTER_MODELS`, `OPENROUTER_VISION_MODELS`)
   - Payments: `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET`, `CREEM_PRODUCT_MONTHLY`, `CREEM_PRODUCT_YEARLY`, `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET` (optional `NOWPAYMENTS_ENV`, `NOWPAYMENTS_WEBHOOK_URL`, `NOWPAYMENTS_ALLOWED_IPS`)
   - Auth and limits: `TURNSTILE_SECRET_KEY`, optional `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
6. Optional admin phone notifications: `node scripts/admin-push-setup.mjs` generates the VAPID keys (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) straight into the function secrets, then deploy `admin-notify`. Migration `202611080001_admin_push_notifications.sql` calls the function URL of this project; change it in the migration for another project. Turn it on per device in the admin panel → Telefon Bildirimleri.
7. MetaTrader: the EA sources point at this project's `mt5-bridge` URL (`WAWE_HOST` / `WAWE_ENDPOINT` in `integrations/mt5/WaweSync.mq5` and `integrations/mt4/WaweSync.mq4`). Change them, compile with MetaEditor (the MT5 MetaEditor cannot compile `.mq4`; use an MT4 terminal's), and put the `.ex5` / `.ex4` files in `public/downloads/`.

Never commit real keys. Only the Supabase anon (publishable) key and the Turnstile site key belong in client code; the service role key and all secrets above stay on the server.

## Project layout

```
src/pages/            Astro pages (app, landing, blog, glossary, tools, support, ...)
public/interface/     per-page JavaScript and CSS (dashboard, trades, journals, backtest, ...)
public/components/    shared UI (navbar, AI coach panel, ...)
public/src/           shared client code and the bundled entry script
public/i18n/          translations (en, tr, de)
supabase/migrations/  database schema, in filename order; supabase/rollbacks/ undoes the newer ones
supabase/functions/   Edge Functions; shared logic in _shared/
integrations/         WaweSync Expert Advisor sources for MetaTrader 5 and 4
scripts/              setup, demo data and performance tooling
tests/                unit tests; tests/smoke/ backtest browser tests
docs/                 dated release, handoff and daily notes (Turkish)
PROJECT_OVERVIEW.md   detailed architecture notes (Turkish)
```

## License

Licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only). If you run a modified version as a network service, you must offer its source code to the users of that service.
