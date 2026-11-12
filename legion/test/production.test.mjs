// 생산 줄(3단계 계획 Task 5): 건물이 한 번에 쐐기 하나(병종 무게 그대로)를 진형째 내고, 집결지가 있으면 그리 보낸다. 값은 줄에 넣을 때 한 번.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/sim/world.js';
import { applyOrder } from '../src/sim/orders.js';
import { addBuilding } from '../src/sim/buildings.js';
import { spawnCrew } from '../src/sim/workers.js';
import { recount } from '../src/sim/economy.js';
import { batchOf } from '../src/sim/produce.js';
import { INFANTRY, CAVALRY, ARCHER, SIEGE, WORKER } from '../src/sim/rules.js';

const run = (w, sec) => { const n = Math.round(sec / w.rules.dt); for (let k = 0; k < n; k++) step(w); };
function base(side = 0) {
  const w = createWorld({ map: 'legion' });
  addBuilding(w, 0, 'citadel', 600, 48, { done: true });
  addBuilding(w, 1, 'citadel', 600, 752, { done: true });
  const b = addBuilding(w, side, 'barracks', 700, side === 0 ? 120 : 680, { done: true });
  return { w, b };
}
const mine = (w, side, type) => { const s = w.soldiers, out = []; for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === side && s.type[i] === type) out.push(i); return out; };
const train = (w, b, unit, side = 0) => applyOrder(w, { kind: 'train', side, building: b.id, unit });
const res = (w, side = 0) => [w.sides[side].gold, w.sides[side].wood, w.sides[side].mana];

test('한 번에 나오는 수: 쐐기 무게 그대로(사람 보병 150·궁수 150·기병 63, 고블린 300), 투석기 3, 광부 조 10', () => {
  const w = createWorld(), r = w.rules;
  assert.deepEqual([INFANTRY, ARCHER, CAVALRY].map((t, k) => batchOf(r, 0, ['infantry', 'archer', 'cav'][k]).n), [150, 150, 63]);
  assert.equal(batchOf(r, 1, 'infantry').n, 300);
  assert.deepEqual([batchOf(r, 0, 'siege').n, batchOf(r, 0, 'siege').type], [3, SIEGE]);
  assert.deepEqual([batchOf(r, 0, 'worker').n, batchOf(r, 0, 'worker').type], [10, WORKER]);
  assert.ok(Math.abs(batchOf(r, 0, 'infantry').weight - 150) < 1e-9);
});

test('보병을 뽑으면 값이 나가고 25초 뒤 150명이 건물 밖에 쐐기로 선다', () => {
  const { w, b } = base(), s = w.soldiers;
  assert.equal(train(w, b, 'infantry').ok, true);
  assert.deepEqual(res(w), [200, 200, 0]);
  let ev = null;
  const until = sec => { while (w.time < sec - 1e-9) { step(w); ev ??= w.events.find(e => e.kind === 'trained'); } };
  until(24);
  assert.equal(mine(w, 0, INFANTRY).length, 0);
  until(26);
  const ids = mine(w, 0, INFANTRY);
  assert.equal(ids.length, 150);
  assert.ok(ev && ev.ids.length === 150 && ev.building === b.id && ev.side === 0);
  let near = Infinity;
  for (const i of ids) {
    assert.ok(w.map.walkable(s.x[i], s.z[i]), '걸을 수 있는 칸');
    assert.ok(Math.hypot(s.x[i] - b.x, s.z[i] - b.z) > b.r, '발자국 밖');
    for (const j of ids) if (j !== i) near = Math.min(near, Math.hypot(s.x[i] - s.x[j], s.z[i] - s.z[j]));
  }
  assert.ok(near >= 0.8, `가장 가까운 두 병사 ${near.toFixed(2)} m`);
  assert.equal(b.queue.length, 0);
});

test('몬스터 편은 같은 값에 고블린 300', () => {
  const { w, b } = base(1);
  assert.equal(train(w, b, 'infantry', 1).ok, true);
  assert.deepEqual(res(w, 1), [200, 200, 0]);
  run(w, 26);
  assert.equal(mine(w, 1, INFANTRY).length, 300);
});

