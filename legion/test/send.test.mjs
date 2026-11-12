// 도착한 병력 다시 쓰기(사용자 2026-11-07 "A"): 병사가 서 있는 곳(거점·승점·구역 깃발)에서 화살표를 끌면 거기 병사가 병종 진형으로 간다.
// 싸운 뒤 멀리 남은 병사(사용자 2026-11-07: "싸우다가 멀리 구석으로 가면 아무것도 안 한다")는 자기 구역 선으로 돌아온다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, setGoal } from '../src/sim/world.js';
import { spawn, STATE, GOAL } from '../src/sim/soldiers.js';
import { SPEAR, ARCHER, CAVALRY } from '../src/sim/rules.js';
import { applyOrder } from '../src/sim/orders.js';

const run = (w, sec) => { for (let k = 0; k < sec * 20; k++) step(w); };
const slotDist = (w, i) => Math.hypot(w.soldiers.goalX[i] - w.soldiers.x[i], w.soldiers.goalZ[i] - w.soldiers.z[i]);
const empty = () => createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } });

// 싸움을 마친(정면) 병사들을 옛 왼쪽 구역 선 자리(x 200부터 3 m 간격, z 390)에 세운다 — 홍수에서는 구역 s0-left 소속이었고,
// 구역에서 보내기 = 그 구역 병사 전부를 11-07 규칙으로 싸우며 보냈다. 군단 영지에는 구역이 없어 그 병사들을 골라 engage: 'forward'로 보낸다.
function frontAt(w, n, type, dx, dz) {
  const ids = [];
  for (let k = 0; k < n; k++) {
    const x = 200 + (k % 40) * 3 + dx, z = 390 - Math.floor(k / 40) * 3 + dz;
    const id = spawn(w.soldiers, 0, type, x, z, w.rules);
    setGoal(w, [id], { kind: 'point', x, z });
    w.soldiers.state[id] = STATE.FRONT;
    ids.push(id);
  }
  return ids;
}

test('맞붙은 병사만 진형에 끼지 않고 목표가 바뀐다 — 40 m 안에 적이 보이기만 하는 병사는 진형으로 떠난다', () => {
  const w = empty();
  const [busy, aware] = frontAt(w, 2, SPEAR, 0, 0);
  const s = w.soldiers;
  s.x[aware] = s.x[busy] + 15; s.z[aware] = s.z[busy];
  const foe = spawn(s, 1, SPEAR, s.x[busy] + 1, s.z[busy] + 1, w.rules);
  setGoal(w, [foe], { kind: 'point', x: s.x[foe], z: s.z[foe] });
  run(w, 0.5);
  assert.equal(s.inContact[busy], 1, '맞붙음');
  assert.equal(s.target[aware], foe, '보이기만 함');
  const r = applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: [busy, aware] }, target: { kind: 'point', x: 950, z: 150 }, engage: 'forward' });
  assert.equal(r.ok, true);
  assert.equal(s.group[busy], -1);
  assert.equal(s.goalKind[busy], GOAL.POINT);   // 목표가 바뀌었다(홍수: 거점 목표)
  assert.ok(s.group[aware] >= 0, '보이기만 한 병사는 진형으로');
});

test('맞붙어 있다 보낸 병사는 붙은 적을 끝낸 뒤 20 m 옆의 다른 적을 쫓지 않고 목표로 간다', () => {   // 구역에서 보내기 = 전처럼 싸우며 간다(engage). 고른 부대는 command.test
  const w = createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true, damage: 20 } });
  const [me] = frontAt(w, 1, SPEAR, 0, 0);
  const s = w.soldiers;
  const foe = spawn(s, 1, ARCHER, s.x[me] + 1, s.z[me] + 1, w.rules);
  const other = spawn(s, 1, ARCHER, s.x[me] - 20, s.z[me] + 5, w.rules);   // 가는 쪽(동쪽 r0R)의 반대편 20 m
  for (const i of [foe, other]) setGoal(w, [i], { kind: 'point', x: s.x[i], z: s.z[i] });
  s.hp[other] = 1e9; s.hp[me] = 1e9;
  run(w, 0.5);
  assert.equal(s.inContact[me], 1);
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: [me] }, target: { kind: 'point', x: 950, z: 150 }, engage: 'forward' });
  run(w, 8);
  assert.equal(s.alive[foe], 0, '붙은 적은 끝냈다');
  assert.notEqual(s.target[me], other);
  assert.ok(Math.hypot(s.x[me] - s.x[other], s.z[me] - s.z[other]) > 22, '다른 적에게 가지 않았다');
});

test('보낸 창 진형은 뒤에 남은 적에게 되돌아 돌진하지 않는다(앞쪽 적에게만)', () => {
  const w = empty();
  const spears = frontAt(w, 40, SPEAR, 0, 0);
  const s = w.soldiers;
  let cx = 0, cz = 0;
  for (const i of spears) { cx += s.x[i]; cz += s.z[i]; }
  cx /= spears.length; cz /= spears.length;
  const foes = [];
  for (let k = 0; k < 10; k++) foes.push(spawn(s, 1, SPEAR, cx + k * 2 - 10, cz + 35, w.rules));   // 앞(적 쪽) 35 m — 우리는 뒤(본진 쪽)로 간다
  for (const i of foes) setGoal(w, [i], { kind: 'point', x: s.x[i], z: s.z[i] });
  for (const i of spears) s.target[i] = -1;
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: spears }, target: { kind: 'point', x: 250, z: 150 }, engage: 'forward' });
  run(w, 6);
  const grp = w.groups.find(g => g.members.includes(spears[0]));
  assert.ok(grp && !grp.charging, '돌진하지 않고 행군');
  assert.ok(grp.z < cz - 8, `진형 끝이 본진 쪽으로 ${(cz - grp.z).toFixed(0)} m`);
  assert.ok(spears.reduce((a, i) => a + s.z[i], 0) / spears.length < cz - 3, '병사들도 물러났다');
});

test('보낼 병사가 없으면 거절', () => {
  const w = empty();
  const r = applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: [] }, target: { kind: 'point', x: 600, z: 390 }, engage: 'forward' });
  assert.equal(r.ok, false);
});

test('보낸 기병 진형은 제 빠르기로 달린다(진형 감속 없음, 사용자 2026-11-07: 빨리 닿게)', () => {
  const w = empty(), s = w.soldiers;
  const riders = frontAt(w, 30, CAVALRY, 0, 0);
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'ids', ids: riders }, target: { kind: 'point', x: 940, z: 390 }, engage: 'forward' });
  const grp = w.groups.find(g => g.members.includes(riders[0]));
  run(w, 3);
  const v = Math.hypot(grp.vx, grp.vz);
  assert.ok(v > w.rules.units[0][CAVALRY].speed * 0.95 * w.map.speedMult(grp.x, grp.z), `진형 빠르기 ${v.toFixed(2)}`);
});
