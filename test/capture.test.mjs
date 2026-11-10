import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepGauge } from '../src/sim/capture.js';
import { createWorld, step, setGoal } from '../src/sim/world.js';
import { spawn } from '../src/sim/soldiers.js';
import { INFANTRY } from '../src/sim/rules.js';

test('한쪽만 있으면 15초에 0 → 100, 소유가 된다', () => {
  let g = { gauge: 0, owner: null };
  for (let i = 0; i < 300; i++) g = stepGauge(g.gauge, g.owner, 10, 0, 15, 0.05, {});
  assert.equal(g.gauge, 100);
  assert.equal(g.owner, 0);
});

test('다수결 비례: 30 대 10이면 기본 속도 × 20/30', () => {
  const g = stepGauge(0, null, 30, 10, 15, 1, {});
  assert.ok(Math.abs(g.gauge - (100 / 15) * (20 / 30)) < 1e-9);
});

test('잠기면(성벽이 서 있으면) 게이지가 움직이지 않는다', () => {
  assert.equal(stepGauge(-40, 1, 50, 0, 60, 1, { locked: true }).gauge, -40);
});

test('0을 지나면 소유를 잃어 중립, 비어 있으면 소유 쪽으로 되돌아간다', () => {
  assert.equal(stepGauge(-1, 1, 10, 0, 15, 1, {}).owner, null);
  assert.ok(stepGauge(50, null, 0, 0, 15, 1, { decaySeconds: 30 }).gauge < 50);
  assert.ok(stepGauge(50, 0, 0, 0, 15, 1, { decaySeconds: 30 }).gauge > 50);
});

// ---- 투석기와 성벽(계획서 2026-11-09-flood-catapult Task 1) ----
test('성벽 체력: 앞·뒤 거점 20,000, 본진 40,000', () => {
  const w = createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } });
  assert.equal(w.rules.buildings.wall.hp, 20000); assert.equal(w.rules.buildings.wall.hqHp, 40000);
});

test('성벽이 서 있으면 앞 거점도 점령되지 않고, 깨지면 점령이 시작된다', () => {
  const w = createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } }), s = w.soldiers;
  const st = w.strongholds.find(x => x.id === 'f1L'), k = st.slotCount;
  st.slots[k] = { kind: 'wall', level: 1, hp: w.rules.buildings.wall.hp, building: false };
  for (let n = 0; n < 50; n++) { const i = spawn(s, 0, INFANTRY, st.x - 7 + (n % 10) * 1.4, st.z - 20 + Math.floor(n / 10) * 1.4, w.rules); setGoal(w, [i], { kind: 'point', x: s.x[i], z: s.z[i] }); }
  for (let t = 0; t < 130 * 20; t++) step(w);
  assert.equal(st.owner, 1, `성벽이 선 채로 130초 — 게이지 ${st.gauge.toFixed(0)}`);
  st.slots[k].hp = 0;
  let changed = false;
  for (let t = 0; t < 70 * 20 && !changed; t++) { step(w); changed = st.owner !== 1; }
  assert.ok(changed, '성벽이 깨지면 70초 안에 주인을 잃는다');
});

test('원 안에 적이 있으면 성벽을 지을 수 없다(점령하던 쪽이 갑자기 잠기지 않게)', async () => {
  const { applyOrder } = await import('../src/sim/orders.js');
  const w = createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } }), s = w.soldiers;
  const st = w.strongholds.find(x => x.id === 'f0L');
  for (let n = 0; n < 20; n++) { const i = spawn(s, 1, INFANTRY, st.x - 7 + (n % 10) * 1.4, st.z + 20 + Math.floor(n / 10) * 1.4, w.rules); setGoal(w, [i], { kind: 'point', x: s.x[i], z: s.z[i] }); }
  for (let t = 0; t < 20; t++) step(w);
  w.sides[0].gold = 999;
  const r = applyOrder(w, { kind: 'build', side: 0, stronghold: 'f0L', slot: st.slotCount, building: 'wall' });
  assert.equal(r.ok, false); assert.equal(r.reason, '원 안에 적이 있다');
});
