---
slug: how-to-pass-ftmo-challenge
title: "How to Pass the FTMO Challenge: Rules, Math and a Risk Plan"
seoTitle: "How to Pass the FTMO Challenge: Rules, Math & Risk Plan"
description: "FTMO 2-Step and 1-Step rules in plain numbers, the losing-streak math behind most failed challenges, and a risk plan that keeps you inside the limits."
date: "2026-11-18"
summary: "The rules in plain numbers, the losing-streak math behind most failed challenges, and a risk plan that keeps you inside the limits."
cta: { href: "/tools/prop-firm-pass-probability", label: "Estimate your pass probability" }
---

Most FTMO challenges are not lost because the strategy has no edge. They are lost because a normal losing streak, sized too big, runs into the daily loss limit or the maximum loss before the edge has time to show. Passing is mostly a risk-management problem, and risk management is arithmetic.

This guide puts the rules in plain numbers, shows how often losing streaks really happen, and turns both into a risk plan.

> Rules below are from our last check of FTMO's public rules (October 2026). Prop firms change their terms; always confirm the current numbers on FTMO's site before you trade.

## The FTMO rules in numbers

### 2-Step challenge (Challenge + Verification)

| Rule | Phase 1 (Challenge) | Phase 2 (Verification) | Funded account |
|---|---|---|---|
| Profit target | 10% | 5% | none |
| Maximum daily loss | 5% of the initial balance | 5% | 5% |
| Maximum loss | 10% of the initial balance, static | 10% static | 10% static |
| Minimum trading days | 4 | 4 | none |

On a $100,000 account that means:

- **Daily loss:** the limit is a fixed $5,000, measured from your balance at the start of the day. Open positions count: if your equity drops $5,000 below the day's starting balance, the rule is broken even if the trades are still open. The day resets at midnight Prague time (CET/CEST).
- **Maximum loss:** your equity may never fall below $90,000. It is static: it does not move up when you make money.

### 1-Step challenge

| Rule | Challenge | Funded account |
|---|---|---|
| Profit target | 10% | none |
| Maximum daily loss | 3% of the initial balance | 3% |
| Maximum loss | 10%, trailing at end of day | 10%, trailing at end of day |
| Best day rule | no single day may make up more than 50% of the profit | same |

The 1-Step challenge is less forgiving: the daily limit is only 3%, and the maximum loss trails your highest end-of-day balance, so a good week raises the floor under you.

## Why most challenges fail: the losing-streak math

Traders tend to underestimate how long their losing streaks get. Here is the probability of seeing **at least one** run of consecutive losses within 100 trades, for three win rates:

| Losses in a row | 60% win rate | 50% win rate | 40% win rate |
|---|---|---|---|
| 5 | 46% | 81% | 98% |
| 6 | 21% | 55% | 87% |
| 8 | 4% | 17% | 49% |
| 10 | 1% | 4% | 20% |

A trader with a 50% win rate will very likely see five losses in a row during a challenge, and has a coin-flip chance of six. A trader with a 40% win rate, which is normal for strategies with large winners, should plan for eight.

Now combine that with your risk per trade. This is how many full losses (−1R each) it takes to use up each limit on the 2-Step challenge:

| Risk per trade | Losses to hit the 5% daily limit | Losses to hit the 10% maximum loss |
|---|---|---|
| 2% | 3 | 5 |
| 1% | 5 | 10 |
| 0.5% | 10 | 20 |
| 0.25% | 20 | 40 |

At 2% risk, an ordinary streak of five losses ends the challenge. At 1%, a 50% win rate trader has a realistic chance of a streak that ends it. At 0.5%, it takes a streak that is rare for most strategies. That is the whole argument for small risk.

On the 1-Step challenge the daily limit is 3%: at 1% risk, three losses on the same day are enough.

## A risk plan that keeps you inside the limits

### 1. Risk 0.5% per trade, or less

It feels slow, but it buys you room for the losing streaks shown above. Calculate the lot size from the stop distance every time ([here is how](/blog/how-to-calculate-position-size)), so that a full stop-out costs exactly 0.5% ([1R](/glossary/r-multiple)).

### 2. Set a personal daily stop well above the firm's

Stop for the day after −2% or after three losing trades, whichever comes first. This keeps a bad day from ever reaching the 5% rule, and it stops the revenge trading that usually follows the third loss.

### 3. Cap the number of trades per day

Overtrading is the most common way a normal day turns into a breach. Two or three high-quality trades a day is plenty for most strategies.

### 4. Cut risk after a drawdown

If you are 4% below your starting balance, halve your risk to 0.25% until you are back above −2%. A static 10% maximum loss leaves no second chance once it is reached.

### 5. Know your numbers before you start

You need a positive [expectancy](/glossary/expectancy) to pass at all. At 0.5% risk and an expectancy of +0.3R per trade, each trade adds 0.15% on average, so reaching the 10% target takes around 67 trades. If your journal shows a negative expectancy on your last 50 trades, no risk plan will save the challenge.

### 6. Don't rush the target or the trading days

At the time of our check, the 2-Step challenge has no maximum time limit, only a minimum of four trading days. There is no reason to increase size because the target feels far away.

### 7. Watch the consistency rule on the 1-Step

Because no single day may make up more than half of the profit, one oversized winning day can delay your pass. Steady sizing helps here too.

## Estimate your pass probability before you pay

You can test your own numbers with a simulation. Enter your win rate, average win and loss, risk per trade and trades per day into the free [prop firm pass probability calculator](/tools/prop-firm-pass-probability), which runs a Monte Carlo simulation of the challenge. The [drawdown calculator](/tools/prop-firm-drawdown-calculator) shows how much room you have left today against the daily and maximum loss rules.

If you trade the challenge itself, the [prop firm tracker in Wawe Journal](/prop-firm-tracker) checks every synced or imported trade against the FTMO preset, including the Prague reset time, and shows the remaining room as meters on your dashboard.

## Key takeaways

- On a $100K 2-Step challenge: +$10,000 target, a fixed $5,000 daily loss limit from the day's starting balance, and a static floor at $90,000.
- Losing streaks of 5 to 8 trades are normal; size so that they cannot end the challenge.
- 0.5% risk per trade, a personal daily stop at −2% and a trade cap per day remove most of the ways a challenge fails.
- A positive expectancy from your journal comes first; risk management only protects an edge you already have.

*FTMO is a trademark of its owner. Wawe Journal is not affiliated with or endorsed by FTMO.*
