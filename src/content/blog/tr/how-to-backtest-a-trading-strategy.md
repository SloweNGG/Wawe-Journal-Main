---
slug: strateji-backtest-nasil-yapilir
title: "Bir Trading Stratejisi Manuel Olarak Nasıl Backtest Edilir? Adım Adım"
seoTitle: "Strateji Backtest Nasıl Yapılır? Manuel, Adım Adım"
description: "Adım adım manuel backtest rehberi: test edilebilir kurallar, veri seçimi, örneklem büyüklüğü, sahte avantaj yaratan yanılgılar ve sonuçları doğru okumak."
date: "2026-11-18"
summary: "Test edilebilir kurallar yaz, doğru veriyi seç, sahte avantaj yaratan yanılgılardan kaçın ve sonuçları doğru metriklerle oku."
cta: { href: "/backtesting", label: "Mum mum backtest replay’i dene" }
---

Backtest, para riske etmeden önce tek bir soruya cevap verir: *Bu strateji, tam olarak kurallarına göre işlem yapıldığında geçmiş veride bir avantaj sağladı mı?* Özensiz yapılırsa bambaşka bir soruya cevap verir: *Ne olduğunu zaten bildiğime göre, işe yarayacak işlemler bulabilir miyim?* Bu durumda sonuç, canlıda göreceğin her şeyden çok daha iyi görünür.

Bu rehber manuel backtest’i anlatıyor; yani grafikleri mum mum yeniden oynatarak yaptığın türü. Setup’ları kodlanması zor olduğu için diskresyoner trader’ların çoğu bu yöntemi kullanır.

## Manuel mi, otomatik backtest mi?

| | Manuel (replay) | Otomatik (kod) |
|---|---|---|
| En uygun olduğu durum | Diskresyoner setup’lar, price action, çoklu zaman dilimi okumaları | Tamamen mekanik kurallar |
| Hız | Birkaç oturumda 50–200 işlem | Saniyeler içinde binlerce işlem |
| Ana risk | Geriye dönük bakış ve tutarsız kararlar | Curve fitting ve kodlama hataları |
| Yan fayda | Gözünü ve uygulamanı eğitir | Uygulama açısından yok |

Stratejin yoruma ihtiyaç duyuyorsa, onu test etmenin dürüst yolu manuel replay’dir. Aynı zamanda pratik yerine de geçer: Bir setup’la gerçek parayla işlem yapmadan önce onu yüz kez prova edersin.

## 1. Adım: Test edilebilir kurallar yaz

Belirsiz kurallar, umduğun sonuç neyse onu üretir. Grafiği açmadan önce şunları yaz:

- **Piyasa ve zaman dilimi:** örneğin EURUSD, H4 trendiyle H1 girişler.
- **Setup koşulları:** grafikte neyin olması gerektiği, başka birine anlatabileceğin şekilde.
- **Giriş tetikleyicisi:** tam olarak hangi mum ya da seviye.
- **Stop loss:** nereye ve neden oraya.
- **Take profit ya da çıkış kuralı:** sabit hedef, trailing stop ya da bir koşul.
- **Pozisyon büyüklüğü:** işlem başına sabit bir risk, örneğin %1 (1R).
- **Filtreler:** işlem yaptığın seanslar, kaçındığın haberler, günlük maksimum işlem sayısı.

İki kişi senin kurallarınla farklı işlemler açıyorsa, kuralların henüz bitmemiştir.

## 2. Adım: Veriyi ve dönemi seç

- **Sonuç çıkarmak için gerçek piyasa verisi kullan.** Sentetik ya da rastgele veri, araçları kullanmayı öğrenmek ve uygulama pratiği yapmak için faydalıdır, ama asla bir avantajı kanıtlayamaz.
- **Farklı piyasa koşullarını kapsa.** Trendli ayları, yatay ayları ve volatil haber dönemlerini dahil et. Sadece güçlü bir trendde test edilen strateji, sana yalnızca güçlü trendlerde nasıl performans gösterdiğini söyler.
- **Rastgele bir tarihten başla.** Doğrudan hatırladığın bir döneme atlamak, daha ilk işlemden önce yanlılık yaratır.
- **Maliyetleri dahil et.** Gerçekçi bir spread ve komisyon belirle. Düşük zaman dilimlerinde küçük hedefli stratejiler genellikle bütün avantajlarını maliyetlere kaptırır.

## 3. Adım: Mum mum yeniden oynat

Geleceği gizle. Her seferinde bir mum ilerle ve her kararı yalnızca ekranda olanla ver. İlerlemeden önce işlemi stopu ve hedefiyle birlikte aç, sonra replay’i işlem kapanana kadar çalıştır. Yazılı kuralların söylemedikçe stopu kaydırma.

Gizlice ileriye bakma, «belli olan» kayıpları atlama ya da fiyatın nereye gittiğini görebildiğin için hedefi değiştirme isteği, manuel testteki sahte sonuçların en büyük kaynağıdır.

