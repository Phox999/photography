import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { portfolioCatalog } from '../src/data/portfolioCatalog.ts';
import { portfolioEditorial } from '../src/data/portfolioEditorial.ts';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(projectRoot, 'public');
const manifestPath = path.join(projectRoot, 'src', 'data', 'image-variants.json');
const widthLimit = 1280;
const quality = 82;
const sourceUrls = new Set(portfolioCatalog.map(({ cover }) => cover));
let apiFixturePath;

for (let index = 2; index < process.argv.length; index += 1) {
  if (process.argv[index] !== '--api-fixture' || !process.argv[index + 1] || apiFixturePath) {
    throw new Error(`Unknown, incomplete, or repeated option: ${process.argv[index]}`);
  }
  apiFixturePath = path.resolve(projectRoot, process.argv[++index]);
  const relativeFixture = path.relative(projectRoot, apiFixturePath);
  if (relativeFixture.startsWith('..') || path.isAbsolute(relativeFixture)) {
    throw new Error('The public portfolio fixture must be inside the project.');
  }
}

if (apiFixturePath) {
  const fixture = JSON.parse(await readFile(apiFixturePath, 'utf8'));
  if (!Array.isArray(fixture.collections)) throw new Error('The public portfolio fixture has no collections array.');
  for (const item of fixture.collections) {
    if (typeof item?.cover !== 'string') throw new Error('Every API fixture collection must have a cover URL.');
    const pathname = new URL(item.cover, 'https://phox999.com').pathname;
    if (pathname.startsWith('/assets/portfolio/')) sourceUrls.add(item.cover);
  }
}

let manifest = {};
try {
  const existingManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!existingManifest || typeof existingManifest !== 'object' || Array.isArray(existingManifest)) {
    throw new Error('The existing image variant manifest must be a JSON object.');
  }
  manifest = existingManifest;
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

for (const [slug, editorial] of Object.entries(portfolioEditorial)) {
  for (const fileName of Object.keys(editorial.photos)) {
    sourceUrls.add(encodeURI(`/assets/portfolio/${slug}/${fileName}`));
  }
}

for (const fileName of await readdir(path.join(projectRoot, 'src', 'content', 'journal'))) {
  if (!fileName.endsWith('.md')) continue;
  const markdown = await readFile(path.join(projectRoot, 'src', 'content', 'journal', fileName), 'utf8');
  const frontmatter = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/m)?.[1] ?? '';
  if (/^draft:\s*true\s*$/m.test(frontmatter)) continue;
  const cover = frontmatter.match(/^cover:\s*["']([^"']+)["']\s*$/m)?.[1];
  if (cover) sourceUrls.add(cover);
}

let generated = 0;
let reused = 0;
let skippedSmall = 0;
let bytesSaved = 0;

for (const sourceUrl of [...sourceUrls].sort()) {
  const pathname = decodeURIComponent(new URL(sourceUrl, 'https://phox999.com').pathname);
  const sourcePath = path.resolve(publicRoot, `.${pathname}`);
  const sourceRelative = path.relative(publicRoot, sourcePath);
  if (sourceRelative.startsWith('..') || path.isAbsolute(sourceRelative)) {
    throw new Error(`Refusing image outside public/: ${sourceUrl}`);
  }
  const sourceInfo = await stat(sourcePath);
  const original = await sharp(sourcePath, { failOn: 'error' }).metadata();
  if (!original.width || !original.height) throw new Error(`Could not read image dimensions: ${sourceUrl}`);
  const entry = { width: original.width, height: original.height };
  if (original.width > widthLimit) {
    const extension = path.extname(sourcePath);
    const variantPath = sourcePath.slice(0, -extension.length) + `.seo-${widthLimit}.webp`;
    let variantInfo;
    try {
      variantInfo = await stat(variantPath);
      reused += 1;
    } catch {
      await sharp(sourcePath, { failOn: 'error' })
        .rotate()
        .resize({ width: widthLimit, withoutEnlargement: true })
        .webp({ quality, effort: 5 })
        .toFile(variantPath);
      variantInfo = await stat(variantPath);
      generated += 1;
    }

    bytesSaved += Math.max(0, sourceInfo.size - variantInfo.size);
    const variantRelative = `/${path.relative(publicRoot, variantPath).replaceAll(path.sep, '/')}`;
    entry.variant = encodeURI(variantRelative);
  } else {
    skippedSmall += 1;
  }
  manifest[sourceUrl] = entry;
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  referencedSources: sourceUrls.size,
  generated,
  reused,
  skippedSmall,
  estimatedBytesSavedPerLargestSourceCandidate: bytesSaved,
  manifest: path.relative(projectRoot, manifestPath),
  maximumWidth: widthLimit,
  quality,
  apiFixture: apiFixturePath ? path.relative(projectRoot, apiFixturePath) : undefined,
}, null, 2));