test('집결지로 진형째 간다', () => {
  const { w, b } = base(), s = w.soldiers;
  assert.equal(applyOrder(w, { kind: 'rally', side: 0, building: b.id, x: 700, z: 230 }).ok, true);
  train(w, b, 'infantry');
  run(w, 26);
  const ids = mine(w, 0, INFANTRY);
  assert.equal(new Set(ids.map(i => s.group[i])).size, 1, '한 쐐기');
  assert.ok(s.group[ids[0]] >= 0);
  run(w, 60);
  const there = ids.filter(i => Math.hypot(s.x[i] - 700, s.z[i] - 230) <= 25).length;
  assert.ok(there > 100, `집결지에 ${there}/150`);
});

test('줄은 5개까지 차례대로, 취소하면 값이 돌아온다', () => {
  const { w, b } = base();
  Object.assign(w.sides[0], { gold: 5000, wood: 5000 });
  for (const u of ['infantry', 'spear', 'archer', 'infantry', 'spear']) assert.equal(train(w, b, u).ok, true);
  assert.equal(train(w, b, 'archer').reason, '생산 줄이 가득 찼다');
  assert.deepEqual(b.queue.map(q => q.key), ['infantry', 'spear', 'archer', 'infantry', 'spear']);
  const g0 = res(w);
  assert.equal(applyOrder(w, { kind: 'cancel', side: 0, building: b.id }).ok, true);
  assert.deepEqual(res(w), [g0[0] + 150, g0[1] + 200, 0]);
  assert.equal(applyOrder(w, { kind: 'cancel', side: 0, building: b.id, index: 0 }).ok, true);
  assert.deepEqual(b.queue.map(q => q.key), ['spear', 'archer', 'infantry']);
  assert.deepEqual(res(w), [g0[0] + 350, g0[1] + 300, 0]);
  assert.equal(applyOrder(w, { kind: 'cancel', side: 0, building: b.id, index: 7 }).reason, '취소할 것이 없다');
});

test('인구가 가득 차면 기다리고 자원은 한 번만 빠진다', () => {
  const { w, b } = base();
  w.rules.economy.pop.base = 0;
  train(w, b, 'infantry');
  run(w, 40);
  assert.equal(mine(w, 0, INFANTRY).length, 0);
  assert.equal(b.queue[0].started, false);
  assert.deepEqual(res(w).map(Math.round), [200 + 160, 200 + 80, 20]);   // 값은 처음 한 번만, 그 뒤 40초 수입
  assert.ok(w.notices.some(n => n.kind === 'pop' && n.side === 0));
  w.rules.economy.pop.base = 800;
  run(w, 26);
  assert.equal(mine(w, 0, INFANTRY).length, 150);
});

test('잡아 둔 인구', () => {
  const { w, b } = base(), S = w.sides[0];
  train(w, b, 'infantry');
  step(w);
  recount(w);
  assert.ok(Math.abs(S.reserved - 150) < 1e-9 && Math.abs(S.pop - 150) < 1e-9, `잡아 둠 ${S.reserved} 인구 ${S.pop}`);
  run(w, 25);
  recount(w);
  assert.ok(Math.abs(S.reserved) < 1e-9 && Math.abs(S.pop - 150) < 1e-9, `나온 뒤 잡아 둠 ${S.reserved} 인구 ${S.pop}`);
  train(w, b, 'archer');
  step(w);
  assert.equal(applyOrder(w, { kind: 'cancel', side: 0, building: b.id }).ok, true);
  recount(w);
  assert.ok(Math.abs(S.reserved) < 1e-9 && Math.abs(S.pop - 150) < 1e-9);
});

test('둘레가 막혀도 걸을 수 있는 칸에만 선다', () => {
  const w = createWorld({ map: 'legion' }), s = w.soldiers;
  addBuilding(w, 0, 'citadel', 600, 48, { done: true });
  const b = addBuilding(w, 0, 'barracks', 462, 118, { done: true });   // 바위 등성이 (492, 118)·(470, 150) 사이
  applyOrder(w, { kind: 'rally', side: 0, building: b.id, x: 530, z: 118 });   // 바위 너머 — 쐐기 끝이 바위에 걸린다
  train(w, b, 'infantry');
  run(w, 25.5);
  const ids = mine(w, 0, INFANTRY);
  assert.equal(ids.length, 150);
  for (const i of ids) assert.ok(w.map.walkable(s.x[i], s.z[i]), `(${s.x[i].toFixed(1)}, ${s.z[i].toFixed(1)})`);
});

