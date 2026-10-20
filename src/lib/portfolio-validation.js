// Older collections have a separate cover.webp in their own static directory.
// Keep that cover without adding a duplicate photo or changing totalImages.
export function isPortfolioCollectionCover(cover, images, slug) {
  if (images.includes(cover)) return true;
  if (typeof cover !== 'string' || !cover.startsWith('static:/assets/portfolio/')) return false;
  try {
    return decodeURIComponent(cover) === `static:/assets/portfolio/${slug}/cover.webp`;
  } catch { return false; }
}

export function portfolioDraftIssues(collections) {
  if (!collections.length) return [{ title: '作品集', message: '請至少保留一組作品。' }];
  if (collections.length > 80) return [{ title: '作品集', message: '最多可管理 80 組作品。' }];
  return collections.flatMap((item) => {
    let message = '';
    if (!item.title.trim() || item.title.length > 120) message = '請填寫 1 至 120 字的作品名稱。';
    else if (!['外拍', '棚拍'].includes(item.category)) message = '請選擇有效分類。';
    else if (item.description.length > 1000) message = '作品介紹不可超過 1000 字。';
    else if (!item.images.length || item.images.length > 500) message = '需有 1 至 500 張照片。';
    else if (new Set(item.images).size !== item.images.length) message = '照片清單有重複項目。';
    else if (!isPortfolioCollectionCover(item.cover, item.images, item.slug)) message = '請從此作品選擇封面。';
    else if (!Number.isInteger(item.totalImages) || item.totalImages < item.images.length || item.totalImages > 10000) message = '照片總數不正確。';
    return message ? [{ slug: item.slug, title: item.title.trim() || '未命名作品', message }] : [];
  });
}
