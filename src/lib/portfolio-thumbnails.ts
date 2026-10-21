import thumbnails from '../data/portfolio-thumbnails.json' with { type: 'json' };
import { getPortfolioImageSources } from './image-variants.ts';

export function portfolioThumbnailSource(source: string, thumbnailSource = ''): string {
  return thumbnailSource || (thumbnails as Record<string, string>)[source]
    || getPortfolioImageSources(source).srcset?.split(', ')[0].split(' ')[0] || source;
}

export function setPortfolioThumbnailSource(image: HTMLImageElement, source: string, thumbnailSource = ''): void {
  const thumbnail = portfolioThumbnailSource(source, thumbnailSource);
  image.dataset.originalSrc = source;
  image.dataset.thumbnailSrc = thumbnail;
  image.dataset.originalFallback = 'false';
  if (!image.dataset.thumbnailBound) {
    image.dataset.thumbnailBound = 'true';
    image.addEventListener('error', () => {
      image.dataset.thumbnailFailed = 'true';
    });
  }
  image.dataset.thumbnailFailed = 'false';
  image.src = thumbnail;
}
