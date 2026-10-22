import thumbnails from '../data/portfolio-thumbnails.json' with { type: 'json' };
import { getPortfolioImageSources } from './image-variants.ts';

export function portfolioThumbnailSource(source: string, thumbnailSource = ''): string {
  return thumbnailSource || (thumbnails as Record<string, string>)[source]
    || getPortfolioImageSources(source).srcset?.split(', ')[0].split(' ')[0] || source;
}

export function setPortfolioThumbnailSource(
  image: HTMLImageElement,
  source: string,
  thumbnailSource = '',
  { fallbackToOriginalOnError = false }: { fallbackToOriginalOnError?: boolean } = {},
): void {
  const thumbnail = portfolioThumbnailSource(source, thumbnailSource);
  image.dataset.originalSrc = source;
  image.dataset.thumbnailSrc = thumbnail;
  image.dataset.originalFallback = 'false';
  image.dataset.fallbackToOriginalOnError = String(fallbackToOriginalOnError);
  if (!image.dataset.thumbnailBound) {
    image.dataset.thumbnailBound = 'true';
    image.addEventListener('error', () => {
      if (image.dataset.fallbackToOriginalOnError === 'true'
          && image.dataset.originalFallback !== 'true'
          && image.dataset.thumbnailSrc !== image.dataset.originalSrc) {
        image.dataset.originalFallback = 'true';
        image.src = image.dataset.originalSrc || '';
        return;
      }
      image.dataset.thumbnailFailed = 'true';
    });
  }
  image.dataset.thumbnailFailed = 'false';
  image.src = thumbnail;
}
