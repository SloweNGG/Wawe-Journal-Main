/* ============================================================
   WAWE JOURNAL — index-i18n.js (EN / TR / DE)
   ============================================================ */
(function () {
  'use strict';
  const STORAGE_KEY = 'ww_lang';

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
      footer: {
        desc: 'A modern trading journal built for professional traders.',
        links: 'Links', corporate: 'Corporate', contact: 'Contact',
        about: 'About', privacy: 'Privacy', terms: 'Terms',
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
          partial: 'Kısmi', limited: 'Kısıtlı · 5 mesaj/gün', pro_only: 'Pro planında'
        },
        us: { name: 'Wawe Journal', sub: 'Premium' },
        tz: { name: 'TradeZella', sub: 'Essential' },
        ew: { name: 'Edgewonk', sub: 'Tek plan' },
        ts: { name: 'TraderSync', sub: 'Pro' }
      },
      features: {
        tag: 'Özellikler',
        title: 'Tek bir <em>alışkanlık</em> etrafında kuruldu: yazmak.',
        desc: 'Ne olduğunu yeniden kurgulamak için daha az, neyin işe yaradığını fark etmek için daha çok zaman harca.',
        c1: { t: 'Hızlı işlem ekleme', d: 'Hızlı işlem ekleme özellikleriyle işlemlerini detaylı ve hızlı ekle.' },
        c2: { t: 'Gelişmiş metriklerle analiz', d: 'Sharpe ratio, profit factor gibi hesaplamalarla analizini güçlendir.' },
        c3: { t: 'Kazandıran stratejiyi bul', d: 'Stratejilerini ekle, en kazançlı stratejinin hangisi olduğunu grafikler söylesin.' },
        c4: { t: 'Seriyi sürdür, kaybetmeyi bırak', d: 'Over trade bildirim sistemleriyle aşırı trade etmekten kaçın.' }
      },
      plans: {
        tag: '💎 Fiyatlandırma',
        title: 'Herkes için <em>Bir Plan</em>',
        desc: 'Yeni başlıyor ol ya da profesyonel bir trader — sana uyan planı seç.',

        free_tag: 'free',
        free_name: 'Starter',
        free_period: ' / mo',
        free_desc: 'Temel özelliklerle başla.',
        free_f1: 'Trade kaydetme',
        free_f2: 'Takvim görünümü',
        free_f3: 'CSV / PDF import',
        free_f4: 'Temel grafikler',
        free_f5: 'Sınırlı AI analizi',
        free_btn: 'Start free',

        monthly_tag: 'most used',
        monthly_name: 'Premium monthly',
        monthly_period: ' / mo',
        monthly_desc: 'Tüm özellikleri aç.',
        monthly_f1: 'Bütün özellikler',
        monthly_f2: 'Gelişmiş özelleştirilebilir grafikler',
        monthly_f3: 'Tema ayarları',
        monthly_f4: 'Over trade bildirimleri',
        monthly_f5: 'Gelişmiş strateji analizleri',
        monthly_f6: 'AI ile analiz etme / Wawe AI chat bot',
        monthly_f7: 'Wawe journalı özelleştirme',
        monthly_f8: 'Yer değiştirebilir grafikler',
        monthly_btn: 'Go premium',

        yearly_tag: 'best value',
        yearly_name: 'Premium yearly',
        yearly_period: ' / yr',
        yearly_desc: 'Yıllık %67 tasarruf et.',
        yearly_f1: 'Tüm premium özellikler',
        yearly_f2: '2 ay ücretsiz',
        yearly_btn: 'Buy yearly'
      },
      cta: {
        title: 'HAZIR MISIN?',
        desc: 'Bir trading günlüğü tutmak, kârlı traderların ortak alışkanlığıdır. Bugün başla ve farkı hisset.',
        button: 'Ücretsiz Hesap Oluştur →'
      },
      footer: {
        desc: 'Profesyonel traderlar için tasarlanmış modern bir trading günlüğü.',
        links: 'Bağlantılar', corporate: 'Kurumsal', contact: 'İletişim',
        about: 'Hakkımızda', privacy: 'Gizlilik', terms: 'Şartlar',
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
      stats: { total_users: 'Nutzer gesamt', total_trades: 'Protokollierte Trades', today_users: 'Heute neu', today_trades: 'Trades heute' },
      refs: { tag: 'Vertraut von', title: 'Namen, denen wir <em>vertrauen</em>', desc: 'Erfahrene Trader und Content Creator.', empty: 'Noch keine Referenzen.', error: 'Referenzen konnten nicht geladen werden.' },
      ai: {
        tag: '01 — KI-gestützte Analyse',
        title: 'Es liest dein Journal, damit du es nicht musst.',
        desc: 'Wawe scannt deine protokollierten Trades und deckt die Muster auf.',
        msg1: 'Deine Short-Trades am Donnerstag schließen zu 71% im Verlust.',
        msg2: 'Deine Breakout-Strategie war in den letzten 30 Tagen dein beständigstes Setup.',
        msg3: 'Wenn eine Position länger als 2 Stunden offen bleibt, sinkt deine Gewinnrate um 18%.',
        coming: 'Wawe KI-Chatbot — Bald verfügbar'
      },
      strategy: {
        tag: '02 — Strategie-Analytik',
        title: 'Sieh, welche Strategie wirklich Geld verdient.',
        desc: 'Markiere jeden Trade mit seiner Strategie und vergleiche Gewinnrate, R-Multiple und Volumen.',
        breakout: 'Breakout', pullback: 'Pullback', news_fade: 'News-Fade'
      },
      cal: {
        tag: '03 — Kalender & Beständigkeit',
        title: 'Disziplin zeigt sich als Muster, nicht als Stimmung.',
        desc: 'Eine Woche auf einen Blick — Gewinntage, Verlusttage und Tage ohne Trades.',
        mon: 'Mo', tue: 'Di', wed: 'Mi', thu: 'Do', fri: 'Fr', sat: 'Sa', sun: 'So'
      },
      cmp: {
        tag: 'Vergleich', title: 'Wie Wawe Journal abschneidet',
        desc: 'Öffentliche Preis- und Feature-Infos ab 2026.',
        foot: 'Quelle: öffentliche Preisseiten der Anbieter, 2026.',
        rows: {
          trades: 'Trade-Limit', strategies: 'Strategie-Tagging', charts: 'Erweiterte Charts',
          ai: 'KI-gestützte Analyse', chat: 'KI-Chat-Assistent',
          unlimited: 'Unbegrenzt', yes: 'Ja', no: 'Nein', coming: 'Ja (Bald)',
          partial: 'Teilweise', limited: 'Begrenzt · 5 Nachrichten/Tag', pro_only: 'Nur Pro-Plan'
        },
        us: { name: 'Wawe Journal', sub: 'Premium' },
        tz: { name: 'TradeZella', sub: 'Essential' },
        ew: { name: 'Edgewonk', sub: 'Einzelplan' },
        ts: { name: 'TraderSync', sub: 'Pro' }
      },
      features: {
        tag: 'Funktionen',
        title: 'Rund um eine <em>Gewohnheit</em> gebaut: aufschreiben.',
        desc: 'Weniger Zeit damit, das Geschehene zu rekonstruieren.',
        c1: { t: 'Schnelle Trade-Eingabe', d: 'Protokolliere Trades detailliert und schnell.' },
        c2: { t: 'Erweiterte Metriken', d: 'Sharpe Ratio, Profit Factor und mehr.' },
        c3: { t: 'Gewinn-Strategien finden', d: 'Charts zeigen, welche Strategie Geld verdient.' },
        c4: { t: 'Serien aufbauen, Over-Trading stoppen', d: 'Over-Trade-Alarme halten dich von Regelbrüchen ab.' }
      },
      plans: {
        tag: '💎 Preise',
        title: 'Ein Plan für <em>jeden</em>',
        desc: 'Ob Anfänger oder Profi — wähle den Plan, der zu dir passt.',

        free_tag: 'free',
        free_name: 'Starter',
        free_period: ' / Monat',
        free_desc: 'Beginne mit dem Wesentlichen.',
        free_f1: 'Trade-Protokollierung',
        free_f2: 'Kalenderansicht',
        free_f3: 'CSV / PDF Import',
        free_f4: 'Basis-Charts',
        free_f5: 'Begrenzte KI-Analyse',
        free_btn: 'Start free',

        monthly_tag: 'most used',
        monthly_name: 'Premium monthly',
        monthly_period: ' / Monat',
        monthly_desc: 'Alles freischalten.',
        monthly_f1: 'Alle Funktionen',
        monthly_f2: 'Erweiterte anpassbare Charts',
        monthly_f3: 'Theme-Einstellungen',
        monthly_f4: 'Over-Trade-Benachrichtigungen',
        monthly_f5: 'Erweiterte Strategie-Analytik',
        monthly_f6: 'KI-Analyse / Wawe AI Chatbot',
        monthly_f7: 'Wawe Journal anpassen',
        monthly_f8: 'Verschiebbare Charts',
        monthly_btn: 'Go premium',

        yearly_tag: 'best value',
        yearly_name: 'Premium yearly',
        yearly_period: ' / Jahr',
        yearly_desc: 'Spare 67% jährlich.',
        yearly_f1: 'Alle Premium-Funktionen',
        yearly_f2: '2 Monate gratis',
        yearly_btn: 'Buy yearly'
      },
      cta: {
        title: 'BEREIT?',
        desc: 'Ein Trading-Journal zu führen ist eine gemeinsame Gewohnheit profitabler Trader.',
        button: 'Kostenloses Konto erstellen →'
      },
      footer: {
        desc: 'Ein modernes Trading-Journal für professionelle Trader.',
        links: 'Links', corporate: 'Unternehmen', contact: 'Kontakt',
        about: 'Über uns', privacy: 'Datenschutz', terms: 'AGB',
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

  let currentLang = (localStorage.getItem(STORAGE_KEY) || detectLang());
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
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    apply();
    listeners.forEach(cb => { try { cb(lang); } catch (e) {} });
  }
  function getCurrentLanguage() { return currentLang; }
  function onChange(cb) { if (typeof cb === 'function') listeners.push(cb); }

  window.i18n = { t, apply, setLanguage, getCurrentLanguage, onChange };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})();