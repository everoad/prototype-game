import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levyOnlyWorld, capWorld, runSeconds, producedWeight, aliveWeight, killWeight } from './helpers.mjs';

test('본진 징집은 1분에 무게 600', () => {
  const w = levyOnlyWorld();
  runSeconds(w, 60);
  assert.ok(Math.abs(producedWeight(w, 'hq0') - 600) <= 1, `produced ${producedWeight(w, 'hq0')}`);
});

test('상한에서 멈춘 생산은 상한 아래로 내려가면 다시 돈다 (Review Focus 5)', () => {
  const c = capWorld(100);
  runSeconds(c, 60);
  assert.ok(aliveWeight(c, 0) <= 100);
  killWeight(c, 0, 30);
  runSeconds(c, 5);
  assert.ok(aliveWeight(c, 0) > 70, `alive ${aliveWeight(c, 0)}`);
});
