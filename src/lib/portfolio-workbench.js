export const PORTFOLIO_COLLECTION_LIMIT = 80;
export const PORTFOLIO_PHOTO_LIMIT = 500;

function collectionIndex(collections, slug) {
  return collections.findIndex((collection) => collection.slug === slug);
}

function photoCount(collection) {
  return Number.isInteger(collection.totalImages) ? collection.totalImages : collection.images.length;
}

export function reorderCollection(collections, slug, position) {
  const from = collectionIndex(collections, slug);
  if (from < 0) throw new Error('找不到要排序的作品系列。');
  if (!Number.isInteger(position) || position < 0 || position >= collections.length) {
    throw new Error('作品系列位置不正確。');
  }
  if (from === position) return collections;
  const next = [...collections];
  const [collection] = next.splice(from, 1);
  next.splice(position, 0, collection);
  return next;
}

export function reorderPhoto(images, path, position) {
  const from = images.findIndex((image) => image.path === path);
  if (from < 0) throw new Error('找不到要排序的照片。');
  if (!Number.isInteger(position) || position < 0 || position >= images.length) {
    throw new Error('照片位置不正確。');
  }
  if (from === position) return images;
  const next = [...images];
  const [photo] = next.splice(from, 1);
  next.splice(position, 0, photo);
  return next;
}

export function movePhotosBetweenCollections(collections, sourceSlug, targetSlug, selectedPaths) {
  if (sourceSlug === targetSlug) throw new Error('不能移動到原本的作品系列。');
  if (!Array.isArray(selectedPaths) || selectedPaths.length === 0) throw new Error('請先選擇至少一張照片。');
  const sourceIndex = collectionIndex(collections, sourceSlug);
  const targetIndex = collectionIndex(collections, targetSlug);
  if (sourceIndex < 0 || targetIndex < 0) throw new Error('找不到來源或目的地作品系列。');

  const source = collections[sourceIndex];
  const target = collections[targetIndex];
  const selected = new Set(selectedPaths);
  if (selected.size !== selectedPaths.length) throw new Error('選取清單包含重複照片。');
  const movedPhotos = source.images.filter((photo) => selected.has(photo.path));
  if (movedPhotos.length !== selected.size) throw new Error('部分照片已不在目前作品中，請重新選取。');
  if (target.images.some((photo) => selected.has(photo.path))) throw new Error('目的地已包含部分相同照片，請調整選取清單。');
  if (source.images.length - movedPhotos.length < 1) throw new Error('每組作品至少需要一張照片，請保留一張再移動。');
  if (target.images.length + movedPhotos.length > PORTFOLIO_PHOTO_LIMIT) {
    throw new Error(`「${target.title || '目的地作品'}」最多可放 ${PORTFOLIO_PHOTO_LIMIT} 張，請減少移動數量。`);
  }

  const movedPaths = new Set(movedPhotos.map((photo) => photo.path));
  const sourceImages = source.images.filter((photo) => !movedPaths.has(photo.path));
  const sourceCoverMoved = movedPaths.has(source.cover);
  const sourceCover = sourceCoverMoved ? sourceImages[0] : null;
  const next = [...collections];
  next[sourceIndex] = {
    ...source,
    images: sourceImages,
    totalImages: Math.max(sourceImages.length, photoCount(source) - movedPhotos.length),
    ...(sourceCover ? { cover: sourceCover.path, coverUrl: sourceCover.url } : {}),
  };
  next[targetIndex] = {
    ...target,
    images: [...target.images, ...movedPhotos],
    totalImages: Math.max(target.images.length + movedPhotos.length, photoCount(target) + movedPhotos.length),
  };

  return {
    collections: next,
    movedPhotos,
    sourceCoverMoved,
    undo: {
      sourceSlug,
      targetSlug,
      photos: movedPhotos,
      sourceCoverBefore: source.cover,
      sourceCoverAfter: sourceCoverMoved ? sourceCover.path : source.cover,
      sourceOrderBefore: source.images.map((photo) => photo.path),
      targetCoverBefore: target.cover,
    },
  };
}

