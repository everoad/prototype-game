// 도착한 병력 다시 쓰기(사용자 2026-11-07 "A"): 병사가 서 있는 곳(거점·승점·구역 깃발)에서 화살표를 끌면 거기 병사가 병종 진형으로 간다.
// 싸운 뒤 멀리 남은 병사(사용자 2026-11-07: "싸우다가 멀리 구석으로 가면 아무것도 안 한다")는 자기 구역 선으로 돌아온다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, setGoal } from '../src/sim/world.js';
import { spawn, STATE, GOAL } from '../src/sim/soldiers.js';
import { SPEAR, ARCHER, CAVALRY } from '../src/sim/rules.js';
import { applyOrder } from '../src/sim/orders.js';
import { spawnGarrisons } from '../src/sim/production.js';
import { gatheringGroup, joinGroup } from '../src/sim/groups.js';

const run = (w, sec) => { for (let k = 0; k < sec * 20; k++) step(w); };
const slotDist = (w, i) => Math.hypot(w.soldiers.goalX[i] - w.soldiers.x[i], w.soldiers.goalZ[i] - w.soldiers.z[i]);
const empty = () => createWorld({ scenario: 'empty', seed: 1, knobs: { mirror: true } });
const sectorIdx = (w, id) => w.map.sectors.findIndex(x => x.id === id);

// 구역 s0-left에 싸움을 마친(정면) 병사들을 세운다: 자기 자리에서 (dx, dz)만큼 떨어진 곳.
function frontAt(w, n, type, dx, dz, sector = 's0-left') {
  const ids = [];
  for (let k = 0; k < n; k++) {
    const id = spawn(w.soldiers, 0, type, 0, 0, w.rules);
    setGoal(w, [id], { kind: 'sector', id: sector });
    w.soldiers.x[id] = w.soldiers.px[id] = w.soldiers.goalX[id] + dx;
    w.soldiers.z[id] = w.soldiers.pz[id] = w.soldiers.goalZ[id] + dz;
    w.soldiers.state[id] = STATE.FRONT;
    ids.push(id);
  }
  return ids;
}

test('싸움이 끝나 할 일이 없는 정면 병사가 자기 자리에서 멀면 구역 선으로 돌아온다', () => {
  const w = empty();
  const [me] = frontAt(w, 1, SPEAR, -60, -40);   // 자리에서 72 m
  const d0 = slotDist(w, me);
  run(w, w.rules.behavior.regroupSeconds - 1);
  assert.ok(slotDist(w, me) > d0 - 1, '기다리는 동안은 선다');
  run(w, 45);   // 흐름장을 따라 선까지 간 뒤 선을 따라 자리로(약 100 m)
  assert.ok(slotDist(w, me) < 5, `자리까지 ${slotDist(w, me).toFixed(0)} m`);
});

test('자리 가까이(30 m 안)에 선 정면 병사는 그대로 선다(밀어붙인 자리 유지)', () => {
  const w = empty();
  const [me] = frontAt(w, 1, SPEAR, 0, 20);
  const x0 = w.soldiers.x[me], z0 = w.soldiers.z[me];
  run(w, 15);
  assert.ok(Math.hypot(w.soldiers.x[me] - x0, w.soldiers.z[me] - z0) < 2);
});

