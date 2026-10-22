import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequest as uploadHeroImage } from '../functions/api/admin/hero-image.js';
import { onRequest as readContent } from '../functions/api/admin/content.js';

const uploadId = '20000000-0000-4000-8000-000000000123';
const legacyId = '20000000-0000-4000-8000-000000000124';
const adminId = '20000000-0000-4000-8000-000000000199';
const env = {
  AUTH_ALLOW_LOCALHOST: 'true',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_hero_fixture_key',
  SUPABASE_SECRET_KEY: 'sb_secret_hero_fixture_key',
};
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01]);
const thumbnail = new Uint8Array(20);
thumbnail.set([0x52, 0x49, 0x46, 0x46], 0);
thumbnail.set([0x57, 0x45, 0x42, 0x50], 8);
thumbnail.set([0x56, 0x50, 0x38, 0x58], 12);

function uploadRequest() {
  const form = new FormData();
  form.set('file', new File([jpeg], 'hero.jpg', { type: 'image/jpeg' }));
  form.set('thumbnail', new File([thumbnail], 'hero.thumb.webp', { type: 'image/webp' }));
  form.set('upload_id', uploadId);
  return new Request('http://localhost/api/admin/hero-image', {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      cookie: 'phox-local-access=fixture-access; phox-local-refresh=fixture-refresh',
      'x-phox-request': '1',
    },
    body: form,
  });
}

test('首頁上傳縮圖可在部分失敗後安全重試，內容重新讀取仍指向已保存縮圖', async (context) => {
  const originalFetch = globalThis.fetch;
  const stored = new Map();
  let failThumbnailOnce = true;
  const content = {
    id: 1,
    hero_image_paths: [`${uploadId}.jpg`, `${legacyId}.webp`, 'static:/assets/portfolio/maid/01.webp'],
  };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') {
      return new Response(JSON.stringify({ id: adminId, email: 'fixture@example.invalid', email_confirmed_at: '2026-10-22T00:00:00Z' }), { status: 200 });
    }
    if (url.pathname === '/rest/v1/site_admins') {
      return new Response(JSON.stringify([{ user_id: adminId, active: true }]), { status: 200 });
    }
    if (url.pathname === '/rest/v1/site_content') return new Response(JSON.stringify([content]), { status: 200 });
    if (url.pathname.startsWith('/storage/v1/object/site-hero/')) {
      const path = decodeURIComponent(url.pathname.slice('/storage/v1/object/site-hero/'.length));
      if (options.method === 'POST' && path === `${uploadId}.thumb.webp` && failThumbnailOnce) {
        failThumbnailOnce = false;
        return new Response(JSON.stringify({ code: 'StorageUnavailable' }), { status: 503 });
      }
      if (options.method === 'POST' && stored.has(path)) {
        return new Response(JSON.stringify({ code: 'Duplicate', message: 'The resource already exists' }), { status: 409 });
      }
      if (options.method === 'POST') {
        stored.set(path, new Uint8Array(await new Response(options.body).arrayBuffer()));
        return new Response(JSON.stringify({ Key: `site-hero/${path}` }), { status: 200 });
      }
      if (options.method === 'GET' && stored.has(path)) return new Response(stored.get(path), { status: 200 });
      return new Response(JSON.stringify({ message: 'missing' }), { status: 404 });
    }
    assert.fail(`unexpected fixture request: ${options.method || 'GET'} ${url.pathname}`);
  };
  context.after(() => { globalThis.fetch = originalFetch; });

  const first = await uploadHeroImage({ request: uploadRequest(), env });
  assert.equal(first.status, 503, '縮圖首次保存失敗時不得回報整筆上傳成功');

  const retried = await uploadHeroImage({ request: uploadRequest(), env });
  const retriedBody = await retried.json();
  assert.equal(retried.status, 201);
  assert.deepEqual(retriedBody.image, {
    path: `${uploadId}.jpg`,
    url: `https://project.supabase.co/storage/v1/object/public/site-hero/${uploadId}.jpg`,
    thumbnail_path: `${uploadId}.thumb.webp`,
    thumbnail_url: `https://project.supabase.co/storage/v1/object/public/site-hero/${uploadId}.thumb.webp`,
  });
  assert.deepEqual(stored.get(`${uploadId}.thumb.webp`), thumbnail);

  const response = await readContent({
    request: new Request('http://localhost/api/admin/content', {
      headers: { cookie: 'phox-local-access=fixture-access; phox-local-refresh=fixture-refresh' },
    }),
    env,
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.content.hero_image_thumbnail_urls, [
    `https://project.supabase.co/storage/v1/object/public/site-hero/${uploadId}.thumb.webp`,
    `https://project.supabase.co/storage/v1/object/public/site-hero/${legacyId}.thumb.webp`,
    null,
  ]);
  assert.ok(stored.has(`${uploadId}.thumb.webp`), '重整後讀取的縮圖路徑在 Storage 已存在');
});
