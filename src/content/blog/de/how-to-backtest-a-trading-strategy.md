---
slug: trading-strategie-backtesten
title: "Trading-Strategie manuell backtesten: Schritt für Schritt"
seoTitle: "Trading-Strategie backtesten: manuell, Schritt für Schritt"
description: "Trading-Strategie manuell backtesten: testbare Regeln, die richtigen Daten, genug Trades, Verzerrungen, die einen Edge vortäuschen, und die Auswertung."
date: "2026-11-18"
summary: "Schreib testbare Regeln, wähle die richtigen Daten, vermeide die Verzerrungen, die einen Edge vortäuschen, und lies die Ergebnisse mit den richtigen Kennzahlen."
cta: { href: "/backtesting", label: "Backtest-Replay Kerze für Kerze testen" }
---

Ein Backtest beantwortet eine Frage, bevor du Geld riskierst: *Hatte diese Strategie auf historischen Daten einen Edge, wenn man sie exakt nach ihren Regeln tradet?* Machst du ihn nachlässig, beantwortet er eine andere Frage, nämlich *Finde ich Trades, die funktioniert hätten, wenn ich schon weiß, was passiert ist?*, und das Ergebnis sieht weit besser aus als alles, was du live je sehen wirst.

Dieser Leitfaden behandelt manuelles Backtesting, also das Abspielen von Charts Kerze für Kerze. Die meisten diskretionären Trader setzen darauf, weil sich ihre Setups schwer programmieren lassen.

## Manuelles oder automatisiertes Backtesting?

| | Manuell (Replay) | Automatisiert (Code) |
|---|---|---|
| Am besten für | Diskretionäre Setups, Price Action, Multi-Timeframe-Analyse | Streng mechanische Regeln |
| Tempo | 50–200 Trades in ein paar Sitzungen | Tausende Trades in Sekunden |
| Hauptrisiko | Rückschaufehler und uneinheitliche Entscheidungen | Curve Fitting und Programmierfehler |
| Nebeneffekt | Schult dein Auge und deine Ausführung | Keiner für die Ausführung |

Wenn deine Strategie Ermessensentscheidungen verlangt, ist manuelles Replay der ehrliche Weg, sie zu testen. Gleichzeitig ist es Training: Du probst ein Setup hundertmal, bevor du es mit echtem Geld tradest.

## Schritt 1: Schreib Regeln, die sich testen lassen

Vage Regeln liefern genau das Ergebnis, das du dir erhoffst. Bevor du einen Chart öffnest, schreib auf:

- **Markt und Timeframe:** zum Beispiel EURUSD, Einstiege auf H1 mit H4-Trend.
- **Setup-Bedingungen:** was auf dem Chart zu sehen sein muss, so formuliert, dass du es jemand anderem erklären könntest.
- **Einstiegstrigger:** die genaue Kerze oder das genaue Level.
- **Stop-Loss:** wo, und warum genau dort.
- **Take-Profit oder Ausstiegsregel:** festes Ziel, Trailing Stop oder eine Bedingung.
- **Positionsgröße:** ein festes Risiko pro Trade, zum Beispiel 1 % (1R).
- **Filter:** Sessions, in denen du tradest, News, die du meidest, maximale Anzahl an Trades pro Tag.

Wenn zwei Personen nach deinen Regeln unterschiedliche Trades eingehen würden, sind die Regeln noch nicht fertig.

## Schritt 2: Daten und Zeitraum wählen

- **Zieh Schlüsse nur aus echten Marktdaten.** Synthetische oder zufällige Daten sind nützlich, um die Tools kennenzulernen und die Ausführung zu üben, aber sie können nie einen Edge beweisen.
- **Deck unterschiedliche Marktphasen ab.** Nimm Trendmonate, Seitwärtsmonate und volatile News-Phasen mit. Eine Strategie, die nur in einem starken Trend getestet wurde, sagt dir nur, wie sie sich in starken Trends schlägt.
- **Starte an einem zufälligen Datum.** Wenn du direkt zu einem Zeitraum springst, an den du dich erinnerst, verzerrst du das Ergebnis schon vor dem ersten Trade.
- **Rechne die Kosten ein.** Stell einen realistischen Spread und eine realistische Kommission ein. Strategien mit kleinen Zielen auf niedrigen Timeframes verlieren ihren Edge oft komplett an die Kosten.

## Schritt 3: Kerze für Kerze abspielen

Verdeck die Zukunft. Geh jeweils eine Kerze weiter und triff jede Entscheidung nur mit dem, was auf dem Bildschirm zu sehen ist. Platziere den Trade mit Stop und Ziel, bevor du weiterklickst, und lass das Replay dann laufen, bis er geschlossen ist. Verschieb den Stop nicht, es sei denn, deine schriftlichen Regeln sehen das vor.

Die Versuchung, vorauszuschauen, „offensichtliche“ Verlierer zu überspringen oder das Ziel anzupassen, weil du siehst, wohin der Kurs gelaufen ist, ist die größte Quelle für geschönte Ergebnisse beim manuellen Testen.

