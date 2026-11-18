// Blog yazıları: src/content/blog/*.md (frontmatter aşağıdaki BlogFrontmatter). Yeni yazı = yeni .md dosyası.
// Sayfalar: /blog (liste) ve /blog/<slug>. Tarihler YYYY-MM-DD; "updated" içerik gerçekten değişince güncellenir.

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
}

export interface BlogPost {
  fm: BlogFrontmatter;
  Content: any;
  minutes: number;
}

export function allPosts(): BlogPost[] {
  const mods = import.meta.glob('../content/blog/*.md', { eager: true }) as Record<string, any>;
  return Object.values(mods)
    .map((m) => {
      const raw: string = typeof m.rawContent === 'function' ? m.rawContent() : '';
      const words = raw.split(/\s+/).filter(Boolean).length;
      return { fm: m.frontmatter as BlogFrontmatter, Content: m.Content, minutes: Math.max(1, Math.round(words / 230)) };
    })
    .sort((a, b) => (a.fm.date < b.fm.date ? 1 : a.fm.date > b.fm.date ? -1 : a.fm.slug.localeCompare(b.fm.slug)));
}

export const fmtDate = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
