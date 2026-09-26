import { HttpError } from './auth.js';
import { isValidPortfolioImagePath } from './admin-validation.js';

const imageUrl = (path, config) => path.startsWith('static:')
  ? path.slice('static:'.length)
  : `${config.url}/storage/v1/object/public/site-portfolio/${path}`;

function checkedCollections(data) {
  const collections = data?.collections;
  if (!Array.isArray(collections) || collections.length > 80 || !Number.isInteger(data.version)) {
    throw new HttpError(503, '作品集設定暫時無法載入。', 'portfolio_unavailable');
  }
  const slugs = new Set();
  for (const item of collections) {
    if (!item || typeof item.slug !== 'string' || !item.slug.trim() || /[\\/?#]/.test(item.slug) || slugs.has(item.slug)
      || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 120
      || !['外拍', '棚拍'].includes(item.category) || typeof item.description !== 'string' || item.description.length > 1000
      || !Array.isArray(item.images) || item.images.length < 1 || item.images.length > 500
      || item.images.some((path) => !isValidPortfolioImagePath(path)) || new Set(item.images).size !== item.images.length
      || !isValidPortfolioImagePath(item.cover)
      || !Number.isInteger(item.totalImages) || item.totalImages < item.images.length || item.totalImages > 10000) {
      throw new HttpError(503, '作品集設定暫時無法載入。', 'portfolio_unavailable');
    }
    slugs.add(item.slug);
  }
  return collections;
}

export function adminPortfolioResult(data, config) {
  const collections = checkedCollections(data);
  return {
    version: data.version,
    collections: collections.map((item) => ({
      ...item,
      cover_url: imageUrl(item.cover, config),
      images: item.images.map((path) => ({ path, url: imageUrl(path, config) })),
    })),
  };
}

export function publicPortfolioResult(data, config) {
  const collections = checkedCollections(data);
  return {
    version: data.version,
    collections: collections.map((item) => ({
      slug: item.slug,
      title: item.title,
      category: item.category,
      description: item.description,
      cover: imageUrl(item.cover, config),
      images: item.images.map((path) => imageUrl(path, config)),
      totalImages: item.totalImages,
      href: `/portfolio/?collection=${encodeURIComponent(item.slug)}`,
    })),
  };
}
