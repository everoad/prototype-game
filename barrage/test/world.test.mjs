// Task 1: 판, 120 Hz 틱, 즉시 이동, advance, 같은 seed = 같은 결과.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, advance, stateHash, createWorld } from '../src/sim/world.js';
import { RULES } from '../src/sim/rules.js';
import { quietWorld, idle, run } from './helpers.mjs';

test('이동은 그 틱부터 최고 속도, 떼면 그 틱에 선다', () => {
  const w = quietWorld(); const x0 = w.player.x;
  step(w, { ...idle, mx: -1 });
  assert.ok(Math.abs((x0 - w.player.x) - RULES.player.speed * RULES.dt) < 1e-9);
  const x1 = w.player.x; step(w, idle);
  assert.equal(w.player.x, x1);
});

test('대각선도 같은 속도', () => {
  const w = quietWorld(); const { x: x0, z: z0 } = w.player;
  step(w, { ...idle, mx: -1, mz: 1 });
  const d = Math.hypot(w.player.x - x0, w.player.z - z0);
  assert.ok(Math.abs(d - RULES.player.speed * RULES.dt) < 1e-9);
});

test('판 밖으로 못 나간다', () => {
  const w = quietWorld();
  run(w, 5, { ...idle, mx: -1 });
  assert.equal(w.player.x, -RULES.board.hx + RULES.player.bodyR);
});

test('난간에 비스듬히 닿으면 멈추지 않고 미끄러진다', () => {
  const w = quietWorld();
  w.player.z = -RULES.board.hz + RULES.player.bodyR; w.player.x = 0;
  const z0 = w.player.z; let lastX = w.player.x;
  for (let k = 0; k < 60; k++) {
    step(w, { ...idle, mx: -Math.SQRT1_2, mz: -Math.SQRT1_2 });
    assert.equal(w.player.z, z0);
    assert.ok(w.player.x < lastX, `틱 ${k}에 멈춤`);
    lastX = w.player.x;
  }
});

test('advance는 한 번에 maxSteps틱까지만 돌고 남은 시간을 버린다', () => {
  const w = quietWorld(); const n = advance(w, 2.0, () => idle, 12);
  assert.equal(n, 12); assert.equal(w.acc, 0);
});

test('advance는 남은 시간을 다음 번으로 넘긴다', () => {
  const w = quietWorld(); const n = advance(w, RULES.dt * 2.5, () => idle);
  assert.equal(n, 2); assert.ok(Math.abs(w.acc - RULES.dt * 0.5) < 1e-12);
});

test('같은 seed와 입력이면 stateHash가 같다', () => {
  const input = (w, k) => ({ ...idle, mx: Math.sin(k / 30), mz: Math.cos(k / 45) });
  const a = createWorld({ seed: 1, ai: false }), b = createWorld({ seed: 1, ai: false }), c = createWorld({ seed: 2, ai: false });
  for (const w of [a, b, c]) run(w, 3, input);
  assert.equal(stateHash(a), stateHash(b));
  assert.notEqual(stateHash(a), stateHash(c));
});
