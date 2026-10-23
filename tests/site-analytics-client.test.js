import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

test('停用會丟棄尚未送出的事件，重新啟用會重新確認偏好且不補送舊事件', async (context) => {
  const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
  context.after(() => Object.assign(globalThis, previous));
  class Element extends EventTarget {
    dataset = {};
    textContent = '';
    disabled = false;
    setAttribute() {}
  }
  const toggle = new Element();
  const status = new Element();
  const storage = new Map();
  const timers = new Map();
  const requests = [];
  let timerId = 0;
  const window = new EventTarget();
  Object.assign(window, {
    Element,
    navigator: { locks: { request: (_name, callback) => callback() } },
    location: { pathname: '/', search: '', origin: 'https://phox999.com', href: 'https://phox999.com/' },
    crypto: { randomUUID },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    setTimeout: (callback) => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    matchMedia: () => ({ matches: false }),
  });
  const document = new EventTarget();
  Object.assign(document, {
    referrer: '', defaultView: window,
    querySelector: (selector) => selector === '[data-site-analytics-toggle]' ? toggle : selector === '[data-site-analytics-status]' ? status : null,
  });
  window.document = document;
  Object.assign(globalThis, { window, document, fetch: async (url, options) => {
    requests.push(JSON.parse(options.body));
    return new Response('{}', { status: 202 });
  } });
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const drain = async () => {
    for (let cycle = 0; cycle < 8 && timers.size; cycle += 1) {
      const callbacks = [...timers.values()]; timers.clear();
      callbacks.forEach((callback) => callback());
      await settle();
    }
  };
  const { initSiteAnalytics, trackSiteEvent } = await import('../src/lib/site-analytics.ts');
  let enabled = 0;
  window.addEventListener('phox-site-analytics-enabled', () => { enabled += 1; });
  initSiteAnalytics(window, document);
  await drain();
  assert.equal(enabled, 1);
  trackSiteEvent('form_review');
  toggle.dispatchEvent(new Event('click'));
  await settle();
  assert.equal(window.__phoxAnalyticsDisabled, true);
  assert.equal(window.__phoxAnalyticsPreferenceResolved, false);
  await drain();
  toggle.dispatchEvent(new Event('click'));
  await settle();
  await drain();
  assert.equal(enabled, 2, 're-enabling publishes a fresh confirmed preference');
  assert.equal(window.__phoxAnalyticsDisabled, false);
  assert.equal(requests.flatMap((request) => request.events || []).filter((event) => event.name === 'form_review').length, 0);
  assert.equal(requests.flatMap((request) => request.events || []).filter((event) => event.name === 'page_view').length, 2);
  assert.deepEqual(requests.filter((request) => request.preference).map((request) => request.preference), ['disabled', 'enabled']);
  assert.equal(toggle.disabled, false);
});
