import variants from '../data/image-variants.json' with { type: 'json' };

type ImageVariantEntry = { variant?: string; width: number; height: number };
const imageVariantMap = variants as Record<string, ImageVariantEntry>;
const SUPABASE_PORTFOLIO_PATH = /^\/storage\/v1\/object\/public\/site-portfolio\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;

export interface ResponsiveImageSources {
  src: string;
  srcset?: string;
  fallbackSrc: string;
}

function transformedPortfolioUrl(source: string, width: number): string | undefined {
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || !SUPABASE_PORTFOLIO_PATH.test(url.pathname)
      || url.search || url.hash) return undefined;
    url.pathname = url.pathname.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
    url.searchParams.set('width', String(width));
    url.searchParams.set('quality', '82');
    return url.href;
  } catch {
    return undefined;
  }
}

export function getImageSrcset(source: string): string | undefined {
  const entry = imageVariantMap[source];
  if (!entry?.variant) return undefined;
  const encodedSource = source.replaceAll(' ', '%20').replaceAll(',', '%2C');
  const encodedVariant = entry.variant.replaceAll(' ', '%20').replaceAll(',', '%2C');
  return `${encodedVariant} 1280w, ${encodedSource} ${entry.width}w`;
}

export function getImageDimensions(source: string): { width: number; height: number } | undefined {
  const entry = imageVariantMap[source];
  return entry ? { width: entry.width, height: entry.height } : undefined;
}

export function getPortfolioImageSources(source: string): ResponsiveImageSources {
  const localSrcset = getImageSrcset(source);
  if (localSrcset) return { src: source, srcset: localSrcset, fallbackSrc: source };

  const remoteCandidates = [640, 960, 1280]
    .map((width) => {
      const candidate = transformedPortfolioUrl(source, width);
      return candidate ? `${candidate} ${width}w` : undefined;
    })
    .filter((candidate): candidate is string => Boolean(candidate));
  if (remoteCandidates.length) {
    const largestCandidate = transformedPortfolioUrl(source, 1280)!;
    return { src: largestCandidate, srcset: remoteCandidates.join(', '), fallbackSrc: source };
  }

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
