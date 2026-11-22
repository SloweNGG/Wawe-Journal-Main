---
slug: win-rate-mi-risk-odul-mu
title: "Win Rate mi Risk-Ödül mü? Trading’de Hangisi Daha Önemli?"
seoTitle: "Win Rate mi Risk-Ödül mü? Hangisi Daha Önemli?"
description: "Risk-ödül oranı olmadan win rate bir şey ifade etmez. Expectancy formülü, başa baş kazanma oranları ve aynı avantajın neden on kat risk taşıyabileceği."
date: "2026-11-20"
summary: "Expectancy formülü, her risk-ödül oranı için başa baş win rate ve aynı avantaja sahip iki stratejiden birinin neden on kat fazla risk taşıyabileceği."
cta: { href: "/tools/risk-of-ruin-calculator", label: "Rakamlarını risk of ruin hesaplayıcısında test et" }
---

"İşlemlerimin %70’ini kazanıyorum" lafı, "işlemlerimin %35’ini kazanıyorum" lafından daha iyi duyulur. Öyle olmayabilir. Kazançları küçük, kayıpları büyük olan %70 win rate para kaybettirir; kazançları kayıplarının üç katı olan %35 win rate ise gayet iyi kazandırır. Win rate ve risk-ödül ancak birlikte bir anlam taşır.

Bu rehber, ikisini tek bir rakamda nasıl birleştireceğini, her risk-ödül oranı için hangi win rate’e ihtiyacın olduğunu ve çoğu trader’ın gözden kaçırdığı kısmı gösteriyor: aynı avantaja sahip iki stratejiyle işlem yapmak bambaşka hissettirebilir.

## İki rakam

- **[Win rate](/glossary/win-rate)** (kazanma oranı): kârla kapanan işlemlerin payı. 100 işlemden 45’i kazançlıysa win rate %45’tir.
- **Risk-ödül**: kazançlarının kayıplarına göre ne kadar büyük olduğu. İşlemden önce bu, planlanan [risk-ödül oranıdır](/glossary/risk-reward-ratio) (hedef mesafesi ÷ stop mesafesi). İşlemlerden sonra ise [payoff oranıdır](/glossary/payoff-ratio): ortalama kazanç ÷ ortalama kayıp. Önemli olan gerçekleşen rakamdır.

## Expectancy ikisini birleştirir

[Expectancy](/glossary/expectancy) (beklenen değer), ortalama bir işlemden kazandığın miktardır. 1R’nin riske ettiğin tutar olduğu R cinsinden ölçülür:

> **Expectancy (R) = win rate × ödül − (1 − win rate) × 1**

| Strateji | Win rate | Ödül : risk | İşlem başına expectancy |
|---|---|---|---|
| A, scalper | %70 | 0,5 | 0,70 × 0,5 − 0,30 = **+0,05R** |
| B, trend takipçisi | %35 | 2,5 | 0,35 × 2,5 − 0,65 = **+0,225R** |
| C, "kesin kazanç" | %80 | 0,2 | 0,80 × 0,2 − 0,20 = **−0,04R** |

%35 win rate’e sahip trader, %70’lik olandan işlem başına dört buçuk kat fazla kazanır; %80’lik strateji ise para kaybettirir. Yüksek win rate sana ne kadar sık haklı çıktığını söyler, ne kadar kazandığını değil.

## Her risk-ödül oranı için başa baş win rate

Expectancy’yi sıfıra eşitlersen, sadece başa baş çıkmak için gereken win rate’i bulursun:

> **Başa baş win rate = 1 ÷ (1 + ödül)**

| Ödül : risk | Başa baş win rate |
|---|---|
| 0,5 | %66,7 |
| 1,0 | %50,0 |
| 1,5 | %40,0 |
| 2,0 | %33,3 |
| 3,0 | %25,0 |
| 5,0 | %16,7 |

Avantajın, gerçek win rate’inle bu rakam arasındaki farktır. %45 kazanan 1:2’lik bir stratejide bu fark geniştir (12 puan); %52 kazanan 1:1’lik bir stratejide ise incedir. Maliyetler bu farkı daha da daraltır: spread ve komisyon her kazançtan biraz yer, her kayba biraz ekler.

## İkisini birden yükseltemezsin

Bu iki rakam birbirine ters yönde çeker. Hedefini uzaklaştırırsan her kazanç büyür, ama hedefe ulaşan işlem sayısı azalır. Hedefi yaklaştırırsan daha sık kazanırsın, ama her kazanç küçülür. Trailing stop, kısmi kâr alma ve stopu breakeven’a çekmek, işlemleri bu iki sütun arasında kaydırır.

