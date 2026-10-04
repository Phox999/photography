import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequest } from '../functions/api/cooperation.js';

function request(method, options = {}) {
  return new Request('https://example.test/api/cooperation', {
    method,
    headers: options.headers,
    body: options.body,
  });
}

test('GET without a private receipt token is rejected before any upstream request', async () => {
  const response = await onRequest({ request: request('GET'), env: {} });
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.code, 'invalid_receipt');
});

test('POST rejects malformed lookup codes before any upstream request', async () => {
  const response = await onRequest({
    request: request('POST', {
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://example.test',
        'X-PHOX-Request': '1',
      },
      body: JSON.stringify({ reference: 'PHOX-1234' }),
    }),
    env: {},
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.code, 'invalid_reference');
});

test('POST lookup requires same-origin JSON requests', async () => {
  const response = await onRequest({
    request: request('POST', {
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example',
        'X-PHOX-Request': '1',
      },
      body: JSON.stringify({ reference: 'PHOX-0123456789ABCDEF0123' }),
    }),
    env: {},
  });
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.code, 'invalid_origin');
});

test('unsupported methods advertise GET and POST only', async () => {
  const response = await onRequest({ request: request('PUT'), env: {} });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, POST');
});
