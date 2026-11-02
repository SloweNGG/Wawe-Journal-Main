# Performans çalışması — ilerleme kaydı

Dal: `perf/tonight` (kaynak: `master`, 252c2db). Not: `origin/main`, `master` ile ortak geçmişi olmayan eski (Eylül 2026) bir
daldır; aktif kod `master`'da olduğu için iş `master`'dan açıldı.

**Durum:** Parça 1 devam ediyor (0. adım: ölçüm yapıldı)

## Başlangıç ölçümü

Ortam: Windows 11, Chrome (headless), Lighthouse 12.2.1, mobil, simüle yavaş 4G (Lighthouse varsayılan mobil ayarı:
150 ms RTT, 1.6 Mbps, 4× CPU). Sunucu: `npm run build && npm run preview` (`astro preview`, 127.0.0.1:4321).

> ⚠️ `astro preview` sıkıştırma yapmıyor ve `_headers`'ı uygulamıyor. Transfer boyutları bu yüzden **sıkıştırılmamış**
> boyutlardır (canlıda Cloudflare gzip/brotli ile çok daha küçük). `/dashboard.html` ve `/analytics.html` giriş istediği
> için oturumsuz tarayıcı sayfayı yükleyip `/login.html`'e yönleniyor; ölçüm sayfa + yönlendirme + giriş sayfasını kapsıyor.

| Sayfa | Puan | LCP | CLS | TBT | Transfer | İstek | Son adres |
|---|---|---|---|---|---|---|---|
| `/index.html` | 75 | 4.87 s | 0.000 | 51 ms | 963 KB | 29 | /index.html |
| `/dashboard.html` | 62 | 9.20 s | 0.001 | 10 ms | 2888 KB | 81 (42 script, 15 CSS) | /login.html |
| `/analytics.html` | 62 | 9.36 s | 0.001 | 21 ms | 2916 KB | 93 (53 script, 16 CSS) | /login.html |

### Tekrar ziyaret (önbellek davranışı)

Lighthouse her çalıştırmada önbelleği sıfırladığı için önbellek etkisini göremez. Bunun için Cloudflare Pages'i taklit eden
yerel bir sunucu (`_headers` kuralları + kural yoksa `max-age=0, must-revalidate` + ETag/304 + gzip) ve aynı tarayıcıda
art arda üç ziyaret yapan bir betik kullanıldı (betikler repoda değil, oturum scratchpad'inde). "Sunucuya giden" = service
worker'dan ya da disk önbelleğinden karşılanmayıp sunucuya giden yerel istek (200 veya 304 "değişti mi?").

| Sayfa | Soğuk: sunucuya giden / KB | Sıcak-1: sunucuya giden / KB | Sıcak-2: sunucuya giden / KB |
|---|---|---|---|
| `/index.html` | 21 / 962 | 2 / 1 | 2 / 1 |
| `/dashboard.html` → login | 57 / 1014 | 35 / 39 | 29 / 24 |
| `/analytics.html` → login | 68 / 1075 | 45 / 11 | 45 / 11 |

### Build çıktısı (başlangıç)

- `dist/` 26 MB (görseller dahil); tüm JS 2.62 MB, tüm CSS 1.40 MB (minify sonrası, sıkıştırmasız).
- HTML'de doğrudan referans verilen yerel dosyalar (analytics'in ES modül alt dosyaları hariç):
  - `index.html` (89 KB, gz 25): 4 JS + 3 CSS, 191 KB (gz 57 KB)
  - `dashboard.html` (132 KB, gz 29): 27 JS + 10 CSS, 806 KB (gz 212 KB)
  - `analytics.html` (85 KB, gz 21): 26 JS + 11 CSS, 768 KB (gz 198 KB) + `analytics.js`'in içe aktardığı ~10 modül
- Sürüm parametreleri dağınık: `i18n.js` 8 farklı `?v=` (ve 8 yerde hiç yok), `config.js` 16 yerde sürümsüz,
  `bundle.js` 12 yerde sürümsüz; quick-add yardımcıları (`broker-dictionary.js`, `broker-detector.js`,
  `fill-pairing.js`, `parser-v2.js`) hiç sürümsüz; analytics alt modülleri (`./helpers.js` vb.) sürümsüz.

## Yapılanlar

(doldurulacak)

## Atlananlar / riskler

(doldurulacak)

## Sonraki parça için notlar

(doldurulacak)

## Elle kontrol listesi

(doldurulacak)
