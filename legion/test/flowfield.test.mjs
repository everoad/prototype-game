import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeField, fieldDir } from '../src/sim/flowfield.js';
import { makeTinyMap, idx } from './helpers.mjs';

test('흐름장: 목표에서 멀수록 크고, 물은 못 지나고, 벽을 돌아 틈으로 간다', () => {
  const tinyMap = makeTinyMap();
  const f = computeField(tinyMap, [{ x: 38, z: 2 }], () => 0);
  assert.ok(f[idx(0, 0)] > f[idx(9, 0)]);
  assert.equal(f[idx(5, 3)], Infinity);
  const d = fieldDir(f, tinyMap, 2, 2);
  assert.ok(d.dz > 0);
});

test('흐름장: 붐빔 비용이 있으면 그 칸을 피해 간다', () => {
  const tinyMap = makeTinyMap();
  const plain = computeField(tinyMap, [{ x: 38, z: 38 }], () => 0);
  const crowded = computeField(tinyMap, [{ x: 38, z: 38 }], cell => (cell === idx(5, 9) ? 100 : 0));
  assert.ok(crowded[idx(0, 9)] > plain[idx(0, 9)]);
});
