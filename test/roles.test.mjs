// 설계서 §6.3 병종 규칙: 궁수는 창병 뒤, 기병은 틈(선분 끝)으로 돌고, 달리는 기병은 노리지 않은 버팀 아닌 적은 지나가지만 궁수·창병에는 멈춘다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARCHER, CAVALRY, SPEAR } from '../src/sim/rules.js';
import { roleWorld, runSeconds, meanDepthBehind, fractionNearSegmentEnds, trampleStops, cavKillsLoneArcher, passesThrough } from './helpers.mjs';

test('가운데 맞붙음(양쪽 무게 1,000, 시작 구성) 40초 뒤: 궁수는 창병보다 5 m 이상 뒤, 기병 절반 이상이 선분 끝이나 적 선 뒤', () => {
  const w = roleWorld(1000);
  runSeconds(w, 40);
  assert.ok(meanDepthBehind(w, 0, ARCHER, SPEAR) >= 5, `궁수 깊이 ${meanDepthBehind(w, 0, ARCHER, SPEAR).toFixed(1)}`);
  assert.ok(fractionNearSegmentEnds(w, 0, CAVALRY, 40) >= 0.5, `기병 ${fractionNearSegmentEnds(w, 0, CAVALRY, 40).toFixed(2)}`);
});

test('기병은 창병을 뚫고 지나가지 않는다(닿으면 물러난다). 가는 길의 적 기병과는 싸운다(2026-11-07: 가는 길에도 싸운다)', () => {
  assert.equal(passesThrough(CAVALRY, SPEAR), false);
  assert.equal(trampleStops(null, CAVALRY, CAVALRY), true);
});

test('노린 궁수는 지나가지 않고 20초 안에 벤다 (사용자 2026-11-06: 닿아도 궁수가 안 죽는다)', () => {
  assert.ok(cavKillsLoneArcher() < 20, `궁수가 죽은 때 ${cavKillsLoneArcher()} s`);
});
