import { faqItems } from '../data/site';

export type PublishedFAQ = { question: string; answer: string };
export type PublicSiteContent = { announcement: string; faqs: PublishedFAQ[] };

export function validatePublicSiteContent(value: unknown): PublicSiteContent | null {
  if (!value || typeof value !== 'object') return null;
  const content = value as Partial<PublicSiteContent>;
  if (typeof content.announcement !== 'string' || content.announcement.length > 500
    || !Array.isArray(content.faqs) || content.faqs.length > 12
    || !content.faqs.every(item => item && typeof item === 'object'
      && typeof item.question === 'string' && item.question.trim().length > 0 && item.question.length <= 160
      && typeof item.answer === 'string' && item.answer.trim().length > 0 && item.answer.length <= 1200)) return null;
  return { announcement: content.announcement, faqs: content.faqs.map(({ question, answer }) => ({ question, answer })) };
}

export function staticSiteContent(): PublicSiteContent {
  return { announcement: '', faqs: faqItems.map(item => ({ ...item })) };
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
