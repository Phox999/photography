import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SHOOT_PROJECTS,
  createShootProjectSnapshot,
  getOpenShootProjects,
  getPublicShootProjects,
  projectContentIssues,
  shootProjectRequestState,
  validateShootProjectCatalog,
} from '../shared/shoot-projects.js';

test('目前企劃都保留為草稿，不會進入公開列表或可申請清單', () => {
  assert.equal(SHOOT_PROJECTS.length, 2);
  assert.ok(SHOOT_PROJECTS.every((project) => project.status === 'draft'));
  assert.deepEqual(getPublicShootProjects(), []);
  assert.deepEqual(getOpenShootProjects(), []);
  assert.ok(SHOOT_PROJECTS.every((project) => projectContentIssues(project).length > 0));
});

test('資料不完整的企劃改為公開狀態時，設定驗證會阻止建置', () => {
  const incomplete = { ...SHOOT_PROJECTS[0], status: 'open' };
  assert.throws(() => validateShootProjectCatalog([incomplete]), /尚不能公開/);
});

const completeProject = (overrides = {}) => ({
  id: 'test-portrait', slug: 'test-portrait', revision: 2, status: 'open',
  title: '測試企劃', summary: '已核對的測試摘要。', concept: '已核對的拍攝方向。',
  cover: '/assets/test-cover.webp', coverAlt: '測試企劃封面',
  referenceImages: [1, 2, 3].map((index) => ({ src: `/assets/reference-${index}.webp`, alt: `風格參考 ${index}` })),
  suitableFor: '已確認的合作對象。', wardrobe: '已確認的服裝安排。', preparation: '已確認的準備事項。',
  area: '台北市', dateNote: '日期另行討論。', deadlineAt: null,
  costNote: '費用安排已確認。', deliveryNote: '交付內容已確認。', publicationNote: '公開方式已確認。',
  relatedPortfolioSlugs: [], displayOrder: 1,
  ...overrides,
});

test('完整企劃可公開；截止時間由共用規則判定', () => {
  const open = completeProject({ deadlineAt: '2026-10-12T00:00:00+08:00' });
  assert.equal(validateShootProjectCatalog([open]), true);
  assert.equal(getPublicShootProjects([open]).length, 1);
  assert.equal(getOpenShootProjects(Date.parse('2026-10-11T12:00:00+08:00'), [open]).length, 1);
  assert.equal(getOpenShootProjects(Date.parse('2026-10-12T00:00:00+08:00'), [open]).length, 0);
  assert.equal(shootProjectRequestState(open, 1, Date.parse('2026-10-11T12:00:00+08:00')).accepted, false);
  assert.equal(shootProjectRequestState(open, 2, Date.parse('2026-10-12T00:00:00+08:00')).accepted, false);
  assert.equal(shootProjectRequestState(open, 2, Date.parse('2026-10-11T12:00:00+08:00')).accepted, true);
});

test('快照保留收件時的公開條件，不包含參考圖片路徑', () => {
  const project = completeProject();
  const snapshot = createShootProjectSnapshot(project);
  assert.equal(snapshot.id, project.id);
  assert.equal(snapshot.revision, project.revision);
  assert.equal(snapshot.costNote, project.costNote);
  assert.equal(Object.hasOwn(snapshot, 'referenceImages'), false);
});
