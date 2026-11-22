---
slug: iyi-bir-profit-factor-kac-olmali
title: "İyi Bir Profit Factor Kaç Olmalı? Ölçütler, Hesaplama ve Tuzaklar"
seoTitle: "İyi Bir Profit Factor Kaç Olmalı? Ölçütler ve Hesap"
description: "Profit factor nedir, nasıl hesaplanır? Formül, kaba ölçütler, win rate ve expectancy ile ilişkisi ve 20 işlemdeki 3’lük profit factor neden pek bir şey demez."
date: "2026-11-20"
summary: "Formül, kaba ölçütler, profit factor’ün win rate ve expectancy ile ilişkisi ve az sayıda işlemdeki yüksek bir rakamın neden pek bir şey söylemediği."
cta: { href: "/#analytics", label: "Her stratejinin profit factor’ünü gör" }
---

Profit factor, trader’ların ilk baktığı rakamlardan biri ve yanlış okunması en kolay olanlardan biri. 1,4’lük bir profit factor sağlam, işlem yapılabilir bir avantaj olabilir. 3,5’lik bir profit factor ise yirmi şanslı işlemden ibaret olabilir. Bu rehberde rakamın ne anlama geldiğini, neyin iyi sayıldığını ve ona güvenmeden önce yapman gereken kontrolleri anlatıyoruz.

## Formül

> **Profit factor = brüt kâr ÷ brüt zarar**

Kazanan tüm işlemlerini topla, kaybeden tüm işlemlerini (pozitif bir sayı olarak) topla ve böl. Kazanan işlemlerin 6.000 $ kazandırdıysa ve kaybedenler 4.000 $ kaybettirdiyse, [profit factor](/glossary/profit-factor) 6.000 ÷ 4.000 = **1,5** olur: kaybettiğin her 1 $ için 1,50 $ kazanmışsın.

- **1,0’ın altı**: strateji para kaybettirir.
- **Tam 1,0**: hesaba katmayı unuttuğun her şeyden önce başa baş.
- **1,0’ın üstü**: strateji para kazandırır; ne kadar farkla kazandırdığını rakam söyler.

Her zaman komisyon ve swap düşüldükten sonraki **net** sonuçlarla hesapla. Maliyetler her işlemi vurur ve kısa vadeli bir stratejide 1,2’lik bir profit factor’ü kolayca 1,0’a indirebilir.

## İyi bir profit factor kaç olmalı?

Resmi bir ölçek yok, ama çoğu trader kabaca şöyle yorumlar:

| Profit factor | Kaba yorum |
|---|---|
| 1,0’ın altı | Kaybettiren strateji |
| 1,0 – 1,2 | İnce bir avantaj; maliyetler ya da piyasa davranışındaki küçük bir değişim onu silebilir |
| 1,2 – 1,5 | Birçok strateji için işe yarar bir avantaj, özellikle işlem sayısı yüksekse |
| 1,5 – 2,0 | Güçlü |
| 2,0 – 3,0 | Çok güçlü; örneklem büyüklüğünü ve maliyetleri kontrol et |
| 3,0’ın üstü | Yüzlerce işlemde nadir görülür; genelde küçük örneklem, eksik maliyetler ya da veriye uydurulmuş bir backtest |

Tabloyu nasıl okuyacağını iki şey değiştirir. **İşlem sıklığı:** yılda 1.000 işlem yapan ve profit factor’ü 1,15 olan bir scalping stratejisi, 40 işlem yapan ve profit factor’ü 2,0 olan bir swing stratejisinden daha fazla kazandırabilir. **Örneklem büyüklüğü:** aynı rakam 300 işlemde, 30 işlemde olduğundan çok daha inandırıcıdır.

## Profit factor, win rate ve payoff ile nasıl bağlantılı

Profit factor, işlemlerin hakkında ayrı bir gerçek değildir. Doğrudan [win rate’inden](/glossary/win-rate) (kazanma oranı) ve [payoff oranından](/glossary/payoff-ratio) (ortalama kazanç ÷ ortalama kayıp) gelir:

> **Profit factor = (win rate × payoff) ÷ (1 − win rate)**

