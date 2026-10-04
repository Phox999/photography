import { HttpError, supabaseRequest } from './auth.js';
import { publicPortfolioResult } from './portfolio-images.js';
import { FAVORITES_LIMIT, favoriteKey, normalizeFavorite, normalizeFavoriteImage } from '../src/lib/portfolio-favorites.js';

export function validateFavoriteReferences(value = []) {
  if (!Array.isArray(value) || value.length > FAVORITES_LIMIT) throw new HttpError(400, '參考作品最多 12 張。', 'invalid_favorites');
  const items = value.map(normalizeFavorite);
  if (items.some(item => !item) || new Set(items.map(favoriteKey)).size !== items.length) throw new HttpError(400, '參考作品格式不正確，請重新挑選。', 'invalid_favorites');
  return items;
}

export async function resolveFavoriteReferences(config, items) {
  if (!items.length) return [];
  // Resolve against published data, never a client-supplied URL. This prevents
  // private gallery exposure, arbitrary thumbnails, and stale photo indices.
  const { data } = await supabaseRequest(config, '/rest/v1/rpc/get_public_portfolio_content', { method: 'POST', body: {} });
  const collections = publicPortfolioResult(data, config).collections;
  return items.map(item => {
    const collection = collections.find(collection => collection.slug === item.slug);
    const index = collection?.images.findIndex(image => normalizeFavoriteImage(image) === item.image) ?? -1;
    if (!collection || index < 0) throw new HttpError(400, `「${item.title}」有照片已更新或下架，請移除該收藏後重試。`, 'favorite_unavailable');
    return { slug: collection.slug, title: collection.title, image: normalizeFavoriteImage(collection.images[index]), number: index + 1 };
  });
}
