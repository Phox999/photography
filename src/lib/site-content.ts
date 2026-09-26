import { faqItems } from '../data/site';

export type PublishedFAQ = { question: string; answer: string };
export type PublicSiteContent = {
  announcement: string;
  faqs: PublishedFAQ[];
  hero_title: string;
  hero_copy: string;
  hero_image_url: string | null;
};

const DEFAULT_HERO_TITLE = '第一次互惠拍攝，\n也能安心開始。';
const DEFAULT_HERO_COPY = '不論你是第一次拍照，還是想累積作品，\n拍攝前都會充分溝通需求與風格，尊重彼此的想法，一起完成自然、有故事的作品。';

function validHeroImageUrl(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      && /^\/storage\/v1\/object\/public\/site-hero\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(url.pathname);
  } catch { return false; }
}

export function validatePublicSiteContent(value: unknown): PublicSiteContent | null {
  if (!value || typeof value !== 'object') return null;
  const content = value as Partial<PublicSiteContent>;
  if (typeof content.announcement !== 'string' || content.announcement.length > 500
    || !Array.isArray(content.faqs) || content.faqs.length > 12
    || typeof content.hero_title !== 'string' || !content.hero_title.trim() || content.hero_title.length > 120
    || typeof content.hero_copy !== 'string' || !content.hero_copy.trim() || content.hero_copy.length > 1000
    || !validHeroImageUrl(content.hero_image_url)
    || !content.faqs.every(item => item && typeof item === 'object'
      && typeof item.question === 'string' && item.question.trim().length > 0 && item.question.length <= 160
      && typeof item.answer === 'string' && item.answer.trim().length > 0 && item.answer.length <= 1200)) return null;
  return {
    announcement: content.announcement,
    faqs: content.faqs.map(({ question, answer }) => ({ question, answer })),
    hero_title: content.hero_title,
    hero_copy: content.hero_copy,
    hero_image_url: content.hero_image_url,
  };
}

export function staticSiteContent(): PublicSiteContent {
  return {
    announcement: '',
    faqs: faqItems.map(item => ({ ...item })),
    hero_title: DEFAULT_HERO_TITLE,
    hero_copy: DEFAULT_HERO_COPY,
    hero_image_url: null,
  };
}

// All public consumers use one promise, including separately bundled preview scripts.
// Nothing from the helper's conversation is sent with this anonymous GET request.
declare global { interface Window { __phox999PublicContent?: Promise<PublicSiteContent> } }

export function loadPublicSiteContent(): Promise<PublicSiteContent> {
  if (typeof window === 'undefined') return Promise.resolve(staticSiteContent());
  if (window.__phox999PublicContent) return window.__phox999PublicContent;
  window.__phox999PublicContent = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/site-content', { signal: controller.signal, credentials: 'omit' });
      if (!response.ok) return staticSiteContent();
      return validatePublicSiteContent(await response.json()) ?? staticSiteContent();
    } catch { return staticSiteContent(); }
    finally { window.clearTimeout(timeout); }
  })();
  return window.__phox999PublicContent;
}
