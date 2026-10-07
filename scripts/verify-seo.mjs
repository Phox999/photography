import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliOptions = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const option = process.argv[index];
  if (!['--dist', '--public'].includes(option) || !process.argv[index + 1]) {
    throw new Error(`Unknown or incomplete option: ${option}`);
  }
  cliOptions.set(option, path.resolve(process.argv[++index]));
}

const distRoot = cliOptions.get('--dist') ?? path.join(projectRoot, 'dist');
const publicRoot = cliOptions.get('--public') ?? path.join(projectRoot, 'public');
const siteOrigin = 'https://phox999.com';
const cooperationFormUrl = 'https://forms.gle/8V17E3gPVf3NdEaY8';
const privatePath = /^\/(?:admin|client|cooperation-status)(?:\/|$)/;
const errorPage = /^\/404(?:\.html)?\/?$/;
const failures = [];

async function walkHtml(directory, relative = '') {
  const pages = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const childRelative = path.join(relative, entry.name);
    const childPath = path.join(directory, entry.name);
    if (entry.isDirectory()) pages.push(...await walkHtml(childPath, childRelative));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
      pages.push({ path: childPath, relative: childRelative, html: await readFile(childPath, 'utf8') });
    }
  }
  return pages;
}

function decodeHtml(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (entity, name) => {
    const token = name.toLowerCase();
    if (token === 'amp') return '&';
    if (token === 'quot') return '"';
    if (token === 'apos' || token === '#39') return "'";
    if (token === 'lt') return '<';
    if (token === 'gt') return '>';
    const number = token.startsWith('#x') ? Number.parseInt(token.slice(2), 16) : Number(token.slice(1));
    return Number.isFinite(number) ? String.fromCodePoint(number) : entity;
  });
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match ? decodeHtml(match[2]) : undefined;
}

