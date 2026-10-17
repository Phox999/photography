export type SiteAnalyticsEventName =
  | 'page_view' | 'inquiry_cta_click' | 'outbound_contact_click'
  | 'form_start' | 'form_review' | 'form_submit_attempt' | 'form_submit_error';

type AnalyticsAttributes = {
  placement?: string;
  destination?: string;
  errorCode?: string;
};

type AnalyticsEvent = {
  id: string;
  name: SiteAnalyticsEventName;
  path: string;
  clientAt: string;
  placement?: string;
  destination?: string;
  errorCode?: string;
};

type EventDetail = { name: SiteAnalyticsEventName } & AnalyticsAttributes;

const OPT_OUT_KEY = 'phox999.analytics-disabled.v1';
const EVENT_NAME = 'phox-site-analytics-event';
const initialized = new WeakSet<Document>();
const destinations = new Set(['internal', 'google_form', 'instagram', 'threads', 'facebook', 'email', 'other']);
const placements = new Set([
  'header-desktop', 'header-mobile', 'hero', 'projects-general', 'projects-empty',
  'cooperation', 'portfolio-index', 'behind-scenes', 'inspiration-board',
  'journal-footer', 'journal-body', 'plans', 'footer',
]);
let runtimeOptOut = false;

function optedOut(): boolean {
  if (runtimeOptOut) return true;
  try { return window.localStorage.getItem(OPT_OUT_KEY) === '1'; }
  catch { return false; }
}

export function isSiteAnalyticsDisabled(): boolean {
  return typeof window !== 'undefined' && (runtimeOptOut || optedOut());
}

function markAnalyticsPreferenceResolved(targetWindow: Window): void {
  const analyticsWindow = targetWindow as Window & { __phoxAnalyticsPreferenceResolved?: boolean };
  if (analyticsWindow.__phoxAnalyticsPreferenceResolved) return;
  analyticsWindow.__phoxAnalyticsPreferenceResolved = true;
  targetWindow.dispatchEvent(new Event('phox-site-analytics-enabled'));
}

function publicPath(pathname: string): string | null {
  if (/^\/(admin|client|cooperation-status|projects\/preview)(?:\/|$)/.test(pathname) || pathname === '/404/') return null;
  if (pathname === '/' || /^\/(about|behind-scenes|cooperation|apply|portfolio|projects|journal|inspiration)\/?$/.test(pathname)) return pathname;
  if (/^\/(portfolio|projects|journal)\/[^/]+\/?$/.test(pathname)) return pathname;
  return null;
}

function landingDetails(): Record<string, string> {
  const params = new URLSearchParams(window.location.search);
  let referrerHost = '';
  try { referrerHost = document.referrer ? new URL(document.referrer).hostname : ''; } catch { /* Referrers may be unavailable. */ }
  return {
    referrerHost,
    utmSource: params.get('utm_source') || '',
    utmMedium: params.get('utm_medium') || '',
    utmCampaign: params.get('utm_campaign') || '',
  };
}

function deviceType(): 'mobile' | 'tablet' | 'desktop' {
  const width = window.matchMedia('(max-width: 639px)').matches ? 'mobile'
    : window.matchMedia('(max-width: 1023px)').matches ? 'tablet' : 'desktop';
  return width;
}

function safePlacement(value: string | undefined): string {
  return value && placements.has(value) ? value : 'other';
}

