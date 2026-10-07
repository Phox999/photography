import path from 'node:path';
import sharp from 'sharp';

export interface ImageDimensions {
  width: number;
  height: number;
}

const publicRoot = path.resolve(process.cwd(), 'public');
const dimensionsCache = new Map<string, Promise<ImageDimensions | undefined>>();

export function getPublicImageDimensions(src: string): Promise<ImageDimensions | undefined> {
  const cached = dimensionsCache.get(src);
  if (cached) return cached;

  const result = (async () => {
    try {
      const imageUrl = new URL(src, 'https://phox999.com');
      if (imageUrl.origin !== 'https://phox999.com' || !imageUrl.pathname.startsWith('/assets/')) return undefined;

      const segments = imageUrl.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      const imagePath = path.resolve(publicRoot, ...segments);
      const relativePath = path.relative(publicRoot, imagePath);
      if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) return undefined;

      const metadata = await sharp(imagePath).metadata();
      if (!metadata.width || !metadata.height) return undefined;
      return { width: metadata.width, height: metadata.height };
    } catch {
      return undefined;
    }
  })();

  dimensionsCache.set(src, result);
  return result;
}
