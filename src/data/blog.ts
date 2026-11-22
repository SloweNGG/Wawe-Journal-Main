// Blog yazıları: src/content/blog/*.md (İngilizce) + src/content/blog/tr/*.md, src/content/blog/de/*.md (çeviriler).
// Çeviri, İngilizce yazıyla AYNI dosya adını taşır (dosya adı = çeviri anahtarı); kendi slug'ı frontmatter'da olur.
// Sayfalar: /blog, /blog/<slug> (EN) ve /tr/blog, /tr/blog/<slug>, /de/blog, /de/blog/<slug>.
// Çevirisi olan yazıda hreflang bağlantıları kendiliğinden eklenir; çevirisi olmayan yazının yalnızca EN sürümü olur.
// Tarihler YYYY-MM-DD; "updated" içerik gerçekten değişince güncellenir (çevirilerde de).

export type BlogLang = 'en' | 'tr' | 'de';
export const BLOG_LANGS: BlogLang[] = ['en', 'tr', 'de'];
export const SITE = 'https://wawejournal.com';

export interface BlogFrontmatter {
  slug: string;
  title: string;
  /** <title> için kısa sürüm (| Wawe Journal eklenmez; 60 karakteri aşmasın) */
  seoTitle: string;
  description: string;
  date: string;
  updated?: string;
  /** Liste kartındaki kısa özet */
  summary: string;
  /** İlgili özellik sayfası (yazının sonundaki CTA) */
  cta: { href: string; label: string };
  /** true: the logo strip under the post also shows the prop firm rule presets */
  props?: boolean;
}

export interface BlogPost {
  /** Çeviri anahtarı: İngilizce dosya adı (uzantısız) */
  key: string;
  lang: BlogLang;
  fm: BlogFrontmatter;
  Content: any;
  minutes: number;
}

const MODS = import.meta.glob('../content/blog/**/*.md', { eager: true }) as Record<string, any>;

