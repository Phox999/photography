export function portfolioControlState({ busy, uploading, collections, selectedIndex, hasPendingFiles, changed, valid }) {
  const locked = Boolean(busy || uploading);
  const selected = collections[selectedIndex] || null;

  return {
    locked,
    addDisabled: locked || collections.length >= 80,
    reloadDisabled: locked,
    publishDisabled: locked || !changed || !valid,
    uploadDisabled: locked || !selected || !hasPendingFiles,
    collectionActions: collections.map((_, index) => ({
      selectDisabled: locked,
      upDisabled: locked || index === 0,
      downDisabled: locked || index === collections.length - 1,
      removeDisabled: locked,
    })),
    photoActions: selected ? selected.images.map((photo, index) => ({
      upDisabled: locked || index === 0,
      downDisabled: locked || index === selected.images.length - 1,
      coverDisabled: locked || selected.cover === photo.path,
      removeDisabled: locked || selected.images.length <= 1,
    })) : [],
  };
}
