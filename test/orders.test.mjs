import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOrder } from '../src/sim/orders.js';
import { arrowWorld, countGoal } from './helpers.mjs';

// 설계서 §3.4(2026-11-06 단계 1 관문에서 고침): 화살표는 모이는 쐐기와 앞으로 나올 병사에게만 걸린다.
test('화살표를 바꿔도 이미 나간 병사(행군·정면)는 원래 목표로 간다', () => {
  const w = arrowWorld();
  const r = applyOrder(w, { kind: 'arrow', side: 0, from: 'f0L', target: { kind: 'sector', id: 's0-right' } });
  assert.equal(r.ok, true);
  assert.deepEqual(w.sides[0].arrows.get('f0L'), { kind: 'sector', id: 's0-right' });
  assert.equal(countGoal(w, 'f0L', 's0-right', ['MARCH', 'RALLY', 'FRONT']), 0);
  assert.equal(countGoal(w, 'f0L', 's0-left', ['MARCH', 'RALLY', 'FRONT']), 15);
});

test('남의 거점에서는 화살표를 걸 수 없다', () => {
  const w = arrowWorld();
  assert.equal(applyOrder(w, { kind: 'arrow', side: 0, from: 'hq1', target: { kind: 'sector', id: 's0-left' } }).ok, false);
});
