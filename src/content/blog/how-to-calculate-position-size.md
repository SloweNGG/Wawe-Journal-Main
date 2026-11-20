---
slug: how-to-calculate-position-size
title: "How to Calculate Position Size in Forex (With Worked Examples)"
seoTitle: "How to Calculate Position Size in Forex (With Examples)"
description: "The position size formula, pip values for USD, JPY and cross pairs and gold, five worked examples and the sizing mistakes that quietly double your risk."
date: "2026-11-20"
summary: "The one formula behind every lot size, pip values for every pair type and gold, five worked examples and the mistakes that quietly double your risk."
cta: { href: "/tools/position-size-calculator", label: "Open the position size calculator" }
---

Two traders take the same EUR/USD setup with the same stop. One loses $100 at the stop, the other loses $400. Same idea, same chart, four times the damage. The difference is position size, and it decides more about whether you survive a bad month than your entries do.

This guide shows how to calculate position size by hand, with worked examples for USD pairs, JPY pairs, crosses and gold, and the mistakes that make your real risk bigger than you think.

## The position size formula

Every lot size calculation is the same three steps:

1. **Decide how much money you will lose if the stop is hit.** Usually a percentage of the account: 1% of $10,000 is $100.
2. **Measure the stop distance.** In pips for forex, in price for gold and indices. The stop goes where the trade idea is wrong, not where the lot size looks nice.
3. **Divide the money by the stop.**

> **Lots = money at risk ÷ (stop distance × value of one lot per pip)**

The only part that changes between instruments is the value of one lot per pip. Once you have that number, the rest is division.

## Pip value: the number that changes between pairs

One standard lot in forex is 100,000 units of the base currency. One pip is 0.0001 for most pairs and 0.01 for pairs quoted in Japanese yen. What a pip is worth in dollars depends on the currency the pair is quoted in (the second currency).

| Pair type | Example | 1 pip | Value of 1 lot per pip (USD account) |
|---|---|---|---|
| Quote currency is USD | EUR/USD, GBP/USD, AUD/USD | 0.0001 | $10.00, always |
| Base currency is USD | USD/JPY at 150 | 0.01 | 1,000 JPY ÷ 150 = $6.67 |
| Base currency is USD | USD/CAD at 1.38 | 0.0001 | 10 CAD ÷ 1.38 = $7.25 |
| Cross pair, yen quote | GBP/JPY, USD/JPY at 150 | 0.01 | 1,000 JPY ÷ 150 = $6.67 |
| Cross pair, other quote | EUR/GBP, GBP/USD at 1.27 | 0.0001 | £10 × 1.27 = $12.70 |
| Gold | XAU/USD, 100 oz per lot | $0.01 | $1 per $0.01, $100 per $1.00 move |

The rule behind the table: one pip on one lot is always 10 units of the quote currency (1,000 for yen pairs). Convert that into your account currency at the current rate and you have the pip value. The exchange rates above are examples; use today's rate when you calculate.

## Worked examples

All examples use a $10,000 account and round the result **down** to the 0.01 lot step, so the real risk never ends up above the limit.

### 1. EUR/USD, 1% risk, 25-pip stop

- Money at risk: 1% × $10,000 = **$100**
- Pip value per lot: **$10**
- Lots = $100 ÷ (25 × $10) = **0.40 lots**

At the stop you lose 25 × $10 × 0.40 = $100. Exactly the plan.

### 2. USD/JPY at 150, 1% risk, 20-pip stop

- Money at risk: **$100**
- Pip value per lot: 1,000 JPY ÷ 150 = **$6.67**
- Lots = $100 ÷ (20 × $6.67) = **0.75 lots**

Same $100 at risk, a smaller stop than example 1, yet a bigger position: the pip is worth less on this pair.

### 3. GBP/JPY, 1% risk, 30-pip stop

- The quote currency is yen, so the pip value is the same as on USD/JPY: **$6.67** at a USD/JPY rate of 150
- Lots = $100 ÷ (30 × $6.67) = **0.50 lots**

