// Keep the full heading in the DOM so typing never moves the surrounding layout.
export function createHeroTypewriter(hero: HTMLElement, reducedMotion: MediaQueryList) {
  const letters = [...hero.querySelectorAll<HTMLElement>('[data-hero-letter]')];
  let timer: number | undefined;
  const finish = () => {
    window.clearTimeout(timer);
    hero.dataset.heroCopy = 'complete';
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
      hero.dataset.heroCopy = 'waiting';
      if (reducedMotion.matches) finish();
    },
    start() {
      if (reducedMotion.matches || !letters.length) { finish(); return; }
      if (hero.dataset.heroCopy !== 'waiting') return;
      hero.dataset.heroCopy = 'typing';
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
