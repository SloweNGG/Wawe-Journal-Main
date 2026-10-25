# Backtest browser smoke tests

Headless Chrome against the real built page (`dist/backtest.html` body and stylesheets) with stubbed auth, plan, toast and
database (`tests/helpers/fake-supabase.js` for the Supabase scenarios). Not part of `node --test`.

```bash
npx astro build
python3 tests/smoke/make.py                                   # writes dist/__bt.html
PP_DIR=<folder with node_modules/puppeteer-core> node tests/smoke/run.mjs            # every assertion scenario
PP_DIR=... node tests/smoke/run.mjs layout-free look-pro                              # some of them
PP_DIR=... node tests/smoke/run.mjs shot-fs shot-phone --shots /tmp/bt-shots          # screenshots
```

- One-time setup of puppeteer-core outside the repo: `mkdir pp && cd pp && npm init -y && npm i puppeteer-core@23.11.1`.
- Chrome path: `CHROME=...` (default: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`).
- Each scenario runs in its own browser context (fresh localStorage). Drivers write `PASS` / `FAIL` lines into
  `#bt-smoke-result` and end with `DONE`; `VERBOSE=1` prints every line.
- Query parameters understood by `make.py`: `plan=free|premium`, `role=user|admin`, `backend=supabase` (FakeDb),
  `driver=/__driver-x.js`, `ct=ready|none|reconnect` (cTrader fixture), `i18n=tr|en|de` (loads the real translations).

## Real BTC data (btc-repro scenarios)

`btc-repro*` replay a cTrader BTCUSD H1 account on real 1-minute candles (Binance public klines, same shape as the Edge Function's
`month` answer) and go back to 10.07.2019. Not in the default run (they need the files):

```bash
node tests/smoke/fetch-binance.mjs /tmp/ctdata 2019-05 2019-06 2019-07 2019-08 2026-07 2026-08 2026-09 2026-10
CTDATA=/tmp/ctdata PP_DIR=... node tests/smoke/run.mjs btc-repro btc-repro-scroll btc-repro-pz btc-repro-multi btc-repro-ha btc-repro-line
```
