export type PublishedPortfolioCollection = {
  slug: string;
  title: string;
  category: '外拍' | '棚拍';
  description: string;
  cover: string;
  images: string[];
  totalImages: number;
  href: string;
};

function validImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin === window.location.origin) {
      return url.pathname.startsWith('/assets/portfolio/') && !url.search && !url.hash;
    }
    return url.protocol === 'https:' && url.hostname.endsWith('.supabase.co')
      && /^\/storage\/v1\/object\/public\/site-portfolio\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(url.pathname)
      && !url.search && !url.hash;
  } catch { return false; }
}

export async function loadPublishedPortfolio(): Promise<PublishedPortfolioCollection[] | null> {
  try {
    const response = await fetch('/api/portfolio', { credentials: 'omit', cache: 'no-store' });
    if (!response.ok) return null;
    const value = await response.json();
    if (!Array.isArray(value.collections) || value.collections.length < 1 || value.collections.length > 80) return null;
    const collections = value.collections as Partial<PublishedPortfolioCollection>[];
    if (!collections.every((item) => item && typeof item.slug === 'string' && item.slug.length > 0 && !/[\\/?#]/.test(item.slug)
      && typeof item.title === 'string' && item.title.trim().length > 0 && item.title.length <= 120
      && (item.category === '外拍' || item.category === '棚拍')
      && typeof item.description === 'string' && item.description.length <= 1000
      && validImageUrl(item.cover)
      && Array.isArray(item.images) && item.images.length > 0 && item.images.length <= 500 && item.images.every(validImageUrl)
      && Number.isInteger(item.totalImages) && item.totalImages! >= item.images.length)) return null;
    return collections.map((item) => ({
      slug: item.slug!, title: item.title!, category: item.category!, description: item.description!,
      cover: item.cover!, images: item.images!, totalImages: item.totalImages!, href: `/portfolio/?collection=${encodeURIComponent(item.slug!)}`,
    }));
  } catch { return null; }
}