test('성채는 광부 조 하나(10명, 같은 조 번호), 공방은 투석기 셋', () => {
  const { w, b } = base(), s = w.soldiers;
  Object.assign(w.sides[0], { gold: 5000, wood: 5000 });
  const cit = w.buildings.find(x => x.type === 'citadel' && x.side === 0);
  const shop = addBuilding(w, 0, 'workshop', 640, 160, { done: true });
  assert.equal(train(w, cit, 'worker').ok, true);
  assert.equal(train(w, shop, 'siege').ok, true);
  assert.equal(train(w, b, 'siege').reason, '여기서 못 뽑는다');
  run(w, 13);
  const crew = mine(w, 0, WORKER);
  assert.equal(crew.length, 10);
  assert.equal(new Set(crew.map(i => s.crew[i])).size, 1);
  assert.ok(s.crew[crew[0]] >= 0);
  run(w, 23);
  assert.equal(mine(w, 0, SIEGE).length, 3);
});

test('거절', () => {
  const { w, b } = base(), half = addBuilding(w, 0, 'barracks', 640, 170), theirs = addBuilding(w, 1, 'barracks', 700, 680, { done: true });
  const r0 = res(w);
  assert.equal(train(w, half, 'infantry').reason, '아직 짓는 중이다');
  assert.equal(train(w, theirs, 'infantry').reason, '건물이 없다');
  for (const id of [-1, 'x', 999]) assert.equal(applyOrder(w, { kind: 'train', side: 0, building: id, unit: 'infantry' }).reason, '건물이 없다');
  assert.equal(train(w, b, 'cav').reason, '여기서 못 뽑는다');
  assert.equal(train(w, b, 'dragon').reason, '여기서 못 뽑는다');
  w.sides[0].gold = 0;
  assert.equal(train(w, b, 'infantry').reason, '금이 모자라다');
  assert.deepEqual(res(w), [0, r0[1], r0[2]]);
  assert.equal(b.queue.length + half.queue.length, 0);
  assert.equal(applyOrder(w, { kind: 'cancel', side: 0, building: b.id }).reason, '취소할 것이 없다');
  assert.equal(applyOrder(w, { kind: 'cancel', side: 0, building: theirs.id }).reason, '건물이 없다');
  assert.equal(applyOrder(w, { kind: 'rally', side: 0, building: b.id, x: 492, z: 118 }).reason, '갈 수 없는 곳');
  assert.equal(applyOrder(w, { kind: 'rally', side: 0, building: theirs.id, x: 700, z: 200 }).reason, '건물이 없다');
  assert.equal(applyOrder(w, { kind: 'rally', side: 0, building: b.id, x: 700, z: 200 }).ok, true);
  assert.deepEqual(b.rally, { x: 700, z: 200 });
  assert.equal(applyOrder(w, { kind: 'rally', side: 0, building: b.id }).ok, true);
  assert.equal(b.rally, null);
});

test('짓던 건물을 취소하면 값이 다 돌아오고 칸이 풀린다', () => {
  const { w } = base(), crew = spawnCrew(w, 0, 640, 130, 0), r0 = res(w);
  const r = applyOrder(w, { kind: 'build', side: 0, type: 'stable', x: 660, z: 140, workers: crew });
  assert.equal(r.ok, true, r.reason);
  run(w, 3);
  assert.equal(w.map.walkable(660, 140), false);
  assert.equal(applyOrder(w, { kind: 'cancel', side: 0, building: r.id }).ok, true);
  const now = res(w), income = [4, 2, 0.5].map(v => v * 3);       // 값 전부 + 그 3초 성채 수입
  now.forEach((v, k) => assert.ok(Math.abs(v - (r0[k] + income[k])) < 0.01, `${k}: ${v} ≠ ${r0[k] + income[k]}`));
  assert.equal(w.map.walkable(660, 140), true);
  assert.equal(w.buildingById.has(r.id), false);
});
