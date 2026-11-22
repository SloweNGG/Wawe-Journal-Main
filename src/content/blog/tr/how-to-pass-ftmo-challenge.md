---
slug: ftmo-challenge-nasil-gecilir
title: "FTMO Challenge Nasıl Geçilir: Kurallar, Matematik ve Risk Planı"
seoTitle: "FTMO Challenge Nasıl Geçilir: Kurallar, Hesap, Risk Planı"
description: "FTMO challenge nasıl geçilir: 2-Step ve 1-Step kuralları net rakamlarla, challenge’ları bitiren kayıp serisi matematiği ve limitler içinde kalan risk planı."
date: "2026-11-18"
summary: "Net rakamlarla kurallar, başarısız challenge’ların çoğunun arkasındaki kayıp serisi matematiği ve seni limitlerin içinde tutan bir risk planı."
cta: { href: "/tools/prop-firm-pass-probability", label: "Geçme olasılığını hesapla" }
props: true
---

FTMO challenge’larının çoğu, stratejinin bir avantajı (edge) olmadığı için kaybedilmez. Normal bir kayıp serisi, fazla büyük pozisyonlarla, edge kendini gösterecek zamanı bulamadan günlük kayıp limitine ya da maksimum kayba çarptığı için kaybedilir. Challenge’ı geçmek büyük ölçüde bir risk yönetimi meselesidir; risk yönetimi de aritmetiktir.

Bu rehber kuralları net rakamlara döküyor, kayıp serilerinin gerçekte ne sıklıkla yaşandığını gösteriyor ve ikisini bir risk planına çeviriyor.

> Aşağıdaki kurallar, FTMO’nun herkese açık kurallarını son kontrol ettiğimiz tarihe (Ekim 2026) aittir. Prop firmalar şartlarını değiştirir; işlem yapmadan önce güncel rakamları her zaman FTMO’nun sitesinden teyit et.

## Rakamlarla FTMO kuralları

### 2-Step challenge (Challenge + Verification)

| Kural | Faz 1 (Challenge) | Faz 2 (Verification) | Funded hesap |
|---|---|---|---|
| Kâr hedefi | %10 | %5 | yok |
| Maksimum günlük kayıp | Başlangıç bakiyesinin %5’i | %5 | %5 |
| Maksimum kayıp | Başlangıç bakiyesinin %10’u, sabit | %10 sabit | %10 sabit |
| Minimum işlem günü | 4 | 4 | yok |

100.000 $’lık bir hesapta bu şu anlama gelir:

- **Günlük kayıp:** limit sabit 5.000 $’dır ve günün başındaki bakiyenden ölçülür. Açık pozisyonlar da sayılır: equity’n (açık işlemler dahil hesap değerin) günün başlangıç bakiyesinin 5.000 $ altına düşerse, işlemler hâlâ açık olsa bile kural ihlal edilmiş olur. Gün, Prag saatiyle (CET/CEST) gece yarısı sıfırlanır.
- **Maksimum kayıp:** equity’n asla 90.000 $’ın altına düşemez. Bu limit sabittir: para kazandıkça yukarı kaymaz.

### 1-Step challenge

| Kural | Challenge | Funded hesap |
|---|---|---|
| Kâr hedefi | %10 | yok |
| Maksimum günlük kayıp | Başlangıç bakiyesinin %3’ü | %3 |
| Maksimum kayıp | %10, gün sonu bazında trailing | %10, gün sonu bazında trailing |
| En iyi gün kuralı | Hiçbir gün kârın %50’sinden fazlasını oluşturamaz | aynı |

1-Step challenge daha az affedicidir: günlük limit yalnızca %3’tür ve maksimum kayıp en yüksek gün sonu bakiyeni takip eder; yani iyi bir hafta, altındaki tabanı da yukarı çeker.

## Challenge’ların çoğu neden başarısız olur: kayıp serisi matematiği

Trader’lar kayıp serilerinin ne kadar uzayabileceğini hafife alma eğilimindedir. Aşağıda, üç farklı win rate (kazanma oranı) için 100 işlem içinde art arda kayıplardan oluşan **en az bir** seri görme olasılığı var:

| Art arda kayıp | %60 win rate | %50 win rate | %40 win rate |
|---|---|---|---|
| 5 | %46 | %81 | %98 |
| 6 | %21 | %55 | %87 |
| 8 | %4 | %17 | %49 |
| 10 | %1 | %4 | %20 |

%50 win rate’e sahip bir trader, challenge sırasında büyük ihtimalle art arda beş kayıp görecek; altı kayıp görme ihtimali de yazı-tura kadar. Büyük kazançlar hedefleyen stratejilerde normal sayılan %40 win rate’e sahip bir trader ise sekiz kayba göre plan yapmalı.

Şimdi bunu işlem başına riskinle birleştir. 2-Step challenge’da her limiti doldurmak için kaç tam kayıp (her biri −1R) gerektiği şöyle:

