// 설계서 §7.3 시야: 병사 60(사용자 2026-11-07: 30 → 넓히자) · 장수 50 · 거점 100 · 망루 250(2단계 300) m, 언덕 ×1.5, 숲 속은 15 m 안에서만(망루는 절반 거리).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRules } from '../src/sim/rules.js';
import { sightRange, canSee, knownBuildings, visibleEnemies, updateVision } from '../src/sim/vision.js';
import { visionWorld } from './helpers.mjs';

test('보는 거리: 병사 60 · 장수 50 · 거점 100 · 망루 250, 언덕 위 ×1.5, 병사 시야 손잡이', () => {
  const r = makeRules();
  assert.equal(sightRange('soldier', false, r), 60);
  assert.equal(sightRange('soldier', false, makeRules({ soldierSight: 80 })), 80);
  assert.equal(sightRange('general', false, r), 50);
  assert.equal(sightRange('stronghold', false, r), 100);
  assert.equal(sightRange('tower', false, r), 250);
  assert.equal(sightRange('tower2', false, r), 300);
  assert.equal(sightRange('soldier', true, r), 90);
});

test('들판 55 m는 보이고, 숲 20 m는 안 보인다. 못 본 적 거점의 건물은 ?', () => {
  const w = visionWorld();                      // 우리 병사 (600,300), 적 병사 (600,325) 들판 / (600,320) 숲
  assert.equal(canSee(w, 0, 600, 325), true);
  assert.equal(canSee(w, 0, 600, 320), false);
  assert.equal(canSee(w, 0, 600, 355), true);   // 55 m
  assert.equal(canSee(w, 0, 600, 380), false);  // 80 m
  assert.deepEqual(visibleEnemies(w, 0).length, 1);
  assert.equal(knownBuildings(w, 0).get('f1L'), '?');
  assert.ok(Array.isArray(knownBuildings(w, 0).get('f0L')), '우리 거점은 늘 안다');
});

test('망루를 지으면 250 m까지 걷히고, 본 적 거점의 건물은 마지막 모습을 기억한다', () => {
  const w = visionWorld();
  const f0L = w.strongholds.find(s => s.id === 'f0L');   // (350, 250)
  assert.equal(canSee(w, 0, 350, 480), false);
  f0L.slots[0] = { kind: 'tower', level: 1, hp: w.rules.buildings.hp };
  updateVision(w);
  assert.equal(canSee(w, 0, 350, 480), true);              // 망루(거점 둘레 16 m)에서 약 220 m
  const f1L = w.strongholds.find(s => s.id === 'f1L');     // (350, 550) — 망루에서 약 290 m: 안 보인다
  f1L.slots[0] = { kind: 'archery', level: 1, hp: 2000 };
  assert.equal(knownBuildings(w, 0).get('f1L'), '?');
  f0L.slots[0].level = 2;                                   // 2단계 300 m
  updateVision(w);
  assert.deepEqual(knownBuildings(w, 0).get('f1L').map(b => b && b.kind), ['archery', null, null, null]);   // 생산 칸 둘 + 강화 칸 둘(성벽·망루)
  f1L.slots[0] = null;                                      // 무너져도, 다시 보기 전까진 기억 그대로
  f0L.slots[0].level = 1;
  updateVision(w);
  assert.deepEqual(knownBuildings(w, 0).get('f1L').map(b => b && b.kind), ['archery', null, null, null]);   // 생산 칸 둘 + 강화 칸 둘(성벽·망루)
});
