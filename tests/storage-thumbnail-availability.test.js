import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { imageThumbnailUrls } from '../server/storage-thumbnails.js';
import { adminPortfolioResult } from '../server/portfolio-images.js';

test('thumbnail inventory uses one batched Storage listing and leaves missing legacy variants absent', async (context) => {
  const previousFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = previousFetch; });
  const base = randomUUID().slice(0, 8);
  const config = { url: `https://${base}.supabase.co`, key: 'sb_secret_test' };
  const existing = `${base}-1111-4111-8111-111111111111.thumb.webp`;
  const original = `${base}-1111-4111-8111-111111111111.jpg`;
  const missing = `${base}-2222-4222-8222-222222222222.jpg`;
  let listCalls = 0;
  const methods = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    methods.push(init.method || 'GET');
    assert.equal(url.pathname, '/storage/v1/object/list/site-portfolio');
    listCalls += 1;
    return Response.json([{ name: existing }]);
  };

  const thumbnails = await imageThumbnailUrls(config, 'site-portfolio', [original, missing, 'static:/assets/portfolio/a.webp']);
  assert.equal(thumbnails.get(original), `${config.url}/storage/v1/object/public/site-portfolio/${existing}`);
  assert.equal(thumbnails.get(missing), null);
  assert.equal(thumbnails.get('static:/assets/portfolio/a.webp'), null);
  assert.equal(listCalls, 1);
  assert.deepEqual(methods, ['POST']);

  const data = { version: 1, collections: [{
    slug: 'sample', title: 'Sample', category: '外拍', description: '',
    cover: original, images: [original, missing], totalImages: 2,
  }] };
  const admin = adminPortfolioResult(data, config, thumbnails);
  assert.equal(admin.collections[0].cover_thumbnail_url, thumbnails.get(original));
  assert.equal(admin.collections[0].images[0].thumbnail_url, thumbnails.get(original));
  assert.equal(admin.collections[0].images[1].thumbnail_url, null);
  assert.equal(listCalls, 1);
});

test('thumbnail inventory failures degrade to no thumbnail instead of guessed broken URLs', async (context) => {
  const previousFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async () => new Response('{}', { status: 503 });
  const path = `${randomUUID()}.jpg`;
  const thumbnails = await imageThumbnailUrls({ url: 'https://missing.supabase.co', key: 'sb_secret_test' }, 'site-hero', [path]);
  assert.equal(thumbnails.get(path), null);
});
