import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { BroadcastChannel as NativeBroadcastChannel } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { initSiteAnalytics } from '../src/lib/site-analytics.ts';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(predicate, message, timeout = 3_000) {
  const deadline = performance.now() + timeout;
  while (!predicate() && performance.now() < deadline) await pause(10);
  assert.ok(predicate(), message);
}

function browserFixture(t, { exposure = false, serverDisabled = false } = {}) {
  const original = Object.fromEntries(['window', 'document', 'fetch', 'BroadcastChannel', 'IntersectionObserver'].map((key) => [key, globalThis[key]]));
  const timers = new Set();
  const local = new Map();
  const requests = [];
  const observers = [];
  let lockTail = Promise.resolve();
  const locks = { request: async (_key, callback) => {
    const previous = lockTail;
    let release;
    lockTail = new Promise((resolve) => { release = resolve; });
    await previous;
    try { return await callback(); } finally { release(); }
  } };
  class Element extends EventTarget {
    dataset = {};
    textContent = '';
    disabled = false;
    isConnected = true;
    setAttribute() {}
    closest() { return null; }
  }
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    unobserve() {}
  }
  const storage = (map) => ({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  });
  globalThis.BroadcastChannel = NativeBroadcastChannel;
  globalThis.IntersectionObserver = exposure ? Observer : undefined;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    if (body.preference === 'enabled') serverDisabled = false;
    if (body.preference === 'disabled') serverDisabled = true;
    return new Response(JSON.stringify(body.bootstrap ? { ready: true, optedOut: serverDisabled } : { accepted: body.events?.length || 0 }), { status: 202 });
  };
  t.after(async () => {
    for (const timer of timers) clearTimeout(timer);
    await pause(0);
    Object.assign(globalThis, original);
  });
  function page(seed = new Map()) {
    const session = new Map(seed);
    const window = new EventTarget();
    Object.assign(window, {
      location: { pathname: '/', search: '', origin: 'https://fixture.invalid', href: 'https://fixture.invalid/' },
      crypto: { randomUUID }, navigator: { locks }, performance,
      localStorage: storage(local), sessionStorage: storage(session),
      setTimeout: (callback, delay) => {
        const handle = setTimeout(() => { timers.delete(handle); callback(); }, delay);
        timers.add(handle);
        return handle;
      },
      clearTimeout: (handle) => { timers.delete(handle); clearTimeout(handle); },
      matchMedia: () => ({ matches: false }),
    });
    const toggle = new Element();
    const status = new Element();
    const cta = new Element();
    cta.dataset.analyticsPlacement = 'hero';
    const document = new EventTarget();
    Object.assign(document, {
      referrer: '', visibilityState: 'visible', defaultView: { Element },
      querySelector: (selector) => selector === '[data-site-analytics-toggle]' ? toggle : selector === '[data-site-analytics-status]' ? status : null,
      querySelectorAll: () => exposure ? [cta] : [],
    });
    window.document = document;
    return { window, document, toggle, cta, session };
  }
  function start(page) {
    globalThis.window = page.window;
    globalThis.document = page.document;
    initSiteAnalytics(page.window, page.document);
  }
  return {
    page, start, requests, observers, local,
    events: () => requests.flatMap((request) => request.events || []),
  };
}

test('late copied tabs split tab IDs while a same-tab page navigation keeps its ID', async (context) => {
  const fixture = browserFixture(context);
  const original = fixture.page();
  fixture.start(original);
  await until(() => fixture.events().some((event) => event.name === 'page_view'), 'first page view recorded');
  const originalView = fixture.events().find((event) => event.name === 'page_view');

  const duplicate = fixture.page(original.session);
  fixture.start(duplicate);
  await until(() => fixture.events().filter((event) => event.name === 'page_view').length === 2, 'late duplicate page view recorded');
  const views = fixture.events().filter((event) => event.name === 'page_view');
  assert.notEqual(views[0].tabId, views[1].tabId, 'a copied tab gets an independent tab ID after the first document is already active');

  original.window.dispatchEvent(new Event('pagehide'));
  const nextDocument = fixture.page(original.session);
  fixture.start(nextDocument);
  await until(() => fixture.events().filter((event) => event.name === 'page_view').length === 3, 'same-tab navigation page view recorded');
  const latest = fixture.events().filter((event) => event.name === 'page_view')[2];
  assert.equal(latest.tabId, originalView.tabId, 'the outgoing document hands its tab identity to the next document');
  assert.notEqual(latest.pageVisitId, originalView.pageVisitId);
});

