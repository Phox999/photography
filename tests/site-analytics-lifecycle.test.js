import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

async function waitFor(predicate, message, timeout = 2_000) {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(predicate(), message);
}

test('first loads in parallel, copied-tab isolation, reload and BFCache keep v2 visit identities separate', async (context) => {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    fetch: globalThis.fetch,
    BroadcastChannel: globalThis.BroadcastChannel,
  };
  context.after(() => Object.assign(globalThis, previous));
  globalThis.BroadcastChannel = undefined;

  const storage = new Map();
  let lockTail = Promise.resolve();
  const locks = {
    request: async (_name, callback) => {
      const previousLock = lockTail;
      let release;
      lockTail = new Promise((resolve) => { release = resolve; });
      await previousLock;
      try { return await callback(); }
      finally { release(); }
    },
  };
  const requests = [];
  let activeRequests = 0;
  let maxConcurrentRequests = 0;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    activeRequests += 1;
    maxConcurrentRequests = Math.max(maxConcurrentRequests, activeRequests);
    await new Promise((resolve) => setTimeout(resolve, 1));
    activeRequests -= 1;
    return new Response(JSON.stringify({ accepted: body.events?.length || 0 }), { status: 202 });
  };

  class Element extends EventTarget {}
  const makeDocument = () => {
    const document = new EventTarget();
    Object.assign(document, {
      defaultView: { Element },
      referrer: '',
      visibilityState: 'visible',
      querySelector: () => null,
      querySelectorAll: () => [],
    });
    return document;
  };
  const makeWindow = () => {
    const window = new EventTarget();
    Object.assign(window, {
      location: { pathname: '/', search: '', origin: 'https://phox999.com', href: 'https://phox999.com/' },
      crypto: { randomUUID },
      navigator: { locks },
      localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
      sessionStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
      setTimeout: (callback) => setTimeout(callback, 0),
      clearTimeout,
      matchMedia: () => ({ matches: false }),
    });
    return window;
  };
  const initialize = (window, document) => {
    globalThis.window = window;
    globalThis.document = document;
    return initSiteAnalytics(window, document);
  };

  const { initSiteAnalytics } = await import('../src/lib/site-analytics.ts');
  const firstTab = makeWindow();
  const firstDocument = makeDocument();
  const copiedTab = makeWindow();
  const copiedDocument = makeDocument();
  assert.equal(initialize(firstTab, firstDocument), true);
  assert.equal(initialize(copiedTab, copiedDocument), true);

  await waitFor(() => requests.filter((request) => request.bootstrap === true).length === 2,
    'both parallel documents finish their bootstrap');
  const bootstrapRequests = requests.filter((request) => request.bootstrap === true);
  assert.equal(bootstrapRequests.length, 2, 'each document bootstraps before sending its first event batch');
  assert.ok(bootstrapRequests.every((request) => Object.keys(request).length === 1), 'bootstrap does not accept browser-supplied identity');
  assert.equal(maxConcurrentRequests, 1, 'the first bootstrap and event batches share the cross-tab Web Lock');

  const initialViews = requests.flatMap((request) => request.events || []).filter((event) => event.name === 'page_view');
  assert.equal(initialViews.length, 2);
  assert.notEqual(initialViews[0].pageVisitId, initialViews[1].pageVisitId, 'parallel tabs get distinct page visits');
  assert.notEqual(initialViews[0].tabId, initialViews[1].tabId, 'without a tab channel, each document gets a distinct tab ID');
  assert.notEqual(initialViews[0].documentId, initialViews[1].documentId);
  assert.ok(initialViews.every((event) => event.schemaVersion === 2 && event.eventSeq === 1));
  assert.ok(requests.every((request) => !Object.hasOwn(request, 'visitorId') && !Object.hasOwn(request, 'sessionId')));

  const pageshow = new Event('pageshow');
  Object.defineProperty(pageshow, 'persisted', { value: true });
  firstTab.dispatchEvent(pageshow);
  await waitFor(() => requests.flatMap((request) => request.events || []).filter((event) => event.name === 'page_view').length === 3,
    'BFCache restoration records its new page visit');

  const reloadTab = makeWindow();
  const reloadDocument = makeDocument();
  initialize(reloadTab, reloadDocument);
  await waitFor(() => requests.flatMap((request) => request.events || []).filter((event) => event.name === 'page_view').length === 4,
    'reload records its new page visit');

  const allViews = requests.flatMap((request) => request.events || []).filter((event) => event.name === 'page_view');
  assert.equal(allViews.length, 4, 'BFCache restoration and a new document each record a page view');
  assert.equal(new Set(allViews.map((event) => event.pageVisitId)).size, 4, 'every load and BFCache restoration gets a fresh page visit');
  assert.equal(allViews[0].documentId, allViews[2].documentId, 'BFCache restoration retains its document identity');
  assert.equal(allViews[0].tabId, allViews[2].tabId, 'BFCache restoration retains its tab identity');
  assert.notEqual(allViews[0].tabSeq, allViews[2].tabSeq, 'BFCache restoration advances the tab sequence');
  assert.notEqual(allViews[3].documentId, allViews[0].documentId, 'reload uses a new document identity');
});
