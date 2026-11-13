// 광부 조(3단계 계획 Task 4, 사용자 2026-11-13 "일꾼만 덩치 크면 이상한데" → 10명 한 조): 조가 함께 가서 짓고 고친다. 싸우지 않는다.
// 다종족 이름(사용자 같은 날 "다종족 국가로"): 사람 편 이름만 바뀌고 수치·번호는 그대로.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/sim/world.js';
import { spawn, ORDER } from '../src/sim/soldiers.js';
import { applyOrder } from '../src/sim/orders.js';
import { addBuilding, removeBuilding } from '../src/sim/buildings.js';
import { spawnCrew, crewMates } from '../src/sim/workers.js';
import { killSoldier } from '../src/sim/combat.js';
import { setupGame } from '../src/sim/game.js';
import { makeRules, SPEAR, ARCHER, CAVALRY, INFANTRY, SIEGE, WORKER } from '../src/sim/rules.js';

const game = () => createWorld({ map: 'legion' });
const tick = (w, n = 1) => { for (let k = 0; k < n; k++) step(w); };
const until = (w, sec, fn) => { const n = Math.round(sec / w.rules.dt); for (let k = 0; k < n; k++) { step(w); if (fn()) return true; } return false; };
const gold = w => w.map.deposits.find(d => Math.hypot(d.x - 550, d.z - 62) < 0.5);   // 본진 금 자리
const build = (w, ids, type, x, z, side = 0) => applyOrder(w, { kind: 'build', side, type, x, z, workers: ids });

test('사람 편 이름은 다종족, 번호와 수치는 그대로', () => {
  const r = makeRules(), names = r.units[0].slice(0, 6).map(u => u.name);   // 기본 병종 여섯(6~9 특수 병종은 specials-rules.test)
  assert.equal(WORKER, 5);
  assert.deepEqual(names, ['드워프 방패병', '엘프 궁수', '인간 기병', '인간 보병', '드워프 투석기', '드워프 광부']);
  assert.deepEqual(r.units[1].slice(0, 4).map(u => u.name), ['창 고블린', '투척꾼', '늑대 기수', '고블린']);
  assert.equal(r.units[1][WORKER].name, '잡역 고블린');
  assert.equal(r.units[0][SPEAR].hp, 600);
  assert.equal(r.units[0][SPEAR].holdsLine, true);
  for (const side of [0, 1]) assert.deepEqual([r.units[side][WORKER].hp, r.units[side][WORKER].dps, r.units[side][WORKER].worker], [150, 0, true]);
  assert.deepEqual([r.units[0][ARCHER].range, r.units[0][CAVALRY].dps, r.units[0][INFANTRY].speed, r.units[0][SIEGE].catapult], [40, 22, 3.5 * 1.25, true]);
});

// 짓기 시간: 본진 금 자리 옆 8 m에 조(들)를 세우고 build — 명령부터 다 지을 때까지
function buildTime(crews, keep = Infinity) {
  const w = game(), d = gold(w), ids = [];
  for (let c = 0; c < crews; c++) ids.push(...spawnCrew(w, 0, d.x, d.z + 8 + c * 3, -Math.PI / 2));
  const all = [...ids];
  for (const i of ids.slice(keep)) killSoldier(w, i);
  const r = build(w, all.slice(0, 1), 'goldmine', d.x, d.z);
  assert.equal(r.ok, true, r.reason);
  for (let c = 1; c < crews; c++) assert.equal(applyOrder(w, { kind: 'assist', side: 0, building: r.id, workers: [ids[c * 10]] }).ok, true);
  const b = w.buildingById.get(r.id), t0 = w.time;
  assert.ok(until(w, 40, () => b.done), '다 지었다');
  assert.ok(Math.abs(b.hp - b.maxHp) < 1e-6, `체력 ${b.hp}`);
  return w.time - t0;
}

test('광부 조 하나(10명)가 금광을 12초에 짓는다, 두 조면 6초, 다섯 명이면 24초', () => {
  const one = buildTime(1), two = buildTime(2), five = buildTime(1, 5);
  assert.ok(Math.abs(one - 12) <= 1, `한 조 ${one.toFixed(2)}초`);
  assert.ok(Math.abs(two - 6) <= 1, `두 조 ${two.toFixed(2)}초`);
  assert.ok(Math.abs(five - 24) <= 1, `다섯 명 ${five.toFixed(2)}초`);
});

