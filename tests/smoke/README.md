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
