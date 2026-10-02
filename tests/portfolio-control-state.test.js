import assert from 'node:assert/strict';
import test from 'node:test';
import { portfolioControlState } from '../src/lib/portfolio-control-state.js';

const collections = [
  { images: [{ path: 'one.jpg' }, { path: 'two.jpg' }, { path: 'three.jpg' }], cover: 'one.jpg' },
  { images: [{ path: 'four.jpg' }, { path: 'five.jpg' }], cover: 'five.jpg' },
];

function state(overrides = {}) {
  return portfolioControlState({
    busy: false,
    uploading: false,
    collections,
    selectedIndex: 0,
    hasPendingFiles: false,
    changed: true,
    valid: true,
    ...overrides,
  });
}

test('發布或載入期間凍結所有可變作品集控制項', () => {
  const controls = state({ busy: true });
  assert.equal(controls.locked, true);
  assert.equal(controls.publishDisabled, true);
  assert.equal(controls.addDisabled, true);
  assert.equal(controls.reloadDisabled, true);
  assert.equal(controls.uploadDisabled, true);
  assert.ok(controls.collectionActions.every((actions) => actions.selectDisabled && actions.upDisabled && actions.downDisabled && actions.removeDisabled));
  assert.ok(controls.photoActions.every((actions) => actions.upDisabled && actions.downDisabled && actions.coverDisabled && actions.removeDisabled));
});

test('上傳期間維持鎖定；失敗或部分成功結束後依檔案與草稿狀態恢復', () => {
  const duringUpload = state({ uploading: true, hasPendingFiles: true });
  assert.equal(duringUpload.locked, true);
  assert.equal(duringUpload.uploadDisabled, true);

  const afterPartialUpload = state({ hasPendingFiles: true });
  assert.equal(afterPartialUpload.locked, false);
  assert.equal(afterPartialUpload.uploadDisabled, false);
  assert.equal(afterPartialUpload.photoActions[1].coverDisabled, false);

  const afterAllFailures = state({ hasPendingFiles: true, changed: false });
  assert.equal(afterAllFailures.locked, false);
  assert.equal(afterAllFailures.uploadDisabled, false);
});

test('解鎖後仍保留照片排序、封面與最後一張保護規則', () => {
  const controls = state({ hasPendingFiles: true });
  assert.equal(controls.photoActions[0].upDisabled, true);
  assert.equal(controls.photoActions[0].downDisabled, false);
  assert.equal(controls.photoActions[0].coverDisabled, true);
  assert.equal(controls.photoActions[0].removeDisabled, false);
  assert.equal(controls.photoActions[2].upDisabled, false);
  assert.equal(controls.photoActions[2].downDisabled, true);

  const singlePhoto = state({ collections: [{ images: [{ path: 'only.jpg' }], cover: 'only.jpg' }], selectedIndex: 0 });
  assert.equal(singlePhoto.photoActions[0].removeDisabled, true);
});

test('發布仍要求有效且有變更的內容', () => {
  assert.equal(state({ changed: false }).publishDisabled, true);
  assert.equal(state({ valid: false }).publishDisabled, true);
  assert.equal(state({ changed: true, valid: true }).publishDisabled, false);
});
