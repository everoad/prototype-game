// PC 조작(설계서 §5, 사용자 2026-11-08): 고른 병사 보내기, "그 자리"로 보내기, 곳을 눌러 고르는 병사.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, setGoal } from '../src/sim/world.js';
import { spawn, kill, STATE, GOAL } from '../src/sim/soldiers.js';
import { SPEAR, ARCHER } from '../src/sim/rules.js';
import { applyOrder } from '../src/sim/orders.js';
import { boxTroops, byType, idleOnly } from '../src/view/select.js';
import { INFANTRY } from '../src/sim/rules.js';
import { ORDER } from '../src/sim/soldiers.js';
import { placeBlock } from './helpers.mjs';

const run = (w, sec) => { for (let k = 0; k < sec * 20; k++) step(w); };
const empty = () => createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } });

// (x, z) 둘레에 우리(또는 side) 병사 n명 — 그 자리에 세운다(홍수: 우리 편은 구역 s0-left 소속).
function standAt(w, n, x, z, { side = 0, type = SPEAR } = {}) {
  const ids = [];
  for (let k = 0; k < n; k++) {
    const id = spawn(w.soldiers, side, type, x + (k % 8) * 1.6, z + Math.floor(k / 8) * 1.6, w.rules);
    if (side === 0) setGoal(w, [id], { kind: 'point', x: w.soldiers.x[id], z: w.soldiers.z[id] });
    w.soldiers.state[id] = STATE.FRONT;
    ids.push(id);
  }
  return ids;
}

test('고른 병사 보내기: 우리 편·살아 있는 병사만 간다', () => {
  const w = empty();
  const ours = standAt(w, 10, 300, 300);
  const foe = standAt(w, 2, 300, 340, { side: 1 });
  const dead = standAt(w, 1, 300, 310)[0];
  kill(w.soldiers, dead);
  const r = applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: [...ours, ...foe, dead] }, target: { kind: 'point', x: 600, z: 390 } });
  assert.ok(r.ok, r.reason);
  assert.equal(r.count, 10);
  for (const i of ours) assert.ok(w.soldiers.group[i] >= 0, '우리 병사는 진형으로 간다');
  for (const i of foe) assert.equal(w.soldiers.group[i], -1);
});

test('행군 중인 쐐기에서 고른 병사는 그 쐐기에서 빠지고, 다 빠진 쐐기는 바로 지운다', () => {
  const w = empty();
  const a = standAt(w, 12, 300, 300), b = standAt(w, 12, 600, 300);
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: a }, target: { kind: 'point', x: 600, z: 390 } });
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: b }, target: { kind: 'point', x: 940, z: 390 } });
  const ga = w.soldiers.group[a[0]], gb = w.soldiers.group[b[0]];
  assert.notEqual(ga, -1); assert.notEqual(gb, -1);
  // a 쐐기는 통째로, b 쐐기는 절반만 다시 보낸다
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: [...a, ...b.slice(0, 6)] }, target: { kind: 'point', x: 260, z: 390 } });
  assert.ok(!w.groups.some(g => g.id === ga), '다 빠진 쐐기 a는 없다');
  const left = w.groups.find(g => g.id === gb);
  assert.ok(left, '쐐기 b는 남은 병사로 간다');
  assert.deepEqual([...left.members].sort((x, y) => x - y), b.slice(6).sort((x, y) => x - y));
  for (const i of [...a, ...b.slice(0, 6)]) assert.notEqual(w.soldiers.group[i], gb);
});

test('그 자리로 보내기: 한 점에 엉기지 않게 무리 크기에 맞춘 원 안에 흩어 선다', () => {
  const w = empty();
  const ids = standAt(w, 60, 300, 300, { type: ARCHER });
  const r = applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids }, target: { kind: 'point', x: 320, z: 220 } });
  assert.ok(r.ok, r.reason);
  run(w, 60);
  const s = w.soldiers;
  const spots = new Set(ids.map(i => `${s.goalX[i].toFixed(1)},${s.goalZ[i].toFixed(1)}`));
  assert.ok(spots.size > 50, `자리가 겹치지 않는다(${spots.size}/60)`);
  for (const i of ids) {
    assert.equal(s.goalKind[i], GOAL.POINT);
    assert.ok(Math.hypot(s.goalX[i] - 320, s.goalZ[i] - 220) < 20, '자리는 점 둘레 원 안');
  }
  const near = ids.filter(i => Math.hypot(s.x[i] - 320, s.z[i] - 220) < 25).length;
  assert.ok(near >= 55, `60초 뒤 그 자리에 섰다(${near}/60)`);
});

test('그 자리로 보낸 병사는 강을 돌아(여울로) 간다', () => {
  const w = empty();
  const ids = standAt(w, 16, 200, 300);
  assert.ok(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids }, target: { kind: 'point', x: 100, z: 300 } }).ok);
  run(w, 150);
  const s = w.soldiers, near = ids.filter(i => Math.hypot(s.x[i] - 100, s.z[i] - 300) < 30).length;
  assert.ok(near >= 14, `강 건너 그 자리에 닿았다(${near}/16)`);
});

test('물 위 점으로는 보내지 않는다', () => {
  const w = empty();
  const ids = standAt(w, 4, 200, 300);
  const r = applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids }, target: { kind: 'point', x: 140, z: 300 } });
  assert.equal(r.ok, false);
});

