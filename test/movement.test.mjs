import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, advance, setGoal } from '../src/sim/world.js';
import { spawn } from '../src/sim/soldiers.js';
import { SPEAR } from '../src/sim/rules.js';
import { spawnBlock, allOf, fractionNear, countOnWater, minNearestNeighbor, waterPoint } from './helpers.mjs';

test('창병 200명이 구역 선분에 가서 퍼지고, 물에 들어가지 않고, 겹치지 않는다', async () => {
  const w = createWorld({ knobs: {}, seed: 1, scenario: 'empty' });
  await spawnBlock(w, 0, SPEAR, 200, { x: 600, z: 200 });
  setGoal(w, allOf(w, 0), { kind: 'sector', id: 's0-center' });
  for (let i = 0; i < 1800; i++) step(w);          // 90초
  assert.ok(fractionNear(w, 0, 'sector', 's0-center', 30) >= 0.95);   // 자리 깊이(최대 28 m)까지
  assert.equal(countOnWater(w), 0);
  assert.ok(minNearestNeighbor(w, 0, 50) >= 0.6);
});

test('물로 밀린 병사는 걸을 수 있는 곳으로 되돌아온다 (Review Focus 3)', () => {
  const w = createWorld({ knobs: {}, seed: 1, scenario: 'empty' });
  const id = spawn(w.soldiers, 0, SPEAR, ...waterPoint(w.map), w.rules);
  step(w);
  assert.equal(w.map.walkable(w.soldiers.x[id], w.soldiers.z[id]), true);
});

test('따라잡기는 한 번에 최대 5틱, 넘친 시간은 버린다 (Review Focus 2)', () => {
  const w = createWorld({ knobs: {}, seed: 1, scenario: 'empty' });
  assert.equal(advance(w, 10, 5), 5);
  assert.equal(advance(w, 0.12, 5), 2);
});

test('고블린은 떼를 짓는다: 빽빽이 모인 고블린 40은 보병 40보다 좁게 선다(간격 0.6 m 대 0.8 m, 사용자 2026-11-07)', () => {
  const pack = (side, type) => {
    const w = createWorld({ knobs: {}, seed: 1, scenario: 'empty' }), ids = [];
    for (let k = 0; k < 40; k++) ids.push(spawn(w.soldiers, side, type, 600 + (k % 8) * 0.2, 300 + Math.floor(k / 8) * 0.2, w.rules));
    for (const i of ids) setGoal(w, [i], { kind: 'point', x: 600.7, z: 300.4 });
    for (let t = 0; t < 10 * 20; t++) step(w);
    const s = w.soldiers;
    let sum = 0;
    for (const i of ids) { let best = Infinity; for (const j of ids) if (j !== i) best = Math.min(best, Math.hypot(s.x[i] - s.x[j], s.z[i] - s.z[j])); sum += best; }
    return sum / ids.length;
  };
  const goblin = pack(1, 3), infantry = pack(0, 3);
  assert.ok(goblin < infantry * 0.85, `고블린 ${goblin.toFixed(2)} m · 보병 ${infantry.toFixed(2)} m`);
  assert.ok(goblin > 0.4, `고블린끼리 겹치지는 않는다 ${goblin.toFixed(2)} m`);
});
