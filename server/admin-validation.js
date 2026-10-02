import { HttpError, json } from './auth.js';

export const PAGE_SIZE = 20;
export const STATUSES = ['new', 'reviewing', 'contacted', 'closed'];
export const INQUIRY_FIELDS = 'id,name,contact_method,contact_account,collaboration_type,preferred_date,description,consent,status,admin_notes,created_at,updated_at,version';
export const CONTENT_FIELDS = 'id,announcement,announcement_enabled,faqs,hero_title,hero_copy,hero_image_paths,version,updated_at';
export const STATIC_HERO_IMAGE_PATHS = Object.freeze([
  'static:/assets/hero.webp',
  'static:/assets/hero-02.webp',
  'static:/assets/hero-03.webp',
  'static:/assets/hero-04.webp',
  'static:/assets/portfolio/6-20海邊jk_/IMG_9630.webp',
  'static:/assets/portfolio/照片分享/IMG_6114.webp',
  'static:/assets/portfolio/地雷系/LINE_ALBUM_202681_260921_7.webp',
  'static:/assets/portfolio/興華天橋/13.webp',
  'static:/assets/portfolio/maid/01.webp',
]);
const STORAGE_HERO_IMAGE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export function isValidHeroImagePath(path) {
  return typeof path === 'string' && (STATIC_HERO_IMAGE_PATHS.includes(path) || STORAGE_HERO_IMAGE_PATH.test(path));
}

const invalid = (message) => { throw new HttpError(400, message, 'invalid_input'); };

export function allowMethods(request, methods) {
  return methods.includes(request.method)
    ? null
    : json({ success: false, message: '不支援此操作。', code: 'method_not_allowed' }, 405, { Allow: methods.join(', ') });
}

export function parsePage(url) {
  const value = url.searchParams.get('page') ?? '1';
  if (!/^[1-9]\d{0,6}$/.test(value)) invalid('頁碼格式不正確。');
  return Number(value);
}

export function parseStatus(value) {
  if (typeof value !== 'string' || !STATUSES.includes(value)) invalid('請選擇有效的處理狀態。');
  return value;
}

export function parseId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    invalid('詢問單編號格式不正確。');
  }
  return value;
}

export function parseVersion(value) {
  if (!Number.isInteger(value) || value < 1 || value > 2147483646) invalid('資料版本不正確，請重新載入。');
  return value;
}

function plainText(value, limit, label, { required = false, noMarkup = false } = {}) {
  if (typeof value !== 'string') invalid(`${label}格式不正確。`);
  const text = value.trim();
  if (text.length > limit) invalid(`${label}不可超過 ${limit} 字。`);
  if (required && !text) invalid(`請填寫${label}。`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) invalid(`${label}包含不支援的字元。`);
  if (noMarkup && /[<>]/.test(text)) invalid(`${label}請使用純文字，勿加入 HTML 標籤。`);
  return text;
}

function objectBody(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('資料格式不正確。');
  if (Object.keys(body).some((key) => !keys.includes(key))) invalid('資料包含不支援的欄位。');
}

export function inquiryUpdate(body) {
  objectBody(body, ['status', 'admin_notes', 'version']);
  return {
    p_status: parseStatus(body.status),
    p_admin_notes: plainText(body.admin_notes, 4000, '管理備註'),
    p_version: parseVersion(body.version),
  };
}

export function contentUpdate(body) {
  objectBody(body, ['announcement', 'announcement_enabled', 'faqs', 'hero_title', 'hero_copy', 'hero_image_paths', 'version']);
  if (typeof body.announcement_enabled !== 'boolean') invalid('公告顯示設定不正確。');
  if (!Array.isArray(body.faqs) || body.faqs.length > 12) invalid('常見問題最多可設定 12 組。');
  const faqs = body.faqs.map((faq) => {
    objectBody(faq, ['question', 'answer']);
    return {
      question: plainText(faq.question, 160, '問題', { required: true, noMarkup: true }),
      answer: plainText(faq.answer, 1200, '回答', { required: true, noMarkup: true }),
    };
  });
  const announcement = plainText(body.announcement, 500, '公告', { noMarkup: true });
  if (body.announcement_enabled && !announcement) invalid('啟用公告前請填寫公告內容。');
  const heroTitle = plainText(body.hero_title, 120, '首頁主標', { required: true, noMarkup: true });
  const heroCopy = plainText(body.hero_copy, 1000, '首頁介紹', { required: true, noMarkup: true });
  const heroImagePaths = body.hero_image_paths;
  if (!Array.isArray(heroImagePaths) || heroImagePaths.length > 10
    || heroImagePaths.some((path) => !isValidHeroImagePath(path))
    || new Set(heroImagePaths).size !== heroImagePaths.length) {
    invalid('首頁輪播最多選擇 10 張有效照片，請重新載入後再試。');
  }
  return {
    p_announcement: announcement,
    p_announcement_enabled: body.announcement_enabled,
    p_faqs: faqs,
    p_hero_title: heroTitle,
    p_hero_copy: heroCopy,
    p_hero_image_paths: heroImagePaths,
    p_version: parseVersion(body.version),
  };
}

export function inquiryQuery(url) {
  const page = parsePage(url);
  const status = url.searchParams.get('status') ?? 'all';
  if (status !== 'all') parseStatus(status);
  const query = plainText(url.searchParams.get('q') ?? '', 120, '搜尋文字');
  const params = new URLSearchParams({
    select: INQUIRY_FIELDS,
    order: 'created_at.desc,id.desc',
    limit: String(PAGE_SIZE),
    offset: String((page - 1) * PAGE_SIZE),
  });
  if (status !== 'all') params.set('status', `eq.${status}`);
  if (query) {
    // Keep user input inside a quoted PostgREST value. Quotes and backslashes
    // cannot break out into additional filters; URLSearchParams encodes the URL.
    // SQL LIKE wildcards %, _ and PostgREST's * alias remain available in search.
    const quoted = `"*${query.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}*"`;
    params.set('or', `(name.ilike.${quoted},contact_account.ilike.${quoted},description.ilike.${quoted})`);
  }
  return { page, params };
}

