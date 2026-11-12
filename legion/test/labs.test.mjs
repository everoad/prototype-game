// 시험 장면 clash5k(성능 재기용, 1단계 Task 8): 양쪽 5,000명이 병종 비율대로 줄을 서서 맞붙는다. 황금 시험에서는 빠진다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/sim/world.js';
import { spawn } from '../src/sim/soldiers.js';
import { applyOrder } from '../src/sim/orders.js';
import { LABS, makeApi, actionRunner, goldenLabs } from '../src/sim/labs.js';

const mods = { createWorld, step, spawn, applyOrder };
const setupClash = () => {
  const w = createWorld({ seed: 1, scenario: 'empty', knobs: {} });
  const api = makeApi(mods);
  return { w, api, due: actionRunner(LABS.clash5k.setup(w, api)) };
};

test('clash5k: 양쪽 5,000명이 병종 비율(보병 40 · 창 25 · 궁 20 · 기병 15%)로 제 줄에 선다', () => {
  const { w } = setupClash(), s = w.soldiers;
  const count = { 0: [0, 0, 0, 0, 0], 1: [0, 0, 0, 0, 0] };
  for (let i = 0; i < s.count; i++) {
    count[s.side[i]][s.type[i]]++;
    const [z0, z1] = s.side[i] === 0 ? [180, 260] : [540, 620];
    assert.ok(s.z[i] >= z0 && s.z[i] <= z1, `편 ${s.side[i]} 병사 ${i}의 z ${s.z[i]}`);
    assert.ok(s.x[i] >= 200 && s.x[i] <= 1000, `병사 ${i}의 x ${s.x[i]}`);
    assert.ok(w.map.walkable(s.x[i], s.z[i]), `병사 ${i}가 물 위`);
  }
  // 병종 번호: 0 창 · 1 궁 · 2 기병 · 3 보병 · 4 공성
  assert.deepEqual(count[0], [1250, 1000, 750, 2000, 0]);
  assert.deepEqual(count[1], [1250, 1000, 750, 2000, 0]);
});

test('clash5k: 0.5초에 양쪽이 맞은편으로 간다', () => {
  const { w, api, due } = setupClash(), s = w.soldiers;
  const meanZ = side => { let z = 0, n = 0; for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === side) { z += s.z[i]; n++; } return z / n; };
  const before = [meanZ(0), meanZ(1)];
  while (w.time < 10) { due(w, api); step(w); }
  assert.ok(meanZ(0) > before[0] + 10, `편 0 평균 z ${before[0].toFixed(1)} → ${meanZ(0).toFixed(1)}`);
  assert.ok(meanZ(1) < before[1] - 10, `편 1 평균 z ${before[1].toFixed(1)} → ${meanZ(1).toFixed(1)}`);
});

test('화면의 장면 행동: 사용자가 먼저 북을 걸어 장면의 북이 거절돼도 판이 멈추지 않고 까닭을 알린다', () => {
  // main.js처럼 장면 행동을 controllers[0].think에서 돌린다. skills 장면은 4초에 북, 6초에 화살 비를 건다.
  const w = createWorld({ seed: 1, scenario: 'empty', knobs: {} }), api = makeApi(mods), fails = [];
  const due = actionRunner(LABS.skills.setup(w, api), reason => fails.push(reason));
  w.controllers[0] = { think: x => { due(x, api); return []; } };
  while (w.time < 1) step(w);
  assert.equal(applyOrder(w, { kind: 'cast', side: 0, order: 'drum', x: 600, z: 220 }).ok, true);
  assert.doesNotThrow(() => { while (w.time < 10) step(w); });
  assert.equal(fails.length, 1);
  assert.match(fails[0], /다시 쓰기/);
  assert.ok(w.sides[0].cooldowns.volley > 6, '6초의 화살 비는 그대로 걸린다');
});

test('황금 시험의 장면 행동(알림 없이)은 실패하면 그대로 멈춘다', () => {
  const w = createWorld({ seed: 1, scenario: 'empty', knobs: {} }), api = makeApi(mods);
  const due = actionRunner(LABS.skills.setup(w, api));
  applyOrder(w, { kind: 'cast', side: 0, order: 'drum', x: 600, z: 220 });
  assert.throws(() => { while (w.time < 10) { due(w, api); step(w); } }, /다시 쓰기/);
});

test('clash5k는 60초 장면이고 황금 시험에서 빠진다', () => {
  assert.equal(LABS.clash5k.seconds, 60);
  assert.equal(LABS.clash5k.golden, false);
  assert.ok(!goldenLabs().includes('clash5k'));
  assert.ok(goldenLabs().includes('wedges'));
});
