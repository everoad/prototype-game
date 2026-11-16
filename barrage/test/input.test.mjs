// Task 12: 키 상태 → 이번 틱 입력(순수) — 화면 기준 방향, 나중 키가 이김, 자동 반복, 틱 사이 누름, 초점 잃음.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInputMap } from '../src/view/inputMap.js';

test('W는 화면 위 = 바닥 (-sin ψ, -cos ψ)', () => {
  const m = createInputMap(Math.PI / 4); m.keyDown('KeyW', 0);
  const i = m.take();
  assert.ok(Math.abs(i.mx + Math.SQRT1_2) < 1e-9 && Math.abs(i.mz + Math.SQRT1_2) < 1e-9, JSON.stringify(i));
});

test('D는 화면 오른쪽 = 바닥 (cos ψ, -sin ψ), 방향키도 같다', () => {
  const m = createInputMap(Math.PI / 4); m.keyDown('ArrowRight', 0);
  const i = m.take();
  assert.ok(Math.abs(i.mx - Math.SQRT1_2) < 1e-9 && Math.abs(i.mz + Math.SQRT1_2) < 1e-9, JSON.stringify(i));
});

test('대각선 입력도 길이 1', () => {
  const m = createInputMap(0.3); m.keyDown('KeyW', 0); m.keyDown('KeyD', 1);
  const i = m.take();
  assert.ok(Math.abs(Math.hypot(i.mx, i.mz) - 1) < 1e-9);
});

test('반대 키는 나중에 누른 쪽이 이기고, 떼면 먼저 키로 돌아간다', () => {
  const m = createInputMap(0); m.keyDown('KeyA', 0); m.keyDown('KeyD', 1);
  assert.ok(m.take().mx > 0); m.keyUp('KeyD'); assert.ok(m.take().mx < 0);
});

test('키 자동 반복은 누름 한 번', () => {
  const m = createInputMap(Math.PI / 4); m.keyDown('ShiftLeft', 0); m.keyDown('ShiftLeft', 5);
  assert.equal(m.take().parry, true); m.keyDown('ShiftLeft', 9); assert.equal(m.take().parry, false);
});

test('마우스 왼쪽 = 패링, 오른쪽 = 회피', () => {
  const m = createInputMap(0); m.mouseDown(0, 0); m.mouseDown(2, 0);
  const i = m.take(); assert.equal(i.parry, true); assert.equal(i.dodge, true);
});

test('틱이 안 돈 사이의 누름은 다음 take에 남아 있다', () => {
  const m = createInputMap(0); m.keyDown('Space', 0); m.keyUp('Space');
  assert.equal(m.take().dodge, true);
  assert.equal(m.take().dodge, false);
});

test('초점을 잃으면 눌린 키를 다 뗀다', () => {
  const m = createInputMap(0); m.keyDown('KeyW', 0); m.blur();
  const i = m.take(); assert.equal(i.mx, 0); assert.equal(i.mz, 0);
});

test('마지막 누른 시각을 기억한다(입력→화면 지연 재기)', () => {
  const m = createInputMap(0); m.keyDown('KeyW', 123); m.keyDown('ShiftLeft', 130);
  assert.equal(m.lastPressMs(), 130);
});
