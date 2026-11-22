---
slug: pozisyon-buyuklugu-hesaplama
title: "Forex’te Pozisyon Büyüklüğü Nasıl Hesaplanır? (Çözümlü Örneklerle)"
seoTitle: "Forex’te Pozisyon Büyüklüğü Hesaplama (Örneklerle)"
description: "Pozisyon büyüklüğü hesaplama formülü, USD, JPY, çapraz parite ve altın için pip değerleri, beş çözümlü örnek ve riskini ikiye katlayan hatalar."
date: "2026-11-20"
summary: "Her lot büyüklüğünün arkasındaki tek formül, tüm parite türleri ve altın için pip değerleri, beş çözümlü örnek ve riskini sessizce ikiye katlayan hatalar."
cta: { href: "/tools/position-size-calculator", label: "Pozisyon büyüklüğü hesaplayıcısını aç" }
---

İki trader aynı EUR/USD setup’ına aynı stopla giriyor. Biri stop olduğunda 100 $ kaybediyor, diğeri 400 $. Aynı fikir, aynı grafik, dört kat zarar. Aradaki fark pozisyon büyüklüğü ve kötü bir ayı atlatıp atlatamayacağını girişlerinden çok daha fazla o belirliyor.

Bu rehber, pozisyon büyüklüğünü elle nasıl hesaplayacağını USD pariteleri, JPY pariteleri, çapraz pariteler ve altın için çözümlü örneklerle gösteriyor; gerçek riskini sandığından büyük yapan hataları da anlatıyor.

## Pozisyon büyüklüğü formülü

Her lot hesaplaması aynı üç adımdan oluşur:

1. **Stop olursan ne kadar para kaybedeceğine karar ver.** Genelde hesabın bir yüzdesidir: 10.000 $’ın %1’i 100 $ eder.
2. **Stop mesafesini ölç.** Forex’te pip cinsinden, altın ve endekslerde fiyat cinsinden. Stop, işlem fikrinin yanlış çıktığı yere konur; lot büyüklüğünün hoş göründüğü yere değil.
3. **Parayı stopa böl.**

> **Lot = riske edilen para ÷ (stop mesafesi × 1 lotun pip başına değeri)**

Enstrümandan enstrümana değişen tek şey, 1 lotun pip başına değeri. Bu sayıyı bulduktan sonrası basit bir bölme işlemi.

## Pip değeri: pariteden pariteye değişen sayı

Forex’te 1 standart lot, baz para biriminin 100.000 birimidir. Çoğu paritede 1 pip 0,0001, Japon yeniyle kote edilen paritelerde ise 0,01’dir. Bir pipin dolar cinsinden değeri, paritenin kote edildiği para birimine (ikinci para birimi) bağlıdır.

| Parite türü | Örnek | 1 pip | 1 lotun pip başına değeri (USD hesap) |
|---|---|---|---|
| Kote para birimi USD | EUR/USD, GBP/USD, AUD/USD | 0,0001 | 10,00 $, her zaman |
| Baz para birimi USD | USD/JPY 150’de | 0,01 | 1.000 JPY ÷ 150 = 6,67 $ |
| Baz para birimi USD | USD/CAD 1,38’de | 0,0001 | 10 CAD ÷ 1,38 = 7,25 $ |
| Çapraz parite, kote para birimi yen | GBP/JPY, USD/JPY 150’de | 0,01 | 1.000 JPY ÷ 150 = 6,67 $ |
| Çapraz parite, diğer kote para birimi | EUR/GBP, GBP/USD 1,27’de | 0,0001 | 10 £ × 1,27 = 12,70 $ |
| Altın | XAU/USD, lot başına 100 ons | 0,01 $ | 0,01 $ başına 1 $, 1,00 $’lık harekette 100 $ |

Tablonun arkasındaki kural: 1 lotta 1 pip her zaman kote para biriminin 10 birimidir (yen paritelerinde 1.000). Bunu güncel kurdan hesap para birimine çevirdiğinde pip değerini bulursun. Yukarıdaki kurlar örnektir; hesaplarken günün kurunu kullan.

## Çözümlü örnekler

Tüm örneklerde 10.000 $’lık bir hesap kullanılıyor ve sonuç 0,01 lot adımına **aşağı** yuvarlanıyor; böylece gerçek risk hiçbir zaman limitin üstüne çıkmıyor.

### 1. EUR/USD, %1 risk, 25 pip stop

- Riske edilen para: %1 × 10.000 $ = **100 $**
- Lot başına pip değeri: **10 $**
- Lot = 100 $ ÷ (25 × 10 $) = **0,40 lot**

Stop olduğunda 25 × 10 $ × 0,40 = 100 $ kaybedersin. Tam plandaki gibi.

### 2. USD/JPY 150’de, %1 risk, 20 pip stop

- Riske edilen para: **100 $**
- Lot başına pip değeri: 1.000 JPY ÷ 150 = **6,67 $**
- Lot = 100 $ ÷ (20 × 6,67 $) = **0,75 lot**

Riskteki para yine 100 $, stop 1. örnektekinden daha kısa, buna rağmen pozisyon daha büyük: bu paritede pip daha az değerli.

### 3. GBP/JPY, %1 risk, 30 pip stop

- Kote para birimi yen, yani pip değeri USD/JPY ile aynı: USD/JPY 150 kurunda **6,67 $**
- Lot = 100 $ ÷ (30 × 6,67 $) = **0,50 lot**

### 4. EUR/GBP, %1 risk, 20 pip stop

