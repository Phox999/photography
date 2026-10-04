import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalUrl,
  decodePortfolioPath,
  escapeHtml,
  escapeXml,
  portfolioPath,
  publicImageUrl,
  safeJsonLd,
} from '../server/seo.js';
import { getPublishedPortfolio, handlePortfolioArchive, handlePortfolioRoute, handleSitemap } from '../server/public-page-rendering.js';

const origin = 'https://phox999.com';
const imageId = '00000000-0000-4000-8000-000000000001.webp';

function collection(slug, title = slug, description = '自然光下的人像系列。') {
  return {
    slug,
    title,
    category: '外拍',
    description,
    cover: imageId,
    images: [imageId],
    totalImages: 1,
  };
}

function context(url, env = {}) {
  return {
    request: new Request(url),
    env: {
      SUPABASE_URL: 'https://demo.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      ...env,
    },
    waitUntil() {},
  };
}

test('canonical 正規化去除追蹤 query 並統一尾斜線', () => {
  assert.equal(canonicalUrl('/about?utm_source=profile'), `${origin}/about/`);
  assert.equal(canonicalUrl('/portfolio/%E6%B5%B7%E9%A2%A8'), `${origin}/portfolio/%E6%B5%B7%E9%A2%A8/`);
  assert.equal(canonicalUrl('//outside.test/path'), `${origin}/`);
});

test('作品 slug 一次解碼並保留中文、空格、加號與 emoji', () => {
  const slug = '海風 + 夜景 😀';
  const path = portfolioPath(slug);
  assert.equal(decodePortfolioPath(path).slug, slug);
  assert.equal(decodePortfolioPath(new URL(`${origin}${path}?utm_source=share`).pathname).slug, slug);
  assert.equal(decodePortfolioPath('/portfolio/%E0%A4%A/').kind, 'bad-request');
  assert.equal(decodePortfolioPath('/portfolio/%2F/').kind, 'bad-request');
  assert.equal(decodePortfolioPath('/portfolio/a%5Cb/').kind, 'bad-request');
  assert.equal(decodePortfolioPath('/portfolio/%2E%2E/').kind, 'bad-request');
  assert.equal(decodePortfolioPath('/portfolio/').kind, 'not-portfolio');
});

test('HTML、XML 與 JSON-LD 對後台文字作情境跳脫', () => {
  const text = `A & B <script>alert("x")</script> \u2028`;
  assert.equal(escapeHtml('<tag a="b">&'), '&lt;tag a=&quot;b&quot;&gt;&amp;');
  assert.equal(escapeXml('<tag a="b">&'), '&lt;tag a=&quot;b&quot;&gt;&amp;');
  const encoded = safeJsonLd({ name: text });
  assert.equal(encoded.includes('<'), false);
  assert.equal(JSON.parse(encoded).name, text);
});

test('只允許本站資產或公開作品／主視覺 Storage 圖片進入公開輸出', () => {
  assert.equal(publicImageUrl('/assets/portfolio/a.webp'), `${origin}/assets/portfolio/a.webp`);
  assert.equal(publicImageUrl(`https://demo.supabase.co/storage/v1/object/public/site-portfolio/${imageId}`), `https://demo.supabase.co/storage/v1/object/public/site-portfolio/${imageId}`);
  assert.equal(publicImageUrl(`https://demo.supabase.co/storage/v1/object/public/site-hero/${imageId}`), `https://demo.supabase.co/storage/v1/object/public/site-hero/${imageId}`);
  assert.equal(publicImageUrl('javascript:alert(1)'), null);
  assert.equal(publicImageUrl('https://example.test/photo.webp'), null);
  assert.equal(publicImageUrl(`https://demo.supabase.co/storage/v1/object/sign/site-portfolio/${imageId}?token=secret`), null);
});

test('作品頁與 sitemap 跟隨新增、修改、排序及移除的公開 snapshot', async () => {
  const previousFetch = globalThis.fetch;
  let data = { version: 1, collections: [collection('old-slug', '舊標題'), collection('stay + 海風😀', '初始標題')] };
  globalThis.fetch = async () => new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  try {
    const previewOrigin = 'https://seo-preview.example';
    const firstContext = context(`${previewOrigin}/portfolio/`, { ASSETS: { fetch: async () => new Response('') } });
    const firstCollections = await getPublishedPortfolio(firstContext);
    assert.deepEqual(firstCollections.map(({ slug }) => slug), ['old-slug', 'stay + 海風😀']);
    assert.equal(firstCollections[1].title, '初始標題');
    assert.equal(firstCollections[1].href, portfolioPath('stay + 海風😀'));

    let sitemap = await handleSitemap(firstContext);
    let xml = await sitemap.text();
    assert.match(xml, /old-slug/);
    assert.match(xml, /%2B%20%E6%B5%B7%E9%A2%A8/);

    data = { version: 2, collections: [collection('added-作品', '已更新的新標題'), collection('old-slug', '改過的標題')] };
    const changedCollections = await getPublishedPortfolio(firstContext);
    assert.equal(changedCollections[0].title, '已更新的新標題');
    sitemap = await handleSitemap(firstContext);
    xml = await sitemap.text();
    assert.match(xml, /added-%E4%BD%9C%E5%93%81/);
    assert.doesNotMatch(xml, /stay%20%2B%20%E6%B5%B7%E9%A2%A8/);

    const legacy = await handlePortfolioArchive(context(`${previewOrigin}/portfolio/?collection=${encodeURIComponent('added-作品')}`, firstContext.env));
    assert.equal(legacy.status, 308);
    assert.equal(legacy.headers.get('location'), `${previewOrigin}${portfolioPath('added-作品')}`);

    const stale = await handlePortfolioRoute(context(`${previewOrigin}/portfolio/stay%20%2B%20%E6%B5%B7%E9%A2%A8/`, firstContext.env));
    assert.equal(stale.status, 404);
    assert.match(await stale.text(), /不存在或已移除/);

    data = { version: 3, collections: [collection('old-slug', '只留下的作品')] };
    sitemap = await handleSitemap(firstContext);
    xml = await sitemap.text();
    assert.doesNotMatch(xml, /added-%E4%BD%9C%E5%93%81/);
    assert.match(xml, /old-slug/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('公開作品 API 故障時不回傳空白 sitemap 或軟式 404', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('unavailable', { status: 503 });
  try {
    const requestContext = context(`${origin}/portfolio/`);
    const sitemap = await handleSitemap(requestContext);
    assert.equal(sitemap.status, 503);
    assert.match(sitemap.headers.get('content-type'), /application\/xml/);

    const archive = await handlePortfolioArchive(requestContext);
    assert.equal(archive.status, 503);
    assert.equal(archive.headers.get('retry-after'), '30');
    assert.match(await archive.text(), /公開作品目前無法取得/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('不存在及錯誤編碼的作品 URL 分別回 404 與 400', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ version: 1, collections: [] }), { status: 200 });
  try {
    const missing = await handlePortfolioRoute(context(`${origin}/portfolio/no-such-work/`));
    assert.equal(missing.status, 404);
    const malformed = await handlePortfolioRoute(context(`${origin}/portfolio/%2F/`));
    assert.equal(malformed.status, 400);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
