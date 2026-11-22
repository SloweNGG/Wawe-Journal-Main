# 22 Kasım 2026: bugün yapılanlar

Ayrıntılı devam notları: `docs/2026-11-22-DEVAM-NOTLARI.md`. MT4 ayrıntıları: `docs/2026-11-21-MT4.md`.

## Gece (21-22 Kasım)

- **MetaTrader 4 otomatik senkron canlıya çıktı** (`e0167d4`, `1abad7e`, `babf97d`). WaweSync.ex4, MT5 bridge'i
  (`mt5-bridge`) kullanıyor. Demo hesapların canlı görünmesi ve onay işaretinin "?" olarak çıkması düzeltildi (EA 1.01).
  Gerçek MT4 hesabıyla test edildi. Veritabanı değişmedi.
- **Defterler sayfası** (`65ca7f6`): daha sıkı hesap kartları; hesap değiştiricide bağlı brokerın logosu
  (cTrader / MT4 / MT5).
- **Backtest açılış hızı** (`5f9764e`): cTrader hesabında içinde bulunulan ay da tarayıcıya kaydediliyor, hesap hemen açılıyor.
- **Belgeler** (`19593eb`): README ve `PROJECT_OVERVIEW.md` uygulamanın bugünkü haline göre güncellendi.

## Gündüz

- **Blog** (`a1dc078`): 9 yazının hepsinin Türkçe ve Almanca sürümü eklendi.
- **AI koç token azaltma**, adım 0 ve adım 1 canlıda (ai-coach deploy edildi):
  - `5c6544f`: her cevapta token sayıları ve prompt parçalarının boyutları loglanıyor (`ai-coach tokens` satırı).
  - `e957ffc`: koçun Gemini isteğini çevrimdışı ölçen araç (`scripts/coach-prompt/measure.ts`).
  - `38af47b` + `eec4f57`: modele sıkıştırılmış veri gidiyor, değişen değerler son mesajda `[App context]` satırında,
    sohbet geçmişi 20-25 mesajlık kayan pencere. İnceleme düzeltmeleri yapıldı.
  - Demo ölçüm: yeni sohbet ~17.200 → ~14.800 token.
  - Geri dönüş yedeği: `C:/Users/kadir/WaweJournal-Backups/2026-11-22-pre-token-cuts`.
  - `96ab8c6`: notlar güncellendi.

## Akşam: site metinleri (bu commit ile gönderildi)

- **MetaTrader artık sitede "canlı" olarak geçiyor**, "yakında" ifadeleri kaldırıldı: ana sayfa, fiyatlandırma, destek,
  entegrasyonlar, MetaTrader entegrasyon sayfası, karşılaştırma (`vs/`) sayfaları, `llms.txt`. Ana sayfa (TR/DE/EN)
  çevirileri de buna göre güncellendi.
- **MetaTrader entegrasyon sayfası**: WaweSync kurulumu için 4 adımlık yeni bölüm (EA'yı ekle → web adresine izin ver →
  grafiğe sürükle → 6 haneli kodu gir). Dosya içe aktarma alternatif olarak kaldı. SSS cevapları yenilendi.
- **Logolar**: ana sayfadaki platform şeridine ve entegrasyonlar sayfasındaki her platform kartına logo eklendi.
- **Risk bildirimi** (alt bilgi) artık Türkçe ve Almanca'ya da çevriliyor.
- Uzun TR/DE başlıklar satırlara dengeli bölünüyor; Almanca'da tireleme. Bir blog yazısının TR CTA başlığı
  "Öğrendiğini uygula." oldu.

## Ayrı dalda gönderildi (canlıya çıkmadı)

- **Hızlı işlem ekleme penceresi yeniden tasarımı** (`quick-add.css`, `quick-add.js`, `quick-modal-i18n.js`) →
  `wip/quick-add-redesign` dalı. Sekmeler başlığa taşındı, notlar tam genişlik şeride alındı, erişilebilirlik
  (`label for`, `type="button"`) eklendi. Çeviri dosyasındaki yeni "borsa/piyasa" anahtarları henüz kodda kullanılmıyor,
  yani iş yarım. Site `master`'dan otomatik canlıya çıktığı için bu değişiklik `master`'a konmadı; denenip
  tamamlandıktan sonra birleştirilmeli.

## Sıradaki işler

- [ ] AI koç: canlı loglardan gerçek token sayılarına bak; kalite testinden sonra tablo sıkıştırma ve bilgi tabanını
      konuya göre gönderme.
- [ ] `wip/quick-add-redesign` dalını tarayıcıda dene, borsa seçicisini bitir, sonra `master`'a birleştir.
- [ ] Tradovate: CrossTrade ortaklık başvurusu yapıldı, cevap bekleniyor; sıradaki NinjaTrader Connect.
- [ ] Bu bilgisayarda bir sonraki çalışmadan önce `npm install` (node_modules'te eski Astro 4 var).