test('server opt-out bootstrap releases the sender so re-enabling can send a fresh page view', async (context) => {
  const fixture = browserFixture(context, { serverDisabled: true });
  const page = fixture.page();
  fixture.start(page);
  await until(() => fixture.local.get('phox999.analytics-disabled.v1') === '1', 'server opt-out is synchronized');
  page.toggle.dispatchEvent(new Event('click'));
  await until(() => fixture.requests.some((request) => request.preference === 'enabled'), 'enable preference is confirmed');
  await until(() => fixture.events().filter((event) => event.name === 'page_view').length === 1, 'fresh page view is sent after enabling');
  assert.equal(page.window.__phoxAnalyticsDisabled, false);
});

test('CTA exposure timing restarts for a still-visible placement after returning to the page', async (context) => {
  const fixture = browserFixture(context, { exposure: true });
  const page = fixture.page();
  fixture.start(page);
  await until(() => fixture.events().some((event) => event.name === 'page_view'), 'page view recorded');
  fixture.observers[0].callback([{ target: page.cta, intersectionRatio: 0.75 }]);
  await pause(25);
  page.document.visibilityState = 'hidden';
  page.document.dispatchEvent(new Event('visibilitychange'));
  page.document.visibilityState = 'visible';
  page.document.dispatchEvent(new Event('visibilitychange'));
  await until(() => fixture.events().some((event) => event.name === 'cta_view'), 'one fresh visible second is counted after returning');
});

test('different next-page rows build distinct target-aware session drilldowns', () => {
  const source = readFileSync(new URL('../src/pages/admin/analytics.astro', import.meta.url), 'utf8');
  const renderSource = source.slice(source.indexOf('  function renderPaths('), source.indexOf('  async function loadPaths('));
  const querySource = source.slice(source.indexOf('  function buildJourneyParams('), source.indexOf('  function activePanel('));
  const clickSource = source.slice(source.indexOf('  const drillToSessions ='), source.indexOf("  $('[data-path-rows]').addEventListener('click', drillToSessions);"));
  class Element {
    children = [];
    dataset = {};
    textContent = '';
    attributes = {};
    title = '';
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(key, value) { this.attributes[key] = value; }
    insertRow() { const row = new Element(); this.children.push(row); return row; }
    insertCell() { const cell = new Element(); this.children.push(cell); return cell; }
    closest(selector) {
      if (selector === '[data-page-drill]') return this.dataset.pageDrill ? this : null;
      if (selector === '[data-transition-from][data-transition-to]') return this.dataset.transitionFrom && this.dataset.transitionTo ? this : null;
      return null;
    }
  }
  const hosts = Object.fromEntries(['data-path-rows', 'data-analytics-page-options', 'data-transition-rows', 'data-paths-status'].map((key) => [`[${key}]`, new Element()]));
  const captured = [];
  const sandbox = {
    Element, URLSearchParams, transitionDrill: null,
    document: { createElement: () => new Element() }, $: (selector) => hosts[selector],
    textElement: (_tag, text) => Object.assign(new Element(), { textContent: text }),
    count: String, percent: String, pageLabel: (path) => path,
    filterInputs: Object.fromEntries(['source', 'device', 'page', 'result', 'visitor'].map((key) => [key, { value: '' }])),
    buildRangeParams: () => new URLSearchParams({ range: 'today' }), sessionNextCursor: null,
    renderFilterChips() {},
  };
  sandbox.selectPanel = () => { captured.push(sandbox.buildJourneyParams().toString()); };
  vm.createContext(sandbox);
  vm.runInContext(stripTypeScriptTypes(renderSource + querySource + clickSource + '\nglobalThis.drillToSessions = drillToSessions;'), sandbox);
  sandbox.renderPaths({ pages: [], legacyUnpairedClicks: 0, transitions: [
    { from: '/portfolio/', to: '/apply/', sessions: 1, visits: 2 },
    { from: '/portfolio/', to: '/about/', sessions: 1, visits: 1 },
  ] });
  const buttons = hosts['[data-transition-rows]'].children.map((row) => row.children[3].children[0]);
  buttons.forEach((button) => sandbox.drillToSessions({ target: button }));
  assert.equal(captured.length, 2);
  assert.notEqual(captured[0], captured[1]);
  assert.match(captured[0], /transition_from=%2Fportfolio%2F/);
  assert.match(captured[0], /transition_to=%2Fapply%2F/);
  assert.match(captured[1], /transition_to=%2Fabout%2F/);
  assert.match(captured[0], /page=%2Fapply%2F/);
});

test('journey migration uses valid inquiry attribution fields and emits distinct transition sessions', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20261018003946_site_analytics_journeys.sql', import.meta.url), 'utf8');
  assert.match(migration, /select distinct i\.id, a\.session_id/i);
  assert.doesNotMatch(migration, /\bi\.session_id\b/i);
  assert.match(migration, /greatest\(v_inquiries - v_matched_inquiries, 0\)/i);
  assert.doesNotMatch(migration, /pg_catalog\.greatest/i);
  assert.match(migration, /count\(distinct a\.session_id\)::bigint as sessions/i);
});
