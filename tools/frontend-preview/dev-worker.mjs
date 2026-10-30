import existingWorker from './.release-server/worker.js';

// The dev alias serves the review UI while preserving the existing API handlers.
export default {
  ...existingWorker,
  async fetch(request, env, context) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return existingWorker.fetch(request, env, context);
    const routes = {
      '/': '/design-preview/',
      '/portfolio': '/design-preview/portfolio/',
      '/portfolio/': '/design-preview/portfolio/',
      '/cooperation': '/design-preview/cooperation/',
      '/cooperation/': '/design-preview/cooperation/',
      '/about': '/design-preview/about/',
      '/about/': '/design-preview/about/',
      '/admin': '/admin-preview/',
      '/admin/': '/admin-preview/',
    };
    if (routes[url.pathname]) url.pathname = routes[url.pathname];
    const response = await env.ASSETS.fetch(new Request(url, request));
    const headers = new Headers(response.headers);
    headers.set('X-PHOX999-Preview', 'frontend-admin-20261030');
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    if (headers.get('content-type')?.includes('text/html')) headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
