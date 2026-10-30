import existingWorker from './.release-server/worker.js';
import {headerHTML, headerCSS} from './approved-header.mjs';

// Pin the approved homepage instead of replacing it when publishing inner pages.
const approvedHome = 'https://193ebb30-photography.andrewtan088.workers.dev';

// The dev alias serves the review UI while preserving the existing API handlers.
export default {
  ...existingWorker,
  async fetch(request, env, context) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return existingWorker.fetch(request, env, context);
    const isHome = ['/', '/design-preview', '/design-preview/'].includes(url.pathname);
    if (isHome) {
      const response = await fetch(approvedHome + '/', { method: request.method === 'HEAD' ? 'HEAD' : 'GET' });
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      headers.delete('etag');
      headers.set('Cache-Control', 'no-store');
      headers.set('X-PHOX999-Preview', 'approved-home-193ebb30');
      headers.set('X-Robots-Tag', 'noindex, nofollow');
      return new Response(response.body, {status: response.status, headers});
    }
    // Homepage series links (including dynamically loaded cards) enter the new UI.
    if (url.pathname.startsWith('/portfolio/') && url.pathname !== '/portfolio/') {
      const target = url.pathname.includes('6-20') ? '/design-preview/series/0/' : '/design-preview/portfolio/';
      return Response.redirect(new URL(target, url), 302);
    }
    const routes = {
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
    let response = await env.ASSETS.fetch(new Request(url, request));
    // The approved homepage's hashed CSS/JS, images and SVG stay on its pinned version.
    if (response.status === 404 && (url.pathname.startsWith('/_astro/') || url.pathname.startsWith('/assets/') || url.pathname === '/favicon.svg')) {
      response = await fetch(approvedHome + url.pathname + url.search, {method: request.method === 'HEAD' ? 'HEAD' : 'GET'});
    }
    const headers = new Headers(response.headers);
    headers.set('X-PHOX999-Preview', 'frontend-admin-20261030');
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    if (headers.get('content-type')?.includes('text/html')) headers.set('Cache-Control', 'no-store');
    const result = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    if (headers.get('content-type')?.includes('text/html') && url.pathname.startsWith('/design-preview/')) {
      const active = url.pathname.includes('/portfolio/') || url.pathname.includes('/series/') ? '/portfolio/'
        : url.pathname.includes('/cooperation/') ? '/cooperation/' : '/about/';
      const sharedHeader = headerHTML.replaceAll(`href="${active}"`, `href="${active}" aria-current="page"`);
      return new HTMLRewriter()
        .on('header.preview-header', { element(el) { el.replace(sharedHeader, {html:true}); } })
        .on('head', { element(el) { el.append(`<style>${headerCSS} .camera-header{position:relative;inset:auto;background:#fff;color:#202624}.camera-header .camera-brand{color:#202624}</style>`, {html:true}); } })
        .on('.cooperation-form', { element(el) { el.setAttribute('id', 'availability'); } })
        .transform(result);
    }
    return result;
  },
};
