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
  setGoal(w, [me], { kind: 'sector', id: 's0-center' });
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

test('밀어붙이기: 이긴 쪽은 자리로 돌아가지 않고 120 m 안의 적 증원으로 밀고 간다, 승점 선 + 120 m는 넘지 않는다', () => {
  const w = createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } });
  const ours = spawnBlockSync(w, 0, 300, 600, 360), theirs = spawnBlockSync(w, 1, 100, 600, 420);
  const reserve = spawnBlockSync(w, 1, 60, 600, 480);            // 승점 선 뒤 80 m에 선 적 증원
  setGoal(w, ours, { kind: 'sector', id: 's0-center' });
  setGoal(w, theirs, { kind: 'sector', id: 's1-center' });
  hold(w, reserve);
  runSeconds(w, 60);
  const zs = ours.filter(i => w.soldiers.alive[i]).map(i => w.soldiers.z[i]).sort((a, b) => a - b);
  const front = zs[Math.floor(zs.length * 0.9)];
  assert.ok(front >= w.map.vpLine + 40, `앞쪽 10% 자리 z ${front.toFixed(1)}`);
  assert.ok(zs.at(-1) <= w.map.vpLine + 120, `가장 앞 z ${zs.at(-1).toFixed(1)}`);
});

function spawnBlockSync(w, side, n, x0, z0) {
  const ids = [], per = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) ids.push(spawn(w.soldiers, side, SPEAR, x0 + (i % per) * 1.2 - per * 0.6, z0 + Math.floor(i / per) * 1.2 * (side === 0 ? -1 : 1), w.rules));
  return ids;
}