test('짓는 사람은 maxBuilders(20)까지 센다', () => {
  const t = buildTime(3);
  assert.ok(Math.abs(t - 6) <= 1, `세 조 ${t.toFixed(2)}초`);
});

test('build 명령: 값이 나가고 가장 가까운 놀고 있는 일꾼의 조 전체가 간다', () => {
  const w = game(), s = w.soldiers;
  const A = spawnCrew(w, 0, 640, 110, 0), B = spawnCrew(w, 0, 700, 110, 0), C = spawnCrew(w, 0, 760, 110, 0);
  assert.equal(new Set([...A, ...B, ...C].map(i => s.crew[i])).size, 3);
  assert.deepEqual(crewMates(w, B[3]).sort((a, b) => a - b), [...B].sort((a, b) => a - b));
  const r = build(w, [B[7]], 'barracks', 700, 140);
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual([w.sides[0].gold, w.sides[0].wood], [250, 150]);
  assert.ok(B.every(i => s.job[i] === r.id), '그 조 열 명');
  assert.ok([...A, ...C].every(i => s.job[i] === -1), '다른 조는 그대로');
  tick(w);
  const r2 = build(w, [...A, ...B, ...C], 'goldmine', gold(w).x, gold(w).z);   // (550, 62) — A가 가장 가깝다
  assert.equal(r2.ok, true, r2.reason);
  assert.ok(A.every(i => s.job[i] === r2.id), '쉬는 조 가운데 가장 가까운 조');
  assert.ok(B.every(i => s.job[i] === r.id) && C.every(i => s.job[i] === -1));
});

test('거절하면 자원이 그대로다', () => {
  const w = game(), s = w.soldiers, crew = spawnCrew(w, 0, 700, 110, 0), foes = spawnCrew(w, 1, 700, 690, 0);
  const inf = spawn(s, 0, INFANTRY, 690, 110, w.rules), dead = crew[9];
  killSoldier(w, dead);
  const before = () => [w.sides[0].gold, w.sides[0].wood, w.buildings.length];
  const b0 = before();
  for (const ids of [[], [dead], foes, [-1, 1e9], [inf], ['x']]) assert.equal(build(w, ids, 'barracks', 700, 140).reason, '광부를 골라야 한다', JSON.stringify(ids));
  assert.equal(build(w, crew, 'barracks', 630, 70).reason, '깃발 둘레에는 지을 수 없다');
  w.sides[0].gold = 0;
  assert.equal(build(w, crew, 'barracks', 700, 140).reason, '금이 모자라다');
  assert.deepEqual(before(), [0, b0[1], b0[2]]);
  assert.equal(applyOrder(w, { kind: 'build', side: 0, type: 'barracks', x: 700, z: 140 }).reason, '광부를 골라야 한다');
});

test('고치기', () => {
  const w = game(), s = w.soldiers, b = addBuilding(w, 0, 'barracks', 700, 140, { done: true }), crew = spawnCrew(w, 0, 700, 125, -Math.PI / 2);
  assert.equal(applyOrder(w, { kind: 'assist', side: 0, building: b.id, workers: crew }).reason, '할 일이 없다');
  b.hp = 1500;
  assert.equal(applyOrder(w, { kind: 'assist', side: 0, building: b.id, workers: [crew[0]] }).ok, true);
  assert.ok(crew.every(i => s.job[i] === b.id), '조 전체');
  assert.ok(until(w, 10, () => crew.every(i => Math.hypot(s.x[i] - b.x, s.z[i] - b.z) <= b.r + w.rules.build.reach)), '모두 닿았다');
  const h0 = b.hp; tick(w, 40);
  const rate = (b.hp - h0) / 2;
  assert.ok(Math.abs(rate - 60) <= 6, `초당 ${rate.toFixed(1)}`);
  assert.ok(until(w, 40, () => b.hp >= b.maxHp), '가득');
  tick(w, 2);
  assert.ok(crew.every(i => s.job[i] === -1), '일이 끝나면 쉰다');
  assert.equal(applyOrder(w, { kind: 'assist', side: 0, building: 999, workers: crew }).reason, '건물이 없다');
  assert.equal(applyOrder(w, { kind: 'assist', side: 1, building: b.id, workers: crew }).reason, '건물이 없다');
});

