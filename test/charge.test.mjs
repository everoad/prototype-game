// 기병이 값을 하는 규칙 시험(사용자 2026-11-07 "나안으로 테스트 먼저"):
// ① 보병과 맞붙은 창은 버티지 못한다 — 기병에게 ×1.3이 없고, 달리는 기병이 짓밟고 지나간다.
// ② 기병 돌격(30 m 달린 첫 타)에 맞은 병사는 2초 동안 흔들려 못 친다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, setGoal } from '../src/sim/world.js';
import { spawn } from '../src/sim/soldiers.js';
import { SPEAR, ARCHER, CAVALRY, makeRules } from '../src/sim/rules.js';
import { damagePerSecond } from '../src/sim/combat.js';

const stand = (w, ids) => { for (const i of ids) setGoal(w, [i], { kind: 'point', x: w.soldiers.x[i], z: w.soldiers.z[i] }); };
const empty = () => createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } });

test('버티는 창은 기병에게 ×2.5, 버티지 못하는 창은 상성 없음', () => {
  const r = makeRules({ mirror: true });
  const o = { atkSide: 1, atkType: SPEAR, tgtSide: 0, tgtType: CAVALRY, angleDeg: 0 };
  assert.equal(damagePerSecond(o, r), 25);
  assert.equal(damagePerSecond({ ...o, unbraced: true }, r), 10);
});

test('우리 보병과 맞붙은 적 창은 버티지 못하고(braced 0), 기병만 닿은 창은 버틴다', () => {
  const w = empty(), s = w.soldiers;
  const busy = spawn(s, 1, SPEAR, 600, 400, w.rules), ours = spawn(s, 0, SPEAR, 600, 399, w.rules);
  const lone = spawn(s, 1, SPEAR, 700, 400, w.rules), rider = spawn(s, 0, CAVALRY, 700, 399, w.rules);
  stand(w, [busy, ours, lone, rider]);
  step(w);
  assert.equal(s.braced[busy], 0);
  assert.equal(s.braced[lone], 1);
  assert.equal(s.contactHold[rider], 1, '버티는 창에는 막힌다');
});

test('달리는 기병은 버티지 못하는 창을 짓밟고 지나간다(뒤의 궁수에게 가는 길에 막히지 않는다)', () => {
  const w = empty(), s = w.soldiers;
  const foe = spawn(s, 1, SPEAR, 600, 400.3, w.rules), ours = spawn(s, 0, SPEAR, 600, 401.3, w.rules);
  const archer = spawn(s, 1, ARCHER, 660, 400, w.rules);
  const rider = spawn(s, 0, CAVALRY, 560, 400, w.rules);
  stand(w, [foe, ours, archer]);
  s.hp[foe] = s.hp[ours] = 1e9;
  setGoal(w, [rider], { kind: 'sector', id: 's0-center' });
  for (let k = 0; k < 15 * 20; k++) { s.target[rider] = archer; s.holdUntil[rider] = w.time + 10; step(w); }   // 뒤의 궁수를 노리고 달린다
  assert.ok(s.x[rider] > 640, `기병 x ${s.x[rider].toFixed(0)} — 창에 막혀 섰다`);
});

test('기병 돌격에 맞은 창은 2초 동안 흔들려 못 친다', () => {
  const w = empty(), s = w.soldiers;
  const foe = spawn(s, 1, SPEAR, 600, 400, w.rules), rider = spawn(s, 0, CAVALRY, 600, 340, w.rules);   // 60 m 뒤에서 달려와 친다(창도 마주 나온다)
  stand(w, [foe]);
  setGoal(w, [rider], { kind: 'point', x: 600, z: 440 });
  let k = 0;
  while (!s.inContact[rider] && k++ < 20 * 20) step(w);
  step(w);
  assert.ok(s.staggerUntil[foe] > w.time + 1.5, '흔들림');
  const hp0 = s.hp[rider];
  for (let n = 0; n < 30; n++) step(w);         // 1.5초
  assert.equal(s.hp[rider], hp0, '흔들리는 동안 기병을 못 친다');
});
