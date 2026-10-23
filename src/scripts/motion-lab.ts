import type * as THREE from 'three';
import { gsap } from 'gsap';
import { layerState, smooth, galleryCursor, galleryX, coverUv } from '../lib/motion-story-state.js';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  DEFAULT_MODE,
  FX_DEFINITIONS,
  MOTION_MODES,
  MOTION_SCENES,
  SCENE_COLORS,
  isMotionMode,
} from '../lib/motion-lab-config.js';

gsap.registerPlugin(ScrollTrigger);

const STORAGE_KEY = 'phox999-motion-lab:v1';
const SCROLL_SCENE_INDEX = new Map(MOTION_SCENES.map((scene, index) => [scene.id, index]));
const FX_IDS = new Set(FX_DEFINITIONS.map(({ id }) => id));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type StoredSettings = {
  mode?: string;
  effects?: string[];
  subjectX?: number;
  subjectScale?: number;
  parallax?: number;
  dpr?: number;
  exposure?: number;
  chromatic?: number;
  particles?: number;
};

export function initMotionLab() {
  const story = document.querySelector<HTMLElement>('[data-story]');
  const stage = document.querySelector<HTMLElement>('[data-stage]');
  const heroArt = document.querySelector<HTMLElement>('[data-hero-art]');
  const canvasHost = document.querySelector<HTMLElement>('[data-webgl-stage]');
  const modeSelect = document.querySelector<HTMLSelectElement>('[data-mode-select]');
  const panel = document.querySelector<HTMLDetailsElement>('[data-dev-panel]');

  if (!story || !stage || !heroArt || !canvasHost || !modeSelect || document.body.dataset.motionInitialized) return;
  document.body.dataset.motionInitialized = 'true';

  let canvas = canvasHost.querySelector<HTMLCanvasElement>('[data-gallery-canvas]');
  const scenes = Array.from(story.querySelectorAll<HTMLElement>('[data-scene]'));
  const sceneLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-jump]'));
  const galleryCards = Array.from(story.querySelectorAll<HTMLAnchorElement>('[data-project-card]'));
  const galleryLinks = Array.from(story.querySelectorAll<HTMLAnchorElement>('[data-gallery-link]'));
  const fxInputs = Array.from(document.querySelectorAll<HTMLInputElement>('[data-fx]'));
  const magneticCtas = Array.from(document.querySelectorAll<HTMLElement>('[data-magnetic-cta]'));
  const projects = galleryCards.map((card) => ({
    href: card.href,
    title: card.querySelector('strong')?.textContent?.trim() ?? 'Phox999 作品',
    image: card.querySelector('img')?.currentSrc || card.querySelector('img')?.src || '',
  }));

  const layerReady = heroArt.dataset.layerReady === 'true';
  const stylePhoto = document.querySelector<HTMLElement>('[data-style-photo]');
  const styleImages = Array.from(stylePhoto?.querySelectorAll('img') ?? []);
  const domGallery = document.querySelector<HTMLElement>('[data-dom-gallery]');
  const domWorks = Array.from(document.querySelectorAll<HTMLElement>('[data-dom-work]'));
  document.body.dataset.layersReady = String(layerReady);
  const metrics = {
    progress: document.querySelector<HTMLOutputElement>('[data-metric-progress]'),
    scene: document.querySelector<HTMLOutputElement>('[data-metric-scene]'),
    frame: document.querySelector<HTMLOutputElement>('[data-metric-frame]'),
    canvas: document.querySelector<HTMLOutputElement>('[data-metric-canvas]'),
    assets: document.querySelector<HTMLOutputElement>('[data-metric-assets]'),
    memory: document.querySelector<HTMLOutputElement>('[data-metric-memory]'),
    fxCount: document.querySelector<HTMLElement>('[data-fx-count]'),
    feedback: document.querySelector<HTMLOutputElement>('[data-dev-feedback]'),
    webglStatus: document.querySelector<HTMLElement>('[data-webgl-status]'),
    sceneName: document.querySelector<HTMLElement>('[data-current-scene]'),
    progressBar: document.querySelector<HTMLElement>('[data-progress-bar]'),
    dprValue: document.querySelector<HTMLOutputElement>('[data-dpr-value]'),
    subjectXValue: document.querySelector<HTMLOutputElement>('[data-subject-x-value]'),
    subjectScaleValue: document.querySelector<HTMLOutputElement>('[data-subject-scale-value]'),
    parallaxValue: document.querySelector<HTMLOutputElement>('[data-parallax-value]'),
    exposureValue: document.querySelector<HTMLOutputElement>('[data-exposure-value]'),
    chromaticValue: document.querySelector<HTMLOutputElement>('[data-chromatic-value]'),
    particleValue: document.querySelector<HTMLOutputElement>('[data-particle-value]'),
    devLight: document.querySelector<HTMLElement>('.dev-panel__light'),
  };

  const dprInput = document.querySelector<HTMLInputElement>('[data-dpr]');
  const subjectXInput = document.querySelector<HTMLInputElement>('[data-subject-x]');
  const subjectScaleInput = document.querySelector<HTMLInputElement>('[data-subject-scale]');
  const parallaxInput = document.querySelector<HTMLInputElement>('[data-parallax]');
  const exposureInput = document.querySelector<HTMLInputElement>('[data-exposure]');
  const chromaticInput = document.querySelector<HTMLInputElement>('[data-chromatic]');
  const particlesInput = document.querySelector<HTMLInputElement>('[data-particles]');
  const debugInput = document.querySelector<HTMLInputElement>('[data-debug]');
  const lockModeInput = document.querySelector<HTMLInputElement>('[data-lock-mode]');
  const customCursor = document.querySelector<HTMLElement>('[data-custom-cursor]');
  const trailLayer = document.querySelector<HTMLElement>('[data-trail]');
  const liquidMap = document.querySelector<SVGFEDisplacementMapElement>('[data-liquid-map]');
  const liquidNoise = document.querySelector<SVGFETurbulenceElement>('[data-liquid-noise]');

  let mode = readInitialMode();
  let effects = readInitialEffects(mode);
  let currentProgress = 0;
  let scrollVelocity = 0;
  let modeContext: ReturnType<typeof gsap.matchMedia> | undefined;
  let timeline: gsap.core.Timeline | undefined;
  let activeMotionState: Record<string, number> | undefined;
  let activeMotionIsMobile = false;
  let ThreeRuntime: typeof import('three') | undefined;
  let webglRenderer: THREE.WebGLRenderer | undefined;
  let webglScene: THREE.Scene | undefined;
  let webglCamera: THREE.PerspectiveCamera | undefined;
  let webglGroup: THREE.Group | undefined;
  let photoGeometry: THREE.PlaneGeometry | undefined;
  let photoMeshes: THREE.Mesh[] = [];
  let photoMaterials: THREE.ShaderMaterial[] = [];
  let photoTextures = new Map<number, THREE.Texture>();
  let pendingTextures = new Set<number>();
  let particlePoints: THREE.Points | undefined;
  let aperture: THREE.Mesh | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let galleryInitialized = false;
  let galleryLoading = false;
  let galleryFailed = false;
  let galleryInView = false;
  let galleryFrameReady = false;
  let renderedPhotoIndex = -1;
  let generation = 0;
  let webglGeneration = 0;
  let layoutTimer: ReturnType<typeof setTimeout> | undefined;
  const textureTimers = new Map<number, ReturnType<typeof setTimeout>>();
  let activePhotoIndex = 0;
  let lastFpsSample = performance.now();
  let framesSinceSample = 0;
  let frameTimes: number[] = [];
  let pointerX = 0;
  let pointerY = 0;
  let previousTrailPoint: { x: number; y: number; time: number } | undefined;
  let subjectX = readVisualParameter('x', 'subjectX', 1, 0.5, 1.5);
  let subjectScale = readVisualParameter('scale', 'subjectScale', 1, 0.75, 1.25);
  let parallax = readVisualParameter('parallax', 'parallax', 1, 0, 2);
  let dpr = readVisualParameter('dpr', 'dpr', 1.5, 0.75, 2);
  let exposure = readVisualParameter('exposure', 'exposure', 1, 0.8, 1.2);
  let chromatic = readVisualParameter('chromatic', 'chromatic', 1, 0, 2);
  let particleCount = Math.round(readVisualParameter('particles', 'particles', 2000, 0, 8000) / 500) * 500;
  let maxSlowSince = 0;
  let maxQualityTier = 0;
  let destroyed = false;

  if (window.matchMedia('(max-width: 767px)').matches) panel?.removeAttribute('open');
  const diagnosticParams = new URLSearchParams(window.location.search);
  document.body.dataset.devView = String(diagnosticParams.get('debug') === '1');
  if (panel && diagnosticParams.get('debug') === '1') panel.open = true;
  if (lockModeInput) lockModeInput.checked = diagnosticParams.get('lock') === '1';
  if (subjectXInput) subjectXInput.value = String(subjectX);
  if (subjectScaleInput) subjectScaleInput.value = String(subjectScale);
  if (parallaxInput) parallaxInput.value = String(parallax);
  if (dprInput) dprInput.value = String(dpr);
  if (exposureInput) exposureInput.value = String(exposure);
  if (chromaticInput) chromaticInput.value = String(chromatic);
  if (particlesInput) particlesInput.value = String(particleCount);
  modeSelect.value = mode;
  document.body.dataset.mode = mode;

  updateControls();
  updateMemoryMetric();
  updateRenderParameters();
  try {
    startMode(mode);
  } catch (error) {
    mode = 'static';
    effects.clear();
    startMode(mode);
    setFeedback('動效初始化失敗，已保留完整靜態內容。');
    console.warn('Motion Lab static fallback:', error);
  }

  modeSelect.addEventListener('change', onModeChange);
  fxInputs.forEach((input) => input.addEventListener('change', onFxChange));
  sceneLinks.forEach((link) => link.addEventListener('click', onSceneJump));
  document.querySelector('[data-reset]')?.addEventListener('click', onReset);
  document.querySelector('[data-copy-settings]')?.addEventListener('click', onCopySettings);
  subjectXInput?.addEventListener('input', onSubjectXChange);
  subjectScaleInput?.addEventListener('input', onSubjectScaleChange);
  parallaxInput?.addEventListener('input', onParallaxChange);
  dprInput?.addEventListener('input', onDprChange);
  exposureInput?.addEventListener('input', onExposureChange);
  chromaticInput?.addEventListener('input', onChromaticChange);
  particlesInput?.addEventListener('input', onParticlesChange);
  debugInput?.addEventListener('change', onDebugChange);
  lockModeInput?.addEventListener('change', onLockModeChange);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointermove', makeTrail, { passive: true });
  magneticCtas.forEach((cta) => {
    cta.addEventListener('pointermove', onMagneticMove);
    cta.addEventListener('pointerleave', resetMagnetic);
  });
  window.addEventListener('pagehide', onPageHide, { once: true });
  window.addEventListener('astro:before-swap', teardown, { once: true });
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('hashchange', onHashChange);
  const imageDecodes = Array.from(story.querySelectorAll<HTMLImageElement>('img[fetchpriority="high"]')).map((image) => image.decode().catch(() => undefined));
  void Promise.allSettled([...imageDecodes, document.fonts.ready]).then(scheduleLayoutRefresh);

  let initialHash = window.location.hash.slice(1);
  try { initialHash = decodeURIComponent(initialHash); } catch { /* Ignore malformed hash encoding. */ }
  const initialSceneId = initialHash.startsWith('scene-') ? initialHash.slice('scene-'.length) : initialHash;
  if (SCROLL_SCENE_INDEX.has(initialSceneId) && mode !== 'static') {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (destroyed || mode === 'static') return;
      ScrollTrigger.refresh();
      jumpToScene(initialSceneId, false, true);
    }));
  }

  function scheduleLayoutRefresh() {
    if (destroyed) return;
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(() => {
      if (destroyed) return;
      ScrollTrigger.refresh();
      updateAssetsMetric();
    }, 100);
  }

  function onHashChange() {
    const id = window.location.hash.slice(1).replace(/^scene-/, '');
    if (mode !== 'static') jumpToScene(id, false, true);
  }

  function onVisibilityChange() {
    frameTimes = [];
    framesSinceSample = 0;
    lastFpsSample = performance.now();
    maxSlowSince = 0;
    if (document.visibilityState === 'visible' && mode !== 'static') {
      ScrollTrigger.update();
      updateProgress(timeline?.progress() ?? currentProgress, 0);
    }
  }

  function onPageHide(event: PageTransitionEvent) {
    teardown();
    if (event.persisted) window.addEventListener('pageshow', () => initMotionLab(), { once: true });
  }

  function readStoredSettings(): StoredSettings {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved as StoredSettings : {};
    } catch {
      return {};
    }
  }

  function readVisualParameter(queryKey: string, storedKey: keyof StoredSettings, fallback: number, min: number, max: number) {
    const params = new URLSearchParams(window.location.search);
    const queryValue = Number(params.get(queryKey));
    if (params.has(queryKey) && Number.isFinite(queryValue)) return clamp(queryValue, min, max);
    const storedValue = readStoredSettings()[storedKey];
    return typeof storedValue === 'number' && Number.isFinite(storedValue) ? clamp(storedValue, min, max) : fallback;
  }

  function readInitialMode() {
    const queryMode = new URLSearchParams(window.location.search).get('mode');
    const storedMode = readStoredSettings().mode;
    if (isMotionMode(queryMode)) return queryMode;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'static';
    if (isMotionMode(storedMode)) return storedMode;
    return window.matchMedia('(max-width: 767px)').matches ? 'lite' : DEFAULT_MODE;
  }

  function readInitialEffects(selectedMode: string) {
    const params = new URLSearchParams(window.location.search);
    if (selectedMode === 'static') return new Set();
    const queryMode = params.get('mode');
    const storedEffects = readStoredSettings().effects;
    const stored = Array.isArray(storedEffects) ? storedEffects : undefined;
    const source = params.has('fx')
      ? params.get('fx')?.split(',')
      : isMotionMode(queryMode)
        ? undefined
        : stored;
    const chosen = source
      ? new Set(source.filter((id): id is string => FX_IDS.has(id)))
      : new Set(MOTION_MODES[selectedMode as keyof typeof MOTION_MODES].effects);
    return sanitizeEffects(chosen, selectedMode);
  }

  function sanitizeEffects(selected: Set<string>, selectedMode: string) {
    const sanitized = new Set([...selected].filter((id) => {
      const definition = FX_DEFINITIONS.find((effect) => effect.id === id);
      if (!definition || definition.unavailable || selectedMode === 'static') return false;
      if (definition.requiresWebgl && selectedMode === 'lite') return false;
      if (definition.pointerOnly && !window.matchMedia('(pointer: fine)').matches) return false;
      return true;
    }));
    if (!layerReady) sanitized.delete('fx01');

    if (sanitized.has('fx06')) sanitized.delete('fx22');
    if (sanitized.has('fx22')) sanitized.delete('fx06');
    if (sanitized.has('fx13')) sanitized.delete('fx14');
    if (sanitized.has('fx14')) sanitized.delete('fx13');
    if (['fx13', 'fx14', 'fx16'].some((id) => sanitized.has(id))) sanitized.delete('fx17');
    if (sanitized.has('fx17')) {
      sanitized.delete('fx13');
      sanitized.delete('fx14');
      sanitized.delete('fx16');
    }
    return sanitized;
  }

  function saveSettings() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        mode,
        effects: [...effects],
        subjectX,
        subjectScale,
        parallax,
        dpr,
        exposure,
        chromatic,
        particles: particleCount,
      }));
    } catch {
      setFeedback('瀏覽器未允許本機儲存；目前設定仍可使用。');
    }
  }

  function setFeedback(message: string) {
    if (metrics.feedback) metrics.feedback.textContent = message;
  }

  function onModeChange() {
    if (lockModeInput?.checked) {
      modeSelect.value = mode;
      setFeedback('目前已鎖定模式；取消鎖定後才能切換。');
      return;
    }
    mode = isMotionMode(modeSelect.value) ? modeSelect.value : DEFAULT_MODE;
    effects = sanitizeEffects(new Set(MOTION_MODES[mode as keyof typeof MOTION_MODES].effects), mode);
    maxSlowSince = 0;
    maxQualityTier = 0;
    saveSettings();
    startMode(mode);
  }

  function onFxChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const id = input.dataset.fx;
    if (!id || !FX_IDS.has(id)) return;
    setEffect(id, input.checked);
    saveSettings();
    updateControls();
    updateProgress(currentProgress, scrollVelocity);
  }

  function setEffect(id: string, enabled: boolean) {
    const definition = FX_DEFINITIONS.find((effect) => effect.id === id);
    if (!definition || definition.unavailable || (definition.requiresWebgl && ['lite', 'static'].includes(mode))) {
      updateControls();
      return;
    }

    if (enabled) effects.add(id);
    else effects.delete(id);

    if (enabled && id === 'fx06') effects.delete('fx22');
    if (enabled && id === 'fx22') effects.delete('fx06');
    if (enabled && id === 'fx13') effects.delete('fx14');
    if (enabled && id === 'fx14') effects.delete('fx13');
    if (enabled && ['fx13', 'fx14', 'fx16'].includes(id)) effects.delete('fx17');
    if (enabled && id === 'fx17') {
      effects.delete('fx13');
      effects.delete('fx14');
      effects.delete('fx16');
    }

    applyEffectClasses();
    updateControls();
    if (shouldUseWebgl() && currentProgress > 0.38) void ensureWebgl();
    if (!shouldUseWebgl() && webglRenderer) disposeWebgl();
    updateRendererVisibility();
    applyFrameStyles();
  }

  function applyEffectClasses() {
    for (const id of FX_IDS) document.body.classList.toggle(`fx-${id}`, effects.has(id));
    document.body.classList.toggle('fx-max', mode === 'max');
    document.body.classList.toggle('is-mode-lite', mode === 'lite');
  }

  function updateControls() {
    applyEffectClasses();
    if (modeSelect) modeSelect.disabled = Boolean(lockModeInput?.checked);
    for (const input of fxInputs) {
      const id = input.dataset.fx ?? '';
      const definition = FX_DEFINITIONS.find((effect) => effect.id === id);
      if (!definition) continue;
      input.checked = effects.has(id);
      input.disabled = Boolean(
        mode === 'static'
        || definition.unavailable
        || (id === 'fx01' && !layerReady)
        || (definition.requiresWebgl && ['lite', 'static'].includes(mode))
        || (definition.pointerOnly && !window.matchMedia('(pointer: fine)').matches),
      );
    }
    const count = [...effects].filter((id) => FX_IDS.has(id)).length;
    if (metrics.fxCount) metrics.fxCount.textContent = `${count} 啟用`;
    if (metrics.devLight) metrics.devLight.classList.toggle('is-warning', Boolean(galleryFailed));
  }

  function startMode(selectedMode: string) {
    generation++;
    const currentGeneration = generation;
    modeContext?.revert();
    modeContext = undefined;
    timeline = undefined;
    activeMotionState = undefined;
    disposeWebgl();
    galleryFailed = false;
    resetDynamicStyles();
    mode = selectedMode;
    document.body.dataset.mode = mode;
    document.body.classList.toggle('is-enhanced', mode !== 'static');
    story?.removeAttribute('data-enhanced');
    stage?.removeAttribute('data-enhanced');
    document.body.classList.remove('has-webgl');
    if (modeSelect.value !== mode) modeSelect.value = mode;
    updateControls();
    updateMemoryMetric();

    if (mode === 'static') {
      resetStaticScene();
      updateFrameMetric('Static / ticker 停用');
      updateCanvasMetric();
      return;
    }

    modeContext = gsap.matchMedia();
    modeContext.add({
      desktop: '(min-width: 1024px)',
      tablet: '(min-width: 768px) and (max-width: 1023px)',
      mobile: '(max-width: 767px)',
    }, (context) => {
      if (currentGeneration !== generation) return;
      story?.setAttribute('data-enhanced', 'true');
      stage?.setAttribute('data-enhanced', 'true');
      bodySceneReset();
      setupTimeline(Boolean(context.conditions?.mobile), Boolean(context.conditions?.tablet));
      gsap.ticker.add(renderTick);
      updateProgress(timeline?.progress() ?? currentProgress, scrollVelocity);
      return () => {
        gsap.ticker.remove(renderTick);
        timeline?.scrollTrigger?.kill();
        timeline?.kill();
        timeline = undefined;
        disposeWebgl();
        story?.removeAttribute('data-enhanced');
        stage?.removeAttribute('data-enhanced');
        bodySceneReset();
      };
    });
  }

  function bodySceneReset() {
    scenes.forEach((scene) => {
      scene.removeAttribute('data-visual-active');
      scene.removeAttribute('aria-hidden');
      scene.inert = false;
      scene.style.removeProperty('opacity');
    });
  }

  function resetStaticScene() {
    delete document.body.dataset.activeScene;
    bodySceneReset();
    if (metrics.scene) metrics.scene.textContent = 'Static / 全部章節';
    if (metrics.sceneName) metrics.sceneName.textContent = 'STATIC / 全部章節';
    if (metrics.progress) metrics.progress.textContent = '—';
    if (metrics.progressBar) metrics.progressBar.style.width = '0%';
    stage?.style.removeProperty('background-color');
    heroArt.style.removeProperty('translate');
    heroArt.style.removeProperty('--photo-frame-scale');
    heroArt.style.removeProperty('--aperture-radius');
  }

  function resetDynamicStyles() {
    heroArt.style.removeProperty('translate');
    heroArt.style.removeProperty('opacity');
    heroArt.style.removeProperty('--photo-frame-scale');
    heroArt.style.removeProperty('--aperture-radius');
    stage.style.removeProperty('--pointer-x');
    stage.style.removeProperty('--pointer-y');
    stage.style.removeProperty('--scene-background');
    stage.style.removeProperty('--style-mix');
    stage.style.removeProperty('--chromatic-offset');
    stage.style.removeProperty('--motion-stretch');
    story?.style.removeProperty('--reveal-inset');
    story?.style.removeProperty('--story-progress');
    document.querySelector<HTMLElement>('[data-aperture-ring]')?.removeAttribute('style');
    document.querySelectorAll<HTMLElement>('[data-process-card]').forEach((card) => {
      card.style.removeProperty('opacity');
      card.style.removeProperty('translate');
    });
    galleryCards.forEach((card) => {
      card.style.removeProperty('--card-tilt-x');
      card.style.removeProperty('--card-tilt-y');
      card.style.removeProperty('--spot-x');
      card.style.removeProperty('--spot-y');
    });
  }

  function setupTimeline(isMobile: boolean, isTablet: boolean) {
    const offset = window.innerWidth * (isMobile ? 0.1 : isTablet ? 0.18 : 0.22);
    const motion = {
      subjectX: offset,
      frameScale: 1,
      handoff: 0,
      styleMix: 0,
      processReveal: 0,
      ringScale: 0.55,
      ringOpacity: 0,
      ringRotation: 0,
    };
    activeMotionState = motion;
    activeMotionIsMobile = isMobile;

    timeline = gsap.timeline({
      scrollTrigger: {
        trigger: story,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.45,
        invalidateOnRefresh: true,
        onUpdate: (self) => { scrollVelocity = self.getVelocity(); },
        onRefresh: (self) => { scrollVelocity = self.getVelocity(); },
      },
    });

    timeline
      .to(motion, { subjectX: -offset, frameScale: 0.88, duration: 0.18, ease: 'none' }, 0.12)
      .to(motion, { subjectX: 0, frameScale: 0.66, duration: 0.13, ease: 'none' }, 0.3)
      .to(motion, { handoff: 1, duration: 0.03, ease: 'none' }, 0.4)
      .to(motion, { styleMix: 1, duration: 0.13, ease: 'none' }, 0.64)
      .to(motion, { processReveal: 1, duration: 0.13, ease: 'none' }, 0.77)
      .to(motion, { subjectX: offset * 0.9, handoff: 0, frameScale: 0.8, ringScale: 1.15, ringOpacity: 1, ringRotation: 34, duration: 0.1, ease: 'none' }, 0.9);

    timeline.eventCallback('onUpdate', () => updateProgress(timeline?.progress() ?? 0, scrollVelocity));
    applyFrameStyles(motion, isMobile);
  }

  function applyFrameStyles(motion = activeMotionState, isMobile = activeMotionIsMobile) {
    if (!motion || mode === 'static') return;
    // The blocked preview keeps the photograph on the right; it does not pretend
    // that moving a complete photograph is a separated-person animation.
    const offsetX = layerReady ? 0 : innerWidth * (isMobile ? .05 : .22) * (1-smooth((currentProgress-.30)/.055));
    heroArt.style.translate = `${offsetX}px 0`;
    heroArt.style.setProperty('--photo-frame-scale', String((effects.has('fx05') ? motion.frameScale : 1) * subjectScale));
    const firstDomImage = domWorks[0]?.querySelector('img');
    const handoffReady = (firstDomImage?.complete && firstDomImage.naturalWidth > 0) || photoTextures.has(0);
    const handoff = handoffReady ? smooth((currentProgress-.43)/.035) : 0;
    heroArt.style.opacity = String(currentProgress < .64 ? 1-handoff : currentProgress >= .9 ? 1-motion.handoff : 0);
    heroArt.style.borderRadius = `${30*(1-smooth((currentProgress-.375)/.055))}px`;
    if(layerReady){
      const state=layerState(currentProgress);
      heroArt.style.translate='0px 0';
      heroArt.style.setProperty('--photo-frame-scale',String(state.scale*subjectScale));
      const subject=heroArt.querySelector<HTMLElement>('[data-layer-subject]');
      const bg=heroArt.querySelector<HTMLElement>('[data-layer-background]');
      const original=heroArt.querySelector<HTMLElement>('[data-layer-original]');
      if(subject){subject.style.translate=String((effects.has('fx01')?state.subjectX:0)*innerWidth*(isMobile?.1:.22)*subjectX)+'px 0';subject.style.opacity=String(1-state.original);}
      if(bg)bg.style.opacity=String(state.background*(1-state.original));
      if(original)original.style.opacity=String(state.original);
    }
    const styleIndex=clamp((currentProgress-.66)/.08,0,3);
    if(stylePhoto){
      stylePhoto.style.opacity=String(currentProgress>=.64&&currentProgress<=.95?smooth((currentProgress-.64)/.02)*(1-smooth((currentProgress-.91)/.04)):0);
      const stageRect=stage.getBoundingClientRect(),heroRect=heroArt.getBoundingClientRect();
      const blend=smooth((currentProgress-.64)/.025),returnBlend=smooth((currentProgress-.865)/.04);
      const target={left:stageRect.width*(isMobile?.13:.18),top:stageRect.height*(isMobile?.14:.18),width:stageRect.width*(isMobile?.74:.29),height:stageRect.height*(isMobile?.38:.58)};
      const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
      const position=(start:number,end:number)=>lerp(lerp(start,end,blend),start,returnBlend);
      stylePhoto.style.left=`${position(heroRect.left-stageRect.left,target.left)}px`;
      stylePhoto.style.top=`${position(heroRect.top-stageRect.top,target.top)}px`;
      stylePhoto.style.width=`${position(heroRect.width,target.width)}px`;
      stylePhoto.style.height=`${position(heroRect.height,target.height)}px`;
      styleImages.forEach((image,index)=>image.style.opacity=String(Math.max(0,1-Math.abs(styleIndex-index))));
      stylePhoto.style.filter=effects.has('fx13')?'url(#motion-liquid-filter)':'none';
    }
    heroArt.style.setProperty('--aperture-radius', effects.has('fx18') ? `${100 - motion.handoff * 82}%` : '100%');

    const parallaxX = effects.has('fx02') ? pointerX * parallax : 0;
    const parallaxY = effects.has('fx02') ? pointerY * parallax : 0;
    stage.style.setProperty('--pointer-x', String(parallaxX));
    stage.style.setProperty('--pointer-y', String(parallaxY));
    stage.style.setProperty('--scene-background', effects.has('fx04') ? colorAtProgress(currentProgress) : SCENE_COLORS[0]);

    const ring = document.querySelector<HTMLElement>('[data-aperture-ring]');
    if (ring) {
      ring.style.setProperty('--ring-scale', effects.has('fx21') ? String(motion.ringScale) : '0.55');
      ring.style.setProperty('--ring-opacity', effects.has('fx21') ? String(motion.ringOpacity) : '0');
      ring.style.setProperty('--ring-rotation', `${motion.ringRotation}deg`);
    }

    const processCards = Array.from(document.querySelectorAll<HTMLElement>('[data-process-card]'));
    processCards.forEach((card, index) => {
      const step = clamp((motion.processReveal - index * 0.28) / 0.38, 0, 1);
      card.style.opacity = String(step);
      card.style.translate = `0 ${isMobile ? (1 - step) * 10 : (1 - step) * 22}px`;
    });

    const style = clamp((motion.styleMix - 0.15) / 0.7, 0, 1);
    stage.style.setProperty('--style-mix', String(style));
    stage.style.setProperty('--chromatic-offset', `${effects.has('fx16') ? chromatic * Math.sin(style * Math.PI) : 0}px`);
    const liquidAmount = effects.has('fx13') ? 12 * Math.sin((styleIndex % 1) * Math.PI) : 0;
    liquidMap?.setAttribute('scale', String(liquidAmount));
    liquidNoise?.setAttribute('baseFrequency', String(0.01 + 0.015 * Math.sin(style * Math.PI)));

    const stretch = effects.has('fx15') ? clamp(Math.abs(scrollVelocity) / 100000, 0, 0.02) : 0;
    stage.style.setProperty('--motion-stretch', String(stretch));

    updateDomGallery();
    if (webglRenderer) updateGalleryScene(currentProgress, isMobile);
  }

  function updateProgress(nextProgress: number, velocity: number) {
    if (mode === 'static' || destroyed) return;
    currentProgress = clamp(nextProgress, 0, 1);
    scrollVelocity = velocity;
    const sceneIndex = findSceneIndex(currentProgress);
    const scene = MOTION_SCENES[sceneIndex];
    document.body.dataset.activeScene = scene.id;
    const localProgress = clamp((currentProgress - scene.start) / (scene.end - scene.start), 0, 1);
    const revealProgress = sceneIndex === 0 ? 1 : clamp(localProgress / 0.32, 0, 1);
    story?.style.setProperty('--reveal-inset', `${(1 - revealProgress) * 100}%`);
    story?.style.setProperty('--story-progress', `${currentProgress * 100}%`);

    scenes.forEach((element, index) => {
      const range = MOTION_SCENES[index];
      const fade = 0.012;
      const enter = index === 0 ? 1 : clamp((currentProgress - range.start + fade) / (fade * 2), 0, 1);
      const leave = index === MOTION_SCENES.length - 1 ? 1 : clamp((range.end - currentProgress + fade) / (fade * 2), 0, 1);
      let opacity = Math.min(enter, leave);
      if (index === 0) opacity = clamp((0.12 - currentProgress) / 0.04, 0, 1);
      if (index === 1) opacity *= clamp((currentProgress - 0.22) / 0.035, 0, 1);
      if (index === 2) opacity *= clamp((currentProgress - 0.34) / 0.025, 0, 1);
      if (opacity > 0.001) element.setAttribute('data-visual-active', 'true');
      else element.removeAttribute('data-visual-active');
      element.style.opacity = String(opacity);
      const isCurrent = index === sceneIndex;
      if (element.getAttribute('aria-hidden') !== String(!isCurrent)) element.setAttribute('aria-hidden', String(!isCurrent));
      if (element.inert !== !isCurrent) element.inert = !isCurrent;
    });

    sceneLinks.forEach((link) => {
      if (link.dataset.jump === scene.id) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });

    if (metrics.progress) metrics.progress.textContent = `${Math.round(currentProgress * 100)}%`;
    if (metrics.scene) metrics.scene.textContent = `${scene.number} / ${scene.label}`;
    if (metrics.sceneName) metrics.sceneName.textContent = `${scene.number} / ${scene.label}`;
    if (metrics.progressBar) metrics.progressBar.style.width = `${currentProgress * 100}%`;
    activePhotoIndex = findActivePhoto(currentProgress);
    galleryCards.forEach((card, index) => card.classList.toggle('is-current', index === activePhotoIndex));
    galleryLinks.forEach((link, index) => link.classList.toggle('is-current', index === activePhotoIndex));

    const webglGalleryEffect = ['fx06', 'fx14', 'fx17', 'fx22'].some((id) => effects.has(id));
    const shouldPrepareGallery = (currentProgress >= 0.38 && currentProgress <= 0.68 && webglGalleryEffect)
      || (currentProgress >= 0.88 && effects.has('fx21'))
      || (currentProgress >= 0.64 && currentProgress <= 0.78 && effects.has('fx14'));
    if (shouldPrepareGallery) void ensureWebgl();
    updateRendererVisibility();
    applyFrameStyles();
  }

  function findSceneIndex(value: number) {
    const index = MOTION_SCENES.findIndex((scene, sceneIndex) => value >= scene.start && (value < scene.end || sceneIndex === MOTION_SCENES.length - 1));
    return Math.max(0, index);
  }

  function findActivePhoto(value: number) {
    return Math.round(galleryCursor(value, projects.length));
  }

  // The DOM fallback and WebGL share this measured view. Pixel geometry is
  // derived from the photograph that is actually on screen, including mobile.
  function galleryView() {
    const frame = heroArt.getBoundingClientRect();
    const host = canvasHost.getBoundingClientRect();
    const unitsPerPixel = 3.72 / Math.max(1, frame.height);
    const distance = host.height * unitsPerPixel / (2*Math.tan(35*Math.PI/360));
    const cursor = galleryCursor(currentProgress, projects.length);
    const segment = Math.floor(cursor);
    const next = Math.min(projects.length-1, segment+1);
    const t = cursor-segment;
    const firstX = (frame.left+frame.width/2-host.left-host.width/2)*unitsPerPixel;
    const firstY = (host.top+host.height/2-frame.top-frame.height/2)*unitsPerPixel;
    const cameraX = galleryX(segment)+(galleryX(next)-galleryX(segment))*t;
    const cameraZ = distance-cursor*7;
    const pointerWeight = smooth((currentProgress-.465)/.025);
    return {frame,host,unitsPerPixel,distance,cursor,firstX,firstY,
      cameraX:cameraX+pointerX*.045*pointerWeight,
      cameraY:pointerY*.035*pointerWeight,cameraZ};
  }

  function galleryHasFrame() {
    return galleryFrameReady && renderedPhotoIndex === activePhotoIndex && photoTextures.has(activePhotoIndex) && shouldUseWebgl();
  }

  function updateDomGallery() {
    if (!domGallery) return;
    const view = galleryView();
    const visible = currentProgress >= .43 && currentProgress <= .66;
    const glFrame=galleryHasFrame();
    const galleryAlpha=visible?smooth((currentProgress-.43)/.035)*(1-smooth((currentProgress-.64)/.02)):0;
    domGallery.style.opacity = String(visible ? glFrame ? 1-galleryAlpha : galleryAlpha : 0);
    domGallery.inert = !visible || (glFrame && galleryAlpha>.5);
    domGallery.setAttribute('aria-hidden', String(domGallery.inert));
    domWorks.forEach((work,index) => {
      const depth = view.cameraZ+index*7;
      const scale = view.distance / Math.max(.3,depth);
      const x = view.host.width/2+(view.firstX+galleryX(index)-view.cameraX)/view.unitsPerPixel*scale;
      const y = view.host.height/2-(view.firstY-view.cameraY)/view.unitsPerPixel*scale;
      work.style.width = `${view.frame.width*scale}px`;
      work.style.height = `${view.frame.height*scale}px`;
      work.style.left = `${x}px`;
      work.style.top = `${y}px`;
      work.style.zIndex = String(projects.length-index);
      work.style.visibility = depth > .3 ? 'visible' : 'hidden';
      work.style.pointerEvents = index === activePhotoIndex ? 'auto' : 'none';
      const image=work.querySelector<HTMLImageElement>('img');
      if(image)image.style.objectPosition=index===0?'center 42%':'center 50%';
      work.inert = index !== activePhotoIndex;
    });
  }

  function colorAtProgress(value: number) {
    const scaled = clamp(value, 0, 0.9999) * (SCENE_COLORS.length - 1);
    const index = Math.floor(scaled);
    const amount = scaled - index;
    const start = Number.parseInt(SCENE_COLORS[index].slice(1), 16);
    const end = Number.parseInt(SCENE_COLORS[index + 1].slice(1), 16);
    const r = Math.round(((start >> 16) * (1 - amount)) + ((end >> 16) * amount));
    const g = Math.round((((start >> 8) & 255) * (1 - amount)) + (((end >> 8) & 255) * amount));
    const b = Math.round(((start & 255) * (1 - amount)) + ((end & 255) * amount));
    return `rgb(${r} ${g} ${b})`;
  }

  function jumpToScene(id: string, updateHash = true, immediate = false) {
    const index = SCROLL_SCENE_INDEX.get(id);
    if (index === undefined || mode === 'static') return;
    const range = MOTION_SCENES[index];
    const readingPoints = [0.04, 0.27, 0.395, 0.515, 0.705, 0.85, 0.96];
    const midpoint = readingPoints[index] ?? (range.start + range.end) / 2;
    const start = story.getBoundingClientRect().top + window.scrollY;
    const distance = Math.max(1, story.offsetHeight - stage.offsetHeight);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: start + distance * midpoint, behavior: immediate || reduceMotion ? 'auto' : 'smooth' });
    if (updateHash) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#scene-${id}`);
  }

  function onSceneJump(event: Event) {
    const link = event.currentTarget as HTMLAnchorElement;
    const id = link.dataset.jump;
    if (!id || mode === 'static') return;
    event.preventDefault();
    jumpToScene(id);
  }

  function shouldUseWebgl() {
    return mode !== 'static' && mode !== 'lite' && ['fx06', 'fx14', 'fx17', 'fx21', 'fx22'].some((id) => effects.has(id));
  }

  async function ensureWebgl() {
    if (!shouldUseWebgl() || galleryInitialized || galleryLoading || galleryFailed || destroyed) return;
    galleryLoading = true;
    const token = generation;
    if (metrics.webglStatus) metrics.webglStatus.textContent = '正在建立單一 WebGL 展廊…';

    try {
      let importTimer: ReturnType<typeof setTimeout> | undefined;
      const THREE_RUNTIME = await Promise.race([
        import('three'),
        new Promise<never>((_resolve, reject) => { importTimer = setTimeout(() => reject(new Error('WebGL initialization timed out')), 12000); }),
      ]).finally(() => clearTimeout(importTimer));
      if (token !== generation || destroyed || !canvas) return;
      ThreeRuntime = THREE_RUNTIME;
      createWebglScene(THREE_RUNTIME);
      galleryInitialized = true;
      galleryFailed = false;
      document.body.classList.add('has-webgl');
      const fallback = document.querySelector<HTMLElement>('[data-gallery-fallback]');
      if (fallback) {
        fallback.inert = true;
        fallback.setAttribute('aria-hidden', 'true');
      }
      if (metrics.webglStatus) metrics.webglStatus.textContent = '3D 展廊已就緒；作品影像依捲動逐張載入。';
      updateRendererVisibility();
      updateCanvasMetric();
    } catch (error) {
      galleryFailed = true;
      galleryInitialized = false;
      document.body.classList.remove('has-webgl');
      const fallback = document.querySelector<HTMLElement>('[data-gallery-fallback]');
      if (fallback) {
        fallback.inert = false;
        fallback.removeAttribute('aria-hidden');
      }
      if (metrics.webglStatus) metrics.webglStatus.textContent = 'WebGL 無法啟動；保留六組可點作品卡片。';
      if (metrics.devLight) metrics.devLight.classList.add('is-warning');
      console.warn('Motion Lab WebGL fallback:', error);
      disposeWebgl(false);
    } finally {
      galleryLoading = false;
      updateCanvasMetric();
    }
  }

  function createWebglScene(THREE_RUNTIME: typeof import('three')) {
    if (!canvas) throw new Error('Motion Lab canvas is missing.');
    const renderer = new THREE_RUNTIME.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false,
    });
    webglRenderer = renderer;
    renderer.setPixelRatio(effectiveDpr());
    renderer.setSize(Math.max(1, canvasHost.clientWidth), Math.max(1, canvasHost.clientHeight), false);
    renderer.outputColorSpace = THREE_RUNTIME.SRGBColorSpace;
    renderer.toneMapping = THREE_RUNTIME.ACESFilmicToneMapping;
    renderer.toneMappingExposure = exposure;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE_RUNTIME.Scene();
    const camera = new THREE_RUNTIME.PerspectiveCamera(35, Math.max(0.5, canvasHost.clientWidth / Math.max(1, canvasHost.clientHeight)), 0.1, 100);
    camera.position.set(0, 0.05, 9.2);
    webglScene = scene;
    webglCamera = camera;
    const group = new THREE_RUNTIME.Group();
    scene.add(group);
    webglGroup = group;
    photoGeometry = new THREE_RUNTIME.PlaneGeometry(2.55, 3.72);
    photoMeshes = [];
    photoMaterials = [];
    photoTextures = new Map();
    pendingTextures = new Set();
    const materialShader = {
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform vec2 uTexelSize;
        uniform vec2 uUvScale;
        uniform vec2 uUvOffset;
        uniform float uBlur;
        uniform float uLoaded;
        uniform float uDissolve;
        uniform float uSpot;
        uniform vec2 uPointer;
        varying vec2 vUv;
        void main() {
          if (uLoaded < 0.5) { gl_FragColor = vec4(0.91, 0.96, 0.99, 1.0); return; }
          float grain = fract(sin(dot(floor(vUv * 180.0), vec2(12.9898, 78.233))) * 43758.5453);
          if (grain < uDissolve) discard;
          vec4 color;
          vec2 imageUv = (vUv - 0.5) * uUvScale + 0.5 + uUvOffset;
          if (uBlur < 0.5) {
            color = texture2D(uMap, imageUv);
          } else {
            vec2 offset = uTexelSize * uBlur;
            color = texture2D(uMap, imageUv) * 0.4;
            color += texture2D(uMap, imageUv + vec2(offset.x, 0.0)) * 0.15;
            color += texture2D(uMap, imageUv - vec2(offset.x, 0.0)) * 0.15;
            color += texture2D(uMap, imageUv + vec2(0.0, offset.y)) * 0.15;
            color += texture2D(uMap, imageUv - vec2(0.0, offset.y)) * 0.15;
          }
          float spot = max(0.0, 1.0 - distance(vUv, uPointer) * 1.7);
          gl_FragColor = vec4(color.rgb + vec3(0.032, 0.045, 0.055) * spot * uSpot, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    };

    projects.forEach((_, index) => {
      const material = new THREE_RUNTIME.ShaderMaterial({
        uniforms: {
          uMap: { value: null },
          uTexelSize: { value: new THREE_RUNTIME.Vector2(1 / 384, 1 / 576) },
          uUvScale: { value: new THREE_RUNTIME.Vector2(1, 1) },
          uUvOffset: { value: new THREE_RUNTIME.Vector2(0, 0) },
          uBlur: { value: 0 },
          uLoaded: { value: 0 },
          uDissolve: { value: 0 },
          uSpot: { value: 0 },
          uPointer: { value: new THREE_RUNTIME.Vector2(0.5, 0.5) },
        },
        vertexShader: materialShader.vertexShader,
        fragmentShader: materialShader.fragmentShader,
      });
      const mesh = new THREE_RUNTIME.Mesh(photoGeometry as THREE.PlaneGeometry, material);
      mesh.userData.projectIndex = index;
      mesh.userData.spherePosition = spherePoint(THREE_RUNTIME, index, projects.length, 4.35);
      group.add(mesh);
      photoMaterials.push(material);
      photoMeshes.push(mesh);
    });

    const ringGeometry = new THREE_RUNTIME.TorusGeometry(1.8, 0.012, 8, 96);
    const ringMaterial = new THREE_RUNTIME.MeshBasicMaterial({ color: 0x63badf, transparent: true, opacity: 0.7 });
    aperture = new THREE_RUNTIME.Mesh(ringGeometry, ringMaterial);
    aperture.position.set(0, 0, 1.1);
    aperture.rotation.x = Math.PI * 0.32;
    aperture.visible = false;
    scene.add(aperture);

    const particleGeometry = new THREE_RUNTIME.BufferGeometry();
    const positions = new Float32Array(Math.max(1, particleCount) * 3);
    seedParticlePositions(positions, 4.2);
    particleGeometry.setAttribute('position', new THREE_RUNTIME.BufferAttribute(positions, 3));
    const particleMaterial = new THREE_RUNTIME.PointsMaterial({
      color: 0x63badf,
      size: 1.7,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: false,
    });
    particlePoints = new THREE_RUNTIME.Points(particleGeometry, particleMaterial);
    particlePoints.visible = false;
    scene.add(particlePoints);

    canvas.addEventListener('webglcontextlost', onWebglContextLost, { once: true });
    resizeObserver = new ResizeObserver(resizeWebgl);
    resizeObserver.observe(canvasHost);
    loadNeighborTextures(0);
    updateGalleryScene(currentProgress, window.matchMedia('(max-width: 767px)').matches);
    resizeWebgl();
    renderer.render(scene, camera);
    updateAssetsMetric();
  }

  function spherePoint(THREE_RUNTIME: typeof import('three'), index: number, count: number, radius: number) {
    const phi = Math.acos(1 - (2 * (index + 0.5)) / count);
    const theta = Math.PI * (1 + Math.sqrt(5)) * index;
    return new THREE_RUNTIME.Vector3(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta),
    );
  }

  function seedParticlePositions(positions: Float32Array, radius: number) {
    let seed = 1789;
    const random = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    for (let index = 0; index < positions.length; index += 3) {
      positions[index] = (random() - 0.5) * radius * 2;
      positions[index + 1] = (random() - 0.5) * radius * 2;
      positions[index + 2] = (random() - 0.5) * radius * 1.2;
    }
  }

  function loadNeighborTextures(focusIndex: number) {
    if (!webglRenderer || !canvas || !ThreeRuntime) return;
    const token = webglGeneration;
    const loader = new ThreeRuntime.TextureLoader();
    for (let index = Math.max(0, focusIndex - 1); index <= Math.min(projects.length - 1, focusIndex + 1); index++) {
      if (photoTextures.has(index) || pendingTextures.has(index)) continue;
      pendingTextures.add(index);
      textureTimers.set(index, setTimeout(() => {
        if (token !== webglGeneration || destroyed) return;
        galleryFailed = true;
        if (metrics.webglStatus) metrics.webglStatus.textContent = '作品圖載入逾時；已保留 CSS 作品列。';
        disposeWebgl(false);
      }, 12000));
      loader.load(projects[index].image, (texture) => {
        if (token !== webglGeneration || destroyed) { texture.dispose(); return; }
        clearTimeout(textureTimers.get(index));
        textureTimers.delete(index);
        pendingTextures.delete(index);
        if (!webglRenderer || !photoMaterials[index]) {
          texture.dispose();
          return;
        }
        texture.colorSpace = ThreeRuntime?.SRGBColorSpace ?? 'srgb';
        texture.anisotropy = Math.min(4, webglRenderer.capabilities.getMaxAnisotropy());
        photoTextures.set(index, texture);
        const material = photoMaterials[index];
        const imageAspect = Math.max(1, texture.image?.width ?? 960) / Math.max(1, texture.image?.height ?? 1440);
        const planeAspect = heroArt.offsetWidth / Math.max(1, heroArt.offsetHeight);
        const crop = coverUv(imageAspect,planeAspect,index===0?.42:.5);
        material.uniforms.uUvScale.value.set(crop.x,crop.y);
        material.uniforms.uUvOffset.value.set(crop.offsetX,crop.offsetY);
        material.uniforms.uMap.value = texture;
        material.uniforms.uTexelSize.value.set(1 / Math.max(1, texture.image?.width ?? 384), 1 / Math.max(1, texture.image?.height ?? 576));
        material.uniforms.uLoaded.value = 1;
        material.needsUpdate = true;
        if(index===0){
          updateGalleryScene(currentProgress,window.matchMedia('(max-width: 767px)').matches);
          webglRenderer.render(webglScene!,webglCamera!);
          galleryFrameReady=true;
          renderedPhotoIndex=0;
        }
        updateAssetsMetric();
        if (metrics.webglStatus) metrics.webglStatus.textContent = `3D 展廊已載入 ${photoTextures.size} / ${projects.length} 張作品圖。`;
        updateDomGallery();
        applyFrameStyles();
      }, undefined, (error) => {
        if (token !== webglGeneration || destroyed) return;
        clearTimeout(textureTimers.get(index));
        textureTimers.delete(index);
        pendingTextures.delete(index);
        galleryFailed = true;
        if (metrics.webglStatus) metrics.webglStatus.textContent = '作品圖無法完整載入；切回可點擊的 CSS 作品列。';
        console.warn(`Motion Lab image load failed: ${projects[index].image}`, error);
        if (metrics.devLight) metrics.devLight.classList.add('is-warning');
        document.body.classList.remove('has-webgl');
        if (canvas) canvas.style.opacity = '0';
        const fallback = document.querySelector<HTMLElement>('[data-gallery-fallback]');
        if (fallback) {
          fallback.inert = false;
          fallback.removeAttribute('aria-hidden');
        }
        disposeWebgl(false);
      });
    }
  }

  function updateGalleryScene(value: number, isMobile: boolean) {
    if (!webglRenderer || !webglCamera || !webglGroup || !webglScene) return;
    const focus = findActivePhoto(value);
    activePhotoIndex = focus;
    loadNeighborTextures(focus);
    const view=galleryView();
    webglCamera.position.set(view.cameraX,view.cameraY,view.cameraZ);
    webglCamera.lookAt(view.cameraX,view.cameraY,view.cameraZ-1);
    photoMeshes.forEach((mesh,index)=>{
      mesh.position.set(view.firstX+galleryX(index),view.firstY,-index*7);
      mesh.rotation.set(0,0,0);
      mesh.scale.set(1,1,1);
      mesh.scale.x=(view.frame.width/view.frame.height)/(2.55/3.72);
      mesh.visible=photoTextures.has(index)&&mesh.position.z<view.cameraZ-.3;
      const material=photoMaterials[index];
      material.uniforms.uBlur.value=effects.has('fx17')?Math.min(2,Math.abs(index-view.cursor)*.6):0;
      material.uniforms.uDissolve.value=0;
      material.uniforms.uSpot.value=effects.has('fx10')?.4:0;
    });

    if (aperture) {
      const ringProgress = clamp((value - 0.9) / 0.1, 0, 1);
      aperture.visible = effects.has('fx21') && value >= 0.88;
      aperture.scale.setScalar(effects.has('fx21') ? 0.6 + ringProgress * 0.6 : 0.6);
      aperture.rotation.z = ringProgress * Math.PI * 0.28;
      const ringMaterial = aperture.material as THREE.MeshBasicMaterial;
      ringMaterial.opacity = effects.has('fx21') ? 0.48 - ringProgress * 0.18 : 0;
    }

    if (particlePoints) {
      const transition = clamp((value - 0.64) / (0.77 - 0.64), 0, 1);
      particlePoints.visible = particleCount > 0 && effects.has('fx14') && transition > 0.02 && transition < 0.98;
      const particleMaterial = particlePoints.material as THREE.PointsMaterial;
      particleMaterial.opacity = particlePoints.visible ? Math.sin(transition * Math.PI) * 0.45 : 0;
      particlePoints.rotation.y = transition * 0.35;
      particlePoints.rotation.z = transition * -0.12;
    }

    const lowResolution = effects.has('fx17') && value >= 0.43 && value <= 0.77;
    const targetDpr = effectiveDpr(lowResolution);
    if (webglRenderer.getPixelRatio() !== targetDpr) webglRenderer.setPixelRatio(targetDpr);
    webglRenderer.toneMappingExposure = exposure;
    updateRendererVisibility();
  }

  function effectiveDpr(halfResolution = false) {
    const hardwareCap = window.matchMedia('(max-width: 767px)').matches ? 1 : 2;
    const qualityFactor = mode === 'max' && maxQualityTier >= 1 ? 0.8 : 1;
    const selected = Math.min(dpr, window.devicePixelRatio || 1, hardwareCap) * qualityFactor;
    return halfResolution ? Math.max(0.5, selected * 0.5) : selected;
  }

  function resizeWebgl() {
    if (!webglRenderer || !webglCamera) return;
    const width = Math.max(1, canvasHost.clientWidth);
    const height = Math.max(1, canvasHost.clientHeight);
    webglCamera.aspect = width / height;
    webglCamera.updateProjectionMatrix();
    webglRenderer.setSize(width, height, false);
  }

  function renderTick(_time: number, deltaTime: number) {
    if (destroyed || mode === 'static' || document.visibilityState === 'hidden') return;
    const delta = Number.isFinite(deltaTime) && deltaTime > 0 ? deltaTime : 16.67;
    frameTimes.push(delta);
    if (frameTimes.length > 120) frameTimes.shift();
    framesSinceSample++;
    const now = performance.now();
    const nextVelocity = timeline?.scrollTrigger?.getVelocity() ?? 0;
    if (effects.has('fx15') && nextVelocity !== scrollVelocity) {
      scrollVelocity = nextVelocity;
      applyFrameStyles();
    }
    if (now - lastFpsSample >= 350) {
      const sorted = [...frameTimes].sort((left, right) => left - right);
      const p50 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.5))] ?? delta;
      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? delta;
      const average = frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length;
      const fps = Math.round(framesSinceSample * 1000 / Math.max(1, now - lastFpsSample));
      updateFrameMetric(`${fps} fps / ${p50.toFixed(1)} ms p50 · ${p95.toFixed(1)} ms p95`);
      framesSinceSample = 0;
      lastFpsSample = now;
      updateMemoryMetric();
      updateAssetsMetric();
      adaptMaxQuality(average, now);
    }

    if (webglRenderer && webglScene && webglCamera && galleryInView) {
      const photoChanged=renderedPhotoIndex !== activePhotoIndex;
      webglRenderer.render(webglScene, webglCamera);
      if(photoChanged){
        renderedPhotoIndex = activePhotoIndex;
        updateDomGallery();
        updateRendererVisibility();
      }
    }
  }

  function adaptMaxQuality(averageFrameTime: number, now: number) {
    if (mode !== 'max' || lockModeInput?.checked) {
      maxSlowSince = 0;
      return;
    }
    if (averageFrameTime <= 25) {
      maxSlowSince = 0;
      return;
    }
    if (!maxSlowSince) maxSlowSince = now;
    if (now - maxSlowSince < 3000 || maxQualityTier >= 3) return;

    maxQualityTier++;
    maxSlowSince = now;
    if (maxQualityTier === 1) {
      if (webglRenderer) {
        webglRenderer.setPixelRatio(effectiveDpr());
        resizeWebgl();
      }
      setFeedback('Max 效能保護：已降低 WebGL DPR 約 20%。');
      return;
    }
    if (maxQualityTier === 2) {
      effects.delete('fx14');
      effects.delete('fx17');
      updateControls();
      updateProgress(currentProgress, scrollVelocity);
      setFeedback('Max 效能保護：已停用高負載粒子與散景。');
      return;
    }

    mode = 'lite';
    effects = sanitizeEffects(new Set(MOTION_MODES.lite.effects), mode);
    modeSelect.value = mode;
    startMode(mode);
    setFeedback('Max 效能保護：連續超過 25 ms 三秒，已切換 Lite。');
  }

  function updateRendererVisibility() {
    const galleryWindow = currentProgress >= 0.43 && currentProgress <= 0.66 && (effects.has('fx06') || effects.has('fx17') || effects.has('fx22'));
    const particleWindow = currentProgress >= 0.64 && currentProgress <= 0.78 && effects.has('fx14');
    const ringWindow = currentProgress >= 0.88 && currentProgress <= 1 && effects.has('fx21');
    galleryInView = galleryWindow || particleWindow || ringWindow;
    if (canvas) canvas.style.opacity = webglRenderer && galleryInView && galleryHasFrame() ? String(galleryWindow ? smooth((currentProgress-.43)/.035)*(1-smooth((currentProgress-.64)/.02)) : .78) : '0';
    if (metrics.canvas) metrics.canvas.textContent = webglRenderer && galleryInView ? '1 / 1' : '0 / 1';
  }

  function onWebglContextLost(event: Event) {
    event.preventDefault();
    galleryFailed = true;
    if (metrics.webglStatus) metrics.webglStatus.textContent = 'WebGL context 遺失；切回 CSS 作品列，故事與 CTA 仍可用。';
    if (metrics.devLight) metrics.devLight.classList.add('is-warning');
    disposeWebgl(false);
  }

  function disposeWebgl(replaceCanvas = true) {
    webglGeneration++;
    textureTimers.forEach((timer) => clearTimeout(timer));
    textureTimers.clear();
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    galleryInitialized = false;
    galleryInView = false;
    galleryFrameReady = false;
    renderedPhotoIndex = -1;
    pendingTextures.clear();
    photoTextures.forEach((texture) => texture.dispose());
    photoTextures.clear();
    photoMeshes = [];
    photoMaterials.forEach((material) => material.dispose());
    photoMaterials = [];
    photoGeometry?.dispose();
    photoGeometry = undefined;
    if (particlePoints) {
      particlePoints.geometry.dispose();
      (particlePoints.material as THREE.Material).dispose();
      particlePoints = undefined;
    }
    if (aperture) {
      aperture.geometry.dispose();
      (aperture.material as THREE.Material).dispose();
      aperture = undefined;
    }
    webglGroup?.clear();
    webglScene?.clear();
    webglGroup = undefined;
    webglScene = undefined;
    webglCamera = undefined;
    if (webglRenderer) {
      webglRenderer.dispose();
      webglRenderer.forceContextLoss();
      webglRenderer = undefined;
    }
    document.body.classList.remove('has-webgl');
    if (canvas) {
      canvas.style.opacity = '0';
      canvas.removeEventListener('webglcontextlost', onWebglContextLost);
      if (replaceCanvas && canvas.parentElement) {
        const freshCanvas = canvas.cloneNode(false) as HTMLCanvasElement;
        freshCanvas.removeAttribute('width');
        freshCanvas.removeAttribute('height');
        canvas.replaceWith(freshCanvas);
        canvas = freshCanvas;
      }
    }
    const fallback = document.querySelector<HTMLElement>('[data-gallery-fallback]');
    if (fallback) {
      fallback.inert = false;
      fallback.removeAttribute('aria-hidden');
    }
    updateCanvasMetric();
  }

  function updateFrameMetric(value: string) {
    if (metrics.frame) metrics.frame.textContent = value;
  }

  function updateCanvasMetric() {
    if (!metrics.canvas) return;
    metrics.canvas.textContent = webglRenderer && galleryInView ? '1 / 1' : '0 / 1';
  }

  function updateAssetsMetric() {
    if (!metrics.assets) return;
    const images = new Set(Array.from(document.images)
      .filter((image) => image.complete && image.naturalWidth > 0)
      .map((image) => image.currentSrc || image.src));
    photoTextures.forEach((_texture, index) => images.add(projects[index].image));
    metrics.assets.textContent = `${images.size}`;
  }

  function updateMemoryMetric() {
    const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
    if (!metrics.memory) return;
    metrics.memory.textContent = typeof memory?.usedJSHeapSize === 'number'
      ? `${(memory.usedJSHeapSize / 1024 / 1024).toFixed(1)} MB JS`
      : 'API 不支援';
  }

  function onPointerMove(event: PointerEvent) {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    pointerX = clamp((event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2, -1, 1);
    pointerY = clamp((event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2, -1, 1);
    stage.style.setProperty('--pointer-client-x', `${event.clientX}px`);
    stage.style.setProperty('--pointer-client-y', `${event.clientY}px`);

    if (customCursor && effects.has('fx07')) {
      gsap.set(customCursor, { x: event.clientX, y: event.clientY });
      gsap.to(customCursor.querySelector('span'), { x: pointerX * 3, y: pointerY * 3, duration: 0.08, overwrite: true });
    }

    if (effects.has('fx09') || effects.has('fx10')) {
      galleryCards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
        const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
        if (effects.has('fx09')) {
          card.style.setProperty('--card-tilt-x', `${clamp(-y * 4, -4, 4)}deg`);
          card.style.setProperty('--card-tilt-y', `${clamp(x * 4, -4, 4)}deg`);
        }
        card.style.setProperty('--spot-x', `${clamp(x * 50 + 50, 0, 100)}%`);
        card.style.setProperty('--spot-y', `${clamp(y * 50 + 50, 0, 100)}%`);
      });
    }

    if (webglRenderer && (effects.has('fx06') || effects.has('fx22'))) updateGalleryScene(currentProgress, window.matchMedia('(max-width: 767px)').matches);
    if (effects.has('fx02')) applyFrameStyles();
  }

  function onMagneticMove(event: PointerEvent) {
    if (!effects.has('fx08') || !window.matchMedia('(pointer: fine)').matches) return;
    const cta = event.currentTarget as HTMLElement;
    const rect = cta.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left - rect.width / 2) * 0.18, -8, 8);
    const y = clamp((event.clientY - rect.top - rect.height / 2) * 0.18, -8, 8);
    cta.querySelectorAll<HTMLElement>(':scope > span, :scope > i').forEach((part, index) => {
      gsap.to(part, { x: x * (index === 0 ? 1 : 0.65), y: y * (index === 0 ? 1 : 0.65), duration: 0.16, overwrite: true });
    });
  }

  function resetMagnetic(event: PointerEvent) {
    const cta = event.currentTarget as HTMLElement;
    cta.querySelectorAll<HTMLElement>(':scope > span, :scope > i').forEach((part) => {
      gsap.to(part, { x: 0, y: 0, duration: 0.26, ease: 'power2.out', overwrite: true });
    });
  }

  function makeTrail(event: PointerEvent) {
    if (!effects.has('fx11') || !trailLayer || !window.matchMedia('(pointer: fine)').matches) return;
    const now = performance.now();
    if (previousTrailPoint && Math.hypot(event.clientX - previousTrailPoint.x, event.clientY - previousTrailPoint.y) < 80 && now - previousTrailPoint.time < 100) return;
    previousTrailPoint = { x: event.clientX, y: event.clientY, time: now };
    const image = document.createElement('img');
    image.className = 'trail-image';
    image.src = heroArt.dataset.assetSrc ?? '';
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    image.style.left = `${event.clientX}px`;
    image.style.top = `${event.clientY}px`;
    trailLayer.append(image);
    while (trailLayer.children.length > 4) trailLayer.firstElementChild?.remove();
    gsap.fromTo(image, { xPercent: -50, yPercent: -50, opacity: 0.6, scale: 0.94 }, {
      opacity: 0,
      scale: 0.86,
      duration: 0.5,
      overwrite: true,
      onComplete: () => image.remove(),
    });
  }

  function onDprChange() {
    dpr = Number(dprInput?.value ?? 1.5);
    updateRenderParameters();
    resizeWebgl();
    saveSettings();
  }

  function onSubjectXChange() {
    subjectX = Number(subjectXInput?.value ?? 1);
    updateRenderParameters();
    applyFrameStyles();
    saveSettings();
  }

  function onSubjectScaleChange() {
    subjectScale = Number(subjectScaleInput?.value ?? 1);
    updateRenderParameters();
    applyFrameStyles();
    saveSettings();
  }

  function onParallaxChange() {
    parallax = Number(parallaxInput?.value ?? 1);
    updateRenderParameters();
    applyFrameStyles();
    if (webglRenderer) updateGalleryScene(currentProgress, window.matchMedia('(max-width: 767px)').matches);
    saveSettings();
  }

  function onExposureChange() {
    exposure = Number(exposureInput?.value ?? 1);
    updateRenderParameters();
    if (webglRenderer) webglRenderer.toneMappingExposure = exposure;
    saveSettings();
  }

  function onChromaticChange() {
    chromatic = Number(chromaticInput?.value ?? 1);
    updateRenderParameters();
    applyFrameStyles();
    saveSettings();
  }

  function onParticlesChange() {
    particleCount = Number(particlesInput?.value ?? 2000);
    updateRenderParameters();
    if (particlePoints && webglScene && ThreeRuntime) {
      webglScene.remove(particlePoints);
      particlePoints.geometry.dispose();
      const positions = new Float32Array(Math.max(1, particleCount) * 3);
      seedParticlePositions(positions, 4.2);
      const geometry = new ThreeRuntime.BufferGeometry();
      geometry.setAttribute('position', new ThreeRuntime.BufferAttribute(positions, 3));
      particlePoints.geometry = geometry;
      webglScene.add(particlePoints);
    } else if (particleCount > 0 && effects.has('fx14') && currentProgress > 0.38) {
      void ensureWebgl();
    }
    saveSettings();
  }

  function onLockModeChange() {
    if (lockModeInput?.checked) {
      maxSlowSince = 0;
      setFeedback('模式已鎖定；效能量測期間不會自動降級。');
    } else {
      setFeedback('已解除模式鎖定。');
    }
    updateControls();
  }

  function onDebugChange() {
    document.body.classList.toggle('is-debug', Boolean(debugInput?.checked));
  }

  function updateRenderParameters() {
    if (metrics.subjectXValue) metrics.subjectXValue.textContent = `${subjectX.toFixed(2)}×`;
    if (metrics.subjectScaleValue) metrics.subjectScaleValue.textContent = `${subjectScale.toFixed(2)}×`;
    if (metrics.parallaxValue) metrics.parallaxValue.textContent = `${parallax.toFixed(2)}×`;
    if (metrics.dprValue) metrics.dprValue.textContent = dpr.toFixed(2);
    if (metrics.exposureValue) metrics.exposureValue.textContent = exposure.toFixed(2);
    if (metrics.chromaticValue) metrics.chromaticValue.textContent = `${chromatic.toFixed(2)} px`;
    if (metrics.particleValue) metrics.particleValue.textContent = `${particleCount}`;
    if (dprInput) dprInput.value = String(dpr);
    if (webglRenderer) webglRenderer.setPixelRatio(effectiveDpr(effects.has('fx17') && currentProgress >= 0.43 && currentProgress <= 0.77));
  }

  async function onCopySettings() {
    const share = new URL(window.location.pathname, window.location.origin);
    share.searchParams.set('mode', mode);
    if (effects.size) share.searchParams.set('fx', [...effects].sort().join(','));
    share.searchParams.set('x', String(subjectX));
    share.searchParams.set('scale', String(subjectScale));
    share.searchParams.set('parallax', String(parallax));
    share.searchParams.set('dpr', String(dpr));
    share.searchParams.set('exposure', String(exposure));
    share.searchParams.set('chromatic', String(chromatic));
    share.searchParams.set('particles', String(particleCount));
    try {
      await navigator.clipboard.writeText(share.href);
      setFeedback('已複製只含視覺參數的設定網址。');
    } catch {
      setFeedback(share.href);
    }
  }

  function onReset() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Reset still works when storage is disabled.
    }
    const cleanUrl = new URL(window.location.pathname, window.location.origin);
    window.location.replace(cleanUrl.href);
  }

  function teardown() {
    if (destroyed) return;
    destroyed = true;
    clearTimeout(layoutTimer);
    generation++;
    modeContext?.revert();
    modeContext = undefined;
    gsap.ticker.remove(renderTick);
    disposeWebgl();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointermove', makeTrail);
    modeSelect.removeEventListener('change', onModeChange);
    fxInputs.forEach((input) => input.removeEventListener('change', onFxChange));
    sceneLinks.forEach((link) => link.removeEventListener('click', onSceneJump));
    magneticCtas.forEach((cta) => {
      cta.removeEventListener('pointermove', onMagneticMove);
      cta.removeEventListener('pointerleave', resetMagnetic);
    });
    dprInput?.removeEventListener('input', onDprChange);
    subjectXInput?.removeEventListener('input', onSubjectXChange);
    subjectScaleInput?.removeEventListener('input', onSubjectScaleChange);
    parallaxInput?.removeEventListener('input', onParallaxChange);
    exposureInput?.removeEventListener('input', onExposureChange);
    chromaticInput?.removeEventListener('input', onChromaticChange);
    particlesInput?.removeEventListener('input', onParticlesChange);
    debugInput?.removeEventListener('change', onDebugChange);
    lockModeInput?.removeEventListener('change', onLockModeChange);
    document.querySelector('[data-reset]')?.removeEventListener('click', onReset);
    document.querySelector('[data-copy-settings]')?.removeEventListener('click', onCopySettings);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('astro:before-swap', teardown);
    window.removeEventListener('hashchange', onHashChange);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    document.body.classList.remove('is-enhanced', 'has-webgl', 'is-debug');
    delete document.body.dataset.motionInitialized;
  }
}
