---
slug: trefferquote-vs-chance-risiko-verhaeltnis
title: "Trefferquote vs. Chance-Risiko-Verhältnis: Was zählt im Trading mehr?"
seoTitle: "Trefferquote vs. Chance-Risiko-Verhältnis: Was zählt mehr?"
description: "Trefferquote ohne Chance-Risiko-Verhältnis sagt nichts: Erwartungswert-Formel, Break-even-Trefferquoten und warum derselbe Edge 10-mal mehr Risiko tragen kann."
date: "2026-11-20"
summary: "Die Erwartungswert-Formel, die Break-even-Trefferquote für jedes CRV und warum zwei Strategien mit demselben Edge zehnmal so viel Risiko tragen können."
cta: { href: "/tools/risk-of-ruin-calculator", label: "Teste deine Zahlen im Risk-of-Ruin-Rechner" }
---

„Ich gewinne 70 % meiner Trades“ klingt besser als „Ich gewinne 35 % meiner Trades“. Muss es aber nicht sein. Eine Trefferquote von 70 % mit kleinen Gewinnern und großen Verlierern verliert Geld, und eine Trefferquote von 35 % mit Gewinnern, die dreimal so groß sind wie die Verlierer, verdient ordentlich. Trefferquote und Chance-Risiko-Verhältnis ergeben nur zusammen einen Sinn.

Dieser Guide zeigt, wie du beide zu einer Zahl zusammenführst, welche Trefferquote du für welches CRV brauchst und den Teil, den die meisten Trader übersehen: Zwei Strategien mit demselben Edge können sich beim Traden völlig unterschiedlich anfühlen.

## Die zwei Zahlen

- **[Trefferquote](/glossary/win-rate)** (Win-Rate): der Anteil der Trades, die im Gewinn enden. 45 Gewinner von 100 Trades ergeben eine Trefferquote von 45 %.
- **Chance-Risiko-Verhältnis (CRV)**: wie groß deine Gewinne im Vergleich zu deinen Verlusten sind. Vor dem Trade ist es das geplante [Chance-Risiko-Verhältnis](/glossary/risk-reward-ratio) (Abstand zum Ziel ÷ Abstand zum Stop). Nach den Trades ist es die [Payoff-Ratio](/glossary/payoff-ratio): Durchschnittsgewinn ÷ Durchschnittsverlust. Die realisierte Zahl ist die, die zählt.

## Der Erwartungswert verbindet beide

Der [Erwartungswert](/glossary/expectancy) (Expectancy) ist das, was du mit einem durchschnittlichen Trade verdienst. Gemessen in R, wobei 1R der Betrag ist, den du riskierst:

> **Erwartungswert (R) = Trefferquote × Chance − (1 − Trefferquote) × 1**

| Strategie | Trefferquote | Chance : Risiko | Erwartungswert pro Trade |
|---|---|---|---|
| A, der Scalper | 70 % | 0,5 | 0,70 × 0,5 − 0,30 = **+0,05R** |
| B, der Trendfolger | 35 % | 2,5 | 0,35 × 2,5 − 0,65 = **+0,225R** |
| C, die „sichere Sache“ | 80 % | 0,2 | 0,80 × 0,2 − 0,20 = **−0,04R** |

Der Trader mit 35 % Trefferquote verdient pro Trade viereinhalbmal so viel wie der mit 70 %, und die 80-%-Strategie verliert Geld. Eine hohe Trefferquote sagt dir, wie oft du recht hast, nicht, wie viel du verdienst.

## Die Break-even-Trefferquote für jedes CRV

Setz den Erwartungswert auf null, und du erhältst die Trefferquote, die du brauchst, um gerade so auf Break-even zu kommen:

> **Break-even-Trefferquote = 1 ÷ (1 + Chance)**

| Chance : Risiko | Break-even-Trefferquote |
|---|---|
| 0,5 | 66,7 % |
| 1,0 | 50,0 % |
| 1,5 | 40,0 % |
| 2,0 | 33,3 % |
| 3,0 | 25,0 % |
| 5,0 | 16,7 % |

Dein Edge ist der Abstand zwischen deiner echten Trefferquote und dieser Zahl. Eine 1:2-Strategie, die in 45 % der Fälle gewinnt, hat einen großen Abstand (12 Prozentpunkte); eine 1:1-Strategie mit 52 % einen dünnen. Kosten verkleinern den Abstand zusätzlich: Spread und Kommission knabbern an jedem Gewinn etwas ab und legen auf jeden Verlust etwas drauf.

## Beides gleichzeitig erhöhen geht nicht

