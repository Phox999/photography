import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { onRequest as uploadHeroImage } from '../functions/api/admin/hero-image.js';
import { onRequest as updateContent } from '../functions/api/admin/content.js';

const adminId = '11111111-1111-4111-8111-111111111111';
const env = {
  SUPABASE_URL: `https://${randomUUID().slice(0, 8)}.supabase.co`,
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
};

function jpeg() { return new Uint8Array([255, 216, 255, 219, 1, 2, 3, 4]); }
function webp() { return new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4, 87, 69, 66, 80, 86, 80, 56, 32]); }

function formFor(uploadId = randomUUID(), thumbBytes = webp(), thumbType = 'image/webp') {
  const form = new FormData();
  form.append('file', new Blob([jpeg()], { type: 'image/jpeg' }), 'portrait.jpg');
  form.append('upload_id', uploadId);
  form.append('thumbnail', new Blob([thumbBytes], { type: thumbType }), 'thumbnail.webp');
  return form;
}

function requestFor(form, method = 'POST', path = '/api/admin/hero-image') {
  return new Request(`https://phox999.com${path}`, {
    method,
    headers: {
      Origin: 'https://phox999.com',
      'X-Phox-Request': '1',
      Cookie: '__Host-phox-access=test-token',
    },
    body: form,
  });
}

function authFetch() {
  return async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.pathname === '/auth/v1/user') {
      return Response.json({ id: adminId, email: 'admin@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' });
    }
    if (url.pathname.startsWith('/rest/v1/site_admins')) {
      return Response.json([{ user_id: adminId, active: true }]);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  };
}

test('Hero upload stores and returns matching original and thumbnail paths', async (context) => {
  const previousFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = previousFetch; });
  const stored = new Map();
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.pathname === '/auth/v1/user' || url.pathname.startsWith('/rest/v1/site_admins')) return authFetch()(input, init);
    if (!url.pathname.startsWith('/storage/v1/object/site-hero/')) throw new Error(`Unexpected request: ${url.pathname}`);
    const path = decodeURIComponent(url.pathname.slice('/storage/v1/object/site-hero/'.length));
    stored.set(path, new Uint8Array(init.body));
    return Response.json({ Key: `site-hero/${path}` });
  };

  const uploadId = randomUUID();
  const response = await uploadHeroImage({ request: requestFor(formFor(uploadId)), env });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.deepEqual(body.image, {
    path: `${uploadId}.jpg`,
    url: `${env.SUPABASE_URL}/storage/v1/object/public/site-hero/${uploadId}.jpg`,
    thumbnail_path: `${uploadId}.thumb.webp`,
    thumbnail_url: `${env.SUPABASE_URL}/storage/v1/object/public/site-hero/${uploadId}.thumb.webp`,
  });
  assert.deepEqual([...stored.keys()].sort(), [`${uploadId}.jpg`, `${uploadId}.thumb.webp`].sort());
});

test('a partial Storage success can be retried with the same upload_id', async (context) => {
  const previousFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = previousFetch; });
  const stored = new Map();
  const posts = new Map();
  let failThumbnailOnce = true;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.pathname === '/auth/v1/user' || url.pathname.startsWith('/rest/v1/site_admins')) return authFetch()(input, init);
    if (!url.pathname.startsWith('/storage/v1/object/site-hero/')) throw new Error(`Unexpected request: ${url.pathname}`);
    const path = decodeURIComponent(url.pathname.slice('/storage/v1/object/site-hero/'.length));
    const method = init.method || 'GET';
    if (method === 'GET') return stored.has(path) ? new Response(stored.get(path)) : new Response('', { status: 404 });
    posts.set(path, (posts.get(path) || 0) + 1);
    if (path.endsWith('.thumb.webp') && failThumbnailOnce) {
      failThumbnailOnce = false;
      return Response.json({ message: 'Storage unavailable' }, { status: 503 });
    }
    if (stored.has(path)) return Response.json({ message: 'The resource already exists' }, { status: 409 });
    stored.set(path, new Uint8Array(init.body));
    return Response.json({ Key: `site-hero/${path}` });
  };

  const uploadId = randomUUID();
  const first = await uploadHeroImage({ request: requestFor(formFor(uploadId)), env });
  assert.equal(first.status, 503);
  const retry = await uploadHeroImage({ request: requestFor(formFor(uploadId)), env });
  assert.equal(retry.status, 201);
  assert.equal(posts.get(`${uploadId}.jpg`), 2);
  assert.equal(posts.get(`${uploadId}.thumb.webp`), 2);
  assert.deepEqual([...stored.keys()].sort(), [`${uploadId}.jpg`, `${uploadId}.thumb.webp`].sort());
});

