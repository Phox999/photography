import assert from 'node:assert/strict';
import test from 'node:test';
import {
  movePhotosBetweenCollections,
  removePhotosFromCollection,
  reorderCollection,
  reorderPhoto,
  restoreMovedPhotos,
} from '../src/lib/portfolio-workbench.js';

const staticPhoto = (name) => ({ path: `static:/assets/portfolio/set/${name}.webp`, url: `/assets/portfolio/set/${name}.webp` });
const storagePhoto = (index) => {
  const id = String(index).padStart(12, '0');
  return { path: `00000000-0000-4000-8000-${id}.webp`, url: `https://project.supabase.co/storage/v1/object/public/site-portfolio/00000000-0000-4000-8000-${id}.webp` };
};
const collection = (slug, photos, extra = {}) => ({
  slug,
  title: slug,
  category: '外拍',
  description: '',
  cover: photos[0]?.path ?? '',
  coverUrl: photos[0]?.url ?? '',
  images: photos,
  totalImages: photos.length,
  ...extra,
});

test('以 slug 將作品系列移至指定位置並保留其他項目順序', () => {
  const items = ['a', 'b', 'c', 'd'].map((slug) => collection(slug, [staticPhoto(slug)]));
  const result = reorderCollection(items, 'd', 0);
  assert.deepEqual(result.map((item) => item.slug), ['d', 'a', 'b', 'c']);
  assert.deepEqual(items.map((item) => item.slug), ['a', 'b', 'c', 'd']);
});

test('以圖片路徑作穩定鍵重新排序', () => {
  const photos = [staticPhoto('a'), storagePhoto(2), staticPhoto('c')];
  assert.deepEqual(reorderPhoto(photos, photos[2].path, 0).map((photo) => photo.path), [photos[2].path, photos[0].path, photos[1].path]);
});

test('大量移動依來源順序追加路徑，保護來源封面與總數', () => {
  const sourcePhotos = Array.from({ length: 48 }, (_, index) => storagePhoto(index + 1));
  const targetPhotos = Array.from({ length: 184 }, (_, index) => storagePhoto(index + 1000));
  const source = collection('source', sourcePhotos, { totalImages: 55 });
  const target = collection('target', targetPhotos, { totalImages: 190 });
  const selected = [sourcePhotos[11].path, sourcePhotos[3].path, sourcePhotos[8].path];
  const result = movePhotosBetweenCollections([source, target], 'source', 'target', selected);
  assert.equal(result.collections[0].images.length, 45);
  assert.equal(result.collections[1].images.length, 187);
  assert.equal(result.collections[0].totalImages, 52);
  assert.equal(result.collections[1].totalImages, 193);
  assert.deepEqual(result.movedPhotos.map((photo) => photo.path), [sourcePhotos[3].path, sourcePhotos[8].path, sourcePhotos[11].path]);
  assert.equal(result.collections[1].cover, target.cover);
  assert.equal(result.collections[0].cover, source.cover);
});

test('移走來源封面後改用剩餘第一張，並可精準復原路徑順序', () => {
  const photos = [staticPhoto('cover'), storagePhoto(2), staticPhoto('third'), storagePhoto(4)];
  const source = collection('source', photos, { totalImages: 6 });
  const target = collection('target', [storagePhoto(20)], { totalImages: 3 });
  const moved = movePhotosBetweenCollections([source, target], 'source', 'target', [photos[0].path, photos[2].path]);
  assert.equal(moved.collections[0].cover, photos[1].path);
  assert.equal(moved.collections[0].coverUrl, photos[1].url);

  const editedSource = { ...moved.collections[0], images: [...moved.collections[0].images, staticPhoto('newer')] };
  const restored = restoreMovedPhotos([editedSource, moved.collections[1]], moved.undo);
  assert.deepEqual(restored[0].images.map((photo) => photo.path), [photos[0].path, photos[1].path, photos[2].path, photos[3].path, staticPhoto('newer').path]);
  assert.equal(restored[0].cover, source.cover);
  assert.deepEqual(restored[1].images.map((photo) => photo.path), [target.images[0].path]);
  assert.equal(restored[1].cover, target.cover);
  assert.equal(restored[1].totalImages, target.totalImages);
});

test('禁止相同路徑重複、清空來源及超出 500 張', () => {
  const one = staticPhoto('one');
  const two = storagePhoto(2);
  assert.throws(() => movePhotosBetweenCollections([collection('a', [one]), collection('b', [two])], 'a', 'b', [one.path]), /至少需要一張/);
  assert.throws(() => movePhotosBetweenCollections([collection('a', [one, two]), collection('b', [one])], 'a', 'b', [one.path]), /相同照片/);
  const three = staticPhoto('three');
  const target = collection('b', Array.from({ length: 499 }, (_, index) => storagePhoto(index + 100)));
  assert.throws(() => movePhotosBetweenCollections([collection('a', [one, two, three]), target], 'a', 'b', [one.path, two.path]), /最多可放 500 張/);
});

test('批次移除只移除作品引用並在封面被移除時更新封面', () => {
  const photos = [staticPhoto('cover'), storagePhoto(2), staticPhoto('third')];
  const result = removePhotosFromCollection(collection('a', photos, { totalImages: 5 }), [photos[0].path, photos[2].path]);
  assert.deepEqual(result.images, [photos[1]]);
  assert.equal(result.cover, photos[1].path);
  assert.equal(result.totalImages, 3);
  assert.throws(() => removePhotosFromCollection(collection('a', photos), photos.map((photo) => photo.path)), /至少需要一張/);
});

test('連續移動來源最前八張後，復原回到原順序且保留其他新增照片', () => {
  const photos = Array.from({ length: 48 }, (_, index) => storagePhoto(index + 1));
  const source = collection('a', photos);
  const target = collection('b', [storagePhoto(1000)]);
  const moved = movePhotosBetweenCollections([source, target], 'a', 'b', photos.slice(0, 8).map((photo) => photo.path));
  const extra = staticPhoto('newer');
  moved.collections[0].images.push(extra);
  const restored = restoreMovedPhotos(moved.collections, moved.undo);
  assert.deepEqual(restored[0].images.map((photo) => photo.path), [...photos, extra].map((photo) => photo.path));
});

test('復原會保護目的地封面，且目的地無其他照片時整筆拒絕', () => {
  const photos = [staticPhoto('one'), staticPhoto('two'), staticPhoto('three')];
  const targetPhoto = storagePhoto(1000);
  const moved = movePhotosBetweenCollections([collection('a', photos), collection('b', [targetPhoto])], 'a', 'b', [photos[0].path]);
  moved.collections[1].cover = photos[0].path;
  moved.collections[1].coverUrl = photos[0].url;
  const restored = restoreMovedPhotos(moved.collections, moved.undo);
  assert.equal(restored[1].cover, targetPhoto.path);
  assert.equal(restored[1].coverUrl, targetPhoto.url);
  const emptyTarget = { ...moved.collections[1], images: [photos[0]], cover: photos[0].path };
  assert.throws(() => restoreMovedPhotos([moved.collections[0], emptyTarget], moved.undo), /目的地必須至少保留一張/);
});
