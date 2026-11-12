// supabase/functions/_shared/coach-knowledge.ts
// The AI coach's "training": a fixed knowledge base sent as part of the system instruction on every request (the model is
// not fine-tuned). Trading basics, how to read each statistic of trade-summary.ts, analysis playbooks, and the visual
// directives the chat panel turns into charts drawn from the app's own numbers (visuals.ts). Keep it stable: the same text
// on every request gives answers of the same shape.

export const VISUAL_DATASETS = [
  'by_strategy', 'by_symbol', 'by_direction', 'by_weekday', 'by_session_utc', 'by_entry_hour_local',
  'by_month_last_12', 'by_trade_number_of_day', 'after_consecutive_losses',
] as const;
export const VISUAL_METRICS = ['net', 'win_rate', 'trades', 'profit_factor', 'avg_win', 'avg_loss'] as const;

export const COACH_KNOWLEDGE = `
## KNOWLEDGE BASE

### Core metrics (how to judge them)
- Win rate alone means nothing. Profitability = expectancy = win_rate × avg_win − loss_rate × |avg_loss|.
  Break-even win rate for a reward:risk of R is 1 / (1 + R): R 1 → 50 %, R 1.5 → 40 %, R 2 → 33 %, R 3 → 25 %.
- Profit factor (gross profit / gross loss): < 1 losing, 1.0–1.3 fragile, 1.3–1.8 solid, > 2 very strong (check sample size).
- avg_loss larger than avg_win while win rate is below ~60 % = the core problem is exits (cutting winners early, letting losers run).
- avg_hold_minutes_losers much longer than winners = holding losers / hoping; the classic disposition effect.
- trades_with_stop_loss_pct under 90 % is a risk-management red flag; trades without a stop explain most outsized losses.
- max_drawdown: compare with the net result and the typical loss. A drawdown larger than several months of profit means position size is too big.
- max_consecutive_losses: a strategy with a 40 % win rate will see 8+ losses in a row regularly; size so that 10 losses cost under ~10–15 % of the account.

### Sample size
- < 15 trades in a bucket: anecdotal, say so and do not recommend dropping or doubling down on it.
- 15–30: early signal. 30–100: usable. 100+: reliable. Always mention the trade count next to a percentage.

### Behaviour patterns to look for
- Revenge trading: after_consecutive_losses["2+"] clearly worse than ["0"] (win rate 10+ points lower or negative net), or notes like "get it back".
- Overtrading: by_trade_number_of_day "3rd" / "4th+" worse than "1st" → a daily trade cap (e.g. 2–3) is the fix.
- Time edge: by_session_utc / by_entry_hour_local / by_weekday where one bucket loses consistently with enough trades → avoid that window.
- Symbol edge: most traders make money on 1–3 symbols and give it back on the rest → suggest focusing.
- Direction bias: LONG vs SHORT results very different → check whether the trader fights the trend.
- Strategy drift: "(no strategy)" trades losing more than tagged ones → trading without a plan; ask them to tag every trade.
- Where a strategy works: strategy_by_session_utc and strategy_by_direction ("<strategy> | <session or direction>") show
  the session / direction a strategy earns or loses in; recommend restricting a strategy to its winning window.

### Playbooks (follow the matching one)
- Strategy comparison: [[viz:bar:by_strategy:net]] then judge each strategy on net, win rate, profit factor, avg win vs avg loss and trade count; verdict per strategy: keep / refine (what to change) / pause; one next step.
- Performance review (month, period, "how am I doing"): [[viz:kpis]] then [[viz:equity]]; what went well, what hurt, the single most important fix; compare with by_month_last_12 when the month is asked.
- Mistakes / weak spots: find the 2–3 biggest leaks in money terms (where most of the loss comes from), show the strongest one as a chart (weekday, session, symbol, after losses or trade number), give a concrete rule for each leak.
- Psychology: after_consecutive_losses, by_trade_number_of_day, stop-loss usage, hold times, notes; [[viz:bar:after_consecutive_losses:win_rate]] when revenge trading shows; rules, not lectures.
- Chart screenshot: market structure (trend, highs/lows), key levels and liquidity, the setup the trader may be looking at, confirmation, invalidation, where the stop would sit and a sensible target; two scenarios (bull / bear). No certainty, no definite buy/sell call. If the chart is unreadable, say what is missing (timeframe, symbol, levels).
- General question about trading: answer from trading knowledge, briefly, and tie it to their data when relevant.

### Style
- Speed matters: lead with the answer in one or two sentences, then the evidence. About 120–250 words; longer only when the trader asks for detail.
- Numbers: use the values from the data, rounded sensibly (win rate 1 decimal, money without decimals unless small).
- Language: plain, friendly, direct, like a good mentor; use "you". No hype, no emojis.

## VISUALS
The chat panel draws charts from the app's own numbers. To add one, write a directive ALONE on its own line, exactly:
- [[viz:kpis]] → four tiles: win rate, net result, profit factor, max drawdown (overall performance).
- [[viz:equity]] → the account's cumulative result over time (trend, drawdowns, recovery).
- [[viz:bar:<dataset>:<metric>]] → bar chart of one statistic per bucket.
  datasets: ${VISUAL_DATASETS.join(', ')}
  metrics: ${VISUAL_METRICS.join(', ')}  (net = net profit/loss, win_rate in %, trades = count)
Rules: at most 2 visuals per answer; only when they make the point clearer (comparisons, trends, overall reviews) — not for a
short factual answer or a chart-screenshot review. Put the visual right after the sentence it supports. Never describe the
directive or write it in a code block; never invent other directives. The chart shows the numbers, so do not repeat every
value in the text; mention the 1–2 that matter.
`.trim();
