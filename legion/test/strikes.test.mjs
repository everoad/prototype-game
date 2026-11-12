// 건물 피해와 판 끝(3단계 계획 Task 7): 적 건물 둘레에서 한가한 병사는 건물을 치고(근접 ×0.5·원거리 ×0.25), 투석기는 병사 과녁이 없으면 건물을 쏜다.
// 무너지면 줄·연구·자원 자리·광부 일이 정리되고, 성채가 무너지면 판이 끝난다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/sim/world.js';
import { spawn, ORDER } from '../src/sim/soldiers.js';
import { applyOrder } from '../src/sim/orders.js';
import { addBuilding } from '../src/sim/buildings.js';
import { damageBuilding } from '../src/sim/strikes.js';
import { spawnCrew } from '../src/sim/workers.js';
import { recount } from '../src/sim/economy.js';
import { canSee, updateVision } from '../src/sim/vision.js';
import { INFANTRY, ARCHER, SIEGE } from '../src/sim/rules.js';

const run = (w, sec) => { const n = Math.round(sec / w.rules.dt); for (let k = 0; k < n; k++) step(w); };
const block = (w, side, type, n, x, z, cols = 10, gap = 1.2) => Array.from({ length: n }, (_, k) => {
  const px = x + (k % cols - (cols - 1) / 2) * gap, pz = z + Math.floor(k / cols) * gap, i = spawn(w.soldiers, side, type, px, pz, w.rules);
  w.soldiers.goalKind[i] = 4; w.soldiers.goalX[i] = px; w.soldiers.goalZ[i] = pz;
  return i;
});
function board() {
  const w = createWorld({ map: 'legion' });
  addBuilding(w, 0, 'citadel', 600, 48, { done: true });
  addBuilding(w, 1, 'citadel', 600, 752, { done: true });
  const foe = addBuilding(w, 1, 'barracks', 720, 260, { done: true });   // 편 0 땅 밖 들판
  return { w, foe };
}

test('적 건물로 보낸 보병이 건물을 친다', () => {
  const { w, foe } = board(), inf = block(w, 0, INFANTRY, 60, 700, 150);
  assert.equal(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: inf }, target: { kind: 'building', id: foe.id } }).ok, true);
  run(w, 60);
  assert.ok(foe.hp < foe.maxHp, `병영 체력 ${foe.hp}`);
  assert.ok(foe.lastHit > 0);
});

test('이동 명령으로 지나가는 보병은 건물을 깎지 않는다', () => {
  const { w, foe } = board(), s = w.soldiers, inf = block(w, 0, INFANTRY, 60, 700, 200);
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: inf }, target: { kind: 'point', x: 745, z: 335 } });
  let near = 0;
  for (let k = 0; k < 600; k++) { step(w); for (const i of inf) if (s.order[i] === ORDER.MOVE && Math.hypot(s.x[i] - foe.x, s.z[i] - foe.z) <= foe.r + 5) near++; }
  assert.ok(near > 0, '건물 곁을 지나갔다');
  assert.equal(foe.hp, foe.maxHp);
});

test('서 있는 궁수는 사거리 안 적 건물을 쏜다', () => {
  const { w, foe } = board();
  block(w, 0, ARCHER, 40, 720, 222, 20);                            // 가운데에서 30 m 남짓
  run(w, 10);
  const lost = foe.maxHp - foe.hp;
  assert.ok(Math.abs(lost - 400) <= 60, `10초 ${lost.toFixed(0)}`);
});

test('투석기는 병사 과녁이 없으면 건물을 쏜다, 적 병사가 보이면 병사를 먼저', () => {
  const { w, foe } = board();
  block(w, 0, SIEGE, 3, 720, 190, 3, 6);                            // 70 m 앞
  block(w, 0, INFANTRY, 1, 720, 215, 1);                            // 보는 병사(투석기 시야 60 m 너머를 본다)
  run(w, 9);
  const lost = foe.maxHp - foe.hp;
  assert.ok(lost > 0 && lost % 250 === 0, `잃은 체력 ${lost}`);
  const v = board();
  block(v.w, 0, SIEGE, 3, 720, 190, 3, 6);
  block(v.w, 0, INFANTRY, 1, 720, 215, 1);
  v.w.rules.units[1][INFANTRY].speed = 0;
  block(v.w, 1, INFANTRY, 20, 680, 215, 5);                         // 보이는 적 병사(보는 병사에서 40 m)
  run(v.w, 9);
  assert.equal(v.foe.hp, v.foe.maxHp, '병사를 먼저 쐈다');
});