export function restoreMovedPhotos(collections, undo) {
  const sourceIndex = collectionIndex(collections, undo.sourceSlug);
  const targetIndex = collectionIndex(collections, undo.targetSlug);
  if (sourceIndex < 0 || targetIndex < 0) throw new Error('無法復原：來源或目的地作品已移除。');
  const source = collections[sourceIndex];
  const target = collections[targetIndex];
  const photosByPath = new Map(undo.photos.map((photo) => [photo.path, photo]));
  if (target.images.filter((photo) => photosByPath.has(photo.path)).length !== photosByPath.size) {
    throw new Error('無法復原：部分照片已不在目的地。');
  }
  if (source.images.some((photo) => photosByPath.has(photo.path))) throw new Error('無法復原：來源已包含部分相同照片。');
  const nextTargetImages = target.images.filter((photo) => !photosByPath.has(photo.path));
  if (!nextTargetImages.length) throw new Error('無法復原：目的地必須至少保留一張照片。');
  const nextSourceImages = [...source.images];
  for (const photo of undo.photos) {
    const index = undo.sourceOrderBefore.indexOf(photo.path);
    const existing = new Set(nextSourceImages.map((item) => item.path));
    const previousPath = undo.sourceOrderBefore.slice(0, index).reverse().find((path) => existing.has(path));
    const followingPath = undo.sourceOrderBefore.slice(index + 1).find((path) => existing.has(path));
    const previous = nextSourceImages.findIndex((item) => item.path === previousPath);
    const following = nextSourceImages.findIndex((item) => item.path === followingPath);
    const insertAt = previous >= 0 ? previous + 1 : following >= 0 ? following : nextSourceImages.length;
    nextSourceImages.splice(insertAt, 0, photo);
  }
  if (nextSourceImages.length > PORTFOLIO_PHOTO_LIMIT) throw new Error('無法復原：來源作品已達照片上限。');

  const next = [...collections];
  const restoreCover = source.cover === undo.sourceCoverAfter;
  next[sourceIndex] = {
    ...source,
    images: nextSourceImages,
    totalImages: Math.max(nextSourceImages.length, photoCount(source) + undo.photos.length),
    ...(restoreCover ? {
      cover: undo.sourceCoverBefore,
      coverUrl: undo.photos.find((photo) => photo.path === undo.sourceCoverBefore)?.url
        ?? nextSourceImages.find((photo) => photo.path === undo.sourceCoverBefore)?.url
        ?? source.coverUrl,
    } : {}),
  };
  next[targetIndex] = {
    ...target,
    images: nextTargetImages,
    totalImages: Math.max(nextTargetImages.length, photoCount(target) - undo.photos.length),
    ...(photosByPath.has(target.cover) ? (() => {
      const cover = nextTargetImages.find((photo) => photo.path === undo.targetCoverBefore) ?? nextTargetImages[0];
      return { cover: cover.path, coverUrl: cover.url };
    })() : {}),
  };
  return next;
}

export function removePhotosFromCollection(collection, selectedPaths) {
  const selected = new Set(selectedPaths);
  if (!selected.size || selected.size !== selectedPaths.length) throw new Error('請選擇有效的照片。');
  const removed = collection.images.filter((photo) => selected.has(photo.path));
  if (removed.length !== selected.size) throw new Error('部分照片已不在目前作品中，請重新選取。');
  const images = collection.images.filter((photo) => !selected.has(photo.path));
  if (!images.length) throw new Error('每組作品至少需要一張照片。');
  const cover = selected.has(collection.cover) ? images[0] : null;
  return {
    ...collection,
    images,
    totalImages: Math.max(images.length, photoCount(collection) - removed.length),
    ...(cover ? { cover: cover.path, coverUrl: cover.url } : {}),
  };
}
