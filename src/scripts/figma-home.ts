import { createHeroShutter } from '../lib/hero-shutter';
import { createHeroTypewriter, createTypewriter } from '../lib/hero-typewriter';

// Start the focus reveal only after the photograph is decoded, including cold loads.
const hero = document.querySelector<HTMLElement>('[data-hero-focus]');
const heroImage = hero?.querySelector<HTMLImageElement>('.camera-hero__image');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
if (hero && heroImage) {
  const soundButton = document.querySelector<HTMLButtonElement>('[data-hero-sound]');
  const soundStatus = document.querySelector<HTMLElement>('[data-hero-sound-status]');
  const typewriter = createHeroTypewriter(hero, reducedMotion);
  typewriter.reset();
  const shutter = createHeroShutter();
  let soundEnabled = true;
  let audioUnlocked = false;
  let shutterPlayed = false;
  const playShutter = () => {
    if (soundEnabled && !shutterPlayed && document.visibilityState === 'visible') shutterPlayed = shutter.play();
  };
  const updateSoundButton = () => {
    soundButton?.setAttribute('aria-pressed', String(soundEnabled));
    const label = soundEnabled ? '關閉快門音效' : '開啟快門音效並重播對焦';
    soundButton?.setAttribute('aria-label', label);
    soundButton?.setAttribute('title', label);
    soundButton?.querySelector('[data-sound-on]')?.toggleAttribute('hidden', !soundEnabled);
    soundButton?.querySelector('[data-sound-off]')?.toggleAttribute('hidden', soundEnabled);
  };
  const enableSound = async () => {
    const ready = await shutter.enable();
    audioUnlocked = ready && soundEnabled;
    if (ready && soundEnabled) playShutter();
  };
  const unlockSound = (event: Event) => {
    if (!soundEnabled || audioUnlocked || (event.target instanceof Element && event.target.closest('[data-hero-sound]'))) return;
    void enableSound().catch(() => {
      if (soundStatus) soundStatus.textContent = '音效目前無法播放，可點喇叭重新啟用。';
    });
  };
  const finishFocus = () => { hero.dataset.heroFocus = 'complete'; typewriter.start(); };
  const replayFocus = () => {
    typewriter.reset();
    shutterPlayed = false;
    if (reducedMotion.matches) { finishFocus(); return; }
    hero.dataset.heroFocus = 'waiting';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (hero.dataset.heroFocus === 'waiting') hero.dataset.heroFocus = 'playing';
    }));
  };
  const onMotionPreference = () => { if (reducedMotion.matches) { finishFocus(); typewriter.finish(); } };
  reducedMotion.addEventListener('change', onMotionPreference);
  hero.addEventListener('animationend', (event) => {
    if (event.animationName === 'hero-focus-in' && event.target === heroImage) typewriter.start();
    if (event.animationName === 'hero-frame-out' && event.target instanceof Element && event.target.classList.contains('camera-viewfinder')) finishFocus();
  });
  if (soundButton && 'AudioContext' in window) {
    soundButton.hidden = false;
    updateSoundButton();
    // Try autoplay first; if blocked, the first interaction unlocks the same recording.
    void enableSound().catch(() => {
      if (soundStatus) soundStatus.textContent = '音效目前無法播放，可點喇叭重新啟用。';
    });
    document.addEventListener('click', unlockSound, { passive: true });
    document.addEventListener('keydown', unlockSound);
    soundButton.addEventListener('click', async () => {
      soundButton.disabled = true;
      try {
        if (soundEnabled) { soundEnabled = false; audioUnlocked = false; shutter.mute(); }
        else { soundEnabled = true; replayFocus(); await enableSound(); }
        if (soundStatus) soundStatus.textContent = soundEnabled ? '快門音效已開啟。' : '快門音效已關閉。';
      } catch {
        soundEnabled = false;
        if (soundStatus) soundStatus.textContent = '音效目前無法播放，請再點一次開啟。';
      } finally {
        updateSoundButton();
        soundButton.disabled = false;
      }
    });
  }
  if (reducedMotion.matches) finishFocus();
  else heroImage.decode().then(() => {
    requestAnimationFrame(() => {
      if (hero.dataset.heroFocus === 'waiting') hero.dataset.heroFocus = 'playing';
    });
  }).catch(finishFocus);
}

// Reveal the quotation once its text enters the viewport, using the Hero cadence.
const quote = document.querySelector<HTMLElement>('[data-quote-copy]');
if (quote) {
  const typewriter = createTypewriter(quote, reducedMotion, { letterSelector: '[data-quote-letter]', stateAttribute: 'data-quote-copy' });
  typewriter.reset();
  if (reducedMotion.matches || !('IntersectionObserver' in window)) typewriter.finish();
  else {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        typewriter.start();
        observer.disconnect();
      }
    }, { threshold: .35, rootMargin: '0px 0px -10% 0px' });
    observer.observe(quote);
    reducedMotion.addEventListener('change', () => {
      if (reducedMotion.matches) { typewriter.finish(); observer.disconnect(); }
    });
  }
}

// Touch screens and reduced motion retain native, keyboard-accessible scrolling.
const stories = [...document.querySelectorAll<HTMLElement>('[data-horizontal]')];
const motion = window.matchMedia('(min-width: 901px) and (prefers-reduced-motion: no-preference)');
const header = document.querySelector<HTMLElement>('[data-home-header]');
let queued = false;
function updateStories() {
  queued = false;
  header?.classList.toggle('is-scrolled', window.scrollY > 24);
  for (const story of stories) {
    const viewport = story.querySelector<HTMLElement>('.horizontal-story__viewport')!;
    const track = story.querySelector<HTMLElement>('.horizontal-story__track')!;
    if (!motion.matches) {
      story.classList.remove('is-scrolling');
      story.style.removeProperty('--story-height');
      track.style.removeProperty('transform');
      const nativeMode = window.innerWidth <= 900 ? 'mobile' : 'desktop';
      if (story.dataset.nativeMode !== nativeMode) {
        viewport.scrollLeft = nativeMode === 'desktop' && story.dataset.horizontal === 'right' ? viewport.scrollWidth : 0;
        story.dataset.nativeMode = nativeMode;
      }
      continue;
    }
    if (story.dataset.nativeMode) {
      viewport.scrollLeft = 0;
      delete story.dataset.nativeMode;
    }
    const distance = Math.max(0, track.scrollWidth - viewport.clientWidth);
    const top = Math.max(0, (window.innerHeight - viewport.offsetHeight) / 2);
    story.classList.add('is-scrolling');
    story.style.setProperty('--story-height', `${viewport.offsetHeight + distance}px`);
    story.style.setProperty('--story-top', `${top}px`);
    const progress = Math.max(0, Math.min(1, (top - story.getBoundingClientRect().top) / Math.max(1, distance)));
    const x = story.dataset.horizontal === 'right' ? -distance * (1 - progress) : -distance * progress;
    track.style.transform = `translate3d(${x}px, 0, 0)`;
  }
}
function requestUpdate() { if (!queued) { queued = true; requestAnimationFrame(updateStories); } }
window.addEventListener('scroll', requestUpdate, { passive: true });
window.addEventListener('resize', requestUpdate, { passive: true });
motion.addEventListener('change', requestUpdate);
new ResizeObserver(requestUpdate).observe(document.querySelector('.figma-home')!);
document.fonts.ready.then(requestUpdate);
updateStories();
document.querySelectorAll('.camera-nav details a').forEach((link) => link.addEventListener('click', () => link.closest('details')?.removeAttribute('open')));
