export type PortfolioRouteSource = ReadonlyArray<{ slug: string; href: string }>;

export function serializePortfolioRouteMap(collections: PortfolioRouteSource): string {
  return JSON.stringify(collections.map(({ slug, href }) => [slug, href]));
}

export function parsePortfolioRouteMap(serialized: string | undefined): Map<string, string> {
  if (!serialized) return new Map();
  try {
    const entries: unknown = JSON.parse(serialized);
    if (!Array.isArray(entries)) return new Map();
    const routes = new Map<string, string>();
    for (const entry of entries) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string' || typeof entry[1] !== 'string'
        || !entry[0] || /[\\/?#]/.test(entry[0]) || !/^\/portfolio\/[^/?#]+\/$/.test(entry[1])
        || routes.has(entry[0])) return new Map();
      routes.set(entry[0], entry[1]);
    }
    return routes;
  } catch {
    return new Map();
  }
}
