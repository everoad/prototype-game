// 미니맵(4단계 계획 Task 7): 미니맵 좌표 → 땅 좌표, 오른쪽 클릭 보내기를 못 하는 까닭.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniToWorld, miniSendCheck } from '../src/view/minimap.js';

const map = { width: 1200, depth: 800 }, rect = { left: 10, top: 20, width: 192, height: 128 };

test('미니맵 좌표 → 땅 좌표(위쪽이 큰 z)', () => {
  assert.deepEqual(miniToWorld(10, 20, rect, map), { x: 0, z: 799.99 });           // 끝 픽셀은 판 안쪽(4단계 최종 검토)
  assert.deepEqual(miniToWorld(202, 148, rect, map), { x: 1199.99, z: 0 });
  assert.deepEqual(miniToWorld(106, 84, rect, map), { x: 600, z: 400 });
  assert.deepEqual(miniToWorld(-50, 500, rect, map), { x: 0, z: 0 }, '바깥은 판 가장자리로');
});

test('미니맵 오른쪽 클릭: 보낼 수 없는 경우의 까닭', () => {
  assert.equal(miniSendCheck({ selected: 0, walkable: true, mode: null }), '먼저 병력을 고르세요');
  assert.equal(miniSendCheck({ selected: 5, walkable: false, mode: null }), '갈 수 없는 곳');
  assert.equal(miniSendCheck({ selected: 5, walkable: true, mode: 'aim' }), '겨누는 중에는 보내지 않는다');
  assert.equal(miniSendCheck({ selected: 5, walkable: true, mode: 'place' }), '놓는 중에는 보내지 않는다');
  assert.equal(miniSendCheck({ selected: 5, walkable: true, mode: 'amove' }), '');
  assert.equal(miniSendCheck({ selected: 5, walkable: true, mode: null }), '');
});
