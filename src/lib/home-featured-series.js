// Presentation selection only; published records remain the source of images and links.
export const homepageSeriesSlugs = ['260614_天使與惡魔 RE', '260201_棚拍 RE', '中華娘'];

export function selectHomepageSeries(collections) {
  const unique = new Map(collections.filter(item => item.images?.length).map(item => [item.slug, item]));
  const selected = [];
  for (const slug of [...homepageSeriesSlugs, ...unique.keys()]) {
    const item = unique.get(slug);
    if (!item) continue;
    selected.push(item);
    unique.delete(slug);
    if (selected.length === 3) break;
  }
  return selected;
}