test('무너지면 뒷정리', () => {
  const w = createWorld({ map: 'legion' }), s = w.soldiers, S = w.sides[0];
  addBuilding(w, 0, 'citadel', 600, 48, { done: true });
  const d = w.map.deposits.find(o => Math.hypot(o.x - 550, o.z - 62) < 0.5);
  const mine = addBuilding(w, 0, 'goldmine', d.x, d.z, { done: true, deposit: d.id });
  const bar = addBuilding(w, 0, 'barracks', 700, 120, { done: true });
  Object.assign(S, { gold: 2000, wood: 2000, mana: 500 });
  applyOrder(w, { kind: 'train', side: 0, building: bar.id, unit: 'infantry' });
  applyOrder(w, { kind: 'research', side: 0, building: bar.id, key: 'longbow' });
  const crew = spawnCrew(w, 0, 700, 100, 0);
  bar.hp = 2000;
  applyOrder(w, { kind: 'assist', side: 0, building: bar.id, workers: crew });
  step(w);
  recount(w);
  assert.ok(S.reserved > 0 && S.researching.has('longbow') && S.rate.gold === 7);
  damageBuilding(w, bar, 1e9);
  damageBuilding(w, mine, 1e9);
  step(w);
  recount(w);
  assert.equal(w.map.walkable(700, 120), true);
  assert.equal(w.depositUse[d.id], -1);
  assert.ok(Math.abs(S.reserved) < 1e-9, `잡아 둠 ${S.reserved}`);
  assert.equal(S.researching.has('longbow'), false);
  assert.ok(crew.every(i => s.job[i] === -1));
  assert.equal(S.rate.gold, 4);
  assert.ok(w.notices.some(n => n.side === 0 && n.kind === 'collapse' && n.text === '병영이(가) 무너졌다'));
  assert.ok(w.notices.some(n => n.side === 0 && n.kind === 'attacked'));
});

test('성채가 무너지면 판이 끝난다', () => {
  const { w } = board();
  const cit = w.buildings.find(b => b.type === 'citadel' && b.side === 1);
  damageBuilding(w, cit, 1e9);
  assert.deepEqual([w.result.winner, w.result.reason], [0, 'citadel']);
  const t = w.tick;
  step(w);
  assert.equal(w.tick, t);
});

test('치지 않는 것', () => {
  const { w, foe } = board(), s = w.soldiers;
  for (const side of [1, 2]) for (const t of w.rules.units[side]) { t.speed = 0; t.dps = 0; }   // 적·중립은 서서 맞기만
  const ours = addBuilding(w, 0, 'barracks', 700, 130, { done: true });
  block(w, 0, INFANTRY, 10, 700, 142);                              // 제 편 건물 곁의 우리 보병
  block(w, 2, INFANTRY, 10, 720, 272);                              // 적 건물 곁의 중립 괴물
  spawnCrew(w, 0, 732, 262, 0);                                      // 적 건물 곁의 우리 광부(건물 주인에게는 적 광부)
  const foes = block(w, 1, INFANTRY, 5, 712, 251.2, 5);
  for (const i of foes) s.hp[i] = 1e6;
  const fighters = block(w, 0, INFANTRY, 5, 712, 250, 5);           // 적 병사와 맞붙은 우리 보병(적 건물 곁)
  run(w, 5);
  assert.ok(fighters.some(i => s.inContact[i] && Math.hypot(s.x[i] - foe.x, s.z[i] - foe.z) <= foe.r + w.rules.buildingDamage.reach), '건물 곁에서 맞붙었다');
  assert.equal(ours.hp, ours.maxHp, '제 편 건물');
  assert.equal(foe.hp, foe.maxHp, '적 건물');
});

test('건물은 시야를 준다', () => {
  const w = createWorld({ map: 'legion' });
  addBuilding(w, 0, 'barracks', 700, 120);                           // 짓는 중에도
  updateVision(w);
  assert.equal(canSee(w, 0, 700, 150), true);
  assert.equal(canSee(w, 0, 700, 230), false);
});

test('틀린 건물 목표는 거절', () => {
  const { w } = board(), inf = block(w, 0, INFANTRY, 5, 700, 150), ours = addBuilding(w, 0, 'barracks', 700, 120, { done: true });
  const dead = addBuilding(w, 1, 'stable', 760, 300, { done: true });
  damageBuilding(w, dead, 1e9);
  for (const id of [ours.id, dead.id, 999, -1]) assert.equal(applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: inf }, target: { kind: 'building', id } }).reason, '칠 건물이 없다');
});
