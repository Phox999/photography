import assert from 'node:assert/strict';
import test from 'node:test';
import { moveSelectedPhotos, photoSelectionState, removeSelectedPhotos, selectPhotoRange } from '../src/lib/portfolio-photo-selection.js';

const photos = ['a', 'b', 'c', 'd', 'e'].map(path => ({ path, url: `${path}.webp` }));
const select = (...paths) => new Set(paths);
const paths = images => images.map(photo => photo.path);

test('Shift selection adds the inclusive range in either direction and preserves other selections', () => {
  assert.deepEqual([...selectPhotoRange(photos, select('e'), 'b', 'd')].sort(), ['b', 'c', 'd', 'e']);
  assert.deepEqual([...selectPhotoRange(photos, select(), 'd', 'b')], ['b', 'c', 'd']);
  assert.deepEqual([...selectPhotoRange(photos, select(), 'missing', 'c')], ['c']);
  assert.deepEqual([...selectPhotoRange(photos, select('a'), 'b', 'missing')], ['a']);
});

test('bulk reorder moves contiguous and separate selections one position without changing relative order', () => {
  assert.deepEqual(paths(moveSelectedPhotos(photos, select('b', 'c'), 'up')), ['b', 'c', 'a', 'd', 'e']);
  assert.deepEqual(paths(moveSelectedPhotos(photos, select('b', 'c'), 'down')), ['a', 'd', 'b', 'c', 'e']);
  assert.deepEqual(paths(moveSelectedPhotos(photos, select('a', 'c', 'e'), 'up')), ['a', 'c', 'b', 'e', 'd']);
  assert.deepEqual(paths(moveSelectedPhotos(photos, select('a', 'c', 'e'), 'down')), ['b', 'a', 'd', 'c', 'e']);
  assert.deepEqual(paths(photos), ['a', 'b', 'c', 'd', 'e']);
});

test('all-selected and boundary selections do not wrap or lose photos', () => {
  for (const direction of ['up', 'down']) assert.deepEqual(paths(moveSelectedPhotos(photos, select(...paths(photos)), direction)), paths(photos));
  assert.deepEqual(paths(moveSelectedPhotos(photos, select('a'), 'up')), paths(photos));
  assert.deepEqual(paths(moveSelectedPhotos(photos, select('e'), 'down')), paths(photos));
});

test('selection state handles none, partial, all and stale paths', () => {
  const none = photoSelectionState(photos, select(), 'a');
  assert.equal(none.count, 0); assert.equal(none.clearDisabled, true); assert.equal(none.removeDisabled, true);
  const partial = photoSelectionState(photos, select('b', 'missing'), 'a');
  assert.equal(partial.count, 1); assert.equal(partial.partlySelected, true); assert.equal(partial.coverDisabled, false);
  const all = photoSelectionState(photos, select(...paths(photos)), 'a');
  assert.equal(all.allSelected, true); assert.equal(all.partlySelected, false); assert.equal(all.removeDisabled, true);
  assert.equal(all.upDisabled, true); assert.equal(all.downDisabled, true);
});

test('setting a cover requires exactly one selected non-cover photo', () => {
  assert.equal(photoSelectionState(photos, select('a'), 'a').coverDisabled, true);
  assert.equal(photoSelectionState(photos, select('b', 'c'), 'a').coverDisabled, true);
  assert.equal(photoSelectionState(photos, select('c'), 'a').coverDisabled, false);
});

test('batch removal preserves the current cover or chooses the first remaining photo', () => {
  const keepCover = removeSelectedPhotos(photos, select('b', 'd'), 'c');
  assert.deepEqual(paths(keepCover.images), ['a', 'c', 'e']);
  assert.equal(keepCover.cover, 'c'); assert.equal(keepCover.coverUrl, 'c.webp');
  const replaceCover = removeSelectedPhotos(photos, select('a', 'b', 'c'), 'a');
  assert.deepEqual(paths(replaceCover.images), ['d', 'e']);
  assert.equal(replaceCover.cover, 'd'); assert.equal(replaceCover.coverUrl, 'd.webp');
  assert.equal(removeSelectedPhotos(photos, select(...paths(photos)), 'a'), null);
  assert.equal(removeSelectedPhotos(photos, select('missing'), 'a'), null);
  assert.deepEqual(paths(photos), ['a', 'b', 'c', 'd', 'e']);
});

test('uploading and publishing lock selection, ordering, cover and removal controls', () => {
  const state = photoSelectionState(photos, select('b'), 'a', true);
  for (const control of ['selectAllDisabled', 'clearDisabled', 'coverDisabled', 'removeDisabled', 'upDisabled', 'downDisabled']) assert.equal(state[control], true, control);
  const empty = photoSelectionState([], select(), '');
  assert.equal(empty.selectAllDisabled, true); assert.equal(empty.removeDisabled, true);
});