test('Hero upload rejects malformed thumbnails and repeated multipart fields', async (context) => {
  const previousFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = authFetch();
  const badType = await uploadHeroImage({ request: requestFor(formFor(randomUUID(), webp(), 'image/png')), env });
  assert.equal(badType.status, 400);
  assert.equal((await badType.json()).code, 'invalid_input');

  const badSignature = await uploadHeroImage({ request: requestFor(formFor(randomUUID(), new Uint8Array(24), 'image/webp')), env });
  assert.equal(badSignature.status, 400);
  assert.equal((await badSignature.json()).code, 'invalid_input');

  const repeated = formFor();
  repeated.append('upload_id', randomUUID());
  const duplicateField = await uploadHeroImage({ request: requestFor(repeated), env });
  assert.equal(duplicateField.status, 400);
  assert.equal((await duplicateField.json()).code, 'invalid_input');
});

test('Hero content GET and PATCH return ordered thumbnails only when Storage confirms them', async (context) => {
  const previousFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = previousFetch; });
  const oldPath = '22222222-2222-4222-8222-222222222222.jpg';
  const newPath = '33333333-3333-4333-8333-333333333333.webp';
  const paths = ['static:/assets/hero.webp', oldPath, newPath];
  const content = {
    id: 1, announcement: '', announcement_enabled: false, faqs: [], hero_title: 'title', hero_copy: 'copy',
    hero_image_paths: paths, version: 1, updated_at: '2026-10-23T00:00:00Z',
  };
  const listRequests = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.pathname === '/auth/v1/user' || url.pathname.startsWith('/rest/v1/site_admins')) return authFetch()(input, init);
    if (url.pathname.startsWith('/rest/v1/site_content')) return Response.json([content]);
    if (url.pathname === '/rest/v1/rpc/admin_update_content') return Response.json(content);
    if (url.pathname === '/storage/v1/object/list/site-hero') {
      listRequests.push(JSON.parse(init.body));
      return Response.json([{ name: `${newPath.replace(/\.[^.]+$/, '')}.thumb.webp` }]);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  };

  const getResponse = await updateContent({ request: requestFor(undefined, 'GET', '/api/admin/content'), env });
  assert.equal(getResponse.status, 200);
  const getBody = await getResponse.json();
  assert.deepEqual(getBody.content.hero_image_thumbnail_urls, [null, null,
    `${env.SUPABASE_URL}/storage/v1/object/public/site-hero/${newPath.replace(/\.[^.]+$/, '')}.thumb.webp`]);
  assert.equal(getBody.content.hero_image_urls.length, paths.length);
  assert.equal(listRequests.length, 1);

  const patchBody = {
    announcement: '', announcement_enabled: false, faqs: [], hero_title: 'title', hero_copy: 'copy',
    hero_image_paths: paths, version: 1,
  };
  const patchRequest = new Request('https://phox999.com/api/admin/content', {
    method: 'PATCH',
    headers: {
      Origin: 'https://phox999.com', 'X-Phox-Request': '1',
      Cookie: '__Host-phox-access=test-token', 'Content-Type': 'application/json',
    },
    body: JSON.stringify(patchBody),
  });
  const patchResponse = await updateContent({ request: patchRequest, env });
  assert.equal(patchResponse.status, 200);
  const patchResult = await patchResponse.json();
  assert.deepEqual(patchResult.content.hero_image_thumbnail_urls, getBody.content.hero_image_thumbnail_urls);
});