let cache: BlogPost[] | null = null;
function loadAll(): BlogPost[] {
  if (cache) return cache;
  cache = Object.entries(MODS).map(([file, m]) => {
    const rel = file.replace(/^.*\/content\/blog\//, '');
    const parts = rel.split('/');
    const lang = (parts.length > 1 ? parts[0] : 'en') as BlogLang;
    if (!BLOG_LANGS.includes(lang)) throw new Error(`[blog] bilinmeyen dil klasörü: ${rel}`);
    const raw: string = typeof m.rawContent === 'function' ? m.rawContent() : '';
    const words = raw.split(/\s+/).filter(Boolean).length;
    return {
      key: parts[parts.length - 1].replace(/\.md$/, ''),
      lang,
      fm: m.frontmatter as BlogFrontmatter,
      Content: m.Content,
      minutes: Math.max(1, Math.round(words / 230)),
    };
  });
  return cache;
}

export function allPosts(lang: BlogLang = 'en'): BlogPost[] {
  return loadAll()
    .filter((p) => p.lang === lang)
    .sort((a, b) => (a.fm.date < b.fm.date ? 1 : a.fm.date > b.fm.date ? -1 : a.fm.slug.localeCompare(b.fm.slug)));
}

/** Bu dilde yayınlanmış yazı var mı (liste sayfası ve hreflang için) */
export const hasBlog = (lang: BlogLang) => allPosts(lang).length > 0;

export const blogHome = (lang: BlogLang) => (lang === 'en' ? '/blog' : `/${lang}/blog`);
export const postPath = (p: BlogPost) => `${blogHome(p.lang)}/${p.fm.slug}`;
export const siteHome = (lang: BlogLang) => (lang === 'en' ? '/' : `/${lang}/`);

/** Aynı yazının bütün dillerdeki sürümleri: [{ hreflang, href }] (+ x-default = EN). Tek dilliyse boş. */
export function postAlternates(post: BlogPost) {
  const versions = loadAll().filter((p) => p.key === post.key);
  if (versions.length < 2) return [];
  const sorted = BLOG_LANGS.map((l) => versions.find((v) => v.lang === l)).filter(Boolean) as BlogPost[];
  const links = sorted.map((v) => ({ hreflang: v.lang, href: SITE + postPath(v) }));
  const en = sorted.find((v) => v.lang === 'en');
  if (en) links.push({ hreflang: 'x-default', href: SITE + postPath(en) });
  return links;
}

/** Liste sayfasının dil sürümleri */
export function indexAlternates() {
  const langs = BLOG_LANGS.filter(hasBlog);
  if (langs.length < 2) return [];
  return [
    ...langs.map((l) => ({ hreflang: l, href: SITE + blogHome(l) })),
    { hreflang: 'x-default', href: SITE + blogHome('en') },
  ];
}

const DATE_LOCALE: Record<BlogLang, string> = { en: 'en-US', tr: 'tr-TR', de: 'de-DE' };
export const fmtDate = (d: string, lang: BlogLang = 'en') =>
  new Date(d + 'T12:00:00Z').toLocaleDateString(DATE_LOCALE[lang], { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

/** Blog sayfalarının sabit metinleri (yazı içeriği .md dosyalarında) */
export const BLOG_UI = {
  en: {
    indexTitle: 'Trading Journal Blog: Guides for Better Trading',
    indexDescription: 'Practical trading guides from Wawe Journal: how to keep a trading journal, backtest a strategy and pass a prop firm challenge, with real numbers.',
    indexH1: 'Guides for better trading',
    indexLead: 'How to journal, review, backtest and protect a funded account, with real numbers instead of slogans.',
    blogName: 'Wawe Journal blog',
    glossary: 'Trading glossary →',
    tools: 'Free trading calculators →',
    minRead: (n: number) => `${n} min read`,
    updated: (d: string) => `Updated ${d}`,
    startFree: 'Start your journal free',
    moreGuides: 'More guides',
    ctaH: 'Put it into practice.',
    ctaP: 'Wawe Journal is a free trading journal with analytics, an AI coach, backtest replay and prop firm tracking.',
    ctaBtn: 'Start for free',
    logosAria: 'Supported platforms',
    logosH: 'Bring your trades from the platform you already use.',
    logosP: 'Auto-sync from cTrader, or import a statement from your broker or exchange. Every trade lands in one journal with the same metrics.',
    presets: 'Prop firm rule presets',
  },
  tr: {
    indexTitle: 'İşlem Günlüğü Blogu: Daha İyi Trading için Rehberler',
    indexDescription: 'Wawe Journal’dan pratik trading rehberleri: işlem günlüğü tutma, strateji backtest’i ve prop firma challenge’ını geçme, gerçek rakamlarla.',
    indexH1: 'Daha iyi trading için rehberler',
    indexLead: 'Günlük tutma, işlem analizi, backtest ve funded hesabı koruma: slogan yerine gerçek rakamlarla.',
    blogName: 'Wawe Journal blogu',
    glossary: 'Trading sözlüğü (EN) →',
    tools: 'Ücretsiz trading hesaplayıcıları (EN) →',
    minRead: (n: number) => `${n} dk okuma`,
    updated: (d: string) => `Güncellendi: ${d}`,
    startFree: 'Günlüğünü ücretsiz başlat',
    moreGuides: 'Diğer rehberler',
    ctaH: 'Şimdi uygulamaya geç.',
    ctaP: 'Wawe Journal; analiz, AI koç, backtest replay ve prop firma takibi sunan ücretsiz bir işlem günlüğü.',
    ctaBtn: 'Ücretsiz başla',
    logosAria: 'Desteklenen platformlar',
    logosH: 'İşlemlerini zaten kullandığın platformdan getir.',
    logosP: 'cTrader’dan otomatik senkronize et ya da broker veya borsandan ekstre içe aktar. Her işlem aynı metriklerle tek bir günlükte toplanır.',
    presets: 'Prop firma kural şablonları',
  },
  de: {
    indexTitle: 'Trading-Journal-Blog: Ratgeber für besseres Trading',
    indexDescription: 'Praxisnahe Trading-Ratgeber von Wawe Journal: Trading-Journal führen, Strategien backtesten und die Prop-Firm-Challenge bestehen – mit echten Zahlen.',
    indexH1: 'Ratgeber für besseres Trading',
    indexLead: 'Journal führen, Trades auswerten, backtesten und einen Funded-Account schützen – mit echten Zahlen statt Sprüchen.',
    blogName: 'Wawe Journal Blog',
    glossary: 'Trading-Glossar (EN) →',
    tools: 'Kostenlose Trading-Rechner (EN) →',
    minRead: (n: number) => `${n} Min. Lesezeit`,
    updated: (d: string) => `Aktualisiert am ${d}`,
    startFree: 'Journal kostenlos starten',
    moreGuides: 'Weitere Ratgeber',
    ctaH: 'Setz es in die Praxis um.',
    ctaP: 'Wawe Journal ist ein kostenloses Trading-Journal mit Auswertungen, KI-Coach, Backtest-Replay und Prop-Firm-Tracking.',
    ctaBtn: 'Kostenlos starten',
    logosAria: 'Unterstützte Plattformen',
    logosH: 'Hol deine Trades von der Plattform, die du schon nutzt.',
    logosP: 'Automatischer Sync aus cTrader oder Import eines Kontoauszugs von Broker oder Börse. Jeder Trade landet in einem Journal mit denselben Kennzahlen.',
    presets: 'Prop-Firm-Regelvorlagen',
  },
} satisfies Record<BlogLang, Record<string, unknown>>;
