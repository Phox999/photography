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

test('兩份待補的真實企劃維持草稿，不會進入公開清單', () => {
  const realDraftIds = new Set(['city-night-portrait', 'uniform-portrait']);
  const realDrafts = SHOOT_PROJECTS.filter((project) => realDraftIds.has(project.id));
  const publicProjects = getPublicShootProjects();
  const openProjects = getOpenShootProjects();
  assert.equal(realDrafts.length, realDraftIds.size);
  assert.ok(realDrafts.every((project) => project.status === 'draft'));
  assert.ok(realDrafts.every((project) => projectContentIssues(project).length > 0));
  assert.ok(realDrafts.every((project) => !publicProjects.some((item) => item.id === project.id)));
  assert.ok(realDrafts.every((project) => !openProjects.some((item) => item.id === project.id)));
});

test('資料不完整的企劃改為公開狀態時，設定驗證會阻止建置', () => {
  const incompleteDraft = SHOOT_PROJECTS.find((project) => project.status === 'draft' && projectContentIssues(project).length > 0);
  assert.ok(incompleteDraft, 'the catalog includes an incomplete draft entry');
  const incomplete = { ...incompleteDraft, status: 'open' };
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

test('已關閉、已完成及已過截止時間的企劃拒絕新申請', () => {
  const now = Date.parse('2026-10-11T12:00:00+08:00');
  const closed = shootProjectRequestState(completeProject({ status: 'closed' }), 2, now);
  const completed = shootProjectRequestState(completeProject({ status: 'completed' }), 2, now);
  const expired = shootProjectRequestState(completeProject({ deadlineAt: '2026-10-11T11:59:59+08:00' }), 2, now);
  assert.equal(closed.accepted, false);
  assert.equal(completed.accepted, false);
  assert.equal(expired.accepted, false);
  assert.match(closed.reason, /未開放申請/);
  assert.match(expired.reason, /已截止/);
});

test('公開企劃文字接受 LF、CRLF 與 TAB，並以 Unicode 字元數驗證限制', () => {
  for (const concept of ['第一段\n第二段', '第一段\r\n第二段', '段落\t補充']) {
    assert.deepEqual(projectContentIssues(completeProject({ concept })), []);
  }
  assert.ok(projectContentIssues(completeProject({ title: '😀'.repeat(121) })).some((issue) => issue.includes('title 超過 120 字')));
});

test('公開企劃拒絕未支援控制字元並遵守 snapshot 12,000-byte 上限', () => {
  assert.ok(projectContentIssues(completeProject({ concept: '段落\u0001錯誤' })).some((issue) => issue.includes('含控制字元')));
  const oversized = completeProject({
    summary: '摘'.repeat(400),
    concept: '文'.repeat(2000),
    area: '地'.repeat(160),
    dateNote: '日'.repeat(1000),
    costNote: '費'.repeat(1000),
    deliveryNote: '交'.repeat(1000),
    publicationNote: '公'.repeat(1000),
  });
  assert.ok(projectContentIssues(oversized).some((issue) => issue === 'snapshot 超過 12000 bytes'));
});

test('快照保留收件時的公開條件，不包含參考圖片路徑', () => {
  const project = completeProject();
  const snapshot = createShootProjectSnapshot(project);
  assert.equal(snapshot.id, project.id);
  assert.equal(snapshot.revision, project.revision);
  assert.equal(snapshot.costNote, project.costNote);
  assert.equal(Object.hasOwn(snapshot, 'referenceImages'), false);
});
