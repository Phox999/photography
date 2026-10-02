import assert from 'node:assert/strict';
import test from 'node:test';
import { portfolioChanges, portfolioUpdate } from '../server/admin-validation.js';
import { portfolioChangeSet, portfolioChangesByteLength } from '../src/lib/portfolio-changes.js';

const images = Array.from({ length: 500 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}.webp`);

function collection(slug, overrides = {}) {
  return {
    slug,
    title: `作品 ${slug}`,
    category: '外拍',
    description: '',
    cover: images[0],
    images: [images[0]],
    totalImages: 1,
    ...overrides,
  };
}

function rejected(callback) {
  assert.throws(callback);
}

test('增量差異只包含新增或修改項目，並獨立保留刪除和新順序', () => {
  const before = [collection('a'), collection('b'), collection('c')];
  assert.deepEqual(portfolioChangeSet(before, structuredClone(before)), {
    upserts: [], deleted_slugs: [], order: ['a', 'b', 'c'],
  });

  const after = [collection('c'), collection('b', { title: '更新後的作品 b' }), collection('new')];
  assert.deepEqual(portfolioChangeSet(before, after), {
    upserts: [after[1], after[2]], deleted_slugs: ['a'], order: ['c', 'b', 'new'],
  });
});

test('變更 API 驗證單筆資料並映射成 RPC 參數', () => {
  const payload = portfolioChanges({
    upserts: [collection('new')], deleted_slugs: ['old'], order: ['new', 'kept'], version: 4,
  });
  assert.equal(payload.p_upserts.length, 1);
  assert.deepEqual(payload.p_deleted_slugs, ['old']);
  assert.deepEqual(payload.p_order, ['new', 'kept']);
  assert.equal(payload.p_version, 4);
  assert.equal(portfolioUpdate({ collections: [collection('a')], version: 1 }).p_collections.length, 1);
});

test('變更 API 拒絕重複、衝突、非法項目與超出數量上限的內容', () => {
  rejected(() => portfolioChanges({ upserts: [collection('a'), collection('a')], deleted_slugs: [], order: ['a'], version: 1 }));
  rejected(() => portfolioChanges({ upserts: [collection('a')], deleted_slugs: ['a'], order: ['a'], version: 1 }));
  rejected(() => portfolioChanges({ upserts: [collection('a')], deleted_slugs: [], order: ['a', 'a'], version: 1 }));
  rejected(() => portfolioChanges({ upserts: [collection('bad', { images: ['https://example.test/photo.jpg'] })], deleted_slugs: [], order: ['bad'], version: 1 }));
  rejected(() => portfolioChanges({ upserts: [], deleted_slugs: [], order: [], version: 1, extra: true }));

  const tooManyCollections = Array.from({ length: 81 }, (_, index) => collection(`work-${index}`));
  rejected(() => portfolioChanges({ upserts: tooManyCollections, deleted_slugs: [], order: tooManyCollections.map((item) => item.slug), version: 1 }));
  rejected(() => portfolioUpdate({ collections: [collection('over', { images: [...images, '00000000-0000-4000-8000-000000000501.webp'], totalImages: 501 })], version: 1 }));
});

test('完整 80 組、每組 500 張的有效變更仍落在 8 MiB 上限內', () => {
  const allImages = images;
  const upserts = Array.from({ length: 80 }, (_, index) => collection(`work-${index}`, {
    cover: allImages[0], images: allImages, totalImages: allImages.length,
  }));
  const changeSet = { ...portfolioChangeSet([], upserts), version: 1 };
  const bytes = portfolioChangesByteLength(changeSet);
  assert.ok(bytes < 8 * 1024 * 1024, `serialized request is ${bytes} bytes`);
  assert.equal(portfolioChanges(changeSet).p_upserts.length, 80);
});
