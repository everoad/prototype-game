// 3단계 최종 검토(새 눈 검토자)에서 나온 것: 건물 판이 누르는 사이에 다시 그려지지 않게, 덮인 집결지, 집결지 없이 겹쳐 나오는 쐐기,
// 원형 속성 이름의 건물, 병사 위에 놓인 건물, 건물 공격 둘레, 덮인 건물 문, 이어 가기의 광부 일, 끝난 판의 명령, 일꾼 가드 빈틈, 알림 정리.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/sim/world.js';
import { spawn, STATE } from '../src/sim/soldiers.js';
import { applyOrder } from '../src/sim/orders.js';
import { addBuilding, canPlace } from '../src/sim/buildings.js';
import { damageBuilding } from '../src/sim/strikes.js';
import { spawnCrew } from '../src/sim/workers.js';
import { buildingCard } from '../src/view/panel.js';
import { INFANTRY, ARCHER, SIEGE } from '../src/sim/rules.js';

const run = (w, sec) => { const n = Math.round(sec / w.rules.dt); for (let k = 0; k < n; k++) step(w); };
function base() {
  const w = createWorld({ map: 'legion' });
  addBuilding(w, 0, 'citadel', 600, 48, { done: true });
  addBuilding(w, 1, 'citadel', 600, 752, { done: true });
  Object.assign(w.sides[0], { gold: 5000, wood: 5000, mana: 1000 });
  return w;
}
const block = (w, side, type, n, x, z, cols = 10) => Array.from({ length: n }, (_, k) => {
  const px = x + (k % cols - (cols - 1) / 2) * 1.2, pz = z + Math.floor(k / cols) * 1.2, i = spawn(w.soldiers, side, type, px, pz, w.rules);
  w.soldiers.goalKind[i] = 4; w.soldiers.goalX[i] = px; w.soldiers.goalZ[i] = pz;
  return i;
});

test('건물 판: 체력·진행·남은 초가 바뀌어도 판 모양 열쇠는 그대로, 단추가 켜지고 꺼질 때만 바뀐다', () => {
  const w = base(), half = addBuilding(w, 0, 'barracks', 690, 125), bar = addBuilding(w, 0, 'barracks', 640, 165, { done: true });
  const k0 = buildingCard(w, half).key;
  half.progress = 0.4; half.hp = 1500;
  assert.equal(buildingCard(w, half).key, k0, '짓는 중');
  assert.notEqual(buildingCard(w, half).status, '');
  applyOrder(w, { kind: 'train', side: 0, building: bar.id, unit: 'infantry' });
  const k1 = buildingCard(w, bar).key, q1 = buildingCard(w, bar).queue;
  run(w, 3);
  assert.equal(buildingCard(w, bar).key, k1, '생산 중');
  assert.notEqual(buildingCard(w, bar).queue, q1, '줄 글은 바뀐다');
  w.sides[0].gold = 0;
  assert.notEqual(buildingCard(w, bar).key, k1, '단추가 꺼지면 다시 그린다');
});

test('덮인 집결지는 가장 가까운 걸을 수 있는 곳으로 옮겨지고 쐐기가 그리 간다', () => {
  const w = base(), s = w.soldiers, bar = addBuilding(w, 0, 'barracks', 690, 125, { done: true });
  applyOrder(w, { kind: 'rally', side: 0, building: bar.id, x: 760, z: 150 });
  addBuilding(w, 0, 'stable', 760, 150, { done: true });
  assert.ok(w.map.walkable(bar.rally.x, bar.rally.z), `집결지 (${bar.rally.x}, ${bar.rally.z})`);
  applyOrder(w, { kind: 'train', side: 0, building: bar.id, unit: 'infantry' });
  run(w, 70);
  const ids = []; for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === 0 && s.type[i] === INFANTRY) ids.push(i);
  const there = ids.filter(i => Math.hypot(s.x[i] - bar.rally.x, s.z[i] - bar.rally.z) <= 25).length;
  assert.ok(there > 100, `집결지에 ${there}/${ids.length}`);
});

