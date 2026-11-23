# 23 Kasım 2026: yapılanlar

22 Kasım akşamından (`22kasım.md` commit'inden sonra) 23 Kasım gece 01:00'e kadar yapılanlar. Birden fazla Claude
oturumu aynı anda çalıştı; hepsi aşağıda. Bir önceki özet: `22kasım.md`.

**Durum:** Hepsi canlıda. Son commit `398550d` (00:58:17), canlı yayın kimliği 00:58:35. Çalışma klasörü temiz,
push edilmemiş commit yok. Gereken Edge Function deploy'u ve veritabanı migration'ı yapıldı (ayrıntılar aşağıda).

---

## Tradovate

### CrossTrade (Tradovate otomatik senkron için aracı)
- CrossTrade'in fiyat cevabı geldi: **ayda $199 sabit + kullanıcı başı günlük $0,75** (bağlantı açık kaldığı her gün,
  kullanılmasa da; kullanıcı başı ~$22,50/ay). Yalnızca Tradovate destekleniyor, NinjaTrader 8 yok.
- Partner API dokümanı okundu. Öne çıkanlar:
  - Salt okunur izin (`tv:read`) mümkün; kullanıcı CrossTrade sayfasında onay veriyor, şifresi bize gelmiyor.
  - Dolumlarda komisyon, ücret, fiyat, adet, yön, zaman ve sabit kimlik var.
  - **Bağlanmadan önceki geçmiş işlemler gelmiyor**, bağlantının kapalı olduğu gün kalıcı veri boşluğu oluşuyor.
    Bu yüzden kullanıcı başı maliyetten kaçış yok ve CSV içe aktarma şart.
  - Ücretsiz test ortamı simülasyon; işlem verisi test edilemiyor.
- CrossTrade hesabı açıldı (**business@wawejournal.com**, platform: Tradovate, hesap bağlanmadı).
- Kayıt ekranında görüldü: **prop firma hesapları (Lucid, Tradeify, fonlu/PA) Demo ortamından bağlanıyor**. Yani
  kullanıcılarımızı `environments: ["demo"]` ile eklemek prop trader'lar için yeterli.
- Kate'e cevap gönderildi (23 Kasım 00:54): Partner bölümünün açılması, prop hesap teyidi, işlem geçmişinin saklama
  süresi, deneme süresi / sabit ücret indirimi, ülke kısıtı, aylık sözleşme olup olmadığı, logo teklifi.
- **Karar önerisi:** Pro'ya dahil etmek zararına; ayrı ücretli ek paket (~$29/ay) ya da talep oluşunca.
- Tarayıcı eklentisi fikri değerlendirildi (Tradovate web sitesinden işlemleri okumak). Ücretsiz ama kullanım şartları
  riski ve test hesabı sorunu var; şimdilik ertelendi.

### Tradovate CSV içe aktarma (`5a2ae4a`)
- İki dışa aktarma tanınıyor: **Performance raporu** (önerilen) ve **Orders** dosyası.
- Performance: aynı dolumu paylaşan, aynı yöndeki satırlar (kademeli giriş/çıkış) tek işlemde birleşiyor; K/Z
  Tradovate'in kendi değeri.
- Orders: hesap + kontrat bazında pozisyon sıfırlanana kadar tek işlem; yön değiştiren dolum bölünüyor; dolmamış
  emirler atlanıyor; dosya sonunda açık kalan pozisyon alınmıyor (uyarı); birden fazla hesap uyarısı.
- ABD tarih biçimi (ay/gün), `$(13.75)` zararları, tahvil kesirli fiyatlar (`118'16`).
- Sembol kontrat kökü olarak saklanıyor (MNQZ5 → MNQ), tam kontrat adı notta. 60+ CME kontratı için puan değeri
  (ES 50, MNQ 2, CL 1000…) işleme `multiplier` olarak yazılıyor.
- Komisyon bu dosyalarda yok: K/Z komisyon hariç (kullanıcıya not gösteriliyor).
- **Henüz gerçek bir Tradovate dosyasıyla denenmedi**; sütun adları bilinen düzene göre yazıldı.

### Tradovate tanıtım sayfası (`4559e94`)
- Yeni sayfa: **/integrations/tradovate** (dışa aktarma adımları, vadeli işlem özellikleri, SSS).
- `/integrations` listesi, destek sayfası ve `llms.txt`'e eklendi, site haritasında.
- Logo yerine nötr ikon var: resmi logo `public/images/platforms/tradovate.svg` ile değiştirilmeli.

---

## AI ile işlem ekleme

