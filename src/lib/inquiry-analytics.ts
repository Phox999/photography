type AnalyticsWindow = Window & {
  dataLayer?: unknown[][];
  gtag?: (...arguments_: unknown[]) => void;
};

const privatePath = /^\/(?:admin|client|cooperation-status)(?:\/|$)/;
const measurementIdPattern = /^G-[A-Z0-9]+$/;
const initializedDocuments = new WeakMap<Document, string>();

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
  if (initializedDocuments.has(targetDocument)) return initializedDocuments.get(targetDocument) === id;

  const analyticsWindow = targetWindow as AnalyticsWindow;
  analyticsWindow.dataLayer ??= [];
  analyticsWindow.gtag ??= (...args: unknown[]) => { analyticsWindow.dataLayer?.push(args); };
  const gtag = analyticsWindow.gtag;
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

  targetDocument.addEventListener('click', (event) => {
    const target = event.target;
    const ElementConstructor = targetDocument.defaultView?.Element;
    if (!ElementConstructor || !(target instanceof ElementConstructor)) return;
    const link = target.closest<HTMLAnchorElement>('a[data-analytics-event="inquiry_click"]');
    if (!link || event.defaultPrevented) return;
    const placement = link.dataset.analyticsPlacement?.trim().slice(0, 80);
    if (!placement) return;
    gtag('event', 'inquiry_click', { placement, page_path: path });
  }, { capture: true });

  initializedDocuments.set(targetDocument, id);
  return true;
}
