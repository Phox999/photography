import assert from 'node:assert/strict';
import test from 'node:test';
import { persistInquiry } from '../server/inquiry-references.js';

const config = { url: 'https://supabase.example', key: 'sb_secret_test' };
const workflow = {
  submissionId: '123e4567-e89b-42d3-a456-426614174000',
  token: '0'.repeat(64),
  tokenHash: '0'.repeat(64),
  requestHash: '1'.repeat(64),
};

async function withResponses(responses, run) {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    const response = responses[requestCount++];
    assert.ok(response, 'unexpected upstream request');
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    await run(() => requestCount);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

for (const rejection of [
  { status: 400, code: '23514', message: 'collaboration type check failed' },
  { status: 404, code: 'PGRST202', message: 'function not found' },
]) test(`upstream ${rejection.code} is a definite rejection, not an ambiguous submission`, async () => {
  await withResponses([
    { status: 200, body: null },
    { status: rejection.status, body: { code: rejection.code, message: rejection.message } },
  ], async (requestCount) => {
    await assert.rejects(
      persistInquiry(config, {}, [], workflow),
      (error) => error.code === `upstream_http_${rejection.status}`
        && error.status === 503
        && error.code !== 'inquiry_submission_unconfirmed',
    );
    assert.equal(requestCount(), 2);
  });
});

test('ambiguous upstream failure logs only its diagnostic code', async () => {
  const originalError = console.error;
  const diagnostics = [];
  console.error = (...values) => diagnostics.push(values);
  try {
    await withResponses([
      { status: 200, body: null },
      { status: 500, body: { code: 'XX000', message: 'private provider detail' } },
    ], async () => {
      await assert.rejects(
        persistInquiry(config, {}, [], workflow),
        (error) => error.code === 'inquiry_submission_unconfirmed',
      );
    });
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(diagnostics, [['Inquiry submission result is ambiguous', 'upstream_http_500']]);
});
