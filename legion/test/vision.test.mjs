// 설계서 §7.3 시야: 병사 60(사용자 2026-11-07: 30 → 넓히자) · 장수 50 · 거점 100 · 망루 250(2단계 300) m, 언덕 ×1.5, 숲 속은 15 m 안에서만(망루는 절반 거리).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRules } from '../src/sim/rules.js';
import { sightRange, canSee, visibleEnemies, updateVision } from '../src/sim/vision.js';
import { visionWorld } from './helpers.mjs';

test('보는 거리: 병사 60, 언덕 위 ×1.5, 병사 시야 손잡이', () => {
  const r = makeRules();
  assert.equal(sightRange('soldier', false, r), 60);
  assert.equal(sightRange('soldier', false, makeRules({ soldierSight: 80 })), 80);
  assert.equal(sightRange('soldier', true, r), 90);
});

test('들판 55 m는 보이고, 숲 20 m는 안 보인다', () => {
  const w = visionWorld();                      // 우리 병사 (600,300), 적 병사 (600,325) 들판 / (600,320) 숲
  assert.equal(canSee(w, 0, 600, 325), true);
  assert.equal(canSee(w, 0, 600, 320), false);
  assert.equal(canSee(w, 0, 600, 355), true);   // 55 m
  assert.equal(canSee(w, 0, 600, 380), false);  // 80 m
  assert.deepEqual(visibleEnemies(w, 0).length, 1);
});