test('구역 깃발에서 끈 화살표: 그 구역 병사가 병종마다 진형을 이뤄 목표로 가고, 닿으면 새 구역 병사가 된다', () => {
  const w = empty();
  const spears = frontAt(w, 60, SPEAR, 0, 0), archers = frontAt(w, 30, ARCHER, 0, 0);
  const r = applyOrder(w, { kind: 'send', side: 0, from: { kind: 'sector', id: 's0-left' }, target: { kind: 'sector', id: 's0-center' } });
  assert.equal(r.ok, true);
  assert.equal(r.count, 90);
  const s = w.soldiers, groupOf = i => w.groups.find(g => g.id === s.group[i]);
  assert.ok(spears.every(i => groupOf(i)?.cls === 'spear' && groupOf(i).state === 'march'), '창병은 창 진형으로 출발');
  assert.ok(archers.every(i => groupOf(i)?.cls === 'archer' && groupOf(i).state === 'march'), '궁수는 궁수 진형으로 출발');
  run(w, 230);   // 430 m를 진형 걸음(창 3 × 0.85)으로, 닿은 뒤 선분 위 자기 자리로
  const center = sectorIdx(w, 's0-center');
  const arrived = [...spears, ...archers].filter(i => s.goalKind[i] === GOAL.SECTOR && s.goalId[i] === center && slotDist(w, i) < 30).length;
  assert.ok(arrived >= 81, `가운데 구역 자리에 닿은 병사 ${arrived}/90`);
});

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
  const r = applyOrder(w, { kind: 'send', side: 0, from: { kind: 'sector', id: 's0-left' }, target: { kind: 'stronghold', id: 'r0R' } });
  assert.equal(r.ok, true);
  assert.equal(s.group[busy], -1);
  assert.equal(s.goalKind[busy], GOAL.STRONGHOLD);
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
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'sector', id: 's0-left' }, target: { kind: 'stronghold', id: 'r0R' } });
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
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'sector', id: 's0-left' }, target: { kind: 'stronghold', id: 'r0L' } });
  run(w, 6);
  const grp = w.groups.find(g => g.members.includes(spears[0]));
  assert.ok(grp && !grp.charging, '돌진하지 않고 행군');
  assert.ok(grp.z < cz - 8, `진형 끝이 본진 쪽으로 ${(cz - grp.z).toFixed(0)} m`);
  assert.ok(spears.reduce((a, i) => a + s.z[i], 0) / spears.length < cz - 3, '병사들도 물러났다');
});

test('거점에서 끈 화살표: 거기 서 있는 병사와 모이던 쐐기가 바로 출발하고, 수비대는 남는다', () => {
  const w = empty();
  for (const st of w.strongholds) if (st.id !== 'f0L') { st.owner = null; st.gauge = 0; }
  spawnGarrisons(w);
  const st = w.strongholds.find(x => x.id === 'f0L'), k = w.strongholds.indexOf(st), s = w.soldiers;
  const isGarrison = i => s.alive[i] && s.state[i] === STATE.GARRISON;
  const garrison = [];
  for (let i = 0; i < s.count; i++) if (isGarrison(i)) garrison.push(i);
  const standing = [];
  for (let n = 0; n < 20; n++) standing.push(spawn(s, 0, SPEAR, st.x + 10 + (n % 5), st.z + Math.floor(n / 5), w.rules));
  setGoal(w, standing, { kind: 'stronghold', id: 'f0L' });
  const grp = gatheringGroup(w, st, { kind: 'sector', id: 's0-left' }, 'spear');
  const waiting = [];
  for (let n = 0; n < 10; n++) { const id = spawn(s, 0, SPEAR, grp.x, grp.z + n, w.rules); s.origin[id] = k; joinGroup(w, grp, id); waiting.push(id); }
  const r = applyOrder(w, { kind: 'send', side: 0, from: { kind: 'stronghold', id: 'f0L' }, target: { kind: 'stronghold', id: 'vpL' } });
  assert.equal(r.ok, true);
  assert.equal(r.count, 30);
  assert.equal(grp.state, 'march', '모이던 쐐기는 다 차지 않았어도 출발');
  assert.deepEqual(grp.target, { kind: 'stronghold', id: 'vpL' });
  assert.ok(standing.every(i => s.group[i] >= 0 && w.groups.find(g => g.id === s.group[i]).state === 'march'));
  assert.ok(garrison.length > 0 && garrison.every(isGarrison), '수비대는 그대로');
});

test('보낼 병사가 없으면 거절', () => {
  const w = empty();
  const r = applyOrder(w, { kind: 'send', side: 0, from: { kind: 'sector', id: 's0-left' }, target: { kind: 'sector', id: 's0-center' } });
  assert.equal(r.ok, false);
});

test('보낸 기병 진형은 제 빠르기로 달린다(진형 감속 없음, 사용자 2026-11-07: 빨리 닿게)', () => {
  const w = empty(), s = w.soldiers;
  const riders = frontAt(w, 30, CAVALRY, 0, 0);
  applyOrder(w, { kind: 'send', side: 0, from: { kind: 'sector', id: 's0-left' }, target: { kind: 'sector', id: 's0-right' } });
  const grp = w.groups.find(g => g.members.includes(riders[0]));
  run(w, 3);
  const v = Math.hypot(grp.vx, grp.vz);
  assert.ok(v > w.rules.units[0][CAVALRY].speed * 0.95 * w.map.speedMult(grp.x, grp.z), `진형 빠르기 ${v.toFixed(2)}`);
});
