import { loadPublicSiteContent } from '../lib/site-content';
import { canReuseStaticHeroImage, heroImageSources, loadHeroImageWithFallback } from '../lib/hero-images';
import { createCarouselClock } from '../lib/carousel-clock.js';

export function setupHeroMotion(hero, motion) {
  const media = hero.querySelector('.hero__media');
  const title = hero.querySelector('[data-hero-title]');
  const copy = hero.querySelector('[data-hero-copy]');
  const control = hero.querySelector('[data-hero-toggle]');
  if (!media || !control) return () => {};
  const abort = new AbortController();
  let current = media.querySelector('[data-hero-image]');
  let sources = [];
  let index = 0;
  let userPaused = hero.dataset.heroPaused === 'true';
  let onScreen = hero.getBoundingClientRect().bottom > 0;
  let disposed = false;
  let contentGeneration = 0;
  const initialImage = current;
  const recoverInitial = () => { if (initialImage) void loadHeroImageWithFallback(initialImage); };
  initialImage?.addEventListener('error', recoverInitial, { once: true, signal: abort.signal });
  if (initialImage?.complete && !initialImage.naturalWidth) recoverInitial();
  const failed = new Set();
  const inView = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync(); }) : null;
  let finishFade;
  let fadeTimer;
  const settleFade = () => {
    clearTimeout(fadeTimer);
    finishFade?.();
    finishFade = undefined;
    for (const image of media.querySelectorAll('[data-hero-image]')) {
      if (image !== current) image.remove();
    }
  };
  const makeImage = (url) => {
    const image = document.createElement('img');
    image.className = 'hero__image';
    image.dataset.heroImage = '';
    image.dataset.originalSrc = url;
    image.alt = '';
    image.decoding = 'async';
    const dimensions = heroImageSources(url);
    if (dimensions.width && dimensions.height) {
      image.width = dimensions.width;
      image.height = dimensions.height;
    }
    return image;
  };
  const show = async (image) => {
    settleFade();
    const previous = current;
    media.append(image);
    // Commit the starting opacity before transitioning the two layers.
    image.getBoundingClientRect();
    current = image;
    image.classList.add('is-active');
    previous?.classList.remove('is-active');
    if (!motion.reduced()) {
      await new Promise(resolve => { finishFade = resolve; fadeTimer = setTimeout(resolve, 650); });
    }
    settleFade();
  };
  const clock = createCarouselClock({
    canRun: () => !disposed && !userPaused && !motion.reduced() && !document.hidden && onScreen
      && sources.length > 1 && sources.some((source, position) => position !== index && !failed.has(source)),
    advance: async (valid) => {
      // Try one source per tick. A broken candidate never hides the current frame.
      let next = (index + 1) % sources.length;
      while (failed.has(sources[next]) && next !== index) next = (next + 1) % sources.length;
      if (next === index) return;
      const image = makeImage(sources[next]);
      if (!await loadHeroImageWithFallback(image)) { failed.add(sources[next]); return; }
      if (!valid()) return;
      index = next;
      await show(image);
    },
  });
  function sync() {
    const paused = userPaused || motion.reduced();
    control.hidden = sources.length < 2;
    control.disabled = motion.reduced();
    control.textContent = paused ? '播放輪播' : '暫停輪播';
    control.setAttribute('aria-label', paused ? '播放首頁照片輪播' : '暫停首頁照片輪播');
    control.setAttribute('aria-pressed', String(!paused));
    clock.sync();
    if (paused || document.hidden || !onScreen) settleFade();
  }
  control.addEventListener('click', () => {
    userPaused = !userPaused;
    hero.dataset.heroPaused = String(userPaused);
    sync();
  }, { signal: abort.signal });
  document.addEventListener('visibilitychange', sync, { signal: abort.signal });
  inView?.observe(hero);
  const unsubscribe = motion.onPreferenceChange(sync);

  // Text is animated immediately from SSR. Late API text is always visible, never replayed.
  if (title && !hero.dataset.titleRevealed) {
    hero.dataset.titleRevealed = 'true';
    if (!motion.reduced() && !motion.restored && motion.settings.reveal) {
      const text = document.createElement('span');
      text.className = 'motion-title-text';
      text.append(...title.childNodes);
      title.append(text);
      title.classList.add('motion-title-mask');
      motion.animate(text, [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: 560 });
    }
  }
  const ticket = ++contentGeneration;
  loadPublicSiteContent().then(async content => {
    if (disposed || ticket !== contentGeneration) return;
    if (title && title.textContent.replace(/\s/g, '') !== content.hero_title.replace(/\s/g, '')) {
      motion.cancel(title.firstElementChild);
      title.classList.remove('motion-title-mask');
      title.textContent = content.hero_title;
    }
    if (copy) copy.textContent = content.hero_copy;
    sources = [...content.hero_image_urls];
    if (!sources.length) return;
    const existingIndex = sources.indexOf(current?.dataset.originalSrc);
    if (existingIndex >= 0 && current?.complete && current.naturalWidth > 0) { index = existingIndex; sync(); return; }
    const firstUrl = sources[0];
    if (!await canReuseStaticHeroImage(current, firstUrl)) {
      const first = makeImage(firstUrl);
      const loaded = await loadHeroImageWithFallback(first);
      if (disposed || ticket !== contentGeneration) return;
      if (loaded) await show(first);
      else failed.add(firstUrl);
    }
    if (!disposed) sync();
  }).catch(() => { /* The SSR image, title and CTA remain usable. */ });

  return () => {
    disposed = true;
    contentGeneration++;
    clock.dispose();
    settleFade();
    inView?.disconnect();
    unsubscribe();
    abort.abort();
    control.hidden = true;
  };
}
