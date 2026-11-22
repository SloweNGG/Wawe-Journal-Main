---
slug: positionsgroesse-berechnen
title: "Positionsgröße im Forex berechnen (mit Rechenbeispielen)"
seoTitle: "Positionsgröße berechnen: Forex-Formel mit Beispielen"
description: "Positionsgröße berechnen: die Formel, Pip-Werte für USD-, JPY- und Cross-Paare sowie Gold, fünf Rechenbeispiele und Fehler, die dein Risiko verdoppeln."
date: "2026-11-20"
summary: "Die eine Formel hinter jeder Lotgröße, Pip-Werte für alle Paartypen und Gold, fünf Rechenbeispiele und die Fehler, die dein Risiko unbemerkt verdoppeln."
cta: { href: "/tools/position-size-calculator", label: "Positionsgrößenrechner öffnen" }
---

Zwei Trader nehmen dasselbe EUR/USD-Setup mit demselben Stop. Der eine verliert am Stop 100 $, der andere 400 $. Gleiche Idee, gleicher Chart, viermal so viel Schaden. Der Unterschied ist die Positionsgröße, und sie entscheidet stärker als deine Einstiege darüber, ob du einen schlechten Monat überstehst.

Dieser Guide zeigt dir, wie du die Positionsgröße von Hand berechnest, mit Rechenbeispielen für USD-Paare, JPY-Paare, Crosses und Gold, und welche Fehler dein echtes Risiko größer machen, als du denkst.

## Die Formel für die Positionsgröße

Jede Berechnung der Lotgröße besteht aus denselben drei Schritten:

1. **Leg fest, wie viel Geld du verlierst, wenn der Stop getroffen wird.** Meist ein Prozentsatz des Kontos: 1 % von 10.000 $ sind 100 $.
2. **Miss den Stop-Abstand.** Im Forex in Pips, bei Gold und Indizes im Preis. Der Stop gehört dorthin, wo die Trade-Idee falsch ist, nicht dorthin, wo die Lotgröße schön aussieht.
3. **Teile das Geld durch den Stop.**

> **Lots = Risikobetrag ÷ (Stop-Abstand × Wert eines Lots pro Pip)**

Das Einzige, was sich zwischen den Instrumenten ändert, ist der Wert eines Lots pro Pip. Hast du diese Zahl, ist der Rest nur noch Division.

## Pip-Wert: die Zahl, die sich je nach Paar ändert

Ein Standard-Lot im Forex sind 100.000 Einheiten der Basiswährung. Ein Pip ist bei den meisten Paaren 0,0001 und bei Paaren, die in japanischen Yen notiert sind, 0,01. Was ein Pip in Dollar wert ist, hängt von der Währung ab, in der das Paar notiert ist (der zweiten Währung, der Quotewährung).

| Paartyp | Beispiel | 1 Pip | Wert von 1 Lot pro Pip (USD-Konto) |
|---|---|---|---|
| Quotewährung ist USD | EUR/USD, GBP/USD, AUD/USD | 0,0001 | 10,00 $, immer |
| Basiswährung ist USD | USD/JPY bei 150 | 0,01 | 1.000 JPY ÷ 150 = 6,67 $ |
| Basiswährung ist USD | USD/CAD bei 1,38 | 0,0001 | 10 CAD ÷ 1,38 = 7,25 $ |
| Cross-Paar, Yen als Quote | GBP/JPY, USD/JPY bei 150 | 0,01 | 1.000 JPY ÷ 150 = 6,67 $ |
| Cross-Paar, andere Quote | EUR/GBP, GBP/USD bei 1,27 | 0,0001 | 10 £ × 1,27 = 12,70 $ |
| Gold | XAU/USD, 100 oz pro Lot | 0,01 $ | 1 $ pro 0,01 $, 100 $ pro 1,00 $ Bewegung |

