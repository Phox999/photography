import { link, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliOptions = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const option = process.argv[index];
  if (!['--source', '--output'].includes(option) || !process.argv[index + 1]) {
    throw new Error(`Unknown or incomplete option: ${option}`);
  }
  cliOptions.set(option, path.resolve(projectRoot, process.argv[++index]));
}

const sourceRoot = cliOptions.get('--source') ?? path.join(projectRoot, 'dist');
const outputRoot = cliOptions.get('--output') ?? path.join(projectRoot, 'worker-dist');
const maxAssetBytes = 25 * 1024 * 1024;
const isWithinProject = (candidate) => {
  const relative = path.relative(projectRoot, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
const isolatedOutput = cliOptions.has('--output');
if (!isWithinProject(sourceRoot) || !isWithinProject(outputRoot)) {
  throw new Error('Worker source and output must be project subdirectories.');
}
if (sourceRoot === outputRoot) throw new Error('Worker source and output must be different directories.');
if (isolatedOutput && (outputRoot === path.join(projectRoot, 'dist') || outputRoot === path.join(projectRoot, 'worker-dist'))) {
  throw new Error('An explicit Worker output must use a separate isolated directory.');
}

if (isolatedOutput) {
  try {
    await stat(outputRoot);
    throw new Error(`Refusing to overwrite existing isolated Worker output: ${path.relative(projectRoot, outputRoot)}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
} else {
  if (path.dirname(outputRoot) !== projectRoot || path.basename(outputRoot) !== 'worker-dist') {
    throw new Error('Default Worker output must remain the project worker-dist directory.');
  }
  await rm(outputRoot, { recursive: true, force: true });
}
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
