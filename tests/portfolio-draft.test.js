import assert from 'node:assert/strict';
import test from 'node:test';
import liveFixture from './fixtures/portfolio-live-2026-10-10.json' with { type: 'json' };
import { portfolioDraftIssues } from '../src/lib/portfolio-validation.js';
import { portfolioChangeSet } from '../src/lib/portfolio-changes.js';
import { portfolioChanges, portfolioUpdate } from '../server/admin-validation.js';

function toDraft(collection) {
  const { href, ...draft } = collection;
  return { ...draft, cover: `static:${draft.cover}`, images: draft.images.map((url) => `static:${url}`) };
}

test('既有獨立 cover.webp 不會阻擋全站排序，且不改照片清單或總數', () => {
  const before = liveFixture.collections.map(toDraft);
  const separateCovers = before.filter((item) => !item.images.includes(item.cover));
  assert.ok(separateCovers.length > 0, 'regression fixture must include standalone covers');
  assert.deepEqual(portfolioDraftIssues(before), []);
  const after = [before[1], before[0], ...before.slice(2)];
  const changes = portfolioChangeSet(before, after);
  assert.deepEqual(changes.upserts, []);
  assert.deepEqual(portfolioChanges({ ...changes, version: 6 }).p_order, after.map((item) => item.slug));
  const result = portfolioUpdate({ collections: after, version: 6 });
  assert.deepEqual(result.p_collections, after);
});

test('修改獨立封面作品的標題或照片排序仍能通過前後端發佈驗證', () => {
  const before = liveFixture.collections.map(toDraft);
  const legacy = before.find((item) => !item.images.includes(item.cover));
  const changed = { ...legacy, title: `${legacy.title} 更新`, images: [...legacy.images].reverse() };
  assert.deepEqual(portfolioDraftIssues([changed]), []);
  const changes = portfolioChangeSet(before, before.map((item) => item.slug === changed.slug ? changed : item));
  assert.deepEqual(portfolioChanges({ ...changes, version: 6 }).p_upserts, [changed]);
});

test('仍拒絕其他作品的獨立封面、無關上傳封面及不安全路徑', () => {
  const item = liveFixture.collections.map(toDraft)[0];
  for (const cover of ['static:/assets/portfolio/another/cover.webp', '00000000-0000-4000-8000-000000000999.webp', 'static:/assets/portfolio/../cover.webp']) {
    const changed = { ...item, cover };
    assert.ok(portfolioDraftIssues([changed]).length);
    assert.throws(() => portfolioUpdate({ collections: [changed], version: 6 }));
  }
});

test('未完成草稿會指出需修正的作品與原因', () => {
  const item = liveFixture.collections.map(toDraft)[0];
  const draft = { ...item, slug: 'new', title: '', images: [], totalImages: 0 };
  const issues = portfolioDraftIssues([item, draft]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].slug, 'new');
  assert.match(issues[0].message, /作品名稱/);
  assert.match(portfolioDraftIssues([{ ...item, images: [] }])[0].message, /照片/);
});
