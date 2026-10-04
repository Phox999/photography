import { onRequest as publicPortfolio } from '../functions/api/portfolio.js';
import { onRequest as publicSiteContent } from '../functions/api/site-content.js';
import {
  SITE_NAME,
  SITE_ORIGIN,
  canonicalUrl,
  decodePortfolioPath,
  escapeHtml,
  escapeXml,
  portfolioPath,
  publicImageUrl,
  safeJsonLd,
} from './seo.js';

const TEMPLATE_PATH = '/seo-internal/portfolio-template/';
const HOME_TITLE = '台北互惠人像攝影｜phox999 photography';
const HOME_DESCRIPTION = '在台北創作自然、有故事感的人像作品。了解互惠攝影合作方式、外拍與棚拍作品，從討論主題開始。';
const COLLECTIONS_TITLE = '人像攝影作品集・外拍與棚拍｜phox999 photography';
const COLLECTIONS_DESCRIPTION = '瀏覽 phox999 photography 的外拍與棚拍人像系列，依作品風格探索每組公開照片。';

function routeContext(context, url) {
  return {
    request: new Request(url, { method: 'GET', headers: { Accept: 'application/json' } }),
    env: context.env,
    params: {},
    waitUntil: context.waitUntil || (() => {}),
    passThroughOnException: context.passThroughOnException || (() => {}),
  };
}

async function readPublished(handler, context, pathname) {
  const url = new URL(pathname, context.request.url);
  const response = await handler(routeContext(context, url));
  if (!response.ok) throw new Error('published_content_unavailable');
  return response.json();
}

export async function getPublishedPortfolio(context) {
  const data = await readPublished(publicPortfolio, context, '/api/portfolio');
  if (!Array.isArray(data.collections) || data.collections.length > 80) throw new Error('portfolio_unavailable');
  return data.collections.map((item) => {
    const cover = publicImageUrl(item.cover);
    const images = Array.isArray(item.images) ? item.images.map(publicImageUrl) : [];
    if (!cover || !images.length || images.some((image) => !image)) throw new Error('portfolio_unavailable');
    return { ...item, cover, images, href: portfolioPath(item.slug) };
  });
}

export async function getPublishedSiteContent(context) {
  const data = await readPublished(publicSiteContent, context, '/api/site-content');
  if (typeof data.hero_title !== 'string' || !data.hero_title.trim()
    || typeof data.hero_copy !== 'string' || !data.hero_copy.trim()
    || !Array.isArray(data.faqs) || !Array.isArray(data.hero_image_urls)) {
    throw new Error('site_content_unavailable');
  }
  const heroImages = data.hero_image_urls.map(publicImageUrl);
  if (heroImages.some((image) => !image)) throw new Error('site_content_unavailable');
  return { ...data, hero_image_urls: heroImages };
}

