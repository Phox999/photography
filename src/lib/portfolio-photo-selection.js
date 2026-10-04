export function selectPhotoRange(photos, selectedPaths, anchorPath, targetPath) {
  const paths = photos.map(photo => photo.path);
  const target = paths.indexOf(targetPath);
  if (target < 0) return new Set(selectedPaths);
  const anchor = paths.indexOf(anchorPath);
  const selection = new Set(selectedPaths);
  const start = anchor < 0 ? target : Math.min(anchor, target);
  const end = anchor < 0 ? target : Math.max(anchor, target);
  for (let index = start; index <= end; index++) selection.add(paths[index]);
  return selection;
}

export function moveSelectedPhotos(photos, selectedPaths, direction) {
  const result = [...photos];
  if (direction === 'up') {
    for (let index = 1; index < result.length; index++) {
      if (selectedPaths.has(result[index].path) && !selectedPaths.has(result[index - 1].path)) {
        [result[index - 1], result[index]] = [result[index], result[index - 1]];
      }
    }
  } else if (direction === 'down') {
    for (let index = result.length - 2; index >= 0; index--) {
      if (selectedPaths.has(result[index].path) && !selectedPaths.has(result[index + 1].path)) {
        [result[index], result[index + 1]] = [result[index + 1], result[index]];
      }
    }
  }
  return result;
}

export function photoSelectionState(photos, selectedPaths, cover, locked = false) {
  const selected = photos.filter(photo => selectedPaths.has(photo.path));
  const count = selected.length;
  return {
    count,
    allSelected: count > 0 && count === photos.length,
    partlySelected: count > 0 && count < photos.length,
    selectAllDisabled: locked || photos.length === 0,
    clearDisabled: locked || count === 0,
    coverDisabled: locked || count !== 1 || selected[0]?.path === cover,
    removeDisabled: locked || count === 0 || count >= photos.length,
    upDisabled: locked || !photos.some((photo, index) => index > 0 && selectedPaths.has(photo.path) && !selectedPaths.has(photos[index - 1].path)),
    downDisabled: locked || !photos.some((photo, index) => index < photos.length - 1 && selectedPaths.has(photo.path) && !selectedPaths.has(photos[index + 1].path)),
  };
}

export function removeSelectedPhotos(photos, selectedPaths, cover) {
  const remaining = photos.filter(photo => !selectedPaths.has(photo.path));
  if (!remaining.length || remaining.length === photos.length) return null;
  const coverPhoto = remaining.find(photo => photo.path === cover) || remaining[0];
  return { images: remaining, cover: coverPhoto.path, coverUrl: coverPhoto.url };
}
