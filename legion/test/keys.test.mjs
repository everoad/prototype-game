// 키 해석(4단계 계획 Task 1, 설계서 §4 키 배치 — 사용자 2026-11-13): 숫자 = 부대, Z·X·C = 지휘 스킬, S 멈춤, ` 쉬는 광부 조, Space 알림, Esc 그만.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyAction, CAST_KEYS } from '../src/view/keys.js';
import { CASTS } from '../src/sim/casts.js';

const k = (code, mods = {}) => keyAction({ code, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, repeat: false, tag: 'BODY', ...mods });

test('숫자: 고르기·지정·더하기, Alt·Meta·꾹 누름은 아무것도', () => {
  assert.deepEqual(k('Digit3'), { kind: 'groupSelect', n: 3 });
  assert.deepEqual(k('Digit9', { ctrlKey: true }), { kind: 'groupSet', n: 9 });
  assert.deepEqual(k('Digit1', { shiftKey: true }), { kind: 'groupAdd', n: 1 });
  for (const mods of [{ altKey: true }, { metaKey: true }, { repeat: true }, { ctrlKey: true, repeat: true }, { ctrlKey: true, altKey: true }]) assert.equal(k('Digit2', mods), null, JSON.stringify(mods));
  assert.equal(k('Digit0'), null);
});

test('스킬 Z·X·C, 멈춤 S, 쉬는 광부 조 `, Space 알림, Esc 그만', () => {
  assert.deepEqual(k('KeyZ'), { kind: 'cast', order: 'march' });
  assert.deepEqual(k('KeyX'), { kind: 'cast', order: 'drum' });
  assert.deepEqual(k('KeyC'), { kind: 'cast', order: 'volley' });
  assert.deepEqual(k('KeyS'), { kind: 'stop' });
  assert.deepEqual(k('Backquote'), { kind: 'idleCrews' });
  assert.deepEqual(k('Space'), { kind: 'lastAlert' });
  assert.deepEqual(k('Escape'), { kind: 'cancel' });
  assert.equal(CAST_KEYS.length, CASTS.length);
  assert.deepEqual(CAST_KEYS, ['Z', 'X', 'C']);
  assert.equal(k('KeyZ', { repeat: true }), null, '꾹 누름');
  assert.equal(k('Escape', { repeat: true }), null);
});

test('수정 키가 섞인 글자 키는 아무것도(Ctrl+C 복사 등)', () => {
  assert.equal(k('KeyC', { ctrlKey: true }), null);
  assert.equal(k('KeyS', { shiftKey: true }), null);
  assert.equal(k('KeyZ', { altKey: true }), null);
  assert.equal(k('Space', { ctrlKey: true }), null);
});

test('없앤 키: WASD·Q·E와 방향키는 아무것도(방향키는 화면이 맡는다)', () => {
  for (const code of ['KeyW', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowLeft']) assert.equal(k(code), null, code);
});

test('글 칸에서는 아무것도', () => {
  for (const tag of ['INPUT', 'SELECT', 'TEXTAREA']) for (const code of ['Digit1', 'KeyZ', 'Escape', 'Space']) assert.equal(k(code, { tag }), null, `${tag} ${code}`);
});

