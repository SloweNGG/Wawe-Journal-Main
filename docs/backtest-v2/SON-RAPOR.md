# Yeni özellik: defter bazlı "Hangi işlemler görünsün?" + defter penceresi düzeltmeleri (2026-10-22, yayında)

- **Veritabanı:** `journals.trade_scope` ('live' varsayılan | 'backtest' | 'all'), Migration `202610220001_journal_trade_scope.sql` canlıda uygulandı (7 defterin hepsi 'live', ekranlar değişmedi). Yedek: `~/WaweJournal-Backups/20261022T125319Z/` (SHA256 doğrulandı). Önce canlıda işlem içinde (ROLLBACK ile) denendi: kapsam başına sayaçlar, eski 5 argümanlı `update_journal` çağrısı kapsamı korur, geçersiz kapsam hata verir, ACL'ler; rollback + veri kaybı koruması da denendi. Rollback: `docs/backtest-v2/sql/supabase/rollbacks/202610220001_journal_trade_scope.down.sql`.
- **Kapsam kullanan yerler:** dashboard, premium analitik (PDF/CSV dahil), takvim, stratejiler, `list_journals` kartları, `get_journals_equity_data`, Trades varsayılan filtresi (elle değişir, oturumda defter başına hatırlanır). **Hep canlı:** prop, cTrader senkronu, overtrade/bildirimler, ana sayfa istatistikleri. Dashboard ve premium başlığında "Backtest dahil" / "Sadece backtest" rozeti.
- **Pencere:** oluşturma ve düzenleme penceresinin 1. adımında üç seçenekli kontrol; tüm metinler tr/en/de i18n (eksik anahtarlar eklendi, `{tz}` ve "%10 Hedef" hataları düzeltildi); koyu temada saf siyah zemin, nötr beyaz çizgiler; açık tema aynı.
- **Test:** 377/0 birim testi; pagecheck eski==yeni 6/6 sayfa birebir aynı (varsayılan 'live'); `pagecheck/scope-check.mjs` ('all' 137, 'backtest' 30 işlem, etiketler, prop tutarları her ayarda aynı, defter kartı K/Z); ekran görüntüleri (koyu/açık x tr/en/de x oluştur 1-3 / düzenle); canlı dosya SHA'ları eşleşti, canlı sitede tarayıcı kontrolü.

---

# Düzeltme turu: "Select a cTrader account." (cTrader hesap formu, 2026-10-22)

**Belirti:** canlıda cTrader verili hesap açarken veri derinliği doğru geliyor, ama "Create account" "Select a cTrader account." diyor; liste seçili görünüyor.

**Kök neden:** varsayılan seçimin change olayı ya da id tür uyuşmazlığı değildi (ikisi de doğru çalışıyor: yeni duman testi bu yolları geçiyor). Gönderimde hesap, **seçim listesinden değil, ortak durum önbelleğinden** (`L.ct`) aranıyordu. Bir broker hesabında bağlantı hatası (AUTH / needs_reconnect) olunca `refreshCtPanel` bu önbelleği `null` yapıyordu; liste ise eski seçeneklerle açık kalıyordu. Kullanıcı diğer (çalışan) hesabı seçince derinlik ölçülüyor ve doğru görünüyor, ama gönderimde önbellek boş olduğu için hesap bulunamıyordu. Canlıda iki bağlı Spotware demo hesabı var (49132296 / 5937620 ve 49193061 / 5941269); ilk hesapta hata, ikincisinde çalışma bu tabloyla uyumlu (gerçek cTrader'la doğrulanmadı; sahte sunucuda aynı belirti birebir yeniden üretildi, eski kodda başarısız, yenide geçer).

**Düzeltme (`backtest.js`):** gönderim anında hesap, seçim listesinin doldurulduğu hesap listesinden (`L.ctFormAccts`) ve listenin o anki değerinden okunur; bağlantı hatası artık ortak önbelleği silmez, yalnızca bir sonraki açılışta yeniden çekilmesini sağlar (`at = 0`). Varsayılan hesap ve varsayılan broker sembolü, liste her doldurulduğunda açıkça seçilir (`selectedIndex = 0`). Sembol listesi de gönderimde kendi listesinden okunuyordu; aynı sorun yok.

**Test:** `smoke/driver-ct-form.js` (yeni): hiçbir şey değiştirmeden varsayılan hesap + sembolle açma, formu yeniden açma, hesap değiştirip geri dönme, ikinci hesap, tek hesap, ilk hesap bağlantı hatası verip diğeri seçilince açma. Komutlar `smoke/README.md`.

---

# Düzeltme turu: "Bu hesapta bu sembol için mum verisi yok" (2026-10-21, `e313b8a`, yayında)

**Belirti:** canlıda cTrader hesabı + EURUSD seçilince form "mum verisi yok" diyordu (broker sembolleri listelendi, yani bağlantı, AppAuth, AccountAuth ve `symbols` çalışıyordu); aynı Spotware demo sunucusunda ölçüm (probe) 2011'e kadar veri bulmuştu.

**Yeniden üretim (dürüstçe):** gerçek cTrader'a karşı **yapılamadı**. `CTRADER_CLIENT_SECRET` yalnızca Supabase secret'larında; makinede yok. Aynı kodu Supabase içinde çalıştıracak geçici bir tanı fonksiyonu yayınlamayı denedim, izin sistemi reddetti (yeni uç nokta sahibin onayladığı kapsam dışı), bu yüzden denemedim. DB'den salt okunur (psql) bakıldı: token `active`, bitiş 2026-11-20, iki hesap da Spotware demo (`is_live=false`, doğru sunucu), `refreshing_since` boş. Kodda probe ile karşılaştırma yapıldı (aşağıda).

**Karşılaştırma (probe ↔ `ctrader-candles`):** sunucu (demo/live) doğru; AppAuth/AccountAuth sırası aynı; M1 = period 1; zaman damgası ms; 9 günlük parça + `hasMore` sayfalama (14 000 tavanı) aynı; `low + delta` çözümü aynı; hata yanıtları "veri yok"a **dönüşmüyordu** (hata → AUTH/RATE/UPSTREAM). Tek fark: `coverage` içindeki ay-varlık sorgusu (`hasMinuteBars`) probe'da hiç denenmemiş bir biçimdeydi: `count: 1` ve bitiş = **ay sonu (gelecek)**. "Veri yok" yalnızca bu sorgu en son ay için boş dönerse çıkabiliyordu (tek `null` yolu).

**Kök neden (en güçlü varsayım, canlıda kanıtlanmadı):** o sorgu gerçek sunucuda boş yanıt veriyor (gelecek bitiş ya da `count` yorumu); birim testlerin sahte sunucusu `count`'u "N bar" sayıp geleceği kabul ettiği için yakalamadı.

**Düzeltme (`_shared/ctrader.ts`):** varlık sorgusu probe'daki biçime döndü (`count` yok, bitiş "şimdi"ye kısılır); en son ay boşsa bir önceki aya bakılır; W1 ipucu doğrulanır (ipucundan önceki ayda veri varsa 2000'den aranır); ilk bar taraması da şimdiye kısıldı. Testler: sahte sunucuya iki tuhaflık eklendi (gelecek bitişte boş, `count` = zaman yuvası); yeni testler eski kodda **başarısız**, yenide geçer (366/0). Fonksiyon logu artık işlem + sınıf + cTrader hata kodunu (enum, token yok) yazıyor.

**Arayüz:** "veri yok" (NOT_FOUND / firstT yok), token-bağlantı hatası (AUTH, `needs_reconnect`: mesaj + "cTrader bağlantısını yenile" **linki** → `/journals`), sunucu hatası ("Sunucu hatası: …", UPSTREAM) ayrı mesajlar; tr/en/de.

**Yayın:** `ctrader-candles` yeniden yayınlandı (`--no-verify-jwt`; OPTIONS 204, oturumsuz POST 401), master `e313b8a` push edildi, `sw.js` v17, canlı dosyalar yerel build ile SHA-1 eşleşti, canlı webcheck 3 senaryoda 24/0, duman testi cTrader senaryosu 0 FAIL. Revert gerekmedi.

**Yapılamayan:** giriş yapılmış, gerçek cTrader'a giden canlı kontrol (JWT ve client secret yok). Sahibin kontrolü: /backtest → Yeni hesap → cTrader → EURUSD: "Bu hesapta bu sembolün verisi: …" satırı çıkmalı. Çıkmazsa Supabase → Functions → ctrader-candles → Logs'ta `ctrader-candles error: coverage <sınıf> <cTrader kodu>` satırı nedeni gösterir. Geri alma: `git revert e313b8a` ve `git show d99a5bb:supabase/functions/_shared/ctrader.ts` ile `ctrader-candles` yeniden yayını.

---

# Backtest v2, Faz 2: cTrader verisi (2026-10-21, son rapor, yayında)

**Durum: yayında, tek eksik sizin gerçek cTrader denemeniz.** Yeni token ile `ctrader-candles` (v1) ve `ctrader-sync` (v7) birlikte yayınlandı, `backtest-v2` master'a `--no-ff` merge edildi (`7d864fd`) ve push edildi, Cloudflare canlıda. Migration 09 önceki turda canlıya girmişti. Canlıda `webcheck` 24/0 (user/free, user/premium, admin/premium). **Revert gerekmedi.**

## Son tur (yayın) özeti

- **Token:** `~/.wawe-supabase.env` yenisiyle değiştirildi (600), izin salt okunur `GET /functions` ile doğrulandı (200). Değer hiçbir dosyaya, loga, commit'e yazılmadı.
- **Deploy:** ikisi `--use-api --no-verify-jwt` ile. `--no-verify-jwt` canlıdaki mevcut ayarla aynı (`ctrader-sync`, `ctrader-connect` zaten `verify_jwt=false`); gateway'in JWT kontrolü CORS ön isteğini (OPTIONS) reddederdi, fonksiyonlar kendi oturum kontrolünü yapıyor. Sürümler: `ctrader-candles` v1, `ctrader-sync` v6 → v7.
- **Not:** canlıdaki `ctrader-sync` v6, 15 Ekim'de yayınlanmıştı; "yayınlanmamış bekleyen backend" notu eskiymiş. Yani bakiye düzeltmeleri zaten canlıdaydı, bu deploy yalnızca ortak kilitli token yenilemesini ekledi.
- **Sağlık kontrolü (kimlik doğrulamasız, yapabildiğim kadarı):** iki fonksiyonda OPTIONS 204 (CORS), oturumsuz POST 401, geçersiz JWT 401 "Geçersiz oturum." Veritabanı salt okunur: `ctrader_tokens` 1 satır `active`, bitiş 15 Kasım, `refreshing_since` boş; `ctrader_accounts`'ta takılı `syncing_since` yok. İkinci hesabın eski `last_error` değeri ("Invalid access token") deploy öncesinden kalma.
- **Yapamadıklarım (dürüstçe):**
  1. **Fonksiyon logları okunamadı:** yeni token'da `analytics_logs_read` izni yok (403). Log doğrulaması yerine yukarıdaki dış kontroller yapıldı.
  2. **Kimlikli uçtan uca çağrı yapılmadı:** geçerli bir kullanıcı oturumu (JWT) yok; sahte oturum üretmedim. Yani `symbols`, `coverage`, `month` yanıtlarının gerçek cTrader'dan nasıl geldiği ve mevcut kullanıcılar için senkronizasyonun fiilen çalıştığı **henüz görülmedi**. Token 15 Kasım'a kadar geçerli olduğu için yenileme (kilitli yol) da canlıda henüz çalışmadı.
  3. `webcheck` sahte oturum ve sahte veritabanı kullanır; cTrader yolunu canlıda sınamaz.
