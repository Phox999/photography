export const PORTFOLIO_CHANGES_MAX_BYTES = 8 * 1024 * 1024;

export function portfolioChangeSet(previous, next) {
  const previousBySlug = new Map(previous.map((item) => [item.slug, item]));
  const nextBySlug = new Map(next.map((item) => [item.slug, item]));
  const upserts = next.filter((item) => {
    const before = previousBySlug.get(item.slug);
    return !before || JSON.stringify(before) !== JSON.stringify(item);
  });
  const deleted_slugs = previous.filter((item) => !nextBySlug.has(item.slug)).map((item) => item.slug);

  return { upserts, deleted_slugs, order: next.map((item) => item.slug) };
}

export function portfolioChangesByteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