| Win rate | Payoff | Profit factor |
|---|---|---|
| %60 | 1,0 | 0,60 × 1,0 ÷ 0,40 = **1,50** |
| %40 | 2,0 | 0,40 × 2,0 ÷ 0,60 = **1,33** |
| %45 | 1,5 | 0,45 × 1,5 ÷ 0,55 = **1,23** |
| %70 | 0,5 | 0,70 × 0,5 ÷ 0,30 = **1,17** |
| %35 | 2,5 | 0,35 × 2,5 ÷ 0,65 = **1,35** |

Yani profit factor’ü iki şekilde yükseltebilirsin: daha sık kazanarak ya da kazançları kayıplara göre büyüterek. Genelde birini iyileştirmek diğerinden bir şey götürür; bunu [win rate mi risk-ödül mü](/tr/blog/win-rate-mi-risk-odul-mu) yazısında anlatıyoruz.

## Profit factor ve expectancy

Tablonun ilk iki satırına tekrar bak. 1:1 ile %60’ın profit factor’ü 1,50; 1:2 ile %40’ınki 1,33. Yine de ikisinin [expectancy](/glossary/expectancy) (beklenen değer) rakamı tamamen aynı: işlem başına +0,2R. Kayıpları 1R olarak ölçersek:

> **Expectancy (R) = (1 − win rate) × (profit factor − 1)**

İki rakam farklı soruları cevaplar. Profit factor, kaybettiğin her dolar başına ne kadar kazandığını söyler; expectancy ise işlem başına ne kadar kazandığını. Stratejileri karşılaştırırken ikisine birden ve her birinin sana kaç işlem verdiğine bak.

## Bir profit factor’e güvenmeden önce beş kontrol

1. **İşlemleri say.** 30 işlemin altında rakam büyük ölçüde gürültüdür. %50 win rate ve 1:1 işlemlerle, hiçbir avantajı olmayan bir strateji bile sadece şanslı bir seri sayesinde 20 işlemde 1,5’in üzerinde profit factor gösterebilir; bu kabaca sekizde bir ihtimaldir.
2. **En büyük kazancı çıkar.** O tek işlem olmadan profit factor 1,8’den 1,1’e düşüyorsa, o "avantaj" tek bir işlemden ibarettir.
3. **Net rakamları kullan.** Komisyon, swap ve slippage hesaba dahil olmalı. Bunları yok sayan backtest’ler profit factor’ü olduğundan yüksek gösterir.
4. **Dönemi ikiye böl.** İşlemlerinin ilk yarısını ikinci yarısıyla karşılaştır. Gerçek bir avantaj genelde iki yarıda da görünür; veriye uydurulmuş olan ise söner.
5. **Drawdown’a bak.** %40 [max drawdown](/glossary/max-drawdown) ile gelen 2’lik bir profit factor, hesabın ya da sinirlerin için işlem yapılabilir olmayabilir. Profit factor, kazanç ve kayıpların sırası hakkında hiçbir şey söylemez.

## Hesap başına değil, strateji başına profit factor

Hesap genelindeki profit factor, işlem yaptığın her şeyi birbirine karıştırır. Güçlü bir setup ile iki zayıf setup, ikisini de gizleyen vasat bir 1,1 ortalamasına dönüşebilir. Stratejiye, sembole ve seansa göre ayırınca tablo genelde netleşir: bir setup hesabı sırtlar, bir diğeri sessizce eritir.

## Wawe Journal’da takip et

[Wawe Journal’da](/) profit factor, win rate, [payoff oranı](/glossary/payoff-ratio) ve expectancy her strateji için net sonuçlarından hesaplanır; canlı işlemlere, backtest işlemlerine ya da ikisine birden bakabilirsin. [AI koç](/ai-trading-coach) stratejilerini yan yana koyup hangisini bırakman gerektiğini söyleyebilir. Bir değişikliği gerçek işlemde uygulamadan önce test etmek istersen, [backtest replay](/backtesting) her simüle işlemi aynı metriklere kaydeder.

## Önemli çıkarımlar

- Profit factor = brüt kâr ÷ brüt zarar; maliyetler düşüldükten sonraki net sonuçlarla.
- Kabaca: 1,0’ın altı kaybettirir, 1,2–1,5 işe yarar, 1,5–2,0 güçlü, 3,0’ın üstü çok sayıda işlemde kanıtlanana kadar şüpheli.
- Profit factor = (win rate × payoff) ÷ (1 − win rate); expectancy = (1 − win rate) × (profit factor − 1).
- Rakama güvenmeden önce örneklem büyüklüğünü, en büyük kazancı, maliyetleri ve drawdown’ı kontrol et.