### 4. EUR/GBP, 1% risk, 20-pip stop

- The quote currency is pounds: 1 pip on 1 lot is £10. At GBP/USD 1.27 that is **$12.70**
- Lots = $100 ÷ (20 × $12.70) = 0.3937, rounded down to **0.39 lots**
- Real risk at the stop: 20 × $12.70 × 0.39 = **$99.06**

### 5. Gold, 1% risk, stop $4.00 away

- One lot of XAU/USD is usually 100 ounces, so a $1.00 move is worth **$100 per lot**
- Lots = $100 ÷ ($4.00 × $100) = **0.25 lots**

Some brokers use a different contract size for gold, indices and crypto CFDs. Check the contract specification in your platform before you trust any formula, including this one.

## Same risk, different stops

A wider stop does not mean a bigger loss. It means a smaller position. With $100 at risk on EUR/USD:

| Stop | Lots | Loss at the stop |
|---|---|---|
| 10 pips | 1.00 | $100 |
| 20 pips | 0.50 | $100 |
| 40 pips | 0.25 | $100 |
| 80 pips | 0.12 | $96 |

This is the whole point of position sizing: the stop comes from the chart, the size comes from the stop, and the loss stays the same on every trade. That consistency is what makes your [win rate](/glossary/win-rate) and [risk-reward ratio](/glossary/risk-reward-ratio) mean something, because every −1R loss is the same amount of money.

## How much should you risk per trade?

There is no single right number, but the trade-off is always the same: the higher the risk, the shorter the losing streak you can survive.

| Losses in a row | 0.5% risk | 1% risk | 2% risk | 5% risk |
|---|---|---|---|---|
| 5 | −2.5% | −4.9% | −9.6% | −22.6% |
| 10 | −4.9% | −9.6% | −18.3% | −40.1% |

Losing streaks of 8 to 10 trades are normal for a strategy that wins 40% to 50% of the time once you trade a few hundred times. Many traders settle between 0.5% and 1% per trade; in a prop firm challenge with a 5% daily loss limit and a 10% max drawdown, 0.5% leaves the most room. Our [risk of ruin calculator](/tools/risk-of-ruin-calculator) shows what any risk level does to your chance of hitting a drawdown limit.

## Five sizing mistakes that double your real risk

1. **Trading a fixed lot size.** 0.50 lots on a 15-pip stop and 0.50 lots on a 60-pip stop are a $75 risk and a $300 risk. Your journal then shows "random" results that are really sizing noise.
2. **Rounding up.** 0.437 lots rounded to 0.44 risks slightly more than planned on every trade. Round down.
3. **Ignoring costs.** Spread and commission are paid on top of the stop. A $7 round-turn commission per lot adds $2.80 to a 0.40-lot trade: almost 3% more than the planned $100.
4. **Moving the stop after sizing.** Widen a 25-pip stop to 40 pips after entry and a $100 risk becomes $160. If the idea needs a wider stop, recalculate the size before you enter.
5. **Adding to a losing trade.** Averaging down turns a planned 1R loss into 2R or 3R. If the plan does not include scaling in, it is not part of the trade.

## Check your sizing in the journal

The calculation takes ten seconds; sticking to it for 200 trades is the hard part. That is where a journal helps. Every loss that ended well below −1R is a sizing or stop problem, and they are easy to spot once your trades are in one place. In [Wawe Journal](/) your average win, average loss and [max drawdown](/glossary/max-drawdown) are calculated from every trade you log or sync, and the [AI coach](/ai-trading-coach) can list the trades without a stop and the losses that went beyond −1R, with what they cost you.

## Key takeaways

- Lots = money at risk ÷ (stop distance × pip value of one lot). Decide the money first.
- One pip on one lot is 10 units of the quote currency (1,000 for yen pairs); convert it to your account currency at today's rate.
- A wider stop means a smaller position, not a bigger loss. Round down, never up.
- Spread, commission and moved stops make the real loss bigger than the plan. Check them in your journal.
