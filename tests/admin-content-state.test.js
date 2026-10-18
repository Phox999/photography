import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contentChangeSummary,
  hasHeroImageCapacity,
  hasIncompleteUploads,
  moveItem,
  restoreItem,
  uploadTaskIds,
  validateHeroUpload,
} from '../src/lib/admin-content-state.js';

test('輪播可移動到指定位置，且不改動載入基準陣列', () => {
  const original = ['a', 'b', 'c'];
  assert.deepEqual(moveItem(original, 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(original, ['a', 'b', 'c']);
});

test('移出照片後可在原位置復原，且不會重複插入', () => {
  const image = { path: 'b' };
  const remaining = [{ path: 'a' }, { path: 'c' }];
  const restored = restoreItem(remaining, image, 1);
  assert.deepEqual(restored, [{ path: 'a' }, image, { path: 'c' }]);
  assert.deepEqual(restoreItem(restored, image, 1), restored);
});

test('變更摘要會辨識文字、照片新增移出、既有照片排序、公告與 FAQ', () => {
  const before = {
    hero_title: '原標題', hero_copy: '介紹',
    hero_image_paths: ['a', 'b', 'c'],
    announcement: '', announcement_enabled: false,
    faqs: [{ question: 'Q', answer: 'A' }],
  };
  const after = {
    ...before,
    hero_title: '新標題',
    hero_image_paths: ['c', 'a', 'new'],
    announcement: '公告', announcement_enabled: true,
    faqs: [{ question: 'Q2', answer: 'A2' }],
  };
  assert.deepEqual(contentChangeSummary(before, after), [
    '首頁文字已修改',
    '新增 1 張照片、移出 1 張照片',
    '照片順序已調整',
    '公告已修改',
    '常見問題已修改',
  ]);
});

test('新增與移出本身不誤報原有照片順序變動', () => {
  const before = { hero_image_paths: ['a', 'b'], faqs: [] };
  const after = { ...before, hero_image_paths: ['a', 'new'] };
  assert.deepEqual(contentChangeSummary(before, after), ['新增 1 張照片、移出 1 張照片']);
});

test('上傳限制保留 JPEG、PNG、WebP 與 8 MiB 上限', () => {
  assert.equal(validateHeroUpload({ type: 'image/jpeg', size: 1 }), '');
  assert.equal(validateHeroUpload({ type: 'image/png', size: 8 * 1024 * 1024 }), '');
  assert.match(validateHeroUpload({ type: 'image/gif', size: 1 }), /JPEG、PNG 或 WebP/);
  assert.match(validateHeroUpload({ type: 'image/webp', size: 8 * 1024 * 1024 + 1 }), /超過 8 MiB/);
  assert.match(validateHeroUpload({ type: 'image/webp', size: 0 }), /空的/);
});

test('輪播在 9 張仍可加入照片，10 張時明確達到上限', () => {
  assert.equal(hasHeroImageCapacity(9), true);
  assert.equal(hasHeroImageCapacity(10), false);
  assert.equal(hasHeroImageCapacity(11), false);
});

test('上傳重試只挑選待傳項目或明確選取的失敗項目，不重傳成功項目', () => {
  const queue = [
    { id: 'queued', status: 'queued' },
    { id: 'failed', status: 'failed' },
    { id: 'uploaded', status: 'uploaded' },
  ];
  assert.deepEqual(uploadTaskIds(queue), ['queued']);
  assert.deepEqual(uploadTaskIds(queue, { retryFailedIds: ['failed'], includeQueued: false }), ['failed']);
  assert.equal(hasIncompleteUploads(queue), true);
  assert.equal(hasIncompleteUploads([{ status: 'uploaded' }]), false);
});
