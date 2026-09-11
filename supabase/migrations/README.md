# Supabase migrations

`202608190001_security_baseline.sql` is a security hardening migration for
the existing Wawe Journal schema. It assumes these existing tables and columns:

- `user_profiles(id, email, username, plan, plan_expires_at, role, is_active)`
- `trades(user_id)`, `strategies(user_id)`, `backtest_trades(user_id)`
- `references(is_active)`, `payments(user_id)`

It has intentionally not been run against the hosted project: no database
admin credential or Supabase CLI login is available in this workspace.

The browser-side writes to `plan` and `plan_expires_at` have been removed from
the source. Apply the migration in the Supabase SQL Editor or with a linked
Supabase CLI project only after deploying that client change. Verify the first
registration and admin account immediately after applying it.


-------------------------

repomix commands for ai developments :

npx repomix --compress --remove-comments --ignore "node_modules,dist,.wrangler,.git,.next,build"

--------------------------

# Premium Dashboard Dosyasının Komponentlerinin İşlevleri 



## 📊 Dosya İşlev Özeti

| # | Dosya Adı | Sorumluluk | Bağımlılık | Yan Etki |
|---|-----------|------------|------------|----------|
| 1 | **helpers.js** | Saf hesaplamalar, formatlama, veri dönüşümleri | Hiçbir şey (bağımsız) | Yok (pure functions) |
| 2 | **chart-renderers.js** | Tüm grafikleri oluşturma, güncelleme ve yönetme | helpers.js | DOM'a grafik çizer, ApexCharts/Lightweight Charts kullanır |
| 3 | **dashboard-manager.js** | Widget'lar, sürükle-bırak, iskelet ekranlar, stratejiler, export (CSV/PDF) | helpers.js, chart-renderers.js | DOM manipülasyonu, localStorage okuma/yazma, export dosyası oluşturur |
| 4 | **premium-dashboard.js** | Ana koordinasyon, global state yönetimi, init, event listener'lar | helpers.js, chart-renderers.js, dashboard-manager.js | DOM manipülasyonu, Supabase veritabanı okuma, oturum yönetimi |



## Debug Modunu Açmak İçin 

localStorage.setItem('ww_debug', 'true');
location.reload();

## Kapatmak İçin

localStorage.removeItem('ww_debug');
location.reload();


## Bir geliştirme yapmadan önce şunları yap!

Github repo yedeği al 

Eğer hata çıktıysa geri almak için bu komutu kullan 

git reset --hard



## Sızma Testleri İçin 

https://hostedscan.com/scans