test('네모로 고르기: 화면 네모 안의 우리 병사', () => {
  const w = empty();
  const a = standAt(w, 8, 100, 100), b = standAt(w, 8, 500, 500);
  standAt(w, 4, 101, 102, { side: 1 });
  const project = (x, z) => ({ x, y: z });                    // 시험: 땅 좌표 = 화면 좌표
  const got = boxTroops(w, 0, project, { x0: 90, y0: 90, x1: 130, y1: 130 });
  assert.deepEqual([...got].sort((x, y) => x - y), a);
  assert.ok(!b.some(i => got.includes(i)));
});

test('병종 고르기(사용자 2026-11-10): 고른 병력에서 그 병종만 남기거나(누르기) 그 병종만 뺀다(Shift+누르기)', () => {
  const w = empty();
  const spears = standAt(w, 4, 300, 300), archers = standAt(w, 3, 320, 300, { type: ARCHER });
  const ids = [spears[0], archers[0], ...spears.slice(1), ...archers.slice(1)];
  assert.deepEqual(byType(w, ids, ARCHER), archers);
  assert.deepEqual(byType(w, ids, ARCHER, true), spears);
});

test('고른 병사가 죽고 그 번호를 새 병사가 받으면 새 병사는 고른 것이 아니다', async () => {
  const { remember, stillSelected } = await import('../src/view/select.js');
  const w = empty();
  const ids = standAt(w, 3, 300, 300);
  const sel = remember(w, ids);
  kill(w.soldiers, ids[1]);
  const reborn = spawn(w.soldiers, 0, SPEAR, 300, 300, w.rules);
  assert.equal(reborn, ids[1], '죽은 번호를 다시 쓴다');
  assert.deepEqual(stillSelected(w, 0, sel).ids, [ids[0], ids[2]]);
});

test('오른쪽 클릭 목표: 누른 그 자리, 물 위면 null(홍수의 거점·구역 잡기는 옛 판과 함께 뺐다)', async () => {
  const { rightClickTarget } = await import('../src/view/select.js');
  const w = empty();
  assert.deepEqual(rightClickTarget(w, 0, { x: 520, z: 330 }), { kind: 'point', x: 520, z: 330 });
  assert.equal(rightClickTarget(w, 0, { x: 140, z: 300 }), null, '물 위');
});

test('보내기 목표: 누른 곳 밑에 적이 있으면 그 적 공격, 없으면 그 자리', async () => {
  const { sendTarget } = await import('../src/view/select.js');
  const w = empty();
  const loose = spawn(w.soldiers, 1, SPEAR, 520, 320, w.rules);
  assert.deepEqual(sendTarget(w, 0, { x: 521, z: 320 }, loose), { kind: 'foe', id: loose, serial: w.soldiers.serial[loose] });
  assert.deepEqual(sendTarget(w, 0, { x: 600, z: 400 }, -1), { kind: 'point', x: 600, z: 400 }, '적이 없으면 그 자리');
});

// 성벽·건물 체력 보이기(사용자 2026-11-09 "지금도 건물 성벽 체력은 보여야 할 것 같다")
test('idleOnly: 무리·명령·적·맞닿음이 없는 병사만 남긴다', () => {
  const w = createWorld({ seed: 1, scenario: 'regions' });
  const ids = placeBlock(w, 0, INFANTRY, 600, 200, 4);
  w.soldiers.group[ids[1]] = 0; w.soldiers.order[ids[2]] = ORDER.MOVE; w.soldiers.inContact[ids[3]] = 1;
  assert.deepEqual(idleOnly(w, ids), [ids[0]]);
});

// ---- 3단계(광부 조) ----
import { armyFirst, crewAt, idleCrews } from '../src/view/select.js';
import { spawnCrew } from '../src/sim/workers.js';
import { addBuilding } from '../src/sim/buildings.js';

test('네모 고르기에서 병사가 섞이면 광부는 뺀다, 광부만이면 그대로', () => {
  const w = createWorld({ map: 'legion' }), crew = spawnCrew(w, 0, 650, 120, 0), inf = spawn(w.soldiers, 0, INFANTRY, 660, 130, w.rules);
  assert.deepEqual(armyFirst(w, [...crew, inf]), [inf]);
  assert.deepEqual(armyFirst(w, crew), crew);
  assert.deepEqual(armyFirst(w, []), []);
});

test('누른 곳의 광부 조, 쉬는 조 모두', () => {
  const w = createWorld({ map: 'legion' }), s = w.soldiers, a = spawnCrew(w, 0, 650, 120, 0), b = spawnCrew(w, 0, 700, 120, 0);
  spawnCrew(w, 1, 650, 680, 0);
  assert.deepEqual(crewAt(w, 0, 701, 120, 4).sort((x, y) => x - y), [...b].sort((x, y) => x - y));
  assert.deepEqual(crewAt(w, 0, 680, 120, 4), []);
  assert.deepEqual(crewAt(w, 0, 650, 680, 4), [], '남의 광부');
  const bar = addBuilding(w, 0, 'barracks', 700, 160);
  s.job[b[3]] = bar.id;
  assert.deepEqual(idleCrews(w, 0).sort((x, y) => x - y), [...a].sort((x, y) => x - y));
});
