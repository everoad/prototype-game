// 연구(3단계 계획 Task 6 — 홍수의 강화 병종 셋): 끝나면 그 편의 그 병종 모두와 그 뒤 뽑는 병사가 강화(elite).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/sim/world.js';
import { spawn } from '../src/sim/soldiers.js';
import { applyOrder } from '../src/sim/orders.js';
import { addBuilding } from '../src/sim/buildings.js';
import { SPEAR, INFANTRY } from '../src/sim/rules.js';

const run = (w, sec) => { const n = Math.round(sec / w.rules.dt); for (let k = 0; k < n; k++) step(w); };
function base() {
  const w = createWorld({ map: 'legion' });
  addBuilding(w, 0, 'citadel', 600, 48, { done: true });
  addBuilding(w, 1, 'citadel', 600, 752, { done: true });
  const b = addBuilding(w, 0, 'barracks', 700, 120, { done: true });
  Object.assign(w.sides[0], { gold: 2000, wood: 2000, mana: 500 });
  return { w, b };
}
const research = (w, b, key, side = 0) => applyOrder(w, { kind: 'research', side, building: b.id, key });
const mine = (w, side, type) => { const s = w.soldiers, out = []; for (let i = 0; i < s.count; i++) if (s.alive[i] && s.side[i] === side && s.type[i] === type) out.push(i); return out; };

test('방패벽: 값이 나가고 40초 뒤 그 편 창병 모두와 새로 뽑는 창병이 강화', () => {
  const { w, b } = base(), s = w.soldiers, S = w.sides[0];
  const old = Array.from({ length: 20 }, (_, k) => spawn(s, 0, SPEAR, 650 + k, 200, w.rules));
  const inf = Array.from({ length: 10 }, (_, k) => spawn(s, 0, INFANTRY, 650 + k, 205, w.rules));
  assert.equal(research(w, b, 'shieldwall').ok, true);
  assert.deepEqual([S.gold, S.mana], [1800, 400]);
  assert.ok(S.researching.has('shieldwall'));
  run(w, 39);
  assert.ok(old.every(i => s.elite[i] === 0), '아직');
  run(w, 1.5);
  assert.ok(S.research.has('shieldwall') && !S.researching.has('shieldwall'));
  assert.ok(old.every(i => s.elite[i] === 1), '있던 창병');
  assert.ok(inf.every(i => s.elite[i] === 0), '보병은 그대로');
  assert.ok(w.notices.some(n => n.side === 0 && n.kind === 'research' && n.text === '방패벽 연구 완료'));
  assert.equal(applyOrder(w, { kind: 'train', side: 0, building: b.id, unit: 'spear' }).ok, true);
  run(w, 26);
  const fresh = mine(w, 0, SPEAR).filter(i => !old.includes(i));
  assert.equal(fresh.length, 150);
  assert.ok(fresh.every(i => s.elite[i] === 1), '새로 뽑은 창병');
});

test('같은 연구는 한 번만, 취소하면 다시 걸 수 있다', () => {
  const { w, b } = base(), S = w.sides[0];
  assert.equal(research(w, b, 'longbow').ok, true);
  assert.equal(research(w, b, 'longbow').reason, '이미 했거나 하는 중이다');
  const g = S.gold;
  assert.equal(applyOrder(w, { kind: 'cancel', side: 0, building: b.id }).ok, true);
  assert.equal(S.gold, g + 200);
  assert.equal(S.researching.has('longbow'), false);
  assert.equal(research(w, b, 'longbow').ok, true);
  run(w, 41);
  assert.equal(research(w, b, 'longbow').reason, '이미 했거나 하는 중이다');
});

test('마구간에서 방패벽은 못 한다', () => {
  const { w } = base(), st = addBuilding(w, 0, 'stable', 640, 170, { done: true });
  assert.equal(research(w, st, 'shieldwall').reason, '여기서 못 한다');
  assert.equal(research(w, st, 'heavycav').ok, true);
});

test('연구는 다른 편 병사에 닿지 않는다', () => {
  const { w, b } = base(), s = w.soldiers, theirs = Array.from({ length: 10 }, (_, k) => spawn(s, 1, SPEAR, 650 + k, 600, w.rules));
  research(w, b, 'shieldwall');
  run(w, 41);
  assert.ok(theirs.every(i => s.elite[i] === 0));
  assert.equal(w.sides[1].research.has('shieldwall'), false);
});

test('거절하면 자원이 그대로다', () => {
  const { w, b } = base(), S = w.sides[0], half = addBuilding(w, 0, 'barracks', 640, 170);
  const before = [S.gold, S.wood, S.mana];
  S.mana = 0;
  assert.equal(research(w, b, 'shieldwall').reason, '마나가 모자라다');
  S.mana = before[2];
  for (const id of [-1, 999, 'x']) assert.equal(applyOrder(w, { kind: 'research', side: 0, building: id, key: 'shieldwall' }).reason, '건물이 없다');
  assert.equal(research(w, half, 'shieldwall').reason, '아직 짓는 중이다');
  assert.equal(research(w, b, 'fireball').reason, '여기서 못 한다');
  assert.equal(research(w, b, 'shieldwall', 1).reason, '건물이 없다');
  assert.deepEqual([S.gold, S.wood, S.mana], before);
  assert.equal(S.researching.size, 0);
  for (const u of ['infantry', 'spear', 'archer', 'infantry', 'spear']) applyOrder(w, { kind: 'train', side: 0, building: b.id, unit: u });
  assert.equal(research(w, b, 'shieldwall').reason, '생산 줄이 가득 찼다');
});
