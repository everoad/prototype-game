// 4단계 최종 검토(새 눈 검토자)에서 나온 것: 꾹 누른 Ctrl+숫자·Space의 기본 동작, 판이 다시 그려져 사라지는 클릭(부대 줄·고른 병력 판),
// 시험 장면의 쐐기 누르기, Space가 공격 알림을 건너뛰던 것, 미니맵 끝 좌표, 달아나는 병사가 부대 지정에 드는 것.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/sim/world.js';
import { spawn, STATE } from '../src/sim/soldiers.js';
import { applyOrder } from '../src/sim/orders.js';
import { keyAction, shouldPrevent } from '../src/view/keys.js';
import { selectionParts, groupBarParts } from '../src/view/panel.js';
import { clickTroops, remember } from '../src/view/select.js';
import { createGroups } from '../src/view/controlGroups.js';
import { lastAlert } from '../src/view/alerts.js';
import { miniToWorld } from '../src/view/minimap.js';
import { INFANTRY, ARCHER } from '../src/sim/rules.js';

const ev = (code, mods = {}) => ({ code, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, repeat: false, tag: 'BODY', ...mods });
const block = (w, side, type, n, x, z) => Array.from({ length: n }, (_, k) => spawn(w.soldiers, side, type, x + (k % 10) * 1.2, z + Math.floor(k / 10) * 1.2, w.rules));

test('꾹 누른 Ctrl+숫자와 Space도 브라우저 기본 동작을 막는다(할 일은 없음)', () => {
  assert.equal(keyAction(ev('Digit1', { ctrlKey: true, repeat: true })), null);
  assert.equal(shouldPrevent(ev('Digit1', { ctrlKey: true, repeat: true })), true);
  assert.equal(shouldPrevent(ev('Digit1', { ctrlKey: true })), true);
  assert.equal(shouldPrevent(ev('Space', { repeat: true })), true);
  assert.equal(shouldPrevent(ev('Digit1')), false);
  assert.equal(shouldPrevent(ev('Digit1', { ctrlKey: true, tag: 'INPUT' })), false, '글 칸');
  assert.equal(shouldPrevent(ev('Digit1', { ctrlKey: true, altKey: true })), false);
  assert.equal(shouldPrevent(ev('KeyC', { ctrlKey: true })), false, 'Ctrl+C 복사는 그대로');
});

test('고른 병력 판: 병사 수가 줄어도 판 모양 열쇠는 그대로, 병종이 바뀌면 바뀐다', () => {
  const w = createWorld(), s = w.soldiers, inf = block(w, 0, INFANTRY, 20, 500, 200), arch = block(w, 0, ARCHER, 10, 520, 200);
  const a = selectionParts(w, [...inf, ...arch], { amove: false });
  s.alive[inf[0]] = 0; s.alive[arch[0]] = 0;
  const b = selectionParts(w, [...inf, ...arch], { amove: false });
  assert.equal(a.key, b.key);
  assert.deepEqual([b.total, b.counts[INFANTRY], b.counts[ARCHER]], [28, 19, 9]);
  assert.notEqual(selectionParts(w, inf, { amove: false }).key, a.key, '병종이 빠지면');
  assert.notEqual(selectionParts(w, [...inf, ...arch], { amove: true }).key, a.key, '어택땅 켜짐');
});

test('부대 줄: 수가 바뀌어도 열쇠는 그대로, 칸이 생기거나 빠지면 바뀐다', () => {
  const a = groupBarParts([{ n: 1, count: 150, name: '인간 보병' }, { n: 2, count: 90, name: '엘프 궁수' }]);
  const b = groupBarParts([{ n: 1, count: 120, name: '인간 보병' }, { n: 2, count: 90, name: '엘프 궁수' }]);
  assert.equal(a.key, b.key);
  assert.equal(b.labels[1], '인간 보병 120');
  assert.notEqual(groupBarParts([{ n: 1, count: 150, name: '인간 보병' }]).key, a.key);
});

test('누른 병사: 부대 → 없으면 쐐기 → 없으면 그 병사 하나(시험 장면의 쐐기)', () => {
  const w = createWorld(), s = w.soldiers, ids = block(w, 0, INFANTRY, 40, 500, 160);
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids }, target: { kind: 'point', x: 700, z: 330 } });
  for (let k = 0; k < 20; k++) step(w);
  const i = ids.find(j => s.group[j] >= 0);
  assert.ok(i !== undefined);
  assert.equal(clickTroops(w, i).length, ids.filter(j => s.group[j] === s.group[i]).length);
  const lone = spawn(s, 0, INFANTRY, 400, 400, w.rules);
  assert.deepEqual(clickTroops(w, lone), [lone]);
});

test('Space: 15초 안의 공격받음·무너짐이 먼저, 없으면 위치 있는 가장 새것', () => {
  const w = createWorld();
  w.time = 20;
  w.notices.push({ side: 0, kind: 'attacked', text: 'a', at: 12, x: 1, z: 2 }, { side: 0, kind: 'pop', text: 'p', at: 15, x: 3, z: 4 });
  assert.equal(lastAlert(w, 0).kind, 'attacked');
  w.time = 40;
  assert.equal(lastAlert(w, 0).kind, 'pop', '공격이 오래되면 가장 새것');
});

test('미니맵 끝 픽셀은 판 안쪽으로', () => {
  const p = miniToWorld(202, 20, { left: 10, top: 20, width: 192, height: 128 }, { width: 1200, depth: 800 });
  assert.ok(p.x < 1200 && p.z < 800, `${p.x}, ${p.z}`);
});

test('부대 지정: 달아나는(FLEE) 병사는 고르지 않는다', () => {
  const w = createWorld(), s = w.soldiers, g = createGroups(), ids = block(w, 0, INFANTRY, 5, 500, 200);
  g.set(1, remember(w, ids));
  s.state[ids[0]] = STATE.FLEE;
  assert.equal(g.get(w, 0, 1).ids.length, 4);
  s.state[ids[0]] = STATE.MARCH;
  assert.equal(g.get(w, 0, 1).ids.length, 5, '돌아오면 다시 든다');
});
