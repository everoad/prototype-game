// 설계서 §6.3 병종 규칙: 궁수는 창병 뒤, 기병은 틈(선분 끝)으로 돌고, 달리는 기병은 노리지 않은 버팀 아닌 적은 지나가지만 궁수·창병에는 멈춘다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARCHER, CAVALRY, SPEAR } from '../src/sim/rules.js';
import {trampleStops, cavKillsLoneArcher, passesThrough } from './helpers.mjs';

test('기병은 창병을 뚫고 지나가지 않는다(닿으면 물러난다). 가는 길의 적 기병과는 싸운다(2026-11-07: 가는 길에도 싸운다)', () => {
  assert.equal(passesThrough(CAVALRY, SPEAR), false);
  assert.equal(trampleStops(null, CAVALRY, CAVALRY), true);
});

test('노린 궁수는 지나가지 않고 20초 안에 벤다 (사용자 2026-11-06: 닿아도 궁수가 안 죽는다)', () => {
  assert.ok(cavKillsLoneArcher() < 20, `궁수가 죽은 때 ${cavKillsLoneArcher()} s`);
});