test('집결지 없이 연달아 뽑은 쐐기는 서로 다른 자리에 선다', () => {
  const w = base(), s = w.soldiers, bar = addBuilding(w, 0, 'barracks', 690, 125, { done: true });
  for (let k = 0; k < 4; k++) applyOrder(w, { kind: 'train', side: 0, building: bar.id, unit: 'infantry' });
  const centers = [];
  for (let k = 0; k < 2100 && centers.length < 4; k++) {
    step(w);
    for (const e of w.events) if (e.kind === 'trained') {
      let x = 0, z = 0; for (const i of e.ids) { x += s.x[i]; z += s.z[i]; }
      centers.push([x / e.ids.length, z / e.ids.length]);
    }
  }
  assert.equal(centers.length, 4);
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
    const d = Math.hypot(centers[a][0] - centers[b][0], centers[a][1] - centers[b][1]);
    assert.ok(d >= 12, `쐐기 ${a}·${b} 가운데 사이 ${d.toFixed(1)} m`);
  }
});

test('원형 속성 이름은 모르는 건물', () => {
  const w = base(), crew = spawnCrew(w, 0, 650, 110, 0);
  for (const type of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(canPlace(w, 0, type, 700, 140).reason, '모르는 건물', type);
    assert.equal(applyOrder(w, { kind: 'build', side: 0, type, x: 700, z: 140, workers: crew }).reason, '모르는 건물', type);
  }
  assert.equal(w.buildings.length, 2);
});

test('서 있는 병사 위에 놓은 건물: 목표가 둘레로 흩어지고 뭉치지 않는다', () => {
  const w = base(), s = w.soldiers, ids = block(w, 0, INFANTRY, 150, 700, 112, 15);
  addBuilding(w, 0, 'barracks', 700, 118);
  const goals = new Set(ids.map(i => `${s.goalX[i].toFixed(1)},${s.goalZ[i].toFixed(1)}`));
  assert.ok(goals.size >= 100, `다른 목표 ${goals.size}/150`);
  run(w, 20);
  let tight = 0;
  for (const i of ids) for (const j of ids) if (j !== i && Math.hypot(s.x[i] - s.x[j], s.z[i] - s.z[j]) < 0.5) { tight++; break; }
  assert.ok(tight < 30, `0.5 m 안에 이웃이 있는 병사 ${tight}`);
});

test('적 건물로 보낸 병사는 건물 둘레에 서서 거의 모두 친다', () => {
  const w = base(), s = w.soldiers, foe = addBuilding(w, 1, 'citadel', 720, 300, { done: true }), ids = block(w, 0, INFANTRY, 150, 700, 180, 15);
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids }, target: { kind: 'building', id: foe.id } });
  run(w, 60);
  const reach = foe.r + w.rules.buildingDamage.reach;
  const close = ids.filter(i => s.alive[i] && Math.hypot(s.x[i] - foe.x, s.z[i] - foe.z) <= reach).length;
  assert.ok(close >= 120, `건물 곁 ${close}/150`);
});

test('덮인 건물 문은 다시 찾는다', () => {
  const w = base(), s = w.soldiers, a = addBuilding(w, 0, 'barracks', 690, 125);
  addBuilding(w, 0, 'workshop', a.gate.x + (a.gate.x - a.x) / Math.hypot(a.gate.x - a.x, a.gate.z - a.z) * 8, a.gate.z + (a.gate.z - a.z) / Math.hypot(a.gate.x - a.x, a.gate.z - a.z) * 8);
  const crew = spawnCrew(w, 0, 650, 100, 0);
  applyOrder(w, { kind: 'assist', side: 0, building: a.id, workers: crew });
  assert.ok(w.map.walkable(a.gate.x, a.gate.z), '문');
  for (const i of crew) assert.ok(w.map.walkable(s.goalX[i], s.goalZ[i]), '광부 목표');
});