test('일꾼은 적을 노리지 않고 적이 닿아도 일터로 간다, 적은 일꾼을 친다', () => {
  const w = game(), s = w.soldiers, crew = spawnCrew(w, 0, 700, 96, Math.PI / 2);
  w.rules.units[1][INFANTRY].speed = 0;
  for (let k = 0; k < 5; k++) spawn(s, 1, INFANTRY, 695 + k * 2.5, 122, w.rules);
  const r = build(w, crew, 'barracks', 700, 150);
  assert.equal(r.ok, true, r.reason);
  const b = w.buildingById.get(r.id), hp0 = crew.reduce((a, i) => a + s.hp[i], 0);
  let aimed = false;
  const got = until(w, 20, () => { for (const i of crew) if (s.alive[i] && (s.target[i] >= 0 || s.rtarget[i] >= 0)) aimed = true; return b.progress > 0.2; });
  assert.equal(aimed, false, '일꾼이 적을 노렸다');
  assert.ok(got, `일터에 닿아 짓는다(진행 ${b.progress.toFixed(2)})`);
  assert.ok(crew.reduce((a, i) => a + (s.alive[i] ? s.hp[i] : 0), 0) < hp0, '적이 일꾼을 쳤다');
});

test('일꾼은 점령 무게에 들지 않는다', () => {
  const w = game(), g = w.map.regions.find(r => r.role === 'gold' && r.z < 400);
  spawnCrew(w, 0, g.x, g.z, 0);
  tick(w, 600);
  const t = w.territory[g.id];
  assert.deepEqual([t.owner, t.prog, t.capturer], [-1, 0, -1]);
});

test('보내기: 일꾼은 쐐기에 끼지 않는다', () => {
  const w = game(), s = w.soldiers, crew = spawnCrew(w, 0, 700, 110, 0), inf = [];
  for (let k = 0; k < 30; k++) inf.push(spawn(s, 0, INFANTRY, 680 + (k % 10) * 1.2, 120 + Math.floor(k / 10) * 1.2, w.rules));
  const b = addBuilding(w, 0, 'barracks', 640, 150);
  applyOrder(w, { kind: 'assist', side: 0, building: b.id, workers: crew });
  assert.ok(crew.every(i => s.job[i] === b.id));
  const r = applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: [...inf, ...crew] }, target: { kind: 'point', x: 720, z: 200 } });
  assert.equal(r.ok, true);
  assert.ok(crew.every(i => s.job[i] === -1 && s.group[i] === -1 && s.order[i] === ORDER.MOVE));
  assert.ok(until(w, 40, () => crew.every(i => Math.hypot(s.x[i] - 720, s.z[i] - 200) <= 15)), '일꾼도 닿았다');
  const only = applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: crew }, target: { kind: 'point', x: 700, z: 160 } });
  assert.equal(only.ok, true, '일꾼만 보내기도 된다');
  const foe = spawn(s, 1, INFANTRY, 760, 220, w.rules), gx = s.goalX[crew[0]], gz = s.goalZ[crew[0]];
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: [...inf, ...crew] }, target: { kind: 'foe', id: foe, serial: s.serial[foe] } });
  assert.deepEqual([s.goalX[crew[0]], s.goalZ[crew[0]]], [gx, gz], '적 공격에는 일꾼이 빠진다');
});

test('건물이 사라지면 그 조는 놀게 된다', () => {
  const w = game(), s = w.soldiers, crew = spawnCrew(w, 0, 700, 110, 0), b = addBuilding(w, 0, 'barracks', 700, 140);
  applyOrder(w, { kind: 'assist', side: 0, building: b.id, workers: crew });
  tick(w);
  removeBuilding(w, b);
  tick(w);
  assert.ok(crew.every(i => s.job[i] === -1));
});

test('게임 판: 편마다 광부 조 셋(30명), 조 번호 셋', () => {
  const w = game(), s = w.soldiers;
  setupGame(w);
  for (const side of [0, 1]) {
    const ids = [];
    for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === side && s.type[i] === WORKER) ids.push(i);
    assert.equal(ids.length, 30);
    assert.equal(new Set(ids.map(i => s.crew[i])).size, 3);
    for (const i of ids) assert.ok(w.map.walkable(s.x[i], s.z[i]));
  }
});
