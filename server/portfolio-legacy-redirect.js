const portfolioRoot = '/portfolio';

/** Return a permanent redirect only after ASSETS confirms the static page exists. */
export async function redirectKnownLegacyPortfolioUrl(request, assets) {
  const url = new URL(request.url);
  if (!['/portfolio', '/portfolio/'].includes(url.pathname)) return undefined;
  if (!['GET', 'HEAD'].includes(request.method)) return undefined;

  const collections = url.searchParams.getAll('collection');
  if (collections.length !== 1) return undefined;
  const slug = collections[0].trim();
  if (!slug || slug.length > 120 || slug === '.' || slug === '..' || /[\\/\u0000-\u001f\u007f]/.test(slug)) return undefined;

  const destination = new URL(url);
  destination.pathname = `${portfolioRoot}/${encodeURIComponent(slug)}/`;
  destination.searchParams.delete('collection');

  const probeUrl = new URL(destination);
  probeUrl.search = '';
  const page = await assets.fetch(new Request(probeUrl, { method: 'GET' }));
  const isHtmlPage = page.status >= 200 && page.status < 300
    && (page.headers.get('content-type') ?? '').toLowerCase().includes('text/html');
  page.body?.cancel();
  if (!isHtmlPage) return undefined;

  return new Response(null, {
    status: 301,
    headers: {
      Location: destination.href,
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
