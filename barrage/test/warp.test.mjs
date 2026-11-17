// 저격이 가른 공기(view/warp.js): 쏜 줄 곁의 것들이 잠깐 바깥으로 밀렸다 돌아와 보인다(그림만 — 판정은 그대로).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { warpAt, rayInBoard } from '../src/view/warp.js';
import { LOOK } from '../src/view/look.js';

const W = LOOK.tries.snipe.warp;
// (0, 0)에서 +x로 t = 10에 쐈다
const sn = { firedAt: 10, fx: 0, fz: 0, fa: 0 };
const peak = 10 + W.sec * 0.25;   // 가장 멀리 밀린 때
const at = (x, z, t = peak) => warpAt(W, sn, x, z, t, [0, 0]);

test('쏘기 전과 sec초 뒤에는 밀리지 않는다', () => {
  assert.deepEqual(at(3, 1, 9.99), [0, 0]);
  assert.deepEqual(at(3, 1, 10 + W.sec), [0, 0]);
  assert.deepEqual(warpAt(W, null, 3, 1, peak, [5, 5]), [0, 0]);
});

test('줄 옆의 것은 줄에서 멀어지는 쪽으로 밀린다 — 양쪽이 대칭', () => {
  const up = at(3, 1.5), down = at(3, -1.5);
  assert.ok(up[1] > 0.05, `위쪽이 바깥으로 안 밀림(${up[1]})`);
  assert.ok(Math.abs(up[1] + down[1]) < 1e-9 && Math.abs(up[0] - down[0]) < 1e-9);
  assert.ok(Math.abs(up[0]) < 1e-9, '줄 밖의 것은 줄 방향으로는 안 밀린다');
});

test('멀수록 덜 밀리고 reach 밖은 그대로다', () => {
  const a = at(3, 1)[1], b = at(3, 2)[1];
  assert.ok(a > b && b > 0, `${a} > ${b} > 0`);
  assert.deepEqual(at(3, W.reach + 0.01), [0, 0]);
  assert.ok(Math.hypot(...at(3, W.width)) <= W.side + 1e-9, '밀리는 양은 side를 넘지 않는다');
});

test('줄 위의 것은 쏜 방향으로 밀린다(맞고 젖혀진다)', () => {
  const o = at(4, 0);
  assert.ok(Math.abs(o[0] - W.fwd) < 1e-9, `앞으로 ${o[0]}`);
  assert.ok(Math.abs(o[1]) < 1e-9);
});

test('쏜 자리 뒤는 밀리지 않고, 끝날 때는 제자리로 돌아온다', () => {
  assert.deepEqual(at(-W.back - 0.1, 0.5), [0, 0]);
  assert.ok(Math.hypot(...at(3, 1, 10 + W.sec * 0.999)) < 0.01);
});

test('쏜 방향이 달라도 같은 꼴이다(줄에 대한 자리로 정해진다)', () => {
  const a = Math.PI / 3, s2 = { firedAt: 10, fx: 2, fz: -1, fa: a };
  const along = 3, side = 1.5;   // 줄을 따라 3, 왼쪽으로 1.5
  const x = 2 + Math.cos(a) * along - Math.sin(a) * side, z = -1 + Math.sin(a) * along + Math.cos(a) * side;
  const o = warpAt(W, s2, x, z, peak, [0, 0]), ref = at(along, side);
  assert.ok(Math.abs(-o[0] * Math.sin(a) + o[1] * Math.cos(a) - ref[1]) < 1e-9, '옆으로 밀린 양');
  assert.ok(Math.abs(o[0] * Math.cos(a) + o[1] * Math.sin(a)) < 1e-9);
});

test('줄이 판 안에 머무는 길이: 판 끝까지, len을 넘지 않는다', () => {
  const B = { hx: 10, hz: 7 };
  assert.ok(Math.abs(rayInBoard(B, -6, 0, 0, 30) - 16) < 1e-9);
  assert.ok(Math.abs(rayInBoard(B, 0, 0, Math.PI / 2, 30) - 7) < 1e-9);
  assert.ok(Math.abs(rayInBoard(B, 0, 0, Math.PI, 4) - 4) < 1e-9);
  assert.ok(Math.abs(rayInBoard(B, 0, 0, Math.PI / 4, 30) - 7 * Math.SQRT2) < 1e-9);
});

// 독립 검토: 판이 끝나면 sim 시각이 멈춰 저격의 섬광·바람 줄·밀림이 얼어붙었다 → 그리기용 시각은 끝난 뒤에도 흐른다
import { viewTime } from '../src/view/warp.js';
test('그리기용 시각: 판이 도는 동안은 sim 시각, 끝난 뒤에는 끝난 순간부터 실제 시간만큼 더 흐른다', () => {
  assert.equal(viewTime(12.5, null, 100, null), 12.5);
  assert.equal(viewTime(12.5, 'win', 100, 100), 12.5);
  assert.ok(Math.abs(viewTime(12.5, 'win', 100.4, 100) - 12.9) < 1e-9);
  assert.equal(viewTime(12.5, 'lose', 100.4, null), 12.5, '끝난 순간을 아직 모르면 그대로');
});