function responseWithHeaders(response, updates = {}, { remove = [] } = {}) {
  const headers = new Headers(response.headers);
  for (const name of remove) headers.delete(name);
  for (const [name, value] of Object.entries(updates)) headers.set(name, value);
  headers.delete('content-length');
  headers.delete('etag');
  headers.delete('last-modified');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function setMeta(rewriter, selector, value, attribute = 'content') {
  rewriter.on(selector, { element: (element) => element.setAttribute(attribute, String(value)) });
}

function schemaGraph(value) {
  const values = Array.isArray(value) ? value : [value];
  return {
    '@context': 'https://schema.org',
    '@graph': values.map((item) => {
      if (item?.['@graph']) return item['@graph'];
      const { '@context': ignoredContext, ...entity } = item;
      return entity;
    }).flat(),
  };
}

function rewriteDocument(response, { title, description, canonical, image, imageAlt, schema, robots = 'index, follow, max-image-preview:large' }, configure = () => {}) {
  const rewriter = new HTMLRewriter()
    .on('title', { element: (element) => element.setInnerContent(title) })
    .on('link[rel="canonical"]', { element: (element) => element.setAttribute('href', canonical) });
  setMeta(rewriter, 'meta[name="description"]', description);
  setMeta(rewriter, 'meta[name="robots"]', robots);
  setMeta(rewriter, 'meta[property="og:url"]', canonical);
  setMeta(rewriter, 'meta[property="og:title"]', title);
  setMeta(rewriter, 'meta[property="og:description"]', description);
  setMeta(rewriter, 'meta[property="og:image"]', image);
  setMeta(rewriter, 'meta[property="og:image:alt"]', imageAlt);
  setMeta(rewriter, 'meta[name="twitter:title"]', title);
  setMeta(rewriter, 'meta[name="twitter:description"]', description);
  setMeta(rewriter, 'meta[name="twitter:image"]', image);
  let schemaWritten = false;
  rewriter.on('script[data-seo-jsonld]', {
    element(element) {
      if (schemaWritten) element.remove();
      else {
        element.setInnerContent(safeJsonLd(schemaGraph(schema)), { html: true });
        schemaWritten = true;
      }
    },
  });
  configure(rewriter);
  return responseWithHeaders(rewriter.transform(response), {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': robots,
    'X-Content-Type-Options': 'nosniff',
  }, { remove: ['content-encoding'] });
}

function cleanDescription(description, fallback) {
  const value = String(description || '').trim() || fallback;
  return value.length > 280 ? `${value.slice(0, 277).trimEnd()}…` : value;
}

function personReference() {
  return { '@id': `${SITE_ORIGIN}/about/#person` };
}

function homeSchema(title, description) {
  return [
    {
      '@type': 'WebSite',
      '@id': `${SITE_ORIGIN}/#website`,
      name: SITE_NAME,
      url: `${SITE_ORIGIN}/`,
      inLanguage: 'zh-Hant-TW',
      publisher: personReference(),
    },
    {
      '@type': 'WebPage',
      '@id': `${SITE_ORIGIN}/#webpage`,
      name: title,
      description,
      url: `${SITE_ORIGIN}/`,
      inLanguage: 'zh-Hant-TW',
      isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
      about: personReference(),
    },
  ];
}

function imageMarkup(collection, { index = 0 } = {}) {
  const title = escapeHtml(collection.title);
  const src = escapeHtml(collection.images[index]);
  const alt = escapeHtml(`${collection.title}作品照片 ${index + 1}`);
  const loading = index < 3 ? 'eager' : 'lazy';
  return `<figure class="portfolio-justified__item"><button class="portfolio-justified__button" type="button" data-lightbox-open data-lightbox-index="${index}" aria-label="開啟 ${title} 照片 ${index + 1}"><img src="${src}" alt="${alt}" loading="${loading}" decoding="async"></button></figure>`;
}

function cardMarkup(collection, index, { featured = false } = {}) {
  const title = escapeHtml(collection.title);
  const category = escapeHtml(collection.category);
  const href = escapeHtml(portfolioPath(collection.slug));
  const cover = escapeHtml(collection.cover);
  const description = escapeHtml(String(collection.description || ''));
  const alt = escapeHtml(`${collection.title}作品封面`);
  if (featured) {
    return `<article class="portfolio-card" data-portfolio-card data-tags="${category}"><a class="portfolio-card__link" href="${href}" aria-label="查看${title}作品"><div class="portfolio-card__media"><img src="${cover}" alt="${alt}" loading="lazy" decoding="async"></div><div class="portfolio-card__caption"><h3>${title}</h3><p>${category}</p></div></a></article>`;
  }
  return `<article class="portfolio-index-card" data-archive-card data-category="${category}" data-title="${title}" data-description="${description}" data-original-index="${index}"><a href="${href}" aria-label="瀏覽${title}系列作品"><div class="portfolio-index-card__media"><img src="${cover}" alt="${alt}" loading="${index < 3 ? 'eager' : 'lazy'}" decoding="async"><div class="portfolio-index-card__title"><span>${category}</span><h3>${title}</h3></div></div></a></article>`;
}

function faqMarkup(faqs) {
  return faqs.map(({ question, answer }) => (
    `<details class="faq-item"><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`
  )).join('');
}

function featuredFilters(rewriter, collections) {
  rewriter.on('[data-portfolio-filter-button]', {
    element(element) {
      const filter = element.getAttribute('data-filter') || '全部';
      const count = collections.filter((item) => filter === '全部' || item.category === filter).length;
      element.setAttribute('aria-label', `${filter}，${count} 組作品`);
      element.setInnerContent(`${escapeHtml(filter)}<span class="portfolio-filter__count" aria-hidden="true">${count}</span>`, { html: true });
    },
  });
}

function archiveFilters(rewriter, collections) {
  rewriter.on('[data-archive-filter]', {
    element(element) {
      const filter = element.getAttribute('data-filter') || '全部';
      const count = collections.filter((item) => filter === '全部' || item.category === filter).length;
      element.setAttribute('aria-label', `${filter}，${count} 組作品`);
      element.setInnerContent(`${escapeHtml(filter)}<span class="portfolio-filter__count" aria-hidden="true">${count}</span>`, { html: true });
    },
  });
}

function featuredSchema(collections) {
  return [
    {
      '@type': 'CollectionPage',
      '@id': `${SITE_ORIGIN}/portfolio/#webpage`,
      name: COLLECTIONS_TITLE,
      description: COLLECTIONS_DESCRIPTION,
      url: `${SITE_ORIGIN}/portfolio/`,
      inLanguage: 'zh-Hant-TW',
      mainEntity: { '@id': `${SITE_ORIGIN}/portfolio/#item-list` },
    },
    {
      '@type': 'ItemList',
      '@id': `${SITE_ORIGIN}/portfolio/#item-list`,
      numberOfItems: collections.length,
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      itemListElement: collections.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.title,
        url: `${SITE_ORIGIN}${portfolioPath(item.slug)}`,
      })),
    },
  ];
}