- Kote para birimi sterlin: 1 lotta 1 pip 10 £. GBP/USD 1,27’de bu **12,70 $** eder
- Lot = 100 $ ÷ (20 × 12,70 $) = 0,3937, aşağı yuvarlanınca **0,39 lot**
- Stop olduğunda gerçek risk: 20 × 12,70 $ × 0,39 = **99,06 $**

### 5. Altın, %1 risk, stop 4,00 $ uzakta

- 1 lot XAU/USD genelde 100 onstur, yani 1,00 $’lık hareket **lot başına 100 $** eder
- Lot = 100 $ ÷ (4,00 $ × 100 $) = **0,25 lot**

Bazı brokerlar altın, endeks ve kripto CFD’lerinde farklı kontrat büyüklüğü kullanır. Herhangi bir formüle (bu formül de dahil) güvenmeden önce platformundaki kontrat spesifikasyonuna bak.

## Aynı risk, farklı stoplar

Daha geniş stop, daha büyük zarar demek değildir. Daha küçük pozisyon demektir. EUR/USD’de 100 $ riskle:

| Stop | Lot | Stop olunca zarar |
|---|---|---|
| 10 pip | 1,00 | 100 $ |
| 20 pip | 0,50 | 100 $ |
| 40 pip | 0,25 | 100 $ |
| 80 pip | 0,12 | 96 $ |

Pozisyon büyüklüğü hesaplamanın bütün amacı bu: stop grafikten, büyüklük stoptan gelir ve zarar her işlemde aynı kalır. [Win rate](/glossary/win-rate) (kazanma oranı) ve [risk-ödül oranı](/glossary/risk-reward-ratio) değerlerini anlamlı kılan da bu tutarlılıktır, çünkü her −1R zarar aynı miktarda paraya denk gelir.

## İşlem başına ne kadar risk almalısın?

Tek bir doğru sayı yok, ama denge hep aynı: risk ne kadar yüksekse, dayanabileceğin kayıp serisi o kadar kısa olur.

| Art arda kayıp | %0,5 risk | %1 risk | %2 risk | %5 risk |
|---|---|---|---|---|
| 5 | −%2,5 | −%4,9 | −%9,6 | −%22,6 |
| 10 | −%4,9 | −%9,6 | −%18,3 | −%40,1 |

Birkaç yüz işlem yaptığında, işlemlerinin %40 ila %50’sini kazanan bir strateji için 8 ila 10 işlemlik kayıp serileri normaldir. Pek çok trader işlem başına %0,5 ile %1 arasında karar kılar; %5 günlük kayıp limiti ve %10 maksimum drawdown olan bir prop firma challenge’ında %0,5 sana en fazla alanı bırakır. [Risk of ruin (iflas riski) hesaplayıcımız](/tools/risk-of-ruin-calculator), herhangi bir risk seviyesinin drawdown limitine takılma ihtimalini nasıl etkilediğini gösterir.

## Gerçek riskini ikiye katlayan beş pozisyon büyüklüğü hatası

1. **Sabit lotla işlem yapmak.** 15 pip stopla 0,50 lot ve 60 pip stopla 0,50 lot, biri 75 $, diğeri 300 $ risk demektir. Günlüğün de sana “rastgele” görünen ama aslında pozisyon büyüklüğünden kaynaklanan gürültüden ibaret sonuçlar gösterir.
2. **Yukarı yuvarlamak.** 0,437 lotu 0,44’e yuvarlamak, her işlemde plandan biraz fazla risk almak demektir. Aşağı yuvarla.
3. **Maliyetleri yok saymak.** Spread ve komisyon stopun üstüne ödenir. Lot başına 7 $’lık gidiş-dönüş komisyon, 0,40 lotluk bir işleme 2,80 $ ekler: planlanan 100 $’a göre neredeyse %3 fazla.
4. **Pozisyonu hesapladıktan sonra stopu kaydırmak.** Girişten sonra 25 pip stopu 40 pipe genişletirsen 100 $’lık risk 160 $ olur. Fikir daha geniş bir stop gerektiriyorsa, girmeden önce büyüklüğü yeniden hesapla.
5. **Zarardaki işleme ekleme yapmak.** Maliyet düşürmek (averaging down), planlanan 1R’lik zararı 2R ya da 3R’ye çevirir. Planında kademeli giriş yoksa, bu işlemin parçası değildir.

## Pozisyon büyüklüğünü günlükte kontrol et

Hesaplama on saniye sürer; zor olan, 200 işlem boyunca ona sadık kalmak. İşlem günlüğü tam burada işe yarar. −1R’nin çok altında kapanan her zarar bir pozisyon büyüklüğü ya da stop sorunudur ve işlemlerin tek bir yerde olduğunda bunları fark etmek kolaydır. [Wawe Journal’da](/) ortalama kazancın, ortalama zararın ve [maksimum drawdown](/glossary/max-drawdown) değerin, kaydettiğin ya da senkronize ettiğin her işlemden hesaplanır; [AI koç](/ai-trading-coach) da stopsuz işlemleri ve −1R’yi aşan zararları, sana neye mal olduklarıyla birlikte listeleyebilir.

## Önemli çıkarımlar

- Lot = riske edilen para ÷ (stop mesafesi × 1 lotun pip değeri). Önce parayı belirle.
- 1 lotta 1 pip, kote para biriminin 10 birimidir (yen paritelerinde 1.000); bunu günün kurundan hesap para birimine çevir.
- Daha geniş stop daha küçük pozisyon demektir, daha büyük zarar değil. Aşağı yuvarla, asla yukarı değil.
- Spread, komisyon ve kaydırılan stoplar gerçek zararı plandan büyük yapar. Bunları günlüğünde kontrol et.
