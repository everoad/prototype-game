// 맞붙는 판단(사용자 2026-11-07):
// 1) 우리 근접이 맞붙은 적 근접을 두고 그 뒤 궁수에게 달려든다 → 바로 옆(4 m)의 적부터 친다.
// (2) 구역 기병이 우리 선 뒤에서 기다리는 규칙은 구역과 함께 뺐다)(창에서 빠져나가기·물러나기는 2026-11-10에 뺐다).
// 3) 거점으로 보낸 병사가 가는 길의 적을 안 친다 → 가는 길에도 40 m 안의 적과 싸운다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, setGoal } from '../src/sim/world.js';
import { spawn } from '../src/sim/soldiers.js';
import { SPEAR, ARCHER, makeRules } from '../src/sim/rules.js';

const stand = (w, ids) => { for (const i of ids) setGoal(w, [i], { kind: 'point', x: w.soldiers.x[i], z: w.soldiers.z[i] }); };
const run = (w, sec) => { for (let k = 0; k < sec * 20; k++) step(w); };

test('1) 뒤 궁수를 노리던 창병도 바로 옆에 적 근접이 오면 그 적을 노린다', () => {
  const w = createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } });
  const ours = spawn(w.soldiers, 0, SPEAR, 600, 390, w.rules);
  setGoal(w, [ours], { kind: 'point', x: 600, z: 390 });   // 제자리(홍수: 가운데 구역 소속)
  const archer = spawn(w.soldiers, 1, ARCHER, 600, 425, w.rules);
  stand(w, [archer]);
  run(w, 1);
  assert.equal(w.soldiers.target[ours], archer, '처음엔 궁수뿐');
  const foe = spawn(w.soldiers, 1, SPEAR, w.soldiers.x[ours] + 2, w.soldiers.z[ours] + 1, w.rules);
  stand(w, [foe]);
  run(w, 0.5);
  assert.equal(w.soldiers.target[ours], foe);
});

test('3) 먼 곳으로 싸우며 가는 창병도 가는 길 10 m 옆의 적을 노린다', () => {
  const w = createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } });
  const ours = spawn(w.soldiers, 0, SPEAR, 350, 300, w.rules);
  setGoal(w, [ours], { kind: 'point', x: 350, z: 550 });   // 250 m 앞(홍수: 거점 f1L)
  const foe = spawn(w.soldiers, 1, SPEAR, 360, 330, w.rules);
  stand(w, [foe]);
  run(w, 3);
  assert.equal(w.soldiers.target[ours], foe);
});

test('4) 창병은 물러나는 궁수를 따라잡는다: 궁수가 창병보다 느리고, 물러나기는 6초에 한 번 (사용자 2026-11-07)', () => {
  const r = makeRules();
  assert.ok(r.units[0][ARCHER].speed < r.units[0][SPEAR].speed, '궁수가 창병보다 느리다');
  const w = createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } });
  const ours = spawn(w.soldiers, 0, SPEAR, 600, 380, w.rules);
  setGoal(w, [ours], { kind: 'point', x: 600, z: 380 });
  const archer = spawn(w.soldiers, 1, ARCHER, 600, 395, w.rules);
  stand(w, [archer]);
  let touched = 0;
  for (let k = 0; k < 20 * 20; k++) { step(w); if (w.soldiers.inContact[ours]) touched++; }
  assert.ok(touched >= 20 * 5, `20초 동안 맞닿은 틱 ${touched} — 5초 넘게 붙어야 한다`);
});