function pageUrl(relative) {
  const normalized = relative.replaceAll(path.sep, '/');
  const route = normalized.replace(/(?:^|\/)index\.html$/i, '/');
  return `/${route}`.replace(/^\/\//, '/');
}

function safePath(root, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { return undefined; }
  const candidate = path.resolve(root, `.${decoded}`);
  const relative = path.relative(root, candidate);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return undefined;
  return candidate;
}

async function existingFile(pathname, isRoute) {
  const candidateRoots = [distRoot, publicRoot];
  for (const root of candidateRoots) {
    const candidate = safePath(root, pathname);
    if (!candidate) continue;
    const variants = isRoute
      ? [candidate, path.join(candidate, 'index.html'), `${candidate}.html`]
      : [candidate];
    for (const variant of variants) {
      try { if ((await stat(variant)).isFile()) return variant; }
      catch { /* Check the next static output or public source path. */ }
    }
  }
  return undefined;
}

const htmlPages = await walkHtml(distRoot);
if (!htmlPages.length) throw new Error(`No HTML pages found under ${distRoot}. Run npm run build first.`);
const knownPages = new Map(htmlPages.map((page) => [pageUrl(page.relative), page]));
let checkedLinks = 0;
let checkedImages = 0;
let imagesWithoutDimensions = 0;
const imagesMissingDimensions = [];
let checkedSchemas = 0;
const sitemapPath = path.join(distRoot, 'sitemap-index.xml');
let sitemapUrls = [];

for (const page of htmlPages) {
  const route = pageUrl(page.relative);
  const title = page.html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const description = page.html.match(/<meta\b(?=[^>]*\bname=["']description["'])[^>]*>/i)?.[0];
  const canonicalTag = page.html.match(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/i)?.[0];
  if (!title) failures.push(`${route}: missing <title>`);
  if (!privatePath.test(route) && (description === undefined || attribute(description, 'content')?.trim() === '')) failures.push(`${route}: missing meta description`);
  const canonical = canonicalTag ? attribute(canonicalTag, 'href') : undefined;
  if (!privatePath.test(route) && !errorPage.test(route) && !canonical) failures.push(`${route}: missing canonical`);
  else if (canonical && !errorPage.test(route) && new URL(canonical, siteOrigin).href !== new URL(route, siteOrigin).href) failures.push(`${route}: canonical does not match its route`);
  if (route === '/' || /^\/(?:portfolio|journal)\/[^/]+\/$/.test(route)) {
    const headingCount = [...page.html.matchAll(/<h1\b/gi)].length;
    if (headingCount !== 1) failures.push(`${route}: expected one H1, found ${headingCount}`);
  }

  const robotsTag = page.html.match(/<meta\b(?=[^>]*\bname=["']robots["'])[^>]*>/i)?.[0];
  const robotsValue = (robotsTag ? attribute(robotsTag, 'content') : '')?.toLowerCase() ?? '';
  if (privatePath.test(route) && !robotsValue.includes('noindex')) failures.push(`${route}: private route is missing noindex`);

  const ids = new Set([...page.html.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => decodeHtml(match[1])));
  for (const match of page.html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = attribute(match[0], 'href');
    const linkText = decodeHtml(match[1].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
    if (/^(?:填寫合作意向|開始討論拍攝)$/.test(linkText) && href && new URL(href, new URL(route, siteOrigin)).href !== cooperationFormUrl) {
      failures.push(`${route}: cooperation CTA does not use the configured Google Form URL (${href})`);
    }
    if (!href || /^(?:#|mailto:|tel:|javascript:|data:)/i.test(href)) {
      if (href?.startsWith('#')) {
        const id = decodeURIComponent(href.slice(1));
        if (!ids.has(id)) failures.push(`${route}: missing anchor #${id}`);
      }
      continue;
    }
    const target = new URL(href, new URL(route, siteOrigin));
    if (target.origin !== siteOrigin) continue;
    checkedLinks += 1;
    const targetRoute = target.pathname;
    const targetPage = knownPages.get(targetRoute.endsWith('/') ? targetRoute : `${targetRoute}/`)
      ?? knownPages.get(targetRoute);
    const isRoute = !path.extname(targetRoute);
    const file = await existingFile(targetRoute, isRoute);
    if (!file) {
      failures.push(`${route}: broken internal link ${href}`);
      continue;
    }
    if (target.hash) {
      const decodedId = decodeURIComponent(target.hash.slice(1));
      const resolvedPage = targetPage ?? htmlPages.find((candidate) => candidate.path === file || candidate.path === path.join(file, 'index.html'));
      if (resolvedPage) {
        const targetIds = new Set([...resolvedPage.html.matchAll(/\bid=["']([^"']+)["']/gi)].map((item) => decodeHtml(item[1])));
        if (!targetIds.has(decodedId)) failures.push(`${route}: ${href} targets a missing anchor`);
      }
    }
  }

  for (const match of page.html.matchAll(/<img\b[^>]*>/gi)) {
    const src = attribute(match[0], 'src');
    if (!src || /^(?:data:|blob:)/i.test(src)) continue;
    if (attribute(match[0], 'alt') === undefined) failures.push(`${route}: image is missing alt text (${src})`);
    if (attribute(match[0], 'width') === undefined || attribute(match[0], 'height') === undefined) {
      imagesWithoutDimensions += 1;
      imagesMissingDimensions.push(`${route}: ${src}`);
      failures.push(`${route}: image is missing width or height (${src})`);
    }
    const imageUrl = new URL(src, new URL(route, siteOrigin));
    if (imageUrl.origin !== siteOrigin) continue;
    checkedImages += 1;
    if (!await existingFile(imageUrl.pathname, false)) failures.push(`${route}: missing image ${src}`);
  }

  for (const match of page.html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\btype=["']application\/ld\+json["']/i.test(match[1])) continue;
    try {
      const parsed = JSON.parse(match[2]);
      checkedSchemas += 1;
      if (match[1].includes('data-faq-schema')) {
        const faqSection = page.html.match(/<section\b(?=[^>]*\bid=["']faq["'])[^>]*>([\s\S]*?)<\/section>/i)?.[1] ?? '';
        const visibleFaqs = [...faqSection.matchAll(/<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>[\s\S]*?<p\b[^>]*>([\s\S]*?)<\/p>[\s\S]*?<\/details>/gi)]
          .map((faq) => ({ question: decodeHtml(faq[1].replace(/<[^>]*>/g, '')).trim(), answer: decodeHtml(faq[2].replace(/<[^>]*>/g, '')).trim() }));
        const schemaFaqs = parsed.mainEntity?.map(({ name, acceptedAnswer }) => ({ question: name, answer: acceptedAnswer?.text })) ?? [];
        if (JSON.stringify(visibleFaqs) !== JSON.stringify(schemaFaqs)) failures.push(`${route}: FAQ schema differs from the static FAQ content`);
      }
    } catch (error) {
      failures.push(`${route}: invalid JSON-LD (${error.message})`);
    }
  }

  if (/\/journal\/[^/]+\/$/.test(route) && /<strong\b/i.test(page.html) && page.html.includes('**')) {
    failures.push(`${route}: visible Markdown bold markers remain in article HTML`);
  }
}

try {
  const sitemap = await readFile(sitemapPath, 'utf8');
  const sitemapLocations = [...sitemap.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) => new URL(decodeHtml(match[1].trim()), siteOrigin));
  const sitemapPages = [];
  for (const location of sitemapLocations) {
    if (!location.pathname.endsWith('.xml') || !location.pathname.includes('sitemap-')) {
      sitemapPages.push(location);
      continue;
    }
    const childPath = await existingFile(location.pathname, false);
    if (!childPath) {
      failures.push(`sitemap index points to a missing sitemap: ${location.pathname}`);
      continue;
    }
    const childXml = await readFile(childPath, 'utf8');
    sitemapPages.push(...[...childXml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
      .map((match) => new URL(decodeHtml(match[1].trim()), siteOrigin)));
  }
  sitemapUrls = sitemapPages;
  if (!sitemapUrls.length) failures.push('sitemap-index.xml: no URLs found');
  for (const url of sitemapUrls) {
    if (privatePath.test(url.pathname) || /^\/404(?:\.html)?\/?$/.test(url.pathname)) failures.push(`sitemap includes an excluded route: ${url.pathname}`);
    if (!await existingFile(url.pathname, !path.extname(url.pathname))) failures.push(`sitemap points to a missing page: ${url.pathname}`);
  }
} catch {
  failures.push('sitemap-index.xml: missing from build output');
}

const robotsFile = await existingFile('/robots.txt', false);
if (!robotsFile) failures.push('robots.txt: missing from build output and public source');
else {
  const robots = await readFile(robotsFile, 'utf8');
  for (const route of ['/admin/', '/client/', '/cooperation-status/']) {
    if (!robots.includes(`Disallow: ${route}`)) failures.push(`robots.txt: missing Disallow for ${route}`);
  }
  if (!robots.includes('https://phox999.com/sitemap-index.xml')) failures.push('robots.txt: sitemap URL is missing or incorrect');
}

const summary = {
  htmlPages: htmlPages.length,
  sitemapUrls: sitemapUrls.length,
  checkedLinks,
  checkedImages,
  imagesWithoutDimensions,
  imagesMissingDimensions: imagesMissingDimensions.slice(0, 20),
  checkedSchemas,
  failures,
};
console.log(JSON.stringify(summary, null, 2));
if (failures.length) process.exitCode = 1;