function destinationFor(rawHref: string): 'internal' | 'google_form' | 'instagram' | 'threads' | 'facebook' | 'email' | 'other' {
  if (/^mailto:/i.test(rawHref)) return 'email';
  if (/^tel:/i.test(rawHref)) return 'other';
  try {
    const url = new URL(rawHref, window.location.href);
    if (url.origin === window.location.origin) return 'internal';
    const host = url.hostname.toLowerCase();
    if (host === 'forms.gle' || host === 'docs.google.com') return 'google_form';
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram';
    if (host === 'threads.net' || host.endsWith('.threads.net')) return 'threads';
    if (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.com') return 'facebook';
  } catch { /* Ignore malformed links. */ }
  return 'other';
}

function createEvent(detail: EventDetail, path: string): AnalyticsEvent | null {
  if (!window.crypto?.randomUUID) return null;
  const event: AnalyticsEvent = {
    id: window.crypto.randomUUID(),
    name: detail.name,
    path,
    clientAt: new Date().toISOString(),
  };
  if (detail.name === 'inquiry_cta_click') {
    event.placement = safePlacement(detail.placement);
    event.destination = destinations.has(detail.destination || '') ? detail.destination : 'other';
  } else if (detail.name === 'outbound_contact_click') {
    event.destination = destinations.has(detail.destination || '') && detail.destination !== 'internal' ? detail.destination : 'other';
  } else if (detail.name === 'form_submit_error') {
    const codes = new Set(['validation', 'network', 'server', 'rate_limited', 'unknown']);
    event.errorCode = codes.has(detail.errorCode || '') ? detail.errorCode : 'unknown';
  }
  return event;
}

export function trackSiteEvent(name: SiteAnalyticsEventName, attributes: AnalyticsAttributes = {}): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<EventDetail>(EVENT_NAME, { detail: { name, ...attributes } }));
}

async function sendPreference(preference: 'disabled' | 'enabled' | 'clear'): Promise<void> {
  const response = await fetch('/api/analytics/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    keepalive: true,
    body: JSON.stringify({ preference }),
  });
  if (!response.ok) throw new Error('preference_update_failed');
}

function bindPreferences() {
  const toggle = document.querySelector<HTMLButtonElement>('[data-site-analytics-toggle]');
  const clear = document.querySelector<HTMLButtonElement>('[data-site-analytics-clear]');
  const status = document.querySelector<HTMLElement>('[data-site-analytics-status]');
  if (!toggle) return;

  const update = () => {
    const disabled = optedOut();
    runtimeOptOut = disabled;
    (window as Window & { __phoxAnalyticsDisabled?: boolean }).__phoxAnalyticsDisabled = disabled;
    toggle.setAttribute('aria-pressed', String(disabled));
    toggle.textContent = disabled ? '啟用匿名量測' : '停用匿名量測';
  };
  update();

  toggle.addEventListener('click', async () => {
    toggle.disabled = true;
    const disable = !optedOut();
    runtimeOptOut = disable;
    (window as Window & { __phoxAnalyticsDisabled?: boolean }).__phoxAnalyticsDisabled = disable;
    if (disable) {
      (window as Window & { __phoxAnalyticsPreferenceResolved?: boolean }).__phoxAnalyticsPreferenceResolved = false;
      window.dispatchEvent(new Event('phox-site-analytics-disabled'));
    }
    try {
      if (disable) window.localStorage.setItem(OPT_OUT_KEY, '1');
      else window.localStorage.removeItem(OPT_OUT_KEY);
    } catch { /* The server cookie still records the preference when available. */ }
    update();
    if (status) status.textContent = disable ? '已在此瀏覽器停用匿名量測。' : '已在此瀏覽器啟用匿名量測。';
    try {
      await sendPreference(disable ? 'disabled' : 'enabled');
      if (!disable) {
        markAnalyticsPreferenceResolved(window);
        trackSiteEvent('page_view');
      }
    } catch {
      if (status) status.textContent = disable
        ? '本機已停用量測；伺服器偏好同步尚未確認。'
        : '本機偏好已更新；伺服器同步尚未確認。';
    } finally {
      toggle.disabled = false;
    }
  });

  clear?.addEventListener('click', async () => {
    try {
      await sendPreference('clear');
      if (status) status.textContent = '已清除本站量測識別碼。';
    } catch {
      if (status) status.textContent = '目前無法確認識別碼已清除，請稍後重試。';
    }
  });
}

