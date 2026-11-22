---
slug: guter-profit-faktor
title: "Was ist ein guter Profit-Faktor? Richtwerte, Formel und Fallstricke"
seoTitle: "Was ist ein guter Profit-Faktor? Richtwerte und Formel"
description: "Guter Profit-Faktor? Formel, grobe Richtwerte, der Zusammenhang mit Trefferquote und Erwartungswert und warum ein Wert von 3 nach 20 Trades kaum etwas sagt."
date: "2026-11-20"
summary: "Die Formel, grobe Richtwerte, wie der Profit-Faktor mit Trefferquote und Erwartungswert zusammenhängt und warum ein hoher Wert nach wenigen Trades kaum etwas aussagt."
cta: { href: "/#analytics", label: "Sieh deinen Profit-Faktor pro Strategie" }
---

Der Profit-Faktor ist eine der ersten Zahlen, auf die Trader schauen, und eine der am leichtesten falsch gelesenen. Ein Profit-Faktor von 1,4 kann ein solider, handelbarer Edge sein. Ein Profit-Faktor von 3,5 können zwanzig Glückstrades sein. Dieser Guide erklärt, was die Zahl bedeutet, was als gut gilt und welche Checks du machen solltest, bevor du ihr vertraust.

## Die Formel

> **Profit-Faktor = Bruttogewinn ÷ Bruttoverlust**

Addiere alle Gewinntrades, addiere alle Verlusttrades (als positive Zahl) und teile das eine durch das andere. Wenn deine Gewinner 6.000 $ eingebracht und deine Verlierer 4.000 $ gekostet haben, liegt der [Profit-Faktor](/glossary/profit-factor) bei 6.000 ÷ 4.000 = **1,5**: Du hast für jeden verlorenen Dollar 1,50 $ verdient.

- **Unter 1,0**: Die Strategie verliert Geld.
- **Genau 1,0**: Break-even, noch vor allem, was du vergessen hast mitzurechnen.
- **Über 1,0**: Die Strategie verdient Geld, und die Zahl zeigt dir, mit welchem Abstand.

Berechne ihn immer auf Basis der **Netto**-Ergebnisse, also nach Kommission und Swap. Kosten fallen bei jedem Trade an, und bei einer kurzfristigen Strategie können sie einen Profit-Faktor von 1,2 leicht auf 1,0 drücken.

## Was ist ein guter Profit-Faktor?

Eine offizielle Skala gibt es nicht, aber die meisten Trader lesen ihn ungefähr so:

| Profit-Faktor | Grobe Einordnung |
|---|---|
| Unter 1,0 | Verluststrategie |
| 1,0 – 1,2 | Dünner Edge; Kosten oder eine kleine Veränderung im Marktverhalten können ihn auslöschen |
| 1,2 – 1,5 | Brauchbarer Edge für viele Strategien, vor allem bei vielen Trades |
| 1,5 – 2,0 | Stark |
| 2,0 – 3,0 | Sehr stark; prüfe die Stichprobengröße und die Kosten |
| Über 3,0 | Selten über Hunderte von Trades; meist eine kleine Stichprobe, fehlende Kosten oder ein überangepasster Backtest |

Zwei Dinge verändern, wie du die Tabelle liest. **Trade-Häufigkeit:** Eine Scalping-Strategie mit 1.000 Trades im Jahr und einem Profit-Faktor von 1,15 kann mehr verdienen als eine Swing-Strategie mit 40 Trades und 2,0. **Stichprobengröße:** Dieselbe Zahl ist über 300 Trades weit glaubwürdiger als über 30.

## Wie der Profit-Faktor mit Trefferquote und Payoff zusammenhängt

Der Profit-Faktor ist keine eigenständige Eigenschaft deines Tradings. Er ergibt sich direkt aus deiner [Trefferquote](/glossary/win-rate) und deiner [Payoff-Ratio](/glossary/payoff-ratio) (Durchschnittsgewinn ÷ Durchschnittsverlust):

> **Profit-Faktor = (Trefferquote × Payoff) ÷ (1 − Trefferquote)**

| Trefferquote | Payoff | Profit-Faktor |
|---|---|---|
| 60 % | 1,0 | 0,60 × 1,0 ÷ 0,40 = **1,50** |
| 40 % | 2,0 | 0,40 × 2,0 ÷ 0,60 = **1,33** |
| 45 % | 1,5 | 0,45 × 1,5 ÷ 0,55 = **1,23** |
| 70 % | 0,5 | 0,70 × 0,5 ÷ 0,30 = **1,17** |
| 35 % | 2,5 | 0,35 × 2,5 ÷ 0,65 = **1,35** |

