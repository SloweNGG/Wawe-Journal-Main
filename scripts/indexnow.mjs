// ============================================================
// INDEXNOW — yeni / değişen sayfaları Bing, Yandex, Seznam, Naver'a anında bildirir
// ============================================================
// Google IndexNow'u KULLANMAZ (Google için Search Console > URL denetimi > "Dizine eklenmesini iste").
// Kullanım (deploy canlıya çıktıktan SONRA; sayfa yayında değilse arama motoru 404 görür):
//   node scripts/indexnow.mjs                 → canlı sitemap'teki tüm adresler
//   node scripts/indexnow.mjs /pricing /about → yalnız bu adresler
// Anahtar dosyası: public/<KEY>.txt (içinde yalnız anahtar). Arama motoru sahipliği bu dosyayı okuyarak doğrular;
// dosyayı silmeyin, anahtarı değiştirirseniz dosya adını da değiştirin.
// ============================================================

const HOST = 'wawejournal.com';
const KEY = 'a5c980ab5e6ff6f86d617aa2288819fd';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

async function sitemapUrls() {
  const res = await fetch(`https://${HOST}/sitemap.xml`);
  if (!res.ok) throw new Error(`sitemap ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

const args = process.argv.slice(2);
const urlList = args.length
  ? args.map((p) => new URL(p, `https://${HOST}`).href)
  : await sitemapUrls();

// Anahtar dosyası yayında mı? Değilse arama motoru isteği 403 ile reddeder.
const keyRes = await fetch(KEY_LOCATION);
const keyText = keyRes.ok ? (await keyRes.text()).trim() : '';
if (keyText !== KEY) {
  console.error(`✗ Anahtar dosyası yayında değil ya da içeriği farklı: ${KEY_LOCATION} (${keyRes.status})`);
  process.exit(1);
}

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }),
});
// 200 = alındı, 202 = alındı (anahtar doğrulaması sürüyor); 4xx = hata
console.log(`IndexNow ${res.status} ${res.statusText} — ${urlList.length} adres`);
for (const u of urlList) console.log('  ' + u);
if (res.status >= 400) {
  console.error(await res.text());
  process.exit(1);
}
