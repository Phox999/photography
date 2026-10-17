type AnalyticsWindow = Window & {
  dataLayer?: unknown[][];
  gtag?: (...arguments_: unknown[]) => void;
  __phoxAnalyticsDisabled?: boolean;
  __phoxAnalyticsPreferenceResolved?: boolean;
};

const privatePath = /^\/(?:admin|client|cooperation-status)(?:\/|$)/;
const measurementIdPattern = /^G-[A-Z0-9]+$/;
const initializedDocuments = new WeakMap<Document, string>();
const analyticsOptOutKey = 'phox999.analytics-disabled.v1';

function siteAnalyticsDisabled(targetWindow: AnalyticsWindow): boolean {
  if (targetWindow.__phoxAnalyticsDisabled === true) return true;
  try { return targetWindow.localStorage.getItem(analyticsOptOutKey) === '1'; }
  catch { return false; }
}

function publicPath(pathname: string): string | null {
  if (!pathname.startsWith('/') || privatePath.test(pathname)) return null;
  return pathname.slice(0, 500);
}

export function initInquiryAnalytics(
  measurementId: string | undefined,
  targetWindow: AnalyticsWindow = window,
  targetDocument: Document = document,
): boolean {
  const id = measurementId?.trim() ?? '';
  const path = publicPath(targetWindow.location.pathname);
  if (!measurementIdPattern.test(id) || !path) return false;
  if (siteAnalyticsDisabled(targetWindow)) {
    targetWindow.addEventListener('phox-site-analytics-enabled', () => initInquiryAnalytics(id, targetWindow, targetDocument), { once: true });
    return false;
  }
  if (targetWindow.__phoxAnalyticsPreferenceResolved !== true) {
    targetWindow.addEventListener('phox-site-analytics-enabled', () => initInquiryAnalytics(id, targetWindow, targetDocument), { once: true });
    return false;
  }
  const analyticsWindow = targetWindow as AnalyticsWindow;
  const priorId = initializedDocuments.get(targetDocument);
  if (priorId && priorId !== id) return false;
  analyticsWindow.dataLayer ??= [];
  analyticsWindow.gtag ??= (...args: unknown[]) => { analyticsWindow.dataLayer?.push(args); };
  const gtag = analyticsWindow.gtag;
  gtag('consent', 'update', { analytics_storage: 'granted' });
  if (priorId === id) return true;

  const pageLocation = `${targetWindow.location.origin}${path}`;
  gtag('js', new Date());
  gtag('config', id, {
    send_page_view: false,
    page_location: pageLocation,
    page_referrer: '',
  });

  if (!targetDocument.querySelector(`script[data-ga4-loader="${id}"]`)) {
    const script = targetDocument.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    script.dataset.ga4Loader = id;
    targetDocument.head.append(script);
  }

  targetWindow.addEventListener('phox-site-analytics-disabled', () => {
    analyticsWindow.gtag?.('consent', 'update', { analytics_storage: 'denied' });
  });
  targetWindow.addEventListener('phox-site-analytics-enabled', () => {
    if (!siteAnalyticsDisabled(targetWindow) && targetWindow.__phoxAnalyticsPreferenceResolved === true) {
      analyticsWindow.gtag?.('consent', 'update', { analytics_storage: 'granted' });
    }
  });

  targetDocument.addEventListener('click', (event) => {
    const target = event.target;
    const ElementConstructor = targetDocument.defaultView?.Element;
    if (!ElementConstructor || !(target instanceof ElementConstructor)) return;
    const link = target.closest<HTMLAnchorElement>('a[data-analytics-event="inquiry_click"]');
    if (!link || event.defaultPrevented || siteAnalyticsDisabled(targetWindow)) return;
    const placement = link.dataset.analyticsPlacement?.trim().slice(0, 80);
    if (!placement) return;
    gtag('event', 'inquiry_click', { placement, page_path: path });
  }, { capture: true });

  initializedDocuments.set(targetDocument, id);
  return true;
}