Die Regel hinter der Tabelle: Ein Pip auf ein Lot sind immer 10 Einheiten der Quotewährung (1.000 bei Yen-Paaren). Rechne das zum aktuellen Kurs in deine Kontowährung um, und du hast den Pip-Wert. Die Wechselkurse oben sind Beispiele; nimm beim Rechnen den heutigen Kurs.

## Rechenbeispiele

Alle Beispiele gehen von einem Konto mit 10.000 $ aus und runden das Ergebnis auf die Schrittweite von 0,01 Lots **ab**, damit das echte Risiko nie über dem Limit landet.

### 1. EUR/USD, 1 % Risiko, 25-Pip-Stop

- Risikobetrag: 1 % × 10.000 $ = **100 $**
- Pip-Wert pro Lot: **10 $**
- Lots = 100 $ ÷ (25 × 10 $) = **0,40 Lots**

Am Stop verlierst du 25 × 10 $ × 0,40 = 100 $. Genau wie geplant.

### 2. USD/JPY bei 150, 1 % Risiko, 20-Pip-Stop

- Risikobetrag: **100 $**
- Pip-Wert pro Lot: 1.000 JPY ÷ 150 = **6,67 $**
- Lots = 100 $ ÷ (20 × 6,67 $) = **0,75 Lots**

Gleiche 100 $ Risiko, ein kleinerer Stop als in Beispiel 1 und trotzdem eine größere Position: Der Pip ist bei diesem Paar weniger wert.

### 3. GBP/JPY, 1 % Risiko, 30-Pip-Stop

- Die Quotewährung ist Yen, also ist der Pip-Wert derselbe wie bei USD/JPY: **6,67 $** bei einem USD/JPY-Kurs von 150
- Lots = 100 $ ÷ (30 × 6,67 $) = **0,50 Lots**

### 4. EUR/GBP, 1 % Risiko, 20-Pip-Stop

- Die Quotewährung ist Pfund: 1 Pip auf 1 Lot sind 10 £. Bei GBP/USD 1,27 sind das **12,70 $**
- Lots = 100 $ ÷ (20 × 12,70 $) = 0,3937, abgerundet auf **0,39 Lots**
- Echtes Risiko am Stop: 20 × 12,70 $ × 0,39 = **99,06 $**

### 5. Gold, 1 % Risiko, Stop 4,00 $ entfernt

- Ein Lot XAU/USD sind meist 100 Unzen, also ist eine Bewegung von 1,00 $ **100 $ pro Lot** wert
- Lots = 100 $ ÷ (4,00 $ × 100 $) = **0,25 Lots**

Manche Broker nutzen für Gold, Indizes und Krypto-CFDs eine andere Kontraktgröße. Prüf die Kontraktspezifikation in deiner Plattform, bevor du irgendeiner Formel vertraust, auch dieser.

## Gleiches Risiko, unterschiedliche Stops

Ein weiterer Stop bedeutet keinen größeren Verlust. Er bedeutet eine kleinere Position. Mit 100 $ Risiko auf EUR/USD:

| Stop | Lots | Verlust am Stop |
|---|---|---|
| 10 Pips | 1,00 | 100 $ |
| 20 Pips | 0,50 | 100 $ |
| 40 Pips | 0,25 | 100 $ |
| 80 Pips | 0,12 | 96 $ |

Genau darum geht es bei der Positionsgröße: Der Stop kommt aus dem Chart, die Größe kommt aus dem Stop, und der Verlust bleibt bei jedem Trade gleich. Erst diese Konstanz macht deine [Trefferquote](/glossary/win-rate) und dein [Chance-Risiko-Verhältnis](/glossary/risk-reward-ratio) aussagekräftig, denn jeder Verlust von −1R ist derselbe Geldbetrag.

## Wie viel solltest du pro Trade riskieren?

Es gibt nicht die eine richtige Zahl, aber der Zielkonflikt ist immer derselbe: Je höher das Risiko, desto kürzer die Verlustserie, die du überstehen kannst.

