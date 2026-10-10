import heroVariantManifest from '../data/hero-image-variants.json' with { type: 'json' };

export interface HeroImageSources {
  src: string;
  srcset?: string;
  fallbackSrc: string;
  sizes?: string;
  width?: number;
  height?: number;
  matchesStaticFallback?: boolean;
}

const HERO_SIZES = '(orientation: portrait) 150svh, 100vw';
type HeroVariantManifestEntry = { width: number; height: number; candidates: Array<{ src: string; width: number }> };
const heroManifest = heroVariantManifest as { defaultSource?: string; variants: Record<string, HeroVariantManifestEntry> };
const heroVariants = heroManifest.variants;

export function heroImageSources(source: string): HeroImageSources {
  if (source === '/assets/hero.webp') {
    return {
      src: '/assets/hero-1440.webp',
      srcset: '/assets/hero-960.webp 960w, /assets/hero-1440.webp 1440w, /assets/hero-2560.webp 2560w',
      fallbackSrc: source,
      sizes: HERO_SIZES,
    };
  }

  const entry = heroVariants[source];
  if (entry?.candidates.length) {
    const candidates = [...entry.candidates].sort((a, b) => a.width - b.width);
    return {
      src: candidates.at(-1)!.src,
      srcset: candidates.map(({ src, width }) => `${src} ${width}w`).join(', '),
      fallbackSrc: source,
      sizes: HERO_SIZES,
      width: entry.width,
      height: entry.height,
      ...(source === heroManifest.defaultSource ? { matchesStaticFallback: true } : {}),
    };
  }

  return { src: source, fallbackSrc: source };
}

export async function canReuseStaticHeroImage(image: HTMLImageElement, source: string): Promise<boolean> {
  if (!heroImageSources(source).matchesStaticFallback || image.dataset.originalSrc !== source) return false;
  try {
    await image.decode();
    return image.naturalWidth > 0;
  } catch {
    return false;
  }
}

export async function loadHeroImageWithFallback(image: HTMLImageElement): Promise<boolean> {
  const sources = heroImageSources(image.dataset.originalSrc || image.currentSrc || image.src);
  if (sources.sizes) image.sizes = sources.sizes;
  else image.removeAttribute('sizes');
  if (sources.srcset) image.srcset = sources.srcset;
  else image.removeAttribute('srcset');
  image.src = sources.src;

  try {
    await image.decode();
    if (image.naturalWidth > 0) return true;
  } catch { /* Retry the original source below when this was a transformed candidate. */ }

  if (sources.fallbackSrc === sources.src) return false;
  image.removeAttribute('srcset');
  image.removeAttribute('sizes');
  image.src = sources.fallbackSrc;
  try {
    await image.decode();
    return image.naturalWidth > 0;
  } catch {
    return false;
  }
}

export async function replaceHeroImagesWhenLoaded(
  media: Pick<HTMLElement, 'replaceChildren'>,
  images: HTMLImageElement[],
): Promise<boolean> {
  if (!images.length || !await loadHeroImageWithFallback(images[0])) return false;
  media.replaceChildren(...images);
  return true;
}
