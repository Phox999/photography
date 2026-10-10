import assert from 'node:assert/strict';
import test from 'node:test';
import { initInquiryAnalytics } from '../src/lib/inquiry-analytics.ts';

function analyticsFixture(pathname = '/', existingTag = false) {
  const events = [];
  const scripts = [];
  const listeners = new Map();
  class FakeElement {
    constructor(link) { this.link = link; }
    closest(selector) { return selector === 'a[data-analytics-event="inquiry_click"]' ? this.link : null; }
  }
  const document = {
    defaultView: { Element: FakeElement },
    head: { append(script) { scripts.push(script); } },
    querySelector(selector) { return existingTag && selector.includes('data-ga4-loader') ? {} : null; },
    createElement(tag) { return { tag, dataset: {} }; },
    addEventListener(type, handler, options) { listeners.set(type, { handler, options }); },
  };
  const window = { location: { origin: 'https://phox999.com', pathname, search: '?private=secret', hash: '#form' }, dataLayer: events };
  return { document, window, events, scripts, listeners, FakeElement };
}

test('no measurement ID keeps analytics disabled and adds no script or click listener', () => {
  const fixture = analyticsFixture();
  assert.equal(initInquiryAnalytics(undefined, fixture.window, fixture.document), false);
  assert.equal(fixture.scripts.length, 0);
  assert.equal(fixture.listeners.size, 0);
});

test('one public inquiry click queues one sanitized event and keeps default navigation', () => {
  const fixture = analyticsFixture('/journal/what-is-tfp/');
  assert.equal(initInquiryAnalytics('G-ABC123', fixture.window, fixture.document), true);
  assert.equal(fixture.scripts.length, 1);
  assert.equal(fixture.scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-ABC123');
  assert.deepEqual(fixture.listeners.get('click').options, { capture: true });
  const config = fixture.events.find((call) => call[0] === 'config');
  assert.deepEqual(config[2], {
    send_page_view: false,
    page_location: 'https://phox999.com/journal/what-is-tfp/',
    page_referrer: '',
  });
  const link = { dataset: { analyticsPlacement: 'journal-body' }, href: 'https://forms.gle/example', target: '_blank' };
  const click = { target: new fixture.FakeElement(link), defaultPrevented: false };
  fixture.listeners.get('click').handler(click);
  const eventCalls = fixture.events.filter((call) => call[0] === 'event');
  assert.equal(eventCalls.length, 1);
  assert.deepEqual(eventCalls[0], ['event', 'inquiry_click', { placement: 'journal-body', page_path: '/journal/what-is-tfp/' }]);
  assert.equal(click.defaultPrevented, false);
  assert.equal(link.target, '_blank');
  fixture.listeners.get('click').handler({
    target: new fixture.FakeElement({ dataset: { analyticsPlacement: 'hero' }, href: 'https://forms.gle/example' }),
    defaultPrevented: false,
    detail: 0,
  });
  assert.equal(fixture.events.filter((call) => call[0] === 'event').length, 2, 'keyboard activation is measured once');
  assert.equal(initInquiryAnalytics('G-ABC123', fixture.window, fixture.document), true);
  assert.equal(fixture.listeners.size, 1);
});

test('private routes do not load a provider or send page data', () => {
  for (const pathname of ['/admin/feedback/', '/client/delivery/', '/cooperation-status/secret']) {
    const fixture = analyticsFixture(pathname);
    assert.equal(initInquiryAnalytics('G-ABC123', fixture.window, fixture.document), false);
    assert.equal(fixture.scripts.length, 0);
    assert.equal(fixture.listeners.size, 0);
  }
});
