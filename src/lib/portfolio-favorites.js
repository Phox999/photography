export const FAVORITES_LIMIT = 12;
export const FAVORITES_STORAGE_KEY = 'phox-portfolio-favorites-v1';
const SITE_ORIGIN = 'https://phox999.com';
const cleanText = (value, limit) => typeof value === 'string' && value.trim()
  && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value);

// Public portfolio assets only. Private client galleries and arbitrary remote
// URLs must never become thumbnail requests through localStorage or submissions.
export function normalizeFavoriteImage(value) {
  if (typeof value !== 'string' || !value || value.length > 512 || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, SITE_ORIGIN);
    if (url.username || url.password || url.search || url.hash) return null;
    const decoded = decodeURIComponent(url.pathname);
    if (/[\\?#\u0000-\u001f\u007f]/.test(decoded)) return null;
    if (url.origin === SITE_ORIGIN && value.startsWith('/assets/portfolio/') && !value.startsWith('//')
      && /^\/assets\/portfolio\/[^/]+\/[^/]+\.(?:jpg|jpeg|png|webp)$/i.test(decoded)
      && !decoded.includes('\\') && !decoded.split('/').some(part => part === '.' || part === '..')) return decoded;
    if (url.protocol === 'https:' && url.hostname.endsWith('.supabase.co')
      && /^\/storage\/v1\/object\/public\/site-portfolio\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/.test(url.pathname)) return url.href;
  } catch { /* Invalid encoding or URL. */ }
  return null;
}

export function normalizeFavorite(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !cleanText(value.slug, 120) || /[\\/?#]/.test(value.slug) || ['.', '..'].includes(value.slug)
    || !cleanText(value.title, 120) || !Number.isInteger(value.number) || value.number < 1 || value.number > 500) return null;
  const image = normalizeFavoriteImage(value.image);
  return image ? { slug: value.slug, title: value.title.trim(), image, number: value.number } : null;
}

export const favoriteKey = (item) => JSON.stringify([item.slug, item.image]);

export function normalizeFavorites(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  const keys = new Set();
  for (const raw of value.slice(0, 100)) {
    const item = normalizeFavorite(raw);
    if (!item || keys.has(favoriteKey(item))) continue;
    result.push(item); keys.add(favoriteKey(item));
    if (result.length === FAVORITES_LIMIT) break;
  }
  return result;
}

export function favoriteHref(item) {
  return `/portfolio/${encodeURIComponent(item.slug).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}/?photo=${encodeURIComponent(item.image)}`;
}

export function toggleFavorite(items, raw) {
  const item = normalizeFavorite(raw);
  if (!item) return { items, error: '這張照片暫時無法收藏。' };
  const key = favoriteKey(item);
  if (items.some(entry => favoriteKey(entry) === key)) return { items: items.filter(entry => favoriteKey(entry) !== key), added: false };
  if (items.length >= FAVORITES_LIMIT) return { items, error: `最多收藏 ${FAVORITES_LIMIT} 張，請先移除部分照片。` };
  return { items: [...items, item], added: true };
}

export function createFavoriteStore(getStorage = () => window.localStorage) {
  let items = [];
  let persistent = true;
  try { items = normalizeFavorites(JSON.parse(getStorage().getItem(FAVORITES_STORAGE_KEY) || '[]')); }
  catch { persistent = false; }
  return {
    read: () => items.map(item => ({ ...item })),
    persistent: () => persistent,
    save(next) {
      items = normalizeFavorites(next);
      try { getStorage().setItem(FAVORITES_STORAGE_KEY, JSON.stringify(items)); persistent = true; }
      catch { persistent = false; }
      return this.read();
    },
    sync(value) {
      try { items = normalizeFavorites(JSON.parse(value || '[]')); } catch { items = []; }
      return this.read();
    },
  };
}
