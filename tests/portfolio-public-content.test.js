import assert from 'node:assert/strict';
import test from 'node:test';
import fixture from './fixtures/portfolio-success.json' with { type: 'json' };
import { portfolioCatalog } from '../src/data/portfolioCatalog.ts';
import { loadPublishedPortfolio } from '../src/lib/portfolio-content.ts';
import { getImageDimensions, getImageSrcset, getPortfolioImageSources, setPortfolioImageSource } from '../src/lib/image-variants.ts';
import { parsePortfolioRouteMap, serializePortfolioRouteMap } from '../src/lib/portfolio-routes.ts';
import { replaceHeroImagesWhenLoaded } from '../src/lib/hero-images.ts';

test('successful portfolio API hydration preserves selected covers and uses all built static routes', async () => {
  const routeMap = parsePortfolioRouteMap(serializePortfolioRouteMap(portfolioCatalog));
  assert.equal(routeMap.size, portfolioCatalog.length);
  assert.equal(routeMap.size, 29);

  const outsideFeatured = portfolioCatalog.slice(12, 15);
  assert.ok(outsideFeatured.every(({ slug }) => !portfolioCatalog.slice(0, 12).some((item) => item.slug === slug)));
  const selectedSlugs = new Set(outsideFeatured.map(({ slug }) => slug));
  const reorderedCollections = [
    ...outsideFeatured,
    ...portfolioCatalog.filter(({ slug }) => !selectedSlugs.has(slug)),
  ].map(({ slug, title, category, description, cover, images, totalImages }) => ({
    slug, title, category, description, cover, images, totalImages,
  }));
  const successResponse = { ...fixture, collections: reorderedCollections };
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = { location: { origin: 'https://phox999.com' } };
  globalThis.fetch = async () => new Response(JSON.stringify(successResponse), { status: 200 });

  try {
    const published = await loadPublishedPortfolio(routeMap);
    assert.equal(published?.length, 29);
    assert.deepEqual(published?.slice(0, 3).map(({ slug }) => slug), outsideFeatured.map(({ slug }) => slug));

    for (const item of published ?? []) {
      assert.equal(item.cover, successResponse.collections.find(({ slug }) => slug === item.slug)?.cover);
      assert.equal(item.href, routeMap.get(item.slug));
      const dimensions = getImageDimensions(item.cover);
      assert.ok(dimensions, `${item.slug} must have known natural dimensions`);
      if (dimensions.width > 1280) assert.ok(getImageSrcset(item.cover), `${item.slug} must have a responsive size candidate`);
    }
    const firstCover = published[0].cover;
    const image = { dataset: {}, addEventListener() {}, removeAttribute() {}, currentSrc: '', _src: '',
      set src(value) { this._src = value; this.currentSrc = value; }, get src() { return this._src; } };
    setPortfolioImageSource(image, firstCover, '30vw');
    assert.equal(image.src, firstCover, 'local API cover remains the selected source');
    assert.equal(image.width, getImageDimensions(firstCover).width);
    assert.equal(image.height, getImageDimensions(firstCover).height);
    assert.ok(image.srcset.includes('1280w'));
    assert.equal(image.sizes, '30vw');

    const unknown = { ...successResponse.collections[0], slug: 'backend-only-new-work' };
    globalThis.fetch = async () => new Response(JSON.stringify({ collections: [...successResponse.collections, unknown] }), { status: 200 });
    const withUnknown = await loadPublishedPortfolio(routeMap);
    assert.equal(withUnknown?.at(-1)?.href, '/portfolio/?collection=backend-only-new-work');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test('uploaded Supabase covers get responsive candidates and retain the selected original as fallback', () => {
  const selectedCover = 'https://project.supabase.co/storage/v1/object/public/site-portfolio/00000000-0000-4000-8000-000000000001.webp';
  const sources = getPortfolioImageSources(selectedCover);
  assert.equal(sources.fallbackSrc, selectedCover);
  assert.match(sources.src, /\/storage\/v1\/render\/image\/public\/site-portfolio\//);
  assert.match(sources.srcset ?? '', /width=640/);
  assert.match(sources.srcset ?? '', /width=960/);
  assert.match(sources.srcset ?? '', /width=1280/);
});

test('a failed public-cover transformation falls back to the exact API-selected cover', () => {
  const selectedCover = 'https://project.supabase.co/storage/v1/object/public/site-portfolio/00000000-0000-4000-8000-000000000001.webp';
  const listeners = new Map();
  const image = {
    dataset: {},
    attributes: new Map(),
    _src: '',
    currentSrc: '',
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeAttribute(name) { this.attributes.delete(name); },
    get src() { return this._src; },
    set src(value) { this._src = value; this.currentSrc = value; },
    set srcset(value) { this.attributes.set('srcset', value); },
    set sizes(value) { this.attributes.set('sizes', value); },
  };

  setPortfolioImageSource(image, selectedCover, '28vw');
  assert.notEqual(image.src, selectedCover);
  listeners.get('error')();
  assert.equal(image.src, selectedCover);
  assert.equal(image.attributes.has('srcset'), false);
  assert.equal(image.attributes.has('sizes'), false);
});

test('malformed static route maps do not turn unknown API slugs into guessed pages', () => {
  assert.equal(parsePortfolioRouteMap('["not-a-route"]').size, 0);
  assert.equal(parsePortfolioRouteMap(JSON.stringify([['unknown', '/portfolio/']])).size, 0);
});

function heroImage(fallbackSucceeds) {
  const original = 'https://project.supabase.co/storage/v1/object/public/site-hero/00000000-0000-4000-8000-000000000001.webp';
  const attributes = new Set();
  let src = '';
  return {
    dataset: { originalSrc: original },
    naturalWidth: 0,
    srcset: '',
    sizes: '',
    get src() { return src; },
    set src(value) { src = value; },
    get currentSrc() { return src; },
    async decode() {
      if (src.includes('/render/image/public/')) throw new Error('transformed candidate failed');
      if (src === original && fallbackSucceeds) {
        this.naturalWidth = 2400;
        return;
      }
      throw new Error('original failed');
    },
    removeAttribute(name) {
      attributes.delete(name);
      if (name === 'srcset') this.srcset = '';
      if (name === 'sizes') this.sizes = '';
    },
    attributes,
  };
}

test('Hero retries the original after a candidate failure', async () => {
  const media = {
    children: [{ id: 'existing-first-screen-hero' }],
    replaceChildren(...children) { this.children = children; },
  };
  const image = heroImage(true);
  const replaced = await replaceHeroImagesWhenLoaded(media, [image]);
  assert.equal(replaced, true);
  assert.equal(image.src, image.dataset.originalSrc);
  assert.equal(image.srcset, '');
  assert.deepEqual(media.children, [image]);
});

test('Hero keeps the existing first-screen media when both candidate and original fail', async () => {
  const existingHero = { id: 'existing-first-screen-hero' };
  const media = {
    children: [existingHero],
    replaceChildren(...children) { this.children = children; },
  };
  const replaced = await replaceHeroImagesWhenLoaded(media, [heroImage(false)]);
  assert.equal(replaced, false);
  assert.deepEqual(media.children, [existingHero]);
});
