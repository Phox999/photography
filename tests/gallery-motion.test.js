import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';

const source = (await fs.readFile(new URL('../src/scripts/gallery-motion.js', import.meta.url), 'utf8')).replace('export function', 'function');

function fixture() {
  let focused;
  const requests = [];
  class Element {
    constructor() {
      this.listeners = {}; this.attributes = {}; this.dataset = {}; this.isConnected = true;
      this.style = { removeProperty() {} }; this.classList = { add() {}, remove() {} };
    }
    addEventListener(name, fn, options) {
      (this.listeners[name] ||= []).push(fn);
      options?.signal?.addEventListener('abort', () => { this.listeners[name] = this.listeners[name].filter(item => item !== fn); });
    }
    emit(name, event = {}) { for (const fn of this.listeners[name] || []) fn({ target: this, ...event }); }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    removeAttribute(name) { delete this.attributes[name]; }
    toggleAttribute(name, enabled) { if (enabled) this.setAttribute(name, ''); else this.removeAttribute(name); }
    focus() { focused = this; }
    getBoundingClientRect() { return { width: 0, height: 0 }; }
  }
  const gallery = new Element(); const dialog = new Element();
  const image = new Element(); const count = new Element(); const close = new Element();
  const prev = new Element(); const next = new Element(); const inner = new Element();
  const root = new Element();
  const triggers = [0, 1, 2].map(index => {
    const trigger = new Element(); const thumbnail = new Element();
    thumbnail.src = `/thumb-${index}.jpg`; thumbnail.currentSrc = thumbnail.src;
    thumbnail.complete = true; thumbnail.naturalWidth = 100; thumbnail.alt = `photo ${index}`;
    trigger.dataset.fullSrc = `/full-${index}.jpg`;
    trigger.querySelector = () => thumbnail;
    trigger.closest = () => trigger;
    return trigger;
  });
  gallery.querySelectorAll = () => triggers;
  dialog.querySelector = selector => ({ '[data-lightbox-image]': image, '[data-lightbox-count]': count,
    '[data-lightbox-close]': close, '[data-lightbox-prev]': prev, '[data-lightbox-next]': next,
    '.portfolio-lightbox__inner': inner })[selector];
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; dialog.emit('close'); };
  class Image {
    constructor() { requests.push(this); }
    decode() { return new Promise((resolve, reject) => { this.resolve = () => { this.naturalWidth = 100; resolve(); }; this.reject = reject; }); }
    removeAttribute() {}
  }
  const context = vm.createContext({ window: new EventTarget(), document: { documentElement: root, createElement: () => new Element() },
    Element, Image, AbortController, matchMedia: () => ({ matches: false }) });
  vm.runInContext(`${source}; this.setup = setupGalleryMotion`, context);
  const motion = { settings: { galleryTransition: true }, reduced: () => true, cancel() {}, animate() {}, onPreferenceChange: () => () => {} };
  const dispose = context.setup(gallery, dialog, motion);
  return { gallery, dialog, image, count, close, next, triggers, requests, dispose, focus: () => focused };
}

test('rapid next/previous keeps only the latest decode and preserves accessible count', async () => {
  const f = fixture();
  f.gallery.emit('click', { target: f.triggers[0] });
  assert.equal(f.dialog.open, true);
  assert.equal(f.focus(), f.close);
  f.next.emit('click'); f.next.emit('click');
  f.requests[2].resolve(); await new Promise(setImmediate);
  assert.equal(f.image.src, '/full-2.jpg');
  assert.equal(f.count.textContent, '3 / 3');
  f.requests[0].resolve(); f.requests[1].resolve(); await new Promise(setImmediate);
  assert.equal(f.image.src, '/full-2.jpg');
  f.dispose();
});

test('close during decode restores the source focus and cannot paint a closed dialog', async () => {
  const f = fixture();
  f.gallery.emit('click', { target: f.triggers[1] });
  f.close.emit('click');
  assert.equal(f.dialog.open, false);
  assert.equal(f.focus(), f.triggers[1]);
  f.image.src = 'closed';
  f.requests[0].resolve(); await new Promise(setImmediate);
  assert.equal(f.image.src, 'closed');
  f.dispose();
});

test('a failed full-size image keeps a usable thumbnail and reports a retryable state', async () => {
  const f = fixture();
  f.gallery.emit('click', { target: f.triggers[0] });
  f.requests[0].reject(new Error('network')); await new Promise(setImmediate);
  assert.equal(f.image.src, '/thumb-0.jpg');
  assert.match(f.count.textContent, /原圖暫時無法載入/);
  f.next.emit('click'); f.requests[1].resolve(); await new Promise(setImmediate);
  assert.equal(f.image.src, '/full-1.jpg');
  f.dispose();
});

test('dispose removes handlers so reinitialization cannot open the old dialog', () => {
  const f = fixture(); f.dispose();
  f.gallery.emit('click', { target: f.triggers[0] });
  assert.equal(f.dialog.open, undefined);
  assert.equal(f.requests.length, 0);
});