| Verluste in Folge | 0,5 % Risiko | 1 % Risiko | 2 % Risiko | 5 % Risiko |
|---|---|---|---|---|
| 5 | −2,5 % | −4,9 % | −9,6 % | −22,6 % |
| 10 | −4,9 % | −9,6 % | −18,3 % | −40,1 % |

Verlustserien von 8 bis 10 Trades sind bei einer Strategie mit 40 % bis 50 % Trefferquote normal, sobald du ein paar hundert Trades gemacht hast. Viele Trader landen bei 0,5 % bis 1 % pro Trade; in einer Prop-Firm-Challenge mit 5 % Tagesverlustlimit und 10 % maximalem Drawdown lässt dir 0,5 % den meisten Spielraum. Unser [Risk-of-Ruin-Rechner](/tools/risk-of-ruin-calculator) zeigt dir, wie sich jedes Risikoniveau auf deine Wahrscheinlichkeit auswirkt, ein Drawdown-Limit zu reißen.

## Fünf Fehler bei der Positionsgröße, die dein echtes Risiko verdoppeln

1. **Mit fester Lotgröße traden.** 0,50 Lots bei einem 15-Pip-Stop und 0,50 Lots bei einem 60-Pip-Stop sind 75 $ Risiko und 300 $ Risiko. Dein Journal zeigt dann „zufällige“ Ergebnisse, die in Wahrheit nur Rauschen aus der Positionsgröße sind.
2. **Aufrunden.** Wer 0,437 Lots auf 0,44 rundet, riskiert bei jedem Trade etwas mehr als geplant. Runde ab.
3. **Kosten ignorieren.** Spread und Kommission zahlst du zusätzlich zum Stop. Eine Round-Turn-Kommission von 7 $ pro Lot kostet bei einem Trade mit 0,40 Lots 2,80 $ extra: fast 3 % mehr als die geplanten 100 $.
4. **Den Stop nach der Berechnung verschieben.** Erweiterst du einen 25-Pip-Stop nach dem Einstieg auf 40 Pips, werden aus 100 $ Risiko 160 $. Braucht die Idee einen weiteren Stop, berechne die Größe vor dem Einstieg neu.
5. **Verlusttrades aufstocken.** Nachkaufen im Verlust (Averaging down) macht aus einem geplanten Verlust von 1R schnell 2R oder 3R. Wenn dein Plan kein Scaling-in vorsieht, gehört es nicht zum Trade.

## Prüf deine Positionsgröße im Journal

Die Berechnung dauert zehn Sekunden; sich 200 Trades lang daran zu halten, ist der schwierige Teil. Genau da hilft ein Journal. Jeder Verlust, der deutlich unter −1R endete, ist ein Problem mit Positionsgröße oder Stop, und solche Trades fallen sofort auf, sobald alle deine Trades an einem Ort liegen. In [Wawe Journal](/) werden dein Durchschnittsgewinn, dein Durchschnittsverlust und dein [maximaler Drawdown](/glossary/max-drawdown) aus jedem Trade berechnet, den du erfasst oder synchronisierst, und der [KI-Coach](/ai-trading-coach) listet dir die Trades ohne Stop und die Verluste jenseits von −1R auf, samt dem, was sie dich gekostet haben.

## Das Wichtigste in Kürze

- Lots = Risikobetrag ÷ (Stop-Abstand × Pip-Wert eines Lots). Leg zuerst den Geldbetrag fest.
- Ein Pip auf ein Lot sind 10 Einheiten der Quotewährung (1.000 bei Yen-Paaren); rechne das zum heutigen Kurs in deine Kontowährung um.
- Ein weiterer Stop bedeutet eine kleinere Position, keinen größeren Verlust. Runde ab, nie auf.
- Spread, Kommission und verschobene Stops machen den echten Verlust größer als geplant. Prüf das in deinem Journal.
