import type { APIRoute } from 'astro';
import { portfolioCatalog } from '../data/portfolioCatalog';
import { SITE_ORIGIN, escapeXml, portfolioPath } from '../../server/seo.js';

const fixedPaths = ['/', '/portfolio/', '/cooperation/', '/about/', '/behind-scenes/'];

export const GET: APIRoute = () => {
  const paths = [...fixedPaths, ...portfolioCatalog.map((item) => portfolioPath(item.slug))];
  const urls = [...new Set(paths.map((path) => new URL(path, SITE_ORIGIN).href))]
    .map((loc) => `<url><loc>${escapeXml(loc)}</loc></url>`)
    .join('');
  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
