// 갈래와 싸우지 않는 병종(6-1단계 계획 Task 2): 상성·원거리 목표 순서·물러나기는 병종 번호 대신 갈래(cls)로, 사제는 광부처럼 싸우지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRules, SPEAR, ARCHER, CAVALRY, INFANTRY, MAGE, PRIEST, KNIGHT, GOLEM } from '../src/sim/rules.js';
import { damageMult, bestRangedTarget } from '../src/sim/combat.js';
import { createWorld, step } from '../src/sim/world.js';
import { spawn, rebuildGrid, STATE } from '../src/sim/soldiers.js';

const R = makeRules();
const m = (as, at, ts, tt) => damageMult({ atkSide: as, atkType: at, tgtSide: ts, tgtType: tt, angleDeg: 0 }, R);

test('상성은 갈래로: 창 → 기사 ×2.5, 기사·기병 → 궁수·마법사 ×3, 골렘·사제는 상성 없음', () => {
  assert.equal(m(1, SPEAR, 0, KNIGHT), 2.5);
  assert.equal(m(0, KNIGHT, 1, ARCHER), 3);
  assert.equal(m(0, CAVALRY, 1, MAGE), 3);
  assert.equal(m(1, KNIGHT, 0, MAGE), 3);
  assert.equal(m(1, SPEAR, 0, GOLEM), 1);
  assert.equal(m(0, CAVALRY, 1, PRIEST), 1);
});

test('원거리 목표: 마법사가 궁수 차례(가까운 보병보다 먼저)', () => {
  const w = createWorld(), s = w.soldiers;
  const a = spawn(s, 0, ARCHER, 600, 200, w.rules);
  spawn(s, 1, INFANTRY, 600, 210, w.rules);
  const mage = spawn(s, 1, MAGE, 600, 225, w.rules);
  rebuildGrid(s);
  assert.equal(bestRangedTarget(w, a, 40), mage);
});

test('마법사는 궁수처럼 물러난다, 사제는 노리지도 맞붙지도 달아나지도 않는다', () => {
  const w = createWorld(), s = w.soldiers;
  const mage = spawn(s, 0, MAGE, 600, 200, w.rules);
  for (let k = 0; k < 5; k++) spawn(s, 1, INFANTRY, 598 + k, 206, w.rules);
  const pr = spawn(s, 0, PRIEST, 700, 200, w.rules);
  for (let k = 0; k < 8; k++) spawn(s, 1, INFANTRY, 699 + (k % 3), 201 + Math.floor(k / 3) * 0.8, w.rules);
  s.hp[pr] = 150;                                                   // 달아남 문턱(60%) 아래, 2초는 버틴다
  let kited = false;
  for (let k = 0; k < 40; k++) { step(w); if (s.state[mage] === STATE.ROUT) kited = true; assert.equal(s.target[pr], -1); assert.equal(s.inContact[pr], 0); assert.notEqual(s.state[pr], STATE.ROUT); }
  assert.ok(kited, '마법사 물러나기');
});