function homeRewriter(response, siteContent, collections) {
  const rewriter = new HTMLRewriter();
  if (siteContent) {
    const title = `${siteContent.hero_title.trim()}｜台北互惠人像攝影・phox999`;
    const description = cleanDescription(siteContent.hero_copy, HOME_DESCRIPTION);
    const image = siteContent.hero_image_urls[0] || `${SITE_ORIGIN}/assets/og-hero.jpg`;
    rewriter
      .on('[data-hero-title]', { element: (element) => element.setInnerContent(siteContent.hero_title) })
      .on('[data-hero-copy]', { element: (element) => element.setInnerContent(siteContent.hero_copy) })
      .on('[data-public-announcement]', {
        element(element) {
          const announcement = String(siteContent.announcement || '').trim();
          if (announcement) {
            element.setInnerContent(announcement);
            element.removeAttribute('hidden');
          } else element.setInnerContent('');
        },
      })
      .on('[data-hero-carousel] .hero__media', {
        element(element) {
          const html = siteContent.hero_image_urls.map((url, index) => (
            `<img class="hero__image${index === 0 ? ' is-active' : ''}" src="${escapeHtml(url)}" alt="" loading="${index === 0 ? 'eager' : 'lazy'}"${index === 0 ? ' fetchpriority="high"' : ''} decoding="async" data-hero-image>`
          )).join('');
          if (html) element.setInnerContent(html, { html: true });
        },
      })
      .on('#faq .faq-grid', {
        element(element) {
          element.setInnerContent(faqMarkup(siteContent.faqs), { html: true });
        },
      })
      .on('#faq', {
        element(element) {
          if (siteContent.faqs.length) element.removeAttribute('hidden');
          else element.setAttribute('hidden', '');
        },
      });
    setMeta(rewriter, 'meta[name="description"]', description);
    setMeta(rewriter, 'meta[property="og:title"]', title);
    setMeta(rewriter, 'meta[property="og:description"]', description);
    setMeta(rewriter, 'meta[property="og:image"]', image);
    setMeta(rewriter, 'meta[property="og:image:alt"]', `${siteContent.hero_title}｜phox999 photography 主視覺`);
    setMeta(rewriter, 'meta[name="twitter:title"]', title);
    setMeta(rewriter, 'meta[name="twitter:description"]', description);
    setMeta(rewriter, 'meta[name="twitter:image"]', image);
    rewriter.on('title', { element: (element) => element.setInnerContent(title) });
    let schemaWritten = false;
    rewriter.on('script[data-seo-jsonld]', {
      element(element) {
        if (schemaWritten) element.remove();
        else {
          element.setInnerContent(safeJsonLd(schemaGraph(homeSchema(title, description))), { html: true });
          schemaWritten = true;
        }
      },
    });
  }

  if (collections) {
    rewriter.on('[data-portfolio-strip]', {
      element: (element) => element.setInnerContent(collections.slice(0, 12).map((item) => cardMarkup(item, 0, { featured: true })).join(''), { html: true }),
    });
    featuredFilters(rewriter, collections.slice(0, 12));
    rewriter.on('[data-portfolio-result]', {
      element: (element) => element.setInnerContent(`精選 ${Math.min(collections.length, 12)} 組作品`),
    });
    let schemaWritten = false;
    rewriter.on('script[data-seo-jsonld]', {
      element(element) {
        if (siteContent || schemaWritten) return;
        element.setInnerContent(safeJsonLd(schemaGraph(homeSchema(HOME_TITLE, HOME_DESCRIPTION))), { html: true });
        schemaWritten = true;
      },
    });
  } else {
    rewriter.on('[data-portfolio-strip]', { element: (element) => element.setInnerContent('') });
    rewriter.on('[data-portfolio-result]', { element: (element) => element.setInnerContent('作品目前無法載入，請稍後重試。') });
    featuredFilters(rewriter, []);
  }
  return rewriter.transform(response);
}