test('Shift 이어 가기로 보낸 광부는 일을 놓는다', () => {
  const w = base(), s = w.soldiers, b = addBuilding(w, 0, 'barracks', 690, 125), crew = spawnCrew(w, 0, 650, 100, 0);
  applyOrder(w, { kind: 'assist', side: 0, building: b.id, workers: crew });
  const r = applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: crew }, target: { kind: 'point', x: 600, z: 160 }, append: true });
  assert.equal(r.ok, true, r.reason);
  assert.ok(crew.every(i => s.job[i] === -1));
});

test('끝난 판에는 명령이 먹지 않는다', () => {
  const w = base(), bar = addBuilding(w, 0, 'barracks', 690, 125, { done: true });
  damageBuilding(w, w.buildings.find(b => b.type === 'citadel' && b.side === 1), 1e9);
  const g = w.sides[0].gold;
  assert.equal(applyOrder(w, { kind: 'train', side: 0, building: bar.id, unit: 'infantry' }).reason, '판이 끝났다');
  assert.equal(w.sides[0].gold, g);
});

test('아무것도 안 나오는 건물에는 집결지가 없다', () => {
  const w = base(), d = w.map.deposits.find(o => Math.hypot(o.x - 550, o.z - 62) < 0.5), mine = addBuilding(w, 0, 'goldmine', d.x, d.z, { done: true, deposit: d.id });
  assert.equal(applyOrder(w, { kind: 'rally', side: 0, building: mine.id, x: 600, z: 150 }).reason, '여기서는 아무것도 나오지 않는다');
});

test('광부만으로는 건물을 공격하지 않는다, 섞이면 광부는 빠진다', () => {
  const w = base(), s = w.soldiers, foe = addBuilding(w, 1, 'barracks', 720, 300, { done: true }), crew = spawnCrew(w, 0, 650, 110, 0), inf = block(w, 0, INFANTRY, 10, 700, 180);
  assert.equal(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: crew }, target: { kind: 'building', id: foe.id } }).reason, '보낼 병사가 없다');
  const gx = s.goalX[crew[0]];
  assert.equal(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: [...crew, ...inf] }, target: { kind: 'building', id: foe.id } }).count, 10);
  assert.equal(s.goalX[crew[0]], gx);
});

test('병사 자리가 가득 차면 그렇게 알린다', () => {
  const w = base(), s = w.soldiers, bar = addBuilding(w, 0, 'barracks', 690, 125, { done: true });
  applyOrder(w, { kind: 'train', side: 0, building: bar.id, unit: 'infantry' });
  const count = s.count, free = s.free;
  s.count = s.capacity; s.free = [];
  step(w);
  s.count = count; s.free = free;
  assert.ok(w.notices.some(n => n.kind === 'pop' && n.text === '병사 자리가 가득 찼다'));
});

test('궁수는 적 광부를 보고 물러나지 않는다', () => {
  const w = base(), s = w.soldiers, [a] = block(w, 0, ARCHER, 1, 700, 200);
  for (let k = 0; k < 10; k++) spawnCrew(w, 1, 700, 205, 0);
  let routed = false;
  for (let k = 0; k < 100; k++) { step(w); if (s.state[a] === STATE.ROUT) routed = true; }
  assert.equal(routed, false);
});

test('투석기는 적 광부가 닿아도 쏜다', () => {
  const w = base(), [c] = block(w, 0, SIEGE, 1, 700, 200);
  block(w, 1, 5, 1, 700, 200.85);                                    // 적 광부 하나가 바로 곁에(손이 닿는 거리)
  w.rules.units[1][INFANTRY].speed = 0;
  block(w, 1, INFANTRY, 10, 700, 250);
  block(w, 0, INFANTRY, 1, 690, 215);
  let fired = 0;
  for (let k = 0; k < 120; k++) { step(w); fired += w.events.filter(e => e.kind === 'boulderFire' && e.from === c).length; }
  assert.ok(fired >= 1, `쏜 돌 ${fired}`);
});

test('오래된 알림은 지운다', () => {
  const w = base();
  w.notices.push({ side: 0, kind: 'land', text: '옛 알림', at: 0 });
  run(w, 62);                                                        // 남겨 두는 60초 + 정리 간격(1초)
  assert.equal(w.notices.some(n => n.text === '옛 알림'), false);
});
