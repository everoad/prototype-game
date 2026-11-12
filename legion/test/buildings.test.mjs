// 건물과 길 막기(3단계 계획 Task 2): 발자국 칸은 못 지나가고, 흐름장은 다시 계산되고, 놓을 수 있는지는 canPlace가 까닭과 함께 알려 준다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, pointFieldId } from '../src/sim/world.js';
import { spawn } from '../src/sim/soldiers.js';
import { applyOrder } from '../src/sim/orders.js';
import { fieldDir } from '../src/sim/flowfield.js';
import { addBuilding, removeBuilding, canPlace, buildingAt } from '../src/sim/buildings.js';
import { INFANTRY } from '../src/sim/rules.js';

const game = () => createWorld({ map: 'legion' });
const run = (w, sec) => { const n = Math.round(sec / w.rules.dt); for (let k = 0; k < n; k++) step(w); };
const depositAt = (w, x, z) => w.map.deposits.find(d => Math.hypot(d.x - x, d.z - z) < 0.5);

// 흐름장을 칸 가운데에서 칸 가운데로 따라간다: 막힌 칸을 밟으면 −2, 목표 4 m 안에 닿으면 걸음 수.
function follow(w, field, x, z, tx, tz, max = 400) {
  const cell = w.map.cell;
  x = (Math.floor(x / cell) + 0.5) * cell; z = (Math.floor(z / cell) + 0.5) * cell;
  for (let k = 0; k < max; k++) {
    if (Math.hypot(tx - x, tz - z) < 4) return k;
    const d = fieldDir(field, w.map, x, z);
    if (!d.dx && !d.dz) return -1;
    x += Math.sign(d.dx) * cell; z += Math.sign(d.dz) * cell;
    if (!w.map.walkable(x, z)) return -2;
  }
  return -3;
}

test('건물 발자국 칸은 못 지나가고 무너지면 풀린다', () => {
  const w = game(), v0 = w.map.version;
  const b = addBuilding(w, 0, 'barracks', 700, 120);
  assert.equal(w.map.walkable(700, 120), false);
  assert.equal(w.map.speedMult(700, 120), 0);
  assert.equal(w.map.walkable(700, 131), true);
  assert.ok(w.map.version > v0);
  assert.equal(w.buildingById.get(b.id), b);
  assert.equal(buildingAt(w, 705, 120), b);
  assert.equal(buildingAt(w, 700, 140), null);
  assert.ok(w.map.walkable(b.gate.x, b.gate.z), '문 자리는 걸을 수 있다');
  removeBuilding(w, b);
  assert.equal(w.map.walkable(700, 120), true);
  assert.equal(w.map.speedMult(700, 120), 1);
  assert.equal(w.buildings.length, 0);
  assert.equal(b.alive, false);
  assert.ok(w.events.some(e => e.kind === 'collapse' && e.id === b.id));
});

test('먼저 만든 흐름장도 새 건물을 돌아간다', () => {
  const w = game(), id = pointFieldId(w, 700, 160);
  assert.ok(follow(w, w.pointField(id), 700, 80, 700, 160) > 0, '건물 앞');
  addBuilding(w, 0, 'barracks', 700, 120);
  const k = follow(w, w.pointField(id), 700, 80, 700, 160);
  assert.ok(k > 0, `건물 뒤: ${k}`);
});

test('한 틱에 다시 계산하는 흐름장은 fieldBudget개까지', () => {
  const w = game(), ids = [[700, 160], [720, 160], [680, 170], [700, 190]].map(([x, z]) => pointFieldId(w, x, z));
  for (const id of ids) w.pointField(id);
  addBuilding(w, 0, 'barracks', 700, 120);
  const c = w.map.cellOf(700, 120);
  const fresh = () => ids.map(id => w.pointField(id)[c] === Infinity);
  assert.equal(w.rules.build.fieldBudget, 2);
  assert.deepEqual(fresh(), [true, true, false, false]);
  step(w);
  assert.deepEqual(fresh(), [true, true, true, true]);
});

