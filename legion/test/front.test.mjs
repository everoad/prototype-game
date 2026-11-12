// 설계서 §6.3a: 정면은 밀고 밀린다(사용자 결정 2026-11-06 "A").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRules, SPEAR } from '../src/sim/rules.js';
import { damagePerSecond } from '../src/sim/combat.js';
import { createWorld, step, setGoal } from '../src/sim/world.js';
import { spawn, STATE } from '../src/sim/soldiers.js';
import { spawnBlock, runSeconds } from './helpers.mjs';

const hold = (w, ids) => { for (const i of ids) setGoal(w, [i], { kind: 'point', x: w.soldiers.x[i], z: w.soldiers.z[i] }); };

test('돌격 첫 타는 ×2', () => {
  const r = makeRules();
  assert.equal(damagePerSecond({ atkSide: 0, atkType: SPEAR, tgtSide: 1, tgtType: SPEAR, angleDeg: 0, ranged: false, charging: true, building: false, aura: 1 }, r), 20);
});

test('쐐기 충격: 돌격 표시가 있는 병사의 첫 타는 바로 들어가 ×2, 맞은 적은 1.5 m 밀려난다', () => {
  const w = createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } });
  const a = spawn(w.soldiers, 0, SPEAR, 600, 300, w.rules), b = spawn(w.soldiers, 1, SPEAR, 600, 301, w.rules);
  hold(w, [a, b]);
  w.soldiers.chargeHit[a] = 1;
  const z0 = w.soldiers.z[b];
  step(w);
  assert.equal(w.soldiers.hp[b], 600 - 20);
  assert.ok(w.soldiers.z[b] - z0 >= 1.4, `밀려난 거리 ${(w.soldiers.z[b] - z0).toFixed(2)}`);
  assert.equal(w.soldiers.chargeHit[a], 0);
});

test('국지 무너짐: 다치고 둘러싸이면 우리 쪽으로 달아났다가 돌아온다', () => {
  const w = createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true, damage: 0.05 } });
  const me = spawn(w.soldiers, 0, SPEAR, 600, 300, w.rules);
  setGoal(w, [me], { kind: 'point', x: 600, z: 300 });
  w.soldiers.hp[me] = 300;
  const foes = [[600, 301.2], [599, 301], [601, 301]].map(([x, z]) => spawn(w.soldiers, 1, SPEAR, x, z, w.rules));
  hold(w, foes);
  runSeconds(w, 1.3);
  assert.equal(w.soldiers.state[me], STATE.ROUT);
  runSeconds(w, 1);
  assert.ok(w.soldiers.z[me] < 298, `달아난 자리 z ${w.soldiers.z[me].toFixed(1)}`);
  runSeconds(w, 4);
  assert.notEqual(w.soldiers.state[me], STATE.ROUT);
});

