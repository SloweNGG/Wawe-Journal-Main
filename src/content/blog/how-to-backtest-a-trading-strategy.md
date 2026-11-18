---
slug: how-to-backtest-a-trading-strategy
title: "How to Backtest a Trading Strategy Manually, Step by Step"
seoTitle: "How to Backtest a Trading Strategy Manually (Step by Step)"
description: "A step-by-step guide to manual backtesting: writing rules you can test, choosing data, sample size, the biases that fake an edge, and how to read the results."
date: "2026-11-18"
summary: "Write rules you can test, pick the right data, avoid the biases that fake an edge, and read the results with the right metrics."
cta: { href: "/backtesting", label: "Try candle-by-candle backtest replay" }
---

Backtesting answers one question before you risk money: *did this strategy have an edge on past data, traded exactly by its rules?* Done carelessly it answers a different question, *can I find trades that would have worked if I already know what happened?*, and the result looks far better than anything you will see live.

This guide walks through manual backtesting, the kind you do by replaying charts candle by candle, which most discretionary traders use because their setups are hard to code.

## Manual or automated backtesting?

| | Manual (replay) | Automated (code) |
|---|---|---|
| Best for | Discretionary setups, price action, multi-timeframe reads | Strictly mechanical rules |
| Speed | 50–200 trades in a few sessions | Thousands of trades in seconds |
| Main risk | Hindsight and inconsistent decisions | Curve fitting and coding errors |
| Side benefit | Trains your eye and execution | None for execution |

If your strategy needs judgment, manual replay is the honest way to test it. It also doubles as practice: you rehearse a setup a hundred times before you trade it with money.

## Step 1: Write rules you can test

Vague rules produce whatever result you hope for. Before opening a chart, write down:

- **Market and timeframe:** for example EURUSD, H1 entries with H4 trend.
- **Setup conditions:** what has to be on the chart, in terms you could explain to someone else.
- **Entry trigger:** the exact candle or level.
- **Stop loss:** where, and why there.
- **Take profit or exit rule:** fixed target, trailing, or a condition.
- **Position size:** a fixed risk per trade, for example 1% (1R).
- **Filters:** sessions you trade, news you avoid, maximum trades per day.

If two people would take different trades from your rules, the rules are not finished.

## Step 2: Choose the data and the period

- **Use real market data for conclusions.** Synthetic or random data is useful to practice using the tools and to drill execution, but it can never prove an edge.
- **Cover different conditions.** Include trending months, ranging months and volatile news periods. A strategy tested only on a strong trend tells you how it does in strong trends.
- **Start from a random date.** Jumping straight to a period you remember introduces bias before the first trade.
- **Include costs.** Set a realistic spread and commission. Strategies with small targets on low timeframes often lose their whole edge to costs.

## Step 3: Replay candle by candle

Hide the future. Step forward one candle at a time and make each decision only with what is on the screen. Place the trade with its stop and target before you advance, then let the replay run until it closes. Do not move the stop unless your written rules say so.

The temptation to peek, skip "obvious" losers or adjust the target because you can see where price went is the biggest source of fake results in manual testing.

## Step 4: Record every trade the same way

Log each backtest trade with the same fields as a live journal: date, setup, entry, stop, target, exit, result in [R](/glossary/r-multiple), and whether the trade followed the rules exactly. Note doubtful trades instead of deleting them; they are information about how clear your rules are. A [trading journal template](/blog/how-to-keep-a-trading-journal) works for backtests too.

## Step 5: Collect enough trades

Small samples lie. With 20 trades, three lucky winners can make a losing strategy look great. As a rough guide:

- **30 trades:** enough to spot obvious problems.
- **100 trades:** the minimum for a first opinion on the edge.
- **200+ trades** across different market conditions: something you can start to rely on.

## Step 6: Avoid the biases that fake an edge

- **Hindsight bias:** taking trades because you "would have seen it", when the chart only looks obvious afterwards.
- **Cherry-picking:** testing only the periods or examples where the setup is textbook.
- **Curve fitting:** tweaking rules until past results look perfect. Each extra condition that only exists to remove past losers makes live results worse.
- **Survivorship in your memory:** remembering the clean winners and forgetting the messy ones you skipped.

## Step 7: Read the results with the right metrics

Look at these together, never alone:

| Metric | What it tells you |
|---|---|
| [Expectancy](/glossary/expectancy) | Average result per trade, in R. Must be above zero after costs |
| [Profit factor](/glossary/profit-factor) | Gross profit ÷ gross loss. 1.5 or more is a solid edge |
| [Win rate](/glossary/win-rate) with [payoff ratio](/glossary/payoff-ratio) | How the edge is built: many small wins or few big ones |
| [Max drawdown](/glossary/max-drawdown) and longest losing streak | Whether you could live with it, and whether it fits a prop firm's limits |
| Results by session and weekday | Where the edge actually comes from |

Then expect live results to be worse. Execution, emotions and slippage cost something. A backtest expectancy of +0.4R often becomes +0.2R live; a backtest of +0.05R usually becomes negative.

## Step 8: Forward test before you trade it big

After a positive backtest, trade the strategy on a demo or with small size for a few weeks and compare the numbers. If the forward results stay roughly in line with the backtest, increase size gradually.

## Backtesting in Wawe Journal

[Backtest replay in Wawe Journal](/backtesting) is built for this process. You choose a symbol, a timeframe from M1 to D1 and a start date, then step candle by candle or play at up to 10 candles per second, with drawing tools and multi-chart layouts. Orders carry a lot size, stop loss and take profit, with spread and commission applied. Synthetic data is there for practice; connect cTrader to replay real candles up to the previous day and link those backtest trades to a journal, where expectancy, profit factor and drawdown are calculated for you. The free plan includes one backtest account.

## Key takeaways

- Write rules precise enough that two people would take the same trades.
- Use real data across different market conditions, with realistic costs.
- Replay candle by candle without peeking, and record every trade.
- Judge on 100 or more trades, with expectancy, profit factor and drawdown together.
- Forward test before going live, and expect live results to be weaker.
