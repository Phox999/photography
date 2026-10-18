// Homepage-only featured order. Other collections retain their published admin order.
// Use stable slugs so changing titles or covers does not change the featured selection.
export const featuredPortfolioSlugs = [
  '260621_Y2K RE',
  '260530_台博女僕 RE',
  '260228_KTM Malaysia+Lalaport RE',
  '6-20海邊jk_',
  '照片分享',
  '藍色襯衫',
];

const positionBySlug = new Map(featuredPortfolioSlugs.map((slug, index) => [slug, index]));

export function orderFeaturedPortfolio(collections) {
  return [...collections].sort((left, right) => {
    const leftPosition = positionBySlug.get(left.slug) ?? Infinity;
    const rightPosition = positionBySlug.get(right.slug) ?? Infinity;
    return leftPosition - rightPosition;
  });
}
