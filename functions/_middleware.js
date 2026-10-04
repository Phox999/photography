import {
  handlePortfolioArchive,
  handlePortfolioRoute,
  handleSitemap,
  renderHomePage,
} from '../server/public-page-rendering.js';

export async function onRequest(context) {
  if (context.request.method !== 'GET') return context.next();
  const { pathname } = new URL(context.request.url);

  if (pathname === '/') return renderHomePage(context);
  if (pathname === '/portfolio' || pathname === '/portfolio/') return handlePortfolioArchive(context);
  if (/^\/portfolio\/[^/]+\/?$/.test(pathname)) return handlePortfolioRoute(context);
  if (pathname === '/sitemap.xml') return handleSitemap(context);

  return context.next();
}
