// 특수 병종 표(6-1단계 계획 Task 1, 설계서 §7 "6단계 설계"): 번호·이름·갈래, 시작 수치, 몬스터 거울 짝, 몸, 부대 크기, 진형 갈래.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRules, MAGE, PRIEST, KNIGHT, GOLEM, ARCHER, CAVALRY, WORKER } from '../src/sim/rules.js';
import { classOf, FRONT_ORDER } from '../src/sim/groups.js';
import { batchOf } from '../src/sim/produce.js';

const SP = [MAGE, PRIEST, KNIGHT, GOLEM], KEYS = ['mage', 'priest', 'knight', 'golem'];

test('특수 병종 넷: 번호·이름·갈래·싸우지 않음', () => {
  const R = makeRules();
  assert.deepEqual(SP, [6, 7, 8, 9]);
  assert.deepEqual(R.units[0].slice(6).map(u => u.name), ['엘프 화염 마법사', '인간 사제', '인간 기사', '드워프 룬 골렘']);
  assert.deepEqual(R.units[1].slice(6).map(u => u.name), ['고블린 주술사', '오크 무당', '멧돼지 기수', '트롤']);
  for (const side of [0, 1, 2]) R.units[side].slice(0, 6).forEach((u, t) => assert.equal(u.cls, t, `기본 병종 갈래 ${side}/${t}`));
  for (const side of [0, 1]) {
    const U = R.units[side];
    assert.deepEqual(SP.map(t => U[t].cls), [ARCHER, PRIEST, CAVALRY, GOLEM]);
    assert.ok(U[WORKER].noncombat && U[PRIEST].noncombat && !U[MAGE].noncombat && !U[GOLEM].noncombat);
  }
});

test('사람 편 시작 수치(설계서 표)', () => {
  const U = makeRules({ speed: 1 }).units[0];
  assert.deepEqual([U[MAGE].hp, U[MAGE].dps, U[MAGE].range, U[MAGE].speed, U[MAGE].splash, U[MAGE].splashMax, U[MAGE].splashShare], [300, 8, 35, 2.6, 4, 10, 0.6]);
  assert.deepEqual([U[PRIEST].hp, U[PRIEST].dps, U[PRIEST].speed, U[PRIEST].heal, U[PRIEST].healRange], [300, 0, 3, 20, 16]);
  assert.deepEqual([U[KNIGHT].hp, U[KNIGHT].dps, U[KNIGHT].speed, U[KNIGHT].chargeMult, U[KNIGHT].chargeKnock, !!U[KNIGHT].charges], [1440, 26, 8, 3, 3, true]);
  assert.deepEqual([U[GOLEM].hp, U[GOLEM].dps, U[GOLEM].speed, U[GOLEM].spacing, U[GOLEM].splash, U[GOLEM].splashMax, U[GOLEM].splashShare, U[GOLEM].knock, U[GOLEM].rangedTaken, !!U[GOLEM].noRout, !!U[GOLEM].anvil], [15000, 60, 2.2, 2.5, 2, 3, 0.5, 3, 0.5, true, true]);
});

test('거울: 몬스터 짝은 같은 규칙, 체력·화력 ×0.6, 간격 ×0.75', () => {
  const R = makeRules();
  const same = ['range', 'speed', 'splash', 'splashMax', 'splashShare', 'heal', 'healRange', 'chargeMult', 'chargeKnock', 'knock', 'rangedTaken', 'noRout', 'anvil', 'charges', 'noncombat', 'cls'];
  for (const t of SP) {
    const a = R.units[0][t], b = R.units[1][t];
    for (const k of same) assert.equal(b[k], a[k], `${a.name} ${k}`);
    assert.ok(Math.abs(b.hp - a.hp * 0.6) < 1e-9 && Math.abs(b.dps - a.dps * 0.6) < 1e-9, a.name);
    assert.ok(Math.abs((b.spacing ?? 0.8) - (a.spacing ?? 0.8) * 0.75) < 1e-9, a.name);
  }
});

test('몸: 골렘 0.85, 트롤 0.5375(간격 2.5 × 0.75 = 1.875), 기본 병종(좁은 고블린 떼 포함) 0', () => {
  const R = makeRules();
  assert.ok(Math.abs(R.units[0][GOLEM].body - 0.85) < 1e-9 && Math.abs(R.units[1][GOLEM].body - 0.5375) < 1e-9);
  for (const side of [0, 1, 2]) R.units[side].slice(0, 6).forEach(u => assert.equal(u.body, 0, u.name));
});

test('부대 하나: 사람 20·10·40·4, 몬스터 33·17·67·7(부대 무게 같게)', () => {
  const R = makeRules();
  assert.deepEqual(KEYS.map(k => batchOf(R, 0, k).n), [20, 10, 40, 4]);
  assert.deepEqual(KEYS.map(k => batchOf(R, 1, k).n), [33, 17, 67, 7]);
  assert.deepEqual(KEYS.map(k => R.train[k].land ?? null), ['ley', null, 'ranch', 'ruins']);
});

test('모든 병종에 진형 갈래와 앞뒤 차례가 있다', () => {
  const R = makeRules();
  assert.deepEqual(SP.map(classOf), KEYS);
  for (const c of KEYS) { assert.ok(R.group.weightByClass[c] > 0, c); assert.ok(R.group.shape[c], c); }
  R.units[0].forEach((_, t) => assert.ok(Number.isFinite(FRONT_ORDER[t]), `차례 ${t}`));
});
