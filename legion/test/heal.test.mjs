// 사제(6-1단계 계획 Task 5): 둘레 16 m의 가장 다친 우리 편을 고치고, 자리(마지막 명령 자리) 둘레 25 m 끈 안에서만 다가간다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INFANTRY, PRIEST } from '../src/sim/rules.js';
import { stepHeal } from '../src/sim/heal.js';
import { createWorld, step } from '../src/sim/world.js';
import { spawn, rebuildGrid, ORDER } from '../src/sim/soldiers.js';
import { applyOrder } from '../src/sim/orders.js';
import { addBuilding } from '../src/sim/buildings.js';

const mk = () => { const w = createWorld(); w.tick = 0; return w; };
const at = (w, side, t, x, z, share = 1) => { const i = spawn(w.soldiers, side, t, x, z, w.rules); w.soldiers.hp[i] = w.rules.units[side][t].hp * share; return i; };

test('고치기: 16 m 안에서 몫이 가장 낮은 하나를 0.5초에 10씩, 최대 체력까지', () => {
  const w = mk(), s = w.soldiers, max = w.rules.units[0][INFANTRY].hp;
  at(w, 0, PRIEST, 600, 200);
  const a = at(w, 0, INFANTRY, 600, 210, 0.5), b = at(w, 0, INFANTRY, 612, 200, 0.2), c = at(w, 0, INFANTRY, 620, 200, 0.1);
  rebuildGrid(s); stepHeal(w);
  assert.equal(s.hp[a], max * 0.5); assert.equal(s.hp[b], max * 0.2 + 10); assert.equal(s.hp[c], max * 0.1);
  s.hp[b] = max - 3; s.hp[a] = max;
  stepHeal(w);
  assert.equal(s.hp[b], max);
  assert.ok(w.fx.some(f => f.kind === 'heal'));
});

test('건물은 고치지 않는다, 오크 무당도 초당 20', () => {
  const w = createWorld({ map: 'legion' }); w.tick = 0;
  const b = addBuilding(w, 1, 'barracks', 600, 600, { done: true });
  b.hp = b.maxHp / 2;
  at(w, 1, PRIEST, 600, 588);
  const g = at(w, 1, INFANTRY, 605, 588, 0.5);
  rebuildGrid(w.soldiers); stepHeal(w);
  assert.equal(b.hp, b.maxHp / 2);
  assert.equal(w.soldiers.hp[g], w.rules.units[1][INFANTRY].hp * 0.5 + 10);
});

test('움직임: 끈(25 m) 안 다친 이에게 고칠 거리 끝까지만, 밖이면 자리로', () => {
  const w = mk(), s = w.soldiers;
  const p = at(w, 0, PRIEST, 600, 200);
  const far = at(w, 0, INFANTRY, 600, 230, 0.3);
  rebuildGrid(s); stepHeal(w);
  assert.deepEqual([s.goalX[p], s.goalZ[p]], [600, 200], '끈 밖 다친 이는 무시');
  s.alive[far] = 0; const near = at(w, 0, INFANTRY, 600, 220, 0.3);
  rebuildGrid(s); stepHeal(w);
  assert.ok(Math.abs(s.goalX[p] - 600) < 1e-6 && Math.abs(s.goalZ[p] - 205) < 1e-6, '다친 이에서 15 m');
  s.hp[near] = w.rules.units[0][INFANTRY].hp;
  stepHeal(w);
  assert.deepEqual([s.goalX[p], s.goalZ[p]], [600, 200], '다 나으면 자리로');
});

test('보낸 사제는 닿기 전에 새지 않고, 닿으면 그 자리가 끈 가운데', () => {
  const w = mk(), s = w.soldiers;
  const p = at(w, 0, PRIEST, 600, 200);
  at(w, 0, INFANTRY, 600, 212, 0.3);
  const r = applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: [p] }, target: { kind: 'point', x: 600, z: 150 } });
  assert.ok(r.ok);
  assert.ok(s.order[p] !== ORDER.NONE || s.wedge[p], '명령 또는 쐐기 행군 중');
  const gx = s.goalX[p], gz = s.goalZ[p];
  rebuildGrid(s); stepHeal(w);
  assert.deepEqual([s.goalX[p], s.goalZ[p]], [gx, gz], '가는 동안 다친 이에게 새지 않는다');
  for (let k = 0; k < 600 && (s.wedge[p] || s.order[p] !== ORDER.NONE); k++) step(w);   // 쐐기가 닿아 풀리면(setGoal) 그 자리가 끈 가운데
  assert.ok(!s.wedge[p] && s.order[p] === ORDER.NONE, '닿았다');
  assert.ok(Math.hypot(s.postX[p] - 600, s.postZ[p] - 150) < 5, '자리 = 보낸 자리');
});
