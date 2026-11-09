import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRules, SPEAR } from '../src/sim/rules.js';
import { damagePerSecond } from '../src/sim/combat.js';

test('창병 피해: 정면·옆 ×1.2·뒤 ×1.5·기운·피해 손잡이', () => {
  const r = makeRules();
  const base = { atkSide: 0, atkType: SPEAR, tgtSide: 1, tgtType: SPEAR, ranged: false, charging: false, building: false, aura: 1 };
  assert.equal(damagePerSecond({ ...base, angleDeg: 0 }, r), 10);
  assert.equal(damagePerSecond({ ...base, angleDeg: 90 }, r), 12);
  assert.equal(damagePerSecond({ ...base, angleDeg: 180 }, r), 15);
  assert.equal(damagePerSecond({ ...base, angleDeg: 0, aura: 1.2 }, r), 12);
  assert.equal(damagePerSecond({ ...base, angleDeg: 0 }, makeRules({ damage: 0.5 })), 5);
});

// ---- Task 9: 병종 넷 (설계서 §6.1·§6.2) ----
import { ARCHER, CAVALRY, INFANTRY } from '../src/sim/rules.js';
import { pickRangedTarget } from '../src/sim/combat.js';

test('상성(창→기병 ×2.5, 기병→궁수 ×3, 보병은 상성 없음), 방패(정면 원거리 ×0.5), 돌격 ×2, 건물 피해, 원거리 목표 순서', () => {
  const r = makeRules();
  const d = (o) => damagePerSecond({ atkSide: 0, tgtSide: 1, angleDeg: 0, ranged: false, charging: false, building: false, aura: 1, ...o }, r);
  assert.equal(d({ atkType: SPEAR, tgtType: CAVALRY }), 25);   // 버티는 창(사용자 2026-11-07: 정면에서는 창이 기병을 막는다)
  assert.equal(d({ atkType: CAVALRY, tgtType: ARCHER }), 22 * 3);
  assert.equal(d({ atkType: CAVALRY, tgtType: INFANTRY }), 22);
  assert.equal(d({ atkType: INFANTRY, tgtType: CAVALRY }), 10);
  assert.equal(d({ atkType: ARCHER, tgtType: INFANTRY, ranged: true, angleDeg: 30 }), 2);   // 보병도 앞쪽 방패(사용자 2026-11-07 시험)
  assert.equal(d({ atkType: ARCHER, tgtType: SPEAR, ranged: true, angleDeg: 30 }), 2);
  assert.equal(d({ atkType: ARCHER, tgtType: SPEAR, ranged: true, angleDeg: 90 }), 4 * 1.2);
  assert.equal(d({ atkType: SPEAR, building: true }), 0.5);
  assert.equal(d({ atkType: CAVALRY, tgtType: SPEAR, charging: true }), 44);
  assert.equal(pickRangedTarget([{ type: SPEAR, dist: 10 }, { type: CAVALRY, dist: 30 }, { type: ARCHER, dist: 38 }], r), 2);
  assert.equal(pickRangedTarget([{ type: SPEAR, dist: 10 }, { type: SPEAR, dist: 5 }], r), 1);
});

test('투척꾼 범위 피해는 splashMax가 있으면 둘레에서 가장 가까운 그만큼만 친다(사용자 2026-11-07: 조금 줄여 보자)', async () => {
  const { createWorld, step, setGoal } = await import('../src/sim/world.js');
  const { spawn } = await import('../src/sim/soldiers.js');
  const w = createWorld({ scenario: 'empty', seed: 1 }), s = w.soldiers;
  w.rules.units[1][ARCHER].splashMax = 2;
  const center = spawn(s, 0, INFANTRY, 600, 380, w.rules), ring = [];
  for (let k = 0; k < 6; k++) ring.push(spawn(s, 0, INFANTRY, 600 + Math.cos(k) * (0.9 + k * 0.15), 380 + Math.sin(k) * (0.9 + k * 0.15), w.rules));
  const hurler = spawn(s, 1, ARCHER, 600, 410, w.rules);
  for (const i of [center, ...ring, hurler]) { setGoal(w, [i], { kind: 'point', x: s.x[i], z: s.z[i] }); s.hp[i] = 1e6; }
  for (let k = 0; k < 40 && s.hp[center] === 1e6; k++) { s.rtarget[hurler] = center; step(w); }
  const hitRing = ring.filter(i => s.hp[i] < 1e6).length;
  assert.equal(hitRing, 2);
});

