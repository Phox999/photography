import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

let source = await fs.readFile(new URL('../src/scripts/site-motion.js', import.meta.url), 'utf8');
source = source.replace(/^import .*;\r?\n/gm, '').replaceAll('export function', 'function');
source = source.slice(0, source.indexOf('if (import.meta.hot)'));

function fixture() {
  const window = new EventTarget();
  const document = new EventTarget();
  const media = new EventTarget(); media.matches = false;
  const observers = [];
  let disconnects = 0;
  const classes = new Set();
  const card = { hidden: false, isConnected: true,
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
    getBoundingClientRect: () => ({ width: 200, height: 200, top: 1000, bottom: 1200, left: 0, right: 200 }),
  };
  document.documentElement = { style: { setProperty() {}, removeProperty() {} }, toggleAttribute() {}, removeAttribute() {} };
  document.querySelector = () => null;
  document.querySelectorAll = selector => selector.startsWith('img') ? [] : [card];
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {} unobserve() {} disconnect() { disconnects++; }
  }
  const context = vm.createContext({ window, document, matchMedia: () => media, IntersectionObserver: Observer,
    performance: { getEntriesByType: () => [{ type: 'navigate' }] }, innerWidth: 1440, innerHeight: 900,
    AbortController, motionSettings: { reveal: true, pageTransition: true },
  });
  vm.runInContext(`${source}; this.init = initSiteMotion; this.cleanup = cleanupSiteMotion;`, context);
  return { init: context.init, cleanup: context.cleanup, window, document, media, observers, classes, disconnects: () => disconnects };
}

test('repeated init shares one observer; cleanup restores every pending element', () => {
  const f = fixture();
  assert.equal(f.init(), f.init());
  assert.equal(f.observers.length, 1);
  assert.equal(f.classes.has('motion-pending'), true);
  f.cleanup();
  assert.equal(f.classes.size, 0);
  assert.equal(f.disconnects(), 1);
});

test('live reduced-motion change reveals all pending content immediately', () => {
  const f = fixture(); f.init();
  f.media.matches = true; f.media.dispatchEvent(new Event('change'));
  assert.equal(f.classes.size, 0);
  f.cleanup();
});

test('BFCache restoration restarts once and never hides an already shown node', () => {
  const f = fixture(); f.init();
  f.window.dispatchEvent(new Event('pagehide'));
  const event = new Event('pageshow'); Object.defineProperty(event, 'persisted', { value: true });
  f.window.dispatchEvent(event); f.window.dispatchEvent(event);
  assert.equal(f.observers.length, 2);
  assert.equal(f.classes.size, 0);
  f.cleanup();
});
