import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { inspectPortfolioUpload } from '../src/lib/portfolio-upload.js';

test('讀取真實 JPEG、透明 PNG、WebP 尺寸，拒絕偽裝副檔名與損毀檔頭', async () => {
  const source = sharp({ create: { width: 80, height: 40, channels: 4, background: { r: 200, g: 80, b: 40, alpha: 0.5 } } });
  for (const [format, type, extension] of [['jpeg', 'image/jpeg', 'jpg'], ['png', 'image/png', 'png'], ['webp', 'image/webp', 'webp']]) {
    const buffer = await source.clone().toFormat(format).toBuffer();
    assert.deepEqual(await inspectPortfolioUpload(new File([buffer], `image.${extension}`, { type })), { width: 80, height: 40 });
  }
  const png = await source.clone().png().toBuffer();
  const tinyWebp = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#fff' } }).webp({ lossless: true }).toBuffer();
  assert.deepEqual(await inspectPortfolioUpload(new File([tinyWebp], 'tiny.webp', { type: 'image/webp' })), { width: 1, height: 1 });
  await assert.rejects(inspectPortfolioUpload(new File([png], 'disguised.jpg', { type: 'image/jpeg' })), /檔頭/);
  await assert.rejects(inspectPortfolioUpload(new File([new Uint8Array([255,216,255,0])], 'broken.jpg', { type: 'image/jpeg' })), /檔頭/);
});

test('在解碼前拒絕超大像素標頭與超出來源容量的檔案', async () => {
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).png().toBuffer();
  png.writeUInt32BE(50000, 16); png.writeUInt32BE(50000, 20);
  await assert.rejects(inspectPortfolioUpload(new File([png], 'large.png', { type: 'image/png' })), /4000 萬像素/);
  await assert.rejects(inspectPortfolioUpload({ name: 'large.jpg', type: 'image/jpeg', size: 40 * 1024 * 1024 + 1 }), /40 MiB/);
});
