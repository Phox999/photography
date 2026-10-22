import assert from 'node:assert/strict';
import test from 'node:test';
import { stat, readFile } from 'node:fs/promises';
import { portfolioAdminCatalog } from '../src/data/portfolioCatalog.ts';
import { portfolioThumbnailSource, setPortfolioThumbnailSource } from '../src/lib/portfolio-thumbnails.ts';

test('所有靜態後臺照片與獨立封面都有實際可讀的小圖，且不混入照片目錄', async () => {
  const sources = new Set(portfolioAdminCatalog.flatMap(({ cover, images }) => [cover, ...images]));
  assert.ok(sources.size > 1000);
  for (const source of sources) {
    const thumbnail = portfolioThumbnailSource(source);
    assert.match(thumbnail, /^\/assets\/portfolio-thumbnails\/[a-f0-9]{24}-384\.webp$/);
    const file = new URL(`../public${thumbnail}`, import.meta.url);
    assert.ok((await stat(file)).size > 0);
    const header = await readFile(file);
    assert.equal(header.subarray(0, 4).toString(), 'RIFF');
    assert.equal(header.subarray(8, 12).toString(), 'WEBP');
  }
});

test('小圖失敗不自動載入原圖，重用封面元素不會退回前一作品', () => {
  const events = new Map();
  const image = { dataset: {}, addEventListener(type, listener) { events.set(type, listener); } };
  const [first, second] = portfolioAdminCatalog;
  setPortfolioThumbnailSource(image, first.cover);
  assert.equal(image.src, portfolioThumbnailSource(first.cover));
  setPortfolioThumbnailSource(image, second.cover);
  events.get('error')();
  assert.equal(image.src, portfolioThumbnailSource(second.cover));
  image.src = 'sentinel';
  events.get('error')();
  assert.equal(image.src, 'sentinel');
  const uploaded = 'https://project.supabase.co/storage/v1/object/public/site-portfolio/new.webp';
  assert.equal(portfolioThumbnailSource(uploaded), uploaded);
});

test('管理後台的小圖不存在時只退回目前照片原圖一次', () => {
  const events = new Map();
  const image = { dataset: {}, addEventListener(type, listener) { events.set(type, listener); } };
  const [first, second] = portfolioAdminCatalog;
  setPortfolioThumbnailSource(image, first.cover, '', { fallbackToOriginalOnError: true });
  events.get('error')();
  assert.equal(image.src, first.cover);
  assert.equal(image.dataset.originalFallback, 'true');

  setPortfolioThumbnailSource(image, second.cover, '', { fallbackToOriginalOnError: true });
  events.get('error')();
  assert.equal(image.src, second.cover, '重用圖片元素時只會回到目前作品原圖');
  assert.equal(image.dataset.originalFallback, 'true');
  events.get('error')();
  assert.equal(image.dataset.thumbnailFailed, 'true', '原圖也失敗時會記錄終止狀態，不再循環');
});