test('건물 밑에 선 병사는 밖으로 나오고 자리 목표도 옮겨진다', () => {
  const w = game(), s = w.soldiers, ids = [];
  for (let k = 0; k < 30; k++) {
    const x = 697 + (k % 6) * 1.2, z = 117 + Math.floor(k / 6) * 1.2, i = spawn(s, 0, INFANTRY, x, z, w.rules);
    s.goalKind[i] = 4; s.goalX[i] = x; s.goalZ[i] = z; ids.push(i);
  }
  addBuilding(w, 0, 'barracks', 700, 120);
  run(w, 2);
  for (const i of ids) {
    assert.ok(w.map.walkable(s.x[i], s.z[i]), `병사 ${i} (${s.x[i].toFixed(1)}, ${s.z[i].toFixed(1)})`);
    assert.ok(w.map.walkable(s.goalX[i], s.goalZ[i]), `목표 ${i}`);
  }
});

test('행군 쐐기 가운데에 건물을 놓아도 쐐기가 멈춰 서지 않는다', () => {
  const w = game(), s = w.soldiers, ids = [];
  for (let k = 0; k < 100; k++) ids.push(spawn(s, 0, INFANTRY, 694 + (k % 10) * 1.2, 54 + Math.floor(k / 10) * 1.2, w.rules));
  assert.equal(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids }, target: { kind: 'point', x: 700, z: 200 } }).ok, true);
  run(w, 3);
  const g = w.groups.find(q => q.members.some(i => ids.includes(i)));
  assert.ok(g, '행군 쐐기');
  addBuilding(w, 0, 'barracks', g.x, g.z);
  run(w, 60);
  const there = ids.filter(i => s.alive[i] && Math.hypot(s.x[i] - 700, s.z[i] - 200) <= 25).length;
  assert.ok(there > 80, `닿은 병사 ${there}/100`);
});

test('놓을 수 있나', () => {
  const w = game(), why = (type, x, z, side = 0) => canPlace(w, side, type, x, z).reason;
  assert.equal(why('tavern', 700, 120), '모르는 건물');
  assert.equal(why('citadel', 700, 120), '지을 수 없는 건물');
  assert.equal(why('barracks', -5, 120), '판 밖');
  assert.equal(why('barracks', NaN, 120), '판 밖');
  assert.equal(why('workshop', 700, 120), '병영이(가) 먼저 있어야 한다');
  assert.equal(why('barracks', 330, 140), '우리 땅에만 지을 수 있다');                     // 금광 지대(중립)
  assert.equal(why('barracks', 630, 70), '깃발 둘레에는 지을 수 없다');
  addBuilding(w, 0, 'barracks', 700, 120, { done: true });
  assert.equal(why('stable', 712, 120), '다른 건물과 겹친다');
  assert.equal(why('barracks', 550, 70), '자원 자리를 막는다');                           // 본진 금 자리 (550, 62)에서 8 m
  assert.equal(why('barracks', 492, 118), '막힌 땅');                                    // 본진 왼쪽 바위 등성이
  assert.equal(why('barracks', 640, 150, 1), '우리 땅에만 지을 수 있다');               // 편 1에게는 남의 땅
  const ok = canPlace(w, 0, 'workshop', 640, 150);
  assert.equal(ok.ok, true, ok.reason);
  assert.deepEqual([ok.x, ok.z, ok.deposit], [640, 150, -1]);
});

test('채굴기는 빈 자원 자리에 붙는다', () => {
  const w = game(), gold = depositAt(w, 550, 62);
  assert.ok(gold && gold.kind === 'gold');
  const at = canPlace(w, 0, 'goldmine', 559, 62);
  assert.equal(at.ok, true, at.reason);
  assert.deepEqual([at.x, at.z, at.deposit], [gold.x, gold.z, gold.id]);
  const b = addBuilding(w, 0, 'goldmine', at.x, at.z, { deposit: at.deposit });
  assert.equal(w.depositUse[gold.id], b.id);
  assert.equal(canPlace(w, 0, 'goldmine', 552, 62).reason, '이미 지은 자리');
  assert.equal(canPlace(w, 0, 'goldmine', 570, 62).reason, '금 자리 위에 지어야 한다');
  assert.equal(canPlace(w, 0, 'lumbermill', 556, 30).reason, '목재 자리 위에 지어야 한다');
  removeBuilding(w, b);
  assert.equal(w.depositUse[gold.id], -1);
  assert.equal(canPlace(w, 0, 'goldmine', 552, 62).ok, true);
});

test('시험장 지도에는 못 짓는다', () => {
  const w = createWorld();
  assert.equal(canPlace(w, 0, 'barracks', 600, 250).reason, '우리 땅에만 지을 수 있다');
});
