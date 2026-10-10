import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(projectRoot, 'public');
const fixtureArgument = process.argv[2];
if (!fixtureArgument || process.argv.length !== 3) {
  throw new Error('Usage: node scripts/generate-public-hero-variants.mjs <public-Hero-API-fixture.json>');
}

const fixturePath = path.resolve(projectRoot, fixtureArgument);
const relativeFixture = path.relative(projectRoot, fixturePath);
if (relativeFixture.startsWith('..') || path.isAbsolute(relativeFixture)) {
  throw new Error('The Hero API fixture must be inside the project.');
}
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
if (!Array.isArray(fixture.hero_image_urls) || fixture.hero_image_urls.length > 20) {
  throw new Error('The fixture must contain at most 20 public hero_image_urls.');
}

async function sourceBytes(source) {
  const url = new URL(source, 'https://phox999.com');
  if (url.origin === 'https://phox999.com' && url.pathname.startsWith('/assets/portfolio/') && !url.search && !url.hash) {
    const originalPath = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
    const relative = path.relative(publicRoot, originalPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Unsafe local image path: ${source}`);
    return readFile(originalPath);
  }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.search || url.hash
    || !/^\/storage\/v1\/object\/public\/site-hero\/[0-9a-f-]+\.(?:jpg|png|webp)$/i.test(url.pathname)) {
    throw new Error(`Unsupported public Hero source: ${source}`);
  }
  const response = await fetch(url, { redirect: 'error' });
  if (!response.ok || !/^image\/(?:jpeg|png|webp)$/.test(response.headers.get('content-type') ?? '')) {
    throw new Error(`Could not read public Hero image (${response.status}): ${source}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

const manifest = {};
let generated = 0;
let sourceBytesTotal = 0;
let variantBytesTotal = 0;
for (const source of [...new Set(fixture.hero_image_urls)]) {
  if (typeof source !== 'string') throw new Error('Every Hero source must be a string.');
  const input = await sourceBytes(source);
  sourceBytesTotal += input.byteLength;
  const metadata = await sharp(input, { failOn: 'error' }).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`No image dimensions for ${source}`);
  const key = createHash('sha256').update(source).digest('hex').slice(0, 20);
  const directory = path.join(publicRoot, 'assets', 'hero-api');
  await mkdir(directory, { recursive: true });
  const candidates = [];
  const outputWidths = [...new Set([960, 1600, 2560].map((width) => Math.min(width, metadata.width)))];
  for (const width of outputWidths) {
    if (width >= metadata.width) continue;
    const outputPath = path.join(directory, `${key}-${width}.webp`);
    await sharp(input, { failOn: 'error' })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82, effort: 5 })
      .toFile(outputPath);
    const outputInfo = await stat(outputPath);
    const outputMetadata = await sharp(outputPath).metadata();
    if (outputMetadata.width !== width || !outputMetadata.height) throw new Error(`Unexpected variant dimensions: ${outputPath}`);
    candidates.push({
      src: `/assets/hero-api/${path.basename(outputPath)}`,
      width: outputMetadata.width,
      height: outputMetadata.height,
      bytes: outputInfo.size,
    });
    variantBytesTotal += outputInfo.size;
    generated += 1;
  }
  manifest[source] = {
    width: metadata.width,
    height: metadata.height,
    sourceBytes: input.byteLength,
    candidates,
  };
}

const manifestPath = path.join(projectRoot, 'src', 'data', 'hero-image-variants.json');
await writeFile(manifestPath, `${JSON.stringify({
  snapshot: fixture.snapshot,
  defaultSource: fixture.hero_image_urls[0] ?? null,
  variants: manifest,
}, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  sources: Object.keys(manifest).length,
  generated,
  sourceBytesTotal,
  variantBytesTotal,
  manifest: path.relative(projectRoot, manifestPath),
}, null, 2));
