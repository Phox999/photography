import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { access, readdir } from 'node:fs/promises';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const assetsRoot = path.join(projectRoot, 'public', 'assets');
const webpQuality = 82;
const sourceExtensions = new Set(['.jpg', '.jpeg', '.png']);
const excludedFileNames = new Set(['profile-pic.jpg']);

async function collectSourceImages(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectSourceImages(fullPath)));
      continue;
    }

    if (entry.isFile()
      && sourceExtensions.has(path.extname(entry.name).toLowerCase())
      && !excludedFileNames.has(entry.name.toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
}

function toWebpPath(filePath) {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}.webp`);
}

function toDisplayPath(filePath) {
  return path.relative(projectRoot, filePath).replaceAll(path.sep, '/');
}

const failures = [];
let converted = 0;
let skippedExisting = 0;

try {
  const files = await collectSourceImages(assetsRoot);

  for (const file of files) {
    const output = toWebpPath(file);

    try {
      try {
        await access(output);
        skippedExisting += 1;
        continue;
      } catch {
        // The output does not exist yet, so it is safe to create.
      }

      const encoder = sharp(file);
      const webp = path.extname(file).toLowerCase() === '.png'
        ? encoder.webp({ lossless: true })
        : encoder.webp({ quality: webpQuality });
      await webp.toFile(output);
      converted += 1;
    } catch (error) {
      failures.push({
        file: toDisplayPath(file),
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(`Converted ${converted} image(s) to WebP; skipped ${skippedExisting} existing WebP file(s).`);

  if (failures.length > 0) {
    console.log(`Failed ${failures.length} image(s):`);
    for (const failure of failures) {
      console.log(`- ${failure.file}: ${failure.reason}`);
    }
    process.exitCode = 1;
  } else {
    console.log('Failed 0 image(s).');
  }
} catch (error) {
  console.error(
    `Failed to scan ${toDisplayPath(assetsRoot)}: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
}
