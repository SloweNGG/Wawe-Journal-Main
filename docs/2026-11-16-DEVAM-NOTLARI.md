# Devam notları: 2026-11-16

Windows bilgisayarda 15-16 Kasım gecesi yapılanlar. Diğer bilgisayarda (ve oradaki Claude oturumunda) kaldığımız yerden
devam etmek için yazıldı. Bir önceki not: `docs/2026-11-15-DEVAM-NOTLARI.md`.

## Canlıda olanlar

- `master` GitHub'a gönderildi; Cloudflare Pages siteyi güncelliyor (1-5 dakika).
- `ai-coach` Edge Function **v7** deploy edildi (Windows'tan; bu makinede Supabase CLI giriş yapılı). Deploy'dan önce canlıdaki
  v6'nın kodu indirildi ve `master`'daki (d0468e9) kodla dosya dosya aynı olduğu doğrulandı.
  - **Geri dönüş:** v6'nın kodu = d0468e9 commit'indeki `supabase/functions/ai-coach` + `_shared`. Geri almak için o commit'i ayrı bir
    klasöre çıkarıp (`git worktree add ../wj-v6 d0468e9`) oradan `npx supabase functions deploy ai-coach --project-ref odasapyhtdopbnlfhwde --use-api`.
  - Deploy sonrası anon anahtarla deneme: fonksiyon açılıyor, kendi kodundan `UNAUTHORIZED` dönüyor (açılışta hata yok).
    Giriş yapmış gerçek bir kullanıcıyla henüz denenmedi.

## Bu oturumda yapılanlar (AI koç)

1. **Koçun adı Anna → Kai.** Bildirim başlıkları artık `{coach}: ...` (seçili koçun adı). Türkçe ek sorunu olan cümlelerde ad
   yerine "koç paneli" yazıyor ("Kai'de" / "Rex'te" farkı).
2. **Sorununa göre koç** (`supabase/functions/_shared/coach-personas.ts`): "Seni en çok ne zorluyor?"
   - Mira: psikoloji (korku, FOMO, intikam işlemi, tilt) · Rex: açgözlülük / overtrade · Atlas: disiplin · Nova: risk · Kai: genel, varsayılan.
   - Overtrade her koçta tek cümlelik yan not, Rex'te ana konu. Üslup: Yumuşak / Dengeli / Sert (her koçun kendi varsayılanı).
     Sert = davranışı eleştirir, kişiyi değil; hakaret, alay, küfür yok.
   - Veriye dayanma ve dürüstlük kuralları hepsinde aynı; sadece odak ve üslup değişiyor. Herkese açık (Premium şartı yok).
   - Seçim `coach_settings.plan.coach = { id, tone }` içinde (migration yok) ve her mesajla da gönderiliyor.
   - "Verilerine göre önerim": en güçlü bulguya (`insights.ts`) göre koç önerisi; model çağrısı yok, mesaj hakkı harcamıyor.
3. **Kurulum sihirbazı 6. adım:** tek koçluk kaydırmalı ekran (parmakla kaydırma, oklar, noktalar, klavye okları). Ekranda duran
   koç seçili sayılıyor, buton "Rex ile başla" diyor. Seçim panele iletiliyor; panel bir daha sormuyor (`ww_ai_coach_asked`).
   Sihirbazı yeniden açmak için konsolda `window.startOnboardingWizard()` (sonunda "başla"ya basmak mevcut defteri yeniden adlandırır).
   **`window.resetOnboarding()` kullanma: tüm işlemleri ve stratejileri siliyor.**
4. **Avatarlar:** her koç kendi renginde, parlak, göz kırpan bir küre (yalnız CSS, `.wwc-av` in `ai-coach.css`). Çizim yüzler ve
   WebGL halka küreler denendi, beğenilmedi.
5. **Sesle yazmada küre:** konuşurken sesine tepki veren WebGL küre, ortasında koçun avatarı (`public/components/ai-coach/voice-orb.js`,
   ilk dikte anında yüklenir, bağımlılık yok). Mikrofondan sadece ses seviyesi okunur, kayıt yok.
6. **Cevaplar kelime kelime akıyor:** gelen metin tampona alınıyor, ekrana saniyede ~32 kelime (birikme olursa daha hızlı) akıyor.
   Hız: `ai-coach.js` içinde `TYPE_WPS`, `TYPE_CATCH_UP`.
7. **Cevap hızı** (`supabase/functions/_shared/model-chain.ts`): meşgul/sessiz Gemini modeli 10 dakika sona atılıyor; ilk kelime
   için 8 sn bekleme (turun son modeli ve yakın zamanda cevap vermiş model için 20 sn). Simülasyon: iyi modeller sessizken ilk mesaj
   42,5 sn → 18,5 sn, sonrakiler 2,5 sn. Her cevapta `ai-coach timing` log satırı (içerik yok).
8. **Para birimi:** koç tutarları uygulamada seçili sembolle yazıyor (`$ € £ ₺ ₿`); panel sembolü gönderiyor, yoksa
   `user_profiles.preferred_currency`, o da yoksa `$`. Eskiden dolar hesabında "TL" yazıyordu.

Ayrıca: Ayarlar → Görünüm kaydırıcılarında dolu çubuk (15 Kasım 04:09'dan kalan, bu oturumda commit edildi).

## Yapılacaklar / bakılacaklar

- [ ] **Canlıda dene:** koçu aç → seçim ekranı, bir soru sor → kelime kelime akış, tutarlar `$` ile mi, Rex/Atlas "Sert" üslubu
      Türkçede kaba duruyor mu. Telefonda kurulum 6. adımı.
- [ ] **Süre logları:** Supabase → Edge Functions → ai-coach → Logs → `ai-coach timing`. `ctx_ms` yüksekse sıradaki iş: sohbet
      içinde defter özetini önbelleğe almak (her soruda 3.000 işlem + 5.000 backtest işlemi baştan okunuyor). `first_word_ms`
      yüksekse ücretli Gemini katmanı (geçilirse gizlilik metni bölüm 5 güncellenmeli).
- [ ] **Telefon bildirimleri (admin Web Push):** kod `master`'da, admin panelinde "Telefon Bildirimleri" sekmesi görünüyor ama
      sunucu tarafı aşağıdaki adımlar yapılana kadar çalışmaz. Durum için aşağıdaki bölüme bak.
- [ ] Windows'ta 2 test hep düşüyor (satır sonu / CRLF): `public/src/bundle.js` esbuild eşitliği ve navbar "N" kısayolu testi.
      Kod değişikliğinden değil; Mac'te geçmeleri gerekir.

## Telefon bildirimleri (admin Web Push) deploy adımları

Sıra önemli; 1 tamam, 2'den itibaren bekliyor (bu not yazılırken):

1. ✅ Kod `master`'da (site).
2. Canlı veritabanının yedeği, hemen ardından `supabase/migrations/202611080001_admin_push_notifications.sql`.
   Migration sadece ekleme yapıyor: 2 yeni tablo (dışarıya kapalı) + yeni üye / hata bildirimi / para çekme tablolarına
   "kayıt eklenince bildir" tetikleyicileri (hata verse de kaydı engellemez). Geri alma: `supabase/rollbacks/202611080001_admin_push_notifications.down.sql`.
   Windows'ta `pg_dump` yok ve proje `link` edilmemiş; yedek Mac'ten (`~/WaweJournal-Backups/`) ya da Supabase panelinden.
3. `node scripts/admin-push-setup.mjs` (VAPID anahtarları → Supabase secrets), sonra
   `npx supabase functions deploy admin-notify --project-ref odasapyhtdopbnlfhwde --use-api --no-verify-jwt`.
4. `creem-webhook` ve `nowpayment-webhook`'u yeniden deploy (`--no-verify-jwt`). Önce canlıdaki kodlarını indirip repodakiyle
   karşılaştır: fark yalnız f453d97'deki bildirim satırları olmalı.
5. Telefonda: Chrome → /admin → Telefon Bildirimleri → aç → test. (Gerçek teslimat hiç uçtan uca görülmedi; ilk gerçek kontrol bu.)

## Bu bilgisayar (Windows) hakkında

- Supabase CLI giriş yapılı: Edge Function deploy'u ve kod indirme buradan çalışıyor. `db query` var ama proje link edilmemiş;
  `pg_dump`, `psql`, Docker yok, canlı veritabanı yedeği buradan alınamıyor.
- Deno 2.9.8 kurulu: `deno check supabase/functions/<ad>/index.ts`.
- Testler: `npm test`. Görsel kontrol için Chrome headless + puppeteer-core kullanıldı (geçici klasörde, repoda değil).
