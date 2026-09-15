/* ============================================================
   WAWE JOURNAL — index-i18n.js (EN / TR / DE)
   ============================================================ */
(function () {
  'use strict';
  const STORAGE_KEY = 'ww_language';
  const ALT_STORAGE_KEY = 'ww_lang';

  const translations = {
    en: {
      nav: { login: 'Login', register: 'Sign Up →', strategies: 'Strategies', pricing: 'Pricing', home: 'Home' },
      hero: {
        beta: 'BETA',
        title: 'Stop guessing which trades work.',
        subtitle: 'Log every trade, see your real edge, and drop the strategies that only feel right. Your data, your discipline.',
        start_free: 'Start Free →',
        login: 'Login',
        note: 'Analyze beyond the standards.',
        win_rate: 'WIN RATE',
        total_pnl: 'TOTAL P&L',
        current_price: 'XAUUSD'
      },
      stats: { total_users: 'Total Users', total_trades: 'Trades Logged', today_users: 'New Today', today_trades: 'Trades Today' },
      refs: { tag: 'Trusted By', title: 'Names We <em>Trust</em>', desc: 'Experienced traders and content creators we work with.', empty: 'No references added yet.', error: 'Failed to load references.' },
      ai: {
        tag: '01 — AI-powered analysis',
        title: "It reads your journal so you don't have to.",
        desc: "Wawe scans your logged trades and surfaces the patterns you'd otherwise miss.",
        msg1: "Your Thursday short trades close at a loss 71% of the time.",
        msg2: "Your breakout strategy has been your most consistent setup over the last 30 days.",
        msg3: "When a position stays open over 2 hours, your win rate drops by 18%.",
        coming: 'Wawe AI chatbot — Coming soon'
      },
      strategy: {
        tag: '02 — Strategy analytics',
        title: 'See which strategy is actually making money.',
        desc: 'Tag every trade with its strategy, then compare win rate, R-multiple and volume side by side.',
        breakout: 'Breakout', pullback: 'Pullback', news_fade: 'News-fade'
      },
      cal: {
        tag: '03 — Calendar & consistency',
        title: 'Discipline shows up as a pattern, not a mood.',
        desc: "A week at a glance — win days, loss days, and the days you didn't trade at all.",
        mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun'
      },
      cmp: {
        tag: 'Comparison',
        title: 'How Wawe Journal compares',
        desc: 'Public pricing and feature info as of 2026 — verify before deciding.',
        foot: "Source: providers' public pricing pages, 2026. Prices and content may change.",
        rows: {
          trades: 'Trade limit', strategies: 'Strategy tagging', charts: 'Advanced charts',
          ai: 'AI-powered analysis', chat: 'AI chat assistant',
          unlimited: 'Unlimited', yes: 'Yes', no: 'No', coming: 'Yes (Coming soon)',
          partial: 'Partial', limited: 'Limited · 5 msgs/day', pro_only: 'Pro plan only'
        },
        us: { name: 'Wawe Journal', sub: 'Premium' },
        tz: { name: 'TradeZella', sub: 'Essential' },
        ew: { name: 'Edgewonk', sub: 'Single plan' },
        ts: { name: 'TraderSync', sub: 'Pro' }
      },
      features: {
        tag: 'Features',
        title: 'Built around one <em>habit</em>: writing it down.',
        desc: 'Spend less time reconstructing what happened and more time recognizing what works.',
        c1: { t: 'Fast trade entry', d: 'Log trades in detail, fast.' },
        c2: { t: 'Advanced metrics', d: 'Sharpe ratio, profit factor, and deeper stats.' },
        c3: { t: 'Find winning strategies', d: 'Let charts tell you which strategy makes money.' },
        c4: { t: 'Build streaks, stop over-trading', d: 'Over-trade alerts keep you from breaking your rules.' }
      },
      plans: {
        tag: '💎 Pricing',
        title: 'A Plan for <em>Everyone</em>',
        desc: "Whether you're just starting out or a professional trader — choose the plan that fits you.",

        free_tag: 'free',
        free_name: 'Starter',
        free_period: ' / mo',
        free_desc: 'Start with the essentials.',
        free_f1: 'Trade logging',
        free_f2: 'Calendar view',
        free_f3: 'CSV / PDF import',
        free_f4: 'Basic charts',
        free_f5: 'Limited AI analysis',
        free_btn: 'Start free',

        monthly_tag: 'most used',
        monthly_name: 'Premium monthly',
        monthly_period: ' / mo',
        monthly_desc: 'Unlock everything.',
        monthly_f1: 'All features',
        monthly_f2: 'Advanced customizable charts',
        monthly_f3: 'Theme settings',
        monthly_f4: 'Over trade notifications',
        monthly_f5: 'Advanced strategy analytics',
        monthly_f6: 'AI analysis / Wawe AI chat bot',
        monthly_f7: 'Customize Wawe journal',
        monthly_f8: 'Movable charts',
        monthly_btn: 'Go premium',

        yearly_tag: 'best value',
        yearly_name: 'Premium yearly',
        yearly_period: ' / yr',
        yearly_desc: 'Save 67% annually.',
        yearly_f1: 'All premium features',
        yearly_f2: '2 months free',
        yearly_btn: 'Buy yearly'
      },
      cta: {
        title: 'READY?',
        desc: 'Keeping a trading journal is a common habit of profitable traders. Start today and feel the difference.',
        button: 'Create Free Account →'
      },

      common: {
        back_home: '← Back to Home'
      },
      about: {
        title: 'About Us',
        founder_title: 'WaweDev',
        founder_desc: 'WaweDev was founded by a technology enthusiast passionate about financial markets and software.',
        mission_title: 'Our Mission',
        mission_desc: 'To empower traders to track their executions with data-driven clarity, support disciplined decision-making, and improve financial literacy.',
        vision_title: 'Our Vision',
        vision_desc: 'To become the most reliable, modern, and practical trading journal platform in the world, fostering real trader growth.',
        values_title: 'Our Values',
        val_sec_title: 'Security',
        val_sec_title: 'Security:',
        val_sec_desc: 'User data privacy and protection are our highest priorities.',
        val_trans_title: 'Transparency',
        val_trans_title: 'Transparency:',
        val_trans_desc: 'We are always clear and upfront about how your data is handled.',
        val_sim_title: 'Simplicity',
        val_sim_title: 'Simplicity:',
        val_sim_desc: 'We design clean, distraction-free interfaces that serve a purpose rather than bloated features.',
        val_inno_title: 'Innovation',
        val_inno_title: 'Innovation:',
        val_inno_desc: 'We continuously evolve using cutting-edge development tools and technology.',
        team_title: 'Our Team',
        team_desc: 'To be completely candid, there is no large team — I built this project as a solo developer. No matter what happens, I will never stop building and trying.',
        team_desc: 'To be completely candid, there is no large corporation here — I built this project as a solo developer. No matter what happens, I will never stop building and trying.',
        why_title: 'Why "Wawe"?',
        why_desc: '"Wawe" is a distinctive take on the word "wave". It symbolizes market cycles, the emotional fluctuations of traders, and the constantly moving financial landscape. Every wave is a new opportunity.'
      },
      contact: {
        title: 'Contact',
        get_in_touch: 'Get in Touch',
        email_label: 'Email',
        address_label: 'Address',
        hours_label: 'Working Hours',
        hours_weekdays: 'Weekdays: 09:00 - 18:00',
        hours_weekend: 'Weekends: Closed',
        social_media: 'Social Media',
        location_title: 'Location',
        support_title: 'Support Requests',
        support_desc: 'For technical help, account issues, or feature suggestions, feel free to drop us an email. We will get back to you promptly.',
        support_reply: 'Average response time: 24 hours (weekdays)'
      },
      privacy: {
        title: 'Privacy Policy',
        last_updated: 'Last updated: May 15, 2026',
        sec1_title: '1. Collected Data',
        sec1_desc: 'At Wawe Journal, we only collect data strictly necessary to deliver our services:',
        sec1_item1: 'Your email address (for account creation and security)',
        sec1_item2: 'Your trade entries (symbol, lot size, entry/exit prices, timestamps, notes)',
        sec1_item3: 'Your last active timestamp (for user activity status)',
        sec2_title: '2. Use of Data',
        sec2_desc: 'Collected data is exclusively used for the following operations:',
        sec2_item1: 'Managing your account and secure session authentication',
        sec2_item2: 'Logging and computing analytics for your trading records',
        sec2_item3: 'Generating your personal dashboard and visual charts',
        sec2_item4: 'Providing technical customer support',
        sec3_title: '3. Data Security',
        sec3_desc: 'Your data is securely stored and encrypted on Supabase infrastructure. Strict Row Level Security (RLS) policies guarantee that no user can ever access another user\'s private data.',
        sec4_title: '4. Third Parties',
        sec4_desc: 'Your data is never sold, shared, or rented to third parties. We exclusively use trusted enterprise infrastructure providers: Supabase (database & auth) and Cloudflare Pages (hosting).',
        sec5_title: '5. Account & Data Deletion',
        sec5_desc: 'If you wish to delete your account, please reach out via our contact page. Your account and all trade logs will be permanently deleted.',
        sec6_title: '6. Cookies',
        sec6_desc: 'Wawe Journal only uses essential technical session cookies required to keep you logged in.',
        sec7_title: '7. Contact',
        sec7_desc: 'For any privacy-related questions, contact us at:'
      },
      terms: {
        title: 'Terms of Service',
        last_updated: 'Last updated: May 15, 2026',
        sec1_title: '1. Service Usage',
        sec1_desc: 'Wawe Journal is an analytics platform created for individual trader use. By accessing or using our services, you agree to these terms.',
        sec2_title: '2. Account Security',
        sec2_desc: 'You are solely responsible for maintaining the confidentiality of your credentials. Notify us immediately if you suspect any unauthorized access.',
        sec3_title: '3. Prohibited Conduct',
        sec3_desc: 'The following activities are strictly prohibited on the platform:',
        sec3_item1: 'Attempting to access another user\'s private data or records',
        sec3_item2: 'Scraping or harvesting data via automated scripts or bots',
        sec3_item3: 'Using the service for unlawful or fraudulent operations',
        sec3_item4: 'Sending abnormal request volumes that overload system infrastructure',
        sec4_title: '4. Disclaimer (Important)',
        sec4_desc: 'Disclaimer: Wawe Journal is not an investment advisor, financial intermediary, or broker. WaweDev bears no liability for trading gains or losses. All trading decisions rest entirely with the user.',
        sec5_title: '5. Service Modifications',
        sec5_desc: 'WaweDev reserves the right to modify, enhance, or discontinue features with prior notice whenever feasible.',
        sec6_title: '6. Account Suspension',
        sec6_desc: 'Accounts that violate these terms of service may be suspended. To voluntarily terminate your account, reach out via our contact page.'
      },
      social: {
        title: '🌊 Wawe Social',
        desc: 'A dedicated social platform for disciplined traders. Coming soon…'
      },
      footer: {
        desc: 'A modern trading journal built for professional traders.',
        links: 'Links', corporate: 'Corporate', contact: 'Contact', contact_title: 'Contact',
        about: 'About', privacy: 'Privacy', terms: 'Terms', home: 'Home',
        copy: '© 2026 Wawe Journal. All rights reserved.',
        rights: 'All rights reserved.',
        credit: 'WaweJournal is a part of <a href="https://wawedev.com" target="_blank" rel="noopener" class="wawedev-link">wawedev</a> brand.'
      }
    },

    tr: {
      nav: { login: 'Giriş', register: 'Kayıt Ol →', strategies: 'Stratejiler', pricing: 'Fiyatlandırma', home: 'Anasayfa' },
      hero: {
        beta: 'BETA',
        title: 'Hangi işlemlerin işe yaradığını tahmin etmeyi bırak.',
        subtitle: 'Her işlemi kaydet, gerçek avantajını gör ve sadece iyi hissettiren stratejileri bırak. Verin senin, disiplinin senin.',
        start_free: 'Ücretsiz Başla →',
        login: 'Giriş',
        note: 'Standartların üzerinde analiz yapın.',
        win_rate: 'KAZANMA ORANI',
        total_pnl: 'TOPLAM K/Z',
        current_price: 'XAUUSD'
      },
      stats: { total_users: 'Toplam Kullanıcı', total_trades: 'Kaydedilen İşlem', today_users: 'Bugün Yeni', today_trades: 'Bugün İşlem' },
      refs: { tag: 'Güvenenler', title: 'Güvendiğimiz <em>İsimler</em>', desc: 'Birlikte çalıştığımız deneyimli traderlar ve içerik üreticileri.', empty: 'Henüz referans eklenmemiş.', error: 'Referanslar yüklenemedi.' },
      ai: {
        tag: '01 — AI destekli analiz',
        title: 'Günlüğünü senin yerine okuyor.',
        desc: 'Wawe kaydettiğin işlemleri tarar ve gözden kaçıracağın kalıpları yüzeye çıkarır.',
        msg1: "Perşembe günleri açtığın short işlemlerin %71'i zararla kapanıyor.",
        msg2: "Breakout stratejin, son 30 günde ortalama 1.8R ile en tutarlı setup'ın.",
        msg3: 'Pozisyon 2 saatten uzun açık kaldığında kazanma oranın %18 düşüyor.',
        coming: 'Wawe AI sohbet botu — Yakında'
      },
      strategy: {
        tag: '02 — Strateji analitiği',
        title: 'Hangi stratejinin gerçekten para kazandığını gör.',
        desc: 'Her işlemi stratejisiyle etiketle, ardından kazanma oranını, R-katını ve hacmi yan yana karşılaştır.',
        breakout: 'Breakout', pullback: 'Pullback', news_fade: 'Haber-fade'
      },
      cal: {
        tag: '03 — Takvim & istikrar',
        title: 'Disiplin bir ruh hali değil, bir kalıp olarak görünür.',
        desc: 'Bir haftaya bakış — kazanç günleri, kayıp günleri ve hiç işlem yapmadığın günler.',
        mon: 'Pzt', tue: 'Sal', wed: 'Çar', thu: 'Per', fri: 'Cum', sat: 'Cmt', sun: 'Paz'
      },
      cmp: {
        tag: 'Karşılaştırma', title: 'Wawe Journal nasıl karşılaştırılıyor',
        desc: '2026 itibarıyla kamuya açık fiyat ve özellik bilgileri — sağlayıcılar bunları değiştirir.',
        foot: "Kaynak: sağlayıcıların kamuya açık fiyatlandırma sayfaları, 2026.",
        rows: {
          trades: 'İşlem sınırı', strategies: 'Strateji ekleme', charts: 'Gelişmiş grafikler',
          ai: 'AI destekli analiz', chat: 'AI sohbet asistanı',
          unlimited: 'Sınırsız', yes: 'Var', no: 'Yok', coming: 'Var (Yakında)',
          partial: 'Kısmi', limited: 'Sınırlı · 5 mesaj/gün', pro_only: 'Sadece Pro planı'
        },
        us: { name: 'Wawe Journal', sub: 'Premium' },
        tz: { name: 'TradeZella', sub: 'Essential' },
        ew: { name: 'Edgewonk', sub: 'Tek plan' },
        ts: { name: 'TraderSync', sub: 'Pro' }
      },
      features: {
        tag: 'Özellikler',
        title: 'Tek bir <em>alışkanlık</em> etrafında inşa edildi: kaydetmek.',
        desc: 'Ne olduğunu yeniden hatırlamaya daha az, neyin işe yaradığını fark etmeye daha çok zaman ayır.',
        c1: { t: 'Hızlı işlem girişi', d: 'İşlemleri hızla ve detaylıca kaydet.' },
        c2: { t: 'Gelişmiş metrikler', d: 'Sharpe oranı, kâr faktörü ve daha derin istatistikler.' },
        c3: { t: 'Kazandıran stratejileri bul', d: 'Hangi stratejinin para kazandırdığını grafikler söylesin.' },
        c4: { t: 'Seriler yakala, aşırı işlem yapma', d: 'Over-trade uyarıları kurallarını çiğnemeni engeller.' }
      },
      plans: {
        tag: '💎 Fiyatlandırma',
        title: '<em>Herkes</em> İçin Bir Plan',
        desc: 'Yeni başlıyor ol ya da profesyonel bir trader — sana uyan planı seç.',
        free_tag: 'ücretsiz',
        free_name: 'Starter',
        free_period: ' / ay',
        free_desc: 'Temel özelliklerle başla.',
        free_f1: 'Trade kaydetme',
        free_f2: 'Takvim görünümü',
        free_f3: 'CSV / PDF import',
        free_f4: 'Temel grafikler',
        free_f5: 'Sınırlı AI analizi',
        free_btn: 'Ücretsiz Başla',
        monthly_tag: 'en çok tercih edilen',
        monthly_name: 'Premium Aylık',
        monthly_period: ' / ay',
        monthly_desc: 'Tüm özellikleri aç.',
        monthly_f1: 'Bütün özellikler',
        monthly_f2: 'Gelişmiş özelleştirilebilir grafikler',
        monthly_f3: 'Tema ayarları',
        monthly_f4: 'Over trade bildirimleri',
        monthly_f5: 'Gelişmiş strateji analizleri',
        monthly_f6: 'AI ile analiz etme / Wawe AI chat bot',
        monthly_f7: 'Wawe journalı özelleştirme',
        monthly_f8: 'Yer değiştirebilir grafikler',
        monthly_btn: 'Premium Ol',
        yearly_tag: 'en avantajlı',
        yearly_name: 'Premium Yıllık',
        yearly_period: ' / yıl',
        yearly_desc: 'Yıllık %67 tasarruf et.',
        yearly_f1: 'Tüm premium özellikler',
        yearly_f2: '2 ay ücretsiz',
        yearly_btn: 'Yıllık Satın Al'
      },
      cta: {
        title: 'HAZIR MISIN?',
        desc: 'Bir trading günlüğü tutmak, kârlı traderların ortak alışkanlığıdır. Bugün başla ve farkı hisset.',
        button: 'Ücretsiz Hesap Oluştur →'
      },
      common: {
        back_home: '← Ana Sayfaya Dön'
      },
      about: {
        title: 'Biz Kimiz?',
        founder_title: 'WaweDev',
        founder_desc: 'WaweDev, Bir teknoloji meraklısı tarafından kuruldu.',
        mission_title: 'Misyonumuz',
        mission_desc: 'Trader\'ların işlemlerini daha bilinçli bir şekilde takip etmelerini sağlamak, karar alma süreçlerini veriyle desteklemek ve finansal okuryazarlığı artırmak.',
        vision_title: 'Vizyonumuz',
        vision_desc: 'Dünyanın en güvenilir ve kullanışlı trading journal platformu olmak, trader\'ların gelişimine katkıda bulunmak.',
        values_title: 'Değerlerimiz',
        val_sec_title: 'Güvenlik',
        val_sec_title: 'Güvenlik:',
        val_sec_desc: 'Kullanıcı verilerinin gizliliği ve güvenliği en öncelikli konumuzdur.',
        val_trans_title: 'Şeffaflık',
        val_trans_title: 'Şeffaflık:',
        val_trans_desc: 'Verilerinizin nasıl kullanıldığını her zaman açıkça belirtiriz.',
        val_sim_title: 'Sadelik',
        val_sim_title: 'Sadelik:',
        val_sim_desc: 'Karmaşık özellikler yerine işe yarayan, sade arayüzler tasarlarız.',
        val_inno_title: 'Yenilikçilik',
        val_inno_title: 'Yenilikçilik:',
        val_inno_desc: 'Teknolojinin en güncel araçlarını kullanarak sürekli gelişiriz.',
        team_title: 'Ekibimiz',
        team_desc: 'Samimi olmak gerekirse bir ekibim yok tek kişi kurdum bu projeyi. Belki bu projede de öyle sonuçlanacak ama asla denemekten sıkılmam.',
        why_title: 'Neden "Wawe"?',
        why_desc: '"Wawe", İngilizce "wave" (dalga) kelimesinin özel bir yazımıdır. Piyasalardaki dalgalanmaları, trader\'ların iniş çıkışlarını ve sürekli hareket halindeki finans dünyasını temsil eder. Her dalga yeni bir fırsattır.'
      },
      contact: {
        title: 'İletişim',
        get_in_touch: 'Bize Ulaşın',
        email_label: 'E-posta',
        address_label: 'Adres',
        hours_label: 'Çalışma Saatleri',
        hours_weekdays: 'Hafta içi: 09:00 - 18:00',
        hours_weekend: 'Hafta sonu: Kapalı',
        social_media: 'Sosyal Medya',
        location_title: 'Konum',
        support_title: 'Destek Talepleri',
        support_desc: 'Teknik destek, hesap sorunları veya önerileriniz için bize e-posta gönderebilirsiniz. En kısa sürede dönüş yapacağız.',
        support_reply: 'Ortalama yanıt süresi: 24 saat (hafta içi)'
      },
      privacy: {
        title: 'Gizlilik Politikası',
        last_updated: 'Son güncelleme: 15 Mayıs 2026',
        sec1_title: '1. Toplanan Veriler',
        sec1_desc: 'Wawe Journal olarak, yalnızca hizmetlerimizi sunmak için gerekli olan verileri toplarız:',
        sec1_item1: 'E-posta adresiniz (hesap oluşturma için)',
        sec1_item2: 'İşlem verileriniz (sembol, lot, fiyatlar, tarih, notlar)',
        sec1_item3: 'Son aktif olma zamanınız (kullanıcı durumu için)',
        sec2_title: '2. Verilerin Kullanımı',
        sec2_desc: 'Topladığımız veriler yalnızca aşağıdaki amaçlar için kullanılır:',
        sec2_item1: 'Hesabınızı yönetmek ve kimlik doğrulaması sağlamak',
        sec2_item2: 'İşlemlerinizi kaydetmek ve analiz etmek',
        sec2_item3: 'Dashboard ve grafiklerinizi oluşturmak',
        sec2_item4: 'Teknik destek sağlamak',
        sec3_title: '3. Veri Güvenliği',
        sec3_desc: 'Verileriniz Supabase altyapısında şifrelenmiş olarak saklanır. Row Level Security (RLS) politikaları sayesinde hiçbir kullanıcı başka bir kullanıcının verilerini göremez.',
        sec4_title: '4. Üçüncü Taraflar',
        sec4_desc: 'Verileriniz asla üçüncü taraflarla paylaşılmaz veya satılmaz. Sadece Supabase (veritabanı) ve Cloudflare (barındırma) altyapıları kullanılır.',
        sec5_title: '5. Verilerinizi Silme',
        sec5_desc: 'Hesabınızı silmek isterseniz, lütfen iletişim sayfamız üzerinden bize ulaşın. Hesabınız ve tüm işlem verileriniz kalıcı olarak silinecektir.',
        sec6_title: '6. Çerezler (Cookies)',
        sec6_desc: 'Wawe Journal, yalnızca oturum yönetimi için gerekli olan teknik çerezleri kullanır.',
        sec7_title: '7. İletişim',
        sec7_desc: 'Gizlilik politikamızla ilgili sorularınız için:'
      },
      terms: {
        title: 'Kullanım Şartları',
        last_updated: 'Son güncelleme: 15 Mayıs 2026',
        sec1_title: '1. Hizmet Kullanımı',
        sec1_desc: 'Wawe Journal, bireysel trader\'lar için kişisel kullanım amacıyla geliştirilmiş bir trading journal platformudur. Hizmetlerimizi kullanarak aşağıdaki şartları kabul etmiş sayılırsınız.',
        sec2_title: '2. Hesap Güvenliği',
        sec2_desc: 'Hesap bilgilerinizin güvenliğinden siz sorumlusunuz. Şifrenizi kimseyle paylaşmayın. Hesabınızın yetkisiz kullanımı durumunda derhal bize bildirim yapmalısınız.',
        sec3_title: '3. Yasaklı Aktiviteler',
        sec3_desc: 'Aşağıdaki aktiviteler kesinlikle yasaktır:',
        sec3_item1: 'Başka kullanıcıların verilerine izinsiz erişmeye çalışmak',
        sec3_item2: 'Platformu otomatik botlar veya scriptler ile taramak',
        sec3_item3: 'Yasadışı faaliyetler için platformu kullanmak',
        sec3_item4: 'Sistemi aşırı yükleyecek talepler göndermek',
        sec4_title: '4. Sorumluluk Reddi (Önemli)',
        sec4_desc: 'Uyarı: Wawe Journal bir yatırım danışmanlığı veya broker hizmeti değildir. Platformda kaydedilen işlemlerden doğan kâr veya zarardan WaweDev sorumlu tutulamaz. Tüm finansal kararlar tamamen kullanıcıya aittir.',
        sec5_title: '5. Hizmet Değişiklikleri',
        sec5_desc: 'WaweDev, hizmetleri önceden bildirimde bulunmaksızın güncelleme, değiştirme veya durdurma hakkını saklı tutar.',
        sec6_title: '6. Hesap Kapatma',
        sec6_desc: 'Kullanım şartlarını ihlal eden hesaplar askıya alınabilir. Hesabınızı kapatmak için iletişim sayfası üzerinden bize ulaşabilirsiniz.'
      },
      social: {
        title: '🌊 Wawe Social',
        desc: 'Trader\'lar için özel sosyal medya platformu. Çok yakında…'
      },
      footer: {
        desc: 'Profesyonel traderlar için tasarlanmış modern bir trading günlüğü.',
        links: 'Bağlantılar', corporate: 'Kurumsal', contact: 'İletişim', contact_title: 'İletişim',
        about: 'Hakkımızda', privacy: 'Gizlilik', terms: 'Şartlar', home: 'Ana Sayfa',
        copy: '© 2026 Wawe Journal. Tüm hakları saklıdır.',
        rights: 'Tüm hakları saklıdır.',
        credit: 'WaweJournal, <a href="https://wawedev.com" target="_blank" rel="noopener" class="wawedev-link">wawedev</a> markasının bir parçasıdır.'
      }
    },

    de: {
      nav: { login: 'Anmelden', register: 'Registrieren →', strategies: 'Strategien', pricing: 'Preise', home: 'Startseite' },
      hero: {
        beta: 'BETA',
        title: 'Hör auf zu raten, welche Trades funktionieren.',
        subtitle: 'Protokolliere jeden Trade, erkenne deinen echten Vorteil und lass die Strategien fallen, die sich nur richtig anfühlen.',
        start_free: 'Kostenlos starten →',
        login: 'Anmelden',
        note: 'Analysiere über den Standards.',
        win_rate: 'GEWINNRATE',
        total_pnl: 'GESAMT P&L',
        current_price: 'XAUUSD'
      },
      stats: { total_users: 'Gesamtnutzer', total_trades: 'Protokollierte Trades', today_users: 'Neu heute', today_trades: 'Trades heute' },
      refs: { tag: 'Vertraut von', title: 'Namen, denen wir <em>vertrauen</em>', desc: 'Erfahrene Trader und Content Creator, mit denen wir zusammenarbeiten.', empty: 'Noch keine Referenzen hinzugefügt.', error: 'Referenzen konnten nicht geladen werden.' },
      ai: {
        tag: '01 — KI-gestützte Analyse',
        title: 'Liest dein Journal, damit du es nicht musst.',
        desc: 'Wawe scannt deine Trades und deckt Muster auf, die dir sonst entgehen würden.',
        msg1: 'Deine Short-Trades am Donnerstag schließen in 71 % der Fälle mit Verlust.',
        msg2: 'Deine Breakout-Strategie war in den letzten 30 Tagen dein konstantestes Setup.',
        msg3: 'Wenn eine Position länger als 2 Stunden offen bleibt, sinkt deine Gewinnrate um 18 %.',
        coming: 'Wawe KI-Chatbot — Demnächst'
      },
      strategy: {
        tag: '02 — Strategie-Analytik',
        title: 'Finde heraus, welche Strategie wirklich profitabel ist.',
        desc: 'Kennzeichne jeden Trade mit seiner Strategie und vergleiche Gewinnrate, R-Multiple und Volumen.',
        breakout: 'Breakout', pullback: 'Pullback', news_fade: 'News-Fade'
      },
      cal: {
        tag: '03 — Kalender & Konstanz',
        title: 'Disziplin zeigt sich als Muster, nicht als Laune.',
        desc: 'Eine Woche im Überblick — Gewinntage, Verlusttage und Tage ohne Trading.',
        mon: 'Mo', tue: 'Di', wed: 'Mi', thu: 'Do', fri: 'Fr', sat: 'Sa', sun: 'So'
      },
      cmp: {
        tag: 'Vergleich', title: 'Wie Wawe Journal im Vergleich abschneidet',
        desc: 'Öffentliche Preis- und Funktionsinformationen Stand 2026.',
        foot: 'Quelle: Öffentliche Preisseiten der Anbieter, 2026.',
        rows: {
          trades: 'Trade-Limit', strategies: 'Strategie-Tagging', charts: 'Erweiterte Charts',
          ai: 'KI-Analyse', chat: 'KI-Chat-Assistent',
          unlimited: 'Unbegrenzt', yes: 'Ja', no: 'Nein', coming: 'Ja (Demnächst)',
          partial: 'Teilweise', limited: 'Begrenzt · 5 Nachr./Tag', pro_only: 'Nur Pro-Plan'
        },
        us: { name: 'Wawe Journal', sub: 'Premium' },
        tz: { name: 'TradeZella', sub: 'Essential' },
        ew: { name: 'Edgewonk', sub: 'Einzeltarif' },
        ts: { name: 'TraderSync', sub: 'Pro' }
      },
      features: {
        tag: 'Funktionen',
        title: 'Rund um eine <em>Gewohnheit</em> gebaut: Aufschreiben.',
        desc: 'Weniger Zeit mit Rekonstruieren verbringen, mehr Zeit mit Erkennen, was funktioniert.',
        c1: { t: 'Schnelle Trade-Eingabe', d: 'Trades schnell und präzise protokollieren.' },
        c2: { t: 'Erweiterte Metriken', d: 'Sharpe Ratio, Profit Factor und tiefe Analysen.' },
        c3: { t: 'Gewinnstrategien finden', d: 'Charts zeigen dir, welche Strategie profitabel ist.' },
        c4: { t: 'Serien aufbauen, Overtrading stoppen', d: 'Over-Trade-Warnungen schützen deine Disziplin.' }
      },
      plans: {
        tag: '💎 Preise',
        title: 'Ein Plan für <em>Jeden</em>',
        desc: 'Egal ob Anfänger oder Profi — wähle den passenden Tarif.',
        free_tag: 'kostenlos',
        free_name: 'Starter',
        free_period: ' / Monat',
        free_desc: 'Beginne mit den Grundlagen.',
        free_f1: 'Trade-Protokollierung',
        free_f2: 'Kalenderansicht',
        free_f3: 'CSV / PDF Import',
        free_f4: 'Basis-Charts',
        free_f5: 'Begrenzte KI-Analyse',
        free_btn: 'Kostenlos starten',
        monthly_tag: 'beliebteste Wahl',
        monthly_name: 'Premium Monatlich',
        monthly_period: ' / Monat',
        monthly_desc: 'Alle Funktionen freischalten.',
        monthly_f1: 'Alle Funktionen',
        monthly_f2: 'Anpassbare Profi-Charts',
        monthly_f3: 'Theme-Einstellungen',
        monthly_f4: 'Over-Trade-Benachrichtigungen',
        monthly_f5: 'Erweiterte Strategie-Analytik',
        monthly_f6: 'KI-Analyse / Wawe AI Chatbot',
        monthly_f7: 'Wawe Journal anpassen',
        monthly_f8: 'Frei verschiebbare Charts',
        monthly_btn: 'Premium wählen',
        yearly_tag: 'bester Wert',
        yearly_name: 'Premium Jährlich',
        yearly_period: ' / Jahr',
        yearly_desc: 'Spare 67 % bei jährlicher Zahlung.',
        yearly_f1: 'Alle Premium-Funktionen',
        yearly_f2: '2 Monate geschenkt',
        yearly_btn: 'Jährlich kaufen'
      },
      cta: {
        title: 'BEREIT?',
        desc: 'Ein Trading-Journal zu führen ist eine Gewohnheit profitabler Trader. Starte noch heute.',
        button: 'Kostenloses Konto erstellen →'
      },
      common: {
        back_home: '← Zurück zur Startseite'
      },
      about: {
        title: 'Über uns',
        founder_title: 'WaweDev',
        founder_desc: 'WaweDev wurde von einem passionierten Technologie-Enthusiasten gegründet.',
        mission_title: 'Unsere Mission',
        mission_desc: 'Trader dabei zu unterstützen, ihre Trades datenbasiert und bewusst zu protokollieren, disziplinierte Entscheidungen zu treffen und Finanzkompetenz aufzubauen.',
        vision_title: 'Unsere Vision',
        vision_desc: 'Die weltweit zuverlässigste, modernste und benutzerfreundlichste Trading-Journal-Plattform zu werden.',
        values_title: 'Unsere Werte',
        val_sec_title: 'Sicherheit',
        val_sec_title: 'Sicherheit:',
        val_sec_desc: 'Datenschutz und Sicherheit unserer Nutzer haben höchste Priorität.',
        val_trans_title: 'Transparenz',
        val_trans_title: 'Transparenz:',
        val_trans_desc: 'Wir legen stets transparent dar, wie Ihre Daten verarbeitet werden.',
        val_sim_title: 'Einfachheit',
        val_sim_title: 'Einfachheit:',
        val_sim_desc: 'Wir entwickeln klare, ablenkungsfreie Oberflächen statt überladener Funktionen.',
        val_inno_title: 'Innovation',
        val_inno_title: 'Innovation:',
        val_inno_desc: 'Wir entwickeln uns kontinuierlich mit modernsten Webtechnologien weiter.',
        team_title: 'Unser Team',
        team_desc: 'Ehrlich gesagt gibt es kein großes Team – ich habe dieses Projekt als Solo-Entwickler aufgebaut. Egal wie es ausgeht: Ich höre nie auf zu bauen.',
        team_desc: 'Ehrlich gesagt gibt es kein großes Unternehmen – ich habe dieses Projekt als Solo-Entwickler aufgebaut. Egal wie es ausgeht: Ich höre nie auf zu bauen.',
        why_title: 'Warum "Wawe"?',
        why_desc: '"Wawe" ist eine besondere Schreibweise von "Wave" (Welle). Es symbolisiert Marktzyklen, die emotionalen Höhen und Tiefen jedes Traders und die dynamische Finanzwelt. Jede Welle ist eine neue Chance.'
      },
      contact: {
        title: 'Kontakt',
        get_in_touch: 'Kontaktieren Sie uns',
        email_label: 'E-Mail',
        address_label: 'Adresse',
        hours_label: 'Öffnungszeiten',
        hours_weekdays: 'Mo - Fr: 09:00 - 18:00',
        hours_weekend: 'Wochenende: Geschlossen',
        social_media: 'Soziale Medien',
        location_title: 'Standort',
        support_title: 'Support-Anfragen',
        support_desc: 'Für technischen Support, Kontofragen oder Feedback schreiben Sie uns eine E-Mail.',
        support_reply: 'Durchschnittliche Antwortzeit: 24 Stunden (werktags)'
      },
      privacy: {
        title: 'Datenschutzerklärung',
        last_updated: 'Zuletzt aktualisiert: 15. Mai 2026',
        sec1_title: '1. Erhobene Daten',
        sec1_desc: 'Bei Wawe Journal erheben wir nur Daten, die für die Bereitstellung unserer Dienste notwendig sind:',
        sec1_item1: 'Ihre E-Mail-Adresse (zur Authentifizierung und Registrierung)',
        sec1_item2: 'Ihre Trade-Daten (Symbol, Lot-Größe, Kurse, Zeitstempel, Notizen)',
        sec1_item3: 'Letzter Aktivitätszeitpunkt (für Kontostatus)',
        sec2_title: '2. Verwendung der Daten',
        sec2_desc: 'Die erhobenen Daten werden ausschließlich zu folgenden Zwecken genutzt:',
        sec2_item1: 'Verwaltung Ihres Kontos und sichere Authentifizierung',
        sec2_item2: 'Aufzeichnung und Analyse Ihrer Handelsdaten',
        sec2_item3: 'Erstellung Ihres Dashboards und visueller Charts',
        sec2_item4: 'Technischer Kundensupport',
        sec3_title: '3. Datensicherheit',
        sec3_desc: 'Ihre Daten werden verschlüsselt auf der Supabase-Infrastruktur gespeichert. Strikte Row Level Security (RLS)-Richtlinien stellen sicher, dass kein Nutzer fremde Daten einsehen kann.',
        sec4_title: '4. Dritte Parteien',
        sec4_desc: 'Ihre Daten werden niemals an Dritte verkauft oder weitergegeben. Wir nutzen ausschließlich vertrauenswürdige Infrastrukturanbieter: Supabase (Datenbank) und Cloudflare (Hosting).',
        sec5_title: '5. Löschung von Daten',
        sec5_desc: 'Wenn Sie Ihr Konto löschen möchten, kontaktieren Sie uns über die Kontaktseite. Alle Daten werden unwiderruflich gelöscht.',
        sec6_title: '6. Cookies',
        sec6_desc: 'Wawe Journal verwendet ausschließlich essenzielle technische Cookies zur Sitzungsverwaltung.',
        sec7_title: '7. Kontakt',
        sec7_desc: 'Bei Fragen zu unserer Datenschutzerklärung erreichen Sie uns unter:'
      },
      terms: {
        title: 'Nutzungsbedingungen',
        last_updated: 'Zuletzt aktualisiert: 15. Mai 2026',
        sec1_title: '1. Nutzung des Dienstes',
        sec1_desc: 'Wawe Journal ist eine Analyseplattform für private Trader. Durch den Zugriff auf unsere Dienste stimmen Sie diesen Bedingungen zu.',
        sec2_title: '2. Kontosicherheit',
        sec2_desc: 'Sie sind allein für die Geheimhaltung Ihrer Zugangsdaten verantwortlich. Benachrichtigen Sie uns sofort bei unbefugtem Zugriff.',
        sec3_title: '3. Unzulässige Handlungen',
        sec3_desc: 'Folgende Aktivitäten sind auf der Plattform streng untersagt:',
        sec3_item1: 'Der Versuch, unbefugt auf Daten anderer Nutzer zuzugreifen',
        sec3_item2: 'Automatisierte Abfragen per Bots oder Scrapern',
        sec3_item3: 'Die Nutzung der Dienste für rechtswidrige Zwecke',
        sec3_item4: 'Aktionen, die zu einer Überlastung der Systeminfrastruktur führen',
        sec4_title: '4. Haftungsausschluss (Wichtig)',
        sec4_desc: 'Warnung: Wawe Journal bietet keine Anlageberatung oder Broker-Dienstleistungen. WaweDev haftet nicht für finanzielle Gewinne oder Verluste. Alle Handelsentscheidungen liegen ausschließlich beim Nutzer.',
        sec5_title: '5. Leistungsänderungen',
        sec5_desc: 'WaweDev behält sich das Recht vor, Funktionen und Dienste bei Bedarf zu aktualisieren oder zu modifizieren.',
        sec6_title: '6. Kontokündigung',
        sec6_desc: 'Konten, die gegen diese Bedingungen verstoßen, können gesperrt werden. Um Ihr Konto zu schließen, kontaktieren Sie uns über die Kontaktseite.'
      },
      social: {
        title: '🌊 Wawe Social',
        desc: 'Ein soziales Netzwerk exklusiv für Trader. Demnächst verfügbar…'
      },
      footer: {
        desc: 'Ein modernes Trading-Journal für professionelle Trader.',
        links: 'Links', corporate: 'Unternehmen', contact: 'Kontakt', contact_title: 'Kontakt',
        about: 'Über uns', privacy: 'Datenschutz', terms: 'AGB', home: 'Startseite',
        copy: '© 2026 Wawe Journal. Alle Rechte vorbehalten.',
        rights: 'Alle Rechte vorbehalten.',
        credit: 'WaweJournal ist Teil der Marke <a href="https://wawedev.com" target="_blank" rel="noopener" class="wawedev-link">wawedev</a>.'
      }
    }
  };

  function detectLang() {
    const b = (navigator.language || 'en').toLowerCase();
    if (b.startsWith('tr')) return 'tr';
    if (b.startsWith('de')) return 'de';
    return 'en';
  }

  function getSavedLang() {
    try {
      return localStorage.getItem(STORAGE_KEY) || localStorage.getItem(ALT_STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  let currentLang = (getSavedLang() || detectLang());
  if (!translations[currentLang]) currentLang = 'en';
  const listeners = [];

  function getNested(obj, path) {
    return path.split('.').reduce((a, k) => (a && a[k] !== undefined ? a[k] : undefined), obj);
  }

  function t(key) {
    let v = getNested(translations[currentLang], key);
    if (v === undefined) v = getNested(translations.en, key);
    return v === undefined ? key : v;
  }

  function apply() {
    // Ana sayfaya dönme butonlarını otomatik algıla ve bağla
    document.querySelectorAll('.back-link a, .btn-back a, a.btn-ghost, a.btn-primary').forEach(el => {
      const txt = (el.textContent || '').trim();
      if (txt.includes('Ana Sayfa') || txt.includes('Back to Home') || txt.includes('Zurück zur Startseite')) {
        if (!el.getAttribute('data-i18n')) {
          el.setAttribute('data-i18n', 'common.back_home');
        }
      }
    });

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const v = t(el.getAttribute('data-i18n'));
      if (typeof v === 'string') el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const v = t(el.getAttribute('data-i18n-html'));
      if (typeof v === 'string') el.innerHTML = v;
    });
    document.documentElement.lang = currentLang;
  }

  function setLanguage(lang) {
    if (!translations[lang]) return;
    currentLang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
      localStorage.setItem(ALT_STORAGE_KEY, lang);
    } catch (e) {}
    apply();
    listeners.forEach(cb => { try { cb(lang); } catch (e) {} });
  }

  function getCurrentLanguage() { return currentLang; }
  function onChange(cb) { if (typeof cb === 'function') listeners.push(cb); }

  window.i18n = { t, apply, setLanguage, getCurrentLanguage, onChange };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})();