- **Canlı site kontrolü:** `sw.js` v16; `bt-ctrader.js`, `backtest.js`, `bt-store.js`, `bt-engine.js`, `backtest.css`, üç dil dosyası, `i18n.js`, `sw.js` yerel build ile **SHA-1 eşleşti**. `webcheck` betiği güncellendi (cTrader seçeneği artık "Yakında" değil: bağlı değilse pasif + bağlantı linki).
- **Geri alma (gerekirse):** `git revert -m 1 7d864fd` (eski arayüz Migration 09 ile uyumlu). Fonksiyonlar: `ctrader-sync` önceki sürümü master'daki `ca0abaa` kodundan (`git show ca0abaa:supabase/functions/ctrader-sync/index.ts`; `_shared` olmadan çalışır) yeniden yayınlanır, `ctrader-candles` kullanılmaz hâle gelir (arayüz geri alınınca çağrılmaz).
- **Önce sizin sınamanız gereken şey:** aşağıdaki bölüm 5'teki adımlar; özellikle 3, 4 (ilk gerçek cTrader çağrısı), 7 ve 8 (token yarışı). Sorun görürseniz hata mesajını ve saati bildirin; Supabase panelinde Functions → ctrader-candles → Logs'a bakılabilir.

---

## 1. Kısa özet

1. **Kaldığın yer:** önceki oturumdan Faz 2 işi yoktu (git temiz, Migration 09 canlıda yok, `ctrader-candles` 404). Sıfırdan başlandı.
2. **Migration 09 canlıda çalıştı** (yedek: `~/WaweJournal-Backups/20261021T090532Z/`), doğrulandı; eski arayüz yeni şemayla uyumlu (yalnızca ekleme).
3. **Edge Function yazıldı ve test edildi ama yayınlanamadı:** token `edge_functions_read` ve `edge_functions_write` izinlerinden yoksun (CLI ve doğrudan Management API 403). Başka kimlik bilgisi aranmadı.
4. **Arayüz bitti** (cTrader seçeneği, hesap + sembol seçimi, veri derinliği ölçümü, kaynak etiketi, tarayıcı önbelleği, bağlantı koptu mesajları, defter bağlantısı, tr/en/de) ve test edildi.
5. **Testler:** birim 362/0 (önce 312), gerçek tarayıcı duman testi 5 senaryoda 0 FAIL (yeni cTrader senaryosu 39 PASS), pagecheck 6/6, build tamam, `deno check` hatasız.
6. **Sizden gereken tek şey:** Edge Function izinli bir token (bölüm 6). Sonra iki deploy komutu, merge ve canlı kontrol: bölüm 6.

## 2. Madde madde

