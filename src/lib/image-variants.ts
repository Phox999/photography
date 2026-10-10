import variants from '../data/image-variants.json' with { type: 'json' };

type ImageVariantEntry = { variant?: string; variant640?: string; width: number; height: number };
const imageVariantMap = variants as Record<string, ImageVariantEntry>;

export interface ResponsiveImageSources {
  src: string;
  srcset?: string;
  fallbackSrc: string;
}

export function getImageSrcset(source: string): string | undefined {
  const entry = imageVariantMap[source];
  if (!entry) return undefined;
  const candidates = [
    entry.variant640 ? { source: entry.variant640, width: 640 } : undefined,
    entry.variant ? { source: entry.variant, width: Math.min(1280, entry.width) } : undefined,
    entry.width > 640 ? { source, width: entry.width } : undefined,
  ].filter((candidate): candidate is { source: string; width: number } => Boolean(candidate));
  const unique = [...new Map(candidates.map((candidate) => [candidate.width, candidate])).values()];
  return unique.length > 1
    ? unique.map(({ source: candidate, width }) => `${encodeImageUrl(candidate)} ${width}w`).join(', ')
    : undefined;
}

function encodeImageUrl(source: string): string {
  return source.replaceAll(' ', '%20').replaceAll(',', '%2C');
}

export function getImageDimensions(source: string): { width: number; height: number } | undefined {
  const entry = imageVariantMap[source];
  return entry ? { width: entry.width, height: entry.height } : undefined;
}

export function getPortfolioImageSources(source: string): ResponsiveImageSources {
  const localSrcset = getImageSrcset(source);
  if (localSrcset) return { src: source, srcset: localSrcset, fallbackSrc: source };
  return { src: source, fallbackSrc: source };
}

export function setPortfolioImageSource(
  image: HTMLImageElement,
  source: string,
  sizes: string,
): void {
  const candidates = getPortfolioImageSources(source);
  image.dataset.originalSrc = source;
  image.dataset.originalFallback = 'false';
  if (candidates.srcset) {
    image.srcset = candidates.srcset;
    image.sizes = sizes;
  }

  const dimensions = getImageDimensions(source);
  if (dimensions) {
    image.width = dimensions.width;
    image.height = dimensions.height;
  } else {
    image.addEventListener('load', () => {
      if (!image.naturalWidth || !image.naturalHeight) return;
      image.width = image.naturalWidth;
      image.height = image.naturalHeight;
    });
  }

  image.addEventListener('error', () => {
    if ((candidates.src === source && !candidates.srcset) || image.dataset.originalFallback === 'true' || image.currentSrc === source) return;
    image.dataset.originalFallback = 'true';
    image.removeAttribute('srcset');
    image.removeAttribute('sizes');
    image.src = source;
  });
  image.src = candidates.src;
}