## 4. Adım: Her işlemi aynı şekilde kaydet

Her backtest işlemini canlı bir günlükteki alanlarla kaydet: tarih, setup, giriş, stop, hedef, çıkış, [R](/glossary/r-multiple) cinsinden sonuç ve işlemin kurallara tam olarak uyup uymadığı. Şüpheli işlemleri silmek yerine not al; bunlar kurallarının ne kadar net olduğu hakkında bilgi verir. Bir [işlem günlüğü şablonu](/tr/blog/islem-gunlugu-nasil-tutulur) backtest’ler için de işe yarar.

## 5. Adım: Yeterli sayıda işlem topla

Küçük örneklemler yalan söyler. 20 işlemde, üç şanslı kazanç zarar eden bir stratejiyi harika gösterebilir. Kabaca bir rehber olarak:

- **30 işlem:** bariz sorunları fark etmeye yeter.
- **100 işlem:** avantaj hakkında ilk görüş için minimum.
- **200+ işlem**, farklı piyasa koşullarında: güvenmeye başlayabileceğin bir şey.

## 6. Adım: Sahte avantaj yaratan yanılgılardan kaçın

- **Geriye dönük bakış yanılgısı (hindsight bias):** grafik ancak sonradan bariz göründüğü halde, «ben bunu görürdüm» diyerek işlem açmak.
- **Cherry-picking (işine geleni seçmek):** yalnızca setup’ın ders kitabındaki gibi olduğu dönemleri ya da örnekleri test etmek.
- **Curve fitting:** geçmiş sonuçlar kusursuz görünene kadar kuralları kurcalamak. Sadece geçmişteki kayıpları elemek için eklenen her ek koşul, canlı sonuçları kötüleştirir.
- **Hafızadaki hayatta kalma yanılgısı:** temiz kazançları hatırlayıp atladığın karışık işlemleri unutmak.

## 7. Adım: Sonuçları doğru metriklerle oku

Bunlara asla tek tek değil, birlikte bak:

| Metrik | Sana ne söyler |
|---|---|
| [Expectancy](/glossary/expectancy) (beklenen değer) | İşlem başına ortalama sonuç, R cinsinden. Maliyetler sonrası sıfırın üzerinde olmalı |
| [Profit factor](/glossary/profit-factor) | Brüt kâr ÷ brüt zarar. 1,5 veya üzeri sağlam bir avantajdır |
| [Win rate](/glossary/win-rate) (kazanma oranı) ve [payoff oranı](/glossary/payoff-ratio) | Avantajın nasıl oluştuğu: çok sayıda küçük kazanç mı, az sayıda büyük kazanç mı |
| [Maksimum drawdown](/glossary/max-drawdown) ve en uzun kayıp serisi | Buna katlanıp katlanamayacağın ve bir prop firmanın limitlerine uyup uymadığı |
| Seans ve haftanın gününe göre sonuçlar | Avantajın gerçekte nereden geldiği |

Sonra canlı sonuçların daha kötü olmasını bekle. Uygulama, duygular ve slippage’ın bir bedeli vardır. +0,4R’lik bir backtest expectancy’si canlıda çoğu zaman +0,2R’ye düşer; +0,05R’lik bir backtest ise genellikle negatife döner.

## 8. Adım: Büyük işlem yapmadan önce forward test yap

Pozitif bir backtest’ten sonra stratejiyi birkaç hafta demo hesapta ya da küçük büyüklükle işle ve rakamları karşılaştır. Forward test sonuçları backtest’le kabaca uyumlu kalırsa, pozisyon büyüklüğünü kademeli olarak artır.

## Wawe Journal’da backtest

[Wawe Journal’daki backtest replay](/backtesting) tam olarak bu süreç için tasarlandı. Bir sembol, M1’den D1’e kadar bir zaman dilimi ve bir başlangıç tarihi seçersin; sonra mum mum ilerlersin ya da saniyede 10 muma kadar hızda oynatırsın. Çizim araçları ve çoklu grafik düzenleri de var. Emirler lot büyüklüğü, stop loss ve take profit taşır; spread ve komisyon uygulanır. Sentetik veri pratik için hazır; bir önceki güne kadar gerçek mumları oynatmak için cTrader’ı bağla ve bu backtest işlemlerini bir günlüğe bağla. Expectancy, profit factor ve drawdown orada senin için hesaplanır. Ücretsiz plan bir backtest hesabı içerir.

## Önemli çıkarımlar

- Kurallarını, iki kişinin aynı işlemleri açacağı kadar net yaz.
- Farklı piyasa koşullarını kapsayan gerçek veriyi, gerçekçi maliyetlerle kullan.
- Gizlice ileriye bakmadan mum mum oynat ve her işlemi kaydet.
- Expectancy, profit factor ve drawdown’a birlikte bakarak 100 veya daha fazla işlem üzerinden karar ver.
- Canlıya geçmeden önce forward test yap ve canlı sonuçların daha zayıf olmasını bekle.
