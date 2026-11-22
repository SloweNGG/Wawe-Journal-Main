---
slug: ftmo-challenge-bestehen
title: "FTMO-Challenge bestehen: Regeln, Mathematik und Risikoplan"
seoTitle: "FTMO-Challenge bestehen: Regeln, Mathe & Risikoplan"
description: "FTMO-Challenge bestehen: 2-Step- und 1-Step-Regeln in klaren Zahlen, die Mathematik der Verlustserien und ein Risikoplan, der dich in den Limits hält."
date: "2026-11-18"
summary: "Die Regeln in klaren Zahlen, die Mathematik der Verlustserien hinter den meisten gescheiterten Challenges und ein Risikoplan, der dich innerhalb der Limits hält."
cta: { href: "/tools/prop-firm-pass-probability", label: "Bestehenswahrscheinlichkeit schätzen" }
props: true
---

Die meisten FTMO-Challenges scheitern nicht daran, dass die Strategie keinen Edge hat. Sie scheitern, weil eine ganz normale Verlustserie mit zu großer Positionsgröße in das Tagesverlustlimit oder den maximalen Verlust läuft, bevor sich der Edge zeigen kann. Bestehen ist vor allem eine Frage des Risikomanagements, und Risikomanagement ist Rechnen.

Dieser Guide übersetzt die Regeln in klare Zahlen, zeigt, wie oft Verlustserien wirklich vorkommen, und macht aus beidem einen Risikoplan.

> Die Regeln unten stammen aus unserer letzten Prüfung der öffentlichen FTMO-Regeln (Oktober 2026). Prop-Firms ändern ihre Bedingungen; prüf die aktuellen Zahlen immer auf der FTMO-Website, bevor du tradest.

## Die FTMO-Regeln in Zahlen

### 2-Step-Challenge (Challenge + Verification)

| Regel | Phase 1 (Challenge) | Phase 2 (Verification) | Funded-Account |
|---|---|---|---|
| Gewinnziel | 10 % | 5 % | keines |
| Maximaler Tagesverlust | 5 % des Anfangskapitals | 5 % | 5 % |
| Maximaler Verlust | 10 % des Anfangskapitals, statisch | 10 % statisch | 10 % statisch |
| Mindestanzahl Handelstage | 4 | 4 | keine |

Bei einem Konto mit 100.000 $ heißt das:

- **Tagesverlust:** Das Limit liegt fix bei 5.000 $, gemessen ab deinem Kontostand zu Tagesbeginn. Offene Positionen zählen mit: Fällt deine Equity 5.000 $ unter den Kontostand zu Tagesbeginn, ist die Regel verletzt, auch wenn die Trades noch offen sind. Der Tag wird um Mitternacht Prager Zeit (MEZ/MESZ) zurückgesetzt.
- **Maximaler Verlust:** Deine Equity darf nie unter 90.000 $ fallen. Die Grenze ist statisch: Sie steigt nicht mit, wenn du Gewinne machst.

### 1-Step-Challenge

| Regel | Challenge | Funded-Account |
|---|---|---|
| Gewinnziel | 10 % | keines |
| Maximaler Tagesverlust | 3 % des Anfangskapitals | 3 % |
| Maximaler Verlust | 10 %, trailing zum Tagesschluss | 10 %, trailing zum Tagesschluss |
| Best-Day-Regel | kein einzelner Tag darf mehr als 50 % des Gewinns ausmachen | gleich |

Die 1-Step-Challenge verzeiht weniger: Das Tageslimit liegt bei nur 3 %, und der maximale Verlust zieht deinem höchsten Kontostand zum Tagesschluss nach. Eine gute Woche hebt also den Boden unter dir an.

## Warum die meisten Challenges scheitern: die Mathematik der Verlustserien

Trader unterschätzen gern, wie lang ihre Verlustserien werden. Hier ist die Wahrscheinlichkeit, innerhalb von 100 Trades **mindestens eine** Serie aufeinanderfolgender Verluste zu erleben, für drei Trefferquoten:

| Verluste in Folge | 60 % Trefferquote | 50 % Trefferquote | 40 % Trefferquote |
|---|---|---|---|
| 5 | 46 % | 81 % | 98 % |
| 6 | 21 % | 55 % | 87 % |
| 8 | 4 % | 17 % | 49 % |
| 10 | 1 % | 4 % | 20 % |

Ein Trader mit 50 % Trefferquote erlebt während einer Challenge sehr wahrscheinlich fünf Verluste in Folge, und bei sechs ist es ein Münzwurf. Ein Trader mit 40 % Trefferquote, was für Strategien mit großen Gewinnern normal ist, sollte mit acht rechnen.

Kombinier das jetzt mit deinem Risiko pro Trade. So viele volle Verluste (je −1R) braucht es, um bei der 2-Step-Challenge jedes Limit aufzubrauchen:

| Risiko pro Trade | Verluste bis zum Tageslimit von 5 % | Verluste bis zum maximalen Verlust von 10 % |
|---|---|---|
| 2 % | 3 | 5 |
| 1 % | 5 | 10 |
| 0,5 % | 10 | 20 |
| 0,25 % | 20 | 40 |

