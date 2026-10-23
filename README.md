# Wawe Journal

Wawe Journal is a web-based trading journal. Traders log their trades, group them into journals (accounts), analyse performance with statistics and charts, track prop firm challenge rules, sync trades automatically from cTrader, and practise strategies in a candle-by-candle backtest replay.

The UI is available in Turkish, English and German.

## Features

- **Journal** – multiple journals per user, manual and quick-add trade entry, CSV/XLSX import, strategies, tags and notes, CSV/PDF export. Each journal can choose which trades it shows (live, backtest or all).
- **Analytics** – dashboard and premium dashboard with equity curve, win rate, profit factor, drawdown, calendar view, per-strategy performance, and overtrading warnings. Statistics are computed from closed trades only.
- **Prop firm tracking** – prop account rules (profit target, daily and max drawdown, consistency), progress cards and notifications.
- **cTrader sync** – connect a cTrader account through OAuth; a Supabase Edge Function imports deals as trades and keeps the balance up to date.
- **Backtest** – replay candles one bar at a time on virtual accounts, place and manage orders, and have closed backtest trades mirrored into a journal. Candles are synthetic or come from cTrader. Backtest trades are kept separate from live statistics.
- **Accounts and billing** – Supabase Auth with Cloudflare Turnstile on login/register, a referral and partner programme, and crypto payments for premium plans through NOWPayments.

## Tech stack

- **Frontend:** [Astro](https://astro.build) 4 (static output) with vanilla JavaScript modules; React integration is installed but unused. Charts use ApexCharts and Lightweight Charts, loaded from a CDN.
- **Backend:** [Supabase](https://supabase.com) – Postgres with row level security, Auth, Storage, Realtime and Edge Functions (Deno) in `supabase/functions`.
- **Hosting:** Cloudflare Pages (`wrangler.toml`). PWA with a service worker.
- **Tests:** Node's built-in test runner (`tests/`).

## Running locally

Requirements: Node.js 18.17+ or 20.3+.

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static site in dist/
npm test           # node --test tests/*.test.js
```

### Use your own Supabase project

Out of the box the app points at the hosted Wawe Journal backend. To run your own copy:

1. Create a Supabase project.
2. Apply the SQL files in `supabase/migrations/` in filename order (SQL Editor or `psql`). Do not use `supabase db push`: the migrations were applied by hand and the history table is not maintained.
3. Set your project URL and anon key. Copy `.env.example` to `.env`, then also update the defaults in `public/config.js` and `public/src/core/config.js`, which are what the browser actually reads.
4. Optionally deploy the Edge Functions:
   ```bash
   npx supabase functions deploy <name> --project-ref <ref> --use-api
   ```
   `nowpayment-webhook` and the `ctrader-*` functions must be deployed with `--no-verify-jwt`; they do their own authentication.
5. Set the function secrets (`supabase secrets set ...`): `CTRADER_CLIENT_ID`, `CTRADER_CLIENT_SECRET`, `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `TURNSTILE_SECRET_KEY`, plus the optional `NOWPAYMENTS_*`, `RATE_LIMIT_*` and `TELEGRAM_*` settings listed in the function sources.

Never commit real keys. Only the Supabase anon (publishable) key and the Turnstile site key belong in client code; the service role key and all secrets above stay on the server.

## Project layout

```
src/pages/          Astro pages
public/interface/   per-page JavaScript (dashboard, trades, backtest, ...)
public/src/         shared client code and the bundled entry script
supabase/           migrations, Edge Functions, SQL tests
tests/              unit tests
PROJECT_OVERVIEW.md detailed architecture notes (Turkish)
```

## License

Licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only). If you run a modified version as a network service, you must offer its source code to the users of that service.
