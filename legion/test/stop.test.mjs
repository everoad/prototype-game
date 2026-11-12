// 멈춤(4단계 계획 Task 4, 설계서 §4 "S 멈춤"): 이동·공격 명령을 풀고 쐐기·공격 무리에서 빼 그 자리에 선다. 다음 판단부터는 원래대로 싸운다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/sim/world.js';
import { spawn, ORDER, STATE } from '../src/sim/soldiers.js';
import { applyOrder } from '../src/sim/orders.js';
import { addBuilding } from '../src/sim/buildings.js';
import { spawnCrew } from '../src/sim/workers.js';
import { INFANTRY } from '../src/sim/rules.js';

const run = (w, sec) => { const n = Math.round(sec / w.rules.dt); for (let k = 0; k < n; k++) step(w); };
const block = (w, side, n, x, z) => Array.from({ length: n }, (_, k) => spawn(w.soldiers, side, INFANTRY, x + (k % 10) * 1.2, z + Math.floor(k / 10) * 1.2, w.rules));
const stop = (w, ids, side = 0) => applyOrder(w, { kind: 'stop', side, ids });

test('행군 쐐기에 멈춤: 2초 안에 서고 쐐기·명령이 풀린다', () => {
  const w = createWorld(), s = w.soldiers, ids = block(w, 0, 100, 500, 160);
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids }, target: { kind: 'point', x: 700, z: 330 } });
  run(w, 5);
  const r = stop(w, ids);
  assert.deepEqual([r.ok, r.count], [true, 100]);
  assert.ok(!w.groups.some(g => g.members.some(i => ids.includes(i))), '쐐기에서 빠졌다');
  assert.ok(ids.every(i => s.order[i] === ORDER.NONE));
  const where = ids.map(i => [s.x[i], s.z[i]]);
  run(w, 2);
  const speed = ids.reduce((a, i) => a + Math.hypot(s.vx[i], s.vz[i]), 0) / ids.length;
  assert.ok(speed < 0.5, `평균 빠르기 ${speed.toFixed(2)}`);
  run(w, 8);
  ids.forEach((i, k) => assert.ok(Math.hypot(s.x[i] - where[k][0], s.z[i] - where[k][1]) <= 15, `병사 ${i}가 멀리 갔다`));
});

test('멈춘 뒤에는 원래대로 가까운 적과 싸운다', () => {
  const w = createWorld(), s = w.soldiers, ids = block(w, 0, 30, 500, 200);
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids }, target: { kind: 'point', x: 700, z: 200 } });
  run(w, 1);
  stop(w, ids);
  const c = { x: 0, z: 0 }; for (const i of ids) { c.x += s.x[i] / ids.length; c.z += s.z[i] / ids.length; }
  w.rules.units[1][INFANTRY].speed = 0;
  block(w, 1, 20, c.x - 6, c.z + 30);
  let touched = false;
  for (let k = 0; k < 200 && !touched; k++) { step(w); touched = ids.some(i => s.alive[i] && s.inContact[i]); }
  assert.ok(touched, '10초 안에 맞닿았다');
});

test('맞붙은·달아나는·광부에게 걸어도 던지지 않는다', () => {
  const w = createWorld({ map: 'legion' }), s = w.soldiers;
  const fighters = block(w, 0, 10, 700, 200), foes = block(w, 1, 10, 700, 201.2);
  run(w, 2);
  assert.ok(fighters.some(i => s.inContact[i]));
  const [routing] = block(w, 0, 1, 720, 220);
  s.state[routing] = STATE.ROUT; s.routUntil[routing] = w.time + 3;
  const b = addBuilding(w, 0, 'barracks', 690, 125), crew = spawnCrew(w, 0, 660, 110, 0);
  applyOrder(w, { kind: 'assist', side: 0, building: b.id, workers: crew });
  let r;
  assert.doesNotThrow(() => { r = stop(w, [...fighters, routing, ...crew]); run(w, 3); });
  assert.ok(r.ok);
  assert.ok(crew.every(i => s.job[i] === -1), '광부는 일을 놓는다');
  assert.ok(foes.length);
});

test('고를 병사가 없으면 거절', () => {
  const w = createWorld(), s = w.soldiers, [ours] = block(w, 0, 1, 500, 200), [theirs] = block(w, 1, 1, 520, 200);
  s.alive[ours] = 0;
  for (const ids of [[], [theirs], [ours], [-1, 1e9, 'x']]) assert.equal(stop(w, ids).reason, '멈출 병사가 없다', JSON.stringify(ids));
});
