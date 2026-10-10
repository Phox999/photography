import assert from 'node:assert/strict';
import test from 'node:test';
import liveFixture from './fixtures/portfolio-live-2026-10-10.json' with { type: 'json' };
import reorderedFixture from './fixtures/portfolio-reordered-2026-10-10.json' with { type: 'json' };
import remoteCoverFixture from './fixtures/portfolio-remote-cover-synthetic-2026-10-10.json' with { type: 'json' };
import heroFixture from './fixtures/hero-live-2026-10-10.json' with { type: 'json' };
import { portfolioCatalog } from '../src/data/portfolioCatalog.ts';
import { loadPublishedPortfolio } from '../src/lib/portfolio-content.ts';
import { getImageDimensions, getImageSrcset, getPortfolioImageSources, setPortfolioImageSource } from '../src/lib/image-variants.ts';
import { parsePortfolioRouteMap, serializePortfolioRouteMap } from '../src/lib/portfolio-routes.ts';
import { canReuseStaticHeroImage, heroImageSources, replaceHeroImagesWhenLoaded } from '../src/lib/hero-images.ts';

test('captured public API covers hydrate by identity and map to every built static route', async () => {
  const routeMap = parsePortfolioRouteMap(serializePortfolioRouteMap(portfolioCatalog));
  assert.equal(routeMap.size, portfolioCatalog.length);
  assert.equal(routeMap.size, 29);
  assert.equal(liveFixture.snapshot.httpStatus, 200);
  assert.equal(liveFixture.snapshot.sampleCount, 29);
  assert.ok(liveFixture.collections.some((item) => item.cover !== portfolioCatalog.find(({ slug }) => slug === item.slug)?.cover));

  const outsideFeatured = portfolioCatalog.slice(12, 15);
  assert.ok(outsideFeatured.every(({ slug }) => !portfolioCatalog.slice(0, 12).some((item) => item.slug === slug)));
  assert.equal(reorderedFixture.snapshot.synthetic, true);
  assert.deepEqual(reorderedFixture.snapshot.movedSlugs, outsideFeatured.map(({ slug }) => slug));
  assert.deepEqual(reorderedFixture.collections.slice(0, 3).map(({ slug }) => slug), outsideFeatured.map(({ slug }) => slug));
  const successResponse = { collections: reorderedFixture.collections };
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
      if (dimensions.width > 640) {
        const srcset = getImageSrcset(item.cover);
        assert.ok(srcset, `${item.slug} must have a responsive size candidate`);
        for (const candidate of srcset.split(', ')) {
          const candidatePath = decodeURIComponent(candidate.split(' ')[0]).replace(/^\//, 'public/');
          assert.ok((await import('node:fs')).existsSync(candidatePath), `missing responsive candidate ${candidatePath}`);
        }
      }
    }
    const firstCover = published[0].cover;
    const image = { dataset: {}, addEventListener() {}, removeAttribute() {}, currentSrc: '', _src: '',
      set src(value) { this._src = value; this.currentSrc = value; }, get src() { return this._src; } };
    setPortfolioImageSource(image, firstCover, '30vw');
    assert.equal(image.src, firstCover, 'local API cover remains the selected source');
    assert.equal(image.width, getImageDimensions(firstCover).width);
    assert.equal(image.height, getImageDimensions(firstCover).height);
    assert.ok(image.srcset.includes('640w'));
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

test('uploaded Supabase covers use the selected original without known-failing transforms', () => {
  const selectedCover = 'https://project.supabase.co/storage/v1/object/public/site-portfolio/00000000-0000-4000-8000-000000000001.webp';
  const sources = getPortfolioImageSources(selectedCover);
  assert.equal(sources.src, selectedCover);
  assert.equal(sources.fallbackSrc, selectedCover);
  assert.equal(sources.srcset, undefined);
});

test('synthetic public Supabase cover keeps the selected URL and skips unavailable local candidates', async () => {
  assert.equal(remoteCoverFixture.snapshot.synthetic, true);
  const selected = remoteCoverFixture.collections[0];
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = { location: { origin: 'https://phox999.com' } };
  globalThis.fetch = async () => new Response(JSON.stringify({ collections: [selected] }), { status: 200 });
  try {
    const routeMap = parsePortfolioRouteMap(serializePortfolioRouteMap(portfolioCatalog));
    const [published] = await loadPublishedPortfolio(routeMap);
    assert.equal(published?.cover, selected.cover);
    assert.equal(published?.href, routeMap.get(selected.slug));

    const sources = getPortfolioImageSources(published.cover);
    assert.equal(sources.src, selected.cover);
    assert.equal(sources.fallbackSrc, selected.cover);
    assert.equal(sources.srcset, undefined);

    const listeners = new Map();
    const image = { dataset: {}, addEventListener(name, listener) { listeners.set(name, listener); },
      set src(value) { this._src = value; }, get src() { return this._src; },
      get naturalWidth() { return 1920; }, get naturalHeight() { return 1280; } };
    setPortfolioImageSource(image, published.cover, '30vw');
    listeners.get('load')();
    assert.equal(image.src, selected.cover);
    assert.equal(image.width, 1920);
    assert.equal(image.height, 1280);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test('a failed portfolio API request leaves the server-rendered content available', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = { location: { origin: 'https://phox999.com' } };
  globalThis.fetch = async () => new Response('{}', { status: 503 });
  try {
    assert.equal(await loadPublishedPortfolio(), null);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test('a failed local API-cover candidate falls back to the exact API-selected photo', () => {
  const selectedCover = liveFixture.collections.find(({ cover }) => cover.startsWith('/assets/portfolio/'))?.cover;
  assert.ok(selectedCover);
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
  assert.match(image.attributes.get('srcset'), /\.seo-640\.webp 640w/);
  assert.match(image.attributes.get('srcset'), /\.seo-1280\.webp 1280w/);
  assert.equal(image.src, selectedCover);
  image.currentSrc = '/assets/portfolio/cover.seo-640.webp';
  listeners.get('error')();
  assert.equal(image.src, selectedCover);
  assert.equal(image.attributes.has('srcset'), false);
  assert.equal(image.attributes.has('sizes'), false);
});

test('malformed static route maps do not turn unknown API slugs into guessed pages', () => {
  assert.equal(parsePortfolioRouteMap('["not-a-route"]').size, 0);
  assert.equal(parsePortfolioRouteMap(JSON.stringify([['unknown', '/portfolio/']])).size, 0);
});

test('current public Hero API sources use exact local variants with the remote originals as fallback', () => {
  assert.equal(heroFixture.snapshot.httpStatus, 200);
  assert.ok(Array.isArray(heroFixture.faqs), 'captured fixture keeps the public response shape used by Hero hydration');
  assert.equal(heroFixture.hero_image_urls.length, 10);
  assert.equal(heroImageSources(heroFixture.hero_image_urls[0]).matchesStaticFallback, true);
  for (const source of heroFixture.hero_image_urls) {
    const candidates = heroImageSources(source);
    assert.equal(candidates.fallbackSrc, source);
    assert.ok(candidates.srcset?.includes('/assets/hero-api/'));
    assert.ok(candidates.width && candidates.height);
    assert.doesNotMatch(candidates.srcset, /\/render\/image\/public\//);
  }
  const futureUpload = 'https://project.supabase.co/storage/v1/object/public/site-hero/00000000-0000-4000-8000-000000000001.webp';
  assert.deepEqual(heroImageSources(futureUpload), { src: futureUpload, fallbackSrc: futureUpload });
});

test('the preloaded static Hero is reused only for its matching decoded API source', async () => {
  const source = heroFixture.hero_image_urls[0];
  const image = { dataset: { originalSrc: source }, naturalWidth: 1600, async decode() {} };
  assert.equal(await canReuseStaticHeroImage(image, source), true);
  assert.equal(await canReuseStaticHeroImage(image, heroFixture.hero_image_urls[1]), false);
  assert.equal(await canReuseStaticHeroImage({ ...image, dataset: { originalSrc: '' } }, source), false);
});

function heroImage(fallbackSucceeds) {
  const original = heroFixture.hero_image_urls.find((url) => url.startsWith('https://'));
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
      if (src.startsWith('/assets/hero-api/')) throw new Error('local derivative failed');
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
