# Devam notları: 2026-11-22

21-22 Kasım gecesi Windows bilgisayarda yapılanlar. Bir önceki not: `docs/2026-11-16-DEVAM-NOTLARI.md`.

## Canlıda olanlar

- **MetaTrader 4 otomatik senkron** (ayrıntı ve gerçek MT4 test tablosu: `docs/2026-11-21-MT4.md`). `mt5-bridge` iki kez
  deploy edildi (platform alanı; sunucu adında "demo" geçen hesap demo sayılır). Veritabanı değişmedi.
- **Defterler sayfası:** sıkı kartlar (tek satır başlık, broker yoksa "Broker bağla" satırı); üst çubuktaki hızlı defter
  menüsünde bağlı brokerın küçük logosu (cTrader / MT4 / MT5).
- **Backtest açılış hızı:** cTrader hesabında içinde bulunulan ay da tarayıcıya (IndexedDB) kaydediliyor; aynı gün anında,
  ertesi gün kayıtlı veriyle anında açılıp yeni günler arka planda ekleniyor. Yayından sonraki ilk açılış bir kez indirir.
- README ve `PROJECT_OVERVIEW.md` uygulamanın bugünkü haline göre güncellendi.

## Yarın bakılacaklar

- [ ] **AI koç token azaltma** (konuşuldu, kod yok). Ölçüm: her mesajda ~12-15 bin token (bilgi tabanı ~5.400, kullanıcı
      özeti ~5.000-5.700, sohbet geçmişi 20 mesaj → uzun sohbette 25 bin+). Sıra: (0) her mesajda gönderilen / önbellekten
      okunan / üretilen token sayısını logla; (1) prompt'ta sabit kısmı (kurallar + bilgi tabanı) başa al ki Gemini önbelleği
      tutsun, koç kişiliği ve para birimi sonra; (3) geçmiş 20 → 8-10 mesaj, eski mesajlarda düşünme adımları yerine metin;
      (2) veri özetini tablo biçimine sıkıştır (%35-45); (4) bilgi tabanını konuya göre gönder. Deploy öncesi onay.
- [ ] **Koça eklenecekler** (öneri, karar bekliyor): kapanan işleme 10 sn değerlendirme (plana uydun mu / ne hissettin;
      model çağrısı yok, önerilen ilk iş), işleme girmeden önce "girebilir miyim?" kartı, işlemi grafikte gösterme, kalıcı
      koç hafızası, backtest-canlı karşılaştırması, kullanıcılara telefon bildirimi, sesli cevap.
- [ ] Çalışma klasöründe benim yapmadığım `quick-add` değişiklikleri vardı (`quick-add.css`, `quick-add.js`,
      `quick-modal-i18n.js`); commit edilmedi. Kimin olduğuna bakılmalı.
- [ ] MT4 test hesabı (Pepperstone-Demo02) ve "meta trader deneme 4" defteri kullanıcının kendi hesabında duruyor.

## Bu bilgisayar (Windows)

- Yerel dal artık `master` (eski `perf/tonight` geride; yalnızca satır sonu farkı olan bir stash'i var).
- Pepperstone MT4 kurulu: `C:\Program Files (x86)\Pepperstone MetaTrader 4`. `.mq4` derlemek için onun `metaeditor.exe`'si
  (`/compile:` ile, geçici bir kopyadan). MT5'in MetaEditor'ü `.mq4` derlemiyor.
- Backtest duman testleri bu bilgisayarda çalışıyor: puppeteer-core geçici klasörde, `CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe"`.
- Bu bilgisayardaki `node_modules`'te hâlâ Astro 4.16.19 kurulu; `package.json`/lockfile Astro 7.4.12 diyor (`c7dcc30`).
  Bir sonraki çalışmadan önce `npm install`.
- Sitedeki bazı metinler MetaTrader için hâlâ "yakında" diyor (`support.astro`, `integrations/index.astro`,
  `integrations/metatrader.astro`, `vs/[slug].astro`); MT4/MT5 artık canlı, güncellenmeli.
- Windows'ta 3 test hep düşüyor (ortamdan): bundle.js CRLF, navbar "N" kısayolu, ambient katalog (Windows yolu ESM'de).
