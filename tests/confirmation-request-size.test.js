import assert from 'node:assert/strict';
import test from 'node:test';
import { readJson } from '../server/auth.js';
import { confirmationUpdate } from '../server/inquiry-workflow.js';
import {
  CONFIRMATION_BODY_MAX_BYTES,
  CONFIRMATION_BODY_WORST_CASE_BYTES,
  confirmationBodyByteLength,
} from '../src/lib/confirmation-request-size.js';

function requestWithJson(source) {
  return new Request('https://example.test/confirmation', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: source,
  });
}

function asciiJsonOfSize(size) {
  const overhead = Buffer.byteLength('{"value":""}');
  return `{"value":"${'x'.repeat(size - overhead)}"}`;
}

test('有限上限涵蓋五個文字欄位、地點、地圖連結及 JSON 轉義餘量', () => {
  assert.equal(CONFIRMATION_BODY_WORST_CASE_BYTES, 74600);
  assert.ok(CONFIRMATION_BODY_WORST_CASE_BYTES < CONFIRMATION_BODY_MAX_BYTES);
});

test('所有欄位達既有上限的合法 payload 可通過 byte 預算及後端驗證', async () => {
  const loneSurrogate = String.fromCharCode(0xd800);
  const mapUrlPrefix = 'https://example.com/';
  const payload = {
    version: 1,
    status: 'draft',
    slotId: null,
    location: loneSurrogate.repeat(300),
    mapUrl: mapUrlPrefix + 'x'.repeat(2048 - mapUrlPrefix.length),
    wardrobe: loneSurrogate.repeat(2000),
    bring: loneSurrogate.repeat(2000),
    rainPlan: loneSurrogate.repeat(2000),
    deliveryNote: loneSurrogate.repeat(2000),
    publicationNote: loneSurrogate.repeat(2000),
  };
  const source = JSON.stringify(payload);
  assert.ok(confirmationBodyByteLength(payload) <= CONFIRMATION_BODY_WORST_CASE_BYTES);
  const parsed = await readJson(requestWithJson(source), CONFIRMATION_BODY_MAX_BYTES);
  assert.doesNotThrow(() => confirmationUpdate(parsed));
});

test('readJson accepts cap minus one and cap bytes, and rejects cap plus one', async () => {
  for (const size of [CONFIRMATION_BODY_MAX_BYTES - 1, CONFIRMATION_BODY_MAX_BYTES]) {
    const parsed = await readJson(requestWithJson(asciiJsonOfSize(size)), CONFIRMATION_BODY_MAX_BYTES);
    assert.equal(Buffer.byteLength(JSON.stringify(parsed)), size);
  }
  await assert.rejects(
    readJson(requestWithJson(asciiJsonOfSize(CONFIRMATION_BODY_MAX_BYTES + 1)), CONFIRMATION_BODY_MAX_BYTES),
    (error) => error?.status === 413,
  );
});
