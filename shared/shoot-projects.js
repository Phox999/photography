const PROJECT_ID = /^[a-z0-9][a-z0-9-]{1,63}$/;
const PROJECT_SLUG = /^[a-z0-9][a-z0-9-]{1,95}$/;
const STATUSES = new Set(['draft', 'open', 'closed', 'completed']);
const PUBLISHED_TEXT_FIELDS = [
  ['title', 120], ['summary', 400], ['concept', 2000], ['coverAlt', 240],
  ['suitableFor', 800], ['wardrobe', 800], ['preparation', 1000], ['area', 160],
  ['dateNote', 1000], ['costNote', 1000], ['deliveryNote', 1000], ['publicationNote', 1000],
];

// These are intentionally incomplete working drafts. Keep them out of every
// production page until the factual content checklist is complete.
export const SHOOT_PROJECTS = Object.freeze([
  Object.freeze({
    id: 'city-night-portrait',
    slug: 'city-night-portrait',
    revision: 1,
    status: 'draft',
    title: '城市夜景人像企劃（草稿）',
    summary: '企劃方向與合作細節待確認，尚未開放申請。',
    concept: '',
    cover: '',
    coverAlt: '',
    referenceImages: Object.freeze([]),
    suitableFor: '',
    wardrobe: '',
    preparation: '',
    area: '',
    dateNote: '',
    deadlineAt: null,
    costNote: '',
    deliveryNote: '',
    publicationNote: '',
    relatedPortfolioSlugs: Object.freeze([]),
    displayOrder: 10,
  }),
  Object.freeze({
    id: 'uniform-portrait',
    slug: 'uniform-portrait',
    revision: 1,
    status: 'draft',
    title: '制服主題人像企劃（草稿）',
    summary: '企劃方向與合作細節待確認，尚未開放申請。',
    concept: '',
    cover: '',
    coverAlt: '',
    referenceImages: Object.freeze([]),
    suitableFor: '',
    wardrobe: '',
    preparation: '',
    area: '',
    dateNote: '',
    deadlineAt: null,
    costNote: '',
    deliveryNote: '',
    publicationNote: '',
    relatedPortfolioSlugs: Object.freeze([]),
    displayOrder: 20,
  }),
]);

function validLocalImagePath(value) {
  return typeof value === 'string'
    && value.startsWith('/assets/')
    && !/[?#\\\u0000-\u001f]/.test(value)
    && !value.split('/').some((part) => part === '.' || part === '..');
}

export function projectContentIssues(project) {
  const issues = [];
  for (const [field, max] of PUBLISHED_TEXT_FIELDS) {
    if (typeof project?.[field] !== 'string' || !project[field].trim()) issues.push(`${field} 尚未填寫`);
    else if (project[field].length > max) issues.push(`${field} 超過 ${max} 字`);
    else if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(project[field])) issues.push(`${field} 含控制字元`);
  }
  if (!validLocalImagePath(project?.cover)) issues.push('cover 必須是 public/assets 下的本機圖片路徑');
  if (!Array.isArray(project?.referenceImages) || project.referenceImages.length < 3 || project.referenceImages.length > 6
    || project.referenceImages.some((item) => !item || !validLocalImagePath(item.src) || typeof item.alt !== 'string' || !item.alt.trim() || item.alt.length > 240)) {
    issues.push('referenceImages 需有 3–6 張已確認可使用的本機圖片與替代文字');
  }
  if (!Array.isArray(project?.relatedPortfolioSlugs) || project.relatedPortfolioSlugs.some((slug) => typeof slug !== 'string' || !slug.trim() || slug.length > 120)) {
    issues.push('relatedPortfolioSlugs 格式不正確');
  }
  if (project?.deadlineAt !== null && project?.deadlineAt !== undefined
    && (typeof project.deadlineAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(project.deadlineAt) || !Number.isFinite(Date.parse(project.deadlineAt)))) {
    issues.push('deadlineAt 需為帶時區的 ISO 時間或 null');
  }
  return issues;
}

export function validateShootProjectCatalog(projects = SHOOT_PROJECTS) {
  if (!Array.isArray(projects)) throw new TypeError('shoot project catalog must be an array');
  const ids = new Set();
  const slugs = new Set();
  for (const project of projects) {
    if (!project || typeof project !== 'object' || !PROJECT_ID.test(project.id ?? '') || !PROJECT_SLUG.test(project.slug ?? '')
      || ids.has(project.id) || slugs.has(project.slug)) throw new Error('企劃 id／slug 缺漏或重複。');
    ids.add(project.id);
    slugs.add(project.slug);
    if (!Number.isInteger(project.revision) || project.revision < 1 || project.revision > 1_000_000 || !STATUSES.has(project.status)) {
      throw new Error(`企劃 ${project.id} 的 revision 或 status 不正確。`);
    }
    if (project.status !== 'draft') {
      const issues = projectContentIssues(project);
      if (issues.length) throw new Error(`企劃 ${project.id} 尚不能公開：${issues.join('；')}`);
    }
  }
  return true;
}

export function getPublicShootProjects(projects = SHOOT_PROJECTS) {
  validateShootProjectCatalog(projects);
  return projects.filter((project) => project.status !== 'draft')
    .slice().sort((a, b) => a.displayOrder - b.displayOrder || a.title.localeCompare(b.title, 'zh-TW'));
}

export function getOpenShootProjects(now = Date.now(), projects = SHOOT_PROJECTS) {
  return getPublicShootProjects(projects).filter((project) => project.status === 'open'
    && (!project.deadlineAt || Date.parse(project.deadlineAt) > Number(now)));
}

export function getShootProjectBySlug(slug, projects = SHOOT_PROJECTS) {
  return projects.find((project) => project.slug === slug) ?? null;
}

export function getShootProjectById(id, projects = SHOOT_PROJECTS) {
  return projects.find((project) => project.id === id) ?? null;
}

export function createShootProjectSnapshot(project) {
  return {
    id: project.id,
    revision: project.revision,
    slug: project.slug,
    title: project.title,
    summary: project.summary,
    concept: project.concept,
    area: project.area,
    dateNote: project.dateNote,
    deadlineAt: project.deadlineAt ?? null,
    costNote: project.costNote,
    deliveryNote: project.deliveryNote,
    publicationNote: project.publicationNote,
  };
}

export function shootProjectRequestState(project, requestedRevision, now = Date.now()) {
  if (!project) return { accepted: false, reason: '企劃不存在，請重新選擇企劃或使用一般合作申請。' };
  if (!Number.isInteger(requestedRevision) || requestedRevision !== project.revision) {
    return { accepted: false, reason: '企劃內容已更新，請重新載入企劃頁後再申請。' };
  }
  if (project.status !== 'open') return { accepted: false, reason: '這個企劃目前未開放申請，表單內容仍保留。' };
  if (project.deadlineAt && Date.parse(project.deadlineAt) <= Number(now)) {
    return { accepted: false, reason: '這個企劃已截止，表單內容仍保留。' };
  }
  return { accepted: true };
}

validateShootProjectCatalog();