## Schritt 4: Jeden Trade gleich erfassen

Protokolliere jeden Backtest-Trade mit denselben Feldern wie in einem Live-Journal: Datum, Setup, Einstieg, Stop, Ziel, Ausstieg, Ergebnis in [R](/glossary/r-multiple) und ob der Trade exakt den Regeln gefolgt ist. Markiere zweifelhafte Trades, statt sie zu löschen; sie verraten dir, wie klar deine Regeln sind. Eine [Trading-Journal-Vorlage](/de/blog/trading-journal-fuehren) funktioniert auch für Backtests.

## Schritt 5: Genug Trades sammeln

Kleine Stichproben lügen. Bei 20 Trades können drei Glückstreffer eine Verluststrategie großartig aussehen lassen. Als grobe Orientierung:

- **30 Trades:** genug, um offensichtliche Probleme zu erkennen.
- **100 Trades:** das Minimum für eine erste Einschätzung des Edge.
- **200+ Trades** über verschiedene Marktphasen: etwas, auf das du dich allmählich verlassen kannst.

## Schritt 6: Verzerrungen vermeiden, die einen Edge vortäuschen

- **Rückschaufehler (Hindsight Bias):** Trades nehmen, weil du es „gesehen hättest“, obwohl der Chart erst im Nachhinein offensichtlich aussieht.
- **Rosinenpicken (Cherry-Picking):** nur Zeiträume oder Beispiele testen, in denen das Setup wie aus dem Lehrbuch aussieht.
- **Curve Fitting:** Regeln so lange anpassen, bis die vergangenen Ergebnisse perfekt aussehen. Jede zusätzliche Bedingung, die nur dazu dient, vergangene Verlierer zu entfernen, macht die Live-Ergebnisse schlechter.
- **Survivorship Bias im Kopf:** dich an die sauberen Gewinner erinnern und die chaotischen vergessen, die du übersprungen hast.

## Schritt 7: Ergebnisse mit den richtigen Kennzahlen lesen

Betrachte diese Werte immer zusammen, nie einzeln:

| Kennzahl | Was sie dir sagt |
|---|---|
| [Erwartungswert](/glossary/expectancy) | Durchschnittliches Ergebnis pro Trade in R. Muss nach Kosten über null liegen |
| [Profit-Faktor](/glossary/profit-factor) | Bruttogewinn ÷ Bruttoverlust. Ab 1,5 ist das ein solider Edge |
| [Trefferquote](/glossary/win-rate) mit [Payoff-Ratio](/glossary/payoff-ratio) | Wie der Edge zustande kommt: viele kleine Gewinne oder wenige große |
| [Max. Drawdown](/glossary/max-drawdown) und längste Verlustserie | Ob du damit leben könntest und ob es zu den Limits einer Prop-Firm passt |
| Ergebnisse nach Session und Wochentag | Woher der Edge tatsächlich kommt |

Rechne danach damit, dass die Live-Ergebnisse schlechter ausfallen. Ausführung, Emotionen und Slippage kosten etwas. Aus einem Backtest-Erwartungswert von +0,4R werden live oft +0,2R; ein Backtest mit +0,05R wird live meist negativ.

## Schritt 8: Forward-Test, bevor du groß einsteigst

Nach einem positiven Backtest tradest du die Strategie ein paar Wochen auf einem Demokonto oder mit kleiner Größe und vergleichst die Zahlen. Bleiben die Forward-Ergebnisse ungefähr im Rahmen des Backtests, erhöhst du die Größe schrittweise.

## Backtesting in Wawe Journal

Das [Backtest-Replay in Wawe Journal](/backtesting) ist genau für diesen Prozess gebaut. Du wählst ein Symbol, einen Timeframe von M1 bis D1 und ein Startdatum, gehst dann Kerze für Kerze vor oder spielst mit bis zu 10 Kerzen pro Sekunde ab, mit Zeichenwerkzeugen und Multi-Chart-Layouts. Orders haben Lotgröße, Stop-Loss und Take-Profit, Spread und Kommission werden berücksichtigt. Synthetische Daten gibt es zum Üben; verbinde cTrader, um echte Kerzen bis zum Vortag abzuspielen und diese Backtest-Trades mit einem Journal zu verknüpfen, in dem Erwartungswert, Profit-Faktor und Drawdown für dich berechnet werden. Der kostenlose Plan enthält ein Backtest-Konto.

## Das Wichtigste in Kürze

- Schreib Regeln so präzise, dass zwei Personen dieselben Trades eingehen würden.
- Nutze echte Daten aus unterschiedlichen Marktphasen, mit realistischen Kosten.
- Spiel Kerze für Kerze ab, ohne vorauszuschauen, und erfasse jeden Trade.
- Urteile erst nach 100 oder mehr Trades, mit Erwartungswert, Profit-Faktor und Drawdown zusammen.
- Mach einen Forward-Test, bevor du live gehst, und rechne mit schwächeren Live-Ergebnissen.
