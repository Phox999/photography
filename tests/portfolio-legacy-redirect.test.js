import test from 'node:test';
import assert from 'node:assert/strict';
import { redirectKnownLegacyPortfolioUrl } from '../server/portfolio-legacy-redirect.js';

function assetsFor(knownPaths) {
  const requests = [];
  return {
    requests,
    assets: {
      async fetch(request) {
        requests.push(new URL(request.url));
        const exists = knownPaths.has(new URL(request.url).pathname);
        return new Response(null, {
          status: exists ? 200 : 404,
          headers: { 'content-type': exists ? 'text/html; charset=utf-8' : 'text/html; charset=utf-8' },
        });
      },
    },
  };
}

test('legacy collection query redirects only to a confirmed static page and keeps unrelated query values', async () => {
  const { assets, requests } = assetsFor(new Set(['/portfolio/%E6%B2%B3%E7%95%94%E8%8A%B1%E6%9C%9F/']));
  const response = await redirectKnownLegacyPortfolioUrl(
    new Request('https://phox999.com/portfolio/?collection=%E6%B2%B3%E7%95%94%E8%8A%B1%E6%9C%9F&from=legacy'),
    assets,
  );

  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), 'https://phox999.com/portfolio/%E6%B2%B3%E7%95%94%E8%8A%B1%E6%9C%9F/?from=legacy');
  assert.equal(requests.length, 1);
});

test('unknown static routes and malformed or repeated collection values stay on the existing route', async () => {
  const { assets, requests } = assetsFor(new Set());
  const missing = await redirectKnownLegacyPortfolioUrl(new Request('https://phox999.com/portfolio/?collection=missing'), assets);
  const duplicate = await redirectKnownLegacyPortfolioUrl(new Request('https://phox999.com/portfolio/?collection=a&collection=b'), assets);
  const traversal = await redirectKnownLegacyPortfolioUrl(new Request('https://phox999.com/portfolio/?collection=..%2Fadmin'), assets);

  assert.equal(missing, undefined);
  assert.equal(duplicate, undefined);
  assert.equal(traversal, undefined);
  assert.equal(requests.length, 1);
});

test('collection slugs with spaces and literal plus signs retain the correct path semantics', async () => {
  const expectedPath = '/portfolio/260228_KTM%20Malaysia%2BLalaport%20RE/';
  const { assets } = assetsFor(new Set([expectedPath]));
  const response = await redirectKnownLegacyPortfolioUrl(
    new Request('https://phox999.com/portfolio/?collection=260228_KTM%20Malaysia%2BLalaport%20RE'),
    assets,
  );

  assert.equal(response.status, 301);
  assert.equal(new URL(response.headers.get('location')).pathname, expectedPath);
});

test('redirect helper does not intercept other paths or write methods', async () => {
  const { assets, requests } = assetsFor(new Set(['/portfolio/works/']));
  assert.equal(await redirectKnownLegacyPortfolioUrl(new Request('https://phox999.com/portfolio/?collection=works', { method: 'POST' }), assets), undefined);
  assert.equal(await redirectKnownLegacyPortfolioUrl(new Request('https://phox999.com/portfolio/works/?collection=works'), assets), undefined);
  assert.equal(requests.length, 0);
});
