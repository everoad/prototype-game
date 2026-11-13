// 효과 표시(6-1단계 계획 Task 8): 마법사 불꽃·사제 고치기 표시는 수명 안의 것만, 옅어지는 몫과 함께.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fxMarks } from '../src/view/fx.js';

test('효과 표시: 수명 안 것만, 옅어지는 몫', () => {
  const fx = [{ kind: 'fire', x: 1, z: 2, r: 4, t: 10 }, { kind: 'heal', x: 3, z: 4, r: 0, t: 10.4 }, { kind: 'heal', x: 5, z: 6, r: 0, t: 9 }];
  const m = fxMarks(fx, 10.3);
  assert.equal(m.length, 2);
  assert.ok(Math.abs(m[0].a - 0.5) < 1e-9);
  assert.deepEqual(m.map(x => x.kind), ['fire', 'heal']);
});
