// 핵심 계산만 짧게: 상성, 길찾기, 점령·끊김·수입, 짓기·생산·취소, 인구, 승점, 요새, AI 한 판이 돈다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, applyCommand, spawnUnit, addBuilding } from '../src/sim/world.js';
import { damageMult, UNITS, BUILDINGS } from '../src/sim/rules.js';
import { fieldTo, flowDir } from '../src/sim/path.js';
import { makeAi } from '../src/sim/ai.js';

const run = (w, sec) => { for (let i = 0; i < Math.round(sec / w.rules.dt); i++) step(w); };
function quiet(seed = 1) {                         // 괴물 없는 판
  const w = createWorld({ seed });
  for (const u of w.units) if (u.side === 2) { u.alive = false; w.byId.delete(u.id); }
  w.units = w.units.filter(u => u.alive);
  return w;
}
const regionByKey = (w, key) => w.map.regions.find(r => r.key === key);

test('상성: 창은 큰 것에 2.5배, 화살은 무거운 갑옷에 0.5배, 공성은 건물에 3배', () => {
  assert.equal(damageMult('pierce', UNITS.knight.armor), 2.5);
  assert.equal(damageMult('arrow', UNITS.sword.armor), 0.5);
  assert.equal(damageMult('siege', 'building'), 3);
});

test('길찾기: 바위 무리를 돌아 목표에 닿는다', () => {
  const w = quiet();
  const p = w.paths, map = w.map;
  const goal = map.cellOf(300, 300);
  const f = fieldTo(p, goal);
  let x = 230, z = 240;                            // 바위(255,268)·(270,248) 건너편
  for (let k = 0; k < 400 && Math.hypot(x - 300, z - 300) > 4; k++) {
    const d = flowDir(p, f, x, z);
    assert.ok(d, '방향이 있어야 한다');
    x += d[0] * 2; z += d[1] * 2;
    assert.equal(map.terrain[map.cellOf(x, z)], 0, '막힌 칸을 지나면 안 된다');
  }
  assert.ok(Math.hypot(x - 300, z - 300) <= 4);
});

test('점령: 이웃한 중립 지역은 20초쯤 서 있으면 우리 것, 이웃 아닌 곳은 안 된다', () => {
  const w = quiet();
  const near = regionByKey(w, '1,0'), far = regionByKey(w, '2,2');
  const g = w.map.regions.indexOf(near), gf = w.map.regions.indexOf(far);
  spawnUnit(w, 0, 'sword', near.x + 2, near.z);
  spawnUnit(w, 0, 'sword', far.x + 14, far.z);       // 가운데는 요새 고리(18 m) 안
  run(w, 21);
  assert.equal(w.regions[g].owner, 0);
  assert.equal(w.regions[gf].owner, -1);
});

test('끊김: 가운데 땅을 잃으면 그 너머 금광은 수입이 없다', () => {
  const w = quiet();
  const a = regionByKey(w, '1,0'), b = regionByKey(w, '2,0');
  const ga = w.map.regions.indexOf(a), gb = w.map.regions.indexOf(b);
  w.regions[ga].owner = 0; w.regions[gb].owner = 0; w.regionsDirty = true;
  run(w, 0.1);
  const d = w.map.deposits.find(x => x.region === gb);
  addBuilding(w, 0, b.mana ? 'manawell' : 'goldmine', d.x, d.z, true, d.id);
  run(w, 0.2);
  const before = w.sides[0].rate.gold + w.sides[0].rate.mana;
  w.regions[ga].owner = -1; w.regionsDirty = true;   // 이어 주던 땅을 잃었다
  run(w, 0.2);
  assert.equal(w.regions[gb].connected[0], false);
  assert.ok(w.sides[0].rate.gold + w.sides[0].rate.mana < before);
});

