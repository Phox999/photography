import test from 'node:test';
import assert from 'node:assert/strict';
import { FX_DEFINITIONS, MOTION_MODES, MOTION_SCENES } from '../src/lib/motion-lab-config.js';
import { coverUv, galleryCursor, galleryX, layerState } from '../src/lib/motion-story-state.js';

test('Motion Lab defines seven continuous scenes from 0 to 1', () => {
  assert.equal(MOTION_SCENES.length, 7);
  assert.equal(MOTION_SCENES[0].start, 0);
  assert.equal(MOTION_SCENES.at(-1).end, 1);

  for (let index = 1; index < MOTION_SCENES.length; index += 1) {
    assert.equal(MOTION_SCENES[index - 1].end, MOTION_SCENES[index].start);
  }
});

test('default motion modes only enable available effects', () => {
  const disabled = new Set(FX_DEFINITIONS.filter((effect) => effect.unavailable).map((effect) => effect.id));
  const known = new Set(FX_DEFINITIONS.map((effect) => effect.id));

  for (const [mode, settings] of Object.entries(MOTION_MODES)) {
    assert.equal(new Set(settings.effects).size, settings.effects.length, `${mode} has duplicate effects`);
    for (const id of settings.effects) {
      assert.ok(known.has(id), `${mode} includes unknown effect ${id}`);
      assert.ok(!disabled.has(id), `${mode} includes unavailable effect ${id}`);
    }
  }
});

test('motion presets do not include incompatible gallery, shader, or depth modes', () => {
  for (const [mode, settings] of Object.entries(MOTION_MODES)) {
    const effects = new Set(settings.effects);
    assert.ok(!(effects.has('fx06') && effects.has('fx22')), `${mode} enables two gallery layouts`);
    assert.ok(!(effects.has('fx13') && effects.has('fx14')), `${mode} enables both shader transitions`);
    assert.ok(!(effects.has('fx17') && ['fx13', 'fx14', 'fx16'].some((id) => effects.has(id))), `${mode} combines incompatible shader effects`);
  }
});

test('gallery progress advances through six depth stops and reverses continuously', () => {
  assert.equal(galleryCursor(.465), 0);
  assert.equal(galleryCursor(.64), 5);
  assert.ok(galleryCursor(.55) > 0 && galleryCursor(.55) < 5);
  for (let index = 0; index < 500; index += 1) {
    const a = galleryCursor(.465 + index / 500 * (.64 - .465));
    const b = galleryCursor(.465 + (index + 1) / 500 * (.64 - .465));
    assert.ok(b >= a, `cursor moved backwards at sample ${index}`);
  }
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => galleryX(i)), [0, 1.65, -1.65, 1.65, -1.65, 1.65]);
});

test('hero reassembles before the photo frame contracts', () => {
  const early = layerState(.22);
  const rejoined = layerState(.355);
  const photo = layerState(.39);
  assert.ok(early.subjectX < 0);
  assert.equal(rejoined.subjectX, 0);
  assert.equal(rejoined.background, 1);
  assert.equal(rejoined.original, 0);
  assert.equal(photo.original, 1);
  assert.ok(photo.scale < 1);
});

test('cover UV values retain crop offsets for the measured display frame', () => {
  const crop = coverUv(1.5, .8, .42);
  assert.ok(crop.x < 1);
  assert.equal(crop.y, 1);
  assert.ok(Math.abs(crop.offsetX - (1 - crop.x) / 2) < 1e-9);
  assert.equal(crop.offsetY, 0);
});
