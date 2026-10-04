import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const bundled = await build({ entryPoints: [fileURLToPath(new URL('../worker.js', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'browser' });
const origin = 'https://phox999.com';
const id = '00000000-0000-4000-8000-000000000001.webp';
const work = { slug: '新作 + 海風😀', title: '新作品', category: '外拍', description: '新版作品介紹', cover: id, images: [id], totalImages: 1 };
const site = { announcement: '新版公告', hero_title: '新版主標 </script>', hero_copy: '新版介紹', hero_image_paths: ['static:/assets/hero-02.webp'], faqs: [{ question: '新版問題', answer: '新版回答' }], version: 2 };
// Compact asset fixtures exercise the native HTMLRewriter and retain the
// attributes Astro puts on existing elements. No production database is used.
const document = `<!doctype html><html><head><title>old</title><meta name="description"><meta name="robots" content="noindex"><link rel="canonical"><meta property="og:title"><meta property="og:url"><meta property="og:image"><script type="application/ld+json" data-seo-jsonld>{}</script></head><body>
<aside data-public-announcement hidden></aside><h1 data-hero-title>old</h1><p data-hero-copy>old</p><section id="faq"><div class="faq-grid"></div></section>
<button data-portfolio-filter-button data-filter="外拍">外拍<span class="portfolio-filter__count" data-filter="外拍" data-astro-cid-scope aria-hidden="true">0</span></button><div data-portfolio-strip></div><p data-portfolio-result></p>
<button data-archive-filter data-filter="外拍">外拍<span class="portfolio-filter__count" data-filter="外拍" data-astro-cid-scope aria-hidden="true">0</span></button><div id="portfolio-archive-grid"></div>
<h1 data-portfolio-title>old</h1><p data-portfolio-description>old</p><p data-portfolio-category>old</p><section data-justified-gallery></section><div aria-label="快捷功能"></div></body></html>`;

test('native Worker renders current public HTML and consistent GET/HEAD routes', { timeout: 45000 }, async (t) => {
  let unavailable = false;
  let stalled = false;
  let collections = [work];
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-09-25',
    bindings: { SUPABASE_URL: 'https://demo.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' },
    serviceBindings: { ASSETS: () => new Response(document, { headers: { 'Content-Type': 'text/html' } }) },
    outboundService(request) {
      if (stalled) return new Promise(resolve => setTimeout(() => resolve(new Response('', { status: 503 })), 10000).unref());
      if (unavailable) return new Response('', { status: 503 });
      const path = new URL(request.url).pathname;
      if (path === '/rest/v1/rpc/get_public_site_content') return Response.json(site);
      if (path === '/rest/v1/rpc/get_public_portfolio_content') return Response.json({ version: 2, collections });
      throw new Error(`Unexpected upstream request: ${path}`);
    },
  }));
  try {
    await t.test('home snapshot is safely serialized and matches the title and FAQ', async () => {
      const response = await mf.dispatchFetch(origin + '/');
      assert.equal(response.status, 200);
      const html = await response.text();
      const snapshot = html.match(/id="phox999-public-content">([\s\S]*?)<\/script>/)[1];
      assert.equal(snapshot.includes('</script>'), false);
      const content = JSON.parse(snapshot);
      assert.equal(content.hero_title, site.hero_title);
      assert.equal(content.hero_image_urls[0], origin + '/assets/hero-02.webp');
      assert.match(html, /新版問題/);
      assert.match(html, /<title>新版主標 &lt;\/script&gt;/);
      assert.match(html, /data-astro-cid-scope[^>]*>1<\/span>/);
    });
    await t.test('new Storage-only slug returns current metadata, schema and gallery', async () => {
      const response = await mf.dispatchFetch(origin + '/portfolio/' + encodeURIComponent(work.slug) + '/');
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /<title>新作品｜外拍人像作品/);
      assert.match(html, /index, follow, max-image-preview:large/);
      assert.match(html, /"@type":"ImageGallery"/);
      assert.match(html, /data-lightbox-open/);
      assert.ok(html.includes(`data-favorite-slug="${work.slug}"`));
      assert.match(html, /data-favorite-title="新作品"/);
      assert.match(html, /site-portfolio/);
    });
    await t.test('archive rewriting preserves scoped filter attributes', async () => {
      const response = await mf.dispatchFetch(origin + '/portfolio/');
      assert.equal(response.status, 200);
      assert.match(await response.text(), /data-astro-cid-scope[^>]*>1<\/span>/);
    });
    await t.test('HEAD matches GET for success, redirects, missing works and sitemap', async () => {
      const path = '/portfolio/' + encodeURIComponent(work.slug) + '/';
      for (const route of ['/', '/portfolio/', path, '/portfolio/missing/', '/portfolio/?collection=' + encodeURIComponent(work.slug), '/sitemap.xml']) {
        const get = await mf.dispatchFetch(origin + route);
        const head = await mf.dispatchFetch(origin + route, { method: 'HEAD', redirect: 'manual' });
        // Check the legacy redirect without automatically following it.
        const expected = route.includes('?') ? await mf.dispatchFetch(origin + route, { redirect: 'manual' }) : get;
        assert.equal(head.status, expected.status, route);
        for (const name of ['content-type', 'cache-control', 'location', 'x-robots-tag']) assert.equal(head.headers.get(name), expected.headers.get(name), `${route}: ${name}`);
        assert.equal(await head.text(), '');
        await get.body?.cancel();
        if (expected !== get) await expected.body?.cancel();
      }
    });
    await t.test('removed works return real 404 for GET and HEAD', async () => {
      collections = [];
      for (const method of ['GET', 'HEAD']) {
        const response = await mf.dispatchFetch(origin + '/portfolio/' + encodeURIComponent(work.slug) + '/', { method });
        assert.equal(response.status, 404);
        assert.match(response.headers.get('x-robots-tag'), /noindex/);
        await response.body?.cancel();
      }
    });
    await t.test('upstream failures return 503 for GET and HEAD without a misleading sitemap', async () => {
      unavailable = true;
      for (const route of ['/portfolio/', '/portfolio/missing/', '/sitemap.xml']) {
        for (const method of ['GET', 'HEAD']) {
          const response = await mf.dispatchFetch(origin + route, { method });
          assert.equal(response.status, 503);
          assert.match(response.headers.get('x-robots-tag'), /noindex/);
          await response.body?.cancel();
        }
      }
    });
    await t.test('slow public database reads stop within the HTML rendering budget', { timeout: 8000 }, async () => {
      stalled = true;
      const response = await mf.dispatchFetch(origin + '/portfolio/');
      assert.equal(response.status, 503);
      assert.match(response.headers.get('retry-after'), /30/);
      await response.body?.cancel();
    });
  } finally { await mf.dispose(); }
});
