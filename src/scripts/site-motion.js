import { motionSettings } from '../lib/motion-settings.js';
import { setupHeroMotion } from './hero-motion.js';
import { setupGalleryMotion } from './gallery-motion.js';

let active;
let lifecycle;
const seen = new WeakSet();
const revealSelector = '.home-page #portfolio .section-heading, .home-page .plan-card, .home-page #feedback > .section-heading, .home-page #feedback .feedback-layout, .home-page #dates .section-heading, .home-page #faq .section-heading, [data-portfolio-card], [data-archive-card]';

export function refreshMotion(root = document) { active?.register(root); }
export function animatePortfolioFilter(root) { active?.filter(root); }

export function cleanupSiteMotion() { active?.dispose(); active = undefined; }

export function initSiteMotion() {
  if (active) return active;
  const abort = new AbortController();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const pending = new Set();
  const images = new WeakSet();
  const animations = new Map();
  const subscribers = new Set();
  const disposers = [];
  const root = document.documentElement;
  const restored = performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
  const cancel = (element) => {
    const animation = animations.get(element);
    animations.delete(element);
    animation?.cancel();
  };
  const animate = (element, frames, options = {}) => {
    if (!element || reduced.matches || typeof element.animate !== 'function') return;
    cancel(element);
    const animation = element.animate(frames, { easing: 'cubic-bezier(0.22, 1, 0.36, 1)', ...options });
    animations.set(element, animation);
    const finish = () => { if (animations.get(element) === animation) { animations.delete(element); animation.cancel(); } };
    animation.finished.then(finish, finish);
    return animation;
  };
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    return !element.hidden && rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0
      && rect.left < innerWidth && rect.right > 0;
  };
  const show = (element) => {
    element.classList.remove('motion-pending');
    pending.delete(element);
    observer?.unobserve(element);
    seen.add(element);
  };
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    let stagger = 0;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const element = entry.target;
      show(element);
      if (reduced.matches || document.hidden) continue;
      const mobile = matchMedia('(max-width: 620px)').matches;
      animate(element, [{ opacity: 0, transform: `translateY(${mobile ? 12 : 20}px)` }, { opacity: 1, transform: 'none' }],
        { duration: mobile ? 400 : 560, delay: Math.min(stagger++ * (mobile ? 40 : 60), 180), fill: 'backwards' });
    }
  }, { rootMargin: '0px 0px -40px 0px', threshold: 0 }) : null;
  const register = (subtree) => {
    // Disconnected API cards must not stay retained by an observer or animation.
    for (const element of pending) if (!element.isConnected) show(element);
    for (const [element] of animations) if (!element.isConnected) cancel(element);
    for (const element of subtree.querySelectorAll(revealSelector)) {
      if (seen.has(element) || pending.has(element) || element.hidden) continue;
      if (!motionSettings.reveal || reduced.matches || restored || visible(element) || element.getBoundingClientRect().bottom < 0) {
        seen.add(element);
      } else if (observer) {
        // Register successfully before hiding; the no-JS / failed-init default is visible.
        observer.observe(element);
        pending.add(element);
        element.classList.add('motion-pending');
      }
    }
    for (const image of subtree.querySelectorAll('img[loading="lazy"]')) {
      if (images.has(image) || image.closest('[data-hero-carousel]') || image.complete || visible(image)) continue;
      images.add(image);
      image.addEventListener('load', () => animate(image, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 }), { once: true, signal: abort.signal });
      // Never hide a loading image: native error state and alt text remain available.
    }
  };
  const filter = (subtree) => {
    register(subtree);
    for (const element of subtree.querySelectorAll('[data-portfolio-card], [data-archive-card]')) {
      cancel(element);
      if (visible(element)) { show(element); animate(element, [{ opacity: .65 }, { opacity: 1 }], { duration: 150 }); }
    }
  };
  const updateHeader = () => {
    const header = document.querySelector('.site-header');
    if (header) root.style.setProperty('--motion-anchor-offset', `${header.offsetHeight + (parseFloat(getComputedStyle(header).top) || 0) + 16}px`);
  };
  const header = document.querySelector('.site-header');
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(updateHeader) : null;
  if (header) resize?.observe(header);
  updateHeader();
  window.addEventListener('resize', updateHeader, { passive: true, signal: abort.signal });
  const onChange = () => {
    if (reduced.matches) {
      for (const element of [...pending]) show(element);
      for (const [element] of animations) cancel(element);
    }
    for (const callback of subscribers) callback();
  };
  reduced.addEventListener('change', onChange, { signal: abort.signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      for (const element of [...pending]) show(element);
      for (const [element] of animations) cancel(element);
    }
  }, { signal: abort.signal });
  document.addEventListener('focusin', event => {
    for (const element of pending) if (element.contains(event.target)) show(element);
  }, { signal: abort.signal });
  // Browser-native same-origin navigation only: no interception or SPA lifecycle.
  const pageTransition = event => {
    if (!motionSettings.pageTransition || reduced.matches) event.viewTransition?.skipTransition();
  };
  window.addEventListener('pageswap', pageTransition, { signal: abort.signal });
  window.addEventListener('pagereveal', pageTransition, { signal: abort.signal });
  root.toggleAttribute('data-page-motion', motionSettings.pageTransition);
  const motion = {
    settings: motionSettings, restored, reduced: () => reduced.matches, animate, cancel,
    onPreferenceChange(callback) { subscribers.add(callback); return () => subscribers.delete(callback); },
  };
  const runtime = {
    register, filter,
    dispose() {
      for (const dispose of disposers) dispose();
      observer?.disconnect(); resize?.disconnect(); abort.abort();
      for (const element of [...pending]) show(element);
      for (const [element] of animations) cancel(element);
      root.style.removeProperty('--motion-anchor-offset');
      root.removeAttribute('data-page-motion');
      subscribers.clear();
    },
  };
  // Publish only after all shared primitives are ready; repeated initialization is a no-op.
  active = runtime;
  try {
    register(document);
    const hero = document.querySelector('[data-hero-carousel]');
    if (hero) disposers.push(setupHeroMotion(hero, motion));
    const dialog = document.querySelector('[data-lightbox-dialog]');
    const gallery = document.querySelector('[data-justified-gallery], [data-portfolio-detail-images]');
    if (dialog && gallery) disposers.push(setupGalleryMotion(gallery, dialog, motion));
  } catch (error) {
    cleanupSiteMotion();
    throw error;
  }
  if (!lifecycle) {
    lifecycle = new AbortController();
    window.addEventListener('pagehide', cleanupSiteMotion, { signal: lifecycle.signal });
    window.addEventListener('pageshow', event => { if (event.persisted) initSiteMotion(); }, { signal: lifecycle.signal });
  }
  return runtime;
}

if (import.meta.hot) import.meta.hot.dispose(() => {
  cleanupSiteMotion(); lifecycle?.abort(); lifecycle = undefined;
});
