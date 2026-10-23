// One timeout, scheduled only after the previous asynchronous transition settles.
// Invalidating the generation also prevents a late decode from changing a paused hero.
export function createCarouselClock({ advance, canRun, schedule = setTimeout, cancel = clearTimeout, delay = 6500 }) {
  let timer;
  let generation = 0;
  let busy = false;
  let disposed = false;
  const clear = () => { if (timer !== undefined) cancel(timer); timer = undefined; };
  const queue = () => {
    clear();
    if (disposed || busy || !canRun()) return;
    timer = schedule(async () => {
      timer = undefined;
      if (disposed || !canRun()) return;
      busy = true;
      const ticket = generation;
      try { await advance(() => !disposed && ticket === generation && canRun()); }
      finally { busy = false; queue(); }
    }, delay);
  };
  return {
    sync() { generation++; queue(); },
    dispose() { disposed = true; generation++; clear(); },
  };
}