export function initSiteAnalytics(targetWindow: Window = window, targetDocument: Document = document): boolean {
  if (initialized.has(targetDocument)) return true;
  initialized.add(targetDocument);
  runtimeOptOut = optedOut();
  (targetWindow as Window & { __phoxAnalyticsDisabled?: boolean }).__phoxAnalyticsDisabled = runtimeOptOut;
  const path = publicPath(targetWindow.location.pathname);
  bindPreferences();
  if (!path) return false;

  let queue: AnalyticsEvent[] = [];
  let timer = 0;
  let sending = false;
  let firstPageMetadata = landingDetails();
  let landingPending = true;

  const flush = async (attempt = 0): Promise<void> => {
    if (sending || queue.length === 0 || optedOut()) return;
    sending = true;
    const batch = queue.splice(0, 10);
    try {
      const response = await fetch('/api/analytics/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        keepalive: true,
        body: JSON.stringify({ events: batch, landing: landingPending ? firstPageMetadata : undefined, device: deviceType() }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok) landingPending = false;
      if (response.ok && !optedOut() && result.optedOut !== true && result.filtered !== true) {
        markAnalyticsPreferenceResolved(targetWindow);
      }
      if (result.optedOut === true) {
        runtimeOptOut = true;
        (targetWindow as Window & { __phoxAnalyticsDisabled?: boolean }).__phoxAnalyticsDisabled = true;
        try { targetWindow.localStorage.setItem(OPT_OUT_KEY, '1'); } catch { /* Keep the server-enforced preference. */ }
        const preferenceToggle = targetDocument.querySelector<HTMLButtonElement>('[data-site-analytics-toggle]');
        if (preferenceToggle) { preferenceToggle.setAttribute('aria-pressed', 'true'); preferenceToggle.textContent = '啟用匿名量測'; }
        const preferenceStatus = targetDocument.querySelector<HTMLElement>('[data-site-analytics-status]');
        if (preferenceStatus) preferenceStatus.textContent = '此瀏覽器已停用匿名量測。';
        queue = [];
      } else if (!response.ok && attempt < 2) {
        queue.unshift(...batch);
        window.setTimeout(() => { sending = false; void flush(attempt + 1); }, attempt === 0 ? 400 : 1400);
        return;
      }
    } catch {
      if (attempt < 2) {
        queue.unshift(...batch);
        window.setTimeout(() => { sending = false; void flush(attempt + 1); }, attempt === 0 ? 400 : 1400);
        return;
      }
    }
    sending = false;
    if (queue.length) void flush();
  };

  const enqueue = (detail: EventDetail) => {
    if (optedOut()) return;
    const event = createEvent(detail, path);
    if (!event) return;
    queue.push(event);
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => { void flush(); }, 120);
  };

  targetWindow.addEventListener('phox-site-analytics-disabled', () => {
    queue = [];
    if (timer) targetWindow.clearTimeout(timer);
  });

  targetWindow.addEventListener(EVENT_NAME, ((event: CustomEvent<EventDetail>) => {
    enqueue(event.detail);
  }) as EventListener);

  const ElementConstructor = targetDocument.defaultView?.Element;
  targetDocument.addEventListener('click', (event) => {
    const target = event.target;
    if (!ElementConstructor || !(target instanceof ElementConstructor)) return;
    const link = target.closest<HTMLAnchorElement>('a[href]');
    if (!link) return;
    const destination = destinationFor(link.href);
    if (link.dataset.analyticsEvent === 'inquiry_click') {
      enqueue({
        name: 'inquiry_cta_click',
        placement: safePlacement(link.dataset.analyticsPlacement),
        destination,
      });
      if (destination !== 'internal' && destination !== 'other') enqueue({ name: 'outbound_contact_click', destination });
    } else if (destination === 'instagram' || destination === 'threads' || destination === 'facebook' || destination === 'email') {
      enqueue({ name: 'outbound_contact_click', destination });
    }
  }, { capture: true });

  let formStarted = false;
  const inquiryForm = targetDocument.querySelector<HTMLFormElement>('[data-inquiry-form]');
  inquiryForm?.addEventListener('input', (event) => {
    if (formStarted || !ElementConstructor || !(event.target instanceof ElementConstructor)) return;
    if (event.target.closest('input[name="website"]')) return;
    formStarted = true;
    enqueue({ name: 'form_start' });
  });


  enqueue({ name: 'page_view' });

  return true;
}
