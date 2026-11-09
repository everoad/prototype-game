import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRules } from '../src/sim/rules.js';
import { moraleDrainPerMinute, applyMoraleEvent } from '../src/sim/morale.js';
import { createWorld, step } from '../src/sim/world.js';
import { pick, bothAtZeroSameTick } from './helpers.mjs';

test('사기 깎임: 승점 차이 −3/분, 10분 뒤 기본 −5, 13분 뒤 ×2 (§7.2)', () => {
  const r = makeRules();
  assert.equal(moraleDrainPerMinute(60, 1, r), 3);
  assert.equal(moraleDrainPerMinute(60, 0, r), 0);
  assert.equal(moraleDrainPerMinute(600, 0, r), 5);
  assert.equal(moraleDrainPerMinute(13 * 60, 1, r), (3 + 5) * 2);
});

test('사건: 뒤 거점 −8, 본진을 잃으면 0이고 판이 끝난다', () => {
  const w = createWorld({ knobs: {}, seed: 1 });
  applyMoraleEvent(w, 0, 'loseRear');
  assert.equal(w.sides[0].morale, 52);
  applyMoraleEvent(w, 1, 'loseHq');
  assert.equal(w.sides[1].morale, 0);
  step(w);
  assert.deepEqual(pick(w.result, 'winner', 'reason'), { winner: 0, reason: 'hq' });
});

test('같은 틱에 둘 다 0이면 무승부', () => {
  const d = bothAtZeroSameTick();
  assert.equal(d.result.reason, 'draw');
});
