export interface HeroImageSources {
  src: string;
  srcset?: string;
  fallbackSrc: string;
  sizes?: string;
}

const HERO_SIZES = '(orientation: portrait) 150svh, 100vw';
const SUPABASE_HERO_PATH = /^\/storage\/v1\/object\/public\/site-hero\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;

function transformedHeroUrl(source: string, width: number) {
  const url = new URL(source);
  url.pathname = url.pathname.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
  url.searchParams.set('width', String(width));
  url.searchParams.set('quality', '82');
  return url.href;
}

export function heroImageSources(source: string): HeroImageSources {
  if (source === '/assets/hero.webp') {
    return {
      src: '/assets/hero-1440.webp',
      srcset: '/assets/hero-960.webp 960w, /assets/hero-1440.webp 1440w, /assets/hero-2560.webp 2560w',
      fallbackSrc: source,
      sizes: HERO_SIZES,
    };
  }

  try {
    const url = new URL(source);
    if (url.protocol === 'https:' && url.hostname.endsWith('.supabase.co') && SUPABASE_HERO_PATH.test(url.pathname)) {
      return {
        src: transformedHeroUrl(source, 1600),
        srcset: [960, 1600, 2500].map((width) => `${transformedHeroUrl(source, width)} ${width}w`).join(', '),
        fallbackSrc: source,
        sizes: HERO_SIZES,
      };
    }
  } catch { /* Keep the original source for unsupported or malformed URLs. */ }

  return { src: source, fallbackSrc: source };
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