Du kannst den Profit-Faktor also auf zwei Arten erhöhen: öfter gewinnen oder die Gewinne im Verhältnis zu den Verlusten größer machen. Meist kostet die Verbesserung des einen etwas vom anderen, wie wir in [Trefferquote vs. Chance-Risiko-Verhältnis](/de/blog/trefferquote-vs-chance-risiko-verhaeltnis) erklären.

## Profit-Faktor vs. Erwartungswert

Schau dir noch einmal die ersten beiden Zeilen der Tabelle an. 60 % bei 1:1 ergeben einen Profit-Faktor von 1,50; 40 % bei 1:2 ergeben 1,33. Trotzdem haben beide exakt denselben [Erwartungswert](/glossary/expectancy): +0,2R pro Trade. Wenn Verluste mit 1R gemessen werden, gilt:

> **Erwartungswert (R) = (1 − Trefferquote) × (Profit-Faktor − 1)**

Die beiden Zahlen beantworten unterschiedliche Fragen. Der Profit-Faktor sagt dir, wie viel du pro verlorenem Dollar gewinnst; der Erwartungswert sagt dir, wie viel du pro Trade verdienst. Um Strategien zu vergleichen, schau dir beide an und dazu, wie viele Trades dir jede Strategie liefert.

## Fünf Checks, bevor du einem Profit-Faktor vertraust

1. **Zähl die Trades.** Unter 30 Trades ist die Zahl größtenteils Rauschen. Bei 50 % Trefferquote und 1:1-Trades kann eine Strategie ganz ohne Edge über 20 Trades allein durch eine Glückssträhne einen Profit-Faktor über 1,5 zeigen, und zwar ungefähr in einem von acht Fällen.
2. **Nimm den größten Gewinner raus.** Wenn der Profit-Faktor ohne einen einzigen Trade von 1,8 auf 1,1 fällt, dann besteht der „Edge“ aus einem Trade.
3. **Rechne mit Nettozahlen.** Kommission, Swap und Slippage gehören in die Rechnung. Backtests, die sie ignorieren, überzeichnen den Profit-Faktor.
4. **Teile den Zeitraum.** Vergleiche die erste Hälfte deiner Trades mit der zweiten. Ein echter Edge zeigt sich meist in beiden; ein überangepasster verblasst.
5. **Prüfe den Drawdown.** Ein Profit-Faktor von 2 bei einem [maximalen Drawdown](/glossary/max-drawdown) von 40 % ist für dein Konto oder deine Nerven womöglich nicht tradebar. Der Profit-Faktor sagt nichts über die Reihenfolge von Gewinnen und Verlusten.

## Profit-Faktor pro Strategie, nicht pro Konto

Ein Profit-Faktor über das ganze Konto vermischt alles, was du tradest. Ein starkes Setup und zwei schwache können sich zu einem unscheinbaren 1,1 ausgleichen, das beides verdeckt. Teile nach Strategie, Symbol und Session auf, und das Bild wird meist klar: Ein Setup trägt das Konto, ein anderes zieht es leise nach unten.

## Verfolge ihn in Wawe Journal

In [Wawe Journal](/) werden Profit-Faktor, Trefferquote, [Payoff-Ratio](/glossary/payoff-ratio) und Erwartungswert für jede Strategie aus deinen Netto-Ergebnissen berechnet, und du kannst dir Live-Trades, Backtest-Trades oder beides ansehen. Der [KI-Coach](/ai-trading-coach) kann deine Strategien nebeneinanderstellen und dir sagen, welche du streichen solltest. Wenn du eine Änderung testen willst, bevor du sie tradest, erfasst das [Backtest-Replay](/backtesting) jeden simulierten Trade in denselben Kennzahlen.

## Das Wichtigste in Kürze

- Profit-Faktor = Bruttogewinn ÷ Bruttoverlust, auf Basis der Netto-Ergebnisse nach Kosten.
- Grob: unter 1,0 verlierend, 1,2–1,5 brauchbar, 1,5–2,0 stark, über 3,0 verdächtig, bis er sich über viele Trades bewährt hat.
- Profit-Faktor = (Trefferquote × Payoff) ÷ (1 − Trefferquote); Erwartungswert = (1 − Trefferquote) × (Profit-Faktor − 1).
- Prüfe Stichprobengröße, größten Gewinner, Kosten und Drawdown, bevor du der Zahl vertraust.
