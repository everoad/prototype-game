// 알림 자리(4단계 계획 Task 6): 완성·땅·인구·연구 알림에도 자리가 붙고, Space는 위치 있는 가장 새 알림으로, 미니맵은 6초 안의 공격받음·무너짐에 고리.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/sim/world.js';
import { spawn } from '../src/sim/soldiers.js';
import { applyOrder } from '../src/sim/orders.js';
import { addBuilding } from '../src/sim/buildings.js';
import { spawnCrew } from '../src/sim/workers.js';
import { lastAlert, pings } from '../src/view/alerts.js';
import { INFANTRY } from '../src/sim/rules.js';

const run = (w, sec) => { const n = Math.round(sec / w.rules.dt); for (let k = 0; k < n; k++) step(w); };
const find = (w, kind) => w.notices.find(n => n.kind === kind);
function base() {
  const w = createWorld({ map: 'legion' });
  addBuilding(w, 0, 'citadel', 600, 48, { done: true });
  Object.assign(w.sides[0], { gold: 5000, wood: 5000, mana: 1000 });
  return w;
}

test('완성·땅·인구·연구 알림에 자리가 있다', () => {
  const w = base(), crew = spawnCrew(w, 0, 690, 110, 0);
  const r = applyOrder(w, { kind: 'build', side: 0, type: 'barracks', x: 690, z: 135, workers: crew });
  run(w, 40);
  const built = find(w, 'built');
  assert.ok(built, '완성 알림');
  assert.deepEqual([built.x, built.z], [690, 135]);
  const bar = w.buildingById.get(r.id);
  applyOrder(w, { kind: 'research', side: 0, building: bar.id, key: 'longbow' });
  run(w, 41);
  const res = find(w, 'research');
  assert.deepEqual([res.x, res.z], [bar.x, bar.z]);
  w.rules.economy.pop.base = 0;
  applyOrder(w, { kind: 'train', side: 0, building: bar.id, unit: 'infantry' });
  run(w, 1);
  const pop = find(w, 'pop');
  assert.deepEqual([pop.x, pop.z], [bar.x, bar.z]);
  const g = w.map.regions.find(x => x.role === 'gold' && x.z < 400);
  for (let k = 0; k < 20; k++) spawn(w.soldiers, 0, INFANTRY, g.x + (k % 5) * 1.2, g.z + Math.floor(k / 5) * 1.2, w.rules);
  run(w, 25);
  const land = find(w, 'land');
  assert.ok(land, '땅 알림');
  assert.deepEqual([land.x, land.z], [g.x, g.z]);
});

test('마지막 알림 자리: (오래된 공격뿐이면) 위치 있는 것 가운데 가장 새것, 다른 편 것은 무시', () => {
  const w = createWorld();
  w.time = 30;                                                    // 공격받음(3초)은 15초가 지났다 — 4단계 최종 검토 뒤 규칙
  assert.equal(lastAlert(w, 0), null);
  w.notices.push({ side: 0, kind: 'attacked', text: 'a', at: 3, x: 10, z: 20 });
  w.notices.push({ side: 0, kind: 'built', text: 'b', at: 5, x: 30, z: 40 });
  w.notices.push({ side: 0, kind: 'castResult', at: 9 });
  w.notices.push({ side: 1, kind: 'attacked', text: 'c', at: 10, x: 99, z: 99 });
  assert.deepEqual(lastAlert(w, 0), { x: 30, z: 40, kind: 'built', at: 5 });
});

test('미니맵 고리: 6초 안의 공격받음·무너짐만', () => {
  const w = createWorld();
  w.notices.push({ side: 0, kind: 'attacked', at: 10, x: 1, z: 2 }, { side: 0, kind: 'collapse', at: 3, x: 3, z: 4 }, { side: 0, kind: 'built', at: 11, x: 5, z: 6 }, { side: 1, kind: 'attacked', at: 11, x: 7, z: 8 });
  assert.deepEqual(pings(w, 0, 12), [{ x: 1, z: 2, age: 2 }]);
  assert.deepEqual(pings(w, 0, 12, 10).map(p => p.x), [1, 3]);
});
