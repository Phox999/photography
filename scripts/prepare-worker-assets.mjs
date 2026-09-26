import { link, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(projectRoot, 'dist');
const outputRoot = path.join(projectRoot, 'worker-dist');
const maxAssetBytes = 25 * 1024 * 1024;
if (path.dirname(outputRoot) !== projectRoot || path.basename(outputRoot) !== 'worker-dist') {
  throw new Error('Refusing to prepare Worker assets outside the project worker-dist directory.');
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const skippedRedundantPortfolioImages = [];
const oversized = [];

async function linkTree(sourceDirectory, relativeDirectory = '') {
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  const siblingFileNames = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name.toLowerCase()));

  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    const sourcePath = path.join(sourceDirectory, entry.name);
    const outputPath = path.join(outputRoot, relativeDirectory, entry.name);

    if (entry.isDirectory()) {
      await mkdir(outputPath, { recursive: true });
      await linkTree(sourcePath, relativePath);
      continue;
    }

    if (!entry.isFile()) continue;

    const extension = path.extname(entry.name).toLowerCase();
    const portfolioImage = relativeDirectory.startsWith('assets/portfolio/');
    const matchingWebp = `${path.parse(entry.name).name}.webp`.toLowerCase();

    // Portfolio pages render WebP files; avoid uploading duplicate camera originals.
    if (portfolioImage && ['.jpg', '.jpeg', '.png'].includes(extension) && siblingFileNames.has(matchingWebp)) {
      skippedRedundantPortfolioImages.push(path.posix.join(relativeDirectory, entry.name));
      continue;
    }

    const fileInfo = await stat(sourcePath);
    const normalizedRelativePath = relativePath.replaceAll(path.sep, '/');

    if (fileInfo.size > maxAssetBytes) {
      oversized.push({ path: normalizedRelativePath, size: fileInfo.size });
      continue;
    }

    await link(sourcePath, outputPath);
  }
}

await linkTree(sourceRoot);

if (oversized.length) {
  await rm(outputRoot, { recursive: true, force: true });
  const details = oversized.map(({ path: filePath, size }) => `${filePath} (${(size / 1024 / 1024).toFixed(2)} MiB)`).join('\n');
  throw new Error(`Worker assets exceed Cloudflare's 25 MiB per-file limit:\n${details}`);
}

console.log(`Prepared Worker assets in ${path.relative(projectRoot, outputRoot)}.`);
console.log(`Excluded ${skippedRedundantPortfolioImages.length} portfolio source image(s) with WebP counterparts.`);
