export const HERO_IMAGE_LIMIT = 10;
export const HERO_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const HERO_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function hasHeroImageCapacity(currentCount) {
  return Number.isInteger(currentCount) && currentCount >= 0 && currentCount < HERO_IMAGE_LIMIT;
}

export function moveItem(items, fromIndex, toIndex) {
  const next = [...items];
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)
    || fromIndex < 0 || fromIndex >= next.length || toIndex < 0 || toIndex >= next.length
    || fromIndex === toIndex) return next;
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function restoreItem(items, item, index) {
  if (items.some((entry) => entry.path === item.path)) return [...items];
  const next = [...items];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, item);
  return next;
}

export function validateHeroUpload(file) {
  if (!HERO_IMAGE_TYPES.has(file?.type)) return '格式不支援，請選擇 JPEG、PNG 或 WebP。';
  if (!Number.isFinite(file.size) || file.size <= 0) return '檔案是空的，請選擇有效照片。';
  if (file.size > HERO_IMAGE_MAX_BYTES) return '檔案超過 8 MiB，請縮小後重試。';
  return '';
}

export function uploadTaskIds(items, { retryFailedIds = [], includeQueued = true } = {}) {
  const retryIds = new Set(retryFailedIds);
  return items
    .filter((item) => (includeQueued && item.status === 'queued')
      || (item.status === 'failed' && retryIds.has(item.id)))
    .map((item) => item.id);
}

export function hasIncompleteUploads(items) {
  return items.some((item) => ['queued', 'uploading', 'failed'].includes(item.status));
}

export function contentChangeSummary(before, after) {
  if (!before || !after) return [];
  const changes = [];
  if (before.hero_title !== after.hero_title || before.hero_copy !== after.hero_copy) {
    changes.push('首頁文字已修改');
  }

  const beforePhotos = before.hero_image_paths || [];
  const afterPhotos = after.hero_image_paths || [];
  const beforeSet = new Set(beforePhotos);
  const afterSet = new Set(afterPhotos);
  const added = afterPhotos.filter((path) => !beforeSet.has(path)).length;
  const removed = beforePhotos.filter((path) => !afterSet.has(path)).length;
  if (added || removed) {
    const parts = [];
    if (added) parts.push('新增 ' + added + ' 張照片');
    if (removed) parts.push('移出 ' + removed + ' 張照片');
    changes.push(parts.join('、'));
  }

  const originalSharedOrder = beforePhotos.filter((path) => afterSet.has(path));
  const currentSharedOrder = afterPhotos.filter((path) => beforeSet.has(path));
  if (JSON.stringify(originalSharedOrder) !== JSON.stringify(currentSharedOrder)) {
    changes.push('照片順序已調整');
  }
  if (before.announcement !== after.announcement
    || before.announcement_enabled !== after.announcement_enabled) changes.push('公告已修改');
  if (JSON.stringify(before.faqs || []) !== JSON.stringify(after.faqs || [])) {
    changes.push('常見問題已修改');
  }
  return changes;
}

export function contentHasChanges(before, after) {
  return contentChangeSummary(before, after).length > 0;
}
