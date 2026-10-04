export const SITE_ORIGIN = 'https://phox999.com';
export const SITE_NAME = 'phox999 photography';
export const DEFAULT_DESCRIPTION = 'phox999 photography 提供自然、真實、有故事感的人像互惠攝影合作，適合想累積形象作品、個人品牌內容或社群照片的你。';

export function normalizeCanonicalPath(pathname = '/') {
  const pathOnly = String(pathname).split(/[?#]/, 1)[0] || '/';
  if (!pathOnly.startsWith('/') || pathOnly.startsWith('//')) return '/';
  if (pathOnly === '/') return '/';
  return `${pathOnly.replace(/\/+$/, '')}/`;
}

export function canonicalUrl(pathname = '/') {
  return new URL(normalizeCanonicalPath(pathname), SITE_ORIGIN).href;
}

export function encodePortfolioSlug(slug) {
  return encodeURIComponent(slug).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function portfolioPath(slug) {
  return `/portfolio/${encodePortfolioSlug(slug)}/`;
}

export function decodePortfolioPath(pathname) {
  const match = pathname.match(/^\/portfolio\/([^/]+)\/?$/);
  if (!match) return { kind: 'not-portfolio' };
  let slug;
  try {
    slug = decodeURIComponent(match[1]);
  } catch {
    return { kind: 'bad-request' };
  }
  if (!slug.trim() || slug === '.' || slug === '..' || slug.length > 120 || /[\\/?#\u0000-\u001f\u007f]/.test(slug)) return { kind: 'bad-request' };
  return { kind: 'portfolio', slug, hasTrailingSlash: pathname.endsWith('/') };
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

export function safeJsonLd(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => ({
    '<': '\\u003C', '>': '\\u003E', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029',
  })[character]);
}

export function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]);
}

export function publicImageUrl(value) {
  if (typeof value !== 'string' || !value || value.length > 2048) return null;
  try {
    const url = new URL(value, SITE_ORIGIN);
    const isSiteAsset = url.origin === SITE_ORIGIN
      && url.pathname.startsWith('/assets/')
      && !url.search && !url.hash;
    const isPublicPortfolioStorage = url.protocol === 'https:'
      && url.hostname.endsWith('.supabase.co')
      && /^\/storage\/v1\/object\/public\/site-portfolio\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i.test(url.pathname)
      && !url.search && !url.hash;
    const isPublicHeroStorage = url.protocol === 'https:'
      && url.hostname.endsWith('.supabase.co')
      && /^\/storage\/v1\/object\/public\/site-hero\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i.test(url.pathname)
      && !url.search && !url.hash;
    return isSiteAsset || isPublicPortfolioStorage || isPublicHeroStorage ? url.href : null;
  } catch {
    return null;
  }
}
