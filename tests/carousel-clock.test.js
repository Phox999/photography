import test from 'node:test';
import assert from 'node:assert/strict';
import { createCarouselClock } from '../src/lib/carousel-clock.js';

function timers() {
  const pending = new Map();
  let id = 0;
  return {
    pending,
    schedule(fn) { pending.set(++id, fn); return id; },
    cancel(id) { pending.delete(id); },
    async tick() { const [id, fn] = pending.entries().next().value; pending.delete(id); await fn(); },
  };
}

test('repeated initialization/sync leaves only one next carousel tick', () => {
  const timer = timers();
  const clock = createCarouselClock({ ...timer, canRun: () => true, advance: async () => {} });
  clock.sync(); clock.sync(); clock.sync();
  assert.equal(timer.pending.size, 1);
  clock.dispose();
  assert.equal(timer.pending.size, 0);
});

test('slow decode cannot overlap, and a pause invalidates its result', async () => {
  const timer = timers();
  let run = true;
  let finish;
  let applied = 0;
  const clock = createCarouselClock({ ...timer, canRun: () => run, advance: async valid => {
    await new Promise(resolve => { finish = resolve; });
    if (valid()) applied++;
  } });
  clock.sync();
  const tick = timer.tick();
  clock.sync();
  assert.equal(timer.pending.size, 0);
  run = false; clock.sync(); finish(); await tick;
  assert.equal(applied, 0);
  assert.equal(timer.pending.size, 0);
  run = true; clock.sync();
  assert.equal(timer.pending.size, 1);
  clock.dispose();
});

test('destroyed carousel never queues again after a pending image completes', async () => {
  const timer = timers();
  let finish;
  let stillValid;
  const clock = createCarouselClock({ ...timer, canRun: () => true, advance: async valid => {
    await new Promise(resolve => { finish = resolve; }); stillValid = valid();
  } });
  clock.sync(); const tick = timer.tick(); clock.dispose(); finish(); await tick;
  assert.equal(stillValid, false);
  assert.equal(timer.pending.size, 0);
});

test('next dwell begins after the transition completes, and hidden state stops it', async () => {
  const timer = timers();
  let run = true;
  let calls = 0;
  const clock = createCarouselClock({ ...timer, canRun: () => run, advance: async () => { calls++; assert.equal(timer.pending.size, 0); } });
  clock.sync(); await timer.tick();
  assert.equal(calls, 1); assert.equal(timer.pending.size, 1);
  run = false; clock.sync(); assert.equal(timer.pending.size, 0);
  clock.dispose();
});
