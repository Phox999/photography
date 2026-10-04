import assert from 'node:assert/strict';
import { open, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { portfolioPath } from '../server/seo.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const origin = 'https://phox999.com';
const lfsPointers = new Set();
const fixedPages = [
  ['/', 'index.html'],
  ['/portfolio/', 'portfolio/index.html'],
  ['/cooperation/', 'cooperation/index.html'],
  ['/about/', 'about/index.html'],
  ['/behind-scenes/', 'behind-scenes/index.html'],
];

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'));
  return match?.[1] ?? '';
}

async function readOutput(relative) {
  return readFile(path.join(dist, relative), 'utf8');
}

function assertPublicHtml(html, route) {
  const canonicals = [...html.matchAll(/<link\b[^>]*rel="canonical"[^>]*>/gi)];
  assert.equal(canonicals.length, 1, `${route} must contain exactly one canonical`);
  const canonical = attr(canonicals[0][0], 'href');
  assert.ok(canonical.startsWith(`${origin}/`), `${route} canonical must use the production origin`);
  assert.equal(new URL(canonical).search, '', `${route} canonical must not contain query parameters`);
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  assert.ok(title, `${route} must have a non-empty title`);
  const description = html.match(/<meta\b[^>]*name="description"[^>]*>/i);
  assert.ok(description && attr(description[0], 'content').trim(), `${route} must have a non-empty description`);
  const ogUrl = html.match(/<meta\b[^>]*property="og:url"[^>]*>/i);
  assert.ok(ogUrl, `${route} must have og:url`);
  assert.equal(attr(ogUrl[0], 'content'), canonical, `${route} og:url must match its canonical`);
  const robots = html.match(/<meta\b[^>]*name="robots"[^>]*>/i);
  assert.ok(robots && /index, follow, max-image-preview:large/.test(attr(robots[0], 'content')), `${route} must be indexable`);
  const schemas = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(schemas.length, `${route} should contain its applicable structured data`);
  for (const schema of schemas) assert.doesNotThrow(() => JSON.parse(schema[1]), `${route} JSON-LD must parse`);
  return canonical;
}

async function assertImageFiles(html, route) {
  const references = new Set();
  for (const match of html.matchAll(/<(?:img|meta)\b[^>]*(?:src|property="og:image")[^>]*>/gi)) {
    const tag = match[0];
    const source = tag.startsWith('<meta') ? attr(tag, 'content') : attr(tag, 'src');
    if (!source) continue;
    const url = new URL(source, origin);
    if (url.origin === origin && url.pathname.startsWith('/assets/')) references.add(decodeURIComponent(url.pathname));
  }
  for (const urlPath of references) {
    const file = path.join(dist, urlPath.slice(1));
    await stat(file).catch(() => assert.fail(`${route} references a missing local image ${urlPath}`));
    const fileInfo = await stat(file);
    if (fileInfo.size < 180) {
      const handle = await open(file, 'r');
      try {
        const buffer = Buffer.alloc(180);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        const prefix = buffer.subarray(0, bytesRead).toString('utf8');
        if (prefix.startsWith('version https://git-lfs.github.com/spec/v1')) lfsPointers.add(urlPath);
      } finally {
        await handle.close();
      }
    }
  }
}

const sitemap = await readOutput('sitemap.xml');
assert.match(sitemap, /^<\?xml[^>]*\?>\s*<urlset\b/);
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].replaceAll('&amp;', '&'));
assert.ok(locs.length >= fixedPages.length, 'sitemap must include the five fixed public pages');
assert.equal(new Set(locs).size, locs.length, 'sitemap must not include duplicate URLs');
for (const loc of locs) {
  const url = new URL(loc);
  assert.equal(url.origin, origin);
  assert.equal(url.search, '');
  assert.ok(!/\/(admin|client|cooperation-status|api)(\/|$)/.test(url.pathname), `sitemap must exclude private/API path ${loc}`);
}

const publicDocuments = [];
for (const [route, relative] of fixedPages) publicDocuments.push([route, await readOutput(relative)]);
const portfolioDirectory = path.join(dist, 'portfolio');
for (const entry of await readdir(portfolioDirectory, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'seo-internal') continue;
  const relative = path.posix.join('portfolio', entry.name, 'index.html');
  const route = portfolioPath(entry.name);
  const html = await readOutput(relative);
  publicDocuments.push([route, html]);
  assert.ok(locs.includes(new URL(route, origin).href), `sitemap must include ${route}`);
}

for (const [route, html] of publicDocuments) {
  const canonical = assertPublicHtml(html, route);
  assert.equal(new URL(canonical).pathname, new URL(route, origin).pathname, `${route} canonical path must match its route`);
  await assertImageFiles(html, route);
}

for (const [relative, expected] of [
  ['admin/index.html', 'noindex'],
  ['client/index.html', 'noindex'],
  ['cooperation-status/index.html', 'noindex'],
]) {
  const html = await readOutput(relative);
  assert.match(html, /<meta\b[^>]*name="robots"[^>]*content="noindex/i, `${relative} must remain noindex`);
  assert.doesNotMatch(html, /application\/ld\+json/i, `${relative} must not expose public JSON-LD`);
  assert.equal(expected, 'noindex');
  assert.ok(!locs.includes(new URL(`/${relative.replace('/index.html', '/')}`, origin).href), `${relative} must not be in the sitemap`);
}

const template = await readOutput('seo-internal/portfolio-template/index.html');
assert.match(template, /name="robots" content="noindex, nofollow, noarchive"/i);
assert.ok(!locs.some((loc) => loc.includes('/seo-internal/')));

if (lfsPointers.size) {
  const message = `${lfsPointers.size} local image reference(s) are Git LFS pointer files; image bytes were not available in this checkout.`;
  if (process.env.CI === 'true' || process.env.CF_PAGES === '1') throw new Error(message);
  console.warn(`SEO asset warning: ${message}`);
}

console.log(`SEO output check passed: ${publicDocuments.length} indexable HTML pages, ${locs.length} sitemap URLs, private pages excluded, local image paths checked.`);