export async function renderHomePage(context) {
  const assetResponse = await context.env.ASSETS.fetch(new Request(new URL('/', context.request.url)));
  const [siteResult, portfolioResult] = await Promise.allSettled([
    getPublishedSiteContent(context),
    getPublishedPortfolio(context),
  ]);
  const siteContent = siteResult.status === 'fulfilled' ? siteResult.value : null;
  const collections = portfolioResult.status === 'fulfilled' ? portfolioResult.value : null;
  const rewritten = homeRewriter(assetResponse, siteContent, collections);
  return responseWithHeaders(rewritten, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }, { remove: ['content-encoding'] });
}

function portfolioArchiveRewriter(response, collections) {
  const description = collections.length
    ? COLLECTIONS_DESCRIPTION
    : '目前沒有已發布的公開作品系列。';
  return rewriteDocument(response, {
    title: COLLECTIONS_TITLE,
    description,
    canonical: canonicalUrl('/portfolio/'),
    image: `${SITE_ORIGIN}/assets/og-hero.jpg`,
    imageAlt: 'phox999 photography 人像作品集',
    schema: featuredSchema(collections),
  }, (rewriter) => {
    rewriter
      .on('#portfolio-archive-grid', {
        element: (element) => element.setInnerContent(collections.map((item, index) => cardMarkup(item, index)).join(''), { html: true }),
      })
      .on('[data-archive-result]', {
        element: (element) => element.setInnerContent(`全部 · ${collections.length} 組作品`),
      });
    archiveFilters(rewriter, collections);
  });
}

function collectionSchema(collection, imageUrls, title, description, path) {
  const collectionUrl = `${SITE_ORIGIN}${path}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${collectionUrl}#webpage`,
        url: collectionUrl,
        name: title,
        description,
        inLanguage: 'zh-Hant-TW',
        isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
        mainEntity: { '@id': `${collectionUrl}#gallery` },
        breadcrumb: { '@id': `${collectionUrl}#breadcrumb` },
      },
      {
        '@type': 'ImageGallery',
        '@id': `${collectionUrl}#gallery`,
        url: collectionUrl,
        name: collection.title,
        description,
        creator: personReference(),
        image: imageUrls.map((url, index) => ({
          '@type': 'ImageObject',
          contentUrl: url,
          name: `${collection.title}作品照片 ${index + 1}`,
          description: `${collection.title}人像作品照片。`,
          creator: personReference(),
        })),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${collectionUrl}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首頁', item: `${SITE_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: '作品集', item: `${SITE_ORIGIN}/portfolio/` },
          { '@type': 'ListItem', position: 3, name: collection.title, item: collectionUrl },
        ],
      },
    ],
  };
}

function collectionHtmlRewriter(response, collection, path) {
  const title = `${collection.title}｜${collection.category}人像作品・phox999 photography`;
  const description = cleanDescription(collection.description, `瀏覽「${collection.title}」${collection.category}人像系列作品，了解拍攝主題與畫面風格。`);
  const image = collection.cover;
  return rewriteDocument(response, {
    title,
    description,
    canonical: canonicalUrl(path),
    image,
    imageAlt: `${collection.title}作品封面`,
    schema: collectionSchema(collection, collection.images, title, description, path),
  }, (rewriter) => {
    rewriter
      .on('[data-portfolio-title]', { element: (element) => element.setInnerContent(collection.title) })
      .on('[data-portfolio-description]', { element: (element) => element.setInnerContent(collection.description || description) })
      .on('[data-portfolio-category]', { element: (element) => element.setInnerContent(`PORTFOLIO · ${collection.category}`) })
      .on('[data-justified-gallery]', {
        element: (element) => {
          element.setAttribute('aria-label', `${collection.title}照片集`);
          element.setInnerContent(collection.images.map((_, index) => imageMarkup(collection, { index })).join(''), { html: true });
        },
      });
  });
}

async function fetchAsset(context, pathname) {
  const asset = await context.env.ASSETS.fetch(new Request(new URL(pathname, context.request.url)));
  return asset;
}

