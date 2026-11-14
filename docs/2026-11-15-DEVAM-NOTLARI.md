# Devam notları: 2026-11-15

Bu dosya, başka bir bilgisayarda (ve oradaki Claude oturumunda) kaldığımız yerden devam etmek için yazıldı.
Diğer bilgisayardaki Claude'un bu Mac'teki notlarına erişimi yok, gereken bağlam aşağıda.

## Şu anki durum

AI koç paketinin tamamı 2026-11-15'te canlıya çıktı:

- `master` GitHub'a gönderildi (773/773 test geçti); Cloudflare Pages siteyi güncelledi.
- Canlı veritabanına `202611140001_coach_settings` migration'ı uygulandı ve doğrulandı (UTC + İstanbul).
- Edge Function'lar deploy edildi: `ai-coach` v6, `mt5-bridge` v4, `ctrader-sync` v18.
- Böylece canlıda: koç uyarıları (yeni işlemden sonra), trading planı + disiplin skoru, haftalık değerlendirme + haftalık hedef, duygu etiketleri + not dikte, backtest'ten canlıya geçiş hazırlığı.

Geri dönüş gerekirse: `supabase/rollbacks/202611140001_coach_settings.down.sql`. Eski fonksiyon sürümlerinin ve şemanın yedeği ilk Mac'te, `~/WaweJournal-Backups/` altında.

## Açık konu: "Proje hâlâ yetersiz geliyor"

En son buradaydık. Bu his büyük ihtimalle eksik özellikten değil, var olanın derinliğinden ve cilasından geliyor.
Son haftalarda çok şey eklendi (AI koç, MT5/cTrader senkronu, backtest, prop hesapları, ödeme). Zayıf noktalar:

1. **AI koçun cevap kalitesi.** Google Gemini'nin ücretsiz katmanındayız. Testlerde iyi modeller
   (`gemini-3.8-flash`, `gemini-3.6-flash`) neredeyse hep 503 "yoğunluk" hatası verdi; cevaplar en zayıf modelden
   (`gemini-3.5-flash-lite`) geldi, bir kez Türkçe cevaba Arapça bir kelime karıştı. Ürünün en etkileyici kısmı şu an
   en kırılgan kısmı. Ücretli bir modele geçiş daha önce "ücretsiz değil" diye ertelenmişti.
2. **Veri derinliği.** Canlıdaki hiçbir işlemde gerçek açılış saati yok (manuel formda saat alanı yok; `ctrader-sync`
   açılış ve kapanışı aynı zamana yazıyor; MT5 EA MFE/MAE göndermiyor). Bu yüzden MFE/MAE, işlemde kalma süresi ve
   seans analizi gösterilemiyor. Önce bunlardan biri gerekli: cTrader senkronunda açılış zamanı, EA'dan MFE/MAE ya da
   manuel formda saat alanı.
3. **Ödeme.** Creem kartla ödeme 2026-10-29'dan beri açık ama gerçek bir kartla hiç denenmedi.
4. **İlk izlenim.** Yeni bir kullanıcının ilk 5 dakikası (boş hesap, ilk işlem, "aha" anı) hiç uçtan uca yeni gözle
   denenmedi.

### Önerilen ilk adım

Siteyi (wawejournal.com) yeni bir kullanıcı gibi baştan sona gezmek, ekran görüntüleriyle öncelik sıralı bir liste
çıkarmak: rakiplere göre zayıf, kafa karıştırıcı ya da boş kalan yerler. Sonra en çok etki edecek 2-3 şeyi seçip yapmak.

### Cevaplanacak soru

Yetersizlik hissi nereden geliyor?

- Görünüş / his (tasarım, akıcılık)
- Özellik ("Tradezella'da, Edgewonk'ta var, bizde yok")
- AI koç (cevaplar sığ ya da güvenilmez)
- Kullanıcı / gelir (gelmiyor, kalmıyor, ödemiyor)

Ya da doğrudan "gez bak" denip incelemeyle başlanabilir.

## Diğer ertelenmiş konular

- **AI koç günlük limitleri** geçici: `system_settings.ai_limits` = ücretsiz 5, premium 50 mesaj/gün (UTC). "Sonra konuşuruz" denmişti.
- **Gizlilik metni** (`src/pages/privacy.astro`, bölüm 5) tamam: ücretsiz Gemini'de Google'ın veriyi kullanabileceği ve
  dikte sesinin tarayıcının servisine (Chrome/Edge: Google, Safari: Apple) gittiği yazıyor. Ücretli bir modele ya da başka bir
  sağlayıcıya geçilirse bu bölüm güncellenmeli.

## Diğer bilgisayarda çalışırken bilinmesi gerekenler

- **`master` = canlı.** Push edilen her şey 1-2 dakikada Cloudflare Pages ile wawejournal.com'a çıkar. `main` eski, kullanılmıyor.
  Bir kez Cloudflare webhook'u tetiklenmemişti: push'tan sonra Pages panelinde deploy'un başladığına bak.
- **Edge Function'lar push ile deploy olmaz.** Ayrıca `npx supabase functions deploy <ad> --use-api` ile deploy edilir.
  `mt5-bridge`, `ctrader-sync`, `create-payment`, `creem-*` için `--no-verify-jwt` gerekir (JWT doğrulaması kapalı çalışırlar).
  Deploy'dan önce canlıdaki fonksiyon kodunu yedekle ve repodakiyle aynı olduğunu kontrol et.
- **Migration'lar elle uygulanır** (`psql -v ON_ERROR_STOP=1 -f ...`), öncesinde yedek alınır. Her migration için
  `supabase/tests/*_verify.sql` (kendini geri alan doğrulama) ve `supabase/rollbacks/` var.
- **Bağlantı bilgileri** (veritabanı adresi, Supabase erişim anahtarı) ilk Mac'teki yerel env dosyalarında; repoda yok.
  Diğer bilgisayarda canlıya dokunmak gerekirse bunları güvenli bir yoldan oraya taşıman gerekir.
- **Testler:** `npm test` (Node'un yerleşik test çalıştırıcısı, `tests/*.test.js`).
- **Byte-identical kopyalar:** `public/src/utils/prop-calculator.js` ve `prop-montecarlo.js`'in `supabase/functions/_shared/`
  altında birebir kopyaları var, bir test eşitliği zorunlu tutuyor. Birini değiştirirsen ikisini de değiştir ve `ai-coach`'u yeniden deploy et.
- **Önbellek:** Statik dosya değişikliklerinde `?v=` numaralarını ve service worker önbellek sürümünü artırmayı unutma.