Bu yüzden faydalı soru "win rate’imi nasıl yükseltirim?" değil, "setup’ım için en yüksek expectancy’yi hangi kombinasyon verir?" sorusudur. Dürüst cevap yalnızca kendi işlemlerinden gelir: aynı setup’ı günlüğünde ya da bir backtest’te farklı çıkışlarla karşılaştır ve en az 50 işlemde en iyi expectancy’yi veren versiyonu tut.

## Aynı avantaj, bambaşka bir yolculuk

İşte expectancy’nin gizlediği kısım. İşlem başına tam olarak aynı, +0,2R expectancy’ye sahip iki strateji alalım:

- **Strateji 1:** %60 win rate, 1:1
- **Strateji 2:** %40 win rate, 1:2

İkisini de [risk of ruin hesaplayıcısından](/tools/risk-of-ruin-calculator) geçirdik: 10.000 simüle hesap, her birinde 200 işlem, işlem başına %1 risk ve "batma" (ruin) eşiği olarak başlangıç bakiyesinden %10’luk düşüş, yani tipik bir prop firma challenge’ının max drawdown’ı.

| | 1:1 ile %60 | 1:2 ile %40 |
|---|---|---|
| İşlem başına expectancy | +0,2R | +0,2R |
| Medyan en uzun kayıp serisi | 5 | 9 |
| Üst üste 8+ kayıp ihtimali | %7,5 | %75 |
| −%10’a düşen hesaplar | %1,3 | %13 |
| Medyan son bakiye | %148 | %146 |

Aynı avantaj, aynı medyan sonuç, ama başarısız olma riskinde on kat fark. Düşük win rate daha uzun kayıp serileriyle gelir ve drawdown limitlerini patlatan şey de kayıp serileridir. İşlem başına %2 riskte fark daha da açılır: %60’lık hesapların %10,5’i, %40’lık hesapların ise %35’i limite takılır.

Düşük win rate’li stratejilerde yanlış bir şey yok; en iyi trend sistemlerinin çoğu işlemlerin %40’ından azını kazanır. Ama bu stratejiler işlem başına daha küçük risk ve planı değiştirmeden üst üste dokuz kaybı sineye çekebilen bir trader ister.

## Bununla ne yapmalısın

1. **İki rakamı da gerçek işlemlerden ölç.** Planlanan risk-ödül bir dilektir; günlüğündeki payoff oranı ise gerçektir. Birçok trader 1:2 planlar ama kârı erken aldığı için 1:1,2 gerçekleştirir.
2. **Expectancy’ni setup bazında hesapla.** 50’den fazla işlemde negatif expectancy’si olan bir setup, win rate’i ne olursa olsun düzeltilmeli ya da bırakılmalı.
3. **Pozisyonunu kayıp serilerine göre boyutlandır.** Win rate’in ne kadar düşükse, aynı güvenlik için işlem başına riskin o kadar küçük olmalı. [Pozisyon büyüklüğü hesaplayıcısı](/tools/position-size-calculator) bu riski lot büyüklüğüne çevirir.
4. **Bir stratejiyi geçen haftaya bakarak yargılama.** %40 win rate’te sekiz kayıplık bir seri normaldir, avantajın kaybolduğunun işareti değildir.

## Günlüğünde takip et

Bunların hepsi setup bazında gerçek rakamları gerektirir. [Wawe Journal’da](/) win rate’in, ortalama kazancın ve kaybın, [profit factor’ün](/glossary/profit-factor) ve expectancy’n her strateji için kaydettiğin ya da senkronize ettiğin işlemlerden hesaplanır; [AI koç](/ai-trading-coach) da backtest’lerinin bu stratejiler hakkında söylediklerini de hesaba katarak stratejilerini yan yana karşılaştırabilir.

## Önemli çıkarımlar

- Win rate ve risk-ödül tek başına hiçbir şey ifade etmez. Expectancy = win rate × ödül − (1 − win rate).
- Başa baş win rate = 1 ÷ (1 + ödül): 1:1’de %50, 1:2’de %33, 1:3’te %25.
- Aynı expectancy’ye sahip iki stratejinin kayıp serileri ve drawdown’ları çok farklı olabilir.
- Win rate’in ne kadar düşükse, işlem başına riskin o kadar küçük olmalı.
