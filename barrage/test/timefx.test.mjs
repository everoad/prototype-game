// Task 14: 정지·느려짐(순수) — 정지가 이김, 0.6초 안 두 번째 완벽 패링의 느려짐 생략, 정지 예산.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimeFx } from '../src/view/timeFx.js';
import { LOOK } from '../src/view/look.js';

test('정지 중 배율 0, 끝나면 1', () => {
  const t = createTimeFx(LOOK);
  t.hitstop(1, 0.06);
  assert.equal(t.scaleAt(1.03), 0);
  assert.equal(t.scaleAt(1.07), 1);
});

test('느려짐 중엔 그 배율', () => {
  const t = createTimeFx(LOOK);
  t.slow(2, 0.35, 1.0);
  assert.equal(t.scaleAt(2.5), 0.35);
  assert.equal(t.scaleAt(3.01), 1);
});

test('정지와 느려짐이 겹치면 정지가 이긴다', () => {
  const t = createTimeFx(LOOK);
  t.slow(0, 0.35, 1.0); t.hitstop(0.2, 0.1);
  assert.equal(t.scaleAt(0.25), 0);
  assert.equal(t.scaleAt(0.35), 0.35);
});

test('0.6초 안의 두 번째 완벽 패링은 느려짐을 건너뛴다', () => {
  const t = createTimeFx(LOOK);
  t.slow(0, 0.35, 0.12, { skipIfWithin: 0.6 }); t.slow(0.4, 0.35, 0.12, { skipIfWithin: 0.6 });
  assert.equal(t.scaleAt(0.45), 1);
  t.slow(1.2, 0.35, 0.12, { skipIfWithin: 0.6 });
  assert.equal(t.scaleAt(1.25), 0.35);
});

test('정지 예산: 1초 안 합이 0.15초를 넘지 않고, override는 예산 밖', () => {
  const t = createTimeFx(LOOK); let sum = 0;
  for (let i = 0; i < 5; i++) sum += t.hitstop(i * 0.1, 0.06);
  assert.ok(sum <= 0.15 + 1e-9, `합 ${sum}`);
  assert.equal(t.hitstop(0.45, 0.3, { override: true }), 0.3);
  // 1초가 지나면 예산이 돌아온다
  assert.equal(t.hitstop(2.0, 0.06), 0.06);
});
