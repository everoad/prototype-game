// 땅 그리기 자료(src/view/landShapes.js — three 없이 셈만): 점선 조각, 다각형 띠 점.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashSegments, ribbonPoints } from '../src/view/landShapes.js';

test('점선: 8 m 그리고 6 m 비움', () => {
  const segs = dashSegments([[0, 0], [40, 0]], 8, 6).map(([a, b]) => [a[0], b[0]]);
  assert.deepEqual(segs, [[0, 8], [14, 22], [28, 36]]);
});

test('점선은 꺾인 선을 따라 이어 센다', () => {
  const segs = dashSegments([[0, 0], [10, 0], [10, 10]], 8, 6);
  assert.equal(segs.length, 2);
  assert.deepEqual(segs[1][0], [10, 4]);
  assert.deepEqual(segs[1][1], [10, 10]);
});

test('띠 점: 닫힌 다각형의 각 변을 8 m 이하로 나눈다', () => {
  const pts = ribbonPoints([[0, 0], [20, 0], [20, 10], [0, 10]], 8);
  for (let k = 0; k < pts.length; k++) {
    const [a, b] = [pts[k], pts[(k + 1) % pts.length]];
    assert.ok(Math.hypot(b[0] - a[0], b[1] - a[1]) <= 8 + 1e-9);
  }
  for (const c of [[0, 0], [20, 0], [20, 10], [0, 10]]) assert.ok(pts.some(p => p[0] === c[0] && p[1] === c[1]), `꼭짓점 ${c}`);
});