test('범위 피해도 맞는 사람의 방패를 따진다: 투척꾼을 바라보는 방패벽 창은 옆의 궁수가 맞아도 ×0.2만 받는다(사용자 2026-11-07)', async () => {
  const { createWorld, step, setGoal } = await import('../src/sim/world.js');
  const { spawn } = await import('../src/sim/soldiers.js');
  const w = createWorld({ scenario: 'empty', seed: 1 }), s = w.soldiers;
  const archer = spawn(s, 0, ARCHER, 600, 380, w.rules), spear = spawn(s, 0, SPEAR, 601, 380, w.rules);
  s.elite[spear] = 1;
  const hurler = spawn(s, 1, ARCHER, 600, 415, w.rules);
  for (const i of [archer, spear, hurler]) { setGoal(w, [i], { kind: 'point', x: s.x[i], z: s.z[i] }); s.hp[i] = 1e4; }
  s.facing[spear] = Math.PI / 2;                                  // 투척꾼(+z) 쪽을 본다
  let k = 0;
  while (s.hp[archer] === 1e4 && k++ < 60) { s.rtarget[hurler] = archer; s.facing[spear] = Math.PI / 2; s.x[spear] = 601; s.z[spear] = 380; step(w); }   // 창은 궁수 옆에 붙잡아 둔다(걸어 나가면 범위 2 m를 벗어난다)
  const direct = 1e4 - s.hp[archer], splashed = 1e4 - s.hp[spear];   // 체력은 Float32 — 1e6이면 0.06 단위로 반올림된다
  assert.ok(direct > 0, '궁수가 맞았다');
  assert.ok(Math.abs(splashed - direct * 0.3 * 0.2) < 1e-3, `범위 ${splashed.toFixed(3)} · 직격 ${direct.toFixed(3)}`);
});

test('방패는 걷는 방향이 아니라 적 쪽을 향한다: 옆으로 걷는 창도 앞(적 쪽)에서 온 화살은 방패로 받는다(사용자 2026-11-07)', async () => {
  const { createWorld, step, setGoal } = await import('../src/sim/world.js');
  const { spawn } = await import('../src/sim/soldiers.js');
  const w = createWorld({ scenario: 'empty', seed: 1 }), s = w.soldiers;
  const spear = spawn(s, 0, SPEAR, 590, 380, w.rules), hurler = spawn(s, 1, ARCHER, 600, 415, w.rules);
  setGoal(w, [spear], { kind: 'point', x: 700, z: 380 });          // 옆(+x)으로 걷는다
  setGoal(w, [hurler], { kind: 'point', x: 600, z: 415 });
  s.hp[spear] = 1e4;
  s.leaveUntil[spear] = 1e9;                                   // 빠지는 중: 적을 쫓지 않고 걷기만
  let k = 0;
  while (s.hp[spear] === 1e4 && k++ < 80) { s.rtarget[hurler] = spear; step(w); }
  assert.ok(Math.abs(s.facing[spear]) < 0.3, '옆으로 걷는 중(앞이 +x)');
  assert.ok(Math.abs((1e4 - s.hp[spear]) - 3 * 1.2 * 0.5) < 1e-3, `받은 피해 ${(1e4 - s.hp[spear]).toFixed(3)} — 방패(×0.5)는 받고, 몸은 옆을 보여 ×1.2`);
});