**1. Migration 09 (rollback'iyle): ✅ yazıldı, yerelde denendi, canlıda uygulandı**
- Dosyalar: [202610180009_backtest_ctrader_source.sql](../../supabase/migrations/202610180009_backtest_ctrader_source.sql), [rollback](sql/supabase/rollbacks/202610180009_backtest_ctrader_source.down.sql), şablonlar `sql/verify/src/09.sql` ve `09.down.sql` (`build.mjs` listesine eklendi).
- İçerik:
  - `data_source` artık `synthetic` ya da `ctrader`.
  - Yeni sütunlar: `source_ctid_account` (broker hesap numarası), `source_broker_name`, `source_is_live`, `source_symbol_id`, `source_symbol_name`, `source_digits`. Yabancı anahtar yok (cTrader bağlantısı kesilince satırlar silinip yeni id ile geliyor).
  - `chk_backtest_accounts_source_fields`: `ctrader` ise hesap numarası, sembol id ve sembol adı dolu; `synthetic` ise hepsi NULL.
  - **Defter kuralı aynen kaldı:** `chk_backtest_accounts_journal_needs_ctrader` dokunulmadı; sentetik hesap deftere bağlanamaz, cTrader verili hesap bağlanabilir.
  - `data_source` ve tüm `source_*` sütunları oluşturulduktan sonra değişmez (`BACKTEST_ACCOUNT_IMMUTABLE:source`).
  - Ek koruma: cTrader hesabı yalnızca **o broker hesabını kendi bağlamış** kullanıcı açabilir (`trg_backtest_accounts_ctrader_owner`, `CTRADER_ACCOUNT_NOT_LINKED`).
  - `ctrader_tokens.refreshing_since`: ortak ve kilitli token yenilemenin "kira" sütunu.
- Rollback: `ctrader` hesap varsa DATA LOSS ile durur; yoksa 08 durumuna döner (CHECK yalnız synthetic, 08'in koruma fonksiyonu, `source_*` ve `refreshing_since` gider). Yerelde iki kez çalıştırıldı, tekrar ileri uygulandı.
- Yerel deneme: canlı şemanın `pg_dump --schema-only` kopyası, gerçek PostgreSQL 17. Denenenler: iki kez çalıştırma, sentetik ve cTrader satırlar, eksik/geçersiz alanlar, başka kullanıcının broker hesabı, değiştirilemezlik, `journal_needs_ctrader`, rollback (DATA LOSS dahil), yeniden ileri. Tam SQL harness'i (PGlite/`harness.mjs`) **çalıştırılmadı** (PGlite paketi yok); 09 için harness testi eklenmedi, yerine bu yerel deneme yapıldı.
- Canlı doğrulama: 6 `source_*` sütunu, `refreshing_since`, üç CHECK, iki trigger, fonksiyonlar yalnızca postgres/service_role'e açık, 1 hesap hâlâ sentetik ve bağlı değil, `ctrader_tokens` 1 satır `active` ve kira boş.

**2. Edge Function `ctrader-candles`: ✅ yazıldı, test edildi; ❌ yayınlanmadı**
- [supabase/functions/ctrader-candles/index.ts](../../supabase/functions/ctrader-candles/index.ts), ortak kod [supabase/functions/_shared/ctrader.ts](../../supabase/functions/_shared/ctrader.ts).
- İşlemler: `symbols`, `symbolInfo`, `coverage`, `month`.
- **Sahiplik:** kullanıcı JWT'si zorunlu. Token yalnızca çağıranın `ctrader_tokens` satırından. Hesap `ctrader_accounts`'ta (user_id + ctid) çağıranla eşleşmeli. `month` yalnızca `backtestAccountId` ile çalışır: broker hesabı ve sembol veritabanındaki satırdan türetilir, tarayıcının gönderdiği ctid/sembol yok sayılır. Başka kullanıcının hesabı → 404.
- **Veri:** 9 günlük parçalar, 14 000 bar tavanı için `hasMore` ile geriye sayfalama (tavan 3000'e indirilmiş sahte sunucuyla da bar kaybı yok), en çok 5 istek/sn (250 ms aralık). Sunucuda mum saklanmaz, yanıt `Cache-Control: private`. Bugün ve gelecek dışarıda (yalnızca tam günler).
- **Kota:** kullanıcı başına dakikada 40 istek ve aynı anda 2 iş. Bu sayaç isolate belleğindedir (en iyi çaba); ölçeklenince birden çok isolate'ta ayrı sayılır.
- **Ortak, kilitli token yenileme:** `_shared/ctrader.ts` `getAccessToken` + `supabaseTokenStore`. Kira tek `UPDATE ... WHERE refreshing_since IS NULL OR eski` ile atomik alınır; kira alan, kilit altında satırı yeniden okur (beklerken başkası yenilemiş olabilir). Testle kanıtlandı: iki eşzamanlı çağıran → **refresh token yalnızca bir kez** kullanılır. Kesin hata (geçersiz refresh token) → `needs_reconnect`; geçici hata (5xx, ağ) → bağlantı kopmuş **sayılmaz**, token hâlâ geçerliyse onunla devam. Yeni refresh token yazılamazsa 4 kez dener. `ctrader-sync` artık bu ortak koddan geçiyor (eski yenileme bloğu kaldırıldı).
- Testler: `tests/ctrader-shared.test.js` (20 test, Node tür soyma ile aynı dosyayı çalıştırır). `deno check` iki fonksiyonda hatasız.
- **Gerçek cTrader'a karşı denenmedi.** Fonksiyon yayınlanamadı ve sahibin canlı token'ını kendi başıma kullanmadım (yenileme kaydı bozabilirdi). WebSocket istemcisi `ctrader-sync`'tekinin kopyası; istek türleri (2137 trendbar, 2114/2116 semboller) Spotware belgesine ve geçen turdaki ölçüme göre. Riskli tek yer: hafta bazlı (W1) "ilk veri" ipucu; hata verirse yok sayılıp 2000'den aranır.

**3. Arayüz: ✅**
- Yeni hesap formunda "cTrader verisi": cTrader bağlı (token `active`, hesap var) kullanıcıda **etkin**; bağlı değilse pasif ve "cTrader hesabını bağla" bağlantısı (`/journals`), token `needs_reconnect` ise "cTrader bağlantısını yenile". "Yakında" etiketi kalktı.
- cTrader seçilince: cTrader hesabı seçimi, **broker sembolü** seçimi (uygulamanın sembolüne göre aday liste: EURUSD → EURUSD, EURUSDm, EURUSD.r; XAUUSD → XAUUSD, GOLD; BTC/USDT → BTCUSDT, BTCUSD), ve hesap açılmadan önce **veri derinliği ölçülüp gösterilir** ("Bu hesapta bu sembolün verisi: 05 Şub 2024 – 21 Eki 2026"), başlangıç tarihi bu aralıkla sınırlanır.
- Hesap açılırken `symbolInfo` ile sembol doğrulanır, `source_*` alanları yazılır (broker hesabı, broker adı, canlı/demo, sembol kimliği ve adı, digits).
- Etiket: grafikte ve hesap kartında "**cTrader · broker adı · sembol**"; sentetik hesapta eski uyarı aynen.
- Önbellek: tam aylar tarayıcıda IndexedDB'de kullanıcı kimliğiyle; sayfa açılınca **başka kullanıcıya ait kayıtlar silinir**; içinde bulunulan ay kalıcı saklanmaz; ilk veri ayı 30 gün hatırlanır. IndexedDB yoksa bellek.
- Bağlantı koptuysa: hesap açılırken liste ekranında kırmızı bildirim ("cTrader bağlantısı gerekli… işlemlerin ve defter kopyaların korunur") ve yenileme bağlantısı; replay sırasında kopmuşsa veri bandında aynı mesaj ve "cTrader bağlantısını yenile" düğmesi. Ham hata metni kullanıcıya gösterilmez; hız sınırı, oturum, ağ ve sunucu hataları için ayrı mesajlar.
- Defter bağlantısı: cTrader verili hesapta açık (oluştururken ve ayarlarda); kapanan işlem deftere kopyalanır (`bt-sync`). Sentetikte hâlâ gizli.
- Dil: 20 yeni anahtar tr, en, de; `i18n.js` ve `sw.js` (v16) sürümleri artırıldı.
- Yeni dosya: `public/interface/backtest/js/bt-ctrader.js`. Değişenler: `backtest.js`, `bt-engine.js`, `bt-store.js`, `backtest.astro`, `backtest.css`.

**4. Testler: ✅**

| Test | Sonuç |
|---|---|
| `node --test` | 362 geçti, 0 kaldı (önce 312): +20 Edge ortak kod, +25 `bt-ctrader`, store/engine/i18n güncellemeleri |
| Duman testi (headless Chrome) | yerel 0 FAIL, Supabase+FakeDb sentetik 23 PASS, **yeni cTrader senaryosu 39 PASS**, `ct=none` ve `ct=reconnect` 5/5 |
| pagecheck | 6/6 (eski ve yeni build aynı sayılar, JS hatası yok) |
| `npm run build` | tamam |
| `deno check` (iki fonksiyon) | hatasız |
| Canlı SQL | Migration 09 sonrası doğrulama sorguları (bölüm 3) |

cTrader duman senaryosu (sahte `ctrader-candles` yanıtıyla, FakeDb'de Migration 08+09 taklidi): seçenek etkin, broker sembol adayları, derinlik ölçümü ve tarih sınırı, sembol değişince adayların yenilenmesi, `symbolInfo` sonra kayıt, kaydın `source_*` alanları, mumların **yalnızca backtest hesap kimliğiyle** istenmesi (tarayıcı ctid/sembol göndermiyor), IndexedDB'ye kullanıcı kimliğiyle yazılması, etiket, kapanan işlemin deftere kopyalanması, ayarlarda salt okunur özet ve kilit, DB'nin kaynağı değiştirmeyi ve başkasının broker hesabını reddetmesi, replay'de ve açılışta bağlantı koptu mesajları, işlemlerin ve kopyaların yerinde kalması.

**5. Yayın, merge: ❌ yapılmadı (koşul sağlanmadı)**
- Edge Function'lar yayınlanmadan merge etseydik canlıda cTrader seçeneği bağlı kullanıcılara açılır ama sunucu tarafı olmazdı. Master `ca0abaa`'da, canlı site Faz 1'deki gibi.
- Canlıda yapılan tek değişiklik Migration 09 (ekleyici, eski arayüzle uyumlu). Gerekirse geri almak: `09.down.sql` (hesap yoksa).

## 3. Canlı veritabanı

- **Yedek:** `~/WaweJournal-Backups/20261021T090532Z/` (repo ve OneDrive dışı): `full.dump` (679 KB, 1055 nesne), `schema.sql`, `roles.sql`, `preflight.txt`, `SHA256SUMS`. Satır sayıları: backtest_accounts 1, ctrader_tokens 1, ctrader_accounts 2, trades 97. Hata dosyaları boş.
- **Yazılan tek şey:** Migration 09 (COMMIT). Veri değişmedi (yeni sütunlar NULL, hesap sentetik).
- **Edge Function / secret / Storage:** hiçbiri yazılmadı. Token yalnızca `functions list` ve `deploy` denemesinde kullanıldı (ikisi 403); token hiçbir dosyaya, loga, commit'e ya da bu rapora yazılmadı (yalnızca `~/.wawe-supabase.env`, izinler 600).

## 4. Sınırlar ve dürüst notlar

- **Gerçek cTrader'a ve yayınlanmış fonksiyona karşı uçtan uca deneme yok** (bölüm 2.2). Sizin deneyeceğiniz adımlar bölüm 5.
- **Sembol eşlemesi:** sayfa yalnızca kendi 6 sembolünü bilir (EURUSD, GBPUSD, USDJPY, XAUUSD, BTC/USDT, ETH/USDT). Broker sembolü ad benzerliğiyle eşlenir (sonek en çok 4 karakter: `.r`, `m`, `.pro`). Kontrat büyüklüğü, pip ve piyasa saatleri **broker'dan değil uygulamanın ayarından** gelir; broker'ın `digits` değeri uygulamanınkinden büyükse (ör. 3 haneli altın) fiyatlar uygulamanın hanesine yuvarlanır, kaydedilen `source_digits` yalnızca bilgi içindir.
- Bir ayın **tamamı boşsa** (broker boşluğu) o ay `NOT_FOUND` olur ve replay "Mum verisi yüklenemedi" bandı gösterir; Spotware demo'da 2020'den beri böyle ay yok.
- Mumlar **bid** fiyatlarıdır; spread `spread_pips` ile simüle edilir (broker'ın gerçek spread'i değil).
- Lisans/koşul riski (Spotware ve broker sözleşmeleri) hukuken doğrulanmadı (FAZ-E-VERI.md risk 1).
- `ctrader-sync` yayınlandığında repodaki **güncel sürüm** gider; bu sürüm 15 Ekim'den beri yayınlanmamış bakiye ve senkron doğruluğu düzeltmelerini de içerir (`d4083d8`). Bunlar için gereken migration'lar (0005 bakiye sütunları, 0003 imleç tetikleyicisi) canlıda var; 0004 (geliştirici test modu) `ctrader-sync` için gerekli değil.
- Supabase token'ı bu oturumun isteminde düz metin olarak geçti: yeni token üretince eskisini Supabase panelinden silin.

## 5. Sizin kendi cTrader hesabınızla deneyeceğiniz adımlar (yayından sonra)

1. **/backtest → Yeni hesap:** "cTrader verisi" seçeneği etkin mi? (Bağlı değilse "cTrader hesabını bağla" bağlantısı `/journals`'a gider.)
2. cTrader'ı seçin: kendi hesabınız listede görünmeli. Sembol olarak **EUR/USD**: broker adayları (`EURUSD`, varsa `EURUSD.r`) çıkmalı. Altın için **XAU/USD**: `XAUUSD` ya da `GOLD`.
3. **"Bu hesapta bu sembolün verisi: … – …"** satırı: gerçek brokerınızda verinin **ne kadar geriye gittiğini** (varsayım değil, ilk ölçüm) kaydedin; başlangıç tarihini en eski güne yakın seçip deneyin.
4. Hesabı açın: grafikte "**cTrader · <broker adı> · <sembol>**" yazmalı. Oynatın, ay geçişinde "Sonraki ay yükleniyor" süresini not edin.
5. **Önbellek:** sayfayı yenileyip aynı hesabı açın; aynı aylar neredeyse anında gelmeli (DevTools → Application → IndexedDB → `ww_bt_ctrader`). Çıkış yapıp başka bir hesapla girerseniz bu kayıtlar silinmeli.
6. **Defter:** hesabı bir deftere bağlayın, bir işlem kapatın: işlem deftere "Backtest" olarak gelmeli, dashboard ve istatistikler değişmemeli. Bağlantıyı kaldırınca kopya silinmeli.
7. **Bağlantı koptu:** `/journals`'tan cTrader bağlantısını kesin, backtest hesabını açın: "cTrader bağlantısı gerekli" bildirimi gelmeli, işlemleriniz ve defter kopyalarınız yerinde kalmalı. Yeniden bağlayınca devam etmeli.
8. **Token yarışı:** `/trades`'te "cTrader'dan Senkronla"ya basarken başka bir ayı açın; ikisi de çalışmalı ve bağlantınız kopmamalı. Kontrol: `select status, refreshing_since, expires_at from ctrader_tokens;` (status `active`, `refreshing_since` boş).
9. Farklı bir sembol ya da gerçek broker adı sonekleri (örn. `XAUUSD.pro`) çıkmazsa, adını ve broker'ınızı bana bildirin: eşleme listesi `bt-ctrader.js` `ALIASES`.

## 6. (Tamamlandı) Yayın adımları

Edge Function için **Supabase → Account → Access Tokens**'tan yeni bir token üretin (kapsam kısıtlamayın ya da "Edge Functions: read/write" verin) ve `~/.wawe-supabase.env` içindeki `SUPABASE_ACCESS_TOKEN` değerini değiştirin. Sonra yeni oturumda "kaldığın yerden devam et" demeniz yeterli: sırayla

```
set -a; source ~/.wawe-supabase.env; set +a
npx supabase functions deploy ctrader-candles --project-ref odasapyhtdopbnlfhwde --use-api
npx supabase functions deploy ctrader-sync   --project-ref odasapyhtdopbnlfhwde --use-api   # ortak kilitli yenileme için ikisi de yayınlanmalı
git checkout master && git merge --no-ff backtest-v2 && git push        # sonra Cloudflare yayını
PG_MODULE_DIR=<puppeteer-core üst klasörü> node docs/backtest-v2/asama-arayuz/webcheck/run.mjs https://wawejournal.com user free
```

İki fonksiyon **birlikte** yayınlanmalı: eski `ctrader-sync` kilitsiz yeniler ve `ctrader-candles` ile yarışabilir.
Sorun olursa: `git revert -m 1 <merge>` (eski arayüz Migration 09 ile uyumlu), fonksiyonları eski haline almak için `ctrader-candles` silinir ya da kullanılmaz; gerekirse `09.down.sql` (hiç cTrader hesabı yoksa).

---

# (Önceki tur) Backtest v2, Faz 1: Pratik modu (2026-10-21, son rapor)

Kod: `180addc` (backtest-v2), master'a `--no-ff` merge `b6aeb8a`, ikisi de push edildi, Cloudflare Pages canlıda yeni dosyaları sunuyor. Migration 08 canlıda çalıştı (yedek alındı). **Revert gerekmedi.** Önceki turların raporu bu dosyanın altındadır.

## 1. Kısa özet

1. **Backtest giriş yapmış herkese açıldı.** Admin kapısı ve "Backtest yakında" ekranı kaldırıldı, navbar linki herkese görünüyor. Kota aynı: ücretsiz 1, premium 10 aktif hesap (canlı veritabanında admin olmayan gerçek bir ücretsiz kullanıcı kimliğiyle denendi, geri alınan işlemde).
2. **Migration 08 canlıda uygulandı:** `backtest_accounts.data_source` (yalnızca `synthetic`, sonradan değişmez), sentetik hesap deftere bağlanamaz (veritabanı CHECK'i). Rollback dosyası hazır ve harness'te denendi.
3. **Önce temizlik yapıldı:** 1 hesabın defter bağlantısı kaldırıldı, bağlantıyla birlikte defterdeki **4 kopya işlem** mevcut trigger ile silindi (ayrıntı bölüm 3).
4. **Arayüz:** yanlış "hesaplar bu tarayıcıda saklanır" uyarısı değişti, grafikte ve hesap kartında "Sentetik veri, gerçek piyasa verisi değildir" etiketi, sentetik hesapta defter seçimi gizli, hesap formunda veri kaynağı seçimi ("Sentetik veri (pratik)" seçili, "cTrader verisi" görünür ama "Yakında" ile pasif). tr, en, de.
5. **Testler:** birim 312/0, SQL (gerçek PostgreSQL 17) 297/0, canlı `verify.sql` 23 PASS, duman testi dört senaryoda 0 FAIL, pagecheck 6/6, imzalı tarayıcı kontrolü (build ve canlı site, admin ve admin olmayan) 24/0.
6. **Sınır (dürüstçe):** admin olmayan gerçek bir hesapla canlı sitede giriş yapıp tıklayarak denemedim; kimlik bilgisi yok. Onun yerine canlı sitede sahte oturum ve sahte veritabanı ile tarayıcı akışı, ayrıca gerçek veritabanında gerçek bir admin olmayan kullanıcının kimliğiyle RLS/kota/CHECK denemesi (hepsi geri alındı) yapıldı. Gerçek giriş denemesi sizde (bölüm 7).

## 2. Madde madde

**1. Migration 08 (rollback'iyle): ✅**
- Dosyalar: [202610180008_backtest_data_source.sql](../../supabase/migrations/202610180008_backtest_data_source.sql), [rollback](sql/supabase/rollbacks/202610180008_backtest_data_source.down.sql), şablonlar `sql/verify/src/08.sql` ve `08.down.sql`, `build.mjs` çıktılarına eklendi.
- İçerik:
  - `data_source text NOT NULL DEFAULT 'synthetic'` + `chk_backtest_accounts_data_source CHECK (data_source = 'synthetic')`. `'ctrader'` şimdilik reddedilir; sonraki tur bu CHECK'i değiştirir.
  - `chk_backtest_accounts_journal_needs_ctrader CHECK (journal_id IS NULL OR data_source = 'ctrader')`: sentetik hesap deftere bağlanamaz (INSERT'te de UPDATE'te de, postgres ve admin dahil). `'ctrader'` kapalı olduğu için şu an hiçbir hesap bağlanamaz.
  - `trg_backtest_accounts_data_source_guard` (BEFORE UPDATE, yalnızca değer değişirse): `BACKTEST_ACCOUNT_IMMUTABLE:data_source`.
  - PRECONDITION: bağlı hesap varsa migration durur (açık hata iletisi, hiçbir şey değişmez). Rollback: `data_source` değeri `synthetic` dışındaysa DATA LOSS ile durur.
  - RLS, kota ve diğer trigger'lara dokunulmadı.
- FAZ-E-VERI.md'deki taslaktan fark: `source_*` sütunları (broker hesabı, sembol, digits) bu migration'a **konmadı**; yalnızca istenen alan eklendi. Onlar cTrader turunda Migration 09 ile gelir.
- Harness (gerçek PostgreSQL 17, 297 test): önkoşul reddi ve "hiçbir şey değişmedi", bağlantı kaldırınca kopyaların gitmesi ve gerçek işlemlerin korunması, idempotans (iki kez çalıştırma), varsayılan, `ctrader` ve diğer değerlerin reddi, NULL reddi, INSERT/UPDATE ile bağlamanın reddi (sahip ve postgres), değiştirilemezlik, aynı değeri yazmanın hata vermemesi, kota/RLS değişmedi, fonksiyonun PUBLIC/anon/authenticated'a kapalı olması, rollback iki kez, rollback sonrası tüm katalog başlangıçla aynı.

**2. Defter bağlantılarının kaldırılması (migration'dan önce): ✅**
- Etkilenen: **1 hesap** (`a34b4117`, "Backtest", EURUSD, sahibi admin), deftere bağlıydı.
- Silinen: defterdeki **4 kopya işlem** (`platform_source = 'backtest'`). `trades` 101 → 97 satır.
- Korunan: hesabın kendi **4 backtest işlemi** (`backtest_account_trades`) yerinde. Gerçek defter işlemlerine dokunulmadı (97 satır önceki gerçek işlemler).
- Yöntem: tek transaction'da `UPDATE backtest_accounts SET journal_id = NULL WHERE journal_id IS NOT NULL;`, trigger `trg_backtest_accounts_cleanup_relink` kopyaları sildi; aynı transaction'da beklenen sayılar doğrulandı (97 / 0 kopya / 0 bağlı / 4 hesap işlemi), tutmasaydı geri alınacaktı.

**3. Arayüz: ✅**
- Hesap listesi uyarısı: "Mumlar sentetiktir, gerçek piyasa verisi değildir. Hesapların kullanıcı hesabında kayıtlıdır." (anahtar `backtest.list_banner`; en ve de karşılıkları var).
- Etiket "Sentetik veri, gerçek piyasa verisi değildir": grafiğin üstünde (sarı kesik çizgili hap) ve her hesap kartında.
- Sentetik hesapta defter seçimi gizli (oluşturmada ve ayarlarda); hesap kartında "Bağlı hesap" satırı yok; defterler için istek de atılmıyor.
- Yeni hesap formunda "Veri kaynağı": "Sentetik veri (pratik)" seçili ve aktif, "cTrader verisi" + "Yakında" etiketi, pasif. Ayarlar penceresinde ikisi de kilitli, "Veri kaynağı hesap oluşturulduktan sonra değiştirilemez." notu.
- Yeni anahtarlar tr, en, de'de (`list_banner`, `field.source`, `source.*`). Artık kullanılmayan `gate.*` ve `test_banner` anahtarları silindi.
- Ekran görüntüleri (repo dışı, scratchpad): koyu tema, 1440x1000; tr, en, de.

**4. Admin kapısı: ✅**
- `WwBtGate.decide`: `anon`, `demo`, `member`. `soon` ekranı ve `bt-view-soon` kaldırıldı.
- Navbar: `showBacktestLink()` giriş yapmış herkes için çağrılıyor (önbellekli ve ilk oturum yolu).
- Kota kuralı aynı (`FREE_LIMIT = 1`, `PREMIUM_LIMIT = 10`; DB trigger'ı belirleyici).
- Önbellek: `sw.js` v15, dil dosyası sürümü (`i18n.js`), `navbar.js`, backtest asset sürümleri artırıldı (eski dil dosyası ve SW'nin eski kopyaları yeni anahtarları gizlemesin diye).

**5. Testler: ✅** (bölüm 4)

**6. Merge, push, yayın ve canlı kontrol: ✅**
- Koşullar (testler, build, pagecheck, iki rolle duman testi) sağlandı; `backtest-v2` master'a merge edilip push edildi.
- Cloudflare: `sw.js` `wawe-v15`; `backtest.js`, `bt-store.js`, `bt-engine.js`, `backtest.css`, `navbar.js`, üç dil dosyası, `i18n.js`, `sw.js` yerel build ile **SHA-1 eşleşti**. `backtest.html` hash'i farklı (Cloudflare HTML'e ekleme yapıyor), ama yeni işaretler (`backtest.css?v=3`, veri kaynağı alanı) sayfada var.
- Canlı sitede imzalı tarayıcı akışı (bölüm 4) admin olmayan ve admin ile 24/0.

**7. Bu rapor: ✅**

## 3. Canlı veritabanı

- **Yedek:** `~/WaweJournal-Backups/20261021T062240Z/` (repo ve OneDrive dışı): `full.dump` (pg_dump -Fc, 678 KB), `schema.sql`, `roles.sql`, `rowcounts.txt`, `SHA256SUMS`. Satır sayıları: backtest_accounts 1, backtest_account_trades 4, trades 101, journals 9, user_profiles 4. Hata dosyası boş.
- **Yazılanlar (sırayla):** (a) bağlantı kaldırma (1 hesap, 4 kopya silindi), (b) Migration 08 COMMIT.
- **Sonrası doğrulama:** sütun `text NOT NULL DEFAULT 'synthetic'`; iki CHECK ve trigger yerinde; 1 hesap, 1 sentetik, 0 bağlı. Geri alınan işlemde `data_source` değiştirme ve bağlama reddedildi.
- **`verify.sql`:** ilk çalıştırmada (eski sürüm) 10 PASS / 9 FAIL verdi. Neden: eski test sentetik hesapları deftere bağlıyordu, 08 bunu artık yasaklıyor. Migration hatası değil, testin eskimesiydi; hiçbir şey kalıcı yazılmadı (test kendi geri alınır). Test güncellendi (S18a-d: 08'in kendi senaryoları; sonra yalnızca o geri alınan transaction'da bağlantı CHECK'i kaldırılıp eski bağlantı senaryoları, ki cTrader turunda geri gelecek, çalışıyor). Yeniden canlıda: **23 PASS / 0 FAIL**, artıkta test kullanıcısı yok.
- **Gerçek kullanıcı kimliğiyle RLS denemesi (geri alındı):** admin olmayan gerçek bir ücretsiz hesap (`dcc66303…`, `is_admin() = false`): ilk hesap açıldı (`data_source = synthetic`, `journal_id` boş), 2. hesap `BACKTEST_LIMIT_EXCEEDED:1` ile reddedildi, defter bağlama ve `'ctrader'` CHECK ile reddedildi. İşlem geri alındı, sonrasında 1 hesap (adminin).
- **Geri alma gerekmedi.** Gerekirse sırası: önce uygulama (`git revert -m 1 b6aeb8a`; eski arayüz yeni sütunla uyumlu, yalnızca defter bağlayamaz), sonra `sql/supabase/rollbacks/202610180008_backtest_data_source.down.sql`.

## 4. Testler

| Kontrol | Sonuç |
|---|---|
| Birim testler (`node --test tests/*.test.js`) | **312 geçti / 0 kaldı** (306'ya 6 yeni: kapı, veri kaynağı kuralları, mapper, Supabase sütunları, sayfa içeriği) |
| `npm run build` | geçti (25 sayfa) |
| SQL harness, gerçek PostgreSQL 17 | **297 geçti / 0 kaldı** (`sql/verify/out/harness-output-pg17.txt`); PGlite bu turda çalıştırılmadı |
| `local-run.mjs` (00-06 ve 08, verify.sql, geri alma, yeniden ileri) | hepsi tamam, verify.sql 23 PASS (`out/local-run-pg17.txt`) |
| Canlı `verify.sql` | **23 PASS / 0 FAIL** |
| Duman testi, yerel arka uç, admin ve admin olmayan | 51 PASS / 0 FAIL ve 51 PASS / 0 FAIL |
| Duman testi, Supabase-taklit arka uç (Migration 08 taklitli), admin ve ücretsiz kullanıcı | 22 PASS / 0 FAIL ve 24 PASS / 0 FAIL |
| Pagecheck (eski master ile yeni build, 6 sayfa) | **6/6 PASS**; premium-dashboard ilk üç denemede Chrome oturumu düştüğü için sonuç vermedi (önceki turlarda da görülen sorun), dördüncüde PASS |
| İmzalı tarayıcı kontrolü (`asama-arayuz/webcheck/run.mjs`), build | admin/premium ve kullanıcı/ücretsiz: 24 PASS / 0 FAIL |
| İmzalı tarayıcı kontrolü, **canlı site** | kullanıcı/ücretsiz ve admin/premium: 24 PASS / 0 FAIL |

İmzalı tarayıcı kontrolü neyi kapsar: dashboard'dan navbar tıklamasıyla SPA geçişi, doğrudan adres ve yenileme (service worker aktif), hesap oluşturma, etiketler, kota göstergesi, diğer 5 sayfanın açılması, sayfa hatası ve 4xx/5xx toplama. Sahte oturum ve sahte veritabanıyla çalışır (supabase.co istekleri iptal edilir), yani canlıya hiçbir şey yazmaz. Sınırı: gerçek Supabase girişini ve gerçek RLS'i denemez; RLS tarafı yukarıdaki veritabanı denemesiyle ayrıca doğrulandı.

## 5. Yayın

- Commit'ler: `180addc` (kod), `b6aeb8a` (master merge), rapor commit'i bunların ardından.
- `wawejournal.com`: asset'ler eşleşiyor, `/backtest` ve doğrudan `/backtest.html` 200.

## 6. Karşılaşılan sorunlar ve çözümleri

1. **Eski `verify.sql` migration'dan sonra 9 FAIL verdi** (bölüm 3). Test güncellendi, tekrar 23/0.
2. **`local-run.mjs` önceden kırıktı:** migration'lar `supabase/migrations/`'e taşındığından eski yolu okuyordu. Düzeltildi.
3. **Harness fixture hatası:** ilk 08 senaryolarında silinmiş bir kullanıcıyı ve geçersiz defteri kullandım; fixture düzeltildi.
4. **Duman testinde `timeout` komutu yok (macOS)** ve ilk çalıştırmalar boş döndü; betik düzeltildi.
5. **Pagecheck'te Chrome oturumu düştü** (bkz. bölüm 4).
6. **SPA yerel sunucuda 404:** `python -m http.server` `/backtest` yolunu çözmüyor; imzalı kontrol için `.html` ekleyen küçük bir sunucu kullanıldı (Cloudflare zaten çözüyor).
7. **Dil anahtarı:** kontrol aracında ilk başta yanlış anahtar (`ww_lang`) yazmıştım, diller uygulanmıyordu; `ww_language` ile düzeltildi, ekran görüntüleri tr/en/de alındı.

## 7. Sizin kontrol etmeniz gerekenler

- [ ] Admin olmayan gerçek bir hesapla (ücretsiz plan) canlı `/backtest`: navbar linki görünüyor mu, hesap açılıyor mu, 2. hesapta yükseltme penceresi geliyor mu.
- [ ] Admin hesabınızda eski test hesabı (EURUSD, 4 işlem) duruyor ama artık deftere bağlı değil; isterseniz silin. Defterinizdeki 4 kopya işlem silindi.
- [ ] Safari ve Firefox (yalnızca Chrome ile denendi).
- [ ] Hesap formunda "cTrader verisi" seçeneğinin pasif ve "Yakında" etiketli görünmesi, tr/en/de metinler.
- [ ] Yeni yedeği saklayıp saklamayacağınız: `~/WaweJournal-Backups/20261021T062240Z/`.

## 8. Kalan işler

- **cTrader turu:** Migration 09 (`source_*` sütunları, `data_source` CHECK'ine `'ctrader'`, bağlama kuralı CHECK'i `ctrader` hesaplar için), `ctrader-candles` Edge Function (ortak/kilitli token yenileme), IndexedDB önbelleği, hesap formunda gerçek cTrader seçimi ve defter bağlama. Plan: `FAZ-E-VERI.md`. Sentetik hesaplar için `bt-sync` şu an ölü kod; cTrader turunda kullanılacak (kod ve testleri duruyor).
- Migration 06 kararı, premium dashboard dil hatası, `npm audit`, canlıdaki eski `get-candles` fonksiyonu, backend deploy bekleyenleri (önceki listede).
- `docs/backtest-v2/` içinde Migration 06 açığının tarifi var; repo herkese açılacaksa kaldırılmalı (KURALLAR §4).

---

# Önceki turlar

# Backtest v2: son rapor (2026-10-19, kesintisiz bitirme turu)

Branch `backtest-v2`, commitler `5e8a53a` (kod) ve `9c8cf7d` (rapor), ikisi de push edildi. master'a dokunulmadı. **Canlıya hiçbir şey yazılmadı, canlı veritabanına bağlanılmadı.**

## 1. Kısa özet

1. **Arayüz düzeltmelerinin hepsi bitti (madde 1-6)**: tam ekran replay düzeni, hesap ayarları penceresi, spread pip karşılığı, zaman ekseni etiketi, Astro araç çubuğu. Koyu ve açık tema, tr/en/de, 1440, 1920, 768 ve 390 genişlikte 24 kombinasyon headless Chrome'da denendi, yatay taşma yok.
2. **Migration 00'a `is_admin()` istisnası eklendi** (madde 8). SQL testleri PGlite'ta ve gerçek PostgreSQL 17'de **266 geçti / 0 kaldı**; 00-06 baştan sona, geri alma ve yeniden ileri çalıştırma da gerçek PG 17'de tamam.
3. **`PROJECT_OVERVIEW.md` yeni backtest sistemiyle güncellendi** (madde 17).
4. **Birim testler 306 geçti / 0 kaldı**, `npm run build` geçti, tarayıcı duman testi: admin 48 PASS / 0 FAIL, admin olmayan 4 PASS.
5. **Canlı adımlar yapılmadı (madde 7, 10-16): makinede veritabanı parolası, Supabase erişim token'ı ve `gh` yok.** Talimatınız gereği canlı veritabanı ve yayın adımları atlandı, kod işleri bitirildi. Yedek alınmadı, hiçbir migration canlıda çalıştırılmadı, `BACKEND` hâlâ `'local'`, master'a merge ve canlı site kontrolü yapılmadı. Revert gerekmedi.
6. **Pagecheck bu turda yeniden çalıştırılmadı** (son sonuç: 19 Ekim sabahı 6/6 PASS, `94bd087`). Merge zaten yapılmadığı için koşul kontrolü gerekmedi.
7. Kaldığınız yerden devam için adım adım liste `DEVAM.md`'de.

## 2. Madde madde

### Bölüm 1: arayüz

**1. Tam ekran düzen: ✅**
- Dosyalar: [backtest.css](../../public/interface/backtest/css/backtest.css), [backtest.astro](../../src/pages/backtest.astro).
- Dar kutunun nedeni: `.bt-main { margin: 0 auto }`, sütun yönlü flex kapta genişliği içeriğe daraltıyordu. `width: 100%` ve `max-width: 1920px` ile çözüldü; hesap listesi de bu genişliği kullanıyor, kartlar en az 300px.
- 1025px ve üstünde replay ekranı `calc(100dvh - 64px)` yüksekliğinde bir grid:
  - Grafik kalan alanın tamamını kaplıyor (`autoSize` + kapsayıcı `position: absolute`), pencere boyutu değişince yeniden boyutlanıyor.
  - Sağda `clamp(320px, 24vw, 360px)` genişliğinde sabit yan panel (bakiye kartı, SAT/AL, lot, SL/TP, kısayol notu). Panel taşarsa kendi içinde kayıyor.
  - Altta Açık pozisyonlar / İşlem geçmişi / İstatistikler: yükseklik `clamp(170px, 28vh, 300px)`, içerik uzarsa kendi içinde kayıyor, tablo başlığı yapışkan.
  - Ölçüm: 1440x900'de sayfa kaymıyor (belge yüksekliği 900 = pencere), grafik 1012x372; 1920x1080'de grafik 1478x503, tablolar 290px.
- 1024px ve altında düzen alt alta (grafik, yan panel, tablolar), grafik 300-560px yüksekliğinde. 768 ve 390'da yatay taşma yok.
- Kısayol notu yan panelin altına taşındı (sayfa kaydırmasın diye).
- Çok kısa pencerelerde (620px altı) tüm sayfa kayar; sert kırpma yok.

**2. Zaman ekseni ilk etiketi: ✅**
- Dosya: [backtest.js](../../public/interface/backtest/js/backtest.js) (`tickLabel`, `refreshClippedTicks`).
- Neden: Lightweight Charts, merkezi sol kenara yarım etiket genişliğinden yakın olan etiketi kırpar (`fixLeftEdge` kapalıyken hizalama yok). Biçimlendirici yalnızca zaman başına bir kez çağrılıp önbelleğe alındığı için konuma göre karar vermek mümkün değil.
- Çözüm: kenara fazla yakın tik boş etiket olur; görünür aralık değişince bu küme yeniden hesaplanır, değişirse etiketler yeniden biçimlendirilir.
- Doğrulama (piksel taraması): düzeltme kapalıyken 768x1024 açık Almanca'da 12/12 karede kenarda kesik etiket, düzeltmeyle 0/12. 1440x900'de 40 karelik kaydırmada 0.

**3. Hesap ayarları penceresi: ✅**
- Kök neden: `.modal-header`, `.modal-close`, `.modal-footer`, `.btn-modal-*` sınıfları diğer sayfalarda **sayfa CSS'inde** (strategies.css vb.) tanımlı, backtest sayfasına yüklenmiyordu. Stiller `backtest.css` içine `.bt-modal` kapsamıyla alındı.
- ✕ başlıkla aynı satırda sağ üstte. Başlık ve gövde aynı iç boşluğu (1.35rem) kullanıyor.
- Kaydet birincil (siyah zemin, mor çerçeve, `buttons.css` ortak stili), İptal ikincil (nötr çerçeve, soluk metin). Diğer sayfalardaki modal butonlarıyla aynı aile.
- **Başlangıç tarihi:** düzenleme modunda **gizli**, altında not var: "Başlangıç tarihi hesap oluşturulurken seçilir. Replay zamanını değiştirmek için araç çubuğundaki «Tarihe git» alanını kullan." Gerekçe: işlemi olan hesapta geri gitmek yasak, ileri gitmenin tek yolu zaten tarihe git (D13 kuralı); formda ikinci bir yol açmak çelişkiyi büyütürdü.
- **Zaman dilimi açıklaması:** "Sembol oluşturulduktan sonra değiştirilemez. Zaman dilimini grafiğin üstündeki araç çubuğundan değiştirebilirsin." Zaman dilimi araç çubuğundan değişiyor (kod bunu zaten kaydediyor), formdaki alan yalnızca gösterge.
- **`[hidden]` hatası bulundu ve düzeltildi:** `.bt-main [hidden] { display: none }` kuralı yalnızca `.bt-main` içini kapsıyordu, modaller dışarıda olduğu için `.bt-field { display: flex }` `hidden` özniteliğini eziyordu. Bu hem boş "Başlangıç tarihi" hem de yerel modda görünen "Bağlı hesap" alanının nedeniydi. Kural `.bt-modal [hidden]` için de eklendi.
- Pencere gövdesi `.modal-overlay` / `.modal-box` global sınıflarını kullanıyor (saf siyah koyu zemin, giriş animasyonu, açık temada beyaz).
- Telefonda sütunlar alt alta, düğmeler sarıyor.

**4. Spread pip karşılığı: ✅** Emir panelinde `0.00002 (0.2 pip)`. Pip değeri hesabın `spreadH` alanından (yüzde birlik) hesaplanıyor, sondaki sıfırlar atılıyor (0.2, 1.5, 0).

**5. Astro araç çubuğu: ✅** [astro.config.mjs](../../astro.config.mjs): `devToolbar: { enabled: false }`.

**6. Test ve ekran görüntüleri: ✅** Bkz. bölüm 4.

### Bölüm 2: canlıya hazırlık

**7. Canlıdan `evaluate_prop_firm_rules` tanımı ve GRANT'ler: ❌ atlandı.** Neden: canlıya salt okunur bağlanmak için veritabanı parolası veya Supabase erişim token'ı gerekiyor; ortamda ikisi de yok (`SUPABASE_*`, `PGPASSWORD`, `DATABASE_URL` tanımsız, `~/.supabase` içinde token yok, `psql`/`pg_dump`/`gh` kurulu değil). Keychain'e de başvurulmadı. Karşılaştırma 18 Ekim anlık görüntüsüne göre kaldı; asıl koruma Migration 00'daki DRIFT (md5) bloğu, canlı gövde farklıysa dosya çalışmadan durur.

**8. Çağıranların listesi ve sahiplik kontrolü: ✅ (repoda), ⚠️ canlıdaki çağıranlar doğrulanamadı**
- İstemci kodu (`public/`, `src/`): **çağıran yok.** Admin paneli de çağırmıyor.
- Edge Function'lar: **çağıran yok** (`create-payment` ve `nowpayment-webhook` yalnızca `dev_test_access_active`, `validate_referral_code`, `process_payment_finished` çağırıyor).
- Trigger'lar ve diğer SQL fonksiyonları: elimizdeki 18 Ekim anlık görüntüsündeki gövdelerde (`sql/db-snapshot/fn_*.sql`, trigger fonksiyonları dahil) **tek çağıran `sync_journal_trades(uuid, jsonb)`** (SECURITY DEFINER, satır 135). **Sınır:** anlık görüntü canlıdaki tüm fonksiyon gövdelerini içermiyor (`all_public_functions.json` yalnızca ad ve argüman listesi); kesin doğrulama için canlıda `RUN_ORDER.md` içindeki **P6** sorgusu çalıştırılmalı. Kendisi `auth.uid()` ile sahipliği denetliyor. İçeriden çağrıda `auth.uid()` JWT'den geldiği için son kullanıcıyı görür: kendi defteri geçer, başkasınınki 42501. Testle doğrulandı (SECURITY DEFINER sarmalayıcı, sahip ve başka kullanıcı).
- `sync_journal_trades` istemci koddan çağrılmıyor; ayrıca ikisi de repodaki migration'larda tanımlı değil, yalnızca canlıda var.
- **Service role / SQL Editor:** `auth.uid()` boşsa ve JWT rolü `anon`/`authenticated` değilse geçiyor (testli).
- **Düzeltme:** Migration 00'da `is_admin()` istisnası yoktu. Eklendi: `public.is_admin()` doğruysa (JWT `app_metadata.role = 'admin'`) başka birinin defteri de değerlendirilebilir. `is_admin` yoksa dosya `PRECONDITION` ile durur. Yeni 5 test: admin geçer, "admin kimliği ama admin iddiası yok" 42501, anon yetki hatası, SECURITY DEFINER sarmalayıcı (sahip geçer, başka kullanıcı 42501). Migration 06'nın DRIFT kontrolü yeni gövdeyi de kabul ediyor (üretilen md5'ler güncellendi).
- Dosyalar: [src/00.sql](sql/verify/src/00.sql), [build.mjs](sql/verify/build.mjs), [harness.mjs](sql/verify/harness.mjs), üretilen [migration 00](sql/supabase/migrations/202610180000_secure_evaluate_prop_firm_rules.sql), 06 ve 06.down (yalnızca md5), `RUN_ORDER.md`.

**9. Faz B, C, D migration sırası: ⚠️ sıra belirlendi, canlı şema karşılaştırması yapılamadı**
- Canlıda sırayla çalıştırılacaklar: **00, 01, 02, 04, 05.** 03 ve 07 Faz E, 06 bu turda yok.
- Her birinin rollback'i ters sırada: 05.down, 04.down, 02.down, 01.down, 00.down (`sql/supabase/rollbacks/`).
- Yerel kopya 18 Ekim anlık görüntüsünden kurulu; canlıyla farkı bilinmiyor. Migration'lar bu yüzden DRIFT korumalı (canlı gövde farklıysa çalışmadan durur).
- 00 değiştiği için yerelde baştan sona yeniden test edildi: PGlite harness 266/0, gerçek PostgreSQL 17 harness 266/0, `local-run.mjs` (00-06, verify.sql 19 PASS, geri alma, tekrar ileri) tamam.

### Bölüm 3: canlı veritabanı

**10. Yedek: ❌ atlandı** (kimlik bilgisi yok). `~/WaweJournal-Backups/` oluşturulmadı.
**11. Migration 00 canlıda: ❌ atlandı.** Açık canlıda hâlâ **açık** (anon `evaluate_prop_firm_rules` çağırabiliyor).
**12. Faz B, C, D migration'ları canlıda: ❌ atlandı.**
**13. `BACKEND = 'supabase'`: ❌ bilerek yapılmadı.** Tablolar canlıda olmadan bayrağı çevirmek, master'a yanlışlıkla merge edilirse sayfayı bozardı. Tek satır (`backtest.js`, `BACKEND` satırı, ~25). Testler yine de çalıştırıldı (306/0).
**14. Canlıyla uçtan uca deneme: ❌ atlandı.** Test hesabı veya kayıt oluşturulmadığı için temizlenecek bir şey yok. Yerelde, sahte veritabanıyla uçtan uca akış önceki turlarda denenmişti (bağla, taşı, kaldır, "Backtest" rozeti, istatistikler sabit); bu turda tekrar edilmedi.

### Bölüm 4: yayın

**15. Merge: ❌ atlandı.** Koşullar: testler (✅ geçiyor), build (✅), pagecheck 6/6 (son sonuç ✅ ama bu turda yenilenmedi), **14. madde uçtan uca (❌ yapılamadı)**. Koşullardan biri sağlanmadığı için PR açılmadı, master'a dokunulmadı.
**16. Canlı site kontrolü: ❌ atlandı** (yayın yok).
**17. `PROJECT_OVERVIEW.md`: ✅** Yeni bölüm 5.7 (sayfa ve kütüphane tablosu, admin kapısı, migration tablosu, istatistik yalıtımı, test araçları); route tablosu, klasör yapısı, tablo ve Edge Function notları, `backtest_trades` ve `get-candles` durumu güncellendi. Belge, sistemin **henüz üretimde olmadığını** açıkça söylüyor.

## 3. Canlı veritabanı

- Yedek: **alınmadı.** Yer ve boyut yok.
- Çalıştırılan migration: **yok.**
- Geri alınan: **yok.**
- Canlıda hâlâ açık olan güvenlik açığı: `evaluate_prop_firm_rules(uuid)` (anon çalıştırabiliyor, sahiplik kontrolü yok). Düzeltme (Migration 00, artık admin istisnasıyla) hazır ve yerelde test edildi; çalıştırılması canlı yazma gerektiriyor.

## 4. Testler ve ekran görüntüleri

| Kontrol | Sonuç |
|---|---|
| Birim testler (`node --test tests/*.test.js`) | **306 geçti / 0 kaldı** |
| `npm run build` | ✅ geçti (25 sayfa) |
| SQL harness, PGlite | **266 geçti / 0 kaldı** (`sql/verify/out/harness-output.txt`) |
| SQL harness, gerçek PostgreSQL 17.11 | **266 geçti / 0 kaldı** (`out/harness-output-pg17.txt`) |
| 00-06 + verify.sql + geri alma + yeniden ileri, PG 17 | tamam, verify.sql 19 PASS / 0 FAIL (`out/local-run-pg17.txt`) |
| Tarayıcı duman testi, admin | 48 PASS / 0 FAIL |
| Tarayıcı duman testi, admin olmayan ("Backtest yakında") | 4 PASS / 0 FAIL |
| Pagecheck 6/6 | bu turda **çalıştırılmadı**; son sonuç 6/6 PASS (`94bd087`) |
| Canlı uçtan uca | **yapılmadı** |
| Eksen etiketi taraması | düzeltmesiz 12/12 kesik kare, düzeltmeli 0/12 |

**Yeni duman testi doğrulamaları** ([driver.js](asama-arayuz/smoke/driver.js)): spread `0.xxxxx (0.2 pip)` biçiminde, düzenleme penceresinde başlangıç tarihi gizli ve not görünür, "Bağlı hesap" yerelde gizli.

**Ekran görüntüleri:** `~/WaweJournal-Screenshots/backtest-ui/` (122 dosya, 18 MB, repo dışında).
- Adlandırma: `<tema>-<dil>-<genişlik>x<yükseklik>-<ekran>.png`; ekranlar: `replay`, `replay-history`, `modal-edit`, `modal-new`, `list`.
- Kapsam: koyu ve açık × tr, en, de × 1440x900, 1920x1080, 768x1024, 390x844 (24 kombinasyon, her biri 5 ekran).
- Önceki durum: `BEFORE-dark-tr-1440x900-replay.png` ve `BEFORE-dark-tr-1440x900-modal-edit.png`.
- Düzen ölçümleri (hepsinde yatay taşma yok): 1440x900 grafik 1012x372, yan panel 345px; 1920x1080 grafik 1478x503, yan panel 360px; 768 ve 390'da alt alta.
- Sınır: ekran görüntüleri duman testi düzeneğiyle alındı (kimlik, plan ve toast taklit, Lucide ikonları yüklü değil: oynat/ileri düğmeleri boş kutu görünür, gerçek sayfada ikon var). Telefon görüntüleri yalnızca ilk ekran yüksekliği (tam sayfa değil).

## 5. Yayın

Merge yapılmadı, commitler `5e8a53a` ve `9c8cf7d` yalnızca `backtest-v2`'de. Canlı site kontrolü yok, revert gerekmedi. Cloudflare Pages dağıtımı yapılmadı.

## 6. Karşılaşılan sorunlar ve çözümleri

1. **Canlı kimlik bilgisi yok.** Çözüm: talimat gereği canlı adımlar atlandı, kod ve yerel doğrulama bitirildi, devam listesi `DEVAM.md`'ye yazıldı.
2. **Modal stilsizdi.** Sınıflar sayfa CSS'lerinde tanımlıydı. Çözüm: `.bt-modal` kapsamlı kopya. (Daha kalıcı çözüm, ortak modal stillerini `styles.css`'e taşımak, diğer sayfalara dokunmamak için yapılmadı.)
3. **`[hidden]` ezilmesi.** Modaller `.bt-main` dışında olduğu için kural uygulanmıyordu. Çözüm: kural genişletildi.
4. **Dar kutu.** Flex kapta `margin: auto` genişliği daraltıyordu. Çözüm: `width: 100%`.
5. **Eksen etiketi.** Konuma göre biçimlendirme denemesi işe yaramadı, çünkü grafik biçimlendiriciyi zaman başına bir kez çağırıp önbelleğe alıyor. Çözüm: kümeyi görünür aralık değişince yeniden hesaplayıp biçimlendirmeyi tetiklemek.
6. **Ekran görüntüsü düzeneği:** ilk 24'lük koşuda 11. kombinasyondan sonra grafik hiç açılmadı. Neden: tarayıcı oturumu paylaşıldığı için her koşu bir hesap ekliyordu ve admin (premium) kotası 10. Çözüm: her kombinasyon için ayrı tarayıcı bağlamı; eksik 14 kombinasyon yeniden alındı.
7. **PostgreSQL 17 harness'i** `wawe_local` veritabanı duruyorsa `role "anon" cannot be dropped` hatası veriyor. Çözüm: önce veritabanını silmek (`DEVAM.md`'ye yazıldı).
8. **Ortama göre notlar:** Chrome oturumu bazen uzun koşularda düştü (önceki turdaki gözlemle aynı), yeniden koşuyla geçti.

## 7. Sizin kontrol etmeniz gerekenler

- [ ] Gerçek tarayıcıda admin hesabıyla `/backtest`: tam ekran düzen, pencereyi küçültüp büyütünce grafik, tabloların kendi içinde kayması, Lucide ikonlarının görünmesi.
- [ ] Hesap ayarları penceresi: ✕, Kaydet/İptal görünümü, düzenlemede "Başlangıç tarihi" notu, "Bağlı hesap" alanının yerelde görünmemesi.
- [ ] Kaydırılmış grafikte sol kenarda kesik tarih etiketi kalmadığını gözle bakın (özellikle M5/M15).
- [ ] Safari ve Firefox (yalnızca Chrome ile denendi).
- [ ] Admin olmayan hesapla `/backtest`: "Backtest yakında" ekranı.
- [ ] Canlı adımlar için: veritabanı parolası veya Supabase token'ı (yalnızca o terminalde ortam değişkeni olarak) verin ya da SQL Editor'da `DEVAM.md`'deki sırayla çalıştırın. **Migration dosyaları şu an `docs/backtest-v2/sql/supabase/migrations/` altında; `KURALLAR.md` §2'deki `supabase/migrations/` yoluna taşınmadı** (canlıya çalıştırmadan önce karar verin; `db push` kullanılmaz).
- [ ] Canlı açık (evaluate_prop_firm_rules) hâlâ açık: Migration 00'ı en kısa sürede çalıştırmak istiyorsanız yedek + 00 yeterli, geri kalanından bağımsız.
- [ ] Ekran görüntülerine bakın: `~/WaweJournal-Screenshots/backtest-ui/`.

## 8. Kalan işler

- **Canlı adımlar** (madde 7, 10-16): yedek, migration 00, 01, 02, 04, 05, `BACKEND = 'supabase'`, canlı uçtan uca deneme, PR ve master'a merge, Cloudflare Pages, canlı site kontrolü. Sırayla `DEVAM.md`'de.
- **Faz E:** gerçek veri ve herkese açılış (lisans kararı: Binance CC BY-NC-SA, forex ve altın; Migration 03 ve 07; içe aktarıcı D13'e uyarlama; ArchiveSource; gece GitHub Actions işi).
- **Migration 06 kararı:** 6 kullanılmayan fonksiyonu silmek (açığı 00 zaten kapatıyor, 06 yalnızca temizlik; `sync_journal_trades` bunlardan biri ve `evaluate_prop_firm_rules`'ı çağırıyor, ikisi birlikte gider).
- **Premium dashboard dil hatası:** `en`/`de` seçiliyken Türkçe yedek metinler (`SABAH-RAPORU.md`, ön-var olan hata).
- **`npm audit`:** bu turda çalıştırılmadı.
- **Canlıdaki eski `get-candles` Edge Function'ı:** hâlâ duruyor, silinmesi canlı yazma.
- **Bekleyen backend deploy** (`ctrader-sync`, `create-payment`, `verify-auth`, `nowpayment-webhook`; Migration 0003 ve 0004'ün durumu belirsiz): bu tur dışı.
- **Repo herkese açılacaksa** `docs/backtest-v2/` içindeki Migration 06 açık tarifi kaldırılmalı (`KURALLAR.md` §4).
- **Küçük:** ortak modal stillerini `styles.css`'e taşımak; pagecheck'i yeniden koşturmak (merge öncesi).


---

# Canlı tur (2026-10-19 gece)

**Özet:** Bağlantı kuruldu, yedek alındı ve doğrulandı, **Migration 00 canlıda çalıştı ve doğrulandı (açık kapandı)**. Migration 01, `backtest_trades` içindeki 1 satır nedeniyle koruması tarafından durdu; bağımlı 02, 04, 05, `BACKEND` geçişi, merge ve yayın kuraldaki gibi atlandı. Pagecheck 6/6 PASS, birim testler 306/0. Devam için tek karar: o 1 satırın silinmesi.

| Madde | Sonuç |
|---|---|
| 0 Bağlantı | ✅ PostgreSQL 17.6, rol `postgres`. Değer `~/.wawe-db.env` içinde (chmod 600), repoda hiçbir yerde yok (taranıp doğrulandı). psql/pg_dump 17.11 `~/WaweJournal-pg17/tools/pg` altına kuruldu (micromamba/conda-forge) |
| 1 Taşıma | ✅ 8 migration `supabase/migrations/` altında (git mv), rollback ve test dosyaları docs'ta. Üretici ve test betikleri yeni yolu kullanıyor, harness 266/0. `db push` kullanılmadı |
| 2 Canlı tanım, P1-P6, karşılaştırma | ✅ `evaluate_prop_firm_rules` canlı gövdesi anlık görüntüyle aynı; 10 fonksiyonun hepsi aynı (P3 = true x10). GRANT'ler: anon, authenticated, service_role, postgres (PUBLIC yok). P6: veritabanında başka çağıran yok (0 satır). Karşılaştırma: `live-compare.mjs`, çıktı `sql/verify/out/live-compare.txt`: fonksiyon gövdeleri 15/15 aynı; farklar yerel sahte kopyanın sadeleştirmesinden (sütun tip kısıtları, bildirim/prop tabloları, bazı indeks ve politikalar, `is_admin`/diğer fonksiyonların PUBLIC EXECUTE'u). Migration'ları etkileyen fark yok; kanıtı aşağıdaki prova |
| Prova | ✅ Yedek yerel PG 17'ye geri yüklendi (gerçek canlı şema ve veri); 00, 01, 02, 04, 05 hepsi COMMIT, `backtest_v2_verify.sql` 19 PASS / 0 FAIL |
| 3 Yedek | ✅ `~/WaweJournal-Backups/20261019T201011Z/`: `full.dump` (pg_dump -Fc, tüm şemalar, 650 KB), `schema.sql` (499 KB), `roles.sql` (parolasız, 5,6 KB), `preflight.txt`, `SHA256SUMS`; toplam 1,1 MB, klasör `chmod 700`. Okunabilirlik: `pg_restore -l` 1010 öğe (69 tablo verisi); yerel PG 17'ye geri yüklendi, karşılaştırılan 7 tablonun satır sayıları canlıyla aynı (auth.users 7, journals 11, trades 114, user_profiles 7, strategies 5, payments 107, backtest_trades 1). Tek geri yükleme hatası yerelde olmayan `supabase_vault` eklentisi |
| 4 Migration 00 | ✅ Çalıştı (BEGIN…COMMIT). Doğrulama: anon `EXECUTE` yok, PUBLIC yok, gövde md5 = 00'ın gövdesi; anon çağrısı `permission denied for function` (HTTP 401, 42501, hem SQL'de hem REST'te); sahip çağrısı çalıştı; başka kullanıcı `FORBIDDEN`; admin başka defteri değerlendirebildi; service_role çalıştı |
| 5 Migration 01, 02, 04, 05 | ❌ 01 **ABORT** (`backtest_trades has 1 row(s)`), hiçbir şey değişmedi (rollback gerekmedi). 02, 04, 05 ORDER koruması gereği 01'e bağlı: atlandı |
| 6 `BACKEND`, canlı SQL doğrulamaları | ❌ atlandı (tablolar canlıda yok). Birim testler 306/0 çalıştırıldı. Arayüz testi sahibe kalır |
| 7 Pagecheck | ✅ 6/6 PASS (dashboard, premium-dashboard, trades, calendar, strategies, journals), yeni JS hatası 0, sızıntı denetimi çalışıyor |
| 8 Merge ve yayın | ❌ atlandı: merge koşulu "5-6. adımlardaki canlı SQL doğrulamaları başarılı" sağlanamadı. master'a dokunulmadı, Cloudflare Pages'e push yok, revert gerekmedi |

**01'in durma nedeni ve karar:** `public.backtest_trades` içinde 1 satır var: 2026-10-18 16:17 UTC tarihli, BTCUSDT long, -%1 SL; bir kullanıcıya (premium) ait eski backtest sayfasından kalma bir deneme işlemi. Satır `legacy-backtest_trades.csv` dosyasına ve tam yedeğe alındı. Migration 01 bu tabloyu zaten silecek, yani satır her halükârda yok olacak; ama canlı kullanıcı verisinin silinmesi için sahibin açık onayı olmadığından (otomatik izin denetimi de bu silmeyi engelledi) silmedim ve kuralınız gereği durdum. Satırı silmek için: `delete from public.backtest_trades where id = 'cda92d7f-f4b4-400d-a7fb-c9d59eb9f994';` sonra 01, 02, 04, 05.

**Sizin yapmanız gerekenler:** (1) Satırın silinmesine izin verin (ya da kendiniz silin); sonra oturum kaldığı yerden `DEVAM.md`'deki sırayla devam eder. (2) Admin hesabıyla arayüz denemesi (kullanıcı yapacak): yeni hesap, işlem aç/kapat, deftere bağla, "Backtest" rozeti, bağlantıyı kaldırınca silinme. (3) Yedek klasörünü güvenli yerde tutun: kullanıcı verisi içerir.

**Not (güvenlik):** Bağlantı adresindeki parola sohbet metninde göründü; işiniz bitince Supabase panelinden veritabanı parolasını yenilemenizi öneririm.


---

# Canlı tur 2 (2026-10-20): migration 01, 02, 04, 05, BACKEND geçişi, merge ve yayın

**Özet:** Tablo boştu, ikinci yedek alındı, **01, 02, 04 ve 05 canlıda çalıştı ve hepsinin kontrolleri geçti**, canlı fonksiyonel doğrulama **19 PASS / 0 FAIL** (kendini geri aldı, kalıntı yok). `BACKEND = 'supabase'` yapıldı, testler 306/0, build tamam, pagecheck 6/6, duman testi 48/0 ve 4/0. `backtest-v2` master'a merge edildi (`0849802`), push edildi, Cloudflare Pages yeni dosyaları sunuyor. Hata yok, atlanan adım yok, revert gerekmedi. **Yapılmayan tek şey: gerçek hesapla canlı arayüz denemesi** (kimlik bilgisi yok, sahibe kalır).

| Madde | Sonuç |
|---|---|
| 0 Salt okunur doğrulama | ✅ `backtest_trades` 0 satır (hem toplam hem `cda92d7f-...` kimliği 0). Bağlantı PG 17.6 |
| 1 İkinci yedek | ✅ `~/WaweJournal-Backups/20261020T133907Z/` (chmod 700): `full.dump` (pg_dump -Fc, 1010 öğe, 652 KB), `schema.sql`, `roles.sql` (parolasız), `rowcounts.txt`, `SHA256SUMS`; `dump-err.txt` boş. Satır sayıları: auth.users 7, journals 11, trades 114, user_profiles 7, strategies 5, payments 117, backtest_trades 0 |
| 2 Migration 01 | ✅ COMMIT. Kontroller: `to_regclass('public.backtest_trades')` NULL; gövdesinde adı geçen fonksiyon 0; `reset_user_data` md5 doğru; SECURITY DEFINER, `search_path=public`, ACL'de anon ve PUBLIC yok |
| 3 Migration 02 | ✅ COMMIT. 2 tabloda RLS açık; 8 politika (hepsi `authenticated`); 7 + 12 CHECK, 2 pkey, 4 FK; 6 indeks (2 pkey + 4 `idx_*`); 3 trigger; `reset_user_data` ve `delete_journal` md5 doğru, anon ve PUBLIC EXECUTE yok; `check_*` fonksiyonlarında yalnızca postgres ve service_role; trigger fonksiyonu sahibi RLS'i atlıyor |
| 4 Migration 04 | ✅ COMMIT. 2 trigger (relink'te WHEN koşulu var); `backtest_accounts_cleanup_trades()` SECURITY DEFINER, ACL postgres ve service_role; yetim ayna satır 0 |
| 5 Migration 05 | ✅ COMMIT. `list_journals` ve `get_platform_stats` md5 doğru; ACL beklendiği gibi (`list_journals` anon'suz, `get_platform_stats` anon'lu); `get_platform_stats()` totalTrades 114 = doğrudan sayım (canlı 114, backtest 0) |
| 6 `backtest_v2_verify.sql` (canlı) | ✅ **19 PASS / 0 FAIL**, işlem kendini geri aldı. Önce ve sonra sayılar aynı (auth.users 7, journals 11, trades 114, user_profiles 7, backtest_accounts 0, backtest_account_trades 0) |
| 7 `BACKEND = 'supabase'` | ✅ `backtest.js` satır 25 artık `window.WW_BT_BACKEND === 'local' ? 'local' : 'supabase'`. Yerel mod yalnızca duman testi içindir; `smoke/make.py` varsayılan olarak `local` ayarlıyor, `?backend=supabase` ile yok |
| 8 Testler | ✅ `node --test tests/*.test.js` **306/0**; `npm run build` 25 sayfa; duman testi admin **48 PASS / 0 FAIL**, admin olmayan **4 PASS / 0 FAIL** |
| 9 Pagecheck | ✅ **6/6 PASS** (dashboard, premium-dashboard, trades, calendar, strategies, journals): eski build (`50f92a8`) = yeni build, backtest satırı olsa da olmasa da; yeni JS hatası 0; sızıntı denetimi çalışıyor. Premium dashboard'da bilinen dil karışıklığı notu yine çıktı, sayılar birebir aynı |
| 10 Merge | ✅ Koşulların hepsi sağlandı. `origin/master` zaten `backtest-v2`'nin atasıydı (yerel master geride kalmıştı), çakışma yok. Yerel master `origin/master`'a (`a16e597`) fast-forward edildi, sonra `--no-ff` merge commit **`0849802`**; ağaç `backtest-v2` ile birebir aynı. Merge sonrası tekrar: testler 306/0, build tamam. `git push origin master`: `a16e597..0849802` |
| 11 Cloudflare Pages ve canlı site | ✅ `https://wawejournal.com/interface/backtest/js/backtest.js` ve `backtest.css` canlıda yerel `dist` ile **aynı SHA-1** (yeni sürüm yayında; ilk denemede ~4 dk içinde). `/`, `/login`, `/dashboard`, `/premium-dashboard`, `/trades`, `/calendar`, `/strategies`, `/journals`, `/backtest`, `/settings`, `/pricing` hepsi HTTP 200 |
| 12 Canlı API kontrolü | ✅ anon `evaluate_prop_firm_rules` HTTP 401 (`has_function_privilege` = false); anon `get_platform_stats` HTTP 200 ve sayılar doğru (7 kullanıcı, 114 işlem); anon `backtest_accounts` okuması boş liste (RLS) |

**Başka bir sorun çıkmadı.** Atlanan adım yok, rollback çalıştırılmadı, revert gerekmedi.

**Gözlemler:**
- `payments` yedek arasında 107'den 117'ye çıktı: canlı kullanım, beklenen.
- `backtest_accounts` ve `backtest_account_trades` tablolarında `anon` rolünde Supabase'in varsayılan tablo yetkileri duruyor (INSERT, UPDATE, DELETE, TRUNCATE dahil); korumayı RLS sağlıyor (anon için politika yok, 8 politikanın hepsi `authenticated`) ve REST'te boş liste dönüyor. Diğer tablolarla aynı durum. İsterseniz ayrı bir sertleştirme migration'ı olarak `REVOKE ... FROM anon` eklenebilir; bu turda canlıya izinsiz yazma olmaması için yapılmadı.
- Canlıda hâlâ `get-candles` (eski) Edge Function'ı duruyor; silinmedi.

**Sizin yapmanız gerekenler:**
- [ ] **Admin hesabıyla gerçek canlı denemesi** (`https://wawejournal.com/backtest`): yeni hesap, işlem aç/kapat, deftere bağla, "Backtest" rozeti, istatistikler değişmiyor, bağlantıyı kaldırınca silinme, temizlik. Bu, gerçek oturumla yapılabilen tek kalan adım; hesap kotası veya RLS sorunu çıkarsa verify.sql zaten rollback'li geçtiği için büyük olasılıkla arayüz tarafıdır. Sorun olursa merge commit'i `git revert -m 1 0849802` ile geri alınabilir (veritabanı şeması geriye uyumlu kalır, eski sayfa tabloya bağımlı değildi).
- [ ] Admin olmayan hesapla `/backtest`: "Backtest yakında".
- [ ] Önceki turdaki gerçek tarayıcı kontrol listesi (bölüm 7) hâlâ geçerli; Safari ve Firefox hâlâ denenmedi.
- [ ] Yedek klasörlerini güvenli yerde tutun (kullanıcı verisi içerir): `20261019T201011Z` ve `20261020T133907Z`.
- [ ] **Veritabanı parolasını Supabase panelinden yenileyin** (önceki turda sohbette göründü); yenileyince `~/.wawe-db.env` dosyasını da güncelleyin.

**Kalan işler:** Faz E (lisans, Migration 03/07, içe aktarıcı, ArchiveSource, gerçek veri, herkese açılış); Migration 06 kararı; premium dashboard dil hatası; `npm audit`; eski `get-candles` silinmesi; bekleyen backend deploy; repo herkese açılacaksa `docs/backtest-v2/` içindeki Migration 06 açık tarifinin kaldırılması (KURALLAR §4). Not: Migration 00 çalıştığı için açık canlıda kapalı, 06 yalnızca temizlik.
