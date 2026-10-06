import assert from 'node:assert/strict';
import test from 'node:test';
import { submissionIdentityFor } from '../src/lib/inquiry-workflow.ts';

function deterministicCrypto() {
  let nextByte = 1;
  return {
    getRandomValues(bytes) {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = nextByte++ & 0xff;
      return bytes;
    },
  };
}

test('同一份提交內容重試時沿用識別，修改內容時使用新識別', () => {
  const cache = new Map();
  const source = deterministicCrypto();
  const original = { name: 'Luna', description: '自然光人像' };
  const first = submissionIdentityFor(original, cache, source);
  const retry = submissionIdentityFor({ ...original }, cache, source);
  const edited = submissionIdentityFor({ ...original, description: '街拍' }, cache, source);
  const restored = submissionIdentityFor(original, cache, source);

  assert.deepEqual(retry, first);
  assert.notEqual(edited.submission_id, first.submission_id);
  assert.deepEqual(restored, first);
  assert.match(first.submission_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(first.receipt_token, /^[0-9a-f]{64}$/);
});