Die beiden Zahlen ziehen in entgegengesetzte Richtungen. Legst du dein Ziel weiter weg, wird jeder Gewinn größer, aber weniger Trades erreichen es. Ziehst du das Ziel enger, gewinnst du öfter, aber jeder Gewinn schrumpft. Trailing-Stops, Teilschließungen und das Nachziehen des Stops auf Break-even verschieben Trades alle zwischen den beiden Spalten.

Die sinnvolle Frage ist also nicht „Wie bekomme ich eine höhere Trefferquote?“, sondern „Welche Kombination bringt für mein Setup den höchsten Erwartungswert?“. Die einzige ehrliche Antwort liefern deine eigenen Trades: Vergleiche dasselbe Setup mit unterschiedlichen Ausstiegen in deinem Journal oder in einem Backtest und behalte die Variante mit dem besten Erwartungswert über mindestens 50 Trades.

## Gleicher Edge, ganz andere Fahrt

Hier kommt der Teil, den der Erwartungswert verschweigt. Nimm zwei Strategien mit exakt demselben Erwartungswert von +0,2R pro Trade:

- **Strategie 1:** 60 % Trefferquote, 1:1
- **Strategie 2:** 40 % Trefferquote, 1:2

Wir haben beide durch den [Risk-of-Ruin-Rechner](/tools/risk-of-ruin-calculator) laufen lassen: 10.000 simulierte Konten, je 200 Trades, 1 % Risiko pro Trade und „Ruin“ definiert als ein Rückgang von 10 % gegenüber dem Startkapital, also der maximale Drawdown einer typischen Prop-Firm-Challenge.

| | 60 % bei 1:1 | 40 % bei 1:2 |
|---|---|---|
| Erwartungswert pro Trade | +0,2R | +0,2R |
| Längste Verlustserie (Median) | 5 | 9 |
| Wahrscheinlichkeit für 8+ Verluste in Folge | 7,5 % | 75 % |
| Konten, die −10 % erreichen | 1,3 % | 13 % |
| Endkontostand (Median) | 148 % | 146 % |

Gleicher Edge, gleiches Median-Ergebnis, zehnmal so hohes Risiko zu scheitern. Niedrigere Trefferquoten bringen längere Verlustserien mit sich, und Verlustserien sind genau das, was Drawdown-Limits sprengt. Bei 2 % Risiko pro Trade wird der Unterschied noch größer: 10,5 % der 60-%-Konten und 35 % der 40-%-Konten erreichen das Limit.

An Strategien mit niedriger Trefferquote ist nichts falsch; viele der besten Trendfolgesysteme gewinnen in weniger als 40 % der Fälle. Aber sie brauchen ein kleineres Risiko pro Trade, und sie brauchen einen Trader, der neun Verluste in Folge aussitzen kann, ohne den Plan zu ändern.

## Was du daraus machst

1. **Miss beide Zahlen anhand echter Trades.** Das geplante CRV ist ein Wunsch; die Payoff-Ratio aus deinem Journal ist die Realität. Viele Trader planen 1:2 und realisieren 1:1,2, weil sie Gewinne zu früh mitnehmen.
2. **Berechne deinen Erwartungswert pro Setup.** Ein Setup mit negativem Erwartungswert über 50+ Trades solltest du überarbeiten oder streichen, egal wie hoch seine Trefferquote ist.
3. **Wähle die Positionsgröße passend zu deinen Verlustserien.** Je niedriger deine Trefferquote, desto kleiner muss dein Risiko pro Trade für dieselbe Sicherheit sein. Der [Positionsgrößenrechner](/tools/position-size-calculator) rechnet dieses Risiko in eine Lotgröße um.
4. **Beurteile eine Strategie nicht nach der letzten Woche.** Bei 40 % Trefferquote ist eine Serie von acht Verlusten normal und kein Zeichen dafür, dass der Edge weg ist.

## Verfolge es in deinem Journal

Für all das brauchst du die echten Zahlen, aufgeteilt nach Setup. In [Wawe Journal](/) werden deine Trefferquote, dein Durchschnittsgewinn und -verlust, dein [Profit-Faktor](/glossary/profit-factor) und dein Erwartungswert für jede Strategie aus den Trades berechnet, die du erfasst oder synchronisierst, und der [KI-Coach](/ai-trading-coach) kann deine Strategien nebeneinander vergleichen, einschließlich dessen, was deine Backtests über sie sagen.

## Das Wichtigste in Kürze

- Trefferquote und Chance-Risiko-Verhältnis sagen allein nichts aus. Erwartungswert = Trefferquote × Chance − (1 − Trefferquote).
- Break-even-Trefferquote = 1 ÷ (1 + Chance): 50 % bei 1:1, 33 % bei 1:2, 25 % bei 1:3.
- Zwei Strategien mit demselben Erwartungswert können sehr unterschiedliche Verlustserien und Drawdowns haben.
- Je niedriger deine Trefferquote, desto kleiner sollte dein Risiko pro Trade sein.
