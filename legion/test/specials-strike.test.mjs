// 마법사 범위와 기사 돌격(6-1단계 계획 Task 3): 돌격 배율은 병종에서, 밀어내기 거리는 pushDistance 한곳, 마법사 불덩이는 불꽃 자리를 남긴다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRules, CAVALRY, INFANTRY, MAGE, KNIGHT, GOLEM } from '../src/sim/rules.js';
import { damageMult, pushDistance } from '../src/sim/combat.js';
import { createWorld, step } from '../src/sim/world.js';
import { spawn } from '../src/sim/soldiers.js';

const R = makeRules(), U = R.units;

test('돌격 배율: 기사 ×3, 기병 ×2', () => {
  const c = (t) => damageMult({ atkSide: 0, atkType: t, tgtSide: 1, tgtType: INFANTRY, angleDeg: 0, charging: true }, R);
  assert.equal(c(KNIGHT), 3);
  assert.equal(c(CAVALRY), 2);
});

test('밀어내기 거리: 기사 돌격 3, 기병 돌격·쐐기 충격 1.5, 돌격 북 3, 골렘 타격 3, 보통 0, 골렘은 안 밀림', () => {
  const inf = U[1][INFANTRY];
  assert.equal(pushDistance(R, U[0][KNIGHT], inf, { impact: true, charge: true }), 3);
  assert.equal(pushDistance(R, U[0][CAVALRY], inf, { impact: true, charge: true }), 1.5);
  assert.equal(pushDistance(R, U[0][INFANTRY], inf, { impact: true }), 1.5);
  assert.equal(pushDistance(R, U[0][INFANTRY], inf, { drum: true }), 3);
  assert.equal(pushDistance(R, U[0][GOLEM], inf, {}), 3);
  assert.equal(pushDistance(R, U[0][INFANTRY], inf, {}), 0);
  assert.equal(pushDistance(R, U[0][KNIGHT], U[1][GOLEM], { impact: true, charge: true }), 0);
});

test('마법사 한 발 = 과녁 + 둘레 4 m의 가까운 10명까지, 불꽃 자리를 남긴다', () => {
  const w = createWorld(), s = w.soldiers;
  spawn(s, 0, MAGE, 600, 200, w.rules);
  const foes = [];
  for (let k = 0; k < 40; k++) foes.push(spawn(s, 1, INFANTRY, 597.6 + (k % 8) * 0.6, 229 + Math.floor(k / 8) * 0.6, w.rules));
  let hurt = 0;
  for (let k = 0; k < 60 && !hurt; k++) { step(w); hurt = foes.filter(i => s.alive[i] && s.hp[i] < U[1][INFANTRY].hp).length; }
  assert.equal(hurt, 11);
  assert.ok(w.fx.some(f => f.kind === 'fire' && f.r === 4));
});