test('짓기와 생산: 일꾼이 병영을 짓고, 검사가 나오고, 취소하면 돌려받는다', () => {
  const w = quiet();
  w.sides[0].gold = 1000; w.sides[0].wood = 1000;
  const worker = w.units.find(u => u.side === 0 && u.t.worker);
  const cit = w.buildings.find(b => b.type === 'citadel' && b.side === 0);
  const r = applyCommand(w, { kind: 'build', side: 0, ids: [worker.id], type: 'barracks', x: cit.x + 30, z: cit.z + 5 });
  assert.ok(r.ok, r.why);
  assert.equal(w.sides[0].gold, 1000 - BUILDINGS.barracks.gold);
  run(w, BUILDINGS.barracks.time + 15);
  const bar = w.byId.get(r.id);
  assert.ok(bar.done, '다 지어졌어야 한다');
  assert.ok(applyCommand(w, { kind: 'train', side: 0, building: bar.id, unit: 'sword' }).ok);
  assert.ok(applyCommand(w, { kind: 'train', side: 0, building: bar.id, unit: 'archer' }).ok);
  const g = w.sides[0].gold;
  assert.ok(applyCommand(w, { kind: 'cancel', side: 0, building: bar.id }).ok);
  assert.equal(w.sides[0].gold, g + UNITS.archer.gold);
  run(w, UNITS.sword.time + 0.5);
  assert.equal(w.units.filter(u => u.side === 0 && u.type === 'sword').length, 1);
});

test('인구: 상한에 닿으면 생산이 멈춘다', () => {
  const w = quiet();
  const cit = w.buildings.find(b => b.type === 'citadel' && b.side === 0);
  w.sides[0].gold = 10000;
  while (w.sides[0].pop < w.sides[0].popCap) spawnUnit(w, 0, 'worker', cit.x + 25, cit.z + 25);
  applyCommand(w, { kind: 'train', side: 0, building: cit.id, unit: 'worker' });
  const n = w.units.length;
  run(w, UNITS.worker.time + 2);
  assert.equal(w.units.length, n);
});

test('승점: 제단을 더 쥔 편이 상대 승점을 깎는다', () => {
  const w = quiet();
  const alt = w.map.regions.findIndex(r => r.altar);
  w.regions[alt].owner = 0;
  run(w, 10);
  assert.ok(Math.abs(w.sides[1].points - (w.rules.victory.points - 10)) < 0.5);
  assert.equal(w.sides[0].points, w.rules.victory.points);
});

test('요새: 무너지면 쏘지 않고, 땅을 잡으면 40% 체력으로 우리 편', () => {
  const w = quiet();
  const rg = regionByKey(w, '1,1'), g = w.map.regions.indexOf(rg);
  const fort = w.byId.get(w.regions[g].fort);
  assert.equal(fort.side, 2);
  w.regions[w.map.regions.indexOf(regionByKey(w, '1,0'))].owner = 0; w.regionsDirty = true;   // 요새 땅은 본진과 모서리만 닿는다 — 곁 땅을 먼저
  fort.hp = 1;
  const s = spawnUnit(w, 0, 'sword', rg.x + 9, rg.z);
  s.order = { kind: 'attack', target: fort.id }; s.target = fort.id;
  run(w, 2);
  assert.ok(fort.ruined && fort.alive);
  run(w, 22);
  assert.equal(w.regions[g].owner, 0);
  assert.equal(fort.side, 0);
  assert.ok(fort.hp >= fort.maxHp * 0.39 && !fort.ruined);
});

test('AI 대 AI 4분: 둘 다 짓고 뽑고 땅을 넓힌다', () => {
  const w = createWorld({ seed: 3 });
  w.controllers[0] = makeAi(0, { personality: 'balanced' });
  w.controllers[1] = makeAi(1, { personality: 'rush' });
  run(w, 240);
  for (const s of [0, 1]) {
    assert.ok(w.buildings.filter(b => b.side === s).length >= 5, `편 ${s} 건물`);
    assert.ok(w.units.filter(u => u.side === s && !u.t.worker).length >= 3, `편 ${s} 병력`);
    assert.ok(w.regions.filter(r => r.owner === s).length >= 3, `편 ${s} 땅`);
  }
});
