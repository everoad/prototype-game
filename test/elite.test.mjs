// 생산 건물 2단계(사용자 2026-11-07): 그 거점에서 나오는 병사가 강화 병종이 된다.
// 창 막사 → 방패벽 창병(정면 원거리 ×0.2), 사격장 → 장궁수(사거리 +15 m), 마구간 → 중기병(체력 ×1.3, 버티는 창의 상성 ×1.25).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, setGoal } from '../src/sim/world.js';
import { spawn } from '../src/sim/soldiers.js';
import { SPEAR, ARCHER, CAVALRY, makeRules } from '../src/sim/rules.js';
import { damagePerSecond, rangeOf } from '../src/sim/combat.js';
import { applyOrder } from '../src/sim/orders.js';
import { produceAt } from '../src/sim/production.js';

const empty = () => createWorld({ scenario: 'empty', seed: 1 });

test('2단계 건물이 있는 거점에서 나온 그 병종만 강화 병종이다', () => {
  const w = empty(), st = w.strongholds.find(x => x.id === 'f0L');
  st.garrisonWeight = 1e9;                                   // 수비대는 찼다(나오는 병사는 쐐기로)
  st.slots[0] = { kind: 'stable', level: 2, hp: 2000 };
  const rider = produceAt(w, st, CAVALRY), archer = produceAt(w, st, ARCHER);
  assert.equal(w.soldiers.elite[rider], 1);
  assert.equal(w.soldiers.elite[archer], 0);
  assert.equal(w.soldiers.hp[rider], w.rules.units[0][CAVALRY].hp * w.rules.elite.hpMult, '중기병 체력 ×1.3');
});

test('방패벽 창병: 정면 원거리 ×0.2 · 중기병: 버티는 창의 상성 ×1.25', () => {
  const r = makeRules();
  const shot = { atkSide: 1, atkType: ARCHER, tgtSide: 0, tgtType: SPEAR, ranged: true, angleDeg: 0 };
  assert.equal(damagePerSecond(shot, r), 3 * 0.5);
  assert.equal(damagePerSecond({ ...shot, tgtElite: true }, r), 3 * 0.2);
  const pike = { atkSide: 1, atkType: SPEAR, tgtSide: 0, tgtType: CAVALRY, angleDeg: 0 };
  assert.equal(damagePerSecond(pike, r), 6 * 2.5);
  assert.equal(damagePerSecond({ ...pike, tgtElite: true }, r), 6 * 1.25);
});

test('장궁수 사거리 55 m', () => {
  const w = empty(), s = w.soldiers;
  const a = spawn(s, 0, ARCHER, 600, 300, w.rules), b = spawn(s, 0, ARCHER, 610, 300, w.rules);
  s.elite[b] = 1;
  assert.equal(rangeOf(w, a), 40);
  assert.equal(rangeOf(w, b), 55);
});

test('생산 건물도 올릴 수 있다(값 ×1.5)', () => {
  const w = empty(), st = w.strongholds.find(x => x.id === 'f0L');
  st.slots[0] = { kind: 'archery', level: 1, hp: 2000 };
  w.sides[0].gold = 1000;
  assert.equal(applyOrder(w, { kind: 'upgrade', side: 0, stronghold: 'f0L', slot: 0 }).ok, true);
  assert.equal(w.sides[0].gold, 1000 - 180);
  assert.equal(st.slots[0].level, 2);
});

test('방패벽 창은 옆·뒤에서 온 원거리도 ×0.5만 받는다(앞은 ×0.2)', () => {
  const r = makeRules();
  const shot = { atkSide: 1, atkType: ARCHER, tgtSide: 0, tgtType: SPEAR, ranged: true, tgtElite: true };
  assert.equal(damagePerSecond({ ...shot, angleDeg: 90 }, r), 3 * 1.2 * 0.5);
  assert.equal(damagePerSecond({ ...shot, angleDeg: 150 }, r), 3 * 1.5 * 0.5);
  assert.equal(damagePerSecond({ ...shot, tgtElite: false, angleDeg: 90 }, r), 3 * 1.2, '보통 창은 옆이 그대로');
});
