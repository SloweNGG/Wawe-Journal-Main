---
slug: what-is-a-good-profit-factor
title: "What Is a Good Profit Factor? Benchmarks, Math and Pitfalls"
seoTitle: "What Is a Good Profit Factor? Benchmarks and Math"
description: "Profit factor explained: the formula, rough benchmarks, how it links to win rate and expectancy, and why a profit factor of 3 on 20 trades means very little."
date: "2026-11-20"
summary: "The formula, rough benchmarks, how profit factor links to win rate and expectancy, and why a high number on a few trades means very little."
cta: { href: "/#analytics", label: "See your profit factor per strategy" }
---

Profit factor is one of the first numbers traders look at, and one of the easiest to misread. A profit factor of 1.4 can be a solid, tradable edge. A profit factor of 3.5 can be twenty lucky trades. This guide covers what the number means, what counts as good, and the checks to run before you trust it.

## The formula

> **Profit factor = gross profit ÷ gross loss**

Add up all your winning trades, add up all your losing trades (as a positive number), and divide. If your winners made $6,000 and your losers lost $4,000, the [profit factor](/glossary/profit-factor) is 6,000 ÷ 4,000 = **1.5**: you made $1.50 for every $1 you lost.

- **Below 1.0**: the strategy loses money.
- **Exactly 1.0**: break-even before anything you forgot to count.
- **Above 1.0**: the strategy makes money, by a margin the number tells you.

Always calculate it on **net** results, after commission and swap. Costs hit every trade, and on a short-term strategy they can easily take a profit factor of 1.2 down to 1.0.

## What is a good profit factor?

There is no official scale, but most traders read it roughly like this:

| Profit factor | Rough reading |
|---|---|
| Below 1.0 | Losing strategy |
| 1.0 – 1.2 | Thin edge; costs or a small change in market behaviour can erase it |
| 1.2 – 1.5 | Workable edge for many strategies, especially with many trades |
| 1.5 – 2.0 | Strong |
| 2.0 – 3.0 | Very strong; check the sample size and the costs |
| Above 3.0 | Rare over hundreds of trades; usually a small sample, missing costs or a fitted backtest |

Two things change how to read the table. **Trade frequency:** a scalping strategy with 1,000 trades a year and a profit factor of 1.15 can earn more than a swing strategy with 40 trades and 2.0. **Sample size:** the same number is far more believable over 300 trades than over 30.

## How profit factor links to win rate and payoff

Profit factor is not a separate fact about your trading. It comes straight from your [win rate](/glossary/win-rate) and your [payoff ratio](/glossary/payoff-ratio) (average win ÷ average loss):

> **Profit factor = (win rate × payoff) ÷ (1 − win rate)**

| Win rate | Payoff | Profit factor |
|---|---|---|
| 60% | 1.0 | 0.60 × 1.0 ÷ 0.40 = **1.50** |
| 40% | 2.0 | 0.40 × 2.0 ÷ 0.60 = **1.33** |
| 45% | 1.5 | 0.45 × 1.5 ÷ 0.55 = **1.23** |
| 70% | 0.5 | 0.70 × 0.5 ÷ 0.30 = **1.17** |
| 35% | 2.5 | 0.35 × 2.5 ÷ 0.65 = **1.35** |

So you can raise the profit factor in two ways: win more often, or make the wins bigger compared with the losses. Usually improving one costs some of the other, as we explain in [win rate vs risk-reward](/blog/win-rate-vs-risk-reward).

## Profit factor vs expectancy

Look at the first two rows of the table again. 60% at 1:1 has a profit factor of 1.50; 40% at 1:2 has 1.33. Yet both have exactly the same [expectancy](/glossary/expectancy): +0.2R per trade. With losses measured as 1R:

> **Expectancy (R) = (1 − win rate) × (profit factor − 1)**

The two numbers answer different questions. Profit factor says how much you win per dollar lost; expectancy says how much you make per trade. To compare strategies, look at both, plus how many trades each one gives you.

## Five checks before you trust a profit factor

1. **Count the trades.** Under 30 trades, the number is mostly noise. With a 50% win rate and 1:1 trades, a strategy with no edge at all can show a profit factor above 1.5 over 20 trades just from a lucky run, roughly one time in eight.
2. **Remove the biggest winner.** If the profit factor drops from 1.8 to 1.1 without one trade, the "edge" is one trade.
3. **Use net numbers.** Commission, swap and slippage belong in the calculation. Backtests that ignore them overstate the profit factor.
4. **Split the period.** Compare the first half of your trades with the second. A real edge usually shows in both; a fitted one fades.
5. **Check the drawdown.** A profit factor of 2 with a 40% [max drawdown](/glossary/max-drawdown) may not be tradable with your account or your nerves. Profit factor says nothing about the order of wins and losses.

## Profit factor per strategy, not per account

An account-wide profit factor mixes everything you trade. One strong setup and two weak ones can average out to a dull 1.1 that hides both. Split by strategy, by symbol and by session, and the picture usually becomes clear: one setup carries the account, another quietly drains it.

## Track it in Wawe Journal

In [Wawe Journal](/) profit factor, win rate, [payoff ratio](/glossary/payoff-ratio) and expectancy are calculated from your net results for every strategy, and you can look at live trades, backtest trades or both. The [AI coach](/ai-trading-coach) can put your strategies side by side and tell you which one to drop. If you want to test a change before trading it, the [backtest replay](/backtesting) logs every simulated trade into the same metrics.

## Key takeaways

- Profit factor = gross profit ÷ gross loss, on net results after costs.
- Roughly: below 1.0 losing, 1.2–1.5 workable, 1.5–2.0 strong, above 3.0 suspicious until proven over many trades.
- Profit factor = (win rate × payoff) ÷ (1 − win rate); expectancy = (1 − win rate) × (profit factor − 1).
- Check the sample size, the biggest winner, the costs and the drawdown before you trust the number.
