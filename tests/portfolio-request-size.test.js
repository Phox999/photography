import assert from 'node:assert/strict';
import test from 'node:test';
import { readJson } from '../server/auth.js';
import { PORTFOLIO_CHANGES_MAX_BYTES } from '../src/lib/portfolio-changes.js';

function requestWithBodySize(size) {
  const prefix = '{"payload":"';
  const suffix = '"}';
  const body = `${prefix}${'x'.repeat(size - prefix.length - suffix.length)}${suffix}`;
  assert.equal(new TextEncoder().encode(body).byteLength, size);
  return new Request('https://example.test/api/admin/portfolio-changes', { method: 'POST', body });
}

test('變更 API JSON 讀取器接受剛好 8 MiB，拒絕超過 1 byte', async () => {
  const exact = await readJson(requestWithBodySize(PORTFOLIO_CHANGES_MAX_BYTES), PORTFOLIO_CHANGES_MAX_BYTES);
  assert.equal(exact.payload.length, PORTFOLIO_CHANGES_MAX_BYTES - '{"payload":"'.length - '"}'.length);

  await assert.rejects(
    readJson(requestWithBodySize(PORTFOLIO_CHANGES_MAX_BYTES + 1), PORTFOLIO_CHANGES_MAX_BYTES),
    (error) => error.status === 413 && error.code === 'payload_too_large',
  );
});
