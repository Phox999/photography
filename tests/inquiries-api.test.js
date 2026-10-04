import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequest } from '../functions/api/inquiries.js';

const validPayload = {
  name: 'Luna',
  contact_method: 'Instagram',
  contact_account: '@luna',
  collaboration_type: '標準方案(3hr)',
  preferred_date: '',
  description: '想拍攝一組自然光人像。',
  reference_links: [],
  consent: true,
};

async function submit(payload) {
  const request = new Request('https://example.test/api/inquiries', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://example.test',
    },
    body: JSON.stringify(payload),
  });
  const response = await onRequest({ request, env: {} });
  return { status: response.status, body: await response.json() };
}

test('API 仍會拒絕每一個缺少必要欄位的直接請求', async (t) => {
  for (const field of ['name', 'contact_method', 'contact_account', 'collaboration_type', 'description']) {
    await t.test(`缺少 ${field}`, async () => {
      const payload = { ...validPayload };
      delete payload[field];
      const result = await submit(payload);
      assert.equal(result.status, 400);
      assert.equal(result.body.success, false);
    });
  }
});

test('API 拒絕空白姓名、未同意內容與不允許的選項', async () => {
  for (const payload of [
    { ...validPayload, name: '   ' },
    { ...validPayload, consent: false },
    { ...validPayload, contact_method: 'Discord' },
    { ...validPayload, collaboration_type: '自訂方案' },
  ]) {
    const result = await submit(payload);
    assert.equal(result.status, 400);
    assert.equal(result.body.success, false);
  }
});

test('API 將收藏驗證後寫入收件流程，拒絕下架與不合法照片', async () => {
  const originalFetch = globalThis.fetch;
  const favorite = { slug: 'maid', title: '舊標題', image: '/assets/portfolio/maid/01.webp', number: 5 };
  let stored;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/get_public_portfolio_content')) {
      assert.equal(options.headers.get('apikey'), 'sb_publishable_test');
      return new Response(JSON.stringify({ version: 1, collections: [{ slug: 'maid', title: '海岸冬日', category: '外拍', description: '', cover: 'static:/assets/portfolio/maid/01.webp', images: ['static:/assets/portfolio/maid/01.webp'], totalImages: 1 }] }));
    }
    if (url.endsWith('/find_inquiry_receipt')) return new Response('null');
    if (url.endsWith('/submit_workflow_inquiry')) {
      stored = JSON.parse(options.body).p_payload;
      return new Response(JSON.stringify({ reference: 'PHOX-' + 'A'.repeat(20), createdAt: '2026-10-05T00:00:00Z', created: true }));
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const send = payload => onRequest({ request: new Request('https://example.test/api/inquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), env: { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' } });
  try {
    const success = await send({ ...validPayload, portfolio_favorites: [favorite] });
    assert.equal(success.status, 201);
    assert.deepEqual(stored.portfolio_favorites, [{ ...favorite, title: '海岸冬日', number: 1 }]);
    const missing = await send({ ...validPayload, portfolio_favorites: [{ ...favorite, image: '/assets/portfolio/maid/02.webp' }] });
    assert.equal(missing.status, 400); assert.equal((await missing.json()).code, 'favorite_unavailable');
    assert.equal((await send({ ...validPayload, portfolio_favorites: [{ ...favorite, image: 'https://evil.example/a.webp' }] })).status, 400);
    assert.equal((await send(validPayload)).status, 201); assert.equal(Object.hasOwn(stored, 'portfolio_favorites'), false);
  } finally { globalThis.fetch = originalFetch; }
});
