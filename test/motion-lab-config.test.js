import test from 'node:test';
import assert from 'node:assert/strict';
import { FX_DEFINITIONS, MOTION_MODES, MOTION_SCENES } from '../src/lib/motion-lab-config.js';

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