function htmlError(status, title, message, retryAfter) {
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'X-Content-Type-Options': 'nosniff',
  });
  if (retryAfter) headers.set('Retry-After', String(retryAfter));
  const body = `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow, noarchive"><title>${escapeHtml(title)}｜${SITE_NAME}</title></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a href="/portfolio/">回作品集</a> · <a href="/cooperation/">了解合作方式</a></p></main></body></html>`;
  return new Response(body, { status, headers });
}

function xmlError(status = 503) {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><error>網站地圖暫時無法載入。</error>', {
    status,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function methodError() {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'GET', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}

async function withPortfolio(context, operation) {
  if (context.request.method !== 'GET') return methodError();
  let collections;
  try {
    collections = await getPublishedPortfolio(context);
  } catch {
    return htmlError(503, '作品集暫時無法載入', '公開作品目前無法取得，請稍後再試。', 30);
  }
  return operation(collections);
}

export function handlePortfolioRoute(context) {
  if (context.request.method !== 'GET') return Promise.resolve(methodError());
  const requestUrl = new URL(context.request.url);
  const route = decodePortfolioPath(requestUrl.pathname);
  if (route.kind === 'bad-request') return Promise.resolve(htmlError(400, '網址格式不正確', '請回到作品集重新選擇。'));
  if (route.kind !== 'portfolio') return Promise.resolve(htmlError(404, '找不到這組作品', '這個作品網址不存在或已移除。'));
  return withPortfolio(context, async (collections) => {
    const collection = collections.find((item) => item.slug === route.slug);
    if (!collection) return htmlError(404, '找不到這組作品', '這個作品網址不存在或已移除。');
    const path = portfolioPath(collection.slug);
    if (!route.hasTrailingSlash) return Response.redirect(new URL(path, requestUrl.origin), 308);
    let template;
    try { template = await fetchAsset(context, TEMPLATE_PATH); } catch { return htmlError(503, '作品集頁面暫時無法載入', '請稍後再試。', 30); }
    if (!template.ok || !template.headers.get('content-type')?.includes('text/html')) {
      return htmlError(503, '作品集頁面暫時無法載入', '請稍後再試。', 30);
    }
    try {
      return collectionHtmlRewriter(template, collection, path);
    } catch {
      return htmlError(503, '作品集頁面暫時無法載入', '請稍後再試。', 30);
    }
  });
}

export function handlePortfolioArchive(context) {
  if (context.request.method !== 'GET') return Promise.resolve(methodError());
  const url = new URL(context.request.url);
  const selected = url.searchParams.getAll('collection');
  if (selected.length > 1) return Promise.resolve(htmlError(400, '網址格式不正確', '請回到作品集重新選擇。'));
  return withPortfolio(context, async (collections) => {
    if (selected.length === 1) {
      const slug = selected[0];
      if (!slug || slug.length > 120 || /[\\/?#\u0000-\u001f\u007f]/.test(slug)) return htmlError(400, '網址格式不正確', '請回到作品集重新選擇。');
      const collection = collections.find((item) => item.slug === slug);
      return collection
        ? Response.redirect(new URL(portfolioPath(collection.slug), url.origin), 308)
        : htmlError(404, '找不到這組作品', '這個作品網址不存在或已移除。');
    }
    let asset;
    try { asset = await fetchAsset(context, '/portfolio/'); } catch { return htmlError(503, '作品集頁面暫時無法載入', '請稍後再試。', 30); }
    if (!asset.ok || !asset.headers.get('content-type')?.includes('text/html')) return htmlError(503, '作品集頁面暫時無法載入', '請稍後再試。', 30);
    try { return portfolioArchiveRewriter(asset, collections); }
    catch { return htmlError(503, '作品集頁面暫時無法載入', '請稍後再試。', 30); }
  });
}

export async function handleSitemap(context) {
  if (context.request.method !== 'GET') return methodError();
  let collections;
  try { collections = await getPublishedPortfolio(context); }
  catch { return xmlError(503); }
  const fixedPaths = ['/', '/portfolio/', '/cooperation/', '/about/', '/behind-scenes/'];
  const paths = [...fixedPaths, ...collections.map((item) => portfolioPath(item.slug))];
  const unique = [...new Set(paths.map((path) => new URL(path, SITE_ORIGIN).href))];
  const urls = unique.map((loc) => `<url><loc>${escapeXml(loc)}</loc></url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
