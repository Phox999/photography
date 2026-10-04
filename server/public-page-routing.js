import { renderHomePage, handlePortfolioArchive, handlePortfolioRoute, handleSitemap } from './public-page-rendering.js';

// Share GET/HEAD dispatch between Workers and Pages so dynamic pages have the
// same status and headers for crawlers and link checkers using either method.
export async function handlePublicPage(context) {
  const { method } = context.request;
  if (method !== 'GET' && method !== 'HEAD') return null;
  const { pathname } = new URL(context.request.url);
  let handler;
  if (pathname === '/') handler = renderHomePage;
  else if (pathname === '/portfolio' || pathname === '/portfolio/') handler = handlePortfolioArchive;
  else if (/^\/portfolio\/[^/]+\/?$/.test(pathname)) handler = handlePortfolioRoute;
  else if (pathname === '/sitemap.xml') handler = handleSitemap;
  else return null;
  const pageContext = method === 'HEAD'
    ? { ...context, request: new Request(context.request.url, { headers: context.request.headers }) }
    : context;
  const response = await handler(pageContext);
  if (method !== 'HEAD') return response;
  // Discard the lazy HTML stream after the GET handler has determined its
  // status and headers; HEAD does not need to transmit or render its body.
  await response.body?.cancel();
  return new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });
}
