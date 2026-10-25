// Keep the full copy in the DOM so typing never moves the surrounding layout.
export function createTypewriter(root: HTMLElement, reducedMotion: MediaQueryList, options: { letterSelector: string; stateAttribute: string }) {
  const letters = [...root.querySelectorAll<HTMLElement>(options.letterSelector)];
  let timer: number | undefined;
  const finish = () => {
    window.clearTimeout(timer);
    root.setAttribute(options.stateAttribute, 'complete');
    letters.forEach((letter) => letter.removeAttribute('data-current'));
  };
  return {
    finish,
    reset() {
      window.clearTimeout(timer);
      letters.forEach((letter) => {
        letter.removeAttribute('data-revealed');
        letter.removeAttribute('data-current');
      });
      root.setAttribute(options.stateAttribute, 'waiting');
      if (reducedMotion.matches) finish();
    },
    start() {
      if (reducedMotion.matches || !letters.length) { finish(); return; }
      if (root.getAttribute(options.stateAttribute) !== 'waiting') return;
      root.setAttribute(options.stateAttribute, 'typing');
      let index = 0;
      const typeNext = () => {
        letters[index - 1]?.removeAttribute('data-current');
        const letter = letters[index++];
        letter.setAttribute('data-revealed', '');
        letter.setAttribute('data-current', '');
        if (index === letters.length) { timer = window.setTimeout(finish, 650); return; }
        const nextLine = letters[index].parentElement !== letter.parentElement;
        timer = window.setTimeout(typeNext, nextLine ? 280 : 90);
      };
      typeNext();
    },
  };
}

export function createHeroTypewriter(hero: HTMLElement, reducedMotion: MediaQueryList) {
  return createTypewriter(hero, reducedMotion, { letterSelector: '[data-hero-letter]', stateAttribute: 'data-hero-copy' });
}
