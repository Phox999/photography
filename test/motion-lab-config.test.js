import test from 'node:test';
import assert from 'node:assert/strict';
import { FX_DEFINITIONS, MOTION_MODES, MOTION_SCENES } from '../src/lib/motion-lab-config.js';
import { coverUv, galleryCardDepth, galleryCameraZ, galleryCursor, galleryX, layerState } from '../src/lib/motion-story-state.js';

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

  assert.ok(!MOTION_MODES.cinematic.effects.includes('fx13'), 'Cinematic keeps the liquid transition disabled');
  assert.ok(!MOTION_MODES.max.effects.includes('fx13'), 'Max does not enable experimental liquid by default');
  assert.deepEqual(FX_DEFINITIONS.find((effect) => effect.id === 'fx13')?.modes, ['max']);
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
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => galleryX(i)), [0, 1.8, -1.8, 1.8, -1.8, 1.8]);
});

test('gallery camera passes the previous frame before it can crowd the next frame', () => {
  const distance = 12.9;
  const cursor = 1.35;
  assert.equal(galleryCameraZ(distance, cursor), distance - cursor * 12);
  assert.ok(galleryCardDepth(distance, cursor, 0) < 0, 'passed frames move behind the camera');
  assert.ok(galleryCardDepth(distance, cursor, 1) > 0, 'the approaching frame stays in front of the camera');
  assert.ok(galleryCardDepth(distance, cursor, 2) > galleryCardDepth(distance, cursor, 1));
});

test('hero reassembles before the photo frame contracts', () => {
  const opening = layerState(0);
  const early = layerState(.22);
  const atRejoin = layerState(.30);
  const rejoined = layerState(.355);
  const photo = layerState(.39);
  assert.equal(opening.subjectX, 1);
  assert.ok(early.subjectX < 0);
  assert.equal(early.background, 1);
  assert.ok(atRejoin.subjectX < 0);
  assert.equal(rejoined.subjectX, 0);
  assert.equal(rejoined.background, 1);
  assert.equal(rejoined.original, 0);
  assert.equal(photo.original, 1);
  assert.ok(photo.scale < 1);
});

test('cover UV crop offsets match CSS object-position and stay inside the source image', () => {
  const horizontalCrop = coverUv(1.5, .8, .42);
  assert.ok(horizontalCrop.x < 1);
  assert.equal(horizontalCrop.y, 1);
  assert.ok(Math.abs(horizontalCrop.offsetX - (1 - horizontalCrop.x) / 2) < 1e-9);
  assert.equal(horizontalCrop.offsetY, 0);

  const topCrop = coverUv(.8, 1.2, 0);
  const subjectCrop = coverUv(.8, 1.2, .42);
  const bottomCrop = coverUv(.8, 1.2, 1);
  assert.ok(Math.abs(topCrop.offsetY - (1 - topCrop.y)) < 1e-9);
  assert.ok(Math.abs(subjectCrop.offsetY - (1 - subjectCrop.y) * .58) < 1e-9);
  assert.equal(bottomCrop.offsetY, 0);

  for (const imageAspect of [.42, .67, 1, 1.5, 2.4]) {
    for (const frameAspect of [.48, .8, 1.2, 1.8]) {
      const crop = coverUv(imageAspect, frameAspect, .42);
      const minX = crop.offsetX;
      const maxX = crop.offsetX + crop.x;
      const minY = crop.offsetY;
      const maxY = crop.offsetY + crop.y;
      assert.ok(minX >= 0 && minY >= 0, `${imageAspect}:${frameAspect} starts inside source`);
      assert.ok(maxX <= 1 + 1e-9 && maxY <= 1 + 1e-9, `${imageAspect}:${frameAspect} ends inside source`);
    }
  }
});
