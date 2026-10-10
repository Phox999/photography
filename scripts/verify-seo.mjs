import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliOptions = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const option = process.argv[index];
  if (option === '--strict-dist') {
    cliOptions.set(option, true);
    continue;
  }
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
const sitemapLastmodByPath = new Map();

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

function decodedPathname(url) {
  try { return decodeURIComponent(url.pathname); }
  catch { return url.pathname; }
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
  const candidateRoots = cliOptions.get('--strict-dist') ? [distRoot] : [distRoot, publicRoot];
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
  if (!/<html\b[^>]*\blang=["']zh-Hant-TW["']/i.test(page.html)) failures.push(`${route}: missing zh-Hant-TW document language`);
  if (!privatePath.test(route) && (description === undefined || attribute(description, 'content')?.trim() === '')) failures.push(`${route}: missing meta description`);
  const canonical = canonicalTag ? attribute(canonicalTag, 'href') : undefined;
  if (!privatePath.test(route) && !errorPage.test(route) && !canonical) failures.push(`${route}: missing canonical`);
  else if (canonical && !errorPage.test(route) && new URL(canonical, siteOrigin).href !== new URL(route, siteOrigin).href) failures.push(`${route}: canonical does not match its route`);
  if (!privatePath.test(route) && !errorPage.test(route)) {
    for (const property of ['og:title', 'og:description', 'og:url', 'og:image', 'og:type']) {
      const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const tag = page.html.match(new RegExp(`<meta\\b(?=[^>]*\\bproperty=[\"']${escapedProperty}[\"'])[^>]*>`, 'i'))?.[0];
      if (!tag || !attribute(tag, 'content')?.trim()) failures.push(`${route}: missing Open Graph ${property}`);
    }
    const twitterCard = page.html.match(/<meta\b(?=[^>]*\bname=["']twitter:card["'])[^>]*>/i)?.[0];
    if (attribute(twitterCard ?? '', 'content') !== 'summary_large_image') failures.push(`${route}: twitter card should be summary_large_image`);
    const twitterImage = page.html.match(/<meta\b(?=[^>]*\bname=["']twitter:image["'])[^>]*>/i)?.[0];
    const twitterImageUrl = attribute(twitterImage ?? '', 'content');
    if (!twitterImageUrl) failures.push(`${route}: missing Twitter image`);
    else if (new URL(twitterImageUrl, siteOrigin).origin === siteOrigin && !await existingFile(new URL(twitterImageUrl, siteOrigin).pathname, false)) failures.push(`${route}: missing Twitter image file`);
  }
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
    if (href && new URL(href, new URL(route, siteOrigin)).href === cooperationFormUrl) {
      if (attribute(match[0], 'data-analytics-event') !== 'inquiry_click') failures.push(`${route}: Google Form CTA is missing inquiry_click marker`);
      if (!attribute(match[0], 'data-analytics-placement')) failures.push(`${route}: Google Form CTA is missing placement marker`);
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
    const srcset = attribute(match[0], 'srcset');
    if (srcset) {
      for (const candidate of srcset.split(',').map((entry) => entry.trim().split(/\s+/)[0]).filter(Boolean)) {
        const candidateUrl = new URL(candidate, new URL(route, siteOrigin));
        if (candidateUrl.origin === siteOrigin && !await existingFile(candidateUrl.pathname, false)) {
          failures.push(`${route}: missing srcset image ${candidate}`);
        }
      }
    }
  }

  const pageSchemaTypes = new Set();
  const pageSchemas = [];
  for (const match of page.html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\btype=["']application\/ld\+json["']/i.test(match[1])) continue;
    try {
      const parsed = JSON.parse(match[2]);
      checkedSchemas += 1;
      for (const schema of Array.isArray(parsed) ? parsed : [parsed]) {
        pageSchemas.push(schema);
        const types = Array.isArray(schema?.['@type']) ? schema['@type'] : [schema?.['@type']];
        for (const type of types) if (typeof type === 'string') pageSchemaTypes.add(type);
      }
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

  const requiredSchemaTypes = route === '/'
    ? ['ProfessionalService', 'FAQPage']
    : route === '/about/'
      ? ['Person']
      : /^\/portfolio\/[^/]+\/$/.test(route)
        ? ['BreadcrumbList', 'ImageObject']
        : /^\/journal\/[^/]+\/$/.test(route)
          ? ['BlogPosting', 'BreadcrumbList']
          : [];
  for (const type of requiredSchemaTypes) {
    if (!pageSchemaTypes.has(type)) failures.push(`${route}: missing ${type} JSON-LD`);
  }

  if (/^\/journal\/[^/]+\/$/.test(route)) {
    if (!page.html.includes('href="/about/#photographer"')) failures.push(`${route}: visible author byline does not link to the photographer entity`);
    const articleSchema = pageSchemas.find((schema) => schema?.['@type'] === 'BlogPosting');
    if (articleSchema?.author?.['@id'] !== 'https://phox999.com/#photographer') failures.push(`${route}: BlogPosting author does not reuse the photographer ID`);
    if (articleSchema?.publisher?.['@id'] !== 'https://phox999.com/#photography-service') failures.push(`${route}: BlogPosting publisher does not reuse the photography service ID`);
  }

  if (/^\/portfolio\/[^/]+\/$/.test(route)) {
    const imageSchema = pageSchemas.find((schema) => schema?.['@type'] === 'ImageObject');
    if (imageSchema?.creator?.['@id'] !== 'https://phox999.com/#photographer') failures.push(`${route}: cover ImageObject is missing the photographer creator ID`);
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
    const urlEntries = [...childXml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)];
    for (const entry of urlEntries) {
      const loc = entry[1].match(/<loc>([\s\S]*?)<\/loc>/i)?.[1];
      if (!loc) continue;
      const url = new URL(decodeHtml(loc.trim()), siteOrigin);
      sitemapPages.push(url);
      const lastmod = entry[1].match(/<lastmod>([\s\S]*?)<\/lastmod>/i)?.[1]?.trim();
      if (lastmod) sitemapLastmodByPath.set(decodedPathname(url), lastmod);
    }
    if (!urlEntries.length) sitemapPages.push(...[...childXml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
      .map((match) => new URL(decodeHtml(match[1].trim()), siteOrigin)));
  }
  sitemapUrls = sitemapPages;
  if (!sitemapUrls.length) failures.push('sitemap-index.xml: no URLs found');
  const sitemapPaths = new Set(sitemapUrls.map(decodedPathname));
  for (const route of knownPages.keys()) {
    if (!privatePath.test(route) && !errorPage.test(route) && !sitemapPaths.has(route)) failures.push(`sitemap is missing a public page: ${route}`);
  }
  for (const url of sitemapUrls) {
    if (url.search || url.hash) failures.push(`sitemap includes a query or fragment URL: ${url.href}`);
    if (privatePath.test(url.pathname) || /^\/404(?:\.html)?\/?$/.test(url.pathname)) failures.push(`sitemap includes an excluded route: ${url.pathname}`);
    if (!await existingFile(url.pathname, !path.extname(url.pathname))) failures.push(`sitemap points to a missing page: ${url.pathname}`);
  }
} catch {
  failures.push('sitemap-index.xml: missing from build output');
}

const journalSourceDirectory = path.join(projectRoot, 'src', 'content', 'journal');
let publishedJournalCount = 0;
for (const fileName of await readdir(journalSourceDirectory)) {
  if (!fileName.endsWith('.md')) continue;
  const markdown = await readFile(path.join(journalSourceDirectory, fileName), 'utf8');
  const frontmatter = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/m)?.[1] ?? '';
  if (/^draft:\s*true\s*$/m.test(frontmatter)) continue;
  const slug = fileName.replace(/\.md$/, '');
  const route = `/journal/${slug}/`;
  publishedJournalCount += 1;
  if (!knownPages.has(route)) failures.push(`${route}: published Journal source is missing from build output`);
  const sourceDate = frontmatter.match(/^updatedDate:\s*(\d{4}-\d{2}-\d{2})\s*$/m)?.[1]
    ?? frontmatter.match(/^publishDate:\s*(\d{4}-\d{2}-\d{2})\s*$/m)?.[1];
  if (!sourceDate) failures.push(`${route}: missing publishDate/updatedDate source for sitemap lastmod`);
  else {
    const actual = sitemapLastmodByPath.get(route);
    const expected = new Date(`${sourceDate}T00:00:00.000Z`).toISOString();
    if (!actual || new Date(actual).toISOString() !== expected) failures.push(`${route}: sitemap lastmod does not match content updatedDate/publishDate (${actual ?? 'missing'})`);
  }
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

const llmsFile = await existingFile('/llms.txt', false);
let checkedLlmsLinks = 0;
if (!llmsFile) failures.push('llms.txt: missing from build output and public source');
else {
  const llms = await readFile(llmsFile, 'utf8');
  for (const match of llms.matchAll(/https:\/\/phox999\.com\/[^\s)]+/g)) {
    const url = new URL(match[0]);
    checkedLlmsLinks += 1;
    if (!await existingFile(url.pathname, !path.extname(url.pathname))) failures.push(`llms.txt: broken public link ${url.href}`);
    if (privatePath.test(url.pathname)) failures.push(`llms.txt: private route listed (${url.pathname})`);
  }
}

const summary = {
  htmlPages: htmlPages.length,
  sitemapUrls: sitemapUrls.length,
  checkedLinks,
  checkedImages,
  strictDist: cliOptions.get('--strict-dist') ?? false,
  imagesWithoutDimensions,
  imagesMissingDimensions: imagesMissingDimensions.slice(0, 20),
  checkedSchemas,
  publishedJournalCount,
  checkedLlmsLinks,
  failures,
};
console.log(JSON.stringify(summary, null, 2));
if (failures.length) process.exitCode = 1;