Bei 2 % Risiko beendet eine gewöhnliche Serie von fünf Verlusten die Challenge. Bei 1 % hat ein Trader mit 50 % Trefferquote eine realistische Chance auf eine Serie, die sie beendet. Bei 0,5 % braucht es dafür eine Serie, die für die meisten Strategien selten ist. Das ist das ganze Argument für kleines Risiko.

Bei der 1-Step-Challenge liegt das Tageslimit bei 3 %: Bei 1 % Risiko reichen drei Verluste am selben Tag.

## Ein Risikoplan, der dich innerhalb der Limits hält

### 1. Riskiere 0,5 % pro Trade oder weniger

Es fühlt sich langsam an, verschafft dir aber Luft für die Verlustserien von oben. Berechne die Lotgröße jedes Mal aus dem Stop-Abstand ([so geht's](/de/blog/positionsgroesse-berechnen)), damit ein voller Stop-out genau 0,5 % kostet ([1R](/glossary/r-multiple)).

### 2. Setz dir einen persönlichen Tagesstopp weit vor dem Limit der Firma

Hör für den Tag auf, sobald du bei −2 % stehst oder drei Verlusttrades hattest, je nachdem, was zuerst eintritt. So erreicht ein schlechter Tag nie die 5-%-Regel, und du unterbindest das Revenge-Trading, das meist auf den dritten Verlust folgt.

### 3. Begrenze die Anzahl der Trades pro Tag

Overtrading ist der häufigste Weg, auf dem aus einem normalen Tag ein Regelverstoß wird. Zwei oder drei hochwertige Trades am Tag reichen für die meisten Strategien völlig.

### 4. Reduziere das Risiko nach einem Drawdown

Liegst du 4 % unter deinem Startkapital, halbiere dein Risiko auf 0,25 %, bis du wieder über −2 % bist. Ein statischer maximaler Verlust von 10 % lässt dir keine zweite Chance, sobald er erreicht ist.

### 5. Kenne deine Zahlen, bevor du startest

Ohne positiven [Erwartungswert](/glossary/expectancy) bestehst du überhaupt nicht. Bei 0,5 % Risiko und einem Erwartungswert von +0,3R pro Trade bringt dir jeder Trade im Schnitt 0,15 %, das Ziel von 10 % erreichst du also nach rund 67 Trades. Zeigt dein Journal über deine letzten 50 Trades einen negativen Erwartungswert, rettet kein Risikoplan die Challenge.

### 6. Hetz weder dem Ziel noch den Handelstagen hinterher

Zum Zeitpunkt unserer Prüfung hat die 2-Step-Challenge kein maximales Zeitlimit, nur ein Minimum von vier Handelstagen. Es gibt keinen Grund, die Positionsgröße zu erhöhen, weil sich das Ziel weit weg anfühlt.

### 7. Achte bei der 1-Step auf die Konsistenzregel

Weil kein einzelner Tag mehr als die Hälfte des Gewinns ausmachen darf, kann ein einziger übergroßer Gewinntag dein Bestehen verzögern. Auch hier hilft eine gleichmäßige Positionsgröße.

## Schätze deine Bestehenswahrscheinlichkeit, bevor du bezahlst

Du kannst deine eigenen Zahlen mit einer Simulation testen. Gib deine Trefferquote, deinen durchschnittlichen Gewinn und Verlust, dein Risiko pro Trade und deine Trades pro Tag in den kostenlosen [Prop-Firm-Rechner für die Bestehenswahrscheinlichkeit](/tools/prop-firm-pass-probability) ein, der eine Monte-Carlo-Simulation der Challenge durchführt. Der [Drawdown-Rechner](/tools/prop-firm-drawdown-calculator) zeigt dir, wie viel Spielraum du heute noch bis zur Tagesverlust- und zur Maximalverlust-Regel hast.

Wenn du die Challenge selbst tradest, prüft der [Prop-Firm-Tracker in Wawe Journal](/prop-firm-tracker) jeden synchronisierten oder importierten Trade gegen die FTMO-Vorlage, inklusive der Prager Reset-Zeit, und zeigt den verbleibenden Spielraum als Anzeigen auf deinem Dashboard.

## Das Wichtigste in Kürze

- Bei einer 2-Step-Challenge über 100.000 $: +10.000 $ Ziel, ein fixes Tagesverlustlimit von 5.000 $ ab dem Kontostand zu Tagesbeginn und ein statischer Boden bei 90.000 $.
- Verlustserien von 5 bis 8 Trades sind normal; wähl deine Positionsgröße so, dass sie die Challenge nicht beenden können.
- 0,5 % Risiko pro Trade, ein persönlicher Tagesstopp bei −2 % und ein Trade-Limit pro Tag schalten die meisten Wege aus, auf denen eine Challenge scheitert.
- Ein positiver Erwartungswert aus deinem Journal kommt zuerst; Risikomanagement schützt nur einen Edge, den du schon hast.

*FTMO ist eine Marke ihres Inhabers. Wawe Journal ist weder mit FTMO verbunden noch von FTMO unterstützt.*
