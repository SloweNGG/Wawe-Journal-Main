---
slug: win-rate-vs-risk-reward
title: "Win Rate vs Risk-Reward: Which Matters More in Trading?"
seoTitle: "Win Rate vs Risk-Reward: Which Matters More?"
description: "Win rate means nothing without risk-reward. The expectancy formula, break-even win rates, and why the same edge can carry ten times the risk."
date: "2026-11-20"
summary: "The expectancy formula, the break-even win rate for every risk-reward, and why two strategies with the same edge can carry ten times the risk."
cta: { href: "/tools/risk-of-ruin-calculator", label: "Test your numbers in the risk of ruin calculator" }
---

"I win 70% of my trades" sounds better than "I win 35% of my trades". It may not be. A 70% win rate with small winners and big losers loses money, and a 35% win rate with winners three times the size of the losers makes plenty. Win rate and risk-reward only mean something together.

This guide shows how to combine them into one number, what win rate you need for any risk-reward, and the part most traders miss: two strategies with the same edge can feel completely different to trade.

## The two numbers

- **[Win rate](/glossary/win-rate)**: the share of trades that end in profit. 45 winners out of 100 trades is a 45% win rate.
- **Risk-reward**: how big your wins are compared with your losses. Before the trade it is the planned [risk-reward ratio](/glossary/risk-reward-ratio) (target distance ÷ stop distance). After the trades it is the [payoff ratio](/glossary/payoff-ratio): average win ÷ average loss. The realised number is the one that counts.

## Expectancy combines them

[Expectancy](/glossary/expectancy) is what you make on an average trade. Measured in R, where 1R is the amount you risk:

> **Expectancy (R) = win rate × reward − (1 − win rate) × 1**

| Strategy | Win rate | Reward : risk | Expectancy per trade |
|---|---|---|---|
| A, the scalper | 70% | 0.5 | 0.70 × 0.5 − 0.30 = **+0.05R** |
| B, the trend follower | 35% | 2.5 | 0.35 × 2.5 − 0.65 = **+0.225R** |
| C, the "sure thing" | 80% | 0.2 | 0.80 × 0.2 − 0.20 = **−0.04R** |

The trader with the 35% win rate makes four and a half times as much per trade as the one with 70%, and the 80% strategy loses money. A high win rate tells you how often you are right, not how much you earn.

## The break-even win rate for every risk-reward

Set the expectancy to zero and you get the win rate you need just to break even:

> **Break-even win rate = 1 ÷ (1 + reward)**

| Reward : risk | Break-even win rate |
|---|---|
| 0.5 | 66.7% |
| 1.0 | 50.0% |
| 1.5 | 40.0% |
| 2.0 | 33.3% |
| 3.0 | 25.0% |
| 5.0 | 16.7% |

Your edge is the gap between your real win rate and this number. A 1:2 strategy that wins 45% of the time has a wide gap (12 points); a 1:1 strategy that wins 52% has a thin one. Costs make the gap smaller still: spread and commission shave a little off every win and add a little to every loss.

## You can't raise both

The two numbers pull against each other. Move your target further away and each win gets bigger, but fewer trades reach it. Tighten the target and you win more often, but each win shrinks. Trailing stops, partial exits and moving the stop to break-even all shift trades between the two columns.

So the useful question is not "how do I get a higher win rate?" but "which combination gives the highest expectancy for my setup?". The only honest answer comes from your own trades: compare the same setup with different exits in your journal or a backtest, and keep the version with the best expectancy over at least 50 trades.

## Same edge, very different ride

Here is the part that expectancy hides. Take two strategies with exactly the same expectancy of +0.2R per trade:

- **Strategy 1:** 60% win rate, 1:1
- **Strategy 2:** 40% win rate, 1:2

We ran both through the [risk of ruin calculator](/tools/risk-of-ruin-calculator): 10,000 simulated accounts, 200 trades each, 1% risk per trade, and "ruin" set to a 10% drop from the starting balance, the max drawdown of a typical prop firm challenge.

| | 60% at 1:1 | 40% at 1:2 |
|---|---|---|
| Expectancy per trade | +0.2R | +0.2R |
| Median longest losing streak | 5 | 9 |
| Chance of 8+ losses in a row | 7.5% | 75% |
| Accounts that hit −10% | 1.3% | 13% |
| Median final balance | 148% | 146% |

Same edge, same median result, ten times the risk of failing. Lower win rates come with longer losing streaks, and losing streaks are what break drawdown limits. At 2% risk per trade the gap gets worse: 10.5% of the 60% accounts and 35% of the 40% accounts hit the limit.

Nothing is wrong with low-win-rate strategies; many of the best trend systems win less than 40% of the time. But they need smaller risk per trade, and they need a trader who can sit through nine losses in a row without changing the plan.

## What to do with this

1. **Measure both numbers from real trades.** Planned risk-reward is a wish; the payoff ratio from your journal is the fact. Many traders plan 1:2 and realise 1:1.2 because they take profits early.
2. **Calculate your expectancy per setup.** A setup with negative expectancy over 50+ trades should be fixed or dropped, whatever its win rate.
3. **Size for your losing streaks.** The lower your win rate, the smaller your risk per trade has to be for the same safety. The [position size calculator](/tools/position-size-calculator) turns that risk into a lot size.
4. **Don't judge a strategy on last week.** With a 40% win rate, a run of eight losses is normal, not a sign the edge is gone.

## Track it in your journal

All of this needs the real numbers, by setup. In [Wawe Journal](/) your win rate, average win and loss, [profit factor](/glossary/profit-factor) and expectancy are calculated for each strategy from the trades you log or sync, and the [AI coach](/ai-trading-coach) can compare your strategies side by side, including what your backtests say about them.

## Key takeaways

- Win rate and risk-reward mean nothing alone. Expectancy = win rate × reward − (1 − win rate).
- Break-even win rate = 1 ÷ (1 + reward): 50% at 1:1, 33% at 1:2, 25% at 1:3.
- Two strategies with the same expectancy can have very different losing streaks and drawdowns.
- The lower your win rate, the smaller your risk per trade should be.
