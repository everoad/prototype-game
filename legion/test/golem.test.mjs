// 룬 골렘(6-1단계 계획 Task 4): 몸(닿음 거리), 모루(짓밟히지 않고 밀리지도 비틀거리지도 않음), 범위 타격, 돌 몸, 안 달아남.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARCHER, CAVALRY, INFANTRY, KNIGHT, GOLEM } from '../src/sim/rules.js';
import { stepCombat } from '../src/sim/combat.js';
import { createWorld, step } from '../src/sim/world.js';
import { spawn, rebuildGrid, STATE } from '../src/sim/soldiers.js';

function scene(list) {   // list = [[side, type, x, z], ...] → ids
  const w = createWorld(), s = w.soldiers, ids = list.map(([side, t, x, z]) => spawn(s, side, t, x, z, w.rules));
  rebuildGrid(s);
  return { w, s, ids };
}

test('몸: 1.65 m 떨어진 고블린과 골렘이 서로 닿는다(몸 없는 둘이면 안 닿는 거리)', () => {
  const { w, s, ids: [g, b] } = scene([[0, GOLEM, 600, 200], [1, INFANTRY, 601.65, 200]]);
  stepCombat(w);
  assert.equal(s.inContact[g], 1); assert.equal(s.inContact[b], 1);
  const t = scene([[0, INFANTRY, 600, 200], [1, INFANTRY, 601.65, 200]]);
  stepCombat(t.w);
  assert.equal(t.s.inContact[t.ids[0]], 0);
});

test('모루: 닿은 기병은 막히고(지나가지 않음) 기사 돌격에 골렘은 비틀거리지도 밀리지도 않는다', () => {
  const { w, s, ids: [, cav] } = scene([[0, GOLEM, 600, 200], [1, CAVALRY, 601.8, 200]]);
  stepCombat(w);
  assert.equal(s.contactHold[cav], 1);
  const k = scene([[0, GOLEM, 600, 200], [1, KNIGHT, 601.8, 200]]);
  k.s.runDist[k.ids[1]] = 40; k.s.lastCharge[k.ids[1]] = -1e9;
  stepCombat(k.w);
  assert.equal(k.s.staggerUntil[k.ids[0]], 0);
  assert.deepEqual([k.s.x[k.ids[0]], k.s.z[k.ids[0]]], [600, 200]);
});

test('골렘 한 번 = 과녁 + 둘레 2 m의 가까운 3명', () => {
  const list = [[0, GOLEM, 600, 200]];
  for (let k = 0; k < 6; k++) list.push([1, INFANTRY, 601.7 + (k % 3) * 0.6, 199.4 + Math.floor(k / 3) * 1.2]);
  const { w, s, ids } = scene(list), foes = ids.slice(1), max = w.rules.units[1][INFANTRY].hp;
  for (let k = 0; k < 21; k++) { w.time += w.rules.dt; stepCombat(w); }
  assert.equal(foes.filter(i => s.hp[i] < max).length, 4);
});

test('돌 몸: 화살은 반만(엘프 궁수 정면 한 발 4 → 트롤 2)', () => {
  const { w, s, ids: [g, a] } = scene([[1, GOLEM, 600, 200], [0, ARCHER, 630, 200]]);   // 편 1 궁수는 범위 투척꾼이라 편 0 궁수로
  s.facing[g] = 0; s.rtarget[a] = g; s.hitTimer[a] = 1;
  stepCombat(w);
  assert.ok(Math.abs(w.rules.units[1][GOLEM].hp - s.hp[g] - 2) < 1e-6);
});

test('골렘은 둘러싸이고 다쳐도 달아나지 않는다', () => {
  const list = [[0, GOLEM, 600, 200]];
  for (let k = 0; k < 120; k++) { const a = k * 2.4, r = 2.5 + (k % 5) * 1.2; list.push([1, INFANTRY, 600 + Math.cos(a) * r, 200 + Math.sin(a) * r]); }   // 8 m 안 적 무게 60 ≥ 골렘 25 × 2(달아남 조건)
  const { w, s, ids: [g] } = scene(list);
  s.hp[g] = 600;
  for (let k = 0; k < 20; k++) { step(w); if (s.alive[g]) assert.notEqual(s.state[g], STATE.ROUT); }
});