export function exactCount(headers) {
  const value = headers.get('content-range')?.split('/').pop();
  if (!value || !/^\d+$/.test(value)) throw new HttpError(502, '無法取得資料筆數，請稍後重試。', 'upstream_error');
  return Number(value);
}

export function rowResult(data) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') throw new HttpError(502, '資料格式異常，請重新載入。', 'upstream_error');
  return row;
}

const STORAGE_PORTFOLIO_IMAGE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export function isValidPortfolioImagePath(path) {
  if (typeof path !== 'string') return false;
  if (STORAGE_PORTFOLIO_IMAGE_PATH.test(path)) return true;
  if (!path.startsWith('static:/assets/portfolio/') || /[?#\\]/.test(path)) return false;
  try {
    const url = new URL(path.slice('static:'.length), 'https://portfolio.invalid');
    if (url.origin !== 'https://portfolio.invalid' || url.search || url.hash) return false;
    const segments = url.pathname.split('/');
    if (segments.length !== 5 || segments[1] !== 'assets' || segments[2] !== 'portfolio') return false;
    const decoded = segments.slice(3).map((segment) => decodeURIComponent(segment));
    return decoded.every((segment) => segment && segment !== '.' && segment !== '..' && !/[\\/\u0000-\u001f]/.test(segment))
      && /\.(jpg|png|webp)$/i.test(decoded[1]);
  } catch { return false; }
}

function portfolioText(value, limit, label, { required = false } = {}) {
  if (typeof value !== 'string') invalid(`${label}格式不正確。`);
  const text = value.trim();
  if (text.length > limit) invalid(`${label}不可超過 ${limit} 字。`);
  if (required && !text) invalid(`請填寫${label}。`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/.test(text)) invalid(`${label}包含不支援的字元。`);
  return text;
}

export function portfolioUpdate(body) {
  objectBody(body, ['collections', 'version']);
  if (!Array.isArray(body.collections) || body.collections.length > 80) invalid('作品集最多可管理 80 組。');
  const slugs = new Set();
  const collections = body.collections.map((item) => {
    objectBody(item, ['slug', 'title', 'category', 'description', 'cover', 'images', 'totalImages']);
    const slug = portfolioText(item.slug, 120, '作品集識別名稱', { required: true });
    if (/[\\/?#]/.test(slug) || slugs.has(slug)) invalid('作品集名稱重複或格式不正確。');
    slugs.add(slug);
    const title = portfolioText(item.title, 120, '作品名稱', { required: true });
    if (!['外拍', '棚拍'].includes(item.category)) invalid('請選擇有效的作品分類。');
    const description = portfolioText(item.description, 1000, '作品介紹');
    if (!Array.isArray(item.images) || item.images.length < 1 || item.images.length > 500
      || item.images.some((path) => !isValidPortfolioImagePath(path))
      || new Set(item.images).size !== item.images.length) invalid('每組作品需有 1 至 500 張有效照片。');
    if (!isValidPortfolioImagePath(item.cover)) invalid('請選擇有效的封面照片。');
    if (!Number.isInteger(item.totalImages) || item.totalImages < item.images.length || item.totalImages > 10000) invalid('作品照片數量不正確。');
    return { slug, title, category: item.category, description, cover: item.cover, images: item.images, totalImages: item.totalImages };
  });
  if (!collections.length) invalid('請至少保留一組公開作品。');
  return { p_collections: collections, p_version: parseVersion(body.version) };
}

export function portfolioChanges(body) {
  objectBody(body, ['upserts', 'deleted_slugs', 'order', 'version']);
  if (!Array.isArray(body.upserts) || body.upserts.length > 80
    || !Array.isArray(body.deleted_slugs) || body.deleted_slugs.length > 80
    || !Array.isArray(body.order) || body.order.length > 80) invalid('作品集變更資料格式不正確。');

  const upserts = body.upserts.map((item) => portfolioUpdate({ collections: [item], version: body.version }).p_collections[0]);
  const upsertSlugs = upserts.map((item) => item.slug);
  if (new Set(upsertSlugs).size !== upsertSlugs.length) invalid('作品集變更包含重複的識別名稱。');

  const deletedSlugs = body.deleted_slugs.map((slug) => {
    const normalized = portfolioText(slug, 120, '作品集識別名稱', { required: true });
    if (/[\\/?#]/.test(normalized)) invalid('作品集識別名稱格式不正確。');
    return normalized;
  });
  if (new Set(deletedSlugs).size !== deletedSlugs.length
    || deletedSlugs.some((slug) => upsertSlugs.includes(slug))) invalid('作品集變更有重複或互相衝突的識別名稱。');

  const order = body.order.map((slug) => {
    const normalized = portfolioText(slug, 120, '作品集識別名稱', { required: true });
    if (/[\\/?#]/.test(normalized)) invalid('作品集識別名稱格式不正確。');
    return normalized;
  });
  if (new Set(order).size !== order.length) invalid('作品集順序包含重複的識別名稱。');

  return {
    p_upserts: upserts,
    p_deleted_slugs: deletedSlugs,
    p_order: order,
    p_version: parseVersion(body.version),
  };
}
