# Migration incelemesi (adım 0.9), 2026-10-19 gece

**Yöntem.** SQL şablonları (`verify/src/`) ve üretilen dosyalar, 2026-10-18'de salt okunur sorgularla alınan canlı gövdelerle (`db-snapshot/fn_*.sql`) satır satır karşılaştırıldı. Canlı veritabanına **bu gece yeniden bağlanılmadı**: `supabase db query --linked` Management API üzerinden geçici bir CLI giriş rolü oluşturuyor ve `KURALLAR.md` §1 bunun sahibe önceden söylenmesini şart koşuyor. Bunun yerine her migration'ın çalışma anındaki **DRIFT korumaları** (canlı gövdenin md5'i) gerçek denetimi yapar: gövde 18 Ekim'den beri değiştiyse migration durur.

**İncelenen:** 00 (yeni), 01, 02 (tablolar, kısıtlar, RLS, 2 tetikleyici, `reset_user_data`, `delete_journal`, ACL'ler), 04, 05, 06 ve rollback'leri; `calc_trade_pnl`, `set_default_journal`, `check_prop_account_limit`, `is_admin`, `list_journals` canlı gövdeleri; canlıdaki tetikleyici listesi.

## Bulgular

| # | Önem | Bulgu | Durum |
|---|---|---|---|
| 1 | Yüksek (önceden bilinen) | `evaluate_prop_firm_rules` anon'a açık ve sahiplik kontrolsüz | Migration 00 ile kapatılacak (hazır, canlıda çalıştırılmadı) |
| 2 | Düşük | 01'in ön koşulu "settings.js yedek yolu güncellendi" diyordu; Faz A'da `settings.js` bilerek değişmedi (Faz B adım 4). Eski yedek yolu `backtest_trades` silinince hata alır ama hata atılmadan yok sayılır (supabase-js `{error}` döner), zararsız | 01 başlığı düzeltildi |
| 3 | Bilgi | Sayfa, `replay_time`'ı mumun açılışına +60 sn olarak kaydeder. Tam o dakikada veri yoksa (ince boşluk) bir önceki mumdan hesaplanan zaman, kayıtlı değerden küçük çıkabilir. İşlemli hesapta veritabanı `BACKTEST_REPLAY_BACKWARD` ile reddeder, istemci bu hatayı yutar, kayıtlı değer büyük kalır. Tutarlı, işlem kaybı yok | Değişiklik gerekmedi |
| 4 | Bilgi | `calc_trade_pnl` pnl doluyken R/R'yi satırın `stop_loss`/`take_profit`/`entry_price` değerlerinden yeniden hesaplar. Kopya satırlara `initial_*` seviyeleri yazıldığı sürece (Faz C, `stage5-6.md`) R/R, backtest hesabıyla aynı çıkar | Faz C'de `mapTrade` ile birlikte yapılacak |

**Hata bulunmayan alanlar (kontrol edildi):** kota mantığı `check_prop_account_limit` ile aynı; değiştirilemez sütunlar ve hata kodları istemci kurallarıyla uyumlu (LocalStore testleri aynı kodları üretiyor); `exit_time >= entry_time` kısıtı motorun zaman üretimiyle uyumlu (elle kapanışta eşitlik); `pnl = gross_pnl - commission` motorun kuruşuyla birebir; `numeric(p,s)` sınırları motorun çıktı aralığına sığıyor; 04'teki `46` karakterlik önek hesabı doğru (9 + 36 + 1); `delete_journal` ve `reset_user_data` sürümleri canlı gövdeye tek, kasıtlı eklemeyle bağlı (FUNCTION_DIFFS.txt); 05 ve 02'nin ACL değişiklikleri `service_role`'ün yetkisini korur.

**Kalan risk:** canlı gövdelerin 18 Ekim'den bu yana değişmediği varsayımı. Koruma: her dosyadaki DRIFT bloğu. İsteğe bağlı, sabah sahip varken: README'deki P1–P6 salt okunur sorgularını bir kez çalıştırıp çıktıyı kaydetmek.
