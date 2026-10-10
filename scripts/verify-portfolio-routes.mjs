import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { portfolioCatalog } from '../src/data/portfolioCatalog.ts';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const optionIndex = process.argv.indexOf('--dist');
const distRoot = optionIndex >= 0 && process.argv[optionIndex + 1]
  ? path.resolve(process.argv[optionIndex + 1])
  : path.join(projectRoot, 'dist');
if (optionIndex >= 0 && !process.argv[optionIndex + 1]) throw new Error('--dist requires a path.');

function decodeHtmlAttribute(value) {
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

async function verifyMap(pagePath, expected) {
  const html = await readFile(pagePath, 'utf8');
  const attribute = html.match(/\bdata-static-route-map="([^"]*)"/i)?.[1];
  if (!attribute) throw new Error(`${path.relative(distRoot, pagePath)}: missing complete static route map.`);
  let actual;
  try { actual = JSON.parse(decodeHtmlAttribute(attribute)); }
  catch { throw new Error(`${path.relative(distRoot, pagePath)}: static route map is invalid JSON.`); }
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${path.relative(distRoot, pagePath)}: static route map differs from the generated portfolio pages.`);
  }
}

const expected = portfolioCatalog.map(({ slug, href }) => [slug, href]);
if (new Set(expected.map(([slug]) => slug)).size !== expected.length) throw new Error('Catalog has duplicate portfolio slugs.');
if (new Set(expected.map(([, href]) => href)).size !== expected.length) throw new Error('Catalog has duplicate portfolio routes.');

for (const [slug, href] of expected) {
  const pathname = new URL(href, 'https://phox999.com').pathname;
  const pagePath = path.resolve(distRoot, `.${decodeURIComponent(pathname)}`, 'index.html');
  const relative = path.relative(distRoot, pagePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Unsafe route for ${slug}: ${href}`);
  try {
    if (!(await stat(pagePath)).isFile()) throw new Error(`Missing built route: ${href}`);
  } catch {
    throw new Error(`Missing built route for ${slug}: ${href}`);
  }
}

await verifyMap(path.join(distRoot, 'index.html'), expected);
await verifyMap(path.join(distRoot, 'portfolio', 'index.html'), expected);
console.log(`Verified ${expected.length} generated portfolio routes and matching homepage/archive maps.`);