### AI ile Ekle (`54352de`)
- İşlem Ekle penceresinde yeni **"AI ile Ekle"** sekmesi: ekran görüntüsü yapıştır / bırak / seç, ya da yazarak anlat
  (TR / EN / DE; "dün", "bugün" gibi ifadeler tarihe çevriliyor).
- **Tek işlem** → normal form dolduruluyor (AI'nın doldurduğu alanlar vurgulu), kullanıcı kontrol edip kaydediyor.
- **Birden fazla işlem** → CSV önizlemesi; "İçe Aktar" mevcut akışla (mükerrer kontrolü dahil).
- Yeni Edge Function: **`ai-trade-parse`** (deploy edildi). AI koçun model zincirini kullanıyor (Gemini, yedekte
  OpenRouter). Hiçbir şeyi kendisi kaydetmiyor, görsel saklanmıyor, logda içerik yok.
- Doğruluk kuralları: görünmeyen değer uydurulmuyor; saatler kaynaktaki gibi; kullanıcının yazdığı metin talimat değil
  veri sayılıyor; okunan K/Z fiyatlarla tutmazsa uyarı (USD kotasyonlu forex / altın / kripto).
- Limit: **AI koçla ortak günlük hak** (Starter 5, Pro 50). Hiçbir şey okunamazsa hak iade ediliyor.
  Veritabanı değişmedi.

### AI ile sütun eşleme (`33ab981`)
- Okuyucunun tanımadığı CSV dosyasında artık **sütun eşleme ekranı** açılıyor (önceden "veri bulunamadı" hatası).
- Elle seçilebiliyor ya da **"AI ile Eşle"**: AI'ya yalnızca başlıklar ve ilk 5 satır gidiyor, AI sadece hangi
  sütunun ne olduğunu söylüyor; satırların hepsini bizim okuyucumuz okuyor.
- Eşleme tarayıcıda saklanıyor; **aynı format bir dahaki sefere kendiliğinden okunuyor**.
- Rapor biçimli dosyalarda üstteki başlık satırları ("Hesap özeti") atlanıyor.

### Testler
- **Gerçek MT5 ekran görüntüsü** (resmi MT5 iPhone "Positions" ekranı): 9 işlemin 9'u doğru; SL/TP detay kartından
  okundu, K/Z yazmayan satırlarda değer uydurulmadı.
- **Yazı denemeleri** (altın, EUR/USD virgüllü, Nasdaq + komisyon, üç işlem, Almanca DAX, kandırma denemesi): hepsi doğru;
  kandırma denemesinde "işlem yok" dendi.
- **Tarayıcı testi** (Edge, sunucu cevabı taklit): 27/27 geçti. Açık işlemde çıkış boş kalıyor ve uyarı veriyor;
  telefon genişliğinde yatay kayma yok.

---

## K/Z düzeltmesi: USDJPY tipi pariteler (`6cd74cc`)
- USDJPY, USDCAD, USDCHF gibi paritelerde K/Z hesap para birimine çevrilmiyordu (örnek: −$45,29 yerine **−7000**).
  Hata AI'dan değil, uygulamanın genel hesabındaydı (elle girişte de vardı).
- Düzeltme: hesap para birimi paritenin baz birimiyse sonuç çıkış fiyatına bölünüyor (kesin, kur gerekmiyor).
  Eski "EUR hesap + EURUSD" kuralı genelleştirildi. Form, toplu metin, CSV ve AI içe aktarmada geçerli.
- Canlı veritabanında **salt okunur** kontrol yapıldı: 228 işlemin hiçbiri USD bazlı parite değil, **etkilenen kayıt yok**.
- Hâlâ eksik: çapraz pariteler (USD hesapta EURJPY, GBPJPY); anlık kur gerekiyor.

---

## Hızlı İşlem Ekle penceresi (diğer oturumlar)

- **Form düzeni** (`645dcb0`): notlar ve duygu çipleri tam genişlik satırda; sol kolon sembol/yön/enstrüman/lot/tarih/
  strateji, sağ kolon fiyatlar, komisyon/swap ve canlı K/Z kartı; telefonda sekmelerin ezilmesi düzeltildi.
- **CSV ve toplu metin sekmeleri** (`a9c20f2`): tıklanabilir bırakma alanı, dosya okununca küçülen alan, sınıflarla
  önizleme tablosu, çevrilmiş başlıklar, dosya okunana kadar pasif "İçe Aktar", yeni dosyada eski önizlemenin
  temizlenmesi; toplu metne örnek kartı ve satır sayacı.
- **Hazır sembol seçici** (`5a43933`): son kullanılan semboller ve popüler semboller (Forex / Altın / Endeks / Kripto);
  seçince enstrüman otomatik.
- **Sembollerim** (`59ac12e`): kullanıcı kendi sembolünü ekleyip silebiliyor (EURUSD.m, US30.cash…); sembol başına
  enstrüman ve çarpan hatırlanıyor (USOIL → Diğer ×1000).
- **Sembollerim cihazlar arası senkron** (`afdb1d8`): **veritabanı migration'ı `202611230001`**
  (`user_profiles.quick_add_prefs` jsonb). Canlı veritabanına yedek alındıktan sonra uygulandı, doğrulama 9/9;
  sütunun canlıda olduğu ayrıca kontrol edildi. Geri dönüş dosyası:
  `supabase/rollbacks/202611230001_user_profile_quick_add_prefs.down.sql`.
- **Komisyon şablonları cihazlar arası senkron** (`f9abe26`): aynı sütunda, ek veritabanı değişikliği yok. Düzeltme:
  "+ Yeni şablon" sonra Kaydet, yeni şablon eklemek yerine aktif olanın üstüne yazıyordu.

## Arayüz ve tema (diğer oturumlar)

- **Üst çubuk erişilebilirlik** (`f793bdb`): avatar gerçek buton, `aria-expanded` / `aria-current`, çevrilmiş etiketler,
  klavye odak halkaları, Backtest bağlantısının geç belirmesi giderildi, mobil menüde Analitik ikonu.
- **Açık tema arka planı** (`0835923`): açık temada arka plan koyu kalıyordu.
- **Para biçimi ve kontrast** (`1a95c52`): tüm para gösterimleri uygulama diline göre (aynı ekranda $17,35 ve $17.94
  karışıyordu); aylık hedef yüzdesi tutarlı; açık temada görünmeyen öğeler düzeltildi.
- **Açık tema siyah kontroller** (`53ce974`): Backtest PRO etiketi, panel gizleme ve onboarding ikonları.
- **Sayfalar arası tasarım tutarlılığı** (`398550d`): tarih filtresi ve dışa aktarma butonları tüm sayfalarda aynı
  boyutta; açık temada görünmeyen gri avatar; çeviriler yüklenmeden çizilen Türkçe yazılar; tablolarda mono font yerine
  tablo rakamları.

---

## Canlıya alma özeti

| Ne | Durum |
|---|---|
| Site (Cloudflare, `master` push'u) | Canlı, son yayın 23.11 00:58:35 |
| Edge Function `ai-trade-parse` | Deploy edildi (AI ile Ekle + sütun eşleme sürümü) |
| Veritabanı migration `202611230001` | Canlıda uygulandı (yedekli), sütun doğrulandı |
| Diğer veritabanı yazması | Yok (yalnızca salt okunur kontroller) |

**Testler:** 1012 testten 1009'u geçiyor. Bilinen 3 hata önceden de vardı, bugünkü işlerle ilgisi yok: Windows satır
sonu nedeniyle ikisi (`bundle.js` esbuild eşitliği, üst çubuk "N" kısayolu) ve ambient kataloğundaki çeviri testi.

---

## Açık kalanlar

- [ ] **CrossTrade cevabı** bekleniyor (Partner bölümü, deneme süresi / ücret indirimi, saklama süresi, ülke).
      Gelince fiyatlandırma kararı: ayrı ücretli ek paket mi?
- [ ] **NinjaTrader Connect** başvurusunun cevabı bekleniyor; hazır takip mesajı var.
- [ ] **Telefondan gerçek ekran görüntüsüyle** AI ile Ekle denemesi (iPhone galerisi, broker mobil uygulaması).
- [x] **Tradovate CSV doğrulandı (23 Kasım):** gerçek Orders örneği (TradeZella yardım sayfasındaki demo MESM4 dosyası: baştaki boşluklar, CRLF, sırasız/iptal satırlar) doğru okundu (−$25,00 / +$116,25), kalıcı teste eklendi. Performance için internette gerçek örnek yok; 67 satırlık sentetik örnek (FundedFlow) 59 işleme birleşti, toplam K/Z birebir. Kod değişikliği gerekmedi. Kalan: bir kullanıcının gerçek Performance dosyası.
- [ ] **Okunamayan gerçek bir broker dosyasıyla** AI sütun eşleme denemesi.
- [ ] Tradovate tanıtım sayfasına resmi logo.
- [ ] Çapraz paritelerde (EURJPY, GBPJPY) K/Z için kur verisi.
- [ ] AI ile Ekle'yi ana sayfada ve entegrasyonlar sayfasında tanıtmak (öneri, karar bekliyor).
- [x] AI koç token azaltma: tamamlandı.
