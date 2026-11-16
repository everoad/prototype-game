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

// 방패·폭탄(§4.9): Q·E는 누른 순간 한 번
test('Q는 방패, E는 폭탄 — 누른 순간 한 번(자동 반복 무시)', () => {
  const m = createInputMap(0);
  m.keyDown('KeyQ', 0); m.keyDown('KeyQ', 5); m.keyDown('KeyE', 6);
  const a = m.take();
  assert.equal(a.shield, true); assert.equal(a.bomb, true);
  m.keyDown('KeyQ', 10); m.keyDown('KeyE', 11);
  const b = m.take();
  assert.equal(b.shield, false); assert.equal(b.bomb, false);
  m.keyUp('KeyQ'); m.keyDown('KeyQ', 20);
  assert.equal(m.take().shield, true);
});

test('멈춘 동안 누른 Q·E는 버린다(풀자마자 사용권을 쓰지 않게)', () => {
  const m = createInputMap(0);
  m.keyDown('KeyQ', 0); m.keyDown('KeyE', 1);
  m.clearPresses();
  const i = m.take();
  assert.equal(i.shield, false); assert.equal(i.bomb, false);
});

// 양손 키보드(사용자 2026-11-16): J 패링, K 방패, L 폭탄 — Shift·Q·E·마우스도 그대로
test('양손 키보드: J 패링, K 방패, L 폭탄, Shift 패링도 그대로', () => {
  const m = createInputMap(0);
  m.keyDown('KeyJ', 0); m.keyDown('KeyK', 1); m.keyDown('KeyL', 2);
  const a = m.take();
  assert.deepEqual([a.parry, a.shield, a.bomb], [true, true, true]);
  m.keyUp('KeyJ'); m.keyDown('ShiftLeft', 3);
  assert.equal(m.take().parry, true);
});

// 보조 무기(§4.10): 숫자 1~6으로 켜고 끔(시험용), 누른 순간 한 번
test('숫자 1~4는 무기 켜고 끄기(누른 순간 한 번)', () => {
  const m = createInputMap(0);
  m.keyDown('Digit3', 0); m.keyDown('Digit3', 5);
  assert.equal(m.take().toggle, 3);
  assert.equal(m.take().toggle, 0);
  m.keyUp('Digit3'); m.keyDown('Digit4', 9);
  assert.equal(m.take().toggle, 4);
});

test('U·I·O는 무기 스킬(미사일·빔·드론), 누른 순간 한 번', () => {
  const m = createInputMap(0);
  m.keyDown('KeyU', 0); assert.equal(m.take().skill, 'missile'); assert.equal(m.take().skill, null);
  m.keyDown('KeyI', 1); assert.equal(m.take().skill, 'beam');
  m.keyDown('KeyO', 2); assert.equal(m.take().skill, 'drone');
});
