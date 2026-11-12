// 공격 무리(사용자 2026-11-10 "적 공격 클릭은 적이 다 죽으면 한곳에 뭉쳐 있다 — 쐐기 형태로 유지"):
// 적 병사로 보낸 병사들은 둘레가 조용해지면 그 자리에서 병종 진형으로 다시 서고, 공격하던 쪽을 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, setGoal } from '../src/sim/world.js';
import { spawn, STATE } from '../src/sim/soldiers.js';
import { INFANTRY, ARCHER } from '../src/sim/rules.js';
import { applyOrder } from '../src/sim/orders.js';

const run = (w, sec) => { for (let k = 0; k < sec * 20; k++) step(w); };
const empty = () => createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } });
function block(w, n, x, z, { side = 0, type = INFANTRY, cols = 10 } = {}) {
  const ids = [];
  for (let k = 0; k < n; k++) {
    const id = spawn(w.soldiers, side, type, x + (k % cols) * 1.4, z + Math.floor(k / cols) * 1.4, w.rules);
    setGoal(w, [id], { kind: 'point', x: w.soldiers.x[id], z: w.soldiers.z[id] });
    w.soldiers.state[id] = STATE.FRONT;
    ids.push(id);
  }
  return ids;
}
// 적 하나(움직이지 않음, 체력 1)를 30명이 치게 하고 쓰러질 때까지 + 조용해질 때까지 돌린다
function killOne(w, ours) {
  const s = w.soldiers, foe = block(w, 1, 306, 260, { side: 1 })[0];
  w.rules.units[1][INFANTRY].speed = 0; s.hp[foe] = 1;   // 움직이지 않는 적(수비대 상태 대신)
  assert.ok(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: ours }, target: { kind: 'foe', id: foe, serial: s.serial[foe] } }).ok);
  run(w, 40);
  assert.equal(s.alive[foe], 0);
}
const angleOff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

test('적을 쳐 쓰러뜨린 공격 무리는 둘레가 조용해지면 그 자리에서 쐐기로 다시 서고 공격하던 쪽을 본다', () => {
  const w = empty(), s = w.soldiers;
  const ours = block(w, 30, 300, 200);
  killOne(w, ours);
  const goals = ours.map(i => ({ x: s.goalX[i], z: s.goalZ[i] }));
  let closest = Infinity;
  for (let a = 0; a < goals.length; a++) for (let b = a + 1; b < goals.length; b++) closest = Math.min(closest, Math.hypot(goals[a].x - goals[b].x, goals[a].z - goals[b].z));
  assert.ok(closest >= 1.2, `자리가 겹치지 않는다(가장 가까운 두 자리 ${closest.toFixed(2)} m)`);
  const top = Math.max(...goals.map(p => p.z));                 // 공격한 쪽(+z)이 쐐기 끝 — 맨 앞 자리는 하나
  assert.equal(goals.filter(p => p.z > top - 0.5).length, 1, '쐐기 끝은 한 자리');
  const there = ours.filter(i => Math.hypot(s.goalX[i] - s.x[i], s.goalZ[i] - s.z[i]) < 1.5).length;
  assert.ok(there >= 27, `자리에 섰다(${there}/30)`);
  const facing = ours.filter(i => angleOff(s.facing[i], Math.PI / 2) < 25 * Math.PI / 180).length;
  assert.ok(facing >= 27, `공격한 쪽을 본다(${facing}/30)`);
});

test('궁수가 섞인 공격 무리는 보병 쐐기 뒤에 궁수 줄로 선다', () => {
  const w = empty(), s = w.soldiers;
  const inf = block(w, 20, 300, 200), arc = block(w, 15, 300, 190, { type: ARCHER });
  killOne(w, [...inf, ...arc]);
  const meanZ = ids => ids.reduce((a, i) => a + s.goalZ[i], 0) / ids.length;
  assert.ok(meanZ(arc) < meanZ(inf) - 3, `궁수 줄(${meanZ(arc).toFixed(1)})이 보병 쐐기(${meanZ(inf).toFixed(1)}) 뒤`);
  const zs = arc.map(i => s.goalZ[i]);
  assert.ok(Math.max(...zs) - Math.min(...zs) < 0.5, `궁수 15명은 한 줄(앞뒤 폭 ${(Math.max(...zs) - Math.min(...zs)).toFixed(1)} m)`);
});

test('다시 보낸 병사는 공격 무리에서 빠져 쐐기 자리로 끌려 돌아오지 않는다', () => {
  const w = empty(), s = w.soldiers;
  const ours = block(w, 30, 300, 200);
  killOne(w, ours);
  assert.ok(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: ours }, target: { kind: 'point', x: 380, z: 260 } }).ok);
  run(w, 45);
  const cx = ours.reduce((a, i) => a + s.x[i], 0) / ours.length, cz = ours.reduce((a, i) => a + s.z[i], 0) / ours.length;
  assert.ok(Math.hypot(cx - 380, cz - 260) < 8, `새 자리에 있다(가운데 ${cx.toFixed(0)}, ${cz.toFixed(0)})`);
});
