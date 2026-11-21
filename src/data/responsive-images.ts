// Küçük sürümü üretilmiş görseller: kaynak adres → üretilen genişlikler (px).
// Dosyaları scripts/resize-images.mjs üretir (public/ içine `<ad>-<genişlik>w.webp`).
// Yeni görsel eklerken buraya yazın ve `node scripts/resize-images.mjs` çalıştırın.
export const VARIANTS: Record<string, { width: number; sizes: number[] }> = {
  // 1800x947 uygulama ekranları (laptop maketi, açılış bölümleri, destek, backtesting)
  '/images/landing/screen-dashboard.webp': { width: 1800, sizes: [600, 900, 1200] },
  '/images/landing/screen-trades.webp': { width: 1800, sizes: [600, 900, 1200] },
  '/images/landing/screen-strategies.webp': { width: 1800, sizes: [600, 900, 1200] },
  '/images/landing/screen-calendar.webp': { width: 1800, sizes: [600, 900, 1200] },
  '/images/landing/screen-backtest.webp': { width: 1800, sizes: [600, 900, 1200] },
  '/images/landing/screen-analytics.webp': { width: 1800, sizes: [600, 900, 1200] },
  // laptop maketinin çerçevesi ve tabanı
  '/images/landing/mba-lid.webp': { width: 2080, sizes: [640, 1040] },
  '/images/landing/mba-base.webp': { width: 2080, sizes: [640, 1040] },
  // 1600 genişlikteki destek sayfası görselleri
  '/images/landing/dashboard.webp': { width: 1600, sizes: [800, 1000] },
  '/images/landing/analytics.webp': { width: 1600, sizes: [800, 1000] },
  '/images/landing/backtest.webp': { width: 1600, sizes: [800, 1000] },
  '/images/support/settings-region.webp': { width: 1600, sizes: [800, 1000] },
  '/images/support/settings-danger.webp': { width: 1600, sizes: [800, 1000] },
};

export function variantPath(src: string, w: number): string {
  return src.replace(/\.webp$/, `-${w}w.webp`);
}

/** `<img srcset>` değeri; küçük sürümü yoksa undefined (Astro o zaman özniteliği hiç yazmaz). */
export function srcsetFor(src: string): string | undefined {
  const v = VARIANTS[src];
  if (!v) return undefined;
  return [...v.sizes.map((w) => `${variantPath(src, w)} ${w}w`), `${src} ${v.width}w`].join(', ');
}
