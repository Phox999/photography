export type SiteAnalyticsEventName =
  | 'page_view' | 'inquiry_cta_click' | 'cta_view' | 'outbound_contact_click'
  | 'form_start' | 'form_review' | 'form_submit_attempt' | 'form_submit_error'
  | 'form_step_enter' | 'form_step_complete';

type AnalyticsAttributes = {
  placement?: string;
  destination?: string;
  errorCode?: string;
  formInstanceId?: string;
  stepId?: 'styles' | 'details' | 'review';
  visiblePercent?: number;
  visibleMs?: number;
};

type AnalyticsEvent = {
  id: string;
  name: SiteAnalyticsEventName;
  path: string;
  clientAt: string;
  schemaVersion: 2;
  pageVisitId: string;
  tabId: string;
  documentId: string;
  eventSeq: number;
  tabSeq: number;
} & AnalyticsAttributes;

type EventDetail = { name: SiteAnalyticsEventName } & AnalyticsAttributes;

const OPT_OUT_KEY = 'phox999.analytics-disabled.v1';
const TAB_ID_KEY = 'phox999.analytics-tab.v2';
const TAB_SEQ_KEY = 'phox999.analytics-tab-seq.v2';
const EVENT_NAME = 'phox-site-analytics-event';
const IDENTITY_LOCK = 'phox999.analytics.identity.v2';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const initialized = new WeakSet<Document>();
const destinations = new Set(['internal', 'google_form', 'instagram', 'threads', 'facebook', 'email', 'other']);
const placements = new Set([
  'header-desktop', 'header-mobile', 'hero', 'projects-general', 'projects-empty',
  'cooperation', 'portfolio-index', 'behind-scenes', 'inspiration-board', 'contact-icon',
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
    if (host === 'threads.com' || host.endsWith('.threads.com') || host === 'threads.net' || host.endsWith('.threads.net')) return 'threads';
    if (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.com') return 'facebook';
  } catch { /* Ignore malformed links. */ }
  return 'other';
}

function uuid(targetWindow: Window): string | null {
  const cryptoApi = targetWindow.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  if (!cryptoApi?.getRandomValues) return null;
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}

function readTabId(targetWindow: Window): string | null {
  const storageWindow = targetWindow as Window & { sessionStorage: Storage };
  try {
    // Without cross-tab coordination, a copied sessionStorage ID cannot be trusted for path joins.
    if (typeof BroadcastChannel === 'undefined') {
      const perDocument = uuid(targetWindow);
      if (perDocument) storageWindow.sessionStorage.setItem(TAB_ID_KEY, perDocument);
      return perDocument;
    }
    const stored = storageWindow.sessionStorage.getItem(TAB_ID_KEY);
    if (stored && UUID_PATTERN.test(stored)) return stored;
    const created = uuid(targetWindow);
    if (created) storageWindow.sessionStorage.setItem(TAB_ID_KEY, created);
    return created;
  } catch { return uuid(targetWindow); }
}

async function resolveTabId(targetWindow: Window, currentTabId: string | null): Promise<string | null> {
  if (!currentTabId || typeof BroadcastChannel === 'undefined') return currentTabId;
  const ownerToken = uuid(targetWindow);
  if (!ownerToken) return currentTabId;
  const channel = new BroadcastChannel('phox999-analytics-tabs-v2');
  (targetWindow as Window & { __phoxAnalyticsTabChannelV2?: BroadcastChannel }).__phoxAnalyticsTabChannelV2 = channel;
  const claims: boolean[] = [];
  let tabId = currentTabId;
  let navigating = false;
  let retiring = false;
  const nodeChannel = channel as BroadcastChannel & { unref?: () => void };
  nodeChannel.unref?.();
  channel.addEventListener('message', (event: MessageEvent) => {
    const data = event.data;
    if (!data) return;
    if (data.type === 'hello' && data.tabId === tabId) {
      if (data.ownerToken === ownerToken) return;
      channel.postMessage({
        type: 'claim',
        ownerToken: data.ownerToken,
        tabId,
        handoff: navigating || retiring,
      });
    } else if (data.type === 'claim' && data.ownerToken === ownerToken && data.tabId === tabId) {
      claims.push(data.handoff === true);
    }
  });
  const markNavigation = (event: Event) => {
    const mouseEvent = event as MouseEvent;
    if (mouseEvent.defaultPrevented || mouseEvent.button > 0 || mouseEvent.metaKey || mouseEvent.ctrlKey || mouseEvent.shiftKey || mouseEvent.altKey) return;
    const target = event.target;
    const ElementConstructor = targetWindow.document.defaultView?.Element;
    if (!ElementConstructor || !(target instanceof ElementConstructor)) return;
    const link = target.closest<HTMLAnchorElement>('a[href]');
    if (!link || (link.target && link.target.toLowerCase() !== '_self')) return;
    try {
      const destination = new URL(link.href, targetWindow.location.href);
      if (destination.origin === targetWindow.location.origin
        && (destination.pathname !== targetWindow.location.pathname || destination.search !== targetWindow.location.search)) {
        navigating = true;
      }
    } catch { /* Ignore malformed links. */ }
  };
  targetWindow.document.addEventListener('click', markNavigation, true);
  targetWindow.addEventListener('pagehide', () => { retiring = true; });
  targetWindow.addEventListener('pageshow', (event) => {
    if ((event as PageTransitionEvent).persisted) {
      retiring = false;
      navigating = false;
    }
  });
  channel.postMessage({ type: 'hello', tabId, ownerToken });
  await new Promise<void>((resolve) => targetWindow.setTimeout(resolve, 80));
  if (!claims.some((handoff) => !handoff)) return currentTabId;
  const replacement = uuid(targetWindow);
  if (!replacement) return currentTabId;
  try {
    targetWindow.sessionStorage.setItem(TAB_ID_KEY, replacement);
    targetWindow.sessionStorage.removeItem(TAB_SEQ_KEY);
  } catch { /* A per-document ID still prevents false event joins. */ }
  tabId = replacement;
  return replacement;
}

function withIdentityLock<T>(targetWindow: Window, callback: () => Promise<T>): Promise<T> {
  const navigatorWithLocks = targetWindow.navigator as Navigator & {
    locks?: { request: (name: string, callback: () => Promise<T>) => Promise<T> };
  };
  if (navigatorWithLocks.locks?.request) return navigatorWithLocks.locks.request(IDENTITY_LOCK, callback);
  if (typeof BroadcastChannel !== 'undefined') return withBroadcastIdentityLock(targetWindow, callback);
  return callback();
}

async function withBroadcastIdentityLock<T>(targetWindow: Window, callback: () => Promise<T>): Promise<T> {
  const owner = uuid(targetWindow);
  if (!owner) return callback();
  const channel = new BroadcastChannel(IDENTITY_LOCK + '.fallback');
  const contenders = new Set([owner]);
  const wakeWaiters: Array<() => void> = [];
  let heldBy: string | null = null;
  const wake = () => wakeWaiters.splice(0).forEach((notify) => notify());
  channel.addEventListener('message', (event: MessageEvent) => {
    const data = event.data;
    if (!data || typeof data.owner !== 'string' || data.owner === owner) return;
    if (data.type === 'request') {
      contenders.add(data.owner);
      if (heldBy === owner) channel.postMessage({ type: 'held', owner });
    } else if (data.type === 'held') {
      heldBy = data.owner;
    } else if (data.type === 'release') {
      contenders.delete(data.owner);
      if (heldBy === data.owner) heldBy = null;
    }
    wake();
  });
  channel.postMessage({ type: 'request', owner });

  const delay = (milliseconds: number) => new Promise<void>((resolve) => targetWindow.setTimeout(resolve, milliseconds));
  const waitForSignal = () => new Promise<void>((resolve) => {
    let timer = 0;
    const notify = () => { targetWindow.clearTimeout(timer); resolve(); };
    timer = targetWindow.setTimeout(() => {
      const index = wakeWaiters.indexOf(notify);
      if (index >= 0) wakeWaiters.splice(index, 1);
      resolve();
    }, 50);
    wakeWaiters.push(notify);
  });

  try {
    await delay(75);
    while (true) {
      if (!heldBy && [...contenders].sort()[0] === owner) {
        heldBy = owner;
        channel.postMessage({ type: 'held', owner });
        await delay(75);
        if (heldBy === owner) return await callback();
      }
      await waitForSignal();
    }
  } finally {
    if (heldBy === owner) channel.postMessage({ type: 'release', owner });
    channel.close();
  }
}

function newTabSequence(targetWindow: Window): number {
  try {
    const current = Number(targetWindow.sessionStorage.getItem(TAB_SEQ_KEY)) || 0;
    const next = Math.min(1_000_000_000, Math.max(0, current) + 1);
    targetWindow.sessionStorage.setItem(TAB_SEQ_KEY, String(next));
    return next;
  } catch { return 1; }
}

function bindPreferences(targetWindow: Window, targetDocument: Document, startPageVisit: () => void) {
  const toggle = targetDocument.querySelector<HTMLButtonElement>('[data-site-analytics-toggle]');
  const clear = targetDocument.querySelector<HTMLButtonElement>('[data-site-analytics-clear]');
  const status = targetDocument.querySelector<HTMLElement>('[data-site-analytics-status]');
  if (!toggle) return;

  const update = () => {
    const disabled = optedOut();
    runtimeOptOut = disabled;
    (targetWindow as Window & { __phoxAnalyticsDisabled?: boolean }).__phoxAnalyticsDisabled = disabled;
    toggle.setAttribute('aria-pressed', String(disabled));
    toggle.textContent = disabled ? '啟用匿名量測' : '停用匿名量測';
  };
  update();

  const sendPreference = (preference: 'disabled' | 'enabled' | 'clear') => withIdentityLock(targetWindow, async () => {
    const response = await fetch('/api/analytics/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', keepalive: true,
      body: JSON.stringify({ preference }),
    });
    if (!response.ok) throw new Error('preference_update_failed');
  });

  toggle.addEventListener('click', async () => {
    toggle.disabled = true;
    const disable = !optedOut();
    runtimeOptOut = disable;
    (targetWindow as Window & { __phoxAnalyticsDisabled?: boolean }).__phoxAnalyticsDisabled = disable;
    if (disable) {
      (targetWindow as Window & { __phoxAnalyticsPreferenceResolved?: boolean }).__phoxAnalyticsPreferenceResolved = false;
      targetWindow.dispatchEvent(new Event('phox-site-analytics-disabled'));
    }
    try { if (disable) targetWindow.localStorage.setItem(OPT_OUT_KEY, '1'); else targetWindow.localStorage.removeItem(OPT_OUT_KEY); }
    catch { /* The signed server cookie still records the preference when available. */ }
    update();
    if (status) status.textContent = disable ? '已在此瀏覽器停用匿名量測。' : '已在此瀏覽器啟用匿名量測。';
    try {
      await sendPreference(disable ? 'disabled' : 'enabled');
      if (!disable) {
        markAnalyticsPreferenceResolved(targetWindow);
        startPageVisit();
      }
    } catch {
      if (status) status.textContent = disable
        ? '本機已停用量測；伺服器偏好同步尚未確認。'
        : '本機偏好已更新；伺服器同步尚未確認。';
    } finally { toggle.disabled = false; }
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

export function trackSiteEvent(name: SiteAnalyticsEventName, attributes: AnalyticsAttributes = {}): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<EventDetail>(EVENT_NAME, { detail: { name, ...attributes } }));
}

export function initSiteAnalytics(targetWindow: Window = window, targetDocument: Document = document): boolean {
  if (initialized.has(targetDocument)) return true;
  initialized.add(targetDocument);
  runtimeOptOut = optedOut();
  (targetWindow as Window & { __phoxAnalyticsDisabled?: boolean }).__phoxAnalyticsDisabled = runtimeOptOut;
  const path = publicPath(targetWindow.location.pathname);
  if (!path) return false;

  let queue: AnalyticsEvent[] = [];
  let pendingDetails: EventDetail[] = [];
  let timer = 0;
  let sending = false;
  let bootstrapped = false;
  let landingPending = true;
  let pageVisitId = uuid(targetWindow);
  let tabId = readTabId(targetWindow);
  let documentId = uuid(targetWindow);
  let eventSeq = 0;
  let tabSeq = 0;
  let tabReady = false;
  let activeRequest: AbortController | null = null;
  const visiblePlacements = new Set<string>();
  const firstPageMetadata = landingDetails();

  const newPageVisit = () => {
    pageVisitId = uuid(targetWindow);
    tabSeq = newTabSequence(targetWindow);
    visiblePlacements.clear();
    enqueue({ name: 'page_view' });
  };

  const makeEvent = (detail: EventDetail): AnalyticsEvent | null => {
    const id = uuid(targetWindow);
    if (!id || !pageVisitId || !tabId || !documentId) return null;
    eventSeq = Math.min(10_000, eventSeq + 1);
    const event: AnalyticsEvent = {
      id, name: detail.name, path, clientAt: new Date().toISOString(), schemaVersion: 2,
      pageVisitId, tabId, documentId, eventSeq, tabSeq,
    };
    if (detail.name === 'inquiry_cta_click') {
      event.placement = safePlacement(detail.placement);
      event.destination = destinations.has(detail.destination || '') ? detail.destination : 'other';
    } else if (detail.name === 'cta_view') {
      event.placement = safePlacement(detail.placement);
      event.visiblePercent = Math.max(50, Math.min(100, Math.round(detail.visiblePercent || 50)));
      event.visibleMs = Math.max(1_000, Math.min(60_000, Math.round(detail.visibleMs || 1_000)));
    } else if (detail.name === 'outbound_contact_click') {
      event.destination = destinations.has(detail.destination || '') && detail.destination !== 'internal' ? detail.destination : 'other';
    } else if (detail.name === 'form_submit_error') {
      const codes = new Set(['validation', 'network', 'server', 'rate_limited', 'unknown']);
      event.errorCode = codes.has(detail.errorCode || '') ? detail.errorCode : 'unknown';
      event.formInstanceId = detail.formInstanceId;
    } else if (detail.name === 'form_start' || detail.name === 'form_review' || detail.name === 'form_submit_attempt'
      || detail.name === 'form_step_enter' || detail.name === 'form_step_complete') {
      event.formInstanceId = detail.formInstanceId;
      if (detail.name === 'form_step_enter' || detail.name === 'form_step_complete') event.stepId = detail.stepId;
    }
    return event;
  };

  const enqueueReady = (detail: EventDetail) => {
    if (optedOut()) return;
    const event = makeEvent(detail);
    if (!event) return;
    queue.push(event);
    if (timer) targetWindow.clearTimeout(timer);
    timer = targetWindow.setTimeout(() => { void flush(); }, 120);
  };

  const enqueue = (detail: EventDetail) => {
    if (optedOut()) return;
    if (!tabReady) { pendingDetails.push(detail); return; }
    enqueueReady(detail);
  };

  const ensureBootstrap = async (): Promise<boolean> => {
    if (bootstrapped) return true;
    const response = await fetch('/api/analytics/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', keepalive: true,
      body: JSON.stringify({ bootstrap: true }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.filtered === true) return false;
    bootstrapped = true;
    if (result.optedOut === true) {
      runtimeOptOut = true;
      (targetWindow as Window & { __phoxAnalyticsDisabled?: boolean }).__phoxAnalyticsDisabled = true;
      try { targetWindow.localStorage.setItem(OPT_OUT_KEY, '1'); } catch { /* Keep the server-enforced preference. */ }
      queue = [];
      return false;
    }
    return true;
  };

  const flush = async (attempt = 0): Promise<void> => {
    if (sending || queue.length === 0 || optedOut() || !tabReady) return;
    sending = true;
    const batch = queue.splice(0, 10);
    activeRequest = new AbortController();
    let retryDelay: number | null = null;
    try {
      const responseResult = await withIdentityLock(targetWindow, async () => {
        if (!await ensureBootstrap()) return null;
        const response = await fetch('/api/analytics/events', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', keepalive: true,
          body: JSON.stringify({ events: batch, landing: landingPending ? firstPageMetadata : undefined, device: deviceType() }),
          signal: activeRequest?.signal,
        });
        const result = await response.json().catch(() => ({}));
        return { response, result };
      });
      if (!responseResult) {
        if (!optedOut() && attempt < 2) {
          queue.unshift(...batch);
          retryDelay = attempt === 0 ? 400 : 1_400;
        }
        return;
      }
      const { response, result } = responseResult;
      if (response.ok) landingPending = false;
      if (response.ok && !optedOut() && result.optedOut !== true && result.filtered !== true) markAnalyticsPreferenceResolved(targetWindow);
      if (result.optedOut === true) {
        runtimeOptOut = true;
        (targetWindow as Window & { __phoxAnalyticsDisabled?: boolean }).__phoxAnalyticsDisabled = true;
        try { targetWindow.localStorage.setItem(OPT_OUT_KEY, '1'); } catch { /* Keep the server-enforced preference. */ }
        queue = [];
      } else if (!response.ok && attempt < 2) {
        queue.unshift(...batch);
        retryDelay = attempt === 0 ? 400 : 1_400;
      }
    } catch {
      if (attempt < 2 && !optedOut()) {
        queue.unshift(...batch);
        retryDelay = attempt === 0 ? 400 : 1_400;
      }
    } finally {
      activeRequest = null;
      sending = false;
      if (retryDelay !== null) {
        if (timer) targetWindow.clearTimeout(timer);
        timer = targetWindow.setTimeout(() => {
          timer = 0;
          void flush(attempt + 1);
        }, retryDelay);
      } else if (queue.length && !optedOut()) {
        if (timer) targetWindow.clearTimeout(timer);
        timer = targetWindow.setTimeout(() => {
          timer = 0;
          void flush();
        }, 0);
      }
    }
  };

  bindPreferences(targetWindow, targetDocument, newPageVisit);
  targetWindow.addEventListener('phox-site-analytics-disabled', () => {
    queue = [];
    pendingDetails = [];
    if (timer) targetWindow.clearTimeout(timer);
    activeRequest?.abort();
  });
  targetWindow.addEventListener(EVENT_NAME, ((event: CustomEvent<EventDetail>) => enqueue(event.detail)) as EventListener);

  const ElementConstructor = targetDocument.defaultView?.Element;
  targetDocument.addEventListener('click', (event) => {
    const target = event.target;
    if (!ElementConstructor || !(target instanceof ElementConstructor)) return;
    const link = target.closest<HTMLAnchorElement>('a[href]');
    if (!link) return;
    const destination = destinationFor(link.href);
    if (link.dataset.analyticsEvent === 'inquiry_click') {
      enqueue({ name: 'inquiry_cta_click', placement: safePlacement(link.dataset.analyticsPlacement), destination });
      if (destination !== 'internal' && destination !== 'other') enqueue({ name: 'outbound_contact_click', destination });
    } else if (destination === 'instagram' || destination === 'threads' || destination === 'facebook' || destination === 'email') {
      enqueue({ name: 'outbound_contact_click', destination });
    }
  }, { capture: true });

  if (typeof IntersectionObserver !== 'undefined') {
    const candidates = targetDocument.querySelectorAll<HTMLAnchorElement>('a[data-analytics-event="inquiry_click"][data-analytics-placement]');
    const timers = new WeakMap<Element, number>();
    const visibility = new WeakMap<Element, { ratio: number; startedAt: number }>();
    const ratios = new WeakMap<Element, number>();
    const stopExposureTimer = (element: Element) => {
      const timerId = timers.get(element);
      if (timerId) targetWindow.clearTimeout(timerId);
      timers.delete(element);
      visibility.delete(element);
    };
    const startExposureTimer = (element: Element, ratio: number) => {
      ratios.set(element, ratio);
      if (ratio < 0.5 || targetDocument.visibilityState === 'hidden') {
        stopExposureTimer(element);
        return;
      }
      const current = visibility.get(element);
      if (current) { current.ratio = ratio; return; }
      const state = { ratio, startedAt: targetWindow.performance.now() };
      visibility.set(element, state);
      const timerId = targetWindow.setTimeout(() => {
        const latest = visibility.get(element);
        const placement = safePlacement((element as HTMLElement).dataset.analyticsPlacement);
        if (latest && latest.ratio >= 0.5 && (element as HTMLElement).isConnected
          && targetDocument.visibilityState !== 'hidden' && !visiblePlacements.has(placement)) {
          visiblePlacements.add(placement);
          enqueue({ name: 'cta_view', placement, visiblePercent: Math.floor(latest.ratio * 100), visibleMs: Math.max(1_000, Math.round(targetWindow.performance.now() - latest.startedAt)) });
        }
        timers.delete(element);
      }, 1_000);
      timers.set(element, timerId);
    };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        startExposureTimer(entry.target, entry.intersectionRatio);
      });
    }, { threshold: [0, 0.5, 1] });
    candidates.forEach((link) => observer.observe(link));
    targetDocument.addEventListener('visibilitychange', () => {
      if (targetDocument.visibilityState === 'hidden') {
        candidates.forEach(stopExposureTimer);
        return;
      }
      candidates.forEach((link) => {
        const ratio = ratios.get(link);
        if (ratio !== undefined) startExposureTimer(link, ratio);
        observer.unobserve(link);
        observer.observe(link);
      });
    });
    targetWindow.addEventListener('pageshow', (event) => {
      if (!(event as PageTransitionEvent).persisted || targetDocument.visibilityState === 'hidden') return;
      candidates.forEach((link) => {
        const ratio = ratios.get(link);
        if (ratio !== undefined) startExposureTimer(link, ratio);
        observer.unobserve(link);
        observer.observe(link);
      });
    });
  }

  targetDocument.addEventListener('visibilitychange', () => {
    if (targetDocument.visibilityState === 'hidden') void flush();
  });
  targetWindow.addEventListener('pagehide', () => { void flush(); });
  targetWindow.addEventListener('pageshow', (event) => {
    if ((event as PageTransitionEvent).persisted && !optedOut()) newPageVisit();
  });

  void resolveTabId(targetWindow, tabId).then((resolvedTabId) => {
    if (resolvedTabId) tabId = resolvedTabId;
    tabReady = true;
    newPageVisit();
    pendingDetails.splice(0).forEach(enqueueReady);
  });
  return true;
}
