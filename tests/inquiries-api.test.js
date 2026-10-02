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