| İşlem başına risk | %5 günlük limite ulaşmak için gereken kayıp | %10 maksimum kayba ulaşmak için gereken kayıp |
|---|---|---|
| %2 | 3 | 5 |
| %1 | 5 | 10 |
| %0,5 | 10 | 20 |
| %0,25 | 20 | 40 |

%2 riskte sıradan bir beş kayıplık seri challenge’ı bitirir. %1’de, %50 win rate’li bir trader için challenge’ı bitirecek bir seri gerçekçi bir ihtimaldir. %0,5’te ise çoğu strateji için nadir görülen bir seri gerekir. Küçük risk lehine argümanın tamamı budur.

1-Step challenge’da günlük limit %3: %1 riskte aynı gün içinde üç kayıp yeterli.

## Seni limitlerin içinde tutan bir risk planı

### 1. İşlem başına %0,5 ya da daha az risk al

Yavaş gibi gelir ama yukarıdaki kayıp serileri için sana alan kazandırır. Lot büyüklüğünü her seferinde stop mesafesinden hesapla ([nasıl yapılacağı burada](/tr/blog/pozisyon-buyuklugu-hesaplama)), böylece tam bir stop olmak sana tam olarak %0,5’e ([1R](/glossary/r-multiple)) mal olsun.

### 2. Firmanın limitinden çok önce devreye giren kişisel bir günlük stop belirle

−%2’den ya da üç zararlı işlemden sonra (hangisi önce gelirse) o gün işlemi bırak. Bu, kötü bir günün %5 kuralına asla ulaşmamasını sağlar ve genelde üçüncü kaybın ardından gelen revenge trading’i de durdurur.

### 3. Günlük işlem sayısına sınır koy

Aşırı işlem yapmak (overtrading), normal bir günün kural ihlaline dönüşmesinin en yaygın yoludur. Çoğu strateji için günde iki üç kaliteli işlem fazlasıyla yeter.

### 4. Drawdown’dan sonra riski düşür

Başlangıç bakiyenin %4 altındaysan, tekrar −%2’nin üstüne çıkana kadar riskini yarıya, yani %0,25’e indir. Sabit %10 maksimum kayıp limitine bir kez ulaşıldığında ikinci şans yoktur.

### 5. Başlamadan önce rakamlarını bil

Challenge’ı geçebilmek için her şeyden önce pozitif bir [expectancy](/glossary/expectancy) (beklenen değer) gerekir. %0,5 risk ve işlem başına +0,3R expectancy ile her işlem ortalama %0,15 ekler; yani %10 hedefe ulaşmak yaklaşık 67 işlem sürer. Günlüğün son 50 işleminde negatif expectancy gösteriyorsa, hiçbir risk planı challenge’ı kurtaramaz.

### 6. Hedef ya da işlem günleri için acele etme

Kontrol ettiğimiz tarihte 2-Step challenge’da maksimum süre sınırı yok, yalnızca minimum dört işlem günü şartı var. Hedef uzak göründü diye pozisyon büyütmen için hiçbir sebep yok.

### 7. 1-Step’te tutarlılık kuralına dikkat et

Hiçbir gün kârın yarısından fazlasını oluşturamadığı için, aşırı büyük tek bir kazançlı gün challenge’ı geçmeni geciktirebilir. Burada da istikrarlı pozisyon büyüklüğü işe yarar.

## Ücret ödemeden önce geçme olasılığını tahmin et

Kendi rakamlarını bir simülasyonla test edebilirsin. Win rate’ini, ortalama kazancını ve zararını, işlem başına riskini ve günlük işlem sayını ücretsiz [prop firma geçme olasılığı hesaplayıcısına](/tools/prop-firm-pass-probability) gir; araç challenge’ın Monte Carlo simülasyonunu çalıştırır. [Drawdown hesaplayıcısı](/tools/prop-firm-drawdown-calculator) da günlük ve maksimum kayıp kurallarına karşı bugün ne kadar alanın kaldığını gösterir.

Challenge’ın kendisinde işlem yapıyorsan, [Wawe Journal’daki prop firma takipçisi](/prop-firm-tracker) senkronize edilen ya da içe aktarılan her işlemi Prag sıfırlama saati dahil FTMO ön ayarına göre kontrol eder ve kalan alanını panelinde göstergelerle gösterir.

## Önemli çıkarımlar

- 100K $’lık 2-Step challenge’da: +10.000 $ hedef, günün başlangıç bakiyesinden ölçülen sabit 5.000 $ günlük kayıp limiti ve 90.000 $’da sabit bir taban.
- 5 ila 8 işlemlik kayıp serileri normaldir; pozisyonunu bu seriler challenge’ı bitiremeyecek şekilde ayarla.
- İşlem başına %0,5 risk, −%2’de kişisel günlük stop ve günlük işlem sınırı, challenge’ın başarısız olabileceği yolların çoğunu ortadan kaldırır.
- Önce günlüğünden çıkan pozitif bir expectancy gelir; risk yönetimi yalnızca zaten sahip olduğun bir edge’i korur.

*FTMO, sahibinin ticari markasıdır. Wawe Journal, FTMO ile bağlantılı değildir ve FTMO tarafından desteklenmez.*
