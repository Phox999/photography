import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { portfolioAdminCatalog } from '../src/data/portfolioCatalog.ts';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(projectRoot, 'public');
const outputRoot = path.join(publicRoot, 'assets', 'portfolio-thumbnails');
const manifestPath = path.join(projectRoot, 'src', 'data', 'portfolio-thumbnails.json');
const sources = [...new Set(portfolioAdminCatalog.flatMap(({ cover, images }) => [cover, ...images]))].sort();
const width = 384;
const quality = 72;
let previous = {};
try { previous = JSON.parse(await readFile(manifestPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(outputRoot, { recursive: true });
const manifest = {};
let generated = 0;
let reused = 0;
let cursor = 0;

// Bound simultaneous full-resolution decodes; never modify or delete originals.
await Promise.all(Array.from({ length: 2 }, async () => {
  while (cursor < sources.length) {
    const source = sources[cursor++];
    const sourcePath = path.resolve(publicRoot, `.${decodeURIComponent(source)}`);
    if (!sourcePath.startsWith(`${path.join(publicRoot, 'assets', 'portfolio')}${path.sep}`)) throw new Error('Invalid thumbnail source');
    const sourceInfo = await stat(sourcePath);
    const existing = previous[source];
    if (typeof existing === 'string' && /^\/assets\/portfolio-thumbnails\/[a-f0-9]{24}-384\.webp$/.test(existing)) {
      try {
        const outputInfo = await stat(path.join(publicRoot, existing));
        if (outputInfo.mtimeMs >= sourceInfo.mtimeMs) {
          manifest[source] = existing;
          reused++;
          continue;
        }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const input = await readFile(sourcePath);
    const hash = createHash('sha256').update(`admin-${width}-${quality}:${source}:`).update(input).digest('hex').slice(0, 24);
    const filename = `${hash}-${width}.webp`;
    await sharp(input, { failOn: 'error', limitInputPixels: 100_000_000 })
      .rotate().resize({ width, withoutEnlargement: true }).webp({ quality, effort: 3 })
      .toFile(path.join(outputRoot, filename));
    manifest[source] = `/assets/portfolio-thumbnails/${filename}`;
    generated++;
    if (generated % 250 === 0) console.log(`Portfolio thumbnails: ${generated} generated…`);
  }
}));
const sorted = Object.fromEntries(sources.map((source) => [source, manifest[source]]));
const serialized = `${JSON.stringify(sorted, null, 2)}\n`;
// Avoid triggering the dev watcher when every generated asset is unchanged.
if (serialized !== `${JSON.stringify(previous, null, 2)}\n`) await writeFile(manifestPath, serialized, 'utf8');
console.log(JSON.stringify({ sources: sources.length, generated, reused, width, quality }));
