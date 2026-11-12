import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRules, SPEAR, ARCHER, CAVALRY, INFANTRY } from '../src/sim/rules.js';
import { makeRng } from '../src/sim/rng.js';
import { pick } from './helpers.mjs';

test('우리 병종 수치는 설계서 §6.1 그대로(빠르기는 이동 배율 1일 때)', () => {
  const r = makeRules({ speed: 1 });
  assert.deepEqual(pick(r.units[0][SPEAR], 'hp', 'dps', 'range', 'speed', 'weight'), { hp: 600, dps: 10, range: 1.2, speed: 3.5, weight: 1 });   // 빠르기 3 → 3.5(사용자 2026-11-10)
  assert.deepEqual(pick(r.units[0][ARCHER], 'hp', 'dps', 'range', 'speed', 'weight'), { hp: 360, dps: 4, range: 40, speed: 2.6, weight: 0.6 });   // 빠르기 3 → 2.6(사용자 2026-11-07: 창병이 물러나는 궁수를 못 잡는다), 화력 6 → 4(궁수가 기병을 이겼다)
  assert.deepEqual(pick(r.units[0][CAVALRY], 'hp', 'dps', 'range', 'speed', 'weight'), { hp: 960, dps: 22, range: 1.2, speed: 9, weight: 1.6 });
  assert.deepEqual(pick(r.units[0][INFANTRY], 'hp', 'dps', 'range', 'speed', 'weight', 'holdsLine'), { hp: 600, dps: 10, range: 1.2, speed: 3.5, weight: 1, holdsLine: false });   // 보병(사용자 2026-11-07 시험), 빠르기 3 → 3.5(2026-11-10)
});

test('몬스터: 고블린 무게 0.5, 창 고블린 0.6, 늑대 기수 10 m/s(이동 배율 1)', () => {
  const r = makeRules({ speed: 1 });
  assert.equal(r.units[1][SPEAR].weight, 0.6);
  assert.equal(r.units[1][3].weight, 0.5);
  assert.equal(r.units[1][CAVALRY].speed, 10);
});

test('이동 빠르기는 모든 병종 ×1.25(사용자 2026-11-08: 조금 빠르게)', () => {
  const r = makeRules(), base = makeRules({ speed: 1 });
  for (const side of [0, 1]) r.units[side].forEach((u, t) => assert.equal(u.speed, base.units[side][t].speed * 1.25, u.name));
});

test('병사 수에 붙은 수는 규모 배율을 곱한다', () => {
  const h = makeRules({ scale: 0.5 });
  assert.equal(h.cap, 5000);
});

test('틱 20 Hz', () => {
  assert.equal(makeRules().dt, 0.05);
});

test('시드 난수는 같은 시드에서 같은 수열', () => {
  const a = makeRng(7), b = makeRng(7);
  for (let i = 0; i < 5; i++) assert.equal(a.next(), b.next());
  const c = makeRng(8);
  assert.notEqual(makeRng(7).next(), c.next());
  for (let i = 0; i < 100; i++) { const v = a.int(6); assert.ok(v >= 0 && v < 6 && Number.isInteger(v)); }
});

test('시작 자원은 금 400·목재 300·마나 0(3단계 경제 — 지휘 스킬은 여전히 쿨타임만)', () => {
  const r = makeRules();
  assert.deepEqual(r.economy.start, { gold: 400, wood: 300, mana: 0 });
  assert.equal(r.gold, undefined);
  for (const o of ['march', 'drum', 'volley']) assert.equal(r.orders[o].cost, 0);
});
