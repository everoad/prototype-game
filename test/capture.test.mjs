import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepGauge } from '../src/sim/capture.js';

test('한쪽만 있으면 15초에 0 → 100, 소유가 된다', () => {
  let g = { gauge: 0, owner: null };
  for (let i = 0; i < 300; i++) g = stepGauge(g.gauge, g.owner, 10, 0, 15, 0.05, {});
  assert.equal(g.gauge, 100);
  assert.equal(g.owner, 0);
});

test('다수결 비례: 30 대 10이면 기본 속도 × 20/30', () => {
  const g = stepGauge(0, null, 30, 10, 15, 1, {});
  assert.ok(Math.abs(g.gauge - (100 / 15) * (20 / 30)) < 1e-9);
});

test('성벽이 서 있으면 절반 속도, 본진 성벽이 서 있으면 움직이지 않는다', () => {
  assert.ok(Math.abs(stepGauge(0, null, 10, 0, 15, 1, { wallUp: true }).gauge - 100 / 30) < 1e-9);
  assert.equal(stepGauge(-40, 1, 50, 0, 60, 1, { hqLocked: true }).gauge, -40);
});

test('0을 지나면 소유를 잃어 중립, 비어 있으면 소유 쪽으로 되돌아간다', () => {
  assert.equal(stepGauge(-1, 1, 10, 0, 15, 1, {}).owner, null);
  assert.ok(stepGauge(50, null, 0, 0, 15, 1, { decaySeconds: 30 }).gauge < 50);
  assert.ok(stepGauge(50, 0, 0, 0, 15, 1, { decaySeconds: 30 }).gauge > 50);
});
