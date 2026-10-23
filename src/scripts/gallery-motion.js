// Native dialog retains modal focus containment and Escape behavior.
// Request generations prevent late image decodes from repainting a newer slide.
export function setupGalleryMotion(gallery, dialog, motion) {
  const image = dialog.querySelector('[data-lightbox-image]');
  const count = dialog.querySelector('[data-lightbox-count]');
  const close = dialog.querySelector('[data-lightbox-close]');
  if (!image || !close || typeof dialog.showModal !== 'function') return () => {};
  const abort = new AbortController();
  const root = document.documentElement;
  dialog.toggleAttribute('data-gallery-motion', motion.settings.galleryTransition);
  let index = 0;
  let triggers = [];
  let origin;
  let generation = 0;
  let flight;
  let disposed = false;
  let pendingImage;
  const clearFlight = () => {
    if (flight) { motion.cancel(flight.firstElementChild); motion.cancel(flight); flight.remove(); flight = undefined; }
    image.style.removeProperty('opacity');
    motion.cancel(image);
    motion.cancel(dialog);
  };
  const finish = () => {
    generation++;
    pendingImage?.removeAttribute('src'); pendingImage = undefined;
    clearFlight();
    root.classList.remove('motion-dialog-open');
    image.removeAttribute('src');
    image.alt = '';
    if (origin?.isConnected) origin.focus({ preventScroll: true });
    else {
      const previous = gallery.getAttribute('tabindex');
      gallery.setAttribute('tabindex', '-1');
      gallery.focus({ preventScroll: true });
      if (previous === null) gallery.removeAttribute('tabindex');
      else gallery.setAttribute('tabindex', previous);
    }
  };
  const animateOpen = (thumbnail) => {
    if (!motion.settings.galleryTransition || motion.reduced()) return;
    const from = thumbnail.getBoundingClientRect();
    const to = image.getBoundingClientRect();
    if (!matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)').matches
      || !thumbnail.complete || !thumbnail.naturalWidth || !to.width || !to.height || !from.width || !from.height) {
      motion.animate(image, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
      return;
    }
    // Animate a crop window and a uniformly scaled photo independently. A square
    // or wide mosaic can open into a portrait without stretching its subject.
    const clone = document.createElement('div');
    clone.className = 'portfolio-lightbox__flight';
    clone.setAttribute('aria-hidden', 'true');
    const photo = document.createElement('img');
    photo.className = 'portfolio-lightbox__flight-image';
    photo.src = image.src;
    photo.alt = '';
    Object.assign(photo.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` });
    clone.append(photo);
    dialog.append(clone);
    flight = clone;
    image.style.opacity = '0';
    const scale = Math.max(from.width / to.width, from.height / to.height);
    const x = from.left + (from.width - to.width * scale) / 2 - to.left;
    const y = from.top + (from.height - to.height * scale) / 2 - to.top;
    motion.animate(photo, [
      { transform: `translate(${x}px, ${y}px) scale(${scale})` },
      { transform: 'none' },
    ], { duration: 320 });
    const crop = rect => `inset(${Math.max(0, rect.top)}px ${Math.max(0, innerWidth - rect.right)}px ${Math.max(0, innerHeight - rect.bottom)}px ${Math.max(0, rect.left)}px)`;
    const animation = motion.animate(clone, [{ clipPath: crop(from) }, { clipPath: crop(to) }], { duration: 320 });
    const done = () => { if (flight === clone) { clone.remove(); flight = undefined; image.style.removeProperty('opacity'); } };
    if (animation) animation.finished.then(done, done); else done();
  };
  const update = async (next, opening = false) => {
    if (!triggers.length) return;
    const ticket = ++generation;
    clearFlight();
    pendingImage?.removeAttribute('src');
    index = (next + triggers.length) % triggers.length;
    const trigger = triggers[index];
    const thumbnail = trigger.querySelector('img');
    const src = trigger.dataset.fullSrc || thumbnail?.dataset.originalSrc || thumbnail?.currentSrc || thumbnail?.src;
    if (!thumbnail || !src) return;
    // A ready thumbnail gives immediate feedback, even on a slow full-size request.
    if (opening) {
      image.src = thumbnail.complete && thumbnail.naturalWidth ? thumbnail.currentSrc || thumbnail.src : src;
      image.alt = thumbnail.alt;
      if (count) count.textContent = `${index + 1} / ${triggers.length}`;
      animateOpen(thumbnail);
    }
    const full = new Image();
    pendingImage = full;
    full.src = src;
    let loaded = false;
    try { await full.decode(); loaded = full.naturalWidth > 0; } catch { loaded = full.complete && full.naturalWidth > 0; }
    if (disposed || ticket !== generation || !dialog.open) return;
    pendingImage = undefined;
    if (!loaded) {
      if (count) count.textContent = `${index + 1} / ${triggers.length} · 原圖暫時無法載入，可繼續切換照片`;
      return;
    }
    if (!opening) clearFlight();
    image.src = full.src;
    image.alt = thumbnail.alt;
    if (count) count.textContent = `${index + 1} / ${triggers.length}`;
    if (!opening && motion.settings.galleryTransition) motion.animate(image, [{ opacity: .25 }, { opacity: 1 }], { duration: 180 });
  };
  gallery.addEventListener('click', event => {
    const trigger = event.target instanceof Element ? event.target.closest('[data-lightbox-open]') : null;
    if (!trigger) return;
    triggers = [...gallery.querySelectorAll('[data-lightbox-open]')];
    origin = trigger;
    dialog.showModal();
    root.classList.add('motion-dialog-open');
    close.focus({ preventScroll: true });
    void update(triggers.indexOf(trigger), true);
  }, { signal: abort.signal });
  close.addEventListener('click', () => dialog.close(), { signal: abort.signal });
  dialog.addEventListener('close', finish, { signal: abort.signal });
  dialog.addEventListener('click', event => {
    if (event.target === dialog || event.target === dialog.querySelector('.portfolio-lightbox__inner')) dialog.close();
  }, { signal: abort.signal });
  dialog.querySelector('[data-lightbox-prev]')?.addEventListener('click', () => void update(index - 1), { signal: abort.signal });
  dialog.querySelector('[data-lightbox-next]')?.addEventListener('click', () => void update(index + 1), { signal: abort.signal });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); void update(index + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  }, { signal: abort.signal });
  const unsubscribe = motion.onPreferenceChange(() => { if (motion.reduced()) clearFlight(); });
  window.addEventListener('resize', clearFlight, { passive: true, signal: abort.signal });
  return () => {
    disposed = true;
    if (dialog.open) { dialog.close(); finish(); }
    else { generation++; pendingImage?.removeAttribute('src'); clearFlight(); }
    abort.abort(); unsubscribe();
    dialog.removeAttribute('data-gallery-motion');
  };
}
