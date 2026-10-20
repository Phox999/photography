import thumbnails from '../data/portfolio-thumbnails.json' with { type: 'json' };
import { getPortfolioImageSources } from './image-variants.ts';

export function portfolioThumbnailSource(source: string): string {
  return (thumbnails as Record<string, string>)[source] || getPortfolioImageSources(source).srcset?.split(', ')[0].split(' ')[0] || source;
}

export function setPortfolioThumbnailSource(image: HTMLImageElement, source: string): void {
  const thumbnail = portfolioThumbnailSource(source);
  image.dataset.originalSrc = source;
  image.dataset.thumbnailSrc = thumbnail;
  image.dataset.originalFallback = 'false';
  if (!image.dataset.thumbnailBound) {
    image.dataset.thumbnailBound = 'true';
    image.addEventListener('error', () => {
      const original = image.dataset.originalSrc;
      if (!original || image.dataset.thumbnailSrc === original || image.dataset.originalFallback === 'true') return;
      image.dataset.originalFallback = 'true';
      image.src = original;
    });
  }
  image.src = thumbnail;
}
